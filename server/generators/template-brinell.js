const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/dureza-brinell.docx');

// Normas: cada una tiene un año opcional (datos.<key>_year). Si se carga, se
// usa como sufijo con guión (ISO usa ":YYYY"). Si no, cae al año default.
const NORMAS = [
  { key: 'norma_astm_e10', base: 'ASTM E10',    sep: '-', yearDefault: '23'   },
  { key: 'norma_iso6506',  base: 'ISO 6506-1',  sep: ':', yearDefault: '2014' },
];

// Equipamiento dinámico slots 1-5. Slot 1 ahora es seleccionable (típicamente
// Durómetro Petri MM-170 en CABA o Shimadzu MM-151 en Neuquén).
// El TAG se toma de datos.equipamiento_tags[key] si está seteado (editable en
// el form); si no, cae al `tagDefault`.
const EQUIPO = [
  { key: 'petri_170',         nombre: 'Durómetro Petri',              tagDefault: 'MM-170' },
  { key: 'shimadzu_151',      nombre: 'Máquina de tracción Shimadzu', tagDefault: 'MM-151' },
  { key: 'calibre_571',       nombre: 'Calibre digital',              tagDefault: 'MM-571' },
  { key: 'calibre_cal570',    nombre: 'Calibre digital',              tagDefault: 'CAL-570' },
  { key: 'calibre_694',       nombre: 'Calibre digital',              tagDefault: 'MM-694' },
  { key: 'registrador_545',   nombre: 'Registrador de temperatura',   tagDefault: 'PCAL-545' },
  { key: 'registrador_702',   nombre: 'Registrador de temperatura',   tagDefault: 'MM-702' },
  { key: 'termohigro_701',    nombre: 'Termohigrómetro',              tagDefault: 'MM-701' },
  { key: 'termohigro_794',    nombre: 'Termohigrómetro',              tagDefault: 'MM-794' },
  { key: 'proyector_165',     nombre: 'Proyector de perfiles',        tagDefault: 'MM-165' },
  { key: 'microscopio_173',   nombre: 'Microscopio de medición',      tagDefault: 'MM-173' },
];

