/* LABTESA — Pantalla Detalle de OT (2 columnas: datos+fotos / ensayos+informe+QA) */

// Devuelve la norma "principal" del ensayo según el tipo. Cada tipo guarda la
// norma en un campo distinto (traccion → norma_ensayo o norma; metalográficos →
// norma_1; químicos → checkboxes de norma_e415/etc.; durezas → norma_astm_eXX).
function obtenerNorma(tipo, d) {
  if (!d) return '';
  if (tipo === 'quimicos') {
    var qNormas = [];
    if (d.norma_e415)    qNormas.push('ASTM E415');
    if (d.norma_e1086)   qNormas.push('ASTM E1086');
    if (d.norma_e1251)   qNormas.push('ASTM E1251');
    if (d.norma_e1999)   qNormas.push('ASTM E1999');
    if (d.norma_e3047)   qNormas.push('ASTM E3047');
    if (d.norma_e1019)   qNormas.push('ASTM E1019');
    if (d.norma_a751)    qNormas.push('ASTM A751');
    if (d.norma_otra)    qNormas.push(d.norma_otra);
    return qNormas.join(', ');
  }
  if (tipo === 'dureza-brinell') {
    var hb = [];
    if (d.norma_astm_e10) hb.push('ASTM E10');
    if (d.norma_iso6506)  hb.push('ISO 6506-1');
    return hb.join(', ') || d.norma_ensayo || d.norma || '';
  }
  if (tipo === 'dureza-vickers') {
    var hv = [];
    if (d.norma_astm_e92)  hv.push('ASTM E92');
    if (d.norma_astm_e384) hv.push('ASTM E384');
    return hv.join(', ') || d.norma_ensayo || d.norma || '';
  }
  if (tipo === 'rugosidad') return d.itm_numero ? 'ITM N°' + d.itm_numero : '';
  // Metalográficos del modelo F2 usan norma_1
  if (d.norma_1) return d.norma_1;
  // Resto: tracción, impacto, plegado, nick-break, ferrita-delta, etc.
  return d.norma_ensayo || d.norma || '';
}

function runQA(ot) {
  var errores = [], warnings = [], correcciones = [];
  if (!ot.ensayos.length) errores.push('La OT no tiene ensayos cargados. Agregá al menos uno para generar el informe.');
  ot.ensayos.forEach(function (e) {
    var d = {}; try { d = JSON.parse(e.datos_json); } catch (x) {}
    var label = window.LabStore.labels[e.tipo];
    var tienNorma = e.tipo === 'quimicos'
      ? (d.norma_e415 || d.norma_e1086 || d.norma_e1251 || d.norma_e1999 || d.norma_e3047 || d.norma_e1019 || d.norma_otra_chk)
      : (d.norma || d.norma_ensayo || d.norma_astm_e10 || d.norma_astm_e92 || d.norma_astm_e384);
    if (!tienNorma && e.tipo !== 'ferrita-delta') warnings.push(label + ': falta la norma de referencia.');
    var sch = window.ENSAYO_SCHEMAS[e.tipo];
    var tbl = sch.table(d.variante);
    if (tbl && tbl.required) {
      var rows = d.resultados || d.probetas || [];
      if (!rows.length) errores.push(label + ': la tabla de resultados está vacía.');
      else {
        var incompletas = rows.filter(function (r) { return Object.keys(r).some(function (k) { return r[k] === '' || r[k] == null; }); }).length;
        if (incompletas) warnings.push(label + ': ' + incompletas + ' fila(s) con celdas incompletas.');
      }
    }
    if (d.norma && /\s{2,}/.test(d.norma)) correcciones.push(label + ': se normalizaron los espacios en «' + d.norma.replace(/\s+/g, ' ') + '».');
    // ---- control de calibración del equipo usado ----
    var st = window.LabStore.calibStatusOf(d.certificado_calibracion, d.maquina);
    if (st) {
      if (st.estado === 'vencido') errores.push(label + ': el equipo «' + st.equipo.id + '» tiene la calibración VENCIDA (venció el ' + fmtDate(st.vencimiento) + '). No puede emitirse el informe.');
      else if (st.estado === 'por-vencer') warnings.push(label + ': la calibración del equipo «' + st.equipo.id + '» vence pronto (' + fmtDate(st.vencimiento) + ').');
      else correcciones.push(label + ': equipo «' + st.equipo.id + '» con calibración vigente (' + st.equipo.certificado + ').');
    } else if (d.certificado_calibracion) {
      warnings.push(label + ': el certificado «' + d.certificado_calibracion + '» no figura en el padrón de equipos.');
    }
  });
  if (!window.LabStore.getFotos(ot.nro_ot).length) warnings.push('No hay fotos de recepción para la carátula del informe.');
  if (ot.es_preinforme) correcciones.push('El documento se marcará con la leyenda PREINFORME.');
  return { errores: errores, warnings: warnings, correcciones: correcciones };
}

