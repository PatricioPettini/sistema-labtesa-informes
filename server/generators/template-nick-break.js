const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/nick-break.docx');

// Equipamiento por variante. variante_equipo: 'emic' | 'torne'.
// Cada equipo tiene `nombre` (texto que va en el informe) y `tagDefault` (TAG
// que se muestra si el técnico no editó el TAG en el form). El TAG efectivo se
// resuelve al momento de emitir tomando `equipamiento_tags[key]` si existe.
const EQUIPO_EMIC = [
  { key: 'maquina_emic',    nombre: 'Máquina de tracción Emic', tagDefault: 'MM-203' },
  { key: 'calibre_571',     nombre: 'Calibre digital',           tagDefault: 'MM-571' },
  { key: 'calibre_570',     nombre: 'Calibre digital',           tagDefault: 'MM-570' },
  { key: 'termohigrometro', nombre: 'Termohigrómetro',           tagDefault: 'PCAL-545' },
  { key: 'termo_pmm545',    nombre: 'Termohigrómetro',           tagDefault: 'PMM-545' },
  { key: 'termo_702',       nombre: 'Termohigrómetro',           tagDefault: 'MM-702' },
];
// Neuquén — set actual: Prensa TORNE Y MEC + Calibre + Termohigrómetro.
// Se mantienen `shimadzu_151` y `prensa_torne` como keys legacy por si hay
// ensayos guardados con esa referencia.
const EQUIPO_TORNE = [
  { key: 'prensa_torne_413', nombre: 'Prensa Plegadora TORNE Y MEC', tagDefault: 'MM-913' },
  { key: 'calibre_694',      nombre: 'Calibre digital',              tagDefault: 'MM-694' },
  { key: 'termo_794',        nombre: 'Termohigrómetro',              tagDefault: 'MM-794' },
  // Legacy
  { key: 'shimadzu_151', nombre: 'Máquina de tracción Shimadzu', tagDefault: 'MM-151' },
  { key: 'prensa_torne', nombre: 'Prensa Plegadora TORNE Y MEC',  tagDefault: 'MM-913' },
];

// ── Helpers (compartidos con plegado / tracción) ──────────────────────────────

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

// ── Construcción dinámica de la tabla de resultados ───────────────────────────

// Devuelve el XML de la celda "Muestra N° / OT N°" según info de merge.
//   info = null                 → no se emite la celda (la tabla no tiene columna)
//   info = { text }             → celda normal
//   info = { text, vMergeStart } → primera celda de un grupo (con texto)
//   info = { vMergeContinue }    → celda "continuación" (sin texto, mergeada)
function celdaMuestraNB(info) {
  if (!info) return '';
  let vMergeXml = '';
  if (info.vMergeStart) vMergeXml = '<w:vMerge w:val="restart"/>';
  else if (info.vMergeContinue) vMergeXml = '<w:vMerge/>';
  const texto = info.vMergeContinue ? '' : escapeXml(info.text || '');
  return (
    '<w:tc>' +
      '<w:tcPr>' +
        '<w:tcW w:w="0" w:type="auto"/>' +
        vMergeXml +
        '<w:vAlign w:val="center"/>' +
      '</w:tcPr>' +
      '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="276" w:lineRule="auto" w:after="0"/></w:pPr>' +
      '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>' +
      `<w:t xml:space="preserve">${texto}</w:t></w:r></w:p>` +
    '</w:tc>'
  );
}

