// Sistema de versionado de informes.
// Convención acordada con el laboratorio:
//   - Versión 1 (original): filename sin sufijo, encabezado sin "/X".
//   - Versión N > 1: filename "<base>-N.docx", encabezado "/N".
// Cuando se emite una versión nueva, la anterior se MUEVE (mantiene su nombre)
// a la subcarpeta "SUPERADO/" dentro de la misma SOL.
// Se dispara SOLO cuando el usuario decide emitir una nueva versión de un
// informe ya emitido (típicamente por pedido de modificación del cliente).

const fs = require('fs');
const path = require('path');
const db = require('../db');

// Retorna el registro del informe emitido más reciente NO superado de la OT.
// Defensivo: si la tabla no tiene aún las columnas de versionado (DB vieja
// pre-migración), retorna null en vez de romper todo el flujo de emisión.
function informeVigente(nro_ot) {
  try {
    return db.prepare(
      'SELECT * FROM informes_emitidos WHERE nro_ot = ? AND (superado IS NULL OR superado = 0) ORDER BY version DESC, id DESC LIMIT 1'
    ).get(nro_ot);
  } catch (e) {
    console.warn('[versionado] informeVigente:', e.message);
    return null;
  }
}

// Cuenta total de informes emitidos para la OT (incluye superados).
function contarEmitidos(nro_ot) {
  try {
    const row = db.prepare('SELECT COUNT(*) as n FROM informes_emitidos WHERE nro_ot = ?').get(nro_ot);
    return row ? row.n : 0;
  } catch (e) { return 0; }
}

// Aplica sufijo de versión al filename base: "Foo.docx" + version=2 → "Foo-2.docx".
function filenameConVersion(filenameBase, version) {
  if (!version || version <= 1) return filenameBase;
  const ext = path.extname(filenameBase);
  const stem = filenameBase.slice(0, filenameBase.length - ext.length);
  return `${stem}-${version}${ext}`;
}

// Mueve el archivo vigente anterior a la carpeta SUPERADO/ (mantiene el nombre).
// Retorna la nueva ruta o null si no había archivo físico que mover.
function moverASuperado(rutaAnterior) {
  if (!rutaAnterior || !fs.existsSync(rutaAnterior)) return null;
  const dir = path.dirname(rutaAnterior);
  const nombre = path.basename(rutaAnterior);
  const superadoDir = path.join(dir, 'SUPERADO');
  if (!fs.existsSync(superadoDir)) fs.mkdirSync(superadoDir, { recursive: true });
  let destino = path.join(superadoDir, nombre);
  // Si por alguna razón ya existe un archivo con ese nombre en SUPERADO
  // (ej. dos emisiones con mismo nombre), agregamos un sufijo (2), (3), ...
  if (fs.existsSync(destino)) {
    const ext = path.extname(nombre);
    const stem = nombre.slice(0, nombre.length - ext.length);
    let i = 2;
    while (fs.existsSync(path.join(superadoDir, `${stem} (${i})${ext}`))) i++;
    destino = path.join(superadoDir, `${stem} (${i})${ext}`);
  }
  fs.renameSync(rutaAnterior, destino);
  return destino;
}

// Marca en DB al informe vigente como superado por otro.
function marcarSuperadoEnDB(idVigente, idNuevo, rutaNueva) {
  db.prepare(`
    UPDATE informes_emitidos
    SET superado = 1, superado_por_id = ?, superado_en = datetime('now'), ruta = ?
    WHERE id = ?
  `).run(idNuevo, rutaNueva, idVigente);
}

// Retorna { version_a_emitir, filename, vigente } con toda la info para emitir la próxima versión.
// No modifica nada, sólo calcula.
function planEmision({ nro_ot, filenameBase }) {
  const vigente = informeVigente(nro_ot);
  const emitidos = contarEmitidos(nro_ot);
  // Si nunca se emitió: v1, sin sufijo.
  // Si hay uno vigente: v = (max version) + 1, con sufijo.
  const version_a_emitir = vigente ? (vigente.version || 1) + 1 : (emitidos === 0 ? 1 : emitidos + 1);
  return {
    version_a_emitir,
    filename: filenameConVersion(filenameBase, version_a_emitir),
    vigente,
  };
}

module.exports = {
  informeVigente,
  contarEmitidos,
  filenameConVersion,
  moverASuperado,
  marcarSuperadoEnDB,
  planEmision,
};
