/* ============================================================================
 * MetalografiaGeneralForm — layout espejo del preinforme físico FM-055
 * (Análisis Metalográfico General).
 *
 * Agrupa varios análisis en un único informe: microestructura, espesor de
 * recubrimiento, estructura de grafito, decarburación y otro.
 *
 * Estructura:
 *   1.1 Normas / procedimientos       (5 análisis con checkbox + ITM/ref)
 *   1.2 Verificaciones                (checkboxes OK + temperatura + zonas + muestra)
 *   1.2.1 Reactivo utilizado          (6 checkboxes + otro)
 *   1.3 Equipamiento                  (3 microscopios/termohigro con TAG + aumentos)
 *   1.4 Resultados                    (4 textareas por sección)
 *   1.5 Observaciones                 (textarea)
 * ========================================================================== */
'use strict';

var _r = React.createElement;

// Cada análisis tiene ahora DOS campos de texto libre: "Norma de ensayo" y
// "Metodología de ensayo". Las opciones/placeholder de la norma son sugerencias
// para el datalist (el técnico puede elegir o escribir libre).
var MG_ANALISIS = [
  { key: 'micro',   label: '1.1.1 MICROESTRUCTURA',            placeholder: 'Ej: ASM Metal Handbook Vol.9:2004', metodologiaPlaceholder: 'ITM N°061', opciones: ['ASM Metal Handbook Vol.9:2004'] },
  { key: 'espesor', label: '1.1.2 ESPESOR DE RECUBRIMIENTO',    placeholder: '……',                                metodologiaPlaceholder: 'ITM N°…' },
  { key: 'grafito', label: '1.1.3 ESTRUCTURA DE GRAFITO',       placeholder: '……',                                metodologiaPlaceholder: 'ITM N°…' },
  { key: 'decarb',  label: '1.1.4 DECARBURACIÓN',               placeholder: '……',                                metodologiaPlaceholder: 'ITM N°…' },
  { key: 'otro',    label: '1.1.5 OTRO',                        placeholder: '……',                                metodologiaPlaceholder: 'ITM N°…' },
];

var MG_REACTIVOS = [
  { key: 'nital2',      label: 'NITAL AL 2%' },
  { key: 'nitro_fluor', label: 'NITRO FLUOR GLICERINA' },
  { key: 'nital6',      label: 'NITAL AL 6%' },
  { key: 'vilella',     label: 'REACTIVO VILELLA' },
  { key: 'universal',   label: 'UNIVERSAL' },
  { key: 'kellers',     label: 'REACTIVO KELLERS' },
];

var MG_EQUIPOS = [
  { key: 'olympus_016', nombre: 'MICROSCOPIO OLYMPUS',       tagDefault: 'MM-016' },
  { key: 'leica_378',   nombre: 'MICROSCOPIO LEICA DM 750',  tagDefault: 'MM-378' },
  { key: 'termo_700',   nombre: 'TERMOHIGRÓMETRO',           tagDefault: 'MM-700' },
];

var MG_AUMENTOS = [
  { key: 'x50',   label: '50X' },
  { key: 'x100',  label: '100X' },
  { key: 'x200',  label: '200X' },
  { key: 'x500',  label: '500X' },
  { key: 'x1000', label: '1000X' },
];

var MG_RESULTADOS = [
  { key: 'microestructura', label: 'MICROESTRUCTURA (correlación con tratamientos térmicos)', placeholder: 'Las muestras analizadas poseen una…' },
  { key: 'grafito',         label: 'ESTRUCTURA DE GRAFITO',                                    placeholder: '…' },
  { key: 'decarburacion',   label: 'DECARBURACIÓN',                                            placeholder: '…' },
  { key: 'defectos',        label: 'DEFECTOS SUPERFICIALES',                                    placeholder: '…' },
];

function MetalografiaGeneralForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }

  var S = window.FORM_STYLES;

  // Auto-activación de secciones al abrir un ensayo existente. Si el técnico
  // cargó datos (norma, metodología, texto de resultado o imágenes) pero
  // olvidó tildar el checkbox "1.1.N", tildarlo automáticamente al abrir.
  // Sin esto, el bloque 1.6 IMÁGENES DEL ENSAYO oculta las imágenes ya
  // cargadas ("Activá al menos un análisis…") y el técnico las cree perdidas.
  function _tieneEvidenciaDeUso(datos, key) {
    var a = datos.analisis && datos.analisis[key];
    if (a && (String(a.ref || '').trim() || String(a.metodologia || '').trim())) return true;
    var textoResultado = datos.resultados_seccion && datos.resultados_seccion[key];
    if (textoResultado && String(textoResultado).trim()) return true;
    // key en resultados_seccion puede diferir del key del checkbox
    var mapeoResultado = { micro: 'microestructura', espesor: 'espesor', grafito: 'grafito', decarb: 'decarburacion', otro: 'otro' };
    var rk = mapeoResultado[key];
    var textoAlt = rk && datos.resultados_seccion && datos.resultados_seccion[rk];
    if (textoAlt && String(textoAlt).trim()) return true;
    var imgs = datos['imagenes_' + key];
    if (Array.isArray(imgs) && imgs.length > 0) return true;
    return false;
  }
  // Ejecuta la migración una sola vez, pero espera a que las imágenes estén
  // HIDRATADAS (con dataUrl) — sino, el fetch lazy del EnsayoForm puede
  // sobreescribir imagenes_resultado DESPUÉS de que migramos y perderíamos
  // el dataUrl. Trigger: cambios en imagenes_resultado (cuando se hidrata).
  var _migInit = React.useState(false); var migInit = _migInit[0], setMigInit = _migInit[1];
  var imgsLegacyLen = Array.isArray(datos.imagenes_resultado) ? datos.imagenes_resultado.length : 0;
  var imgsLegacyHidratadas = imgsLegacyLen === 0 || datos.imagenes_resultado.every(function (im) { return !im || !im._dataUrlStripped; });
  React.useEffect(function () {
    if (migInit) return;
    if (!imgsLegacyHidratadas) return; // esperar la hidratación del EnsayoForm
    var patch = {};
    MG_ANALISIS.forEach(function (n) {
      var a = datos.analisis && datos.analisis[n.key];
      if (a && a.on) return;
      if (_tieneEvidenciaDeUso(datos, n.key)) {
        patch['analisis.' + n.key + '.on'] = true;
      }
    });
    // Migración legacy imagenes_resultado → imagenes_<key> si hay UNA sección
    // activa clara.
    if (imgsLegacyLen > 0) {
      var seccionesActivasKeys = MG_ANALISIS.filter(function (n) {
        var a = datos.analisis && datos.analisis[n.key];
        return (a && a.on) || _tieneEvidenciaDeUso(datos, n.key);
      }).map(function (n) { return n.key; });
      if (seccionesActivasKeys.length === 1) {
        var targetKey = seccionesActivasKeys[0];
        var yaTiene = Array.isArray(datos['imagenes_' + targetKey]) && datos['imagenes_' + targetKey].length > 0;
        if (!yaTiene) {
          patch['imagenes_' + targetKey] = datos.imagenes_resultado;
          patch.imagenes_resultado = [];
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      Object.keys(patch).forEach(function (k) { set(k, patch[k]); });
    }
    setMigInit(true);
  }, [imgsLegacyHidratadas, imgsLegacyLen]);

  // ── 1.1 NORMAS ─────────────────────────────────────────────────────────
  var block11 = _r('div', null,
    _r('div', { style: S.head }, '1.1  NORMAS / PROCEDIMIENTOS DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', fontSize: 10.5 } },
      MG_ANALISIS.map(function (n) {
        var d = (datos.analisis && datos.analisis[n.key]) || { on: false, ref: n.defRef };
        return _r('div', { key: n.key, style: { display: 'flex', flexDirection: 'column', gap: 3 } },
          _r('label', { style: Object.assign({}, S.label, { fontWeight: 700 }) },
            _r('input', { type: 'checkbox', checked: !!d.on,
              onChange: function (e) { upd('analisis.' + n.key + '.on', e.target.checked); } }),
            n.label),
          // Norma de ensayo — texto libre con datalist opcional para sugerencias.
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 20 } },
            _r('span', { style: { color: '#555', minWidth: 130 } }, 'Norma de ensayo:'),
            _r('input', {
              style: S.inline,
              placeholder: n.placeholder || '……',
              value: d.ref || '',
              list: n.opciones && n.opciones.length ? 'mg-norm-' + n.key : undefined,
              onChange: function (e) { upd('analisis.' + n.key + '.ref', e.target.value); },
            }),
            n.opciones && n.opciones.length
              ? _r('datalist', { id: 'mg-norm-' + n.key },
                  n.opciones.map(function (op, i) { return _r('option', { key: i, value: op }); })
                )
              : null),
          // Otra norma de ensayo — opcional. Si tiene texto, se emite como una
          // segunda línea "Norma de ensayo: <ref_otra>" en el Word.
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 20 } },
            _r('span', { style: { color: '#555', minWidth: 130 } }, 'Otra norma:'),
            _r('input', {
              style: S.inline,
              placeholder: 'Opcional — Ej: ASTM E407',
              value: d.ref_otra || '',
              onChange: function (e) { upd('analisis.' + n.key + '.ref_otra', e.target.value); },
            })),
          // Metodología de ensayo — segundo campo separado. El generator ya lo
          // soporta (line "Metodología de ensayo: ${metod}").
          _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 20 } },
            _r('span', { style: { color: '#555', minWidth: 130 } }, 'Metodología de ensayo:'),
            _r('input', {
              style: S.inline,
              placeholder: n.metodologiaPlaceholder || 'ITM N°…',
              value: d.metodologia || '',
              onChange: function (e) { upd('analisis.' + n.key + '.metodologia', e.target.value); },
            }))
        );
      })
    )
  );

  // ── 1.2 VERIFICACIONES ─────────────────────────────────────────────────
  var block12 = _r('div', null,
    _r('div', { style: S.head }, '1.2  VERIFICACIONES Y CONDICIONES DE ENSAYO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 10.5 } },
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_muestra,
          onChange: function (e) { updBool('sup_muestra', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO DE SUPERFICIE:'), ' OK'),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA DE ENSAYO:'),
        _r('input', { style: Object.assign({}, S.input, S.num, { width: 56 }), value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); } }),
        _r('span', null, '°C')),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_equipo,
          onChange: function (e) { updBool('sup_equipo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO DE EQUIPO:'), ' OK'),
      _r('label', { style: S.label },
        _r('input', { type: 'checkbox', checked: !!datos.sup_reactivo,
          onChange: function (e) { updBool('sup_reactivo', e.target.checked); } }),
        _r('span', { style: { fontWeight: 600 } }, 'ESTADO DE REACTIVO:'), ' OK'),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ZONA DE ENSAYO:'),
        _r(window.ZonaInput, { tipo: 'metalografia-general', style: S.inline, placeholder: 'Ej: Núcleo, Superficie…',
          value: datos.zona_ensayo || '',
          onChange: function (e) { upd('zona_ensayo', e.target.value); } })),
      _r('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'MUESTRA ENSAYADA:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.muestra_ensayada || '',
          onChange: function (e) { upd('muestra_ensayada', e.target.value); } }))
    ),
    _r('div', { style: S.subhead }, '1.2.1  REACTIVO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 16px', fontSize: 10.5 } },
      MG_REACTIVOS.map(function (r) {
        return _r('label', { key: r.key, style: S.label },
          _r('input', { type: 'checkbox', checked: !!(datos.reactivos && datos.reactivos[r.key]),
            onChange: function (e) { upd('reactivos.' + r.key, e.target.checked); } }),
          r.label);
      }),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, gridColumn: '1 / -1' } },
        _r('span', { style: { fontWeight: 600 } }, 'Otro:'),
        _r('input', { style: S.inline, placeholder: '……', value: datos.reactivo_otro || '',
          onChange: function (e) { upd('reactivo_otro', e.target.value); } }))
    )
  );

  // ── 1.3 EQUIPAMIENTO ───────────────────────────────────────────────────
  var block13 = _r('div', null,
    _r('div', { style: S.head }, '1.3  EQUIPAMIENTO UTILIZADO'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 } },
      MG_EQUIPOS.map(function (e) {
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
      }),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 2 } },
        _r('span', { style: { fontWeight: 600 } }, 'AUMENTO UTILIZADO:'),
        MG_AUMENTOS.map(function (a) {
          return _r('label', { key: a.key, style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
            _r('input', { type: 'checkbox', checked: !!(datos.aumentos && datos.aumentos[a.key]),
              onChange: function (e) { upd('aumentos.' + a.key, e.target.checked); } }),
            a.label);
        })
      ),
      typeof window.OtrosEquiposBlock === 'function'
        ? _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } })
        : null
    )
  );

  // ── 1.4 RESULTADOS (con tabs por OT — nivel 2 multi-OT) ─────────────────
  // Si la solicitud tiene ≥2 OTs, los textos de resultado son editables por
  // OT (cada muestra puede describir cosas distintas). Las NORMAS y
  // METODOLOGÍAS de la sección 1.1 quedan globales — se comparten entre OTs.
  var otsHermMg = (function () {
    if (!props.nroOt || !window.LabStore || !window.LabStore.getOt) return null;
    var otA = window.LabStore.getOt(props.nroOt);
    if (!otA || !otA.nro_solicitud || !window.LabStore.listOtsBySolicitud) return null;
    return window.LabStore.listOtsBySolicitud(otA.nro_solicitud);
  })();
  var multiOtMg = otsHermMg && otsHermMg.length > 1;
  var otNroActualMg = String(props.nroOt || '');
  var _otActivaMg = React.useState(function () { return otNroActualMg; });
  var otActivaMg = _otActivaMg[0], setOtActivaMg = _otActivaMg[1];
  var textosPorOtMg = (datos && datos.textos_por_ot) || {};
  function getResultadoOt(nroOt, key) {
    var tot = textosPorOtMg[nroOt];
    if (tot && tot.resultados_seccion && tot.resultados_seccion[key] !== undefined) {
      return tot.resultados_seccion[key];
    }
    if (nroOt === otNroActualMg) {
      return (datos.resultados_seccion && datos.resultados_seccion[key]) || '';
    }
    return '';
  }
  function setResultadoOt(nroOt, key, val) {
    if (!multiOtMg) {
      // Modo single-OT: guardar en raíz (comportamiento anterior).
      upd('resultados_seccion.' + key, val);
      return;
    }
    var mapa = Object.assign({}, textosPorOtMg);
    mapa[nroOt] = Object.assign({}, mapa[nroOt] || {});
    mapa[nroOt].resultados_seccion = Object.assign({}, mapa[nroOt].resultados_seccion || {});
    mapa[nroOt].resultados_seccion[key] = val;
    if (nroOt === otNroActualMg) {
      // Escribir ambos: en el mapa Y en la raíz (así la OT actual sigue OK
      // aunque no se aplique la lógica de textos_por_ot).
      var seccActual = Object.assign({}, datos.resultados_seccion || {});
      seccActual[key] = val;
      set({ textos_por_ot: mapa, resultados_seccion: seccActual });
    } else {
      set('textos_por_ot', mapa);
    }
  }
  var tabsOtMg = multiOtMg ? _r('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '6px 10px', background: '#fff8e5', borderBottom: '1px solid #e0c060',
      fontSize: 11,
    },
  },
    _r('span', { style: { fontWeight: 700, color: '#8a5a00', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 10 } }, 'Editando resultados de OT:'),
    _r('div', { style: { display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' } },
      otsHermMg.map(function (o, i) {
        var nro = String(o.nro_ot);
        var activa = nro === otActivaMg;
        var esActual = nro === otNroActualMg;
        return _r('button', {
          key: nro, type: 'button',
          onClick: function () { setOtActivaMg(nro); },
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
    _r('span', { style: { fontSize: 10, color: '#8a5a00' } }, 'Cada OT puede tener textos distintos.')
  ) : null;

  var block14 = _r('div', null,
    _r('div', { style: S.head }, '1.4  RESULTADOS OBTENIDOS'),
    tabsOtMg,
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 10 } },
      MG_RESULTADOS.map(function (r) {
        return _r('div', { key: r.key },
          _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 3 } }, r.label),
          _r('textarea', { style: { width: '100%', minHeight: 56, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
            value: getResultadoOt(otActivaMg, r.key), placeholder: r.placeholder,
            onChange: function (e) { setResultadoOt(otActivaMg, r.key, e.target.value); } }));
      })
    )
  );

  // ── 1.5 OBSERVACIONES ──────────────────────────────────────────────────
  var block15 = _r('div', null,
    _r('div', { style: S.head }, '1.5  OBSERVACIONES / EVALUACIÓN ',
      _r('span', { style: { fontWeight: 400, fontSize: 9 } }, '*')),
    _r('div', { style: { padding: 8 } },
      _r('textarea', { style: { width: '100%', minHeight: 70, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical' },
        value: datos.evaluacion_texto || '', placeholder: 'Observaciones y evaluación…',
        onChange: function (e) { upd('evaluacion_texto', e.target.value); } }))
  );

  // ── 1.6 IMÁGENES POR ANÁLISIS ──────────────────────────────────────────
  // Un widget por cada análisis activado. Se insertan DENTRO de la sección
  // correspondiente en el Word (marker __IMG_<KEY>__), no al final del informe.
  var analisisActivos = MG_ANALISIS.filter(function (n) {
    return datos.analisis && datos.analisis[n.key] && datos.analisis[n.key].on;
  });
  // Botón "Cargar fotos automáticamente" — busca en subcarpetas del drive
  // (MICROGRAFIAS/M<n>/INFORMAR/*, etc.) y categoriza cada foto por sección
  // según el filename ("MICROESTRUCTURA" → micro, "GRAFITO" → grafito, etc.).
  var _cargaLoading = React.useState(false);
  var cargaLoading = _cargaLoading[0], setCargaLoading = _cargaLoading[1];
  function cargarFotosAuto() {
    var ensayoId = props.ensayoId;
    if (!ensayoId) {
      alert('Primero guardá el ensayo (aunque sea vacío) para poder cargar fotos automáticamente.');
      return;
    }
    setCargaLoading(true);
    fetch('/api/ensayo/' + ensayoId + '/fotos-auto')
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        var resumen = [];
        var patch = {};
        Object.keys(r.d.resultado || {}).forEach(function (k) {
          if (k === '_sin_clasificar') return;
          var arr = r.d.resultado[k] || [];
          if (arr.length === 0) return;
          // Concatenar sin duplicar por name.
          var existente = datos[k] || [];
          var setNames = new Set(existente.map(function (p) { return String(p.name || '').toLowerCase(); }));
          var nuevas = arr.filter(function (p) { return !setNames.has(String(p.name || '').toLowerCase()); });
          if (nuevas.length > 0) {
            patch[k] = existente.concat(nuevas);
            resumen.push(nuevas.length + ' en ' + k.replace('imagenes_', ''));
          }
        });
        if (Object.keys(patch).length > 0) set(patch);
        var sinClas = (r.d.resultado && r.d.resultado._sin_clasificar) || [];
        var msg = resumen.length > 0
          ? 'Cargadas: ' + resumen.join(', ') + (sinClas.length > 0 ? ' (' + sinClas.length + ' sin clasificar)' : '')
          : (sinClas.length > 0 ? 'No se clasificó ninguna foto (' + sinClas.length + ' sin sección detectada)' : 'No se encontraron fotos.');
        alert(msg);
      })
      .catch(function (e) { alert('Error al cargar fotos: ' + e.message); })
      .finally(function () { setCargaLoading(false); });
  }

  var block16 = _r('div', null,
    _r('div', { style: S.head }, '1.6  IMÁGENES DEL ENSAYO'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 14 } },
      // Botón de auto-carga (solo si hay análisis activos y el ensayo tiene id).
      analisisActivos.length > 0 && props.ensayoId ? _r('div', {
        style: {
          padding: '6px 10px', background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)',
          borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        },
      },
        _r('div', { style: { fontSize: 11, color: 'var(--accent)' } },
          '⚡ Busca fotos en el drive y las asigna a cada análisis por filename ("microestructura" → micro, "grafito" → grafito, etc.)'),
        _r('button', {
          type: 'button', onClick: cargarFotosAuto, disabled: cargaLoading,
          style: {
            border: '1px solid var(--accent)',
            background: cargaLoading ? 'var(--accent-soft-2)' : 'var(--accent)',
            color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            cursor: cargaLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          },
        }, cargaLoading ? 'Cargando…' : 'Cargar fotos automáticamente')
      ) : null,
      analisisActivos.length === 0
        ? _r('div', { style: { fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: 12 } },
            'Activá al menos un análisis en la sección 1.1 para poder cargar imágenes.')
        : analisisActivos.map(function (n) {
            var key = 'imagenes_' + n.key; // imagenes_micro, imagenes_espesor, etc.
            var etiqueta = n.label.replace(/^\d+(\.\d+)*\s+/, ''); // saca "1.1.1 " del prefijo
            return _r('div', { key: n.key },
              _r('div', { style: { fontSize: 10.5, fontWeight: 700, marginBottom: 4, color: 'var(--text-2)' } },
                etiqueta + ' — imágenes'),
              typeof window.EnsayoPhotos === 'function'
                ? _r(window.EnsayoPhotos, {
                    photos: datos[key] || [],
                    hint: 'Se insertan dentro de la sección "' + etiqueta + '" del Word.',
                    onChange: function (next) { upd(key, next); },
                    // Multi-OT: dropdown de OT en cada imagen (solo si hay hermanas).
                    otsDisponibles: (function () {
                      if (!props.nroOt || !window.LabStore || !window.LabStore.getOt) return null;
                      var otA = window.LabStore.getOt(props.nroOt);
                      if (!otA || !otA.nro_solicitud || !window.LabStore.listOtsBySolicitud) return null;
                      return window.LabStore.listOtsBySolicitud(otA.nro_solicitud);
                    })(),
                    otNroActual: String(props.nroOt || ''),
                  })
                : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
            );
          })
    )
  );

  return _r('div', { style: S.sheet },
    block11, block12, block13, block14, block15, block16
  );
}

Object.assign(window, { MetalografiaGeneralForm: MetalografiaGeneralForm });
