'use strict';
/*
 * Bot Trello → OTs
 *
 * Escanea periódicamente un tablero canonical de Trello y crea en la DB las
 * OTs de todas las tarjetas que estén en las columnas configuradas.
 *
 * Config (env vars):
 *   TRELLO_KEY / TRELLO_TOKEN      — credenciales (comparten con /trello/card)
 *   TRELLO_BOT_BOARD_ID            — board short/long ID (default: PgtfyZWt)
 *   TRELLO_BOT_COLUMNAS            — nombres separados por coma (case/acentos insensitive)
 *   TRELLO_BOT_INTERVAL_MIN        — minutos entre scans (default: 15)
 *   TRELLO_BOT_ENABLED             — "false" para deshabilitar (default: habilitado)
 *
 * Comportamiento:
 *   - Cada tarjeta pasa por el mismo parser que /trello/card.
 *   - Para cada `ot` detectada en la tarjeta:
 *       - Si ya existe en la DB → skip (no la pisa).
 *       - Si no existe → la crea con los datos administrativos del parser.
 *   - Si la tarjeta no tiene `fecha_aprobacion` en el custom field, la OT
 *     se crea igual con `fecha_aprobacion = null` (marcada como "incompleta"
 *     para que el admin la complete después vía "Editar solicitud").
 *   - Skipea tarjetas cuyo título no matchee el patrón "CLIENTE - NÚMERO".
 *   - No mueve tarjetas de columna (por ahora — decidir si sumar más adelante).
 */

const db = require('../db');
const { registrarEvento } = require('./trazabilidad');

const BOARD_ID_DEFAULT = 'PgtfyZWt';
const COLUMNAS_DEFAULT = ['Mecanizado de probetas', 'Ensayos', 'Evaluación Técnica', 'Carga de informes'];
const INTERVALO_DEFAULT_MIN = 15;

let intervalHandle = null;
let ultimoScan = null;   // { ts, ok, creadas, skipeadas, errores }

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

async function fetchJson(url) {
  const res = await fetch(url, { timeout: 15000 });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} @ ${url.split('?')[0]} — ${body.slice(0, 120)}`);
  }
  return res.json();
}

async function traerTarjetasDeColumnasImportables() {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) throw new Error('Faltan TRELLO_KEY / TRELLO_TOKEN en el .env');

  const boardId = process.env.TRELLO_BOT_BOARD_ID || BOARD_ID_DEFAULT;
  const columnasConfig = (process.env.TRELLO_BOT_COLUMNAS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const columnasOK = new Set((columnasConfig.length ? columnasConfig : COLUMNAS_DEFAULT).map(normalizar));

  // 1. Traer todas las listas del board para saber cuáles son importables.
  const lists = await fetchJson(`https://api.trello.com/1/boards/${boardId}/lists?fields=id,name&key=${key}&token=${token}`);
  const listasImportables = lists.filter(l => columnasOK.has(normalizar(l.name)));
  if (listasImportables.length === 0) {
    throw new Error(`Ninguna lista del board matchea las columnas configuradas: ${[...columnasOK].join(', ')}. Listas disponibles: ${lists.map(l => l.name).join(', ')}`);
  }
  const idListsImport = new Set(listasImportables.map(l => l.id));
  const nombreListaPorId = Object.fromEntries(listasImportables.map(l => [l.id, l.name]));

  // 2. Traer custom fields del board (para extraer fecha_aprobacion).
  const customFieldsDefs = await fetchJson(`https://api.trello.com/1/boards/${boardId}/customFields?key=${key}&token=${token}`).catch(() => []);

  // 3. Traer todas las cards del board (con custom field items, labels, checklists).
  //    checklists=all trae { id, name, checkItems: [{ name, state }] } embebido.
  const cards = await fetchJson(`https://api.trello.com/1/boards/${boardId}/cards?fields=id,name,desc,due,dueComplete,idList,idLabels,labels&customFieldItems=true&checklists=all&key=${key}&token=${token}`);
  const cardsImport = cards.filter(c => idListsImport.has(c.idList));

  return { cards: cardsImport, customFieldsDefs, nombreListaPorId };
}

