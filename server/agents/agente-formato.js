/**
 * agente-formato.js
 * Valida el formato del Word generado comparándolo contra los informes de referencia
 * organizados en server/agents/informes-referencia/{tipo}/.
 *
 * Propiedades verificadas (sin tocar el contenido):
 *   - Ancho de tablas y columnas
 *   - Espaciado de párrafos
 *   - Márgenes de página
 */

'use strict';
const PizZip = require('pizzip');
const fs     = require('fs');
const path   = require('path');

const REF_DIR     = path.join(__dirname, 'informes-referencia');
const TABLA_TOL_ABS = 350;   // dxa — tolerancia absoluta para ancho de tabla
const TABLA_TOL_PCT = 0.09;  // 9 %  — solo se reporta si AMBAS condiciones se cumplen
const COL_TOL_ABS   = 220;   // dxa — tolerancia por columna
const COL_TOL_PCT   = 0.12;  // 12%
const SPACING_TOL   = 40;    // twips — tolerancia para line-spacing

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function mode(arr) {
  if (!arr.length) return null;
  const freq = {};
  for (const v of arr) freq[v] = (freq[v] || 0) + 1;
  return parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
}

// ── Extracción de perfil de formato ──────────────────────────────────────────

function extractFormatProfile(buffer) {
  let docXml;
  try {
    const zip = new PizZip(buffer);
    docXml = zip.files['word/document.xml']?.asText() || '';
  } catch (e) {
    return null;
  }

  // 1. Márgenes
  const margenes = {};
  const sectMatch = docXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/);
  if (sectMatch) {
    const pgMar = sectMatch[0].match(/<w:pgMar\b([^>]*\/?>)/);
    if (pgMar) {
      for (const k of ['top', 'right', 'bottom', 'left', 'header', 'footer']) {
        const m = pgMar[1].match(new RegExp(`w:${k}="(\\d+)"`));
        if (m) margenes[k] = parseInt(m[1]);
      }
    }
  }

  // 2. Tablas (no anidadas — estándar en informes Word)
  const tablas = [];
  for (const m of docXml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)) {
    const tbl = m[0];
    // Aceptar w:w y w:type en cualquier orden
    const wM  = tbl.match(/<w:tblW\b[^>]*/);
    const wVal  = wM ? (wM[0].match(/w:w="(\d+)"/)        ?.[1] ?? null) : null;
    const wType = wM ? (wM[0].match(/w:type="([^"]+)"/)   ?.[1] ?? 'dxa') : 'dxa';
    const cols = [...tbl.matchAll(/<w:gridCol[^>]*w:w="(\d+)"/g)].map(c => parseInt(c[1]));
    // Ignorar tablas auto-width (ancho=0 o tipo=auto/pct) — no se pueden comparar con fijo
    const ancho = (wType === 'dxa' && wVal && parseInt(wVal) > 0) ? parseInt(wVal) : null;
    tablas.push({ ancho, tipo: wType, columnas: cols, nColumnas: cols.length });
  }

  // 3. Espaciado de párrafos (colectar todos los <w:spacing>)
  const spacings = [];
  for (const m of docXml.matchAll(/<w:spacing\s+([^/]*)\/?>/g)) {
    const a = m[1];
    const before = a.match(/w:before="(\d+)"/)?.[1];
    const after  = a.match(/w:after="(\d+)"/)?.[1];
    const line   = a.match(/w:line="(\d+)"/)?.[1];
    if (line != null)
      spacings.push({ before: before ? parseInt(before) : null, after: after ? parseInt(after) : null, line: parseInt(line) });
  }

  return { margenes, tablas, spacings };
}

// ── Carga de perfiles de referencia ──────────────────────────────────────────

function loadReferenceProfiles(tipos) {
  // Subdirectorio: si es un solo tipo, buscar en ese directorio; si son varios, en combinados/
  const subdir = tipos.length === 1 ? tipos[0] : 'combinados';
  let docxPaths = [];

  const candidatos = [subdir, 'recientes'];
  for (const d of candidatos) {
    const dir = path.join(REF_DIR, d);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'))
      .map(f => path.join(dir, f));
    if (files.length > 0) { docxPaths = files; break; }
  }

  const profiles = [];
  for (const fp of docxPaths) {
    try {
      const p = extractFormatProfile(fs.readFileSync(fp));
      if (p) profiles.push(p);
    } catch { /* skip unreadable */ }
  }
  return profiles;
}

// ── Cálculo de consenso ───────────────────────────────────────────────────────

