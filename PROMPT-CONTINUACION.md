# Prompt de continuación — lab-informes

**Última actualización:** 2026-07-30

Pegá este texto (o pedile a Claude que lo lea) al inicio de una sesión nueva
para que retome sin perder el contexto de las últimas tandas de trabajo.

---

## Al arrancar

1. La memoria auto-cargada en `~/.claude/projects/.../memory/MEMORY.md` ya
   te la va a mostrar el sistema. **Léela primero** — cubre el proyecto general,
   feedback de trabajo, deploy, estructura de carpetas de fotos, semántica
   OAA, etc.
2. Después leé este archivo para las novedades recientes.

## Contexto del sistema (resumen)

- **Stack:** Node.js/Express + SQLite (`better-sqlite3`) + React SPA con JSX +
  Babel en el navegador (sin bundler) en `public-new/`.
- **Word gen:** `docxtemplater` + `PizZip`. Templates `.docx` en
  `server/templates/`. Generators en `server/generators/template-<tipo>.js`.
- **Deploy:** servicio Windows en `192.168.1.200` vía NSSM. Deploy con
  `.\deploy-a-G.ps1`. Env vars: `DRIVE_INFORMES_ROOT`, `AS400_*`,
  `FOTOS_RECEPCION_ROOT`, `ANTHROPIC_API_KEY`. Ver `memory/project_deploy.md`.
