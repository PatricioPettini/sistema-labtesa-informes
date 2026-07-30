/**
 * agente-cliente-carpeta.js
 *
 * Resuelve razón social ↔ carpeta del drive cuando el fuzzy match falla.
 * Casos que cubre:
 *   - Acrónimos: "TGN" → "TRANSPORTADORA DE GAS DEL NORTE S.A"
 *   - Nombres cortos: "AESA" → "A. EVANGELISTA"
 *   - Cambios de razón social: legacy folder con nombre viejo
 *   - Typos y variantes con/sin S.A., S.R.L., puntos, guiones
 *
 * Devuelve { carpeta, confianza: 'alta'|'media'|'baja'|'ninguna', motivo }.
 * Solo devuelve carpeta si el agente tiene confianza razonable.
 */
'use strict';

const fetch = require('node-fetch');

const MODELO = process.env.AGENTE_CLIENTE_CARPETA_MODELO || 'claude-haiku-4-5';
const MAX_TOKENS = 800;
const API_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT_SYSTEM = `Sos el organizador de un drive de laboratorio metalúrgico argentino.
Dado una razón social (o alias) de un cliente y una lista de nombres de carpetas
que hay en el drive, tu trabajo es identificar cuál carpeta corresponde a ese cliente.

Reglas:
- Reconocé acrónimos comunes: TGN = Transportadora de Gas del Norte, YPF = Yacimientos
  Petrolíferos Fiscales, AESA a veces = A. Evangelista S.A., etc.
- Ignorá diferencias de S.A. / S.R.L. / SA / SRL / puntos / espacios / guiones.
- Considerá cambios de razón social conocidos (Ternium ↔ Siderar, etc.).
- Si un cliente tiene múltiples plantas ("SIDERAR - CAMPANA", "SIDERAR - HAEDO"), y
  no tenés info para elegir una específica, devolvé la más "genérica" o la primera.
- Si NINGUNA carpeta corresponde con confianza razonable, devolvé carpeta: null.

Confianza:
- "alta":     nombre completo o acrónimo estándar del sector energético/industrial.
- "media":    tiene similitud pero podría ser otro cliente.
- "baja":     coincidencia parcial débil.
- "ninguna":  no hay carpeta que se corresponda.

Devolvé SIEMPRE JSON válido con esta forma exacta:
{
  "carpeta": "NOMBRE EXACTO DE LA CARPETA" | null,
  "confianza": "alta" | "media" | "baja" | "ninguna",
  "motivo": "explicación breve"
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
 * @param {string} razonSocial - la razón social/alias del cliente tal como está en el sistema.
 * @param {Array<string>} carpetas - nombres de todas las carpetas del drive.
 * @returns {Promise<{carpeta: string|null, confianza: string, motivo: string, modelo, ms}>}
 */
async function resolverCarpeta(razonSocial, carpetas) {
  const t0 = Date.now();
  // Filtramos a las que arrancan con la misma letra (o alguna) para reducir el prompt.
  // Solo si son muchas — sino mandamos todas.
  const listaEnviada = carpetas.length > 60
    ? carpetas.filter(c => {
        // Envío las carpetas cuyo primer token empieza con alguna letra de la razón social.
        const letras = new Set(razonSocial.replace(/[^A-Za-zÁÉÍÓÚÑ]/gi, '').toUpperCase().split(''));
        return letras.has(c.charAt(0).toUpperCase());
      })
    : carpetas.slice();
  // Si el filtro deja pocas, incluir todas.
  const listaFinal = listaEnviada.length < 20 ? carpetas.slice() : listaEnviada;

  const userMessage = [
    'Razón social del cliente en el sistema: "' + razonSocial + '"',
    '',
    'Carpetas disponibles en el drive (' + listaFinal.length + '):',
    listaFinal.map(c => '- ' + c).join('\n'),
    '',
    '¿Cuál carpeta corresponde a este cliente?',
  ].join('\n');
  const resp = await _llamarClaude(userMessage);
  return Object.assign({ modelo: MODELO, ms: Date.now() - t0 }, resp);
}

module.exports = { resolverCarpeta };
