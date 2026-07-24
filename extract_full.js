const PizZip = require('pizzip');
const fs = require('fs');

function extractFullText(filepath) {
  try {
    const xml = new PizZip(fs.readFileSync(filepath)).files['word/document.xml'].asText();
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
  } catch (e) {
    return 'ERROR: ' + e.message;
  }
}

// Reference samples (pick 3)
const refs = [
  'C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\dureza-rockwell\\NHNET_NHNET SA_M0037906_0000532966.docx',
  'C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\dureza-rockwell\\FIJACIONES INDUSTRIALES S.A_FIJACIONES INDUSTRIALES S.A._M0037955_0000533578.docx',
  'C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\dureza-rockwell\\SEIRE_SEIRE SA_M0038083_0000534363.docx'
];

// Generated samples
const gen = [
  'C:\\Users\\Patricio\\Desktop\\lab-informes\\_inspect\\test-informes\\_AUDv2_rockwell_A.docx',
  'C:\\Users\\Patricio\\Desktop\\lab-informes\\_inspect\\test-informes\\_AUDv2_rockwell_B.docx'
];

console.log('=== REF 1 (FULL) ===\n');
const ref1 = extractFullText(refs[0]);
console.log(ref1);

console.log('\n\n=== REF 2 (FULL) ===\n');
const ref2 = extractFullText(refs[1]);
console.log(ref2);

console.log('\n\n=== REF 3 (FULL) ===\n');
const ref3 = extractFullText(refs[2]);
console.log(ref3);

console.log('\n\n=== GEN A (FULL) ===\n');
const genA = extractFullText(gen[0]);
console.log(genA);

console.log('\n\n=== GEN B (FULL) ===\n');
const genB = extractFullText(gen[1]);
console.log(genB);
