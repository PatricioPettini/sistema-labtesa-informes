Acá va el superprompt actualizado:

---

# SUPERPROMPT — Continuación proyecto lab-informes (LABTESA)

> Pegá este prompt completo al inicio de una nueva conversación para retomar el desarrollo sin perder contexto.

---

## CONTEXTO

Trabajo con un sistema web local que genera informes Word (.docx) de ensayos metalúrgicos para el laboratorio LABTESA. La app corre en Node/Express + SQLite + frontend HTML/JS vanilla.

**Stack**: Node.js + Express + SQLite (better-sqlite3) + PizZip + Docxtemplater. Frontend HTML/JS sin framework.

**Estructura del proyecto** (`C:\Users\Patricio\Desktop\lab-informes`):
```
public/forms/<ensayo>.html              ← formularios web (HTML+JS inline)
public/js/{storage,form-base,ui}.js     ← código compartido del frontend
server/index.js                         ← Express server
server/templates/<ensayo>.docx          ← plantillas Word con placeholders {{campo}}
server/generators/template-<ensayo>.js  ← genera .docx desde los datos del form
server/generators/word-generator.js     ← orquestador para informes combinados
server/agents/agente-ensayo.js          ← reglas QA por tipo (Claude Haiku)
server/agents/agente-mapeo.js           ← normaliza datos antes del generador
server/agents/agente-qa.js              ← QA general
server/agents/informes-referencia/<ensayo>/  ← informes reales por ensayo (5 por cada uno)
server/routes/api-agentes.js            ← endpoint /api/generate-with-qa/:nro_ot
server/routes/api.js                    ← rutas principales REST
lab-informes.db                         ← SQLite
package.json                            ← "npm run dev" usa nodemon (HOT RELOAD)
```

**Informes reales de referencia**: `G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA` (482 carpetas de clientes con .doc/.docx)

