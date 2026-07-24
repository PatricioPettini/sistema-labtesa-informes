/* LABTESA — dashboard analítico. Rediseño profesional. */

// ─── Paleta ────────────────────────────────────────────────────────────────
var STATS_COLORS = {
  primary: '#4361ee',
  primarySoft: '#eef2ff',
  success: '#0f7d3a',
  successSoft: '#e8f5ed',
  warn: '#c79800',
  warnSoft: '#fdf6e3',
  danger: '#b02a2a',
  dangerSoft: '#fef1f1',
  neutral: '#4a5568',
  neutralSoft: '#f1f3f5',
  info: '#3182ce',
  infoSoft: '#ebf4fb',
  purple: '#6f4ecc',
  purpleSoft: '#f2eefe',
  teal: '#0d9488',
  tealSoft: '#e6faf7',
};

// Formato de números con separadores de miles.
function fmtNum(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('es-AR');
}
function fmtDias(n) {
  if (n == null || isNaN(n)) return '—';
  return (Math.round(n * 10) / 10).toString().replace('.', ',') + ' d';
}

function StatsScreen() {
  var _s = React.useState(null); var stats = _s[0], setStats = _s[1];
  var _err = React.useState(null); var err = _err[0], setErr = _err[1];

  React.useEffect(function () {
    fetch('/api/stats')
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) { if (!r.ok) throw new Error(r.d.error || 'Error'); setStats(r.d); })
      .catch(function (e) { setErr(e.message); });
  }, []);

  if (err) return React.createElement('div', { className: 'page-wide' },
    React.createElement('div', { style: { padding: 40, textAlign: 'center', color: STATS_COLORS.danger } },
      'Error cargando estadísticas: ' + err));

  if (!stats) return React.createElement('div', { className: 'page-wide' },
    React.createElement('div', { style: { padding: 60, textAlign: 'center', color: 'var(--text-3)' } },
      React.createElement('div', { style: { fontSize: 13 } }, 'Cargando estadísticas…')));

  var g  = stats.generales || {};
  var tf = stats.totalesFirma || {};
  var t  = stats.tiempos || {};
  var porMes = stats.porMes || [];
  var porTipo = stats.porTipoEnsayo || [];
  var topClientes = stats.topClientes || [];

  // KPIs derivados
  var pctFirmadas = (tf.total_ots > 0) ? Math.round((tf.firmadas / tf.total_ots) * 100) : null;
  var ensayosPorOt = (g.total_ots > 0) ? (g.total_ensayos / g.total_ots).toFixed(1) : '—';
  var informesPorMes = porMes.length ? Math.round(porMes.reduce(function (a, m) { return a + (m.n || 0); }, 0) / porMes.length) : null;

  return React.createElement('div', { className: 'page-wide' },
    // ── Cabecera ─────────────────────────────────────────────────────────
    React.createElement('div', { className: 'page-head', style: { marginBottom: 20 } },
      React.createElement('h1', { className: 'page-title', style: { fontSize: 28, marginBottom: 4 } }, 'Estadísticas'),
      React.createElement('p', { className: 'page-sub', style: { color: 'var(--text-3)', margin: 0, fontSize: 13 } },
        'Panel analítico — actividad de los últimos 12 meses')
    ),

    // ── Grupo 1: Producción ──────────────────────────────────────────────
    SeccionKPIs('Producción', [
      { icon: 'inbox',   label: 'OTs totales',        valor: fmtNum(g.total_ots),         color: STATS_COLORS.primary },
      { icon: 'layers',  label: 'Ensayos totales',    valor: fmtNum(g.total_ensayos),     color: STATS_COLORS.teal,   sub: ensayosPorOt + ' por OT' },
      { icon: 'file',    label: 'Informes emitidos',  valor: fmtNum(g.total_informes),    color: STATS_COLORS.purple, sub: (informesPorMes != null ? '~' + informesPorMes + ' / mes' : null) },
      { icon: 'users',   label: 'Clientes activos',   valor: fmtNum(g.total_clientes),    color: STATS_COLORS.info },
    ]),

    // ── Grupo 2: Calidad & firma ─────────────────────────────────────────
    SeccionKPIs('Calidad y firma', [
      { icon: 'lock',      label: 'OTs firmadas',
        valor: fmtNum(tf.firmadas) + (tf.total_ots ? ' / ' + fmtNum(tf.total_ots) : ''),
        color: STATS_COLORS.success,
        sub: (pctFirmadas != null ? pctFirmadas + '% del total' : null) },
      { icon: 'unlock',    label: 'Desfirmadas (12m)',
        valor: fmtNum(tf.n_desfirmadas_12m || 0),
        color: (tf.n_desfirmadas_12m > 0 ? STATS_COLORS.warn : STATS_COLORS.neutral),
        sub: (tf.n_desfirmadas_12m > 0 ? 'Revisar auditoría' : 'Sin retracciones') },
    ]),

    // ── Grupo 3: Tiempos ─────────────────────────────────────────────────
    SeccionKPIs('Tiempos de ciclo (recepción → emisión)', [
      { icon: 'clock',   label: 'Promedio',    valor: fmtDias(t.dias_prom),  color: STATS_COLORS.info },
      { icon: 'arrowDown', label: 'Mínimo (6m)', valor: fmtDias(t.dias_min),   color: STATS_COLORS.success },
      { icon: 'arrowUp',   label: 'Máximo (6m)', valor: fmtDias(t.dias_max),   color: STATS_COLORS.warn },
    ]),

    // ── Gráfico principal: informes por mes ──────────────────────────────
    React.createElement('div', { style: statsCardStyle(),  className: 'stats-card' },
      React.createElement('div', { style: statsCardHeadStyle() },
        React.createElement('div', null,
          React.createElement('h3', { style: { margin: 0, fontSize: 15, color: '#1a202c' } }, 'Informes emitidos por mes'),
          React.createElement('p', { style: { margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-3)' } },
            'Últimos ' + porMes.length + ' meses · totales vs acreditados OAA')
        ),
        Leyenda([
          { label: 'Total emitidos',     color: STATS_COLORS.primary },
          { label: 'Acreditados OAA',    color: STATS_COLORS.success },
        ])
      ),
      React.createElement('div', { style: { padding: '4px 16px 16px 16px' } },
        BarChart(porMes, {
          xKey: 'ym', valueKey: 'n', extraKey: 'n_oaa',
          colorMain: STATS_COLORS.primary, colorExtra: STATS_COLORS.success,
        })
      )
    ),

    // ── Grid inferior: 2 columnas ────────────────────────────────────────
    React.createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 16, marginTop: 16,
      }
    },
      React.createElement('div', { style: statsCardStyle(), className: 'stats-card' },
        React.createElement('div', { style: statsCardHeadStyle() },
          React.createElement('div', null,
            React.createElement('h3', { style: { margin: 0, fontSize: 15, color: '#1a202c' } }, 'Ensayos por tipo'),
            React.createElement('p', { style: { margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-3)' } },
              porTipo.length + ' tipos con actividad')
          )
        ),
        React.createElement('div', { style: { padding: '4px 16px 16px 16px' } },
          HorizontalBars(porTipo, 'tipo', 'n', STATS_COLORS.primary)
        )
      ),
      React.createElement('div', { style: statsCardStyle(), className: 'stats-card' },
        React.createElement('div', { style: statsCardHeadStyle() },
          React.createElement('div', null,
            React.createElement('h3', { style: { margin: 0, fontSize: 15, color: '#1a202c' } }, 'Top 10 clientes'),
            React.createElement('p', { style: { margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-3)' } },
              'Por cantidad de OTs')
          )
        ),
        React.createElement('div', { style: { padding: '4px 16px 16px 16px' } },
          HorizontalBars(
            topClientes.map(function (c) { return { label: c.razon_social, n: c.n_ots }; }),
            'label', 'n', STATS_COLORS.teal)
        )
      )
    )
  );
}

