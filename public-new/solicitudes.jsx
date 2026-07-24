/* LABTESA — Vista de Solicitudes (agrupador principal del sistema).
 *
 * SolicitudesScreen  : listado de solicitudes agrupadas por nro_solicitud.
 * SolicitudDetail    : detalle de una solicitud con sus OTs.
 *
 * Estructura:
 *   El sistema tiene OTs (nro_ot). Cada OT tiene un nro_solicitud (agrupador
 *   por pedido del cliente). Una solicitud puede contener 1..N OTs.
 *
 * Rutas:
 *   #/              → SolicitudesScreen
 *   #/solicitud/N   → SolicitudDetail (nro = N normalizado sin ceros a izquierda)
 *   #/ot/N          → OTDetail (sin cambios)
 */
'use strict';

var _rS = React.createElement;

function normSol(s) {
  var n = parseInt(s, 10);
  return isNaN(n) ? String(s || '') : String(n);
}

function agruparPorSolicitud(ots) {
  var mapa = {};
  ots.forEach(function (o) {
    var k = normSol(o.nro_solicitud || '_sin_sol_' + o.nro_ot);
    if (!mapa[k]) {
      mapa[k] = {
        nro_solicitud: o.nro_solicitud || '',
        razon_social:  o.razon_social || '—',
        nro_cliente:   o.nro_cliente || '',
        ots: [],
        recepcion: null, aprobacion: null, finalizacion: null,
        fecha_vencimiento: null, trello_url: null, trello_columna: null,
      };
    }
    var g = mapa[k];
    g.ots.push(o);
    // Agregar fechas (usamos las de la primera OT que las tenga).
    if (!g.recepcion    && o.fecha_recepcion)    g.recepcion    = o.fecha_recepcion;
    if (!g.aprobacion   && o.fecha_aprobacion)   g.aprobacion   = o.fecha_aprobacion;
    if (!g.finalizacion && o.fecha_finalizacion) g.finalizacion = o.fecha_finalizacion;
    if (!g.fecha_vencimiento && o.fecha_vencimiento) g.fecha_vencimiento = o.fecha_vencimiento;
    if (!g.trello_url   && o.trello_url)   g.trello_url   = o.trello_url;
    if (!g.trello_columna && o.trello_columna) g.trello_columna = o.trello_columna;
  });
  var arr = Object.keys(mapa).map(function (k) {
    var g = mapa[k];
    var totales = g.ots.length;
    var finalizadas = g.ots.filter(function (o) { return o.fecha_finalizacion; }).length;
    var enEnsayo = g.ots.filter(function (o) { return o.fecha_aprobacion && !o.fecha_finalizacion; }).length;
    var estado, tone;
    if (totales > 0 && finalizadas === totales) { estado = 'Finalizada'; tone = 'success'; }
    else if (enEnsayo > 0) { estado = 'En ensayo'; tone = 'info'; }
    else { estado = 'En recepción'; tone = 'neutral'; }
    return Object.assign({}, g, { total: totales, finalizadas: finalizadas, estado: estado, tone: tone });
  });
  // Orden descendente por nro_solicitud (más nuevo arriba).
  arr.sort(function (a, b) {
    var na = parseInt(a.nro_solicitud, 10) || 0;
    var nb = parseInt(b.nro_solicitud, 10) || 0;
    return nb - na;
  });
  return arr;
}

// Mapea el nombre de la columna Trello a un color visual (bg suave + texto).
// Devuelve null si no matchea con las columnas conocidas — en ese caso el
// listado usa el estado interno calculado (En recepción / En ensayo / Fin.).
function colorPorColumnaTrello(col) {
  var c = (col || '').toString().toLowerCase();
  if (!c) return null;
  if (c.indexOf('mecaniz') >= 0) {
    return { label: 'Mecanizado', bg: '#fef3c7', fg: '#92400e', bar: '#f59e0b' };
  }
  if (c.indexOf('evaluaci') >= 0) {
    return { label: 'Evaluación técnica', bg: '#ede9fe', fg: '#6d28d9', bar: '#8b5cf6' };
  }
  if (c.indexOf('ensayo') >= 0) {
    return { label: 'En ensayos', bg: '#dbeafe', fg: '#1e40af', bar: '#3b82f6' };
  }
  return null;
}

