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
  { key: 'prensa_torne_413', nombre: 'PRENSA PLEGADORA TORNE Y MEC', tagDefault: 'MM-913' },
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

  // ── Multi-OT: mismo patrón que plegado / tracción / brinell ────────────────
  // otsDisponibles = todas las OTs hermanas de la misma solicitud. Permite:
  //  - Copiar condiciones + equipamiento a otras OTs
  //  - Asignar cada probeta a una OT distinta (columna "OT" en la tabla)
  // Los overrides raíz + el split de probetas por nro_ot_override se aplican
  // vía saveEnsayoNickBreakMultiOt (en store-api.js).
  var otNroActual = props.otNro || '';
  var otActualObj = otNroActual && window.LabStore && window.LabStore.getOt
    ? window.LabStore.getOt(otNroActual) : null;
  var solActual = otActualObj && otActualObj.nro_solicitud;
  var otsDisponibles = (solActual && window.LabStore.listOtsBySolicitud)
    ? window.LabStore.listOtsBySolicitud(solActual)
    : (otActualObj ? [otActualObj] : []);
  var multiOtNb = otsDisponibles.length > 1;
  var otNroActualStrNb = String(otNroActual || '');
  var _copyKeyNb = React.useState(''); var copyOpenKeyNb = _copyKeyNb[0], setCopyOpenKeyNb = _copyKeyNb[1];
  var _copyDestNb = React.useState([]); var copyDestGenNb = _copyDestNb[0], setCopyDestGenNb = _copyDestNb[1];
  function copiarCamposNbAOts(destinos, campos) {
    if (!destinos || destinos.length === 0) return;
    var mapaCond = Object.assign({}, datos.condiciones_por_ot || {});
    destinos.forEach(function (nroOt) {
      var entry = Object.assign({}, mapaCond[nroOt] || {});
      campos.forEach(function (k) {
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
  function botonCopiarSeccionNb(claveUnica, etiqueta, camposList, descripcion) {
    if (!multiOtNb) return null;
    var abierto = copyOpenKeyNb === claveUnica;
    return _r('div', { style: { position: 'relative', display: 'inline-block' } },
      _r('button', {
        type: 'button',
        onClick: function () { setCopyDestGenNb([]); setCopyOpenKeyNb(abierto ? '' : claveUnica); },
        style: {
          border: '1px solid #0969da', background: '#fff', color: '#0969da',
          padding: '3px 8px', fontSize: 10, cursor: 'pointer', borderRadius: 3,
          fontWeight: 600, whiteSpace: 'nowrap',
        },
      }, '📋 ' + etiqueta),
      abierto ? _r('div', {
        style: {
          position: 'absolute', zIndex: 30, top: '100%', right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #d0d7de', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10, minWidth: 240, fontSize: 11,
        },
      },
        _r('div', { style: { fontWeight: 700, marginBottom: 6, color: '#24292f' } }, etiqueta + ' a:'),
        descripcion ? _r('div', { style: { fontSize: 10, color: '#57606a', marginBottom: 8 } }, descripcion) : null,
        _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
          otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrNb; }).map(function (o) {
            var nro = String(o.nro_ot);
            var checked = copyDestGenNb.indexOf(nro) >= 0;
            return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
              _r('input', { type: 'checkbox', checked: checked,
                onChange: function () {
                  setCopyDestGenNb(checked ? copyDestGenNb.filter(function (n) { return n !== nro; }) : copyDestGenNb.concat([nro]));
                } }),
              _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
          })),
        _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          _r('button', { type: 'button', onClick: function () { setCopyOpenKeyNb(''); },
            style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } }, 'Cancelar'),
          _r('button', { type: 'button',
            onClick: function () {
              var destinos = copyDestGenNb.slice();
              if (destinos.length === 0) {
                destinos = otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrNb; }).map(function (o) { return String(o.nro_ot); });
              }
              copiarCamposNbAOts(destinos, camposList);
              setCopyOpenKeyNb(''); setCopyDestGenNb([]);
            },
            style: { border: '1px solid #0969da', background: '#0969da', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
      ) : null
    );
  }

  var CAMPOS_CONDICIONES_NB = [
    'metodologia', 'metodo_ensayo', 'mecanizado_segun', 'temperatura', '_mecAuto',
    'cod_asme', 'ed_asme', 'cod_api1104', 'cod_aws_d11', 'cod_api5l',
    'cod_asme_pcc2', 'cod_api1104_fig', 'cod_aws_b40', 'cod_otro_chk', 'cod_otro',
  ];
  var CAMPOS_EQUIPAMIENTO_NB = ['variante', 'equipo', 'equipamiento', 'equipamiento_tags', 'otros_equipos'];
  var CAMPOS_TODO_NB = CAMPOS_CONDICIONES_NB.concat(CAMPOS_EQUIPAMIENTO_NB);
  var barraCopiarTodoNb = multiOtNb ? _r('div', {
    style: {
      padding: '8px 12px', background: '#e7f0ff', border: '1px solid #0969da',
      borderTop: 'none', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11,
    },
  },
    _r('span', { style: { fontSize: 16 } }, '📋'),
    _r('span', { style: { flex: 1, color: '#0550ae' } },
      'Copiar TODA la configuración (condiciones + equipamiento) a otras OT en un solo click.'),
    botonCopiarSeccionNb('copiar_todo', 'Copiar todo a otras OT',
      CAMPOS_TODO_NB,
      'Copia condiciones (metodología, código, temperatura, probeta mec.) y equipamiento juntos.')
  ) : null;

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
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, 'CONDICIONES DE ENSAYO'),
      botonCopiarSeccionNb('cond_nb', 'Copiar condiciones a otras OT',
        CAMPOS_CONDICIONES_NB,
        'Copia metodología, código de referencia, temperatura y probeta mecanizada según.')
    ),
    _r('div', { style: S.box },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'METODOLOGÍA DE ENSAYO:'),
        _r(window.ItmInput, { tipo: 'nick-break', style: S.inline, placeholder: 'ITM N°079', value: datos.metodologia || '',
          onChange: function (e) { upd('metodologia', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'CÓDIGO DE REFERENCIA:'),
        _r(window.NormaInput, { tipo: 'nick-break', style: S.inline, placeholder: 'API 1104',
          value: datos.metodo_ensayo || '',
          onChange: function (e) {
            var val = e.target.value;
            // Autocompletar "PROBETA MECANIZADA SEGÚN" con el mismo texto si
            // el campo está vacío o marcado como auto. Si el técnico lo editó
            // a mano (_mecAuto=false), respetar su valor.
            var patch = { metodo_ensayo: val };
            if (datos._mecAuto || !(datos.mecanizado_segun || '').trim()) {
              patch.mecanizado_segun = val;
              patch._mecAuto = true;
            }
            set(patch);
          } })),
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
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, 'EQUIPOS UTILIZADOS'),
      botonCopiarSeccionNb('equip_nb', 'Copiar equipamiento a otras OT',
        CAMPOS_EQUIPAMIENTO_NB,
        'Copia variante (EMIC/TORNE), equipos tildados + TAGs, y otros equipos manuales.')
    ),
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
            // Columna OT: solo aparece si hay OTs hermanas (solicitud multi-OT).
            multiOtNb
              ? _r('th', { style: { border: '1px solid #333', padding: 4, width: 90 } }, 'OT')
              : null,
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 70 } }, 'PROBETA'),
            _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'RESULTADO'),
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 30 } }, '')
          )
        ),
        _r('tbody', null,
          probetas.map(function (p, i) {
            p = p || {};
            var otOverride = String(p.nro_ot_override || '').trim();
            var otEffective = otOverride || otNroActual;
            var esOtra = otOverride && otOverride !== otNroActual;
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, { border: 'none', width: '100%' }),
                  value: p.muestra || '', onChange: function (e) { setProb(i, 'muestra', e.target.value); } })),
              // Selector de OT — solo si hay OTs hermanas. Al cambiar, esta
              // probeta se transfiere al ensayo nick-break de la OT destino
              // al guardar (via saveEnsayoNickBreakMultiOt).
              multiOtNb
                ? _r('td', { style: { border: '1px solid #333', textAlign: 'center', padding: 0, background: esOtra ? '#fff8e5' : '#fff' } },
                    _r('select', {
                      value: otEffective,
                      onChange: function (e) {
                        var v = String(e.target.value || '').trim();
                        if (v === otNroActual) v = '';
                        setProb(i, 'nro_ot_override', v);
                      },
                      title: 'OT destino de esta probeta (misma solicitud)',
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
    barraCopiarTodoNb,
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1.3fr 1fr' } }, blockCond, blockEquipos),
    blockResultados, blockMemoriaNotas
  );
}

Object.assign(window, { NickBreakForm: NickBreakForm });
