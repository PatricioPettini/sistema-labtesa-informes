'use strict';
// Generador para los 8 ensayos metalográficos del modelo F2.
// Cada subtipo tiene su propio template físico en server/templates/<subtipo>.docx
// con el formato visual EXACTO del modelo F2 (chasis Labtesa + bloque del modelo).
//
// Subtipos soportados:
//   microestructura, tamano-grano, inclusiones, estructura-grafito,
//   espesor-capa, decarburacion, defectos-superficiales, porosidad

const PizZip       = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs   = require('fs');
const path = require('path');
const { manejarImagenesCaratula, insertarImagenEnsayo, insertarImagenesEnsayo }  = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

// Marker del caption por subtipo + posición de inserción.
// Las imágenes de los ensayos metalográficos se insertan AL FINAL del ensayo:
// antes de la línea OAA si existe, o antes de "FIN DE INFORME" si no.
// El helper prueba cada marker del array hasta encontrar match.
const MARKER_FIN_ENSAYO = ['Los ensayos marcados con', 'FIN DE INFORME'];

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// Path al template físico por subtipo
const TEMPLATE_PATHS = {
  'microestructura':        path.join(TEMPLATES_DIR, 'microestructura.docx'),
  'tamano-grano':           path.join(TEMPLATES_DIR, 'tamano-grano.docx'),
  'inclusiones':            path.join(TEMPLATES_DIR, 'inclusiones.docx'),
  'estructura-grafito':     path.join(TEMPLATES_DIR, 'estructura-grafito.docx'),
  'espesor-capa':           path.join(TEMPLATES_DIR, 'espesor-capa.docx'),
  'decarburacion':          path.join(TEMPLATES_DIR, 'decarburacion.docx'),
  'defectos-superficiales': path.join(TEMPLATES_DIR, 'defectos-superficiales.docx'),
  'porosidad':              path.join(TEMPLATES_DIR, 'porosidad.docx'),
};

// Defaults visuales por subtipo: si el usuario no carga un dato variable, el
// template mantiene el "placeholder visual" del modelo F2 (** ó ***)
const DEFAULT_VISUAL = '**';
const DEFAULT_AUMENTO = '***';
const DEFAULT_NUM = '*';

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
function val(v, def) {
  if (v == null) return def;
  const s = String(v).trim();
  return s === '' ? def : s;
}
// El placeholder {{temperatura}} reemplaza solo "**", no "˚C" (que viene aparte
// en algunos templates por fragmentación de runs).
function temp(v) {
  if (v == null || String(v).trim() === '') return '**';
  return String(v).trim();
}

// Helpers para placeholders de LÍNEA ENTERA: devuelven la línea completa o
// __SECTION_HIDE__ para que eliminarSeccionesOcultas borre el párrafo.
function lineaOrHide(prefix, valor) {
  const s = (valor == null) ? '' : String(valor).trim();
  return s === '' ? '__SECTION_HIDE__' : `${prefix}${s}`;
}
function lineaTexto(valor) {
  // valor ya es la línea completa (sin prefijo). Si está vacío, oculta.
  const s = (valor == null) ? '' : String(valor).trim();
  return s === '' ? '__SECTION_HIDE__' : s;
}

// Catálogo de equipamiento típico para metalográficos (key → label)
const EQUIPOS_METALOGRAFIA = {
  microscopio_378: 'Microscopio Leica DM 750 TAG N˚MM-378',
  termohigro_700:  'Termohigrómetro TAG N˚MM-700',
  estereoscopio:   'Estereoscopio Leica EZ4 TAG N˚MM-379',
};

// Construye la línea de un equipo del catálogo a partir del checkbox del form,
// o __SECTION_HIDE__ si está desmarcado.
function equipoLinea(equipo, key) {
  if (equipo[key] === false) return '__SECTION_HIDE__';
  if (equipo[key] === true)  return EQUIPOS_METALOGRAFIA[key] || '__SECTION_HIDE__';
  // Si no se especifica, default true para los que están en el modelo F2
  return EQUIPOS_METALOGRAFIA[key] || '__SECTION_HIDE__';
}

// Línea de aumento: "Aumento utilizado: 100 X" si hay valor, o hide
function aumentoLinea(aumento) {
  const s = (aumento == null) ? '' : String(aumento).trim();
  return s === '' ? '__SECTION_HIDE__' : `Aumento utilizado: ${s} X`;
}

