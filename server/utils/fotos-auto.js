'use strict';
// Busca fotos de recepción para una OT en el drive:
//   G:\METALMECANICA\FOTOS\CLIENTES 2026\<CLIENTE>\SOL <nro> [fecha]\
//   G:\METALMECANICA\FOTOS\CLIENTES 2026\<CLIENTE>\SOL <nro>...\OT <nro>\
//
// Estrategia:
//   1. Fuzzy match del cliente (reusa el algoritmo de guardar-en-drive).
//   2. Encontrar la subcarpeta que empiece con "SOL <numero>" (ignora padding).
//   3. Si hay subcarpeta interna con "OT <nro>" o similar → priorizar esa.
//      Sino → usar las fotos directas de la carpeta de la solicitud.
//   4. Devolver rutas absolutas de todos los archivos de imagen (jpg/jpeg/png/webp).

const fs = require('fs');
const path = require('path');
const { buscarCarpetaCliente } = require('./guardar-en-drive');

// Candidatos de raíz — el servicio Windows no ve drives mapeados de sesión
// (G:), así que se prueba primero la ruta UNC del share. Envvar puede
// forzar una ruta específica.
const CANDIDATOS_ROOT = [
  process.env.FOTOS_RECEPCION_ROOT,
  '\\\\192.168.1.200\\Labtesa1\\METALMECANICA\\FOTOS\\CLIENTES 2026',
  'G:\\METALMECANICA\\FOTOS\\CLIENTES 2026',
].filter(Boolean);

function resolveFotosRoot() {
  for (const p of CANDIDATOS_ROOT) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return CANDIDATOS_ROOT[0] || '';
}

const FOTOS_ROOT = resolveFotosRoot();

// Extensiones aceptadas. `.jfif` es el mismo bytecode que JPEG pero Windows lo
// nombra así cuando la foto viene de WhatsApp / cámaras / OneDrive. `.heic` es
// el formato nuevo de iPhone. Tiff/bmp aparecen esporádicamente en laboratorio.
const IMG_EXT_RE = /\.(jpe?g|jfif|png|webp|heic|heif|bmp|tiff?)$/i;
const IGNORAR_BASENAME_RE = /^(thumbs\.db|desktop\.ini|\.ds_store)$/i;
const IGNORAR_EXT_RE = /\.(tmp|db|xlsx?|doc[xm]?|pdf|txt|ini)$/i;

function esImagen(nombre) {
  if (!nombre || nombre.startsWith('~')) return false;
  if (IGNORAR_BASENAME_RE.test(nombre)) return false;
  if (IGNORAR_EXT_RE.test(nombre)) return false;
  return IMG_EXT_RE.test(nombre);
}

// Localiza la subcarpeta de solicitud dentro de la carpeta del cliente.
// Acepta patrones "SOL 12345", "SOL 00012 4-2-2026", "SOL-12345", etc.
// Compara por número entero (ignora padding).
function buscarCarpetaSolicitud(carpetaCliente, nroSol) {
  if (!carpetaCliente || !fs.existsSync(carpetaCliente)) return null;
  const nroSolInt = parseInt(String(nroSol || '').replace(/[^\d]/g, ''), 10);
  if (isNaN(nroSolInt)) return null;
  let hijos;
  try { hijos = fs.readdirSync(carpetaCliente, { withFileTypes: true }).filter(d => d.isDirectory()); }
  catch { return null; }
  for (const d of hijos) {
    const m = d.name.match(/^SOL[\s\-_]*0*(\d+)\b/i);
    if (m && parseInt(m[1], 10) === nroSolInt) {
      return path.join(carpetaCliente, d.name);
    }
  }
  return null;
}

// Si dentro de la carpeta de solicitud hay una subcarpeta "OT <nro>",
// devolverla. Sino null.
function buscarSubcarpetaOt(carpetaSol, nroOt) {
  if (!carpetaSol || !fs.existsSync(carpetaSol)) return null;
  const nroOtInt = parseInt(String(nroOt || '').replace(/[^\d]/g, ''), 10);
  if (isNaN(nroOtInt)) return null;
  let hijos;
  try { hijos = fs.readdirSync(carpetaSol, { withFileTypes: true }).filter(d => d.isDirectory()); }
  catch { return null; }
  for (const d of hijos) {
    const m = d.name.match(/^OT[\s\-_]*0*(\d+)\b/i);
    if (m && parseInt(m[1], 10) === nroOtInt) {
      return path.join(carpetaSol, d.name);
    }
  }
  return null;
}

