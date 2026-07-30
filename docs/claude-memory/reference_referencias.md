---
name: reference-referencias
description: Carpeta de informes Word reales de referencia por tipo de ensayo
metadata: 
  node_type: memory
  type: reference
  originSessionId: c5c044d2-65b7-4651-b7d7-86330cf78d1e
---

`server/agents/informes-referencia/<tipo>/` contiene 5-15 .docx reales por cada tipo de ensayo:
- traccion, impacto, plegado, nick-break, quimicos
- dureza-brinell, dureza-rockwell, dureza-vickers
- ferrita-delta

**When to use:** Antes de modificar cualquier generator o template, abrir uno o dos informes de referencia del tipo correspondiente para entender el formato real (qué campos aparecen, en qué orden, con qué texto). Inspeccionar con script Node + PizZip leyendo `word/document.xml`.

**Origen:** Copiados desde `G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA` filtrando por LastWriteTime reciente y clientes distintos. Los scripts de copia están en sesiones previas — re-ejecutar `_inspect/copiar_referencias_todos.ps1` si hace falta refrescar.
