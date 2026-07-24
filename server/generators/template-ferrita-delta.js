'use strict';
const PizZip       = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs   = require('fs');
const path = require('path');
const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { sentenceCase } = require('../utils/text-helpers');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/ferrita-delta.docx');

const FONTS_FD = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const SZ_FD    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Celda de tabla con bordes finos y texto centrado (estilo anexo-metalografico).
function celdaTablaFD(texto, ancho, header) {
  const BORD = '<w:tcBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';
  const fill = header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
  const bold = header ? '<w:b/><w:bCs/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${BORD}${fill}<w:vAlign w:val="center"/></w:tcPr>` +
    '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS_FD}${bold}${SZ_FD}</w:rPr><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p></w:tc>`;
}

// Construye la tabla de mediciones (mediciones_ferrita[]) con columnas
// Sector | Zona | Medición 1 [%] | Medición 2 [%] | Medición 3 [%] | Promedio [%]
function construirTablaMedicionesFerrita(filas) {
  const filasValidas = (filas || []).filter(f =>
    f && (
      String(f.m1 || '').trim() !== '' ||
      String(f.m2 || '').trim() !== '' ||
      String(f.m3 || '').trim() !== '' ||
      String(f.prom || '').trim() !== ''
    )
  );
  if (filasValidas.length === 0) return '';
  const colW = [1400, 1600, 1300, 1300, 1300, 1400];
  const total = colW.reduce((a, b) => a + b, 0);
  const grid = '<w:tblGrid>' + colW.map(w => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
  const header = '<w:tr>' +
    celdaTablaFD('Sector',         colW[0], true) +
    celdaTablaFD('Zona',           colW[1], true) +
    celdaTablaFD('Medición 1 [%]', colW[2], true) +
    celdaTablaFD('Medición 2 [%]', colW[3], true) +
    celdaTablaFD('Medición 3 [%]', colW[4], true) +
    celdaTablaFD('Promedio [%]',   colW[5], true) +
    '</w:tr>';
  const rows = filasValidas.map(f => '<w:tr>' +
    celdaTablaFD(f.sector || '', colW[0], false) +
    celdaTablaFD(f.zona   || '', colW[1], false) +
    celdaTablaFD(f.m1     || '', colW[2], false) +
    celdaTablaFD(f.m2     || '', colW[3], false) +
    celdaTablaFD(f.m3     || '', colW[4], false) +
    celdaTablaFD(f.prom   || '', colW[5], false) +
    '</w:tr>').join('');
  return '<w:tbl><w:tblPr>' +
    `<w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="center"/>` +
    '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '</w:tblBorders></w:tblPr>' +
    grid + header + rows + '</w:tbl>';
}

// Párrafo simple con sangría 851 (misma que resto de CONDICIONES / EQUIPAMIENTO).
function pLineaFD(texto) {
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS_FD}${SZ_FD}</w:rPr>` +
    `<w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;
}

// ── Helpers estándar ──────────────────────────────────────────────────────────

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
  if (para.includes('<w:drawing>')) return false;
  return !/<w:t[\s>]/.test(para);
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
  } catch {}
  return Math.round(anchoTarget * 0.75);
}

// ── convertirNumberingATexto ─────────────────────────────────────────────────
// Mismo patrón que brinell/plegado/nick-break.
// Nivel 0 → "N."  (título ensayo, bold, con page break extraído)
// Nivel 1 → "N.M." (subtítulo sección, bold)
function convertirNumberingATexto(xml, seccionInicio) {
  const NIVELES = [
    { left: 426, hanging: 284, tab: 426 },  // nivel 0 — igual que brinell/tracción
    { left: 851, hanging: 425, tab: 851 },  // nivel 1
  ];
  const counters = [seccionInicio - 1, 0];

  // Dividir XML en párrafos preservando lo que no es párrafo
  const parts = [];
  let lastEnd = 0;
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (m.index > lastEnd) parts.push({ type: 'other', text: xml.slice(lastEnd, m.index) });
    parts.push({ type: 'para', text: m[0] });
    lastEnd = re.lastIndex;
  }
  if (lastEnd < xml.length) parts.push({ type: 'other', text: xml.slice(lastEnd) });

  const out = [];
  for (const part of parts) {
    if (part.type !== 'para' || !part.text.includes('<w:numPr>')) {
      out.push(part.text);
      continue;
    }
    let par = part.text;
    const lvlM  = par.match(/<w:ilvl w:val="(\d+)"/);
    const level = lvlM ? parseInt(lvlM[1]) : 0;

    counters[level] = (counters[level] || 0) + 1;
    for (let l = level + 1; l < counters.length; l++) counters[l] = 0;

    let numTexto;
    if (level === 0)      numTexto = `${counters[0]}.`;
    else if (level === 1) numTexto = `${counters[0]}.${counters[1]}.`;
    else                  numTexto = `${counters[0]}.${counters[1]}.${counters[2]}.`;

    const cfg = NIVELES[Math.min(level, NIVELES.length - 1)];

    let newPar = par
      .replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '')
      .replace(/<w:numId[^/]*\/>/g, '');

    const tabsXml = `<w:tabs><w:tab w:val="left" w:pos="${cfg.tab}"/></w:tabs>`;
    const indXml  = `<w:ind w:left="${cfg.left}" w:hanging="${cfg.hanging}"/>`;

    if (newPar.includes('<w:pPr>')) {
      newPar = newPar
        .replace(/<w:ind\b[^/]*\/>/g, '')
        .replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, '')
        .replace('<w:pPr>', `<w:pPr>${tabsXml}${indXml}`);
    } else {
      newPar = newPar.replace('<w:p', `<w:p><w:pPr>${tabsXml}${indXml}</w:pPr>`);
    }

    const numRun = `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${numTexto}</w:t><w:tab/></w:r>`;

    // Si el párrafo tiene page break, moverlo como PRIMER run (antes del numRun)
    // para evitar línea vacía al inicio de la página nueva.
    const brRunRe = /<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:br w:type="page"\/><\/w:r>/;
    const brM = newPar.match(brRunRe);
    if (brM) {
      newPar = newPar.replace(brRunRe, '');  // quitar PB de su posición original
      newPar = newPar.replace(/(<\/w:pPr>)/, `$1<w:r><w:br w:type="page"/></w:r>${numRun}`);
    } else {
      newPar = newPar.replace(/(<\/w:pPr>)/, `$1${numRun}`);
    }

    out.push(newPar);
  }

  return out.join('');
}

