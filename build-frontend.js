#!/usr/bin/env node
// Bundler del frontend con esbuild.
// - Lee los <script src="..."> de public-new/index.html en orden.
// - Transpila JSX y concatena todo en public-new/dist/bundle.js.
// - Cada archivo se envuelve en una IIFE para preservar el patrón actual
//   (`window.X = X;` para compartir globals).
//
// Uso:
//   node build-frontend.js           → build único
//   node build-frontend.js --watch   → watch mode (recompila al guardar)
//
// El resultado se sirve vía public-new/index-prod.html.

const esbuild = require('esbuild');
const fs      = require('fs');
const path    = require('path');

const SRC_DIR = path.join(__dirname, 'public-new');
const OUT_DIR = path.join(SRC_DIR, 'dist');
const OUT     = path.join(OUT_DIR, 'bundle.js');

const INDEX_HTML = path.join(SRC_DIR, 'index.html');

// Extrae los scripts locales (no CDN) del index.html en orden.
function leerOrdenDeScripts() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const rx = /<script(?:[^>]*type="text\/babel")?[^>]*src="([^"]+)"[^>]*><\/script>/g;
  const out = [];
  let m;
  while ((m = rx.exec(html))) {
    const src = m[1];
    if (src.startsWith('http')) continue;      // CDN → no bundlear
    if (src.startsWith('/'))    continue;      // absolutos
    out.push(src);
  }
  return out;
}

const PROD = process.argv.includes('--prod');

async function transformarArchivo(rel) {
  const full = path.join(SRC_DIR, rel);
  const code = fs.readFileSync(full, 'utf8');
  const isJsx = rel.endsWith('.jsx');
  const r = await esbuild.transform(code, {
    loader: isJsx ? 'jsx' : 'js',
    target: 'es2020',
    sourcefile: rel,
    sourcemap: PROD ? false : 'inline',
    minify: PROD,
  });
  return r.code;
}

async function build() {
  const t0 = Date.now();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const archivos = leerOrdenDeScripts();
  const partes = [
    '// ============================================================',
    '// LABTESA — Bundle de frontend (generado por build-frontend.js)',
    '// Orden: mismo que <script> en index.html.',
    '// ============================================================',
    '(function(){',
    '"use strict";',
  ];

  for (const f of archivos) {
    const code = await transformarArchivo(f);
    partes.push('// ---- ' + f + ' ----');
    // Envolvemos cada archivo en un bloque para aislar var/const locales,
    // pero SIN aislar los `window.X = X` que son intencionales.
    partes.push('{');
    partes.push(code);
    partes.push('}');
  }

  partes.push('})();');
  fs.writeFileSync(OUT, partes.join('\n'), 'utf8');
  const size = fs.statSync(OUT).size;
  const dt = Date.now() - t0;
  console.log(`✓ bundle: ${archivos.length} archivos → ${(size/1024).toFixed(1)} KB en ${dt}ms`);
  console.log('  ' + OUT);
}

async function watch() {
  const archivos = leerOrdenDeScripts();
  console.log(`[watch] observando ${archivos.length} archivos + index.html`);
  await build();
  const rebuild = () => build().catch(e => console.error('build error:', e.message));
  fs.watch(SRC_DIR, { recursive: false }, (evt, name) => {
    if (!name) return;
    if (name === 'dist' || name.startsWith('dist')) return;
    if (name.endsWith('.jsx') || name.endsWith('.js') || name === 'index.html') {
      console.log(`[watch] ${evt}: ${name} — rebuilding…`);
      rebuild();
    }
  });
}

if (process.argv.includes('--watch')) {
  watch().catch(e => { console.error(e); process.exit(1); });
} else {
  build().catch(e => { console.error(e); process.exit(1); });
}
