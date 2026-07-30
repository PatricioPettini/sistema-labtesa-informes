/* LABTESA — utilidades compartidas + Pantalla Dashboard de OTs */

function fmtDate(iso) {
  if (!iso) return '—';
  var p = iso.split('-'); if (p.length !== 3) return iso;
  return p[2] + '/' + p[1] + '/' + p[0];
}
function otEstado(ot) {
  if (ot.fecha_finalizacion) return { label: 'Finalizada', tone: 'success' };
  if (ot.fecha_aprobacion) return { label: 'En ensayo', tone: 'info' };
  return { label: 'En recepción', tone: 'neutral' };
}
function nav(hash) { location.hash = hash; }

function Dashboard(props) {
  var _q = React.useState(''); var q = _q[0], setQ = _q[1];
  var _qi = React.useState(''); var qi = _qi[0], setQi = _qi[1];
  var _f = React.useState('todas'); var filtro = _f[0], setFiltro = _f[1];
  var _menu = React.useState(null); var menu = _menu[0], setMenu = _menu[1]; // {nro,x,y}
  var _del = React.useState(null); var del = _del[0], setDel = _del[1];
  var _dup = React.useState(null); var dup = _dup[0], setDup = _dup[1];
  var _agru = React.useState(true); var agrupar = _agru[0], setAgrupar = _agru[1];
  var _bump = React.useState(0); var setBump = _bump[1];
  var toast = useToast();
  var ready = useReady(260);
  var clienteFilter = props.clienteFilter;
  var clienteObj = clienteFilter ? window.LabStore.getCliente(clienteFilter) : null;
  var ots = window.LabStore.listOts().filter(function (o) { return !clienteFilter || o.nro_cliente === clienteFilter; });

  var counts = {
    todas: ots.length,
    recepcion: ots.filter(function (o) { return !o.fecha_aprobacion; }).length,
    ensayo: ots.filter(function (o) { return o.fecha_aprobacion && !o.fecha_finalizacion; }).length,
    finalizada: ots.filter(function (o) { return o.fecha_finalizacion; }).length,
  };
  var equiposAlerta = window.LabStore.listEquipos().filter(function (e) { return e.estado !== 'vigente'; }).length;

  var filtered = ots.filter(function (o) {
    if (filtro === 'recepcion' && o.fecha_aprobacion) return false;
    if (filtro === 'ensayo' && !(o.fecha_aprobacion && !o.fecha_finalizacion)) return false;
    if (filtro === 'finalizada' && !o.fecha_finalizacion) return false;
    if (!q) return true;
    var hay = (o.nro_ot + ' ' + o.nro_solicitud + ' ' + o.razon_social + ' ' + o.id_muestra).toLowerCase();
    return hay.indexOf(q.toLowerCase()) >= 0;
  });

  var tabs = [
    { id: 'todas', label: 'Todas' },
    { id: 'recepcion', label: 'En recepción' },
    { id: 'ensayo', label: 'En ensayo' },
    { id: 'finalizada', label: 'Finalizadas' },
  ];

  // Renderea una fila de OT. Extraído aparte para intercalar filas-header de
  // solicitud cuando `agrupar` está activo.
  function _renderOtRow(o) {
    var est = otEstado(o);
    return React.createElement('tr', { key: o.nro_ot, className: 'ot-row', onClick: function () { nav('#/ot/' + o.nro_ot); } },
      React.createElement('td', null, React.createElement('span', { className: 'mono ot-num' }, o.nro_ot)),
      React.createElement('td', null, React.createElement('span', { className: 'mono dim' }, o.nro_solicitud || '—')),
      React.createElement('td', null,
        React.createElement('div', { className: 'cell-cliente' },
          React.createElement('span', { className: 'cell-cliente-name' }, o.razon_social),
          React.createElement('span', { className: 'cell-cliente-muestra' }, (o.id_muestra || '').split('\n')[0])
        )
      ),
      React.createElement('td', null,
        React.createElement('div', { className: 'cell-estado' },
          React.createElement(StatusChip, { tone: est.tone, size: 'sm' }, est.label),
          o.es_preinforme ? React.createElement(StatusChip, { tone: 'warning', size: 'sm' }, 'Pre') : null,
          o.trello_oaa_label ? React.createElement('span', {
            title: 'Marcada como OAA en Trello (recordatorio — la acreditación real se resuelve por detección automática)',
            style: {
              fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
              color: '#5b21b6', background: '#ede9fe', border: '1px solid #c4b5fd',
              padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap',
            },
          }, 'OAA Trello') : null
        )
      ),
      React.createElement('td', null,
        o.tipos_ensayo.length
          ? React.createElement('div', { className: 'cell-ensayos' },
              o.tipos_ensayo.slice(0, 4).map(function (t, i) { return React.createElement(EnsayoChip, { key: i, tipo: t, label: window.LabStore.abbr[t] }); }),
              o.tipos_ensayo.length > 4 ? React.createElement('span', { className: 'ensayo-more' }, '+' + (o.tipos_ensayo.length - 4)) : null
            )
          : React.createElement('span', { className: 'dim sm' }, 'Sin ensayos')
      ),
      React.createElement('td', null, React.createElement('span', { className: 'dim sm' }, fmtDate(o.fecha_recepcion))),
      React.createElement('td', { style: { textAlign: 'center' } },
        o.informe_path
          ? React.createElement(StatusChip, { tone: 'success', size: 'sm' }, '✓ Generado')
          : React.createElement('span', { className: 'dim sm' }, '—')
      ),
      React.createElement('td', null,
        o.informe_path
          ? React.createElement('span', {
              className: 'mono dim',
              style: { fontSize: 11, display: 'block', wordBreak: 'break-all', lineHeight: 1.3 },
              title: o.informe_path,
            }, o.informe_path)
          : React.createElement('span', { className: 'dim sm' }, '—')
      ),
      React.createElement('td', { style: { textAlign: 'center' } },
        o.informe_path
          ? React.createElement('button', {
              className: 'row-menu-btn', title: 'Abrir carpeta',
              onClick: function (ev) {
                ev.stopPropagation();
                fetch('/api/drive/abrir', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ path: o.informe_path }),
                }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
                  .then(function (r) {
                    if (!r.ok) throw new Error(r.d.error || 'No se pudo abrir la carpeta');
                  })
                  .catch(function (e) {
                    if (typeof window.toast === 'function') window.toast('Error abrir carpeta: ' + e.message, 'danger');
                    else alert('Error abrir carpeta: ' + e.message);
                  });
              },
            }, React.createElement(Icon, { name: 'folder', size: 16 }))
          : null
      ),
      React.createElement('td', null,
        React.createElement('button', { className: 'row-menu-btn', title: 'Acciones',
          onClick: function (ev) { ev.stopPropagation(); var r = ev.currentTarget.getBoundingClientRect(); setMenu({ nro: o.nro_ot, x: r.right, y: r.bottom }); } },
          React.createElement(Icon, { name: 'more', size: 18 }))
      )
    );
  }

  return React.createElement('div', { className: 'page page-wide' },
    React.createElement('header', { className: 'page-head' },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Órdenes de Trabajo'),
        clienteObj
          ? React.createElement('p', { className: 'page-sub filter-sub' }, 'Filtrado por cliente:',
              React.createElement('span', { className: 'filter-chip' },
                React.createElement('strong', null, clienteObj.razon_social),
                React.createElement('button', { className: 'filter-chip-x', onClick: function () { nav('#/'); } }, React.createElement(Icon, { name: 'x', size: 12, strokeWidth: 2.5 }))))
          : React.createElement('p', { className: 'page-sub' }, counts.todas + ' órdenes · laboratorio metalúrgico')
      ),
      React.createElement('div', { className: 'page-head-actions' },
        React.createElement(Button, { variant: 'primary', icon: 'plus', onClick: function () { nav('#/ot/nuevo'); } }, 'Nueva OT')
      )
    ),
    clienteFilter || typeof window.VencimientosBanner !== 'function'
      ? null
      : React.createElement(window.VencimientosBanner, null),
    clienteFilter ? null : React.createElement('div', { className: 'stat-cards' },
      !ready
        ? [0, 1, 2, 3, 4].map(function (i) { return React.createElement('div', { key: i, className: 'stat-card skel-card' },
            React.createElement(Skeleton, { w: 30, h: 30, r: 8 }),
            React.createElement(Skeleton, { w: 44, h: 26, r: 6 }),
            React.createElement(Skeleton, { w: 80, h: 11 })); })
        : [
          statCard('Total de OTs', counts.todas, 'inbox', 'accent', filtro === 'todas', function () { setFiltro('todas'); }),
          statCard('En recepción', counts.recepcion, 'clock', 'neutral', filtro === 'recepcion', function () { setFiltro('recepcion'); }),
          statCard('En ensayo', counts.ensayo, 'flask', 'info', filtro === 'ensayo', function () { setFiltro('ensayo'); }),
          statCard('Finalizadas', counts.finalizada, 'checkCircle', 'success', filtro === 'finalizada', function () { setFiltro('finalizada'); }),
          statCard('Equipos a revisar', equiposAlerta, 'gauge', equiposAlerta ? 'danger' : 'success', false, function () { nav('#/equipos'); }, true)
        ]
    ),
    React.createElement('div', { className: 'toolbar' },
      React.createElement('div', { className: 'tabs' },
        tabs.map(function (t) {
          return React.createElement('button', { key: t.id, className: 'tab' + (filtro === t.id ? ' active' : ''), onClick: function () { setFiltro(t.id); } },
            t.label, React.createElement('span', { className: 'tab-count' }, counts[t.id]));
        })
      ),
      React.createElement('div', { className: 'toolbar-r', style: { display: 'flex', gap: 10, alignItems: 'center' } },
        React.createElement('label', {
          style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', color: agrupar ? 'var(--accent)' : 'var(--text-3)' },
          title: 'Agrupar filas por número de solicitud',
        },
          React.createElement('input', { type: 'checkbox', checked: agrupar, onChange: function (e) { setAgrupar(e.target.checked); } }),
          'Agrupar por solicitud'),
        React.createElement(SearchInput, { value: qi, onChange: setQ, onChangeImmediate: setQi, placeholder: 'Buscar OT, solicitud, cliente, muestra…' })
      )
    ),
    !ready
      ? React.createElement('div', { className: 'card table-card' }, React.createElement(SkeletonTable, null))
      : filtered.length === 0
      ? React.createElement(Card, null, React.createElement(EmptyState, {
          icon: q ? 'search' : 'inbox',
          title: q ? 'Sin resultados' : 'No hay OTs cargadas',
          message: q ? 'Probá con otro término de búsqueda.' : 'Creá una nueva orden con el botón de arriba.',
          action: q ? null : React.createElement(Button, { variant: 'primary', icon: 'plus', onClick: function () { nav('#/ot/nuevo'); } }, 'Nueva OT'),
        }))
      : React.createElement('div', { className: 'card table-card' },
          React.createElement('table', { className: 'ot-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', { style: { width: 110 } }, 'N° OT'),
                React.createElement('th', { style: { width: 140 } }, 'Solicitud'),
                React.createElement('th', null, 'Cliente'),
                React.createElement('th', { style: { width: 130 } }, 'Estado'),
                React.createElement('th', null, 'Ensayos'),
                React.createElement('th', { style: { width: 120 } }, 'Recepción'),
                React.createElement('th', { style: { width: 100, textAlign: 'center' } }, 'Informe'),
                React.createElement('th', { style: { minWidth: 460 } }, 'Ruta'),
                React.createElement('th', { style: { width: 70, textAlign: 'center' } }, 'Abrir'),
                React.createElement('th', { style: { width: 50 } }, '')
              )
            ),
            React.createElement('tbody', null,
              (function () {
                // Cuando agrupar=true, ordenamos por solicitud DESC y luego
                // por nro_ot DESC dentro de cada grupo. Insertamos una fila-header
                // por cada solicitud distinta.
                var rows = filtered.slice();
                if (agrupar) {
                  rows.sort(function (a, b) {
                    var sa = String(a.nro_solicitud || 'zzz');
                    var sb = String(b.nro_solicitud || 'zzz');
                    if (sa !== sb) return sb.localeCompare(sa);
                    return String(b.nro_ot || '').localeCompare(String(a.nro_ot || ''));
                  });
                }
                var out = [];
                var lastSol = null;
                rows.forEach(function (o) {
                  if (agrupar && (o.nro_solicitud || '—') !== lastSol) {
                    lastSol = o.nro_solicitud || '—';
                    var otsGrupo = rows.filter(function (x) { return (x.nro_solicitud || '—') === lastSol; });
                    var grupoOaaTrello = otsGrupo.some(function (x) { return x.trello_oaa_label; });
                    out.push(React.createElement('tr', {
                      key: 'grp-' + lastSol,
                      style: { background: 'var(--accent-soft)', borderTop: '2px solid var(--accent)' },
                    },
                      React.createElement('td', {
                        colSpan: 10,
                        style: { padding: '10px 16px', fontWeight: 700, fontSize: 12, color: 'var(--accent)', letterSpacing: '.02em' },
                      },
                        '📁 Solicitud N° ',
                        React.createElement('span', { className: 'mono' }, lastSol),
                        ' · ',
                        React.createElement('span', { style: { fontWeight: 400, color: 'var(--text-3)' } },
                          otsGrupo[0].razon_social,
                          ' · ',
                          otsGrupo.length,
                          otsGrupo.length === 1 ? ' OT' : ' OTs'),
                        grupoOaaTrello ? React.createElement('span', {
                          title: 'Al menos una OT de esta solicitud tiene la etiqueta "PARAMETROS ACREDITADOS" en Trello',
                          style: {
                            marginLeft: 10, fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
                            color: '#5b21b6', background: '#ede9fe', border: '1px solid #c4b5fd',
                            padding: '2px 7px', borderRadius: 999, verticalAlign: 'middle',
                          },
                        }, 'OAA Trello') : null)));
                  }
                  out.push(_renderOtRow(o));
                });
                return out;
              })()
            )
          )
        ),
    menu ? React.createElement(RowMenu, {
      menu: menu, onClose: function () { setMenu(null); },
      onView: function () { nav('#/ot/' + menu.nro); },
      onDup: function () { var o = window.LabStore.getOt(menu.nro); setMenu(null); setDup(o); },
      onDel: function () { var o = window.LabStore.getOt(menu.nro); setMenu(null); setDel(o); },
    }) : null,
    del ? React.createElement(ConfirmModal, {
      title: 'Eliminar OT ' + del.nro_ot, message: 'Se eliminará la orden y sus ' + del.ensayos.length + ' ensayo(s). Esta acción no se puede deshacer.',
      onCancel: function () { setDel(null); },
      onConfirm: function () { var n = del.nro_ot; window.LabStore.deleteOt(n); setDel(null); setBump(function (x) { return x + 1; }); toast('OT ' + n + ' eliminada', 'danger'); },
    }) : null,
    dup ? React.createElement(window.DuplicateModal, { ot: dup, onCancel: function () { setDup(null); },
      onConfirm: function (data, opts) { var nueva = window.LabStore.duplicateOt(dup.nro_ot, data, opts); setDup(null); toast('OT ' + nueva.nro_ot + ' creada', 'success'); nav('#/ot/' + nueva.nro_ot); } }) : null
  );
}

