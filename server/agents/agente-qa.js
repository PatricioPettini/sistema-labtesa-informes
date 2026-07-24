/**
 * agente-qa.js
 * Agente QA: verifica formato y datos del Word generado.
 * Verifica directamente en el XML del docx:
 * - Márgenes correctos
 * - Fuente Calibri tamaño 11pt en el cuerpo
 * - Salto de página entre ensayos
 * - Ancho de imagen máximo 15cm
 * - Numeración automática OOXML
 * - Orden de secciones correcto
 * - Datos de carátula completos
 */

const PizZip = require('pizzip');
const fetch  = require('node-fetch');

const MARGENES_ESPERADOS = { top: 0, right: 1134, bottom: 1077, left: 1559, header: 709, footer: 709 };
const MARGEN_TOLERANCIA  = 10;
const SIZE_ESPERADO      = 22;   // 11pt en half-points
const MAX_IMG_EMU        = 5715000; // ~15cm en EMU
const SECCIONES_ORDEN    = ['CONDICIONES DE ENSAYO', 'EQUIPAMIENTO UTILIZADO', 'RESULTADOS OBTENIDOS'];

function verificarDocx(buffer) {
  const errores = [], advertencias = [];

  let zip, docXml;
  try {
    zip = new PizZip(buffer);
    docXml = zip.files['word/document.xml']?.asText() || '';
  } catch (e) {
    return { errores: [`No se pudo leer el documento: ${e.message}`], advertencias: [] };
  }

  // 1. Márgenes
  const sectPr = docXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0] || '';
  const pgMar  = sectPr.match(/<w:pgMar\b([^>]*\/?>)/)?.[1] || '';
  if (pgMar) {
    for (const [lado, valor] of Object.entries(MARGENES_ESPERADOS)) {
      const m = pgMar.match(new RegExp(`w:${lado}="(\\d+)"`));
      if (m) {
        const actual = parseInt(m[1]);
        if (Math.abs(actual - valor) > MARGEN_TOLERANCIA)
          errores.push(`Margen ${lado} incorrecto: es ${actual} twips, esperado ${valor}`);
      }
    }
  } else {
    advertencias.push('No se encontró definición de márgenes (w:pgMar)');
  }

  // 2. Fuente Calibri dominante
  const allFonts = [...docXml.matchAll(/w:ascii="([^"]+)"/g)].map(m => m[1]);
  if (allFonts.length > 0) {
    const ratio = allFonts.filter(f => f.toLowerCase() === 'calibri').length / allFonts.length;
    if (ratio < 0.7)
      errores.push(`Fuente dominante no es Calibri (${Math.round(ratio * 100)}% Calibri, esperado ≥70%)`);
  }

  // 3. Tamaño fuente en cuerpo (después del primer page break)
  const pbPos    = docXml.indexOf('w:type="page"');
  const cuerpo   = pbPos > 0 ? docXml.slice(pbPos) : docXml;
  const allSizes = [...cuerpo.matchAll(/<w:sz w:val="(\d+)"/g)].map(m => parseInt(m[1]));
  if (allSizes.length > 0) {
    const incorrectos = allSizes.filter(s => ![18, 20, 22, 24, 26, 28, 32, 36].includes(s));
    if (incorrectos.length > allSizes.length * 0.3)
      advertencias.push('Muchos runs con tamaño de fuente inusual. Verificar que el cuerpo use 11pt (Calibri).');
  }

  // 4. Saltos de página (solo aplica en combinados — un informe simple puede no tener)
  const pageBreaks = [...docXml.matchAll(/w:type="page"/g)].length;
  const esCombinadoDoc = (docXml.match(/<w:sectPr\b/g) || []).length > 1 || pageBreaks > 0;
  // Solo reportar error si parece combinado y no hay page breaks
  if (esCombinadoDoc && pageBreaks === 0)
    errores.push('No se encontraron saltos de página en el documento');

  // 5. Ancho máximo de imágenes (15cm)
  for (const m of docXml.matchAll(/cx="(\d+)"/g)) {
    const cx = parseInt(m[1]);
    if (cx > MAX_IMG_EMU) {
      const cm = (cx / 914400 * 2.54).toFixed(1);
      errores.push(`Imagen con ancho ${cm}cm supera el máximo de 15cm`);
    }
  }

  // 6. Numeración (OOXML automática O texto manual estilo "1.\t" / "1.1.\t")
  const tieneOOXML = docXml.includes('<w:numId') && zip.files['word/numbering.xml'];
  // Texto: convertirNumberingATexto genera <w:t...>N.</w:t></w:r><w:r>[rPr]<w:tab/></w:r>
  // El <w:rPr> puede o no estar presente, así que lo hacemos opcional.
  const tieneTextoNum = /<w:t[^>]*>\d+(?:\.\d+)?\.<\/w:t><\/w:r><w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:tab\/>/.test(docXml);
  if (!tieneOOXML && !tieneTextoNum)
    advertencias.push('No se detectó numeración (ni OOXML ni texto manual). Las secciones pueden no estar numeradas.');

  // 7. Orden de secciones
  let lastPos = -1;
  for (const sec of SECCIONES_ORDEN) {
    const pos = docXml.indexOf(sec);
    if (pos === -1)
      advertencias.push(`Sección "${sec}" no encontrada`);
    else if (pos < lastPos)
      errores.push(`Sección "${sec}" está fuera de orden`);
    else
      lastPos = pos;
  }

  // 8. FIN DE INFORME (tolerante a runs separados: "FIN DE " + "INFORME")
  const tieneFin = docXml.includes('FIN DE INFORME') ||
    (() => {
      const i = docXml.indexOf('FIN DE');
      if (i < 0) return false;
      // Buscar "INFORME" en los siguientes 300 chars (mismo párrafo)
      return docXml.slice(i, i + 300).includes('INFORME');
    })();
  if (!tieneFin)
    errores.push('No se encontró "FIN DE INFORME" al final del documento');

  return { errores, advertencias };
}

