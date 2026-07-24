/* ============================================================================
 * forms-style.jsx — estilos compartidos para todos los forms JSX de ensayos.
 *
 * Basado en el estilo del form "plegado" (validado por el usuario). Reemplaza
 * las definiciones locales `var S = {...}` de cada form por
 * `var S = window.FORM_STYLES;` — todos los inputs quedan visualmente idénticos.
 *
 * Los colores usan CSS vars (`var(--surface)`, `var(--text)`, ...) definidas
 * en index.html, para que el modo oscuro funcione sin duplicar estilos.
 * ========================================================================== */
'use strict';

window.FORM_STYLES = (function () {
  var input = {
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 12,
    padding: '3px 5px',
    outline: 'none',
    fontFamily: 'inherit',
  };
  var head = {
    fontSize: 11,
    fontWeight: 800,
    padding: '5px 8px',
    background: 'var(--surface-3)',
    color: 'var(--text)',
    borderTop: '1px solid var(--border-strong)',
    borderBottom: '1px solid var(--border-strong)',
    letterSpacing: '.3px',
  };
  return {
    sheet: {
      width: '100%',
      maxWidth: 1000,
      background: 'var(--surface)',
      border: '1px solid var(--border-strong)',
      margin: '0 auto',
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: 'var(--text)',
    },
    head: head,
    headTitle: head,
    subhead: {
      fontSize: 10,
      fontWeight: 800,
      padding: '4px 8px',
      background: 'var(--surface-2)',
      color: 'var(--text)',
      borderTop: '1px solid var(--border-strong)',
      borderBottom: '1px solid var(--border-strong)',
      letterSpacing: '.2px',
    },
    box: {
      padding: 8,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      fontSize: 12,
      color: 'var(--text)',
    },
    padBox: {
      padding: 8,
      fontSize: 12,
      color: 'var(--text)',
    },
    label: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      cursor: 'pointer',
      color: 'var(--text)',
    },
    input: input,
    inline: Object.assign({}, input, { flex: 1 }),
    inputCell: input,
    num: { textAlign: 'center' },
    emph: { fontWeight: 700, fontSize: 11 },
    row: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    textarea: Object.assign({}, input, { minHeight: 60, resize: 'vertical', width: '100%' }),
  };
})();
