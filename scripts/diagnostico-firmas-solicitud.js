// Diagnóstico: lista todos los ensayos de una solicitud + su estado de firma.
// Detecta ensayos duplicados por (nro_ot, tipo) — típico bug de multi-OT
// cuando el saver crea un ensayo hermano con force_create y ya existía otro.
//
//   node scripts/diagnostico-firmas-solicitud.js 230

const Database = require('better-sqlite3');
const db = new Database('lab-informes.db', { readonly: true });

const solNro = process.argv[2];
if (!solNro) { console.log('Uso: node diagnostico-firmas-solicitud.js <nro_solicitud>'); process.exit(1); }

const ots = db.prepare('SELECT nro_ot FROM ots WHERE nro_solicitud = ? ORDER BY nro_ot').all(solNro);
if (ots.length === 0) { console.log('Sin OTs para solicitud ' + solNro); process.exit(0); }

console.log('SOLICITUD ' + solNro + ' — ' + ots.length + ' OT(s)\n');

ots.forEach(({ nro_ot }) => {
  const ensayos = db.prepare(
    'SELECT id, tipo, estado_firma, firmado_por, revisado_por, orden, actualizado_en FROM ensayos WHERE nro_ot = ? ORDER BY tipo, orden, id'
  ).all(nro_ot);
  console.log('OT ' + nro_ot + '  (' + ensayos.length + ' ensayo(s))');
  const porTipo = {};
  ensayos.forEach(e => {
    porTipo[e.tipo] = porTipo[e.tipo] || [];
    porTipo[e.tipo].push(e);
    const firma = e.estado_firma || 'abierto';
    const quien = e.firmado_por || e.revisado_por || '—';
    console.log('  id=' + e.id + '  ' + e.tipo.padEnd(24) + '  ' + firma.padEnd(11) + '  ' + quien);
  });
  Object.keys(porTipo).forEach(t => {
    if (porTipo[t].length > 1) {
      console.log('  ⚠  DUPLICADO: ' + porTipo[t].length + ' ensayo(s) de tipo "' + t + '"');
    }
  });
  console.log();
});
