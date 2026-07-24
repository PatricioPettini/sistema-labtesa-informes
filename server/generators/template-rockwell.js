const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/dureza-rockwell.docx');

// Normas Rockwell — cada una acepta un año editable (`<key>_year`). Si el
// usuario no lo carga, se usa el default histórico como fallback.
const NORMAS = [
  { key: 'norma_astm_e18', base: 'ASTM E18',   sep: '-', yearDefault: '25'   },
  { key: 'norma_iso6508',  base: 'ISO 6508-1', sep: ':', yearDefault: '2016' },
];

// Equipamiento dinámico slots 2-5. Slot 1 = Durómetro Petri MM-012 (hardcodeado).
// Patrón se inyecta vía PMM-*** desde datos.patron.
const EQUIPO = [
  { key: 'termohigro_545',  label: 'Termohigrómetro TAG N˚PCAL-545' },
  { key: 'termohigro_702',  label: 'Termohigrómetro TAG N˚MM-702' },
  { key: 'termohigro_701',  label: 'Termohigrómetro TAG N˚MM-701' },
  { key: 'termohigro_794',  label: 'Termohigrómetro TAG N˚MM-794' },
  { key: 'calibre_571',     label: 'Calibre digital TAG N˚MM-571' },
  { key: 'calibre_694',     label: 'Calibre digital TAG N˚MM-694' },
];

// Variantes (por sede). Por ahora estándar CABA con Petri MM-012.
const EQUIPOS_POR_VARIANTE = {
  estandar: ['termohigro_545', 'termohigro_702', 'termohigro_701', 'calibre_571'],
  neuquen:  ['termohigro_794', 'calibre_694'],
};

