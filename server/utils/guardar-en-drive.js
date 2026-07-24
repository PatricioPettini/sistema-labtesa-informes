// Guarda automáticamente el .docx generado en el drive del laboratorio:
//   G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA\<CLIENTE>\SOL <NRO>\<file>
//
// - Busca la carpeta del cliente por match fuzzy (tokens significativos).
// - Si no existe, crea una carpeta usando la razón social sanitizada.
// - Crea la subcarpeta `SOL xxxx` si no existe.
//
// Diseñado para no romper la generación si el drive no está disponible:
// todas las operaciones se envuelven en try/catch y solo devuelven la ruta
// resultante (o null si falló).

'use strict';
const fs = require('fs');
const path = require('path');

// Raíz configurable por entorno (.env). En dev (Desktop de Patricio) queda G:\...;
// en el servidor de producción hay que setear la letra local correcta.
const ROOT_DRIVE = process.env.DRIVE_INFORMES_ROOT
  || 'G:\\ADMINISTRACION\\INFORMES APOLO\\METALMECANICA';
// Cuando el informe es acreditado (todos los ensayos bajo OAA), las carpetas
// de cliente están agrupadas en la subcarpeta "1. OAA". Se usa como root
// alternativo del fuzzy match.
const ROOT_DRIVE_OAA = path.join(ROOT_DRIVE, '1. OAA');

// Palabras "de forma jurídica" o comunes que ignoramos al comparar.
const STOP_TOKENS = new Set([
  'S', 'SA', 'S.A.', 'S.A', 'SRL', 'S.R.L.', 'S.R.L', 'SAS', 'S.A.S.', 'S.A.S',
  'SCA', 'SCS', 'SH', 'S.H.', 'LTDA', 'LTDA.', 'LTD', 'INC', 'CO', 'CIA', 'CÍA',
  'SAIC', 'S.A.I.C', 'S.A.I.C.', 'SAICF', 'SACI', 'SACIF',
  'Y', 'E', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'A', 'AL',
]);

// Regex de formas jurídicas típicas: se remueven antes de tokenizar para
// evitar dejar letras sueltas residuales ("S.R.L." → "S R L" tras split).
const FORMAS_JURIDICAS_RE = /\b(S\s*\.?\s*R\s*\.?\s*L\s*\.?|S\s*\.?\s*A\s*\.?(?:\s*\.?\s*I?\s*\.?\s*C?\s*\.?\s*F?\s*\.?)?|S\s*\.?\s*A\s*\.?\s*S\s*\.?|SAIC(?:F)?|SACI(?:F)?|LTDA?\s*\.?|CIA\s*\.?)\b/gi;

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita acentos
    .toUpperCase()
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensSignificativos(s) {
  const norm = normalizar(s).replace(FORMAS_JURIDICAS_RE, ' ');
  return norm
    .split(/[\s.\-]+/)
    .map(t => t.trim())
    .filter(t =>
      t.length >= 3                          // descartar letras sueltas ("R", "L", "A", etc.)
      && !STOP_TOKENS.has(t.toUpperCase())
      && !/^\d+$/.test(t)
    );
}

