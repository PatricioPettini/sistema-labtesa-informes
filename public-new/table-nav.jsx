/* ============================================================================
 * table-nav.jsx — dos event delegates globales:
 *
 *  1. Tab en input/textarea/select dentro de `<td>` → salta a la celda de la
 *     misma columna en la fila siguiente.
 *  2. Click en el texto adyacente a un checkbox → toggle el checkbox. Solo
 *     dispara cuando la "fila" es corta (max 8 elementos hijos), para evitar
 *     que un contenedor grande de una sección con un único checkbox
 *     (ej. "Es un preinforme") se toggle al clickear cualquier lado.
 * ========================================================================== */
'use strict';

(function () {
  var TAG_INTERACTIVO = { INPUT: 1, TEXTAREA: 1, SELECT: 1, BUTTON: 1, A: 1, LABEL: 1 };
  var MAX_HIJOS_FILA = 8; // Umbral para considerar un contenedor como "row"

  function esFocusable(el) {
    if (!el || el.disabled) return false;
    if (el.tagName === 'INPUT') return el.type !== 'hidden';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return false;
  }

  // ── 1. Tab → celda de abajo ────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    var el = e.target;
    if (!esFocusable(el)) return;
    var td = el.closest && el.closest('td');
    if (!td) return;
    var tr = td.parentElement;
    if (!tr || tr.tagName !== 'TR') return;
    var colIdx = Array.prototype.indexOf.call(tr.children, td);
    if (colIdx < 0) return;
    var nextTr = tr.nextElementSibling;
    while (nextTr) {
      var nextTd = nextTr.children[colIdx];
      if (nextTd) {
        var candidato = nextTd.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
        if (candidato) {
          e.preventDefault();
          candidato.focus();
          if (candidato.select) { try { candidato.select(); } catch (_) {} }
          return;
        }
      }
      nextTr = nextTr.nextElementSibling;
    }
  }, true);

  // ── 2. Click en la "fila" de un checkbox → toggle ──────────────────────
  //
  // Solo estrategias seguras:
  //   - <tr> o <label> → el navegador ya lo maneja / OK toggle.
  //   - Contenedor con display flex/grid Y ≤ MAX_HIJOS_FILA hijos directos →
  //     considerarlo "row" y togglear.
  //
  // Se descarta el fallback anterior de "subir buscando cualquier checkbox
  // único" — provocaba toggles espurios al clickear cualquier parte de una
  // sección grande cuyo único checkbox era, por ejemplo, "es preinforme".
  function esRowContenedor(el) {
    if (!el || !el.tagName) return false;
    if (el.tagName === 'TR' || el.tagName === 'LABEL') return true;
    if (el.children.length > MAX_HIJOS_FILA) return false;
    try {
      var d = window.getComputedStyle(el).display;
      return d === 'flex' || d === 'inline-flex' || d === 'grid' || d === 'inline-grid';
    } catch (_) { return false; }
  }

  document.addEventListener('click', function (e) {
    var target = e.target;
    if (!target || !target.tagName) return;
    if (TAG_INTERACTIVO[target.tagName]) return;
    if (target.closest && target.closest('label, input, textarea, select, button, a')) return;

    // Subir buscando el primer ancestro que sea row-like (bounded).
    var cur = target;
    var pasos = 0;
    var fila = null;
    while (cur && cur !== document.body && pasos < 6) {
      if (esRowContenedor(cur)) { fila = cur; break; }
      cur = cur.parentElement;
      pasos++;
    }
    if (!fila) return;

    var checkboxes = fila.querySelectorAll('input[type="checkbox"]:not([disabled])');
    if (checkboxes.length !== 1) return;
    var cb = checkboxes[0];
    if (cb.contains && cb.contains(target)) return;
    cb.click();
  }, true);
})();
