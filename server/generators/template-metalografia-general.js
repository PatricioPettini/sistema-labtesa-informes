'use strict';
// Generador para "Análisis Metalográfico General" (modelo FM-055). Espeja el
// preinforme físico: agrupa varios análisis (microestructura, espesor de
// recubrimiento, estructura de grafito, decarburación, otro) en un único
// informe con normas, reactivo utilizado, equipamiento, resultados por sección
// y observaciones. Reutiliza el template `varios.docx` como base.

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

const ANALISIS = [
  ['micro',   'MICROESTRUCTURA'],
  ['espesor', 'ESPESOR DE RECUBRIMIENTO'],
  ['grafito', 'ESTRUCTURA DE GRAFITO'],
  ['decarb',  'DECARBURACIÓN'],
  ['otro',    'OTRO'],
];

const REACTIVOS = [
  ['nital2',      'Nital al 2%'],
  ['nitro_fluor', 'Nitro fluor glicerina'],
  ['nital6',      'Nital al 6%'],
  ['vilella',     'Reactivo Vilella'],
  ['universal',   'Universal'],
  ['kellers',     'Reactivo Kellers'],
];

const EQUIPOS = [
  ['olympus_016', 'Microscopio Olympus'],
  ['leica_378',   'Microscopio Leica DM 750'],
  ['termo_700',   'Termohigrómetro'],
];

const AUMENTOS = [
  ['x50',   '50X'],
  ['x100',  '100X'],
  ['x200',  '200X'],
  ['x500',  '500X'],
  ['x1000', '1000X'],
];

