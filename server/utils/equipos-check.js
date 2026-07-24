// Validación de vencimiento de equipos/patrones referenciados en un ensayo.
// Estrategia: escanea el JSON serializado buscando TAGs (MM-###, PMM-###) y
// compara contra la tabla `equipos`. Requisito OAA duro: no emitir informe con
// equipo/patrón con calibración vencida.

const db = require('../db');

// Reconoce TAGs habituales del laboratorio: MM-###, PMM-###, con o sin espacios/prefijos.
// Ejemplos: "MM-405", "MM 405", "TAG N°MM-179", "PMM-716".
const TAG_RE = /\b(P?MM)[-\s]?0*(\d{2,5})\b/gi;

function normalizarTag(m1, m2) {
  return String(m1).toUpperCase() + '-' + String(m2);
}

// Extrae el set de TAGs únicos citados en un JSON de ensayo.
function extraerTags(datosJsonStr) {
  var out = new Set();
  if (!datosJsonStr) return out;
  var s = typeof datosJsonStr === 'string' ? datosJsonStr : JSON.stringify(datosJsonStr);
  TAG_RE.lastIndex = 0;
  var m;
  while ((m = TAG_RE.exec(s))) {
    out.add(normalizarTag(m[1], m[2]));
  }
  return out;
}

function hoyISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function diffDias(vencISO, hoy) {
  if (!vencISO) return null;
  try {
    const a = new Date(vencISO + 'T00:00:00Z').getTime();
    const b = new Date(hoy + 'T00:00:00Z').getTime();
    return Math.round((a - b) / (24 * 3600 * 1000));
  } catch { return null; }
}

// Recibe un array de ensayos ({tipo, datos_json}) y retorna:
//   { vencidos:   [{tag, equipo, vencimiento, dias, ensayos:[tipo,...]}],
//     por_vencer: [...] }  // por_vencer = vence en <= 30 días
function chequearEquiposVencidos(ensayos, opts) {
  opts = opts || {};
  const diasAviso = opts.diasAviso == null ? 30 : opts.diasAviso;
  const hoy = hoyISO();

  // Mapear TAG → ensayos que lo referencian.
  const tagsPorEnsayo = new Map(); // tag → [tipo,...]
  for (const e of ensayos || []) {
    const tags = extraerTags(e.datos_json);
    for (const t of tags) {
      if (!tagsPorEnsayo.has(t)) tagsPorEnsayo.set(t, []);
      tagsPorEnsayo.get(t).push(e.tipo || 'ensayo');
    }
  }
  if (tagsPorEnsayo.size === 0) return { vencidos: [], por_vencer: [], considerados: [] };

  const equiposDB = db.prepare('SELECT id, nombre, tipo, vencimiento, fecha_calibracion FROM equipos').all();
  const porId = new Map();
  for (const eq of equiposDB) {
    if (!eq.id) continue;
    porId.set(String(eq.id).toUpperCase(), eq);
  }

  const vencidos = [];
  const porVencer = [];
  const considerados = [];

  for (const [tag, tipos] of tagsPorEnsayo.entries()) {
    const eq = porId.get(tag);
    if (!eq) continue; // TAG que no existe en el padrón: no falla, solo se omite
    if (!eq.vencimiento) continue; // sin fecha cargada: no evaluar
    const dias = diffDias(eq.vencimiento, hoy);
    const item = {
      tag,
      equipo: eq.nombre || tag,
      vencimiento: eq.vencimiento,
      fecha_calibracion: eq.fecha_calibracion || null,
      dias,
      ensayos: Array.from(new Set(tipos)),
    };
    considerados.push(item);
    if (dias != null && dias < 0) vencidos.push(item);
    else if (dias != null && dias <= diasAviso) porVencer.push(item);
  }

  return { vencidos, por_vencer: porVencer, considerados };
}

module.exports = {
  chequearEquiposVencidos,
  extraerTags,
};
