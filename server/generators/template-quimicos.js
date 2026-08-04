const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');

const TEMPLATE_PATH = path.join(__dirname, '../templates/quimicos.docx');

const ELEMENTOS = [
  { n: 1,  key: 'carbono'   },
  { n: 2,  key: 'manganeso' },
  { n: 3,  key: 'silicio'   },
  { n: 4,  key: 'fosforo'   },
  { n: 5,  key: 'azufre'    },
  { n: 6,  key: 'cromo'     },
  { n: 7,  key: 'niquel'    },
  { n: 8,  key: 'molibdeno' },
  { n: 9,  key: 'cobre'     },
  { n: 10, key: 'vanadio'   },
  { n: 11, key: 'carb_eq'   },
  { n: 12, key: 'titanio'   },
  { n: 13, key: 'niobio'    },
  { n: 14, key: 'boro'      },
  { n: 15, key: 'aluminio'  },
  { n: 16, key: 'plomo'     },
  { n: 17, key: 'cobalto'   },
  { n: 18, key: 'tungsteno' },
  { n: 19, key: 'magnesio'  },
  { n: 20, key: 'hierro'    },
  { n: 21, key: 'nitrogeno' },
  { n: 22, key: 'estano'    },
  { n: 23, key: 'zinc'      },
  { n: 24, key: 'antimonio' },
  { n: 25, key: 'cadmio'    },
  { n: 26, key: 'arsenico'  },
  { n: 27, key: 'selenio'   },
  { n: 28, key: 'bismuto'   },
  { n: 29, key: 'plata'     },
];

const EQUIPO = [
  { key: 'spectrotest_361', label: 'Espectrómetro Spectrotest TAG N˚MM-361' },
  { key: 'aa_shimadzu_478', label: 'Absorción atómica Shimadzu TAG N˚MM-478' },
  { key: 'spectrotest_463', label: 'Espectrómetro Spectrotest TAG N˚MM-463' },
  { key: 'icp_oes_371',     label: 'Espectrómetro de emisión atómica ICP-OES TAG N˚QB-371' },
  { key: 'rayos_x_346',     label: 'Rayos X Oxford TAG N˚MM-346' },
  { key: 'spectromax_164',  label: 'Espectrómetro Spectromax TAG N˚MM-164' },
  { key: 'eltra_102',       label: 'Determinador de carbono y azufre Eltra TAG N˚MM-102' },
  { key: 'termohigro_701',  label: 'Termohigrómetro TAG N˚MM-701' },
  { key: 'termohigro_794',  label: 'Termohigrómetro TAG N˚MM-794' },
];

