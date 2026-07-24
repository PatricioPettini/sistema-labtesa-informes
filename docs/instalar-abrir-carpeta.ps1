# =============================================================================
#  Lab-Informes — instalador del boton "Abrir carpeta"
#
#  Corre una sola vez por PC cliente. Configura todo lo necesario para que
#  al clickear "Abrir carpeta" en el sistema, Windows Explorer se abra
#  directo en la carpeta del informe, sin prompts.
#
#  Pasos:
#    1. Descarga el handler PowerShell a %LOCALAPPDATA%\LabInformes\
#    2. Registra el protocolo labopen:// en HKCU
#    3. Configura la policy de Chrome/Edge para no preguntar (requiere admin)
#
#  Uso:
#    Click derecho -> "Ejecutar con PowerShell"
#    (o: powershell -ExecutionPolicy Bypass -File instalar-abrir-carpeta.ps1)
# =============================================================================

$ErrorActionPreference = 'Stop'

Write-Host "==================================================================="
Write-Host " Lab-Informes  -  Instalador 'Abrir carpeta'"
Write-Host "==================================================================="
Write-Host ""

# --- 1. Escribir el handler PowerShell en LOCALAPPDATA -----------------------

$dstDir = Join-Path $env:LOCALAPPDATA 'LabInformes'
$dstPs1 = Join-Path $dstDir 'labopen-handler.ps1'

if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

$handlerScript = @'
param([Parameter(Mandatory=$true, Position=0)][string]$Url)
$log = Join-Path $env:TEMP 'labopen.log'
function Log($msg) { Add-Content -LiteralPath $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $msg) -Encoding UTF8 }
try {
  Log "--- invocado ---"
  Log "URL recibida: $Url"
  $p = ($Url -replace '^labopen:(//)?', '') -replace '/', '\'
  $p = [uri]::UnescapeDataString($p)
  $p = $p.TrimEnd('\', ' ')
  Log "Path final: $p"
  if (Test-Path -Path $p -PathType Container) {
    Start-Process explorer.exe -ArgumentList "`"$p`""
    Log "carpeta lanzada"
    return
  }
  if (Test-Path -Path $p -PathType Leaf) {
    Start-Process explorer.exe -ArgumentList "/select,`"$p`""
    Log "archivo lanzado con /select"
    return
  }
  $parent = Split-Path -Path $p -Parent
  if ($parent -and (Test-Path -Path $parent -PathType Container)) {
    Start-Process explorer.exe -ArgumentList "`"$parent`""
    Log "padre lanzado"
    return
  }
  Log "ERROR: nada existe"
} catch {
  Log ("EXCEPCION: " + $_.Exception.Message)
}
'@

Set-Content -LiteralPath $dstPs1 -Value $handlerScript -Encoding UTF8
Write-Host "[1/3] Handler PowerShell instalado en:" -ForegroundColor Green
Write-Host "      $dstPs1"
Write-Host ""

# --- 2. Registrar el protocolo labopen:// en HKCU ----------------------------

$hkcu = 'HKCU:\Software\Classes\labopen'
if (Test-Path $hkcu) { Remove-Item -Path $hkcu -Recurse -Force }
New-Item -Path $hkcu -Force | Out-Null
Set-ItemProperty -Path $hkcu -Name '(default)' -Value 'URL:Lab-Informes Abrir Carpeta'
Set-ItemProperty -Path $hkcu -Name 'URL Protocol' -Value ''
New-Item -Path (Join-Path $hkcu 'DefaultIcon') -Force | Out-Null
Set-ItemProperty -Path (Join-Path $hkcu 'DefaultIcon') -Name '(default)' -Value 'explorer.exe,1'
New-Item -Path (Join-Path $hkcu 'shell\open\command') -Force | Out-Null
$cmd = 'powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $dstPs1 + '" "%1"'
Set-ItemProperty -Path (Join-Path $hkcu 'shell\open\command') -Name '(default)' -Value $cmd
Write-Host "[2/3] Protocolo labopen:// registrado en el usuario actual" -ForegroundColor Green
Write-Host ""

# --- 3. Configurar policy de Chrome/Edge (requiere admin) --------------------

$policyJson = '[{"protocol":"labopen","allowed_origins":["http://192.168.1.121:3000","http://192.168.1.200:3000","http://localhost:3000"]}]'

function EsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $pr = New-Object Security.Principal.WindowsPrincipal($id)
  return $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (EsAdmin) {
  foreach ($p in @('HKLM:\SOFTWARE\Policies\Google\Chrome', 'HKLM:\SOFTWARE\Policies\Microsoft\Edge')) {
    try {
      if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
      Set-ItemProperty -Path $p -Name 'AutoLaunchProtocolsFromOrigins' -Value $policyJson -Type String
    } catch {
      Write-Host ("      WARN " + $p + ': ' + $_.Exception.Message) -ForegroundColor Yellow
    }
  }
  Write-Host "[3/3] Policy Chrome/Edge configurada (no mas prompt)" -ForegroundColor Green
} else {
  Write-Host "[3/3] Sin admin -> relanzando con UAC para configurar policy..." -ForegroundColor Yellow
  $args = @('-NoProfile','-ExecutionPolicy','Bypass','-Command',
    "foreach (`$p in @('HKLM:\SOFTWARE\Policies\Google\Chrome','HKLM:\SOFTWARE\Policies\Microsoft\Edge')) { if (-not (Test-Path `$p)) { New-Item -Path `$p -Force | Out-Null }; Set-ItemProperty -Path `$p -Name 'AutoLaunchProtocolsFromOrigins' -Value '$policyJson' -Type String }; Write-Host 'OK'; Start-Sleep 2")
  try {
    Start-Process powershell -Verb RunAs -ArgumentList $args -Wait
    Write-Host "      Policy configurada via UAC" -ForegroundColor Green
  } catch {
    Write-Host "      Fallo la elevacion UAC. La policy no se configuro." -ForegroundColor Red
    Write-Host "      El handler funciona igual, pero Chrome/Edge va a preguntar cada vez."
  }
}

Write-Host ""
Write-Host "==================================================================="
Write-Host " Instalacion completa" -ForegroundColor Green
Write-Host "==================================================================="
Write-Host ""
Write-Host "IMPORTANTE: cerra TODAS las ventanas de Chrome/Edge y volve a abrirlas"
Write-Host "para que las policies tengan efecto."
Write-Host ""
Write-Host "Verificar en el browser:"
Write-Host "  Chrome: chrome://policy/  -> AutoLaunchProtocolsFromOrigins"
Write-Host "  Edge:    edge://policy/    -> AutoLaunchProtocolsFromOrigins"
Write-Host ""
Write-Host "Log de debug (cada apertura de carpeta queda registrada):"
Write-Host ("  " + $env:TEMP + '\labopen.log')
Write-Host ""

Read-Host "Enter para cerrar"
