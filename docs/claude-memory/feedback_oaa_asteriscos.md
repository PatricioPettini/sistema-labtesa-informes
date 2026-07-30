---
name: feedback-oaa-asteriscos
description: Reglas de asteriscos OAA en informes y en la tabla de tracción — cuándo aparecen y con qué texto.
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 90735473-1191-4e8a-83ee-6b30a90b6880
---

Reglas OAA (Organismo Argentino de Acreditación):

**1. Nota OAA global (a nivel informe) — "Los ensayos marcados con (*)…":**
- Aparece SÓLO cuando el informe es MEZCLADO (contiene ensayos acreditados Y no acreditados a la vez).
- Si todos los ensayos comparten estado (todos acreditados o todos no acreditados), NO aparece la nota global y no se pone asterisco en los títulos de los ensayos.

**2. Asteriscos + nota de parámetros en TRACCIÓN — "Los parámetros marcados con (*)…":**
- Van SIEMPRE juntos y SÓLO cuando el ensayo tracción es acreditado (independiente de si el informe es mezclado o no).
- El propósito es informar al cliente que ciertos parámetros específicos (Tensión fluencia, Alargamiento, Estricción) NO están acreditados aunque el resto del ensayo sí lo esté.
- Cuando el ensayo tracción NO es acreditado → no lleva ni asteriscos en la tabla ni nota de parámetros. Solo el pintado azul se mantiene (es estético, no confunde).

**Why:** El OAA acredita cada ensayo/parámetro por separado. Los parámetros marcados en tracción tienen un alcance más restringido que el ensayo entero — la nota lo aclara para el cliente. Cuando el ensayo no está acreditado en absoluto, marcar parámetros dentro no aporta información útil.

**How to apply:** En template-traccion.js, envolver `aplicarAsteriscosEnLabels` e `insertarNotaParametros` en la misma condición `oaaOriginal !== true` (recordar que `oaa=true` = NO acreditado). En word-generator.js, la lógica de `omitirMarcasOAA = todosOAA || ningunoOAA` decide la nota global — usar `_oaa_original` para preservar el flag original antes del override.

Relacionado: [[project-general]] · [[feedback-trabajo]]