// Lista archivos de imagen dentro de una carpeta (no recursivo).
function listarImagenes(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isFile() && esImagen(d.name))
      .map(d => path.join(dir, d.name))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'es'));
  } catch { return []; }
}

// ── Walker recursivo con reglas de carpetas ────────────────────────────────
// Semántica de subcarpetas:
//   - SKIP completo: prefijo _ / ., o nombres como INGRESO, RECEPCION, DESCARTE,
//     RECHAZO, BORRADOR, TMP, TEMP, BACKUP (todo el subárbol se ignora).
//   - INFORMAR: si una carpeta contiene una subcarpeta "INFORMAR" (o "A INFORMAR",
//     "INCLUIR", "DEFINITIVAS"), se ignoran los archivos directos y las OTRAS
//     subcarpetas hermanas — solo cuenta lo que está dentro de INFORMAR.
//   - M<n> / MUESTRA <n>: propaga el número de muestra al contenido interno.
//     Un archivo dentro de MICROGRAFIAS/M2/INFORMAR/foto.jpg tiene muestra=2.
//   - Cualquier otra carpeta se recorre normal, arrastrando el contexto.
//
// Devuelve una lista plana de objetos:
//   { abs, relPath, muestra, folders }
// - abs        = path absoluto del archivo
// - relPath    = ruta relativa desde `root` (ej. "MICROGRAFIAS/M2/INFORMAR/foto.jpg")
// - muestra    = nº de muestra heredado de la carpeta ancestro M<n>, o null
// - folders    = array de nombres de carpetas ancestro (útil para el agente)
const SKIP_FOLDER_RE   = /^(_|\.)|^ingreso\b|^recepci[oó]n\b|^descarte\b|^rechazo\b|^borrador\b|^tmp\b|^temp\b|^backup\b|^papelera\b|^caducad|^viej/i;
const INFORMAR_DIR_RE  = /^(informar|a\s*informar|incluir|definitivas?)\s*$/i;
// Acepta: "M1", "M 1", "M-1", "M_1", "MUESTRA 1", "MUESTRA_1", "muestra1", etc.
const MUESTRA_DIR_RE   = /^(?:M|MUESTRA)[\s_\-]*(\d+)$/i;

function listarImagenesRecursivo(root) {
  const results = [];
  if (!root || !fs.existsSync(root)) return results;

  function walk(dir, ctx) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    // Filtrar subcarpetas ignoradas antes de decidir estrategia.
    const dirs = entries.filter(e => e.isDirectory() && !SKIP_FOLDER_RE.test(e.name));
    const files = entries.filter(e => e.isFile() && esImagen(e.name));
    // Regla INFORMAR: si hay subcarpeta que matchea, IGNORAR archivos directos
    // y las otras subcarpetas hermanas — solo bajamos en INFORMAR.
    const informarDir = dirs.find(d => INFORMAR_DIR_RE.test(d.name));
    if (informarDir) {
      const nextRel = ctx.rel ? ctx.rel + '/' + informarDir.name : informarDir.name;
      walk(path.join(dir, informarDir.name), {
        rel: nextRel, muestra: ctx.muestra, folders: ctx.folders.concat(informarDir.name),
      });
      return;
    }
    // Archivos directos
    for (const f of files) {
      results.push({
        abs: path.join(dir, f.name),
        relPath: ctx.rel ? ctx.rel + '/' + f.name : f.name,
        muestra: ctx.muestra,
        folders: ctx.folders.slice(),
      });
    }
    // Recurrimos en subcarpetas restantes.
    for (const d of dirs) {
      const mMuestra = d.name.match(MUESTRA_DIR_RE);
      const nextCtx = {
        rel: ctx.rel ? ctx.rel + '/' + d.name : d.name,
        muestra: mMuestra ? parseInt(mMuestra[1], 10) : ctx.muestra,
        folders: ctx.folders.concat(d.name),
      };
      walk(path.join(dir, d.name), nextCtx);
    }
  }

  walk(root, { rel: '', muestra: null, folders: [] });
  results.sort((a, b) => a.relPath.localeCompare(b.relPath, 'es'));
  return results;
}

