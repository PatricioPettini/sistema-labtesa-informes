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
        _r('label', { style: Object.assign({}, S.label, { paddingLeft: 14 }) },
          _r('input', { type: 'checkbox', checked: !!grano.itm,
            onChange: function (e) { upd('grano.itm', e.target.checked); } }),
          'ITM N° 064'),
        _r('label', { style: Object.assign({}, S.label, { paddingLeft: 14 }) },
          _r('input', { type: 'checkbox', checked: !!grano.astm,
            onChange: function (e) { upd('grano.astm', e.target.checked); } }),
          'ASTM E112'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!grano.metodo_chk,
            onChange: function (e) { upd('grano.metodo_chk', e.target.checked); } }),
          'Método:',
          _r('input', { style: S.inline, placeholder: '……', value: grano.metodo || '',
            onChange: function (e) { upd('grano.metodo', e.target.value); } }))
      ),
      // 1.1.2 TENOR INCLUSIONARIO
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        _r('div', { style: { fontWeight: 700 } }, '1.1.2  TENOR INCLUSIONARIO'),
        _r('label', { style: Object.assign({}, S.label, { paddingLeft: 14 }) },
          _r('input', { type: 'checkbox', checked: !!inclu.itm,
            onChange: function (e) { upd('inclu.itm', e.target.checked); } }),
          'ITM N° 063'),
        _r('label', { style: Object.assign({}, S.label, { paddingLeft: 14 }) },
          _r('input', { type: 'checkbox', checked: !!inclu.astm,
            onChange: function (e) { upd('inclu.astm', e.target.checked); } }),
          'ASTM E45'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 14 } },
          _r('input', { type: 'checkbox', checked: !!inclu.metodo_chk,
            onChange: function (e) { upd('inclu.metodo_chk', e.target.checked); } }),
          'Método:',
          _r('input', { style: S.inline, placeholder: '……', value: inclu.metodo || '',
            onChange: function (e) { upd('inclu.metodo', e.target.value); } }))
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

  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 10 } },
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3 } }, 'TAMAÑO DE GRANO'),
        _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: datos.resultado_grano || '',
          placeholder: 'Ej: La muestra posee en superficie un tamaño de grano N°7 y en núcleo un tamaño de grano N°6,5 según Plate IB de la norma ASTM E112-25.',
          onChange: function (e) { upd('resultado_grano', e.target.value); } })),
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3 } }, 'TENOR INCLUSIONARIO'),
        _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: datos.resultado_inclusionario || '', placeholder: 'Texto libre opcional (los valores numéricos van en la tabla).',
          onChange: function (e) { upd('resultado_inclusionario', e.target.value); } }),
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
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 4, color: '#374151' } },
          'TAMAÑO DE GRANO — imágenes'),
        typeof window.EnsayoPhotos === 'function'
          ? _r(window.EnsayoPhotos, {
              photos: datos.imagenes_grano || [],
              hint: 'Micrografías con la estructura del grano (ASTM E112 / ITM 064). Se insertan bajo el resultado de Tamaño de Grano en el Word.',
              onChange: function (next) { upd('imagenes_grano', next); },
            })
          : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
      ),
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 4, color: '#374151' } },
          'TENOR INCLUSIONARIO — imágenes'),
        typeof window.EnsayoPhotos === 'function'
          ? _r(window.EnsayoPhotos, {
              photos: datos.imagenes_inclusiones || [],
              hint: 'Micrografías con las inclusiones (ASTM E45 / ITM 063). Se insertan bajo la tabla de Tenor Inclusionario en el Word.',
              onChange: function (next) { upd('imagenes_inclusiones', next); },
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
