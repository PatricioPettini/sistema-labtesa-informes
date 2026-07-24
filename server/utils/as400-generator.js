// Generador AS400 (Cintolo) — port del as400.py a Node.js.
// Toma hasta 10 informes .xlsm y rellena la plantilla "planilla AS400 hasta 10.xlsx"
// según las reglas de Cintolo.
//
// Correcciones respecto a la versión Python original:
//   1. Filas en MPa (R11, R13, R22, R24) se emiten como ENTERO (sin decimales).
//   2. Valores 0 / 0.00 / 0,00 / "RECHAZADO" en filas numéricas → celda vacía.
//
// Se preserva:
//   - Redondeo hacia arriba a 2 decimales en filas numéricas no-MPa.
//   - Números guardados como texto con coma decimal + quotePrefix (triangulito
//     verde de Excel).
//   - Abreviación de tratamiento térmico: NORMALIZADO→NOR, TEMPLADO Y REVENIDO→TYR, etc.
//   - Origen L/T (primera letra).
//   - Limpieza de bloques sobrantes cuando hay <10 informes.
//   - Guardado en G:\METALMECANICA\_REGISTROS DE METALMECANICA\INFORMES\CINTOLO\AS 400.

'use strict';

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const ROWS_PER_BLOCK = 61;
const MAX_BLOCKS     = 10;

// ─── Configuración de filas ─────────────────────────────────────────────────
// Filas numéricas donde aplicar redondeo al más cercano (half-away-from-zero) a 2 decimales.
const FILAS_NUMERICAS = new Set([
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,       // MB — tracción
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,   // MA — tracción
  29,                                            // Valor medido (dureza)
  32, 33, 34, 35, 36, 37,                        // Charpy MB/MA
  40, 41, 42,                                    // ZAC Charpy
  43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, // Químicos
]);

// Filas en MPa → salen como ENTERO (sin decimales). CORRECCIÓN #1.
const FILAS_MPA = new Set([11, 13, 22, 24]);

// Mapeo de tratamientos térmicos (orden importa: más específicos primero).
const TRATAMIENTO_MAP = [
  ['TEMPLADO Y REVENIDO', 'TYR'],
  ['TEMPLADO REVENIDO',   'TYR'],
  ['TEMPLE Y REVENIDO',   'TYR'],
  ['TEMPLE REVENIDO',     'TYR'],
  ['NORMALIZADO',         'NOR'],
  ['REVENIDO',            'REV'],
];

// Carpeta destino (configurable por env; fallback dev-desktop).
const CARPETA_SALIDA_DEFAULT = process.env.AS400_CARPETA_SALIDA
  || 'G:\\METALMECANICA\\_REGISTROS DE METALMECANICA\\INFORMES\\CINTOLO\\AS 400';

// ─── Helpers ────────────────────────────────────────────────────────────────
function norm(s) {
  if (s == null) return '';
  return String(s).replace(/\s+/g, ' ').trim().toUpperCase();
}

function roundA2Dec(v) {
  // Redondeo al más cercano a 2 decimales (half-away-from-zero). Aplicamos
  // toFixed(9) antes del round para eliminar el error de precisión de JS float
  // (sin esto, 34.205 * 100 puede dar 3420.4999999999... y Math.round lo baja
  // a 3420 en vez de subirlo a 3421).
  //   8.7344 → 873.44 → round → 873 → 8.73  ✓
  //   8.7350 → 873.50 → round → 874 → 8.74  ✓
  //   8.7355 → 873.55 → round → 874 → 8.74  ✓
  const escalado = Number((v * 100).toFixed(9));
  return Math.round(escalado) / 100;
}

function esValorNulo(v) {
  if (v == null || v === '') return true;
  const s = String(v).trim();
  if (s === '' || s === '-') return true;
  return false;
}

// CORRECCIÓN #2: valores 0, 0.00, 0,00 o "RECHAZADO" → vacío.
function esValorDescartable(v) {
  if (esValorNulo(v)) return true;
  if (esRechazado(v)) return true;
  const s = String(v).trim();
  const n = Number(s.replace(',', '.'));
  if (!isNaN(n) && n === 0) return true;
  return false;
}

// "RECHAZADO" (con cualquier variante case + espacios) → celda vacía siempre,
// incluso en filas no numéricas (ej. PLEGADO CARA / RAIZ).
function esRechazado(v) {
  if (v == null) return false;
  return /rechazad/i.test(String(v));
}

// Convierte número a texto con coma decimal y sin decimales sobrantes.
// 50 → "50", 12.5 → "12,5", 12.53 → "12,53", 35.2 → "35,2" (NO "35,20")
function numeroATexto(v, forzarEntero) {
  const f = Number(v);
  if (isNaN(f)) return String(v);
  if (forzarEntero) return String(Math.round(f));
  // Formatear a 2 decimales máximo, quitando ceros a la derecha:
  //   35.00 → "35"    (todos los decimales son ceros)
  //   35.20 → "35.2"  (segundo decimal cero se descarta)
  //   35.25 → "35.25" (ambos decimales significativos)
  let s = f.toFixed(2);
  if (s.includes('.')) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return s.replace('.', ',');
}

