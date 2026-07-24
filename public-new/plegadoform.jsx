/* ============================================================================
 * PlegadoForm — layout espejo del preinforme físico FM-063.
 *
 * Estructura:
 *   1.1 Normas / procedimientos
 *   1.2 Verificaciones y condiciones
 *   1.3 Equipamiento (filtrado por variante emic/torne/shimadzu)
 *   1.4 Resultados — tabla con tipo, dimensiones, indicaciones, ángulo, control
 *   1.5 Indicaciones / defectos (textarea)
 *   1.6 Observaciones (checkboxes)
 *   1.7 Inspección (textarea)
 *
 * Keys se mantienen idénticos al schema legado; el generator template-plegado.js
 * sigue funcionando sin cambios.
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var PLEGADO_EQ_EMIC = [
  { key: 'maquina_emic',       nombre: 'MÁQUINA DE TRACCIÓN EMIC', tagDefault: 'MM-203' },
  { key: 'mandril',            nombre: 'MANDRIL',                  tagDefault: '' },
  { key: 'calibre',            nombre: 'CALIBRE DIGITAL',          tagDefault: '' },
  { key: 'termohigro_545',     nombre: 'TERMOHIGRÓMETRO',          tagDefault: 'PCAL-545' },
  { key: 'dispositivo_plegado',nombre: 'DISPOSITIVO DE PLEGADO',   tagDefault: '' },
];
var PLEGADO_EQ_TORNE = [
  { key: 'prensa_torne',       nombre: 'PRENSA PLEGADORA TORNE Y MEC', tagDefault: 'MM-913' },
  { key: 'mandril',            nombre: 'MANDRIL',                       tagDefault: '' },
  { key: 'calibre',            nombre: 'CALIBRE DIGITAL',               tagDefault: '' },
  { key: 'termohigro_545',     nombre: 'TERMOHIGRÓMETRO',               tagDefault: 'PCAL-545' },
  { key: 'dispositivo_plegado',nombre: 'DISPOSITIVO DE PLEGADO',        tagDefault: '' },
];
var PLEGADO_EQ_SHIMADZU = [  // Neuquén — set Shimadzu
  { key: 'maquina_shimadzu',   nombre: 'MÁQUINA DE TRACCIÓN SHIMADZU',  tagDefault: 'MM-151' },
  { key: 'prensa_torne',       nombre: 'PRENSA PLEGADORA TORNE Y MEC',  tagDefault: 'MM-913' },
  { key: 'mandril',            nombre: 'MANDRIL',                       tagDefault: '' },
  { key: 'calibre',            nombre: 'CALIBRE DIGITAL',               tagDefault: '' },
  { key: 'termohigro_794',     nombre: 'TERMOHIGRÓMETRO',               tagDefault: 'MM-794' },
  { key: 'dispositivo_plegado',nombre: 'DISPOSITIVO DE PLEGADO',        tagDefault: '' },
];

function PlegadoForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  // Bug 7: al marcar un código de referencia, autocompletar "Probeta mec. según"
  // con el texto del código (editable). Sólo pisa el campo si está vacío o si
  // fue autocompletado antes (`_mecAuto`); si el usuario lo editó a mano, se respeta.
  function _codigoRefPl(d) {
    if (d.cod_asme)    return 'ASME BPVC Sección IX Ed. ' + (d.ed_asme || '…….');
    if (d.cod_aws_d11) return 'AWS D1.1/D1.1M-' + (d.ed_aws_d11 || '2020');
    if (d.cod_api1104) return 'API 1104 Ed. ' + (d.ed_api1104 || '22-2021 (E1-2023)');
    if ((d.norma_referencia || '').trim()) return d.norma_referencia.trim();
    return '';
  }
  function setCod(patch) {
    var nd = Object.assign({}, datos, patch);
    var txt = _codigoRefPl(nd);
    var out = Object.assign({}, patch);
    if (datos._mecAuto || !(datos.probeta_mecanizada_segun || '').trim()) {
      out.probeta_mecanizada_segun = txt;   // txt vacío al deschequear ⇒ limpia el campo
      out._mecAuto = true;
    }
    set(out);
  }

  var resultados = Array.isArray(datos.resultados) ? datos.resultados.slice() : [];
  function setRow(i, key, val) {
    var next = resultados.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('resultados', next);
  }
  function addRow() { set('resultados', resultados.concat([{}])); }
  function delRow(i) { set('resultados', resultados.filter(function (_, idx) { return idx !== i; })); }

  var S = {
    sheet: { width: '100%', maxWidth: 1123, background: '#fff', border: '1px solid #333', margin: '0 auto', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' },
    head: { fontSize: 11, fontWeight: 800, padding: '5px 8px', background: '#e6e6e6', borderTop: '1px solid #333', borderBottom: '1px solid #333', letterSpacing: '.3px' },
    box: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 },
    label: { display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' },
    input: { border: '1px solid #bbb', background: 'transparent', fontSize: 12, padding: '3px 5px', outline: 'none' },
    num: { textAlign: 'center' },
  };

  // ── 1.1 NORMAS ─────────────────────────────────────────────────────────
  var block11 = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.head }, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: S.box },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'ITM:'),
        _r(window.ItmInput, { tipo: 'plegado', style: Object.assign({}, S.input, { flex: 1 }), value: datos.metodologia || '', placeholder: 'ITM N°080',
          onChange: function (e) { upd('metodologia', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_iso5173, onChange: function (e) { updBool('norma_iso5173', e.target.checked); } }),
          'SEGÚN ISO 5173'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', { style: Object.assign({}, S.input, { width: 60 }), placeholder: ':2023',
          value: datos.norma_iso5173_year || '',
          onChange: function (e) { upd('norma_iso5173_year', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: !!datos.norma_astm_e190, onChange: function (e) { updBool('norma_astm_e190', e.target.checked); } }),
          'SEGÚN ASTM E190'),
        _r('span', { style: { color: '#555', fontSize: 10 } }, 'Año:'),
        _r('input', { style: Object.assign({}, S.input, { width: 60 }), placeholder: '-21',
          value: datos.norma_astm_e190_year || '',
          onChange: function (e) { upd('norma_astm_e190_year', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.cod_asme, onChange: function (e) { setCod({ cod_asme: e.target.checked }); } }),
        'ASME BPVC Sección IX Ed.',
        _r('input', { style: Object.assign({}, S.input, { width: 80 }), value: datos.ed_asme || '', placeholder: '…….',
          onChange: function (e) { setCod({ ed_asme: e.target.value }); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.cod_api1104, onChange: function (e) { setCod({ cod_api1104: e.target.checked }); } }),
        'API 1104 Ed.',
        _r('input', { style: Object.assign({}, S.input, { width: 180 }),
          value: datos.ed_api1104 || '', placeholder: '22-2021 (E1-2023)',
          onChange: function (e) { setCod({ ed_api1104: e.target.value }); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('input', { type: 'checkbox', checked: !!datos.cod_aws_d11, onChange: function (e) { setCod({ cod_aws_d11: e.target.checked }); } }),
        'AWS D1.1/D1.1M Ed.',
        _r('input', { style: Object.assign({}, S.input, { width: 120 }),
          value: datos.ed_aws_d11 || '', placeholder: '2020',
          onChange: function (e) { setCod({ ed_aws_d11: e.target.value }); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', null, 'Otro:'),
        _r(window.NormaInput, { tipo: 'plegado', categoria: 'ensayo', style: Object.assign({}, S.input, { flex: 1 }), value: datos.norma_referencia || '', placeholder: 'Empezá a escribir (ej: ASTM…)',
          onChange: function (e) { setCod({ norma_referencia: e.target.value }); } }))
    )
  );

  // ── 1.2 CONDICIONES ────────────────────────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.2  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
    _r('div', { style: S.box },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 80 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.estado_superficial, onChange: function (e) { updBool('estado_superficial', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO SUPERFICIAL DE MUESTRA'), ' OK'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'DIÁMETRO MANDRIL / ESPESORES:'),
        _r('input', { style: Object.assign({}, S.input, { width: 120 }), value: datos.diametro_mandril || '',
          onChange: function (e) { upd('diametro_mandril', e.target.value); } }),
        _r('span', null, 'mm')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ESPESOR DE PROBETA:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 80 }), value: datos.espesor_probeta || '',
          onChange: function (e) { upd('espesor_probeta', e.target.value); } }),
        _r('span', null, 'mm')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ANCHO DE PROBETA:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 80 }), value: datos.ancho_probeta || '',
          onChange: function (e) { upd('ancho_probeta', e.target.value); } }),
        _r('span', null, 'mm')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        _r('span', { style: { fontWeight: 600 } }, 'ORIENTACIÓN DE PROBETA:'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'p-orient', checked: datos.orientacion === 'Longitudinal',
            onChange: function () { upd('orientacion', 'Longitudinal'); } }), 'LONG.'),
        _r('label', { style: S.label },
          _r('input', { type: 'radio', name: 'p-orient', checked: datos.orientacion === 'Transversal',
            onChange: function () { upd('orientacion', 'Transversal'); } }), 'TRANSV.')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'Probeta mec. según:'),
        _r('input', { style: Object.assign({}, S.input, { flex: 1 }),
          value: datos.probeta_mecanizada_segun || '',
          placeholder: 'Se autocompleta con el código de referencia (editable)',
          onChange: function (e) { set({ probeta_mecanizada_segun: e.target.value, _mecAuto: false }); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'DISTANCIA ENTRE APOYOS:'),
        _r('input', { style: Object.assign({}, S.input, { flex: 1 }), value: datos.distancia_apoyos || '',
          onChange: function (e) { upd('distancia_apoyos', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ZONA DE PLEGADO:'),
        _r('input', { style: Object.assign({}, S.input, { flex: 1 }), value: datos.zona_plegado || '',
          onChange: function (e) { upd('zona_plegado', e.target.value); } }))
    )
  );

  // ── 1.3 EQUIPAMIENTO ──────────────────────────────────────────────────
  var equipos = datos.equipo === 'torne' ? PLEGADO_EQ_TORNE
              : datos.equipo === 'shimadzu' ? PLEGADO_EQ_SHIMADZU
              : PLEGADO_EQ_EMIC;
  var eqLabel = datos.equipo === 'torne' ? '— Set TORNE' : datos.equipo === 'shimadzu' ? '— Set Shimadzu' : '— Set EMIC';
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.3  EQUIPAMIENTO UTILIZADO ' + eqLabel),
    _r('div', { style: { padding: 8, display: 'flex', gap: 12, alignItems: 'center' } },
      _r('span', { style: { fontWeight: 600, fontSize: 11 } }, 'Máquina:'),
      _r('label', { style: S.label },
        _r('input', { type: 'radio', name: 'p-eq', checked: datos.equipo === 'emic' || !datos.equipo,
          onChange: function () { upd('equipo', 'emic'); } }), 'EMIC'),
      _r('label', { style: S.label },
        _r('input', { type: 'radio', name: 'p-eq', checked: datos.equipo === 'torne',
          onChange: function () { upd('equipo', 'torne'); } }), 'TORNE'),
      _r('label', { style: S.label },
        _r('input', { type: 'radio', name: 'p-eq', checked: datos.equipo === 'shimadzu',
          onChange: function () { upd('equipo', 'shimadzu'); } }), 'Shimadzu')
    ),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 24px', fontSize: 11 } },
      equipos.map(function (e) {
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

  // ── 1.4 RESULTADOS ────────────────────────────────────────────────────
  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10, minWidth: 900 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 60 } }, 'PROBETA'),
            _r('th', { colSpan: 4, style: { border: '1px solid #333', padding: 3 } }, 'TIPO DE PLEGADO'),
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 70 } }, 'LARGO (mm)'),
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 70 } }, 'ANCHO (mm)'),
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 70 } }, 'ESPESOR (mm)'),
            _r('th', { colSpan: 4, style: { border: '1px solid #333', padding: 3 } }, 'INDICACIONES'),
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 80 } }, 'ÁNGULO [°]'),
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 60 } }, 'SATISF.'),
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 30 } }, '')
          ),
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'CARA'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'RAÍZ'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'LAT.'),
            _r('th', { style: { border: '1px solid #333', padding: 3 } }, 'LONG.'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 40 } }, 'CON'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 40 } }, 'SIN'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 55 } }, 'CANT.'),
            _r('th', { style: { border: '1px solid #333', padding: 3, width: 110 } }, 'MEDIDA (mm)')
          )
        ),
        _r('tbody', null,
          resultados.map(function (r, i) {
            r = r || {};
            var tdIn = { border: '1px solid #333', padding: 0 };
            var inp = Object.assign({}, S.input, { border: 'none', width: '100%' });
            var isTipo = function (v) { return r.tipo && String(r.tipo).toUpperCase() === v; };
            var isInd = function (v) { return r.resultado && String(r.resultado).toLowerCase().indexOf(v) >= 0; };
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', textAlign: 'center', fontWeight: 700, background: '#fafafa' } },
                _r('input', { style: Object.assign({}, inp, { textAlign: 'center', fontWeight: 700 }), value: r.probeta || String(i + 1),
                  onChange: function (e) { setRow(i, 'probeta', e.target.value); } })),
              // Tipo (Cara/Raíz/Lat/Long)
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('input', { type: 'radio', name: 't' + i, checked: isTipo('CARA'), onChange: function () { setRow(i, 'tipo', 'Cara'); } })),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('input', { type: 'radio', name: 't' + i, checked: isTipo('RAÍZ') || isTipo('RAIZ'), onChange: function () { setRow(i, 'tipo', 'Raíz'); } })),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('input', { type: 'radio', name: 't' + i, checked: isTipo('LATERAL') || isTipo('LAT'), onChange: function () { setRow(i, 'tipo', 'Lateral'); } })),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('input', { type: 'radio', name: 't' + i, checked: isTipo('LONGITUDINAL') || isTipo('LONG'), onChange: function () { setRow(i, 'tipo', 'Longitudinal'); } })),
              // Dimensiones
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.largo || '', onChange: function (e) { setRow(i, 'largo', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.ancho || '', onChange: function (e) { setRow(i, 'ancho', e.target.value); } })),
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.espesor || '', onChange: function (e) { setRow(i, 'espesor', e.target.value); } })),
              // Con / Sin indicaciones
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('input', { type: 'radio', name: 'ind' + i, checked: isInd('con'), onChange: function () { setRow(i, 'resultado', 'Con indicaciones'); } })),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('input', { type: 'radio', name: 'ind' + i, checked: isInd('sin'), onChange: function () { setRow(i, 'resultado', 'Sin indicaciones'); } })),
              // Cantidad de indicaciones y medida (mm) — sólo tienen sentido cuando
              // el resultado de esta probeta es "Con indicaciones"; si es "Sin",
              // los inputs quedan deshabilitados y en gris.
              _r('td', { style: tdIn },
                _r('input', {
                  style: Object.assign({}, inp, S.num, isInd('con') ? {} : { background: '#f4f4f4', color: '#aaa' }),
                  value: r.cant_indicaciones || '',
                  placeholder: isInd('con') ? '1' : '',
                  disabled: !isInd('con'),
                  onChange: function (e) { setRow(i, 'cant_indicaciones', e.target.value); }
                })
              ),
              _r('td', { style: tdIn },
                _r('input', {
                  style: Object.assign({}, inp, isInd('con') ? {} : { background: '#f4f4f4', color: '#aaa' }),
                  value: r.longitud_mm || '',
                  placeholder: isInd('con') ? '0.5; 1.2' : '',
                  disabled: !isInd('con'),
                  title: 'Separar múltiples medidas con ";" o ","',
                  onChange: function (e) { setRow(i, 'longitud_mm', e.target.value); }
                })
              ),
              // Ángulo
              _r('td', { style: tdIn }, _r('input', { style: Object.assign({}, inp, S.num), value: r.angulo || '', onChange: function (e) { setRow(i, 'angulo', e.target.value); } })),
              // Satisfactorio
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('input', { type: 'checkbox', checked: !!r.satisfactorio, onChange: function (e) { setRow(i, 'satisfactorio', e.target.checked); } })),
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
      _r('div', { style: { marginTop: 6, fontSize: 10, fontWeight: 700, textDecoration: 'underline' } },
        'NOTA: Las probetas ensayadas en metal base se encuentran fuera de parámetro acreditado.')
    )
  );

  // ── 1.5 INDICACIONES / DEFECTOS ────────────────────────────────────────
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.5  INDICACIONES / DEFECTOS'),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 72, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.observaciones_extra || '', placeholder: 'Descripción de indicaciones o defectos observados…',
        onChange: function (e) { upd('observaciones_extra', e.target.value); } })
    )
  );

  // ── 1.6 OBSERVACIONES ─────────────────────────────────────────────────
  var block16 = _r('div', null,
    _r('div', { style: S.head }, '1.6  OBSERVACIONES / EVALUACIÓN'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, lineHeight: 1.4 } },
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_evaluaciones, onChange: function (e) { updBool('nota_evaluaciones', e.target.checked); } }),
        _r('span', null, 'Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_no_conforme, onChange: function (e) { updBool('nota_no_conforme', e.target.checked); } }),
        _r('span', null, 'El ítem marcado con (**) corresponde a un trabajo no conforme.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_mecanizada, onChange: function (e) { updBool('nota_mecanizada', e.target.checked); } }),
        _r('span', null, 'La probeta fue mecanizada por el cliente.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_incertidumbre, onChange: function (e) { updBool('nota_incertidumbre', e.target.checked); } }),
        _r('span', null, 'El cliente desea incorporar el dato de incertidumbre.')),
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 }, checked: !!datos.nota_externo, onChange: function (e) { updBool('nota_externo', e.target.checked); } }),
        _r('span', null, 'Los resultados marcados con (***) provienen de proveedor externo.'))
    )
  );

  // ── 1.7 INSPECCIÓN ─────────────────────────────────────────────────────
  var block17 = _r('div', null,
    _r('div', { style: S.head }, '1.7  INSPECCIÓN'),
    _r('div', { style: { padding: 8, display: 'flex', gap: 6, alignItems: 'flex-start' } },
      _r('span', { style: { fontWeight: 700, fontSize: 11, paddingTop: 6 } }, 'POR:'),
      _r('textarea', { style: { flex: 1, minHeight: 56, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.inspeccion_por || '', placeholder: 'Datos de la inspección…',
        onChange: function (e) { upd('inspeccion_por', e.target.value); } })
    )
  );

  return _r('div', { style: S.sheet },
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.4fr' } }, block11, block12),
    block13, block14, block15, block16, block17
  );
}

Object.assign(window, { PlegadoForm: PlegadoForm });
