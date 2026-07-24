// Importa a la tabla `equipos` los instrumentos ACTIVOS ("Alta inst. = VER")
// desde el Google Sheet de Calidad. INSERTa los TAG que no existen; los que
// ya existen NO se tocan (para no pisar datos manuales).
//
// Uso:
//   1. Descargar/actualizar el xlsx a _inspect/instrumentos.xlsx (via MCP o manual)
//   2. node scripts/importar-equipos-sheet.js
//
// Fuente del sheet:
//   https://docs.google.com/spreadsheets/d/1_x-IFhtIxXHkG_FmaUt_4jiXowCY9VTg/edit
//
// Columnas del sheet (fila 8 = headers):
//   col 2 (TAG Nº 2) = TAG con formato MM-XXX/CAL-XXX/QB-XXX/etc.
//   col 3 (DESCRIPCION) = nombre + serie + rango
//   col 4 (SEDE DE RADICACION) = "BUENOS AIRES" | "NEUQUEN"
//   col 5 (ALTA INST.) = "VER" (activo) | "BAJA" (dado de baja)

'use strict';

const path = require('path');
const XLSX = require('xlsx');
const db = require('../server/db');

const XLSX_PATH = path.join(__dirname, '..', '_inspect', 'instrumentos.xlsx');
const SHEET_NAME = 'LISTADO DE INST ';
const HEADER_ROW = 7;
const COL = { TAG: 2, DESC: 3, SEDE: 4, ALTA: 5 };

function norm(v) { return String(v == null ? '' : v).trim(); }
function normSede(s) {
  const u = String(s || '').trim().toUpperCase();
  if (u === 'BUENOS AIRES') return 'CABA';
  if (u === 'NEUQUEN' || u === 'NEUQUÉN') return 'Neuquén';
  return u || null;
}

function leerActivos() {
  const wb = XLSX.readFile(XLSX_PATH);
  const sh = wb.Sheets[SHEET_NAME];
  if (!sh) throw new Error('No se encuentra la hoja "' + SHEET_NAME + '"');
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });

  const porTag = new Map();
  for (let i = HEADER_ROW + 1; i < rows.length; i++) {
    const r = rows[i];
    if (norm(r[COL.ALTA]).toUpperCase() !== 'VER') continue;
    const tag = norm(r[COL.TAG]).toUpperCase();
    const desc = norm(r[COL.DESC]);
    if (!tag || !desc) continue;
    if (porTag.has(tag)) continue; // primera descripcion gana
    porTag.set(tag, { id: tag, nombre: desc, sede: normSede(r[COL.SEDE]) });
  }
  return Array.from(porTag.values());
}

function main() {
  console.log('Leyendo', XLSX_PATH);
  const activos = leerActivos();
  console.log('Instrumentos ACTIVOS unicos leidos:', activos.length);

  const existentes = new Set(
    db.prepare('SELECT id FROM equipos').all().map(r => (r.id || '').trim().toUpperCase())
  );
  const nuevos = activos.filter(a => !existentes.has(a.id));
  console.log('Ya existen en DB:', activos.length - nuevos.length);
  console.log('A insertar (nuevos):', nuevos.length);

  if (nuevos.length === 0) { console.log('Nada para insertar.'); return; }

  const insert = db.prepare(
    'INSERT INTO equipos (id, nombre, sede, activo) VALUES (?, ?, ?, 1)'
  );
  const tx = db.transaction(items => {
    for (const it of items) insert.run(it.id, it.nombre, it.sede);
  });
  tx(nuevos);
  console.log('Inserts OK.');

  const totalDespues = db.prepare('SELECT COUNT(*) AS n FROM equipos').get().n;
  console.log('Total equipos en DB despues del import:', totalDespues);
}

main();
