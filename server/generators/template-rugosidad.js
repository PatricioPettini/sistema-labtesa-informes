'use strict';
// Generador para Rugosidad (modelo F2 241451).
// Template físico: server/templates/rugosidad.docx (chasis Labtesa + bloque del
// modelo F2). Datos variables vía placeholders; tabla de mediciones por post-proceso.

const PizZip       = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs   = require('fs');
const path = require('path');
const { manejarImagenesCaratula }  = require('./imagenes-caratula-helper');
const { sentenceCase } = require('../utils/text-helpers');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/rugosidad.docx');

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
  if (para.includes('<w:drawing>'))   return false;
  return !/<w:t[\s>]/.test(para);
}
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generarRugosidadDesdeTemplate(ot, datos, fotosCaratula) {
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const esSecundario = fotosCaratula === null;
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  const v = (x, def) => {
    if (x == null) return def;
    const s = String(x).trim();
    return s === '' ? def : s;
  };

  // Helper para placeholders de línea entera: si el dato está vacío, oculta el
  // párrafo (__SECTION_HIDE__).
  const lineaOrHide = (prefix, valor) => {
    const s = (valor == null) ? '' : String(valor).trim();
    return s === '' ? '__SECTION_HIDE__' : `${prefix}${s}`;
  };

  const templateData = {
    numero_ot:          nroOtBase,
    razon_social:       ot.razon_social       || '',
    fecha_generacion:   ot.fecha_finalizacion || '',
    id_muestra:         ot.id_muestra         || '',
    fecha_recepcion:    ot.fecha_recepcion    || '',
    fecha_aprobacion:   ot.fecha_aprobacion   || '',
    fecha_finalizacion: ot.fecha_finalizacion || '',
    imagen_placeholder: fotos.length > 0 ? '__IMAGE_CARATULA__' : '__IMAGE_NONE__',

    // OAA: el laboratorio NO está acreditado en rugosidad, así que siempre
    // se marca como fuera del alcance (asterisco + línea OAA fijos).
    asterisco_oaa: '*',
    oaa_linea: '"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."',

    // Líneas opcionales: si el dato del form está vacío, el párrafo se oculta
    norma_1_linea:           lineaOrHide('Norma de ensayo: ', datos.norma_1),
    metodologia_linea:       datos.itm_numero
      ? `Metodología de ensayo: ITM N°${String(datos.itm_numero).trim()}`
      : lineaOrHide('Metodología de ensayo: ', datos.metodologia),
    sentido_medicion_linea:  lineaOrHide('Sentido de medición: ', datos.sentido_medicion),
    valor_requerido_linea:   datos.valor_requerido
      ? `Valor requerido: ${String(datos.valor_requerido).trim()} µm máximo`
      : '__SECTION_HIDE__',
    cantidad_mediciones_linea: datos.cantidad_mediciones
      ? `Mediciones realizadas: Cantidad ${String(datos.cantidad_mediciones).trim()}`
      : '__SECTION_HIDE__',
    temperatura_linea:       (datos.temperatura != null && String(datos.temperatura).trim() !== '')
      ? `Temperatura de ensayo: ${String(datos.temperatura).trim()}°C`
      : '__SECTION_HIDE__',

    // Resultado obtenido:
    //  - Si el usuario carga `resultado_texto` → se usa eso.
    //  - Si no: si hay mediciones cargadas o formato='expandida' → "Los valores
    //    obtenidos fueron los siguientes:" (porque viene tabla). Si no → frase
    //    "La muestra presenta un valor R{tipo} de {valor} µm."
    resultado_linea: (() => {
      const t = sentenceCase((datos.resultado_texto && String(datos.resultado_texto).trim()) || '');
      if (t) return t;
      const hayMediciones = Array.isArray(datos.mediciones) && datos.mediciones.some(m =>
        m && (m.ra || m.rz || m.rt || m.valor));
      if (hayMediciones || datos.formato_tabla === 'expandida') {
        return 'Los valores obtenidos fueron los siguientes:';
      }
      return `La muestra presenta un valor R${v(datos.tipo_r,'a')} de ${v(datos.valor_rugosidad,'**')} µm.`;
    })(),

    // Evaluación: por default NO aparece. Si datos.eval_texto está cargado,
    // post-render inserta un bloque "EVALUACION DE RESULTADOS" + texto bold.
    evaluacion_heading:      '__SECTION_HIDE__',
    evaluacion_texto_linea:  '__SECTION_HIDE__',

    // R-tipo (Ra, Rz, Rt, Rq, ...). Por default Ra.
    tipo_r:              v(datos.tipo_r,             'a'),
    valor_rugosidad:     v(datos.valor_rugosidad,    '**'),
    valor_max_eval:      v(datos.valor_max_eval,     '*****'),
  };

  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip     = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
    delimiters:    { start: '{{', end: '}}' },
    nullGetter:    () => '',
  });
  doc.render(templateData);

  const processedZip = doc.getZip();
  let outXml = processedZip.files['word/document.xml'].asText();

  // Eliminar párrafos cuyo placeholder vino como __SECTION_HIDE__
  outXml = eliminarSeccionesOcultas(outXml);

  // Inyectar tabla de mediciones según el formato elegido
  const formatoTabla = datos.formato_tabla === 'expandida' ? 'expandida' : 'simple';
  outXml = inyectarTablaMediciones(outXml, datos.mediciones || [], templateData.tipo_r, formatoTabla);

  // "OTROS EQUIPOS" del form: inyectar líneas antes de "RESULTADOS OBTENIDOS"
  {
    const lineasOtros = formatearOtrosEquipos(datos);
    if (lineasOtros.length) {
      const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
      const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
      const parrafos = lineasOtros.map(l =>
        '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
        '<w:ind w:left="851"/></w:pPr>' +
        `<w:r><w:rPr>${fonts}${sz}</w:rPr>` +
        `<w:t xml:space="preserve">${escapeXml(l)}</w:t></w:r></w:p>`
      ).join('');
      const refPos = outXml.indexOf('RESULTADOS OBTENIDOS');
      if (refPos >= 0) {
        const pStart = scanBackForTag(outXml, '<w:p', refPos);
        if (pStart >= 0) outXml = outXml.slice(0, pStart) + parrafos + outXml.slice(pStart);
      }
    }
  }

  // NOTA opcional
  if (datos.tiene_nota && (datos.nota_texto || '').trim()) {
    outXml = insertarBloqueHeading(outXml, 'NOTA', datos.nota_texto.trim());
  }

  // EVALUACION opcional: solo si datos.eval_texto cargado. Si no, no aparece
  // el heading "EVALUACION DE RESULTADOS" ni el texto en el Word.
  if ((datos.eval_texto || '').trim()) {
    outXml = insertarBloqueHeading(outXml, 'EVALUACION DE RESULTADOS', datos.eval_texto.trim());
  }

  outXml = eliminarParrafosVacios(outXml);
  outXml = forzarCalibri(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = minimizarUltimoParagrafo(outXml);
  if (esSecundario) outXml = eliminarBlancosTrasUltimoContenido(outXml);

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'rugosidad');

  ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'].forEach(hdrPath => {
    const entry = processedZip.files[hdrPath];
    if (!entry) return;
    let hdrXml = entry.asText()
      .replace(/\{\{razon_social\}\}/g,     templateData.razon_social)
      .replace(/\{\{numero_ot\}\}/g,        templateData.numero_ot)
      .replace(/\{\{fecha_generacion\}\}/g, templateData.fecha_generacion);
    processedZip.file(hdrPath, hdrXml);
  });

  processedZip.file('word/document.xml', outXml);

  delete processedZip.files['word/numbering.xml'];
  const relsPath = 'word/_rels/document.xml.rels';
  if (processedZip.files[relsPath]) {
    let relsXml = processedZip.files[relsPath].asText();
    relsXml = relsXml.replace(/<Relationship[^>]*numbering[^>]*\/>/g, '');
    processedZip.file(relsPath, relsXml);
  }
  const ctPath = '[Content_Types].xml';
  if (processedZip.files[ctPath]) {
    let ctXml = processedZip.files[ctPath].asText();
    ctXml = ctXml.replace(/<Override[^>]*numbering[^>]*\/>/g, '');
    processedZip.file(ctPath, ctXml);
  }

  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Tabla de mediciones ──────────────────────────────────────────────────────