// Devuelve el XML de una fila de tabla. Si `muestraInfo` está definido, la fila
// arranca con una tercera celda "Muestra N°/OT N°" (con soporte de vMerge para
// agrupar filas consecutivas con el mismo valor).
function filaTablaNB(probeta, resultadoTexto, muestraInfo) {
  return (
    '<w:tr>' +
      '<w:trPr><w:jc w:val="center"/></w:trPr>' +
      celdaMuestraNB(muestraInfo) +
      '<w:tc>' +
        '<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>' +
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="276" w:lineRule="auto" w:after="0"/></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>' +
        `<w:t xml:space="preserve">${escapeXml(probeta)}</w:t></w:r></w:p>` +
      '</w:tc>' +
      '<w:tc>' +
        '<w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>' +
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="276" w:lineRule="auto" w:after="0"/></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>' +
        `<w:t xml:space="preserve">${escapeXml(resultadoTexto)}</w:t></w:r></w:p>` +
      '</w:tc>' +
    '</w:tr>'
  );
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Reemplaza la <w:tbl> existente en el XML por una construida con todas las probetas.
function construirYReemplazarTabla(xml, probetas) {
  // Si alguna probeta trae `muestra` no vacío, agregamos la columna
  // "Muestra N° / OT N°" antes de "Probeta". Filas consecutivas con el mismo
  // valor de muestra se fusionan por w:vMerge (mismo agrupamiento que en el
  // form). Sin ninguna muestra cargada, la tabla mantiene solo 2 columnas.
  const hayMuestra = probetas.some(p => String((p && p.muestra) || '').trim() !== '');
  const muestraInfos = new Array(probetas.length).fill(null);
  if (hayMuestra) {
    let i = 0;
    while (i < probetas.length) {
      const val = String((probetas[i] && probetas[i].muestra) || '').trim();
      let j = i + 1;
      if (val) while (j < probetas.length && String((probetas[j] && probetas[j].muestra) || '').trim() === val) j++;
      const size = j - i;
      if (val && size > 1) {
        muestraInfos[i] = { text: val, vMergeStart: true };
        for (let k = 1; k < size; k++) muestraInfos[i + k] = { vMergeContinue: true };
      } else {
        muestraInfos[i] = { text: val };
      }
      i = j;
    }
  }

  // Para cada probeta, calcular el texto de resultado:
  //   - 'No presenta indicaciones relevantes' / 'Sin indicaciones' → el mismo texto
  //   - 'Presenta escoria' + detalle → 'Presenta escoria'  (las dimensiones van como obs aparte)
  //   - 'otro' → usar el detalle como texto del resultado
  const filas = probetas.map((p, idx) => {
    let texto;
    if (p.tipo_resultado === 'otro') {
      texto = (p.detalle || '').trim() || 'Sin indicaciones';
    } else {
      texto = p.tipo_resultado || 'No presenta indicaciones relevantes';
    }
    return filaTablaNB(p.id, texto, muestraInfos[idx]);
  }).join('');

  // Columnas del grid: si hay muestra, se agrega una columna angosta al principio.
  const gridCols = hayMuestra
    ? '<w:gridCol w:w="1800"/><w:gridCol w:w="2200"/><w:gridCol w:w="6500"/>'
    : '<w:gridCol w:w="2200"/><w:gridCol w:w="6500"/>';
  const headerMuestra = hayMuestra
    ? '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr>' +
      '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="276" w:lineRule="auto" w:after="0"/></w:pPr>' +
      '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">Muestra N° / OT N°</w:t></w:r></w:p></w:tc>'
    : '';

  // Tabla de resultados con AUTOAJUSTE al contenido (w:tblLayout autofit +
  // anchos de columna en auto). Word 2016+ colapsa columnas al ancho del texto.
  const tablaNueva =
    '<w:tbl>' +
      '<w:tblPr>' +
        '<w:tblStyle w:val="Tablaconcuadrcula"/>' +
        '<w:tblW w:w="0" w:type="auto"/>' +
        '<w:jc w:val="center"/>' +
        '<w:tblLayout w:type="autofit"/>' +
        '<w:tblBorders>' +
          '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
          '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
          '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
          '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
          '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
          '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '</w:tblBorders>' +
        '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
      '</w:tblPr>' +
      '<w:tblGrid>' + gridCols + '</w:tblGrid>' +
      '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>' +
        headerMuestra +
        '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr>' +
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="276" w:lineRule="auto" w:after="0"/></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="22"/></w:rPr><w:t>Probeta</w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:tcPr>' +
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:line="276" w:lineRule="auto" w:after="0"/></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:sz w:val="22"/></w:rPr><w:t>Resultado</w:t></w:r></w:p></w:tc>' +
      '</w:tr>' +
      filas +
    '</w:tbl>';

  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, tablaNueva);
}

