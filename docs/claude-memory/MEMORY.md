# Memoria del Proyecto — lab-informes

- [Proyecto general](project_general.md) — Sistema Node.js/Express de informes metalúrgicos, 21 tipos de ensayo, front SPA React en public-new/
- [Feedback de trabajo](feedback_trabajo.md) — Reglas de trabajo validadas en sesiones anteriores
- [Estado migración front](project_migracion.md) — CERRADA (histórico). El front nuevo es el activo hace meses.
- [Feedback imagen carga](feedback_imagen_carga.md) — Editor de foto carátula usa recorte libre con handles
- [Referencias por ensayo](reference_referencias.md) — Carpeta de .docx reales por tipo en server/agents/informes-referencia/
- [Modelo F2 — 8 ensayos metalográficos](project_metalografia.md) — Template y generator únicos parametrizados por subtipo, + rugosidad y macrografia
- [Ensayos template-based nuevos](project_ensayos_template.md) — varios, metalografia-general, anexo-metalografico, tratamientos-termicos, liquidos-penetrantes (2026-07)
- [Imágenes dentro de secciones](project_imagenes_ensayo.md) — helper insertarImagenesEnsayo (usado en metalografia-general; ferrita-delta pendiente)
- [OAA asteriscos y notas](feedback_oaa_asteriscos.md) — Reglas de asteriscos OAA en informes y tabla de tracción
- [Semántica de `datos.oaa`](project_oaa_semantica.md) — El flag tiene 3 significados incompatibles; usar `agente-oaa.detectarLote()` para saber si es acreditado
- [Deploy 24/7 en server local](project_deploy.md) — Servicio Windows en 192.168.1.200 vía NSSM. Env vars DRIVE_INFORMES_ROOT + AS400_*. Deploy con deploy-a-G.ps1.
- [Backup diario a Google Drive](project_backup_drive.md) — Task 6am + rclone. Si la DB no cambió, Drive muestra fecha vieja (dedupe) — NO es bug.
- Prompt de continuación en `C:\Users\Patricio\Desktop\lab-informes\PROMPT-CONTINUACION.md` (regenerar cuando corresponda)
