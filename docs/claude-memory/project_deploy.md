---
name: project-deploy
description: Deploy 24/7 como servicio Windows en la PC de Patricio. Servicio LabInformes con NSSM. IP LAN 192.168.1.121:3000.
metadata: 
  node_type: memory
  type: project
  originSessionId: e940ca02-997d-400b-a157-f46e241f98c8
---

**Instalado el 2026-07-13.** El sistema corre 24/7 como servicio Windows en la PC de Patricio (host `ADMINISTRACION7`, IP LAN estática `192.168.1.121`).

## Servicio Windows

- **Nombre:** `LabInformes` (display: "Labtesa - Sistema de Informes")
- **Ejecutable:** NSSM wrappeando `node server/index.js`
- **NSSM binary:** `C:\Users\Patricio\Desktop\lab-informes\nssm\nssm.exe`
- **Directorio:** `C:\Users\Patricio\Desktop\lab-informes\`
- **StartType:** Automatic (arranca al bootear, sesión 0, no necesita login).
- **ObjectName:** `ADMINISTRACION7\Patricio` (NO LocalSystem). CRÍTICO — el servicio DEBE correr como Patricio porque los mapeos de red (G:) son por usuario. LocalSystem no ve G:.
- **Restart on crash:** sí (delay 3s, throttle 5s).
- **Logs:** `service-stdout.log` y `service-stderr.log` en la raíz del proyecto. Rotación automática a los 10 MB.

**Why (ObjectName):** cuando el servicio se instaló inicialmente corría como LocalSystem (default de NSSM). El buscador de carpetas del front devolvía "carpeta vacía" porque `fs.existsSync('G:\\...')` retornaba false — LocalSystem no tiene mapeos de red del usuario. Fix aplicado el 2026-07-13: `nssm set LabInformes ObjectName ADMINISTRACION7\Patricio <password>`. NSSM otorgó automáticamente el derecho "SeServiceLogonRight" al usuario.

**How to apply (si se rompe):** si cambia la password de Patricio, el servicio no arranca (error 1069 "logon failure"). Actualizar con: `nssm set LabInformes ObjectName ADMINISTRACION7\Patricio <nueva-password>` y `nssm restart LabInformes`. Script preparado en `_inspect/cambiar-cuenta-servicio.ps1` (pide password vía Read-Host seguro).

## Paths UNC en el .env (crítico)

El `.env` en `C:\Users\Patricio\Desktop\lab-informes\.env` tiene los paths con **UNC** (`\\192.168.1.200\Labtesa1\...`) en vez de letra `G:`. Esto es OBLIGATORIO para el servicio Windows.

**Why:** aunque el servicio corre como Patricio, corre en la sesión 0 (aislada) donde los mapeos de unidad de red del usuario no están disponibles. `fs.existsSync('G:\\...')` devuelve false y el endpoint `/api/generate/:nro_ot/detectar-carpeta` responde "carpeta no encontrada". Los UNC paths funcionan desde cualquier sesión — no dependen de mapeos.

**How to apply:** si el sistema empieza a decir "carpeta no encontrada" o "carpeta vacía" en el modal de guardado, verificar:
1. Que el `.env` local tenga los paths con `\\192.168.1.200\Labtesa1\...` (no `G:\...`)
2. Que el servicio corra como `ADMINISTRACION7\Patricio` (no LocalSystem)
3. Restart servicio con `Restart-Service LabInformes` (admin)

## Red

- **URL LAN:** http://192.168.1.121:3000/v2
- **Puerto:** 3000/TCP. Regla firewall "LabInformes port 3000" (inbound, Domain+Private).
- **IP local:** 192.168.1.121 configurada manualmente (estática). No cambia con DHCP.
- Interfaz vEthernet (Default Switch) 192.168.176.1 es de Hyper-V, ignorar.

## Plan de energía

Configurado con `powercfg` a "nunca suspender" (standby/hibernate = 0 en AC y DC; monitor 20 min).

## Comandos

- Estado: `Get-Service LabInformes`
- Restart: `Restart-Service LabInformes` (requiere admin)
- Logs: `Get-Content .\service-stdout.log -Tail 50`
- Desinstalar: `powershell -ExecutionPolicy Bypass -File .\uninstall-service.ps1` (admin)
- Reinstalar/actualizar: `install-service-local.ps1` (idempotente — detecta si existe).

## Dev workflow

Para hacer dev en la PC:
1. `Stop-Service LabInformes` (requiere admin) — libera puerto 3000
2. `npm run dev` o `node server/index.js` en Desktop
3. Cuando termines: `Start-Service LabInformes`

## Env vars introducidas (fallback dev = paths G:\)

- `DRIVE_INFORMES_ROOT` → `server/utils/guardar-en-drive.js`
- `AS400_CARPETA_SALIDA` → `server/utils/as400-generator.js`
- `AS400_CARPETA_SOL_BASE`, `AS400_PLANTILLA_XLSX`, `AS400_EXE_PATH_DEFAULT` → `server/routes/api.js`

En la PC de Patricio los defaults `G:\...` funcionan porque G: está mapeada. En un server real (192.168.1.200) hay que sobreescribir en `.env` con la letra local.

## Migración futura al server 192.168.1.200 (opcional)

Todo está preparado en `G:\METALMECANICA\lab-informes\` (código + DB + `.env` con placeholder D: + `install-service.ps1` para el server + `LEEME-INSTALACION.md`). Si se decide migrar:
1. RDP al 192.168.1.200
2. Averiguar letra local (D:? E:?)
3. Editar `.env` si no es D:
4. Correr `install-service.ps1` en el server
5. Desinstalar el servicio de la PC de Patricio (`uninstall-service.ps1`)
6. Reasignar la URL a los usuarios.

## Consideraciones

- **PC apagada = sistema caído.** No hay redundancia.
- **Windows Update reinicia** ocasionalmente (arranca solo tras el reboot).
- **Suspender/hibernar corta el servicio** — ya deshabilitado en power plan.

Relacionado: [[project-general]]
