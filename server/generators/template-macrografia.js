'use strict';
// Generador para Macrografía General (modelo F2 244325).
// El template físico (server/templates/macrografia.docx) replica el formato
// del modelo F2 — solo varían los datos por OT.

const PizZip       = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs   = require('fs');
const path = require('path');
const { manejarImagenesCaratula, insertarImagenesEnsayo }  = require('./imagenes-caratula-helper');
const { sentenceCase } = require('../utils/text-helpers');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/macrografia.docx');
const MARKER_FIN_ENSAYO = ['Los ensayos marcados con', 'FIN DE INFORME'];

// Las 4 opciones literales del modelo F2 (lo que sale en el Word si se elige
// esa opción; si datos.resultado_texto está cargado, lo sobrescribe).
// El "(Ver imagen Nº2)" no se incluye acá porque ya viene en el run que sigue
// en el template original.
const OPCIONES_DEFAULT = {
  '1': 'Luego del macroataque la probeta presenta buena penetración y fusión del cordón de soldadura sin porosidades, grietas o fisuras.',
  '2': 'Luego del macroataque la probeta no presenta buena penetración y fusión del cordón de soldadura.',
  '3': 'Luego del macroataque la probeta presenta una estructura de fundido.',
  '4': 'Luego del macroataque la probeta presenta un correcto flujo de líneas de forja en el sentido longitudinal al eje axial de la pieza.',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Generador principal ──────────────────────────────────────────────────────
function generarMacrografiaDesdeTemplate(ot, datos, fotosCaratula) {
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const esSecundario = fotosCaratula === null;
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  // Selección de OPs visibles. El front pasa checkboxes individuales `op_1`,
  // `op_2`, `op_3`, `op_4`. Como fallback se acepta también `datos.ops` (array).
  // Si nada se especifica, muestra solo OP 1.
  let opsActivas;
  if (Array.isArray(datos.ops) && datos.ops.length) {
    opsActivas = datos.ops.map(n => String(n));
  } else {
    opsActivas = [];
    if (datos.op_1) opsActivas.push('1');
    if (datos.op_2) opsActivas.push('2');
    if (datos.op_3) opsActivas.push('3');
    if (datos.op_4) opsActivas.push('4');
    if (opsActivas.length === 0) opsActivas = ['1'];
  }

  const textoLibre = sentenceCase((datos.resultado_texto || '').trim());
  // Si hay texto libre, se renderiza como OP 1 y las demás se ocultan.
  function valorOp(n) {
    if (textoLibre && opsActivas.length === 1 && opsActivas[0] === String(n)) {
      return textoLibre;
    }
    if (!opsActivas.includes(String(n))) return '__SECTION_HIDE__';
    return OPCIONES_DEFAULT[String(n)] || '__SECTION_HIDE__';
  }

  const templateData = {
    numero_ot:          nroOtBase,
    razon_social:       ot.razon_social       || '',
    fecha_generacion:   ot.fecha_finalizacion || '',
    id_muestra:         ot.id_muestra         || '',
    fecha_recepcion:    ot.fecha_recepcion    || '',
    fecha_aprobacion:   ot.fecha_aprobacion   || '',
    fecha_finalizacion: ot.fecha_finalizacion || '',
    imagen_placeholder: fotos.length > 0 ? '__IMAGE_CARATULA__' : '__IMAGE_NONE__',

    // Macrografías son OAA por default; datos.oaa === false omite el asterisco
    // y la nota OAA (caso: el combinador detectó OAA uniforme entre ensayos).
    asterisco_oaa: datos.oaa === false ? '' : '*',
    oaa_linea: datos.oaa === false ? '' : '"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."',

    temperatura: (datos.temperatura != null && String(datos.temperatura).trim() !== '')
      ? String(datos.temperatura).trim()
      : '**',

    resultado_op1: valorOp(1),
    resultado_op2: valorOp(2),
    resultado_op3: valorOp(3),
    resultado_op4: valorOp(4),
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

  // Post-proceso
  // 0) Reemplazar el bloque de CONDICIONES DE ENSAYO y EQUIPAMIENTO UTILIZADO
  //    con líneas dinámicas según los datos cargados. Quita los hardcodes
  //    del template (códigos ASME/AWS/PARA CHAPA, ataque duplicado, etc.).
  outXml = reemplazarCondicionesYEquipamiento(outXml, datos, templateData.temperatura);

  // 1) Eliminar las OPs ocultas (__SECTION_HIDE__)
  outXml = eliminarSeccionesOcultas(outXml);
  // 1.b) Quitar el prefijo literal "OP N " y todo run / tab que aparezca antes
  //      del texto del resultado dentro del párrafo de "Luego del macroataque".
  //      Los informes reales no muestran "OP N", ni espacio ni tab inicial.
  outXml = outXml.replace(/<w:r\b[^>]*>(?:(?!<w:r\b)[\s\S])*?<w:t[^>]*>\s*OP\s+\d\s*<\/w:t>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '');
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, par => {
    if (!/Luego del macroataque/.test(par.replace(/<[^>]+>/g, ''))) return par;
    const pPrEnd = par.indexOf('</w:pPr>');
    if (pPrEnd < 0) return par;
    const head = par.slice(0, pPrEnd + '</w:pPr>'.length);
    let body = par.slice(pPrEnd + '</w:pPr>'.length);
    // 1) Eliminar runs iniciales con solo whitespace / tabs (sin texto real)
    while (true) {
      const m = body.match(/^\s*<w:r\b[^>]*>(?:(?!<w:r\b)[\s\S])*?<\/w:r>/);
      if (!m) break;
      const visible = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('');
      if (visible.trim() !== '') break;
      body = body.slice(m[0].length);
    }
    // 2) Si el primer run con texto trae un <w:tab/> antes del <w:t>, quitarlo
    //    (el template original usa tab para sangrar después del prefix "OP N").
    body = body.replace(/^(\s*<w:r\b[^>]*>(?:(?!<w:r\b)[\s\S])*?)<w:tab\/>/, '$1');
    return head + body;
  });

  // 2) Tabla de catetos: solo si el usuario lo pidió Y cargó al menos una muestra
  const incluirCatetos = datos.incluir_tabla_catetos &&
    Array.isArray(datos.muestras) && datos.muestras.length > 0;
  if (incluirCatetos) {
    outXml = inyectarTablaCatetos(outXml, datos.muestras);
  } else {
    outXml = quitarTablaCatetos(outXml);
  }

  // 3) NOTA opcional
  // Nota y evaluación: si hay texto cargado se incluyen. El checkbox
  // tiene_nota/tiene_evaluacion solo actúa como override negativo (=== false omite).
  const notaTxt = (datos.nota_texto || '').trim();
  if (notaTxt && datos.tiene_nota !== false) {
    outXml = insertarBloqueHeading(outXml, 'NOTA', notaTxt);
  }
  const evalTxt = (datos.evaluacion_texto || '').trim();
  if (evalTxt && datos.tiene_evaluacion !== false) {
    outXml = insertarBloqueHeading(outXml, 'EVALUACION DE RESULTADOS', evalTxt);
  }

  // Remap numId=19 (referenciado por el template pero NO definido en
  // numbering.xml) → numId=16 (sí definido con formato multinivel 1. y 1.1.).
  outXml = outXml.replace(/<w:numId w:val="19"\/>/g, '<w:numId w:val="16"/>');

  outXml = eliminarParrafosVacios(outXml);
  outXml = forzarCalibri(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = minimizarUltimoParagrafo(outXml);
  if (esSecundario) outXml = eliminarBlancosTrasUltimoContenido(outXml);

  // Imágenes del ensayo (macrografías reales). Se insertan al final del ensayo,
  // antes de OAA / FIN DE INFORME. Cada una con su caption del form.
  const fotosEnsayo = Array.isArray(datos.imagenes_resultado)
    ? datos.imagenes_resultado.map(p => {
        if (!p) return null;
        const url = typeof p === 'string' ? p : p.dataUrl;
        if (!url) return null;
        const b64 = url.replace(/^data:[^;]+;base64,/, '');
        return { buffer: Buffer.from(b64, 'base64'), caption: p.caption || '', name: p.name || '' };
      }).filter(x => x && x.buffer)
    : [];
  // Quitar SIEMPRE el caption residual del modelo F2 ("Imagen N°2 - Macrografía").
  // Si el usuario subió fotos, su caption real (con número e ID del prefix
  // "Imagen N°X – ...") reemplazará al del modelo; si no subió, no debe aparecer.
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, par => {
    const visible = [...par.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    if (/imagen\s+n[°˚º]\s*\d*\s*[-–]\s*macrograf[íi]a/i.test(visible)) return '';
    return par;
  });
  if (fotosEnsayo.length > 0) {
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosEnsayo,
      'macrografia', MARKER_FIN_ENSAYO, 'before');
  }

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'macrografia');

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

  // Antes se eliminaba numbering.xml por conflictos en informes combinados,
  // pero eso convertía la numeración 1./1.1./1.2./1.3. en texto plano.
  // Lo mantenemos para preservar el formato multinivel correcto. El word-generator
  // combinador se encarga de fusionar numberings cuando hay varios ensayos.
  const ctPath = '[Content_Types].xml';
  if (false && processedZip.files[ctPath]) {
    let ctXml = processedZip.files[ctPath].asText();
    ctXml = ctXml.replace(/<Override[^>]*numbering[^>]*\/>/g, '');
    processedZip.file(ctPath, ctXml);
  }

  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: helpers ────────────────────────────────────────────────────

// Inyecta los valores de la tabla de catetos (Mtra.1/2/3 × Cateto 1A/2A/dif/1B/2B/dif)
// desde datos.muestras = [{ cateto_1a, cateto_2a, diferencia_a, cateto_1b, cateto_2b, diferencia_b }, ...]
function inyectarTablaCatetos(xml, muestras) {
  // Localizar la tabla del modelo (la que contiene "Cateto 1A")
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tabla => {
    if (!/Cateto 1A|Cateto 1B/.test(tabla)) return tabla;
    // Encontrar las filas de Cateto 1A, 2A, Diferencia, 1B, 2B, Diferencia
    // Cada fila tiene 4 celdas: label + 3 datos (Mtra.1, Mtra.2, Mtra.3)
    const rows = [...tabla.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]);
    const labelRow = (label) => rows.findIndex(r => {
      const txts = [...r.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim();
      return txts.startsWith(label);
    });
    const map = {
      'Cateto 1A':  'cateto_1a',
      'Cateto 2A':  'cateto_2a',
      'Cateto 1B':  'cateto_1b',
      'Cateto 2B':  'cateto_2b',
    };
    // Para las 2 filas "Diferencia" hay que distinguir si vienen después de A o B.
    // Conservamos el índice para inyectar valores de `diferencia_a` y `diferencia_b`.

    function fillRow(row, valoresPorMuestra) {
      const cells = [...row.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(m => m[0]);
      const nuevas = cells.map((cell, i) => {
        if (i === 0) return cell;
        const v = valoresPorMuestra[i - 1];
        if (v == null || v === '') return cell;
        const vStr = String(v);
        if (/<w:t[^>]*>\s*<\/w:t>/.test(cell)) {
          return cell.replace(/<w:t([^>]*)>\s*<\/w:t>/, `<w:t$1>${escapeXml(vStr)}</w:t>`);
        }
        return cell.replace(/<\/w:p>/,
          `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr><w:t>${escapeXml(vStr)}</w:t></w:r></w:p>`);
      });
      const rowOpen = row.match(/<w:tr\b[^>]*>/)[0];
      return rowOpen + nuevas.join('') + '</w:tr>';
    }

    function getValores(campo) {
      return [0, 1, 2].map(i => {
        const m = muestras[i] || {};
        return m[campo];
      });
    }

    let newTabla = tabla;
    let diferenciaIdx = 0; // 0 = primer "Diferencia" (A), 1 = segundo (B)
    rows.forEach((row, idx) => {
      const txt = [...row.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim();
      let campo = null;
      for (const [label, key] of Object.entries(map)) {
        if (txt.startsWith(label)) { campo = key; break; }
      }
      if (!campo && txt.startsWith('Diferencia')) {
        campo = diferenciaIdx === 0 ? 'diferencia_a' : 'diferencia_b';
        diferenciaIdx++;
      }
      if (campo) {
        newTabla = newTabla.replace(row, fillRow(row, getValores(campo)));
      }
    });
    return newTabla;
  });
}

function eliminarSeccionesOcultas(xml) {
  const MARKER = '__SECTION_HIDE__';
  let result = xml, pos;
  while ((pos = result.indexOf(MARKER)) >= 0) {
    const pClose = result.indexOf('</w:p>', pos);
    if (pClose < 0) break;
    const end   = pClose + '</w:p>'.length;
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
  const bloque = heading + cuerpo;
  const finPos = xml.indexOf('FIN DE INFORME');
  if (finPos < 0) return xml + bloque;
  const pStart = scanBackForTag(xml, '<w:p', finPos);
  if (pStart < 0) return xml;
  return xml.slice(0, pStart) + bloque + xml.slice(pStart);
}

// Reemplaza el bloque entre "CONDICIONES DE ENSAYO" y "RESULTADOS OBTENIDOS"
// (que en el template trae líneas hardcoded del modelo F2) por un bloque
// dinámico que depende de los datos cargados.
function reemplazarCondicionesYEquipamiento(xml, datos, temperaturaVal) {
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

  function pLinea(texto) {
    return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      '<w:ind w:left="851"/></w:pPr>' +
      `<w:r><w:rPr>${fonts}${sz}</w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(texto)}</w:t></w:r></w:p>`;
  }
  // Heading de subsección (1.1, 1.2, ...) — usa numId=16 que SÍ está definido
  // en el numbering.xml del template (numId=19 referenciado por el template
  // original no existe, por eso Word renderea numeración incorrecta).
  function pHeading(texto) {
    return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
      '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="16"/></w:numPr>' +
      '<w:tabs><w:tab w:val="left" w:pos="851"/></w:tabs>' +
      '<w:spacing w:line="300" w:lineRule="auto"/>' +
      '<w:ind w:left="851" w:hanging="425"/>' +
      `<w:rPr>${fonts}<w:b/>${sz}</w:rPr></w:pPr>` +
      `<w:r><w:rPr>${fonts}<w:b/>${sz}</w:rPr>` +
      `<w:t>${escapeXml(texto)}</w:t></w:r></w:p>`;
  }

  const condLineas = [];
  condLineas.push(pHeading('CONDICIONES DE ENSAYO'));
  const norma = (datos.norma_ensayo || '').trim();
  if (norma) condLineas.push(pLinea(`Norma de ensayo: ${norma}`));
  const normaOtra = (datos.norma_otra || '').trim();
  if (normaOtra) condLineas.push(pLinea(`Norma de ensayo: ${normaOtra}`));

  // Métodos de ensayo del preinforme físico FM-071 (checkboxes + texto libre).
  // Etiqueta unificada "Metodología de ensayo:" para todas las variantes
  // (antes se usaba "Método de ensayo:" para checkboxes y "Metodología..." para
  // fallback — inconsistencia que ocultaba el contenido con etiqueta rara).
  const metodos = [];
  // Aceptar tanto booleanos como strings "true"/"false" que pueden entrar
  // vía JSON serializado sin normalizar. Convertimos explícitamente.
  const isTrue = (v) => v === true || v === 'true' || v === 1 || v === '1';
  if (isTrue(datos.metodo_soldadura_chk)) {
    const s = (datos.metodo_soldadura_text || '').trim();
    metodos.push(s ? `Soldadura: ${s}` : 'Soldadura');
  }
  if (isTrue(datos.metodo_macro_general_chk))   metodos.push('Macrografía general según ITM N°061');
  if (isTrue(datos.metodo_lineas_forja_chk))    metodos.push('Líneas de forja según ITM N°061');
  if (isTrue(datos.metodo_soldadura_asme_chk))  metodos.push('Soldadura según ASME IX QW 183/184');
  if (metodos.length) {
    metodos.forEach(m => condLineas.push(pLinea(`Metodología de ensayo: ${m}`)));
  } else {
    // Fallback legacy: campo libre de metodología (ITM).
    const metod = (datos.metodologia || '').trim();
    if (metod) condLineas.push(pLinea(`Metodología de ensayo: ${metod}`));
  }
  const ataque = (datos.ataque_1 || '').trim();
  if (ataque) condLineas.push(pLinea(`Ataque utilizado: ${ataque}`));
  if (temperaturaVal && temperaturaVal !== '**') {
    condLineas.push(pLinea(`Temperatura de ensayo: ${temperaturaVal} °C`));
  }
  const zona = (datos.zona_evaluacion || datos.zona_examinada || '').trim();
  if (zona) condLineas.push(pLinea(`Zona de ensayo: ${zona}`));
  const muestra = (datos.muestra_ensayada || '').trim();
  if (muestra) condLineas.push(pLinea(`Muestra ensayada: ${muestra}`));
  const codReferencia = (datos.cod_referencia || '').trim();
  if (codReferencia) condLineas.push(pLinea(`Código de referencia: ${codReferencia}`));

  // Blank
  condLineas.push('<w:p><w:pPr><w:ind w:left="851"/></w:pPr></w:p>');

  // EQUIPAMIENTO
  condLineas.push(pHeading('EQUIPAMIENTO UTILIZADO'));
  const equipos = [];
  // Termohigrómetro: default TRUE. El usuario debe destildar explícitamente
  // en el form (checkbox marcado por default) para que NO aparezca.
  // Se sigue soportando el flag legacy datos.equipamiento.termohigro_700.
  const termoFlag = datos.eq_termohigro_700 !== undefined
    ? datos.eq_termohigro_700
    : (datos.equipamiento && datos.equipamiento.termohigro_700);
  if (termoFlag !== false) {
    equipos.push('Termohigrómetro TAG N°MM-700');
  }
  if (datos.eq_microscopio_378) equipos.push('Microscopio Leica DM 750 TAG N°MM-378');
  if (datos.eq_calibre_703)     equipos.push('Calibre digital Mitutoyo TAG N°MM-703');
  const extra = (datos.eq_extra || '').trim();
  if (extra) {
    extra.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(e => equipos.push(e));
  }
  const equipoOtro = (datos.equipo_otro || '').trim();
  if (equipoOtro) {
    const equipoOtroTag = (datos.equipo_otro_tag || '').trim();
    equipos.push(equipoOtroTag ? `${equipoOtro} TAG N°${equipoOtroTag}` : equipoOtro);
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => equipos.push(l));
  equipos.forEach(e => condLineas.push(pLinea(e)));

  // Blank
  condLineas.push('<w:p><w:pPr><w:ind w:left="851"/></w:pPr></w:p>');

  // Localizar bloque a reemplazar: desde "CONDICIONES DE ENSAYO" hasta "RESULTADOS OBTENIDOS"
  const condIdx = xml.indexOf('CONDICIONES DE ENSAYO');
  if (condIdx < 0) return xml;
  const condPStart = scanBackForTag(xml, '<w:p', condIdx);
  if (condPStart < 0) return xml;
  const resIdx = xml.indexOf('RESULTADOS OBTENIDOS', condPStart);
  if (resIdx < 0) return xml;
  const resPStart = scanBackForTag(xml, '<w:p', resIdx);
  if (resPStart < 0) return xml;

  return xml.slice(0, condPStart) + condLineas.join('') + xml.slice(resPStart);
}

// Quita la tabla de catetos del template (incluyendo su caption "Tabla N°...")
// y el placeholder "***" residual del modelo F2.
function quitarTablaCatetos(xml) {
  // 1) Eliminar tabla con Cateto 1A/1B
  xml = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tabla =>
    /Cateto 1A|Cateto 1B/.test(tabla) ? '' : tabla);
  // 2) Eliminar caption "Tabla N°... Análisis dimensional..."
  xml = xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?Análisis dimensional(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, '');
  // 3) Eliminar párrafo solo con "***" (residuo del template)
  xml = xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<w:t[^>]*>\s*\*\*\*\s*<\/w:t>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, '');
  return xml;
}

module.exports = { generarMacrografiaDesdeTemplate };
