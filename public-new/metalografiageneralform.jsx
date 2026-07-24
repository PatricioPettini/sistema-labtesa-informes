/* ============================================================================
 * MetalografiaGeneralForm — layout espejo del preinforme físico FM-055
 * (Análisis Metalográfico General).
 *
 * Agrupa varios análisis en un único informe: microestructura, espesor de
 * recubrimiento, estructura de grafito, decarburación y otro.
 *
 * Estructura:
 *   1.1 Normas / procedimientos       (5 análisis con checkbox + ITM/ref)
 *   1.2 Verificaciones                (checkboxes OK + temperatura + zonas + muestra)
 *   1.2.1 Reactivo utilizado          (6 checkboxes + otro)
 *   1.3 Equipamiento                  (3 microscopios/termohigro con TAG + aumentos)
 *   1.4 Resultados                    (4 textareas por sección)
 *   1.5 Observaciones                 (textarea)
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var MG_ANALISIS = [
  { key: 'micro',   label: '1.1.1 MICROESTRUCTURA',            refLabel: 'ITM N° / Norma:', defRef: '' },
  { key: 'espesor', label: '1.1.2 ESPESOR DE RECUBRIMIENTO',    refLabel: 'ITM N°:',         defRef: '' },
  { key: 'grafito', label: '1.1.3 ESTRUCTURA DE GRAFITO',       refLabel: 'ITM N°:',         defRef: '' },
  { key: 'decarb',  label: '1.1.4 DECARBURACIÓN',               refLabel: 'ITM N°:',         defRef: '' },
  { key: 'otro',    label: '1.1.5 OTRO',                        refLabel: 'ITM N°:',         defRef: '' },
];

var MG_REACTIVOS = [
  { key: 'nital2',      label: 'NITAL AL 2%' },
  { key: 'nitro_fluor', label: 'NITRO FLUOR GLICERINA' },
  { key: 'nital6',      label: 'NITAL AL 6%' },
  { key: 'vilella',     label: 'REACTIVO VILELLA' },
  { key: 'universal',   label: 'UNIVERSAL' },
  { key: 'kellers',     label: 'REACTIVO KELLERS' },
];

var MG_EQUIPOS = [
  { key: 'olympus_016', nombre: 'MICROSCOPIO OLYMPUS',       tagDefault: 'MM-016' },
  { key: 'leica_378',   nombre: 'MICROSCOPIO LEICA DM 750',  tagDefault: 'MM-378' },
  { key: 'termo_700',   nombre: 'TERMOHIGRÓMETRO',           tagDefault: 'MM-700' },
];

var MG_AUMENTOS = [
  { key: 'x50',   label: '50X' },
  { key: 'x100',  label: '100X' },
  { key: 'x200',  label: '200X' },
  { key: 'x500',  label: '500X' },
  { key: 'x1000', label: '1000X' },
];

var MG_RESULTADOS = [
  { key: 'microestructura', label: 'MICROESTRUCTURA (correlación con tratamientos térmicos)', placeholder: 'Las muestras analizadas poseen una…' },
  { key: 'grafito',         label: 'ESTRUCTURA DE GRAFITO',                                    placeholder: '…' },
  { key: 'decarburacion',   label: 'DECARBURACIÓN',                                            placeholder: '…' },
  { key: 'defectos',        label: 'DEFECTOS SUPERFICIALES',                                    placeholder: '…' },
];

function MetalografiaGeneralForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  var S = window.FORM_STYLES;

  // ── 1.1 NORMAS ─────────────────────────────────────────────────────────
  var block11 = _r('div', null,
    _r('div', { style: S.head }, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 10.5 } },
      MG_ANALISIS.map(function (n) {
        var d = (datos.analisis && datos.analisis[n.key]) || { on: false, ref: n.defRef };
        return _r('div', { key: n.key, style: { display: 'flex', flexDirection: 'column', gap: 3 } },
          _r('label', { style: Object.assign({}, S.label, { fontWeight: 700 }) },
            _r('input', { type: 'checkbox', checked: !!d.on,
              onChange: function (e) { upd('analisis.' + n.key + '.on', e.target.checked); } }),
            n.label),
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 20 } },
            _r('span', { style: { color: '#555' } }, n.refLabel),
            _r('input', { style: S.inline, placeholder: '……', value: d.ref || '',
              onChange: function (e) { upd('analisis.' + n.key + '.ref', e.target.value); } }))
        );
      })
    )
  );

  // ── 1.2 VERIFICACIONES ─────────────────────────────────────────────────
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
        _r(window.ZonaInput, { tipo: 'metalografia-general', style: S.inline, placeholder: 'Ej: Núcleo, Superficie…',
          value: datos.zona_ensayo || '',
          onChange: function (e) { upd('zona_ensayo', e.target.value); } })),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'MUESTRA ENSAYADA:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.muestra_ensayada || '',
          onChange: function (e) { upd('muestra_ensayada', e.target.value); } }))
    ),
    _r('div', { style: S.subhead }, '1.2.1  REACTIVO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 16px', fontSize: 10.5 } },
      MG_REACTIVOS.map(function (r) {
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

  // ── 1.3 EQUIPAMIENTO ───────────────────────────────────────────────────
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.3  EQUIPAMIENTO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 } },
      MG_EQUIPOS.map(function (e) {
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
        MG_AUMENTOS.map(function (a) {
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

  // ── 1.4 RESULTADOS ─────────────────────────────────────────────────────
  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 10 } },
      MG_RESULTADOS.map(function (r) {
        return _r('div', { key: r.key },
          _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3 } }, r.label),
          _r('textarea', { style: { width: '100%', minHeight: 56, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
            value: (datos.resultados_seccion && datos.resultados_seccion[r.key]) || '', placeholder: r.placeholder,
            onChange: function (e) { upd('resultados_seccion.' + r.key, e.target.value); } }));
      })
    )
  );

  // ── 1.5 OBSERVACIONES ──────────────────────────────────────────────────
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.5  OBSERVACIONES / EVALUACIÓN ',
      _r('span', { style: { fontWeight: 400, fontSize: 9 } }, '*')),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 70, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.evaluacion_texto || '', placeholder: 'Observaciones y evaluación…',
        onChange: function (e) { upd('evaluacion_texto', e.target.value); } }))
  );

  // ── 1.6 IMÁGENES DEL ENSAYO ────────────────────────────────────────────
  var block16 = _r('div', null,
    _r('div', { style: S.head }, '1.6  IMÁGENES DEL ENSAYO'),
    _r('div', { style: { padding: 8 } },
      typeof window.EnsayoPhotos === 'function'
        ? _r(window.EnsayoPhotos, {
            photos: datos.imagenes_resultado || [],
            hint: 'Arrastrá imágenes del ensayo (microestructura, tamaño de grano, inclusiones, etc.)',
            onChange: function (next) { upd('imagenes_resultado', next); },
          })
        : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
    )
  );

  return _r('div', { style: S.sheet },
    block11, block12, block13, block14, block15, block16
  );
}

Object.assign(window, { MetalografiaGeneralForm: MetalografiaGeneralForm });