function computeConsensus(profiles) {
  if (!profiles.length) return null;

  // Márgenes
  const margenes = {};
  for (const k of ['top', 'right', 'bottom', 'left', 'header', 'footer']) {
    const vals = profiles.map(p => p.margenes[k]).filter(v => v != null);
    if (vals.length) margenes[k] = median(vals);
  }

  // Tablas agrupadas por número de columnas (solo tablas con ancho fijo dxa)
  const grupos = {};
  for (const p of profiles) {
    for (const t of p.tablas) {
      if (!t.nColumnas || t.ancho == null) continue; // skip auto-width tables
      if (!grupos[t.nColumnas]) grupos[t.nColumnas] = [];
      grupos[t.nColumnas].push(t);
    }
  }
  const tablaConsenso = {};
  for (const [nCols, tablas] of Object.entries(grupos)) {
    const anchos   = tablas.map(t => t.ancho).filter(v => v != null);
    const n        = parseInt(nCols);
    const colWidths = [];
    for (let i = 0; i < n; i++) {
      const vals = tablas.map(t => t.columnas[i]).filter(v => v != null);
      colWidths.push(vals.length ? median(vals) : null);
    }
    tablaConsenso[nCols] = { ancho: anchos.length ? median(anchos) : null, columnas: colWidths };
  }

  // Espaciado
  const lineVals   = profiles.flatMap(p => p.spacings.map(s => s.line)).filter(v => v != null);
  const beforeVals = profiles.flatMap(p => p.spacings.map(s => s.before)).filter(v => v != null);
  const afterVals  = profiles.flatMap(p => p.spacings.map(s => s.after)).filter(v => v != null);
  const espaciado  = {
    line:   lineVals.length   ? mode(lineVals)   : null,
    before: beforeVals.length ? mode(beforeVals) : null,
    after:  afterVals.length  ? mode(afterVals)  : null,
  };

  return { margenes, tablaConsenso, espaciado };
}

// ── Validación principal ──────────────────────────────────────────────────────

async function validarFormato(buffer, tipos) {
  const errores = [], advertencias = [];

  const genProfile = extractFormatProfile(buffer);
  if (!genProfile) {
    return { ok: false, errores: ['No se pudo analizar el formato del documento generado'], advertencias: [], _consenso: null };
  }

  const refProfiles = loadReferenceProfiles(tipos);
  if (!refProfiles.length) {
    advertencias.push(`Sin informes de referencia para "${tipos.join(', ')}". Formato no verificado.`);
    return { ok: true, errores: [], advertencias, _consenso: null };
  }

  const consenso = computeConsensus(refProfiles);
  if (!consenso) {
    return { ok: true, errores: [], advertencias: ['No se pudo calcular consenso de formato.'], _consenso: null };
  }

  console.log(`[FORMATO] Consenso desde ${refProfiles.length} informe(s) de referencia`);

  // — Márgenes —
  for (const [lado, refVal] of Object.entries(consenso.margenes)) {
    const genVal = genProfile.margenes[lado];
    if (genVal == null) continue;
    if (Math.abs(genVal - refVal) > 50)
      errores.push(`Margen ${lado}: ${genVal} twips (referencia: ${refVal})`);
  }

  // — Tablas y columnas —
  // Solo comparar tablas en rango de ancho similar (ratio 0.65–1.5).
  // Tablas con el mismo número de columnas pero de secciones muy distintas
  // (p.ej. resultados de tracción vs plegado) tienen anchos incomparables.
  for (const genTabla of genProfile.tablas) {
    if (genTabla.ancho == null) continue;
    const ref = consenso.tablaConsenso[genTabla.nColumnas];
    if (!ref || ref.ancho == null) continue;

    const ratio = genTabla.ancho / ref.ancho;
    if (ratio < 0.65 || ratio > 1.5) continue; // diferente tipo de tabla — no comparar

    const diff = Math.abs(genTabla.ancho - ref.ancho);
    if (diff > TABLA_TOL_ABS && diff / ref.ancho > TABLA_TOL_PCT)
      errores.push(`Tabla (${genTabla.nColumnas} col.): ancho ${genTabla.ancho} dxa — referencia ${ref.ancho} dxa`);

    for (let i = 0; i < genTabla.columnas.length; i++) {
      const refW = ref.columnas[i], genW = genTabla.columnas[i];
      if (refW == null || genW == null) continue;
      const colRatio = genW / refW;
      if (colRatio < 0.65 || colRatio > 1.5) continue;
      const colDiff = Math.abs(genW - refW);
      if (colDiff > COL_TOL_ABS && colDiff / refW > COL_TOL_PCT)
        advertencias.push(`Tabla (${genTabla.nColumnas} col.) col.${i + 1}: ${genW} dxa — referencia ${refW} dxa`);
    }
  }

  // — Espaciado de línea —
  if (consenso.espaciado.line != null && genProfile.spacings.length > 0) {
    const genLines = genProfile.spacings.map(s => s.line).filter(v => v != null);
    if (genLines.length) {
      const genMode = mode(genLines);
      if (Math.abs(genMode - consenso.espaciado.line) > SPACING_TOL)
        advertencias.push(`Espaciado de línea predominante: ${genMode} twips (referencia: ${consenso.espaciado.line})`);
    }
  }

  const ok = errores.length === 0;
  console.log(`[FORMATO] ok=${ok} — ${errores.length} error(es), ${advertencias.length} advertencia(s)`);
  return { ok, errores, advertencias, _consenso: consenso };
}

module.exports = { validarFormato, extractFormatProfile };
