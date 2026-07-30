/**
 * agente-pre-emision.js
 *
 * Análisis de coherencia con Claude ANTES de emitir el Word.
 *
 * Complementa el QA de reglas fijas (`runQA` en el front) con un check
 * semántico: rangos plausibles, unidades, valores imposibles, mismatch entre
 * norma y tipo de ensayo, temperaturas fuera de rango, diámetros que crecen
 * post-ensayo (imposible), typos en normas, etc.
 *
 * Devuelve una lista de hallazgos con severidad:
 *   - critico:  bloquea la emisión (dato imposible o incoherente)
 *   - warning:  emisión posible pero conviene revisar
 *   - info:     nota informativa (redundancia, tip, etc.)
 *
 * El técnico decide igual: el agente NO decide si el informe puede emitirse.
 * Solo aporta contexto.
 */
'use strict';

const fetch = require('node-fetch');

const MODELO = process.env.AGENTE_PRE_EMISION_MODELO || 'claude-sonnet-4-6';
const MAX_TOKENS = 3000;
const API_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT_SYSTEM = `Sos un revisor experto en ensayos metalúrgicos de laboratorio.
Tu trabajo es revisar los datos de una OT antes de emitir el informe Word y detectar
problemas de coherencia: rangos plausibles, unidades, valores físicamente imposibles,
inconsistencia entre norma citada y tipo de ensayo, temperaturas fuera de rango,
diámetros que crecen después del ensayo (imposible en tracción), etc.

No repitas checks obvios (por ejemplo "falta la norma" o "faltan datos" — eso ya lo
chequea otra herramienta). Concentrate en hallazgos que un humano podría dejar pasar:
- Valores fuera de rango típico para el material (comparar contra rangos de aceros al
  carbono/inoxidables/aleados).
- Unidades incoherentes (ej. "temperatura 220" cuando lo típico son ~22).
- Norma citada que NO aplica al tipo de ensayo (ej. ASTM E23 en tracción).
- Edición de norma obsoleta.
- Diámetro final > diámetro inicial en tracción (imposible: la probeta se estricta).
- Cargas de fluencia mayores que carga máxima (imposible).
- Alargamientos absurdos (>60% en aceros).
- Falta de coherencia entre ensayos de la misma OT (ej. distintas normas para el
  mismo material).

Devuelvo SIEMPRE JSON válido con esta forma exacta:
{
  "hallazgos": [
    {
      "severidad": "critico" | "warning" | "info",
      "ensayo": "traccion" | "..." (opcional si aplica a la OT completa),
      "campo": "temperatura" | ... (opcional),
      "mensaje": "descripción breve del problema, en español, tono técnico",
      "sugerencia": "qué revisar o corregir" (opcional)
    }
  ]
}

Si no encontrás nada preocupante, devolvé: {"hallazgos": []}

NO agregues texto fuera del JSON. NO uses markdown fences.`;

function _resumenEnsayo(e) {
  // Reducimos a los campos relevantes para no gastar tokens en metadata inútil.
  const d = e.datos || {};
  const keep = {};
  const camposImportantes = [
    'variante', 'norma', 'norma_ensayo', 'metodologia', 'temperatura',
    'norma_iso6892_1', 'norma_iso6892_1_year',
    'norma_astm_e8', 'norma_astm_e8_year',
    'norma_iso148_1', 'norma_iso148_1_year',
    'norma_astm_e23', 'norma_astm_e23_year',
    'norma_astm_e92', 'norma_astm_e384',
    'norma_astm_e10', 'norma_iso6506',
    'norma_e415', 'norma_e1086', 'norma_e1251', 'norma_e1999',
    'carga_aplicada', 'tipo_muestra', 'equipo',
    'muestras', 'resultados', 'grupos', 'probetas',
    'material', 'espesor', 'diametro',
  ];
  for (const k of camposImportantes) if (d[k] !== undefined) keep[k] = d[k];
  return { tipo: e.tipo, datos: keep };
}

async function _llamarClaude(userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada en .env');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      system: PROMPT_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error('Claude API ' + res.status + ': ' + body.slice(0, 300));
  }
  const data = await res.json();
  const text = data.content.map(b => b.text || '').join('');
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); }
  catch (_) {
    // Fallback: intentar extraer el primer objeto JSON del texto.
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (__) {} }
    throw new Error('Respuesta de Claude no es JSON válido: ' + clean.slice(0, 200));
  }
}

/**
 * Analiza una OT y sus ensayos y devuelve hallazgos de coherencia.
 *
 * @param {object} ot - row de la tabla ots
 * @param {Array<{tipo, datos_json|datos}>} ensayos - rows de ensayos
 * @returns {Promise<{ hallazgos: Array<{severidad, ensayo, campo, mensaje, sugerencia}>, modelo, ms }>}
 */
async function analizar(ot, ensayos) {
  const t0 = Date.now();
  const ensayosResumen = (ensayos || []).map(e => {
    let datos = e.datos;
    if (!datos && e.datos_json) {
      try { datos = JSON.parse(e.datos_json); } catch (_) { datos = {}; }
    }
    return _resumenEnsayo({ tipo: e.tipo, datos: datos || {} });
  });

  const userMessage = [
    'Revisá coherencia de esta OT antes de emitir el informe.',
    '',
    'OT: ' + (ot.nro_ot || ''),
    'Cliente: ' + (ot.razon_social || ''),
    'ID muestra: ' + (ot.id_muestra || ''),
    'Fecha recepción: ' + (ot.fecha_recepcion || ''),
    '',
    'Ensayos (' + ensayosResumen.length + '):',
    JSON.stringify(ensayosResumen, null, 2),
  ].join('\n');

  const resp = await _llamarClaude(userMessage);
  const hallazgos = Array.isArray(resp && resp.hallazgos) ? resp.hallazgos : [];
  return { hallazgos, modelo: MODELO, ms: Date.now() - t0 };
}

module.exports = { analizar };