const SYMBOL_TO_KEY = {
  C: 'carbono', Mn: 'manganeso', Si: 'silicio', P: 'fosforo', S: 'azufre',
  Cr: 'cromo', Ni: 'niquel', Mo: 'molibdeno', V: 'vanadio', Cu: 'cobre',
  Ti: 'titanio', Nb: 'niobio', B: 'boro', Al: 'aluminio', Co: 'cobalto',
  W: 'tungsteno', Fe: 'hierro', N: 'nitrogeno', Ceq: 'carb_eq',
  Pb: 'plomo', Mg: 'magnesio', Sn: 'estano', Zn: 'zinc', Sb: 'antimonio',
  Cd: 'cadmio', As: 'arsenico', Se: 'selenio', Bi: 'bismuto', Ag: 'plata',
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

// ── Multi-muestra: agrega (cant-1) columnas a la tabla de resultados ─────────
// Cada fila tiene 2 celdas: [Elemento label] [{{resultado_N_1}} o "OT {{numero_ot}}"]
// Duplicamos la celda derecha para tener columnas {{resultado_N_2}}, {{resultado_N_3}}, etc.
// y reemplazamos "OT {{numero_ot}}" en el header por "{{header_col_1}}".
function agregarColumnasMultiMuestra(xml, cant) {
  if (cant <= 1) return xml;
  // Detectar la tabla de resultados (la que contiene {{resultado_1_1}})
  const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  let match, tblOriginal = null;
  while ((match = tblRe.exec(xml)) !== null) {
    if (match[0].includes('{{resultado_1_1}}')) { tblOriginal = match[0]; break; }
  }
  if (!tblOriginal) return xml;

  let tbl = tblOriginal;
  // 1. Reemplazar "OT {{numero_ot}}" del header por "{{header_col_1}}"
  tbl = tbl.replace(/<w:t[^>]*>OT \{\{numero_ot\}\}<\/w:t>/, '<w:t>{{header_col_1}}</w:t>');

  // 2. Ampliar <w:tblGrid> con (cant-1) columnas extra (ancho del último gridCol)
  tbl = tbl.replace(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/, (m, body) => {
    const cols = [...body.matchAll(/<w:gridCol w:w="(\d+)"/g)];
    if (!cols.length) return m;
    const ultAncho = cols[cols.length - 1][1];
    const extras = Array(cant - 1).fill(`<w:gridCol w:w="${ultAncho}"/>`).join('');
    return `<w:tblGrid>${body}${extras}</w:tblGrid>`;
  });

  // 3. Para cada <w:tr>, duplicar la última <w:tc> con sufijo _2, _3, ..., _cant
  tbl = tbl.replace(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g, trMatch => {
    const cellRe = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
    const cellMatches = [...trMatch.matchAll(cellRe)];
    if (cellMatches.length < 2) return trMatch;
    const lastCell = cellMatches[cellMatches.length - 1][0];
    // Identificar el placeholder principal de la celda (resultado_N_1 o header_col_1)
    const phMatch = lastCell.match(/\{\{(resultado_\d+_1|header_col_1)\}\}/);
    const dups = [];
    for (let i = 2; i <= cant; i++) {
      let newCell = lastCell;
      if (phMatch) {
        const orig = phMatch[1];
        const next = orig.startsWith('resultado_')
          ? orig.replace(/_1$/, `_${i}`)
          : `header_col_${i}`;
        newCell = lastCell.replace(`{{${orig}}}`, `{{${next}}}`);
      }
      dups.push(newCell);
    }
    // Insertar las celdas duplicadas justo después de la última celda original
    return trMatch.replace(lastCell, lastCell + dups.join(''));
  });

  return xml.replace(tblOriginal, tbl);
}

// ── Generador principal ───────────────────────────────────────────────────────

function generarQuimicosDesdeTemplate(ot, datos, fotosCaratula) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  // ── Pre-proceso del XML ───────────────────────────────────────────────────
  let docXml = zip.files['word/document.xml'].asText();

  // La cabecera de tabla ya fue corregida en el template (solo "OT {{numero_ot}}").
  // Como fallback, si todavía existe alguna variante antigua con "Mtra.", la limpiamos.
  if (docXml.includes('Mtra. {{id_muestra}}')) {
    docXml = docXml
      .replace(/O\.T\. \{\{numero_ot\}\}/g, 'OT {{numero_ot}}')
      .replace(/<w:r\b[^>]*>(?:(?!<\/w:r>).)*?Mtra\. \{\{id_muestra\}\}(?:(?!<\/w:r>).)*?<\/w:r>/gs, '');
  }

  // ── Backward compat: old form stored resultados[{C,Mn,...}] with symbol keys
  if ((!datos.muestras || !datos.muestras.length) && Array.isArray(datos.resultados) && datos.resultados.length) {
    datos = Object.assign({}, datos, {
      muestras: datos.resultados.map(r => {
        const m = {};
        for (const [sym, key] of Object.entries(SYMBOL_TO_KEY)) {
          if (r[sym] != null && String(r[sym]).trim() !== '') m[key] = r[sym];
        }
        return m;
      }),
    });
  }
  // Also handle legacy single-sample datos.elementos with symbol keys
  if ((!datos.muestras || !datos.muestras.length) && datos.elementos) {
    const elems = datos.elementos;
    if (Object.keys(elems).some(k => SYMBOL_TO_KEY[k])) {
      const m = {};
      for (const [sym, key] of Object.entries(SYMBOL_TO_KEY)) {
        if (elems[sym] != null && String(elems[sym]).trim() !== '') m[key] = elems[sym];
      }
      datos = Object.assign({}, datos, { muestras: [m] });
    }
  }

  // Filtrar muestras por checkboxes M1/M2/M3 del form. `datos.muestras_on` es
  // un boolean[] paralelo a `datos.muestras`; si el checkbox no está tildado
  // (=== false), esa muestra se excluye del informe. Si no viene `muestras_on`,
  // se incluyen todas (retro-compat).
  if (Array.isArray(datos.muestras) && Array.isArray(datos.muestras_on)) {
    const filtradas = datos.muestras.filter(function (_, i) { return datos.muestras_on[i] !== false; });
    datos = Object.assign({}, datos, { muestras: filtradas });
  }

  // ── Multi-muestra: agregar columnas a la tabla de resultados ──────────────
  // Si el ensayo trae varias muestras, duplicamos la celda derecha de cada fila
  // y reemplazamos el header "OT {{numero_ot}}" por "{{header_col_1}}".
  const _cantMM = Array.isArray(datos.muestras) && datos.muestras.length > 1 ? datos.muestras.length : 1;
  if (_cantMM > 1) docXml = agregarColumnasMultiMuestra(docXml, _cantMM);

  zip.file('word/document.xml', docXml);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const equipo    = datos.equipamiento || {};
  const elementos = datos.elementos    || {};

  // Normas de ensayo. Cada norma puede llevar año/sufijo custom (ej. "-23"),
  // si no se pasa usamos el sufijo por defecto.
  function suf(key, def) {
    const v = (datos[`${key}_year`] || '').toString().trim();
    if (!v) return def;
    return v.startsWith('-') || v.startsWith(':') ? v : '-' + v;
  }
  const lineasNorma = [];
  const normasASM = [];
  if (datos.norma_e663)  normasASM.push(`ASTM E663${suf('norma_e663',  '')}`);
  if (datos.norma_e415)  normasASM.push(`ASTM E415${suf('norma_e415',  '-21')}`);
  if (datos.norma_e634)  normasASM.push(`ASTM E634${suf('norma_e634',  '')}`);
  if (datos.norma_e1086) normasASM.push(`ASTM E1086${suf('norma_e1086', '-23')}`);
  if (datos.norma_e1251) normasASM.push(`ASTM E1251${suf('norma_e1251', '-23')}`);
  if (datos.norma_e1999) normasASM.push(`ASTM E1999${suf('norma_e1999', '-21')}`);
  if (datos.norma_e1019) normasASM.push(`ASTM E1019${suf('norma_e1019', '-22')}`);
  if (datos.norma_e2209) normasASM.push(`ASTM E2209${suf('norma_e2209', '')}`);
  if (datos.norma_e2994) normasASM.push(`ASTM E2994${suf('norma_e2994', '')}`);
  if (datos.norma_e3047) normasASM.push(`ASTM E3047${suf('norma_e3047', '-20')}`);
  if (datos.norma_a751)  normasASM.push(`ASTM A751${suf('norma_a751',  '-25')}`);
  if (datos.norma_e1024) normasASM.push(`ASTM E1024${suf('norma_e1024', '')}`);
  // "Otra norma": basta con que haya texto, sin requerir checkbox.
  // Sólo emitir si el checkbox está tildado. Si el técnico destildó "Otra:"
  // pero quedó texto residual, NO va al Word.
  if (datos.norma_otra_chk && datos.norma_otra && datos.norma_otra.trim()) {
    normasASM.push(datos.norma_otra.trim());
  }

  // ITMs internos e ITQB (procedimientos internos Labtesa). No llevan año en
  // el docx. Se juntan con "otra metodología" libre (metodologia_otra) y con
  // el itm_numero legacy en un solo array y se emiten como UNA sola línea
  // "Metodología de ensayo: X, Y y Z".
  const itmsInternos = [];
  if (datos.norma_itm054)  itmsInternos.push('ITM-054');
  if (datos.norma_itm057)  itmsInternos.push('ITM-057');
  if (datos.norma_itm058)  itmsInternos.push('ITM-058');
  if (datos.norma_itm091)  itmsInternos.push('ITM-091');
  if (datos.norma_itqb068) itmsInternos.push('ITQB N°068');
  // "Otra metodología" — texto libre del form nuevo.
  if (datos.metodologia_otra_chk && datos.metodologia_otra && String(datos.metodologia_otra).trim()) {
    itmsInternos.push(String(datos.metodologia_otra).trim());
  }
  // itm_numero legacy (input libre viejo). Solo si no hay nada más.
  const itm = (datos.itm_numero || '').trim();
  if (itm && itmsInternos.length === 0) itmsInternos.push('ITM N˚' + itm);

  // Norma de ensayo por-OT — el form nuevo la guarda en condiciones_por_ot
  // (sección 1.1). Se agrega al array de normas junto con las globales ASTM.
  if (datos.condiciones_por_ot && typeof datos.condiciones_por_ot === 'object') {
    const nroOtActualCond = String(ot.nro_ot || '');
    const condOt = datos.condiciones_por_ot[nroOtActualCond];
    if (condOt && condOt.norma_ensayo_ot && String(condOt.norma_ensayo_ot).trim()) {
      normasASM.push(String(condOt.norma_ensayo_ot).trim());
    }
  }

  // Formato natural para unir múltiples items ("X, Y y Z" · "X y Y" · "X").
  function unirNatural(arr) {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    if (arr.length === 2) return arr[0] + ' y ' + arr[1];
    const last = arr[arr.length - 1];
    const rest = arr.slice(0, -1).join(', ');
    return rest + ' y ' + last;
  }
  // Línea "Norma de ensayo: ..." (dedupear por si venía repetida).
  const normasDedup = Array.from(new Set(normasASM));
  if (normasDedup.length > 0) {
    lineasNorma.push('Norma de ensayo: ' + unirNatural(normasDedup));
  }
  // Línea "Metodología de ensayo: ..." (unificada, dedupeada).
  const itmsDedup = Array.from(new Set(itmsInternos));
  if (itmsDedup.length > 0) {
    lineasNorma.push('Metodología de ensayo: ' + unirNatural(itmsDedup));
  }

  const normas_seleccionadas = lineasNorma.length ? lineasNorma.join('\n') : '__SECTION_HIDE__';

  const zona_evaluacion = datos.zona_evaluacion?.trim()
    ? `Zona de evaluación: ${datos.zona_evaluacion.trim()}`
    : '__SECTION_HIDE__';

  let temperatura_ensayo = '__SECTION_HIDE__';
  if (datos.temperatura !== '' && datos.temperatura != null) {
    temperatura_ensayo = `Temperatura de ensayo: ${datos.temperatura} ˚C`;
  }

  // "Patrón utilizado" ahora se emite dentro del bloque EQUIPAMIENTO UTILIZADO,
  // no en CONDICIONES. Ocultamos el placeholder viejo del template y agregamos
  // la línea al array de equipos más abajo.
  const patron = '__SECTION_HIDE__';
  const patronLinea = (datos.patron || '').trim()
    ? `Patrón utilizado N˚${datos.patron.trim()}`
    : '';

  // Equipamiento
  const listaEquipos = EQUIPO.filter(e => equipo[e.key]).map(e => e.label);
  if (patronLinea) listaEquipos.push(patronLinea);

  // Equipos extra del catálogo (DB, agregados desde el form via equipamiento_extra)
  if (Array.isArray(datos.equipamiento_extra)) {
    datos.equipamiento_extra.forEach(function (e) {
      if (e && (e.nombre || e.label)) listaEquipos.push(e.nombre || e.label);
    });
  }
  // "OTROS EQUIPOS" del form (datos.otros_equipos = [{nombre, tag}])
  formatearOtrosEquipos(datos).forEach(l => listaEquipos.push(l));
  const equipSlots = {};
  for (let i = 1; i <= 9; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquipos[i - 1] || '__SECTION_HIDE__';
  }

  // Resultados — soporta 1 muestra (datos.elementos legacy) o N muestras (datos.muestras[])
  const muestras = Array.isArray(datos.muestras) && datos.muestras.length > 0
    ? datos.muestras
    : [{ columna_label: '', elementos: elementos }];
  const cantMuestras = muestras.length;

  const resultados = {};
  ELEMENTOS.forEach(({ n, key }) => {
    muestras.forEach((m, idx) => {
      // Soporta formato nuevo (m[key] directo) y legado (m.elementos[key])
      const val = String(m[key] ?? (m.elementos && m.elementos[key]) ?? '').trim();
      resultados[`resultado_${n}_${idx + 1}`] = val || '__HIDE__';
    });
  });
  // Si todas las muestras de una fila están vacías → ocultar la fila completa
  ELEMENTOS.forEach(({ n }) => {
    const todasVacias = muestras.every((_, idx) => resultados[`resultado_${n}_${idx + 1}`] === '__HIDE__');
    if (todasVacias) {
      muestras.forEach((_, idx) => { resultados[`resultado_${n}_${idx + 1}`] = '__HIDE__'; });
    } else {
      // Si la fila se muestra, los valores vacíos quedan en blanco (no __HIDE__) para no romper el render
      muestras.forEach((_, idx) => {
        if (resultados[`resultado_${n}_${idx + 1}`] === '__HIDE__') resultados[`resultado_${n}_${idx + 1}`] = '';
      });
    }
  });
  // Encabezados de columna (para multi-muestra; el template los inyecta vía {{header_col_X}})
  const headerCols = {};
  if (cantMuestras > 1) {
    muestras.forEach((m, idx) => {
      headerCols[`header_col_${idx + 1}`] = m.columna_label || `M${idx + 1}`;
    });
  }

  // Evaluación / Notas
  // La evaluación se emite si `tiene_evaluacion !== false` Y hay texto o
  // material_tipo cargado. Si el usuario desmarca "Incluir evaluación" en el
  // form, `tiene_evaluacion` se guarda como false y la sección se oculta
  // aunque haya datos residuales.
  const lineasObs = [];
  const evalText = (datos.evaluacion_texto || '').trim();
  const materialTipo = (datos.material_tipo || '').trim();
  const evalHabilitada = datos.tiene_evaluacion !== false;
  if (evalHabilitada && (evalText || materialTipo)) {
    let linea = evalText || 'La muestra analizada satisface los requerimientos de composición química de un material tipo:';
    if (materialTipo) {
      // Si la frase termina con ":" (default), pegar el material al final.
      // Si el texto ya lo incluye, no duplicar.
      if (/:\s*$/.test(linea)) linea = linea.replace(/:\s*$/, ': ' + materialTipo);
      else if (linea.indexOf(materialTipo) === -1) linea = linea + ' ' + materialTipo;
    }
    lineasObs.push(linea);
  }
  const observaciones_evaluacion = lineasObs.length ? lineasObs.join('\n') : '__SECTION_HIDE__';
  const evaluacionOculta = observaciones_evaluacion === '__SECTION_HIDE__';

  // W5: texto OAA insertado antes de FIN DE INFORME como párrafo centrado en negrita
  const textosOAA = [];
  if (datos.oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  const lineasNotas = [];
  if (datos.tiene_nota && datos.nota_texto) lineasNotas.push(datos.nota_texto);
  const notas_seleccionadas = lineasNotas.length ? lineasNotas.join('\n') : '__SECTION_HIDE__';

  // Imagen — soporte multi-imagen vía helper en post-proceso.
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const imagen_recepcion = fotos.length > 0 ? '__IMAGE_HERE__' : '__IMAGE_NONE__';

  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');

  const templateData = {
    numero_ot:    nroOtBase,
    razon_social: ot.razon_social       || '',
    fecha_generacion: ot.fecha_finalizacion || '',

    id_muestra:                      ot.id_muestra        || '',
    fecha_recepcion_muestra:         ot.fecha_recepcion   || '',
    fecha_aprobacion_inicio_trabajo: ot.fecha_aprobacion  || '',
    imagen_recepcion,

    normas_seleccionadas,
    zona_evaluacion,
    temperatura_ensayo,
    patron,

    ...equipSlots,
    ...resultados,
    ...headerCols,

    observaciones_evaluacion,
    notas_seleccionadas,
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

  // Insertar filas custom (datos.elementos_extra) al final de la tabla, antes
  // de la fila "TIPO". Se hace ANTES del override de labels: usamos la fila
  // "Plata %" original como molde (si el técnico renombró Plata, el regex no
  // matchearía). Después el override de labels aplica sobre las filas fijas
  // que quedan; las nuevas ya tienen el label custom.
  if (Array.isArray(datos.elementos_extra) && datos.elementos_extra.length > 0) {
    // En el template real, el label es `<w:t>Plata</w:t>` (sin el "%" pegado).
    // El "%" viene en otra celda o run separado. Buscamos solo "Plata".
    const rePlata = /<w:tr\b[^>]*>(?:(?!<w:tr\b)[\s\S])*?<w:t[^>]*>Plata<\/w:t>(?:(?!<\/w:tr>)[\s\S])*?<\/w:tr>/;
    const mPlata = outXml.match(rePlata);
    console.log('[quimicos] elementos_extra:', datos.elementos_extra.length + ' filas; molde Plata encontrado: ' + !!mPlata);
    if (mPlata) {
      const filaMolde = mPlata[0];
      const filasNuevas = datos.elementos_extra.map(function (el) {
        const labelXml = String(el.label || '').trim()
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '';
        // Reemplazar el texto "Plata" del molde por el label completo del custom
        // (que ya incluye el "%" u otra unidad si el técnico lo puso). El "%"
        // adyacente del molde queda residual — lo limpiamos con un replace extra.
        let f = filaMolde.replace(/(<w:t[^>]*>)Plata(<\/w:t>)/, '$1' + labelXml + '$2');
        // Eliminar el "%" residual (viene en un <w:t> aparte en el molde de Plata).
        f = f.replace(/(<w:t[^>]*>)\s*%\s*(<\/w:t>)/, '$1$2');
        // Valores de las muestras para este elemento custom (los cargó el
        // técnico en la tabla del form bajo la key `el.k`).
        const muestrasParaEsta = Array.isArray(datos.muestras) ? datos.muestras : [];
        const vals = [];
        for (let i = 0; i < 3; i++) {
          const m = muestrasParaEsta[i] || {};
          const v = String(m[el.k] ?? (m.elementos && m.elementos[el.k]) ?? '').trim();
          vals.push(v);
        }
        // Reemplazar el CONTENIDO de cada <w:t> del cuerpo por los valores:
        //   count 0 = label (ya reemplazado arriba, saltear)
        //   count 1-3 = muestras M1, M2, M3
        //   count > 3 = celdas de patrones/MIN/MAX/TIPO → vaciar
        const rePlaceholder = /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g;
        let count = -1;
        f = f.replace(rePlaceholder, function (m, pre, contenido, post) {
          count++;
          if (count === 0) return m;
          if (count >= 1 && count <= 3) return pre + (vals[count - 1] || '') + post;
          return pre + post;
        });
        // Defensivo: eliminar cualquier __HIDE__ residual para que
        // eliminarFilasOcultas no borre esta fila más adelante.
        f = f.replace(/__HIDE__/g, '');
        return f;
      }).join('');
      outXml = outXml.replace(rePlata, mPlata[0] + filasNuevas);
    } else {
      console.warn('[quimicos] No se encontró fila "Plata %" para clonar filas custom. Elementos extra descartados.');
    }
  }

  // Aplicar overrides de labels (datos.elementos_labels). El técnico puede
  // haber renombrado "Carbono %" → "C %" u otra variante en el form. Buscamos
  // el texto original de cada elemento en el XML y lo reemplazamos.
  if (datos.elementos_labels && typeof datos.elementos_labels === 'object') {
    const labelsPorKey = {
      carbono: 'Carbono %', manganeso: 'Manganeso %', silicio: 'Silicio %', fosforo: 'Fosforo %',
      azufre: 'Azufre %', cromo: 'Cromo %', niquel: 'Níquel %', molibdeno: 'Molibdeno %',
      cobre: 'Cobre %', vanadio: 'Vanadio %', carb_eq: 'Carb.eq %', titanio: 'Titanio %',
      niobio: 'Niobio %', boro: 'Boro %', aluminio: 'Aluminio %', plomo: 'Plomo %',
      cobalto: 'Cobalto %', tungsteno: 'Tungsteno %', magnesio: 'Magnesio %', hierro: 'Hierro %',
      nitrogeno: 'Nitrógeno %', estano: 'Estaño %', zinc: 'Cinc %', antimonio: 'Antimonio %',
      cadmio: 'Cadmio %', arsenico: 'Arsénico %', selenio: 'Selenio %', bismuto: 'Bismuto %',
      plata: 'Plata %',
    };
    Object.keys(datos.elementos_labels).forEach(function (k) {
      const nuevo = String(datos.elementos_labels[k] || '').trim();
      const orig  = labelsPorKey[k];
      if (!nuevo || !orig || nuevo === orig) return;
      const escOrig = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escNuevo = nuevo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const re = new RegExp('(<w:t[^>]*>)' + escOrig + '(</w:t>)', 'g');
      outXml = outXml.replace(re, '$1' + escNuevo + '$2');
    });
  }

  // ASTERISCO_TITULO_AUTO — agrega * al título del ensayo si está marcado fuera del alcance OAA
  if (datos.oaa) {
    // Estrategia 1: título en un solo <w:t>
    const tituloRe = /(<w:t[^>]*>)(ANALISIS QUIMICO)(\*?)(\s*<\/w:t>)/;
    if (tituloRe.test(outXml)) {
      outXml = outXml.replace(tituloRe, function (m, pre, txt, ya, close) {
        return ya === '*' ? m : pre + txt + '*' + close;
      });
    }
  }


  // 1. Eliminar filas de elementos vacíos
  outXml = eliminarFilasOcultas(outXml);

  // 2. Eliminar párrafos de condiciones/equipamiento vacíos
  outXml = eliminarSeccionesOcultas(outXml);
  outXml = colapsarBlancos(outXml);

  // 3. Eliminar título "EVALUACION DE RESULTADOS" cuando el contenido está oculto
  if (evaluacionOculta) {
    outXml = ocultarParrafoConTexto(outXml, 'EVALUACION DE RESULTADOS');
  }

  // 4. Insertar salto de página antes de "ANALISIS QUIMICO"
  outXml = insertarSaltoPaginaAntes(outXml, 'ANALISIS QUIMICO');

  // 5. Centrar la tabla de resultados y sus celdas
  outXml = centrarTabla(outXml);
  outXml = negritarFilaEncabezadoTabla(outXml);

  // 6. Imagen — soporta N imágenes mediante helper compartido.
  //    IMPORTANTE: insertar la imagen ANTES de forzarCalibri. Si se inserta
  //    después, el run con <w:drawing> queda con <w:rPr> que Word no asocia
  //    correctamente con el gráfico → la imagen pierde los handles de resize.
  //    Mismo orden que template-traccion.js.
  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'quimicos');

  // 7. Forzar fuente Calibri en toda la sección del ensayo
  outXml = forzarCalibri(outXml);

  // Actualizar header2 con razon_social si Docxtemplater no lo procesó
  const hdrEntry = processedZip.files['word/header2.xml'];
  if (hdrEntry) {
    let hdrXml = hdrEntry.asText();
    if (hdrXml.includes('{{razon_social}}'))
      hdrXml = hdrXml.replace(/\{\{razon_social\}\}/g, templateData.razon_social);
    if (hdrXml.includes('{{numero_ot}}'))
      hdrXml = hdrXml.replace(/\{\{numero_ot\}\}/g, templateData.numero_ot);
    if (hdrXml.includes('{{fecha_generacion}}'))
      hdrXml = hdrXml.replace(/\{\{fecha_generacion\}\}/g, templateData.fecha_generacion);
    processedZip.file('word/header2.xml', hdrXml);
  }

  outXml = eliminarParrafosVacios(outXml);
  outXml = ajustarEspaciado(outXml);
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);

  // Formato encabezado: siempre "O.T. xxx" (no "OT xxx"). Aplica a runs con sólo "OT" + espacio + número.
  outXml = outXml.replace(/<w:t([^>]*)>OT (\d)/g, '<w:t$1>O.T. $2');
  outXml = outXml.replace(/<w:t([^>]*)>OT<\/w:t>/g, '<w:t$1>O.T.</w:t>');

  outXml = minimizarUltimoParagrafo(outXml);

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones ───────────────────────────────────────────────────

// Elimina filas donde alguna celda contiene __HIDE__
function eliminarFilasOcultas(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    if (/__HIDE__(?!_)/.test(row)) return '';
    return row;
  });
}

