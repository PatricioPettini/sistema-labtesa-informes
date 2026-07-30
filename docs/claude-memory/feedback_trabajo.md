---
name: feedback-trabajo
description: Reglas de trabajo validadas en sesiones anteriores para este proyecto
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5846a3dc-c3a8-4530-9e7a-800b6992c3b7
---

Reglas que ya fueron validadas y siguen aplicando:

1. **Scripts a archivos, nunca inline.** Siempre escribir scripts a archivos .js/.py — NUNCA usar `-e`/`-c` con código inline en PowerShell. Las comillas escapadas fallan en Windows.
   **Why:** Las comillas escapadas en PowerShell/Windows rompen los scripts inline.
   **How to apply:** Siempre Write(script.js) + luego PowerShell("node script.js").

2. **Scratch space en _inspect\.** Usar _inspect\ como directorio de trabajo temporal para scripts de diagnóstico. Redirigir output a out.txt y leer con type.
   **Why:** Patrón establecido en el proyecto para mantener el raíz limpio.
   **How to apply:** _inspect\script.js → _inspect\out.txt → Read.

3. **Inspección .docx:** Usar Python zipfile o PizZip en Node para inspeccionar archivos .docx.
   **Why:** Los .docx son ZIPs con XML interno.

4. **edit_block necesita match exacto** con whitespace incluido.
   **Why:** Herramienta de edición falla si hay diferencias de espaciado.

5. **Correr servidor con:** cmd /c "cd /d C:\Users\Patricio\Desktop\lab-informes && node server/index.js"
   **Why:** El entrypoint es server/index.js, no server.js.