// Búsqueda de cliente más tolerante: buscarCarpetaCliente exige score >= 0.6,
// pero los nombres de carpeta en FOTOS suelen tener typos, siglas o abreviaturas
// distintas al del trader. Bajamos el threshold usando un helper propio con
// puntajeMatch. Además, si algún token significativo de la RS matchea EXACTO
// con algún token de una carpeta, priorizarla aunque el score sea bajo.
const { puntajeMatch } = require('./guardar-en-drive');

// Busca en la tabla de alias primero. Si hay match exacto por razón social,
// devuelve la carpeta directamente sin fuzzy match. Es la forma de resolver
// casos donde el fuzzy nunca podría acertar (acrónimos, nombres cortos, typos).
function _buscarAlias(razonSocial, root) {
  try {
    const db = require('../db');
    const row = db.prepare('SELECT carpeta_drive FROM cliente_alias WHERE razon_social = ?').get(razonSocial);
    if (!row || !row.carpeta_drive) return null;
    const p = path.join(root, row.carpeta_drive);
    if (!fs.existsSync(p)) return null; // el alias apunta a una carpeta que ya no existe
    return p;
  } catch (_) { return null; }
}

function buscarCarpetaClienteTolerante(razonSocial, root) {
  if (!fs.existsSync(root)) return null;

  // 1) Chequear tabla de alias primero (match exacto por razón social).
  const aliasPath = _buscarAlias(razonSocial, root);
  if (aliasPath) {
    return {
      path: aliasPath,
      score: 1.0,
      candidatos: [{ nombre: path.basename(aliasPath), puntaje: 1.0, fuente: 'alias' }],
      todos: [{ nombre: path.basename(aliasPath), path: aliasPath, puntaje: 1.0, fuente: 'alias' }],
      via_alias: true,
    };
  }

  // 2) Fuzzy match tradicional.
  let hijos;
  try { hijos = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()); }
  catch { return null; }
  const candidatos = [];
  for (const d of hijos) {
    const p = puntajeMatch(razonSocial, d.name);
    if (p > 0.3) candidatos.push({ nombre: d.name, path: path.join(root, d.name), puntaje: p });
  }
  candidatos.sort((a, b) => b.puntaje - a.puntaje);
  // Threshold más bajo (0.35) que el default del helper (0.6) porque las
  // carpetas FOTOS suelen tener nombres abreviados.
  const mejor = candidatos[0] || { nombre: null, puntaje: 0 };
  if (mejor.nombre && mejor.puntaje >= 0.35) {
    return { path: mejor.path, score: mejor.puntaje, candidatos: candidatos.slice(0, 5), todos: candidatos };
  }
  return { path: null, score: mejor.puntaje, candidatos: candidatos.slice(0, 5), mejor: mejor.nombre, todos: candidatos };
}

// Extrae los números de muestra (Mn) mencionados en el id_muestra.
// Ejemplos:
//   "L1 1"– M1 y L1 1"– M2"     → [1, 2]
//   "COLADA N°21294 M3"          → [3]
//   "M1, M4"                      → [1, 4]
//   sin match                     → []
function extraerNumerosMuestra(idMuestra) {
  if (!idMuestra) return [];
  const s = String(idMuestra);
  const set = new Set();
  const re = /\bM\s*(\d+)\b/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n)) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

// Filtra archivos que corresponden a alguno de los números M dados.
// Nombres típicos: "M1.jpg", "M1(1).jpeg", "M1_algo.png", "M10.jpg".
// Match: nombre empieza con M<n> seguido de un no-dígito (para que M1 no
// tome M10, M11, etc). Case-insensitive.
function filtrarPorMuestras(archivos, numsM) {
  if (!numsM || numsM.length === 0) return archivos;
  const patrones = numsM.map(n => new RegExp('^M0*' + n + '(?![0-9])', 'i'));
  return archivos.filter(abs => {
    const base = path.basename(abs);
    return patrones.some(p => p.test(base));
  });
}