// Tabla de escalas Rockwell — para validación y autocompletado de carga/indentador.
const ESCALAS = {
  HRA: { carga: '60',  indentador: 'Cono de diamante 120°' },
  HRB: { carga: '100', indentador: 'Bola de acero 1/16" (1.5875 mm)' },
  HRC: { carga: '150', indentador: 'Cono de diamante 120°' },
  HRD: { carga: '100', indentador: 'Cono de diamante 120°' },
  HRE: { carga: '100', indentador: 'Bola de acero 1/8" (3.175 mm)' },
  HRF: { carga: '60',  indentador: 'Bola de acero 1/16" (1.5875 mm)' },
  HRG: { carga: '150', indentador: 'Bola de acero 1/16" (1.5875 mm)' },
  HRH: { carga: '60',  indentador: 'Bola de acero 1/8" (3.175 mm)' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const FONTS_RW = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const SZ_RW    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

function escXmlRW(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function celdaTablaRW(texto, ancho, header) {
  const BORD = '<w:tcBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';
  const fill = header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
  const bold = header ? '<w:b/><w:bCs/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${BORD}${fill}<w:vAlign w:val="center"/></w:tcPr>` +
    '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS_RW}${bold}${SZ_RW}</w:rPr><w:t xml:space="preserve">${escXmlRW(texto)}</w:t></w:r></w:p></w:tc>`;
}

// Encabezado "MEMORIA ANALÍTICA" + tabla con datos.muestras_rockwell[].
// Columnas: Muestra | Zona | Medición 1 | Medición 2 | Medición 3 | Promedio.
// Devuelve '' si no hay filas válidas.
function construirBloqueMemoriaAnalitica(filas) {
  const filasValidas = (filas || []).filter(f =>
    f && (
      String(f.med1 || '').trim() !== '' ||
      String(f.med2 || '').trim() !== '' ||
      String(f.med3 || '').trim() !== '' ||
      String(f.promedio || '').trim() !== ''
    )
  );
  if (filasValidas.length === 0) return '';

  const colW = [1400, 1600, 1300, 1300, 1300, 1400];
  const total = colW.reduce((a, b) => a + b, 0);
  const grid = '<w:tblGrid>' + colW.map(w => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';
  const header = '<w:tr>' +
    celdaTablaRW('Muestra',     colW[0], true) +
    celdaTablaRW('Zona',        colW[1], true) +
    celdaTablaRW('Medición 1',  colW[2], true) +
    celdaTablaRW('Medición 2',  colW[3], true) +
    celdaTablaRW('Medición 3',  colW[4], true) +
    celdaTablaRW('Promedio',    colW[5], true) +
    '</w:tr>';
  const rows = filasValidas.map(f => '<w:tr>' +
    celdaTablaRW(f.muestra  || '', colW[0], false) +
    celdaTablaRW(f.zona     || '', colW[1], false) +
    celdaTablaRW(f.med1     || '', colW[2], false) +
    celdaTablaRW(f.med2     || '', colW[3], false) +
    celdaTablaRW(f.med3     || '', colW[4], false) +
    celdaTablaRW(f.promedio || '', colW[5], false) +
    '</w:tr>').join('');

  const tabla = '<w:tbl><w:tblPr>' +
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

  const heading = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS_RW}<w:b/><w:bCs/>${SZ_RW}</w:rPr>` +
    '<w:t xml:space="preserve">Tabla — Memoria analítica</w:t></w:r></w:p>';

  const blank = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  return blank + heading + tabla + blank;
}

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

// ── Generador principal ───────────────────────────────────────────────────────

function generarRockwellDesdeTemplate(ot, datos, fotosCaratula) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  const equipo = datos.equipamiento || {};

  // ── Escala (HRC por defecto). Determina carga e indentador sugeridos. ─────
  const escalaRaw = (datos.escala || 'HRC').toUpperCase().trim();
  const escalaKey = ESCALAS[escalaRaw] ? escalaRaw : 'HRC';
  const escalaInfo = ESCALAS[escalaKey];

  // ── Condiciones de ensayo ─────────────────────────────────────────────────
  const normas = NORMAS.filter(n => datos[n.key]).map(n => {
    const yr = String(datos[n.key + '_year'] || '').trim() || n.yearDefault;
    return `Norma de ensayo: ${n.base}${n.sep}${yr}`;
  });
  if (!normas.length) normas.push('Norma de ensayo: ASTM E18-25');
  const normas_seleccionadas_linea = normas.join('\n');

  const metodologia_linea = datos.metodologia
    ? `Metodología de ensayo: ${datos.metodologia}`
    : 'Metodología de ensayo: ITM N˚060';

  // Escala/Carga/Indentador — se emiten SOLO si el usuario los cargó (o si el
  // preinforme físico se rellena manualmente). Antes se autocompletaban con
  // el default de ESCALAS[HRC] aunque el usuario no lo pidiera.
  const escala_linea = (datos.escala && String(datos.escala).trim())
    ? `Escala utilizada: ${escalaKey}` : '__SECTION_HIDE__';

  const indentador_linea = (datos.indentador && String(datos.indentador).trim())
    ? `Indentador: ${String(datos.indentador).trim()}` : '__SECTION_HIDE__';

  const carga_aplicada_linea = (datos.carga_aplicada && String(datos.carga_aplicada).trim())
    ? `Carga aplicada: ${String(datos.carga_aplicada).trim()} Kgf` : '__SECTION_HIDE__';

  const espesor_probeta_linea = datos.espesor_probeta
    ? `Espesor de probeta: ${datos.espesor_probeta} mm`
    : '__SECTION_HIDE__';

  const zona_ensayo_linea = datos.zona_ensayo
    ? `Zona ensayada: ${datos.zona_ensayo}`
    : '__SECTION_HIDE__';

  // patron_linea: oculto siempre — el patrón se inserta vía PMM-*** en el bloque
  // de equipamiento más abajo (igual que en brinell).
  const patron_linea = '__SECTION_HIDE__';

  let temperatura_ensayo_linea = '__SECTION_HIDE__';
  if (datos.temperatura !== '' && datos.temperatura != null) {
    temperatura_ensayo_linea = `Temperatura de ensayo: ${datos.temperatura}˚C`;
  }

  // ── Equipamiento dinámico (slots 2–5) ────────────────────────────────────
  const variante = datos.variante === 'neuquen' ? 'neuquen' : 'estandar';
  const equiposVar = EQUIPOS_POR_VARIANTE[variante];
  const listaEquipos = EQUIPO
    .filter(e => equipo[e.key] && equiposVar.includes(e.key))
    .map(e => e.label);

  // Equipos extra del catálogo (DB, agregados desde el form via equipamiento_extra)
  if (Array.isArray(datos.equipamiento_extra)) {
    datos.equipamiento_extra.forEach(function (e) {
      if (e && (e.nombre || e.label)) listaEquipos.push(e.nombre || e.label);
    });
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => listaEquipos.push(l));
  const equipSlots = {};
  for (let i = 2; i <= 5; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquipos[i - 2] || '__SECTION_HIDE__';
  }

  // ── Resultados: prioriza tabla 1 (`zonas_rockwell` con muestra/zona/dureza).
  // Si el usuario no cargó tabla 1, cae al legacy `mediciones[{dureza}]`.
  const zonasTabla1 = Array.isArray(datos.zonas_rockwell)
    ? datos.zonas_rockwell.filter(z => z && (String(z.dureza || '').trim() !== '' || String(z.zona || '').trim() !== '' || String(z.muestra || '').trim() !== ''))
    : [];
  const filasResultados = zonasTabla1.length
    ? zonasTabla1.map(z => ({
        muestra: String(z.muestra || '').trim(),
        zona:    String(z.zona    || '').trim(),
        dureza:  String(z.dureza  || '').trim(),
      })).filter(r => r.dureza !== '' || r.zona !== '' || r.muestra !== '')
    : (datos.mediciones || [])
        .filter(m => m && m.dureza != null && String(m.dureza).trim() !== '')
        .map((m, i) => ({
          muestra: String(m.muestra || (i + 1)).trim(),
          zona:    String(m.zona    || '').trim(),
          dureza:  String(m.dureza  || '').trim(),
        }));

  const resultados = {};
  for (let i = 1; i <= 6; i++) {
    const r = filasResultados[i - 1];
    if (r) {
      // La columna "impronta" del template ahora se usa para MUESTRA/OT N°.
      resultados[`resultado_${i}_impronta`] = r.muestra || String(i);
      resultados[`resultado_${i}_zona`]     = r.zona;
      resultados[`resultado_${i}_dureza`]   = r.dureza;
    } else {
      resultados[`resultado_${i}_impronta`] = '__HIDE__';
      resultados[`resultado_${i}_zona`]     = '';
      resultados[`resultado_${i}_dureza`]   = '';
    }
  }

  // Promedio automático (entero) sobre las durezas cargadas.
  let promedio = '';
  if (datos.promedio != null && datos.promedio !== '') {
    promedio = String(datos.promedio);
  } else if (filasResultados.length > 0) {
    const nums = filasResultados.map(r => Number(String(r.dureza).replace(',', '.'))).filter(n => !isNaN(n));
    if (nums.length > 0) {
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      promedio = String(Math.round(avg));
    }
  }

  // Unidad de dureza para el header de tabla (HRC, HRB, etc.) — escapamos &
  const unidad_dureza = `(${escalaKey})`;

  // ── NOTA (texto libre) ────────────────────────────────────────────────────
  const notaActiva = datos.tiene_nota !== false && (datos.nota_texto || '').trim();
  const observaciones_linea = notaActiva ? (datos.nota_texto || '').trim() : '__SECTION_HIDE__';
  const mostrarNota = observaciones_linea !== '__SECTION_HIDE__';

  // ── Evaluación de resultados (opcional antes de FIN DE INFORME) ──────────
  const evaluacionActiva = !!datos.tiene_evaluacion && (datos.evaluacion_texto || '').trim();
  const evaluacionTexto = evaluacionActiva ? datos.evaluacion_texto.trim() : '';

  // ── Imagen carátula ───────────────────────────────────────────────────────
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const imagen_recepcion = fotos.length > 0 ? '__IMAGE_HERE__' : '__IMAGE_NONE__';

  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  const templateData = {
    numero_ot:    nroOtBase,
    razon_social: ot.razon_social       || '',
    fecha_generacion: ot.fecha_finalizacion || '',

    identificacion_muestra:          ot.id_muestra        || '',
    fecha_recepcion_muestra:         ot.fecha_recepcion   || '',
    fecha_aprobacion_inicio_trabajo: ot.fecha_aprobacion  || '',
    fecha_finalizacion_certificado:  ot.fecha_finalizacion || '',
    imagen_recepcion,

    normas_seleccionadas_linea,
    metodologia_linea,
    espesor_probeta_linea,
    escala_linea,
    indentador_linea,
    carga_aplicada_linea,
    zona_ensayo_linea,
    patron_linea,
    temperatura_ensayo_linea,
    unidad_dureza,

    ...equipSlots,
    ...resultados,
    promedio,

    observaciones_linea,
  };

  // ── Docxtemplater ─────────────────────────────────────────────────────────
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  doc.render(templateData);

  // ── Post-proceso ──────────────────────────────────────────────────────────
  const processedZip = doc.getZip();
  let outXml = processedZip.files['word/document.xml'].asText();

  // Metodología: el template tiene "Metodología de ensayo: {{metodologia_linea}}" sin
  // hardcoded; no requiere replace. Se rellena por el placeholder.

  // Patrón: si viene el dato reemplaza los ***, si no elimina toda la línea.
  if (datos.patron && String(datos.patron).trim()) {
    const p = String(datos.patron).trim().replace(/^PMM-/i, '');
    outXml = outXml.replace(/PMM-\*\*\*/g, `PMM-${p}`);
  } else {
    outXml = ocultarParrafoConTexto(outXml, 'PMM-***');
  }

  // OAA: si el ensayo está fuera del alcance, agregar "*" al título
  if (datos.oaa) {
    outXml = outXml.replace(
      /(<w:t[^>]*>ENSAYO DE DUREZA ROCKWELL)(\s*)(<\/w:t>)/,
      '$1*$2$3'
    );
  }

  // Quitar highlights y shading heredados del template original (gris/cyan)
  outXml = outXml.replace(/<w:highlight[^/]*\/>/g, '');
  outXml = outXml.replace(/<w:shd w:val="clear"[^/]*\/>/g, '');

  outXml = eliminarFilasOcultas(outXml);
  outXml = eliminarFilasVacias(outXml);
  outXml = eliminarSeccionesOcultas(outXml);
  outXml = convertirNumberingATexto(outXml);

  // Ocultar heading NOTA cuando no hay texto de nota
  if (!mostrarNota) outXml = ocultarParrafoConTexto(outXml, 'NOTA');

  // Eliminar columna Zona (los informes reales de Rockwell solo tienen Impronta/Dureza)
  outXml = eliminarColumnaZonaRockwell(outXml);

  // El texto OAA del template va fuera de NOTA. Siempre lo ocultamos del template;
  // si datos.oaa, lo agregamos en post-proceso como párrafo centrado en negrita.
  outXml = ocultarParrafoConTexto(outXml, 'Los ensayos marcados con');

  const textosOAA = [];
  if (datos.oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  // Centrar identificación de muestra y tabla de resultados
  outXml = centrarIdentificacionMuestra(outXml);
  outXml = centrarTabla(outXml);

  // Calibri 11pt en todo el cuerpo
  outXml = forzarCalibri(outXml);

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'rockwell');

  // Headers: razon_social, numero_ot, fecha_generacion
  ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'].forEach(hdrPath => {
    const entry = processedZip.files[hdrPath];
    if (!entry) return;
    let hdrXml = entry.asText();
    hdrXml = hdrXml
      .replace(/\{\{razon_social\}\}/g,     templateData.razon_social)
      .replace(/\{\{numero_ot\}\}/g,        templateData.numero_ot)
      .replace(/\{\{fecha_generacion\}\}/g, templateData.fecha_generacion);
    hdrXml = hdrXml.replace(
      /(<w:tab\/>)<w:t xml:space="preserve">  <\/w:t><\/w:r>(<w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:tab\/>)(<\/w:r>)((?:<w:bookmarkStart[^\/]*\/>|<w:bookmarkEnd[^\/]*\/>)*)(<w:r[^>]*>[\s\S]*?<w:t[^>]*>Fecha:)/,
      '$1</w:r>$4$5'
    );
    processedZip.file(hdrPath, hdrXml);
  });

  outXml = eliminarParrafosVacios(outXml);
  if (evaluacionActiva) outXml = insertarBloqueEvaluacion(outXml, evaluacionTexto);

  // Memoria analítica (datos.muestras_rockwell[]): tabla con 3 mediciones por muestra + promedio.
  {
    const bloqueMemoria = construirBloqueMemoriaAnalitica(datos.muestras_rockwell);
    if (bloqueMemoria) {
      const finPos = outXml.indexOf('FIN DE INFORME');
      if (finPos >= 0) {
        const pStart = scanBackForTag(outXml, '<w:p', finPos);
        if (pStart >= 0) {
          outXml = outXml.slice(0, pStart) + bloqueMemoria + outXml.slice(pStart);
        }
      }
    }
  }

  outXml = ajustarEspaciado(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  outXml = minimizarUltimoParagrafo(outXml);

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones (copiadas/adaptadas de template-brinell.js) ──────

function eliminarFilasOcultas(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    if (/__HIDE__(?!_)/.test(row)) return '';
    return row;
  });
}

function eliminarFilasVacias(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    const cells = [...row.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)];
    if (cells.length < 2) return row;
    const hasValue = cells.slice(1).some(c => {
      const texts = [...c[1].matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map(m => m[1].trim());
      return texts.some(t => t.length > 0);
    });
    if (!hasValue) return '';
    return row;
  });
}

function centrarTabla(xml) {
  xml = xml.replace(/<\/w:tblPr>/g, (match, offset) => {
    const prevTblPr = xml.lastIndexOf('<w:tblPr', offset);
    if (prevTblPr >= 0 && xml.slice(prevTblPr, offset).includes('<w:jc')) return match;
    return '<w:jc w:val="center"/>' + match;
  });
  let result = '', pos = 0;
  while (pos < xml.length) {
    let tcStart = -1, sp = pos;
    while (sp < xml.length) {
      const idx = xml.indexOf('<w:tc', sp);
      if (idx < 0) break;
      const c = xml[idx + 5];
      if (c === '>' || c === ' ' || c === '\r' || c === '\n') { tcStart = idx; break; }
      sp = idx + 5;
    }
    if (tcStart < 0) { result += xml.slice(pos); break; }
    const tcEnd = xml.indexOf('</w:tc>', tcStart);
    if (tcEnd < 0) { result += xml.slice(pos); break; }
    result += xml.slice(pos, tcStart) + centrarCelda(xml.slice(tcStart, tcEnd + '</w:tc>'.length));
    pos = tcEnd + '</w:tc>'.length;
  }
  return result;
}

function centrarCelda(tcXml) {
  let result = tcXml.replace(/<w:jc\b[^>]*\/>/g, '<w:jc w:val="center"/>');
  result = result.replace(/<w:spacing\b[^/]*\/>/g, '<w:spacing w:after="0" w:before="0"/>');
  result = result.replace(/<\/w:pPr>/g, (match, offset) => {
    const pPrOpen = result.lastIndexOf('<w:pPr', offset);
    const pPrSlice = pPrOpen >= 0 ? result.slice(pPrOpen, offset) : '';
    let prefix = '';
    if (!pPrSlice.includes('<w:jc'))      prefix += '<w:jc w:val="center"/>';
    if (!pPrSlice.includes('<w:spacing')) prefix += '<w:spacing w:after="0" w:before="0"/>';
    return prefix + match;
  });
  result = result.replace(/(<w:p\b[^>]*>)(?!\s*<w:pPr)/g,
    '$1<w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr>');
  return result;
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

function ocultarParrafoConTexto(xml, texto) {
  return xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, p => {
    const visible = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    return visible.includes(texto) ? '' : p;
  });
}

function centrarIdentificacionMuestra(xml) {
  return xml.replace(
    /(<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*?<w:tabs><w:tab w:val="center"[^>]*\/>(?:(?!<\/w:tabs>)[\s\S])*?<\/w:tabs>(?:(?!<\/w:pPr>)[\s\S])*?<\/w:pPr>)([\s\S]*?<\/w:p>)/g,
    (match, pPr, rest) => {
      const newPPr = pPr.includes('<w:jc') ? pPr : pPr.replace('</w:pPr>', '<w:jc w:val="center"/></w:pPr>');
      const newRest = rest.replace(/<w:tab\/>(?=<w:t)/, '');
      return newPPr + newRest;
    }
  );
}

function ajustarEspaciado(xml) {
  const LANDMARKS = [
    { texto: 'CONDICIONES DE ENSAYO',     blancos: 0 },
    { texto: 'EQUIPAMIENTO UTILIZADO',    blancos: 1 },
    { texto: 'RESULTADO OBTENIDO',        blancos: 1 },
    { texto: 'EVALUACION DE RESULTADOS',  blancos: 1 },
    { texto: 'NOTA',                      blancos: 1 },
    { texto: 'FIN DE INFORME',            blancos: 1 },
  ];
  for (const { texto, blancos } of LANDMARKS) {
    const pos = xml.indexOf(texto);
    if (pos >= 0) xml = ajustarBlancoAntes(xml, pos, blancos);
  }
  const drawingPos = xml.indexOf('<w:drawing>');
  if (drawingPos >= 0) xml = ajustarBlancoAntes(xml, drawingPos, 1);
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
  const padding = count > 0 ? '<w:p></w:p>' : '';
  return before + padding + xml.slice(paraStart);
}

function eliminarSeccionesOcultas(xml) {
  const MARKER = '__SECTION_HIDE__';
  let result = xml;
  let markerPos;
  while ((markerPos = result.indexOf(MARKER)) >= 0) {
    const pClose = result.indexOf('</w:p>', markerPos);
    if (pClose < 0) break;
    const contentEnd = pClose + '</w:p>'.length;
    const pOpen = scanBackForTag(result, '<w:p', markerPos);
    if (pOpen < 0) { result = result.slice(0, markerPos) + result.slice(contentEnd); continue; }
    let removeFrom = pOpen;
    let cursor = pOpen;
    while (true) {
      const prevClose = result.lastIndexOf('</w:p>', cursor - 1);
      if (prevClose < 0) break;
      const prevOpen = scanBackForTag(result, '<w:p', prevClose);
      if (prevOpen < 0) break;
      const para = result.slice(prevOpen, prevClose + '</w:p>'.length);
      if (!esParrafoBlanco(para)) break;
      removeFrom = prevOpen;
      cursor = prevOpen;
    }
    result = result.slice(0, removeFrom) + result.slice(contentEnd);
  }
  return result;
}

function eliminarParrafosVacios(xml) {
  const pbPos = xml.indexOf('w:type="page"');
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (par, offset, str) => {
    if (par.includes('w:type="page"')) return par;
    if (par.includes('<w:drawing>')) return par; // preservar imágenes
    const tTexts = [...par.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const hasTags = tTexts.length > 0 || /<w:t[^>]*\/>/.test(par) || par.includes('<w:drawing>');
    if (!hasTags || tTexts.every(t => t.trim() === '')) {
      if (pbPos >= 0 && offset < pbPos && !par.includes('w:left="851"')) return par;
      const rest = str.slice(offset + par.length).replace(/^\s+/, '');
      if (rest.startsWith('</w:tc>')) return par;
      return '';
    }
    return par;
  });
}

function minimizarUltimoParagrafo(xml) {
  const bodyEnd = xml.lastIndexOf('</w:body>');
  if (bodyEnd < 0) return xml;
  let before = xml.slice(0, bodyEnd);
  let removed = 0;
  while (true) {
    const lastClose = before.lastIndexOf('</w:p>');
    if (lastClose < 0) break;
    const lastOpen = scanBackForTag(before, '<w:p', lastClose);
    if (lastOpen < 0) break;
    const para = before.slice(lastOpen, lastClose + '</w:p>'.length);
    if (para.includes('<w:sectPr')) break;
    if (!esParrafoBlanco(para)) break;
    before = before.slice(0, lastOpen) + before.slice(lastClose + '</w:p>'.length);
    removed++;
  }
  if (removed === 0) return xml;
  const minimal = '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';
  const sectPrPos  = before.lastIndexOf('<w:sectPr');
  const lastParaEnd = before.lastIndexOf('</w:p>');
  if (sectPrPos > lastParaEnd) {
    return before.slice(0, sectPrPos) + minimal + before.slice(sectPrPos) + xml.slice(bodyEnd);
  }
  return before + minimal + xml.slice(bodyEnd);
}

function convertirNumberingATexto(xml) {
  const NIVELES = [
    { texto: null, left: 0,   tab: 426  },
    { texto: null, left: 426, tab: 851  },
  ];
  const counters = [0, 0, 0];
  let result = xml;
  result = result.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, par => {
    if (!par.includes('<w:numPr>')) return par;
    const lvlMatch = par.match(/<w:ilvl w:val="(\d+)"/);
    const level = lvlMatch ? parseInt(lvlMatch[1]) : 0;
    counters[level] = (counters[level] || 0) + 1;
    for (let l = level + 1; l < counters.length; l++) counters[l] = 0;
    let numTexto;
    if (level === 0) numTexto = `${counters[0]}.`;
    else if (level === 1) numTexto = `${counters[0]}.${counters[1]}.`;
    else numTexto = `${counters[0]}.${counters[1]}.${counters[2]}.`;
    const cfg = NIVELES[Math.min(level, NIVELES.length - 1)];
    let newPar = par
      .replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '')
      .replace(/<w:numId[^/]*\/>/g, '');
    const tabsXml = `<w:tabs><w:tab w:val="left" w:pos="${cfg.tab}"/></w:tabs>`;
    const indXml  = `<w:ind w:left="${cfg.left}" w:hanging="0"/>`;
    if (newPar.includes('<w:pPr>')) {
      newPar = newPar
        .replace(/<w:ind\b[^/]*\/>/g, '')
        .replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, '')
        .replace('<w:pPr>', `<w:pPr>${tabsXml}${indXml}`);
    } else {
      newPar = newPar.replace('<w:p', `<w:p><w:pPr>${tabsXml}${indXml}</w:pPr>`);
    }
    const numRun = `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${numTexto}</w:t><w:tab/></w:r>`;
    newPar = newPar.replace(/(<\/w:pPr>)/, `$1${numRun}`);
    const brRunRe = /<w:r\b[^>]*>(?:<w:rPr>(?:(?!<\/w:r>)[\s\S])*?<\/w:rPr>)?<w:br w:type="page"\/><\/w:r>/;
    const brM = newPar.match(brRunRe);
    if (brM) {
      newPar = newPar.replace(brRunRe, '');
      const pageBreakPara = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      newPar = pageBreakPara + newPar;
    }
    return newPar;
  });
  return result;
}

// Elimina la columna Zona del template heredado de brinell. Si la tabla tiene
// 3 gridCol y contiene gridSpan=2 (fila Promedio), borramos la celda del medio.
function eliminarColumnaZonaRockwell(xml) {
  return xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, tbl => {
    const grid = tbl.match(/<w:gridCol[^/]*\/>/g) || [];
    if (grid.length !== 3) return tbl;
    if (!/<w:gridSpan w:val="2"\/>/.test(tbl)) return tbl;

    let out = tbl.replace(
      /(<w:tblGrid>\s*<w:gridCol[^/]*\/>)\s*<w:gridCol[^/]*\/>/,
      '$1'
    );

    out = out.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
      if (/<w:gridSpan w:val="2"\/>/.test(row)) {
        return row
          .replace(/<w:gridSpan w:val="2"\/>/, '')
          .replace(/<w:tcW w:w="2600"\s*w:type="dxa"\/>/, '<w:tcW w:w="1300" w:type="dxa"/>');
      }
      const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g);
      if (!cells || cells.length !== 3) return row;
      return row.replace(cells[1], '');
    });
    return out;
  });
}

function insertarBloqueEvaluacion(xml, texto) {
  if (!texto) return xml;
  const lineas = String(texto).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const fonts  = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz     = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

  const heading = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:b/><w:bCs/>${sz}</w:rPr>` +
    '<w:t xml:space="preserve">EVALUACION DE RESULTADOS</w:t></w:r></w:p>';

  const cuerpo = lineas.map(linea => {
    const escaped = String(linea)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      '<w:ind w:left="851"/></w:pPr>' +
      `<w:r><w:rPr>${fonts}${sz}</w:rPr>` +
      `<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  }).join('');

  const bloque = heading + cuerpo;
  let ref = xml.indexOf('NOTA');
  if (ref < 0) ref = xml.indexOf('FIN DE INFORME');
  if (ref < 0) return xml;
  const pStart = scanBackForTag(xml, '<w:p', ref);
  if (pStart < 0) return xml;
  return xml.slice(0, pStart) + bloque + xml.slice(pStart);
}

module.exports = { generarRockwellDesdeTemplate };
