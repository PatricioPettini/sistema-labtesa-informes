// Inserta N imágenes de carátula (estado de recepción) en el lugar del marcador
// `__IMAGE_HERE__` del template, reemplazando también el caption "Imagen N°1 …"
// que viene hardcodeado en el template. Si no hay fotos, elimina ambos párrafos.
//
// Cada generador llama a `manejarImagenesCaratula(processedZip, outXml, fotos, tipoPrefix)`
// y queda con outXml listo para devolver. Devuelve el nuevo outXml.

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

function garantizarContentTypes(processedZip) {
  let ct = processedZip.files['[Content_Types].xml'].asText();
  if (!ct.includes('Extension="jpg"')) {
    ct = ct.replace(
      '</Types>',
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '</Types>'
    );
    processedZip.file('[Content_Types].xml', ct);
  }
}

function garantizarNamespaces(outXml) {
  const ANS    = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const PICNS  = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const WP14NS = 'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"';
  let result = outXml;
  // Asegurar cada namespace por separado
  if (!result.includes(ANS)) {
    const wpNs = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    if (result.includes(wpNs)) {
      result = result.replace(wpNs, `${wpNs} ${ANS} ${PICNS}`);
    } else {
      result = result.replace(/<w:document\b/, `$& ${ANS} ${PICNS}`);
    }
  }
  if (!result.includes(WP14NS)) {
    result = result.replace(/<w:document\b/, `$& ${WP14NS}`);
  }
  return result;
}

