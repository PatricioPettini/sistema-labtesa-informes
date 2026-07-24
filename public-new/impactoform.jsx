/* ============================================================================
 * ImpactoForm — layout espejo del preinforme físico FM-039 (Excel/HTML).
 *
 * Recibe (datos, setDatos) del contenedor `EnsayoForm` (ensayoform.jsx).
 * Escribe usando los MISMOS keys del schema legado, así el generator de Word
 * (server/generators/template-impacto.js) no cambia.
 *
 * Notas:
 * - No usa JSX propietario; todo con React.createElement para consistencia
 *   con el resto del código del proyecto (Babel standalone en browser).
 * - "medida_probeta" se compone al vuelo desde 3 inputs para respetar el
 *   layout físico (___ x ___ x ___ mm).
 * ========================================================================== */
'use strict';

var _r = React.createElement;

// Catálogo de equipos filtrado por variante. Los keys coinciden con los que
// el generator (server/generators/template-impacto.js) espera en
// datos.equipamiento.{key}.
var IMPACTO_EQ_CABA = [
  // CABA usa el set con Máquina Galdabini
  { key: 'galdabini',         nombre: 'MÁQUINA DE IMPACTO GALDABINI',            tagDefault: 'MM-409' },
  { key: 'freezer_ee761',     nombre: 'ULTRA FREEZER',                           tagDefault: 'EE-761' },
  { key: 'bano_termo_ee537',  nombre: 'BAÑO TERMOSTÁTICO',                       tagDefault: 'EE-537' },
  { key: 'controlador_mm021', nombre: 'CONTROLADOR DE TEMPERATURA DIGITAL',      tagDefault: 'MM-021' },
  { key: 'calibre_mm571',     nombre: 'CALIBRE DIGITAL',                         tagDefault: 'MM-571' },
  { key: 'galgas_773',        nombre: 'GALGAS PATRÓN',                           tagDefault: 'MM-773' },
  { key: 'proyector_165',     nombre: 'PROYECTOR DE PERFILES',                   tagDefault: 'MM-165' },
];
var IMPACTO_EQ_NEUQUEN = [
  // Neuquén tiene el set Wolpert reducido
  { key: 'wolpert',           nombre: 'PÉNDULO DE IMPACTO WOLPERT 300J serie 220001/2031', tagDefault: 'MM-010' },
  { key: 'freezer_pol479',    nombre: 'ULTRA FREEZER',                           tagDefault: 'POL-479' },
  { key: 'controlador_mm315', nombre: 'CONTROLADOR DE TEMPERATURA DIGITAL',      tagDefault: 'MM-315' },
  { key: 'calibre_mm694',     nombre: 'CALIBRE DIGITAL',                         tagDefault: 'MM-694' },
];

// Helper — descompone una medida "10x7.5x55" en [10, 7.5, 55]
function splitMedida(medida) {
  var parts = String(medida || '').split(/[xX×]/).map(function (s) { return s.trim(); });
  return [parts[0] || '', parts[1] || '', parts[2] || ''];
}
function joinMedida(a, b, c) {
  a = String(a == null ? '' : a).trim();
  b = String(b == null ? '' : b).trim();
  c = String(c == null ? '' : c).trim();
  if (!a && !b && !c) return '';
  // Conservar los slots (aunque falte alguno) para que se pueda tipear de a uno.
  return [a, b, c].join('x');
}

