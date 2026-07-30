// Testea el endpoint batch /api/fotos-auto-solicitud llamando al armador
// directamente (sin HTTP). Simula lo mismo que hace el endpoint.
const Database = require('better-sqlite3');
const db = new Database('lab-informes.db', { readonly: false });

const nroOtReferencia = process.argv[2] || '536327';
const tipo = process.argv[3] || 'macrografia';

const otRef = db.prepare('SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_ot = ?').get(nroOtReferencia);
if (!otRef) { console.log('OT ' + nroOtReferencia + ' no encontrada'); process.exit(1); }
console.log('OT ref:', otRef);

if (!otRef.nro_solicitud) { console.log('sin nro_solicitud'); process.exit(0); }

const hermanas = db.prepare(
  'SELECT nro_ot, nro_solicitud, razon_social, id_muestra FROM ots WHERE nro_solicitud = ? ORDER BY creado_en ASC, nro_ot ASC'
).all(otRef.nro_solicitud);
console.log('\nHermanas encontradas (' + hermanas.length + '):');
hermanas.forEach(h => console.log('  ' + h.nro_ot + ' — ' + h.id_muestra));

console.log('\n--- Simulando armado por cada hermana ---');
(async () => {
  // Importar la función del endpoint. Necesito que api.js esté cargado.
  // Como no exporta armarFotosParaOtYTipo directamente, hago fetch a las
  // primitivas de fotos-auto para ver qué encontraría.
  const { buscarFotosOt } = require('../server/utils/fotos-auto');
  for (const ot of hermanas) {
    console.log('\nOT ' + ot.nro_ot + ':');
    const r = buscarFotosOt(ot.razon_social, ot.nro_solicitud, ot.nro_ot, ot.id_muestra);
    console.log('  root_ok:', r.root_ok);
    console.log('  carpeta_cliente:', r.carpeta_cliente);
    console.log('  carpeta_sol:', r.carpeta_sol);
    console.log('  carpeta_ot:', r.carpeta_ot);
    console.log('  items (total):', (r.items || []).length);
    if (r.items && r.items.length > 0) {
      const conCarpetaOt = r.items.filter(it => (it.folders || []).length === 0);
      console.log('  items en raíz (folders=[]):', conCarpetaOt.length);
      const conMuestra = r.items.filter(it => it.muestra != null);
      console.log('  items con muestra M<n>:', conMuestra.length);
    }
  }
})();
