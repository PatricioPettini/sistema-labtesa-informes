/* LABTESA — panel de firma con token: bloquea/desbloquea una OT */

function FirmaPanel(props) {
  var toast = useToast();
  var _est = React.useState({ estado: props.estado_firma || 'abierto', firmado_en: props.firmado_en, firmado_por: props.firmado_por });
  var est = _est[0], setEst = _est[1];
  var _cfg = React.useState(null);   var cfgOpen = _cfg[0], setCfg = _cfg[1]; // 'firmar' | 'desfirmar' | 'setToken'
  var _hay = React.useState(null);   var hayTok = _hay[0], setHay = _hay[1];

  React.useEffect(function () {
    fetch('/api/firma/status')
      .then(function (r) { return r.json(); })
      .then(function (d) { setHay(!!d.configurado); })
      .catch(function () { setHay(false); });
  }, []);

  var esRevisado = est.estado === 'revisado';
  var esAutorizado = est.estado === 'autorizado' || est.estado === 'firmado';
  var firmado = esRevisado || esAutorizado;

  function firmarConNivel(nivel) {
    return function (token) {
      return fetch('/api/ot/' + props.nro_ot + '/firmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, nivel: nivel }),
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.d.error || 'Error');
          var next = nivel === 'revisar' ? 'revisado' : 'autorizado';
          setEst({ estado: next, firmado_en: new Date().toISOString(), firmado_por: null });
          toast(nivel === 'revisar' ? 'OT revisada.' : 'OT autorizada. Firma final aplicada.', 'success');
          setCfg(null);
          if (props.onChange) props.onChange();
        });
    };
  }
  var onFirmar = firmarConNivel('autorizar');
  var onRevisar = firmarConNivel('revisar');

  function onDesfirmar(token, motivo) {
    return fetch('/api/ot/' + props.nro_ot + '/desfirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, motivo: motivo }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        setEst({ estado: 'abierto', firmado_en: null, firmado_por: null });
        toast('OT desfirmada. Motivo registrado en auditoría.', 'success');
        setCfg(null);
        if (props.onChange) props.onChange();
      });
  }

  function onSetToken(datos) {
    return fetch('/api/firma/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        setHay(true);
        toast('Token guardado.', 'success');
        setCfg(null);
      });
  }

  var color = esAutorizado ? '#0f7d3a' : esRevisado ? '#3b52c4' : '#8a6a1a';
  var iconName = firmado ? 'lock' : 'unlock';
  var estadoLabel = esAutorizado ? 'AUTORIZADA' : esRevisado ? 'REVISADA (falta autorizar)' : 'ABIERTA';

  return React.createElement(Card, { className: 'firma-card' },
    React.createElement(CardHead, {
      icon: iconName,
      title: 'Firma de la OT',
      sub: firmado ? 'Bloqueada — no se puede modificar' : 'Abierta — editable',
    }),
    React.createElement('div', { style: { padding: 12, display: 'flex', flexDirection: 'column', gap: 10 } },
      React.createElement('div', {
        style: {
          padding: '8px 12px', borderRadius: 6, background: color + '18',
          color: color, fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }
      },
        React.createElement(Icon, { name: iconName, size: 14 }),
        estadoLabel + (esAutorizado && est.firmado_por ? ' (' + est.firmado_por + ')' : '')
      ),

      hayTok === false
        ? React.createElement('div', { style: { fontSize: 12, color: 'var(--text-3)' } },
            'No hay token configurado. ',
            React.createElement('button', {
              className: 'link-btn',
              onClick: function () { setCfg('setToken'); }
            }, 'Configurar ahora →'))
        : null,

      React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        !esAutorizado ? React.createElement(Button, {
          variant: esRevisado ? 'primary' : 'soft', size: 'sm', icon: 'lock',
          disabled: hayTok === false,
          onClick: function () { setCfg('autorizar'); }
        }, 'Autorizar (firma final)') : null,
        !esRevisado && !esAutorizado ? React.createElement(Button, {
          variant: 'soft', size: 'sm', icon: 'checkCircle',
          disabled: hayTok === false,
          onClick: function () { setCfg('revisar'); }
        }, 'Marcar como revisada') : null,
        firmado ? React.createElement(Button, {
          variant: 'soft', size: 'sm', icon: 'unlock',
          onClick: function () { setCfg('desfirmar'); }
        }, 'Desfirmar') : null,
        React.createElement(Button, {
          variant: 'ghost', size: 'sm', icon: 'settings',
          onClick: function () { setCfg('setToken'); }
        }, hayTok ? 'Cambiar token' : 'Configurar token')
      )
    ),

    cfgOpen === 'autorizar' ? React.createElement(RevisorChecklistModal, {
        nro_ot: props.nro_ot,
        titulo: 'Autorizar (firma final) — OT ' + props.nro_ot,
        submitLabel: 'Autorizar OT',
        onSubmit: onFirmar,
        onCancel: function () { setCfg(null); }
      }) : null,
    cfgOpen === 'revisar' ? React.createElement(TokenModal, {
        titulo: 'Marcar como revisada — OT ' + props.nro_ot,
        submitLabel: 'Marcar como revisada',
        onSubmit: onRevisar,
        onCancel: function () { setCfg(null); }
      }) : null,
    cfgOpen === 'desfirmar' ? React.createElement(TokenModal, { titulo: 'Desfirmar OT ' + props.nro_ot, submitLabel: 'Desfirmar', pedirMotivo: true, onSubmit: onDesfirmar, onCancel: function () { setCfg(null); } }) : null,
    cfgOpen === 'setToken'  ? React.createElement(SetTokenModal, { yaConfigurado: !!hayTok, onSubmit: onSetToken, onCancel: function () { setCfg(null); } }) : null
  );
}

