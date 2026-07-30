/**
 * agente-mapeo.js
 * Detecta desajustes entre los datos guardados en la DB (datos_json)
 * y lo que el template .docx espera recibir.
 *
 * Para cada tipo de ensayo verifica:
 * - Que todos los campos que el template usa con {{campo}} estén presentes en datos_json
 * - Que los tipos de datos sean correctos (número vs string vs array)
 * - Que campos calculables que faltan sean completados automáticamente
 *
 * Esto resuelve el problema de formularios HTML con campos que no mapean 1:1
 * con los placeholders del template Word.
 */

// ── Traducción v2 (formularios nuevos) → v1 (generators) ────────────────────
// Los formularios nuevos guardan campos con nombres simplificados.
// Los generators Word esperan la nomenclatura v1 histórica.
// Esta función hace el puente ANTES de cualquier otro procesamiento.

const QUIMICO_SYMBOL_TO_KEY = {
  C: 'carbono',   Mn: 'manganeso',  Si: 'silicio',  P: 'fosforo',
  S: 'azufre',    Cr: 'cromo',      Ni: 'niquel',   Mo: 'molibdeno',
  V: 'vanadio',   Cu: 'cobre',      Ti: 'titanio',  Nb: 'niobio',
  B: 'boro',      Al: 'aluminio',   Pb: 'plomo',    Co: 'cobalto',
  W: 'tungsteno', Mg: 'magnesio',   Fe: 'hierro',   N: 'nitrogeno',
  Sn: 'estano',   Zn: 'zinc',       Sb: 'antimonio', Cd: 'cadmio',
  As: 'arsenico', Se: 'selenio',    Bi: 'bismuto',  Ag: 'plata',
  Ceq: 'carb_eq',  // Carbono equivalente
};

function _derivarEquipamiento(tipo, variante, maquina) {
  const m = String(maquina || '').toLowerCase();
  const eq = {};
  switch (tipo) {
    case 'traccion':
      if (variante === 'neuquen' || m.includes('shimadzu')) eq.shimadzu = true;
      else if (m.includes('emic'))                          eq.emic     = true;
      break;
    case 'impacto':
      if (m.includes('wolpert'))   eq.wolpert   = true;
      if (m.includes('galdabini')) eq.galdabini = true;
      break;
    case 'plegado':
      if (m.includes('emic'))                        eq.maquina_emic    = true;
      else if (m.includes('torne'))                  eq.prensa_torne    = true;
      else if (m.includes('shimadzu'))               eq.maquina_shimadzu = true;
      break;
    case 'nick-break':
      if (m.includes('torne')) eq.prensa_torne  = true;
      else                     eq.maquina_emic  = true;
      break;
    case 'quimicos':
      if (m.includes('spectromax'))                  eq.spectromax_164    = true;
      else if (m.includes('spectrotest') && m.includes('463')) eq.spectrotest_463 = true;
      else if (m.includes('spectrotest'))            eq.spectrotest_361   = true;
      if (m.includes('shimadzu'))                    eq.aa_shimadzu_478   = true;
      if (m.includes('icp'))                         eq.icp_oes_371       = true;
      if (m.includes('rayos x') || m.includes('oxford')) eq.rayos_x_346  = true;
      if (m.includes('eltra'))                       eq.eltra_102         = true;
      break;
  }
  return eq;
}

