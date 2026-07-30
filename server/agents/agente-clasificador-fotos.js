/**
 * agente-clasificador-fotos.js
 *
 * Fallback IA para clasificar fotos que la heurística regex no pudo asignar.
 * Se llama desde /ensayo/:id/fotos-auto SOLO cuando quedan items en
 * `_sin_clasificar` — la heurística de regex hace la primera pasada gratis
 * y el agente resuelve los ambiguos.
 *
 * Diseño: recibe la lista de items (path relativo a la carpeta base + carpetas
 * ancestro + nombre) y devuelve una asignación por item con confianza.
 * Nunca ve el contenido de las imágenes, solo metadatos de path.
 */
'use strict';

const fetch = require('node-fetch');

const MODELO = process.env.AGENTE_CLASIFICADOR_FOTOS_MODELO || 'claude-haiku-4-5';
const MAX_TOKENS = 1500;
const API_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT_SYSTEM = `Sos el organizador del drive de fotos de un laboratorio metalúrgico
argentino. Recibís información sobre fotos que quedaron sin clasificar automáticamente
y tenés que decidir a qué sección del informe corresponde cada una.

Contexto que recibís:
- Tipo de ensayo que se está armando (ej. "dureza-vickers", "metalografia-general").
- Categorías válidas para ese tipo de ensayo (nombres de campos que espera el sistema).
- Lista de fotos con: subcarpetas donde están, nombre de archivo.

Reglas:
- Cada categoría es un campo del formulario del ensayo (ej. "imagenes_micro" =
  fotos de microestructura, "imagenes_espesor" = fotos de espesor de capa).
- Si no encaja en ninguna categoría del ensayo, devolvé "descartar" — el técnico
  la asignará manualmente si corresponde.
- Interpretá nombres cortos y siglas del sector: MICRO=microestructura,
  SULFUROS/ALUMINATOS/SILICATOS=inclusiones, ZAT=zona afectada por calor,
  MB=metal base, HAZ=heat affected zone.
- Considerá la subcarpeta ancestro como signal fuerte: si está en una carpeta
  "MICROESTRUCTURA/M2/", la foto es de microestructura muestra 2.
- Si el nombre es completamente genérico ("IMG_1234.jpg", "foto.jpg") y no hay
  contexto de carpeta útil, devolvé "descartar" con confianza baja.

Confianza:
- "alta":   el signal es claro (carpeta o nombre lo indican inequívocamente).
- "media":  hay signal pero podría ser otra cosa.
- "baja":   asignación tentativa; el técnico debería revisar.

Devolvé SIEMPRE JSON válido con esta forma exacta:
{
  "asignaciones": [
    { "path": "<path relativo>", "categoria": "<nombre de campo o 'descartar'>", "confianza": "alta|media|baja", "motivo": "explicación breve" }
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
 * Clasifica una lista de items en categorías válidas para un tipo de ensayo.
 *
 * @param {string} tipoEnsayo - Ej. 'metalografia-general', 'dureza-vickers'.
 * @param {Array<{campo:string, descripcion?:string}>} categorias - Categorías válidas
 *        para este ensayo, con nombre de campo y descripción opcional.
 * @param {Array<{path:string, folders:string[], filename:string}>} items - Items
 *        a clasificar (path relativo, subcarpetas ancestro, nombre de archivo).
 * @returns {Promise<{asignaciones: Array<{path,categoria,confianza,motivo}>, modelo, ms}>}
 */
async function clasificarFotos(tipoEnsayo, categorias, items) {
  const t0 = Date.now();
  if (!items || !items.length) return { asignaciones: [], modelo: MODELO, ms: 0 };

  const categoriasBloque = categorias.map(c =>
    '- ' + c.campo + (c.descripcion ? ': ' + c.descripcion : '')).join('\n');
  const itemsBloque = items.map(it => {
    const carpetas = (it.folders || []).length > 0
      ? ' [carpeta: ' + it.folders.join('/') + ']' : ' [carpeta: (raíz)]';
    return '- ' + it.path + carpetas;
  }).join('\n');

  const userMessage = [
    'Tipo de ensayo: "' + tipoEnsayo + '"',
    '',
    'Categorías válidas (campos del formulario) para este ensayo:',
    categoriasBloque,
    '- descartar: si la foto no corresponde a ninguna categoría del ensayo',
    '',
    'Fotos a clasificar (' + items.length + '):',
    itemsBloque,
    '',
    '¿A qué categoría corresponde cada foto?',
  ].join('\n');

  const resp = await _llamarClaude(userMessage);
  return Object.assign({ modelo: MODELO, ms: Date.now() - t0 }, resp);
}

module.exports = { clasificarFotos };
