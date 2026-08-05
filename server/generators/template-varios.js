'use strict';
// Generador para "Ensayos varios" (modelo FM. 066). Todo el cuerpo del ensayo
// es dinámico: el técnico define el título, las condiciones, el equipamiento,
// los resultados (texto libre + tabla opcional) y la evaluación.

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');
const { manejarImagenesCaratula, insertarImagenesEnsayo } = require('./imagenes-caratula-helper');
const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { sentenceCase } = require('../utils/text-helpers');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/varios.docx');
const MARKER_FIN_ENSAYO = ['Los ensayos marcados con', 'FIN DE INFORME'];

const EQUIPAMIENTO_CATALOGO = [
  { key: 'balanza_003',       label: 'Balanza analítica Shimadzu TAG N°MM-003' },
  { key: 'calibre_571',       label: 'Calibre digital TAG N°MM-571' },
  { key: 'traccion_emic_203', label: 'Máquina de tracción-compresión Emic TAG N°MM-203' },
  { key: 'rigidez_130',       label: 'Equipo de rigidez dieléctrica TAG N°MM-130' },
  { key: 'mufla_020',         label: 'Mufla eléctrica TAG N°MM-020' },
  { key: 'lupa_514',          label: 'Lupa estereoscópica Olympus TAG N°MM-514' },
  { key: 'microscopio_378',   label: 'Microscopio Leica DM 750 TAG N°MM-378' },
  { key: 'termohigro_545',    label: 'Termohigrómetro TAG N°PCAL-545' },
  { key: 'termohigro_700',    label: 'Termohigrómetro TAG N°MM-700' },
  { key: 'termohigro_794',    label: 'Termohigrómetro TAG N°MM-794' },
];

const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
const BORD  = '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pLinea(texto, bold) {
  const b = bold ? '<w:b/><w:bCs/>' : '';
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

// Heading de subsección numerado (N.1, N.2, ...) — mismo estilo que en
// macrografía y metalografía (pStyle=Textosinformato + numPr ilvl=1 numId=16).
function pHeading(texto) {
  return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="851"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="851" w:hanging="425"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t>${esc(texto)}</w:t></w:r></w:p>`;
}

function pBlanco() {
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr></w:p>';
}

// Pie de tabla estilo "Tabla N°1 - <descripción>", cursiva y centrado.
// El "1" es placeholder — `renumerarTablas` de word-generator.js lo reemplaza
// por el número correcto según orden de aparición en el documento combinado.
function pTablaCaption(descripcion) {
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="120" w:before="80"/>' +
    '<w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS}<w:i/><w:iCs/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">Tabla N°1 - ${esc(descripcion)}</w:t></w:r></w:p>`;
}

function celdaTabla(texto, ancho, isHeader) {
  const fill = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
  const b    = isHeader ? '<w:b/><w:bCs/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${BORD}${fill}<w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p></w:tc>`;
}