function abreviarTratamiento(txt) {
  if (esValorNulo(txt)) return '';
  const key = norm(txt);
  for (const [k, v] of TRATAMIENTO_MAP) if (key.includes(k)) return v;
  return String(txt).trim();
}

function abreviarOrigen(txt) {
  if (esValorNulo(txt)) return '';
  const u = String(txt).trim().toUpperCase();
  if (u.startsWith('T')) return 'T';
  if (u.startsWith('L')) return 'L';
  return String(txt).trim();
}

// ─── Lectura de xlsm con pizzip ─────────────────────────────────────────────
// Parser XML mínimo: extrae celdas de una fila. Usamos regex porque los sheets
// de openpyxl son bien predecibles.
function xmlText(node) {
  // <t>texto</t> — extrae texto de un nodo <t>
  const m = /<t[^>]*>([\s\S]*?)<\/t>/.exec(node);
  return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const arr = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    const inner = m[1];
    // Puede tener múltiples <t> (por runs con formato). Concatenar todos.
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let acc = '';
    let mt;
    while ((mt = tRe.exec(inner))) {
      acc += mt[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    }
    arr.push(acc);
  }
  return arr;
}

// Extrae, del sheet XML, un mapa { rowNum → { colLetter → valor decodificado } }
// donde valor ya está convertido (string o number según t=s/n/inlineStr).
// Si `warnings` es un array, se le pushean strings describiendo celdas donde
// se detectó una fórmula externa sin valor cacheado (útil para debug).
// También retorna un mapa paralelo `formulas` con las fórmulas encontradas
// (útil para resolver referencias internas/externas sin valor cacheado).
function parseSheet(xml, sharedStrings, warnings) {
  const filas = {};
  const formulas = {}; // { rowNum: { colLetter: formulaStr } }
  const rowRe = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let mr;
  while ((mr = rowRe.exec(xml))) {
    const rNum = parseInt(mr[1], 10);
    const rowInner = mr[2];
    const celdas = {};
    // Detectar celdas con y sin valor. Regex captura r="A1" (opcional t="...") + opcional <v>.
    const cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let mc;
    while ((mc = cRe.exec(rowInner))) {
      const attrs = mc[1] || mc[3] || '';
      const inner = mc[2] || '';
      const rMatch = /\br="([A-Z]+)(\d+)"/.exec(attrs);
      if (!rMatch) continue;
      const colLetter = rMatch[1];
      const tMatch = /\bt="([^"]+)"/.exec(attrs);
      const t = tMatch ? tMatch[1] : null;
      let valor = null;
      // Aceptar `<v>...</v>` y `<v xml:space="preserve">...</v>` (Excel escribe
      // el atributo cuando el valor tiene espacios al inicio/final, ej. " -46°").
      const vMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      if (vMatch) {
        const raw = vMatch[1];
        if (t === 's') valor = sharedStrings[parseInt(raw, 10)];
        else if (t === 'str' || t === 'b') valor = raw;
        else valor = raw; // número o inlineStr con <is>
      }
      const isMatch = /<is>([\s\S]*?)<\/is>/.exec(inner);
      if (isMatch && t === 'inlineStr') {
        const tRe2 = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let acc = '', mit;
        while ((mit = tRe2.exec(isMatch[1]))) acc += mit[1];
        valor = acc;
      }
      // Descartar referencias externas rotas: si la celda tiene una fórmula
      // que apunta a otro .xlsm (ej. =[M1.xlsm]Ens.Fisicos!$C$5) y NO tiene
      // valor cacheado en <v>, el parser previamente arrastraba el string
      // de la fórmula ("[M1.xlsm]…") al AS400 y lo mostraba como texto en la
      // celda de destino. Con este filtro devolvemos null y luego se intenta
      // resolver la fórmula por vías alternativas (sheet interno + externalLinks).
      let descartadoPorFormula = false;
      if (valor != null && typeof valor === 'string') {
        const s = String(valor);
        if (/\.xlsm?\]/i.test(s) || /^\s*['\[]/.test(s) && /\]/.test(s)) {
          valor = null;
          descartadoPorFormula = true;
        }
      }
      // Detectar y guardar fórmula (para poder resolverla después).
      const fMatch2 = /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(inner);
      if (fMatch2) {
        const fAttrs = fMatch2[1] || '';
        const fBody = fMatch2[2] || '';
        formulas[rNum] = formulas[rNum] || {};
        formulas[rNum][colLetter] = { body: fBody, attrs: fAttrs };
        // Funciones "basura" para el AS400 — devuelven info del archivo abierto,
        // no datos del ensayo. Descartar el valor cacheado (puede ser una ruta
        // temp del recálculo con Excel COM).
        const esBasura = /^\s*=?\s*CELL\s*\(\s*["&][^)]*(?:nombrearchivo|filename|address)/i.test(fBody)
                      || /^\s*=?\s*INFO\s*\(/i.test(fBody);
        if (esBasura) {
          valor = null;
          descartadoPorFormula = true;
        } else if (valor == null) {
          if (/\.xlsm?\]/i.test(fBody) || /^\s*['\[]/.test(fBody)) {
            descartadoPorFormula = true;
          }
        }
      }
      // Descartar valores que parecen rutas de archivo (heredadas de =CELL()).
      if (valor != null && typeof valor === 'string') {
        const s = String(valor);
        // Rutas Windows tipo "C:\..." o "\\server\..." o con "\Users\"
        if (/^[A-Z]:\\/.test(s) || /^\\\\/.test(s) || /\\[^\\]+\.xlsm?$/i.test(s)) {
          valor = null;
          descartadoPorFormula = true;
        }
      }
      if (descartadoPorFormula && Array.isArray(warnings)) {
        const fBody = fMatch2 ? String(fMatch2[2] || '').slice(0, 120) : '';
        // No warnear CELL("nombrearchivo"): es una fórmula conocida que
        // siempre devuelve la ruta del archivo (basura para el AS400), y ya
        // se descarta silenciosamente. No aporta valor mostrar el warning.
        const esBasuraConocida = /CELL\s*\(/i.test(fBody) || /INFO\s*\(/i.test(fBody);
        if (!esBasuraConocida) {
          warnings.push(`${colLetter}${rNum}: fórmula sin valor cacheado — f="${fBody}"`);
        }
      }
      celdas[colLetter] = valor;
    }
    filas[rNum] = celdas;
  }
  return { filas, formulas };
}

// Parsea xl/externalLinks/externalLinkN.xml — Excel guarda ahí los últimos
// valores conocidos de cada celda referenciada de un archivo externo.
// Devuelve { indice → { sheetName → { colLetter+rowNum → valor } } }.
// El índice es 1-based y coincide con el que aparece en las fórmulas
// como "[1]NombreSheet!$C$5".
function parseExternalLinks(zip, sharedStrings) {
  const links = {};
  Object.keys(zip.files).forEach(fname => {
    const m = fname.match(/^xl\/externalLinks\/externalLink(\d+)\.xml$/i);
    if (!m) return;
    const idx = parseInt(m[1], 10);
    const xml = zip.files[fname].asText();
    // Cada <sheetData sheetId="N"> tiene rows con celdas cacheadas.
    // También hay <sheetNames><sheetName val="Ens.Fisicos"/></sheetNames> con
    // el nombre en orden (sheetId 0-based).
    const sheetNames = [];
    const rxNames = /<sheetName\b[^>]*\bval="([^"]+)"/g;
    let mn;
    while ((mn = rxNames.exec(xml))) sheetNames.push(mn[1]);
    const porSheet = {};
    const rxSheet = /<sheetData\b[^>]*\bsheetId="(\d+)"[^>]*>([\s\S]*?)<\/sheetData>/g;
    let ms;
    while ((ms = rxSheet.exec(xml))) {
      const sheetId = parseInt(ms[1], 10);
      const sheetName = sheetNames[sheetId] || String(sheetId);
      const sheetInner = ms[2];
      const celdas = {};
      const rxRow = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
      let mrow;
      while ((mrow = rxRow.exec(sheetInner))) {
        const rowNum = parseInt(mrow[1], 10);
        const rxCell = /<cell\b([^>]*)>([\s\S]*?)<\/cell>|<cell\b([^>]*)\/>/g;
        let mc2;
        while ((mc2 = rxCell.exec(mrow[2]))) {
          const attrs = mc2[1] || mc2[3] || '';
          const inner2 = mc2[2] || '';
          const rMatch2 = /\br="([A-Z]+)(\d+)"/.exec(attrs);
          if (!rMatch2) continue;
          const colLetter = rMatch2[1];
          const tMatch = /\bt="([^"]+)"/.exec(attrs);
          const t = tMatch ? tMatch[1] : null;
          const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner2);
          if (vMatch) {
            const raw = vMatch[1];
            let val;
            if (t === 's') val = sharedStrings[parseInt(raw, 10)];
            else if (t === 'str' || t === 'b') val = raw;
            else val = raw;
            celdas[colLetter + rowNum] = val;
          }
        }
      }
      porSheet[sheetName] = celdas;
    }
    links[idx] = porSheet;
  });
  return links;
}