// Equipamiento válido por variante (filtra los que aparecen en cada sede).
const EQUIPOS_POR_VARIANTE = {
  estandar: ['petri_170', 'calibre_571', 'calibre_cal570', 'registrador_545', 'registrador_702', 'termohigro_701', 'proyector_165', 'microscopio_173'],
  neuquen:  ['shimadzu_151', 'calibre_694', 'termohigro_794'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Generador principal ───────────────────────────────────────────────────────

function generarBrinellDesdeTemplate(ot, datos, fotosCaratula) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  const equipo = datos.equipamiento || {};

  // ── Condiciones de ensayo ─────────────────────────────────────────────────
  const normas = NORMAS.filter(n => datos[n.key]).map(n => {
    const yr = String(datos[n.key + '_year'] || '').trim() || n.yearDefault;
    return `Norma de ensayo: ${n.base}${n.sep}${yr}`;
  });
  if (!normas.length) normas.push('Norma de ensayo: ASTM E10-23');
  const normas_seleccionadas_linea = normas.join('\n');

  const metodologia_linea = datos.metodologia
    ? `Metodología de ensayo: ${datos.metodologia}`
    : 'Metodología de ensayo: ITM N˚059';

  const espesor_probeta_linea = datos.espesor_probeta
    ? `Espesor de probeta: ${datos.espesor_probeta} mm`
    : '__SECTION_HIDE__';

  const partesBolilla = [];
  if (datos.bolilla_diametro)  partesBolilla.push(`Bolilla ø: ${datos.bolilla_diametro} mm`);
  if (datos.diametro_impronta) partesBolilla.push(`Diámetro de impronta: ${datos.diametro_impronta} mm`);
  const bolilla_diametro_linea = partesBolilla.length
    ? partesBolilla.join('\n')
    : '__SECTION_HIDE__';

  const carga_aplicada_linea = datos.carga_aplicada
    ? `Carga aplicada: ${datos.carga_aplicada} Kgf`
    : '__SECTION_HIDE__';

  const tiempo_aplicacion_linea = datos.tiempo_aplicacion != null && datos.tiempo_aplicacion !== ''
    ? `Tiempo de aplicación: ${String(datos.tiempo_aplicacion).trim()} s`
    : 'Tiempo de aplicación: 15 s';

  const zona_ensayo_linea = datos.zona_ensayo
    ? `Zona de impronta: ${datos.zona_ensayo}`
    : '__SECTION_HIDE__';

  const muestra_ensayada_linea = datos.muestra_ensayada
    ? `Muestra ensayada: ${datos.muestra_ensayada}`
    : '__SECTION_HIDE__';

  let temperatura_ensayo_linea = '__SECTION_HIDE__';
  if (datos.temperatura !== '' && datos.temperatura != null) {
    temperatura_ensayo_linea = `Temperatura de ensayo: ${datos.temperatura}˚C`;
  }

  // ── Equipamiento dinámico (slots 1–5) ────────────────────────────────────
  // Filtramos por la variante activa para evitar arrastrar equipos del estándar
  // si el usuario los dejó tildados al cambiar a Neuquén (o viceversa).
  // El TAG se toma de datos.equipamiento_tags[key] si el usuario lo editó;
  // sino se usa el tagDefault del catálogo.
  const variante = datos.variante === 'neuquen' ? 'neuquen' : 'estandar';
  const equiposVar = EQUIPOS_POR_VARIANTE[variante];
  const tagsUsuario = datos.equipamiento_tags || {};
  const listaEquipos = EQUIPO
    .filter(e => equipo[e.key] && equiposVar.includes(e.key))
    .map(e => {
      const tag = String(tagsUsuario[e.key] || '').trim() || e.tagDefault;
      return `${e.nombre} TAG N˚${tag}`;
    });

  // Equipos extra del catálogo (DB, agregados desde el form via equipamiento_extra)
  if (Array.isArray(datos.equipamiento_extra)) {
    datos.equipamiento_extra.forEach(function (e) {
      if (e && (e.nombre || e.label)) listaEquipos.push(e.nombre || e.label);
    });
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => listaEquipos.push(l));
  // Filtro de seguridad: si el técnico agregó un "Patrón utilizado …" o algo
  // con "PMM-" en OtrosEquipos / equipamiento_extra, lo sacamos de la lista de
  // slots — el patrón se emite SIEMPRE en la última línea del bloque
  // "EQUIPAMIENTO UTILIZADO" del template (línea "Patrón utilizado TAG N°PMM-…"),
  // y no debe duplicarse ni aparecer antes de otros equipos.
  const listaEquiposFiltrada = listaEquipos.filter(l => {
    const s = String(l || '').toLowerCase();
    if (/patr[oó]n\s+utilizado/i.test(s)) return false;
    if (/\bpmm\s*[-–]/i.test(s)) return false;
    return true;
  });
  const equipSlots = {};
  for (let i = 1; i <= 5; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquiposFiltrada[i - 1] || '__SECTION_HIDE__';
  }

  // ── Resultados: hasta 6 filas con dureza; impronta se autonumera (1..N) ──
  // Columnas opcionales (ordenadas) que pueden aparecer entre Impronta y Dureza:
  //   Zona, Espesor (mm), Ø Impronta (mm).
  // La PRIMERA columna opcional activa ocupa el slot del medio del template
  // (placeholder `resultado_N_zona`). Las siguientes se insertan en post-proceso.
  const mediciones = (datos.mediciones || []).filter(m => m && m.dureza != null && String(m.dureza).trim() !== '');
  const COLS_OPC = [];
  if (datos.incluir_zona)               COLS_OPC.push({ key: 'zona',              label: 'Zona' });
  if (datos.incluir_espesor)            COLS_OPC.push({ key: 'espesor',           label: 'Espesor (mm)' });
  if (datos.incluir_diametro_impronta)  COLS_OPC.push({ key: 'diametro_impronta', label: 'Ø Impronta (mm)' });
  const colMedio = COLS_OPC[0] || null;   // ocupa el slot del template
  const colsExtra = COLS_OPC.slice(1);    // se insertan como columnas adicionales
  const resultados = {};
  for (let i = 1; i <= 6; i++) {
    const m = mediciones[i - 1];
    if (m) {
      resultados[`resultado_${i}_impronta`] = String(i);
      resultados[`resultado_${i}_zona`]     = colMedio ? String(m[colMedio.key] ?? '').trim() : '';
      resultados[`resultado_${i}_dureza`]   = String(m.dureza).trim();
    } else {
      resultados[`resultado_${i}_impronta`] = '__HIDE__';
      resultados[`resultado_${i}_zona`]     = '';
      resultados[`resultado_${i}_dureza`]   = '';
    }
  }

  // Promedio automático (si no viene precalculado)
  let promedio_hb = '';
  if (datos.promedio_hb != null && datos.promedio_hb !== '') {
    promedio_hb = String(datos.promedio_hb);
  } else if (mediciones.length > 0) {
    const nums = mediciones.map(m => Number(m.dureza)).filter(n => !isNaN(n));
    if (nums.length > 0) {
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      promedio_hb = String(Math.round(avg));
    }
  }

  // ── NOTA (texto libre ingresado por el técnico) ───────────────────────────
  const notaActiva = datos.tiene_nota !== false && (datos.nota_texto || '').trim();
  const observaciones_linea = notaActiva ? (datos.nota_texto || '').trim() : '__SECTION_HIDE__';
  const mostrarNota = observaciones_linea !== '__SECTION_HIDE__';

  // ── Evaluación de resultados (bloque opcional antes de FIN DE INFORME) ──
  // Se activa cuando hay texto en `evaluacion_texto`. Solo se oculta si el
  // usuario setea explícitamente `tiene_evaluacion: false`.
  const evaluacionActiva = (datos.evaluacion_texto || '').trim() && datos.tiene_evaluacion !== false;
  const evaluacionTexto = evaluacionActiva ? datos.evaluacion_texto.trim() : '';

  // ── Imagen ────────────────────────────────────────────────────────────────
  // Multi-imagen vía helper en post-proceso. Mantenemos el marcador para que
  // docxtemplater no falle al renderizar.
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
    bolilla_diametro_linea,
    carga_aplicada_linea,
    tiempo_aplicacion_linea,
    zona_ensayo_linea,
    muestra_ensayada_linea,
    temperatura_ensayo_linea,

    ...equipSlots,
    ...resultados,
    promedio_hb,

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

  // (El reemplazo de Petri MM-170 → Shimadzu MM-151 para Neuquén ya no es
  // necesario: el slot 1 ahora es seleccionable vía equipamiento_1.)

  // Metodología: el template tiene hardcodeado "ITM N˚059". Si el usuario eligió otro
  // número de ITM (en datos.metodologia, ej "ITM N°060" o solo "060"), reemplazamos.
  if (datos.metodologia) {
    const m = String(datos.metodologia).match(/(\d{2,4})/);
    if (m && m[1] !== '059') {
      outXml = outXml.replace(/(<w:t[^>]*>)059(<\/w:t>)/, `$1${m[1]}$2`);
    }
  }

  // Tiempo de aplicación: hardcodeado como "15" en el template. Si el usuario cambió
  // (datos.tiempo_aplicacion ≠ 15), reemplazamos el run "<w:t>15</w:t>" cercano a
  // "Tiempo de aplicación".
  if (datos.tiempo_aplicacion != null && datos.tiempo_aplicacion !== '' && String(datos.tiempo_aplicacion).trim() !== '15') {
    const t = String(datos.tiempo_aplicacion).trim();
    outXml = outXml.replace(
      /(Tiempo de aplicación[\s\S]{0,300}?<w:t[^>]*>)15(<\/w:t>)/,
      `$1${t}$2`
    );
  }

  // Patrón: si viene el dato reemplaza los ***, si no elimina toda la línea.
  // El usuario puede ingresar solo el número (ej "716") o el TAG completo.
  // Prioridad: `patron_tag` (form nuevo, autoritativo si está seteado, aunque
  // sea string vacío). Si no está, cae al legacy `patron`. Si el legacy es
  // exactamente '716' Y no hay patron_tag, se considera residuo del default
  // legacy del schema y se ignora — evita emitir "PMM-716" en OTs viejos.
  let patronRaw = '';
  if (Object.prototype.hasOwnProperty.call(datos, 'patron_tag')) {
    patronRaw = String(datos.patron_tag || '').trim();
  } else {
    const legacy = String(datos.patron || '').trim();
    if (legacy && legacy !== '716') patronRaw = legacy;
  }
  if (patronRaw) {
    const p = patronRaw.replace(/^PMM-/i, '');
    outXml = outXml.replace(/PMM-\*\*\*/g, `PMM-${p}`);
  } else {
    outXml = ocultarParrafoConTexto(outXml, 'PMM-***');
  }

  // OAA: si el ensayo está marcado fuera del alcance, agregar "*" al título
  if (datos.oaa) {
    outXml = outXml.replace(
      /(<w:t[^>]*>ENSAYO DE DUREZA BRINELL)(\s*)(<\/w:t>)/,
      '$1*$2$3'
    );
  }

  // Quitar highlight de cualquier texto (cyan en OAA, gris en "Tiempo de aplicación", etc.)
  outXml = outXml.replace(/<w:highlight[^/]*\/>/g, '');
  // Quitar shading (fondo gris en celdas o párrafos del template)
  outXml = outXml.replace(/<w:shd w:val="clear"[^/]*\/>/g, '');

  outXml = eliminarFilasOcultas(outXml);
  outXml = eliminarFilasVacias(outXml);
  outXml = eliminarSeccionesOcultas(outXml);
  outXml = convertirNumberingATexto(outXml);

  // Ocultar heading NOTA cuando no hay texto de nota
  if (!mostrarNota) outXml = ocultarParrafoConTexto(outXml, 'NOTA');

  // Columnas opcionales: la PRIMERA va al slot del medio del template; el resto
  // se inserta como columnas extra antes de la columna Dureza.
  if (!colMedio) {
    outXml = eliminarColumnaZonaBrinell(outXml);
  } else {
    outXml = setearHeaderColumnaMedioBrinell(outXml, colMedio.label);
    for (const col of colsExtra) {
      outXml = agregarColumnaExtraBrinell(outXml, mediciones, col.label, col.key);
    }
  }

  // El texto OAA del template va FUERA de NOTA. Siempre lo ocultamos del template;
  // si datos.oaa, lo agregamos en post-proceso como párrafo centrado en negrita (W5).
  outXml = ocultarParrafoConTexto(outXml, 'Los ensayos marcados con');

  // W5: textos OAA insertados antes de FIN DE INFORME
  const textosOAA = [];
  if (datos.oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  // Centrar párrafo del ID muestra (usa tab+center-tab-stop, no funciona con texto largo)
  outXml = centrarIdentificacionMuestra(outXml);

  // Centrar tabla de resultados
  outXml = centrarTabla(outXml);

  // Forzar Calibri 11pt en todo el cuerpo del ensayo
  outXml = forzarCalibri(outXml);

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'brinell');

  // Actualizar headers con razon_social, numero_ot, fecha_generacion
  // NO tocar preinforme aquí — lo maneja aplicarCambiosPreinforme en word-generator.js
  ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'].forEach(hdrPath => {
    const entry = processedZip.files[hdrPath];
    if (!entry) return;
    let hdrXml = entry.asText();
    hdrXml = hdrXml
      .replace(/\{\{razon_social\}\}/g,     templateData.razon_social)
      .replace(/\{\{numero_ot\}\}/g,        templateData.numero_ot)
      .replace(/\{\{fecha_generacion\}\}/g, templateData.fecha_generacion);
    // Quitar los dos runs extras (tab+2espacios y tab suelto) que anteceden a "Fecha:"
    hdrXml = hdrXml.replace(
      /(<w:tab\/>)<w:t xml:space="preserve">  <\/w:t><\/w:r>(<w:r[^>]*><w:rPr>[\s\S]*?<\/w:rPr><w:tab\/>)(<\/w:r>)((?:<w:bookmarkStart[^\/]*\/>|<w:bookmarkEnd[^\/]*\/>)*)(<w:r[^>]*>[\s\S]*?<w:t[^>]*>Fecha:)/,
      '$1</w:r>$4$5'
    );
    processedZip.file(hdrPath, hdrXml);
  });

  // Insertar bloque MEMORIA ANALÍTICA antes de "EQUIPAMIENTO UTILIZADO" si
  // hay algún dato del patrón cargado en el form.
  outXml = insertarMemoriaAnalitica(outXml, datos);

  outXml = eliminarParrafosVacios(outXml);
  // EVALUACION primero, luego ajustarEspaciado (que normaliza blancos antes de cada
  // landmark, incluyendo EVALUACION). De lo contrario eliminarParrafosVacios borra
  // los blancos que ajustarEspaciado inserta.
  if (evaluacionActiva) outXml = insertarBloqueEvaluacion(outXml, evaluacionTexto);
  outXml = ajustarEspaciado(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);
  outXml = minimizarUltimoParagrafo(outXml);

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones ───────────────────────────────────────────────────

