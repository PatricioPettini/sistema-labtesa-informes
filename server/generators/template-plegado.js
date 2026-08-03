const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/plegado.docx');

// Equipamiento por variante. variante_equipo: 'emic' | 'torne' | 'shimadzu'.
// Cada item: { key, nombre, tagDefault }. El TAG final se toma de
// datos.equipamiento_tags[key] si existe, sino tagDefault. Se mantienen keys
// legacy (calibre_571/570, dispositivo_779, termohigrometro, termo_702,
// prensa_torne, calibre_694s) para no romper ensayos guardados.
// tagDefault se usa cuando el técnico tildó el equipo pero no editó el input
// de TAG (equipamiento_tags[key] queda undefined). Alineado con el catálogo
// del front (public-new/plegadoform.jsx PLEGADO_EQ_*).
const EQUIPO_EMIC = [
  { key: 'maquina_emic',       nombre: 'Máquina de tracción Emic',   tagDefault: 'MM-203' },
  { key: 'mandril',             nombre: 'Mandril',                   tagDefault: 'MM-803' },
  { key: 'calibre',             nombre: 'Calibre digital',           tagDefault: 'MM-571' },
  { key: 'termohigro_545',      nombre: 'Termohigrómetro',           tagDefault: 'PCAL-545' },
  { key: 'dispositivo_plegado', nombre: 'Dispositivo de plegado',    tagDefault: 'MM-779' },
  // Legacy — se mantienen para retro-compat.
  { key: 'calibre_571',         nombre: 'Calibre digital',           tagDefault: 'MM-571' },
  { key: 'calibre_570',         nombre: 'Calibre digital',           tagDefault: 'MM-570' },
  { key: 'dispositivo_779',     nombre: 'Dispositivo de plegado',    tagDefault: 'MM-779' },
  { key: 'termohigrometro',     nombre: 'Termohigrómetro',           tagDefault: 'PCAL-545' },
  { key: 'termo_702',           nombre: 'Termohigrómetro',           tagDefault: 'MM-702' },
];
const EQUIPO_NEUQUEN = [
  { key: 'maquina_shimadzu',    nombre: 'Máquina de tracción Shimadzu', tagDefault: 'MM-151' },
  { key: 'mandril',             nombre: 'Mandril',                   tagDefault: 'MM-930' },
  { key: 'calibre',             nombre: 'Calibre digital',           tagDefault: 'MM-694' },
  { key: 'termohigro_794',      nombre: 'Termohigrómetro',           tagDefault: 'MM-794' },
  { key: 'dispositivo_plegado', nombre: 'Dispositivo de plegado',    tagDefault: 'MM-779' },
  // Legacy
  { key: 'prensa_torne',        nombre: 'Prensa Plegadora TORNE Y MEC', tagDefault: 'MM-913' },
  { key: 'calibre_694',         nombre: 'Calibre digital',           tagDefault: 'MM-694' },
  { key: 'termo_794',           nombre: 'Termohigrómetro',           tagDefault: 'MM-794' },
];
const EQUIPO_TORNE    = EQUIPO_NEUQUEN;
const EQUIPO_SHIMADZU = EQUIPO_NEUQUEN;

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectarExtImagen(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  return 'jpg';
}

function calcularAlto(buffer, anchoTarget) {
  try {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let i = 2;
      while (i < buffer.length - 8) {
        if (buffer[i] === 0xFF && [0xC0, 0xC1, 0xC2].includes(buffer[i + 1])) {
          const h = (buffer[i + 5] << 8) | buffer[i + 6];
          const w = (buffer[i + 7] << 8) | buffer[i + 8];
          return Math.round((anchoTarget * h) / w);
        }
        i += 2 + ((buffer[i + 2] << 8) | buffer[i + 3]);
      }
    }
    if (buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const w = buffer.readUInt32BE(16);
      const h = buffer.readUInt32BE(20);
      return Math.round((anchoTarget * h) / w);
    }
  } catch {}
  return Math.round(anchoTarget * 0.75);
}

function scanBackForTag(str, prefix, before) {
  let i = before;
  while (i > 0) {
    const idx = str.lastIndexOf(prefix, i - 1);
    if (idx < 0) return -1;
    const c = str[idx + prefix.length];
    if (c === '>' || c === ' ' || c === '\r' || c === '\n') return idx;
    i = idx;
  }
  return -1;
}

function esParrafoBlanco(para) {
  if (para.includes('w:type="page"')) return false;
  if (para.includes('<w:drawing>')) return false;
  return !/<w:t[\s>]/.test(para);
}

// ── Generador principal ───────────────────────────────────────────────────────