// Busca fotos para una OT. Devuelve:
//   { encontrada, root_ok, carpeta_cliente, carpeta_sol, carpeta_ot, archivos: [<absPath>] }
// Si viene `idMuestra` con menciones "M<n>", filtra archivos por esos números
// (evita que en una carpeta compartida por varias OTs de la misma solicitud se
// carguen fotos ajenas).
function buscarFotosOt(razonSocial, nroSolicitud, nroOt, idMuestra) {
  const rootOk = fs.existsSync(FOTOS_ROOT);
  const out = {
    encontrada: false,
    root_ok: rootOk,
    root: FOTOS_ROOT,
    razon_social_buscada: razonSocial,
    carpeta_cliente: null,
    cliente_score: 0,
    cliente_candidatos: [],
    carpeta_sol: null,
    carpeta_ot: null,
    archivos: [],
    debug: null,
  };
  if (!rootOk) { out.debug = 'root_no_existe'; return out; }
  const clienteMatch = buscarCarpetaClienteTolerante(razonSocial, FOTOS_ROOT);
  if (!clienteMatch || !clienteMatch.path) {
    out.debug = 'cliente_no_matcheado';
    out.cliente_candidatos = clienteMatch ? clienteMatch.candidatos : [];
    return out;
  }
  // Iterar por TODOS los candidatos de cliente (score alto → bajo) y quedarse
  // con el primero que TIENE la carpeta SOL de esta solicitud. Sin esto, si
  // hay 2 carpetas con nombres parecidos (ej. "S.A.S.A. SUELOS ARGENTINOS"
  // y "SUELOS ARGENTINOS S.A"), el fuzzy match puede elegir la que no tiene
  // la carpeta SOL correcta.
  const listaCandidatos = clienteMatch.todos || [{ nombre: null, path: clienteMatch.path, puntaje: clienteMatch.score }];
  let carpetaCliente = clienteMatch.path;
  let clienteScore = clienteMatch.score;
  let carpetaSol = null;
  let solsDisponibles = null;
  for (const cand of listaCandidatos) {
    if (!cand.path) continue;
    const sol = buscarCarpetaSolicitud(cand.path, nroSolicitud);
    if (sol) {
      carpetaCliente = cand.path;
      clienteScore = cand.puntaje;
      carpetaSol = sol;
      break;
    }
  }
  out.carpeta_cliente = carpetaCliente;
  out.cliente_score = clienteScore;
  out.cliente_candidatos = clienteMatch.candidatos;
  if (!carpetaSol) {
    out.debug = 'sol_no_encontrada';
    // Listar carpetas SOL disponibles en el candidato de mayor score (ayuda a debugear).
    try {
      solsDisponibles = fs.readdirSync(carpetaCliente, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^SOL\b/i.test(d.name))
        .map(d => d.name)
        .slice(0, 10);
      out.sols_disponibles = solsDisponibles;
    } catch {}
    return out;
  }
  out.carpeta_sol = carpetaSol;
  const carpetaOt = buscarSubcarpetaOt(carpetaSol, nroOt);
  const fuente = carpetaOt || carpetaSol;
  out.carpeta_ot = carpetaOt;
  // Recorrido recursivo con reglas de carpetas. Cada item viene con `abs`,
  // `relPath`, `muestra` (heredado de carpeta M<n> ancestro), y `folders`.
  const items = listarImagenesRecursivo(fuente);
  const todas = items.map(it => it.abs);
  // Filtro por muestra: si estamos en la SOL raíz (no subcarpeta OT) y el
  // id_muestra menciona M<n>, restringimos a esos números. Los items que ya
  // vienen taggeados con `muestra` desde una carpeta M<n> se prefieren.
  let imgs = todas;
  let itemsFinales = items;
  let numsMFiltro = null;
  if (!carpetaOt) {
    numsMFiltro = extraerNumerosMuestra(idMuestra);
    if (numsMFiltro.length > 0) {
      const setM = new Set(numsMFiltro);
      // Primero probamos filtro por tag de carpeta (muestra heredada del path).
      let filtradasPorTag = items.filter(it => it.muestra != null && setM.has(it.muestra));
      // Si NO hubo matches por carpeta, caemos al regex de basename M<n>.
      if (filtradasPorTag.length > 0) {
        itemsFinales = filtradasPorTag;
        imgs = filtradasPorTag.map(it => it.abs);
      } else {
        const filtradas = filtrarPorMuestras(todas, numsMFiltro);
        if (filtradas.length > 0) {
          imgs = filtradas;
          const absSet = new Set(filtradas);
          itemsFinales = items.filter(it => absSet.has(it.abs));
        }
      }
    }
  }
  out.archivos = imgs;
  out.archivos_sin_filtrar = todas;
  out.items = items;                    // { abs, relPath, muestra, folders }
  out.items_filtrados = itemsFinales;
  out.filtro_muestras = numsMFiltro;
  out.total_sin_filtrar = todas.length;
  out.encontrada = imgs.length > 0;
  if (!out.encontrada) out.debug = 'sol_sin_imagenes';
  return out;
}

