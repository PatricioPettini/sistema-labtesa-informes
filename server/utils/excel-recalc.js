// Recalcula un .xlsm/.xlsx usando Excel COM (Windows). Abre el archivo,
// fuerza recalcular todas las fórmulas, guarda, y cierra Excel.
// Al guardar, los `<v>` cacheados de cada celda quedan actualizados con el
// valor calculado — así el parser AS400 los lee directo.
//
// Requiere Windows + Microsoft Excel instalado. Si el spawn falla o Excel no
// está disponible, devuelve el buffer original sin tocar (fallback silencioso).
//
// Uso:
//   const { recalcularSiPosible } = require('./excel-recalc');
//   const bufNuevo = recalcularSiPosible(bufOriginal, 'M1.xlsm');

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

// Detecta si el entorno soporta Excel COM. Cacheado por proceso.
let _excelDisponible = null;
function excelDisponible() {
  if (_excelDisponible != null) return _excelDisponible;
  if (process.platform !== 'win32') { _excelDisponible = false; return false; }
  try {
    // Probamos crear un objeto COM Excel y cerrarlo. Timeout 8s para no colgar.
    const ps = `
      $ErrorActionPreference = 'Stop'
      try {
        $x = New-Object -ComObject Excel.Application
        $x.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($x) | Out-Null
        Write-Output 'OK'
      } catch { Write-Output 'NO' }
    `;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
      timeout: 8000, encoding: 'utf8',
    });
    _excelDisponible = (r.stdout || '').trim() === 'OK';
    if (_excelDisponible) console.log('[excel-recalc] Excel COM disponible');
    else console.warn('[excel-recalc] Excel COM NO disponible:', (r.stdout || '').trim(), (r.stderr || '').trim());
  } catch (e) {
    _excelDisponible = false;
    console.warn('[excel-recalc] error detectando Excel:', e.message);
  }
  return _excelDisponible;
}