// ── insertarBlancoEntreSubsecciones ──────────────────────────────────────────
// Corre DESPUÉS de convertirNumberingATexto y eliminarParrafosVacios.
// Detecta subtítulos (left=426, w:t contiene "N.M.") y agrega blank antes
// de los que NO son el primero de su bloque.
function insertarBlancoEntreSubsecciones(xml) {
  const BLANK = '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:spacing w:after="0" w:before="0"/></w:pPr></w:p>';

  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  const items = [];  // { start, kind: 'titulo0' | 'subtitulo' | 'other' }

  while ((m = re.exec(xml)) !== null) {
    const p = m[0];
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '').trim());
    if (wts.some(t => /^\d+\.$/.test(t))) {
      items.push({ start: m.index, kind: 'titulo0' });
    } else if (p.includes('w:left="851"') && wts.some(t => /^\d+\.\d+\.$/.test(t))) {
      items.push({ start: m.index, kind: 'subtitulo' });
    }
  }

  // Marcar cuáles subtítulos son primeros tras un titulo0
  let lastWasTitulo = false;
  const insertBefore = [];
  for (const item of items) {
    if (item.kind === 'titulo0') { lastWasTitulo = true; continue; }
    if (item.kind === 'subtitulo') {
      if (!lastWasTitulo) insertBefore.push(item.start);  // no es el primero
      lastWasTitulo = false;
    }
  }

  // Insertar de atrás para adelante
  let result = xml;
  for (let i = insertBefore.length - 1; i >= 0; i--) {
    result = result.slice(0, insertBefore[i]) + BLANK + result.slice(insertBefore[i]);
  }
  return result;
}

// ── Generador principal ───────────────────────────────────────────────────────

