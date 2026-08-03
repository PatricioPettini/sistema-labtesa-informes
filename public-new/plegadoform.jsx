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

// Defaults precargados desde informes reales de referencia
// (server/agents/informes-referencia/plegado/*.docx). Se eligió el TAG más
// frecuente para cada equipo por variante. El técnico puede editarlo si el
// ensayo particular usa otro (por calibración cruzada, etc.).
var PLEGADO_EQ_EMIC = [
  { key: 'maquina_emic',       nombre: 'MÁQUINA DE TRACCIÓN EMIC', tagDefault: 'MM-203' },
  { key: 'mandril',            nombre: 'MANDRIL',                  tagDefault: 'MM-803' },
  { key: 'calibre',            nombre: 'CALIBRE DIGITAL',          tagDefault: 'MM-571' },
  { key: 'termohigro_545',     nombre: 'TERMOHIGRÓMETRO',          tagDefault: 'PCAL-545' },
  { key: 'dispositivo_plegado',nombre: 'DISPOSITIVO DE PLEGADO',   tagDefault: 'MM-779' },
];
var PLEGADO_EQ_TORNE = [
  { key: 'prensa_torne',       nombre: 'PRENSA PLEGADORA TORNE Y MEC', tagDefault: 'MM-913' },
  { key: 'mandril',            nombre: 'MANDRIL',                       tagDefault: 'MM-930' },
  { key: 'calibre',            nombre: 'CALIBRE DIGITAL',               tagDefault: 'MM-694' },
  { key: 'termohigro_545',     nombre: 'TERMOHIGRÓMETRO',               tagDefault: 'MM-794' },
  { key: 'dispositivo_plegado',nombre: 'DISPOSITIVO DE PLEGADO',        tagDefault: 'MM-779' },
];
var PLEGADO_EQ_SHIMADZU = [  // Neuquén — set Shimadzu (mismo mandril/calibre que TORNE)
  { key: 'maquina_shimadzu',   nombre: 'MÁQUINA DE TRACCIÓN SHIMADZU',  tagDefault: 'MM-151' },
  { key: 'prensa_torne',       nombre: 'PRENSA PLEGADORA TORNE Y MEC',  tagDefault: 'MM-913' },
  { key: 'mandril',            nombre: 'MANDRIL',                       tagDefault: 'MM-930' },
  { key: 'calibre',            nombre: 'CALIBRE DIGITAL',               tagDefault: 'MM-694' },
  { key: 'termohigro_794',     nombre: 'TERMOHIGRÓMETRO',               tagDefault: 'MM-794' },
  { key: 'dispositivo_plegado',nombre: 'DISPOSITIVO DE PLEGADO',        tagDefault: 'MM-779' },
];

function PlegadoForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  // ── Contexto multi-OT (idéntica lógica que tracción) ────────────────────
  // otNroActual  = la OT del ensayo (donde estamos parados).
  // otsDisponibles = todas las OTs hermanas de la misma solicitud (incluida la actual).
  //                  Se usa para poblar el selector de OT por probeta y para
  //                  el tab-selector de textos por OT (obs/eval/nota).
  var otNroActual = props.otNro || '';
  var otActualObj = otNroActual && window.LabStore && window.LabStore.getOt
    ? window.LabStore.getOt(otNroActual) : null;
  var solActual = otActualObj && otActualObj.nro_solicitud;
  var otsDisponibles = (solActual && window.LabStore.listOtsBySolicitud)
    ? window.LabStore.listOtsBySolicitud(solActual)
    : (otActualObj ? [otActualObj] : []);

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

  // ── Multi-OT: botón "Copiar equipamiento a otras OT" ─────────────────────
  // Escribe en datos.condiciones_por_ot[<destino>] los campos equipo /
  // equipamiento / equipamiento_tags / otros_equipos. El saver los detecta
  // como "overrides raíz" y los aplica sobre los ensayos hermanos existentes.
  var multiOtPl = otsDisponibles.length > 1;
  var otNroActualStrPl = String(otNroActual || '');
  var _copyKeyPl = React.useState(''); var copyOpenKeyPl = _copyKeyPl[0], setCopyOpenKeyPl = _copyKeyPl[1];
  var _copyDestPl = React.useState([]); var copyDestGenPl = _copyDestPl[0], setCopyDestGenPl = _copyDestPl[1];
  function copiarCamposPlAOts(destinos, campos) {
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
  }
  function botonCopiarSeccionPl(claveUnica, etiqueta, camposList, descripcion) {
    if (!multiOtPl) return null;
    var abierto = copyOpenKeyPl === claveUnica;
    return _r('div', { style: { position: 'relative', display: 'inline-block' } },
      _r('button', {
        type: 'button',
        onClick: function () { setCopyDestGenPl([]); setCopyOpenKeyPl(abierto ? '' : claveUnica); },
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
          otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrPl; }).map(function (o) {
            var nro = String(o.nro_ot);
            var checked = copyDestGenPl.indexOf(nro) >= 0;
            return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
              _r('input', { type: 'checkbox', checked: checked,
                onChange: function () {
                  setCopyDestGenPl(checked ? copyDestGenPl.filter(function (n) { return n !== nro; }) : copyDestGenPl.concat([nro]));
                } }),
              _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
          })),
        _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          _r('button', { type: 'button', onClick: function () { setCopyOpenKeyPl(''); },
            style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } }, 'Cancelar'),
          _r('button', { type: 'button',
            onClick: function () {
              var destinos = copyDestGenPl.slice();
              if (destinos.length === 0) {
                destinos = otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrPl; }).map(function (o) { return String(o.nro_ot); });
              }
              copiarCamposPlAOts(destinos, camposList);
              setCopyOpenKeyPl(''); setCopyDestGenPl([]);
            },
            style: { border: '1px solid #0969da', background: '#0969da', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
      ) : null
    );
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
  // La norma de ensayo y el código de referencia se cargan ahora en la sección
  // 1.3 (por OT) con desplegables autopoblados del catálogo — misma UX que
  // tracción. Acá solo queda la metodología (ITM).
  var block11 = _r('div', { style: { borderRight: '1px solid #333' } },
    _r('div', { style: S.head }, '1.1  METODOLOGÍA DE ENSAYO'),
    _r('div', { style: S.box },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
        _r('span', { style: { fontWeight: 600 } }, 'ITM:'),
        _r(window.ItmInput, { tipo: 'plegado', style: Object.assign({}, S.input, { flex: 1 }), value: datos.metodologia || '', placeholder: 'ITM N°080',
          onChange: function (e) { upd('metodologia', e.target.value); } }))
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
      // Orientación de probeta y "Probeta mec. según" se movieron a la
      // sección 1.3 (por OT) — ver más abajo.
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
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, '1.4  EQUIPAMIENTO UTILIZADO ' + eqLabel),
      // "equipo" determina qué SET se muestra (EMIC/TORNE/Shimadzu). Si no
      // lo copiamos, la hermana queda con equipos del set opuesto y los
      // checkboxes no aparecen (mismo bug que en tracción).
      botonCopiarSeccionPl('equip_14', 'Copiar equipamiento a otras OT',
        ['equipo', 'equipamiento', 'equipamiento_tags', 'otros_equipos'],
        'Copia set (EMIC/TORNE/Shimadzu), equipos tildados, sus TAGs y "otros equipos".')
    ),
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
    _r('div', { style: S.head }, '1.5  RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, overflowX: 'auto' } },
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10, minWidth: 900 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 60 } }, 'PROBETA'),
            // Columna OT: solo aparece si hay OTs hermanas (solicitud multi-OT).
            otsDisponibles.length > 1
              ? _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 3, width: 90 } }, 'OT')
              : null,
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
            var otOverride = String(r.nro_ot_override || '').trim();
            var otEffective = otOverride || otNroActual;
            var esOtra = otOverride && otOverride !== otNroActual;
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', textAlign: 'center', fontWeight: 700, background: '#fafafa' } },
                _r('input', { style: Object.assign({}, inp, { textAlign: 'center', fontWeight: 700 }), value: r.probeta || String(i + 1),
                  onChange: function (e) { setRow(i, 'probeta', e.target.value); } })),
              // Selector de OT — solo aparece si hay OTs hermanas. Al cambiarlo,
              // esta probeta se transfiere al ensayo de plegado de la OT destino
              // al momento de guardar (via saveEnsayoPlegadoMultiOt).
              otsDisponibles.length > 1
                ? _r('td', { style: { border: '1px solid #333', textAlign: 'center', padding: 0, background: esOtra ? '#fff8e5' : '#fff' } },
                    _r('select', {
                      value: otEffective,
                      onChange: function (e) {
                        var v = String(e.target.value || '').trim();
                        if (v === otNroActual) v = '';
                        setRow(i, 'nro_ot_override', v);
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
    _r('div', { style: S.head }, '1.6  INDICACIONES / DEFECTOS'),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 72, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.observaciones_extra || '', placeholder: 'Descripción de indicaciones o defectos observados…',
        onChange: function (e) { upd('observaciones_extra', e.target.value); } })
    )
  );

  // ── 1.6 OBSERVACIONES ─────────────────────────────────────────────────
  var block16 = _r('div', null,
    _r('div', { style: S.head }, '1.7  OBSERVACIONES / EVALUACIÓN'),
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
    _r('div', { style: S.head }, '1.8  INSPECCIÓN'),
    _r('div', { style: { padding: 8, display: 'flex', gap: 6, alignItems: 'flex-start' } },
      _r('span', { style: { fontWeight: 700, fontSize: 11, paddingTop: 6 } }, 'POR:'),
      _r('textarea', { style: { flex: 1, minHeight: 56, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.inspeccion_por || '', placeholder: 'Datos de la inspección…',
        onChange: function (e) { upd('inspeccion_por', e.target.value); } })
    )
  );

  // ── 1.8/1.9/1.10 — OBSERVACIÓN / EVALUACIÓN / NOTA por OT ──────────────
  // Igual patrón que tracción: cada OT tiene su propio texto (obs/eval/nota)
  // guardado en `datos.textos_por_ot[nro]`. Tabs para cambiar de OT + botón
  // "copiar a otras OTs" (one-shot).
  //
  // OTs "en el ensayo": incluye la OT actual + las que aparecen como override
  // en las probetas + todas las hermanas de la misma solicitud (aunque todavía
  // no tengan probetas asignadas). Así el técnico puede preconfigurar las
  // condiciones específicas de cada hermana ANTES de dividir probetas.
  var otsEnEnsayo = (function () {
    var set = {};
    (resultados || []).forEach(function (r) {
      var over = String((r && r.nro_ot_override) || '').trim();
      var dest = over || String(otNroActual || '');
      if (dest) set[dest] = true;
    });
    // Incluir todas las hermanas de la solicitud.
    (otsDisponibles || []).forEach(function (o) {
      var n = String(o.nro_ot || '');
      if (n) set[n] = true;
    });
    var list = Object.keys(set);
    if (list.length === 0 && otNroActual) list.push(String(otNroActual));
    // Ordenar: la actual primero, resto por número ascendente.
    list.sort(function (a, b) {
      if (a === otNroActual) return -1;
      if (b === otNroActual) return 1;
      return String(a).localeCompare(String(b));
    });
    return list;
  })();
  var textosPorOt = (datos && datos.textos_por_ot) || {};
  var _otTx = React.useState(function () { return otNroActual || (otsEnEnsayo[0] || ''); });
  var otActivaTextos = _otTx[0], setOtActivaTextos = _otTx[1];
  if (otsEnEnsayo.length > 0 && otsEnEnsayo.indexOf(otActivaTextos) < 0) {
    otActivaTextos = otNroActual || otsEnEnsayo[0];
  }
  var _copyOpen = React.useState(''); var copyOpen = _copyOpen[0], setCopyOpen = _copyOpen[1];
  var _copyDest = React.useState([]); var copyDest = _copyDest[0], setCopyDest = _copyDest[1];

  function getTextoOt(nroOt, key) {
    var m = textosPorOt[nroOt];
    if (m && m[key] !== undefined) return m[key];
    if (nroOt === otNroActual) return datos[key];
    return key.indexOf('tiene_') === 0 ? false : '';
  }
  function setTextoOt(nroOt, key, val) {
    var mapa = Object.assign({}, textosPorOt);
    mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
    mapa[nroOt][key] = val;
    if (nroOt === otNroActual) {
      var patch = { textos_por_ot: mapa };
      patch[key] = val;
      set(patch);
    } else {
      set('textos_por_ot', mapa);
    }
  }
  function copiarTextoAOts(fromNro, toNros, flagKey, textoKey) {
    if (!toNros || toNros.length === 0) return;
    var mapa = Object.assign({}, textosPorOt);
    var flagVal = getTextoOt(fromNro, flagKey);
    var textoVal = getTextoOt(fromNro, textoKey);
    var pisaActual = false;
    toNros.forEach(function (nroOt) {
      mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
      mapa[nroOt][flagKey] = flagVal;
      mapa[nroOt][textoKey] = textoVal;
      if (nroOt === otNroActual) pisaActual = true;
    });
    if (pisaActual) {
      var patch = { textos_por_ot: mapa };
      patch[flagKey] = flagVal;
      patch[textoKey] = textoVal;
      set(patch);
    } else {
      set('textos_por_ot', mapa);
    }
  }

  var selectorOtTextos = otsEnEnsayo.length > 1
    ? _r('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '8px 12px', background: '#fff8e5',
          border: '1px solid #e0c060', borderTop: '1px solid #333', fontSize: 11,
        },
      },
        _r('span', { style: { fontWeight: 700, color: '#8a5a00', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em' } },
          'Editando OT:'),
        _r('div', { style: { display: 'inline-flex', border: '1px solid #d0d7de', borderRadius: 4, overflow: 'hidden', background: '#fff' } },
          otsEnEnsayo.map(function (nro, i) {
            var activa = nro === otActivaTextos;
            var esLaActual = nro === otNroActual;
            return _r('button', {
              key: nro, type: 'button',
              onClick: function () { setOtActivaTextos(nro); },
              style: {
                border: 'none',
                borderLeft: i === 0 ? 'none' : '1px solid #d0d7de',
                background: activa ? '#0969da' : '#fff',
                color: activa ? '#fff' : '#24292f',
                padding: '5px 12px', fontSize: 12,
                fontWeight: activa ? 700 : 500,
                cursor: activa ? 'default' : 'pointer',
                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              },
            }, nro,
              esLaActual
                ? _r('span', { style: { fontSize: 9, opacity: 0.8, fontFamily: 'system-ui' } }, '· actual')
                : null);
          })),
        _r('span', { style: { fontSize: 10, color: '#8a5a00' } },
          'Cada OT tiene sus propios textos.'))
    : null;

  function popoverCopiar(clave, flagKey, textoKey) {
    if (copyOpen !== clave) return null;
    var otrasOts = otsEnEnsayo.filter(function (n) { return n !== otActivaTextos; });
    if (otrasOts.length === 0) return null;
    return _r('div', {
      style: {
        position: 'absolute', zIndex: 20, top: '100%', right: 0, marginTop: 4,
        background: '#fff', border: '1px solid #d0d7de', borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10,
        minWidth: 220, fontSize: 11,
      },
    },
      _r('div', { style: { fontWeight: 700, marginBottom: 6, fontSize: 11, color: '#24292f' } }, 'Copiar a otras OTs'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
        otrasOts.map(function (nro) {
          var checked = copyDest.indexOf(nro) >= 0;
          return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 4px', borderRadius: 3 } },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function () {
                setCopyDest(checked
                  ? copyDest.filter(function (n) { return n !== nro; })
                  : copyDest.concat([nro]));
              } }),
            _r('span', { style: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' } }, nro),
            nro === otNroActual
              ? _r('span', { style: { fontSize: 10, color: '#8a5a00' } }, '(actual)')
              : null);
        })),
      _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
        _r('button', { type: 'button',
          onClick: function () { setCopyOpen(''); setCopyDest([]); },
          style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' },
        }, 'Cancelar'),
        _r('button', { type: 'button',
          disabled: copyDest.length === 0,
          onClick: function () {
            copiarTextoAOts(otActivaTextos, copyDest, flagKey, textoKey);
            setCopyOpen(''); setCopyDest([]);
          },
          style: {
            border: '1px solid #0969da',
            background: copyDest.length === 0 ? '#cbd5e1' : '#0969da',
            color: '#fff', padding: '3px 10px', borderRadius: 3, fontSize: 11,
            cursor: copyDest.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600,
          },
        }, 'Copiar')));
  }

  function seccionOpcional(numero, titulo, flagKey, textoKey, placeholder) {
    var activa = !!getTextoOt(otActivaTextos, flagKey);
    var clave = textoKey;
    return _r('div', null,
      _r('div', { style: S.head },
        _r('label', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 800 } },
          _r('input', { type: 'checkbox', checked: activa,
            onChange: function (e) { setTextoOt(otActivaTextos, flagKey, e.target.checked); } }),
          _r('span', null, numero + '  ' + titulo),
          otsEnEnsayo.length > 1
            ? _r('span', { style: { fontSize: 10, color: '#8a5a00', fontWeight: 600, marginLeft: 6 } }, '· OT ' + otActivaTextos)
            : null)),
      activa ? _r('div', { style: { padding: 8, position: 'relative' } },
        _r('textarea', { style: { width: '100%', minHeight: 70, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: getTextoOt(otActivaTextos, textoKey) || '', placeholder: placeholder,
          onChange: function (e) { setTextoOt(otActivaTextos, textoKey, e.target.value); } }),
        otsEnEnsayo.length > 1
          ? _r('div', { style: { position: 'relative', display: 'flex', justifyContent: 'flex-end', marginTop: 4 } },
              _r('button', { type: 'button',
                title: 'Copiar este texto a otras OTs de la solicitud',
                onClick: function () {
                  if (copyOpen === clave) { setCopyOpen(''); setCopyDest([]); }
                  else { setCopyOpen(clave); setCopyDest([]); }
                },
                style: {
                  border: '1px solid #d0d7de',
                  background: copyOpen === clave ? '#f6f8fa' : '#fff',
                  color: '#0969da', padding: '3px 10px', borderRadius: 3,
                  fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                },
              }, '⇪ Copiar a otras OTs…'),
              popoverCopiar(clave, flagKey, textoKey))
          : null
      ) : null
    );
  }

  var blockObservacion = seccionOpcional('1.9',  'OBSERVACIÓN', 'tiene_observacion', 'observacion_texto', 'Observación del ensayo…');
  var blockEvaluacion  = seccionOpcional('1.10', 'EVALUACIÓN',  'tiene_evaluacion',  'evaluacion_texto',  'Evaluación del ensayo…');
  var blockNota        = seccionOpcional('1.11', 'NOTA',        'tiene_nota',        'nota_texto',        'Nota adicional…');

  // ── 1.11 CONDICIONES ESPECÍFICAS POR OT ──────────────────────────────
  // Cuando el ensayo tiene múltiples OTs, cada OT puede tener sus propios
  // valores para norma / código / orientación / probeta mecanizada. Si no
  // se completa acá, se usa el valor global de las secciones 1.1 y 1.2.
  var condPorOt = (datos && datos.condiciones_por_ot) || {};
  function getCondOt(nroOt, key) {
    var m = condPorOt[nroOt];
    if (m && m[key] !== undefined && m[key] !== '') return m[key];
    return '';
  }
  function setCondOt(nroOt, key, val) {
    var mapa = Object.assign({}, condPorOt);
    mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
    if (val === '' || val == null) delete mapa[nroOt][key];
    else mapa[nroOt][key] = val;
    if (Object.keys(mapa[nroOt]).length === 0) delete mapa[nroOt];
    set('condiciones_por_ot', mapa);
  }
  function copiarCondAOts(fromNro, toNros, keys) {
    if (!toNros || toNros.length === 0) return;
    var mapa = Object.assign({}, condPorOt);
    var src = mapa[fromNro] || {};
    toNros.forEach(function (nroOt) {
      mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
      keys.forEach(function (k) {
        if (src[k] !== undefined && src[k] !== '') mapa[nroOt][k] = src[k];
        else delete mapa[nroOt][k];
      });
    });
    set('condiciones_por_ot', mapa);
  }

  var _copyCondOpen = React.useState(false);
  var copyCondOpen = _copyCondOpen[0], setCopyCondOpen = _copyCondOpen[1];
  var _copyCondDest = React.useState([]);
  var copyCondDest = _copyCondDest[0], setCopyCondDest = _copyCondDest[1];

  var COND_KEYS = ['norma_ensayo_ot', 'codigo_referencia_ot', 'orientacion_ot', 'probeta_mec_ot'];

  var multiOt = otsEnEnsayo.length > 1;
  var blockCondPorOt = _r('div', null,
    _r('div', { style: S.head },
      _r('span', null, '1.3  CONDICIONES DE ENSAYO'),
      multiOt
        ? _r('span', { style: { fontSize: 10, color: '#8a5a00', fontWeight: 600, marginLeft: 6 } }, '· OT ' + otActivaTextos)
        : null
    ),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 } },
      // Norma de ensayo — desplegable autopoblado desde el catálogo (excluye
      // códigos de referencia ASME/API/AWS). Misma UX que tracción.
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 160 } }, 'Norma de ensayo:'),
        typeof window.NormaInput === 'function'
          ? _r(window.NormaInput, {
              tipo: 'plegado', categoria: 'ensayo',
              style: Object.assign({}, S.input, { flex: 1 }),
              value: getCondOt(otActivaTextos, 'norma_ensayo_ot') || '',
              placeholder: 'Ej: ISO 5173:2023 · ASTM E190-21',
              onChange: function (e) { setCondOt(otActivaTextos, 'norma_ensayo_ot', e.target.value); },
            })
          : _r('input', { style: Object.assign({}, S.input, { flex: 1 }),
              value: getCondOt(otActivaTextos, 'norma_ensayo_ot') || '',
              onChange: function (e) { setCondOt(otActivaTextos, 'norma_ensayo_ot', e.target.value); } })),
      // Código de referencia — desplegable autopoblado (solo ASME/API/AWS).
      // Al escribir/elegir un código, auto-completa "Probeta mec. según" con
      // el mismo texto (respeta ediciones manuales via flag _probeta_mec_auto).
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 160 } }, 'Código de referencia:'),
        (function () {
          function onCodigoChange(nuevoVal) {
            var mapa = Object.assign({}, condPorOt);
            var ot = otActivaTextos;
            var cur = Object.assign({}, mapa[ot] || {});
            var probActual = String(cur.probeta_mec_ot || '').trim();
            var mecAuto = !!cur._probeta_mec_auto;
            cur.codigo_referencia_ot = nuevoVal;
            // Auto-fill "Probeta mec. según" si está vacío o si el valor
            // actual fue auto-completado en un ciclo previo (no lo tocó el
            // técnico).
            if (!probActual || mecAuto) {
              cur.probeta_mec_ot = nuevoVal;
              cur._probeta_mec_auto = true;
            }
            if (!nuevoVal) delete cur.codigo_referencia_ot;
            if (Object.keys(cur).length === 0) delete mapa[ot];
            else mapa[ot] = cur;
            set('condiciones_por_ot', mapa);
          }
          return typeof window.NormaInput === 'function'
            ? _r(window.NormaInput, {
                tipo: 'plegado', categoria: 'referencia',
                style: Object.assign({}, S.input, { flex: 1 }),
                value: getCondOt(otActivaTextos, 'codigo_referencia_ot') || '',
                placeholder: 'Ej: ASME BPVC Sección IX Ed. 2025 · API 1104 Ed. 22-2021',
                onChange: function (e) { onCodigoChange(e.target.value); },
              })
            : _r('input', { style: Object.assign({}, S.input, { flex: 1 }),
                value: getCondOt(otActivaTextos, 'codigo_referencia_ot') || '',
                onChange: function (e) { onCodigoChange(e.target.value); } });
        })()),
      // Orientación de probeta — click en la opción ya seleccionada la
      // deselecciona (queda sin orientación → línea no se emite en el Word).
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
        _r('span', { style: { fontWeight: 600, minWidth: 160 } }, 'Orientación de probeta:'),
        _r('label', { style: Object.assign({}, S.label, { cursor: 'pointer' }) },
          _r('input', { type: 'checkbox',
            checked: getCondOt(otActivaTextos, 'orientacion_ot') === 'Longitudinal',
            onChange: function () {
              var actual = getCondOt(otActivaTextos, 'orientacion_ot');
              setCondOt(otActivaTextos, 'orientacion_ot', actual === 'Longitudinal' ? '' : 'Longitudinal');
            } }),
          'Longitudinal'),
        _r('label', { style: Object.assign({}, S.label, { cursor: 'pointer' }) },
          _r('input', { type: 'checkbox',
            checked: getCondOt(otActivaTextos, 'orientacion_ot') === 'Transversal',
            onChange: function () {
              var actual = getCondOt(otActivaTextos, 'orientacion_ot');
              setCondOt(otActivaTextos, 'orientacion_ot', actual === 'Transversal' ? '' : 'Transversal');
            } }),
          'Transversal'),
        getCondOt(otActivaTextos, 'orientacion_ot')
          ? _r('button', { type: 'button', title: 'Limpiar orientación',
              onClick: function () { setCondOt(otActivaTextos, 'orientacion_ot', ''); },
              style: {
                border: '1px solid #d0d7de', background: '#fff', padding: '2px 8px',
                borderRadius: 3, fontSize: 10, cursor: 'pointer', color: '#666', marginLeft: 4,
              },
            }, 'Limpiar')
          : null),
      // Probeta mecanizada según — desplegable ídem código. Editar acá marca
      // el campo como "manual" (no auto-completa después de ediciones).
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 160 } }, 'Probeta mec. según:'),
        (function () {
          function onProbetaChange(nuevoVal) {
            var mapa = Object.assign({}, condPorOt);
            var ot = otActivaTextos;
            var cur = Object.assign({}, mapa[ot] || {});
            cur.probeta_mec_ot = nuevoVal;
            // Edición manual → marcar como no-auto para que futuros cambios
            // de "Código de referencia" no lo pisen.
            cur._probeta_mec_auto = false;
            if (!nuevoVal) { delete cur.probeta_mec_ot; delete cur._probeta_mec_auto; }
            if (Object.keys(cur).length === 0) delete mapa[ot];
            else mapa[ot] = cur;
            set('condiciones_por_ot', mapa);
          }
          return typeof window.NormaInput === 'function'
            ? _r(window.NormaInput, {
                tipo: 'plegado', categoria: 'referencia',
                style: Object.assign({}, S.input, { flex: 1 }),
                value: getCondOt(otActivaTextos, 'probeta_mec_ot') || '',
                placeholder: 'Se auto-completa con el código de referencia (editable)',
                onChange: function (e) { onProbetaChange(e.target.value); },
              })
            : _r('input', { style: Object.assign({}, S.input, { flex: 1 }),
                value: getCondOt(otActivaTextos, 'probeta_mec_ot') || '',
                onChange: function (e) { onProbetaChange(e.target.value); } });
        })()),
      // Botón "Copiar a otras OTs" — solo si hay hermanas.
      multiOt ? _r('div', { style: { position: 'relative', display: 'flex', justifyContent: 'flex-end', marginTop: 4 } },
        _r('button', { type: 'button',
          onClick: function () { setCopyCondOpen(!copyCondOpen); setCopyCondDest([]); },
          style: {
            border: '1px solid #d0d7de', background: copyCondOpen ? '#f6f8fa' : '#fff',
            color: '#0969da', padding: '3px 10px', borderRadius: 3, fontSize: 11,
            cursor: 'pointer', fontWeight: 600,
          },
        }, '⇪ Copiar condiciones a otras OTs…'),
        copyCondOpen ? _r('div', {
          style: {
            position: 'absolute', zIndex: 20, top: '100%', right: 0, marginTop: 4,
            background: '#fff', border: '1px solid #d0d7de', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', padding: 10, minWidth: 220, fontSize: 11,
          },
        },
          _r('div', { style: { fontWeight: 700, marginBottom: 6 } }, 'Copiar las 4 condiciones a:'),
          _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
            otsEnEnsayo.filter(function (n) { return n !== otActivaTextos; }).map(function (nro) {
              var checked = copyCondDest.indexOf(nro) >= 0;
              return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
                _r('input', { type: 'checkbox', checked: checked,
                  onChange: function () {
                    setCopyCondDest(checked
                      ? copyCondDest.filter(function (n) { return n !== nro; })
                      : copyCondDest.concat([nro]));
                  } }),
                _r('span', { style: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' } }, nro));
            })),
          _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
            _r('button', { type: 'button',
              onClick: function () { setCopyCondOpen(false); setCopyCondDest([]); },
              style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer' } }, 'Cancelar'),
            _r('button', { type: 'button', disabled: copyCondDest.length === 0,
              onClick: function () {
                copiarCondAOts(otActivaTextos, copyCondDest, COND_KEYS);
                setCopyCondOpen(false); setCopyCondDest([]);
              },
              style: {
                border: '1px solid #0969da',
                background: copyCondDest.length === 0 ? '#cbd5e1' : '#0969da',
                color: '#fff', padding: '3px 10px', borderRadius: 3, fontSize: 11,
                cursor: copyCondDest.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 600,
              } }, 'Copiar'))
        ) : null) : null
    )
  );

  return _r('div', { style: S.sheet },
    _r('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.4fr' } }, block11, block12),
    // Selector de OT (tab bar) + 1.3 Condiciones específicas por OT: van
    // arriba de Equipamiento (1.4) para que el técnico primero vea/edite las
    // condiciones específicas de cada OT y después el equipamiento común.
    selectorOtTextos,
    blockCondPorOt,
    block13, block14, block15, block16, block17,
    blockObservacion, blockEvaluacion, blockNota
  );
}

Object.assign(window, { PlegadoForm: PlegadoForm });
