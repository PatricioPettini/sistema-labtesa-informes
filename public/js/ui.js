// ui.js — Shared UI helpers: icon SVGs, OT banner builder

function getIcon(name, cls) {
  cls = cls || 'ico';
  const a = `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="${cls}"`;
  const paths = {
    'plus':         '<path d="M12 5v14M5 12h14"/>',
    'search':       '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    'filter':       '<path d="M3 5h18M6 12h12M10 19h4"/>',
    'settings':     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.08a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.06 4.2l.06.06a1.7 1.7 0 0 0 1.87.34h.08a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.8 7.06l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.56 1.03Z"/>',
    'check':        '<path d="M20 6 9 17l-5-5"/>',
    'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    'x':            '<path d="M18 6 6 18M6 6l12 12"/>',
    'x-circle':     '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    'info':         '<circle cx="12" cy="12" r="10"/><path d="M12 8h.01M11 12h1v4h1"/>',
    'warning':      '<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'trash':        '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    'edit':         '<path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
    'eye':          '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    'doc':          '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
    'download':     '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    'upload':       '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
    'trello':       '<rect x="3" y="3" width="18" height="18" rx="3"/><rect x="6" y="6" width="5" height="11" rx="1"/><rect x="13" y="6" width="5" height="7" rx="1"/>',
    'back':         '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'loader':       '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>',
    'image-pl':     '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 16l5-5 4 4M14 14l3-3 4 4"/>',
    'chevron-r':    '<path d="m9 6 6 6-6 6"/>',
    'inbox':        '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
    'crop':         '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
    'user':         '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'calendar':     '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  };
  const inner = paths[name] || '';
  if (!inner) return '';
  return `<svg ${a}>${inner}</svg>`;
}

function buildOtBanner(ot, solicitud, cliente, muestra) {
  return `
    <div class="ot-banner">
      <div class="ot-banner-item">
        <span class="lbl">OT</span>
        <span class="val mono">${ot || '—'}</span>
      </div>
      <div class="ot-banner-divider"></div>
      <div class="ot-banner-item">
        <span class="lbl">Solicitud</span>
        <span class="val mono">${solicitud || '—'}</span>
      </div>
      <div class="ot-banner-divider"></div>
      <div class="ot-banner-item" style="flex:1;min-width:0">
        <span class="lbl">Cliente</span>
        <span class="val" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cliente || '—'}</span>
      </div>
      <div class="ot-banner-divider"></div>
      <div class="ot-banner-item">
        <span class="lbl">Muestra (ID)</span>
        <span class="val mono">${muestra || '—'}</span>
      </div>
    </div>`;
}
