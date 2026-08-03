const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula, insertarImagenesEnsayo } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/dureza-vickers.docx');

// Normas indexadas por key del form. El sufijo de año se lee de `<key>_year`
// (form nuevo) o `<key>_ed` (form legacy) — se prueban ambos.
const NORMAS = [
  { key: 'norma_astm_e92',        label: 'Norma de ensayo: ASTM E92' },
  { key: 'norma_astm_e384',       label: 'Norma de ensayo: ASTM E384' },
  { key: 'norma_iso6507',         label: 'Norma de ensayo: ISO 6507-1' },
  { key: 'norma_iso9015',         label: 'Norma de ensayo: ISO 9015-1' },
  { key: 'norma_din_en_1043',     label: 'Norma de ensayo: DIN EN 1043' },
  { key: 'norma_din_iso_15614',   label: 'Norma de ensayo: DIN ISO 15614' },
  { key: 'norma_ypf_b0005',       label: 'Norma de ensayo: YPF ED-B-00.05-01' },
  { key: 'norma_ypf_b0500',       label: 'Norma de ensayo: YPF ED-B-05.00-01' },
  { key: 'norma_ypf_ep',          label: 'Norma de ensayo: YPF ED(EP)-B-02.00-00' },
];

// Cargas Vickers con su escala HV para reemplazar "HV **/15" en el template
const CARGAS = {
  '0,1': 'HV 0,1/15', '0.1': 'HV 0,1/15',
  '0,3': 'HV 0,3/15', '0.3': 'HV 0,3/15',
  '0,5': 'HV 0,5/15', '0.5': 'HV 0,5/15',
  '1':   'HV 1/15',
  '3':   'HV 3/15',
  '5':   'HV 5/15',
  '10':  'HV 10/15',
  '30':  'HV 30/15',
  '50':  'HV 50/15',
  '100': 'HV 100/15',
};

// Equipamiento — catálogo completo. `nombre` es el label sin TAG (el TAG se toma
// de datos.equipamiento_tags[key] o del default). El campo `label` legacy
// sobrevive por compat.
const EQUIPO = [
  { key: 'buehler_405',          nombre: 'Microdurómetro Buehler Wilson VH 1150', tagDefault: 'MM-405' },
  { key: 'zwick_13',             nombre: 'Microdurómetro Zwick',                  tagDefault: 'MM-13'  },
  // alias legacy
  { key: 'zwick_013',            nombre: 'Microdurómetro Zwick',                  tagDefault: 'MM-013' },
  { key: 'calibre_694',          nombre: 'Calibre digital',                       tagDefault: 'MM-694' },
  { key: 'micrometro_179',       nombre: 'Micrómetro Mitutoyo',                   tagDefault: 'MM-179' },
  { key: 'calibre_mitutoyo_703', nombre: 'Calibre digital Mitutoyo',              tagDefault: 'MM-703' },
  { key: 'calibre_570',          nombre: 'Calibre digital Mitutoyo',              tagDefault: 'CAL-570' },
  { key: 'termohigro_794',       nombre: 'Termohigrómetro',                       tagDefault: 'MM-794' },
  { key: 'termohigro_700',       nombre: 'Termohigrómetro',                       tagDefault: 'MM-700' },
  { key: 'registrador_794',      nombre: 'Registrador de temperatura',            tagDefault: 'MM-794' },
  { key: 'patron_vickers',       nombre: 'Patrón',                                tagDefault: 'PMM-***' },
];

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
  if (para.includes('<w:drawing>')) return false;
  return !/<w:t[\s>]/.test(para);
}

// ── Generador principal ───────────────────────────────────────────────────────