// Recalcula VARIOS buffers en una sola sesión de Excel (mucho más rápido que
// abrir/cerrar Excel por cada archivo). `items` es un array de { buffer, name }.
// Devuelve el mismo array con los buffers reemplazados por los recalculados.
// Si Excel no está o falla, deja los buffers originales.
function recalcularVariosSiPosible(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  if (!excelDisponible()) return items;
  const tmpDir = os.tmpdir();
  const rnd = crypto.randomBytes(8).toString('hex');
  const tmpPaths = [];
  try {
    // Escribir todos los buffers a tempfiles.
    items.forEach((it, i) => {
      const ext = path.extname(it.name || 'in.xlsm').toLowerCase() || '.xlsm';
      const tmp = path.join(tmpDir, `lab-recalc-${rnd}-${i}${ext}`);
      fs.writeFileSync(tmp, it.buffer);
      tmpPaths.push(tmp);
    });
    // Un solo script PowerShell procesa todos los archivos secuencialmente en
    // la MISMA instancia de Excel — evita el overhead de startup por archivo
    // (~2s cada vez). Recalc simple + Save.
    const pathsArg = tmpPaths.map(p => `'${p.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`).join(',');
    const ps = `
$ErrorActionPreference = 'Stop'
$paths = @(${pathsArg})
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AutomationSecurity = 1
$excel.AskToUpdateLinks = $false
$excel.EnableEvents = $true
$excel.ScreenUpdating = $false
try {
  foreach ($p in $paths) {
    try {
      $wb = $excel.Workbooks.Open($p, 0, $false, [Type]::Missing, [Type]::Missing, [Type]::Missing, $true, [Type]::Missing, [Type]::Missing, $false, $false)
      # Ejecutar Workbook_Open explícitamente (macros que pueblan celdas al abrir).
      try { $excel.Run("'$($wb.Name)'!ThisWorkbook.Workbook_Open") } catch {}
      Start-Sleep -Milliseconds 300
      $excel.CalculateFullRebuild()
      $wb.Save()
      $wb.Close($false)
    } catch {
      Write-Output ("ERR:" + $p + ":" + $_.Exception.Message)
    }
  }
  Write-Output 'OK'
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
      timeout: Math.max(60_000, 30_000 * items.length), encoding: 'utf8',
    });
    const out = (r.stdout || '').trim();
    const finalLine = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop();
    if (finalLine !== 'OK') {
      console.warn(`[excel-recalc] batch falló: ${finalLine || (r.stderr || '').trim()}`);
      return items;
    }
    // Leer los buffers recalculados de vuelta.
    const out2 = items.map((it, i) => {
      try {
        const buf = fs.readFileSync(tmpPaths[i]);
        return { buffer: buf, name: it.name };
      } catch (e) {
        return it;
      }
    });
    console.log(`[excel-recalc] batch OK: ${items.length} archivos en una sola sesión de Excel`);
    return out2;
  } catch (e) {
    console.warn(`[excel-recalc] error batch:`, e.message);
    return items;
  } finally {
    // Limpiar tempfiles.
    tmpPaths.forEach(p => { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {} });
  }
}

// Recalcula un buffer .xlsm/.xlsx y devuelve el buffer resultante.
// Si Excel no está disponible o la operación falla, devuelve el original.
// (Wrapper de un solo archivo — internamente usa el batch para consistencia.)
function recalcularSiPosible(buffer, nombreArchivo) {
  if (!excelDisponible()) return buffer;
  const nombre = nombreArchivo || 'input.xlsm';
  const ext = path.extname(nombre).toLowerCase() || '.xlsm';
  const tmpDir = os.tmpdir();
  const rnd = crypto.randomBytes(8).toString('hex');
  const tmpIn  = path.join(tmpDir, `lab-recalc-${rnd}${ext}`);
  try {
    fs.writeFileSync(tmpIn, buffer);
    // Script PowerShell: abre el archivo, ejecuta macros Workbook_Open,
    // fuerza recálculo total, guarda, cierra.
    // - AutomationSecurity=1 (msoAutomationSecurityLow) HABILITA macros. Los
    //   xlsm de Cintolo usan macros para poblar INFORME!R87 (temperatura) y
    //   otras celdas al abrir el archivo. Sin macros, esos valores quedan
    //   vacíos y las fórmulas del sheet AS400 devuelven "".
    // - EnableEvents=$true permite que Workbook_Open corra.
    // - Runmacros: no llamamos macros específicas, pero al abrir con eventos
    //   activos, Workbook_Open se ejecuta automáticamente.
    // - DisplayAlerts=$false evita popups bloqueantes.
    // Script PowerShell: abre el archivo con macros habilitadas, corre
    // Workbook_Open explícitamente por si EnableEvents solo no basta,
    // recalcula, guarda. Log del valor de INFORME!R87 tras el proceso.
    const ps = `
$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AutomationSecurity = 1
$excel.AskToUpdateLinks = $false
$excel.EnableEvents = $true
try {
  $wb = $excel.Workbooks.Open('${tmpIn.replace(/\\/g, '\\\\').replace(/'/g, "''")}', 0, $false, [Type]::Missing, [Type]::Missing, [Type]::Missing, $true, [Type]::Missing, [Type]::Missing, $false, $false)
  try { $excel.Run("'$($wb.Name)'!ThisWorkbook.Workbook_Open") } catch {}
  Start-Sleep -Milliseconds 300
  $excel.CalculateFullRebuild()
  $wb.Save()
  $wb.Close($false)
  Write-Output 'OK'
} catch {
  Write-Output ('ERR:' + $_.Exception.Message)
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
`;
    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
      timeout: 60_000, encoding: 'utf8',
    });
    const out = (r.stdout || '').trim();
    // Log de las líneas de diagnóstico (DIAG:) que emite el script.
    out.split(/\r?\n/).forEach(line => {
      const t = line.trim();
      if (t.startsWith('DIAG:') || t.startsWith('DIAG-ERR:')) {
        console.log(`[excel-recalc/${nombre}] ${t}`);
      }
    });
    const finalLine = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).pop();
    if (finalLine !== 'OK') {
      console.warn(`[excel-recalc] fallo recalcular ${nombre}: ${finalLine || (r.stderr || '').trim()}`);
      return buffer;
    }
    const bufNuevo = fs.readFileSync(tmpIn);
    console.log(`[excel-recalc] ${nombre} recalculado (${(bufNuevo.length/1024).toFixed(1)} KB)`);
    return bufNuevo;
  } catch (e) {
    console.warn(`[excel-recalc] error procesando ${nombre}:`, e.message);
    return buffer;
  } finally {
    try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn); } catch {}
  }
}

module.exports = { excelDisponible, recalcularSiPosible, recalcularVariosSiPosible };
