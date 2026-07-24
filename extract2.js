const PizZip = require('pizzip');
const fs = require('fs');

const files = [
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\ferrita-delta\\04_20241111_SACDE_30-56845745-1_SACDE SOCIEDAD ARG DE CONSTRUCCION Y DESARROLLO ESTRATEGICO_M0036381_0000516285.docx",
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\ferrita-delta\\05_20250624_TECNOINTER SA_TECNOINTER SA_M0037070_0000523544-1.docx",
  "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\ferrita-delta\\NUCLEOELECTRICA_NUCLEOELECTRICA ARGENTINA S.A._M0038131_0000534659.docx"
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
    const name = filepath.split('\\').pop();
    console.log(`\n=== ${name} ===\n${text.substring(0, 3500)}\n`);
  } catch (e) {
    console.log(`\n=== ${filepath.split('\\').pop()} [ERROR] ===\n${e.message}\n`);
  }
});