function OTDetail(props) {
  var toast = useToast();
  var _v = React.useState(0); var setV = _v[1]; // bump para re-render tras mutaciones
  var ot = window.LabStore.getOt(props.nro_ot);
  var _fotos = React.useState(function () { return window.LabStore.getFotos(props.nro_ot); });
  var fotos = _fotos[0], setFotos = _fotos[1];
  var _fal = React.useState(false); var fotosAutoLoading = _fal[0], setFotosAutoLoading = _fal[1];
  var _addOpen = React.useState(false); var addOpen = _addOpen[0], setAddOpen = _addOpen[1];
  var _confirm = React.useState(null); var confirm = _confirm[0], setConfirm = _confirm[1];
  var _qa = React.useState(null); var qa = _qa[0], setQa = _qa[1];
  var _preEm = React.useState(null); var preEmision = _preEm[0], setPreEmision = _preEm[1];
  var _gen = React.useState(''); var gen = _gen[0], setGen = _gen[1]; // '', 'word', 'qa', 'preemision'
  var _dup = React.useState(false); var dup = _dup[0], setDup = _dup[1];
  // Modal de confirmación de carpeta para generar Word.
  var _saveDlg = React.useState(null); var saveDlg = _saveDlg[0], setSaveDlg = _saveDlg[1]; // null | 'word' | 'word-batch' | 'qa'
  // Progreso del batch "Generar todos". null cuando no hay batch activo.
  // { total, hecho, fallidos:[], skipped:[], actual: nro_ot|null, carpeta, confirmarVersionGlobal }
  var _batch = React.useState(null); var batchState = _batch[0], setBatchState = _batch[1];
  // Modal persistente que se muestra después de emitir un informe con la ruta guardada.
  var _informeEmitido = React.useState(null);
  var informeEmitido = _informeEmitido[0], setInformeEmitido = _informeEmitido[1];
  // Modal genérico para reemplazar window.confirm/alert nativos.
  // { title, message, tone, confirmLabel, confirmIcon, onConfirm (o null si es alert) }
  var _mdl = React.useState(null); var mdl = _mdl[0], setMdl = _mdl[1];
  // Modal "Motivo del cambio" para reemisión de informe OAA acreditado.
  var _motivoDlg = React.useState(null); var motivoDlg = _motivoDlg[0], setMotivoDlg = _motivoDlg[1];
  // Modal "Confirmar razón social" antes de generar (single o batch).
  //   { modo: 'single' | 'batch' }
  var _razonDlg = React.useState(null); var razonDlg = _razonDlg[0], setRazonDlg = _razonDlg[1];
  // Modal "Falta fecha de aprobación" — permite cargarla in-place con date
  // picker + botón "Guardar y generar" (sin necesidad de ir a "Editar solicitud").
  //   { onGuardar: fn(fechaISO), initial?: 'YYYY-MM-DD', propagar: bool }
  var _faDlg = React.useState(null); var faDlg = _faDlg[0], setFaDlg = _faDlg[1];
  // Modal específico para colisión de nombre de archivo con 3 opciones.
  // { filename, carpeta, opts }  → sobrescribir / -1 / renombrar.
  var _arch = React.useState(null); var archExiste = _arch[0], setArchExiste = _arch[1];
  // Modal "editar solicitud" (aplica a todas las OTs hermanas).
  var _editSol = React.useState(false); var editSol = _editSol[0], setEditSol = _editSol[1];
  // Flag para el auto-refresh cuando la OT no está en cache local.
  // Draft local del texto de inspección — se persiste on blur para no spamear PATCH.
  var _insp = React.useState(''); var inspDraft = _insp[0], setInspDraft = _insp[1];
  var _inspInit = React.useState(false); var inspInit = _inspInit[0], setInspInit = _inspInit[1];
  var _autoRefreshed = React.useState(false); var autoRefreshed = _autoRefreshed[0], setAutoRefreshed = _autoRefreshed[1];
  var _autoLoading  = React.useState(false); var autoLoading  = _autoLoading[0],  setAutoLoading  = _autoLoading[1];
  // Badge OAA: se calcula desde /api/oaa-preview (misma fuente que OAAPanel) para
  // reflejar la detección real por norma+sede+temp. El flag `datos.oaa` en crudo
  // no sirve — su semántica cambia según el generator (macrografía/varios/etc.
  // arrancan con oaa=true por default, aunque no son OAA-acreditadas).
  var _oaaDet = React.useState(null); var oaaDet = _oaaDet[0], setOaaDet = _oaaDet[1];

  // Sincronizar draft de inspección con el valor de la OT (sólo la primera vez
  // que la OT está disponible; después el textarea es la fuente de verdad).
  React.useEffect(function () {
    if (!ot || inspInit) return;
    setInspDraft(ot.inspeccion_texto || '');
    setInspInit(true);
  }, [ot && ot.nro_ot]);

  // Auto-refresh: si la OT no está en el cache local pero el nro_ot parece
  // válido (numérico), disparar init() UNA vez para traer del backend. Cubre
  // el caso "el bot Trello acaba de crear la OT y el cache está viejo".
  React.useEffect(function () {
    if (ot || autoRefreshed || autoLoading) return;
    if (!/^\d{3,8}$/.test(String(props.nro_ot || ''))) return;
    setAutoLoading(true);
    if (window.LabStore && window.LabStore.init) {
      window.LabStore.init()
        .then(function () { setAutoRefreshed(true); setAutoLoading(false); setV(function (x) { return x + 1; }); })
        .catch(function () { setAutoRefreshed(true); setAutoLoading(false); });
    } else {
      setAutoRefreshed(true); setAutoLoading(false);
    }
  }, [props.nro_ot, ot]);

  // Fetch OAA preview cuando cambia la cantidad de ensayos (mismo trigger que
  // el OAAPanel). Determina el badge "OAA" del header en base a la detección
  // real (norma + sede + rango de temperatura + reglas por tipo).
  var _ensLen = ot && ot.ensayos ? ot.ensayos.length : 0;
  React.useEffect(function () {
    if (!ot || _ensLen === 0) { setOaaDet(null); return; }
    fetch('/api/oaa-preview/' + ot.nro_ot)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { setOaaDet(j && Array.isArray(j.detecciones) ? j.detecciones : null); })
      .catch(function () { setOaaDet(null); });
  }, [ot && ot.nro_ot, _ensLen]);

  if (!ot) {
    if (autoLoading) {
      // Loading discreto mientras se refresca del backend por primera vez.
      return React.createElement('div', { className: 'page' },
        React.createElement(EmptyState, {
          icon: 'clock',
          title: 'Cargando OT ' + props.nro_ot + '…',
          message: 'Buscando en el backend (puede haber sido creada recién).',
        }));
    }
    // La OT puede haber sido creada por el bot Trello después del último init
    // del cache. Ofrecer "Recargar datos" además de "Volver" — dispara un
    // init() completo desde el backend sin necesidad de F5.
    return React.createElement('div', { className: 'page' },
      React.createElement(EmptyState, {
        icon: 'search',
        title: 'OT ' + props.nro_ot + ' no encontrada',
        message: 'Puede haber sido creada recientemente (por el bot de Trello, por ejemplo). Probá recargar los datos.',
        action: React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'center' } },
          React.createElement(Button, {
            variant: 'primary', icon: 'download',
            onClick: function () {
              if (window.LabStore && window.LabStore.init) {
                window.LabStore.init().then(function () {
                  // Forzar re-render de la app (el hash sigue igual → se reprocesa).
                  var h = location.hash; location.hash = '#/_reload'; setTimeout(function () { location.hash = h; }, 30);
                }).catch(function (e) { toast('Error al recargar: ' + e.message, 'danger'); });
              }
            },
          }, 'Recargar datos'),
          React.createElement(Button, { onClick: function () { nav('#/'); } }, 'Volver'))
      })
    );
  }

  function refresh() { setV(function (x) { return x + 1; }); }
  function updateFotos(next) { setFotos(next); window.LabStore.setFotos(ot.nro_ot, next); }

  // Auto-carga desde G:\METALMECANICA\FOTOS\CLIENTES 2026\<CLIENTE>\SOL <nro>[\OT <nro>]\
  // AGREGA a las existentes (no reemplaza). Filtra duplicados por name.
  function cargarFotosAuto() {
    setFotosAutoLoading(true);
    fetch('/api/ot/' + ot.nro_ot + '/fotos-auto')
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error al buscar fotos');
        var nuevas = r.d.items || [];
        if (nuevas.length === 0) {
          // Mensaje detallado según en qué paso falló el matcher.
          var msg = 'No se encontraron fotos.';
          if (r.d.debug === 'cliente_no_matcheado') {
            var cand = (r.d.cliente_candidatos || []).slice(0, 3).map(function (c) { return c.nombre; }).join(', ');
            msg = 'No se encontró carpeta del cliente para "' + (r.d.razon_social_buscada || '') + '".'
              + (cand ? ' Candidatos más cercanos: ' + cand : '');
          } else if (r.d.debug === 'sol_no_encontrada') {
            var sols = (r.d.sols_disponibles || []).slice(0, 5).join(', ');
            msg = 'Cliente encontrado (' + (r.d.carpeta_cliente || '').split(/[\\\/]/).pop()
              + ') pero no hay carpeta SOL para esta solicitud.'
              + (sols ? ' Carpetas disponibles: ' + sols : '');
          } else if (r.d.debug === 'sol_sin_imagenes') {
            msg = 'Cliente y solicitud encontrados, pero la carpeta no tiene imágenes.';
          }
          toast(msg, 'warning');
          return;
        }
        // Filtrar duplicados por nombre (case-insensitive).
        var existentesNames = new Set((fotos || []).map(function (f) { return String(f.name || '').toLowerCase(); }));
        var aAgregar = nuevas.filter(function (n) { return !existentesNames.has(String(n.name || '').toLowerCase()); });
        var combinadas = (fotos || []).concat(aAgregar.map(function (n) { return { dataUrl: n.dataUrl, name: n.name }; }));
        updateFotos(combinadas);
        var _extra = '';
        if (nuevas.length !== aAgregar.length) _extra += ' Se saltearon las ya existentes por nombre.';
        if (r.d.total_disponibles > nuevas.length) _extra += ' (Truncado a 100 MB — hay más disponibles en el drive)';
        if (r.d.agente && r.d.agente.usado) {
          _extra += ' IA: ' + r.d.agente.asignadas_a_esta_ot + ' específica(s) de ' + r.d.agente.total_archivos +
                    ' (' + r.d.agente.hermanas + ' OTs hermanas).';
          if (r.d.agente.genericas_fallback > 0) {
            _extra += ' Sin fotos específicas — se usaron ' + r.d.agente.genericas_fallback + ' genérica(s) como fallback.';
          }
        }
        toast('Cargadas ' + aAgregar.length + ' de ' + nuevas.length + ' fotos.' + _extra, 'success');
        // Propagar a OTs hermanas de la solicitud: por cada hermana, buscar
        // sus propias fotos de recepción en el drive y setear ot.fotos_json.
        // Se skipea la OT actual (ya se hizo arriba).
        propagarFotosAHermanas();
      })
      .catch(function (e) { toast('Error al cargar fotos: ' + e.message, 'danger'); })
      .finally(function () { setFotosAutoLoading(false); });
  }

  // Propaga la búsqueda automática de fotos de recepción a cada OT hermana
  // de la solicitud. Cada hermana busca en su carpeta del drive con SU nro_ot
  // y SU id_muestra — cada una puede terminar con fotos distintas.
  function propagarFotosAHermanas() {
    if (!ot.nro_solicitud) return;
    var hermanas = (window.LabStore.listOtsBySolicitud(ot.nro_solicitud) || [])
      .filter(function (h) { return String(h.nro_ot) !== String(ot.nro_ot); });
    if (hermanas.length === 0) return;
    var proms = hermanas.map(function (h) {
      return fetch('/api/ot/' + h.nro_ot + '/fotos-auto')
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d, nro_ot: h.nro_ot }; }); })
        .then(function (r) {
          if (!r.ok || !r.d.items || r.d.items.length === 0) {
            return { nro_ot: r.nro_ot, cantidad: 0 };
          }
          // Merger con las fotos existentes de la hermana (dedupe por name).
          return fetch('/api/ot/' + r.nro_ot + '/fotos')
            .then(function (rExist) { return rExist.json(); })
            .then(function (existentes) {
              var existArr = Array.isArray(existentes) ? existentes : [];
              var setNames = new Set(existArr.map(function (f) { return String(f.name || '').toLowerCase(); }));
              var nuevas = r.d.items.filter(function (n) { return !setNames.has(String(n.name || '').toLowerCase()); });
              if (nuevas.length === 0) return { nro_ot: r.nro_ot, cantidad: 0 };
              var combinadas = existArr.concat(nuevas.map(function (n) { return { dataUrl: n.dataUrl, name: n.name }; }));
              // POST /api/ot/:nro_ot/fotos guarda el fotos_json completo.
              return fetch('/api/ot/' + r.nro_ot + '/fotos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: combinadas }),
              }).then(function () { return { nro_ot: r.nro_ot, cantidad: nuevas.length }; });
            });
        })
        .catch(function () { return { nro_ot: h.nro_ot, cantidad: 0, error: true }; });
    });
    Promise.all(proms).then(function (results) {
      var conFotos = results.filter(function (r) { return r.cantidad > 0; });
      var total = conFotos.reduce(function (a, r) { return a + r.cantidad; }, 0);
      if (conFotos.length > 0) {
        var detalle = conFotos.map(function (r) { return r.cantidad + ' → OT ' + r.nro_ot; }).join(', ');
        toast('Propagado a ' + conFotos.length + ' OT(s) hermana(s) — ' + total + ' fotos: ' + detalle, 'success');
      } else {
        toast(hermanas.length + ' OT(s) hermana(s) revisada(s) — sin nuevas fotos', 'info');
      }
      // Refrescar el store local para que al navegar a las hermanas se vean
      // las fotos recién persistidas. init() vuelve a traer todas las OTs
      // desde el backend con fotos_json actualizado.
      if (window.LabStore && typeof window.LabStore.init === 'function') {
        window.LabStore.init().then(refresh).catch(function () { refresh(); });
      } else {
        refresh();
      }
    });
  }
  // "Marcar como preinforme" es un atributo de la solicitud, no de la OT
  // individual: si una OT es preinforme, TODAS las hermanas de la misma
  // solicitud también lo son (comparten el estado de emisión). Cuando el
  // usuario togglea, propagamos vía updateSolicitud para pisar el flag en
  // todas las OTs de la solicitud. Si la OT no tiene solicitud, se aplica
  // solo a ella.
  function togglePre() {
    var nuevo = ot.es_preinforme ? 0 : 1;
    if (ot.nro_solicitud && typeof window.LabStore.updateSolicitud === 'function') {
      window.LabStore.updateSolicitud(ot.nro_solicitud, { es_preinforme: nuevo });
    } else {
      window.LabStore.updateOt(ot.nro_ot, { es_preinforme: nuevo });
    }
    refresh();
  }

  function _downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  // Nuevo flujo: abre el modal de confirmación de carpeta. El modal detecta la
  // carpeta candidata y ofrece Confirmar o Elegir otra. Luego llama a
  // ejecutarGenerarWord con el path elegido.
  // Antes de abrir el modal de carpeta, pedir al técnico que confirme la
  // razón social. La carpeta destino en el drive se detecta según esa razón
  // social; si viene mal del bot, generar en la carpeta equivocada.
  function genWord() { setRazonDlg({ modo: 'single' }); }

  function ejecutarGenerarWord(carpetaDestino, filename, opts) {
    opts = opts || {};
    setSaveDlg(null); setGen('word');
    // El endpoint usa multer (multipart), así que pasamos carpeta/filename
    // como query params en vez de body JSON.
    var qs = '?solo_drive=true'
           + '&carpeta_destino=' + encodeURIComponent(carpetaDestino)
           + '&filename=' + encodeURIComponent(filename)
           + (opts.nombreCustom ? '&nombre_custom=1' : '')
           + (opts.forzar ? '&forzar=true' : '')
           + (opts.confirmarVersion ? '&confirmar_version_nueva=true' : '')
           + (opts.modoConflicto ? '&modo_conflicto=' + encodeURIComponent(opts.modoConflicto) : '')
           + (opts.motivoCambio ? '&motivo_cambio=' + encodeURIComponent(opts.motivoCambio) : '');
    fetch('/api/generate/' + ot.nro_ot + qs, { method: 'POST' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (r) {
        // Confirmación de nueva versión: el backend detectó que ya hay un informe
        // vigente y NO emite automáticamente. Preguntamos al usuario si quiere
        // emitir la versión N y mover la anterior a SUPERADO/.
        if (r.status === 409 && r.d && r.d.code === 'CONFIRMAR_VERSION_NUEVA') {
          var v  = r.d.version_a_emitir;
          var vg = r.d.vigente || {};
          setGen('');
          // Nuevo modal con textarea para el motivo del cambio (requisito OAA
          // en reemisiones acreditadas). El motivo se emite en el Word entre
          // la carátula y el primer ensayo.
          setMotivoDlg({
            titulo: 'Nueva versión del informe',
            versionActual: vg.version || 1,
            versionNueva: v,
            filenameNuevo: r.d.filename_nuevo || '',
            onConfirm: function (motivo) {
              setMotivoDlg(null);
              ejecutarGenerarWord(carpetaDestino, filename,
                Object.assign({}, opts, { confirmarVersion: true, motivoCambio: motivo }));
            },
            onCancel: function () {
              setMotivoDlg(null);
              toast('Emisión cancelada. No se modificó la versión vigente.', 'warning');
            },
          });
          return;
        }
        // Falta fecha de aprobación: el bot creó la OT sin ella (Trello sin
        // custom field) y el admin no la cargó todavía. Abrimos un modal con
        // date picker in-place — al guardar, propaga a las OTs hermanas via
        // updateSolicitud (si tiene solicitud) y reintenta la generación.
        if (r.status === 422 && r.d && r.d.code === 'FALTA_FECHA_APROBACION') {
          setGen('');
          setFaDlg({
            initial: ot.fecha_aprobacion || '',
            propagar: !!ot.nro_solicitud,
            cantHermanas: otsHermanas.length + 1,
            onGuardar: function (fechaISO) {
              // Persistir (a la solicitud entera si hay hermanas, o solo a
              // la OT si no) y luego reintentar la generación.
              var prom;
              if (ot.nro_solicitud && typeof window.LabStore.updateSolicitud === 'function') {
                prom = window.LabStore.updateSolicitud(ot.nro_solicitud, { fecha_aprobacion: fechaISO });
              } else {
                window.LabStore.updateOt(ot.nro_ot, { fecha_aprobacion: fechaISO });
                prom = Promise.resolve();
              }
              Promise.resolve(prom).then(function () {
                ot.fecha_aprobacion = fechaISO;
                setFaDlg(null);
                // Reintentar la generación con los mismos parámetros.
                ejecutarGenerarWord(carpetaDestino, filename, opts);
              }).catch(function (e) {
                toast('No se pudo guardar la fecha: ' + (e && e.message ? e.message : e), 'danger');
              });
            },
            onCancel: function () { setFaDlg(null); },
          });
          return;
        }
        // Doble firma faltante: la OT tiene ensayos sin aprobar (firma final).
        // El informe NO puede emitirse hasta que estén todos firmados y aprobados.
        if (r.status === 422 && r.d && (r.d.code === 'ENSAYOS_SIN_FIRMAR' || r.d.code === 'ENSAYOS_SIN_APROBAR')) {
          setGen('');
          var lista = (r.d.pendientes || []).map(function (p) {
            var labelTipo = (window.LabStore && window.LabStore.labels && window.LabStore.labels[p.tipo]) || p.tipo;
            return '• ' + labelTipo + ' — falta ' + (p.falta || 'firma');
          }).join('\n');
          setMdl({
            title: 'Faltan firmas',
            message: 'No se puede generar el informe. Los siguientes ensayos no están firmados:\n\n' + lista + '\n\nFirmá cada ensayo desde la lista de ensayos y volvé a intentar.',
            tone: 'warning', confirmLabel: 'Entendido',
            onConfirm: function () { setMdl(null); },
            onCancel:  function () { setMdl(null); },
            hideCancel: true,
          });
          return;
        }
        // Conflicto: el archivo destino ya existe físicamente. Abrimos un modal
        // dedicado con 3 opciones: Sobrescribir / Agregar sufijo -1 / Cambiar nombre.
        if (r.status === 409 && r.d && r.d.code === 'ARCHIVO_YA_EXISTE') {
          setGen('');
          setArchExiste({
            filename: r.d.filename || filename,
            filenameSugerido: r.d.filename_sugerido || (r.d.filename || filename),
            carpeta: carpetaDestino,
            opts: opts,
          });
          return;
        }
        if (!r.ok) throw new Error(r.d.error || 'Error al generar');
        toast('Informe guardado', 'success');
        // Mostrar modal persistente con la ruta y acciones (abrir/copiar).
        setInformeEmitido({
          ruta: r.d.ruta,
          filename: r.d.filename || (r.d.ruta ? r.d.ruta.split(/[\\/]/).pop() : ''),
          informe_id: r.d.informe_id,
          version: r.d.version,
          sha256: r.d.sha256,
        });
        window.LabStore.logEvento(ot.nro_ot, 'Informe Word generado' + (ot.es_preinforme ? ' (preinforme)' : ''), 'fileDoc');
        setGen(''); refresh();
      })
      .catch(function (e) { setGen(''); toast('Error al generar: ' + e.message, 'danger'); });
  }

  // ── BATCH: Generar los N informes de todas las OTs de la solicitud ──────
  // Verifica si una OT (con ensayos hidratados) está lista para emitir:
  // - tiene al menos 1 ensayo
  // - todos sus ensayos están firmados (revisado/autorizado/firmado)
  // - no tiene datos_faltantes (nro_ot / id_muestra)
  function esOtLista(otObj) {
    if (!otObj || !Array.isArray(otObj.ensayos) || otObj.ensayos.length === 0) return false;
    var firmados = otObj.ensayos.filter(function (e) {
      return e.estado_firma === 'revisado' || e.estado_firma === 'autorizado' || e.estado_firma === 'firmado';
    }).length;
    if (firmados !== otObj.ensayos.length) return false;
    var falt = [];
    try { falt = otObj.datos_faltantes ? JSON.parse(otObj.datos_faltantes) : []; } catch (_) {}
    if (!Array.isArray(falt)) falt = [];
    return falt.length === 0;
  }

  function abrirGenerarBatch() {
    // Filtra OTs listas de las hermanas antes de abrir el diálogo, para poder
    // avisar si ninguna está en condiciones de emitirse.
    var hermanasFull = otsHermanas.map(function (h) { return window.LabStore.getOt(h.nro_ot); }).filter(Boolean);
    var listas = hermanasFull.filter(esOtLista);
    if (listas.length === 0) {
      toast('Ninguna OT de la solicitud está lista (falta firma o datos)', 'warning');
      return;
    }
    // Confirmar razón social antes (una sola vez, aplica a todo el batch).
    setRazonDlg({ modo: 'batch' });
  }

  // Genera secuencialmente el informe de cada OT lista de la solicitud en la
  // MISMA carpeta destino. Si aparece un conflicto de versión (409), pausa y
  // pregunta al usuario; su respuesta se aplica al resto del batch.
  function ejecutarGenerarWordBatch(carpetaDestino, _filenameOtActual, opts) {
    opts = opts || {};
    setSaveDlg(null);
    var hermanasFull = otsHermanas.map(function (h) { return window.LabStore.getOt(h.nro_ot); }).filter(Boolean);
    var listas = hermanasFull.filter(esOtLista);
    var skipped = hermanasFull.filter(function (o) { return !esOtLista(o); }).map(function (o) { return o.nro_ot; });
    var estado = {
      total: listas.length, hecho: 0, fallidos: [], skipped: skipped,
      actual: null, carpeta: carpetaDestino, confirmarVersionGlobal: false,
      // Modo aplicado a los conflictos de archivo (ARCHIVO_YA_EXISTE) — se
      // pregunta 1 vez y se aplica al resto del batch: 'sobrescribir' | 'sufijo'.
      modoConflictoGlobal: '',
      generados: [],
    };
    setBatchState(estado);
    setGen('word');

    function detectarFilename(nroOt) {
      return fetch('/api/generate/' + nroOt + '/detectar-carpeta')
        .then(function (r) { return r.json(); })
        .then(function (d) { return d && d.filename ? d.filename : (nroOt + '.docx'); })
        .catch(function () { return nroOt + '.docx'; });
    }

    function generarUno(nroOt, filename, extraOpts) {
      var modoC = (extraOpts && extraOpts.modoConflicto) || estado.modoConflictoGlobal || '';
      var qs = '?solo_drive=true'
             + '&carpeta_destino=' + encodeURIComponent(carpetaDestino)
             + '&filename=' + encodeURIComponent(filename)
             + (opts.forzar ? '&forzar=true' : '')
             + (extraOpts && extraOpts.confirmarVersion ? '&confirmar_version_nueva=true' : '')
             + (modoC ? '&modo_conflicto=' + encodeURIComponent(modoC) : '');
      return fetch('/api/generate/' + nroOt + qs, { method: 'POST' })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); });
    }

    function siguiente(i) {
      if (i >= listas.length) {
        // Fin del batch.
        setBatchState(null);
        setGen('');
        var resumen = 'Batch terminado: ' + estado.hecho + '/' + estado.total + ' generados';
        if (estado.fallidos.length) resumen += ', ' + estado.fallidos.length + ' con error';
        if (estado.skipped.length)  resumen += ', ' + estado.skipped.length + ' skippeados';
        toast(resumen, estado.fallidos.length ? 'warning' : 'success');
        if (estado.generados.length) {
          // Modal resumen con lista de rutas.
          setInformeEmitido({
            batch: true,
            total: estado.hecho,
            generados: estado.generados,
            fallidos: estado.fallidos,
            skipped: estado.skipped,
          });
        }
        refresh();
        return;
      }
      var otObj = listas[i];
      var nroOt = otObj.nro_ot;
      setBatchState(function (prev) { return Object.assign({}, prev, { actual: nroOt }); });
      detectarFilename(nroOt).then(function (filename) {
        return generarUno(nroOt, filename, { confirmarVersion: estado.confirmarVersionGlobal });
      }).then(function (r) {
        // 409 CONFIRMAR_VERSION_NUEVA: pausar y preguntar (solo la primera vez).
        if (r.status === 409 && r.d && r.d.code === 'CONFIRMAR_VERSION_NUEVA') {
          setMdl({
            title: 'Conflicto de versión en OT ' + nroOt,
            message: 'Ya existe un informe vigente para la OT ' + nroOt + '. Si continuás, se emitirá como nueva versión y la anterior irá a SUPERADO/. ¿Aplicar esto a TODAS las OTs de este batch que tengan conflicto?',
            tone: 'warning',
            confirmLabel: 'Emitir nuevas versiones', confirmIcon: 'download',
            cancelLabel: 'Cancelar batch',
            onConfirm: function () {
              setMdl(null);
              estado.confirmarVersionGlobal = true;
              detectarFilename(nroOt).then(function (fn) {
                return generarUno(nroOt, fn, { confirmarVersion: true });
              }).then(procesarRespuesta.bind(null, nroOt, i)).catch(function (e) {
                estado.fallidos.push({ nro_ot: nroOt, error: e.message });
                siguiente(i + 1);
              });
            },
            onCancel: function () {
              setMdl(null);
              toast('Batch cancelado en OT ' + nroOt, 'warning');
              setBatchState(null); setGen(''); refresh();
            },
          });
          return;
        }
        // 409 ARCHIVO_YA_EXISTE: pausar la primera vez y preguntar sobrescribir
        // vs sufijo -N. La respuesta se aplica al resto del batch automáticamente
        // vía estado.modoConflictoGlobal.
        if (r.status === 409 && r.d && r.d.code === 'ARCHIVO_YA_EXISTE') {
          // Si ya hay modo elegido (no debería llegar acá, pero por si acaso),
          // reintentar con ese modo.
          if (estado.modoConflictoGlobal) {
            generarUno(nroOt, r.d.filename || (nroOt + '.docx'), { modoConflicto: estado.modoConflictoGlobal })
              .then(procesarRespuesta.bind(null, nroOt, i))
              .catch(function (e) {
                estado.fallidos.push({ nro_ot: nroOt, error: e.message });
                siguiente(i + 1);
              });
            return;
          }
          setMdl({
            title: 'El archivo ya existe (OT ' + nroOt + ')',
            message: 'Ya hay un "' + (r.d.filename || '') + '" en la carpeta destino.\n\n' +
                     '• Sobrescribir: reemplaza el archivo existente.\n' +
                     '• Usar sufijo -N: guarda como "' + (r.d.filename_sugerido || '') + '" y deja intacto el anterior.\n\n' +
                     'La opción elegida se aplicará a TODAS las OTs de este batch que tengan el mismo conflicto.',
            tone: 'warning',
            confirmLabel: 'Usar sufijo -N', confirmIcon: 'filePlus',
            cancelLabel: 'Sobrescribir',
            // Uso un tercer boton via extraButtons si el modal lo soporta; sino,
            // mapeamos: confirm='sufijo', cancel='sobrescribir'. Botón "Cancelar
            // batch" en el modal se maneja con onClose custom.
            extraButtons: [
              { label: 'Cancelar batch', tone: 'danger', onClick: function () {
                setMdl(null);
                toast('Batch cancelado en OT ' + nroOt, 'warning');
                setBatchState(null); setGen(''); refresh();
              } },
            ],
            onConfirm: function () {
              setMdl(null);
              estado.modoConflictoGlobal = 'sufijo';
              detectarFilename(nroOt).then(function (fn) {
                return generarUno(nroOt, fn, { modoConflicto: 'sufijo' });
              }).then(procesarRespuesta.bind(null, nroOt, i)).catch(function (e) {
                estado.fallidos.push({ nro_ot: nroOt, error: e.message });
                siguiente(i + 1);
              });
            },
            onCancel: function () {
              setMdl(null);
              estado.modoConflictoGlobal = 'sobrescribir';
              detectarFilename(nroOt).then(function (fn) {
                return generarUno(nroOt, fn, { modoConflicto: 'sobrescribir' });
              }).then(procesarRespuesta.bind(null, nroOt, i)).catch(function (e) {
                estado.fallidos.push({ nro_ot: nroOt, error: e.message });
                siguiente(i + 1);
              });
            },
          });
          return;
        }
        procesarRespuesta(nroOt, i, r);
      }).catch(function (e) {
        estado.fallidos.push({ nro_ot: nroOt, error: e.message });
        siguiente(i + 1);
      });
    }

    function procesarRespuesta(nroOt, i, r) {
      if (!r.ok) {
        estado.fallidos.push({ nro_ot: nroOt, error: (r.d && r.d.error) || ('HTTP ' + r.status) });
      } else {
        estado.hecho += 1;
        estado.generados.push({
          nro_ot: nroOt,
          ruta: r.d.ruta,
          filename: r.d.filename || (r.d.ruta ? r.d.ruta.split(/[\\/]/).pop() : ''),
          version: r.d.version,
        });
        window.LabStore.logEvento(nroOt, 'Informe Word generado (batch solicitud)', 'fileDoc');
      }
      setBatchState(function (prev) { return Object.assign({}, prev, { hecho: estado.hecho, fallidos: estado.fallidos.slice() }); });
      siguiente(i + 1);
    }

    siguiente(0);
  }

  // Agente pre-emisión: análisis de coherencia con Claude.
  function genPreEmision() {
    setGen('preemision');
    setPreEmision(null);
    fetch('/api/pre-emision/' + ot.nro_ot)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error en análisis de coherencia');
        setPreEmision(r.d);
        setGen('');
        var criticos = (r.d.hallazgos || []).filter(function (h) { return h.severidad === 'critico'; }).length;
        var warns    = (r.d.hallazgos || []).filter(function (h) { return h.severidad === 'warning'; }).length;
        if (criticos > 0) toast('Análisis IA: ' + criticos + ' crítico(s), ' + warns + ' advertencia(s)', 'danger');
        else if (warns > 0) toast('Análisis IA: ' + warns + ' advertencia(s) — revisá antes de emitir', 'warning');
        else toast('Análisis IA: sin hallazgos preocupantes', 'success');
      })
      .catch(function (e) { setGen(''); toast('Error en análisis IA: ' + e.message, 'danger'); });
  }

  function genQA() {
    setGen('qa');
    fetch('/api/qa-check/' + ot.nro_ot, { method: 'POST' })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error en control de calidad');
        var d = r.d;
        var fmt = function (x) { return (x.tipo ? '[' + x.tipo + '] ' : '') + (x.mensaje || String(x)); };
        var erroresMsg      = (d.errores || []).map(fmt);
        var advertenciasMsg = (d.advertencias || []).map(fmt);
        var correcciones = [];
        (d.correcciones_mapeo || []).forEach(function (c) {
          (c.correcciones || []).forEach(function (m) { correcciones.push('[' + c.tipo + '] ' + m); });
        });
        if (d.ok && erroresMsg.length === 0 && advertenciasMsg.length === 0) {
          correcciones.push('Control de calidad superado. La OT está lista para generar.');
        }
        setQa({ errores: erroresMsg, warnings: advertenciasMsg, correcciones: correcciones });
        window.LabStore.logEvento(ot.nro_ot, 'Control de calidad ejecutado (' + (d.ok ? 'OK' : erroresMsg.length + ' error(es)') + ')', 'clipboard');
        setGen('');
        if (d.ok) toast('Control de calidad OK · la OT está lista', 'success');
        else toast('Control de calidad: ' + erroresMsg.length + ' error(es), ' + advertenciasMsg.length + ' advertencia(s)', erroresMsg.length ? 'danger' : 'warning');
      })
      .catch(function (e) { setGen(''); toast('Error en control de calidad: ' + e.message, 'danger'); });
  }

  var est = otEstado(ot);
  var tipos = Object.keys(window.LabStore.labels);

  // OTs hermanas de la misma solicitud (para navegar sin volver al listado).
  var otsHermanas = ot.nro_solicitud
    ? (window.LabStore.listOtsBySolicitud(ot.nro_solicitud) || [])
    : [];
  var barraHermanas = otsHermanas.length > 1
    ? React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          padding: '8px 12px', margin: '4px 0 12px',
          background: 'var(--surface-1, #f6f8fa)',
          border: '1px solid var(--border, #d0d7de)',
          borderRadius: 6, fontSize: 12,
        },
      },
        React.createElement('span', { style: { fontWeight: 700, color: 'var(--text-3, #57606a)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.05em' } },
          'Solicitud ' + ot.nro_solicitud + ' — ' + otsHermanas.length + ' OTs:'),
        otsHermanas.map(function (h) {
          var activa = h.nro_ot === ot.nro_ot;
          return React.createElement('button', {
            key: h.nro_ot,
            className: 'ot-hermana-chip',
            title: (h.id_muestra ? h.id_muestra.split('\n')[0] : ''),
            onClick: function () { if (!activa) nav('#/ot/' + h.nro_ot); },
            style: {
              border: '1px solid ' + (activa ? '#0969da' : 'var(--border, #d0d7de)'),
              background: activa ? '#0969da' : '#fff',
              color: activa ? '#fff' : 'var(--text-2, #24292f)',
              padding: '3px 10px', borderRadius: 14, fontSize: 11,
              fontWeight: activa ? 700 : 500, cursor: activa ? 'default' : 'pointer',
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            },
          }, h.nro_ot);
        }),
        // Botones al final: editar solicitud + eliminar. Ambos aplican a las
        // N OTs hermanas.
        React.createElement('div', { style: { marginLeft: 'auto', display: 'inline-flex', gap: 6 } },
          React.createElement('button', {
            type: 'button',
            title: 'Editar datos administrativos de la solicitud (aplica a las ' + otsHermanas.length + ' OTs)',
            onClick: function (e) {
              console.log('[EditarSolicitud] click', { otsHermanas: otsHermanas.length, editSol: editSol });
              e.stopPropagation();
              setEditSol(true);
            },
            style: {
              border: '1px solid #d0d7de', background: '#fff', color: '#0969da',
              padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            },
          },
            React.createElement(Icon, { name: 'pencil', size: 12 }),
            'Editar solicitud'),
          React.createElement('button', {
            type: 'button',
            title: 'Eliminar TODAS las OTs de esta solicitud',
            onClick: function () { setConfirm({ type: 'solicitud' }); },
            style: {
              border: '1px solid #d0b0b0', background: '#fff', color: '#b02a2a',
              padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            },
          },
            React.createElement(Icon, { name: 'trash', size: 12 }),
            'Eliminar solicitud')))
    : null;
  // Flag "faltan datos" — mostrar chip en header y banner de alerta.
  var _faltDf = [];
  try { _faltDf = ot.datos_faltantes ? JSON.parse(ot.datos_faltantes) : []; } catch (_) { _faltDf = []; }
  if (!Array.isArray(_faltDf)) _faltDf = [];
  var _faltLbl = _faltDf.map(function (f) { return f === 'nro_ot' ? 'Nº de OT' : f === 'id_muestra' ? 'ID de muestra' : f; });
  // OAA: al menos un ensayo pasa la detección real de acreditación (agente-oaa
  // vía /api/oaa-preview). Usamos la misma fuente que el OAAPanel.
  var _esOAA = !!(oaaDet && oaaDet.some(function (d) { return d && d.acreditado; }));
  return React.createElement('div', { className: 'page' },
    React.createElement(Breadcrumb, { items: [
      { label: 'OTs', onClick: function () { nav('#/'); } },
      { label: 'OT ' + ot.nro_ot },
    ]}),
    barraHermanas,
    React.createElement('header', { className: 'page-head' },
      React.createElement('div', { className: 'detail-title' },
        React.createElement('h1', { className: 'page-title' }, React.createElement('span', { className: 'mono' }, ot.nro_ot)),
        React.createElement(StatusChip, { tone: est.tone }, est.label),
        ot.es_preinforme ? React.createElement(StatusChip, { tone: 'warning', icon: 'alertTri' }, 'Preinforme') : null,
        _esOAA ? React.createElement('span', {
          title: 'Al menos un ensayo acreditado (OAA) — el informe va en la carpeta OAA',
          style: {
            fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
            color: '#fff', background: '#7c3aed',
            padding: '3px 8px', borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          },
        }, React.createElement(Icon, { name: 'checkCircle', size: 11 }), 'OAA') : null,
        ot.trello_oaa_label ? React.createElement('span', {
          title: 'La tarjeta de Trello tiene la etiqueta "PARAMETROS ACREDITADOS". Es solo un recordatorio — la acreditación real la valida agente-oaa (norma+sede+temp).',
          style: {
            fontSize: 10, fontWeight: 700, letterSpacing: '.3px',
            color: '#5b21b6', background: '#ede9fe', border: '1px solid #c4b5fd',
            padding: '2px 8px', borderRadius: 999,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          },
        }, React.createElement(Icon, { name: 'tag', size: 11 }), 'Marcada OAA en Trello') : null,
        _faltDf.length > 0 ? React.createElement(StatusChip, { tone: 'danger', icon: 'alertTri' }, 'Faltan datos: ' + _faltLbl.join(', ')) : null
      ),
      React.createElement('div', { className: 'page-head-actions' },
        React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'pencil', onClick: function () { nav('#/ot/' + ot.nro_ot + '/editar'); } }, 'Editar'),
        React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'copy', onClick: function () { setDup(true); } }, 'Duplicar'),
        React.createElement(Button, { variant: 'ghost', size: 'sm', icon: 'trash', onClick: function () { setConfirm({ type: 'ot' }); } }, 'Eliminar')
      )
    ),

    React.createElement('div', { className: 'detail-grid' },
      // ---- columna izquierda ----
      React.createElement('div', { className: 'detail-left' },
        React.createElement(Card, null,
          React.createElement(CardHead, { icon: 'fileText', title: 'Datos de la orden' }),
          React.createElement('div', { className: 'readonly-grid' },
            roField('Solicitud', ot.nro_solicitud, true),
            roField('N° cliente', ot.nro_cliente, true),
            roField('Razón social', ot.razon_social),
            roField('Recepción', fmtDate(ot.fecha_recepcion)),
            roField('Aprobación', fmtDate(ot.fecha_aprobacion)),
            roField('Finalización', fmtDate(ot.fecha_finalizacion))
          ),
          ot.trello_url ? React.createElement('a', { className: 'trello-link', href: ot.trello_url, target: '_blank', rel: 'noreferrer' },
            React.createElement(Icon, { name: 'externalLink', size: 14 }), 'Ver tarjeta en Trello') : null
        ),
        React.createElement(Card, null,
          React.createElement(CardHead, { icon: 'inbox', title: 'Identificación de la muestra' }),
          React.createElement('pre', { className: 'muestra-text' }, ot.id_muestra || '—')
        ),
        React.createElement(Card, null,
          React.createElement(CardHead, { icon: 'image', title: 'Fotos de recepción', sub: 'Carátula del informe' }),
          React.createElement('div', { style: { padding: '0 12px 8px' } },
            React.createElement(Button, {
              variant: 'soft', size: 'sm', icon: 'download',
              loading: fotosAutoLoading,
              onClick: cargarFotosAuto,
              title: 'Buscar fotos en G:\\METALMECANICA\\FOTOS\\CLIENTES 2026 y agregarlas',
            }, 'Cargar fotos automáticamente')
          ),
          React.createElement(PhotoGrid, { photos: fotos, onChange: updateFotos })
        ),
        // ── Inspección — texto libre para la sección "INSPECCION" al final del
        // informe (sin numeración). Se guarda en ots.inspeccion_texto y se
        // emite después del último ensayo en el Word.
        React.createElement(Card, null,
          React.createElement(CardHead, { icon: 'clipboard', title: 'Inspección', sub: 'Texto libre — se emite como sección "INSPECCIÓN" al final del informe' }),
          React.createElement('div', { style: { padding: '0 12px 12px' } },
            React.createElement('textarea', {
              value: inspDraft,
              placeholder: 'Ej: Se verificó la trazabilidad de la muestra y la calibración de los equipos utilizados…',
              onChange: function (e) { setInspDraft(e.target.value); },
              onBlur: function () {
                var actual = (ot.inspeccion_texto || '');
                if (actual === inspDraft) return;
                window.LabStore.updateOt(ot.nro_ot, { inspeccion_texto: inspDraft });
                refresh();
              },
              style: {
                width: '100%', minHeight: 80, border: '1px solid var(--border)',
                borderRadius: 6, padding: 8, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', background: 'var(--surface)',
              },
            })
          )
        ),
        React.createElement(Card, null,
          React.createElement(CardHead, { icon: 'clock', title: 'Historial de la orden' }),
          React.createElement(Timeline, { events: buildTimeline(ot) })
        )
      ),

      // ---- columna derecha (sticky) ----
      React.createElement('div', { className: 'detail-right' },
        React.createElement(Card, null,
          React.createElement(CardHead, { icon: 'flask', title: 'Ensayos', sub: ot.ensayos.length + ' cargado(s)',
            action: React.createElement(Button, { variant: addOpen ? 'soft' : 'primary', size: 'sm', icon: addOpen ? 'x' : 'plus', onClick: function () { setAddOpen(!addOpen); } }, addOpen ? 'Cerrar' : 'Agregar') }),

          addOpen ? React.createElement('div', { className: 'add-ensayo-grid' },
            tipos
              .filter(function (t) {
                // Ensayos deprecados (consolidados bajo "Análisis Metalográfico
                // General"): no se ofrecen al agregar. Los ya cargados en OTs
                // viejas siguen visibles y editables.
                var sch = window.ENSAYO_SCHEMAS[t] || {};
                return !sch.deprecated;
              })
              .map(function (t) {
                var sch = window.ENSAYO_SCHEMAS[t] || {};
                return React.createElement('button', { key: t, className: 'add-ensayo-btn', onClick: function () { nav('#/ot/' + ot.nro_ot + '/ensayo/' + t); } },
                  React.createElement('span', { className: 'add-ensayo-ic' }, React.createElement(Icon, { name: window.ENSAYO_ICON[t] || 'flask', size: 17 })),
                  React.createElement('span', { className: 'add-ensayo-label' }, window.LabStore.labels[t]),
                  sch.pending ? React.createElement('span', { className: 'add-ensayo-soon' }, 'beta') : null
                );
              })
          ) : null,

          ot.ensayos.length === 0
            ? React.createElement('div', { className: 'ensayo-empty' }, 'Todavía no cargaste ensayos. Usá «Agregar».')
            : React.createElement(EnsayoList, { ot: ot, onReorder: function (ids) { window.LabStore.reorderEnsayos(ot.nro_ot, ids); refresh(); }, onDelete: function (e) { setConfirm({ type: 'ensayo', id: e.id, label: window.LabStore.labels[e.tipo] }); }, onChange: refresh })
        ),

        React.createElement(OAAPanel, { nro_ot: ot.nro_ot, key: 'oaa-' + ot.ensayos.length }),

        // Firma por ensayo (individual) — reemplaza al panel de firma de OT
        // que aplicaba a toda la OT. Cada ensayo tiene su propio chip inline
        // dentro de la lista de ensayos (ver EnsayoList).

        (function () {
          var ensayos = ot.ensayos || [];
          var totalEns = ensayos.length;
          // Política simplificada: solo se requiere firma del realizador
          // (estado 'revisado' o 'autorizado'). No hace falta aprobación.
          var firmados = ensayos.filter(function (e) { return e.estado_firma === 'revisado' || e.estado_firma === 'autorizado' || e.estado_firma === 'firmado'; }).length;
          // Flag "faltan datos": si el bot importó la OT con FALTA O.T o FALTA ID,
          // o si el técnico no completó esos campos, no se puede generar.
          var faltantes = [];
          try { faltantes = ot.datos_faltantes ? JSON.parse(ot.datos_faltantes) : []; }
          catch (_) { faltantes = []; }
          if (!Array.isArray(faltantes)) faltantes = [];
          var faltantesLabels = faltantes.map(function (f) { return f === 'nro_ot' ? 'Nº de OT' : f === 'id_muestra' ? 'ID de muestra' : f; });
          var listos = totalEns > 0 && firmados === totalEns && faltantes.length === 0;
          var tooltipGen = faltantes.length > 0
            ? 'Faltan datos: ' + faltantesLabels.join(', ')
            : (totalEns > 0 && firmados < totalEns ? 'Firmá todos los ensayos antes de generar el informe' : '');
          return React.createElement(Card, { className: 'report-card' },
            React.createElement(CardHead, { icon: 'fileDoc', title: 'Generar informe Word' }),
            // Aviso de datos faltantes (bloqueante)
            faltantes.length > 0 ? React.createElement('div', {
              style: {
                margin: '0 0 8px', padding: '8px 12px', borderRadius: 6,
                background: '#fdecea', color: '#b02a2a',
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
              }
            },
              React.createElement(Icon, { name: 'alertTri', size: 14 }),
              'Faltan datos: ' + faltantesLabels.join(', ') + '. Completá para poder generar.'
            ) : null,
            // Estado de doble firma
            totalEns > 0 ? React.createElement('div', {
              style: {
                margin: '0 0 8px', padding: '8px 12px', borderRadius: 6,
                background: (totalEns === firmados) ? '#d1f0dc' : '#fdecea',
                color: (totalEns === firmados) ? '#0f7d3a' : '#b02a2a',
                fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
              }
            },
              React.createElement(Icon, { name: (totalEns === firmados) ? 'checkCircle' : 'alertCircle', size: 14 }),
              (totalEns === firmados)
                ? 'Todos los ensayos están firmados (' + firmados + '/' + totalEns + ')'
                : 'Faltan firmar ' + (totalEns - firmados) + ' de ' + totalEns + ' ensayos'
            ) : null,
            // Solo el CUADRADITO togglea el flag. Los textos van FUERA del
            // <label> para que hacer click en "Marcar como preinforme…" no
            // active el checkbox por accidente.
            React.createElement('div', { className: 'pre-toggle-wrap' },
              React.createElement('label', { className: 'pre-toggle', style: { flex: 'none' } },
                React.createElement('input', { type: 'checkbox', checked: !!ot.es_preinforme, onChange: togglePre }),
                React.createElement('span', { className: 'pre-toggle-box' }, ot.es_preinforme ? React.createElement(Icon, { name: 'check', size: 13, strokeWidth: 3 }) : null)
              ),
              React.createElement('span', { className: 'pre-toggle-texts', style: { cursor: 'default' } },
                React.createElement('span', { className: 'pre-toggle-label' }, 'Marcar como preinforme'),
                React.createElement('span', { className: 'pre-toggle-hint' }, 'Agrega la leyenda «PRELIMINAR» al documento')
              )
            ),
            React.createElement('div', { className: 'report-actions' },
              React.createElement(Button, {
                variant: 'primary', block: true, icon: 'download',
                loading: gen === 'word' && !batchState,
                disabled: !listos || !!batchState,
                title: tooltipGen,
                onClick: genWord,
              }, 'Generar informe'),
              // Botón batch: aparece solo si hay >1 OTs hermanas.
              otsHermanas.length > 1 ? (function () {
                var hermanasFull = otsHermanas.map(function (h) { return window.LabStore.getOt(h.nro_ot); }).filter(Boolean);
                var nListas = hermanasFull.filter(esOtLista).length;
                var totalHerm = hermanasFull.length;
                var disabled = nListas === 0 || !!batchState;
                var tipBatch = nListas === 0
                  ? 'Ninguna OT de la solicitud está lista (falta firma o datos)'
                  : (nListas < totalHerm ? ('Se generarán ' + nListas + '/' + totalHerm + ' OTs (' + (totalHerm - nListas) + ' no listas)') : 'Genera los ' + totalHerm + ' informes en la misma carpeta');
                return React.createElement(Button, {
                  variant: 'soft', block: true, icon: 'download',
                  loading: !!batchState,
                  disabled: disabled,
                  title: tipBatch,
                  onClick: abrirGenerarBatch,
                }, batchState
                    ? ('Generando ' + (batchState.hecho + (batchState.actual ? 1 : 0)) + '/' + batchState.total + '…')
                    : ('Generar los ' + nListas + ' informes'));
              })() : null,
              React.createElement(Button, { variant: 'soft', block: true, icon: 'clipboard', loading: gen === 'qa', onClick: genQA }, 'Control de calidad'),
              React.createElement(Button, { variant: 'soft', block: true, icon: 'sparkles', loading: gen === 'preemision', onClick: genPreEmision, title: 'Análisis de coherencia con IA (Claude): rangos, unidades, normas, valores imposibles' }, 'Análisis IA')
            ),
            qa ? React.createElement(QAPanel, { qa: qa }) : null,
            preEmision ? React.createElement(PreEmisionPanel, { data: preEmision }) : null
          );
        })()
      )
    ),

    confirm && confirm.type === 'ot' ? React.createElement(ConfirmModal, {
      title: 'Eliminar OT ' + ot.nro_ot, message: 'Se eliminará la orden y todos sus ensayos. Esta acción no se puede deshacer.',
      onCancel: function () { setConfirm(null); },
      onConfirm: function () { window.LabStore.deleteOt(ot.nro_ot); toast('OT ' + ot.nro_ot + ' eliminada', 'danger'); nav('#/'); },
    }) : null,
    editSol ? React.createElement(EditarSolicitudModal, {
      nro_solicitud: ot.nro_solicitud,
      ots: otsHermanas,
      onCancel: function () { setEditSol(false); },
      onSaved: function (msg) { setEditSol(false); toast(msg, 'success'); refresh(); },
    }) : null,
    confirm && confirm.type === 'solicitud' ? React.createElement(ConfirmModal, {
      title: 'Eliminar solicitud ' + ot.nro_solicitud + ' completa',
      message: 'Se van a eliminar ' + otsHermanas.length + ' OTs (' +
        otsHermanas.map(function (h) { return h.nro_ot; }).join(', ') +
        ') y todos sus ensayos. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar las ' + otsHermanas.length + ' OTs',
      tone: 'danger',
      onCancel: function () { setConfirm(null); },
      onConfirm: function () {
        var nros = otsHermanas.map(function (h) { return h.nro_ot; });
        nros.forEach(function (nro) { window.LabStore.deleteOt(nro); });
        setConfirm(null);
        toast('Solicitud ' + ot.nro_solicitud + ' eliminada (' + nros.length + ' OTs)', 'danger');
        nav('#/');
      },
    }) : null,
    confirm && confirm.type === 'ensayo' ? React.createElement(ConfirmModal, {
      title: 'Eliminar ensayo', message: 'Se eliminará el ensayo de ' + confirm.label + ' de esta OT.',
      onCancel: function () { setConfirm(null); },
      onConfirm: function () {
        var id = confirm.id;
        setConfirm(null); setQa(null);
        // El delete es async: esperamos la respuesta del backend antes de
        // refrescar la UI. Si el backend rechaza (423, ensayo firmado), el
        // catch del store ya dispara el error visual; no reventamos acá.
        Promise.resolve(window.LabStore.deleteEnsayo(id))
          .then(function () { toast('Ensayo eliminado', 'danger'); refresh(); })
          .catch(function () { /* error ya mostrado por apiErr */ refresh(); });
      },
    }) : null,
    dup ? React.createElement(DuplicateModal, { ot: ot, onCancel: function () { setDup(false); },
      onConfirm: function (data, opts) {
        var nueva = window.LabStore.duplicateOt(ot.nro_ot, data, opts);
        setDup(false); toast('OT ' + nueva.nro_ot + ' creada a partir de ' + ot.nro_ot, 'success'); nav('#/ot/' + nueva.nro_ot);
      } }) : null,
    saveDlg && typeof window.GuardarCarpetaDialog === 'function'
      ? React.createElement(window.GuardarCarpetaDialog, {
          nroOt: ot.nro_ot,
          // En modo batch, usamos la OT actual solo para detectar la carpeta
          // (la solicitud comparte cliente/carpeta). El filename se recalcula
          // por OT dentro del handler batch.
          batchInfo: saveDlg === 'word-batch' ? {
            total: otsHermanas.length,
            listas: otsHermanas.map(function (h) { return window.LabStore.getOt(h.nro_ot); }).filter(Boolean).filter(esOtLista).map(function (o) { return o.nro_ot; }),
          } : null,
          onConfirm: function (carpeta, filename, opts) {
            if (saveDlg === 'word-batch') ejecutarGenerarWordBatch(carpeta, filename, opts);
            else ejecutarGenerarWord(carpeta, filename, opts);
          },
          onCancel: function () { setSaveDlg(null); },
        })
      : null,
    informeEmitido ? React.createElement(InformeEmitidoModal, {
      info: informeEmitido,
      onClose: function () { setInformeEmitido(null); },
    }) : null,
    // Modal genérico (reemplaza window.confirm/alert nativos).
    mdl ? React.createElement(window.ConfirmModal, {
      title: mdl.title, message: mdl.message,
      tone: mdl.tone || 'warning',
      confirmLabel: mdl.confirmLabel || 'OK',
      confirmIcon:  mdl.confirmIcon,
      cancelLabel:  mdl.cancelLabel || 'Cancelar',
      hideCancel:   !!mdl.hideCancel,
      extraButtons: mdl.extraButtons,
      onConfirm:    mdl.onConfirm,
      onCancel:     mdl.onCancel,
    }) : null,
    // Modal "Motivo del cambio" para reemisión OAA acreditada (versión > 1).
    motivoDlg ? React.createElement(MotivoCambioModal, motivoDlg) : null,
    // Modal "Falta fecha de aprobación" con date picker in-place.
    faDlg ? React.createElement(FaltaFechaAprobacionModal, faDlg) : null,
    // Modal "Confirmar razón social" antes de generar informe (single o batch).
    razonDlg ? React.createElement(ConfirmarRazonSocialModal, {
      razonActual: ot.razon_social || '',
      modo: razonDlg.modo,
      cantidadOts: razonDlg.modo === 'batch' ? (otsHermanas.length) : 1,
      cantHermanas: otsHermanas.length,
      tieneSolicitud: !!ot.nro_solicitud,
      onCancel: function () { setRazonDlg(null); },
      onConfirm: function (razonFinal) {
        var razonCambio = razonFinal.trim() !== (ot.razon_social || '').trim();
        var modo = razonDlg.modo;
        // Actualizar la razón social ANTES de disparar la generación — si el
        // update es async (updateSolicitud), esperamos a que resuelva. Sino
        // el backend puede leer el valor viejo de la DB (race condition) y el
        // Word sale con el nombre viejo tanto en el filename como en el
        // encabezado "Sres…".
        var prom;
        if (razonCambio) {
          if (ot.nro_solicitud && typeof window.LabStore.updateSolicitud === 'function') {
            prom = window.LabStore.updateSolicitud(ot.nro_solicitud, { razon_social: razonFinal.trim() });
          } else {
            var r = window.LabStore.updateOt(ot.nro_ot, { razon_social: razonFinal.trim() });
            prom = (r && typeof r.then === 'function') ? r : Promise.resolve();
          }
          ot.razon_social = razonFinal.trim();
        } else {
          prom = Promise.resolve();
        }
        setRazonDlg(null);
        Promise.resolve(prom).then(function () {
          if (modo === 'batch') setSaveDlg('word-batch');
          else setSaveDlg('word');
        }).catch(function (e) {
          toast('No se pudo actualizar la razón social: ' + (e && e.message ? e.message : e), 'danger');
        });
      },
    }) : null,
    // Modal específico de colisión de nombre de archivo (radios + nombre editable).
    archExiste ? React.createElement(ArchivoExistenteModal, {
      filename: archExiste.filename,
      filenameSugerido: archExiste.filenameSugerido,
      carpeta:  archExiste.carpeta,
      onSubmit: function (res) {
        var it = archExiste; setArchExiste(null);
        // res: { modo: 'sufijo' | 'sobrescribir' | 'renombrar', filename }
        var opts = Object.assign({}, it.opts);
        if (res.modo === 'sobrescribir') {
          // Sobrescribir usa el filename tal cual escribió el técnico.
          opts.modoConflicto = 'sobrescribir';
          opts.nombreCustom  = res.filename !== it.filename; // si editó, es custom
          ejecutarGenerarWord(it.carpeta, res.filename, opts);
        } else if (res.modo === 'renombrar') {
          // nombreCustom=true evita que el backend re-aplique la convención.
          opts.nombreCustom = true;
          ejecutarGenerarWord(it.carpeta, res.filename, opts);
        } else {
          // sufijo: si el técnico editó el nombre respecto al sugerido, tratarlo
          // como custom. Sino, dejar que el backend arme el sufijo automático.
          if (res.filename !== (it.filenameSugerido || it.filename)) {
            opts.nombreCustom = true;
            ejecutarGenerarWord(it.carpeta, res.filename, opts);
          } else {
            opts.modoConflicto = 'sufijo';
            ejecutarGenerarWord(it.carpeta, it.filename, opts);
          }
        }
      },
      onCancel: function () { setArchExiste(null); toast('Emisión cancelada.', 'warning'); },
    }) : null
  );
}

