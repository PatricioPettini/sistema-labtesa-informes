/* ============================================================================
 * EspesorRecubrimientoForm — modelo FM-074 (Espesor de Recubrimiento
 * Metalográfico). Multi-OT built-in: cada OT tiene sus propias mediciones
 * (N configurable) + sector. En el Word, la tabla de resultados muestra una
 * columna por OT con min/max/promedio calculados; la memoria analítica con las
 * mediciones individuales no aparece en el informe final.
 *
 * Estado:
 *   norma, metodologia, aumento_texto, temperatura       — globales
 *   equipamiento{}, equipamiento_tags{}, otros_equipos[] — globales
 *   notas_texto, evaluacion_texto                        — globales
 *   mediciones_por_ot: { '<nro_ot>': { sector, valores: [...] } }
 *   condiciones_por_ot: { '<nro_ot>': { <override>... } }  — como en otros forms
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var ER_EQUIPOS = [
  { key: 'leica_378',        nombre: 'MICROSCOPIO LEICA DM 750', tagDefault: 'MM-378' },
  { key: 'termo_700',        nombre: 'TERMOHIGRÓMETRO',          tagDefault: 'MM-700' },
  { key: 'termo_pcal_545',   nombre: 'TERMOHIGRÓMETRO',          tagDefault: 'PCAL-545' },
];

function EspesorRecubrimientoForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  var S = window.FORM_STYLES;

  // ── Multi-OT: hermanas + OT activa (tabs). ──────────────────────────────
  var otsHerm = (function () {
    if (!props.nroOt || !window.LabStore || !window.LabStore.getOt) return null;
    var otA = window.LabStore.getOt(props.nroOt);
    if (!otA || !otA.nro_solicitud || !window.LabStore.listOtsBySolicitud) return null;
    return window.LabStore.listOtsBySolicitud(otA.nro_solicitud);
  })();
  var multiOt = otsHerm && otsHerm.length > 1;
  var otNroActual = String(props.nroOt || '');
  var _otActiva = React.useState(function () { return otNroActual; });
  var otActiva = _otActiva[0], setOtActiva = _otActiva[1];

  // ── Helpers get/set por OT (condiciones_por_ot con fallback a raíz). ────
  function _dotGet(obj, k) {
    if (obj == null) return undefined;
    var parts = String(k).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function getCond(k) {
    var top = String(k).split('.')[0];
    if (multiOt) {
      var m = (datos.condiciones_por_ot || {})[otActiva];
      if (m && m[top] !== undefined) return _dotGet(m, k);
    }
    return _dotGet(datos, k);
  }
  function _cloneShallow(v) {
    if (Array.isArray(v)) return v.slice();
    if (v && typeof v === 'object') return Object.assign({}, v);
    return v;
  }
  function setCond(k, v) {
    if (!multiOt) { set(k, v); return; }
    var mapa = Object.assign({}, datos.condiciones_por_ot || {});
    var m = Object.assign({}, mapa[otActiva] || {});
    var top = String(k).split('.')[0];
    if (m[top] === undefined) m[top] = _cloneShallow(datos[top]);
    var parts = String(k).split('.');
    var cur = m;
    for (var i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = _cloneShallow(cur[parts[i]]) || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v;
    mapa[otActiva] = m;
    if (otActiva === otNroActual) {
      var patch = { condiciones_por_ot: mapa };
      patch[top] = m[top];
      set(patch);
    } else {
      set('condiciones_por_ot', mapa);
    }
  }

  // ── Mediciones por OT: sector + valores[]. Fuente de verdad:
  //   datos.mediciones_por_ot[<nroOt>] = { sector: '', valores: [...] }
  function medOt(nroOt) {
    var m = (datos.mediciones_por_ot || {})[nroOt];
    if (m && typeof m === 'object') {
      return {
        sector: String(m.sector || ''),
        valores: Array.isArray(m.valores) ? m.valores.slice() : [],
      };
    }
    return { sector: '', valores: [] };
  }
  function setMedOt(nroOt, next) {
    var mapa = Object.assign({}, datos.mediciones_por_ot || {});
    mapa[nroOt] = { sector: String(next.sector || ''), valores: (next.valores || []).slice() };
    set('mediciones_por_ot', mapa);
  }
  function setSector(nroOt, val) {
    var cur = medOt(nroOt);
    cur.sector = val;
    setMedOt(nroOt, cur);
  }
  function setValor(nroOt, idx, val) {
    var cur = medOt(nroOt);
    while (cur.valores.length <= idx) cur.valores.push('');
    cur.valores[idx] = val;
    setMedOt(nroOt, cur);
  }
  function addMedicion(nroOt) {
    var cur = medOt(nroOt);
    cur.valores.push('');
    setMedOt(nroOt, cur);
  }
  function delMedicion(nroOt, idx) {
    var cur = medOt(nroOt);
    cur.valores.splice(idx, 1);
    setMedOt(nroOt, cur);
  }

  // ── Cálculos de min/max/promedio (por OT) — se muestran en vivo.
  function agregados(nroOt) {
    var vs = medOt(nroOt).valores
      .map(function (v) { return parseFloat(String(v).replace(',', '.')); })
      .filter(function (n) { return !isNaN(n); });
    if (vs.length === 0) return { min: '—', max: '—', prom: '—' };
    var min = Math.min.apply(Math, vs);
    var max = Math.max.apply(Math, vs);
    var prom = vs.reduce(function (a, b) { return a + b; }, 0) / vs.length;
    var fmt = function (n) { return (Math.round(n * 100) / 100).toFixed(2); };
    return { min: fmt(min), max: fmt(max), prom: fmt(prom) };
  }

  // ── Copiar TODO / secciones. Igual patrón que metalografía general.
  var _copyOpenKey = React.useState(''); var copyOpenKey = _copyOpenKey[0], setCopyOpenKey = _copyOpenKey[1];
  var _copyDestGen = React.useState([]); var copyDestGen = _copyDestGen[0], setCopyDestGen = _copyDestGen[1];
  function copiarCamposAOts(destinos, campos) {
    if (!destinos || destinos.length === 0) return;
    var mapaCond = Object.assign({}, datos.condiciones_por_ot || {});
    destinos.forEach(function (nroOt) {
      var entry = Object.assign({}, mapaCond[nroOt] || {});
      campos.forEach(function (k) {
        var val = getCond(k);
        if (val !== undefined) entry[k] = _cloneShallow(val);
      });
      mapaCond[nroOt] = entry;
    });
    set('condiciones_por_ot', mapaCond);
    if (window._labToastOk) window._labToastOk('Copiado a OT ' + destinos.join(', ') + ' — se aplica al guardar');
  }
  function botonCopiarSeccion(claveUnica, etiqueta, camposList, descripcion) {
    if (!multiOt) return null;
    var abierto = copyOpenKey === claveUnica;
    return _r('div', { style: { position: 'relative', display: 'inline-block' } },
      _r('button', {
        type: 'button',
        onClick: function () { setCopyDestGen([]); setCopyOpenKey(abierto ? '' : claveUnica); },
        style: {
          border: '1px solid var(--accent)', background: 'var(--surface)',
          color: 'var(--accent)', padding: '3px 8px', fontSize: 10,
          cursor: 'pointer', borderRadius: 3, fontWeight: 600, whiteSpace: 'nowrap',
        },
      }, '📋 ' + etiqueta),
      abierto ? _r('div', {
        style: {
          position: 'absolute', zIndex: 30, top: '100%', right: 0, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border-strong)',
          borderRadius: 6, boxShadow: 'var(--shadow-md)', padding: 10, minWidth: 240, fontSize: 11,
        },
      },
        _r('div', { style: { fontWeight: 700, marginBottom: 6, color: 'var(--text)' } }, etiqueta + ' a:'),
        descripcion ? _r('div', { style: { fontSize: 10, color: 'var(--text-3)', marginBottom: 8 } }, descripcion) : null,
        _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 } },
          otsHerm.filter(function (o) { return String(o.nro_ot) !== otNroActual; }).map(function (o) {
            var nro = String(o.nro_ot);
            var checked = copyDestGen.indexOf(nro) >= 0;
            return _r('label', { key: nro, style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
              _r('input', { type: 'checkbox', checked: checked,
                onChange: function () {
                  setCopyDestGen(checked ? copyDestGen.filter(function (n) { return n !== nro; }) : copyDestGen.concat([nro]));
                } }),
              _r('span', { style: { fontFamily: 'ui-monospace, Consolas, monospace' } }, nro));
          })),
        _r('div', { style: { display: 'flex', gap: 6, justifyContent: 'flex-end' } },
          _r('button', { type: 'button', onClick: function () { setCopyOpenKey(''); },
            style: { border: '1px solid var(--border)', background: 'var(--surface)', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer' } }, 'Cancelar'),
          _r('button', { type: 'button',
            onClick: function () {
              var destinos = copyDestGen.slice();
              if (destinos.length === 0) destinos = otsHerm.filter(function (o) { return String(o.nro_ot) !== otNroActual; }).map(function (o) { return String(o.nro_ot); });
              copiarCamposAOts(destinos, camposList);
              setCopyOpenKey(''); setCopyDestGen([]);
            },
            style: { border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', padding: '3px 10px', fontSize: 11, borderRadius: 3, cursor: 'pointer', fontWeight: 600 } }, 'Copiar'))
      ) : null
    );
  }

  // ── Tabs de OT ──────────────────────────────────────────────────────────
  var tabsOt = multiOt ? _r('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '6px 10px', background: '#fff8e5', borderBottom: '1px solid #e0c060',
      fontSize: 11,
    },
  },
    _r('span', { style: { fontWeight: 700, color: '#8a5a00', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 10 } }, 'Editando OT:'),
    _r('div', { style: { display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' } },
      otsHerm.map(function (o, i) {
        var nro = String(o.nro_ot);
        var activa = nro === otActiva;
        var esActual = nro === otNroActual;
        return _r('button', {
          key: nro, type: 'button',
          onClick: function () { setOtActiva(nro); },
          style: {
            border: 'none',
            borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
            background: activa ? 'var(--accent)' : 'var(--surface)',
            color: activa ? '#fff' : 'var(--text)',
            padding: '4px 10px', fontSize: 11, fontWeight: activa ? 700 : 500,
            cursor: activa ? 'default' : 'pointer',
            fontFamily: 'ui-monospace, Consolas, monospace',
          },
        }, nro, esActual ? ' · actual' : '');
      })),
    _r('span', { style: { fontSize: 10, color: '#8a5a00' } }, 'Cada OT tiene sus mediciones + sector.')
  ) : null;

  // ── Barra "Copiar TODO" ─────────────────────────────────────────────────
  var CAMPOS_TODO = [
    'oaa', 'norma', 'metodologia', 'aumento_texto', 'temperatura',
    'equipamiento', 'equipamiento_tags', 'otros_equipos',
    'notas_texto',
  ];
  var barraCopiarTodo = multiOt ? _r('div', {
    style: {
      padding: '8px 12px', background: 'var(--surface-2, #e7f0ff)',
      border: '1px solid var(--accent, #0969da)',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, marginBottom: 4,
    },
  },
    _r('span', { style: { fontSize: 16 } }, '📋'),
    _r('span', { style: { flex: 1, color: 'var(--accent, #0550ae)' } },
      'Copiar la configuración global (norma + metodología + aumento + equipamiento + notas) a otras OT. Las mediciones y sector NO se copian.'),
    botonCopiarSeccion('copiar_todo', 'Copiar todo a otras OT', CAMPOS_TODO, 'Copia la configuración común entre OTs.')
  ) : null;

  // ── 1.1 CONDICIONES DE ENSAYO ───────────────────────────────────────────
  var block11 = _r('div', null,
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, '1.1  CONDICIONES DE ENSAYO'),
      botonCopiarSeccion('cond_11', 'Copiar condiciones a otras OT',
        ['norma', 'metodologia', 'aumento_texto', 'temperatura'],
        'Copia normas, metodología, aumento y temperatura.')
    ),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 10.5 } },
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 140 } }, 'NORMA DE ENSAYO:'),
        _r('input', {
          style: S.inline, placeholder: 'Ej: ASTM B487',
          value: getCond('norma') || '',
          onChange: function (e) { setCond('norma', e.target.value); },
        })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'METODOLOGÍA:'),
        _r('input', {
          style: S.inline, placeholder: 'ITM N°084',
          value: getCond('metodologia') || '',
          onChange: function (e) { setCond('metodologia', e.target.value); },
        })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA:'),
        _r('input', {
          style: Object.assign({}, S.input, S.num, { width: 56 }),
          value: getCond('temperatura') || '',
          onChange: function (e) { setCond('temperatura', e.target.value); },
        }),
        _r('span', null, '°C')),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 140 } }, 'AUMENTO UTILIZADO:'),
        _r('input', {
          style: S.inline, placeholder: 'Ej: 100 a 1000 X',
          value: getCond('aumento_texto') || '',
          onChange: function (e) { setCond('aumento_texto', e.target.value); },
        }))
    )
  );

  // ── 1.2 EQUIPAMIENTO UTILIZADO ──────────────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: Object.assign({}, S.head, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }) },
      _r('span', null, '1.2  EQUIPAMIENTO UTILIZADO'),
      botonCopiarSeccion('equip_12', 'Copiar equipamiento a otras OT',
        ['equipamiento', 'equipamiento_tags', 'otros_equipos'],
        'Copia equipos + TAGs + equipos extra.')
    ),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 } },
      ER_EQUIPOS.map(function (e) {
        var equipOt = getCond('equipamiento') || {};
        var tagsOt = getCond('equipamiento_tags') || {};
        var checked = !!equipOt[e.key];
        var tagVal = tagsOt[e.key] != null ? tagsOt[e.key] : e.tagDefault;
        return _r('div', { key: e.key, style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('label', { style: Object.assign({}, S.label, { flex: 1 }) },
            _r('input', { type: 'checkbox', checked: checked,
              onChange: function (ev) { setCond('equipamiento.' + e.key, ev.target.checked); } }),
            _r('span', { style: { fontWeight: 600 } }, e.nombre)),
          _r('span', { style: { color: '#555' } }, 'TAG N°:'),
          _r('input', { style: Object.assign({}, S.input, { width: 90 }), value: tagVal,
            onChange: function (ev) { setCond('equipamiento_tags.' + e.key, ev.target.value); } }));
      }),
      typeof window.OtrosEquiposBlock === 'function'
        ? _r(window.OtrosEquiposBlock, { embed: true,
            value: getCond('otros_equipos') || [],
            onChange: function (arr) { setCond('otros_equipos', arr); } })
        : null
    )
  );

  // ── 1.3 MEDICIONES DE ESPESOR (por OT) ──────────────────────────────────
  // Aparece dentro del scope de la OT activa. Al cambiar de tab, se ve la
  // tabla propia de esa OT. Los agregados (min/max/prom) se calculan en vivo.
  var otVis = multiOt ? otActiva : otNroActual;
  var medActiva = medOt(otVis);
  var agr = agregados(otVis);
  var filasMed = medActiva.valores.length > 0 ? medActiva.valores : [''];

  var block13 = _r('div', null,
    _r('div', { style: S.head }, multiOt
      ? ('1.3  MEDICIONES DE ESPESOR — OT ' + otVis)
      : '1.3  MEDICIONES DE ESPESOR'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11 } },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600, minWidth: 140 } }, 'SECTOR ENSAYADO:'),
        _r('input', {
          style: Object.assign({}, S.inline, { flex: 1 }),
          placeholder: 'Ej: Recubrimiento — cabezal 1',
          value: medActiva.sector,
          onChange: function (e) { setSector(otVis, e.target.value); },
        })),
      _r('table', { style: { borderCollapse: 'collapse', width: '100%', maxWidth: 520 } },
        _r('thead', null,
          _r('tr', { style: { background: '#e6e6e6' } },
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 40 } }, 'N°'),
            _r('th', { style: { border: '1px solid #333', padding: 4 } }, 'Medición (micrones)'),
            _r('th', { style: { border: '1px solid #333', padding: 4, width: 40 } }, '')
          )
        ),
        _r('tbody', null,
          filasMed.map(function (v, i) {
            return _r('tr', { key: i },
              _r('td', { style: { border: '1px solid #333', textAlign: 'center', padding: 3 } }, i + 1),
              _r('td', { style: { border: '1px solid #333', padding: 0 } },
                _r('input', {
                  type: 'text', inputMode: 'decimal',
                  autoComplete: 'off', spellCheck: false,
                  style: { border: 'none', width: '100%', fontSize: 11, padding: '5px 6px', outline: 'none', background: 'transparent', textAlign: 'center' },
                  value: v || '',
                  onChange: function (e) { setValor(otVis, i, e.target.value); },
                })),
              _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
                _r('button', {
                  type: 'button', onClick: function () { delMedicion(otVis, i); },
                  title: 'Eliminar medición',
                  style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14 }
                }, '🗑'))
            );
          })
        )
      ),
      _r('div', { style: { display: 'flex', gap: 8 } },
        _r('button', {
          type: 'button', onClick: function () { addMedicion(otVis); },
          style: { fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' }
        }, '+ Agregar medición')),
      _r('div', {
        style: {
          display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11,
          padding: '6px 10px', background: '#f0f4ff', border: '1px solid #c8d4ff', borderRadius: 4,
        }
      },
        _r('div', null, _r('span', { style: { fontWeight: 700 } }, 'Mín: '), agr.min, ' μm'),
        _r('div', null, _r('span', { style: { fontWeight: 700 } }, 'Máx: '), agr.max, ' μm'),
        _r('div', null, _r('span', { style: { fontWeight: 700 } }, 'Promedio: '), agr.prom, ' μm'),
        _r('div', { style: { flex: 1, textAlign: 'right', color: '#666' } },
          '(estos valores van al Word — las mediciones individuales quedan sólo en el sistema)')
      )
    )
  );

  // ── 1.4 NOTAS / EVALUACIÓN ──────────────────────────────────────────────
  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  NOTAS Y EVALUACIÓN'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 10 } },
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3 } }, 'NOTAS'),
        _r('textarea', {
          style: { width: '100%', minHeight: 56, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: datos.notas_texto || '',
          placeholder: 'Observaciones sobre el ensayo…',
          onChange: function (e) { upd('notas_texto', e.target.value); },
        })),
      _r('div', null,
        _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3 } }, 'EVALUACIÓN DE RESULTADOS'),
        _r('textarea', {
          style: { width: '100%', minHeight: 60, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
          value: datos.evaluacion_texto || '',
          placeholder: 'Evaluación / juicio profesional (opcional)…',
          onChange: function (e) { upd('evaluacion_texto', e.target.value); },
        }))
    )
  );

  // ── 1.5 IMÁGENES DEL ENSAYO (opcional) ──────────────────────────────────
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.5  IMÁGENES DEL ENSAYO (opcional)'),
    _r('div', { style: { padding: 8 } },
      typeof window.EnsayoPhotos === 'function'
        ? _r(window.EnsayoPhotos, {
            photos: datos.imagenes_resultado || [],
            hint: 'Arrastrá las micrografías o hacé clic para seleccionar.',
            onChange: function (next) { upd('imagenes_resultado', next); },
            otsDisponibles: otsHerm,
            otNroActual: otNroActual,
          })
        : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
    )
  );

  return _r('div', { style: S.sheet },
    tabsOt,
    barraCopiarTodo,
    block11, block12, block13, block14, block15
  );
}

Object.assign(window, { EspesorRecubrimientoForm: EspesorRecubrimientoForm });
