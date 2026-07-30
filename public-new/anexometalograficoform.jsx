/* ============================================================================
 * AnexoMetalograficoForm — layout espejo del preinforme físico FM-080
 * (Anexo Metalográfico). Versión reducida enfocada en TAMAÑO DE GRANO y
 * TENOR INCLUSIONARIO.
 *
 * Estructura:
 *   1.1 Normas / procedimientos       (2 análisis en columnas: grano + tenor
 *                                     inclusionario, cada uno con ITM/ASTM/Método libre)
 *   1.2 Verificaciones                (checkboxes OK + temp/zona/muestra)
 *   1.2.1 Reactivo utilizado          (4 checkboxes + Otro)
 *   1.3 Equipamiento                  (Leica DM 750 + Termohigrómetro, + Aumentos)
 *   1.4 Resultados obtenidos          (2 textareas: grano + inclusionario)
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var AM_REACTIVOS = [
  { key: 'nital2',      label: 'NITAL AL 2%' },
  { key: 'nitro_fluor', label: 'NITRO FLUOR GLICERINA' },
  { key: 'nital6',      label: 'NITAL AL 6%' },
  { key: 'universal',   label: 'UNIVERSAL' },
];

var AM_EQUIPOS = [
  { key: 'leica_378', nombre: 'MICROSCOPIO LEICA DM 750', tagDefault: 'MM-378' },
  { key: 'termo_700', nombre: 'TERMOHIGRÓMETRO',           tagDefault: 'MM-700' },
];

var AM_AUMENTOS = [
  { key: 'x50',   label: '50X' },
  { key: 'x100',  label: '100X' },
  { key: 'x200',  label: '200X' },
  { key: 'x500',  label: '500X' },
  { key: 'x1000', label: '1000X' },
];

function AnexoMetalograficoForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  var S = window.FORM_STYLES;

  var grano = datos.grano || {};
  var inclu = datos.inclu || {};

  // ── 1.1 NORMAS ──────────────────────────────────────────────────────────
  var block11 = _r('div', null,
    _r('div', { style: S.head }, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 10.5 } },
      // 1.1.1 TAMAÑO DE GRANO
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        _r('div', { style: { fontWeight: 700 } }, '1.1.1  TAMAÑO DE GRANO'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!grano.itm,
            onChange: function (e) { upd('grano.itm', e.target.checked); } }),
          _r('span', { style: { minWidth: 90 } }, 'ITM N° 064'),
          _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
          _r('input', { style: Object.assign({}, S.inline, { width: 70, fontSize: 10 }),
            placeholder: '-24', value: grano.itm_year || '',
            onChange: function (e) { upd('grano.itm_year', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!grano.astm,
            onChange: function (e) { upd('grano.astm', e.target.checked); } }),
          _r('span', { style: { minWidth: 90 } }, 'ASTM E112'),
          _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
          _r('input', { style: Object.assign({}, S.inline, { width: 70, fontSize: 10 }),
            placeholder: '-25', value: grano.astm_year || '',
            onChange: function (e) { upd('grano.astm_year', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!grano.metodo_chk,
            onChange: function (e) { upd('grano.metodo_chk', e.target.checked); } }),
          'Método:',
          _r('input', { style: S.inline, placeholder: '……', value: grano.metodo || '',
            onChange: function (e) { upd('grano.metodo', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('span', { style: { color: '#555', minWidth: 90 } }, 'Otra norma:'),
          _r('input', { style: S.inline, placeholder: 'Opcional — Ej: DIN 50600',
            value: grano.otra || '',
            onChange: function (e) { upd('grano.otra', e.target.value); } }))
      ),
      // 1.1.2 TENOR INCLUSIONARIO
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        _r('div', { style: { fontWeight: 700 } }, '1.1.2  TENOR INCLUSIONARIO'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!inclu.itm,
            onChange: function (e) { upd('inclu.itm', e.target.checked); } }),
          _r('span', { style: { minWidth: 90 } }, 'ITM N° 063'),
          _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
          _r('input', { style: Object.assign({}, S.inline, { width: 70, fontSize: 10 }),
            placeholder: '-24', value: inclu.itm_year || '',
            onChange: function (e) { upd('inclu.itm_year', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!inclu.astm,
            onChange: function (e) { upd('inclu.astm', e.target.checked); } }),
          _r('span', { style: { minWidth: 90 } }, 'ASTM E45'),
          _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
          _r('input', { style: Object.assign({}, S.inline, { width: 70, fontSize: 10 }),
            placeholder: '-25', value: inclu.astm_year || '',
            onChange: function (e) { upd('inclu.astm_year', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!inclu.metodo_chk,
            onChange: function (e) { upd('inclu.metodo_chk', e.target.checked); } }),
          'Método:',
          _r('input', { style: S.inline, placeholder: '……', value: inclu.metodo || '',
            onChange: function (e) { upd('inclu.metodo', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('span', { style: { color: '#555', minWidth: 90 } }, 'Otra norma:'),
          _r('input', { style: S.inline, placeholder: 'Opcional — Ej: ISO 4967',
            value: inclu.otra || '',
            onChange: function (e) { upd('inclu.otra', e.target.value); } }))
      )
    )
  );

  // ── 1.2 VERIFICACIONES + 1.2.1 REACTIVO ─────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.2  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 10.5 } },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_muestra,
          onChange: function (e) { updBool('sup_muestra', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO DE SUPERFICIE:'), ' OK'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA DE ENSAYO:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 56 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_equipo,
          onChange: function (e) { updBool('sup_equipo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO DE EQUIPO:'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_reactivo,
          onChange: function (e) { updBool('sup_reactivo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO DE REACTIVO:'), ' OK'),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ZONA DE ENSAYO:'),
        _r(window.ZonaInput, { tipo: 'anexo-metalografico', style: S.inline, placeholder: 'Ej: Núcleo, Superficie…',
          value: datos.zona_ensayo || '',
          onChange: function (e) { upd('zona_ensayo', e.target.value); } })),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'MUESTRA ENSAYADA:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.muestra_ensayada || '',
          onChange: function (e) { upd('muestra_ensayada', e.target.value); } }))
    ),
    _r('div', { style: S.subhead }, '1.2.1  REACTIVO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 16px', fontSize: 10.5 } },
      AM_REACTIVOS.map(function (r) {
        return _r('label', { key: r.key, style: S.label },
          _r('input', { type: 'checkbox', checked: !!(datos.reactivos && datos.reactivos[r.key]),
            onChange: function (e) { upd('reactivos.' + r.key, e.target.checked); } }),
          r.label);
      }),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1' } },
        _r('span', { style: { fontWeight: 600 } }, 'Otro:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.reactivo_otro || '',
          onChange: function (e) { upd('reactivo_otro', e.target.value); } }))
    )
  );

  // ── 1.3 EQUIPAMIENTO ────────────────────────────────────────────────────
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.3  EQUIPAMIENTO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 } },
      AM_EQUIPOS.map(function (e) {
        var checked = !!(datos.equipamiento && datos.equipamiento[e.key]);
        var tagVal  = (datos.equipamiento_tags && datos.equipamiento_tags[e.key]) != null
          ? datos.equipamiento_tags[e.key] : e.tagDefault;
        return _r('div', { key: e.key, style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function (ev) { upd('equipamiento.' + e.key, ev.target.checked); } }),
            _r('span', { style: { fontWeight: 600 } }, e.nombre)),
          _r('span', { style: { color: '#555' } }, 'TAG N°:'),
          _r('input', { style: Object.assign({}, S.input, { width: 80 }), value: tagVal,
            onChange: function (ev) { upd('equipamiento_tags.' + e.key, ev.target.value); } }));
      }),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 2 } },
        _r('span', { style: { fontWeight: 600 } }, 'AUMENTO UTILIZADO:'),
        AM_AUMENTOS.map(function (a) {
          return _r('label', { key: a.key, style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
            _r('input', { type: 'checkbox', checked: !!(datos.aumentos && datos.aumentos[a.key]),
              onChange: function (e) { upd('aumentos.' + a.key, e.target.checked); } }),
            a.label);
        })
      ),
      typeof window.OtrosEquiposBlock === 'function'
        ? _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } })
        : null
    )
  );

  // ── 1.4 RESULTADOS ──────────────────────────────────────────────────────
  var inc = (datos.inclusiones && typeof datos.inclusiones === 'object') ? datos.inclusiones : {};
  function setInc(k, val) {
    var next = Object.assign({}, inc); next[k] = val;
    upd('inclusiones', next);
  }
  var INC_COLS = [
    { key: 'a', label: 'Sulfuros (A)' },
    { key: 'b', label: 'Aluminatos (B)' },
    { key: 'c', label: 'Silicatos (C)' },
    { key: 'd', label: 'Ox.Globulares (D)' },
  ];

  // Tabs por OT para editar textos de resultado (grano + tenor inclusionario).
  // Las normas y la tabla ASTM E45 quedan globales (compartidas entre OTs).
  var otsHermAnx = (function () {
    if (!props.nroOt || !window.LabStore || !window.LabStore.getOt) return null;
    var otA = window.LabStore.getOt(props.nroOt);
    if (!otA || !otA.nro_solicitud || !window.LabStore.listOtsBySolicitud) return null;
    return window.LabStore.listOtsBySolicitud(otA.nro_solicitud);
  })();
  var multiOtAnx = otsHermAnx && otsHermAnx.length > 1;
  var otNroActualAnx = String(props.nroOt || '');
  var _otActAnx = React.useState(function () { return otNroActualAnx; });
  var otActivaAnx = _otActAnx[0], setOtActivaAnx = _otActAnx[1];
  var textosPorOtAnx = (datos && datos.textos_por_ot) || {};
  var _copyAnx = React.useState(''); var copyOpenAnx = _copyAnx[0], setCopyOpenAnx = _copyAnx[1];
  var _copyDestAnx = React.useState([]); var copyDestAnx = _copyDestAnx[0], setCopyDestAnx = _copyDestAnx[1];
  function copiarTextoAnxAOts(fromNro, toNros, key) {
    if (!toNros || toNros.length === 0) return;
    var mapa = Object.assign({}, textosPorOtAnx);
    var val = getTextoAnx(fromNro, key);
    var pisaActual = false;
    toNros.forEach(function (nroOt) {
      mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
      mapa[nroOt][key] = val;
      if (nroOt === otNroActualAnx) pisaActual = true;
    });
    if (pisaActual) {
      var patch = { textos_por_ot: mapa };
      patch[key] = val;
      set(patch);
    } else {
      set('textos_por_ot', mapa);
    }
  }
  function popoverCopiarAnx(claveKey, keyResult) {
    if (!multiOtAnx) return null;
    var otrasOts = otsHermAnx.map(function (o) { return String(o.nro_ot); }).filter(function (n) { return n !== otActivaAnx; });
    if (otrasOts.length === 0) return null;
    return _r('div', { style: { position: 'relative', display: 'inline-block' } },
      _r('button', {
        type: 'button',
        onClick: function () {
          setCopyDestAnx([]);
          setCopyOpenAnx(copyOpenAnx === claveKey ? '' : claveKey);
        },
        style: {
          border: '1px solid var(--border)', background: 'var(--surface)',
          padding: '2px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
          color: 'var(--text-2)',
        },
      }, 'Copiar → otras OTs'),
      copyOpenAnx === claveKey ? _r('div', {
        style: {
          position: 'absolute', zIndex: 20, top: '100%', right: 0, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border-strong)',
          borderRadius: 6, boxShadow: 'var(--shadow-md)', padding: 10, minWidth: 220, fontSize: 11,
        },
      },
        _r('div', { style: { fontWeight: 700, marginBottom: 6, color: 'var(--text)' } }, 'Copiar a:'),
        _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
          otrasOts.map(function (nro) {
            var checked = copyDestAnx.indexOf(nro) >= 0;
            return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
              _r('input', { type: 'checkbox', checked: checked,
                onChange: function () {
                  setCopyDestAnx(checked ? copyDestAnx.filter(function (n) { return n !== nro; }) : copyDestAnx.concat([nro]));
                } }),
              _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
          })),
        _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          _r('button', { type: 'button', onClick: function () { setCopyOpenAnx(''); },
            style: { border: '1px solid var(--border)', background: 'var(--surface)', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } },
            'Cancelar'),
          _r('button', { type: 'button',
            onClick: function () {
              var destinos = copyDestAnx.slice();
              if (destinos.length === 0) destinos = otrasOts;
              copiarTextoAnxAOts(otActivaAnx, destinos, keyResult);
              setCopyOpenAnx(''); setCopyDestAnx([]);
            },
            style: { border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } },
            'Copiar'))
      ) : null
    );
  }
  function getTextoAnx(nroOt, key) {
    var tot = textosPorOtAnx[nroOt];
    if (tot && tot[key] !== undefined) return tot[key];
    if (nroOt === otNroActualAnx) return datos[key] || '';
    return '';
  }
  function setTextoAnx(nroOt, key, val) {
    if (!multiOtAnx) { upd(key, val); return; }
    var mapa = Object.assign({}, textosPorOtAnx);
    mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
    mapa[nroOt][key] = val;
    if (nroOt === otNroActualAnx) {
      var patch = { textos_por_ot: mapa };
      patch[key] = val;
      set(patch);
    } else {
      set('textos_por_ot', mapa);
    }
  }
  // Copiar TODAS las condiciones globales (temperatura, zona, muestra,
  // reactivos, aumentos, equipamiento, grano, inclu) al mapa condiciones_por_ot
  // para las OTs destino. Se usa cuando las hermanas comparten configuración
  // pero cada una necesita SU copia editable.
  var CONDICIONES_ANX_COPIABLES = [
    'temperatura', 'zona_ensayo', 'muestra_ensayada',
    'reactivos', 'reactivo_otro', 'aumentos',
    'equipamiento', 'equipamiento_tags', 'otros_equipos',
    'grano', 'inclu', 'inclusiones',
  ];
  var _copyCondA = React.useState(false); var copyCondOpenA = _copyCondA[0], setCopyCondOpenA = _copyCondA[1];
  var _copyCondDestA = React.useState([]); var copyCondDestA = _copyCondDestA[0], setCopyCondDestA = _copyCondDestA[1];
  function copiarCondicionesAnxAOts(destinos) {
    if (!destinos || destinos.length === 0) return;
    var mapaCond = Object.assign({}, datos.condiciones_por_ot || {});
    destinos.forEach(function (nroOt) {
      var entry = Object.assign({}, mapaCond[nroOt] || {});
      CONDICIONES_ANX_COPIABLES.forEach(function (k) {
        if (datos[k] !== undefined) {
          entry[k] = (typeof datos[k] === 'object' && datos[k] !== null && !Array.isArray(datos[k]))
            ? Object.assign({}, datos[k])
            : (Array.isArray(datos[k]) ? datos[k].slice() : datos[k]);
        }
      });
      mapaCond[nroOt] = entry;
    });
    set('condiciones_por_ot', mapaCond);
  }
  var botonCopiarCondAnx = multiOtAnx ? _r('div', { style: { position: 'relative', display: 'inline-block' } },
    _r('button', {
      type: 'button',
      onClick: function () { setCopyCondDestA([]); setCopyCondOpenA(!copyCondOpenA); },
      style: {
        border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff',
        padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3, fontWeight: 600,
      },
    }, '📋 Copiar condiciones a otras OTs'),
    copyCondOpenA ? _r('div', {
      style: {
        position: 'absolute', zIndex: 30, top: '100%', left: 0, marginTop: 4,
        background: 'var(--surface)', border: '1px solid var(--border-strong)',
        borderRadius: 6, boxShadow: 'var(--shadow-md)', padding: 10, minWidth: 260, fontSize: 11,
      },
    },
      _r('div', { style: { fontWeight: 700, marginBottom: 6, color: 'var(--text)' } }, 'Copiar TODAS las condiciones a:'),
      _r('div', { style: { fontSize: 10, color: 'var(--text-3)', marginBottom: 8 } },
        'Temperatura, zona, muestra, reactivos, aumentos, equipamiento y tabla de inclusiones se replican.'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
        otsHermAnx.filter(function (o) { return String(o.nro_ot) !== otNroActualAnx; }).map(function (o) {
          var nro = String(o.nro_ot);
          var checked = copyCondDestA.indexOf(nro) >= 0;
          return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function () {
                setCopyCondDestA(checked ? copyCondDestA.filter(function (n) { return n !== nro; }) : copyCondDestA.concat([nro]));
              } }),
            _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
        })),
      _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
        _r('button', { type: 'button', onClick: function () { setCopyCondOpenA(false); },
          style: { border: '1px solid var(--border)', background: 'var(--surface)', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } }, 'Cancelar'),
        _r('button', { type: 'button',
          onClick: function () {
            var destinos = copyCondDestA.slice();
            if (destinos.length === 0) {
              destinos = otsHermAnx.filter(function (o) { return String(o.nro_ot) !== otNroActualAnx; }).map(function (o) { return String(o.nro_ot); });
            }
            copiarCondicionesAnxAOts(destinos);
            setCopyCondOpenA(false); setCopyCondDestA([]);
          },
          style: { border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
    ) : null
  ) : null;

  var tabsOtAnx = multiOtAnx ? _r('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '6px 10px', background: '#fff8e5', borderBottom: '1px solid #e0c060',
      fontSize: 11,
    },
  },
    _r('span', { style: { fontWeight: 700, color: '#8a5a00', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 10 } }, 'Editando resultados de OT:'),
    _r('div', { style: { display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' } },
      otsHermAnx.map(function (o, i) {
        var nro = String(o.nro_ot);
        var activa = nro === otActivaAnx;
        var esActual = nro === otNroActualAnx;
        return _r('button', {
          key: nro, type: 'button',
          onClick: function () { setOtActivaAnx(nro); },
          style: {
            border: 'none',
            borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
            background: activa ? 'var(--accent)' : 'var(--surface)',
            color: activa ? '#fff' : 'var(--text)',
            padding: '4px 10px', fontSize: 11, fontWeight: activa ? 700 : 500,
            cursor: activa ? 'default' : 'pointer',
            fontFamily: 'ui-monospace, Consolas, monospace',
          },
        }, nro, esActual ? ' · actual' : '');
      })),
    _r('span', { style: { fontSize: 10, color: '#8a5a00' } }, 'Cada OT puede tener textos distintos. La tabla ASTM E45 es común.'),
    _r('div', { style: { marginLeft: 'auto' } }, botonCopiarCondAnx)
  ) : null;

  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  RESULTADOS OBTENIDOS'),
    tabsOtAnx,
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 10 } },
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          _r('span', null, 'TAMAÑO DE GRANO'),
          popoverCopiarAnx('grano', 'resultado_grano')
        ),
        _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: getTextoAnx(otActivaAnx, 'resultado_grano'),
          placeholder: 'Ej: La muestra posee en superficie un tamaño de grano N°7 y en núcleo un tamaño de grano N°6,5 según Plate IB de la norma ASTM E112-25.',
          onChange: function (e) { setTextoAnx(otActivaAnx, 'resultado_grano', e.target.value); } })),
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
          _r('span', null, 'TENOR INCLUSIONARIO'),
          popoverCopiarAnx('inclu', 'resultado_inclusionario')
        ),
        _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: getTextoAnx(otActivaAnx, 'resultado_inclusionario'), placeholder: 'Texto libre opcional (los valores numéricos van en la tabla).',
          onChange: function (e) { setTextoAnx(otActivaAnx, 'resultado_inclusionario', e.target.value); } }),
        _r('div', { style: { marginTop: 8, fontSize: 10, color: '#555' } },
          'Tabla — ASTM E45 · Serie Fina / Serie Gruesa × Sulfuros (A) / Aluminatos (B) / Silicatos (C) / Ox.Globulares (D)'),
        _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10.5, marginTop: 4 } },
          _r('thead', null,
            _r('tr', { style: { background: '#e6e6e6' } },
              _r('th', { style: { border: '1px solid #333', padding: 4, minWidth: 110 } }, 'Tamaño'),
              INC_COLS.map(function (c) {
                return _r('th', { key: c.key, style: { border: '1px solid #333', padding: 4 } }, c.label);
              })
            )
          ),
          _r('tbody', null,
            [
              { prefix: 'fino_',   label: 'Serie Fina' },
              { prefix: 'grueso_', label: 'Serie Gruesa' },
            ].map(function (fila) {
              return _r('tr', { key: fila.prefix },
                _r('td', { style: { border: '1px solid #333', padding: 4, fontWeight: 700, background: '#f2f2f2', textAlign: 'center' } }, fila.label),
                INC_COLS.map(function (c) {
                  var k = fila.prefix + c.key;
                  return _r('td', { key: c.key, style: { border: '1px solid #333', padding: 0 } },
                    _r('input', { value: inc[k] == null ? '' : inc[k],
                      onChange: function (e) { setInc(k, e.target.value); },
                      placeholder: '0.5',
                      style: { border: 'none', width: '100%', fontSize: 11, padding: '5px 6px', outline: 'none', background: 'transparent', textAlign: 'center' } }));
                })
              );
            })
          )
        )
      )
    )
  );

  // ── 1.5 IMÁGENES — separadas por tipo de análisis ─────────────────────
  // Dos grillas independientes para que el técnico deje claro qué imagen
  // pertenece a grano y cuál a tenor inclusionario. El generator las inserta
  // en las secciones correspondientes del Word.
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.5  IMÁGENES DEL ENSAYO'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 12 } },
      // Botón de carga automática — busca fotos en el drive y las categoriza
      // entre grano e inclusiones por subcarpeta/filename (regex + IA fallback).
      typeof window.AutoLoadPhotosBtn === 'function'
        ? _r(window.AutoLoadPhotosBtn, {
            ensayoId: props.ensayoId, nroOt: props.nroOt, tipo: props.tipo,
            datos: datos, set: set,
            campos: ['imagenes_grano', 'imagenes_inclusiones'],
            hint: '⚡ Busca fotos en el drive y las asigna a grano/inclusiones automáticamente.',
          })
        : null,
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 4, color: 'var(--text-2)' } },
          'TAMAÑO DE GRANO — imágenes'),
        typeof window.EnsayoPhotos === 'function'
          ? _r(window.EnsayoPhotos, {
              photos: datos.imagenes_grano || [],
              hint: 'Micrografías con la estructura del grano (ASTM E112 / ITM 064). Se insertan bajo el resultado de Tamaño de Grano en el Word.',
              onChange: function (next) { upd('imagenes_grano', next); },
              otsDisponibles: (function () {
                if (!props.nroOt || !window.LabStore || !window.LabStore.getOt) return null;
                var otA = window.LabStore.getOt(props.nroOt);
                if (!otA || !otA.nro_solicitud || !window.LabStore.listOtsBySolicitud) return null;
                return window.LabStore.listOtsBySolicitud(otA.nro_solicitud);
              })(),
              otNroActual: String(props.nroOt || ''),
            })
          : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
      ),
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 4, color: 'var(--text-2)' } },
          'TENOR INCLUSIONARIO — imágenes'),
        typeof window.EnsayoPhotos === 'function'
          ? _r(window.EnsayoPhotos, {
              photos: datos.imagenes_inclusiones || [],
              hint: 'Micrografías con las inclusiones (ASTM E45 / ITM 063). Se insertan bajo la tabla de Tenor Inclusionario en el Word.',
              onChange: function (next) { upd('imagenes_inclusiones', next); },
              otsDisponibles: (function () {
                if (!props.nroOt || !window.LabStore || !window.LabStore.getOt) return null;
                var otA = window.LabStore.getOt(props.nroOt);
                if (!otA || !otA.nro_solicitud || !window.LabStore.listOtsBySolicitud) return null;
                return window.LabStore.listOtsBySolicitud(otA.nro_solicitud);
              })(),
              otNroActual: String(props.nroOt || ''),
            })
          : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
      )
    )
  );

  return _r('div', { style: S.sheet },
    block11, block12, block13, block14, block15
  );
}

Object.assign(window, { AnexoMetalograficoForm: AnexoMetalograficoForm });