// ─── Estilos base para cards ──────────────────────────────────────────────
function statsCardStyle() {
  return {
    background: '#fff',
    border: '1px solid #e5e8ec',
    borderRadius: 10,
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    marginBottom: 0,
    overflow: 'hidden',
  };
}
function statsCardHeadStyle() {
  return {
    padding: '14px 16px',
    borderBottom: '1px solid #edf0f3',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 12, flexWrap: 'wrap',
  };
}

// ─── Sección de KPIs agrupados ────────────────────────────────────────────
function SeccionKPIs(titulo, kpis) {
  return React.createElement('div', { style: { marginBottom: 18 } },
    React.createElement('h2', {
      style: {
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
        color: 'var(--text-3)', margin: '0 0 10px 0',
      },
    }, titulo),
    React.createElement('div', {
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }
    },
      kpis.map(function (k, i) { return KpiCard(k, i); })
    )
  );
}

function KpiCard(k, idx) {
  var soft = softColor(k.color);
  return React.createElement('div', {
    key: idx,
    className: 'stats-kpi',
    style: {
      background: '#fff',
      border: '1px solid #e5e8ec',
      borderRadius: 10,
      padding: 14,
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
      transition: 'transform .15s, box-shadow .15s',
    }
  },
    React.createElement('div', {
      style: {
        width: 40, height: 40, borderRadius: 10,
        background: soft, color: k.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }
    },
      typeof Icon === 'function' ? React.createElement(Icon, { name: k.icon || 'inbox', size: 18 }) : null
    ),
    React.createElement('div', { style: { minWidth: 0, flex: 1 } },
      React.createElement('div', {
        style: {
          fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase',
          letterSpacing: '.04em', fontWeight: 600, marginBottom: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }
      }, k.label),
      React.createElement('div', {
        style: {
          fontSize: 22, fontWeight: 700, color: '#1a202c', lineHeight: 1.1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }
      }, k.valor == null ? '—' : String(k.valor)),
      k.sub ? React.createElement('div', {
        style: { fontSize: 11, color: 'var(--text-3)', marginTop: 3 },
      }, k.sub) : null
    )
  );
}

