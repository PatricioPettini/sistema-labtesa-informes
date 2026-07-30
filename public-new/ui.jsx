/* LABTESA — primitivos de UI: iconos, botones, campos, chips, toasts, modal */

/* ============ ICONOS (línea, stroke 1.75, viewBox 24) ============ */
var ICON_PATHS = {
  dashboard: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 10h16"/>',
  fileText: '<path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M9 13h6M9 17h6"/>',
  fileDoc: '<path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M8.5 12.5l1 4 1.2-3 1.2 3 1-4"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/>',
  pencil: '<path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17z"/><path d="M14.5 6.5l3 3"/>',
  upload: '<path d="M12 16V5M8 9l4-4 4 4M4 19h16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 4v4h-4"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
  alertTri: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17.5v.5"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5L16 9"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z"/><path d="m9.5 13 1.5 1.5L14.5 11"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a1.5 1.5 0 0 0 1.3 2.2h11.4A1.5 1.5 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/>',
  externalLink: '<path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.5 1.5 0 0 0 .3 1.6l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.5 1.5 0 0 0-2.5.6 1.5 1.5 0 0 0-1 1.4V22a2 2 0 1 1-4 0v-.1a1.5 1.5 0 0 0-2.6-1 1.5 1.5 0 0 0-1.6.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.5 1.5 0 0 0-.6-2.5 1.5 1.5 0 0 0-1.4-1H2a2 2 0 1 1 0-4h.1a1.5 1.5 0 0 0 1-2.6 1.5 1.5 0 0 0-.3-1.6l-.1-.1A2 2 0 1 1 5.5 2.6l.1.1a1.5 1.5 0 0 0 2.5-.6V2a2 2 0 1 1 4 0v.1a1.5 1.5 0 0 0 2.6 1 1.5 1.5 0 0 0 1.6.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.5 1.5 0 0 0 .6 2.5h.1a2 2 0 1 1 0 4h-.1a1.5 1.5 0 0 0-1.4 1z"/>',
  sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5M3 18l9 5 9-5"/>',
  beaker: '<path d="M9 3h6M9 3v5L5 18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2L15 8V3"/><circle cx="12" cy="15" r="1"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1.5" transform="rotate(0)"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  gauge: '<path d="M12 14a9 9 0 1 1 8.5-6"/><path d="M12 14l4-4"/><circle cx="12" cy="14" r="1.2"/>',
  bend: '<path d="M4 6v8a4 4 0 0 0 4 4h12"/><path d="m16 14 4 4-4 4"/>',
  split: '<path d="M12 3v6M12 9l-4 4M12 9l4 4M8 13v8M16 13v8"/>',
  atom: '<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/>',
  microscope: '<path d="M6 18h10M9 18v-3M9 15a4 4 0 0 0 4-4M11 5l3 3-2 2-3-3z"/><path d="M8 8l-2 2"/><path d="M4 21h16"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  filter: '<path d="M3 5h18l-7 8v5l-4 2v-7z"/>',
  inbox: '<path d="M4 13h4l1.5 3h5L16 13h4"/><path d="M4 13 6 5h12l2 8v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  link: '<path d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  save: '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 21v-7h8v7"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderOpen: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v3H3z"/><path d="M3 9h18l-2 9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7-2.6"/>',
  file: '<path d="M14 3v5h5"/><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>',
  edit: '<path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17z"/><path d="M14.5 6.5l3 3"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  delete: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  sun:    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:   '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z"/>',
  tag:    '<path d="M20.6 12.6 12 21.2a2 2 0 0 1-2.8 0l-6.4-6.4a2 2 0 0 1 0-2.8L11.4 3.4A2 2 0 0 1 12.8 3H20a1 1 0 0 1 1 1v7.2a2 2 0 0 1-.4 1.4z"/><circle cx="16" cy="8" r="1.2"/>',
};

function Icon(props) {
  var name = props.name, size = props.size || 18, sw = props.strokeWidth || 1.75;
  var paths = ICON_PATHS[name] || '';
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round',
    className: props.className, style: props.style,
    dangerouslySetInnerHTML: { __html: paths },
  });
}

// Mapa tipo de ensayo -> icono
var ENSAYO_ICON = {
  traccion: 'split', impacto: 'gauge', plegado: 'bend', 'nick-break': 'layers',
  quimicos: 'atom', 'dureza-brinell': 'ruler', 'dureza-vickers': 'ruler', 'ferrita-delta': 'microscope',
  microestructura: 'microscope', 'tamano-grano': 'microscope', inclusiones: 'microscope',
  'estructura-grafito': 'microscope', 'espesor-capa': 'microscope', decarburacion: 'microscope',
  'defectos-superficiales': 'microscope', porosidad: 'microscope',
  macrografia: 'microscope',
  rugosidad: 'ruler',
  varios: 'microscope',
  'liquidos-penetrantes': 'microscope',
  'metalografia-general': 'microscope',
  'anexo-metalografico':  'microscope',
  'tratamientos-termicos': 'flask',
};

