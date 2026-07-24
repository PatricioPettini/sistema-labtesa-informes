/* ============================================================================
 * FirmaEnsayoChip — chip de estado + acciones de firma para UN ensayo.
 *
 * Reemplaza al FirmaPanel global (que operaba sobre toda la OT). Cada ensayo
 * tiene su propio estado (abierto / revisado / autorizado) y puede ser firmado
 * con un token distinto (técnicos individuales).
 *
 * Estados:
 *   abierto     → gris, chip "Sin firmar", acciones: Revisar / Autorizar.
 *   revisado    → azul, "Revisado por X", acciones: Autorizar / Desfirmar.
 *   autorizado  → verde, "Autorizado por X", acciones: Desfirmar.
 *
 * Reutiliza el TokenModal expuesto en window (firmapanel.jsx).
 * ========================================================================== */
'use strict';

function FirmaEnsayoChip(props) {
  var toast = useToast();
  var ensayo = props.ensayo;
  var _cfg = React.useState(null); var cfgOpen = _cfg[0], setCfg = _cfg[1];
  // Bump local para forzar re-render inmediato tras firmar/aprobar/desfirmar
  // (aunque la referencia del objeto ensayo del store sea la misma).
  var _bump = React.useState(0); var setBump = _bump[1];
  function forzarRerender() { setBump(function (x) { return x + 1; }); }

  var estado = ensayo.estado_firma || 'abierto';
  var esRevisado   = estado === 'revisado';
  var esAutorizado = estado === 'autorizado' || estado === 'firmado';
  var firmado = esRevisado || esAutorizado;

  var color = esAutorizado ? '#0f7d3a'
            : esRevisado   ? '#3b52c4'
            : '#8a6a1a';
  // Formato "DD/MM/YY" — solo fecha, sin hora.
  function fmtFecha(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(-2);
  }
  var fechaAut = fmtFecha(ensayo.firmado_en);
  var fechaRev = fmtFecha(ensayo.revisado_en);
  var label = esAutorizado
      ? 'Aprobó' + (ensayo.firmado_por ? ' · ' + ensayo.firmado_por : '') + (fechaAut ? ' · ' + fechaAut : '')
    : esRevisado
      ? 'Firmó'  + (ensayo.revisado_por ? ' · ' + ensayo.revisado_por : '') + (fechaRev ? ' · ' + fechaRev : '')
    : 'Sin firmar';

  function firmarConNivel(nivel) {
    return function (token) {
      return fetch('/api/ensayo/' + ensayo.id + '/firmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, nivel: nivel }),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.d.hint || r.d.error || 'Error');
          // Mutación optimista del objeto ensayo del store (para que el chip
          // se re-renderice con el estado nuevo sin esperar refresh completo).
          var nombre = (r.d && r.d.nombre) || '';
          var ahora  = new Date().toISOString();
          if (nivel === 'revisar') {
            ensayo.estado_firma = 'revisado';
            ensayo.revisado_por = nombre;
            ensayo.revisado_en  = ahora;
          } else {
            ensayo.estado_firma = 'autorizado';
            ensayo.firmado_por  = nombre;
            ensayo.firmado_en   = ahora;
          }
          toast(nivel === 'revisar' ? 'Ensayo firmado.' : 'Ensayo aprobado.', 'success');
          setCfg(null);
          forzarRerender();
          if (props.onChange) props.onChange();
        });
    };
  }
  function desfirmar(token, motivo) {
    return fetch('/api/ensayo/' + ensayo.id + '/desfirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, motivo: motivo }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.hint || r.d.error || 'Error');
        // Mutación optimista: dejar el ensayo del store como 'abierto'.
        ensayo.estado_firma = 'abierto';
        ensayo.firmado_por  = null;
        ensayo.firmado_en   = null;
        ensayo.revisado_por = null;
        ensayo.revisado_en  = null;
        toast('Ensayo desfirmado. Motivo registrado en auditoría.', 'success');
        setCfg(null);
        forzarRerender();
        if (props.onChange) props.onChange();
      });
  }

  var Modal = window.TokenModal; // reutilizamos el modal de firmapanel.jsx

  return React.createElement(React.Fragment, null,
    React.createElement('span', {
      className: 'firma-chip',
      style: {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 10,
        background: color + '18', color: color,
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      },
      title: firmado ? 'Ensayo bloqueado por firma' : 'Ensayo editable',
    },
      React.createElement(Icon, { name: firmado ? 'lock' : 'unlock', size: 11 }),
      label
    ),
    // Acciones (política simplificada: solo firma del técnico):
    !firmado ? React.createElement('button', {
      className: 'icon-btn', title: 'Firmar (técnico realizador)',
      onClick: function () { setCfg('revisar'); },
    }, React.createElement(Icon, { name: 'checkCircle', size: 14 })) : null,
    firmado ? React.createElement('button', {
      className: 'icon-btn', title: 'Desfirmar',
      onClick: function () { setCfg('desfirmar'); },
    }, React.createElement(Icon, { name: 'unlock', size: 14 })) : null,

    cfgOpen === 'autorizar' && Modal
      ? React.createElement(Modal, {
          titulo: 'Aprobar ensayo ' + (ensayo.tipo || ''),
          submitLabel: 'Aprobar',
          onSubmit: firmarConNivel('autorizar'),
          onCancel: function () { setCfg(null); },
        }) : null,
    cfgOpen === 'revisar' && Modal
      ? React.createElement(Modal, {
          titulo: 'Firmar ensayo ' + (ensayo.tipo || ''),
          submitLabel: 'Firmar',
          onSubmit: firmarConNivel('revisar'),
          onCancel: function () { setCfg(null); },
        }) : null,
    cfgOpen === 'desfirmar' && Modal
      ? React.createElement(Modal, {
          titulo: 'Desfirmar ensayo ' + (ensayo.tipo || ''),
          submitLabel: 'Desfirmar',
          pedirMotivo: true,
          motivoOpcional: true,
          onSubmit: desfirmar,
          onCancel: function () { setCfg(null); },
        }) : null
  );
}

