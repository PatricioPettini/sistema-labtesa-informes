#!/usr/bin/env node
// scripts/extract-catalogo.js
//
// Recorre G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA (últimos 365 días),
// extrae normas, metodologías (ITMs) y equipos con TAG de los .docx, y guarda
// los valores nuevos en las tablas `normas` y `equipos` de la DB del sistema.
//
// Uso:
//   node scripts/extract-catalogo.js [--dry-run] [--dias=365] [--min-freq=2]
//
//   --dry-run     Solo muestra qué se detectó, no escribe la DB.
//   --dias=N      Ventana en días (default 365).
//   --min-freq=N  Frecuencia mínima para incorporar un valor (default 2, evita typos).

'use strict';

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const DIAS     = parseInt((args.find(a => a.startsWith('--dias=')) || '--dias=365').split('=')[1], 10);
const MIN_FREQ = parseInt((args.find(a => a.startsWith('--min-freq=')) || '--min-freq=2').split('=')[1], 10);

const ROOT = 'G:\\ADMINISTRACION\\INFORMES APOLO\\METALMECANICA';
const HACE = Date.now() - DIAS * 24 * 3600 * 1000;

console.log('═══════════════════════════════════════════════════════════════');
console.log(' Extractor de catálogo (informes → normas/equipos/ITMs)');
console.log('═══════════════════════════════════════════════════════════════');
console.log(' Carpeta:  ' + ROOT);
console.log(' Ventana:  últimos ' + DIAS + ' días');
console.log(' Min freq: ' + MIN_FREQ);
console.log(' Modo:     ' + (DRY_RUN ? 'DRY-RUN (no escribe DB)' : 'ESCRIBE en DB'));
console.log('');

// ─── Texto plano de un .docx ────────────────────────────────────────────────
function textoDeXml(xml) {
  // Solo <w:t>…</w:t> — extraer contenido, joinear con espacio simple.
  const partes = (xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
    .map(r => r.replace(/^<w:t[^>]*>/, '').replace(/<\/w:t>$/, ''));
  return partes.join(' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function textoDeDocx(rutaDocx) {
  try {
    const buf = fs.readFileSync(rutaDocx);
    const zip = new PizZip(buf);
    const entry = zip.files['word/document.xml'];
    if (!entry) return null;
    return textoDeXml(entry.asText());
  } catch (e) { return null; }
}

// ─── Recolectar .docx recientes (mtime dentro de la ventana) ────────────────
function walk(dir, out = []) {
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) walk(full, out);
    else if (it.name.toLowerCase().endsWith('.docx') && !it.name.startsWith('~$')) {
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs >= HACE) out.push(full);
      } catch {}
    }
  }
  return out;
}

console.log('→ Recorriendo carpeta…');
const t0 = Date.now();
const informes = walk(ROOT);
console.log(`  ${informes.length} informes .docx encontrados (${Date.now() - t0}ms)`);
console.log('');

// ─── Extractores ────────────────────────────────────────────────────────────

// Detecta cualquier norma con estructura conocida. Corta en el primer `<`
// (XML residual que se cuela cuando los runs están partidos).
function limpiar(txt) {
  return String(txt || '').split('<')[0].trim()
    .replace(/\s+/g, ' ').replace(/\s*[,;]\s*$/, '').trim();
}

