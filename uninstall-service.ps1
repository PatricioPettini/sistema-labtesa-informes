# Desinstala el servicio "LabInformes" y quita la regla de firewall.
# Correr como ADMINISTRADOR.

$ErrorActionPreference = 'Stop'
$SERVICE_NAME = 'LabInformes'
$INSTALL_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path
$NSSM_EXE     = Join-Path $INSTALL_DIR 'nssm\nssm.exe'
$PORT         = 3000

$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole( `
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Error "Requiere ADMINISTRADOR." }

if (Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue) {
  Write-Output "Deteniendo $SERVICE_NAME..."
  & $NSSM_EXE stop $SERVICE_NAME 2>&1 | Out-Null
  Start-Sleep -Seconds 2
  & $NSSM_EXE remove $SERVICE_NAME confirm
  Write-Output "Servicio $SERVICE_NAME eliminado."
} else {
  Write-Output "El servicio $SERVICE_NAME no existe."
}

$rule = Get-NetFirewallRule -DisplayName "LabInformes port $PORT" -ErrorAction SilentlyContinue
if ($rule) { $rule | Remove-NetFirewallRule; Write-Output "Regla firewall eliminada." }
