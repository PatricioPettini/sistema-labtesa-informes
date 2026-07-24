# ==========================================================================
# Registra una tarea programada de Windows que corre sync-db-a-drive.ps1
# todos los días a las 06:00. Correr UNA VEZ como usuario normal (no requiere
# admin — la tarea corre en tu cuenta).
# ==========================================================================

$ErrorActionPreference = 'Stop'

$TASK_NAME  = 'LabInformes-SyncDBaDrive'
$SCRIPT     = 'C:\Users\Patricio\Desktop\lab-informes\sync-db-a-drive.ps1'
$HORA       = '06:00'

if (-not (Test-Path $SCRIPT)) { throw "No se encuentra $SCRIPT" }

$Action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$SCRIPT`""
$Trigger = New-ScheduledTaskTrigger -Daily -At $HORA
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TASK_NAME `
  -Action $Action -Trigger $Trigger -Settings $Settings `
  -Description 'Sube el ultimo backup .db al Google Drive compartido (labdrive)' `
  -Force

Write-Output ""
Write-Output "Tarea '$TASK_NAME' registrada. Corre todos los dias a las $HORA."
Write-Output "Podes verla en Task Scheduler o correrla ahora con:"
Write-Output "  Start-ScheduledTask -TaskName $TASK_NAME"
Write-Output ""
Get-ScheduledTask -TaskName $TASK_NAME | Format-Table TaskName, State, `
  @{n='NextRun';e={(Get-ScheduledTaskInfo $_).NextRunTime}}