/* Dropdown de acciones rápidas, posicionado en coordenadas fijas */
function RowMenu(props) {
  React.useEffect(function () {
    function onDoc() { props.onClose(); }
    function onKey(e) { if (e.key === 'Escape') props.onClose(); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onDoc, true);
    return function () { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onDoc, true); };
  }, []);
  var items = [
    { label: 'Ver detalle', icon: 'externalLink', fn: props.onView },
    { label: 'Duplicar', icon: 'copy', fn: props.onDup },
    { label: 'Eliminar', icon: 'trash', fn: props.onDel, danger: true },
  ];
  return React.createElement('div', { className: 'row-menu', style: { right: Math.max(12, window.innerWidth - props.menu.x), top: props.menu.y + 4 }, onMouseDown: function (e) { e.stopPropagation(); } },
    items.map(function (it) {
      return React.createElement('button', { key: it.label, className: 'row-menu-item' + (it.danger ? ' danger' : ''), onClick: function () { it.fn(); } },
        React.createElement(Icon, { name: it.icon, size: 15 }), it.label);
    })
  );
}

function SkeletonTable(props) {
  var rows = props.rows || 6;
  return React.createElement('table', { className: 'ot-table' },
    React.createElement('tbody', null,
      Array.apply(null, { length: rows }).map(function (_, i) {
        return React.createElement('tr', { key: i, className: 'skel-row' },
          React.createElement('td', { style: { width: 110 } }, React.createElement(Skeleton, { w: 64 })),
          React.createElement('td', { style: { width: 140 } }, React.createElement(Skeleton, { w: 96 })),
          React.createElement('td', null, React.createElement(Skeleton, { w: '70%' }), React.createElement(Skeleton, { w: '40%', h: 10, className: 'skel-mt' })),
          React.createElement('td', { style: { width: 130 } }, React.createElement(Skeleton, { w: 78, h: 18, r: 20 })),
          React.createElement('td', null, React.createElement(Skeleton, { w: 120, h: 18, r: 6 })),
          React.createElement('td', { style: { width: 120 } }, React.createElement(Skeleton, { w: 70 })),
          React.createElement('td', { style: { width: 44 } }, React.createElement(Skeleton, { w: 18, h: 18, r: 5 }))
        );
      })
    )
  );
}

function statCard(label, value, icon, tone, active, onClick, isLink) {
  return React.createElement('button', { key: label, className: 'stat-card stat-' + tone + (active ? ' active' : '') + (isLink ? ' stat-link' : ''), onClick: onClick },
    React.createElement('div', { className: 'stat-card-top' },
      React.createElement('span', { className: 'stat-ic' }, React.createElement(Icon, { name: icon, size: 17 })),
      isLink ? React.createElement(Icon, { name: 'chevronRight', size: 15, className: 'stat-go' }) : null
    ),
    React.createElement('span', { className: 'stat-value' }, value),
    React.createElement('span', { className: 'stat-label' }, label)
  );
}

Object.assign(window, { Dashboard: Dashboard, fmtDate: fmtDate, otEstado: otEstado, nav: nav });