// ── Mapeo de datos por subtipo ───────────────────────────────────────────────
function mapearDatos(subtipo, datos, ot) {
  const fotos = Array.isArray(datos.__fotos) ? datos.__fotos.filter(Boolean) : [];
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  // Comunes a todos: carátula
  const base = {
    numero_ot:          nroOtBase,
    razon_social:       ot.razon_social       || '',
    fecha_generacion:   ot.fecha_finalizacion || '',
    id_muestra:         ot.id_muestra         || '',
    fecha_recepcion:    ot.fecha_recepcion    || '',
    fecha_aprobacion:   ot.fecha_aprobacion   || '',
    fecha_finalizacion: ot.fecha_finalizacion || '',
    imagen_placeholder: fotos.length > 0 ? '__IMAGE_CARATULA__' : '__IMAGE_NONE__',

    // OAA: si datos.oaa, asterisco y línea OAA aparecen; si no, vacíos
    asterisco_oaa: datos.oaa ? '*' : '',
    oaa_linea: datos.oaa
      ? '"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."'
      : '',
  };

  // Helpers para placeholders de línea entera comunes a varios subtipos
  const equipo = datos.equipamiento || {};
  const zonaPrefijo = (datos.zona_examinada || '').includes('–') ||
                      (datos.zona_examinada || '').includes('-')
    ? 'Zonas examinadas: ' : 'Zona examinada: ';

  // Específicos por subtipo
  switch (subtipo) {
    case 'microestructura':
      return Object.assign(base, {
        norma_1_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_1),
        norma_2_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_2),
        metodologia_linea:       lineaOrHide('Metodología de ensayo: ', datos.metodologia),
        ataque_1_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_1),
        ataque_2_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_2),
        ataque_3_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_3),
        zona_linea:              lineaOrHide(zonaPrefijo,              datos.zona_examinada),
        muestra_ensayada_linea:  lineaOrHide('Muestra ensayada: ',    datos.muestra_ensayada),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        aumento_linea:           aumentoLinea(datos.aumento),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
        // Texto del resultado: si el usuario cargó texto libre lo usa, si no
        // mantiene el del modelo F2 (con placeholder *******).
        resultado_linea:         val(datos.resultado_texto,
          'La muestra analizada posee una microestructura compuesta por ' +
          val(datos.resultado_descripcion, '*******') + ' . (Ver imagen N°' +
          val(datos.num_imagen, '2') + ')'),
        num_imagen:              val(datos.num_imagen, '2'),
      });
    case 'tamano-grano':
      return Object.assign(base, {
        norma_1_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_1),
        norma_2_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_2),
        metodologia_linea:       lineaOrHide('Metodología de ensayo: ', datos.metodologia),
        ataque_1_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_1),
        ataque_2_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_2),
        ataque_3_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_3),
        zona_linea:              lineaOrHide(zonaPrefijo,              datos.zona_examinada),
        muestra_ensayada_linea:  lineaOrHide('Muestra ensayada: ',    datos.muestra_ensayada),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        aumento_linea:           aumentoLinea(datos.aumento),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
        resultado_linea:         val(datos.resultado_texto,
          'La muestra examinada presenta un tamaño de grano N°' +
          val(datos.tamano_grano_numero, 'XXX') + '. (Ver imagen N°' +
          val(datos.num_imagen, '3') + ')'),
        num_imagen:              val(datos.num_imagen, '3'),
      });
    case 'inclusiones':
      return Object.assign(base, {
        norma_1_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_1),
        norma_2_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_2),
        metodologia_linea:       lineaOrHide('Metodología de ensayo: ', datos.metodologia),
        zona_linea:              lineaOrHide('Zona de ensayo: ',       datos.zona_examinada),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        aumento_linea:           aumentoLinea(datos.aumento),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
      });
    case 'estructura-grafito':
      return Object.assign(base, {
        norma_1_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_1),
        norma_2_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_2),
        metodologia_linea:       lineaOrHide('Metodología de ensayo: ', datos.metodologia),
        zona_linea:              lineaOrHide(zonaPrefijo,              datos.zona_examinada),
        muestra_ensayada_linea:  lineaOrHide('Muestra ensayada: ',    datos.muestra_ensayada),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        aumento_linea:           aumentoLinea(datos.aumento),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
        resultado_1_linea:       val(datos.resultado_texto_1,
          'La muestra ensayada presenta una microestructura compuesta por grafito ' +
          val(datos.grafito_tipo, '****') + ' .'),
        resultado_2_linea:       val(datos.resultado_texto_2,
          'La muestra ensayada posee un tipo de grafito N°' + val(datos.grafito_numero, '*') +
          ' clase ' + val(datos.grafito_clase, '*') + ', con una nodularidad del ' +
          val(datos.nodularidad, '**') + '% y un contenido de nódulos de ' +
          val(datos.nodulos, '**') + ' partículas/mm2. (Ver imagen N°' +
          val(datos.num_imagen, '3') + ')'),
        num_imagen:              val(datos.num_imagen, '3'),
      });
    case 'espesor-capa':
      return Object.assign(base, {
        metodologia_linea:       lineaTexto(datos.metodologia) === '__SECTION_HIDE__'
          ? 'Metodología de ensayo según procedimiento interno' : lineaTexto(datos.metodologia),
        ataque_1_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_1),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        aumento_linea:           aumentoLinea(datos.aumento),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
        resultado_linea:         val(datos.resultado_texto,
          'La muestra analizada presenta un espesor de capa de ' +
          val(datos.espesor, '******') + ' .'),
      });
    case 'decarburacion':
      return Object.assign(base, {
        norma_1_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_1),
        norma_2_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_2),
        metodologia_linea:       lineaOrHide('Metodología de ensayo: ', datos.metodologia),
        ataque_1_linea:          lineaOrHide('Ataque utilizado: ',    datos.ataque_1),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        aumento_linea:           aumentoLinea(datos.aumento),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
        resultado_linea:         val(datos.resultado_texto,
          'La muestra examinada ' + val(datos.decarburacion_estado, '**') +
          ' presenta decarburación superficial.'),
      });
    case 'defectos-superficiales':
      return Object.assign(base, {
        metodologia_linea:       lineaTexto(datos.metodologia) === '__SECTION_HIDE__'
          ? 'Metodología de ensayo según procedimiento interno' : lineaTexto(datos.metodologia),
        zona_linea:              lineaOrHide('Zona examinada: ',       datos.zona_examinada),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        aumento_linea:           aumentoLinea(datos.aumento),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
        resultado_linea:         val(datos.resultado_texto,
          'Luego del análisis la muestra presenta fisuras superficiales hasta una profundidad de ' +
          val(datos.profundidad_defecto, 'XXX') + '. (Ver imagen N°' +
          val(datos.num_imagen, '4') + ')'),
        aumento:                 val(datos.aumento, DEFAULT_AUMENTO),
        num_imagen:              val(datos.num_imagen, '4'),
        caption_descripcion: val(datos.caption_descripcion, '***'),
      });
    case 'porosidad':
      return Object.assign(base, {
        norma_1_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_1),
        norma_2_linea:           lineaOrHide('Norma de ensayo: ',     datos.norma_2),
        zona_linea:              lineaOrHide(zonaPrefijo,              datos.zona_examinada),
        muestra_ensayada_linea:  lineaOrHide('Muestra ensayada: ',    datos.muestra_ensayada),
        equipamiento_1_linea:    equipoLinea(equipo, 'microscopio_378'),
        equipamiento_2_linea:    equipoLinea(equipo, 'termohigro_700'),
        temperatura:             temp(datos.temperatura),
        resultado_linea:         val(datos.resultado_texto,
          'La muestra presenta colonias de poros heterogéneamente distribuidos en la zona central. (Ver imagen N°' +
          val(datos.num_imagen, DEFAULT_NUM) + ')'),
        num_imagen:              val(datos.num_imagen, DEFAULT_NUM),
      });
    default:
      return base;
  }
}

