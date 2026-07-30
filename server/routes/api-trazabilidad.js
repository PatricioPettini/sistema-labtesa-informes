// Endpoints de trazabilidad: firma con token, audit log, historial.
const express = require('express');
const router = express.Router();
const db = require('../db');
const firma = require('../utils/firma');
const { registrarFirma, registrarEvento } = require('../utils/trazabilidad');

// ─── Estado del sistema de firma ──────────────────────────────────────────────

router.get('/firma/status', (req, res) => {
  res.json({
    configurado: firma.hayTokensConfigurados(),
    tokens: firma.listarTokens(),
  });
});

// ─── Verificar token (sin acción) ─────────────────────────────────────────────
// Se usa para validar el token ANTES de guardar+firmar un ensayo, así la firma
// obligatoria al guardar no persiste datos si el token es inválido.
// Body: { token, nivel? ('revisar' | 'autorizar') }
router.post('/firma/verificar', (req, res) => {
  try {
    const { token, nivel } = req.body || {};
    const t = firma.verificarToken(token);
    if (!t) return res.status(401).json({ error: 'Token inválido.' });
    const rol = t.rol || 'ambos';
    if (nivel === 'revisar' && rol !== 'revisor' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Este token no tiene rol de revisor.' });
    }
    if (nivel === 'autorizar' && rol !== 'autorizante' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Este token no tiene rol de autorizante.' });
    }
    res.json({ ok: true, nombre: t.nombre, rol });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Administración: login + gestión de tokens (protegido) ────────────────────
// Autenticación simple por usuario+contraseña de admin. La sección de tokens
// del front queda detrás de este login.

router.get('/admin/status', (req, res) => {
  res.json({ configurado: firma.hayAdmin() });
});

// Alta del primer admin (solo si no hay ninguno).
router.post('/admin/setup', (req, res) => {
  try {
    if (firma.hayAdmin()) return res.status(409).json({ error: 'Ya existe un administrador configurado.' });
    const { usuario, password } = req.body || {};
    if (!usuario || String(usuario).trim().length < 3) return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    const a = firma.crearAdmin({ usuario, password });
    res.json({ ok: true, usuario: a.usuario });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ese usuario ya existe.' });
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/login', (req, res) => {
  const { usuario, password } = req.body || {};
  const a = firma.verificarAdmin(usuario, password);
  if (!a) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  res.json({ ok: true, usuario: a.usuario });
});

// Valida credenciales de admin presentes en el body de cada acción protegida.
function requireAdmin(req, res) {
  const { admin_usuario, admin_password } = req.body || {};
  const a = firma.verificarAdmin(admin_usuario, admin_password);
  if (!a) { res.status(401).json({ error: 'Credenciales de administrador inválidas.' }); return null; }
  return a;
}

// Listar tokens (protegido).
router.post('/admin/tokens/listar', (req, res) => {
  const a = requireAdmin(req, res); if (!a) return;
  res.json({ tokens: firma.listarTokens() });
});

// Crear un token de firma (protegido).
router.post('/admin/tokens', (req, res) => {
  try {
    const a = requireAdmin(req, res); if (!a) return;
    const { nombre, token, rol } = req.body || {};
    if (!token || String(token).length < 4) return res.status(400).json({ error: 'El token debe tener al menos 4 caracteres.' });
    const nuevo = firma.crearToken({ nombre, token, rol });
    try { registrarEvento('ADMIN', `Token de firma "${nuevo.nombre}" (${nuevo.rol}) creado por admin ${a.usuario}`, 'lock'); } catch (_) {}
    res.json({ ok: true, token_id: nuevo.id, nombre: nuevo.nombre, rol: nuevo.rol });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dar de baja (desactivar) un token (protegido).
router.post('/admin/tokens/:id/baja', (req, res) => {
  try {
    const a = requireAdmin(req, res); if (!a) return;
    firma.desactivarToken(Number(req.params.id));
    try { registrarEvento('ADMIN', `Token de firma #${req.params.id} dado de baja por admin ${a.usuario}`, 'unlock'); } catch (_) {}
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Configurar/rotar token ───────────────────────────────────────────────────
// Body: { nombre?, token, token_actual? }
// Si ya existe algún token activo, requiere `token_actual` que valide.
router.post('/firma/token', (req, res) => {
  try {
    const { nombre, token, token_actual, rol } = req.body || {};
    if (!token || String(token).length < 4) {
      return res.status(400).json({ error: 'El token debe tener al menos 4 caracteres.' });
    }
    if (firma.hayTokensConfigurados()) {
      const t = firma.verificarToken(token_actual);
      if (!t) return res.status(401).json({ error: 'Token actual inválido.' });
    }
    const nuevo = firma.crearToken({ nombre, token, rol });
    res.json({ ok: true, token_id: nuevo.id, nombre: nuevo.nombre, rol: nuevo.rol });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Baja lógica de un token.
router.post('/firma/token/:id/desactivar', (req, res) => {
  try {
    const { token_actual } = req.body || {};
    const t = firma.verificarToken(token_actual);
    if (!t) return res.status(401).json({ error: 'Token actual inválido.' });
    firma.desactivarToken(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Firmar / desfirmar OT ────────────────────────────────────────────────────

// nivel: 'revisar' | 'autorizar' | 'firmar' (legacy: mapea a autorizar).
// Doble firma:
//   'revisar'   → estado 'revisado' (bloqueo intermedio).
//   'autorizar' → estado 'autorizado' (firma final).
// El mismo token puede aplicar ambos niveles si su rol es 'ambos' (default).
router.post('/ot/:nro_ot/firmar', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const { token, nivel } = req.body || {};
    const nivelReal = (nivel === 'revisar') ? 'revisar'
                    : (nivel === 'autorizar' || nivel === 'firmar' || !nivel) ? 'autorizar'
                    : null;
    if (!nivelReal) return res.status(400).json({ error: 'Nivel de firma inválido (revisar | autorizar).' });

    const ot = db.prepare('SELECT nro_ot, estado_firma FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    if (!firma.hayTokensConfigurados()) return res.status(400).json({ error: 'No hay tokens configurados. Configurá uno primero.' });
    const t = firma.verificarToken(token);
    if (!t) return res.status(401).json({ error: 'Token inválido.' });

    // Validar rol del token.
    const rol = t.rol || 'ambos';
    if (nivelReal === 'revisar' && rol !== 'revisor' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Este token no tiene permisos de REVISOR.' });
    }
    if (nivelReal === 'autorizar' && rol !== 'autorizante' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Este token no tiene permisos de AUTORIZANTE.' });
    }

    // Validar transición de estado.
    const estActual = ot.estado_firma || 'abierto';
    if (nivelReal === 'revisar') {
      if (estActual !== 'abierto') return res.status(409).json({ error: 'La OT ya no está abierta (estado: ' + estActual + ').' });
      db.prepare(
        'UPDATE ots SET estado_firma = \'revisado\', revisado_en = datetime(\'now\'), revisado_por = ? WHERE nro_ot = ?'
      ).run(t.nombre, nro_ot);
      registrarFirma({ nro_ot, accion: 'firmar', token_id: t.id, token_nombre: t.nombre + ' (revisor)', motivo: null });
      registrarEvento(nro_ot, `OT revisada por ${t.nombre}`, 'lock');
    } else {
      // autorizar
      if (estActual === 'autorizado' || estActual === 'firmado') {
        return res.status(409).json({ error: 'La OT ya está firmada como final.' });
      }
      // Se puede autorizar directo desde 'abierto' o desde 'revisado'.
      db.prepare(
        'UPDATE ots SET estado_firma = \'autorizado\', firmado_en = datetime(\'now\'), firmado_por = ? WHERE nro_ot = ?'
      ).run(t.nombre, nro_ot);
      registrarFirma({ nro_ot, accion: 'firmar', token_id: t.id, token_nombre: t.nombre + ' (autorizante)', motivo: null });
      registrarEvento(nro_ot, `OT autorizada por ${t.nombre}`, 'lock');
    }
    res.json({ ok: true, nivel: nivelReal });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ot/:nro_ot/desfirmar', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const { token, motivo } = req.body || {};
    if (!motivo || String(motivo).trim().length < 3) {
      return res.status(400).json({ error: 'Motivo obligatorio para desfirmar.' });
    }
    const ot = db.prepare('SELECT nro_ot, estado_firma FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    if (ot.estado_firma !== 'firmado' && ot.estado_firma !== 'revisado' && ot.estado_firma !== 'autorizado') {
      return res.status(409).json({ error: 'La OT no está firmada.' });
    }
    const t = firma.verificarToken(token);
    if (!t) return res.status(401).json({ error: 'Token inválido.' });
    // Solo autorizantes pueden desfirmar una OT autorizada. Cualquier rol puede
    // desfirmar una revisada (retrotrae al estado abierto).
    const rol = t.rol || 'ambos';
    if (ot.estado_firma === 'autorizado' && rol !== 'autorizante' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Solo un token con rol AUTORIZANTE puede desfirmar una OT autorizada.' });
    }
    db.prepare(
      'UPDATE ots SET estado_firma = \'abierto\', firmado_en = NULL, firmado_por = NULL, revisado_en = NULL, revisado_por = NULL WHERE nro_ot = ?'
    ).run(nro_ot);
    registrarFirma({ nro_ot, accion: 'desfirmar', token_id: t.id, token_nombre: t.nombre, motivo });
    registrarEvento(nro_ot, `OT desfirmada (motivo: ${motivo})`, 'unlock');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Firmar / desfirmar ENSAYO ────────────────────────────────────────────────
//
// Cada ensayo tiene su propio estado de firma (abierto / revisado / autorizado)
// independiente de los demás ensayos de la OT y de la firma de OT (legacy).
// Bloquea solo el ensayo firmado; los demás siguen editables.

router.post('/ensayo/:id/firmar', (req, res) => {
  try {
    const ensayo_id = Number(req.params.id);
    const { token, nivel } = req.body || {};
    const nivelReal = (nivel === 'revisar') ? 'revisar'
                    : (nivel === 'autorizar' || nivel === 'firmar' || !nivel) ? 'autorizar'
                    : null;
    if (!nivelReal) return res.status(400).json({ error: 'Nivel de firma inválido (revisar | autorizar).' });

    const ensayo = db.prepare('SELECT id, nro_ot, tipo, estado_firma FROM ensayos WHERE id = ?').get(ensayo_id);
    if (!ensayo) return res.status(404).json({ error: 'Ensayo no encontrado' });
    if (ensayo.estado_firma === 'autorizado') {
      return res.status(409).json({ error: 'El ensayo ya está aprobado.' });
    }
    if (nivelReal === 'revisar' && ensayo.estado_firma === 'revisado') {
      return res.status(409).json({ error: 'El ensayo ya está firmado.' });
    }
    // Doble firma obligatoria: para aprobar (autorizar) el ensayo debe estar
    // previamente firmado (revisado) por el realizador.
    if (nivelReal === 'autorizar' && ensayo.estado_firma !== 'revisado') {
      return res.status(409).json({
        error: 'Primero hay que firmar el ensayo (realizador) antes de aprobarlo.',
        code: 'FALTA_FIRMA_REALIZADOR',
      });
    }
    const t = firma.verificarToken(token);
    if (!t) return res.status(401).json({ error: 'Token inválido.' });

    // Chequeo de rol del token vs. nivel solicitado.
    const rol = t.rol || 'ambos';
    if (nivelReal === 'revisar' && rol !== 'revisor' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Este token no tiene rol de revisor.' });
    }
    if (nivelReal === 'autorizar' && rol !== 'autorizante' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Este token no tiene rol de autorizante.' });
    }

    if (nivelReal === 'revisar') {
      db.prepare(
        'UPDATE ensayos SET estado_firma = \'revisado\', revisado_en = datetime(\'now\'), revisado_por = ? WHERE id = ?'
      ).run(t.nombre, ensayo_id);
      registrarFirma({ nro_ot: ensayo.nro_ot, ensayo_id, accion: 'firmar', token_id: t.id, token_nombre: t.nombre + ' (revisor)', motivo: null });
      registrarEvento(ensayo.nro_ot, `Ensayo ${ensayo.tipo} revisado por ${t.nombre}`, 'lock');
    } else {
      db.prepare(
        'UPDATE ensayos SET estado_firma = \'autorizado\', firmado_en = datetime(\'now\'), firmado_por = ? WHERE id = ?'
      ).run(t.nombre, ensayo_id);
      registrarFirma({ nro_ot: ensayo.nro_ot, ensayo_id, accion: 'firmar', token_id: t.id, token_nombre: t.nombre + ' (autorizante)', motivo: null });
      registrarEvento(ensayo.nro_ot, `Ensayo ${ensayo.tipo} autorizado por ${t.nombre}`, 'lock');
    }
    res.json({ ok: true, nivel: nivelReal, nombre: t.nombre });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/ensayo/:id/desfirmar', (req, res) => {
  try {
    const ensayo_id = Number(req.params.id);
    const { token } = req.body || {};
    // Motivo OPCIONAL: si viene, se registra; si no, queda null.
    const motivo = (req.body && req.body.motivo && String(req.body.motivo).trim()) || null;
    const ensayo = db.prepare('SELECT id, nro_ot, tipo, estado_firma FROM ensayos WHERE id = ?').get(ensayo_id);
    if (!ensayo) return res.status(404).json({ error: 'Ensayo no encontrado' });
    if (ensayo.estado_firma !== 'firmado' && ensayo.estado_firma !== 'revisado' && ensayo.estado_firma !== 'autorizado') {
      return res.status(409).json({ error: 'El ensayo no está firmado.' });
    }
    const t = firma.verificarToken(token);
    if (!t) return res.status(401).json({ error: 'Token inválido.' });
    const rol = t.rol || 'ambos';
    if (ensayo.estado_firma === 'autorizado' && rol !== 'autorizante' && rol !== 'ambos') {
      return res.status(403).json({ error: 'Solo un token con rol AUTORIZANTE puede desfirmar un ensayo autorizado.' });
    }
    db.prepare(
      'UPDATE ensayos SET estado_firma = \'abierto\', firmado_en = NULL, firmado_por = NULL, revisado_en = NULL, revisado_por = NULL WHERE id = ?'
    ).run(ensayo_id);
    registrarFirma({ nro_ot: ensayo.nro_ot, ensayo_id, accion: 'desfirmar', token_id: t.id, token_nombre: t.nombre, motivo });
    registrarEvento(ensayo.nro_ot, `Ensayo ${ensayo.tipo} desfirmado${motivo ? ' (motivo: ' + motivo + ')' : ''}`, 'unlock');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Historial de firmas/desfirmas de un ensayo ───────────────────────────────
router.get('/ensayo/:id/firmas', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, accion, token_nombre, motivo, fecha FROM firmas WHERE ensayo_id = ? ORDER BY fecha DESC, id DESC'
    ).all(req.params.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Historial de un ensayo puntual ───────────────────────────────────────────

router.get('/ensayo/:id/historial', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, accion, datos_json_anterior, datos_json_nuevo, fecha FROM ensayos_historial WHERE ensayo_id = ? ORDER BY fecha DESC, id DESC'
    ).all(req.params.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Informes emitidos de una OT ──────────────────────────────────────────────

router.get('/ot/:nro_ot/informes-emitidos', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, filename, ruta, sha256, size_bytes, acreditado, es_preinforme, fecha FROM informes_emitidos WHERE nro_ot = ? ORDER BY fecha DESC, id DESC'
    ).all(req.params.nro_ot);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Verificar integridad del .docx en el drive vs el SHA-256 guardado en DB.
router.get('/informe-emitido/:id/verificar', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM informes_emitidos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No existe' });
    if (!row.ruta) return res.status(400).json({ error: 'Sin ruta guardada', existe: false });
    const fsMod = require('fs');
    if (!fsMod.existsSync(row.ruta)) {
      return res.json({ ok: false, existe: false, error: 'El archivo no está en la ruta.', ruta: row.ruta });
    }
    const crypto = require('crypto');
    const buf = fsMod.readFileSync(row.ruta);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const iguales = sha === row.sha256;
    res.json({
      ok: iguales,
      existe: true,
      ruta: row.ruta,
      sha_registrado: row.sha256,
      sha_actual: sha,
      size_bytes_actual: buf.length,
      size_bytes_registrado: row.size_bytes,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Regenerar un informe desde su snapshot inmutable. NO reemplaza el registro,
// solo devuelve el buffer (para descarga o guardado en otra ruta).
router.post('/informe-emitido/:id/regenerar', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM informes_emitidos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No existe' });
    const { generarWordCompleto, aplicarVersionEncabezado } = require('../generators/word-generator');
    const ot = JSON.parse(row.payload_ot_json || '{}');
    const ens = JSON.parse(row.payload_ens_json || '[]');
    let buf = await generarWordCompleto(ot, ens, []); // sin fotos (payload viejo puede no tenerlas)
    if (row.version && row.version > 1) buf = aplicarVersionEncabezado(buf, row.version);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (row.filename || 'informe.docx') + '"');
    res.send(buf);
  } catch (err) {
    console.error('[regenerar]', err);
    res.status(500).json({ error: err.message });
  }
});

// Payload snapshot inmutable de un informe emitido específico.
router.get('/informe-emitido/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM informes_emitidos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No existe' });
    res.json({
      ...row,
      payload_ot:  JSON.parse(row.payload_ot_json  || '{}'),
      payload_ens: JSON.parse(row.payload_ens_json || '[]'),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Audit log unificado ──────────────────────────────────────────────────────
// Mezcla eventos + historial + firmas + informes emitidos en una línea de tiempo.
// Query params: nro_ot, tipo (evento|historial|firma|informe), limit (def 500).
router.get('/audit-log', (req, res) => {
  try {
    const nroOt = req.query.nro_ot ? String(req.query.nro_ot) : null;
    const tipoFiltro = req.query.tipo ? String(req.query.tipo) : null;
    const limit = Math.min(parseInt(req.query.limit) || 500, 5000);
    const rows = [];

    if (!tipoFiltro || tipoFiltro === 'evento') {
      const q = nroOt
        ? 'SELECT id, nro_ot, texto, icon, fecha FROM eventos WHERE nro_ot = ? ORDER BY fecha DESC, id DESC LIMIT ?'
        : 'SELECT id, nro_ot, texto, icon, fecha FROM eventos ORDER BY fecha DESC, id DESC LIMIT ?';
      const args = nroOt ? [nroOt, limit] : [limit];
      for (const r of db.prepare(q).all(...args)) {
        rows.push({ tipo: 'evento', id: r.id, nro_ot: r.nro_ot, fecha: r.fecha, texto: r.texto, icon: r.icon });
      }
    }
    if (!tipoFiltro || tipoFiltro === 'historial') {
      const q = nroOt
        ? 'SELECT id, ensayo_id, nro_ot, tipo, accion, fecha FROM ensayos_historial WHERE nro_ot = ? ORDER BY fecha DESC, id DESC LIMIT ?'
        : 'SELECT id, ensayo_id, nro_ot, tipo, accion, fecha FROM ensayos_historial ORDER BY fecha DESC, id DESC LIMIT ?';
      const args = nroOt ? [nroOt, limit] : [limit];
      for (const r of db.prepare(q).all(...args)) {
        rows.push({
          tipo: 'historial', id: r.id, nro_ot: r.nro_ot, fecha: r.fecha,
          texto: `Ensayo ${r.tipo} — ${r.accion}`, ensayo_id: r.ensayo_id, ensayo_tipo: r.tipo,
          accion: r.accion, icon: 'edit',
        });
      }
    }
    if (!tipoFiltro || tipoFiltro === 'firma') {
      const q = nroOt
        ? 'SELECT id, nro_ot, ensayo_id, accion, token_nombre, motivo, fecha FROM firmas WHERE nro_ot = ? ORDER BY fecha DESC, id DESC LIMIT ?'
        : 'SELECT id, nro_ot, ensayo_id, accion, token_nombre, motivo, fecha FROM firmas ORDER BY fecha DESC, id DESC LIMIT ?';
      const args = nroOt ? [nroOt, limit] : [limit];
      for (const r of db.prepare(q).all(...args)) {
        // Distinguir firma de ENSAYO (con ensayo_id) vs firma de OT (legacy).
        let ensayoTipo = null;
        if (r.ensayo_id) {
          const e = db.prepare('SELECT tipo FROM ensayos WHERE id = ?').get(r.ensayo_id);
          ensayoTipo = e && e.tipo;
        }
        const sujeto = r.ensayo_id ? ('Ensayo ' + (ensayoTipo || ('#' + r.ensayo_id))) : 'OT';
        const tn = r.token_nombre || '';
        const esAut = /autorizante/i.test(tn);
        const nombreLimpio = tn.replace(/\s*\((?:revisor|autorizante)\)\s*/i, '').trim() || tn;
        rows.push({
          tipo: 'firma', id: r.id, nro_ot: r.nro_ot, ensayo_id: r.ensayo_id, ensayo_tipo: ensayoTipo, fecha: r.fecha,
          texto: r.accion === 'firmar'
            ? `${sujeto} — ${esAut ? 'Evaluó' : 'Realizó'}: ${nombreLimpio}`
            : `${sujeto} desfirmado por ${nombreLimpio}${r.motivo ? ' — motivo: ' + r.motivo : ''}`,
          accion: r.accion, motivo: r.motivo, icon: r.accion === 'firmar' ? 'lock' : 'unlock',
        });
      }
    }
    if (!tipoFiltro || tipoFiltro === 'informe') {
      const q = nroOt
        ? 'SELECT id, nro_ot, filename, ruta, sha256, acreditado, es_preinforme, fecha FROM informes_emitidos WHERE nro_ot = ? ORDER BY fecha DESC, id DESC LIMIT ?'
        : 'SELECT id, nro_ot, filename, ruta, sha256, acreditado, es_preinforme, fecha FROM informes_emitidos ORDER BY fecha DESC, id DESC LIMIT ?';
      const args = nroOt ? [nroOt, limit] : [limit];
      for (const r of db.prepare(q).all(...args)) {
        rows.push({
          tipo: 'informe', id: r.id, nro_ot: r.nro_ot, fecha: r.fecha,
          texto: `Informe emitido: ${r.filename}`,
          filename: r.filename, ruta: r.ruta,
          sha256: r.sha256, acreditado: !!r.acreditado, es_preinforme: !!r.es_preinforme,
          icon: 'file',
        });
      }
    }
    if (!tipoFiltro || tipoFiltro === 'error') {
      // Log de errores del server. Existe solo si la migración ya corrió.
      try {
        const q = nroOt
          ? 'SELECT id, nivel, origen, mensaje, stack, contexto, nro_ot, fecha FROM errores_sistema WHERE nro_ot = ? ORDER BY fecha DESC, id DESC LIMIT ?'
          : 'SELECT id, nivel, origen, mensaje, stack, contexto, nro_ot, fecha FROM errores_sistema ORDER BY fecha DESC, id DESC LIMIT ?';
        const args = nroOt ? [nroOt, limit] : [limit];
        for (const r of db.prepare(q).all(...args)) {
          rows.push({
            tipo: 'error', id: r.id, nro_ot: r.nro_ot, fecha: r.fecha,
            texto: `[${r.nivel || 'error'}] ${r.origen ? r.origen + ' — ' : ''}${r.mensaje}`,
            nivel: r.nivel, origen: r.origen, mensaje: r.mensaje,
            stack: r.stack, contexto: r.contexto,
            icon: 'alertTri',
          });
        }
      } catch (_) { /* tabla no existe todavía */ }
    }

    rows.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    res.json(rows.slice(0, limit));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Convierte una ruta UNC del share Labtesa1 a letra local G:\ (que el server
// tiene mapeado). explorer.exe abre mucho más rápido con letra local, y el
// usuario ve el path "amigable" G:\... en lugar del UNC.
function unc2Local(ruta) {
  if (!ruta) return ruta;
  return String(ruta)
    .replace(/^[\\/]{2}192\.168\.1\.200[\\/]+Labtesa1[\\/]+/i, 'G:\\')
    .replace(/\//g, '\\');
}

// Sirve el instalador all-in-one del botón "Abrir carpeta". Cada PC cliente
// lo baja una vez y lo ejecuta con click derecho → "Ejecutar con PowerShell".
router.get('/instalar-abrir-carpeta.ps1', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const ps1 = path.join(__dirname, '../../docs/instalar-abrir-carpeta.ps1');
    if (!fs.existsSync(ps1)) return res.status(404).send('instalador no encontrado');
    res.set('Content-Type', 'application/x-powershell');
    res.set('Content-Disposition', 'attachment; filename="instalar-abrir-carpeta.ps1"');
    res.send(fs.readFileSync(ps1));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Legacy — se mantiene por compatibilidad con el botón viejo, aunque ya no
// se muestra en la UI.
router.get('/labopen-handler.reg', (req, res) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const reg = path.join(__dirname, '../../docs/labopen-protocol.reg');
    if (!fs.existsSync(reg)) return res.status(404).send('reg no encontrado');
    res.set('Content-Type', 'application/x-registry');
    res.set('Content-Disposition', 'attachment; filename="labopen-protocol.reg"');
    res.send(fs.readFileSync(reg));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Abre la carpeta donde vive un informe emitido (Windows explorer).
// Query param opcional `select=1` para abrir con archivo resaltado (/select,);
// por default abre solo la carpeta (más rápido y menos ambiguo).
router.post('/informe/:id/abrir-carpeta', (req, res) => {
  try {
    const r = db.prepare('SELECT ruta FROM informes_emitidos WHERE id = ?').get(req.params.id);
    if (!r || !r.ruta) return res.status(404).json({ error: 'Ruta no disponible' });
    const path = require('path');
    const fs = require('fs');
    const { exec } = require('child_process');
    // Preferir la letra local (G:\). Si no existe, caer al UNC original.
    const rutaLocal = unc2Local(r.ruta);
    const rutaFinal = fs.existsSync(rutaLocal) ? rutaLocal
                    : (fs.existsSync(r.ruta) ? r.ruta : rutaLocal);
    const carpeta = path.dirname(rutaFinal);
    // explorer.exe requiere que /select, y el path vayan JUNTOS como un solo
    // argumento — cuando se pasan separados no matchea. Usamos exec con
    // quoting explícito.
    const conSelect = req.query && (req.query.select === '1' || req.query.select === 'true');
    const cmd = conSelect
      ? `explorer.exe /select,"${rutaFinal.replace(/"/g, '')}"`
      : `explorer.exe "${carpeta.replace(/"/g, '')}"`;
    // explorer.exe devuelve exit code != 0 aún cuando tiene éxito. Ignoramos.
    exec(cmd, { windowsHide: true }, () => {});
    res.json({ ok: true, carpeta, ruta_abierta: rutaFinal, cmd });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Pre-check completo antes de firmar / emitir (vista revisor) ─────────────
router.get('/ot/:nro_ot/checklist', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const ot = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    const ensayos = db.prepare('SELECT id, tipo, datos_json FROM ensayos WHERE nro_ot = ?').all(nro_ot);

    const issues = { errores: [], advertencias: [], info: [] };

    // 1. Datos identificatorios de la OT.
    if (!ot.razon_social)   issues.errores.push('Falta razón social del cliente.');
    if (!ot.nro_solicitud)  issues.errores.push('Falta número de solicitud.');
    if (!ot.id_muestra)     issues.advertencias.push('Falta identificación de la muestra.');
    if (!ot.fecha_recepcion) issues.advertencias.push('Falta fecha de recepción.');

    // 2. Al menos un ensayo.
    if (ensayos.length === 0) issues.errores.push('La OT no tiene ensayos cargados.');

    // 3. Equipos vencidos / por vencer.
    try {
      const { chequearEquiposVencidos } = require('../utils/equipos-check');
      const eq = chequearEquiposVencidos(ensayos);
      for (const v of (eq.vencidos || [])) {
        issues.errores.push('Equipo VENCIDO: ' + v.tag + ' (' + v.equipo + ') — venció ' + v.vencimiento);
      }
      for (const p of (eq.por_vencer || [])) {
        issues.advertencias.push('Equipo por vencer: ' + p.tag + ' (' + p.equipo + ') — vence ' + p.vencimiento + ' (en ' + p.dias + ' d)');
      }
    } catch {}

    // 4. Chequeo rápido por ensayo: campos claramente vacíos.
    for (const e of ensayos) {
      let d = {};
      try { d = JSON.parse(e.datos_json || '{}'); } catch {}
      if (!d.norma && !d.norma_ensayo && !d.metodologia) {
        issues.advertencias.push('Ensayo ' + e.tipo + ' (id ' + e.id + '): no tiene norma ni metodología cargada.');
      }
      const filas = d.resultados || d.probetas || d.muestras || [];
      if (Array.isArray(filas) && filas.length === 0 && e.tipo !== 'varios' && e.tipo !== 'macrografia') {
        issues.advertencias.push('Ensayo ' + e.tipo + ' (id ' + e.id + '): tabla de resultados vacía.');
      }
    }

    // 5. Informes ya emitidos.
    const emitidos = db.prepare(
      'SELECT COUNT(*) as n FROM informes_emitidos WHERE nro_ot = ?'
    ).get(nro_ot).n;
    if (emitidos > 0) issues.info.push('Ya se emitieron ' + emitidos + ' versión(es) de este informe.');

    // 6. Estado de firma.
    if (ot.estado_firma === 'firmado') issues.info.push('La OT está FIRMADA por ' + (ot.firmado_por || 'usuario') + '.');

    res.json({
      ok: issues.errores.length === 0,
      issues,
      resumen: {
        ensayos: ensayos.length,
        estado_firma: ot.estado_firma || 'abierto',
        informes_emitidos: emitidos,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Export CSV de auditoría de una OT ────────────────────────────────────────
router.get('/ot/:nro_ot/auditoria.csv', (req, res) => {
  try {
    const { nro_ot } = req.params;
    const eventos = db.prepare('SELECT id, texto, icon, fecha FROM eventos WHERE nro_ot = ? ORDER BY fecha ASC, id ASC').all(nro_ot);
    const historial = db.prepare('SELECT id, ensayo_id, tipo, accion, fecha FROM ensayos_historial WHERE nro_ot = ? ORDER BY fecha ASC, id ASC').all(nro_ot);
    const firmas = db.prepare('SELECT id, accion, token_nombre, motivo, fecha FROM firmas WHERE nro_ot = ? ORDER BY fecha ASC, id ASC').all(nro_ot);
    const informes = db.prepare('SELECT id, filename, sha256, correlativo, version, acreditado, es_preinforme, superado, fecha FROM informes_emitidos WHERE nro_ot = ? ORDER BY fecha ASC, id ASC').all(nro_ot);

    const filas = [];
    filas.push(['fecha', 'tipo', 'accion', 'detalle', 'usuario', 'sha256', 'correlativo']);
    for (const e of eventos)     filas.push([e.fecha, 'evento',    '',           e.texto, '', '', '']);
    for (const h of historial)   filas.push([h.fecha, 'historial', h.accion,     'ensayo ' + h.tipo + ' (id ' + h.ensayo_id + ')', '', '', '']);
    for (const f of firmas)      filas.push([f.fecha, 'firma',     f.accion,     f.motivo || '', f.token_nombre || '', '', '']);
    for (const i of informes)    filas.push([i.fecha, 'informe',   'emitido',    i.filename + (i.superado ? ' (superado)' : '') + ' v' + (i.version || 1), '', i.sha256, i.correlativo || '']);
    filas.sort((a, b) => String(a[0] || '').localeCompare(String(b[0] || '')));

    // Serializar a CSV con escaping estándar.
    function esc(v) {
      const s = String(v == null ? '' : v);
      if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    const csv = filas.map(r => r.map(esc).join(';')).join('\r\n');
    // BOM para que Excel abra bien los acentos y ; como separador.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria_' + nro_ot + '.csv"');
    res.send('﻿' + csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Estadísticas / dashboard analítico ──────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    // Informes emitidos por mes. Traemos 24 meses para poder hacer comparación
    // YoY en el gráfico (mismo mes del año pasado en línea dashed).
    const porMes = db.prepare(`
      SELECT substr(fecha, 1, 7) AS ym, COUNT(*) AS n,
             SUM(CASE WHEN acreditado = 1 THEN 1 ELSE 0 END) AS n_oaa,
             SUM(CASE WHEN es_preinforme = 1 THEN 1 ELSE 0 END) AS n_prel
      FROM informes_emitidos
      WHERE fecha >= date('now', '-24 months')
      GROUP BY substr(fecha, 1, 7)
      ORDER BY ym ASC
    `).all();

    // Cantidad de ensayos por tipo (últimos 12 meses).
    const porTipoEnsayo = db.prepare(`
      SELECT e.tipo, COUNT(*) AS n
      FROM ensayos e
      LEFT JOIN ots o ON o.nro_ot = e.nro_ot
      WHERE o.creado_en >= datetime('now', '-12 months')
      GROUP BY e.tipo
      ORDER BY n DESC
    `).all();

    // Top clientes (últimos 12 meses).
    const topClientes = db.prepare(`
      SELECT razon_social, COUNT(*) AS n_ots
      FROM ots
      WHERE creado_en >= datetime('now', '-12 months')
      GROUP BY razon_social
      ORDER BY n_ots DESC
      LIMIT 10
    `).all();

    // Tiempo Recepción→Emisión promedio (días).
    // Comparamos fecha_recepcion con informe_generado_en.
    const tiempos = db.prepare(`
      SELECT
        AVG(julianday(informe_generado_en) - julianday(fecha_recepcion)) AS dias_prom,
        MIN(julianday(informe_generado_en) - julianday(fecha_recepcion)) AS dias_min,
        MAX(julianday(informe_generado_en) - julianday(fecha_recepcion)) AS dias_max
      FROM ots
      WHERE fecha_recepcion IS NOT NULL AND informe_generado_en IS NOT NULL
        AND informe_generado_en >= datetime('now', '-6 months')
    `).get();

    // Firmas: cantidad activa / total emitido en el período / desfirmas.
    const totalesFirma = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM ots WHERE estado_firma = 'firmado') AS firmadas,
        (SELECT COUNT(*) FROM ots) AS total_ots,
        (SELECT COUNT(*) FROM firmas WHERE accion = 'firmar' AND fecha >= date('now','-12 months')) AS n_firmadas_12m,
        (SELECT COUNT(*) FROM firmas WHERE accion = 'desfirmar' AND fecha >= date('now','-12 months')) AS n_desfirmadas_12m
    `).get();

    // Totales generales.
    const generales = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM ots) AS total_ots,
        (SELECT COUNT(*) FROM ensayos) AS total_ensayos,
        (SELECT COUNT(*) FROM informes_emitidos) AS total_informes,
        (SELECT COUNT(*) FROM clientes) AS total_clientes
    `).get();

    res.json({
      generales, porMes, porTipoEnsayo, topClientes, tiempos, totalesFirma,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Dashboard por técnico ────────────────────────────────────────────────────
// Métricas agregadas por técnico: ensayos revisados, OTs firmadas, informes
// emitidos, retracciones y tiempos promedio. Se cruza por nombre normalizado.
router.get('/tecnicos-dashboard', (req, res) => {
  try {
    // 1) Ensayos revisados (últimos 12 meses). Ojo: revisado_por y revisado_en
    // existen tanto en `ensayos` como en `ots` — hay que calificar con `e.`.
    const ensayosRev = db.prepare(`
      SELECT e.revisado_por AS tecnico, COUNT(*) AS n,
             MAX(e.revisado_en) AS ultimo,
             AVG(julianday(e.revisado_en) - julianday(o.fecha_recepcion)) AS dias_prom
      FROM ensayos e
      LEFT JOIN ots o ON o.nro_ot = e.nro_ot
      WHERE e.revisado_por IS NOT NULL AND e.revisado_por <> ''
        AND e.revisado_en >= datetime('now','-12 months')
      GROUP BY e.revisado_por
    `).all();

    // 2) OTs firmadas (estado_firma actual = 'firmado' con firmante nombrado).
    const otsFirmadas = db.prepare(`
      SELECT firmado_por AS tecnico, COUNT(*) AS n
      FROM ots
      WHERE firmado_por IS NOT NULL AND firmado_por <> ''
        AND firmado_en >= datetime('now','-12 months')
      GROUP BY firmado_por
    `).all();

    // 3) Informes emitidos (OTs con informe_path atribuido al firmante).
    const informes = db.prepare(`
      SELECT firmado_por AS tecnico, COUNT(*) AS n
      FROM ots
      WHERE informe_path IS NOT NULL AND informe_path <> ''
        AND informe_generado_en >= datetime('now','-12 months')
        AND firmado_por IS NOT NULL AND firmado_por <> ''
      GROUP BY firmado_por
    `).all();

    // 4) Desfirmas realizadas por cada técnico (útiles para detectar retrabajo).
    const desfirmas = db.prepare(`
      SELECT token_nombre AS tecnico, COUNT(*) AS n
      FROM firmas
      WHERE accion = 'desfirmar'
        AND token_nombre IS NOT NULL AND token_nombre <> ''
        AND fecha >= datetime('now','-12 months')
      GROUP BY token_nombre
    `).all();

    // 5) Merge por nombre de técnico (normalizado a lower para deduplicar
    //    diferencias de mayúsculas/espacios).
    const norm = s => String(s || '').trim().toLowerCase();
    const map = new Map(); // key -> { tecnico, ensayos, ots_firmadas, ... }
    function upsert(row, campo, valor) {
      const key = norm(row.tecnico);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { tecnico: row.tecnico.trim(), ensayos_revisados: 0, ots_firmadas: 0, informes_emitidos: 0, desfirmas: 0, dias_prom: null, ultimo: null });
      }
      const cur = map.get(key);
      cur[campo] = (cur[campo] || 0) + (valor || 0);
      // Nombre canónico: preferir el que tenga más ensayos revisados (más "peso")
      if (campo === 'ensayos_revisados') cur.tecnico = row.tecnico.trim();
    }
    ensayosRev.forEach(r => {
      upsert(r, 'ensayos_revisados', r.n);
      const k = norm(r.tecnico);
      if (k && map.has(k)) {
        const cur = map.get(k);
        cur.dias_prom = r.dias_prom;
        cur.ultimo = r.ultimo;
      }
    });
    otsFirmadas.forEach(r => upsert(r, 'ots_firmadas', r.n));
    informes.forEach(r => upsert(r, 'informes_emitidos', r.n));
    desfirmas.forEach(r => upsert(r, 'desfirmas', r.n));

    const out = Array.from(map.values())
      .sort((a, b) => (b.ensayos_revisados + b.ots_firmadas) - (a.ensayos_revisados + a.ots_firmadas));

    res.json({ tecnicos: out, periodo: '12 meses' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Búsqueda global ──────────────────────────────────────────────────────────
// GET /api/buscar?q=X&limit=N
// Busca en ots (nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra) +
// clientes (razon_social, cuit, fantasia) + ensayos (datos_json).
router.get('/buscar', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 30, 200);
    if (q.length < 2) return res.json({ ots: [], clientes: [], ensayos: [] });
    const pat = '%' + q.replace(/[%_]/g, s => '\\' + s) + '%';

    const ots = db.prepare(`
      SELECT nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
             fecha_recepcion, estado_firma, informe_path
      FROM ots
      WHERE nro_ot LIKE ? ESCAPE '\\'
         OR nro_solicitud LIKE ? ESCAPE '\\'
         OR nro_cliente LIKE ? ESCAPE '\\'
         OR razon_social LIKE ? ESCAPE '\\'
         OR id_muestra LIKE ? ESCAPE '\\'
      ORDER BY creado_en DESC
      LIMIT ?
    `).all(pat, pat, pat, pat, pat, limit);

    const clientes = db.prepare(`
      SELECT nro_cliente, razon_social, fantasia, cuit, localidad
      FROM clientes
      WHERE nro_cliente LIKE ? ESCAPE '\\'
         OR razon_social LIKE ? ESCAPE '\\'
         OR fantasia LIKE ? ESCAPE '\\'
         OR cuit LIKE ? ESCAPE '\\'
      LIMIT ?
    `).all(pat, pat, pat, pat, limit);

    // Búsqueda dentro del JSON de ensayos (LIKE simple sobre el string).
    const ensayos = db.prepare(`
      SELECT e.id, e.nro_ot, e.tipo, o.razon_social, o.nro_solicitud
      FROM ensayos e
      LEFT JOIN ots o ON o.nro_ot = e.nro_ot
      WHERE e.datos_json LIKE ? ESCAPE '\\'
      ORDER BY e.id DESC
      LIMIT ?
    `).all(pat, limit);

    res.json({ ots, clientes, ensayos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Plantillas de ensayo (presets) ───────────────────────────────────────────

router.get('/plantillas', (req, res) => {
  try {
    const tipo = req.query.tipo ? String(req.query.tipo) : null;
    const q = tipo
      ? 'SELECT id, tipo, nombre, descripcion, creado_en, usado_en FROM plantillas_ensayo WHERE tipo = ? ORDER BY nombre'
      : 'SELECT id, tipo, nombre, descripcion, creado_en, usado_en FROM plantillas_ensayo ORDER BY tipo, nombre';
    res.json(tipo ? db.prepare(q).all(tipo) : db.prepare(q).all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/plantillas/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM plantillas_ensayo WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Plantilla no encontrada' });
    db.prepare('UPDATE plantillas_ensayo SET usado_en = datetime(\'now\') WHERE id = ?').run(row.id);
    let datos = {};
    try { datos = JSON.parse(row.datos_json || '{}'); } catch {}
    res.json({ id: row.id, tipo: row.tipo, nombre: row.nombre, descripcion: row.descripcion, datos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/plantillas', (req, res) => {
  try {
    const { tipo, nombre, descripcion, datos_json } = req.body || {};
    if (!tipo || !nombre || !datos_json) return res.status(400).json({ error: 'Faltan campos (tipo, nombre, datos_json)' });
    const jsonStr = typeof datos_json === 'string' ? datos_json : JSON.stringify(datos_json);
    const info = db.prepare(
      'INSERT INTO plantillas_ensayo (tipo, nombre, descripcion, datos_json) VALUES (?, ?, ?, ?)'
    ).run(tipo, nombre, descripcion || null, jsonStr);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/plantillas/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM plantillas_ensayo WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Admin: reset de datos de prueba ─────────────────────────────────────────
// POST /api/admin/reset
// Body:
//   { confirmar: 'SI_BORRAR_TODO', incluir_catalogos?: boolean }
// Borra: ots, ensayos, eventos, ensayos_historial, informes_emitidos, firmas,
// plantillas_ensayo. Preserva: tokens_firma, schema_version.
// Si incluir_catalogos === true, también borra clientes, equipos y normas.
// Los equipos se re-siembran automáticamente al próximo reinicio (idempotente).
router.post('/admin/reset', (req, res) => {
  const body = req.body || {};
  if (body.confirmar !== 'SI_BORRAR_TODO') {
    return res.status(400).json({
      error: 'Falta la confirmación. Enviá body { "confirmar": "SI_BORRAR_TODO" }.'
    });
  }
  try {
    const stats = {};
    const trx = db.transaction(() => {
      const tablas = ['ensayos', 'ots', 'eventos', 'ensayos_historial',
                      'informes_emitidos', 'firmas', 'plantillas_ensayo'];
      for (const t of tablas) {
        try {
          const before = db.prepare('SELECT COUNT(*) as n FROM ' + t).get().n;
          db.prepare('DELETE FROM ' + t).run();
          stats[t] = before;
        } catch (e) { stats[t] = 'error: ' + e.message; }
      }
      if (body.incluir_catalogos === true) {
        for (const t of ['clientes', 'equipos', 'normas']) {
          try {
            const before = db.prepare('SELECT COUNT(*) as n FROM ' + t).get().n;
            db.prepare('DELETE FROM ' + t).run();
            stats[t] = before;
          } catch (e) { stats[t] = 'error: ' + e.message; }
        }
      }
    });
    trx();
    res.json({ ok: true, borrado: stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
