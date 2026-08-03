const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const fs = require('fs');
const path = require('path');

const { insertarOAAAntesDeFin } = require('./oaa-helper');
const { manejarImagenesCaratula } = require('./imagenes-caratula-helper');
const { formatearOtrosEquipos } = require('./otros-equipos-helper');
const { normalizarNorma } = require('../utils/text-helpers');

const TEMPLATE_PATH = path.join(__dirname, '../templates/traccion.docx');

const EQUIPO_ESTANDAR = [
  { key: 'emic',            label: 'Máquina de tracción Emic TAG N˚MM-203' },
  { key: 'calibre_571',     label: 'Calibre digital TAG N˚MM-571' },
  { key: 'calibre_cal570',  label: 'Calibre digital TAG N˚CAL-570' },
  { key: 'nivel_781',       label: 'Nivel angular magnético TAG N˚MM-781' },
  { key: 'termohigro_545',  label: 'Termohigrómetro TAG N˚PCAL-545' },
  { key: 'termohigro_702',  label: 'Termohigrómetro TAG N˚MM-702' },
  { key: 'trazado_782',     label: 'Dispositivo de trazado TAG N˚MM-782' },
  { key: 'regla_441',       label: 'Regla metálica TAG N˚MM-441' },
  { key: 'regla_443',       label: 'Regla metálica TAG N˚MM-443' },
  { key: 'proyector_165',   label: 'Proyector de perfiles TAG N˚MM-165' },
];

const EQUIPO_NEUQUEN = [
  { key: 'shimadzu',       label: 'Máquina de tracción Shimadzu TAG N˚MM-151' },
  { key: 'calibre_694',    label: 'Calibre digital TAG N˚MM-694' },
  { key: 'termohigro_794', label: 'Termohigrómetro TAG N°MM-794' },
];

const FILAS = [
  { n: 1,  key: 'ancho_promedio'       },
  { n: 2,  key: 'espesor_promedio'     },
  { n: 3,  key: 'diametro_promedio'    },
  { n: 4,  key: 'seccion_inicial'      },
  { n: 5,  key: 'carga_maxima'         },
  { n: 6,  key: 'resistencia_traccion' },
  { n: 7,  key: 'carga_fluencia'       },
  { n: 8,  key: 'tension_fluencia'     },
  { n: 9,  key: 'longitud_inicial'     },
  { n: 10, key: 'longitud_final'       },
  { n: 11, key: 'alargamiento'         },
  { n: 12, key: 'diametro_final'       },
  { n: 13, key: 'seccion_final'        },
  { n: 14, key: 'estriccion'           },
  { n: 15, key: 'defectos'             },
  { n: 16, key: 'zona_rotura'          },
  { n: 17, key: 'tipo_rotura'          },
  { n: 18, key: 'lado_rotura'          },
];

// Filas que se muestran cuando variante='neuquen' (las 9 básicas, sin estriccion/defectos/etc.)
const KEYS_NEUQUEN = new Set([
  'ancho_promedio', 'espesor_promedio',
  'diametro_promedio', 'seccion_inicial', 'carga_maxima', 'resistencia_traccion',
  'carga_fluencia', 'tension_fluencia', 'longitud_inicial', 'longitud_final',
  'alargamiento',
  // Filas debajo de "Alargamiento": se muestran también en Neuquén cuando el
  // usuario las carga en el form. Antes se ocultaban por variante.
  'diametro_final', 'seccion_final', 'estriccion', 'defectos',
  'zona_rotura', 'tipo_rotura', 'lado_rotura',
]);

// ── Cadenas exactas del XML del template para reemplazar cabeceras de columnas ─

// Contenido de la columna 2 (primera de datos) dentro de <w:p>: {{numero_ot}}\n{{numero_muestra}}
const COL2_RUNS =
  '<w:r><w:t>{{</w:t></w:r><w:proofErr w:type="spellStart"/>' +
  '<w:r><w:t>numero_ot</w:t></w:r><w:proofErr w:type="spellEnd"/>' +
  '<w:r><w:t>}}</w:t></w:r><w:r><w:br/></w:r>' +
  '<w:r w:rsidR="006E758C"><w:t>{{</w:t></w:r><w:proofErr w:type="spellStart"/>' +
  '<w:r w:rsidR="006E758C"><w:t>numero_</w:t></w:r>' +
  '<w:r w:rsidR="006E758C"><w:t>muestra</w:t></w:r><w:proofErr w:type="spellEnd"/>' +
  '<w:r w:rsidR="006E758C"><w:t>}}</w:t></w:r>';

// Contenido de la columna 3 (segunda de datos) DESPUÉS de renombrar col2_ot/col2_muestra
const COL3_RUNS =
  '<w:bookmarkStart w:id="3" w:name="_GoBack"/><w:bookmarkEnd w:id="3"/>' +
  '<w:r><w:t>{{col2_ot}}</w:t></w:r><w:r><w:br/></w:r>' +
  '<w:r w:rsidR="006E758C"><w:t>{{</w:t></w:r><w:proofErr w:type="spellStart"/>' +
  '<w:r w:rsidR="006E758C"><w:t>col2_muestra</w:t></w:r><w:proofErr w:type="spellEnd"/>' +
  '<w:r w:rsidR="006E758C"><w:t>}}</w:t></w:r>';

const BOLD_RUN_COL1 =
  '<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
  '<w:t>{{encabezado_col1}}</w:t></w:r>';

const BOLD_RUN_COL2 =
  '<w:bookmarkStart w:id="3" w:name="_GoBack"/><w:bookmarkEnd w:id="3"/>' +
  '<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
  '<w:t>{{encabezado_col2}}</w:t></w:r>';

// ── Utilidades de imagen ──────────────────────────────────────────────────────

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

// ── Helper: encuentra el último <tagPrefix ...> o <tagPrefix> antes de `before` ─
// Evita confundir <w:p> con <w:pPr>, <w:tc> con <w:tcPr>, etc.
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

// ── Generador principal ───────────────────────────────────────────────────────

