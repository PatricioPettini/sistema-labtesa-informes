/* LABTESA — componentes compuestos: layout, tabla editable, toggles, banner, QA */

/* ============ CARD / SECTION ============ */
function Card(props) {
  return React.createElement('div', { className: 'card' + (props.className ? ' ' + props.className : ''), style: props.style }, props.children);
}
function CardHead(props) {
  return React.createElement('div', { className: 'card-head' },
    React.createElement('div', { className: 'card-head-l' },
      props.icon ? React.createElement('span', { className: 'card-head-icon' }, React.createElement(Icon, { name: props.icon, size: 17 })) : null,
      React.createElement('div', null,
        React.createElement('h3', { className: 'card-title' }, props.title),
        props.sub ? React.createElement('p', { className: 'card-sub' }, props.sub) : null
      )
    ),
    props.action ? React.createElement('div', { className: 'card-head-r' }, props.action) : null
  );
}

/* ============ FORM SECTION ============ */
function FormSection(props) {
  var _o = React.useState(true); var open = _o[0], setOpen = _o[1];
  return React.createElement('section', { className: 'form-sec' },
    React.createElement('button', { className: 'form-sec-head', onClick: function () { setOpen(!open); } },
      React.createElement(Icon, { name: 'chevronDown', size: 16, className: 'form-sec-chev' + (open ? '' : ' closed') }),
      React.createElement('span', null, props.title),
      props.badge ? React.createElement('span', { className: 'form-sec-badge' }, props.badge) : null
    ),
    open ? React.createElement('div', { className: 'form-sec-body' }, props.children) : null
  );
}

/* ============ VARIANT TOGGLE (pills) ============ */
function VariantToggle(props) {
  return React.createElement('div', { className: 'variant-toggle' },
    (props.options || []).map(function (o) {
      var active = props.value === o.id;
      return React.createElement('button', {
        key: o.id, className: 'variant-pill' + (active ? ' active' : ''),
        onClick: function () { props.onChange(o.id); },
      },
        React.createElement('span', { className: 'variant-pill-label' }, o.label),
        o.sub ? React.createElement('span', { className: 'variant-pill-sub' }, o.sub) : null,
        active ? React.createElement(Icon, { name: 'check', size: 14, strokeWidth: 2.4, className: 'variant-pill-check' }) : null
      );
    })
  );
}

/* ============ DATA TABLE EDITABLE ============ */
function DataTable(props) {
  var cols = props.columns, rows = props.rows;
  function setCell(ri, key, val) {
    var next = rows.map(function (r, i) { return i === ri ? Object.assign({}, r, defObj(key, val)) : r; });
    props.onChange(next);
  }
  function defObj(k, v) { var o = {}; o[k] = v; return o; }
  function addRow() {
    var blank = {};
    cols.forEach(function (c) { blank[c.key] = c.key === 'probeta' || c.key === 'nombre' || c.key === 'muestra' ? String(rows.length + 1) : ''; });
    props.onChange(rows.concat([blank]));
  }
  function delRow(ri) { props.onChange(rows.filter(function (_, i) { return i !== ri; })); }
  function dupRow(ri) {
    var copy = Object.assign({}, rows[ri]);
    var next = rows.slice(); next.splice(ri + 1, 0, copy); props.onChange(next);
  }

  var minW = cols.reduce(function (a, c) { return a + (c.w || 110); }, 0) + 96;

  return React.createElement('div', { className: 'dt-wrap' },
    React.createElement('div', { className: 'dt-scroll' },
      React.createElement('table', { className: 'dt', style: { minWidth: minW } },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { className: 'dt-idx' }, '#'),
            cols.map(function (c) { return React.createElement('th', { key: c.key, style: { width: c.w } }, c.label); }),
            React.createElement('th', { className: 'dt-act' }, '')
          )
        ),
        React.createElement('tbody', null,
          rows.length === 0 ? React.createElement('tr', null,
            React.createElement('td', { className: 'dt-empty', colSpan: cols.length + 2 },
              React.createElement('div', { className: 'dt-empty-ic' }, React.createElement(Icon, { name: 'fileDoc', size: 22, strokeWidth: 1.5 })),
              'Todavía no agregaste filas. Usá ',
              React.createElement('strong', { style: { color: 'var(--accent)' } }, 'Agregar fila'),
              ' para empezar.'
            )
          ) : null,
          rows.map(function (row, ri) {
            return React.createElement('tr', { key: ri },
              React.createElement('td', { className: 'dt-idx' }, ri + 1),
              cols.map(function (c) {
                var enabled = c.enabledIf ? !!c.enabledIf(row) : true;
                if (!enabled) {
                  return React.createElement('td', { key: c.key },
                    React.createElement('span', { className: 'dt-cell-disabled', title: 'No aplica' }, '—'));
                }
                var empty = row[c.key] == null || String(row[c.key]).trim() === '';
                var mark = props.markEmpty && empty && !c.enabledIf; // no marcar columnas condicionales
                return React.createElement('td', { key: c.key },
                  c.type === 'select'
                    ? React.createElement(CellSelect, { value: row[c.key], options: c.options, mark: mark, onChange: function (v) { setCell(ri, c.key, v); } })
                    : React.createElement('input', {
                        className: 'dt-input' + (c.type === 'number' ? ' num' : '') + (mark ? ' invalid' : ''),
                        type: c.type === 'number' ? 'number' : 'text',
                        placeholder: c.placeholder || '',
                        value: row[c.key] == null ? '' : row[c.key],
                        onChange: function (e) { setCell(ri, c.key, e.target.value); },
                      })
                );
              }),
              React.createElement('td', { className: 'dt-act' },
                React.createElement('div', { className: 'dt-row-actions' },
                  React.createElement('button', { className: 'dt-iconbtn', title: 'Duplicar fila', onClick: function () { dupRow(ri); } }, React.createElement(Icon, { name: 'copy', size: 14 })),
                  React.createElement('button', { className: 'dt-iconbtn danger', title: 'Eliminar fila', onClick: function () { delRow(ri); } }, React.createElement(Icon, { name: 'trash', size: 14 }))
                )
              )
            );
          })
        )
      )
    ),
    React.createElement('button', { className: 'dt-addrow', onClick: addRow },
      React.createElement(Icon, { name: 'plus', size: 15 }), 'Agregar fila')
  );
}

