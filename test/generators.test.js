// Snapshot tests por ensayo.
// Corre con:  node --test test/generators.test.js
// Regenerar snapshots después de cambio buscado:
//   UPDATE_SNAPSHOTS=1 node --test test/generators.test.js   (bash)
//   $env:UPDATE_SNAPSHOTS='1'; node --test test/generators.test.js  (powershell)
//
// Cada test carga un fixture (test/fixtures/<tipo>.json), invoca el generator
// individual y verifica que el hash del document.xml (post-strip de fechas)
// coincida con el snapshot guardado.

const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('path');
const fs       = require('fs');

const { compararSnapshot, cargarFixture, UPDATE } = require('./helpers');

// Cargar los generators uno a uno vía require. No usamos word-generator.js
// porque inyecta la fecha de hoy (no determinista).
const GENERATORS = {
  'traccion':                 require('../server/generators/template-traccion.js').generarTraccionDesdeTemplate,
  'impacto':                  require('../server/generators/template-impacto.js').generarImpactoDesdeTemplate,
  'plegado':                  require('../server/generators/template-plegado.js').generarPlegadoDesdeTemplate,
  'nick-break':               require('../server/generators/template-nick-break.js').generarNickBreakDesdeTemplate,
  'quimicos':                 require('../server/generators/template-quimicos.js').generarQuimicosDesdeTemplate,
  'dureza-brinell':           require('../server/generators/template-brinell.js').generarBrinellDesdeTemplate,
  'dureza-rockwell':          require('../server/generators/template-rockwell.js').generarRockwellDesdeTemplate,
  'dureza-vickers':           require('../server/generators/template-vickers.js').generarVickersDesdeTemplate,
  'ferrita-delta':            require('../server/generators/template-ferrita-delta.js').generarFerritaDeltaDesdeTemplate,
  'macrografia':              require('../server/generators/template-macrografia.js').generarMacrografiaDesdeTemplate,
  'rugosidad':                require('../server/generators/template-rugosidad.js').generarRugosidadDesdeTemplate,
  'varios':                   require('../server/generators/template-varios.js').generarVariosDesdeTemplate,
  'tratamientos-termicos':    require('../server/generators/template-tratamientos-termicos.js').generarTratamientosTermicosDesdeTemplate,
  'liquidos-penetrantes':     require('../server/generators/template-liquidos-penetrantes.js').generarLiquidosPenetrantesDesdeTemplate,
  'metalografia-general':     require('../server/generators/template-metalografia-general.js').generarMetalografiaGeneralDesdeTemplate,
  'anexo-metalografico':      require('../server/generators/template-anexo-metalografico.js').generarAnexoMetalograficoDesdeTemplate,
};

const OT_BASE = cargarFixture('ot-base');

// Cada fixture es { ...datos }. Al llamar al generator lo pasamos como `datos`,
// con el OT base como `ot` y sin fotos (buffer vacío).
for (const [tipo, fn] of Object.entries(GENERATORS)) {
  const fixturePath = path.join(__dirname, 'fixtures', tipo + '.json');
  if (!fs.existsSync(fixturePath)) {
    test(`[${tipo}] SKIP (falta fixture)`, () => {});
    continue;
  }
  test(`[${tipo}] genera Word y coincide con snapshot`, () => {
    const datos = cargarFixture(tipo);
    let buffer;
    try {
      buffer = fn(OT_BASE, datos, []);
    } catch (e) {
      assert.fail(`Generator "${tipo}" tiró excepción: ${e.message}\n${e.stack}`);
    }
    assert.ok(Buffer.isBuffer(buffer), `Generator "${tipo}" no devolvió Buffer`);
    assert.ok(buffer.length > 1000, `Generator "${tipo}" devolvió buffer sospechosamente chico (${buffer.length} bytes)`);

    const r = compararSnapshot(tipo, buffer);
    if (r.writtenNew) {
      console.log(`  ↳ snapshot creado: ${tipo} (${r.actual.slice(0, 12)}…)`);
      return;
    }
    if (r.updated) {
      console.log(`  ↳ snapshot actualizado: ${tipo}`);
      return;
    }
    assert.strictEqual(r.actual, r.expected,
      `Hash del docx cambió para "${tipo}".\n` +
      `  esperado: ${r.expected}\n` +
      `  actual:   ${r.actual}\n` +
      `Si el cambio es intencional, regenerá el snapshot con UPDATE_SNAPSHOTS=1.`);
  });
}