// ── Generador principal ──────────────────────────────────────────────────────
function generarMetalografiaDesdeTemplate(ot, datos, fotosCaratula, tipoEnsayo) {
  const subtipo = tipoEnsayo || datos.subtipo;
  if (!subtipo || !TEMPLATE_PATHS[subtipo])
    throw new Error(`[metalografia] subtipo desconocido: ${subtipo}`);

  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const esSecundario = fotosCaratula === null;

  const templateData = mapearDatos(subtipo, datos, ot);

  // Render con docxtemplater
  const content = fs.readFileSync(TEMPLATE_PATHS[subtipo], 'binary');
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

  // ── Post-proceso común ──────────────────────────────────────────────────
  // Inclusiones: inyectar los valores de la tabla A/B/C/D × Fino/Grueso
  if (subtipo === 'inclusiones') {
    outXml = inyectarValoresInclusiones(outXml, datos.inclusiones || {});
  }

  // "OTROS EQUIPOS" del form: inyectar líneas antes de "RESULTADOS OBTENIDOS"
  {
    const lineasOtros = formatearOtrosEquipos(datos);
    if (lineasOtros.length) {
      const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
      const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
      const parrafos = lineasOtros.map(l =>
        '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
        '<w:ind w:left="851"/></w:pPr>' +
        `<w:r><w:rPr>${fonts}${sz}</w:rPr>` +
        `<w:t xml:space="preserve">${escape(l)}</w:t></w:r></w:p>`
      ).join('');
      const refPos = outXml.indexOf('RESULTADOS OBTENIDOS');
      if (refPos >= 0) {
        const pStart = scanBackForTag(outXml, '<w:p', refPos);
        if (pStart >= 0) outXml = outXml.slice(0, pStart) + parrafos + outXml.slice(pStart);
      }
    }
  }

  // NOTA opcional
  if (datos.tiene_nota && (datos.nota_texto || '').trim()) {
    outXml = insertarBloqueHeading(outXml, 'NOTA', datos.nota_texto.trim());
  }
  // Evaluación opcional
  if (datos.tiene_evaluacion && (datos.evaluacion_texto || '').trim()) {
    outXml = insertarBloqueHeading(outXml, 'EVALUACION DE RESULTADOS', datos.evaluacion_texto.trim());
  }

  // Eliminar párrafos cuyo texto es __SECTION_HIDE__ (placeholder oculto)
  outXml = eliminarSeccionesOcultas(outXml);
  outXml = eliminarParrafosVacios(outXml);
  outXml = forzarCalibri(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = minimizarUltimoParagrafo(outXml);
  if (esSecundario) outXml = eliminarBlancosTrasUltimoContenido(outXml);

  // Imágenes del ensayo (microestructura, tamano-grano, etc.) — TODAS las fotos
  // de datos.imagenes_resultado se insertan antes/después del caption del modelo,
  // cada una con su caption del form.
  const fotosEnsayo = Array.isArray(datos.imagenes_resultado)
    ? datos.imagenes_resultado.map(p => {
        if (!p) return null;
        const url = typeof p === 'string' ? p : p.dataUrl;
        if (!url) return null;
        const b64 = url.replace(/^data:[^;]+;base64,/, '');
        return { buffer: Buffer.from(b64, 'base64'), caption: p.caption || '', name: p.name || '' };
      }).filter(x => x && x.buffer)
    : [];
  // Quitar SIEMPRE el caption residual del modelo F2 (ej. "Imagen N°3 – Tamaño
  // de grano", "Imagen N°2 – Microestructura ( X)") y el placeholder visual
  // "***". Si el usuario no carga imagen propia, el pie tampoco debe aparecer.
  outXml = quitarCaptionResidual(outXml);
  if (fotosEnsayo.length > 0) {
    // Insertar al final del ensayo: antes de OAA o FIN DE INFORME
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosEnsayo,
      `metalo_${subtipo}`, MARKER_FIN_ENSAYO, 'before');
  }

  // Imagen de carátula
  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, `metalografia_${subtipo}`);

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

  // Eliminar numbering.xml (igual que ferrita-delta) para evitar conflictos en combinados
  delete processedZip.files['word/numbering.xml'];
  const relsPath = 'word/_rels/document.xml.rels';
  if (processedZip.files[relsPath]) {
    let relsXml = processedZip.files[relsPath].asText();
    relsXml = relsXml.replace(/<Relationship[^>]*numbering[^>]*\/>/g, '');
    processedZip.file(relsPath, relsXml);
  }
  const ctPath = '[Content_Types].xml';
  if (processedZip.files[ctPath]) {
    let ctXml = processedZip.files[ctPath].asText();
    ctXml = ctXml.replace(/<Override[^>]*numbering[^>]*\/>/g, '');
    processedZip.file(ctPath, ctXml);
  }

  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: helpers ────────────────────────────────────────────────────

