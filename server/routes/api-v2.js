/* api-v2.js — endpoints para el front nuevo (public-new/)
   Montado en /api junto a api.js */
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { detectarLote } = require('../agents/agente-oaa');
const { registrarEvento } = require('../utils/trazabilidad');

// ── Helpers ───────────────────────────────────────────────────────────────────
// Limpia caracteres Unicode invisibles que rompen el layout del Word
// (NBSP, ZWSP, ZWNJ, ZWJ, BOM, etc.) — Trello y copy/paste suelen agregarlos.
function sanitizarIdMuestra(s) {
  if (s == null) return null;
  const INVIS = /[\u00A0\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\uFEFF]/g;
  const TRAIL = /[\s\u00A0\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\uFEFF]+$/;
  const LEAD  = /^[\s\u00A0\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\uFEFF]+/;
  return String(s)
    .split('\n')
    .map(l => l.replace(INVIS, ' ').replace(/[ \t]+/g, ' ').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(LEAD, '')
    .replace(TRAIL, '');
}

function getOtRow(nro_ot) {
  return db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
}
function getEnsayoRow(id) {
  return db.prepare('SELECT * FROM ensayos WHERE id = ?').get(id);
}
function parseEnsayo(e) {
  if (!e) return null;
  let datos = {};
  try { datos = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : e.datos_json; } catch {}
  return { ...e, datos };
}

// ── GET /api/ots  (override: tipos_ensayo como array, incluye fotos_json) ─────
// NOTA: reemplaza la versión de api.js para este path (Express usa el primer match,
// pero ambas rutas coexisten en el mismo mount — si hay conflicto mover esto a api.js).
// Para evitar conflicto lo exponemos como GET /api/ots-v2 y el store-api.js lo llama.
router.get('/ots-v2', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT o.*, GROUP_CONCAT(e.tipo ORDER BY e.orden) AS _tipos
      FROM ots o
      LEFT JOIN ensayos e ON e.nro_ot = o.nro_ot
      GROUP BY o.nro_ot
      ORDER BY o.creado_en DESC
    `).all();
    const ots = rows.map(r => {
      const tipos = r._tipos ? r._tipos.split(',') : [];
      const { _tipos, ...rest } = r;
      return { ...rest, tipos_ensayo: tipos };
    });
    res.json(ots);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/ensayos  (todos los ensayos planos) ──────────────────────────────
// Optimización: descarta los `dataUrl` base64 de cualquier campo `imagenes*` en
// datos_json antes de devolver. Un ensayo con 4 fotos puede pesar 5MB y con 20
// ensayos así el payload de init supera el límite del servidor (50MB) y algunos
// llegan truncados → al abrir el form las imágenes no aparecen.
// Se preservan `name` y `caption` para que los listados y previews funcionen.
// El EnsayoForm hace fetch lazy de /api/ensayo/:id al montar, que devuelve
// datos_json COMPLETO con dataUrl.
function stripDataUrls(datosJsonStr) {
  if (!datosJsonStr || typeof datosJsonStr !== 'string') return datosJsonStr;
  try {
    const d = JSON.parse(datosJsonStr);
    let modificado = false;
    for (const key of Object.keys(d)) {
      if (!/^imagenes/i.test(key)) continue;
      if (!Array.isArray(d[key])) continue;
      d[key] = d[key].map((img) => {
        if (img && typeof img === 'object' && img.dataUrl) {
          modificado = true;
          const { dataUrl, ...resto } = img;
          return { ...resto, _dataUrlStripped: true };
        }
        return img;
      });
    }
    return modificado ? JSON.stringify(d) : datosJsonStr;
  } catch { return datosJsonStr; }
}

router.get('/ensayos', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM ensayos ORDER BY nro_ot, orden').all();
    const light = rows.map(r => Object.assign({}, r, { datos_json: stripDataUrls(r.datos_json) }));
    res.json(light);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/ensayo/:id  (con datos parseados) ────────────────────────────────
router.get('/ensayo/:id', (req, res) => {
  try {
    const e = getEnsayoRow(req.params.id);
    if (!e) return res.status(404).json({ error: 'Ensayo no encontrado' });
    res.json(parseEnsayo(e));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/ensayo  (override con soporte de id explícito + return objeto) ──
// Sombrea la ruta de api.js porque Express usa orden de registro.
// IMPORTANTE: este router se monta ANTES de api.js en index.js.
router.post('/ensayo', (req, res) => {
  try {
    const firma = require('../utils/firma');
    const { absorberOtros } = require('../utils/catalogo-auto');
    const { id, nro_ot, tipo, orden, datos_json, force_create } = req.body;
    if (!nro_ot || !tipo || !datos_json) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    let jsonStr = typeof datos_json === 'string' ? datos_json : JSON.stringify(datos_json);
    // Parseo defensivo para absorber "otros" al catálogo tras guardar exitoso.
    let datosObj = null;
    try { datosObj = typeof datos_json === 'string' ? JSON.parse(datos_json) : datos_json; } catch {}

    // Protección anti-pérdida: si el request trae items con `_dataUrlStripped: true`
    // (no llegó a hidratarse el fetch lazy), fusionar con el datos_json que ya
    // tiene la DB. Preservamos dataUrl por nombre de archivo.
    if (datosObj && id) {
      const existente = db.prepare('SELECT datos_json FROM ensayos WHERE id = ?').get(id);
      if (existente) {
        let datosPrev = {};
        try { datosPrev = JSON.parse(existente.datos_json || '{}'); } catch {}
        let hidratado = false;
        for (const key of Object.keys(datosObj)) {
          if (!/^imagenes/i.test(key)) continue;
          if (!Array.isArray(datosObj[key])) continue;
          const prevArr = Array.isArray(datosPrev[key]) ? datosPrev[key] : [];
          datosObj[key] = datosObj[key].map((img) => {
            if (img && img._dataUrlStripped && !img.dataUrl) {
              const match = prevArr.find((p) => p && p.name === img.name);
              if (match && match.dataUrl) {
                hidratado = true;
                const { _dataUrlStripped, ...rest } = img;
                return Object.assign({}, rest, { dataUrl: match.dataUrl });
              }
            }
            return img;
          });
        }
        if (hidratado) {
          jsonStr = JSON.stringify(datosObj);
          console.log('[POST /ensayo] hidratados dataUrl de imágenes stripped al guardar id=' + id);
        }
      }
    }

    // Bloqueo: si el ensayo está firmado o aprobado, devolver 423.
    function bloquearSiFirmado(row) {
      if (!row || !row.estado_firma || row.estado_firma === 'abierto') return null;
      const esAprobado = row.estado_firma === 'autorizado';
      return {
        status: 423,
        body: {
          error: esAprobado
            ? 'Ensayo APROBADO — bloqueado. Desfirmá con un token de AUTORIZANTE para poder editar.'
            : 'Ensayo FIRMADO — bloqueado. Desfirmá con un token para poder editar.',
          code: esAprobado ? 'ENSAYO_APROBADO' : 'ENSAYO_FIRMADO',
          ensayo_id: row.id,
          estado_firma: row.estado_firma,
        },
      };
    }

    if (id) {
      // Actualizar por id explícito
      const existente = getEnsayoRow(id);
      if (!existente) return res.status(404).json({ error: 'Ensayo no encontrado' });
      const blk = bloquearSiFirmado(existente);
      if (blk) return res.status(blk.status).json(blk.body);
      db.prepare('UPDATE ensayos SET datos_json = ?, orden = ? WHERE id = ?')
        .run(jsonStr, orden ?? existente.orden, id);
      if (datosObj) { try { absorberOtros(datosObj, tipo); } catch (e) { console.warn('[catalogo-auto]', e.message); } }
      return res.json(parseEnsayo(getEnsayoRow(id)));
    }

    // force_create: el front nuevo lo manda al crear un ensayo nuevo (aunque ya exista
    // uno del mismo tipo en la OT). Sin el flag mantenemos el upsert-por-tipo legacy.
    if (!force_create) {
      const existente = db.prepare('SELECT id, orden, estado_firma FROM ensayos WHERE nro_ot = ? AND tipo = ?').get(nro_ot, tipo);
      if (existente) {
        const blk = bloquearSiFirmado(existente);
        if (blk) return res.status(blk.status).json(blk.body);
        db.prepare('UPDATE ensayos SET datos_json = ?, orden = ? WHERE id = ?')
          .run(jsonStr, orden ?? existente.orden, existente.id);
        if (datosObj) { try { absorberOtros(datosObj, tipo); } catch (e) { console.warn('[catalogo-auto]', e.message); } }
        return res.json(parseEnsayo(getEnsayoRow(existente.id)));
      }
    }
    const maxOrden = db.prepare('SELECT MAX(orden) as m FROM ensayos WHERE nro_ot = ?').get(nro_ot);
    const nuevoOrden = orden ?? ((maxOrden?.m || 0) + 1);
    const info = db.prepare('INSERT INTO ensayos (nro_ot, tipo, orden, datos_json) VALUES (?, ?, ?, ?)')
      .run(nro_ot, tipo, nuevoOrden, jsonStr);
    if (datosObj) { try { absorberOtros(datosObj, tipo); } catch (e) { console.warn('[catalogo-auto]', e.message); } }
    res.json(parseEnsayo(getEnsayoRow(info.lastInsertRowid)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/ot  (override: devuelve objeto OT completo) ─────────────────────
router.post('/ot', (req, res) => {
  try {
    const { nro_ot, nro_solicitud, nro_cliente, razon_social,
            fecha_recepcion, fecha_aprobacion, fecha_finalizacion, trello_url } = req.body;
    const id_muestra = sanitizarIdMuestra(req.body.id_muestra);
    if (!nro_ot || !nro_solicitud || !razon_social)
      return res.status(400).json({ error: 'Faltan campos obligatorios (nro_ot, nro_solicitud, razon_social)' });

    if (nro_cliente && nro_cliente !== '0') {
      db.prepare(`
        INSERT INTO clientes (nro_cliente, razon_social)
        VALUES (@nro_cliente, @razon_social)
        ON CONFLICT(nro_cliente) DO UPDATE SET razon_social = excluded.razon_social
      `).run({ nro_cliente, razon_social });
    }

    // Detectar antes del UPSERT: si la OT ya existía y si es la primera OT
    // de su solicitud, para registrar el evento correcto en auditoría.
    const yaExistia = !!db.prepare('SELECT 1 FROM ots WHERE nro_ot = ?').get(nro_ot);
    const solYaTenia = nro_solicitud
      ? db.prepare('SELECT COUNT(*) AS n FROM ots WHERE nro_solicitud = ? AND nro_ot != ?').get(nro_solicitud, nro_ot).n
      : 0;

    db.prepare(`
      INSERT INTO ots (nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
                       fecha_recepcion, fecha_aprobacion, fecha_finalizacion, trello_url)
      VALUES (@nro_ot, @nro_solicitud, @nro_cliente, @razon_social, @id_muestra,
              @fecha_recepcion, @fecha_aprobacion, @fecha_finalizacion, @trello_url)
      ON CONFLICT(nro_ot) DO UPDATE SET
        nro_solicitud = excluded.nro_solicitud,
        nro_cliente = excluded.nro_cliente,
        razon_social = excluded.razon_social,
        id_muestra = excluded.id_muestra,
        fecha_recepcion = excluded.fecha_recepcion,
        fecha_aprobacion = excluded.fecha_aprobacion,
        fecha_finalizacion = excluded.fecha_finalizacion,
        trello_url = excluded.trello_url
    `).run({ nro_ot, nro_solicitud, nro_cliente: nro_cliente || null, razon_social,
             id_muestra: id_muestra || null,
             fecha_recepcion: fecha_recepcion || null,
             fecha_aprobacion: fecha_aprobacion || null,
             fecha_finalizacion: fecha_finalizacion || null,
             trello_url: trello_url || null });

    // Auditoría: OT creada / actualizada + evento de solicitud nueva.
    try {
      if (!yaExistia) {
        registrarEvento(nro_ot, 'OT creada', 'add');
        if (nro_solicitud && solYaTenia === 0) {
          registrarEvento(nro_ot, 'Solicitud ' + nro_solicitud + ' creada (primera OT: ' + nro_ot + ')', 'add');
        }
      } else {
        registrarEvento(nro_ot, 'OT actualizada', 'edit');
      }
    } catch (e) { console.error('[api-v2/POST ot] fallo registrarEvento:', e.message); }

    res.json(getOtRow(nro_ot));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/ot/:nro_ot  (override: acepta más campos actualizables) ────────
router.patch('/ot/:nro_ot', (req, res) => {
  const { nro_ot } = req.params;
  const allowed = ['es_preinforme', 'fecha_aprobacion', 'fecha_finalizacion', 'fecha_recepcion',
                   'trello_url', 'razon_social', 'nro_cliente', 'id_muestra',
                   'fecha_vencimiento', 'trello_columna', 'inspeccion_texto'];
  const sets = [], vals = [], cambios = [];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); cambios.push(k); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos actualizables' });
  vals.push(nro_ot);
  try {
    db.prepare(`UPDATE ots SET ${sets.join(', ')} WHERE nro_ot = ?`).run(...vals);
    try {
      const campos = cambios.map(c => c.replace(/_/g, ' ')).join(', ');
      registrarEvento(nro_ot, 'OT modificada — campos: ' + campos, 'edit');
    } catch (e) { console.error('[api-v2/PATCH ot] fallo registrarEvento:', e.message); }
    res.json(getOtRow(nro_ot));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/ot/:nro_ot/duplicate ───────────────────────────────────────────
router.post('/ot/:nro_ot/duplicate', (req, res) => {
  try {
    const src = getOtRow(req.params.nro_ot);
    if (!src) return res.status(404).json({ error: 'OT origen no encontrada' });
    const { nro_ot: nuevo_nro, nro_solicitud, id_muestra, trello_url, copiar_ensayos, copiar_fotos } = req.body;
    if (!nuevo_nro) return res.status(400).json({ error: 'Falta nro_ot destino' });

    // UPSERT — store-api.js puede haber pre-creado la OT vía createOt; en ese
    // caso reemplazamos los datos con los de la fuente para conservar la
    // configuración (id_muestra, cliente, fotos, fechas) del modelo original.
    db.prepare(`
      INSERT INTO ots (nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
                       fecha_recepcion, fecha_aprobacion, fecha_finalizacion, trello_url, fotos_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(nro_ot) DO UPDATE SET
        nro_solicitud      = excluded.nro_solicitud,
        nro_cliente        = excluded.nro_cliente,
        razon_social       = excluded.razon_social,
        id_muestra         = excluded.id_muestra,
        fecha_recepcion    = excluded.fecha_recepcion,
        fecha_aprobacion   = excluded.fecha_aprobacion,
        fecha_finalizacion = excluded.fecha_finalizacion,
        trello_url         = excluded.trello_url,
        fotos_json         = excluded.fotos_json
    `).run(nuevo_nro,
           nro_solicitud || null,
           src.nro_cliente,
           src.razon_social,
           id_muestra || src.id_muestra,
           src.fecha_recepcion    || null,
           src.fecha_aprobacion   || null,
           src.fecha_finalizacion || null,
           trello_url || null,
           copiar_fotos ? src.fotos_json : null);

    // Si ya había ensayos para esa OT destino (de un duplicado previo o de
    // createOt local), los borramos antes de copiar — evita duplicación.
    if (copiar_ensayos) {
      db.prepare('DELETE FROM ensayos WHERE nro_ot = ?').run(nuevo_nro);
    }

    if (copiar_ensayos) {
      const ensayos = db.prepare('SELECT * FROM ensayos WHERE nro_ot = ? ORDER BY orden').all(req.params.nro_ot);
      const ins = db.prepare('INSERT INTO ensayos (nro_ot, tipo, orden, datos_json) VALUES (?, ?, ?, ?)');
      const tx = db.transaction(() => { for (const e of ensayos) ins.run(nuevo_nro, e.tipo, e.orden, e.datos_json); });
      tx();
    }

    try {
      registrarEvento(nuevo_nro, 'OT duplicada desde ' + req.params.nro_ot + (copiar_ensayos ? ' (con ensayos)' : ''), 'copy');
    } catch (e) { console.error('[api-v2/duplicate] fallo registrarEvento:', e.message); }

    res.json(getOtRow(nuevo_nro));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/ot/:nro_ot/reorder-ensayos ────────────────────────────────────
router.patch('/ot/:nro_ot/reorder-ensayos', (req, res) => {
  try {
    const { ordered_ids } = req.body;
    if (!Array.isArray(ordered_ids)) return res.status(400).json({ error: 'ordered_ids debe ser array' });
    const upd = db.prepare('UPDATE ensayos SET orden = ? WHERE id = ?');
    const tx  = db.transaction(() => { ordered_ids.forEach((id, i) => upd.run(i + 1, id)); });
    tx();
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/ot/:nro_ot/fotos  (JSON base64) ─────────────────────────────────
router.put('/ot/:nro_ot/fotos', (req, res) => {
  try {
    const fotos = req.body; // array de {dataUrl, name}
    if (!Array.isArray(fotos)) return res.status(400).json({ error: 'Body debe ser array' });
    db.prepare('UPDATE ots SET fotos_json = ? WHERE nro_ot = ?')
      .run(JSON.stringify(fotos), req.params.nro_ot);
    res.json({ ok: true, count: fotos.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Eventos ───────────────────────────────────────────────────────────────────
router.get('/ot/:nro_ot/eventos', (req, res) => {
  try {
    const rows = db.prepare('SELECT texto, icon, fecha FROM eventos WHERE nro_ot = ? ORDER BY fecha DESC').all(req.params.nro_ot);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ot/:nro_ot/eventos', (req, res) => {
  try {
    const { texto, icon } = req.body;
    if (!texto) return res.status(400).json({ error: 'Falta texto' });
    const info = db.prepare('INSERT INTO eventos (nro_ot, texto, icon) VALUES (?, ?, ?)')
      .run(req.params.nro_ot, texto, icon || 'check');
    const ev = db.prepare('SELECT texto, icon, fecha FROM eventos WHERE id = ?').get(info.lastInsertRowid);
    res.json(ev);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Clientes ──────────────────────────────────────────────────────────────────
router.get('/clientes', (req, res) => {
  try {
    const clientes = db.prepare('SELECT * FROM clientes').all();
    const result = clientes.map(c => {
      const ots = db.prepare('SELECT creado_en, nro_solicitud FROM ots WHERE nro_cliente = ? ORDER BY creado_en DESC').all(c.nro_cliente);
      const solicitudesSet = new Set();
      ots.forEach(o => { if (o.nro_solicitud) solicitudesSet.add(String(parseInt(o.nro_solicitud, 10) || o.nro_solicitud)); });
      return {
        ...c,
        ot_count:        ots.length,
        solicitud_count: solicitudesSet.size,
        last_activity:   ots.length ? (ots[0].creado_en || '').slice(0, 10) : '',
      };
    });
    result.sort((a, b) => b.ot_count - a.ot_count);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Elimina clientes que no tienen ninguna OT asociada.
router.delete('/clientes/sin-ots', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT c.nro_cliente FROM clientes c
      LEFT JOIN ots o ON o.nro_cliente = c.nro_cliente
      GROUP BY c.nro_cliente
      HAVING COUNT(o.id) = 0
    `).all();
    const ids = rows.map(r => r.nro_cliente);
    if (ids.length === 0) return res.json({ ok: true, borrados: 0, ids: [] });
    const del = db.prepare('DELETE FROM clientes WHERE nro_cliente = ?');
    db.transaction(() => { for (const id of ids) del.run(id); })();
    res.json({ ok: true, borrados: ids.length, ids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cliente/:nro', (req, res) => {
  try {
    const nro = req.params.nro;
    const hasOts = db.prepare('SELECT COUNT(*) as n FROM ots WHERE nro_cliente = ?').get(nro).n > 0;
    if (hasOts) return res.status(409).json({ error: 'El cliente tiene OTs asociadas. No se puede eliminar.' });
    db.prepare('DELETE FROM clientes WHERE nro_cliente = ?').run(nro);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cliente override: devuelve objeto cliente
router.post('/cliente', (req, res) => {
  try {
    const { nro_cliente, razon_social, fantasia, cuit, contacto, email, telefono, localidad } = req.body;
    if (!nro_cliente || !razon_social) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    db.prepare(`
      INSERT INTO clientes (nro_cliente, razon_social, fantasia, cuit, contacto, email, telefono, localidad)
      VALUES (@nro_cliente, @razon_social, @fantasia, @cuit, @contacto, @email, @telefono, @localidad)
      ON CONFLICT(nro_cliente) DO UPDATE SET
        razon_social = excluded.razon_social, fantasia = excluded.fantasia,
        cuit = excluded.cuit, contacto = excluded.contacto, email = excluded.email,
        telefono = excluded.telefono, localidad = excluded.localidad
    `).run({ nro_cliente, razon_social, fantasia: fantasia || null,
             cuit: cuit || null, contacto: contacto || null, email: email || null,
             telefono: telefono || null, localidad: localidad || null });
    res.json(db.prepare('SELECT * FROM clientes WHERE nro_cliente = ?').get(nro_cliente));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Equipos ───────────────────────────────────────────────────────────────────
// GET /api/equipos              → todos los equipos (para admin).
// GET /api/equipos?tipo=impacto → equipos aplicables a ese tipo de ensayo.
//                                 Filtra por el JSON array `ensayos`.
// GET /api/equipos?sede=neuquen → filtra por sede.
router.get('/equipos', (req, res) => {
  try {
    const tipoEnsayo = req.query.tipo ? String(req.query.tipo) : null;
    const sede       = req.query.sede ? String(req.query.sede) : null;
    let rows = db.prepare('SELECT * FROM equipos WHERE (activo IS NULL OR activo = 1) ORDER BY id').all();
    // Parsear el campo `ensayos` (JSON) para cada fila.
    rows = rows.map(r => {
      let ens = [];
      try { ens = JSON.parse(r.ensayos || '[]'); } catch {}
      return Object.assign({}, r, { ensayos: Array.isArray(ens) ? ens : [] });
    });
    if (tipoEnsayo) rows = rows.filter(r => r.ensayos.indexOf(tipoEnsayo) >= 0);
    if (sede) rows = rows.filter(r => !r.sede || r.sede === sede);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/equipos', (req, res) => {
  try {
    const { id, nombre, nombre_corto, tipo, sede, modelo, capacidad, certificado,
            fecha_calibracion, vencimiento, patron, ensayos, activo } = req.body;
    if (!id || !nombre) return res.status(400).json({ error: 'Faltan campos obligatorios (id, nombre)' });
    const ensayosJson = JSON.stringify(Array.isArray(ensayos) ? ensayos : []);
    db.prepare(`
      INSERT INTO equipos (id, nombre, nombre_corto, tipo, sede, modelo, capacidad, certificado,
                           fecha_calibracion, vencimiento, patron, ensayos, activo)
      VALUES (@id, @nombre, @nombre_corto, @tipo, @sede, @modelo, @capacidad, @certificado,
              @fecha_calibracion, @vencimiento, @patron, @ensayos, @activo)
      ON CONFLICT(id) DO UPDATE SET
        nombre = excluded.nombre, nombre_corto = excluded.nombre_corto,
        tipo = excluded.tipo, sede = excluded.sede,
        modelo = excluded.modelo, capacidad = excluded.capacidad, certificado = excluded.certificado,
        fecha_calibracion = excluded.fecha_calibracion, vencimiento = excluded.vencimiento,
        patron = excluded.patron, ensayos = excluded.ensayos, activo = excluded.activo
    `).run({
      id, nombre, nombre_corto: nombre_corto || null,
      tipo: tipo || null, sede: sede || null, modelo: modelo || null,
      capacidad: capacidad || null, certificado: certificado || null,
      fecha_calibracion: fecha_calibracion || null, vencimiento: vencimiento || null,
      patron: patron || null, ensayos: ensayosJson,
      activo: activo === false || activo === 0 ? 0 : 1,
    });
    const row = db.prepare('SELECT * FROM equipos WHERE id = ?').get(id);
    let ens = []; try { ens = JSON.parse(row.ensayos || '[]'); } catch {}
    res.json(Object.assign({}, row, { ensayos: ens }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/equipos/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM equipos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Normas ────────────────────────────────────────────────────────────────────
router.get('/normas', (req, res) => {
  try { res.json(db.prepare('SELECT * FROM normas').all()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/normas', (req, res) => {
  try {
    const { codigo, clase, titulo, tipo, version, vigente } = req.body;
    if (!codigo || !clase || !titulo || !tipo) return res.status(400).json({ error: 'Faltan campos obligatorios' });
    db.prepare(`
      INSERT INTO normas (codigo, clase, titulo, tipo, version, vigente)
      VALUES (@codigo, @clase, @titulo, @tipo, @version, @vigente)
      ON CONFLICT(codigo) DO UPDATE SET
        clase = excluded.clase, titulo = excluded.titulo, tipo = excluded.tipo,
        version = excluded.version, vigente = excluded.vigente
    `).run({ codigo, clase, titulo, tipo, version: version || null, vigente: vigente ? 1 : 0 });
    res.json(db.prepare('SELECT * FROM normas WHERE codigo = ?').get(codigo));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/normas/:codigo', (req, res) => {
  try {
    db.prepare('DELETE FROM normas WHERE codigo = ?').run(decodeURIComponent(req.params.codigo));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── OAA acreditación (100% automático, sin overrides) ───────────────────────
// GET /api/oaa-preview/:nro_ot — devuelve para cada ensayo si está acreditado
// y si va a llevar (*) en el Word, según el alcance del PDF (LE 012).
router.get('/oaa-preview/:nro_ot', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const ot = getOtRow(nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    const ensayos = db.prepare('SELECT * FROM ensayos WHERE nro_ot = ? ORDER BY orden').all(nro_ot)
      .map(parseEnsayo);
    const detecciones = detectarLote(
      ensayos.map(e => ({ id: e.id, tipo: e.tipo, datos: e.datos }))
    );
    res.json({ nro_ot, sede: 'CABA (acreditada) / Neuquén (no acreditada)', detecciones });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