function traducirV2aV1(tipo, datos) {
  let d = { ...datos };

  // norma → norma_ensayo (todos los tipos)
  if (!d.norma_ensayo && d.norma) d.norma_ensayo = d.norma;

  // equipamiento: derivar desde maquina string si no existe
  const eqVacio = !d.equipamiento || Object.keys(d.equipamiento).length === 0;
  if (eqVacio && (d.maquina || d.equipo)) {
    d.equipamiento = _derivarEquipamiento(tipo, d.variante, d.maquina || d.equipo);
  }

  switch (tipo) {
    case 'traccion': {
      // resultados[] v2 → muestras[] v1 con renombramiento de columnas
      if (!d.muestras && Array.isArray(d.resultados) && d.resultados.length > 0) {
        d.muestras = d.resultados.map(r => ({
          ...r,
          tension_fluencia:     r.fluencia     ?? r.tension_fluencia,
          resistencia_traccion: r.traccion     ?? r.resistencia_traccion,
          seccion_inicial:      r.area         ?? r.seccion_inicial,
          zona_rotura:          r.rotura_zona  ?? r.zona_rotura,
          diametro_promedio:    r.diametro     ?? r.diametro_promedio,
        }));
      }
      break;
    }
    case 'impacto': {
      // resultados[] v2 → grupos[].probetas[] v1, agrupando por zona si está presente
      if (!d.grupos && Array.isArray(d.resultados) && d.resultados.length > 0) {
        const acc = {};
        const orden = [];
        d.resultados.forEach(r => {
          const label = (r && r.zona ? String(r.zona).trim() : '');
          if (!acc[label]) { acc[label] = { label, probetas: [] }; orden.push(label); }
          acc[label].probetas.push({
            energia:      r.energia,
            temperatura:  r.temperatura || d.temperatura,
          });
        });
        d.grupos = orden.map(l => acc[l]);
      }
      // variante desde maquina si no está definida
      if (!d.variante && d.maquina) {
        d.variante = String(d.maquina).toLowerCase().includes('wolpert') ? 'caba' : 'neuquen';
      }
      // medida_probeta: alias de tipo_probeta (campo legacy del form)
      if (!d.medida_probeta && d.tipo_probeta) d.medida_probeta = d.tipo_probeta;
      break;
    }
    case 'plegado': {
      // equipo ID v2 → variante_equipo v1
      if (!d.variante_equipo) {
        if (d.equipo) {
          const MAP_EQ = { eq1: 'emic', eq2: 'torne', eq3: 'shimadzu', emic: 'emic', torne: 'torne', shimadzu: 'shimadzu' };
          d.variante_equipo = MAP_EQ[d.equipo] || d.equipo;
        } else if (d.maquina) {
          const m = String(d.maquina).toLowerCase();
          if (m.includes('emic'))     d.variante_equipo = 'emic';
          else if (m.includes('torne')) d.variante_equipo = 'torne';
          else if (m.includes('shimadzu')) d.variante_equipo = 'shimadzu';
        }
      }
      // resultados[] v2 → probetas[] v1. Normalizamos el ID según el tipo:
      // Cara → "PC N", Raíz → "PR N", Lateral → "PL N". La N se auto-numera
      // por tipo (restart cada vez que cambia el tipo), salvo que el usuario
      // haya escrito explícitamente el ID completo (ej. "PC 5").
      if (!d.probetas && Array.isArray(d.resultados) && d.resultados.length > 0) {
        const PREFIX = { cara: 'PC', 'raíz': 'PR', raiz: 'PR', lateral: 'PL' };
        const counter = { PC: 0, PR: 0, PL: 0 };
        d.probetas = d.resultados.map(r => {
          const raw = String(r.probeta || r.id || '').trim();
          const tipoKey = String(r.tipo || '').toLowerCase().trim();
          const prefix = PREFIX[tipoKey] || '';
          let id = raw;
          if (prefix) {
            const upper = raw.toUpperCase();
            const reFull = new RegExp('^' + prefix + '\\s*\\d+$', 'i');
            if (reFull.test(upper)) {
              // Usuario tipeó "PC 5" explícitamente → respetar
              id = upper.replace(/\s+/, ' ');
            } else {
              // Sin prefijo (ej. "1", "2", "") → auto-incrementar por tipo
              counter[prefix]++;
              id = `${prefix} ${counter[prefix]}`;
            }
          }
          return {
            id,
            tipo:               r.tipo,
            resultado:          r.resultado,
            cant_indicaciones:  r.cant_indicaciones,
            longitud_mm:        r.longitud_mm,
            // Preservar override multi-OT — el template filtra por _filtro_ot
            // usando este campo para emitir solo las probetas de la OT actual.
            nro_ot_override:    r.nro_ot_override,
          };
        });
      }
      // observaciones (v2) → observaciones_extra (template legacy) si no fue renombrado en el form
      if (!d.observaciones_extra && d.observaciones) d.observaciones_extra = d.observaciones;
      break;
    }
    case 'nick-break': {
      // variante_equipo desde variante (nuevo) o maquina (legacy)
      if (!d.variante_equipo) {
        if (d.variante === 'torne' || d.variante === 'emic') d.variante_equipo = d.variante;
        else if (d.maquina) {
          const m = String(d.maquina).toLowerCase();
          d.variante_equipo = m.includes('torne') ? 'torne' : 'emic';
        }
      }
      // norma libre → metodo_ensayo (legacy form usaba "norma")
      if (!d.metodo_ensayo && d.norma) d.metodo_ensayo = d.norma;
      // resultados[] v2 (DataTable) → probetas[] v1
      if (!d.probetas && Array.isArray(d.resultados) && d.resultados.length > 0) {
        d.probetas = d.resultados.map(r => ({
          id:             r.id || r.probeta,
          tipo_resultado: r.tipo_resultado || r.resultado,
          detalle:        r.detalle || '',
        }));
      }
      // variante_resultado v2 → probetas[0] v1 (fallback legacy)
      if (!d.probetas && d.variante_resultado) {
        d.probetas = [{ tipo_resultado: d.variante_resultado }];
      }
      // observaciones (v2 legacy) → observaciones_extra (template)
      if (!d.observaciones_extra && d.observaciones) d.observaciones_extra = d.observaciones;
      break;
    }
    case 'quimicos': {
      // Traducir norma texto libre → claves booleanas (backward compat con form viejo)
      if (d.norma && !d.norma_e415 && !d.norma_e1086 && !d.norma_e1251) {
        const nLow = String(d.norma).toLowerCase();
        if (nLow.includes('e415'))              d.norma_e415  = true;
        if (nLow.includes('e1086'))             d.norma_e1086 = true;
        if (nLow.includes('e1251'))             d.norma_e1251 = true;
        if (nLow.includes('e1999'))             d.norma_e1999 = true;
        if (nLow.includes('e3047'))             d.norma_e3047 = true;
        if (nLow.includes('e1019'))             d.norma_e1019 = true;
        if (!d.norma_e415 && !d.norma_e1086)   d.norma_e415  = true; // fallback
      }
      // Traducir metodologia → itm_numero (extrae el número "N°040" → "040")
      if (d.metodologia && !d.itm_numero) {
        const m = String(d.metodologia).match(/\d+/);
        if (m) d.itm_numero = m[0];
      }
      if (!d.muestras && Array.isArray(d.resultados) && d.resultados.length > 0) {
        if (d.resultados.length === 1) {
          // Una muestra → objeto elementos (formato legacy)
          const r = d.resultados[0];
          const elementos = { ...(d.elementos || {}) };
          for (const [sym, key] of Object.entries(QUIMICO_SYMBOL_TO_KEY)) {
            if (r[sym] != null && r[sym] !== '') elementos[key] = r[sym];
          }
          if (Object.keys(elementos).length > 0) d.elementos = elementos;
        } else {
          // Varias muestras → muestras[] con {columna_label, elementos{}}
          d.muestras = d.resultados.map(r => {
            const elementos = {};
            for (const [sym, key] of Object.entries(QUIMICO_SYMBOL_TO_KEY)) {
              if (r[sym] != null && r[sym] !== '') elementos[key] = r[sym];
            }
            return { columna_label: r.muestra || '', elementos };
          });
        }
      }
      break;
    }
    case 'dureza-brinell': {
      if (!d.carga_aplicada && d.carga) d.carga_aplicada = d.carga;
      // Traducir norma texto libre → keys booleanos del template (norma_astm_e10 / norma_iso6506)
      if (d.norma && !d.norma_astm_e10 && !d.norma_iso6506) {
        const nLow = String(d.norma).toLowerCase();
        if (nLow.includes('e10'))  d.norma_astm_e10 = true;
        if (nLow.includes('6506') || nLow.includes('iso')) d.norma_iso6506 = true;
      }
    } // fallthrough
    case 'dureza-rockwell': {
      if (tipo === 'dureza-rockwell') {
        if (!d.carga_aplicada && d.carga) d.carga_aplicada = d.carga;
        // Traducir norma texto libre → keys booleanos (norma_astm_e18 / norma_iso6508)
        if (d.norma && !d.norma_astm_e18 && !d.norma_iso6508) {
          const nLow = String(d.norma).toLowerCase();
          if (nLow.includes('e18'))  d.norma_astm_e18 = true;
          if (nLow.includes('6508') || nLow.includes('iso')) d.norma_iso6508 = true;
        }
        // Normalizar escala a mayúsculas (HRC, HRB, etc.)
        if (d.escala) d.escala = String(d.escala).toUpperCase().trim();
      }
    } // fallthrough
    case 'dureza-vickers': {
      if (!d.mediciones && Array.isArray(d.resultados) && d.resultados.length > 0) {
        d.mediciones = d.resultados.map((r, i) => ({
          dureza:   r.valor   ?? r.dureza,
          zona:     r.zona,
          impronta: r.impronta ?? String(i + 1),
        }));
      }
      // Traducir norma texto libre → keys booleanos del template (norma_astm_e92 / norma_astm_e384)
      if (tipo === 'dureza-vickers' && d.norma && !d.norma_astm_e92 && !d.norma_astm_e384) {
        const nLow = String(d.norma).toLowerCase();
        if (nLow.includes('e92'))  d.norma_astm_e92  = true;
        if (nLow.includes('e384')) d.norma_astm_e384 = true;
      }
      // carga (legacy/v2) → carga_aplicada (lo que lee el template)
      if (tipo === 'dureza-vickers' && !d.carga_aplicada && d.carga) {
        d.carga_aplicada = d.carga;
      }
      // norma_year_suffix → norma_astm_e92_ed / norma_astm_e384_ed
      if (tipo === 'dureza-vickers' && d.norma_year_suffix) {
        if (d.norma_astm_e92  && !d.norma_astm_e92_ed)  d.norma_astm_e92_ed  = d.norma_year_suffix;
        if (d.norma_astm_e384 && !d.norma_astm_e384_ed) d.norma_astm_e384_ed = d.norma_year_suffix;
      }
      break;
    }
    case 'ferrita-delta': {
      // Fischer: resultado → resultado_unico (alias usado en el template)
      if (!d.resultado_unico && d.resultado != null && d.resultado !== '') {
        d.resultado_unico = d.resultado;
      }
      // Microscopio modo tabla: probetas[].{nombre, zona_mb, zona_zac, zona_sold}
      // → tabla_*_c1/c2 flat fields (2 probetas máx, A y B).
      // Convención: probeta[0] = c1, probeta[1] = c2.
      if (d.variante === 'microscopio' && d.modo_resultado === 'tabla'
          && Array.isArray(d.probetas) && d.probetas.length > 0) {
        const p0 = d.probetas[0] || {};
        const p1 = d.probetas[1] || {};
        if (!d.tabla_mb_a_c1)    d.tabla_mb_a_c1    = p0.zona_mb   ?? '';
        if (!d.tabla_mb_a_c2)    d.tabla_mb_a_c2    = p1.zona_mb   ?? '';
        if (!d.tabla_zac_ra_c1)  d.tabla_zac_ra_c1  = p0.zona_zac  ?? '';
        if (!d.tabla_zac_ra_c2)  d.tabla_zac_ra_c2  = p1.zona_zac  ?? '';
        if (!d.tabla_sold_med_c1) d.tabla_sold_med_c1 = p0.zona_sold ?? '';
        if (!d.tabla_sold_med_c2) d.tabla_sold_med_c2 = p1.zona_sold ?? '';
      }
      break;
    }
  }

  return d;
}