/* ============ BOTÓN ============ */
function Button(props) {
  var variant = props.variant || 'default';
  var size = props.size || 'md';
  var cls = 'btn btn-' + variant + ' btn-' + size + (props.block ? ' btn-block' : '') + (props.className ? ' ' + props.className : '');
  return React.createElement('button', {
    className: cls, onClick: props.onClick, disabled: props.disabled, type: props.type || 'button',
    title: props.title, style: props.style,
  },
    props.loading ? React.createElement('span', { className: 'btn-spin' }) :
      (props.icon ? React.createElement(Icon, { name: props.icon, size: size === 'sm' ? 15 : 17 }) : null),
    props.children ? React.createElement('span', null, props.children) : null
  );
}

/* ============ CAMPO / INPUT ============ */
function Field(props) {
  return React.createElement('label', { className: 'field' + (props.span ? ' field-span-' + props.span : '') },
    props.label ? React.createElement('span', { className: 'field-label' },
      props.label,
      props.required ? React.createElement('span', { className: 'req' }, ' *') : null
    ) : null,
    props.children,
    props.hint ? React.createElement('span', { className: 'field-hint' }, props.hint) : null
  );
}

// Wrapper de <input>. Para type="date" delega a DateInputAR (formato dd/mm/yyyy
// sí o sí, independiente del locale del OS). El modelo sigue trabajando en ISO
// (yyyy-mm-dd) — solo cambia la presentación al usuario.
function TextInput(props) {
  if (props.type === 'date') return React.createElement(DateInputAR, props);
  return React.createElement('input', {
    className: 'input' + (props.mono ? ' mono' : '') + (props.invalid ? ' invalid' : ''),
    type: props.type || 'text', value: props.value == null ? '' : props.value,
    onChange: function (e) { props.onChange && props.onChange(e.target.value); },
    placeholder: props.placeholder, disabled: props.disabled,
    onKeyDown: props.onKeyDown, autoFocus: props.autoFocus, step: props.step,
  });
}

/* Input de fecha argentino: muestra dd/mm/yyyy con máscara. Auto-inserta
   las barras al tipear, valida el rango de día/mes, y expone al modelo el
   ISO yyyy-mm-dd. Incluye un botón calendario que abre un <input type=date>
   nativo oculto para picker rápido.
   Props: value (iso), onChange(iso), invalid, disabled, placeholder. */
function DateInputAR(props) {
  var value = props.value == null ? '' : String(props.value);
  // Convertir ISO → dd/mm/yyyy para mostrar.
  var displayInicial = '';
  var m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) displayInicial = m[3] + '/' + m[2] + '/' + m[1];
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) displayInicial = value;

  var _t = React.useState(displayInicial);
  var texto = _t[0], setTexto = _t[1];
  var pickerRef = React.useRef(null);

  // Si el value cambia por afuera (ej. import Trello), sincronizar el display.
  React.useEffect(function () { setTexto(displayInicial); }, [value]);

  function emit(iso) {
    if (props.onChange) props.onChange(iso);
  }

  function onTypedChange(raw) {
    // Solo dígitos + slashes. Auto-insertar slash tras 2 y 5 dígitos.
    var digits = raw.replace(/[^\d]/g, '').slice(0, 8);
    var out = '';
    if (digits.length > 0) out = digits.slice(0, 2);
    if (digits.length >= 3) out += '/' + digits.slice(2, 4);
    if (digits.length >= 5) out += '/' + digits.slice(4, 8);
    setTexto(out);
    // Si está completo y válido, emitir ISO. Sino, emitir vacío.
    var mm = out.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (mm) {
      var d = parseInt(mm[1], 10), mo = parseInt(mm[2], 10), y = parseInt(mm[3], 10);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 1900 && y <= 2999) {
        emit(y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'));
        return;
      }
    }
    if (out === '') emit('');
  }

  function abrirPicker() {
    if (pickerRef.current && typeof pickerRef.current.showPicker === 'function') {
      try { pickerRef.current.showPicker(); return; } catch (_) {}
    }
    if (pickerRef.current) pickerRef.current.focus();
  }
  function onPickerChange(e) {
    var iso = e.target.value; // yyyy-mm-dd
    if (iso) {
      var mp = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (mp) setTexto(mp[3] + '/' + mp[2] + '/' + mp[1]);
      emit(iso);
    } else { setTexto(''); emit(''); }
  }

  return React.createElement('div', {
    className: 'date-input-ar' + (props.invalid ? ' invalid' : ''),
    style: { position: 'relative', display: 'flex', alignItems: 'stretch' },
  },
    React.createElement('input', {
      className: 'input' + (props.invalid ? ' invalid' : ''),
      type: 'text',
      value: texto,
      onChange: function (e) { onTypedChange(e.target.value); },
      placeholder: props.placeholder || 'dd/mm/aaaa',
      disabled: props.disabled,
      inputMode: 'numeric',
      maxLength: 10,
      style: { flex: 1, paddingRight: 32 },
    }),
    React.createElement('button', {
      type: 'button',
      onClick: abrirPicker,
      disabled: props.disabled,
      title: 'Elegir con calendario',
      style: {
        position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3, #666)',
      },
    }, React.createElement(Icon, { name: 'calendar', size: 15 })),
    // Input date nativo oculto que se usa solo para abrir el picker.
    React.createElement('input', {
      ref: pickerRef,
      type: 'date',
      value: value.slice(0, 10),
      onChange: onPickerChange,
      style: { position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' },
      tabIndex: -1,
      'aria-hidden': true,
    })
  );
}