function generarTraccionDesdeTemplate(ot, datos, fotosCaratula) {
  const content = fs.readFileSync(TEMPLATE_PATH, 'binary');
  const zip = new PizZip(content);

  // ── Datos ─────────────────────────────────────────────────────────────────
  const esNeuquen = datos.variante === 'neuquen';

  // Lados opcional: si datos.usar_lados=true y hay datos.lados[], aplana muestras
  // y track cuántas muestras pertenecen a cada lado (para gridSpan en header).
  const usarLados = !!datos.usar_lados && Array.isArray(datos.lados) && datos.lados.length > 0;
  let lados = null;
  let muestras;
  if (usarLados) {
    lados = datos.lados.map(l => ({
      nombre: String(l.nombre || '').trim() || 'Lado',
      muestras: Array.isArray(l.muestras) ? l.muestras : [],
    })).filter(l => l.muestras.length > 0);
    muestras = lados.flatMap(l => l.muestras);
  } else {
    muestras = datos.muestras || [{}];
    // Filtro multi-OT: si datos._filtro_ot está seteado, solo emitir las
    // muestras cuya `nro_ot_override` matchea (o vacío/default para la OT del
    // ensayo). El word-generator llama a este template una vez por cada OT
    // detectada en el registro, y para cada llamada pasa `_filtro_ot`.
    if (datos._filtro_ot != null) {
      const otFiltro = String(datos._filtro_ot);
      const esOtDelEnsayo = otFiltro === String(ot.nro_ot || '');
      // Índices a preservar (para también filtrar seccion_calc paralelamente).
      const idxKeep = [];
      muestras.forEach((mm, idx) => {
        const ov = String((mm && mm.nro_ot_override) || '').trim();
        const perteneceA = ov || String(ot.nro_ot || '');
        if (perteneceA === otFiltro || (esOtDelEnsayo && !ov)) idxKeep.push(idx);
      });
      // Reindexar _probeta_padre según el nuevo orden.
      const oldToNew = {};
      idxKeep.forEach((oldIdx, newIdx) => { oldToNew[oldIdx] = newIdx; });
      muestras = idxKeep.map(oldIdx => {
        const mm = Object.assign({}, muestras[oldIdx] || {});
        if (mm._zona_extra && mm._probeta_padre != null) {
          const nuevo = oldToNew[mm._probeta_padre];
          if (nuevo != null) mm._probeta_padre = nuevo;
          else { delete mm._zona_extra; delete mm._probeta_padre; } // padre no está en este split
        }
        return mm;
      });
      // Filtrar seccion_calc en paralelo (mismos índices).
      if (Array.isArray(datos.seccion_calc)) {
        datos = Object.assign({}, datos, {
          seccion_calc: idxKeep.map(i => datos.seccion_calc[i] || {}),
          muestras: muestras,
        });
      }
      if (muestras.length === 0) muestras = [{}]; // no romper el template
    }
  }

  const N = Math.max(1, muestras.length);          // cantidad real de muestras
  const NCOLS = Math.max(2, N);                    // columnas a renderizar (mínimo 2 por compat. con template)
  const unaMuestra = N <= 1;
  const m1 = muestras[0] || {};
  const m2 = muestras[1] || {};
  const equipo = datos.equipamiento || {};

  // ── Pre-proceso XML: expandir columnas si hay >2 muestras + agregar fila de lados ──
  // hayZonas: al menos una muestra tiene `zona` completa o es zona extra.
  //   → habilita el merge horizontal en el header de probetas y agrega una
  //     fila "Zona" debajo con los nombres (Superficie / Núcleo / etc).
  const hayZonas = !usarLados && muestras.some(m =>
    m && (m._zona_extra || (m.zona && String(m.zona).trim())));
  if (NCOLS > 2 || (usarLados && lados.length > 0) || hayZonas) {
    let tplXml = zip.files['word/document.xml'].asText();
    if (NCOLS > 2) tplXml = expandirColumnasResultados(tplXml, NCOLS);
    if (usarLados && lados.length > 0) tplXml = agregarFilaLados(tplXml, lados);
    if (hayZonas) {
      console.log('[traccion] Aplicando zonas — muestras:',
        muestras.map((m, i) => `[${i}]${m._zona_extra ? 'ZONA' : 'FIS'}(nombre=${m.nombre || '?'}, zona=${m.zona || '-'})`).join(' | '),
        'NCOLS=' + NCOLS);
      try {
        tplXml = mergeHeaderProbetas(tplXml, muestras, NCOLS);
        tplXml = agregarFilaZonas(tplXml, muestras, NCOLS);
        // Debug: dump del fragmento con las 2 filas del header a un archivo,
        // para que persista independiente del log.
        const dbgIdx = tplXml.indexOf('encabezado_col1');
        if (dbgIdx > 0) {
          const trStart = tplXml.lastIndexOf('<w:tr', dbgIdx);
          const trEnd1  = tplXml.indexOf('</w:tr>', dbgIdx);
          const trEnd2  = tplXml.indexOf('</w:tr>', trEnd1 + 1);
          const dumpXml = tplXml.slice(trStart, trEnd2 + '</w:tr>'.length);
          try {
            fs.writeFileSync(
              path.join(__dirname, '..', '..', 'debug-header-zonas.xml'),
              '<?xml version="1.0"?>\n<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n'
                + dumpXml + '\n</root>\n',
              'utf8'
            );
            console.log('[traccion][zonas] XML del header dumpeado a debug-header-zonas.xml (' + dumpXml.length + ' bytes)');
          } catch (e2) {
            console.error('[traccion][zonas] no pudo dumpear XML:', e2.message);
          }
        }
      } catch (e) {
        console.error('[traccion] Error aplicando zonas al Word:', e.message, e.stack);
      }
    }
    zip.file('word/document.xml', tplXml);
  }

  // Solo los equipos del variant activo, filtrados por el checkbox del form
  // Nota: variante='estandar' usa Emic (CABA), variante='neuquen' usa Shimadzu
  const listaEquipos = (esNeuquen ? EQUIPO_NEUQUEN : EQUIPO_ESTANDAR)
    .filter(e => equipo[e.key])
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
  for (let i = 1; i <= 7; i++) {
    equipSlots[`equipamiento_${i}`] = listaEquipos[i - 1] || '';
  }

  // Resultados por fila
  // variante='estandar' → muestra las 18 filas; variante='neuquen' → solo las 9 básicas
  // Además respeta `filas_excluidas`: claves que el usuario decidió quitar manualmente del form.
  const filasExcluidas = new Set(datos.filas_excluidas || []);
  const resultados = {};
  FILAS.forEach(({ n, key }) => {
    const usarFila = (!esNeuquen || KEYS_NEUQUEN.has(key)) && !filasExcluidas.has(key);
    for (let c = 1; c <= NCOLS; c++) {
      const m = muestras[c - 1] || {};
      if (!usarFila) {
        resultados[`resultado_${n}_${c}`] = '__HIDE__';
      } else if (c > N) {
        // Solo ocurre cuando N=1 (NCOLS=2): col2 se hide via __SKIP_COL2__
        resultados[`resultado_${n}_${c}`] = '__SKIP_COL2__';
      } else {
        resultados[`resultado_${n}_${c}`] = m[key] ?? '';
      }
    }
  });

  // Para especimen plano (ancho/espesor opcionales, disponible en variante 'estandar')
  // Se aplica para todas las muestras presentes.
  if (!esNeuquen && muestras.some(m => m && m.ancho_promedio)) {
    for (let c = 1; c <= N; c++) {
      const m = muestras[c - 1] || {};
      resultados[`resultado_1_${c}`] = m.ancho_promedio ?? '';
      resultados[`resultado_2_${c}`] = m.espesor_promedio ?? '';
    }
  }

  // Sanitizar decimales: coma → punto en todos los valores numéricos de la
  // tabla de resultados. El técnico puede cargar "12,5" o "12.5" indistintamente
  // y el Word siempre sale con punto (convención LATAM técnica del laboratorio).
  const RX_NUM_CON_COMA = /^-?\d+,\d+$/;
  Object.keys(resultados).forEach(k => {
    const v = resultados[k];
    if (typeof v === 'string' && RX_NUM_CON_COMA.test(v.trim())) {
      resultados[k] = v.trim().replace(',', '.');
    }
  });

  // Ocultar filas donde TODAS las columnas de datos están vacías (o __SKIP_COL2__).
  // Si una fila tiene valores PARCIALES (alguna con dato, otras vacías), las
  // vacías se rellenan con "–" (guion medio, U+2013) para que el Word muestre
  // claramente que ese parámetro no aplica a esa probeta.
  FILAS.forEach(({ n }) => {
    const valores = [];
    for (let c = 1; c <= NCOLS; c++) valores.push(resultados[`resultado_${n}_${c}`]);
    if (valores[0] === '__HIDE__') return;
    const todasVaciasOSkip = valores.every(v => v === '' || v === '__SKIP_COL2__');
    if (todasVaciasOSkip) {
      for (let c = 1; c <= NCOLS; c++) resultados[`resultado_${n}_${c}`] = '__HIDE__';
      return;
    }
    // Fila con datos parciales: reemplazar celdas vacías por guion medio.
    for (let c = 1; c <= NCOLS; c++) {
      const v = resultados[`resultado_${n}_${c}`];
      if (v === '' || v == null) resultados[`resultado_${n}_${c}`] = '–';
    }
  });

  // Encabezados de columna — formato "O.T. [número]" igual al original
  // Normaliza el nro_ot quitando prefijo "O.T." si el usuario ya lo incluyó
  const nroOtBase = (ot.nro_ot || '').replace(/^O\.T\.?\s*/i, '');
  // 1 muestra              → "O.T. xxx" en col1, skip col2
  // N>=2 muestras flat     → "M1", "M2", ..., "MN"
  // Lados (RUAL-style)     → A, B, C, ... reset por lado (encima va una fila con nombres de lado)
  const encabezadosCols = {};
  if (unaMuestra) {
    encabezadosCols.encabezado_col1 = `O.T. ${nroOtBase}`;
    encabezadosCols.encabezado_col2 = '__SKIP_COL2__';
  } else if (usarLados) {
    let c = 1;
    for (const lado of lados) {
      for (let i = 0; i < lado.muestras.length; i++) {
        encabezadosCols[`encabezado_col${c}`] = String.fromCharCode(65 + i); // A, B, C, ...
        c++;
      }
    }
  } else {
    // Encabezado por columna: usa el nombre custom del técnico (muestras[i].nombre)
    // si está seteado; si no, default "M<n>" donde n es el índice de la probeta
    // FÍSICA (no el índice de columna). Las zonas extra heredan el número de
    // probeta física del padre — sin esto, "M2 con 1 zona + M3" se emitía como
    // "M1 | M2 (zona) | M3", saltando el número al pasar por la zona.
    let numProbetaFisica = 0;
    for (let c = 1; c <= NCOLS; c++) {
      const m = muestras[c - 1] || {};
      const esZona = !!(m && m._zona_extra);
      if (!esZona) numProbetaFisica++;
      const nombre = (m.nombre != null && String(m.nombre).trim() !== '')
        ? String(m.nombre).trim() : `M${numProbetaFisica || 1}`;
      encabezadosCols[`encabezado_col${c}`] = nombre;
    }
  }

  // Helper: agrupa valores por probeta y devuelve un array de líneas.
  //   Si todas las probetas tienen el mismo valor → "Etiqueta: valor" (1 línea).
  //   Si difieren → agrupa iguales con "(M1, M3)": "Etiqueta: valor1 (M1, M3), valor2 (M2)".
  //   Vacíos se ignoran.
  // Los campos `norma` y `codigo_referencia` pasan por normalizarNorma (saca
  // "/XxxM" redundante y sufijos duplicados tipo "(:2020)" o "(-26)").
  const NORMALIZAR_CAMPO = { norma: true, codigo_referencia: true };
  function agruparPorProbeta(etiqueta, key, sep) {
    // sep: separador entre etiqueta y valor. Default ": " (ej. "Norma de ensayo: X").
    // Para "Plano de probeta" usamos " según " → "Plano de probeta según X".
    const separador = sep || ': ';
    const normalizar = NORMALIZAR_CAMPO[key] ? normalizarNorma : (x => x);
    // Solo probetas físicas: las zonas extra (_zona_extra) heredan las
    // condiciones de su probeta padre y NO deben duplicarse en la línea de
    // "Norma de ensayo: ..." ni "Código de referencia: ..." del Word.
    const soloFisicas = (muestras || []).slice(0, N).filter(m => !(m && m._zona_extra));
    const items = soloFisicas.map((m, i) => {
      const raw = String((m && m[key]) || '').trim();
      const v = normalizar(raw);
      const nombre = (m && String(m.nombre || '').trim()) || `M${i + 1}`;
      return { nombre, valor: v };
    }).filter(x => x.valor);
    if (items.length === 0) return [];
    // Agrupar por valor.
    const grupos = new Map(); // valor → [nombres]
    items.forEach(x => {
      if (!grupos.has(x.valor)) grupos.set(x.valor, []);
      grupos.get(x.valor).push(x.nombre);
    });
    const valores = Array.from(grupos.keys());
    if (valores.length === 1) return [`${etiqueta}${separador}${valores[0]}`];
    // Difieren: "valor1 (M1, M3), valor2 (M2)"
    const partes = valores.map(v => {
      const nombres = grupos.get(v);
      return `${v} (${nombres.join(', ')})`;
    });
    return [`${etiqueta}${separador}${partes.join('; ')}`];
  }

  // Procedimientos (código de referencia global desde checkboxes).
  const procs = [];
  if (datos.cod_asme)    procs.push(`Código de referencia: ASME BPVC Sección IX Ed.${datos.ed_asme || '2025'}`);
  if (datos.cod_api1104) procs.push('Código de referencia: API 1104 Ed.22-2021 (E1-2023)');
  if (datos.cod_api5l)   procs.push('Código de referencia: API 5L');
  if (datos.cod_aws_d11) procs.push('Código de referencia: AWS D1.1-2020');
  if (datos.norma_astm_a370) {
    const suf = (function () {
      const v = String(datos.norma_astm_a370_year || '').trim();
      if (!v) return '-24';
      return (v[0] === '-' || v[0] === ':') ? v : '-' + v;
    })();
    procs.push('Norma de referencia: ASTM A370' + suf);
  }

  // Código de referencia POR PROBETA: se agrega al array de procs con formato
  // agrupado. Si un cliente tiene norma "ASME BPVC" en M1 y "API 5L" en M2/M3
  // → "Código de referencia: ASME BPVC (M1); API 5L (M2, M3)".
  procs.push(...agruparPorProbeta('Código de referencia', 'codigo_referencia'));

  // Probeta. Orden: booleanos primero (soldada / mecanizada por cliente),
  // luego "Probeta mecanizada según" y "Plano de probeta según" — pedido del
  // laboratorio, coincide con los preinformes físicos FM-*.
  const probetaLineas = [];
  if (datos.prob_soldada) probetaLineas.push('Probeta soldada');
  if (datos.prob_cliente) probetaLineas.push('Probeta mecanizada por el cliente');
  const probetaSegun = normalizarNorma((datos.probeta_segun || datos.figura_spec || datos.plano_asme || '').toString().trim());
  const habilitado   = datos.tiene_probeta_segun || datos.tiene_figura_spec || datos.tiene_plano_asme || !!probetaSegun;
  if (habilitado && probetaSegun)
    probetaLineas.push(`Probeta mecanizada según ${probetaSegun}`);
  // Plano de probeta (línea independiente). Se habilita si el checkbox tiene_plano_probeta
  // está marcado o si el campo plano_probeta tiene contenido.
  const planoProbeta = normalizarNorma((datos.plano_probeta || '').toString().trim());
  const planoHabilitado = datos.tiene_plano_probeta || !!planoProbeta;
  if (planoHabilitado && planoProbeta)
    probetaLineas.push(`Plano de probeta según ${planoProbeta}`);

  // Imagen — multi-imagen vía helper en post-proceso
  const fotos = Array.isArray(fotosCaratula) ? fotosCaratula.filter(Boolean) : [];
  const imagen_recepcion = fotos.length > 0 ? '__IMAGE_HERE__' : '__IMAGE_NONE__';

  const templateData = {
    // Carátula
    id_muestra:                       ot.id_muestra         || '',
    fecha_recepcion_muestra:          ot.fecha_recepcion     || '',
    fecha_aprobacion_inicio_trabajo:  ot.fecha_aprobacion    || '',
    fecha_generacion:                 ot.fecha_finalizacion  || '',
    razon_social:                     ot.razon_social        || '',
    imagen_recepcion,

    // Condiciones
    procedimientos_seleccionados:     procs.join('\n'),
    normas_seleccionadas:             (function () {
      // Prioridad:
      //   1) Si alguna probeta tiene su propia `norma` en muestras[i].norma
      //      → emitir agrupado por probeta (nuevo flujo).
      //   2) Fallback al flujo legacy con checkboxes globales.
      var lineas = [];
      var normasPorProbeta = agruparPorProbeta('Norma de ensayo', 'norma');
      if (normasPorProbeta.length) {
        lineas.push(...normasPorProbeta);
      } else {
        // Legacy: checkboxes globales + input libre.
        function sufAnio(key) {
          var v = String(datos[key + '_year'] || '').trim();
          if (!v) return '';
          return (v[0] === '-' || v[0] === ':') ? v : '-' + v;
        }
        var normasArr = [];
        if (datos.norma_iso6892_1) normasArr.push('ISO 6892-1' + sufAnio('norma_iso6892_1'));
        if (datos.norma_astm_e8)   normasArr.push('ASTM E8' + sufAnio('norma_astm_e8'));
        if (datos.norma_astm_a370) normasArr.push('ASTM A370' + sufAnio('norma_astm_a370'));
        function normalizarE8(s) { return String(s || '').replace(/\bE\s*8\s*\/\s*E\s*8\s*M\b/gi, 'E8'); }
        var normaLibre = normalizarE8(String(datos.norma || '').trim());
        if (normaLibre) normasArr.push(normaLibre);
        var normaLegacy = normalizarE8(String(datos.norma_ensayo || '').trim());
        var seen = new Set(normasArr.map(function (n) { return n.toLowerCase().replace(/\s+/g, ' ').trim(); }));
        if (normaLegacy) {
          var key = normaLegacy.toLowerCase().replace(/\s+/g, ' ').trim();
          if (!seen.has(key)) normasArr.push(normaLegacy);
        }
        if (normasArr.length === 1) lineas.push('Norma de ensayo: ' + normasArr[0]);
        else if (normasArr.length === 2) lineas.push('Norma de ensayo: ' + normasArr[0] + ' y ' + normasArr[1]);
        else if (normasArr.length > 2) {
          var last = normasArr[normasArr.length - 1];
          var rest = normasArr.slice(0, -1).join(', ');
          lineas.push('Norma de ensayo: ' + rest + ' y ' + last);
        }
      }
      if (datos.metodologia) lineas.push('Metodología de ensayo: ' + datos.metodologia);
      return lineas.join('\n');
    })(),
    probeta_mecanizada_segun: (() => {
      // Combina líneas globales del bloque probeta (prob_cliente, prob_soldada,
      // probeta_segun) + la línea agrupada de "Plano de probeta" por probeta.
      const planoLineas = agruparPorProbeta('Plano de probeta', 'plano_probeta', ' según ');
      return [...probetaLineas, ...planoLineas].join('\n');
    })(),
    probeta_mecanizada_por_cliente:   '',
    probeta_soldada:                  '',
    orientacion_probeta: (() => {
      const lineas = agruparPorProbeta('Orientación de la probeta', 'orientacion');
      if (lineas.length) return lineas[0];
      // Fallback al valor global si por probeta está vacío.
      return datos.orientacion ? `Orientación de la probeta: ${datos.orientacion}` : '';
    })(),
    temperatura_ensayo:  datos.temperatura != null && String(datos.temperatura).trim() !== ''
      ? `Temperatura de ensayo: ${datos.temperatura}°C` : '',
    temperatura_probeta: datos.temperatura_probeta != null && String(datos.temperatura_probeta).trim() !== ''
      ? `Temperatura de probeta: ${datos.temperatura_probeta}°C` : '',
    tiempo_a_temperatura: (datos.tiempo_a_temperatura || '').toString().trim()
      ? `Tiempo a temperatura: ${datos.tiempo_a_temperatura}` : '',

    // Equipamiento
    ...equipSlots,

    // numero_ot → usado en encabezado de página ("OT: {{numero_ot}}"), solo el número
    numero_ot:      nroOtBase,

    // Encabezados de columna de tabla (dinámicos según cantidad de muestras)
    ...encabezadosCols,

    // Unidades: neuquén siempre MPa; estándar usa lo que el técnico eligió (default MPa)
    unidad_resistencia_traccion: !esNeuquen ? (datos.unidad || 'MPa') : 'MPa',
    unidad_tension_fluencia:     !esNeuquen ? (datos.unidad || 'MPa') : 'MPa',

    // Resultados
    ...resultados,

    // Secciones opcionales INDEPENDIENTES: cada una con su flag propio +
    // numeración automática en el header del bloque en el .docx (se inyecta
    // por post-proceso más abajo si el placeholder no existe).
    // Nombres de placeholder (para compatibilidad con el template actual):
    //   observaciones_evaluacion → EVALUACIÓN (renombrado en post-proceso)
    //   notas_seleccionadas      → NOTA
    // La OBSERVACIÓN se inyecta separada por post-proceso XML si tiene_observacion.
    notas_seleccionadas: (() => {
      const partes = [];
      if (datos.tiene_nota && String(datos.nota_texto || '').trim()) {
        partes.push(String(datos.nota_texto).trim());
      }
      // Notas fijas pre-definidas (checkboxes de textos hardcoded).
      if (datos.nota_evaluaciones)  partes.push('Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA.');
      if (datos.nota_no_conforme)   partes.push('El ítem marcado con (**) corresponde a un trabajo no conforme.');
      if (datos.nota_incertidumbre) partes.push('El cliente desea incorporar el dato de incertidumbre.');
      if (datos.nota_externo)       partes.push('Los resultados marcados con (***) provienen de proveedor externo.');
      return partes.length ? partes.join('\n') : '__SECTION_HIDE__';
    })(),
    observaciones_evaluacion: (() => {
      const obs  = datos.tiene_observacion && String(datos.observacion_texto || '').trim();
      const evalt = datos.tiene_evaluacion && String(datos.evaluacion_texto  || '').trim();
      // Si ninguno está activo, ocultar toda la sección.
      if (!obs && !evalt) return '__SECTION_HIDE__';
      // Si solo uno, poner el texto directo. El heading se renombra por post-proceso.
      if (obs && !evalt)  return obs;
      if (evalt && !obs)  return evalt;
      // Ambos: separar en 2 párrafos precedidos por un pseudo-heading en línea
      // (el heading del template dirá "OBSERVACIÓN Y EVALUACIÓN"). Docxtemplater
      // con linebreaks:true respeta los \n.
      return 'Observación: ' + obs + '\n\n' + 'Evaluación: ' + evalt;
    })(),
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
    const tituloRe = /(<w:t[^>]*>)(ENSAYO DE TRACCION)(\*?)(\s*<\/w:t>)/;
    if (tituloRe.test(outXml)) {
      outXml = outXml.replace(tituloRe, function (m, pre, txt, ya, close) {
        return ya === '*' ? m : pre + txt + '*' + close;
      });
    }
  }


  // Renombrar el heading "EVALUACION DE RESULTADOS" según qué secciones estén
  // activas (observación / evaluación / ambos). Si ninguna, la sección entera
  // se elimina por __SECTION_HIDE__ más abajo.
  {
    const tieneObs  = !!(datos.tiene_observacion && String(datos.observacion_texto || '').trim());
    const tieneEval = !!(datos.tiene_evaluacion  && String(datos.evaluacion_texto  || '').trim());
    let nuevoHeading = null;
    if (tieneObs && tieneEval) nuevoHeading = 'OBSERVACIÓN Y EVALUACIÓN';
    else if (tieneObs)         nuevoHeading = 'OBSERVACIÓN';
    else if (tieneEval)        nuevoHeading = 'EVALUACIÓN';
    if (nuevoHeading) {
      outXml = outXml.replace(
        /(<w:t[^>]*>)EVALUACION DE RESULTADOS(<\/w:t>)/g,
        (m, a, b) => a + nuevoHeading + b
      );
    }
  }

  outXml = eliminarColumnaOculta(outXml);   // quita col3 si solo hay 1 muestra
  outXml = eliminarFilasOcultas(outXml);    // quita filas con __HIDE__
  outXml = eliminarSeccionesOcultas(outXml);// quita título + párrafo __SECTION_HIDE__

  // Nota OAA en negrita antes del texto de evaluación (solo si es ensayo OAA
  // y hay texto de evaluación cargado). Formato del laboratorio (FM):
  //   "Las evaluaciones, opiniones, interpretaciones, etc, que se indican a
  //   continuación, están fuera del alcance de la acreditación del OAA."
  // Con comillas tipográficas (U+201C / U+201D) y todo en negrita.
  outXml = insertarNotaOAAEnEvaluacion(outXml, datos);

  outXml = manejarImagenesCaratula(processedZip, outXml, fotos, 'traccion');

  outXml = eliminarParrafosVacios(outXml);
  outXml = centrarTabla(outXml);
  outXml = negritarPrimeraColumna(outXml);
  outXml = forzarCalibriEnTabla(outXml);
  outXml = forzarCalibri(outXml);
  // Los asteriscos en Tensión fluencia / Alargamiento / Estricción y la nota
  // "Los parámetros marcados con (*)..." van SIEMPRE juntos y sólo cuando el
  // ensayo tracción ES ACREDITADO. La nota informa al cliente que esos
  // parámetros no están dentro del alcance OAA aunque el resto del ensayo sí.
  // Cuando el ensayo NO es acreditado no hay que marcar nada — no aporta info
  // útil y ensucia. Usamos `_oaa_original` para preservar el estado antes del
  // override de uniformidad que hace el combinador (recordar: oaa=true = NO
  // acreditado).
  // `_es_acreditado` viene del agente-oaa y refleja la detección real del
  // ensayo (norma+edición+temp+sede). Se prefiere sobre el flag `oaa` legacy
  // que sólo indica el asterisco (mixto).
  const ensayoAcreditado = datos._es_acreditado === true
    || (datos._es_acreditado === undefined && (datos._oaa_original !== undefined ? datos._oaa_original !== true : datos.oaa !== true));
  if (ensayoAcreditado) {
    const asteriscoKeys = Array.from(new Set([
      'tension_fluencia', 'alargamiento', 'estriccion',
      ...(datos.filas_con_asterisco || []),
    ]));
    outXml = aplicarAsteriscosEnLabels(outXml, asteriscoKeys);
    outXml = insertarNotaParametros(outXml,
      '"Los parámetros marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');
  }
  // Pintar de azul claro (D9E2F3) las 4 filas destacadas del modelo Dunlop —
  // efecto puramente visual, va independiente de acreditación.
  outXml = pintarFilasResaltadas(outXml, [
    'resistencia_traccion', 'tension_fluencia', 'alargamiento', 'estriccion',
  ]);
  outXml = ajustarEspaciado(outXml);

  // W5: texto OAA centrado en negrita antes de FIN DE INFORME. Usamos la nota
  // estándar "Los ensayos marcados con (*)..." consistente con los demás ensayos.
  // La nota "Los parámetros marcados con (*)..." va DEBAJO DE LA TABLA cuando
  // el ensayo es acreditado (ver `insertarNotaParametros` arriba).
  const textosOAA = [];
  if (datos.oaa) textosOAA.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');
  outXml = insertarOAAAntesDeFin(outXml, textosOAA);

  outXml = minimizarUltimoParagrafo(outXml);

  processedZip.file('word/document.xml', outXml);
  return processedZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ── Post-proceso: funciones ───────────────────────────────────────────────────

// Mapea cada `key` del form a un texto que identifica la celda-label en la tabla.
// Si una key está en `filas_con_asterisco`, se le agrega `*` al texto.
const LABELS_BY_KEY = {
  'ancho_promedio':       'Ancho promedio',
  'espesor_promedio':     'Espesor promedio',
  'diametro_promedio':    'Diámetro promedio',
  'seccion_inicial':      'Sección inicial S0',
  'carga_maxima':         'Carga máxima',
  'resistencia_traccion': 'Resistencia a la tracción',
  'carga_fluencia':       'Carga de fluencia',
  'tension_fluencia':     'Tensión de fluencia',
  'longitud_inicial':     'Longitud inicial',
  'longitud_final':       'Longitud final',
  'alargamiento':         'Alargamiento',
  'diametro_final':       'Diámetro final',
  'seccion_final':        'Sección final',
  'estriccion':           'Estricción',
  'defectos':             'Defectos',
  'zona_rotura':          'Zona de rotura',
  'tipo_rotura':          'Tipo de rotura',
  'lado_rotura':          'Lado de rotura',
};

// Agrega '*' al final del label de cada fila cuyo key esté en `keys`.
// Operación: para cada <w:tc> que contenga el label, modifica el último <w:t>
// de esa celda y le agrega un asterisco. Si ya termina con *, no duplica.
function aplicarAsteriscosEnLabels(xml, keys) {
  if (!keys || keys.length === 0) return xml;
  const targets = keys
    .map(k => LABELS_BY_KEY[k])
    .filter(Boolean);
  if (targets.length === 0) return xml;

  return xml.replace(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, cell => {
    const texto = [...cell.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
      .map(m => m[1]).join('');
    // Hacer match exacto del label como prefijo (evita matchear "Sección final" cuando buscamos "Sección inicial")
    const labelMatch = targets.find(t => texto.trim().startsWith(t));
    if (!labelMatch) return cell;
    if (texto.trim().endsWith('*')) return cell; // ya tiene *
    // Modificar el ÚLTIMO <w:t> de la celda agregando * al final
    // Regex: el último <w:t>...</w:t> (negative-lookahead asegura que no hay otro <w:t> después)
    return cell.replace(
      /(<w:t[^>]*>)([^<]*)(<\/w:t>)(?![\s\S]*<w:t[\s>])/,
      (m, open, text, close) => `${open}${text}*${close}`
    );
  });
}

// Pinta de color de fondo (D9E2F3 = azul claro del modelo Dunlop) las celdas
// de cada fila cuyo label corresponda a una `key` en LABELS_BY_KEY.
function pintarFilasResaltadas(xml, keys) {
  if (!keys || keys.length === 0) return xml;
  const targets = keys.map(k => LABELS_BY_KEY[k]).filter(Boolean);
  if (targets.length === 0) return xml;
  const SHD = '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>';

  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    // Detectar si esta fila comienza con alguno de los labels target
    const txt = [...row.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('').trim();
    const match = targets.find(t => txt.startsWith(t));
    if (!match) return row;
    // En cada <w:tc> de la fila, agregar w:shd dentro de <w:tcPr> (o crear tcPr si no existe).
    return row.replace(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g, cell => {
      if (cell.includes('w:fill="D9E2F3"')) return cell;
      if (/<w:tcPr>/.test(cell)) {
        // Quitar shd previo si lo tuviera
        let c = cell.replace(/<w:shd\b[^/]*\/>/, '');
        return c.replace('<w:tcPr>', '<w:tcPr>' + SHD);
      }
      // Crear <w:tcPr> con shd justo después de <w:tc...>
      return cell.replace(/(<w:tc\b[^>]*>)/, '$1<w:tcPr>' + SHD + '</w:tcPr>');
    });
  });
}

// Inserta un párrafo con la nota "Los parámetros marcados con (*)..." después
// de la tabla de resultados. Se busca el caption "Tabla N°X - Resultados ensayo
// de tracción" y se inserta DESPUÉS de ese párrafo.
function insertarNotaParametros(xml, texto) {
  const fonts = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
  const sz    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  const esc = String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const nota = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/>' +
    '<w:jc w:val="center"/></w:pPr>' +
    `<w:r><w:rPr>${fonts}<w:b/><w:bCs/>${sz}</w:rPr>` +
    `<w:t xml:space="preserve">${esc}</w:t></w:r></w:p>`;
  // Blank antes y después
  const blank = '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/></w:pPr></w:p>';

  // Buscar el caption "Tabla N°... Resultados ensayo de tracción"
  const re = /<w:p\b[^>]*>(?:(?!<w:p\b)[\s\S])*?Tabla\s*N[°˚º](?:(?!<\/w:p>)[\s\S])*?ensayo\s+de\s+tracci(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/i;
  const m = xml.match(re);
  if (m) {
    const idx = m.index + m[0].length;
    return xml.slice(0, idx) + blank + nota + xml.slice(idx);
  }
  // Fallback: insertar antes de "FIN DE INFORME"
  const fin = xml.indexOf('FIN DE INFORME');
  if (fin < 0) return xml;
  const pFin = xml.lastIndexOf('<w:p', fin);
  return xml.slice(0, pFin) + blank + nota + xml.slice(pFin);
}

// Elimina filas donde ALGUNA celda contiene exactamente '__HIDE__'
// (no __SKIP_COL2__ ni __SECTION_HIDE__ que tienen distintos propósitos)
function eliminarFilasOcultas(xml) {
  return xml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    // Busca el marcador exacto rodeado de < o > para no confundir con __SKIP_COL2__
    if (/__HIDE__(?!_)/.test(row)) return '';
    return row;
  });
}

