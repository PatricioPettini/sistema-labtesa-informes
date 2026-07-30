// Extrae el texto plano del bloque EQUIPAMIENTO de un informe.
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const arg = process.argv[2] || '05_2026-01-02_BERTOTTO_BOGLIONE_SOC_ANON_BERTOTTO BOGLIONE SOC ANON_M0037625_0000530300.docx';
const file = path.join('server/agents/informes-referencia/plegado', arg);
const zip = new PizZip(fs.readFileSync(file));
const xml = zip.files['word/document.xml'].asText();
const texto = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join(' ');

// Localizar bloque EQUIPAMIENTO
const iEq = texto.search(/EQUIPAMIENTO\s+UTILIZADO/i);
if (iEq < 0) { console.log('Sin bloque EQUIPAMIENTO'); process.exit(0); }
const iFin = texto.indexOf('RESULTADOS', iEq);
const bloque = texto.slice(iEq, iFin > iEq ? iFin : iEq + 1500);
console.log('---- Bloque EQUIPAMIENTO ----');
console.log(bloque);
