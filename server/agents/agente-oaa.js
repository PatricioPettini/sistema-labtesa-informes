/**
 * agente-oaa.js
 * Detecta automáticamente si un ensayo está dentro del alcance de la
 * acreditación OAA (LE 012, LABTESA — sede Brandsen 2933, CABA).
 *
 * Reglas extraídas del PDF "OAA Certificado de Acreditacion 17025.pdf"
 * (emitido 12-dic-2024, vigente):
 *
 *   Aceros — Resistencia a la tracción a temperatura ambiente
 *           ISO 6892-1 (2019) / ASTM E8/E8M (2024)
 *   Aceros — Ensayo de impacto Charpy entre -80 °C y +50 °C hasta 130 J
 *           ISO 148-1 (2016) / ASTM E23 (2024)
 *   Aceros — Dureza Vickers en aceros 10 kgf
 *           ISO 6507-1 (2024) / ASTM E92 (2023)
 *   Materiales Metálicos — Plegado
 *           ASTM E190 (2021) / ISO 5173 (2023)
 *
 * Brinell, Rockwell, Análisis químico, Nick-Break y Ferrita delta NO
 * están dentro del alcance: nunca son acreditados.
 *
 * Sede: solo CABA (Brandsen 2933). Cualquier ensayo de Neuquén nunca
 * es acreditado.
 */

