/* ============================================================================
 * TraccionForm — layout espejo del preinforme físico FM-037.
 *
 * Recibe (datos, set) del contenedor EnsayoForm. Escribe usando los mismos
 * keys del schema legado, así el generator template-traccion.js no cambia.
 *
 * Estructura:
 *   1.1 Normas y condiciones (2 columnas)
 *   1.2 Equipamiento (grid 2 cols)
 *   1.3 Resultados — tabla pivoteada (parámetros x probetas 1..4)
 *   1.4 Observaciones (textarea)
 *   1.5 Notas (checkboxes; OAA se detecta auto)
 * ========================================================================== */
'use strict';

var _r = React.createElement;

// Parámetros de la tabla — key en muestras[i][key]
var TRACCION_PARAMS = [
  { k: 'ancho_promedio',       label: 'Ancho promedio',        unit: 'mm'   },
  { k: 'espesor_promedio',     label: 'Espesor promedio',      unit: 'mm'   },
  { k: 'diametro_promedio',    label: 'Diámetro promedio',     unit: 'mm'   },
  { k: 'seccion_inicial',      label: 'Sección inicial [S0]',  unit: 'mm²'  },
  { k: 'carga_maxima',         label: 'Carga máxima',          unit: 'DaN'  },
  { k: 'resistencia_traccion', label: 'Resistencia tracción',  unit: 'MPa'  },
  { k: 'incertidumbre',        label: 'Incertidumbre',         unit: 'MPa'  },
  { k: 'carga_fluencia',       label: 'Carga de Fluencia',     unit: 'DaN'  },
  { k: 'tension_fluencia',     label: 'Tensión de Fluencia',   unit: 'MPa'  },
  { k: 'longitud_inicial',     label: 'Long. Inicial',         unit: 'mm'   },
  { k: 'longitud_final',       label: 'Long. Final',           unit: 'mm'   },
  { k: 'alargamiento',         label: 'Alargamiento',          unit: '%'    },
  { k: 'diametro_final',       label: 'Diámetro Final',        unit: 'mm'   },
  { k: 'seccion_final',        label: 'Sección Final',         unit: 'mm²'  },
  { k: 'estriccion',           label: 'Estricción',            unit: '%'    },
  { k: 'defectos',             label: 'Imperfecciones',        unit: ''     },
  { k: 'zona_rotura',          label: 'Zona de rotura',        unit: ''     },
  { k: 'tipo_rotura',          label: 'Tipo de rotura',        unit: ''     },
  { k: 'lado_rotura',          label: 'Lado rotura',           unit: ''     },
];

// Equipamiento según sede — keys existentes del schema legado
var TRACCION_EQ_ESTANDAR = [  // CABA / EMIC
  { key: 'emic',            nombre: 'MÁQ. DE TRACCIÓN EMIC',        tagDefault: 'MM-203' },
  { key: 'extensometro_362',nombre: 'EXTENSÓMETRO',                  tagDefault: 'MM-362' },
  { key: 'trazado_782',     nombre: 'DISPOSITIVO DE TRAZADO',        tagDefault: 'MM-782' },
  { key: 'nivel_781',       nombre: 'NIVEL ANGULAR MAGNÉTICO',       tagDefault: 'MM-781' },
  { key: 'calibre_571',     nombre: 'CALIBRE DIGITAL',               tagDefault: 'MM-571' },
  { key: 'regla_441',       nombre: 'REGLA METÁLICA',                tagDefault: 'MM-441' },
  { key: 'termohigro_545',  nombre: 'TERMOHIGRÓMETRO',               tagDefault: 'PCAL-545' },
  { key: 'proyector_165',   nombre: 'PROYECTOR DE PERFILES',         tagDefault: 'MM-165' },
];
var TRACCION_EQ_NEUQUEN = [  // Neuquén / Shimadzu
  { key: 'shimadzu',        nombre: 'MÁQ. DE TRACCIÓN SHIMADZU',     tagDefault: 'MM-151' },
  { key: 'calibre_694',     nombre: 'CALIBRE DIGITAL',               tagDefault: 'MM-694' },
  { key: 'termohigro_794',  nombre: 'TERMOHIGRÓMETRO',               tagDefault: 'MM-794' },
];

// ── Helpers de cálculo FM-044 (Cálculos Ensayo Tracción) ──────────────────
// Fórmulas y redondeos idénticos al Excel FM-044 Rev 00.
function _tocNum(x) {
  if (x === '' || x == null) return NaN;
  var n = parseFloat(String(x).replace(',', '.'));
  return isNaN(n) ? NaN : n;
}
function _prom() {
  var vals = [];
  for (var i = 0; i < arguments.length; i++) {
    var n = _tocNum(arguments[i]);
    if (!isNaN(n)) vals.push(n);
  }
  if (vals.length === 0) return NaN;
  return vals.reduce(function (s, x) { return s + x; }, 0) / vals.length;
}
function _mround(x, base) { return Math.round(x / base) * base; }
function _fmtTension(mpa) {
  // Aplica SOLO a `resistencia_traccion` (Tensión de rotura) y `tension_fluencia`.
  // Siempre ENTERO (nunca decimal), redondeado según convención del laboratorio:
  //   - < 500       → entero de 1 en 1.   Ej: 3.41 → 3, 301.7 → 302.
  //   - 500 – 1000  → múltiplo de 5.      Ej: 552 → 550, 778 → 780.
  //   - > 1000      → múltiplo de 10.     Ej: 1023 → 1020, 1567 → 1570.
  //   - Negativo    → 'NOTA' (dato inconsistente, cargar nota explicativa).
  if (isNaN(mpa)) return '';
  if (mpa < 0) return 'NOTA';
  if (mpa < 500)  return String(Math.round(mpa));
  if (mpa <= 1000) return String(_mround(mpa, 5));
  return String(_mround(mpa, 10));
}
function _fmtPct(pct) {
  // < 10% → MROUND(0.5). ≥ 10% → MROUND(1). Excel: G11 y H11.
  // Negativo (Lf < L0, o Sf > S0) → 'NOTA'.
  if (isNaN(pct)) return '';
  if (pct < 0) return 'NOTA';
  if (pct < 10) return _mround(pct, 0.5).toFixed(1);
  return String(Math.round(pct));
}
// Devuelve un objeto con los campos DERIVADOS que van a muestras[i] a partir
// de los inputs crudos del bloque 1.1 (seccion_calc[i]).
// Solo incluye keys que EFECTIVAMENTE puede calcular (con datos suficientes).
// Si el técnico no carga datos en 1.1, calc queda vacío y setSC no pisa los
// valores que el técnico haya escrito manualmente en la tabla 1.5.
function calcularProbetaFM044(sc) {
  sc = sc || {};
  var tipo = sc.tipo === 'cil' ? 'cil' : 'rect';
  var out = {};
  var fr = _tocNum(sc.fr), ff = _tocNum(sc.ff);
  var l0 = _tocNum(sc.l0), lf = _tocNum(sc.lf);

  var s0 = NaN;
  if (tipo === 'rect') {
    var aProm = _prom(sc.a1, sc.a2, sc.a3);
    var eProm = _prom(sc.e1, sc.e2, sc.e3);
    if (!isNaN(aProm)) out.ancho_promedio = aProm.toFixed(2);
    if (!isNaN(eProm)) out.espesor_promedio = eProm.toFixed(2);
    if (!isNaN(aProm) && !isNaN(eProm)) s0 = aProm * eProm;
  } else {
    var dProm = _prom(sc.d1, sc.d2, sc.d3);
    if (!isNaN(dProm)) {
      out.diametro_promedio = dProm.toFixed(2);
      s0 = Math.PI * dProm * dProm / 4;
    }
    var df = _tocNum(sc.df);
    if (!isNaN(df)) {
      out.diametro_final = df.toFixed(2);
      var sf = Math.PI * df * df / 4;
      out.seccion_final = sf.toFixed(2);
      if (!isNaN(s0)) out.estriccion = _fmtPct((s0 - sf) / s0 * 100);
    }
  }
  if (!isNaN(s0)) out.seccion_inicial = s0.toFixed(2);

  if (!isNaN(fr)) {
    out.carga_maxima = String(fr);
    if (!isNaN(s0)) out.resistencia_traccion = _fmtTension(10 * fr / s0);
  }
  if (!isNaN(ff)) {
    out.carga_fluencia = String(ff);
    if (!isNaN(s0)) out.tension_fluencia = _fmtTension(10 * ff / s0);
  }
  if (!isNaN(l0)) out.longitud_inicial = String(l0);
  if (!isNaN(lf)) out.longitud_final = String(lf);
  if (!isNaN(l0) && !isNaN(lf)) out.alargamiento = _fmtPct((lf - l0) / l0 * 100);
  return out;
}
// Cálculo por medición individual — Sj = Aj*Ej (rect) o π*Dj²/4 (cil).
// Devuelve los tres valores como string con 2 decimales (o '' si NaN).
function calcSeccionesFM044(sc) {
  sc = sc || {};
  var tipo = sc.tipo === 'cil' ? 'cil' : 'rect';
  var out = ['', '', ''];
  for (var j = 0; j < 3; j++) {
    var idx = j + 1;
    if (tipo === 'rect') {
      var a = _tocNum(sc['a' + idx]), e = _tocNum(sc['e' + idx]);
      if (!isNaN(a) && !isNaN(e)) out[j] = (a * e).toFixed(2);
    } else {
      var d = _tocNum(sc['d' + idx]);
      if (!isNaN(d)) out[j] = (Math.PI * d * d / 4).toFixed(2);
    }
  }
  return out;
}
// Campos de la "otra variante" que hay que limpiar al cambiar rect ↔ cil.
var CAMPOS_SOLO_RECT = ['ancho_promedio', 'espesor_promedio'];
var CAMPOS_SOLO_CIL  = ['diametro_promedio', 'diametro_final', 'seccion_final', 'estriccion'];
// Verificación PASA/NO PASA de dimensiones extremas (Excel filas 17-18).
//   - Ext dentro del rango [MIN(meds), 1.01 * MIN(meds)]
//   - |Ext1 - Ext2| ≤ 0.05
// Devuelve '' si no hay datos suficientes, 'PASA' u 'NO PASA'.
function verifExtremosFM044(meds, ext1, ext2) {
  var mm = meds.map(_tocNum).filter(function (x) { return !isNaN(x); });
  var e1 = _tocNum(ext1), e2 = _tocNum(ext2);
  if (mm.length === 0 && isNaN(e1) && isNaN(e2)) return '';
  if (mm.length === 0) return '';
  if (isNaN(e1) && isNaN(e2)) return '';
  var minM = Math.min.apply(null, mm);
  var max = 1.01 * minM;
  var fail = false;
  if (!isNaN(e1) && (e1 < minM || e1 > max)) fail = true;
  if (!isNaN(e2) && (e2 < minM || e2 > max)) fail = true;
  if (!isNaN(e1) && !isNaN(e2) && Math.abs(e1 - e2) > 0.05) fail = true;
  return fail ? 'NO PASA' : 'PASA';
}

// Set de campos de muestras[i] que salen de calcularProbetaFM044 — no se
// permite edición manual desde la tabla 1.5 (el técnico los edita en 1.1).
var CAMPOS_CALCULADOS_FM044 = {
  ancho_promedio: true, espesor_promedio: true, diametro_promedio: true,
  seccion_inicial: true, seccion_final: true,
  carga_maxima: true, resistencia_traccion: true,
  carga_fluencia: true, tension_fluencia: true,
  longitud_inicial: true, longitud_final: true,
  alargamiento: true, estriccion: true, diametro_final: true,
};

