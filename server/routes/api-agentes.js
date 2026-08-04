/**
 * api-agentes.js
 * Ruta Express que orquesta el flujo completo con agentes QA.
 *
 * POST /api/generate-with-qa/:nro_ot
 *   Valida ensayos en paralelo → genera Word → ejecuta QA → devuelve docx o errores
 *
 * GET /api/qa-status/:nro_ot
 *   Devuelve el último resultado QA para una OT
 */

const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const db      = require('../db');
const { generarWordCompleto }  = require('../generators/word-generator');
const { guardarEnDrive }       = require('../utils/guardar-en-drive');
const { validarEnsayo }        = require('../agents/agente-ensayo');
const { ejecutarQA }           = require('../agents/agente-qa');
const { repararDocx }          = require('../agents/agente-reparador');
const { verificarMapeo }       = require('../agents/agente-mapeo');
const { validarFormato }         = require('../agents/agente-formato');
const { corregirFormato }        = require('../agents/agente-corrector-formato');
const { verificarCampos }        = require('../agents/agente-verificador-campos');
const { actualizarDesdeReferencias } = require('../agents/agente-actualizador-forms');

const upload = multer({ storage: multer.memoryStorage() });

// Cache en memoria: nro_ot → último resultado QA
const qaCache = new Map();

// Limpia caracteres Unicode invisibles (NBSP, ZWSP, ZWNJ, ZWJ, BOM, etc.) que
// rompen el layout del Word — Trello y copy/paste suelen insertarlos.
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

