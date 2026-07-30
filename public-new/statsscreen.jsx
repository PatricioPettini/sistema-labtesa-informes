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
  var porMesRaw = stats.porMes || [];
  var porTipo = stats.porTipoEnsayo || [];
  var topClientes = stats.topClientes || [];

  // El endpoint devuelve 24 meses. Separamos en "actual" (últimos 12) y buscamos
  // el mismo mes del año pasado para hacer YoY. Rellenamos meses sin datos con 0
  // para que el eje X quede parejo (evita gaps visuales cuando un mes fue nulo).
  var porMes12 = _ultimosMesesRellenos(porMesRaw, 12);
  var porMes = porMes12.map(function (m) {
    var prevYm = _sumarMeses(m.ym, -12);
    var prev = porMesRaw.find(function (x) { return x.ym === prevYm; });
    return Object.assign({}, m, {
      n_prev:     prev ? (prev.n || 0)     : 0,
      n_oaa_prev: prev ? (prev.n_oaa || 0) : 0,
      _tienePrev: !!prev,
    });
  });

  // KPIs derivados
  var pctFirmadas = (tf.total_ots > 0) ? Math.round((tf.firmadas / tf.total_ots) * 100) : null;
  var ensayosPorOt = (g.total_ots > 0) ? (g.total_ensayos / g.total_ots).toFixed(1) : '—';
  var informesPorMes = porMes.length ? Math.round(porMes.reduce(function (a, m) { return a + (m.n || 0); }, 0) / porMes.length) : null;
  // Crecimiento mes vs mes anterior (el último mes cerrado) para chip de "↑12%".
  var mesActual  = porMes[porMes.length - 1];
  var mesAnterior = porMes[porMes.length - 2];
  var deltaMoM = null;
  if (mesActual && mesAnterior && mesAnterior.n > 0) {
    deltaMoM = Math.round(((mesActual.n - mesAnterior.n) / mesAnterior.n) * 100);
  }
  var deltaYoY = null;
  if (mesActual && mesActual._tienePrev && mesActual.n_prev > 0) {
    deltaYoY = Math.round(((mesActual.n - mesActual.n_prev) / mesActual.n_prev) * 100);
  }

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
          React.createElement('h3', {
            style: { margin: 0, fontSize: 15, color: '#1a202c', display: 'flex', alignItems: 'center', gap: 8 }
          },
            'Informes emitidos por mes',
            deltaMoM != null ? React.createElement('span', {
              title: 'Variación vs mes anterior',
              style: {
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                color: deltaMoM >= 0 ? STATS_COLORS.success : STATS_COLORS.danger,
                background: deltaMoM >= 0 ? STATS_COLORS.successSoft : STATS_COLORS.dangerSoft,
              },
            }, (deltaMoM >= 0 ? '↑' : '↓') + Math.abs(deltaMoM) + '% MoM') : null,
            deltaYoY != null ? React.createElement('span', {
              title: 'Variación vs mismo mes del año pasado',
              style: {
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                color: deltaYoY >= 0 ? STATS_COLORS.success : STATS_COLORS.danger,
                background: deltaYoY >= 0 ? STATS_COLORS.successSoft : STATS_COLORS.dangerSoft,
              },
            }, (deltaYoY >= 0 ? '↑' : '↓') + Math.abs(deltaYoY) + '% YoY') : null
          ),
          React.createElement('p', { style: { margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-3)' } },
            'Últimos 12 meses · click en una barra para ver el detalle en Auditoría')
        ),
        Leyenda([
          { label: 'No acreditados',   color: STATS_COLORS.primary },
          { label: 'Acreditados OAA',  color: STATS_COLORS.success },
          { label: 'Año anterior',     color: STATS_COLORS.neutral, dashed: true },
        ])
      ),
      React.createElement('div', { style: { padding: '4px 16px 16px 16px' } },
        React.createElement(BarChart, {
          data: porMes,
          xKey: 'ym', valueKey: 'n', oaaKey: 'n_oaa',
          prevKey: 'n_prev',
          colorMain: STATS_COLORS.primary, colorExtra: STATS_COLORS.success,
          onBarClick: function (ym) { location.hash = '#/auditoria?mes=' + encodeURIComponent(ym); },
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
    style: { display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-3)', alignItems: 'center', flexWrap: 'wrap' }
  },
    items.map(function (l, i) {
      return React.createElement('span', {
        key: i,
        style: { display: 'inline-flex', alignItems: 'center', gap: 6 }
      },
        l.dashed
          ? React.createElement('span', {
              style: {
                width: 14, height: 0, display: 'inline-block',
                borderTop: '2px dashed ' + l.color,
              },
            })
          : React.createElement('span', {
              style: { width: 10, height: 10, background: l.color, borderRadius: 3, display: 'inline-block' }
            }),
        l.label);
    })
  );
}

