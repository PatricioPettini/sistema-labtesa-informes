'use strict';

/**
 * agente-verificador-campos.js
 * Verifica que datos_json tenga los campos que los generators Word necesitan.
 * Entiende tanto la nomenclatura v1 (generators) como v2 (formularios nuevos).
 * Se ejecuta DESPUÉS del mapeo y ANTES de la generación Word.
 */

// ── Custom checks ─────────────────────────────────────────────────────────────

function verificarFerrita(datos) {
  const errores = [], advertencias = [];
  const v = datos.variante || 'fischer';
  if (v === 'fischer') {
    if (datos.resultado_unico == null || datos.resultado_unico === '')
      errores.push('falta resultado_unico (porcentaje de ferrita)');
  } else {
    const arr = datos.probetas || datos.resultados || [];
    if (!arr.length) errores.push('tabla de zonas de ferrita delta vacía');
  }
  return { errores, advertencias };
}

// ── Tabla de requisitos ───────────────────────────────────────────────────────
// arrayCampos: [keys[], descripción] — alguno de keys[] debe tener datos
// camposReq:   [{campo, alias?, desc}] — campo requerido (alias acepta v2 equivalente)
// equipamiento: true → debe existir equipamiento{} con al menos un key activo,
//               o al menos un campo maquina/equipo con texto

const REQUISITOS = {
  traccion: {
    arrayCampos: [['muestras', 'resultados'], 'muestras con resultados de tracción'],
    camposReq: [
      { campo: 'variante',     alias: [],        desc: 'variante del ensayo (estandar/neuquen)' },
      { campo: 'norma_ensayo', alias: ['norma'], desc: 'norma del ensayo' },
    ],
    equipamiento: true,
  },
  impacto: {
    arrayCampos: [['grupos', 'resultados'], 'probetas con energía absorbida'],
    camposReq: [
      { campo: 'temperatura', alias: [], desc: 'temperatura de ensayo (°C)' },
    ],
    equipamiento: true,
  },
  plegado: {
    arrayCampos: [['probetas', 'resultados'], 'probetas con resultado'],
    camposReq: [
      { campo: 'variante_equipo', alias: ['equipo'], desc: 'equipo (emic/torne/shimadzu)' },
    ],
    equipamiento: true,
  },
  'nick-break': {
    arrayCampos: null,
    camposReq: [
      { campo: 'probetas', alias: ['variante_resultado'], desc: 'resultado del ensayo' },
    ],
    equipamiento: true,
  },
  quimicos: {
    arrayCampos: [['muestras', 'resultados', 'elementos'], 'muestras con composición química'],
    camposReq: [],
    equipamiento: true,
  },
  'dureza-brinell': {
    arrayCampos: [['mediciones', 'resultados'], 'mediciones de dureza'],
    camposReq: [
      { campo: 'carga_aplicada', alias: ['carga'], desc: 'carga aplicada (kgf)' },
    ],
    equipamiento: true,
  },
  'dureza-rockwell': {
    arrayCampos: [['mediciones', 'resultados'], 'mediciones de dureza Rockwell'],
    camposReq: [
      { campo: 'escala', alias: [], desc: 'escala (HRA/HRB/HRC/...)' },
    ],
    equipamiento: true,
  },
  'dureza-vickers': {
    arrayCampos: [['mediciones', 'resultados', 'm1_dureza'], 'mediciones de dureza Vickers'],
    camposReq: [],
    equipamiento: true,
  },
  'ferrita-delta': {
    arrayCampos: null,
    camposReq: [
      { campo: 'variante', alias: [], desc: 'variante (fischer/microscopio)' },
    ],
    equipamiento: false,
    custom: verificarFerrita,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function tieneArrayDatos(datos, keys) {
  for (const k of keys) {
    if (k === 'elementos') {
      const el = datos.elementos;
      if (el && typeof el === 'object' && Object.keys(el).length > 0) return true;
    } else if (k === 'm1_dureza') {
      if (datos.m1_dureza != null && datos.m1_dureza !== '') return true;
    } else {
      const arr = datos[k];
      if (Array.isArray(arr) && arr.length > 0) return true;
    }
  }
  return false;
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * @param {string} tipo  - tipo de ensayo
 * @param {object} datos - datos_json ya parseado (post-mapeo)
 * @returns {{ ok: boolean, errores: string[], advertencias: string[], tipo: string }}
 */
function verificarCampos(tipo, datos) {
  const errores = [], advertencias = [];
  const req = REQUISITOS[tipo];
  if (!req) return { ok: true, errores: [], advertencias: [], tipo };

  // 1. Array de datos principal
  if (req.arrayCampos) {
    const [keys, desc] = req.arrayCampos;
    if (!tieneArrayDatos(datos, keys)) {
      errores.push(`sin ${desc}`);
    }
  }

  // 2. Campos requeridos / alias v2
  for (const r of (req.camposReq || [])) {
    const v1ok = datos[r.campo] != null && datos[r.campo] !== '';
    const v2ok = (r.alias || []).some(a => datos[a] != null && datos[a] !== '');
    if (!v1ok && !v2ok) {
      advertencias.push(`campo "${r.campo}" faltante (${r.desc})`);
    } else if (!v1ok && v2ok) {
      const alias = (r.alias || []).find(a => datos[a] != null);
      advertencias.push(`"${r.campo}" guardado como "${alias}" — mapeo lo traducirá`);
    }
  }

  // 3. Equipamiento
  if (req.equipamiento) {
    const tieneEqObj = datos.equipamiento &&
      typeof datos.equipamiento === 'object' &&
      Object.values(datos.equipamiento).some(Boolean);
    const tieneMaquina = (datos.maquina && String(datos.maquina).trim()) ||
                         (datos.equipo  && String(datos.equipo).trim());
    if (!tieneEqObj && !tieneMaquina) {
      advertencias.push('equipamiento no especificado');
    } else if (!tieneEqObj && tieneMaquina) {
      advertencias.push('equipamiento como texto libre — mapeo lo traducirá');
    }
  }

  // 4. Custom
  if (req.custom) {
    const r = req.custom(datos);
    errores.push(...r.errores);
    advertencias.push(...r.advertencias);
  }

  const ok = errores.length === 0;
  return {
    ok,
    errores:      errores.map(e  => `[${tipo}] ${e}`),
    advertencias: advertencias.map(a => `[${tipo}] ${a}`),
    tipo,
  };
}

module.exports = { verificarCampos };
