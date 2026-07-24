require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/v2', express.static(path.join(__dirname, '../public-new')));

const apiV2Routes    = require('./routes/api-v2');
const apiRoutes      = require('./routes/api');
const agentesRoutes  = require('./routes/api-agentes');
const trazaRoutes    = require('./routes/api-trazabilidad');
app.use('/api', apiV2Routes);   // overrides primero
app.use('/api', trazaRoutes);   // trazabilidad antes que api (rutas específicas primero)
app.use('/api', apiRoutes);
app.use('/api', agentesRoutes);

// Backup diario de la DB (al arrancar y luego cada 24h).
try {
  const { iniciarBackupsAutomaticos } = require('./utils/backup-db');
  iniciarBackupsAutomaticos();
} catch (e) { console.warn('[backup] no se pudo iniciar:', e.message); }

// Worker de la cola de guardado en drive (reintenta pendientes cada 60s).
try {
  const { iniciarWorker } = require('./utils/cola-guardado');
  iniciarWorker(60_000);
  console.log('[cola-guardado] worker iniciado (reintenta cada 60s)');
} catch (e) { console.warn('[cola-guardado] no se pudo iniciar worker:', e.message); }

// Bot Trello: importa OTs de las columnas configuradas cada N minutos.
// Deshabilitar con TRELLO_BOT_ENABLED=false en el .env.
try {
  const { iniciarBot } = require('./utils/bot-trello');
  iniciarBot();
} catch (e) { console.warn('[bot-trello] no se pudo iniciar:', e.message); }

// Consolidar equipos duplicados legacy (ids "<tipo>:<TAG>") ANTES del seed
// para evitar dobles inserciones.
try {
  const { consolidarEquipos } = require('./utils/consolidar-equipos');
  consolidarEquipos();
} catch (e) { console.warn('[consolidar-equipos] no se pudo ejecutar:', e.message); }

// Seed del catálogo global de equipos (idempotente).
try {
  const { seedEquipos } = require('./utils/seed-equipos');
  seedEquipos();
} catch (e) { console.warn('[seed-equipos] no se pudo ejecutar:', e.message); }

// SPA nuevo en /v2 (hash routing — cualquier sub-ruta devuelve index.html).
// - /v2/prod  (o /v2?prod=1) sirve el bundle único de esbuild (index-prod.html)
// - /v2       sirve el clásico con Babel-standalone (dev-friendly)
app.get('/v2*', (req, res) => {
  const usarProd = /^\/v2\/prod(\/|$)/.test(req.path) || req.query.prod === '1';
  const prodPath = path.join(__dirname, '../public-new/index-prod.html');
  if (usarProd && require('fs').existsSync(prodPath)) {
    return res.sendFile(prodPath);
  }
  res.sendFile(path.join(__dirname, '../public-new/index.html'));
});

// Cualquier ruta desconocida → dashboard viejo
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ─── Captura global de errores para la pantalla de Auditoría ─────────────────
// Cualquier error no manejado dentro de un endpoint Express se registra en la
// tabla errores_sistema. El cliente sigue recibiendo su 500 normal.
try {
  const { registrarError } = require('./utils/trazabilidad');

  app.use((err, req, res, next) => {
    try {
      registrarError({
        nivel: 'error',
        origen: 'express:' + (req.method || '?') + ' ' + (req.originalUrl || req.url || ''),
        mensaje: err && err.message || String(err),
        stack: err && err.stack || null,
        contexto: { params: req.params, query: req.query },
        nro_ot: (req.params && req.params.nro_ot) || (req.body && req.body.nro_ot) || null,
      });
    } catch (_) {}
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err && err.message || 'Error interno' });
  });

  // Errores fuera del ciclo request/response.
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    try { registrarError({ nivel: 'error', origen: 'uncaughtException', mensaje: err.message, stack: err.stack }); } catch (_) {}
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    try {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      registrarError({ nivel: 'error', origen: 'unhandledRejection', mensaje: err.message, stack: err.stack });
    } catch (_) {}
  });
} catch (e) { console.warn('[errores] no se pudo montar el capturador global:', e.message); }

app.listen(PORT, () => {
  console.log(`✓ Servidor corriendo en http://localhost:${PORT}`);
});