// Puntaje de match entre razón social y nombre de carpeta.
// Solo acepta matches EXACTOS de token (case-insensitive, sin acentos).
// Prefijos parciales dan falsos positivos (ej. DUNLOP vs DU PONT).
//
// Regla principal: el PRIMER token significativo de la razón social es la
// MARCA (el distintivo). Si coincide con el primer token de la carpeta, casi
// seguro es la carpeta correcta — le damos bonus fuerte para que gane aunque
// otras carpetas compartan más tokens genéricos (HNOS, METALURGICA, etc.).
// Ejemplo: RS="CINTOLO HNOS METALURGICA SAIC" → CINTOLO gana sobre
// "METALURGICA BRUNO HNOS" (que sin bonus matchea 2 tokens genéricos).
function puntajeMatch(razonSocial, nombreCarpeta) {
  const tokensRS  = tokensSignificativos(razonSocial);
  const tokensCarpeta = tokensSignificativos(nombreCarpeta);
  if (tokensRS.length === 0 || tokensCarpeta.length === 0) return 0;
  const setCarpeta = new Set(tokensCarpeta);
  let matches = 0;
  for (const t of tokensRS) {
    if (setCarpeta.has(t)) matches++;
  }
  const ratio = matches / tokensRS.length;
  // Bonus FUERTE: el primer token de la RS coincide con el primer token de
  // la carpeta (mismo distintivo al inicio de ambos). +0.8 sobre el ratio
  // asegura que cualquier "CINTOLO" gane sobre otras carpetas con más
  // matches de palabras genéricas.
  const bonusPrimero = tokensRS[0] === tokensCarpeta[0] ? 0.8 : 0;
  // Bonus pequeño: el primer token de RS aparece en la carpeta (no en primer
  // lugar). Solo si no se activó el bonus fuerte.
  const bonusEnCarpeta = (bonusPrimero === 0 && setCarpeta.has(tokensRS[0])) ? 0.15 : 0;
  return ratio + bonusPrimero + bonusEnCarpeta;
}

// Overrides explícitos: si un token significativo de la razón social matchea
// con la clave, se fuerza el uso de la carpeta indicada (ignora fuzzy match).
// Útil cuando en el drive coexisten varias carpetas del mismo cliente y se
// quiere fijar cuál usar.
const CLIENT_FOLDER_OVERRIDE = {
  'SERSOL': 'SERSOL',
};

// Busca en el root indicado la carpeta del cliente que mejor matchee.
// Retorna { path, exact: boolean, score } o null si no hay match razonable (< 0.6).
function buscarCarpetaCliente(razonSocial, root) {
  const rootBase = root || ROOT_DRIVE;
  if (!fs.existsSync(rootBase)) return null;

  // Override: si algún token de la razón social está en CLIENT_FOLDER_OVERRIDE y
  // la carpeta destino existe físicamente, la usamos sin importar el fuzzy match.
  const tokensRS = tokensSignificativos(razonSocial);
  for (const t of tokensRS) {
    const forced = CLIENT_FOLDER_OVERRIDE[t];
    if (forced) {
      const forcedPath = path.join(rootBase, forced);
      if (fs.existsSync(forcedPath)) {
        return { path: forcedPath, exact: true, score: 1.0 };
      }
    }
  }

  let hijos;
  try { hijos = fs.readdirSync(rootBase, { withFileTypes: true }).filter(d => d.isDirectory()); }
  catch { return null; }
  let mejor = { nombre: null, puntaje: 0 };
  for (const d of hijos) {
    const p = puntajeMatch(razonSocial, d.name);
    if (p > mejor.puntaje) { mejor = { nombre: d.name, puntaje: p }; }
  }
  if (mejor.nombre && mejor.puntaje >= 0.6) {
    return { path: path.join(rootBase, mejor.nombre), exact: false, score: mejor.puntaje };
  }
  return null;
}

// Si `carpeta/filename` existe, agrega sufijo "-1", "-2", ... antes de la
// extensión hasta encontrar un nombre libre. Devuelve el path absoluto libre.
function obtenerNombreUnico(carpeta, filename) {
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  let candidato = path.join(carpeta, filename);
  let i = 1;
  while (fs.existsSync(candidato)) {
    candidato = path.join(carpeta, `${base}-${i}${ext}`);
    i++;
    if (i > 999) break; // seguridad
  }
  return candidato;
}

// Sanitiza para uso como nombre de carpeta Windows (quita caracteres inválidos).
function sanitizarNombreCarpeta(s) {
  return String(s || 'SIN NOMBRE')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'SIN NOMBRE';
}

// Clientes con convención de nombre de archivo custom: solo <nro_ot>.docx.
// Se compara por token principal (case-insensitive, sin acentos).
const FILENAME_CLIENT_CUSTOM = {
  'CINTOLO': (nroOt) => `${String(nroOt).replace(/^0+/, '') || nroOt}.docx`,
};

