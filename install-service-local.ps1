# ==========================================================================
# Instalador del servicio Windows "LabInformes" en la PC de Patricio.
# Adaptado para instalación LOCAL (no en un server remoto).
#
# Correr como ADMINISTRADOR.
# ==========================================================================

$ErrorActionPreference = 'Stop'

$SERVICE_NAME    = 'LabInformes'
$SERVICE_DISPLAY = 'Labtesa - Sistema de Informes'
$SERVICE_DESC    = 'Servidor Node.js del sistema de informes metalurgicos (puerto 3000).'
$PORT            = 3000
$INSTALL_DIR     = Split-Path -Parent $MyInvocation.MyCommand.Path
$NSSM_DIR        = Join-Path $INSTALL_DIR 'nssm'
$NSSM_EXE        = Join-Path $NSSM_DIR 'nssm.exe'
$NSSM_URL        = 'https://nssm.cc/release/nssm-2.24.zip'

# --- Chequeo admin ---
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole( `
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Error "Este script debe correr como ADMINISTRADOR."
}

# --- Chequeo Node ---
$NODE_EXE = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NODE_EXE) { Write-Error "Node.js no esta en PATH." }
Write-Output "Node encontrado en: $NODE_EXE"
Write-Output ("Version: " + (& $NODE_EXE --version))

# --- 0) Matar cualquier proceso Node que este ocupando el puerto ---
Write-Output "`n[0/5] Liberando puerto $PORT si esta ocupado..."
try {
  $conns = Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction Stop
  $pids = $conns.OwningProcess | Select-Object -Unique
  foreach ($p in $pids) {
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    Write-Output "  Kill PID $p"
  }
  Start-Sleep -Seconds 2
} catch { Write-Output "  Puerto $PORT libre." }

# --- 1) NSSM ---
if (-not (Test-Path $NSSM_EXE)) {
  Write-Output "`n[1/5] Descargando NSSM..."
  $tmp = New-Item -Path $env:TEMP -Name ("nssm_" + [guid]::NewGuid().Guid.Substring(0,6)) -ItemType Directory
  $zip = Join-Path $tmp.FullName 'nssm.zip'
  Invoke-WebRequest -Uri $NSSM_URL -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp.FullName -Force
  $arch = if ([Environment]::Is64BitOperatingSystem) { 'win64' } else { 'win32' }
  $binSrc = Join-Path (Get-ChildItem $tmp.FullName -Directory | Select-Object -First 1).FullName $arch
  New-Item -Path $NSSM_DIR -ItemType Directory -Force | Out-Null
  Copy-Item -Path (Join-Path $binSrc 'nssm.exe') -Destination $NSSM_EXE -Force
  Remove-Item $tmp -Recurse -Force
  Write-Output "NSSM instalado en $NSSM_EXE"
} else {
  Write-Output "`n[1/5] NSSM ya presente."
}

# --- 2) npm install si falta ---
if (-not (Test-Path (Join-Path $INSTALL_DIR 'node_modules'))) {
  Write-Output "`n[2/5] npm install..."
  Push-Location $INSTALL_DIR
  try { & npm install; if ($LASTEXITCODE -ne 0) { throw "npm install fallo" } }
  finally { Pop-Location }
} else {
  Write-Output "`n[2/5] node_modules ya presente, se omite npm install."
}

# --- 3) Rebuild bundle ---
Write-Output "`n[3/5] Rebuildeando bundle del front..."
Push-Location $INSTALL_DIR
try { & $NODE_EXE build-frontend.js --prod } finally { Pop-Location }

# --- 4) Servicio ---
$existe = Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue
if ($existe) {
  Write-Output "`n[4/5] Servicio $SERVICE_NAME ya existe. Deteniendo y reconfigurando..."
  & $NSSM_EXE stop $SERVICE_NAME 2>&1 | Out-Null
  Start-Sleep -Seconds 2
} else {
  Write-Output "`n[4/5] Instalando servicio $SERVICE_NAME..."
  & $NSSM_EXE install $SERVICE_NAME $NODE_EXE 'server/index.js'
}

& $NSSM_EXE set $SERVICE_NAME AppDirectory      $INSTALL_DIR
& $NSSM_EXE set $SERVICE_NAME DisplayName       $SERVICE_DISPLAY
& $NSSM_EXE set $SERVICE_NAME Description       $SERVICE_DESC
& $NSSM_EXE set $SERVICE_NAME Start             SERVICE_AUTO_START
& $NSSM_EXE set $SERVICE_NAME AppStdout         (Join-Path $INSTALL_DIR 'service-stdout.log')
& $NSSM_EXE set $SERVICE_NAME AppStderr         (Join-Path $INSTALL_DIR 'service-stderr.log')
& $NSSM_EXE set $SERVICE_NAME AppRotateFiles    1
& $NSSM_EXE set $SERVICE_NAME AppRotateOnline   1
& $NSSM_EXE set $SERVICE_NAME AppRotateBytes    10485760
& $NSSM_EXE set $SERVICE_NAME AppRestartDelay   3000
& $NSSM_EXE set $SERVICE_NAME AppThrottle       5000
& $NSSM_EXE set $SERVICE_NAME AppExit           Default Restart

# --- 5) Firewall + arrancar ---
Write-Output "`n[5/5] Firewall + arranque..."
$ruleName = "LabInformes port $PORT"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP `
    -LocalPort $PORT -Action Allow -Profile Domain,Private | Out-Null
  Write-Output "Regla firewall creada: $ruleName"
}

& $NSSM_EXE start $SERVICE_NAME
Start-Sleep -Seconds 4
Get-Service -Name $SERVICE_NAME | Format-Table Name, Status, DisplayName

# --- 6) Plan de energia: nunca suspender ---
Write-Output "`nConfigurando plan de energia (nunca suspender)..."
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
powercfg /change monitor-timeout-ac 20
Write-Output "Plan de energia: sistema nunca se suspende (monitor apaga a los 20 min)."

# --- 7) IP local ---
$ipInfo = Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp,Manual -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '169.*' -and $_.IPAddress -notlike '127.*' } |
  Select-Object IPAddress, InterfaceAlias, PrefixOrigin

Write-Output "`n==============================================="
Write-Output " Instalacion COMPLETA"
Write-Output "==============================================="
Write-Output " URL para otros usuarios de la LAN:"
foreach ($ip in $ipInfo) {
  Write-Output ("   http://" + $ip.IPAddress + ":$PORT/v2   (" + $ip.InterfaceAlias + ", " + $ip.PrefixOrigin + ")")
}
Write-Output ""
Write-Output " Comandos utiles:"
Write-Output "   Estado:    Get-Service $SERVICE_NAME"
Write-Output "   Reinicio:  Restart-Service $SERVICE_NAME"
Write-Output "   Logs:      Get-Content .\service-stdout.log -Tail 50"
Write-Output "   Desinstalar: .\uninstall-service.ps1"
Write-Output "==============================================="
