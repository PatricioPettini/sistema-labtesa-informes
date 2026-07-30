/* ============================================================================
 * TratamientosTermicosForm — espejo del preinforme físico FM-110 Rev.00 (v2).
 *
 * Estructura del preinforme físico:
 *   - Condiciones de ensayo:
 *       · Método (2 checkboxes): "Según indicaciones del cliente" / "ITMM-040"
 *       · Tabla de CICLOS (dinámica, columnas 1..N con nombre editable):
 *           - Temperatura inicial (°C)
 *           - Gradiente de temperatura (°C/h)
 *           - Temperatura de tratamiento (°C)
 *           - Tiempo de tratamiento a temperatura (minutos)
 *           - Gradiente de enfriamiento (°C/h)
 *           - Temperatura final (°C)
 *           - Cantidad de ciclos (-)
 *   - Equipos utilizados: Horno + Registrador con TAG editable.
 *   - Resultados obtenidos: checkbox "muestra tratada" + radio SI/NO gráfico +
 *     ruta G: + widget de imagen (gráfico opcional).
 *   - Observaciones: textarea.
 *
 * Persistencia de datos:
 *   ciclos: {
 *     nombres: ['1', '2', ...],
 *     tempInicial:        ['', '', ...],
 *     gradTemp:           ['', '', ...],
 *     tempTratamiento:    ['', '', ...],
 *     tiempoTratamiento:  ['', '', ...],
 *     gradEnfriamiento:   ['', '', ...],
 *     tempFinal:          ['', '', ...],
 *     cantCiclos:         ['', '', ...],
 *   }
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var CICLO_PARAMS = [
  { key: 'tempInicial',       label: 'TEMPERATURA INICIAL',                       unit: '°C' },
  { key: 'gradTemp',          label: 'GRADIENTE DE TEMPERATURA',                  unit: '°C/h' },
  { key: 'tempTratamiento',   label: 'TEMPERATURA DE TRATAMIENTO',                unit: '°C' },
  { key: 'tiempoTratamiento', label: 'TIEMPO DE TRATAMIENTO A TEMPERATURA',       unit: 'minutos' },
  { key: 'gradEnfriamiento',  label: 'GRADIENTE DE ENFRIAMIENTO',                 unit: '°C/h' },
  { key: 'tempFinal',         label: 'TEMPERATURA FINAL',                         unit: '°C' },
  { key: 'cantCiclos',        label: 'CANTIDAD DE CICLOS',                        unit: '-' },
];

var N_CICLOS_DEFAULT = 3;

function TratamientosTermicosForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  // Inicializar `ciclos` si aún no existe (compat con OTs previas al rediseño).
  var ciclos = datos.ciclos || (function () {
    var base = { nombres: [] };
    for (var i = 0; i < N_CICLOS_DEFAULT; i++) base.nombres.push(String(i + 1));
    CICLO_PARAMS.forEach(function (p) {
      base[p.key] = Array.from({ length: N_CICLOS_DEFAULT }, function () { return ''; });
    });
    return base;
  })();
  var nCiclos = (ciclos.nombres || []).length || N_CICLOS_DEFAULT;

  function setCicloNombre(i, val) {
    var next = Object.assign({}, ciclos, { nombres: (ciclos.nombres || []).slice() });
    next.nombres[i] = val;
    set('ciclos', next);
  }
  function setCicloValor(paramKey, i, val) {
    var next = Object.assign({}, ciclos);
    next[paramKey] = (ciclos[paramKey] || []).slice();
    next[paramKey][i] = val;
    set('ciclos', next);
  }
  function addCiclo() {
    var next = Object.assign({}, ciclos, { nombres: (ciclos.nombres || []).slice() });
    next.nombres.push(String(next.nombres.length + 1));
    CICLO_PARAMS.forEach(function (p) {
      next[p.key] = (ciclos[p.key] || []).slice();
      next[p.key].push('');
    });
    set('ciclos', next);
  }
  function delCiclo() {
    if (nCiclos <= 1) return;
    var next = Object.assign({}, ciclos, { nombres: (ciclos.nombres || []).slice(0, -1) });
    CICLO_PARAMS.forEach(function (p) {
      next[p.key] = (ciclos[p.key] || []).slice(0, -1);
    });
    set('ciclos', next);
  }

  // Equipamiento — checkbox + TAG editable.
  var equipMarcado = datos.equipamiento || {};
  var equipTags = datos.equipamiento_tags || {};
  function setEquipMark(key, ch) { set('equipamiento.' + key, !!ch); }
  function setEquipTag(key, val) { set('equipamiento_tags.' + key, val); }

  var S = window.FORM_STYLES;

  // ── ENSAYO DE TRATAMIENTO TÉRMICO (título) ──────────────────────────────
  var blockTitulo = _r('div', {
    style: { fontSize: 12, fontWeight: 800, padding: '6px 10px', borderTop: '1px solid #333', borderBottom: '1px solid #333' }
  }, '- ENSAYO DE TRATAMIENTO TÉRMICO');

  // ── CONDICIONES DE ENSAYO ─────────────────────────────────────────────
  var blockCond = _r('div', null,
    _r('div', { style: S.head }, '- CONDICIONES DE ENSAYO'),
    _r('div', { style: { padding: '8px 10px', fontSize: 11 } },
      _r('div', { style: { fontWeight: 800, marginBottom: 4 } }, 'MÉTODO DE ENSAYO'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8, marginBottom: 8 } },
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_cliente,
            onChange: function (e) { updBool('metodo_cliente', e.target.checked); } }),
          'SEGÚN INDICACIONES DADAS POR EL CLIENTE'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_interno,
            onChange: function (e) { updBool('metodo_interno', e.target.checked); } }),
          'PROCEDIMIENTO INTERNO ITMM-040')
      ),

      // Tabla de ciclos
      _r('div', { style: { overflowX: 'auto' } },
        _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10 } },
          _r('thead', null,
            _r('tr', { style: { background: '#e6e6e6' } },
              _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 4, textAlign: 'left', width: '44%' } }, 'DESCRIPCIÓN'),
              _r('th', { rowSpan: 2, style: { border: '1px solid #333', padding: 4, width: 64 } }, 'UNIDAD'),
              _r('th', { colSpan: nCiclos, style: { border: '1px solid #333', padding: 4 } }, 'CICLO')
            ),
            _r('tr', { style: { background: '#f2f2f2' } },
              (ciclos.nombres || []).map(function (nombre, i) {
                return _r('th', { key: 'ch' + i, style: { border: '1px solid #333', padding: 0, width: 64 } },
                  _r('input', {
                    style: Object.assign({}, S.input, { border: 'none', width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 10 }),
                    placeholder: 'N°',
                    value: nombre || '',
                    onChange: function (e) { setCicloNombre(i, e.target.value); },
                  }));
              })
            )
          ),
          _r('tbody', null,
            CICLO_PARAMS.map(function (p) {
              return _r('tr', { key: p.key },
                _r('td', { style: { border: '1px solid #333', padding: '3px 8px', fontWeight: 600 } }, p.label),
                _r('td', { style: { border: '1px solid #333', padding: 3, textAlign: 'center', color: '#555' } }, p.unit),
                (ciclos[p.key] || []).map(function (v, j) {
                  return _r('td', { key: p.key + '-' + j, style: { border: '1px solid #333', padding: 0 } },
                    _r('input', {
                      style: Object.assign({}, S.input, { border: 'none', width: '100%', textAlign: 'center' }),
                      value: v || '',
                      onChange: function (e) { setCicloValor(p.key, j, e.target.value); },
                    }));
                })
              );
            })
          )
        )
      ),
      _r('div', { style: { marginTop: 6, display: 'flex', gap: 8 } },
        _r('button', { type: 'button', onClick: addCiclo,
          style: { fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', borderRadius: 4, cursor: 'pointer' } },
          '+ Agregar ciclo'),
        _r('button', { type: 'button', onClick: delCiclo,
          style: { fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', borderRadius: 4, cursor: 'pointer' },
          disabled: nCiclos <= 1 },
          '− Quitar ciclo')
      )
    )
  );

  // ── EQUIPOS UTILIZADOS ───────────────────────────────────────────────
  var blockEquipos = _r('div', null,
    _r('div', { style: S.head }, '- EQUIPOS UTILIZADOS'),
    _r('div', { style: { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11 } },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: equipMarcado.horno !== false,
            onChange: function (e) { setEquipMark('horno', e.target.checked); } }),
          _r('span', { style: { fontWeight: 600 } }, 'HORNO ELÉCTRICO CON MICROCONTROLADOR  TAG N°')),
        _r('input', { style: Object.assign({}, S.input, { width: 120 }),
          value: equipTags.horno || '',
          onChange: function (e) { setEquipTag('horno', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
          _r('input', { type: 'checkbox', checked: equipMarcado.registrador !== false,
            onChange: function (e) { setEquipMark('registrador', e.target.checked); } }),
          _r('span', { style: { fontWeight: 600 } }, 'REGISTRADOR DE TEMPERATURA  TAG N°')),
        _r('input', { style: Object.assign({}, S.input, { width: 120 }),
          value: equipTags.registrador || '',
          onChange: function (e) { setEquipTag('registrador', e.target.value); } })),
      typeof window.OtrosEquiposBlock === 'function'
        ? _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { set('otros_equipos', arr); } })
        : null
    )
  );

  // ── RESULTADOS OBTENIDOS ─────────────────────────────────────────────
  var blockResultados = _r('div', null,
    _r('div', { style: S.head }, '- RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 } },
      _r('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' } },
        _r('input', { type: 'checkbox', style: { marginTop: 2 },
          checked: !!datos.res_tratada,
          onChange: function (e) { updBool('res_tratada', e.target.checked); } }),
        _r('span', null, 'LA MUESTRA FUE TRATADA TÉRMICAMENTE Y QUEDA EN CONDICIONES PARA REALIZAR LOS MECANIZADOS Y POSTERIORES ENSAYOS FÍSICOS.')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' } },
        _r('span', { style: { fontWeight: 600 } }, 'SE ADJUNTA GRÁFICO DEL TRATAMIENTO:'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'tt-grafico',
            checked: datos.adjunta_grafico === 'SI',
            onChange: function () { upd('adjunta_grafico', 'SI'); } }),
          'SI'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'tt-grafico',
            checked: datos.adjunta_grafico === 'NO',
            onChange: function () { upd('adjunta_grafico', 'NO'); } }),
          'NO')),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 700 } }, 'RUTA G:'),
        _r('input', { style: S.inline,
          placeholder: '……………………………………………………………………',
          value: datos.ruta_g || '',
          onChange: function (e) { upd('ruta_g', e.target.value); } })),
      _r('div', null,
        _r('div', { style: { fontSize: 10, fontWeight: 700, marginBottom: 4 } },
          'GRÁFICO DEL TRATAMIENTO (opcional)'),
        typeof window.AutoLoadPhotosBtn === 'function'
          ? _r(window.AutoLoadPhotosBtn, {
              ensayoId: props.ensayoId, nroOt: props.nroOt, tipo: props.tipo,
              datos: datos, set: set,
              campos: ['imagenes_resultado'],
              hint: '⚡ Busca fotos en el drive (gráficos de tratamiento) y las carga aquí.',
            })
          : null,
        typeof window.EnsayoPhotos === 'function'
          ? _r(window.EnsayoPhotos, {
              photos: datos.imagenes_resultado || [],
              hint: 'Arrastrá el gráfico del tratamiento térmico aquí (opcional)',
              onChange: function (next) { upd('imagenes_resultado', next); },
            })
          : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 8, textAlign: 'center' } }, 'Widget de fotos no disponible')
      )
    )
  );

  // ── OBSERVACIONES ────────────────────────────────────────────────────
  var blockObs = _r('div', null,
    _r('div', { style: S.head }, '- OBSERVACIONES'),
    _r('div', { style: { padding: '8px 10px' } },
      _r('textarea', {
        style: { width: '100%', minHeight: 64, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        placeholder: 'Observaciones…',
        value: datos.observaciones || '',
        onChange: function (e) { upd('observaciones', e.target.value); }
      })
    )
  );

  var footer = _r('div', {
    style: { borderTop: '1px solid #333', display: 'flex', justifyContent: 'flex-end', padding: '8px 12px' }
  }, _r('div', { style: { fontSize: 10, fontWeight: 700, color: '#333' } }, 'FM-110 Rev.00'));

  return _r('div', { style: S.sheet },
    blockTitulo, blockCond, blockEquipos, blockResultados, blockObs, footer
  );
}

window.TratamientosTermicosForm = TratamientosTermicosForm;