function TokenModal(props) {
  var _tok = React.useState(''); var tok = _tok[0], setTok = _tok[1];
  var _mot = React.useState(''); var mot = _mot[0], setMot = _mot[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err = React.useState(''); var err = _err[0], setErr = _err[1];
  function submit() {
    if (!tok) { setErr('Ingresá el token.'); return; }
    if (props.pedirMotivo && !props.motivoOpcional && (!mot || mot.trim().length < 3)) { setErr('Ingresá un motivo (mínimo 3 caracteres).'); return; }
    setBusy(true); setErr('');
    var call = props.pedirMotivo ? props.onSubmit(tok, mot) : props.onSubmit(tok);
    call.catch(function (e) { setErr(e.message || 'Error'); }).finally(function () { setBusy(false); });
  }
  return React.createElement('div', { className: 'modal-backdrop',
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    React.createElement('div', { style: { background: '#fff', borderRadius: 8, width: 420, padding: 20 } },
      React.createElement('h3', { style: { margin: 0, marginBottom: 14 } }, props.titulo),
      React.createElement('div', { style: { marginBottom: 12 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Token de firma'),
        React.createElement('input', {
          type: 'password', className: 'input', value: tok, autoFocus: true,
          onChange: function (e) { setTok(e.target.value); },
          onKeyDown: function (e) { if (e.key === 'Enter') submit(); }
        })
      ),
      props.pedirMotivo ? React.createElement('div', { style: { marginBottom: 12 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, props.motivoOpcional ? 'Motivo (opcional)' : 'Motivo (obligatorio)'),
        React.createElement('textarea', {
          className: 'input textarea', rows: 3, value: mot,
          onChange: function (e) { setMot(e.target.value); },
          placeholder: 'Ej: corrección de valor de tracción en probeta 2 tras revisión'
        })
      ) : null,
      err ? React.createElement('div', { style: { color: '#b02a2a', fontSize: 12, marginBottom: 10 } }, err) : null,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: props.onCancel, disabled: busy }, 'Cancelar'),
        React.createElement(Button, { variant: 'primary', size: 'sm', onClick: submit, loading: busy }, props.submitLabel)
      )
    )
  );
}

function SetTokenModal(props) {
  var _nombre = React.useState('principal'); var nombre = _nombre[0], setNombre = _nombre[1];
  var _rol = React.useState('ambos');        var rol = _rol[0], setRol = _rol[1];
  var _tok = React.useState('');             var tok = _tok[0], setTok = _tok[1];
  var _tok2 = React.useState('');            var tok2 = _tok2[0], setTok2 = _tok2[1];
  var _act = React.useState('');             var act = _act[0], setAct = _act[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err = React.useState(''); var err = _err[0], setErr = _err[1];

  function submit() {
    if (!tok || tok.length < 4) { setErr('El token debe tener al menos 4 caracteres.'); return; }
    if (tok !== tok2) { setErr('El token y su confirmación no coinciden.'); return; }
    if (props.yaConfigurado && !act) { setErr('Ingresá el token actual para poder cambiarlo.'); return; }
    setBusy(true); setErr('');
    props.onSubmit({ nombre: nombre, token: tok, token_actual: act || undefined, rol: rol })
      .catch(function (e) { setErr(e.message || 'Error'); })
      .finally(function () { setBusy(false); });
  }

  return React.createElement('div', { className: 'modal-backdrop',
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    React.createElement('div', { style: { background: '#fff', borderRadius: 8, width: 460, padding: 20 } },
      React.createElement('h3', { style: { margin: 0, marginBottom: 6 } }, props.yaConfigurado ? 'Rotar token de firma' : 'Configurar token de firma'),
      React.createElement('p', { style: { margin: '0 0 14px 0', color: 'var(--text-3)', fontSize: 12 } },
        'El token se hashea (SHA-256 + salt) y nunca se guarda en claro. Si se pierde, hay que rotarlo con el actual.'),
      React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Nombre'),
        React.createElement('input', { className: 'input', value: nombre, onChange: function (e) { setNombre(e.target.value); } })
      ),
      React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Rol'),
        React.createElement('select', {
          className: 'input', value: rol,
          onChange: function (e) { setRol(e.target.value); }
        },
          React.createElement('option', { value: 'ambos' }, 'Ambos (puede revisar y autorizar)'),
          React.createElement('option', { value: 'revisor' }, 'Solo revisor'),
          React.createElement('option', { value: 'autorizante' }, 'Solo autorizante')
        )
      ),
      props.yaConfigurado ? React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Token actual'),
        React.createElement('input', { type: 'password', className: 'input', value: act, onChange: function (e) { setAct(e.target.value); } })
      ) : null,
      React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Token nuevo'),
        React.createElement('input', { type: 'password', className: 'input', value: tok, onChange: function (e) { setTok(e.target.value); } })
      ),
      React.createElement('div', { style: { marginBottom: 12 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Repetir token nuevo'),
        React.createElement('input', { type: 'password', className: 'input', value: tok2, onChange: function (e) { setTok2(e.target.value); } })
      ),
      err ? React.createElement('div', { style: { color: '#b02a2a', fontSize: 12, marginBottom: 10 } }, err) : null,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: props.onCancel, disabled: busy }, 'Cancelar'),
        React.createElement(Button, { variant: 'primary', size: 'sm', onClick: submit, loading: busy }, 'Guardar token')
      )
    )
  );
}

