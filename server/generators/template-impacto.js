const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/impacto.docx');

const MEDIDAS = {
  '10x10x55':  'Medida de probeta: 10 x 10 x 55 mm',
  '10x7.5x55': 'Medida de probeta: 10 x 7,5 x 55 mm',
  '10x5x55':   'Medida de probeta: 10 x 5 x 55 mm',
  '10x2.5x55': 'Medida de probeta: 10 x 2,5 x 55 mm',
  '5x10x55':   'Medida de probeta: 5 x 10 x 55 mm',
  '7.5x10x55': 'Medida de probeta: 7,5 x 10 x 55 mm',
};

// Equipamiento según variante. Las galgas (prefix) se combinan en una sola línea.
// Set de Galdabini — instalado en CABA (péndulo Galdabini MM-409)
const EQUIPO_GALDABINI = [
  { key: 'galdabini',         label: 'Máquina de impacto Galdabini TAG N°MM-409' },
  { key: 'freezer_ee761',     label: 'Ultra freezer TAG N°EE-761' },
  { key: 'controlador_mm021', label: 'Controlador de temperatura digital TAG N°MM-021' },
  { key: 'calibre_mm571',     label: 'Calibre digital TAG N°MM-571' },
  { key: 'calibre_cal570',    label: 'Calibre digital TAG N°CAL-570' },
  { key: 'galgas_771',        label: 'Galgas patrón TAG N°MM-771', prefix: 'MM-771' },
  { key: 'galgas_772',        label: 'Galgas patrón TAG N°MM-772', prefix: 'MM-772' },
  { key: 'galgas_773',        label: 'Galgas patrón TAG N°MM-773', prefix: 'MM-773' },
  { key: 'galgas_775',        label: 'Galgas patrón TAG N°MM-775', prefix: 'MM-775' },
  { key: 'galgas_776',        label: 'Galgas patrón TAG N°MM-776', prefix: 'MM-776' },
  { key: 'proyector_165',     label: 'Proyector de perfiles TAG N°MM-165' },
  { key: 'bano_termo_ee537',  label: 'Baño Termostático TAG N°EE-537' },
  { key: 'termohigro_794',    label: 'Termohigrómetro TAG N°MM-794' },
  { key: 'termohigro_545',    label: 'Termohigrómetro TAG N°PCAL-545' },
  { key: 'termohigro_702',    label: 'Termohigrómetro TAG N°MM-702' },
  { key: 'termohigro_701',    label: 'Termohigrómetro TAG N°MM-701' },
];

// Set de Wolpert — instalado en Neuquén (péndulo Wolpert 300J MM-010)
const EQUIPO_WOLPERT = [
  { key: 'wolpert',           label: 'Péndulo de impacto Wolpert 300J serie 220001/2031 TAG N˚MM-010' },
  { key: 'freezer_pol479',    label: 'Ultra freezer TAG N°POL-479' },
  { key: 'controlador_mm315', label: 'Controlador de temperatura digital TAG N˚MM-315' },
  { key: 'calibre_mm694',     label: 'Calibre digital TAG N˚MM-694' },
  { key: 'termohigro_545',    label: 'Termohigrómetro TAG N°PCAL-545' },
  { key: 'termohigro_702',    label: 'Termohigrómetro TAG N°MM-702' },
  { key: 'termohigro_701',    label: 'Termohigrómetro TAG N°MM-701' },
  { key: 'termohigro_794',    label: 'Termohigrómetro TAG N°MM-794' },
];

// ── Construcción de tabla de resultados dinámica ──────────────────────────────
const _BORD = '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';
const _FONT = '<w:rFonts w:ascii="Calibri" w:eastAsia="MS Mincho" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>';

function escXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function celdaHeaderImpacto(texto, ancho) {
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${_BORD}<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr>${_FONT}<w:b/></w:rPr></w:pPr>` +
    `<w:r><w:rPr>${_FONT}<w:b/></w:rPr><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p></w:tc>`;
}

function celdaDatoImpacto(texto, ancho, vMerge) {
  // vMerge: 'restart' | 'continue' | null
  const merge = vMerge === 'restart' ? '<w:vMerge w:val="restart"/>'
              : vMerge === 'continue' ? '<w:vMerge/>'
              : '';
  const contenido = vMerge === 'continue'
    ? '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:contextualSpacing/><w:jc w:val="center"/></w:pPr></w:p>'
    : `<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:contextualSpacing/><w:jc w:val="center"/><w:rPr>${_FONT}</w:rPr></w:pPr>` +
      `<w:r><w:rPr>${_FONT}</w:rPr><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${_BORD}${merge}<w:vAlign w:val="center"/></w:tcPr>${contenido}</w:tc>`;
}

// Construye el <w:tbl> completo según los grupos y columnas opcionales.
// `grupos` es un array de subgrupos: { label, temperatura, probetas: [{probeta, energia}] }.
// La zona se mergea verticalmente sobre todos los subgrupos consecutivos con
// la misma `label`; la temperatura se mergea sobre las filas del subgrupo.
// Columnas dinámicas: `incluirZona`, `incluirProbeta`, `incluirTemp` — cada
// una aparece solo si al menos una fila trae ese dato cargado en el form.
// La columna "N°" (índice auto) fue REMOVIDA a pedido del laboratorio.
function construirTablaImpacto(grupos, incluirZona, incluirTemp, incluirProbeta) {
  // Anchos por columna (twips)
  const W_PROBETA = 1400, W_ZONA = 2000, W_TEMP = 1900, W_ENERGIA = 2100;
  const cols = [];
  if (incluirZona)    cols.push({ w: W_ZONA });
  if (incluirProbeta) cols.push({ w: W_PROBETA });
  if (incluirTemp)    cols.push({ w: W_TEMP });
  cols.push({ w: W_ENERGIA });
  const totalW = cols.reduce((a, c) => a + c.w, 0);

  // Encabezado
  const headers = [];
  if (incluirZona)    headers.push(celdaHeaderImpacto('Zona', W_ZONA));
  if (incluirProbeta) headers.push(celdaHeaderImpacto('N° probeta', W_PROBETA));
  if (incluirTemp)    headers.push(celdaHeaderImpacto('Temperatura de ensayo (°C)', W_TEMP));
  headers.push(celdaHeaderImpacto('Energía Abs. (Joule)', W_ENERGIA));
  const headerRow = `<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>${headers.join('')}</w:tr>`;

  // Aplanar a lista de filas anotando si cada celda debe ser restart/continue/null.
  // Primero filtramos subgrupos con probetas válidas.
  const subgrupos = grupos.map(g => ({
    label: g.label || '',
    temperatura: g.temperatura != null ? String(g.temperatura) : '',
    probetas: (g.probetas || []).filter(p =>
      (p.energia != null && String(p.energia).trim() !== '') ||
      (incluirTemp && p.temperatura != null && String(p.temperatura).trim() !== '')
    ),
  })).filter(sg => sg.probetas.length > 0);

  // Para zona: contar cuántas filas consecutivas comparten la misma label.
  // En la primera fila de cada bloque de zona: restart; en las siguientes: continue.
  const filaZonaState = [];   // por cada fila, 'restart'|'continue'|null
  let prevZona = null;
  let zonaPrimeraFila = -1;
  let zonaFilasContadas = 0;
  let filaIdx = 0;
  subgrupos.forEach(sg => {
    sg.probetas.forEach(() => {
      if (sg.label !== prevZona) {
        // nueva zona
        prevZona = sg.label;
        zonaPrimeraFila = filaIdx;
        zonaFilasContadas = 1;
        filaZonaState.push({ tipo: 'first', label: sg.label });
      } else {
        zonaFilasContadas++;
        filaZonaState.push({ tipo: 'cont', label: sg.label });
      }
      filaIdx++;
    });
  });
  // Marcar restart si hay >1 fila en el bloque; si es 1 sola, null
  // Recorrer hacia adelante: encontrar bloques de filas con misma zona.
  const zonaMerge = new Array(filaZonaState.length).fill(null);
  let i = 0;
  while (i < filaZonaState.length) {
    let j = i + 1;
    while (j < filaZonaState.length && filaZonaState[j].tipo === 'cont') j++;
    const bloqueLen = j - i;
    if (bloqueLen > 1) {
      zonaMerge[i] = 'restart';
      for (let k = i + 1; k < j; k++) zonaMerge[k] = 'continue';
    } else {
      zonaMerge[i] = null;
    }
    i = j;
  }

  // Filas de datos (sin columna "N°" — removida por pedido del laboratorio).
  const dataRows = [];
  let rowIdx = 0;
  subgrupos.forEach(sg => {
    sg.probetas.forEach((p, pi) => {
      const celdas = [];
      if (incluirZona) {
        const vm = zonaMerge[rowIdx];
        const txt = (vm === 'restart' || vm === null) ? sg.label : '';
        celdas.push(celdaDatoImpacto(txt, W_ZONA, vm));
      }
      if (incluirProbeta) {
        celdas.push(celdaDatoImpacto(String(p.probeta || ''), W_PROBETA, null));
      }
      if (incluirTemp) {
        // Temperatura: vMerge sobre las filas del subgrupo
        const vmT = sg.probetas.length > 1 ? (pi === 0 ? 'restart' : 'continue') : null;
        const tempTxt = pi === 0 ? (sg.temperatura || p.temperatura || '') : '';
        celdas.push(celdaDatoImpacto(tempTxt, W_TEMP, vmT));
      }
      celdas.push(celdaDatoImpacto(p.energia || '', W_ENERGIA, null));
      dataRows.push(`<w:tr><w:trPr><w:trHeight w:val="284"/><w:jc w:val="center"/></w:trPr>${celdas.join('')}</w:tr>`);
      rowIdx++;
    });
  });

  const grid = cols.map(c => `<w:gridCol w:w="${c.w}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${totalW}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>` +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${headerRow}${dataRows.join('')}</w:tbl>`;
}

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