function eliminarFilasOcultas(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    if (/__HIDE__(?!_)/.test(row)) return '';
    return row;
  });
}

// Elimina filas de datos donde todas las celdas de valor están vacías
function eliminarFilasVacias(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    const cells = [...row.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)];
    if (cells.length < 2) return row;
    // Conservar si alguna celda de valor (desde la 2da) tiene texto real
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

// Fuerza Calibri 11pt en todo el contenido del ensayo
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
  // Buscar texto SOLO en runs visibles (<w:t>), no en atributos XML.
  // Antes buscaba en el XML crudo y borraba párrafos por coincidencias falsas
  // en bookmarks como "_HlkNOTACION" o similares.
  return xml.replace(/<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?<\/w:p>/g, p => {
    const visible = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    return visible.includes(texto) ? '' : p;
  });
}

// Convierte el párrafo del ID muestra (que usa tab+center-tab-stop) a jc center real
function centrarIdentificacionMuestra(xml) {
  // Busca párrafos que tienen un center tab stop y un <w:tab/> de posicionamiento
  // Reemplaza el enfoque tab por <w:jc w:val="center"/> y quita el tab de posición
  return xml.replace(
    /(<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*?<w:tabs><w:tab w:val="center"[^>]*\/>(?:(?!<\/w:tabs>)[\s\S])*?<\/w:tabs>(?:(?!<\/w:pPr>)[\s\S])*?<\/w:pPr>)([\s\S]*?<\/w:p>)/g,
    (match, pPr, rest) => {
      // Agregar jc center a pPr si no la tiene
      const newPPr = pPr.includes('<w:jc') ? pPr : pPr.replace('</w:pPr>', '<w:jc w:val="center"/></w:pPr>');
      // Quitar el <w:tab/> de posicionamiento del primer run del párrafo
      const newRest = rest.replace(/<w:tab\/>(?=<w:t)/, '');
      return newPPr + newRest;
    }
  );
}

