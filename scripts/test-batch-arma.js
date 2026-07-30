// Ejecuta armarFotosParaOtYTipo simulando lo que hace el endpoint batch.
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database('lab-informes.db');
const { buscarFotosOt } = require('../server/utils/fotos-auto');

async function test() {
  const nroOt = process.argv[2] || '536327';
  const tipo = process.argv[3] || 'macrografia';

  const ot = db.prepare('SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_ot = ?').get(nroOt);
  console.log('OT:', ot);

  const r = buscarFotosOt(ot.razon_social, ot.nro_solicitud, ot.nro_ot, ot.id_muestra);
  console.log('items en drive:', (r.items || []).length);
  (r.items || []).forEach(it => {
    console.log('  - name:', path.basename(it.abs), '| muestra:', it.muestra, '| folders:', it.folders);
  });
}
test();