// ── Generador principal ───────────────────────────────────────────────────────

function generarNickBreakDesdeTemplate(ot, datos, fotosCaratula) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  // Filtro multi-OT: cuando word-generator emite un docx por cada OT del
  // registro, `datos._filtro_ot` indica qué OT toca ahora — solo se dejan las
  // probetas con nro_ot_override igual (o vacío, si es la OT del ensayo).
  if (datos._filtro_ot != null) {
    const otFiltro = String(datos._filtro_ot);
    const esOtDelEnsayo = otFiltro === String(ot.nro_ot || '');
    const filtrarArr = (arr) => (Array.isArray(arr) ? arr : []).filter(p => {
      const ov = String((p && p.nro_ot_override) || '').trim();
      const perteneceA = ov || String(ot.nro_ot || '');
      return perteneceA === otFiltro || (esOtDelEnsayo && !ov);
    });
    datos = Object.assign({}, datos);
    if (Array.isArray(datos.probetas))   datos.probetas   = filtrarArr(datos.probetas);
    if (Array.isArray(datos.resultados)) datos.resultados = filtrarArr(datos.resultados);
  }

  const equipo   = datos.equipamiento || {};
  // Normalizar p.tipo_resultado: legado "Sin indicaciones" -> "No presenta indicaciones relevantes"
  // (el form ya no lo ofrece, pero puede venir del agente-mapeo)
  const probetas = (datos.probetas || []).map(p => {
    const t = p.tipo_resultado;
    return (t === 'Sin indicaciones')
      ? { ...p, tipo_resultado: 'No presenta indicaciones relevantes' }
      : p;
  });

  // ── Condiciones de ensayo ─────────────────────────────────────────────────
  const metodologia = datos.metodologia || 'ITM N°079';

  // Códigos de referencia (uno por línea, igual que plegado)
  const codigos = [];
  if (datos.cod_api1104) codigos.push('Código de referencia: API 1104 Ed.22-2021 (E1-2023)');
  if (datos.cod_asme)    codigos.push(`Código de referencia: ASME BPVC Sección IX Ed.${datos.ed_asme || '2025'}`);
  if (datos.cod_api5l)   codigos.push('Código de referencia: API 5L');
  if (datos.cod_aws_d11) codigos.push('Código de referencia: AWS D1.1');

  // Orden CONDICIONES: Código de referencia → Método (Norma) de ensayo → Metodología.
  // El template traía los placeholders en otro orden, así que concentramos las
  // tres líneas ordenadas en el primer placeholder y ocultamos los otros dos.
  const _condLineas = [];
  codigos.forEach(c => _condLineas.push(c));
  if (datos.metodo_ensayo) _condLineas.push(`Código de referencia: ${datos.metodo_ensayo}`);
  _condLineas.push(`Metodología de ensayo: ${metodologia}`);
  const metodo_ensayo_linea = _condLineas.join('\n');
  const codigo_referencia_linea = '__SECTION_HIDE__';
  const metodologia_ensayo_linea = '__SECTION_HIDE__';

  const mecanizado_segun_linea = datos.mecanizado_segun
    ? `Mecanizado según ${datos.mecanizado_segun}`
    : '__SECTION_HIDE__';

  let temperatura_ensayo_linea = '__SECTION_HIDE__';
  if (datos.temperatura) {
    const t = String(datos.temperatura).trim();
    // En los informes reales no hay espacio antes del símbolo °C (ej "22.3°C", "18.4°C")
    temperatura_ensayo_linea = `Temperatura de ensayo: ${t.includes('°') ? t : t + '°C'}`;
  }

  // ── Equipamiento ──────────────────────────────────────────────────────────
  const varianteEquipo = datos.variante_equipo || 'emic';
  const EQUIPO = varianteEquipo === 'torne' ? EQUIPO_TORNE : EQUIPO_EMIC;
  // El TAG efectivo: si el técnico editó `equipamiento_tags[key]` en el form,
  // se usa ese; sino el `tagDefault` del catálogo.
  const equipTags = datos.equipamiento_tags || {};
  const listaEquipos = EQUIPO.filter(e => equipo[e.key]).map(e => {
    const custom = equipTags[e.key];
    const tag = (custom != null && String(custom).trim() !== '')
      ? String(custom).trim() : (e.tagDefault || '');
    return tag ? `${e.nombre} TAG N°${tag}` : e.nombre;
  });

  // Equipos extra del catálogo (DB, agregados desde el form via equipamiento_extra)
  if (Array.isArray(datos.equipamiento_extra)) {
    datos.equipamiento_extra.forEach(function (e) {
      if (e && (e.nombre || e.label)) listaEquipos.push(e.nombre || e.label);
    });
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => listaEquipos.push(l));
  const equipSlots = {};
  for (let i = 1; i <= 4; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquipos[i - 1] || '__SECTION_HIDE__';
  }

  // ── Tabla de resultados (se inyecta como tabla cruda, no via placeholders) ──
  // Vaciamos los placeholders {{probeta_1}}, {{resultado_1}}, etc. ya que la tabla
  // se reemplaza completa en post-proceso. Ponemos cadena vacía para evitar que
  // queden los "{{probeta_X}}" en el documento.
  const tablaPlaceholders = {
    probeta_1:    '', resultado_1: '',
    probeta_2:    '', resultado_2: '',
  };

  // ── Caption tabla ─────────────────────────────────────────────────────────
  const tabla_caption = `Tabla N°1 - Resultados ensayo de nick break`;

  // ── Observaciones (3 placeholders separados: indicaciones, OAA, extra) ────
  // En los informes reales:
  //   - Indicaciones por probeta (NB N – Se observa una escoria...) van en sus
  //     propios párrafos justo debajo de la tabla.
  //   - La nota OAA va al final del documento, en su propio párrafo.
  //   - Las observaciones libres van entre ambos.
  // Por eso los separamos en 3 placeholders, cada uno en su propio párrafo de
  // la plantilla — así se ocultan independientemente si están vacíos.

  // 1) Indicaciones por probeta. Soporta 3 tipos con su formato natural:
  //    - Escoria:    "NB X – Se observa una escoria (L x A): X.X x X.X mm."
  //    - Poro:       "NB X – Se observa un poro de X.X mm de diámetro."
  //    - Indicación: "NB X – Se observa una indicación de X.X mm de longitud."
  //                  (o "de X.X mm de longitud x X.X mm de ancho" si trae L x A)
  // Etiqueta "NB" sin número SOLO si hay 1 sola probeta total.
  const contarNB = probetas.length;
  const lineasInd = [];
  probetas.forEach(p => {
    const tipo    = p.tipo_resultado || '';
    const detalle = (p.detalle || '').trim();
    const label   = contarNB === 1 ? 'NB' : p.id;
    if (tipo === 'Presenta escoria' && detalle) {
      lineasInd.push(`${label} – Se observa una escoria (L x A): ${detalle} mm.`);
    } else if (tipo === 'Presenta poro' && detalle) {
      lineasInd.push(`${label} – Se observa un poro de ${detalle} mm de diámetro.`);
    } else if (tipo === 'Presenta indicación' && detalle) {
      // Si el detalle tiene "x" (ej "3 x 0.7"), interpretarlo como L x A; sino solo longitud
      if (/x/i.test(detalle)) {
        const partes = detalle.split(/\s*x\s*/i).map(s => s.trim()).filter(Boolean);
        if (partes.length >= 2) {
          lineasInd.push(`${label} – Se observa una indicación de ${partes[0]} mm de longitud x ${partes[1]} mm de ancho.`);
        } else {
          lineasInd.push(`${label} – Se observa una indicación de ${detalle} mm de longitud.`);
        }
      } else {
        lineasInd.push(`${label} – Se observa una indicación de ${detalle} mm de longitud.`);
      }
    }
  });
  const indicaciones_linea = lineasInd.length ? lineasInd.join('\n') : '__SECTION_HIDE__';

  // 2) "Muestra fuera del alcance" (NO es OAA propiamente; queda en su placeholder)
  const lineasOaa = [];
  if (datos.muestra_fuera_alcance) lineasOaa.push('"Muestra fuera del alcance de acreditación"');
  const notas_oaa_linea = lineasOaa.length ? lineasOaa.join('\n') : '__SECTION_HIDE__';

  // W5: texto OAA propiamente dicho, insertado antes de FIN DE INFORME
  const textosOAA = [];
  if (datos.nota_oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA"');

  // 3) Observaciones libres
  const observaciones_extra_linea = (datos.observaciones_extra || '').trim() || '__SECTION_HIDE__';

  // ── Imagen de recepción ───────────────────────────────────────────────────
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const imagen_recepcion = fotos.length > 0 ? '__IMAGE_HERE__' : '__IMAGE_NONE__';

  // ── Datos del template ────────────────────────────────────────────────────
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');
  const templateData = {
    numero_ot:                       nroOtBase,
    razon_social:                    ot.razon_social        || '',
    fecha_generacion:                ot.fecha_finalizacion  || '',

    identificacion_muestra:          ot.id_muestra          || '',
    fecha_recepcion_muestra:         ot.fecha_recepcion     || '',
    fecha_aprobacion_inicio_trabajo: ot.fecha_aprobacion    || '',
    fecha_finalizacion_certificado:  ot.fecha_finalizacion  || '',
    imagen_recepcion,

    metodologia_ensayo_linea,
    metodo_ensayo_linea,
    codigo_referencia_linea,
    mecanizado_segun_linea,
    temperatura_ensayo_linea,

    ...equipSlots,
    ...tablaPlaceholders,
    tabla_caption,
    indicaciones_linea,
    notas_oaa_linea,
    observaciones_extra_linea,
  };

  // ── Docxtemplater ─────────────────────────────────────────────────────────
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
    delimiters:    { start: '{{', end: '}}' },
    nullGetter:    () => '',
  });
  doc.render(templateData);

  // ── Post-proceso ──────────────────────────────────────────────────────────
  const processedZip = doc.getZip();
  let outXml = processedZip.files['word/document.xml'].asText();

  outXml = eliminarSeccionesOcultas(outXml);

  // Reemplazar la tabla del template por una construida con todas las probetas
  outXml = construirYReemplazarTabla(outXml, probetas);

  // Si el ensayo lleva la nota OAA, agregar asterisco al título "ENSAYO DE NICK BREAK"
  // (los informes reales lo muestran como "ENSAYO DE NICK BREAK*" cuando lo lleva).
  if (datos.nota_oaa) {
    outXml = outXml.replace(
      /(<w:t[^>]*>)ENSAYO DE NICK BREAK(<\/w:t>)/,
      '$1ENSAYO DE NICK BREAK*$2'
    );
  }

  // Manejo de imagen — multi-imagen vía helper compartido
  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'nick_break');

  // Header: limpieza y fallback de fecha_generacion
  {
    let hdrXml = processedZip.files['word/header1.xml'].asText();
    if (hdrXml.includes('{{fecha_generacion}}')) {
      hdrXml = hdrXml.replace('{{fecha_generacion}}', templateData.fecha_generacion || '');
    }
    if (ot.es_preinforme) {
      hdrXml = hdrXml.replace('CERTIFICADO DE ANALISIS', 'CERTIFICADO DE ANALISIS PRELIMINAR');
    }
    processedZip.file('word/header1.xml', hdrXml);
  }

  // Aplica los mismos fixes que plegado: convertir numbering automático a texto manual
  // ("1.", "1.1.", "1.2.", "1.3.") con tabs e indent consistentes. Esto evita que el
  // numbering.xml del template descontrole los márgenes.
  outXml = convertirNumberingATexto(outXml);
  outXml = fusionarPBConTitulo(outXml);   // PB separado → dentro del título

  outXml = limpiarAntesDeFinInforme(outXml);
  outXml = eliminarParrafosVacios(outXml);
  outXml = ajustarEspaciadoNickBreak(outXml);   // después de eliminarParrafosVacios
  outXml = forzarCalibri(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  outXml = minimizarUltimoParagrafo(outXml);

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones (reutilizadas de plegado/tracción) ────────────────

// Si hay un párrafo PB puro seguido del título del ensayo, mueve el PB
// como primer run dentro del título para evitar línea vacía arriba.
function fusionarPBConTitulo(xml) {
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const parts = [];
  let m;
  while ((m = re.exec(xml)) !== null) parts.push({ start: m.index, end: re.lastIndex, text: m[0] });

  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i].text;
    if (!p.includes('w:type="page"')) continue;
    const txts = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'').trim());
    if (txts.some(t => t.length > 0)) continue; // tiene texto, no es PB puro

    const next = parts[i+1].text;
    const pbRun = '<w:r><w:br w:type="page"/></w:r>';
    let newNext;
    if (next.includes('</w:pPr>')) {
      newNext = next.replace('</w:pPr>', '</w:pPr>' + pbRun);
    } else {
      newNext = next.replace(/^(<w:p\b[^>]*>)/, '$1' + pbRun);
    }
    // Reconstruir: eliminar párrafo PB, reemplazar siguiente
    xml = xml.slice(0, parts[i].start) + newNext + xml.slice(parts[i+1].end);
    break; // solo el primero
  }
  return xml;
}

