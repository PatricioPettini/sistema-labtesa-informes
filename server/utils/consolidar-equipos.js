// Consolidador one-shot de equipos duplicados.
// Detecta filas cuyo `id` tiene el formato legacy "<tipo-ensayo>:<TAG>"
// (ej. "dureza-brinell:MM-694") y las fusiona con el registro canónico
// del mismo TAG, uniendo el array de ensayos. Elimina el duplicado.

const db = require('../db');

const TIPOS_ENSAYO_VALIDOS = new Set([
  'traccion','impacto','plegado','nick-break','quimicos',
  'dureza-brinell','dureza-rockwell','dureza-vickers',
  'ferrita-delta','macrografia','rugosidad','varios',
  'microestructura','tamano-grano','inclusiones','estructura-grafito',
  'espesor-capa','decarburacion','defectos-superficiales','porosidad',
  'liquidos-penetrantes','metalografia-general','anexo-metalografico',
  'tratamientos-termicos',
]);

function parseEnsayos(json) {
  try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

function normalizarSede(sede) {
  if (!sede) return null;
  const s = String(sede).toLowerCase().trim();
  if (s === 'neuquén' || s === 'neuquen') return 'neuquen';
  if (s === 'caba' || s === 'ciudad de bs. as.' || s === 'buenos aires') return 'caba';
  if (s === 'ambas' || s === 'general') return null;
  return s;
}

// Normaliza nombre para comparación: lowercase, sin acentos, sin espacios extra,
// sin puntuación. "Calibre Digital" ≡ "calibre digital" ≡ "CALIBRE  DIGITAL.".
function normalizarNombre(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrae el número final del ID (ej. "CAL-570" → "570", "MM-13" → "13").
function numeroDelId(id) {
  const m = String(id || '').match(/([A-Z]+)[-\s]?(\d+)$/i);
  return m ? m[2] : null;
}

function parseCount(row) {
  // Prioridad para elegir canónico: más ensayos + vencimiento + certificado + más info.
  let score = 0;
  const ens = parseEnsayos(row.ensayos);
  score += ens.length * 10;
  if (row.vencimiento) score += 50;
  if (row.certificado) score += 20;
  if (row.fecha_calibracion) score += 5;
  if (row.nombre_corto) score += 3;
  if (row.modelo) score += 2;
  return score;
}

function consolidarEquipos() {
  const rows = db.prepare('SELECT * FROM equipos').all();

  const updEnsayos    = db.prepare('UPDATE equipos SET ensayos = ? WHERE id = ?');
  const updSede       = db.prepare('UPDATE equipos SET sede = ? WHERE id = ?');
  const updRenameId   = db.prepare('UPDATE equipos SET id = ?, ensayos = ? WHERE id = ?');
  const updCanonico   = db.prepare(`
    UPDATE equipos SET
      ensayos = ?,
      nombre_corto = COALESCE(nombre_corto, ?),
      certificado = COALESCE(certificado, ?),
      fecha_calibracion = COALESCE(fecha_calibracion, ?),
      vencimiento = COALESCE(vencimiento, ?),
      modelo = COALESCE(modelo, ?),
      capacidad = COALESCE(capacidad, ?)
    WHERE id = ?
  `);
  const delById       = db.prepare('DELETE FROM equipos WHERE id = ?');

  let fusionados = 0, renombrados = 0, normalizadosSede = 0, fusionadosPorNombre = 0;

  db.transaction(() => {
    // Normalizar sedes primero (Neuquén → neuquen, etc.).
    for (const r of rows) {
      const sn = normalizarSede(r.sede);
      if (sn !== null && sn !== r.sede) {
        try { updSede.run(sn, r.id); normalizadosSede++; } catch {}
      }
    }

    // Consolidar duplicados con id "<tipo>:<TAG>".
    for (const r of rows) {
      const m = String(r.id).match(/^([a-z-]+):(.+)$/i);
      if (!m) continue;
      const tipoEnsayo = m[1].toLowerCase();
      const tag        = m[2].trim();
      if (!TIPOS_ENSAYO_VALIDOS.has(tipoEnsayo)) continue;

      const canonico = db.prepare('SELECT id, ensayos FROM equipos WHERE id = ?').get(tag);
      if (canonico) {
        // Fusionar: agregar el tipo al array de ensayos del canónico y borrar el duplicado.
        const setEns = new Set(parseEnsayos(canonico.ensayos));
        setEns.add(tipoEnsayo);
        const merged = JSON.stringify(Array.from(setEns));
        try {
          updEnsayos.run(merged, tag);
          delById.run(r.id);
          fusionados++;
        } catch (e) {
          console.warn('[consolidar-equipos] fusión falló para', r.id, '→', tag, ':', e.message);
        }
      } else {
        // No hay canónico todavía: renombrar este registro para que el TAG sea su id.
        try {
          updRenameId.run(tag, JSON.stringify([tipoEnsayo]), r.id);
          renombrados++;
        } catch (e) {
          // El TAG podría estar ocupado por otro registro que se creó en este mismo loop.
          // En ese caso, tratarlo como fusión normal.
          const canonicoNuevo = db.prepare('SELECT id, ensayos FROM equipos WHERE id = ?').get(tag);
          if (canonicoNuevo) {
            const setEns = new Set(parseEnsayos(canonicoNuevo.ensayos));
            setEns.add(tipoEnsayo);
            updEnsayos.run(JSON.stringify(Array.from(setEns)), tag);
            delById.run(r.id);
            fusionados++;
          }
        }
      }
    }

    // Segunda pasada: fusionar por (nombre normalizado + sede + número final del ID).
    // Detecta duplicados como CAL-570 vs MM-570 (mismo "calibre digital", mismo 570).
    // Regla:
    //   - Se agrupan equipos con mismo (nombre normalizado, sede, número final).
    //   - Si el grupo tiene >1 registros, se elige canónico (más ensayos + venc. + cert.).
    //   - Se fusionan ensayos y campos rellenables (COALESCE) al canónico.
    //   - Se eliminan los demás.
    const filasActuales = db.prepare('SELECT * FROM equipos').all();
    const grupos = new Map();
    for (const r of filasActuales) {
      const nom = normalizarNombre(r.nombre_corto || r.nombre);
      const sd  = String(r.sede || '').toLowerCase().trim();
      const num = numeroDelId(r.id);
      if (!nom || !num) continue;
      const key = nom + '|' + sd + '|' + num;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(r);
    }
    for (const [key, arr] of grupos.entries()) {
      if (arr.length < 2) continue;
      // Elegir canónico: mayor score. Empate: prefiere id sin prefijo "MM-" común, si no el primero alfabético.
      arr.sort((a, b) => {
        const da = parseCount(b) - parseCount(a);
        if (da !== 0) return da;
        return String(a.id).localeCompare(String(b.id));
      });
      const canonico = arr[0];
      const setEns = new Set(parseEnsayos(canonico.ensayos));
      let acumNombreCorto = canonico.nombre_corto;
      let acumCert = canonico.certificado;
      let acumFCal = canonico.fecha_calibracion;
      let acumVenc = canonico.vencimiento;
      let acumModelo = canonico.modelo;
      let acumCap = canonico.capacidad;
      for (let i = 1; i < arr.length; i++) {
        const dup = arr[i];
        parseEnsayos(dup.ensayos).forEach(t => setEns.add(t));
        acumNombreCorto = acumNombreCorto || dup.nombre_corto;
        acumCert        = acumCert || dup.certificado;
        acumFCal        = acumFCal || dup.fecha_calibracion;
        acumVenc        = acumVenc || dup.vencimiento;
        acumModelo      = acumModelo || dup.modelo;
        acumCap         = acumCap || dup.capacidad;
        try { delById.run(dup.id); fusionadosPorNombre++; } catch (e) {
          console.warn('[consolidar-equipos] no se pudo borrar duplicado', dup.id, ':', e.message);
        }
      }
      try {
        updCanonico.run(
          JSON.stringify(Array.from(setEns)),
          acumNombreCorto, acumCert, acumFCal, acumVenc, acumModelo, acumCap,
          canonico.id
        );
      } catch (e) {
        console.warn('[consolidar-equipos] no se pudo actualizar canónico', canonico.id, ':', e.message);
      }
    }
  })();

  if (fusionados > 0 || renombrados > 0 || normalizadosSede > 0 || fusionadosPorNombre > 0) {
    console.log(
      `[consolidar-equipos] ${fusionados} legacy fusionado(s), ${renombrados} renombrado(s), ` +
      `${fusionadosPorNombre} duplicado(s) por nombre fusionado(s), ${normalizadosSede} sede(s) normalizada(s)`
    );
  }
}

module.exports = { consolidarEquipos };
