# ==========================================================================
# Reinicia el servicio "LabInformes" y reconstruye el bundle del frontend.
# Correr como ADMINISTRADOR (clic derecho > "Ejecutar con PowerShell" como admin,
# o desde una consola PowerShell abierta como administrador).
# ==========================================================================

$ErrorActionPreference = 'Stop'

$SERVICE_NAME = 'LabInformes'
$INSTALL_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$NSSM_EXE     = Join-Path $INSTALL_DIR 'nssm\nssm.exe'

# --- Chequeo admin ---
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole( `
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Error "Este script debe correr como ADMINISTRADOR." }

# --- 1) Rebuild del bundle del front (toma los ultimos cambios de public-new) ---
$NODE_EXE = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($NODE_EXE) {
  Write-Output "[1/2] Rebuildeando bundle del frontend..."
  Push-Location $INSTALL_DIR
  try { & $NODE_EXE build-frontend.js --prod } finally { Pop-Location }
} else {
  Write-Output "[1/2] Node no esta en PATH; se omite el rebuild del bundle."
}

# --- 2) Reiniciar el servicio ---
Write-Output "[2/2] Reiniciando servicio $SERVICE_NAME..."
if (Test-Path $NSSM_EXE) {
  & $NSSM_EXE restart $SERVICE_NAME
} else {
  Restart-Service -Name $SERVICE_NAME -Force
}
Start-Sleep -Seconds 4

Get-Service -Name $SERVICE_NAME | Format-Table Name, Status, DisplayName
Write-Output ""
Write-Output "Ultimas lineas del log:"
Get-Content (Join-Path $INSTALL_DIR 'service-stdout.log') -Tail 15 -ErrorAction SilentlyContinue
Write-Output ""
Write-Output "Listo. Si el estado dice 'Running', el sistema esta al aire en http://localhost:3000/v2"