function ajustarEspaciado(xml) {
  const LANDMARKS = [
    { texto: 'CONDICIONES DE ENSAYO',     blancos: 0 },
    { texto: 'EQUIPAMIENTO UTILIZADO',    blancos: 1 }, // espacio después de condiciones
    { texto: 'RESULTADO OBTENIDO',        blancos: 1 }, // espacio después de equipamiento
    { texto: 'EVALUACION DE RESULTADOS',  blancos: 1 }, // bloque opcional antes de NOTA
    { texto: 'NOTA',                      blancos: 1 }, // espacio después de resultado/evaluación
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

function eliminarImagenVacia(xml) {
  const markerPos = xml.indexOf('__IMAGE_NONE__');
  if (markerPos < 0) return xml;
  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const imgParaEnd = pClose + '</w:p>'.length;
  const pOpen = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;
  let captionEnd = imgParaEnd;
  let searchPos  = imgParaEnd;
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

function convertirNumberingATexto(xml) {
  // Elimina <w:numPr> e inyecta numeración como texto con tabs e indentación controlada
  // Igual que plegado/nick-break: niveles 0→1.  1→1.1. etc.
  const NIVELES = [
    { texto: null, left: 0,   tab: 426  },  // nivel 0: título sección  (ej. "1.")
    { texto: null, left: 426, tab: 851  },  // nivel 1: subtítulo       (ej. "1.1.")
    // nivel 2+: contenido con left=851 sin tab propio
  ];

  // Contadores por nivel
  const counters = [0, 0, 0];
  let result = xml;

  // Reemplazamos cada párrafo con <w:numPr>
  result = result.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, par => {
    if (!par.includes('<w:numPr>')) return par;

    // Nivel del numPr
    const lvlMatch = par.match(/<w:ilvl w:val="(\d+)"/);
    const level = lvlMatch ? parseInt(lvlMatch[1]) : 0;

    // Incrementar contador del nivel y resetear inferiores
    counters[level] = (counters[level] || 0) + 1;
    for (let l = level + 1; l < counters.length; l++) counters[l] = 0;

    // Construir texto de numeración
    let numTexto;
    if (level === 0) numTexto = `${counters[0]}.`;
    else if (level === 1) numTexto = `${counters[0]}.${counters[1]}.`;
    else numTexto = `${counters[0]}.${counters[1]}.${counters[2]}.`;

    const cfg = NIVELES[Math.min(level, NIVELES.length - 1)];

    // Quitar numPr y numId del párrafo
    let newPar = par
      .replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '')
      .replace(/<w:numId[^/]*\/>/g, '');

    // Ajustar pPr: setear ind y tabs
    const tabsXml = `<w:tabs><w:tab w:val="left" w:pos="${cfg.tab}"/></w:tabs>`;
    const indXml  = `<w:ind w:left="${cfg.left}" w:hanging="0"/>`;

    if (newPar.includes('<w:pPr>')) {
      // Quitar ind y tabs existentes, agregar los nuestros
      newPar = newPar
        .replace(/<w:ind\b[^/]*\/>/g, '')
        .replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, '')
        .replace('<w:pPr>', `<w:pPr>${tabsXml}${indXml}`);
    } else {
      newPar = newPar.replace('<w:p', `<w:p><w:pPr>${tabsXml}${indXml}</w:pPr>`);
    }

    // Inyectar run con número + tab al principio del contenido (B: numeración en negrita)
    const numRun = `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${numTexto}</w:t><w:tab/></w:r>`;

    // Insertar justo antes del primer run de contenido
    newPar = newPar.replace(/(<\/w:pPr>)/, `$1${numRun}`);

    // Bug C: si hay un <w:br w:type="page"/> dentro del párrafo (queda entre el
    // número y el título y los separa visualmente), sacarlo afuera del párrafo.
    // Regex: NO permitir que `[\s\S]*?` dentro del <w:rPr> atrape un </w:r>
    // intermedio (eso causaría matchear desde el numRun hasta el br run).
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

// Cuando se incluye la columna Zona, el header de la celda del medio queda vacío
// en el template — le ponemos el texto "Zona" con el mismo estilo que las otras
// celdas del header (negrita, Calibri).
function setearHeaderZonaBrinell(xml) {
  return setearHeaderColumnaMedioBrinell(xml, 'Zona');
}

function setearHeaderColumnaMedioBrinell(xml, headerText) {
  const escXml = String(headerText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, tbl => {
    const grid = tbl.match(/<w:gridCol[^/]*\/>/g) || [];
    if (grid.length !== 3) return tbl;
    if (!/<w:gridSpan w:val="2"\/>/.test(tbl)) return tbl;
    // Buscar el primer <w:tr> (header row) y modificar su celda del medio
    return tbl.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/, headerRow => {
      const cells = [...headerRow.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)];
      if (cells.length !== 3) return headerRow;
      const middle = cells[1];
      const textoActual = middle[0].match(/<w:t[^>]*>([^<]+)<\/w:t>/);
      if (textoActual && textoActual[1].trim() !== '') return headerRow;
      const run = `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${escXml}</w:t></w:r>`;
      const fixed = middle[0].replace(/<\/w:p>/, run + '</w:p>');
      return headerRow.slice(0, middle.index) + fixed + headerRow.slice(middle.index + middle[0].length);
    });
  });
}

// Inserta una columna extra (Espesor / Ø Impronta / etc.) entre las columnas
// existentes y la última (Dureza HB). Soporta llamarse varias veces: cada vez
// detecta el `gridSpan` actual de la fila Promedio y le suma uno.
function agregarColumnaExtraBrinell(xml, mediciones, headerText, dataKey) {
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const bord  = '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';
  const headerEsc = String(headerText).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function celdaCab() {
    return `<w:tc><w:tcPr><w:tcW w:w="1300" w:type="dxa"/>${bord}<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
      `<w:r><w:rPr>${fonts}<w:b/><w:bCs/>${sz}</w:rPr><w:t xml:space="preserve">${headerEsc}</w:t></w:r></w:p></w:tc>`;
  }
  function celdaDato(texto) {
    const safe = String(texto == null ? '' : texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<w:tc><w:tcPr><w:tcW w:w="1300" w:type="dxa"/>${bord}<w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>` +
      `<w:r><w:rPr>${fonts}${sz}</w:rPr><w:t xml:space="preserve">${safe}</w:t></w:r></w:p></w:tc>`;
  }

  return xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/, tbl => {
    const grid = tbl.match(/<w:gridCol[^/]*\/>/g) || [];
    if (grid.length < 3) return tbl;
    const gridSpanMatch = tbl.match(/<w:gridSpan w:val="(\d+)"\/>/);
    if (!gridSpanMatch) return tbl;
    const oldSpan = parseInt(gridSpanMatch[1], 10);
    const newSpan = oldSpan + 1;
    // Agregar 1 gridCol extra antes del último (queda entre las columnas existentes y Dureza)
    let out = tbl.replace(
      /(<w:gridCol[^/]*\/>)(\s*)(<\/w:tblGrid>)/,
      '<w:gridCol w:w="1300"/>$1$2$3'
    );
    let dataIdx = 0;
    let isFirstRow = true;
    out = out.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
      // Fila Promedio: subir gridSpan en 1 y ajustar ancho proporcionalmente
      if (new RegExp(`<w:gridSpan w:val="${oldSpan}"\\/>`).test(row)) {
        // Ancho actual estimado: 1300 * oldSpan; nuevo: 1300 * newSpan
        const newWidth = 1300 * newSpan;
        let r = row.replace(new RegExp(`<w:gridSpan w:val="${oldSpan}"\\/>`), `<w:gridSpan w:val="${newSpan}"/>`);
        // Reemplazar el ancho del primer tcW de la fila promedio
        r = r.replace(/<w:tcW w:w="\d+"\s*w:type="dxa"\/>/, `<w:tcW w:w="${newWidth}" w:type="dxa"/>`);
        return r;
      }
      const cells = [...row.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)];
      if (cells.length < 2) return row;
      // Insertar la nueva celda justo ANTES de la última (Dureza)
      const lastCell = cells[cells.length - 1];
      const insertCell = isFirstRow ? celdaCab() : celdaDato(mediciones[dataIdx] && mediciones[dataIdx][dataKey]);
      if (!isFirstRow) dataIdx++;
      isFirstRow = false;
      return row.slice(0, lastCell.index) + insertCell + row.slice(lastCell.index);
    });
    return out;
  });
}

