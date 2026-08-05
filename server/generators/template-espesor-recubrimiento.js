'use strict';
// Generador para "Espesor de Recubrimiento Metalográfico" (modelo FM-074).
// Modelo de referencia: "F2. 248033-Espesor de Recubrimiento Metalografico
// LAB + PLAN B 2014.doc". Multi-OT: cada OT recibe SU ensayo con SUS
// mediciones + sector (el saver split multi-OT ya lo divide antes de llegar
// acá). La tabla del Word muestra min/max/promedio (calculados) para la OT
// del ensayo. Reutiliza el template genérico `varios.docx`.

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');
const { manejarImagenesCaratula, insertarImagenesEnsayo } = require('./imagenes-caratula-helper');
const { insertarOAAAntesDeFin, garantizarBlancosAntesFin } = require('./oaa-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/varios.docx');
const MARKER_FIN_ENSAYO = ['Los ensayos marcados con', 'FIN DE INFORME'];

const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
const BORD  = '<w:tcBorders>' +
  '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
  '</w:tcBorders>';

// Catálogo de equipos del form (key → nombre, tagDefault). El nombre se usa
// en el Word tal cual está declarado acá (respeta capitalización sentence-case).
const EQUIPOS = [
  ['leica_378',      'Microscopio Leica DM 750', 'MM-378'],
  ['termo_700',      'Termohigrómetro',          'MM-700'],
  ['termo_pcal_545', 'Termohigrómetro',          'PCAL-545'],
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Alineado con metalografía-general: sub-heading "1.1"/"1.2"/... con número
// a 426 (851 - 425 hanging), texto a 851.
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
function pSeccionHeading(texto) {
  return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="851"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="851" w:hanging="425"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}
function pBlanco() {
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr></w:p>';
}

function celdaTablaResult(texto, ancho, isHeader, boldExtra) {
  const fill = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
  const b    = (isHeader || boldExtra) ? '<w:b/><w:bCs/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${BORD}${fill}<w:vAlign w:val="center"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p></w:tc>`;
}

// Tabla de resultados: 2 columnas × 3 filas (Mín / Máx / Promedio), con el
// número de OT en el header de la columna derecha. Formato coincide con
// OPCION 1 del modelo de referencia LAB+PLAN B 2014.
function construirTablaResultados(nroOtBase, sectorEnsayado, agr) {
  const anchoParametro = 3500;
  const anchoValor     = 4500;
  const headerCelda    = 'O.T. ' + (nroOtBase || '') + (sectorEnsayado ? '\nSector: ' + sectorEnsayado : '');
  const tbl = '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="8000" w:type="dxa"/><w:jc w:val="center"/>' +
      '<w:tblBorders>' +
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '</w:tblBorders>' +
    '</w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${anchoParametro}"/><w:gridCol w:w="${anchoValor}"/></w:tblGrid>` +
    // Header
    '<w:tr>' +
      celdaTablaResult('Parámetro',      anchoParametro, true) +
      celdaTablaResult(headerCelda,      anchoValor,     true) +
    '</w:tr>' +
    // Filas de agregados
    '<w:tr>' +
      celdaTablaResult('Valor mínimo',   anchoParametro, false, true) +
      celdaTablaResult(agr.min + ' micrones', anchoValor, false) +
    '</w:tr>' +
    '<w:tr>' +
      celdaTablaResult('Valor máximo',   anchoParametro, false, true) +
      celdaTablaResult(agr.max + ' micrones', anchoValor, false) +
    '</w:tr>' +
    '<w:tr>' +
      celdaTablaResult('Valor promedio', anchoParametro, false, true) +
      celdaTablaResult(agr.prom + ' micrones', anchoValor, false) +
    '</w:tr>' +
  '</w:tbl>';
  return tbl;
}

// Pie de tabla cursiva centrada, "Tabla N°1 - Resultados ensayo de
// recubrimiento". El post-proceso `renumerarTablas` de word-generator.js
// reemplaza el 1 por el número correcto según orden en el doc combinado.
function pTablaCaption(descripcion) {
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="120" w:before="80"/>' +
    '<w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS}<w:i/><w:iCs/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">Tabla N°1 - ${esc(descripcion)}</w:t></w:r></w:p>`;
}

function calcularAgregados(mediciones) {
  const vs = (Array.isArray(mediciones) ? mediciones : [])
    .map(v => parseFloat(String(v).replace(',', '.')))
    .filter(n => !isNaN(n));
  if (vs.length === 0) return { min: '**', max: '**', prom: '**' };
  const min = Math.min.apply(Math, vs);
  const max = Math.max.apply(Math, vs);
  const prom = vs.reduce((a, b) => a + b, 0) / vs.length;
  const fmt = n => (Math.round(n * 100) / 100).toFixed(2);
  return { min: fmt(min), max: fmt(max), prom: fmt(prom) };
}

function construirBloqueEnsayo(ot, datos) {
  const partes = [];
  const asterisco = datos.oaa === false ? '' : '*';

  const norma           = String(datos.norma || '').trim();
  const metodologia     = String(datos.metodologia || 'ITM N°084').trim();
  const aumentoTxt      = String(datos.aumento_texto || '').trim();
  const sectorEnsayado  = String(datos.sector_ensayado || '').trim();
  const temperaturaTxt  = String(datos.temperatura || '').trim();

  // ── Encabezado (heading principal) ──────────────────────────────────────
  partes.push(pSeccionHeading('ESPESOR DEL RECUBRIMIENTO (METALOGRAFICO)' + asterisco));

  // ── 1.1 CONDICIONES DE ENSAYO ───────────────────────────────────────────
  partes.push(pHeading('CONDICIONES DE ENSAYO'));
  if (norma)          partes.push(pLinea(`Norma de ensayo: ${norma}`));
  if (metodologia)    partes.push(pLinea(`Metodología de ensayo: ${metodologia}`));
  if (aumentoTxt)     partes.push(pLinea(`Aumento utilizado: ${aumentoTxt}`));
  if (sectorEnsayado) partes.push(pLinea(`Sector ensayado: ${sectorEnsayado}`));
  if (temperaturaTxt) partes.push(pLinea(`Temperatura de ensayo: ${temperaturaTxt} °C`));
  partes.push(pBlanco());

  // ── 1.2 EQUIPAMIENTO UTILIZADO ──────────────────────────────────────────
  const equipos = [];
  EQUIPOS.forEach(([key, nombre, tagDefault]) => {
    if (!(datos.equipamiento && datos.equipamiento[key])) return;
    const tagRaw = datos.equipamiento_tags && datos.equipamiento_tags[key];
    const tag = (tagRaw != null ? String(tagRaw) : String(tagDefault || '')).trim();
    equipos.push(tag ? `${nombre} TAG N°${tag}` : nombre);
  });
  formatearOtrosEquipos(datos).forEach(l => equipos.push(l));
  if (equipos.length) {
    partes.push(pHeading('EQUIPAMIENTO UTILIZADO'));
    equipos.forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  // ── 1.3 RESULTADOS OBTENIDOS ────────────────────────────────────────────
  const nroOtBase = String(ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');
  const agr = calcularAgregados(datos.mediciones);
  partes.push(pHeading('RESULTADOS OBTENIDOS'));
  partes.push(pBlanco());
  partes.push(construirTablaResultados(nroOtBase, sectorEnsayado, agr));
  partes.push(pTablaCaption('Resultados ensayo de recubrimiento'));
  partes.push(pBlanco());

  // ── Notas y Evaluación (opcionales) ─────────────────────────────────────
  // No emitimos pBlanco() al final de estas secciones — el helper
  // `garantizarBlancosAntesFin` en el post-proceso deja siempre 2 blanks
  // justo arriba de "FIN DE INFORME".
  const evalTxt = String(datos.evaluacion_texto || '').trim();
  if (evalTxt) {
    partes.push(pHeading('EVALUACIÓN DE RESULTADOS'));
    partes.push(pLinea('"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA"'));
    evalTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }
  const notasTxt = String(datos.notas_texto || '').trim();
  if (notasTxt) {
    partes.push(pHeading('NOTAS'));
    notasTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    // Sin pBlanco al final — `garantizarBlancosAntesFin` da el aire arriba de
    // "FIN DE INFORME". Así "abajo de NOTAS" no queda un enter extra.
  }

  return partes.join('');
}

function generarEspesorRecubrimientoDesdeTemplate(ot, datos, fotosCaratula) {
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const nroOtBase = String(ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  // Overrides por OT (condiciones_por_ot) — se aplanan a la raíz antes de emitir.
  if (datos && datos.condiciones_por_ot && typeof datos.condiciones_por_ot === 'object') {
    const nroOtActual = String(ot.nro_ot || '');
    const c = datos.condiciones_por_ot[nroOtActual];
    if (c && Object.keys(c).length > 0) {
      datos = Object.assign({}, datos, c);
    }
  }
  // Mediciones por OT: si el ensayo tiene el mapa completo (pre-split), aplanar
  // el correspondiente a esta OT. Post-split, `mediciones` y `sector_ensayado`
  // ya están en la raíz.
  if (datos && datos.mediciones_por_ot && typeof datos.mediciones_por_ot === 'object') {
    const m = datos.mediciones_por_ot[String(ot.nro_ot || '')];
    if (m && (Array.isArray(m.valores) || m.sector != null)) {
      datos = Object.assign({}, datos, {
        mediciones:      Array.isArray(m.valores) ? m.valores.slice() : (datos.mediciones || []),
        sector_ensayado: m.sector != null ? String(m.sector) : (datos.sector_ensayado || ''),
      });
    }
  }

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

  const bloque = construirBloqueEnsayo(ot, datos);
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?__ENSAYO_VARIOS__(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, bloque);

  const textosOAA = [];
  if (datos.oaa !== false) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  // Deja exactamente 2 párrafos blancos arriba de "FIN DE INFORME".
  outXml = garantizarBlancosAntesFin(outXml, 2);

  // Imágenes del ensayo (opcionales) — se apilan al final del bloque.
  function toFotosBuffer(arr) {
    return Array.isArray(arr)
      ? arr.map(p => {
          if (!p) return null;
          const url = typeof p === 'string' ? p : p.dataUrl;
          if (!url) return null;
          const b64 = url.replace(/^data:[^;]+;base64,/, '');
          return { buffer: Buffer.from(b64, 'base64'), caption: p.caption || '', name: p.name || '' };
        }).filter(x => x && x.buffer)
      : [];
  }
  const fotosEnsayo = toFotosBuffer(datos.imagenes_resultado);
  if (fotosEnsayo.length > 0) {
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosEnsayo, 'espesor-recubrimiento', MARKER_FIN_ENSAYO, 'before', 200);
  }

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'espesor-recubrimiento');

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer' });
}

module.exports = { generarEspesorRecubrimientoDesdeTemplate };