function construirTablaResultados(headers, filas) {
  if (!Array.isArray(headers) || !headers.length) return '';
  // Conservar headers tal cual (el primero puede ser vacío si funciona como
  // label-col). Solo descartamos si TODOS están vacíos.
  const headers_ = headers.map(h => String(h == null ? '' : h));
  if (headers_.every(h => h.trim() === '')) return '';
  const W_TOTAL = 8500;
  const W = Math.floor(W_TOTAL / headers_.length);
  const gridCols = headers_.map(() => `<w:gridCol w:w="${W}"/>`).join('');
  const headerRow = `<w:tr>${headers_.map(h => celdaTabla(h, W, true)).join('')}</w:tr>`;
  const dataRows = (filas || []).filter(f => Array.isArray(f) && f.some(c => String(c || '').trim() !== ''))
    .map(f => {
      const celdas = headers_.map((_, i) => celdaTabla(f[i] || '', W, false));
      return `<w:tr>${celdas.join('')}</w:tr>`;
    }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${W_TOTAL}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>` +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${gridCols}</w:tblGrid>${headerRow}${dataRows}</w:tbl>`;
}

function construirBloqueEnsayo(datos) {
  const partes = [];

  // Título del ensayo (heading nivel 0, numerado automáticamente con
  // numId=16 — mismo estilo que macrografía/metalografía). Ensayos varios
  // SIEMPRE están fuera del alcance OAA (asterisco siempre presente).
  const titulo = (datos.titulo_ensayo || 'ENSAYO').toString().trim().toUpperCase();
  const asterisco = datos.oaa === false ? '' : '*';
  partes.push('<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="426"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="142" w:firstLine="0"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(titulo)}${asterisco}</w:t></w:r></w:p>`);

  // CONDICIONES DE ENSAYO — texto libre, una línea por condición.
  const condLineas = (datos.condiciones_texto || '')
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const desc = (datos.descripcion_procedimiento || '').trim();
  if (condLineas.length || desc) {
    partes.push(pHeading('CONDICIONES DE ENSAYO'));
    condLineas.forEach(l => partes.push(pLinea(l)));
    if (desc) {
      partes.push(pLinea('Descripción del procedimiento:'));
      desc.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    }
    partes.push(pBlanco());
  }

  // MÉTODO DE ENSAYO — texto libre (norma/método aplicado).
  const metodoLineas = (datos.metodo_texto || '')
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (metodoLineas.length) {
    partes.push(pHeading('MÉTODO DE ENSAYO'));
    metodoLineas.forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  // EQUIPAMIENTO UTILIZADO. Tres fuentes se combinan:
  //   1. `equipos_libres`: array de {nombre, tag} cargado desde el form nuevo.
  //   2. Legacy: flags `eq_<key>` + `equipamiento_extra` (textarea) del form viejo.
  const equipos = [];
  if (Array.isArray(datos.equipos_libres)) {
    datos.equipos_libres.forEach(eq => {
      if (!eq) return;
      const nombre = String(eq.nombre || '').trim();
      const tag    = String(eq.tag || '').trim();
      if (!nombre && !tag) return;
      equipos.push(tag ? `${nombre} TAG N°${tag}` : nombre);
    });
  }
  EQUIPAMIENTO_CATALOGO.forEach(e => {
    if (datos[`eq_${e.key}`] || (datos.equipamiento && datos.equipamiento[e.key])) {
      equipos.push(e.label);
    }
  });
  const extra = (datos.equipamiento_extra || '').trim();
  if (extra) {
    extra.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => equipos.push(l));
  }
  // Bloque "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => equipos.push(l));
  if (equipos.length) {
    partes.push(pHeading('EQUIPAMIENTO UTILIZADO'));
    equipos.forEach(e => partes.push(pLinea(e)));
    partes.push(pBlanco());
  }

  // RESULTADOS OBTENIDOS
  const resultadoTxt = sentenceCase((datos.resultado_texto || '').trim());
  // Tabla dinámica: el técnico definió en el front headers + filas in-place.
  // Estructura: { headers: ['col1', 'col2', ...], filas: [{ label, valores: [..] }, ...] }
  // Si alguna fila tiene `label` cargado, se antepone una columna vacía como
  // label-col al inicio del header (Word la mostrará como la columna izquierda).
  const td = datos.tabla_dinamica || {};
  const headersRaw = Array.isArray(td.headers) ? td.headers : [];
  const filasRaw   = Array.isArray(td.filas)   ? td.filas   : [];
  const hayLabels  = filasRaw.some(f => f && String(f.label || '').trim() !== '');
  // Índices de columnas con header no vacío
  const colIdx = [];
  headersRaw.forEach((h, i) => { if (String(h || '').trim()) colIdx.push(i); });
  // Headers finales: opcional label-col + headers no vacíos
  const headersFinal = (hayLabels ? [''] : []).concat(colIdx.map(i => String(headersRaw[i] || '').trim()));
  // Filas finales: cada fila como array de strings en el orden de headersFinal
  const filas = filasRaw
    .filter(f => f && (String(f.label || '').trim() !== '' ||
                       (f.valores || []).some(v => String(v || '').trim() !== '')))
    .map(f => {
      const row = [];
      if (hayLabels) row.push(f.label || '');
      colIdx.forEach(i => row.push((f.valores || [])[i] || ''));
      return row;
    });
  // La tabla se incluye automáticamente si hay headers y filas con datos.
  // `datos.incluir_tabla === false` queda como override negativo por compat.
  const hayTabla = (datos.incluir_tabla !== false) && headersFinal.length > 0 && filas.length > 0;
  if (resultadoTxt || hayTabla) {
    partes.push(pHeading('RESULTADOS OBTENIDOS'));
    if (resultadoTxt) {
      resultadoTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    }
    if (hayTabla) {
      partes.push(pBlanco());
      partes.push(construirTablaResultados(headersFinal, filas));
      partes.push(pTablaCaption('Resultados obtenidos'));
    }
    partes.push(pBlanco());
  }

  // EVALUACION DE RESULTADOS — sólo si el técnico eligió "INFORMAR: SI"
  // (informar_eval === 'NO' o tiene_evaluacion === false omiten el bloque).
  const evalTxt = (datos.evaluacion_texto || '').trim();
  const informarEval = datos.informar_eval == null
    ? datos.tiene_evaluacion !== false
    : datos.informar_eval !== 'NO';
  if (evalTxt && informarEval) {
    partes.push(pHeading('EVALUACION DE RESULTADOS'));
    partes.push(pLinea('"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA"'));
    evalTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  // MEMORIA ANALÍTICA — sección de referencia (cálculos, archivos, etc.).
  const memoriaLineas = (datos.memoria_texto || '')
    .split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (memoriaLineas.length) {
    partes.push(pHeading('MEMORIA ANALÍTICA'));
    memoriaLineas.forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  return partes.join('');
}

function generarVariosDesdeTemplate(ot, datos, fotosCaratula) {
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  doc.render({
    numero_ot: nroOtBase,
    razon_social: ot.razon_social || '',
    fecha_generacion: ot.fecha_finalizacion || '',
    id_muestra: ot.id_muestra || '',
    fecha_recepcion: ot.fecha_recepcion || '',
    fecha_aprobacion: ot.fecha_aprobacion || '',
    fecha_finalizacion: ot.fecha_finalizacion || '',
    imagen_placeholder: fotos.length > 0 ? '__IMAGE_CARATULA__' : '__IMAGE_NONE__',
  });

  const processedZip = doc.getZip();
  let outXml = processedZip.files['word/document.xml'].asText();

  // Reemplazar __ENSAYO_VARIOS__ por el bloque dinámico
  const bloque = construirBloqueEnsayo(datos);
  // Encontrar el párrafo que contiene __ENSAYO_VARIOS__ y reemplazarlo entero
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?__ENSAYO_VARIOS__(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, bloque);

  // OAA antes de FIN DE INFORME — siempre activo en ensayos varios
  const textosOAA = [];
  if (datos.oaa !== false) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);

  // Imágenes del ensayo
  const fotosEnsayo = Array.isArray(datos.imagenes_resultado)
    ? datos.imagenes_resultado.map(p => {
        if (!p) return null;
        const url = typeof p === 'string' ? p : p.dataUrl;
        if (!url) return null;
        const b64 = url.replace(/^data:[^;]+;base64,/, '');
        return { buffer: Buffer.from(b64, 'base64'), caption: p.caption || '', name: p.name || '' };
      }).filter(x => x && x.buffer)
    : [];
  if (fotosEnsayo.length > 0) {
    const orient = (datos.imagenes_orientacion === 'horizontal' || datos.imagenes_orientacion === 'vertical')
      ? datos.imagenes_orientacion : null;
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosEnsayo, 'varios', MARKER_FIN_ENSAYO, 'before', 200, {
      layout: orient,
      maxAnchoCm: 15,
      maxAltoCm: 15.7,
    });
  }

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'varios');

  // Headers
  ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'].forEach(hdrPath => {
    const entry = processedZip.files[hdrPath];
    if (!entry) return;
    let hdrXml = entry.asText()
      .replace(/\{\{razon_social\}\}/g, ot.razon_social || '')
      .replace(/\{\{numero_ot\}\}/g, nroOtBase)
      .replace(/\{\{fecha_generacion\}\}/g, ot.fecha_finalizacion || '');
    processedZip.file(hdrPath, hdrXml);
  });

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generarVariosDesdeTemplate };
