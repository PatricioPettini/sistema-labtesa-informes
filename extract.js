const PizZip = require('pizzip');
const fs = require('fs');

const files = [
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\ferrita-delta\\01_20240708_AUSTIN POWDER_O.T 512620,513297,513298.docx",
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\ferrita-delta\\02_20260608_NUCLEOELECTRICA_NUCLEOELECTRICA ARGENTINA S.A._M0038131_0000534659 PRELIMINAR.docx",
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\ferrita-delta\\03_20240627_RAIZEN ARGENTINA SA_30-50672680-4_RAIZEN ARGENTINA S.A.U._M0036067_0000513510.docx",
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\_inspect\\test-informes\\_AUDv2_ferrita_A.docx",
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\_inspect\\test-informes\\_AUDv2_ferrita_C.docx",
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\_inspect\\test-informes\\_AUDv2_ferrita_D.docx"
];

files.forEach(filepath => {
  try {
    if (!fs.existsSync(filepath)) {
      console.log(`\n=== ${filepath.split('\\').pop()} [NOT FOUND] ===\n`);
      return;
    }
    const zip = new PizZip(fs.readFileSync(filepath));
    const xml = zip.files['word/document.xml'].asText();
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`\n=== ${filepath.split('\\').pop()} ===\n${text.substring(0, 3000)}\n`);
  } catch (e) {
    console.log(`\n=== ${filepath.split('\\').pop()} [ERROR] ===\n${e.message}\n`);
  }
});
