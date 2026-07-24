const fs = require('fs');
const PizZip = require('pizzip');
const path = require('path');

// Buscar ultimo docx en Downloads
const dir = 'C:/Users/Patricio/Downloads';
const files = fs.readdirSync(dir)
  .filter(f => f.endsWith('.docx'))
  .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime }))
  .sort((a, b) => b.time - a.time);

if (!files.length) { console.log('No hay docx en Downloads'); process.exit(); }
console.log('Archivo:', files[0].name);

const buf = fs.readFileSync(path.join(dir, files[0].name));
const zip = new PizZip(buf);
const xml = zip.files['word/document.xml'].asText();

console.log('tieneNumId en doc:', xml.includes('<w:numId'));
console.log('numbering.xml existe:', !!zip.files['word/numbering.xml']);

// Extraer todos los parrafos con texto y ver si tienen numId
const paraRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
let m;
const resultados = [];
while ((m = paraRe.exec(xml)) !== null) {
  const para = m[0];
  const textos = [...para.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)].map(x => x[1]).join('');
  if (!textos.trim()) continue;
  const tieneNum = para.includes('<w:numId');
  const idxNum = para.indexOf('numId w:val=');
  const numId = idxNum >= 0 ? para.slice(idxNum + 13, para.indexOf('"', idxNum + 14)) : '-';
  const idxIlvl = para.indexOf('ilvl w:val=');
  const ilvl = idxIlvl >= 0 ? para.slice(idxIlvl + 11, para.indexOf('"', idxIlvl + 12)) : '-';
  if (tieneNum || textos.includes('ENSAYO') || textos.includes('CONDICIONES') || textos.includes('EQUIPAMIENTO') || textos.includes('RESULTADOS') || textos.includes('FIN DE')) {
    resultados.push({ texto: textos.slice(0, 60), numId, ilvl });
  }
}

console.log('\n--- Parrafos relevantes ---');
for (const r of resultados) {
  console.log(`numId=${r.numId} ilvl=${r.ilvl} | ${r.texto}`);
}
