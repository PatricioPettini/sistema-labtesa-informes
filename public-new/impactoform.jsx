/* ============================================================================
 * ImpactoForm — layout espejo del preinforme físico FM-039 (Excel/HTML).
 *
 * Recibe (datos, setDatos) del contenedor `EnsayoForm` (ensayoform.jsx).
 * Escribe usando los MISMOS keys del schema legado, así el generator de Word
 * (server/generators/template-impacto.js) no cambia.
 *
 * Notas:
 * - No usa JSX propietario; todo con React.createElement para consistencia
 *   con el resto del código del proyecto (Babel standalone en browser).
 * - "medida_probeta" se compone al vuelo desde 3 inputs para respetar el
 *   layout físico (___ x ___ x ___ mm).
 * ========================================================================== */
'use strict';

var _r = React.createElement;

// Catálogo de equipos filtrado por variante. Los keys coinciden con los que
// el generator (server/generators/template-impacto.js) espera en
// datos.equipamiento.{key}.
var IMPACTO_EQ_CABA = [
  // CABA usa el set con Máquina Galdabini
  { key: 'galdabini',         nombre: 'MÁQUINA DE IMPACTO GALDABINI',            tagDefault: 'MM-409' },
  { key: 'freezer_ee761',     nombre: 'ULTRA FREEZER',                           tagDefault: 'EE-761' },
  { key: 'bano_termo_ee537',  nombre: 'BAÑO TERMOSTÁTICO',                       tagDefault: 'EE-537' },
  { key: 'controlador_mm021', nombre: 'CONTROLADOR DE TEMPERATURA DIGITAL',      tagDefault: 'MM-021' },
  { key: 'calibre_mm571',     nombre: 'CALIBRE DIGITAL',                         tagDefault: 'MM-571' },
  { key: 'galgas_773',        nombre: 'GALGAS PATRÓN',                           tagDefault: 'MM-773' },
  { key: 'proyector_165',     nombre: 'PROYECTOR DE PERFILES',                   tagDefault: 'MM-165' },
];
var IMPACTO_EQ_NEUQUEN = [
  // Neuquén tiene el set Wolpert reducido
  { key: 'wolpert',           nombre: 'PÉNDULO DE IMPACTO WOLPERT 300J serie 220001/2031', tagDefault: 'MM-010' },
  { key: 'freezer_pol479',    nombre: 'ULTRA FREEZER',                           tagDefault: 'POL-479' },
  { key: 'controlador_mm315', nombre: 'CONTROLADOR DE TEMPERATURA DIGITAL',      tagDefault: 'MM-315' },
  { key: 'calibre_mm694',     nombre: 'CALIBRE DIGITAL',                         tagDefault: 'MM-694' },
];

// Helper — descompone una medida "10x7.5x55" en [10, 7.5, 55]
function splitMedida(medida) {
  var parts = String(medida || '').split(/[xX×]/).map(function (s) { return s.trim(); });
  return [parts[0] || '', parts[1] || '', parts[2] || ''];
}
function joinMedida(a, b, c) {
  a = String(a == null ? '' : a).trim();
  b = String(b == null ? '' : b).trim();
  c = String(c == null ? '' : c).trim();
  if (!a && !b && !c) return '';
  // Conservar los slots (aunque falte alguno) para que se pueda tipear de a uno.
  return [a, b, c].join('x');
}

