// ─── Dashboard ────────────────────────────────────────────────────────────────

const ENSAYOS_DISPONIBLES = [
  { tipo: 'traccion',        label: 'Tracción' },
  { tipo: 'impacto',         label: 'Impacto' },
  { tipo: 'dureza-brinell',  label: 'Dur. Brinell' },
  { tipo: 'dureza-rockwell', label: 'Dur. Rockwell' },
  { tipo: 'dureza-vickers',  label: 'Dur. Vickers' },
  { tipo: 'mapa-vickers',    label: 'Mapa Vickers' },
  { tipo: 'plegado',         label: 'Plegado' },
  { tipo: 'quimicos',        label: 'Análisis Químico' },
  { tipo: 'nick-break',      label: 'Nick Break' },
  { tipo: 'ferrita-delta',   label: 'Ferrita Delta' },
  { tipo: 'metalografia',    label: 'Metalografía' },
  { tipo: 'macrografia',     label: 'Macrografía' },
];

const NOMBRES_ENSAYO = Object.fromEntries(ENSAYOS_DISPONIBLES.map(e => [e.tipo, e.label]));

let _allOTs = [];

function estadoChipHtml(estado) {
  const map = {
    'Pendiente':          '',
    'En ensayo':          'chip-accent',
    'Listo para informe': 'chip-success',
  };
  const kind = map[estado] !== undefined ? map[estado] : '';
  const label = estado || 'En ensayo';
  return `<span class="chip ${kind}">${kind ? '<span class="chip-dot"></span>' : ''}${label}</span>`;
}

function renderOtCard(ot) {
  const tipos = ot.tipos_ensayo ? ot.tipos_ensayo.split(',') : [];
  const chips = tipos.map(t => `<span class="chip chip-tag">${NOMBRES_ENSAYO[t] || t}</span>`).join('');
  const idCorto = ot.id_muestra
    ? (ot.id_muestra.length > 60 ? ot.id_muestra.substring(0, 60) + '…' : ot.id_muestra)
    : '';
  return `
    <article class="ot-card" onclick="verOT('${ot.nro_ot}')">
      <div class="ot-card-head">
        <div>
          <div class="ot-card-num">${ot.nro_ot}</div>
          <div class="ot-card-sol">Solicitud ${ot.nro_solicitud || '—'}</div>
        </div>
        ${estadoChipHtml(ot.estado)}
      </div>
      <div class="ot-card-client">${ot.razon_social || '—'}</div>
      ${idCorto ? `<div class="ot-card-id">${idCorto}</div>` : ''}
      <div class="ot-card-tests">
        ${chips || '<span class="muted" style="font-size:12px">Sin ensayos</span>'}
      </div>
      <div class="ot-card-foot">
        <span class="ot-card-date">${ot.fecha_recepcion ? 'Rec. ' + ot.fecha_recepcion : '—'}</span>
        <button class="btn btn-sm btn-ghost" type="button"
          onclick="event.stopPropagation();verOT('${ot.nro_ot}')">
          Ver detalle ${getIcon('chevron-r')}
        </button>
      </div>
    </article>`;
}

async function cargarOTs() {
  const container = document.getElementById('ot-container');
  container.innerHTML = '<p class="muted" style="padding:20px 0">Cargando...</p>';
  try {
    const resp = await fetch('/api/ots');
    _allOTs = await resp.json();
  } catch {
    container.innerHTML = '<p style="color:var(--danger);padding:20px 0">Error al conectar con el servidor.</p>';
    return;
  }
  const sub = document.getElementById('ot-sub');
  if (sub) sub.textContent = `${_allOTs.length} OT${_allOTs.length !== 1 ? 's' : ''} activa${_allOTs.length !== 1 ? 's' : ''}`;
  filtrarOTs();
}

function filtrarOTs() {
  const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
  const filtered = q
    ? _allOTs.filter(o =>
        (o.nro_ot + ' ' + o.nro_solicitud + ' ' + o.razon_social + ' ' + o.id_muestra + ' ' + o.tipos_ensayo)
          .toLowerCase().includes(q))
    : _allOTs;

  const countEl = document.getElementById('filtro-count');
  if (countEl) countEl.textContent = `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`;

  const container = document.getElementById('ot-container');

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        ${getIcon('inbox')}
        <h3>No se encontraron OTs</h3>
        <p>${q ? 'Probá ajustar la búsqueda o limpiar el filtro.' : 'Cargá una nueva orden de trabajo para empezar.'}</p>
        <button class="btn btn-primary" type="button" onclick="window.location='/forms/nueva-ot.html'">
          ${getIcon('plus')} Nueva OT
        </button>
      </div>`;
    return;
  }

  container.innerHTML = `<div class="ot-grid">${filtered.map(renderOtCard).join('')}</div>`;
}

async function descargarWord(nro_ot) {
  try {
    toast(`Generando Word para OT ${nro_ot}...`, 'info');
    await generarWord(nro_ot, null);
    toast('Word generado correctamente', 'ok');
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  }
}

function verOT(nro_ot) {
  window.location.href = `/forms/ot.html?nro_ot=${nro_ot}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('input', filtrarOTs);
  cargarOTs();
});
