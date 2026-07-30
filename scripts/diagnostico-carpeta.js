// Corre exactamente el mismo flujo que hace el endpoint /ot/:nro_ot/fotos-auto
// para diagnosticar qué carpeta elige el sistema.
// Uso: node scripts/diagnostico-carpeta.js <nro_ot>
const nroOt = process.argv[2];
if (!nroOt) { console.log('Uso: node scripts/diagnostico-carpeta.js <nro_ot>'); process.exit(1); }

const Database = require('better-sqlite3');
const db = new Database('lab-informes.db', { readonly: false }); // false porque el módulo db abre en write
const { buscarFotosOt } = require('../server/utils/fotos-auto');

const ot = db.prepare('SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_ot = ?').get(nroOt);
if (!ot) { console.log('OT no encontrada'); process.exit(1); }
console.log('OT:', ot);

const r = buscarFotosOt(ot.razon_social, ot.nro_solicitud, ot.nro_ot, ot.id_muestra);
console.log('\nResultado buscarFotosOt:');
console.log('  root_ok:', r.root_ok);
console.log('  root:', r.root);
console.log('  encontrada:', r.encontrada);
console.log('  carpeta_cliente:', r.carpeta_cliente);
console.log('  carpeta_sol:', r.carpeta_sol);
console.log('  carpeta_ot:', r.carpeta_ot);
console.log('  cliente_score:', r.cliente_score);
console.log('  debug:', r.debug);
console.log('  razon_social_buscada:', r.razon_social_buscada);
if (r.cliente_candidatos) {
  console.log('  cliente_candidatos:');
  r.cliente_candidatos.forEach(c => {
    console.log('    ' + c.puntaje.toFixed(3) + '  →  ' + c.nombre + (c.fuente ? ' [' + c.fuente + ']' : ''));
  });
}
