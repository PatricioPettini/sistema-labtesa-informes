const {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
} = require('docx');

// Párrafo de texto normal
function parrafoNormal(texto, opciones = {}) {
  return new Paragraph({
    spacing: { after: 160, before: 0, line: 259, lineRule: 'auto' },
    children: [new TextRun({ text: texto, size: 22 })],
    ...opciones,
  });
}

// Párrafo en negrita
function parrafoBold(texto, opciones = {}) {
  return new Paragraph({
    spacing: { after: 160, before: 0, line: 259, lineRule: 'auto' },
    children: [new TextRun({ text: texto, bold: true, size: 22 })],
    ...opciones,
  });
}

// Título de sección (ENSAYO DE TRACCION, etc.)
function tituloSeccion(texto) {
  return new Paragraph({
    spacing: { before: 200, after: 120, line: 259, lineRule: 'auto' },
    children: [new TextRun({ text: texto, bold: true, size: 22 })],
  });
}

// Subtítulo (CONDICIONES DE ENSAYO, etc.)
function subtitulo(texto) {
  return new Paragraph({
    spacing: { before: 160, after: 80, line: 259, lineRule: 'auto' },
    children: [new TextRun({ text: texto, bold: true, size: 22 })],
  });
}

// Epígrafe de tabla
function captionTabla(num, descripcion) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 160 },
    children: [new TextRun({ text: `Tabla N˚${num} - ${descripcion}`, size: 20 })],
  });
}

// FIN DE INFORME
function finDeInforme() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 400 },
    children: [new TextRun({ text: 'FIN DE INFORME', bold: true, size: 22 })],
  });
}

// Borde estándar para tablas de resultados
const BORDE_TABLA = {
  top:     { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  bottom:  { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  left:    { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  right:   { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  insideH: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  insideV: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
};

// Celda de encabezado de tabla (gris claro, negrita)
function celdaHeader(texto, width) {
  const props = {
    shading: { fill: 'D9D9D9', type: ShadingType.CLEAR, color: 'auto' },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40, before: 40 },
        children: [new TextRun({ text: texto, bold: true, size: 20 })],
      }),
    ],
  };
  if (width) props.width = { size: width, type: WidthType.DXA };
  return new TableCell(props);
}

// Celda de datos de tabla
function celdaDato(texto, alineacion = AlignmentType.CENTER) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: alineacion,
        spacing: { after: 40, before: 40 },
        children: [new TextRun({ text: String(texto ?? ''), size: 20 })],
      }),
    ],
  });
}

module.exports = {
  parrafoNormal,
  parrafoBold,
  tituloSeccion,
  subtitulo,
  captionTabla,
  finDeInforme,
  BORDE_TABLA,
  celdaHeader,
  celdaDato,
};
