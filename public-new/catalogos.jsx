/* LABTESA — Catálogos: Clientes, Equipos (calibración), Normas e ITM */

/* =================== modal de formulario genérico =================== */
function FormModal(props) {
  var _d = React.useState(props.initial || {}); var data = _d[0], setData = _d[1];
  function set(k, v) { setData(function (d) { var n = Object.assign({}, d); n[k] = v; return n; }); }
  var missing = (props.required || []).some(function (k) { return !String(data[k] || '').trim(); });
  return React.createElement(Modal, { onClose: props.onClose, wide: props.wide },
    React.createElement('div', { className: 'modal-head' },
      React.createElement('h3', null, props.title),
      React.createElement('button', { className: 'modal-x', onClick: props.onClose }, React.createElement(Icon, { name: 'x', size: 18 }))
    ),
    React.createElement('div', { className: 'modal-form' },
      React.createElement('div', { className: 'form-grid cols-2' },
        props.fields.map(function (fld) {
          // Campo tipo 'ensayos': grilla de checkboxes con todos los tipos de
          // ensayo del sistema. Guarda como array de strings.
          if (fld.type === 'ensayos') {
            var seleccionados = Array.isArray(data[fld.key]) ? data[fld.key] : [];
            var tipos = Object.keys(window.LabStore.labels).filter(function (t) {
              var sch = (window.ENSAYO_SCHEMAS || {})[t];
              return !(sch && sch.deprecated);
            });
            return React.createElement(Field, { key: fld.key, label: fld.label, span: 2 },
              React.createElement('div', {
                style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4, fontSize: 12 }
              },
                tipos.map(function (t) {
                  var marcado = seleccionados.indexOf(t) >= 0;
                  return React.createElement('label', {
                    key: t,
                    style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 5px' }
                  },
                    React.createElement('input', {
                      type: 'checkbox', checked: marcado,
                      onChange: function (e) {
                        var next = seleccionados.slice();
                        if (e.target.checked) { if (next.indexOf(t) < 0) next.push(t); }
                        else next = next.filter(function (x) { return x !== t; });
                        set(fld.key, next);
                      }
                    }),
                    window.LabStore.labels[t] || t
                  );
                })
              )
            );
          }
          return React.createElement(Field, { key: fld.key, label: fld.label, required: (props.required || []).indexOf(fld.key) >= 0, span: fld.full ? 2 : 1 },
            fld.type === 'select'
              ? React.createElement(Select, { value: data[fld.key], onChange: function (v) { set(fld.key, v); }, options: fld.options, placeholder: 'Seleccionar…', disabled: fld.disabled })
              : React.createElement(TextInput, { value: data[fld.key], onChange: function (v) { set(fld.key, v); }, placeholder: fld.placeholder, type: fld.type, mono: fld.mono, disabled: fld.disabled })
          );
        })
      )
    ),
    React.createElement('div', { className: 'modal-actions' },
      React.createElement(Button, { variant: 'ghost', onClick: props.onClose }, 'Cancelar'),
      React.createElement(Button, { variant: 'primary', icon: 'check', disabled: missing, onClick: function () { props.onSave(data); } }, props.saveLabel || 'Guardar')
    )
  );
}

/* tipos de ensayo como opciones de select */
function tipoOptions() {
  return Object.keys(window.LabStore.labels).map(function (t) { return { value: t, label: window.LabStore.labels[t] }; })
    .concat([{ value: 'general', label: 'General / transversal' }]);
}