// Elimina la 3ª columna (datos de muestra 2) cuando solo hay 1 muestra
function eliminarColumnaOculta(xml) {
  if (!xml.includes('__SKIP_COL2__')) return xml;

  // Construye el resultado eliminando cada <w:tc> que contenga __SKIP_COL2__
  // sin cruzar límites de otras celdas ([\s\S]*? cruzaría </w:tc>).
  let result = '';
  let pos = 0;

  while (true) {
    const markerPos = xml.indexOf('__SKIP_COL2__', pos);
    if (markerPos < 0) { result += xml.slice(pos); break; }

    const tcClose = xml.indexOf('</w:tc>', markerPos);
    if (tcClose < 0) { result += xml.slice(pos); break; }

    const tcOpen = scanBackForTag(xml, '<w:tc', markerPos);
    if (tcOpen < 0 || tcOpen < pos) {
      result += xml.slice(pos, markerPos + '__SKIP_COL2__'.length);
      pos = markerPos + '__SKIP_COL2__'.length;
      continue;
    }

    result += xml.slice(pos, tcOpen);
    pos = tcClose + '</w:tc>'.length;
  }

  // Quita el último <w:gridCol> de <w:tblGrid>
  result = result.replace(
    /(<w:tblGrid>(?:<w:gridCol\b[^>]*\/>)+)(<w:gridCol\b[^>]*\/>)(<\/w:tblGrid>)/,
    '$1$3'
  );
  return result;
}

