# Setea la policy AutoLaunchProtocolsFromOrigins de Chrome/Edge para que el
# protocolo labopen:// se ejecute SIN prompt cuando venga del sistema
# Lab-Informes.
#
# Requiere permisos de administrador (HKLM).
# Uso:
#   powershell -ExecutionPolicy Bypass -File set-chrome-policy.ps1

$ErrorActionPreference = 'Stop'

$json = '[{"protocol":"labopen","allowed_origins":["http://192.168.1.121:3000","http://192.168.1.200:3000","http://localhost:3000"]}]'

$paths = @(
  'HKLM:\SOFTWARE\Policies\Google\Chrome',
  'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
)

foreach ($p in $paths) {
  Write-Host "Configurando: $p"
  try {
    if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
    Set-ItemProperty -Path $p -Name 'AutoLaunchProtocolsFromOrigins' -Value $json -Type String
    Write-Host ("  OK  " + $json.Substring(0, [Math]::Min(80, $json.Length)))
  } catch {
    Write-Host ("  ERROR: " + $_.Exception.Message) -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Policy configurada. Cerrá TODAS las ventanas de Chrome/Edge y volvé a abrirlas"
Write-Host "(o corré 'gpupdate /force' desde una consola admin)."