// Ajusta espaciado entre secciones del nick-break:
// - 1 blank entre N.1/N.2/N.3
// - 1 blank antes del texto de indicaciones (NB X –)
// - 1 blank antes de FIN DE INFORME
function ajustarEspaciadoNickBreak(xml) {
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';

  // 1. Blank antes de N.2 y N.3 (subtítulos nivel 1 con left=426, excepto el primero)
  xml = (() => {
    const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    const parts = [];
    let m;
    while ((m = re.exec(xml)) !== null) parts.push({ start: m.index, end: re.lastIndex, text: m[0] });

    const isSubtitulo = p => {
      if (!p.includes('w:left="426"')) return false;
      const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'').trim());
      return wts.some(t => /^\d+\.\d+\.$/.test(t));
    };
    const isTitulo0 = p => {
      const wts = (p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'').trim());
      return wts.some(t => /^\d+\.$/.test(t));
    };
    const isBlank = p => {
      if (p.includes('w:type="page"')) return false;
      const txts = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,''));
      return !txts.length || txts.every(t => t.trim() === '');
    };

    const toInsert = [];
    let lastWasTitulo = false;
    for (let i = 0; i < parts.length; i++) {
      if (isTitulo0(parts[i].text)) { lastWasTitulo = true; continue; }
      if (isSubtitulo(parts[i].text)) {
        if (!lastWasTitulo) {
          // Eliminar blancos existentes antes e insertar exactamente 1
          let j = i - 1;
          while (j >= 0 && isBlank(parts[j].text)) j--;
          toInsert.push({ insertBefore: i, deleteFrom: j + 1, deleteTo: i });
        }
        lastWasTitulo = false;
      } else {
        lastWasTitulo = false;
      }
    }

    let result = xml;
    for (let k = toInsert.length - 1; k >= 0; k--) {
      const { insertBefore, deleteFrom, deleteTo } = toInsert[k];
      const delStart = parts[deleteFrom]?.start ?? parts[insertBefore].start;
      const delEnd   = parts[deleteTo].start;
      result = result.slice(0, delStart) + BLANK + result.slice(delEnd);
    }
    return result;
  })();

  // 2. Ajustes alrededor de la tabla de resultados y las indicaciones
  xml = (() => {
    const re2 = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    const parts2 = [];
    let m2;
    while ((m2 = re2.exec(xml)) !== null) parts2.push({ start: m2.index, end: re2.lastIndex, text: m2[0] });

    const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';
    const isBlank2 = p => {
      if (p.includes('w:type="page"')) return false;
      const txts = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,''));
      return !txts.length || txts.every(t => t.trim() === '');
    };
    const getText = p => p.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();

    const toInsert = new Set();   // índices donde insertar blank ANTES
    const toDelete = new Set();   // índices de blancos a eliminar

    let inTable = false;
    let captionIdx = -1;  // índice del caption "Tabla N°X..."

    for (let i = 0; i < parts2.length; i++) {
      const p = parts2[i].text;
      const txt = getText(p);

      if (p.includes('<w:tbl'))  inTable = true;
      if (p.includes('</w:tbl>')) { inTable = false; continue; }
      if (inTable) continue;

      // Caption de tabla (justo después de </w:tbl>)
      if (/^Tabla\s+N[°˚]/i.test(txt)) {
        captionIdx = i;
        continue;
      }

      // Blank después del caption → antes de la primera línea NB
      if (captionIdx >= 0 && /^NB\s+\d/.test(txt)) {
        // Si ya hay un blank antes, no agregar otro
        if (!isBlank2(parts2[i-1]?.text || '')) {
          toInsert.add(i);
        }
        captionIdx = -1;
        continue;
      }

      // Eliminar blancos dobles consecutivos (dejar máximo 1 seguido)
      if (/^\d+\.\d+\./.test(txt)) {
        let j = i - 1, blancoCount = 0;
        while (j >= 0 && isBlank2(parts2[j].text)) { blancoCount++; j--; }
        // Si hay más de 1 blank antes, marcar los extras para eliminar (dejar solo el más cercano)
        if (blancoCount > 1) {
          for (let k = j + 1; k < j + blancoCount; k++) toDelete.add(k);
        }
      }
    }

    if (!toInsert.size && !toDelete.size) return xml;

    let result = xml;
    // Procesar de atrás para adelante
    const allIndices = [...new Set([...toInsert, ...toDelete])].sort((a,b) => b - a);
    for (const idx of allIndices) {
      if (toDelete.has(idx)) {
        result = result.slice(0, parts2[idx].start) + result.slice(parts2[idx].end);
      } else if (toInsert.has(idx)) {
        result = result.slice(0, parts2[idx].start) + BLANK + result.slice(parts2[idx].start);
      }
    }
    return result;
  })();

  return xml;
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

