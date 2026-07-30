/* ============================================================================
 * BrinellForm — layout espejo del preinforme físico FM-134.
 *
 * Estructura:
 *   1.1 Normas / procedimientos          (checkboxes ITM-059, ASTM E10, ISO 6506)
 *   1.2 Verificaciones y condiciones     (estado sup, paralelismo, temp, tiempo…)
 *   MEMORIA ANALÍTICA                    (patrón tag, valor, archivo — interno)
 *   1.3 Equipamiento utilizado            (filtrado por variante)
 *   1.4 Resultados obtenidos              (tabla con OT / N° impronta / Ø / esp. / HB
 *                                         + INCLUIR MAPA DE MICRODUREZAS SI/NO)
 *   1.5 Observaciones / Evaluación        (textarea único → evaluacion_texto)
 *
 * Keys del schema legado se mantienen: template-brinell.js sigue trabajando con
 * `norma_astm_e10`, `norma_iso6506`, `metodologia`, `carga_aplicada`,
 * `bolilla_diametro`, `tiempo_aplicacion`, `temperatura`, `zona_ensayo`,
 * `espesor_probeta`, `diametro_impronta`, `equipamiento.{key}`, `mediciones[]`,
 * `incluir_espesor`, `incluir_diametro_impronta`, `evaluacion_texto`.
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var BRINELL_EQ_CABA = [
  { key: 'petri_170',       nombre: 'Durómetro Petri',            tagDefault: 'MM-170' },
  { key: 'calibre_cal570',  nombre: 'Calibre digital',            tagDefault: 'CAL-570' },
  { key: 'calibre_571',     nombre: 'Calibre digital',            tagDefault: 'MM-571' },
  { key: 'registrador_545', nombre: 'Registrador de temperatura', tagDefault: 'PCAL-545' },
  { key: 'registrador_702', nombre: 'Registrador de temperatura', tagDefault: 'MM-702' },
  { key: 'termohigro_701',  nombre: 'Termohigrómetro',            tagDefault: 'MM-701' },
  { key: 'proyector_165',   nombre: 'Proyector de perfiles',      tagDefault: 'MM-165' },
  { key: 'microscopio_173', nombre: 'Microscopio de medición',    tagDefault: 'MM-173' },
];

var BRINELL_EQ_NEUQUEN = [
  { key: 'shimadzu_151',    nombre: 'Máquina de tracción Shimadzu', tagDefault: 'MM-151' },
  { key: 'calibre_694',     nombre: 'Calibre digital',              tagDefault: 'MM-694' },
  { key: 'termohigro_794',  nombre: 'Termohigrómetro',              tagDefault: 'MM-794' },
];

function BrinellForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  var mediciones = Array.isArray(datos.mediciones) ? datos.mediciones.slice() : [];
  if (mediciones.length === 0) {
    for (var _i = 0; _i < 5; _i++) mediciones.push({});
  }
  function setRow(i, key, val) {
    var next = mediciones.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('mediciones', next);
  }
  function addRow() { set('mediciones', mediciones.concat([{}])); }
  function delRow(i) { set('mediciones', mediciones.filter(function (_, idx) { return idx !== i; })); }

  var variante = datos.variante || (datos.laboratorio || '').toLowerCase();
  var equipos = variante === 'neuquen' ? BRINELL_EQ_NEUQUEN : BRINELL_EQ_CABA;

  var S = window.FORM_STYLES;

  // ── 1.1 NORMAS ─────────────────────────────────────────────────────────
  var block11 = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.head }, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: S.box },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.norma_itm059,
          onChange: function (e) { updBool('norma_itm059', e.target.checked); } }),
        'ITM-059'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_astm_e10,
          onChange: function (e) { updBool('norma_astm_e10', e.target.checked); } }),
        'SEGÚN ASTM E10-',
        _r('input', { style: Object.assign({}, S.input, { width: 42, textAlign: 'center' }),
          placeholder: 'AA', value: datos.norma_astm_e10_year || '',
          onChange: function (e) { upd('norma_astm_e10_year', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_iso6506,
          onChange: function (e) { updBool('norma_iso6506', e.target.checked); } }),
        'SEGÚN ISO 6506-1:',
        _r('input', { style: Object.assign({}, S.input, { width: 56, textAlign: 'center' }),
          placeholder: 'AAAA', value: datos.norma_iso6506_year || '',
          onChange: function (e) { upd('norma_iso6506_year', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.norma_otra_chk,
          onChange: function (e) { updBool('norma_otra_chk', e.target.checked); } }),
        'Otro:',
        _r(window.NormaInput, { tipo: 'dureza-brinell', categoria: 'ensayo', style: S.inline, placeholder: 'Empezá a escribir (ej: ASTM…)',
          value: datos.norma_otra || '',
          onChange: function (e) {
            var val = e.target.value;
            upd('norma_otra', val);
            if (val && val.trim() && !datos.norma_otra_chk) upd('norma_otra_chk', true);
          } }))
    )
  );

  // ── 1.2 VERIFICACIONES Y CONDICIONES ──────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.2  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 10.5 } },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_muestra,
          onChange: function (e) { updBool('sup_muestra', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO SUP. MUESTRA:'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_equipo,
          onChange: function (e) { updBool('sup_equipo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO SUP. EQUIPO:'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.paralelismo,
          onChange: function (e) { updBool('paralelismo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'PARALELISMO:'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.verif_patron,
          onChange: function (e) { updBool('verif_patron', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'VERIF. CONTRA PATRÓN:'), ' OK'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 56 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TIEMPO DE APLICACIÓN:'),
        _r('input', { style: Object.assign({}, S.input, { width: 70 }), value: datos.tiempo_aplicacion || '',
          onChange: function (e) { upd('tiempo_aplicacion', e.target.value); } }),
        _r('span', null, 'seg')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'BOLILLA DIÁMETRO:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.bolilla_diametro || '',
          onChange: function (e) { upd('bolilla_diametro', e.target.value); } }),
        _r('span', null, 'mm')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'CARGA APLICADA:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.carga_aplicada || '',
          onChange: function (e) { upd('carga_aplicada', e.target.value); } }),
        _r('span', null, 'kgf')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ESPESOR DE PROBETA:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.espesor_probeta || '',
          onChange: function (e) { upd('espesor_probeta', e.target.value); } }),
        _r('span', null, 'mm')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'DIÁM. IMP.:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.diametro_impronta || '',
          onChange: function (e) { upd('diametro_impronta', e.target.value); } }),
        _r('span', null, 'mm')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'DUREZA HB:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.dureza_hb || '',
          onChange: function (e) { upd('dureza_hb', e.target.value); } })),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ZONA DE ENSAYO:'),
        _r(window.ZonaInput, { tipo: 'dureza-brinell', style: S.inline, placeholder: 'Ej: Superficie, Núcleo, Zona…',
          value: datos.zona_ensayo || '',
          onChange: function (e) { upd('zona_ensayo', e.target.value); } }))
    )
  );

  // ── MEMORIA ANALÍTICA (interno) ────────────────────────────────────────
  // Registro trazabilidad del patrón usado para verificar el durómetro.
  // Campos según FM-134 Rev 00: TAG, valor, diámetro impronta patrón, dureza
  // HB patrón. El archivo_ref (path) se mantiene por retrocompat.
  var blockMem = _r('div', null,
    _r('div', { style: S.subhead }, 'MEMORIA ANALÍTICA (interno)'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 10.5 } },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'PATRÓN UTILIZADO — TAG:'),
        _r('input', { style: Object.assign({}, S.input, { width: 110 }), value: datos.patron_tag || datos.patron || '',
          onChange: function (e) { upd('patron_tag', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'VALOR:'),
        _r('input', { style: S.inline, placeholder: '………………', value: datos.patron_valor || '',
          onChange: function (e) { upd('patron_valor', e.target.value); } })),
      // Nuevas 2 filas: verificación del patrón (medición de diám. impronta
      // y dureza HB del patrón usado para chequear el durómetro).
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'DIÁM. IMP. (mm):'),
        _r('input', { style: Object.assign({}, S.input, { width: 90, textAlign: 'center' }),
          placeholder: '…', value: datos.patron_diam_imp || '',
          onChange: function (e) { upd('patron_diam_imp', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'DUREZA HB:'),
        _r('input', { style: Object.assign({}, S.input, { width: 90, textAlign: 'center' }),
          placeholder: '…', value: datos.patron_dureza_hb || '',
          onChange: function (e) { upd('patron_dureza_hb', e.target.value); } }))
    )
  );

  // ── 1.3 EQUIPAMIENTO ──────────────────────────────────────────────────
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.3  EQUIPAMIENTO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 20px', fontSize: 10.5 } },
      equipos.map(function (e) {
        var checked = !!(datos.equipamiento && datos.equipamiento[e.key]);
        var tagVal  = (datos.equipamiento_tags && datos.equipamiento_tags[e.key]) || e.tagDefault;
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

  // ── 1.4 RESULTADOS ────────────────────────────────────────────────────
  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8 } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 5, width: 90 } }, 'OT'),
            _r('th', { style: { border: '1px solid #333', padding: 5, width: 110 } }, _r('span', null, 'N° DE'), _r('br'), 'IMPRONTA'),
            _r('th', { style: { border: '1px solid #333', padding: 5 } }, _r('span', null, 'DIÁMETRO DE LA'), _r('br'), 'IMPRONTA (mm)'),
            _r('th', { style: { border: '1px solid #333', padding: 5 } }, 'ESPESOR', _r('br'), '(mm)'),
            _r('th', { style: { border: '1px solid #333', padding: 5 } }, 'DUREZA', _r('br'), 'BRINELL (HB)'),
            _r('th', { style: { border: '1px solid #333', padding: 5, width: 30 } }, '')
          )
        ),
        _r('tbody', null,
          mediciones.map(function (r, i) {
            r = r || {};
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.ot || '', onChange: function (e) { setRow(i, 'ot', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.impronta || '', onChange: function (e) { setRow(i, 'impronta', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.diametro_impronta || '', onChange: function (e) { setRow(i, 'diametro_impronta', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.espesor || '', onChange: function (e) { setRow(i, 'espesor', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
                  value: r.dureza || '', onChange: function (e) { setRow(i, 'dureza', e.target.value); } })),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('button', { onClick: function () { delRow(i); },
                  style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14 } }, '🗑'))
            );
          })
        )
      ),
      _r('div', { style: { marginTop: 6 } },
        _r('button', { onClick: addRow,
          style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar fila')),
      _r('div', { style: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 } },
        _r('span', { style: { fontWeight: 600 } }, 'INCLUIR MAPA DE MICRODUREZAS EN INFORME:'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'brinell_mapa', checked: datos.mapa_microdurezas === 'SI',
            onChange: function () { upd('mapa_microdurezas', 'SI'); } }), 'SI'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'brinell_mapa', checked: datos.mapa_microdurezas === 'NO',
            onChange: function () { upd('mapa_microdurezas', 'NO'); } }), 'NO'))
    )
  );

  // ── 1.5 OBSERVACIONES / EVALUACIÓN ────────────────────────────────────
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.5  OBSERVACIONES / EVALUACIÓN ',
      _r('span', { style: { fontWeight: 400, fontSize: 9 } }, '(indicar norma de evaluación en caso de corresponder)')),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 72, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.evaluacion_texto || '', placeholder: 'Observaciones y evaluación del ensayo…',
        onChange: function (e) { upd('evaluacion_texto', e.target.value); } }))
  );

  return _r('div', { style: S.sheet },
    _r('div', { style: { display: 'grid', gridTemplateColumns: '0.85fr 1.4fr' } }, block11, block12),
    blockMem, block13, block14, block15
  );
}

Object.assign(window, { BrinellForm: BrinellForm });