// Resuelve una fórmula intentando encontrar el valor en:
//   1) Otro sheet del mismo xlsm (ref interna): Ens.Fisicos!$C$5
//   2) externalLinks cacheados: [1]Ens.Fisicos!$C$5
//   3) Fórmulas envueltas en IFERROR(...) — probar cada rama
//   4) Fallback: cualquier referencia embedida
//   5) Recursivo: si la celda referenciada TAMBIÉN es fórmula sin valor,
//      seguir la cadena.
function resolverFormula(formula, allSheets, externalLinks, visited) {
  if (!formula) return null;
  visited = visited || new Set();
  let f = String(formula).trim();
  if (f.startsWith('=')) f = f.slice(1);

  // IFERROR(a, b) — probar a, si falla probar b.
  const mIfErr = f.match(/^IFERROR\s*\(\s*(.+?)\s*,\s*(.+?)\s*\)\s*$/i);
  if (mIfErr) {
    const a = resolverFormula(mIfErr[1], allSheets, externalLinks, visited);
    if (a != null) return a;
    const b = resolverFormula(mIfErr[2], allSheets, externalLinks, visited);
    if (b != null) return b;
    return null;
  }

  // Buscar cualquier referencia [N]Sheet!Cxx o Sheet!Cxx dentro de la fórmula.
  const rxRefs = /(?:\[(\d+)\])?(?:'([^']+)'|([A-Za-z_][\w.]*))!\$?([A-Z]+)\$?(\d+)/g;
  const refs = [];
  let m;
  while ((m = rxRefs.exec(f)) !== null) {
    const sheet = m[2] || m[3];
    refs.push({ idx: m[1] ? parseInt(m[1], 10) : null, sheet, col: m[4], row: parseInt(m[5], 10) });
  }
  for (const r of refs) {
    // Externa cacheada
    if (r.idx != null) {
      const link = externalLinks[r.idx];
      if (link && link[r.sheet]) {
        const v = link[r.sheet][r.col + r.row];
        if (v != null) return v;
      }
      continue;
    }
    // Interna: primero valor directo, si null recurrir a fórmula anidada.
    const sheet = allSheets[r.sheet];
    if (!sheet) continue;
    if (sheet.filas && sheet.filas[r.row]) {
      const v = sheet.filas[r.row][r.col];
      if (v != null) return v;
    }
    // Fórmula anidada — evitar loops con visited.
    const key = r.sheet + '!' + r.col + r.row;
    if (visited.has(key)) continue;
    visited.add(key);
    if (sheet.formulas && sheet.formulas[r.row] && sheet.formulas[r.row][r.col]) {
      const nested = sheet.formulas[r.row][r.col];
      const resolved = resolverFormula(nested.body, allSheets, externalLinks, visited);
      if (resolved != null) return resolved;
    }
  }
  return null;
}

