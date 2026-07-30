// Test rápido del generator de químicos con una fila custom.
// Genera un Word en /tmp y muestra si la fila custom aparece.

const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { generarQuimicosDesdeTemplate } = require('../server/generators/template-quimicos');

const ot = {
  nro_ot: '999999', razon_social: 'TEST CLIENTE',
  fecha_finalizacion: '2026-07-30', id_muestra: 'TEST',
  fecha_recepcion: '2026-07-30', fecha_aprobacion: '2026-07-30',
};

const datos = {
  norma_e415: true,
  temperatura: '23',
  muestras: [
    { columna_label: 'M1', carbono: '0.12', extra_test1: '0.99' },
    { columna_label: 'M2', carbono: '0.14', extra_test1: '0.87' },
    { columna_label: 'M3' },
  ],
  elementos_extra: [
    { k: 'extra_test1', label: 'Ferrocromo %' },
  ],
  patrones: [{}],
  oaa: true,
};

console.log('Datos entrada:');
console.log('  elementos_extra:', JSON.stringify(datos.elementos_extra));
console.log('  muestras[0].extra_test1:', datos.muestras[0].extra_test1);

const buf = generarQuimicosDesdeTemplate(ot, datos, []);
console.log('\nWord generado. Tamaño:', buf.length, 'bytes');

// Inspeccionar el XML resultante buscando "Ferrocromo"
const zip = new PizZip(buf);
const xml = zip.files['word/document.xml'].asText();
const matches = xml.match(/[^<]*Ferrocromo[^<]*/g);
console.log('\n"Ferrocromo" en el XML final:', matches);

// Buscar los valores custom
const valFerroM1 = xml.match(/[^<]*0\.99[^<]*/g);
const valFerroM2 = xml.match(/[^<]*0\.87[^<]*/g);
console.log('Valor 0.99 (M1):', valFerroM1);
console.log('Valor 0.87 (M2):', valFerroM2);

// Guardar el docx para inspección visual
const outPath = path.join(__dirname, '..', 'test-quimicos-custom.docx');
fs.writeFileSync(outPath, buf);
console.log('\nGuardado en:', outPath);
