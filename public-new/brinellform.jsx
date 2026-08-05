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

  // ── Multi-OT: mismo patrón que plegado / tracción ──────────────────────────
  // Permite copiar normas (1.1), condiciones (1.2) y equipamiento (1.3) a las
  // OTs hermanas de la misma solicitud. Se escribe en datos.condiciones_por_ot
  // y el saver (saveEnsayoBrinellMultiOt) crea o actualiza el ensayo brinell
  // de la OT destino con esos overrides. Las mediciones NO se propagan — son
  // propias de cada OT.
  var otNroActual = props.otNro || '';
  var otActualObj = otNroActual && window.LabStore && window.LabStore.getOt
    ? window.LabStore.getOt(otNroActual) : null;
  var solActual = otActualObj && otActualObj.nro_solicitud;
  var otsDisponibles = (solActual && window.LabStore.listOtsBySolicitud)
    ? window.LabStore.listOtsBySolicitud(solActual)
    : (otActualObj ? [otActualObj] : []);
  var multiOtBr = otsDisponibles.length > 1;
  var otNroActualStrBr = String(otNroActual || '');
  var _copyKeyBr = React.useState(''); var copyOpenKeyBr = _copyKeyBr[0], setCopyOpenKeyBr = _copyKeyBr[1];
  var _copyDestBr = React.useState([]); var copyDestGenBr = _copyDestBr[0], setCopyDestGenBr = _copyDestBr[1];
  function copiarCamposBrAOts(destinos, campos) {
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
    if (window._labToastOk) {
      window._labToastOk('Copiado a OT ' + destinos.join(', ') + ' — se aplica al guardar');
    }
  }
  function botonCopiarSeccionBr(claveUnica, etiqueta, camposList, descripcion) {
    if (!multiOtBr) return null;
    var abierto = copyOpenKeyBr === claveUnica;
    return _r('div', { style: { position: 'relative', display: 'inline-block' } },
      _r('button', {
        type: 'button',
        onClick: function () { setCopyDestGenBr([]); setCopyOpenKeyBr(abierto ? '' : claveUnica); },
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
          otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrBr; }).map(function (o) {
            var nro = String(o.nro_ot);
            var checked = copyDestGenBr.indexOf(nro) >= 0;
            return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
              _r('input', { type: 'checkbox', checked: checked,
                onChange: function () {
                  setCopyDestGenBr(checked ? copyDestGenBr.filter(function (n) { return n !== nro; }) : copyDestGenBr.concat([nro]));
                } }),
              _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
          })),
        _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          _r('button', { type: 'button', onClick: function () { setCopyOpenKeyBr(''); },
            style: { border: '1px solid #d0d7de', background: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } }, 'Cancelar'),
          _r('button', { type: 'button',
            onClick: function () {
              var destinos = copyDestGenBr.slice();
              if (destinos.length === 0) {
                destinos = otsDisponibles.filter(function (o) { return String(o.nro_ot) !== otNroActualStrBr; }).map(function (o) { return String(o.nro_ot); });
              }
              copiarCamposBrAOts(destinos, camposList);
              setCopyOpenKeyBr(''); setCopyDestGenBr([]);
            },
            style: { border: '1px solid #0969da', background: '#0969da', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
      ) : null
    );
  }

  var CAMPOS_NORMAS_BR = [
    'norma_itm059', 'norma_astm_e10', 'norma_astm_e10_year',
    'norma_iso6506', 'norma_iso6506_year', 'norma_otra_chk', 'norma_otra',
  ];
  var CAMPOS_CONDICIONES_BR = [
    'sup_muestra', 'sup_equipo', 'paralelismo', 'verif_patron',
    'temperatura', 'tiempo_aplicacion', 'bolilla_diametro', 'carga_aplicada',
    'espesor_probeta', 'diametro_impronta', 'dureza_hb', 'zona_ensayo',
  ];
  var CAMPOS_EQUIPAMIENTO_BR = ['equipamiento', 'equipamiento_tags', 'otros_equipos'];
  var CAMPOS_TODO_BR = CAMPOS_NORMAS_BR.concat(CAMPOS_CONDICIONES_BR).concat(CAMPOS_EQUIPAMIENTO_BR);
  var barraCopiarTodoBr = multiOtBr ? _r('div', {
    style: {
      padding: '8px 12px', background: '#e7f0ff', border: '1px solid #0969da',
      borderTop: 'none', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11,
    },
  },
    _r('span', { style: { fontSize: 16 } }, '📋'),
    _r('span', { style: { flex: 1, color: '#0550ae' } },
      'Copiar TODA la configuración (normas + condiciones + equipamiento) a otras OT en un solo click.'),
    botonCopiarSeccionBr('copiar_todo', 'Copiar todo a otras OT',
      CAMPOS_TODO_BR,
      'Copia normas (1.1), condiciones (1.2) y equipamiento (1.3) juntos.')
  ) : null;

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
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
      botonCopiarSeccionBr('normas_11', 'Copiar normas a otras OT',
        CAMPOS_NORMAS_BR,
        'Copia las normas ITM/ASTM/ISO y "Otro" a las OTs seleccionadas.')
    ),
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
  // Helpers para leer/escribir un campo por OT. El valor de la OT actual sigue
  // en datos.<k>; las hermanas guardan en condiciones_por_ot[<OT>].<k>. El saver
  // ya aplana esos campos a la raíz del hijo (OVERRIDE_RAIZ_KEYS_BR).
  function getValOt(nro, k) {
    if (nro === otNroActualStrBr) return datos[k] || '';
    var m = (datos.condiciones_por_ot && datos.condiciones_por_ot[nro]) || {};
    return m[k] || '';
  }
  function setValOt(nro, k, v) {
    if (nro === otNroActualStrBr) {
      upd(k, v);
      return;
    }
    var mapa = Object.assign({}, datos.condiciones_por_ot || {});
    var entry = Object.assign({}, mapa[nro] || {});
    if (v === '' || v == null) delete entry[k];
    else entry[k] = v;
    if (Object.keys(entry).length === 0) delete mapa[nro];
    else mapa[nro] = entry;
    set('condiciones_por_ot', mapa);
  }

  // Estilos reusables para el bloque.
  var subheadStyle = {
    fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.4px',
    textTransform: 'uppercase', marginBottom: 6, paddingBottom: 3,
    borderBottom: '1px solid var(--border, #e3e5ea)',
  };
  var chipCheck = function (k, label) {
    return _r('label', { style: {
      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
      border: '1px solid ' + (datos[k] ? '#0969da' : '#d0d7de'),
      borderRadius: 5, background: datos[k] ? '#e7f0ff' : '#fff',
      cursor: 'pointer', fontSize: 10.5, transition: 'all .15s',
    } },
      _r('input', { type: 'checkbox', checked: !!datos[k],
        onChange: function (e) { updBool(k, e.target.checked); } }),
      _r('span', { style: { fontWeight: 600, color: datos[k] ? '#0550ae' : 'var(--text)' } }, label),
      _r('span', { style: { color: datos[k] ? '#0550ae' : '#999', fontWeight: 500 } }, 'OK'));
  };
  var filaPorOt = otsDisponibles && otsDisponibles.length > 0 ? otsDisponibles : [{ nro_ot: otNroActualStrBr }];

  var block12 = _r('div', null,
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, '1.2  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
      botonCopiarSeccionBr('cond_12', 'Copiar condiciones a otras OT',
        CAMPOS_CONDICIONES_BR,
        'Copia estado sup, paralelismo, temp, tiempo, carga, bolilla, etc.')
    ),
    _r('div', { style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 14 } },
      // Verificaciones — chips
      _r('div', null,
        _r('div', { style: subheadStyle }, 'Verificaciones'),
        _r('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          chipCheck('sup_muestra',  'Estado sup. muestra'),
          chipCheck('sup_equipo',   'Estado sup. equipo'),
          chipCheck('paralelismo',  'Paralelismo'),
          chipCheck('verif_patron', 'Verif. contra patrón'))
      ),
      // Condiciones ambientales
      _r('div', null,
        _r('div', { style: subheadStyle }, 'Condiciones ambientales'),
        _r('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', fontSize: 11 } },
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            _r('span', { style: { fontWeight: 600 } }, 'Temperatura:'),
            _r('input', { style: Object.assign({}, S.input, S.num, { width: 60 }), value: datos.temperatura || '',
              onChange: function (e) { upd('temperatura', e.target.value); } }),
            _r('span', { style: { color: '#666' } }, '°C')),
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            _r('span', { style: { fontWeight: 600 } }, 'Tiempo de aplicación:'),
            _r('input', { style: Object.assign({}, S.input, { width: 70 }), value: datos.tiempo_aplicacion || '',
              onChange: function (e) { upd('tiempo_aplicacion', e.target.value); } }),
            _r('span', { style: { color: '#666' } }, 'seg')))
      ),
      // Parámetros del ensayo — tabla por OT (Bolilla | Carga | Espesor).
      // Al elegir una bolilla estándar (2.5 / 5 / 10) se autocompleta la carga
      // Brinell correspondiente (187.5 / 750 / 3000 kgf) SI la carga está vacía.
      // El técnico puede editarla manualmente después. Cargas escaladas 2.5D²:
      //   1 → 30, 2 → 120, 2.5 → 187.5, 5 → 750, 10 → 3000
      (function () {
        var CARGA_BRINELL = { '1': '30', '2': '120', '2.5': '187.5', '5': '750', '10': '3000' };
        function contarMed(nro) {
          if (!Array.isArray(mediciones)) return 0;
          return mediciones.filter(function (m) {
            var ov = String((m && m.nro_ot_override) || '').trim();
            var dest = ov || otNroActualStrBr;
            return dest === nro;
          }).length;
        }
        function setBolillaConAuto(nro, v) {
          setValOt(nro, 'bolilla_diametro', v);
          var normal = String(v).replace(',', '.').trim();
          if (CARGA_BRINELL[normal] && !getValOt(nro, 'carga_aplicada')) {
            setValOt(nro, 'carga_aplicada', CARGA_BRINELL[normal]);
          }
        }
        var cellStyle = {
          border: '1px solid var(--border, #e3e5ea)',
          padding: 0, position: 'relative',
        };
        var inputCellStyle = {
          border: 'none', width: '100%', fontSize: 11, padding: '7px 10px',
          outline: 'none', background: 'transparent', textAlign: 'center',
          fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
        };
        var thStyle = {
          border: '1px solid var(--border)', padding: '7px 10px',
          fontWeight: 700, fontSize: 10.5, letterSpacing: '.2px',
          color: 'var(--text-2)',
        };
        return _r('div', null,
          _r('div', { style: Object.assign({}, subheadStyle,
            { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
            _r('span', null, multiOtBr ? 'Parámetros del ensayo por OT' : 'Parámetros del ensayo'),
            _r('span', { style: { fontSize: 9, fontWeight: 500, color: 'var(--text-3)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 } },
              'Al elegir bolilla estándar (1 / 2 / 2.5 / 5 / 10), autocompleta la carga si está vacía')
          ),
          _r('div', { style: {
            border: '1px solid var(--border, #e3e5ea)',
            borderRadius: 6, overflow: 'hidden',
            boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(20,30,50,.06))',
          } },
            _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 11 } },
              _r('thead', null,
                _r('tr', { style: { background: 'var(--surface-2, #f5f7fa)' } },
                  multiOtBr ? _r('th', { style: Object.assign({}, thStyle, { textAlign: 'left', width: 130 }) }, 'OT') : null,
                  _r('th', { style: Object.assign({}, thStyle, { textAlign: 'center' }) },
                    _r('span', null, '⌀ Bolilla '),
                    _r('span', { style: { fontWeight: 400, color: 'var(--text-3)' } }, '(mm)')),
                  _r('th', { style: Object.assign({}, thStyle, { textAlign: 'center' }) },
                    _r('span', null, 'Carga aplicada '),
                    _r('span', { style: { fontWeight: 400, color: 'var(--text-3)' } }, '(kgf)')),
                  _r('th', { style: Object.assign({}, thStyle, { textAlign: 'center' }) },
                    _r('span', null, 'Espesor probeta '),
                    _r('span', { style: { fontWeight: 400, color: 'var(--text-3)' } }, '(mm)')))
              ),
              _r('tbody', null,
                filaPorOt.map(function (o, idx) {
                  var nro = String(o.nro_ot);
                  var esActual = nro === otNroActualStrBr;
                  var zebra = idx % 2 === 1 ? 'var(--surface-2, #fafbfc)' : 'transparent';
                  var bgFila = esActual ? 'var(--accent-soft, #e7f0ff)' : zebra;
                  var cantMed = contarMed(nro);
                  return _r('tr', { key: nro, style: {
                    background: bgFila,
                    transition: 'background .1s',
                  } },
                    multiOtBr ? _r('td', { style: Object.assign({}, cellStyle, { padding: '7px 10px' }) },
                      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                        _r('span', { style: {
                          fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: 700,
                          color: esActual ? 'var(--accent, #0550ae)' : 'var(--text-2)',
                          fontSize: 11,
                        } }, nro),
                        esActual ? _r('span', { style: {
                          fontSize: 8.5, fontWeight: 600, color: 'var(--accent, #0550ae)',
                          background: '#fff', border: '1px solid var(--accent, #0969da)',
                          borderRadius: 3, padding: '1px 5px', letterSpacing: '.3px',
                          textTransform: 'uppercase',
                        } }, 'esta') : null,
                        cantMed > 0 ? _r('span', { style: {
                          fontSize: 9, fontWeight: 500, color: 'var(--text-3)',
                          background: 'var(--surface, #fff)', border: '1px solid var(--border, #d0d7de)',
                          borderRadius: 10, padding: '1px 6px',
                        } }, cantMed + ' med.') : null
                      )
                    ) : null,
                    // Bolilla ø con datalist de valores estándar
                    _r('td', { style: cellStyle },
                      _r('input', {
                        style: inputCellStyle,
                        list: 'brinell_bolilla_std',
                        value: getValOt(nro, 'bolilla_diametro'), placeholder: '…',
                        onChange: function (e) { setBolillaConAuto(nro, e.target.value); },
                        onFocus: function (e) { e.target.parentNode.style.boxShadow = 'inset 0 0 0 2px var(--accent, #0969da)'; },
                        onBlur:  function (e) { e.target.parentNode.style.boxShadow = ''; },
                      })
                    ),
                    // Carga aplicada
                    _r('td', { style: cellStyle },
                      _r('input', {
                        style: inputCellStyle,
                        value: getValOt(nro, 'carga_aplicada'), placeholder: '…',
                        onChange: function (e) { setValOt(nro, 'carga_aplicada', e.target.value); },
                        onFocus: function (e) { e.target.parentNode.style.boxShadow = 'inset 0 0 0 2px var(--accent, #0969da)'; },
                        onBlur:  function (e) { e.target.parentNode.style.boxShadow = ''; },
                      })
                    ),
                    // Espesor probeta
                    _r('td', { style: cellStyle },
                      _r('input', {
                        style: inputCellStyle,
                        value: getValOt(nro, 'espesor_probeta'), placeholder: '…',
                        onChange: function (e) { setValOt(nro, 'espesor_probeta', e.target.value); },
                        onFocus: function (e) { e.target.parentNode.style.boxShadow = 'inset 0 0 0 2px var(--accent, #0969da)'; },
                        onBlur:  function (e) { e.target.parentNode.style.boxShadow = ''; },
                      })
                    )
                  );
                })
              )
            ),
            _r('datalist', { id: 'brinell_bolilla_std' },
              _r('option', { value: '1' }),
              _r('option', { value: '2' }),
              _r('option', { value: '2.5' }),
              _r('option', { value: '5' }),
              _r('option', { value: '10' })
            )
          )
        );
      })(),
      // Resultado global (opcional) — se emite en el Word como línea informativa
      _r('div', null,
        _r('div', { style: subheadStyle }, 'Resultado global (opcional)'),
        _r('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', fontSize: 11 } },
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            _r('span', { style: { fontWeight: 600 } }, 'Diám. impronta:'),
            _r('input', { style: Object.assign({}, S.input, { width: 80, textAlign: 'center' }),
              placeholder: '…', value: datos.diametro_impronta || '',
              onChange: function (e) { upd('diametro_impronta', e.target.value); } }),
            _r('span', { style: { color: '#666' } }, 'mm')),
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            _r('span', { style: { fontWeight: 600 } }, 'Dureza HB:'),
            _r('input', { style: Object.assign({}, S.input, { width: 80, textAlign: 'center' }),
              placeholder: '…', value: datos.dureza_hb || '',
              onChange: function (e) { upd('dureza_hb', e.target.value); } })))
      ),
      // Zona de ensayo
      _r('div', null,
        _r('div', { style: subheadStyle }, 'Zona de ensayo'),
        _r(window.ZonaInput, {
          tipo: 'dureza-brinell',
          style: Object.assign({}, S.inline, { width: '100%' }),
          placeholder: 'Ej: Superficie, Núcleo, Zona de soldadura, …',
          value: datos.zona_ensayo || '',
          onChange: function (e) { upd('zona_ensayo', e.target.value); },
        })
      )
    )
  );

  // ── MEMORIA ANALÍTICA (interno) ────────────────────────────────────────
  // Registro trazabilidad del patrón usado para verificar el durómetro.
  // El TAG del patrón se carga arriba en 1.3 EQUIPAMIENTO (última fila). Acá
  // sólo van los datos de verificación: valor de referencia + medición
  // (diámetro impronta + dureza HB obtenidos al medir el patrón). No se emiten
  // en el Word — quedan en el sistema como trazabilidad.
  var blockMem = _r('div', null,
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', gap: 8 }) },
      _r('span', null, 'MEMORIA ANALÍTICA'),
      _r('span', { style: { fontSize: 9, fontWeight: 500, color: 'var(--text-3)', fontStyle: 'italic' } }, '(uso interno — trazabilidad del patrón)')
    ),
    _r('div', { style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 14 } },
      // Valor de referencia
      _r('div', null,
        _r('div', { style: subheadStyle }, 'Valor de referencia'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 } },
          _r('span', { style: { fontWeight: 600 } }, 'Valor:'),
          _r('input', { style: Object.assign({}, S.input, { flex: 1, maxWidth: 260 }),
            placeholder: 'Ej: 200 HB',
            value: datos.patron_valor || '',
            onChange: function (e) { upd('patron_valor', e.target.value); } }))
      ),
      // Verificación (medición del patrón)
      _r('div', null,
        _r('div', { style: subheadStyle }, 'Verificación (medición del patrón)'),
        _r('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', fontSize: 11 } },
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            _r('span', { style: { fontWeight: 600 } }, 'Diám. impronta:'),
            _r('input', { style: Object.assign({}, S.input, { width: 90, textAlign: 'center' }),
              placeholder: '…', value: datos.patron_diam_imp || '',
              onChange: function (e) { upd('patron_diam_imp', e.target.value); } }),
            _r('span', { style: { color: '#666' } }, 'mm')),
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
            _r('span', { style: { fontWeight: 600 } }, 'Dureza HB:'),
            _r('input', { style: Object.assign({}, S.input, { width: 90, textAlign: 'center' }),
              placeholder: '…', value: datos.patron_dureza_hb || '',
              onChange: function (e) { upd('patron_dureza_hb', e.target.value); } })))
      )
    )
  );

  // ── 1.3 EQUIPAMIENTO ──────────────────────────────────────────────────
  var block13 = _r('div', null,
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, '1.3  EQUIPAMIENTO UTILIZADO'),
      botonCopiarSeccionBr('equip_13', 'Copiar equipamiento a otras OT',
        CAMPOS_EQUIPAMIENTO_BR,
        'Copia checkboxes de equipos + TAGs + otros equipos manuales.')
    ),
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
      : null,
    // Patrón utilizado — SIEMPRE al final del bloque equipamiento (mismo orden
    // que en el Word). El TAG se guarda en datos.patron_tag y el generator lo
    // emite en la línea "Patrón utilizado TAG N°PMM-XXX" (última del equipamiento).
    _r('div', { style: {
      padding: '8px 10px', borderTop: '1px dashed var(--border, #e3e5ea)',
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
      background: 'var(--surface-2, #f5f7fa)',
    } },
      _r('span', { style: { fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.3px' } }, 'PATRÓN UTILIZADO'),
      _r('span', { style: { color: '#666' } }, 'TAG N°'),
      _r('input', {
        style: Object.assign({}, S.input, { width: 160 }),
        placeholder: 'Ej: PMM-716',
        value: datos.patron_tag || datos.patron || '',
        onChange: function (e) { upd('patron_tag', e.target.value); },
      })
    )
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
            var over = String(r.nro_ot_override || '').trim();
            var otEff = over || String(r.ot || '') || otNroActualStrBr;
            var esOtra = over && over !== otNroActualStrBr;
            return _r('tr', { key: i },
              // Columna OT — cuando hay OTs hermanas, es un SELECT con las
              // OTs disponibles (fila se asigna a esa OT y al guardar se
              // transfiere al ensayo brinell de la hermana). Sin hermanas
              // (single-OT) es un input libre por retrocompat.
              _r('td', { style: { border: '1px solid #333', padding: 0, background: esOtra ? '#fff8e5' : '#fff' } },
                multiOtBr
                  ? _r('select', {
                      value: otEff,
                      onChange: function (e) {
                        var v = String(e.target.value || '').trim();
                        var next = mediciones.slice();
                        next[i] = Object.assign({}, next[i] || {}, {
                          ot: v,
                          nro_ot_override: v === otNroActualStrBr ? '' : v,
                        });
                        set('mediciones', next);
                      },
                      title: 'OT destino de esta medición',
                      style: {
                        border: 'none', outline: 'none', width: '100%',
                        padding: '4px 6px', fontSize: 10, background: 'transparent',
                        color: esOtra ? '#8a5a00' : '#24292f',
                        fontWeight: esOtra ? 700 : 400,
                        fontFamily: 'ui-monospace, Consolas, monospace',
                      },
                    },
                      otsDisponibles.map(function (o) {
                        var lbl = o.nro_ot + (String(o.nro_ot) === otNroActualStrBr ? ' (esta)' : '');
                        return _r('option', { key: o.nro_ot, value: o.nro_ot }, lbl);
                      }))
                  : _r('input', { style: Object.assign({}, S.input, S.num, { border: 'none', width: '100%' }),
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
    barraCopiarTodoBr,
    _r('div', { style: { display: 'grid', gridTemplateColumns: '0.85fr 1.4fr' } }, block11, block12),
    blockMem, block13, block14, block15
  );
}

Object.assign(window, { BrinellForm: BrinellForm });
