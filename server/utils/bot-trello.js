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
const { parsearTarjeta, detectarEnsayosPorMuestra } = require('./trello-parser');

const BOARD_ID_DEFAULT = 'PgtfyZWt';
// Columnas del tablero desde las que el bot importa. Incluimos "Ingreso de
// muestras" para watchear las cards desde que la secretaría las recibe —
// permite preconfigurar / seguir el flujo antes de que arranque el mecanizado.
const COLUMNAS_DEFAULT = ['Ingreso de muestras', 'Mecanizado de probetas', 'Ensayos', 'Evaluación Técnica', 'Carga de informes'];
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

// Board principal (metalmecánica CABA) + segundo board (Sede NQN).
// Se pueden agregar más con env var CSV: TRELLO_BOT_BOARD_IDS=id1,id2,id3.
// Mantengo TRELLO_BOT_BOARD_ID (singular, legacy) por retrocompatibilidad.
const BOARD_IDS_DEFAULT = ['PgtfyZWt', 'BkCmrveB']; // Metalmecánica CABA + Sede NQN
function _boardIds() {
  const csv = process.env.TRELLO_BOT_BOARD_IDS;
  if (csv) return csv.split(',').map(s => s.trim()).filter(Boolean);
  const single = process.env.TRELLO_BOT_BOARD_ID;
  if (single) return [single];
  return BOARD_IDS_DEFAULT;
}

async function traerTarjetasDeColumnasImportables() {
  const key = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) throw new Error('Faltan TRELLO_KEY / TRELLO_TOKEN en el .env');

  const boardIds = _boardIds();
  const columnasConfig = (process.env.TRELLO_BOT_COLUMNAS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const columnasOK = new Set((columnasConfig.length ? columnasConfig : COLUMNAS_DEFAULT).map(normalizar));

  const cardsCombined = [];
  const customFieldsDefsCombined = [];
  const nombreListaPorIdCombined = {};

  for (const boardId of boardIds) {
    try {
      const lists = await fetchJson(`https://api.trello.com/1/boards/${boardId}/lists?fields=id,name&key=${key}&token=${token}`);
      const listasImportables = lists.filter(l => columnasOK.has(normalizar(l.name)));
      if (listasImportables.length === 0) {
        console.warn(`[bot-trello] board ${boardId}: sin listas importables (columnas: ${lists.map(l => l.name).join(', ')})`);
        continue;
      }
      const idListsImport = new Set(listasImportables.map(l => l.id));
      listasImportables.forEach(l => { nombreListaPorIdCombined[l.id] = l.name; });

      const cfs = await fetchJson(`https://api.trello.com/1/boards/${boardId}/customFields?key=${key}&token=${token}`).catch(() => []);
      cfs.forEach(cf => customFieldsDefsCombined.push(cf));

      const cards = await fetchJson(`https://api.trello.com/1/boards/${boardId}/cards?fields=id,name,desc,due,dueComplete,idList,idBoard,idLabels,labels&customFieldItems=true&checklists=all&key=${key}&token=${token}`);
      for (const c of cards) if (idListsImport.has(c.idList)) cardsCombined.push(c);
    } catch (e) {
      console.warn(`[bot-trello] board ${boardId} falló:`, e.message);
    }
  }

  if (cardsCombined.length === 0 && boardIds.length > 0) {
    throw new Error(`Ningún board respondió con tarjetas importables. Boards: ${boardIds.join(', ')}. Revisar TRELLO_KEY/TOKEN y las columnas configuradas.`);
  }

  return { cards: cardsCombined, customFieldsDefs: customFieldsDefsCombined, nombreListaPorId: nombreListaPorIdCombined };
}

// Nota: el parser de tarjeta + el mapeo de ensayos viven en trello-parser.js
// (módulo compartido con el endpoint /trello/card).

// Etiquetas que bloquean la importación automática. Vacío por default: incluso
// tarjetas con FALTA O.T / FALTA ID se importan (con placeholder y flag
// datos_faltantes). Se puede setear via env TRELLO_BOT_ETIQUETAS_BLOQUEO.
const ETIQUETAS_BLOQUEO_DEFAULT = [];