function CellSelect(props) {
  var v = props.value || '';
  var tone = v === 'Aprobado' ? 'ok' : v === 'No aprobado' ? 'bad' : '';
  return React.createElement('div', { className: 'select-wrap dt-select ' + tone + (props.mark ? ' invalid' : '') },
    React.createElement('select', { value: v, onChange: function (e) { props.onChange(e.target.value); } },
      React.createElement('option', { value: '' }, '—'),
      (props.options || []).map(function (o) { return React.createElement('option', { key: o, value: o }, o); })
    ),
    React.createElement(Icon, { name: 'chevronDown', size: 13, className: 'select-chev' })
  );
}

/* ============ VERTICAL DATA TABLE (parámetros=filas, muestras=columnas) ============ */
function VerticalDataTable(props) {
  var filas = props.filas || [];
  var samples = props.rows || [];

  function setCell(si, key, val) {
    var next = samples.map(function (s, i) {
      if (i !== si) return s;
      var n = Object.assign({}, s); n[key] = val; return n;
    });
    props.onChange(next);
  }
  function addSample() {
    var blank = {};
    filas.forEach(function (f) { blank[f.key] = ''; });
    props.onChange(samples.concat([blank]));
  }
  function delSample(si) { props.onChange(samples.filter(function (_, i) { return i !== si; })); }

  // Detecta si las filas tienen patrón "Nombre (Símbolo)" — típico de químicos.
  // En ese caso usa render compacto con chip del símbolo.
  var isElementTable = filas.length > 8 && filas.every(function (f) { return /\([A-Z][a-z]?[0-9]?\)\s*$/.test(f.label || ''); });
  var verticalClass = 'dt dt-vertical' + (isElementTable ? ' dt-compact' : '');
  function renderLabel(fila) {
    if (!isElementTable) return React.createElement('span', null, fila.label);
    var m = (fila.label || '').match(/^(.*?)\s*\(([A-Za-z0-9]+)\)\s*$/);
    if (!m) return React.createElement('span', null, fila.label);
    return React.createElement('div', { className: 'dt-elem' },
      React.createElement('span', { className: 'dt-elem-sym' }, m[2]),
      React.createElement('span', { className: 'dt-elem-name' }, m[1])
    );
  }
  return React.createElement('div', { className: 'dt-wrap' },
    React.createElement('div', { className: 'dt-scroll' },
      React.createElement('table', { className: verticalClass },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', { style: { minWidth: 230 } }, isElementTable ? 'Elemento' : 'Parámetro'),
            samples.map(function (_, si) {
              return React.createElement('th', { key: si, style: { minWidth: 140 } },
                React.createElement('div', { className: 'dt-muestra-head' },
                  React.createElement('span', { className: 'dt-muestra-chip' },
                    React.createElement('span', { className: 'dt-muestra-chip-n' }, 'M' + (si + 1))
                  ),
                  React.createElement('button', { className: 'dt-iconbtn danger', title: 'Eliminar muestra', onClick: function () { delSample(si); } },
                    React.createElement(Icon, { name: 'trash', size: 13 }))
                )
              );
            }),
            React.createElement('th', { className: 'dt-act' }, '')
          )
        ),
        React.createElement('tbody', null,
          samples.length === 0 ? React.createElement('tr', null,
            React.createElement('td', { className: 'dt-empty', colSpan: 2 },
              React.createElement('div', { className: 'dt-empty-ic' }, React.createElement(Icon, { name: 'flask', size: 22, strokeWidth: 1.5 })),
              'Todavía no cargaste muestras. Usá ',
              React.createElement('strong', { style: { color: 'var(--accent)' } }, 'Agregar muestra'),
              ' para empezar.'
            )
          ) : null,
          filas.map(function (fila) {
            return React.createElement('tr', { key: fila.key },
              React.createElement('td', { style: { whiteSpace: 'nowrap' } }, renderLabel(fila)),
              samples.map(function (sample, si) {
                var val = sample[fila.key];
                var empty = val == null || String(val).trim() === '';
                var mark = props.markEmpty && empty;
                // En la tabla de elementos químicos usamos input de texto (acepta
                // valores tipo "<0.02", "tr", etc.) pero con estilo numérico.
                var esQuimicoNumerico = isElementTable && fila.type === 'number';
                var useNumClass = fila.type === 'number' || esQuimicoNumerico;
                var inputType = esQuimicoNumerico ? 'text' : (fila.type === 'number' ? 'number' : 'text');
                return React.createElement('td', { key: si },
                  fila.type === 'select'
                    ? React.createElement(CellSelect, { value: val, options: fila.options, mark: mark, onChange: function (v) { setCell(si, fila.key, v); } })
                    : React.createElement('input', {
                        className: 'dt-input' + (useNumClass ? ' num' : '') + (mark ? ' invalid' : ''),
                        type: inputType,
                        inputMode: esQuimicoNumerico ? 'decimal' : undefined,
                        placeholder: esQuimicoNumerico ? '0.00 o <0.02' : '',
                        value: val == null ? '' : val,
                        onChange: function (e) { setCell(si, fila.key, e.target.value); }
                      })
                );
              }),
              React.createElement('td', { className: 'dt-act' })
            );
          })
        )
      )
    ),
    React.createElement('button', { className: 'dt-addrow', onClick: addSample },
      React.createElement(Icon, { name: 'plus', size: 15 }), 'Agregar muestra')
  );
}