function generarPlegadoDesdeTemplate(ot, datos, fotosCaratula) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  // ── Filtro multi-OT: si datos._filtro_ot está seteado, solo emitir las
  // probetas cuyo `nro_ot_override` matchea (o vacío/default para la OT del
  // ensayo). El word-generator llama a este template una vez por cada OT del
  // registro con `_filtro_ot` seteado.
  if (datos._filtro_ot != null) {
    const otFiltro = String(datos._filtro_ot);
    const esOtDelEnsayo = otFiltro === String(ot.nro_ot || '');
    const filtrarArr = (arr) => (Array.isArray(arr) ? arr : []).filter(p => {
      const ov = String((p && p.nro_ot_override) || '').trim();
      const perteneceA = ov || String(ot.nro_ot || '');
      return perteneceA === otFiltro || (esOtDelEnsayo && !ov);
    });
    datos = Object.assign({}, datos);
    if (Array.isArray(datos.resultados)) datos.resultados = filtrarArr(datos.resultados);
    if (Array.isArray(datos.probetas))   datos.probetas   = filtrarArr(datos.probetas);
  }

  // ── Aplicar textos_por_ot para la OT actual (obs/eval/nota). Cada OT tiene
  // sus propios textos; si el mapa está presente, sobrescribimos los campos
  // raíz con los de la OT actual antes de emitir. El campo `textos_por_ot`
  // solo existe cuando el ensayo se editó desde el form nuevo con multi-OT.
  if (datos.textos_por_ot && typeof datos.textos_por_ot === 'object') {
    const nroOtActual = String(ot.nro_ot || '');
    const textosOt = datos.textos_por_ot[nroOtActual];
    if (textosOt) {
      datos = Object.assign({}, datos);
      ['tiene_observacion', 'observacion_texto',
       'tiene_evaluacion',  'evaluacion_texto',
       'tiene_nota',        'nota_texto'].forEach(k => {
        if (textosOt[k] !== undefined) datos[k] = textosOt[k];
      });
    }
  }

  // ── Aplicar condiciones_por_ot: overrides de norma / código / orientación
  // / probeta_mec_segun para la OT que se está emitiendo. Si un override está
  // vacío o no existe, se cae al valor global (secciones 1.1 y 1.2 del form).
  // Marcamos con flags "internos" para que las líneas se armen usando el
  // texto libre en vez de derivarse de los checkboxes globales.
  if (datos.condiciones_por_ot && typeof datos.condiciones_por_ot === 'object') {
    const nroOtActualCond = String(ot.nro_ot || '');
    const condOt = datos.condiciones_por_ot[nroOtActualCond];
    if (condOt) {
      datos = Object.assign({}, datos);
      if (condOt.norma_ensayo_ot)       datos._norma_ensayo_override = condOt.norma_ensayo_ot;
      if (condOt.codigo_referencia_ot)  datos._codigo_referencia_override = condOt.codigo_referencia_ot;
      if (condOt.orientacion_ot)        datos.orientacion = condOt.orientacion_ot;
      if (condOt.probeta_mec_ot)        datos.probeta_mecanizada_segun = condOt.probeta_mec_ot;
    }
  }

  const equipo    = datos.equipamiento || {};
  // Auto-detección del tipo de tabla según los `tipo` cargados en cada fila
  // (Cara/Raíz/Lateral). Solo se aplica si el usuario NO eligió tipo_tabla
  // explícitamente. Cubre el caso típico: cargué 4 probetas Lateral y no
  // quiero que el default 'cara_raiz' me deje la tabla vacía.
  function autoTipoTabla(filas) {
    const tipos = new Set((filas || [])
      .map(p => String(p && p.tipo || '').toLowerCase().trim())
      .filter(Boolean));
    const tieneCR = tipos.has('cara') || tipos.has('raíz') || tipos.has('raiz');
    const tienePL = tipos.has('lateral');
    if (tieneCR && tienePL) return 'combinado';
    if (tienePL && !tieneCR) return 'lateral';
    if (tieneCR && !tienePL) return 'cara_raiz';
    return null; // sin tipos cargados — respetar default
  }
  const tipoTablaAuto = autoTipoTabla(datos.resultados || datos.probetas);
  const tipo_tabla = datos.tipo_tabla || tipoTablaAuto || 'cara_raiz'; // 'cara_raiz' | 'lateral' | 'custom' | 'combinado'

  // ── Condiciones de ensayo ─────────────────────────────────────────────────
  // Norma de ensayo — form nuevo usa checkboxes `norma_iso5173`, `norma_astm_e190`
  // con año editable en `<key>_year`. Fallback legacy: `norma_ensayo` (dropdown).
  function _sufAnioPl(key) {
    const v = String(datos[key + '_year'] || '').trim();
    if (!v) return '';
    return (v[0] === '-' || v[0] === ':') ? v : '-' + v;
  }
  const normasCheckList = [];
  if (datos.norma_iso5173)   normasCheckList.push('ISO 5173' + _sufAnioPl('norma_iso5173'));
  if (datos.norma_astm_e190) normasCheckList.push('ASTM E190' + _sufAnioPl('norma_astm_e190'));
  const normaEnsayoLegacy = datos.norma_ensayo === 'otra'
    ? (datos.norma_ensayo_otra || '')
    : (datos.norma_ensayo || '');
  const normaEnsayoGlobal = normasCheckList.length
    ? normasCheckList.join(' / ')
    : normaEnsayoLegacy;
  // Override por OT (condiciones_por_ot) — el texto libre reemplaza el derivado.
  const normaEnsayo = datos._norma_ensayo_override || normaEnsayoGlobal;
  const metodologia = datos.metodologia || '';
  const normas = [];
  if (normaEnsayo) normas.push(`Norma de ensayo: ${normaEnsayo}`);
  if (metodologia) normas.push(`Metodología de ensayo: ${metodologia}`);
  if (datos.metodologia_cliente) normas.push('Metodología de ensayo según indicaciones del cliente');
  const normas_seleccionadas_linea = normas.length ? normas.join('\n') : '__SECTION_HIDE__';

  // Códigos / Norma de referencia (texto libre opcional + códigos predefinidos)
  // El "texto del código" (sin el prefijo "Código de referencia:") también se
  // reutiliza abajo como prefijo de "Probeta mecanizada según ...".
  const codigoRefTexto = datos._codigo_referencia_override || (() => {
    if (datos.cod_asme)    return `ASME BPVC Sección IX Ed. ${datos.ed_asme || '…….'}`;
    if (datos.cod_aws_d11) return `AWS D1.1/D1.1M-${datos.ed_aws_d11 || '2020'}`;
    if (datos.cod_api1104) return `API 1104 Ed. ${datos.ed_api1104 || '22-2021 (E1-2023)'}`;
    if (datos.cod_api5l)   return 'API 5L';
    return null;
  })();
  const codigos = [];
  if (datos.norma_referencia && !datos._codigo_referencia_override) codigos.push(`Norma de referencia: ${datos.norma_referencia}`);
  if (codigoRefTexto)         codigos.push(`Código de referencia: ${codigoRefTexto}`);
  const codigo_referencia_linea = codigos.length ? codigos.join('\n') : '__SECTION_HIDE__';

  // Probeta mecanizada según — si hay Código de referencia seleccionado, se
  // prepende al texto libre del user (ej: "ASME BPVC Sección IX Ed. 2025 QW 462.3").
  // Si el user ya escribió el código completo en el input, no lo duplicamos.
  const probetaSufijo = (datos.probeta_mecanizada_segun || '').trim();
  let probeta_mecanizada_segun_linea = '__SECTION_HIDE__';
  if (codigoRefTexto && probetaSufijo) {
    probeta_mecanizada_segun_linea = probetaSufijo.startsWith(codigoRefTexto)
      ? `Probeta mecanizada según ${probetaSufijo}`
      : `Probeta mecanizada según ${codigoRefTexto} ${probetaSufijo}`;
  } else if (codigoRefTexto) {
    probeta_mecanizada_segun_linea = `Probeta mecanizada según ${codigoRefTexto}`;
  } else if (probetaSufijo) {
    probeta_mecanizada_segun_linea = `Probeta mecanizada según ${probetaSufijo}`;
  }

  // El campo metodologia_ensayo_linea no está en este template — hide
  const metodologia_ensayo_linea = '__SECTION_HIDE__';

  // ── Parámetros de ensayo ──────────────────────────────────────────────────
  // Diámetro mandril: NO agregar " mm" si el valor ya trae unidad/texto
  // (ej "3 Espesores", "90mm"). Solo agregar " mm" si es número puro.
  let diametro_mandril_linea = '__SECTION_HIDE__';
  if (datos.diametro_mandril) {
    const v = String(datos.diametro_mandril).trim();
    const esNumeroPuro = /^[\d.,]+$/.test(v);
    diametro_mandril_linea = `Diámetro mandril: ${v}${esNumeroPuro ? ' mm' : ''}`;
  }

  const espesor_probeta_linea = datos.espesor_probeta
    ? `Espesor de probeta: ${datos.espesor_probeta} mm`
    : '__SECTION_HIDE__';

  // Ancho de probeta + Ángulo de doblado (opcional, va justo después del ancho)
  const anchoLineas = [];
  if (datos.ancho_probeta) anchoLineas.push(`Ancho de probeta: ${datos.ancho_probeta} mm`);
  if (datos.angulo_doblado) {
    const a = String(datos.angulo_doblado).trim();
    anchoLineas.push(`Ángulo de doblado: ${a}${/[°˚]/.test(a) ? '' : '°'}`);
  }
  const ancho_probeta_linea = anchoLineas.length ? anchoLineas.join('\n') : '__SECTION_HIDE__';

  const orientacion_probeta_linea = datos.orientacion
    ? `Orientación de la probeta: ${datos.orientacion}`
    : '__SECTION_HIDE__';

  const distancia_entre_apoyos_linea = datos.distancia_apoyos
    ? `Distancia entre apoyos: ${datos.distancia_apoyos} mm`
    : '__SECTION_HIDE__';

  let temperatura_ensayo_linea = '__SECTION_HIDE__';
  if (datos.temperatura) {
    const t = String(datos.temperatura).trim();
    temperatura_ensayo_linea = `Temperatura de ensayo: ${t.includes('°') ? t : t + ' °C'}`;
  }

  const zona_plegado_linea = datos.zona_plegado
    ? `Zona de plegado: ${datos.zona_plegado}`
    : '__SECTION_HIDE__';

  // ── Equipamiento ──────────────────────────────────────────────────────────
  // Set de equipos según variante (emic / torne / shimadzu)
  const varianteEquipo = (datos.equipo || datos.variante_equipo) || 'emic';
  const EQUIPO = varianteEquipo === 'torne'    ? EQUIPO_TORNE
               : varianteEquipo === 'shimadzu' ? EQUIPO_SHIMADZU
               : EQUIPO_EMIC;
  // Filtrar equipos tildados. El TAG final se toma de equipamiento_tags[key]
  // si el técnico lo editó, sino usa tagDefault. Mandril tiene doble mecanismo:
  // datos.mandril_tag legacy o equipamiento_tags.mandril nuevo.
  const equipTags = datos.equipamiento_tags || {};
  const listaEquipos = EQUIPO
    .filter(e => equipo[e.key])
    .map(e => {
      let tag = equipTags[e.key] != null ? String(equipTags[e.key]).trim() : e.tagDefault;
      if (e.key === 'mandril' && !tag) tag = String(datos.mandril_tag || '').trim();
      if (e.key === 'mandril' && tag && !/^MM/i.test(tag) && !/^PMM/i.test(tag) && !/-/.test(tag)) {
        // El técnico ingresó sólo el número del mandril — prefijar MM- por retro-compat.
        tag = `MM-${tag}`;
      }
      return tag ? `${e.nombre} TAG N°${tag}` : e.nombre + ' TAG N°…';
    });

  // Equipos extra del catálogo (DB, agregados desde el form via equipamiento_extra)
  if (Array.isArray(datos.equipamiento_extra)) {
    datos.equipamiento_extra.forEach(function (e) {
      if (e && (e.nombre || e.label)) listaEquipos.push(e.nombre || e.label);
    });
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => listaEquipos.push(l));
  const equipSlots = {};
  for (let i = 1; i <= 5; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquipos[i - 1] || '__SECTION_HIDE__';
  }

  // ── Resultados: indicaciones por probeta ──────────────────────────────────
  // probetas: [{ id: 'PC 1', tipo: 'Cara', resultado: 'sin'|'con', cant: 1, mm: 5 }]
  // Normalizar p.resultado a 'con'/'sin'. El agente-mapeo (cuando se usa el flujo
  // QA del endpoint /api/generate-with-qa/) transforma "con" → "Con indicaciones"
  // ANTES de llamar al generador. Aceptamos ambos formatos para ser robustos.
  const normalizarRes = (r) => {
    if (!r) return 'sin';
    const s = String(r).toLowerCase().trim();
    if (s === 'con' || s.startsWith('con ') || s.includes('con indicaciones')) return 'con';
    return 'sin';
  };
  const probetas = (datos.probetas || []).map(p => ({ ...p, resultado: normalizarRes(p.resultado) }));

  // Convierte un número (1-12) a palabra. Para >12 deja la cifra.
  const NUM_PALABRA = ['','una','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce'];
  const numAPalabra = n => (n >= 1 && n <= 12 ? NUM_PALABRA[n] : String(n));

  // Construye texto natural para las indicaciones de una probeta:
  //   1 indicación:   "1.5 mm de longitud"
  //   2 indicaciones: "0.2 y 0.2 mm de longitud respectivamente"
  //   3+:             "0.6; 0.2; 0.3; 0.3 y 0.3 mm de longitud respectivamente"
  function formatearLongitudes(longitudes) {
    if (longitudes.length === 0) return '';
    if (longitudes.length === 1) return ` de ${longitudes[0]} mm de longitud`;
    if (longitudes.length === 2) return ` de ${longitudes[0]} y ${longitudes[1]} mm de longitud respectivamente`;
    const inicio = longitudes.slice(0, -1).join('; ');
    const ultimo = longitudes[longitudes.length - 1];
    return ` de ${inicio} y ${ultimo} mm de longitud respectivamente`;
  }

  // Si solo hay UNA probeta de un tipo (ej. solo "PC 1" sin "PC 2"), el informe
  // real usa "PC" (sin número). Si hay varias, usa "PC 1", "PC 2", etc.
  const contarPorPrefijo = new Map();
  probetas.forEach(p => {
    const pref = String(p.id || '').replace(/\s+\d+$/, '').trim() || p.id;
    contarPorPrefijo.set(pref, (contarPorPrefijo.get(pref) || 0) + 1);
  });

  // Build INDICACIONES section text
  const lineasInd = [];
  probetas.forEach(p => {
    if (p.resultado === 'con') {
      // Parsear a número — cant_indicaciones puede venir como string "1" del form,
      // y "1" === 1 es false, lo que rompía el singular/plural ("Se observan una indicaciones").
      const cant = parseInt(p.cant_indicaciones, 10) || 1;
      const longitudes = (p.longitud_mm || '').trim()
        ? String(p.longitud_mm).split(/[;,]/).map(s => s.trim()).filter(Boolean)
        : [];
      const mmStr = formatearLongitudes(longitudes);
      const palabra = cant === 1 ? 'indicación' : 'indicaciones';
      const verbo   = cant === 1 ? 'Se observa' : 'Se observan';
      const cantStr = numAPalabra(cant);

      // Etiqueta probeta: sin número si es la única de su tipo
      const pref = String(p.id || '').replace(/\s+\d+$/, '').trim() || p.id;
      const label = contarPorPrefijo.get(pref) === 1 ? pref : p.id;

      lineasInd.push(`${label} - ${verbo} ${cantStr} ${palabra}${mmStr}.`);
    }
  });
  const indicaciones_linea = lineasInd.length ? lineasInd.join('\n') : '__SECTION_HIDE__';

  // Use inspeccion_1..4 for custom notes (currently hide all)
  const inspeccionSlots = { inspeccion_1: '__SECTION_HIDE__', inspeccion_2: '__SECTION_HIDE__', inspeccion_3: '__SECTION_HIDE__', inspeccion_4: '__SECTION_HIDE__' };

  // ── Observaciones ─────────────────────────────────────────────────────────
  // Emite (en orden) las secciones OBSERVACIÓN → EVALUACIÓN → NOTA de la OT
  // actual. Cada bloque se activa con su flag `tiene_X` + texto. Además, el
  // campo `observaciones_extra` (indicaciones/defectos globales, sección 1.5)
  // se emite antes que las secciones por OT.
  const lineasObs = [];
  if (datos.muestra_fuera_alcance) lineasObs.push('"Muestra fuera del alcance de acreditación"');
  if (datos.observaciones_extra) {
    lineasObs.push(datos.observaciones_extra);
  }
  if (datos.tiene_observacion && String(datos.observacion_texto || '').trim()) {
    if (lineasObs.length) lineasObs.push('');
    lineasObs.push('OBSERVACIÓN');
    lineasObs.push(String(datos.observacion_texto).trim());
  }
  if (datos.tiene_evaluacion && String(datos.evaluacion_texto || '').trim()) {
    if (lineasObs.length) lineasObs.push('');
    lineasObs.push('EVALUACIÓN DE RESULTADOS');
    lineasObs.push('"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA"');
    lineasObs.push(String(datos.evaluacion_texto).trim());
  }
  if (datos.tiene_nota && String(datos.nota_texto || '').trim()) {
    if (lineasObs.length) lineasObs.push('');
    lineasObs.push('NOTA');
    lineasObs.push(String(datos.nota_texto).trim());
  }
  const observaciones_linea = lineasObs.length ? lineasObs.join('\n') : '__SECTION_HIDE__';

  // W5: texto OAA separado, en negrita centrado antes de FIN DE INFORME
  const textosOAA = [];
  if (datos.nota_oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  // ── Imagen de recepción ───────────────────────────────────────────────────
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const imagen_recepcion = fotos.length > 0 ? '__IMAGE_HERE__' : '__IMAGE_NONE__';

  // ── Datos del template ────────────────────────────────────────────────────
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  const templateData = {
    numero_ot:    nroOtBase,
    razon_social: ot.razon_social       || '',
    fecha_generacion: ot.fecha_finalizacion || '',

    identificacion_muestra:          ot.id_muestra        || '',
    fecha_recepcion_muestra:         ot.fecha_recepcion   || '',
    fecha_aprobacion_inicio_trabajo: ot.fecha_aprobacion  || '',
    fecha_finalizacion_certificado:  ot.fecha_finalizacion || '',
    imagen_recepcion,

    normas_seleccionadas_linea,
    codigo_referencia_linea,
    probeta_mecanizada_segun_linea,
    metodologia_ensayo_linea,

    diametro_mandril_linea,
    espesor_probeta_linea,
    ancho_probeta_linea,
    orientacion_probeta_linea,
    distancia_entre_apoyos_linea,
    temperatura_ensayo_linea,
    zona_plegado_linea,

    ...equipSlots,

    indicaciones_linea,
    observaciones_linea,

    ...inspeccionSlots,
  };

  // ── Docxtemplater ─────────────────────────────────────────────────────────
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  doc.render(templateData);

  // ── Post-proceso ──────────────────────────────────────────────────────────
  const processedZip = doc.getZip();
  let outXml = processedZip.files['word/document.xml'].asText();
  // ASTERISCO_TITULO_AUTO — agrega * al título del ensayo si está marcado fuera del alcance OAA
  if (datos.nota_oaa) {
    // Estrategia 1: título en un solo <w:t>
    const tituloRe = /(<w:t[^>]*>)(ENSAYO DE PLEGADO)(\*?)(\s*<\/w:t>)/;
    if (tituloRe.test(outXml)) {
      outXml = outXml.replace(tituloRe, function (m, pre, txt, ya, close) {
        return ya === '*' ? m : pre + txt + '*' + close;
      });
    }
  }


  outXml = eliminarSeccionesOcultas(outXml);

  // Show only the selected table group; hide the others
  outXml = gestionarTablasPlegado(outXml, tipo_tabla);

  // Replace "Con / Sin indicaciones" with actual per-probeta results;
  // rows not in active set are hidden (handles count-reduced probeta lists)
  outXml = reemplazarResultadosCeldas(outXml, probetas);

  // For combinado: merge Table 1 (PL rows) into Table 0 → single result table
  if (tipo_tabla === 'combinado') {
    outXml = fusionarTablasCombinado(outXml);
  }

  // Tabla de 2 columnas: quitar la columna "Tipo de plegado" si el usuario lo pidió
  if (datos.incluir_tipo_plegado === false) {
    outXml = quitarColumnaTipoPlegado(outXml);
  }

  // El párrafo "OP1 Luego del ensayo la muestra no presenta indicaciones..."
  // no aparece en los informes reales — se oculta SIEMPRE (haya o no indicaciones).
  // Las indicaciones específicas se renderizan vía `indicaciones_linea` (un placeholder aparte).
  outXml = ocultarParrafoConTexto(outXml, 'OP1');
  const hayIndicaciones = probetas.some(p => p.resultado === 'con');

  // Hide section headings when their content is entirely empty
  // Siempre ocultar los títulos INDICACIONES y OBSERVACIONES — el contenido
  // va directo debajo de la tabla sin encabezado de sección
  outXml = ocultarParrafoConTexto(outXml, 'INDICACIONES');
  outXml = ocultarParrafoConTexto(outXml, 'OBSERVACIONES');
  if (Object.values(inspeccionSlots).every(v => v === '__SECTION_HIDE__'))
    outXml = ocultarParrafoConTexto(outXml, 'INSPECCION');

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'plegado');

  // Handle preinforme disclaimer (static text at end of template)
  outXml = gestionarPreinforme(outXml, !!ot.es_preinforme);

  // Fix header: remove extra tab run that displaces the Fecha value,
  // and ensure {{fecha_generacion}} is replaced if Docxtemplater missed it
  {
    let hdrXml = processedZip.files['word/header1.xml'].asText();
    // Remove the stray extra-tab run inserted in a different editing session
    hdrXml = hdrXml.replace(/<w:r w:rsidR="00B44C0F"><w:rPr>[\s\S]*?<\/w:rPr><w:tab\/><\/w:r>/, '');
    // Fallback: if Docxtemplater didn't replace fecha_generacion, do it manually
    if (hdrXml.includes('{{fecha_generacion}}')) {
      hdrXml = hdrXml.replace('{{fecha_generacion}}', templateData.fecha_generacion || '');
    }
    if (ot.es_preinforme) {
      hdrXml = hdrXml.replace('CERTIFICADO DE ANALISIS', 'CERTIFICADO DE ANALISIS PRELIMINAR');
    }
    processedZip.file('word/header1.xml', hdrXml);
  }

  // Reduce excessive blank paragraphs before "FIN DE INFORME" to exactly one
  outXml = limpiarAntesDeFinInforme(outXml);

  // Align content paragraphs with the subtitle. En los informes reales (SERSOL,
  // BERTOTTO, etc.) el subtítulo "CONDICIONES DE ENSAYO" tiene un override
  // <w:ind w:left="426" w:firstLine="0"/> que pone el "1.1." en pos 426 y el
  // texto del subtítulo en pos 851 (por el tab definido). El contenido también
  // va en left=851. El template original NO tiene ese override en el subtítulo
  // ni en el título — lo agregamos en post-proceso para emular el real.
  // Convertir numbering autom�tico (w:numPr) a texto manual ("1.", "1.1.", etc.)
  outXml = convertirNumberingATexto(outXml);
  outXml = outXml.replace(/w:left="792"/g, 'w:left="851"');
  // Limpiar tabs vac�os antes del p�rrafo de indicaciones (PC vs PR margen distinto)
  outXml = limpiarTabsIndicaciones(outXml);

  // Normalizar sangría de párrafos de contenido generados por linebreaks.
  // Los clones de Docxtemplater (PR 2, Metodología, etc.) pueden perder w:ind
  // si el template fue editado. Esta función los corrige en el output, no en el template.
  outXml = normalizarSangriaContenido(outXml);

  outXml = eliminarParrafosVacios(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  // W4: colapsa runs de >1 párrafos blancos consecutivos a exactamente 1
  // (cubre el espacio sobre indicaciones y sobre FIN DE INFORME)
  outXml = colapsarBlancos(outXml);
  outXml = ajustarBlancoEntreSubtitulos(outXml);
  outXml = forzarCalibri(outXml);
  outXml = ajustarEspaciado(outXml);
  // Insertar blancos alrededor de las indicaciones AL FINAL — después de
  // eliminarParrafosVacios/colapsarBlancos para que no los borren.
  outXml = insertarBlancosAlrededorIndicaciones(outXml);
  // Garantiza blank visible entre las indicaciones (o lo que sea que quede
  // arriba) y "FIN DE INFORME", con altura de línea normal.
  outXml = asegurarBlankAntesDeFin(outXml);
  outXml = minimizarUltimoParagrafo(outXml);

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones ───────────────────────────────────────────────────

// Inyecta override de indentación en los párrafos que tienen <w:numPr> (títulos
// numerados como "1. ENSAYO DE PLEGADO" y "1.1. CONDICIONES DE ENSAYO"), para
// que coincidan con la alineación de los informes reales:
//   - Nivel 0 (1.):   <w:ind w:left="142" w:firstLine="0"/>
//   - Nivel 1 (1.1.): <w:ind w:left="426" w:firstLine="0"/>
// Si el párrafo ya tiene un <w:ind> (override existente), lo reemplaza.
function convertirNumberingATexto(xml) {
  let counterL1 = 0;
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    const ilvlMatch = p.match(/<w:ilvl w:val="(\d+)"\/>/);
    if (!ilvlMatch) return p;
    const ilvl = parseInt(ilvlMatch[1], 10);

    let numStr, leftIndent, tabPos;
    if (ilvl === 0) { numStr = '1.';  leftIndent = 0;   tabPos = 426; }
    else if (ilvl === 1) { counterL1++; numStr = `1.${counterL1}.`; leftIndent = 426; tabPos = 851; }
    else return p;

    // Quitar <w:numPr>, cualquier <w:ind> y <w:tabs> existentes
    let out = p.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '');
    out = out.replace(/<w:ind\b[^/]*\/>/g, '');
    out = out.replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, '');

    // Setear <w:tabs> consistente (un solo tab al pos donde queremos que empiece el texto)
    // y <w:ind> con left correcto. Inserto ambos al inicio del <w:pPr> (despu�s de <w:pStyle>).
    const tabsAndInd = `<w:tabs><w:tab w:val="left" w:pos="${tabPos}"/></w:tabs><w:ind w:left="${leftIndent}"/>`;
    if (out.includes('</w:pStyle>')) {
      out = out.replace('</w:pStyle>', `</w:pStyle>${tabsAndInd}`);
    } else {
      // Fallback: insertar antes del cierre de <w:pPr>
      out = out.replace('</w:pPr>', `${tabsAndInd}</w:pPr>`);
    }

    // Insertar antes del primer <w:t>: run con n�mero + run con <w:tab/>
    const tIdx = out.search(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t/);
    if (tIdx < 0) return p;
    const runEnd = out.indexOf('</w:r>', tIdx);
    const runBlock = out.slice(tIdx, runEnd);
    const rPrMatch = runBlock.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    let rPr = rPrMatch ? rPrMatch[0] : '<w:rPr></w:rPr>';
    // Bug B: forzar negrita en el run del número
    if (!/<w:b\s*\/>/.test(rPr)) rPr = rPr.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>');
    const insertion = `<w:r>${rPr}<w:t xml:space="preserve">${numStr}</w:t></w:r><w:r>${rPr}<w:tab/></w:r>`;
    out = out.slice(0, tIdx) + insertion + out.slice(tIdx);
    return out;
  });
}

