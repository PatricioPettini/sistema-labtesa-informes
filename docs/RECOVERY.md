# Manual de Recuperación — Sistema Lab-Informes

Guía paso a paso para restaurar el sistema en distintos escenarios.
Actualizado: 2026-07-23.

---

## Inventario de datos críticos

**1. Base de datos** (SQLite, contiene TODO):
- Archivo principal: `C:\Users\Patricio\Desktop\lab-informes\lab-informes.db`
- Archivos auxiliares WAL: `lab-informes.db-wal`, `lab-informes.db-shm` (no borrar si el servicio está corriendo)

**2. Backups locales**:
- Carpeta: `C:\Users\Patricio\Desktop\lab-informes\backups\`
- Frecuencia: cada 24 hs (al arrancar el servicio Windows)
- Retención: 30 diarios + 12 semanales + 24 mensuales
- Formato: `lab-informes_YYYY-MM-DD_HHMM.db`

**3. Backups off-site** (share de red del laboratorio):
- Carpeta: `\\192.168.1.200\Labtesa1\ADMINISTRACION\_BACKUPS_LAB_INFORMES\`
- Copia automática de cada snapshot local
- Sobrevive a fallo total de la PC de Patricio

**3b. Backup en Google Drive** (fuera del laboratorio — protege contra desastre físico):
- Cuenta: `pato.pettini@gmail.com` (personal)
- Carpeta: [Backups Lab-Informes](https://drive.google.com/drive/folders/15gzC9N1YirVrTlMbDfiyIjrqHUrN6PC3)
- Archivo: `lab-informes-latest.db` (nombre fijo, se sobrescribe → mismo link siempre)
- Link directo: https://drive.google.com/file/d/1CySceennumoyLw-IJWtoud1U34NXH2e-/view
- Frecuencia: diaria a las 06:00 (Scheduled Task de Windows `LabInformes-SyncDBaDrive`)
- Script: `sync-db-a-drive.ps1` (usa rclone con remote `labdrive`)
- Sobrevive a: fallo de la PC de Patricio + caída del share `192.168.1.200` + incendio/robo del laboratorio.

**4. Trazabilidad interna de la DB** (append-only, sirven para auditoría):
- `ensayos_historial` — snapshot ANTES de cada UPDATE/DELETE de ensayo
- `informes_emitidos` — cada .docx generado con SHA-256 + payload JSON completo
- `firmas` — log de firmas/desfirmas con motivo obligatorio
- `eventos` — historial por OT

**5. Código fuente** (repositorio):
- Local: `C:\Users\Patricio\Desktop\lab-informes\`
- En share: `G:\METALMECANICA\lab-informes\` (sincronizado con `deploy-a-G.ps1`)

---

## Escenario A — La PC de Patricio dejó de funcionar

**Síntomas:** el servicio Windows no responde, no se puede abrir `http://192.168.1.121:3000/v2/`.

### 1. Confirmar el diagnóstico
Desde otra PC en la LAN:
```powershell
Test-NetConnection 192.168.1.121 -Port 3000
Get-Service LabInformes -ComputerName 192.168.1.121
```

### 2. Traer los backups del share
Los backups off-site están en `\\192.168.1.200\Labtesa1\ADMINISTRACION\_BACKUPS_LAB_INFORMES\`.
Los últimos 30 diarios están ahí. Elegir el más reciente que no esté corrupto:
```powershell
Get-ChildItem "\\192.168.1.200\Labtesa1\ADMINISTRACION\_BACKUPS_LAB_INFORMES\" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

### 3. Levantar el servicio en otra PC
En una PC con Node.js:
```powershell
# Clonar el código desde el share
robocopy "\\192.168.1.200\Labtesa1\METALMECANICA\lab-informes" C:\lab-informes /E /XD node_modules

cd C:\lab-informes
npm install

# Restaurar el backup como lab-informes.db
Copy-Item "\\192.168.1.200\Labtesa1\ADMINISTRACION\_BACKUPS_LAB_INFORMES\lab-informes_YYYY-MM-DD_HHMM.db" ".\lab-informes.db"

# Copiar el .env desde el share (o pedirlo — contiene tokens)
Copy-Item "\\192.168.1.200\Labtesa1\METALMECANICA\lab-informes\.env" .

# Arrancar
node server/index.js
```

Abrir `http://<IP-nueva-PC>:3000/v2/` y verificar que todos los datos están.

---

## Escenario B — La DB local se corrompió pero la PC vive