// Devuelve el filename ajustado si el cliente tiene convención especial.
// `carpetaClienteName` es el basename de la carpeta encontrada/creada.
function filenamePorCliente(carpetaClienteName, filenameDefault, nroOt) {
  const tokens = tokensSignificativos(carpetaClienteName);
  for (const clave of Object.keys(FILENAME_CLIENT_CUSTOM)) {
    if (tokens.includes(clave)) return FILENAME_CLIENT_CUSTOM[clave](nroOt);
  }
  return filenameDefault;
}

// Punto de entrada principal. Devuelve el path del archivo guardado o null.
// `nroOt` es opcional; se usa para clientes con nombre de archivo custom (Cintolo).
function guardarEnDrive(razonSocial, nroSolicitud, filename, buffer, nroOt) {
  if (!fs.existsSync(ROOT_DRIVE)) {
    console.warn('[drive] Raíz no disponible:', ROOT_DRIVE);
    return null;
  }
  try {
    // 1) Ubicar/crear carpeta del cliente
    let carpetaCliente = buscarCarpetaCliente(razonSocial);
    if (!carpetaCliente) {
      const nombre = sanitizarNombreCarpeta(razonSocial);
      const nueva = path.join(ROOT_DRIVE, nombre);
      fs.mkdirSync(nueva, { recursive: true });
      carpetaCliente = { path: nueva, exact: true, score: 1 };
      console.log('[drive] Creada carpeta cliente:', nueva);
    }
    // 2) Carpeta de solicitud `SOL xxxx`.
    //    El padding varía por cliente (5 o 7 dígitos). Buscamos si ya existe
    //    una carpeta `SOL <numero>` que coincida en número (ignorando padding);
    //    si no existe, creamos una con padding 5 (default).
    const nroSol = String(nroSolicitud || '').replace(/[^\d]/g, '') || '0';
    const nroSolInt = parseInt(nroSol, 10);
    let carpetaSol = null;
    try {
      const hijos = fs.readdirSync(carpetaCliente.path, { withFileTypes: true }).filter(d => d.isDirectory());
      const match = hijos.find(d => {
        const m = d.name.match(/^SOL\s+0*(\d+)$/i);
        return m && parseInt(m[1], 10) === nroSolInt;
      });
      if (match) carpetaSol = path.join(carpetaCliente.path, match.name);
    } catch {}
    if (!carpetaSol) {
      carpetaSol = path.join(carpetaCliente.path, `SOL ${nroSol.padStart(5, '0')}`);
      fs.mkdirSync(carpetaSol, { recursive: true });
      console.log('[drive] Creada carpeta solicitud:', carpetaSol);
    }
    // 3) Nombre de archivo — ajustar si el cliente tiene convención especial
    const carpetaClienteName = path.basename(carpetaCliente.path);
    const filenameFinal = filenamePorCliente(carpetaClienteName, filename, nroOt);
    // 4) Si ya existe, agregar sufijo (1), (2), ... antes de la extensión.
    const destino = obtenerNombreUnico(carpetaSol, filenameFinal);
    fs.writeFileSync(destino, buffer);
    console.log('[drive] Guardado:', destino);
    return destino;
  } catch (err) {
    console.warn('[drive] Error al guardar:', err.message);
    return null;
  }
}

// ── Nuevo flujo confirmado: separar detección de guardado ────────────────────

