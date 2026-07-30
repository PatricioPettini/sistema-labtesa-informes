'use strict';
/**
 * registros-digitales.js
 *
 * Al emitir un informe, genera un PDF por cada ensayo — captura del render
 * web del formulario JSX tal como se ve en el sistema. Usa puppeteer-core
 * con Microsoft Edge (preinstalado en Windows) como browser.
 *
 * Estructura resultante:
 *   <carpetaInforme>/REGISTROS DIGITALES/<nro_ot>/<Nombre Ensayo>.pdf
 *
 * Modo "print": el frontend detecta `?print=1` en el hash de la ruta de
 * un ensayo (via app.jsx) y oculta sidebar / breadcrumb / botones para que
 * la captura sea solo del contenido del formulario.
 */

const fs = require('fs');
const path = require('path');

// Nombres "amigables" para los archivos PDF.
const NOMBRES_ARCHIVO = {
  traccion:               'Traccion',
  impacto:                'Impacto Charpy',
  'dureza-brinell':       'Dureza Brinell',
  'dureza-rockwell':      'Dureza Rockwell',
  'dureza-vickers':       'Dureza Vickers',
  plegado:                'Plegado',
  quimicos:               'Analisis Quimico',
  'nick-break':           'Nick Break',
  'ferrita-delta':        'Ferrita Delta',
  macrografia:            'Macrografia',
  rugosidad:              'Rugosidad',
  varios:                 'Varios',
  'liquidos-penetrantes': 'Liquidos Penetrantes',
  'metalografia-general': 'Analisis Metalografico General',
  'anexo-metalografico':  'Anexo Metalografico',
  'tratamientos-termicos':'Tratamientos Termicos',
};

function nombreArchivo(tipo) { return NOMBRES_ARCHIVO[tipo] || tipo; }

function _sanitizarNombre(s) {
  return String(s || '').replace(/[<>:"/\\|?* -]/g, '_').trim();
}

// Detecta el ejecutable de Edge (Windows) o Chrome como fallback.
function _detectarBrowser() {
  const candidatos = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const p of candidatos) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}

// Base URL del servidor. En prod suele ser http://localhost:3000; se puede
// overridear con PUPPETEER_BASE_URL (útil si el server escucha en otro puerto
// o si estamos detrás de proxy).
function _baseUrl() {
  return process.env.PUPPETEER_BASE_URL || 'http://localhost:3000';
}

/**
 * Genera los registros digitales de una emisión.
 * @param {object} ot           row de la OT (nro_ot).
 * @param {Array}  ensayos      ensayos con id + tipo.
 * @param {string} rutaInforme  path absoluto del .docx del informe.
 * @returns {Promise<{ok, carpeta, generados, errores}>}
 */
async function guardarRegistrosDigitales(ot, ensayos, rutaInforme) {
  if (!rutaInforme) return { ok: false, carpeta: null, generados: [], errores: ['sin ruta del informe'] };
  const carpetaInforme = path.dirname(rutaInforme);
  const carpetaRegistros = path.join(carpetaInforme, 'REGISTROS DIGITALES');
  const carpetaOt = path.join(carpetaRegistros, _sanitizarNombre(String(ot.nro_ot || '')));
  const errores = [];
  const generados = [];

  try { fs.mkdirSync(carpetaOt, { recursive: true }); }
  catch (e) { return { ok: false, carpeta: carpetaOt, generados: [], errores: ['mkdir: ' + e.message] }; }

  const executablePath = _detectarBrowser();
  if (!executablePath) {
    return { ok: false, carpeta: carpetaOt, generados: [], errores: ['No se encontró Edge/Chrome (setear PUPPETEER_EXECUTABLE_PATH)'] };
  }

  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch (e) {
    return { ok: false, carpeta: carpetaOt, generados: [], errores: ['puppeteer-core no instalado: ' + e.message] };
  }

  const baseUrl = _baseUrl();
  const nroOt = String(ot.nro_ot || '');

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  } catch (e) {
    return { ok: false, carpeta: carpetaOt, generados: [], errores: ['no se pudo abrir el browser: ' + e.message] };
  }

  try {
    for (const ensayo of (ensayos || [])) {
      const tipo = ensayo.tipo;
      const id = ensayo.id;
      if (!tipo || !id) { errores.push('ensayo sin tipo/id'); continue; }
      const nomBase = _sanitizarNombre(nombreArchivo(tipo));
      const pdfPath = path.join(carpetaOt, nomBase + '.pdf');
      const url = baseUrl + '/v2/#/ot/' + encodeURIComponent(nroOt) + '/ensayo/' + encodeURIComponent(tipo) + '/' + id + '?print=1';

      let page;
      try {
        page = await browser.newPage();
        // Viewport: match aproximado del sheet (1123px) + margen. Luego el
        // page.pdf con `scale` shrinkea para que entre en A4 sin cortarse.
        await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1.5 });
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        // Esperar a que el body tenga clase print-mode (indica que el JSX
        // procesó la ruta y activó el layout limpio).
        await page.waitForFunction(() => document.body.classList.contains('print-mode'), { timeout: 15000 }).catch(() => {});
        // Damos un pequeño respiro para que los inputs terminen de poblarse.
        await new Promise(r => setTimeout(r, 800));
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          // scale < 1 shrinkea el content web al ancho del papel — evita que la
          // tabla de resultados y el header del ensayo se corten a la derecha.
          scale: 0.65,
          margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
          preferCSSPageSize: false,
        });
        generados.push(pdfPath);
      } catch (e) {
        errores.push('ensayo ' + tipo + ' (id ' + id + '): ' + e.message);
      } finally {
        if (page) { try { await page.close(); } catch (_) {} }
      }
    }
  } finally {
    try { await browser.close(); } catch (_) {}
  }

  return { ok: errores.length === 0 && generados.length > 0, carpeta: carpetaOt, generados, errores };
}

module.exports = { guardarRegistrosDigitales };
