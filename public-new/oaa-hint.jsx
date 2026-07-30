/* LABTESA — Agente sugerencia de norma + edición acreditada (frontend inline).
 *
 * Espeja el mapa de normas del `agente-oaa` (server) para poder mostrar en el
 * form de ensayo un banner con:
 *   - la norma + edición dentro del alcance OAA para ese tipo
 *   - un warning si la edición actual no coincide con la acreditada
 *
 * NO hace round-trip al server: los datos son estáticos y cambian pocas veces
 * al año (según certificado OAA LE 012). Si el certificado cambia, actualizar
 * `NORMAS_ACRED_UI` acá y `NORMAS_ACRED` en server/agents/agente-oaa.js.
 */

// Metadatos de acreditación por tipo — mismo alcance que agente-oaa.js.
var NORMAS_ACRED_UI = {
  traccion: {
    normas: [
      { label: 'ASTM E8/E8M',  edicion: '2024', regex: /ASTM\s*E\s*8(?:\s*\/\s*E\s*8\s*M)?[\s\-/:(]*(?:20)?24\b/i },
      { label: 'ISO 6892-1',   edicion: '2019', regex: /ISO\s*6892[\s\-]*1[\s\-:(]*(?:20)?19\b/i },
    ],
    condiciones: 'a temperatura ambiente (15–30 °C), sede CABA',
  },
  impacto: {
    normas: [
      { label: 'ASTM E23',     edicion: '2024', regex: /ASTM\s*E\s*23[\s\-/:(]*(?:20)?24\b/i },
      { label: 'ISO 148-1',    edicion: '2016', regex: /ISO\s*148[\s\-]*1[\s\-:(]*(?:20)?16\b/i },
    ],
    condiciones: '-80 a +50 °C, energía ≤130 J, sede CABA',
  },
  'dureza-vickers': {
    normas: [
      { label: 'ASTM E92',     edicion: '2023', regex: /ASTM\s*E\s*92[\s\-/:(]*(?:20)?23\b/i },
      { label: 'ISO 6507-1',   edicion: '2024', regex: /ISO\s*6507[\s\-]*1[\s\-:(]*(?:20)?24\b/i },
    ],
    condiciones: 'carga 10 kgf, sede CABA',
  },
  plegado: {
    normas: [
      { label: 'ASTM E190',    edicion: '2021', regex: /ASTM\s*E\s*190[\s\-/:(]*(?:20)?21\b/i },
      { label: 'ISO 5173',     edicion: '2023', regex: /ISO\s*5173[\s\-:(]*(?:20)?23\b/i },
    ],
    condiciones: 'sobre soldadura, equipo Emic (CABA)',
  },
};

var TIPOS_FUERA_ALCANCE = { 'dureza-brinell': 1, 'dureza-rockwell': 1, quimicos: 1, 'nick-break': 1, 'ferrita-delta': 1 };

// Concatena todos los campos donde puede aparecer la norma para el chequeo.
function _extraerNormaTexto(tipo, datos) {
  if (!datos) return '';
  var partes = [];
  partes.push(String(datos.norma_ensayo || datos.norma || datos.metodo_ensayo || ''));
  // Formularios nuevos con checkbox + año separado.
  if (tipo === 'traccion') {
    if (datos.norma_iso6892_1) partes.push('ISO 6892-1' + (datos.norma_iso6892_1_year || ':2019'));
    if (datos.norma_astm_e8)   partes.push('ASTM E8'   + (datos.norma_astm_e8_year   || '-24'));
  }
  if (tipo === 'impacto') {
    if (datos.norma_iso148_1)  partes.push('ISO 148-1'   + (datos.norma_iso148_1_year   || ':2016'));
    if (datos.norma_astm_e23)  partes.push('ASTM E23'    + (datos.norma_astm_e23_year   || '-24'));
    if (datos.norma_din_10045) partes.push('DIN EN 10045'+ (datos.norma_din_10045_year  || ''));
  }
  if (tipo === 'dureza-vickers' && datos.norma_year_suffix) partes.push(datos.norma_year_suffix);
  return partes.filter(Boolean).join(' | ');
}

// Retorna { esAcreditable, alcance, warning }.
//   - esAcreditable: el tipo TIENE alcance OAA configurado.
//   - alcance: texto informativo con las normas acreditadas y condiciones.
//   - warning: si el usuario ya cargó una norma que NO matchea la acreditada,
//              devolvemos el texto de qué esperábamos.
window.OAAHint = window.OAAHint || {};
window.OAAHint.get = function (tipo, datos) {
  if (TIPOS_FUERA_ALCANCE[tipo]) {
    return { esAcreditable: false, alcance: null, warning: null, fueraAlcance: true };
  }
  var cfg = NORMAS_ACRED_UI[tipo];
  if (!cfg) return { esAcreditable: false, alcance: null, warning: null };
  var normasStr = cfg.normas.map(function (n) { return n.label + ' (' + n.edicion + ')'; }).join(' o ');
  var alcance = 'Alcance OAA: ' + normasStr + ' — ' + cfg.condiciones + '.';
  // Chequeo de norma actual
  var normaTexto = _extraerNormaTexto(tipo, datos);
  var warning = null;
  if (normaTexto && normaTexto.trim()) {
    var matchea = cfg.normas.some(function (n) { return n.regex.test(normaTexto); });
    if (!matchea) {
      warning = 'La norma cargada ("' + normaTexto.slice(0, 60) + '") no coincide con la edición acreditada (' + normasStr + '). Va a emitirse como NO acreditado.';
    }
  }
  return { esAcreditable: true, alcance: alcance, warning: warning };
};

// Componente banner que se coloca dentro del form de ensayo.
window.OAAHintBanner = function (props) {
  var tipo = props.tipo, datos = props.datos;
  var hint = window.OAAHint.get(tipo, datos);
  if (!hint || (!hint.alcance && !hint.fueraAlcance)) return null;
  var bg = hint.warning ? '#fff4e0'
         : hint.fueraAlcance ? '#f1f3f5'
         : '#eef2ff';
  var color = hint.warning ? '#8a5a00'
            : hint.fueraAlcance ? 'var(--text-3)'
            : '#3730a3';
  var border = hint.warning ? '#e0b060'
             : hint.fueraAlcance ? 'var(--border)'
             : '#c7d2fe';
  var iconName = hint.warning ? 'alertTri' : (hint.fueraAlcance ? 'inbox' : 'sparkles');
  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', margin: '6px 0 12px',
      background: bg, border: '1px solid ' + border, borderRadius: 8,
      color: color, fontSize: 12.5, lineHeight: 1.45,
    },
    title: 'Sugerencia automática según certificado OAA LE 012 (LABTESA CABA)',
  },
    React.createElement(Icon, { name: iconName, size: 15, strokeWidth: 2 }),
    React.createElement('div', { style: { flex: 1 } },
      hint.fueraAlcance
        ? React.createElement('span', null,
            React.createElement('b', null, 'Fuera del alcance OAA. '),
            'Este tipo de ensayo no está incluido en el certificado LE 012 — el informe siempre sale como NO acreditado.')
        : React.createElement('span', null,
            React.createElement('b', null, hint.warning ? 'Atención: ' : 'Sugerencia OAA: '),
            hint.warning || hint.alcance
          )
    )
  );
};