function fmtVenc(iso) {
  if (!iso) return null;
  var p = iso.split('-'); if (p.length !== 3) return iso;
  var hoy = new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var hoyISO = hoy.getFullYear() + '-' + pad(hoy.getMonth() + 1) + '-' + pad(hoy.getDate());
  var toDate = function (s) {
    var m = s && String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  };
  var d1 = toDate(iso), d2 = toDate(hoyISO);
  var dias = (d1 && d2) ? Math.round((d1 - d2) / 86400000) : null;
  return { txt: p[2] + '/' + p[1] + '/' + p[0], dias: dias };
}

/* ============ SOLICITUDES SCREEN ============ */
function SolicitudesScreen(props) {
  var _q = React.useState(''); var q = _q[0], setQ = _q[1];
  var _qi = React.useState(''); var qi = _qi[0], setQi = _qi[1];
  var _f = React.useState('todas'); var filtro = _f[0], setFiltro = _f[1];
  var toast = useToast();
  // Modal AS400 manual — permite generar el Excel para una solicitud sin
  // depender del banner de Trello. Se abre desde el botón del header.
  var _as400 = React.useState(null); var as400Open = _as400[0], setAs400Open = _as400[1];

  // Flags manuales (Cargado / Enviado) por número de solicitud.
  // Se cargan una vez al montar y se actualizan al vuelo al togglear un check.
  var _flags = React.useState({}); var flags = _flags[0], setFlags = _flags[1];
  React.useEffect(function () {
    fetch('/api/solicitud-flags')
      .then(function (r) { return r.ok ? r.json() : { items: {} }; })
      .then(function (d) { setFlags(d.items || {}); })
      .catch(function () {});
  }, []);
  function toggleFlag(nroSol, campo, valor) {
    // Optimistic update.
    var next = Object.assign({}, flags);
    var prev = next[nroSol] || {};
    next[nroSol] = Object.assign({}, prev, {
      cargado: campo === 'cargado' ? (valor ? 1 : 0) : (prev.cargado || 0),
      enviado: campo === 'enviado' ? (valor ? 1 : 0) : (prev.enviado || 0),
    });
    setFlags(next);
    var body = {}; body[campo] = !!valor;
    fetch('/api/solicitud-flags/' + encodeURIComponent(nroSol), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function () {
      // Si falla, revertimos.
      setFlags(flags);
    });
  }

  var clienteFilter = props.clienteFilter;
  var clienteObj = clienteFilter ? window.LabStore.getCliente(clienteFilter) : null;

  var ots = window.LabStore.listOts().filter(function (o) {
    return !clienteFilter || o.nro_cliente === clienteFilter;
  });
  var solicitudes = agruparPorSolicitud(ots);

  var counts = {
    todas: solicitudes.length,
    recepcion: solicitudes.filter(function (s) { return s.estado === 'En recepción'; }).length,
    ensayo: solicitudes.filter(function (s) { return s.estado === 'En ensayo'; }).length,
    finalizada: solicitudes.filter(function (s) { return s.estado === 'Finalizada'; }).length,
  };

  var filtered = solicitudes.filter(function (s) {
    if (filtro === 'recepcion'  && s.estado !== 'En recepción') return false;
    if (filtro === 'ensayo'     && s.estado !== 'En ensayo') return false;
    if (filtro === 'finalizada' && s.estado !== 'Finalizada') return false;
    if (!q) return true;
    var qq = q.toLowerCase();
    var hay = (s.nro_solicitud + ' ' + s.razon_social + ' ' + s.nro_cliente).toLowerCase();
    if (hay.indexOf(qq) >= 0) return true;
    return s.ots.some(function (o) {
      return (o.nro_ot + ' ' + (o.id_muestra || '')).toLowerCase().indexOf(qq) >= 0;
    });
  });

  var tabs = [
    { id: 'todas', label: 'Todas' },
    { id: 'recepcion', label: 'En recepción' },
    { id: 'ensayo', label: 'En ensayo' },
    { id: 'finalizada', label: 'Finalizadas' },
  ];

  return _rS('div', { className: 'page page-wide' },
    _rS('header', { className: 'page-head' },
      _rS('div', null,
        _rS('h1', { className: 'page-title' }, 'Solicitudes'),
        clienteObj
          ? _rS('p', { className: 'page-sub filter-sub' }, 'Filtrado por cliente:',
              _rS('span', { className: 'filter-chip' },
                _rS('strong', null, clienteObj.razon_social),
                _rS('button', { className: 'filter-chip-x', onClick: function () { location.hash = '#/'; } }, _rS(Icon, { name: 'x', size: 12, strokeWidth: 2.5 }))))
          : _rS('p', { className: 'page-sub' }, counts.todas + ' solicitudes · ' + ots.length + ' OTs · laboratorio metalúrgico')
      ),
      _rS('div', { className: 'page-head-actions' },
        // Botón "AS400" para uso manual (independiente del banner de Trello).
        // Abre el mismo modal que se usa cuando se hace click en una card de
        // Cintolo del banner, pero sin pre-seleccionar un N° de solicitud.
        typeof window.AS400Modal === 'function'
          ? _rS(Button, {
              variant: 'soft', icon: 'file',
              onClick: function () { setAs400Open(true); },
            }, 'AS400 manual')
          : null,
        _rS(Button, { variant: 'primary', icon: 'plus', onClick: function () { location.hash = '#/ot/nuevo'; } }, 'Nueva OT / Solicitud')
      )
    ),
    // Modal AS400 manual. `nroSolicitud=''` deja el input vacío para que el
    // usuario tipee cualquier número o suba .xlsm directamente.
    (as400Open && typeof window.AS400Modal === 'function')
      ? _rS(window.AS400Modal, { nroSolicitud: '', onClose: function () { setAs400Open(false); } })
      : null,

    typeof window.PendientesBanner === 'function'
      ? _rS(window.PendientesBanner, null) : null,
    clienteFilter || typeof window.VencimientosBanner !== 'function'
      ? null
      : _rS(window.VencimientosBanner, null),

    _rS('div', { className: 'toolbar' },
      _rS('div', { className: 'tabs' },
        tabs.map(function (t) {
          return _rS('button', { key: t.id, className: 'tab' + (filtro === t.id ? ' active' : ''), onClick: function () { setFiltro(t.id); } },
            t.label, _rS('span', { className: 'tab-count' }, counts[t.id]));
        })
      ),
      _rS('div', { className: 'toolbar-r' },
        _rS(SearchInput, { value: qi, onChange: setQ, onChangeImmediate: setQi, placeholder: 'Buscar solicitud, cliente, OT, id muestra…' })
      )
    ),

    _rS('div', { className: 'card table-card' },
      _rS('table', { className: 'ot-table' },
        _rS('thead', null,
          _rS('tr', null,
            _rS('th', { style: { width: 120 } }, 'Solicitud'),
            _rS('th', null, 'Cliente'),
            _rS('th', { style: { width: 80 } }, 'OTs'),
            _rS('th', { style: { width: 130 } }, 'Estado'),
            _rS('th', { style: { width: 130 } }, 'Recepción'),
            _rS('th', { style: { width: 130 } }, 'Vencimiento'),
            _rS('th', { style: { width: 80, textAlign: 'center' } }, 'Cargado'),
            _rS('th', { style: { width: 80, textAlign: 'center' } }, 'Enviado')
          )
        ),
        _rS('tbody', null,
          filtered.map(function (s) {
            var v = fmtVenc(s.fecha_vencimiento);
            var vencColor = null;
            if (v && v.dias != null) {
              if (v.dias < 0) vencColor = '#b02a2a';
              else if (v.dias === 0) vencColor = '#c04a00';
              else if (v.dias === 1) vencColor = '#7a5a1a';
            }
            // Color por columna Trello (Ensayos / Mecanizado / Evaluación técnica).
            // Si no matchea o no hay columna, se muestra el estado interno con chip
            // por defecto.
            var trelloCol = colorPorColumnaTrello(s.trello_columna);
            var rowStyle = trelloCol
              ? { borderLeft: '4px solid ' + trelloCol.bar, background: trelloCol.bg + '40' }
              : null;
            return _rS('tr', {
              key: s.nro_solicitud || 'sin-sol', className: 'ot-row',
              style: rowStyle,
              onClick: function () { location.hash = '#/solicitud/' + encodeURIComponent(s.nro_solicitud || ''); }
            },
              _rS('td', null, _rS('span', { className: 'mono ot-num' }, 'Sol ' + (s.nro_solicitud || '—'))),
              _rS('td', null,
                _rS('div', { className: 'cell-cliente' },
                  _rS('span', { className: 'cell-cliente-name' }, s.razon_social),
                  s.nro_cliente ? _rS('span', { className: 'cell-cliente-muestra' }, 'Cliente ' + s.nro_cliente) : null
                )
              ),
              _rS('td', null,
                _rS('span', { style: { fontWeight: 700, fontSize: 13 } }, s.total),
                s.finalizadas > 0 && s.finalizadas < s.total
                  ? _rS('span', { style: { fontSize: 10, color: 'var(--text-3)', marginLeft: 6 } }, s.finalizadas + '/' + s.total + ' fin.')
                  : null
              ),
              _rS('td', null,
                trelloCol
                  ? _rS('span', {
                      style: {
                        display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                        fontSize: 11, fontWeight: 600, background: trelloCol.bg, color: trelloCol.fg,
                      }
                    }, trelloCol.label)
                  : _rS(StatusChip, { tone: s.tone, size: 'sm' }, s.estado)
              ),
              _rS('td', null, _rS('span', { className: 'sm' }, fmtDate(s.recepcion))),
              _rS('td', null,
                v ? _rS('span', {
                  style: {
                    fontSize: 11, fontWeight: vencColor ? 700 : 500,
                    color: vencColor || 'var(--text-3)',
                  }
                }, v.txt + (v.dias === 0 ? ' · HOY' : v.dias === 1 ? ' · mañ.' : v.dias < 0 ? ' · vencida' : '')) : '—'
              ),
              // Cargado / Enviado — checkboxes manuales. onClick stopPropagation
              // para que no dispare la navegación al detalle de la solicitud.
              (function () {
                var nroSol = s.nro_solicitud || '';
                var fl = flags[nroSol] || {};
                var cargado = !!fl.cargado;
                var enviado = !!fl.enviado;
                var tit = function (marcado, ts) {
                  if (!marcado) return 'Marcar como cargado';
                  return ts ? ('Cargado el ' + String(ts).replace('T', ' ').slice(0, 16)) : 'Cargado';
                };
                var titE = function () {
                  if (!enviado) return 'Marcar como enviado';
                  return fl.enviado_en ? ('Enviado el ' + String(fl.enviado_en).replace('T',' ').slice(0,16)) : 'Enviado';
                };
                return [
                  _rS('td', {
                    key: 'ch-c',
                    style: { textAlign: 'center' },
                    onClick: function (e) { e.stopPropagation(); }
                  },
                    _rS('input', {
                      type: 'checkbox', checked: cargado,
                      onChange: function (e) { toggleFlag(nroSol, 'cargado', e.target.checked); },
                      title: tit(cargado, fl.cargado_en),
                      style: { width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--success)' },
                      disabled: !nroSol,
                    })
                  ),
                  _rS('td', {
                    key: 'ch-e',
                    style: { textAlign: 'center' },
                    onClick: function (e) { e.stopPropagation(); }
                  },
                    _rS('input', {
                      type: 'checkbox', checked: enviado,
                      onChange: function (e) { toggleFlag(nroSol, 'enviado', e.target.checked); },
                      title: titE(),
                      style: { width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' },
                      disabled: !nroSol,
                    })
                  )
                ];
              })()
            );
          })
        )
      )
    )
  );
}

/* ============ SOLICITUD DETAIL ============ */
function SolicitudDetail(props) {
  var toast = useToast();
  var nroSol = normSol(props.nro);
  var ots = window.LabStore.listOts().filter(function (o) {
    return normSol(o.nro_solicitud) === nroSol;
  });
  if (ots.length === 0) {
    return _rS('div', { className: 'page' },
      _rS(EmptyState, {
        icon: 'search',
        title: 'Solicitud ' + nroSol + ' no encontrada',
        action: _rS(Button, { onClick: function () { location.hash = '#/'; } }, 'Volver a solicitudes'),
      })
    );
  }
  // Datos comunes de la solicitud (tomados de la primera OT).
  var razon = ots[0].razon_social || '—';
  var nroCliente = ots[0].nro_cliente || '';
  var recepcion = ots[0].fecha_recepcion || '';
  var trelloUrl = ots[0].trello_url || null;
  var venc = fmtVenc(ots[0].fecha_vencimiento);
  var trelloCol = ots[0].trello_columna || '';

  // Estado agregado.
  var total = ots.length;
  var finalizadas = ots.filter(function (o) { return o.fecha_finalizacion; }).length;
  var enEnsayo    = ots.filter(function (o) { return o.fecha_aprobacion && !o.fecha_finalizacion; }).length;
  var estadoGlobal, toneGlobal;
  if (finalizadas === total) { estadoGlobal = 'Finalizada'; toneGlobal = 'success'; }
  else if (enEnsayo > 0) { estadoGlobal = 'En ensayo'; toneGlobal = 'info'; }
  else { estadoGlobal = 'En recepción'; toneGlobal = 'neutral'; }

  return _rS('div', { className: 'page page-wide' },
    _rS(Breadcrumb, { items: [
      { label: 'Solicitudes', onClick: function () { location.hash = '#/'; } },
      { label: 'Sol ' + nroSol },
    ]}),
    _rS('header', { className: 'page-head' },
      _rS('div', { className: 'detail-title' },
        _rS('h1', { className: 'page-title' }, _rS('span', { className: 'mono' }, 'SOL ' + nroSol)),
        _rS(StatusChip, { tone: toneGlobal }, estadoGlobal)
      ),
      _rS('div', { className: 'page-head-actions' },
        trelloUrl
          ? _rS(Button, { variant: 'soft', size: 'sm', icon: 'externalLink',
              onClick: function () { window.open(trelloUrl, '_blank'); } }, 'Ver en Trello')
          : null,
        _rS(Button, { variant: 'primary', size: 'sm', icon: 'plus',
          onClick: function () { location.hash = '#/ot/nuevo?sol=' + encodeURIComponent(nroSol); } }, 'Agregar OT')
      )
    ),

    _rS('div', { className: 'card', style: { padding: 16, marginBottom: 16 } },
      _rS('div', { className: 'readonly-grid' },
        _rS('div', null,
          _rS('div', { style: { fontSize: 11, color: 'var(--text-3)', fontWeight: 600 } }, 'Cliente'),
          _rS('div', { style: { fontSize: 14, fontWeight: 500 } }, razon,
            nroCliente ? _rS('span', { style: { fontSize: 12, color: 'var(--text-3)', marginLeft: 6 } }, '(#' + nroCliente + ')') : null)),
        _rS('div', null,
          _rS('div', { style: { fontSize: 11, color: 'var(--text-3)', fontWeight: 600 } }, 'OTs de la solicitud'),
          _rS('div', { style: { fontSize: 14, fontWeight: 500 } }, total + (finalizadas === total ? ' (todas finalizadas)' : ' (' + finalizadas + ' finalizadas)'))),
        _rS('div', null,
          _rS('div', { style: { fontSize: 11, color: 'var(--text-3)', fontWeight: 600 } }, 'Recepción'),
          _rS('div', { style: { fontSize: 14 } }, fmtDate(recepcion))),
        venc
          ? _rS('div', null,
              _rS('div', { style: { fontSize: 11, color: 'var(--text-3)', fontWeight: 600 } }, 'Vencimiento (Trello)'),
              _rS('div', {
                style: {
                  fontSize: 14, fontWeight: 700,
                  color: venc.dias === 0 ? '#c04a00' : venc.dias === 1 ? '#7a5a1a' : venc.dias < 0 ? '#b02a2a' : 'inherit'
                }
              }, venc.txt + (venc.dias === 0 ? ' · HOY' : venc.dias === 1 ? ' · mañana' : venc.dias < 0 ? ' · VENCIDA (' + Math.abs(venc.dias) + 'd)' : '')))
          : null,
        trelloCol
          ? _rS('div', null,
              _rS('div', { style: { fontSize: 11, color: 'var(--text-3)', fontWeight: 600 } }, 'Columna Trello'),
              (function () {
                var ctc = colorPorColumnaTrello(trelloCol);
                return ctc
                  ? _rS('span', {
                      style: {
                        display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                        fontSize: 12, fontWeight: 600, background: ctc.bg, color: ctc.fg, marginTop: 2,
                      }
                    }, ctc.label)
                  : _rS('div', { style: { fontSize: 14 } }, trelloCol);
              })())
          : null
      )
    ),

    _rS('div', { className: 'card table-card' },
      _rS('div', {
        style: { padding: '10px 14px', borderBottom: '1px solid var(--border)',
                 fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }
      }, 'ÓRDENES DE TRABAJO DE ESTA SOLICITUD (' + total + ')'),
      _rS('table', { className: 'ot-table' },
        _rS('thead', null,
          _rS('tr', null,
            _rS('th', { style: { width: 110 } }, 'N° OT'),
            _rS('th', null, 'Muestra'),
            _rS('th', { style: { width: 130 } }, 'Estado'),
            _rS('th', null, 'Ensayos'),
            _rS('th', { style: { width: 90 } }, 'Informe'),
            _rS('th', { style: { minWidth: 320 } }, 'Ruta'),
            _rS('th', { style: { width: 40 } }, '')
          )
        ),
        _rS('tbody', null,
          ots.map(function (o) {
            var est = otEstado(o);
            var idm = (o.id_muestra || '').split('\n')[0];
            return _rS('tr', {
              key: o.nro_ot, className: 'ot-row',
              onClick: function () { location.hash = '#/ot/' + o.nro_ot; }
            },
              _rS('td', null, _rS('span', { className: 'mono ot-num' }, o.nro_ot)),
              _rS('td', null, _rS('span', { className: 'sm' }, idm || '—')),
              _rS('td', null,
                _rS('div', { className: 'cell-estado' },
                  _rS(StatusChip, { tone: est.tone, size: 'sm' }, est.label),
                  o.es_preinforme ? _rS(StatusChip, { tone: 'warning', size: 'sm' }, 'Pre') : null,
                  o.estado_firma === 'firmado' || o.estado_firma === 'autorizado' ? _rS(StatusChip, { tone: 'success', size: 'sm', icon: 'lock' }, 'Firmada') :
                  o.estado_firma === 'revisado' ? _rS(StatusChip, { tone: 'info', size: 'sm' }, 'Revisada') : null
                )
              ),
              _rS('td', null,
                o.tipos_ensayo.length
                  ? _rS('div', { className: 'cell-ensayos' },
                      o.tipos_ensayo.slice(0, 6).map(function (t, i) { return _rS(EnsayoChip, { key: i, tipo: t, label: window.LabStore.abbr[t] }); }),
                      o.tipos_ensayo.length > 6 ? _rS('span', { className: 'ensayo-more' }, '+' + (o.tipos_ensayo.length - 6)) : null
                    )
                  : _rS('span', { className: 'dim sm' }, 'Sin ensayos')
              ),
              _rS('td', null,
                o.informe_generado_en
                  ? _rS(StatusChip, { tone: 'success', size: 'sm', icon: 'checkCircle' }, 'Emitido')
                  : _rS('span', { className: 'dim sm' }, 'Pendiente')
              ),
              // Ruta absoluta del informe generado (si existe). Es texto completo,
              // wrap y monoespacio para que se lea la ruta entera.
              _rS('td', null,
                o.informe_path
                  ? _rS('span', {
                      className: 'mono dim',
                      style: { fontSize: 11, display: 'block', wordBreak: 'break-all', lineHeight: 1.3 },
                      title: o.informe_path,
                    }, o.informe_path)
                  : _rS('span', { className: 'dim sm' }, '—')
              ),
              // Botón "abrir carpeta" — sólo aparece si hay ruta guardada.
              _rS('td', { style: { textAlign: 'center' } },
                o.informe_path
                  ? _rS('button', {
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
                    }, _rS(Icon, { name: 'folder', size: 16 }))
                  : null
              )
            );
          })
        )
      )
    )
  );
}

window.SolicitudesScreen = SolicitudesScreen;
window.SolicitudDetail   = SolicitudDetail;
