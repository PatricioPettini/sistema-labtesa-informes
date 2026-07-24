require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../lab-informes.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migrations — cada ALTER TABLE en su propio try/catch
const _migrations = [
  `ALTER TABLE ots      ADD COLUMN es_preinforme INTEGER DEFAULT 0`,
  `ALTER TABLE ots      ADD COLUMN fecha_vencimiento TEXT`,
  `ALTER TABLE ots      ADD COLUMN trello_columna TEXT`,
  `ALTER TABLE ots      ADD COLUMN oaa_decisions_json TEXT`,
  `ALTER TABLE ots      ADD COLUMN informe_path TEXT`,
  `ALTER TABLE ots      ADD COLUMN informe_generado_en TEXT`,
  `ALTER TABLE ots      ADD COLUMN estado_firma TEXT DEFAULT 'abierto'`,
  `ALTER TABLE ots      ADD COLUMN firmado_en TEXT`,
  `ALTER TABLE ots      ADD COLUMN firmado_por TEXT`,
  `ALTER TABLE ots      ADD COLUMN actualizado_en TEXT`,
  `ALTER TABLE ots      ADD COLUMN revisado_en TEXT`,
  `ALTER TABLE ots      ADD COLUMN revisado_por TEXT`,
  // Log de errores del sistema (uncaughtException, endpoints 500, tareas fallidas).
  // Se consulta desde la pantalla de Auditoría.
  `CREATE TABLE IF NOT EXISTS errores_sistema (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nivel     TEXT NOT NULL DEFAULT 'error',
    origen    TEXT,
    mensaje   TEXT NOT NULL,
    stack     TEXT,
    contexto  TEXT,
    nro_ot    TEXT,
    fecha     TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_errores_sistema_fecha ON errores_sistema(fecha DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_errores_sistema_nro_ot ON errores_sistema(nro_ot)`,
  `ALTER TABLE tokens_firma ADD COLUMN rol TEXT DEFAULT 'ambos'`,
  `ALTER TABLE clientes ADD COLUMN cuit      TEXT`,
  `ALTER TABLE clientes ADD COLUMN contacto  TEXT`,
  `ALTER TABLE clientes ADD COLUMN email     TEXT`,
  `ALTER TABLE clientes ADD COLUMN telefono  TEXT`,
  `ALTER TABLE clientes ADD COLUMN localidad TEXT`,
  `ALTER TABLE ensayos  ADD COLUMN actualizado_en TEXT`,
  // ── Firma por ensayo (cada ensayo puede tener firmante distinto) ────
  `ALTER TABLE ensayos  ADD COLUMN estado_firma TEXT DEFAULT 'abierto'`,
  `ALTER TABLE ensayos  ADD COLUMN firmado_en   TEXT`,
  `ALTER TABLE ensayos  ADD COLUMN firmado_por  TEXT`,
  `ALTER TABLE ensayos  ADD COLUMN revisado_en  TEXT`,
  `ALTER TABLE ensayos  ADD COLUMN revisado_por TEXT`,
  // Log de firmas: agregar ensayo_id opcional para poder registrar firmas de
  // ensayos individuales (además de las de OT legacy).
  `ALTER TABLE firmas   ADD COLUMN ensayo_id    INTEGER`,
  `ALTER TABLE equipos  ADD COLUMN ensayos       TEXT DEFAULT '[]'`,
  `ALTER TABLE equipos  ADD COLUMN nombre_corto  TEXT`,
  `ALTER TABLE equipos  ADD COLUMN activo        INTEGER DEFAULT 1`,
  `ALTER TABLE informes_emitidos ADD COLUMN version INTEGER DEFAULT 1`,
  `ALTER TABLE informes_emitidos ADD COLUMN superado INTEGER DEFAULT 0`,
  `ALTER TABLE informes_emitidos ADD COLUMN superado_por_id INTEGER`,
  `ALTER TABLE informes_emitidos ADD COLUMN superado_en TEXT`,
  `ALTER TABLE informes_emitidos ADD COLUMN ruta_original TEXT`,
  `ALTER TABLE informes_emitidos ADD COLUMN template_sha256 TEXT`,
  `ALTER TABLE informes_emitidos ADD COLUMN correlativo TEXT`,
];
for (const sql of _migrations) { try { db.exec(sql); } catch {} }

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    nro_cliente   TEXT PRIMARY KEY,
    razon_social  TEXT NOT NULL,
    fantasia      TEXT,
    creado_en     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_ot              TEXT UNIQUE NOT NULL,
    nro_solicitud       TEXT NOT NULL,
    nro_cliente         TEXT,
    razon_social        TEXT NOT NULL,
    id_muestra          TEXT,
    fecha_recepcion     TEXT,
    fecha_aprobacion    TEXT,
    fecha_finalizacion  TEXT,
    trello_url          TEXT,
    es_preinforme       INTEGER DEFAULT 0,
    creado_en           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ensayos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_ot      TEXT NOT NULL,
    tipo        TEXT NOT NULL,
    orden       INTEGER NOT NULL DEFAULT 1,
    datos_json  TEXT NOT NULL,
    creado_en   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS equipos (
    id                TEXT PRIMARY KEY,
    nombre            TEXT NOT NULL,
    tipo              TEXT,
    sede              TEXT,
    modelo            TEXT,
    capacidad         TEXT,
    certificado       TEXT,
    fecha_calibracion TEXT,
    vencimiento       TEXT,
    patron            TEXT
  );

  CREATE TABLE IF NOT EXISTS normas (
    codigo   TEXT PRIMARY KEY,
    clase    TEXT NOT NULL,
    titulo   TEXT NOT NULL,
    tipo     TEXT NOT NULL,
    version  TEXT,
    vigente  INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS eventos (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_ot  TEXT NOT NULL,
    texto   TEXT NOT NULL,
    icon    TEXT,
    fecha   TEXT DEFAULT (datetime('now'))
  );

  -- ── Trazabilidad ──────────────────────────────────────────────────────
  -- Historial de cambios en ensayos: se escribe un snapshot del registro
  -- ANTES de cada UPDATE/DELETE. Append-only.
  CREATE TABLE IF NOT EXISTS ensayos_historial (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ensayo_id           INTEGER NOT NULL,
    nro_ot              TEXT NOT NULL,
    tipo                TEXT NOT NULL,
    accion              TEXT NOT NULL,   -- create | update | delete
    datos_json_anterior TEXT,            -- snapshot del datos_json previo (null si create)
    datos_json_nuevo    TEXT,            -- snapshot del datos_json aplicado (null si delete)
    fecha               TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ensayos_historial_nro_ot ON ensayos_historial(nro_ot);
  CREATE INDEX IF NOT EXISTS idx_ensayos_historial_ensayo_id ON ensayos_historial(ensayo_id);

  -- Historial de OTs eliminadas: snapshot completo antes de cada DELETE.
  -- Permite mostrar la "papelera" y recuperar OTs borradas por error desde
  -- el panel de Administración. Los ensayos ya están en ensayos_historial.
  CREATE TABLE IF NOT EXISTS ots_historial (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_ot         TEXT NOT NULL,
    accion         TEXT NOT NULL,      -- 'delete' | 'restore'
    ot_json        TEXT NOT NULL,      -- snapshot completo de la fila ots
    ensayos_count  INTEGER DEFAULT 0,
    borrado_por    TEXT,
    fecha          TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ots_historial_nro_ot ON ots_historial(nro_ot);
  CREATE INDEX IF NOT EXISTS idx_ots_historial_fecha  ON ots_historial(fecha DESC);

  -- Informes emitidos: registro inmutable de cada .docx generado.
  -- Incluye SHA-256 y snapshot completo del payload usado.
  CREATE TABLE IF NOT EXISTS informes_emitidos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_ot            TEXT NOT NULL,
    filename          TEXT NOT NULL,
    ruta              TEXT,
    sha256            TEXT NOT NULL,
    size_bytes        INTEGER NOT NULL,
    acreditado        INTEGER DEFAULT 0,
    es_preinforme     INTEGER DEFAULT 0,
    payload_ot_json   TEXT NOT NULL,     -- snapshot inmutable de la OT + fecha_gen
    payload_ens_json  TEXT NOT NULL,     -- snapshot inmutable de los ensayos con OAA aplicado
    firmado           INTEGER DEFAULT 0,
    firma_token_id    INTEGER,
    version           INTEGER DEFAULT 1,
    superado          INTEGER DEFAULT 0,
    superado_por_id   INTEGER,
    superado_en       TEXT,
    ruta_original     TEXT,
    template_sha256   TEXT,
    correlativo       TEXT,
    fecha             TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_informes_emitidos_nro_ot ON informes_emitidos(nro_ot);
  CREATE INDEX IF NOT EXISTS idx_informes_emitidos_sha256 ON informes_emitidos(sha256);

  -- Tokens de firma. Se hashean con SHA-256 + salt (nunca se guarda el token en claro).
  CREATE TABLE IF NOT EXISTS tokens_firma (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre     TEXT NOT NULL,
    hash       TEXT NOT NULL,
    salt       TEXT NOT NULL,
    activo     INTEGER NOT NULL DEFAULT 1,
    rol        TEXT DEFAULT 'ambos',
    creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_uso TEXT
  );

  -- Usuarios administradores (login para la sección de administración de
  -- tokens). La contraseña se hashea (SHA-256 + salt); nunca se guarda en claro.
  CREATE TABLE IF NOT EXISTS admin_users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario    TEXT UNIQUE NOT NULL,
    hash       TEXT NOT NULL,
    salt       TEXT NOT NULL,
    creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
    ultimo_login TEXT
  );

  -- Firmas / desfirmas de OTs. Append-only, con motivo obligatorio al desfirmar.
  CREATE TABLE IF NOT EXISTS firmas (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_ot     TEXT NOT NULL,
    accion     TEXT NOT NULL,     -- firmar | desfirmar
    token_id   INTEGER,
    token_nombre TEXT,
    motivo     TEXT,
    fecha      TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_firmas_nro_ot ON firmas(nro_ot);

  -- Versión del schema (útil para migraciones futuras).
  CREATE TABLE IF NOT EXISTS schema_version (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Plantillas / presets guardados por el usuario para reusar en nuevos ensayos.
  CREATE TABLE IF NOT EXISTS plantillas_ensayo (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo        TEXT NOT NULL,      -- traccion | impacto | ...
    nombre      TEXT NOT NULL,      -- ej "ASTM A320 típico"
    descripcion TEXT,
    datos_json  TEXT NOT NULL,      -- snapshot de datos del ensayo
    creado_en   TEXT NOT NULL DEFAULT (datetime('now')),
    usado_en    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_plantillas_tipo ON plantillas_ensayo(tipo);

  -- Flags manuales por solicitud (marcado por el usuario en la UI):
  -- - cargado: el informe fue subido/entregado al sistema del cliente
  -- - enviado: el informe fue enviado por email/mensajería al cliente
  CREATE TABLE IF NOT EXISTS solicitud_flags (
    nro_solicitud   TEXT PRIMARY KEY,
    cargado         INTEGER NOT NULL DEFAULT 0,
    cargado_en      TEXT,
    enviado         INTEGER NOT NULL DEFAULT 0,
    enviado_en      TEXT,
    actualizado_en  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Cola de guardado en drive cuando la carpeta destino no es accesible
  -- (drive de red desconectado, permisos, etc.). Un worker reintenta en background.
  CREATE TABLE IF NOT EXISTS guardados_pendientes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    nro_ot             TEXT NOT NULL,
    filename           TEXT NOT NULL,
    carpeta_destino    TEXT NOT NULL,
    buffer             BLOB NOT NULL,      -- contenido del docx
    intentos           INTEGER NOT NULL DEFAULT 0,
    ultimo_error       TEXT,
    ultimo_intento_en  TEXT,
    creado_en          TEXT NOT NULL DEFAULT (datetime('now')),
    resuelto           INTEGER NOT NULL DEFAULT 0,
    resuelto_en        TEXT,
    ruta_final         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_guardados_pend ON guardados_pendientes(resuelto, creado_en);
`);

// Registrar versión actual del schema.
try {
  db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)').run(2);
} catch {}

module.exports = db;