const RESULTADOS = [
  ['microestructura', 'MICROESTRUCTURA'],
  ['grafito',         'ESTRUCTURA DE GRAFITO'],
  ['decarburacion',   'DECARBURACIÓN'],
  ['defectos',        'DEFECTOS SUPERFICIALES'],
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pLinea(texto, bold) {
  const b = bold ? '<w:b/><w:bCs/>' : '';
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

function pHeading(texto) {
  return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="851"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="851" w:hanging="425"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t>${esc(texto)}</w:t></w:r></w:p>`;
}

function pBlanco() {
  return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr></w:p>';
}

// Título de sección estilo PECOM: "DETERMINACIÓN DE X" en negrita, con numId=16
// para tomar la numeración automática (1., 2., 3., ...).
function pSeccionHeading(texto) {
  return '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="16"/></w:numPr>' +
    '<w:tabs><w:tab w:val="left" w:pos="426"/></w:tabs>' +
    '<w:spacing w:line="300" w:lineRule="auto"/>' +
    '<w:ind w:left="142" w:firstLine="0"/>' +
    `<w:rPr>${FONTS}<w:b/>${SZ}</w:rPr></w:pPr>` +
    `<w:r><w:rPr>${FONTS}<w:b/>${SZ}</w:rPr>` +
    `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
}

function construirBloqueEnsayo(datos) {
  const partes = [];

  // ── Preparar valores globales (aplicables a todas las secciones) ──────
  const asterisco = datos.oaa === false ? '' : '*';
  const temperaturaTxt = String(datos.temperatura || '').trim();
  const zonaTxt        = String(datos.zona_ensayo || '').trim();
  const muestraTxt     = String(datos.muestra_ensayada || '').trim();

  // Reactivo utilizado combinado
  const reactivosActivos = REACTIVOS.filter(([k]) => datos.reactivos && datos.reactivos[k]).map(([, label]) => label);
  const reactivoOtro = (datos.reactivo_otro || '').trim();
  if (reactivoOtro) reactivosActivos.push(reactivoOtro);
  const reactivoLinea = reactivosActivos.length ? `Ataque utilizado: ${reactivosActivos.join(', ')}` : '';

  // Equipamiento global
  const equiposLineasGlobal = [];
  EQUIPOS.forEach(([key, nombre]) => {
    if (!(datos.equipamiento && datos.equipamiento[key])) return;
    const tag = (datos.equipamiento_tags && datos.equipamiento_tags[key] || '').trim();
    equiposLineasGlobal.push(tag ? `${nombre} TAG N°${tag}` : nombre);
  });
  // Aumento: texto libre si está, si no listado de checkboxes.
  const aumentoTextoLibre = String(datos.aumento_texto || '').trim();
  if (aumentoTextoLibre) {
    equiposLineasGlobal.push(`Aumento utilizado: ${aumentoTextoLibre}`);
  } else {
    const aumentosActivos = AUMENTOS.filter(([k]) => datos.aumentos && datos.aumentos[k]).map(([, l]) => l);
    if (aumentosActivos.length) equiposLineasGlobal.push(`Aumento utilizado: ${aumentosActivos.join(', ')}`);
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => equiposLineasGlobal.push(l));

  // ── Secciones por análisis (formato PECOM) ────────────────────────────
  // Cada análisis marcado como "on" se emite como una sección independiente
  // con su propio título "DETERMINACIÓN DE X" seguido de CONDICIONES /
  // EQUIPAMIENTO / RESULTADOS.
  const seccionesActivas = ANALISIS
    .filter(([k]) => datos.analisis && datos.analisis[k] && datos.analisis[k].on);

  if (seccionesActivas.length > 0) {
    seccionesActivas.forEach(([k, label]) => {
      const cfg = datos.analisis[k] || {};
      const ref = String(cfg.ref || '').trim();
      const refOtra = String(cfg.ref_otra || '').trim();
      const metod = String(cfg.metodologia || '').trim();
      const zonaSec = String(cfg.zona || zonaTxt || '').trim();
      const ataqueSec = String(cfg.ataque || '').trim() || reactivoLinea.replace(/^Ataque utilizado:\s*/, '');
      const aumentoSec = String(cfg.aumento || aumentoTextoLibre || '').trim();
      const resultadoSec = (datos.resultados_seccion && datos.resultados_seccion[k] || '').trim();

      // Título "DETERMINACIÓN DE X" con asterisco OAA.
      // Para el análisis `otro` (1.1.5), el técnico puede haber ingresado un
      // nombre custom en `cfg.nombre` — usarlo si está presente. Sino, "OTRO".
      let etiquetaSec = label;
      if (k === 'otro') {
        const nombreCustom = String(cfg.nombre || '').trim();
        if (nombreCustom) etiquetaSec = nombreCustom.toUpperCase();
      }
      partes.push(pSeccionHeading('DETERMINACIÓN DE ' + etiquetaSec + asterisco));

      // ── CONDICIONES DE ENSAYO ─────────────────────────────────────
      partes.push(pHeading('CONDICIONES DE ENSAYO'));
      // Norma principal + "otra norma" opcional. Si ambas están cargadas, se
      // emite una sola línea "Norma de ensayo: X y Y". Si solo hay una, se
      // emite normal. Si no hay ninguna, nada.
      if (ref && refOtra) {
        partes.push(pLinea(`Norma de ensayo: ${ref} y ${refOtra}`));
      } else if (ref) {
        partes.push(pLinea(`Norma de ensayo: ${ref}`));
      } else if (refOtra) {
        partes.push(pLinea(`Norma de ensayo: ${refOtra}`));
      }
      if (metod)        partes.push(pLinea(`Metodología de ensayo: ${metod}`));
      if (ataqueSec)    partes.push(pLinea(`Ataque utilizado: ${ataqueSec}`));
      if (zonaSec)      partes.push(pLinea(`Zonas examinadas: ${zonaSec}`));
      if (temperaturaTxt) partes.push(pLinea(`Temperatura de ensayo: ${temperaturaTxt} °C`));
      if (muestraTxt && seccionesActivas[0][0] === k) partes.push(pLinea(`Muestra ensayada: ${muestraTxt}`));
      partes.push(pBlanco());

      // ── EQUIPAMIENTO UTILIZADO ───────────────────────────────────
      if (equiposLineasGlobal.length || aumentoSec) {
        partes.push(pHeading('EQUIPAMIENTO UTILIZADO'));
        equiposLineasGlobal.forEach(l => {
          // Reemplazar aumento global por el de la sección si difiere.
          if (aumentoSec && /^Aumento utilizado:/.test(l)) return;
          partes.push(pLinea(l));
        });
        if (aumentoSec) partes.push(pLinea(`Aumento utilizado: ${aumentoSec}`));
        partes.push(pBlanco());
      }

      // ── RESULTADOS OBTENIDOS ─────────────────────────────────────
      if (resultadoSec) {
        partes.push(pHeading('RESULTADOS OBTENIDOS'));
        resultadoSec.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
        partes.push(pBlanco());
      }
      // Marker para insertar las imágenes de ESTA sección después. El
      // post-proceso reemplaza esta línea por las fotos correspondientes
      // (imagenes_micro, imagenes_espesor, etc.) y limpia el marker si no hay.
      partes.push(pLinea('__IMG_MG_' + k.toUpperCase() + '__'));
    });
  } else {
    // Fallback legacy: si no se marcó ningún análisis, emitir un único bloque
    // "ANÁLISIS METALOGRÁFICO GENERAL" como antes.
    partes.push(pSeccionHeading('ANÁLISIS METALOGRÁFICO GENERAL' + asterisco));

    partes.push(pHeading('CONDICIONES DE ENSAYO'));
    if (reactivoLinea)  partes.push(pLinea(reactivoLinea));
    if (temperaturaTxt) partes.push(pLinea(`Temperatura de ensayo: ${temperaturaTxt} °C`));
    if (zonaTxt)        partes.push(pLinea(`Zona de ensayo: ${zonaTxt}`));
    if (muestraTxt)     partes.push(pLinea(`Muestra ensayada: ${muestraTxt}`));
    partes.push(pBlanco());

    if (equiposLineasGlobal.length) {
      partes.push(pHeading('EQUIPAMIENTO UTILIZADO'));
      equiposLineasGlobal.forEach(l => partes.push(pLinea(l)));
      partes.push(pBlanco());
    }

    const seccionesConTexto = RESULTADOS
      .map(([k, label]) => ({ label, texto: (datos.resultados_seccion && datos.resultados_seccion[k] || '').trim() }))
      .filter(s => s.texto);
    if (seccionesConTexto.length) {
      partes.push(pHeading('RESULTADOS OBTENIDOS'));
      seccionesConTexto.forEach(s => {
        partes.push(pLinea(s.label + ':', true));
        s.texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
        partes.push(pBlanco());
      });
    }
  }

  // ── OBSERVACIONES / EVALUACIÓN (global, al final) ─────────────────────
  const obs = (datos.evaluacion_texto || '').trim();
  if (obs) {
    partes.push(pHeading('OBSERVACIONES / EVALUACIÓN'));
    partes.push(pLinea('"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA"'));
    obs.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => partes.push(pLinea(l)));
    partes.push(pBlanco());
  }

  return partes.join('');
}

function generarMetalografiaGeneralDesdeTemplate(ot, datos, fotosCaratula) {
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  // ── Multi-OT: filtrar imágenes y aplicar overrides por OT ───────────────
  // Si datos._filtro_ot está seteado, emitimos solo lo que le corresponde a
  // la OT actual: imágenes con nro_ot_override coincidente (o sin override
  // cuando es la OT del ensayo), y overrides de analisis/textos si están.
  if (datos && datos._filtro_ot != null) {
    const otFiltro = String(datos._filtro_ot);
    const esOtDelEnsayo = otFiltro === String(ot.nro_ot || '');
    const filtrarImgs = (arr) => (Array.isArray(arr) ? arr : []).filter(p => {
      const ov = String((p && p.nro_ot_override) || '').trim();
      const perteneceA = ov || String(ot.nro_ot || '');
      return perteneceA === otFiltro || (esOtDelEnsayo && !ov);
    });
    datos = Object.assign({}, datos);
    ['imagenes_micro', 'imagenes_espesor', 'imagenes_grafito', 'imagenes_decarb'].forEach(k => {
      if (Array.isArray(datos[k])) datos[k] = filtrarImgs(datos[k]);
    });
  }
  // Overrides por OT: analisis + resultados_seccion. Aplican al aplanar los
  // valores raíz del ensayo antes de emitir.
  if (datos && datos.textos_por_ot && typeof datos.textos_por_ot === 'object') {
    const nroOtActual = String(ot.nro_ot || '');
    const t = datos.textos_por_ot[nroOtActual];
    if (t) {
      datos = Object.assign({}, datos);
      if (t.resultados_seccion !== undefined) datos.resultados_seccion = t.resultados_seccion;
    }
  }
  if (datos && datos.condiciones_por_ot && typeof datos.condiciones_por_ot === 'object') {
    const nroOtActual = String(ot.nro_ot || '');
    const c = datos.condiciones_por_ot[nroOtActual];
    if (c && c.analisis) {
      datos = Object.assign({}, datos, { analisis: c.analisis });
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

  // Micrografías del ensayo — separadas POR ANÁLISIS. Cada sección tiene un
  // marker __IMG_MG_<KEY>__ que reemplazamos por las fotos correspondientes.
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
  const seccionesConImagenes = [
    { key: 'micro',   rIdBase: 200 },
    { key: 'espesor', rIdBase: 210 },
    { key: 'grafito', rIdBase: 220 },
    { key: 'decarb',  rIdBase: 230 },
    { key: 'otro',    rIdBase: 240 },
  ];
  for (const s of seccionesConImagenes) {
    const fotosSec = toFotosBuffer(datos['imagenes_' + s.key]);
    const marker = '__IMG_MG_' + s.key.toUpperCase() + '__';
    if (fotosSec.length > 0) {
      outXml = insertarImagenesEnsayo(processedZip, outXml, fotosSec, 'metalografia-general', marker, 'after', s.rIdBase);
    }
  }
  // Limpiar cualquier marker que haya quedado (secciones sin imágenes).
  outXml = outXml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?__IMG_MG_[A-Z]+__(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, '');

  // Compat legacy: si algún ensayo viejo tiene `imagenes_resultado` (antes de
  // splitear por sección), lo emitimos al final del bloque como antes.
  const fotosLegacy = toFotosBuffer(datos.imagenes_resultado);
  if (fotosLegacy.length > 0) {
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosLegacy, 'metalografia-general', MARKER_FIN_ENSAYO, 'before');
  }

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'metalografia-general');

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

module.exports = { generarMetalografiaGeneralDesdeTemplate };