/* =================== CLIENTES =================== */
function ClientesScreen() {
  var toast = useToast();
  var _q = React.useState(''); var q = _q[0], setQ = _q[1];
  var _qi = React.useState(''); var qi = _qi[0], setQi = _qi[1];
  var _sel = React.useState(null); var sel = _sel[0], setSel = _sel[1];
  var _v = React.useState(0); var setV = _v[1];
  var _add = React.useState(false); var add = _add[0], setAdd = _add[1];
  var _mostrarSinOts = React.useState(false); var mostrarSinOts = _mostrarSinOts[0], setMostrarSinOts = _mostrarSinOts[1];

  var todosClientes = window.LabStore.listClientes();
  var conOts = todosClientes.filter(function (c) { return (c.ot_count || 0) > 0; });
  var sinOts = todosClientes.filter(function (c) { return (c.ot_count || 0) === 0; });
  var baseListado = mostrarSinOts ? todosClientes : conOts;
  var clientes = baseListado.filter(function (c) {
    if (!q) return true;
    return (c.razon_social + ' ' + c.fantasia + ' ' + c.nro_cliente + ' ' + c.cuit).toLowerCase().indexOf(q.toLowerCase()) >= 0;
  });
  var current = sel ? window.LabStore.getCliente(sel) : null;
  var currentOts = sel ? window.LabStore.otsDeCliente(sel) : [];

  function borrarSinOts() {
    if (sinOts.length === 0) { toast('No hay clientes sin OTs', 'success'); return; }
    if (!confirm('Se eliminarán ' + sinOts.length + ' cliente(s) sin OTs asociadas. ¿Continuar?')) return;
    fetch('/api/clientes/sin-ots', { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        toast((d.borrados || 0) + ' cliente(s) eliminados', 'success');
        if (window.LabStore && window.LabStore.init) window.LabStore.init().then(function () { setV(function (x) { return x + 1; }); });
      })
      .catch(function (e) { toast('Error: ' + e.message, 'danger'); });
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('header', { className: 'page-head' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Clientes'),
        React.createElement('p', { className: 'page-sub' },
          conOts.length + ' con OTs · ' + sinOts.length + ' sin OTs')
      ),
      React.createElement('div', { className: 'page-head-actions', style: { gap: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' } },
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' } },
          React.createElement('input', { type: 'checkbox', checked: mostrarSinOts,
            onChange: function (e) { setMostrarSinOts(e.target.checked); } }),
          'Mostrar sin OTs'),
        sinOts.length > 0 ? React.createElement(Button, {
          variant: 'ghost', size: 'sm', icon: 'trash',
          style: { color: '#b02a2a' },
          onClick: borrarSinOts,
        }, 'Borrar ' + sinOts.length + ' sin OTs') : null,
        React.createElement('div', { style: { width: 280 } }, React.createElement(SearchInput, { value: qi, onChange: setQ, onChangeImmediate: setQi, placeholder: 'Buscar cliente, CUIT…' })),
        React.createElement(Button, { variant: 'primary', icon: 'plus', onClick: function () { setAdd(true); } }, 'Nuevo cliente')
      )
    ),
    React.createElement('div', { className: 'cliente-grid' },
      clientes.map(function (c) {
        return React.createElement('button', { key: c.nro_cliente, className: 'cliente-card', onClick: function () { setSel(c.nro_cliente); } },
          React.createElement('div', { className: 'cliente-card-top' },
            React.createElement('div', { className: 'cliente-avatar' }, (c.fantasia || c.razon_social).slice(0, 2).toUpperCase()),
            React.createElement('span', { className: 'cliente-nro mono' }, '#' + c.nro_cliente)
          ),
          React.createElement('h3', { className: 'cliente-name' }, c.razon_social),
          React.createElement('span', { className: 'cliente-fantasia' }, c.fantasia + ' · ' + (c.localidad || '—')),
          React.createElement('div', { className: 'cliente-stats' },
            React.createElement('span', null,
              React.createElement('strong', null, c.solicitud_count || 0),
              ' solicitud' + ((c.solicitud_count || 0) === 1 ? '' : 'es'),
              React.createElement('span', { className: 'dim', style: { marginLeft: 6 } },
                '· ' + (c.ot_count || 0) + ' OT' + ((c.ot_count || 0) === 1 ? '' : 's'))
            ),
            React.createElement('span', { className: 'dim' }, c.last_activity ? 'Últ. ' + fmtDate(c.last_activity) : 'Sin actividad')
          )
        );
      })
    ),
    current ? React.createElement(Modal, { onClose: function () { setSel(null); }, wide: true },
      React.createElement('div', { className: 'modal-head' },
        React.createElement('div', { className: 'cliente-detail-head' },
          React.createElement('div', { className: 'cliente-avatar lg' }, (current.fantasia || current.razon_social).slice(0, 2).toUpperCase()),
          React.createElement('div', null,
            React.createElement('h3', null, current.razon_social),
            React.createElement('span', { className: 'dim sm mono' }, 'Cliente #' + current.nro_cliente + ' · CUIT ' + current.cuit)
          )
        ),
        React.createElement('button', { className: 'modal-x', onClick: function () { setSel(null); } }, React.createElement(Icon, { name: 'x', size: 18 }))
      ),
      React.createElement('div', { className: 'modal-form' },
        React.createElement('div', { className: 'readonly-grid' },
          roField('Contacto', current.contacto),
          roField('Teléfono', current.telefono),
          roField('Email', current.email),
          roField('Localidad', current.localidad)
        ),
        React.createElement('div', { className: 'cliente-ots-head' },
          React.createElement('span', null, 'Órdenes de trabajo'),
          currentOts.length ? React.createElement('button', { className: 'link-btn', onClick: function () { setSel(null); nav('#/?cliente=' + current.nro_cliente); } },
            'Ver en el tablero', React.createElement(Icon, { name: 'externalLink', size: 13 })) : React.createElement('span', { className: 'dim sm' }, '0 total')
        ),
        currentOts.length
          ? (function () {
              // Agrupar OTs por N° solicitud.
              var grupos = {};
              currentOts.forEach(function (o) {
                var k = String(parseInt(o.nro_solicitud, 10) || o.nro_solicitud || '_sin_');
                if (!grupos[k]) grupos[k] = { nro_solicitud: o.nro_solicitud || '', ots: [] };
                grupos[k].ots.push(o);
              });
              var arr = Object.keys(grupos).map(function (k) { return grupos[k]; });
              arr.sort(function (a, b) {
                var na = parseInt(a.nro_solicitud, 10) || 0;
                var nb = parseInt(b.nro_solicitud, 10) || 0;
                return nb - na;
              });
              return React.createElement('div', { className: 'cliente-ots' },
                arr.map(function (g) {
                  return React.createElement('div', { key: 'sol-' + g.nro_solicitud, style: { marginBottom: 10 } },
                    React.createElement('div', {
                      style: {
                        fontSize: 12, fontWeight: 700, padding: '5px 8px',
                        background: '#eef1f4', borderRadius: 4, marginBottom: 4,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                      },
                      onClick: function () { setSel(null); nav('#/solicitud/' + encodeURIComponent(g.nro_solicitud)); },
                      title: 'Ver detalle de la solicitud'
                    },
                      React.createElement('span', null, '📁 SOL ' + (g.nro_solicitud || '—')),
                      React.createElement('span', { style: { fontSize: 10, fontWeight: 400, color: 'var(--text-3)' } },
                        g.ots.length + ' OT' + (g.ots.length === 1 ? '' : 's') + ' →')
                    ),
                    g.ots.map(function (o) {
                      var est = otEstado(o);
                      return React.createElement('button', {
                        key: o.nro_ot, className: 'cliente-ot-row',
                        style: { paddingLeft: 20 },
                        onClick: function () { setSel(null); nav('#/ot/' + o.nro_ot); }
                      },
                        React.createElement('span', { className: 'mono ot-num' }, o.nro_ot),
                        React.createElement('span', { className: 'cliente-ot-muestra' }, (o.id_muestra || '').split('\n')[0]),
                        React.createElement(StatusChip, { tone: est.tone, size: 'sm' }, est.label),
                        React.createElement(Icon, { name: 'chevronRight', size: 15, className: 'row-chev' })
                      );
                    })
                  );
                })
              );
            })()
          : React.createElement('p', { className: 'dim sm', style: { padding: '8px 0' } }, 'Este cliente todavía no tiene OTs.')
      )
    ) : null,
    add ? React.createElement(FormModal, {
      title: 'Nuevo cliente', required: ['nro_cliente', 'razon_social'],
      fields: [
        { key: 'nro_cliente', label: 'N° de cliente', mono: true, placeholder: '5000' },
        { key: 'fantasia', label: 'Nombre de fantasía', placeholder: 'Acme' },
        { key: 'razon_social', label: 'Razón social', full: true, placeholder: 'Acme S.A.' },
        { key: 'cuit', label: 'CUIT', mono: true, placeholder: '30-00000000-0' },
        { key: 'localidad', label: 'Localidad', placeholder: 'CABA' },
        { key: 'contacto', label: 'Contacto', placeholder: 'Ing. …' },
        { key: 'email', label: 'Email', placeholder: 'calidad@…' },
        { key: 'telefono', label: 'Teléfono', placeholder: '+54 …' },
      ],
      onClose: function () { setAdd(false); },
      onSave: function (d) { window.LabStore.createCliente(d); setAdd(false); setV(function (x) { return x + 1; }); toast('Cliente «' + d.razon_social + '» creado', 'success'); },
    }) : null
  );
}

/* =================== EQUIPOS =================== */
var URG_RANK = { 'vencido': 0, 'por-vencer': 1, 'vigente': 2 };
function urgencySort(a, b) {
  if (URG_RANK[a.estado] !== URG_RANK[b.estado]) return URG_RANK[a.estado] - URG_RANK[b.estado];
  return (a.dias == null ? 9999 : a.dias) - (b.dias == null ? 9999 : b.dias);
}
var CALIB_META = {
  'vigente': { tone: 'success', label: 'Vigente', icon: 'checkCircle' },
  'por-vencer': { tone: 'warning', label: 'Por vencer', icon: 'clock' },
  'vencido': { tone: 'danger', label: 'Vencido', icon: 'alertCircle' },
};
function EquiposScreen() {
  var toast = useToast();
  var _q = React.useState(''); var q = _q[0], setQ = _q[1];
  var _qi = React.useState(''); var qi = _qi[0], setQi = _qi[1];
  var _f = React.useState('todos'); var filtro = _f[0], setFiltro = _f[1];
  var _v = React.useState(0); var setV = _v[1];
  var _add  = React.useState(false); var add  = _add[0],  setAdd  = _add[1];
  var _edit = React.useState(null);  var edit = _edit[0], setEdit = _edit[1]; // equipo en edición
  var _confirm = React.useState(null); var confirm = _confirm[0], setConfirm = _confirm[1];

  var all = window.LabStore.listEquipos();
  var counts = {
    todos: all.length,
    vencido: all.filter(function (e) { return e.estado === 'vencido'; }).length,
    'por-vencer': all.filter(function (e) { return e.estado === 'por-vencer'; }).length,
  };
  var equipos = all.filter(function (e) {
    if (filtro === 'vencido' && e.estado !== 'vencido') return false;
    if (filtro === 'por-vencer' && e.estado !== 'por-vencer') return false;
    if (!q) return true;
    return (e.nombre + ' ' + e.id + ' ' + e.modelo + ' ' + e.certificado).toLowerCase().indexOf(q.toLowerCase()) >= 0;
  }).sort(urgencySort);
  var alertas = counts.vencido + counts['por-vencer'];
  var urgentes = all.filter(function (e) { return e.estado !== 'vigente'; }).sort(urgencySort);

  return React.createElement('div', { className: 'page' },
    React.createElement('header', { className: 'page-head' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Equipos y calibración'),
        React.createElement('p', { className: 'page-sub' }, all.length + ' equipos · ' + (alertas ? alertas + ' requieren atención' : 'todos al día'))
      ),
      React.createElement('div', { className: 'page-head-actions' },
        React.createElement(Button, { variant: 'primary', icon: 'plus', onClick: function () { setAdd(true); } }, 'Nuevo equipo')
      )
    ),
    counts.vencido ? React.createElement('div', { className: 'pending-banner danger-banner' },
      React.createElement(Icon, { name: 'alertCircle', size: 16 }),
      React.createElement('span', null, counts.vencido + ' equipo(s) con calibración vencida. No deberían usarse para emitir informes.')) : null,
    urgentes.length ? React.createElement('div', { className: 'urgencia-block' },
      React.createElement('div', { className: 'urgencia-head' },
        React.createElement(Icon, { name: 'clock', size: 15 }),
        React.createElement('span', null, 'Próximos vencimientos'),
        React.createElement('span', { className: 'dim sm' }, 'ordenados por urgencia')
      ),
      React.createElement('div', { className: 'urgencia-cards' },
        urgentes.slice(0, 4).map(function (e) {
          var venc = e.estado === 'vencido';
          return React.createElement('button', { key: e.id, className: 'urg-card ' + (venc ? 'urg-vencido' : 'urg-porvencer'), onClick: function () { setFiltro(venc ? 'vencido' : 'por-vencer'); } },
            React.createElement('div', { className: 'urg-count' },
              React.createElement('span', { className: 'urg-num' }, venc ? Math.abs(e.dias) : e.dias),
              React.createElement('span', { className: 'urg-unit' }, venc ? 'días vencido' : 'días restantes')
            ),
            React.createElement('span', { className: 'urg-name' }, e.id + ' · ' + e.nombre),
            React.createElement('span', { className: 'urg-cert mono' }, e.certificado + ' · vence ' + fmtDate(e.vencimiento))
          );
        })
      )
    ) : null,
    React.createElement('div', { className: 'toolbar' },
      React.createElement('div', { className: 'tabs' },
        [{ id: 'todos', label: 'Todos' }, { id: 'por-vencer', label: 'Por vencer' }, { id: 'vencido', label: 'Vencidos' }].map(function (t) {
          return React.createElement('button', { key: t.id, className: 'tab' + (filtro === t.id ? ' active' : ''), onClick: function () { setFiltro(t.id); } },
            t.label, React.createElement('span', { className: 'tab-count' }, counts[t.id]));
        })
      ),
      React.createElement('div', { className: 'toolbar-r' }, React.createElement(SearchInput, { value: qi, onChange: setQ, onChangeImmediate: setQi, placeholder: 'Buscar equipo, modelo, certificado…' }))
    ),
    React.createElement('div', { className: 'card table-card' },
      React.createElement('table', { className: 'ot-table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { style: { width: 90 } }, 'ID'),
            React.createElement('th', null, 'Equipo'),
            React.createElement('th', { style: { width: 90 } }, 'Sede'),
            React.createElement('th', { style: { minWidth: 180 } }, 'Aplicable a ensayos'),
            React.createElement('th', { style: { width: 120 } }, 'Vencimiento'),
            React.createElement('th', { style: { width: 130 } }, 'Calibración'),
            React.createElement('th', { style: { width: 44 } }, '')
          )
        ),
        React.createElement('tbody', null,
          equipos.map(function (e) {
            var m = CALIB_META[e.estado];
            return React.createElement('tr', { key: e.id, className: 'equipo-row' },
              React.createElement('td', null, React.createElement('span', { className: 'mono dim' }, e.id)),
              React.createElement('td', null,
                React.createElement('div', { className: 'cell-cliente' },
                  React.createElement('span', { className: 'cell-cliente-name' }, e.nombre),
                  React.createElement('span', { className: 'cell-cliente-muestra' }, e.modelo + (e.capacidad && e.capacidad !== '—' ? ' · ' + e.capacidad : '') + ' · ' + window.LabStore.labels[e.tipo])
                )
              ),
              React.createElement('td', null, React.createElement(StatusChip, { tone: 'neutral', size: 'sm', icon: 'building' }, e.sede || '—')),
              React.createElement('td', null,
                React.createElement('div', { style: { display: 'flex', gap: 3, flexWrap: 'wrap' } },
                  (Array.isArray(e.ensayos) ? e.ensayos : []).map(function (t) {
                    var lab = (window.LabStore.labels && window.LabStore.labels[t]) || t;
                    return React.createElement('span', {
                      key: t, title: t,
                      style: {
                        fontSize: 10, background: '#eef1f4', color: '#333',
                        padding: '2px 6px', borderRadius: 3, fontWeight: 500,
                      }
                    }, lab);
                  }),
                  (!Array.isArray(e.ensayos) || e.ensayos.length === 0)
                    ? React.createElement('span', { style: { fontSize: 10, color: '#999', fontStyle: 'italic' } }, 'sin asignar')
                    : null
                )),
              React.createElement('td', null, React.createElement('span', { className: 'sm' + (e.estado === 'vencido' ? ' danger-text' : '') }, fmtDate(e.vencimiento))),
              React.createElement('td', null,
                React.createElement('div', { className: 'calib-cell' },
                  React.createElement(StatusChip, { tone: m.tone, size: 'sm', icon: m.icon }, m.label),
                  e.estado !== 'vigente' ? React.createElement('span', { className: 'calib-count ' + (e.estado === 'vencido' ? 'cc-bad' : 'cc-warn') },
                    e.estado === 'vencido' ? 'hace ' + Math.abs(e.dias) + ' d' : 'en ' + e.dias + ' d') : null
                )),
              React.createElement('td', null,
                React.createElement('div', { className: 'row-actions' },
                  React.createElement('button', { className: 'icon-btn', title: 'Editar', onClick: function () { setEdit(e); } }, React.createElement(Icon, { name: 'pencil', size: 15 })),
                  React.createElement('button', { className: 'icon-btn danger', title: 'Eliminar', onClick: function () { setConfirm(e); } }, React.createElement(Icon, { name: 'trash', size: 15 }))
                ))
            );
          })
        )
      )
    ),
    add ? React.createElement(FormModal, {
      title: 'Nuevo equipo', required: ['id', 'nombre'], wide: true,
      fields: [
        { key: 'id', label: 'ID / TAG (ej. MM-405)', mono: true, placeholder: 'MM-400' },
        { key: 'nombre_corto', label: 'Nombre corto (ej. Buehler)', placeholder: 'Buehler Wilson' },
        { key: 'nombre', label: 'Nombre completo', full: true, placeholder: 'Microdurómetro Buehler Wilson VH 1150' },
        { key: 'modelo', label: 'Modelo', placeholder: 'XYZ-100' },
        { key: 'sede', label: 'Sede', type: 'select', options: ['caba', 'neuquen', 'ambas'] },
        { key: 'certificado', label: 'N° certificado', mono: true, placeholder: 'CAL-600' },
        { key: 'fecha_calibracion', label: 'Fecha calibración', type: 'date' },
        { key: 'vencimiento', label: 'Vencimiento', type: 'date' },
        { key: 'ensayos', label: 'Aplicable a ensayos', type: 'ensayos', full: true },
      ],
      onClose: function () { setAdd(false); },
      onSave: function (d) {
        var payload = Object.assign({}, d, { ensayos: Array.isArray(d.ensayos) ? d.ensayos : [] });
        window.LabStore.createEquipo(payload);
        setAdd(false); setV(function (x) { return x + 1; });
        toast('Equipo «' + d.id + '» agregado', 'success');
      },
    }) : null,
    edit ? React.createElement(FormModal, {
      title: 'Editar equipo ' + edit.id,
      required: ['nombre'], wide: true,
      initial: edit,
      fields: [
        { key: 'id', label: 'ID / TAG', mono: true, disabled: true },
        { key: 'nombre_corto', label: 'Nombre corto' },
        { key: 'nombre', label: 'Nombre completo', full: true },
        { key: 'modelo', label: 'Modelo' },
        { key: 'sede', label: 'Sede', type: 'select', options: ['caba', 'neuquen', 'ambas'] },
        { key: 'certificado', label: 'N° certificado', mono: true },
        { key: 'fecha_calibracion', label: 'Fecha calibración', type: 'date' },
        { key: 'vencimiento', label: 'Vencimiento', type: 'date' },
        { key: 'ensayos', label: 'Aplicable a ensayos', type: 'ensayos', full: true },
      ],
      onClose: function () { setEdit(null); },
      onSave: function (d) {
        var payload = Object.assign({}, edit, d, {
          id: edit.id,
          ensayos: Array.isArray(d.ensayos) ? d.ensayos : (edit.ensayos || []),
        });
        window.LabStore.createEquipo(payload);
        setEdit(null); setV(function (x) { return x + 1; });
        toast('Equipo «' + edit.id + '» actualizado', 'success');
      },
    }) : null,
    confirm ? React.createElement(ConfirmModal, {
      title: 'Eliminar equipo', message: 'Se eliminará «' + confirm.nombre + '» (' + confirm.id + ') del padrón de equipos.',
      onCancel: function () { setConfirm(null); },
      onConfirm: function () { window.LabStore.deleteEquipo(confirm.id); setConfirm(null); setV(function (x) { return x + 1; }); toast('Equipo eliminado', 'danger'); },
    }) : null
  );
}

