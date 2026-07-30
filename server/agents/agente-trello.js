/**
 * agente-trello.js
 *
 * Agente de LLM (Claude) para interpretar tarjetas de Trello del laboratorio
 * y devolver un JSON estructurado con: nro_solicitud, cliente, OTs, IDs de
 * muestra, ensayos, fecha de aprobación, alcance OAA.
 *
 * A diferencia del parser regex (trello-parser.js), este agente entiende el
 * contenido semánticamente y no depende de un formato específico — cubre las
 * tarjetas raras que el regex no puede resolver.
 *
 * Se usa como FALLBACK del bot: primero probamos el parser regex (barato,
 * inmediato); si no detecta OTs válidas o si falta info clave, se llama al
 * agente. Así solo pagamos LLM cuando hace falta.
 */
'use strict';

const fetch = require('node-fetch');

const MODELO = process.env.AGENTE_TRELLO_MODELO || 'claude-haiku-4-5';
const MAX_TOKENS = 2048;

// ── Tipos de ensayo soportados por el sistema (mismos del store-api) ─────
// El agente debe devolver EXACTAMENTE uno de estos strings por ensayo.
const TIPOS_ENSAYO = [
  'traccion',
  'impacto',
  'dureza-brinell',
  'dureza-rockwell',
  'dureza-vickers',
  'plegado',
  'quimicos',
  'nick-break',
  'ferrita-delta',
  'macrografia',
  'rugosidad',
  'varios',
  'liquidos-penetrantes',
  'metalografia-general',
  'anexo-metalografico',
  'tratamientos-termicos',
];

function _extraerLabels(card) {
  return (card.labels || []).map(l => String(l.name || '').trim()).filter(Boolean);
}

function _resumirChecklists(card) {
  const chks = card.checklists || [];
  return chks.map(c => ({
    nombre: c.name,
    items: (c.checkItems || []).map(it => it.name),
  }));
}

function _resumirCustomFields(card) {
  const items = card.customFieldItems || [];
  return items.map(it => {
    const v = it.value || {};
    return {
      id_field: it.idCustomField,
      valor: v.date || v.text || v.number || v.checked || (v.option && v.option.value) || null,
    };
  }).filter(it => it.valor);
}