// U9: Elimina la columna Zona de la tabla Brinell. Identifica la tabla por tener
// exactamente 3 gridCol (que es como quedó después de agregar Zona) Y contener una
// celda con gridSpan=2 (fila Promedio). Elimina la celda del medio de cada fila.
function eliminarColumnaZonaBrinell(xml) {
  return xml.replace(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g, tbl => {
    const grid = tbl.match(/<w:gridCol[^/]*\/>/g) || [];
    if (grid.length !== 3) return tbl;
    if (!/<w:gridSpan w:val="2"\/>/.test(tbl)) return tbl;

    // Eliminar 2do gridCol (Zona)
    let out = tbl.replace(
      /(<w:tblGrid>\s*<w:gridCol[^/]*\/>)\s*<w:gridCol[^/]*\/>/,
      '$1'
    );

    out = out.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
      // Fila Promedio (gridSpan=2): quitar gridSpan y volver a ancho original
      if (/<w:gridSpan w:val="2"\/>/.test(row)) {
        return row
          .replace(/<w:gridSpan w:val="2"\/>/, '')
          .replace(/<w:tcW w:w="2600"\s*w:type="dxa"\/>/, '<w:tcW w:w="1300" w:type="dxa"/>');
      }
      // Filas normales: borrar 2da celda
      const cells = row.match(/<w:tc>[\s\S]*?<\/w:tc>/g);
      if (!cells || cells.length !== 3) return row;
      return row.replace(cells[1], '');
    });

    return out;
  });
}

