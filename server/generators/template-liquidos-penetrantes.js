'use strict';
// Generador para "Líquidos Penetrantes" (modelo FM. 043). Estructura fija con
// bloques: INSTRUMENTOS · ENSAYO SEGÚN + LIMPIEZA PREVIA · CONDICIONES DE
// ENSAYO · RESULTADOS OBTENIDOS. Reutiliza el template Word `varios.docx`
// (mismo layout base — carátula + header + placeholder __ENSAYO_VARIOS__).

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

const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

// Etiquetas humanas para las condiciones del preinforme (mismo orden que en el
// form). El técnico puede dejar en blanco las que no apliquen.
const CONDICIONES = [
  ['temperatura_ensayo',        'Temperatura de ensayo'],
  ['intensidad_luz_blanca',     'Intensidad de luz blanca'],
  ['potencia_luz_uv',           'Potencia de luz UV'],
  ['presion_aire',              'Presión de aire'],
  ['presion_agua',              'Presión de agua'],
  ['penetrante',                'Penetrante'],
  ['revelador',                 'Revelador'],
  ['tipo_emulsificador',        'Tipo de emulsificador'],
  ['tiempo_penetracion_tinta',  'Tiempo de penetración de tinta'],
  ['tiempo_revelado',           'Tiempo de revelado'],
  ['tiempo_emulsificacion',     'Tiempo de emulsificación'],
  ['temperatura_agua',          'Temperatura del agua'],
  ['temperatura_secado',        'Temperatura de secado'],
];

// Instrumentos default con sus etiquetas humanas.
const INSTRUMENTOS = [
  ['lampara',      'Lámpara'],
  ['microwatt',    'Microwattímetro'],
  ['refractometro','Refractómetro'],
  ['manometro',    'Manómetro'],
  ['patron',       'Patrón'],
  ['luxometro',    'Luxómetro'],
];

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

  // Título del ensayo — heading nivel 0 (mismo estilo que macrografía/varios).
  // Ensayos de líquidos penetrantes SIEMPRE están fuera del alcance OAA.
  const asterisco = datos.oaa === false ? '' : '*';
  partes.push('<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="426"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="142" w:firstLine="0"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">ENSAYO DE LÍQUIDOS PENETRANTES${asterisco}</w:t></w:r></w:p>`);

  // ── ENSAYO SEGÚN ──────────────────────────────────────────────────────
  const normas = [];
  const anioSuf = (v, sep) => {
    const s = String(v || '').trim();
    return s ? (sep || '-') + s : '';
  };
  if (datos.norma_astm_e165) normas.push('ASTM E165' + anioSuf(datos.norma_astm_e165_year, '-'));
  if (datos.norma_asme_v)    normas.push('ASME BPVC Sección V' + (datos.norma_asme_v_year ? ` Ed. ${String(datos.norma_asme_v_year).trim()}` : ''));
  // "Otra norma": SÓLO si el checkbox está tildado. Texto residual sin
  // checkbox activo NO va al Word.
  if (datos.norma_otra_chk && (datos.norma_otra || '').trim()) normas.push(datos.norma_otra.trim());
  if (normas.length) {
    partes.push(pHeading('ENSAYO SEGÚN'));
    normas.forEach(n => partes.push(pLinea(n)));
    partes.push(pBlanco());
  }

  // ── INSTRUMENTOS ──────────────────────────────────────────────────────
  const instrumentos = [];
  INSTRUMENTOS.forEach(([key, label]) => {
    const on = !!(datos.instrumentos && datos.instrumentos[key]);
    if (!on) return;
    const tag = (datos.instrumentos_tags && datos.instrumentos_tags[key] || '').trim();
    instrumentos.push(tag ? `${label} TAG N°${tag}` : label);
  });
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => instrumentos.push(l));
  if (instrumentos.length) {
    partes.push(pHeading('INSTRUMENTOS'));
    instrumentos.forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  // ── CONDICIONES DE ENSAYO ─────────────────────────────────────────────
  const lineasCond = [];
  const limpieza = (datos.limpieza_previa || '').trim();
  if (limpieza) lineasCond.push(`Limpieza previa: ${limpieza}`);
  CONDICIONES.forEach(([key, label]) => {
    const val = (datos[key] || '').toString().trim();
    if (val) lineasCond.push(`${label}: ${val}`);
  });
  if (lineasCond.length) {
    partes.push(pHeading('CONDICIONES DE ENSAYO'));
    lineasCond.forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  // ── RESULTADOS OBTENIDOS ──────────────────────────────────────────────
  const resultadoTxt = sentenceCase((datos.resultado_texto || '').trim());
  if (resultadoTxt) {
    partes.push(pHeading('RESULTADOS OBTENIDOS'));
    resultadoTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  return partes.join('');
}

function generarLiquidosPenetrantesDesdeTemplate(ot, datos, fotosCaratula) {
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

  // OAA antes de FIN DE INFORME — siempre activo salvo override explícito.
  const textosOAA = [];
  if (datos.oaa !== false) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);

  // Imágenes del ensayo (fotos de indicaciones, etc.).
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
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosEnsayo, 'liquidos-penetrantes', MARKER_FIN_ENSAYO, 'before');
  }

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'liquidos-penetrantes');

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

module.exports = { generarLiquidosPenetrantesDesdeTemplate };
