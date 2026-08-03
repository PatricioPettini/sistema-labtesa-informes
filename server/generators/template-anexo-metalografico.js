'use strict';
// Generador para "Anexo Metalográfico" (modelo FM-080). Versión reducida del
// análisis metalográfico general, enfocada en dos análisis: TAMAÑO DE GRANO y
// TENOR INCLUSIONARIO. Reutiliza el template `varios.docx`.

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');
const { manejarImagenesCaratula, insertarImagenesEnsayo } = require('./imagenes-caratula-helper');
const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/varios.docx');
const MARKER_FIN_ENSAYO = ['Los ensayos marcados con', 'FIN DE INFORME'];

const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';

const REACTIVOS = [
  ['nital2',      'Nital al 2%'],
  ['nitro_fluor', 'Nitro fluor glicerina'],
  ['nital6',      'Nital al 6%'],
  ['universal',   'Universal'],
];

// [key, nombre, tagDefault]. tagDefault se usa cuando el usuario tildó el
// equipo pero no editó el input de TAG (equipamiento_tags[key] undefined).
const EQUIPOS = [
  ['leica_378', 'Microscopio Leica DM 750', 'MM-378'],
  ['termo_700', 'Termohigrómetro',          'MM-700'],
];

const AUMENTOS = [
  ['x50',   '50X'],
  ['x100',  '100X'],
  ['x200',  '200X'],
  ['x500',  '500X'],
  ['x1000', '1000X'],
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Sangría izquierda +0.5cm (284 twips) para no pisar el membrete lateral
// "BTESA". Body text = 1135, sub-headings numerados = 1135 con hanging 425
// (número queda a 710), heading principal = 426.
function pLinea(texto, bold) {
  const b = bold ? '<w:b/><w:bCs/>' : '';
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="1419"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

function pHeading(texto) {
  return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="1419"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="1419" w:hanging="425"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t>${esc(texto)}</w:t></w:r></w:p>`;
}

function pBlanco() {
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="1135"/></w:pPr></w:p>';
}

// Celda de tabla — bordes finos negros, texto centrado, fuente Calibri 11.
function celdaTabla(texto, ancho, header) {
  const BORD = '<w:tcBorders>' +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';
  const fill = header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
  const bold = header ? '<w:b/><w:bCs/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${BORD}${fill}<w:vAlign w:val="center"/></w:tcPr>` +
    '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS}${bold}${SZ}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p></w:tc>`;
}

// Tabla de inclusiones ASTM E45: Tamaño × (Sulfuros A / Aluminatos B / Silicatos C / Ox.Globulares D)
// Filas: Serie Fina + Serie Gruesa. Valores desde datos.inclusiones.{fino_a...grueso_d}.
function construirTablaInclusiones(inc) {
  if (!inc || typeof inc !== 'object') return '';
  const filaLabelW = 1500, colValorW = 1700;
  const total = filaLabelW + colValorW * 4;
  const grid = '<w:tblGrid>' +
    `<w:gridCol w:w="${filaLabelW}"/>` +
    `<w:gridCol w:w="${colValorW}"/>`.repeat(4) +
    '</w:tblGrid>';
  const rowH = '<w:tr>' +
    celdaTabla('Tamaño', filaLabelW, true) +
    celdaTabla('Sulfuros (A)', colValorW, true) +
    celdaTabla('Aluminatos (B)', colValorW, true) +
    celdaTabla('Silicatos (C)', colValorW, true) +
    celdaTabla('Ox.Globulares (D)', colValorW, true) +
    '</w:tr>';
  const rowF = '<w:tr>' +
    celdaTabla('Serie Fina', filaLabelW, true) +
    celdaTabla(inc.fino_a || '', colValorW, false) +
    celdaTabla(inc.fino_b || '', colValorW, false) +
    celdaTabla(inc.fino_c || '', colValorW, false) +
    celdaTabla(inc.fino_d || '', colValorW, false) +
    '</w:tr>';
  const rowG = '<w:tr>' +
    celdaTabla('Serie Gruesa', filaLabelW, true) +
    celdaTabla(inc.grueso_a || '', colValorW, false) +
    celdaTabla(inc.grueso_b || '', colValorW, false) +
    celdaTabla(inc.grueso_c || '', colValorW, false) +
    celdaTabla(inc.grueso_d || '', colValorW, false) +
    '</w:tr>';
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
    grid + rowH + rowF + rowG + '</w:tbl>';
}

function tieneDatosInclusiones(inc) {
  if (!inc || typeof inc !== 'object') return false;
  return ['fino_a','fino_b','fino_c','fino_d','grueso_a','grueso_b','grueso_c','grueso_d']
    .some(k => (inc[k] != null) && String(inc[k]).trim() !== '');
}

// Título de análisis — mismo estilo que el título principal del F2:
// numeración automática ilvl=0 numId=16, bold, uppercase.
function pTituloAnalisis(texto) {
  return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="994"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="710" w:firstLine="0"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

// Aplica el sufijo de año a un nombre de norma. Si el año trae ":" o "-" al
// inicio lo respeta; si es un año pelado le antepone "-".
function _aplicarAnio(nombre, anio) {
  const v = String(anio || '').trim();
  if (!v) return nombre;
  const suf = (v[0] === '-' || v[0] === ':') ? v : '-' + v;
  return nombre + suf;
}

// Arma la línea "Norma de ensayo: ..." a partir de los flags del form.
// Prioridad: si viene `norma_completa` (texto libre), se usa tal cual;
// si no, se combinan checkboxes con año + método + "otra norma" con "y".
function armarNorma(bloc, defaultAstm) {
  const completa = (bloc.norma_completa || '').trim();
  if (completa) return completa;
  const partes = [];
  if (bloc.astm) partes.push(_aplicarAnio(defaultAstm, bloc.astm_year));
  if (bloc.metodo_chk && (bloc.metodo || '').trim()) partes.push(bloc.metodo.trim());
  // "Otra norma": se concatena con "y" al final de la línea.
  const otra = (bloc.otra || '').trim();
  if (otra) partes.push(otra);
  return partes.join(' y ').trim();
}

function armarItm(bloc, defaultNum) {
  const explicito = (bloc.itm_numero || '').trim();
  if (explicito) return _aplicarAnio(explicito, bloc.itm_year);
  if (bloc.itm) return _aplicarAnio(defaultNum, bloc.itm_year);
  return '';
}

function construirBloqueEnsayo(datos) {
  const partes = [];
  const asterisco = datos.oaa === false ? '' : '*';
  const g   = datos.grano || {};
  const inc = datos.inclu || {};
  const zonasComun = (datos.zona_ensayo || '').trim();
  const tempComun  = (datos.temperatura || '').toString().trim();
  const muestra    = (datos.muestra_ensayada || '').trim();

  // Reactivos (compartidos) — se muestran en la sección de tamaño de grano,
  // ya que inclusiones no requiere ataque en el informe de referencia.
  const reactivosActivos = REACTIVOS.filter(([k]) => datos.reactivos && datos.reactivos[k]).map(([, label]) => label);
  const reactivoOtro = (datos.reactivo_otro || '').trim();
  if (reactivoOtro) reactivosActivos.push(reactivoOtro);
  const ataque = reactivosActivos.join(', ');

  // Equipamiento (compartido en ambas secciones).
  const equiposLineas = [];
  EQUIPOS.forEach(([key, nombre, tagDefault]) => {
    if (!(datos.equipamiento && datos.equipamiento[key])) return;
    // Si el usuario no editó el input, equipamiento_tags[key] es undefined —
    // usar el tagDefault del catálogo. Respeta '' vacío si el usuario lo borró.
    const tagRaw = datos.equipamiento_tags && datos.equipamiento_tags[key];
    const tag = (tagRaw != null ? String(tagRaw) : String(tagDefault || '')).trim();
    equiposLineas.push(tag ? `${nombre} TAG N°${tag}` : nombre);
  });
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => equiposLineas.push(l));
  const aumentosActivos = AUMENTOS.filter(([k]) => datos.aumentos && datos.aumentos[k]).map(([, l]) => l);
  const aumentoLinea = aumentosActivos.length ? `Aumento utilizado: ${aumentosActivos.join(', ')}` : null;

  function bloqueEquipamiento() {
    if (!equiposLineas.length && !aumentoLinea) return;
    partes.push(pHeading('EQUIPAMIENTO UTILIZADO'));
    // El aumento clásicamente va entre el microscopio y el termohigrómetro:
    //   Microscopio Leica DM 750 TAG N°MM-378
    //   Aumento utilizado: 100 X
    //   Termohigrómetro TAG N°MM-700
    const microIdx = equiposLineas.findIndex(l => /microscopio/i.test(l));
    if (microIdx >= 0 && aumentoLinea) {
      const lineas = equiposLineas.slice();
      lineas.splice(microIdx + 1, 0, aumentoLinea);
      lineas.forEach(l => partes.push(pLinea(l)));
    } else {
      equiposLineas.forEach(l => partes.push(pLinea(l)));
      if (aumentoLinea) partes.push(pLinea(aumentoLinea));
    }
    partes.push(pBlanco());
  }

  // ─── SECCIÓN 1: TAMAÑO DE GRANO ───────────────────────────────────────
  const resultadoGrano = (datos.resultado_grano || '').trim();
  const normaGrano = armarNorma(g, 'ASTM E112-25');
  const itmGrano   = armarItm(g, '064');
  const hayGrano = normaGrano || itmGrano || resultadoGrano;
  if (hayGrano) {
    partes.push(pTituloAnalisis('TAMAÑO DE GRANO' + asterisco));

    // Condiciones
    partes.push(pHeading('CONDICIONES DE ENSAYO'));
    if (normaGrano) partes.push(pLinea('Norma de ensayo: ' + normaGrano));
    if (itmGrano)   partes.push(pLinea('Metodología de ensayo: ITM N°' + itmGrano));
    if (ataque)     partes.push(pLinea('Ataque utilizado: ' + ataque));
    if (zonasComun) partes.push(pLinea('Zonas examinadas: ' + zonasComun));
    if (tempComun)  partes.push(pLinea('Temperatura de ensayo: ' + tempComun + ' °C'));
    if (muestra)    partes.push(pLinea('Muestra ensayada: ' + muestra));
    partes.push(pBlanco());

    // Equipamiento
    bloqueEquipamiento();

    // Resultados
    if (resultadoGrano) {
      partes.push(pHeading('RESULTADOS OBTENIDOS'));
      resultadoGrano.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
      partes.push(pBlanco());
    }
    // Marker para insertar las imágenes de tamaño de grano después. Se
    // reemplaza en el post-proceso vía insertarImagenesEnsayo (o se limpia
    // si no hay imágenes cargadas).
    partes.push(pLinea('__IMG_GRANO__'));
  }

  // ─── SECCIÓN 2: DETERMINACIÓN DE INCLUSIONES ──────────────────────────
  const resultadoInclu = (datos.resultado_inclusionario || '').trim();
  const hayTablaInc = tieneDatosInclusiones(datos.inclusiones);
  const normaInclu = armarNorma(inc, 'ASTM E45-25');
  const itmInclu   = armarItm(inc, '063');
  const hayInclu = normaInclu || itmInclu || resultadoInclu || hayTablaInc;
  if (hayInclu) {
    partes.push(pTituloAnalisis('DETERMINACIÓN DE INCLUSIONES' + asterisco));

    // Condiciones
    partes.push(pHeading('CONDICIONES DE ENSAYO'));
    if (normaInclu) partes.push(pLinea('Norma de ensayo: ' + normaInclu));
    if (itmInclu)   partes.push(pLinea('Metodología de ensayo: ITM N°' + itmInclu));
    if (zonasComun) partes.push(pLinea('Zona de ensayo: ' + zonasComun));
    if (tempComun)  partes.push(pLinea('Temperatura de ensayo: ' + tempComun + ' °C'));
    if (muestra)    partes.push(pLinea('Muestra ensayada: ' + muestra));
    partes.push(pBlanco());

    // Equipamiento
    bloqueEquipamiento();

    // Resultados
    if (resultadoInclu || hayTablaInc) {
      partes.push(pHeading('RESULTADOS OBTENIDOS'));
      if (resultadoInclu) {
        resultadoInclu.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
        partes.push(pBlanco());
      }
      if (hayTablaInc) {
        partes.push(construirTablaInclusiones(datos.inclusiones));
        partes.push(pLinea('Tabla – Resultados ensayo determinación de inclusiones', true));
        partes.push(pBlanco());
      }
    }
    partes.push(pLinea('__IMG_INCL__'));
  }

  return partes.join('');
}

function generarAnexoMetalograficoDesdeTemplate(ot, datos, fotosCaratula) {
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  // ── Multi-OT: filtrar imágenes por nro_ot_override + aplicar overrides ───
  if (datos && datos._filtro_ot != null) {
    const otFiltro = String(datos._filtro_ot);
    const esOtDelEnsayo = otFiltro === String(ot.nro_ot || '');
    const filtrarImgs = (arr) => (Array.isArray(arr) ? arr : []).filter(p => {
      const ov = String((p && p.nro_ot_override) || '').trim();
      const perteneceA = ov || String(ot.nro_ot || '');
      return perteneceA === otFiltro || (esOtDelEnsayo && !ov);
    });
    datos = Object.assign({}, datos);
    ['imagenes_grano', 'imagenes_inclusiones'].forEach(k => {
      if (Array.isArray(datos[k])) datos[k] = filtrarImgs(datos[k]);
    });
  }
  if (datos && datos.textos_por_ot && typeof datos.textos_por_ot === 'object') {
    const nroOtActual = String(ot.nro_ot || '');
    const t = datos.textos_por_ot[nroOtActual];
    if (t) {
      datos = Object.assign({}, datos);
      // Textos específicos del anexo: grano y tenor inclusionario. Cada OT
      // puede tener textos distintos; si el mapa está poblado los aplicamos.
      if (t.resultado_grano !== undefined) datos.resultado_grano = t.resultado_grano;
      if (t.resultado_inclusionario !== undefined) datos.resultado_inclusionario = t.resultado_inclusionario;
      // Backward-compat: mapa antiguo de metalografía general.
      if (t.resultados_seccion !== undefined) datos.resultados_seccion = t.resultados_seccion;
    }
  }
  if (datos && datos.condiciones_por_ot && typeof datos.condiciones_por_ot === 'object') {
    const nroOtActual = String(ot.nro_ot || '');
    const c = datos.condiciones_por_ot[nroOtActual];
    if (c && Object.keys(c).length > 0) {
      // Aplicar TODOS los campos del mapa como overrides (temperatura,
      // reactivos, equipamiento, grano, inclu, etc.).
      datos = Object.assign({}, datos, c);
    }
  }

  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });
  doc.render({
    numero_ot: nroOtBase,
    razon_social: ot.razon_social || '',
    fecha_generacion: ot.fecha_finalizacion || '',
    id_muestra: ot.id_muestra || '',
    fecha_recepcion: ot.fecha_recepcion || '',
    fecha_aprobacion: ot.fecha_aprobacion || '',
    fecha_finalizacion: ot.fecha_finalizacion || '',
    imagen_placeholder: fotos.length > 0 ? '__IMAGE_CARATULA__' : '__IMAGE_NONE__',
  });

  const processedZip = doc.getZip();
  let outXml = processedZip.files['word/document.xml'].asText();

  const bloque = construirBloqueEnsayo(datos);
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?__ENSAYO_VARIOS__(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/, bloque);

  const textosOAA = [];
  if (datos.oaa !== false) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);

  // Helper para convertir la lista de fotos del form (dataUrl base64) al shape
  // que espera insertarImagenesEnsayo (Buffer + caption + name).
  function toFotosBuffer(arr) {
    return Array.isArray(arr)
      ? arr.map(p => {
          if (!p) return null;
          const url = typeof p === 'string' ? p : p.dataUrl;
          if (!url) return null;
          const b64 = url.replace(/^data:[^;]+;base64,/, '');
          return { buffer: Buffer.from(b64, 'base64'), caption: p.caption || '', name: p.name || '' };
        }).filter(x => x && x.buffer)
      : [];
  }

  // Fotos separadas por sección — se insertan en los markers correspondientes
  // (__IMG_GRANO__ y __IMG_INCL__) que construirBloqueEnsayo dejó plantados.
  const fotosGrano = toFotosBuffer(datos.imagenes_grano);
  const fotosInclu = toFotosBuffer(datos.imagenes_inclusiones);
  if (fotosGrano.length > 0) {
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosGrano, 'anexo-metalografico', '__IMG_GRANO__', 'after', 250);
  }
  if (fotosInclu.length > 0) {
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosInclu, 'anexo-metalografico', '__IMG_INCL__', 'after', 260);
  }
  // Limpiar los markers (párrafos con "__IMG_GRANO__" o "__IMG_INCL__" que
  // hayan quedado si no había fotos, o los originales que quedan del insert).
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?__IMG_(?:GRANO|INCL)__(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, '');

  // Compat: si algún ensayo legacy todavía usa `imagenes_resultado`, lo
  // colocamos al final del bloque (antes de "FIN DE INFORME") como antes.
  const fotosLegacy = toFotosBuffer(datos.imagenes_resultado);
  if (fotosLegacy.length > 0) {
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosLegacy, 'anexo-metalografico', MARKER_FIN_ENSAYO, 'before');
  }

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'anexo-metalografico');

  ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'].forEach(hdrPath => {
    const entry = processedZip.files[hdrPath];
    if (!entry) return;
    let hdrXml = entry.asText()
      .replace(/\{\{razon_social\}\}/g, ot.razon_social || '')
      .replace(/\{\{numero_ot\}\}/g, nroOtBase)
      .replace(/\{\{fecha_generacion\}\}/g, ot.fecha_finalizacion || '');
    processedZip.file(hdrPath, hdrXml);
  });

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { generarAnexoMetalograficoDesdeTemplate };
