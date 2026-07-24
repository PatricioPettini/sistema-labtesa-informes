'use strict';
// Generador de "Tratamientos Térmicos" (modelo FM-110 Rev. 00).
// Reusa el template base "varios.docx" como esqueleto (mismo encabezado/footer).

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');
const { manejarImagenesCaratula, insertarImagenesEnsayo } = require('./imagenes-caratula-helper');
const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { sentenceCase } = require('../utils/text-helpers');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/tratamientos-termicos.docx');
const MARKER_FIN_ENSAYO = ['Los ensayos marcados con', 'FIN DE INFORME'];

// Equipamiento del preinforme FM-110.
const EQUIPAMIENTO_CATALOGO = [
  { key: 'horno',       label: 'Horno eléctrico con microcontrolador' },
  { key: 'registrador', label: 'Registrador de temperatura' },
];

const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
const SZ_TBL = '<w:sz w:val="20"/><w:szCs w:val="20"/>';
const BORD  = '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';

// Filas fijas de la tabla de ciclos (mismo orden que el preinforme físico).
const CICLO_PARAMS = [
  { key: 'tempInicial',       label: 'Temperatura inicial',                 unit: '°C' },
  { key: 'gradTemp',          label: 'Gradiente de temperatura',            unit: '°C/h' },
  { key: 'tempTratamiento',   label: 'Temperatura de tratamiento',          unit: '°C' },
  { key: 'tiempoTratamiento', label: 'Tiempo de tratamiento a temperatura', unit: 'minutos' },
  { key: 'gradEnfriamiento',  label: 'Gradiente de enfriamiento',           unit: '°C/h' },
  { key: 'tempFinal',         label: 'Temperatura final',                   unit: '°C' },
  { key: 'cantCiclos',        label: 'Cantidad de ciclos',                  unit: '-' },
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function celdaTt(texto, ancho, opts) {
  opts = opts || {};
  const fill = opts.header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
  const b    = opts.bold ? '<w:b/><w:bCs/>' : '';
  const jc   = opts.center ? '<w:jc w:val="center"/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${BORD}${fill}<w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto" w:after="0" w:before="0"/>${jc}</w:pPr>` +
    `<w:r><w:rPr>${FONTS}${b}${SZ_TBL}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p></w:tc>`;
}

// Construye la tabla de ciclos: filas fijas × N columnas dinámicas.
// Retorna '' si no hay datos cargados en ninguna celda.
function construirTablaCiclos(ciclos) {
  if (!ciclos || !Array.isArray(ciclos.nombres) || ciclos.nombres.length === 0) return '';
  const nCiclos = ciclos.nombres.length;
  // ¿Hay al menos un valor cargado?
  let hayDatos = false;
  for (const p of CICLO_PARAMS) {
    const arr = ciclos[p.key] || [];
    for (const v of arr) if (String(v || '').trim() !== '') { hayDatos = true; break; }
    if (hayDatos) break;
  }
  if (!hayDatos) return '';

  const W_DESC = 3600, W_UNIT = 900, W_TOTAL = 8500;
  const W_CICLO = Math.max(500, Math.floor((W_TOTAL - W_DESC - W_UNIT) / nCiclos));
  const gridCols = [
    `<w:gridCol w:w="${W_DESC}"/>`,
    `<w:gridCol w:w="${W_UNIT}"/>`,
    ...ciclos.nombres.map(() => `<w:gridCol w:w="${W_CICLO}"/>`),
  ].join('');

  // Header row 1: DESCRIPCIÓN / UNIDAD / CICLO (colspan)
  const headerRow1 =
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="${W_DESC}" w:type="dxa"/>${BORD}<w:vMerge w:val="restart"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${FONTS}<w:b/>${SZ_TBL}</w:rPr><w:t>DESCRIPCIÓN</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${W_UNIT}" w:type="dxa"/>${BORD}<w:vMerge w:val="restart"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${FONTS}<w:b/>${SZ_TBL}</w:rPr><w:t>UNIDAD</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${W_CICLO * nCiclos}" w:type="dxa"/><w:gridSpan w:val="${nCiclos}"/>${BORD}<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${FONTS}<w:b/>${SZ_TBL}</w:rPr><w:t>CICLO</w:t></w:r></w:p></w:tc>` +
    `</w:tr>`;

  // Header row 2: continuación de descripción/unidad (vMerge) + N° de cada ciclo
  const headerRow2 =
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="${W_DESC}" w:type="dxa"/>${BORD}<w:vMerge/></w:tcPr><w:p/></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${W_UNIT}" w:type="dxa"/>${BORD}<w:vMerge/></w:tcPr><w:p/></w:tc>` +
    ciclos.nombres.map(n => celdaTt(String(n || ''), W_CICLO, { header: true, bold: true, center: true })).join('') +
    `</w:tr>`;

  const dataRows = CICLO_PARAMS.map(p => {
    const valores = (ciclos[p.key] || []).slice(0, nCiclos);
    while (valores.length < nCiclos) valores.push('');
    return `<w:tr>` +
      celdaTt(p.label, W_DESC, { bold: true }) +
      celdaTt(p.unit,  W_UNIT, { center: true }) +
      valores.map(v => celdaTt(String(v == null ? '' : v).trim(), W_CICLO, { center: true })).join('') +
      `</w:tr>`;
  }).join('');

  return `<w:tbl><w:tblPr><w:tblW w:w="${W_TOTAL}" w:type="dxa"/><w:jc w:val="center"/>` +
    `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>` +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${gridCols}</w:tblGrid>${headerRow1}${headerRow2}${dataRows}</w:tbl>`;
}

function pLinea(texto, bold) {
  const b = bold ? '<w:b/><w:bCs/>' : '';
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

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

function construirBloqueEnsayo(datos) {
  const partes = [];

  // Título del ensayo. Los tratamientos térmicos NO son acreditados OAA por
  // defecto — asterisco al final del título.
  const asterisco = datos.oaa === false || datos._es_acreditado !== true ? '*' : '';
  partes.push('<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="426"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="142" w:firstLine="0"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">ENSAYO DE TRATAMIENTO TÉRMICO${asterisco}</w:t></w:r></w:p>`);

  // ── 1. CONDICIONES DE ENSAYO ──────────────────────────────────────────
  partes.push(pHeading('CONDICIONES DE ENSAYO'));

  // Método de ensayo: checkboxes del preinforme físico.
  const metodos = [];
  if (datos.metodo_cliente)  metodos.push('Según indicaciones dadas por el cliente');
  if (datos.metodo_interno)  metodos.push('Procedimiento interno ITMM-040');
  if (metodos.length === 0 && datos.metodo_texto) {
    (datos.metodo_texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => metodos.push(l));
  }
  metodos.forEach(m => partes.push(pLinea('Método de ensayo: ' + m)));

  // Tabla de ciclos (fuente principal en la versión v2 del preinforme).
  const tablaCiclos = construirTablaCiclos(datos.ciclos);
  if (tablaCiclos) {
    partes.push(pBlanco());
    partes.push(tablaCiclos);
  } else {
    // Compat legacy: campos sueltos si no hay tabla de ciclos.
    if (datos.tipo_tratamiento)   partes.push(pLinea('Tipo de tratamiento: ' + datos.tipo_tratamiento));
    if (datos.temperatura)        partes.push(pLinea('Temperatura: ' + datos.temperatura));
    if (datos.tiempo_permanencia) partes.push(pLinea('Tiempo de permanencia: ' + datos.tiempo_permanencia));
    if (datos.medio_enfriamiento) partes.push(pLinea('Medio de enfriamiento: ' + datos.medio_enfriamiento));
  }

  partes.push(pBlanco());

  // ── 2. EQUIPAMIENTO UTILIZADO ─────────────────────────────────────────
  const equipos = [];
  EQUIPAMIENTO_CATALOGO.forEach(e => {
    const marcado = datos[`eq_${e.key}`] || (datos.equipamiento && datos.equipamiento[e.key]);
    if (!marcado) return;
    // Buscar TAG en datos.equipamiento_tags[key] (front nuevo).
    const tag = (datos.equipamiento_tags && datos.equipamiento_tags[e.key]) || '';
    equipos.push(tag ? `${e.label} TAG N°${tag}` : e.label);
  });
  // Extra libre (línea por línea).
  const extra = (datos.equipamiento_extra || '').trim();
  if (extra) {
    extra.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => equipos.push(l));
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => equipos.push(l));
  if (equipos.length) {
    partes.push(pHeading('EQUIPAMIENTO UTILIZADO'));
    equipos.forEach(e => partes.push(pLinea(e)));
    partes.push(pBlanco());
  }

  // ── 3. RESULTADOS OBTENIDOS ───────────────────────────────────────────
  const conclusiones = [];
  if (datos.res_tratada) {
    conclusiones.push('La muestra fue tratada térmicamente y queda en condiciones para realizar los mecanizados y posteriores ensayos físicos.');
  }
  const resultadoTxt = sentenceCase((datos.resultado_texto || '').trim());
  if (resultadoTxt) {
    resultadoTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => conclusiones.push(l));
  }
  const adj = String(datos.adjunta_grafico || '').toUpperCase();
  if (adj === 'SI') conclusiones.push('Se adjunta gráfico del tratamiento.');
  else if (adj === 'NO') conclusiones.push('No se adjunta gráfico del tratamiento.');
  const rutaG = (datos.ruta_g || '').trim();
  if (rutaG) conclusiones.push('Ruta G: ' + rutaG);

  if (conclusiones.length) {
    partes.push(pHeading('RESULTADOS OBTENIDOS'));
    conclusiones.forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  // ── 4. OBSERVACIONES ─────────────────────────────────────────────────
  const obsTxt = (datos.observaciones || '').trim();
  if (obsTxt) {
    partes.push(pHeading('OBSERVACIONES'));
    obsTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  return partes.join('');
}

function generarTratamientosTermicosDesdeTemplate(ot, datos, fotosCaratula) {
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

  const bloque = construirBloqueEnsayo(datos);
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?__ENSAYO_VARIOS__(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, bloque);

  // OAA — tratamientos térmicos generalmente están fuera del alcance OAA.
  const textosOAA = [];
  if (datos.oaa !== false) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);

  // Imágenes del ensayo — se usa el mismo mecanismo (imagenes_resultado).
  // El campo `imagen_grafico` (single) también se acepta como equivalente.
  let imgs = [];
  if (Array.isArray(datos.imagenes_resultado)) imgs = imgs.concat(datos.imagenes_resultado);
  if (datos.imagen_grafico) imgs.push(datos.imagen_grafico);
  const fotosEnsayo = imgs.map(p => {
    if (!p) return null;
    const url = typeof p === 'string' ? p : p.dataUrl;
    if (!url) return null;
    const b64 = url.replace(/^data:[^;]+;base64,/, '');
    return { buffer: Buffer.from(b64, 'base64'), caption: (typeof p === 'object' && p.caption) || 'Gráfico del tratamiento térmico', name: (typeof p === 'object' && p.name) || '' };
  }).filter(x => x && x.buffer);
  if (fotosEnsayo.length > 0) {
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosEnsayo, 'tratamientos-termicos', MARKER_FIN_ENSAYO, 'before');
  }

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'tratamientos-termicos');

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

module.exports = { generarTratamientosTermicosDesdeTemplate };