/* ============ LADOS EDITOR (muestras agrupadas por lado — tracción opt-in) ============ */
function LadosEditor(props) {
  var lados = props.lados || [];
  var filas = props.filas || [];

  function update(i, next) {
    props.onChange(lados.map(function (l, idx) { return idx === i ? next : l; }));
  }
  function addLado() {
    props.onChange(lados.concat([{ nombre: '', muestras: [] }]));
  }
  function delLado(i) {
    props.onChange(lados.filter(function (_, idx) { return idx !== i; }));
  }

  return React.createElement('div', { className: 'lados-editor' },
    lados.length === 0 ? React.createElement('div', { className: 'lados-empty' },
      React.createElement(Icon, { name: 'layers', size: 26, strokeWidth: 1.5 }),
      React.createElement('div', { className: 'lados-empty-title' }, 'Sin lados cargados'),
      React.createElement('div', { className: 'lados-empty-sub' }, 'Agregá un lado (ej: Liso, Arandela, Cabeza) y cargá sus muestras adentro.'),
    ) : null,
    lados.map(function (lado, i) {
      return React.createElement('div', { key: i, className: 'lado-card' },
        React.createElement('div', { className: 'lado-head' },
          React.createElement('span', { className: 'lado-num' }, 'Lado ' + (i + 1)),
          React.createElement('input', {
            className: 'input lado-name',
            placeholder: 'Nombre del lado (ej: Liso, Arandela)',
            value: lado.nombre || '',
            onChange: function (e) { update(i, Object.assign({}, lado, { nombre: e.target.value })); },
          }),
          React.createElement('button', { className: 'lado-del', title: 'Eliminar lado',
            onClick: function () { delLado(i); } },
            React.createElement(Icon, { name: 'trash', size: 14 }))
        ),
        React.createElement(VerticalDataTable, {
          filas: filas,
          rows: lado.muestras || [],
          markEmpty: props.markEmpty,
          onChange: function (next) { update(i, Object.assign({}, lado, { muestras: next })); },
        })
      );
    }),
    React.createElement('button', { className: 'lados-addbtn', onClick: addLado },
      React.createElement(Icon, { name: 'plus', size: 16 }), 'Agregar lado')
  );
}

