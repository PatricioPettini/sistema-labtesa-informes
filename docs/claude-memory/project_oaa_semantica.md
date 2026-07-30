---
name: project-oaa-semantica
description: "La flag datos.oaa tiene 3 semánticas incompatibles según dónde se usa — no confiar en ella para \"OT bajo alcance OAA\""
metadata: 
  node_type: memory
  type: project
  originSessionId: 12c0350a-0b11-49cf-b194-2df7c35f5e85
---

# Semántica de `datos.oaa` — no es lo que parece

`datos_json.oaa` en la tabla `ensayos` tiene **3 significados distintos** según qué código lo escribe/lee:

1. **En generators del Word** (`template-traccion.js` L628 lo explicita): `oaa=true` = ensayo **NO acreditado** → carga asterisco `(*)` y nota "Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."
2. **En `public-new/schemas.js` defaults**: `oaa: true` viene por default en macrografía, varios, metalografia-general, anexo-metalografico, liquidos-penetrantes — porque *siempre* son "fuera del alcance" → llevan asterisco. Esto se carga en `datos_json` cuando el técnico agrega el ensayo desde la UI (aunque no haya nada de acreditación configurado).
3. **En `server/utils/bot-trello.js` L215**: `esAcreditada ? '{"oaa":true}' : '{}'` — el comentario dice "bajo alcance" (semántica invertida respecto de (1)). En la práctica raramente se dispara porque la etiqueta Trello "PARAMETRO ACREDITADO" casi no se usa.

**Consecuencia**: filtrar por `datos.oaa === true` da falsos positivos masivos — cualquier OT con macrografía/varios/etc. va a matchear aunque no sea OAA-acreditada.

**Why:** Bug real reportado 2026-07-27: solicitud 38162 (Ferropar) mostraba badge OAA en el header y la sede-panel decía "todos no acreditados" al mismo tiempo. La card Trello no tenía etiqueta OAA. El `oaa: true` venía de los defaults de schemas.

**How to apply:**
- Para saber si una OT/solicitud es OAA (badge, carpeta de destino en drive, vista de vencimientos): usar `detectarLote()` de `server/agents/agente-oaa.js` — evalúa norma+edición+sede+temperatura+reglas por tipo. Es la única fuente de verdad.
- Para el frontend: hacer fetch a `/api/oaa-preview/:nro_ot` (ya lo hace [[project-general]] via `OAAPanel`).
- Los fixes ya aplicados: `public-new/otdetail.jsx` L128-135, L433-435; `server/routes/api.js` L1461-1495 (endpoint `/trello/vencimientos`).
- **No agregar más lugares que consulten `datos.oaa === true` como indicador de "bajo alcance OAA"** — usar la detección real siempre.
