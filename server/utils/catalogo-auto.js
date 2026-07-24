// Absorción automática al catálogo: cuando el técnico llena un campo "Otro"
// (norma libre, ITM libre, equipo libre) al guardar un ensayo, se agrega
// automáticamente a las tablas `normas` y `equipos` para que la próxima vez
// aparezca en los desplegables.
//
// Idempotente: usa INSERT ... ON CONFLICT DO NOTHING.
// No falla el guardado del ensayo si algo sale mal — solo warn.

'use strict';

const db = require('../db');

// Campos de texto libre donde el técnico escribe una norma alternativa.
// Se buscan en `datos` y se agregan como `clase='norma'` al catálogo.
const CAMPOS_NORMA_LIBRE = [
  'norma',              // Impacto, Tracción (input "Otra:")
  'norma_otra',         // Brinell, Vickers, Rockwell, Químicos
  'norma_referencia',   // Plegado, Nick-break
  'norma_ensayo_otra',  // Plegado
  'metodo_ensayo',      // Nick-break (texto libre principal)
  'norma_ensayo',       // Ferrita-delta, macrografia (texto libre)
];

// Detecta si un string parece "norma canónica" (empieza con familia + código).
// Filtra basura tipo "eee", frases largas, etc.
const RX_NORMA_LOOK = /^(ASTM|ISO|API|AWS|DIN|SAE|ASME|IRAM|ASM)\b/i;

function pareceNorma(s) {
  const t = String(s || '').trim();
  if (t.length < 4 || t.length > 80) return false;
  return RX_NORMA_LOOK.test(t);
}

function normalizarNorma(n) {
  let s = String(n || '').trim().replace(/\s+/g, ' ');
  s = s.replace(/\b(ASTM|ISO|API|AWS|DIN|SAE)\s+([A-Z]{1,3})\s+(\d)/g, '$1 $2$3');
  s = s.replace(/\bEd\.\s+(\d)/g, 'Ed.$1').replace(/\bSecc\.\s+/g, 'Secc.');
  return s;
}

// Detecta ITM en texto: "ITM N°XXX" o "ITM XXX" o "itm 060".
const RX_ITM = /\bITM\s*N?[°˚]?\s*(\d{2,4})\b/i;
function extraerItm(s) {
  const m = RX_ITM.exec(String(s || ''));
  if (!m) return null;
  return 'ITM N°' + m[1].padStart(3, '0');
}

// Insertar norma si no existe. Devuelve 1 si insertó, 0 si ya estaba.
function upsertNorma(codigo, tipo) {
  if (!codigo) return 0;
  try {
    const info = db.prepare(`
      INSERT INTO normas (codigo, clase, titulo, tipo, vigente)
      VALUES (?, 'norma', ?, ?, 1)
      ON CONFLICT(codigo) DO NOTHING
    `).run(codigo, codigo, tipo || 'general');
    return info.changes || 0;
  } catch (e) {
    console.warn('[catalogo-auto] upsertNorma:', e.message);
    return 0;
  }
}

function upsertItm(codigo, tipo) {
  if (!codigo) return 0;
  try {
    const info = db.prepare(`
      INSERT INTO normas (codigo, clase, titulo, tipo, vigente)
      VALUES (?, 'itm', ?, ?, 1)
      ON CONFLICT(codigo) DO NOTHING
    `).run(codigo, codigo, tipo || 'general');
    return info.changes || 0;
  } catch (e) {
    console.warn('[catalogo-auto] upsertItm:', e.message);
    return 0;
  }
}

// Equipos extra ingresados por el técnico. Se guardan con id=TAG o nombre-slug.
function upsertEquipo(nombre, tag, tipo) {
  const nom = String(nombre || '').trim();
  const t   = String(tag || '').trim().replace(/\s+/g, '');
  if (!nom) return 0;
  const id = t || ('libre-' + nom.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40));
  try {
    const info = db.prepare(`
      INSERT INTO equipos (id, nombre, tipo, ensayos, activo)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET nombre = excluded.nombre, activo = 1
    `).run(id, nom, tipo || 'general', JSON.stringify(tipo ? [tipo] : []));
    return info.changes || 0;
  } catch (e) {
    console.warn('[catalogo-auto] upsertEquipo:', e.message);
    return 0;
  }
}