// Mapeo texto libre → tipo interno. Primer match gana. Los patrones son
// case-insensitive, con acentos opcionales. Se prueban en orden — más específico
// primero (ej. "dureza brinell" antes que "brinell") para no confundir.
const MAPEO_ENSAYOS_TRELLO = [
  { re: /\btracci[oó]n\b/i,                          tipo: 'traccion' },
  { re: /\bdureza\s+brinell\b|\bbrinell\b/i,         tipo: 'dureza-brinell' },
  { re: /\bdureza\s+vickers\b|\bvickers\b/i,         tipo: 'dureza-vickers' },
  { re: /\bdureza\s+rockwell\b|\brockwell\b/i,       tipo: 'dureza-rockwell' },
  { re: /\bimpacto\b|\bcharpy\b/i,                   tipo: 'impacto' },
  { re: /\bplegado\b/i,                              tipo: 'plegado' },
  { re: /\bnick\s*break\b/i,                         tipo: 'nick-break' },
  { re: /\bferrita\b/i,                              tipo: 'ferrita-delta' },
  { re: /\banexo\s+metalogr[aá]fico\b/i,             tipo: 'anexo-metalografico' },
  { re: /\bmetalograf/i,                             tipo: 'metalografia-general' },
  { re: /\bmacrograf/i,                              tipo: 'macrografia' },
  { re: /\brugosidad\b/i,                            tipo: 'rugosidad' },
  { re: /\bqu[íi]mic/i,                              tipo: 'quimicos' },
  { re: /\bl[íi]quidos?\s+penetrantes\b|\bpenetrantes\b/i, tipo: 'liquidos-penetrantes' },
  { re: /\btratamientos?\s+t[eé]rmicos?\b/i,         tipo: 'tratamientos-termicos' },
];

// Recorre los checklists de una card y devuelve un mapa { numM: [tipos] }.
// Solo considera checklists cuyo nombre matchee "Ensayos - M<n>" (o "Ensayo M<n>").
// Dedupplica tipos por muestra (varios items con "TRACCION" cuentan como 1).
function detectarEnsayosPorMuestra(card) {
  const out = {};
  const chks = Array.isArray(card.checklists) ? card.checklists : [];
  for (const chk of chks) {
    const m = String(chk.name || '').match(/M\s*(\d+)\s*$/i);
    if (!m) continue;
    const numM = parseInt(m[1], 10);
    if (isNaN(numM)) continue;
    const items = Array.isArray(chk.checkItems) ? chk.checkItems : [];
    const tipos = new Set();
    for (const it of items) {
      const txt = String(it.name || '');
      // Skipear items administrativos que no son ensayos.
      if (/\bfinalizaci[oó]n\b/i.test(txt)) continue;
      for (const { re, tipo } of MAPEO_ENSAYOS_TRELLO) {
        if (re.test(txt)) { tipos.add(tipo); break; }
      }
    }
    if (tipos.size > 0) out[numM] = [...tipos];
  }
  return out;
}

// Etiquetas que bloquean la importación automática. Case/acentos-insensitive.
// Se puede ampliar via env var TRELLO_BOT_ETIQUETAS_BLOQUEO (coma separada).
const ETIQUETAS_BLOQUEO_DEFAULT = ['falta o.t', 'falta ot', 'falta id'];
function tarjetaTieneEtiquetaBloqueo(card) {
  const extras = (process.env.TRELLO_BOT_ETIQUETAS_BLOQUEO || '')
    .split(',').map(s => normalizar(s)).filter(Boolean);
  const bloqueo = new Set(ETIQUETAS_BLOQUEO_DEFAULT.concat(extras));
  const labels = Array.isArray(card.labels) ? card.labels : [];
  for (const lb of labels) {
    if (bloqueo.has(normalizar(lb && lb.name))) return lb.name;
  }
  return null;
}

