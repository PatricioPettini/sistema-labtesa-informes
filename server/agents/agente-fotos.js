/**
 * agente-fotos.js
 *
 * Distribuye las fotos de recepción de una solicitud entre sus OTs hermanas.
 *
 * Contexto: en la carpeta SOL de una solicitud hay N imágenes; en la solicitud
 * hay K OTs (una por muestra). El agente decide QUÉ IMAGEN va con QUÉ OT.
 *
 * Reglas del laboratorio que Claude debe aprovechar:
 *   - Las imágenes suelen nombrarse con "M1", "M2", ..., "OT534909", números
 *     de colada, IDs de probeta, etc.
 *   - El `id_muestra` de cada OT trae pistas: "M1", "M4", "Colada 21294",
 *     "L1 1"– M1 y L1 1"– M2", etc.
 *   - Cuando hay ambigüedad (una foto podría ser de varias OTs o de ninguna),
 *     dejar sin asignar antes que asignar mal.
 *
 * Devuelve un JSON: { asignaciones: [{ filename, nro_ot | null, motivo }] }.
 * "nro_ot: null" significa "no matcheo con ninguna OT específica" — el caller
 * puede decidir si esas fotos se asignan a la primera OT o se descartan.
 */
'use strict';

const fetch = require('node-fetch');

const MODELO = process.env.AGENTE_FOTOS_MODELO || 'claude-haiku-4-5';
const MAX_TOKENS = 3500;
const API_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT_SYSTEM = `Sos el organizador de fotos de recepción de un laboratorio metalúrgico.
Cada solicitud tiene 1 o varias OTs numeradas por ORDEN de recepción (1°, 2°, 3°…).
En la carpeta de la solicitud hay fotos que corresponden a distintas muestras/OTs.
Tu trabajo es asignar cada archivo a la OT correcta usando pistas del filename y del
id_muestra + orden de cada OT.

Patrones de matching (aplicalos con criterio, no todos aplican siempre):

1. Por MUESTRA (M<n> en id_muestra):
   - Filename con "M1", "M2", ..., "Mn" → OT cuyo id_muestra mencione esa muestra
     (ej. filename "M1.jpg" con id_muestra "L1 1\"– M1" → matchea).

2. Por ORDEN de la OT dentro de la solicitud (MUY IMPORTANTE):
   - Filename con "Foto N 1", "Foto N 2", "N1", "N 2", "foto 1", "foto 2",
     "muestra 1", "muestra 2", "1.jpg", "2.jpg" → la OT en la posición
     correspondiente (orden=1, orden=2…).
   - Ejemplo: "Foto N 2.jpeg" en una solicitud de 2 OTs → matchea con la OT que
     tiene orden=2 (segunda cargada).
   - Este es el patrón MÁS FRECUENTE cuando los id_muestra no traen M<n>.

3. Por nro_ot literal:
   - "OT534909" o "534909" en el filename → esa OT específica.

4. Por identificadores del id_muestra:
   - Números de colada, códigos de probeta o serie que aparezcan también en el
     filename (ej. filename "coladas-21294.jpg" + id_muestra "COLADA N°21294 M3"
     → matchea).

5. Fotos GENÉRICAS de la solicitud:
   - "Foto General", "general", "portada", "conjunto", "caja", "etiqueta",
     "totalidad" → nro_ot: null.
   - Nota: el caller usa las genéricas SÓLO como fallback si una OT no tiene
     ninguna foto específica. Preferí siempre asignar a una OT específica si
     hay pistas plausibles (por orden, muestra, etc.) — y dejar null solamente
     cuando la foto claramente muestra toda la solicitud/embalaje/etiquetado.

6. Sin pistas útiles:
   - Filename sin patrón claro → nro_ot: null.

Reglas:
- Ante ambigüedad, preferí null antes que asignar mal.
- Cada archivo asignado va a UNA sola OT (salvo genéricos = null).
- Devolvé SIEMPRE JSON válido con esta forma exacta:

{
  "asignaciones": [
    { "filename": "Foto N 1.jpeg", "nro_ot": "536016", "motivo": "N 1 → primera OT (orden=1)" },
    { "filename": "Foto N 2.jpeg", "nro_ot": "536017", "motivo": "N 2 → segunda OT (orden=2)" },
    { "filename": "Foto General.jpeg", "nro_ot": null, "motivo": "genérica de la solicitud" }
  ]
}

No agregues texto fuera del JSON. No uses markdown fences.`;

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
      model: MODELO, max_tokens: MAX_TOKENS,
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
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (__) {} }
    throw new Error('Respuesta de Claude no es JSON válido: ' + clean.slice(0, 200));
  }
}

/**
 * Asigna archivos a OTs. Solo se llama cuando hay ambigüedad real (múltiples
 * OTs hermanas y sin subcarpeta "OT <nro>").
 *
 * @param {Array<string>} filenames - nombres de archivo (basenames).
 * @param {Array<{nro_ot, id_muestra, orden}>} ots - OTs hermanas de la solicitud.
 * @returns {Promise<{ asignaciones: Array<{filename, nro_ot|null, motivo}>, modelo, ms }>}
 */
async function distribuirFotos(filenames, ots) {
  const t0 = Date.now();
  const otsResumen = ots.map((o, i) => ({
    nro_ot: String(o.nro_ot || ''),
    id_muestra: o.id_muestra || '',
    orden: i + 1, // 1-based, ordenado por creado_en ASC (primera OT = orden 1)
  }));
  const userMessage = [
    'Solicitud con ' + ots.length + ' OT(s), ordenadas por recepción (orden=1 es la 1ª OT):',
    JSON.stringify(otsResumen, null, 2),
    '',
    'Archivos en la carpeta de la solicitud (' + filenames.length + '):',
    JSON.stringify(filenames, null, 2),
    '',
    'Asigná cada archivo a la OT correcta (nro_ot), o null si es genérico o sin pistas.',
    'Devolvé UNA asignación por cada uno de los ' + filenames.length + ' archivos.',
  ].join('\n');
  const resp = await _llamarClaude(userMessage);
  const asignaciones = Array.isArray(resp && resp.asignaciones) ? resp.asignaciones : [];
  return { asignaciones, modelo: MODELO, ms: Date.now() - t0 };
}

module.exports = { distribuirFotos };
