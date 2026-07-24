/**
 * agente-ensayo.js
 * Agente especializado por tipo de ensayo.
 * Solo valida y devuelve errores/advertencias — NO devuelve datos_corregidos
 * para evitar respuestas JSON truncadas. Los datos originales se usan tal cual
 * si no hay errores críticos.
 */

const fetch = require('node-fetch');

const REGLAS = {
  traccion: `
Sos un experto en ensayos de tracción (ASTM A370, ASME IX, API 1104, API 5L).

IMPORTANTE — Filas excluidas por el usuario:
Si en los datos aparece el campo "filas_excluidas" con una lista de claves
(ej: ["resistencia_traccion", "tension_fluencia"]), esas filas fueron eliminadas
manualmente desde el formulario porque NO corresponden a este ensayo en particular.
NO debés reportarlas como ausentes ni como errores: directamente ignoralas.

Analizá los datos y reportá:
ERRORES CRÍTICOS (impiden generar el informe), solo para filas NO excluidas:
- resistencia_traccion ausente o <= 0 en alguna muestra
- tension_fluencia > resistencia_traccion (incoherencia física)
- seccion_inicial ausente o <= 0
ADVERTENCIAS (no bloquean), solo para filas NO excluidas:
- alargamiento vacío
- unidades inconsistentes entre muestras
- norma_ensayo vacía con cod_asme=true (sugerir ASTM A370-24)
- tension_fluencia/resistencia_traccion > 1 (relación inusual)
`,
  impacto: `
Sos un experto en ensayos de impacto Charpy (ASTM E23, ISO 148-1, ASME IX).

ESTRUCTURA DE DATOS: los resultados vienen en "grupos", donde cada grupo tiene
un "label" (zona/ubicación opcional: Soldadura, ZAC, etc.) y una lista de "probetas",
cada una con "energia" y opcionalmente "temperatura". La energía puede ser un valor
no numérico válido como ">240" (cuando supera el máximo del péndulo) — NO lo marques como error.
La temperatura puede ir en condiciones (campo "temperatura") O por probeta en la tabla
(cuando "incluir_temperatura_tabla" es true). El valor "AMB" (ambiente) es válido.

Analizá los datos y reportá:
ERRORES CRÍTICOS:
- algún grupo sin ninguna probeta con energía cargada
- ninguna fuente de temperatura: campo "temperatura" vacío Y "incluir_temperatura_tabla" false
ADVERTENCIAS:
- entalla no es "V" ni "U"
- si "temperatura" es numérica y está fuera de rango -196°C a 200°C
- norma_ensayo vacía
NO reportar como problema: energía ">240", temperatura "AMB", medida de probeta "otra"
con medida_probeta_otra cargada, ni grupos con label vacío (es opcional).
`,
  plegado: `
Sos un experto en ensayos de plegado (ASTM E190-21, ISO 5173, ASME IX, API 1104).

ESTRUCTURA: los resultados vienen en "probetas", cada una con "id" (ej "PC 1", "PR 1",
"PL 1"), "tipo" (Cara/Raíz/Lateral/Metal Base, opcional), "resultado" ("sin"=Sin
indicaciones, "con"=Con indicaciones) y, si es "con", "cant_indicaciones" y "longitud_mm".
El diámetro de mandril puede ser numérico ("90") o texto válido ("3 Espesores", "4 Espesores").
La norma de ensayo puede estar ausente (a veces solo hay metodología). La columna
"Tipo de plegado" es opcional (incluir_tipo_plegado puede ser false → tabla de 2 columnas).

Analizá los datos y reportá:
ERRORES CRÍTICOS:
- ninguna probeta cargada
- espesor_probeta ausente o <= 0
ADVERTENCIAS:
- alguna probeta con resultado "con" pero sin longitud_mm ni cant_indicaciones
- ancho_probeta vacío
NO reportar como problema: diámetro mandril en texto ("N Espesores"), norma de ensayo
ausente, tipo de plegado vacío, ni resultados "Sin/Con indicaciones" (son los valores correctos).
`,
  'nick-break': `
Sos un experto en ensayos de Nick Break (API 1104).

ESTRUCTURA: los resultados vienen en "probetas", cada una con "id" (ej "NB 1", "NB 2"),
"tipo_resultado" (uno de: "No presenta indicaciones relevantes", "Presenta escoria",
"Presenta poro", "Presenta indicación", o "otro") y "detalle" opcional con las
dimensiones (LxA para escoria, diámetro para poro, longitud o LxA para indicación).

Analizá los datos y reportá:
ERRORES CRÍTICOS:
- ninguna probeta cargada
- más de 6 probetas (límite del formulario)
ADVERTENCIAS:
- alguna probeta con "Presenta escoria/poro/indicación" pero sin "detalle"
  (la observación detallada se omite si no hay detalle, lo que puede ser intencional)
- temperatura ausente
NO reportar como problema: temperatura sin unidad explícita "°C" (el generador la agrega),
mecanizado_segun ausente, método de ensayo ausente (sólo metodología es requerida).
`,

  quimicos: `
Sos un experto en análisis químico de materiales metálicos (ASTM E415, E1086, E1251, E1019).
Analizá los datos y reportá:
ERRORES CRÍTICOS:
- ningún elemento con valor numérico en datos.elementos
- algún elemento con valor > 100% 
ADVERTENCIAS:
- C (carbono) > 2.14% (posible fundición)
- ninguna norma ASTM seleccionada
`,
  'dureza-brinell': `
Sos un experto en ensayos de dureza Brinell (ASTM E10, ISO 6506).
Analizá los datos y reportá:
ERRORES CRÍTICOS:
- ninguna medición con dureza HB > 0
- carga_aplicada ausente
ADVERTENCIAS:
- más de 6 mediciones (template soporta solo 6)
- dureza_promedio vacía (calculable)
- alguna medición con impronta pero sin dureza
`,
  'dureza-rockwell': `
Sos un experto en ensayos de dureza Rockwell (ASTM E18, ISO 6508).
Analizá los datos y reportá:
ERRORES CRÍTICOS:
- ninguna medición con dureza > 0
- escala ausente (debe ser HRA, HRB, HRC, HRD, HRE, HRF, HRG o HRH)
ADVERTENCIAS:
- más de 6 mediciones (template soporta solo 6)
- dureza_promedio vacía (calculable)
- carga incoherente con la escala (HRC=150, HRB=100, HRA=60 kgf, etc.)
- indentador incoherente (cono diamante para HRA/HRC/HRD, bola para HRB/HRE/HRF/HRG/HRH)
`,
  'dureza-vickers': `
Sos un experto en ensayos de dureza Vickers (ASTM E92, ISO 6507).
Analizá los datos y reportá:
ERRORES CRÍTICOS:
- ninguna medición con dureza HV > 0
ADVERTENCIAS:
- carga_aplicada ausente
- dureza_promedio vacía (calculable)
- variación entre mediciones > 20% (posible error de tipeo)
`,
};

