// Seed autoritativo del catálogo global de equipos.
// Fuente: consolidación de todos los TAGs hardcoded en los `*form.jsx` y
// `template-*.js` del sistema al 2026-07.
//
// Estrategia idempotente:
//   - Cada TAG (ID) es único en la DB.
//   - Al ejecutar el seed, si el TAG ya existe, se UNE la lista de ensayos
//     con la del seed (no se pierde nada cargado manualmente).
//   - Vencimientos y certificados cargados manualmente no se tocan.

const db = require('../db');

// Formato: [id (TAG único), nombre_corto, nombre_completo, sede, ensayos]
// Los ensayos son los tipos donde el equipo aparece marcado en el preinforme.
const SEED = [
  // ── IMPACTO ──────────────────────────────────────────────────────────
  ['MM-409', 'Galdabini',              'Máquina de impacto Galdabini',                     'caba',    ['impacto']],
  ['MM-010', 'Péndulo Wolpert',        'Péndulo de impacto Wolpert 300J (220001/2031)',    'neuquen', ['impacto']],
  ['MM-021', 'Controlador T°',         'Controlador de temperatura digital',               'caba',    ['impacto']],
  ['MM-315', 'Controlador T°',         'Controlador de temperatura digital',               'neuquen', ['impacto']],
  ['EE-537', 'Baño termostático',      'Baño termostático',                                'caba',    ['impacto']],
  ['EE-761', 'Ultra freezer',          'Ultra freezer',                                    'caba',    ['impacto']],
  ['POL-479','Ultra freezer',          'Ultra freezer',                                    'neuquen', ['impacto']],
  ['MM-773', 'Galgas patrón',          'Galgas patrón',                                    'caba',    ['impacto']],

  // ── TRACCIÓN ─────────────────────────────────────────────────────────
  ['MM-203', 'Emic',                   'Máquina de tracción-compresión Emic',              'caba',    ['traccion','plegado','nick-break','varios']],
  ['MM-151', 'Shimadzu tracción',      'Máquina de tracción Shimadzu',                     'neuquen', ['traccion','plegado','dureza-brinell']],
  ['MM-362', 'Extensómetro',           'Extensómetro',                                     'caba',    ['traccion']],
  ['MM-782', 'Trazado',                'Dispositivo de trazado',                           'caba',    ['traccion']],
  ['MM-781', 'Nivel angular',          'Nivel angular magnético',                          'caba',    ['traccion']],
  ['MM-441', 'Regla metálica',         'Regla metálica',                                   'caba',    ['traccion']],

  // ── PLEGADO ──────────────────────────────────────────────────────────
  ['MM-413', 'Torne y Mec',            'Prensa Plegadora Torne y Mec',                     'neuquen', ['plegado','nick-break']],
  ['MM-913', 'Torne y Mec',            'Prensa Plegadora Torne y Mec',                     'caba',    ['plegado']],

  // ── NICK BREAK ───────────────────────────────────────────────────────
  ['MM-100', 'Prensa hidráulica',      'Prensa hidráulica',                                'caba',    ['nick-break']],

  // ── DUREZA BRINELL ───────────────────────────────────────────────────
  ['MM-170', 'Petri (Brinell)',        'Durómetro Petri (Brinell)',                        'caba',    ['dureza-brinell']],
  ['MM-101', 'Durómetro portátil',     'Durómetro portátil',                               'neuquen', ['dureza-brinell']],
  ['MM-173', 'Microscopio medición',   'Microscopio de medición',                          'caba',    ['dureza-brinell']],
  ['PMM-716','Patrón Brinell',         'Patrón Brinell',                                   'caba',    ['dureza-brinell']],

  // ── DUREZA ROCKWELL ──────────────────────────────────────────────────
  ['MM-012', 'Petri (Rockwell)',       'Durómetro Petri',                                  'caba',    ['dureza-rockwell']],
  ['MM-172', 'Patrón Rockwell',        'Patrón Rockwell',                                  'caba',    ['dureza-rockwell']],

  // ── DUREZA VICKERS ───────────────────────────────────────────────────
  ['MM-405', 'Buehler VH 1150',        'Microdurómetro Buehler Wilson VH 1150',            'caba',    ['dureza-vickers']],
  ['MM-13',  'Zwick',                  'Microdurómetro Zwick',                             'caba',    ['dureza-vickers']],
  ['MM-179', 'Micrómetro Mitutoyo',    'Micrómetro Mitutoyo',                              'caba',    ['dureza-vickers']],
  ['MM-703', 'Calibre Mitutoyo',       'Calibre digital Mitutoyo',                         'caba',    ['dureza-vickers','macrografia']],
  ['CAL-570','Calibre Mitutoyo',       'Calibre digital Mitutoyo',                         'caba',    ['dureza-vickers','dureza-brinell']],

  // ── QUÍMICOS ─────────────────────────────────────────────────────────
  ['MM-361', 'Spectrotest',            'Espectrómetro Spectrotest',                        'caba',    ['quimicos']],
  ['MM-463', 'Spectrotest',            'Espectrómetro Spectrotest',                        'neuquen', ['quimicos']],
  ['MM-164', 'Spectromax',             'Espectrómetro Spectromax',                         'caba',    ['quimicos']],
  ['MM-478', 'Abs Atómica Shimadzu',   'Absorción Atómica Shimadzu',                       'caba',    ['quimicos']],
  ['MM-346', 'Rayos X Oxford',         'Espectrómetro de fluorescencia Rayos X Oxford',    'caba',    ['quimicos']],
  ['MM-102', 'Eltra C/S',              'Determinador Carbono y Azufre Eltra',              'caba',    ['quimicos']],
  ['QB-371', 'ICP-OES',                'Espectrómetro ICP-OES',                            'caba',    ['quimicos']],

  // ── FERRITA DELTA ────────────────────────────────────────────────────
  ['MM-167', 'Ferridelítimetro',       'Ferridelítimetro Fischer',                         'caba',    ['ferrita-delta']],
  ['PMM-671','Patrones Fischer',       'Set de patrones Fischer',                          'caba',    ['ferrita-delta']],

  // ── MICROSCOPÍA (metalográficos, macrografía, ferrita-delta) ─────────
  ['MM-378', 'Leica DM 750',           'Microscopio Leica DM 750',                         'caba',
    ['ferrita-delta','macrografia','metalografia-general','anexo-metalografico',
     'microestructura','tamano-grano','inclusiones','estructura-grafito']],
  ['MM-016', 'Olympus',                'Microscopio Olympus',                              'caba',    ['metalografia-general','anexo-metalografico']],

  // ── VARIOS ───────────────────────────────────────────────────────────
  ['MM-003', 'Balanza Shimadzu',       'Balanza analítica Shimadzu',                       'caba',    ['varios']],
  ['MM-020', 'Mufla',                  'Mufla eléctrica',                                  'caba',    ['varios']],
  ['MM-130', 'Rigidez dieléctrica',    'Equipo de rigidez dieléctrica',                    'caba',    ['varios']],
  ['MM-514', 'Lupa Olympus',           'Lupa estereoscópica Olympus',                      'caba',    ['varios']],

  // ── RUGOSIDAD ────────────────────────────────────────────────────────
  ['MM-628', 'Rugosímetro Mitutoyo',   'Rugosímetro Mitutoyo SJ 410',                      'caba',    ['rugosidad']],
  ['PMM-630','Patrón rugosidad',       'Patrón de referencia Mitutoyo',                    'caba',    ['rugosidad']],

  // ── TRATAMIENTOS TÉRMICOS ────────────────────────────────────────────
  ['MM-500', 'Horno eléctrico',        'Horno eléctrico con microcontrolador',             'caba',    ['tratamientos-termicos']],
  ['MM-501', 'Registrador T°',         'Registrador de temperatura',                       'caba',    ['tratamientos-termicos']],

  // ── TRANSVERSALES — Calibres y termohigrómetros que se usan en MUCHOS
  //     ensayos. Un solo registro con la lista completa. ─────────────────
  ['MM-571', 'Calibre digital',        'Calibre digital Mitutoyo',                         'caba',
    ['impacto','traccion','plegado','nick-break','varios','dureza-brinell','dureza-rockwell']],
  ['MM-694', 'Calibre digital',        'Calibre digital',                                  'neuquen',
    ['impacto','traccion','plegado','nick-break','dureza-brinell','dureza-rockwell','dureza-vickers']],
  ['MM-165', 'Proyector perfiles',     'Proyector de perfiles',                            'caba',
    ['impacto','traccion','dureza-brinell']],

  ['PCAL-545','Termohigrómetro',       'Termohigrómetro',                                  'caba',
    ['traccion','impacto','plegado','nick-break','varios','dureza-brinell','dureza-rockwell','dureza-vickers','macrografia','metalografia-general','anexo-metalografico']],
  ['MM-700', 'Termohigrómetro',        'Termohigrómetro',                                  'caba',
    ['macrografia','metalografia-general','anexo-metalografico','microestructura','tamano-grano','inclusiones','ferrita-delta']],
  ['MM-701', 'Termohigrómetro',        'Termohigrómetro',                                  'caba',
    ['dureza-rockwell','dureza-brinell','quimicos']],
  ['MM-702', 'Termohigrómetro',        'Termohigrómetro',                                  'caba',
    ['dureza-rockwell','dureza-brinell']],
  ['MM-794', 'Termohigrómetro',        'Termohigrómetro',                                  'neuquen',
    ['impacto','traccion','plegado','nick-break','dureza-brinell','dureza-rockwell','dureza-vickers','quimicos','varios','tratamientos-termicos']],
];

