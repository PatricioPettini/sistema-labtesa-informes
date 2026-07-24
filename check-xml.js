const fs = require('fs');
const PizZip = require('pizzip');
const path = require('path');

// Leer el docx generado
const dir = 'C:/Users/Patricio/Downloads';
const files = fs.readdirSync(dir)
  .filter(f => f.includes('534192') && f.endsWith('.docx'))
  .map(f => ({ name: f, time: fs.statSync(path.join(dir, f)).mtime }))
  .sort((a, b) => b.time - a.time);

console.log('Archivo:', files[0].name);
const buf = fs.readFileSync(path.join(dir, files[0].name));
const zip = new PizZip(buf);
const xml = zip.files['word/document.xml'].asText();

// Encontrar el parrafo de ENSAYO DE TRACCION y mostrar su XML completo
const pos = xml.indexOf('ENSAYO DE TRACCION');
if (pos < 0) { console.log('NO ENCONTRADO'); process.exit(); }
const paraStart = xml.lastIndexOf('<w:p', pos);
const paraEnd = xml.indexOf('</w:p>', pos) + 6;
console.log('\n--- XML parrafo ENSAYO DE TRACCION (generado) ---');
console.log(xml.slice(paraStart, paraEnd));

// Leer el template original de traccion
const templatePath = 'C:/Users/Patricio/Desktop/lab-informes/server/templates/traccion.docx';
const buf2 = fs.readFileSync(templatePath);
const zip2 = new PizZip(buf2);
const xml2 = zip2.files['word/document.xml'].asText();

const pos2 = xml2.indexOf('ENSAYO DE TRACCION');
if (pos2 < 0) { console.log('NO ENCONTRADO en template'); process.exit(); }
const p2Start = xml2.lastIndexOf('<w:p', pos2);
const p2End = xml2.indexOf('</w:p>', pos2) + 6;
console.log('\n--- XML parrafo ENSAYO DE TRACCION (template original) ---');
console.log(xml2.slice(p2Start, p2End));