// Modal persistente que se abre al terminar la emisión de un informe. Muestra
// la ruta completa y ofrece: abrir la carpeta (Explorer con /select) o copiar
// la ruta al portapapeles.
/* Modal de colisión de archivo. Rediseñado: el técnico elige entre 3 modos
   con radio buttons, y el nombre del archivo es editable EN CUALQUIER MODO.
     - "Nueva versión (con -N)"   → agrega el sufijo -N sugerido.
     - "Sobrescribir"              → pisa el archivo existente (sin sufijo).
     - "Cambiar nombre"            → nombre libre que escriba el técnico.
   Al aceptar, el backend recibe el `filename` que quedó en el input +
   `modo_conflicto` según la opción elegida. */
// Modal "Nueva versión del informe" con textarea de motivo. Se muestra cuando
// el backend detecta que ya hay un informe vigente (código CONFIRMAR_VERSION_NUEVA).
// El motivo se emite en el Word entre la carátula y el primer ensayo. Es un
// requisito OAA cuando la OT tiene ensayos acreditados.
// Modal "Confirmar razón social" antes de generar informe. Muestra la razón
// actual en un input editable. Si el técnico la modifica, se persiste en la
// OT antes de continuar con la generación (la carpeta destino en el drive se
// resuelve por razón social — evita informes en carpeta equivocada por typo
// del bot). Opción para propagar el cambio a todas las OTs de la solicitud.
// Modal "Falta fecha de aprobación" — se abre cuando el endpoint /generate
// devuelve 422 con code=FALTA_FECHA_APROBACION. Permite cargar la fecha con
// un date picker in-place y guardarla + reintentar la generación sin salir
// del modal actual.
function FaltaFechaAprobacionModal(props) {
  var _f = React.useState(props.initial || ''); var fecha = _f[0], setFecha = _f[1];
  var puedeConfirmar = /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  var _dwn = React.useRef(false);
  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    onMouseDown: function (e) { _dwn.current = (e.target === e.currentTarget); },
    onMouseUp: function (e) {
      if (_dwn.current && e.target === e.currentTarget) props.onCancel();
      _dwn.current = false;
    },
  },
    React.createElement('div', { style: { background: '#fff', borderRadius: 8, width: 'min(92vw, 480px)', overflow: 'hidden' } },
      React.createElement('div', { style: { background: '#fff8e5', borderBottom: '1px solid #e0c060', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement(Icon, { name: 'alertTri', size: 20, style: { color: '#8a5a00' } }),
        React.createElement('div', null,
          React.createElement('h3', { style: { margin: 0, color: '#8a5a00', fontSize: 15 } }, 'Falta la fecha de aprobación'),
          React.createElement('div', { style: { fontSize: 12, color: '#8a5a00c0', marginTop: 3 } },
            props.propagar
              ? 'La fecha de aprobación es de la solicitud: aplica a las ' + (props.cantHermanas || 1) + ' OTs hermanas'
              : 'Cargá la fecha de aprobación de gerencia')
        )
      ),
      React.createElement('div', { style: { padding: 20 } },
        React.createElement('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Fecha de aprobación:'),
        React.createElement('input', {
          type: 'date', autoFocus: true, value: fecha,
          onChange: function (e) { setFecha(e.target.value); },
          style: { width: '100%', padding: '8px 10px', border: '1px solid ' + (puedeConfirmar ? '#0969da' : '#d0d7de'), borderRadius: 4, fontSize: 13, fontFamily: 'inherit' },
        }),
        React.createElement('div', { style: { fontSize: 11, color: 'var(--text-3)', marginTop: 8 } },
          'Al confirmar, se guarda la fecha y se genera el informe automáticamente.')
      ),
      React.createElement('div', { style: { padding: '12px 16px', borderTop: '1px solid #d0d7de', display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement(Button, { variant: 'ghost', onClick: props.onCancel }, 'Cancelar'),
        React.createElement(Button, {
          variant: 'primary', icon: 'check', disabled: !puedeConfirmar,
          onClick: function () { if (puedeConfirmar) props.onGuardar(fecha); },
        }, 'Guardar y generar')
      )
    )
  );
}

function ConfirmarRazonSocialModal(props) {
  var _r2 = React.useState(props.razonActual || ''); var razon = _r2[0], setRazon = _r2[1];
  var cambio = razon.trim() !== (props.razonActual || '').trim();
  var puedeConfirmar = razon.trim().length >= 2;
  var esBatch = props.modo === 'batch';
  // La razón social es dato de la solicitud: cualquier cambio propaga a todas
  // las hermanas. No hay checkbox: siempre se aplica al lote entero.
  var totalOts = props.tieneSolicitud ? (props.cantHermanas || 1) : 1;
  // Cerrar por click en backdrop SOLO si el drag empezó Y terminó en el
  // backdrop. Si el usuario arrastra desde adentro del input hacia afuera
  // para seleccionar texto y suelta en el backdrop, no queremos cerrar.
  var _dwn = React.useRef(false);
  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    onMouseDown: function (e) { _dwn.current = (e.target === e.currentTarget); },
    onMouseUp: function (e) {
      if (_dwn.current && e.target === e.currentTarget) props.onCancel();
      _dwn.current = false;
    },
  },
    React.createElement('div', { style: { background: '#fff', borderRadius: 8, width: 'min(92vw, 540px)', overflow: 'hidden' } },
      React.createElement('div', { style: { background: '#e7f0ff', borderBottom: '1px solid #0969da', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement(Icon, { name: 'building', size: 20, style: { color: '#0550ae' } }),
        React.createElement('div', null,
          React.createElement('h3', { style: { margin: 0, color: '#0550ae', fontSize: 15 } }, 'Confirmar razón social'),
          React.createElement('div', { style: { fontSize: 12, color: '#0550aec0', marginTop: 3 } },
            esBatch
              ? 'Batch de ' + (props.cantidadOts || 1) + ' OT(s) — el cambio aplica a la solicitud entera'
              : (props.tieneSolicitud
                  ? 'La razón social es de la solicitud (aplica a las ' + totalOts + ' OTs hermanas)'
                  : 'La razón social define la carpeta destino en el drive'))
        )
      ),
      React.createElement('div', { style: { padding: 20 } },
        React.createElement('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Razón social:'),
        React.createElement('input', {
          type: 'text', autoFocus: true, value: razon,
          onChange: function (e) { setRazon(e.target.value); },
          style: { width: '100%', padding: '8px 10px', border: '1px solid ' + (cambio ? '#0969da' : '#d0d7de'), borderRadius: 4, fontSize: 13, fontFamily: 'inherit' },
        }),
        cambio ? React.createElement('div', { style: { fontSize: 11, color: '#8a5a00', marginTop: 8 } },
          props.tieneSolicitud
            ? '⚠ El cambio se propaga a las ' + totalOts + ' OTs de la solicitud y afecta la carpeta destino en el drive.'
            : '⚠ Vas a modificar la razón social. Impacta en la carpeta destino del drive.') : null
      ),
      React.createElement('div', { style: { padding: '12px 16px', borderTop: '1px solid #d0d7de', display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement(Button, { variant: 'ghost', onClick: props.onCancel }, 'Cancelar'),
        React.createElement(Button, {
          variant: 'primary', icon: 'check', disabled: !puedeConfirmar,
          onClick: function () { if (puedeConfirmar) props.onConfirm(razon); },
        }, cambio ? 'Confirmar y generar' : 'Generar')
      )
    )
  );
}

function MotivoCambioModal(props) {
  var _m = React.useState(''); var motivo = _m[0], setMotivo = _m[1];
  var puedeConfirmar = motivo.trim().length >= 3;
  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    onClick: function (e) { if (e.target === e.currentTarget) props.onCancel(); },
  },
    React.createElement('div', { style: { background: '#fff', borderRadius: 8, width: 'min(92vw, 560px)', overflow: 'hidden' } },
      React.createElement('div', { style: { background: '#fff8e5', borderBottom: '1px solid #e0c060', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement(Icon, { name: 'alertTri', size: 20, style: { color: '#8a5a00' } }),
        React.createElement('div', null,
          React.createElement('h3', { style: { margin: 0, color: '#8a5a00', fontSize: 15 } }, props.titulo || 'Nueva versión del informe'),
          React.createElement('div', { style: { fontSize: 12, color: '#8a5a00c0', marginTop: 3 } },
            'Versión ' + props.versionActual + ' → versión ' + props.versionNueva + ' · ' + (props.filenameNuevo || ''))
        )
      ),
      React.createElement('div', { style: { padding: 20 } },
        React.createElement('p', { style: { fontSize: 12, color: 'var(--text-2)', margin: '0 0 12px' } },
          'Al confirmar, la versión anterior se moverá a SUPERADO/ y se emitirá la nueva. ' +
          'Si el informe es acreditado (OAA), el motivo se emite obligatoriamente en el Word entre la carátula y el primer ensayo.'),
        React.createElement('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Motivo del cambio:'),
        React.createElement('textarea', {
          autoFocus: true, value: motivo,
          onChange: function (e) { setMotivo(e.target.value); },
          placeholder: 'Ej: Eliminación de marcación de fuera de alcance. Acero inoxidable dentro del alcance acreditado.',
          style: { width: '100%', minHeight: 90, border: '1px solid #d0d7de', borderRadius: 4, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical' },
        }),
        React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-3)', marginTop: 6 } },
          'Mínimo 3 caracteres. Queda registrado en informes_emitidos.motivo_cambio.')
      ),
      React.createElement('div', { style: { padding: '12px 16px', borderTop: '1px solid #d0d7de', display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        React.createElement(Button, { variant: 'ghost', onClick: props.onCancel }, 'Cancelar'),
        React.createElement(Button, {
          variant: 'warning', icon: 'download', disabled: !puedeConfirmar,
          onClick: function () { if (puedeConfirmar) props.onConfirm(motivo.trim()); },
        }, 'Emitir nueva versión')
      )
    )
  );
}

function ArchivoExistenteModal(props) {
  var filename = props.filename || '';
  var filenameSugerido = props.filenameSugerido || filename;
  // Modo por default: 'sufijo' (crear nueva versión) — es el caso más frecuente.
  var _modo = React.useState('sufijo');
  var modo = _modo[0], setModo = _modo[1];
  // Nombre editable — se sincroniza con el modo al cambiar.
  var _nn = React.useState(filenameSugerido);
  var nuevoNombre = _nn[0], setNuevoNombre = _nn[1];

  // Al cambiar modo, actualizar el nombre por default (el técnico puede editarlo
  // después). Sufijo → sugerido, Sobrescribir → original, Renombrar → editable.
  function seleccionarModo(m) {
    setModo(m);
    if (m === 'sufijo')        setNuevoNombre(filenameSugerido);
    else if (m === 'sobrescribir') setNuevoNombre(filename);
    // Si es 'renombrar', dejar lo que hay (permite editar).
  }

  var backdrop = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 9999,
  };
  var box = {
    background: 'var(--surface)', color: 'var(--text)',
    borderRadius: 8, width: 'min(90vw, 560px)',
    border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-lg)',
    display: 'flex', flexDirection: 'column',
  };
  var head = { padding: '14px 20px', borderBottom: '1px solid var(--border-strong)', background: 'var(--surface-2)', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 };
  var body = { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 };
  var infoBox = { padding: '10px 12px', background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 4, fontFamily: 'Consolas, monospace', fontSize: 12, wordBreak: 'break-all' };
  var inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 4, fontSize: 12, fontFamily: 'Consolas, monospace' };
  var footer = { padding: '12px 20px', borderTop: '1px solid var(--border-strong)', background: 'var(--surface-2)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' };
  var radioRow = {
    display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px',
    borderRadius: 4, cursor: 'pointer',
  };

  function submit() {
    var nn = String(nuevoNombre || '').trim();
    if (!nn) return;
    if (!/\.docx$/i.test(nn)) nn += '.docx';
    if (modo === 'sobrescribir') {
      // Si el técnico editó el nombre en modo sobrescribir, aplica de todos modos:
      // usa el nombre elegido y sobrescribe si existe.
      props.onSubmit && props.onSubmit({ modo: 'sobrescribir', filename: nn });
    } else if (modo === 'renombrar') {
      props.onSubmit && props.onSubmit({ modo: 'renombrar', filename: nn });
    } else {
      // sufijo: usa el nombre con -N (o el que el técnico haya editado).
      props.onSubmit && props.onSubmit({ modo: 'sufijo', filename: nn });
    }
  }

  var opciones = [
    { id: 'sufijo',       label: 'Crear nueva versión (con -N)', desc: 'Guarda como ' + filenameSugerido + ' — deja intacto el archivo anterior.' },
    { id: 'sobrescribir', label: 'Sobrescribir el archivo existente', desc: 'Pisa el archivo actual. El anterior se pierde.', variant: 'danger' },
    { id: 'renombrar',    label: 'Guardar con otro nombre',    desc: 'Elegís vos el nombre completo.' },
  ];

  return React.createElement('div', {
    style: backdrop,
    onMouseDown: function (e) {
      if (e.target === e.currentTarget) {
        e.stopPropagation();
        e.preventDefault();
        props.onCancel();
      }
    },
    onClick: function (e) { e.stopPropagation(); },
  },
    React.createElement('div', { style: box, onMouseDown: function (e) { e.stopPropagation(); } },
      React.createElement('div', { style: head },
        React.createElement(Icon, { name: 'alertTri', size: 18 }),
        React.createElement('span', null, 'El archivo ya existe')
      ),
      React.createElement('div', { style: body },
        React.createElement('div', null, 'Ya hay un archivo con este nombre en la carpeta destino:'),
        React.createElement('div', { style: infoBox }, filename),
        React.createElement('div', { style: { color: 'var(--text-3)', fontSize: 12, marginTop: 4 } }, '¿Qué querés hacer?'),
        // Radios
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 4, padding: 4 } },
          opciones.map(function (o) {
            var seleccionado = modo === o.id;
            var rowStyle = Object.assign({}, radioRow, {
              background: seleccionado ? 'var(--surface-2)' : 'transparent',
              border: seleccionado
                ? '1px solid ' + (o.variant === 'danger' ? 'var(--danger)' : 'var(--primary)')
                : '1px solid transparent',
            });
            return React.createElement('label', { key: o.id, style: rowStyle },
              React.createElement('input', {
                type: 'radio', name: 'archexiste-modo', checked: seleccionado,
                onChange: function () { seleccionarModo(o.id); },
                style: { marginTop: 3 },
              }),
              React.createElement('div', null,
                React.createElement('div', { style: { fontWeight: 600, fontSize: 13 } }, o.label),
                React.createElement('div', { style: { fontSize: 11, color: 'var(--text-3)', marginTop: 2 } }, o.desc)
              )
            );
          })
        ),
        // Input de nombre — editable siempre. Muestra qué se va a guardar.
        React.createElement('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 10 } },
          React.createElement('div', { style: { fontWeight: 600, fontSize: 12, marginBottom: 4 } }, 'Nombre del archivo (editable):'),
          React.createElement('input', {
            style: inputStyle,
            value: nuevoNombre,
            onChange: function (e) { setNuevoNombre(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') submit(); },
          })
        )
      ),
      React.createElement('div', { style: footer },
        React.createElement(Button, { variant: 'ghost', onClick: props.onCancel }, 'Cancelar'),
        React.createElement(Button, {
          variant: modo === 'sobrescribir' ? 'danger' : 'primary',
          icon: 'download', onClick: submit,
        }, 'Guardar')
      )
    )
  );
}

// Normaliza rutas UNC del share Labtesa1 → letra local G:\ (el server las mapea).
function unc2Local(ruta) {
  if (!ruta) return ruta;
  return String(ruta)
    .replace(/^[\\\/]{2}192\.168\.1\.200[\\\/]+Labtesa1[\\\/]+/i, 'G:\\')
    .replace(/\//g, '\\');
}

function InformeEmitidoModal(props) {
  var info = props.info || {};
  // Modo batch: mostrar un resumen con la lista de OTs generadas + skippeadas
  // + fallidas. La ruta a copiar es la carpeta común (todos van a la misma).
  if (info.batch) {
    var generados = info.generados || [];
    var fallidos  = info.fallidos  || [];
    var skipped   = info.skipped   || [];
    var carpetaComun = generados.length ? (function () {
      var idx = Math.max(String(generados[0].ruta).lastIndexOf('\\'), String(generados[0].ruta).lastIndexOf('/'));
      return idx >= 0 ? generados[0].ruta.slice(0, idx) : '';
    })() : '';
    var carpetaLocal = unc2Local(carpetaComun);
    // URL del handler labopen:// — el <a> directo funciona si el handler está
    // registrado en el navegador (usuario clickeó "abrir siempre" en el prompt).
    // Encodear `:` como %3A para que Chrome no interprete el `G:` como scheme.
    var handlerUrlBatch = carpetaLocal
      ? 'labopen://' + carpetaLocal.replace(/\\/g, '/').replace(/:/g, '%3A')
      : '';
    return React.createElement('div', {
      style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
      onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); },
    },
      React.createElement('div', { style: { background: '#fff', borderRadius: 8, width: 'min(92vw, 720px)', overflow: 'hidden', maxHeight: '85vh', display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { style: { background: '#f0fff4', borderBottom: '1px solid #c6f6d5', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 } },
          React.createElement(Icon, { name: 'check', size: 20, style: { color: '#0f7d3a' } }),
          React.createElement('div', null,
            React.createElement('h3', { style: { margin: 0, color: '#0f7d3a' } }, 'Batch de solicitud emitido'),
            React.createElement('div', { style: { fontSize: 12, color: '#0f7d3a99', marginTop: 2 } },
              generados.length + ' generados · ' + fallidos.length + ' con error · ' + skipped.length + ' skippeados')
          )
        ),
        React.createElement('div', { style: { padding: 16, overflow: 'auto' } },
          carpetaComun ? React.createElement('div', { style: { marginBottom: 12 } },
            React.createElement('div', { style: { fontSize: 11, color: 'var(--text-3)', marginBottom: 4 } }, 'Carpeta destino:'),
            React.createElement('div', { style: { fontFamily: 'ui-monospace, monospace', fontSize: 11, wordBreak: 'break-all', background: '#f6f8fa', padding: '6px 8px', borderRadius: 4 } }, carpetaLocal)
          ) : null,
          generados.length ? React.createElement('div', { style: { marginBottom: 12 } },
            React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: '#0f7d3a', marginBottom: 6 } }, '✓ Generados (' + generados.length + '):'),
            React.createElement('ul', { style: { margin: 0, padding: '0 0 0 18px', fontSize: 12 } },
              generados.map(function (g) {
                return React.createElement('li', { key: g.nro_ot, style: { marginBottom: 3 } },
                  React.createElement('span', { style: { fontFamily: 'ui-monospace, monospace', fontWeight: 600 } }, g.nro_ot),
                  ' — ',
                  React.createElement('span', { style: { color: 'var(--text-2)' } }, g.filename || ''),
                  g.version ? React.createElement('span', { style: { color: 'var(--text-3)', marginLeft: 6 } }, '(v' + g.version + ')') : null);
              }))
          ) : null,
          fallidos.length ? React.createElement('div', { style: { marginBottom: 12 } },
            React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: '#b02a2a', marginBottom: 6 } }, '✗ Fallidos (' + fallidos.length + '):'),
            React.createElement('ul', { style: { margin: 0, padding: '0 0 0 18px', fontSize: 12 } },
              fallidos.map(function (f) {
                return React.createElement('li', { key: f.nro_ot, style: { marginBottom: 3 } },
                  React.createElement('span', { style: { fontFamily: 'ui-monospace, monospace', fontWeight: 600 } }, f.nro_ot),
                  ' — ', React.createElement('span', { style: { color: '#b02a2a' } }, f.error || ''));
              }))
          ) : null,
          skipped.length ? React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: '#8a5a00', marginBottom: 6 } }, '⊘ Skippeados por falta de firma/datos (' + skipped.length + '):'),
            React.createElement('div', { style: { fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' } }, skipped.join(', '))
          ) : null
        ),
        React.createElement('div', { style: { padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          handlerUrlBatch ? React.createElement('a', {
            className: 'btn btn-soft', href: handlerUrlBatch,
            style: { textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 },
            title: 'Abrir la carpeta en Explorer (' + carpetaLocal + ')',
          }, React.createElement(Icon, { name: 'folder', size: 14 }), 'Abrir carpeta') : null,
          React.createElement(Button, { variant: 'primary', onClick: props.onClose }, 'Cerrar')
        )
      )
    );
  }
  var rutaLocal = unc2Local(info.ruta);
  var _copiado = React.useState(false);
  var copiado = _copiado[0], setCopiado = _copiado[1];

  function copiarRuta() {
    if (!rutaLocal) return;
    try {
      navigator.clipboard.writeText(rutaLocal).then(function () {
        setCopiado(true);
        setTimeout(function () { setCopiado(false); }, 2000);
      });
    } catch (_) {}
  }
  function abrirCarpeta() {
    if (!rutaLocal) return;
    var idx = Math.max(rutaLocal.lastIndexOf('\\'), rutaLocal.lastIndexOf('/'));
    var carpeta = idx >= 0 ? rutaLocal.slice(0, idx) : rutaLocal;
    // Siempre disparar labopen:// — si está instalado, abre Explorer directo.
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = 'labopen://' + carpeta.replace(/\\/g, '/');
    document.body.appendChild(iframe);
    setTimeout(function () { try { document.body.removeChild(iframe); } catch (_) {} }, 500);
    var handlerOk = false;
    try { handlerOk = localStorage.getItem('labopenInstalled') === '1'; } catch (_) {}
    if (handlerOk) return;
    // Fallback: descarga .url + clipboard.
    var rutaFile = 'file:///' + carpeta.replace(/\\/g, '/');
    var contenido = '[InternetShortcut]\r\nURL=' + rutaFile + '\r\n';
    var last = carpeta.split(/[\\\/]/).filter(Boolean).pop() || 'carpeta';
    var nombre = 'Abrir_' + last.replace(/[^A-Za-z0-9 _\-]/g, '_').slice(0, 40) + '.url';
    var blob = new Blob([contenido], { type: 'application/internet-shortcut' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (_) {} }, 500);
    if (window._labToastOk) window._labToastOk('Descargado ' + nombre + '. Instalá el handler en Auditoría para abrir directo.');
  }

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); },
  },
    React.createElement('div', {
      style: { background: '#fff', borderRadius: 8, width: 'min(90vw, 640px)', overflow: 'hidden' },
    },
      React.createElement('div', {
        style: { background: '#f0fff4', borderBottom: '1px solid #c6f6d5',
                 padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 },
      },
        React.createElement(Icon, { name: 'check', size: 20, style: { color: '#0f7d3a' } }),
        React.createElement('div', null,
          React.createElement('h3', { style: { margin: 0, color: '#0f7d3a' } }, 'Informe emitido correctamente'),
          info.version ? React.createElement('div', { style: { fontSize: 12, color: '#0f7d3a99', marginTop: 2 } },
            'Versión ' + info.version) : null
        )
      ),
      React.createElement('div', { style: { padding: 20 } },
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text-3)', marginBottom: 6 } }, 'Archivo:'),
        React.createElement('div', {
          style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600, marginBottom: 12,
                   wordBreak: 'break-all' },
        }, info.filename || '(sin nombre)'),
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text-3)', marginBottom: 6 } }, 'Guardado en:'),
        React.createElement('div', {
          style: { fontFamily: 'ui-monospace, monospace', fontSize: 11, background: '#f4f4f4',
                   padding: '10px 12px', borderRadius: 4, wordBreak: 'break-all',
                   border: '1px solid var(--border)', marginBottom: 14 },
        }, rutaLocal || '(sin ruta registrada)'),
        info.sha256 ? React.createElement('div', {
          style: { fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--text-3)',
                   marginBottom: 14, wordBreak: 'break-all' },
        }, 'SHA-256: ' + info.sha256) : null,
        React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
          info.ruta ? React.createElement(Button, {
            variant: 'soft', size: 'sm', icon: copiado ? 'check' : 'copy',
            onClick: copiarRuta,
          }, copiado ? '¡Copiado!' : 'Copiar ruta') : null,
          rutaLocal ? (function () {
            var idx = Math.max(rutaLocal.lastIndexOf('\\'), rutaLocal.lastIndexOf('/'));
            var carpeta = idx >= 0 ? rutaLocal.slice(0, idx) : rutaLocal;
            var handlerUrl = 'labopen://' + carpeta.replace(/\\/g, '/').replace(/:/g, '%3A');
            return React.createElement('a', {
              className: 'btn btn-soft btn-sm',
              href: handlerUrl,
              style: { textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 },
            }, React.createElement(Icon, { name: 'folder', size: 14 }), 'Abrir carpeta');
          })() : null,
          React.createElement(Button, { variant: 'primary', size: 'sm', onClick: props.onClose }, 'Cerrar')
        )
      )
    )
  );
}