// Inserta un párrafo en blanco antes y después del párrafo que contiene
// indicaciones (texto "Se observa" o "Se observan ... indicaci"), para que
// no quede pegado a la tabla ni al siguiente bloque. El BLANK usa sz=22
// (11pt) para que Word lo renderice con altura de línea normal — sin esto,
// el párrafo blank se ve como una fina línea imperceptible.
function insertarBlancosAlrededorIndicaciones(xml) {
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr></w:p>';
  // Marcamos los blanks recién insertados con un rsid falso para que
  // colapsarBlancos posterior no los borre.
  return xml.replace(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, par => {
    const text = par.replace(/<[^>]+>/g, ' ');
    if (/\bSe observa\b/.test(text) && /indicaci(ón|ones)/i.test(text)) {
      return BLANK + par + BLANK;
    }
    return par;
  });
}

// Garantiza que entre el ÚLTIMO párrafo de indicaciones y "FIN DE INFORME"
// haya EXACTAMENTE un párrafo blank visible (sz=22). Se llama después de
// insertarBlancosAlrededorIndicaciones y limpiarAntesDeFinInforme para
// asegurar la separación final aunque otros post-procesos hayan colapsado.
function asegurarBlankAntesDeFin(xml) {
  const finIdx = xml.indexOf('FIN DE INFORME');
  if (finIdx < 0) return xml;
  const pFin = scanBackForTag(xml, '<w:p', finIdx);
  if (pFin < 0) return xml;
  // Ver el párrafo inmediatamente anterior
  const prevClose = xml.lastIndexOf('</w:p>', pFin - 1);
  if (prevClose < 0) return xml;
  const prevOpen = scanBackForTag(xml, '<w:p', prevClose);
  if (prevOpen < 0) return xml;
  const prevPara = xml.slice(prevOpen, prevClose + '</w:p>'.length);
  // Si el anterior YA es blank, no hacemos nada.
  if (esParrafoBlanco(prevPara)) return xml;
  // Si no, insertar un BLANK antes de "FIN DE INFORME"
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr></w:p>';
  return xml.slice(0, pFin) + BLANK + xml.slice(pFin);
}

