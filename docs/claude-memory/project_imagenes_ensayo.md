---
name: project-imagenes-ensayo
description: Helper insertarImagenesEnsayo — inserta imágenes DENTRO de secciones de resultados (no solo en la carátula). Implementado en imagenes-caratula-helper.js.
metadata: 
  node_type: memory
  type: project
  originSessionId: e940ca02-997d-400b-a157-f46e241f98c8
---

En `server/generators/imagenes-caratula-helper.js` hay dos funciones distintas:

1. **`manejarImagenesCaratula(processedZip, outXml, fotos, tipoPrefix)`** — la que ya conocemos: multi-imagen en carátula al inicio del informe.

2. **`insertarImagenesEnsayo(processedZip, outXml, fotos, tipoPrefix, marker, position='before', rIdBase=200)`** — NUEVA (2026-07). Inserta un array `[{buffer, caption}, ...]` dentro del cuerpo del ensayo en un marker configurable.
   - `marker`: string a buscar en el XML (ej. `MARKER_FIN_ENSAYO`).
   - `position`: `'before'` o `'after'` respecto al marker.
   - Numeración continua: cuenta cuántas "Imagen N°X" hay antes para no repetir números en informes combinados.
   - Altura fija 8cm; ancho proporcional con max 15cm.

**Why:** Era pendiente prioritario (originalmente para Ferrita Delta modo microscopio). Se implementó primero para `metalografia-general` porque ese es el ensayo cuyo caso de uso principal ES mostrar imágenes de microscopía dentro de resultados.

**How to apply:**
- Único caller actual: `template-metalografia-general.js:269`.
- **Ferrita Delta todavía NO lo usa** — sigue pendiente integrarlo para el modo `variante='microscopio'`. El template solo llama `manejarImagenesCaratula` (línea ~442).
- Si agregás un nuevo generator que necesita imágenes dentro del cuerpo, patrón: dejar un marker literal en el `.docx` (ej. `__IMAGES_HERE__`), y en el generator llamar `insertarImagenesEnsayo(zip, outXml, fotos, 'tipo', '__IMAGES_HERE__')`.

Relacionado: [[project-general]] · [[project-ensayos-template]] · [[feedback-imagen-carga]]