// Devuelve la versión soft de un color de STATS_COLORS.
function softColor(hex) {
  var map = {
    '#4361ee': STATS_COLORS.primarySoft, '#0f7d3a': STATS_COLORS.successSoft,
    '#c79800': STATS_COLORS.warnSoft,    '#b02a2a': STATS_COLORS.dangerSoft,
    '#4a5568': STATS_COLORS.neutralSoft, '#3182ce': STATS_COLORS.infoSoft,
    '#6f4ecc': STATS_COLORS.purpleSoft,  '#0d9488': STATS_COLORS.tealSoft,
  };
  return map[hex] || '#f4f6f8';
}

// ─── Leyenda para gráficos ────────────────────────────────────────────────
function Leyenda(items) {
  return React.createElement('div', {
    style: { display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-3)', alignItems: 'center' }
  },
    items.map(function (l, i) {
      return React.createElement('span', {
        key: i,
        style: { display: 'inline-flex', alignItems: 'center', gap: 6 }
      },
        React.createElement('span', {
          style: { width: 10, height: 10, background: l.color, borderRadius: 3, display: 'inline-block' }
        }),
        l.label);
    })
  );
}

// ─── Barra vertical (mensual) ─────────────────────────────────────────────
function BarChart(data, opts) {
  if (!data.length) return React.createElement('div', {
    style: { padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }
  }, 'Sin datos en el período.');

  var maxV = Math.max.apply(null, data.map(function (d) { return d[opts.valueKey] || 0; }));
  if (maxV === 0) maxV = 1; // evita división por cero

  // Escala Y con "nice" round: divisiones de 25/50/100 según magnitud.
  function nextNice(v) {
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var norm = v / mag;
    var nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * mag;
  }
  var maxNice = nextNice(maxV);
  var pasos = [0, maxNice * 0.25, maxNice * 0.5, maxNice * 0.75, maxNice];

  var altoGrafico = 200;
  var anchoLabel = 40;

  return React.createElement('div', {
    style: { display: 'flex', gap: 6, height: altoGrafico + 40, marginTop: 8 }
  },
    // Eje Y
    React.createElement('div', {
      style: { width: anchoLabel, position: 'relative', height: altoGrafico }
    },
      pasos.slice().reverse().map(function (v, i) {
        var top = (i / (pasos.length - 1)) * altoGrafico;
        return React.createElement('div', {
          key: i,
          style: {
            position: 'absolute', top: top - 8, right: 4,
            fontSize: 10, color: 'var(--text-3)',
          }
        }, Math.round(v));
      })
    ),
    // Barras + líneas de grid
    React.createElement('div', {
      style: { flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }
    },
      // Grid horizontal
      React.createElement('div', {
        style: { position: 'absolute', inset: 0, height: altoGrafico, pointerEvents: 'none' }
      },
        pasos.map(function (_, i) {
          var top = ((pasos.length - 1 - i) / (pasos.length - 1)) * altoGrafico;
          return React.createElement('div', {
            key: i,
            style: {
              position: 'absolute', top: top, left: 0, right: 0,
              borderTop: '1px dashed #edf0f3',
            }
          });
        })
      ),
      // Barras
      React.createElement('div', {
        style: {
          display: 'flex', alignItems: 'flex-end', gap: 6,
          height: altoGrafico, position: 'relative',
        }
      },
        data.map(function (d, i) {
          var v = d[opts.valueKey] || 0;
          var vExtra = (d[opts.extraKey] || 0);
          var hMain = maxNice > 0 ? (v / maxNice) * altoGrafico : 0;
          var hExtra = maxNice > 0 ? (vExtra / maxNice) * altoGrafico : 0;
          return React.createElement('div', {
            key: i, className: 'stats-bar',
            style: {
              flex: 1, height: '100%', position: 'relative',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              alignItems: 'center', gap: 2,
            },
            title: (d[opts.xKey] || '') + ': ' + v + (opts.extraKey ? '  (OAA ' + vExtra + ')' : ''),
          },
            // Valor arriba de la barra
            v > 0 ? React.createElement('div', {
              style: {
                position: 'absolute', top: altoGrafico - hMain - 16,
                fontSize: 10, fontWeight: 700, color: '#1a202c',
              }
            }, v) : null,
            // Barra total
            React.createElement('div', {
              style: {
                width: '85%', height: hMain,
                background: 'linear-gradient(180deg, ' + opts.colorMain + ' 0%, ' + shade(opts.colorMain, -10) + ' 100%)',
                borderRadius: '4px 4px 0 0', position: 'relative',
              }
            },
              // Barra OAA superpuesta al pie
              opts.extraKey && vExtra > 0 ? React.createElement('div', {
                style: {
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: hExtra > hMain ? '100%' : (hExtra / hMain * 100) + '%',
                  background: 'linear-gradient(180deg, ' + opts.colorExtra + ' 0%, ' + shade(opts.colorExtra, -10) + ' 100%)',
                  borderRadius: hExtra >= hMain ? '4px 4px 0 0' : '0',
                }
              }) : null
            )
          );
        })
      ),
      // Eje X (labels mes)
      React.createElement('div', {
        style: { display: 'flex', gap: 6, marginTop: 8, paddingLeft: 0, paddingRight: 0 }
      },
        data.map(function (d, i) {
          return React.createElement('div', {
            key: i,
            style: {
              flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--text-3)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }
          }, d[opts.xKey]);
        })
      )
    )
  );
}

