// Backup automático de la DB SQLite.
//
// Estrategia:
//   1. Snapshot atómico con `VACUUM INTO` (consistente con WAL, no bloquea).
//   2. Verificación de integridad del snapshot antes de aceptarlo.
//   3. Copia off-site al share de red (\\192.168.1.200\Labtesa1) si está configurado.
//   4. Retención escalonada: N diarios + N semanales + N mensuales.
//   5. Correr una vez al día (arranca 5s post-boot + cada 24hs).
//
// Env vars (opcionales, todas tienen defaults):
//   DB_PATH                 = ./lab-informes.db
//   BACKUP_DIR              = ./backups
//   BACKUP_DIR_REMOTO       = (vacío) — si no se define, no hay off-site
//   BACKUP_RETEN_DIARIOS    = 30
//   BACKUP_RETEN_SEMANALES  = 12
//   BACKUP_RETEN_MENSUALES  = 24

'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

const DB_PATH    = process.env.DB_PATH   || path.join(__dirname, '../../lab-informes.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups');

// Off-site (share de red). Ejemplo por default: el mismo share donde vive
// el resto de datos del laboratorio.
const BACKUP_DIR_REMOTO = process.env.BACKUP_DIR_REMOTO
  || '\\\\192.168.1.200\\Labtesa1\\ADMINISTRACION\\_BACKUPS_LAB_INFORMES';

// Retención escalonada. Diarios/semanales/mensuales.
const RETEN_DIARIOS   = parseInt(process.env.BACKUP_RETEN_DIARIOS   || '30', 10);
const RETEN_SEMANALES = parseInt(process.env.BACKUP_RETEN_SEMANALES || '12', 10);
const RETEN_MENSUALES = parseInt(process.env.BACKUP_RETEN_MENSUALES || '24', 10);

const INTERVALO_MS = 24 * 60 * 60 * 1000;

const MS_DIA    = 24 * 60 * 60 * 1000;
const MS_SEMANA = 7  * MS_DIA;
const MS_MES    = 30 * MS_DIA; // aproximado

function fechaSlug(d) {
  d = d || new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Parseo del timestamp desde el nombre del archivo. Formato:
// "lab-informes_YYYY-MM-DD_HHMM.db" → Date object. Null si no matchea.
function fechaDeNombre(name) {
  const m = name.match(/^lab-informes_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.db$/);
  if (!m) return null;
  return new Date(
    parseInt(m[1], 10),
    parseInt(m[2], 10) - 1,
    parseInt(m[3], 10),
    parseInt(m[4], 10),
    parseInt(m[5], 10),
  );
}

// Snapshot atómico con VACUUM INTO. Devuelve la ruta local del archivo.
// Verifica integridad después de crearlo (abre el snapshot y corre PRAGMA
// integrity_check). Si falla → tira error para que el ciclo lo capture.
function crearBackup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const destino = path.join(BACKUP_DIR, `lab-informes_${fechaSlug()}.db`);
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  const sizeMb = (fs.statSync(destino).size / 1024 / 1024).toFixed(1);
  console.log(`[backup] snapshot creado (${sizeMb} MB) → ${destino}`);

  // Verificación de integridad: abrir el snapshot como read-only y correr
  // PRAGMA integrity_check. Si algo salió mal en el VACUUM INTO, borrar el
  // archivo corrupto y throwear.
  try {
    const Database = require('better-sqlite3');
    const check = new Database(destino, { readonly: true });
    const rows = check.prepare('PRAGMA integrity_check').all();
    check.close();
    if (rows.length !== 1 || rows[0].integrity_check !== 'ok') {
      fs.unlinkSync(destino);
      throw new Error('integrity_check falló: ' + JSON.stringify(rows).slice(0, 200));
    }
    console.log('[backup] integrity_check OK');
  } catch (e) {
    console.error('[backup] verificación falló:', e.message);
    throw e;
  }

  return destino;
}

// Copia el snapshot al share off-site si está configurado y accesible.
// No es fatal si falla — el backup local queda igual.
function copiarOffsite(rutaLocal) {
  if (!BACKUP_DIR_REMOTO) return;
  try {
    if (!fs.existsSync(BACKUP_DIR_REMOTO)) {
      fs.mkdirSync(BACKUP_DIR_REMOTO, { recursive: true });
    }
    const destino = path.join(BACKUP_DIR_REMOTO, path.basename(rutaLocal));
    fs.copyFileSync(rutaLocal, destino);
    const sizeMb = (fs.statSync(destino).size / 1024 / 1024).toFixed(1);
    console.log(`[backup] off-site OK (${sizeMb} MB) → ${destino}`);
  } catch (e) {
    console.warn('[backup] off-site FALLÓ (revisar red / permisos):', e.message);
  }
}

