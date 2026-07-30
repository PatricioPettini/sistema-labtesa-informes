'use strict';
/*
 * Parser compartido para tarjetas de Trello. Unifica la lógica del endpoint
 * /trello/card (api.js) y del bot (bot-trello.js), y suma soporte para
 * formatos reales del laboratorio detectados en la auditoría:
 *   - Títulos con paréntesis al final: "CLIENTE - 38269 (VER COMENTARIOS)".
 *   - `(O.T. NNNNN)` en línea suelta seguido de líneas `M1:`, `M2:`.
 *   - `Muestra N (OT: NNNNN):` como alias de `M<n> (O.T. NNNNN):`.
 *   - `OT: NNNNN` inline al inicio de la línea.
 *   - `M1 y M2 (OT: NNNNN): desc` (dos muestras misma OT).
 */

// Regex de invisibles construida a partir de escapes explícitos — evita meter
// los caracteres literales en el source (que rompía el parseo del archivo).
const INVIS_CHARS = '\\u00A0\\u2000-\\u200D\\u2028\\u2029\\u202F\\u205F\\u2060\\uFEFF';
const INVIS_RE       = new RegExp('[' + INVIS_CHARS + ']', 'g');
const INVIS_TRIM_L   = new RegExp('^[\\s' + INVIS_CHARS + ']+');
const INVIS_TRIM_R   = new RegExp('[\\s' + INVIS_CHARS + ']+$');

