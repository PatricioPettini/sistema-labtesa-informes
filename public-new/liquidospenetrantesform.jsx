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
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 } },
        _r('span', { style: { fontWeight: 600 } }, 'LIMPIEZA PREVIA:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.limpieza_previa || '',
          onChange: function (e) { upd('limpieza_previa', e.target.value); } }))
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
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } }, blockInstrumentos, blockEnsayoSegun),
    blockCondiciones, blockResultados
  );
}

Object.assign(window, { LiquidosPenetrantesForm: LiquidosPenetrantesForm });