// Limpia el p�rrafo de "Se observan �" quitando runs vac�os con <w:tab/>.
// El placeholder {{indicaciones_linea}} tiene 2 tabs previos en el template; cuando
// docxtemplater pone m�ltiples l�neas con <w:br/>, los tabs solo afectan a la PRIMERA,
// dejando la 2da y siguientes con margen distinto. Quitar los tabs alinea todo.
function limpiarTabsIndicaciones(xml) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    if (!p.includes('Se observan')) return p;
    return p.replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, run => {
      const hasTab = /<w:tab\/>/.test(run);
      const hasText = /<w:t\b[^>]*>/.test(run);
      return (hasTab && !hasText) ? '' : run;
    });
  });
}

// Quita la columna "Tipo de plegado" (la 2da) de las tablas de resultados de plegado,
// dejando solo "Probeta | Resultado". Reconstruye cada fila sin su 2da celda y
// elimina el 2do <w:gridCol>.
function quitarColumnaTipoPlegado(xml) {
  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tbl => {
    const texto = tbl.replace(/<[^>]+>/g, ' ');
    if (!/Tipo de plegado/.test(texto)) return tbl; // no es tabla de plegado con esa columna
    let result = tbl;
    // Eliminar el 2do <w:gridCol/>
    let gridCount = 0;
    result = result.replace(/<w:gridCol\b[^>]*\/>/g, m => (++gridCount === 2 ? '' : m));
    // En cada fila, quitar la 2da celda
    result = result.replace(/(<w:tr\b[^>]*>)([\s\S]*?)(<\/w:tr>)/g, (m, open, inner, close) => {
      const trPrMatch = inner.match(/^(<w:trPr>[\s\S]*?<\/w:trPr>)/);
      const trPr = trPrMatch ? trPrMatch[1] : '';
      const rest = trPr ? inner.slice(trPr.length) : inner;
      const cells = [...rest.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map(x => x[0]);
      if (cells.length < 2) return m;
      cells.splice(1, 1); // quitar 2da celda (Tipo de plegado)
      return open + trPr + cells.join('') + close;
    });
    return result;
  });
}

