/* ============================================================================
 * QuimicosForm — layout espejo del preinforme físico FM-033 Rev 03.
 *
 * Fiel a la planilla de papel:
 *   1.1 NORMAS/PROCEDIMIENTOS ENSAYOS (ITMs + ASTM + Temperatura + Patrón)
 *   1.2 VERIFICACIONES Y CONDICIONES (estados, calibración, base, zona, cant.)
 *   1.3 EQUIPAMIENTO UTILIZADO (con TAG editable por item)
 *   1.4 RESULTADOS OBTENIDOS — tabla integrada con MUESTRAS + PATRONES +
 *       ESPECIFICACIÓN, filas OT N° / Muestra N° / 30 elementos / TIPO.
 *   1.5 OBSERVACIONES / EVALUACIÓN (textarea libre + checkbox "material tipo").
 *
 * Schema compat con template-quimicos.js: preserva keys `norma_*`, `*_year`,
 * `temperatura`, `patron`, `estado_*`, `calibracion`, `seleccion_base`,
 * `zona_evaluacion`, `cantidad_determinaciones`, `equipamiento.*`,
 * `equipamiento_tags.*`, `muestras[i][elem]`, `muestras_on[]`, `espec[k].min/max`,
 * `patrones[i]{serie,valor,rango}`, `evaluacion_texto`, `material_tipo`,
 * `tiene_evaluacion`. Campos nuevos (`ot_numeros`, `patrones[i].valores`,
 * `patrones[i].rangos`, `patrones[i].tipo`, `patrones[i].muestra_nombre`,
 * `observaciones_libres`) se guardan en BD aunque el generator no los emita.
 * ========================================================================== */
'use strict';

var _r = React.createElement;

