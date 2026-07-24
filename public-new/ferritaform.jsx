/* ============================================================================
 * FerritaForm — layout espejo del preinforme físico FM-112 (Medición de
 * Ferrita Delta con Ferridelítimetro Fischer).
 *
 * Sólo se activa en la variante 'fischer' (o cuando no hay variante). La
 * variante 'microscopio' del schema legado sigue usando el form genérico.
 *
 * Estructura:
 *   1.1 Condiciones de ensayo         (métodos checkboxes + zonas/sectores/mediciones)
 *   1.2 Equipos utilizados            (ferridelítimetro + patrones Fischer)
 *   1.3 Resultados obtenidos          (tabla sector/zona/m1/m2/m3/promedio +
 *                                     especificación + conclusión checkboxes)
 *   1.4 Notas
 *
 * Mapping a keys del schema legado:
 *   metodologia, norma, zona_examinada, sectores, cantidad_mediciones,
 *   equipamiento.{key}, sin_deteccion (=conclusion_no_detecta),
 *   resultado (=conclusion_valor cuando conclusion_presenta), nota_texto,
 *   tiene_nota
 * Nuevos keys:
 *   metodo_itmm032, metodo_bsen17655, metodo_iso8249, metodo_aws42m,
 *   mediciones_ferrita[{sector, zona, m1, m2, m3, prom}],
 *   especificacion_material, valor_especificacion,
 *   conclusion_no_detecta, conclusion_presenta, conclusion_valor
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var FERRITA_EQ = [
  { key: 'ferridelti_167', nombre: 'FERRIDELÍTIMETRO',        tagDefault: 'MM-167' },
  { key: 'patrones_671',   nombre: 'SET DE PATRONES FISCHER', tagDefault: 'PMM-671' },
];

// Promedio ignorando strings vacías. Devuelve '' si no hay data numérica.
function promMed(m1, m2, m3) {
  var vals = [m1, m2, m3].map(function (x) {
    if (x === undefined || x === null) return NaN;
    var s = String(x).replace(',', '.').trim();
    if (!s) return NaN;
    var n = Number(s);
    return isNaN(n) ? NaN : n;
  }).filter(function (n) { return !isNaN(n); });
  if (!vals.length) return '';
  var avg = vals.reduce(function (s, n) { return s + n; }, 0) / vals.length;
  return (Math.round(avg * 100) / 100).toString().replace('.', ',');
}

function FerritaForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  var mediciones = Array.isArray(datos.mediciones_ferrita) ? datos.mediciones_ferrita.slice() : [];
  if (mediciones.length === 0) {
    for (var _i = 0; _i < 3; _i++) mediciones.push({});
  }
  function setFila(i, key, val) {
    var next = mediciones.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    if (key === 'm1' || key === 'm2' || key === 'm3') {
      next[i].prom = promMed(next[i].m1, next[i].m2, next[i].m3);
    }
    set('mediciones_ferrita', next);
  }
  function addFila() { set('mediciones_ferrita', mediciones.concat([{}])); }
  function delFila(i) { set('mediciones_ferrita', mediciones.filter(function (_, idx) { return idx !== i; })); }

  var S = window.FORM_STYLES;

  // ── 1.1 CONDICIONES ─────────────────────────────────────────────────────
  var block11 = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.head }, '1.1  CONDICIONES DE ENSAYO'),
    _r('div', { style: S.box },
      _r('div', { style: { fontWeight: 600 } }, 'MÉTODO DE ENSAYO:'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 6 } },
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_itmm032,
            onChange: function (e) { updBool('metodo_itmm032', e.target.checked); } }),
          'PROCEDIMIENTO INTERNO ITMM N° 032'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_bsen17655,
            onChange: function (e) { updBool('metodo_bsen17655', e.target.checked); } }),
          'BS-EN-ISO 17655'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_iso8249,
            onChange: function (e) { updBool('metodo_iso8249', e.target.checked); } }),
          'ISO 8249'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_aws42m,
            onChange: function (e) { updBool('metodo_aws42m', e.target.checked); } }),
          'AWS A 4.2 M'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', null, 'Otra norma:'),
          _r(window.NormaInput, { tipo: 'ferrita-delta', categoria: 'ensayo',
            style: S.inline, placeholder: 'Empezá a escribir (ej: ASTM…)',
            value: datos.norma_otra || '',
            onChange: function (e) { upd('norma_otra', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', null, 'Código de referencia:'),
          _r(window.NormaInput, { tipo: 'ferrita-delta', categoria: 'referencia',
            style: S.inline, placeholder: 'ej: ASME…, API…, AWS…',
            value: datos.cod_referencia || '',
            onChange: function (e) { upd('cod_referencia', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', null, 'Metodología (ITM):'),
          _r(window.ItmInput, { tipo: 'ferrita-delta',
            style: S.inline, placeholder: 'Ej: ITM N°032',
            value: datos.metodologia || '',
            onChange: function (e) { upd('metodologia', e.target.value); } }))
      ),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ZONAS EXAMINADAS:'),
        _r(window.ZonaInput, { tipo: 'ferrita-delta', style: S.inline, placeholder: 'Ej: Soldadura, Núcleo…',
          value: datos.zona_examinada || '',
          onChange: function (e) { upd('zona_examinada', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'SECTORES ANALIZADOS:'),
        _r('input', { style: S.inline, placeholder: 'Sector A, Sector B', value: datos.sectores || '',
          onChange: function (e) { upd('sectores', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'MEDICIONES REALIZADAS:'),
        _r('input', { style: S.inline, placeholder: '10 por sector', value: datos.cantidad_mediciones || '',
          onChange: function (e) { upd('cantidad_mediciones', e.target.value); } }))
    )
  );

  // ── 1.2 EQUIPOS ────────────────────────────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.2  EQUIPOS UTILIZADOS'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 } },
      FERRITA_EQ.map(function (e) {
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
      }),
      // Otro equipo (libre, se autoalimenta al catálogo).
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
        _r('span', { style: { color: '#555' } }, 'Otro equipo:'),
        _r(window.EquipoInput, { tipo: 'ferrita-delta',
          style: Object.assign({}, S.inline),
          value: datos.equipo_otro || '', placeholder: 'Empezá a escribir el equipo…',
          onChange: function (e) { upd('equipo_otro', e.target.value); },
          onTagChange: function (tag) { if (!datos.equipo_otro_tag) upd('equipo_otro_tag', tag); } }),
        _r('span', { style: { color: '#555' } }, 'TAG N° (opcional):'),
        _r('input', { style: Object.assign({}, S.input, { width: 96 }),
          placeholder: 's/TAG',
          value: datos.equipo_otro_tag || '',
          onChange: function (e) { upd('equipo_otro_tag', e.target.value); } }))
    ),
    typeof window.OtrosEquiposBlock === 'function'
      ? _r('div', { style: { padding: '0 8px 8px' } },
          _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } }))
      : null
  );

  // ── 1.3 RESULTADOS ─────────────────────────────────────────────────────
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.3  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 9.5, minWidth: 720 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 90 } }, 'SECTOR'),
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 90 } }, 'ZONA'),
            _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'MEDICIÓN 1', _r('br'), '[%]'),
            _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'MEDICIÓN 2', _r('br'), '[%]'),
            _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'MEDICIÓN 3', _r('br'), '[%]'),
            _r('th', { style: { border: '1px solid #333', padding: 4, background: '#dcdcdc' } }, 'PROMEDIO', _r('br'), '[%]'),
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 30 } }, '')
          )
        ),
        _r('tbody', null,
          mediciones.map(function (r, i) {
            r = r || {};
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, { border: 'none', width: '100%' }),
                  value: r.sector || '', onChange: function (e) { setFila(i, 'sector', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, { border: 'none', width: '100%' }),
                  value: r.zona || '', onChange: function (e) { setFila(i, 'zona', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.m1 || '', onChange: function (e) { setFila(i, 'm1', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.m2 || '', onChange: function (e) { setFila(i, 'm2', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.m3 || '', onChange: function (e) { setFila(i, 'm3', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0, background: '#f7f7f7' } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%', background: 'transparent', fontWeight: 700 }),
                  value: r.prom || '', readOnly: true })),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('button', { onClick: function () { delFila(i); },
                  style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14 } }, '🗑'))
            );
          })
        )
      ),
      _r('div', { style: { marginTop: 6 } },
        _r('button', { onClick: addFila,
          style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar fila')),
      // Especificación
      _r('div', { style: { marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 } },
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', { style: { fontWeight: 600 } }, 'ESPECIFICACIÓN DEL MATERIAL:'),
          _r('input', { style: S.inline, placeholder: '……', value: datos.especificacion_material || '',
            onChange: function (e) { upd('especificacion_material', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', { style: { fontWeight: 600 } }, 'VALOR DE ESPECIFICACIÓN:'),
          _r('input', { style: S.inline, placeholder: '……', value: datos.valor_especificacion || '',
            onChange: function (e) { upd('valor_especificacion', e.target.value); } }))),
      // Conclusión
      _r('div', { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 } },
        _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
          _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.sin_deteccion,
            onChange: function (e) { updBool('sin_deteccion', e.target.checked); } }),
          _r('span', null, 'Luego de realizado el ensayo NO SE DETECTA la presencia de ferrita delta.')),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', flex: 1 } },
            _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.conclusion_presenta,
              onChange: function (e) { updBool('conclusion_presenta', e.target.checked); } }),
            _r('span', null, 'Luego de realizado el ensayo la muestra analizada PRESENTA un contenido de ferrita:')),
          _r('input', { style: Object.assign({}, S.input, S.num, { width: 70 }),
            value: datos.resultado || '', placeholder: '……',
            onChange: function (e) { upd('resultado', e.target.value); } }),
          _r('span', null, '%')),
        // Texto libre — si se carga, se emite tal cual en el informe (sobreescribe
        // las opciones de arriba). Ej: "Luego de realizado el ensayo la muestra
        // analizada presenta un contenido de ferrita delta de 74.2%".
        _r('div', { style: { marginTop: 6 } },
          _r('div', { style: { fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginBottom: 3 } },
            'O escribir un texto libre (sobreescribe las opciones de arriba):'),
          _r('textarea', {
            style: { width: '100%', minHeight: 48, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
            placeholder: 'Ej: Luego de realizado el ensayo la muestra analizada presenta un contenido de ferrita delta de 74.2%',
            value: datos.resultado_texto_libre || '',
            onChange: function (e) { upd('resultado_texto_libre', e.target.value); }
          })))
    )
  );

  // ── 1.4 NOTAS ──────────────────────────────────────────────────────────
  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  NOTAS'),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 70, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.nota_texto || '', placeholder: 'Notas…',
        onChange: function (e) { upd('nota_texto', e.target.value); set('tiene_nota', !!e.target.value); } }))
  );

  return _r('div', { style: S.sheet },
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1.3fr 1fr' } }, block11, block12),
    block13, block14
  );
}

Object.assign(window, { FerritaForm: FerritaForm });