function generarFerritaDeltaDesdeTemplate(ot, datos, fotosCaratula) {
  const esSecundario = fotosCaratula === null;
  const fotos = !esSecundario && Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const variante = datos.variante || 'fischer';
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  // ── templateData: carátula ────────────────────────────────────────────────
  const templateData = {
    numero_ot:          nroOtBase,
    razon_social:       ot.razon_social       || '',
    fecha_generacion:   ot.fecha_finalizacion || '',
    id_muestra:         ot.id_muestra         || '',
    fecha_recepcion:    ot.fecha_recepcion    || '',
    fecha_aprobacion:   ot.fecha_aprobacion   || '',
    fecha_finalizacion: ot.fecha_finalizacion || '',
    imagen_placeholder: fotos.length > 0 ? '__IMAGE_CARATULA__' : '__IMAGE_NONE__',
  };

  // Resultado de Fischer: soporta `resultado` (nuevo) y `resultado_unico` (legacy)
  const resultadoFischer = (datos.resultado != null ? datos.resultado : datos.resultado_unico) || '';

  // Backward compat para variante microscopio: si vinieron `probetas[]` con
  // estructura legacy {nombre, zona_mb, zona_zac, zona_sold} y no hay `zonas[]`
  // ni `modo_resultado`, traducirlas a `zonas[]` para modo narrativo.
  if (variante === 'microscopio' && !datos.modo_resultado && (!Array.isArray(datos.zonas) || datos.zonas.length === 0)
      && Array.isArray(datos.probetas) && datos.probetas.length > 0) {
    const tieneEstructuraLegacy = datos.probetas.some(p =>
      p && (p.zona_mb != null || p.zona_zac != null || p.zona_sold != null));
    if (tieneEstructuraLegacy) {
      const zonas = [];
      datos.probetas.forEach((p, i) => {
        const prefijo = datos.probetas.length > 1
          ? `Probeta ${p.nombre || (i + 1)} - `
          : '';
        if (p.zona_mb   != null && String(p.zona_mb).trim()   !== '') zonas.push({ zona: `${prefijo}Metal Base`, valor: p.zona_mb });
        if (p.zona_zac  != null && String(p.zona_zac).trim()  !== '') zonas.push({ zona: `${prefijo}Z.A.C.`,    valor: p.zona_zac });
        if (p.zona_sold != null && String(p.zona_sold).trim() !== '') zonas.push({ zona: `${prefijo}Soldadura`, valor: p.zona_sold });
      });
      datos = Object.assign({}, datos, { zonas, modo_resultado: 'narrativo' });
    }
  }

  // Modo de resultado en microscopio: 'narrativo' (zonas libres + texto) o 'tabla'
  const modoMicro = (datos.modo_resultado === 'tabla') ? 'tabla' : 'narrativo';
  let ocultarTablaMicro = false;

  // ── Variante 1: Medidor Fischer portátil ─────────────────────────────────
  if (variante === 'fischer') {
    {
      // Orden CONDICIONES: Código de referencia → Norma de ensayo → Metodología.
      // El template tiene metodologia_linea antes que norma_linea, así que
      // concentramos las tres ordenadas en metodologia_linea y ocultamos norma_linea.
      const _met = (datos.metodologia || '').trim()
        ? `Metodología de ensayo: ${datos.metodologia.trim()}`
        : 'Metodología de ensayo: ITM N°032';
      const _cond = [];
      if ((datos.cod_referencia || '').trim()) _cond.push(`Código de referencia: ${datos.cod_referencia.trim()}`);
      if ((datos.norma || '').trim())          _cond.push(`Norma de ensayo: ${datos.norma.trim()}`);
      if ((datos.norma_otra || '').trim())     _cond.push(`Norma de ensayo: ${datos.norma_otra.trim()}`);
      _cond.push(_met);
      templateData.metodologia_linea = _cond.join('\n');
      templateData.norma_linea = '__SECTION_HIDE__';
    }

    templateData.zona_examinada_linea = (datos.zona_examinada || '').trim()
      ? `Zona examinada: ${datos.zona_examinada.trim()}`
      : '__SECTION_HIDE__';

    templateData.sectores_linea = (datos.sectores || '').trim()
      ? `Sectores analizados: ${datos.sectores.trim()}`
      : '__SECTION_HIDE__';

    templateData.mediciones_linea = (datos.cantidad_mediciones || '').toString().trim()
      ? `Mediciones realizadas: Cantidad ${String(datos.cantidad_mediciones).trim()}`
      : '__SECTION_HIDE__';

    templateData.temperatura_linea = (datos.temperatura != null && datos.temperatura !== '')
      ? `Temperatura de ensayo: ${String(datos.temperatura).replace('.', ',')}°C`
      : '__SECTION_HIDE__';

    const textoLibreFischer = sentenceCase((datos.resultado_texto_libre || '').trim());
    const sinDet = datos.sin_deteccion === true || datos.sin_deteccion === 'true';
    if (textoLibreFischer) {
      // El texto libre sobreescribe cualquier otra lógica de resultado.
      templateData.resultado_op1 = textoLibreFischer;
      templateData.resultado_op2 = '__SECTION_HIDE__';
    } else if (sinDet) {
      templateData.resultado_op1 = '__SECTION_HIDE__';
      templateData.resultado_op2 = 'Luego de realizado el ensayo no se detecta la presencia de ferrita delta (Valor < 0.1 %)';
    } else {
      const res = String(resultadoFischer).trim().replace('.', ','); // coma decimal (es-AR)
      templateData.resultado_op1 = res !== ''
        ? `Luego de realizado el ensayo la muestra analizada presenta un contenido de ferrita delta de ${res} %`
        : '__SECTION_HIDE__';
      templateData.resultado_op2 = '__SECTION_HIDE__';
    }

    // Variante 2 → todo oculto
    templateData.metodologia_v2_linea = '__SECTION_HIDE__';
    templateData.zona_v2_linea        = '__SECTION_HIDE__';
    templateData.probetas_v2_linea    = '__SECTION_HIDE__';
    templateData.mediciones_v2_linea  = '__SECTION_HIDE__';
    templateData.resultado_v2_texto   = '__SECTION_HIDE__';
    for (const f of ['mb_a','mb_b','zac_ra','zac_rb','sold_cara','sold_med','sold_raiz']) {
      templateData[`tabla_${f}_c1`] = '__HIDE__';
      templateData[`tabla_${f}_c2`] = '__HIDE__';
    }

  } else {
    // ── Variante 2: Microscopio + Fischer ─────────────────────────────────
    templateData.metodologia_linea    = '__SECTION_HIDE__';
    templateData.norma_linea          = '__SECTION_HIDE__';
    templateData.zona_examinada_linea = '__SECTION_HIDE__';
    templateData.sectores_linea       = '__SECTION_HIDE__';
    templateData.mediciones_linea     = '__SECTION_HIDE__';
    templateData.temperatura_linea    = '__SECTION_HIDE__';
    templateData.resultado_op1        = '__SECTION_HIDE__';
    templateData.resultado_op2        = '__SECTION_HIDE__';

    // Norma + metodología juntos en metodologia_v2_linea (multi-línea con \n).
    // El template tiene linebreaks: true, así que cada \n se renderiza como salto.
    // Orden CONDICIONES: Código de referencia → Norma de ensayo → Metodología.
    const lineasMet = [];
    if ((datos.cod_referencia || '').trim()) lineasMet.push(`Código de referencia: ${datos.cod_referencia.trim()}`);
    if ((datos.norma || '').trim()) lineasMet.push(`Norma de ensayo: ${datos.norma.trim()}`);
    if ((datos.norma_otra || '').trim()) lineasMet.push(`Norma de ensayo: ${datos.norma_otra.trim()}`);
    lineasMet.push((datos.metodologia || '').trim()
      ? `Metodología de ensayo: ${datos.metodologia.trim()}`
      : 'Metodología de ensayo según procedimiento interno');
    templateData.metodologia_v2_linea = lineasMet.join('\n');

    // Zona examinada + temperatura + reactivo + aumento en zona_v2_linea
    const lineasZona = [];
    if (modoMicro === 'narrativo' && Array.isArray(datos.zonas) && datos.zonas.length > 0) {
      const nombresZonas = datos.zonas.map(z => (z.zona || '').trim()).filter(Boolean);
      if (nombresZonas.length) lineasZona.push(`Zona examinada: ${nombresZonas.join(' - ')}`);
    } else {
      const zonasV2 = datos.zonas_v2 || ['Metal Base', 'Z.A.C.', 'Soldadura'];
      lineasZona.push(`Zona examinada: ${zonasV2.join(' - ')}`);
    }
    if ((datos.reactivo || '').trim())  lineasZona.push(`Reactivo utilizado: ${datos.reactivo.trim()}`);
    if ((datos.aumento || '').trim())   lineasZona.push(`Aumento utilizado: ${datos.aumento.trim()}`);
    if (datos.temperatura != null && datos.temperatura !== '') {
      lineasZona.push(`Temperatura de ensayo: ${String(datos.temperatura).replace('.', ',')}°C`);
    }
    templateData.zona_v2_linea = lineasZona.length ? lineasZona.join('\n') : '__SECTION_HIDE__';

    templateData.probetas_v2_linea = (datos.cantidad_probetas || '').toString().trim()
      ? `Probetas analizadas: Cantidad ${String(datos.cantidad_probetas).trim()}`
      : '__SECTION_HIDE__';

    templateData.mediciones_v2_linea = (datos.cantidad_mediciones_v2 || '').toString().trim()
      ? `Mediciones realizadas: ${String(datos.cantidad_mediciones_v2).trim()}`
      : '__SECTION_HIDE__';

    const textoLibreMicro = sentenceCase((datos.resultado_texto_libre || '').trim());
    if (textoLibreMicro) {
      // Texto libre sobreescribe la narrativa auto y oculta la tabla rígida.
      templateData.resultado_v2_texto = textoLibreMicro;
      ocultarTablaMicro = true;
      for (const f of ['mb_a','mb_b','zac_ra','zac_rb','sold_cara','sold_med','sold_raiz']) {
        templateData[`tabla_${f}_c1`] = '__HIDE__';
        templateData[`tabla_${f}_c2`] = '__HIDE__';
      }
    } else if (modoMicro === 'narrativo') {
      // Narrativo: el resultado se arma con las zonas + valores. La tabla se oculta.
      const zonas = Array.isArray(datos.zonas) ? datos.zonas : [];
      const items = zonas
        .map(z => ({ zona: (z.zona || '').trim(), valor: Number(z.valor) }))
        .filter(z => z.zona && !isNaN(z.valor));
      if (items.length > 0) {
        const partesZonas = items.map(z => `${z.zona}: ${String(z.valor).replace('.', ',')} %`).join(', ');
        const promedio = items.reduce((a, z) => a + z.valor, 0) / items.length;
        templateData.resultado_v2_texto =
          `Luego del ensayo, los resultados obtenidos fueron los siguientes: ${partesZonas}. ` +
          `A partir de estos valores, se obtuvo un contenido promedio de ${promedio.toFixed(2).replace('.', ',')} % de ferrita delta.`;
      } else {
        templateData.resultado_v2_texto = '__SECTION_HIDE__';
      }
      // Ocultar la tabla rígida MB/ZAC/Sold completa
      ocultarTablaMicro = true;
      for (const f of ['mb_a','mb_b','zac_ra','zac_rb','sold_cara','sold_med','sold_raiz']) {
        templateData[`tabla_${f}_c1`] = '__HIDE__';
        templateData[`tabla_${f}_c2`] = '__HIDE__';
      }
    } else {
      // Tabla: estructura clásica
      templateData.resultado_v2_texto =
        'Luego de realizado el ensayo la muestra analizada presenta un contenido de ferrita de:';
      for (const f of ['mb_a','mb_b','zac_ra','zac_rb','sold_cara','sold_med','sold_raiz']) {
        templateData[`tabla_${f}_c1`] = (datos[`tabla_${f}_c1`] || '').toString().trim();
        templateData[`tabla_${f}_c2`] = (datos[`tabla_${f}_c2`] || '').toString().trim();
      }
    }
  }

  // ── OAA ───────────────────────────────────────────────────────────────────
  const textosOAA = [];
  if (datos.oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  // ── NOTA (texto libre opcional, se inserta vía post-proceso) ─────────────
  const notaTexto = (datos.tiene_nota && (datos.nota_texto || '').trim())
    ? datos.nota_texto.trim()
    : '';

  // ── Cargar template ───────────────────────────────────────────────────────
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

  // ── Post-proceso ──────────────────────────────────────────────────────────
  if (!ot.es_preinforme) outXml = ocultarParrafoConTexto(outXml, 'informe preliminar');

  outXml = eliminarSeccionesOcultas(outXml);
  outXml = eliminarFilasOcultas(outXml);
  outXml = eliminarBloqueVarianteInactiva(outXml, variante);

  // Eliminar párrafos hardcoded del template que el usuario no cargó:
  // "Rango de medición: 0,1 a 80 % Fe...", "Límite de detección 0,1%" y
  // "Termohigrómetro TAG N°MM-700". Solo se emiten si el usuario los especifica
  // en el form.
  // "Límite de detección 0,1%": en el template el texto está partido en runs
  // ("Límite " + "de detección 0,1%"), por eso hay que buscar un fragmento que
  // viva dentro de un solo run ("de detecci", sin acentos → robusto).
  for (const t of [
    'Rango de medici',
    'de detecci',
    'Termohigrómetro TAG',
  ]) {
    outXml = ocultarParrafoConTexto(outXml, t);
  }

  // Fix alineamiento: algunos párrafos del template tienen espacios al inicio
  // del texto en lugar de w:ind. Normalizamos a w:ind w:left="851" como el resto
  // de las líneas de la sección.
  outXml = normalizarSangriaParrafos(outXml, [
    'Medidor de ferrita delta',
    'Microscopio Leica',
    'Set de patrones Fischer',
  ]);

  // Equipo extra (equipo_otro + equipo_otro_tag): inyectar al final del bloque EQUIPAMIENTO
  {
    const eqOtro = (datos.equipo_otro || '').trim();
    if (eqOtro) {
      const eqTag = (datos.equipo_otro_tag || '').trim();
      const linea = eqTag ? `${eqOtro} TAG N°${eqTag}` : eqOtro;
      outXml = insertarLineaAntesDe(outXml, ['RESULTADOS OBTENIDOS', 'RESULTADO OBTENIDO'], pLineaFD(linea));
    }
  }

  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(function (linea) {
    outXml = insertarLineaAntesDe(outXml, ['RESULTADOS OBTENIDOS', 'RESULTADO OBTENIDO'], pLineaFD(linea));
  });

  // Tabla de mediciones (mediciones_ferrita[]): antes de EVALUACION / NOTA / FIN
  {
    const tabla = construirTablaMedicionesFerrita(datos.mediciones_ferrita);
    if (tabla) {
      outXml = insertarLineaAntesDe(outXml, ['EVALUACION DE', 'NOTA', 'FIN DE INFORME'], tabla);
    }
  }

  // En modo narrativo (microscopio), ocultar la tabla rígida MB/ZAC/Sold + su caption
  if (ocultarTablaMicro) {
    outXml = eliminarTablaYCaption(outXml);
  }

  // OAA: asterisco en "DETERMINACION DE FERRITA DELTA"
  if (datos.oaa) {
    outXml = outXml.replace(
      /(<w:t[^>]*>DETERMINACION DE FERRITA DELTA)(\s*)(<\/w:t>)/g,
      '$1*$2$3'
    );
  }

  // Numeración como texto (igual que brinell/plegado)
  // seccionInicio: en combinados el word-generator lo renumera después; aquí
  // siempre arrancamos en 1 — renumerarSecciones lo corrige para combinados
  outXml = convertirNumberingATexto(outXml, 1);
  outXml = eliminarParrafosVacios(outXml);
  outXml = espaciarSubtitulos(outXml);   // después de eliminarParrafosVacios
  // NOTA primero para que ajustarEspaciado normalice blancos antes del heading "NOTA".
  if (notaTexto) outXml = insertarBloqueNota(outXml, notaTexto);
  outXml = forzarCalibri(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  outXml = minimizarUltimoParagrafo(outXml);
  // En modo secundario (combinado), eliminar cualquier blank que quede
  // después del último párrafo con contenido (antes de FIN DE INFORME o al final)
  if (esSecundario) outXml = eliminarBlancosTrasUltimoContenido(outXml);

  // Imagen de carátula (solo standalone con fotos) — multi-imagen vía helper
  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'ferrita_delta');

  // Headers
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

  // Eliminar numbering.xml del output — ya convertido a texto, no se necesita
  // y causa error "Listas 1" en Word al haber colisión de numId con otros ensayos
  delete processedZip.files['word/numbering.xml'];
  // Limpiar referencia en _rels
  const relsPath = 'word/_rels/document.xml.rels';
  if (processedZip.files[relsPath]) {
    let relsXml = processedZip.files[relsPath].asText();
    relsXml = relsXml.replace(/<Relationship[^>]*numbering[^>]*\/>/g, '');
    processedZip.file(relsPath, relsXml);
  }
  // Limpiar Content_Types
  const ctPath = '[Content_Types].xml';
  if (processedZip.files[ctPath]) {
    let ctXml = processedZip.files[ctPath].asText();
    ctXml = ctXml.replace(/<Override[^>]*numbering[^>]*\/>/g, '');
    processedZip.file(ctPath, ctXml);
  }

  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Inserta un bloque XML (párrafo o tabla) justo antes del primer landmark de la lista
// que aparezca en el documento (usando el <w:p> que lo contiene como referencia).
function insertarLineaAntesDe(xml, landmarks, bloqueXml) {
  if (!bloqueXml) return xml;
  for (const marker of landmarks) {
    const pos = xml.indexOf(marker);
    if (pos < 0) continue;
    const pStart = scanBackForTag(xml, '<w:p', pos);
    if (pStart < 0) continue;
    return xml.slice(0, pStart) + bloqueXml + xml.slice(pStart);
  }
  return xml;
}

// Para cada párrafo que contiene alguno de los textos dados:
// 1. Elimina espacios iniciales del primer <w:t> (texto hardcoded con padding manual).
// 2. Garantiza <w:ind w:left="851"/> en el pPr para que coincida con el resto.
function normalizarSangriaParrafos(xml, textos) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    const visible = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    if (!textos.some(t => visible.includes(t))) return p;

    // Quitar espacios iniciales del primer w:t con contenido textual
    let out = p.replace(/(<w:t[^>]*>)(\s+)([^<])/, '$1$3');

    // Garantizar w:ind w:left="851" en pPr (reemplaza el existente o agrega uno nuevo)
    if (/<w:ind\b[^/]*\/>/.test(out)) {
      out = out.replace(/<w:ind\b[^/]*\/>/, '<w:ind w:left="851"/>');
    } else if (out.includes('</w:pPr>')) {
      out = out.replace('</w:pPr>', '<w:ind w:left="851"/></w:pPr>');
    } else {
      out = out.replace(/<w:p\b[^>]*>/, m => m + '<w:pPr><w:ind w:left="851"/></w:pPr>');
    }
    return out;
  });
}

