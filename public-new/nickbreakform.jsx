/* ============================================================================
 * NickBreakForm — layout espejo del preinforme físico FM-072 (Nick Break).
 *
 * Estructura:
 *   Condiciones de ensayo               (metodología, método, códigos ref,
 *                                        temperatura, probeta mecanizada según)
 *   Equipos utilizados                   (filtrado por variante emic/torne)
 *   Resultados obtenidos                 (tabla: muestra, probeta, OP1/OP2/OP3
 *                                        checkboxes, resultado A/B/C)
 *   Memoria analítica                    (textarea)
 *   Notas                                (textarea → observaciones_extra)
 *
 * Mapping a keys del schema legado:
 *   metodologia, metodo_ensayo, mecanizado_segun, temperatura,
 *   cod_asme, ed_asme, cod_api1104, cod_aws_d11, cod_api5l,
 *   equipamiento.{key}, equipamiento_tags.{key},
 *   probetas[{id, tipo_resultado, detalle, op1, op2, op3}],
 *   observaciones_extra, memoria_texto (new), cod_asme_pcc2 (new),
 *   cod_api1104_fig (new), cod_aws_b40 (new), cod_otro_chk (new), cod_otro (new)
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var NB_EQ_EMIC = [
  { key: 'maquina_emic',    nombre: 'MÁQUINA DE TRACCIÓN EMIC', tagDefault: 'MM-203' },
  { key: 'termohigrometro', nombre: 'TERMOHIGRÓMETRO',           tagDefault: 'PCAL-545' },
];

var NB_EQ_TORNE = [
  { key: 'prensa_torne_413', nombre: 'PRENSA PLEGADORA TORNE Y MEC', tagDefault: 'MM-413' },
  { key: 'calibre_694',      nombre: 'CALIBRE DIGITAL',              tagDefault: 'MM-694' },
  { key: 'termo_794',        nombre: 'TERMOHIGRÓMETRO',              tagDefault: 'MM-794' },
];

// Mapping de código corto (A/B/C) → texto completo para el schema legado
// (tipo_resultado). Se persisten ambos: `resultado_cod` (A/B/C) y `tipo_resultado`.
var NB_RESULTADOS = {
  A: 'No presenta indicaciones relevantes',
  B: 'Presenta indicaciones no relevantes',
  C: 'Presenta indicaciones que superan en conjunto el 2% de la superficie evaluada',
};

function NickBreakForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  // Bug 7: al marcar un código de referencia, autocompletar "Probeta mecanizada
  // según" con el texto del código (editable). Sólo pisa el campo si está vacío
  // o si fue autocompletado antes (`_mecAuto`); si el usuario lo editó, se respeta.
  function _codigoRefNB(d) {
    if (d.cod_api1104)     return 'API 1104 22a Ed.';
    if (d.cod_asme_pcc2)   return 'ASME PCC-2-2022';
    if (d.cod_api1104_fig) return 'API 1104 Fig. 5 / API 1104 Fig. 11';
    if (d.cod_aws_b40)     return 'AWS B4.0:2016 Fig. 6.6';
    if (d.cod_otro_chk && (d.cod_otro || '').trim()) return d.cod_otro.trim();
    return '';
  }
  function setCod(patch) {
    var nd = Object.assign({}, datos, patch);
    var txt = _codigoRefNB(nd);
    var out = Object.assign({}, patch);
    if (datos._mecAuto || !(datos.mecanizado_segun || '').trim()) {
      out.mecanizado_segun = txt;   // txt vacío al deschequear ⇒ limpia el campo
      out._mecAuto = true;
    }
    set(out);
  }

  var probetas = Array.isArray(datos.probetas) ? datos.probetas.slice() : [];
  if (probetas.length === 0) {
    for (var _i = 0; _i < 4; _i++) probetas.push({});
  }
  // Renumeración automática de la columna PROBETA: 1, 2, 3… por índice.
  // Persistimos en `id` (compat legacy) para que el generator la lea sin
  // cambios. Solo pisa si el valor actual no coincide.
  React.useEffect(function () {
    var next = probetas.map(function (p, i) {
      var esperado = String(i + 1);
      if (!p) p = {};
      if (String(p.id || '') !== esperado) return Object.assign({}, p, { id: esperado });
      return p;
    });
    // Detectar si hubo cambios comparando referencia.
    var hayCambio = next.some(function (p, i) { return p !== probetas[i]; });
    if (hayCambio) set('probetas', next);
  }, [probetas.length]);
  function setProb(i, key, val) {
    var next = probetas.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    if (key === 'resultado_cod') {
      // Actualizar `tipo_resultado` con el texto completo para el generator.
      next[i].tipo_resultado = NB_RESULTADOS[val] || '';
    }
    set('probetas', next);
  }
  function addProb() { set('probetas', probetas.concat([{}])); }
  function delProb(i) { set('probetas', probetas.filter(function (_, idx) { return idx !== i; })); }

  var variante = datos.variante || datos.equipo || '';
  var equipos = variante === 'torne' ? NB_EQ_TORNE : NB_EQ_EMIC;

  var S = window.FORM_STYLES;

  // ── CONDICIONES DE ENSAYO ──────────────────────────────────────────────
  var blockCond = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.head }, 'CONDICIONES DE ENSAYO'),
    _r('div', { style: S.box },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'METODOLOGÍA DE ENSAYO:'),
        _r(window.ItmInput, { tipo: 'nick-break', style: S.inline, placeholder: 'ITM N°079', value: datos.metodologia || '',
          onChange: function (e) { upd('metodologia', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'CÓDIGO DE REFERENCIA:'),
        _r(window.NormaInput, { tipo: 'nick-break', style: S.inline, placeholder: 'API 1104', value: datos.metodo_ensayo || '',
          onChange: function (e) { upd('metodo_ensayo', e.target.value); } })),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 6 } },
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.cod_api1104,
            onChange: function (e) { setCod({ cod_api1104: e.target.checked }); } }),
          'API 1104 22a Ed.'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.cod_asme_pcc2,
            onChange: function (e) { setCod({ cod_asme_pcc2: e.target.checked }); } }),
          'ASME PCC-2-2022'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.cod_api1104_fig,
            onChange: function (e) { setCod({ cod_api1104_fig: e.target.checked }); } }),
          'API 1104 Fig. 5 / API 1104 Fig. 11'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.cod_aws_b40,
            onChange: function (e) { setCod({ cod_aws_b40: e.target.checked }); } }),
          'AWS B4.0:2016 Fig. 6.6'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
          _r('input', { type: 'checkbox', checked: !!datos.cod_otro_chk,
            onChange: function (e) { setCod({ cod_otro_chk: e.target.checked }); } }),
          'Otro:',
          _r(window.NormaInput, { tipo: 'nick-break', categoria: 'referencia',
            style: S.inline, placeholder: 'Empezá a escribir (ej: ASME…, API…, AWS…)',
            value: datos.cod_otro || '',
            onChange: function (e) { setCod({ cod_otro: e.target.value }); } }))
      ),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA DE ENSAYO:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 56 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'PROBETA MECANIZADA SEGÚN:'),
        _r('input', { style: S.inline, placeholder: 'Se autocompleta con el código de referencia (editable)', value: datos.mecanizado_segun || '',
          onChange: function (e) { set({ mecanizado_segun: e.target.value, _mecAuto: false }); } }))
    )
  );

  // ── EQUIPOS UTILIZADOS ──────────────────────────────────────────────────
  var blockEquipos = _r('div', null,
    _r('div', { style: S.head }, 'EQUIPOS UTILIZADOS'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 } },
      equipos.map(function (e) {
        var checked = !!(datos.equipamiento && datos.equipamiento[e.key]);
        var tagVal  = (datos.equipamiento_tags && datos.equipamiento_tags[e.key]) != null
          ? datos.equipamiento_tags[e.key] : e.tagDefault;
        return _r('div', { key: e.key, style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function (ev) { upd('equipamiento.' + e.key, ev.target.checked); } }),
            _r('span', { style: { fontWeight: 600 } }, e.nombre)),
          _r('span', { style: { color: '#555' } }, 'TAG N°:'),
          _r('input', { style: Object.assign({}, S.input, { width: 84 }), value: tagVal,
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

  // ── RESULTADOS ─────────────────────────────────────────────────────────
  var blockResultados = _r('div', null,
    _r('div', { style: S.head }, 'RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 9.5, minWidth: 720 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 90 } }, 'MUESTRA N° / OT N°'),
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 70 } }, 'PROBETA'),
            _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'RESULTADO'),
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 30 } }, '')
          )
        ),
        _r('tbody', null,
          probetas.map(function (p, i) {
            p = p || {};
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, { border: 'none', width: '100%' }),
                  value: p.muestra || '', onChange: function (e) { setProb(i, 'muestra', e.target.value); } })),
              // PROBETA: numeración automática 1, 2, 3… (read-only, se rellena
              // por índice al momento de emitir/mostrar). Guardamos también en
              // p.id para que el generator y la exportación sigan viendo el
              // valor como antes.
              _r('td', { style: { border: '1px solid #333', textAlign: 'center', fontWeight: 700, background: '#fafafa' } }, i + 1),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('select', {
                  style: Object.assign({}, S.input, { border: 'none', width: '100%', fontSize: 9, background: 'transparent' }),
                  value: p.resultado_cod || '',
                  onChange: function (e) { setProb(i, 'resultado_cod', e.target.value); }
                },
                  _r('option', { value: '' }, '— seleccionar —'),
                  _r('option', { value: 'A' }, 'A · ' + NB_RESULTADOS.A),
                  _r('option', { value: 'B' }, 'B · ' + NB_RESULTADOS.B),
                  _r('option', { value: 'C' }, 'C · ' + NB_RESULTADOS.C)
                )),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('button', { onClick: function () { delProb(i); },
                  style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14 } }, '🗑'))
            );
          })
        )
      ),
      _r('div', { style: { marginTop: 6 } },
        _r('button', { onClick: addProb,
          style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar fila')),
      _r('div', { style: { marginTop: 8, fontSize: 9, color: '#333', lineHeight: 1.5, border: '1px solid #ccc', padding: '6px 8px' } },
        _r('div', { style: { fontWeight: 700, marginBottom: 2 } }, 'Referencia de resultados:'),
        _r('div', null, _r('b', null, 'A'), ' — ', NB_RESULTADOS.A, '.'),
        _r('div', null, _r('b', null, 'B'), ' — ', NB_RESULTADOS.B, '.'),
        _r('div', null, _r('b', null, 'C'), ' — ', NB_RESULTADOS.C, '.'))
    )
  );

  // ── MEMORIA + NOTAS ────────────────────────────────────────────────────
  var blockMemoriaNotas = _r('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr' } },
    _r('div', { style: { borderRight: '1px solid #333' } },
      _r('div', { style: S.head }, 'MEMORIA ANALÍTICA'),
      _r('div', { style: { padding: 8 } },
        _r('textarea', { style: { width: '100%', minHeight: 76, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: datos.memoria_texto || '', placeholder: 'Memoria analítica…',
          onChange: function (e) { upd('memoria_texto', e.target.value); } }))),
    _r('div', null,
      _r('div', { style: S.head }, 'NOTAS'),
      _r('div', { style: { padding: 8 } },
        _r('textarea', { style: { width: '100%', minHeight: 76, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: datos.observaciones_extra || '', placeholder: 'Notas…',
          onChange: function (e) { upd('observaciones_extra', e.target.value); } })))
  );

  return _r('div', { style: S.sheet },
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1.3fr 1fr' } }, blockCond, blockEquipos),
    blockResultados, blockMemoriaNotas
  );
}

Object.assign(window, { NickBreakForm: NickBreakForm });
