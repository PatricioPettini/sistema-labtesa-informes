---
name: project-metalografia
description: "8 ensayos metalográficos del modelo F2 (microestructura, tamaño grano, inclusiones, etc.) implementados como ensayos independientes con UN template y UN generator parametrizado"
metadata: 
  node_type: memory
  type: project
  originSessionId: 90735473-1191-4e8a-83ee-6b30a90b6880
---

**Nota (2026-07-13):** Estos 8 ensayos son INDEPENDIENTES del ensayo `metalografia-general` (FM-055) agregado después en 2026-07-06. `metalografia-general` agrupa varios análisis en un solo informe y es distinto conceptualmente. Ver [[project-ensayos-template]]. No confundir.

Modelo `G:\ADMINISTRACION\INFORMES TIPO PLAN B\Metalmecanica\MODELOS DE INFORME\modelos mas usados\F2. 9 -Microestrctura-...doc` incluye 8 ensayos que se implementaron como tipos independientes el 2026-06-22:

- `microestructura`, `tamano-grano`, `inclusiones`, `estructura-grafito`, `espesor-capa`, `decarburacion`, `defectos-superficiales`, `porosidad`

**Why:** Cada uno se trata como ensayo independiente (no como un combinado) para mantener consistencia con el resto del sistema; comparten estructura común así que se decidió UN template + UN generator parametrizado en lugar de 8 templates.

**How to apply (v2 — 2026-06-22):**
- 8 templates físicos en `server/templates/` (microestructura.docx, tamano-grano.docx, inclusiones.docx, estructura-grafito.docx, espesor-capa.docx, decarburacion.docx, defectos-superficiales.docx, porosidad.docx).
- Cada uno replica el formato VISUAL EXACTO del modelo F2 (`G:\ADMINISTRACION\INFORMES TIPO PLAN B\Metalmecanica\MODELOS DE INFORME\modelos mas usados\F2. 9 -...doc`): textos fijos de normas, ITMs por defecto, espaciados, numeración de listas, todo viene del modelo.
- Chasis (carátula Labtesa + headers + estilos + numbering) viene de `ferrita-delta.docx`. Combinado: cuerpo del modelo F2 sobre chasis Labtesa.
- El asterisco OAA (originalmente highlight cyan en el modelo) y la línea OAA son placeholders `{{asterisco_oaa}}` y `{{oaa_linea}}`. El generator decide si renderizarlos.
- Placeholders editables por subtipo (no todos los templates tienen todos):
  - Comunes: `temperatura`, `aumento`, `muestra_ensayada`, `zona_examinada`, `num_imagen`
  - microestructura: `resultado_descripcion`
  - tamano-grano: `tamano_grano_numero`
  - inclusiones: tabla A/B/C/D × Fino/Grueso inyectada por post-proceso desde `datos.inclusiones`
  - estructura-grafito: `astm_a247_anio`, `metodologia_numero`, `grafito_tipo`, `grafito_numero`, `grafito_clase`, `nodularidad`, `nodulos`
  - espesor-capa: `espesor`
  - decarburacion: `metodologia_numero`, `decarburacion_estado`
  - defectos-superficiales: `profundidad_defecto`, `caption_descripcion`
- Si un campo no se carga, el placeholder visual del modelo (`**`, `***`, `XXX`, `*******`) se mantiene literal en el output.
- Generator único parametrizado: `server/generators/template-metalografia.js`. Switch sobre `subtipo` → mapea `datos` a placeholders y selecciona el `.docx` correcto en `TEMPLATE_PATHS`.
- Tabla de inclusiones se inyecta vía post-proceso (`inyectarValoresInclusiones`) leyendo `datos.inclusiones.{fino_a,fino_b,fino_c,fino_d,grueso_a,grueso_b,grueso_c,grueso_d}`.
- Script para regenerar los 8 templates: `_inspect/construir-8-templates-v2.js` (extrae bloques de modelo-multimicro.docx + injecta placeholders).

**Rugosidad (modelo F2 241451) — agregado 2026-06-22:**
- Tipo `rugosidad`. Template: `server/templates/rugosidad.docx`. Generator: `server/generators/template-rugosidad.js`.
- Mismo enfoque: chasis ferrita-delta + bloque del modelo F2 con placeholders.
- Placeholders: `itm_numero`, `valor_requerido`, `cantidad_mediciones`, `temperatura`, `tipo_r` (Ra/Rz/...), `valor_rugosidad`, `valor_max_eval`.
- Tabla de mediciones por post-proceso desde `datos.mediciones = [{muestra, rugosidad, valor}]`.
- Texto de evaluación opcional sobrescribible vía `datos.eval_texto`.
- Equipos fijos del modelo: Rugosímetro Mitutoyo SJ 410 MM-628, Patrón Mitutoyo PMM-630, Termohigrómetro MM-700.

**Macrografía general (modelo F2 244325) — agregado 2026-06-22:**
- Tipo `macrografia`. Template propio: `server/templates/macrografia.docx`. Generator dedicado: `server/generators/template-macrografia.js`.
- Mismo enfoque: chasis ferrita-delta + bloque del modelo F2 macrografia (códigos de referencia ASME/AWS/ASTM/EN ISO fijos del modelo, ataques ácido clorhídrico/CR 12361 fijos).
- Placeholders: `temperatura`, `resultado_op1..resultado_op4` (uno por opción literal del modelo; el front decide cuál mostrar con checkboxes `op_1..op_4`).
- Tabla de catetos (Mtra.1/2/3 × Cateto 1A/2A/Diferencia/Cateto 1B/2B/Diferencia) llenada por post-proceso desde `datos.muestras = [{cateto_1a, cateto_2a, diferencia_a, cateto_1b, cateto_2b, diferencia_b}]`.
- Si `datos.resultado_texto` se carga y solo una OP está activa, ese texto sobrescribe la opción.
- Script generador: `_inspect/construir-macrografia.js`.

**Bugs fix-eados en la misma sesión:**
- `id_muestra` de Trello con caracteres invisibles (NBSP/ZWSP/ZWNJ/ZWJ/BOM) que desplazaban la imagen de carátula a otra página → `sanitizarIdMuestra()` en `api.js`, `api-v2.js`, `api-agentes.js`. Limpia tanto al parsear Trello como al guardar OT y al generar Word (cubre OTs viejas en DB).
- Imagen no redimensionable en químicos → orden de post-proceso: `forzarCalibri()` debe ir DESPUÉS de `manejarImagenesCaratula()`, no antes (mismo orden que tracción).
- Tracción: agregados campos `temperatura_probeta` y `tiempo_a_temperatura` en schema, generator y template.
