const {
  Header,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalAlign,
  PageNumber,
} = require('docx');

const SIN_BORDE = {
  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function crearEncabezado({ nro_ot, fecha, razon_social }) {
  const tablaTop = new Table({
    width: { size: 9213, type: WidthType.DXA },
    borders: {
      top:     { style: BorderStyle.NONE, size: 0 },
      bottom:  { style: BorderStyle.NONE, size: 0 },
      left:    { style: BorderStyle.NONE, size: 0 },
      right:   { style: BorderStyle.NONE, size: 0 },
      insideH: { style: BorderStyle.NONE, size: 0 },
      insideV: { style: BorderStyle.NONE, size: 0 },
    },
    rows: [
      new TableRow({
        children: [
          // Logo (placeholder por ahora)
          new TableCell({
            width: { size: 2200, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: SIN_BORDE,
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { after: 0, before: 0 },
                children: [
                  new TextRun({ text: '[LOGO LABORATORIO]', size: 18, color: '888888' }),
                ],
              }),
            ],
          }),
          // Título central
          new TableCell({
            width: { size: 4513, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: SIN_BORDE,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0, before: 0 },
                children: [
                  new TextRun({
                    text: 'CERTIFICADO DE ANÁLISIS',
                    bold: true,
                    italics: true,
                    size: 24,
                  }),
                ],
              }),
            ],
          }),
          // OT / Fecha / Hoja
          new TableCell({
            width: { size: 2500, type: WidthType.DXA },
            verticalAlign: VerticalAlign.TOP,
            borders: SIN_BORDE,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0, before: 0 },
                children: [new TextRun({ text: `OT: ${nro_ot}`, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0, before: 0 },
                children: [new TextRun({ text: `Fecha: ${fecha}`, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0, before: 0 },
                children: [
                  new TextRun({
                    children: ['Hoja: ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES],
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const sresParrafo = new Paragraph({
    spacing: { after: 80, before: 60 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, space: 4, color: '000000' },
    },
    children: [
      new TextRun({ text: 'Sres. ', bold: true, size: 22 }),
      new TextRun({ text: razon_social, size: 22 }),
    ],
  });

  return new Header({ children: [tablaTop, sresParrafo] });
}

module.exports = { crearEncabezado };
