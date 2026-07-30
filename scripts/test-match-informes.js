// Diagnostica el matching de carpeta de INFORMES (no de fotos).
// Uso: node scripts/test-match-informes.js "RAZON SOCIAL"
const { buscarCarpetaCliente, ROOT_DRIVE, puntajeMatch } = require('../server/utils/guardar-en-drive');
const fs = require('fs');
const path = require('path');

const razonSocial = process.argv[2] || 'LABORATORIO SEIT S.A.';

console.log('Razón social: "' + razonSocial + '"');
console.log('Root INFORMES: ' + ROOT_DRIVE);
if (!fs.existsSync(ROOT_DRIVE)) { console.log('❌ Root no existe'); process.exit(1); }

console.log('\nResultado buscarCarpetaCliente:');
const r = buscarCarpetaCliente(razonSocial);
console.log('  ', r);

// Rankear TODAS las carpetas del drive de informes para ver el top
const carpetas = fs.readdirSync(ROOT_DRIVE, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);
console.log('\nTotal carpetas en drive de INFORMES: ' + carpetas.length);

const ranking = carpetas
  .map(c => ({ nombre: c, puntaje: puntajeMatch(razonSocial, c) }))
  .filter(x => x.puntaje > 0)
  .sort((a, b) => b.puntaje - a.puntaje)
  .slice(0, 10);

console.log('\nTop 10 puntaje contra INFORMES:');
ranking.forEach(x => console.log('  ' + x.puntaje.toFixed(3) + '  →  ' + x.nombre));

// Filtrar candidatos con "SEIT" o "CUENCA" específicamente
const cand = carpetas.filter(c => /SEIT|CUENCA|LABORATORIO/i.test(c));
console.log('\nCandidatos con SEIT/CUENCA/LABORATORIO:');
cand.forEach(c => {
  const p = puntajeMatch(razonSocial, c);
  console.log('  ' + p.toFixed(3) + '  →  ' + c);
});
