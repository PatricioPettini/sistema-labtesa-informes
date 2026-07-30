/* LABTESA — Dashboard por técnico
 * Métricas agregadas de los últimos 12 meses: ensayos revisados, OTs firmadas,
 * informes emitidos, retracciones, tiempo promedio recepción → firma.
 * Sirve para revisión mensual, detectar sobrecarga y retrabajo.
 */

function TecnicosScreen() {
  var _data = React.useState(null); var data = _data[0], setData = _data[1];
  var _err  = React.useState(null); var err  = _err[0], setErr  = _err[1];
  var _sort = React.useState('ensayos_revisados'); var sortKey = _sort[0], setSortKey = _sort[1];
  var _dir  = React.useState('desc'); var sortDir = _dir[0], setSortDir = _dir[1];

  React.useEffect(function () {
    fetch('/api/tecnicos-dashboard')
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) { if (!r.ok) throw new Error(r.d.error || 'Error'); setData(r.d); })
      .catch(function (e) { setErr(e.message); });
  }, []);

  if (err) return React.createElement('div', { className: 'page-wide' },
    React.createElement('div', { style: { padding: 40, textAlign: 'center', color: '#b02a2a' } },
      'Error cargando dashboard: ' + err));

  if (!data) return React.createElement('div', { className: 'page-wide' },
    React.createElement('div', { style: { padding: 60, textAlign: 'center', color: 'var(--text-3)' } },
      'Cargando dashboard por técnico…'));

  var tecnicos = (data.tecnicos || []).slice();
  tecnicos.sort(function (a, b) {
    var av = a[sortKey] == null ? -1 : a[sortKey];
    var bv = b[sortKey] == null ? -1 : b[sortKey];
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // Totales de la tabla para el footer.
  var totalEns = tecnicos.reduce(function (a, t) { return a + (t.ensayos_revisados || 0); }, 0);
  var totalOts = tecnicos.reduce(function (a, t) { return a + (t.ots_firmadas || 0); }, 0);
  var totalInf = tecnicos.reduce(function (a, t) { return a + (t.informes_emitidos || 0); }, 0);
  var totalDes = tecnicos.reduce(function (a, t) { return a + (t.desfirmas || 0); }, 0);

  function toggleSort(k) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  function ThSort(props) {
    var isActive = sortKey === props.k;
    return React.createElement('th', {
      onClick: function () { toggleSort(props.k); },
      style: Object.assign({
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        color: isActive ? '#1a202c' : 'var(--text-3)',
      }, props.style || {}),
      title: 'Ordenar por ' + props.label,
    },
      props.label,
      isActive ? React.createElement('span', { style: { marginLeft: 4, fontSize: 10 } },
        sortDir === 'asc' ? '▲' : '▼'
      ) : null
    );
  }

  function fmtDias(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n * 10) / 10).toString().replace('.', ',') + ' d';
  }
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-AR');
  }
  function fmtFecha(iso) {
    if (!iso) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return iso;
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  return React.createElement('div', { className: 'page-wide' },
    React.createElement('div', { className: 'page-head', style: { marginBottom: 20 } },
      React.createElement('h1', { className: 'page-title', style: { fontSize: 28, marginBottom: 4 } }, 'Técnicos'),
      React.createElement('p', { className: 'page-sub', style: { color: 'var(--text-3)', margin: 0, fontSize: 13 } },
        'Actividad de los últimos ' + (data.periodo || '12 meses') +
        ' · click en las columnas para ordenar')
    ),

    tecnicos.length === 0
      ? React.createElement('div', {
          style: { padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }
        }, 'Sin actividad registrada en el período.')
      : React.createElement('div', {
          style: {
            background: '#fff', border: '1px solid #e5e8ec', borderRadius: 10,
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.04)',
          }
        },
        React.createElement('table', {
          className: 'data-table',
          style: { width: '100%', borderCollapse: 'collapse' }
        },
          React.createElement('thead', {
            style: { background: '#f8f9fa', borderBottom: '1px solid #edf0f3' }
          },
            React.createElement('tr', null,
              React.createElement(ThSort, { k: 'tecnico', label: 'Técnico', style: { textAlign: 'left', paddingLeft: 16 } }),
              React.createElement(ThSort, { k: 'ensayos_revisados', label: 'Ensayos revisados', style: { textAlign: 'right' } }),
              React.createElement(ThSort, { k: 'ots_firmadas', label: 'OTs firmadas', style: { textAlign: 'right' } }),
              React.createElement(ThSort, { k: 'informes_emitidos', label: 'Informes emitidos', style: { textAlign: 'right' } }),
              React.createElement(ThSort, { k: 'desfirmas', label: 'Retracciones', style: { textAlign: 'right' } }),
              React.createElement(ThSort, { k: 'dias_prom', label: 'Prom. rec→firma', style: { textAlign: 'right' } }),
              React.createElement(ThSort, { k: 'ultimo', label: 'Última actividad', style: { textAlign: 'right', paddingRight: 16 } })
            )
          ),
          React.createElement('tbody', null,
            tecnicos.map(function (t, i) {
              var alertaDes = t.desfirmas > 5;
              var alertaTiempo = t.dias_prom != null && t.dias_prom > 15;
              return React.createElement('tr', {
                key: t.tecnico + '-' + i,
                style: { borderBottom: '1px solid #f1f3f5' }
              },
                React.createElement('td', {
                  style: { padding: '12px 16px', fontWeight: 600, color: '#1a202c' }
                }, t.tecnico),
                React.createElement('td', {
                  style: { padding: '12px 8px', textAlign: 'right', color: '#1a202c', fontVariantNumeric: 'tabular-nums' }
                }, fmtNum(t.ensayos_revisados)),
                React.createElement('td', {
                  style: { padding: '12px 8px', textAlign: 'right', color: '#1a202c', fontVariantNumeric: 'tabular-nums' }
                }, fmtNum(t.ots_firmadas)),
                React.createElement('td', {
                  style: { padding: '12px 8px', textAlign: 'right', color: '#1a202c', fontVariantNumeric: 'tabular-nums' }
                }, fmtNum(t.informes_emitidos)),
                React.createElement('td', {
                  style: {
                    padding: '12px 8px', textAlign: 'right',
                    color: alertaDes ? '#b02a2a' : '#1a202c',
                    fontWeight: alertaDes ? 700 : 400,
                    fontVariantNumeric: 'tabular-nums',
                  },
                  title: alertaDes ? 'Retracciones altas — revisar' : ''
                }, fmtNum(t.desfirmas)),
                React.createElement('td', {
                  style: {
                    padding: '12px 8px', textAlign: 'right',
                    color: alertaTiempo ? '#c79800' : '#1a202c',
                    fontWeight: alertaTiempo ? 700 : 400,
                    fontVariantNumeric: 'tabular-nums',
                  },
                  title: alertaTiempo ? 'Tiempo de ciclo elevado' : ''
                }, fmtDias(t.dias_prom)),
                React.createElement('td', {
                  style: { padding: '12px 16px', textAlign: 'right', color: 'var(--text-3)', fontSize: 12 }
                }, fmtFecha(t.ultimo))
              );
            })
          ),
          React.createElement('tfoot', {
            style: { background: '#f8f9fa', borderTop: '2px solid #edf0f3', fontWeight: 700 }
          },
            React.createElement('tr', null,
              React.createElement('td', { style: { padding: '10px 16px', color: 'var(--text-3)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' } }, 'TOTAL'),
              React.createElement('td', { style: { padding: '10px 8px', textAlign: 'right' } }, fmtNum(totalEns)),
              React.createElement('td', { style: { padding: '10px 8px', textAlign: 'right' } }, fmtNum(totalOts)),
              React.createElement('td', { style: { padding: '10px 8px', textAlign: 'right' } }, fmtNum(totalInf)),
              React.createElement('td', { style: { padding: '10px 8px', textAlign: 'right' } }, fmtNum(totalDes)),
              React.createElement('td', { style: { padding: '10px 8px', textAlign: 'right', color: 'var(--text-3)' } }, '—'),
              React.createElement('td', { style: { padding: '10px 16px', textAlign: 'right', color: 'var(--text-3)' } }, '—')
            )
          )
        )
      ),

    React.createElement('div', {
      style: { marginTop: 12, fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }
    },
      React.createElement('div', null,
        React.createElement('b', null, 'Ensayos revisados'),
        ': ensayos cuyo campo `revisado_por` = técnico, en los últimos 12 meses.'),
      React.createElement('div', null,
        React.createElement('b', null, 'OTs firmadas / Informes emitidos'),
        ': OT con `firmado_por` = técnico + informe generado (últimos 12 meses).'),
      React.createElement('div', null,
        React.createElement('b', null, 'Retracciones'),
        ': acciones de desfirmar registradas en el log de firmas. Rojo si supera 5.'),
      React.createElement('div', null,
        React.createElement('b', null, 'Prom. rec→firma'),
        ': días promedio entre recepción de la muestra y firma del ensayo. Amarillo si supera 15 días.')
    )
  );
}

window.TecnicosScreen = TecnicosScreen;
