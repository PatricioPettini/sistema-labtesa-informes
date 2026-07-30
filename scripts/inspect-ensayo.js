const Database = require('better-sqlite3');
const db = new Database('lab-informes.db', { readonly: true });

const id = parseInt(process.argv[2] || '854', 10);
const row = db.prepare('SELECT * FROM ensayos WHERE id = ?').get(id);
if (!row) { console.log('No existe ensayo ' + id); process.exit(1); }

console.log('ensayo id=' + id + ' tipo=' + row.tipo + ' nro_ot=' + row.nro_ot);
const d = JSON.parse(row.datos_json);
console.log('\nCampos top-level:');
Object.keys(d).sort().forEach(k => {
  const v = d[k];
  if (Array.isArray(v)) {
    console.log('  ' + k + ':  [array de ' + v.length + ' items]');
  } else if (v && typeof v === 'object') {
    console.log('  ' + k + ':  ' + JSON.stringify(v).slice(0, 200));
  } else {
    const s = String(v);
    console.log('  ' + k + ':  ' + s.slice(0, 100));
  }
});

if (d.analisis) {
  console.log('\ndatos.analisis:', JSON.stringify(d.analisis, null, 2));
}
