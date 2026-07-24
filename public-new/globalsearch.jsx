/* LABTESA — búsqueda global (OTs, clientes, contenido de ensayos).
 * Se monta como overlay al presionar Ctrl+K o click en el input del sidebar.
 */

function GlobalSearch(props) {
  var _q = React.useState('');    var q = _q[0], setQ = _q[1];
  var _res = React.useState(null); var res = _res[0], setRes = _res[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var ref = React.useRef(null);

  React.useEffect(function () {
    var to;
    if (q.length < 2) { setRes(null); return; }
    setBusy(true);
    to = setTimeout(function () {
      fetch('/api/buscar?q=' + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (d) { setRes(d); })
        .catch(function () { setRes(null); })
        .finally(function () { setBusy(false); });
    }, 200);
    return function () { clearTimeout(to); };
  }, [q]);

  React.useEffect(function () {
    if (ref.current) ref.current.focus();
  }, []);

  function irA(url) { props.onClose(); setTimeout(function () { location.hash = url; }, 20); }

  function tipoIcono(tipo) {
    var m = { traccion: 'split', impacto: 'gauge', 'dureza-vickers': 'ruler' };
    return m[tipo] || 'flask';
  }

  var vacio = !res || (
    (!res.ots || res.ots.length === 0)
    && (!res.clientes || res.clientes.length === 0)
    && (!res.ensayos || res.ensayos.length === 0)
  );

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 9999,
             display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
             paddingTop: '10vh' },
    onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); }
  },
    React.createElement('div', {
      style: { background: '#fff', borderRadius: 10, width: 'min(90vw, 720px)',
               maxHeight: '75vh', display: 'flex', flexDirection: 'column',
               boxShadow: '0 12px 40px rgba(0,0,0,.35)', overflow: 'hidden' }
    },
      React.createElement('div', { style: { padding: 14, borderBottom: '1px solid var(--border)' } },
        React.createElement('input', {
          ref: ref, className: 'input', value: q,
          onChange: function (e) { setQ(e.target.value); },
          onKeyDown: function (e) { if (e.key === 'Escape') props.onClose(); },
          placeholder: 'Buscar OT, cliente, id de muestra, valor en un ensayo…',
          style: { fontSize: 16, padding: '10px 12px' }
        })
      ),
      React.createElement('div', { style: { flex: 1, overflow: 'auto', padding: 8 } },
        q.length < 2
          ? React.createElement('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-3)' } },
              'Escribí al menos 2 caracteres para buscar.')
          : busy
            ? React.createElement('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-3)' } }, 'Buscando…')
            : vacio
              ? React.createElement('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-3)' } }, 'Sin resultados.')
              : React.createElement(React.Fragment, null,
                  res.ots && res.ots.length > 0 ? React.createElement('div', null,
                    React.createElement('div', { style: seccStyle }, 'Órdenes de trabajo'),
                    res.ots.map(function (o) {
                      return React.createElement('div', {
                        key: 'ot-' + o.nro_ot, style: itemStyle,
                        onClick: function () { irA('#/ot/' + o.nro_ot); }
                      },
                        React.createElement(Icon, { name: 'inbox', size: 15 }),
                        React.createElement('div', { style: { flex: 1 } },
                          React.createElement('div', null,
                            React.createElement('strong', null, 'OT ' + o.nro_ot),
                            ' — ', o.razon_social,
                            o.estado_firma === 'firmado'
                              ? React.createElement('span', { style: { marginLeft: 6, color: '#0f7d3a', fontSize: 11 } }, '🔒')
                              : null
                          ),
                          React.createElement('div', { style: subStyle },
                            'Sol ' + o.nro_solicitud + ' · ' + (o.id_muestra || 'sin id_muestra'))
                        )
                      );
                    })
                  ) : null,
                  res.clientes && res.clientes.length > 0 ? React.createElement('div', null,
                    React.createElement('div', { style: seccStyle }, 'Clientes'),
                    res.clientes.map(function (c) {
                      return React.createElement('div', {
                        key: 'cli-' + c.nro_cliente, style: itemStyle,
                        onClick: function () { irA('#/?cliente=' + encodeURIComponent(c.nro_cliente)); }
                      },
                        React.createElement(Icon, { name: 'building', size: 15 }),
                        React.createElement('div', { style: { flex: 1 } },
                          React.createElement('div', null, React.createElement('strong', null, c.razon_social)),
                          React.createElement('div', { style: subStyle },
                            'N° ' + c.nro_cliente + (c.cuit ? ' · CUIT ' + c.cuit : '') + (c.localidad ? ' · ' + c.localidad : ''))
                        )
                      );
                    })
                  ) : null,
                  res.ensayos && res.ensayos.length > 0 ? React.createElement('div', null,
                    React.createElement('div', { style: seccStyle }, 'Coincidencias dentro de ensayos'),
                    res.ensayos.map(function (e) {
                      return React.createElement('div', {
                        key: 'ens-' + e.id, style: itemStyle,
                        onClick: function () { irA('#/ot/' + e.nro_ot); }
                      },
                        React.createElement(Icon, { name: tipoIcono(e.tipo), size: 15 }),
                        React.createElement('div', { style: { flex: 1 } },
                          React.createElement('div', null,
                            React.createElement('strong', null, (window.LabStore && window.LabStore.labels && window.LabStore.labels[e.tipo]) || e.tipo),
                            ' en OT ', e.nro_ot),
                          React.createElement('div', { style: subStyle }, (e.razon_social || '') + (e.nro_solicitud ? ' · Sol ' + e.nro_solicitud : ''))
                        )
                      );
                    })
                  ) : null
                )
      ),
      React.createElement('div', {
        style: { padding: 8, borderTop: '1px solid var(--border)', fontSize: 11,
                 color: 'var(--text-3)', textAlign: 'center' }
      }, 'Cerrar con Esc · Buscador global (Ctrl+K)')
    )
  );
}

var seccStyle = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  color: 'var(--text-3)', padding: '10px 12px 4px', letterSpacing: '.03em',
};
var itemStyle = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
  cursor: 'pointer', borderRadius: 6, transition: 'background .1s',
};
var subStyle = { fontSize: 12, color: 'var(--text-3)', marginTop: 2 };

// Hotkey global Ctrl+K / Cmd+K
function useGlobalSearchHotkey(onOpen) {
  React.useEffect(function () {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); onOpen();
      }
    }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }, [onOpen]);
}

window.GlobalSearch = GlobalSearch;
window.useGlobalSearchHotkey = useGlobalSearchHotkey;