function generarImpactoDesdeTemplate(ot, datos, fotosCaratula) {
  // ── Filtro multi-OT: si datos._filtro_ot está seteado, solo emitir las
  // filas cuyo `nro_ot_override` matchea (o vacío/default para la OT del
  // ensayo). El word-generator llama a este template una vez por cada OT del
  // registro con `_filtro_ot` seteado.
  if (datos && datos._filtro_ot != null) {
    const otFiltro = String(datos._filtro_ot);
    const esOtDelEnsayo = otFiltro === String(ot.nro_ot || '');
    const filtrarArr = (arr) => (Array.isArray(arr) ? arr : []).filter(p => {
      const ov = String((p && p.nro_ot_override) || '').trim();
      const perteneceA = ov || String(ot.nro_ot || '');
      return perteneceA === otFiltro || (esOtDelEnsayo && !ov);
    });
    datos = Object.assign({}, datos);
    if (Array.isArray(datos.resultados)) datos.resultados = filtrarArr(datos.resultados);
  }

  // ── Aplicar textos_por_ot para la OT actual. Cada OT guarda sus propios
  // textos de evaluación; si el mapa está presente, sobrescribimos los
  // campos raíz con los de la OT actual antes de emitir.
  if (datos && datos.textos_por_ot && typeof datos.textos_por_ot === 'object') {
    const nroOtActual = String(ot.nro_ot || '');
    const textosOt = datos.textos_por_ot[nroOtActual];
    if (textosOt) {
      datos = Object.assign({}, datos);
      ['evaluacion_texto'].forEach(k => {
        if (textosOt[k] !== undefined && String(textosOt[k]).trim() !== '') {
          datos[k] = textosOt[k];
        }
      });
    }
  }

  // ── Aplicar condiciones_por_ot: overrides de norma/código para la OT que
  // se está emitiendo. Los overrides se pasan como flags internos que los
  // constructores de líneas de abajo consultan; si están vacíos, se usa el
  // valor global.
  if (datos && datos.condiciones_por_ot && typeof datos.condiciones_por_ot === 'object') {
    const nroOtActualCond = String(ot.nro_ot || '');
    const condOt = datos.condiciones_por_ot[nroOtActualCond];
    if (condOt) {
      datos = Object.assign({}, datos);
      if (condOt.norma_ensayo_ot && String(condOt.norma_ensayo_ot).trim()) {
        datos._norma_ensayo_override = String(condOt.norma_ensayo_ot).trim();
      }
      if (condOt.codigo_referencia_ot && String(condOt.codigo_referencia_ot).trim()) {
        datos._codigo_referencia_override = String(condOt.codigo_referencia_ot).trim();
      }
    }
  }

  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  const equipo = datos.equipamiento || {};
  const variante = datos.variante === 'caba' ? 'caba' : 'neuquen';
  // Grupos: el form guarda `resultados: [{probeta, zona, temperatura, energia}]`.
  // Sub-agrupar por (zona, temperatura) manteniendo el orden de aparición.
  // Cada subgrupo: { label: zona, temperatura, probetas: [{ energia }] }.
  // Esto permite que en la tabla la zona se mergee sobre todos los subgrupos
  // contiguos con la misma zona, y la temperatura se mergee dentro del set.
  let grupos;
  const filasRaw = Array.isArray(datos.resultados) ? datos.resultados
    : (Array.isArray(datos.grupos) ? datos.grupos.flatMap(g =>
        (g.probetas || []).map(p => ({
          zona: g.label || '',
          temperatura: p.temperatura || g.temperatura || '',
          energia: p.energia || '',
        }))) : []);
  {
    const acumulador = {};   // "zona||temp" → { label, temperatura, probetas }
    const orden = [];
    filasRaw.forEach(r => {
      const zona = (r && r.zona ? String(r.zona).trim() : '');
      const temp = (r && r.temperatura != null ? String(r.temperatura).trim() : '');
      const key = zona + '||' + temp;
      if (!acumulador[key]) {
        acumulador[key] = { label: zona, temperatura: temp, probetas: [] };
        orden.push(key);
      }
      acumulador[key].probetas.push({
        energia: r.energia || '',
        probeta: (r && r.probeta != null) ? String(r.probeta).trim() : '',
      });
    });
    grupos = orden.map(k => acumulador[k]);
  }

  // ── Condiciones de ensayo ─────────────────────────────────────────────────
  // Estructura del preinforme físico (FM-039): metodología ITM + checkboxes
  // ISO 148-1 / ASTM E23 / DIN EN 10045 + campo libre "otra norma" + `norma_ensayo`
  // legacy (dropdown con opción "otra") + Metodología editable.
  const normaEnsayoLegacy = datos.norma_ensayo === 'otra'
    ? (datos.norma_ensayo_otra || '')
    : (datos.norma_ensayo || '');
  const normaLibre  = (datos.norma || '').trim();
  const metodologia = (datos.metodologia || '').trim();
  const normas = [];
  const seen = new Set();
  function pushDedup(linea) {
    // Dedup basado en el texto normalizado (case/espacios). El agente-mapeo
    // v2→v1 copia `norma` a `norma_ensayo`, lo que generaría duplicados si no
    // filtramos.
    const key = String(linea).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) { seen.add(key); normas.push(linea); }
  }
  // Sufijo de año opcional (ej. ":2016", "-23a"). Si el usuario no puso
  // guión o dos puntos al inicio, agregamos el guión por defecto.
  function sufAnio(key) {
    var v = String(datos[`${key}_year`] || '').trim();
    if (!v) return '';
    return (v[0] === '-' || v[0] === ':') ? v : '-' + v;
  }
  // Agrupador por probeta (mismo patrón que tracción). Recibe una etiqueta y
  // un key. Devuelve [] si no hay valores; una sola línea "Etiqueta: valor"
  // si todas las probetas tienen el mismo valor; "Etiqueta: A (M1, M3); B (M2)"
  // si difieren.
  function agruparPorProbeta(etiqueta, key) {
    const filas = Array.isArray(datos.resultados) ? datos.resultados : [];
    const items = filas.map((r, i) => {
      const raw = String((r && r[key]) || '').trim();
      const nombre = (r && String(r.nombre || '').trim()) || `M${i + 1}`;
      return { nombre, valor: raw };
    }).filter(x => x.valor);
    if (items.length === 0) return [];
    const grupos = new Map();
    items.forEach(x => {
      if (!grupos.has(x.valor)) grupos.set(x.valor, []);
      grupos.get(x.valor).push(x.nombre);
    });
    const valores = Array.from(grupos.keys());
    if (valores.length === 1) return [`${etiqueta}: ${valores[0]}`];
    const partes = valores.map(v => `${v} (${grupos.get(v).join(', ')})`);
    return [`${etiqueta}: ${partes.join('; ')}`];
  }

  // Orden CONDICIONES: Norma de ensayo primero, Metodología al final.
  // Prioridad:
  //   1) Si hay filas de resultados[] con `norma` cargada → agrupamos por
  //      probeta (ignora los checkboxes globales).
  //   2) Si no → checkboxes/texto libre globales.
  //   3) Override multi-OT (compat con `_norma_ensayo_override`) sigue como
  //      escape hatch cuando lo setea condiciones_por_ot.
  const normasPorProbeta = agruparPorProbeta('Norma de ensayo', 'norma');
  if (normasPorProbeta.length > 0) {
    normasPorProbeta.forEach(pushDedup);
  } else if (datos._norma_ensayo_override) {
    pushDedup(`Norma de ensayo: ${datos._norma_ensayo_override}`);
  } else {
    if (datos.norma_iso148_1)    pushDedup(`Norma de ensayo: ISO 148-1${sufAnio('norma_iso148_1')}`);
    if (datos.norma_astm_e23)    pushDedup(`Norma de ensayo: ASTM E23${sufAnio('norma_astm_e23')}`);
    if (datos.norma_din_10045)   pushDedup(`Norma de ensayo: DIN EN 10045${sufAnio('norma_din_10045')}`);
    if (normaEnsayoLegacy)       pushDedup(`Norma de ensayo: ${normaEnsayoLegacy}`);
    if (normaLibre)              pushDedup(`Norma de ensayo: ${normaLibre}`);
  }
  if (metodologia)               pushDedup(`Metodología de ensayo: ${metodologia}`);
  const normas_seleccionadas_linea = normas.length ? normas.join('\n') : '__SECTION_HIDE__';

  // Códigos de referencia. Prioridad:
  //   1) Filas de resultados[] con `codigo_referencia` cargado → agrupamos por
  //      probeta.
  //   2) Override multi-OT `_codigo_referencia_override`.
  //   3) Checkboxes globales + codigos extra.
  const codigos = [];
  const codsPorProbeta = agruparPorProbeta('Código de referencia', 'codigo_referencia');
  if (codsPorProbeta.length > 0) {
    codsPorProbeta.forEach(l => codigos.push(l));
  } else if (datos._codigo_referencia_override) {
    codigos.push(`Código de referencia: ${datos._codigo_referencia_override}`);
  } else {
    if (datos.cod_asme)    codigos.push(`Código de referencia: ASME BPVC Sección IX Ed.${datos.ed_asme || '2025'}`);
    if (datos.cod_api1104) codigos.push('Código de referencia: API 1104 Ed.22-2021 (E1-2023)');
    if (datos.cod_api5l)   codigos.push('Código de referencia: API 5L');
    if (datos.cod_aws_d11) codigos.push('Código de referencia: AWS D1.1/D1.1M-2020');
    if (datos.cod_extra) {
      String(datos.cod_extra).split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(linea => {
        codigos.push(/^c[oó]digo de referencia\s*:/i.test(linea) ? linea : `Código de referencia: ${linea}`);
      });
    }
  }
  const codigo_referencia_linea = codigos.length ? codigos.join('\n') : '__SECTION_HIDE__';

  // Temperatura — admite "Ambiente"/"AMB" (sin °C) o un número
  let temperatura_ensayo_linea = '__SECTION_HIDE__';
  if (datos.temperatura !== '' && datos.temperatura != null) {
    const sufijo = datos.temp_acreditada ? '   TEMP ACREDITADA: de -80°C a 50°C' : '';
    const t = String(datos.temperatura).trim();
    const esNumero = /^-?\d+([.,]\d+)?$/.test(t);
    temperatura_ensayo_linea = esNumero
      ? `Temperatura de ensayo: ${t} °C${sufijo}`
      : `Temperatura de ensayo: ${t}${sufijo}`;
  }

  // Medida de probeta (con opción "otra")
  // Formatear "10x7.5x55" → "10 x 7,5 x 55 mm" (espacios y "mm" final).
  // Respeta strings que ya vengan bien formateados.
  function formatearMedida(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    // Reemplazar "x" o "×" por " x " con espacios (dedup si ya hay espacios).
    s = s.replace(/\s*[xX×]\s*/g, ' x ');
    // Punto decimal → coma (formato local).
    s = s.replace(/(\d)\.(\d)/g, '$1,$2');
    // Agregar " mm" al final si no lo tiene.
    if (!/mm\s*$/i.test(s)) s = s + ' mm';
    return s;
  }
  let medida_probeta_linea = '__SECTION_HIDE__';
  if (datos.medida_probeta === 'otra' && datos.medida_probeta_otra) {
    medida_probeta_linea = `Medida de probeta: ${formatearMedida(datos.medida_probeta_otra)}`;
  } else if (datos.medida_probeta) {
    medida_probeta_linea = MEDIDAS[datos.medida_probeta] || `Medida de probeta: ${formatearMedida(datos.medida_probeta)}`;
  }

  // Entalla
  let entalla_linea = '__SECTION_HIDE__';
  if (datos.entalla) {
    const esU = datos.entalla === 'U';
    entalla_linea = `Entalla: Charpy "${datos.entalla}"${esU ? '    (NO ACREDITADO)' : ''}`;
  }

  // Orientación (dropdown con opción "otra")
  const orientacionVal = datos.orientacion === 'otra'
    ? (datos.orientacion_otra || '')
    : (datos.orientacion || '');
  const orientacion_probeta_linea = orientacionVal
    ? `Orientación de las probetas: ${orientacionVal}`
    : '__SECTION_HIDE__';

  // Probetas mecanizadas por cliente
  const mecanizadas_cliente_linea = datos.prob_cliente
    ? 'Probetas mecanizadas por el cliente'
    : '__SECTION_HIDE__';

  // Probeta extraída de cupón soldado
  const extraidas_cupon_linea = datos.prob_cupon_soldado
    ? 'Probeta extraída de cupón soldado'
    : '__SECTION_HIDE__';

  // Energía informada (usada en campo radio_impactador_linea del template)
  const radio_impactador_linea = datos.energia_informada
    ? `Energía informada: ${datos.energia_informada}`
    : '__SECTION_HIDE__';

  // ── Equipamiento ──────────────────────────────────────────────────────────
  // Set de equipos según variante (Neuquén = Galdabini, CABA = Wolpert)
  // CABA tiene Galdabini, Neuquén tiene Wolpert (corregido — antes estaba al revés)
  const EQUIPO = variante === 'caba' ? EQUIPO_GALDABINI : EQUIPO_WOLPERT;

  // Override de TAG por equipo si el usuario cargó `equipamiento_tags[key]`.
  const equipTags = datos.equipamiento_tags || {};
  function labelConTagUsuario(e) {
    const t = equipTags[e.key];
    if (t == null || String(t).trim() === '') return e.label;
    const tagUser = String(t).trim();
    // Reemplaza el TAG N°XXX (o TAG N˚XXX) por el TAG del usuario.
    return e.label.replace(/TAG\s*N[°˚º]?\s*[A-Z]+-?[\w-]+/i, 'TAG N°' + tagUser);
  }

  // Galgas: combinar las seleccionadas en una sola línea ("TAG N°MM-771/MM-772").
  // Cada galga puede tener TAG editable desde el form.
  const galgas_seleccionadas = EQUIPO
    .filter(e => e.prefix && equipo[e.key])
    .map(e => {
      const t = equipTags[e.key];
      return (t && String(t).trim()) ? String(t).trim() : e.prefix;
    });
  const galgas_linea = galgas_seleccionadas.length
    ? `Galgas patrón TAG N°${galgas_seleccionadas.join('/')}`
    : null;

  const primerGalgaKey = EQUIPO.find(x => x.prefix && equipo[x.key])?.key;
  const listaEquipos = [];

  // Equipos extra del catálogo (DB, agregados desde el form via equipamiento_extra)
  if (Array.isArray(datos.equipamiento_extra)) {
    datos.equipamiento_extra.forEach(function (e) {
      if (e && (e.nombre || e.label)) listaEquipos.push(e.nombre || e.label);
    });
  }
  for (const e of EQUIPO) {
    if (e.prefix) {
      if (galgas_seleccionadas.length && e.key === primerGalgaKey) {
        listaEquipos.push(galgas_linea);
      }
    } else if (equipo[e.key]) {
      listaEquipos.push(labelConTagUsuario(e));
    }
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => listaEquipos.push(l));
  const equipSlots = {};
  for (let i = 1; i <= 6; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquipos[i - 1] || '__SECTION_HIDE__';
  }

  // ── Resultados: tabla dinámica ─────────────────────────────────────────────
  // Columnas ZONA y N° PROBETA aparecen SOLO si al menos una fila del form
  // las trae cargadas. Si están vacías en todas las filas, la columna se
  // omite del Word — regla pedida por el técnico para no generar columnas
  // ruidosas.
  const algunaConZonaResultados = Array.isArray(datos.resultados) && datos.resultados.some(function (r) {
    return r && r.zona != null && String(r.zona).trim() !== '';
  });
  const algunaConZonaGrupos = grupos.some(g => String(g.label || '').trim() !== '');
  const algunaConZona = algunaConZonaResultados || algunaConZonaGrupos;
  const incluirZona = (datos.incluir_zona === false) ? false
                    : (datos.incluir_zona === true ? true : algunaConZona);
  const algunaConProbeta = Array.isArray(datos.resultados) && datos.resultados.some(function (r) {
    return r && r.probeta != null && String(r.probeta).trim() !== '';
  });
  const incluirProbeta = (datos.incluir_probeta === false) ? false
                       : (datos.incluir_probeta === true ? true : algunaConProbeta);
  // Columna Temperatura: sigue removida como columna. La temperatura sigue
  // apareciendo en la línea "Temperatura de ensayo: X °C" arriba de la tabla.
  const tablaImpactoXml = construirTablaImpacto(grupos, incluirZona, false, incluirProbeta);

  // ── Observaciones / Notas ─────────────────────────────────────────────────
  const lineasObs = [];
  // Notas del preinforme FM-039 Rev. 06 — cada checkbox del formulario se
  // corresponde con una línea literal en el informe. La nota OAA
  // "Los ensayos marcados con (*)..." se agrega aparte según el estado del ensayo.
  if (datos.nota1) {
    // CABA usa galgas patrón + calibre digital. Neuquén sólo calibre digital
    // (no tiene galgas patrón en su equipamiento).
    const varianteNota = (datos.variante || '').toLowerCase();
    const nota1Texto = varianteNota === 'neuquen'
      ? 'Todas las probetas cumplen con las dimensiones y tolerancias correspondientes verificado mediante utilización de calibre digital.'
      : 'Todas las probetas cumplen con las dimensiones y tolerancias correspondientes verificado mediante utilización de las galgas patrón y calibre digital.';
    lineasObs.push(nota1Texto);
  }
  // Retro-compat: notas viejas que quedaron en la DB de ensayos previos
  if (datos.nota2)              lineasObs.push('Los valores mayores a 138 Joules se encuentran fuera de alcance de acreditación.');
  if (datos.nota3)              lineasObs.push('La temperatura se encuentra fuera del alcance de acreditación.');
  if (datos.nota_subsize)       lineasObs.push('Dimensiones de probeta: "Especimen fuera de alcance de acreditación".');
  // Notas nuevas
  if (datos.nota_evaluaciones)  lineasObs.push('"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA."');
  if (datos.nota_no_conforme)   lineasObs.push('El ítem marcado con (**) corresponde a un trabajo no conforme.');
  if (datos.nota_incertidumbre) lineasObs.push('El cliente desea incorporar el dato de incertidumbre.');
  if (datos.nota_externo)       lineasObs.push('Los resultados marcados con (***) provienen de proveedor externo.');
  // Evaluación libre: alcanza con que el texto esté cargado.
  let evalTxt = String(datos.evaluacion_texto || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '')
    .trim();
  if (evalTxt && datos.tiene_evaluacion !== false) {
    // Si el checkbox de disclaimer NO está marcado por separado, insertamos
    // el heading + disclaimer (comportamiento previo). Si sí está marcado,
    // el disclaimer ya se agregó arriba y solo va el texto.
    if (!datos.nota_evaluaciones) {
      lineasObs.push('');
      lineasObs.push('EVALUACION DE RESULTADOS');
      lineasObs.push('"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA"');
    }
    lineasObs.push(evalTxt);
  }

  // W5: texto OAA separado, en negrita centrado antes de FIN DE INFORME
  const textosOAA = [];
  if (datos.oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  const observaciones_linea = lineasObs.length > 0
    ? lineasObs.join('\n')
    : '__SECTION_HIDE__';

  // ── Imagen ────────────────────────────────────────────────────────────────
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const imagen_recepcion = fotos.length > 0 ? '__IMAGE_HERE__' : '__IMAGE_NONE__';

  // ── Datos del template ────────────────────────────────────────────────────
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  const templateData = {
    // Encabezado de página
    numero_ot:   nroOtBase,
    razon_social: ot.razon_social        || '',
    fecha_generacion: ot.fecha_finalizacion || '',

    // Carátula
    identificacion_muestra:          ot.id_muestra                 || '',
    fecha_recepcion_muestra:         ot.fecha_recepcion             || '',
    fecha_aprobacion_inicio_trabajo: ot.fecha_aprobacion            || '',
    fecha_finalizacion_certificado:  ot.fecha_finalizacion          || '',
    imagen_recepcion,

    // Condiciones
    normas_seleccionadas_linea,
    codigo_referencia_linea,
    temperatura_ensayo_linea,
    medida_probeta_linea,
    entalla_linea,
    orientacion_probeta_linea,
    mecanizadas_cliente_linea,
    extraidas_cupon_linea,
    radio_impactador_linea,

    // Equipamiento
    ...equipSlots,

    // Resultados — la tabla del template se reemplaza completa en post-proceso
    m1_p1: '__TABLA_PLACEHOLDER__', m1_p2: '', m1_p3: '',
    m2_p1: '', m2_p2: '', m2_p3: '',
    m3_p1: '', m3_p2: '', m3_p3: '',

    // Observaciones
    observaciones_linea,
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
  if (datos.oaa) {
    // Estrategia 1: título en un solo <w:t>
    const tituloRe = /(<w:t[^>]*>)(ENSAYO DE IMPACTO)(\*?)(\s*<\/w:t>)/;
    if (tituloRe.test(outXml)) {
      outXml = outXml.replace(tituloRe, function (m, pre, txt, ya, close) {
        return ya === '*' ? m : pre + txt + '*' + close;
      });
    }
  }


  // Reemplazar la tabla del template (la única <w:tbl>) por la tabla dinámica
  outXml = outXml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, tablaImpactoXml);

  outXml = eliminarSeccionesOcultas(outXml);

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'impacto');

  outXml = eliminarParrafosVacios(outXml);
  outXml = forzarCalibri(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = centrarTabla(outXml);
  outXml = negritarFilaEncabezadoTabla(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  outXml = formatearPrefijoNota1(outXml);
  outXml = minimizarUltimoParagrafo(outXml);

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones ───────────────────────────────────────────────────

function eliminarFilasOcultas(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    if (/__HIDE__(?!_)/.test(row)) return '';
    return row;
  });
}

