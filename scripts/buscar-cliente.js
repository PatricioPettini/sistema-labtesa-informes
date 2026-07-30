const Database = require('better-sqlite3');
const db = new Database('lab-informes.db', { readonly: true });
const rows = db.prepare(`
  SELECT DISTINCT razon_social FROM ots
  WHERE razon_social LIKE '%SEIT%'
     OR razon_social LIKE '%LABORATORIO%'
     OR razon_social LIKE '%CUENCA%'
  ORDER BY razon_social
`).all();
console.log('Clientes en el sistema con SEIT/LABORATORIO/CUENCA:');
rows.forEach(r => console.log('  ' + r.razon_social));

console.log('\nAlias en cliente_alias:');
const alias = db.prepare(`
  SELECT razon_social, carpeta_drive, fuente, verificado FROM cliente_alias
  WHERE razon_social LIKE '%SEIT%' OR carpeta_drive LIKE '%SEIT%'
     OR razon_social LIKE '%CUENCA%' OR carpeta_drive LIKE '%CUENCA%'
`).all();
alias.forEach(a => console.log('  "' + a.razon_social + '" → "' + a.carpeta_drive + '" (' + a.fuente + ', verif=' + a.verificado + ')'));
