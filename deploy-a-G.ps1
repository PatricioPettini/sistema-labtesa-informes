# ==========================================================================
# Deploy incremental: Desktop de Patricio  ->  G:\METALMECANICA\lab-informes
#
# Sincroniza el código (NO la DB, NO node_modules, NO basura) y reinicia el
# servicio "LabInformes" en el servidor 192.168.1.200.
# ==========================================================================

$ErrorActionPreference = 'Stop'

$src         = 'C:\Users\Patricio\Desktop\lab-informes'
$dst         = 'G:\METALMECANICA\lab-informes'
$serverHost  = '192.168.1.200'
$serviceName = 'LabInformes'

$excludeDirs = @(
  'node_modules', '_inspect', 'backups', '.claude', '.git',
  'vickers_inspect', 'brinell_inspect'
)
$excludeFiles = @(
  'lab-informes.db', 'lab-informes.db-wal', 'lab-informes.db-shm', 'data.db',
  'diag.json', 'mouseerr.txt', 'mouseout.txt', 'piperr.txt', 'pipout.txt',
  'pyerr*.txt', 'pyout*.txt', '*.bak', '*.bak2', '*.bak_*', '~$*',
  'SUPERPROMPT*.md', 'PROMPT-CLAUDE*.md', 'PROMPT-CONTINUACION.md',
  '_*.js', '_*.py', '_*.docx', 'buscar_*.py', 'check-*.js',
  'completar_*.py', 'extract*.js', 'extract*.txt', 'extraer_*.py',
  'organizar_*.py', '_convertir_*.py', '_fix_*.py', '_test*.docx',
  '.env',                          # el .env de prod NO se sobrescribe
  'service-stdout.log', 'service-stderr.log'  # logs del servicio remoto
)

Write-Output "=== 1. Rebuild bundle local ==="
Push-Location $src
try {
  & node build-frontend.js --prod
  if ($LASTEXITCODE -ne 0) { throw "Rebuild fallo" }
} finally { Pop-Location }

Write-Output "`n=== 2. Sync codigo (robocopy) ==="
robocopy $src $dst /E /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NP /R:1 /W:1 | Out-Null
$rcExit = $LASTEXITCODE
Write-Output ("Robocopy exit: " + $rcExit + " (0-7 = OK, 8+ = error)")
if ($rcExit -ge 8) { Write-Error "Robocopy fallo" }

Write-Output "`n=== 3. Reiniciar servicio remoto ==="
try {
  $svc = Get-Service -Name $serviceName -ComputerName $serverHost -ErrorAction Stop
  Restart-Service -InputObject $svc -Force -ErrorAction Stop
  Start-Sleep -Seconds 3
  $st = (Get-Service -Name $serviceName -ComputerName $serverHost).Status
  Write-Output ("Servicio $serviceName en $serverHost -> " + $st)
} catch {
  Write-Warning ("No pude reiniciar el servicio remotamente: " + $_.Exception.Message)
  Write-Warning "Reinicialo por RDP: Restart-Service $serviceName"
}

Write-Output "`n=== 4. Probar ==="
try {
  $r = Invoke-WebRequest -Uri ("http://" + $serverHost + ":3000/v2") -UseBasicParsing -TimeoutSec 10
  Write-Output ("HTTP " + $r.StatusCode + " OK - deploy completo")
} catch {
  Write-Warning ("El servidor no respondio: " + $_.Exception.Message)
}
