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
  if (parts[0] === 'vencimientos') return { name: 'vencimientos' };
  if (parts[0] === 'auditoria') return { name: 'auditoria', mes: query.mes || null };
  if (parts[0] === 'stats') return { name: 'stats' };
  if (parts[0] === 'tecnicos') return { name: 'tecnicos' };
  if (parts[0] === 'admin') return { name: 'admin' };
  if (parts[0] === 'ot') {
    if (parts[1] === 'nuevo') return { name: 'ot-new' };
    if (parts.length === 2) return { name: 'ot-detail', nro: dec(parts[1]) };
    if (parts[2] === 'editar') return { name: 'ot-edit', nro: dec(parts[1]) };
    if (parts[2] === 'ensayo') return { name: 'ensayo', nro: dec(parts[1]), tipo: parts[3], id: parts[4] ? parseInt(parts[4], 10) : null, print: query.print === '1' };
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

  // Navegación Enter → celda de abajo en cualquier <table>. Se activa para
  // inputs/textareas/selects dentro de una <td>. Enter → foca el mismo tipo
  // de campo en la fila siguiente (mismo cellIndex). Shift+Enter va hacia
  // arriba. En textarea, respetamos el multi-línea usando Ctrl+Enter para
  // saltar de celda (Enter puro inserta \n).
  React.useEffect(function () {
    function onKey(e) {
      if (e.key !== 'Enter') return;
      var el = e.target;
      if (!el) return;
      var tag = String(el.tagName || '').toUpperCase();
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
      // Ignorar inputs tipo submit/button/checkbox/radio.
      if (tag === 'INPUT' && /^(submit|button|checkbox|radio|file|reset)$/i.test(el.type)) return;
      // Textarea: solo saltar con Ctrl+Enter (Enter puro escribe \n).
      if (tag === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) return;
      // Buscar la <td> contenedora.
      var td = el.closest ? el.closest('td') : null;
      if (!td) return;
      var tr = td.parentElement;
      if (!tr) return;
      var table = tr.closest ? tr.closest('table') : null;
      if (!table) return;
      // Índice de la celda actual dentro de su tr.
      var cellIdx = -1;
      for (var i = 0; i < tr.cells.length; i++) { if (tr.cells[i] === td) { cellIdx = i; break; } }
      if (cellIdx < 0) return;
      // Todas las filas de la MISMA tbody que la actual (evita saltar al thead).
      var tbody = tr.parentElement;
      if (!tbody || tbody.tagName.toUpperCase() !== 'TBODY') return;
      var rows = tbody.rows;
      var trIdx = -1;
      for (var j = 0; j < rows.length; j++) { if (rows[j] === tr) { trIdx = j; break; } }
      if (trIdx < 0) return;
      var delta = e.shiftKey ? -1 : 1;
      var nextTr = rows[trIdx + delta];
      if (!nextTr) return;
      var nextTd = nextTr.cells[cellIdx];
      if (!nextTd) return;
      var focable = nextTd.querySelector('input, textarea, select');
      if (!focable) return;
      e.preventDefault();
      focable.focus();
      if (typeof focable.select === 'function' && (focable.tagName === 'INPUT' || focable.tagName === 'TEXTAREA')) {
        try { focable.select(); } catch (_) {}
      }
    }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }, []);

  // Modo PRINT: agregar/quitar clase al body. Este useEffect DEBE ir antes
  // de los early returns para respetar el orden de hooks entre renders.
  var esPrint = route && route.name === 'ensayo' && route.print;
  React.useEffect(function () {
    if (esPrint) document.body.classList.add('print-mode');
    else document.body.classList.remove('print-mode');
    return function () { document.body.classList.remove('print-mode'); };
  }, [esPrint]);

  if (ready === null) return React.createElement(AppLoader, null);
  if (ready !== true)  return React.createElement(AppError, { msg: ready });

  var active = route.name === 'clientes' ? 'clientes'
             : route.name === 'equipos' ? 'equipos'
             : route.name === 'normas' ? 'normas'
             : route.name === 'vencimientos' ? 'vencimientos'
             : route.name === 'auditoria' ? 'auditoria'
             : route.name === 'stats' ? 'stats'
             : route.name === 'tecnicos' ? 'tecnicos'
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
    case 'vencimientos': screen = typeof window.VencimientosScreen === 'function' ? React.createElement(window.VencimientosScreen, {}) : React.createElement(Dashboard, {}); break;
    case 'auditoria': screen = React.createElement(AuditLogScreen, { mesInicial: route.mes }); break;
    case 'stats': screen = React.createElement(StatsScreen, {}); break;
    case 'tecnicos': screen = typeof window.TecnicosScreen === 'function' ? React.createElement(window.TecnicosScreen, {}) : React.createElement('div', { style: { padding: 40 } }, 'Cargando…'); break;
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

  // Modo PRINT: cuando la URL trae `?print=1` en el hash de un ensayo, sacamos
  // el sidebar y el layout wrapper para que puppeteer capture solo el form
  // limpio. El useEffect que agrega/quita la clase al body ya se ejecutó arriba.
  if (esPrint) {
    return React.createElement('div', { className: 'app app-print' },
      React.createElement('main', { className: 'main main-print' },
        React.createElement('div', { className: 'main-inner main-inner-print' }, screen)
      )
    );
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