// Reusa el parser del endpoint /trello/card (extraído por refactor mínimo).
// Como el parsearTarjeta original está inline en api.js, lo re-implementamos
// acá con la misma lógica (regex y estructura idénticas).
function parsearTarjeta(card, urlOriginal) {
  const titulo = card.name || '';
  const desc = (card.desc || '').replace(/\*\*/g, '').replace(/__/g, '');

  let clienteNombre, nroSolicitudRaw;
  if (titulo.includes(' - ')) {
    const partes = titulo.split(' - ').map(p => p.trim()).filter(Boolean);
    clienteNombre = partes[0] || '';
    const ultima  = partes[partes.length - 1] || '';
    if (/^\d+$/.test(ultima)) {
      nroSolicitudRaw = ultima;
    } else {
      const m = titulo.match(/(\d{3,})\s*$/);
      nroSolicitudRaw = m ? m[1] : '';
    }
  } else {
    const lastSpace = titulo.lastIndexOf(' ');
    if (lastSpace >= 0) {
      clienteNombre   = titulo.slice(0, lastSpace).trim();
      nroSolicitudRaw = titulo.slice(lastSpace + 1).trim();
    } else {
      clienteNombre   = titulo.trim();
      nroSolicitudRaw = '';
    }
  }
  const nro_solicitud = String(parseInt(nroSolicitudRaw, 10) || nroSolicitudRaw);

  const nroClienteM = desc.match(/^(?:Nro\s+)?Cliente:\s*(\S+)/m);
  const nro_cliente = (nroClienteM && nroClienteM[1] && nroClienteM[1].trim()) || '';

  const OT_LINE = /^(?:M(\d+)\s*\(\s*O\.?T\.?\s*:?\s*(\d+)\s*\)|OT(\d+)\s*\(\s*(\d+)\s*\)|\(\s*O\.?T\.?\s*:?\s*(\d+)\s*\)\s*M(\d+)|\(\s*O\.T\.?\s*\)\s*M(\d+))\s*:?\s*(?:ID:)?\s*(.*)/i;
  const lineas = desc.split('\n');
  const ots = [];
  let actual = null;
  function finalizarOT(actual) {
    return { muestra: actual.muestra, nro_ot: actual.nro_ot, id_muestra: actual.partes.join('\n') };
  }
  for (const linea of lineas) {
    const m = linea.match(OT_LINE);
    if (m) {
      if (actual) ots.push(finalizarOT(actual));
      const muestra = m[1] || m[3] || m[6] || m[7];
      const nro_ot  = m[2] || m[4] || m[5] || '';
      const desc0   = m[8];
      actual = { muestra, nro_ot: (nro_ot || '').trim(), partes: [desc0.trim()] };
    } else if (actual) {
      const trim = linea.trim();
      if (/^Observaciones:/i.test(trim)) { ots.push(finalizarOT(actual)); actual = null; break; }
      if (trim) actual.partes.push(trim);
    }
  }
  if (actual) ots.push(finalizarOT(actual));

  return { nro_solicitud, nro_cliente, cliente_nombre: clienteNombre, ots, trello_url: urlOriginal };
}

function extraerFechasDeCard(card, customFieldsDefs) {
  const out = { fecha_recepcion: null, fecha_aprobacion: null, fecha_vencimiento: null };
  // Fecha recepción = fecha de creación de la card (hex de los primeros 8 chars del id).
  try {
    const hex = String(card.id || '').slice(0, 8);
    if (/^[0-9a-f]{8}$/i.test(hex)) {
      const ts = parseInt(hex, 16) * 1000;
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        const pad = n => String(n).padStart(2, '0');
        out.fecha_recepcion = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      }
    }
  } catch {}
  // Fecha vencimiento = due de la card.
  if (card.due) out.fecha_vencimiento = String(card.due).slice(0, 10);
  // Fecha aprobación = custom field "Fecha de aprobación" (o similar).
  try {
    const cfAprob = (customFieldsDefs || []).find(cf => /aprobac/.test(normalizar(cf.name)));
    const items = Array.isArray(card.customFieldItems) ? card.customFieldItems : [];
    if (cfAprob) {
      const item = items.find(it => it.idCustomField === cfAprob.id);
      if (item && item.value && item.value.date) {
        const d = new Date(item.value.date);
        if (!isNaN(d.getTime())) {
          const pad = n => String(n).padStart(2, '0');
          out.fecha_aprobacion = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        }
      }
    }
  } catch (e) {}
  return out;
}

