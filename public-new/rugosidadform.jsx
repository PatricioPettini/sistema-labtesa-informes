/* ============================================================================
 * RugosidadForm — layout espejo del preinforme físico (modelo F2 241451).
 *
 * Estructura:
 *   1. Condiciones de ensayo      (norma, ITM, sentido, valor req, mediciones,
 *                                 temperatura, tipo de R)
 *   2. Equipamiento utilizado     (catálogo checkboxes + campo libre extra)
 *   3. Resultados obtenidos       (formato tabla + texto + valores + tabla
 *                                 dinámica de mediciones)
 *   4. Evaluación de resultados   (opcional)
 *   5. Nota                       (opcional)
 *
 * Estado esperado por template-rugosidad.js:
 *   norma_1, itm_numero, sentido_medicion, valor_requerido,
 *   cantidad_mediciones, temperatura, tipo_r,
 *   equipamiento{rugosimetro_628, patron_pmm630, termohigro_700},
 *   equipamiento_extra[], formato_tabla ('simple'|'expandida'),
 *   resultado_texto, valor_rugosidad, valor_max_eval,
 *   mediciones[{muestra, rugosidad, valor}] o [{muestra, ra, rz, rt}],
 *   eval_texto, tiene_nota, nota_texto.
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var EQ_RUGOSIDAD_CATALOGO = [
  { key: 'rugosimetro_628', label: 'Rugosímetro Mitutoyo SJ 410 TAG N°MM-628' },
  { key: 'patron_pmm630',   label: 'Patrón de referencia Mitutoyo TAG N°PMM-630' },
  { key: 'termohigro_700',  label: 'Termohigrómetro TAG N°MM-700' },
];

var NORMAS_RUGOSIDAD = [
  'ASME B46.1-2019', 'ISO 21920-2:2021', 'ISO 25178-2:2021',
  'ASTM A480/A480M-25b', 'ISO 4287:1997 (retirada)',
];
var SENTIDOS_MEDICION = [
  'Transversal al pulido', 'Longitudinal al pulido',
  'Transversal al maquinado', 'Longitudinal al maquinado',
];
var TIPOS_R = ['a', 'z', 't', 'q', 'p', 'v', 'sm', 'sk', 'ku'];

function RugosidadForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }

  var tipoR   = datos.tipo_r || 'a';

  // Default de evaluación: se prellena si el campo viene vacío/undefined la
  // primera vez que se abre el form. Sigue siendo editable — al modificarlo,
  // datos.eval_texto pasa a existir y el default no se vuelve a aplicar.
  var evalDefault = 'Luego de realizadas las mediciones se observa comportamiento satisfactorio ya que ningún valor de rugosidad R' + tipoR + ' supera ' + (String(datos.valor_max_eval || '').trim() || '*****') + ' µm.';
  React.useEffect(function () {
    if (datos.eval_texto == null || datos.eval_texto === '') {
      upd('eval_texto', evalDefault);
    }
  }, []);

  var eqCat = datos.equipamiento || {};
  function setEqCat(key, val) {
    var next = Object.assign({}, eqCat); next[key] = !!val;
    upd('equipamiento', next);
  }

  var eqExtra = Array.isArray(datos.equipamiento_extra) ? datos.equipamiento_extra.slice() : [];
  function setEqExtra(i, val) {
    var next = eqExtra.slice(); next[i] = val;
    upd('equipamiento_extra', next);
  }
  function addEqExtra() { upd('equipamiento_extra', eqExtra.concat([''])); }
  function delEqExtra(i) { upd('equipamiento_extra', eqExtra.filter(function (_, idx) { return idx !== i; })); }

  var formato = datos.formato_tabla === 'expandida' ? 'expandida' : 'simple';

  // Mediciones — schema depende del formato de tabla.
  var mediciones = Array.isArray(datos.mediciones) ? datos.mediciones.slice() : [];
  function setMed(i, k, val) {
    var next = mediciones.slice();
    next[i] = Object.assign({}, next[i] || {});
    next[i][k] = val;
    upd('mediciones', next);
  }
  function addMed() {
    var vacia = formato === 'expandida'
      ? { muestra: '', ra: '', rz: '', rt: '' }
      : { muestra: '', valor: '' };
    upd('mediciones', mediciones.concat([vacia]));
  }
  function delMed(i) {
    upd('mediciones', mediciones.filter(function (_, idx) { return idx !== i; }));
  }

  var S = Object.assign({}, window.FORM_STYLES, {
    // Layout helpers propios de rugosidad (no viven en forms-style.jsx).
    row: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    lbl: { fontWeight: 600, minWidth: 160 },
    combo: { border: '1px solid #bbb', background: 'white', fontSize: 12, padding: '3px 5px', outline: 'none', fontFamily: 'inherit' },
  });

  function comboField(labelTxt, key, opciones, placeholder, extraStyle) {
    return _r('div', { style: S.row },
      _r('span', { style: S.lbl }, labelTxt + ':'),
      _r('input', {
        list: 'rugo_' + key,
        style: Object.assign({}, S.inline, extraStyle || {}),
        value: datos[key] || '', placeholder: placeholder || '',
        onChange: function (e) { upd(key, e.target.value); }
      }),
      _r('datalist', { id: 'rugo_' + key },
        opciones.map(function (o) { return _r('option', { key: o, value: o }); }))
    );
  }
  function textField(labelTxt, key, placeholder, width) {
    return _r('div', { style: S.row },
      _r('span', { style: S.lbl }, labelTxt + ':'),
      _r('input', {
        style: Object.assign({}, S.inline, width ? { flex: 'none', width: width } : {}),
        value: datos[key] == null ? '' : datos[key], placeholder: placeholder || '',
        onChange: function (e) { upd(key, e.target.value); }
      })
    );
  }

  // ── 1. CONDICIONES ─────────────────────────────────────────────────────
  var block1 = _r('div', null,
    _r('div', { style: S.head }, '1.  ENSAYO DE RUGOSIDAD — CONDICIONES DE ENSAYO'),
    _r('div', { style: S.box },
      comboField('Norma de ensayo', 'norma_1', NORMAS_RUGOSIDAD, 'Ej: ASME B46.1-2019'),
      textField('Metodología (ITM N°)', 'itm_numero', 'Ej: 048', 120),
      comboField('Sentido de medición', 'sentido_medicion', SENTIDOS_MEDICION, 'Ej: Transversal al pulido'),
      _r('div', { style: S.row },
        _r('span', { style: S.lbl }, 'Valor requerido:'),
        _r('input', { style: Object.assign({}, S.inline, { flex: 'none', width: 90 }),
          value: datos.valor_requerido || '', placeholder: '3,2',
          onChange: function (e) { upd('valor_requerido', e.target.value); } }),
        _r('span', { style: { color: '#666' } }, 'µm máximo')),
      _r('div', { style: S.row },
        _r('span', { style: S.lbl }, 'Cantidad de mediciones:'),
        _r('input', { type: 'number', style: Object.assign({}, S.inline, { flex: 'none', width: 90 }),
          value: datos.cantidad_mediciones || '', placeholder: '5',
          onChange: function (e) { upd('cantidad_mediciones', e.target.value); } })),
      _r('div', { style: S.row },
        _r('span', { style: S.lbl }, 'Temperatura de ensayo:'),
        _r('input', { type: 'number', style: Object.assign({}, S.inline, { flex: 'none', width: 90 }),
          value: datos.temperatura || '', placeholder: '22',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', { style: { color: '#666' } }, '°C')),
      _r('div', { style: S.row },
        _r('span', { style: S.lbl }, 'Tipo de R:'),
        _r('select', { style: S.combo, value: tipoR,
          onChange: function (e) { upd('tipo_r', e.target.value); } },
          TIPOS_R.map(function (t) { return _r('option', { key: t, value: t }, 'R' + t); })))
    )
  );

  // ── 2. EQUIPAMIENTO ────────────────────────────────────────────────────
  var block2 = _r('div', null,
    _r('div', { style: S.head }, '2.  EQUIPAMIENTO UTILIZADO'),
    _r('div', { style: S.box },
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        EQ_RUGOSIDAD_CATALOGO.map(function (eq) {
          return _r('label', { key: eq.key, style: S.label },
            _r('input', { type: 'checkbox', checked: !!eqCat[eq.key],
              onChange: function (e) { setEqCat(eq.key, e.target.checked); } }),
            eq.label);
        })),
      eqExtra.length > 0 ? _r('div', { style: { marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 } },
        eqExtra.map(function (val, i) {
          return _r('div', { key: i, style: { display: 'flex', gap: 6, alignItems: 'center' } },
            _r(window.EquipoInput, { tipo: 'rugosidad',
              style: Object.assign({}, S.inline),
              value: val || '', placeholder: 'Equipo adicional…',
              onChange: function (e) { setEqExtra(i, e.target.value); } }),
            _r('button', { onClick: function () { delEqExtra(i); },
              style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14 } }, '🗑'));
        })) : null,
      _r('div', null,
        _r('button', { onClick: addEqExtra,
          style: { marginTop: 4, fontFamily: 'inherit', fontSize: 11, padding: '4px 10px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar equipo')),
      typeof window.OtrosEquiposBlock === 'function'
        ? _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } })
        : null
    )
  );

  // ── 3. RESULTADOS ──────────────────────────────────────────────────────
  var columnasSimple = [
    { key: 'muestra', label: 'Muestra' },
    { key: 'valor',   label: 'Rugosidad\nR' + tipoR + ' (µm)' },
  ];
  var columnasExpandida = [
    { key: 'muestra', label: 'Muestra N°' },
    { key: 'ra',      label: 'Ra (µm)' },
    { key: 'rz',      label: 'Rz (µm)' },
    { key: 'rt',      label: 'Rt (µm)' },
  ];
  var columnas = formato === 'expandida' ? columnasExpandida : columnasSimple;

  var block3 = _r('div', null,
    _r('div', { style: S.head }, '3.  RESULTADOS OBTENIDOS'),
    _r('div', { style: S.box },
      _r('div', { style: S.row },
        _r('span', { style: S.lbl }, 'Formato de tabla:'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'rugo_fmt', checked: formato === 'simple',
            onChange: function () { upd('formato_tabla', 'simple'); } }), 'Simple (Muestra / Rugosidad R*)'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'rugo_fmt', checked: formato === 'expandida',
            onChange: function () { upd('formato_tabla', 'expandida'); } }), 'Expandida (Ra / Rz / Rt)')),
      _r('div', { style: { fontWeight: 600 } }, 'Texto del resultado (opcional — se usa un default si lo dejás vacío):'),
      _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.resultado_texto || '',
        placeholder: 'Ej: "Los valores obtenidos fueron los siguientes:"',
        onChange: function (e) { upd('resultado_texto', e.target.value); } }),
      _r('div', { style: S.row },
        _r('span', { style: S.lbl }, 'Valor de rugosidad (µm):'),
        _r('input', { style: Object.assign({}, S.inline, { flex: 'none', width: 90 }),
          value: datos.valor_rugosidad || '', placeholder: '2,8',
          onChange: function (e) { upd('valor_rugosidad', e.target.value); } }),
        _r('span', { style: { color: '#888', fontSize: 10 } }, '(solo si no cargás texto libre ni mediciones)')),
      _r('div', { style: S.row },
        _r('span', { style: S.lbl }, 'Valor máximo evaluación (µm):'),
        _r('input', { style: Object.assign({}, S.inline, { flex: 'none', width: 90 }),
          value: datos.valor_max_eval || '', placeholder: '3,2',
          onChange: function (e) { upd('valor_max_eval', e.target.value); } })),

      // Tabla de mediciones (dinámica según formato)
      _r('div', { style: { marginTop: 8 } },
        _r('div', { style: { fontWeight: 600, marginBottom: 4 } }, 'Mediciones:'),
        _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10 } },
          _r('thead', null,
            _r('tr', { style: { background: '#e6e6e6' } },
              columnas.map(function (c) {
                return _r('th', { key: c.key, style: { border: '1px solid #333', padding: 4, whiteSpace: 'pre-line' } }, c.label);
              }),
              _r('th', { style: { border: '1px solid #333', padding: 4, width: 34 } }, ''))),
          _r('tbody', null,
            mediciones.length === 0 ? _r('tr', null,
              _r('td', { colSpan: columnas.length + 1, style: { border: '1px solid #ccc', padding: 6, color: '#999', fontStyle: 'italic', textAlign: 'center' } },
                'Sin mediciones cargadas — usá "+ Agregar medición"')
            ) : mediciones.map(function (m, i) {
              m = m || {};
              return _r('tr', { key: i },
                columnas.map(function (c) {
                  return _r('td', { key: c.key, style: { border: '1px solid #333', padding: 0 } },
                    _r('input', { style: { border: 'none', width: '100%', fontSize: 11, padding: '4px 6px', outline: 'none', background: 'transparent', textAlign: 'center' },
                      value: m[c.key] == null ? '' : m[c.key],
                      onChange: function (e) { setMed(i, c.key, e.target.value); } }));
                }),
                _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                  _r('button', { onClick: function () { delMed(i); },
                    style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14 } }, '🗑')));
            }))),
        _r('div', { style: { marginTop: 4 } },
          _r('button', { onClick: addMed,
            style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar medición'))
      )
    )
  );

  // ── 4. EVALUACIÓN (opcional) ───────────────────────────────────────────
  var block4 = _r('div', null,
    _r('div', { style: S.head }, '4.  EVALUACIÓN DE RESULTADOS (OPCIONAL)'),
    _r('div', { style: S.box },
      _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.eval_texto || '',
        placeholder: 'Luego de realizadas las mediciones se observa…',
        onChange: function (e) { upd('eval_texto', e.target.value); } })
    )
  );

  // ── 5. NOTA (opcional) ─────────────────────────────────────────────────
  var block5 = _r('div', null,
    _r('div', { style: S.head }, '5.  NOTA (OPCIONAL)'),
    _r('div', { style: S.box },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.tiene_nota,
          onChange: function (e) { upd('tiene_nota', !!e.target.checked); } }),
        'Incluir nota en el informe'),
      datos.tiene_nota ? _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.nota_texto || '',
        placeholder: 'Texto de la nota…',
        onChange: function (e) { upd('nota_texto', e.target.value); } }) : null
    )
  );

  return _r('div', { style: S.sheet }, block1, block2, block3, block4, block5);
}

Object.assign(window, { RugosidadForm: RugosidadForm });