function buildPrompt(card) {
  const labels = _extraerLabels(card);
  const checklists = _resumirChecklists(card);
  const customFields = _resumirCustomFields(card);
  const tiposEnsayoLista = TIPOS_ENSAYO.map(t => `  "${t}"`).join(',\n');

  return `Sos un asistente experto en interpretar tarjetas de Trello de un laboratorio metalúrgico.

Cada tarjeta representa una solicitud de análisis que contiene una o más OTs (órdenes de trabajo). Cada OT es una muestra distinta que va al laboratorio.

Los datos aparecen con formatos variados según quién carga la tarjeta. Tu tarea es extraer la información REAL sin importar el formato exacto.

═══ FORMATO DEL TÍTULO ═══
Suele ser "CLIENTE - NRO_SOLICITUD" pero puede tener texto extra, paréntesis, guiones múltiples. Ejemplos:
- "FERPLAST S.A. - 38079"
- "CINTOLO - URGENTE 72h (AS400) - 0000223"           → cliente=CINTOLO, sol=223
- "SIDEREA S.A - 38269 (VER COMENTARIOS PARA INFORME)" → cliente=SIDEREA S.A, sol=38269

═══ FORMATO DE OTS EN LA DESCRIPCIÓN ═══
Cada OT tiene un número (nro_ot, típicamente 4-6 dígitos) y una descripción (id_muestra). Formatos vistos:
- "M1 (O.T. 534200): DESCRIPCIÓN"
- "M1 (OT: 535521): descripción"
- "OT1 (534355): descripción"
- "(OT 534333) M1: descripción"
- "Muestra 1 (OT: 535739): descripción"
- "M1 y M2 (OT: 535508): descripción"       → misma OT para 2 muestras
- "(O.T. 535564)" en línea suelta, y en líneas siguientes "M1: desc" y "M2: desc"
- "OT: 535439 ID:M1: descripción"

═══ CHECKLISTS DE ENSAYOS ═══
Los ensayos requeridos suelen estar en checklists llamados "Ensayos - M<N>" (M1, M2, etc). Cada item del checklist describe un ensayo. Mapear a uno de estos tipos del sistema:
[
${tiposEnsayoLista}
]
Ejemplos de mapeo:
- "MECANIZADO DE TRACCION" / "TRACCION" → "traccion"
- "DUREZA BRINELL" / "BRINELL"          → "dureza-brinell"
- "DUREZA VICKERS"                       → "dureza-vickers"
- "DUREZA ROCKWELL"                      → "dureza-rockwell"
- "IMPACTO CHARPY" / "CHARPY"           → "impacto"
- "PLEGADO" / "MECANIZADO DE PLEGADOS"  → "plegado"
- "NICK BREAK"                           → "nick-break"
- "ANÁLISIS QUÍMICO" / "ELTRA" / "RX"   → "quimicos"
- "FERRITA DELTA"                        → "ferrita-delta"
- "MACROGRAFÍA"                          → "macrografia"
- "METALOGRAFÍA" / "ESPESOR RECUBRIM"   → "metalografia-general"
Ignorar items administrativos: "FINALIZACIÓN DE ENSAYOS", "FIN DE ENSAYOS", "MECANIZADO DE PROBETAS", tareas sin ensayo (envío, pago, etc).

═══ ETIQUETAS OAA ═══
Si la tarjeta tiene la etiqueta "PARAMETRO ACREDITADO" (o similar) → es_oaa = true.

═══ CUSTOM FIELDS ═══
Puede aparecer "Fecha de aprobación" como custom field tipo date → fecha_aprobacion.
"Cliente" o "Nro Cliente" en la descripción → nro_cliente.

═══ TARJETA A ANALIZAR ═══
TÍTULO: ${JSON.stringify(card.name || '')}

DESCRIPCIÓN:
${card.desc || '(vacía)'}

ETIQUETAS: ${JSON.stringify(labels)}

CHECKLISTS:
${JSON.stringify(checklists, null, 2)}

CUSTOM FIELDS:
${JSON.stringify(customFields, null, 2)}

FECHA DUE (vencimiento): ${card.due || '(no)'}

═══ DEVOLVÉ EXACTAMENTE UN JSON con este esquema ═══
{
  "nro_solicitud": "string (solo dígitos, ej '38079')",
  "cliente_nombre": "string (ej 'FERPLAST S.A.')",
  "nro_cliente": "string o null",
  "fecha_aprobacion": "YYYY-MM-DD o null",
  "es_oaa": true | false,
  "ots": [
    {
      "nro_ot": "string (solo dígitos)",
      "muestra": "string (número de muestra, ej '1', '2')",
      "id_muestra": "string (descripción libre) o ''",
      "ensayos": ["tipo1", "tipo2"]
    }
  ],
  "confianza": "alta" | "media" | "baja",
  "notas": "string con observaciones o problemas (ej si algún dato falta o es ambiguo)"
}

REGLAS ESTRICTAS:
- SOLO devolvé el JSON, sin texto antes ni después, sin markdown.
- Si no encontrás número de solicitud, devolvé "" (string vacío).
- Si no encontrás ninguna OT, devolvé "ots": [].
- Los tipos de ensayo tienen que ser EXACTOS de la lista dada (nada de "brinell" sin "dureza-").
- Deduplicar ensayos por muestra ("MECANIZADO DE TRACCION" y "ENSAYO DE TRACCION" son UNA sola "traccion").
- fecha_aprobacion en formato YYYY-MM-DD o null si no está.`;
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
      model: MODELO,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data.content.map(b => b.text || '').join('');
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Intentar extraer el primer objeto JSON del texto.
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    throw new Error('LLM devolvió JSON no parseable: ' + clean.slice(0, 300));
  }
}

// Valida y normaliza el output del LLM.
function validarOutput(out, card) {
  if (!out || typeof out !== 'object') throw new Error('Output no es objeto');
  const r = {
    nro_solicitud:   String(out.nro_solicitud || '').replace(/[^\d]/g, ''),
    cliente_nombre:  String(out.cliente_nombre || '').trim(),
    nro_cliente:     out.nro_cliente ? String(out.nro_cliente).trim() : null,
    fecha_aprobacion: (out.fecha_aprobacion && /^\d{4}-\d{2}-\d{2}$/.test(out.fecha_aprobacion))
      ? out.fecha_aprobacion : null,
    es_oaa:          !!out.es_oaa,
    ots:             [],
    confianza:       ['alta', 'media', 'baja'].includes(out.confianza) ? out.confianza : 'media',
    notas:           String(out.notas || '').trim(),
    trello_url:      card && card.id ? 'https://trello.com/c/' + card.id : '',
  };
  if (Array.isArray(out.ots)) {
    for (const o of out.ots) {
      const nro = String((o && o.nro_ot) || '').replace(/[^\d]/g, '');
      if (!nro) continue;
      const ensayosVal = Array.isArray(o.ensayos) ? o.ensayos.filter(t => TIPOS_ENSAYO.includes(t)) : [];
      r.ots.push({
        nro_ot: nro,
        muestra: String(o.muestra || '').trim(),
        id_muestra: String(o.id_muestra || '').trim(),
        ensayos: [...new Set(ensayosVal)],
      });
    }
  }
  return r;
}

/**
 * analizarTarjeta(card) → Promise<parsed>
 *
 * `card` debe ser el objeto completo que devuelve la API de Trello
 * (con .name, .desc, .labels, .checklists, .customFieldItems, .due, .id).
 */
async function analizarTarjeta(card) {
  const prompt = buildPrompt(card);
  const raw = await llamarClaude(prompt);
  return validarOutput(raw, card);
}

module.exports = { analizarTarjeta, TIPOS_ENSAYO };