**Modelos Neuquén**: `G:\ADMINISTRACION\INFORMES TIPO PLAN B\Metalmecanica\MODELOS DE INFORME\Neuquen\` (ya convertidos a .docx en `C:\Users\Patricio\Downloads\neuquen_converted\`)

**Tipos de ensayo**: traccion, impacto, plegado, nick-break, quimicos, dureza-brinell, dureza-vickers (+ combinados).

---

## MÉTODO DE TRABAJO

1. Leer informes reales de referencia antes de cambiar cualquier form/generator/template
2. Verificar form/generator/template existentes
3. Reporte de discrepancias → ESPERAR "OK" → aplicar
4. Scripts Python a disco con encoding UTF-8 sin BOM para cambios en templates
5. Validar sintaxis con node antes de probar
6. Probar generando .docx con datos reales de DB
7. Inspeccionar XML del .docx generado con PizZip

---

## REGLAS DEL USUARIO

- Códigos de referencia (ASME BPVC, API 1104, API 5L, ASTM A370): DEJAR aunque no aparezcan
- Campos variables → opción "Otra…" con input texto libre
- Filas/probetas eliminables: botón ✕ + panel restaurar. Estado en `filas_excluidas`
- Asteriscos OAA por fila → checkbox + find/replace en XML
- Combinados: numeración secuencial desde 1
- Equipamiento varía por SUCURSAL/máquina → TOGGLE PROMINENTE (3 botones grandes)
- Valores no numéricos válidos: energía ">240", temperatura "AMB" → `<input type="text">`
- Numeración como TEXTO, no automática (`convertirNumberingATexto`)
- Indicaciones formato natural (números en palabras, verbo plural, separadores `;` / ` y `)

---

## ESTADO POR ENSAYO

### TRACCIÓN — COMPLETO ✅ (con fixes de esta sesión)
- Variante Estándar (CABA) = Emic MM-203; Neuquén = Shimadzu MM-151
- Equipamiento estándar expandido: agrega CAL-570, MM-702
- Bug B8 corregido: HTML y generador tenían equipamiento invertido

### IMPACTO — COMPLETO ✅
- Variante Neuquén (Galdabini) vs CABA (Wolpert) — correcto en HTML y generador
- B9 verificado: no había bug real

### PLEGADO — COMPLETO ✅

### NICK-BREAK — COMPLETO ✅

### QUÍMICOS — EN PROGRESO ⚠️
Pendiente de esta sesión (no se llegó a tocar)

### DUREZA BRINELL — PARCIALMENTE COMPLETO ⚠️
Cambios aplicados en esta sesión:
- Template: márgenes corregidos, metodología/tiempo editables, muestra ensayada, equipamiento slot 5, sin columna zona
- Generador: nuevos campos, etiquetas corregidas, `convertirNumberingATexto`
- Form: norma dropdown, metodología editable, tiempo editable (default 15 s), nueva zona de impronta y muestra ensayada, equipamiento expandido (registrador PCAL-545, proyector MM-165), tabla sin zona

**Pendiente B3**: verificar que tiempo de aplicación y metodología sí aparecen en Word (puede ser que el server no recargó)

**Pendiente de tanda 2**: modo Neuquén (Shimadzu MM-151), columna zona opcional

### DUREZA VICKERS — BUGS PARCIALMENTE CORREGIDOS ⚠️
Aplicado en esta sesión:
- B6: nota "preliminar" ya no aparece si OT no es preinforme (`ocultarParrafoConTexto`)
- B7: label del patrón cambiado de `'Patrón TAG N˚MM-***'` a `'Patrón TAG N˚***'` (evita duplicación)

**PENDIENTE B5**: el reemplazo del patrón en el generador quedó incompleto — se cortó la sesión. El fix es:
```js
// En el map de EQUIPO al construir listaEquipos:
if (e.key === 'patron_vickers') {
  const pat = (datos.patron || '').trim();
  if (pat) return e.label.replace('***', pat);  // acepta PMM-976, MM-457, 716, etc.
  return null;  // si no hay patrón, no incluir
}
```
Y filtrar los null del array.

**Pendiente de tanda 2**: metodología seleccionable, tiempo de aplicación, norma con dígitos editables, CAL-570, hasta 30 filas, patrón TAG N°PMM-xxx

---

## TANDA 1 — ESTADO AL CERRAR SESIÓN

### Completados ✅
- **B1/B2 Imágenes**: DB tiene columna `fotos_json` en `ots`. Endpoints `/api/ot/:nro_ot/fotos` GET y POST. `guardarFotosLS()` guarda en DB + localStorage. `cargarFotosLS()` carga desde DB primero. `/generate` usa fotos de DB si no vienen por multipart.
- **B8 Tracción invertida**: HTML y generador corregidos (Estándar=Emic, Neuquén=Shimadzu)
- **B6 Vickers preliminar**: ocultado si `!ot.es_preinforme`
- **B7 Vickers patrón duplicado**: label cambiado a `Patrón TAG N˚***`

### Pendientes de tanda 1 ❌
- **B5 Vickers patrón no carga**: fix incompleto (ver código arriba)
- **B4 Tracción tabla Excel filas faltantes**: investigar — puede ser que el "Excel" sea el Word. Preguntar al usuario qué exactamente falta
- **B3 Brinell tiempo/metodología**: verificar con server reiniciado
- **B9 Impacto**: verificado OK, no había bug

### Tanda 2 pendiente (mejoras de form + Word)
W1 Carátula: sacar espacio después del párrafo de imagen
W2 Químicos: sacar espacio después de párrafo en celdas de tabla
W3 Químicos: reducir a 1 espacio sobre "FIN DE INFORME"
W4 Plegado: reducir a 1 espacio sobre sección de indicaciones
W5 OAA: siempre en negrita centrado, fuera de sección, sin título
W6 Impacto: ID de muestra en negrita
W7 Impacto: imagen dice "N°3" cuando es informe solo (debería ser "N°1")
W8 Tracción: agregar "Plano de probeta según..." (faltaba)
U1 Orientación de probeta tracción → opcional
U2 Plegado diámetro mandril: número + dropdown "Espesores / mm"
U3 Vickers: metodología seleccionable en HTML
U4 Vickers: tiempo de aplicación en HTML
U5 Vickers: norma con dígitos editables al final
U6 Vickers: agregar Calibre digital Mitutoyo TAG N˚CAL-570
U7 Vickers: tabla hasta 30 filas
U8 Brinell modo Neuquén (Shimadzu MM-151)
U9 Brinell columna Zona opcional
U11 Químicos: texto evaluación pre-cargado
U12 Tracción: equipamiento alternativo ← ya hecho en B8
U13 Mapa Vickers: nuevo ensayo

### Tanda 3 pendiente (sistema)
S1 Trello: título mal parseado para CINTOLO (toma "N° de solicitud" en lugar del número)
S2 Trello: razón social asigna siempre la última ingresada
S3 Tablas: ancho máximo 15 cm
S4 Validación de fechas en carátula
S5 Fecha finalización default = fecha actual

---

## SCHEMA DB ACTUAL

```sql
clientes: nro_cliente(TEXT), razon_social(TEXT), fantasia(TEXT), creado_en(TEXT)
ots: id, nro_ot, nro_solicitud, nro_cliente, razon_social, id_muestra,
     fecha_recepcion, fecha_aprobacion, fecha_finalizacion, trello_url,
     creado_en, es_preinforme, fotos_json  ← columna nueva agregada esta sesión
