/* ============================================================================
 * AdminScreen — sección de administración protegida por usuario + contraseña.
 *
 * Flujo:
 *   - Si no hay admin configurado → formulario de alta (crear usuario/contraseña).
 *   - Si hay admin → login (usuario/contraseña).
 *   - Ya autenticado → gestión de tokens de firma (crear, roles, dar de baja).
 *
 * La credencial de admin queda en memoria durante la sesión (se pierde al
 * recargar). Cada acción sobre tokens reenvía usuario/contraseña al backend,
 * que los verifica (hash SHA-256 + salt; nunca se guarda en claro).
 * ========================================================================== */
'use strict';

var _ra = React.createElement;

function AdminScreen() {
  var toast = useToast();
  var _phase = React.useState('loading'); var phase = _phase[0], setPhase = _phase[1]; // loading|setup|login|ready
  var _creds = React.useState(null);      var creds = _creds[0], setCreds = _creds[1]; // {usuario,password}

  React.useEffect(function () {
    fetch('/api/admin/status').then(function (r) { return r.json(); })
      .then(function (d) { setPhase(d && d.configurado ? 'login' : 'setup'); })
      .catch(function () { setPhase('login'); });
  }, []);

  function onAuth(usuario, password) {
    setCreds({ usuario: usuario, password: password });
    setPhase('ready');
  }

  var body;
  if (phase === 'loading') {
    body = _ra('p', { style: { color: 'var(--text-3)' } }, 'Cargando…');
  } else if (phase === 'setup') {
    body = _ra(AdminSetup, { onDone: onAuth });
  } else if (phase === 'login') {
    body = _ra(AdminLogin, { onDone: onAuth });
  } else {
    body = _ra(TokenManager, { creds: creds, onLogout: function () { setCreds(null); setPhase('login'); } });
  }

  return _ra('div', { className: 'page page-mid' },
    _ra('header', { className: 'page-head' },
      _ra('div', { className: 'detail-title' },
        _ra('span', { className: 'ensayo-head-ic' }, _ra(Icon, { name: 'lock', size: 22 })),
        _ra('div', null,
          _ra('h1', { className: 'page-title' }, 'Administración'),
          _ra('p', { className: 'page-sub' }, 'Gestión de tokens de firma (acceso restringido)')
        )
      )
    ),
    body
  );
}

/* Alta del primer admin */
function AdminSetup(props) {
  var toast = useToast();
  var _u = React.useState(''); var usuario = _u[0], setUsuario = _u[1];
  var _p = React.useState(''); var pass = _p[0], setPass = _p[1];
  var _p2 = React.useState(''); var pass2 = _p2[0], setPass2 = _p2[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err = React.useState(''); var err = _err[0], setErr = _err[1];

  function submit() {
    if (usuario.trim().length < 3) { setErr('El usuario debe tener al menos 3 caracteres.'); return; }
    if (pass.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (pass !== pass2) { setErr('Las contraseñas no coinciden.'); return; }
    setBusy(true); setErr('');
    fetch('/api/admin/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario.trim(), password: pass }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        toast('Administrador creado.', 'success');
        props.onDone(usuario.trim(), pass);
      })
      .catch(function (e) { setErr(e.message || 'Error'); })
      .finally(function () { setBusy(false); });
  }

  return _ra(Card, { className: 'firma-card', style: { maxWidth: 460 } },
    _ra(CardHead, { icon: 'lock', title: 'Crear administrador', sub: 'No hay ningún admin configurado todavía' }),
    _ra('div', { style: { padding: 14, display: 'flex', flexDirection: 'column', gap: 10 } },
      campo('Usuario', _ra('input', { className: 'input', value: usuario, autoFocus: true, onChange: function (e) { setUsuario(e.target.value); } })),
      campo('Contraseña', _ra('input', { type: 'password', className: 'input', value: pass, onChange: function (e) { setPass(e.target.value); } })),
      campo('Repetir contraseña', _ra('input', { type: 'password', className: 'input', value: pass2, onChange: function (e) { setPass2(e.target.value); },
        onKeyDown: function (e) { if (e.key === 'Enter') submit(); } })),
      err ? _ra('div', { style: { color: '#b02a2a', fontSize: 12 } }, err) : null,
      _ra('div', null, _ra(Button, { variant: 'primary', onClick: submit, loading: busy }, 'Crear y entrar'))
    )
  );
}

/* Login de admin */
function AdminLogin(props) {
  var _u = React.useState(''); var usuario = _u[0], setUsuario = _u[1];
  var _p = React.useState(''); var pass = _p[0], setPass = _p[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err = React.useState(''); var err = _err[0], setErr = _err[1];

  function submit() {
    if (!usuario || !pass) { setErr('Ingresá usuario y contraseña.'); return; }
    setBusy(true); setErr('');
    fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario.trim(), password: pass }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        props.onDone(usuario.trim(), pass);
      })
      .catch(function (e) { setErr(e.message || 'Error'); })
      .finally(function () { setBusy(false); });
  }

  return _ra(Card, { className: 'firma-card', style: { maxWidth: 420 } },
    _ra(CardHead, { icon: 'lock', title: 'Ingresar', sub: 'Acceso de administrador' }),
    _ra('div', { style: { padding: 14, display: 'flex', flexDirection: 'column', gap: 10 } },
      campo('Usuario', _ra('input', { className: 'input', value: usuario, autoFocus: true, onChange: function (e) { setUsuario(e.target.value); } })),
      campo('Contraseña', _ra('input', { type: 'password', className: 'input', value: pass, onChange: function (e) { setPass(e.target.value); },
        onKeyDown: function (e) { if (e.key === 'Enter') submit(); } })),
      err ? _ra('div', { style: { color: '#b02a2a', fontSize: 12 } }, err) : null,
      _ra('div', null, _ra(Button, { variant: 'primary', onClick: submit, loading: busy }, 'Entrar'))
    )
  );
}