/* ---- Lista de ensayos con reordenamiento por arrastre ---- */
function EnsayoList(props) {
  var ot = props.ot;
  var _drag = React.useState(null); var dragId = _drag[0], setDragId = _drag[1];
  var _over = React.useState(null); var overId = _over[0], setOverId = _over[1];

  function onDrop(targetId) {
    var ids = ot.ensayos.map(function (e) { return e.id; });
    if (dragId == null || dragId === targetId) { setDragId(null); setOverId(null); return; }
    var from = ids.indexOf(dragId), to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null); setOverId(null);
    props.onReorder(ids);
  }

  return React.createElement('div', { className: 'ensayo-list' },
    ot.ensayos.length > 1 ? React.createElement('p', { className: 'ensayo-list-hint' },
      React.createElement(Icon, { name: 'grip', size: 13 }), 'Arrastrá para definir el orden en el informe') : null,
    ot.ensayos.map(function (e) {
      var d = {}; try { d = JSON.parse(e.datos_json); } catch (x) {}
      var sch = window.ENSAYO_SCHEMAS[e.tipo];
      var variante = sch.variants ? (sch.variants.find(function (v) { return v.id === d.variante; }) || {}).label : null;
      var nRes = (d.resultados || d.probetas || d.muestras || d.mediciones || []).length;
      var norma = obtenerNorma(e.tipo, d);
      return React.createElement('div', {
        key: e.id, className: 'ensayo-item' + (dragId === e.id ? ' dragging' : '') + (overId === e.id ? ' drop-over' : ''),
        draggable: true,
        onDragStart: function (ev) { setDragId(e.id); ev.dataTransfer.effectAllowed = 'move'; },
        onDragEnd: function () { setDragId(null); setOverId(null); },
        onDragOver: function (ev) { ev.preventDefault(); if (overId !== e.id) setOverId(e.id); },
        onDrop: function () { onDrop(e.id); },
      },
        React.createElement('span', { className: 'ensayo-grip', title: 'Arrastrar' }, React.createElement(Icon, { name: 'grip', size: 15 })),
        React.createElement('span', { className: 'ensayo-item-ic' }, React.createElement(Icon, { name: window.ENSAYO_ICON[e.tipo], size: 18 })),
        React.createElement('div', { className: 'ensayo-item-body' },
          React.createElement('span', { className: 'ensayo-item-title' }, window.LabStore.labels[e.tipo]),
          React.createElement('span', { className: 'ensayo-item-meta' },
            variante ? variante : (norma || 'sin norma'),
            nRes ? ' · ' + nRes + ' resultado(s)' : ''),
          // Chip de firma (estado + acciones inline). Muestra "Sin firmar",
          // "Firmó · Nombre" o "Aprobó · Nombre" con botones para avanzar.
          typeof window.FirmaEnsayoChip === 'function'
            ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' } },
                React.createElement(window.FirmaEnsayoChip, { ensayo: e, onChange: props.onChange }))
            : null
        ),
        React.createElement('div', { className: 'ensayo-item-actions' },
          React.createElement('button', { className: 'icon-btn', title: 'Editar', onClick: function () { nav('#/ot/' + ot.nro_ot + '/ensayo/' + e.tipo + '/' + e.id); } }, React.createElement(Icon, { name: 'pencil', size: 15 })),
          React.createElement('button', { className: 'icon-btn danger', title: 'Eliminar', onClick: function () { props.onDelete(e); } }, React.createElement(Icon, { name: 'trash', size: 15 }))
        )
      );
    })
  );
}