// ── eliminarBloqueVarianteInactiva ────────────────────────────────────────────
function eliminarBloqueVarianteInactiva(xml, variante) {
  const marker = 'DETERMINACION DE FERRITA DELTA';
  const pos1 = xml.indexOf(marker);
  if (pos1 < 0) return xml;
  const pos2 = xml.indexOf(marker, pos1 + marker.length);
  if (pos2 < 0) return xml;

  const p2Start = scanBackForTag(xml, '<w:p', pos2);
  if (p2Start < 0) return xml;

  const finPos = xml.indexOf('FIN DE INFORME');
  if (finPos < 0) return xml;
  const pFinStart = scanBackForTag(xml, '<w:p', finPos);
  if (pFinStart < 0) return xml;

  // Page break inyectable: cuando removemos un bloque que contiene el
  // <w:br w:type="page"/> original del template, hay que reponerlo en
  // el bloque que queda.
  const pageBreakPara = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

  if (variante === 'fischer') {
    // Quitamos el bloque microscopio (entre p2Start y pFinStart). El page break
    // del bloque fischer ya está en xml.slice(0, p2Start), así que no hace falta inyectar.
    return xml.slice(0, p2Start) + xml.slice(pFinStart);
  } else {
    // Quitamos el bloque fischer (entre p1Start y p2Start), que contiene el page break
    // del template. Hay que inyectar uno nuevo antes del bloque microscopio.
    const p1Start = scanBackForTag(xml, '<w:p', pos1);
    if (p1Start < 0) return xml;
    return xml.slice(0, p1Start) + pageBreakPara + xml.slice(p2Start);
  }
}