// Remove table rows where ALL value cells are empty (no text at all) — handles template rows with no placeholder
function eliminarFilasSinValor(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    const cells = [...row.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)];
    if (cells.length < 2) return row;
    // Check all cells after the first one for any text content
    const hasValue = cells.slice(1).some(c => /<w:t[\s>]/.test(c[1]));
    if (!hasValue) return '';
    return row;
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
    // Walk backwards removing only blank paragraphs (preserve non-blank section headings)
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

function removerParrafoLiteral(xml, texto) {
  const pos = xml.indexOf(texto);
  if (pos < 0) return xml;
  const pStart = scanBackForTag(xml, '<w:p', pos);
  if (pStart < 0) return xml;
  const pEnd = xml.indexOf('</w:p>', pos);
  if (pEnd < 0) return xml;
  return xml.slice(0, pStart) + xml.slice(pEnd + '</w:p>'.length);
}

function ajustarEspaciado(xml) {
  const LANDMARKS = [
    { texto: 'ENSAYO DE IMPACTO',        blancos: 0 },
    { texto: 'CONDICIONES DE ENSAYO',    blancos: 0 },
    { texto: 'EQUIPAMIENTO UTILIZADO',   blancos: 1 },
    { texto: 'RESULTADOS OBTENIDOS',     blancos: 1 },
    { texto: 'EVALUACION DE RESULTADOS', blancos: 1 },
    { texto: 'NOTA',                     blancos: 1 },
    { texto: 'FIN DE INFORME',           blancos: 1 },
  ];
  for (const { texto, blancos } of LANDMARKS) {
    const pos = xml.indexOf(texto);
    if (pos >= 0) xml = ajustarBlancoAntes(xml, pos, blancos);
  }
  const drawingPos = xml.indexOf('<w:drawing>');
  if (drawingPos >= 0) xml = ajustarBlancoAntes(xml, drawingPos, 1);
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
  const padding = count > 0 ? '<w:p></w:p>' : '';
  return before + padding + xml.slice(paraStart);
}