// Genera un caption limpio para el Word a partir del filename del laboratorio.
// Reglas para el naming típico "IMAGEN Nº1 - MICROESTRUCTURA EN SUPERFICIE 100x.jpg":
//   - Quita extensión.
//   - Quita el prefijo "IMAGEN Nº<n> - " / "IMG <n> - " (y variantes con º/°/o).
//   - Convierte magnificación "100x" / "200x" en "(100X)" / "(200X)".
//   - Agrega espacio antes de "(" pegado: "grano(superficie)" → "grano (superficie)".
//   - Pasa todo a case tipo oración (primera mayúscula, resto minúsculas).
//   - Preserva mayúsculas en la magnificación y colapsa espacios sobrantes.
// Segundo argumento opcional `ctx = { muestra: N, folders: [...] }`:
//   Si el archivo viene de una subcarpeta M<n> ancestro, se prefija "M<n> —"
//   al caption. Útil cuando en una misma OT hay dos muestras (M1 + M2 en el
//   mismo nro_ot) y las fotos están organizadas por muestra en el drive.
function parseCaptionDeFilename(filename, ctx) {
  if (!filename) return '';
  let s = String(filename).replace(/\.[a-z0-9]{2,5}$/i, ''); // saca ext
  // Underscores → espacio (naming típico de cámaras/copias).
  s = s.replace(/_+/g, ' ');
  // Quita prefijo opcional "M<n> " si viene al inicio (no aporta al caption,
  // el prefijo lo agrega al final con formato "M<n> —" según ctx).
  s = s.replace(/^\s*M\s*\d+\s+/i, '');
  // Quita "IMAGEN Nº<n> - " o similares
  s = s.replace(/^\s*(?:IMAGEN|IMAGENES|IMÁGEN|IMG|FOTO|FOTOGRAFIA)\s*(?:N\s*[°ºo]?)?\s*\d+\s*[-–—:]?\s*/i, '');
  // Agrega espacio antes de "(" pegado a letra
  s = s.replace(/([\w\dñáéíóúü])\(/giu, '$1 (');
  // Colapsa whitespace múltiple
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return ctx && ctx.muestra != null ? ('M' + ctx.muestra) : '';
  // Sentence case: primera letra en mayúscula, resto en minúscula.
  s = s.toLowerCase();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  // Magnificación: "100x" → "(100X)". Puede haber quedado dentro/fuera de paréntesis.
  s = s.replace(/\((\d+)\s*x\)/g, '($1X)');
  s = s.replace(/(?<![\(\d])(\d+)\s*x\b/gi, '($1X)');
  // Colapsa dobles paréntesis "((100X))" → "(100X)".
  s = s.replace(/\(\((\d+X)\)\)/g, '($1)');
  s = s.replace(/\s+/g, ' ').trim();
  // Prefijo M<n> si el archivo viene de una subcarpeta M<n> ancestro y el
  // caption no lo menciona ya (evita "M1 — M1 superficie").
  if (ctx && ctx.muestra != null) {
    const yaMencionaM = new RegExp('\\bM\\s*0*' + ctx.muestra + '\\b', 'i').test(s);
    if (!yaMencionaM) s = 'M' + ctx.muestra + ' — ' + s;
  }
  return s;
}

module.exports = {
  buscarFotosOt, listarImagenes, listarImagenesRecursivo,
  FOTOS_ROOT, extraerNumerosMuestra, filtrarPorMuestras,
  parseCaptionDeFilename,
};
