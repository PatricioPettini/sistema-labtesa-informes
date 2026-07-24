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

const IMG_EXT_RE = /\.(jpe?g|png|webp)$/i;
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

// Búsqueda de cliente más tolerante: buscarCarpetaCliente exige score >= 0.6,
// pero los nombres de carpeta en FOTOS suelen tener typos, siglas o abreviaturas
// distintas al del trader. Bajamos el threshold usando un helper propio con
// puntajeMatch. Además, si algún token significativo de la RS matchea EXACTO
// con algún token de una carpeta, priorizarla aunque el score sea bajo.
const { puntajeMatch } = require('./guardar-en-drive');

function buscarCarpetaClienteTolerante(razonSocial, root) {
  if (!fs.existsSync(root)) return null;
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
  const todas = listarImagenes(fuente);
  // Si la búsqueda usó la subcarpeta específica "OT <nro>", NO filtrar por
  // muestra (ya es la carpeta propia de la OT). Si usó la carpeta SOL (raíz,
  // compartida entre las OTs hermanas), sí filtrar por los M<n> del id_muestra.
  let imgs = todas;
  let numsMFiltro = null;
  if (!carpetaOt) {
    numsMFiltro = extraerNumerosMuestra(idMuestra);
    if (numsMFiltro.length > 0) {
      const filtradas = filtrarPorMuestras(todas, numsMFiltro);
      // Si el filtro deja 0 fotos, probablemente el naming no sigue el patrón
      // M<n> — mejor devolver todas que fallar en silencio.
      if (filtradas.length > 0) imgs = filtradas;
    }
  }
  out.archivos = imgs;
  out.filtro_muestras = numsMFiltro;
  out.total_sin_filtrar = todas.length;
  out.encontrada = imgs.length > 0;
  if (!out.encontrada) out.debug = 'sol_sin_imagenes';
  return out;
}

module.exports = { buscarFotosOt, listarImagenes, FOTOS_ROOT, extraerNumerosMuestra, filtrarPorMuestras };
