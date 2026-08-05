require('dotenv').config();
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fetch = require('node-fetch');
const db = require('../db');
const { generarWordCompleto, aplicarVersionEncabezado } = require('../generators/word-generator');
const {
  guardarEnDrive, detectarCarpeta, guardarEnCarpeta,
  listarSubcarpetas, ROOT_DRIVE, filenamePorCliente,
} = require('../utils/guardar-en-drive');
const versionado = require('../utils/versionado');
const { exec, spawn } = require('child_process');
const pathMod = require('path');
const fsMod = require('fs');
const crypto = require('crypto');
const firma = require('../utils/firma');
const { chequearEquiposVencidos } = require('../utils/equipos-check');
const {
  registrarEvento, registrarHistorialEnsayo,
  registrarInformeEmitido, registrarFirma,
} = require('../utils/trazabilidad');

const upload = multer({ storage: multer.memoryStorage() });

// ─── Trello proxy ─────────────────────────────────────────────────────────────

router.get('/trello/card', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Falta parámetro url' });

  const match = url.match(/trello\.com\/c\/([^/]+)/);
  if (!match) return res.status(400).json({ error: 'URL de Trello inválida' });

  const cardId = match[1];
  const key   = process.env.TRELLO_KEY;
  const token = process.env.TRELLO_TOKEN;

  // Diagnóstico previo: si el server no tiene credenciales, avisar antes de
  // gastar timeout intentando llamar a la API.
  if (!key || !token) {
    return res.status(500).json({
      error: 'El servidor no tiene credenciales de Trello configuradas.',
      hint: 'Faltan las variables TRELLO_KEY / TRELLO_TOKEN en el .env del servidor.',
      stage: 'config',
    });
  }

  try {
    const resp = await fetch(
      `https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}&fields=name,desc,due,dueComplete,idList&customFieldItems=true`,
      { timeout: 10000 }
    );
    if (!resp.ok) {
      // Distinguir el modo de falla por HTTP status para dar un hint accionable.
      let hint = null;
      if (resp.status === 401) hint = 'Token de Trello inválido o expirado. Regenerar TRELLO_TOKEN en trello.com/app-key.';
      else if (resp.status === 404) hint = 'La tarjeta no existe o el token no tiene permiso sobre ese tablero.';
      else if (resp.status === 429) hint = 'Rate limit de Trello superado. Esperá 1 minuto y reintentá.';
      else if (resp.status >= 500)  hint = 'Trello está devolviendo error de servidor. Reintentar en unos minutos.';
      let body = '';
      try { body = (await resp.text()).slice(0, 200); } catch {}
      return res.status(resp.status).json({
        error: `Trello respondió HTTP ${resp.status}`,
        hint, body, stage: 'trello-api',
      });
    }

    const card = await resp.json();
    // En paralelo: nombre de la columna + definiciones de custom fields del board.
    let columnaNombre = null;
    let customFieldsDefs = [];
    let idBoard = null;
    if (card.idList) {
      try {
        const rList = await fetch(
          `https://api.trello.com/1/lists/${card.idList}?key=${key}&token=${token}&fields=name,idBoard`,
          { timeout: 5000 }
        );
        if (rList.ok) {
          const listInfo = await rList.json();
          columnaNombre = listInfo.name || null;
          idBoard = listInfo.idBoard || null;
        }
      } catch {}
    }
    if (idBoard) {
      try {
        const rCF = await fetch(
          `https://api.trello.com/1/boards/${idBoard}/customFields?key=${key}&token=${token}`,
          { timeout: 5000 }
        );
        if (rCF.ok) customFieldsDefs = await rCF.json();
      } catch {}
    }
    const parsed = parsearTarjeta(card, url);
    // Vencimiento de Trello → guardado como ISO date (YYYY-MM-DD) si vino.
    if (card.due) {
      parsed.fecha_vencimiento = String(card.due).slice(0, 10);
      parsed.due_completo = !!card.dueComplete;
    }
    if (columnaNombre) parsed.trello_columna = columnaNombre;

    // Fecha de RECEPCIÓN = fecha de creación de la tarjeta. En Mongo/Trello,
    // los primeros 8 chars hex del id son un timestamp Unix (segundos).
    try {
      const hex = String(card.id || '').slice(0, 8);
      if (/^[0-9a-f]{8}$/i.test(hex)) {
        const ts = parseInt(hex, 16) * 1000;
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          const pad = n => String(n).padStart(2, '0');
          parsed.fecha_recepcion = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        }
      }
    } catch {}

    // Fecha de APROBACIÓN = custom field "Fecha de aprobación" (o similar).
    // Busco un custom field cuyo nombre contenga "aprobac" (case/acentos-insensitive)
    // y extraigo el value.date del card.customFieldItems que matchee.
    try {
      const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const cfAprob = (customFieldsDefs || []).find(cf => /aprobac/.test(normalizar(cf.name)));
      const items = Array.isArray(card.customFieldItems) ? card.customFieldItems : [];
      if (cfAprob) {
        const item = items.find(it => it.idCustomField === cfAprob.id);
        if (item && item.value && item.value.date) {
          const d = new Date(item.value.date);
          if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            parsed.fecha_aprobacion = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
          }
        }
      }
    } catch (e) { console.warn('[trello] no se pudo leer fecha_aprobacion:', e.message); }

    res.json(parsed);
  } catch (err) {
    // Errores de red al llamar a Trello (DNS/timeout/proxy). Detallamos para
    // que el frontend distinga "servidor sin Internet" vs "Trello caído".
    const code = err && (err.code || err.errno) || null;
    let hint = 'Error inesperado al llamar a Trello.';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      hint = 'El servidor no pudo resolver api.trello.com — probablemente la PC del servicio no tiene Internet o el DNS está roto.';
    } else if (code === 'ETIMEDOUT' || err.name === 'FetchError' && /timeout/i.test(err.message)) {
      hint = 'Timeout esperando respuesta de Trello. Puede ser Internet lento, firewall bloqueando salida HTTPS, o Trello no responde.';
    } else if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
      hint = 'La conexión a Trello fue rechazada o cortada. Revisar firewall del servidor.';
    } else if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      hint = 'Problema con certificados TLS del servidor.';
    }
    console.warn('[trello/card] error:', code || err.name, '-', err.message);
    res.status(502).json({
      error: err.message || 'Fallo al conectar con Trello',
      hint,
      code,
      stage: 'network',
    });
  }
});

function parsearTarjeta(card, urlOriginal) {
  const titulo = card.name || '';
  // Eliminar marcadores de negrita/cursiva de Markdown (**text**, __text__, *text*)
  const desc   = (card.desc || '').replace(/\*\*/g, '').replace(/__/g, '');

  // Título: "CLIENTE - NUMERO [- OTRAS COSAS]" o "CLIENTE NUMERO" (sin guión).
  // Ejemplos reales:
  //   "FERPLAST S.A. - 38079"                          → CINTOLO=FERPLAST S.A., nro=38079
  //   "CINTOLO - URGENTE 72h (AS400) - 0000179"        → CINTOLO=CINTOLO,        nro=179
  //   "TASSAROLI SA - 38059"                           → CINTOLO=TASSAROLI SA,   nro=38059
  // Estrategia: cliente = primer segmento; nro_solicitud = último segmento si es numérico,
  // o fallback a los últimos dígitos del título completo.
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
    // Fallback: último token separado por espacio como número de solicitud
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

  // Número de cliente: "Cliente: 85817" o "Nro Cliente: 83667"
  const nroClienteM = desc.match(/^(?:Nro\s+)?Cliente:\s*(\S+)/m);
  const nro_cliente = nroClienteM?.[1]?.trim() || '';

  // ─── Parser de OTs línea por línea ────────────────────────────────────────
  // Formatos reales detectados en las tarjetas:
  //   M1 (O.T. 534200): DESCRIPCION ...       → grupos 1,2
  //   M1 (O.T.534055): LENOR 02-B3586         → grupos 1,2  (sin espacio)
  //   M1 (OT 534372) ID: DUCTO 6004           → grupos 1,2
  //   M1 (OT: 535521): COLADA N°21294         → grupos 1,2  (con dos puntos)
  //   M3 (OT :535523 ): COLADA N°54160        → grupos 1,2  (espacios sueltos)
  //   OT1 (534355): SEPARADOR SB-807          → grupos 3,4
  //   (OT 534333) M1: CUPON Nº 17105          → grupos 5,6
  //   (OT: 534333) M1: CUPON …                → grupos 5,6  (con dos puntos)
  //   (O.T) M1: CONJUNTO DE CUPLAS            → grupo 7 (sin nro_ot aún)
  // El fragmento `O\.?T\.?\s*:?\s*` tolera "OT", "O.T", "OT:", "OT :", "O.T. ".
  const OT_LINE = /^(?:M(\d+)\s*\(\s*O\.?T\.?\s*:?\s*(\d+)\s*\)|OT(\d+)\s*\(\s*(\d+)\s*\)|\(\s*O\.?T\.?\s*:?\s*(\d+)\s*\)\s*M(\d+)|\(\s*O\.T\.?\s*\)\s*M(\d+))\s*:?\s*(?:ID:)?\s*(.*)/i;

  const lineas = desc.split('\n');
  const ots    = [];
  let actual   = null;

  for (const linea of lineas) {
    const m = linea.match(OT_LINE);
    if (m) {
      if (actual) ots.push(finalizarOT(actual));
      // Grupos: M(n) (OT n) → (1,2); OT(n) (n) → (3,4); (OT n) M(n) → (5,6); (O.T) M(n) → (7); desc → 8
      const muestra = m[1] || m[3] || m[6] || m[7];
      const nro_ot  = m[2] || m[4] || m[5] || '';
      const desc0   = m[8];
      actual = { muestra, nro_ot: (nro_ot || '').trim(), partes: [desc0.trim()] };
    } else if (actual) {
      const trim = linea.trim();
      if (/^Observaciones:/i.test(trim)) {
        ots.push(finalizarOT(actual));
        actual = null;
        break;
      }
      if (trim) actual.partes.push(trim);
    }
  }
  if (actual) ots.push(finalizarOT(actual));

  return { nro_solicitud, nro_cliente, cliente_nombre: clienteNombre, ots, trello_url: urlOriginal };
}

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