function centrarTabla(xml) {
  xml = xml.replace(/<\/w:tblPr>/g, (match, offset) => {
    const prevTblPr = xml.lastIndexOf('<w:tblPr', offset);
    if (prevTblPr >= 0 && xml.slice(prevTblPr, offset).includes('<w:jc')) return match;
    return '<w:jc w:val="center"/>' + match;
  });
  let result = '', pos = 0;
  while (pos < xml.length) {
    let tcStart = -1, sp = pos;
    while (sp < xml.length) {
      const idx = xml.indexOf('<w:tc', sp);
      if (idx < 0) break;
      const c = xml[idx + 5];
      if (c === '>' || c === ' ' || c === '\r' || c === '\n') { tcStart = idx; break; }
      sp = idx + 5;
    }
    if (tcStart < 0) { result += xml.slice(pos); break; }
    const tcEnd = xml.indexOf('</w:tc>', tcStart);
    if (tcEnd < 0) { result += xml.slice(pos); break; }
    result += xml.slice(pos, tcStart) + centrarCelda(xml.slice(tcStart, tcEnd + '</w:tc>'.length));
    pos = tcEnd + '</w:tc>'.length;
  }
  return result;
}

function centrarCelda(tcXml) {
  let result = tcXml.replace(/<w:jc\b[^>]*\/>/g, '<w:jc w:val="center"/>');
  // Reemplazar/agregar w:spacing dentro de cada <w:pPr> existente
  result = result.replace(/<w:spacing\b[^/]*\/>/g, '<w:spacing w:after="0" w:before="0"/>');
  result = result.replace(/<\/w:pPr>/g, (match, offset) => {
    const pPrOpen = result.lastIndexOf('<w:pPr', offset);
    const pPrSlice = pPrOpen >= 0 ? result.slice(pPrOpen, offset) : '';
    let prefix = '';
    if (!pPrSlice.includes('<w:jc'))      prefix += '<w:jc w:val="center"/>';
    if (!pPrSlice.includes('<w:spacing')) prefix += '<w:spacing w:after="0" w:before="0"/>';
    return prefix + match;
  });
  result = result.replace(/(<w:p\b[^>]*>)(?!\s*<w:pPr)/g, '$1<w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr>');
  return result;
}

