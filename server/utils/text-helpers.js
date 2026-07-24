// Utilities de normalización de texto para los generators.

// sentenceCase: convierte un texto libre a "Sólo primera letra en mayúscula".
// - Preserva palabras que están intencionalmente en mayúsculas (tags TAG N°,
//   normas ASTM, ISO, códigos), detectando siglas de 2+ letras seguidas.
// - Deja el resto en minúsculas.
// - Si el texto ya está en mixed-case razonable (ej. empieza con mayúscula y
//   sigue en minúsculas), lo devuelve tal cual.
//
// Ejemplos:
//   "LUEGO DEL ENSAYO LA MUESTRA PRESENTA..."  → "Luego del ensayo la muestra presenta..."
//   "Luego del ensayo la muestra..."           → "Luego del ensayo la muestra..." (sin cambios)
//   "Norma ASTM E290 aplicada"                 → "Norma ASTM E290 aplicada" (respeta siglas)
function sentenceCase(text) {
  if (text == null) return '';
  const s = String(text);
  if (!s.trim()) return s;

  // Contar cuántos caracteres alfabéticos hay y cuántos están en mayúscula.
  // Si más del 75% de las letras están en mayúscula, asumimos "todo en mayúsculas"
  // y aplicamos la conversión. Esto tolera acentos y espacios.
  let letters = 0, upper = 0;
  for (const ch of s) {
    if (/[a-záéíóúüñ]/i.test(ch)) {
      letters++;
      if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper++;
    }
  }
  if (letters === 0) return s;
  const ratio = upper / letters;
  if (ratio < 0.75) return s; // No es "todo mayúsculas"; respetar formato original.

  // Convertir a lowercase pero preservando siglas comunes que el usuario
  // podría querer en mayúsculas (ASTM, ISO, ASME, API, AWS, DIN, HRC, HB, HV,
  // OAA, HB, MPa, MM, PMM, TAG, etc.). Al pasar todo a lowercase primero y
  // luego re-aplicar mayúsculas específicamente donde hace falta.
  let out = s.toLowerCase();

  // Capitalizar primera letra alfabética (saltando comillas/espacios iniciales).
  out = out.replace(/([^\wáéíóúüñ]*)([a-záéíóúüñ])/u, (_, pre, ch) => pre + ch.toUpperCase());

  // Restaurar siglas comunes en unidades técnicas.
  const siglas = [
    'ASTM','ISO','ASME','API','AWS','DIN','HRC','HRB','HB','HV','HRA',
    'MPa','GPa','OAA','ITM','FM','WPS','PQR','NDT','LP','UT','RT','MT',
    'BPVC','SEP','FN','TAG','SOL','ID','QW','PBB','PC','PR','PL',
    'IX','V','III','VIII','II','IV','VI','VII',
  ];
  for (const sig of siglas) {
    const re = new RegExp('\\b' + sig.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    out = out.replace(re, sig);
  }

  // Restaurar prefijos "N°/n°" y "N°XXX" (TAGs).
  out = out.replace(/n°\s*/gi, 'N°');
  // Restaurar prefijos alfanuméricos de TAGs: MM-XXX, PMM-XXX, PCAL-XXX, HB-XXX.
  out = out.replace(/\b(mm|pmm|pcal|hb)-(\w+)/gi, (m, pref, rest) =>
    pref.toUpperCase() + '-' + rest.toUpperCase());

  return out;
}

// Normaliza el formato de normas y códigos de referencia para el output del
// laboratorio (convención Labtesa):
//   1. Sacar la variante métrica "/XxxM" redundante:
//        "ASTM E8/E8M-25"          → "ASTM E8-25"
//        "ASTM A193/A193M-26"      → "ASTM A193-26"
//        "AWS D1.1/D1.1M:2020"     → "AWS D1.1:2020"
//   2. Sacar el sufijo entre paréntesis que duplica el año/edición:
//        "AWS D1.1:2020 (:2020)"   → "AWS D1.1:2020"
//        "ASTM A193-26 (-26)"      → "ASTM A193-26"
//        "ISO 6892-1:2019 (2019)"  → "ISO 6892-1:2019"
//   3. Colapsar espacios múltiples.
// Se aplica a cada norma individual (no a listas separadas por " y "). Si el
// input viene vacío, devuelve vacío.
function normalizarNorma(s) {
  if (s == null) return '';
  let out = String(s);
  // 1) Sacar /XxxM redundante. Ej: "E8/E8M", "A193/A193M", "D1.1/D1.1M".
  out = out.replace(/(\b[A-Z]\d[\w.]*?)\/\1M\b/g, '$1');
  // 2) Sacar sufijo entre paréntesis que duplique el año/edición.
  //    Detecta "(-NN)", "(:NNNN)", "(NNNN)" y también los ya sin paréntesis pero
  //    con duplicación semántica al final ("E8-25 -25" — poco común).
  out = out.replace(/\s*\(\s*[-:]?\s*\d{2,4}[a-z]?\s*\)\s*$/i, '');
  // 3) Espacios múltiples.
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out;
}

module.exports = { sentenceCase, normalizarNorma };
