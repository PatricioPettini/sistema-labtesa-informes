---
name: project-migracion
description: Migración del front a React SPA en public-new/ — CERRADA. Se conserva por trazabilidad histórica.
metadata:
  node_type: memory
  type: project
  originSessionId: 5846a3dc-c3a8-4530-9e7a-800b6992c3b7
---

**ESTADO (2026-07-13): CERRADA.** El front nuevo (`public-new/`) es la SPA principal hace meses. `public/` sigue montado como fallback pero no se usa. Al 2026-07-13 se agregaron `index.html` + `index-prod.html` y un `build-frontend.js` para bundling — indica que ya no es CDN-only. Los 5 nuevos ensayos (varios, metalografia-general, etc.) se agregaron directamente al front nuevo con sus formularios individuales.

**Contenido histórico abajo (Paso 1 + Paso 2 del 2026-06-12):**

Paso 1 (Diagnóstico) completado el 2026-06-12.
Paso 2 (inspector/auditor) completado el 2026-06-12.

**Mejoras aplicadas en sesión 2:**

DATOS (DB):
- Normas y ITMs re-seeded con clase='norma' / clase='itm' (49 registros correctos)
  → Los ComboInput de norma y metodología ahora tienen opciones
- Normas generales (ASTM A370, ASME BPVC IX, API 1104) con tipo='general' → aparecen en todos los tipos

BACKEND:
- agente-actualizador-forms.js: clase de normas extraídas → 'norma' (no 'ASTM'/'ISO')
- agente-mapeo.js: dureza-brinell → norma_astm_e10/norma_iso6506 desde campo norma libre
- agente-mapeo.js: dureza-vickers → norma_astm_e92/norma_astm_e384 desde campo norma libre
- agente-mapeo.js: quimicos → norma_e415 y demás desde campo norma libre; metodologia → itm_numero
- agente-mapeo.js: Ceq → carb_eq (carbono equivalente)

FRONTEND (public-new/schemas.js):
- Tracción: zona_rotura/tipo_rotura/lado_rotura → selects con opciones
- Tracción: secciones nuevas: "Procedimientos y referencias" (ASME/API checkboxes),
  "Datos de probeta" (prob_cliente, prob_soldada, plano ASME, figura), "Notas y evaluación"
- Tracción: orientacion → select (Longitudinal/Transversal/Radial)
- Impacto: temp_acreditada checkbox, entalla como select, sección códigos de referencia (ASME/API)
- Plegado: AWS D1.1, norma_referencia, probeta_mecanizada_segun, ed_asme; orientacion → select
- Químicos: tabla extendida (C,Mn,Si,P,S,Cr,Ni,Mo,V,Cu,Fe + Ceq + Ti,Nb,Al,B,N,Co,W)
  Sección normas con checkboxes (norma_e415...), sección metodología con itm_numero
- Brinell: campos adicionales zona_ensayo, espesor_probeta, muestra_ensayada; tabla con zona
- Vickers: sección normas adicionales (E384, DIN, YPF), carga como select (0.1–100 kgf)

FRONTEND (public-new/otdetail.jsx):
- runQA() client-side: chequeo norma para químicos usa norma_e415/norma_e1086... en lugar de d.norma

**Gaps aún pendientes (del Paso 2 original):**
- TODOS los endpoints ya existían (ver project_migracion.md anterior)
- genWord() llama /api/generate/:nro_ot (sin QA) — funciona
- genQA() llama /api/generate-with-qa/:nro_ot — funciona y maneja 422

**Why:** La base de datos tenía clase='ASTM'/'ISO' en vez de clase='norma', haciendo que todos los dropdowns de normas e ITMs estuvieran vacíos.

**How to apply:** Cualquier cambio a la DB de normas debe usar clase='norma' o clase='itm'. El seed script de referencia está en _inspect/seed_normas_itms.js.