// Recalcula el .xlsm con Excel COM (Windows) si está disponible. Así los
// `<v>` cacheados reflejan los últimos valores de las fórmulas — como si el
// usuario hubiera abierto el archivo y guardado. Fallback silencioso: si
// Excel no está o falla, se sigue con el buffer original.
function _preRecalc(buf, nombre) {
  try {
    const { recalcularSiPosible } = require('./excel-recalc');
    return recalcularSiPosible(buf, nombre);
  } catch (e) {
    console.warn('[as400] pre-recalc no disponible:', e.message);
    return buf;
  }
}

function leerInformeDesdeBuffer(buf, nombreArchivo) {
  const nombre = nombreArchivo || 'in-memory.xlsm';
  const bufRecalc = _preRecalc(buf, nombre);
  return _leerInformeInterno(bufRecalc, nombre);
}

function leerInforme(rutaXlsm) {
  const buf = fs.readFileSync(rutaXlsm);
  const nombre = require('path').basename(rutaXlsm);
  const bufRecalc = _preRecalc(buf, nombre);
  return _leerInformeInterno(bufRecalc, rutaXlsm);
}

function _leerInformeInterno(buf, rutaOrNombre) {
  const zip = new PizZip(buf);
  const workbookXml = zip.files['xl/workbook.xml'].asText();
  const ssEntry = zip.files['xl/sharedStrings.xml'];
  const sharedStrings = ssEntry ? parseSharedStrings(ssEntry.asText()) : [];

  // Encontrar el sheet AS400 y DATOS SOLICITUD por nombre → r:id → target del rels.
  const sheetRe = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g;
  const sheetsByName = {};
  let ms;
  while ((ms = sheetRe.exec(workbookXml))) sheetsByName[ms[1]] = ms[2];

  const relsXml = zip.files['xl/_rels/workbook.xml.rels'].asText();
  const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
  const relById = {};
  let mrel;
  while ((mrel = relRe.exec(relsXml))) relById[mrel[1]] = mrel[2];

  const warnings = [];
  function loadSheet(name) {
    const rid = sheetsByName[name];
    if (!rid) return null;
    const target = relById[rid];
    if (!target) return null;
    const filePath = 'xl/' + target.replace(/^\/?/, '');
    const entry = zip.files[filePath];
    if (!entry) return null;
    return parseSheet(entry.asText(), sharedStrings, warnings);
  }

  // Cargamos TODOS los sheets primero para poder resolver referencias internas
  // (fórmulas tipo ='Ens.Fisicos'!C5 sin valor cacheado en <v>).
  const allSheets = {};
  Object.keys(sheetsByName).forEach(name => {
    const s = loadSheet(name);
    if (s) allSheets[name] = s;
  });
  // NO resolver fórmulas por vías alternativas. El procedimiento manual del
  // AS400 es "PEGAR VALORES": copiar sólo lo visible en pantalla. Si Excel
  // recalculó y no cacheó <v>, el resultado en pantalla es vacío → dejamos
  // la celda vacía. Resolver la fórmula por referencia (ej. `IF(X=0,"",X)` →
  // trae X ignorando el IF) introducía valores fantasma que el técnico no ve.
  const as400 = allSheets['AS400'] || { filas: {}, formulas: {} };

  const as400Rows = as400.filas || {};
  const datosRows = (allSheets['DATOS SOLICITUD'] || { filas: {} }).filas;

  // Column C de AS400 rows 1..59.
  const colC = {};
  for (let r = 1; r <= 59; r++) {
    colC[r] = as400Rows[r] ? as400Rows[r]['C'] : null;
  }

  // Datos de solicitud: label en col B, valor en col C.
  let codigo = '', otNum = '', ocNum = '', tratam = '';
  for (const rNum of Object.keys(datosRows)) {
    const row = datosRows[rNum];
    const label = norm(row['B']);
    const val = row['C'];
    if (!label || val == null) continue;
    if (label.startsWith('CODIGO'))              codigo = String(val).trim();
    else if (label.startsWith('NUMERO DE OT'))   otNum  = String(val).trim();
    else if (label.startsWith('ORDEN DE COMPRA')) ocNum = String(val).trim();
    else if (label.startsWith('TRATAMIENTO TERMICO')) tratam = String(val).trim();
  }

  return { path: rutaOrNombre, col_c: colC, codigo, ot: otNum, oc: ocNum, tratam, warnings };
}

