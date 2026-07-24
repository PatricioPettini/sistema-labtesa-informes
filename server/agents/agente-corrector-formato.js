/**
 * agente-corrector-formato.js
 * Corrige automáticamente diferencias de formato detectadas por agente-formato.js.
 *
 * Correcciones que aplica (sin tocar contenido):
 *   - Ancho total de tabla
 *   - Ancho de columnas (gridCol)
 *   - Espaciado de línea en párrafos
 */

'use strict';
const PizZip = require('pizzip');

const TABLA_TOL_ABS = 350;
const TABLA_TOL_PCT = 0.09;
const COL_TOL_ABS   = 220;
const COL_TOL_PCT   = 0.12;
const SPACING_TOL   = 40;

// ── Corrección de tablas ──────────────────────────────────────────────────────

function corregirTablasXML(xml, tablaConsenso) {
  let cambios = 0;

  const result = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, tbl => {
    const cols = [...tbl.matchAll(/<w:gridCol[^>]*w:w="(\d+)"/g)];
    const nCols = cols.length;
    const ref   = tablaConsenso[nCols];
    if (!ref) return tbl;

    let updated = tbl;

    // — Ancho total de la tabla —
    if (ref.ancho != null) {
      updated = updated.replace(/<w:tblW([^>]*)w:w="(\d+)"([^>]*)>/g, (m, pre, wVal, post) => {
        const current = parseInt(wVal);
        const diff    = Math.abs(current - ref.ancho);
        if (diff > TABLA_TOL_ABS && diff / ref.ancho > TABLA_TOL_PCT) {
          cambios++;
          return `<w:tblW${pre}w:w="${ref.ancho}"${post}>`;
        }
        return m;
      });
    }

    // — Anchos de columnas —
    if (ref.columnas && ref.columnas.length === nCols) {
      let colIdx = 0;
      updated = updated.replace(/<w:gridCol([^>]*)w:w="(\d+)"/g, (m, pre, wVal) => {
        const refW = ref.columnas[colIdx];
        const genW = parseInt(wVal);
        colIdx++;
        if (refW == null) return m;
        const diff = Math.abs(genW - refW);
        if (diff > COL_TOL_ABS && diff / refW > COL_TOL_PCT) {
          cambios++;
          return `<w:gridCol${pre}w:w="${refW}"`;
        }
        return m;
      });
    }

    return updated;
  });

  return { xml: result, cambios };
}

// ── Corrección de espaciado ───────────────────────────────────────────────────

function corregirEspaciadoXML(xml, refLine) {
  let cambios = 0;

  const result = xml.replace(/<w:spacing\s+([^/]*)\/?>/g, (match, attrs) => {
    const lineM = attrs.match(/w:line="(\d+)"/);
    if (!lineM) return match;
    const current = parseInt(lineM[1]);
    if (Math.abs(current - refLine) <= SPACING_TOL) return match;
    cambios++;
    const newAttrs = attrs.replace(/w:line="\d+"/, `w:line="${refLine}"`);
    return match.endsWith('/>') ? `<w:spacing ${newAttrs.trim()}/>` : `<w:spacing ${newAttrs.trim()}>`;
  });

  return { xml: result, cambios };
}

// ── Función principal ─────────────────────────────────────────────────────────

function corregirFormato(buffer, erroresFormato, advertenciasFormato, consenso) {
  if (!consenso) return { buffer, correccionesAplicadas: [] };

  const correccionesAplicadas = [];
  let zip;
  try {
    zip = new PizZip(buffer);
  } catch (e) {
    return { buffer, correccionesAplicadas: [`Error al leer docx: ${e.message}`] };
  }

  let xml        = zip.files['word/document.xml'].asText();
  let modificado = false;

  // 1. Tablas (errores + advertencias de columnas)
  const hayTablaIssues = [...erroresFormato, ...advertenciasFormato].some(s => s.startsWith('Tabla'));
  if (hayTablaIssues && Object.keys(consenso.tablaConsenso).length > 0) {
    const r = corregirTablasXML(xml, consenso.tablaConsenso);
    if (r.cambios > 0) {
      xml = r.xml;
      correccionesAplicadas.push(`${r.cambios} tabla(s): ancho/columnas ajustados`);
      modificado = true;
    }
  }

  // 2. Espaciado de línea
  const haySpacingIssues = [...erroresFormato, ...advertenciasFormato].some(s => s.startsWith('Espaciado'));
  if (haySpacingIssues && consenso.espaciado?.line != null) {
    const r = corregirEspaciadoXML(xml, consenso.espaciado.line);
    if (r.cambios > 0) {
      xml = r.xml;
      correccionesAplicadas.push(`Espaciado de línea corregido en ${r.cambios} párrafo(s)`);
      modificado = true;
    }
  }

  if (!modificado) return { buffer, correccionesAplicadas: [] };

  zip.file('word/document.xml', xml);
  const bufferCorregido = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer: bufferCorregido, correccionesAplicadas };
}

module.exports = { corregirFormato };
