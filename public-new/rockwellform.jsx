/* ============================================================================
 * RockwellForm — layout espejo del preinforme físico FM-060 Rev.01 (Dureza
 * Rockwell). Contiene DOS tablas:
 *   Tabla 1 — RESULTADOS OBTENIDOS: muestra/OT N° + zona + dureza Rockwell.
 *             + Esquema de mediciones (imagen) + archivo guardado.
 *             + Checkbox "La tabla continúa en el anexo adjunto".
 *   Tabla 2 — MEMORIA ANALÍTICA (interno): patrón TAG + valor + escala + tabla
 *             pivotada (M1..M5 columnas × Med1/Med2/Med3/Promedio filas).
 *
 * Mapping a keys del schema legado:
 *   - metodologia, patron, escala, espesor_probeta, temperatura, zona_ensayo
 *   - equipamiento.{key}, equipamiento_tags.{key}
 *   - zonas_rockwell[] = { muestra, zona, dureza }        ← tabla 1 (nueva)
 *   - mediciones[{dureza}] = derivado auto de la tabla 1 O 2 (para generator)
 *   - muestras_rockwell[i] = { muestra, zona, med1, med2, med3, promedio }
 *                                                           ← memoria analítica
 *   - evaluacion_texto (notas)
 *   - anexo_adjunto_tabla1, anexo_adjunto_memoria (booleans)
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var ROCKWELL_EQ_CABA = [
  { key: 'durometro_petri', nombre: 'DURÓMETRO PETRI',  tagDefault: 'MM-012' },
  { key: 'termohigro_545',  nombre: 'TERMOHIGRÓMETRO',  tagDefault: 'PCAL-545' },
  { key: 'termohigro_701',  nombre: 'TERMOHIGRÓMETRO',  tagDefault: 'MM-701' },
  { key: 'termohigro_702',  nombre: 'TERMOHIGRÓMETRO',  tagDefault: 'MM-702' },
  { key: 'calibre_571',     nombre: 'CALIBRE DIGITAL',  tagDefault: 'MM-571' },
];

var ROCKWELL_EQ_NEUQUEN = [
  { key: 'durometro_petri', nombre: 'DURÓMETRO PETRI',  tagDefault: 'MM-012' },
  { key: 'termohigro_794',  nombre: 'TERMOHIGRÓMETRO',  tagDefault: 'MM-794' },
  { key: 'calibre_694',     nombre: 'CALIBRE DIGITAL',  tagDefault: 'MM-694' },
];

var N_MUESTRAS_MEMORIA = 5;

// Promedio ignorando strings vacías / no numéricas.
function promedio3(a, b, c) {
  var vals = [a, b, c].map(function (x) {
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

function RockwellForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  // ── Tabla 1 (nueva) — zonas_rockwell: fila por medición individual ─────
  var zonas = Array.isArray(datos.zonas_rockwell) ? datos.zonas_rockwell.slice() : [];
  if (zonas.length === 0) {
    for (var _z = 0; _z < 6; _z++) zonas.push({ muestra: '', zona: '', dureza: '' });
  }
  function setZona(i, key, val) {
    var next = zonas.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('zonas_rockwell', next);
    // Sincronizar mediciones a partir de la tabla 1 (source of truth por default).
    var meds = next
      .filter(function (r) { return r && String(r.dureza || '').trim() !== ''; })
      .map(function (r) { return { dureza: String(r.dureza).trim(), zona: r.zona || '', muestra: r.muestra || '' }; });
    if (meds.length) set('mediciones', meds);
  }
  function addZona() { set('zonas_rockwell', zonas.concat([{ muestra: '', zona: '', dureza: '' }])); }
  function delZona(i) {
    var next = zonas.filter(function (_, idx) { return idx !== i; });
    if (next.length === 0) next.push({ muestra: '', zona: '', dureza: '' });
    set('zonas_rockwell', next);
  }

  // ── Tabla 2 — memoria analítica pivotada ────────────────────────────────
  var memoria = Array.isArray(datos.muestras_rockwell) ? datos.muestras_rockwell.slice() : [];
  while (memoria.length < N_MUESTRAS_MEMORIA) memoria.push({});

  function setMemoria(i, key, val) {
    var next = memoria.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    if (key === 'med1' || key === 'med2' || key === 'med3') {
      next[i].promedio = promedio3(next[i].med1, next[i].med2, next[i].med3);
    }
    set('muestras_rockwell', next);
  }

  var variante = datos.variante || (datos.laboratorio || '').toLowerCase();
  var equipos = variante === 'neuquen' ? ROCKWELL_EQ_NEUQUEN : ROCKWELL_EQ_CABA;

  var S = window.FORM_STYLES;

  // ── 1. CONDICIONES DE ENSAYO ────────────────────────────────────────────
  var block1 = _r('div', null,
    _r('div', { style: S.head }, '1.  ENSAYO DE DUREZA ROCKWELL — CONDICIONES DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 11 } },
      // Norma de ensayo (checkboxes con año editable).
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
        _r('span', { style: { fontWeight: 700 } }, 'NORMA:'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          _r('input', { type: 'checkbox', checked: !!datos.norma_astm_e18,
            onChange: function (e) { upd('norma_astm_e18', e.target.checked); } }),
          'ASTM E18-',
          _r('input', { style: Object.assign({}, S.input, { width: 40, textAlign: 'center' }),
            placeholder: '25', value: datos.norma_astm_e18_year || '',
            onChange: function (e) { upd('norma_astm_e18_year', e.target.value); } })),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
          _r('input', { type: 'checkbox', checked: !!datos.norma_iso6508,
            onChange: function (e) { upd('norma_iso6508', e.target.checked); } }),
          'ISO 6508-1:',
          _r('input', { style: Object.assign({}, S.input, { width: 52, textAlign: 'center' }),
            placeholder: '2023', value: datos.norma_iso6508_year || '',
            onChange: function (e) { upd('norma_iso6508_year', e.target.value); } }))
      ),
      _r('div', null, _r('span', { style: { fontWeight: 600 } }, 'Metodología de ensayo:'), ' ',
        _r(window.ItmInput, { tipo: 'dureza-rockwell', style: Object.assign({}, S.inline, { width: 160, flex: 'none' }), value: datos.metodologia || '', placeholder: 'ITM N°060',
          onChange: function (e) { upd('metodologia', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'Espesor de probeta:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.espesor_probeta || '',
          onChange: function (e) { upd('espesor_probeta', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'Temperatura de ensayo:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 56 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'Escala:'),
        _r('input', { style: S.inline, placeholder: 'Ej: HRC', value: datos.escala || '',
          onChange: function (e) { upd('escala', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'Patrón usado:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.patron || '',
          onChange: function (e) { upd('patron', e.target.value); } }))
    )
  );

  // ── EQUIPO UTILIZADO ────────────────────────────────────────────────────
  var blockEquipo = _r('div', null,
    _r('div', { style: S.head }, 'EQUIPO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 20px', fontSize: 10.5 } },
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
          _r('input', { style: Object.assign({}, S.input, { width: 80 }), value: tagVal,
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

  // ── RESULTADOS OBTENIDOS — Tabla 1 + esquema ────────────────────────────
  var blockResultados = _r('div', null,
    _r('div', { style: S.head }, 'RESULTADOS OBTENIDOS'),
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1.05fr 1fr', padding: '0 8px 8px', gap: 12 } },
      // ── Tabla ──
      _r('div', null,
        _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10, marginTop: 6 } },
          _r('thead', null,
            _r('tr', { style: { background: '#e6e6e6' } },
              _r('th', { style: { border: '1px solid #333', padding: 4, width: '44%' } }, 'MUESTRA / OT N°'),
              _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'ZONA'),
              _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'DUREZA ROCKWELL'),
              _r('th', { style: { border: 'none', width: 22 } })
            )
          ),
          _r('tbody', null,
            zonas.map(function (z, i) {
              return _r('tr', { key: 'z' + i },
                _r('td', { style: { border: '1px solid #333', padding: 0 } },
                  _r('input', { style: Object.assign({}, S.input, { border: 'none', width: '100%' }),
                    value: z.muestra || '', onChange: function (e) { setZona(i, 'muestra', e.target.value); } })),
                _r('td', { style: { border: '1px solid #333', padding: 0 } },
                  _r('input', { style: Object.assign({}, S.input, { border: 'none', width: '100%' }),
                    value: z.zona || '', onChange: function (e) { setZona(i, 'zona', e.target.value); } })),
                _r('td', { style: { border: '1px solid #333', padding: 0 } },
                  _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                    value: z.dureza || '', onChange: function (e) { setZona(i, 'dureza', e.target.value); } })),
                _r('td', { style: { border: '1px solid #333', textAlign: 'center', padding: 0 } },
                  _r('button', { type: 'button', title: 'Borrar fila',
                    style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 12, padding: '2px 4px' },
                    onClick: function () { delZona(i); } }, '🗑'))
              );
            })
          )
        ),
        _r('div', { style: { marginTop: 6 } },
          _r('button', { type: 'button', onClick: addZona,
            style: { fontSize: 11, padding: '4px 10px', border: '1px solid #999', background: '#f4f4f4', borderRadius: 4, cursor: 'pointer' } },
            '+ Agregar fila'))
      ),
      // ── Esquema mediciones + archivo ──
      _r('div', { style: { border: '1px solid #333', display: 'flex', flexDirection: 'column' } },
        _r('div', { style: { fontSize: 10, fontWeight: 800, padding: '4px 8px', background: '#f0f0f0', borderBottom: '1px solid #333' } },
          'ESQUEMA DE MEDICIONES'),
        _r('div', { style: { padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 } },
          _r('div', { style: { fontSize: 10 } }, 'Las zonas de mediciones se indican en el siguiente esquema:'),
          typeof window.EnsayoPhotos === 'function'
            ? _r(window.EnsayoPhotos, {
                photos: datos.imagenes_esquema || [],
                hint: 'Arrastrá el esquema de mediciones',
                onChange: function (next) { upd('imagenes_esquema', next); },
              })
            : _r('div', { style: { fontSize: 10, color: '#999', padding: 10, border: '1px dashed #999', textAlign: 'center' } }, 'Widget de fotos no disponible'),
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, marginTop: 4 } },
            _r('span', { style: { fontWeight: 700 } }, 'ARCHIVO GUARDADO EN:'),
            _r('input', { style: Object.assign({}, S.inline, { fontSize: 10 }), placeholder: 'G:\\Metalmecanica\\…',
              value: datos.archivo_ref || '',
              onChange: function (e) { upd('archivo_ref', e.target.value); } }))
        )
      )
    ),
    _r('div', { style: { padding: '0 8px 6px', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } },
      _r('label', { style: { fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('input', { type: 'checkbox', checked: !!datos.anexo_adjunto_tabla1,
          onChange: function (e) { updBool('anexo_adjunto_tabla1', e.target.checked); } }),
        'LA TABLA DE MEDICIONES CONTINÚA EN EL ANEXO ADJUNTO'))
  );

  // ── NOTAS ───────────────────────────────────────────────────────────────
  var blockNotas = _r('div', null,
    _r('div', { style: S.head }, 'NOTAS'),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        placeholder: 'Notas del ensayo…', value: datos.evaluacion_texto || '',
        onChange: function (e) { upd('evaluacion_texto', e.target.value); } }))
  );

  // ── MEMORIA ANALÍTICA — Tabla 2 pivotada (interno) ──────────────────────
  var filas = [
    { key: 'med1', label: 'Medición 1', bold: false },
    { key: 'med2', label: 'Medición 2', bold: false },
    { key: 'med3', label: 'Medición 3', bold: false },
    { key: 'promedio', label: 'DUREZA PROMEDIO (   )', bold: true, readonly: true },
  ];

  var blockMemoria = _r('div', null,
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }) },
      _r('span', null, 'MEMORIA ANALÍTICA (interno)'),
      _r('span', { style: { fontWeight: 400, fontSize: 10 } },
        'Patrón TAG N°:'),
      _r('input', { style: Object.assign({}, S.input, { width: 100 }), value: datos.patron_tag || '',
        onChange: function (e) { upd('patron_tag', e.target.value); } }),
      _r('span', { style: { fontWeight: 400, fontSize: 10 } }, 'Valor:'),
      _r('input', { style: Object.assign({}, S.input, { width: 90 }), value: datos.memoria_valor || '',
        onChange: function (e) { upd('memoria_valor', e.target.value); } }),
      _r('span', { style: { fontWeight: 400, fontSize: 10 } }, 'Escala:'),
      _r('input', { style: Object.assign({}, S.input, { width: 80 }), value: datos.memoria_escala || '',
        onChange: function (e) { upd('memoria_escala', e.target.value); } })
    ),
    _r('div', { style: { padding: 8, overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 9.5, minWidth: 720 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 3, textAlign: 'left', width: 130 } }, 'MUESTRA'),
            memoria.map(function (m, i) {
              return _r('th', { key: 'mh' + i, style: { border: '1px solid #333', padding: 2, width: 60 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { width: '100%', fontSize: 9, fontWeight: 700 }),
                  placeholder: String(i + 1), value: m.muestra || '',
                  onChange: function (e) { setMemoria(i, 'muestra', e.target.value); } }));
            }),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 70, background: '#dcdcdc' } }, 'PATRÓN'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 150 } }, 'OBSERVACIONES')
          )
        ),
        _r('tbody', null,
          filas.map(function (f, fi) {
            return _r('tr', { key: f.key },
              _r('td', { style: { border: '1px solid #333', padding: '2px 6px', fontWeight: f.bold ? 700 : 400, background: f.bold ? '#f2f2f2' : '#fff', textAlign: 'right' } }, f.label),
              memoria.map(function (m, i) {
                var val = (m && m[f.key]) || '';
                return _r('td', { key: f.key + '-' + i, style: { border: '1px solid #333', padding: 0 } },
                  _r('input', {
                    style: Object.assign({}, S.input, S.num, {
                      border: 'none', width: '100%',
                      background: f.readonly ? '#fafafa' : 'transparent',
                      fontWeight: f.bold ? 700 : 400,
                    }),
                    value: val, readOnly: !!f.readonly,
                    onChange: function (e) { if (!f.readonly) setMemoria(i, f.key, e.target.value); }
                  }));
              }),
              fi === 0 ? _r('td', { rowSpan: 4, style: { border: '1px solid #333', padding: 0, verticalAlign: 'top', background: '#f7f7f7' } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: datos.patron_valor || '',
                  onChange: function (e) { upd('patron_valor', e.target.value); } })) : null,
              fi === 0 ? _r('td', { rowSpan: 4, style: { border: '1px solid #333', padding: 0, verticalAlign: 'top' } },
                _r('textarea', { style: { border: 'none', width: '100%', fontSize: 10, padding: 4, outline: 'none', resize: 'vertical', minHeight: 60, background: 'transparent' },
                  value: datos.observaciones_tabla || '',
                  onChange: function (e) { upd('observaciones_tabla', e.target.value); } })) : null
            );
          })
        )
      ),
      _r('div', { style: { marginTop: 6, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } },
        _r('label', { style: { fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } },
          _r('input', { type: 'checkbox', checked: !!datos.anexo_adjunto_memoria,
            onChange: function (e) { updBool('anexo_adjunto_memoria', e.target.checked); } }),
          'LA TABLA DE MEDICIONES CONTINÚA EN EL ANEXO ADJUNTO'))
    )
  );

  // Footer
  var footer = _r('div', { style: { borderTop: '1px solid #333', padding: '8px 12px', display: 'flex', justifyContent: 'flex-end' } },
    _r('div', { style: { fontSize: 10, fontWeight: 700, color: '#333' } }, 'FM-060 Rev.01')
  );

  return _r('div', { style: S.sheet },
    block1, blockEquipo, blockResultados, blockNotas, blockMemoria, footer
  );
}

Object.assign(window, { RockwellForm: RockwellForm });