// Retención escalonada:
//   Diarios     → últimos RETEN_DIARIOS días (se mantienen todos).
//   Semanales   → 1 backup por semana × RETEN_SEMANALES semanas anteriores.
//   Mensuales   → 1 backup por mes × RETEN_MENSUALES meses anteriores.
// Todo lo que no cae en ningún bucket se borra.
function clasificarPorBuckets(archivos) {
  const ahora = Date.now();
  const conservar = new Set();

  // Sort desc por fecha (el más reciente primero).
  const items = archivos
    .map(name => ({ name, fecha: fechaDeNombre(name) }))
    .filter(x => x.fecha)
    .sort((a, b) => b.fecha - a.fecha);

  // 1. Diarios: uno por día dentro de la ventana de N días recientes.
  //    Antes conservaba TODOS los backups del día (varios por reinicio del
  //    server), lo que hacía crecer la carpeta a decenas de GB. Ahora se
  //    dedupea por YYYY-MM-DD (el más reciente de cada día gana).
  const inicioDiarios = ahora - RETEN_DIARIOS * MS_DIA;
  const yaVistoDia = new Set();
  for (const it of items) {
    if (it.fecha.getTime() < inicioDiarios) break;
    const dia = it.fecha.getFullYear() + '-' +
                String(it.fecha.getMonth() + 1).padStart(2, '0') + '-' +
                String(it.fecha.getDate()).padStart(2, '0');
    if (yaVistoDia.has(dia)) continue;
    yaVistoDia.add(dia);
    conservar.add(it.name);
  }

  // 2. Semanales: 1 por semana (el más reciente de cada) para las próximas N semanas
  //    hacia atrás desde la ventana diaria.
  const yaVistoSemana = new Set();
  for (const it of items) {
    if (conservar.has(it.name)) continue;
    // Etiqueta ISO semana: YYYY-W##
    const d = it.fecha;
    const inicio = new Date(d.getFullYear(), 0, 1);
    const semana = Math.ceil((((d - inicio) / MS_DIA) + inicio.getDay() + 1) / 7);
    const key = d.getFullYear() + '-W' + String(semana).padStart(2, '0');
    if (yaVistoSemana.has(key)) continue;
    if (yaVistoSemana.size >= RETEN_SEMANALES) break;
    yaVistoSemana.add(key);
    conservar.add(it.name);
  }

  // 3. Mensuales: 1 por mes.
  const yaVistoMes = new Set();
  for (const it of items) {
    if (conservar.has(it.name)) continue;
    const key = it.fecha.getFullYear() + '-' + String(it.fecha.getMonth() + 1).padStart(2, '0');
    if (yaVistoMes.has(key)) continue;
    if (yaVistoMes.size >= RETEN_MENSUALES) break;
    yaVistoMes.add(key);
    conservar.add(it.name);
  }

  return {
    conservar,
    borrar: items.filter(it => !conservar.has(it.name)).map(it => it.name),
  };
}

function limpiarViejos(dir) {
  if (!fs.existsSync(dir)) return;
  const archivos = fs.readdirSync(dir).filter(n => /^lab-informes_.*\.db$/.test(n));
  const { conservar, borrar } = clasificarPorBuckets(archivos);
  for (const name of borrar) {
    try { fs.unlinkSync(path.join(dir, name)); } catch {}
  }
  if (borrar.length > 0) {
    console.log(`[backup] retención (${dir}): conservados ${conservar.size} · borrados ${borrar.length}`);
  }
}

// Ventana mínima entre snapshots. Si ya hay un backup de hace < X ms, se
// saltea. Evita que N reinicios seguidos del server generen N snapshots del
// mismo día (con la DB pesando ~500MB → GB en minutos).
const MIN_INTERVALO_ENTRE_SNAPSHOTS_MS = 12 * 60 * 60 * 1000; // 12hs

function ultimoSnapshotEdadMs() {
  if (!fs.existsSync(BACKUP_DIR)) return Infinity;
  try {
    const archivos = fs.readdirSync(BACKUP_DIR)
      .map(name => ({ name, fecha: fechaDeNombre(name) }))
      .filter(x => x.fecha)
      .sort((a, b) => b.fecha - a.fecha);
    if (archivos.length === 0) return Infinity;
    return Date.now() - archivos[0].fecha.getTime();
  } catch { return Infinity; }
}

function correrCiclo() {
  try {
    // Siempre limpiamos primero (aunque no vayamos a crear uno nuevo). Así al
    // arrancar el server con 200 backups viejos se dedupean de una.
    limpiarViejos(BACKUP_DIR);
    if (BACKUP_DIR_REMOTO && fs.existsSync(BACKUP_DIR_REMOTO)) {
      limpiarViejos(BACKUP_DIR_REMOTO);
    }
    // Skip si ya hay un backup reciente. Evita duplicar el snapshot al reiniciar.
    const edad = ultimoSnapshotEdadMs();
    if (edad < MIN_INTERVALO_ENTRE_SNAPSHOTS_MS) {
      const horas = (edad / 3600000).toFixed(1);
      console.log('[backup] saltear ciclo — ya existe un snapshot de hace ' + horas + 'h');
      return;
    }
    const local = crearBackup();
    copiarOffsite(local);
    // Limpieza post-creación (por si el nuevo snapshot desplazó a otro del día).
    limpiarViejos(BACKUP_DIR);
    if (BACKUP_DIR_REMOTO && fs.existsSync(BACKUP_DIR_REMOTO)) {
      limpiarViejos(BACKUP_DIR_REMOTO);
    }
  } catch (e) {
    console.error('[backup] error en ciclo:', e.message);
  }
}

function iniciarBackupsAutomaticos() {
  setTimeout(correrCiclo, 5000);
  setInterval(correrCiclo, INTERVALO_MS);
}

module.exports = {
  crearBackup,
  copiarOffsite,
  limpiarViejos,
  clasificarPorBuckets,
  iniciarBackupsAutomaticos,
  BACKUP_DIR,
  BACKUP_DIR_REMOTO,
};