// Pre-render: inserta una fila NUEVA antes del header existente que agrupa columnas
// por lado, usando w:gridSpan según la cantidad de muestras de cada lado.
// Estructura resultante:
//   Fila NUEVA: "Lado" | <gridSpan=N1>NombreLado1 | <gridSpan=N2>NombreLado2 | ...
//   Fila existente: "Parámetros" | A | B | C | A | B | C | ...
function agregarFilaLados(xml, lados) {
  // Localizar la tabla de resultados por el placeholder de su header
  const idx = xml.indexOf('encabezado_col1');
  if (idx < 0) return xml;
  // Encontrar el <w:tr> que contiene el header existente (texto "Parámetros").
  // Cuidado: `lastIndexOf('<w:tr', idx)` matchearía también `<w:trPr`. Usamos
  // un escaneo que requiere que el carácter siguiente sea ' ' o '>'.
  function findOpenTagBefore(s, tag, before) {
    let cursor = before;
    while (cursor > 0) {
      const i = s.lastIndexOf('<' + tag, cursor - 1);
      if (i < 0) return -1;
      const c = s[i + 1 + tag.length];
      if (c === '>' || c === ' ' || c === '\t' || c === '\r' || c === '\n') return i;
      cursor = i;
    }
    return -1;
  }
  const trStart = findOpenTagBefore(xml, 'w:tr', idx);
  if (trStart < 0) return xml;
  const trEndIdx = xml.indexOf('</w:tr>', idx) + '</w:tr>'.length;
  const trXml = xml.slice(trStart, trEndIdx);

  // <w:tr> open tag (preserva atributos como w:rsidR)
  const trOpenMatch = trXml.match(/^<w:tr\b[^>]*>/);
  const trOpen = trOpenMatch ? trOpenMatch[0] : '<w:tr>';

  // Celdas del header existente (1ª = label "Parámetros", 2ª = primera columna de datos)
  const tcs = [...trXml.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)];
  if (tcs.length < 2) return xml;
  const labelTc = tcs[0][0];
  const dataTc  = tcs[1][0];

  // Reemplaza el texto de una celda: deja un solo <w:t> con el nuevo contenido
  // (mantiene estilo y formato del primer <w:r>). Si la celda tiene placeholder
  // {{...}} dentro de su único <w:t>, se reemplaza por nuevoTexto.
  function setCellText(cellXml, nuevoTexto) {
    const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 1) Reemplazar el primer <w:t...>...</w:t> con el nuevo texto
    let out = cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/, (m, attrs, _) =>
      `<w:t${attrs.includes('xml:space') ? attrs : attrs + ' xml:space="preserve"'}>${escape(nuevoTexto)}</w:t>`);
    // 2) Quitar runs de texto adicionales (otros <w:t>...</w:t> en la misma celda)
    let count = 0;
    out = out.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, m => {
      count++;
      return count === 1 ? m : '';
    });
    return out;
  }

  // Inyecta <w:gridSpan w:val="N"/> dentro de <w:tcPr>. Si no existe <w:tcPr>, lo crea.
  function setGridSpan(cellXml, n) {
    if (n <= 1) return cellXml;
    if (/<w:gridSpan\b/.test(cellXml)) {
      return cellXml.replace(/<w:gridSpan w:val="\d+"\s*\/>/, `<w:gridSpan w:val="${n}"/>`);
    }
    if (cellXml.includes('<w:tcPr>')) {
      return cellXml.replace('<w:tcPr>', `<w:tcPr><w:gridSpan w:val="${n}"/>`);
    }
    return cellXml.replace(/<w:tc\b[^>]*>/, m => m + `<w:tcPr><w:gridSpan w:val="${n}"/></w:tcPr>`);
  }

  // Celda 1: "Lado" (clona labelTc, cambia texto)
  const ladoLabelCell = setCellText(labelTc, 'Lado');
  // Celdas siguientes: una por lado, con gridSpan según cantidad de muestras
  const ladoCells = lados.map(L => {
    const n = (L.muestras || []).length;
    let cell = setCellText(dataTc, L.nombre);
    cell = setGridSpan(cell, n);
    return cell;
  });

  const newRow = trOpen + ladoLabelCell + ladoCells.join('') + '</w:tr>';
  return xml.slice(0, trStart) + newRow + xml.slice(trStart);
}