// Oscurece un color hex por delta% (–10 = 10% más oscuro).
function shade(hex, delta) {
  var m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  var num = parseInt(m[1], 16);
  var r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  var f = 1 + delta / 100;
  r = Math.max(0, Math.min(255, Math.round(r * f)));
  g = Math.max(0, Math.min(255, Math.round(g * f)));
  b = Math.max(0, Math.min(255, Math.round(b * f)));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ─── Barras horizontales ──────────────────────────────────────────────────
function HorizontalBars(data, labelKey, valueKey, color) {
  color = color || STATS_COLORS.primary;
  if (!data || data.length === 0) {
    return React.createElement('div', {
      style: { padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }
    }, 'Sin datos.');
  }
  var maxV = Math.max.apply(null, data.map(function (d) { return d[valueKey] || 0; }));
  if (maxV === 0) maxV = 1;
  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }
  },
    data.map(function (d, i) {
      var v = d[valueKey] || 0;
      var w = (v / maxV) * 100;
      var lab = window.LabStore && window.LabStore.labels && window.LabStore.labels[d[labelKey]]
        ? window.LabStore.labels[d[labelKey]] : d[labelKey];
      return React.createElement('div', {
        key: i,
        style: { display: 'grid', gridTemplateColumns: '160px 1fr 44px', gap: 10, alignItems: 'center' }
      },
        React.createElement('div', {
          style: {
            fontSize: 12, color: '#2d3748', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          },
          title: lab,
        }, lab),
        React.createElement('div', {
          style: {
            background: '#f1f3f5', height: 16, borderRadius: 4, position: 'relative', overflow: 'hidden',
          }
        },
          React.createElement('div', {
            style: {
              width: w + '%', height: '100%',
              background: 'linear-gradient(90deg, ' + color + ' 0%, ' + shade(color, 8) + ' 100%)',
              borderRadius: 4, transition: 'width .4s ease',
            }
          })
        ),
        React.createElement('div', {
          style: { fontSize: 12, fontWeight: 600, color: '#1a202c', textAlign: 'right' }
        }, fmtNum(v))
      );
    })
  );
}

window.StatsScreen = StatsScreen;