function ImpactoForm(props) {
  var datos = props.datos || {};
  var set = props.set;

  function upd(key, val) { set(key, val); }
  function updBool(key, checked) { set(key, !!checked); }

  var medidas = splitMedida(datos.medida_probeta);

  // ── Estilos comunes ────────────────────────────────────────────────────
  var S = Object.assign({}, window.FORM_STYLES, {
    // padBox local: la variante de impacto necesita flex-column con gap para
    // que los ítems apilados dentro de los bloques 1.1/1.2/1.3 respiren.
    padBox: window.FORM_STYLES.box,
    twoCol: { display: 'grid', gridTemplateColumns: '1fr 1.15fr' },
  });

  // ── 1.1 NORMAS / PROCEDIMIENTOS ────────────────────────────────────────
  var norm11 = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.headTitle }, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: S.padBox },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'ITM:'),
        _r(window.ItmInput, { tipo: 'impacto', style: Object.assign({}, S.inputCell, { flex: 1 }), value: datos.metodologia || '', placeholder: 'ITM N°078',
          onChange: function (e) { upd('metodologia', e.target.value); } })),
      // Cada norma tiene un input de año al lado. Se guarda en `<key>_year`
      // — el generator lo pega al nombre (ej. "ISO 148-1:2016").
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_iso148_1, onChange: function (e) { updBool('norma_iso148_1', e.target.checked); } }),
          'SEGÚN ISO 148-1'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', {
          style: Object.assign({}, S.inputCell, { width: 60 }),
          placeholder: ':2016', value: datos.norma_iso148_1_year || '',
          onChange: function (e) { upd('norma_iso148_1_year', e.target.value); },
        })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_astm_e23, onChange: function (e) { updBool('norma_astm_e23', e.target.checked); } }),
          'SEGÚN ASTM E23'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', {
          style: Object.assign({}, S.inputCell, { width: 60 }),
          placeholder: '-23a', value: datos.norma_astm_e23_year || '',
          onChange: function (e) { upd('norma_astm_e23_year', e.target.value); },
        })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_din_10045, onChange: function (e) { updBool('norma_din_10045', e.target.checked); } }),
          'SEGÚN DIN EN 10045'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', {
          style: Object.assign({}, S.inputCell, { width: 60 }),
          placeholder: ':2020', value: datos.norma_din_10045_year || '',
          onChange: function (e) { upd('norma_din_10045_year', e.target.value); },
        })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'Otra:'),
        _r(window.NormaInput, { tipo: 'impacto', categoria: 'ensayo', style: Object.assign({}, S.inputCell, { flex: 1 }), value: datos.norma || '', placeholder: 'Ej.: ISO 148-1:2016',
          onChange: function (e) { upd('norma', e.target.value); } })),
    ),
    // 1.2
    _r('div', { style: S.headTitle }, '1.2  CÓDIGO DE REFERENCIA'),
    _r('div', { style: S.padBox },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.cod_asme, onChange: function (e) { updBool('cod_asme', e.target.checked); } }),
        'ASME BPVC Secc. IX'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', null, 'Edición ASME:'),
        _r('input', { style: Object.assign({}, S.inputCell, { width: 80 }), value: datos.ed_asme || '', placeholder: '2025',
          onChange: function (e) { upd('ed_asme', e.target.value); } })),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.cod_api1104, onChange: function (e) { updBool('cod_api1104', e.target.checked); } }),
        'API 1104'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.cod_api5l, onChange: function (e) { updBool('cod_api5l', e.target.checked); } }),
        'API 5L'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.cod_aws_d11, onChange: function (e) { updBool('cod_aws_d11', e.target.checked); } }),
        'AWS D1.1/D1.1M:2025-AMD1'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', null, 'Otros:'),
        _r(window.NormaInput, {
          tipo: 'impacto', categoria: 'referencia',
          style: Object.assign({}, S.inputCell, { flex: 1 }),
          value: datos.cod_extra || '', placeholder: 'Empezá a escribir (ej: ASME…, API…, AWS…)',
          onChange: function (e) { upd('cod_extra', e.target.value); },
        })),
    )
  );

  // ── 1.3 VERIFICACIONES Y CONDICIONES ───────────────────────────────────
  var verif = _r('div', null,
    _r('div', { style: S.headTitle }, '1.3  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
    _r('div', { style: S.padBox },
      // Temperatura
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA DE ENSAYO:'),
        _r('input', { style: Object.assign({}, S.inputCell, { width: 80 }), value: datos.temperatura || '',
          placeholder: '-20 o Ambiente',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      // Medida de probeta
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
        _r('span', { style: { fontWeight: 600 } }, 'MEDIDA DE PROBETA:'),
        _r('input', { style: Object.assign({}, S.inputCell, S.num, { width: 48 }), value: medidas[0],
          onChange: function (e) { upd('medida_probeta', joinMedida(e.target.value, medidas[1], medidas[2])); } }),
        _r('span', null, 'x'),
        _r('input', { style: Object.assign({}, S.inputCell, S.num, { width: 48 }), value: medidas[1],
          onChange: function (e) { upd('medida_probeta', joinMedida(medidas[0], e.target.value, medidas[2])); } }),
        _r('span', null, 'x'),
        _r('input', { style: Object.assign({}, S.inputCell, S.num, { width: 48 }), value: medidas[2],
          onChange: function (e) { upd('medida_probeta', joinMedida(medidas[0], medidas[1], e.target.value)); } }),
        _r('span', null, 'mm')),
      // Entalla
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        _r('span', { style: { fontWeight: 600 } }, 'ENTALLA:'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'entalla', checked: datos.entalla === 'V',
            onChange: function () { upd('entalla', 'V'); } }), 'CHARPY V'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'entalla', checked: datos.entalla === 'U',
            onChange: function () { upd('entalla', 'U'); } }), 'CHARPY U')),
      // Paralelismo
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.paralelismo, onChange: function (e) { updBool('paralelismo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'PARALELISMO'), ' OK'),
      // Orientación
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        _r('span', { style: { fontWeight: 600 } }, 'ORIENTACIÓN DE PROBETA:'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'orient', checked: datos.orientacion === 'Longitudinal',
            onChange: function () { upd('orientacion', 'Longitudinal'); } }), 'LONG.'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'orient', checked: datos.orientacion === 'Transversal',
            onChange: function () { upd('orientacion', 'Transversal'); } }), 'TRANSV.')),
      // Probetas
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.prob_cliente, onChange: function (e) { updBool('prob_cliente', e.target.checked); } }),
        'PROBETAS MECANIZADAS POR EL CLIENTE'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.prob_cupon_soldado, onChange: function (e) { updBool('prob_cupon_soldado', e.target.checked); } }),
        'PROBETAS EXTRAÍDAS DE CUPÓN SOLDADO'),
      // Verificación diaria (interno)
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.verificacion_diaria, onChange: function (e) { updBool('verificacion_diaria', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'VERIFICACIÓN DIARIA'), ' OK ',
        _r('em', { style: { color: '#888', fontSize: 10 } }, '(no va al informe)')),
      // Radio impactador (interno)
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'RADIO DE IMPACTADOR:'),
        _r('input', { style: Object.assign({}, S.inputCell, { width: 80 }), value: datos.radio_impactador || '', placeholder: '8mm',
          onChange: function (e) { upd('radio_impactador', e.target.value); } }),
        _r('em', { style: { color: '#888', fontSize: 10 } }, '(no va al informe)')),
    ),
    // 1.4 Equipamiento — filtrado por variante (caba=Galdabini, neuquen=Wolpert)
    _r('div', { style: S.headTitle }, '1.4  EQUIPAMIENTO UTILIZADO' + (datos.variante === 'caba' ? ' — Set Galdabini (CABA)' : ' — Set Wolpert (Neuquén)')),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 } },
      (datos.variante === 'caba' ? IMPACTO_EQ_CABA : IMPACTO_EQ_NEUQUEN).map(function (e) {
        var checked = !!(datos.equipamiento && datos.equipamiento[e.key]);
        var tagVal  = (datos.equipamiento_tags && datos.equipamiento_tags[e.key]) != null
          ? datos.equipamiento_tags[e.key] : e.tagDefault;
        return _r('div', { key: e.key, style: { display: 'grid', gridTemplateColumns: '20px 1fr 60px 100px', alignItems: 'center', gap: 6 } },
          _r('input', { type: 'checkbox', checked: checked,
            onChange: function (ev) { upd('equipamiento.' + e.key, ev.target.checked); } }),
          _r('span', { style: { fontWeight: 600 } }, e.nombre),
          _r('span', { style: { color: '#555', fontSize: 10, textAlign: 'right' } }, 'TAG N°:'),
          _r('input', { style: { border: '1px solid #bbb', background: 'transparent', fontSize: 11, padding: '3px 5px', outline: 'none', width: '100%' },
            value: tagVal,
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

  // ── 1.5 RESULTADOS ─────────────────────────────────────────────────────
  var resultados = datos.resultados || [];
  function setRow(i, key, val) {
    var next = resultados.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('resultados', next);
  }
  function addRow() { set('resultados', resultados.concat([{}])); }
  function delRow(i) { set('resultados', resultados.filter(function (_, idx) { return idx !== i; })); }

  var resSection = _r('div', null,
    _r('div', { style: S.headTitle }, '1.5  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: '6px 8px', fontSize: 10, fontWeight: 700 } },
      'RANGO DE ENERGÍA BAJO ALCANCE DE ACREDITACIÓN: 3,75 a 138 J'),
    _r('div', { style: { padding: '4px 8px 8px', overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 11, minWidth: 900 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 40 } }, 'N°'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'ZONA / N° PROBETA'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'VERIF. DIM. (int.)'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'ENERGÍA [J]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'RESILIENCIA [J/cm²]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'EXPANSIÓN [mm]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'FRACT. DÚCTIL [%]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'TEMP. [°C]'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'FRACT. (int.)'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 30 } }, '')
          )
        ),
        _r('tbody', null,
          resultados.map(function (r, i) {
            r = r || {};
            var tdIn = { border: '1px solid #333', padding: 0 };
            var inp = Object.assign({}, S.inputCell, { border: 'none', width: '100%' });
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', textAlign: 'center', fontWeight: 700, background: '#fafafa' } }, i + 1),
              _r('td', { style: tdIn }, _r('input', { style: inp, value: r.zona || '', onChange: function (e) { setRow(i, 'zona', e.target.value); } })),
              _r('td', { style: tdIn }, _r('select', { style: inp, value: r.verif_dimensional || '',
                onChange: function (e) { setRow(i, 'verif_dimensional', e.target.value); } },
                _r('option', { value: '' }, '—'),
                _r('option', { value: 'OK' }, 'OK'),
                _r('option', { value: 'NO OK' }, 'NO OK'))),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.energia || '', onChange: function (e) { setRow(i, 'energia', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.resiliencia || '', onChange: function (e) { setRow(i, 'resiliencia', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.expansion_lateral || '', onChange: function (e) { setRow(i, 'expansion_lateral', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.fractura_ductil || '', onChange: function (e) { setRow(i, 'fractura_ductil', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.temperatura || '', onChange: function (e) { setRow(i, 'temperatura', e.target.value); } })),
              _r('td', { style: tdIn }, _r('select', { style: inp, value: r.fracturado || '',
                onChange: function (e) { setRow(i, 'fracturado', e.target.value); } },
                _r('option', { value: '' }, '—'),
                _r('option', { value: 'SI' }, 'SI'),
                _r('option', { value: 'NO' }, 'NO'))),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('button', { onClick: function () { delRow(i); }, title: 'Borrar',
                  style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '2px 4px' } }, '🗑'))
            );
          })
        )
      ),
      _r('div', { style: { marginTop: 6 } },
        _r('button', { onClick: addRow,
          style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' } }, '+ Agregar fila'))
    )
  );

  // ── 1.6 OBSERVACIONES ──────────────────────────────────────────────────
  // Nota OAA "Los ensayos marcados con (*)..." se detecta automáticamente y
  // no aparece acá — se agrega en el generator según el estado OAA del ensayo.
  var obs = _r('div', null,
    _r('div', { style: S.headTitle }, '1.6  OBSERVACIONES / EVALUACIÓN'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, lineHeight: 1.4 } },
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota1, onChange: function (e) { updBool('nota1', e.target.checked); } }),
        _r('span', null, datos.variante === 'neuquen'
          ? 'Todas las probetas cumplen con las dimensiones y tolerancias correspondientes verificado mediante utilización de calibre digital.'
          : 'Todas las probetas cumplen con las dimensiones y tolerancias correspondientes verificado mediante utilización de las galgas patrón y calibre digital.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_evaluaciones, onChange: function (e) { updBool('nota_evaluaciones', e.target.checked); } }),
        _r('span', null, 'Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_no_conforme, onChange: function (e) { updBool('nota_no_conforme', e.target.checked); } }),
        _r('span', null, 'El ítem marcado con (**) corresponde a un trabajo no conforme.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_incertidumbre, onChange: function (e) { updBool('nota_incertidumbre', e.target.checked); } }),
        _r('span', null, 'El cliente desea incorporar el dato de incertidumbre.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_externo, onChange: function (e) { updBool('nota_externo', e.target.checked); } }),
        _r('span', null, 'Los resultados marcados con (***) provienen de proveedor externo.')),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 } },
        _r('span', { style: { fontWeight: 600 } }, 'Otra observación / texto de evaluación:'),
        _r('textarea', { style: Object.assign({}, S.inputCell, { width: '100%', minHeight: 70, resize: 'vertical' }),
          value: datos.evaluacion_texto || '', placeholder: 'Escribí acá si querés agregar una observación libre',
          onChange: function (e) { upd('evaluacion_texto', e.target.value); } }))
    )
  );

  return _r('div', { style: S.sheet },
    _r('div', { style: S.twoCol }, norm11, verif),
    resSection,
    obs
  );
}

Object.assign(window, { ImpactoForm: ImpactoForm });