// Pre-render: si hay >2 muestras, duplica la última celda de cada fila de la tabla
// de resultados para llegar a N columnas. Renombra los placeholders
// {{resultado_X_2}} → {{resultado_X_3}}, {{resultado_X_4}}, ..., {{resultado_X_N}}
// y {{encabezado_col2}} → {{encabezado_col3}}, ..., {{encabezado_colN}}.
// Agrega N-2 <w:gridCol/> (clonando el último) para mantener consistencia del grid.
function expandirColumnasResultados(xml, n) {
  if (n <= 2) return xml;
  const idx = xml.indexOf('encabezado_col1');
  if (idx < 0) return xml;
  const tblStart   = xml.lastIndexOf('<w:tbl>', idx);
  const tblEndCore = xml.indexOf('</w:tbl>', idx);
  if (tblStart < 0 || tblEndCore < 0) return xml;
  const tblEnd = tblEndCore + '</w:tbl>'.length;
  let tbl = xml.slice(tblStart, tblEnd);

  // 1. Agregar N-2 <w:gridCol/> (clones del último)
  const gridCols = [...tbl.matchAll(/<w:gridCol\b[^/]*\/>/g)];
  if (gridCols.length === 0) return xml;
  const lastGc = gridCols[gridCols.length - 1];
  const insertAt = lastGc.index + lastGc[0].length;
  const extraGc = lastGc[0].repeat(n - 2);
  tbl = tbl.slice(0, insertAt) + extraGc + tbl.slice(insertAt);

  // 2. Para cada fila, duplicar la última <w:tc> (N-2) veces con placeholder renombrado
  tbl = tbl.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    const tcs = [...row.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)];
    if (tcs.length === 0) return row;
    const lastTc = tcs[tcs.length - 1];
    const phMatch = lastTc[0].match(/\{\{(resultado_(\d+)_2|encabezado_col2)\}\}/);
    if (!phMatch) return row;
    const tcEndIdx = lastTc.index + lastTc[0].length;
    const newCells = [];
    for (let c = 3; c <= n; c++) {
      let newCell;
      if (phMatch[1].startsWith('resultado_')) {
        newCell = lastTc[0].replace(/\{\{resultado_(\d+)_2\}\}/, `{{resultado_$1_${c}}}`);
      } else {
        newCell = lastTc[0].replace(/\{\{encabezado_col2\}\}/, `{{encabezado_col${c}}}`);
      }
      newCells.push(newCell);
    }
    return row.slice(0, tcEndIdx) + newCells.join('') + row.slice(tcEndIdx);
  });

  return xml.slice(0, tblStart) + tbl + xml.slice(tblEnd);
}