// Fila 31 = Temperatura de ensayo Charpy. La celda del excel fuente suele
// tener un formato numérico personalizado ("0°"), así que el valor bruto es
// un número (-46) sin el símbolo. Al copiarlo al AS400 (que espera texto),
// se pierde el símbolo. Este set marca las filas donde queremos agregar el
// sufijo `°` cuando el valor es numérico.
const FILAS_TEMPERATURA = new Set([31]);

// ─── Transformación de valores ──────────────────────────────────────────────
function transformarValor(rowSrc, valor) {
  // R57: Origen MB. Si viene vacío/"-", default "L".
  if (rowSrc === 57) {
    const o = abreviarOrigen(valor);
    return o || 'L';
  }
  if (esValorNulo(valor)) return '';
  // RECHAZADO → siempre vacío (aplica a cualquier fila, incluye plegado).
  if (esRechazado(valor)) return '';
  // Temperatura: si es numérica (posiblemente con formato "0°" en el fuente),
  // agregar el símbolo ° al final. Si ya viene con ° en el valor, se preserva.
  if (FILAS_TEMPERATURA.has(rowSrc)) {
    const s = String(valor).trim();
    if (s.includes('°')) return s;
    // ¿Es un número puro? Si sí, agregar ° al final.
    const n = Number(s.replace(',', '.'));
    if (!isNaN(n)) return `${s}°`;
    return s;
  }
  // 0/0.00 en filas numéricas → vacío.
  if (FILAS_NUMERICAS.has(rowSrc) && esValorDescartable(valor)) return '';
  // Filas numéricas normales: redondeo al más cercano a 2 dec.
  if (FILAS_NUMERICAS.has(rowSrc)) {
    const s = String(valor).trim().replace(',', '.');
    const n = Number(s);
    if (isNaN(n)) return valor;
    return roundA2Dec(n);
  }
  return valor;
}

// ─── Escritura en la plantilla ──────────────────────────────────────────────
// Reemplaza el valor de una celda dentro del XML del sheet. Si la celda existe,
// sustituye su bloque; si no, la agrega dentro del <row>. Todas las celdas se
// escriben como `<c r="Cxx" t="inlineStr" quotePrefix="1"><is><t xml:space="preserve">V</t></is></c>`
// para respetar el "número almacenado como texto" que espera Cintolo.
function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function celdaInline(ref, valor, styleAttrs) {
  const st = styleAttrs || '';
  const v = valor === '' || valor == null ? '' : escXml(String(valor));
  if (v === '') {
    return `<c r="${ref}"${st}/>`;
  }
  return `<c r="${ref}" t="inlineStr"${st} quotePrefix="1"><is><t xml:space="preserve">${v}</t></is></c>`;
}