const RX_NORMAS = [
  // ASTM: ASTM E8-25, A370-24, E45-25 Método C, A53, A193-26, A36/A36M
  /\bASTM\s+[A-Z]\s*\d{1,4}[A-Z]?(?:\/[A-Z]?\d{1,4}[A-Z]?)?(?:[-:\s]?\d{2,4}[a-z]?(?:\([12]\d{3}\))?)?(?:\s+M[ée]todo\s*[A-D])?/g,
  // ISO 148-1:2016, ISO 6892-1:2019, ISO 4287, ISO 945-1:2017, ISO 4967:2013
  /\bISO\s+\d{1,5}(?:-\d{1,2})?(?::\s*\d{4})?/g,
  // ASME BPVC Sección IX Ed. 2025 / ASME B16.9 / ASME B46.1-2019 / ASME B31.3
  // Toleramos "Sección" con acento, "Secci" truncado no válido — pedimos IVX al final.
  /\bASME\s+(?:BPVC[\s\.]*(?:Secc(?:i[oó]n)?|Sección)[\s\.]*[IVX]+(?:\s+Ed(?:ici[oó]n)?[\.,\s]*\d{2,4})?|B[\d\.]+(?:[-:]\d{4})?)/g,
  // API 1104, API 5L, API 5CT (con L/CT/S opcional al final)
  /\bAPI\s+\d{1,5}(?:[A-Z]{1,3})?(?:\s+\d{1,3}(?:st|nd|rd|th)?\s*Ed[\.,]?\s*\(?\d{4}\)?)?/g,
  // AWS D1.1/D1.1M-2020, AWS D1.1, AWS B4.0:2016
  /\bAWS\s+[A-Z]\d(?:[\.\d]*)(?:\/[A-Z]?\d[\.\d]*[A-Z]?)?(?:[-:]?\d{4}(?:-AMD\d)?)?/g,
  // DIN EN 10045, DIN ISO 15614-1, DIN EN 1043
  /\bDIN\s+(?:EN|ISO)\s+\d{1,5}(?:-\d)?(?::\d{4})?/g,
  // IRAM-IAS U 500-126 / IRAM IAS U 500-122
  /\bIRAM[\s-]+IAS\s+U\s+\d{3,4}[-]?\d{2,4}/g,
  // SAE J419_201801 / SAE J419
  /\bSAE\s+J\d{2,5}(?:_\d{4,8})?/g,
  // ASM Metal Handbook Vol.9:2004
  /\bASM\s+Metal\s+Handbook\s+Vol\.?\s*\d+(?::\d{4})?/gi,
];

// Normaliza para dedupear: colapsa espacios en códigos tipo "ASTM E 190" → "ASTM E190"
function normalizarNorma(n) {
  let s = n.trim().replace(/\s+/g, ' ');
  // Colapsar espacio entre letra y número en códigos (ASTM E 190 → ASTM E190, ASTM A 53 → ASTM A53)
  s = s.replace(/\b(ASTM|ISO|API|AWS|DIN|SAE)\s+([A-Z]{1,3})\s+(\d)/g, '$1 $2$3');
  // ASME BPVC: colapsar espacio después de "Ed."/"Secc."
  s = s.replace(/\bEd\.\s+(\d)/g, 'Ed.$1').replace(/\bSecc\.\s+/g, 'Secc.');
  // Descartar años truncados (Ed.202 sin 4to dígito).
  if (/\bEd[\.\s]*\d{1,3}$/.test(s)) return '';
  return s;
}

function extraerNormas(texto) {
  const found = new Set();
  for (const rx of RX_NORMAS) {
    const matches = texto.match(rx) || [];
    for (const raw of matches) {
      let n = limpiar(raw);
      n = normalizarNorma(n);
      if (!n) continue;
      if (n.length >= 4 && n.length <= 60) found.add(n);
    }
  }
  return [...found];
}

// ITMs: "ITM N°064", "ITM 060", "ITM-054"
function extraerItms(texto) {
  const found = new Set();
  const rx = /\bITM\s*[N˚°]?\s*[°˚]?\s*(\d{2,4})\b/gi;
  let m;
  while ((m = rx.exec(texto))) {
    found.add('ITM N°' + m[1].padStart(3, '0'));
  }
  return [...found];
}

// Equipos: <nombre> TAG N° <código>. El nombre suele venir de un heading previo
// contaminado ("EQUIPAMIENTO UTILIZADO"). Filtramos prefijos conocidos.
const PREFIJOS_LIMPIAR = /^(?:[A-Z]\s+)?(?:EQUIPAMIENTO\s+UTILIZADO|VERIFICACIONES\s+Y\s+CONDICIONES\s+DE\s+ENSAYO|Aumento\s+utilizado[:\s]*[\d\sX,]+)\s+/i;