ensayos: id, nro_ot, tipo, orden, datos_json, creado_en
```

---

## PATRONES TÉCNICOS CLAVE

### Generador genérico
```js
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
// 1. Normalizar datos → 2. Construir campos → 3. Renderizar → 4. Post-proceso XML
// Post-proceso: eliminarSeccionesOcultas, convertirNumberingATexto, eliminarParrafosVacios
```

### Marcadores en placeholders
- `__SECTION_HIDE__` → oculta párrafo entero
- `__HIDE__` → oculta celda de tabla
- `__IMAGE_HERE__` / `__IMAGE_NONE__` → imagen

### PowerShell
- NUNCA usar `&&` → usar `;`
- Python UTF-8 sin BOM: `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))`
- Ejecutar node: `node script.js` con shell: cmd

### Bugs conocidos
- `<w:t[^>]*>` matchea `<w:tab/>` → usar `<w:t\b[^>]*>`
- Node cachea require → nodemon recarga automático con `npm run dev`
- agente-mapeo.js puede transformar datos → normalizar al inicio del generador

### Test rápido
```js
const db = require('better-sqlite3')('./lab-informes.db', {readonly:true});
const ot = db.prepare('SELECT * FROM ots WHERE nro_ot=?').get('534432');
const ensayo = db.prepare("SELECT * FROM ensayos WHERE nro_ot=? AND tipo=?").get('534432','traccion');
db.close();
const datos = JSON.parse(ensayo.datos_json);
const {generarXxxDesdeTemplate} = require('./server/generators/template-xxx.js');
const buf = generarXxxDesdeTemplate(ot, datos, []);
require('fs').writeFileSync('C:/Users/Patricio/Downloads/_test.docx', buf);
```

### Inspeccionar XML
```js
const PizZip = require('pizzip');
const xml = new PizZip(require('fs').readFileSync(path,'binary')).files['word/document.xml'].asText();
function ctx(needle) {
  const i = xml.indexOf(needle);
  const s = xml.lastIndexOf('<w:p ', i);
  return xml.slice(s, xml.indexOf('</w:p>', i)+6);
}
```

---

## CÓMO RETOMAR

1. Leer este superprompt
2. Empezar por **B5 Vickers patrón** (fix incompleto, ver código arriba)
3. Luego **B4** (preguntar al usuario qué exactamente falta en tracción)
4. Luego **B3** (verificar brinell con server reiniciado)
5. Continuar tanda 2

**El usuario es técnico** — habla en español, respuestas concisas, evidencia de que funciona (preview .docx), no asumir sin chequear informes reales.

*Última actualización: tanda 1 parcialmente completada. Próximo: terminar B5, luego tanda 2.*