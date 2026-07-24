/* LABTESA — Banner de guardados pendientes.
 * Se muestra solo cuando hay informes que no pudieron guardarse en el drive del
 * cliente (drive de red desconectado, VPN caída, permisos, etc.). Un worker en
 * el server reintenta cada 60s. Este widget permite ver la lista y disparar
 * reintentos manuales.
 */
'use strict';

var _rP = React.createElement;

function PendientesBanner() {
  var _d = React.useState(null); var data = _d[0], setData = _d[1];
  var _err = React.useState(null); var err = _err[0], setErr = _err[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _expand = React.useState(false); var expand = _expand[0], setExpand = _expand[1];
  var _confDel = React.useState(null); var confDel = _confDel[0], setConfDel = _confDel[1]; // id a eliminar

  function cargar() {
    setBusy(true); setErr(null);
    fetch('/api/guardados-pendientes')
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { setErr(r.d.error || 'Error'); setData(null); }
        else setData(r.d);
      })
      .catch(function (e) { setErr(e.message); setData(null); })
      .finally(function () { setBusy(false); });
  }

  React.useEffect(function () {
    cargar();
    // Refresco automático cada 30s.
    var t = setInterval(cargar, 30 * 1000);
    return function () { clearInterval(t); };
  }, []);

  function reintentarTodos() {
    setBusy(true);
    fetch('/api/guardados-pendientes/reintentar-todos', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function () { cargar(); })
      .catch(function () {})
      .finally(function () { setBusy(false); });
  }

  function reintentarUno(id) {
    fetch('/api/guardados-pendientes/' + id + '/reintentar', { method: 'POST' })
      .then(function () { cargar(); });
  }

  function eliminarUno(id) { setConfDel(id); }
  function ejecutarEliminar(id) {
    setConfDel(null);
    fetch('/api/guardados-pendientes/' + id, { method: 'DELETE' })
      .then(function () { cargar(); });
  }

  if (!data || !data.items || data.items.length === 0) {
    return confDel ? _rP(window.ConfirmModal, {
      title: 'Eliminar pendiente',
      message: 'Se eliminará el pendiente. El .docx se perderá (queda solo el registro de emisión). ¿Confirmás?',
      tone: 'danger', confirmLabel: 'Eliminar', confirmIcon: 'trash',
      onCancel:  function () { setConfDel(null); },
      onConfirm: function () { ejecutarEliminar(confDel); },
    }) : null;
  }
  var items = data.items;

  return _rP('div', {
    style: {
      background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 8,
      padding: 12, marginBottom: 16, color: 'var(--text)',
    }
  },
    _rP('div', {
      style: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', marginBottom: expand ? 8 : 0 }
    },
      _rP('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        _rP('span', { style: { fontSize: 14, fontWeight: 700, color: 'var(--warning)' } },
          '⚠ ' + items.length + ' informe' + (items.length === 1 ? '' : 's') + ' pendiente' + (items.length === 1 ? '' : 's') + ' de guardar en drive'),
        _rP('span', { style: { fontSize: 11, color: 'var(--text-3)' } },
          'reintentando automáticamente cada 60s')
      ),
      _rP('div', { style: { display: 'flex', gap: 8 } },
        _rP('button', {
          onClick: reintentarTodos, disabled: busy,
          style: {
            fontSize: 11, padding: '4px 10px', border: '1px solid var(--warning)',
            background: 'var(--surface)', color: 'var(--warning)', borderRadius: 4,
            fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
          }
        }, busy ? '⟳ reintentando…' : '↻ Reintentar ahora'),
        _rP('button', {
          onClick: function () { setExpand(function (v) { return !v; }); },
          style: {
            fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text-2)', borderRadius: 4, cursor: 'pointer',
          }
        }, expand ? '▲ Ocultar' : '▼ Ver detalle')
      )
    ),
    expand ? _rP('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 } },
      items.map(function (p) {
        var lastAt = (p.ultimo_intento_en || '').replace('T', ' ').slice(0, 16);
        return _rP('div', {
          key: p.id,
          style: {
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12,
          }
        },
          _rP('div', { style: { flex: 1, minWidth: 0 } },
            _rP('div', { style: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              _rP('span', { className: 'mono' }, 'OT ' + p.nro_ot),
              _rP('span', { style: { color: 'var(--text-3)', marginLeft: 8 } }, p.filename)
            ),
            _rP('div', { style: { color: 'var(--text-3)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
              p.carpeta_destino
            ),
            p.ultimo_error ? _rP('div', {
              style: { color: 'var(--danger)', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
              title: p.ultimo_error,
            }, '⚠ ' + p.ultimo_error) : null
          ),
          _rP('div', { style: { fontSize: 10, color: 'var(--text-3)', textAlign: 'right' } },
            _rP('div', null, p.intentos + ' intento' + (p.intentos === 1 ? '' : 's')),
            lastAt ? _rP('div', null, lastAt) : null
          ),
          _rP('button', {
            onClick: function () { reintentarUno(p.id); },
            title: 'Reintentar ahora',
            style: {
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
              padding: '3px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
            }
          }, '↻'),
          _rP('button', {
            onClick: function () { eliminarUno(p.id); },
            title: 'Eliminar (descarta el .docx encolado)',
            style: {
              border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--danger)',
              padding: '3px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
            }
          }, '×')
        );
      })
    ) : null,
    confDel ? _rP(window.ConfirmModal, {
      title: 'Eliminar pendiente',
      message: 'Se eliminará el pendiente. El .docx se perderá (queda solo el registro de emisión). ¿Confirmás?',
      tone: 'danger', confirmLabel: 'Eliminar', confirmIcon: 'trash',
      onCancel:  function () { setConfDel(null); },
      onConfirm: function () { ejecutarEliminar(confDel); },
    }) : null
  );
}

window.PendientesBanner = PendientesBanner;