// Pone en negrita todos los textos de la primera fila (encabezado) de cada tabla
function negritarFilaEncabezadoTabla(xml) {
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tbl => {
    const firstRowMatch = tbl.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/);
    if (!firstRowMatch) return tbl;
    const firstRow = firstRowMatch[0];
    let boldedRow = firstRow
      .replace(/<\/w:rPr>/g, (match, offset) => {
        const rPrOpen = firstRow.lastIndexOf('<w:rPr', offset);
        if (rPrOpen >= 0 && firstRow.slice(rPrOpen, offset).includes('<w:b')) return match;
        return '<w:b/><w:bCs/>' + match;
      })
      .replace(/(<w:r\b[^>]*>)(?![\s\S]*?<\/w:rPr>)(<w:t[\s>])/g, '$1<w:rPr><w:b/><w:bCs/></w:rPr>$2');
    return tbl.slice(0, firstRowMatch.index) + boldedRow + tbl.slice(firstRowMatch.index + firstRow.length);
  });
}

function negritarPrimeraColumna(xml) {
  let result = '', pos = 0;
  while (pos < xml.length) {
    let trStart = -1, sp = pos;
    while (sp < xml.length) {
      const idx = xml.indexOf('<w:tr', sp);
      if (idx < 0) break;
      const c = xml[idx + 5];
      if (c === '>' || c === ' ' || c === '\r' || c === '\n') { trStart = idx; break; }
      sp = idx + 5;
    }
    if (trStart < 0) { result += xml.slice(pos); break; }
    const trEnd = xml.indexOf('</w:tr>', trStart);
    if (trEnd < 0) { result += xml.slice(pos); break; }
    result += xml.slice(pos, trStart) + negritarPrimeraCelda(xml.slice(trStart, trEnd + '</w:tr>'.length));
    pos = trEnd + '</w:tr>'.length;
  }
  return result;
}

