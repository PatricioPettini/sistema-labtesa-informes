const PizZip = require('pizzip');
const fs = require('fs');

const files = [
    "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\dureza-brinell\\01_1. OAA_DEFINO GLOBAL S.R.L._M0037086_0000523756.docx",
    "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\dureza-brinell\\04_ATP SOLUTIONS S.R.L_30-71090691-9_ATP SOLUTIONS S.R.L._M0036148_0000514209.docx",
    "C:\\Users\\Patricio\\Desktop\\lab-informes\\server\\agents\\informes-referencia\\dureza-brinell\\NATIONAL OILWELL VARCO_NATIONAL OILWELL VARCO MSW S.A_M0038122_0000534575.docx",
    "C:\\Users\\Patricio\\Desktop\\lab-informes\\_inspect\\test-informes\\_AUDv2_brinell_A.docx",
    "C:\\Users\\Patricio\\Desktop\\lab-informes\\_inspect\\test-informes\\_AUDv2_brinell_B.docx"
];

files.forEach(file => {
    console.log(`\n=== ${file.split('\\').pop()} ===`);
    try {
        const data = fs.readFileSync(file);
        const zip = new PizZip(data);
        const xml = zip.files['word/document.xml'].asText();
        const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log(text);
    } catch (e) {
        console.log(`ERROR: ${e.message}`);
    }
});