function reemplazarCelda(sheetXml, ref, valor) {
  const escRef = ref;
  const rowNum = ref.replace(/^[A-Z]+/, '');
  // Self-closing: <c r="Cxx" .../>
  const reSc  = new RegExp(`<c\\b[^>]*\\br="${escRef}"[^>]*/>`, 'g');
  // Con contenido: <c r="Cxx" ...>...</c>. IMPORTANTE: el último char antes de
  // `>` del tag de apertura NO debe ser `/` (para no matchear self-closing +
  // celda siguiente por accidente).
  const reCon = new RegExp(`<c\\b[^>]*\\br="${escRef}"[^>]*[^/]>[\\s\\S]*?<\\/c>`, 'g');

  // Si el valor es vacío y la celda NO existe, no agregamos nada — evita crear
  // rows fantasma al final del <sheetData> cuando se limpian bloques sobrantes.
  const esVacio = (valor === '' || valor == null);

  // Preservar el atributo s="..." (estilo) si existe.
  let styleAttr = '';
  const mSc = new RegExp(`<c\\b([^>]*)\\br="${escRef}"([^>]*)/>`).exec(sheetXml);
  const mCon = mSc ? null : new RegExp(`<c\\b([^>]*)\\br="${escRef}"([^>]*)[^/]>`).exec(sheetXml);
  const m = mSc || mCon;
  if (m) {
    const attrs = (m[1] || '') + ' ' + (m[2] || '');
    const sMatch = attrs.match(/\bs="([^"]+)"/);
    if (sMatch) styleAttr = ` s="${sMatch[1]}"`;
  }
  const nueva = celdaInline(ref, valor, styleAttr);

  let done = false;
  // Probar primero self-closing (patrón más estricto).
  let out = sheetXml.replace(reSc, () => { done = true; return nueva; });
  if (!done) out = out.replace(reCon, () => { done = true; return nueva; });
  if (!done) {
    if (esVacio) return out;  // no crear celda ni fila para valor vacío
    // La celda no existía en el sheet — insertarla dentro del <row r="...">.
    const rowRe = new RegExp(`(<row\\b[^>]*\\br="${rowNum}"[^>]*>)`);
    if (rowRe.test(out)) {
      out = out.replace(rowRe, `$1${nueva}`);
    } else {
      // Row tampoco existe: la insertamos en orden dentro del <sheetData>
      // (justo antes del primer <row> con r > rowNum).
      const rn = parseInt(rowNum, 10);
      const rows = [...out.matchAll(/<row\b[^>]*\br="(\d+)"/g)];
      let insertAt = null;
      for (const rm of rows) {
        if (parseInt(rm[1], 10) > rn) { insertAt = rm.index; break; }
      }
      const nuevaFila = `<row r="${rowNum}">${nueva}</row>`;
      if (insertAt != null) {
        out = out.slice(0, insertAt) + nuevaFila + out.slice(insertAt);
      } else {
        out = out.replace('</sheetData>', `${nuevaFila}</sheetData>`);
      }
    }
  }
  return out;
}

// Vacía un rango de filas (borra las filas completas del XML). Cuando no hay
// informe para este bloque, la plantilla no debe mostrar labels ni color de
// fondo: eliminamos las <row> completas, así Excel muestra celdas 100% vacías
// sin formato residual.
function limpiarBloque(sheetXml, baseRow) {
  let out = sheetXml;
  const rowRe = new RegExp(
    `<row\\b[^>]*\\br="(?:${Array.from({length: ROWS_PER_BLOCK}, (_, i) => baseRow + i).join('|')})"[^>]*>[\\s\\S]*?</row>`,
    'g'
  );
  out = out.replace(rowRe, '');
  return out;
}

function llenarBloque(sheetXml, baseRow, informe) {
  let out = sheetXml;
  const src = informe.col_c;
  const advertenciasAlargamiento = [];

  // Filas 1..57: copia con transformaciones.
  for (let r = 1; r <= 57; r++) {
    const raw = src[r];
    const transformado = transformarValor(r, raw);
    let escritura;
    if (transformado === '' || transformado == null) {
      escritura = '';
    } else if (FILAS_NUMERICAS.has(r) && typeof transformado === 'number') {
      // MPa → entero. Resto → 2 decimales con coma.
      escritura = numeroATexto(transformado, FILAS_MPA.has(r));
    } else {
      escritura = String(transformado);
    }
    // Filas 16 y 27 = MB/MA Alargamiento (%). Si el valor final tiene 2+
    // decimales (ej. "12,34"), suele indicar un dato mal cargado en el fuente
    // que hay que revisar manualmente. Registramos advertencia.
    if ((r === 16 || r === 27) && typeof escritura === 'string' && /,\d{2,}/.test(escritura)) {
      advertenciasAlargamiento.push({
        fila: r,
        campo: r === 16 ? 'MB Alargamiento (%)' : 'MA Alargamiento (%)',
        valor: escritura,
      });
    }
    out = reemplazarCelda(out, 'C' + (baseRow + r - 1), escritura);
  }

  // R2: código (siempre desde DATOS SOLICITUD si viene).
  if (informe.codigo) out = reemplazarCelda(out, 'C' + (baseRow + 1), informe.codigo);
  // R3: OT físico (si vacío en fuente).
  if (esValorNulo(src[3]) && informe.ot) out = reemplazarCelda(out, 'C' + (baseRow + 2), informe.ot);
  // R5: O/C.
  if (esValorNulo(src[5]) && informe.oc) {
    const n = parseInt(informe.oc, 10);
    out = reemplazarCelda(out, 'C' + (baseRow + 4), isNaN(n) ? informe.oc : n);
  }
  // R58: Origen soldadura — vacío por default.
  out = reemplazarCelda(out, 'C' + (baseRow + 57), '');
  // R59: Tratamiento térmico abreviado.
  const tratamRaw = src[58] || informe.tratam || '';
  out = reemplazarCelda(out, 'C' + (baseRow + 58), abreviarTratamiento(tratamRaw));
  // R60: LABORATORIO (default LABTESA).
  const lab = src[59] || 'LABTESA';
  out = reemplazarCelda(out, 'C' + (baseRow + 59), lab);

  return { xml: out, advertenciasAlargamiento };
}