async function escanearYSyncOts() {
  const inicio = Date.now();
  const stats = { ts: new Date().toISOString(), ok: false, creadas: [], skipeadas: [], errores: [] };
  try {
    const { cards, customFieldsDefs, nombreListaPorId } = await traerTarjetasDeColumnasImportables();
    for (const card of cards) {
      try {
        // Skipear tarjetas con etiquetas de bloqueo (FALTA O.T, FALTA ID, ...).
        // La secretaría pone estas etiquetas para señalar que la tarjeta no
        // está lista para importar (le falta info clave).
        const etiquetaBloq = tarjetaTieneEtiquetaBloqueo(card);
        if (etiquetaBloq) {
          stats.skipeadas.push({ card: card.name, motivo: 'etiqueta bloqueo: ' + etiquetaBloq });
          continue;
        }
        const urlCard = `https://trello.com/c/${card.id}`;
        const parsed = parsearTarjeta(card, urlCard);
        if (!parsed.nro_solicitud || parsed.ots.length === 0) {
          // Incluir preview del desc y del título para diagnosticar por qué el
          // parser no reconoció OTs (formato distinto al esperado, sin líneas
          // de "M1 (OT XXXXX):", etc.). Cortamos a 300 chars para no saturar.
          const descPreview = String(card.desc || '').replace(/\r/g, '').slice(0, 300);
          stats.skipeadas.push({
            card: card.name, motivo: 'no se detectaron OTs',
            nro_solicitud_detectado: parsed.nro_solicitud || null,
            desc_preview: descPreview,
            url: 'https://trello.com/c/' + card.id,
          });
          continue;
        }
        const fechas = extraerFechasDeCard(card, customFieldsDefs);
        const trelloColumna = nombreListaPorId[card.idList] || '';
        // Ensayos detectados a partir de los checklists "Ensayos - M<n>".
        //   { 1: ['traccion', 'dureza-brinell'], 2: ['traccion'] }
        const ensayosPorM = detectarEnsayosPorMuestra(card);
        for (const o of parsed.ots) {
          const nroOt = String(o.nro_ot || '').trim();
          if (!nroOt) { stats.skipeadas.push({ card: card.name, motivo: 'OT sin número' }); continue; }
          const ya = db.prepare('SELECT nro_ot FROM ots WHERE nro_ot = ?').get(nroOt);
          if (ya) { stats.skipeadas.push({ nro_ot: nroOt, motivo: 'ya existe' }); continue; }
          // Detectar si es la primera OT de esta solicitud (para el evento
          // adicional "Solicitud creada" en el audit trail).
          const solYaTenia = parsed.nro_solicitud
            ? db.prepare('SELECT COUNT(*) AS n FROM ots WHERE nro_solicitud = ?').get(parsed.nro_solicitud).n
            : 0;
          db.prepare(`
            INSERT INTO ots (
              nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
              fecha_recepcion, fecha_aprobacion, fecha_finalizacion,
              fecha_vencimiento, trello_columna, trello_url, es_preinforme, creado_en, actualizado_en
            ) VALUES (
              @nro_ot, @nro_solicitud, @nro_cliente, @razon_social, @id_muestra,
              @fecha_recepcion, @fecha_aprobacion, @fecha_finalizacion,
              @fecha_vencimiento, @trello_columna, @trello_url, 0,
              datetime('now'), datetime('now')
            )
          `).run({
            nro_ot: nroOt,
            nro_solicitud: parsed.nro_solicitud || null,
            nro_cliente: parsed.nro_cliente || null,
            razon_social: parsed.cliente_nombre || null,
            id_muestra: o.id_muestra || null,
            fecha_recepcion: fechas.fecha_recepcion,
            fecha_aprobacion: fechas.fecha_aprobacion,  // puede ser null → OT marcada incompleta
            fecha_finalizacion: null,
            fecha_vencimiento: fechas.fecha_vencimiento,
            trello_columna: trelloColumna,
            trello_url: urlCard,
          });
          // Insertar ensayos detectados en el checklist de esta muestra.
          // La muestra se identifica por el número M del checklist ("Ensayos - M1").
          const numMuestra = parseInt(o.muestra, 10);
          const tiposDetectados = ensayosPorM[numMuestra] || [];
          const ensayosInsertados = [];
          if (tiposDetectados.length > 0) {
            const insEns = db.prepare('INSERT INTO ensayos (nro_ot, tipo, orden, datos_json) VALUES (?, ?, ?, ?)');
            tiposDetectados.forEach((tipo, i) => {
              try {
                insEns.run(nroOt, tipo, i + 1, '{}');
                ensayosInsertados.push(tipo);
              } catch (e) {
                console.error('[bot-trello] no se pudo insertar ensayo ' + tipo + ' en OT ' + nroOt + ':', e.message);
              }
            });
          }
          stats.creadas.push({
            nro_ot: nroOt, solicitud: parsed.nro_solicitud, cliente: parsed.cliente_nombre,
            sin_fecha_aprobacion: !fechas.fecha_aprobacion,
            ensayos: ensayosInsertados,
          });
          // Auditoría: evento "OT creada desde Trello". Si es la primera de la
          // solicitud, evento adicional "Solicitud X creada". Si registrar
          // falla, se loggea (no silencio) para poder diagnosticar problemas.
          try {
            registrarEvento(nroOt, 'OT creada automáticamente desde Trello (bot)', 'download');
            if (parsed.nro_solicitud && solYaTenia === 0) {
              registrarEvento(nroOt, 'Solicitud ' + parsed.nro_solicitud + ' creada (primera OT: ' + nroOt + ')', 'add');
            }
            if (ensayosInsertados.length > 0) {
              registrarEvento(nroOt, 'Ensayos detectados desde checklist Trello: ' + ensayosInsertados.join(', '), 'add');
            }
            if (!fechas.fecha_aprobacion) {
              registrarEvento(nroOt, 'OT incompleta: sin fecha de aprobación (completar desde "Editar solicitud")', 'alertTri');
            }
          } catch (e) {
            console.error('[bot-trello] no se pudo registrar evento para OT ' + nroOt + ':', e.message);
          }
        }
      } catch (e) {
        stats.errores.push({ card: card && card.name, error: e.message });
      }
    }
    stats.ok = true;
  } catch (e) {
    stats.errores.push({ fatal: e.message });
  }
  stats.duracion_ms = Date.now() - inicio;
  ultimoScan = stats;
  const resumen = `[bot-trello] scan ${stats.ok ? 'OK' : 'FAIL'} · creadas=${stats.creadas.length} skip=${stats.skipeadas.length} err=${stats.errores.length} · ${stats.duracion_ms}ms`;
  if (stats.errores.length && !stats.ok) console.error(resumen, stats.errores);
  else console.log(resumen);
  return stats;
}