// Normaliza una norma / código de referencia (mismo criterio que el backend
// en server/utils/text-helpers.js — mantener en sync).
//   "ASTM A193/A193M-26"      → "ASTM A193-26"
//   "AWS D1.1/D1.1M:2020"     → "AWS D1.1:2020"
//   "ASTM E8/E8M-25"          → "ASTM E8-25"
//   "AWS D1.1:2020 (:2020)"   → "AWS D1.1:2020"
//   "ASTM A193-26 (-26)"      → "ASTM A193-26"
function normalizarNormaJS(s) {
  if (s == null) return '';
  var out = String(s);
  out = out.replace(/(\b[A-Z]\d[\w.]*?)\/\1M\b/g, '$1');
  out = out.replace(/\s*\(\s*[-:]?\s*\d{2,4}[a-z]?\s*\)\s*$/i, '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

function TraccionForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  // OT actual del ensayo (a la que pertenece este registro digital). Se usa
  // como default cuando el técnico no override la OT de una probeta específica.
  var otNroActual = props.otNro || '';
  // OTs hermanas (misma solicitud): son las únicas a las que se puede
  // transferir una probeta. Si la OT actual no está en solicitud múltiple, la
  // lista queda con la propia OT nada más (el selector se muestra deshabilitado).
  var otActualObj = otNroActual && window.LabStore && window.LabStore.getOt
    ? window.LabStore.getOt(otNroActual) : null;
  var solActual = otActualObj && otActualObj.nro_solicitud;
  var otsDisponibles = (solActual && window.LabStore.listOtsBySolicitud)
    ? window.LabStore.listOtsBySolicitud(solActual)
    : (otActualObj ? [otActualObj] : []);
  function upd(key, val) { set(key, val); }
  function updBool(key, checked) { set(key, !!checked); }

  // ── Multi-OT: botones "Copiar a otras OT" por sección ────────────────────
  // Cada botón copia un subset específico de campos (norma, ITM, etc.) a
  // `datos.condiciones_por_ot[<destino>]`. Al guardar el ensayo, el saver
  // multi-OT (saveEnsayoTraccionMultiOt) aplica esos overrides a los ensayos
  // hermanos existentes o los usa como semilla para los nuevos.
  var multiOtTr = otsDisponibles.length > 1;
  var otNroActualStrTr = String(otNroActual || '');
  var _copyKeyTr = React.useState(''); var copyOpenKeyTr = _copyKeyTr[0], setCopyOpenKeyTr = _copyKeyTr[1];
  var _copyDestTr = React.useState([]); var copyDestGenTr = _copyDestTr[0], setCopyDestGenTr = _copyDestTr[1];
  // `campos` = keys de la RAÍZ (leen de datos[k]).
  // `opts.muestraCondKeys` = keys de la sección 1.1 "CONDICIONES POR PROBETA"
  // que viven en muestras[i][k] (no en la raíz). Se leen de la PRIMERA probeta
  // física (M1) de la OT actual y se guardan en condiciones_por_ot[<dest>].m1_cond;
  // el saver saveEnsayoTraccionMultiOt las aplica a todas las probetas físicas
  // de la hermana. Usado por "Copiar TODO" para arrastrar norma/código/plano/
  // orientación aunque no sean campos raíz.
  function copiarCamposTrAOts(destinos, campos, opts) {
    if (!destinos || destinos.length === 0) return;
    var mapaCond = Object.assign({}, datos.condiciones_por_ot || {});
    // Datos M1 (probeta física #0) para el subset condicional por-probeta.
    var muestraCondKeys = (opts && opts.muestraCondKeys) || [];
    var m1Cond = null;
    if (muestraCondKeys.length > 0 && Array.isArray(datos.muestras) && idxFisicas.length > 0) {
      var m1 = datos.muestras[idxFisicas[0]] || {};
      m1Cond = {};
      muestraCondKeys.forEach(function (k) {
        if (m1[k] !== undefined) m1Cond[k] = m1[k];
      });
      if (Object.keys(m1Cond).length === 0) m1Cond = null;
    }
    destinos.forEach(function (nroOt) {
      var entry = Object.assign({}, mapaCond[nroOt] || {});
      campos.forEach(function (k) {
        if (datos[k] !== undefined) {
          entry[k] = (typeof datos[k] === 'object' && datos[k] !== null && !Array.isArray(datos[k]))
            ? Object.assign({}, datos[k])
            : (Array.isArray(datos[k]) ? datos[k].slice() : datos[k]);
        }
      });
      if (m1Cond) entry.m1_cond = Object.assign({}, m1Cond);
      mapaCond[nroOt] = entry;
    });
    set('condiciones_por_ot', mapaCond);
    if (window._labToastOk) {
      window._labToastOk('Copiado a OT ' + destinos.join(', ') + ' — se aplica al guardar');
    }
  }
  function botonCopiarSeccionTr(claveUnica, etiqueta, camposList, descripcion, muestraCondKeys) {
    if (!multiOtTr) return null;
    var abierto = copyOpenKeyTr === claveUnica;
    return _r('div', { style: { position: 'relative', display: 'inline-block' } },
      _r('button', {
        type: 'button',
        onClick: function () {
          setCopyDestGenTr([]);
          setCopyOpenKeyTr(abierto ? '' : claveUnica);
        },
        style: {
          border: '1px solid var(--accent, #0969da)', background: '#fff',
          color: 'var(--accent, #0969da)', padding: '3px 8px', fontSize: 10,
          cursor: 'pointer', borderRadius: 3, fontWeight: 600, whiteSpace: 'nowrap',
        },
      }, '📋 ' + etiqueta),
      abierto ? _r('div', {
        style: {
          position: 'absolute', zIndex: 30, top: '100%', right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #d0d7de',
          borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10, minWidth: 240, fontSize: 11,
        },
      },
        _r('div', { style: { fontWeight: 700, marginBottom: 6, color: '#24292f' } }, etiqueta + ' a:'),
        descripcion ? _r('div', { style: { fontSize: 10, color: '#57606a', marginBottom: 8 } }, descripcion) : null,
        _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
          otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrTr; }).map(function (o) {
            var nro = String(o.nro_ot);
            var checked = copyDestGenTr.indexOf(nro) >= 0;
            return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
              _r('input', { type: 'checkbox', checked: checked,
                onChange: function () {
                  setCopyDestGenTr(checked ? copyDestGenTr.filter(function (n) { return n !== nro; }) : copyDestGenTr.concat([nro]));
                } }),
              _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
          })),
        _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          _r('button', { type: 'button', onClick: function () { setCopyOpenKeyTr(''); },
            style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } }, 'Cancelar'),
          _r('button', { type: 'button',
            onClick: function () {
              var destinos = copyDestGenTr.slice();
              if (destinos.length === 0) {
                destinos = otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrTr; }).map(function (o) { return String(o.nro_ot); });
              }
              copiarCamposTrAOts(destinos, camposList, { muestraCondKeys: muestraCondKeys });
              setCopyOpenKeyTr(''); setCopyDestGenTr([]);
            },
            style: { border: '1px solid #0969da', background: '#0969da', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
      ) : null
    );
  }

  // Precargar años default (ISO 2019 / ASTM E8 25). No pisa si el técnico ya
  // los cambió; solo aplica cuando el ensayo es nuevo o el campo está vacío.
  React.useEffect(function () {
    var patch = {};
    if (datos.norma_iso6892_1_year == null || datos.norma_iso6892_1_year === '') patch.norma_iso6892_1_year = '2019';
    if (datos.norma_astm_e8_year    == null || datos.norma_astm_e8_year    === '') patch.norma_astm_e8_year    = '25';
    if (Object.keys(patch).length) set(patch);
    // Solo al montar.
  }, []);

  // Al marcar un código de referencia, autocompletar "Plano de probeta según"
  // con el texto del código (editable). Sólo pisa el campo si está vacío o si
  // fue autocompletado antes (`_planoAuto`); si el usuario lo editó, se respeta.
  function _codigoRefTr(d) {
    if (d.cod_asme)    return 'ASME BPVC Sección IX Ed.' + (d.ed_asme || '2025');
    if (d.cod_api1104) return 'API 1104 Ed.22-2021 (E1-2023)';
    if (d.cod_aws_d11) return 'AWS D1.1/D1.1M-2020';
    return '';
  }
  function setCod(patch) {
    var nd = Object.assign({}, datos, patch);
    var txt = _codigoRefTr(nd);
    var out = Object.assign({}, patch);
    if (datos._planoAuto || !(datos.plano_probeta || '').trim()) {
      out.plano_probeta = txt;   // txt vacío al deschequear ⇒ limpia el campo
      out._planoAuto = true;
    }
    set(out);
  }

  // Muestras: array plano que combina probetas físicas + "zonas extra" ligadas.
  // Cada entry es una columna de la tabla de resultados 1.5.
  //   - Probeta física: sin `_zona_extra`. Aparece en 1.3 (condiciones) y 1.5.
  //   - Zona extra: `_zona_extra: true`, `_probeta_padre: <idxEnMuestras>`.
  //     Solo aparece en 1.5. Hereda condiciones de la probeta padre.
  // probetas_on tiene una entry por cada probeta física (compat legacy: on/off).
  var muestras = Array.isArray(datos.muestras) ? datos.muestras.slice() : [];
  if (muestras.length === 0) muestras = [{}];

  // Índices en `muestras[]` que son probetas físicas (no zonas extra).
  var idxFisicas = [];
  muestras.forEach(function (m, i) { if (!(m && m._zona_extra)) idxFisicas.push(i); });
  if (idxFisicas.length === 0) { muestras = [{}].concat(muestras); idxFisicas = [0]; }
  var N = idxFisicas.length;

  var probOn = Array.isArray(datos.probetas_on) ? datos.probetas_on.slice() : [];
  while (probOn.length < N) probOn.push(true);
  probOn = probOn.slice(0, N);

  // Campos de condición (1.3) que se propagan de M1 al aumentar N o al copiar.
  var COND_KEYS = ['norma', 'orientacion', 'plano_probeta', 'codigo_referencia', '_plano_auto'];

  function setMuestra(i, key, val) {
    var next = muestras.slice();
    next[i] = Object.assign({}, next[i] || {});
    next[i][key] = val;
    set('muestras', next);
  }
  function toggleProb(iFisica) {
    var next = probOn.slice();
    next[iFisica] = !next[iFisica];
    set('probetas_on', next);
  }
  // Helper: leer el seccion_calc actual (paralelo a muestras[], 1:1).
  function _scNow() { return Array.isArray(datos.seccion_calc) ? datos.seccion_calc.slice() : []; }
  function addColumna() {
    if (N >= 6) return;
    // Insertar una nueva probeta física DESPUÉS de la última probeta y sus zonas
    // extra. Hereda condiciones de M1 si existen.
    var m1 = muestras[idxFisicas[0]] || {};
    var nueva = {};
    COND_KEYS.forEach(function (k) { if (m1[k] != null) nueva[k] = m1[k]; });
    var scArr = _scNow();
    while (scArr.length < muestras.length) scArr.push({});
    scArr.push({ tipo: (scArr[idxFisicas[0]] || {}).tipo || 'rect' });
    set({ muestras: muestras.concat([nueva]), probetas_on: probOn.concat([true]), seccion_calc: scArr });
  }
  function delColumna() {
    if (N <= 1) return;
    // Quita la última probeta física + todas sus zonas extra ligadas
    // (también en seccion_calc, que es paralelo a muestras).
    var ultimaIdx = idxFisicas[N - 1];
    var scArr = _scNow();
    while (scArr.length < muestras.length) scArr.push({});
    var muestrasNext = [];
    var scNext = [];
    muestras.forEach(function (mm, i) {
      if (i === ultimaIdx) return;
      if (mm && mm._zona_extra && mm._probeta_padre === ultimaIdx) return;
      muestrasNext.push(mm);
      scNext.push(scArr[i] || {});
    });
    set({ muestras: muestrasNext, probetas_on: probOn.slice(0, -1), seccion_calc: scNext });
  }
  // Agrega una nueva zona extra ligada a la probeta física en idxFisicas[iFisica].
  // La entry se inserta INMEDIATAMENTE DESPUÉS de las zonas extra existentes de
  // esa misma probeta (o después de la probeta si aún no tiene ninguna).
  //   - nombre: heredado del padre (compartido: M1 aparece una vez con colspan)
  //   - zona: nombre corto de la zona ("Superficie", "Núcleo", "Zona A"...)
  // Al crear la PRIMERA zona extra, se autocompleta `zona` en la probeta padre
  // con "Superficie" para que la fila Zona quede coherente.
  function agregarZonaExtra(iFisica) {
    var probIdx = idxFisicas[iFisica];
    var prob = muestras[probIdx] || {};
    var insertAfter = probIdx;
    for (var k = probIdx + 1; k < muestras.length; k++) {
      var mk = muestras[k];
      if (mk && mk._zona_extra && mk._probeta_padre === probIdx) insertAfter = k;
      else break;
    }
    var zonasExist = muestras.filter(function (mm) {
      return mm && mm._zona_extra && mm._probeta_padre === probIdx;
    }).length;
    var letras = ['A', 'B', 'C', 'D', 'E', 'F'];
    var nuevaZona = {
      nombre: prob.nombre || ('M' + (iFisica + 1)),
      zona: 'Zona ' + (letras[zonasExist + 1] || (zonasExist + 2)),
      _zona_extra: true,
      _probeta_padre: probIdx,
    };
    var next = muestras.slice();
    // Si el padre no tiene `zona` seteada y es la primera zona extra, ponerle
    // "Zona A" para dar un nombre a esa columna en la fila Zona del Word.
    if (zonasExist === 0 && !(prob.zona && String(prob.zona).trim())) {
      next[probIdx] = Object.assign({}, prob, { zona: 'Zona A' });
    }
    next.splice(insertAfter + 1, 0, nuevaZona);
    // Sincronizar seccion_calc (paralelo a muestras): insertar entry en la
    // misma posición, heredando el tipo (rect/cil) del padre.
    var scArr = _scNow();
    while (scArr.length < muestras.length) scArr.push({});
    var scPadre = scArr[probIdx] || {};
    scArr.splice(insertAfter + 1, 0, { tipo: scPadre.tipo || 'rect' });
    set({ muestras: next, seccion_calc: scArr });
  }
  function eliminarZonaExtra(idxEnMuestras) {
    var next = muestras.slice();
    next.splice(idxEnMuestras, 1);
    // Los `_probeta_padre` posteriores hay que decrementarlos si eran > idxEnMuestras.
    for (var j = 0; j < next.length; j++) {
      var mm = next[j];
      if (mm && mm._zona_extra && mm._probeta_padre > idxEnMuestras) {
        next[j] = Object.assign({}, mm, { _probeta_padre: mm._probeta_padre - 1 });
      }
    }
    var scArr = _scNow();
    while (scArr.length < muestras.length) scArr.push({});
    scArr.splice(idxEnMuestras, 1);
    set({ muestras: next, seccion_calc: scArr });
  }

  // ── Estilos ────────────────────────────────────────────────────────────
  var S = {
    sheet: { width: '100%', maxWidth: 1123, background: '#fff', border: '1px solid #333', margin: '0 auto', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' },
    head: { fontSize: 11, fontWeight: 800, padding: '5px 8px', background: '#e6e6e6', borderTop: '1px solid #333', borderBottom: '1px solid #333', letterSpacing: '.3px' },
    box: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 },
    label: { display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' },
    input: { border: '1px solid #bbb', background: 'transparent', fontSize: 12, padding: '3px 5px', outline: 'none' },
    num: { textAlign: 'center' },
  };

  // ── BLOQUE CANTIDAD DE PROBETAS (arriba de todo) ──────────────────────
  // Controlador único de cuántas probetas tiene el ensayo. Manda sobre:
  //   - Cantidad de bloques del CÁLCULO DE SECCIÓN
  //   - Cantidad de filas del bloque CONDICIONES POR PROBETA
  //   - Cantidad de columnas de la tabla de RESULTADOS OBTENIDOS
  function setCantidadProbetas(cant) {
    var n = Math.max(1, Math.min(6, cant | 0));
    var nextOn = [];
    for (var i = 0; i < n; i++) nextOn.push(true);
    var m1 = muestras[idxFisicas[0]] || {};
    var scArr = _scNow();
    while (scArr.length < muestras.length) scArr.push({});
    if (n <= N) {
      var idxLimite;
      if (n < N) idxLimite = idxFisicas[n];
      else       idxLimite = muestras.length;
      var nextM  = muestras.slice(0, idxLimite);
      var nextSc = scArr.slice(0, idxLimite);
      set({ probetas_on: nextOn, muestras: nextM, seccion_calc: nextSc });
    } else {
      var nuevas   = [];
      var nuevasSc = [];
      var scM1 = scArr[idxFisicas[0]] || {};
      for (var k = 0; k < (n - N); k++) {
        var nueva = {};
        COND_KEYS.forEach(function (kk) { if (m1[kk] != null) nueva[kk] = m1[kk]; });
        nuevas.push(nueva);
        nuevasSc.push({ tipo: scM1.tipo || 'rect' });
      }
      set({ probetas_on: nextOn, muestras: muestras.concat(nuevas), seccion_calc: scArr.concat(nuevasSc) });
    }
  }
  var blockCantidad = _r('div', null,
    _r('div', { style: S.head }, 'CANTIDAD DE PROBETAS'),
    _r('div', { style: { padding: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 } },
      _r('span', { style: { fontWeight: 700 } }, 'Cantidad:'),
      _r('button', { type: 'button',
        style: { width: 30, height: 30, border: '1px solid #999', background: N <= 1 ? '#eee' : '#f4f4f4', cursor: N <= 1 ? 'not-allowed' : 'pointer', borderRadius: 4, fontSize: 16, fontWeight: 700 },
        disabled: N <= 1,
        onClick: function () { setCantidadProbetas(N - 1); },
      }, '−'),
      _r('input', { type: 'number', min: 1, max: 6, value: N,
        style: { width: 60, height: 30, textAlign: 'center', border: '1px solid #999', borderRadius: 4, fontSize: 14, fontWeight: 700 },
        onChange: function (e) { var v = parseInt(e.target.value, 10); if (!isNaN(v)) setCantidadProbetas(v); } }),
      _r('button', { type: 'button',
        style: { width: 30, height: 30, border: '1px solid #999', background: N >= 6 ? '#eee' : '#f4f4f4', cursor: N >= 6 ? 'not-allowed' : 'pointer', borderRadius: 4, fontSize: 16, fontWeight: 700 },
        disabled: N >= 6,
        onClick: function () { setCantidadProbetas(N + 1); },
      }, '+'),
      _r('span', { style: { color: '#555', fontSize: 11, marginLeft: 8 } },
        'Se aplica al cálculo de sección, condiciones por probeta y tabla de resultados. Rango: 1 a 6.'))
  );

  // ── 1.2 CONDICIONES GENERALES (globales al ensayo, iguales para todas las probetas)
  var block11 = _r('div', null,
    _r('div', { style: S.head }, '1.3  CONDICIONES GENERALES DEL ENSAYO'),
    _r('div', { style: Object.assign({}, S.box, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }) },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'ITM:'),
        _r(window.ItmInput, { tipo: 'traccion', style: Object.assign({}, S.input, { flex: 1 }), value: datos.metodologia || '', placeholder: 'ITM N°075',
          onChange: function (e) { upd('metodologia', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 80 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.estado_superficial, onChange: function (e) { updBool('estado_superficial', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO SUPERFICIAL'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.verif_alineacion, onChange: function (e) { updBool('verif_alineacion', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'VERIFICACIÓN DE ALINEACIÓN'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.prob_cliente, onChange: function (e) { updBool('prob_cliente', e.target.checked); } }),
        'PROBETA MECANIZADA POR EL CLIENTE'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.prob_soldada, onChange: function (e) { updBool('prob_soldada', e.target.checked); } }),
        'PROBETA SOLDADA'),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ECUACIÓN DE CÁLCULO DE SECCIÓN:'),
        _r('input', { style: Object.assign({}, S.input, { flex: 1 }), value: datos.ecuacion_seccion || '', placeholder: '……………………',
          onChange: function (e) { upd('ecuacion_seccion', e.target.value); } }))
    )
  );

  // ── 1.3 CONDICIONES POR PROBETA ────────────────────────────────────────
  // Tabla: filas = norma / orientación / plano / código de referencia
  //         columnas = M1, M2, ..., MN (según cantidad de probetas)
  // En el Word se agrupan valores iguales: "ISO 6892-1:2019 (M1, M3, M4)"
  var PROB_FIELDS = [
    { k: 'norma',              label: 'Norma de ensayo',      placeholder: 'Ej: ISO 6892-1:2019' },
    { k: 'orientacion',        label: 'Orientación',          special: 'orient' },
    { k: 'plano_probeta',      label: 'Plano de probeta',     placeholder: 'Ej: ISO 6892-1:2019 Fig.13 Prob.1' },
    { k: 'codigo_referencia',  label: 'Código de referencia', placeholder: 'Ej: ASME BPVC Sección IX Ed.2025' },
  ];
  var blockProbetas = _r('div', null,
    _r('div', { style: S.head }, '1.1  CONDICIONES POR PROBETA'),
    _r('div', { style: { padding: 8, overflowX: 'auto' } },
      _r('div', { style: { fontSize: 10, color: '#555', marginBottom: 6 } },
        'Editar la columna M1 propaga automáticamente el valor a las demás probetas que tenían el mismo valor o estaban vacías. Si cambiás M2 (u otra) manualmente, esa queda "fija" y ya no se sobrescribe desde M1.'),
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 11, minWidth: 640 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #999', padding: 4, width: 170, textAlign: 'left' } }, 'Campo'),
            idxFisicas.map(function (idxM, iFis) {
              var m = muestras[idxM] || {};
              var nombreValor = (m.nombre != null) ? m.nombre : ('M' + (iFis + 1));
              return _r('th', { key: iFis, style: { border: '1px solid #999', padding: 3, minWidth: 120 } },
                _r('div', { style: { fontWeight: 800, marginBottom: 2 } }, 'Probeta ' + (iFis + 1)),
                _r('input', { style: Object.assign({}, S.input, { fontSize: 10, width: '100%', textAlign: 'center', fontWeight: 700 }),
                  value: nombreValor,
                  onChange: function (e) {
                    // Propagar el cambio a las zonas extra ligadas para que
                    // compartan el nombre (M1, M1, M1 en la fila mergeada).
                    var arr = muestras.slice();
                    arr[idxM] = Object.assign({}, arr[idxM] || {}, { nombre: e.target.value });
                    for (var j = 0; j < arr.length; j++) {
                      var mm = arr[j];
                      if (mm && mm._zona_extra && mm._probeta_padre === idxM) {
                        arr[j] = Object.assign({}, mm, { nombre: e.target.value });
                      }
                    }
                    set('muestras', arr);
                  } }));
            })
          )
        ),
        _r('tbody', null, PROB_FIELDS.map(function (f) {
          return _r('tr', { key: f.k },
            _r('td', { style: { border: '1px solid #999', padding: '4px 8px', fontWeight: 700, background: '#fafafa' } }, f.label),
            idxFisicas.map(function (idxM, iFis) {
              var m = muestras[idxM] || {};
              var val = m[f.k] || '';
              var cellStyle = { border: '1px solid #999', padding: 0 };
              var inputStyle = { border: 'none', width: '100%', padding: '5px 6px', background: 'transparent', fontSize: 11 };

              // Handler común. Reglas:
              //  - norma / codigo_referencia / plano_probeta se normalizan (sacan
              //    "/XxxM" y sufijos duplicados) al formato Labtesa. La
              //    normalización se aplica al PERDER el foco (blur) — hacerlo
              //    onChange rompía la escritura porque el trim() dentro de
              //    normalizarNormaJS borra los espacios en caliente.
              //  - Si se edita la PRIMERA probeta física (iFis===0), el valor se
              //    propaga a las demás probetas físicas que tenían el mismo valor
              //    que M1 tenía antes (o estaban vacías).
              //  - Al cambiar codigo_referencia, plano_probeta se auto-fill si
              //    estaba vacío o marcado como auto.
              function aplicarCambio(nuevoVal, normalizar) {
                var norm = normalizar ? normalizarNormaJS(nuevoVal) : nuevoVal;
                var arr = muestras.slice();
                var viejoValM1 = String((muestras[idxFisicas[0]] || {})[f.k] || '');
                var patchActual = {};
                patchActual[f.k] = norm;
                if (f.k === 'codigo_referencia') {
                  var planoActual = String(m.plano_probeta || '').trim();
                  if (!planoActual || m._plano_auto) {
                    patchActual.plano_probeta = norm;
                    patchActual._plano_auto = true;
                  }
                } else if (f.k === 'plano_probeta') {
                  patchActual._plano_auto = false;
                }
                arr[idxM] = Object.assign({}, arr[idxM] || {}, patchActual);
                if (iFis === 0) {
                  idxFisicas.forEach(function (idxOtro, jFis) {
                    if (jFis === 0) return;
                    var mo = arr[idxOtro] || {};
                    var valOtro = String(mo[f.k] || '');
                    if (valOtro === '' || valOtro === viejoValM1) {
                      var patch = {};
                      patch[f.k] = norm;
                      if (f.k === 'codigo_referencia') {
                        var planoOtro = String(mo.plano_probeta || '').trim();
                        if (!planoOtro || mo._plano_auto) {
                          patch.plano_probeta = norm;
                          patch._plano_auto = true;
                        }
                      } else if (f.k === 'plano_probeta') {
                        patch._plano_auto = false;
                      }
                      arr[idxOtro] = Object.assign({}, mo, patch);
                    }
                  });
                }
                set('muestras', arr);
              }
              function handleChange(nuevoVal) { aplicarCambio(nuevoVal, false); }
              function handleBlur(nuevoVal)   {
                var esNorma = (f.k === 'norma' || f.k === 'codigo_referencia' || f.k === 'plano_probeta');
                if (esNorma) aplicarCambio(nuevoVal, true);
              }

              if (f.special === 'orient') {
                return _r('td', { key: iFis, style: cellStyle },
                  _r('select', {
                    style: Object.assign({}, inputStyle, { textAlign: 'center', padding: '5px 6px' }),
                    value: val,
                    onChange: function (e) { handleChange(e.target.value); },
                  },
                    _r('option', { value: '' }, '—'),
                    _r('option', { value: 'Longitudinal' }, 'Longitudinal'),
                    _r('option', { value: 'Transversal' }, 'Transversal')));
              }
              // Combos editables: norma y código de referencia usan datalist
              // (sugerencias del catálogo local vía NormaInput).
              if (f.k === 'norma' && typeof window.NormaInput === 'function') {
                return _r('td', { key: iFis, style: cellStyle },
                  _r(window.NormaInput, {
                    tipo: 'traccion', categoria: 'ensayo',
                    style: inputStyle, placeholder: f.placeholder,
                    value: val,
                    onChange: function (e) { handleChange(e.target.value); },
                    onBlur: function (e) { handleBlur(e.target.value); },
                  }));
              }
              if (f.k === 'codigo_referencia' && typeof window.NormaInput === 'function') {
                return _r('td', { key: iFis, style: cellStyle },
                  _r(window.NormaInput, {
                    tipo: 'traccion', categoria: 'referencia',
                    style: inputStyle, placeholder: f.placeholder,
                    value: val,
                    onChange: function (e) { handleChange(e.target.value); },
                    onBlur: function (e) { handleBlur(e.target.value); },
                  }));
              }
              return _r('td', { key: iFis, style: cellStyle },
                _r('input', { style: inputStyle,
                  placeholder: f.placeholder || '',
                  value: val,
                  onChange: function (e) { handleChange(e.target.value); },
                  onBlur: function (e) { handleBlur(e.target.value); } }));
            })
          );
        }))
      )
    )
  );

  // ── EQUIPAMIENTO ──────────────────────────────────────────────────
  var equipos = datos.variante === 'neuquen' ? TRACCION_EQ_NEUQUEN : TRACCION_EQ_ESTANDAR;
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.4  EQUIPAMIENTO UTILIZADO ' + (datos.variante === 'neuquen' ? '— Set Shimadzu (Neuquén)' : '— Set EMIC (CABA)')),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 24px', fontSize: 11 } },
      equipos.map(function (e) {
        var checked = !!(datos.equipamiento && datos.equipamiento[e.key]);
        var tagVal  = (datos.equipamiento_tags && datos.equipamiento_tags[e.key]) != null
          ? datos.equipamiento_tags[e.key] : e.tagDefault;
        return _r('div', { key: e.key, style: { display: 'grid', gridTemplateColumns: '20px 1fr 60px 100px', alignItems: 'center', gap: 6 } },
          _r('input', { type: 'checkbox', checked: checked,
            onChange: function (ev) { upd('equipamiento.' + e.key, ev.target.checked); } }),
          _r('span', { style: { fontWeight: 600 } }, e.nombre),
          _r('span', { style: { color: '#555', fontSize: 10, textAlign: 'right' } }, 'TAG N°:'),
          _r('input', { style: { border: '1px solid #bbb', background: 'transparent', fontSize: 11, padding: '3px 5px', outline: 'none', width: '100%' },
            value: tagVal,
            onChange: function (ev) { upd('equipamiento_tags.' + e.key, ev.target.value); } }));
      })
    ),
    // Tabla adicional para agregar equipos del catálogo completo del lab.
    typeof window.OtrosEquiposBlock === 'function'
      ? _r('div', { style: { padding: '0 8px 8px' } },
          _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } }))
      : null
  );

  // ── 1.5 RESULTADOS — Tabla pivoteada (después del cálculo y condiciones) ─
  // Header con 2 filas:
  //   Fila 1: "PARÁMETRO" (rowspan=2) | "UNIDAD" (rowspan=2) | por cada
  //           probeta física una celda con colspan=1+zonasExtra, nombre "M1..MN".
  //   Fila 2: "Zona" (colspan=2 sobre las 2 primeras cols) | input `zona` de
  //           cada columna (Superficie, Núcleo, ...).
  // La fila "Zona" solo se muestra si al menos una muestra tiene `zona`
  // completo o si hay zonas extra.
  var idxProbetaFisica = {};
  idxFisicas.forEach(function (idx, iFis) { idxProbetaFisica[idx] = iFis; });
  // Colspan por probeta física.
  var colspanPorProbeta = idxFisicas.map(function (probIdx) {
    var cs = 1;
    muestras.forEach(function (mm) {
      if (mm && mm._zona_extra && mm._probeta_padre === probIdx) cs++;
    });
    return cs;
  });
  // Al reindexar: si algún zona.padre apunta a idxViejo, hay que resolver
  // dinámicamente en el actual muestras[].
  var hayZonaAlguna = muestras.some(function (mm) {
    return mm && (mm._zona_extra || (mm.zona && String(mm.zona).trim()));
  });
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.5  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: '0 8px 8px', overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 11, minWidth: 820 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { rowSpan: hayZonaAlguna ? 2 : 1, style: { border: '1px solid #333', padding: 4, width: 180, textAlign: 'left', verticalAlign: 'middle' } }, 'PARÁMETRO'),
            _r('th', { rowSpan: hayZonaAlguna ? 2 : 1, style: { border: '1px solid #333', padding: 4, width: 60, verticalAlign: 'middle' } }, 'UNIDAD'),
            // Detectar si hay varias OTs distintas entre las probetas físicas.
            // Si sí → el label de cada columna dice "OT XXXXX" (identifica a
            // qué OT va cada dato). Si es una sola → sigue "M1/M2" o "O.T. XXX"
            // cuando es la única columna.
            (function () {
              var otsUnicas = {};
              idxFisicas.forEach(function (probIdx) {
                var mm = muestras[probIdx] || {};
                var no = String((mm.nro_ot_override || otNroActual) || '').trim();
                if (no) otsUnicas[no] = true;
              });
              window._traccionMultiOtHeader = Object.keys(otsUnicas).length > 1;
            })(),
            idxFisicas.map(function (probIdx, iFis) {
              var m = muestras[probIdx] || {};
              var nombreValor = (m.nombre != null) ? m.nombre : ('M' + (iFis + 1));
              var cs = colspanPorProbeta[iFis];
              var otColumna = String((m.nro_ot_override || otNroActual) || '');
              var esUnicaColumna = muestras.length === 1;
              var esMultiOt = window._traccionMultiOtHeader;
              // Label de la columna:
              //   - Ensayo multi-OT           → "OT XXXXX" (identifica destino).
              //   - Única columna (1 muestra) → "O.T. XXX" (como sale en el Word).
              //   - Varias columnas, misma OT → "M1", "M2", "M3".
              var labelTitulo = esMultiOt
                ? ('OT ' + (otColumna || '—'))
                : (esUnicaColumna
                    ? ('O.T. ' + (otColumna || '—'))
                    : ('M' + (iFis + 1)));
              return _r('th', { key: iFis, colSpan: cs, style: { border: '1px solid #333', padding: 3, background: '#e6e6e6', minWidth: 110 * cs } },
                _r('div', {
                  style: { fontWeight: 800, fontSize: 10, textAlign: 'center',
                    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                    color: esMultiOt ? '#8a5a00' : undefined },
                  title: 'Probeta ' + (iFis + 1) + ' — OT ' + otColumna,
                }, labelTitulo),
                _r('div', { style: { display: 'flex', gap: 2, alignItems: 'center', fontSize: 9, fontWeight: 400, marginTop: 2 } },
                  'Nombre:',
                  _r('input', { style: Object.assign({}, S.input, { fontSize: 10, width: '100%', textAlign: 'center', fontWeight: 700 }),
                    value: nombreValor,
                    onChange: function (e) {
                      // Cambiar el nombre de la probeta también actualiza el
                      // nombre "espejo" en sus zonas extra (para que compartan
                      // la etiqueta M1/M2/M3 en el Word).
                      var arr = muestras.slice();
                      arr[probIdx] = Object.assign({}, arr[probIdx] || {}, { nombre: e.target.value });
                      for (var j = 0; j < arr.length; j++) {
                        var mm = arr[j];
                        if (mm && mm._zona_extra && mm._probeta_padre === probIdx) {
                          arr[j] = Object.assign({}, mm, { nombre: e.target.value });
                        }
                      }
                      set('muestras', arr);
                    } })));
            })
          ),
          // FILA 2 — "Zona" — solo si hay al menos una zona seteada o zona extra.
          hayZonaAlguna
            ? _r('tr', { style: { background: '#f2f2f2' } },
                muestras.map(function (m, i) {
                  var esZona = !!(m && m._zona_extra);
                  var zonaVal = (m && m.zona) || '';
                  var bg = esZona ? '#fffbef' : '#f2f2f2';
                  return _r('th', { key: i, style: { border: '1px solid #333', padding: 3, background: bg } },
                    _r('div', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
                      _r('input', { style: Object.assign({}, S.input, { fontSize: 10, width: '100%', textAlign: 'center', fontWeight: 600 }),
                        value: zonaVal, placeholder: 'Zona…',
                        onChange: function (e) { setMuestra(i, 'zona', e.target.value); } }),
                      esZona
                        ? _r('button', { type: 'button', title: 'Eliminar zona',
                            style: { border: '1px solid #c00', background: '#fff', color: '#c00', borderRadius: 3, width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: 'pointer', padding: 0, flexShrink: 0 },
                            onClick: function () { eliminarZonaExtra(i); } }, '×')
                        : null));
                }))
            : null
        ),
        _r('tbody', null,
          TRACCION_PARAMS.map(function (p) {
            var esCalc = !!CAMPOS_CALCULADOS_FM044[p.k];
            return _r('tr', { key: p.k },
              _r('td', { style: { border: '1px solid #333', padding: '2px 6px', fontWeight: 700, background: '#fafafa' } },
                p.label,
                esCalc ? _r('span', { style: { color: '#0a7a55', marginLeft: 4, fontSize: 9 }, title: 'Calculado automáticamente desde el bloque 1.1' }, '↺') : null
              ),
              _r('td', { style: { border: '1px solid #333', padding: 2, textAlign: 'center', color: '#555' } }, p.unit),
              muestras.map(function (m, i) {
                var val = (m && m[p.k]) || '';
                var esZona = !!(m && m._zona_extra);
                // Valor "NOTA" (rojo): el cálculo dio negativo → el técnico
                // debe cargar una nota explicativa antes de emitir el informe.
                var esNota = val === 'NOTA';
                var vieneDeCalc = esCalc && val !== '' && !esNota;
                var bg = esNota ? '#ffd7d7'
                       : vieneDeCalc ? '#e6f9ef'
                       : (esZona ? '#fffbef' : 'transparent');
                return _r('td', { key: i, style: { border: '1px solid #333', padding: 0, background: bg } },
                  _r('input', {
                    style: Object.assign({}, S.input, S.num, {
                      border: 'none', width: '100%', background: 'transparent',
                      color: esNota ? '#b02a2a' : (vieneDeCalc ? '#0a7a55' : undefined),
                      fontWeight: (esNota || vieneDeCalc) ? 800 : undefined,
                    }),
                    value: val,
                    title: esNota
                      ? 'El cálculo dio negativo (dato inconsistente). Agregar una nota explicativa antes de emitir.'
                      : (esCalc ? 'Calculado desde 1.1 si hay datos; editable si querés override manual' : ''),
                    onKeyDown: tablaResNavKeyDown,
                    onChange: function (e) { setMuestra(i, p.k, e.target.value); },
                  }));
              })
            );
          })
        )
      )
    )
  );

  // ── Multi-OT en textos opcionales (obs / eval / nota) ─────────────────
  // El selector solo lista las OTs que aparecen efectivamente en el bloque 1.1
  // (Cálculo de sección) — es decir, las que tienen al menos una probeta o
  // zona asignada. Si el técnico no transfirió nada, aparece solo la OT actual.
  var otsEnEnsayo = (function () {
    var set = {};
    (muestras || []).forEach(function (m) {
      var over = String((m && m.nro_ot_override) || '').trim();
      var dest = over || String(otNroActual || '');
      if (dest) set[dest] = true;
    });
    var list = Object.keys(set);
    if (list.length === 0 && otNroActual) list.push(String(otNroActual));
    return list;
  })();
  var textosPorOt = (datos && datos.textos_por_ot) || {};
  // Una sola OT activa a la vez (más intuitivo). Para copiar a otras se usa
  // el popover "Copiar a otras OTs" al lado del textarea.
  var _otTx = React.useState(function () { return otNroActual || (otsEnEnsayo[0] || ''); });
  var otActivaTextos = _otTx[0], setOtActivaTextos = _otTx[1];
  if (otsEnEnsayo.length > 0 && otsEnEnsayo.indexOf(otActivaTextos) < 0) {
    otActivaTextos = otNroActual || otsEnEnsayo[0];
  }
  // Popover "copiar a otras OTs": state por sección (key -> array de OTs destino).
  var _copyOpen = React.useState(''); // '' | 'observacion' | 'evaluacion' | 'nota'
  var copyOpen = _copyOpen[0], setCopyOpen = _copyOpen[1];
  var _copyDest = React.useState([]);
  var copyDest = _copyDest[0], setCopyDest = _copyDest[1];

  function getTextoOt(nroOt, key) {
    var m = textosPorOt[nroOt];
    if (m && m[key] !== undefined) return m[key];
    if (nroOt === otNroActual) return datos[key];
    return key.indexOf('tiene_') === 0 ? false : '';
  }
  function setTextoOt(nroOt, key, val) {
    var mapa = Object.assign({}, textosPorOt);
    mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
    mapa[nroOt][key] = val;
    if (nroOt === otNroActual) {
      var patch = { textos_por_ot: mapa };
      patch[key] = val;
      set(patch);
    } else {
      set('textos_por_ot', mapa);
    }
  }
  // Copia flag+texto de una OT a varias destino. One-shot: después cada OT
  // sigue independiente. Usado por el popover "Copiar a otras OTs".
  function copiarTextoAOts(fromNro, toNros, flagKey, textoKey) {
    if (!toNros || toNros.length === 0) return;
    var mapa = Object.assign({}, textosPorOt);
    var flagVal = getTextoOt(fromNro, flagKey);
    var textoVal = getTextoOt(fromNro, textoKey);
    var pisaActual = false;
    toNros.forEach(function (nroOt) {
      mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
      mapa[nroOt][flagKey] = flagVal;
      mapa[nroOt][textoKey] = textoVal;
      if (nroOt === otNroActual) pisaActual = true;
    });
    if (pisaActual) {
      var patch = { textos_por_ot: mapa };
      patch[flagKey] = flagVal;
      patch[textoKey] = textoVal;
      set(patch);
    } else {
      set('textos_por_ot', mapa);
    }
  }

  // Selector de OT: tabs simples (una activa). Aparece si hay 2+ OTs.
  var selectorOtTextos = otsEnEnsayo.length > 1
    ? _r('div', { style: {
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 12px', background: '#fff8e5',
        border: '1px solid #e0c060', borderTop: '1px solid #333',
        fontSize: 11,
      } },
        _r('span', { style: { fontWeight: 700, color: '#8a5a00', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em' } },
          'Editando OT:'),
        _r('div', { style: { display: 'inline-flex', border: '1px solid #d0d7de', borderRadius: 4, overflow: 'hidden', background: '#fff' } },
          otsEnEnsayo.map(function (nro, i) {
            var activa = nro === otActivaTextos;
            var esLaActual = nro === otNroActual;
            return _r('button', {
              key: nro, type: 'button',
              onClick: function () { setOtActivaTextos(nro); },
              style: {
                border: 'none',
                borderLeft: i === 0 ? 'none' : '1px solid #d0d7de',
                background: activa ? '#0969da' : '#fff',
                color: activa ? '#fff' : '#24292f',
                padding: '5px 12px', fontSize: 12,
                fontWeight: activa ? 700 : 500,
                cursor: activa ? 'default' : 'pointer',
                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              },
            },
              nro,
              esLaActual
                ? _r('span', { style: { fontSize: 9, opacity: 0.8, fontFamily: 'system-ui' } }, '· actual')
                : null);
          })),
        _r('span', { style: { fontSize: 10, color: '#8a5a00' } },
          'Cada OT tiene sus propios textos.'))
    : null;

  // Popover reutilizable para "Copiar a otras OTs". Aparece debajo del botón.
  function popoverCopiar(clave, flagKey, textoKey) {
    if (copyOpen !== clave) return null;
    var otrasOts = otsEnEnsayo.filter(function (n) { return n !== otActivaTextos; });
    if (otrasOts.length === 0) return null;
    return _r('div', { style: {
      position: 'absolute', zIndex: 20, top: '100%', right: 0, marginTop: 4,
      background: '#fff', border: '1px solid #d0d7de', borderRadius: 6,
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10,
      minWidth: 220, fontSize: 11,
    } },
      _r('div', { style: { fontWeight: 700, marginBottom: 6, fontSize: 11, color: '#24292f' } }, 'Copiar a otras OTs'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
        otrasOts.map(function (nro) {
          var checked = copyDest.indexOf(nro) >= 0;
          return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 4px', borderRadius: 3 } },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function () {
                setCopyDest(checked
                  ? copyDest.filter(function (n) { return n !== nro; })
                  : copyDest.concat([nro]));
              } }),
            _r('span', { style: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' } }, nro),
            nro === otNroActual
              ? _r('span', { style: { fontSize: 10, color: '#8a5a00' } }, '(actual)')
              : null);
        })),
      _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
        _r('button', { type: 'button',
          onClick: function () { setCopyOpen(''); setCopyDest([]); },
          style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' },
        }, 'Cancelar'),
        _r('button', { type: 'button',
          disabled: copyDest.length === 0,
          onClick: function () {
            copiarTextoAOts(otActivaTextos, copyDest, flagKey, textoKey);
            setCopyOpen(''); setCopyDest([]);
          },
          style: {
            border: '1px solid #0969da',
            background: copyDest.length === 0 ? '#cbd5e1' : '#0969da',
            color: '#fff', padding: '3px 10px', borderRadius: 3, fontSize: 11,
            cursor: copyDest.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600,
          },
        }, 'Copiar')));
  }

  // Helper: renderiza una sección opcional (checkbox + textarea) para la OT
  // activa. Debajo del textarea, botón "Copiar a otras OTs" (one-shot).
  function seccionOpcional(numero, titulo, flagKey, textoKey, placeholder) {
    var activa = !!getTextoOt(otActivaTextos, flagKey);
    var clave = textoKey; // usado para saber qué popover está abierto
    return _r('div', null,
      _r('div', { style: S.head },
        _r('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 800 } },
          _r('input', { type: 'checkbox', checked: activa,
            onChange: function (e) { setTextoOt(otActivaTextos, flagKey, e.target.checked); } }),
          _r('span', null, numero + '  ' + titulo),
          otsEnEnsayo.length > 1
            ? _r('span', { style: { fontSize: 10, color: '#8a5a00', fontWeight: 600, marginLeft: 6 } }, '· OT ' + otActivaTextos)
            : null)
      ),
      activa ? _r('div', { style: { padding: 8, position: 'relative' } },
        _r('textarea', { style: { width: '100%', minHeight: 70, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: getTextoOt(otActivaTextos, textoKey) || '', placeholder: placeholder,
          onChange: function (e) { setTextoOt(otActivaTextos, textoKey, e.target.value); } }),
        // Botón "Copiar a otras OTs" (solo si hay hermanas).
        otsEnEnsayo.length > 1
          ? _r('div', { style: { position: 'relative', display: 'flex', justifyContent: 'flex-end', marginTop: 4 } },
              _r('button', { type: 'button',
                title: 'Copiar este texto a otras OTs de la solicitud',
                onClick: function () {
                  if (copyOpen === clave) { setCopyOpen(''); setCopyDest([]); }
                  else { setCopyOpen(clave); setCopyDest([]); }
                },
                style: {
                  border: '1px solid #d0d7de',
                  background: copyOpen === clave ? '#f6f8fa' : '#fff',
                  color: '#0969da', padding: '3px 10px', borderRadius: 3,
                  fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                },
              }, '⇪ Copiar a otras OTs…'),
              popoverCopiar(clave, flagKey, textoKey))
          : null
      ) : null
    );
  }

  // 3 secciones INDEPENDIENTES: cada una con su check + textarea propio.
  // El generator emite cada bloque con heading numerado si el flag está on.
  var blockObservacion = seccionOpcional('1.6', 'OBSERVACIÓN',   'tiene_observacion', 'observacion_texto', 'Observación del ensayo…');
  var blockEvaluacion  = seccionOpcional('1.7', 'EVALUACIÓN',    'tiene_evaluacion',  'evaluacion_texto',  'Evaluación del ensayo…');
  var blockNota        = seccionOpcional('1.8', 'NOTA',          'tiene_nota',        'nota_texto',        'Nota adicional…');

  // Sección de "notas fijas" (marcados con *, **, etc.) — checkboxes de textos
  // pre-definidos por el laboratorio. Se emiten como líneas dentro del bloque
  // NOTA si están seleccionadas.
  var blockNotasFijas = _r('div', null,
    _r('div', { style: S.head }, '1.9  NOTAS PRE-DEFINIDAS (opcionales)'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, lineHeight: 1.4 } },
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_evaluaciones, onChange: function (e) { updBool('nota_evaluaciones', e.target.checked); } }),
        _r('span', null, 'Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_no_conforme, onChange: function (e) { updBool('nota_no_conforme', e.target.checked); } }),
        _r('span', null, 'El ítem marcado con (**) corresponde a un trabajo no conforme.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_incertidumbre, onChange: function (e) { updBool('nota_incertidumbre', e.target.checked); } }),
        _r('span', null, 'El cliente desea incorporar el dato de incertidumbre.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_externo, onChange: function (e) { updBool('nota_externo', e.target.checked); } }),
        _r('span', null, 'Los resultados marcados con (***) provienen de proveedor externo.'))
    )
  );

  // ── 1.6 CÁLCULO DE SECCIÓN ──────────────────────────────────────────────
  // Registro interno del FM-037: mediciones crudas de Ancho/Espesor/Diámetro
  // (x3), S1/S2/S3, verificación y S0. NO se informa en el Word; se guarda en
  // la DB para que el técnico haga los cálculos que alimentan los promedios/S0.
  var seccionCalc = Array.isArray(datos.seccion_calc) ? datos.seccion_calc.slice() : [];
  function scGet(i, k) { return (seccionCalc[i] && seccionCalc[i][k] != null) ? seccionCalc[i][k] : ''; }
  function scTipo(i) {
    var t = seccionCalc[i] && seccionCalc[i].tipo;
    return t === 'cil' ? 'cil' : 'rect'; // default rectangular
  }
  // Al cambiar cualquier input del bloque 1.1, recalcular con FM-044 y
  // POBLAR automáticamente los campos derivados en muestras[idxFisicas[i]]:
  // ancho/espesor/diámetro promedio, S0, tensiones, alargamiento, estricción...
  // El técnico no los edita en la tabla 1.5 (ahí quedan de solo lectura).
  // Cambia el nro_ot_override de una probeta física y propaga a sus zonas
  // extra. Si `nro` está vacío o coincide con la OT actual, se guarda '' para
  // marcar "usar OT del ensayo" (comportamiento default).
  function setOtProbeta(idxProbetaFisica, nro) {
    var val = String(nro || '').trim();
    if (val === otNroActual) val = '';
    var arr = muestras.slice();
    arr[idxProbetaFisica] = Object.assign({}, arr[idxProbetaFisica] || {}, { nro_ot_override: val });
    for (var j = 0; j < arr.length; j++) {
      var mm = arr[j];
      if (mm && mm._zona_extra && mm._probeta_padre === idxProbetaFisica) {
        arr[j] = Object.assign({}, mm, { nro_ot_override: val });
      }
    }
    set('muestras', arr);
  }
  // idxM = índice EN MUESTRAS (probetas + zonas). seccion_calc[] es paralelo.
  //   - Al cambiar el TIPO (rect ↔ cil), limpia los campos "de la variante
  //     anterior" en muestras[i] (los que ya no aplican).
  //   - Al cambiar cualquier otro input, sobrescribe SOLO los campos que
  //     calcularProbetaFM044 devuelve (los que tienen datos suficientes).
  //     Los demás quedan como están (respeta valores editados manualmente
  //     en la tabla 1.5 cuando el técnico no usa el bloque 1.1).
  function setSC(idxM, k, v) {
    var next = seccionCalc.slice();
    while (next.length <= idxM) next.push({});
    var scAnt = next[idxM] || {};
    next[idxM] = Object.assign({}, scAnt, {});
    next[idxM][k] = v;
    var calc = calcularProbetaFM044(next[idxM]);
    var muestrasNext = muestras.slice();
    if (muestrasNext[idxM] != null) {
      var patch = Object.assign({}, calc);
      // Al cambiar de variante, limpiar los campos de la anterior.
      if (k === 'tipo' && v !== scAnt.tipo) {
        var aLimpiar = v === 'rect' ? CAMPOS_SOLO_CIL : CAMPOS_SOLO_RECT;
        aLimpiar.forEach(function (kk) { patch[kk] = ''; });
      }
      muestrasNext[idxM] = Object.assign({}, muestrasNext[idxM] || {}, patch);
    }
    set({ seccion_calc: next, muestras: muestrasNext });
  }
  function prom3(i, keys) {
    var xs = keys.map(function (k) { return parseFloat(String(scGet(i, k)).replace(',', '.')); })
      .filter(function (x) { return !isNaN(x); });
    if (!xs.length) return '';
    return (xs.reduce(function (s, x) { return s + x; }, 0) / xs.length).toFixed(2);
  }
  // Verificación de dimensiones extremas por probeta.
  function scVerif(i) {
    var tipo = scTipo(i);
    var meds = tipo === 'rect'
      ? [scGet(i, 'a1'), scGet(i, 'a2'), scGet(i, 'a3')]
      : [scGet(i, 'd1'), scGet(i, 'd2'), scGet(i, 'd3')];
    return verifExtremosFM044(meds, scGet(i, 'ext1'), scGet(i, 'ext2'));
  }
  // ── Estilos del bloque cálculo de sección ─────────────────────────────
  var scStyles = {
    card: {
      border: '1px solid #d0d7de', borderRadius: 6, background: '#fff',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    },
    cardHead: {
      background: '#f6f8fa', padding: '8px 12px', borderBottom: '1px solid #d0d7de',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 12,
    },
    cardHeadNum: { fontWeight: 800, color: '#0969da' },
    cardHeadName: { fontWeight: 600, color: '#24292f' },
    cardBody: { padding: 10, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 },
    dimRow: {
      display: 'grid', gridTemplateColumns: '20px repeat(3, minmax(0, 1fr)) 80px',
      gap: 4, alignItems: 'center',
    },
    dimLabel: {
      fontWeight: 800, fontSize: 13, color: '#0969da', textAlign: 'center',
    },
    dimInputWrap: {
      display: 'flex', alignItems: 'center', gap: 0,
      border: '1px solid #d0d7de', borderRadius: 4, background: '#fff',
      minWidth: 0, overflow: 'hidden',
    },
    dimInput: {
      border: 'none', outline: 'none', width: '100%', minWidth: 0,
      padding: '4px 3px 4px 5px', textAlign: 'center', fontSize: 12, background: 'transparent',
    },
    dimUnit: { fontSize: 9, color: '#8a8a8a', paddingRight: 4, flexShrink: 0 },
    dimProm: {
      fontSize: 10, color: '#0a7a55', fontWeight: 700, textAlign: 'right',
      background: '#e6f9ef', border: '1px solid #a8d9c1', borderRadius: 3, padding: '3px 6px',
    },
    dimPromEmpty: { fontSize: 10, color: '#c0c0c0', textAlign: 'right', fontStyle: 'italic' },
    sRow: {
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 6, marginTop: 4,
    },
    sBox: {
      border: '1px solid #d0d7de', borderRadius: 4, background: '#fafbfc',
      padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 4,
    },
    sLabel: { fontWeight: 700, fontSize: 11, color: '#57606a', minWidth: 18 },
    sInput: {
      border: 'none', outline: 'none', width: '100%', padding: '2px 4px',
      textAlign: 'center', fontSize: 11, background: 'transparent',
    },
    sUnit: { fontSize: 9, color: '#8a8a8a' },
    footRow: {
      display: 'flex', alignItems: 'stretch', gap: 8, marginTop: 6,
      paddingTop: 8, borderTop: '1px dashed #d0d7de',
    },
    verifBox: { display: 'flex', gap: 4, alignItems: 'center', flex: 1 },
    verifLabel: { fontWeight: 700, fontSize: 10, color: '#57606a', textTransform: 'uppercase', letterSpacing: '.03em' },
    verifPill: function (activo, tono) {
      var color = tono === 'ok' ? '#0f7d3a' : '#b02a2a';
      return {
        padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700,
        border: '1px solid ' + (activo ? color : '#d0d7de'),
        background: activo ? color : '#fff',
        color: activo ? '#fff' : '#57606a',
        cursor: 'pointer', transition: '.12s',
      };
    },
    s0Box: {
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
      background: '#fff8e5', border: '1px solid #e0c060', borderRadius: 4,
    },
    s0Label: { fontWeight: 800, fontSize: 12, color: '#8a5a00' },
    s0Input: {
      border: 'none', outline: 'none', width: 80, padding: '2px 4px',
      textAlign: 'center', fontSize: 12, fontWeight: 700, background: 'transparent', color: '#8a5a00',
    },
    s0Unit: { fontSize: 9, color: '#8a5a00' },
  };

  function scDimRow(i, letra, keys, unidad) {
    var prom = prom3(i, keys);
    return _r('div', { style: scStyles.dimRow },
      _r('span', { style: scStyles.dimLabel }, letra),
      keys.map(function (k) {
        return _r('div', { key: k, style: scStyles.dimInputWrap },
          _r('input', {
            style: scStyles.dimInput,
            placeholder: letra + (keys.indexOf(k) + 1),
            value: scGet(i, k),
            onChange: function (e) { setSC(i, k, e.target.value); },
          }),
          _r('span', { style: scStyles.dimUnit }, unidad));
      }),
      prom !== ''
        ? _r('span', { style: scStyles.dimProm }, 'prom ' + prom)
        : _r('span', { style: scStyles.dimPromEmpty }, '—')
    );
  }

  // Navegación por teclado dentro de un card del bloque 1.1:
  //   Enter / ↓ → siguiente input del MISMO card marcado con data-sc-nav.
  //   ↑         → anterior. Tab funciona nativo (sin tocar).
  function scNavKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var card = e.target.closest('[data-sc-card]');
    if (!card) return;
    var inputs = Array.from(card.querySelectorAll('input[data-sc-nav]:not([disabled])'));
    var idx = inputs.indexOf(e.target);
    if (idx < 0) return;
    e.preventDefault();
    var next = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
    if (next >= 0 && next < inputs.length) inputs[next].focus();
  }

  // Navegación por teclado en la tabla 1.5 (Resultados obtenidos):
  //   Enter / ↓ → baja a la MISMA columna del siguiente parámetro (fila abajo).
  //   ↑         → sube a la misma columna del parámetro anterior.
  //   Tab funciona nativo (avanza por columna en la misma fila).
  function tablaResNavKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var td = e.target.closest('td');
    var tr = td && td.parentNode;
    var tbody = tr && tr.parentNode;
    if (!td || !tr || !tbody) return;
    var colIdx = Array.prototype.indexOf.call(tr.children, td);
    var rows = Array.prototype.slice.call(tbody.children);
    var rowIdx = rows.indexOf(tr);
    if (rowIdx < 0 || colIdx < 0) return;
    var delta = e.key === 'ArrowUp' ? -1 : 1;
    // Buscar el próximo tr que tenga un input focuseable en la misma columna.
    for (var i = rowIdx + delta; i >= 0 && i < rows.length; i += delta) {
      var nextTd = rows[i].children[colIdx];
      var nextInput = nextTd && nextTd.querySelector('input:not([disabled])');
      if (nextInput) {
        e.preventDefault();
        nextInput.focus();
        if (typeof nextInput.select === 'function') nextInput.select();
        return;
      }
    }
  }

  // Muestra un valor CALCULADO (readonly, fondo verde, para outputs del FM-044).
  function calcDisplay(valor, unidad) {
    var vacio = valor === '' || valor == null;
    return _r('div', { style: { display: 'flex', alignItems: 'center', gap: 3,
      padding: '3px 6px', background: vacio ? '#f6f8fa' : '#e6f9ef',
      border: '1px solid ' + (vacio ? '#d0d7de' : '#a8d9c1'), borderRadius: 4,
      minWidth: 0, flex: 1 } },
      _r('span', { style: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700,
        color: vacio ? '#c0c0c0' : '#0a7a55' } }, vacio ? '—' : String(valor)),
      unidad ? _r('span', { style: { fontSize: 9, color: '#8a8a8a', flexShrink: 0 } }, unidad) : null);
  }

  // Recibe el índice EN MUESTRAS (0..muestras.length-1). Cada muestra
  // (probeta física O zona extra) tiene su propia card de cálculo, así los
  // datos crudos de cada columna de la tabla 1.5 se ingresan aparte y sus
  // cálculos van a la celda correspondiente.
  function scBlock(idxM) {
    var m = (muestras[idxM] || {});
    var esZona = !!m._zona_extra;
    var probIdx = esZona ? m._probeta_padre : idxM;
    var iFis = idxFisicas.indexOf(probIdx);
    if (iFis < 0) iFis = 0;
    var nombreMuestra = m.nombre || ('M' + (iFis + 1));
    var zonaLabel = String(m.zona || '').trim();
    var tipo = scTipo(idxM);
    var verif = scVerif(idxM);
    var extLabel = tipo === 'rect' ? 'Ancho extremo' : 'Diámetro extremo';

    // Fila de un input crudo genérico (label a la izquierda, input + unidad).
    function inputRow(label, key, unidad, ancho) {
      return _r('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flex: ancho || 1 } },
        _r('span', { style: { fontWeight: 700, fontSize: 10, color: '#57606a', minWidth: 82 } }, label),
        _r('div', { style: { display: 'flex', alignItems: 'center', border: '1px solid #d0d7de', borderRadius: 4, background: '#fff', flex: 1, minWidth: 0 } },
          _r('input', { style: { border: 'none', outline: 'none', width: '100%', minWidth: 0, padding: '4px 5px', textAlign: 'center', fontSize: 11, background: 'transparent' },
            value: scGet(idxM, key), onChange: function (e) { setSC(idxM, key, e.target.value); } }),
          unidad ? _r('span', { style: { fontSize: 9, color: '#8a8a8a', paddingRight: 4, flexShrink: 0 } }, unidad) : null));
    }
    // Fila de display para un campo calculado (readonly).
    function calcRow(label, campo, unidad) {
      return _r('div', { style: { display: 'flex', alignItems: 'center', gap: 4, flex: 1 } },
        _r('span', { style: { fontWeight: 700, fontSize: 10, color: '#57606a', minWidth: 82 } }, label),
        calcDisplay(m[campo] || '', unidad));
    }

    // Estilo del borde del card — amarillento suave para zonas extra.
    var cardStyleZona = Object.assign({}, scStyles.card,
      esZona ? { borderColor: '#e0c060', background: '#fffbef' } : {});
    var cardHeadStyleZona = Object.assign({}, scStyles.cardHead,
      esZona ? { background: '#fff3cd', borderBottomColor: '#e0c060' } : {});

    return _r('div', { key: idxM, style: cardStyleZona, 'data-sc-card': String(idxM) },
      _r('div', { style: cardHeadStyleZona },
        _r('span', null,
          esZona
            ? _r(React.Fragment, null,
                _r('span', { style: { fontWeight: 800, color: '#8a5a00' } }, 'Zona'),
                _r('span', { style: { color: '#8a8a8a', margin: '0 6px' } }, '·'),
                _r('span', { style: scStyles.cardHeadName }, (zonaLabel || '—') + ' — de Probeta ' + (iFis + 1) + ' (' + nombreMuestra + ')'))
            : _r(React.Fragment, null,
                _r('span', { style: scStyles.cardHeadNum }, 'Probeta ' + (iFis + 1)),
                _r('span', { style: { color: '#8a8a8a', margin: '0 6px' } }, '·'),
                _r('span', { style: scStyles.cardHeadName }, nombreMuestra))
        ),
        _r('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
          // Toggle tipo de probeta (aplica a probeta o zona por igual).
          _r('button', { type: 'button', title: 'Probeta plana (ancho × espesor)',
            style: {
              border: '1px solid ' + (tipo === 'rect' ? '#0969da' : '#d0d7de'),
              background: tipo === 'rect' ? '#0969da' : '#fff',
              color: tipo === 'rect' ? '#fff' : '#57606a',
              borderRadius: 3, fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
            },
            onClick: function () { setSC(idxM, 'tipo', 'rect'); },
          }, 'Rect.'),
          _r('button', { type: 'button', title: 'Probeta cilíndrica (diámetro)',
            style: {
              border: '1px solid ' + (tipo === 'cil' ? '#0969da' : '#d0d7de'),
              background: tipo === 'cil' ? '#0969da' : '#fff',
              color: tipo === 'cil' ? '#fff' : '#57606a',
              borderRadius: 3, fontSize: 10, fontWeight: 700, padding: '3px 8px', cursor: 'pointer',
            },
            onClick: function () { setSC(idxM, 'tipo', 'cil'); },
          }, 'Cil.'),
          // Separador visual.
          _r('span', { style: { width: 1, height: 16, background: '#d0d7de', margin: '0 3px' } }),
          // Botón contextual: probeta → "+ zona"; zona → "×".
          esZona
            ? _r('button', { type: 'button', title: 'Eliminar esta zona extra',
                style: {
                  border: '1px solid #c00', background: '#fff', color: '#c00',
                  borderRadius: 3, width: 22, height: 22, fontSize: 12, lineHeight: 1,
                  cursor: 'pointer', padding: 0, fontWeight: 700,
                },
                onClick: function () { eliminarZonaExtra(idxM); } }, '×')
            : _r('button', { type: 'button', title: 'Agregar zona extra a esta probeta',
                style: {
                  border: '1px solid #0969da', background: '#fff', color: '#0969da',
                  borderRadius: 3, height: 22, fontSize: 10, lineHeight: 1,
                  cursor: 'pointer', padding: '0 8px', fontWeight: 700,
                },
                onClick: function () { agregarZonaExtra(iFis); } }, '+ zona')
        )
      ),
      _r('div', { style: scStyles.cardBody },
        // ── Selector de OT (solo probetas físicas; las zonas heredan del padre) ──
        // Permite que una misma card apunte a otra OT. Default: OT del ensayo.
        // Cambiar la OT en la probeta lo propaga a todas sus zonas ligadas.
        !esZona
          ? (function () {
              var otOverride = String(m.nro_ot_override || '').trim();
              var otEffective = otOverride || otNroActual;
              var esOtra = otOverride && otOverride !== otNroActual;
              // Solo se puede transferir a OTs hermanas (misma solicitud).
              // Si no hay hermanas, el select queda deshabilitado.
              var hayHermanas = otsDisponibles.length > 1;
              return _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                padding: '4px 8px',
                background: esOtra ? '#fff8e5' : '#f6f8fa',
                border: '1px solid ' + (esOtra ? '#e0c060' : '#d0d7de'),
                borderRadius: 4 } },
                _r('span', { style: { fontWeight: 700, fontSize: 10,
                  color: esOtra ? '#8a5a00' : '#57606a' } }, 'OT:'),
                _r('select', {
                  disabled: !hayHermanas,
                  title: hayHermanas
                    ? 'Cambiar la OT destino de esta probeta (solo OTs de la misma solicitud)'
                    : 'La solicitud tiene una sola OT — no hay a dónde transferir',
                  style: {
                    border: '1px solid #d0d7de', borderRadius: 3, padding: '2px 5px',
                    fontSize: 11, flex: 1, background: hayHermanas ? '#fff' : '#f6f8fa',
                    color: hayHermanas ? '#24292f' : '#8a8a8a',
                    minWidth: 0, cursor: hayHermanas ? 'pointer' : 'not-allowed',
                  },
                  value: otEffective,
                  onChange: function (e) { setOtProbeta(idxM, e.target.value); },
                },
                  otsDisponibles.map(function (o) {
                    var label = o.nro_ot +
                      (o.nro_ot === otNroActual ? '  (esta OT)' : '') +
                      (o.id_muestra ? ' — ' + o.id_muestra.split('\n')[0].slice(0, 40) : '');
                    return _r('option', { key: o.nro_ot, value: o.nro_ot }, label);
                  })),
                esOtra
                  ? _r('span', { style: { fontSize: 9, color: '#8a5a00', fontWeight: 700 }, title: 'Esta probeta se emite en el Word de otra OT' }, '↗')
                  : null);
            })()
          : null,
        // Si es zona: input del nombre de zona (Zona A / Superficie / etc.).
        // La OT ya viene heredada del padre — no se muestra selector.
        esZona
          ? _r('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 } },
              _r('span', { style: { fontWeight: 700, fontSize: 10, color: '#8a5a00', minWidth: 82 } }, 'Nombre zona:'),
              _r('input', { style: { border: '1px solid #d0d7de', borderRadius: 4, padding: '4px 6px', fontSize: 11, flex: 1, background: '#fff', fontWeight: 600 },
                'data-sc-nav': '1',
                value: zonaLabel, placeholder: 'Ej: Superficie, Núcleo, Zona A…',
                onKeyDown: scNavKeyDown,
                onChange: function (e) { setMuestra(idxM, 'zona', e.target.value); } }))
          : null,
        // ── LAYOUT TABULAR (v2 — más intuitivo) ─────────────────────────
        // 3 tablas separadas con títulos claros. Cada input está en su celda,
        // los cálculos aparecen en verde claro. Estructura pensada para que
        // el técnico vea de un vistazo qué carga y qué se calcula.
        (function () {
          var secciones = calcSeccionesFM044(seccionCalc[idxM] || {});
          var promA = prom3(idxM, ['a1', 'a2', 'a3']);
          var promE = prom3(idxM, ['e1', 'e2', 'e3']);
          var promD = prom3(idxM, ['d1', 'd2', 'd3']);
          // Estilos comunes.
          var stTable = { borderCollapse: 'collapse', width: '100%', fontSize: 11, marginTop: 4 };
          var stTh    = { border: '1px solid #d0d7de', padding: '4px 6px', background: '#f6f8fa', fontWeight: 700, color: '#57606a', textAlign: 'center', fontSize: 10 };
          var stTd    = { border: '1px solid #d0d7de', padding: 0, background: '#fff' };
          var stTdCel = Object.assign({}, stTd, { padding: '3px 4px', textAlign: 'center', background: '#fafbfc', fontWeight: 700, color: '#24292f' });
          var stTdCalc= Object.assign({}, stTd, { padding: '3px 4px', textAlign: 'center', background: '#e6f9ef', fontWeight: 700, color: '#0a7a55', borderColor: '#a8d9c1' });
          var stTdCalcEmpty = Object.assign({}, stTd, { padding: '3px 4px', textAlign: 'center', color: '#c0c0c0' });
          var stInpCell = { border: 'none', outline: 'none', width: '100%', padding: '4px 5px', textAlign: 'center', fontSize: 11, background: 'transparent' };
          var stSubtit = { fontSize: 9, color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 8, marginBottom: 2, fontWeight: 700 };

          function inpCell(key) {
            return _r('td', { style: stTd },
              _r('input', { style: stInpCell,
                'data-sc-nav': '1',
                value: scGet(idxM, key),
                onKeyDown: scNavKeyDown,
                onChange: function (e) { setSC(idxM, key, e.target.value); } }));
          }
          var stTdNota = Object.assign({}, stTd, { padding: '3px 4px', textAlign: 'center', background: '#ffd7d7', color: '#b02a2a', fontWeight: 800, borderColor: '#c07070' });
          function calcCell(v, unidad) {
            var vacio = v === '' || v == null;
            var esNota = v === 'NOTA';
            var st = esNota ? stTdNota : (vacio ? stTdCalcEmpty : stTdCalc);
            return _r('td', {
              style: st,
              title: esNota ? 'Cálculo dio valor negativo — agregar nota explicativa' : '',
            }, vacio ? '—' : (String(v) + (esNota || !unidad ? '' : ' ' + unidad)));
          }

          // ── TABLA 1 · DIMENSIONES (mediciones + sección por medición) ─
          var dimensRows = [];
          if (tipo === 'rect') {
            dimensRows.push(_r('tr', { key: 'A' },
              _r('td', { style: stTdCel }, 'Ancho (A)'),
              inpCell('a1'), inpCell('a2'), inpCell('a3'),
              calcCell(promA, ''), _r('td', { style: stTdCel }, 'mm')));
            dimensRows.push(_r('tr', { key: 'E' },
              _r('td', { style: stTdCel }, 'Espesor (E)'),
              inpCell('e1'), inpCell('e2'), inpCell('e3'),
              calcCell(promE, ''), _r('td', { style: stTdCel }, 'mm')));
          } else {
            dimensRows.push(_r('tr', { key: 'D' },
              _r('td', { style: stTdCel }, 'Diámetro (D)'),
              inpCell('d1'), inpCell('d2'), inpCell('d3'),
              calcCell(promD, ''), _r('td', { style: stTdCel }, 'mm')));
          }
          dimensRows.push(_r('tr', { key: 'S' },
            _r('td', { style: Object.assign({}, stTdCel, { background: '#fff8e5' }) }, 'Sección (S)'),
            calcCell(secciones[0], ''), calcCell(secciones[1], ''), calcCell(secciones[2], ''),
            calcCell(m.seccion_inicial, ''),
            _r('td', { style: Object.assign({}, stTdCel, { background: '#fff8e5', color: '#8a5a00' }) }, 'mm² (S₀)')));

          var tablaDimens = _r('table', { style: stTable },
            _r('thead', null,
              _r('tr', null,
                _r('th', { style: stTh, rowSpan: 1 }, ''),
                _r('th', { style: stTh }, 'Med. 1'),
                _r('th', { style: stTh }, 'Med. 2'),
                _r('th', { style: stTh }, 'Med. 3'),
                _r('th', { style: stTh }, 'Promedio'),
                _r('th', { style: stTh }, 'Unidad'))),
            _r('tbody', null, dimensRows));

          // ── TABLA 2 · CARGAS Y LONGITUDES (inputs manuales) ─────────
          var cargaRows = [
            { label: 'Carga de rotura',    key: 'fr', unit: 'DaN' },
            { label: 'Carga de fluencia',  key: 'ff', unit: 'DaN' },
            { label: 'Longitud inicial',   key: 'l0', unit: 'mm' },
            { label: 'Longitud final',     key: 'lf', unit: 'mm' },
          ];
          if (tipo === 'cil') cargaRows.push({ label: 'Diámetro final', key: 'df', unit: 'mm' });

          var tablaCarga = _r('table', { style: stTable },
            _r('thead', null,
              _r('tr', null,
                _r('th', { style: Object.assign({}, stTh, { textAlign: 'left', paddingLeft: 10 }) }, 'Parámetro'),
                _r('th', { style: stTh }, 'Valor'),
                _r('th', { style: stTh, width: 60 }, 'Unidad'))),
            _r('tbody', null,
              cargaRows.map(function (r) {
                return _r('tr', { key: r.key },
                  _r('td', { style: Object.assign({}, stTdCel, { textAlign: 'left', paddingLeft: 10 }) }, r.label),
                  inpCell(r.key),
                  _r('td', { style: Object.assign({}, stTdCel, { color: '#8a8a8a', fontWeight: 500 }) }, r.unit));
              })));

          // ── VERIFICACIÓN DE EXTREMOS (compacta, con chip PASA/NO PASA) ─
          // gridTemplateColumns con minmax(0, 1fr) para que las columnas se
          // encojan sin desbordar cuando la card queda estrecha (2 por fila).
          // Los divs internos también necesitan min-width: 0 y el input width: 100%
          // + box-sizing: border-box para que el padding entre dentro del borde.
          var verifBlock = _r('div', { style: { marginTop: 6, padding: '6px 8px', border: '1px solid #d0d7de', borderRadius: 4, background: '#fafbfc',
            display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr) minmax(0, 1fr) auto', gap: 6, alignItems: 'center', fontSize: 11, boxSizing: 'border-box' } },
            _r('span', { style: { fontWeight: 700, fontSize: 10, color: '#57606a', textTransform: 'uppercase' } }, 'Verif. extremos'),
            _r('div', { style: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 } },
              _r('span', { style: { fontSize: 10, color: '#57606a', flexShrink: 0 } }, extLabel.split(' ')[0] + ' 1'),
              _r('input', { style: { border: '1px solid #d0d7de', borderRadius: 3, padding: '2px 5px', fontSize: 11, flex: 1, minWidth: 0, width: '100%', boxSizing: 'border-box', textAlign: 'center' },
                'data-sc-nav': '1',
                value: scGet(idxM, 'ext1'),
                onKeyDown: scNavKeyDown,
                onChange: function (e) { setSC(idxM, 'ext1', e.target.value); } })),
            _r('div', { style: { display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 } },
              _r('span', { style: { fontSize: 10, color: '#57606a', flexShrink: 0 } }, extLabel.split(' ')[0] + ' 2'),
              _r('input', { style: { border: '1px solid #d0d7de', borderRadius: 3, padding: '2px 5px', fontSize: 11, flex: 1, minWidth: 0, width: '100%', boxSizing: 'border-box', textAlign: 'center' },
                'data-sc-nav': '1',
                value: scGet(idxM, 'ext2'),
                onKeyDown: scNavKeyDown,
                onChange: function (e) { setSC(idxM, 'ext2', e.target.value); } })),
            verif
              ? _r('span', { style: {
                  padding: '3px 12px', borderRadius: 12, fontSize: 10, fontWeight: 800,
                  color: '#fff', background: verif === 'PASA' ? '#0f7d3a' : '#b02a2a',
                  whiteSpace: 'nowrap',
                } }, verif)
              : _r('span', { style: { fontSize: 10, color: '#8a8a8a', fontStyle: 'italic' } }, '—'));

          // ── TABLA 3 · RESULTADOS CALCULADOS (readonly, verde) ────────
          var resultRows = [];
          if (tipo === 'rect') {
            resultRows.push({ label: 'Ancho promedio',    campo: 'ancho_promedio',    unit: 'mm' });
            resultRows.push({ label: 'Espesor promedio',  campo: 'espesor_promedio',  unit: 'mm' });
          } else {
            resultRows.push({ label: 'Diámetro promedio', campo: 'diametro_promedio', unit: 'mm' });
          }
          resultRows.push({ label: 'Sección inicial (S₀)', campo: 'seccion_inicial',      unit: 'mm²', destacado: true });
          resultRows.push({ label: 'Tensión de rotura',    campo: 'resistencia_traccion', unit: 'MPa', destacado: true });
          resultRows.push({ label: 'Tensión de fluencia',  campo: 'tension_fluencia',     unit: 'MPa', destacado: true });
          resultRows.push({ label: 'Alargamiento',         campo: 'alargamiento',         unit: '%',   destacado: true });
          if (tipo === 'cil') {
            resultRows.push({ label: 'Sección final (Sf)', campo: 'seccion_final', unit: 'mm²' });
            resultRows.push({ label: 'Estricción',          campo: 'estriccion',    unit: '%',   destacado: true });
          }

          var tablaResult = _r('table', { style: stTable },
            _r('thead', null,
              _r('tr', null,
                _r('th', { style: Object.assign({}, stTh, { textAlign: 'left', paddingLeft: 10, background: '#e6f9ef', color: '#0a7a55', borderColor: '#a8d9c1' }) }, 'Resultado'),
                _r('th', { style: Object.assign({}, stTh, { background: '#e6f9ef', color: '#0a7a55', borderColor: '#a8d9c1' }) }, 'Valor'),
                _r('th', { style: Object.assign({}, stTh, { background: '#e6f9ef', color: '#0a7a55', borderColor: '#a8d9c1', width: 60 }) }, 'Unidad'))),
            _r('tbody', null,
              resultRows.map(function (r) {
                var val = m[r.campo];
                var vacio = val === '' || val == null;
                var esNota = val === 'NOTA';
                var celValor = esNota ? stTdNota : (vacio ? stTdCalcEmpty : stTdCalc);
                var fontLarge = r.destacado && !vacio && !esNota ? { fontSize: 13, fontWeight: 800 } : {};
                return _r('tr', { key: r.campo, title: esNota ? 'Cálculo negativo — cargar nota explicativa' : '' },
                  _r('td', { style: Object.assign({}, stTdCel, { textAlign: 'left', paddingLeft: 10, fontWeight: r.destacado ? 700 : 500 }) }, r.label),
                  _r('td', { style: Object.assign({}, celValor, fontLarge) }, vacio ? '—' : String(val)),
                  _r('td', { style: Object.assign({}, stTdCel, { color: '#8a8a8a', fontWeight: 500 }) }, r.unit));
              })));

          return _r(React.Fragment, null,
            _r('div', { style: stSubtit }, 'Dimensiones · mediciones'),
            tablaDimens,
            _r('div', { style: stSubtit }, 'Cargas y longitudes'),
            tablaCarga,
            verifBlock,
            _r('div', { style: Object.assign({}, stSubtit, { color: '#0a7a55', marginTop: 10 }) }, '⇩ Resultados calculados automáticamente'),
            tablaResult
          );
        })()
      )
    );
  }
  // Una card por CADA columna de la tabla 1.5 (probetas físicas + zonas extras).
  // Los cálculos de cada card se auto-populan en la columna correspondiente.
  var scBlocks = muestras.map(function (_m, idxM) { return scBlock(idxM); });
  var block16 = _r('div', null,
    _r('div', { style: S.head }, '1.2  CÁLCULO DE SECCIÓN'),
    _r('div', { style: { padding: 8 } },
      _r('div', { style: { fontSize: 10, color: '#555', marginBottom: 8 } },
        'Cada card corresponde a una columna de la tabla de resultados (probeta o zona). Los promedios, S₀, tensiones y alargamiento se calculan automáticamente según el FM-044.'),
      // Máximo 2 cards por fila (o 1 si hay solo una card). Así los inputs
      // no se hacen tan angostos que no se lean los valores.
      _r('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: scBlocks.length <= 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        },
      }, scBlocks)
    )
  );

  // La firma se maneja igual que en el resto de los ensayos: el panel de firma
  // digital compartido (FirmaEnsayoPanel) lo renderiza ensayoform.jsx al pie,
  // cuando el ensayo ya está guardado. No agregamos pie propio acá.
  // Orden final:
  //   CANTIDAD DE PROBETAS       (blockCantidad — arriba de todo)
  //   1.1 Condiciones por probeta (blockProbetas — arriba, define norma/código/orientación por-OT)
  //   1.2 Cálculo de sección     (block16)
  //   1.3 Condiciones generales  (block11)
  //   1.4 Equipamiento           (block12)
  //   1.5 Resultados obtenidos   (block13)
  //   1.6 Observación           (blockObservacion, opcional)
  //   1.7 Evaluación            (blockEvaluacion, opcional)
  //   1.8 Nota                  (blockNota, opcional)
  //   1.9 Notas pre-definidas   (blockNotasFijas)
  // Banner: si hay muestras asignadas a otras OTs, listar cuáles.
  var otsUnicas = {};
  muestras.forEach(function (mm) {
    var no = String((mm || {}).nro_ot_override || '').trim();
    if (no && no !== otNroActual) otsUnicas[no] = (otsUnicas[no] || 0) + 1;
  });
  var listaOtsExtra = Object.keys(otsUnicas);
  var bannerMultiOt = listaOtsExtra.length > 0
    ? _r('div', { style: { padding: '8px 12px', background: '#fff8e5', border: '1px solid #e0c060', color: '#8a5a00', fontSize: 11, borderBottom: '1px solid #333' } },
        _r('strong', null, 'Ensayo multi-OT: '),
        'este registro tiene probetas asignadas a otra(s) OT. Al generar el Word se emitirá un archivo por cada OT. Otras OTs: ',
        listaOtsExtra.map(function (n) { return n + ' (' + otsUnicas[n] + ' probeta' + (otsUnicas[n] === 1 ? '' : 's') + ')'; }).join(', '))
    : null;
  // Botón GLOBAL "Copiar TODO" — combina 1.2 (condiciones) + 1.4 (equipamiento).
  var CAMPOS_TODO_TR = [
    'variante',
    // 1.2 condiciones generales
    'metodologia', 'temperatura', 'ecuacion_seccion',
    'estado_superficial', 'verif_alineacion', 'prob_cliente', 'prob_soldada',
    // 1.4 equipamiento
    'equipamiento', 'equipamiento_tags', 'otros_equipos',
  ];
  var barraCopiarTodoTr = multiOtTr ? _r('div', {
    style: {
      padding: '8px 12px', background: '#e7f0ff', border: '1px solid #0969da',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, marginBottom: 4,
    },
  },
    _r('span', { style: { fontSize: 16 } }, '📋'),
    _r('span', { style: { flex: 1, color: '#0550ae' } },
      'Copiar TODA la configuración (condiciones + equipamiento) a otras OT en un solo click.'),
    botonCopiarSeccionTr('copiar_todo', 'Copiar todo a otras OT',
      CAMPOS_TODO_TR,
      'Copia condiciones generales (1.3) y equipamiento (1.4). La sección 1.1 (norma / código / plano / orientación / probeta mec.) NO se copia — es específica de cada OT.')
  ) : null;

  return _r('div', { style: S.sheet },
    bannerMultiOt,
    barraCopiarTodoTr,
    blockCantidad, blockProbetas, block16, block11, block12, block13,
    selectorOtTextos,
    blockObservacion, blockEvaluacion, blockNota, blockNotasFijas
  );
}

Object.assign(window, { TraccionForm: TraccionForm });