// Reemplaza la tabla del template por una construida desde cero según el
// formato y mediciones del form.
//   formato='simple':    Muestra | Rugosidad\nR<tipo> (µm)   ← tabla del modelo F2 (2 cols)
//   formato='expandida': Muestra N° | Ra | Rz | Rt           ← tabla del informe 534725
function inyectarTablaMediciones(xml, mediciones, tipoR, formato) {
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tabla => {
    if (!/Rugosidad/.test(tabla) || !/µm/.test(tabla)) return tabla;
    return construirTablaRugosidad(mediciones || [], tipoR, formato);
  });
}

function construirTablaRugosidad(mediciones, tipoR, formato) {
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const cellPr = (w) => `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>`;
  const par = (txt, bold = false) =>
    '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}${bold ? '<w:b/>' : ''}${sz}</w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r></w:p>`;
  const cell = (w, txt, bold) => `<w:tc>${cellPr(w)}${par(txt, bold)}</w:tc>`;
  const row  = (cells) => `<w:tr>${cells.join('')}</w:tr>`;

  let headers, gridCols, filas;

  if (formato === 'expandida') {
    // Tabla: Muestra N° | Ra | Rz | Rt
    gridCols = [1600, 1600, 1600, 1600];
    headers  = [{ texto: 'Muestra N°' }, { texto: 'Ra' }, { texto: 'Rz' }, { texto: 'Rt' }];
    filas = mediciones.map((m, i) => row([
      cell(1600, String(m.muestra || (i + 1)), false),
      cell(1600, m.ra  != null ? String(m.ra)  : '', false),
      cell(1600, m.rz  != null ? String(m.rz)  : '', false),
      cell(1600, m.rt  != null ? String(m.rt)  : '', false),
    ]));
  } else {
    // Tabla simple: Muestra | Rugosidad\nR<tipo> (µm)  (2 columnas)
    gridCols = [2850, 2850];
    // Header con dos líneas: "Rugosidad" arriba y "R<tipo> (µm)" abajo.
    headers  = [
      { texto: 'Muestra' },
      { texto: ['Rugosidad', `R${tipoR} (µm)`] },
    ];
    filas = mediciones.map((m, i) => row([
      cell(2850, String(m.muestra || `Mtra. ${i + 1}`), false),
      cell(2850, m.valor != null ? String(m.valor) : '', false),
    ]));
  }

  const grid = '<w:tblGrid>' + gridCols.map(w => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
  // Celda header: soporta { texto: 'x' } (1 párrafo) o { texto: ['a','b'] } (varios párrafos).
  const cellHeader = (w, def) => {
    const lineas = Array.isArray(def.texto) ? def.texto : [def.texto];
    const parrafos = lineas.map(l => par(l, true)).join('');
    return `<w:tc>${cellPr(w)}${parrafos}</w:tc>`;
  };
  const filaHeader = row(headers.map((h, i) => cellHeader(gridCols[i], h)));

  return '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>' +
    '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '</w:tblBorders></w:tblPr>' +
    grid + filaHeader + filas.join('') +
    '</w:tbl>';
}

function reemplazarEvaluacion(xml, nuevoTexto) {
  // Busca el párrafo que empieza con "Luego de realizadas las mediciones"
  return xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?Luego de realizadas las mediciones[\s\S]*?<\/w:p>/,
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0"/><w:ind w:left="851"/></w:pPr>` +
    `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(nuevoTexto)}</w:t></w:r></w:p>`);
}