// ── Carátula XML (solo cuando Vickers es el primer/único ensayo) ──────────────

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pCaratula(texto, bold = false, center = true) {
  const jc    = center ? '<w:jc w:val="center"/>' : '';
  const bTag  = bold ? '<w:b/><w:bCs/>' : '';
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  return `<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:spacing w:line="276" w:lineRule="auto"/>${jc}</w:pPr>` +
    `<w:r><w:rPr>${fonts}${bTag}${sz}</w:rPr><w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;
}

function generarCaratulaXml(ot, foto) {
  const lineas = [];
  lineas.push(pCaratula('La muestra se identifica por el cliente como:'));
  if (ot.id_muestra) lineas.push(pCaratula(ot.id_muestra, true));
  lineas.push('<w:p/>');
  if (ot.fecha_recepcion)    lineas.push(pCaratula(`Fecha de recepción de la muestra: ${ot.fecha_recepcion}`));
  if (ot.fecha_aprobacion)   lineas.push(pCaratula(`Fecha de aprobación e inicio del trabajo: ${ot.fecha_aprobacion}`));
  if (ot.fecha_finalizacion) lineas.push(pCaratula(`Fecha de finalización del certificado: ${ot.fecha_finalizacion}`));
  // Placeholder de imagen (se procesa en post-proceso igual que en otros generators)
  lineas.push(`<w:p><w:pPr><w:pStyle w:val="Textosinformato"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:t>${foto ? '__IMAGE_CARATULA__' : '__IMAGE_NONE__'}</w:t></w:r></w:p>`);
  lineas.push(pCaratula('Imagen N°1 - Estado de recepción', false, true));
  return lineas.join('');
}

function generarVickersDesdeTemplate(ot, datos, fotosCaratula) {
  // fotosCaratula === null → ensayo secundario (combinado); array → primero o único
  const esSecundario = fotosCaratula === null;
  const fotos = !esSecundario && Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];

  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  let docXml = zip.files['word/document.xml'].asText();

  // Insertar carátula y/o salto de página antes de "DUREZAS VICKERS"
  // - Standalone: carátula + page break (para que la carátula quede en la primera hoja)
  // - Secundario (combinado): solo page break (para que combinarBuffers lo encuentre)
  const dvPos = docXml.indexOf('DUREZAS VICKERS');
  if (dvPos >= 0) {
    const pStart = scanBackForTag(docXml, '<w:p', dvPos);
    if (pStart >= 0) {
      if (esSecundario) {
        // Solo page break para que combinarBuffers pueda extraer el contenido
        docXml = docXml.slice(0, pStart) +
          '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
          docXml.slice(pStart);
      } else {
        // Carátula + page break para documento standalone
        const caratulaXml = generarCaratulaXml(ot, fotos.length > 0);
        docXml = docXml.slice(0, pStart) +
          caratulaXml +
          '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
          docXml.slice(pStart);
      }
    }
  }
  zip.file('word/document.xml', docXml);

  // ── Condiciones ───────────────────────────────────────────────────────────
  const normas = [];
  const normasVistas = new Set();  // dedup — evita duplicados si `norma` libre coincide con un checkbox
  function pushNormaDedup(linea) {
    const key = linea.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normasVistas.has(key)) { normasVistas.add(key); normas.push(linea); }
  }
  // Normas de checkboxes. Sufijo de año: prueba `<key>_year` (form nuevo)
  // primero, luego `<key>_ed` (form legacy). Si es sólo dígitos, prepende '-'.
  NORMAS.filter(n => datos[n.key]).forEach(n => {
    const sufRaw = String(datos[n.key + '_year'] || datos[n.key + '_ed'] || '').trim();
    let suf = '';
    if (sufRaw) suf = (sufRaw[0] === '-' || sufRaw[0] === ':') ? sufRaw : '-' + sufRaw;
    pushNormaDedup(`${n.label}${suf}`);
  });
  // "Otro" — sólo se emite si el checkbox está tildado Y el texto no está vacío.
  // Norma "Otra": basta con que haya texto en el input, sin requerir checkbox.
  // Sólo emitir si el checkbox está tildado. Si el técnico destildó "Otra:"
  // pero el texto quedó residual, NO va al Word.
  if (datos.norma_otra_chk && (datos.norma_otra || '').trim()) {
    pushNormaDedup(`Norma de ensayo: ${datos.norma_otra.trim()}`);
  }
  // Fallback legacy: `datos.norma` como texto libre (sólo si NO hay checkboxes
  // tildados — evita el bug de doble emisión).
  if (normas.length === 0 && (datos.norma || '').trim()) {
    const yearSuf = (datos.norma_year_suffix || '').trim();
    const suf = yearSuf ? (yearSuf.startsWith('-') ? yearSuf : `-${yearSuf}`) : '';
    pushNormaDedup(`Norma de ensayo: ${datos.norma.trim()}${suf}`);
  }
  // Orden CONDICIONES: Código de referencia → Norma de ensayo → Metodología.
  // Los códigos se anteponen a las normas; la metodología (placeholder aparte)
  // y la "metodología según cliente" quedan al final.
  const metodCliente = datos.metodologia_cliente
    ? ['Metodología de ensayo según indicaciones del cliente'] : [];
  const codigos = [];
  if (datos.cod_asme)    codigos.push(`Código de referencia: ASME BPVC Sección IX Ed.${datos.ed_asme || '2025'}`);
  if (datos.cod_aws_d11) codigos.push('Código de referencia: AWS D1.1');
  if (datos.cod_api1104) codigos.push('Código de referencia: API 1104');
  const normas_seleccionadas_linea = [...codigos, ...normas, ...metodCliente].join('\n');

  // Metodología (U3): configurable. Default = ITM N°076
  const metodologia_linea = (datos.metodologia || '').trim()
    ? `Metodología de ensayo: ${datos.metodologia.trim()}`
    : 'Metodología de ensayo: ITM N°076';

  // Tiempo de aplicación (U4): configurable. Default = 15 s.
  // Si el usuario cargó solo el número, agregar "segundos" como unidad; si ya
  // escribió una unidad ("s", "seg", "segundos", "min"), respetar lo escrito.
  const tiempo_aplicacion_linea = (function () {
    if (datos.tiempo_aplicacion == null || datos.tiempo_aplicacion === '') {
      return 'Tiempo de aplicación de carga: 15 s';
    }
    const t = String(datos.tiempo_aplicacion).trim();
    const yaTieneUnidad = /(seg|segundos?|\bs\b|min|minutos?)/i.test(t);
    const conUnidad = yaTieneUnidad ? t : (t + ' segundos');
    return `Tiempo de aplicación de carga: ${conUnidad}`;
  })();

  const espesor_probeta_linea = datos.espesor_probeta
    ? `Espesor de probeta: ${datos.espesor_probeta} mm`
    : '__SECTION_HIDE__';

  const carga_aplicada_linea = datos.carga_aplicada
    ? `Carga aplicada: ${datos.carga_aplicada} kgf`
    : '__SECTION_HIDE__';

  let temperatura_ensayo_linea = '__SECTION_HIDE__';
  if (datos.temperatura !== '' && datos.temperatura != null) {
    temperatura_ensayo_linea = `Temperatura de ensayo: ${datos.temperatura} °C`;
  }

  // ── Equipamiento (slots 1–7) ──────────────────────────────────────────────
  // El equipo se emite SOLO si el usuario marcó el checkbox correspondiente en
  // `datos.equipamiento[key]`. Para el patrón Vickers, además se necesita que
  // haya un número cargado en `datos.patron_tag` (form nuevo) o `datos.patron`
  // (legacy). Si el checkbox no está marcado, no se agrega aunque haya default.
  const patronNum = String(datos.patron_tag || datos.patron || '').trim();
  const equipMarcado = datos.equipamiento || {};
  const equipTags = datos.equipamiento_tags || {};
  const listaEquipos = EQUIPO.filter(function (e) {
    if (e.key === 'patron_vickers') {
      // Sólo si el checkbox está marcado Y hay un número de patrón.
      return !!(equipMarcado[e.key] && patronNum);
    }
    return !!equipMarcado[e.key];
  }).map(function (e) {
    if (e.key === 'patron_vickers') {
      var num = patronNum.replace(/^PMM-/i, '');
      return e.nombre + ' TAG N°PMM-' + num;
    }
    // Tag: override del usuario si cargó algo, si no el default del catálogo.
    var tag = (equipTags[e.key] || '').toString().trim() || e.tagDefault || '';
    if (!e.nombre) return e.label || ''; // fallback si algún día quedó legacy
    return tag ? (e.nombre + ' TAG N°' + tag) : e.nombre;
  }).filter(Boolean);

  // Equipos extra del catálogo (DB, agregados desde el form via equipamiento_extra)
  if (Array.isArray(datos.equipamiento_extra)) {
    datos.equipamiento_extra.forEach(function (e) {
      if (e && (e.nombre || e.label)) listaEquipos.push(e.nombre || e.label);
    });
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => listaEquipos.push(l));
  const equipSlots = {};
  for (let i = 1; i <= 7; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquipos[i - 1] || '__SECTION_HIDE__';
  }

  // ── Resultados (30 filas) ─────────────────────────────────────────────────
  // En modo mapa (mapa30/mapa45) ocultamos TODAS las filas de la tabla clásica
  // del template. El bloque de mapa se inserta como XML dinámico en el
  // post-proceso (ver insertarBloqueMapa más abajo).
  const modoMapa = datos.modo_mapa === 'mapa30' || datos.modo_mapa === 'mapa45' ? datos.modo_mapa : null;
  const mediciones = datos.mediciones || [];
  const resultados = {};
  for (let i = 1; i <= 30; i++) {
    if (modoMapa) {
      resultados[`resultado_${i}_impronta`] = '__HIDE__';
      resultados[`resultado_${i}_zona`]     = '';
      resultados[`resultado_${i}_dureza`]   = '';
    } else {
      const m = mediciones[i - 1] || {};
      resultados[`resultado_${i}_impronta`] = m.impronta != null && m.impronta !== '' ? String(m.impronta) : '__HIDE__';
      resultados[`resultado_${i}_zona`]     = m.zona     != null ? String(m.zona) : ''; // V3
      resultados[`resultado_${i}_dureza`]   = m.dureza   != null && m.dureza   !== '' ? String(m.dureza)   : '';
    }
  }

  // ── Nota / Evaluación / OAA ───────────────────────────────────────────────
  const lineasObs = [];
  if (datos.nota_conversion) lineasObs.push('Equivalencia de durezas según ASTM E140-12(2019) tabla *.');
  if (datos.tiene_nota && datos.nota_texto) lineasObs.push(datos.nota_texto);
  if (datos.tiene_evaluacion && datos.evaluacion_texto) lineasObs.push(datos.evaluacion_texto);
  const observaciones_linea = lineasObs.length ? lineasObs.join('\n') : '__SECTION_HIDE__';

  // W5: textos OAA se insertan como párrafos centrados en negrita antes de FIN DE INFORME
  const textosOAA = [];
  if (datos.oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  const templateData = {
    numero_ot:        nroOtBase,
    razon_social:     ot.razon_social       || '',
    fecha_generacion: ot.fecha_finalizacion || '',

    normas_seleccionadas_linea,
    metodologia_linea,
    tiempo_aplicacion_linea,
    espesor_probeta_linea,
    carga_aplicada_linea,
    temperatura_ensayo_linea,

    ...equipSlots,
    ...resultados,
    promedio_hv: datos.promedio_hv != null && datos.promedio_hv !== '' ? String(datos.promedio_hv) : '', // V2

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
  // ASTERISCO_TITULO_AUTO — agrega * al título del ensayo si está marcado fuera del alcance OAA
  if (datos.oaa) {
    // Estrategia 1: título en un solo <w:t>
    const tituloRe = /(<w:t[^>]*>)(DUREZAS VICKERS)(\*?)(\s*<\/w:t>)/;
    if (tituloRe.test(outXml)) {
      outXml = outXml.replace(tituloRe, function (m, pre, txt, ya, close) {
        return ya === '*' ? m : pre + txt + '*' + close;
      });
    }
  }


  // Reemplazar "HV **/15" con la escala real según carga
  const escalaHV = datos.carga_aplicada ? (CARGAS[String(datos.carga_aplicada)] || `HV ${datos.carga_aplicada}/15`) : 'HV';
  outXml = outXml.replace(/HV \*\*\/15/g, escalaHV);

  // Quitar todos los highlights (amarillo en normas y preinforme)
  outXml = outXml.replace(/<w:highlight[^/]*\/>/g, '');

  // Ocultar párrafo de preinforme si la OT no es preinforme
  if (!ot.es_preinforme) {
    outXml = ocultarParrafoConTexto(outXml, 'informe preliminar');
  }

  outXml = eliminarFilasOcultas(outXml);
  outXml = eliminarFilasVacias(outXml);
  outXml = fusionarZonasIguales(outXml);
  outXml = eliminarSeccionesOcultas(outXml);

  // Ocultar "EVALUACION DE RESULTADOS" cuando no hay contenido
  if (observaciones_linea === '__SECTION_HIDE__') {
    outXml = ocultarParrafoConTexto(outXml, 'EVALUACION DE RESULTADOS');
  } else {
    // Quitar el párrafo blank que el template tiene entre "EVALUACION DE
    // RESULTADOS" y el placeholder de observaciones (queda como un enter
    // extra que no debería estar).
    outXml = quitarBlankTrasEvaluacion(outXml);
  }

  // Preinforme: mantener o eliminar el párrafo final de disclaimer
  // (word-generator.js lo maneja via aplicarCambiosPreinforme — aquí solo limpiamos el highlight)

  outXml = centrarTabla(outXml);
  // Quitar la columna "Zona" de la tabla de durezas (el template físico la
  // trae hardcoded pero el form ya no la ofrece).
  outXml = quitarColumnaZonaVickers(outXml);
  outXml = forzarCalibri(outXml);

  // Imágenes del ensayo (mapas de durezas, etc.) — se insertan después del
  // caption de la tabla de resultados ("Tabla N°X – ...")
  const fotosEnsayo = Array.isArray(datos.imagenes_resultado)
    ? datos.imagenes_resultado.map(p => {
        if (!p) return null;
        const url = typeof p === 'string' ? p : p.dataUrl;
        if (!url) return null;
        const b64 = url.replace(/^data:[^;]+;base64,/, '');
        return { buffer: Buffer.from(b64, 'base64'), caption: p.caption || '', name: p.name || '' };
      }).filter(x => x && x.buffer)
    : [];
  if (fotosEnsayo.length > 0) {
    // Imágenes al FINAL del ensayo: antes de la línea OAA si existe, o antes
    // de "FIN DE INFORME" si no.
    outXml = insertarImagenesEnsayo(processedZip, outXml, fotosEnsayo,
      'vickers_resultado', ['Los ensayos marcados con', 'FIN DE INFORME'], 'before');
  }

  // Manejar imagen de carátula (solo si es primer ensayo y hay fotos)
  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'vickers');

  // Corregir N°Impronta → N° Impronta en encabezado de tabla
  outXml = outXml.replace(/N°Impronta/g, 'N° Impronta');

  // Normalizar indentación de evaluación (w:left="1560" → w:left="851" para alinear con el resto)
  outXml = outXml.replace(/w:left="1560"/g, 'w:left="851"');
  outXml = outXml.replace(/w:pos="1560"/g,  'w:pos="851"');

  // Bloque MAPA DE DUREZAS: si el ensayo es mapa30/mapa45, eliminar la tabla
  // clásica del template e insertar N tablas + gráfico N°53 (30 improntas) o
  // N°80 (45) + referencias, antes del texto de nota/OAA/FIN DE INFORME.
  if (modoMapa) {
    outXml = eliminarTablaVickersClasica(outXml);
    outXml = insertarBloqueMapaVickers(processedZip, outXml, datos, modoMapa);
  }

  outXml = eliminarParrafosVacios(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  outXml = minimizarUltimoParagrafo(outXml);

  // Actualizar headers y quitar espacio extra antes de "Fecha:"
  ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'].forEach(hdrPath => {
    const entry = processedZip.files[hdrPath];
    if (!entry) return;
    let hdrXml = entry.asText();
    hdrXml = hdrXml
      .replace(/\{\{razon_social\}\}/g,     templateData.razon_social)
      .replace(/\{\{numero_ot\}\}/g,        templateData.numero_ot)
      .replace(/\{\{fecha_generacion\}\}/g, templateData.fecha_generacion);
    // Quitar runs extras antes de "Fecha:" (mismo patrón que Brinell)
    hdrXml = hdrXml.replace(
      /(<w:tab\/>)<w:t xml:space="preserve">  <\/w:t><\/w:r>(<w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:tab\/>)(<\/w:r>)((?:<w:bookmarkStart[^\/]*\/>|<w:bookmarkEnd[^\/]*\/>)*)(<w:r[^>]*>[\s\S]*?<w:t[^>]*>Fecha:)/,
      '$1</w:r>$4$5'
    );
    processedZip.file(hdrPath, hdrXml);
  });

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones ───────────────────────────────────────────────────

function eliminarFilasOcultas(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row =>
    /__HIDE__(?!_)/.test(row) ? '' : row
  );
}

function eliminarFilasVacias(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    const cells = [...row.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)];
    if (cells.length < 2) return row;
    const hasValue = cells.slice(1).some(c => {
      const texts = [...c[1].matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map(m => m[1].trim());
      return texts.some(t => t.length > 0);
    });
    return hasValue ? row : '';
  });
}

// ── Fusión vertical de celdas Zona con valor coincidente ─────────────────────
// Cuando varias improntas consecutivas comparten la misma zona (o las filas
// siguientes dejan la zona vacía como continuación), el informe real fusiona
// verticalmente la celda. Aplica <w:vMerge w:val="restart"/> a la primera
// celda del grupo y <w:vMerge/> a las continuaciones (con texto vaciado).
function fusionarZonasIguales(xml) {
  const inyectarTcPr = (cell, frag) => {
    if (cell.includes('<w:vMerge')) return cell;        // ya fusionada
    if (cell.includes('<w:tcPr>')) {
      // No duplicar vAlign si ya existe
      const fragSafe = cell.includes('<w:vAlign')
        ? frag.replace(/<w:vAlign[^/]*\/>/, '')
        : frag;
      return cell.replace('<w:tcPr>', '<w:tcPr>' + fragSafe);
    }
    return cell.replace(/(<w:tc\b[^>]*>)/, `$1<w:tcPr>${frag}</w:tcPr>`);
  };

  return xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tbl => {
    if (!tbl.includes('Impronta')) return tbl;          // solo tabla de resultados Vickers

    const rows = [...tbl.matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)].map(m => m[0]);
    if (rows.length < 3) return tbl;

    const info = rows.map(r => {
      const cells = [...r.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map(c => c[0]);
      const texts = cells.map(c =>
        [...c.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim());
      return { cells, texts };
    });

    // Agrupar filas de datos por zona coincidente/continuación
    const groups = [];
    let current = null;
    for (let i = 1; i < rows.length; i++) {            // saltear header (fila 0)
      const { cells, texts } = info[i];
      if (cells.length < 3) { current = null; continue; }      // Promedio (gridSpan)
      if (/Promedio/i.test(texts[0])) { current = null; continue; }
      const zona = texts[1];
      if (zona && (!current || zona !== current.text)) {
        current = { members: [i], text: zona };
        groups.push(current);
      } else if (current && (zona === '' || zona === current.text)) {
        current.members.push(i);
      } else {
        current = null;
      }
    }

    const merges = groups.filter(g => g.members.length > 1);
    if (!merges.length) return tbl;

    const newRows = rows.slice();
    merges.forEach(g => {
      g.members.forEach((ri, k) => {
        const row = newRows[ri];
        const cells = [...row.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map(c => c[0]);
        const cell = cells[1];
        let newCell;
        if (k === 0) {
          newCell = inyectarTcPr(cell, '<w:vMerge w:val="restart"/><w:vAlign w:val="center"/>');
        } else {
          newCell = inyectarTcPr(cell, '<w:vMerge/>');
          newCell = newCell.replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/g, '$1$2');  // vaciar texto duplicado
        }
        newRows[ri] = row.replace(cell, newCell);
      });
    });

    let idx = 0;
    return tbl.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, () => newRows[idx++]);
  });
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
    let removeFrom = pOpen, cursor = pOpen;
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

function ocultarParrafoConTexto(xml, texto) {
  let result = xml, searchPos = 0;
  while (true) {
    const idx = result.indexOf(texto, searchPos);
    if (idx < 0) break;
    const pOpen = scanBackForTag(result, '<w:p', idx);
    if (pOpen < 0) { searchPos = idx + texto.length; continue; }
    const pClose = result.indexOf('</w:p>', idx);
    if (pClose < 0) { searchPos = idx + texto.length; continue; }
    result = result.slice(0, pOpen) + result.slice(pClose + '</w:p>'.length);
  }
  return result;
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

  const markerPos = xml.indexOf('__IMAGE_CARATULA__');
  if (markerPos < 0) return xml;
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const pOpen = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;
  return xml.slice(0, pOpen) +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr><w:r>${drawing}</w:r></w:p>` +
    xml.slice(pClose + '</w:p>'.length);
}