function eliminarSeccionesOcultas(xml) {
  const MARKER = '__SECTION_HIDE__';
  let result = xml;
  let markerPos;
  while ((markerPos = result.indexOf(MARKER)) >= 0) {
    const pClose = result.indexOf('</w:p>', markerPos);
    if (pClose < 0) break;
    const contentEnd = pClose + '</w:p>'.length;
    const pOpen = scanBackForTag(result, '<w:p', markerPos);
    if (pOpen < 0) { result = result.slice(0, markerPos) + result.slice(contentEnd); continue; }
    let removeFrom = pOpen;
    let cursor = pOpen;
    while (true) {
      const prevClose = result.lastIndexOf('</w:p>', cursor - 1);
      if (prevClose < 0) break;
      const prevOpen = scanBackForTag(result, '<w:p', prevClose);
      if (prevOpen < 0) break;
      const para = result.slice(prevOpen, prevClose + '</w:p>'.length);
      if (!esParrafoBlanco(para)) break;
      removeFrom = prevOpen;
      cursor = prevOpen;
    }
    result = result.slice(0, removeFrom) + result.slice(contentEnd);
  }
  return result;
}

// Remove/keep tables based on tipo_tabla selection (forward scan — safe after prior edits)
// Table 0: PC/PR (Cara + Raíz) · Table 1: PL (Lateral) · Table 2: custom
function gestionarTablasPlegado(xml, tipo_tabla) {
  let keepIndices;
  switch (tipo_tabla) {
    case 'cara_raiz':  keepIndices = new Set([0]); break;
    case 'lateral':    keepIndices = new Set([1]); break;
    case 'custom':     keepIndices = new Set([2]); break;
    case 'combinado':  keepIndices = new Set([0, 1]); break;
    default:           keepIndices = new Set([0]);
  }

  let tableIdx = 0;
  let result   = xml;
  let offset   = 0;

  while (true) {
    const ts = result.indexOf('<w:tbl>', offset);
    if (ts < 0) break;
    const teCore = result.indexOf('</w:tbl>', ts);
    if (teCore < 0) break;
    const te = teCore + '</w:tbl>'.length;

    if (!keepIndices.has(tableIdx)) {
      // Remove this table; also remove the "Tabla N°" caption paragraph that follows
      let removeEnd = te;
      const after = result.slice(te, te + 2000);
      const capMatch = after.match(/^<w:p\b[^>]*>[\s\S]*?<\/w:p>/);
      if (capMatch && /Tabla\s*N[°º]/i.test(capMatch[0].replace(/<[^>]+>/g, ''))) {
        removeEnd = te + capMatch[0].length;
      }
      result = result.slice(0, ts) + result.slice(removeEnd);
      // Don't advance offset — the next table now starts at 'ts'
    } else {
      offset = te; // advance past the kept table
    }
    tableIdx++;
  }

  return result;
}