function Select(props) {
  return React.createElement('div', { className: 'select-wrap' },
    React.createElement('select', {
      className: 'input select', value: props.value == null ? '' : props.value,
      onChange: function (e) { props.onChange && props.onChange(e.target.value); }, disabled: props.disabled,
    },
      props.placeholder ? React.createElement('option', { value: '' }, props.placeholder) : null,
      (props.options || []).map(function (o) {
        var val = typeof o === 'string' ? o : o.value;
        var lab = typeof o === 'string' ? o : o.label;
        return React.createElement('option', { key: val, value: val }, lab);
      })
    ),
    React.createElement(Icon, { name: 'chevronDown', size: 15, className: 'select-chev' })
  );
}

function Textarea(props) {
  return React.createElement('textarea', {
    className: 'input textarea', value: props.value == null ? '' : props.value, rows: props.rows || 3,
    onChange: function (e) { props.onChange && props.onChange(e.target.value); },
    placeholder: props.placeholder, disabled: props.disabled,
  });
}

/* ============ COMBO INPUT (datalist: catálogo + texto libre) ============ */
var _comboSeq = 0;
function ComboInput(props) {
  var idRef = React.useRef(null);
  if (!idRef.current) idRef.current = 'cl' + (++_comboSeq);
  var opts = props.options || [];
  return React.createElement('div', { className: 'combo-input' },
    React.createElement('input', {
      className: 'input' + (props.mono ? ' mono' : ''), list: idRef.current,
      value: props.value == null ? '' : props.value, placeholder: props.placeholder,
      onChange: function (e) { props.onChange && props.onChange(e.target.value); },
      autoComplete: 'off',
    }),
    React.createElement(Icon, { name: 'chevronDown', size: 14, className: 'combo-chev' }),
    React.createElement('datalist', { id: idRef.current },
      opts.map(function (o, i) { return React.createElement('option', { key: i, value: o }); })
    )
  );
}

/* ============ SEARCH INPUT (con debounce) ============ */
function SearchInput(props) {
  var ref = React.useRef(null);
  return React.createElement('div', { className: 'search-input' },
    React.createElement(Icon, { name: 'search', size: 16, className: 'search-icon' }),
    React.createElement('input', {
      className: 'input', placeholder: props.placeholder || 'Buscar…', value: props.value,
      onChange: function (e) {
        var v = e.target.value;
        props.onChangeImmediate && props.onChangeImmediate(v);
        clearTimeout(ref.current);
        ref.current = setTimeout(function () { props.onChange && props.onChange(v); }, props.debounce || 180);
      },
    }),
    props.value ? React.createElement('button', { className: 'search-clear', onClick: function () { props.onChange(''); props.onChangeImmediate && props.onChangeImmediate(''); } },
      React.createElement(Icon, { name: 'x', size: 14 })) : null
  );
}

/* ============ STATUS CHIP ============ */
function StatusChip(props) {
  return React.createElement('span', { className: 'chip chip-' + (props.tone || 'neutral') + (props.size === 'sm' ? ' chip-sm' : '') },
    props.icon ? React.createElement(Icon, { name: props.icon, size: 12, strokeWidth: 2 }) : null,
    props.children
  );
}

// Chip de tipo de ensayo
function EnsayoChip(props) {
  return React.createElement('span', { className: 'ensayo-chip', title: window.LabStore.labels[props.tipo] },
    React.createElement(Icon, { name: ENSAYO_ICON[props.tipo] || 'flask', size: 13, strokeWidth: 1.9 }),
    React.createElement('span', null, props.label || window.LabStore.labels[props.tipo])
  );
}