// ── Helper compartido: findOpenTagBefore ────────────────────────────────
// Busca el último <tag ...> o <tag> antes de `before` (evita confundir
// <w:tr> con <w:trPr>, <w:tc> con <w:tcPr>, etc.). Usado por
// mergeHeaderProbetas y agregarFilaZonas.
function findOpenTagBefore(s, tag, before) {
  let cursor = before;
  while (cursor > 0) {
    const i = s.lastIndexOf('<' + tag, cursor - 1);
    if (i < 0) return -1;
    const c = s[i + 1 + tag.length];
    if (c === '>' || c === ' ' || c === '\t' || c === '\r' || c === '\n') return i;
    cursor = i;
  }
  return -1;
}

// mergeHeaderProbetas — aplica <w:gridSpan> a la celda del header de cada
// probeta física que tenga zonas extra ligadas, y ELIMINA las celdas de las
// zonas (que quedarían debajo del span). Se ejecuta ANTES de docxtemplater,
// sobre los placeholders {{encabezado_colN}}. Mapeo:
//   col 1 → muestras[0]
//   col 2 → muestras[1]
//   ...
// Para cada muestra que sea `_zona_extra`, su columna se descarta del header
// (queda mergeada bajo la celda de su probeta padre).
function mergeHeaderProbetas(xml, muestras, NCOLS) {
  const idx = xml.indexOf('encabezado_col1');
  if (idx < 0) return xml;

  // Calcular por columna: es zona o no, y si es probeta física, cuántas zonas
  // contiguas la siguen (colspan).
  const colInfo = [];
  for (let c = 1; c <= NCOLS; c++) {
    const m = muestras[c - 1] || {};
    if (m && m._zona_extra) {
      colInfo.push({ esZona: true, colspan: 0 });
    } else {
      let cs = 1;
      for (let k = c + 1; k <= NCOLS; k++) {
        const mk = muestras[k - 1] || {};
        if (mk && mk._zona_extra) cs++;
        else break;
      }
      colInfo.push({ esZona: false, colspan: cs });
    }
  }

  const trStart = findOpenTagBefore(xml, 'w:tr', idx);
  if (trStart < 0) return xml;
  const trEndIdx = xml.indexOf('</w:tr>', idx) + '</w:tr>'.length;
  const trXml = xml.slice(trStart, trEndIdx);
  const trOpenMatch = trXml.match(/^<w:tr\b[^>]*>/);
  const trOpen = trOpenMatch ? trOpenMatch[0] : '<w:tr>';

  // Preservar cualquier <w:trPr> u otros nodos antes del primer <w:tc>.
  const firstTcRelIdx = trXml.indexOf('<w:tc');
  const preambulo = trOpenMatch ? trXml.slice(trOpenMatch[0].length, firstTcRelIdx) : '';

  const cells = [...trXml.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map(m => m[0]);
  // Se espera 1 label + NCOLS celdas de datos. Si no coincide, abortar.
  if (cells.length < 1 + NCOLS) return xml;

  // Celda "Parámetros" (label): agregar <w:vMerge w:val="restart"/> para que
  // ocupe verticalmente esta fila + la fila "Zona" (que va debajo). Sin esto,
  // la primera celda de la fila Zona muestra "Zona" como label, y la imagen
  // del user pide que esa celda quede tapada por "Parámetros".
  function setVMergeRestart(cellXml) {
    if (/<w:vMerge\b/.test(cellXml)) return cellXml;
    // Insertar vMerge JUSTO ANTES de </w:tcPr> (al final) o crear tcPr si no
    // existe. Word acepta vMerge en cualquier posición del tcPr en la práctica.
    if (/<w:tcPr>[\s\S]*?<\/w:tcPr>/.test(cellXml)) {
      return cellXml.replace('</w:tcPr>', '<w:vMerge w:val="restart"/></w:tcPr>');
    }
    return cellXml.replace(/<w:tc\b[^>]*>/, m2 => m2 + '<w:tcPr><w:vMerge w:val="restart"/></w:tcPr>');
  }
  const nuevasCeldas = [setVMergeRestart(cells[0])]; // label "Parámetros" con rowspan
  for (let c = 1; c <= NCOLS; c++) {
    const cellXml = cells[c];
    const info = colInfo[c - 1];
    if (info.esZona) continue; // eliminar celda mergeada
    let mod = cellXml;
    if (info.colspan > 1) {
      // Probeta CON zonas: gridSpan horizontal, NO rowspan (la fila Zona
      // muestra los nombres de las zonas debajo).
      if (/<w:gridSpan\b/.test(mod)) {
        mod = mod.replace(/<w:gridSpan w:val="\d+"\s*\/>/, `<w:gridSpan w:val="${info.colspan}"/>`);
      } else if (mod.includes('<w:tcPr>')) {
        mod = mod.replace('<w:tcPr>', `<w:tcPr><w:gridSpan w:val="${info.colspan}"/>`);
      } else {
        mod = mod.replace(/<w:tc\b[^>]*>/, m2 => m2 + `<w:tcPr><w:gridSpan w:val="${info.colspan}"/></w:tcPr>`);
      }
    } else {
      // Probeta SIN zonas: rowspan vertical sobre las 2 filas del header
      // (la fila Zona tendrá vMerge continue vacío para esa columna).
      mod = setVMergeRestart(mod);
    }
    nuevasCeldas.push(mod);
  }

  const nuevoTr = trOpen + preambulo + nuevasCeldas.join('') + '</w:tr>';
  return xml.slice(0, trStart) + nuevoTr + xml.slice(trEndIdx);
}

// agregarFilaZonas — inserta una fila NUEVA debajo del header con label
// "Zona" y los valores muestras[i].zona en cada columna. La fila no lleva
// merges: una celda por muestra, incluso para las zonas extra.
// Debe ejecutarse DESPUÉS de mergeHeaderProbetas (así encuentra el <w:tr>
// que ya está mergeado y la nueva fila queda debajo).
function agregarFilaZonas(xml, muestras, NCOLS) {
  const idx = xml.indexOf('encabezado_col1');
  if (idx < 0) return xml;
  const trStart = findOpenTagBefore(xml, 'w:tr', idx);
  if (trStart < 0) return xml;
  const trEndIdx = xml.indexOf('</w:tr>', idx) + '</w:tr>'.length;
  const trXml = xml.slice(trStart, trEndIdx);
  const trOpenMatch = trXml.match(/^<w:tr\b[^>]*>/);
  const trOpen = trOpenMatch ? trOpenMatch[0] : '<w:tr>';

  const cells = [...trXml.matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map(m => m[0]);
  if (cells.length < 2) return xml;
  const labelTc = cells[0];
  // Buscar una celda de dato SIN gridSpan (más limpia para clonar).
  let dataTc = null;
  for (let i = 1; i < cells.length; i++) {
    if (!/<w:gridSpan\b/.test(cells[i])) { dataTc = cells[i]; break; }
  }
  if (!dataTc) dataTc = cells[1];

  function setCellText(cellXml, texto) {
    const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let out = cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/, (m, attrs) =>
      `<w:t${attrs.includes('xml:space') ? attrs : attrs + ' xml:space="preserve"'}>${escape(texto)}</w:t>`);
    let count = 0;
    out = out.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, m => {
      count++;
      return count === 1 ? m : '';
    });
    // Quitar gridSpan y vMerge heredados de la celda plantilla — esta celda
    // muestra su propio texto, no continúa ni inicia un merge.
    out = out.replace(/<w:gridSpan[^/]*\/>/g, '');
    out = out.replace(/<w:vMerge\b[^/]*\/>/g, '');
    return out;
  }

  // Primera celda: continuación del vMerge iniciado en el header por
  // mergeHeaderProbetas. Sin texto — visualmente queda tapada por "Parámetros".
  function toVMergeContinue(cellXml) {
    // Vaciar el texto (los <w:t> quedan como <w:t></w:t>).
    let out = cellXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, '<w:t$1></w:t>');
    // Quitar gridSpan si venía de la celda plantilla (para que la fila zona
    // tenga una celda por columna del grid, no menos).
    out = out.replace(/<w:gridSpan[^\/]*\/>/g, '');
    // Si la celda ya tiene un vMerge (heredado del header mergeado), FORZAR
    // que sea continue: reemplazar <w:vMerge w:val="restart"/> por <w:vMerge/>.
    // Antes tenía un early-return acá que hacía que la fila zona clonada
    // conservara "restart" y Word dibujara divisiones extras.
    if (/<w:vMerge\b/.test(out)) {
      return out.replace(/<w:vMerge\b[^/]*\/>/g, '<w:vMerge/>');
    }
    if (/<w:tcPr>[\s\S]*?<\/w:tcPr>/.test(out)) {
      return out.replace('</w:tcPr>', '<w:vMerge/></w:tcPr>');
    }
    return out.replace(/<w:tc\b[^>]*>/, m2 => m2 + '<w:tcPr><w:vMerge/></w:tcPr>');
  }
  const zonaLabelCell = toVMergeContinue(labelTc);
  // Cálculo de colInfo local (misma lógica que en mergeHeaderProbetas):
  // para cada columna saber si es zona o probeta física, y en el segundo caso
  // cuántas zonas contiguas la siguen.
  const zonaColInfo = [];
  for (let c = 1; c <= NCOLS; c++) {
    const m = muestras[c - 1] || {};
    if (m && m._zona_extra) {
      zonaColInfo.push({ esZona: true, colspan: 0 });
    } else {
      let cs = 1;
      for (let k = c + 1; k <= NCOLS; k++) {
        const mk = muestras[k - 1] || {};
        if (mk && mk._zona_extra) cs++;
        else break;
      }
      zonaColInfo.push({ esZona: false, colspan: cs });
    }
  }
  const zonaCells = [];
  for (let c = 1; c <= NCOLS; c++) {
    const m = muestras[c - 1] || {};
    const info = zonaColInfo[c - 1];
    if (info.esZona) {
      // Zona extra: mostrar el nombre de la zona.
      const z = String((m && m.zona) || '').trim();
      zonaCells.push(setCellText(dataTc, z));
    } else if (info.colspan > 1) {
      // Probeta física CON zonas: mostrar el nombre de zona del padre
      // (ej. "Superficie") en la celda debajo de la de la probeta.
      const z = String((m && m.zona) || '').trim();
      zonaCells.push(setCellText(dataTc, z));
    } else {
      // Probeta física SIN zonas: vMerge continue vacío — visualmente se
      // "funde" con la celda de la probeta de arriba (M2/M3 sin subdivisión).
      zonaCells.push(toVMergeContinue(dataTc));
    }
  }
  const newRow = trOpen + zonaLabelCell + zonaCells.join('') + '</w:tr>';
  return xml.slice(0, trEndIdx) + newRow + xml.slice(trEndIdx);
}

