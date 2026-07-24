// Cola persistente para guardado en drive del cliente.
// Cuando el drive de un cliente no está disponible (red caída, VPN, permisos),
// en vez de perder el docx (o quedar en un estado inconsistente), lo persistimos
// como BLOB en SQLite y reintentamos en background.
//
// - encolar(...) → inserta un pendiente en la tabla `guardados_pendientes`.
// - reintentarUno(id) / reintentarTodos() → intenta guardar cada uno.
// - iniciarWorker(intervalMs) → arranca un setInterval que reintenta pendientes.
//
// La idea es que la ruta principal `/api/generate/` NO tenga que preocuparse:
// si el guardado sincrónico falla, encolamos y devolvemos éxito con warning.

const fs   = require('fs');
const path = require('path');
const db   = require('../db');
const { guardarEnCarpeta } = require('./guardar-en-drive');

// Máximo de intentos automáticos por pendiente. Después de esto queda pendiente
// pero el worker no reintenta más solo — el usuario debe pedir un reintento manual.
const MAX_INTENTOS = 20;

function encolar({ nro_ot, filename, carpeta_destino, buffer, error }) {
  const info = db.prepare(`
    INSERT INTO guardados_pendientes
      (nro_ot, filename, carpeta_destino, buffer, ultimo_error, ultimo_intento_en)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    String(nro_ot || ''),
    String(filename || ''),
    String(carpeta_destino || ''),
    Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []),
    error ? String(error).slice(0, 500) : null
  );
  return { id: info.lastInsertRowid };
}

function listarPendientes({ incluir_resueltos = false } = {}) {
  const where = incluir_resueltos ? '' : 'WHERE resuelto = 0';
  return db.prepare(`
    SELECT id, nro_ot, filename, carpeta_destino, intentos, ultimo_error,
           ultimo_intento_en, creado_en, resuelto, resuelto_en, ruta_final,
           length(buffer) AS size_bytes
    FROM guardados_pendientes ${where}
    ORDER BY resuelto ASC, creado_en DESC
    LIMIT 200
  `).all();
}

function eliminar(id) {
  const info = db.prepare('DELETE FROM guardados_pendientes WHERE id = ?').run(id);
  return info.changes > 0;
}

// Intenta guardar UN pendiente. Actualiza intentos / ultimo_error / resuelto.
// Devuelve { ok, ruta?, error? }.
function reintentarUno(id) {
  const row = db.prepare('SELECT * FROM guardados_pendientes WHERE id = ? AND resuelto = 0').get(id);
  if (!row) return { ok: false, error: 'Pendiente no encontrado o ya resuelto' };
  try {
    const buf = Buffer.isBuffer(row.buffer) ? row.buffer : Buffer.from(row.buffer);
    const ruta = guardarEnCarpeta(row.carpeta_destino, row.filename, buf);
    db.prepare(`
      UPDATE guardados_pendientes
      SET resuelto = 1, resuelto_en = datetime('now'), ruta_final = ?, ultimo_error = NULL,
          intentos = intentos + 1, ultimo_intento_en = datetime('now')
      WHERE id = ?
    `).run(ruta, id);
    // Persistir también en la OT para que el dashboard vea el informe.
    try {
      db.prepare('UPDATE ots SET informe_path = ?, informe_generado_en = datetime(\'now\') WHERE nro_ot = ?')
        .run(ruta, row.nro_ot);
    } catch {}
    return { ok: true, ruta };
  } catch (e) {
    db.prepare(`
      UPDATE guardados_pendientes
      SET intentos = intentos + 1, ultimo_intento_en = datetime('now'), ultimo_error = ?
      WHERE id = ?
    `).run(String(e.message || e).slice(0, 500), id);
    return { ok: false, error: e.message };
  }
}

// Recorre todos los no resueltos y los intenta. Devuelve { intentados, resueltos, fallados }.
function reintentarTodos({ soloConIntentosMenoresA = MAX_INTENTOS } = {}) {
  const rows = db.prepare(`
    SELECT id FROM guardados_pendientes
    WHERE resuelto = 0 AND intentos < ?
    ORDER BY creado_en ASC
  `).all(soloConIntentosMenoresA);
  let resueltos = 0, fallados = 0;
  for (const r of rows) {
    const res = reintentarUno(r.id);
    if (res.ok) resueltos++;
    else fallados++;
  }
  return { intentados: rows.length, resueltos, fallados };
}

// Arranca un worker que reintenta cada `intervalMs` (default 60s).
// Devuelve el handle para poder detenerlo (clearInterval).
let _workerHandle = null;
function iniciarWorker(intervalMs = 60_000) {
  if (_workerHandle) return _workerHandle;
  _workerHandle = setInterval(() => {
    try {
      const r = reintentarTodos();
      if (r.resueltos > 0) {
        console.log(`[cola-guardado] resueltos ${r.resueltos}/${r.intentados} pendientes`);
      }
    } catch (e) {
      console.warn('[cola-guardado] worker error:', e.message);
    }
  }, intervalMs);
  // No mantengas vivo el process por este timer solo.
  if (typeof _workerHandle.unref === 'function') _workerHandle.unref();
  return _workerHandle;
}

function detenerWorker() {
  if (_workerHandle) { clearInterval(_workerHandle); _workerHandle = null; }
}

function contarPendientes() {
  const r = db.prepare('SELECT COUNT(*) as n FROM guardados_pendientes WHERE resuelto = 0').get();
  return r ? r.n : 0;
}

module.exports = {
  encolar,
  listarPendientes,
  reintentarUno,
  reintentarTodos,
  iniciarWorker,
  detenerWorker,
  contarPendientes,
  eliminar,
};
