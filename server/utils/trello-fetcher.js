// Consulta directa al tablero de Trello (todas las tarjetas) para mostrar en
// el dashboard vencimientos del día SIN necesidad de importar la OT al sistema.
// Cache en memoria de 5 minutos para no golpear la API cada refresh.

const fetch = require('node-fetch');

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

async function fetchTablero() {
  const key   = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  // Soporta múltiples boards: env var CSV. Compat con TRELLO_BOARD_ID (legacy).
  //   - TRELLO_BOT_BOARD_IDS  (CSV, nuevo)
  //   - TRELLO_BOARD_ID       (single, legacy)
  //   - Default: 'PgtfyZWt' (metalmecánica CABA) + 'BkCmrveB' (SEDE NQN).
  const csv = process.env.TRELLO_BOT_BOARD_IDS;
  const single = process.env.TRELLO_BOARD_ID;
  const boardIds = csv ? csv.split(',').map(s => s.trim()).filter(Boolean)
                : single ? [single]
                : ['PgtfyZWt', 'BkCmrveB'];
  if (boardIds.length === 0 || !key || !token) {
    throw new Error('Falta configurar TRELLO_BOARD_ID(s) / TRELLO_KEY / TRELLO_TOKEN en .env');
  }

  if (cache.data && (Date.now() - cache.at) < CACHE_MS) return cache.data;

  const auth = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
  const cardsCombined = [];
  const listaPorId = {};
  for (const boardId of boardIds) {
    try {
      const [rC, rL] = await Promise.all([
        fetch(`https://api.trello.com/1/boards/${boardId}/cards?fields=name,due,dueComplete,idList,idBoard,shortUrl,closed,labels&filter=open&${auth}`),
        fetch(`https://api.trello.com/1/boards/${boardId}/lists?fields=name,pos&${auth}`),
      ]);
      if (!rC.ok || !rL.ok) { console.warn('[trello-fetcher] board ' + boardId + ' falló'); continue; }
      const cs = await rC.json();
      const ls = await rL.json();
      for (const l of ls) listaPorId[l.id] = l.name;
      for (const c of cs) cardsCombined.push(c);
    } catch (e) { console.warn('[trello-fetcher] board ' + boardId + ': ' + e.message); }
  }

  cache = { at: Date.now(), data: { cards: cardsCombined, listaPorId } };
  return cache.data;
}

// Extrae razón social + nro de solicitud del título. Delega en el parser
// compartido (trello-parser.js) para no duplicar lógica — el bot y este cache
// del dashboard deben ver los mismos números para que "en_sistema" cuadre.
const { parsearTitulo: _parsearTituloCompartido } = require('./trello-parser');
function parseTitulo(titulo) {
  const r = _parsearTituloCompartido(titulo);
  return { cliente: r.cliente_nombre, nro_solicitud: r.nro_solicitud };
}

// Normalización de nombres de etiqueta (misma que bot-trello.js). Duplicada
// acá para no crear una dependencia cruzada — cambio menor y estable.
function _normLabel(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
const _OAA_LABELS = new Set(['parametro acreditado', 'parametros acreditados']);
function _cardTieneEtiquetaOAA(card) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  return labels.some(l => _OAA_LABELS.has(_normLabel(l && l.name)));
}
const _PRELIMINAR_LABELS = new Set(['preliminar']);
function _cardTieneEtiquetaPreliminar(card) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  return labels.some(l => _PRELIMINAR_LABELS.has(_normLabel(l && l.name)));
}

// Solo mostramos tarjetas en columnas "activas" (previas al informe emitido).
// Después de "Carga de informes" las etapas son revisión / firma / archivo —
// no aparecen en el panel de vencimientos del dashboard. Se puede sobrescribir
// vía TRELLO_BOT_COLUMNAS (mismo env que usa el bot para importar).
const _COLUMNAS_MOSTRAR_DEFAULT = ['Ingreso de muestras', 'Mecanizado de probetas', 'Ensayos', 'Evaluación Técnica', 'Carga de informes'];
function _normCol(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function esColumnaActiva(nombreLista) {
  const configuradas = (process.env.TRELLO_BOT_COLUMNAS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const lista = (configuradas.length ? configuradas : _COLUMNAS_MOSTRAR_DEFAULT).map(_normCol);
  return lista.indexOf(_normCol(nombreLista)) >= 0;
}

function clasificar(cards, listaPorId) {
  const pad = n => String(n).padStart(2, '0');
  // Fecha "hoy" en la zona horaria local del server.
  const hoy = new Date();
  const hoyISO = hoy.getFullYear() + '-' + pad(hoy.getMonth() + 1) + '-' + pad(hoy.getDate());
  const toDateUtc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
  const hoyD = toDateUtc(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
  // Convierte una fecha ISO/timestamp de Trello a "YYYY-MM-DD" en TIMEZONE LOCAL
  // del server. Trello guarda las due dates como UTC (23:59 del día en zona
  // del usuario del board = madrugada del día siguiente en UTC). Sin este
  // ajuste, una tarjeta que vence 7-jul aparecería como 8-jul si el server
  // está en UTC-3.
  const parseDueLocal = (dueStr) => {
    if (!dueStr) return null;
    const d = new Date(dueStr);
    if (isNaN(d.getTime())) return null;
    return {
      iso: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
      utc: toDateUtc(d.getFullYear(), d.getMonth() + 1, d.getDate()),
    };
  };
  const clas = { hoy: [], mañana: [], vencidas: [], proximas: [] };
  for (const c of cards) {
    if (!c.due || c.dueComplete || c.closed) continue;
    // Ignorar tarjetas en columnas post-carga (Revisión, Informe Preliminar,
    // Para firma electrónica, ...plazo, etc.) — solo mostramos etapas previas
    // a la emisión del informe.
    if (!esColumnaActiva(listaPorId[c.idList])) continue;
    const p = parseDueLocal(c.due);
    if (!p) continue;
    const dueISO = p.iso;
    const d = p.utc;
    const dias = Math.round((d - hoyD) / (24 * 3600 * 1000));
    const parsed = parseTitulo(c.name);
    // Detección de Cintolo: por el título de la tarjeta de Trello.
    const esCintolo = /\bCINTOLO\b/i.test(c.name || '');
    const item = {
      id_trello: c.id,
      titulo: c.name,
      cliente: parsed.cliente,
      nro_solicitud: parsed.nro_solicitud,
      due: dueISO,
      dias,
      lista: listaPorId[c.idList] || '',
      url: c.shortUrl || `https://trello.com/c/${c.id}`,
      es_cintolo: esCintolo,
      trello_oaa_label: _cardTieneEtiquetaOAA(c) ? 1 : 0,
      es_preliminar: _cardTieneEtiquetaPreliminar(c) ? 1 : 0,
    };
    if (dias < 0) clas.vencidas.push(item);
    else if (dias === 0) clas.hoy.push(item);
    else if (dias === 1) clas.mañana.push(item);
    else if (dias <= 7) clas.proximas.push(item);
  }
  ['vencidas', 'hoy', 'mañana', 'proximas'].forEach(k => {
    clas[k].sort((a, b) => a.due.localeCompare(b.due));
  });
  return clas;
}

function invalidarCache() { cache = { at: 0, data: null }; }

module.exports = { fetchTablero, clasificar, invalidarCache };