// ── POST /api/generate-with-qa/:nro_ot ───────────────────────────────────────
router.post('/generate-with-qa/:nro_ot', upload.array('fotos'), async (req, res) => {
  const { nro_ot } = req.params;
  const forzar = req.query.forzar === 'true'; // ?forzar=true para ignorar errores QA

  // 1. Leer OT y ensayos
  const ot = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
  if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
  // Sanitizar id_muestra: limpia caracteres Unicode invisibles (Trello/copy-paste)
  // que rompen el layout y desplazan la imagen de carátula a la siguiente página.
  ot.id_muestra = sanitizarIdMuestra(ot.id_muestra);

  let ensayosDB = db.prepare(
    'SELECT * FROM ensayos WHERE nro_ot = ? ORDER BY orden'
  ).all(nro_ot);

  if (ensayosDB.length === 0)
    return res.status(400).json({ error: 'La OT no tiene ensayos cargados' });

  // ── Firma del realizador obligatoria (solo informe definitivo) ─────────
  // En preinforme (ot.es_preinforme=1) se permite emitir con ensayos abiertos:
  // el preinforme es un borrador que se manda al cliente antes de la firma
  // final. El sufijo "_PRELIMINAR" del filename ya lo identifica.
  if (!ot.es_preinforme) {
    const sinFirmar = ensayosDB.filter(e => (e.estado_firma || 'abierto') === 'abierto');
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

  // Aplicar decisiones OAA antes del pipeline (auto + overrides del usuario)
  try {
    const { aplicarDecisionesOAA } = require('../agents/agente-oaa');
    let overrides = {};
    try { overrides = ot.oaa_decisions_json ? JSON.parse(ot.oaa_decisions_json) : {}; } catch {}
    ensayosDB = aplicarDecisionesOAA(ensayosDB, overrides);
  } catch (e) { console.warn('[OAA] No se pudieron aplicar decisiones:', e.message); }

  // 2. Parsear datos_json
  const ensayosParseados = ensayosDB.map(e => {
    let datos = {};
    try { datos = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : e.datos_json; } catch {}
    return { ...e, datos_json_obj: datos };
  });

  // 4. Aplicar mapeo/correcciones de campos + validación de agentes (en paralelo)
  console.log(`[QA] Verificando mapeo y validando ${ensayosParseados.length} ensayo(s)...`);
  const [resultadosMapeo, resultadosAgentes] = await Promise.all([
    Promise.resolve(ensayosParseados.map(e => verificarMapeo(e.tipo, e.datos_json_obj))),
    Promise.all(ensayosParseados.map(e => validarEnsayo(e.tipo, e.datos_json_obj, ot))),
  ]);

  // Loguear correcciones de mapeo
  resultadosMapeo.forEach((r, i) => {
    if (r.correcciones.length > 0)
      console.log(`[MAPEO] ${ensayosParseados[i].tipo}: ${r.correcciones.join(', ')}`);
  });

  // 5. Combinar datos corregidos por mapeo + agentes
  const ensayosCorregidos = ensayosParseados.map((e, i) => ({
    ...e,
    datos_json: JSON.stringify(resultadosMapeo[i].datos),
  }));

  // 4c. Verificar campos post-mapeo (detecta datos faltantes antes de generar)
  const resultadosVerificador = ensayosCorregidos.map(e => {
    let datos = {};
    try { datos = JSON.parse(e.datos_json); } catch {}
    return verificarCampos(e.tipo, datos);
  });
  resultadosVerificador.forEach(r => {
    if (r.errores.length > 0 || r.advertencias.length > 0)
      console.log(`[VERIFICADOR] ${r.tipo}: ${r.errores.length} error(es), ${r.advertencias.length} adv.`);
  });

  // 5. Generar el Word con datos corregidos
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
  let buffer;
  try {
    buffer = await generarWordCompleto(ot, ensayosCorregidos, fotosCaratula);
  } catch (err) {
    console.error('[QA] Error generando Word:', err);
    return res.status(500).json({ error: 'Error al generar el documento Word', detalle: err.message });
  }

  // 6. Ejecutar QA sobre el documento generado
  console.log(`[QA] Ejecutando revisión de formato para OT ${nro_ot}...`);
  const resultadoQA = await ejecutarQA(buffer, ot, resultadosAgentes);

  // 6b. Aplicar reparaciones automáticas (agente-reparador: fuentes, imágenes, FIN DE INFORME)
  let correccionesAplicadas = [];
  if (resultadoQA.errores.length > 0 || resultadoQA.advertencias.length > 0) {
    const reparacion = repararDocx(buffer, resultadoQA.errores, resultadoQA.advertencias);
    if (reparacion.correccionesAplicadas.length > 0) {
      buffer = reparacion.buffer;
      correccionesAplicadas = reparacion.correccionesAplicadas;
      console.log(`[QA] Reparaciones aplicadas: ${correccionesAplicadas.join(', ')}`);
    }
  }

  // 6c. Validar formato contra informes de referencia (agente-formato)
  try {
    const tipos = [...new Set(ensayosParseados.map(e => e.tipo))];
    const resFormato = await validarFormato(buffer, tipos);

    // 6d. Corregir diferencias de formato (agente-corrector-formato)
    if (resFormato._consenso && (resFormato.errores.length > 0 || resFormato.advertencias.length > 0)) {
      const cf = corregirFormato(buffer, resFormato.errores, resFormato.advertencias, resFormato._consenso);
      if (cf.correccionesAplicadas.length > 0) {
        buffer = cf.buffer;
        correccionesAplicadas.push(...cf.correccionesAplicadas);
        console.log(`[FORMATO] Correcciones aplicadas: ${cf.correccionesAplicadas.join(', ')}`);
      }
    }

    // Incorporar resultados de formato al QA (solo los que sobreviven tras corrección)
    resultadoQA.errores.push(...resFormato.errores);
    resultadoQA.advertencias.push(...resFormato.advertencias);
    resultadoQA.ok = resultadoQA.errores.length === 0;
  } catch (e) {
    console.error('[FORMATO] Error inesperado:', e.message);
  }

  // Incorporar advertencias del verificador de campos al QA
  for (const rv of resultadosVerificador) {
    resultadoQA.errores.push(...rv.errores);
    resultadoQA.advertencias.push(...rv.advertencias);
  }
  resultadoQA.ok = resultadoQA.errores.length === 0;

  // Guardar en cache
  qaCache.set(nro_ot, {
    timestamp: new Date().toISOString(),
    ...resultadoQA,
    agentes: resultadosAgentes.map(r => ({
      tipo: r.tipo, ok: r.ok, errores: r.errores, advertencias: r.advertencias,
    })),
    verificador: resultadosVerificador.map(r => ({
      tipo: r.tipo, ok: r.ok, errores: r.errores, advertencias: r.advertencias,
    })),
  });

  // 7. Si QA rechazó y no se fuerza → devolver errores
  if (!resultadoQA.ok && !forzar) {
    return res.status(422).json({
      qa: 'rechazado',
      resumen: resultadoQA.resumen,
      errores: resultadoQA.errores,
      advertencias: resultadoQA.advertencias,
      agentes: qaCache.get(nro_ot).agentes,
      tip: 'Para generar igualmente, agregá ?forzar=true a la URL',
    });
  }

  // 8. QA OK (o forzado) → devolver docx
  const razonSocial = (ot.razon_social || '').replace(/[/\\:*?"<>|]/g, '').trim();
  const nroSolPad   = String(ot.nro_solicitud || '').padStart(7, '0');
  const nroOtPad    = String(nro_ot).padStart(10, '0');
  const preSuffix   = ot.es_preinforme ? '_PRELIMINAR' : '';
  const qaSuffix    = resultadoQA.ok ? '' : '_CON_ADVERTENCIAS';
  const filename    = `${razonSocial}_M${nroSolPad}_${nroOtPad}${preSuffix}${qaSuffix}.docx`;

  // Guardar en el drive del laboratorio (falla silenciosa)
  let rutaDrive = null;
  try { rutaDrive = guardarEnDrive(ot.razon_social, ot.nro_solicitud, filename, buffer, nro_ot); }
  catch (e) { console.warn('[drive]', e.message); }

  // Modo "solo drive": responde JSON con la ruta, sin download.
  const soloDrive = req.query && (req.query.solo_drive === 'true' || req.query.solo_drive === '1');
  if (soloDrive && rutaDrive) {
    return res.json({
      ok: true, ruta: rutaDrive, filename,
      qa_ok: resultadoQA.ok,
      errores: resultadoQA.errores.length,
      advertencias: resultadoQA.advertencias.length,
      reparaciones: correccionesAplicadas.length,
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('X-QA-OK',           String(resultadoQA.ok));
  res.setHeader('X-QA-Errores',      String(resultadoQA.errores.length));
  res.setHeader('X-QA-Advertencias', String(resultadoQA.advertencias.length));
  res.setHeader('X-QA-Reparaciones', String(correccionesAplicadas.length));
  if (rutaDrive) res.setHeader('X-Drive-Path', encodeURIComponent(rutaDrive));
  res.send(buffer);
});

// ── POST /api/qa-check/:nro_ot ────────────────────────────────────────────────
// Corre solo las validaciones PRE-generación (mapeo + agente-ensayo + verificador
// de campos). NO genera el Word. Sirve como paso opcional para revisar la OT
// antes de emitir el informe y detectar errores de datos.
router.post('/qa-check/:nro_ot', async (req, res) => {
  const { nro_ot } = req.params;

  const ot = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
  if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
  ot.id_muestra = sanitizarIdMuestra(ot.id_muestra);

  let ensayosDB = db.prepare(
    'SELECT * FROM ensayos WHERE nro_ot = ? ORDER BY orden'
  ).all(nro_ot);
  if (ensayosDB.length === 0)
    return res.status(400).json({ error: 'La OT no tiene ensayos cargados' });

  try {
    const { aplicarDecisionesOAA } = require('../agents/agente-oaa');
    let overrides = {};
    try { overrides = ot.oaa_decisions_json ? JSON.parse(ot.oaa_decisions_json) : {}; } catch {}
    ensayosDB = aplicarDecisionesOAA(ensayosDB, overrides);
  } catch (e) { console.warn('[OAA] No se pudieron aplicar decisiones:', e.message); }

  const ensayosParseados = ensayosDB.map(e => {
    let datos = {};
    try { datos = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : e.datos_json; } catch {}
    return { ...e, datos_json_obj: datos };
  });

  console.log(`[QA-CHECK] Revisando ${ensayosParseados.length} ensayo(s) sin generar Word...`);
  const [resultadosMapeo, resultadosAgentes] = await Promise.all([
    Promise.resolve(ensayosParseados.map(e => verificarMapeo(e.tipo, e.datos_json_obj))),
    Promise.all(ensayosParseados.map(e => validarEnsayo(e.tipo, e.datos_json_obj, ot))),
  ]);

  const datosPostMapeo = resultadosMapeo.map(r => r.datos);
  const resultadosVerificador = ensayosParseados.map((e, i) =>
    verificarCampos(e.tipo, datosPostMapeo[i])
  );

  const errores = [];
  const advertencias = [];
  for (const r of resultadosAgentes) {
    (r.errores || []).forEach(x => errores.push({ agente: 'ensayo', tipo: r.tipo, mensaje: x }));
    (r.advertencias || []).forEach(x => advertencias.push({ agente: 'ensayo', tipo: r.tipo, mensaje: x }));
  }
  for (const r of resultadosVerificador) {
    (r.errores || []).forEach(x => errores.push({ agente: 'verificador', tipo: r.tipo, mensaje: x }));
    (r.advertencias || []).forEach(x => advertencias.push({ agente: 'verificador', tipo: r.tipo, mensaje: x }));
  }

  const resultado = {
    ok: errores.length === 0,
    errores,
    advertencias,
    agentes: resultadosAgentes.map(r => ({
      tipo: r.tipo, ok: r.ok, errores: r.errores, advertencias: r.advertencias,
    })),
    verificador: resultadosVerificador.map(r => ({
      tipo: r.tipo, ok: r.ok, errores: r.errores, advertencias: r.advertencias,
    })),
    correcciones_mapeo: resultadosMapeo.map((r, i) => ({
      tipo: ensayosParseados[i].tipo, correcciones: r.correcciones,
    })).filter(x => x.correcciones.length > 0),
    timestamp: new Date().toISOString(),
  };

  qaCache.set(nro_ot, resultado);
  res.json(resultado);
});

// ── GET /api/qa-status/:nro_ot ────────────────────────────────────────────────
router.get('/qa-status/:nro_ot', (req, res) => {
  const cached = qaCache.get(req.params.nro_ot);
  if (!cached) return res.status(404).json({ error: 'No hay resultado QA para esta OT' });
  res.json(cached);
});

// ── GET /api/pre-emision/:nro_ot ──────────────────────────────────────────────
// Análisis de coherencia con Claude antes de emitir el Word. Devuelve hallazgos
// (críticos / warnings / info) para que el técnico revise antes de generar.
// No bloquea la emisión — es informativo.
router.get('/pre-emision/:nro_ot', async (req, res) => {
  const { nro_ot } = req.params;
  try {
    const ot = db.prepare('SELECT * FROM ots WHERE nro_ot = ?').get(nro_ot);
    if (!ot) return res.status(404).json({ error: 'OT no encontrada' });
    const ensayos = db.prepare('SELECT id, tipo, datos_json FROM ensayos WHERE nro_ot = ? ORDER BY orden').all(nro_ot);
    if (!ensayos.length) return res.json({ hallazgos: [], nota: 'OT sin ensayos cargados.' });

    const { analizar } = require('../agents/agente-pre-emision');
    const t0 = Date.now();
    const resultado = await analizar(ot, ensayos);
    console.log('[pre-emision] OT ' + nro_ot + ' — ' + resultado.hallazgos.length + ' hallazgos en ' + (Date.now() - t0) + 'ms (modelo ' + resultado.modelo + ')');
    res.json(resultado);
  } catch (err) {
    console.error('[pre-emision] error OT ' + nro_ot + ':', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/actualizar-forms ────────────────────────────────────────────────
// Pobla las tablas equipos y normas del DB leyendo los informes de referencia.
router.post('/actualizar-forms', async (req, res) => {
  try {
    console.log('[ACTUALIZADOR] Iniciando actualización desde informes de referencia...');
    const report = await actualizarDesdeReferencias();
    res.json({
      ok: true,
      archivosLeidos:    report.archivosLeidos,
      equiposInsertados: report.equiposInsertados,
      normasInsertadas:  report.normasInsertadas,
      porTipo:           report.porTipo,
      errores:           report.errores,
    });
  } catch (e) {
    console.error('[ACTUALIZADOR] Error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