// Reconstruye las filas de resultados a partir del array de probetas[].
// Antes (versión que daba problemas): intentaba matchear el ID de cada fila
// del template (PC 1, PR 1, PL 1…) con activeProbetaIds del usuario; si no
// había match → borraba la fila. Resultado: si el usuario tenía 4 probetas
// PL pero el template tenía solo PL 1/PL 2 (o solo PC/PR), perdía datos o
// se quedaba sin filas.
//
// Ahora: tomamos la primera fila de datos del template como PLANTILLA, y
// generamos UNA fila por probeta — reemplazando el ID, el "Tipo de plegado"
// (segunda columna) y el "Con / Sin indicaciones". Si solo hay 1 probeta,
// se elimina el sufijo numérico del ID en la celda (ej. "PC 1" → "PC").
function reemplazarResultadosCeldas(xml, probetas) {
  if (!Array.isArray(probetas) || probetas.length === 0) {
    // Sin probetas → quitar todas las filas con "Con / Sin indicaciones"
    return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row =>
      row.includes('Con / Sin indicaciones') ? '' : row);
  }
  // Contar probetas por prefijo para decidir si mostrar "PC" o "PC 1"
  const contarPorPrefijo = new Map();
  probetas.forEach(p => {
    const pref = String(p.id || '').replace(/\s+\d+$/, '').trim() || p.id;
    contarPorPrefijo.set(pref, (contarPorPrefijo.get(pref) || 0) + 1);
  });

  function reemplazarTextoCelda(cellXml, nuevoTexto) {
    const esc = String(nuevoTexto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Reemplazar el primer <w:t...>...</w:t> con el nuevo texto, eliminar el resto
    let visto = false;
    return cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (m, attrs) => {
      if (visto) return '';
      visto = true;
      const space = attrs.includes('xml:space') ? attrs : attrs + ' xml:space="preserve"';
      return `<w:t${space}>${esc}</w:t>`;
    });
  }

  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tbl => {
    // Buscar filas de datos (las que tienen "Con / Sin indicaciones")
    const trRe = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
    const allRows = [...tbl.matchAll(trRe)];
    const dataRows = allRows.filter(m => m[0].includes('Con / Sin indicaciones'));
    if (dataRows.length === 0) return tbl;

    // La primera fila de datos del template es nuestra plantilla
    const rowTemplate = dataRows[0][0];

    // Detectar qué tipo de tabla es por el ID de la primera fila (PC, PR, PL).
    // Solo aplicar las probetas del tipo correspondiente — evita duplicar
    // probetas Cara/Raíz dentro de la tabla Lateral (modo combinado).
    const firstCellText = (rowTemplate.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/)?.[0] || '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    let probetasFiltradas = probetas;
    // Si NINGUNA probeta cargó "tipo", no filtrar — el usuario no especificó
    // discriminación Cara/Raíz/Lateral y todas las filas van en la única tabla.
    const algunoTieneTipo = probetas.some(p => String(p.tipo || '').trim() !== '');
    if (algunoTieneTipo) {
      if (firstCellText.startsWith('PC') || firstCellText.startsWith('PR')) {
        probetasFiltradas = probetas.filter(p => {
          const t = String(p.tipo || '').toLowerCase();
          return t === 'cara' || t === 'raíz' || t === 'raiz';
        });
      } else if (firstCellText.startsWith('PL')) {
        probetasFiltradas = probetas.filter(p => String(p.tipo || '').toLowerCase() === 'lateral');
      }
    }
    // Si esta tabla no tiene ninguna probeta del tipo correcto, quitar todas las filas de datos
    if (probetasFiltradas.length === 0) {
      const firstStart0 = dataRows[0].index;
      const lastDR0 = dataRows[dataRows.length - 1];
      return tbl.slice(0, firstStart0) + tbl.slice(lastDR0.index + lastDR0[0].length);
    }

    // Helper: inyecta <w:vMerge> en la 2da celda (Tipo de plegado).
    // val='restart' = primera fila del grupo (con texto)
    // val='continue' = fila subsiguiente del grupo (sin texto, mergeada con la de arriba)
    function injectVMerge(cellXml, val) {
      const tag = val === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
      let out = cellXml;
      // Quitar vMerge previo si lo tuviera
      out = out.replace(/<w:vMerge[^/]*\/>/, '');
      // Insertarlo dentro de <w:tcPr> (o crearlo si no existe)
      if (out.includes('<w:tcPr>')) {
        out = out.replace('<w:tcPr>', '<w:tcPr>' + tag);
      } else {
        out = out.replace(/<w:tc\b[^>]*>/, m => m + `<w:tcPr>${tag}</w:tcPr>`);
      }
      return out;
    }

    // Construir N nuevas filas, una por probeta. Mergea verticalmente la
    // columna "Tipo de plegado" cuando hay filas consecutivas del mismo tipo.
    const newRows = probetasFiltradas.map((p, idx) => {
      let row = rowTemplate;
      const cellRe = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
      const cells = [...row.matchAll(cellRe)];
      if (cells.length < 3) return row;
      // Etiqueta de probeta: si es la única de su tipo, omitir el N°
      const pref = String(p.id || '').replace(/\s+\d+$/, '').trim() || p.id;
      const labelProbeta = contarPorPrefijo.get(pref) === 1 ? pref : p.id;
      const resultado = p.resultado === 'con' ? 'Con indicaciones' : 'Sin indicaciones';

      // ¿Esta fila es la primera de su grupo de tipo (vs la anterior)?
      const isFirstOfGroup = idx === 0 || (probetasFiltradas[idx - 1].tipo !== p.tipo);

      const c0 = cells[0]; const c1 = cells[1]; const c2 = cells[2];
      const newC0 = reemplazarTextoCelda(c0[0], labelProbeta);
      // Tipo de plegado: vMerge restart (con texto) o continue (sin texto)
      let newC1;
      if (isFirstOfGroup) {
        newC1 = reemplazarTextoCelda(c1[0], p.tipo || '');
        newC1 = injectVMerge(newC1, 'restart');
      } else {
        // Celda mergeada con la de arriba: sin texto
        newC1 = reemplazarTextoCelda(c1[0], '');
        newC1 = injectVMerge(newC1, 'continue');
      }
      const newC2 = c2[0].replace(/Con \/ Sin indicaciones/g, resultado);
      row = row.slice(0, c0.index) + newC0
          + row.slice(c0.index + c0[0].length, c1.index) + newC1
          + row.slice(c1.index + c1[0].length, c2.index) + newC2
          + row.slice(c2.index + c2[0].length);
      return row;
    });

    // Reemplazar TODAS las filas de datos por las nuevas
    const firstStart = dataRows[0].index;
    const lastDataRow = dataRows[dataRows.length - 1];
    const lastEnd = lastDataRow.index + lastDataRow[0].length;
    return tbl.slice(0, firstStart) + newRows.join('') + tbl.slice(lastEnd);
  });
}

