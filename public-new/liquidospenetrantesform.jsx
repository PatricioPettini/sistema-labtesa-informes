/* ============================================================================
 * LiquidosPenetrantesForm — layout espejo del preinforme físico FM-043
 * (Ensayo de Líquidos Penetrantes).
 *
 * Estructura:
 *   INSTRUMENTOS                       (6 checkboxes: lámpara, microwattímetro,
 *                                       refractómetro, manómetro, patrón,
 *                                       luxómetro — con TAG por item)
 *   ENSAYO SEGÚN                       (ASTM E165, ASME BPVC Sección V, Otro)
 *   CONDICIONES DE ENSAYO              (13 campos: temperatura, luz blanca,
 *                                       luz UV, presiones, penetrante,
 *                                       revelador, emulsificador, tiempos,
 *                                       temperaturas)
 *   RESULTADOS OBTENIDOS               (textarea libre)
 *
 * Keys del schema:
 *   instrumentos.{key} (bool), instrumentos_tags.{key} (str),
 *   norma_astm_e165, norma_asme_v, norma_otra_chk, norma_otra,
 *   limpieza_previa, temperatura_ensayo, intensidad_luz_blanca,
 *   potencia_luz_uv, presion_aire, presion_agua, penetrante, revelador,
 *   tipo_emulsificador, tiempo_penetracion_tinta, tiempo_revelado,
 *   tiempo_emulsificacion, temperatura_agua, temperatura_secado,
 *   resultado_texto
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var LP_INSTRUMENTOS = [
  { key: 'lampara',       nombre: 'LÁMPARA' },
  { key: 'microwatt',     nombre: 'MICROWATTÍMETRO' },
  { key: 'refractometro', nombre: 'REFRACTÓMETRO' },
  { key: 'manometro',     nombre: 'MANÓMETRO' },
  { key: 'patron',        nombre: 'PATRÓN' },
  { key: 'luxometro',     nombre: 'LUXÓMETRO' },
];

var LP_CONDICIONES = [
  { key: 'limpieza_previa',          label: 'LIMPIEZA PREVIA:' },
  { key: 'temperatura_ensayo',       label: 'TEMPERATURA DE ENSAYO:' },
  { key: 'intensidad_luz_blanca',    label: 'INTENSIDAD DE LUZ BLANCA:' },
  { key: 'potencia_luz_uv',          label: 'POTENCIA DE LUZ UV:' },
  { key: 'presion_aire',             label: 'PRESIÓN DE AIRE:' },
  { key: 'presion_agua',             label: 'PRESIÓN DE AGUA:' },
  { key: 'penetrante',               label: 'PENETRANTE:' },
  { key: 'revelador',                label: 'REVELADOR:' },
  { key: 'tipo_emulsificador',       label: 'TIPO DE EMULSIFICADOR:' },
  { key: 'tiempo_penetracion_tinta', label: 'TIEMPO DE PENETRACIÓN DE TINTA:' },
  { key: 'tiempo_revelado',          label: 'TIEMPO DE REVELADO:' },
  { key: 'tiempo_emulsificacion',    label: 'TIEMPO DE EMULSIFICACIÓN:' },
  { key: 'temperatura_agua',         label: 'TEMPERATURA DEL AGUA:' },
  { key: 'temperatura_secado',       label: 'TEMPERATURA DE SECADO:' },
];

function LiquidosPenetrantesForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  var S = window.FORM_STYLES;

  // ── Multi-OT: mismo patrón que brinell ─────────────────────────────────────
  // Líquidos penetrantes no divide filas por OT (todos los campos son
  // globales al ensayo). El único caso de uso multi-OT es propagar la MISMA
  // configuración (instrumentos + normas + condiciones + resultado) a otras
  // OTs hermanas de la misma solicitud → crear/actualizar ensayos hermanos.
  var otNroActual = props.otNro || '';
  var otActualObj = otNroActual && window.LabStore && window.LabStore.getOt
    ? window.LabStore.getOt(otNroActual) : null;
  var solActual = otActualObj && otActualObj.nro_solicitud;
  var otsDisponibles = (solActual && window.LabStore.listOtsBySolicitud)
    ? window.LabStore.listOtsBySolicitud(solActual)
    : (otActualObj ? [otActualObj] : []);
  var otNroActualStrLp = String(otNroActual || '');
  var otsHermanasLp = otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrLp; });

  var CAMPOS_TODO_LP = [
    // Instrumentos + tags
    'instrumentos', 'instrumentos_tags', 'otros_equipos',
    // Ensayo según (normas)
    'norma_astm_e165', 'norma_astm_e165_year',
    'norma_asme_v', 'norma_asme_v_year',
    'norma_otra_chk', 'norma_otra',
    'limpieza_previa',
    // Condiciones de ensayo (13 campos)
    'temperatura_ensayo', 'intensidad_luz_blanca', 'potencia_luz_uv',
    'presion_aire', 'presion_agua', 'penetrante', 'revelador',
    'tipo_emulsificador', 'tiempo_penetracion_tinta', 'tiempo_revelado',
    'tiempo_emulsificacion', 'temperatura_agua', 'temperatura_secado',
    // Resultados obtenidos (texto libre)
    'resultado_texto',
  ];

  var _copyOpenLp = React.useState(false); var copyOpenLp = _copyOpenLp[0], setCopyOpenLp = _copyOpenLp[1];
  var _copyDestLp = React.useState([]); var copyDestLp = _copyDestLp[0], setCopyDestLp = _copyDestLp[1];
  function copiarTodoLpAOts(destinos) {
    if (!destinos || destinos.length === 0) return;
    var mapaCond = Object.assign({}, datos.condiciones_por_ot || {});
    destinos.forEach(function (nroOt) {
      var entry = Object.assign({}, mapaCond[nroOt] || {});
      CAMPOS_TODO_LP.forEach(function (k) {
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
  var barraCopiarTodoLp = otsHermanasLp.length > 0 ? _r('div', {
    style: {
      padding: '8px 12px', background: '#e7f0ff', border: '1px solid #0969da',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, position: 'relative',
    },
  },
    _r('span', { style: { fontSize: 16 } }, '📋'),
    _r('span', { style: { flex: 1, color: '#0550ae' } },
      'Copiar TODA la configuración (instrumentos + normas + condiciones) a otras OT en un solo click.'),
    _r('button', {
      type: 'button',
      onClick: function () { setCopyDestLp([]); setCopyOpenLp(!copyOpenLp); },
      style: {
        border: '1px solid #0969da', background: '#fff', color: '#0969da',
        padding: '3px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3,
        fontWeight: 600, whiteSpace: 'nowrap',
      },
    }, '📋 Copiar todo a otras OT'),
    copyOpenLp ? _r('div', {
      style: {
        position: 'absolute', zIndex: 30, top: '100%', right: 8, marginTop: 4,
        background: '#fff', border: '1px solid var(--border)', borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10, minWidth: 260, fontSize: 11, color: 'var(--text)',
      },
    },
      _r('div', { style: { fontWeight: 700, marginBottom: 6 } }, 'Copiar todo a otras OT a:'),
      _r('div', { style: { fontSize: 10, color: 'var(--text-3)', marginBottom: 8 } },
        'Se aplica al guardar: se replica el ensayo completo en las OTs seleccionadas.'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
        otsHermanasLp.map(function (o) {
          var nro = String(o.nro_ot);
          var checked = copyDestLp.indexOf(nro) >= 0;
          return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function () {
                setCopyDestLp(checked ? copyDestLp.filter(function (n) { return n !== nro; }) : copyDestLp.concat([nro]));
              } }),
            _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
        })),
      _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
        _r('button', { type: 'button', onClick: function () { setCopyOpenLp(false); },
          style: { border: '1px solid var(--border)', background: 'var(--surface)', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', color: 'var(--text)' } }, 'Cancelar'),
        _r('button', { type: 'button',
          onClick: function () {
            var destinos = copyDestLp.slice();
            if (destinos.length === 0) destinos = otsHermanasLp.map(function (o) { return String(o.nro_ot); });
            copiarTodoLpAOts(destinos);
            setCopyOpenLp(false); setCopyDestLp([]);
          },
          style: { border: '1px solid #0969da', background: '#0969da', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
    ) : null
  ) : null;

  // ── INSTRUMENTOS ──────────────────────────────────────────────────────
  var blockInstrumentos = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.head }, 'INSTRUMENTOS'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 10.5 } },
      LP_INSTRUMENTOS.map(function (e) {
        var checked = !!(datos.instrumentos && datos.instrumentos[e.key]);
        var tagVal  = (datos.instrumentos_tags && datos.instrumentos_tags[e.key]) || '';
        return _r('div', { key: e.key, style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function (ev) { upd('instrumentos.' + e.key, ev.target.checked); } }),
            _r('span', { style: { fontWeight: 600 } }, e.nombre)),
          _r('span', { style: { color: '#555' } }, 'TAG N°:'),
          _r('input', { style: Object.assign({}, S.input, { width: 84 }), value: tagVal,
            onChange: function (ev) {
              var val = ev.target.value;
              upd('instrumentos_tags.' + e.key, val);
              // Auto-tilda el checkbox si escribieron un TAG.
              if (val && val.trim() && !checked) {
                upd('instrumentos.' + e.key, true);
              }
            } }));
      })
    ),
    typeof window.OtrosEquiposBlock === 'function'
      ? _r('div', { style: { padding: '0 8px 8px' } },
          _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } }))
      : null
  );

  // ── ENSAYO SEGÚN ──────────────────────────────────────────────────────
  var blockEnsayoSegun = _r('div', null,
    _r('div', { style: S.head }, 'ENSAYO SEGÚN'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 } },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_astm_e165,
          onChange: function (e) { updBool('norma_astm_e165', e.target.checked); } }),
        'ASTM E165-',
        _r('input', { style: Object.assign({}, S.input, { width: 42, textAlign: 'center' }),
          placeholder: 'AA', value: datos.norma_astm_e165_year || '',
          onChange: function (e) { upd('norma_astm_e165_year', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_asme_v,
          onChange: function (e) { updBool('norma_asme_v', e.target.checked); } }),
        'ASME BPVC Sección V (Ed. ',
        _r('input', { style: Object.assign({}, S.input, { width: 56, textAlign: 'center' }),
          placeholder: 'AAAA', value: datos.norma_asme_v_year || '',
          onChange: function (e) { upd('norma_asme_v_year', e.target.value); } }),
        ')'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_otra_chk,
          onChange: function (e) { updBool('norma_otra_chk', e.target.checked); } }),
        'Otro:',
        _r(window.NormaInput, { tipo: 'liquidos-penetrantes', categoria: 'ensayo', style: S.inline, placeholder: 'Empezá a escribir (ej: ASTM…)',
          value: datos.norma_otra || '',
          onChange: function (e) {
            var val = e.target.value;
            upd('norma_otra', val);
            if (val && val.trim() && !datos.norma_otra_chk) upd('norma_otra_chk', true);
          } })),
      // "Limpieza previa" se movió a la sección CONDICIONES DE ENSAYO (primer
      // item del grid), donde queda al lado de las temperaturas / tiempos.
    )
  );

  // ── CONDICIONES DE ENSAYO ─────────────────────────────────────────────
  var blockCondiciones = _r('div', null,
    _r('div', { style: S.head }, 'CONDICIONES DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 10.5 } },
      LP_CONDICIONES.map(function (c) {
        return _r('div', { key: c.key, style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', { style: { fontWeight: 600 } }, c.label),
          _r('input', { style: S.inline, placeholder: '……', value: datos[c.key] || '',
            onChange: function (e) { upd(c.key, e.target.value); } }));
      })
    )
  );

  // ── RESULTADOS ────────────────────────────────────────────────────────
  var blockResultados = _r('div', null,
    _r('div', { style: S.head }, 'RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 120, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.resultado_texto || '', placeholder: 'Resultados obtenidos: indicaciones, evaluación, aceptación/rechazo…',
        onChange: function (e) { upd('resultado_texto', e.target.value); } }))
  );

  return _r('div', { style: S.sheet },
    barraCopiarTodoLp,
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, blockInstrumentos, blockEnsayoSegun),
    blockCondiciones, blockResultados
  );
}

Object.assign(window, { LiquidosPenetrantesForm: LiquidosPenetrantesForm });
