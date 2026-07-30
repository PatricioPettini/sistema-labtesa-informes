// Testea qué carpetas matchea "laboratorio seit" contra el drive real.
// Uso: node scripts/test-match-cliente.js "razon social del cliente"
const { puntajeMatch } = require('../server/utils/guardar-en-drive');
const fs = require('fs');
const path = require('path');

const razonSocial = process.argv[2] || 'LABORATORIO SEIT';
const root = process.env.FOTOS_RECEPCION_ROOT
          || 'G:\\METALMECANICA\\FOTOS\\CLIENTES 2026';

console.log('Razón social: "' + razonSocial + '"');
console.log('Root: ' + root);
if (!fs.existsSync(root)) { console.log('❌ Root no existe'); process.exit(1); }

const carpetas = fs.readdirSync(root, { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);
console.log('Total carpetas: ' + carpetas.length);

// Buscar las que empiezan con "LAB" o contienen "SEIT"
const candidatas = carpetas.filter(c => /LAB|SEIT|CUENCA/i.test(c));
console.log('\nCandidatas (LAB/SEIT/CUENCA):');
candidatas.forEach(c => {
  const p = puntajeMatch(razonSocial, c);
  console.log('  ' + p.toFixed(3) + '  →  ' + c);
});

// Top 10 general
const ranking = carpetas
  .map(c => ({ nombre: c, puntaje: puntajeMatch(razonSocial, c) }))
  .filter(x => x.puntaje > 0)
  .sort((a, b) => b.puntaje - a.puntaje)
  .slice(0, 10);
console.log('\nTop 10 puntaje global:');
ranking.forEach(x => console.log('  ' + x.puntaje.toFixed(3) + '  →  ' + x.nombre));