**Síntomas:** el servicio arranca pero errores "database disk image is malformed" o similares.

### 1. Parar el servicio
```powershell
# PowerShell como admin
Stop-Service LabInformes
```

### 2. Renombrar la DB corrupta
```powershell
cd C:\Users\Patricio\Desktop\lab-informes
Move-Item lab-informes.db lab-informes.CORRUPTA.db
Move-Item lab-informes.db-wal lab-informes.CORRUPTA.db-wal -ErrorAction SilentlyContinue
Move-Item lab-informes.db-shm lab-informes.CORRUPTA.db-shm -ErrorAction SilentlyContinue
```

### 3. Restaurar el último backup íntegro
```powershell
# Verificar integridad de los backups (empezar por el más reciente)
$backup = Get-ChildItem .\backups\ | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $backup.FullName .\lab-informes.db
```

### 4. Confirmar integridad del backup restaurado
```powershell
node -e "const db=require('better-sqlite3')('./lab-informes.db',{readonly:true}); console.log(db.prepare('PRAGMA integrity_check').all()); db.close();"
```
Debería devolver `[ { integrity_check: 'ok' } ]`.

### 5. Rearrancar
```powershell
Start-Service LabInformes
```

Verificar en `http://192.168.1.121:3000/v2/` que los datos están.

**Nota:** vas a perder los cambios entre el último backup (últimas 24 hs) y el momento del fallo. Los informes .docx generados en ese lapso quedan (están en G:\), solo se pierden los datos del formulario en la app.

---

## Escenario C — Alguien borró una OT sin querer

Las OTs eliminadas quedan trazadas en `ensayos_historial`. Los informes emitidos también sobreviven en `informes_emitidos`.

### 1. Consultar el historial
```powershell
cd C:\Users\Patricio\Desktop\lab-informes
node -e "
  const db = require('better-sqlite3')('./lab-informes.db', {readonly:true});
  const filas = db.prepare('SELECT * FROM ensayos_historial WHERE nro_ot = ? ORDER BY fecha DESC').all('12345');
  console.log(JSON.stringify(filas, null, 2));
  db.close();
"
```
(reemplazar `'12345'` por el nro_ot que buscás)

### 2. Recuperar los datos del último snapshot
El `datos_json_anterior` de la fila `accion='delete'` tiene los datos ANTES del borrado.

### 3. Re-crear la OT
Ingresar de nuevo la OT en el sistema con los datos rescatados de `datos_json_anterior`. Alternativa: si es urgente, se puede hacer un `INSERT` manual con `node` — pedir ayuda técnica.

---

## Escenario D — Auditoría (2 años atrás)

Los backups escalonados guardan **24 meses de historial**. Un auditor puede pedir "el estado de la DB al 15 de marzo de 2025".

### 1. Buscar el backup del mes
```powershell
Get-ChildItem "\\192.168.1.200\Labtesa1\ADMINISTRACION\_BACKUPS_LAB_INFORMES\" |
  Where-Object { $_.Name -match "2025-03-" }
```

### 2. Abrir el backup en modo lectura (sin tocar la DB en producción)
```powershell
# Copiar el backup a un lugar temporal
Copy-Item "\\192.168.1.200\...\lab-informes_2025-03-XX_YYYY.db" C:\temp\audit-2025-03.db

# Consultar
node -e "
  const db = require('better-sqlite3')('C:/temp/audit-2025-03.db', {readonly:true});
  console.log(db.prepare('SELECT nro_ot, razon_social, fecha_finalizacion FROM ots WHERE fecha_finalizacion LIKE ?').all('2025-03-%'));
  db.close();
"
```

### 3. Ejemplos de consultas útiles
```sql
-- OTs firmadas en un período
SELECT nro_ot, firmado_por, firmado_en FROM ots
WHERE firmado_en BETWEEN '2025-03-01' AND '2025-03-31'
ORDER BY firmado_en;

-- Informes emitidos y su hash SHA-256
SELECT filename, sha256, size_bytes, correlativo
FROM informes_emitidos
WHERE nro_ot = 'XXXXX'
ORDER BY id DESC;

-- Historial de un ensayo puntual
SELECT accion, datos_json_anterior, datos_json_nuevo, fecha
FROM ensayos_historial
WHERE ensayo_id = <id>
ORDER BY fecha ASC;

-- Firmas de una OT (bloqueo/desbloqueo)
SELECT accion, token_nombre, motivo, fecha
FROM firmas
WHERE nro_ot = 'XXXXX'
ORDER BY fecha ASC;
```

