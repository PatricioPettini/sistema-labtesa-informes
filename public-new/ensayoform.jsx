/* LABTESA — Formulario de ensayo dinámico (los 8 tipos, schema-driven) */

// Lee `datos.path.to.value` para keys con dot notation (ej. 'equipamiento.foo').
function getByPath(d, k) {
  if (!k || typeof k !== 'string' || k.indexOf('.') < 0) return d == null ? undefined : d[k];
  var parts = k.split('.');
  var cur = d;
  for (var i = 0; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
  return cur;
}

function rowsKeyFor(tipo, variante) {
  return (tipo === 'ferrita-delta' && variante === 'microscopio') ? 'probetas' : 'resultados';
}

// Devuelve la sede activa para filtrar equipos del catálogo según el ensayo
// y los datos cargados. Coincide con la lógica del agente OAA. Devuelve null
// cuando el ensayo NO tiene variant que defina sede (químicos, vickers, ferrita) —
// en ese caso el form muestra equipos de ambas sedes con un chip identificador.
function computarSede(tipo, datos) {
  if (tipo === 'traccion' || tipo === 'dureza-brinell' || tipo === 'dureza-rockwell') {
    return datos.variante === 'neuquen' ? 'Neuquén' : 'CABA';
  }
  if (tipo === 'impacto')    return datos.variante === 'caba'  ? 'CABA' : 'Neuquén';
  if (tipo === 'plegado')    return (datos.equipo === 'shimadzu' || datos.equipo === 'torne') ? 'Neuquén' : 'CABA';
  if (tipo === 'nick-break') return datos.variante === 'torne' ? 'Neuquén' : 'CABA';
  return null; // quimicos, vickers, ferrita-delta → mostrar todos los equipos con chip de sede
}

function EnsayoForm(props) {
  var toast = useToast();
  var tipo = props.tipo;
  var sch = window.ENSAYO_SCHEMAS[tipo];
  var ot = window.LabStore.getOt(props.nro_ot);
  var existing = props.ensayoId ? window.LabStore.getEnsayo(props.ensayoId) : null;

  var firstVariant = sch.variants ? sch.variants[0].id : null;
  var _datos = React.useState(function () {
    if (existing) return existing.datos;
    var base = { variante: firstVariant, resultados: [], muestras: [], equipamiento: {} };
    if (tipo === 'plegado') base.equipo = sch.equipos[0].id;
    if (tipo === 'nick-break') base.variante_resultado = sch.resultVariants[0];
    if (tipo === 'ferrita-delta') base.probetas = [];
    if (sch.defaults) Object.assign(base, sch.defaults(firstVariant));

    // Pre-poblar la primera fila de la tabla de resultados — evita que el técnico
    // tenga que tocar "Agregar fila" antes de cargar datos.
    try {
      var tbl0 = sch.table(firstVariant, base);
      if (tbl0) {
        var rk = tbl0.rowsKey || ((tipo === 'ferrita-delta' && firstVariant === 'microscopio') ? 'probetas' : 'resultados');
        if (!base[rk] || base[rk].length === 0) {
          var blank = {};
          var defs = (tbl0.type === 'vertical') ? (tbl0.filas || []) : (tbl0.columns || []);
          defs.forEach(function (d) {
            // En tablas horizontales, auto-numera la columna identificadora
            if (tbl0.type !== 'vertical' && (d.key === 'probeta' || d.key === 'nombre' || d.key === 'muestra' || d.key === 'id')) {
              blank[d.key] = '1';
            } else {
              blank[d.key] = '';
            }
          });
          base[rk] = [blank];
        }
      }
    } catch (e) { /* tabla no calculable aún — ignorar */ }
    return base;
  });
  var datos = _datos[0], setDatos = _datos[1];

  // Lazy fetch de imágenes completas al abrir un ensayo existente. El init
  // de LabStore trae los ensayos SIN los base64 de imagenes* (payload grande
  // se cortaría). Al abrir el form, si detectamos imágenes marcadas con
  // `_dataUrlStripped: true`, pedimos el ensayo completo al servidor y
  // reemplazamos SOLO los campos imagenes_* en el state. Los demás campos
  // (que el técnico puede haber empezado a editar) no se tocan.
  React.useEffect(function () {
    if (!existing || !existing.id) return;
    var necesitaFetch = Object.keys(datos || {}).some(function (k) {
      if (!/^imagenes/i.test(k)) return false;
      if (!Array.isArray(datos[k])) return false;
      return datos[k].some(function (img) { return img && img._dataUrlStripped; });
    });
    if (!necesitaFetch) return;
    fetch('/api/ensayo/' + existing.id)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (row) {
        if (!row || !row.datos) return;
        setDatos(function (prev) {
          var next = Object.assign({}, prev);
          Object.keys(row.datos).forEach(function (k) {
            if (/^imagenes/i.test(k) && Array.isArray(row.datos[k])) {
              next[k] = row.datos[k];
            }
          });
          return next;
        });
      })
      .catch(function () { /* silencioso — el técnico verá el widget vacío */ });
  }, [existing && existing.id]);

  // Auto-tildado: cuando el técnico escribe en un input que tiene un checkbox
  // "hermano" asociado, tildar automáticamente el checkbox. Se detecta por
  // patrones de nombres del par (campo texto, campo checkbox):
  //   1) `<X>_text`      ↔  `<X>_chk`           (ej. metodo_soldadura_text ↔ metodo_soldadura_chk)
  //   2) `<X>_otra`      ↔  `<X>_otra_chk`      (ej. norma_otra ↔ norma_otra_chk)
  //   3) `<X>_otro`      ↔  `<X>_otro_chk`      (ej. cod_otro ↔ cod_otro_chk)
  //   4) `instrumentos_tags.<K>`  ↔  `instrumentos.<K>`
  //   5) `equipamiento_tags.<K>`  ↔  `equipamiento.<K>`
  // Solo tilda (no destilda) — así el técnico puede destildar manualmente
  // sin que se vuelva a tildar por su propio texto.
  // Pares conocidos "input libre" ↔ "checkbox". Cuando el técnico escribe en
  // el input, tildar el checkbox. La lista se extiende con cada nuevo par
  // detectado en un form.
  var _PARES_CHK_CONOCIDOS = {
    // Químicos
    patron: 'patron_chk',
    calibracion: 'calibracion_chk',
    seleccion_base: 'seleccion_base_chk',
  };
  function _pareChkKey(k, obj) {
    if (typeof k !== 'string') return null;
    // 1) Diccionario explícito.
    if (_PARES_CHK_CONOCIDOS[k]) return _PARES_CHK_CONOCIDOS[k];
    // 2) Sufijos conocidos.
    if (/^(.+)_text$/.test(k))  return k.replace(/_text$/, '_chk');
    if (/^(.+)_otra$/.test(k))  return k + '_chk';
    if (/^(.+)_otro$/.test(k))  return k + '_chk';
    // 3) Dot-notation: instrumentos_tags.foo → instrumentos.foo
    var mTag = k.match(/^(instrumentos|equipamiento)_tags\.(.+)$/);
    if (mTag) return mTag[1] + '.' + mTag[2];
    // 4) Heurística dinámica: si <k>_chk existe como key en el estado actual
    //    (por default o por interacción previa), asumir que es su par.
    if (obj && Object.prototype.hasOwnProperty.call(obj, k + '_chk')) return k + '_chk';
    return null;
  }
  function _leerCampo(obj, path) {
    if (!path) return undefined;
    if (path.indexOf('.') < 0) return obj[path];
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function _escribirCampo(obj, path, val) {
    if (path.indexOf('.') < 0) { obj[path] = val; return; }
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = Object.assign({}, cur[parts[i]] || {});
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  function _aplicarAutoChk(n, k, v) {
    // Solo dispara con strings no vacíos.
    if (typeof v !== 'string' || !v.trim()) return;
    var chkKey = _pareChkKey(k, n);
    if (!chkKey) {
      // DEBUG: sin par asociado — no se aplica auto-chk. Se comenta cuando
      // esté todo estable. Descomentar si el técnico reporta que no funciona.
      // console.log('[auto-chk] sin par para "' + k + '" val="' + v.slice(0,30) + '"');
      return;
    }
    var actual = _leerCampo(n, chkKey);
    if (actual) {
      console.log('[auto-chk] "' + k + '" → "' + chkKey + '" ya tildado, skip');
      return;
    }
    _escribirCampo(n, chkKey, true);
    console.log('[auto-chk] "' + k + '" → tildó "' + chkKey + '"');
  }

  function set(k, v) {
    // Forma callback: set(function(prev) { return next; })
    if (typeof k === 'function') { setDatos(k); return; }
    setDatos(function (d) {
      var n = Object.assign({}, d);
      if (typeof k === 'object') {
        Object.assign(n, k);
        // Auto-chk para cada key del objeto patch.
        Object.keys(k).forEach(function (kk) { _aplicarAutoChk(n, kk, k[kk]); });
        return n;
      }
      // Soporte dot-notation: 'equipamiento.foo' setea n.equipamiento = { ...n.equipamiento, foo: v }
      if (typeof k === 'string' && k.indexOf('.') > 0) {
        var parts = k.split('.');
        var cur = n;
        for (var i = 0; i < parts.length - 1; i++) {
          cur[parts[i]] = Object.assign({}, cur[parts[i]] || {});
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = v;
        _aplicarAutoChk(n, k, v);
        return n;
      }
      n[k] = v;
      _aplicarAutoChk(n, k, v);
      return n;
    });
  }
  function setVariant(v) { setDatos(function (d) { return Object.assign({}, d, { variante: v }); }); }

  if (!ot) return React.createElement('div', { className: 'page' }, React.createElement(EmptyState, { icon: 'search', title: 'OT no encontrada', action: React.createElement(Button, { onClick: function () { nav('#/'); } }, 'Volver') }));

  var sections = sch.sections(datos.variante, datos);
  // Algunos ensayos no tienen tabla principal (la tabla es inline en una sección).
  var tbl = (typeof sch.table === 'function') ? sch.table(datos.variante, datos) : null;
  var rowsKey = (tbl && tbl.rowsKey) ? tbl.rowsKey : rowsKeyFor(tipo, datos.variante);
  var rows = datos[rowsKey] || [];
  var _mark = React.useState(false); var markEmpty = _mark[0], setMark = _mark[1];
  var _fm = React.useState(false); var fmOpen = _fm[0], setFmOpen = _fm[1]; // modal de firma al guardar
  var _ex = React.useState(existing); var ex = _ex[0], setEx = _ex[1]; // estado de firma reactivo del ensayo
  // Modal "desfirmar y guardar": aparece cuando se intenta guardar un ensayo
  // firmado (propio o de una OT hermana en multi-OT). Al confirmar el token,
  // se desfirma el ensayo y se ejecuta el retry (que reintenta el save).
  // { ensayoId, estadoFirma, retry: () => void } | null
  var _dfm = React.useState(null); var desfirmarDlg = _dfm[0], setDesfirmarDlg = _dfm[1];
  var esFirmado = !!(ex && (ex.estado_firma === 'revisado' || ex.estado_firma === 'autorizado'));
  var esAprobado = !!(ex && ex.estado_firma === 'autorizado');
  var firmadoPor = ex && (ex.firmado_por || ex.revisado_por);

  function tableEmpties() {
    if (!tbl || !tbl.required || tbl.type === 'vertical') return 0;
    var n = 0;
    rows.forEach(function (r) { tbl.columns.forEach(function (c) { if (r[c.key] == null || String(r[c.key]).trim() === '') n++; }); });
    return n;
  }

  // Handler común de error 423 (ENSAYO_FIRMADO / ENSAYO_APROBADO) que puede
  // venir de una OT hermana en multi-OT. Muestra el modal de desfirma con retry.
  function manejarErrorFirma(e, retryFn) {
    if (!e) return false;
    var d = e.data || {};
    if (e.code === 'ENSAYO_FIRMADO' || e.code === 'ENSAYO_APROBADO' || d.code === 'ENSAYO_FIRMADO' || d.code === 'ENSAYO_APROBADO') {
      setDesfirmarDlg({
        ensayoId: d.ensayo_id || (ex && ex.id),
        estadoFirma: d.estado_firma || (ex && ex.estado_firma) || 'firmado',
        // Puede que el ensayo firmado sea de una OT HERMANA, no la actual —
        // en ese caso el ensayoId puede ser distinto.
        contexto: d.ensayo_id && ex && d.ensayo_id !== ex.id ? 'hermana' : 'actual',
        retry: retryFn,
      });
      return true;
    }
    return false;
  }

  function save() {
    if (esFirmado) {
      // En vez de bloquear con toast, ofrecer desfirma + reintento inline.
      setDesfirmarDlg({
        ensayoId: ex && ex.id,
        estadoFirma: (ex && ex.estado_firma) || 'firmado',
        contexto: 'actual',
        retry: function () {
          // Refrescar el `ex` local a estado abierto antes de reintentar.
          setEx(function (prev) { return Object.assign({}, prev || {}, { estado_firma: 'abierto', firmado_por: null, revisado_por: null }); });
          // Llamar save() en el próximo tick — el estado ya se propagó y esFirmado será false.
          setTimeout(save, 0);
        },
      });
      return;
    }
    if (tbl && tbl.required) {
      var usarLados = tipo === 'traccion' && !!datos.usar_lados;
      var total = usarLados
        ? (datos.lados || []).reduce(function (a, l) { return a + ((l.muestras || []).length); }, 0)
        : rows.length;
      if (total === 0) { setMark(true); toast('Agregá al menos una ' + (tbl.type === 'vertical' ? 'muestra' : 'fila') + ' de resultados', 'warning'); return; }
    }
    var clean = Object.assign({}, datos);
    // Split multi-OT en tracción: si hay muestras asignadas a otras OTs (via
    // nro_ot_override), disparar el save por cada OT destino. Cada ensayo
    // termina con solo sus muestras propias; el ensayo actual se guarda con
    // las suyas y las hermanas se crean/actualizan.
    if (tipo === 'traccion' && Array.isArray(clean.muestras)) {
      var hayOverrideOtra = clean.muestras.some(function (m) {
        var over = String((m && m.nro_ot_override) || '').trim();
        return over && over !== String(ot.nro_ot);
      });
      // Split también si hay condiciones_por_ot con datos para OTs hermanas
      // (permite propagar la sección 1.2 sin tener overrides de muestras).
      var hayCondsOtrasTx = clean.condiciones_por_ot && Object.keys(clean.condiciones_por_ot).some(function (n) {
        return n !== String(ot.nro_ot) && Object.keys(clean.condiciones_por_ot[n] || {}).length > 0;
      });
      if ((hayOverrideOtra || hayCondsOtrasTx) && typeof window.LabStore.saveEnsayoTraccionMultiOt === 'function') {
        window.LabStore.saveEnsayoTraccionMultiOt(ot.nro_ot, clean, existing ? existing.id : null)
          .then(function (resumen) {
            var msg = 'Tracción guardada · ' + resumen.otActual.cantidad + ' en OT ' + resumen.otActual.nro_ot;
            resumen.otsHermanas.forEach(function (h) {
              msg += ' · ' + h.cantidad + ' ' + h.accion + ' en OT ' + h.nro_ot;
            });
            toast(msg, 'success');
            nav('#/ot/' + ot.nro_ot);
          })
          .catch(function (e) {
            if (manejarErrorFirma(e, save)) return;
            toast('Error al sincronizar multi-OT: ' + e.message, 'danger');
          });
        return;
      }
    }
    // Split multi-OT en plegado (mismo patrón que tracción).
    if (tipo === 'plegado' && Array.isArray(clean.resultados)) {
      var hayOverridePlg = clean.resultados.some(function (r) {
        var over = String((r && r.nro_ot_override) || '').trim();
        return over && over !== String(ot.nro_ot);
      });
      if (hayOverridePlg && typeof window.LabStore.saveEnsayoPlegadoMultiOt === 'function') {
        window.LabStore.saveEnsayoPlegadoMultiOt(ot.nro_ot, clean, existing ? existing.id : null)
          .then(function (resumen) {
            var msg = 'Plegado guardado · ' + resumen.otActual.cantidad + ' en OT ' + resumen.otActual.nro_ot;
            resumen.otsHermanas.forEach(function (h) {
              msg += ' · ' + h.cantidad + ' ' + h.accion + ' en OT ' + h.nro_ot;
            });
            toast(msg, 'success');
            nav('#/ot/' + ot.nro_ot);
          })
          .catch(function (e) {
            if (manejarErrorFirma(e, save)) return;
            toast('Error al sincronizar multi-OT: ' + e.message, 'danger');
          });
        return;
      }
    }
    // Split multi-OT en impacto (mismo patrón que tracción/plegado).
    if (tipo === 'impacto' && Array.isArray(clean.resultados)) {
      var hayOverrideImp = clean.resultados.some(function (r) {
        var over = String((r && r.nro_ot_override) || '').trim();
        return over && over !== String(ot.nro_ot);
      });
      if (hayOverrideImp && typeof window.LabStore.saveEnsayoImpactoMultiOt === 'function') {
        window.LabStore.saveEnsayoImpactoMultiOt(ot.nro_ot, clean, existing ? existing.id : null)
          .then(function (resumen) {
            var msg = 'Impacto guardado · ' + resumen.otActual.cantidad + ' en OT ' + resumen.otActual.nro_ot;
            resumen.otsHermanas.forEach(function (h) {
              msg += ' · ' + h.cantidad + ' ' + h.accion + ' en OT ' + h.nro_ot;
            });
            toast(msg, 'success');
            nav('#/ot/' + ot.nro_ot);
          })
          .catch(function (e) {
            if (manejarErrorFirma(e, save)) return;
            toast('Error al sincronizar multi-OT: ' + e.message, 'danger');
          });
        return;
      }
    }
    // Split multi-OT en metalografía general / anexo metalográfico. Se dispara si:
    //   a) Al menos una imagen tiene `nro_ot_override` distinto, O
    //   b) `textos_por_ot` tiene datos para alguna OT hermana, O
    //   c) `condiciones_por_ot` tiene datos para alguna OT hermana.
    // Antes solo miraba (a) — bug: textos por OT no llegaban a hermanas.
    var IMG_KEYS_META = tipo === 'metalografia-general'
      ? ['imagenes_micro', 'imagenes_espesor', 'imagenes_grafito', 'imagenes_decarb']
      : (tipo === 'anexo-metalografico' ? ['imagenes_grano', 'imagenes_inclusiones'] : null);
    if (IMG_KEYS_META) {
      var otActualStr = String(ot.nro_ot);
      var hayOverrideImg = IMG_KEYS_META.some(function (k) {
        return (clean[k] || []).some(function (p) {
          var over = String((p && p.nro_ot_override) || '').trim();
          return over && over !== otActualStr;
        });
      });
      var hayTextosOtras = clean.textos_por_ot && Object.keys(clean.textos_por_ot).some(function (n) {
        if (n === otActualStr) return false;
        var m = clean.textos_por_ot[n] || {};
        return Object.keys(m).some(function (k) {
          var v = m[k];
          if (v == null) return false;
          if (typeof v === 'string') return v.trim() !== '';
          if (typeof v === 'object') return Object.keys(v).length > 0;
          return true;
        });
      });
      var hayCondsOtras = clean.condiciones_por_ot && Object.keys(clean.condiciones_por_ot).some(function (n) {
        return n !== otActualStr && Object.keys(clean.condiciones_por_ot[n] || {}).length > 0;
      });
      var necesitaSplit = hayOverrideImg || hayTextosOtras || hayCondsOtras;
      var fnMulti = tipo === 'metalografia-general'
        ? window.LabStore.saveEnsayoMetalografiaGeneralMultiOt
        : window.LabStore.saveEnsayoAnexoMetalograficoMultiOt;
      if (necesitaSplit && typeof fnMulti === 'function') {
        fnMulti.call(window.LabStore, ot.nro_ot, clean, existing ? existing.id : null)
          .then(function (resumen) {
            var etiqueta = tipo === 'metalografia-general' ? 'Metalografía general' : 'Anexo metalográfico';
            var msg = etiqueta + ' guardado · ' + resumen.otActual.cantidad + ' img en OT ' + resumen.otActual.nro_ot;
            resumen.otsHermanas.forEach(function (h) {
              msg += ' · ' + h.cantidad + ' ' + h.accion + ' en OT ' + h.nro_ot;
            });
            toast(msg, 'success');
            nav('#/ot/' + ot.nro_ot);
          })
          .catch(function (e) {
            if (manejarErrorFirma(e, save)) return;
            toast('Error al sincronizar multi-OT: ' + e.message, 'danger');
          });
        return;
      }
    }
    window.LabStore.saveEnsayo(ot.nro_ot, tipo, clean, existing ? existing.id : null, {
      onError: function (er) { return manejarErrorFirma(er, save); },
    });
    toast((window.LabStore.labels[tipo] || 'Ensayo') + ' guardado', 'success');
    nav('#/ot/' + ot.nro_ot);
  }

  // Guarda el ensayo y lo firma (nivel "Firmó") con el token. Token obligatorio:
  // si es inválido no se guarda nada. Al firmar, el ensayo queda bloqueado y
  // registra quién lo cargó. Se desbloquea con "Desfirmar" (token).
  function guardarYFirmar(token) {
    var clean = Object.assign({}, datos);
    return fetch('/api/firma/verificar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, nivel: 'revisar' }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Token inválido.');
        return window.LabStore.saveEnsayoAsync(ot.nro_ot, tipo, clean, existing ? existing.id : null);
      })
      .then(function (row) {
        return fetch('/api/ensayo/' + row.id + '/firmar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token, nivel: 'revisar' }),
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
          .then(function (r) { if (!r.ok) throw new Error(r.d.hint || r.d.error || 'Error al firmar'); return { row: row, nombre: r.d.nombre }; });
      })
      .then(function (res) {
        // Sincronizar la cache local para que al reabrir el ensayo aparezca firmado/bloqueado.
        try {
          if (window.LabStore.patchEnsayoFirma) {
            window.LabStore.patchEnsayoFirma(res.row.id, {
              estado_firma: 'revisado', revisado_por: res.nombre, revisado_en: new Date().toISOString(),
            });
          }
        } catch (_) {}
        setFmOpen(false);
        toast((window.LabStore.labels[tipo] || 'Ensayo') + ' guardado y firmado por ' + (res.nombre || ''), 'success');
        nav('#/ot/' + ot.nro_ot);
      });
  }
  React.useEffect(function () {
    function onKey(e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  });

  return React.createElement('div', { className: 'page page-mid' },
    React.createElement(Breadcrumb, { items: [
      { label: 'OTs', onClick: function () { nav('#/'); } },
      { label: 'OT ' + ot.nro_ot, onClick: function () { nav('#/ot/' + ot.nro_ot); } },
      { label: 'Ensayo de ' + window.LabStore.labels[tipo] },
    ]}),
    React.createElement('header', { className: 'page-head' },
      React.createElement('div', { className: 'detail-title' },
        React.createElement('span', { className: 'ensayo-head-ic' }, React.createElement(Icon, { name: window.ENSAYO_ICON[tipo], size: 22 })),
        React.createElement('div', null,
          React.createElement('h1', { className: 'page-title' }, 'Ensayo de ' + window.LabStore.labels[tipo]),
          React.createElement('p', { className: 'page-sub' }, sch.descr)
        )
      )
    ),

    React.createElement(OTBanner, { ot: ot }),

    // Agente sugerencia de norma + edición acreditada — banner inline.
    typeof window.OAAHintBanner === 'function'
      ? React.createElement(window.OAAHintBanner, { tipo: tipo, datos: datos })
      : null,

    typeof window.PlantillasBar === 'function'
      ? React.createElement(window.PlantillasBar, {
          tipo: tipo,
          datos: datos,
          onApply: function (nuevosDatos) {
            // Fusiona la plantilla al estado actual. Preserva la variante actual
            // si la plantilla no la trae, y no toca campos identificatorios de la OT.
            setDatos(function (d) {
              return Object.assign({}, nuevosDatos, {
                variante: nuevosDatos.variante || d.variante,
              });
            });
          }
        })
      : null,

    sch.pending ? React.createElement('div', { className: 'pending-banner' },
      React.createElement(Icon, { name: 'alertTri', size: 16 }),
      React.createElement('span', null, 'Tipo de ensayo en desarrollo. Los campos pueden ajustarse en próximas versiones.')) : null,

    sch.variants ? React.createElement('div', { className: 'variant-block' },
      React.createElement('span', { className: 'variant-block-label' }, 'Variante del ensayo'),
      React.createElement(VariantToggle, { options: sch.variants, value: datos.variante, onChange: setVariant })
    ) : null,

    esFirmado ? React.createElement('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', margin: '4px 0 10px',
        background: esAprobado ? '#fdecea' : '#fff4e0',
        border: '1px solid ' + (esAprobado ? '#c04' : '#e0b060'),
        borderRadius: 8, color: esAprobado ? '#8a1a1a' : '#8a5a00',
        fontSize: 13, fontWeight: 600
      } },
      React.createElement(Icon, { name: 'lock', size: 16 }),
      React.createElement('span', null,
        esAprobado
          ? 'Ensayo APROBADO' + (firmadoPor ? ' por ' + firmadoPor : '') + ' — bloqueado para edición. Desfirmalo con un token de AUTORIZANTE (desde el chip de firma en la lista de ensayos de la OT).'
          : 'Ensayo FIRMADO' + (firmadoPor ? ' por ' + firmadoPor : '') + ' — bloqueado para edición. Desfirmalo con un token (desde el chip de firma en la lista de ensayos de la OT).'
      )
    ) : null,

    React.createElement('div', {
      className: 'ensayo-form',
      style: esFirmado ? { pointerEvents: 'none', opacity: 0.55, userSelect: 'text' } : null
    },
      // Impacto y Tracción usan layouts custom espejo del preinforme físico
      // (FM-039 y FM-037 respectivamente). Los otros ensayos siguen usando
      // el layout genérico basado en `sections`.
      tipo === 'impacto' && typeof window.ImpactoForm === 'function'
        ? React.createElement(window.ImpactoForm, { datos: datos, set: set, otNro: props.nro_ot })
        : null,
      tipo === 'traccion' && typeof window.TraccionForm === 'function'
        ? React.createElement(window.TraccionForm, { datos: datos, set: set, otNro: props.nro_ot })
        : null,
      tipo === 'plegado' && typeof window.PlegadoForm === 'function'
        ? React.createElement(window.PlegadoForm, { datos: datos, set: set, otNro: props.nro_ot })
        : null,
      tipo === 'quimicos' && typeof window.QuimicosForm === 'function'
        ? React.createElement(window.QuimicosForm, { datos: datos, set: set })
        : null,
      tipo === 'dureza-brinell' && typeof window.BrinellForm === 'function'
        ? React.createElement(window.BrinellForm, { datos: datos, set: set })
        : null,
      tipo === 'varios' && typeof window.VariosForm === 'function'
        ? React.createElement(window.VariosForm, { datos: datos, set: set, ensayoId: existing ? existing.id : null, nroOt: props.nro_ot, tipo: tipo })
        : null,
      tipo === 'dureza-vickers' && typeof window.VickersForm === 'function'
        ? React.createElement(window.VickersForm, { datos: datos, set: set, ensayoId: existing ? existing.id : null, nroOt: props.nro_ot, tipo: tipo })
        : null,
      tipo === 'dureza-rockwell' && typeof window.RockwellForm === 'function'
        ? React.createElement(window.RockwellForm, { datos: datos, set: set, ensayoId: existing ? existing.id : null, nroOt: props.nro_ot, tipo: tipo })
        : null,
      tipo === 'nick-break' && typeof window.NickBreakForm === 'function'
        ? React.createElement(window.NickBreakForm, { datos: datos, set: set })
        : null,
      (tipo === 'ferrita-delta' && (datos.variante || 'fischer') !== 'microscopio' && typeof window.FerritaForm === 'function')
        ? React.createElement(window.FerritaForm, { datos: datos, set: set })
        : null,
      tipo === 'macrografia' && typeof window.MacrografiaForm === 'function'
        ? React.createElement(window.MacrografiaForm, { datos: datos, set: set, ensayoId: existing ? existing.id : null, nroOt: props.nro_ot, tipo: tipo })
        : null,
      tipo === 'rugosidad' && typeof window.RugosidadForm === 'function'
        ? React.createElement(window.RugosidadForm, { datos: datos, set: set })
        : null,
      tipo === 'liquidos-penetrantes' && typeof window.LiquidosPenetrantesForm === 'function'
        ? React.createElement(window.LiquidosPenetrantesForm, { datos: datos, set: set })
        : null,
      tipo === 'metalografia-general' && typeof window.MetalografiaGeneralForm === 'function'
        ? React.createElement(window.MetalografiaGeneralForm, { datos: datos, set: set, ensayoId: existing ? existing.id : null, nroOt: props.nro_ot, tipo: tipo })
        : null,
      tipo === 'anexo-metalografico' && typeof window.AnexoMetalograficoForm === 'function'
        ? React.createElement(window.AnexoMetalograficoForm, { datos: datos, set: set, ensayoId: existing ? existing.id : null, nroOt: props.nro_ot, tipo: tipo })
        : null,
      tipo === 'tratamientos-termicos' && typeof window.TratamientosTermicosForm === 'function'
        ? React.createElement(window.TratamientosTermicosForm, { datos: datos, set: set, ensayoId: existing ? existing.id : null, nroOt: props.nro_ot, tipo: tipo })
        : null,
      (tipo === 'impacto' || tipo === 'traccion' || tipo === 'plegado' || tipo === 'quimicos' || tipo === 'dureza-brinell' || tipo === 'varios' || tipo === 'dureza-vickers' || tipo === 'dureza-rockwell' || tipo === 'nick-break' || tipo === 'macrografia' || tipo === 'rugosidad' || tipo === 'liquidos-penetrantes' || tipo === 'metalografia-general' || tipo === 'anexo-metalografico' || tipo === 'tratamientos-termicos' || (tipo === 'ferrita-delta' && (datos.variante || 'fischer') !== 'microscopio')) ? null : sections.map(function (sec, si) {
        var sectionContent;
        if (sec.type === 'equipoBoxes') {
          sectionContent = React.createElement(EquipoBoxes, {
            equipos: sec.equipos,
            equipamiento: datos.equipamiento || {},
            equipamientoExtra: datos.equipamiento_extra || [],
            tipo: tipo,
            sede: computarSede(tipo, datos),
            onChange:      function (next) { set('equipamiento', next); },
            onChangeExtra: function (next) { set('equipamiento_extra', next); },
          });
        } else if (sec.type === 'photos') {
          sectionContent = React.createElement('div', null,
            typeof window.AutoLoadPhotosBtn === 'function'
              ? React.createElement(window.AutoLoadPhotosBtn, {
                  ensayoId: existing ? existing.id : null,
                  nroOt: props.nro_ot, tipo: tipo,
                  datos: datos, set: set,
                  campos: [sec.key],
                  hint: '⚡ Busca fotos en el drive y las asigna a esta sección automáticamente.',
                })
              : null,
            React.createElement(EnsayoPhotos, {
              photos: datos[sec.key] || [],
              hint: sec.hint,
              onChange: function (next) { set(sec.key, next); },
              // Multi-OT: dropdown de OT en cada imagen si hay hermanas.
              otsDisponibles: (function () {
                if (!window.LabStore || !window.LabStore.getOt) return null;
                var otA = window.LabStore.getOt(props.nro_ot);
                if (!otA || !otA.nro_solicitud || !window.LabStore.listOtsBySolicitud) return null;
                return window.LabStore.listOtsBySolicitud(otA.nro_solicitud);
              })(),
              otNroActual: String(props.nro_ot || ''),
            })
          );
        } else if (sec.type === 'dynamicTable') {
          try {
            sectionContent = React.createElement(DynamicTable, {
              value: datos[sec.key],
              rowLabel: sec.rowLabel || 'Fila',
              onChange: function (next) { set(sec.key, next); },
            });
          } catch (err) {
            console.error('DynamicTable error:', err);
            sectionContent = React.createElement('div', { style: { color: 'red', padding: 12 } },
              'Error en tabla dinámica: ' + (err && err.message ? err.message : String(err)));
          }
        } else if (sec.equipoToggle) {
          sectionContent = React.createElement(EquipoToggle, {
            equipos: sch.equipos,
            value: datos.equipo,
            onChange: function (v) { set({ equipo: v, equipamiento: {} }); },
          });
        } else if (sec.resultPicker) {
          sectionContent = React.createElement(ResultPicker, {
            options: sch.resultVariants,
            value: datos.variante_resultado,
            onChange: function (v) { set('variante_resultado', v); },
          });
        } else {
          sectionContent = React.createElement('div', { className: 'form-grid cols-' + (sec.cols || 2) },
            sec.fields.map(function (fld) {
              return React.createElement(Field, { key: fld.key, label: fld.label, hint: fld.hint, span: fld.type === 'textarea' ? sec.cols : 1 },
                renderEnsayoField(fld, tipo, datos, set)
              );
            })
          );
        }
        return React.createElement(FormSection, { key: si + '-' + datos.variante, title: sec.title }, sectionContent);
      }),

      (tbl && tipo !== 'impacto' && tipo !== 'traccion' && tipo !== 'plegado' && tipo !== 'quimicos' && tipo !== 'dureza-brinell' && tipo !== 'dureza-vickers' && tipo !== 'dureza-rockwell' && tipo !== 'nick-break' && tipo !== 'macrografia' && tipo !== 'rugosidad' && tipo !== 'liquidos-penetrantes' && tipo !== 'metalografia-general' && tipo !== 'anexo-metalografico' && !(tipo === 'ferrita-delta' && (datos.variante || 'fischer') !== 'microscopio')) ? (function () {
        var usarLados = tipo === 'traccion' && !!datos.usar_lados;
        var lados = datos.lados || [];
        var totalMuestrasLados = lados.reduce(function (a, l) { return a + ((l.muestras || []).length); }, 0);
        var countText = usarLados
          ? lados.length + ' lado(s) · ' + totalMuestrasLados + ' muestra(s)'
          : rows.length + (tbl.type === 'vertical' ? ' muestra(s)' : ' fila(s)');
        return React.createElement('section', { className: 'results-sec' + (markEmpty && tbl.required ? ' has-error' : '') },
          React.createElement('div', { className: 'results-sec-head' },
            React.createElement('h3', null, 'Resultados', tbl.optional ? React.createElement('span', { className: 'opt-tag' }, 'opcional') : null),
            React.createElement('span', { className: 'results-count' }, countText)
          ),
          usarLados
            ? React.createElement(LadosEditor, { lados: lados, filas: tbl.filas, markEmpty: markEmpty && tbl.required,
                onChange: function (next) { set('lados', next); } })
            : (tbl.type === 'vertical'
                ? React.createElement(VerticalDataTable, { filas: tbl.filas, rows: rows, markEmpty: markEmpty && tbl.required, onChange: function (next) { set(rowsKey, next); } })
                : React.createElement(DataTable, { columns: tbl.columns, rows: rows, markEmpty: markEmpty && tbl.required, onChange: function (next) { set(rowsKey, next); } }))
        );
      })() : null
    ),

    // Panel de firma del ensayo — al final, después de todo el form.
    // Solo se muestra si el ensayo ya está guardado (tiene id en DB).
    (ex && typeof window.FirmaEnsayoPanel === 'function')
      ? React.createElement(window.FirmaEnsayoPanel, {
          ensayo: ex,
          onChange: function (nuevo) {
            // Reflejar el nuevo estado de firma (bloquear/desbloquear) y sincronizar
            // la cache local para que al reabrir el ensayo se mantenga el estado.
            if (nuevo) {
              setEx(Object.assign({}, ex, nuevo));
              if (window.LabStore.patchEnsayoFirma && props.ensayoId) {
                try { window.LabStore.patchEnsayoFirma(props.ensayoId, nuevo); } catch (_) {}
              }
            }
          },
        })
      : null,

    // (Se removió el modal de firma-al-guardar. La firma/aprobación se hace
    // desde el chip inline en la lista de ensayos de la OT.)

    React.createElement('div', { className: 'form-footer' },
      React.createElement(Button, { variant: 'ghost', icon: 'arrowLeft', onClick: function () { nav('#/ot/' + ot.nro_ot); } }, 'Volver a la OT'),
      React.createElement('div', { className: 'form-footer-r' },
        React.createElement('span', { className: 'kbd-hint' }, React.createElement('kbd', null, 'Ctrl'), '+', React.createElement('kbd', null, 'S')),
        React.createElement(Button, { variant: 'primary', icon: 'save', onClick: save }, existing ? 'Guardar cambios' : 'Guardar ensayo')
      )
    ),
    // Modal "Desfirmar y guardar": aparece cuando se intenta guardar un ensayo
    // firmado (propio o de una OT hermana). Pide token y ejecuta desfirma +
    // reintento del guardado en un solo paso.
    desfirmarDlg
      ? React.createElement(DesfirmarYGuardarModal, {
          ensayoId: desfirmarDlg.ensayoId,
          estadoFirma: desfirmarDlg.estadoFirma,
          contexto: desfirmarDlg.contexto,
          onCancel: function () { setDesfirmarDlg(null); },
          onOk: function () {
            var retry = desfirmarDlg.retry;
            setDesfirmarDlg(null);
            if (typeof retry === 'function') retry();
          },
        })
      : null
  );
}

// Modal para desfirmar un ensayo (con token) y luego reintentar el guardado.
// Recibe ensayoId + estadoFirma. Al confirmar hace POST /api/ensayo/:id/desfirmar
// y si sale OK, llama onOk() que dispara el retry del save original.
function DesfirmarYGuardarModal(props) {
  var _tok = React.useState(''); var token = _tok[0], setToken = _tok[1];
  var _mot = React.useState(''); var motivo = _mot[0], setMotivo = _mot[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err = React.useState(''); var err = _err[0], setErr = _err[1];

  var esAprobado = props.estadoFirma === 'autorizado';
  var titulo = esAprobado ? 'Desfirmar ensayo APROBADO' : 'Desfirmar ensayo FIRMADO';
  var subtitulo = props.contexto === 'hermana'
    ? 'Una OT hermana tiene este ensayo firmado (id ' + props.ensayoId + '). Para sincronizar los cambios, hay que desfirmar primero.'
    : (esAprobado
        ? 'Necesitás un token con rol AUTORIZANTE para desfirmar.'
        : 'Ingresá un token válido para desfirmar y aplicar los cambios.');

  function submit() {
    if (!token.trim()) { setErr('Ingresá el token.'); return; }
    setBusy(true); setErr('');
    fetch('/api/ensayo/' + props.ensayoId + '/desfirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim(), motivo: motivo.trim() || null }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { setErr(r.d.error || 'No se pudo desfirmar'); setBusy(false); return; }
        setBusy(false);
        props.onOk();
      })
      .catch(function (e) { setErr(e.message); setBusy(false); });
  }

  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    onClick: function (e) { if (e.target === e.currentTarget) props.onCancel(); },
  },
    React.createElement('div', { style: { background: '#fff', borderRadius: 8, width: 'min(90vw, 460px)', overflow: 'hidden' } },
      React.createElement('div', { style: { background: '#fff8e5', borderBottom: '1px solid #e0c060', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement(window.Icon, { name: 'lock', size: 20, style: { color: '#8a5a00' } }),
        React.createElement('div', null,
          React.createElement('h3', { style: { margin: 0, color: '#8a5a00', fontSize: 15 } }, titulo),
          React.createElement('div', { style: { fontSize: 12, color: '#8a5a00c0', marginTop: 3 } }, subtitulo)
        )
      ),
      React.createElement('div', { style: { padding: 20 } },
        React.createElement('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Token' + (esAprobado ? ' (autorizante)' : '') + ':'),
        React.createElement('input', {
          type: 'password', autoFocus: true, value: token,
          onChange: function (e) { setToken(e.target.value); },
          onKeyDown: function (e) { if (e.key === 'Enter' && !busy) submit(); },
          style: { width: '100%', padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13, marginBottom: 12, fontFamily: 'ui-monospace, monospace' },
        }),
        React.createElement('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Motivo (opcional):'),
        React.createElement('input', {
          type: 'text', value: motivo, placeholder: 'Ej: corregir valor de dureza',
          onChange: function (e) { setMotivo(e.target.value); },
          onKeyDown: function (e) { if (e.key === 'Enter' && !busy) submit(); },
          style: { width: '100%', padding: '7px 10px', border: '1px solid #d0d7de', borderRadius: 4, fontSize: 13 },
        }),
        err ? React.createElement('div', { style: { color: '#b02a2a', fontSize: 12, marginTop: 10 } }, err) : null
      ),
      React.createElement('div', { style: { padding: '12px 16px', borderTop: '1px solid #d0d7de', display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement(window.Button, { variant: 'ghost', onClick: props.onCancel, disabled: busy }, 'Cancelar'),
        React.createElement(window.Button, { variant: 'primary', icon: 'unlock', onClick: submit, loading: busy }, 'Desfirmar y guardar')
      )
    )
  );
}

/* Checkboxes de equipamiento (reemplaza campo maquina libre) */
function EquipoBoxes(props) {
  var eq = props.equipamiento || {};
  var extras = props.equipamientoExtra || [];
  var hardcoded = (props.equipos || []);

  // Normaliza labels para comparar: unifica ˚ (U+02DA) y ° (U+00B0), colapsa
  // espacios, lowercase. Sin esto el dedupe entre hardcoded y DB falla.
  function normalize(s) {
    return String(s || '').replace(/[˚°]/g, '°').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  var hardcodedLabels = new Set(hardcoded.map(function (e) { return normalize(e.label); }));

  // Cuando sede=null (químicos/vickers/ferrita), traer TODOS los equipos del
  // tipo (ambas sedes) y mostrar un chip identificador por cada uno.
  var dbEquipos = [];
  if (props.tipo) {
    try {
      var list = (window.LabStore.equiposParaTipoYSede || window.LabStore.equiposParaTipo)
        .call(window.LabStore, props.tipo, props.sede);
      dbEquipos = (list || []).filter(function (e) { return !hardcodedLabels.has(normalize(e.nombre)); });
    } catch (err) { dbEquipos = []; }
  }
  // Agrupar por sede para visualización
  var bySede = {};
  dbEquipos.forEach(function (e) {
    var key = e.sede || '—';
    if (!bySede[key]) bySede[key] = [];
    bySede[key].push(e);
  });
  var sedesOrden = Object.keys(bySede).sort(function (a, b) {
    if (a === 'CABA') return -1; if (b === 'CABA') return 1;
    if (a === 'Neuquén') return -1; if (b === 'Neuquén') return 1;
    return a.localeCompare(b);
  });

  function toggleHardcoded(e) {
    var next = Object.assign({}, eq);
    next[e.key] = !eq[e.key];
    props.onChange(next);
  }
  function toggleExtra(eq_db) {
    var checked = extras.some(function (x) { return x.id === eq_db.id; });
    var next = checked
      ? extras.filter(function (x) { return x.id !== eq_db.id; })
      : extras.concat([{ id: eq_db.id, nombre: eq_db.nombre, sede: eq_db.sede }]);
    if (props.onChangeExtra) props.onChangeExtra(next);
  }

  function renderHardcoded() {
    return hardcoded.map(function (e) {
      var checked = !!eq[e.key];
      return React.createElement('label', {
        key: e.key,
        className: 'equipo-box' + (checked ? ' active' : ''),
        onClick: function () { toggleHardcoded(e); },
      },
        React.createElement('span', { className: 'equipo-box-check' + (checked ? ' on' : '') },
          checked ? React.createElement(Icon, { name: 'check', size: 11, strokeWidth: 3 }) : null
        ),
        e.label
      );
    });
  }

  function renderDbGroup(sedeLabel, items) {
    var sedeChipClass = 'equipo-boxes-sede sede-' + (sedeLabel === 'CABA' ? 'caba' : sedeLabel === 'Neuquén' ? 'neuquen' : 'ambas');
    return [
      React.createElement('div', { className: 'equipo-boxes-extra-sep', key: 'sep-' + sedeLabel },
        React.createElement('span', null, 'Catálogo'),
        React.createElement('span', { className: sedeChipClass }, sedeLabel)
      ),
      items.map(function (eqDb) {
        var checked = extras.some(function (x) { return x.id === eqDb.id; });
        return React.createElement('label', {
          key: eqDb.id,
          className: 'equipo-box equipo-box-extra' + (checked ? ' active' : ''),
          onClick: function () { toggleExtra(eqDb); },
          title: 'Sede: ' + (eqDb.sede || 'sin asignar'),
        },
          React.createElement('span', { className: 'equipo-box-check' + (checked ? ' on' : '') },
            checked ? React.createElement(Icon, { name: 'check', size: 11, strokeWidth: 3 }) : null
          ),
          eqDb.nombre
        );
      })
    ];
  }

  return React.createElement('div', { className: 'equipo-boxes' },
    renderHardcoded(),
    sedesOrden.map(function (sedeLabel) { return renderDbGroup(sedeLabel, bySede[sedeLabel]); })
  );
}

/* Toggle de equipo (plegado): opciones de variante (emic / torne / shimadzu) */
function EquipoToggle(props) {
  return React.createElement('div', { className: 'equipo-toggle' },
    props.equipos.map(function (e) {
      var active = props.value === e.id;
      return React.createElement('button', { key: e.id, className: 'equipo-pill' + (active ? ' active' : ''), onClick: function () { props.onChange(e.id); } },
        React.createElement('span', { className: 'equipo-radio' + (active ? ' on' : '') }),
        e.label);
    })
  );
}

/* Selector de resultado (nick-break) */
function ResultPicker(props) {
  return React.createElement('div', { className: 'result-picker' },
    props.options.map(function (o) {
      var active = props.value === o;
      var tone = o.indexOf('No presenta') >= 0 ? 'ok' : 'warn';
      return React.createElement('button', { key: o, className: 'result-opt ' + tone + (active ? ' active' : ''), onClick: function () { props.onChange(o); } },
        React.createElement('span', { className: 'result-opt-radio' + (active ? ' on' : '') }, active ? React.createElement(Icon, { name: 'check', size: 12, strokeWidth: 3 }) : null),
        o);
    })
  );
}

/* Renderiza un campo del formulario */
function renderEnsayoField(fld, tipo, datos, set) {
  if (fld.type === 'checkbox')
    return React.createElement('label', { className: 'field-checkbox' },
      React.createElement('input', { type: 'checkbox', checked: !!getByPath(datos, fld.key), onChange: function (e) { set(fld.key, e.target.checked); } }),
      React.createElement('span', null, fld.label)
    );
  if (fld.type === 'textarea')
    return React.createElement(Textarea, { value: getByPath(datos, fld.key), onChange: function (v) { set(fld.key, v); }, placeholder: fld.placeholder, rows: 3 });
  if (fld.type === 'select')
    return React.createElement(Select, { value: getByPath(datos, fld.key), onChange: function (v) { set(fld.key, v); }, options: fld.options, placeholder: 'Seleccionar…' });
  if (fld.type === 'combo' || fld.type === 'select-editable')
    // Combobox editable: opciones predefinidas + tipear manualmente
    return React.createElement(ComboInput, { value: getByPath(datos, fld.key),
      onChange: function (v) { set(fld.key, v); },
      options: fld.options || [],
      placeholder: fld.placeholder, mono: !!fld.mono });

  // norma → catálogo de normas vigentes para el tipo
  if (fld.key === 'norma') {
    return React.createElement(ComboInput, { value: getByPath(datos, fld.key), placeholder: fld.placeholder,
      options: window.LabStore.normasParaTipo(tipo), onChange: function (v) { set(fld.key, v); } });
  }
  // metodología → catálogo de ITMs del tipo
  if (fld.key === 'metodologia') {
    return React.createElement(ComboInput, { value: getByPath(datos, fld.key), placeholder: fld.placeholder, mono: false,
      options: window.LabStore.itmsParaTipo(tipo), onChange: function (v) { set(fld.key, v); } });
  }
  // certificado de calibración → mono + badge de estado
  if (fld.key.indexOf('certif') >= 0) {
    return React.createElement(React.Fragment, null,
      React.createElement(ComboInput, { value: getByPath(datos, fld.key), placeholder: fld.placeholder, mono: true,
        options: window.LabStore.equiposParaTipo(tipo).map(function (e) { return e.certificado; }),
        onChange: function (v) { set(fld.key, v); } }),
      fld.key === 'certificado_calibracion' ? React.createElement(CalibBadge, { cert: datos.certificado_calibracion, nombre: datos.maquina }) : null
    );
  }
  return React.createElement(TextInput, { value: getByPath(datos, fld.key), onChange: function (v) { set(fld.key, v); }, placeholder: fld.placeholder, type: fld.type });
}

/* Chip de estado de calibración */
function CalibBadge(props) {
  var st = window.LabStore.calibStatusOf(props.cert, props.nombre);
  if (!st) return null;
  var meta = { 'vigente': { tone: 'success', icon: 'checkCircle', txt: 'Calibración vigente' },
    'por-vencer': { tone: 'warning', icon: 'clock', txt: 'Calibración por vencer' },
    'vencido': { tone: 'danger', icon: 'alertCircle', txt: 'Calibración VENCIDA' } }[st.estado];
  return React.createElement('div', { className: 'calib-badge calib-' + meta.tone },
    React.createElement(Icon, { name: meta.icon, size: 14, strokeWidth: 2 }),
    React.createElement('span', null, meta.txt + ' · vence ' + fmtDate(st.vencimiento))
  );
}

/* Deriva un caption inicial desde el nombre del archivo. Port cliente-side de
   server/utils/fotos-auto.js:parseCaptionDeFilename. Mismas reglas:
   - saca extensión
   - underscores → espacio
   - quita prefijos "M<n> " / "IMAGEN Nº<n> - "
   - sentence case (primera mayúscula)
   - "100x" → "(100X)"
   Ej: "IMAGEN Nº1 - MICROESTRUCTURA EN SUPERFICIE 100x.jpg" → "Microestructura en superficie (100X)"
*/
function captionDesdeNombre(filename) {
  if (!filename) return '';
  var s = String(filename).replace(/\.[a-z0-9]{2,5}$/i, '');
  s = s.replace(/_+/g, ' ');
  s = s.replace(/^\s*M\s*\d+\s+/i, '');
  s = s.replace(/^\s*(?:IMAGEN|IMAGENES|IMÁGEN|IMG|FOTO|FOTOGRAFIA)\s*(?:N\s*[°ºo]?)?\s*\d+\s*[-–—:]?\s*/i, '');
  s = s.replace(/([\wñáéíóúü])\(/gi, '$1 (');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.toLowerCase();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.replace(/\((\d+)\s*x\)/g, '($1X)');
  s = s.replace(/(\d+)\s*x\b/gi, '($1X)');
  s = s.replace(/\(\((\d+X)\)\)/g, '($1)');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/* Componente: imágenes con caption para incluir DENTRO de la sección del ensayo
   (ej. fotos de microscopía en Ferrita Delta). Cada item: { dataUrl, name, caption } */
function EnsayoPhotos(props) {
  var photos = props.photos || [];
  var fileRef = React.useRef(null);
  var _e = React.useState(null); var editing = _e[0], setEditing = _e[1]; // {index, photo}

  function onFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    var loaded = [];
    var pending = files.length;
    files.forEach(function (file, i) {
      var reader = new FileReader();
      reader.onload = function (e) {
        loaded[i] = {
          dataUrl: e.target.result,
          name: file.name,
          caption: captionDesdeNombre(file.name),
        };
        pending--;
        if (pending === 0) props.onChange(photos.concat(loaded.filter(Boolean)));
      };
      reader.readAsDataURL(file);
    });
  }
  function del(i) { props.onChange(photos.filter(function (_, idx) { return idx !== i; })); }
  function setCaption(i, v) {
    props.onChange(photos.map(function (p, idx) { return idx === i ? Object.assign({}, p, { caption: v }) : p; }));
  }
  function move(from, to) {
    if (to < 0 || to >= photos.length) return;
    var next = photos.slice(); var it = next.splice(from, 1)[0]; next.splice(to, 0, it);
    props.onChange(next);
  }
  function applyEdit(newUrl) {
    if (!editing) return;
    var idx = editing.index;
    props.onChange(photos.map(function (p, i) { return i === idx ? Object.assign({}, p, { dataUrl: newUrl }) : p; }));
    setEditing(null);
  }

  return React.createElement('div', { className: 'ensayo-photos' },
    React.createElement('div', {
      className: 'photo-dropzone',
      onDragOver: function (e) { e.preventDefault(); e.currentTarget.classList.add('over'); },
      onDragLeave: function (e) { e.currentTarget.classList.remove('over'); },
      onDrop: function (e) { e.preventDefault(); e.currentTarget.classList.remove('over'); onFiles(e.dataTransfer.files); },
      onClick: function () { fileRef.current && fileRef.current.click(); },
    },
      React.createElement(Icon, { name: 'upload', size: 20 }),
      React.createElement('div', null,
        React.createElement('span', { className: 'dz-strong' }, 'Arrastrá imágenes'),
        React.createElement('span', { className: 'dz-soft' }, ' o hacé clic para seleccionar')
      ),
      React.createElement('input', { ref: fileRef, type: 'file', accept: 'image/*', multiple: true, hidden: true,
        onChange: function (e) { onFiles(e.target.files); e.target.value = ''; } })
    ),
    props.hint ? React.createElement('p', { className: 'photo-hint' }, props.hint) : null,
    photos.length > 0 ? React.createElement('div', { className: 'ensayo-photos-list' },
      photos.map(function (p, i) {
        // Numeración automática: N°(i+2) porque la N°1 se reserva para carátula
        // (foto de recepción). Coherente con el generator del Word.
        var numImg = i + 2;
        return React.createElement('div', { key: i, className: 'ensayo-photo-row' },
          React.createElement('img', { src: p.dataUrl, alt: p.name, className: 'ensayo-photo-thumb' }),
          React.createElement('div', { className: 'ensayo-photo-body' },
            React.createElement('div', {
              style: { fontSize: 11, color: 'var(--text-3)', fontWeight: 700, marginBottom: 3 }
            }, 'Imagen N°' + numImg + ' — se agrega automáticamente en el Word'),
            React.createElement('input', {
              className: 'input', placeholder: 'Descripción (ej: Zona afectada del cordón)',
              value: p.caption || '',
              onChange: function (e) { setCaption(i, e.target.value); },
            }),
            // Dropdown de OT — aparece solo si props.otsDisponibles trae ≥2 OTs
            // hermanas. Cada imagen puede asignarse a una OT distinta. Al
            // guardar, el store la transfiere al ensayo de esa OT hermana.
            (props.otsDisponibles && props.otsDisponibles.length > 1)
              ? (function () {
                  var otNroActual = props.otNroActual || '';
                  var over = String(p.nro_ot_override || '').trim();
                  var otEff = over || otNroActual;
                  var esOtra = over && over !== otNroActual;
                  return React.createElement('div', { style: { marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 } },
                    React.createElement('span', { style: { color: 'var(--text-3)', fontSize: 10 } }, 'OT:'),
                    React.createElement('select', {
                      value: otEff,
                      style: {
                        padding: '2px 4px', fontSize: 11,
                        background: esOtra ? '#fff8e5' : 'var(--surface)',
                        color: esOtra ? '#8a5a00' : 'var(--text)',
                        fontWeight: esOtra ? 700 : 400,
                        border: '1px solid var(--border)', borderRadius: 3,
                      },
                      onChange: function (e) {
                        var v = String(e.target.value || '').trim();
                        if (v === otNroActual) v = '';
                        props.onChange(photos.map(function (pp, idx) {
                          return idx === i ? Object.assign({}, pp, { nro_ot_override: v }) : pp;
                        }));
                      },
                    },
                      props.otsDisponibles.map(function (o) {
                        var label = o.nro_ot + (o.nro_ot === otNroActual ? ' (esta)' : '');
                        return React.createElement('option', { key: o.nro_ot, value: o.nro_ot }, label);
                      })));
                })()
              : null,
            React.createElement('div', { className: 'ensayo-photo-actions' },
              React.createElement('button', { className: 'btn-mini', title: 'Recortar / rotar',
                onClick: function () { setEditing({ index: i, photo: p }); } },
                React.createElement(Icon, { name: 'crop', size: 14 })),
              React.createElement('button', { className: 'btn-mini', title: 'Subir', disabled: i === 0,
                onClick: function () { move(i, i - 1); } }, '↑'),
              React.createElement('button', { className: 'btn-mini', title: 'Bajar', disabled: i === photos.length - 1,
                onClick: function () { move(i, i + 1); } }, '↓'),
              React.createElement('button', { className: 'btn-mini danger', title: 'Eliminar',
                onClick: function () { del(i); } }, React.createElement(Icon, { name: 'trash', size: 14 }))
            )
          )
        );
      })
    ) : null,
    editing && typeof window.PhotoEditor === 'function'
      ? React.createElement(window.PhotoEditor, {
          photo: editing.photo,
          onCancel: function () { setEditing(null); },
          onApply: applyEdit,
        })
      : null
  );
}

/* ===========================================================
 * DynamicTable — tabla totalmente editable: agregar/quitar
 * columnas (con header editable in-place) y filas (con label
 * opcional). Estado:
 *   { headers: ['Col 1', 'Col 2', ...],
 *     filas:   [{ label: 'Fila 1', valores: ['v1', 'v2', ...] }, ...] }
 * =========================================================== */
function DynamicTable(props) {
  var raw = props.value;
  // Normalizar: soportar value undefined/null/no-object o incluso array
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  var headers = Array.isArray(raw.headers) ? raw.headers.slice() : [];
  if (headers.length === 0) headers = [''];
  var filas = Array.isArray(raw.filas) ? raw.filas.map(function (f) {
    return {
      label: (f && typeof f.label === 'string') ? f.label : '',
      valores: Array.isArray(f && f.valores) ? f.valores : [],
    };
  }) : [];
  var value = { headers: headers, filas: filas };
  var rowLabel = props.rowLabel || 'Fila';

  function emit(next) { props.onChange && props.onChange(next); }
  function clone()    { return { headers: headers.slice(), filas: filas.map(function (f) { return { label: f.label || '', valores: (f.valores || []).slice() }; }) }; }

  function setHeader(i, val) { var n = clone(); n.headers[i] = val; emit(n); }
  function addCol()          { var n = clone(); n.headers.push(''); n.filas.forEach(function (f) { f.valores.push(''); }); emit(n); }
  function delCol(i)         { if (n_cols() <= 1) return; var n = clone(); n.headers.splice(i, 1); n.filas.forEach(function (f) { f.valores.splice(i, 1); }); emit(n); }
  function n_cols()          { return headers.length; }

  function setRowLabel(r, val) { var n = clone(); n.filas[r].label = val; emit(n); }
  function setCell(r, c, val)  { var n = clone(); while (n.filas[r].valores.length < n_cols()) n.filas[r].valores.push(''); n.filas[r].valores[c] = val; emit(n); }
  function addRow()            { var n = clone(); n.filas.push({ label: '', valores: headers.map(function () { return ''; }) }); emit(n); }
  function delRow(r)           { var n = clone(); n.filas.splice(r, 1); emit(n); }

  return React.createElement('div', { className: 'dyn-table-wrap' },
    React.createElement('div', { className: 'dyn-table-actions' },
      React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'plus', onClick: addCol }, 'Agregar columna'),
      React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'plus', onClick: addRow }, 'Agregar fila')
    ),
    React.createElement('div', { className: 'dyn-table-scroll' },
      React.createElement('table', { className: 'dyn-table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { className: 'dyn-th-label' }, rowLabel),
            headers.map(function (h, ci) {
              return React.createElement('th', { key: ci, className: 'dyn-th' },
                React.createElement('input', {
                  className: 'dyn-header-input',
                  value: h || '',
                  placeholder: 'Columna ' + (ci + 1),
                  onChange: function (e) { setHeader(ci, e.target.value); },
                }),
                headers.length > 1 ? React.createElement('button', {
                  type: 'button', className: 'dyn-col-del', title: 'Quitar columna',
                  onClick: function () { delCol(ci); },
                }, '×') : null
              );
            })
          )
        ),
        React.createElement('tbody', null,
          filas.length === 0 ? React.createElement('tr', null,
            React.createElement('td', { colSpan: headers.length + 1, className: 'dyn-empty' }, 'Sin filas — usá «Agregar fila»')
          ) : filas.map(function (f, ri) {
            return React.createElement('tr', { key: ri },
              React.createElement('td', { className: 'dyn-td-label' },
                React.createElement('input', {
                  className: 'dyn-rowlabel-input',
                  value: f.label || '',
                  placeholder: rowLabel + ' ' + (ri + 1),
                  onChange: function (e) { setRowLabel(ri, e.target.value); },
                })
              ),
              headers.map(function (_, ci) {
                return React.createElement('td', { key: ci },
                  React.createElement('input', {
                    className: 'dyn-cell-input',
                    value: (f.valores && f.valores[ci]) || '',
                    onChange: function (e) { setCell(ri, ci, e.target.value); },
                  })
                );
              }),
              React.createElement('td', { className: 'dyn-row-del-cell' },
                React.createElement('button', {
                  type: 'button', className: 'dyn-row-del', title: 'Quitar fila',
                  onClick: function () { delRow(ri); },
                }, React.createElement(Icon, { name: 'trash', size: 14 }))
              )
            );
          })
        )
      )
    )
  );
}