/* ============ OT BANNER ============ */
function OTBanner(props) {
  var ot = props.ot;
  return React.createElement('div', { className: 'ot-banner' },
    React.createElement('div', { className: 'ot-banner-item' },
      React.createElement('span', { className: 'ot-banner-k' }, 'OT'),
      React.createElement('span', { className: 'ot-banner-v mono' }, ot.nro_ot)),
    React.createElement('div', { className: 'ot-banner-div' }),
    React.createElement('div', { className: 'ot-banner-item' },
      React.createElement('span', { className: 'ot-banner-k' }, 'Solicitud'),
      React.createElement('span', { className: 'ot-banner-v mono' }, ot.nro_solicitud || '—')),
    React.createElement('div', { className: 'ot-banner-div' }),
    React.createElement('div', { className: 'ot-banner-item grow' },
      React.createElement('span', { className: 'ot-banner-k' }, 'Cliente'),
      React.createElement('span', { className: 'ot-banner-v' }, ot.razon_social)),
    ot.es_preinforme ? React.createElement(StatusChip, { tone: 'warning', icon: 'alertTri' }, 'Preinforme') : null
  );
}

/* ============ QA PANEL ============ */
function QAPanel(props) {
  var qa = props.qa; // { errores:[], warnings:[], correcciones:[] }
  if (!qa) return null;
  var groups = [
    { key: 'errores', tone: 'danger', icon: 'alertCircle', label: 'Errores', items: qa.errores || [] },
    { key: 'warnings', tone: 'warning', icon: 'alertTri', label: 'Advertencias', items: qa.warnings || [] },
    { key: 'correcciones', tone: 'success', icon: 'checkCircle', label: 'Autocorrecciones', items: qa.correcciones || [] },
  ];
  var clean = (qa.errores || []).length === 0 && (qa.warnings || []).length === 0;
  return React.createElement('div', { className: 'qa-panel' },
    React.createElement('div', { className: 'qa-head' },
      React.createElement(Icon, { name: 'clipboard', size: 16 }),
      React.createElement('span', null, 'Control de calidad'),
      React.createElement('span', { className: 'qa-summary' },
        clean ? React.createElement(StatusChip, { tone: 'success', size: 'sm', icon: 'check' }, 'Sin bloqueos')
          : React.createElement(StatusChip, { tone: 'danger', size: 'sm', icon: 'alertCircle' }, (qa.errores || []).length + ' error(es)'))
    ),
    groups.map(function (g) {
      if (!g.items.length) return null;
      return React.createElement('div', { key: g.key, className: 'qa-group qa-' + g.tone },
        g.items.map(function (it, i) {
          return React.createElement('div', { key: i, className: 'qa-line' },
            React.createElement(Icon, { name: g.icon, size: 15, strokeWidth: 2 }),
            React.createElement('span', null, it));
        })
      );
    })
  );
}

/* ============ EMPTY STATE ============ */
function EmptyState(props) {
  return React.createElement('div', { className: 'empty' },
    React.createElement('div', { className: 'empty-icon' }, React.createElement(Icon, { name: props.icon || 'inbox', size: 30, strokeWidth: 1.5 })),
    React.createElement('h3', null, props.title),
    props.message ? React.createElement('p', null, props.message) : null,
    props.action ? React.createElement('div', { className: 'empty-action' }, props.action) : null
  );
}