window.FirmaEnsayoChip = FirmaEnsayoChip;

/* ============================================================================
 * FirmaEnsayoPanel — versión Card para la página de edición del ensayo.
 *
 * Se muestra dentro de EnsayoForm, arriba del cuerpo del formulario. Estado
 * grande con icono y acciones amplias. Solo tiene sentido cuando el ensayo
 * ya existe en la DB (tiene id).
 * ========================================================================== */
function FirmaEnsayoPanel(props) {
  var toast = useToast();
  var _est = React.useState(props.ensayo || {});
  var est = _est[0], setEst = _est[1];
  var _cfg = React.useState(null); var cfgOpen = _cfg[0], setCfg = _cfg[1];
  var _hist = React.useState(null); var hist = _hist[0], setHist = _hist[1];

  React.useEffect(function () {
    if (props.ensayo) setEst(props.ensayo);
  }, [props.ensayo && props.ensayo.id, props.ensayo && props.ensayo.estado_firma]);

  function cargarHist() {
    if (!(props.ensayo && props.ensayo.id)) return;
    fetch('/api/ensayo/' + props.ensayo.id + '/firmas')
      .then(function (r) { return r.json(); })
      .then(function (rows) { setHist(Array.isArray(rows) ? rows : []); })
      .catch(function () {});
  }
  React.useEffect(cargarHist, [props.ensayo && props.ensayo.id]);

  var estado = est.estado_firma || 'abierto';
  var esRevisado   = estado === 'revisado';
  var esAutorizado = estado === 'autorizado' || estado === 'firmado';
  var firmado = esRevisado || esAutorizado;

  function firmarConNivel(nivel) {
    return function (token) {
      return fetch('/api/ensayo/' + est.id + '/firmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, nivel: nivel }),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.d.hint || r.d.error || 'Error');
          var next = nivel === 'revisar' ? 'revisado' : 'autorizado';
          var patch = { estado_firma: next };
          if (nivel === 'revisar') { patch.revisado_por = r.d.nombre; patch.revisado_en = new Date().toISOString(); }
          else { patch.firmado_por = r.d.nombre; patch.firmado_en = new Date().toISOString(); }
          var nuevoEst = Object.assign({}, est, patch);
          setEst(nuevoEst);
          // Actualizar el objeto REAL del store (props.ensayo es una copia via
          // getEnsayo → Object.assign({}, e)). Sin esto, el chip en la lista
          // de OT sigue mostrando el estado viejo hasta F5.
          if (window.LabStore && window.LabStore.patchEnsayoFirma && est.id) {
            try { window.LabStore.patchEnsayoFirma(est.id, patch); } catch (_) {}
          }
          if (props.ensayo) Object.assign(props.ensayo, patch); // safety: mutar la copia también
          toast(nivel === 'revisar' ? ('Ensayo firmado por ' + (r.d.nombre || '')) : ('Ensayo aprobado por ' + (r.d.nombre || '')), 'success');
          setCfg(null);
          cargarHist();
          if (props.onChange) props.onChange(nuevoEst);
        });
    };
  }
  function desfirmar(token, motivo) {
    return fetch('/api/ensayo/' + est.id + '/desfirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, motivo: motivo }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.hint || r.d.error || 'Error');
        var patchAbierto = { estado_firma: 'abierto', firmado_en: null, firmado_por: null, revisado_en: null, revisado_por: null };
        var estAbierto = Object.assign({}, est, patchAbierto);
        setEst(estAbierto);
        // Actualizar el store (props.ensayo es una copia de getEnsayo).
        if (window.LabStore && window.LabStore.patchEnsayoFirma && est.id) {
          try { window.LabStore.patchEnsayoFirma(est.id, patchAbierto); } catch (_) {}
        }
        if (props.ensayo) Object.assign(props.ensayo, patchAbierto);
        toast('Ensayo desfirmado. Motivo registrado en auditoría.', 'success');
        setCfg(null);
        cargarHist();
        if (props.onChange) props.onChange(estAbierto);
      });
  }

  var color = esAutorizado ? '#0f7d3a' : esRevisado ? '#3b52c4' : '#8a6a1a';
  var iconName = firmado ? 'lock' : 'unlock';
  function fmtFecha2(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  var fAut = fmtFecha2(est.firmado_en);
  var fRev = fmtFecha2(est.revisado_en);
  var estadoLabel = esAutorizado
      ? 'Aprobó ' + (est.firmado_por || '—') + (fAut ? ' — ' + fAut : '')
    : esRevisado
      ? 'Firmó ' + (est.revisado_por || '—') + (fRev ? ' — ' + fRev : '') + ' · falta aprobar'
    : 'ABIERTO — editable';

  // Barra de progreso visual: dos pasos (Firmar → Aprobar).
  var pasoFirmado  = esRevisado || esAutorizado;
  var pasoAprobado = esAutorizado;

  function pasoBadge(numero, texto, activo, done) {
    var bg   = done ? '#0f7d3a' : activo ? '#3b52c4' : '#e6e6e6';
    var col  = done || activo ? '#fff' : '#8a8a8a';
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 },
    },
      React.createElement('span', {
        style: {
          width: 22, height: 22, borderRadius: '50%', background: bg, color: col,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 12,
        },
      }, done ? React.createElement(Icon, { name: 'check', size: 12 }) : numero),
      React.createElement('span', {
        style: { fontWeight: done ? 700 : 600, color: done ? '#0f7d3a' : activo ? '#3b52c4' : '#666' },
      }, texto)
    );
  }
  function conector(done) {
    return React.createElement('div', {
      style: { flex: 1, height: 2, background: done ? '#0f7d3a' : '#e6e6e6', margin: '0 4px' },
    });
  }

  var Modal = window.TokenModal;

  return React.createElement(Card, { className: 'firma-card' },
    React.createElement(CardHead, {
      icon: iconName,
      title: 'Firma del ensayo',
      sub: firmado ? 'Bloqueado — no se puede modificar' : 'Abierto — editable por el técnico',
    }),
    React.createElement('div', { style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 12 } },
      React.createElement('div', {
        style: {
          padding: '10px 14px', borderRadius: 8, background: color + '15',
          border: '1px solid ' + color + '40',
          color: color, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }
      },
        React.createElement(Icon, { name: iconName, size: 16 }),
        estadoLabel
      ),
      // Botones (política simplificada: solo firma del técnico)
      React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        !firmado ? React.createElement(Button, {
          variant: 'primary', size: 'sm', icon: 'checkCircle',
          onClick: function () { setCfg('revisar'); }
        }, 'Firmar') : null,
        firmado ? React.createElement(Button, {
          variant: 'soft', size: 'sm', icon: 'unlock',
          onClick: function () { setCfg('desfirmar'); }
        }, 'Desfirmar') : null
      ),
      (hist && hist.length)
        ? React.createElement('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 10 } },
            React.createElement('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 } }, 'Historial de firmas'),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              hist.map(function (h) {
                var tn = h.token_nombre || '';
                var esAut = /autorizante/i.test(tn);
                var nombreLimpio = tn.replace(/\s*\((?:revisor|autorizante)\)\s*/i, '').trim() || '—';
                var accionLabel = h.accion === 'desfirmar' ? 'Desfirmado' : (esAut ? 'Aprobó' : 'Firmó');
                var col = h.accion === 'desfirmar' ? '#b02a2a' : (esAut ? '#0f7d3a' : '#3b52c4');
                return React.createElement('div', { key: h.id, style: { fontSize: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' } },
                  React.createElement('span', { style: { fontWeight: 700, color: col } }, accionLabel),
                  React.createElement('span', null, 'por ' + nombreLimpio),
                  React.createElement('span', { style: { color: 'var(--text-3)' } }, (h.fecha || '').replace('T', ' ').slice(0, 16)),
                  h.motivo ? React.createElement('span', { style: { color: 'var(--text-3)', fontStyle: 'italic' } }, '· ' + h.motivo) : null
                );
              })
            )
          )
        : null
    ),
    cfgOpen === 'autorizar' && Modal
      ? React.createElement(Modal, { titulo: 'Aprobar ensayo', submitLabel: 'Aprobar', onSubmit: firmarConNivel('autorizar'), onCancel: function () { setCfg(null); } })
      : null,
    cfgOpen === 'revisar' && Modal
      ? React.createElement(Modal, { titulo: 'Firmar ensayo', submitLabel: 'Firmar', onSubmit: firmarConNivel('revisar'), onCancel: function () { setCfg(null); } })
      : null,
    cfgOpen === 'desfirmar' && Modal
      ? React.createElement(Modal, { titulo: 'Desfirmar ensayo', submitLabel: 'Desfirmar', pedirMotivo: true, motivoOpcional: true, onSubmit: desfirmar, onCancel: function () { setCfg(null); } })
      : null
  );
}

window.FirmaEnsayoPanel = FirmaEnsayoPanel;