function eliminarImagenVacia(xml) {
  const markerPos = xml.indexOf('__IMAGE_NONE__');
  if (markerPos < 0) return xml;
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const imgEnd = pClose + '</w:p>'.length;
  const pOpen  = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;
  // También eliminar el párrafo siguiente (epígrafe)
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

function ajustarEspaciado(xml) {
  const LANDMARKS = [
    { texto: 'CONDICIONES DE ENSAYO',         blancos: 0 },
    { texto: 'Metodología de ensayo: ITM',     blancos: 0 }, // quitar blank entre norma e ITM
    { texto: 'EQUIPAMIENTO UTILIZADO',         blancos: 1 },
    { texto: 'RESULTADOS OBTENIDOS',           blancos: 1 },
    { texto: 'EVALUACION DE',                  blancos: 1 },
    { texto: 'NOTA',                           blancos: 1 },
    { texto: 'FIN DE INFORME',                 blancos: 1 },
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

// Quita el párrafo en blanco que el template tiene entre "EVALUACION DE
// RESULTADOS" y el placeholder de observaciones (genera un enter extra que
// el usuario no quiere).
function quitarBlankTrasEvaluacion(xml) {
  const idx = xml.indexOf('EVALUACION DE RESULTADOS');
  if (idx < 0) return xml;
  // Encontrar el cierre del párrafo de EVALUACION
  const pClose = xml.indexOf('</w:p>', idx);
  if (pClose < 0) return xml;
  let cursor = pClose + '</w:p>'.length;
  // Saltear cualquier whitespace
  while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;
  // ¿El siguiente párrafo es blank (sin texto visible)?
  const re = /^<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/;
  const m = xml.slice(cursor).match(re);
  if (!m) return xml;
  const visible = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('').trim();
  if (visible) return xml; // no es blank — no tocar
  return xml.slice(0, cursor) + xml.slice(cursor + m[0].length);
}

// Elimina la 2da columna (Zona) de la tabla principal de Vickers. Detecta la
// tabla por contener "Zona" en su header. Quita la 2da <w:tc> de cada <w:tr>
// y el 2do <w:gridCol> del <w:tblGrid>.
function quitarColumnaZonaVickers(xml) {
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tabla => {
    // Solo la tabla que tiene "Zona" como header (descarta otras tablas)
    if (!/<w:t[^>]*>\s*Zona\s*<\/w:t>/.test(tabla)) return tabla;
    // 1. Quitar 2do <w:gridCol>
    const gridColRe = /(<w:tblGrid>\s*<w:gridCol\b[^/]*\/>\s*)<w:gridCol\b[^/]*\/>/;
    let result = tabla.replace(gridColRe, '$1');
    // 2. En cada fila <w:tr>, quitar la 2da celda <w:tc>...</w:tc>
    result = result.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, fila => {
      const tcRe = /<w:tc\b[\s\S]*?<\/w:tc>/g;
      const tcs = [...fila.matchAll(tcRe)].map(m => m[0]);
      if (tcs.length < 2) return fila;
      const open = fila.match(/<w:tr\b[^>]*>/)[0];
      const trProps = fila.match(/<w:tr\b[^>]*><w:trPr>[\s\S]*?<\/w:trPr>/);
      const head = trProps ? trProps[0] : open;
      // Reconstruir la fila sin la 2da celda
      const cellsKeep = [tcs[0]].concat(tcs.slice(2));
      return head + cellsKeep.join('') + '</w:tr>';
    });
    return result;
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
  // Reemplazar/agregar w:spacing dentro de cada <w:pPr> existente
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

// ── Bloque MAPA DE DUREZAS (mapa30 / mapa45) ─────────────────────────────────
// Inserta N tablas (2 o 3) de 15 improntas con zonas fijas (Metal Base ×3,
// Z.A.C. ×3, SOLD. ×3, Z.A.C. ×3, Metal Base ×3), la imagen del gráfico
// (N°53 o N°80) y la línea de referencias, antes del párrafo de FIN DE INFORME.
const MAPA_ZONAS_POR_TABLA = [
  { zona: 'Metal Base', filas: 3 },
  { zona: 'Z.A.C.',     filas: 3 },
  { zona: 'SOLD.',      filas: 3 },
  { zona: 'Z.A.C.',     filas: 3 },
  { zona: 'Metal Base', filas: 3 },
];
const MAPA_LADOS_DEFAULT = {
  mapa30: ['Cara', 'Raíz'],
  mapa45: ['Cara Superior', 'Medio', 'Cara Inferior'],
};

function insertarBloqueMapaVickers(processedZip, outXml, datos, modoMapa) {
  const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const cantTablas = modoMapa === 'mapa45' ? 3 : 2;
  const improntasHV = Array.isArray(datos.mapa_improntas_hv) ? datos.mapa_improntas_hv : [];
  const lados = Array.isArray(datos.mapa_lados) ? datos.mapa_lados.slice() : [];
  const defaults = MAPA_LADOS_DEFAULT[modoMapa] || [];
  for (let i = 0; i < cantTablas; i++) if (!lados[i]) lados[i] = defaults[i] || ('Lado ' + (i + 1));

  // Carga (HV X/T) — X = kgf, T = tiempo de aplicación (default 15 s).
  // Se acepta cualquier número (0.1, 0.3, 1, 5, 15, 50, 100…), formato coma o
  // punto. Se extrae el número del string (tolera "15", "15 kgf", "0,5 Kgf").
  const cargaRawInput = String(datos.carga_aplicada || '').trim();
  const numMatch = cargaRawInput.replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)/);
  const cargaNum = numMatch ? numMatch[1] : '';
  // Salida con coma (convención del laboratorio para decimales españoles).
  const cargaFmt = cargaNum ? cargaNum.replace('.', ',') : '**';
  const tiempoRaw = String(datos.tiempo_aplicacion != null ? datos.tiempo_aplicacion : 15).trim();
  const tiempoFmt = /^\d+(?:\.\d+)?$/.test(tiempoRaw) ? tiempoRaw : '15';
  const hvLabel = 'HV ' + cargaFmt + '/' + tiempoFmt;

  function pLinea(texto, opts) {
    opts = opts || {};
    const b = opts.bold ? '<w:b/><w:bCs/>' : '';
    const jc = opts.center ? '<w:jc w:val="center"/>' : '';
    const ind = opts.noInd ? '' : '<w:ind w:left="851"/>';
    return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      ind + jc + '</w:pPr>' +
      `<w:r><w:rPr>${FONTS}${b}${SZ}</w:rPr>` +
      `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
  }

  // Celda de tabla — bordes finos negros, texto centrado.
  function celda(texto, ancho, opts) {
    opts = opts || {};
    const bold = opts.header ? '<w:b/><w:bCs/>' : '';
    const fill = opts.header ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : '';
    const vMerge = opts.vMerge === 'restart' ? '<w:vMerge w:val="restart"/>'
                : opts.vMerge === 'continue' ? '<w:vMerge/>' : '';
    const BORD = '<w:tcBorders>' +
      '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';
    const contenido = opts.vMerge === 'continue'
      ? '<w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>'
      : `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
        `<w:r><w:rPr>${FONTS}${bold}${SZ}</w:rPr><w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
    return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${BORD}${fill}${vMerge}<w:vAlign w:val="center"/></w:tcPr>${contenido}</w:tc>`;
  }

  function construirTabla(iTabla, numTabla) {
    const baseImpronta = iTabla * 15;
    // Columna "Lado" (vMerge sobre las 15 filas) + Ubicación + N° + HV
    const W_LADO = 1800, W_UB = 2200, W_N = 1400, W_HV = 2200;
    const grid = '<w:tblGrid>' +
      `<w:gridCol w:w="${W_LADO}"/><w:gridCol w:w="${W_UB}"/>` +
      `<w:gridCol w:w="${W_N}"/><w:gridCol w:w="${W_HV}"/></w:tblGrid>`;
    const total = W_LADO + W_UB + W_N + W_HV;

    const filas = [];
    let absIdx = 0;
    MAPA_ZONAS_POR_TABLA.forEach(sec => {
      for (let k = 0; k < sec.filas; k++) {
        const n = baseImpronta + absIdx + 1;
        const hv = improntasHV[baseImpronta + absIdx] || '';
        let vmZona = null;
        if (sec.filas > 1) vmZona = (k === 0) ? 'restart' : 'continue';
        // Columna Lado: vMerge en TODAS las 15 filas (restart en la primera).
        const vmLado = absIdx === 0 ? 'restart' : 'continue';
        const celdas = [
          celda(absIdx === 0 ? 'Lado ' + lados[iTabla] : '', W_LADO, { vMerge: vmLado, header: true }),
          celda(k === 0 ? sec.zona : '', W_UB, { vMerge: vmZona }),
          celda(String(n), W_N),
          celda(hv, W_HV),
        ];
        filas.push('<w:tr>' + celdas.join('') + '</w:tr>');
        absIdx++;
      }
    });

    // Header — la columna Lado queda vacía en el header (arranca su vMerge
    // recién en la primera fila de datos).
    const header = '<w:tr>' +
      celda('', W_LADO, { header: true }) +
      celda('Ubicación', W_UB, { header: true }) +
      celda('N° Impronta', W_N, { header: true }) +
      celda('Dureza ' + hvLabel, W_HV, { header: true }) +
      '</w:tr>';

    const tabla = '<w:tbl>' +
      '<w:tblPr>' +
      `<w:tblW w:w="${total}" w:type="dxa"/>` +
      '<w:jc w:val="center"/>' +
      '<w:tblBorders>' +
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
      '</w:tblBorders></w:tblPr>' +
      grid + header + filas.join('') +
      '</w:tbl>';

    // Caption debajo (nada arriba — el "Lado" va dentro de la tabla).
    // Uso spacing before/after para separar de la tabla y de la próxima —
    // más robusto que párrafos blank (que eliminarParrafosVacios podría borrar).
    const captionSpacing = '<w:p><w:pPr>' +
      '<w:spacing w:line="276" w:lineRule="auto" w:before="0" w:after="480"/>' +
      '<w:jc w:val="center"/></w:pPr>' +
      `<w:r><w:rPr>${FONTS}${SZ}</w:rPr>` +
      `<w:t xml:space="preserve">Tabla N°${numTabla} - Resultados ensayo de dureza</w:t></w:r></w:p>`;
    return tabla + captionSpacing;
  }

  // Párrafo con líneas separadas por <w:br/> (line breaks blandos, sin saltos
  // de párrafo). Usado para las 4 referencias que van compactas.
  function pMultiLinea(lineas, opts) {
    opts = opts || {};
    const jc = opts.center ? '<w:jc w:val="center"/>' : '';
    const ind = opts.noInd ? '' : '<w:ind w:left="851"/>';
    const runs = lineas.map((l, i) =>
      `<w:r><w:rPr>${FONTS}${SZ}</w:rPr>` +
      (i > 0 ? '<w:br/>' : '') +
      `<w:t xml:space="preserve">${esc(l)}</w:t></w:r>`
    ).join('');
    return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      ind + jc + '</w:pPr>' + runs + '</w:p>';
  }

  let bloque = '';
  for (let t = 0; t < cantTablas; t++) {
    bloque += construirTabla(t, t + 1);
  }

  // ─ Bloque del gráfico: SOLO imagen + referencias + Figura N°1 ─
  // (sin "Gráfico N°XX" arriba — el usuario prefiere no incluirlo.)
  const MARKER_IMG = '__VK_MAPA_IMG__';
  bloque += pLinea(MARKER_IMG);
  // Referencias + "Figura N°1" apiladas en UN SOLO párrafo con <w:br/> — así
  // Word no inserta espacio visual entre líneas (evita el enter extra arriba
  // de "Figura N°1").
  bloque += pMultiLinea([
    't = Espesor del material base',
    'M.B. = Metal base',
    'Z.A.C. = Zona afectada por el calor',
    'SOLD = Soldadura',
    'Figura N°1 - Esquema con ubicación de improntas - Mapa de durezas',
  ], { center: true });

  // Insertar el bloque justo antes de "NOTA" si existe, sino antes de "FIN DE INFORME".
  const refPos = (() => {
    const p1 = outXml.indexOf('NOTA');
    if (p1 >= 0) return p1;
    const p2 = outXml.indexOf('FIN DE INFORME');
    return p2 >= 0 ? p2 : -1;
  })();
  if (refPos < 0) return outXml;
  const pStart = scanBackForTag(outXml, '<w:p', refPos);
  if (pStart < 0) return outXml;
  outXml = outXml.slice(0, pStart) + bloque + outXml.slice(pStart);

  // Cargar imagen del asset y reemplazar el marker por <w:drawing>.
  try {
    const imgPath = path.join(__dirname, '..', 'assets',
      modoMapa === 'mapa45' ? 'vickers-mapa-45.png' : 'vickers-mapa-30.png');
    const buf = fs.readFileSync(imgPath);
    outXml = insertarImagenesEnsayo(
      processedZip, outXml,
      [{ buffer: buf, caption: '', name: 'grafico_mapa.png' }],
      'vickers_mapa', MARKER_IMG, 'after', 300,
      { layout: 'vertical', maxAnchoCm: 15, maxAltoCm: 10, sinCaption: true }
    );
    // Limpiar el párrafo del marker (queda vacío tras la inserción).
    outXml = outXml.replace(new RegExp('<w:p\\b[^>]*>(?:(?!<w:p\\b)[\\s\\S])*?' + MARKER_IMG + '(?:(?!</w:p>)[\\s\\S])*?</w:p>', 'g'), '');
    // Colapsar los PBLANK (párrafos con solo `⁠` U+2060 o vacíos) que estén
    // inmediatamente ANTES del párrafo con "t = Espesor". Buscamos "t = Espesor"
    // y removemos los <w:p> vacíos que lo preceden hasta llegar a un párrafo
    // no vacío (típicamente el </w:drawing>).
    const tEspIdx = outXml.indexOf('t = Espesor');
    if (tEspIdx >= 0) {
      const tPStart = outXml.lastIndexOf('<w:p', tEspIdx);
      if (tPStart >= 0) {
        // Recorrer hacia atrás desde tPStart, borrando párrafos vacíos.
        let cursor = tPStart;
        let borrarHasta = tPStart;
        while (true) {
          const close = outXml.lastIndexOf('</w:p>', cursor - 1);
          if (close < 0) break;
          const open = outXml.lastIndexOf('<w:p', close);
          if (open < 0 || open >= close) break;
          const para = outXml.slice(open, close + '</w:p>'.length);
          const txts = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('').replace(/[\s⁠]/g, '');
          const tieneDrawing = /<w:drawing\b/.test(para);
          if (tieneDrawing) break; // no borrar el párrafo con la imagen
          if (txts) break; // hay texto real, parar
          borrarHasta = open;
          cursor = open;
        }
        if (borrarHasta < tPStart) {
          outXml = outXml.slice(0, borrarHasta) + outXml.slice(tPStart);
        }
      }
    }
  } catch (e) {
    console.warn('[vickers-mapa] no se pudo insertar la imagen del gráfico:', e.message);
    // Fallback: solo limpiar el marker.
    outXml = outXml.replace(new RegExp(MARKER_IMG, 'g'), '');
  }
  return outXml;
}

// En modo mapa la tabla original del template queda vacía porque todos los
// `resultado_N_impronta` son __HIDE__. eliminarFilasOcultas borra las filas
// de datos pero deja el header residual. Esta función elimina la <w:tbl>
// completa cuyo header contiene "N° Impronta" + "Dureza HV" (la del template),
// y también el párrafo caption "Tabla N°X - Resultados..." que quedó
// huérfano (viene ANTES o DESPUÉS de la tabla en el template).
function eliminarTablaVickersClasica(xml) {
  // Regex para encontrar la <w:tbl> a borrar. Usamos exec para manejar
  // párrafos huérfanos antes/después.
  const RX_TABLA = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  const RX_CAPTION = /^<w:p\b[^>]*>[\s\S]*?<\/w:p>$/;
  const posMatches = [];
  let m;
  while ((m = RX_TABLA.exec(xml)) !== null) {
    const tbl = m[0];
    const textos = [...tbl.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join(' ');
    if (!/N[°˚º]?\s*Impronta[\s\S]{0,200}Dureza\s*HV/i.test(textos)) continue;
    // Descartar tablas del bloque MAPA (esas se insertan DESPUÉS de esta
    // función pero por si acaso).
    if (/Metal Base[\s\S]{0,80}Z\.A\.C\./i.test(textos)) continue;
    posMatches.push({ start: m.index, end: m.index + tbl.length });
  }
  if (posMatches.length === 0) return xml;

  function borrarCaptionEn(before, direction /* 'up'|'down' */) {
    // Buscar el <w:p> inmediatamente adyacente y borrarlo si es un caption
    // "Tabla N°X - Resultados ...".
    if (direction === 'up') {
      // Ir hacia atrás: buscar </w:p> más cercano y su <w:p> match.
      const close = xml.lastIndexOf('</w:p>', before - 1);
      if (close < 0) return null;
      const open = xml.lastIndexOf('<w:p', close);
      if (open < 0) return null;
      const para = xml.slice(open, close + '</w:p>'.length);
      const txt = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join(' ');
      // Aceptar ° (00B0), ˚ (02DA), º (00BA) — el template usa ˚.
      if (/Tabla\s*N\s*[°˚º]\s*\d+\s*[-–—]\s*Resultados/i.test(txt)) {
        return { start: open, end: close + '</w:p>'.length };
      }
      return null;
    } else {
      // Ir hacia adelante: buscar <w:p ...> más cercano.
      const open = xml.indexOf('<w:p', before);
      if (open < 0) return null;
      // Verificar que sea un tag <w:p>, no <w:pPr>.
      const c = xml[open + 4];
      if (c !== '>' && c !== ' ' && c !== '\r' && c !== '\n') return null;
      const close = xml.indexOf('</w:p>', open);
      if (close < 0) return null;
      const para = xml.slice(open, close + '</w:p>'.length);
      const txt = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join(' ');
      // Aceptar ° (00B0), ˚ (02DA), º (00BA) — el template usa ˚.
      if (/Tabla\s*N\s*[°˚º]\s*\d+\s*[-–—]\s*Resultados/i.test(txt)) {
        return { start: open, end: close + '</w:p>'.length };
      }
      return null;
    }
  }

  // Recolectar todos los rangos a eliminar (tabla + captions adyacentes).
  const rangos = [];
  posMatches.forEach(t => {
    const capArriba = borrarCaptionEn(t.start, 'up');
    const capAbajo  = borrarCaptionEn(t.end, 'down');
    rangos.push(t);
    if (capArriba) rangos.push(capArriba);
    if (capAbajo)  rangos.push(capAbajo);
  });
  // Ordenar por start desc para borrar sin desalinear los offsets.
  rangos.sort((a, b) => b.start - a.start);
  let out = xml;
  rangos.forEach(r => { out = out.slice(0, r.start) + out.slice(r.end); });
  return out;
}

module.exports = { generarVickersDesdeTemplate };