/* ============ BREADCRUMB ============ */
function Breadcrumb(props) {
  return React.createElement('nav', { className: 'breadcrumb' },
    props.items.map(function (it, i) {
      var last = i === props.items.length - 1;
      return React.createElement(React.Fragment, { key: i },
        last
          ? React.createElement('span', { className: 'crumb current' }, it.label)
          : React.createElement('a', { className: 'crumb', href: it.href, onClick: function (e) { if (it.onClick) { e.preventDefault(); it.onClick(); } } }, it.label),
        last ? null : React.createElement(Icon, { name: 'chevronRight', size: 14, className: 'crumb-sep' })
      );
    })
  );
}

/* ============ THEME TOGGLE ============ */
function ThemeToggle() {
  var initial = (window.LabTheme && window.LabTheme.get()) || 'light';
  var _t = React.useState(initial); var theme = _t[0], setTheme = _t[1];
  var isDark = theme === 'dark';
  function onClick() {
    var next = window.LabTheme.toggle();
    setTheme(next);
  }
  return React.createElement('button', {
    className: 'sidebar-reset',
    title: isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro',
    onClick: onClick,
  },
    React.createElement(Icon, { name: isDark ? 'sun' : 'moon', size: 14 }),
    isDark ? 'Modo claro' : 'Modo oscuro'
  );
}

/* ============ SIDEBAR ============ */
function Sidebar(props) {
  var items = [
    { id: 'solicitudes', label: 'Solicitudes', icon: 'inbox', route: '#/' },
    { id: 'clientes', label: 'Clientes', icon: 'building', route: '#/clientes' },
    { id: 'equipos', label: 'Equipos', icon: 'gauge', route: '#/equipos' },
    { id: 'normas', label: 'Normas e ITM', icon: 'fileText', route: '#/normas' },
    { id: 'stats', label: 'Estadísticas', icon: 'dashboard', route: '#/stats' },
    { id: 'auditoria', label: 'Auditoría', icon: 'shield', route: '#/auditoria' },
    { id: 'admin', label: 'Administración', icon: 'lock', route: '#/admin' },
  ];
  return React.createElement('aside', { className: 'sidebar' },
    React.createElement('div', { className: 'sidebar-brand' },
      React.createElement('img', { src: 'assets/labtesa-logo.jpg', alt: 'LABTESA', className: 'brand-logo' })
    ),
    props.onSearchClick ? React.createElement('button', {
      onClick: props.onSearchClick,
      style: {
        margin: '8px 14px 4px', padding: '7px 10px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        fontSize: 12, color: 'var(--text-3)', width: 'calc(100% - 28px)'
      },
      title: 'Buscar (Ctrl+K)'
    },
      React.createElement(Icon, { name: 'search', size: 14 }),
      React.createElement('span', { style: { flex: 1, textAlign: 'left' } }, 'Buscar…'),
      React.createElement('span', { style: {
        fontFamily: 'ui-monospace, monospace', fontSize: 10, padding: '2px 5px',
        background: 'var(--surface-3)', borderRadius: 3
      } }, 'Ctrl K')
    ) : null,
    React.createElement('div', { className: 'sidebar-sectlabel' }, 'Operación'),
    React.createElement('nav', { className: 'sidebar-nav' },
      items.map(function (it) {
        var active = props.active === it.id;
        return React.createElement('a', {
          key: it.id, className: 'nav-item' + (active ? ' active' : ''),
          href: it.route,
        },
          React.createElement(Icon, { name: it.icon, size: 18 }),
          React.createElement('span', null, it.label)
        );
      })
    ),
    React.createElement('div', { className: 'sidebar-foot' },
      React.createElement('div', { className: 'sidebar-user' },
        React.createElement('div', { className: 'avatar' }, 'LT'),
        React.createElement('div', { className: 'sidebar-user-info' },
          React.createElement('span', { className: 'sidebar-user-name' }, 'Lab. Tracción'),
          React.createElement('span', { className: 'sidebar-user-role' }, 'Técnico · CABA')
        )
      ),
      React.createElement(ThemeToggle, null),
      React.createElement('button', { className: 'sidebar-reset', title: 'Restablecer datos de demostración', onClick: props.onReset },
        React.createElement(Icon, { name: 'refresh', size: 14 }), 'Reset demo')
    )
  );
}

Object.assign(window, {
  Card: Card, CardHead: CardHead, FormSection: FormSection, VariantToggle: VariantToggle,
  DataTable: DataTable, VerticalDataTable: VerticalDataTable, LadosEditor: LadosEditor,
  OTBanner: OTBanner, QAPanel: QAPanel, EmptyState: EmptyState,
  Breadcrumb: Breadcrumb, Sidebar: Sidebar,
});