function reemplazarImagen(xml, rId, name, cx, cy) {
  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="100" name="${name}"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr>` +
    `<pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>` +
    `</pic:nvPicPr><pic:blipFill>` +
    `<a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill><pic:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr></pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing>`;

  const markerPos = xml.indexOf('__IMAGE_HERE__');
  if (markerPos < 0) return xml;
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const pOpen = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;

  return (
    xml.slice(0, pOpen) +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr><w:r>${drawing}</w:r></w:p>` +
    xml.slice(pClose + '</w:p>'.length)
  );
}

function eliminarImagenVacia(xml) {
  const markerPos = xml.indexOf('__IMAGE_NONE__');
  if (markerPos < 0) return xml;
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const imgParaEnd = pClose + '</w:p>'.length;
  const pOpen = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;

  let captionEnd = imgParaEnd;
  let searchPos = imgParaEnd;
  while (searchPos < xml.length) {
    const nextP = xml.indexOf('<w:p', searchPos);
    if (nextP < 0) break;
    const c = xml[nextP + 4];
    if (c === '>' || c === ' ' || c === '\r' || c === '\n') {
      const nextClose = xml.indexOf('</w:p>', nextP);
      if (nextClose >= 0) captionEnd = nextClose + '</w:p>'.length;
      break;
    }
    searchPos = nextP + 4;
  }

  return xml.slice(0, pOpen) + xml.slice(captionEnd);
}

