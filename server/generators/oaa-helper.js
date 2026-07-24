// Helper para insertar párrafos OAA antes de "FIN DE INFORME".
// W5: los textos OAA deben aparecer siempre en negrita, centrados, fuera de
// cualquier sección y sin un título "OAA" arriba.

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

// Busca posición de "FIN DE INFORME" tolerando texto partido por bookmarks/proofErr
function findFinDeInformePos(xml) {
  const direct = xml.indexOf('FIN DE INFORME');
  if (direct >= 0) return direct;
  const m = xml.match(/<w:t[^>]*>FIN DE<\/w:t>[\s\S]{0,500}?<w:t[^>]*>\s*INFORME<\/w:t>/);
  if (m) return m.index + m[0].indexOf('FIN DE');
  return -1;
}

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Construye un <w:p> centrado en negrita con el texto dado.
// El texto se XML-escapa porque viene en formato plano desde el generador.
function parrafoOAA(texto) {
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  return '<w:p><w:pPr><w:spacing w:after="0" w:before="0" w:line="276" w:lineRule="auto"/>' +
    '<w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:b/><w:bCs/>${sz}</w:rPr>` +
    `<w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;
}

// Inserta los párrafos OAA justo antes del párrafo que contiene "FIN DE INFORME".
// textosOAA: array de strings. Si está vacío, no hace nada.
function insertarOAAAntesDeFin(xml, textosOAA) {
  if (!textosOAA || !textosOAA.length) return xml;

  const finPos = findFinDeInformePos(xml);
  if (finPos < 0) return xml;
  const pStart = scanBackForTag(xml, '<w:p', finPos);
  if (pStart < 0) return xml;

  // UN SOLO renglón en blanco ANTES y UN SOLO renglón en blanco DESPUÉS del
  // bloque OAA. Tamaño 11pt (sz=22) e interlineado 1.15 (line=276 auto).
  // Llevan un U+2060 (word joiner, invisible y NO whitespace) para sobrevivir
  // a `eliminarParrafosVacios`.
  const fontsBlank = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr>' +
    `<w:r><w:rPr>${fontsBlank}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    '<w:t xml:space="preserve">⁠</w:t></w:r></w:p>';
  const parrafosXml = BLANK + textosOAA.map(parrafoOAA).join('') + BLANK;
  return xml.slice(0, pStart) + parrafosXml + xml.slice(pStart);
}

module.exports = { insertarOAAAntesDeFin };