// Remove a paragraph containing specific text (for OP1/OP2)
function ocultarParrafoConTexto(xml, texto) {
  let result = xml;
  let searchPos = 0;
  while (true) {
    const idx = result.indexOf(texto, searchPos);
    if (idx < 0) break;
    // Check it's not inside XML tag
    const pOpen = scanBackForTag(result, '<w:p', idx);
    if (pOpen < 0) { searchPos = idx + texto.length; continue; }
    const pClose = result.indexOf('</w:p>', idx);
    if (pClose < 0) { searchPos = idx + texto.length; continue; }
    result = result.slice(0, pOpen) + result.slice(pClose + '</w:p>'.length);
  }
  return result;
}

// Merge Table 1 (PL data rows) into Table 0 to produce a single combined result table.
// Used only for tipo_tabla='combinado' after reemplazarResultadosCeldas has run.
function fusionarTablasCombinado(xml) {
  const tbl0S = xml.indexOf('<w:tbl>');
  if (tbl0S < 0) return xml;
  const tbl0CoreEnd = xml.indexOf('</w:tbl>', tbl0S);
  if (tbl0CoreEnd < 0) return xml;
  const tbl0E = tbl0CoreEnd + '</w:tbl>'.length;

  const tbl1S = xml.indexOf('<w:tbl>', tbl0E);
  if (tbl1S < 0) return xml; // no second table — nothing to merge
  const tbl1CoreEnd = xml.indexOf('</w:tbl>', tbl1S);
  if (tbl1CoreEnd < 0) return xml;
  const tbl1E = tbl1CoreEnd + '</w:tbl>'.length;

  // Extract only data rows from Table 1 (skip header row that contains column headings)
  const tbl1Xml = xml.slice(tbl1S, tbl1E);
  const dataRows = [...tbl1Xml.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)]
    .filter(m => !/Resultado|Tipo de plegado|Probeta/.test(m[0].replace(/<[^>]+>/g, ' ')))
    .map(m => m[0])
    .join('');

  // Also remove the caption paragraph that follows Table 1
  let removeEnd = tbl1E;
  const after = xml.slice(tbl1E, tbl1E + 2000);
  const capMatch = after.match(/^<w:p\b[^>]*>[\s\S]*?<\/w:p>/);
  if (capMatch && /Tabla\s*N[°º]/i.test(capMatch[0].replace(/<[^>]+>/g, ''))) {
    removeEnd = tbl1E + capMatch[0].length;
  }

  // Append PL rows to Table 0, keep Table 0's caption, remove Table 1
  return (
    xml.slice(0, tbl0CoreEnd) +       // Table 0 content (before </w:tbl>)
    dataRows +                          // PL rows inserted
    xml.slice(tbl0CoreEnd, tbl1S) +    // Table 0 </w:tbl> + space/caption between tables
    xml.slice(removeEnd)               // Rest of document, Table 1 removed
  );
}

// Reduce consecutive blank paragraphs immediately before "FIN DE INFORME" to exactly one.
function limpiarAntesDeFinInforme(xml) {
  const finIdx = xml.indexOf('FIN DE INFORME');
  if (finIdx < 0) return xml;
  const pFin = scanBackForTag(xml, '<w:p', finIdx);
  if (pFin < 0) return xml;

  const blancos = [];
  let cursor = pFin;
  while (true) {
    const prevClose = xml.lastIndexOf('</w:p>', cursor - 1);
    if (prevClose < 0) break;
    const prevOpen = scanBackForTag(xml, '<w:p', prevClose);
    if (prevOpen < 0) break;
    const para = xml.slice(prevOpen, prevClose + '</w:p>'.length);
    if (!esParrafoBlanco(para)) break;
    blancos.push({ start: prevOpen, end: prevClose + '</w:p>'.length });
    cursor = prevOpen;
  }

  if (blancos.length <= 1) return xml;
  // Keep blancos[0] (immediately before FIN), remove the rest (blancos[1..last])
  return xml.slice(0, blancos[blancos.length - 1].start) + xml.slice(blancos[1].end);
}

// Handle preliminary disclaimer at end of document
function gestionarPreinforme(xml, esPreinforme) {
  const PREINFORME_TEXT = 'informe preliminar';
  const idx = xml.indexOf(PREINFORME_TEXT);
  if (idx < 0) return xml; // text not found, nothing to do

  if (esPreinforme) return xml; // keep it

  // Remove the paragraph containing the preliminary disclaimer
  return ocultarParrafoConTexto(xml, PREINFORME_TEXT);
}