// ── Campos esperados por el template para cada ensayo ───────────────────────
// Extraídos directamente de los generators (template-*.js)

const MAPA_CAMPOS = {
  traccion: {
    obligatorios: [
      'variante',        // 'estandar' o 'neuquen'
      'norma_ensayo',    // string
      'orientacion',     // string
      'temperatura',     // número
    ],
    porMuestra: [
      'resistencia_traccion',
      'tension_fluencia',
      'seccion_inicial',
      'carga_maxima',
      'alargamiento',
    ],
    calculables: {
      // Si diametro_promedio existe y seccion_inicial no → calcular π*d²/4
      seccion_inicial: (m) => {
        if ((m.seccion_inicial === '' || m.seccion_inicial == null) && m.diametro_promedio > 0) {
          const d = parseFloat(m.diametro_promedio);
          return +(Math.PI * d * d / 4).toFixed(2);
        }
        return null;
      },
      // Si longitud_inicial y longitud_final existen y alargamiento no → calcular
      alargamiento: (m) => {
        if ((m.alargamiento === '' || m.alargamiento == null) &&
            m.longitud_inicial > 0 && m.longitud_final > 0) {
          const pct = ((m.longitud_final - m.longitud_inicial) / m.longitud_inicial * 100);
          return +pct.toFixed(1);
        }
        return null;
      },
    },
  },

  impacto: {
    obligatorios: ['temperatura', 'medida_probeta', 'entalla'],
    porMuestra: ['energia'],
    calculables: {
      // energia_promedio calculable desde muestras
      energia_promedio: (datos) => {
        const energias = (datos.muestras || [])
          .map(m => parseFloat(m.energia))
          .filter(v => !isNaN(v) && v > 0);
        if (energias.length > 0 && (!datos.energia_promedio || datos.energia_promedio === '')) {
          return +(energias.reduce((a, b) => a + b, 0) / energias.length).toFixed(1);
        }
        return null;
      },
    },
  },

  plegado: {
    obligatorios: ['diametro_mandril'],
    porMuestra: ['resultado'],
    calculables: {},
    normalizaciones: {
      // Normalizar resultado → 'con' o 'sin' (lo que espera el generador Word)
      resultado: (v) => {
        if (!v) return 'sin';
        const s = String(v).toLowerCase().trim();
        if (s === 'con' || s.startsWith('con ') || s.includes('con indicaciones') ||
            s.includes('no aprobado') || s.includes('rechazado') || s.includes('falla') || s === 'fail')
          return 'con';
        return 'sin';
      },
    },
  },

  quimicos: {
    obligatorios: [],
    calculables: {
      // Detectar valores de elementos que parecen estar multiplicados por 100
      elementos: (datos) => {
        const elementos = datos.elementos || {};
        const corregido = { ...elementos };
        let huboCorreccion = false;
        for (const [elem, val] of Object.entries(elementos)) {
          const n = parseFloat(val);
          // Si el valor > 10 y el elemento no es Fe (hierro puede ser ~70-99%)
          if (!isNaN(n) && n > 10 && elem.toLowerCase() !== 'fe' && elem.toLowerCase() !== 'hierro') {
            corregido[elem] = +(n / 100).toFixed(4);
            huboCorreccion = true;
          }
        }
        return huboCorreccion ? corregido : null;
      },
    },
  },

  'dureza-brinell': {
    obligatorios: ['carga_aplicada'],
    calculables: {
      dureza_promedio: (datos) => {
        const meds = datos.mediciones || [];
        const durezas = meds.map(m => parseFloat(m.dureza)).filter(v => !isNaN(v) && v > 0);
        if (durezas.length > 0 && (!datos.dureza_promedio || datos.dureza_promedio === '')) {
          return +(durezas.reduce((a, b) => a + b, 0) / durezas.length).toFixed(1);
        }
        return null;
      },
    },
  },

  'dureza-rockwell': {
    obligatorios: ['escala'],
    calculables: {
      dureza_promedio: (datos) => {
        const meds = datos.mediciones || [];
        const durezas = meds.map(m => parseFloat(m.dureza)).filter(v => !isNaN(v));
        if (durezas.length > 0 && (!datos.dureza_promedio || datos.dureza_promedio === '')) {
          return +(durezas.reduce((a, b) => a + b, 0) / durezas.length).toFixed(1);
        }
        return null;
      },
    },
  },

  'dureza-vickers': {
    obligatorios: [],
    calculables: {
      dureza_promedio: (datos) => {
        // Buscar mediciones en formato m1_dureza, m2_dureza, etc.
        const durezas = [];
        for (let i = 1; i <= 20; i++) {
          const v = parseFloat(datos[`m${i}_dureza`]);
          if (!isNaN(v) && v > 0) durezas.push(v);
        }
        // También buscar en array mediciones[]
        (datos.mediciones || []).forEach(m => {
          const v = parseFloat(m.dureza || m.hv);
          if (!isNaN(v) && v > 0) durezas.push(v);
        });
        if (durezas.length > 0 && (!datos.dureza_promedio || datos.dureza_promedio === '')) {
          return +(durezas.reduce((a, b) => a + b, 0) / durezas.length).toFixed(1);
        }
        return null;
      },
    },
  },
};