/* =================== NORMAS E ITM =================== */
function NormasScreen() {
  var toast = useToast();
  var _q = React.useState(''); var q = _q[0], setQ = _q[1];
  var _qi = React.useState(''); var qi = _qi[0], setQi = _qi[1];
  var _v = React.useState(0); var setV = _v[1];
  var _add = React.useState(null); var add = _add[0], setAdd = _add[1]; // 'norma' | 'itm'
  var _confirm = React.useState(null); var confirm = _confirm[0], setConfirm = _confirm[1];

  var all = window.LabStore.listNormas().filter(function (n) {
    if (!q) return true;
    return (n.codigo + ' ' + n.titulo + ' ' + window.LabStore.labels[n.tipo]).toLowerCase().indexOf(q.toLowerCase()) >= 0;
  });
  var groups = [
    { clase: 'norma', titulo: 'Normas de referencia', sub: 'Estándares externos (ASTM, API, IRAM)', icon: 'fileText' },
    { clase: 'itm', titulo: 'Instrucciones técnicas internas (ITM)', sub: 'Metodologías propias del laboratorio', icon: 'clipboard' },
  ];

  return React.createElement('div', { className: 'page' },
    React.createElement('header', { className: 'page-head' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Normas e ITM'),
        React.createElement('p', { className: 'page-sub' }, 'Catálogo de normas y metodologías asociadas a cada ensayo')
      ),
      React.createElement('div', { className: 'page-head-actions' },
        React.createElement('div', { style: { width: 260 } }, React.createElement(SearchInput, { value: qi, onChange: setQ, onChangeImmediate: setQi, placeholder: 'Buscar norma, ITM…' }))
      )
    ),
    groups.map(function (g) {
      var rows = all.filter(function (n) { return n.clase === g.clase; });
      return React.createElement(Card, { key: g.clase, className: 'norma-card' },
        React.createElement(CardHead, { icon: g.icon, title: g.titulo, sub: g.sub,
          action: React.createElement(Button, { variant: 'soft', size: 'sm', icon: 'plus', onClick: function () { setAdd(g.clase); } }, g.clase === 'norma' ? 'Norma' : 'ITM') }),
        rows.length === 0 ? React.createElement('p', { className: 'dim sm', style: { padding: '4px 2px' } }, 'Sin resultados.')
          : React.createElement('table', { className: 'norma-table' },
              React.createElement('thead', null, React.createElement('tr', null,
                React.createElement('th', { style: { width: 160 } }, 'Código'),
                React.createElement('th', null, 'Título'),
                React.createElement('th', { style: { width: 150 } }, 'Ensayo'),
                React.createElement('th', { style: { width: 100 } }, 'Versión'),
                React.createElement('th', { style: { width: 100 } }, 'Estado'),
                React.createElement('th', { style: { width: 40 } }, '')
              )),
              React.createElement('tbody', null,
                rows.map(function (n) {
                  return React.createElement('tr', { key: n.codigo },
                    React.createElement('td', null, React.createElement('span', { className: 'mono norma-code' }, n.codigo)),
                    React.createElement('td', null, React.createElement('span', { className: 'norma-title' }, n.titulo)),
                    React.createElement('td', null, n.tipo === 'general' ? React.createElement('span', { className: 'dim sm' }, 'General')
                      : React.createElement(EnsayoChip, { tipo: n.tipo })),
                    React.createElement('td', null, React.createElement('span', { className: 'sm dim mono' }, n.version)),
                    React.createElement('td', null, React.createElement(StatusChip, { tone: n.vigente ? 'success' : 'neutral', size: 'sm' }, n.vigente ? 'Vigente' : 'En revisión')),
                    React.createElement('td', null, React.createElement('button', { className: 'icon-btn danger', title: 'Eliminar', onClick: function () { setConfirm(n); } }, React.createElement(Icon, { name: 'trash', size: 15 })))
                  );
                })
              )
            )
      );
    }),
    add ? React.createElement(FormModal, {
      title: add === 'norma' ? 'Nueva norma de referencia' : 'Nueva ITM', required: ['codigo', 'titulo'],
      initial: { vigente: 'Vigente' },
      fields: [
        { key: 'codigo', label: 'Código', mono: true, placeholder: add === 'norma' ? 'ASTM E…' : 'ITM N°0…' },
        { key: 'version', label: 'Versión / año', placeholder: add === 'norma' ? '2024' : 'Rev. 1' },
        { key: 'titulo', label: 'Título', full: true, placeholder: 'Descripción del método' },
        { key: 'tipo', label: 'Tipo de ensayo', type: 'select', options: tipoOptions() },
        { key: 'vigente', label: 'Estado', type: 'select', options: ['Vigente', 'En revisión'] },
      ],
      onClose: function () { setAdd(null); },
      onSave: function (d) {
        window.LabStore.createNorma({ codigo: d.codigo, titulo: d.titulo, tipo: d.tipo || 'general', version: d.version || '—', clase: add, vigente: d.vigente !== 'En revisión' });
        setAdd(null); setV(function (x) { return x + 1; }); toast('«' + d.codigo + '» agregado al catálogo', 'success');
      },
    }) : null,
    confirm ? React.createElement(ConfirmModal, {
      title: 'Eliminar del catálogo', message: 'Se eliminará «' + confirm.codigo + '» del catálogo de normas e ITM.',
      onCancel: function () { setConfirm(null); },
      onConfirm: function () { window.LabStore.deleteNorma(confirm.codigo); setConfirm(null); setV(function (x) { return x + 1; }); toast('Eliminado del catálogo', 'danger'); },
    }) : null
  );
}

Object.assign(window, { ClientesScreen: ClientesScreen, EquiposScreen: EquiposScreen, NormasScreen: NormasScreen });