// Convierte texto a sentence case: primera letra mayúscula, resto minúscula.
// Excepción: parentheticals tipo "(100X)" mantienen su forma original.
function sentenceCase(s) {
  if (!s) return '';
  const trim = String(s).trim();
  if (!trim) return '';
  // Minúscula todo + primera letra mayúscula
  const lower = trim.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Genera un ID hexadecimal de 8 chars (formato wp14:anchorId/editId)
function rand8hex() {
  const chars = '0123456789ABCDEF';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

// ID único por imagen para evitar colisiones con drawings existentes del template
let __imgIdCounter = 1000;

function paraGraphImagen(rId, name, cx, cy) {
  // Estructura idéntica a la que genera Word al insertar una imagen manualmente.
  // Incluye wp14:anchorId y wp14:editId que algunas versiones de Word requieren
  // para asociar la imagen con las herramientas de Picture Format (resize/crop).
  __imgIdCounter++;
  const id = __imgIdCounter;
  const A_NS  = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const PIC_NS = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const anchorId = rand8hex();
  const editId   = rand8hex();

  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" wp14:anchorId="${anchorId}" wp14:editId="${editId}">` +
      `<wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
      `<wp:docPr id="${id}" name="Imagen ${id}"/>` +
      `<wp:cNvGraphicFramePr><a:graphicFrameLocks ${A_NS} noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      `<a:graphic ${A_NS}>` +
        `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
          `<pic:pic ${PIC_NS}>` +
            `<pic:nvPicPr>` +
              `<pic:cNvPr id="${id}" name=""/>` +
              `<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>` +
            `</pic:nvPicPr>` +
            `<pic:blipFill>` +
              `<a:blip r:embed="${rId}"/>` +
              `<a:stretch><a:fillRect/></a:stretch>` +
            `</pic:blipFill>` +
            `<pic:spPr>` +
              `<a:xfrm>` +
                `<a:off x="0" y="0"/>` +
                `<a:ext cx="${cx}" cy="${cy}"/>` +
              `</a:xfrm>` +
              `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
            `</pic:spPr>` +
          `</pic:pic>` +
        `</a:graphicData>` +
      `</a:graphic>` +
    `</wp:inline></w:drawing>`;
  // <w:rPr> con <w:noProof/> + Calibri/22 + lang es-AR — Word lo necesita en
  // runs que contienen <w:drawing> para tratar la imagen como gráfico editable
  // y no como texto. Sin <w:noProof/> las herramientas de Picture Format no
  // se activan correctamente en algunas versiones de Word.
  const rPr =
    `<w:rPr>` +
      `<w:rFonts w:ascii="Calibri" w:eastAsia="MS Mincho" w:hAnsi="Calibri"/>` +
      `<w:noProof/>` +
      `<w:sz w:val="22"/><w:szCs w:val="22"/>` +
      `<w:lang w:val="es-AR" w:eastAsia="es-AR"/>` +
    `</w:rPr>`;
  return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    `<w:jc w:val="center"/></w:pPr><w:r>${rPr}${drawing}</w:r></w:p>`;
}

function paraGraphCaption(n) {
  // Estilo: cursiva centrada, igual al caption original del template
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:i/><w:iCs/>${sz}</w:rPr>` +
    `<w:t xml:space="preserve">Imagen N°${n} - Estado de recepción</w:t></w:r></w:p>`;
}

// Localiza párrafo que contiene el marcador y, opcionalmente, el caption que sigue.
function encontrarBloquesImagen(xml, marker) {
  const markerPos = xml.indexOf(marker);
  if (markerPos < 0) return null;
  const pOpen  = scanBackForTag(xml, '<w:p', markerPos);
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pOpen < 0 || pClose < 0) return null;
  const imgEnd = pClose + '</w:p>'.length;

  // El caption viene en el siguiente párrafo, contiene "Estado" / "recepción"
  let captionEnd = imgEnd;
  const sliceAfter = xml.slice(imgEnd, imgEnd + 3000);
  const capMatch = sliceAfter.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/);
  if (capMatch) {
    const txt = capMatch[0].replace(/<[^>]+>/g, ' ');
    if (/Estado.*recepc/i.test(txt)) {
      captionEnd = imgEnd + capMatch.index + capMatch[0].length;
    }
  }
  return { pOpen, captionEnd };
}

// ── API pública ───────────────────────────────────────────────────────────────
//
// fotos: Array de buffers, o null/[] si no hay
// tipoPrefix: string, ej. 'quimicos' (para nombre de archivos de imagen)
// rIdBase: número, ej. 100 (rId100, rId101, ...)
function manejarImagenesCaratula(processedZip, outXml, fotos, tipoPrefix, rIdBase = 100) {
  const lista = (fotos || []).filter(Boolean);

  // Si no hay fotos, eliminar marcador __IMAGE_NONE__ (o __IMAGE_HERE__) + caption
  if (lista.length === 0) {
    const bloque = encontrarBloquesImagen(outXml, '__IMAGE_NONE__')
                || encontrarBloquesImagen(outXml, '__IMAGE_HERE__')
                || encontrarBloquesImagen(outXml, '__IMAGE_CARATULA__');
    if (!bloque) return outXml;
    return outXml.slice(0, bloque.pOpen) + outXml.slice(bloque.captionEnd);
  }

  // Setup global del documento
  garantizarContentTypes(processedZip);
  outXml = garantizarNamespaces(outXml);

  // Localizar bloque del marcador positivo (__IMAGE_HERE__ o __IMAGE_CARATULA__)
  const bloque = encontrarBloquesImagen(outXml, '__IMAGE_HERE__')
              || encontrarBloquesImagen(outXml, '__IMAGE_CARATULA__');
  if (!bloque) return outXml;

  let parrafosXml = '';
  let relsXml = processedZip.files['word/_rels/document.xml.rels'].asText();

  // ── Layout automático: horizontal si TODAS las fotos entran en 15 cm de ancho ──
  // Estrategia: proyectar cada foto a una ALTURA COMÚN (5 cm para 2 fotos,
  // 4 cm para 3+) y calcular el ancho resultante según aspect ratio. Si la
  // suma de anchos ≤ 15 cm, usar tabla horizontal. Sino, layout vertical (legacy).
  const MAX_ANCHO_CM_H = 15;
  const ALTO_H_CM = lista.length >= 3 ? 4 : 5;
  // Aspect ratio por foto (ancho/alto natural).
  const aspects = lista.map(f => {
    const refW = 1000;
    const refH = calcularAlto(f, refW);
    return refH > 0 ? (refW / refH) : 1.33;
  });
  const anchosProyH = aspects.map(a => ALTO_H_CM * a);
  const sumaAnchosH = anchosProyH.reduce((s, x) => s + x, 0);
  // DESACTIVADO temporalmente: el layout horizontal produce XML corrupto en
  // ciertos docx (Word rechaza el archivo con "Xml parsing error"). Se vuelve
  // al layout vertical clásico hasta identificar el bug del post-proceso.
  // Para reactivar: cambiar la línea siguiente por la comentada.
  const usarHorizontal = false;
  // const usarHorizontal = lista.length >= 2 && sumaAnchosH <= MAX_ANCHO_CM_H;

  if (usarHorizontal) {
    // Tabla sin bordes con N celdas lado a lado; cada imagen respeta su ancho
    // proyectado. Alto común = ALTO_H_CM.
    const gridCols = [];
    const celdas = [];
    lista.forEach((foto, i) => {
      const ext     = detectarExtImagen(foto);
      const imgName = `imagen_${tipoPrefix}_${rIdBase + i}.${ext}`;
      processedZip.file(`word/media/${imgName}`, foto);
      const rId = `rId${rIdBase + i}`;
      if (!relsXml.includes(`Id="${rId}"`)) {
        relsXml = relsXml.replace('</Relationships>',
          `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`);
      }
      const anchoCm = anchosProyH[i];
      const cy = Math.round(ALTO_H_CM * 360000);
      const cx = Math.round(anchoCm * 360000);
      const wDxa = Math.round(anchoCm * 566.929);
      gridCols.push(wDxa);
      celdas.push(celdaConImagen(rId, imgName, cx, cy, '', wDxa));
    });
    parrafosXml += tablaSinBordes(gridCols, [`<w:tr>${celdas.join('')}</w:tr>`]);
    parrafosXml += paraGraphCaption(1);
  } else {
    // Layout vertical (legacy): párrafos apilados. El alto máximo se reduce
    // según cuántas fotos haya para que la carátula siga entrando en 1 página A4.
    const MAX_W_PX = 567;
    const heightsPorCantidad = { 1: 400, 2: 220, 3: 160 };
    const MAX_H_PX = heightsPorCantidad[lista.length] || 120;

    lista.forEach((foto, i) => {
      const ext     = detectarExtImagen(foto);
      const imgName = `imagen_${tipoPrefix}_${rIdBase + i}.${ext}`;
      processedZip.file(`word/media/${imgName}`, foto);

      const rId = `rId${rIdBase + i}`;
      relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`
      );

      let imgW = MAX_W_PX;
      let imgH = calcularAlto(foto, MAX_W_PX);
      if (imgH > MAX_H_PX) { imgW = Math.round(imgW * MAX_H_PX / imgH); imgH = MAX_H_PX; }
      const cx = imgW * 9525;
      const cy = imgH * 9525;

      parrafosXml += paraGraphImagen(rId, imgName, cx, cy);
    });
    parrafosXml += paraGraphCaption(1);
  }

  processedZip.file('word/_rels/document.xml.rels', relsXml);

  return outXml.slice(0, bloque.pOpen) + parrafosXml + outXml.slice(bloque.captionEnd);
}

