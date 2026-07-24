// Helpers para escribir el audit trail de la aplicación.
const db = require('../db');

function registrarEvento(nro_ot, texto, icon) {
  try {
    db.prepare('INSERT INTO eventos (nro_ot, texto, icon) VALUES (?, ?, ?)')
      .run(nro_ot, texto, icon || null);
  } catch (e) {
    console.warn('[trazabilidad] evento:', e.message);
  }
}

function registrarHistorialEnsayo({ ensayo_id, nro_ot, tipo, accion, anterior, nuevo }) {
  try {
    db.prepare(`
      INSERT INTO ensayos_historial
        (ensayo_id, nro_ot, tipo, accion, datos_json_anterior, datos_json_nuevo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      ensayo_id, nro_ot, tipo, accion,
      anterior == null ? null : (typeof anterior === 'string' ? anterior : JSON.stringify(anterior)),
      nuevo    == null ? null : (typeof nuevo    === 'string' ? nuevo    : JSON.stringify(nuevo)),
    );
  } catch (e) {
    console.warn('[trazabilidad] historial ensayo:', e.message);
  }
}

// Genera el próximo correlativo IN-YYYY-NNNN del año en curso.
function siguienteCorrelativo() {
  const year = new Date().getFullYear();
  const prefix = 'IN-' + year + '-';
  const row = db.prepare(
    'SELECT correlativo FROM informes_emitidos WHERE correlativo LIKE ? ORDER BY id DESC LIMIT 1'
  ).get(prefix + '%');
  let n = 1;
  if (row && row.correlativo) {
    const m = String(row.correlativo).match(/-(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return prefix + String(n).padStart(4, '0');
}

function registrarInformeEmitido({
  nro_ot, filename, ruta, sha256, size_bytes,
  acreditado, es_preinforme, payload_ot, payload_ensayos,
  version, template_sha256, ruta_original,
}) {
  try {
    const correlativo = siguienteCorrelativo();
    const info = db.prepare(`
      INSERT INTO informes_emitidos
        (nro_ot, filename, ruta, sha256, size_bytes, acreditado, es_preinforme,
         payload_ot_json, payload_ens_json,
         version, template_sha256, ruta_original, correlativo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nro_ot, filename, ruta || null, sha256, size_bytes,
      acreditado ? 1 : 0, es_preinforme ? 1 : 0,
      JSON.stringify(payload_ot || {}),
      JSON.stringify(payload_ensayos || []),
      version || 1,
      template_sha256 || null,
      ruta_original || ruta || null,
      correlativo,
    );
    return { id: info.lastInsertRowid, correlativo };
  } catch (e) {
    console.warn('[trazabilidad] informe emitido:', e.message);
    return null;
  }
}

function registrarFirma({ nro_ot, ensayo_id, accion, token_id, token_nombre, motivo }) {
  try {
    db.prepare(`
      INSERT INTO firmas (nro_ot, ensayo_id, accion, token_id, token_nombre, motivo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(nro_ot, ensayo_id || null, accion, token_id || null, token_nombre || null, motivo || null);
  } catch (e) {
    console.warn('[trazabilidad] firma:', e.message);
  }
}

// Registra un error del sistema para que aparezca en el UI de Auditoría.
// Nivel puede ser 'error' | 'warn' | 'info'. Nunca falla — solo warn en consola.
function registrarError({ nivel, origen, mensaje, stack, contexto, nro_ot }) {
  try {
    db.prepare(`
      INSERT INTO errores_sistema (nivel, origen, mensaje, stack, contexto, nro_ot)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      nivel || 'error',
      origen || null,
      String(mensaje || '').slice(0, 500),
      stack ? String(stack).slice(0, 4000) : null,
      contexto ? (typeof contexto === 'string' ? contexto : JSON.stringify(contexto).slice(0, 2000)) : null,
      nro_ot || null,
    );
  } catch (e) {
    console.warn('[trazabilidad] registrarError:', e.message);
  }
}

module.exports = {
  registrarEvento,
  registrarHistorialEnsayo,
  registrarInformeEmitido,
  registrarFirma,
  registrarError,
};
