'use strict';

/**
 * agente-actualizador-forms.js
 * Lee los informes de referencia (.docx) y:
 *   1. Extrae equipos con TAG y los inserta en la tabla equipos del DB.
 *   2. Extrae códigos de normas y los inserta en la tabla normas del DB.
 *
 * Se expone como POST /api/actualizar-forms.
 * Es idempotente: usa INSERT OR IGNORE, por lo que puede correrse varias veces.
 */

const PizZip = require('pizzip');
const fs     = require('fs');
const path   = require('path');
const db     = require('../db');

const REF_DIR = path.join(__dirname, 'informes-referencia');

// Extrae texto plano del XML del documento Word (pierde formato, conserva contenido)
function docxATexto(buffer) {
  try {
    const zip = new PizZip(buffer);
    const xml = zip.files['word/document.xml']?.asText() || '';
    // Usar \b para que coincida el tag completo, incluidos los atributos
    return xml
      .replace(/<w:p\b[^>]*>/g, '\n')   // párrafo → salto de línea (tag completo)
      .replace(/<[^>]+>/g, ' ')          // resto de tags → espacio
      .replace(/[ \t]+/g, ' ')           // colapsar espacios en la línea
      .replace(/\n +/g, '\n');           // limpiar espacio inicial tras salto
  } catch {
    return '';
  }
}

// Limpia residuos de atributos XML que puedan quedar en el nombre capturado
// Ej: 'ault="003059DA" w:rsidP="003059DA"> Máquina de tracción Emic' → 'Máquina de tracción Emic'
function limpiarNombre(raw) {
  const lastGT = raw.lastIndexOf('>');
  if (lastGT >= 0 && lastGT < raw.length - 2) raw = raw.slice(lastGT + 1);
  return raw.replace(/\w+(?::\w+)?="[^"]*"\s*/g, '').trim().replace(/\s+/g, ' ');
}

// ── Extracción de equipos ─────────────────────────────────────────────────────
// Patrón: "Nombre del equipo TAG N°XX-NNN" o "TAG N˚XX-NNN"
// Acepta los caracteres especiales ° ˚ O (cero/letra O por OCR)
const TAG_RE = /([^.\n\r;,]{4,60}?)\s+TAG\s+N[°˚O]([A-Z][A-Z0-9]{0,4}-\d{2,4})/gi;

function extraerEquipos(texto, tipo) {
  const equipos = [];
  const vistos  = new Set();

  for (const m of texto.matchAll(TAG_RE)) {
    const nombre = limpiarNombre(m[1]);
    const tagId  = m[2].trim().toUpperCase();
    if (!vistos.has(tagId) && nombre.length >= 5 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(nombre)) {
      equipos.push({ id: tagId, nombre, tipo });
      vistos.add(tagId);
    }
  }
  return equipos;
}

// ── Extracción de normas ──────────────────────────────────────────────────────
const NORM_PATTERNS = [
  { re: /ASTM\s+([A-Z]\d+(?:\/[A-Z]\d+M?)?(?:[:\-]\d+)?)/g,  prefijo: 'ASTM'  },
  { re: /ISO\s+(\d{3,6}(?:[:\-]\d+)*(?::\d{4})?)/g,           prefijo: 'ISO'   },
  { re: /API\s+((?:Spec\s+)?(?:\d{4}|5L|5CT|2B|6A|6D|7-1)(?:[:\-\s]\S+)?)/g, prefijo: 'API' },
  { re: /ASME\s+(BPVC\s+(?:Sección?\s+)?\S+)/gi,               prefijo: 'ASME'  },
  { re: /AWS\s+(D\d+\.\d+(?:[:\-]\d+)?(?:\s+\S+)?)/g,          prefijo: 'AWS'   },
  { re: /IRAM\s+(\d{4,6}(?:[:\-]\d+)?)/g,                      prefijo: 'IRAM'  },
];

// clase='norma' — el front filtra por n.clase === 'norma' en normasParaTipo()
function extraerNormas(texto, tipo) {
  const normas = [];
  const vistas = new Set();

  for (const { re, prefijo } of NORM_PATTERNS) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const codigo = `${prefijo} ${m[1].trim().replace(/\s+/g, ' ')}`;
      if (!vistas.has(codigo) && codigo.length < 60) {
        normas.push({ codigo, clase: 'norma', titulo: codigo, tipo, version: null });
        vistas.add(codigo);
      }
    }
  }
  return normas;
}

// ── Función principal ─────────────────────────────────────────────────────────

async function actualizarDesdeReferencias() {
  const report = {
    archivosLeidos:    0,
    equiposInsertados: 0,
    normasInsertadas:  0,
    porTipo:           [],
    errores:           [],
  };

  // Listar subdirectorios (excluir combinados/recientes — no tienen tipo específico)
  let subdirs;
  try {
    subdirs = fs.readdirSync(REF_DIR).filter(d => {
      if (d === 'combinados' || d === 'recientes') return false;
      try { return fs.statSync(path.join(REF_DIR, d)).isDirectory(); } catch { return false; }
    });
  } catch (e) {
    report.errores.push(`No se pudo leer ${REF_DIR}: ${e.message}`);
    return report;
  }

  const insEquipo = db.prepare(
    `INSERT OR IGNORE INTO equipos (id, nombre, tipo) VALUES (?, ?, ?)`
  );
  const insNorma  = db.prepare(
    `INSERT OR IGNORE INTO normas (codigo, clase, titulo, tipo, vigente) VALUES (?, ?, ?, ?, 1)`
  );

  for (const tipo of subdirs) {
    const dir = path.join(REF_DIR, tipo);
    let files;
    try {
      files = fs.readdirSync(dir)
        .filter(f => f.toLowerCase().endsWith('.docx') && !f.startsWith('~$'));
    } catch { continue; }

    let eqN = 0, normN = 0;

    for (const file of files) {
      try {
        const buf    = fs.readFileSync(path.join(dir, file));
        const texto  = docxATexto(buf);
        const equips = extraerEquipos(texto, tipo);
        const norms  = extraerNormas(texto, tipo);

        for (const eq of equips) {
          if (insEquipo.run(eq.id, eq.nombre, eq.tipo).changes > 0) {
            report.equiposInsertados++;
            eqN++;
          }
        }
        for (const norm of norms) {
          if (insNorma.run(norm.codigo, norm.clase, norm.titulo, norm.tipo).changes > 0) {
            report.normasInsertadas++;
            normN++;
          }
        }
        report.archivosLeidos++;
      } catch (e) {
        report.errores.push(`${tipo}/${file}: ${e.message}`);
      }
    }

    report.porTipo.push({ tipo, equipos: eqN, normas: normN });
    console.log(`[ACTUALIZADOR] ${tipo}: ${eqN} equipo(s), ${normN} norma(s)`);
  }

  console.log(`[ACTUALIZADOR] Total: ${report.equiposInsertados} equipos, ${report.normasInsertadas} normas`);
  return report;
}

module.exports = { actualizarDesdeReferencias };