function iniciarBot() {
  if (process.env.TRELLO_BOT_ENABLED === 'false') {
    console.log('[bot-trello] deshabilitado (TRELLO_BOT_ENABLED=false)');
    return;
  }
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  const min = Math.max(1, parseInt(process.env.TRELLO_BOT_INTERVAL_MIN || String(INTERVALO_DEFAULT_MIN), 10));
  console.log(`[bot-trello] iniciando · intervalo=${min}min · board=${process.env.TRELLO_BOT_BOARD_ID || BOARD_ID_DEFAULT}`);
  // Primer scan diferido 30s para dar tiempo al server a estabilizarse.
  setTimeout(() => escanearYSyncOts().catch(e => console.error('[bot-trello] scan inicial falló:', e.message)), 30 * 1000);
  intervalHandle = setInterval(() => {
    escanearYSyncOts().catch(e => console.error('[bot-trello] scan periódico falló:', e.message));
  }, min * 60 * 1000);
}

function detenerBot() {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
}

function estadoBot() {
  return {
    activo: !!intervalHandle,
    board_id: process.env.TRELLO_BOT_BOARD_ID || BOARD_ID_DEFAULT,
    columnas: (process.env.TRELLO_BOT_COLUMNAS || COLUMNAS_DEFAULT.join(',')).split(',').map(s => s.trim()),
    intervalo_min: parseInt(process.env.TRELLO_BOT_INTERVAL_MIN || String(INTERVALO_DEFAULT_MIN), 10),
    ultimo_scan: ultimoScan,
  };
}

module.exports = { iniciarBot, detenerBot, escanearYSyncOts, estadoBot };