function negritarPrimeraCelda(trXml) {
  let tcStart = -1, sp = 0;
  while (sp < trXml.length) {
    const idx = trXml.indexOf('<w:tc', sp);
    if (idx < 0) break;
    const c = trXml[idx + 5];
    if (c === '>' || c === ' ' || c === '\r' || c === '\n') { tcStart = idx; break; }
    sp = idx + 5;
  }
  if (tcStart < 0) return trXml;
  const tcEnd = trXml.indexOf('</w:tc>', tcStart);
  if (tcEnd < 0) return trXml;
  return (
    trXml.slice(0, tcStart) +
    negritarTextoEnCelda(trXml.slice(tcStart, tcEnd + '</w:tc>'.length)) +
    trXml.slice(tcEnd + '</w:tc>'.length)
  );
}

function negritarTextoEnCelda(tcXml) {
  let result = tcXml.replace(/<\/w:rPr>/g, (match, offset) => {
    const rPrOpen = tcXml.lastIndexOf('<w:rPr', offset);
    if (rPrOpen >= 0 && tcXml.slice(rPrOpen, offset).includes('<w:b')) return match;
    return '<w:b/><w:bCs/>' + match;
  });
  result = result.replace(/(<w:r\b[^>]*>)(<w:t[\s>])/g, '$1<w:rPr><w:b/><w:bCs/></w:rPr>$2');
  return result;
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

// Post-proceso: encuentra el run que contiene el texto de nota1 ("Todas las
// probetas cumplen con las dimensiones...") y le antepone tres runs con
// "Nota¹: " en negrita. También aplica bold al run donde arranca el texto.
// Reescritura mínima: no toca los <w:br/>, <w:pPr> ni el resto del párrafo,
// evitando corromper el XML cuando el párrafo contiene múltiples runs / breaks.
function formatearPrefijoNota1(xml) {
  const RUN_PROPS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>';
  const prefixRuns =
    `<w:r><w:rPr>${RUN_PROPS}<w:b/><w:bCs/></w:rPr><w:t>Nota</w:t></w:r>` +
    `<w:r><w:rPr>${RUN_PROPS}<w:b/><w:bCs/><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r>` +
    `<w:r><w:rPr>${RUN_PROPS}<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">: </w:t></w:r>`;
  const marcador = 'Todas las probetas cumplen con las dimensiones';
  const runRe = new RegExp('<w:r\\b[^>]*>(?:(?!<w:r\\b)[\\s\\S])*?<w:t[^>]*>[^<]*' + marcador + '[\\s\\S]*?</w:r>');
  return xml.replace(runRe, function (match) {
    // Hacer BOLD el run original que contiene el texto "Todas las probetas...".
    // Si tiene <w:rPr>, injecto <w:b/><w:bCs/> ahí (si no lo tiene ya).
    // Si no tiene <w:rPr>, lo agrego justo después de <w:r>.
    let bold = match;
    if (/<w:rPr>[\s\S]*?<\/w:rPr>/.test(bold)) {
      bold = bold.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (m, inner) => {
        if (/<w:b\s*\/>/.test(inner)) return m; // ya es bold
        return `<w:rPr>${inner}<w:b/><w:bCs/></w:rPr>`;
      });
    } else {
      bold = bold.replace(/^<w:r\b([^>]*)>/, `<w:r$1><w:rPr>${RUN_PROPS}<w:b/><w:bCs/></w:rPr>`);
    }
    return prefixRuns + bold;
  });
}

module.exports = { generarImpactoDesdeTemplate };