function eliminarSeccionesOcultas(xml) {
  const MARKER = '__SECTION_HIDE__';
  let result = xml, pos;
  while ((pos = result.indexOf(MARKER)) >= 0) {
    const pClose = result.indexOf('</w:p>', pos);
    if (pClose < 0) break;
    const end = pClose + '</w:p>'.length;
    const pOpen = scanBackForTag(result, '<w:p', pos);
    if (pOpen < 0) { result = result.slice(0, pos) + result.slice(end); continue; }
    result = result.slice(0, pOpen) + result.slice(end);
  }
  return result;
}

function eliminarParrafosVacios(xml) {
  const pbPos = xml.indexOf('w:type="page"');
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (par, offset, str) => {
    if (par.includes('w:type="page"')) return par;
    if (par.includes('<w:drawing>'))   return par;
    const tTexts = [...par.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const hasTags = tTexts.length > 0 || /<w:t[^>]*\/>/.test(par);
    if (!hasTags || tTexts.every(t => t.trim() === '')) {
      if (pbPos >= 0 && offset < pbPos) return par;
      const rest = str.slice(offset + par.length).replace(/^\s+/, '');
      if (rest.startsWith('</w:tc>')) return par;
      return '';
    }
    return par;
  });
}

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

function minimizarUltimoParagrafo(xml) {
  const bodyEnd = xml.lastIndexOf('</w:body>');
  if (bodyEnd < 0) return xml;
  let before = xml.slice(0, bodyEnd);
  let removed = 0;
  while (true) {
    const lc = before.lastIndexOf('</w:p>');
    if (lc < 0) break;
    const lo = scanBackForTag(before, '<w:p', lc);
    if (lo < 0) break;
    const para = before.slice(lo, lc + '</w:p>'.length);
    if (para.includes('<w:sectPr') || !esParrafoBlanco(para)) break;
    before = before.slice(0, lo) + before.slice(lc + '</w:p>'.length);
    removed++;
  }
  if (removed === 0) return xml;
  const minimal = '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';
  return before + minimal + xml.slice(bodyEnd);
}

