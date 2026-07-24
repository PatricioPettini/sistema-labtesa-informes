/* ============================================================================
 * catalogo-input.jsx — inputs con datalist auto-poblado desde el catálogo DB.
 *
 * Componentes disponibles (todos en window.*):
 *   NormaInput   — sugiere normas del catálogo (tabla normas, clase='norma')
 *   ItmInput     — sugiere ITMs del catálogo   (tabla normas, clase='itm')
 *   EquipoInput  — sugiere equipos por nombre  (tabla equipos)
 *
 * Uso: reemplazar cualquier <input ... /> plain por
 *   _r(window.NormaInput, { tipo: 'traccion', value, onChange, style, placeholder })
 * y aparece un combo con las sugerencias filtradas por tipo de ensayo.
 * ========================================================================== */
'use strict';

var _clSeq = 0;
function _nextId(prefix) {
  _clSeq++;
  return prefix + '-' + _clSeq;
}

// Filtro por categoría para separar "normas de ensayo" de "códigos de referencia".
// Los códigos que van habitualmente en la sección "Código de referencia" son
// ASME BPVC (Sección IX/V/VIII), API 1104/5L/6A, AWS D1.1/D1.5/B4.0. El resto
// se considera "norma de ensayo" (ASTM/ISO/DIN/IRAM/SAE/ASM).
var RX_CODIGOS_REFERENCIA = /^(?:ASME\s+BPVC|API\s+\d|AWS\s+[A-Z]?\d)/i;

function esCodigoReferencia(norma) {
  return RX_CODIGOS_REFERENCIA.test(String(norma || '').trim());
}

function filtrarPorCategoria(lista, categoria) {
  if (categoria === 'ensayo')     return lista.filter(function (n) { return !esCodigoReferencia(n); });
  if (categoria === 'referencia') return lista.filter(esCodigoReferencia);
  return lista;
}

function catalogoInputFactory(getOpciones, aplicaCategoria) {
  return function CatalogoInput(props) {
    var idRef = React.useRef(null);
    if (!idRef.current) idRef.current = _nextId('cat');
    var opciones;
    try { opciones = getOpciones(props.tipo) || []; } catch (_) { opciones = []; }
    if (aplicaCategoria && props.categoria) opciones = filtrarPorCategoria(opciones, props.categoria);
    // Dedupear + ordenar ASC
    var vistos = {};
    var ops = [];
    for (var i = 0; i < opciones.length; i++) {
      var o = String(opciones[i] || '').trim();
      if (!o || vistos[o]) continue;
      vistos[o] = 1; ops.push(o);
    }
    ops.sort(function (a, b) { return a.localeCompare(b); });

    var style = props.style || {};
    return React.createElement(React.Fragment, null,
      React.createElement('input', {
        type: 'text',
        list: idRef.current,
        style: style,
        value: props.value == null ? '' : props.value,
        placeholder: props.placeholder,
        onChange: function (e) { props.onChange && props.onChange(e); },
        onBlur: props.onBlur,
        autoComplete: 'off',
      }),
      React.createElement('datalist', { id: idRef.current },
        ops.map(function (o, i) {
          return React.createElement('option', { key: i, value: o });
        })
      )
    );
  };
}

// NormaInput acepta `categoria`:
//   'ensayo'     — filtra códigos de referencia (ASME BPVC / API / AWS).
//   'referencia' — solo códigos de referencia.
//   undefined    — todas.
var NormaInput = catalogoInputFactory(function (tipo) {
  var s = window.LabStore;
  if (!s || typeof s.normasParaTipo !== 'function') return [];
  return s.normasParaTipo(tipo);
}, true);

var ItmInput = catalogoInputFactory(function (tipo) {
  var s = window.LabStore;
  if (!s || typeof s.itmsParaTipo !== 'function') return [];
  return s.itmsParaTipo(tipo);
}, false);

// EquipoInput — sugiere nombres de equipos del catálogo filtrados por tipo.
// El input guarda SOLO el nombre. Si `onTagChange` está definido, al seleccionar
// (o pegar) un nombre reconocido del catálogo, dispara el callback con el TAG
// asociado para autofill.
function EquipoInput(props) {
  var idRef = React.useRef(null);
  if (!idRef.current) idRef.current = _nextId('eq');
  var s = window.LabStore;
  var lista = (s && typeof s.equiposParaTipo === 'function' ? s.equiposParaTipo(props.tipo) : []) || [];
  var opciones = [];
  var vistos = {};
  lista.forEach(function (e) {
    var nom = String(e && (e.nombre || e.label) || '').trim();
    if (!nom || vistos[nom]) return;
    vistos[nom] = 1; opciones.push(nom);
  });
  opciones.sort(function (a, b) { return a.localeCompare(b); });

  function handleChange(e) {
    var val = e.target.value;
    props.onChange && props.onChange(e);
    // Si el valor coincide exactamente con un equipo del catálogo, autofill el TAG.
    if (props.onTagChange && s && typeof s.tagPorNombreEquipo === 'function') {
      var tag = s.tagPorNombreEquipo(val);
      if (tag) props.onTagChange(tag);
    }
  }

  return React.createElement(React.Fragment, null,
    React.createElement('input', {
      type: 'text', list: idRef.current,
      style: props.style || {},
      value: props.value == null ? '' : props.value,
      placeholder: props.placeholder,
      onChange: handleChange, onBlur: props.onBlur,
      autoComplete: 'off',
    }),
    React.createElement('datalist', { id: idRef.current },
      opciones.map(function (o, i) {
        return React.createElement('option', { key: i, value: o });
      })
    )
  );
}

// ZonaInput — sugiere zonas de evaluación (Núcleo, Superficie, Soldadura, etc.).
// Se auto-alimenta al guardar ensayos (ver server/utils/catalogo-auto.js).
var ZonaInput = catalogoInputFactory(function (tipo) {
  var s = window.LabStore;
  if (!s || typeof s.zonasParaTipo !== 'function') return [];
  return s.zonasParaTipo(tipo);
}, false);

Object.assign(window, {
  NormaInput: NormaInput,
  ItmInput:   ItmInput,
  EquipoInput: EquipoInput,
  ZonaInput:   ZonaInput,
});
