// Consulta directa al tablero de Trello (todas las tarjetas) para mostrar en
// el dashboard vencimientos del día SIN necesidad de importar la OT al sistema.
// Cache en memoria de 5 minutos para no golpear la API cada refresh.

const fetch = require('node-fetch');

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

async function fetchTablero() {
  const boardId = process.env.TRELLO_BOARD_ID;
  const key     = process.env.TRELLO_KEY;
  const token   = process.env.TRELLO_TOKEN;
  if (!boardId || !key || !token) {
    throw new Error('Falta configurar TRELLO_BOARD_ID / TRELLO_KEY / TRELLO_TOKEN en .env');
  }

  if (cache.data && (Date.now() - cache.at) < CACHE_MS) return cache.data;

  const auth = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
  const [rC, rL] = await Promise.all([
    fetch(`https://api.trello.com/1/boards/${boardId}/cards?fields=name,due,dueComplete,idList,shortUrl,closed&filter=open&${auth}`),
    fetch(`https://api.trello.com/1/boards/${boardId}/lists?fields=name,pos&${auth}`),
  ]);
  if (!rC.ok) throw new Error('Trello cards: HTTP ' + rC.status);
  if (!rL.ok) throw new Error('Trello lists: HTTP ' + rL.status);

  const cards = await rC.json();
  const lists = await rL.json();
  const listaPorId = {};
  for (const l of lists) listaPorId[l.id] = l.name;

  cache = { at: Date.now(), data: { cards, listaPorId } };
  return cache.data;
}

// Extrae razón social + nro de solicitud del título estilo "CLIENTE - 38079".
function parseTitulo(titulo) {
  const t = String(titulo || '');
  let cliente = t, nroSolicitud = '';
  if (t.includes(' - ')) {
    const partes = t.split(' - ').map(p => p.trim()).filter(Boolean);
    cliente = partes[0] || '';
    const ultima = partes[partes.length - 1] || '';
    if (/^\d+$/.test(ultima)) nroSolicitud = ultima;
    else {
      const m = t.match(/(\d{3,})\s*$/);
      nroSolicitud = m ? m[1] : '';
    }
  } else {
    const m = t.match(/(\d{3,})\s*$/);
    if (m) {
      nroSolicitud = m[1];
      cliente = t.replace(m[0], '').trim();
    }
  }
  return { cliente, nro_solicitud: nroSolicitud };
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