function buildPrompt(tipo, datos, ot) {
  const regla = REGLAS[tipo] || 'Validá que los datos del ensayo estén completos y sean coherentes.';
  return `${regla}

DATOS OT: nro_ot=${ot.nro_ot}, cliente=${ot.razon_social}

DATOS DEL ENSAYO:
${JSON.stringify(datos, null, 2)}

Respondé ÚNICAMENTE con este JSON exacto (sin markdown, sin texto extra):
{"ok":true,"errores":[],"advertencias":[]}

- "ok": false si hay al menos un error crítico, true si no
- "errores": lista de strings con errores críticos (vacía si ninguno)
- "advertencias": lista de strings con advertencias (vacía si ninguna)
Sé conciso: máximo 1 oración por ítem.`;
}

async function llamarClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada en .env');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.content.map(b => b.text || '').join('');
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    // Intentar extraer JSON parcial con regex
    const match = clean.match(/\{[\s\S]*"ok"\s*:\s*(true|false)[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    // Si falla todo, loguear y devolver ok con advertencia
    console.warn(`[agente-ensayo] JSON no parseable para ${tipo}, usando fallback`);
    return { ok: true, errores: [], advertencias: ['No se pudo completar la validación automática'] };
  }
}

async function validarEnsayo(tipo, datos, ot) {
  try {
    const prompt = buildPrompt(tipo, datos, ot);
    const resultado = await llamarClaude(prompt);

    // Capa de seguridad: filtrar errores/advertencias que mencionen una key excluida.
    // Si el usuario eliminó la fila del form, no debe reportarse como problema.
    const excluidas = Array.isArray(datos?.filas_excluidas) ? datos.filas_excluidas : [];
    const mencionaKeyExcluida = (msg) =>
      excluidas.some(k => typeof msg === 'string' && msg.toLowerCase().includes(k.toLowerCase()));

    const erroresFiltrados      = (resultado.errores      || []).filter(e => !mencionaKeyExcluida(e));
    const advertenciasFiltradas = (resultado.advertencias || []).filter(a => !mencionaKeyExcluida(a));

    return {
      tipo,
      ok: erroresFiltrados.length === 0,
      errores: erroresFiltrados,
      advertencias: advertenciasFiltradas,
      datos_corregidos: datos, // siempre devolver los originales
    };
  } catch (err) {
    console.error(`[agente-ensayo] Error validando ${tipo}:`, err.message);
    return {
      tipo,
      ok: true,
      errores: [],
      advertencias: [`Validación no disponible: ${err.message}`],
      datos_corregidos: datos,
    };
  }
}

module.exports = { validarEnsayo };