// ─── Orquestador principal ──────────────────────────────────────────────────
// opciones:
//   plantillaPath     — ruta al .xlsx base
//   informesXlsm      — array de rutas a .xlsm fuente
//   informesBuffers   — array de { buffer, name } (alternativa a informesXlsm; los datos se leen en memoria)
//   carpetaSalida     — carpeta destino (default CARPETA_SALIDA_DEFAULT)
//   filename          — nombre forzado (opcional; default OC XXXX - YYYY - ....xlsx)
//   overwrite         — 'sobreescribir' | 'renombrar' | undefined
//     undefined: si existe destino, lanza error con { code: 'DESTINO_EXISTE', destino }
//     sobreescribir: borra y sobrescribe
//     renombrar: agrega sufijo (2), (3), ...
//   dryRun            — true → no escribe archivo; solo devuelve { ruta, existe }
// Cache in-memory del último buffer generado + informesData. Se usa cuando el
// usuario reintenta con "renombrar" o "sobreescribir" tras un conflicto
// DESTINO_EXISTE — no queremos rehacer el recálculo con Excel COM (~7s).
// Key = hash SHA-256 de los buffers de entrada + plantilla path.
// TTL: 5 minutos. Cache map con máximo 5 entries (LRU simple).
const _cacheBuffers = new Map();
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 5;
function _cacheKey(bufsIn, plantillaPath) {
  const h = require('crypto').createHash('sha256');
  h.update(String(plantillaPath || ''));
  bufsIn.forEach(b => { h.update(b); h.update('|'); });
  return h.digest('hex');
}
function _cacheGet(key) {
  const e = _cacheBuffers.get(key);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) {
    _cacheBuffers.delete(key);
    return null;
  }
  return e;
}
function _cacheSet(key, val) {
  // LRU rudimentario: si excede, borrar la entrada más vieja.
  if (_cacheBuffers.size >= CACHE_MAX_ENTRIES) {
    const first = _cacheBuffers.keys().next().value;
    if (first) _cacheBuffers.delete(first);
  }
  _cacheBuffers.set(key, { ...val, at: Date.now() });
}