// Normas checkbox — labels IDÉNTICAS a la planilla FM-033.
var QUIMICOS_NORMAS = [
  { key: 'norma_itm054',   label: 'ITM-054*',                                             corta: true },
  { key: 'norma_itm057',   label: 'ITM-057*',                                             corta: true },
  { key: 'norma_itm058',   label: 'ITM-058*',                                             corta: true },
  { key: 'norma_itm091',   label: 'ITM-091*',                                             corta: true },
  { key: 'norma_itqb068',  label: 'ITQB N°068',                                           corta: true },
  { key: 'norma_e663',     label: 'ABSORCION ATOMICA - ASTM E 663*' },
  { key: 'norma_e415',     label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 415*' },
  { key: 'norma_e634',     label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 634*' },
  { key: 'norma_e1086',    label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 1086*' },
  { key: 'norma_e1251',    label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 1251*' },
  { key: 'norma_e1999',    label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 1999*' },
  { key: 'norma_e2209',    label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 2209*' },
  { key: 'norma_e2994',    label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 2994*' },
  { key: 'norma_e3047',    label: 'ESPECTOMETRIA DE EMISION OPTICA - ASTM E 3047*' },
  { key: 'norma_e1019',    label: 'COMBUSTION Y ABSORCION INF. - ASTM E 1019*' },
  { key: 'norma_a751',     label: 'ANALISIS QUIMICO - ASTM A 751*' },
  { key: 'norma_e1024',    label: 'ANALISIS QUIMICO - ASTM E 1024*' },
];

// Elementos químicos — orden y labels IDÉNTICAS a la planilla FM-033.
var QUIMICOS_ELEMENTS = [
  { k: 'carbono',    label: 'Carbono %'    },
  { k: 'manganeso',  label: 'Manganeso %'  },
  { k: 'silicio',    label: 'Silicio %'    },
  { k: 'fosforo',    label: 'Fosforo %'    },
  { k: 'azufre',     label: 'Azufre %'     },
  { k: 'cromo',      label: 'Cromo %'      },
  { k: 'niquel',     label: 'Níquel %'     },
  { k: 'molibdeno',  label: 'Molibdeno %'  },
  { k: 'cobre',      label: 'Cobre %'      },
  { k: 'vanadio',    label: 'Vanadio %'    },
  { k: 'carb_eq',    label: 'Carb.eq %'    },
  { k: 'titanio',    label: 'Titanio %'    },
  { k: 'niobio',     label: 'Niobio %'     },
  { k: 'boro',       label: 'Boro %'       },
  { k: 'aluminio',   label: 'Aluminio %'   },
  { k: 'plomo',      label: 'Plomo %'      },
  { k: 'cobalto',    label: 'Cobalto %'    },
  { k: 'tungsteno',  label: 'Tungsteno %'  },
  { k: 'magnesio',   label: 'Magnesio %'   },
  { k: 'hierro',     label: 'Hierro %'     },
  { k: 'nitrogeno',  label: 'Nitrógeno %'  },
  { k: 'estano',     label: 'Estaño %'     },
  { k: 'zinc',       label: 'Cinc %'       },
  { k: 'antimonio',  label: 'Antimonio %'  },
  { k: 'cadmio',     label: 'Cadmio %'     },
  { k: 'arsenico',   label: 'Arsénico %'   },
  { k: 'selenio',    label: 'Selenio %'    },
  { k: 'bismuto',    label: 'Bismuto %'    },
  { k: 'plata',      label: 'Plata %'      },
];

var QUIMICOS_EQUIPOS_CABA = [
  { key: 'aa_shimadzu_478', nombre: 'Absorción Atómica SHIMADZU',                      tagDefault: 'MM-478' },
  { key: 'spectrotest_361', nombre: 'Espectometro SPECTROTEST',                        tagDefault: 'MM-361' },
  { key: 'spectrotest_463', nombre: 'Espectometro SPECTROTEST',                        tagDefault: 'MM-463' },
  { key: 'spectromax_164',  nombre: 'Espectometro SPECTROMAX',                         tagDefault: 'MM-164' },
  { key: 'rayos_x_346',     nombre: 'Rayos X Marca OXFORD',                            tagDefault: 'MM-346' },
  { key: 'icp_oes_371',     nombre: 'Espectrómetro de emisión atómica ICP-OES',        tagDefault: 'QB-371' },
  { key: 'eltra_102',       nombre: 'Determinador de carbono y azufre ELTRA',          tagDefault: 'MM-102' },
  { key: 'termohigro_701',  nombre: 'Temohigrómetro',                                  tagDefault: 'MM-701' },
];
var QUIMICOS_EQUIPOS_NEUQUEN = [
  { key: 'spectrotest_463', nombre: 'Espectometro SPECTROTEST',  tagDefault: 'MM-463' },
  { key: 'termohigro_794',  nombre: 'Temohigrómetro',            tagDefault: 'MM-794' },
];

var N_MUESTRAS = 3;

function QuimicosForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  // ── Multi-OT: mismo patrón que plegado / tracción / impacto ────────────────
  // Cada muestra (M1, M2, M3) puede asignarse a una OT hermana. Al guardar,
  // saveEnsayoQuimicosMultiOt divide las muestras por nro_ot_override.
  var otNroActual = props.otNro || '';
  var otActualObj = otNroActual && window.LabStore && window.LabStore.getOt
    ? window.LabStore.getOt(otNroActual) : null;
  var solActual = otActualObj && otActualObj.nro_solicitud;
  var otsDisponibles = (solActual && window.LabStore.listOtsBySolicitud)
    ? window.LabStore.listOtsBySolicitud(solActual)
    : (otActualObj ? [otActualObj] : []);
  var multiOtQ = otsDisponibles.length > 1;
  var otNroActualStr = String(otNroActual || '');

  // Sección 1.1 CONDICIONES DE ENSAYO (por-OT): norma_ensayo_ot + codigo_ref
  // viven en datos.condiciones_por_ot[<OT>]. El técnico ve/edita valores de la
  // OT ACTIVA (tab arriba) — cada OT hermana puede tener valores distintos.
  var condPorOt = (datos && datos.condiciones_por_ot) || {};
  var _otActivaCond = React.useState(otNroActualStr);
  var otActivaCond = _otActivaCond[0], setOtActivaCond = _otActivaCond[1];
  if (multiOtQ && otsDisponibles.indexOf && otsDisponibles.length > 0) {
    var nrosDisp = otsDisponibles.map(function (o) { return String(o.nro_ot); });
    if (nrosDisp.indexOf(otActivaCond) < 0) otActivaCond = otNroActualStr || nrosDisp[0];
  }
  function getCondOt(nroOt, key) {
    var m = condPorOt[nroOt];
    if (m && m[key] !== undefined && m[key] !== '') return m[key];
    return '';
  }
  function setCondOt(nroOt, key, val) {
    var mapa = Object.assign({}, condPorOt);
    mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
    if (val === '' || val == null) delete mapa[nroOt][key];
    else mapa[nroOt][key] = val;
    if (Object.keys(mapa[nroOt]).length === 0) delete mapa[nroOt];
    set('condiciones_por_ot', mapa);
  }

  var muestras = Array.isArray(datos.muestras) ? datos.muestras.slice() : [];
  while (muestras.length < N_MUESTRAS) muestras.push({});

  var mOn = Array.isArray(datos.muestras_on) ? datos.muestras_on.slice() : [];
  while (mOn.length < N_MUESTRAS) mOn.push(true);

  var otNumeros = Array.isArray(datos.ot_numeros) ? datos.ot_numeros.slice() : [];
  while (otNumeros.length < N_MUESTRAS) otNumeros.push('');

  var patrones = Array.isArray(datos.patrones) ? datos.patrones.slice() : [];
  if (patrones.length === 0) patrones.push({});

  function setMuestra(i, key, val) {
    var next = muestras.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('muestras', next);
  }
  function toggleMuestra(i) {
    var next = mOn.slice();
    next[i] = !next[i];
    set('muestras_on', next);
  }
  function setOtNumero(i, val) {
    var next = otNumeros.slice();
    next[i] = val;
    set('ot_numeros', next);
  }
  function setPatron(i, key, val) {
    var next = patrones.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('patrones', next);
  }
  function setPatronElem(i, elemK, campo, val) {
    // campo = 'valor' | 'rango'  → guarda en patrones[i].valores/rangos[elemK]
    var next = patrones.slice();
    var p = Object.assign({}, next[i] || {});
    var subKey = campo === 'valor' ? 'valores' : 'rangos';
    p[subKey] = Object.assign({}, p[subKey] || {});
    p[subKey][elemK] = val;
    next[i] = p;
    set('patrones', next);
  }
  // Setter para celdas "extra" de la tabla del patrón que no tienen semántica
  // fija (VALOR/RANGO en fila OT N°, Muestra N°, TIPO, etc.) — se guardan como
  // texto libre en patrones[i].extra.<key>.
  function setPatronExtra(i, key, val) {
    var next = patrones.slice();
    var p = Object.assign({}, next[i] || {});
    p.extra = Object.assign({}, p.extra || {});
    p.extra[key] = val;
    next[i] = p;
    set('patrones', next);
  }
  function addPatron() { set('patrones', patrones.concat([{}])); }
  function delPatron(i) {
    var next = patrones.filter(function (_, idx) { return idx !== i; });
    if (next.length === 0) next.push({});
    set('patrones', next);
  }

  var S = window.FORM_STYLES;

  // ── 1.1 CONDICIONES DE ENSAYO (por-OT) ────────────────────────────────────
  // Norma de ensayo + código de referencia — pueden diferir entre OTs de una
  // misma solicitud. Se selecciona la OT activa con un tab bar y los inputs
  // reflejan/setean condiciones_por_ot[<OT>].
  var COND_KEYS_Q = ['norma_ensayo_ot', 'codigo_referencia_ot'];
  var selectorOtCond = multiOtQ ? _r('div', { style: { padding: '6px 8px', display: 'flex', gap: 4, flexWrap: 'wrap', background: 'var(--surface-3)', borderBottom: '1px solid var(--border)' } },
    _r('span', { style: { fontSize: 10, color: 'var(--text-3)', alignSelf: 'center', marginRight: 4 } }, 'OT activa:'),
    otsDisponibles.map(function (o) {
      var nro = String(o.nro_ot);
      var esActiva = nro === otActivaCond;
      return _r('button', {
        key: nro, type: 'button',
        onClick: function () { setOtActivaCond(nro); },
        style: {
          border: '1px solid ' + (esActiva ? '#0969da' : 'var(--border)'),
          background: esActiva ? '#0969da' : 'var(--surface)',
          color: esActiva ? '#fff' : 'var(--text)',
          padding: '3px 10px', fontSize: 11, borderRadius: 3,
          cursor: 'pointer', fontWeight: esActiva ? 700 : 400,
          fontFamily: 'ui-monospace, Consolas, monospace',
        },
      }, nro + (nro === otNroActualStr ? ' (esta)' : ''));
    })
  ) : null;
  var blockCondOt = _r('div', null,
    _r('div', { style: S.head },
      _r('span', null, '1.1  CONDICIONES DE ENSAYO'),
      multiOtQ ? _r('span', { style: { fontSize: 10, color: '#8a5a00', fontWeight: 600, marginLeft: 6 } }, '· OT ' + otActivaCond) : null
    ),
    selectorOtCond,
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 } },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 160 } }, 'Norma de ensayo:'),
        typeof window.NormaInput === 'function'
          ? _r(window.NormaInput, {
              tipo: 'quimicos', categoria: 'ensayo',
              style: Object.assign({}, S.input, { flex: 1 }),
              value: getCondOt(otActivaCond, 'norma_ensayo_ot') || '',
              placeholder: 'Ej: ASTM E415 · ASTM A751',
              onChange: function (e) { setCondOt(otActivaCond, 'norma_ensayo_ot', e.target.value); },
            })
          : _r('input', { style: Object.assign({}, S.input, { flex: 1 }),
              value: getCondOt(otActivaCond, 'norma_ensayo_ot') || '',
              onChange: function (e) { setCondOt(otActivaCond, 'norma_ensayo_ot', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 160 } }, 'Código de referencia:'),
        typeof window.NormaInput === 'function'
          ? _r(window.NormaInput, {
              tipo: 'quimicos', categoria: 'referencia',
              style: Object.assign({}, S.input, { flex: 1 }),
              value: getCondOt(otActivaCond, 'codigo_referencia_ot') || '',
              placeholder: 'Ej: ASME BPVC · API 5L',
              onChange: function (e) { setCondOt(otActivaCond, 'codigo_referencia_ot', e.target.value); },
            })
          : _r('input', { style: Object.assign({}, S.input, { flex: 1 }),
              value: getCondOt(otActivaCond, 'codigo_referencia_ot') || '',
              onChange: function (e) { setCondOt(otActivaCond, 'codigo_referencia_ot', e.target.value); } }))
    )
  );

  // ── Barra "Copiar TODO a otras OT" ────────────────────────────────────────
  // Copia campos globales del ensayo (normas checkbox, verificaciones, patrón,
  // equipamiento, temperatura). NO copia la sección 1.1 por-OT porque cada OT
  // puede tener su propia norma/código.
  var CAMPOS_TODO_Q = [
    'variante', 'temperatura', 'patron', 'patron_chk',
    // Normas checkbox + años
    'norma_itm054', 'norma_itm057', 'norma_itm058', 'norma_itm091', 'norma_itqb068',
    'norma_e663', 'norma_e415', 'norma_e634', 'norma_e1086', 'norma_e1251',
    'norma_e1999', 'norma_e2209', 'norma_e2994', 'norma_e3047', 'norma_e1019',
    'norma_a751', 'norma_e1024', 'norma_otra_chk', 'norma_otra',
    // Verificaciones
    'estado_electrodo', 'estado_muestra', 'estado_equipo',
    'calibracion_chk', 'calibracion',
    'seleccion_base_chk', 'seleccion_base',
    'zona_evaluacion', 'cantidad_determinaciones',
    // Equipamiento
    'equipamiento', 'equipamiento_tags', 'otros_equipos',
  ];
  // Años de las normas (dinámico).
  QUIMICOS_NORMAS.forEach(function (n) { CAMPOS_TODO_Q.push(n.key + '_year'); });

  var _copyOpenQ = React.useState(false); var copyOpenQ = _copyOpenQ[0], setCopyOpenQ = _copyOpenQ[1];
  var _copyDestQ = React.useState([]); var copyDestQ = _copyDestQ[0], setCopyDestQ = _copyDestQ[1];
  function copiarTodoQAOts(destinos) {
    if (!destinos || destinos.length === 0) return;
    var mapaCond = Object.assign({}, condPorOt);
    destinos.forEach(function (nroOt) {
      var entry = Object.assign({}, mapaCond[nroOt] || {});
      CAMPOS_TODO_Q.forEach(function (k) {
        if (datos[k] !== undefined) {
          entry[k] = (typeof datos[k] === 'object' && datos[k] !== null && !Array.isArray(datos[k]))
            ? Object.assign({}, datos[k])
            : (Array.isArray(datos[k]) ? datos[k].slice() : datos[k]);
        }
      });
      mapaCond[nroOt] = entry;
    });
    set('condiciones_por_ot', mapaCond);
    if (window._labToastOk) {
      window._labToastOk('Copiado a OT ' + destinos.join(', ') + ' — se aplica al guardar');
    }
  }
  var otsHermanasQ = otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStr; });
  var barraCopiarTodoQ = otsHermanasQ.length > 0 ? _r('div', {
    style: {
      padding: '8px 12px', background: '#e7f0ff', border: '1px solid #0969da',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, position: 'relative',
    },
  },
    _r('span', { style: { fontSize: 16 } }, '📋'),
    _r('span', { style: { flex: 1, color: '#0550ae' } },
      'Copiar TODA la configuración (normas + verificaciones + equipamiento) a otras OT en un solo click.'),
    _r('button', {
      type: 'button',
      onClick: function () { setCopyDestQ([]); setCopyOpenQ(!copyOpenQ); },
      style: {
        border: '1px solid #0969da', background: '#fff', color: '#0969da',
        padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3,
        fontWeight: 600, whiteSpace: 'nowrap',
      },
    }, '📋 Copiar todo a otras OT'),
    copyOpenQ ? _r('div', {
      style: {
        position: 'absolute', zIndex: 30, top: '100%', right: 8, marginTop: 4,
        background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10, minWidth: 260, fontSize: 11, color: 'var(--text)',
      },
    },
      _r('div', { style: { fontWeight: 700, marginBottom: 6 } }, 'Copiar todo a otras OT a:'),
      _r('div', { style: { fontSize: 10, color: 'var(--text-3)', marginBottom: 8 } },
        'Copia normas, verificaciones y equipamiento. La sección 1.1 (norma / código de referencia) NO se copia — es específica por OT.'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
        otsHermanasQ.map(function (o) {
          var nro = String(o.nro_ot);
          var checked = copyDestQ.indexOf(nro) >= 0;
          return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function () {
                setCopyDestQ(checked ? copyDestQ.filter(function (n) { return n !== nro; }) : copyDestQ.concat([nro]));
              } }),
            _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
        })),
      _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
        _r('button', { type: 'button', onClick: function () { setCopyOpenQ(false); },
          style: { border: '1px solid var(--border)', background: 'var(--surface)', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', color: 'var(--text)' } }, 'Cancelar'),
        _r('button', { type: 'button',
          onClick: function () {
            var destinos = copyDestQ.slice();
            if (destinos.length === 0) destinos = otsHermanasQ.map(function (o) { return String(o.nro_ot); });
            copiarTodoQAOts(destinos);
            setCopyOpenQ(false); setCopyDestQ([]);
          },
          style: { border: '1px solid #0969da', background: '#0969da', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
    ) : null
  ) : null;

  // ── 1.2 NORMAS ─────────────────────────────────────────────────────────
  var block11 = _r('div', { style: { borderRight: '1px solid var(--border-strong)' } },
    _r('div', { style: S.head }, '1.2  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: Object.assign({}, S.box, { fontSize: 10 }) },
      QUIMICOS_NORMAS.map(function (n) {
        var yearKey = n.key + '_year';
        return _r('div', { key: n.key, style: { display: 'flex', alignItems: 'center', gap: 7 } },
          _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
            _r('input', { type: 'checkbox', checked: !!datos[n.key], onChange: function (e) { updBool(n.key, e.target.checked); } }),
            n.label),
          _r('span', { style: { color: 'var(--text-3)', fontSize: 9 } }, 'Año:'),
          _r('input', {
            style: Object.assign({}, S.input, { width: 56, fontSize: 10 }),
            placeholder: '-23', value: datos[yearKey] || '',
            onChange: function (e) { upd(yearKey, e.target.value); },
          }));
      }),
      // Norma "otra" (línea de puntos en el papel).
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_otra_chk, onChange: function (e) { updBool('norma_otra_chk', e.target.checked); } }),
        _r('span', { style: { fontSize: 10 } }, 'Otra:'),
        _r(window.NormaInput, { tipo: 'quimicos', categoria: 'ensayo',
          style: Object.assign({}, S.input, { flex: 1 }),
          value: datos.norma_otra || '', placeholder: 'Empezá a escribir (ej: ASTM…)',
          onChange: function (e) { upd('norma_otra', e.target.value); } })),
      // Temperatura como parte de 1.1 (así está en la planilla FM-033).
      // El "Patrón utilizado" se movió a la sección 1.3 EQUIPAMIENTO UTILIZADO.
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
        _r('span', { style: { fontWeight: 700, fontSize: 10 } }, 'Temperatura de ensayo:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 60, fontSize: 10 }),
          value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', { style: { fontSize: 10 } }, '°C'))
    )
  );

  // ── 1.2 VERIFICACIONES Y CONDICIONES ──────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.3  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
    _r('div', { style: Object.assign({}, S.box, { fontSize: 10 }) },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.estado_electrodo, onChange: function (e) { updBool('estado_electrodo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 700 } }, 'ESTADO DEL ELECTRODO:'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.estado_muestra, onChange: function (e) { updBool('estado_muestra', e.target.checked); } }),
        _r('span', { style: { fontWeight: 700 } }, 'ESTADO DE LA MUESTRA:'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.estado_equipo, onChange: function (e) { updBool('estado_equipo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 700 } }, 'ESTADO DEL EQUIPO:'), ' OK'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.calibracion_chk, onChange: function (e) { updBool('calibracion_chk', e.target.checked); } }),
          _r('span', { style: { fontWeight: 700 } }, 'CALIBRACION/ESTANDARIZACION:')),
        _r('input', { style: Object.assign({}, S.input, { flex: 1 }), value: datos.calibracion || '',
          onChange: function (e) { upd('calibracion', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.seleccion_base_chk, onChange: function (e) { updBool('seleccion_base_chk', e.target.checked); } }),
          _r('span', { style: { fontWeight: 700 } }, 'SELECCIÓN BASE:')),
        _r('input', { style: Object.assign({}, S.input, { flex: 1 }), value: datos.seleccion_base || '',
          onChange: function (e) { upd('seleccion_base', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 700 } }, 'ZONA DE EVALUACION:'),
        _r(window.ZonaInput, { tipo: 'quimicos', style: Object.assign({}, S.input, { flex: 1 }),
          placeholder: 'Ej: Material base, Núcleo…',
          value: datos.zona_evaluacion || '',
          onChange: function (e) { upd('zona_evaluacion', e.target.value); } }),
        _r('span', { style: { fontSize: 9, color: 'var(--text-3)' } }, '*')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 700 } }, 'CANTIDAD DE DETERMINACIONES:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 70 }), value: datos.cantidad_determinaciones || '',
          onChange: function (e) { upd('cantidad_determinaciones', e.target.value); } }))
    )
  );

  // ── 1.3 EQUIPAMIENTO ──────────────────────────────────────────────────
  var variante = datos.variante || (datos.laboratorio || '').toLowerCase();
  var equipos = variante === 'neuquen' ? QUIMICOS_EQUIPOS_NEUQUEN : QUIMICOS_EQUIPOS_CABA;
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.4  EQUIPAMIENTO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 20px', fontSize: 10.5 } },
      equipos.map(function (e) {
        var checked = !!(datos.equipamiento && datos.equipamiento[e.key]);
        var tagVal  = (datos.equipamiento_tags && datos.equipamiento_tags[e.key]) != null
          ? datos.equipamiento_tags[e.key] : e.tagDefault;
        return _r('div', { key: e.key, style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function (ev) { upd('equipamiento.' + e.key, ev.target.checked); } }),
            _r('span', { style: { fontWeight: 600 } }, e.nombre, ' TAG N°:')),
          _r('input', { style: Object.assign({}, S.input, { width: 90 }), value: tagVal,
            onChange: function (ev) { upd('equipamiento_tags.' + e.key, ev.target.value); } }));
      })
    ),
    typeof window.OtrosEquiposBlock === 'function'
      ? _r('div', { style: { padding: '0 8px 8px' } },
          _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } }))
      : null,
    // Patrón utilizado — movido desde 1.1 a este bloque de equipamiento.
    _r('div', { style: { padding: '0 8px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 } },
      _r('label', { style: Object.assign({}, S.label, { fontSize: 10 }) },
        _r('input', { type: 'checkbox', checked: !!datos.patron_chk,
          onChange: function (e) { updBool('patron_chk', e.target.checked); } }),
        _r('span', { style: { fontWeight: 700 } }, 'Patrón utilizado:')),
      _r('input', { style: Object.assign({}, S.input, { flex: 1, fontSize: 10 }),
        value: datos.patron || '',
        onChange: function (e) { upd('patron', e.target.value); } }))
  );

  // ── 1.4 RESULTADOS OBTENIDOS ──────────────────────────────────────────
  // Tabla integrada: ELEMENTO | MUESTRAS (N cols) | PATRONES (por patrón:
  // N° SERIE, VALOR OBTENIDO, RANGO CERTIFICADO) | ESPEC (MIN, MAX).
  // Filas: OT N° / Muestra N° / 30 elementos / TIPO.
  var nPatrones = patrones.length;
  var colElemW  = 130;

  // `atenuado` marca visualmente que la muestra NO va al informe, pero
  // el input SIGUE siendo editable (todos los datos se guardan en la BD).
  function celdaInput(styleExtra, value, onChange, atenuado) {
    return _r('input', {
      style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%',
        background: atenuado ? 'var(--surface-3)' : 'transparent',
        opacity: atenuado ? 0.7 : 1,
      }, styleExtra || {}),
      value: value == null ? '' : value,
      onChange: onChange,
      title: atenuado ? 'Muestra no informada — el dato se guarda igual' : undefined,
    });
  }

  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.5  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontWeight: 700, flexWrap: 'wrap' } },
      'Muestras a informar:',
      [0, 1, 2].map(function (i) {
        return _r('label', { key: i, style: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontWeight: 400 } },
          _r('input', { type: 'checkbox', checked: mOn[i], onChange: function () { toggleMuestra(i); } }),
          'Muestra ' + (i + 1));
      }),
      _r('span', { style: { flex: 1 } }, '')
    ),
    // Selector de OT por muestra — solo si hay hermanas. Al cambiar la OT de
    // una muestra, al guardar el saver la transfiere al ensayo químicos de
    // esa OT hermana (crea el ensayo hermano si no existe).
    multiOtQ ? _r('div', { style: { padding: '4px 8px 6px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 10.5, flexWrap: 'wrap', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' } },
      _r('span', { style: { fontWeight: 700, color: 'var(--text-2)' } }, 'OT destino por muestra:'),
      [0, 1, 2].map(function (i) {
        var m = muestras[i] || {};
        var over = String(m.nro_ot_override || '').trim();
        var otEff = over || otNroActualStr;
        var esOtra = over && over !== otNroActualStr;
        return _r('label', { key: i, style: { display: 'flex', alignItems: 'center', gap: 4 } },
          _r('span', { style: { fontWeight: 600 } }, 'M' + (i + 1) + ':'),
          _r('select', {
            value: otEff,
            onChange: function (e) {
              var v = String(e.target.value || '').trim();
              if (v === otNroActualStr) v = '';
              setMuestra(i, 'nro_ot_override', v);
            },
            style: {
              border: '1px solid ' + (esOtra ? '#e0c060' : 'var(--border)'),
              background: esOtra ? '#fff8e5' : 'var(--surface)',
              color: esOtra ? '#8a5a00' : 'var(--text)',
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: 10, padding: '2px 6px', borderRadius: 3,
              fontWeight: esOtra ? 700 : 400,
            },
          },
            otsDisponibles.map(function (o) {
              var lbl = o.nro_ot + (String(o.nro_ot) === otNroActualStr ? ' (esta)' : '');
              return _r('option', { key: o.nro_ot, value: o.nro_ot }, lbl);
            })));
      })
    ) : null,
    _r('div', { style: { padding: '0 8px 8px', overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10 } },
        // ── Encabezados ──────────────────────────────────────────────────
        _r('thead', null,
          _r('tr', { style: { background: 'var(--surface-3)' } },
            _r('th', { rowSpan: 2, style: { border: '1px solid var(--border-strong)', padding: 3, textAlign: 'left', width: colElemW } }, ''),
            _r('th', { colSpan: N_MUESTRAS, style: { border: '1px solid var(--border-strong)', padding: 3 } }, 'MUESTRAS*'),
            _r('th', { colSpan: nPatrones * 3, style: { border: '1px solid var(--border-strong)', padding: 3 } }, 'PATRONES*'),
            _r('th', { colSpan: 2, style: { border: '1px solid var(--border-strong)', padding: 3 } }, 'ESPECIFICACION*')
          ),
          _r('tr', { style: { background: 'var(--surface-3)' } },
            [0, 1, 2].map(function (i) {
              return _r('th', { key: 'mh' + i, style: { border: '1px solid var(--border-strong)', padding: 2, minWidth: 70,
                background: mOn[i] ? 'var(--surface-3)' : 'var(--surface-2)' } },
                _r('div', { style: { fontWeight: 800, fontSize: 10 } }, 'M' + (i + 1)));
            }),
            patrones.map(function (_, pi) {
              return [
                _r('th', { key: 'ps' + pi, style: { border: '1px solid var(--border-strong)', padding: 2, width: 55, fontSize: 9 } }, 'N° SERIE'),
                _r('th', { key: 'pv' + pi, style: { border: '1px solid var(--border-strong)', padding: 2, width: 62, fontSize: 9 } }, 'VALOR OBTENIDO'),
                _r('th', { key: 'pr' + pi, style: { border: '1px solid var(--border-strong)', padding: 2, width: 68, fontSize: 9, position: 'relative' } }, 'RANGO DE CERTIFICADO',
                  nPatrones > 1
                    ? _r('button', { onClick: function () { delPatron(pi); }, title: 'Quitar patrón',
                        style: { position: 'absolute', top: 0, right: 0, border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 12, padding: '0 3px', lineHeight: 1 } }, '×')
                    : null),
              ];
            }),
            _r('th', { style: { border: '1px solid var(--border-strong)', padding: 2, width: 55 } }, 'MIN'),
            _r('th', { style: { border: '1px solid var(--border-strong)', padding: 2, width: 55 } }, 'MAX')
          )
        ),
        // ── Cuerpo ──────────────────────────────────────────────────────
        _r('tbody', null,
          // (Filas "OT N°" y "Muestra N°" eliminadas a pedido — no se completan)
          // Filas por elemento — fijas + custom. Cada label es editable.
          // Fijas: viven en QUIMICOS_ELEMENTS. El técnico puede override el label
          // vía datos.elementos_labels[k]. Custom: viven en datos.elementos_extra
          // como {k, label} y se pueden borrar con el botón ×.
          (function () {
            var labelsOverride = datos.elementos_labels || {};
            var extra = Array.isArray(datos.elementos_extra) ? datos.elementos_extra : [];
            var todos = QUIMICOS_ELEMENTS.map(function (el) {
              return { k: el.k, label: labelsOverride[el.k] != null ? labelsOverride[el.k] : el.label, esCustom: false };
            }).concat(extra.map(function (el) {
              return { k: el.k, label: el.label || '', esCustom: true };
            }));
            function updLabelFijo(k, nuevoLabel) {
              var next = Object.assign({}, labelsOverride);
              next[k] = nuevoLabel;
              upd('elementos_labels', next);
            }
            function updLabelCustom(k, nuevoLabel) {
              var next = extra.map(function (e) { return e.k === k ? Object.assign({}, e, { label: nuevoLabel }) : e; });
              upd('elementos_extra', next);
            }
            function delCustom(k) {
              upd('elementos_extra', extra.filter(function (e) { return e.k !== k; }));
            }
            return todos.map(function (el) {
              return _r('tr', { key: el.k },
                _r('td', {
                  style: { border: '1px solid var(--border-strong)', padding: '2px 4px', fontWeight: 600, background: 'var(--surface-2)', position: 'relative' },
                },
                  _r('input', {
                    style: { border: 'none', background: 'transparent', fontWeight: 600, fontSize: 10.5, width: el.esCustom ? 'calc(100% - 16px)' : '100%', padding: 0 },
                    value: el.label,
                    onChange: function (e) {
                      if (el.esCustom) updLabelCustom(el.k, e.target.value);
                      else updLabelFijo(el.k, e.target.value);
                    },
                  }),
                  el.esCustom
                    ? _r('button', {
                        onClick: function () { delCustom(el.k); }, title: 'Quitar fila',
                        style: { position: 'absolute', top: 0, right: 2, border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 12, padding: '0 3px', lineHeight: 1 },
                      }, '×')
                    : null),
              [0, 1, 2].map(function (i) {
                var val = (muestras[i] && muestras[i][el.k]) || '';
                return _r('td', { key: i, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                  celdaInput(null, val,
                    function (e) { setMuestra(i, el.k, e.target.value); }, !mOn[i]));
              }),
              patrones.map(function (p, pi) {
                var valObt   = (p.valores && p.valores[el.k]) || '';
                var rangoObt = (p.rangos  && p.rangos[el.k])  || '';
                var serieEl  = (p.series  && p.series[el.k])  || '';
                return [
                  _r('td', { key: 'ps' + pi, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                    celdaInput(null, serieEl,
                      function (e) {
                        var nx = patrones.slice();
                        var pp = Object.assign({}, nx[pi] || {});
                        pp.series = Object.assign({}, pp.series || {});
                        pp.series[el.k] = e.target.value;
                        nx[pi] = pp;
                        set('patrones', nx);
                      })),
                  _r('td', { key: 'pv' + pi, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                    celdaInput(null, valObt,
                      function (e) { setPatronElem(pi, el.k, 'valor', e.target.value); })),
                  _r('td', { key: 'pr' + pi, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                    celdaInput(null, rangoObt,
                      function (e) { setPatronElem(pi, el.k, 'rango', e.target.value); })),
                ];
              }),
              _r('td', { style: { border: '1px solid var(--border-strong)', padding: 0 } },
                celdaInput(null, (datos.espec && datos.espec[el.k] && datos.espec[el.k].min) || '',
                  function (e) { upd('espec.' + el.k + '.min', e.target.value); })),
              _r('td', { style: { border: '1px solid var(--border-strong)', padding: 0 } },
                celdaInput(null, (datos.espec && datos.espec[el.k] && datos.espec[el.k].max) || '',
                  function (e) { upd('espec.' + el.k + '.max', e.target.value); }))
            );
          });
          })(),
          // Fila "+ Agregar fila" — sólo la columna del label, spans todas.
          _r('tr', { key: '__add__' },
            _r('td', {
              colSpan: 3 + (3 * (patrones.length || 1)) + 2,
              style: { border: '1px solid var(--border-strong)', padding: 4, background: 'var(--surface-2)', textAlign: 'left' },
            },
              _r('button', {
                type: 'button',
                onClick: function () {
                  var extra = Array.isArray(datos.elementos_extra) ? datos.elementos_extra.slice() : [];
                  var nuevaK = 'extra_' + Date.now();
                  extra.push({ k: nuevaK, label: '' });
                  upd('elementos_extra', extra);
                },
                style: { border: '1px solid var(--border)', background: 'var(--surface)', padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3 },
              }, '+ Agregar fila')
            )
          ),
          // Fila TIPO
          _r('tr', null,
            _r('td', { style: { border: '1px solid var(--border-strong)', padding: '2px 6px', fontWeight: 800, background: 'var(--surface-2)' } }, 'TIPO'),
            [0, 1, 2].map(function (i) {
              return _r('td', { key: i, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                celdaInput({ textAlign: 'left' }, (muestras[i] && muestras[i].tipo) || '',
                  function (e) { setMuestra(i, 'tipo', e.target.value); }, !mOn[i]));
            }),
            patrones.map(function (p, pi) {
              var ex = p.extra || {};
              return [
                _r('td', { key: 'ts' + pi, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                  celdaInput(null, ex.tipo_serie,
                    function (e) { setPatronExtra(pi, 'tipo_serie', e.target.value); })),
                _r('td', { key: 'tv' + pi, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                  celdaInput({ textAlign: 'left' }, p.tipo,
                    function (e) { setPatron(pi, 'tipo', e.target.value); })),
                _r('td', { key: 'tr' + pi, style: { border: '1px solid var(--border-strong)', padding: 0 } },
                  celdaInput(null, ex.tipo_rango,
                    function (e) { setPatronExtra(pi, 'tipo_rango', e.target.value); })),
              ];
            }),
            _r('td', { style: { border: '1px solid var(--border-strong)', padding: 0 } },
              celdaInput(null, datos.tipo_espec_min,
                function (e) { upd('tipo_espec_min', e.target.value); })),
            _r('td', { style: { border: '1px solid var(--border-strong)', padding: 0 } },
              celdaInput(null, datos.tipo_espec_max,
                function (e) { upd('tipo_espec_max', e.target.value); }))
          )
        )
      )
    )
  );

  // ── 1.5 OBSERVACIONES / EVALUACIÓN ────────────────────────────────────
  var evalActiva = datos.tiene_evaluacion !== false;
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.6  OBSERVACIONES / EVALUACION'),
    _r('div', { style: { padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 } },
      // Textarea de observaciones libres (línea de puntos de la planilla)
      _r('div', null,
        _r('div', { style: { fontSize: 10, color: 'var(--text-3)', marginBottom: 3 } }, 'Observaciones (línea libre — se informa como texto suelto):'),
        _r('textarea', { style: Object.assign({}, S.textarea, { minHeight: 45 }),
          value: datos.observaciones_libres || '',
          placeholder: '……………………………………………………………………',
          onChange: function (e) { upd('observaciones_libres', e.target.value); } })),
      // Checkbox "material satisface" (idéntico a la planilla).
      _r('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', checked: evalActiva,
          onChange: function (e) {
            var ch = e.target.checked;
            upd('tiene_evaluacion', ch);
            if (!ch) { upd('material_tipo', ''); }
          } }),
        _r('span', null, 'Incluir evaluación de resultados en el informe')),
      evalActiva
        ? _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
            _r('span', { style: { fontWeight: 600 } }, 'La muestra analizada satisface los requerimientos de composición química de un material tipo:'),
            _r('input', { style: Object.assign({}, S.input, { flex: 1, minWidth: 200 }),
              value: datos.material_tipo || '',
              placeholder: '……………………………………',
              onChange: function (e) { upd('material_tipo', e.target.value); } }))
        : null,
      // Nota al pie de la planilla
      _r('div', { style: { fontSize: 9, color: 'var(--text-3)', marginTop: 4, borderTop: '1px dashed var(--border)', paddingTop: 4 } },
        '*PARÁMETROS A INFORMAR    ·    FM-033 Rev 03')
    )
  );

  return _r('div', { style: S.sheet },
    barraCopiarTodoQ,
    blockCondOt,
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, block11, block12),
    block13, block14, block15
  );
}

Object.assign(window, { QuimicosForm: QuimicosForm });
