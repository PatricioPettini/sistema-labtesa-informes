// Sistema de firma con token para bloquear/desbloquear OTs.
// El token en claro NUNCA se persiste: se guarda SHA-256(salt + token).
const crypto = require('crypto');
const db = require('../db');

function generarSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashToken(token, salt) {
  return crypto.createHash('sha256').update(salt + String(token || ''), 'utf8').digest('hex');
}

// Retorna el registro del token activo cuyo hash coincide, o null.
function verificarToken(tokenPlano) {
  if (!tokenPlano) return null;
  const tokens = db.prepare('SELECT * FROM tokens_firma WHERE activo = 1').all();
  for (const t of tokens) {
    if (hashToken(tokenPlano, t.salt) === t.hash) {
      db.prepare('UPDATE tokens_firma SET ultimo_uso = datetime(\'now\') WHERE id = ?').run(t.id);
      return t;
    }
  }
  return null;
}

function crearToken({ nombre, token, rol }) {
  const salt = generarSalt();
  const hash = hashToken(token, salt);
  const rolReal = (rol === 'revisor' || rol === 'autorizante') ? rol : 'ambos';
  const info = db.prepare(
    'INSERT INTO tokens_firma (nombre, hash, salt, activo, rol) VALUES (?, ?, ?, 1, ?)'
  ).run(nombre || 'principal', hash, salt, rolReal);
  return { id: info.lastInsertRowid, nombre: nombre || 'principal', rol: rolReal };
}

function desactivarToken(id) {
  db.prepare('UPDATE tokens_firma SET activo = 0 WHERE id = ?').run(id);
}

function hayTokensConfigurados() {
  const row = db.prepare('SELECT COUNT(*) as n FROM tokens_firma WHERE activo = 1').get();
  return (row && row.n > 0);
}

function listarTokens() {
  return db.prepare(
    'SELECT id, nombre, rol, activo, creado_en, ultimo_uso FROM tokens_firma ORDER BY id DESC'
  ).all();
}

// Chequea si una OT está firmada (bloqueada para edición) — LEGACY.
// El sistema pasó a firma-por-ensayo, así que esta función queda solo por
// compatibilidad. Ver `estaFirmadoEnsayo` para el bloqueo activo.
function estaFirmada(nro_ot) {
  const row = db.prepare('SELECT estado_firma FROM ots WHERE nro_ot = ?').get(nro_ot);
  if (!row) return false;
  return row.estado_firma === 'firmado'
      || row.estado_firma === 'revisado'
      || row.estado_firma === 'autorizado';
}

// Chequea si un ensayo individual está firmado (revisado o autorizado).
// Es el bloqueo activo del sistema. La firma de OT queda como legacy.
function estaFirmadoEnsayo(ensayo_id) {
  if (!ensayo_id) return false;
  const row = db.prepare('SELECT estado_firma FROM ensayos WHERE id = ?').get(ensayo_id);
  if (!row) return false;
  return row.estado_firma === 'firmado'
      || row.estado_firma === 'revisado'
      || row.estado_firma === 'autorizado';
}

// Middleware Express — LEGACY: rechaza si la OT está firmada.
// Ya casi no se usa: mantenido solo para endpoints antiguos que aún operan
// sobre la OT completa (ej: eliminar OT).
function bloquearSiFirmada(req, res, next) {
  const nro_ot = req.params.nro_ot || (req.body && req.body.nro_ot);
  if (nro_ot && estaFirmada(nro_ot)) {
    return res.status(423).json({
      error: 'OT bloqueada por firma. Desfirmá con token para modificar.',
      code: 'OT_FIRMADA',
      nro_ot,
    });
  }
  next();
}

// Middleware Express: rechaza si el ENSAYO está firmado. Solo bloquea el
// ensayo específico; los demás ensayos de la OT quedan editables.
// Espera que el ensayo_id venga en req.params.id, req.params.ensayo_id, o
// req.body.ensayo_id / req.body.id.
function bloquearSiEnsayoFirmado(req, res, next) {
  const ensayo_id = req.params.ensayo_id || req.params.id
                  || (req.body && (req.body.ensayo_id || req.body.id));
  if (ensayo_id && estaFirmadoEnsayo(ensayo_id)) {
    return res.status(423).json({
      error: 'Ensayo bloqueado por firma. Desfirmá con token para modificar.',
      code: 'ENSAYO_FIRMADO',
      ensayo_id: Number(ensayo_id),
    });
  }
  next();
}
// ── Admin (login para la sección de administración de tokens) ───────────────
// La contraseña se hashea igual que los tokens (SHA-256 + salt).
function hayAdmin() {
  const row = db.prepare('SELECT COUNT(*) as n FROM admin_users').get();
  return !!(row && row.n > 0);
}

function crearAdmin({ usuario, password }) {
  const salt = generarSalt();
  const hash = hashToken(password, salt);
  const info = db.prepare(
    'INSERT INTO admin_users (usuario, hash, salt) VALUES (?, ?, ?)'
  ).run(String(usuario).trim(), hash, salt);
  return { id: info.lastInsertRowid, usuario: String(usuario).trim() };
}

function verificarAdmin(usuario, password) {
  if (!usuario || !password) return null;
  const u = db.prepare('SELECT * FROM admin_users WHERE usuario = ?').get(String(usuario).trim());
  if (!u) return null;
  if (hashToken(password, u.salt) !== u.hash) return null;
  db.prepare('UPDATE admin_users SET ultimo_login = datetime(\'now\') WHERE id = ?').run(u.id);
  return { id: u.id, usuario: u.usuario };
}

module.exports = {
  hashToken,
  verificarToken,
  crearToken,
  desactivarToken,
  hayTokensConfigurados,
  listarTokens,
  estaFirmada,
  estaFirmadoEnsayo,
  bloquearSiFirmada,
  bloquearSiEnsayoFirmado,
  hayAdmin,
  crearAdmin,
  verificarAdmin,
};
