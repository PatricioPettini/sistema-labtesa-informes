// Helper para insertar párrafos OAA antes de "FIN DE INFORME".
// W5: los textos OAA deben aparecer siempre en negrita, centrados, fuera de
// cualquier sección y sin un título "OAA" arriba.
//
// Adicional: `garantizarBlancosAntesFin(xml, n)` normaliza los párrafos
// blancos que hay INMEDIATAMENTE antes de "FIN DE INFORME" — quita los que
// haya y deja exactamente `n` (default 2). Se usa al final de cada generator
// template-based para dar el "aire" consistente arriba del cierre del informe.

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

// Normaliza los párrafos blancos inmediatamente antes de "FIN DE INFORME" a
// exactamente `n` (default 2). Un párrafo se considera "blank" si no tiene
// <w:t> con contenido visible (o si sólo tiene el U+2060 word-joiner que
// usamos como marcador invisible). No se toca ningún párrafo con texto real.
function garantizarBlancosAntesFin(xml, n = 2) {
  const finPos = findFinDeInformePos(xml);
  if (finPos < 0) return xml;
  const pStart = scanBackForTag(xml, '<w:p', finPos);
  if (pStart < 0) return xml;

  // Escanear hacia atrás párrafos consecutivos que sean blank.
  const P_RE = /<w:p\b[^>]*(?:\/>|>[\s\S]*?<\/w:p>)/g;
  let idx = 0;
  const parrafos = [];
  while ((idx = xml.indexOf('<w:p', idx)) !== -1) {
    P_RE.lastIndex = idx;
    const m = P_RE.exec(xml);
    if (!m || m.index !== idx) { idx++; continue; }
    parrafos.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    idx = m.index + m[0].length;
  }
  // Encontrar el índice del párrafo que arranca en pStart.
  const finIdx = parrafos.findIndex(p => p.start === pStart);
  if (finIdx < 0) return xml;

  // Retroceder desde finIdx-1 mientras sean blanks.
  let firstBlank = finIdx;
  for (let i = finIdx - 1; i >= 0; i--) {
    const p = parrafos[i];
    const textos = [...p.text.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const contenido = textos.join('').replace(/[⁠\s]/g, '');
    if (contenido !== '') break; // párrafo con texto real → no seguimos
    firstBlank = i;
  }

  // Blank estándar (mismo que usa el OAA helper — con U+2060 para sobrevivir
  // a limpiadores de párrafos vacíos).
  const fontsBlank = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr>' +
    `<w:r><w:rPr>${fontsBlank}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    '<w:t xml:space="preserve">⁠</w:t></w:r></w:p>';

  const antes = xml.slice(0, parrafos[firstBlank].start);
  const finXml = xml.slice(parrafos[finIdx].start);
  const nuevos = BLANK.repeat(Math.max(0, n));
  return antes + nuevos + finXml;
}

module.exports = { insertarOAAAntesDeFin, garantizarBlancosAntesFin };
