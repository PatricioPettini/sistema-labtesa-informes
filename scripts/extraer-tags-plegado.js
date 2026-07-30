// Extrae los TAGs de equipamiento (MANDRIL, CALIBRE, DISPOSITIVO DE PLEGADO,
// TERMOHIGRÓMETRO, MÁQUINA...) que aparecen en los informes de referencia de
// plegado. Devuelve conteos: qué TAG apareció más veces por cada equipo.
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const dir = 'server/agents/informes-referencia/plegado';
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.docx'));
console.log('Archivos analizados:', archivos.length);

// Regex para "<EQUIPO> ... TAG N°<code>" con tolerancia a formato.
const EQUIPOS = [
  { key: 'mandril',            re: /MANDRIL(?:[\s\S]{0,80})TAG\s*N[°ºo]?\s*[:\-]?\s*([A-Z0-9\-]+)/i },
  { key: 'calibre',            re: /CALIBRE(?:\s+DIGITAL)?(?:[\s\S]{0,80})TAG\s*N[°ºo]?\s*[:\-]?\s*([A-Z0-9\-]+)/i },
  { key: 'dispositivo_plegado',re: /DISPOSITIVO\s+DE\s+PLEGADO(?:[\s\S]{0,80})TAG\s*N[°ºo]?\s*[:\-]?\s*([A-Z0-9\-]+)/i },
  { key: 'termohigro',         re: /TERMOHIGR[OÓ]METRO(?:[\s\S]{0,80})TAG\s*N[°ºo]?\s*[:\-]?\s*([A-Z0-9\-]+)/i },
  { key: 'maquina_emic',       re: /M[AÁ]QUINA\s+DE\s+TRACCI[OÓ]N\s+EMIC(?:[\s\S]{0,80})TAG\s*N[°ºo]?\s*[:\-]?\s*([A-Z0-9\-]+)/i },
  { key: 'prensa_torne',       re: /PRENSA\s+PLEGADORA\s+TORNE(?:[\s\S]{0,80})TAG\s*N[°ºo]?\s*[:\-]?\s*([A-Z0-9\-]+)/i },
  { key: 'maquina_shimadzu',   re: /M[AÁ]QUINA\s+DE\s+TRACCI[OÓ]N\s+SHIMADZU(?:[\s\S]{0,80})TAG\s*N[°ºo]?\s*[:\-]?\s*([A-Z0-9\-]+)/i },
];

const counts = {};
EQUIPOS.forEach(e => { counts[e.key] = {}; });

archivos.forEach(f => {
  try {
    const zip = new PizZip(fs.readFileSync(path.join(dir, f)));
    // Concatenar los <w:t> del document.xml (texto plano).
    const xml = zip.files['word/document.xml'].asText();
    const texto = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join(' ');
    EQUIPOS.forEach(e => {
      const m = texto.match(e.re);
      if (m) {
        const tag = m[1].trim().toUpperCase();
        counts[e.key][tag] = (counts[e.key][tag] || 0) + 1;
      }
    });
  } catch (err) {
    console.warn('  Error leyendo', f, err.message);
  }
});

console.log('\nTags más frecuentes por equipo:');
EQUIPOS.forEach(e => {
  const entries = Object.entries(counts[e.key]).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    console.log('  ' + e.key + ':  (sin matches)');
  } else {
    console.log('  ' + e.key + ':');
    entries.forEach(([tag, n]) => console.log('    ' + tag + '  →  ' + n + ' vez/veces'));
  }
});