// Etiquetas OAA: si la tarjeta tiene alguna de estas, los ensayos creados por
// el bot arrancan con `{ oaa: true }` (bajo alcance de acreditación).
const ETIQUETAS_OAA_DEFAULT = ['parametro acreditado', 'parametros acreditados'];
// Etiquetas que marcan datos faltantes en la OT (flag datos_faltantes).
const ETIQUETAS_FALTA_OT_DEFAULT = ['falta o.t', 'falta ot'];
const ETIQUETAS_FALTA_ID_DEFAULT = ['falta id'];
// Etiqueta "PRELIMINAR" → tilda automáticamente el check "Marcar como
// preinforme" en la OT. Al sacarla, se destilda (sync bidireccional).
const ETIQUETAS_PRELIMINAR_DEFAULT = ['preliminar'];
function tarjetaEsAcreditada(card) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  return labels.some(l => ETIQUETAS_OAA_DEFAULT.includes(normalizar(l && l.name)));
}
function tarjetaFaltaOt(card) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  return labels.some(l => ETIQUETAS_FALTA_OT_DEFAULT.includes(normalizar(l && l.name)));
}
function tarjetaFaltaId(card) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  return labels.some(l => ETIQUETAS_FALTA_ID_DEFAULT.includes(normalizar(l && l.name)));
}
function tarjetaEsPreliminar(card) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  return labels.some(l => ETIQUETAS_PRELIMINAR_DEFAULT.includes(normalizar(l && l.name)));
}
function tarjetaTieneEtiquetaBloqueo(card) {
  const extras = (process.env.TRELLO_BOT_ETIQUETAS_BLOQUEO || '')
    .split(',').map(s => normalizar(s)).filter(Boolean);
  const bloqueo = new Set(ETIQUETAS_BLOQUEO_DEFAULT.concat(extras));
  if (bloqueo.size === 0) return null;
  const labels = Array.isArray(card.labels) ? card.labels : [];
  for (const lb of labels) {
    if (bloqueo.has(normalizar(lb && lb.name))) return lb.name;
  }
  return null;
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
        // Si no se detectaron OTs pero SI hay solicitud (o al menos una card
        // válida), creamos UN placeholder para watchear la card. Al día siguiente
        // el update-path va a completar los datos que la secretaría agregue.
        // Requisito del usuario: importar aunque tengan FALTA OT / FALTA ID —
        // el bloqueo se hace al generar el informe, no al importar.
        if (parsed.ots.length === 0) {
          if (!parsed.nro_solicitud) {
            // Sin solicitud + sin OTs → no hay anchor para watchear. Skip.
            const descPreview = String(card.desc || '').replace(/\r/g, '').slice(0, 300);
            stats.skipeadas.push({
              card: card.name, motivo: 'no se detectaron OTs ni solicitud',
              nro_solicitud_detectado: null,
              desc_preview: descPreview,
              url: 'https://trello.com/c/' + card.id,
            });
            continue;
          }
          // Placeholder mínimo: 1 OT sin nro_ot ni id_muestra. El código
          // aguas abajo genera PEND-{sol}-M1 y flags de datos faltantes.
          parsed.ots = [{ muestra: '1', nro_ot: '', id_muestra: '' }];
        }
        const fechas = extraerFechasDeCard(card, customFieldsDefs);
        const trelloColumna = nombreListaPorId[card.idList] || '';
        // Ensayos detectados a partir de los checklists "Ensayos - M<n>".
        //   { 1: ['traccion', 'dureza-brinell'], 2: ['traccion'] }
        const ensayosPorM = detectarEnsayosPorMuestra(card);
        // Si la tarjeta tiene etiqueta "PARAMETRO ACREDITADO" / "PARAMETROS
        // ACREDITADOS", persistimos el flag a nivel OT (`trello_oaa_label`)
        // como señal informativa para el técnico. La decisión real de si el
        // informe es acreditado la toma agente-oaa según norma+sede+temp; el
        // flag de Trello no manda sobre el badge ni la carpeta de destino.
        const esAcreditada = tarjetaEsAcreditada(card);
        // Etiqueta "PRELIMINAR" → tilda es_preinforme en las OTs de la card.
        const esPreliminar = tarjetaEsPreliminar(card);
        const ensayoDatosVacio = '{}';
        // Etiquetas "FALTA X" → flags de datos faltantes en la OT.
        const cardFaltaOt = tarjetaFaltaOt(card);
        const cardFaltaId = tarjetaFaltaId(card);
        for (const o of parsed.ots) {
          // Si la muestra vino sin nro_ot (formato desc sin número), y la
          // tarjeta tiene "FALTA O.T", generamos placeholder PEND-{sol}-M{n}
          // para poder crear la OT igual y flagearla. Si no tiene "FALTA O.T"
          // pero igual falta el número, también placeholder (edge case raro).
          let nroOt = String(o.nro_ot || '').trim();
          const usaPlaceholder = !nroOt;
          if (usaPlaceholder) {
            const solSlug = String(parsed.nro_solicitud || 'SIN-SOL').replace(/[^0-9A-Za-z]/g, '');
            nroOt = 'PEND-' + solSlug + '-M' + o.muestra;
          }
          // Datos faltantes por esta OT específica. Regla: el dato real manda
          // sobre la etiqueta de Trello. Si al importar ya viene un nro_ot / un
          // id_muestra válido, no lo flageamos aunque la card tenga "FALTA X"
          // (la secretaría probablemente se olvidó de sacar la etiqueta).
          const idTrim = String(o.id_muestra || '').trim();
          const idInvalido = !idTrim || /^se debe dar/i.test(idTrim);
          const faltantes = [];
          if (usaPlaceholder) faltantes.push('nro_ot');
          if (idInvalido) faltantes.push('id_muestra');
          const faltantesJson = faltantes.length > 0 ? JSON.stringify(faltantes) : null;
          // UPGRADE de placeholder: si el parser ahora detecta un nro_ot REAL
          // (no placeholder) para esta muestra, buscar el placeholder previo
          // "PEND-{sol}-M{n}" y renombrarlo al real (arrastrando ensayos +
          // eventos). Así el técnico no pierde nada que haya cargado en el
          // placeholder mientras esperaba los datos.
          if (!usaPlaceholder && parsed.nro_solicitud) {
            const solSlug = String(parsed.nro_solicitud || '').replace(/[^0-9A-Za-z]/g, '');
            const placeholderNroOt = 'PEND-' + solSlug + '-M' + o.muestra;
            const phRow = db.prepare('SELECT nro_ot FROM ots WHERE nro_ot = ?').get(placeholderNroOt);
            const yaExisteReal = db.prepare('SELECT 1 FROM ots WHERE nro_ot = ?').get(nroOt);
            if (phRow && !yaExisteReal) {
              try {
                db.exec('BEGIN');
                db.prepare("UPDATE ots     SET nro_ot = ?, actualizado_en = datetime('now') WHERE nro_ot = ?").run(nroOt, placeholderNroOt);
                db.prepare('UPDATE ensayos SET nro_ot = ? WHERE nro_ot = ?').run(nroOt, placeholderNroOt);
                db.prepare('UPDATE eventos SET nro_ot = ? WHERE nro_ot = ?').run(nroOt, placeholderNroOt);
                db.exec('COMMIT');
                try { registrarEvento(nroOt, 'OT placeholder "' + placeholderNroOt + '" reemplazada por N° real desde Trello (' + nroOt + ')', 'edit'); } catch (_) {}
              } catch (e) {
                try { db.exec('ROLLBACK'); } catch (_) {}
                console.error('[bot-trello] fallo upgrade placeholder ' + placeholderNroOt + ' → ' + nroOt + ':', e.message);
              }
            }
          }
          const ya = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nroOt);
          if (ya) {
            // Modo "update campos vacíos" con EXCEPCIÓN para id_muestra:
            // el resto de los campos solo se pisan si el DB los tiene vacíos
            // (protege correcciones manuales del técnico); id_muestra en cambio
            // se SOBRESCRIBE siempre con lo que traiga Trello — la secretaría
            // frecuentemente corrige la identificación (M-<nro>) después de
            // creada la tarjeta y esos cambios tienen que llegar al sistema.
            const patch = {};
            const candidatos = {
              razon_social:     parsed.cliente_nombre,
              nro_cliente:      parsed.nro_cliente,
              id_muestra:       o.id_muestra,
              fecha_recepcion:  fechas.fecha_recepcion,
              fecha_aprobacion: fechas.fecha_aprobacion,
              fecha_vencimiento: fechas.fecha_vencimiento,
              trello_columna:   trelloColumna,
              trello_url:       urlCard,
            };
            // id_muestra: sobrescritura con auditoría.
            if (candidatos.id_muestra) {
              const nuevoId  = String(candidatos.id_muestra).trim();
              const previoId = String(ya.id_muestra || '').trim();
              if (nuevoId && nuevoId !== previoId) {
                patch.id_muestra = nuevoId;
                try {
                  registrarEvento(nroOt,
                    'ID de muestra actualizada desde Trello: "' +
                    (previoId || '(vacío)') + '" → "' + nuevoId + '"', 'edit');
                } catch (_) {}
              }
            }
            // Resto de campos: modo conservador (solo si vacíos en DB).
            for (const k of Object.keys(candidatos)) {
              if (k === 'id_muestra') continue; // ya manejado arriba
              const nuevo = candidatos[k];
              if (nuevo && !String(ya[k] || '').trim()) patch[k] = nuevo;
            }
            // datos_faltantes: el dato manda sobre la etiqueta. Si el técnico
            // ya cargó un nro_ot / id_muestra válido en la DB, el flag se apaga
            // aunque la etiqueta "FALTA X" siga puesta en Trello (frecuente:
            // la secretaría se olvida de sacarla). Sólo flageamos cuando el
            // dato en DB es placeholder ("PEND-...") o vacío / "se debe dar".
            const faltantesActuales = [];
            const nroFinal = patch.nro_ot || ya.nro_ot;
            const idFinal  = String(patch.id_muestra || ya.id_muestra || '').trim();
            if (/^PEND-/.test(String(nroFinal))) faltantesActuales.push('nro_ot');
            if (!idFinal || /^se debe dar/i.test(idFinal)) faltantesActuales.push('id_muestra');
            const nuevoFlag = faltantesActuales.length > 0 ? JSON.stringify(faltantesActuales) : null;
            if ((ya.datos_faltantes || null) !== nuevoFlag) patch.datos_faltantes = nuevoFlag;
            // trello_oaa_label: sincronizar bidireccional con la etiqueta actual
            // de la card. Si el técnico sacó la etiqueta en Trello, se apaga.
            const nuevoOAA = esAcreditada ? 1 : 0;
            if ((ya.trello_oaa_label || 0) !== nuevoOAA) patch.trello_oaa_label = nuevoOAA;
            // es_preinforme: sync bidireccional con la etiqueta PRELIMINAR.
            // Al sacarla en Trello, se destilda el check en la OT.
            const nuevoPre = esPreliminar ? 1 : 0;
            if ((ya.es_preinforme || 0) !== nuevoPre) patch.es_preinforme = nuevoPre;
            if (Object.keys(patch).length > 0) {
              const sets = Object.keys(patch).map(k => `${k} = @${k}`).join(', ');
              db.prepare(`UPDATE ots SET ${sets}, actualizado_en = datetime('now') WHERE nro_ot = @nro_ot`)
                .run(Object.assign({}, patch, { nro_ot: nroOt }));
              try {
                registrarEvento(nroOt, 'OT completada desde Trello (bot) — campos: ' + Object.keys(patch).map(k => k.replace(/_/g, ' ')).join(', '), 'edit');
              } catch (_) {}
            }
            // Backfill de ensayos: si la OT no tiene ensayos cargados y el
            // checklist de Trello ahora detecta tipos, insertarlos. Cubre el
            // caso en que el bot importó la card antes de que el técnico
            // completara los checklists "M1 / M2 / ...".
            const yaTieneEnsayos = db.prepare('SELECT COUNT(*) AS n FROM ensayos WHERE nro_ot = ?').get(nroOt).n;
            const tiposBackfill = ensayosPorM[parseInt(o.muestra, 10)] || [];
            const ensayosAgregados = [];
            if (yaTieneEnsayos === 0 && tiposBackfill.length > 0) {
              const insEns = db.prepare('INSERT INTO ensayos (nro_ot, tipo, orden, datos_json) VALUES (?, ?, ?, ?)');
              tiposBackfill.forEach((tipo, i) => {
                try { insEns.run(nroOt, tipo, i + 1, ensayoDatosVacio); ensayosAgregados.push(tipo); }
                catch (e) { console.error('[bot-trello] backfill ensayo ' + tipo + ' OT ' + nroOt + ':', e.message); }
              });
              if (ensayosAgregados.length > 0) {
                try { registrarEvento(nroOt, 'Ensayos detectados desde checklist Trello (backfill): ' + ensayosAgregados.join(', '), 'add'); } catch (_) {}
              }
            }
            const motivosUpd = [];
            if (Object.keys(patch).length > 0) motivosUpd.push('campos: ' + Object.keys(patch).join(','));
            if (ensayosAgregados.length > 0) motivosUpd.push('ensayos: ' + ensayosAgregados.join(','));
            if (motivosUpd.length > 0) stats.skipeadas.push({ nro_ot: nroOt, motivo: 'ya existe (actualizado ' + motivosUpd.join(' | ') + ')' });
            else stats.skipeadas.push({ nro_ot: nroOt, motivo: 'ya existe' });
            continue;
          }
          // Detectar si es la primera OT de esta solicitud (para el evento
          // adicional "Solicitud creada" en el audit trail).
          const solYaTenia = parsed.nro_solicitud
            ? db.prepare('SELECT COUNT(*) AS n FROM ots WHERE nro_solicitud = ?').get(parsed.nro_solicitud).n
            : 0;
          db.prepare(`
            INSERT INTO ots (
              nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
              fecha_recepcion, fecha_aprobacion, fecha_finalizacion,
              fecha_vencimiento, trello_columna, trello_url, es_preinforme,
              datos_faltantes, trello_oaa_label, creado_en, actualizado_en
            ) VALUES (
              @nro_ot, @nro_solicitud, @nro_cliente, @razon_social, @id_muestra,
              @fecha_recepcion, @fecha_aprobacion, @fecha_finalizacion,
              @fecha_vencimiento, @trello_columna, @trello_url, @es_preinforme,
              @datos_faltantes, @trello_oaa_label, datetime('now'), datetime('now')
            )
          `).run({
            es_preinforme: esPreliminar ? 1 : 0,
            nro_ot: nroOt,
            nro_solicitud: parsed.nro_solicitud || null,
            nro_cliente: parsed.nro_cliente || null,
            razon_social: parsed.cliente_nombre || null,
            id_muestra: o.id_muestra || null,
            datos_faltantes: faltantesJson,
            trello_oaa_label: esAcreditada ? 1 : 0,
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
                insEns.run(nroOt, tipo, i + 1, ensayoDatosVacio);
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
            if (esAcreditada) {
              registrarEvento(nroOt, 'Marcada como OAA en Trello (etiqueta "PARAMETRO ACREDITADO") — es sólo señal, la acreditación real la valida agente-oaa', 'lock');
            }
            if (!fechas.fecha_aprobacion) {
              registrarEvento(nroOt, 'OT incompleta: sin fecha de aprobación (completar desde "Editar solicitud")', 'alertTri');
            }
            if (faltantes.length > 0) {
              const etqs = [];
              if (cardFaltaOt) etqs.push('FALTA O.T');
              if (cardFaltaId) etqs.push('FALTA ID');
              const detalle = faltantes.map(f => f === 'nro_ot' ? 'Nº de OT' : 'ID de muestra').join(', ');
              registrarEvento(nroOt, 'Faltan datos: ' + detalle + (etqs.length ? ' (etiqueta Trello: ' + etqs.join(' + ') + ')' : '') + ' — bloqueado para generar informe hasta completar', 'alertTri');
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
  console.log(`[bot-trello] iniciando · intervalo=${min}min · boards=${_boardIds().join(',')}`);
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
    board_ids: _boardIds(),
    columnas: (process.env.TRELLO_BOT_COLUMNAS || COLUMNAS_DEFAULT.join(',')).split(',').map(s => s.trim()),
    intervalo_min: parseInt(process.env.TRELLO_BOT_INTERVAL_MIN || String(INTERVALO_DEFAULT_MIN), 10),
    ultimo_scan: ultimoScan,
  };
}

module.exports = { iniciarBot, detenerBot, escanearYSyncOts, estadoBot };