// Inserta "EVALUACION DE RESULTADOS" + texto antes de NOTA (si está visible) o
// antes de FIN DE INFORME. Usa el mismo estilo que los subtítulos: bold,
// ind left=851 (mismo nivel que las otras secciones N.M.).
function insertarBloqueEvaluacion(xml, texto) {
  if (!texto) return xml;

  // Texto puede tener saltos de línea → un <w:p> por línea
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

  // No agregamos blanco aquí — ajustarEspaciado se ocupa de poner 1 blanco antes
  // de EVALUACION y otro antes de NOTA con base en los landmarks.
  const bloque = heading + cuerpo;

  // Posición destino: antes de NOTA si existe, sino antes de FIN DE INFORME
  let ref = xml.indexOf('NOTA');
  if (ref < 0) ref = xml.indexOf('FIN DE INFORME');
  if (ref < 0) return xml;
  const pStart = scanBackForTag(xml, '<w:p', ref);
  if (pStart < 0) return xml;
  return xml.slice(0, pStart) + bloque + xml.slice(pStart);
}

// Inserta un heading "MEMORIA ANALÍTICA" + 4 líneas con los datos del patrón
// usado para verificar el durómetro, antes de "EQUIPAMIENTO UTILIZADO". Si no
// hay ningún dato cargado, no inserta nada (para no ensuciar informes viejos).
// Campos: patron_tag, patron_valor, patron_diam_imp, patron_dureza_hb.
function insertarMemoriaAnalitica(xml, datos) {
  const tag       = String((datos && datos.patron_tag) || '').trim();
  const valor     = String((datos && datos.patron_valor) || '').trim();
  const diamImp   = String((datos && datos.patron_diam_imp) || '').trim();
  const durezaHb  = String((datos && datos.patron_dureza_hb) || '').trim();
  if (!tag && !valor && !diamImp && !durezaHb) return xml;

  const fonts  = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz     = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Heading estilo subtítulo N.M (mismo ind que "CONDICIONES DE ENSAYO").
  const heading = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:ind w:left="851"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:b/><w:bCs/>${sz}</w:rPr>` +
    '<w:t xml:space="preserve">MEMORIA ANALÍTICA</w:t></w:r></w:p>';

  function pLinea(texto) {
    return '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
      '<w:ind w:left="851"/></w:pPr>' +
      `<w:r><w:rPr>${fonts}${sz}</w:rPr>` +
      `<w:t xml:space="preserve">${esc(texto)}</w:t></w:r></w:p>`;
  }

  const lineas = [];
  if (tag)      lineas.push(pLinea('Patrón utilizado TAG N°: ' + tag));
  if (valor)    lineas.push(pLinea('Valor: ' + valor));
  if (diamImp)  lineas.push(pLinea('Diámetro de impronta (mm): ' + diamImp));
  if (durezaHb) lineas.push(pLinea('Dureza HB: ' + durezaHb));

  const bloque = heading + lineas.join('');

  // Insertar antes del párrafo que contiene "EQUIPAMIENTO UTILIZADO".
  const ref = xml.indexOf('EQUIPAMIENTO UTILIZADO');
  if (ref < 0) return xml;
  const pStart = scanBackForTag(xml, '<w:p', ref);
  if (pStart < 0) return xml;
  return xml.slice(0, pStart) + bloque + xml.slice(pStart);
}

module.exports = { generarBrinellDesdeTemplate };