/**
 * Verifica y autocorrige el mapeo entre datos_json y el template.
 * @param {string} tipo - Tipo de ensayo
 * @param {object} datos - datos_json ya parseado
 * @returns {{ datos: object, correcciones: string[], advertencias: string[] }}
 */
function verificarMapeo(tipo, datos) {
  const mapa = MAPA_CAMPOS[tipo];
  if (!mapa) return { datos, correcciones: [], advertencias: [] };

  const correcciones = [];
  const advertencias = [];
  // Traducir campos v2 (formularios nuevos) a v1 (generators) antes de cualquier procesamiento
  let d = traducirV2aV1(tipo, { ...datos });

  // 1. Campos calculables a nivel de OT/datos raíz
  for (const [campo, calcFn] of Object.entries(mapa.calculables || {})) {
    const resultado = calcFn(d);
    if (resultado !== null) {
      d[campo] = resultado;
      correcciones.push(`${campo} calculado automáticamente: ${resultado}`);
    }
  }

  // 2. Campos calculables por muestra (tracción)
  if (mapa.calculables && d.muestras && Array.isArray(d.muestras)) {
    d.muestras = d.muestras.map((muestra, idx) => {
      const m = { ...muestra };
      for (const [campo, calcFn] of Object.entries(mapa.calculables)) {
        if (typeof calcFn === 'function') {
          const resultado = calcFn(m);
          if (resultado !== null) {
            m[campo] = resultado;
            correcciones.push(`Muestra ${idx + 1}: ${campo} calculado = ${resultado}`);
          }
        }
      }
      return m;
    });
  }

  // 3. Normalizaciones (plegado)
  if (mapa.normalizaciones && d.probetas && Array.isArray(d.probetas)) {
    d.probetas = d.probetas.map((p, idx) => {
      const np = { ...p };
      for (const [campo, normFn] of Object.entries(mapa.normalizaciones)) {
        if (np[campo] !== undefined) {
          const normalizado = normFn(np[campo]);
          if (normalizado !== np[campo]) {
            np[campo] = normalizado;
            correcciones.push(`Probeta ${idx + 1}: ${campo} normalizado a "${normalizado}"`);
          }
        }
      }
      return np;
    });
  }

  // 4. Campos obligatorios faltantes → advertencia
  for (const campo of (mapa.obligatorios || [])) {
    if (d[campo] === undefined || d[campo] === '' || d[campo] === null) {
      advertencias.push(`Campo obligatorio vacío: ${campo}`);
    }
  }

  return { datos: d, correcciones, advertencias };
}

module.exports = { verificarMapeo, traducirV2aV1 };