function verificarDatosOT(ot, resultadosAgentes) {
  const errores = [], advertencias = [];

  if (!ot.razon_social?.trim())          errores.push('Falta razón social del cliente');
  if (!ot.nro_ot?.toString().trim())     errores.push('Falta número de OT');
  if (!ot.nro_solicitud?.toString().trim()) errores.push('Falta número de solicitud');
  if (!ot.fecha_finalizacion?.trim())    advertencias.push('Fecha de finalización vacía');
  if (!ot.id_muestra?.trim())            advertencias.push('Identificación de muestra vacía');

  for (const r of resultadosAgentes) {
    for (const e of (r.errores || []))
      errores.push(`[${r.tipo.toUpperCase()}] ${e}`);
    for (const a of (r.advertencias || []))
      advertencias.push(`[${r.tipo.toUpperCase()}] ${a}`);
  }

  return { errores, advertencias };
}

async function generarResumen(erroresDocx, advDocx, erroresOT, advOT, ot) {
  const todosErrores      = [...erroresOT, ...erroresDocx];
  const todasAdvertencias = [...advOT,     ...advDocx];

  if (todosErrores.length === 0 && todasAdvertencias.length === 0)
    return 'Informe verificado correctamente. Sin errores ni advertencias.';

  // Resumen local sin llamar a Claude — más rápido y sin riesgo de colgarse
  const partes = [];
  if (todosErrores.length > 0)
    partes.push(`Se encontraron ${todosErrores.length} error(es) crítico(s): ${todosErrores.slice(0,2).join('; ')}${todosErrores.length > 2 ? '...' : ''}.`);
  if (todasAdvertencias.length > 0)
    partes.push(`Hay ${todasAdvertencias.length} advertencia(s) a revisar.`);
  if (todosErrores.length === 0)
    partes.push('El informe puede generarse pero conviene revisar las advertencias antes de entregar.');

  return partes.join(' ');
}

async function ejecutarQA(buffer, ot, resultadosAgentes) {
  console.log('[QA] verificarDocx...');
  const { errores: errDocx, advertencias: advDocx } = verificarDocx(buffer);
  console.log(`[QA] verificarDocx OK — ${errDocx.length} errores, ${advDocx.length} advertencias`);

  const { errores: errOT, advertencias: advOT } = verificarDatosOT(ot, resultadosAgentes);
  console.log(`[QA] verificarDatosOT OK — ${errOT.length} errores, ${advOT.length} advertencias`);

  const todosErrores      = [...errOT, ...errDocx];
  const todasAdvertencias = [...advOT, ...advDocx];
  const ok = todosErrores.length === 0;

  const resumen = await generarResumen(errDocx, advDocx, errOT, advOT, ot);
  console.log(`[QA] Resultado final: ok=${ok}, errores=${todosErrores.length}, advertencias=${todasAdvertencias.length}`);

  return { ok, errores: todosErrores, advertencias: todasAdvertencias, resumen };
}

module.exports = { ejecutarQA };