// Formatea "2026-07" como "Jul '26" (más legible en el eje X).
var _NOMBRES_MES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function _formatMesCorto(ym) {
  var m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return ym;
  var mes = parseInt(m[2], 10) - 1;
  return _NOMBRES_MES_ES[mes] + ' ‘' + m[1].slice(2);
}
function _formatMesLargo(ym) {
  var nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  var m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return ym;
  return nombres[parseInt(m[2], 10) - 1] + ' ' + m[1];
}
// Suma (o resta) `delta` meses a un string "YYYY-MM". Devuelve "YYYY-MM".
function _sumarMeses(ym, delta) {
  var m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if (!m) return ym;
  var y = parseInt(m[1], 10), mm = parseInt(m[2], 10) - 1 + delta;
  y += Math.floor(mm / 12);
  mm = ((mm % 12) + 12) % 12;
  return y + '-' + String(mm + 1).padStart(2, '0');
}
// Rellena la serie mensual para que tenga N puntos consecutivos hasta el mes
// actual, insertando ceros donde falten datos.
function _ultimosMesesRellenos(rows, n) {
  var hoy = new Date();
  var ymHoy = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var ym = _sumarMeses(ymHoy, -i);
    var found = (rows || []).find(function (r) { return r.ym === ym; });
    out.push(found ? Object.assign({}, found) : { ym: ym, n: 0, n_oaa: 0, n_prel: 0 });
  }
  return out;
}

// ─── Barra vertical (mensual) — stacked (no-OAA + OAA) + línea año anterior ──
// Componente React (no helper). Props: { data, xKey, valueKey (total), oaaKey,
// prevKey, colorMain, colorExtra, onBarClick }.
function BarChart(props) {
  var data = props.data || [];
  var opts = props;
  var _hover = React.useState(null); var hover = _hover[0], setHover = _hover[1];

  if (!data.length) return React.createElement('div', {
    style: { padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }
  }, 'Sin datos en el período.');

  // Escala Y considera tanto el máximo actual como el previo (para que la línea
  // de comparación entre en el gráfico).
  var vals = data.map(function (d) {
    return Math.max(d[opts.valueKey] || 0, d[opts.prevKey] || 0);
  });
  var maxV = Math.max.apply(null, vals);
  if (maxV === 0) maxV = 1;

  function nextNice(v) {
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var norm = v / mag;
    var nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * mag;
  }
  var maxNice = nextNice(maxV);
  var pasos = [0, maxNice * 0.25, maxNice * 0.5, maxNice * 0.75, maxNice];

  var altoGrafico = 220;
  var anchoLabel = 40;

  return React.createElement('div', {
    style: { display: 'flex', gap: 6, height: altoGrafico + 40, marginTop: 8, position: 'relative' }
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
    // Área principal
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
          var total = d[opts.valueKey] || 0;
          var vOaa  = d[opts.oaaKey] || 0;
          var vNoOaa = Math.max(0, total - vOaa);
          var hTotal = maxNice > 0 ? (total / maxNice) * altoGrafico : 0;
          var hOaa   = maxNice > 0 ? (vOaa   / maxNice) * altoGrafico : 0;
          var hNoOaa = maxNice > 0 ? (vNoOaa / maxNice) * altoGrafico : 0;
          var isHover = hover === i;
          var canClick = typeof opts.onBarClick === 'function' && total > 0;
          return React.createElement('div', {
            key: i, className: 'stats-bar',
            style: {
              flex: 1, height: '100%', position: 'relative',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              alignItems: 'center', gap: 2,
              cursor: canClick ? 'pointer' : 'default',
            },
            onMouseEnter: function () { setHover(i); },
            onMouseLeave: function () { setHover(null); },
            onClick: function () { if (canClick) opts.onBarClick(d[opts.xKey]); },
          },
            // Valor arriba de la barra (solo si hover o si es último mes con datos)
            (total > 0 && (isHover || i === data.length - 1)) ? React.createElement('div', {
              style: {
                position: 'absolute', top: altoGrafico - hTotal - 16,
                fontSize: 10, fontWeight: 700, color: '#1a202c',
              }
            }, total) : null,
            // Stack: no-OAA abajo (primary), OAA arriba (success). Renderizamos
            // un contenedor de altura hTotal con dos sub-divs.
            total > 0 ? React.createElement('div', {
              style: {
                width: '80%', height: hTotal,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                borderRadius: '4px 4px 0 0',
                overflow: 'hidden',
                opacity: isHover ? 1 : 0.94,
                transition: 'opacity .12s, transform .12s',
                transform: isHover ? 'translateY(-2px)' : 'none',
                boxShadow: isHover ? '0 4px 8px rgba(15,23,42,.12)' : 'none',
              }
            },
              vOaa > 0 ? React.createElement('div', {
                style: {
                  height: hOaa,
                  background: 'linear-gradient(180deg, ' + opts.colorExtra + ' 0%, ' + shade(opts.colorExtra, -10) + ' 100%)',
                }
              }) : null,
              vNoOaa > 0 ? React.createElement('div', {
                style: {
                  height: hNoOaa,
                  background: 'linear-gradient(180deg, ' + opts.colorMain + ' 0%, ' + shade(opts.colorMain, -10) + ' 100%)',
                }
              }) : null
            ) : null
          );
        })
      ),
      // Línea "año anterior" (dashed) — SVG superpuesto sobre las barras.
      _yoyDashedLine(data, opts, altoGrafico, maxNice),
      // Tooltip (posicionado sobre la barra que se hace hover)
      _tooltip(hover, data, opts, altoGrafico),
      // Eje X (labels mes)
      React.createElement('div', {
        style: { display: 'flex', gap: 6, marginTop: 8, paddingLeft: 0, paddingRight: 0 }
      },
        data.map(function (d, i) {
          return React.createElement('div', {
            key: i,
            style: {
              flex: 1, textAlign: 'center', fontSize: 10,
              color: hover === i ? '#1a202c' : 'var(--text-3)',
              fontWeight: hover === i ? 700 : 400,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }
          }, _formatMesCorto(d[opts.xKey]));
        })
      )
    )
  );
}