function ImpactoForm(props) {
  var datos = props.datos || {};
  var set = props.set;

  function upd(key, val) { set(key, val); }
  function updBool(key, checked) { set(key, !!checked); }

  var medidas = splitMedida(datos.medida_probeta);

  // ── Contexto multi-OT (idéntica lógica que tracción/plegado) ─────────────
  // otNroActual = la OT del ensayo actual (donde estamos parados).
  // otsDisponibles = todas las OTs hermanas de la misma solicitud (incluida la actual).
  //                  Habilita el selector de OT por fila en la tabla de resultados.
  var otNroActual = props.otNro || '';
  var otActualObj = otNroActual && window.LabStore && window.LabStore.getOt
    ? window.LabStore.getOt(otNroActual) : null;
  var solActual = otActualObj && otActualObj.nro_solicitud;
  var otsDisponibles = (solActual && window.LabStore.listOtsBySolicitud)
    ? window.LabStore.listOtsBySolicitud(solActual)
    : (otActualObj ? [otActualObj] : []);

  // ── Contexto multi-OT NIVEL 2: tabs + condiciones/textos por OT ─────────
  // otsEnEnsayo = OTs que tienen al menos una fila O están en la solicitud.
  var otsEnEnsayo = (function () {
    var lista = (props.datos && Array.isArray(props.datos.resultados)) ? props.datos.resultados : [];
    var setOts = {};
    lista.forEach(function (r) {
      var over = String((r && r.nro_ot_override) || '').trim();
      var dest = over || String(otNroActual || '');
      if (dest) setOts[dest] = true;
    });
    (otsDisponibles || []).forEach(function (o) {
      var n = String(o.nro_ot || ''); if (n) setOts[n] = true;
    });
    var out = Object.keys(setOts);
    if (out.length === 0 && otNroActual) out.push(String(otNroActual));
    out.sort(function (a, b) {
      if (a === otNroActual) return -1;
      if (b === otNroActual) return 1;
      return String(a).localeCompare(String(b));
    });
    return out;
  })();
  var textosPorOt = (datos && datos.textos_por_ot) || {};
  var condPorOt = (datos && datos.condiciones_por_ot) || {};
  var _otTx = React.useState(function () { return otNroActual || (otsEnEnsayo[0] || ''); });
  var otActiva = _otTx[0], setOtActiva = _otTx[1];
  if (otsEnEnsayo.length > 0 && otsEnEnsayo.indexOf(otActiva) < 0) {
    otActiva = otNroActual || otsEnEnsayo[0];
  }
  var _copyOpen = React.useState(''); var copyOpen = _copyOpen[0], setCopyOpen = _copyOpen[1];
  var _copyDest = React.useState([]); var copyDest = _copyDest[0], setCopyDest = _copyDest[1];

  // Getters/setters de textos por OT (evaluación libre por OT).
  function getTextoOt(nroOt, key) {
    var m = textosPorOt[nroOt];
    if (m && m[key] !== undefined) return m[key];
    if (nroOt === otNroActual) return datos[key];
    return '';
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
  function copiarTextoAOts(fromNro, toNros, key) {
    if (!toNros || toNros.length === 0) return;
    var mapa = Object.assign({}, textosPorOt);
    var val = getTextoOt(fromNro, key);
    var pisaActual = false;
    toNros.forEach(function (nroOt) {
      mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
      mapa[nroOt][key] = val;
      if (nroOt === otNroActual) pisaActual = true;
    });
    if (pisaActual) {
      var patch = { textos_por_ot: mapa };
      patch[key] = val;
      set(patch);
    } else {
      set('textos_por_ot', mapa);
    }
  }
  // Getters/setters de condiciones por OT (norma, código de referencia).
  function getCondOt(nroOt, key) {
    var m = condPorOt[nroOt];
    return (m && m[key] != null) ? m[key] : '';
  }
  function setCondOt(nroOt, key, val) {
    var mapa = Object.assign({}, condPorOt);
    mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
    if (val === '' || val == null) delete mapa[nroOt][key];
    else mapa[nroOt][key] = val;
    if (Object.keys(mapa[nroOt]).length === 0) delete mapa[nroOt];
    set('condiciones_por_ot', mapa);
  }
  function copiarCondAOts(fromNro, toNros, keys) {
    if (!toNros || toNros.length === 0) return;
    var mapa = Object.assign({}, condPorOt);
    keys.forEach(function (key) {
      var val = getCondOt(fromNro, key);
      toNros.forEach(function (nroOt) {
        mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
        if (val === '' || val == null) delete mapa[nroOt][key];
        else mapa[nroOt][key] = val;
        if (Object.keys(mapa[nroOt]).length === 0) delete mapa[nroOt];
      });
    });
    set('condiciones_por_ot', mapa);
  }

  // ── Estilos comunes ────────────────────────────────────────────────────
  var S = Object.assign({}, window.FORM_STYLES, {
    // padBox local: la variante de impacto necesita flex-column con gap para
    // que los ítems apilados dentro de los bloques 1.1/1.2/1.3 respiren.
    padBox: window.FORM_STYLES.box,
    twoCol: { display: 'grid', gridTemplateColumns: '1fr 1.15fr' },
  });

  // ── 1.1 METODOLOGÍA DE ENSAYO ──────────────────────────────────────────
  // Antes había 1.1 NORMAS y 1.2 CÓDIGO DE REFERENCIA con checkboxes globales.
  // Se removieron porque esos datos ahora se cargan por probeta en la sección
  // "CONDICIONES POR PROBETA" — solo queda el campo Metodología (ITM).
  var norm11 = _r('div', null,
    _r('div', { style: S.headTitle }, '1.2  METODOLOGÍA DE ENSAYO'),
    _r('div', { style: S.padBox },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'ITM:'),
        _r(window.ItmInput, { tipo: 'impacto', style: Object.assign({}, S.inputCell, { flex: 1 }), value: datos.metodologia || '', placeholder: 'ITM N°078',
          onChange: function (e) { upd('metodologia', e.target.value); } }))
    )
  );

  // ── 1.2 VERIFICACIONES Y CONDICIONES ───────────────────────────────────
  var verif = _r('div', null,
    _r('div', { style: S.headTitle }, '1.3  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
    _r('div', { style: S.padBox },
      // Temperatura
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA DE ENSAYO:'),
        _r('input', { style: Object.assign({}, S.inputCell, { width: 80 }), value: datos.temperatura || '',
          placeholder: '-20 o Ambiente',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      // Medida de probeta
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
        _r('span', { style: { fontWeight: 600 } }, 'MEDIDA DE PROBETA:'),
        _r('input', { style: Object.assign({}, S.inputCell, S.num, { width: 48 }), value: medidas[0],
          onChange: function (e) { upd('medida_probeta', joinMedida(e.target.value, medidas[1], medidas[2])); } }),
        _r('span', null, 'x'),
        _r('input', { style: Object.assign({}, S.inputCell, S.num, { width: 48 }), value: medidas[1],
          onChange: function (e) { upd('medida_probeta', joinMedida(medidas[0], e.target.value, medidas[2])); } }),
        _r('span', null, 'x'),
        _r('input', { style: Object.assign({}, S.inputCell, S.num, { width: 48 }), value: medidas[2],
          onChange: function (e) { upd('medida_probeta', joinMedida(medidas[0], medidas[1], e.target.value)); } }),
        _r('span', null, 'mm')),
      // Entalla
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        _r('span', { style: { fontWeight: 600 } }, 'ENTALLA:'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'entalla', checked: datos.entalla === 'V',
            onChange: function () { upd('entalla', 'V'); } }), 'CHARPY V'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'entalla', checked: datos.entalla === 'U',
            onChange: function () { upd('entalla', 'U'); } }), 'CHARPY U')),
      // Paralelismo
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.paralelismo, onChange: function (e) { updBool('paralelismo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'PARALELISMO'), ' OK'),
      // Orientación
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        _r('span', { style: { fontWeight: 600 } }, 'ORIENTACIÓN DE PROBETA:'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'orient', checked: datos.orientacion === 'Longitudinal',
            onChange: function () { upd('orientacion', 'Longitudinal'); } }), 'LONG.'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'orient', checked: datos.orientacion === 'Transversal',
            onChange: function () { upd('orientacion', 'Transversal'); } }), 'TRANSV.')),
      // Probetas
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.prob_cliente, onChange: function (e) { updBool('prob_cliente', e.target.checked); } }),
        'PROBETAS MECANIZADAS POR EL CLIENTE'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.prob_cupon_soldado, onChange: function (e) { updBool('prob_cupon_soldado', e.target.checked); } }),
        'PROBETAS EXTRAÍDAS DE CUPÓN SOLDADO'),
      // Verificación diaria (interno)
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.verificacion_diaria, onChange: function (e) { updBool('verificacion_diaria', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'VERIFICACIÓN DIARIA'), ' OK ',
        _r('em', { style: { color: '#888', fontSize: 10 } }, '(no va al informe)')),
      // Radio impactador (interno)
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'RADIO DE IMPACTADOR:'),
        _r('input', { style: Object.assign({}, S.inputCell, { width: 80 }), value: datos.radio_impactador || '', placeholder: '8mm',
          onChange: function (e) { upd('radio_impactador', e.target.value); } }),
        _r('em', { style: { color: '#888', fontSize: 10 } }, '(no va al informe)'))
    )
  );

  // ── 1.4 EQUIPAMIENTO UTILIZADO ─────────────────────────────────────────
  // Separado en su propio bloque para poder intercalar 1.3 CONDICIONES POR
  // PROBETA entre VERIFICACIONES y EQUIPAMIENTO.
  var equipBlock = _r('div', null,
    _r('div', { style: S.headTitle }, '1.4  EQUIPAMIENTO UTILIZADO' + (datos.variante === 'caba' ? ' — Set Galdabini (CABA)' : ' — Set Wolpert (Neuquén)')),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 } },
      (datos.variante === 'caba' ? IMPACTO_EQ_CABA : IMPACTO_EQ_NEUQUEN).map(function (e) {
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
    typeof window.OtrosEquiposBlock === 'function'
      ? _r('div', { style: { padding: '0 8px 8px' } },
          _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } }))
      : null
  );

  // ── 1.5 RESULTADOS ─────────────────────────────────────────────────────
  var resultados = datos.resultados || [];
  function setRow(i, key, val) {
    var next = resultados.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    // Si cambia la zona o la OT, recalcular el N° de probeta de ESTA fila
    // según su nuevo grupo (misma zona × misma OT en las filas anteriores).
    // Reinicia en 1 cuando la fila cambia a un grupo nuevo. Sólo aplica si
    // el técnico NO editó manualmente el N° antes (marca `_probetaManual`).
    if ((key === 'zona' || key === 'nro_ot_override') && !next[i]._probetaManual) {
      var zonaFila = String(next[i].zona || '').trim();
      var otFila   = String(next[i].nro_ot_override || '').trim();
      var count = 0;
      for (var j = 0; j < i; j++) {
        var r = next[j] || {};
        var z = String(r.zona || '').trim();
        var o = String(r.nro_ot_override || '').trim();
        if (z === zonaFila && o === otFila) count++;
      }
      next[i].probeta = String(count + 1);
    }
    // Si el técnico edita `probeta` a mano, marcarla como manual — así deja
    // de re-numerarse automáticamente al cambiar zona/OT.
    if (key === 'probeta') next[i]._probetaManual = true;
    set('resultados', next);
  }
  // Calcula el N° de probeta a asignar a una fila NUEVA que hereda zona/OT
  // de la última fila (el técnico las cambiará después si corresponde). El
  // contador reinicia en 1 cuando cambia zona o `nro_ot_override` respecto
  // al grupo anterior.
  function siguienteNroProbeta(arr, zonaNueva, otOverrideNueva) {
    var zonaN = String(zonaNueva || '').trim();
    var otN = String(otOverrideNueva || '').trim();
    var count = 0;
    (arr || []).forEach(function (r) {
      var z = String((r && r.zona) || '').trim();
      var o = String((r && r.nro_ot_override) || '').trim();
      if (z === zonaN && o === otN) count++;
    });
    return String(count + 1);
  }
  function addRow() {
    // Hereda zona/OT de la última fila y reinicia numeración por grupo.
    var ultima = resultados[resultados.length - 1] || {};
    var zonaHer = ultima.zona || '';
    var otHer   = ultima.nro_ot_override || '';
    var siguiente = siguienteNroProbeta(resultados, zonaHer, otHer);
    var nueva = { probeta: siguiente };
    if (zonaHer) nueva.zona = zonaHer;
    if (otHer)   nueva.nro_ot_override = otHer;
    set('resultados', resultados.concat([nueva]));
  }
  function delRow(i) { set('resultados', resultados.filter(function (_, idx) { return idx !== i; })); }

  var resSection = _r('div', null,
    _r('div', { style: S.headTitle }, '1.5  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: '6px 8px', fontSize: 10, fontWeight: 700 } },
      'RANGO DE ENERGÍA BAJO ALCANCE DE ACREDITACIÓN: 3,75 a 138 J'),
    _r('div', { style: { padding: '4px 8px 8px', overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 11, minWidth: 900 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 40 } }, 'N°'),
            otsDisponibles.length > 1
              ? _r('th', { style: { border: '1px solid #333', padding: 3, width: 90 }, title: 'OT destino de la fila' }, 'OT')
              : null,
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'ZONA'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 100 } }, 'N° PROBETA'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'VERIF. DIM. (int.)'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'ENERGÍA [J]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'RESILIENCIA [J/cm²]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'EXPANSIÓN [mm]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'FRACT. DÚCTIL [%]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'TEMP. [°C]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'FRACT. (int.)'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 30 } }, '')
          )
        ),
        _r('tbody', null,
          resultados.map(function (r, i) {
            r = r || {};
            var tdIn = { border: '1px solid #333', padding: 0 };
            var inp = Object.assign({}, S.inputCell, { border: 'none', width: '100%' });
            var otOverride = String(r.nro_ot_override || '').trim();
            var otEffective = otOverride || otNroActual;
            var esOtra = otOverride && otOverride !== otNroActual;
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', textAlign: 'center', fontWeight: 700, background: '#fafafa' } }, i + 1),
              // Selector de OT — solo si hay hermanas. Al cambiar, esta fila
              // se transfiere al ensayo de impacto de la OT destino al guardar
              // (vía saveEnsayoImpactoMultiOt).
              otsDisponibles.length > 1
                ? _r('td', { style: { border: '1px solid #333', textAlign: 'center', padding: 0, background: esOtra ? '#fff8e5' : '#fff' } },
                    _r('select', {
                      value: otEffective,
                      onChange: function (e) {
                        var v = String(e.target.value || '').trim();
                        if (v === otNroActual) v = '';
                        setRow(i, 'nro_ot_override', v);
                      },
                      title: 'OT destino de esta fila (misma solicitud)',
                      style: {
                        border: 'none', outline: 'none', width: '100%',
                        padding: '3px 4px', fontSize: 10, background: 'transparent',
                        color: esOtra ? '#8a5a00' : '#24292f',
                        fontWeight: esOtra ? 700 : 400,
                      },
                    },
                      otsDisponibles.map(function (o) {
                        var label = o.nro_ot + (o.nro_ot === otNroActual ? ' (esta)' : '');
                        return _r('option', { key: o.nro_ot, value: o.nro_ot }, label);
                      })))
                : null,
              _r('td', { style: tdIn }, _r('input', { style: inp, value: r.zona || '', onChange: function (e) { setRow(i, 'zona', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: inp, value: r.probeta || '', placeholder: '', onChange: function (e) { setRow(i, 'probeta', e.target.value); } })),
              _r('td', { style: tdIn }, _r('select', { style: inp, value: r.verif_dimensional || '',
                onChange: function (e) { setRow(i, 'verif_dimensional', e.target.value); } },
                _r('option', { value: '' }, '—'),
                _r('option', { value: 'OK' }, 'OK'),
                _r('option', { value: 'NO OK' }, 'NO OK'))),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.energia || '', onChange: function (e) { setRow(i, 'energia', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.resiliencia || '', onChange: function (e) { setRow(i, 'resiliencia', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.expansion_lateral || '', onChange: function (e) { setRow(i, 'expansion_lateral', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.fractura_ductil || '', onChange: function (e) { setRow(i, 'fractura_ductil', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.temperatura || '', onChange: function (e) { setRow(i, 'temperatura', e.target.value); } })),
              _r('td', { style: tdIn }, _r('select', { style: inp, value: r.fracturado || '',
                onChange: function (e) { setRow(i, 'fracturado', e.target.value); } },
                _r('option', { value: '' }, '—'),
                _r('option', { value: 'SI' }, 'SI'),
                _r('option', { value: 'NO' }, 'NO'))),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('button', { onClick: function () { delRow(i); }, title: 'Borrar',
                  style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '2px 4px' } }, '🗑'))
            );
          })
        )
      ),
      _r('div', { style: { marginTop: 6 } },
        _r('button', { onClick: addRow,
          style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar fila'))
    )
  );

  // ── 1.6 OBSERVACIONES ──────────────────────────────────────────────────
  // Nota OAA "Los ensayos marcados con (*)..." se detecta automáticamente y
  // no aparece acá — se agrega en el generator según el estado OAA del ensayo.
  var obs = _r('div', null,
    _r('div', { style: S.headTitle }, '1.6  OBSERVACIONES / EVALUACIÓN'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, lineHeight: 1.4 } },
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota1, onChange: function (e) { updBool('nota1', e.target.checked); } }),
        _r('span', null, datos.variante === 'neuquen'
          ? 'Todas las probetas cumplen con las dimensiones y tolerancias correspondientes verificado mediante utilización de calibre digital.'
          : 'Todas las probetas cumplen con las dimensiones y tolerancias correspondientes verificado mediante utilización de las galgas patrón y calibre digital.')),
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
        _r('span', null, 'Los resultados marcados con (***) provienen de proveedor externo.')),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 } },
        _r('span', { style: { fontWeight: 600 } }, 'Otra observación / texto de evaluación:'),
        _r('textarea', { style: Object.assign({}, S.inputCell, { width: '100%', minHeight: 70, resize: 'vertical' }),
          value: datos.evaluacion_texto || '', placeholder: 'Escribí acá si querés agregar una observación libre',
          onChange: function (e) { upd('evaluacion_texto', e.target.value); } }))
    )
  );

  // ── 1.3 CONDICIONES POR PROBETA (mismo patrón que tracción) ─────────────
  // Tabla con una columna por probeta (M1..MN) y filas de campos que pueden
  // diferir por probeta: Norma de ensayo y Código de referencia. Al editar M1
  // el valor se propaga a las probetas que estaban vacías o tenían el mismo
  // valor previo de M1; las que fueron editadas manualmente quedan "fijas".
  // El control "+/−" abajo mueve el tamaño del array `resultados[]`, así que
  // esta tabla Y la de "1.5 RESULTADOS OBTENIDOS" comparten la cantidad.
  var COND_PROB_FIELDS = [
    { k: 'norma',              label: 'Norma de ensayo',      placeholder: 'Ej: ISO 148-1:2016' },
    { k: 'codigo_referencia',  label: 'Código de referencia', placeholder: 'Ej: ASME BPVC Sección IX Ed.2025' },
  ];
  // probetas_meta[] = definición de las N probetas conceptuales que muestra
  // 1.1 (M1, M2, ...). Cada una tiene su nombre, norma, código de referencia
  // y nro_ot_override. El "+/-" ajusta la CANTIDAD DE PROBETAS acá, sin sumar
  // las filas extras de la tabla 1.5 (una muestra suele tener 3 probetas
  // ensayadas — el set típico son 3 filas por probeta).
  //
  // Migración: si datos.probetas_meta no existe pero sí datos.resultados, se
  // deriva de las filas de resultados (dedup por nombre, y las primeras que
  // tengan norma/codigo se toman como probetas conceptuales).
  var FILAS_POR_PROBETA_DEFAULT = 3;
  var probetasMeta = Array.isArray(datos.probetas_meta) ? datos.probetas_meta.slice() : null;
  if (!probetasMeta) {
    var srcResultados = Array.isArray(datos.resultados) ? datos.resultados : [];
    if (srcResultados.length > 0) {
      // Dedup por nombre — el mismo nombre puede repetirse en varias filas.
      var seen = {};
      probetasMeta = [];
      srcResultados.forEach(function (r) {
        var nombre = String((r && r.nombre) || '').trim() || null;
        var key = nombre || ('idx' + probetasMeta.length);
        if (seen[key]) return;
        seen[key] = true;
        probetasMeta.push({
          nombre: nombre,
          norma: (r && r.norma) || '',
          codigo_referencia: (r && r.codigo_referencia) || '',
          nro_ot_override: (r && r.nro_ot_override) || '',
        });
      });
      // Si la migración quedó vacía (nada dedupeaba), tomar los primeros N como
      // probetas conceptuales (una fila = una probeta).
      if (probetasMeta.length === 0) {
        probetasMeta = srcResultados.slice(0, srcResultados.length).map(function (r) {
          return {
            nombre: (r && r.nombre) || null,
            norma: (r && r.norma) || '',
            codigo_referencia: (r && r.codigo_referencia) || '',
            nro_ot_override: (r && r.nro_ot_override) || '',
          };
        });
      }
    } else {
      probetasMeta = [{}];
    }
  }
  if (probetasMeta.length === 0) probetasMeta = [{}];

  function setProbetaMeta(i, key, val) {
    var next = probetasMeta.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('probetas_meta', next);
  }

  // Ajustar cantidad de probetas: modifica probetas_meta[] Y agrega/quita el
  // set típico de filas en resultados[] (FILAS_POR_PROBETA_DEFAULT filas por
  // probeta nueva; al quitar, elimina las filas que tengan el nombre de la
  // probeta quitada).
  function ajustarCantidadProbetas(nueva) {
    var n = Math.max(1, Math.min(20, nueva | 0));
    var meta = probetasMeta.slice();
    var resultadosCurr = Array.isArray(datos.resultados) ? datos.resultados.slice() : [];
    if (meta.length === n) return;
    if (meta.length > n) {
      // Quitar las probetas del final + las filas de resultados asociadas
      // (matcheando por el `nombre` de la probeta si tiene, sino todas las
      // filas con nombre coincidente al índice implícito M<idx+1>).
      var removidas = meta.slice(n);
      meta = meta.slice(0, n);
      var nombresRemovidos = removidas.map(function (m, k) {
        return (m && m.nombre) || ('M' + (n + k + 1));
      });
      resultadosCurr = resultadosCurr.filter(function (r) {
        var nom = String((r && r.nombre) || '').trim();
        // Solo quitar filas cuyo nombre coincida con las probetas removidas.
        // Filas sin nombre o con nombre distinto (extra manuales) se mantienen.
        return nombresRemovidos.indexOf(nom) < 0;
      });
    } else {
      // Agregar probetas nuevas al final + FILAS_POR_PROBETA_DEFAULT filas por
      // cada una en resultados[].
      while (meta.length < n) {
        var idx = meta.length; // 0-based del nuevo
        var nombreNuevo = 'M' + (idx + 1);
        meta.push({ nombre: nombreNuevo });
        for (var k = 0; k < FILAS_POR_PROBETA_DEFAULT; k++) {
          resultadosCurr.push({ nombre: nombreNuevo, probeta: String(k + 1) });
        }
      }
    }
    set({ probetas_meta: meta, resultados: resultadosCurr });
  }
  var blockCondProbeta = _r('div', null,
    _r('div', { style: S.headTitle }, '1.1  CONDICIONES POR PROBETA'),
    // Control +/- para la cantidad de probetas CONCEPTUALES (M1..MN). Al
    // aumentar, se agregan FILAS_POR_PROBETA_DEFAULT filas en 1.5 asociadas
    // a la nueva probeta (set típico de 3 por muestra). Al reducir, se quitan
    // esas filas también. El "+ Agregar fila" de 1.5 no toca este contador.
    _r('div', { style: { padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, borderBottom: '1px solid #ddd' } },
      _r('span', { style: { fontWeight: 700 } }, 'Cantidad de probetas:'),
      _r('button', {
        type: 'button',
        disabled: probetasMeta.length <= 1,
        onClick: function () { ajustarCantidadProbetas(probetasMeta.length - 1); },
        style: { width: 30, height: 30, border: '1px solid #999', background: probetasMeta.length <= 1 ? '#eee' : '#f4f4f4', cursor: probetasMeta.length <= 1 ? 'not-allowed' : 'pointer', borderRadius: 4, fontSize: 16, fontWeight: 700 },
      }, '−'),
      _r('input', {
        type: 'number', min: 1, max: 20, value: probetasMeta.length,
        onChange: function (e) {
          var v = parseInt(e.target.value, 10);
          if (!isNaN(v)) ajustarCantidadProbetas(v);
        },
        style: { width: 60, height: 30, textAlign: 'center', border: '1px solid #999', borderRadius: 4, fontSize: 14, fontWeight: 700 },
      }),
      _r('button', {
        type: 'button',
        disabled: probetasMeta.length >= 20,
        onClick: function () { ajustarCantidadProbetas(probetasMeta.length + 1); },
        style: { width: 30, height: 30, border: '1px solid #999', background: probetasMeta.length >= 20 ? '#eee' : '#f4f4f4', cursor: probetasMeta.length >= 20 ? 'not-allowed' : 'pointer', borderRadius: 4, fontSize: 16, fontWeight: 700 },
      }, '+'),
      _r('span', { style: { color: '#555', fontSize: 11, marginLeft: 8 } },
        'Cada probeta agrega ' + FILAS_POR_PROBETA_DEFAULT + ' filas en resultados (editable después).')
    ),
    probetasMeta.length > 0 ? _r('div', { style: { padding: 8, overflowX: 'auto' } },
      _r('div', { style: { fontSize: 10, color: '#555', marginBottom: 6 } },
        'Editar la columna M1 propaga automáticamente el valor a las demás probetas que tenían el mismo valor o estaban vacías. Si cambiás M2 (u otra) manualmente, esa queda "fija" y ya no se sobrescribe desde M1.'),
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 11, minWidth: 640 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #999', padding: 4, width: 170, textAlign: 'left' } }, 'Campo'),
            probetasMeta.map(function (m, iFis) {
              var nombreValor = (m && m.nombre != null && m.nombre !== '') ? m.nombre : ('M' + (iFis + 1));
              return _r('th', { key: iFis, style: { border: '1px solid #999', padding: 3, minWidth: 120 } },
                _r('div', { style: { fontWeight: 800, marginBottom: 2 } }, 'Probeta ' + (iFis + 1)),
                _r('input', {
                  style: { border: '1px solid #bbb', background: 'transparent', fontSize: 10, padding: '3px 5px', outline: 'none', width: '100%', textAlign: 'center', fontWeight: 700 },
                  value: nombreValor,
                  onChange: function (e) {
                    // Renombrar la probeta: actualiza el meta + sincroniza las
                    // filas de resultados que tenían el nombre anterior.
                    var viejoNombre = (m && m.nombre) || ('M' + (iFis + 1));
                    var nuevoNombre = e.target.value;
                    var metaNext = probetasMeta.slice();
                    metaNext[iFis] = Object.assign({}, metaNext[iFis] || {}, { nombre: nuevoNombre });
                    var resArr = Array.isArray(datos.resultados) ? datos.resultados.slice() : [];
                    resArr = resArr.map(function (r) {
                      if (r && String(r.nombre || '').trim() === String(viejoNombre).trim()) {
                        return Object.assign({}, r, { nombre: nuevoNombre });
                      }
                      return r;
                    });
                    set({ probetas_meta: metaNext, resultados: resArr });
                  },
                }));
            })
          )
        ),
        _r('tbody', null,
          // Fila OT — solo si hay hermanas. Permite reasignar cada probeta a
          // una OT distinta sin necesidad de bajar a la tabla de resultados.
          otsDisponibles.length > 1 ? _r('tr', { key: '_ot' },
            _r('td', { style: { border: '1px solid #999', padding: '4px 8px', fontWeight: 700, background: '#fafafa' } }, 'OT destino'),
            probetasMeta.map(function (m, iFis) {
              var over = String((m && m.nro_ot_override) || '').trim();
              var otEff = over || otNroActual;
              var esOtra = over && over !== otNroActual;
              return _r('td', { key: iFis, style: { border: '1px solid #999', padding: 0, background: esOtra ? '#fff8e5' : '#fff' } },
                _r('select', {
                  value: otEff,
                  onChange: function (e) {
                    var v = String(e.target.value || '').trim();
                    if (v === otNroActual) v = '';
                    // Setear en probeta meta + propagar a las filas de resultados
                    // que tienen su nombre (para que el saver splitee bien).
                    var nombreMeta = (m && m.nombre) || ('M' + (iFis + 1));
                    var metaNext = probetasMeta.slice();
                    metaNext[iFis] = Object.assign({}, metaNext[iFis] || {}, { nro_ot_override: v });
                    var resArr = Array.isArray(datos.resultados) ? datos.resultados.slice() : [];
                    resArr = resArr.map(function (r) {
                      if (r && String(r.nombre || '').trim() === String(nombreMeta).trim()) {
                        return Object.assign({}, r, { nro_ot_override: v });
                      }
                      return r;
                    });
                    set({ probetas_meta: metaNext, resultados: resArr });
                  },
                  title: 'OT destino de esta probeta (misma solicitud)',
                  style: {
                    border: 'none', outline: 'none', width: '100%',
                    padding: '5px 6px', fontSize: 11, background: 'transparent',
                    color: esOtra ? '#8a5a00' : '#24292f',
                    fontWeight: esOtra ? 700 : 400,
                  },
                },
                  otsDisponibles.map(function (o) {
                    var label = o.nro_ot + (o.nro_ot === otNroActual ? ' (esta)' : '');
                    return _r('option', { key: o.nro_ot, value: o.nro_ot }, label);
                  })));
            })
          ) : null,
          COND_PROB_FIELDS.map(function (f) {
          return _r('tr', { key: f.k },
            _r('td', { style: { border: '1px solid #999', padding: '4px 8px', fontWeight: 700, background: '#fafafa' } }, f.label),
            probetasMeta.map(function (m, iFis) {
              var val = (m && m[f.k]) || '';
              var cellStyle = { border: '1px solid #999', padding: 0 };
              var inputStyle = { border: 'none', width: '100%', padding: '5px 6px', background: 'transparent', fontSize: 11 };

              // Handler: al cambiar M1 (iFis===0), propagar a las probetas que
              // estaban vacías o tenían exactamente el valor previo de M1.
              // Sincroniza también los valores a las filas de resultados que
              // matcheen por nombre — el saver y el generator usan resultados[i]
              // para norma/código, así que hay que espejar cada cambio.
              function aplicarCambio(nuevoVal) {
                var arr = probetasMeta.slice();
                var viejoValM1 = String((probetasMeta[0] || {})[f.k] || '');
                arr[iFis] = Object.assign({}, arr[iFis] || {}, {});
                arr[iFis][f.k] = nuevoVal;
                if (iFis === 0) {
                  for (var j = 1; j < arr.length; j++) {
                    var ro = arr[j] || {};
                    var valOtro = String(ro[f.k] || '');
                    if (valOtro === '' || valOtro === viejoValM1) {
                      arr[j] = Object.assign({}, ro, {});
                      arr[j][f.k] = nuevoVal;
                    }
                  }
                }
                var resArr = Array.isArray(datos.resultados) ? datos.resultados.slice() : [];
                resArr = resArr.map(function (r) {
                  var rNombre = String((r && r.nombre) || '').trim();
                  for (var k = 0; k < arr.length; k++) {
                    var mNombre = String((arr[k] && arr[k].nombre) || ('M' + (k + 1))).trim();
                    if (rNombre === mNombre) {
                      var patch = {};
                      patch[f.k] = arr[k][f.k];
                      return Object.assign({}, r, patch);
                    }
                  }
                  return r;
                });
                set({ probetas_meta: arr, resultados: resArr });
              }

              // Combos editables con datalist (sugerencias del catálogo local).
              if (f.k === 'norma' && typeof window.NormaInput === 'function') {
                return _r('td', { key: iFis, style: cellStyle },
                  _r(window.NormaInput, {
                    tipo: 'impacto', categoria: 'ensayo',
                    style: inputStyle, placeholder: f.placeholder,
                    value: val,
                    onChange: function (e) { aplicarCambio(e.target.value); },
                  }));
              }
              if (f.k === 'codigo_referencia' && typeof window.NormaInput === 'function') {
                return _r('td', { key: iFis, style: cellStyle },
                  _r(window.NormaInput, {
                    tipo: 'impacto', categoria: 'referencia',
                    style: inputStyle, placeholder: f.placeholder,
                    value: val,
                    onChange: function (e) { aplicarCambio(e.target.value); },
                  }));
              }
              return _r('td', { key: iFis, style: cellStyle },
                _r('input', {
                  style: inputStyle, placeholder: f.placeholder || '',
                  value: val,
                  onChange: function (e) { aplicarCambio(e.target.value); },
                }));
            })
          );
        }))
      )
    ) : null
  );

  // ── Barra "Copiar TODO a otras OT" (aparece si hay hermanas) ──────────
  // Copia SOLO campos globales del ensayo (metodología, verif/condiciones,
  // notas, equipamiento). NO incluye la sección 1.1 (norma / código de
  // referencia) porque esos valores son propios de cada OT y viven en
  // resultados[i][k] (sección personalizada por probeta).
  var _copyTodoOpen = React.useState(false);
  var copyTodoOpen = _copyTodoOpen[0], setCopyTodoOpen = _copyTodoOpen[1];
  var _copyTodoDest = React.useState([]);
  var copyTodoDest = _copyTodoDest[0], setCopyTodoDest = _copyTodoDest[1];
  var CAMPOS_TODO_IMP = [
    'variante',
    // 1.2 metodología
    'metodologia',
    // 1.3 verificaciones y condiciones
    'temperatura', 'medida_probeta', 'entalla', 'tipo_probeta',
    // 1.4 equipamiento
    'equipamiento', 'equipamiento_tags', 'otros_equipos',
    // Notas fijas (opcionales)
    'nota1', 'nota_evaluaciones', 'nota_no_conforme',
    'nota_incertidumbre', 'nota_externo',
  ];
  function copiarTodoImpAOts(destinos) {
    if (!destinos || destinos.length === 0) return;
    var mapaCond = Object.assign({}, condPorOt);
    destinos.forEach(function (nroOt) {
      var entry = Object.assign({}, mapaCond[nroOt] || {});
      CAMPOS_TODO_IMP.forEach(function (k) {
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
  var otsHermanasImp = otsDisponibles.filter(function (o) { return String(o.nro_ot) !== String(otNroActual); });
  var barraCopiarTodoImp = otsHermanasImp.length > 0 ? _r('div', {
    style: {
      padding: '8px 12px', background: '#e7f0ff', border: '1px solid #0969da',
      borderBottom: 'none', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, position: 'relative',
    },
  },
    _r('span', { style: { fontSize: 16 } }, '📋'),
    _r('span', { style: { flex: 1, color: '#0550ae' } },
      'Copiar TODA la configuración (metodología + condiciones + equipamiento) a otras OT en un solo click.'),
    _r('button', {
      type: 'button',
      onClick: function () { setCopyTodoDest([]); setCopyTodoOpen(!copyTodoOpen); },
      style: {
        border: '1px solid #0969da', background: '#fff', color: '#0969da',
        padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3,
        fontWeight: 600, whiteSpace: 'nowrap',
      },
    }, '📋 Copiar todo a otras OT'),
    copyTodoOpen ? _r('div', {
      style: {
        position: 'absolute', zIndex: 30, top: '100%', right: 8, marginTop: 4,
        background: '#fff', border: '1px solid #d0d7de', borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10, minWidth: 260, fontSize: 11,
      },
    },
      _r('div', { style: { fontWeight: 700, marginBottom: 6 } }, 'Copiar todo a otras OT a:'),
      _r('div', { style: { fontSize: 10, color: '#57606a', marginBottom: 8 } },
        'Copia metodología (1.2), verificaciones (1.3) y equipamiento (1.4). La sección 1.1 (norma / código) NO se copia — es específica por OT.'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
        otsHermanasImp.map(function (o) {
          var nro = String(o.nro_ot);
          var checked = copyTodoDest.indexOf(nro) >= 0;
          return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function () {
                setCopyTodoDest(checked ? copyTodoDest.filter(function (n) { return n !== nro; }) : copyTodoDest.concat([nro]));
              } }),
            _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
        })),
      _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
        _r('button', { type: 'button', onClick: function () { setCopyTodoOpen(false); },
          style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } }, 'Cancelar'),
        _r('button', { type: 'button',
          onClick: function () {
            var destinos = copyTodoDest.slice();
            if (destinos.length === 0) destinos = otsHermanasImp.map(function (o) { return String(o.nro_ot); });
            copiarTodoImpAOts(destinos);
            setCopyTodoOpen(false); setCopyTodoDest([]);
          },
          style: { border: '1px solid #0969da', background: '#0969da', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
    ) : null
  ) : null;

  // Orden final del form:
  //   1.1 Condiciones por probeta (por-OT, con selector de OT por probeta)
  //   1.2 Metodología (solo ITM)  |  1.3 Verificaciones (en dos columnas)
  //   1.4 Equipamiento utilizado
  //   1.5 Resultados obtenidos
  //   1.6 Observaciones / Evaluación
  return _r('div', { style: S.sheet },
    barraCopiarTodoImp,
    blockCondProbeta,
    _r('div', { style: S.twoCol }, norm11, verif),
    equipBlock,
    resSection,
    obs
  );
}

Object.assign(window, { ImpactoForm: ImpactoForm });