function limpiarAntesDeFinInforme(xml) {
  const finIdx = xml.indexOf('FIN DE');
  if (finIdx < 0) return xml;
  const pFin = scanBackForTag(xml, '<w:p', finIdx);
  if (pFin < 0) return xml;

  const blancos = [];
  let cursor = pFin;
  while (true) {
    const prevClose = xml.lastIndexOf('</w:p>', cursor - 1);
    if (prevClose < 0) break;
    const prevOpen = scanBackForTag(xml, '<w:p', prevClose);
    if (prevOpen < 0) break;
    const para = xml.slice(prevOpen, prevClose + '</w:p>'.length);
    if (!esParrafoBlanco(para)) break;
    blancos.push({ start: prevOpen, end: prevClose + '</w:p>'.length });
    cursor = prevOpen;
  }
  if (blancos.length <= 1) return xml;
  return xml.slice(0, blancos[blancos.length - 1].start) + xml.slice(blancos[1].end);
}

function eliminarParrafosVacios(xml) {
  // Posición del page break — blanks de carátula (antes del PB, sin left=851) se preservan
  const pbPos = xml.indexOf('w:type="page"');

  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (par, offset, str) => {
    if (par.includes('w:type="page"')) return par;  // preservar page breaks siempre
    if (par.includes('<w:drawing>'))   return par;  // preservar imágenes (no tienen <w:t>)
    const tTexts = [...par.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const hasTags = tTexts.length > 0 || /<w:t[^>]*\/>/.test(par) || par.includes('<w:drawing>');
    if (!hasTags || tTexts.every(t => t.trim() === '')) {
      // Preservar blanks de carátula (antes del PB), excepto artefactos left=851
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


// Convierte la numeración automática (<w:numPr>) en numeración TEXTO ("1.", "1.1.", etc.).
// Misma lógica que en plegado: garantiza tabs e indents consistentes.
//   - Nivel 0 ("1. ENSAYO DE NICK BREAK")  → indent=0,   tab al pos 426
//   - Nivel 1 ("1.1. CONDICIONES...")      → indent=426, tab al pos 851
function convertirNumberingATexto(xml) {
  let counterL1 = 0;
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, p => {
    const ilvlMatch = p.match(/<w:ilvl w:val="(\d+)"\/>/);
    if (!ilvlMatch) return p;
    const ilvl = parseInt(ilvlMatch[1], 10);

    let numStr, leftIndent, tabPos;
    if (ilvl === 0) { numStr = '1.';  leftIndent = 0;   tabPos = 426; }
    else if (ilvl === 1) { counterL1++; numStr = `1.${counterL1}.`; leftIndent = 426; tabPos = 851; }
    else return p;

    let out = p.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '');
    out = out.replace(/<w:ind\b[^/]*\/>/g, '');
    out = out.replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, '');

    const tabsAndInd = `<w:tabs><w:tab w:val="left" w:pos="${tabPos}"/></w:tabs><w:ind w:left="${leftIndent}"/>`;
    if (out.includes('</w:pStyle>')) {
      out = out.replace('</w:pStyle>', `</w:pStyle>${tabsAndInd}`);
    } else {
      out = out.replace('</w:pPr>', `${tabsAndInd}</w:pPr>`);
    }

    const tIdx = out.search(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:t\b/);
    if (tIdx < 0) return p;
    const runEnd = out.indexOf('</w:r>', tIdx);
    const runBlock = out.slice(tIdx, runEnd);
    const rPrMatch = runBlock.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    let rPr = rPrMatch ? rPrMatch[0] : '<w:rPr></w:rPr>';
    if (!/<w:b\s*\/>/.test(rPr)) rPr = rPr.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>');
    const insertion = `<w:r>${rPr}<w:t xml:space="preserve">${numStr}</w:t></w:r><w:r>${rPr}<w:tab/></w:r>`;
    out = out.slice(0, tIdx) + insertion + out.slice(tIdx);

    // Si es nivel 0 y hay un page break en el párrafo, moverlo como primer run
    if (ilvl === 0) {
      const brRunRe = /<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:br w:type="page"\/><\/w:r>/;
      const brM = out.match(brRunRe);
      if (brM) {
        out = out.replace(brRunRe, '');
        out = out.replace(/(<\/w:pPr>)/, '$1<w:r><w:br w:type="page"/></w:r>');
      }
    }
    return out;
  });
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

module.exports = { generarNickBreakDesdeTemplate };
