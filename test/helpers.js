// Helpers para snapshot tests.
// Cada test compara el SHA-256 del buffer .docx generado contra el hash guardado
// en test/__snapshots__/. Si el hash difiere, el test falla y muestra un mensaje
// con el comando para regenerar (UPDATE_SNAPSHOTS=1 npm test).
//
// El generator debe ser DETERMINISTA para que el test sirva: si algún template
// inyecta `new Date()`, se filtra vía `stripDynamic` antes de hashear.

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const SNAP_DIR = path.join(__dirname, '__snapshots__');
if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

const UPDATE = process.env.UPDATE_SNAPSHOTS === '1' || process.env.UPDATE_SNAPSHOTS === 'true';

// Extrae document.xml del docx y elimina campos que cambian entre corridas
// (fechas SAVEDATE cacheadas, timestamps embebidos, etc.) para que el hash
// sea estable. El resultado del strip es lo que se hashea.
function extraerXmlEstable(buffer) {
  const PizZip = require('pizzip');
  const zip = new PizZip(buffer);
  let xml = zip.files['word/document.xml']
    ? zip.files['word/document.xml'].asText()
    : '';
  // Sacar cualquier fecha DD/MM/YYYY (SAVEDATE cacheado) que refleja "hoy".
  xml = xml.replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, 'DD/MM/YYYY');
  // Sacar timestamps ISO (poco frecuentes en generators, pero por seguridad).
  xml = xml.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, 'ISO_TS');
  return xml;
}

function hashDocx(buffer) {
  const xml = extraerXmlEstable(buffer);
  return crypto.createHash('sha256').update(xml).digest('hex');
}

function snapshotPath(name) {
  return path.join(SNAP_DIR, name + '.hash');
}

// Compara buffer contra snapshot. Si UPDATE_SNAPSHOTS=1 o no existe, lo escribe.
// Devuelve { ok, actual, expected } — si !ok, el caller falla el test.
function compararSnapshot(name, buffer) {
  const actual = hashDocx(buffer);
  const p = snapshotPath(name);
  const existe = fs.existsSync(p);

  if (UPDATE || !existe) {
    fs.writeFileSync(p, actual + '\n', 'utf8');
    return { ok: true, actual, expected: actual, writtenNew: !existe, updated: UPDATE };
  }
  const expected = fs.readFileSync(p, 'utf8').trim();
  return { ok: actual === expected, actual, expected };
}

// Carga fixture. Los fixtures son { ot, datos } donde ot es un objeto tipo fila
// de la tabla ots y datos es lo que quedaría en ensayo.datos_json.
function cargarFixture(nombre) {
  const p = path.join(__dirname, 'fixtures', nombre + '.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

module.exports = { hashDocx, compararSnapshot, cargarFixture, extraerXmlEstable, UPDATE };