// Elimina el párrafo de título + el párrafo de contenido marcado con __SECTION_HIDE__.
// Salta párrafos en blanco que el template pueda tener entre título y contenido.
// Inserta la nota OAA como PRIMER párrafo dentro de la sección de Evaluación
// (después del heading, antes del texto que escribió el técnico).
//   Regla: solo si el ensayo es OAA (datos.oaa) y hay texto de evaluación.
//   Formato: texto exacto entre comillas tipográficas U+201C/U+201D, en negrita,
//   fuente Calibri, con la misma indentación que el body del template.
function insertarNotaOAAEnEvaluacion(xml, datos) {
  const esOaa = !!(datos && (datos.oaa || datos._oaa_original));
  const tieneEval = !!(datos && datos.tiene_evaluacion &&
                       String(datos.evaluacion_texto || '').trim());
  if (!esOaa || !tieneEval) return xml;

  // El heading puede haber sido renombrado por el pase anterior. Buscamos
  // el que se aplicó (más específico primero).
  const HEADINGS = [
    'OBSERVACIÓN Y EVALUACIÓN',
    'EVALUACIÓN',
    'EVALUACION DE RESULTADOS',
  ];
  let idxHeading = -1;
  for (const h of HEADINGS) {
    const re = new RegExp('<w:t[^>]*>\\s*' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*</w:t>');
    const m = re.exec(xml);
    if (m) { idxHeading = m.index; break; }
  }
  if (idxHeading < 0) return xml;

  // Cerrar el párrafo del heading para insertar DESPUÉS.
  const headingEndIdx = xml.indexOf('</w:p>', idxHeading);
  if (headingEndIdx < 0) return xml;
  const insertPos = headingEndIdx + '</w:p>'.length;

  const notaTxt = 'Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA.';
  // Comillas tipográficas: U+201C “ y U+201D ”.
  const parrafo =
    '<w:p><w:pPr><w:pStyle w:val="Textosinformato"/>' +
    '<w:spacing w:line="276" w:lineRule="auto"/>' +
    '<w:ind w:left="792"/>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:b/></w:rPr></w:pPr>' +
    '<w:r>' +
    '<w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:b/></w:rPr>' +
    '<w:t xml:space="preserve">“' + notaTxt + '”</w:t>' +
    '</w:r></w:p>';

  return xml.slice(0, insertPos) + parrafo + xml.slice(insertPos);
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

    // Retroceder saltando blancos hasta llegar al párrafo de título (no-blanco)
    let removeFrom = pOpen;
    let cursor = pOpen;
    while (true) {
      const prevClose = result.lastIndexOf('</w:p>', cursor - 1);
      if (prevClose < 0) break;
      const prevOpen = scanBackForTag(result, '<w:p', prevClose);
      if (prevOpen < 0) break;
      const para = result.slice(prevOpen, prevClose + '</w:p>'.length);
      removeFrom = prevOpen;
      if (!esParrafoBlanco(para)) break; // encontramos el título
      cursor = prevOpen;
    }

    result = result.slice(0, removeFrom) + result.slice(contentEnd);
  }
  return result;
}