function ensayosDeEquipo(row) {
  try {
    const arr = JSON.parse(row.ensayos || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function seedEquipos() {
  const existentes = db.prepare('SELECT id, nombre_corto, ensayos FROM equipos').all();
  const porId = new Map();
  for (const r of existentes) porId.set(String(r.id).toUpperCase(), r);

  const stmtInsert = db.prepare(`
    INSERT INTO equipos (id, nombre, nombre_corto, tipo, sede, ensayos, activo)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      nombre = CASE WHEN equipos.nombre IS NULL OR equipos.nombre = '' THEN excluded.nombre ELSE equipos.nombre END,
      nombre_corto = COALESCE(equipos.nombre_corto, excluded.nombre_corto),
      sede = COALESCE(equipos.sede, excluded.sede),
      ensayos = ?
  `);

  let inserted = 0, merged = 0;
  const trx = db.transaction((seed) => {
    for (const [id, nombreCorto, nombreCompleto, sede, tipos] of seed) {
      const key = String(id).toUpperCase();
      const prev = porId.get(key);
      // Unión de tipos existentes + del seed (idempotente).
      const prevTipos = prev ? ensayosDeEquipo(prev) : [];
      const union = Array.from(new Set([...prevTipos, ...tipos]));
      const ensayosJson = JSON.stringify(union);
      stmtInsert.run(id, nombreCompleto, nombreCorto, 'medicion', sede, ensayosJson, ensayosJson);
      if (prev) merged++; else inserted++;
    }
  });
  trx(SEED);
  console.log(`[seed-equipos] ${inserted} equipo(s) nuevos, ${merged} actualizado(s) con tipos de ensayo`);
}

module.exports = { seedEquipos };
