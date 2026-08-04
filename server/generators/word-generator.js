const PizZip = require('pizzip');
const { Document, Packer, Paragraph, TextRun, PageBreak } = require('docx');
const { crearEncabezado } = require('./header-template');
const { generarCaratula } = require('./caratula');
const { generarTraccion } = require('./traccion');
const { generarTraccionDesdeTemplate } = require('./template-traccion');
const { generarImpactoDesdeTemplate }  = require('./template-impacto');
const { generarPlegadoDesdeTemplate }  = require('./template-plegado');
const { generarNickBreakDesdeTemplate } = require('./template-nick-break');
const { generarQuimicosDesdeTemplate } = require('./template-quimicos');
const { generarBrinellDesdeTemplate }  = require('./template-brinell');
const { generarRockwellDesdeTemplate } = require('./template-rockwell');
const { traducirV2aV1 }                = require('../agents/agente-mapeo');
const { generarVickersDesdeTemplate }  = require('./template-vickers');
const { generarFerritaDeltaDesdeTemplate } = require('./template-ferrita-delta');
const { generarMetalografiaDesdeTemplate } = require('./template-metalografia');
const { generarMacrografiaDesdeTemplate }  = require('./template-macrografia');
const { generarRugosidadDesdeTemplate }    = require('./template-rugosidad');
const { generarVariosDesdeTemplate }       = require('./template-varios');
const { generarTratamientosTermicosDesdeTemplate } = require('./template-tratamientos-termicos');
const { generarLiquidosPenetrantesDesdeTemplate } = require('./template-liquidos-penetrantes');
const { generarMetalografiaGeneralDesdeTemplate } = require('./template-metalografia-general');
const { generarAnexoMetalograficoDesdeTemplate }  = require('./template-anexo-metalografico');
const { generarImpacto } = require('./impacto');
const { finDeInforme } = require('./estilos');

// Tipos del modelo F2 (multi-microestructura). Los 8 comparten generator y
// template; el subtipo se pasa como tercer argumento al generador.
const TIPOS_METALOGRAFIA = [
  'microestructura', 'tamano-grano', 'inclusiones', 'estructura-grafito',
  'espesor-capa', 'decarburacion', 'defectos-superficiales', 'porosidad',
];

// Generadores basados en plantilla .docx — devuelven Buffer directamente
const GENERADORES_TEMPLATE = {
  traccion:          generarTraccionDesdeTemplate,
  impacto:           generarImpactoDesdeTemplate,
  plegado:           generarPlegadoDesdeTemplate,
  'nick-break':      generarNickBreakDesdeTemplate,
  quimicos:          generarQuimicosDesdeTemplate,
  'dureza-brinell':  generarBrinellDesdeTemplate,
  'dureza-rockwell': generarRockwellDesdeTemplate,
  'dureza-vickers':  generarVickersDesdeTemplate,
  'ferrita-delta':   generarFerritaDeltaDesdeTemplate,
  'macrografia':     generarMacrografiaDesdeTemplate,
  'rugosidad':       generarRugosidadDesdeTemplate,
  'varios':          generarVariosDesdeTemplate,
  'tratamientos-termicos': generarTratamientosTermicosDesdeTemplate,
  'liquidos-penetrantes': generarLiquidosPenetrantesDesdeTemplate,
  'metalografia-general': generarMetalografiaGeneralDesdeTemplate,
  'anexo-metalografico':  generarAnexoMetalograficoDesdeTemplate,
};
for (const t of TIPOS_METALOGRAFIA) {
  GENERADORES_TEMPLATE[t] = (ot, datos, fotos) => generarMetalografiaDesdeTemplate(ot, datos, fotos, t);
}

// Generadores legacy (docx library) — devuelven { elementos, tablasUsadas }
const GENERADORES = {
  traccion: generarTraccion,
  impacto:  generarImpacto,
};

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

// Busca posición de "FIN DE INFORME" tolerando que esté partido en múltiples
// <w:t> por bookmarks, proofErr u otros tags intermedios. Devuelve la posición
// del PRIMER carácter del primer <w:t> involucrado, o -1 si no se encuentra.
function findFinDeInformePos(xml) {
  // 1) Caso normal: texto entero en un solo <w:t>
  const direct = xml.indexOf('FIN DE INFORME');
  if (direct >= 0) return direct;

  // 2) Caso partido: <w:t>FIN DE</w:t> ... <w:t> INFORME</w:t> con bookmarks entre medio
  const re = /<w:t[^>]*>FIN DE<\/w:t>[\s\S]{0,500}?<w:t[^>]*>\s*INFORME<\/w:t>/;
  const m = xml.match(re);
  if (m) {
    // Devolver la posición DENTRO del primer <w:t>, equivalente a indexOf
    return m.index + m[0].indexOf('FIN DE');
  }
  return -1;
}

// ── Numeración estática post-combinado ────────────────────────────────────────
// Reemplaza los numId de lista OOXML con texto estático ("5.", "5.1.", etc.)
// preservando la indentación y formato visual del template original.
// seccionInicio: número desde el que arranca el primer ensayo (default 1)
function renumerarSecciones(xml, seccionInicio = 1) {
  let seccion = seccionInicio - 1, subseccion = 0;

  // Solo procesar desde el primer page break (ignorar carátula)
  const firstPBPos = xml.indexOf('w:type="page"');
  const firstPBParaStart = firstPBPos >= 0 ? scanBackForTag(xml, '<w:p', firstPBPos) : 0;

  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para, offset) => {
    if (firstPBParaStart > 0 && offset < firstPBParaStart) return para;

    const ilvlM  = para.match(/<w:ilvl w:val="(\d+)"/);
    const numIdM = para.match(/<w:numId w:val="(\d+)"/);

    // ── CASO 2: párrafo con numeración ya convertida a texto literal ──────
    // Sucede cuando el generador (p.ej. nick-break/plegado/brinell) aplica
    // convertirNumberingATexto antes de combinar. Patrón generado, en cualquiera
    // de estos dos formatos:
    //   Variante A:  <w:t>N.</w:t></w:r><w:r>[rPr]<w:tab/>      (tab en OTRO run)
    //   Variante B:  <w:t>N.</w:t><w:tab/>                       (tab en MISMO run)
    if (!numIdM || numIdM[1] === '0') {
      const textNumRe = /<w:t[^>]*>(\d+(?:\.\d+)?)\.<\/w:t>(?:<w:tab\/>|<\/w:r><w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:tab\/>)/;
      const textNumM = para.match(textNumRe);
      if (!textNumM) return para;

      // El número debe ser el PRIMER <w:t> del párrafo (no algo casual)
      const firstTPos = para.search(/<w:t\b/);
      const matchPos  = para.indexOf(textNumM[0]);
      if (firstTPos !== matchPos) return para;

      const indMatch = para.match(/<w:ind\s+w:left="(\d+)"/);
      const indLeft = indMatch ? +indMatch[1] : -1;

      // Determinar nivel por el patrón del número: "N." = nivel 0, "N.M." = nivel 1
      // (más robusto que indLeft que varía entre templates)
      const numPatternM = para.match(/<w:t[^>]*>(\d+(?:\.\d+)?)\.(<\/w:t>)/);
      const numStr = numPatternM ? numPatternM[1] : '';
      let ilvl2;
      if (numStr && !numStr.includes('.')) {
        ilvl2 = 0;  // "N." → título ensayo
      } else if (numStr && numStr.includes('.')) {
        ilvl2 = 1;  // "N.M." → subtítulo
      } else if (indLeft === 0)        ilvl2 = 0;
      else if (indLeft === 426)        ilvl2 = 1;
      else return para;

      let label2;
      if (ilvl2 === 0) { seccion++; subseccion = 0; label2 = `${seccion}.`; }
      else             { subseccion++;               label2 = `${seccion}.${subseccion}.`; }

      return para.replace(/(<w:t[^>]*>)\d+(?:\.\d+)?\.(<\/w:t>)/, `$1${label2}$2`);
    }

    const ilvl = ilvlM ? +ilvlM[1] : 0;
    if (ilvl > 1) return para;

    let label;
    if (ilvl === 0) {
      seccion++;
      subseccion = 0;
      label = `${seccion}.\t`;
    } else {
      subseccion++;
      label = `${seccion}.${subseccion}.\t`;
    }

    // Indentación según nivel — valores del template original (en twips)
    // Nivel 0: left=426, hanging=284  → número alineado al margen, texto tabulado
    // Nivel 1: left=851, hanging=425  → número con sangría, texto tabulado
    const indLeft    = ilvl === 0 ? 426  : 851;
    const indHanging = ilvl === 0 ? 284  : 425;

    // Quitar numPr y lastRenderedPageBreak del párrafo original
    let p = para
      .replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '')
      .replace(/<w:lastRenderedPageBreak\/>/g, '');

    // Reemplazar o insertar w:ind con los valores correctos en w:pPr
    if (p.includes('<w:ind ') || p.includes('<w:ind/>')) {
      // Reemplazar el ind existente
      p = p.replace(/<w:ind\b[^/]*\/>/g,
        `<w:ind w:left="${indLeft}" w:hanging="${indHanging}"/>`);
    } else {
      // Insertar ind antes de </w:pPr>
      p = p.replace('</w:pPr>',
        `<w:ind w:left="${indLeft}" w:hanging="${indHanging}"/></w:pPr>`);
    }

    // Formato del run del número
    const boldAttr = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
                     '<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/>';
    // Tab después del número para alinear el texto
    const numRun = `<w:r><w:rPr>${boldAttr}</w:rPr>` +
                   `<w:t xml:space="preserve">${label.replace('\t', '')}</w:t></w:r>` +
                   `<w:r><w:tab/></w:r>`;

    // Insertar antes del primer run con texto
    const firstTPos = p.search(/<w:t(?![a-zA-Z])/);
    if (firstTPos < 0) return para;
    const titleRunStart = scanBackForTag(p, '<w:r', firstTPos);
    if (titleRunStart < 0) return para;

    return p.slice(0, titleRunStart) + numRun + p.slice(titleRunStart);
  });
}