// Dibuja la línea dashed con los valores del año anterior sobre las barras.
function _yoyDashedLine(data, opts, altoGrafico, maxNice) {
  if (!opts.prevKey) return null;
  var tienePrev = data.some(function (d) { return (d[opts.prevKey] || 0) > 0; });
  if (!tienePrev) return null;
  // Puntos en unidades de fracción del ancho (0..1 en X, 0..1 en Y).
  // Los renderizamos con SVG absoluto sobre el área de barras.
  var puntos = data.map(function (d, i) {
    var v = d[opts.prevKey] || 0;
    var x = ((i + 0.5) / data.length) * 100;         // % horizontal
    var y = altoGrafico - (v / maxNice) * altoGrafico; // pixels desde arriba
    return { x: x, y: y, v: v };
  });
  var pathD = puntos.map(function (p, i) { return (i === 0 ? 'M ' : 'L ') + p.x + '% ' + p.y; }).join(' ');
  return React.createElement('svg', {
    style: {
      position: 'absolute', top: 0, left: 0, right: 0,
      height: altoGrafico, width: '100%',
      pointerEvents: 'none',
    },
    preserveAspectRatio: 'none',
  },
    React.createElement('path', {
      d: pathD,
      fill: 'none',
      stroke: STATS_COLORS.neutral,
      strokeWidth: 1.5,
      strokeDasharray: '4 3',
      opacity: 0.55,
    }),
    puntos.map(function (p, i) {
      return p.v > 0 ? React.createElement('circle', {
        key: i, cx: p.x + '%', cy: p.y, r: 2.5,
        fill: STATS_COLORS.neutral, opacity: 0.7,
      }) : null;
    })
  );
}

// Panel de tooltip con detalle del mes.
function _tooltip(hoverIdx, data, opts, altoGrafico) {
  if (hoverIdx == null) return null;
  var d = data[hoverIdx];
  if (!d) return null;
  var total = d[opts.valueKey] || 0;
  var vOaa  = d[opts.oaaKey] || 0;
  var vPrev = d[opts.prevKey] || 0;
  var pctOaa = total > 0 ? Math.round((vOaa / total) * 100) : 0;
  var deltaYoY = (vPrev > 0) ? Math.round(((total - vPrev) / vPrev) * 100) : null;
  // Posicionar centrado horizontalmente sobre la barra hovered.
  var leftPct = ((hoverIdx + 0.5) / data.length) * 100;
  return React.createElement('div', {
    style: {
      position: 'absolute',
      left: 'calc(' + leftPct + '% - 90px)',
      top: -8,
      width: 180,
      background: '#1a202c', color: '#fff',
      padding: '8px 10px', borderRadius: 8, fontSize: 11,
      pointerEvents: 'none', zIndex: 5,
      boxShadow: '0 4px 12px rgba(15,23,42,.28)',
      lineHeight: 1.4,
    },
  },
    React.createElement('div', {
      style: { fontWeight: 700, marginBottom: 4, borderBottom: '1px solid #2d3748', paddingBottom: 4 }
    }, _formatMesLargo(d[opts.xKey])),
    React.createElement('div', null, 'Total: ', React.createElement('b', null, total)),
    React.createElement('div', null,
      'OAA: ', React.createElement('b', null, vOaa),
      total > 0 ? React.createElement('span', { style: { color: '#a0aec0' } }, ' (' + pctOaa + '%)') : null),
    vPrev > 0 ? React.createElement('div', { style: { color: '#a0aec0' } },
      'Año anterior: ' + vPrev + (deltaYoY != null ? ' · ' + (deltaYoY >= 0 ? '↑' : '↓') + Math.abs(deltaYoY) + '%' : '')
    ) : null,
    total > 0 ? React.createElement('div', {
      style: { marginTop: 4, fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }
    }, 'Click para filtrar auditoría') : null
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
