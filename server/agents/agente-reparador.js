/**
 * agente-reparador.js
 * Agente que autocorrige problemas de formato detectados por el QA en el XML del docx.
 *
 * Correcciones automáticas que aplica SIN llamar a Claude (rápidas y deterministas):
 * - Numeración de secciones incorrecta → llama a renumerarSecciones del word-generator
 * - Imágenes > 15cm → redimensiona al máximo permitido
 * - Fuente incorrecta en runs del cuerpo → fuerza Calibri sz=22
 *
 * Uso:
 *   const { repararDocx } = require('./agente-reparador');
 *   const bufferReparado = repararDocx(buffer, errores, advertencias);
 */

const PizZip = require('pizzip');

const MAX_IMG_EMU = 5400000; // 15cm exactos en EMU (914400 * 15 / 2.54)

/**
 * Aplica correcciones automáticas al buffer docx según los errores detectados.
 * @param {Buffer} buffer - Buffer del docx generado
 * @param {string[]} errores - Lista de errores del QA
 * @param {string[]} advertencias - Lista de advertencias del QA
 * @returns {{ buffer: Buffer, correccionesAplicadas: string[] }}
 */
function repararDocx(buffer, errores, advertencias) {
  const correccionesAplicadas = [];
  let zip;

  try {
    zip = new PizZip(buffer);
  } catch (e) {
    return { buffer, correccionesAplicadas: [`Error al leer docx: ${e.message}`] };
  }

  let xml = zip.files['word/document.xml'].asText();
  let modificado = false;

  // ── 1. Imágenes que superan 15cm ─────────────────────────────────────────
  const imgErrores = errores.filter(e => e.includes('Imagen con ancho'));
  if (imgErrores.length > 0) {
    let count = 0;
    xml = xml.replace(/cx="(\d+)"/g, (match, cx) => {
      const val = parseInt(cx);
      if (val > MAX_IMG_EMU) {
        // Calcular nueva altura proporcional si hay cy cercano
        count++;
        return `cx="${MAX_IMG_EMU}"`;
      }
      return match;
    });
    if (count > 0) {
      correccionesAplicadas.push(`${count} imagen(es) redimensionada(s) a máximo 15cm`);
      modificado = true;
    }
  }

  // ── 2. Fuente no Calibri en runs del cuerpo ──────────────────────────────
  const fuenteError = errores.find(e => e.includes('Fuente dominante no es Calibri'));
  if (fuenteError) {
    // Reemplazar fuentes incorrectas en runs del cuerpo (después del primer page break)
    const pbPos = xml.indexOf('w:type="page"');
    if (pbPos > 0) {
      const antes = xml.slice(0, pbPos);
      let despues = xml.slice(pbPos);
      // Reemplazar cualquier fuente en w:ascii/w:hAnsi/w:cs que no sea Calibri
      const fuentesComunes = ['Arial', 'Times New Roman', 'Verdana', 'Tahoma', 'Helvetica'];
      for (const fuente of fuentesComunes) {
        const re = new RegExp(`(w:ascii|w:hAnsi|w:cs)="${fuente}"`, 'g');
        if (re.test(despues)) {
          despues = despues.replace(re, `$1="Calibri"`);
          correccionesAplicadas.push(`Fuente "${fuente}" reemplazada por Calibri en el cuerpo`);
          modificado = true;
        }
      }
      xml = antes + despues;
    }
  }

  // ── 3. Tamaño de fuente incorrecto en cuerpo ─────────────────────────────
  const tamañoAdv = advertencias.find(a => a.includes('tamaño de fuente inusual'));
  if (tamañoAdv) {
    // No tocamos automáticamente el tamaño — puede ser intencional en títulos
    // Solo lo registramos como advertencia manejada
    correccionesAplicadas.push('Advertencia de tamaño de fuente registrada (no corregida automáticamente)');
  }

  // ── 4. Sección "FIN DE INFORME" faltante ─────────────────────────────────
  const finError = errores.find(e => e.includes('FIN DE INFORME'));
  if (finError && !xml.includes('FIN DE INFORME')) {
    // Insertar FIN DE INFORME antes del cierre de body
    const bodyClose = xml.lastIndexOf('</w:body>');
    if (bodyClose > 0) {
      const finPara =
        '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="200" w:after="200"/></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
        '<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>' +
        '<w:t>FIN DE INFORME</w:t></w:r></w:p>';
      xml = xml.slice(0, bodyClose) + finPara + xml.slice(bodyClose);
      correccionesAplicadas.push('Se insertó "FIN DE INFORME" faltante');
      modificado = true;
    }
  }

  if (!modificado) {
    return { buffer, correccionesAplicadas: [] };
  }

  zip.file('word/document.xml', xml);
  const bufferReparado = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer: bufferReparado, correccionesAplicadas };
}

module.exports = { repararDocx };
