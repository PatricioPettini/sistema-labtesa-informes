// Diagnóstico: qué ensayos con imágenes hay en la DB y cuánto pesan.
const Database = require('better-sqlite3');
const db = new Database('lab-informes.db', { readonly: true });

const rows = db.prepare(`
  SELECT id, nro_ot, tipo, length(datos_json) AS bytes
  FROM ensayos
  WHERE datos_json LIKE '%dataUrl%'
  ORDER BY id DESC
  LIMIT 15
`).all();

console.log('Ensayos con imágenes guardadas (dataUrl):');
rows.forEach(r => {
  console.log('  id=' + r.id + '  nro_ot=' + r.nro_ot + '  tipo=' + r.tipo + '  size=' + (r.bytes / 1024).toFixed(1) + ' KB');
});

// Inspeccionar un ensayo concreto para ver estructura
if (rows.length > 0) {
  const first = rows[0];
  const r = db.prepare('SELECT datos_json FROM ensayos WHERE id = ?').get(first.id);
  const d = JSON.parse(r.datos_json);
  const imgKeys = Object.keys(d).filter(k => k.startsWith('imagenes') || k.startsWith('foto'));
  console.log('\nCampos de imagen en ensayo id=' + first.id + ':');
  imgKeys.forEach(k => {
    const arr = Array.isArray(d[k]) ? d[k] : [];
    console.log('  ' + k + ':  ' + arr.length + ' items');
    arr.forEach((img, i) => {
      const hasUrl = img && img.dataUrl ? 'sí' : 'no';
      const cap = img && img.caption ? img.caption.slice(0, 60) : '(vacío)';
      const name = img && img.name ? img.name.slice(0, 40) : '(sin name)';
      console.log('    [' + i + '] name=' + name + '  dataUrl=' + hasUrl + '  caption=' + cap);
    });
  });
}