// ── Re-numeración de tablas e imágenes ────────────────────────────────────────
// En documentos combinados cada template pone "Tabla N˚1". Este post-proceso
// los renumera 1, 2, 3... en orden de aparición.
function renumerarTablas(xml) {
  let numTabla = 0, numImagen = 0;

  // El texto puede estar partido en múltiples <w:t>. Procesamos párrafo a párrafo:
  // extraemos el texto concatenado, buscamos el patrón, y reemplazamos el número
  // en el ÚLTIMO <w:t> del párrafo que contenga solo un número (el pie de tabla).
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, para => {
    // Extraer texto completo del párrafo (concatenando todos los <w:t>)
    const textos = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const fullText = textos.join('');

    const esTabla  = /Tabla\s*N[˚°ºo]?\s*\d*/i.test(fullText);
    const esImagen = /Imagen\s*N[˚°°ºo]?\s*\d*/i.test(fullText);

    if (!esTabla && !esImagen) return para;

    const nuevoNum = esTabla ? ++numTabla : ++numImagen;

    // Reemplazar en el XML: buscar el <w:t> que contiene el número (solo dígitos)
    // o el que contiene "N˚X" completo
    let result = para;

    // Caso 1: el número está en el mismo <w:t> que "Tabla N˚"
    result = result.replace(/(Tabla\s*N[˚°ºo]\s*)(\d+)/gi, (_, prefix, _num) => `${prefix}${nuevoNum}`);
    result = result.replace(/(Imagen\s*N[°°ºo]\s*)(\d+)/gi, (_, prefix, _num) => `${prefix}${nuevoNum}`);

    // Caso 2: el número está en un <w:t> separado (solo dígitos), inmediatamente
    // después de un <w:t> que termina en "N˚" o "N°"
    // Buscar <w:t> previo con "N˚" y luego <w:t> con solo número
    if (result === para) {
      // Fallback: número en <w:t> solo ("1") o con texto posterior ("1 - Resultados...")
      result = result.replace(/(<w:t[^>]*>)(\d+)(\s*(?:-|<\/w:t>))/,
        (_, tag, num, after) => `${tag}${nuevoNum}${after}`);
    }

    return result;
  });
}

// ── Eliminar páginas vacías (doble salto de página) ───────────────────────────
// Cuando hay dos page breaks consecutivos (con solo párrafos sin texto entre ellos),
// se genera una página vacía. Esta función los colapsa a uno solo.
function eliminarPaginasVacias(xml) {
  // Un párrafo con SOLO un page break y ningún texto crea una página en blanco
  // cuando ya hay un page break antes.
  // Detectamos pares: [párrafo con page break][...sin texto...][párrafo con page break puro]
  // y eliminamos el segundo.

  const allParas = [];
  const paraRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = paraRe.exec(xml)) !== null) {
    const hasPageBreak = m[0].includes('w:type="page"');
    const texts = [...m[0].matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map(x => x[1].trim()).filter(Boolean);
    const isPureBreak = hasPageBreak && texts.length === 0;
    allParas.push({ start: m.index, end: m.index + m[0].length, hasPageBreak, isPureBreak, texts });
  }

  const toRemove = new Set();
  for (let i = 0; i < allParas.length - 1; i++) {
    if (!allParas[i].hasPageBreak) continue;
    // Verificar que entre i e i+1 no hay texto real
    let j = i + 1;
    let hasTextBetween = false;
    while (j < allParas.length) {
      if (allParas[j].texts.length > 0) { hasTextBetween = true; break; }
      if (allParas[j].hasPageBreak) break;
      j++;
    }
    if (!hasTextBetween && j < allParas.length && allParas[j].isPureBreak) {
      toRemove.add(j);
    }
  }

  if (!toRemove.size) return xml;

  let result = '';
  let pos = 0;
  allParas.forEach((para, i) => {
    if (!toRemove.has(i)) {
      result += xml.slice(pos, para.start) + xml.slice(para.start, para.end);
    } else {
      result += xml.slice(pos, para.start);
    }
    pos = para.end;
  });
  result += xml.slice(pos);
  return result;
}

// ── Fusión de numbering.xml ───────────────────────────────────────────────────
// Copia las definiciones de numeración de zip2 a zip1 con IDs desplazados
// para evitar conflictos. Devuelve el contentXml con los numId remapeados.
// seccionNum: número de sección 1-based que le corresponde al ensayo de zip2.
function mergeNumbering(zip1, zip2, contentXml, seccionNum) {
  const entry2 = zip2.files['word/numbering.xml'];
  if (!entry2) return contentXml;

  const num2Xml = entry2.asText();
  let num1Xml = zip1.files['word/numbering.xml']
    ? zip1.files['word/numbering.xml'].asText()
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>';

  // Calcular offsets para evitar colisiones de IDs.
  // Bug fix: sin `+1`, numIdOffset queda en el máximo existente y remapea a un
  // ID ya usado → Word rechaza el docx con "Xml parsing error" en numbering.xml.
  const existingAbstract = [...num1Xml.matchAll(/w:abstractNumId="(\d+)"/g)].map(m => +m[1]);
  const existingNums     = [...num1Xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"/g)].map(m => +m[1]);
  const abstractOffset   = (existingAbstract.length ? Math.max(...existingAbstract) : -1) + 1;
  const numIdOffset      = (existingNums.length     ? Math.max(...existingNums)     :  0) + 1;

  // Remap IDs en el bloque de numeración de zip2
  let remapped = num2Xml
    // abstractNum definitions: w:abstractNumId="X" → offset
    .replace(/<w:abstractNum\b([^>]*)w:abstractNumId="(\d+)"/g,
      (_, pre, id) => `<w:abstractNum${pre}w:abstractNumId="${+id + abstractOffset}"`)
    // referencias abstractNumId dentro de <w:num>
    .replace(/<w:abstractNumId w:val="(\d+)"/g,
      (_, id) => `<w:abstractNumId w:val="${+id + abstractOffset}"`)
    // numId en <w:num ...>
    .replace(/<w:num\b([^>]*)w:numId="(\d+)"/g,
      (_, pre, id) => `<w:num${pre}w:numId="${+id + numIdOffset}"`);

  // Remap referencias en el contentXml del ensayo
  let newContent = contentXml.replace(/<w:numId w:val="(\d+)"/g,
    (_, id) => `<w:numId w:val="${+id + numIdOffset}"`);

  // Extraer definiciones de zip2 para insertarlas en zip1
  const abstracts = [...remapped.matchAll(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g)].map(m => m[0]);
  const numDefs   = [...remapped.matchAll(/<w:num\b[\s\S]*?<\/w:num>/g)].map(m => m[0]);

  // Agregar startOverride en nivel 0 para que la sección empiece en seccionNum
  const numDefsWithOverride = numDefs.map(def => {
    // Solo aplicar al numId que se usa en nivel 0 del encabezado de sección
    return def.replace('</w:num>',
      `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${seccionNum}"/></w:lvlOverride>` +
      `<w:lvlOverride w:ilvl="1"><w:startOverride w:val="1"/></w:lvlOverride>` +
      '</w:num>');
  });

  // Insertar en numbering.xml de zip1
  const merged = num1Xml.replace('</w:numbering>',
    abstracts.join('') + numDefsWithOverride.join('') + '</w:numbering>');
  zip1.file('word/numbering.xml', merged);

  return newContent;
}

// Elimina cualquier <w:br w:type="page"/> inline del contenido de un ensayo y
// prepend un párrafo dedicado con page-break puro (tamaño mínimo para que no
// agregue espacio visible arriba del título). Esto garantiza que cada ensayo
// combinado empiece siempre en una página nueva, sin depender del layout que
// traiga el template original ni del contenido previo.
function normalizarPageBreakEntreEnsayos(xml) {
  const sinInline = xml.replace(/<w:br\s+w:type="page"\s*\/>/g, '');
  const pbPara = '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/>' +
    '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr>' +
    '<w:r><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' +
    '<w:br w:type="page"/></w:r></w:p>';
  return pbPara + sinInline;
}

// Si el bloque de ensayo empieza con un párrafo que solo contiene un page break
// (patrón: <w:p><w:r><w:br w:type="page"/></w:r></w:p>), lo fusiona como
// primer run del párrafo siguiente para evitar la línea vacía arriba del título.
function fusionarPageBreakConTitulo(xml) {
  // Detectar si el primer párrafo es un PB puro (sin texto)
  const firstPMatch = xml.match(/^(<w:p\b[^>]*>[\s\S]*?<\/w:p>)/);
  if (!firstPMatch) return xml;
  const firstP = firstPMatch[1];
  if (!firstP.includes('w:type="page"')) return xml;
  const txts = (firstP.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g,'').trim());
  if (txts.some(t => t.length > 0)) return xml;  // tiene texto, no es PB puro

  // Es un PB puro — moverlo dentro del párrafo siguiente
  const rest = xml.slice(firstP.length);
  const nextPMatch = rest.match(/^(<w:p\b[^>]*>[\s\S]*?<\/w:p>)/);
  if (!nextPMatch) return xml;
  const nextP = nextPMatch[1];

  // Insertar run de PB como primer run del párrafo siguiente (después de </w:pPr>)
  const pbRun = '<w:r><w:br w:type="page"/></w:r>';
  let newNextP;
  if (nextP.includes('</w:pPr>')) {
    newNextP = nextP.replace('</w:pPr>', '</w:pPr>' + pbRun);
  } else {
    // Sin pPr — insertar al inicio del párrafo
    newNextP = nextP.replace(/^(<w:p\b[^>]*>)/, '$1' + pbRun);
  }

  return newNextP + rest.slice(nextPMatch[1].length);
}