// Detecta la carpeta candidata para (cliente, solicitud) SIN escribir nada.
// Retorna `{ carpeta_cliente, carpeta_sol, filename, existe_cliente, existe_sol, score, root_drive }`
// donde:
//   - carpeta_cliente: path absoluto propuesto (existente por fuzzy match, o
//     path sanitizado a crear si no existe).
//   - carpeta_sol: path absoluto propuesto para SOL <nro> dentro del cliente.
//   - filename: nombre de archivo sugerido (respeta convención por cliente).
//   - existe_cliente / existe_sol: booleanos.
//   - score: puntaje del fuzzy match (0..1.15).
function detectarCarpeta(razonSocial, nroSolicitud, filenameDefault, nroOt, opts) {
  opts = opts || {};
  // Cuando el informe es acreditado (todos los ensayos bajo OAA), buscar en la
  // subcarpeta "1. OAA" del drive. Si no, usar el root principal.
  const rootBase = opts.acreditado ? ROOT_DRIVE_OAA : ROOT_DRIVE;
  const rootOk = fs.existsSync(rootBase);
  const nroSol = String(nroSolicitud || '').replace(/[^\d]/g, '') || '0';
  const nroSolInt = parseInt(nroSol, 10);

  let carpetaClientePath = null;
  let existeCliente = false;
  let score = 0;
  if (rootOk) {
    const match = buscarCarpetaCliente(razonSocial, rootBase);
    if (match) {
      carpetaClientePath = match.path;
      existeCliente = true;
      score = match.score || 0;
    }
  }
  if (!carpetaClientePath) {
    // No se encontró — proponer nombre sanitizado (aún no se crea).
    carpetaClientePath = path.join(rootBase, sanitizarNombreCarpeta(razonSocial));
  }

  // Buscar SOL existente (ignora padding y separadores). Acepta:
  //   "SOL 200", "SOL 00200", "SOL 0000200", "SOL-200", "SOL_00200",
  //   "SOL Nro 200", "SOLICITUD 200", etc.
  // Compara por número entero, así 00200 y 0000200 se consideran la misma.
  let carpetaSolPath = null;
  let existeSol = false;
  if (existeCliente) {
    try {
      const hijos = fs.readdirSync(carpetaClientePath, { withFileTypes: true }).filter(d => d.isDirectory());
      const solMatch = hijos.find(d => {
        // Aceptar cualquier carpeta que empiece con "SOL" seguido de separadores
        // opcionales y termine con dígitos (con o sin padding).
        const m = d.name.match(/^SOL[\s\-_]*(?:N[°º]?\s*|Nro\.?\s*|ICITUD\s+)?0*(\d+)\s*$/i);
        return m && parseInt(m[1], 10) === nroSolInt;
      });
      if (solMatch) {
        carpetaSolPath = path.join(carpetaClientePath, solMatch.name);
        existeSol = true;
      }
    } catch {}
  }
  if (!carpetaSolPath) {
    carpetaSolPath = path.join(carpetaClientePath, `SOL ${nroSol.padStart(5, '0')}`);
  }

  const filename = filenamePorCliente(path.basename(carpetaClientePath), filenameDefault, nroOt);

  return {
    carpeta_cliente: carpetaClientePath,
    carpeta_sol: carpetaSolPath,
    filename,
    existe_cliente: existeCliente,
    existe_sol: existeSol,
    score,
    root_drive: rootBase,
    root_ok: rootOk,
    acreditado: !!opts.acreditado,
  };
}

// Guarda un buffer en la carpeta especificada. Crea la carpeta si no existe.
// Devuelve el path absoluto donde se guardó (con sufijo (1)/(2) si hubo colisión).
function guardarEnCarpeta(carpetaAbs, filename, buffer) {
  if (!carpetaAbs) throw new Error('Carpeta destino requerida');
  const existiaAntes = fs.existsSync(carpetaAbs);
  fs.mkdirSync(carpetaAbs, { recursive: true });
  if (!existiaAntes) console.log('[drive] Carpeta creada:', carpetaAbs);
  const destino = obtenerNombreUnico(carpetaAbs, filename);
  fs.writeFileSync(destino, buffer);
  console.log('[drive] Guardado:', destino);
  return destino;
}

// Lista subcarpetas de un path. Restringe a carpetas dentro del drive raíz o de
// una unidad válida. Devuelve `[{ nombre, path }]` ordenadas alfabéticamente.
function listarSubcarpetas(dirAbs) {
  if (!dirAbs || !fs.existsSync(dirAbs)) return [];
  try {
    return fs.readdirSync(dirAbs, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ nombre: d.name, path: path.join(dirAbs, d.name) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  } catch {
    return [];
  }
}

module.exports = {
  guardarEnDrive,
  buscarCarpetaCliente,
  puntajeMatch,
  detectarCarpeta,
  guardarEnCarpeta,
  listarSubcarpetas,
  filenamePorCliente,
  obtenerNombreUnico,
  ROOT_DRIVE,
  ROOT_DRIVE_OAA,
};