// ── Parser de TÍTULO ─────────────────────────────────────────────────────
function parsearTitulo(titulo) {
  const t = String(titulo || '').trim();
  let clienteNombre = t;
  let nroSolicitudRaw = '';

  if (t.includes(' - ')) {
    clienteNombre = t.split(' - ')[0].trim();
    // Buscar TODOS los "- <numero>" y quedarnos con el último. Tolera texto
    // o paréntesis DESPUÉS del número (fix del hallazgo de la auditoría).
    const matches = [...t.matchAll(/\s-\s+(\d{3,})(?=\s|$|\()/g)];
    if (matches.length > 0) {
      nroSolicitudRaw = matches[matches.length - 1][1];
    }
  } else {
    const lastSpace = t.lastIndexOf(' ');
    if (lastSpace >= 0) {
      clienteNombre = t.slice(0, lastSpace).trim();
      const cand = t.slice(lastSpace + 1).trim();
      if (/^\d+$/.test(cand)) nroSolicitudRaw = cand;
    }
  }
  const nro_solicitud = String(parseInt(nroSolicitudRaw, 10) || nroSolicitudRaw);
  return { cliente_nombre: clienteNombre, nro_solicitud };
}

// ── Limpieza de id_muestra ──────────────────────────────────────────────
// Colapsa espacios, filtra líneas vacías / "Ensayos requeridos:", saca
// caracteres Unicode invisibles (NBSP, ZWSP, ZWNJ, ZWJ, BOM, etc.) que Trello
// inserta y rompen el layout del Word.
function limpiarIdMuestra(texto) {
  const lineas = String(texto || '').split('\n')
    .map(p => String(p || '').replace(INVIS_RE, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0)
    .filter(p => !/^\s*ensayos\s+requeridos/i.test(p));
  return lineas.join('\n')
    .replace(/^["'“”]|["'“”]$/g, '')
    .replace(INVIS_TRIM_L, '')
    .replace(INVIS_TRIM_R, '');
}

// ── Parser de DESCRIPCIÓN → array de OTs ─────────────────────────────────
// State machine: recorre líneas; mantiene "OT activa" para líneas con M<n>
// sin OT inline. Cierra al ver "Observaciones:".
function parsearOtsDeDesc(desc) {
  const s = String(desc || '').replace(/\*\*/g, '').replace(/__/g, '');
  const lineas = s.split('\n');
  const ots = [];
  let otActual = null;   // { nro_ot } — contexto para líneas M sin OT inline
  let partesActual = null;

  function cerrarActual() {
    if (partesActual) {
      const ultima = ots[ots.length - 1];
      if (ultima) ultima.id_muestra = limpiarIdMuestra(partesActual.join('\n'));
      partesActual = null;
    }
  }

  const OT_INLINE_PAREN     = /\(\s*O\.?T\.?\s*:?\s*(\d+)\s*\)/i;
  const OT_INLINE_SIN_PAREN = /^\s*O\.?T\.?\s*:?\s*(\d+)\b/i;
  // Formatos históricos que el parser viejo aceptaba:
  //   "OT1 (534355): SEPARADOR SB-807"  → muestra 1, ot 534355
  //   "OT12 (534355): xxx"              → muestra 12, ot 534355
  const OT_PEGADO           = /^\s*OT\s*(\d+)\s*\(\s*(\d+)\s*\)/i;
  // "M<n>" o "Muestra <n>" al principio de la línea O después de un ")" (formato
  // "(OT n) M1:"). Acepta variantes con "Nº", "N°", "No" en medio:
  //   "M1"                    → n=1
  //   "Muestra 1"             → n=1
  //   "MUESTRA Nº 1"          → n=1
  //   "MUESTRA N° 1"          → n=1
  //   "M1 y M2"               → n=1, n2=2
  //   "MUESTRA Nº 1 y MUESTRA Nº 2" → n=1, n2=2
  const M_PREFIX            = /(?:^\s*|\)\s*)(?:M|Muestra)\s*(?:N\s*[°ºoOº]?\s*)?(\d+)(?:\s+y\s+(?:M|Muestra)\s*(?:N\s*[°ºoOº]?\s*)?(\d+))?/i;

  for (const linea of lineas) {
    const trim = linea.trim();
    if (/^Observaciones:/i.test(trim)) { cerrarActual(); break; }
    if (!trim) continue;

    // Caso especial: "OT1 (534355): desc" — muestra=1, ot=534355.
    const otPeg = trim.match(OT_PEGADO);
    if (otPeg) {
      cerrarActual();
      const descTexto = trim.replace(OT_PEGADO, '').replace(/^\s*:?\s*(?:ID:)?\s*/i, '').trim();
      ots.push({ muestra: otPeg[1], nro_ot: otPeg[2].trim(), id_muestra: descTexto });
      partesActual = [descTexto];
      otActual = { nro_ot: otPeg[2].trim() };
      continue;
    }

    let otEnLinea = null;
    const mPar = trim.match(OT_INLINE_PAREN);
    if (mPar) otEnLinea = mPar[1];
    else {
      const mSin = trim.match(OT_INLINE_SIN_PAREN);
      if (mSin) otEnLinea = mSin[1];
    }

    const mm = trim.match(M_PREFIX);
    const muestrasEnLinea = [];
    if (mm) {
      muestrasEnLinea.push(mm[1]);
      if (mm[2]) muestrasEnLinea.push(mm[2]);
    }

    // Extraer descripción (después del último ":", o después de "ID:").
    let descTexto = trim;
    const colonIdx = trim.lastIndexOf(':');
    if (colonIdx >= 0) descTexto = trim.slice(colonIdx + 1).trim();
    descTexto = descTexto.replace(/^ID:\s*/i, '').trim();

    if (muestrasEnLinea.length > 0) {
      cerrarActual();
      const nroOt = otEnLinea || (otActual && otActual.nro_ot) || '';
      for (const numM of muestrasEnLinea) {
        ots.push({ muestra: numM, nro_ot: String(nroOt).trim(), id_muestra: descTexto });
      }
      partesActual = [descTexto];
      if (otEnLinea) otActual = { nro_ot: otEnLinea };
    } else if (otEnLinea) {
      cerrarActual();
      otActual = { nro_ot: otEnLinea };
    } else if (partesActual) {
      partesActual.push(trim);
    }
  }
  cerrarActual();
  return ots;
}

function parsearTarjeta(card, urlOriginal) {
  const titulo = card.name || '';
  const t = parsearTitulo(titulo);
  const desc = (card.desc || '').replace(/\*\*/g, '').replace(/__/g, '');
  const nroClienteM = desc.match(/^(?:Nro\s+)?Cliente:\s*(\S+)/m);
  const nro_cliente = (nroClienteM && nroClienteM[1] && nroClienteM[1].trim()) || '';
  const ots = parsearOtsDeDesc(card.desc);
  return {
    nro_solicitud: t.nro_solicitud,
    nro_cliente,
    cliente_nombre: t.cliente_nombre,
    ots,
    trello_url: urlOriginal,
  };
}

// ── Mapeo checklist → tipo de ensayo (extendido con hallazgos reales) ────
const MAPEO_ENSAYOS = [
  { re: /\btracci[oó]n\b/i,                          tipo: 'traccion' },
  { re: /\bdureza\s+brinell\b|\bbrinell\b/i,         tipo: 'dureza-brinell' },
  { re: /\bdureza\s+vickers\b|\bvickers\b/i,         tipo: 'dureza-vickers' },
  { re: /\bdureza\s+rockwell\b|\brockwell\b/i,       tipo: 'dureza-rockwell' },
  { re: /\bimpacto\b|\bcharpy\b/i,                   tipo: 'impacto' },
  { re: /\bplegado\b|\bmecanizado\s+de\s+plegados?\b/i, tipo: 'plegado' },
  { re: /\bnick\s*break\b/i,                         tipo: 'nick-break' },
  { re: /\bferrita\b/i,                              tipo: 'ferrita-delta' },
  { re: /\banexo\s+metalogr[aá]fico\b/i,             tipo: 'anexo-metalografico' },
  { re: /\bespesor\s+recubrim/i,                     tipo: 'metalografia-general' },
  { re: /\bmetalograf/i,                             tipo: 'metalografia-general' },
  { re: /\bmacrograf/i,                              tipo: 'macrografia' },
  { re: /\brugosidad\b/i,                            tipo: 'rugosidad' },
  { re: /\bqu[íi]mic/i,                              tipo: 'quimicos' },
  { re: /\banalisis\s+de\s+materiales?\s+por\s+RX\b|\bespectrometr[íi]a\b/i, tipo: 'quimicos' },
  { re: /\bELTRA\b|\bC\s+Y\s+S\b/i,                  tipo: 'quimicos' },
  { re: /\bl[íi]quidos?\s+penetrantes\b|\bpenetrantes\b/i, tipo: 'liquidos-penetrantes' },
  { re: /\btratamientos?\s+t[eé]rmicos?\b/i,         tipo: 'tratamientos-termicos' },
];

const SKIP_ITEMS_RE = /\bfinalizaci[oó]n\b|\bfin\s+de\s+ensayos?\b/i;

// Extrae la lista de muestras que aplican a un checklist según su nombre.
// Casos soportados:
//   "Ensayos - M1"          → [1]
//   "M1 a M33" / "M1-M33"    → [1..33]  (rango)
//   "M1 al M5"               → [1..5]
//   "M1, M3, M5" / "M1 y M4" → [1, 3, 5]
//   "Ensayos M12"           → [12]
// Sin M<n> → [] (checklist no aplica a ninguna muestra).
function extraerMuestrasDeChecklistName(name) {
  const s = String(name || '');
  const nums = new Set();
  // 1) Rango "M<a> a/al/hasta/- M<b>". Puede omitir la M del segundo lado.
  const range = s.match(/M\s*(\d+)\s*(?:a|al|hasta|-|–|—)\s*M?\s*(\d+)/i);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (!isNaN(a) && !isNaN(b) && a <= b && (b - a) < 200 /* sanity: evita explotar con typos */) {
      for (let i = a; i <= b; i++) nums.add(i);
      return [...nums].sort((x, y) => x - y);
    }
  }
  // 2) Lista simple: extraer todos los "M<n>" del nombre.
  const list = [...s.matchAll(/M\s*(\d+)/gi)].map(mm => parseInt(mm[1], 10)).filter(n => !isNaN(n));
  list.forEach(n => nums.add(n));
  return [...nums].sort((x, y) => x - y);
}

function detectarEnsayosPorMuestra(card) {
  const out = {};
  const chks = Array.isArray(card.checklists) ? card.checklists : [];
  for (const chk of chks) {
    const numsM = extraerMuestrasDeChecklistName(chk.name);
    if (numsM.length === 0) continue;
    const items = Array.isArray(chk.checkItems) ? chk.checkItems : [];
    const tipos = new Set();
    for (const it of items) {
      const txt = String(it.name || '');
      if (SKIP_ITEMS_RE.test(txt)) continue;
      for (const { re, tipo } of MAPEO_ENSAYOS) {
        if (re.test(txt)) { tipos.add(tipo); break; }
      }
    }
    if (tipos.size > 0) {
      for (const numM of numsM) {
        // Merge: si otra checklist ya cargó tipos para esta muestra, agregamos.
        const prev = new Set(out[numM] || []);
        tipos.forEach(t => prev.add(t));
        out[numM] = [...prev];
      }
    }
  }
  return out;
}

module.exports = {
  parsearTitulo,
  parsearOtsDeDesc,
  parsearTarjeta,
  limpiarIdMuestra,
  detectarEnsayosPorMuestra,
  MAPEO_ENSAYOS,
};