/* ---- Modal de duplicar OT (con import desde Trello) ---- */
function DuplicateModal(props) {
  var toast = useToast();
  var ot = props.ot;
  var _nro = React.useState(''); var nro = _nro[0], setNro = _nro[1];
  var _sol = React.useState(''); var sol = _sol[0], setSol = _sol[1];
  var _idm = React.useState(''); var idm = _idm[0], setIdm = _idm[1];
  var _ens = React.useState(true); var ens = _ens[0], setEns = _ens[1];
  var _fot = React.useState(false); var fot = _fot[0], setFot = _fot[1];
  // Trello
  var _trUrl  = React.useState(''); var trUrl  = _trUrl[0],  setTrUrl  = _trUrl[1];
  var _trRes  = React.useState(null); var trRes  = _trRes[0],  setTrRes  = _trRes[1];
  var _trLoad = React.useState(false); var trLoad = _trLoad[0], setTrLoad = _trLoad[1];
  var err = !nro.trim() ? 'Ingresá el N° de OT' : !/^[0-9]{4,8}$/.test(nro.trim()) ? 'Debe ser numérico (4–8 dígitos)' : window.LabStore.getOt(nro.trim()) ? 'Ya existe una OT con ese número' : '';
  var nEnsayos = ot.ensayos.length;

  function importTrello() {
    if (!trUrl.trim()) return;
    setTrLoad(true);
    window.LabStore.parseTrello(trUrl.trim())
      .then(function (res) {
        setTrRes(res); setTrLoad(false);
        if (res.nro_solicitud) setSol(res.nro_solicitud);
        if (res.ots && res.ots.length === 1) {
          setNro(res.ots[0].nro_ot);
          setIdm(res.ots[0].id_muestra || '');
        }
        toast('Datos importados desde Trello', 'success');
      })
      .catch(function (e) { setTrLoad(false); toast('Error Trello: ' + e.message, 'danger'); });
  }
  function pickTrelloOt(o) { setNro(o.nro_ot); setIdm(o.id_muestra || ''); }

  return React.createElement(Modal, { onClose: props.onCancel },
    React.createElement('div', { className: 'modal-head' },
      React.createElement('h3', null, 'Duplicar OT como plantilla'),
      React.createElement('button', { className: 'modal-x', onClick: props.onCancel }, React.createElement(Icon, { name: 'x', size: 18 }))
    ),
    React.createElement('div', { className: 'modal-form' },
      React.createElement('p', { className: 'dup-intro' }, 'Se creará una OT nueva con el cliente, la identificación de muestra, las fechas y la configuración de ensayos de ', React.createElement('strong', null, 'OT ' + ot.nro_ot), '. Podés cambiar las fechas después si hace falta.'),

      // Trello import
      React.createElement('div', { className: 'dup-trello' },
        React.createElement('label', { className: 'dup-trello-label' }, 'Importar desde Trello (opcional)'),
        React.createElement('div', { className: 'trello-row' },
          React.createElement('div', { className: 'trello-input' },
            React.createElement(TextInput, { value: trUrl, onChange: setTrUrl, placeholder: 'https://trello.com/c/…', mono: true })),
          React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'download', loading: trLoad, onClick: importTrello }, 'Importar')
        ),
        trRes && trRes.ots && trRes.ots.length > 0 ? React.createElement('div', { className: 'trello-picker' },
          React.createElement('p', { className: 'trello-picker-label' },
            trRes.ots.length > 1
              ? 'La tarjeta contiene ' + trRes.ots.length + ' muestras. Elegí cuál usar:'
              : 'OT cargada desde Trello:'
          ),
          React.createElement('div', { className: 'trello-options' },
            trRes.ots.map(function (o) {
              var sel = nro === o.nro_ot;
              return React.createElement('button', { key: o.nro_ot, className: 'trello-opt' + (sel ? ' active' : ''), onClick: function () { pickTrelloOt(o); } },
                React.createElement('span', { className: 'mono trello-opt-ot' }, o.nro_ot),
                React.createElement('span', { className: 'trello-opt-muestra' }, 'M' + o.muestra),
                sel ? React.createElement(Icon, { name: 'check', size: 15, strokeWidth: 2.4 }) : null
              );
            })
          )
        ) : null
      ),

      React.createElement('div', { className: 'form-grid cols-2' },
        React.createElement(Field, { label: 'Nuevo N° de OT', required: true, hint: nro && err ? err : '' },
          React.createElement(TextInput, { value: nro, onChange: setNro, mono: true, placeholder: '534450', autoFocus: true, invalid: !!(nro && err) })),
        React.createElement(Field, { label: 'N° de solicitud' },
          React.createElement(TextInput, { value: sol, onChange: setSol, mono: true, placeholder: 'SOL-2026-0000' })),
        React.createElement(Field, { label: 'Identificación de muestra', span: 2 },
          React.createElement(TextInput, { value: idm, onChange: setIdm, placeholder: 'COLADA N°… / pieza / material…' }))
      ),
      React.createElement('div', { className: 'dup-opts' },
        React.createElement('label', { className: 'dup-opt' },
          React.createElement('input', { type: 'checkbox', checked: ens, onChange: function () { setEns(!ens); } }),
          React.createElement('span', { className: 'pre-toggle-box' }, ens ? React.createElement(Icon, { name: 'check', size: 13, strokeWidth: 3 }) : null),
          React.createElement('span', null, 'Copiar los ', React.createElement('strong', null, nEnsayos + ' ensayo(s)'), ' con su configuración')),
        React.createElement('label', { className: 'dup-opt' },
          React.createElement('input', { type: 'checkbox', checked: fot, onChange: function () { setFot(!fot); } }),
          React.createElement('span', { className: 'pre-toggle-box' }, fot ? React.createElement(Icon, { name: 'check', size: 13, strokeWidth: 3 }) : null),
          React.createElement('span', null, 'Copiar también las fotos de recepción'))
      )
    ),
    React.createElement('div', { className: 'modal-actions' },
      React.createElement(Button, { variant: 'ghost', onClick: props.onCancel }, 'Cancelar'),
      React.createElement(Button, { variant: 'primary', icon: 'copy', disabled: !!err, onClick: function () {
        var override = { nro_ot: nro.trim(), nro_solicitud: sol.trim() };
        if (idm.trim()) override.id_muestra = idm.trim();
        if (trUrl.trim()) override.trello_url = trUrl.trim();
        props.onConfirm(override, { ensayos: ens, fotos: fot });
      } }, 'Crear duplicado')
    )
  );
}