/* Gestión de tokens (ya autenticado) */
function TokenManager(props) {
  var toast = useToast();
  var creds = props.creds || {};
  var _tokens = React.useState(null); var tokens = _tokens[0], setTokens = _tokens[1];
  var _nombre = React.useState(''); var nombre = _nombre[0], setNombre = _nombre[1];
  var _tok = React.useState(''); var tok = _tok[0], setTok = _tok[1];
  var _tok2 = React.useState(''); var tok2 = _tok2[0], setTok2 = _tok2[1];
  var _rol = React.useState('ambos'); var rol = _rol[0], setRol = _rol[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err = React.useState(''); var err = _err[0], setErr = _err[1];
  var _confBaja = React.useState(null); var confBaja = _confBaja[0], setConfBaja = _confBaja[1]; // token a dar de baja

  function auth(extra) { return Object.assign({ admin_usuario: creds.usuario, admin_password: creds.password }, extra || {}); }

  function cargar() {
    fetch('/api/admin/tokens/listar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auth()) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) { if (!r.ok) throw new Error(r.d.error || 'Error'); setTokens(r.d.tokens || []); })
      .catch(function (e) { toast(e.message || 'Error al listar', 'danger'); });
  }
  React.useEffect(cargar, []);

  function crear() {
    if (tok.length < 4) { setErr('El token debe tener al menos 4 caracteres.'); return; }
    if (tok !== tok2) { setErr('El token y su confirmación no coinciden.'); return; }
    setBusy(true); setErr('');
    fetch('/api/admin/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auth({ nombre: nombre.trim() || 'principal', token: tok, rol: rol })) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        toast('Token creado.', 'success');
        setNombre(''); setTok(''); setTok2(''); setRol('ambos');
        cargar();
      })
      .catch(function (e) { setErr(e.message || 'Error'); })
      .finally(function () { setBusy(false); });
  }

  function baja(tok) { setConfBaja(tok); }
  function ejecutarBaja(id) {
    setConfBaja(null);
    fetch('/api/admin/tokens/' + id + '/baja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auth()) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) { if (!r.ok) throw new Error(r.d.error || 'Error'); toast('Token dado de baja.', 'success'); cargar(); })
      .catch(function (e) { toast(e.message || 'Error', 'danger'); });
  }

  var rolLabel = { ambos: 'Firmar + Evaluar', revisor: 'Solo Firmar', autorizante: 'Solo Evaluar' };

  return _ra('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
    _ra('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
      _ra('span', { className: 'chip chip-success' }, 'Admin: ' + (creds.usuario || '')),
      _ra(Button, { variant: 'ghost', size: 'sm', icon: 'unlock', onClick: props.onLogout }, 'Cerrar sesión')
    ),

    // Crear token
    _ra(Card, { className: 'firma-card', style: { maxWidth: 560 } },
      _ra(CardHead, { icon: 'lock', title: 'Nuevo token de firma', sub: 'El token se hashea (SHA-256 + salt); no se guarda en claro.' }),
      _ra('div', { style: { padding: 14, display: 'flex', flexDirection: 'column', gap: 10 } },
        campo('Nombre (dueño del token)', _ra('input', { className: 'input', value: nombre, placeholder: 'Ej: Ernesto Gallego', onChange: function (e) { setNombre(e.target.value); } })),
        campo('Rol', _ra('select', { className: 'input', value: rol, onChange: function (e) { setRol(e.target.value); } },
          _ra('option', { value: 'ambos' }, 'Firmar + Evaluar'),
          _ra('option', { value: 'revisor' }, 'Solo Firmar'),
          _ra('option', { value: 'autorizante' }, 'Solo Evaluar')
        )),
        campo('Token', _ra('input', { type: 'password', className: 'input', value: tok, onChange: function (e) { setTok(e.target.value); } })),
        campo('Repetir token', _ra('input', { type: 'password', className: 'input', value: tok2, onChange: function (e) { setTok2(e.target.value); } })),
        err ? _ra('div', { style: { color: '#b02a2a', fontSize: 12 } }, err) : null,
        _ra('div', null, _ra(Button, { variant: 'primary', onClick: crear, loading: busy }, 'Crear token'))
      )
    ),

    // Papelera de OTs
    _ra(PapeleraOts, { auth: auth }),

    // Modal de confirmación para dar de baja tokens
    confBaja ? _ra(window.ConfirmModal, {
      title: 'Dar de baja token',
      message: 'Se dará de baja el token de "' + (confBaja.nombre || '—') + '". Los ensayos ya firmados con él quedan como están, pero no se podrá volver a usar. ¿Confirmás?',
      tone: 'danger', confirmLabel: 'Dar de baja', confirmIcon: 'trash',
      onCancel:  function () { setConfBaja(null); },
      onConfirm: function () { ejecutarBaja(confBaja.id); },
    }) : null,

    // Lista de tokens
    _ra(Card, { className: 'firma-card', style: { maxWidth: 560 } },
      _ra(CardHead, { icon: 'lock', title: 'Tokens configurados' }),
      _ra('div', { style: { padding: 14 } },
        tokens === null ? _ra('p', { style: { color: 'var(--text-3)' } }, 'Cargando…')
        : tokens.length === 0 ? _ra('p', { style: { color: 'var(--text-3)' } }, 'No hay tokens configurados.')
        : _ra('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 13 } },
            _ra('thead', null, _ra('tr', { style: { textAlign: 'left', color: 'var(--text-3)', fontSize: 12 } },
              _ra('th', { style: { padding: '4px 6px' } }, 'Nombre'),
              _ra('th', { style: { padding: '4px 6px' } }, 'Rol'),
              _ra('th', { style: { padding: '4px 6px' } }, 'Estado'),
              _ra('th', { style: { padding: '4px 6px' } }, '')
            )),
            _ra('tbody', null, tokens.map(function (t) {
              return _ra('tr', { key: t.id, style: { borderTop: '1px solid var(--border)' } },
                _ra('td', { style: { padding: '6px' } }, t.nombre),
                _ra('td', { style: { padding: '6px' } }, rolLabel[t.rol] || t.rol),
                _ra('td', { style: { padding: '6px' } }, t.activo ? 'Activo' : 'Baja'),
                _ra('td', { style: { padding: '6px', textAlign: 'right' } },
                  t.activo ? _ra(Button, { variant: 'ghost', size: 'sm', onClick: function () { baja(t); } }, 'Dar de baja') : null)
              );
            }))
          )
      )
    )
  );
}

function campo(label, control) {
  return _ra('div', null,
    _ra('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, label),
    control
  );
}

/* Papelera de OTs — lista las OTs eliminadas y permite recuperarlas.
   `props.auth` es la función que devuelve { admin_usuario, admin_password }
   con las credenciales del admin logueado. */
function PapeleraOts(props) {
  var toast = useToast();
  var _list = React.useState(null); var list = _list[0], setList = _list[1];
  var _busy = React.useState(null); var busy = _busy[0], setBusy = _busy[1]; // nro_ot en curso
  var _conf = React.useState(null); var conf = _conf[0], setConf = _conf[1]; // {item} para confirmar

  function cargar() {
    fetch('/api/admin/ots-borradas/listar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props.auth({ limit: 100 })),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        setList(Array.isArray(r.d) ? r.d : []);
      })
      .catch(function (e) { toast('Error al listar papelera: ' + e.message, 'danger'); });
  }
  React.useEffect(cargar, []);

  function recuperar(item) {
    setConf(item);
  }
  function ejecutarRecuperar(item) {
    setConf(null);
    setBusy(item.nro_ot);
    fetch('/api/admin/ots-borradas/' + encodeURIComponent(item.nro_ot) + '/recuperar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props.auth()),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        toast('OT ' + item.nro_ot + ' recuperada (' + (r.d.ensayos_restaurados || 0) + ' ensayos).', 'success');
        // Recargar el store local para que la OT aparezca en el dashboard.
        // La función real se llama init(), no bootstrap().
        try {
          if (window.LabStore && typeof window.LabStore.init === 'function') {
            window.LabStore.init();
          }
        } catch (_) {}
        cargar();
      })
      .catch(function (e) { toast('No se pudo recuperar: ' + e.message, 'danger'); })
      .finally(function () { setBusy(null); });
  }

  function fmtFecha(iso) {
    if (!iso) return '—';
    var d = new Date(iso.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return iso;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  return _ra(React.Fragment, null,
   _ra(Card, { className: 'firma-card', style: { maxWidth: 900 } },
    _ra(CardHead, {
      icon: 'trash', title: 'Papelera de OTs',
      sub: 'OTs eliminadas — se pueden recuperar (datos + ensayos originales).',
    }),
    _ra('div', { style: { padding: 14 } },
      list === null ? _ra('p', { style: { color: 'var(--text-3)' } }, 'Cargando…')
      : list.length === 0 ? _ra('p', { style: { color: 'var(--text-3)' } }, 'No hay OTs en la papelera.')
      : _ra('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 13 } },
          _ra('thead', null, _ra('tr', { style: { textAlign: 'left', color: 'var(--text-3)', fontSize: 12 } },
            _ra('th', { style: { padding: '4px 6px' } }, 'OT'),
            _ra('th', { style: { padding: '4px 6px' } }, 'Cliente'),
            _ra('th', { style: { padding: '4px 6px' } }, 'ID muestra'),
            _ra('th', { style: { padding: '4px 6px', textAlign: 'center' } }, 'Ensayos'),
            _ra('th', { style: { padding: '4px 6px' } }, 'Borrada'),
            _ra('th', { style: { padding: '4px 6px' } }, '')
          )),
          _ra('tbody', null, list.map(function (r) {
            var enCurso = busy === r.nro_ot;
            return _ra('tr', { key: r.historial_id, style: { borderTop: '1px solid var(--border)' } },
              _ra('td', { style: { padding: '6px', fontWeight: 700 } }, r.nro_ot),
              _ra('td', { style: { padding: '6px' } }, r.razon_social || '—'),
              _ra('td', { style: { padding: '6px', color: 'var(--text-3)', fontSize: 12 } }, r.id_muestra || '—'),
              _ra('td', { style: { padding: '6px', textAlign: 'center' } }, r.ensayos_count),
              _ra('td', { style: { padding: '6px', fontSize: 12, color: 'var(--text-3)' } }, fmtFecha(r.fecha_borrado)),
              _ra('td', { style: { padding: '6px', textAlign: 'right' } },
                _ra(Button, {
                  variant: 'primary', size: 'sm', icon: 'add',
                  loading: enCurso, disabled: !!busy,
                  onClick: function () { recuperar(r); },
                }, 'Recuperar')
              )
            );
          }))
        )
    )
   ),
   conf ? _ra(window.ConfirmModal, {
     title: 'Recuperar OT ' + conf.nro_ot,
     message: 'Se restaurará la OT "' + (conf.razon_social || 's/cliente') + '" con sus ' + conf.ensayos_count + ' ensayo(s). ¿Confirmás?',
     tone: 'warning', confirmLabel: 'Recuperar', confirmIcon: 'add',
     onCancel:  function () { setConf(null); },
     onConfirm: function () { ejecutarRecuperar(conf); },
   }) : null
  );
}

window.AdminScreen = AdminScreen;