function eliminarBlancosTrasUltimoContenido(xml) {
  const finPos = xml.indexOf('FIN DE INFORME');
  if (finPos < 0) return xml;
  const refPStart = xml.lastIndexOf('<w:p', finPos);
  if (refPStart < 0) return xml;
  let result = xml, cursor = refPStart;
  while (true) {
    const prevClose = result.lastIndexOf('</w:p>', cursor - 1);
    if (prevClose < 0) break;
    const prevOpen = result.lastIndexOf('<w:p', prevClose);
    if (prevOpen < 0) break;
    const para = result.slice(prevOpen, prevClose + '</w:p>'.length);
    if (para.includes('w:type="page"') || para.replace(/<[^>]+>/g,'').trim()) break;
    result = result.slice(0, prevOpen) + result.slice(prevClose + '</w:p>'.length);
    cursor = prevOpen;
  }
  return result;
}

function insertarBloqueHeading(xml, headingText, bodyText) {
  if (!bodyText) return xml;
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const heading = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:b/><w:bCs/>${sz}</w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(headingText)}</w:t></w:r></w:p>`;
  const lineas = String(bodyText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const cuerpo = lineas.map(l =>
    '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}${sz}</w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(l)}</w:t></w:r></w:p>`
  ).join('');
  const finPos = xml.indexOf('FIN DE INFORME');
  if (finPos < 0) return xml + heading + cuerpo;
  const pStart = scanBackForTag(xml, '<w:p', finPos);
  if (pStart < 0) return xml;
  return xml.slice(0, pStart) + heading + cuerpo + xml.slice(pStart);
}

module.exports = { generarRugosidadDesdeTemplate };