/* ---- Timeline / historial de la OT ---- */
function buildTimeline(ot) {
  var ev = [];
  if (ot.creado_en) ev.push({ texto: 'Orden de trabajo creada', icon: 'plus', fecha: ot.creado_en });
  ot.ensayos.forEach(function (e) {
    ev.push({ texto: 'Ensayo de ' + window.LabStore.labels[e.tipo] + ' cargado', icon: window.ENSAYO_ICON[e.tipo], fecha: e.creado_en });
  });
  if (ot.fecha_aprobacion) ev.push({ texto: 'OT aprobada', icon: 'check', fecha: ot.fecha_aprobacion + 'T12:00:00' });
  window.LabStore.getEventos(ot.nro_ot).forEach(function (x) { ev.push(x); });
  if (ot.fecha_finalizacion) ev.push({ texto: 'Orden finalizada', icon: 'checkCircle', fecha: ot.fecha_finalizacion + 'T18:00:00' });
  return ev.sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
}

function tlFmt(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d)) return fmtDate((iso || '').slice(0, 10));
  var hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return fmtDate(iso.slice(0, 10)) + ' · ' + hh + ':' + mm;
}

function Timeline(props) {
  if (!props.events.length) return React.createElement('p', { className: 'dim sm' }, 'Sin actividad registrada.');
  return React.createElement('div', { className: 'timeline' },
    props.events.map(function (e, i) {
      return React.createElement('div', { key: i, className: 'tl-item' },
        React.createElement('span', { className: 'tl-dot' }, React.createElement(Icon, { name: e.icon || 'check', size: 12, strokeWidth: 2 })),
        React.createElement('div', { className: 'tl-body' },
          React.createElement('span', { className: 'tl-text' }, e.texto),
          React.createElement('span', { className: 'tl-date' }, tlFmt(e.fecha))
        )
      );
    })
  );
}