// ── eliminarSeccionesOcultas ──────────────────────────────────────────────────
function eliminarSeccionesOcultas(xml) {
  const MARKER = '__SECTION_HIDE__';
  let result = xml;
  let pos;
  while ((pos = result.indexOf(MARKER)) >= 0) {
    const pClose = result.indexOf('</w:p>', pos);
    if (pClose < 0) break;
    const end   = pClose + '</w:p>'.length;
    const pOpen = scanBackForTag(result, '<w:p', pos);
    if (pOpen < 0) { result = result.slice(0, pos) + result.slice(end); continue; }
    let removeFrom = pOpen, cursor = pOpen;
    while (true) {
      const prevClose = result.lastIndexOf('</w:p>', cursor - 1);
      if (prevClose < 0) break;
      const prevOpen = scanBackForTag(result, '<w:p', prevClose);
      if (prevOpen < 0) break;
      const para = result.slice(prevOpen, prevClose + '</w:p>'.length);
      if (!esParrafoBlanco(para)) break;
      removeFrom = prevOpen; cursor = prevOpen;
    }
    result = result.slice(0, removeFrom) + result.slice(end);
  }
  return result;
}

function eliminarFilasOcultas(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row =>
    /__HIDE__(?!_)/.test(row) ? '' : row
  );
}

