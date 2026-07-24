/* LABTESA — router + shell de la aplicación */

function useHashRoute() {
  var _h = React.useState(function () { return location.hash || '#/'; });
  var hash = _h[0], setHash = _h[1];
  React.useEffect(function () {
    function onHash() { setHash(location.hash || '#/'); window.scrollTo(0, 0); }
    window.addEventListener('hashchange', onHash);
    return function () { window.removeEventListener('hashchange', onHash); };
  }, []);
  return hash;
}

function parseRoute(hash) {
  var h = hash.replace(/^#/, '');
  var query = {};
  var qIdx = h.indexOf('?');
  if (qIdx >= 0) {
    h.slice(qIdx + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) query[p[0]] = dec(p[1] || ''); });
    h = h.slice(0, qIdx);
  }
  var parts = h.split('/').filter(Boolean); // e.g. ['ot','534432','ensayo','traccion']
  if (parts.length === 0) return { name: 'solicitudes', cliente: query.cliente || null };
  if (parts[0] === 'solicitudes') return { name: 'solicitudes', cliente: query.cliente || null };
  if (parts[0] === 'solicitud') return { name: 'solicitud-detail', nro: dec(parts[1]) };
  if (parts[0] === 'ots' || parts[0] === 'dashboard') return { name: 'dashboard', cliente: query.cliente || null };
  if (parts[0] === 'clientes') return { name: 'clientes' };
  if (parts[0] === 'equipos') return { name: 'equipos' };
  if (parts[0] === 'normas') return { name: 'normas' };
  if (parts[0] === 'auditoria') return { name: 'auditoria' };
  if (parts[0] === 'stats') return { name: 'stats' };
  if (parts[0] === 'admin') return { name: 'admin' };
  if (parts[0] === 'ot') {
    if (parts[1] === 'nuevo') return { name: 'ot-new' };
    if (parts.length === 2) return { name: 'ot-detail', nro: dec(parts[1]) };
    if (parts[2] === 'editar') return { name: 'ot-edit', nro: dec(parts[1]) };
    if (parts[2] === 'ensayo') return { name: 'ensayo', nro: dec(parts[1]), tipo: parts[3], id: parts[4] ? parseInt(parts[4], 10) : null };
  }
  return { name: 'dashboard' };
}
function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

function AppLoader() {
  return React.createElement('div', { style: { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:14, color:'var(--text-3)' } },
    React.createElement('div', { className: 'btn-spin', style: { width:28, height:28, borderWidth:3 } }),
    React.createElement('span', { style: { fontSize:14, fontWeight:500 } }, 'Cargando datos del laboratorio…')
  );
}

function AppError(props) {
  return React.createElement('div', { style: { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:14 } },
    React.createElement('div', { className: 'chip chip-danger' }, 'Error al conectar con el servidor'),
    React.createElement('p', { style: { color:'var(--text-3)', fontSize:13 } }, props.msg || 'Verificá que el servidor esté corriendo en el puerto 3000.'),
    React.createElement('button', { className: 'btn btn-default btn-md', onClick: function () { location.reload(); } }, 'Reintentar')
  );
}

function App() {
  var _ready = React.useState(null); var ready = _ready[0], setReady = _ready[1]; // null=loading, true=ok, string=error
  var toast = useToast();
  var hash = useHashRoute();
  var route = parseRoute(hash);
  var _reset = React.useState(false); var resetOpen = _reset[0], setReset = _reset[1];
  var _search = React.useState(false); var searchOpen = _search[0], setSearchOpen = _search[1];
  if (typeof window.useGlobalSearchHotkey === 'function') {
    window.useGlobalSearchHotkey(function () { setSearchOpen(true); });
  }

  React.useEffect(function () {
    // Conectar el hook de errores de la API al toast
    window._labToastErr = function (msg) { toast(msg, 'danger'); };
    window._labToastOk  = function (msg) { toast(msg, 'success'); };
    window.LabStore.init()
      .then(function () { setReady(true); })
      .catch(function (e) { setReady(e.message || 'Error desconocido'); });
  }, []);

  if (ready === null) return React.createElement(AppLoader, null);
  if (ready !== true)  return React.createElement(AppError, { msg: ready });

  var active = route.name === 'clientes' ? 'clientes'
             : route.name === 'equipos' ? 'equipos'
             : route.name === 'normas' ? 'normas'
             : route.name === 'auditoria' ? 'auditoria'
             : route.name === 'stats' ? 'stats'
             : route.name === 'admin' ? 'admin'
             : route.name === 'dashboard' ? 'ots'
             : 'solicitudes';

  var screen;
  switch (route.name) {
    case 'solicitudes':
      screen = typeof window.SolicitudesScreen === 'function'
        ? React.createElement(window.SolicitudesScreen, { clienteFilter: route.cliente, key: 'sol-' + (route.cliente || 'all') })
        : React.createElement(Dashboard, { clienteFilter: route.cliente, key: 'dash-' + (route.cliente || 'all') });
      break;
    case 'solicitud-detail':
      screen = typeof window.SolicitudDetail === 'function'
        ? React.createElement(window.SolicitudDetail, { nro: route.nro, key: 'soldet-' + route.nro })
        : React.createElement(Dashboard, { key: 'dash-fb' });
      break;
    case 'dashboard': screen = React.createElement(Dashboard, { clienteFilter: route.cliente, key: 'dash-' + (route.cliente || 'all') }); break;
    case 'clientes': screen = React.createElement(ClientesScreen, {}); break;
    case 'equipos': screen = React.createElement(EquiposScreen, {}); break;
    case 'normas': screen = React.createElement(NormasScreen, {}); break;
    case 'auditoria': screen = React.createElement(AuditLogScreen, {}); break;
    case 'stats': screen = React.createElement(StatsScreen, {}); break;
    case 'admin': screen = typeof window.AdminScreen === 'function' ? React.createElement(window.AdminScreen, {}) : React.createElement(Dashboard, {}); break;
    case 'ot-new': screen = React.createElement(OTForm, { key: 'new' }); break;
    case 'ot-edit': screen = React.createElement(OTForm, { nro_ot: route.nro, key: 'edit-' + route.nro }); break;
    case 'ot-detail': screen = React.createElement(OTDetail, { nro_ot: route.nro, key: route.nro }); break;
    case 'ensayo': screen = React.createElement(EnsayoForm, { nro_ot: route.nro, tipo: route.tipo, ensayoId: route.id, key: route.tipo + (route.id || 'new') }); break;
    default:
      screen = typeof window.SolicitudesScreen === 'function'
        ? React.createElement(window.SolicitudesScreen, { clienteFilter: route.cliente, key: 'sol-def' })
        : React.createElement(Dashboard, { clienteFilter: route.cliente, key: 'dash-def' });
  }

  return React.createElement('div', { className: 'app' },
    React.createElement(Sidebar, { active: active, onReset: null, onSearchClick: function () { setSearchOpen(true); } }),
    React.createElement('main', { className: 'main' },
      React.createElement('div', { className: 'main-inner' }, screen)
    ),
    searchOpen && typeof window.GlobalSearch === 'function'
      ? React.createElement(window.GlobalSearch, { onClose: function () { setSearchOpen(false); } })
      : null
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ToastProvider, null, React.createElement(App, null))
);