---

## Escenario E — Verificar que un informe .docx generado no fue alterado

Cada .docx generado tiene su SHA-256 guardado en `informes_emitidos`. Si un auditor quiere validar que un archivo Word no fue modificado post-emisión:

```powershell
# Calcular SHA-256 del archivo actual
$hash = (Get-FileHash "G:\ADMINISTRACION\INFORMES APOLO\...\XXX.docx" -Algorithm SHA256).Hash.ToLower()
Write-Output "Hash actual: $hash"

# Comparar contra el registrado en DB
node -e "
  const db = require('better-sqlite3')('./lab-informes.db', {readonly:true});
  const r = db.prepare('SELECT sha256 FROM informes_emitidos WHERE filename = ?').get('XXX.docx');
  console.log('Hash en DB:', r && r.sha256);
  db.close();
"
```
Si coinciden → el archivo NO fue alterado desde su emisión.

---

## Escenario F — Desastre total (PC + share del lab caídos)

**Síntomas:** la PC de Patricio (`192.168.1.121`) no responde Y el share `\\192.168.1.200\Labtesa1\` no está accesible (ej. incendio, robo, corte de red prolongado, ambos servidores caídos).

El único backup vivo en ese caso es el de Google Drive.

### 1. Bajar el .db desde Drive
Desde cualquier PC con internet:
- Abrir https://drive.google.com/file/d/1CySceennumoyLw-IJWtoud1U34NXH2e-/view
- Autenticarse con `pato.pettini@gmail.com` (o cualquier cuenta con acceso a la carpeta).
- Descargar → guardar como `lab-informes.db`.
- El archivo contiene el estado del sistema **al último ciclo diario** (máximo 24 hs de atraso; si el sync corrió a las 06:00, ese es el estado).

### 2. Verificar integridad
```powershell
node -e "const db=require('better-sqlite3')('./lab-informes.db',{readonly:true}); console.log(db.prepare('PRAGMA integrity_check').all()); db.close();"
```
Debería devolver `[ { integrity_check: 'ok' } ]`.

### 3. Traer el código
Si el share está caído, hay dos opciones:
- Clonar desde el repositorio Git (si está en un remoto).
- Reconstruir a partir del último `deploy-a-G.ps1` que tengas localmente en cualquier PC.

### 4. Levantar el servicio
```powershell
cd C:\lab-informes-recovery
npm install
# El .env con AS400_* y DRIVE_INFORMES_ROOT hay que reconstruirlo a mano
# (secretos NO están en Drive por seguridad — están solo en el share).
node server/index.js
```

**Aviso:** el .env NO se hace backup a Drive (contiene credenciales). Si perdés el share, hay que reconfigurar tokens y credenciales AS/400 desde cero.

### 5. Actualización opcional: extender frecuencia
Si querés reducir el RPO (recovery point objective — cuánto podés perder), aumentar la frecuencia del scheduled task. Ej. cada 4 horas en vez de diario:
```powershell
Get-ScheduledTask -TaskName LabInformes-SyncDBaDrive | Get-ScheduledTaskTrigger
# Editar el trigger a intervalo horario/cuatro-horario
```

---

## Rutinas de mantenimiento

### Backup manual on-demand
Antes de una migración o cambio grande, forzar un backup:
```powershell
cd C:\Users\Patricio\Desktop\lab-informes
node -e "require('./server/utils/backup-db').crearBackup()"
```

### Verificar que los backups off-site están funcionando
```powershell
# Debería listar los backups más recientes.
Get-ChildItem "\\192.168.1.200\Labtesa1\ADMINISTRACION\_BACKUPS_LAB_INFORMES\" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 5
```
Si el archivo más reciente tiene más de 25 hs → revisar el log del servicio: `Get-Content service-stdout.log -Tail 50`.

### Ver logs del servicio
```powershell
cd C:\Users\Patricio\Desktop\lab-informes
Get-Content .\service-stdout.log -Tail 100
Get-Content .\service-stderr.log -Tail 100
```

Buscar líneas `[backup] snapshot creado`, `[backup] off-site OK`, `[backup] integrity_check OK`.
Si aparece `[backup] off-site FALLÓ` → el share no está accesible (probable problema de red o permisos).

---

## Contactos técnicos

- Responsable código: Patricio
- Servicio Windows: `LabInformes` en `192.168.1.121` (o `192.168.1.200`)
- Deploy: `deploy-a-G.ps1`
