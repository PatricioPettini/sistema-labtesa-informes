/* LABTESA — Panel "Acreditación OAA"
 * Vista de solo lectura: muestra para cada ensayo si está acreditado y si
 * llevará (*) en el Word, según el certificado OAA LE 012.
 * Detección 100% automática — el técnico no decide.
 */

function OAAPanel(props) {
  var nro_ot = props.nro_ot;
  var _data = React.useState(null);
  var data = _data[0], setData = _data[1];
  var _err  = React.useState(null); var err = _err[0], setErr = _err[1];

  React.useEffect(function () {
    setData(null);
    fetch('/api/oaa-preview/' + nro_ot)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(setData)
      .catch(function (e) { setErr(e.message); });
  }, [nro_ot, props.refreshKey]);

  if (err) return React.createElement(Card, null,
    React.createElement(CardHead, { icon: 'checkCircle', title: 'Acreditación OAA', sub: 'Error' }),
    React.createElement('p', { className: 'oaa-err' }, err));
  if (!data) return React.createElement(Card, null,
    React.createElement(CardHead, { icon: 'checkCircle', title: 'Acreditación OAA', sub: 'Analizando…' }));
  if (!data.detecciones.length) return React.createElement(Card, null,
    React.createElement(CardHead, { icon: 'checkCircle', title: 'Acreditación OAA', sub: 'Sin ensayos cargados' }));

  var hayMix       = data.detecciones[0] ? data.detecciones[0].hay_mix : false;
  var conAsterisco = data.detecciones.filter(function (d) { return d.aplica_asterisco; }).length;
  var sub;
  if (data.detecciones.length === 1) {
    sub = data.detecciones[0].acreditado ? 'Ensayo acreditado · sin nota OAA' : 'Ensayo no acreditado · sin nota OAA (único ensayo)';
  } else if (!hayMix) {
    sub = 'Todos ' + (data.detecciones[0].acreditado ? 'acreditados' : 'no acreditados') + ' · sin nota OAA';
  } else {
    sub = conAsterisco + '/' + data.detecciones.length + ' ensayo(s) llevarán (*) y nota OAA';
  }

  return React.createElement(Card, { className: 'oaa-card' },
    React.createElement(CardHead, { icon: 'checkCircle', title: 'Acreditación OAA', sub: sub }),
    React.createElement('div', { className: 'oaa-list' },
      data.detecciones.map(function (det) {
        var label = (window.LabStore.labels[det.tipo] || det.tipo);
        var acred = !!det.acreditado;
        var llevAst = !!det.aplica_asterisco;
        return React.createElement('div', { key: det.id, className: 'oaa-row oaa-row-readonly' + (acred ? ' aplica' : '') },
          React.createElement('div', { className: 'oaa-row-l' },
            React.createElement('span', { className: 'oaa-badge ' + (acred ? 'on' : 'off') },
              acred ? 'ACRED' : 'NO ACR'),
            React.createElement('div', { className: 'oaa-row-text' },
              React.createElement('div', { className: 'oaa-row-title' }, label,
                llevAst ? React.createElement('span', { className: 'oaa-ast-tag', title: 'En el Word lleva (*)' }, ' lleva *') : null
              ),
              React.createElement('div', { className: 'oaa-row-motivo' }, det.motivo)
            )
          )
        );
      })
    ),
    React.createElement('div', { className: 'oaa-foot' },
      React.createElement('span', { className: 'oaa-foot-leyenda' },
        'Detección automática según OAA LE 012 (Brandsen 2933, CABA). ' +
        'El (*) marca los ensayos NO acreditados solo cuando el informe tiene mezcla.'
      )
    )
  );
}

window.OAAPanel = OAAPanel;