// Inserta una imagen del ensayo (no de carátula) en relación a un texto-marker.
// `position`: 'before' (default) inserta antes del párrafo que contiene el marker;
// 'after' inserta justo después.
// `rIdBase` debe ser único por imagen para evitar colisiones (default 200).
function insertarImagenEnsayo(processedZip, outXml, foto, tipoPrefix, marker, position = 'before', rIdBase = 200) {
  if (!foto || !marker) return outXml;
  garantizarContentTypes(processedZip);
  outXml = garantizarNamespaces(outXml);

  const ext = detectarExtImagen(foto);
  // rIdBase se incorpora al filename para evitar colisiones cuando el mismo
  // generator llama a esta función más de una vez con el mismo tipoPrefix.
  const imgName = `imagen_${tipoPrefix}_${rIdBase}.${ext}`;
  processedZip.file(`word/media/${imgName}`, foto);

  const rId = `rId${rIdBase}`;
  let relsXml = processedZip.files['word/_rels/document.xml.rels'].asText();
  if (!relsXml.includes(`Id="${rId}"`)) {
    relsXml = relsXml.replace('</Relationships>',
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`);
    processedZip.file('word/_rels/document.xml.rels', relsXml);
  }

  // Altura fija 8 cm, ancho proporcional, tope máximo 10 cm en ambas dimensiones
  // (política de laboratorio para fotos de ensayo).
  const ALTO_EMU      = 8 * 360000;
  const MAX_ANCHO_EMU = 10 * 360000;
  const MAX_ALTO_EMU  = 10 * 360000;
  const refW = 1000;
  const refH = calcularAlto(foto, refW);
  const aspect = refH > 0 ? (refW / refH) : 1.33;
  let cy = ALTO_EMU;
  let cx = Math.round(cy * aspect);
  if (cx > MAX_ANCHO_EMU) {
    cx = MAX_ANCHO_EMU;
    cy = Math.round(cx / aspect);
  }
  if (cy > MAX_ALTO_EMU) {
    cy = MAX_ALTO_EMU;
    cx = Math.round(cy * aspect);
  }

  const parrafo = paraGraphImagen(rId, imgName, cx, cy);

  const re = /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g;
  let m;
  while ((m = re.exec(outXml)) !== null) {
    const visible = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('');
    if (visible.includes(marker)) {
      const insertPos = position === 'after' ? m.index + m[0].length : m.index;
      return outXml.slice(0, insertPos) + parrafo + outXml.slice(insertPos);
    }
  }
  return outXml;
}

// Caption por defecto cuando el usuario no escribe uno. Se infiere del
// tipoPrefix que cada generator pasa al helper (ej. 'macrografia', 'vickers',
// 'metalo_microestructura', 'varios').
function inferirCaptionDefault(tipoPrefix) {
  const t = String(tipoPrefix || '').toLowerCase();
  if (t.includes('macrograf'))             return 'Macrografía';
  if (t.includes('microestructura'))       return 'Microestructura';
  if (t.includes('tamano-grano'))          return 'Tamaño de grano';
  if (t.includes('inclusiones'))           return 'Inclusiones';
  if (t.includes('estructura-grafito'))    return 'Estructura de grafito';
  if (t.includes('espesor-capa'))          return 'Espesor de capa';
  if (t.includes('decarburacion'))         return 'Decarburación';
  if (t.includes('defectos-superficiales'))return 'Defectos superficiales';
  if (t.includes('porosidad'))             return 'Porosidad';
  if (t.includes('vickers'))               return 'Mapa de durezas Vickers';
  if (t.includes('rugosidad'))             return 'Rugosidad';
  return 'Imagen del ensayo';
}

// Inserta MÚLTIPLES imágenes del ensayo en el lugar del marker, cada una con
// su caption (siempre presente — si el usuario no lo escribe, se usa default
// por tipo). Las imágenes se insertan en orden, antes (o después) del párrafo
// que contiene `marker`. Si position='before', el caption original del modelo
// NO se preserva (se asume que los captions vienen en cada foto).
//
// fotos: array de { buffer, caption }. `buffer` es el binario; `caption` opcional.
// Celda de tabla sin bordes que contiene una imagen (con paraGraphImagen)
// seguida del párrafo del caption.
function celdaConImagen(rId, imgName, cx, cy, capXml, wDxa) {
  const noBorders = '<w:tcBorders>' +
    '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '</w:tcBorders>';
  return `<w:tc><w:tcPr><w:tcW w:w="${wDxa}" w:type="dxa"/>${noBorders}<w:vAlign w:val="center"/></w:tcPr>` +
    paraGraphImagen(rId, imgName, cx, cy) +
    (capXml || '') +
    '</w:tc>';
}

// Tabla sin bordes centrada. `gridCols` = anchos en dxa por columna. `filas` = XML de <w:tr>...</w:tr>.
function tablaSinBordes(gridCols, filas) {
  const totalW = gridCols.reduce((a, b) => a + b, 0);
  const gridXml = gridCols.map(w => `<w:gridCol w:w="${w}"/>`).join('');
  return '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${totalW}" w:type="dxa"/>` +
    '<w:jc w:val="center"/>' +
    '<w:tblBorders>' +
      '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
    '</w:tblBorders>' +
    '<w:tblLook w:val="04A0" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    '</w:tblPr>' +
    `<w:tblGrid>${gridXml}</w:tblGrid>` +
    filas.join('') +
    '</w:tbl>';
}

function insertarImagenesEnsayo(processedZip, outXml, fotos, tipoPrefix, marker, position = 'before', rIdBase = 200, opciones = {}) {
  // opciones.layout: 'horizontal' | 'vertical' | undefined (legacy: alto fijo 8 cm, apiladas).
  // opciones.maxAnchoCm, opciones.maxAltoCm: topes por layout (default 10 y 10).
  // NOTA: además del maxAncho/maxAlto por layout, existe un cap duro de 10x10 cm
  // por imagen aplicado al final (capImagen) — política de laboratorio.
  const layout = opciones && (opciones.layout === 'horizontal' || opciones.layout === 'vertical')
    ? opciones.layout : null;
  const maxAnchoCm = (opciones && opciones.maxAnchoCm) || 10;
  const maxAltoCm  = (opciones && opciones.maxAltoCm)  || 10;
  // sinCaption: si es true, NO se emite el párrafo con "Imagen N°X – …"
  // debajo de la imagen. Útil cuando el caller ya provee su propio pie.
  const sinCaption = !!(opciones && opciones.sinCaption);

  // Contar cuántas imágenes ya existen en el documento (carátula + otros
  // ensayos previos en documentos combinados) para numerar en continuidad.
  // Buscamos ocurrencias de "Imagen N°<N>" en el visible text del XML antes
  // de la inserción y tomamos el max para arrancar desde el siguiente.
  let maxImgN = 0;
  try {
    const rxN = /Imagen\s*N[°˚º]\s*(\d+)/gi;
    let m;
    while ((m = rxN.exec(outXml)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxImgN) maxImgN = n;
    }
  } catch {}
  // Si no hay ninguna imagen previa, arrancamos en 2 (la carátula suele ser 1).
  // Si el conteo detecta N imágenes, arrancamos en N+1 automáticamente.
  const startNumber = (maxImgN > 0 ? maxImgN + 1 : 2);
  if (!fotos || !fotos.length || !marker) return outXml;
  // Soportar array de markers (intenta cada uno hasta encontrar match)
  const markers = Array.isArray(marker) ? marker : [marker];
  garantizarContentTypes(processedZip);
  outXml = garantizarNamespaces(outXml);

  // Tope duro por imagen (10 cm) tanto para ancho como para alto — política de
  // laboratorio para fotos de ensayo (microestructura, macrografía, etc.).
  // Se aplica después de la lógica de cada layout, preservando aspect ratio.
  const CAP_CX_EMU = 10 * 360000;
  const CAP_CY_EMU = 10 * 360000;
  const MAX_ANCHO_EMU_DEFAULT = 10 * 360000;
  function capImagen(cx, cy, aspect) {
    if (cx > CAP_CX_EMU) { cx = CAP_CX_EMU; cy = Math.round(cx / aspect); }
    if (cy > CAP_CY_EMU) { cy = CAP_CY_EMU; cx = Math.round(cy * aspect); }
    return { cx, cy };
  }

  // Blank paragraph con word-joiner invisible (U+2060) para sobrevivir a
  // eliminarParrafosVacios de los generators.
  const PBLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr>' +
    '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
    '<w:t xml:space="preserve">⁠</w:t></w:r></w:p>';

  // Fuerza formato "primera letra mayúscula, resto minúscula", respetando
  // siglas técnicas conocidas (ASTM, HRC, TAG, MM-XXX, etc.). Distinto a
  // sentenceCase() que sólo actúa cuando el texto está >75% en mayúsculas.
  function forzarPrimeraMayus(text) {
    if (!text) return '';
    const s = String(text).trim();
    if (!s) return s;
    let out = s.toLowerCase();
    // Primera letra alfabética en mayúscula (saltando comillas/espacios iniciales).
    out = out.replace(/([^\wáéíóúüñ]*)([a-záéíóúüñ])/u, (_, pre, ch) => pre + ch.toUpperCase());
    // Restaurar siglas comunes.
    const siglas = ['ASTM','ISO','ASME','API','AWS','DIN','HRC','HRB','HB','HV','HRA',
      'MPa','GPa','OAA','ITM','FM','TAG','ZAC','MB','ID','QW','PBB'];
    siglas.forEach(sig => {
      const rx = new RegExp('\\b' + sig + '\\b', 'gi');
      out = out.replace(rx, sig);
    });
    // TAGs tipo MM-203, CAL-570, PMM-545, EE-537: prefijo en mayúsculas.
    out = out.replace(/\b([a-z]{2,4})-?(\d{2,4}[a-z]?)\b/gi,
      (_, p, n) => p.toUpperCase() + '-' + n.toUpperCase());
    return out;
  }

  function armarCaption(f, indiceGlobal) {
    const capRaw = (f && f.caption) ? String(f.caption).trim() : '';
    // Fallback si el técnico no cargó pie de imagen: usar el nombre del archivo
    // sin extensión. Ej: "Macrografia general.jpg" → "Macrografia general".
    const nameRaw = (f && f.name) ? String(f.name).trim().replace(/\.[a-z0-9]{2,5}$/i, '') : '';
    const defaultPorTipo = inferirCaptionDefault(tipoPrefix);
    // Prioridad: caption manual > nombre del archivo > default por tipo.
    const cuerpoBase = capRaw || nameRaw || defaultPorTipo;
    let cuerpo, prefix;
    const m = capRaw.match(/^(Imagen\s+N[°˚º]\s*\d*\s*[–-]\s*)(.*)$/i);
    if (m) { prefix = m[1]; cuerpo = m[2] || nameRaw || defaultPorTipo; }
    else   { prefix = `Imagen N°${indiceGlobal} – `; cuerpo = cuerpoBase; }
    return (prefix + forzarPrimeraMayus(cuerpo))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function parrafoCaption(cap) {
    const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
    return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      '<w:jc w:val="center"/></w:pPr>' +
      `<w:r><w:rPr>${fonts}<w:i/><w:iCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>` +
      `<w:t xml:space="preserve">${cap}</w:t></w:r></w:p>`;
  }

  let relsXml = processedZip.files['word/_rels/document.xml.rels'].asText();
  let bloque = '';

  // Preparar todos los items (registrar imagen en el zip + rels, medir aspect)
  const items = [];
  fotos.forEach((f, i) => {
    const buf = f && f.buffer ? f.buffer : (Buffer.isBuffer(f) ? f : null);
    if (!buf) return;
    const ext = detectarExtImagen(buf);
    // rIdBase + i garantiza filename único aunque otro generador use el mismo
    // tipoPrefix con rIdBase distinto (evita colisiones en word/media/*).
    const imgName = `imagen_${tipoPrefix}_${rIdBase + i}.${ext}`;
    processedZip.file(`word/media/${imgName}`, buf);
    const rId = `rId${rIdBase + i}`;
    if (!relsXml.includes(`Id="${rId}"`)) {
      relsXml = relsXml.replace('</Relationships>',
        `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`);
    }
    const refW = 1000;
    const refH = calcularAlto(buf, refW);
    const aspect = refH > 0 ? (refW / refH) : 1.33;
    items.push({ rId, imgName, aspect, f, indice: startNumber + i });
  });

  if (layout === 'horizontal') {
    // Agrupar en filas de max 3 (balanceado). La suma de anchos por fila = maxAnchoCm.
    const MAX_POR_FILA = 3;
    const N = items.length;
    const filasCount = Math.ceil(N / MAX_POR_FILA);
    const porFila = Math.ceil(N / filasCount);
    for (let ini = 0; ini < N; ini += porFila) {
      const fila = items.slice(ini, ini + porFila);
      // Distribución proporcional al ancho original de cada imagen (aspect > 1 = panorámica).
      // Se aproxima el ancho nativo como `aspect` (unidad relativa, alcanza para el ratio).
      const pesos = fila.map(it => it.aspect);
      const suma = pesos.reduce((a, b) => a + b, 0) || 1;
      const anchoTotalDxa = Math.round(maxAnchoCm * 566.929); // dxa (twips)
      const gridCols = [];
      const celdas = [];
      fila.forEach((it, k) => {
        const anchoCm = (pesos[k] / suma) * maxAnchoCm;
        let cx = Math.round(anchoCm * 360000);
        let cy = Math.round(cx / it.aspect);
        ({ cx, cy } = capImagen(cx, cy, it.aspect));
        const wDxa = Math.round((cx / 360000) * 566.929);
        gridCols.push(wDxa);
        const cap = armarCaption(it.f, it.indice);
        celdas.push(celdaConImagen(it.rId, it.imgName, cx, cy, parrafoCaption(cap), wDxa));
      });
      bloque += PBLANK;
      bloque += tablaSinBordes(gridCols, [`<w:tr>${celdas.join('')}</w:tr>`]);
      bloque += PBLANK;
    }
  } else if (layout === 'vertical') {
    // Apiladas: cada imagen ocupa maxAltoCm/N cm de alto, ancho proporcional
    // (con tope maxAnchoCm cm).
    const N = items.length;
    const altoCadaCm = maxAltoCm / N;
    items.forEach(it => {
      let cy = Math.round(altoCadaCm * 360000);
      let cx = Math.round(cy * it.aspect);
      const maxAnchoEmu = Math.round(maxAnchoCm * 360000);
      if (cx > maxAnchoEmu) {
        cx = maxAnchoEmu;
        cy = Math.round(cx / it.aspect);
      }
      ({ cx, cy } = capImagen(cx, cy, it.aspect));
      bloque += PBLANK;
      bloque += paraGraphImagen(it.rId, it.imgName, cx, cy);
      if (!sinCaption) bloque += parrafoCaption(armarCaption(it.f, it.indice));
      bloque += PBLANK;
    });
  } else {
    // Legacy: alto fijo 8 cm, apiladas, ancho proporcional (cap a 10 cm).
    const ALTO_EMU = 8 * 360000;
    items.forEach(it => {
      let cy = ALTO_EMU;
      let cx = Math.round(cy * it.aspect);
      if (cx > MAX_ANCHO_EMU_DEFAULT) {
        cx = MAX_ANCHO_EMU_DEFAULT;
        cy = Math.round(cx / it.aspect);
      }
      ({ cx, cy } = capImagen(cx, cy, it.aspect));
      bloque += PBLANK;
      bloque += paraGraphImagen(it.rId, it.imgName, cx, cy);
      if (!sinCaption) bloque += parrafoCaption(armarCaption(it.f, it.indice));
      bloque += PBLANK;
    });
  }

  processedZip.file('word/_rels/document.xml.rels', relsXml);

  // Probar cada marker hasta encontrar match. Devuelve en cuanto inserta.
  for (const mk of markers) {
    const re = /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g;
    let m;
    while ((m = re.exec(outXml)) !== null) {
      const visible = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('');
      if (visible.includes(mk)) {
        const insertPos = position === 'after' ? m.index + m[0].length : m.index;
        return outXml.slice(0, insertPos) + bloque + outXml.slice(insertPos);
      }
    }
  }
  return outXml;
}

module.exports = { manejarImagenesCaratula, insertarImagenEnsayo, insertarImagenesEnsayo };
