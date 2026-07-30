# Instrucciones para Claude Code — lab-informes

Este archivo lo lee Claude Code automáticamente al abrir el proyecto.
Contiene el mínimo indispensable para que puedas retomar el trabajo con contexto.

## Al arrancar la sesión

1. **Leé `PROMPT-CONTINUACION.md`** (raíz del repo). Es un dump de estado
   actualizado con los últimos cambios, decisiones arquitectónicas, cosas
   abiertas y reglas de trabajo del usuario.

2. **Leé el índice `docs/claude-memory/MEMORY.md`** y después los archivos
   que ese índice referencia. Son memorias curadas de sesiones anteriores:
   - `project_general.md` — qué es el sistema, stack, arquitectura
   - `feedback_trabajo.md` — cómo trabajar con Patricio (tono, alcance, prohibiciones)
   - `project_deploy.md` — cómo se deploya al server de producción (192.168.1.200)
   - `project_oaa_semantica.md` — el flag `datos.oaa` tiene 3 significados incompatibles
   - `project_metalografia.md` — modelo F2 (8 subtipos de metalografía comparten template)
   - `project_imagenes_ensayo.md` — cómo se insertan imágenes en secciones
   - `project_backup_drive.md` — backup diario a Google Drive vía rclone
   - `project_ensayos_template.md` — qué ensayos están en templates .docx
   - `project_migracion.md` — histórico de la migración del front (cerrada)
   - `feedback_oaa_asteriscos.md` — reglas de asteriscos OAA en informes
   - `feedback_imagen_carga.md` — editor de foto carátula (recorte libre)
   - `reference_referencias.md` — carpeta de referencias .docx por tipo de ensayo

3. **Antes de escribir código nuevo, buscá si ya existe**. El repo tiene 22
   templates de ensayo, 12+ agentes Claude, muchas utilidades. No dupliques.

## Stack y setup rápido

- **Backend**: Node.js + Express + SQLite (`better-sqlite3`)
- **Frontend**: React SPA en `public-new/` (JSX + Babel EN EL NAVEGADOR — no bundler)
- **Word gen**: `docxtemplater` + `PizZip`. Templates en `server/templates/`
- **DB local**: `lab-informes.db` (SQLite, WAL). No se sube al repo — se crea vacía al primer arranque.
- **Deploy**: servicio Windows en 192.168.1.200 vía NSSM. Ver `project_deploy.md`.

Levantar en dev:
```bash
npm install
# Crear .env con al menos ANTHROPIC_API_KEY, TRELLO_KEY, TRELLO_TOKEN
node index.js
```

## Reglas de trabajo (importantes)

- **Respuestas breves**. Sin narrativa extra, sin recap al final.
- **Español rioplatense**, tono directo.
- **No pushear a main sin confirmar** (aunque git está configurado y hay remote).
- **Preferir editar archivos existentes** antes que crear nuevos.
- **Comentarios: el "por qué", no el "qué"**. Solo cuando la razón no es obvia.
- Tras cambios de front, avisar al usuario de: reiniciar server + hard reload
  (Ctrl+Shift+R para invalidar cache de Babel).
- Cualquier operación destructiva (git reset --hard, rm -rf, drop tables, etc.):
  **preguntar antes**.

## Trabajo pendiente / cosas abiertas

Ver la sección "Cosas abiertas" al final de `PROMPT-CONTINUACION.md`.

## Estructura del repo (top-level)

```
lab-informes/
├── server/          # Backend Node.js
│   ├── index.js
│   ├── db.js         (migraciones + DB SQLite)
│   ├── routes/       (api.js, api-v2.js, api-agentes.js, api-trazabilidad.js)
│   ├── generators/   (templates .docx + word-generator.js)
│   ├── agents/       (12+ agentes Claude para clasificar/reparar/asistir)
│   ├── utils/        (fotos-auto, guardar-en-drive, bot-trello, ...)
│   └── templates/    (.docx templates para cada tipo de ensayo)
├── public-new/      # Frontend nuevo (JSX + Babel, sin bundler)
│   ├── index.html
│   ├── app.jsx, ensayoform.jsx, otdetail.jsx, ...forms
│   ├── schemas.js    (schemas de ensayos F2 y otros)
│   └── store-api.js  (comunicación con backend)
├── public/          # Frontend viejo (legacy — no tocar)
├── scripts/         # Utilidades y diagnósticos
├── docs/
│   └── claude-memory/  (memoria de Claude Code — leer al arrancar)
├── test/
├── package.json
├── PROMPT-CONTINUACION.md   ← estado actual, léelo al arrancar
└── CLAUDE.md                ← este archivo
```

## Comandos útiles

```powershell
# Dev
node index.js                 # levantar server local

# Diagnóstico
node scripts/inspect-ensayo.js <id>          # ver campos de un ensayo
node scripts/check-ensayo-imagenes.js        # ensayos con imágenes en la DB
node scripts/test-match-cliente.js "RAZON"   # test del fuzzy cliente→carpeta
node scripts/diagnostico-carpeta.js <nro_ot> # qué carpeta encuentra para una OT

# Deploy
.\deploy-a-G.ps1              # deploy a producción (192.168.1.200)

# Git
git status
git add -A
git commit -m "..."
git push origin main
```

## Convenciones importantes del código

- Los **8 subtipos de metalografía F2** (microestructura, tamano-grano, inclusiones,
  estructura-grafito, espesor-capa, decarburacion, defectos-superficiales,
  porosidad) comparten `template-metalografia.js` con parámetro `subtipo`.
- El generator de Word usa `docxtemplater` con placeholders `{{campo}}`, y
  post-procesa el XML resultante con regex para casos que docxtemplater
  no soporta (renumeración, cap de imágenes, interlineado 1.15, INSPECCION section, etc.).
- Los **agentes Claude** (Haiku 4.5 default, Sonnet 4.6 si se especifica) se
  usan como **fallback** después de heurísticas regex/fuzzy. Nunca son la
  primera línea. Contexto acotado, cache cuando corresponde.
- **`datos.oaa`** tiene 3 significados incompatibles según generator — usar
  siempre `agente-oaa.detectarLote()` para decidir si un ensayo es OAA acreditado.

## Cuándo regenerar `PROMPT-CONTINUACION.md`

- Al terminar una sesión con ≥ 3 cambios importantes.
- Al detectar que la sección "Cambios recientes" ya no refleja el estado.
- Cuando el usuario pide explícitamente: "regenera el prompt de continuación".