function finalizarOT({ muestra, nro_ot, partes }) {
  // Respeta el formato multilínea de la tarjeta de Trello:
  //  - Cada elemento queda en su propia línea (con \n)
  //  - Se colapsan espacios MÚLTIPLES DENTRO de cada línea ("Norma:  ASME"  →  "Norma: ASME")
  //  - Se filtran líneas vacías
  //  - Se filtra "Ensayos requeridos: ..." (info interna, no va en el informe)
  //  - Se limpian caracteres Unicode invisibles que trim() estándar no toca
  //    (NBSP, ZWSP, ZWNJ, ZWJ, BOM, etc.) — Trello suele insertarlos al final
  //    de la descripción y empujan la imagen de carátula a otra página.
  const INVIS = /[\u00A0\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\uFEFF]/g;
  const lineas = partes
    .map(p => String(p || '').replace(INVIS, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0)
    .filter(p => !/^\s*ensayos\s+requeridos/i.test(p));
  const id_muestra = lineas
    .join('\n')
    .replace(/^["']|["']$/g, '')
    .replace(/^[\s\u00A0\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\uFEFF]+/, '')
    .replace(/[\s\u00A0\u2000-\u200D\u2028\u2029\u202F\u205F\u2060\uFEFF]+$/, '');
  return { muestra, nro_ot, id_muestra };
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

router.get('/cliente/:nro_cliente', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM clientes WHERE nro_cliente = ?').get(req.params.nro_cliente);
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cliente', (req, res) => {
  try {
    const { nro_cliente, razon_social, fantasia } = req.body;
    if (!nro_cliente || !razon_social) return res.status(400).json({ error: 'Faltan campos obligatorios' });

    db.prepare(`
      INSERT INTO clientes (nro_cliente, razon_social, fantasia)
      VALUES (@nro_cliente, @razon_social, @fantasia)
      ON CONFLICT(nro_cliente) DO UPDATE SET razon_social = excluded.razon_social, fantasia = excluded.fantasia
    `).run({ nro_cliente, razon_social, fantasia: fantasia || null });

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── OTs ──────────────────────────────────────────────────────────────────────

router.get('/ots', (req, res) => {
  try {
    const ots = db.prepare(`
      SELECT o.*, GROUP_CONCAT(e.tipo ORDER BY e.orden) AS tipos_ensayo
      FROM ots o
      LEFT JOIN ensayos e ON e.nro_ot = o.nro_ot
      GROUP BY o.nro_ot
      ORDER BY o.creado_en DESC
    `).all();
    res.json(ots);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Devuelve la carpeta local del informe más reciente para una solicitud.
// Se usa para el botón "abrir carpeta" (labopen://) desde el banner de
// vencimientos. Prioriza `ots.informe_path`; fallback a `informes_emitidos`.
router.get('/solicitud/:nro/carpeta', (req, res) => {
  try {
    const nro = String(req.params.nro || '').trim();
    if (!nro) return res.status(400).json({ error: 'Falta nro_solicitud' });
    // Normalizamos a la forma "canonica" que se usa en la DB (número parseado).
    const nroNorm = String(parseInt(nro, 10) || nro);

    // 1) informe_path directo en ots (rápido).
    let row = db.prepare(
      `SELECT informe_path FROM ots
       WHERE nro_solicitud = ? AND informe_path IS NOT NULL AND informe_path != ''
       ORDER BY informe_generado_en DESC LIMIT 1`
    ).get(nroNorm);

    // 2) Fallback: buscar en informes_emitidos join con ots.
    if (!row || !row.informe_path) {
      try {
        row = db.prepare(
          `SELECT ie.ruta AS informe_path FROM informes_emitidos ie
           JOIN ots o ON o.nro_ot = ie.nro_ot
           WHERE o.nro_solicitud = ? AND ie.ruta IS NOT NULL AND ie.ruta != ''
           ORDER BY ie.id DESC LIMIT 1`
        ).get(nroNorm);
      } catch (_) {}
    }

    if (!row || !row.informe_path) {
      return res.status(404).json({ error: 'Sin informe emitido para esta solicitud', code: 'SIN_INFORME' });
    }

    const ruta = String(row.informe_path);
    // Derivar dirname (carpeta padre del .docx).
    const idx = Math.max(ruta.lastIndexOf('\\'), ruta.lastIndexOf('/'));
    const carpeta = idx >= 0 ? ruta.slice(0, idx) : ruta;
    res.json({ carpeta, archivo: ruta });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ot/:nro_ot', (req, res) => {
  try {
    const ot = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(req.params.nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    const ensayos = db.prepare('SELECT * FROM ensayos WHERE nro_ot = ? ORDER BY orden').all(req.params.nro_ot);
    res.json({ ...ot, ensayos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ot', (req, res) => {
  try {
    const { nro_ot, nro_solicitud, nro_cliente, razon_social,
            fecha_recepcion, fecha_aprobacion, fecha_finalizacion, trello_url,
            fecha_vencimiento, trello_columna } = req.body;
    // Sanitizar id_muestra: limpiar caracteres invisibles que vienen de Trello
    // o copy/paste y que rompen el layout (imagen desplazada).
    const id_muestra = sanitizarIdMuestra(req.body.id_muestra);

    if (!nro_ot || !nro_solicitud || !razon_social) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (nro_ot, nro_solicitud, razon_social)' });
    }

    // Si la OT ya existe y está firmada, bloqueamos la modificación.
    if (firma.estaFirmada(nro_ot)) {
      return res.status(423).json({ error: 'OT bloqueada por firma. Desfirmá con token para modificar.', code: 'OT_FIRMADA' });
    }

    if (nro_cliente && nro_cliente !== '0') {
      db.prepare(`
        INSERT INTO clientes (nro_cliente, razon_social)
        VALUES (@nro_cliente, @razon_social)
        ON CONFLICT(nro_cliente) DO UPDATE SET razon_social = excluded.razon_social
      `).run({ nro_cliente, razon_social });
    }

    // Detectar si la OT es nueva y si es la primera de su solicitud (para el
    // log de auditoría). Se calcula ANTES del UPSERT.
    const yaExistia = !!db.prepare('SELECT 1 FROM ots WHERE nro_ot = ?').get(nro_ot);
    const solYaTenia = nro_solicitud
      ? db.prepare('SELECT COUNT(*) AS n FROM ots WHERE nro_solicitud = ? AND nro_ot != ?').get(nro_solicitud, nro_ot).n
      : 0;

    db.prepare(`
      INSERT INTO ots (nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
                       fecha_recepcion, fecha_aprobacion, fecha_finalizacion, trello_url,
                       fecha_vencimiento, trello_columna)
      VALUES (@nro_ot, @nro_solicitud, @nro_cliente, @razon_social, @id_muestra,
              @fecha_recepcion, @fecha_aprobacion, @fecha_finalizacion, @trello_url,
              @fecha_vencimiento, @trello_columna)
      ON CONFLICT(nro_ot) DO UPDATE SET
        nro_solicitud = excluded.nro_solicitud,
        nro_cliente = excluded.nro_cliente,
        razon_social = excluded.razon_social,
        id_muestra = excluded.id_muestra,
        fecha_recepcion = excluded.fecha_recepcion,
        fecha_aprobacion = excluded.fecha_aprobacion,
        fecha_finalizacion = excluded.fecha_finalizacion,
        trello_url = excluded.trello_url,
        fecha_vencimiento = COALESCE(excluded.fecha_vencimiento, ots.fecha_vencimiento),
        trello_columna = COALESCE(excluded.trello_columna, ots.trello_columna),
        actualizado_en = datetime('now')
    `).run({ nro_ot, nro_solicitud, nro_cliente: nro_cliente || null, razon_social,
             id_muestra: id_muestra || null, fecha_recepcion: fecha_recepcion || null,
             fecha_aprobacion: fecha_aprobacion || null,
             fecha_finalizacion: fecha_finalizacion || null, trello_url: trello_url || null,
             fecha_vencimiento: fecha_vencimiento || null,
             trello_columna: trello_columna || null });

    // Eventos de auditoría:
    //   - Si es nueva OT → 'OT creada'.
    //   - Si además es la PRIMERA de su solicitud → adicional 'Solicitud N creada'.
    //   - Si ya existía → 'OT actualizada'.
    if (!yaExistia) {
      registrarEvento(nro_ot, 'OT creada', 'add');
      if (nro_solicitud && solYaTenia === 0) {
        registrarEvento(nro_ot, 'Solicitud ' + nro_solicitud + ' creada (primera OT: ' + nro_ot + ')', 'add');
      }
    } else {
      registrarEvento(nro_ot, 'OT actualizada', 'edit');
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Ensayos ──────────────────────────────────────────────────────────────────

router.post('/ensayo', (req, res) => {
  try {
    const { absorberOtros } = require('../utils/catalogo-auto');
    const { nro_ot, tipo, orden, datos_json } = req.body;
    if (!nro_ot || !tipo || !datos_json) return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const jsonStr = typeof datos_json === 'string' ? datos_json : JSON.stringify(datos_json);
    let datosObj = null;
    try { datosObj = typeof datos_json === 'string' ? JSON.parse(datos_json) : datos_json; } catch {}

    const existente = db.prepare('SELECT id, orden, datos_json, estado_firma FROM ensayos WHERE nro_ot = ? AND tipo = ?').get(nro_ot, tipo);
    // Cualquier ensayo firmado (revisado o aprobado) queda BLOQUEADO. Hay que
    // desfirmar primero para poder editar. El token requerido depende del nivel:
    //   - 'revisado'   → token con rol revisor o ambos.
    //   - 'autorizado' → token con rol autorizante.
    if (existente && existente.estado_firma && existente.estado_firma !== 'abierto') {
      const esAprobado = existente.estado_firma === 'autorizado';
      return res.status(423).json({
        error: esAprobado
          ? 'Ensayo APROBADO — bloqueado. Desfirmá con un token de AUTORIZANTE para poder editar.'
          : 'Ensayo FIRMADO — bloqueado. Desfirmá con un token para poder editar.',
        code: esAprobado ? 'ENSAYO_APROBADO' : 'ENSAYO_FIRMADO',
        ensayo_id: existente.id,
        estado_firma: existente.estado_firma,
      });
    }

    if (existente) {
      db.prepare('UPDATE ensayos SET datos_json = ?, orden = ?, actualizado_en = datetime(\'now\') WHERE id = ?')
        .run(jsonStr, orden ?? existente.orden, existente.id);
      registrarHistorialEnsayo({
        ensayo_id: existente.id, nro_ot, tipo, accion: 'update',
        anterior: existente.datos_json, nuevo: jsonStr,
      });
      registrarEvento(nro_ot, `Ensayo ${tipo} actualizado`, 'edit');
      db.prepare('UPDATE ots SET actualizado_en = datetime(\'now\') WHERE nro_ot = ?').run(nro_ot);
      if (datosObj) { try { absorberOtros(datosObj, tipo); } catch (e) { console.warn('[catalogo-auto]', e.message); } }
      res.json({ ok: true, id: existente.id });
    } else {
      const maxOrden = db.prepare('SELECT MAX(orden) as m FROM ensayos WHERE nro_ot = ?').get(nro_ot);
      const nuevoOrden = orden ?? ((maxOrden?.m || 0) + 1);
      const info = db.prepare('INSERT INTO ensayos (nro_ot, tipo, orden, datos_json, actualizado_en) VALUES (?, ?, ?, ?, datetime(\'now\'))')
        .run(nro_ot, tipo, nuevoOrden, jsonStr);
      registrarHistorialEnsayo({
        ensayo_id: info.lastInsertRowid, nro_ot, tipo, accion: 'create',
        anterior: null, nuevo: jsonStr,
      });
      registrarEvento(nro_ot, `Ensayo ${tipo} agregado`, 'add');
      db.prepare('UPDATE ots SET actualizado_en = datetime(\'now\') WHERE nro_ot = ?').run(nro_ot);
      if (datosObj) { try { absorberOtros(datosObj, tipo); } catch (e) { console.warn('[catalogo-auto]', e.message); } }
      res.json({ ok: true, id: info.lastInsertRowid });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/ensayo/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT id, nro_ot, tipo, datos_json, estado_firma FROM ensayos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Ensayo no encontrado' });
    // Bloqueo por firma: si el ensayo está firmado o aprobado, no se puede
    // eliminar hasta que se desfirme.
    if (row.estado_firma && row.estado_firma !== 'abierto') {
      const esAprobado = row.estado_firma === 'autorizado';
      return res.status(423).json({
        error: esAprobado
          ? 'Ensayo APROBADO — bloqueado. Desfirmá con un token de AUTORIZANTE para poder eliminar.'
          : 'Ensayo FIRMADO — bloqueado. Desfirmá con un token para poder eliminar.',
        code: esAprobado ? 'ENSAYO_APROBADO' : 'ENSAYO_FIRMADO',
        ensayo_id: row.id,
        estado_firma: row.estado_firma,
      });
    }
    registrarHistorialEnsayo({
      ensayo_id: row.id, nro_ot: row.nro_ot, tipo: row.tipo, accion: 'delete',
      anterior: row.datos_json, nuevo: null,
    });
    db.prepare('DELETE FROM ensayos WHERE id = ?').run(req.params.id);
    registrarEvento(row.nro_ot, `Ensayo ${row.tipo} eliminado`, 'delete');
    db.prepare('UPDATE ots SET actualizado_en = datetime(\'now\') WHERE nro_ot = ?').run(row.nro_ot);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Generación Word ──────────────────────────────────────────────────────────

// POST /api/ot/:nro_ot/renombrar
//   Body: { nro_ot: <nuevo> }
//   Uso típico: el bot Trello importa OTs con placeholder "PEND-<sol>-M<n>"
//   cuando falta el número real. Cuando la secretaría carga el número, el
//   técnico lo edita en el form → este endpoint renombra en TODAS las tablas
//   relacionadas atómicamente (transacción).
router.post('/ot/:nro_ot/renombrar', (req, res) => {
  try {
    const antiguo = String(req.params.nro_ot || '').trim();
    const nuevo   = String((req.body && req.body.nro_ot) || '').trim();
    if (!antiguo || !nuevo) return res.status(400).json({ error: 'Faltan nro_ot antiguo o nuevo' });
    if (antiguo === nuevo) return res.status(400).json({ error: 'El número es el mismo' });
    const otFull = db.prepare('SELECT nro_ot FROM ots WHERE nro_ot = ?').get(antiguo);
    if (!otFull) return res.status(404).json({ error: 'OT ' + antiguo + ' no encontrada' });
    const yaExiste = db.prepare('SELECT nro_ot FROM ots WHERE nro_ot = ?').get(nuevo);
    if (yaExiste) return res.status(409).json({ error: 'Ya existe una OT con número ' + nuevo, code: 'DUPLICADO' });

    // Tablas con nro_ot que hay que renombrar en cadena. La lista completa
    // está en db.js; agregar acá si se crea una tabla nueva.
    const TABLAS = [
      'ots', 'ensayos', 'eventos', 'ensayos_historial', 'ots_historial',
      'informes_emitidos', 'firmas', 'guardados_pendientes',
    ];
    const trx = db.transaction(() => {
      for (const t of TABLAS) {
        try {
          db.prepare('UPDATE ' + t + ' SET nro_ot = ? WHERE nro_ot = ?').run(nuevo, antiguo);
        } catch (e) {
          // Tabla puede no existir en instalaciones viejas — no es fatal.
          if (!/no such table/i.test(e.message)) throw e;
        }
      }
    });
    trx();
    try { registrarEvento(nuevo, `OT renombrada: ${antiguo} → ${nuevo}`, 'edit'); } catch {}
    res.json({ ok: true, nro_ot: nuevo, anterior: antiguo });
  } catch (err) {
    console.error('[ot/renombrar]', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/ot/:nro_ot', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const otFull = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (!otFull) return res.status(404).json({ error: 'OT no encontrada' });
    if (firma.estaFirmada(nro_ot)) {
      return res.status(423).json({ error: 'OT bloqueada por firma.', code: 'OT_FIRMADA' });
    }
    // Snapshot de todos los ensayos antes de borrar (audit trail).
    const ensayosPrevios = db.prepare('SELECT id, tipo, datos_json FROM ensayos WHERE nro_ot = ?').all(nro_ot);
    for (const e of ensayosPrevios) {
      registrarHistorialEnsayo({
        ensayo_id: e.id, nro_ot, tipo: e.tipo, accion: 'delete',
        anterior: e.datos_json, nuevo: null,
      });
    }
    // Snapshot completo de la OT (fila entera) para poder recuperarla desde
    // el panel de Administración → Papelera.
    try {
      db.prepare(
        'INSERT INTO ots_historial (nro_ot, accion, ot_json, ensayos_count, borrado_por) VALUES (?, ?, ?, ?, ?)'
      ).run(nro_ot, 'delete', JSON.stringify(otFull), ensayosPrevios.length, null);
    } catch (e) { console.warn('[papelera] no se pudo guardar snapshot de OT:', e.message); }
    db.prepare('DELETE FROM ensayos WHERE nro_ot = ?').run(nro_ot);
    db.prepare('DELETE FROM ots WHERE nro_ot = ?').run(nro_ot);
    registrarEvento(nro_ot, `OT eliminada (${ensayosPrevios.length} ensayos)`, 'delete');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Papelera de OTs (Administración) ─────────────────────────────────────
// Auth: sigue el patrón del resto de /admin — POST con admin_usuario +
// admin_password en el body (ver api-trazabilidad.js:requireAdmin).
function _requireAdmin(req, res) {
  const { admin_usuario, admin_password } = req.body || {};
  const a = firma.verificarAdmin(admin_usuario, admin_password);
  if (!a) { res.status(401).json({ error: 'Credenciales de administrador inválidas.' }); return null; }
  return a;
}

// Lista las últimas OTs eliminadas para poder recuperarlas por error.
router.post('/admin/ots-borradas/listar', (req, res) => {
  if (!_requireAdmin(req, res)) return;
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.body.limit, 10) || 100));
    // Última acción por nro_ot: si fue 'delete' está en papelera; si fue
    // 'restore' ya fue recuperada y NO debe aparecer.
    const rows = db.prepare(
      `SELECT h.id, h.nro_ot, h.accion, h.ot_json, h.ensayos_count, h.borrado_por, h.fecha
       FROM ots_historial h
       INNER JOIN (
         SELECT nro_ot, MAX(id) AS maxid FROM ots_historial GROUP BY nro_ot
       ) latest ON latest.maxid = h.id
       WHERE h.accion = 'delete'
       ORDER BY h.fecha DESC
       LIMIT ?`
    ).all(limit);
    const items = rows.map(r => {
      let ot = {}; try { ot = JSON.parse(r.ot_json); } catch {}
      return {
        historial_id:  r.id,
        nro_ot:        r.nro_ot,
        fecha_borrado: r.fecha,
        borrado_por:   r.borrado_por,
        ensayos_count: r.ensayos_count,
        razon_social:  ot.razon_social || '',
        nro_solicitud: ot.nro_solicitud || '',
        id_muestra:    ot.id_muestra || '',
        fecha_recepcion: ot.fecha_recepcion || '',
      };
    });
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Recupera una OT del historial: restaura ots + todos sus ensayos. Falla si
// ya existe una OT con ese nro_ot (para no pisar datos actuales).
router.post('/admin/ots-borradas/:nro_ot/recuperar', (req, res) => {
  if (!_requireAdmin(req, res)) return;
  try {
    const { nro_ot } = req.params;
    // 1) Verificar que la OT no exista actualmente.
    const ya = db.prepare('SELECT nro_ot FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (ya) return res.status(409).json({
      error: 'Ya existe una OT con ese número. No se puede recuperar sin conflicto.',
      code: 'OT_YA_EXISTE',
    });
    // 2) Encontrar el último snapshot de delete.
    const snap = db.prepare(
      `SELECT id, ot_json FROM ots_historial
       WHERE nro_ot = ? AND accion = 'delete'
       ORDER BY id DESC LIMIT 1`
    ).get(nro_ot);
    if (!snap) return res.status(404).json({ error: 'No hay snapshot de esta OT en la papelera.' });

    let otData; try { otData = JSON.parse(snap.ot_json); } catch { otData = null; }
    if (!otData) return res.status(500).json({ error: 'Snapshot corrupto (JSON inválido).' });

    // 3) Construir INSERT dinámico con las columnas del snapshot (excepto id).
    const cols = Object.keys(otData).filter(k => k !== 'id' && otData[k] !== undefined);
    if (cols.length === 0) return res.status(500).json({ error: 'Snapshot vacío.' });
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(k => otData[k]);
    db.prepare(`INSERT INTO ots (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);

    // 4) Restaurar ensayos desde ensayos_historial (última acción='delete' por ensayo_id).
    const ensayosBorrados = db.prepare(
      `SELECT h.ensayo_id, h.tipo, h.datos_json_anterior
       FROM ensayos_historial h
       INNER JOIN (
         SELECT ensayo_id, MAX(id) AS maxid FROM ensayos_historial
         WHERE nro_ot = ? GROUP BY ensayo_id
       ) latest ON latest.maxid = h.id
       WHERE h.accion = 'delete' AND h.datos_json_anterior IS NOT NULL`
    ).all(nro_ot);

    let restaurados = 0;
    const insertEns = db.prepare(
      'INSERT INTO ensayos (nro_ot, tipo, orden, datos_json) VALUES (?, ?, ?, ?)'
    );
    ensayosBorrados.forEach((e, i) => {
      insertEns.run(nro_ot, e.tipo, i + 1, e.datos_json_anterior);
      restaurados++;
    });

    // 5) Marcar el snapshot como restaurado (fila nueva 'restore').
    db.prepare(
      'INSERT INTO ots_historial (nro_ot, accion, ot_json, ensayos_count, borrado_por) VALUES (?, ?, ?, ?, ?)'
    ).run(nro_ot, 'restore', snap.ot_json, restaurados, null);

    registrarEvento(nro_ot, `OT recuperada desde papelera (${restaurados} ensayos)`, 'add');
    res.json({ ok: true, nro_ot, ensayos_restaurados: restaurados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Bot Trello: estado + sync manual ─────────────────────────────────────
router.get('/admin/bot-trello/estado', (_req, res) => {
  try {
    const { estadoBot } = require('../utils/bot-trello');
    res.json(estadoBot());
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/admin/bot-trello/sync-ahora', async (_req, res) => {
  try {
    const { escanearYSyncOts } = require('../utils/bot-trello');
    const stats = await escanearYSyncOts();
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/ot/:nro_ot', (req, res) => {
  const { nro_ot } = req.params;
  if (firma.estaFirmada(nro_ot)) {
    return res.status(423).json({ error: 'OT bloqueada por firma.', code: 'OT_FIRMADA' });
  }
  // Campos administrativos editables via PATCH — usados por el flujo
  // "editar solicitud" (aplica a todas las OTs hermanas) y también para
  // marcar preinforme, cambiar fechas post-hoc, corregir cliente, etc.
  const allowed = [
    'es_preinforme',
    'fecha_recepcion', 'fecha_aprobacion', 'fecha_finalizacion',
    'fecha_vencimiento', 'trello_columna',
    'razon_social', 'nro_cliente', 'trello_url', 'id_muestra',
  ];
  const sets = [], vals = [];
  const cambios = [];
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); cambios.push(k); }
  }
  if (!sets.length) return res.status(400).json({ error: 'Sin campos actualizables' });
  vals.push(nro_ot);
  db.prepare(`UPDATE ots SET ${sets.join(', ')}, actualizado_en = datetime('now') WHERE nro_ot = ?`).run(...vals);
  // Log detallado con qué campos cambiaron (útil para reconstruir historial).
  const camposLegibles = cambios.map(c => c.replace(/_/g, ' ')).join(', ');
  registrarEvento(nro_ot, 'OT modificada — campos: ' + camposLegibles, 'edit');
  res.json({ ok: true });
});

// ─── Fotos de carátula ────────────────────────────────────────────────────────

router.post('/ot/:nro_ot/fotos', upload.array('fotos'), (req, res) => {
  const { nro_ot } = req.params;
  try {
    // Modo 1: multipart file upload (drag&drop desde el navegador).
    let items = (req.files || []).map(f => ({
      dataUrl: 'data:' + f.mimetype + ';base64,' + f.buffer.toString('base64'),
      name: f.originalname,
    }));
    // Modo 2: body JSON con { items: [{ dataUrl, name }, ...] }. Se usa
    // desde la propagación auto de fotos a hermanas — cada hermana ya tiene
    // sus fotos en memoria (dataUrl base64) y solo hay que persistirlas.
    if (items.length === 0 && Array.isArray(req.body && req.body.items)) {
      items = req.body.items
        .filter(x => x && x.dataUrl)
        .map(x => ({ dataUrl: x.dataUrl, name: String(x.name || '') }));
    }
    db.prepare('UPDATE ots SET fotos_json = ? WHERE nro_ot = ?')
      .run(JSON.stringify(items), nro_ot);
    res.json({ ok: true, count: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ot/:nro_ot/fotos', (req, res) => {
  try {
    const row = db.prepare('SELECT fotos_json FROM ots WHERE nro_ot = ?').get(req.params.nro_ot);
    if (!row) return res.status(404).json({ error: 'OT no encontrada' });
    res.json(JSON.parse(row.fotos_json || '[]'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Auto-carga de fotos de recepción desde el drive del laboratorio.
// Devuelve las imágenes como base64 + nombre + info de dónde se encontraron.
// El técnico usa un botón en la UI para dispararlo manualmente.
// REGLAS de clasificación fotos-auto por tipo de ensayo. Cada rule mapea a
// un `campo` (nombre del campo en datos_json). Se usa en /ensayo/:id/fotos-auto
// y en /fotos-auto-solicitud (batch).
const _REGLAS_FOTOS_AUTO = {
  'metalografia-general': [
    { campo: 'imagenes_micro',    re: /microestructura\b|microestrutura\b|^micro$/i },
    { campo: 'imagenes_espesor',  re: /espesor|recubrimiento|capa\b/i },
    { campo: 'imagenes_grafito',  re: /grafito/i },
    { campo: 'imagenes_decarb',   re: /decarburaci|decarbur|descarburaci/i },
  ],
  'anexo-metalografico': [
    { campo: 'imagenes_grano',       re: /grano|tama[nñ]o[_\s]*de[_\s]*grano/i },
    { campo: 'imagenes_inclusiones', re: /inclusion|inclusi[oó]n|sulfuro|aluminato|silicato|oxido|óxido/i },
  ],
  'macrografia':          [{ campo: 'imagenes_resultado', re: /macrograf/i }],
  'dureza-vickers':       [{ campo: 'imagenes_resultado', re: /vickers|microdureza|impronta|mapa[_\s]*de[_\s]*durez|dureza/i }],
  'dureza-rockwell':      [{ campo: 'imagenes_esquema',   re: /rockwell|esquema|dureza/i }],
  'tratamientos-termicos':[{ campo: 'imagenes_resultado', re: /tratamient|revenido|temple|recocido|solubiliz|t[eé]rmico/i }],
  'liquidos-penetrantes': [{ campo: 'imagenes_resultado', re: /liquid|penetrant|revelador|indicaci[oó]n|lp\b|pt\b/i }],
  'ferrita-delta':        [{ campo: 'imagenes',           re: /ferrita|delta|leica|microscop/i }],
  'varios':               [{ campo: 'imagenes_resultado', re: /./ }],
  'microestructura':         [{ campo: 'imagenes_resultado', re: /microestructura|microestrutura|^micro$/i }],
  'tamano-grano':            [{ campo: 'imagenes_resultado', re: /grano|tama[nñ]o[_\s]*de[_\s]*grano/i }],
  'inclusiones':             [{ campo: 'imagenes_resultado', re: /inclusion|inclusi[oó]n|sulfuro|aluminato|silicato|oxido|óxido/i }],
  'estructura-grafito':      [{ campo: 'imagenes_resultado', re: /grafito/i }],
  'espesor-capa':            [{ campo: 'imagenes_resultado', re: /espesor|recubrimiento|capa\b/i }],
  'decarburacion':           [{ campo: 'imagenes_resultado', re: /decarburaci|decarbur|descarburaci/i }],
  'defectos-superficiales':  [{ campo: 'imagenes_resultado', re: /defecto|fisura|grieta|poro/i }],
  'porosidad':               [{ campo: 'imagenes_resultado', re: /porosidad|poro/i }],
};

// Regex de detección "esto es foto de ensayo, no de recepción". Aplica al
// filtro del endpoint /ot/:nro_ot/fotos-auto para excluir fotos que están en
// subcarpetas de sección de ensayo (MICROESTRUCTURA/, INCLUSIONES/, etc.) o
// cuyo nombre contiene keywords de sección (inclusiones.png, macrografia.jpg).
// Palabras clave que identifican una carpeta o archivo como perteneciente a
// una sección de ensayo (metalografía general, macrografía, dureza, etc.).
// Se agregó "metalograf" que faltaba y otras variantes con acento.
const _SECCION_ENSAYO_RE = /\b(metalograf|microestructura|micrograf|macrograf|espesor|recubrimiento|grafito|decarbur|descarburaci|grano|inclusion|inclusi[oó]n|sulfuro|aluminato|silicato|vickers|microdureza|rockwell|brinell|penetrant|revelador|indicacion|tratamient|revenido[_\s]|temple[_\s]|recocido|solubiliz|ferrita|nick[_\s-]*break|impacto|tracci[oó]n)/i;
// Normaliza acentos para que "METALOGRAFÍA" matchee con "metalograf".
function _normSinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
// Carpetas M1/M2/MUESTRA 1/etc. son organizadores por muestra — NO son
// subcarpetas de ensayo. Sus archivos siguen siendo fotos válidas de recepción.
const _MUESTRA_DIR_RE_FOTO = /^(?:M|MUESTRA)[\s_\-]*\d+$/i;

function _esFotoDeEnsayo(it) {
  const folders = it.folders || [];
  // Si TODAS las folders son M<n>/MUESTRA <n>, la foto está en la carpeta de
  // recepción (organizada por muestra). No es de ensayo — devolvemos false.
  const foldersNoMuestra = folders.filter(f => !_MUESTRA_DIR_RE_FOTO.test(f));
  if (foldersNoMuestra.length === 0 && folders.length > 0) {
    // Todas las folders son M<n> → sigue siendo raíz-de-recepción.
    // Chequear igual el nombre del archivo por si el técnico lo llamó
    // "inclusiones.jpg" o similar dentro de M1/.
    const base = _normSinAcentos(pathMod.basename(it.abs)).replace(/\.[a-z0-9]{2,5}$/i, '');
    if (_SECCION_ENSAYO_RE.test(base)) return true;
    return false;
  }
  // Regla dura: si la foto está EN CUALQUIER subcarpeta (folders.length > 0)
  // y NO estamos en modo "carpeta OT propia", asumir que es de ensayo. La
  // convención del laboratorio es: fotos de recepción sueltas en la raíz,
  // fotos de ensayo en subcarpetas (METALOGRAFÍA/, MACROGRAFÍA/, etc.).
  if (folders.length > 0) return true;
  // Complemento: si un archivo suelto tiene nombre de sección, también es
  // ensayo (ej. "inclusiones.png" tirada en la raíz).
  const base = _normSinAcentos(pathMod.basename(it.abs)).replace(/\.[a-z0-9]{2,5}$/i, '');
  if (_SECCION_ENSAYO_RE.test(base)) return true;
  return false;
}

router.get('/ot/:nro_ot/fotos-auto', async (req, res) => {
  try {
    const nro_ot = req.params.nro_ot;
    const ot = db.prepare('SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    // Posición de la OT dentro de la solicitud (1..N por nro_ot ordenado).
    // Sirve para localizar subcarpetas "O.T 1" / "M 1" cuando el técnico organizó
    // fotos por número secuencial en vez de por nro_ot real.
    let numMuestra = null;
    if (ot.nro_solicitud) {
      const hermanas = db.prepare('SELECT nro_ot FROM ots WHERE nro_solicitud = ? ORDER BY nro_ot ASC')
        .all(ot.nro_solicitud).map(x => String(x.nro_ot));
      const idx = hermanas.indexOf(String(ot.nro_ot));
      if (idx >= 0) numMuestra = idx + 1;
    }
    const { buscarFotosOt, FOTOS_ROOT } = require('../utils/fotos-auto');
    let r = buscarFotosOt(ot.razon_social, ot.nro_solicitud, ot.nro_ot, ot.id_muestra, numMuestra);
    if (!r.root_ok) return res.status(503).json({
      error: 'Drive de fotos no accesible desde el servidor.',
      root: r.root,
      hint: 'El servicio Windows no ve drives mapeados de sesión. Usar ruta UNC o configurar FOTOS_RECEPCION_ROOT.',
    });

    // Cliente no encontrado por fuzzy → probar agente IA cliente-carpeta.
    let clienteAgenteInfo = null;
    if (r.debug === 'cliente_no_matcheado') {
      try {
        const fsMod2 = require('fs');
        const carpetas = fsMod2.readdirSync(FOTOS_ROOT, { withFileTypes: true })
          .filter(d => d.isDirectory()).map(d => d.name);
        const { resolverCarpeta } = require('../agents/agente-cliente-carpeta');
        const t0 = Date.now();
        const decision = await resolverCarpeta(ot.razon_social, carpetas);
        clienteAgenteInfo = {
          usado: true, modelo: decision.modelo, ms: Date.now() - t0,
          carpeta: decision.carpeta, confianza: decision.confianza, motivo: decision.motivo,
        };
        console.log('[fotos-auto/cliente-agente] "' + ot.razon_social + '" → ' + (decision.carpeta || '(nada)') + ' [' + decision.confianza + '] ' + clienteAgenteInfo.ms + 'ms');
        if (decision.carpeta && (decision.confianza === 'alta' || decision.confianza === 'media')) {
          try {
            db.prepare("INSERT OR IGNORE INTO cliente_alias (razon_social, carpeta_drive, fuente, verificado) VALUES (?, ?, 'ia', 0)")
              .run(ot.razon_social, decision.carpeta);
          } catch (_) {}
          r = buscarFotosOt(ot.razon_social, ot.nro_solicitud, ot.nro_ot, ot.id_muestra, numMuestra);
        }
      } catch (e) {
        console.warn('[fotos-auto/cliente-agente] fallo — ' + e.message);
        clienteAgenteInfo = { usado: false, error: e.message };
      }
    }

    // Filtro RECEPCIÓN: excluir fotos con signal de "es de ensayo" (por carpeta
    // ancestro o por nombre de archivo). Sin este filtro, la recepción trae
    // TODO recursivo y aparecen fotos de sección como carátula.
    if (Array.isArray(r.items) && r.items.length > 0) {
      const antes = r.items.length;
      r.items = r.items.filter(it => !_esFotoDeEnsayo(it));
      r.archivos = r.items.map(it => it.abs);
      if (r.items.length !== antes) {
        console.log('[fotos-auto/recepcion] OT ' + nro_ot + ' — filtradas ' +
          (antes - r.items.length) + '/' + antes + ' fotos con signal de ensayo');
      }
    }

    // Convención nueva: si existe carpeta OT<nro> propia, la RAÍZ contiene las
    // fotos de recepción y las subcarpetas son por ensayo. Solo levantar
    // items directos (folders.length === 0).
    let archivosFinales = r.archivos;
    let agenteInfo = null;
    if (r.carpeta_ot && Array.isArray(r.items) && r.items.length > 0) {
      const soloRaiz = r.items.filter(it => (it.folders || []).length === 0);
      archivosFinales = soloRaiz.length > 0 ? soloRaiz.map(it => it.abs) : [];
      agenteInfo = {
        usado: false, motivo: 'convencion_carpeta_ot',
        asignadas_por_carpeta: archivosFinales.length,
        total_archivos: r.items.length,
      };
    } else if (!r.carpeta_ot && ot.nro_solicitud && (r.items || []).length > 0) {
      const hermanas = db.prepare(
        'SELECT nro_ot, id_muestra, creado_en FROM ots WHERE nro_solicitud = ? ORDER BY creado_en ASC, nro_ot ASC'
      ).all(ot.nro_solicitud);
      if (hermanas.length > 1) {
        const nroOtDeOrden = {};
        hermanas.forEach((h, i) => { nroOtDeOrden[i + 1] = String(h.nro_ot); });
        const items = r.items || [];
        const paraEstaOtPath = [];
        for (const it of items) {
          if (it.muestra == null) continue;
          const nroOtDest = nroOtDeOrden[it.muestra];
          if (String(nroOtDest || '') === String(nro_ot)) paraEstaOtPath.push(it.abs);
        }
        const sueltos = items.filter(it => it.muestra == null);
        if (sueltos.length > 0) {
          try {
            const { distribuirFotos } = require('../agents/agente-fotos');
            const filenames = sueltos.map(it => pathMod.basename(it.abs));
            const t0 = Date.now();
            const dist = await distribuirFotos(filenames, hermanas);
            const asignaciones = dist.asignaciones || [];
            const especificas = new Set(), genericas = new Set();
            for (const a of asignaciones) {
              const nroAsig = a.nro_ot == null ? null : String(a.nro_ot);
              if (nroAsig === String(nro_ot)) especificas.add(a.filename);
              else if (nroAsig === null) genericas.add(a.filename);
            }
            const totalEspecificasParaMi = paraEstaOtPath.length + especificas.size;
            const usarGenericas = totalEspecificasParaMi === 0;
            const paraEstaSueltos = new Set(especificas);
            if (usarGenericas) genericas.forEach(g => paraEstaSueltos.add(g));
            for (const it of sueltos) {
              const bn = pathMod.basename(it.abs);
              if (paraEstaSueltos.has(bn)) paraEstaOtPath.push(it.abs);
            }
            agenteInfo = {
              usado: true, modelo: dist.modelo, ms: Date.now() - t0,
              asignadas_por_carpeta: items.filter(it => it.muestra != null && String(nroOtDeOrden[it.muestra] || '') === String(nro_ot)).length,
              asignadas_por_ia: especificas.size,
              genericas_fallback: usarGenericas ? genericas.size : 0,
              total_archivos: items.length,
              hermanas: hermanas.length,
            };
          } catch (e) {
            console.warn('[fotos-auto/agente] fallo — ' + e.message);
            agenteInfo = { usado: false, error: e.message };
          }
        } else {
          agenteInfo = {
            usado: false,
            asignadas_por_carpeta: paraEstaOtPath.length,
            total_archivos: items.length,
            hermanas: hermanas.length,
            motivo: 'todos resueltos por carpeta',
          };
        }
        archivosFinales = paraEstaOtPath;
      }
    }

    // Cargar como base64 con límite.
    const { parseCaptionDeFilename } = require('../utils/fotos-auto');
    const itemsPorAbs = new Map((r.items || []).map(it => [it.abs, it]));
    const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
    let total = 0;
    const items = [];
    for (const abs of archivosFinales) {
      try {
        const stat = fsMod.statSync(abs);
        if (total + stat.size > MAX_TOTAL_BYTES) break;
        const buf = fsMod.readFileSync(abs);
        const ext = pathMod.extname(abs).slice(1).toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const name = pathMod.basename(abs);
        const it = itemsPorAbs.get(abs);
        items.push({
          name,
          dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64'),
          size: stat.size,
          ruta: abs,
          caption: parseCaptionDeFilename(name, it ? { muestra: it.muestra, folders: it.folders } : null),
        });
        total += stat.size;
      } catch (e) { console.warn('[fotos-auto] no se pudo leer', abs, e.message); }
    }
    res.json({
      encontrada: items.length > 0,
      carpeta_cliente: r.carpeta_cliente,
      carpeta_sol: r.carpeta_sol,
      carpeta_ot: r.carpeta_ot,
      count: items.length,
      total_disponibles: (r.items || []).length,
      items,
      debug: r.debug,
      razon_social_buscada: r.razon_social_buscada,
      cliente_score: r.cliente_score,
      cliente_candidatos: r.cliente_candidatos,
      sols_disponibles: r.sols_disponibles,
      agente: agenteInfo,
      cliente_agente: clienteAgenteInfo,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Función reusable para el endpoint clásico y el batch.
async function armarFotosParaOtYTipo(ot, tipo, ensayoId) {
  const { buscarFotosOt } = require('../utils/fotos-auto');
  // Posición dentro de la solicitud (para subcarpetas "O.T 1" / "M 1").
  let numMuestra = null;
  if (ot.nro_solicitud) {
    const hermanas = db.prepare('SELECT nro_ot FROM ots WHERE nro_solicitud = ? ORDER BY nro_ot ASC')
      .all(ot.nro_solicitud).map(x => String(x.nro_ot));
    const idx = hermanas.indexOf(String(ot.nro_ot));
    if (idx >= 0) numMuestra = idx + 1;
  }
  const r = buscarFotosOt(ot.razon_social, ot.nro_solicitud, ot.nro_ot, ot.id_muestra, numMuestra);
  if (!r.root_ok) return { error: 'Drive de fotos no accesible', root: r.root, http: 503 };

  let archivos = r.archivos || [];
  if (r.carpeta_ot && Array.isArray(r.items) && r.items.length > 0) {
    archivos = r.items.map(it => it.abs);
  } else if (Array.isArray(r.items) && r.items.length > 0 && ot.nro_solicitud) {
    const hermanas = db.prepare(
      'SELECT nro_ot, id_muestra, creado_en FROM ots WHERE nro_solicitud = ? ORDER BY creado_en ASC, nro_ot ASC'
    ).all(ot.nro_solicitud);
    const nroOtDeOrden = {};
    hermanas.forEach((h, i) => { nroOtDeOrden[i + 1] = String(h.nro_ot); });
    const { extraerNumerosMuestra } = require('../utils/fotos-auto');
    const numsMideEnsayo = extraerNumerosMuestra(ot.id_muestra);
    const setMPropio = new Set(numsMideEnsayo);
    // Extrae TODOS los M<n> mencionados en un basename ("M1 M2 y M3.jpg" → [1,2,3]).
    // Se usa como fallback cuando `it.muestra` (de carpeta ancestro) es null.
    function _extraerMuestrasDeBasename(base) {
      const nums = [];
      const re = /\bM\s*(\d+)\b/gi;
      let m;
      while ((m = re.exec(base)) !== null) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && nums.indexOf(n) === -1) nums.push(n);
      }
      return nums;
    }
    const propios = r.items.filter(it => {
      // Muestras candidatas: primero de carpeta ancestro, después del basename.
      let muestras = [];
      if (it.muestra != null) muestras = [it.muestra];
      else muestras = _extraerMuestrasDeBasename(pathMod.basename(it.abs));
      if (muestras.length === 0) return false;
      // ¿Alguna muestra corresponde a esta OT?
      return muestras.some(mNum => {
        const nroOtDest = nroOtDeOrden[mNum];
        if (nroOtDest && String(nroOtDest) === String(ot.nro_ot)) return true;
        if (setMPropio.size > 0 && setMPropio.has(mNum)) return true;
        return false;
      });
    });
    if (propios.length > 0) archivos = propios.map(it => it.abs);
  }

  const reglas = _REGLAS_FOTOS_AUTO[tipo];
  if (!reglas) return { error: 'Tipo de ensayo no soportado: ' + tipo, http: 400 };

  const itemsPorAbs = new Map((r.items || []).map(it => [it.abs, it]));
  const itemsDeEstaOt = archivos.map(abs => itemsPorAbs.get(abs) || { abs, folders: [] });

  const porCampo = {};
  reglas.forEach(rr => { porCampo[rr.campo] = []; });
  const noClasificados = [];
  for (const it of itemsDeEstaOt) {
    const base = pathMod.basename(it.abs);
    const folders = it.folders || [];
    let match = null;
    for (const rr of reglas) {
      if (folders.some(f => rr.re.test(f))) { match = rr; break; }
    }
    if (!match) match = reglas.find(rr => rr.re.test(base));
    if (match) porCampo[match.campo].push(it.abs);
    else noClasificados.push(it.abs);
  }

  // Fallback IA (agente-clasificador-fotos): sólo para items que la regex no
  // clasificó. Con contexto acotado al OT/SOL — pocos tokens por decisión.
  let clasificadorInfo = null;
  if (noClasificados.length > 0) {
    try {
      const { clasificarFotos } = require('../agents/agente-clasificador-fotos');
      const categorias = reglas.map(rr => ({ campo: rr.campo }));
      const carpetaBase = r.carpeta_ot || r.carpeta_sol || '';
      const items = noClasificados.map(abs => {
        const it = itemsPorAbs.get(abs) || { abs, folders: [] };
        const rel = carpetaBase ? pathMod.relative(carpetaBase, abs) : pathMod.basename(abs);
        return { path: rel, folders: it.folders || [], filename: pathMod.basename(abs) };
      });
      const t0 = Date.now();
      const decision = await clasificarFotos(tipo, categorias, items);
      const asignaciones = decision.asignaciones || [];
      const camposValidos = new Set(reglas.map(rr => rr.campo));
      const nuevosNoClas = [];
      const asignadosPorAgente = [];
      for (const abs of noClasificados) {
        const rel = pathMod.relative(carpetaBase, abs);
        const base = pathMod.basename(abs);
        const asig = asignaciones.find(a => a.path === rel || a.path === base || a.path === abs);
        if (asig && asig.categoria && camposValidos.has(asig.categoria)) {
          porCampo[asig.categoria].push(abs);
          asignadosPorAgente.push({ path: rel, categoria: asig.categoria, confianza: asig.confianza });
        } else {
          nuevosNoClas.push(abs);
        }
      }
      noClasificados.length = 0;
      Array.prototype.push.apply(noClasificados, nuevosNoClas);
      clasificadorInfo = {
        usado: true, modelo: decision.modelo, ms: Date.now() - t0,
        total_input: items.length, asignados: asignadosPorAgente.length,
        descartados: items.length - asignadosPorAgente.length,
      };
      console.log('[ensayo/fotos-auto/agente] ' + tipo + ' OT ' + ot.nro_ot + ' — ' +
        asignadosPorAgente.length + '/' + items.length + ' clasificados en ' + clasificadorInfo.ms + 'ms');
    } catch (e) {
      console.warn('[ensayo/fotos-auto/agente] fallo — ' + e.message);
      clasificadorInfo = { usado: false, error: e.message };
    }
  }

  const { parseCaptionDeFilename } = require('../utils/fotos-auto');
  const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
  let total = 0;
  function loadFiles(paths) {
    const out = [];
    for (const abs of paths) {
      try {
        const stat = fsMod.statSync(abs);
        if (total + stat.size > MAX_TOTAL_BYTES) break;
        const buf = fsMod.readFileSync(abs);
        const ext = pathMod.extname(abs).slice(1).toLowerCase();
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const name = pathMod.basename(abs);
        const it = itemsPorAbs.get(abs);
        const caption = parseCaptionDeFilename(name, it ? { muestra: it.muestra, folders: it.folders } : null);
        out.push({ name, dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64'), size: stat.size, ruta: abs, caption });
        total += stat.size;
      } catch (e) { console.warn('[ensayo/fotos-auto] no se pudo leer', abs, e.message); }
    }
    return out;
  }

  const respuesta = {};
  for (const rr of reglas) respuesta[rr.campo] = loadFiles(porCampo[rr.campo]);
  respuesta._sin_clasificar = loadFiles(noClasificados);

  return {
    ensayo_id: ensayoId, tipo, nro_ot: ot.nro_ot,
    total_disponibles: archivos.length,
    carpeta_sol: r.carpeta_sol, carpeta_ot: r.carpeta_ot,
    resultado: respuesta, clasificador: clasificadorInfo,
  };
}

// Endpoint clásico: /ensayo/:id/fotos-auto — una sola OT. Soporta id='new'
// con query params ?nro_ot=X&tipo=Y para ensayos aún no guardados.
router.get('/ensayo/:id/fotos-auto', async (req, res) => {
  try {
    const idParam = req.params.id;
    let ensayo, ensayoId;
    if (idParam === 'new' || idParam === '0') {
      const nroOtQ = req.query.nro_ot;
      const tipoQ  = req.query.tipo;
      if (!nroOtQ || !tipoQ) return res.status(400).json({ error: 'Faltan nro_ot y tipo en query' });
      ensayo = { id: null, nro_ot: nroOtQ, tipo: tipoQ };
      ensayoId = null;
    } else {
      ensayoId = parseInt(idParam, 10);
      ensayo = db.prepare('SELECT id, nro_ot, tipo FROM ensayos WHERE id = ?').get(ensayoId);
      if (!ensayo) return res.status(404).json({ error: 'Ensayo no encontrado' });
    }
    const ot = db.prepare('SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_ot = ?').get(ensayo.nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });

    const resultado = await armarFotosParaOtYTipo(ot, ensayo.tipo, ensayoId);
    if (resultado.error) return res.status(resultado.http || 500).json(resultado);
    return res.json(resultado);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint batch: POST /api/fotos-auto-solicitud — propaga carga automática a
// TODAS las OTs de la solicitud. Recibe { nro_ot_referencia, tipo }. Itera
// hermanas, crea/actualiza cada ensayo con las fotos correspondientes.
// La OT actual se skipea (incluir_ot_actual: true para incluirla también).
router.post('/fotos-auto-solicitud', async (req, res) => {
  try {
    const { nro_ot_referencia, tipo, incluir_ot_actual } = req.body || {};
    if (!nro_ot_referencia || !tipo) {
      return res.status(400).json({ error: 'Faltan nro_ot_referencia y tipo en body' });
    }
    if (!_REGLAS_FOTOS_AUTO[tipo]) {
      return res.status(400).json({ error: 'Tipo de ensayo no soportado: ' + tipo });
    }
    const otRef = db.prepare('SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_ot = ?')
      .get(nro_ot_referencia);
    if (!otRef) return res.status(404).json({ error: 'OT de referencia no encontrada' });
    if (!otRef.nro_solicitud) {
      return res.json({ items: [], nota: 'La OT no tiene nro_solicitud — no hay hermanas' });
    }
    const hermanas = db.prepare(
      'SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_solicitud = ? ORDER BY creado_en ASC, nro_ot ASC'
    ).all(otRef.nro_solicitud);
    const items = [];
    for (const ot of hermanas) {
      if (!incluir_ot_actual && String(ot.nro_ot) === String(nro_ot_referencia)) {
        items.push({ nro_ot: ot.nro_ot, accion: 'saltada', motivo: 'OT actual (ya resuelta por front)' });
        continue;
      }
      const resFotos = await armarFotosParaOtYTipo(ot, tipo, null);
      if (resFotos.error) {
        items.push({ nro_ot: ot.nro_ot, accion: 'error', error: resFotos.error });
        continue;
      }
      const camposConFotos = Object.keys(resFotos.resultado || {}).filter(k => k !== '_sin_clasificar');
      let cantidad = 0;
      camposConFotos.forEach(k => { cantidad += (resFotos.resultado[k] || []).length; });
      if (cantidad === 0) {
        items.push({
          nro_ot: ot.nro_ot, accion: 'sin_fotos',
          sin_clasificar: (resFotos.resultado._sin_clasificar || []).length,
        });
        continue;
      }
      let ensayo = db.prepare('SELECT id, datos_json FROM ensayos WHERE nro_ot = ? AND tipo = ?').get(ot.nro_ot, tipo);
      let datosPrev = {};
      let accion = 'actualizado';
      if (ensayo) {
        try { datosPrev = JSON.parse(ensayo.datos_json || '{}'); } catch {}
      } else {
        const maxOrden = db.prepare('SELECT MAX(orden) as m FROM ensayos WHERE nro_ot = ?').get(ot.nro_ot);
        const nuevoOrden = (maxOrden?.m || 0) + 1;
        accion = 'creado';
        const info = db.prepare('INSERT INTO ensayos (nro_ot, tipo, orden, datos_json) VALUES (?, ?, ?, ?)')
          .run(ot.nro_ot, tipo, nuevoOrden, JSON.stringify({}));
        ensayo = { id: info.lastInsertRowid, datos_json: '{}' };
      }
      camposConFotos.forEach(campo => {
        const existentes = Array.isArray(datosPrev[campo]) ? datosPrev[campo] : [];
        const setNames = new Set(existentes.map(p => String(p.name || '').toLowerCase()));
        const nuevas = (resFotos.resultado[campo] || []).filter(p => !setNames.has(String(p.name || '').toLowerCase()));
        datosPrev[campo] = existentes.concat(nuevas);
      });
      db.prepare('UPDATE ensayos SET datos_json = ? WHERE id = ?').run(JSON.stringify(datosPrev), ensayo.id);
      items.push({
        nro_ot: ot.nro_ot, ensayo_id: ensayo.id, accion, cantidad,
        sin_clasificar: (resFotos.resultado._sin_clasificar || []).length,
      });
      try {
        registrarEvento(ot.nro_ot, 'Fotos auto-cargadas ' + accion + ' vía propagación de solicitud (' + cantidad + ' fotos) — ' + tipo, 'edit');
      } catch (_) {}
    }
    return res.json({ nro_solicitud: otRef.nro_solicitud, tipo, items });
  } catch (err) { console.error('[POST /fotos-auto-solicitud]', err); res.status(500).json({ error: err.message }); }
});

router.post('/generate/:nro_ot', upload.array('fotos'), async (req, res) => {
  const { nro_ot } = req.params;

  const ot = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
  if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
  // Sanitizar id_muestra: limpia caracteres Unicode invisibles (Trello/copy-paste)
  // que rompen el layout y desplazan la imagen de carátula a la siguiente página.
  ot.id_muestra = sanitizarIdMuestra(ot.id_muestra);

  // ── Fecha de aprobación obligatoria antes de generar ───────────────────
  // Regla del laboratorio: no se puede emitir un informe sin la fecha de
  // aprobación de gerencia. Suele venir por Trello (custom field) pero si el
  // bot creó la OT sin ella, hay que completarla con "Editar solicitud".
  if (!String(ot.fecha_aprobacion || '').trim()) {
    return res.status(422).json({
      error: 'No se puede generar el informe: falta la fecha de aprobación.',
      code: 'FALTA_FECHA_APROBACION',
      hint: 'Cargá la fecha de aprobación desde "Editar solicitud" (aplica a las OTs hermanas) o desde "Editar OT".',
    });
  }

  // ── Setear fecha de finalización = hoy ─────────────────────────────────
  // La fecha de finalización representa el día de emisión del informe. Se
  // actualiza CADA vez que se genera el Word (así el header lleva la fecha
  // actual, y si el usuario re-emite queda registrado el nuevo día).
  {
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const hoyIso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    if (ot.fecha_finalizacion !== hoyIso) {
      db.prepare('UPDATE ots SET fecha_finalizacion = ? WHERE nro_ot = ?').run(hoyIso, nro_ot);
      ot.fecha_finalizacion = hoyIso;
    }
  }

  let ensayos = db.prepare('SELECT * FROM ensayos WHERE nro_ot = ? ORDER BY orden').all(nro_ot);

  // ── Firma del realizador obligatoria (solo informe definitivo) ─────────
  // Cada ensayo debe estar FIRMADO (estado 'revisado' o 'autorizado') antes de
  // poder generar el informe. La aprobación adicional del evaluador es opcional.
  // En preinforme (ot.es_preinforme=1) se permite emitir con ensayos abiertos:
  // es un borrador que se manda al cliente antes de la firma final.
  if (!ot.es_preinforme) {
    const sinFirmar = ensayos.filter(e => (e.estado_firma || 'abierto') === 'abierto');
    if (sinFirmar.length > 0) {
      return res.status(422).json({
        error: 'No se puede generar el informe: hay ensayos sin firmar.',
        code: 'ENSAYOS_SIN_FIRMAR',
        pendientes: sinFirmar.map(e => ({
          id: e.id,
          tipo: e.tipo,
          estado: e.estado_firma || 'abierto',
          falta: 'firma del técnico',
        })),
      });
    }
  }

  // ── Check de equipos/patrones vencidos (requisito OAA) ─────────────────────
  // El usuario puede forzar la emisión con ?forzar=true (queda registrado en eventos).
  const forzar = req.query && (req.query.forzar === 'true' || req.query.forzar === '1');
  try {
    const eqCheck = chequearEquiposVencidos(ensayos);
    if (eqCheck.vencidos.length > 0 && !forzar) {
      return res.status(422).json({
        error: 'Hay equipos/patrones con calibración vencida referenciados en los ensayos. Actualizar la calibración o forzar la emisión.',
        code: 'EQUIPO_VENCIDO',
        vencidos: eqCheck.vencidos,
        por_vencer: eqCheck.por_vencer,
      });
    }
    if (eqCheck.vencidos.length > 0 && forzar) {
      registrarEvento(
        nro_ot,
        'Emisión FORZADA con equipos vencidos: ' + eqCheck.vencidos.map(v => v.tag).join(', '),
        'alertTri'
      );
    }
  } catch (e) { console.warn('[equipos-check] falló:', e.message); }

  // Aplicar decisiones OAA (detección 100% automática) — setea
  // datos.oaa / datos.nota_oaa según corresponda antes de generar el Word.
  try {
    const { aplicarDecisionesOAA } = require('../agents/agente-oaa');
    ensayos = aplicarDecisionesOAA(ensayos);
  } catch (e) { console.warn('[OAA] No se pudieron aplicar decisiones:', e.message); }

  // Fotos: usar las del request si vienen, si no cargar las guardadas en DB
  let fotosCaratula = (req.files || []).map(f => f.buffer);
  if (!fotosCaratula.length && ot.fotos_json) {
    try {
      const items = JSON.parse(ot.fotos_json);
      fotosCaratula = items.map(item => {
        const b64 = item.dataUrl.replace(/^data:[^;]+;base64,/, '');
        return Buffer.from(b64, 'base64');
      });
    } catch {}
  }

  // Reemisión OAA: si ya hay un informe vigente y esta OT tiene ensayos
  // acreditados, adjuntar al `ot` los datos necesarios para que el generator
  // emita las 2 líneas obligatorias (anula-y-reemplaza + motivo del cambio).
  try {
    const { informeVigente, contarEmitidos } = require('../utils/versionado');
    const prevInfo = informeVigente(nro_ot);
    const total = contarEmitidos(nro_ot);
    // Es reemisión si ya hubo emisiones previas.
    if (prevInfo && total > 0) {
      const acreditado = ensayos.some(e => {
        const d = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : (e.datos_json || {});
        return d._es_acreditado === true;
      });
      const motivoRecibido = String((req.query && req.query.motivo_cambio)
                                 || (req.body && req.body.motivo_cambio) || '').trim();
      if (acreditado && motivoRecibido) {
        ot._reemision_oaa = {
          nro_ot_previo: nro_ot,
          motivo_cambio: motivoRecibido,
        };
      }
    }
  } catch (e) { console.warn('[reemision-oaa] check:', e.message); }

  try {
    const buffer = await generarWordCompleto(ot, ensayos, fotosCaratula);
    const razonSocial  = (ot.razon_social  || '').replace(/[/\\:*?"<>|]/g, '').trim();
    const nroSolPad    = String(ot.nro_solicitud || '').padStart(7, '0');
    const nroOtPad     = String(nro_ot).padStart(10, '0');
    const preSuffix    = ot.es_preinforme ? '_PRELIMINAR' : '';
    const filenameDefault = `${razonSocial}_M${nroSolPad}_${nroOtPad}${preSuffix}.docx`;

    // Nuevo flujo: si viene `carpeta_destino` (path absoluto elegido/confirmado
    // por el usuario), guarda ahí. `filename` es opcional (respeta el sugerido).
    // El fuzzy-match automático se preserva sólo si no vienen ambos flags nuevos.
    let carpetaDestino = (req.body && req.body.carpeta_destino)
                       || (req.query && req.query.carpeta_destino);
    // filename puede venir por body O por query (el front usa POST con
    // query string, por eso hay que aceptar ambas).
    const filenameFromClient = (req.body && req.body.filename)
                            || (req.query && req.query.filename)
                            || '';
    let filenameFinal = filenameFromClient || filenameDefault;
    // Flag: si el técnico eligió un nombre custom (vía el modal "Guardar con
    // otro nombre"), NO reaplicamos la convención por cliente — se respeta
    // exactamente lo que escribió.
    const nombreCustom = !!(req.body && req.body.nombre_custom)
                       || (req.query && (req.query.nombre_custom === 'true' || req.query.nombre_custom === '1'));
    if (carpetaDestino) {
      carpetaDestino = String(carpetaDestino);
      // Si la carpeta elegida NO termina en un patrón "SOL <n>", agregar
      // automáticamente la subcarpeta de solicitud. Ej: usuario eligió
      // `.../CLIENTE/` → guardar en `.../CLIENTE/SOL 00200/`.
      const solRe = /SOL[\s\-_]*\d+\s*$/i;
      if (!solRe.test(pathMod.basename(carpetaDestino))) {
        const nroSol = String(ot.nro_solicitud || '').replace(/[^\d]/g, '') || '0';
        carpetaDestino = pathMod.join(carpetaDestino, 'SOL ' + nroSol.padStart(5, '0'));
      }
      // Aplicar convención de filename por cliente (ej. Cintolo → <nro_ot>.docx).
      // Solo si el técnico NO puso un nombre custom.
      if (!nombreCustom) {
        const carpetaClienteName = pathMod.basename(pathMod.dirname(carpetaDestino));
        filenameFinal = filenamePorCliente(carpetaClienteName, filenameFinal, nro_ot);
        if (filenameFinal === (filenameFromClient || filenameDefault)) {
          filenameFinal = filenamePorCliente(ot.razon_social || '', filenameFinal, nro_ot);
        }
      }
    }

    // Se respeta el filename que el técnico eligió. Si hay colisión, el
    // modo_conflicto decide (sobrescribir / sufijo / nombre manual). El sufijo
    // -N del filename final se reflejará en el encabezado del Word como "OT: XXXX/N".
    // El buffer se modifica más abajo, una vez sabemos el filename definitivo.
    // Helper para detectar la versión desde un filename (base-<N>.docx → N).
    const extraerVersionDeFilename = (fn) => {
      const m = String(fn || '').match(/-(\d+)\.docx$/i);
      return m ? parseInt(m[1], 10) : 1;
    };

    // ── Precheck de sobreescritura ────────────────────────────────────────
    // Si el archivo destino ya existe físicamente y el usuario no eligió modo,
    // devolvemos 409 para que el front pregunte (sobrescribir / renombrar (1) / cancelar).
    if (carpetaDestino) {
      const modoConflicto = (req.body && req.body.modo_conflicto)
                         || (req.query && req.query.modo_conflicto)
                         || '';
      const destinoAbs = pathMod.join(carpetaDestino, filenameFinal);
      if (fsMod.existsSync(destinoAbs) && !modoConflicto) {
        // Calcular sufijo -N sugerido (siguiente libre) para pre-cargar el
        // input del modal en el front. Si existen nombre.docx y nombre-1.docx,
        // devolvemos nombre-2.docx.
        const ext = pathMod.extname(filenameFinal);
        const base = filenameFinal.slice(0, filenameFinal.length - ext.length);
        let sugerido = filenameFinal;
        for (let i = 1; i <= 999; i++) {
          const candidato = `${base}-${i}${ext}`;
          if (!fsMod.existsSync(pathMod.join(carpetaDestino, candidato))) {
            sugerido = candidato; break;
          }
        }
        return res.status(409).json({
          error: 'El archivo ya existe en la carpeta destino.',
          code: 'ARCHIVO_YA_EXISTE',
          carpeta: carpetaDestino,
          filename: filenameFinal,
          filename_sugerido: sugerido,
          ruta_existente: destinoAbs,
        });
      }
    }

    let rutaGuardada = null;
    let encoladoPendiente = null;
    let filenamePersistido = filenameFinal;    // El nombre real con el que se persistió (incluye sufijo si hubo).
    let bufferPersistido    = buffer;          // El buffer que efectivamente se guardó (con /N en el header si aplica).
    if (carpetaDestino) {
      const modoConflicto = String((req.body && req.body.modo_conflicto)
                                || (req.query && req.query.modo_conflicto)
                                || 'sufijo');
      try {
        // 1) Determinar el path final. En modo sobrescribir es el mismo; en
        // sufijo, guardarEnCarpeta busca el próximo -N libre.
        let destinoAbs;
        if (modoConflicto === 'sobrescribir') {
          destinoAbs = pathMod.join(carpetaDestino, filenameFinal);
        } else {
          const { obtenerNombreUnico } = require('../utils/guardar-en-drive');
          fsMod.mkdirSync(carpetaDestino, { recursive: true });
          destinoAbs = obtenerNombreUnico
            ? obtenerNombreUnico(carpetaDestino, filenameFinal)
            : pathMod.join(carpetaDestino, filenameFinal);
        }
        filenamePersistido = pathMod.basename(destinoAbs);
        // 2) Aplicar /N en encabezado si el filename tiene sufijo -N.
        const versionFinal = extraerVersionDeFilename(filenamePersistido);
        if (versionFinal > 1) {
          try { bufferPersistido = aplicarVersionEncabezado(buffer, versionFinal); }
          catch (e) { console.warn('[versionado] no se pudo aplicar /N al header:', e.message); bufferPersistido = buffer; }
        }
        // 3) Escribir.
        fsMod.writeFileSync(destinoAbs, bufferPersistido);
        rutaGuardada = destinoAbs;
        console.log('[drive] Guardado:', destinoAbs, versionFinal > 1 ? `(header con /${versionFinal})` : '');
      } catch (e) {
        // El drive no está accesible: en vez de fallar, encolamos el guardado
        // para reintentar en background. La emisión sigue siendo válida (queda
        // registrada en informes_emitidos con snapshot).
        console.warn('[drive] fallo guardado, encolando:', e.message);
        try {
          const colaGuardado = require('../utils/cola-guardado');
          encoladoPendiente = colaGuardado.encolar({
            nro_ot, filename: filenameFinal, carpeta_destino: carpetaDestino,
            buffer: bufferPersistido, error: e.message,
          });
        } catch (encErr) {
          console.warn('[cola-guardado] no se pudo encolar:', encErr.message);
          return res.status(500).json({ error: 'No se pudo guardar en la carpeta ni encolar: ' + e.message });
        }
      }
    } else {
      // Fallback legacy: fuzzy match automático (para compatibilidad).
      try { rutaGuardada = guardarEnDrive(ot.razon_social, ot.nro_solicitud, filenameFinal, buffer, nro_ot); }
      catch (e) { console.warn('[drive]', e.message); }
    }

    // Ajustar filenameFinal + buffer2 para los pasos posteriores (registro
    // inmutable + response) para que reflejen lo que realmente se persistió.
    filenameFinal = filenamePersistido;
    const buffer2 = bufferPersistido;
    const rutaVigenteSuperada = null;
    const versionEmitir = extraerVersionDeFilename(filenameFinal);

    // Persistir en DB si se guardó.
    if (rutaGuardada) {
      try {
        db.prepare('UPDATE ots SET informe_path = ?, informe_generado_en = datetime(\'now\') WHERE nro_ot = ?')
          .run(rutaGuardada, nro_ot);
      } catch (e) { console.warn('[db] persist informe_path:', e.message); }
    }

    // ── Registro inmutable del informe emitido ──────────────────────────────
    // Guarda hash SHA-256 + snapshot completo del payload usado (OT + ensayos con
    // OAA aplicado). Permite regenerar/auditar el informe idéntico a futuro.
    let __registroInforme = null;
    let __sha256 = null;
    try {
      const sha256 = crypto.createHash('sha256').update(buffer2).digest('hex');
      __sha256 = sha256;
      let acreditadoFlag = false;
      try {
        acreditadoFlag = Array.isArray(ensayos) && ensayos.some(e => {
          const d = (typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : e.datos_json) || {};
          return d._es_acreditado === true;
        });
      } catch {}
      // Hash del template usado (aproximación: hash del docx generado antes de
      // post-processing sirve como firma de la salida; el template real vive
      // dentro del generator/template y no es 1 solo archivo. Guardamos SHA
      // del buffer pre-versión como referencia estable de "formato").
      const templateSha = crypto.createHash('sha256').update(buffer).digest('hex');
      // Motivo del cambio: obligatorio para reemisiones OAA (version > 1 y
      // acreditado). Viene del query/body — el modal del front lo pide antes
      // de reemitir. Se persiste en informes_emitidos.motivo_cambio.
      const motivoCambio = (req.query && req.query.motivo_cambio)
                        || (req.body && req.body.motivo_cambio)
                        || '';
      const reg = registrarInformeEmitido({
        nro_ot,
        filename: filenameFinal,
        ruta: rutaGuardada,
        sha256,
        size_bytes: buffer2.length,
        acreditado: acreditadoFlag,
        es_preinforme: !!ot.es_preinforme,
        payload_ot: ot,
        payload_ensayos: ensayos,
        version: versionEmitir,
        template_sha256: templateSha,
        ruta_original: rutaGuardada,
        motivo_cambio: motivoCambio || null,
      });
      __registroInforme = reg;
      const marcaCorr = (reg && reg.correlativo) ? ` [${reg.correlativo}]` : '';
      registrarEvento(
        nro_ot,
        `Informe generado${marcaCorr} — SHA ${sha256.slice(0,10)}…`,
        'file'
      );
    } catch (e) { console.warn('[trazabilidad] no se registró informe emitido:', e.message); }

    // Modo "solo drive": responde JSON sin binary.
    const soloDrive = req.query && (req.query.solo_drive === 'true' || req.query.solo_drive === '1');
    if (soloDrive) {
      if (rutaGuardada) return res.json({
        ok: true,
        ruta: rutaGuardada,
        filename: filenameFinal,
        informe_id: __registroInforme && __registroInforme.id || null,
        version: (typeof versionEmitir !== 'undefined') ? versionEmitir : 1,
        sha256: __sha256,
        correlativo: __registroInforme && __registroInforme.correlativo || null,
      });
      if (encoladoPendiente) {
        return res.json({
          ok: true,
          encolado: true,
          pendiente_id: encoladoPendiente.id,
          filename: filenameFinal,
          carpeta_destino: carpetaDestino,
          mensaje: 'El drive no está accesible ahora. El informe quedó en cola y se guardará cuando vuelva la conexión.',
        });
      }
      return res.status(500).json({ error: 'No se pudo guardar el informe en el drive.' });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameFinal}"; filename*=UTF-8''${encodeURIComponent(filenameFinal)}`);
    if (rutaGuardada) res.setHeader('X-Drive-Path', encodeURIComponent(rutaGuardada));
    res.send(buffer);
  } catch (err) {
    console.error('Error generando Word:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── AS400: generación Node del Excel Cintolo ────────────────────────────────
// Port del as400.py: toma hasta 10 informes .xlsm y arma "OC XXXXX.xlsx" en
// G:\METALMECANICA\_REGISTROS DE METALMECANICA\INFORMES\CINTOLO\AS 400.
//
// POST /api/as400/generar
//   Body: { nro_solicitud?: string, informes?: [rutasXlsm], carpeta_salida?: string }
//   Si viene `nro_solicitud`, busca los .xlsm en:
//     G:\METALMECANICA\_REGISTROS DE METALMECANICA\INFORMES\CINTOLO\SOL <NNNN> */\*.xlsm
//   Si viene `informes`, usa esas rutas directamente.
const AS400_PLANTILLA_DEFAULT = process.env.AS400_PLANTILLA_XLSX
  || 'G:\\ADMINISTRACION\\Personal ADM\\PATO\\CREAR AS400 CORREGIDO\\dist\\planilla AS400 hasta 10.xlsx';
const AS400_CARPETA_SOL_BASE  = process.env.AS400_CARPETA_SOL_BASE
  || 'G:\\METALMECANICA\\_REGISTROS DE METALMECANICA\\INFORMES\\CINTOLO';

function buscarInformesPorSolicitud(nroSolicitud) {
  const nro = String(parseInt(nroSolicitud, 10) || nroSolicitud || '').trim();
  if (!nro) return [];
  if (!fsMod.existsSync(AS400_CARPETA_SOL_BASE)) return [];
  // Buscar carpeta "SOL <nro> ..." (tolera padding de ceros y sufijos de fecha).
  const nroPad = nro.padStart(7, '0');
  const solRegex = new RegExp(`^SOL\\s*0*${nro}\\b`, 'i');
  const hijas = fsMod.readdirSync(AS400_CARPETA_SOL_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory() && solRegex.test(d.name));
  if (!hijas.length) return [];
  const carpetaSol = pathMod.join(AS400_CARPETA_SOL_BASE, hijas[0].name);
  // Listar todos los .xlsm dentro de la carpeta. Excluye:
  //   - Lockfiles de Office ("~$*.xlsm"): archivos temporales que Excel crea
  //     mientras un usuario tiene el archivo abierto. NO son ZIPs válidos y
  //     rompen PizZip con "Can't find end of central directory".
  //   - Archivos ocultos ".DS_Store" u otros con "." al inicio.
  const xlsm = fsMod.readdirSync(carpetaSol)
    .filter(n => /\.xlsm$/i.test(n))
    .filter(n => !n.startsWith('~$'))
    .filter(n => !n.startsWith('.'))
    .sort()
    .map(n => pathMod.join(carpetaSol, n));
  return xlsm;
}

// Endpoint de diagnóstico: recibe un .xlsm y devuelve el contenido leído
// (columna C rows 1..59) para ver exactamente qué valor lee el parser.
// Con ?full=1 devuelve TODAS las celdas de TODOS los sheets — útil para
// investigar cuándo un dato esperado no aparece donde debería.
router.post('/as400/diagnosticar', upload.array('informes'), (req, res) => {
  try {
    const asMod = require('../utils/as400-generator');
    const PizZip = require('pizzip');
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Adjuntar al menos un .xlsm' });
    const full = req.query && (req.query.full === '1' || req.query.full === 'true');
    const out = files.map(f => {
      try {
        const info = asMod.leerInformeDesdeBuffer(f.buffer, f.originalname);
        const filas = {};
        for (let r = 1; r <= 59; r++) {
          filas[r] = info.col_c[r] == null ? null : String(info.col_c[r]);
        }
        const base = {
          archivo: f.originalname,
          codigo: info.codigo, ot: info.ot, oc: info.oc, tratamiento: info.tratam,
          col_c: filas,
          warnings: info.warnings || [],
        };
        if (!full) return base;
        // Modo full: escanear TODOS los sheets con todas las celdas + fórmulas.
        // Reutilizamos el parser interno del generator vía re-implementación mínima.
        const zip = new PizZip(f.buffer);
        const wbXml = zip.files['xl/workbook.xml'].asText();
        const relsXml = zip.files['xl/_rels/workbook.xml.rels'].asText();
        const rxSheet = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g;
        const sheetsByName = {};
        let ms; while ((ms = rxSheet.exec(wbXml))) sheetsByName[ms[1]] = ms[2];
        const rxRel = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
        const relById = {};
        let mrel; while ((mrel = rxRel.exec(relsXml))) relById[mrel[1]] = mrel[2];
        const ssEntry = zip.files['xl/sharedStrings.xml'];
        // Parser mínimo de shared strings para el diag full.
        const ss = [];
        if (ssEntry) {
          const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
          let mss;
          while ((mss = siRe.exec(ssEntry.asText()))) {
            const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
            let acc = '', mt; while ((mt = tRe.exec(mss[1]))) acc += mt[1];
            ss.push(acc);
          }
        }
        const sheets = {};
        Object.keys(sheetsByName).forEach(name => {
          const rid = sheetsByName[name];
          const target = relById[rid];
          if (!target) return;
          const entry = zip.files['xl/' + target.replace(/^\/?/, '')];
          if (!entry) return;
          const xml = entry.asText();
          const rowsOut = {};
          const rxRow = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
          let mrow;
          while ((mrow = rxRow.exec(xml))) {
            const rn = parseInt(mrow[1], 10);
            if (rn > 100) continue;
            const cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
            let mc;
            const cols = {};
            while ((mc = cRe.exec(mrow[2]))) {
              const attrs = mc[1] || mc[3] || '';
              const inner = mc[2] || '';
              const rMatch = /\br="([A-Z]+)(\d+)"/.exec(attrs);
              if (!rMatch) continue;
              const col = rMatch[1];
              const tMatch = /\bt="([^"]+)"/.exec(attrs);
              const t = tMatch ? tMatch[1] : null;
              const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
              const fMatch = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(inner);
              let val = null;
              if (vMatch) {
                const raw = vMatch[1];
                if (t === 's') val = ss[parseInt(raw, 10)];
                else val = raw;
              }
              const isMatch = /<is>([\s\S]*?)<\/is>/.exec(inner);
              if (isMatch && t === 'inlineStr') {
                const tRe2 = /<t[^>]*>([\s\S]*?)<\/t>/g;
                let acc = '', mit;
                while ((mit = tRe2.exec(isMatch[1]))) acc += mit[1];
                val = acc;
              }
              cols[col] = { v: val, f: fMatch ? fMatch[1] : null };
            }
            if (Object.keys(cols).length > 0) rowsOut[rn] = cols;
          }
          sheets[name] = rowsOut;
        });
        return { ...base, sheets };
      } catch (e) {
        return { archivo: f.originalname, error: e.message };
      }
    });
    res.json({ informes: out });
  } catch (err) {
    console.error('[as400/diagnosticar]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/as400/generar', upload.array('informes'), (req, res) => {
  try {
    const { generarAS400 } = require('../utils/as400-generator');
    const plantilla = process.env.AS400_PLANTILLA || AS400_PLANTILLA_DEFAULT;
    if (!fsMod.existsSync(plantilla)) {
      return res.status(404).json({ error: 'Plantilla no encontrada en: ' + plantilla });
    }
    // Body puede ser JSON (application/json) o multipart (file upload).
    const body = req.body || {};
    const overwrite = body.overwrite || null;   // 'sobreescribir' | 'renombrar' | null
    const dryRun    = body.dry_run === 'true' || body.dry_run === true || body.dry_run === '1';

    // Informes: 3 fuentes posibles.
    //   1) Uploads multipart (req.files) → buffers en memoria.
    //   2) body.informes: rutas absolutas del server.
    //   3) body.nro_solicitud: búsqueda en G:\...\CINTOLO\SOL <N> ...
    let informesXlsm = null, informesBuffers = null;
    if (req.files && req.files.length > 0) {
      informesBuffers = req.files.map(f => ({ buffer: f.buffer, name: f.originalname }));
    } else if (Array.isArray(body.informes)) {
      informesXlsm = body.informes;
    } else if (body.nro_solicitud) {
      informesXlsm = buscarInformesPorSolicitud(body.nro_solicitud);
      if (!informesXlsm.length) {
        return res.status(404).json({
          error: 'No se encontraron .xlsm para la solicitud ' + body.nro_solicitud +
                 ' en ' + AS400_CARPETA_SOL_BASE,
        });
      }
    }
    if (!informesXlsm && !informesBuffers) {
      return res.status(400).json({ error: 'Falta subir informes .xlsm, o pasar nro_solicitud/informes' });
    }

    const carpetaSalida = body.carpeta_salida || undefined;
    let result;
    try {
      result = generarAS400({
        plantillaPath: plantilla,
        informesXlsm,
        informesBuffers,
        carpetaSalida,
        overwrite,
        dryRun,
      });
    } catch (e) {
      if (e && e.code === 'DESTINO_EXISTE') {
        return res.status(409).json({
          error: 'El archivo destino ya existe.',
          code: 'DESTINO_EXISTE',
          destino: e.destino,
          filename: e.filenameFinal,
        });
      }
      throw e;
    }

    try {
      if (body.nro_solicitud) {
        registrarEvento('SOL-' + body.nro_solicitud,
          `AS400 generado → ${pathMod.basename(result.ruta)}`, 'file');
      }
    } catch {}

    // Advertencias de alargamiento con 2+ decimales — el usuario debe revisar
    // manualmente estos bloques (valor mal cargado en el fuente).
    const advertenciasAlargamiento = [];
    result.informes.forEach(inf => {
      if (Array.isArray(inf.advertenciasAlargamiento) && inf.advertenciasAlargamiento.length > 0) {
        inf.advertenciasAlargamiento.forEach(a => {
          advertenciasAlargamiento.push({
            bloque: inf.bloque,
            oc: inf.oc,
            campo: a.campo,
            valor: a.valor,
          });
        });
      }
    });

    res.json({
      ok: true, ruta: result.ruta, filename: pathMod.basename(result.ruta),
      existe: !!result.existe,
      dry_run: !!result.dryRun,
      informes: result.informes.map(i => ({ oc: i.oc, codigo: i.codigo, ot: i.ot, tratam: i.tratam })),
      advertencias_alargamiento: advertenciasAlargamiento,
    });
  } catch (err) {
    console.error('[as400/generar]', err);
    res.status(500).json({ error: err.message });
  }
});

// Lanzador legacy del .exe (por si algún día se necesita el flow anterior).
const AS400_PATH_DEFAULT = process.env.AS400_EXE_PATH_DEFAULT
  || 'G:\\ADMINISTRACION\\Personal ADM\\PATO\\CREAR AS400 CORREGIDO\\dist\\as400.exe';
router.post('/as400/lanzar', (req, res) => {
  try {
    const exePath = process.env.AS400_EXE_PATH || AS400_PATH_DEFAULT;
    if (!fsMod.existsSync(exePath)) {
      return res.status(404).json({ error: 'No se encontró el ejecutable AS400 en: ' + exePath });
    }
    const child = spawn(exePath, [], {
      detached: true, stdio: 'ignore', windowsHide: false,
      cwd: pathMod.dirname(exePath),
    });
    child.unref();
    try {
      const nroOt = (req.body && req.body.nro_ot) || null;
      if (nroOt) registrarEvento(nroOt, 'AS400 (Excel Cintolo) lanzado', 'file');
    } catch {}
    res.json({ ok: true, path: exePath });
  } catch (err) {
    console.error('[as400/lanzar]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Trello: tarjetas del tablero clasificadas por vencimiento ───────────────
// Consulta el board completo (con cache de 5 min) y devuelve las tarjetas
// abiertas con `due` clasificadas en hoy / mañana / vencidas / próximas.
// No requiere que las OTs estén importadas al sistema.
router.get('/trello/vencimientos', async (req, res) => {
  try {
    // Modo mock: ?mock=1 devuelve datos ficticios para preview del banner.
    if (req.query && req.query.mock === '1') {
      const pad = n => String(n).padStart(2, '0');
      const hoy = new Date();
      const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const manana = new Date(hoy.getTime() + 86400000);
      const pasadoManana = new Date(hoy.getTime() + 2 * 86400000);
      return res.json({
        hoy: [
          { id_trello: 'mock-hoy-1', titulo: 'INDUSTRIAS DELGADO S.A. - 38183', cliente: 'INDUSTRIAS DELGADO S.A.', nro_solicitud: '38183', due: iso(hoy), dias: 0, lista: 'Ensayos', url: '#', es_cintolo: false, en_sistema: true },
          { id_trello: 'mock-hoy-2', titulo: 'A. EVANGELISTA SA - 00195', cliente: 'A. EVANGELISTA SA', nro_solicitud: '195', due: iso(hoy), dias: 0, lista: 'Informe Preliminar', url: '#', es_cintolo: false, en_sistema: true },
          { id_trello: 'mock-hoy-3', titulo: 'CINTOLO - URGENTE 72h (AS400) - 0000212', cliente: 'CINTOLO', nro_solicitud: '212', due: iso(hoy), dias: 0, lista: 'Evaluación Técnica', url: '#', es_cintolo: true, en_sistema: false },
        ],
        'mañana': [
          { id_trello: 'mock-man-1', titulo: 'CINTOLO - 0000206',       cliente: 'CINTOLO',            nro_solicitud: '206', due: iso(manana), dias: 1, lista: 'Mecanizado de probetas', url: '#', es_cintolo: true,  en_sistema: false },
          { id_trello: 'mock-man-2', titulo: 'CINTOLO - 0000214',       cliente: 'CINTOLO',            nro_solicitud: '214', due: iso(manana), dias: 1, lista: 'Mecanizado de probetas', url: '#', es_cintolo: true,  en_sistema: false },
          { id_trello: 'mock-man-3', titulo: 'GALILEO TECHNOLOGIES S.A. - 38213', cliente: 'GALILEO TECHNOLOGIES S.A.', nro_solicitud: '38213', due: iso(manana), dias: 1, lista: 'Ensayos', url: '#', es_cintolo: false, en_sistema: true },
          { id_trello: 'mock-man-4', titulo: 'TASSAROLI - 38208',       cliente: 'TASSAROLI',          nro_solicitud: '38208', due: iso(manana), dias: 1, lista: 'Ensayos', url: '#', es_cintolo: false, en_sistema: true },
          { id_trello: 'mock-man-5', titulo: 'MENDOZA MECANIZADOS SRL - 38246', cliente: 'MENDOZA MECANIZADOS SRL', nro_solicitud: '38246', due: iso(manana), dias: 1, lista: 'Ensayos', url: '#', es_cintolo: false, en_sistema: true },
        ],
        vencidas: [], proximas: [],
      });
    }
    const { fetchTablero, clasificar, invalidarCache } = require('../utils/trello-fetcher');
    if (req.query && req.query.refresh === '1') invalidarCache();
    const { cards, listaPorId } = await fetchTablero();
    const clas = clasificar(cards, listaPorId);
    // Cruzar con OTs del sistema para saber cuáles ya están importadas
    // (por nro_solicitud). Habilita link directo al detalle interno.
    try {
      const solImportadas = new Set(
        db.prepare('SELECT DISTINCT nro_solicitud FROM ots WHERE nro_solicitud IS NOT NULL').all()
          .map(r => String(r.nro_solicitud))
      );
      ['vencidas', 'hoy', 'mañana', 'proximas'].forEach(k => {
        clas[k] = clas[k].map(it => Object.assign({}, it, {
          en_sistema: it.nro_solicitud && solImportadas.has(String(parseInt(it.nro_solicitud, 10) || it.nro_solicitud)),
        }));
      });
    } catch {}
    res.json(clas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── OTs con vencimiento (para dashboard: alertas del día + próximos) ────────
router.get('/ots/vencimientos', (req, res) => {
  try {
    const hoy = new Date();
    const pad = n => String(n).padStart(2, '0');
    const hoyISO = hoy.getFullYear() + '-' + pad(hoy.getMonth() + 1) + '-' + pad(hoy.getDate());
    // Retorna todas las OTs con fecha_vencimiento no vencidas hace más de 30 días
    // ni futuras a más de 15 días. Frontend clasifica en "hoy" / "próximas" / "vencidas".
    const rows = db.prepare(`
      SELECT nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
             fecha_vencimiento, fecha_recepcion, informe_generado_en,
             estado_firma, trello_columna
      FROM ots
      WHERE fecha_vencimiento IS NOT NULL AND fecha_vencimiento != ''
      ORDER BY fecha_vencimiento ASC
    `).all();
    const parseDMS = s => {
      const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
    };
    const toDate = s => {
      const p = parseDMS(s); if (!p) return null;
      return new Date(Date.UTC(p.y, p.mo - 1, p.d));
    };
    const hoyDate = toDate(hoyISO);
    const clasificadas = { hoy: [], mañana: [], proximas: [], vencidas: [] };
    for (const r of rows) {
      // Si ya tiene informe generado + estado firmado/autorizado, no está pendiente.
      const yaCerrada = !!r.informe_generado_en && (r.estado_firma === 'firmado' || r.estado_firma === 'autorizado');
      if (yaCerrada) continue;
      const d = toDate(r.fecha_vencimiento);
      if (!d) continue;
      const dias = Math.round((d - hoyDate) / (24 * 3600 * 1000));
      const item = Object.assign({}, r, { dias });
      if (dias < 0) clasificadas.vencidas.push(item);
      else if (dias === 0) clasificadas.hoy.push(item);
      else if (dias === 1) clasificadas.mañana.push(item);
      else if (dias <= 7) clasificadas.proximas.push(item);
    }
    res.json(clasificadas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Pre-check de equipos vencidos (usado por el front antes de generar) ─────
router.get('/generate/:nro_ot/precheck', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const ensayos = db.prepare('SELECT id, tipo, datos_json FROM ensayos WHERE nro_ot = ?').all(nro_ot);
    const check = chequearEquiposVencidos(ensayos);
    res.json(check);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Detección de carpeta candidata (SIN generar el buffer) ────────────────────
// Retorna la propuesta de carpeta y filename basada en fuzzy match del cliente
// y de la carpeta SOL. El frontend usa esto para mostrar el popup de
// confirmación antes de generar el informe.
router.get('/generate/:nro_ot/detectar-carpeta', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const ot = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    const razonSocial  = (ot.razon_social  || '').replace(/[/\\:*?"<>|]/g, '').trim();
    const nroSolPad    = String(ot.nro_solicitud || '').padStart(7, '0');
    const nroOtPad     = String(nro_ot).padStart(10, '0');
    const preSuffix    = ot.es_preinforme ? '_PRELIMINAR' : '';
    const filenameDefault = `${razonSocial}_M${nroSolPad}_${nroOtPad}${preSuffix}.docx`;

    // Determinar si el informe va a la carpeta 1. OAA: alcanza con que AL
    // MENOS UN ensayo sea acreditado (informe mezclado o completo acreditado).
    // Solo si TODOS los ensayos son NO acreditados va a la carpeta general.
    let acreditado = false;
    try {
      const ensayos = db.prepare('SELECT id, tipo, datos_json FROM ensayos WHERE nro_ot = ?').all(nro_ot);
      if (ensayos.length > 0) {
        const { detectarLote } = require('../agents/agente-oaa');
        const parsed = ensayos.map(e => {
          let datos = {};
          try { datos = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : (e.datos_json || {}); } catch {}
          return { id: e.id, tipo: e.tipo, datos };
        });
        const detecciones = detectarLote(parsed);
        acreditado = detecciones.some(d => d.acreditado === true);
      }
    } catch (e) { console.warn('[detectar-carpeta] no se pudo determinar acreditación:', e.message); }

    const info = detectarCarpeta(ot.razon_social, ot.nro_solicitud, filenameDefault, nro_ot, { acreditado });
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Navegador de carpetas del drive ──────────────────────────────────────────
// GET /api/drive/subcarpetas?path=<abs>  — lista subcarpetas del path.
// Sin path, retorna el root del drive.
router.get('/drive/subcarpetas', (req, res) => {
  try {
    const p = (req.query && req.query.path) ? String(req.query.path) : ROOT_DRIVE;
    // Seguridad básica: aceptamos cualquier path dentro de la letra G:\ o el
    // root configurado (permite navegar libremente al usuario dentro de su drive).
    if (!fsMod.existsSync(p)) return res.status(404).json({ error: 'Carpeta no encontrada' });
    const items = listarSubcarpetas(p);
    const parent = pathMod.dirname(p);
    res.json({
      path: p,
      parent: (parent === p) ? null : parent,   // null si estamos en la raíz
      items,
      root: ROOT_DRIVE,
      root_ok: fsMod.existsSync(ROOT_DRIVE),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Abrir carpeta en el explorador de Windows ────────────────────────────────
// Body: { path }
// Usa `spawn` con array de args (sin shell) para evitar problemas con paths
// que contengan espacios, %, & u otros caracteres que romperían un exec string.
router.post('/drive/abrir', (req, res) => {
  try {
    const p = (req.body && req.body.path) || '';
    if (!p) return res.status(400).json({ error: 'Falta el parámetro path' });
    if (!fsMod.existsSync(p)) return res.status(404).json({ error: 'Carpeta o archivo no encontrado: ' + p });
    // Si el path es un archivo, abrimos su carpeta contenedora seleccionándolo.
    const isFile = !fsMod.statSync(p).isDirectory();
    const target = isFile ? pathMod.dirname(p) : p;
    // `explorer.exe` acepta el path directamente. Con spawn+detached el proceso
    // sobrevive al server. Ignoramos exitCode (explorer devuelve 1 aún abriendo OK).
    try {
      const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
    } catch (e) {
      // Fallback: exec con quoting.
      exec(`explorer "${target.replace(/"/g, '')}"`, () => {});
    }
    res.json({ ok: true, opened: target });
  } catch (err) {
    console.error('[drive/abrir]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Flags manuales por solicitud (Cargado / Enviado) ────────────────────────
// El usuario marca en el listado de Solicitudes cuando ya subió el informe al
// sistema del cliente (Cargado) y cuando lo envió por email (Enviado).
router.get('/solicitud-flags', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM solicitud_flags').all();
    const map = {};
    for (const r of rows) map[String(r.nro_solicitud)] = r;
    res.json({ items: map });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/solicitud-flags/:nro', (req, res) => {
  const nro = String(req.params.nro || '').trim();
  if (!nro) return res.status(400).json({ error: 'nro_solicitud requerido' });
  const patch = req.body || {};
  try {
    const existente = db.prepare('SELECT * FROM solicitud_flags WHERE nro_solicitud = ?').get(nro);
    const cargado = patch.cargado != null ? (patch.cargado ? 1 : 0) : (existente ? existente.cargado : 0);
    const enviado = patch.enviado != null ? (patch.enviado ? 1 : 0) : (existente ? existente.enviado : 0);
    // Actualiza timestamp solo si el flag pasó de 0→1.
    const cargado_en = (cargado === 1 && (!existente || existente.cargado !== 1))
      ? new Date().toISOString()
      : (existente ? existente.cargado_en : null);
    const enviado_en = (enviado === 1 && (!existente || existente.enviado !== 1))
      ? new Date().toISOString()
      : (existente ? existente.enviado_en : null);
    db.prepare(`
      INSERT INTO solicitud_flags (nro_solicitud, cargado, cargado_en, enviado, enviado_en, actualizado_en)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(nro_solicitud) DO UPDATE SET
        cargado = excluded.cargado,
        cargado_en = excluded.cargado_en,
        enviado = excluded.enviado,
        enviado_en = excluded.enviado_en,
        actualizado_en = datetime('now')
    `).run(nro, cargado, cargado_en, enviado, enviado_en);
    const row = db.prepare('SELECT * FROM solicitud_flags WHERE nro_solicitud = ?').get(nro);
    res.json({ ok: true, item: row });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Cola de guardado pendiente ──────────────────────────────────────────────
// Cuando el drive del cliente no está accesible, el guardado se encola.
// Estos endpoints permiten inspeccionar/reintentar pendientes desde el front.
const colaGuardado = require('../utils/cola-guardado');

router.get('/guardados-pendientes', (req, res) => {
  try {
    const incluir_resueltos = req.query && (req.query.incluir_resueltos === 'true' || req.query.incluir_resueltos === '1');
    const items = colaGuardado.listarPendientes({ incluir_resueltos });
    res.json({ items, total_pendientes: colaGuardado.contarPendientes() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/guardados-pendientes/:id/reintentar', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  const r = colaGuardado.reintentarUno(id);
  if (r.ok) return res.json(r);
  res.status(400).json(r);
});

router.post('/guardados-pendientes/reintentar-todos', (req, res) => {
  try {
    const r = colaGuardado.reintentarTodos({ soloConIntentosMenoresA: 1e9 });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/guardados-pendientes/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'id inválido' });
  const ok = colaGuardado.eliminar(id);
  res.json({ ok });
});

module.exports = router;