/* Componente: botón "Cargar fotos automáticamente" reusable en todos los forms
   de ensayo. Llama a /api/ensayo/:id/fotos-auto (o /ensayo/new/fotos-auto con
   nro_ot+tipo si el ensayo no está guardado todavía) y aplica la respuesta.
   Props:
     - ensayoId: opcional. id del ensayo si ya se guardó.
     - nroOt:    obligatorio si no hay ensayoId. Nro de OT.
     - tipo:     obligatorio si no hay ensayoId. Tipo de ensayo.
     - datos:    datos actuales del ensayo (para concatenar sin duplicar)
     - set:      función para actualizar múltiples campos ({campo: [...]})
     - campos:   array de nombres de campos donde puede aplicar fotos
     - hint:     texto opcional que aparece al lado del botón
*/
function AutoLoadPhotosBtn(props) {
  var _l = React.useState(false); var loading = _l[0], setLoading = _l[1];
  var _msg = React.useState(''); var msg = _msg[0], setMsg = _msg[1];
  var ensayoId = props.ensayoId;
  var nroOt = props.nroOt;
  var tipo = props.tipo;
  var datos = props.datos || {};
  var campos = props.campos || [];

  function cargar() {
    // URL: si tenemos ensayoId, usar el path clásico; sino, usar 'new' + query.
    var url = ensayoId
      ? '/api/ensayo/' + ensayoId + '/fotos-auto'
      : '/api/ensayo/new/fotos-auto?nro_ot=' + encodeURIComponent(nroOt || '') +
        '&tipo=' + encodeURIComponent(tipo || '');
    if (!ensayoId && (!nroOt || !tipo)) {
      setMsg('Falta contexto (nro_ot o tipo).');
      return;
    }
    setLoading(true); setMsg('');
    fetch(url)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        var resumen = [];
        var patch = {};
        campos.forEach(function (campo) {
          var arr = (r.d.resultado && r.d.resultado[campo]) || [];
          if (arr.length === 0) return;
          var existente = datos[campo] || [];
          var setNames = new Set(existente.map(function (p) { return String(p.name || '').toLowerCase(); }));
          var nuevas = arr.filter(function (p) { return !setNames.has(String(p.name || '').toLowerCase()); });
          if (nuevas.length > 0) {
            patch[campo] = existente.concat(nuevas);
            resumen.push(nuevas.length + ' en ' + campo.replace(/^imagenes_?/, ''));
          }
        });
        if (Object.keys(patch).length > 0 && typeof props.set === 'function') {
          // El set de ensayoform.jsx acepta objeto patch directamente (línea 76:
          // "if (typeof k === 'object') Object.assign(n, k)"), así que llamamos
          // una sola vez con el objeto. Funciona para todos los forms hijos.
          props.set(patch);
        }
        var sinClas = (r.d.resultado && r.d.resultado._sin_clasificar) || [];
        var clas = r.d.clasificador;
        var msgTxt;
        if (resumen.length > 0) {
          msgTxt = 'Cargadas: ' + resumen.join(', ');
          if (clas && clas.usado) msgTxt += ' · IA usada (' + clas.asignados + '/' + clas.total_input + ')';
          if (sinClas.length > 0) msgTxt += ' · ' + sinClas.length + ' sin clasificar';
        } else if (sinClas.length > 0) {
          msgTxt = 'No se clasificó ninguna foto (' + sinClas.length + ' sin sección detectada)';
        } else {
          msgTxt = 'No se encontraron fotos.';
        }
        setMsg(msgTxt);
        // Propagar a hermanas de la solicitud (crea/actualiza sus ensayos con
        // sus fotos correspondientes). Skip si nroOt no está en props.
        console.log('[fotos-batch] disparo propagación', { nroOt: nroOt, tipo: tipo });
        if (nroOt && tipo) {
          fetch('/api/fotos-auto-solicitud', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nro_ot_referencia: nroOt, tipo: tipo, incluir_ot_actual: false }),
          })
            .then(function (r2) { return r2.json().then(function (d2) { return { ok: r2.ok, d: d2 }; }); })
            .then(function (r2) {
              console.log('[fotos-batch] respuesta', r2);
              if (!r2.ok) {
                setMsg(function (prev) { return prev + ' · Error propagación: ' + (r2.d.error || 'desconocido'); });
                return;
              }
              var items = (r2.d && r2.d.items) || [];
              var conFotos = items.filter(function (it) { return it.accion === 'creado' || it.accion === 'actualizado'; });
              if (conFotos.length === 0) {
                // Mostrar detalle igual — todas las hermanas están registradas.
                var resumenNulo = items.map(function (it) { return 'OT ' + it.nro_ot + ' (' + it.accion + ')'; }).join('; ');
                if (items.length > 0) {
                  setMsg(function (prev) { return prev + ' · ' + items.length + ' hermana(s) revisada(s) sin cambios: ' + resumenNulo; });
                }
                return;
              }
              var extra = conFotos.map(function (it) {
                return it.cantidad + ' → OT ' + it.nro_ot + ' (' + it.accion + ')';
              }).join('; ');
              setMsg(function (prev) { return prev + ' · Propagado: ' + extra; });
            })
            .catch(function (e) {
              console.error('[fotos-batch] error', e);
              setMsg(function (prev) { return prev + ' · Error red propagación'; });
            });
        } else {
          console.log('[fotos-batch] NO se propaga: falta nroOt o tipo', { nroOt: nroOt, tipo: tipo });
        }
      })
      .catch(function (e) { setMsg('Error: ' + e.message); })
      .finally(function () { setLoading(false); });
  }

  return React.createElement('div', {
    style: {
      padding: '6px 10px', background: 'var(--accent-soft)', border: '1px solid var(--accent-soft-2)',
      borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6,
      marginBottom: 10,
    },
  },
    React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    },
      React.createElement('div', { style: { fontSize: 11, color: 'var(--accent)' } },
        props.hint || '⚡ Busca fotos en el drive y las asigna a esta sección automáticamente.'),
      React.createElement('button', {
        type: 'button', onClick: cargar, disabled: loading,
        style: {
          border: '1px solid var(--accent)',
          background: loading ? 'var(--accent-soft-2)' : 'var(--accent)',
          color: '#fff', padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        },
      }, loading ? 'Cargando…' : 'Cargar fotos automáticamente')
    ),
    msg ? React.createElement('div', {
      style: { fontSize: 10.5, color: 'var(--text-2)' },
    }, msg) : null
  );
}

Object.assign(window, { EnsayoForm: EnsayoForm, EnsayoPhotos: EnsayoPhotos, DynamicTable: DynamicTable, AutoLoadPhotosBtn: AutoLoadPhotosBtn });
