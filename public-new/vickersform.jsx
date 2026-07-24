/* ============================================================================
 * VickersForm — layout espejo del preinforme físico FM-052 (Mapa Dureza Vickers).
 *
 * Estructura:
 *   1.1 Normas / procedimientos          (ITM-076, ASTM E384/E92, ISO 6507-1, ISO 9015-1)
 *   1.2 Verificaciones y condiciones     (chequeos OK, temp, carga, tiempo, zonas…)
 *   1.3 Equipamiento utilizado            (filtrado por variante) + tabla incertidumbres
 *   1.4 Resultados obtenidos              (tabla partida en 2 columnas: N°/Zona/D1/D2/Dprom/HV)
 *   1.5 Observaciones / Evaluación        (textarea único → evaluacion_texto)
 *
 * Keys del schema legado se preservan: template-vickers.js sigue trabajando con
 * `norma`, `metodologia`, `patron`, `equipamiento.{key}`, `mediciones[]` (con
 * `impronta`, `zona`, `dureza`). Los campos `d1`, `d2`, `dprom` quedan en el
 * schema para uso interno del técnico (no se emiten en el Word actualmente).
 * ========================================================================== */
'use strict';

var _r = React.createElement;

// Catálogo completo de equipamiento Vickers — el técnico marca los que usó.
// Todos con TAG editable (pre-cargado con el valor default).
var VICKERS_EQ_CABA = [
  { key: 'buehler_405',          nombre: 'MICRODURÓMETRO BUEHLER WILSON VH 1150', tagDefault: 'MM-405' },
  { key: 'zwick_13',             nombre: 'MICRODURÓMETRO ZWICK',                  tagDefault: 'MM-13'  },
  { key: 'calibre_694',          nombre: 'CALIBRE DIGITAL',                       tagDefault: 'MM-694' },
  { key: 'micrometro_179',       nombre: 'MICRÓMETRO MITUTOYO',                   tagDefault: 'MM-179' },
  { key: 'calibre_mitutoyo_703', nombre: 'CALIBRE DIGITAL MITUTOYO',              tagDefault: 'MM-703' },
  { key: 'termohigro_794',       nombre: 'TERMOHIGRÓMETRO',                       tagDefault: 'MM-794' },
];

var VICKERS_EQ_NEUQUEN = VICKERS_EQ_CABA;

function VickersForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  var mediciones = Array.isArray(datos.mediciones) ? datos.mediciones.slice() : [];
  if (mediciones.length === 0) {
    for (var _i = 0; _i < 10; _i++) mediciones.push({});
  }
  function setPunto(i, key, val) {
    var next = mediciones.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('mediciones', next);
  }
  function addPunto() { set('mediciones', mediciones.concat([{}])); }
  function delUltimo() { if (mediciones.length > 2) set('mediciones', mediciones.slice(0, -1)); }

  var variante = datos.variante || (datos.laboratorio || '').toLowerCase();
  var equipos = variante === 'neuquen' ? VICKERS_EQ_NEUQUEN : VICKERS_EQ_CABA;

  // Split de la tabla en 2 columnas (izq/der) como en el preinforme físico.
  var half = Math.ceil(mediciones.length / 2);
  var colIzq = mediciones.slice(0, half).map(function (p, i) { return { p: p || {}, idx: i, num: i + 1 }; });
  var colDer = mediciones.slice(half).map(function (p, i)   { return { p: p || {}, idx: half + i, num: half + i + 1 }; });

  var S = window.FORM_STYLES;

  // ── 1.1 NORMAS ──────────────────────────────────────────────────────────
  var block11 = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.head }, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: S.box },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.norma_itm076,
          onChange: function (e) { updBool('norma_itm076', e.target.checked); } }), 'ITM-076 *'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_astm_e384,
            onChange: function (e) { updBool('norma_astm_e384', e.target.checked); } }), 'SEGÚN ASTM E384 *'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', { style: Object.assign({}, S.input, { width: 60 }), placeholder: '-22',
          value: datos.norma_astm_e384_year || '',
          onChange: function (e) { upd('norma_astm_e384_year', e.target.value); } })),
      // Cada norma con input de año al lado. Se guarda en `<key>_year`.
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_astm_e92,
            onChange: function (e) { updBool('norma_astm_e92', e.target.checked); } }), 'SEGÚN ASTM E92 *'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', { style: Object.assign({}, S.input, { width: 60 }), placeholder: '-23',
          value: datos.norma_astm_e92_year || '',
          onChange: function (e) { upd('norma_astm_e92_year', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_iso6507,
            onChange: function (e) { updBool('norma_iso6507', e.target.checked); } }), 'SEGÚN ISO 6507-1 *'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', { style: Object.assign({}, S.input, { width: 60 }), placeholder: ':2024',
          value: datos.norma_iso6507_year || '',
          onChange: function (e) { upd('norma_iso6507_year', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_iso9015,
            onChange: function (e) { updBool('norma_iso9015', e.target.checked); } }), 'SEGÚN ISO 9015-1 *'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', { style: Object.assign({}, S.input, { width: 60 }),
          value: datos.norma_iso9015_year || '',
          onChange: function (e) { upd('norma_iso9015_year', e.target.value); } })),
      // "Otro" — input libre vacío por default. Solo se agrega al Word si el
      // checkbox está tildado Y el texto no está vacío.
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_otra_chk,
          onChange: function (e) { updBool('norma_otra_chk', e.target.checked); } }),
        'Otro:',
        _r(window.NormaInput, { tipo: 'dureza-vickers', categoria: 'ensayo', style: S.inline, placeholder: 'Empezá a escribir (ej: ASTM…)',
          value: datos.norma_otra || '',
          onChange: function (e) { upd('norma_otra', e.target.value); } }))
    )
  );

  // ── 1.2 VERIFICACIONES Y CONDICIONES ────────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.2  VERIFICACIONES Y CONDICIONES DE ENSAYO ',
      _r('span', { style: { fontWeight: 400, fontSize: 9 } }, '( * = obligatorio informar )')),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 10.5 } },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_muestra,
          onChange: function (e) { updBool('sup_muestra', e.target.checked); } }), 'ESTADO SUP. MUESTRA: OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_equipo,
          onChange: function (e) { updBool('sup_equipo', e.target.checked); } }), 'ESTADO SUP. EQUIPO: OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.paralelismo,
          onChange: function (e) { updBool('paralelismo', e.target.checked); } }), 'PARALELISMO: OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.verif_patron,
          onChange: function (e) { updBool('verif_patron', e.target.checked); } }), 'VERIF. CONTRA PATRÓN: OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.verif_periodica,
          onChange: function (e) { updBool('verif_periodica', e.target.checked); } }), 'VERIFICACIÓN PERIÓDICA'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.verif_ok,
          onChange: function (e) { updBool('verif_ok', e.target.checked); } }), 'VERIFICACIÓN OK'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ESPESOR DE PROBETA:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.espesor_probeta || '',
          onChange: function (e) { upd('espesor_probeta', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'N° VERIFICACIÓN:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.n_verificacion || '',
          onChange: function (e) { upd('n_verificacion', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA *:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 56 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'PATRÓN TAG N° *:'),
        _r('input', { style: S.inline, placeholder: '……',
          value: datos.patron_tag || '',
          onChange: function (e) { upd('patron_tag', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'CARGA APLICADA Kgf *:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.carga_aplicada || '',
          onChange: function (e) { upd('carga_aplicada', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TIEMPO DE APLICACIÓN seg *:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.tiempo_aplicacion || '',
          onChange: function (e) { upd('tiempo_aplicacion', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'NORMA REF *:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.norma_ref || '',
          onChange: function (e) { upd('norma_ref', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'N° *:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.norma_n || '',
          onChange: function (e) { upd('norma_n', e.target.value); } })),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ZONAS DE MEDICIÓN *:'),
        _r('input', { style: S.inline, placeholder: '…………………………', value: datos.zonas_medicion || '',
          onChange: function (e) { upd('zonas_medicion', e.target.value); } })),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ARCHIVO GUARDADO EN:'),
        _r('input', { style: S.inline, placeholder: 'G:\\METALMECANICA\\FOTOS\\…', value: datos.archivo_ref || '',
          onChange: function (e) { upd('archivo_ref', e.target.value); } }))
    )
  );

  // ── 1.3 EQUIPAMIENTO ────────────────────────────────────────────────────
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.3  EQUIPAMIENTO UTILIZADO'),
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr' } },
      _r('div', { style: { borderRight: '1px solid #333', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 } },
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
      _r('div', { style: { padding: 8 } },
        _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 9 } },
          _r('thead', null,
            _r('tr', { style: { background: '#e6e6e6' } },
              _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'Rango (HV10)'),
              _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'Incertidumbre (HV10)')
            )
          ),
          _r('tbody', null,
            _r('tr', null, _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, '100 a 349'), _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, '7')),
            _r('tr', null, _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, '350 a 644'), _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, '16')),
            _r('tr', null, _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, '644 a 1000'), _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, '31')),
            _r('tr', null, _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, '> 1000'), _r('td', { style: { border: '1px solid #333', textAlign: 'center' } }, 'Realizar cálculo'))
          )
        )
      )
    ),
    typeof window.OtrosEquiposBlock === 'function'
      ? _r('div', { style: { padding: '0 8px 8px' } },
          _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } }))
      : null
  );

  // ── 1.4 RESULTADOS — Tabla split (N° + Zona + Dureza Vickers) ───────────
  function tablaColumna(subs) {
    return _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10 } },
      _r('thead', null,
        _r('tr', { style: { background: '#e6e6e6' } },
          _r('th', { style: { border: '1px solid #333', padding: 4, width: 40 } }, 'N°'),
          _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'ZONA'),
          _r('th', { style: { border: '1px solid #333', padding: 4, width: 90 } }, 'DUREZA VICKERS *')
        )
      ),
      _r('tbody', null,
        subs.map(function (row) {
          var i = row.idx; var p = row.p;
          return _r('tr', { key: i },
            _r('td', { style: { border: '1px solid #333', textAlign: 'center', fontWeight: 700, background: '#fafafa' } }, row.num),
            _r('td', { style: { border: '1px solid #333', padding: 0 } },
              _r('input', {
                style: Object.assign({}, S.input, { border: 'none', width: '100%', padding: '4px 6px' }),
                value: p.zona || '',
                onChange: function (e) {
                  var val = e.target.value;
                  var next = mediciones.slice();
                  next[i] = Object.assign({}, next[i] || {}, { zona: val });
                  set('mediciones', next);
                },
              })),
            _r('td', { style: { border: '1px solid #333', padding: 0 } },
              _r('input', {
                style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%', padding: '4px 6px' }),
                value: p.dureza || '',
                onChange: function (e) {
                  // Setear dureza + impronta en una única actualización (evita
                  // stale state cuando `setPunto` interno usa una copia previa).
                  var val = e.target.value;
                  var next = mediciones.slice();
                  next[i] = Object.assign({}, next[i] || {}, { dureza: val, impronta: String(row.num) });
                  set('mediciones', next);
                },
              }))
          );
        })
      )
    );
  }

  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
      tablaColumna(colIzq), tablaColumna(colDer)),
    _r('div', { style: { padding: '0 8px 8px', display: 'flex', gap: 8 } },
      _r('button', { onClick: addPunto,
        style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar punto'),
      _r('button', { onClick: delUltimo,
        style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '− Quitar último'))
  );

  // ── 1.5 OBSERVACIONES / EVALUACIÓN ──────────────────────────────────────
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.5  OBSERVACIONES / EVALUACIÓN'),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 72, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.evaluacion_texto || '', placeholder: 'Observaciones y evaluación del mapa de dureza…',
        onChange: function (e) { upd('evaluacion_texto', e.target.value); } }))
  );

  // ── 1.6 IMÁGENES DEL ENSAYO (mapas, improntas, etc.) ────────────────────
  var block16 = _r('div', null,
    _r('div', { style: S.head }, '1.6  IMÁGENES DEL ENSAYO (mapa de durezas, improntas, etc.)'),
    _r('div', { style: { padding: 8 } },
      typeof window.EnsayoPhotos === 'function'
        ? _r(window.EnsayoPhotos, {
            photos: datos.imagenes_resultado || [],
            hint: 'Arrastrá el mapa de durezas / improntas o hacé clic para seleccionar (opcional)',
            onChange: function (next) { upd('imagenes_resultado', next); },
          })
        : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
    )
  );

  return _r('div', { style: S.sheet },
    _r('div', { style: { display: 'grid', gridTemplateColumns: '0.85fr 1.5fr' } }, block11, block12),
    block13, block14, block15, block16
  );
}

Object.assign(window, { VickersForm: VickersForm });