function extraerEquipos(texto) {
  const rx = /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ\s\.\-\/]{5,80}?)\s+TAG\s*N[°˚]\s*([A-Z]{1,5}[-\s]?[A-Z]{0,4}[-\s]?\d{2,5})/g;
  const found = new Map();
  let m;
  while ((m = rx.exec(texto))) {
    let nombre = m[1].trim();
    nombre = nombre.replace(PREFIJOS_LIMPIAR, '').trim();
    // Descartar si queda muy corto o empieza con carácter raro.
    if (nombre.length < 5) continue;
    if (!/^[A-ZÁÉÍÓÚÑ]/.test(nombre)) continue;
    const tag = m[2].replace(/\s+/g, '').toUpperCase();
    const key = nombre + '||' + tag;
    if (!found.has(key)) found.set(key, { nombre, tag });
  }
  return [...found.values()];
}

// Detección de tipo de ensayo por texto — heurística simple para clasificar
// dónde va cada norma extraída.
function tipoEnsayoDelInforme(texto) {
  const tipos = [];
  if (/tracci[oó]n/i.test(texto)) tipos.push('traccion');
  if (/impacto|Charpy/i.test(texto)) tipos.push('impacto');
  if (/plegado/i.test(texto)) tipos.push('plegado');
  if (/nick[\s-]?break/i.test(texto)) tipos.push('nick-break');
  if (/quimic[oa]|composici[oó]n\s+quimic|espectromet/i.test(texto)) tipos.push('quimicos');
  if (/dureza\s+brinell/i.test(texto)) tipos.push('dureza-brinell');
  if (/dureza\s+vickers|microdureza/i.test(texto)) tipos.push('dureza-vickers');
  if (/dureza\s+rockwell/i.test(texto)) tipos.push('dureza-rockwell');
  if (/rugosidad/i.test(texto)) tipos.push('rugosidad');
  if (/macrograf/i.test(texto)) tipos.push('macrografia');
  if (/microestructura|metalograf/i.test(texto)) tipos.push('microestructura');
  if (/tama[nñ]o\s+de\s+grano/i.test(texto)) tipos.push('tamano-grano');
  if (/inclusiones/i.test(texto)) tipos.push('inclusiones');
  if (/ferrita\s+delta|% ferrita/i.test(texto)) tipos.push('ferrita-delta');
  if (/liquidos?\s+penetrant/i.test(texto)) tipos.push('liquidos-penetrantes');
  if (/tratamient[oa]s?\s+termic/i.test(texto)) tipos.push('tratamientos-termicos');
  return tipos.length ? tipos : ['general'];
}

// ─── Recorrer todos los informes ────────────────────────────────────────────
const contNormas  = new Map(); // norma → { count, tipos: Set }
const contItms    = new Map(); // itm → { count, tipos: Set }
const contEquipos = new Map(); // nombre+tag → { count, nombre, tag, tipos: Set }

const t1 = Date.now();
let leidos = 0, errores = 0;
for (const ruta of informes) {
  const texto = textoDeDocx(ruta);
  if (!texto) { errores++; continue; }
  leidos++;
  const tipos = tipoEnsayoDelInforme(texto);

  for (const n of extraerNormas(texto)) {
    const r = contNormas.get(n) || { count: 0, tipos: new Set() };
    r.count++;
    tipos.forEach(t => r.tipos.add(t));
    contNormas.set(n, r);
  }
  for (const i of extraerItms(texto)) {
    const r = contItms.get(i) || { count: 0, tipos: new Set() };
    r.count++;
    tipos.forEach(t => r.tipos.add(t));
    contItms.set(i, r);
  }
  for (const e of extraerEquipos(texto)) {
    const key = e.nombre + '||' + e.tag;
    const r = contEquipos.get(key) || { count: 0, nombre: e.nombre, tag: e.tag, tipos: new Set() };
    r.count++;
    tipos.forEach(t => r.tipos.add(t));
    contEquipos.set(key, r);
  }
}
console.log(`→ Procesados ${leidos} informes (${errores} con error) en ${Math.round((Date.now() - t1) / 1000)}s`);
console.log('');