// ── Normas acreditadas con EDICIÓN exacta (regex por tipo de ensayo) ─────────
// Solo la edición indicada en el certificado OAA LE 012 cuenta como acreditado.
// Otras ediciones de la misma norma (ej. ASTM E8-25 vs E8-24) NO son acreditadas.
//
// Formatos aceptados: edición como año "24", "2024" o "(2024)" o "-24" etc.
const NORMAS_ACRED = {
  // ASTM E8/E8M (2024)  o  ISO 6892-1 (2019)
  traccion: [
    /ASTM\s*E\s*8(?:\s*\/\s*E\s*8\s*M)?[\s\-/:(]*(?:20)?24\b/i,
    /ISO\s*6892[\s\-]*1[\s\-:(]*(?:20)?19\b/i,
  ],
  // ASTM E23 (2024)  o  ISO 148-1 (2016)
  impacto: [
    /ASTM\s*E\s*23[\s\-/:(]*(?:20)?24\b/i,
    /ISO\s*148[\s\-]*1[\s\-:(]*(?:20)?16\b/i,
  ],
  // ASTM E92 (2023)  o  ISO 6507-1 (2024)
  'dureza-vickers': [
    /ASTM\s*E\s*92[\s\-/:(]*(?:20)?23\b/i,
    /ISO\s*6507[\s\-]*1[\s\-:(]*(?:20)?24\b/i,
  ],
  // ASTM E190 (2021)  o  ISO 5173 (2023)
  plegado: [
    /ASTM\s*E\s*190[\s\-/:(]*(?:20)?21\b/i,
    /ISO\s*5173[\s\-:(]*(?:20)?23\b/i,
  ],
};

// ── Identificadores de sede acreditada (variante o equipo activo) ────────────
// La acreditación cubre solo la sede CABA (Brandsen 2933). Para plegado,
// cualquier equipo de CABA cuenta (no solo EMIC). Hoy el único variant
// mapeado a CABA es 'emic'; si en el futuro hay más, ampliar EQUIPOS_CABA.
const EQUIPOS_PLEGADO_CABA = new Set(['emic']);  // ampliar si se suman equipos en CABA
const SEDE_ACRED = {
  traccion:        v => v === 'estandar',     // 'estandar' = CABA. 'neuquen' = NO.
  impacto:         v => v === 'caba',          // 'caba' = Wolpert (CABA). 'neuquen' = Galdabini → NO.
  'dureza-vickers': () => true,                // sin variantes; el durómetro Vickers está en CABA.
  plegado:         (_, datos) => EQUIPOS_PLEGADO_CABA.has(datos.equipo),
};

// ── Reglas adicionales por ensayo ─────────────────────────────────────────────
//
// Cada checker devuelve null si pasa la regla, o un objeto {motivo, regla}
// si falla. La primera regla que falla determina la razón.
const REGLAS_EXTRA = {
  traccion: [
    (datos) => {
      // Temperatura ambiente = entre 15 y 30 °C (o el texto literal "AMB"/"AMBIENTE").
      const raw = String(datos.temperatura == null ? '' : datos.temperatura).trim();
      if (raw === '') return { motivo: 'Falta temperatura (debe ser "AMB" o un valor entre 15 y 30 °C).', regla: 'temp-ambiente' };
      if (/^amb(\.|iente)?$/i.test(raw)) return null; // "AMB" o "AMBIENTE" cuentan
      const t = parseFloat(raw.replace(',', '.'));
      if (Number.isNaN(t)) {
        return { motivo: `Temperatura "${raw}" no es un valor válido (esperado: "AMB" o número entre 15 y 30 °C).`, regla: 'temp-formato' };
      }
      if (t < 15 || t > 30) {
        return { motivo: `Temperatura ${t} °C fuera del rango ambiente acreditado (15 a 30 °C).`, regla: 'temp-rango' };
      }
      return null;
    },
  ],
  impacto: [
    (datos) => {
      // Temperatura entre -80 y +50 °C. Acepta números o "ambiente" (asume ~22).
      const raw = String(datos.temperatura == null ? '' : datos.temperatura).trim();
      if (raw === '') return { motivo: 'Falta temperatura.', regla: 'temp-faltante' };
      if (/^amb(\.|iente)?$/i.test(raw)) return null; // ambiente cae dentro del rango
      const t = parseFloat(String(raw).replace(',', '.'));
      if (Number.isNaN(t)) return { motivo: `Temperatura "${raw}" no es un número válido.`, regla: 'temp-formato' };
      if (t < -80 || t > 50) return { motivo: `Temperatura ${t} °C fuera del rango acreditado (-80 a +50 °C).`, regla: 'temp-rango' };
      return null;
    },
    (datos) => {
      // Energía individual máxima 130 J. Soporta ambos formatos:
      // datos.grupos[].probetas[] (v1) y datos.resultados[] (v2).
      const probetasGrupos = (datos.grupos || []).flatMap(g => g.probetas || []);
      const probetasFlat   = datos.resultados || [];
      const probetas = [...probetasGrupos, ...probetasFlat];
      for (const p of probetas) {
        const e = parseFloat(String(p.energia == null ? '' : p.energia).replace(',', '.'));
        if (!Number.isNaN(e) && e > 130) {
          return { motivo: `Energía ${e} J supera el límite acreditado (130 J).`, regla: 'energia' };
        }
      }
      return null;
    },
  ],
  'dureza-vickers': [
    (datos) => {
      // Carga aplicada DEBE ser 10 kgf.
      const raw = String(datos.carga_aplicada == null ? '' : datos.carga_aplicada).trim().replace(',', '.');
      const c = parseFloat(raw);
      if (Number.isNaN(c) || c !== 10) {
        return { motivo: `Carga ${raw || '(vacía)'} kgf no es 10 kgf (único valor acreditado).`, regla: 'carga' };
      }
      return null;
    },
  ],
  plegado: [
    (datos) => {
      // Solo soldadura es acreditable.
      const tm = String(datos.tipo_muestra || '').toLowerCase().trim();
      if (tm !== 'soldadura') {
        return { motivo: `Tipo de muestra "${datos.tipo_muestra || '(no especificado)'}" — solo soldadura está acreditada.`, regla: 'tipo-muestra' };
      }
      return null;
    },
  ],
};

// ── Tipos NUNCA acreditados (fuera del alcance OAA) ──────────────────────────
const FUERA_DE_ALCANCE = new Set([
  'dureza-brinell', 'dureza-rockwell', 'quimicos', 'nick-break', 'ferrita-delta',
]);

// ── Función principal ─────────────────────────────────────────────────────────
/**
 * @param {string} tipo  - tipo de ensayo (traccion, impacto, ...)
 * @param {object} datos - datos del ensayo (datos_json parseado)
 * @returns {{ acreditado: boolean, motivo: string, regla: string }}
 */
function detectarAcreditacion(tipo, datos) {
  if (FUERA_DE_ALCANCE.has(tipo)) {
    return { acreditado: false, motivo: 'Este tipo de ensayo no está incluido en el alcance OAA acreditado.', regla: 'fuera-alcance' };
  }
  const normas = NORMAS_ACRED[tipo];
  if (!normas) {
    return { acreditado: false, motivo: `Tipo "${tipo}" sin alcance OAA configurado.`, regla: 'sin-config' };
  }

  // 1. Sede
  const variante = datos.variante;
  const sedeCheck = SEDE_ACRED[tipo];
  if (sedeCheck && !sedeCheck(variante, datos)) {
    return { acreditado: false, motivo: `Sede no acreditada (variante / equipo "${variante || datos.equipo || '?'}" — la acreditación cubre solo CABA).`, regla: 'sede' };
  }

  // 2. Norma — debe matchear con la EDICIÓN exacta del certificado.
  // Para vickers: la norma viene split en `datos.norma` + `datos.norma_year_suffix`.
  // Para impacto: además de `datos.norma` (input libre), el form nuevo tiene
  // checkboxes `norma_iso148_1`, `norma_astm_e23`, `norma_din_10045` con año
  // opcional en `<key>_year`. Se componen todos en un string único para el chequeo.
  const partesNorma = [];
  partesNorma.push(String(datos.norma_ensayo || datos.norma || datos.metodo_ensayo || ''));
  if (tipo === 'impacto') {
    if (datos.norma_iso148_1) {
      const y = String(datos.norma_iso148_1_year || '').trim();
      partesNorma.push('ISO 148-1' + (y || ':2016'));
    }
    if (datos.norma_astm_e23) {
      const y = String(datos.norma_astm_e23_year || '').trim();
      partesNorma.push('ASTM E23' + (y || '-24'));
    }
    if (datos.norma_din_10045) {
      const y = String(datos.norma_din_10045_year || '').trim();
      partesNorma.push('DIN EN 10045' + y);
    }
  }
  if (tipo === 'traccion') {
    // Los form nuevos tienen checkboxes con input de año al lado. Sólo el año
    // acreditado (ISO 6892-1:2019, ASTM E8-24) hace que el ensayo sea acred.
    // Si el usuario ingresó otra edición → NO pasa el regex → NO acreditado.
    if (datos.norma_iso6892_1) {
      const y = String(datos.norma_iso6892_1_year || '').trim();
      partesNorma.push('ISO 6892-1' + (y || ':2019'));
    }
    if (datos.norma_astm_e8) {
      const y = String(datos.norma_astm_e8_year || '').trim();
      partesNorma.push('ASTM E8' + (y || '-24'));
    }
  }
  let norma = partesNorma.filter(Boolean).join(' | ');
  if (tipo === 'dureza-vickers' && datos.norma_year_suffix) {
    norma = `${norma}${datos.norma_year_suffix}`;
  }
  const normaOk = normas.some(re => re.test(norma));
  if (!normaOk) {
    return { acreditado: false, motivo: `Norma "${norma || '(no especificada)'}" no coincide con ${normaNombres(tipo)}. La acreditación es solo para esa edición exacta.`, regla: 'norma' };
  }

  // 3. Reglas extra
  const reglas = REGLAS_EXTRA[tipo] || [];
  for (const r of reglas) {
    const fail = r(datos);
    if (fail) return { acreditado: false, motivo: fail.motivo, regla: fail.regla };
  }

  // 4. Pasa todo → acreditado
  return { acreditado: true, motivo: motivoOk(tipo, datos), regla: 'ok' };
}

function normaNombres(tipo) {
  return {
    traccion:         'ASTM E8/E8M (2024) o ISO 6892-1 (2019)',
    impacto:          'ASTM E23 (2024) o ISO 148-1 (2016)',
    'dureza-vickers': 'ASTM E92 (2023) o ISO 6507-1 (2024)',
    plegado:          'ASTM E190 (2021) o ISO 5173 (2023)',
  }[tipo] || '';
}

function motivoOk(tipo, datos) {
  const norma = datos.norma_ensayo || datos.norma || datos.metodo_ensayo || '';
  switch (tipo) {
    case 'traccion':         return `Acreditado — Tracción ${norma} a temperatura ambiente (15–30 °C), sede CABA.`;
    case 'impacto':          return `Acreditado — Charpy ${norma} dentro de -80/+50 °C y ≤130 J, sede CABA.`;
    case 'dureza-vickers':   return `Acreditado — Vickers 10 kgf ${norma}, sede CABA.`;
    case 'plegado':          return `Acreditado — Plegado ${norma} sobre soldadura, sede CABA.`;
    default:                 return 'Acreditado.';
  }
}

/**
 * Detecta acreditación para una lista de ensayos. 100% automático, sin
 * intervención manual del técnico.
 *
 * Regla del `*` (asterisco) en el Word:
 *   El asterisco marca los ensayos NO acreditados (para diferenciarlos de
 *   los acreditados en el mismo informe). Solo se aplica cuando el informe
 *   tiene una MEZCLA de ensayos acreditados y no acreditados:
 *     - 1 solo ensayo (acreditado o no) → SIN *
 *     - todos acreditados → SIN *
 *     - todos no acreditados → SIN *
 *     - mezcla acred + no acred → los NO acreditados llevan *
 *
 * @param {Array<{tipo:string, datos:object, id:number}>} ensayos
 * @returns {Array<{id, tipo, acreditado, motivo, regla, aplica_asterisco, hay_mix}>}
 */
function detectarLote(ensayos) {
  const detecciones = ensayos.map(e => {
    const det = detectarAcreditacion(e.tipo, e.datos || {});
    return {
      id:          e.id,
      tipo:        e.tipo,
      acreditado:  det.acreditado,
      motivo:      det.motivo,
      regla:       det.regla,
    };
  });

  // Mix → al menos uno acreditado Y al menos uno no acreditado
  const hayAcred   = detecciones.some(d => d.acreditado);
  const hayNoAcred = detecciones.some(d => !d.acreditado);
  const hayMix     = hayAcred && hayNoAcred;

  return detecciones.map(d => ({
    ...d,
    aplica_asterisco: hayMix && !d.acreditado,
    hay_mix: hayMix,
  }));
}

/**
 * Aplica las decisiones de acreditación a una lista de ensayos antes de generar
 * el Word. Setea `datos.oaa` y `datos.nota_oaa` con el valor `aplica_asterisco`
 * (NO acreditado dentro de un informe con mezcla acred + no acred).
 *
 * Detección 100% automática, sin overrides manuales.
 *
 * @param {Array<{id, tipo, datos_json}>} ensayosDB - rows de la tabla ensayos
 * @returns {Array<{id, tipo, datos_json}>}
 */
function aplicarDecisionesOAA(ensayosDB) {
  const ensayosParsed = ensayosDB.map(e => {
    let datos = {};
    try { datos = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : (e.datos_json || {}); } catch {}
    return { id: e.id, tipo: e.tipo, datos };
  });
  const detecciones = detectarLote(ensayosParsed);
  const byId = new Map(detecciones.map(d => [String(d.id), d]));

  return ensayosDB.map(e => {
    let datos = {};
    try { datos = typeof e.datos_json === 'string' ? JSON.parse(e.datos_json) : (e.datos_json || {}); } catch {}
    const det = byId.get(String(e.id));
    const marca = !!(det && det.aplica_asterisco);
    // `_es_acreditado` refleja la detección real del ensayo, independiente
    // del asterisco (que sólo aparece con mezcla). Los generators lo usan
    // para decidir formato específico (ej. tracción: nota "parámetros (*)").
    const esAcred = !!(det && det.acreditado);
    const next = { ...datos, oaa: marca, nota_oaa: marca, _es_acreditado: esAcred };
    return { ...e, datos_json: JSON.stringify(next) };
  });
}

module.exports = { detectarAcreditacion, detectarLote, aplicarDecisionesOAA };