function roField(label, value, mono) {
  return React.createElement('div', { className: 'ro-field', key: label },
    React.createElement('span', { className: 'ro-label' }, label),
    React.createElement('span', { className: 'ro-value' + (mono ? ' mono' : '') }, value || '—')
  );
}

/* ---- Modal "Editar solicitud" ---- */
// Permite editar campos administrativos que aplican a TODAS las OTs de la
// solicitud (fecha_aprobacion es el caso típico: la carga admin la completa
// después de que el bot importó las OTs vacías desde Trello).
function EditarSolicitudModal(props) {
  var toast = useToast();
  var ots = Array.isArray(props.ots) ? props.ots : [];
  // Prellenar con los valores comunes actuales (si todas coinciden) o vacío.
  function _valorComun(campo, otsList) {
    if (!otsList || otsList.length === 0) return '';
    var v = String(otsList[0][campo] || '');
    return otsList.every(function (o) { return String(o[campo] || '') === v; }) ? v : '';
  }
  var initialForm = {
    fecha_aprobacion: _valorComun('fecha_aprobacion', ots),
    fecha_recepcion:  _valorComun('fecha_recepcion', ots),
    razon_social:     _valorComun('razon_social', ots),
    nro_cliente:      _valorComun('nro_cliente', ots),
    trello_url:       _valorComun('trello_url', ots),
  };
  var _form = React.useState(initialForm);
  var form = _form[0], setForm = _form[1];
  var _saving = React.useState(false); var saving = _saving[0], setSaving = _saving[1];

  function set(k, v) { setForm(function (f) { var n = Object.assign({}, f); n[k] = v; return n; }); }

  // Validación cronológica: fecha_aprobacion debe ser
  //   ≥ MAX(fecha_recepcion del form, fecha_recepcion de cada OT) y
  //   ≤ MIN(fecha_finalizacion de cada OT que la tenga).
  // Las fechas ISO YYYY-MM-DD se comparan como strings.
  var recepFormOEnBase = String(form.fecha_recepcion || '');
  var maxRecepcion = ots.reduce(function (acc, o) {
    var v = String(o.fecha_recepcion || '');
    return v > acc ? v : acc;
  }, recepFormOEnBase);
  var finalizaciones = ots.map(function (o) { return String(o.fecha_finalizacion || ''); }).filter(Boolean);
  var minFinalizacion = finalizaciones.length ? finalizaciones.reduce(function (m, v) { return v < m ? v : m; }) : '';
  var errFAp = '';
  if (form.fecha_aprobacion) {
    if (maxRecepcion && form.fecha_aprobacion < maxRecepcion) {
      errFAp = 'Debe ser ≥ fecha de recepción (' + maxRecepcion + ')';
    } else if (minFinalizacion && form.fecha_aprobacion > minFinalizacion) {
      errFAp = 'Debe ser ≤ fecha de finalización (' + minFinalizacion + ')';
    }
  }
  var errFRe = '';
  if (form.fecha_recepcion && form.fecha_aprobacion && form.fecha_recepcion > form.fecha_aprobacion) {
    errFRe = 'Debe ser ≤ fecha de aprobación (' + form.fecha_aprobacion + ')';
  }
  var puedeGuardar = !errFAp && !errFRe;

  function guardar() {
    if (!puedeGuardar) { toast('Corregí las fechas antes de guardar', 'warning'); return; }
    // Solo enviar los campos que el user completó (no pisar con vacío lo que
    // ya estaba). Si el user borró explícitamente, esa lógica quedaría para
    // otro flujo (por ahora priorizamos "completar datos faltantes").
    var patch = {};
    Object.keys(form).forEach(function (k) {
      if (String(form[k] || '').trim() !== '') patch[k] = form[k];
    });
    if (Object.keys(patch).length === 0) { toast('No hay cambios para guardar', 'warning'); return; }
    setSaving(true);
    window.LabStore.updateSolicitud(props.nro_solicitud, patch)
      .then(function (resumen) {
        setSaving(false);
        var msg = 'Solicitud actualizada · ' + resumen.actualizadas.length + ' OT(s)';
        if (resumen.errores.length) msg += ' · ' + resumen.errores.length + ' error(es)';
        props.onSaved(msg);
      })
      .catch(function (e) { setSaving(false); toast('Error: ' + e.message, 'danger'); });
  }
  // Usa el componente Modal del design system (mismo que ConfirmModal).
  return React.createElement(Modal, { onClose: props.onCancel },
    React.createElement('div', { style: { padding: '18px 22px 8px' } },
      React.createElement('h3', { style: { margin: '0 0 4px', fontSize: 16 } }, 'Editar solicitud ' + props.nro_solicitud),
      React.createElement('p', { className: 'muted', style: { fontSize: 12, marginBottom: 14 } },
        'Los cambios se aplican a las ' + ots.length + ' OTs de esta solicitud: ',
        React.createElement('span', { className: 'mono' }, ots.map(function (o) { return o.nro_ot; }).join(', '))
      ),
      React.createElement('div', { className: 'form-grid cols-2', style: { rowGap: 10 } },
        React.createElement(Field, { label: 'Fecha de aprobación', hint: errFAp },
          React.createElement(TextInput, { type: 'date', value: form.fecha_aprobacion,
            invalid: !!errFAp,
            onChange: function (v) { set('fecha_aprobacion', v); } })),
        React.createElement(Field, { label: 'Fecha de recepción', hint: errFRe },
          React.createElement(TextInput, { type: 'date', value: form.fecha_recepcion,
            invalid: !!errFRe,
            onChange: function (v) { set('fecha_recepcion', v); } }))
      ),
      React.createElement(Field, { label: 'Razón social' },
        React.createElement(TextInput, { value: form.razon_social, onChange: function (v) { set('razon_social', v); } })),
      React.createElement('div', { className: 'form-grid cols-2', style: { rowGap: 10 } },
        React.createElement(Field, { label: 'N° cliente' },
          React.createElement(TextInput, { value: form.nro_cliente, onChange: function (v) { set('nro_cliente', v); }, mono: true })),
        React.createElement(Field, { label: 'URL Trello' },
          React.createElement(TextInput, { value: form.trello_url, onChange: function (v) { set('trello_url', v); }, mono: true }))
      )
    ),
    React.createElement('div', { className: 'modal-actions' },
      React.createElement(Button, { variant: 'ghost', onClick: props.onCancel, disabled: saving }, 'Cancelar'),
      React.createElement(Button, { variant: 'primary', icon: 'save', onClick: guardar, loading: saving, disabled: !puedeGuardar },
        'Guardar en las ' + ots.length + ' OTs')
    )
  );
}

Object.assign(window, { OTDetail: OTDetail, runQA: runQA, DuplicateModal: DuplicateModal, EditarSolicitudModal: EditarSolicitudModal });
