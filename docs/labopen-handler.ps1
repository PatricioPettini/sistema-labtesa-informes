# Handler externo para el protocolo labopen://
# Sin caracteres no-ASCII para evitar problemas de encoding.

param([Parameter(Mandatory=$true, Position=0)][string]$Url)

$log = Join-Path $env:TEMP 'labopen.log'
function Log($msg) {
  $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $log -Value "$ts $msg" -Encoding UTF8
}

try {
  Log "--- invocado ---"
  Log "URL recibida: $Url"

  $p = ($Url -replace '^labopen:(//)?', '') -replace '/', '\'
  Log "Tras replace / -> \: $p"
  $p = [uri]::UnescapeDataString($p)
  Log "Tras UnescapeDataString: $p"

  $p = $p.TrimEnd('\', ' ')
  Log "Path final: $p"

  if (Test-Path -Path $p -PathType Container) {
    Log "Es carpeta. Abriendo..."
    Start-Process explorer.exe -ArgumentList "`"$p`""
    Log "explorer.exe lanzado (carpeta)."
    return
  }
  if (Test-Path -Path $p -PathType Leaf) {
    Log "Es archivo. Abriendo con /select..."
    Start-Process explorer.exe -ArgumentList "/select,`"$p`""
    Log "explorer.exe lanzado (/select)."
    return
  }
  $parent = Split-Path -Path $p -Parent
  Log "Path no existe. Padre: $parent"
  if ($parent -and (Test-Path -Path $parent -PathType Container)) {
    Log "Padre existe. Abriendo carpeta padre..."
    Start-Process explorer.exe -ArgumentList "`"$parent`""
    Log "explorer.exe lanzado (padre)."
    return
  }
  Log "ERROR: ni el path ni el padre existen."
} catch {
  Log ("EXCEPCION: " + $_.Exception.Message)
}