function generarAS400({ plantillaPath, informesXlsm, informesBuffers, carpetaSalida, filename, overwrite, dryRun }) {
  if (!plantillaPath || !fs.existsSync(plantillaPath)) {
    throw new Error('Plantilla no encontrada: ' + plantillaPath);
  }
  const totalIn = (Array.isArray(informesXlsm) ? informesXlsm.length : 0) +
                  (Array.isArray(informesBuffers) ? informesBuffers.length : 0);
  if (totalIn === 0) throw new Error('No se recibieron informes .xlsm');
  if (totalIn > MAX_BLOCKS) {
    throw new Error(`Máximo ${MAX_BLOCKS} informes (recibidos: ${totalIn})`);
  }

  // Calcular key del cache: sha256 de todos los buffers de entrada + plantilla.
  // Si tenemos rutas, leemos los archivos primero.
  const bufsInList = [];
  (informesXlsm || []).forEach(p => bufsInList.push(fs.readFileSync(p)));
  (informesBuffers || []).forEach(b => bufsInList.push(b.buffer));
  const cacheKey = _cacheKey(bufsInList, plantillaPath);
  const cached = _cacheGet(cacheKey);
  if (cached) {
    console.log(`[as400] cache HIT — saltando recalc (ahorro ~${cached.tiempoMs || 5000}ms)`);
    return _escribirBufferGenerado({
      buf: cached.buf, informesData: cached.informesData,
      carpetaSalida, filename: filename || cached.nombreFinal,
      overwrite, dryRun,
    });
  }

  const zip = new PizZip(fs.readFileSync(plantillaPath));
  const sheetPath = 'xl/worksheets/sheet1.xml';
  const sheetEntry = zip.files[sheetPath];
  if (!sheetEntry) throw new Error('No se encontró sheet1.xml en la plantilla');
  let sheetXml = sheetEntry.asText();

  const informesData = [];
  const informesFuente = [];
  (informesXlsm || []).forEach(p => informesFuente.push({ path: p }));
  (informesBuffers || []).forEach(b => informesFuente.push({ buffer: b.buffer, name: b.name || 'in-memory.xlsm' }));

  // ── OPTIMIZACIÓN: recalcular TODOS los .xlsm en una sola sesión de Excel ──
  // Antes: abrir Excel + procesar + cerrar por cada archivo (~7s c/u).
  // Ahora: abrir Excel una vez, procesar los N archivos, cerrar. Ahorra ~5s
  // por archivo adicional. Para 3 archivos: ~21s → ~9s.
  const { recalcularVariosSiPosible } = require('./excel-recalc');
  const t0Batch = Date.now();
  const itemsRecalc = informesFuente.map((src, i) => {
    if (src.buffer) return { buffer: src.buffer, name: src.name || `in-memory-${i+1}.xlsm` };
    // Para rutas, leer el archivo a buffer para poder procesar todos juntos.
    return { buffer: fs.readFileSync(src.path), name: require('path').basename(src.path) };
  });
  const itemsRecalculados = recalcularVariosSiPosible(itemsRecalc);
  console.log(`[as400] recalc batch: ${itemsRecalculados.length} archivos en ${Date.now() - t0Batch}ms`);

  itemsRecalculados.forEach((item, i) => {
    // Ya vienen recalculados — el parser no necesita re-invocar Excel.
    const inf = _leerInformeInterno(item.buffer, item.name);
    informesData.push(inf);
    if (Array.isArray(inf.warnings) && inf.warnings.length > 0) {
      console.warn(`[as400] ${item.name}: ${inf.warnings.length} celda(s) con fórmula externa sin valor cacheado:`);
      inf.warnings.forEach(w => console.warn(`  · ${w}`));
    }
    const base = i * ROWS_PER_BLOCK + 1;
    const { xml, advertenciasAlargamiento } = llenarBloque(sheetXml, base, inf);
    sheetXml = xml;
    inf.bloque = i + 1;
    inf.advertenciasAlargamiento = advertenciasAlargamiento;
  });

  // Limpiar bloques sobrantes.
  for (let i = informesFuente.length; i < MAX_BLOCKS; i++) {
    const base = i * ROWS_PER_BLOCK + 1;
    sheetXml = limpiarBloque(sheetXml, base);
  }

  zip.file(sheetPath, sheetXml);
  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  // Filename base: "OC 34404 - 34624 - ....xlsx"
  const ocs = informesData.map(d => String(d.oc || '').split('.')[0]).filter(Boolean);
  const nombreDefault = ocs.length ? 'OC ' + ocs.join(' - ') + '.xlsx' : 'AS400_generado.xlsx';

  // Guardar en cache antes de escribir a disco — así el retry con "renombrar"
  // o "sobreescribir" reutiliza el buffer sin re-recalcular con Excel.
  _cacheSet(cacheKey, { buf, informesData, nombreFinal: nombreDefault });

  return _escribirBufferGenerado({
    buf, informesData,
    carpetaSalida,
    filename: filename || nombreDefault,
    overwrite, dryRun,
  });
}

// Escribe el buffer generado a disco resolviendo conflictos (existe →
// sobreescribir/renombrar/DESTINO_EXISTE). Se usa tanto desde el flujo normal
// como desde el cache HIT (retry post-conflicto).
function _escribirBufferGenerado({ buf, informesData, carpetaSalida, filename, overwrite, dryRun }) {
  const nombreFinal = filename;
  const carpeta = carpetaSalida || CARPETA_SALIDA_DEFAULT;
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
  let destino = path.join(carpeta, nombreFinal);
  const existe = fs.existsSync(destino);
  if (existe) {
    if (overwrite === 'renombrar') {
      const ext = path.extname(nombreFinal);
      const stem = nombreFinal.slice(0, -ext.length);
      let i = 2;
      while (fs.existsSync(path.join(carpeta, `${stem} (${i})${ext}`))) i++;
      destino = path.join(carpeta, `${stem} (${i})${ext}`);
    } else if (overwrite !== 'sobreescribir') {
      const err = new Error('El archivo destino ya existe: ' + destino);
      err.code = 'DESTINO_EXISTE';
      err.destino = destino;
      err.filenameFinal = nombreFinal;
      throw err;
    }
  }
  if (dryRun) return { ruta: destino, informes: informesData, existe, dryRun: true };
  fs.writeFileSync(destino, buf);
  return { ruta: destino, informes: informesData, existe };
}

module.exports = {
  generarAS400,
  leerInforme,
  leerInformeDesdeBuffer,
  transformarValor,
  abreviarTratamiento,
  abreviarOrigen,
  CARPETA_SALIDA_DEFAULT,
  MAX_BLOCKS,
  FILAS_MPA,
  FILAS_NUMERICAS,
};