// Elimina el párrafo de contenido marcado con __SECTION_HIDE__ y los blancos antes de él
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

// Elimina el párrafo que contiene el texto literal indicado (para títulos de sección vacíos)
function ocultarParrafoConTexto(xml, texto) {
  let result = xml;
  let searchPos = 0;
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

// Inserta un párrafo de salto de página antes del título y fuerza Space Before = 0
// en el párrafo del título para que no aparezca espacio vacío al tope de la página.
function insertarSaltoPaginaAntes(xml, texto) {
  const pos = xml.indexOf(texto);
  if (pos < 0) return xml;
  const pStart = scanBackForTag(xml, '<w:p', pos);
  if (pStart < 0) return xml;
  const pageBreakPara = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  let out = xml.slice(0, pStart) + pageBreakPara + xml.slice(pStart);
  // Forzar Space Before = 0 en el título (buscamos </w:pPr> dentro del párrafo)
  const ts = pStart + pageBreakPara.length;
  const pPrClose = out.indexOf('</w:pPr>', ts);
  const pClose   = out.indexOf('</w:p>',   ts);
  if (pPrClose >= 0 && (pClose < 0 || pPrClose < pClose)) {
    out = out.slice(0, pPrClose) + '<w:spacing w:before="0"/>' + out.slice(pPrClose);
  } else {
    const tagEnd = out.indexOf('>', ts) + 1;
    out = out.slice(0, tagEnd) + '<w:pPr><w:spacing w:before="0"/></w:pPr>' + out.slice(tagEnd);
  }
  return out;
}

// Centra la tabla en página y el texto dentro de cada celda
function negritarFilaEncabezadoTabla(xml) {
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tbl => {
    const firstRowMatch = tbl.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/);
    if (!firstRowMatch) return tbl;
    const firstRow = firstRowMatch[0];
    let boldedRow = firstRow
      .replace(/<\/w:rPr>/g, (match, offset) => {
        const rPrOpen = firstRow.lastIndexOf('<w:rPr', offset);
        if (rPrOpen >= 0 && firstRow.slice(rPrOpen, offset).includes('<w:b')) return match;
        return '<w:b/><w:bCs/>' + match;
      })
      .replace(/(<w:r\b[^>]*>)(?![\s\S]*?<\/w:rPr>)(<w:t[\s>])/g, '$1<w:rPr><w:b/><w:bCs/></w:rPr>$2');
    return tbl.slice(0, firstRowMatch.index) + boldedRow + tbl.slice(firstRowMatch.index + firstRow.length);
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

// Colapsa múltiples párrafos en blanco consecutivos a uno solo
function colapsarBlancos(xml) {
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let out = '', lastIdx = 0, consecBlanks = 0, m;
  while ((m = pRe.exec(xml)) !== null) {
    out += xml.slice(lastIdx, m.index);
    lastIdx = m.index + m[0].length;
    if (esParrafoBlanco(m[0])) {
      consecBlanks++;
      if (consecBlanks <= 1) out += m[0];
    } else {
      consecBlanks = 0;
      out += m[0];
    }
  }
  return out + xml.slice(lastIdx);
}

// Normaliza fuentes a Calibri 11pt; también inyecta <w:rPr> en runs que no tienen ninguno
function forzarCalibri(xml) {
  const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const RPR   = `<w:rPr>${FONTS}${SZ}</w:rPr>`;

  // 1. Reemplazar <w:rFonts> existentes por Calibri
  let result = xml.replace(/<w:rFonts\b[^>]*\/>/g, FONTS);

  // 2. Agregar <w:rFonts> al inicio de <w:rPr> que no tengan uno
  result = result.replace(/<w:rPr>(?!<w:rFonts)/g, `<w:rPr>${FONTS}`);

  // 3. Agregar <w:rPr> completo a <w:r> que van directo a <w:t> sin ningún <w:rPr>
  result = result.replace(/<w:r\b([^>]*)><w:t/g, `<w:r$1>${RPR}<w:t`);
  // Normalizar TODOS los tamaños a 11pt (sz=22) para consistencia visual
  result = result.replace(/<w:sz w:val="\d+"\s*\/>/g,   '<w:sz w:val="22"/>');
  result = result.replace(/<w:szCs w:val="\d+"\s*\/>/g, '<w:szCs w:val="22"/>');

  return result;
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

// W3: ajusta el espacio antes de las secciones clave.
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

module.exports = { generarQuimicosDesdeTemplate };
