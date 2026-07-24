# Instalador one-shot del protocolo labopen://
#
# Uso (una vez por PC cliente):
#   1. Descargar install-labopen.ps1 y labopen-handler.ps1 juntos.
#   2. Click derecho en install-labopen.ps1 → "Ejecutar con PowerShell".
#   3. Aceptar el UAC si aparece.
# Alternativa desde consola:
#   powershell -ExecutionPolicy Bypass -File install-labopen.ps1
#
# Qué hace:
#   1. Copia labopen-handler.ps1 a %LOCALAPPDATA%\LabInformes\
#   2. Registra el protocolo labopen: en HKCU (por usuario, sin admin).
#   3. Verifica que quede bien registrado.

$ErrorActionPreference = 'Stop'

Write-Host "── Instalador del handler labopen:// ──" -ForegroundColor Cyan
Write-Host ""

# 1. Determinar rutas
$srcDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcPs1 = Join-Path $srcDir 'labopen-handler.ps1'
if (-not (Test-Path $srcPs1)) {
    Write-Host "ERROR: no encuentro labopen-handler.ps1 al lado del instalador." -ForegroundColor Red
    Write-Host "Bajá ambos archivos y ponelos en la misma carpeta antes de correr esto." -ForegroundColor Yellow
    Read-Host "Enter para salir"; exit 1
}

$dstDir = Join-Path $env:LOCALAPPDATA 'LabInformes'
$dstPs1 = Join-Path $dstDir 'labopen-handler.ps1'

Write-Host "1. Copiando script a $dstPs1"
if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
Copy-Item -LiteralPath $srcPs1 -Destination $dstPs1 -Force
Write-Host "   ✓ OK"

# 2. Registrar el protocolo
Write-Host ""
Write-Host "2. Registrando protocolo labopen: en HKCU"
$hkcu = 'HKCU:\Software\Classes\labopen'
if (Test-Path $hkcu) { Remove-Item -Path $hkcu -Recurse -Force }
New-Item -Path $hkcu -Force | Out-Null
Set-ItemProperty -Path $hkcu -Name '(default)' -Value 'URL:Lab-Informes Abrir Carpeta'
Set-ItemProperty -Path $hkcu -Name 'URL Protocol' -Value ''
New-Item -Path (Join-Path $hkcu 'DefaultIcon') -Force | Out-Null
Set-ItemProperty -Path (Join-Path $hkcu 'DefaultIcon') -Name '(default)' -Value 'explorer.exe,1'
New-Item -Path (Join-Path $hkcu 'shell\open\command') -Force | Out-Null
# Comando final. La \"%1\" pasa la URL entera como argumento al script.
$command = "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dstPs1`" `"%1`""
Set-ItemProperty -Path (Join-Path $hkcu 'shell\open\command') -Name '(default)' -Value $command
Write-Host "   ✓ Comando registrado:"
Write-Host "     $command" -ForegroundColor DarkGray

# 3. Verificar
Write-Host ""
Write-Host "3. Verificando registro"
$check = (Get-ItemProperty -Path (Join-Path $hkcu 'shell\open\command') -Name '(default)').'(default)'
if ($check -match [regex]::Escape($dstPs1)) {
    Write-Host "   ✓ Handler registrado correctamente" -ForegroundColor Green
} else {
    Write-Host "   ✗ Algo salió mal — revisar HKCU:\Software\Classes\labopen" -ForegroundColor Red
}

Write-Host ""
Write-Host "── Instalación completa ──" -ForegroundColor Green
Write-Host "Ahora podés:"
Write-Host "  • Volver al sistema Lab-Informes en el navegador"
Write-Host "  • Marcar el toggle 'Handler instalado ✓' en Auditoría"
Write-Host "  • Click en 'Abrir carpeta' de cualquier informe"
Write-Host "  • Aceptar el prompt de Chrome 'Open Windows PowerShell' → se abre Explorer directo"
Write-Host ""
Write-Host "Log de debug (cada apertura queda registrada):"
Write-Host ("  " + $env:TEMP + "\labopen.log")

Write-Host ""
Read-Host "Enter para cerrar"
