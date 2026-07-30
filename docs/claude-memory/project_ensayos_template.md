---
name: project-ensayos-template
description: "5 ensayos template-based agregados junio-julio 2026 — varios, metalografia-general, anexo-metalografico, tratamientos-termicos, liquidos-penetrantes"
metadata: 
  node_type: memory
  type: project
  originSessionId: e940ca02-997d-400b-a157-f46e241f98c8
---

5 ensayos nuevos agregados entre 2026-07-02 y 2026-07-08. A diferencia de los clásicos, varios de ellos REUTILIZAN el mismo `.docx` (`varios.docx` o `tratamientos-termicos.docx`) e inyectan contenido específico por post-proceso.

**`varios` (FM-066) — `server/generators/template-varios.js`**
- Genérico libre / ad-hoc. El técnico define título del ensayo, condiciones, equipamiento, resultados (texto + tabla opcional), evaluación.
- Equipamiento variable: balanza, calibre, máquina tracción, mufla, microscopios, termohigrómetros.
- Soporta OAA y renumeración de secciones.
- Template físico: `server/templates/varios.docx`.

**`metalografia-general` (FM-055) — `server/generators/template-metalografia-general.js`**
- Multi-análisis: agrupa hasta 5 análisis (microestructura, espesor recubrimiento, estructura grafito, decarburacion, otro) en un único informe.
- **SOPORTA IMÁGENES DENTRO DE RESULTADOS** — es el primer y único generator que usa `insertarImagenesEnsayo`. Ver [[project-imagenes-ensayo]].
- Cada análisis tiene condiciones/equipamiento independientes.
- Template físico: reutiliza `varios.docx`.

**`anexo-metalografico` (FM-080) — `server/generators/template-anexo-metalografico.js`**
- Versión reducida de metalografia-general: 2 análisis (tamaño grano + tenor inclusionario).
- Reactivos y equipos simplificados. Soporta OAA.
- Template físico: reutiliza `varios.docx`.

**`tratamientos-termicos` (FM-110 Rev.00) — `server/generators/template-tratamientos-termicos.js`**
- Proceso metalúrgico con parámetros fijos por ciclo: temp. inicial, gradiente, tratamiento, enfriamiento, cantidad de ciclos.
- Tabla dinámica de ciclos (múltiples pasos).
- Equipamiento del catálogo: horno + registrador.
- Template físico: `server/templates/tratamientos-termicos.docx`.

**`liquidos-penetrantes` (FM-043) — `server/generators/template-liquidos-penetrantes.js`**
- Ensayo no destructivo. Bloques: INSTRUMENTOS + ENSAYO SEGÚN + LIMPIEZA PREVIA + CONDICIONES + RESULTADOS OBTENIDOS.
- 13 condiciones parametrizables.
- 6 instrumentos del catálogo (lámpara, microwattímetro, refractómetro, etc.).
- Template físico: reutiliza `varios.docx`.

**Why:** Se optó por template compartido con post-proceso (en vez de un `.docx` por tipo) porque estos ensayos tienen estructura visual similar y contenido muy variable por caso. Facilita mantener un solo chasis Labtesa.

**How to apply:**
- Si tocás uno de estos 5, mirar primero `informes-referencia/<tipo>/` (si existe) o el modelo original en `G:\ADMINISTRACION\INFORMES TIPO PLAN B\...`.
- Los 5 tipos NO tienen reglas específicas en `agente-ensayo.js` — fallback genérico. Si se necesita validación robusta, agregar REGLAS por tipo ahí.
- Schemas React declarados en `public-new/schemas.js` líneas 1337, 1407, 1429, 1448, 1469. Forms individuales: `variosform.jsx`, `metalografiageneralform.jsx`, `anexometalograficoform.jsx`, `tratamientostermicosform.jsx`, `liquidospenetrantesform.jsx`.

Relacionado: [[project-general]] · [[project-metalografia]] · [[project-imagenes-ensayo]]
