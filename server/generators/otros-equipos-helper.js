'use strict';
// Formatea el array datos.otros_equipos [{nombre, tag}] a las líneas que se
// agregan al bloque "EQUIPAMIENTO UTILIZADO" del Word. Cada elemento pasa a:
//   - "nombre TAG N°xxx"  si hay tag
//   - "nombre"            si no hay tag
// Devuelve array de strings vacío si no hay equipos válidos.

function formatearOtrosEquipos(datos) {
  const arr = datos && Array.isArray(datos.otros_equipos) ? datos.otros_equipos : [];
  const lineas = [];
  for (const it of arr) {
    if (!it) continue;
    const nombre = String(it.nombre || '').trim();
    const tag    = String(it.tag || '').trim();
    if (!nombre && !tag) continue;
    if (nombre && tag)   lineas.push(`${nombre} TAG N°${tag}`);
    else if (nombre)     lineas.push(nombre);
    else                 lineas.push(`TAG N°${tag}`);
  }
  return lineas;
}

module.exports = { formatearOtrosEquipos };