function ocultarParrafoConTexto(xml, texto) {
  let result = xml, sp = 0;
  while (true) {
    const idx = result.indexOf(texto, sp);
    if (idx < 0) break;
    const pOpen  = scanBackForTag(result, '<w:p', idx);
    if (pOpen < 0) { sp = idx + texto.length; continue; }
    const pClose = result.indexOf('</w:p>', idx);
    if (pClose < 0) { sp = idx + texto.length; continue; }
    result = result.slice(0, pOpen) + result.slice(pClose + '</w:p>'.length);
  }
  return result;
}

// ── espaciarSubtitulos ────────────────────────────────────────────────────────
// Reemplaza los párrafos blank antes de subtítulos por UN párrafo blank con
// interlineado 1.15 — un enter normal, sin espaciado mayor.
function espaciarSubtitulos(xml) {
  // Blank con 1.15 (igual que el resto del documento)
  const BLANK = '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const parts = [];
  let m;
  while ((m = re.exec(xml)) !== null) parts.push({ start: m.index, end: re.lastIndex, text: m[0] });

  const isSubtitulo = (p) => {
    if (!p.includes('w:left="851"')) return false;
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g,'').trim());
    return wts.some(t => /^\d+\.\d+\.$/.test(t));
  };
  const isTitulo0 = (p) => {
    const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g,'').trim());
    return wts.some(t => /^\d+\.$/.test(t));
  };
  const isBlank = (p) => {
    if (p.includes('w:type="page"')) return false;
    const txts = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g,''));
    return txts.length === 0 || txts.every(t => t.trim() === '');
  };

  // Por cada subtítulo: eliminar blancos previos e insertar 1,
  // EXCEPTO el primero que viene directamente del título (no necesita blank arriba)
  const toDelete = new Set();
  const toInsertBefore = new Set();
  let lastWasTitulo0 = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].text;
    if (isTitulo0(p)) { lastWasTitulo0 = true; continue; }
    if (!isSubtitulo(p)) { if (!isBlank(p)) lastWasTitulo0 = false; continue; }
    // Es subtítulo
    let j = i - 1;
    while (j >= 0 && isBlank(parts[j].text)) { toDelete.add(j); j--; }
    if (!lastWasTitulo0) toInsertBefore.add(i);  // no insertar si viene justo del título
    lastWasTitulo0 = false;
  }

  let result = xml;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (toDelete.has(i)) {
      result = result.slice(0, parts[i].start) + result.slice(parts[i].end);
    } else if (toInsertBefore.has(i)) {
      result = result.slice(0, parts[i].start) + BLANK + result.slice(parts[i].start);
    }
  }
  return result;
}

