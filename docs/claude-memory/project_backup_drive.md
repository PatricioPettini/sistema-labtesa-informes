---
name: project-backup-drive
description: "Backup diario a Google Drive a las 6am — comportamiento esperado incluye \"no update\" cuando la DB no cambió"
metadata: 
  node_type: memory
  type: project
  originSessionId: 12c0350a-0b11-49cf-b194-2df7c35f5e85
---

# Backup diario a Drive a las 6am

**Task programada de Windows**: `LabInformes-SyncDBaDrive` (Task Scheduler), corre a las 06:00 todos los días.
Ejecuta `C:\Users\Patricio\Desktop\lab-informes\sync-db-a-drive.ps1`.

**Flujo del script**:
1. Fuerza un backup local vía `require('./server/utils/backup-db').crearBackup()` (VACUUM INTO + integrity_check).
2. Elige el `.db` más reciente de `./backups/`.
3. Lo sube a Google Drive vía `rclone copyto` con flag `--no-update-modtime`.
   - Remote: `labdrive:` (carpeta id `15gzC9N1YirVrTlMbDfiyIjrqHUrN6PC3`).
   - Nombre destino fijo: `lab-informes-latest.db`.

**Log**: `sync-db-a-drive.log` en la raíz del proyecto.

## Comportamiento "backup no aparece hoy" — NO ES BUG

Si en Drive ves una fecha vieja (ej. "hace 2 días") en `lab-informes-latest.db`, **es porque no hubo actividad en la DB desde esa fecha**. Con `--no-update-modtime`:
- rclone compara hashes del archivo local vs Drive.
- Si idénticos → skip upload + skip modtime update.
- Drive queda mostrando el modtime de la última vez que el contenido efectivamente cambió.

**Cómo confirmar que el sync corrió**:
- `Get-Content sync-db-a-drive.log -Tail 30` → debe aparecer `OK - snapshot subido` con la fecha de hoy.
- `Get-ScheduledTaskInfo -TaskName LabInformes-SyncDBaDrive` → LastRunTime + LastTaskResult=0.
- Backup local `backups/lab-informes_YYYY-MM-DD_0600.db` existe con el .db del día.

**Why:** decisión del usuario 2026-07-27 tras diagnóstico: si la DB no cambió, no hay razón de gastar upload ni forzar modtime nuevo. Se acepta que Drive parezca "viejo" durante fines de semana / feriados sin actividad.

**How to apply:**
- NO agregar lógica que fuerce update de modtime en cada corrida.
- Si el usuario pregunta "por qué el backup en Drive no se actualizó hoy", primero revisar audit log (`SELECT COUNT(*) FROM eventos WHERE fecha >= ...`) — si no hubo eventos, ese es el motivo.
- Comentario en el script (`--no-update-modtime hace que Drive use la fecha "ahora"...`) está MAL: la flag hace lo contrario. Corregir si se toca el script por otro motivo, pero no cambiar el comportamiento.

## Además hay un backup off-site paralelo
`server/utils/backup-db.js` corre cada 24hs desde que el servicio arranca, hace snapshot local + copia a `\\192.168.1.200\Labtesa1\ADMINISTRACION\_BACKUPS_LAB_INFORMES` (share Windows, no Drive). Es un mecanismo separado del sync a Google Drive.