// Inyecta los valores de inclusiones (A/B/C/D × Fino/Grueso) en la tabla del template.
// El modelo F2 ya tiene la tabla con celdas vacías para los valores; las llenamos
// por orden (Fino-A, Fino-B, ..., Grueso-D).
function inyectarValoresInclusiones(xml, incl) {
  const valores = [
    incl.fino_a, incl.fino_b, incl.fino_c, incl.fino_d,
    incl.grueso_a, incl.grueso_b, incl.grueso_c, incl.grueso_d,
  ].map(v => (v == null ? '' : String(v).trim()));

  // Encontrar la tabla de inclusiones por las cabeceras "Sulfuros" / "Aluminatos"
  const tableRe = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  return xml.replace(tableRe, tabla => {
    if (!/Sulfuros|Aluminatos|Silicatos/.test(tabla)) return tabla;
    // Las celdas de datos están en las últimas 2 filas (Fino, Grueso) × 4 columnas
    // cada una. Cada celda tiene un párrafo vacío que vamos a llenar.
    // Estrategia simple: en cada <w:tc> que sigue a "Fino" o "Grueso" (cabecera de fila),
    // inyectar el valor si tiene texto vacío.
    const rows = [...tabla.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(m => m[0]);
    // Encontrar la fila "Fino" y la fila "Grueso"
    const findRowIdx = (label) => rows.findIndex(r => {
      const txts = [...r.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim();
      return txts.startsWith(label);
    });
    const finoIdx = findRowIdx('Fino');
    const gruesoIdx = findRowIdx('Grueso');

    function fillRow(row, baseIdx) {
      // Saltear la primera celda (la del label) y rellenar las siguientes 4
      const cells = [...row.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(m => m[0]);
      const nuevas = cells.map((cell, i) => {
        if (i === 0) return cell;          // celda con label "Fino" o "Grueso"
        if (i - 1 >= 4) return cell;       // solo 4 valores
        const v = valores[baseIdx + i - 1] || '';
        if (!v) return cell;
        // Inyectar el valor en el primer <w:t> vacío del párrafo, o crear uno
        if (/<w:t[^>]*>\s*<\/w:t>/.test(cell)) {
          return cell.replace(/<w:t([^>]*)>\s*<\/w:t>/, `<w:t$1>${v}</w:t>`);
        }
        // Si el párrafo no tiene <w:t>, agregar un run con el valor
        return cell.replace(/<\/w:p>/, `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr><w:t>${v}</w:t></w:r></w:p>`);
      });
      const rowOpen = row.match(/<w:tr\b[^>]*>/)[0];
      return rowOpen + nuevas.join('') + '</w:tr>';
    }

    let newTabla = tabla;
    if (finoIdx >= 0) {
      newTabla = newTabla.replace(rows[finoIdx], fillRow(rows[finoIdx], 0));
    }
    if (gruesoIdx >= 0) {
      // Releer la tabla por si el reemplazo anterior cambió posiciones
      newTabla = newTabla.replace(rows[gruesoIdx], fillRow(rows[gruesoIdx], 4));
    }
    return newTabla;
  });
}

// Quita el caption residual del template F2 (tipo "Imagen N°2 – Microestructura ( X)")
// y el placeholder visual "***" que precede al caption. Se usa cuando el usuario
// cargó imágenes propias con sus captions, así que el placeholder del modelo
// queda obsoleto.
function quitarCaptionResidual(xml) {
  // Buscar párrafos que contengan "Imagen N°" + algún término del modelo
  const CAPTIONS_MODELO = [
    'Microestructura (', 'Tamaño de grano', 'Estructura de grafito',
    'Macrografía', 'Imagen N° – ', 'Imagen Nº – ',
  ];
  let result = xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, p => {
    const visible = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('');
    const tieneImagenN = /Imagen\s*N[°˚º]/.test(visible);
    if (!tieneImagenN) return p;
    if (CAPTIONS_MODELO.some(c => visible.includes(c))) return '';
    return p;
  });
  // También quitar párrafos que sólo tengan "***" o "**" (placeholder visual de
  // imagen entre el resultado y el caption del modelo)
  result = result.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, p => {
    const visible = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim();
    if (/^\*+$/.test(visible)) return '';
    return p;
  });
  return result;
}

// Elimina párrafos cuyo texto visible contiene __SECTION_HIDE__ (marca de
// placeholder oculto)
function eliminarSeccionesOcultas(xml) {
  const MARKER = '__SECTION_HIDE__';
  let result = xml, pos;
  while ((pos = result.indexOf(MARKER)) >= 0) {
    const pClose = result.indexOf('</w:p>', pos);
    if (pClose < 0) break;
    const end = pClose + '</w:p>'.length;
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
      // Preservar blancos de carátula (antes del PB)
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
  // Normalizar TODOS los tamaños a 11pt (sz=22). Esto resuelve casos donde el
  // template tiene runs con sz=20 (10pt) u otros que rompen la consistencia
  // visual del informe (ej. temperatura, parámetros).
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
  const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

module.exports = { generarMetalografiaDesdeTemplate, TEMPLATE_PATHS };