function eliminarParrafosVacios(xml) {
  // Encontrar posición del page break — los blanks antes de él son carátula, los preservamos
  const pbPos = xml.indexOf('w:type="page"');

  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (par, offset, str) => {
    // Preservar page breaks siempre
    if (par.includes('w:type="page"')) return par;
    if (par.includes('<w:drawing>')) return par; // preservar imágenes
    const tTexts = [...par.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const hasTags = tTexts.length > 0 || /<w:t[^>]*\/>/.test(par) || par.includes('<w:drawing>');
    if (!hasTags || tTexts.every(t => t.trim() === '')) {
      // Preservar blanks de la carátula (antes del page break),
      // EXCEPTO los que tienen left=851 que son artefactos de imagen eliminada
      if (pbPos >= 0 && offset < pbPos && !par.includes('w:left="851"')) return par;
      const rest = str.slice(offset + par.length).replace(/^\s+/, '');
      if (rest.startsWith('</w:tc>')) return par;
      return '';
    }
    return par;
  });
}

// Elimina blancos al final del bloque de ferrita (antes del siguiente PB o FIN DE INFORME).
function eliminarBlancosTrasUltimoContenido(xml) {
  // Encontrar referencia: FIN DE INFORME si existe, o el primer PB después del título
  const finPos = xml.indexOf('FIN DE INFORME');
  let refPStart;

  if (finPos >= 0) {
    refPStart = xml.lastIndexOf('<w:p', finPos);
  } else {
    // Modo secundario: buscar el primer párrafo con PB que NO sea el del título del ensayo
    const titulo = xml.indexOf('DETERMINACION DE FERRITA DELTA');
    const tituloParaEnd = titulo >= 0 ? xml.indexOf('</w:p>', titulo) + 6 : 0;
    const nextPbPos = xml.indexOf('w:type="page"', tituloParaEnd);
    if (nextPbPos < 0) return xml;
    refPStart = xml.lastIndexOf('<w:p', nextPbPos);
  }

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
  const sectPos = before.lastIndexOf('<w:sectPr');
  const lastEnd = before.lastIndexOf('</w:p>');
  return (sectPos > lastEnd)
    ? before.slice(0, sectPos) + minimal + before.slice(sectPos) + xml.slice(bodyEnd)
    : before + minimal + xml.slice(bodyEnd);
}