- **DB:** `lab-informes.db` (SQLite WAL) en la raíz del proyecto.
- **Drive de fotos:** `G:\METALMECANICA\FOTOS\CLIENTES 2026\` o UNC
  `\\192.168.1.200\Labtesa1\METALMECANICA\FOTOS\CLIENTES 2026`.
- **Ensayos:** 21 tipos. Los 8 de metalografía F2 (microestructura,
  tamano-grano, inclusiones, estructura-grafito, espesor-capa, decarburacion,
  defectos-superficiales, porosidad) comparten template/generator con subtipo.
- **OAA:** `datos.oaa` tiene 3 significados incompatibles según el generator.
  Usar `agente-oaa.detectarLote()` para saber si es acreditado. Ver
  `memory/project_oaa_semantica.md`.

## Cambios recientes (sesión 2026-07-28 → 2026-07-30)

### Word / generators

- **`server/generators/word-generator.js`**
  - `insertarInspeccionAntesDeFin(buf, texto)` — sección "INSPECCIÓN" sin
    numeración antes de FIN DE INFORME. Se dispara si `ot.inspeccion_texto`
    tiene contenido. Textarea correspondiente en `otdetail.jsx`, persiste en
    `onBlur` vía PATCH.
  - `normalizarInterlineado(buf)` — fuerza `w:line="276" w:lineRule="auto"`
    (1.15) en todos los `<w:spacing>` de `document.xml` + `styles.xml`. Corre
    **antes** de `spacingCeroEnCeldas` para que celdas de tabla se re-compriman
    a 1.0.
- **`server/generators/imagenes-caratula-helper.js`**
  - Tope duro **10 cm × 10 cm** por imagen de ensayo (`capImagen(cx, cy, aspect)`)
    preservando aspect ratio. Aplica a los 3 layouts (legacy / horizontal /
    vertical). Las **carátulas NO** están afectadas — usan
    `reemplazarImagenCaratula` en cada template.
- **`server/generators/template-macrografia.js`**
  - Emisión "Temperatura de ensayo: X °C" cuando `datos.temperatura` tiene
    valor (ya existía, solo faltaba el input en el form).
  - Etiqueta unificada **"Metodología de ensayo:"** para checkboxes y fallback
    (antes decía "Método de ensayo:" con checkboxes — inconsistencia que hacía
    parecer que no había contenido).
  - Helper `isTrue()` — acepta booleanos y strings `"true"/"false"` (por si
    el JSON llega serializado raro).
  - Regla nueva del Termohigrómetro: `datos.eq_termohigro_700 === undefined`
    → include (backward-compat con ensayos viejos); `=== false` → excluir.
    Fallback ciego eliminado.
- **`server/generators/template-traccion.js`**
  - `agruparPorProbeta(etiqueta, key, sep)` — tercer param opcional para el
    separador. Para "Plano de probeta" se pasa `' según '` → emite
    `"Plano de probeta según X"` en vez de `"Plano de probeta: X"`.

### Front — forms / carga de imágenes

- **`public-new/otdetail.jsx`**
  - Card nueva **"Inspección"** con textarea. Draft local, `onBlur` persiste
    vía `LabStore.updateOt(nroOt, { inspeccion_texto })`. `PATCH_FIELDS`
    en `store-api.js` extendido con `inspeccion_texto`.
- **`public-new/ensayoform.jsx`**
  - **`AutoLoadPhotosBtn`** — componente reusable expuesto en
    `window.AutoLoadPhotosBtn`. Props: `ensayoId | (nroOt + tipo)`, `datos`,
    `set`, `campos[]`, `hint`. Si no hay `ensayoId`, usa URL
    `/api/ensayo/new/fotos-auto?nro_ot=X&tipo=Y`.
  - **`captionDesdeNombre(filename)`** — port cliente del
    `parseCaptionDeFilename` del backend. Se aplica en `EnsayoPhotos.onFiles`
    para auto-derivar el caption al subir imagen manualmente.
  - **Lazy load de imágenes**: al montar, `useEffect` detecta items con
    `_dataUrlStripped: true` y hace fetch `/api/ensayo/:id` para hidratar
    dataUrl. Solo actualiza campos `imagenes_*`, no toca otras ediciones.
- **`public-new/metalografiageneralform.jsx`**
  - **Auto-tildado de secciones** al montar: si `analisis.<key>.on = false`
    pero hay evidencia de uso (ref, metodología, `resultados_seccion`, o
    `imagenes_<key>`), tildar automáticamente.
  - **Migración legacy** `imagenes_resultado` → `imagenes_<seccion>` si solo
    hay una sección activa detectada. Espera a que las imágenes estén
    hidratadas (sin `_dataUrlStripped`) antes de migrar.
- **Botón "Cargar fotos automáticamente"** agregado a:
  - `anexometalograficoform.jsx` (grano + inclusiones)
  - `tratamientostermicosform.jsx`
  - `macrografiaform.jsx`
  - `vickersform.jsx`
  - `rockwellform.jsx` (imagenes_esquema)
  - `variosform.jsx`
  - Renderer schema-based `type: 'photos'` en `ensayoform.jsx` → cubre F2
    metalografía (8 subtipos) y ferrita-delta microscopio.
- **`public-new/macrografiaform.jsx`**
  - Nuevo input **"TEMPERATURA DE ENSAYO"** (`datos.temperatura`).
  - Nuevo bloque **"EQUIPAMIENTO UTILIZADO"** con 3 checkboxes visibles
    (Termohigrómetro por default checked). Antes el usuario no los veía —
    aparecían solos en el Word por fallback.

### Backend — endpoints / bot Trello

- **`server/routes/api.js`**
  - **`/ot/:nro_ot/fotos-auto`** — filtro **recepción vs ensayo** con
    `SECCION_ENSAYO_RE`: excluye archivos en subcarpetas cuyo nombre matchea
    keywords de sección (MICROESTRUCTURA/, INCLUSIONES/, etc.) **y** archivos
    con nombre que contiene keyword (`inclusiones.png`,
    `microestructura zat.jpg`). Usa `\b(pattern)` sin end anchor → tolera
    plurales (`INCLUSIONES` matchea `inclusion`).
  - **`/ensayo/:id/fotos-auto`** — `REGLAS` extendido con `campo` explícito y
    15 tipos: macrografia, dureza-vickers, dureza-rockwell, tratamientos-termicos,
    varios, liquidos-penetrantes, ferrita-delta, + 8 F2. Cada rule mapea a un
    `campo` (`imagenes_resultado`, `imagenes_esquema`, etc.).
  - **Fallback IA** integrado: si quedan items en `_sin_clasificar`, llama a
    `agente-clasificador-fotos.js` (Haiku 4.5). Log:
    `[ensayo/fotos-auto/agente] <tipo> — N/M clasificados en Xms`.
  - Soporta `id='new'|'0'` + query `?nro_ot=X&tipo=Y` para ensayos aún no
    guardados.
- **`server/agents/agente-clasificador-fotos.js`** (nuevo)
  - Recibe tipo de ensayo + categorías válidas + items no clasificados
    (path + folders + filename). Devuelve JSON
    `{asignaciones: [{path, categoria, confianza, motivo}]}`.
- **`server/routes/api-v2.js`**
  - `GET /api/ensayos` **strippea `dataUrl`** base64 de campos `imagenes*`,
    marca items con `_dataUrlStripped: true`. Init payload pasa de ~200 MB a
    ~5 KB por ensayo → antes se cortaba silenciosamente y al abrir un ensayo
    viejo faltaban las imágenes.
  - `POST /api/ensayo` — **protección anti-pérdida**: si el request trae
    items con `_dataUrlStripped: true`, fusiona con lo que ya está en la DB
    (busca dataUrl por `name` del archivo).
- **`server/utils/bot-trello.js`**
  - **`id_muestra` se sobrescribe siempre** con lo que traiga Trello (antes
    solo pisaba vacíos). Se registra evento por cada cambio:
    `'ID de muestra actualizada desde Trello: "<antes>" → "<ahora>"'`. El
    resto de campos sigue con la regla "solo pisar vacíos" para no romper
    correcciones manuales.

### Scripts

- **`scripts/generar-procedimiento-ingresos.js`** (nuevo) — Genera
  `PROCEDIMIENTO_INGRESOS.docx` (guía para recepcionistas: estructura de
  carpetas + nomenclatura de fotos + recepción vs ensayo + checklist).
- **`scripts/check-ensayo-imagenes.js`** (nuevo) — Diagnóstico: lista ensayos
  con dataUrl y tamaño en KB.
- **`scripts/inspect-ensayo.js`** (nuevo) — Inspecciona campos top-level de
  un ensayo por ID.

## Decisiones arquitectónicas

1. **Agente clasificador de fotos = fallback, no primario.** Regex hace la
   primera pasada gratis; agente solo si quedan items sin clasificar. Haiku
   4.5. Contexto acotado a los items del OT/SOL, no del drive completo.
2. **Trello gana en `id_muestra`.** Si la secretaría corrige la
   identificación en Trello, se propaga. El resto de campos: "el técnico
   manda" para no romper correcciones manuales.
3. **Lazy load imágenes.** Init trae metadata (nombres + captions); fetch por
   ensayo al abrir el form. Motivación: payloads de 200 MB+ se cortaban.
4. **Cap 10 cm × 10 cm en fotos de ensayo, aspect ratio preservado.** Las
   carátulas quedan con su lógica anterior (tamaño libre).
5. **Auto-derivar caption desde filename** al subir imagen manual (en
   `EnsayoPhotos`). Formato canónico:
   `IMAGEN Nº1 - MICROESTRUCTURA EN SUPERFICIE 100x.jpg` →
   `"Microestructura en superficie (100X)"`.
6. **Estructura del drive documentada** en `PROCEDIMIENTO_INGRESOS.docx`:
   raíz de SOL/OT = recepción, subcarpetas por sección de ensayo, `M<n>/`
   por muestra, `INFORMAR/` para dejar solo las que van al informe.

## Cosas abiertas / no cerradas

- **Fusión/archivado de tarjetas Trello al pasar a "Revisión Técnica de
  Informes":** el sistema **no** archiva ni fusiona (todas las llamadas a
  Trello son GET). Causa probable: **Butler automation** en el board.
  Pendiente que el usuario revise `board → Automation → Rules`. Opcional:
  agregar "Revisión Técnica de Informes" a `COLUMNAS_DEFAULT`
  (`bot-trello.js:35`) para que siga sincronizando después de esa columna.
- **Ensayos viejos con `eq_termohigro_700 = false` explícito:** no se
  incluye Termohigrómetro (se respeta lo que hay). No hay migración
  retroactiva.
- **Migración legacy metalografía-general:** solo migra `imagenes_resultado`
  automáticamente si hay **una sola sección activa**. Si hay varias
  cargadas al mismo tiempo, el técnico tiene que mover manualmente.

## Reglas de trabajo del usuario (Patricio Pettini · patricio.pettini@labtesa.com.ar)

Ver `memory/feedback_trabajo.md` para el detalle. Reglas activas:

- **Respuestas breves.** Sin narrativa extra, sin repetir el resumen al final.
- **Todo en español**, tono directo. Español rioplatense OK.
- **No pushear a main** ni operaciones destructivas sin confirmar.
- **Preferir editar archivos existentes** antes que crear nuevos.
- **Comentarios en código: por qué, no qué.** Solo cuando la razón no es
  obvia. Nada de docstrings multi-línea.
- Después de cambios en el front, recordarle **reiniciar el server** y
  **hard reload** del navegador (Ctrl+Shift+R) para invalidar cache de Babel.

## Comandos útiles

```powershell
# Levantar server local (dev)
node index.js

# Deploy al server de producción (192.168.1.200)
.\deploy-a-G.ps1

# Inspeccionar un ensayo en la DB
node scripts/inspect-ensayo.js <id>

# Diagnóstico de imágenes guardadas
node scripts/check-ensayo-imagenes.js

# Regenerar el procedimiento de ingresos (.docx)
node scripts/generar-procedimiento-ingresos.js
```

## Cuándo regenerar este archivo

Cuando la sesión actual acumule ≥ 5 cambios importantes o hayan pasado
≥ 1-2 semanas desde la última actualización. El usuario puede pedirlo
explícitamente: "regenera el prompt de continuación".