// Zonas de evaluación: campos comunes donde el técnico ingresa "Núcleo",
// "Superficie", "Soldadura", "Metal Base", etc. Se guardan como clase='zona'
// en la tabla `normas` (misma tabla, distinta clase — patrón ya usado para itm).
const CAMPOS_ZONA = [
  'zona_evaluacion',
  'zona_ensayo',
  'zona_examinada',
  'zonas_examinadas',
];

function upsertZona(codigo, tipo) {
  if (!codigo) return 0;
  try {
    const info = db.prepare(`
      INSERT INTO normas (codigo, clase, titulo, tipo, vigente)
      VALUES (?, 'zona', ?, ?, 1)
      ON CONFLICT(codigo) DO NOTHING
    `).run(codigo, codigo, tipo || 'general');
    return info.changes || 0;
  } catch (e) {
    console.warn('[catalogo-auto] upsertZona:', e.message);
    return 0;
  }
}

// Principal: absorbe todo lo que el técnico escribió como "libre" en el ensayo.
// Se llama justo después de que el ensayo se guarda con éxito.
function absorberOtros(datos, tipoEnsayo) {
  if (!datos || typeof datos !== 'object') return { normas: 0, itms: 0, equipos: 0, zonas: 0 };
  const stats = { normas: 0, itms: 0, equipos: 0, zonas: 0 };

  // 1. Normas libres en cualquier campo canónico
  for (const key of CAMPOS_NORMA_LIBRE) {
    const val = datos[key];
    if (!val || typeof val !== 'string') continue;
    // Puede ser texto multi-línea. Splitear por líneas y comas.
    const partes = val.split(/[\n,;/]+/).map(s => s.trim()).filter(Boolean);
    for (const p of partes) {
      if (pareceNorma(p)) stats.normas += upsertNorma(normalizarNorma(p), tipoEnsayo);
      const itm = extraerItm(p);
      if (itm) stats.itms += upsertItm(itm, tipoEnsayo);
    }
  }

  // 2. Metodología libre — puede contener "ITM N°XXX" u otra norma
  if (datos.metodologia && typeof datos.metodologia === 'string') {
    const itm = extraerItm(datos.metodologia);
    if (itm) stats.itms += upsertItm(itm, tipoEnsayo);
  }

  // 3. Códigos extra (impacto tiene cod_extra como textarea multilinea)
  if (datos.cod_extra && typeof datos.cod_extra === 'string') {
    const partes = datos.cod_extra.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    for (const p of partes) {
      if (pareceNorma(p)) stats.normas += upsertNorma(normalizarNorma(p), tipoEnsayo);
    }
  }

  // 4. Equipos libres — array de {nombre, tag} en formularios como Varios
  if (Array.isArray(datos.equipos_libres)) {
    for (const eq of datos.equipos_libres) {
      if (!eq) continue;
      const nombre = (eq.nombre || eq.label || '').toString().trim();
      const tag    = (eq.tag    || '').toString().trim();
      if (nombre) stats.equipos += upsertEquipo(nombre, tag, tipoEnsayo);
    }
  }

  // 5. Equipamiento_extra puede venir como array de {nombre, tag} o {id, nombre}
  if (Array.isArray(datos.equipamiento_extra)) {
    for (const eq of datos.equipamiento_extra) {
      if (!eq || typeof eq !== 'object') continue;
      const nombre = (eq.nombre || eq.label || '').toString().trim();
      const tag    = (eq.tag || eq.id || '').toString().trim();
      if (nombre) stats.equipos += upsertEquipo(nombre, tag, tipoEnsayo);
    }
  }

  // 6. Zonas de evaluación — texto libre que se auto-alimenta al desplegable.
  for (const key of CAMPOS_ZONA) {
    const val = datos[key];
    if (!val || typeof val !== 'string') continue;
    const partes = val.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    for (const p of partes) {
      if (p.length >= 2 && p.length <= 80) stats.zonas += upsertZona(p, tipoEnsayo);
    }
  }

  return stats;
}

module.exports = { absorberOtros };