function manejarImagenCaratula(outXml, processedZip, foto) {
  const ext     = detectarExtImagen(foto);
  const imgName = `imagen_ferrita_caratula.${ext}`;
  processedZip.file(`word/media/${imgName}`, foto);

  let ct = processedZip.files['[Content_Types].xml'].asText();
  if (!ct.includes('Extension="jpg"')) {
    ct = ct.replace('</Types>',
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="png" ContentType="image/png"/></Types>');
    processedZip.file('[Content_Types].xml', ct);
  }
  let relsXml = processedZip.files['word/_rels/document.xml.rels'].asText();
  const rId = 'rId100';
  relsXml = relsXml.replace('</Relationships>',
    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgName}"/></Relationships>`);
  processedZip.file('word/_rels/document.xml.rels', relsXml);

  const ANS   = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const PICNS = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  if (!outXml.includes(ANS)) {
    const wpNs = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    outXml = outXml.includes(wpNs)
      ? outXml.replace(wpNs, `${wpNs} ${ANS} ${PICNS}`)
      : outXml.replace(/<w:document\b/, `$& ${ANS} ${PICNS}`);
  }
  const MAX_W_PX = 567, MAX_H_PX = 416;
  let imgW = MAX_W_PX;
  let imgH = calcularAlto(foto, MAX_W_PX);
  if (imgH > MAX_H_PX) { imgW = Math.round(imgW * MAX_H_PX / imgH); imgH = MAX_H_PX; }
  const cx = imgW * 9525, cy = imgH * 9525;
  return reemplazarImagenCaratula(outXml, rId, imgName, cx, cy);
}

function reemplazarImagenCaratula(xml, rId, name, cx, cy) {
  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="100" name="${name}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  const mp = xml.indexOf('__IMAGE_CARATULA__');
  if (mp < 0) return xml;
  const pClose = xml.indexOf('</w:p>', mp);
  if (pClose < 0) return xml;
  const pOpen = scanBackForTag(xml, '<w:p', mp);
  if (pOpen < 0) return xml;
  return xml.slice(0, pOpen) +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr><w:r>${drawing}</w:r></w:p>` +
    xml.slice(pClose + '</w:p>'.length);
}

function eliminarImagenVacia(xml) {
  const mp = xml.indexOf('__IMAGE_NONE__');
  if (mp < 0) return xml;
  const pClose = xml.indexOf('</w:p>', mp);
  if (pClose < 0) return xml;
  const imgEnd = pClose + '</w:p>'.length;
  const pOpen  = scanBackForTag(xml, '<w:p', mp);
  if (pOpen < 0) return xml;
  let captionEnd = imgEnd, sp = imgEnd;
  while (sp < xml.length) {
    const nextP = xml.indexOf('<w:p', sp);
    if (nextP < 0) break;
    const c = xml[nextP + 4];
    if (c === '>' || c === ' ' || c === '\r' || c === '\n') {
      const nc = xml.indexOf('</w:p>', nextP);
      if (nc >= 0) captionEnd = nc + '</w:p>'.length;
      break;
    }
    sp = nextP + 4;
  }
  return xml.slice(0, pOpen) + xml.slice(captionEnd);
}

// Elimina la primera tabla del bloque microscopio y su caption "Tabla N°1 …".
// Usado en modo narrativo cuando el resultado es texto, no tabla por probetas.
function eliminarTablaYCaption(xml) {
  const tblRe = /<w:tbl\b[\s\S]*?<\/w:tbl>/;
  const m = tblRe.exec(xml);
  if (!m) return xml;
  let end = m.index + m[0].length;
  // ¿Hay un párrafo "Tabla N°X …" inmediatamente después?
  const rest = xml.slice(end, end + 2000);
  const capMatch = rest.match(/^<w:p\b[^>]*>[\s\S]*?<\/w:p>/);
  if (capMatch) {
    const capText = capMatch[0].replace(/<[^>]+>/g, ' ');
    if (/Tabla\s*N[°˚]/i.test(capText)) end += capMatch[0].length;
  }
  return xml.slice(0, m.index) + xml.slice(end);
}

// Inserta un bloque "NOTA" + texto antes del párrafo OAA o FIN DE INFORME.
// Mismo estilo que un subtítulo: bold con left=851.
function insertarBloqueNota(xml, texto) {
  if (!texto) return xml;
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

  const heading = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:b/><w:bCs/>${sz}</w:rPr>` +
    '<w:t xml:space="preserve">NOTA</w:t></w:r></w:p>';

  const lineas = String(texto).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const cuerpo = lineas.map(l => {
    const escaped = l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      '<w:ind w:left="851"/></w:pPr>' +
      `<w:r><w:rPr>${fonts}${sz}</w:rPr>` +
      `<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  }).join('');

  // Sin blanco propio — ajustarEspaciado se ocupa de poner 1 blanco antes de NOTA.
  const bloque = heading + cuerpo;

  // Posición destino: antes del párrafo FIN DE INFORME
  const finPos = xml.indexOf('FIN DE INFORME');
  if (finPos < 0) return xml + bloque;
  const pStart = scanBackForTag(xml, '<w:p', finPos);
  if (pStart < 0) return xml;
  return xml.slice(0, pStart) + bloque + xml.slice(pStart);
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

// Fuerza Calibri 11pt en todo el cuerpo del documento.
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

module.exports = { generarFerritaDeltaDesdeTemplate };
