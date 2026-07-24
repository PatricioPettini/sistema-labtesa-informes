# Fuerza un backup nuevo del .db en vivo y lo sube a Google Drive con nombre
# fijo (lab-informes-latest.db). Sobrescribe el archivo existente en la carpeta
# destino, manteniendo el mismo fileId y link. Como forzamos backup nuevo antes
# de subir, la "fecha de modificación" en Drive refleja el momento real del
# scheduled task (no el mtime viejo del último snapshot local).

$ErrorActionPreference = 'Stop'

$PROJECT_DIR  = 'C:\Users\Patricio\Desktop\lab-informes'
$BACKUPS_DIR  = Join-Path $PROJECT_DIR 'backups'
$RCLONE_EXE   = 'C:\Users\Patricio\AppData\Local\Microsoft\WinGet\Packages\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\rclone-v1.74.4-windows-amd64\rclone.exe'
$DRIVE_REMOTE = 'labdrive'
$DRIVE_FOLDER = '15gzC9N1YirVrTlMbDfiyIjrqHUrN6PC3'
$DRIVE_NAME   = 'lab-informes-latest.db'
$LOG_FILE     = Join-Path $PROJECT_DIR 'sync-db-a-drive.log'

function Log($msg) {
  $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $msg
  Write-Output $line
  Add-Content -Path $LOG_FILE -Value $line -Encoding utf8
}

try {
  if (-not (Test-Path $RCLONE_EXE)) { throw 'No se encuentra rclone.exe en ' + $RCLONE_EXE }

  # 1) Forzar snapshot NUEVO del .db en vivo (VACUUM INTO). Esto usa el mismo
  # helper que el servicio, incluye integrity_check y respeta la retencion.
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }
  if (Test-Path $node) {
    Log 'Forzando backup fresco antes de sync...'
    Push-Location $PROJECT_DIR
    try {
      & $node -e "require('./server/utils/backup-db').crearBackup()" 2>&1 | ForEach-Object { Log ('  [backup] ' + $_) }
      if ($LASTEXITCODE -ne 0) { Log ('AVISO: crearBackup fallo (exit ' + $LASTEXITCODE + '), sigo con el ultimo backup existente.') }
    } finally { Pop-Location }
  } else {
    Log 'AVISO: node no encontrado, salteo backup fresco. Voy a subir el ultimo existente.'
  }

  # 2) Elegir el .db mas reciente de la carpeta de backups.
  $ultimo = Get-ChildItem -Path $BACKUPS_DIR -Filter '*.db' -ErrorAction Stop |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $ultimo) { throw 'No hay backups .db en ' + $BACKUPS_DIR }

  $mb = [math]::Round($ultimo.Length / 1MB, 1)
  Log ('Subiendo ' + $ultimo.Name + ' (' + $mb + ' MB) -> ' + $DRIVE_REMOTE + ':' + $DRIVE_NAME)

  # 3) Subir a Drive. --no-update-modtime hace que Drive use la fecha "ahora"
  # y no el mtime del origen, asi la fecha de modificacion refleja el sync real.
  & $RCLONE_EXE copyto $ultimo.FullName ($DRIVE_REMOTE + ':' + $DRIVE_NAME) `
    --drive-root-folder-id $DRIVE_FOLDER `
    --no-update-modtime `
    --stats-one-line --stats 30s
  if ($LASTEXITCODE -ne 0) { throw ('rclone fallo (exit ' + $LASTEXITCODE + ')') }

  Log ('OK - snapshot subido a Drive como ' + $DRIVE_NAME)
} catch {
  Log ('ERROR: ' + $_.Exception.Message)
  exit 1
}