function reemplazarImagen(xml, rId, name, cx, cy) {
  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="100" name="${name}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr>` +
    `<pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>` +
    `</pic:nvPicPr><pic:blipFill>` +
    `<a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill><pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr></pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing>`;

  const markerPos = xml.indexOf('__IMAGE_HERE__');
  if (markerPos < 0) return xml;
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const pOpen = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;

  return (
    xml.slice(0, pOpen) +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr><w:r>${drawing}</w:r></w:p>` +
    xml.slice(pClose + '</w:p>'.length)
  );
}

function eliminarImagenVacia(xml) {
  const markerPos = xml.indexOf('__IMAGE_NONE__');
  if (markerPos < 0) return xml;
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const imgParaEnd = pClose + '</w:p>'.length;
  const pOpen = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;

  let captionEnd = imgParaEnd;
  let searchPos = imgParaEnd;
  while (searchPos < xml.length) {
    const nextP = xml.indexOf('<w:p', searchPos);
    if (nextP < 0) break;
    const c = xml[nextP + 4];
    if (c === '>' || c === ' ' || c === '\r' || c === '\n') {
      const nextClose = xml.indexOf('</w:p>', nextP);
      if (nextClose >= 0) captionEnd = nextClose + '</w:p>'.length;
      break;
    }
    searchPos = nextP + 4;
  }

  return xml.slice(0, pOpen) + xml.slice(captionEnd);
}

function eliminarParrafosVacios(xml) {
  // Posición del page break — blanks de carátula (antes del PB, sin left=851) se preservan
  const pbPos = xml.indexOf('w:type="page"');

  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (par, offset, str) => {
    if (par.includes('w:type="page"')) return par;  // preservar page breaks siempre
    if (par.includes('<w:drawing>'))   return par;  // preservar imágenes (no tienen <w:t>)
    const tTexts = [...par.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const hasTags = tTexts.length > 0 || /<w:t[^>]*\/>/.test(par) || par.includes('<w:drawing>');
    if (!hasTags || tTexts.every(t => t.trim() === '')) {
      // Preservar blanks de carátula (antes del PB), excepto artefactos left=851
      if (pbPos >= 0 && offset < pbPos && !par.includes('w:left="851"')) return par;
      const rest = str.slice(offset + par.length).replace(/^\s+/, '');
      if (rest.startsWith('</w:tc>')) return par;
      return '';
    }
    return par;
  });
}

function minimizarUltimoParagrafo(xml) {
  const bodyEnd = xml.lastIndexOf('</w:body>');
  if (bodyEnd < 0) return xml;
  let before = xml.slice(0, bodyEnd);
  let removed = 0;

  while (true) {
    const lastClose = before.lastIndexOf('</w:p>');
    if (lastClose < 0) break;
    const lastOpen = scanBackForTag(before, '<w:p', lastClose);
    if (lastOpen < 0) break;
    const para = before.slice(lastOpen, lastClose + '</w:p>'.length);
    if (para.includes('<w:sectPr')) break;
    if (!esParrafoBlanco(para)) break;
    before = before.slice(0, lastOpen) + before.slice(lastClose + '</w:p>'.length);
    removed++;
  }

  if (removed === 0) return xml;

  const minimal = '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';
  const sectPrPos  = before.lastIndexOf('<w:sectPr');
  const lastParaEnd = before.lastIndexOf('</w:p>');
  if (sectPrPos > lastParaEnd) {
    return before.slice(0, sectPrPos) + minimal + before.slice(sectPrPos) + xml.slice(bodyEnd);
  }
  return before + minimal + xml.slice(bodyEnd);
}

// Normaliza la sangría de párrafos de contenido que no tienen w:ind explícito.
// Se aplica después del primer salto de página (área de ensayo, no carátula).
// Evita depender del template para que los clones de linebreaks tengan w:left="792".
function normalizarSangriaContenido(xml) {
  const pbPos = xml.indexOf('w:type="page"');
  if (pbPos < 0) return xml;
  const pbParaStart = scanBackForTag(xml, '<w:p', pbPos);
  if (pbParaStart < 0) return xml;

  const head = xml.slice(0, pbParaStart);
  const body = xml.slice(pbParaStart);

  const fixed = body.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, para => {
    if (para.includes('<w:numPr>'))       return para; // headings: conservar
    if (para.includes('w:type="page"'))   return para; // page breaks: conservar
    if (/<w:ind\b/.test(para))            return para; // ya tiene indent: conservar
    if (/<w:jc w:val="center"/.test(para)) return para; // centrado (FIN DE INFORME, etc.)

    // Tiene texto real (no párrafo vacío)
    const hasText = /<w:t[^>]*>[^<\s][^<]*<\/w:t>/.test(para);
    if (!hasText) return para;

    return para.replace('</w:pPr>', '<w:ind w:left="851"/></w:pPr>');
  });

  return head + fixed;
}

// W4: Colapsa secuencias de >1 párrafos en blanco consecutivos a exactamente 1.
// Cubre tanto el espacio antes del contenido de indicaciones como antes de FIN DE INFORME.
function colapsarBlancos(xml) {
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let out = '', lastIdx = 0, consecBlanks = 0, m;
  while ((m = pRe.exec(xml)) !== null) {
    out += xml.slice(lastIdx, m.index);
    lastIdx = m.index + m[0].length;
    if (esParrafoBlanco(m[0])) {
      consecBlanks++;
      if (consecBlanks <= 1) out += m[0];
    } else {
      consecBlanks = 0;
      out += m[0];
    }
  }
  out += xml.slice(lastIdx);
  return out;
}

// Inserta exactamente 1 blank antes de cada subtítulo N.M. (left=426 o left=851
// según el template), salvo el primero que sigue al título N.
// Corre después de eliminarParrafosVacios y colapsarBlancos.
function ajustarBlancoEntreSubtitulos(xml) {
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const parts = [];
  let m;
  while ((m = re.exec(xml)) !== null) parts.push({ start: m.index, end: re.lastIndex, text: m[0] });

  const isBlank = p => {
    if (p.includes('w:type="page"')) return false;
    const txts = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,''));
    return !txts.length || txts.every(t => t.trim() === '');
  };
  const isTitulo0 = p => {
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'').trim());
    return wts.some(t => /^\d+\.$/.test(t));
  };
  const isSubtitulo = p => {
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'').trim());
    return wts.some(t => /^\d+\.\d+\.$/.test(t));
  };

  const toInsert = [];
  let lastWasTitulo = false;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].text;
    if (isTitulo0(p)) { lastWasTitulo = true; continue; }
    if (isSubtitulo(p)) {
      if (!lastWasTitulo) {
        // Verificar que el párrafo anterior no sea ya un blank
        if (!isBlank(parts[i-1]?.text || '')) {
          toInsert.push(i);
        }
      }
      lastWasTitulo = false;
    } else if (!isBlank(p)) {
      lastWasTitulo = false;
    }
  }

  if (!toInsert.length) return xml;

  let result = xml;
  for (let i = toInsert.length - 1; i >= 0; i--) {
    const idx = toInsert[i];
    result = result.slice(0, parts[idx].start) + BLANK + result.slice(parts[idx].start);
  }
  return result;
}

function ajustarEspaciado(xml) {
  const LANDMARKS = [
    { texto: 'CONDICIONES DE ENSAYO',  blancos: 0 },
    { texto: 'EQUIPAMIENTO UTILIZADO', blancos: 1 },
    { texto: 'RESULTADOS OBTENIDOS',   blancos: 1 },
    { texto: 'EVALUACION DE',          blancos: 1 },
    { texto: 'NOTA',                   blancos: 1 },
    { texto: 'FIN DE INFORME',         blancos: 1 },
  ];
  for (const { texto, blancos } of LANDMARKS) {
    const pos = xml.indexOf(texto);
    if (pos >= 0) xml = ajustarBlancoAntes(xml, pos, blancos);
  }
  return xml;
}

function ajustarBlancoAntes(xml, refPos, count) {
  const paraStart = scanBackForTag(xml, '<w:p', refPos);
  if (paraStart < 0) return xml;
  let before = xml.slice(0, paraStart);
  while (true) {
    const lastClose = before.lastIndexOf('</w:p>');
    if (lastClose < 0) break;
    const lastOpen = scanBackForTag(before, '<w:p', lastClose);
    if (lastOpen < 0) break;
    const para = before.slice(lastOpen, lastClose + '</w:p>'.length);
    if (!esParrafoBlanco(para)) break;
    before = before.slice(0, lastOpen);
  }
  return before + (count > 0 ? '<w:p></w:p>' : '') + xml.slice(paraStart);
}

// Fuerza Calibri 11pt en todo el cuerpo del documento.
function forzarCalibri(xml) {
  const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const RPR   = `<w:rPr>${FONTS}${SZ}</w:rPr>`;
  let result = xml.replace(/<w:rFonts\b[^>]*\/>/g, FONTS);
  result = result.replace(/<w:rPr>(?!<w:rFonts)/g, `<w:rPr>${FONTS}`);
  result = result.replace(/<w:r\b([^>]*)><w:t/g, `<w:r$1>${RPR}<w:t`);
  // Normalizar TODOS los tamaños a 11pt (sz=22) para consistencia visual
  result = result.replace(/<w:sz w:val="\d+"\s*\/>/g,   '<w:sz w:val="22"/>');
  result = result.replace(/<w:szCs w:val="\d+"\s*\/>/g, '<w:szCs w:val="22"/>');
  return result;
}

module.exports = { generarPlegadoDesdeTemplate };