// Elimina el párrafo de imagen vacía + el párrafo de epígrafe que le sigue
function eliminarImagenVacia(xml) {
  const markerPos = xml.indexOf('__IMAGE_NONE__');
  if (markerPos < 0) return xml;

  const pClose = xml.indexOf('</w:p>', markerPos);
  if (pClose < 0) return xml;
  const imgParaEnd = pClose + '</w:p>'.length;

  const pOpen = scanBackForTag(xml, '<w:p', markerPos);
  if (pOpen < 0) return xml;

  // Busca y elimina también el párrafo siguiente (epígrafe "Imagen N°1...")
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

// Inserta la imagen reemplazando el párrafo marcador __IMAGE_HERE__
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

// Elimina párrafos vacíos (solo contienen <w:t> vacíos o auto-cerrados),
// EXCEPTO el último <w:p> de una celda de tabla — Word lo exige obligatoriamente.
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

// Centra la tabla en la página y el texto dentro de cada celda
function centrarTabla(xml) {
  // Agrega <w:jc w:val="center"/> dentro de cada <w:tblPr> (centra la tabla en página)
  xml = xml.replace(/<\/w:tblPr>/g, (match, offset) => {
    const prevTblPr = xml.lastIndexOf('<w:tblPr', offset);
    if (prevTblPr >= 0 && xml.slice(prevTblPr, offset).includes('<w:jc')) return match;
    return '<w:jc w:val="center"/>' + match;
  });

  // Centra el texto dentro de cada celda añadiendo <w:jc w:val="center"/> a <w:pPr>
  let result = '';
  let pos = 0;
  while (pos < xml.length) {
    let tcStart = -1;
    let sp = pos;
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
  // 1. Reemplaza cualquier <w:jc> existente por "center"
  let result = tcXml.replace(/<w:jc\b[^>]*\/>/g, '<w:jc w:val="center"/>');
  // 2. Fuerza <w:spacing w:after="0" w:before="0"/> en pPrs que ya tienen w:spacing
  result = result.replace(/<w:spacing\b[^/]*\/>/g, '<w:spacing w:after="0" w:before="0"/>');
  // 3. Para <w:pPr> que NO tienen <w:jc> o <w:spacing>, prepend antes de </w:pPr>
  result = result.replace(/<\/w:pPr>/g, (match, offset) => {
    const pPrOpen = result.lastIndexOf('<w:pPr', offset);
    const pPrSlice = pPrOpen >= 0 ? result.slice(pPrOpen, offset) : '';
    let prefix = '';
    if (!pPrSlice.includes('<w:jc'))      prefix += '<w:jc w:val="center"/>';
    if (!pPrSlice.includes('<w:spacing')) prefix += '<w:spacing w:after="0" w:before="0"/>';
    return prefix + match;
  });
  // 4. Párrafos sin <w:pPr> (celdas de datos): insertar pPr con centrado y spacing=0
  result = result.replace(/(<w:p\b[^>]*>)(?!\s*<w:pPr)/g, '$1<w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/><w:jc w:val="center"/></w:pPr>');
  return result;
}

// Aplica negrita a la primera celda de cada fila de tabla (columna de etiquetas)
function negritarPrimeraColumna(xml) {
  let result = '', pos = 0;
  while (pos < xml.length) {
    let trStart = -1, sp = pos;
    while (sp < xml.length) {
      const idx = xml.indexOf('<w:tr', sp);
      if (idx < 0) break;
      const c = xml[idx + 5];
      if (c === '>' || c === ' ' || c === '\r' || c === '\n') { trStart = idx; break; }
      sp = idx + 5;
    }
    if (trStart < 0) { result += xml.slice(pos); break; }
    const trEnd = xml.indexOf('</w:tr>', trStart);
    if (trEnd < 0) { result += xml.slice(pos); break; }
    result += xml.slice(pos, trStart) + negritarPrimeraCelda(xml.slice(trStart, trEnd + '</w:tr>'.length));
    pos = trEnd + '</w:tr>'.length;
  }
  return result;
}

function negritarPrimeraCelda(trXml) {
  let tcStart = -1, sp = 0;
  while (sp < trXml.length) {
    const idx = trXml.indexOf('<w:tc', sp);
    if (idx < 0) break;
    const c = trXml[idx + 5];
    if (c === '>' || c === ' ' || c === '\r' || c === '\n') { tcStart = idx; break; }
    sp = idx + 5;
  }
  if (tcStart < 0) return trXml;
  const tcEnd = trXml.indexOf('</w:tc>', tcStart);
  if (tcEnd < 0) return trXml;
  return (
    trXml.slice(0, tcStart) +
    negritarTextoEnCelda(trXml.slice(tcStart, tcEnd + '</w:tc>'.length)) +
    trXml.slice(tcEnd + '</w:tc>'.length)
  );
}

function negritarTextoEnCelda(tcXml) {
  // Agrega <w:b/><w:bCs/> a <w:rPr> existentes que no tengan negrita
  let result = tcXml.replace(/<\/w:rPr>/g, (match, offset) => {
    const rPrOpen = tcXml.lastIndexOf('<w:rPr', offset);
    if (rPrOpen >= 0 && tcXml.slice(rPrOpen, offset).includes('<w:b')) return match;
    return '<w:b/><w:bCs/>' + match;
  });
  // Para <w:r> sin <w:rPr> que van directo a <w:t>, inserta rPr con negrita
  result = result.replace(/(<w:r\b[^>]*>)(<w:t[\s>])/g, '$1<w:rPr><w:b/><w:bCs/></w:rPr>$2');
  return result;
}

// Elimina párrafos en blanco sobrantes al final del documento para evitar página en blanco.
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
    if (para.includes('<w:sectPr')) break; // no tocar párrafo con sectPr (define encabezado)
    if (!esParrafoBlanco(para)) break;
    // Splice: eliminar SOLO este párrafo en blanco, preservar lo que viene después (ej: <w:sectPr>)
    before = before.slice(0, lastOpen) + before.slice(lastClose + '</w:p>'.length);
    removed++;
  }

  if (removed === 0) return xml;

  // Insertar párrafo mínimo ANTES de cualquier <w:sectPr> al final
  // (<w:sectPr> como hijo directo de <w:body> debe ser el último elemento)
  const minimal = '<w:p><w:pPr><w:spacing w:after="0" w:before="0"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';
  const sectPrPos = before.lastIndexOf('<w:sectPr');
  const lastParaEnd = before.lastIndexOf('</w:p>');
  if (sectPrPos > lastParaEnd) {
    // sectPr es hijo directo de body, viene después de todos los párrafos
    return before.slice(0, sectPrPos) + minimal + before.slice(sectPrPos) + xml.slice(bodyEnd);
  }
  return before + minimal + xml.slice(bodyEnd);
}

// Fuerza Calibri 11pt en TODO el cuerpo del documento (no solo tablas)
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

// Fuerza Calibri 11 (sz=22) en todos los runs dentro de las tablas
function forzarCalibriEnTabla(xml) {
  const FONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
  const SZ    = '<w:sz w:val="22"/><w:szCs w:val="22"/>';
  return xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tbl =>
    tbl.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, run => {
      if (run.includes('<w:rPr>')) {
        let r = run;
        if (r.includes('w:rFonts')) {
          r = r.replace(/<w:rFonts[^/]*\/>/g, FONTS);
        } else {
          r = r.replace('<w:rPr>', '<w:rPr>' + FONTS);
        }
        if (r.includes('<w:sz ')) {
          r = r.replace(/<w:sz w:val="[^"]*"\/>/g, '<w:sz w:val="22"/>');
          r = r.replace(/<w:szCs w:val="[^"]*"\/>/g, '<w:szCs w:val="22"/>');
        } else {
          r = r.replace('</w:rPr>', SZ + '</w:rPr>');
        }
        return r;
      }
      return run.replace(/(<w:r\b[^>]*>)/, `$1<w:rPr>${FONTS}${SZ}</w:rPr>`);
    })
  );
}

// Ajusta el espacio antes de los títulos de sección y la imagen.
// Incluye los headings dinámicos que se renombran por post-proceso:
// OBSERVACIÓN / EVALUACIÓN / OBSERVACIÓN Y EVALUACIÓN reemplazan al
// original "EVALUACION DE RESULTADOS" cuando se activan flags del form.
function ajustarEspaciado(xml) {
  const LANDMARKS = [
    { texto: 'CONDICIONES DE ENSAYO',        blancos: 0 }, // va justo debajo de ENSAYO DE TRACCION
    { texto: 'EQUIPAMIENTO UTILIZADO',       blancos: 1 },
    { texto: 'RESULTADOS OBTENIDOS',         blancos: 1 },
    // Bloques dinámicos (según activación de flags del form):
    { texto: 'OBSERVACIÓN Y EVALUACIÓN',     blancos: 1 },
    { texto: 'OBSERVACIÓN',                  blancos: 1 },
    { texto: 'EVALUACIÓN',                   blancos: 1 },
    { texto: 'EVALUACION DE RESULTADOS',     blancos: 1 }, // fallback legacy
    { texto: 'NOTA',                         blancos: 1 },
    { texto: 'FIN DE INFORME',               blancos: 1 },
  ];
  for (const { texto, blancos } of LANDMARKS) {
    // Iterar TODAS las apariciones (no solo la primera) por si un texto se
    // repite en el documento (ej. "NOTA" dentro de un texto largo).
    let searchFrom = 0;
    while (true) {
      const pos = xml.indexOf(texto, searchFrom);
      if (pos < 0) break;
      xml = ajustarBlancoAntes(xml, pos, blancos);
      // Recalcular searchFrom: el offset cambia después del ajuste.
      searchFrom = pos + texto.length + 200;
      // Solo aplicamos al PRIMER match — evita loops largos y falsos positivos.
      break;
    }
  }
  // Imagen (cuando existe)
  const drawingPos = xml.indexOf('<w:drawing>');
  if (drawingPos >= 0) xml = ajustarBlancoAntes(xml, drawingPos, 1);
  return xml;
}

// Elimina todos los párrafos en blanco estructurales consecutivos antes del párrafo
// que contiene `refPos` y luego inserta `count` párrafos en blanco (0 o 1).
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

  // Párrafo en blanco con interlineado 1.15 (line=276) — mismo espaciado
  // que el resto del cuerpo. Se repite `count` veces si count > 1.
  const BLANK = '<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto" w:after="0" w:before="0"/></w:pPr></w:p>';
  const padding = count > 0 ? BLANK.repeat(count) : '';
  return before + padding + xml.slice(paraStart);
}

// True si el párrafo no contiene ningún <w:t> (estructuralmente vacío)
function esParrafoBlanco(para) {
  return !/<w:t[\s>]/.test(para);
}

module.exports = { generarTraccionDesdeTemplate };