/* ============ LOADING: ready hook + skeleton ============ */
function useReady(ms) {
  var _r = React.useState(false); var ready = _r[0], setReady = _r[1];
  React.useEffect(function () { var t = setTimeout(function () { setReady(true); }, ms == null ? 280 : ms); return function () { clearTimeout(t); }; }, []);
  return ready;
}
function Skeleton(props) {
  return React.createElement('span', { className: 'skel' + (props.className ? ' ' + props.className : ''), style: { width: props.w, height: props.h || 12, borderRadius: props.r || 5, display: 'inline-block' } });
}

/* ============ TOASTS ============ */
var ToastCtx = React.createContext(null);
function ToastProvider(props) {
  var _t = React.useState([]); var toasts = _t[0], setToasts = _t[1];
  var push = React.useCallback(function (msg, tone) {
    var id = Date.now() + Math.random();
    setToasts(function (t) { return t.concat([{ id: id, msg: msg, tone: tone || 'success' }]); });
    setTimeout(function () { setToasts(function (t) { return t.filter(function (x) { return x.id !== id; }); }); }, 3200);
  }, []);
  return React.createElement(ToastCtx.Provider, { value: push },
    props.children,
    React.createElement('div', { className: 'toast-stack' },
      toasts.map(function (t) {
        var ic = t.tone === 'danger' ? 'alertCircle' : t.tone === 'warning' ? 'alertTri' : 'checkCircle';
        return React.createElement('div', { key: t.id, className: 'toast toast-' + t.tone },
          React.createElement(Icon, { name: ic, size: 17, strokeWidth: 2 }),
          React.createElement('span', null, t.msg));
      })
    )
  );
}
function useToast() { return React.useContext(ToastCtx); }

/* ============ MODAL + CONFIRM ============ */
function Modal(props) {
  React.useEffect(function () {
    function onKey(e) { if (e.key === 'Escape') props.onClose && props.onClose(); }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }, [props.onClose]);
  return React.createElement('div', { className: 'modal-overlay', onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } },
    React.createElement('div', { className: 'modal' + (props.wide ? ' modal-wide' : ''), role: 'dialog' },
      props.children
    )
  );
}

function ConfirmModal(props) {
  var iconName = props.tone === 'success' ? 'checkCircle'
               : props.tone === 'info'    ? 'info'
               : 'alertTri';
  var confirmVariant = props.tone === 'warning' ? 'warning'
                     : props.tone === 'success' ? 'primary'
                     : props.tone === 'info'    ? 'primary'
                     : 'danger';
  return React.createElement(Modal, { onClose: props.onCancel },
    React.createElement('div', { className: 'confirm' },
      React.createElement('div', { className: 'confirm-icon confirm-' + (props.tone || 'danger') },
        React.createElement(Icon, { name: iconName, size: 22, strokeWidth: 2 })),
      React.createElement('div', { className: 'confirm-body' },
        React.createElement('h3', null, props.title),
        // Preservar saltos de línea del mensaje.
        React.createElement('p', { style: { whiteSpace: 'pre-line' } }, props.message)
      )
    ),
    React.createElement('div', { className: 'modal-actions' },
      // Botones extra (para casos con más de 2 opciones). Aparecen a la izquierda
      // del Cancelar. Formato: [{ label, tone?, icon?, onClick }].
      (props.extraButtons || []).map(function (b, i) {
        var variant = b.tone === 'danger' ? 'danger'
                    : b.tone === 'primary' ? 'primary'
                    : b.tone === 'warning' ? 'warning'
                    : 'soft';
        return React.createElement(Button, { key: 'extra-' + i, variant: variant, icon: b.icon, onClick: b.onClick }, b.label);
      }),
      props.hideCancel ? null
        : React.createElement(Button, { variant: 'ghost', onClick: props.onCancel }, props.cancelLabel || 'Cancelar'),
      React.createElement(Button, { variant: confirmVariant, icon: props.confirmIcon, onClick: props.onConfirm }, props.confirmLabel || 'Aceptar')
    )
  );
}

Object.assign(window, {
  Icon: Icon, ICON_PATHS: ICON_PATHS, ENSAYO_ICON: ENSAYO_ICON,
  Button: Button, Field: Field, TextInput: TextInput, DateInputAR: DateInputAR, Select: Select, Textarea: Textarea,
  SearchInput: SearchInput, StatusChip: StatusChip, EnsayoChip: EnsayoChip,
  ToastProvider: ToastProvider, useToast: useToast, Modal: Modal, ConfirmModal: ConfirmModal,
  ComboInput: ComboInput,
  useReady: useReady, Skeleton: Skeleton,
});
