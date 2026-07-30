---
name: project-general
description: Descripción general del sistema lab-informes y su arquitectura
metadata:
  node_type: memory
  type: project
  originSessionId: 5846a3dc-c3a8-4530-9e7a-800b6992c3b7
---

Sistema Node.js/Express en `C:\Users\Patricio\Desktop\lab-informes` que genera informes Word (.docx) metalúrgicos.

**Stack:** Express + SQLite (better-sqlite3) + docxtemplater + PizZip + Claude Haiku (QA)

**Entrypoint servidor:** `server/index.js` (puerto 3000). Sirve `public-new/` como front principal (SPA React vía CDN, sin build). El front viejo `public/` sigue montado como fallback pero no se usa activamente.

**Tipos de ensayo implementados (backend + templates + schema React) — al 2026-07-13:**

*Clásicos (9):* traccion, impacto, plegado, nick-break, quimicos, dureza-brinell, dureza-rockwell, dureza-vickers, ferrita-delta.

*Metalografía modelo F2 (8 sub-tipos + rugosidad + macrografia):* microestructura, tamano-grano, inclusiones, estructura-grafito, espesor-capa, decarburacion, defectos-superficiales, porosidad, rugosidad, macrografia — ver [[project-metalografia]].

*Template-based nuevos (5):* varios, metalografia-general, anexo-metalografico, tratamientos-termicos, liquidos-penetrantes — ver [[project-ensayos-template]]. Reutilizan `varios.docx` o `tratamientos-termicos.docx` con post-proceso.

Total: 21 tipos registrados en `GENERADORES_TEMPLATE` (word-generator.js:35-55).

**Convenciones obligatorias en cada `template-*.js`:**
- `forzarCalibri(outXml)` → fuerza Calibri 11pt (sz=22) en todo el cuerpo. Aplicar DESPUÉS de `manejarImagenesCaratula`.
- `ajustarEspaciado` con landmarks: CONDICIONES (0 blancos), EQUIPAMIENTO (1), RESULTADOS (1), EVALUACION (1), NOTA (1), FIN DE INFORME (1).
- Multi-imagen vía `manejarImagenesCaratula(processedZip, outXml, fotos, 'tipo')`.
- Imágenes DENTRO de secciones vía `insertarImagenesEnsayo(...)` (ver [[project-imagenes-ensayo]]).
- OAA opcional: `*` al título + texto vía `insertarOAAAntesDeFin`. Ver [[feedback-oaa-asteriscos]].

**Mapeo v2→v1:** `generarWordCompleto` llama `traducirV2aV1(tipo, datos)` antes de cada generator. Los 5 nuevos tipos usan default sin mapeos específicos.

**Pipeline QA multi-agente:**
1. `agente-ensayo.js` — validación semántica (Claude Haiku). Reglas por tipo para los 9 clásicos; los 5 nuevos usan fallback genérico.
2. `agente-mapeo.js` — `traducirV2aV1` + campos derivados
3. `agente-verificador-campos.js` — verifica campos post-mapeo. **Bloquea generación si hay errores** (salvo `?forzar=true`).
4. Word generator (`generarWordCompleto`)
5. `agente-qa.js` — inspección XML del docx
6. `agente-reparador.js` — correcciones automáticas
7. `agente-formato.js` + `agente-corrector-formato.js` — formato vs referencias
8. `agente-actualizador-forms.js` — pobla DB de equipos/normas

Endpoints:
- `POST /api/generate/:nro_ot` — generación directa (sin QA)
- `POST /api/generate-with-qa/:nro_ot` — pipeline completo con validación bloqueante