function RevisorChecklistModal(props) {
  var _chk = React.useState(null); var chk = _chk[0], setChk = _chk[1];
  var _tok = React.useState(''); var tok = _tok[0], setTok = _tok[1];
  var _busy = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err = React.useState(''); var err = _err[0], setErr = _err[1];

  React.useEffect(function () {
    fetch('/api/ot/' + props.nro_ot + '/checklist')
      .then(function (r) { return r.json(); })
      .then(function (d) { setChk(d); })
      .catch(function (e) { setErr(e.message || 'Error'); });
  }, [props.nro_ot]);

  function submit() {
    if (!tok) { setErr('Ingresá el token de firma.'); return; }
    setBusy(true); setErr('');
    props.onSubmit(tok)
      .catch(function (e) { setErr(e.message || 'Error'); })
      .finally(function () { setBusy(false); });
  }

  var issues = (chk && chk.issues) || { errores: [], advertencias: [], info: [] };
  var puedeFirmar = chk && issues.errores.length === 0;

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
  },
    React.createElement('div', {
      style: { background: '#fff', borderRadius: 8, width: 'min(90vw, 640px)',
               maxHeight: '85vh', display: 'flex', flexDirection: 'column' }
    },
      React.createElement('div', { style: { padding: '14px 20px', borderBottom: '1px solid var(--border)' } },
        React.createElement('h3', { style: { margin: 0 } }, props.titulo || ('Revisar antes de firmar — OT ' + props.nro_ot)),
        React.createElement('p', { style: { margin: '4px 0 0 0', fontSize: 12, color: 'var(--text-3)' } },
          'Verificá errores y advertencias antes de aplicar la firma. La firma bloquea la OT.')
      ),
      React.createElement('div', { style: { flex: 1, overflow: 'auto', padding: 16 } },
        !chk
          ? React.createElement('div', { style: { color: 'var(--text-3)' } }, 'Verificando…')
          : React.createElement(React.Fragment, null,
              renderBloque('errores', 'Errores (deben corregirse)', issues.errores, '#b02a2a', '#ffebe9'),
              renderBloque('advertencias', 'Advertencias', issues.advertencias, '#7a5a1a', '#fff8dc'),
              renderBloque('info', 'Información', issues.info, '#3b52c4', '#eef1f4'),
              issues.errores.length === 0 && issues.advertencias.length === 0 && issues.info.length === 0
                ? React.createElement('div', { style: { padding: 20, textAlign: 'center', color: '#0f7d3a' } },
                    '✓ Sin observaciones. OT lista para firmar.')
                : null
            )
      ),
      React.createElement('div', { style: { padding: '14px 20px', borderTop: '1px solid var(--border)' } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Token de firma'),
        React.createElement('input', {
          type: 'password', className: 'input', value: tok, autoFocus: true,
          disabled: !puedeFirmar,
          onChange: function (e) { setTok(e.target.value); },
          onKeyDown: function (e) { if (e.key === 'Enter' && puedeFirmar) submit(); }
        }),
        err ? React.createElement('div', { style: { color: '#b02a2a', fontSize: 12, marginTop: 8 } }, err) : null,
        React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } },
          React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: props.onCancel, disabled: busy }, 'Cancelar'),
          React.createElement(Button, {
            variant: 'primary', size: 'sm', onClick: submit,
            disabled: !puedeFirmar, loading: busy
          }, puedeFirmar ? (props.submitLabel || 'Firmar OT') : 'Hay errores — no se puede firmar')
        )
      )
    )
  );
}

function renderBloque(key, titulo, items, colorTxt, colorBg) {
  if (!items || items.length === 0) return null;
  return React.createElement('div', { key: key, style: { marginBottom: 14 } },
    React.createElement('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 6, color: colorTxt } },
      titulo + ' (' + items.length + ')'),
    React.createElement('ul', {
      style: { margin: 0, padding: '8px 12px 8px 30px', background: colorBg,
               border: '1px solid ' + colorTxt + '44', borderRadius: 4, fontSize: 12 }
    },
      items.map(function (it, i) { return React.createElement('li', { key: i, style: { marginBottom: 3 } }, it); })
    )
  );
}

window.FirmaPanel = FirmaPanel;
window.TokenModal = TokenModal;
window.SetTokenModal = SetTokenModal;