// ─── Resumen y filtro por frecuencia mínima ─────────────────────────────────
function ordenados(map) {
  return [...map.entries()]
    .filter(([_, r]) => r.count >= MIN_FREQ)
    .sort((a, b) => b[1].count - a[1].count);
}

const normasFinal  = ordenados(contNormas);
const itmsFinal    = ordenados(contItms);
const equiposFinal = ordenados(contEquipos);

console.log(`═ NORMAS (freq ≥ ${MIN_FREQ}): ${normasFinal.length} únicas ═`);
normasFinal.slice(0, 40).forEach(([n, r]) => {
  console.log(`  ${String(r.count).padStart(4)}× [${[...r.tipos].join(',')}]  ${n}`);
});
if (normasFinal.length > 40) console.log(`  … y ${normasFinal.length - 40} más`);
console.log('');

console.log(`═ ITMs (freq ≥ ${MIN_FREQ}): ${itmsFinal.length} únicas ═`);
itmsFinal.forEach(([i, r]) => {
  console.log(`  ${String(r.count).padStart(4)}× [${[...r.tipos].join(',')}]  ${i}`);
});
console.log('');

console.log(`═ EQUIPOS (freq ≥ ${MIN_FREQ}): ${equiposFinal.length} únicos ═`);
equiposFinal.slice(0, 40).forEach(([_, r]) => {
  console.log(`  ${String(r.count).padStart(4)}× [${[...r.tipos].join(',')}]  ${r.nombre} TAG N°${r.tag}`);
});
if (equiposFinal.length > 40) console.log(`  … y ${equiposFinal.length - 40} más`);
console.log('');

// ─── Escritura en DB ────────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log('DRY-RUN — no se escribió en la DB. Ejecutá sin --dry-run para persistir.');
  process.exit(0);
}

console.log('→ Persistiendo en DB…');
const db = require('../server/db');

const insNorma = db.prepare(`
  INSERT INTO normas (codigo, clase, titulo, tipo, version, vigente)
  VALUES (?, ?, ?, ?, ?, 1)
  ON CONFLICT(codigo) DO UPDATE SET
    titulo   = excluded.titulo,
    tipo     = excluded.tipo,
    vigente  = 1
`);
let nuevasN = 0;
const guardarNorma = db.transaction((rows) => {
  for (const [n, r] of rows) {
    const tipoPrimario = [...r.tipos][0] || 'general';
    // Separar versión si viene con año/sufijo (ASTM E8-25 → codigo=ASTM E8, version=-25)
    const m = n.match(/^(.+?)([-:]\d{2,4}[a-z]?(?:\(\d{4}\))?)(.*)$/);
    let codigo = n, version = null;
    if (m) { codigo = (m[1] + (m[3] || '')).trim(); version = m[2]; }
    insNorma.run(n, 'norma', n, tipoPrimario, version);
    nuevasN++;
  }
});
guardarNorma(normasFinal);

const insItm = db.prepare(`
  INSERT INTO normas (codigo, clase, titulo, tipo, version, vigente)
  VALUES (?, 'itm', ?, ?, NULL, 1)
  ON CONFLICT(codigo) DO NOTHING
`);
let nuevasI = 0;
const guardarItm = db.transaction((rows) => {
  for (const [i, r] of rows) {
    const tipoPrimario = [...r.tipos][0] || 'general';
    insItm.run(i, i, tipoPrimario);
    nuevasI++;
  }
});
guardarItm(itmsFinal);

const insEquipo = db.prepare(`
  INSERT INTO equipos (id, nombre, tipo, sede, ensayos, activo)
  VALUES (?, ?, ?, NULL, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    nombre = excluded.nombre,
    activo = 1
`);
let nuevasE = 0;
const guardarEq = db.transaction((rows) => {
  for (const [_, r] of rows) {
    const tipos = [...r.tipos];
    const tipoPrimario = tipos[0] || 'general';
    insEquipo.run(r.tag, r.nombre, tipoPrimario, JSON.stringify(tipos));
    nuevasE++;
  }
});
guardarEq(equiposFinal);

console.log(`✓ ${nuevasN} normas, ${nuevasI} ITMs, ${nuevasE} equipos guardados/actualizados.`);
console.log('Listo.');