// Fusiona las imágenes (word/media/*) y relaciones de imagen del ensayo 2 al
// zip combinado, reasignando rIds para evitar colisiones. Devuelve el
// `ensayo2Content` con las referencias `r:embed` actualizadas a los nuevos rIds.
function fusionarImagenes(zip1, zip2, ensayo2Content, ensayoIndex) {
  // 1) Encontrar los rIds que usa ensayo2Content (en <a:blip r:embed="rIdXX"/>)
  const usados = new Set();
  [...ensayo2Content.matchAll(/r:embed="(rId\d+)"/g)].forEach(m => usados.add(m[1]));
  if (usados.size === 0) return ensayo2Content;

  // 2) Leer las relaciones de zip2 e identificar las que apuntan a imágenes
  const rels2 = zip2.files['word/_rels/document.xml.rels'].asText();
  const rels2Match = [...rels2.matchAll(/<Relationship\s+Id="([^"]+)"\s+Type="([^"]*image[^"]*)"\s+Target="([^"]+)"\s*\/>/g)];
  const imgRels = rels2Match
    .filter(m => usados.has(m[1]))
    .map(m => ({ rId: m[1], type: m[2], target: m[3] }));
  if (imgRels.length === 0) return ensayo2Content;

  // 3) Leer las relaciones de zip1 y calcular el máximo rId existente
  let rels1 = zip1.files['word/_rels/document.xml.rels'].asText();
  const existing1 = [...rels1.matchAll(/Id="rId(\d+)"/g)].map(m => parseInt(m[1], 10));
  // Base alta para evitar colisiones — usar 1000 + ensayoIndex*100
  let nextRId = Math.max(1000 + ensayoIndex * 100, (existing1.length ? Math.max(...existing1) : 0) + 1);

  // 4) Para cada imagen usada: copiar el archivo media + agregar relación en zip1
  //    con un rId nuevo y reemplazar la referencia en ensayo2Content.
  const reemplazos = [];
  imgRels.forEach(({ rId, type, target }) => {
    // target suele ser "media/imagen_xxx.jpg" → ruta en zip2 es "word/media/imagen_xxx.jpg"
    const srcPath = target.startsWith('/') ? target.slice(1) : 'word/' + target;
    const fileEntry = zip2.files[srcPath];
    if (!fileEntry) return;
    // Generar nombre único para evitar colisión en word/media/ del combinado
    const ext = (target.match(/\.(\w+)$/) || ['', 'jpg'])[1];
    const newName = `media/img_e${ensayoIndex}_${rId}.${ext}`;
    const newPath = 'word/' + newName;
    if (!zip1.files[newPath]) {
      zip1.file(newPath, fileEntry.asUint8Array());
    }
    const newRId = `rId${nextRId++}`;
    rels1 = rels1.replace('</Relationships>',
      `<Relationship Id="${newRId}" Type="${type}" Target="${newName}"/></Relationships>`);
    reemplazos.push({ oldRId: rId, newRId });
  });
  zip1.file('word/_rels/document.xml.rels', rels1);

  // Asegurar Content_Types tenga las extensiones de imagen
  let ct = zip1.files['[Content_Types].xml'].asText();
  if (!ct.includes('Extension="jpg"')) {
    ct = ct.replace('</Types>',
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="png" ContentType="image/png"/></Types>');
    zip1.file('[Content_Types].xml', ct);
  }

  // 5) Reemplazar referencias en ensayo2Content
  let result = ensayo2Content;
  reemplazos.forEach(({ oldRId, newRId }) => {
    result = result.split(`r:embed="${oldRId}"`).join(`r:embed="${newRId}"`);
  });
  return result;
}

// Combina dos buffers de docx generados por template:
// buf1 es la base (con carátula); buf2 aporta solo su sección de ensayo.
// ensayoIndex: índice 0-based del ensayo en la lista (buf2 siempre es ≥1).
function combinarBuffers(buf1, buf2, ensayoIndex = 1) {
  const zip1 = new PizZip(buf1);
  const zip2 = new PizZip(buf2);
  let xml1 = zip1.files['word/document.xml'].asText();
  const xml2 = zip2.files['word/document.xml'].asText();

  // Hallar FIN DE INFORME en xml1 (tolerando partido por bookmarks)
  const fin1Pos = findFinDeInformePos(xml1);
  if (fin1Pos < 0) return buf1;
  const fin1Start = scanBackForTag(xml1, '<w:p', fin1Pos);

  // Extraer sección de ensayo de xml2: desde el salto de página hasta antes de FIN DE INFORME
  const pb2 = xml2.indexOf('w:type="page"');
  if (pb2 < 0) return buf1;
  const ensayo2Start = scanBackForTag(xml2, '<w:p', pb2);
  const fin2Pos = findFinDeInformePos(xml2);
  const ensayo2End = fin2Pos >= 0 ? scanBackForTag(xml2, '<w:p', fin2Pos) : xml2.lastIndexOf('</w:body>');
  let ensayo2Content = xml2.slice(ensayo2Start, ensayo2End > 0 ? ensayo2End : xml2.length);

  // Fusionar numbering.xml y remap numIds en el contenido del ensayo 2
  ensayo2Content = mergeNumbering(zip1, zip2, ensayo2Content, ensayoIndex + 1);

  // Garantizar que el ensayo 2 arranque siempre en una página nueva:
  // 1) Quitar cualquier <w:br w:type="page"/> INLINE que trajera el template.
  // 2) Anteponer un párrafo dedicado con page-break puro.
  // 3) FUSIONAR ese page-break DENTRO del párrafo del título siguiente, así
  //    Word no dibuja la línea/enter vacío arriba del título (el break es
  //    lógico pero no ocupa una línea visual propia).
  ensayo2Content = normalizarPageBreakEntreEnsayos(ensayo2Content);
  ensayo2Content = fusionarPageBreakConTitulo(ensayo2Content);

  // ── Copiar imágenes del ensayo 2 y reasignar rIds ──────────────────────
  // El generator de cada ensayo agrega imágenes (microestructura, vickers, etc.)
  // con rIds locales (rId100, rId200, etc.) y archivos en word/media/. Cuando
  // combinamos, hay que: 1) copiar los archivos media; 2) reasignar rIds para
  // que no colisionen con los de buf1; 3) actualizar las referencias en
  // ensayo2Content para que apunten a los nuevos rIds.
  ensayo2Content = fusionarImagenes(zip1, zip2, ensayo2Content, ensayoIndex);

  // Combinar: buf1 hasta FIN DE INFORME + ensayo2 + FIN DE INFORME y resto de buf1
  const combined = xml1.slice(0, fin1Start) + ensayo2Content + xml1.slice(fin1Start);
  zip1.file('word/document.xml', combined);
  return zip1.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function generarWordCompleto(ot, ensayos, fotosCaratula) {
  const todosConTemplate = ensayos.length > 0 && ensayos.every(e => GENERADORES_TEMPLATE[e.tipo]);

  if (todosConTemplate) {
    // La fecha del encabezado (fecha_finalizacion) SIEMPRE es la de hoy: cada
    // vez que se genera/regenera el informe se toma la fecha actual, así una
    // modificación posterior al ensayo automáticamente actualiza el encabezado.
    const otConFecha = {
      ...ot,
      fecha_finalizacion: hoy(),
      fecha_recepcion:    fmtFecha(ot.fecha_recepcion),
      fecha_aprobacion:   fmtFecha(ot.fecha_aprobacion),
    };
    // ── OAA uniforme ──
    // Si TODOS los ensayos comparten el mismo estado OAA (todos acreditados o
    // todos no acreditados), el asterisco y la nota OAA pierden sentido (no
    // hay nada que diferenciar). Marcamos los `datos.oaa` como `false` para
    // omitir las marcas en cada generator.
    const oaaFlags = ensayos.map(e => {
      try {
        const d = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : e.datos_json;
        // Macrografía y varios son OAA por default (los demás dependen del flag).
        if (d && d.oaa === false) return false;
        if (e.tipo === 'macrografia' || e.tipo === 'varios' || e.tipo === 'liquidos-penetrantes' || e.tipo === 'metalografia-general' || e.tipo === 'anexo-metalografico') return true;
        return !!(d && d.oaa);
      } catch { return false; }
    });
    const todosOAA   = oaaFlags.every(f => f === true);
    const ningunoOAA = oaaFlags.every(f => f === false);
    const omitirMarcasOAA = todosOAA || ningunoOAA;

    let resultBuf = null;
    for (let i = 0; i < ensayos.length; i++) {
      const ensayo = ensayos[i];
      let datos;
      try {
        datos = typeof ensayo.datos_json === 'string'
          ? JSON.parse(ensayo.datos_json)
          : ensayo.datos_json;
      } catch {
        throw new Error(`Error al parsear datos del ensayo ${ensayo.tipo}`);
      }
      // Mapear campos v2 (del form) → v1 (que esperan los templates).
      // Sin esto, el front guarda `norma` pero los generators leen `norma_ensayo`
      // (y similares en otros ensayos), generando informes con campos vacíos.
      try { datos = traducirV2aV1(ensayo.tipo, datos); } catch {}
      // Si OAA es uniforme entre todos los ensayos, omitir marcas (sin asterisco
      // en el título ni nota "Los ensayos marcados con (*)..." al final).
      // Preservamos el oaa original para que los generators (ej. tracción)
      // puedan decidir si insertar la nota de parámetros con asterisco.
      if (omitirMarcasOAA) {
        datos = Object.assign({}, datos, { oaa: false, _oaa_original: oaaFlags[i] });
      }
      // Multi-OT en tracción: si el ensayo tiene muestras con nro_ot_override
      // distinto, filtrar y emitir SOLO las de esta OT. Las de otras OTs se
      // emiten en Words separados cuando se genera desde esa OT.
      if (ensayo.tipo === 'traccion' && Array.isArray(datos.muestras)) {
        datos = Object.assign({}, datos, { _filtro_ot: String(ot.nro_ot || '') });
      }
      // Multi-OT en plegado (mismo mecanismo): filtra probetas por _filtro_ot.
      if (ensayo.tipo === 'plegado' && (Array.isArray(datos.resultados) || Array.isArray(datos.probetas))) {
        datos = Object.assign({}, datos, { _filtro_ot: String(ot.nro_ot || '') });
      }
      // Multi-OT en impacto: idem — filtra `resultados` por nro_ot_override.
      if (ensayo.tipo === 'impacto' && Array.isArray(datos.resultados)) {
        datos = Object.assign({}, datos, { _filtro_ot: String(ot.nro_ot || '') });
      }
      // Multi-OT en nick-break: filtra `probetas` por nro_ot_override.
      if (ensayo.tipo === 'nick-break' && (Array.isArray(datos.probetas) || Array.isArray(datos.resultados))) {
        datos = Object.assign({}, datos, { _filtro_ot: String(ot.nro_ot || '') });
      }
      // Multi-OT en metalografía general y anexo metalográfico: filtra las
      // IMÁGENES por nro_ot_override + aplica textos_por_ot y condiciones_por_ot.
      if ((ensayo.tipo === 'metalografia-general' || ensayo.tipo === 'anexo-metalografico')) {
        datos = Object.assign({}, datos, { _filtro_ot: String(ot.nro_ot || '') });
      }
      const fotos = i === 0 ? fotosCaratula : null;
      const buf = GENERADORES_TEMPLATE[ensayo.tipo](otConFecha, datos, fotos);
      resultBuf = resultBuf === null ? buf : combinarBuffers(resultBuf, buf, i);
    }
    // Post-procesar el documento combinado
    if (resultBuf && ensayos.length > 1) {
      const zipFinal = new PizZip(resultBuf);
      let xmlFinal = zipFinal.files['word/document.xml'].asText();

      // 1. Numeración OOXML automática
      // Los templates tienen tmpls Y nsids únicos. Como seguridad extra, se
      // randomizan en cada generación para garantizar listas completamente independientes.
      const numEntry = zipFinal.files['word/numbering.xml'];
      if (numEntry) {
        const rand8 = () => [...Array(8)].map(() =>
          Math.floor(Math.random() * 16).toString(16).toUpperCase()).join('');
        let numXml = numEntry.asText()
          .replace(/<w:tmpl w:val="[^"]+"/g, () => `<w:tmpl w:val="${rand8()}"`)
          .replace(/<w:nsid w:val="[^"]+"/g,  () => `<w:nsid w:val="${rand8()}"`);
        // Sanidad: validar que numbering.xml esté bien formado. Si Word no
        // puede parsearlo, el .docx queda corrupto ("Xml parsing error").
        // Chequeos mínimos: cierre correcto de tags críticos y NaN en numIds.
        if (!/<w:numbering[\s>]/.test(numXml) || !/<\/w:numbering>\s*$/.test(numXml) ||
            /w:numId="NaN"/.test(numXml) || /w:abstractNumId="NaN"/.test(numXml) ||
            /w:val="NaN"/.test(numXml)) {
          console.warn('[numbering.xml] XML inválido detectado — se reemplaza por versión mínima');
          numXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>';
        }
        zipFinal.file('word/numbering.xml', numXml);
      }

      // 2. Renumerar secciones (títulos de ensayo y subtítulos)
      xmlFinal = renumerarSecciones(xmlFinal, 1);

      // 2.1. Limpiar <w:p .../> self-closing residuales del template
      //      (Word los inserta como remnants; no los detecta nuestro filtro de blancos)
      xmlFinal = limpiarSelfClosingParas(xmlFinal);

      // 2.2. Normalizar EXACTAMENTE 1 párrafo blanco entre subtítulos N.M.
      //      Aplica a quimicos/vickers (que no tenían blank) y a plegado (que tenía 2)
      xmlFinal = ajustarBlancoEntreSubtitulos(xmlFinal);

      // 2.3. Insertar blank después del caption "Tabla N°X - …" si el siguiente
      //      párrafo tiene texto (indicaciones, notas, OAA, etc.)
      xmlFinal = insertarBlancoTrasCaption(xmlFinal);

      // 2.4. Separar con 1 blank cada línea final tras el caption
      //      (PL 2 - … / Las condiciones … / OAA)
      xmlFinal = separarLineasFinales(xmlFinal);

      // 3. Renumerar tablas e imágenes
      xmlFinal = renumerarTablas(xmlFinal);

      // 3. Eliminar páginas vacías (dobles page breaks)
      xmlFinal = eliminarPaginasVacias(xmlFinal);

      // 4. Cada ensayo conserva su propia línea OAA al final de su bloque.
      //    (La consolidación previa que dejaba UN solo OAA al final del informe
      //    fue desactivada — usuario prefiere ver el aviso después de cada ensayo.)
      // xmlFinal = consolidarOAAs(xmlFinal);

      zipFinal.file('word/document.xml', xmlFinal);
      resultBuf = zipFinal.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    }

    // Insertar sección "INSPECCIÓN" antes de FIN DE INFORME si la OT trae texto
    if (resultBuf && ot.inspeccion_texto) {
      resultBuf = insertarInspeccionAntesDeFin(resultBuf, ot.inspeccion_texto);
    }
    // Reemisión OAA: si ot._reemision_oaa está seteado (informe acreditado
    // versión > 1), insertar las 2 líneas obligatorias entre la carátula y
    // el primer ensayo.
    if (resultBuf && ot._reemision_oaa) {
      resultBuf = insertarReemisionOAA(resultBuf, ot._reemision_oaa);
    }
    if (resultBuf) resultBuf = limitarAnchoTablas(resultBuf);
    // Uniformar interlineado a 1.15 en todo el informe ANTES de spacingCeroEnCeldas,
    // así las celdas de tabla se recomprimen a 1.0 y sólo el cuerpo queda en 1.15.
    if (resultBuf) resultBuf = normalizarInterlineado(resultBuf);
    if (resultBuf) resultBuf = spacingCeroEnCeldas(resultBuf);
    if (resultBuf) resultBuf = forzarCompatModerno(resultBuf);
    if (resultBuf) resultBuf = normalizarTamanoLetra(resultBuf);
    if (resultBuf) resultBuf = asegurarBlankoAntesFin(resultBuf);
    if (resultBuf) resultBuf = eliminarParrafosVaciosTrasFin(resultBuf);
    if (resultBuf) resultBuf = asegurarBlanksAntesDeOAA(resultBuf);
    if (resultBuf) resultBuf = quitarBlankTrasHeading(resultBuf, 'EVALUACION DE RESULTADOS');
    if (ot.es_preinforme && resultBuf) resultBuf = aplicarCambiosPreinforme(resultBuf);
    // Fecha dinámica del encabezado (SAVEDATE) — se actualiza sola cuando el
    // usuario guarda el archivo en Word.
    if (resultBuf) resultBuf = insertarFechaAutoEnHeader(resultBuf);
    return resultBuf;
  }

  // ─── Enfoque legacy: armar documento con docx library ────────────────────────
  const fecha = ot.fecha_finalizacion || hoy();

  const encabezado = crearEncabezado({
    nro_ot:        ot.nro_ot,
    fecha,
    razon_social:  ot.razon_social,
  });

  const elementosCaratula = generarCaratula({
    id_muestra:         ot.id_muestra,
    fecha_recepcion:    ot.fecha_recepcion,
    fecha_aprobacion:   ot.fecha_aprobacion,
    fecha_finalizacion: ot.fecha_finalizacion,
    fotos:              fotosCaratula || [],
  });

  const elementosEnsayos = [];
  let numTabla = 1;

  ensayos.forEach((ensayo, idx) => {
    const generador = GENERADORES[ensayo.tipo];
    if (!generador) return;

    let datos;
    try {
      datos = typeof ensayo.datos_json === 'string'
        ? JSON.parse(ensayo.datos_json)
        : ensayo.datos_json;
    } catch {
      return;
    }

    datos.nro_ot = ot.nro_ot;

    const esPrimerEnsayo = idx === 0;
    const { elementos, tablasUsadas } = generador(datos, numTabla, esPrimerEnsayo);

    if (!esPrimerEnsayo) {
      elementosEnsayos.push(new Paragraph({ children: [new PageBreak()] }));
    }

    elementosEnsayos.push(...elementos);
    numTabla += tablasUsadas;
  });

  elementosEnsayos.push(finDeInforme());

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 22,
            language: { value: 'es-AR' },
          },
          paragraph: {
            spacing: { after: 160, line: 259, lineRule: 'auto' },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top:    0,
              right:  1134,
              bottom: 1077,
              left:   1559,
              header: 709,
              footer: 709,
            },
          },
        },
        headers: {
          default: encabezado,
        },
        children: [
          ...elementosCaratula,
          new Paragraph({ children: [new PageBreak()] }),
          ...elementosEnsayos,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// Limita el ancho de las tablas a 15 cm (8505 twips). Si una tabla excede,
// escala proporcionalmente <w:gridCol>, <w:tcW dxa> y <w:tblW dxa>.
function limitarAnchoTablas(buf) {
  const MAX_TWIPS = 8505; // 15 cm × 567 twips/cm
  const zip = new PizZip(buf);
  const xmlOrig = zip.files['word/document.xml'].asText();
  let modified = false;

  const xmlNuevo = xmlOrig.replace(/<w:tbl>([\s\S]*?)<\/w:tbl>/g, (full, body) => {
    const cols = [...body.matchAll(/<w:gridCol w:w="(\d+)"/g)].map(m => parseInt(m[1], 10));
    const suma = cols.reduce((a, b) => a + b, 0);
    if (suma <= MAX_TWIPS || suma === 0) return full;

    const factor = MAX_TWIPS / suma;
    modified = true;
    const escalar = n => Math.max(1, Math.floor(parseInt(n, 10) * factor));

    const newBody = body
      .replace(/<w:gridCol w:w="(\d+)"/g,                 (_, n) => `<w:gridCol w:w="${escalar(n)}"`)
      .replace(/<w:tcW w:w="(\d+)"\s+w:type="dxa"/g,       (_, n) => `<w:tcW w:w="${escalar(n)}" w:type="dxa"`)
      .replace(/<w:tblW w:w="(\d+)"\s+w:type="dxa"/g,      (_, n) => `<w:tblW w:w="${escalar(n)}" w:type="dxa"`);
    return '<w:tbl>' + newBody + '</w:tbl>';
  });

  if (!modified) return buf;
  zip.file('word/document.xml', xmlNuevo);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Fuerza <w:spacing w:after="0" w:before="0"/> en todos los párrafos dentro de
// celdas de tabla (<w:tc>). Cubre todos los ensayos sin duplicar código por generador.
function spacingCeroEnCeldas(buf) {
  const zip = new PizZip(buf);
  const xmlOrig = zip.files['word/document.xml'].asText();
  let modified = false;

  // Spacing compacto: sin espacio antes/después + interlineado simple.
  // El `w:line="240"` con lineRule=auto = interlineado 1.0 (single). Sin esto,
  // aunque `after="0"` esté, un `line="276"` (1.15) hereda del template y se
  // sigue viendo espacio "de sobra" abajo del texto dentro de la celda.
  const SPACING_COMPACTO = '<w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/>';

  const xmlNuevo = xmlOrig.replace(/(<w:tc\b[^>]*>)([\s\S]*?)(<\/w:tc>)/g, (_, open, body, close) => {
    let nuevo = body;
    // 1. Reemplazar w:spacing existentes (self-closing).
    nuevo = nuevo.replace(/<w:spacing\b[^/]*\/>/g, SPACING_COMPACTO);
    // 2. También capturar variantes con apertura/cierre <w:spacing>…</w:spacing>.
    nuevo = nuevo.replace(/<w:spacing\b[^>]*>[\s\S]*?<\/w:spacing>/g, SPACING_COMPACTO);
    // 3. En <w:pPr> existentes sin <w:spacing>, prepend.
    nuevo = nuevo.replace(/<\/w:pPr>/g, (m, offset) => {
      const pPrOpen = nuevo.lastIndexOf('<w:pPr', offset);
      const slice = pPrOpen >= 0 ? nuevo.slice(pPrOpen, offset) : '';
      if (slice.includes('<w:spacing')) return m;
      return SPACING_COMPACTO + m;
    });
    // 4. <w:p> sin <w:pPr>: inyectar uno minimal con spacing compacto.
    nuevo = nuevo.replace(/(<w:p\b[^>]*>)(?!\s*<w:pPr)/g, `$1<w:pPr>${SPACING_COMPACTO}</w:pPr>`);
    // 5. Vaciar `contextualSpacing` que suele agregar espacio extra en listas.
    // No lo removemos, solo aseguramos que exista para que el spacing no
    // se acumule cuando hay párrafos consecutivos en la misma celda.
    if (nuevo !== body) modified = true;
    return open + nuevo + close;
  });

  if (!modified) return buf;
  zip.file('word/document.xml', xmlNuevo);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Fuerza compatibilityMode=15 (Word 2013+) en settings.xml. En modo 11/14
// (Word 2003/2010) Word abre el documento en "Compatibility Mode" y deshabilita
// los handles de redimensionar imagen, entre otras restricciones modernas.
// Algunos templates (quimicos, plegado, brinell, etc.) heredaron modo 11 de
// archivos legacy; este fix los normaliza al generar para que cualquier .docx
// resultante se abra como documento moderno.
// Quita el párrafo blank que aparece DIRECTAMENTE después de cualquier párrafo
// que contenga `heading` (típicamente "EVALUACION DE RESULTADOS"). Esto cubre
// el caso en que post-procesos del combinado (ajustarBlancoEntreSubtitulos)
// reinsertan un blank que no queremos.
function quitarBlankTrasHeading(buf, heading) {
  const zip = new PizZip(buf);
  const docEntry = zip.files['word/document.xml'];
  if (!docEntry) return buf;
  let xml = docEntry.asText();
  let changed = false;
  const re = /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g;
  // Encontrar todos los párrafos que contienen el heading
  const matches = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const visible = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('');
    if (visible.includes(heading)) matches.push({ end: m.index + m[0].length });
  }
  // De mayor a menor offset (para no invalidar índices)
  for (let i = matches.length - 1; i >= 0; i--) {
    const end = matches[i].end;
    // Saltear whitespace y tags no-<w:p> (bookmarkEnd, proofErr, etc.)
    const sliceFrom = xml.slice(end);
    const pNextMatch = sliceFrom.match(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/);
    if (!pNextMatch) continue;
    const pNextStart = end + sliceFrom.indexOf(pNextMatch[0]);
    const pNextEnd = pNextStart + pNextMatch[0].length;
    const visible = [...pNextMatch[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim();
    if (visible !== '') continue; // siguiente párrafo tiene texto — no es blank, no tocar
    xml = xml.slice(0, pNextStart) + xml.slice(pNextEnd);
    changed = true;
  }
  if (!changed) return buf;
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Garantiza un párrafo en blanco DIRECTAMENTE antes de CADA línea OAA
// (cualquier párrafo que contenga "Los ensayos marcados con (*)" o
// "Los parámetros marcados con (*)"). Si ya hay blank, no agrega otro.
function asegurarBlanksAntesDeOAA(buf) {
  const zip = new PizZip(buf);
  const docEntry = zip.files['word/document.xml'];
  if (!docEntry) return buf;
  let xml = docEntry.asText();

  const fontsBlank = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr>' +
    `<w:r><w:rPr>${fontsBlank}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    '<w:t xml:space="preserve"> </w:t></w:r></w:p>';

  // Encontrar todos los párrafos con "Los ensayos marcados" o "Los parámetros marcados"
  const re = /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g;
  const inserts = []; // posiciones donde insertar BLANK
  let m;
  while ((m = re.exec(xml)) !== null) {
    const visible = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('');
    if (!/Los\s+(?:ensayos|parámetros)\s+marcados\s+con\s*\(\*\)/i.test(visible)) continue;
    // Verificar si el párrafo anterior es ya un blank
    const before = xml.slice(0, m.index);
    const prevClose = before.lastIndexOf('</w:p>');
    let prevEsBlank = false;
    if (prevClose >= 0) {
      const prevOpen = before.lastIndexOf('<w:p', prevClose);
      if (prevOpen >= 0) {
        const prev = before.slice(prevOpen, prevClose + '</w:p>'.length);
        const txts = [...prev.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('').trim();
        prevEsBlank = (txts === '' || /^\s+$/.test(txts));
      }
    }
    if (!prevEsBlank) inserts.push(m.index);
  }

  if (!inserts.length) return buf;
  // Aplicar de mayor a menor offset (para no invalidar índices)
  inserts.sort((a, b) => b - a);
  for (const pos of inserts) {
    xml = xml.slice(0, pos) + BLANK + xml.slice(pos);
  }
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Reemisión OAA: inserta las 2 líneas obligatorias entre la carátula y el
// primer ensayo cuando se emite una versión acreditada > 1:
//   1. "El presente certificado anula y reemplaza al certificado de análisis OT NNN"
//   2. "Motivo del cambio: <texto libre>"
// Punto de inserción: JUSTO ANTES del párrafo que contiene el heading del
// primer ensayo (típicamente "ENSAYO DE …" o similar) — que es lo primero
// después del caption "Imagen N°1 - Estado de recepción".
function insertarReemisionOAA(buf, info) {
  const nroOtPrev = String(info && info.nro_ot_previo || '').trim();
  const motivo = String(info && info.motivo_cambio || '').trim();
  if (!nroOtPrev || !motivo) return buf;
  const zip = new PizZip(buf);
  const docEntry = zip.files['word/document.xml'];
  if (!docEntry) return buf;
  let xml = docEntry.asText();

  // Localizar el primer heading de ensayo: los templates usan numeración
  // automática (numPr numId=16 ilvl=0) O texto literal "N.\t...". Como el
  // post-proceso puede haberlos convertido a literal, buscamos ambos.
  // Estrategia: buscar el primer <w:p> DESPUÉS de la carátula que contenga
  // "Estado de recepción" y tomar el SIGUIENTE párrafo.
  let cursor = 0;
  const recepIdx = xml.indexOf('Estado de recepci');
  if (recepIdx >= 0) {
    const closeCaption = xml.indexOf('</w:p>', recepIdx);
    if (closeCaption > 0) cursor = closeCaption + '</w:p>'.length;
  }
  if (cursor === 0) {
    // Fallback: usar el marker de fin de recepción.
    const pageBreakIdx = xml.indexOf('w:type="page"');
    if (pageBreakIdx > 0) {
      const closeBreak = xml.indexOf('</w:p>', pageBreakIdx);
      if (closeBreak > 0) cursor = closeBreak + '</w:p>'.length;
    }
  }
  if (cursor === 0) return buf;

  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const pLinea = (texto, opts) => {
    opts = opts || {};
    const b = opts.bold ? '<w:b/><w:bCs/>' : '';
    const jc = opts.center ? '<w:jc w:val="center"/>' : '';
    return '<w:p><w:pPr>' +
      '<w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      '<w:ind w:left="851"/>' + jc +
      `<w:rPr>${FONTS}${b}${SZ}</w:rPr></w:pPr>` +
      `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr>` +
      `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
  };

  const bloque =
    pLinea('"El presente certificado anula y reemplaza al certificado de análisis OT ' + nroOtPrev + '"', { bold: true, center: true }) +
    pLinea('Motivo del cambio: ' + motivo, { bold: true }) +
    pLinea(' ');

  xml = xml.slice(0, cursor) + bloque + xml.slice(cursor);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Inserta la sección "INSPECCIÓN" (título en negrita SIN numeración, seguido del
// texto libre en párrafos) justo antes de "FIN DE INFORME". No-op si texto vacío.
function insertarInspeccionAntesDeFin(buf, textoInspeccion) {
  const texto = String(textoInspeccion || '').trim();
  if (!texto) return buf;
  const zip = new PizZip(buf);
  const docEntry = zip.files['word/document.xml'];
  if (!docEntry) return buf;
  let xml = docEntry.asText();

  const finPos = findFinDeInformePos(xml);
  if (finPos < 0) return buf;
  const pStart = scanBackForTag(xml, '<w:p', finPos);
  if (pStart < 0) return buf;

  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

  // Calcular el número: el renumerador ya convirtió los numPr a texto literal
  // ("1.", "2.", …) antes de este punto. Contamos cuántos títulos de nivel 0
  // hay (patrón "<w:t>N.</w:t>" con N entero sin punto interno) y le asignamos
  // el siguiente. Solo miramos después del primer page break para ignorar la
  // carátula.
  const carPBPos = xml.indexOf('w:type="page"');
  const cuerpo = carPBPos >= 0 ? xml.slice(carPBPos) : xml;
  let maxSeccion = 0;
  const rxSecc = /<w:t[^>]*>(\d+)\.<\/w:t>/g;
  let mSec;
  while ((mSec = rxSecc.exec(cuerpo)) !== null) {
    const n = parseInt(mSec[1], 10);
    if (!isNaN(n) && n > maxSeccion) maxSeccion = n;
  }
  const numeroInspeccion = maxSeccion + 1;
  const labelNum = numeroInspeccion + '.';
  // Estructura idéntica a la que produce renumerarSecciones para los headings
  // de ensayo: número literal + tab, sin numPr (ya "hardcodeado").
  const heading = '<w:p><w:pPr>' +
    '<w:pStyle w:val="Textosinformato"/>' +
    '<w:spacing w:line="300" w:lineRule="auto" w:before="120" w:after="60"/>' +
    '<w:ind w:left="710" w:hanging="284"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${labelNum}</w:t></w:r>` +
    `<w:r><w:tab/></w:r>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    '<w:t xml:space="preserve">INSPECCIÓN</w:t></w:r></w:p>';

  const parrafoTexto = (linea) =>
    '<w:p><w:pPr>' +
    '<w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="142"/>' +
    '<w:jc w:val="both"/>' +
    `<w:rPr>${FONTS}${SZ}</w:rPr></w:pPr>` +
    (linea ? `<w:r><w:rPr>${FONTS}${SZ}</w:rPr>` +
             `<w:t xml:space="preserve">${esc(linea)}</w:t></w:r>` : '') +
    '</w:p>';

  const BLANK = '<w:p><w:pPr>' +
    '<w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    `</w:pPr><w:r><w:rPr>${FONTS}${SZ}</w:rPr>` +
    '<w:t xml:space="preserve"> </w:t></w:r></w:p>';

  // Verificar si el párrafo INMEDIATAMENTE anterior al punto de inserción ya
  // es un blank. En ese caso omitimos nuestro propio BLANK para no duplicar
  // (el técnico veía "2 enter" antes de INSPECCIÓN).
  const antes = xml.slice(0, pStart);
  const prevClose = antes.lastIndexOf('</w:p>');
  let previoEsBlank = false;
  if (prevClose >= 0) {
    const prevOpen = antes.lastIndexOf('<w:p', prevClose);
    if (prevOpen >= 0) {
      const prevPara = antes.slice(prevOpen, prevClose + '</w:p>'.length);
      const txts = [...prevPara.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
      previoEsBlank = (txts === '' || /^[\s⁠]+$/.test(txts));
    }
  }
  const parrafos = texto.split(/\r?\n/).map(parrafoTexto).join('');
  const bloque = (previoEsBlank ? '' : BLANK) + heading + parrafos + BLANK;
  xml = xml.slice(0, pStart) + bloque + xml.slice(pStart);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Elimina párrafos vacíos que queden DESPUÉS de "FIN DE INFORME" y antes del
// <w:sectPr> final. El template original tiene 3 párrafos vacíos ahí que
// hacen que Word abra una página vacía extra al final. Los borramos.
function eliminarParrafosVaciosTrasFin(buf) {
  const zip = new PizZip(buf);
  const docEntry = zip.files['word/document.xml'];
  if (!docEntry) return buf;
  let xml = docEntry.asText();

  // Encontrar el párrafo que contiene "FIN DE INFORME" y quedarnos con la
  // posición del </w:p> que lo cierra.
  const finPos = xml.indexOf('FIN DE INFORME');
  if (finPos < 0) return buf;
  const closeFin = xml.indexOf('</w:p>', finPos);
  if (closeFin < 0) return buf;
  const trasFin = closeFin + '</w:p>'.length;

  // Encontrar el <w:sectPr> final del body (el que cierra el documento).
  const sectPrIdx = xml.indexOf('<w:sectPr', trasFin);
  if (sectPrIdx < 0) return buf;

  // Borrar todos los párrafos VACÍOS (sin <w:t> con texto) entre FIN y sectPr.
  const bloque = xml.slice(trasFin, sectPrIdx);
  const limpio = bloque.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (parrafo) => {
    const txts = [...parrafo.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
    return txts ? parrafo : '';
  });
  if (limpio === bloque) return buf;

  xml = xml.slice(0, trasFin) + limpio + xml.slice(sectPrIdx);
  zip.file('word/document.xml', xml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Garantiza un párrafo en blanco DIRECTAMENTE antes de "FIN DE INFORME".
// Si ya hay uno, no agrega otro. Si no hay, lo inserta.
function asegurarBlankoAntesFin(buf) {
  const zip = new PizZip(buf);
  const docEntry = zip.files['word/document.xml'];
  if (!docEntry) return buf;
  let xml = docEntry.asText();

  const finPos = xml.indexOf('FIN DE INFORME');
  if (finPos < 0) return buf;
  // Buscar inicio del párrafo de FIN
  let i = finPos;
  while (i > 0) {
    const k = xml.lastIndexOf('<w:p', i - 1);
    if (k < 0) break;
    const c = xml[k + 4];
    if (c === '>' || c === ' ' || c === '\r' || c === '\n') { i = k; break; }
    i = k;
  }
  if (i === finPos) return buf;
  const pFinStart = i;

  // ¿El párrafo anterior es ya un blank?
  const before = xml.slice(0, pFinStart);
  const prevClose = before.lastIndexOf('</w:p>');
  if (prevClose >= 0) {
    const prevOpen = before.lastIndexOf('<w:p', prevClose);
    if (prevOpen >= 0) {
      const prevPara = before.slice(prevOpen, prevClose + '</w:p>'.length);
      const txts = [...prevPara.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
      if (txts === '' || /^\s+$/.test(txts)) return buf; // ya hay blank
    }
  }

  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    '<w:t xml:space="preserve"> </w:t></w:r></w:p>';
  const nuevo = xml.slice(0, pFinStart) + BLANK + xml.slice(pFinStart);
  zip.file('word/document.xml', nuevo);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Normaliza el tamaño de letra del cuerpo a 11pt (sz=22):
//  1. En `word/styles.xml` cambia los styles "Textosinformato", "Normal" y los
//     docDefaults a sz=22.
//  2. En `word/document.xml` agrega <w:sz w:val="22"/> a runs con texto que NO
//     tengan <w:sz> (esos heredan el style del párrafo).
function normalizarTamanoLetra(buf) {
  const zip = new PizZip(buf);
  let mod = false;

  // 1) styles.xml: forzar sz=22 en docDefaults, Textosinformato y Normal
  const stylesEntry = zip.files['word/styles.xml'];
  if (stylesEntry) {
    let styles = stylesEntry.asText();
    const orig = styles;
    // Reemplazar todos los <w:sz>/<w:szCs> dentro de docDefaults y los styles
    // de cuerpo (Textosinformato, Normal). Mantener tamaños de Heading*
    // intactos por si Word los usa.
    styles = styles.replace(/(<w:style\b[^>]*w:styleId="(?:Textosinformato|Normal)"[\s\S]*?<\/w:style>)/g,
      (block) => block
        .replace(/<w:sz w:val="\d+"\/>/g, '<w:sz w:val="22"/>')
        .replace(/<w:szCs w:val="\d+"\/>/g, '<w:szCs w:val="22"/>')
    );
    styles = styles.replace(/(<w:docDefaults>[\s\S]*?<\/w:docDefaults>)/g,
      (block) => block
        .replace(/<w:sz w:val="\d+"\/>/g, '<w:sz w:val="22"/>')
        .replace(/<w:szCs w:val="\d+"\/>/g, '<w:szCs w:val="22"/>')
    );
    if (styles !== orig) { zip.file('word/styles.xml', styles); mod = true; }
  }

  // 2) document.xml: agregar sz=22 a runs sin <w:sz>
  const docEntry = zip.files['word/document.xml'];
  if (docEntry) {
    let xml = docEntry.asText();
    const SZ_TAG = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
    // Caso A: run con <w:rPr>...</w:rPr><w:t...> donde rPr NO contiene <w:sz>
    xml = xml.replace(/(<w:r\b[^>]*>)(<w:rPr>)([\s\S]*?)(<\/w:rPr>)(\s*<w:t[\s>])/g,
      (full, rOpen, rPrOpen, rPrInner, rPrClose, tRest) => {
        if (/<w:sz\b/.test(rPrInner)) return full;
        return rOpen + rPrOpen + rPrInner + SZ_TAG + rPrClose + tRest;
      });
    if (xml !== docEntry.asText()) { zip.file('word/document.xml', xml); mod = true; }
  }

  return mod ? zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) : buf;
}

// Normaliza el interlineado a 1.15 (w:line="276" w:lineRule="auto") en TODOS los
// párrafos del document.xml y en los docDefaults/Normal/Textosinformato de styles.xml.
// Preserva w:before/w:after existentes. NO toca <w:spacing w:val="X"/> dentro de
// <w:rPr> (character spacing) — se identifica por ausencia de w:line/w:before/w:after.
function normalizarInterlineado(buf) {
  const LINE = '276', RULE = 'auto';
  const forzarEnSpacing = (attrs) => {
    if (!/w:line=|w:before=|w:after=|w:lineRule=/.test(attrs)) return null; // no es paragraph spacing
    let a = attrs
      .replace(/\s*w:line="\d+"/, '')
      .replace(/\s*w:lineRule="[^"]*"/, '');
    return `<w:spacing${a} w:line="${LINE}" w:lineRule="${RULE}"/>`;
  };

  const zip = new PizZip(buf);
  let mod = false;

  for (const path of ['word/document.xml', 'word/styles.xml']) {
    const entry = zip.files[path];
    if (!entry) continue;
    const orig = entry.asText();
    const nuevo = orig.replace(/<w:spacing\b([^/>]*?)\/>/g, (m, attrs) => {
      const rep = forzarEnSpacing(attrs);
      return rep === null ? m : rep;
    });
    if (nuevo !== orig) { zip.file(path, nuevo); mod = true; }
  }

  return mod ? zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) : buf;
}

function forzarCompatModerno(buf) {
  const zip = new PizZip(buf);
  const sxml = zip.files['word/settings.xml'];
  if (!sxml) return buf;
  const orig = sxml.asText();
  const m = orig.match(/<w:compatSetting w:name="compatibilityMode"[^>]*w:val="(\d+)"/);
  if (m && m[1] === '15') return buf;

  const MODERN = '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
    '<w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>' +
    '<w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>' +
    '<w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>' +
    '<w:compatSetting w:name="differentiateMultirowTableHeaders" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>';

  let nuevo = orig.replace(/<w:compatSetting\b[^>]*\/>/g, '');
  if (nuevo.includes('</w:compat>')) {
    nuevo = nuevo.replace('</w:compat>', MODERN + '</w:compat>');
  } else if (nuevo.includes('<w:compat/>')) {
    nuevo = nuevo.replace('<w:compat/>', '<w:compat>' + MODERN + '</w:compat>');
  } else {
    nuevo = nuevo.replace('</w:settings>', '<w:compat>' + MODERN + '</w:compat></w:settings>');
  }
  zip.file('word/settings.xml', nuevo);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Reemplaza la fecha del encabezado por la fecha ACTUAL (del momento de la
// emisión, server time) como texto plano. Cada nueva emisión (incluidas las
// versiones -1, -2, ...) refleja el momento real en que se generó.
//
// Antes se usaba un campo SAVEDATE dinámico + <w:updateFields>, pero eso
// disparaba el popup de Word "Este documento contiene campos que pueden hacer
// referencia a otros archivos". Ahora es texto estático → sin popup.
function insertarFechaAutoEnHeader(buf) {
  const zip = new PizZip(buf);

  const hoyDate = new Date();
  const pad = n => String(n).padStart(2, '0');
  const hoyStr = pad(hoyDate.getDate()) + '/' + pad(hoyDate.getMonth() + 1) + '/' + hoyDate.getFullYear();

  const FECHA_RE = /(F[Ee][Cc][Hh][Aa]:[\s\S]{0,600}?)<w:r\b([^>]*)>((?:(?!<w:r\b)[\s\S])*?)(<w:t[^>]*>)(\d{1,2}\/\d{1,2}\/\d{2,4})(<\/w:t>)((?:(?!<\/w:r>)[\s\S])*?)<\/w:r>/;

  for (const fname of Object.keys(zip.files)) {
    if (!/^word\/header\d*\.xml$/.test(fname)) continue;
    const entry = zip.files[fname];
    let xml = entry.asText();

    // Reemplaza solo el contenido del <w:t> (deja el run y sus rPr intactos)
    // por la fecha del servidor al momento de emisión.
    xml = xml.replace(FECHA_RE, (m, prefix, rAttrs, runInner, tOpen, fecha, tClose, runTail) => {
      return prefix + '<w:r' + rAttrs + '>' + runInner + tOpen + hoyStr + tClose + runTail + '</w:r>';
    });

    zip.file(fname, xml);
  }

  // Quitar <w:updateFields> si algún template lo tenía — sin él, Word no
  // pregunta al abrir. Sin campos dinámicos no hay nada que actualizar.
  const settingsEntry = zip.files['word/settings.xml'];
  if (settingsEntry) {
    let settingsXml = settingsEntry.asText();
    if (/<w:updateFields\b[^/]*\/?>/.test(settingsXml)) {
      settingsXml = settingsXml.replace(/<w:updateFields\b[^/]*\/?>(<\/w:updateFields>)?/g, '');
      zip.file('word/settings.xml', settingsXml);
    }
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Post-process del docx generado para agregar "/N" al lado del "OT: XXXX"
// en los encabezados de página. Solo si version > 1 (la v1 sale sin marca).
function aplicarVersionEncabezado(buf, version) {
  if (!version || version <= 1) return buf;
  const zip = new PizZip(buf);
  for (const fname of Object.keys(zip.files)) {
    if (!/^word\/header\d*\.xml$/.test(fname)) continue;
    const entry = zip.files[fname];
    let xml = entry.asText();
    // Caso normal: "OT: 12345" completo dentro de un solo <w:t>.
    xml = xml.replace(/(<w:t[^>]*>OT:\s*[0-9]+)(<\/w:t>)/g, `$1/${version}$2`);
    // Caso partido en varios runs: "<w:t>OT: </w:t>...<w:t>12345</w:t>" —
    // agregamos "/N" al final del <w:t> que contiene el número puro.
    // Detectamos runs con solo dígitos que estén precedidos por "OT:" en el
    // mismo párrafo. Enfoque simple: si la primera regex no aplicó pero
    // existe "OT:" en el header, buscamos el patrón partido.
    if (!/OT:\s*\d+\//.test(xml) && /OT:/.test(xml)) {
      xml = xml.replace(
        /(OT:\s*<\/w:t>[\s\S]{0,300}?<w:t[^>]*>)([0-9]+)(<\/w:t>)/,
        (m, a, num, b) => a + num + '/' + version + b
      );
    }
    zip.file(fname, xml);
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function aplicarCambiosPreinforme(buf) {
  const zip = new PizZip(buf);

  // 1. Cambiar título en TODOS los headers (algunos templates tienen el título
  // "CERTIFICADO DE ANALISIS" en header2 y en header4 — tracción es uno de
  // esos). Antes solo se tocaba header2 y quedaba inconsistente.
  Object.keys(zip.files)
    .filter(f => /^word\/header\d*\.xml$/.test(f))
    .forEach(hdrPath => {
      const entry = zip.files[hdrPath];
      if (!entry) return;
      const hdrXml = entry.asText()
        .replace(/CERTIFICADO DE ANALISIS(?! PRELIMINAR)/g, 'CERTIFICADO DE ANALISIS PRELIMINAR');
      zip.file(hdrPath, hdrXml);
    });

  // 2. Agregar texto preliminar después de FIN DE INFORME.
  // Primero limpiamos cualquier leyenda pre-existente en el docx (algunos
  // templates la traen y al insertar otra sale duplicada).
  let docXml = zip.files['word/document.xml'].asText();
  docXml = docXml.replace(
    /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?El presente documento tiene car[áa]cter de informe preliminar(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g,
    ''
  );
  const finPos = findFinDeInformePos(docXml);
  if (finPos >= 0) {
    // Si está partido, hay que buscar el </w:p> tras el ÚLTIMO <w:t> involucrado
    const tail = docXml.indexOf('INFORME', finPos);
    const pClose = docXml.indexOf('</w:p>', tail >= 0 ? tail : finPos);
    if (pClose >= 0) {
      const insertAt = pClose + '</w:p>'.length;
      const textoPre =
        '<w:p><w:pPr><w:spacing w:before="120"/><w:jc w:val="center"/></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>' +
        '<w:i/><w:iCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>' +
        '<w:t xml:space="preserve">"El presente documento tiene carácter de informe preliminar. ' +
        'Podría verse modificado en futuras evaluaciones y emisiones"</w:t></w:r></w:p>';
      docXml = docXml.slice(0, insertAt) + textoPre + docXml.slice(insertAt);
    }
  }
  zip.file('word/document.xml', docXml);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function hoy() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function fmtFecha(str) {
  if (!str) return '';
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : str;
}

// ── Limpieza de párrafos self-closing residuales ──────────────────────────────
// Word puede dejar <w:p .../> self-closing como "remnants" del template.
// Estos NO los matchea el regex normal de párrafos (<w:p>...</w:p>), por lo
// que escapan a eliminarParrafosVacios y aparecen visualmente como enters
// fantasma (típicamente arriba de subtítulos o en celdas de tabla).
function limpiarSelfClosingParas(xml) {
  // Solo el primer <w:p .../> después del primer page break (saltea carátula).
  // En la carátula a veces <w:p/> se usa intencionalmente como espaciador.
  const pbPos = xml.indexOf('w:type="page"');
  if (pbPos < 0) {
    return xml.replace(/<w:p\b[^>]*\/>/g, '');
  }
  const head = xml.slice(0, pbPos);
  const tail = xml.slice(pbPos);
  return head + tail.replace(/<w:p\b[^>]*\/>/g, '');
}

// ── Normaliza EXACTAMENTE 1 párrafo blanco entre subtítulos N.M. ──────────────
// Tras renumerarSecciones, los títulos contienen literal "N." y subtítulos
// "N.M.". Esta función garantiza que entre cualquier subtítulo y el contenido
// anterior haya EXACTAMENTE 1 párrafo blanco — salvo cuando el subtítulo viene
// directamente después del título (donde NO debe haber blank).
function ajustarBlancoEntreSubtitulos(xml) {
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const parts = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    parts.push({ start: m.index, end: re.lastIndex, text: m[0] });
  }

  const isBlank = p => {
    if (p.includes('w:type="page"')) return false;
    const txts = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, ''));
    return !txts.length || txts.every(t => t.trim() === '');
  };
  const isTitulo0 = p => {
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '').trim());
    return wts.some(t => /^\d+\.$/.test(t));
  };
  const isSubtitulo = p => {
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '').trim());
    return wts.some(t => /^\d+\.\d+\.$/.test(t));
  };

  // Planificar ediciones: (a) insertar blank antes de subtitulo si falta;
  // (b) quitar blanks extras (>1) antes de subtitulo.
  const toInsert = []; // indices donde insertar BLANK antes
  const toRemove = []; // {start,end} de párrafos a eliminar (blanks extras)
  let lastWasTitulo = false;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].text;
    if (isTitulo0(p)) { lastWasTitulo = true; continue; }
    if (isSubtitulo(p)) {
      if (lastWasTitulo) {
        // El subtítulo viene inmediato al título: NO debe haber blank en medio
        // (si lo hay, eliminarlo). Esto cubre los blanks fantasma residuales.
        let j = i - 1;
        while (j >= 0 && isBlank(parts[j].text)) {
          toRemove.push({ start: parts[j].start, end: parts[j].end });
          j--;
        }
      } else {
        // Contar blanks consecutivos antes del subtítulo
        let blankIdx = [];
        let j = i - 1;
        while (j >= 0 && isBlank(parts[j].text)) {
          blankIdx.push(j);
          j--;
        }
        if (blankIdx.length === 0) {
          // No hay blank → insertar 1
          toInsert.push(parts[i].start);
        } else if (blankIdx.length > 1) {
          // Hay más de 1 → eliminar los extras (dejar solo el primero)
          for (let k = 0; k < blankIdx.length - 1; k++) {
            toRemove.push({ start: parts[blankIdx[k]].start, end: parts[blankIdx[k]].end });
          }
        }
      }
      lastWasTitulo = false;
    } else if (!isBlank(p)) {
      lastWasTitulo = false;
    }
  }

  if (!toInsert.length && !toRemove.length) return xml;

  // Aplicar todos los cambios de mayor a menor offset (para no invalidar índices)
  const ops = [];
  toInsert.forEach(start => ops.push({ type: 'insert', start }));
  toRemove.forEach(({ start, end }) => ops.push({ type: 'remove', start, end }));
  ops.sort((a, b) => b.start - a.start);

  let result = xml;
  for (const op of ops) {
    if (op.type === 'insert') {
      result = result.slice(0, op.start) + BLANK + result.slice(op.start);
    } else {
      result = result.slice(0, op.start) + result.slice(op.end);
    }
  }
  return result;
}

// ── Inserta 1 blank después del caption "Tabla N°X - …" ───────────────────────
// Tras una tabla de resultados, el template muestra el caption seguido directo
// del texto de indicaciones / observaciones / OAA. El informe real tiene un
// párrafo blanco entre el caption y el contenido siguiente.
function insertarBlancoTrasCaption(xml) {
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const parts = [];
  let m;
  while ((m = re.exec(xml)) !== null) parts.push({ start: m.index, end: re.lastIndex, text: m[0] });

  const isBlank = p => {
    if (p.includes('w:type="page"')) return false;
    const txts = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, ''));
    return !txts.length || txts.every(t => t.trim() === '');
  };
  const isCaption = p => {
    const txt = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '')).join('');
    return /Tabla\s*N[˚°ºo]/i.test(txt);
  };
  const isFinInforme = p => {
    const txt = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '')).join('');
    return /FIN DE INFORME/i.test(txt);
  };

  const toInsert = [];
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isCaption(parts[i].text)) continue;
    const next = parts[i + 1].text;
    if (isBlank(next)) continue;        // ya hay blank después
    if (isFinInforme(next)) continue;   // si el siguiente es FIN DE INFORME, ya tiene espacio
    toInsert.push(parts[i].end);
  }

  if (!toInsert.length) return xml;
  // Aplicar de mayor a menor offset
  toInsert.sort((a, b) => b - a);
  let result = xml;
  for (const start of toInsert) {
    result = result.slice(0, start) + BLANK + result.slice(start);
  }
  return result;
}

// ── Separa con 1 blank las líneas finales tras el caption de tabla ────────────
// Tras "Tabla N°X - …" pueden venir varias líneas de texto (indicaciones tipo
// "PL 2 - Se observa…", "Las condiciones…", OAA). El informe final debe tener
// 1 párrafo blanco entre cada una. La región termina en el siguiente título
// de ensayo (N.) o en FIN DE INFORME (no se inserta blank pegado a FIN).
function separarLineasFinales(xml) {
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const parts = [];
  let m;
  while ((m = re.exec(xml)) !== null) parts.push({ start: m.index, end: re.lastIndex, text: m[0] });

  const getTxt = p => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map(t => t.replace(/<[^>]+>/g, '')).join('');
  const isBlank = p => {
    if (p.includes('w:type="page"')) return false;
    return getTxt(p).trim() === '';
  };
  const isCaption    = p => /Tabla\s*N[˚°ºo]/i.test(getTxt(p));
  const isFin        = p => /FIN DE INFORME/i.test(getTxt(p));
  const isTitulo0    = p => {
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '').trim());
    return wts.some(t => /^\d+\.$/.test(t));
  };
  // Párrafo dentro de celda de tabla: el cierre </w:p> es seguido por </w:tc>
  const enCelda = (i) => {
    const after = xml.slice(parts[i].end, parts[i].end + 20).replace(/^\s+/, '');
    return after.startsWith('</w:tc>');
  };

  const toInsert = [];
  for (let i = 0; i < parts.length; i++) {
    if (!isCaption(parts[i].text)) continue;
    // Recorrer la región caption → título / FIN
    let prevContentIdx = -1;
    for (let j = i + 1; j < parts.length; j++) {
      const p = parts[j].text;
      if (isTitulo0(p) || isFin(p)) break;
      if (isCaption(p)) break;          // siguiente tabla
      if (enCelda(j)) break;            // entramos en otra tabla
      if (isBlank(p)) continue;
      // p es contenido: si hay contenido previo SIN blank entre medio → insertar
      if (prevContentIdx >= 0) {
        let hayBlank = false;
        for (let k = prevContentIdx + 1; k < j; k++) {
          if (isBlank(parts[k].text)) { hayBlank = true; break; }
        }
        if (!hayBlank) toInsert.push(parts[j].start);
      }
      prevContentIdx = j;
    }
  }

  if (!toInsert.length) return xml;
  toInsert.sort((a, b) => b - a);
  let result = xml;
  for (const start of toInsert) {
    result = result.slice(0, start) + BLANK + result.slice(start);
  }
  return result;
}

// Consolida los párrafos OAA en un solo bloque al final del doc combinado.
// Elimina todos los párrafos que contienen "ensayos marcados con (*)" o
// "parámetros marcados con (*)" y re-inserta uno solo (deduplicado) antes
// de "FIN DE INFORME".
function consolidarOAAs(xml) {
  const encontrados = [];   // textos completos a reincluir
  const normalizados = [];  // versiones normalizadas para dedup

  const paraRe = /<w:p\b[^>]*\/>|<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g;
  const out = xml.replace(paraRe, p => {
    const texto = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    if (/(?:ensayos|parámetros)\s+marcados\s+con\s+\(\*\)/i.test(texto)) {
      // Normalizar para dedup: quitar comillas (incluyendo &quot;), puntos finales, espacios
      const norm = texto.trim()
        .replace(/&quot;/g, '"')
        .replace(/^[""\u201c\u201d]|[""\u201c\u201d]$/g, '')
        .replace(/\.$/, '').trim().toLowerCase();
      if (norm && !normalizados.includes(norm)) {
        normalizados.push(norm);
        encontrados.push(texto.trim());
      }
      return '';
    }
    return p;
  });
  if (!encontrados.length) return out;

  const finPos = findFinDeInformePos(out);
  if (finPos < 0) return out;
  const pStart = scanBackForTag(out, '<w:p', finPos);
  if (pStart < 0) return out;

  // Si el párrafo inmediatamente anterior al punto de inserción tiene texto
  // (ej. "Las condiciones para realizar el ensayo…"), anteponer 1 blank
  // para separar el OAA del contenido previo.
  let blankPrevio = '';
  {
    const prevClose = out.lastIndexOf('</w:p>', pStart - 1);
    if (prevClose >= 0) {
      const prevOpen = scanBackForTag(out, '<w:p', prevClose);
      if (prevOpen >= 0) {
        const prevPara = out.slice(prevOpen, prevClose + '</w:p>'.length);
        const prevTxt = [...prevPara.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
        if (prevTxt !== '' && !prevPara.includes('w:type="page"')) {
          blankPrevio = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';
        }
      }
    }
  }

  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const parrafos = encontrados.map(t =>
    `<w:p><w:pPr><w:spacing w:after="120" w:before="0" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:rPr>${fonts}<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
    `<w:t xml:space="preserve">${t}</w:t></w:r></w:p>`
  ).join('');

  // Blanco posterior: separar OAA de FIN DE INFORME con 1 párrafo en blanco.
  const blankFin = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  return out.slice(0, pStart) + blankPrevio + parrafos + blankFin + out.slice(pStart);
}

module.exports = { generarWordCompleto, aplicarVersionEncabezado, insertarFechaAutoEnHeader, GENERADORES_TEMPLATE };