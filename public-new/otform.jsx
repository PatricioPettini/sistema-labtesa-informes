/* LABTESA — Pantalla Nueva / Editar OT (con importación desde Trello) */

function OTForm(props) {
  var editing = !!props.nro_ot;
  var existing = editing ? window.LabStore.getOt(props.nro_ot) : null;
  var toast = useToast();

  var _form = React.useState(function () {
    return existing ? {
      nro_solicitud: existing.nro_solicitud || '', nro_ot: existing.nro_ot || '',
      nro_cliente: existing.nro_cliente || '', razon_social: existing.razon_social || '',
      id_muestra: existing.id_muestra || '', fecha_recepcion: existing.fecha_recepcion || '',
      fecha_aprobacion: existing.fecha_aprobacion || '', fecha_finalizacion: existing.fecha_finalizacion || '',
      trello_url: existing.trello_url || '',
    } : {
      nro_solicitud: '', nro_ot: '', nro_cliente: '', razon_social: '', id_muestra: '',
      fecha_recepcion: '', fecha_aprobacion: '', fecha_finalizacion: new Date().toISOString().slice(0, 10), trello_url: '',
    };
  });
  var form = _form[0], setForm = _form[1];
  var _touched = React.useState({}); var touched = _touched[0], setTouched = _touched[1];
  var _trelloUrl = React.useState(''); var trelloUrl = _trelloUrl[0], setTrelloUrl = _trelloUrl[1];
  var _trelloRes = React.useState(null); var trelloRes = _trelloRes[0], setTrelloRes = _trelloRes[1];
  var _trelloLoad = React.useState(false); var trelloLoad = _trelloLoad[0], setTrelloLoad = _trelloLoad[1];
  // Fecha de aprobación aplicada al batch (editable en el modal, se propaga a
  // TODAS las OTs que se creen). Se prellena con la de Trello si viene.
  var _trelloFAp = React.useState(''); var trelloFAp = _trelloFAp[0], setTrelloFAp = _trelloFAp[1];

  function set(k, v) {
    setForm(function (f) {
      var next = Object.assign({}, f); next[k] = v;
      if (k === 'nro_cliente') {
        var c = window.LabStore.getCliente(v);
        if (c) next.razon_social = c.razon_social;
      }
      return next;
    });
  }
  function blur(k) { setTouched(function (t) { var n = Object.assign({}, t); n[k] = true; return n; }); }

  var errors = {};
  if (!form.nro_ot.trim()) errors.nro_ot = 'Requerido';
  else if (!/^[0-9]{4,8}$/.test(form.nro_ot.trim())) errors.nro_ot = 'Debe ser numérico (4–8 dígitos)';
  else if (!editing && window.LabStore.getOt(form.nro_ot.trim())) errors.nro_ot = 'Ya existe una OT con ese número';
  if (!form.nro_solicitud.trim()) errors.nro_solicitud = 'Requerido';
  if (!form.razon_social.trim()) errors.razon_social = 'Requerido';
  // Fecha de aprobación obligatoria (marca de gerencia sobre cuándo empezar).
  if (!String(form.fecha_aprobacion || '').trim()) errors.fecha_aprobacion = 'Requerido';
  // Orden cronológico: recepción ≤ aprobación ≤ finalización.
  else if (form.fecha_recepcion && form.fecha_recepcion > form.fecha_aprobacion) {
    errors.fecha_aprobacion = 'Debe ser igual o posterior a la fecha de recepción';
  }
  if (form.fecha_aprobacion && form.fecha_finalizacion && form.fecha_aprobacion > form.fecha_finalizacion) {
    errors.fecha_finalizacion = 'Debe ser igual o posterior a la fecha de aprobación';
  }
  var valid = Object.keys(errors).length === 0;

  function importTrello() {
    if (!trelloUrl.trim()) return;
    setTrelloLoad(true);
    window.LabStore.parseTrello(trelloUrl.trim())
      .then(function (res) {
        setTrelloRes(res); setTrelloLoad(false);
        var update = {
          nro_solicitud: res.nro_solicitud, nro_cliente: res.nro_cliente,
          razon_social: res.cliente_nombre, trello_url: trelloUrl.trim(),
          // Vencimiento y columna vienen del due/idList de Trello.
          fecha_vencimiento: res.fecha_vencimiento || '',
          trello_columna: res.trello_columna || '',
        };
        // Fecha de recepción = fecha de creación de la tarjeta.
        // Fecha de aprobación = custom field "Fecha de aprobación".
        // Solo se sobreescriben si vienen del server (no pisar con vacío).
        if (res.fecha_recepcion)  update.fecha_recepcion  = res.fecha_recepcion;
        if (res.fecha_aprobacion) update.fecha_aprobacion = res.fecha_aprobacion;
        // Pre-llenar el input de fecha de aprobación del batch con lo de Trello.
        setTrelloFAp(res.fecha_aprobacion || '');
        if (res.ots && res.ots.length === 1) {
          update.nro_ot     = res.ots[0].nro_ot;
          update.id_muestra = res.ots[0].id_muestra || '';
        }
        setForm(function (f) { return Object.assign({}, f, update); });
        toast('Datos importados desde Trello', 'success');
      })
      .catch(function (e) {
        setTrelloLoad(false);
        // Mensaje enriquecido según en qué salto falló:
        //   browser-network → el browser no llegó al server (LAN/servicio caído).
        //   config          → server sin credenciales de Trello.
        //   trello-api      → Trello respondió pero con error (401/404/429/500).
        //   network         → el server sí respondió pero no pudo alcanzar Trello.
        var prefijos = {
          'browser-network': 'No llegué al servidor',
          'config':          'Configuración del servidor',
          'trello-api':      'Trello rechazó la consulta',
          'network':         'El servidor no pudo alcanzar Trello',
        };
        var titulo = prefijos[e.stage] || 'Error Trello';
        var detalle = e.hint || e.message;
        toast(titulo + ': ' + detalle, 'danger');
      });
  }
  function pickTrelloOt(o) {
    setForm(function (f) { return Object.assign({}, f, { nro_ot: o.nro_ot, id_muestra: o.id_muestra || '' }); });
  }
  // Crear TODAS las OTs de la tarjeta de una sola vez. Cada una comparte
  // nro_solicitud, cliente, fechas y trello_url; nro_ot e id_muestra vienen
  // del array. Después navega a la primera creada.
  function crearTodasLasOts() {
    if (!trelloRes || !Array.isArray(trelloRes.ots) || trelloRes.ots.length === 0) return;
    var base = {
      nro_solicitud: trelloRes.nro_solicitud,
      nro_cliente:   trelloRes.nro_cliente,
      razon_social:  trelloRes.cliente_nombre,
      trello_url:    trelloUrl.trim(),
      fecha_recepcion:  trelloRes.fecha_recepcion || '',
      // La fecha de aprobación viene del input obligatorio del form principal.
      fecha_aprobacion: form.fecha_aprobacion || trelloRes.fecha_aprobacion || '',
      fecha_vencimiento: trelloRes.fecha_vencimiento || '',
      trello_columna:    trelloRes.trello_columna || '',
      fecha_finalizacion: form.fecha_finalizacion || new Date().toISOString().slice(0, 10),
    };
    var creadas = [];
    var duplicadas = [];
    trelloRes.ots.forEach(function (o) {
      var nro = String(o.nro_ot || '').trim();
      if (!nro) return;
      if (window.LabStore.getOt(nro)) { duplicadas.push(nro); return; }
      window.LabStore.createOt(Object.assign({}, base, {
        nro_ot: nro,
        id_muestra: o.id_muestra || '',
      }));
      creadas.push(nro);
    });
    if (creadas.length === 0 && duplicadas.length > 0) {
      toast('Todas las OTs de la tarjeta ya existen (' + duplicadas.join(', ') + ')', 'warning');
      return;
    }
    var msg = creadas.length + ' OT' + (creadas.length === 1 ? '' : 's') + ' creada' + (creadas.length === 1 ? '' : 's');
    if (duplicadas.length) msg += ' (' + duplicadas.length + ' ya existían: ' + duplicadas.join(', ') + ')';
    toast(msg, 'success');
    if (creadas[0]) nav('#/ot/' + creadas[0]);
  }

  function save() {
    if (!valid) {
      setTouched({ nro_ot: true, nro_solicitud: true, razon_social: true,
        fecha_recepcion: true, fecha_aprobacion: true, fecha_finalizacion: true });
      return;
    }
    var data = Object.assign({}, form, { nro_ot: form.nro_ot.trim(), nro_solicitud: form.nro_solicitud.trim() });
    if (editing) { window.LabStore.updateOt(props.nro_ot, data); toast('OT actualizada', 'success'); }
    else { window.LabStore.createOt(data); toast('OT ' + data.nro_ot + ' creada', 'success'); }
    nav('#/ot/' + data.nro_ot);
  }

  React.useEffect(function () {
    function onKey(e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  });

  function err(k) { return touched[k] && errors[k]; }

  return React.createElement('div', { className: 'page page-narrow' },
    React.createElement(Breadcrumb, { items: [
      { label: 'OTs', onClick: function () { nav('#/'); } },
      { label: editing ? 'OT ' + props.nro_ot : 'Nueva OT' },
    ]}),
    React.createElement('header', { className: 'page-head' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, editing ? 'Editar orden de trabajo' : 'Nueva orden de trabajo'),
        React.createElement('p', { className: 'page-sub' }, editing ? 'OT ' + props.nro_ot : 'Cargá los datos de recepción de la muestra')
      )
    ),

    !editing ? React.createElement(Card, { className: 'trello-card' },
      React.createElement(CardHead, { icon: 'link', title: 'Importar desde Trello', sub: 'Pegá la URL de la tarjeta para autocompletar los datos' }),
      React.createElement('div', { className: 'trello-row' },
        React.createElement('div', { className: 'trello-input' },
          React.createElement(TextInput, { value: trelloUrl, onChange: setTrelloUrl, placeholder: 'https://trello.com/c/…', mono: true })),
        React.createElement(Button, { variant: 'soft', icon: 'download', loading: trelloLoad, onClick: importTrello }, 'Importar')
      ),
      trelloRes && trelloRes.ots && trelloRes.ots.length > 0 ? React.createElement('div', { className: 'trello-picker' },
        React.createElement('p', { className: 'trello-picker-label' },
          trelloRes.ots.length > 1
            ? 'La tarjeta contiene ' + trelloRes.ots.length + ' muestras. Elegí cuál cargar o creá todas de una:'
            : 'OT cargada desde Trello:'
        ),
        React.createElement('div', { className: 'trello-options' },
          trelloRes.ots.map(function (o) {
            var sel = form.nro_ot === o.nro_ot;
            var yaExiste = !!window.LabStore.getOt(o.nro_ot);
            // Primera línea de id_muestra como resumen (ej. "COLADA N°21294").
            var idLinea = String(o.id_muestra || '').split('\n')[0].trim();
            return React.createElement('button', {
              key: o.nro_ot,
              className: 'trello-opt' + (sel ? ' active' : '') + (yaExiste ? ' disabled' : ''),
              title: yaExiste ? 'Ya existe una OT con este número' : (o.id_muestra || ''),
              disabled: yaExiste,
              onClick: function () { if (!yaExiste) pickTrelloOt(o); }
            },
              React.createElement('span', { className: 'mono trello-opt-ot' }, o.nro_ot),
              React.createElement('span', { className: 'trello-opt-muestra' }, 'M' + o.muestra),
              // Descripción de la OT (id_muestra) — para verificar que están bien.
              idLinea
                ? React.createElement('span', {
                    style: { fontSize: 11, color: 'var(--text-2)', fontWeight: 500, flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginLeft: 8 } }, idLinea)
                : null,
              yaExiste ? React.createElement('span', { style: { fontSize: 10, color: '#8a5a00' } }, '· ya existe') : null,
              sel ? React.createElement(Icon, { name: 'check', size: 15, strokeWidth: 2.4 }) : null
            );
          })
        ),
        // Botón para crear TODAS las OTs de la tarjeta en batch.
        // Batch: input de fecha de aprobación (obligatoria) + validación
        // cronológica contra las fechas del batch (recepción viene de Trello,
        // finalización viene del form principal / hoy si aún no pickeó una).
        trelloRes.ots.length > 1
          ? (function () {
              var recep = String(form.fecha_recepcion || trelloRes.fecha_recepcion || '');
              var final = String(form.fecha_finalizacion || '');
              var fAp = String(form.fecha_aprobacion || '');
              var errAp = '';
              if (!fAp.trim()) errAp = 'Cargá la fecha de aprobación (obligatoria).';
              else if (recep && fAp < recep) errAp = 'Debe ser ≥ fecha de recepción (' + recep + ').';
              else if (final && fAp > final) errAp = 'Debe ser ≤ fecha de finalización (' + final + ').';
              var puedeBatch = !errAp;
              return React.createElement('div', { style: { marginTop: 12, padding: '10px 12px', background: '#f6f8fa', border: '1px solid var(--border, #d0d7de)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 8 } },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
                  React.createElement('span', { style: { fontWeight: 700, fontSize: 12, color: 'var(--text-2)' } }, 'Fecha de aprobación *:'),
                  React.createElement('div', { style: { minWidth: 160 } },
                    React.createElement(TextInput, {
                      type: 'date',
                      value: form.fecha_aprobacion,
                      onChange: function (v) { set('fecha_aprobacion', v); },
                      invalid: !!errAp && !!fAp.trim(),
                    })),
                  recep ? React.createElement('span', { style: { fontSize: 10, color: 'var(--text-3)' } }, 'Recepción: ' + recep) : null),
                errAp
                  ? React.createElement('span', { style: { fontSize: 11, color: '#b02a2a' } }, errAp)
                  : React.createElement('span', { style: { fontSize: 11, color: 'var(--text-3)' } }, 'Se aplica a las ' + trelloRes.ots.length + ' OTs. Podés cambiarla después por OT o para toda la solicitud.'),
                React.createElement('div', null,
                  React.createElement(Button, {
                    variant: 'primary', size: 'sm', icon: 'layers',
                    onClick: crearTodasLasOts,
                    disabled: !puedeBatch,
                  }, 'Crear las ' + trelloRes.ots.length + ' OTs de la tarjeta')));
            })()
          : null
      ) : null
    ) : null,

    // Form principal (datos administrativos) — solo se muestra si:
    //   - estamos editando una OT existente, o
    //   - el técnico ya pickeó una muestra del picker de Trello.
    // Esto minimiza la fricción: si aún no importó Trello ni eligió muestra,
    // no debe ver ni pensar en los campos administrativos.
    (editing || (trelloRes && form.nro_ot && form.nro_ot.trim())) ? React.createElement(Card, null,
      React.createElement('div', { className: 'form-grid cols-2' },
        React.createElement(Field, { label: 'N° de solicitud', required: true, hint: err('nro_solicitud') },
          React.createElement(TextInput, { value: form.nro_solicitud, onChange: function (v) { set('nro_solicitud', v); }, onKeyDown: function () {}, mono: true, placeholder: 'SOL-2026-0000', invalid: err('nro_solicitud') })),
        React.createElement(Field, { label: 'N° de OT', required: true, hint: err('nro_ot') },
          React.createElement('div', { onBlur: function () { blur('nro_ot'); } },
            React.createElement(TextInput, { value: form.nro_ot, onChange: function (v) { set('nro_ot', v); }, mono: true, placeholder: '534432', disabled: editing, invalid: err('nro_ot') })))
      ),
      React.createElement(Field, { label: 'Razón social', required: true, hint: err('razon_social') },
        React.createElement('div', { onBlur: function () { blur('razon_social'); } },
          React.createElement(TextInput, { value: form.razon_social, onChange: function (v) { set('razon_social', v); }, placeholder: 'Tenaris Siderca S.A.I.C.', invalid: err('razon_social') }))),
      React.createElement(Field, { label: 'Identificación de la muestra', hint: 'Una línea por dato (material, colada, dimensiones…)' },
        React.createElement(Textarea, { value: form.id_muestra, onChange: function (v) { set('id_muestra', v); }, rows: 4, placeholder: 'Caño sin costura API 5L X65\nColada N° 8841-C\nMuestra long. 1.200 mm' })),
      React.createElement('div', { className: 'form-grid cols-3' },
        React.createElement(Field, { label: 'Fecha de recepción', hint: err('fecha_recepcion') },
          React.createElement('div', { onBlur: function () { blur('fecha_recepcion'); } },
            React.createElement(TextInput, { type: 'date', value: form.fecha_recepcion, onChange: function (v) { set('fecha_recepcion', v); }, invalid: err('fecha_recepcion') }))),
        React.createElement(Field, { label: 'Fecha de aprobación', required: true, hint: err('fecha_aprobacion') },
          React.createElement('div', { onBlur: function () { blur('fecha_aprobacion'); } },
            React.createElement(TextInput, { type: 'date', value: form.fecha_aprobacion, onChange: function (v) { set('fecha_aprobacion', v); }, invalid: err('fecha_aprobacion') }))),
        React.createElement(Field, { label: 'Fecha de finalización', hint: err('fecha_finalizacion') },
          React.createElement('div', { onBlur: function () { blur('fecha_finalizacion'); } },
            React.createElement(TextInput, { type: 'date', value: form.fecha_finalizacion, onChange: function (v) { set('fecha_finalizacion', v); }, invalid: err('fecha_finalizacion') })))
      )
    ) : null,

    // Footer: solo mostrar botón "Crear OT" cuando el form principal está visible.
    (editing || (trelloRes && form.nro_ot && form.nro_ot.trim())) ? React.createElement('div', { className: 'form-footer' },
      React.createElement(Button, { variant: 'ghost', onClick: function () { editing ? nav('#/ot/' + props.nro_ot) : nav('#/'); } }, 'Cancelar'),
      React.createElement('div', { className: 'form-footer-r' },
        React.createElement('span', { className: 'kbd-hint' }, React.createElement('kbd', null, 'Ctrl'), '+', React.createElement('kbd', null, 'S')),
        React.createElement(Button, { variant: 'primary', icon: 'save', onClick: save, disabled: !valid }, editing ? 'Guardar cambios' : 'Crear OT')
      )
    ) : null
  );
}

Object.assign(window, { OTForm: OTForm });
