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
  var block12 = _r('div', null,
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, '1.2  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
      botonCopiarSeccionBr('cond_12', 'Copiar condiciones a otras OT',
        CAMPOS_CONDICIONES_BR,
        'Copia estado sup, paralelismo, temp, tiempo, carga, bolilla, etc.')
    ),
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
    barraCopiarTodoBr,
    _r('div', { style: { display: 'grid', gridTemplateColumns: '0.85fr 1.4fr' } }, block11, block12),
    blockMem, block13, block14, block15
  );
}

Object.assign(window, { BrinellForm: BrinellForm });
