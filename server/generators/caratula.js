const {
  Paragraph,
  TextRun,
  AlignmentType,
  ImageRun,
} = require('docx');

const { parrafoNormal, parrafoBold } = require('./estilos');

function generarCaratula({ id_muestra, fecha_recepcion, fecha_aprobacion, fecha_finalizacion, fotos }) {
  const elementos = [];

  // Identificación de la muestra (label + texto en un solo párrafo con salto de línea)
  elementos.push(new Paragraph({
    spacing: { after: 160, before: 240 },
    children: [
      new TextRun({ text: 'La muestra se identifica por el cliente como:', bold: true, size: 22 }),
      new TextRun({ text: id_muestra || '', bold: true, size: 22, break: 1 }),
    ],
  }));

  // Fechas
  elementos.push(parrafoNormal(`Fecha de recepción de la muestra: ${fecha_recepcion || ''}`));
  elementos.push(parrafoNormal(`Fecha de aprobación e inicio del trabajo: ${fecha_aprobacion || ''}`));
  elementos.push(parrafoNormal(`Fecha de finalización del certificado: ${fecha_finalizacion || ''}`));

  // Fotos de recepción
  if (fotos && fotos.length > 0) {
    fotos.forEach((fotoBuffer, i) => {
      try {
        const MAX_W = 567;  // ~15cm a 96 DPI
        const MAX_H = 416;  // ~11cm a 96 DPI
        let imgW = MAX_W;
        let imgH = calcularAlto(fotoBuffer, MAX_W);
        if (imgH > MAX_H) {
          imgW = Math.round(imgW * MAX_H / imgH);
          imgH = MAX_H;
        }
        elementos.push(new Paragraph({
          spacing: { before: 200, after: 60 },
          children: [
            new ImageRun({
              data: fotoBuffer,
              transformation: { width: imgW, height: imgH },
            }),
          ],
        }));
        elementos.push(parrafoNormal(`Imagen N°${i + 1} – Estado de recepción`));
      } catch {
        elementos.push(parrafoNormal(`[Imagen N°${i + 1} - Error al cargar foto]`));
      }
    });
  } else {
    elementos.push(new Paragraph({ spacing: { before: 200, after: 60 } }));
    elementos.push(parrafoNormal('Imagen N°1 – Estado de recepción'));
  }

  return elementos;
}

function calcularAlto(buffer, anchoTarget) {
  // Estimación proporcional básica: asume 4:3 si no se puede leer dimensiones
  try {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      // JPEG: buscar marcador SOF
      let i = 2;
      while (i < buffer.length - 8) {
        if (buffer[i] === 0xFF && [0xC0, 0xC1, 0xC2].includes(buffer[i + 1])) {
          const h = (buffer[i + 5] << 8) | buffer[i + 6];
          const w = (buffer[i + 7] << 8) | buffer[i + 8];
          return Math.round((anchoTarget * h) / w);
        }
        i += 2 + ((buffer[i + 2] << 8) | buffer[i + 3]);
      }
    }
    if (buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      // PNG
      const w = buffer.readUInt32BE(16);
      const h = buffer.readUInt32BE(20);
      return Math.round((anchoTarget * h) / w);
    }
  } catch {}
  return Math.round(anchoTarget * 0.75); // fallback 4:3
}

module.exports = { generarCaratula };
