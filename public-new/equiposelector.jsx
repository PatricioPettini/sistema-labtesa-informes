/* ============================================================================
 * EquipoSelector — widget genérico que muestra los equipos del catálogo global
 * aplicables a un tipo de ensayo. Reemplaza los catálogos hardcoded que estaban
 * duplicados en cada *form.jsx.
 *
 * Props:
 *   tipo   — string, tipo de ensayo (ej. 'impacto', 'traccion', 'dureza-vickers')
 *   sede   — string opcional, 'caba' | 'neuquen' (filtra por sede si se pasa)
 *   datos  — objeto de datos del ensayo (con datos.equipamiento y datos.equipamiento_tags)
 *   set    — función setter del form (recibe key con dot-notation)
 *   fallbackHardcoded — array opcional [{key,nombre,tagDefault}] que se usa si
 *                       la DB está caída o vacía.
 *
 * Guarda en:
 *   datos.equipamiento[equipo_id]      = true|false (checkbox)
 *   datos.equipamiento_tags[equipo_id] = string   (TAG editable)
 *
 * `equipo_id` es el id de la tabla `equipos` (ej. 'MM-405').
 * ========================================================================== */
'use strict';

var _r = React.createElement;

function EquipoSelector(props) {
  var tipo = props.tipo;
  var sede = props.sede || null;
  var datos = props.datos || {};
  var set = props.set;
  var fallback = props.fallbackHardcoded || null;

  var _list = React.useState(null); var lista = _list[0], setLista = _list[1];
  var _err  = React.useState(null); var err   = _err[0],  setErr   = _err[1];

  React.useEffect(function () {
    var url = '/api/equipos?tipo=' + encodeURIComponent(tipo);
    if (sede) url += '&sede=' + encodeURIComponent(sede);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) { setLista(Array.isArray(d) ? d : []); })
      .catch(function (e) { setErr(e.message); setLista([]); });
  }, [tipo, sede]);

  // Fallback: si el catálogo global no respondió aún o está vacío, usamos el
  // catálogo hardcoded del form (compat con la versión anterior).
  var equipos;
  if (lista == null) {
    return _r('div', { style: { padding: 10, color: '#999', fontSize: 11, fontStyle: 'italic' } },
      'Cargando catálogo de equipos…');
  }
  if (lista.length === 0 && fallback && fallback.length > 0) {
    equipos = fallback.map(function (e) {
      return { id: e.key || e.tagDefault, nombre: e.nombre, tagDefault: e.tagDefault || '' };
    });
  } else {
    equipos = lista.map(function (e) {
      return {
        id: e.id,
        nombre: e.nombre_corto || e.nombre,
        tagDefault: e.id,           // el ID es el TAG por convención (MM-405, etc.)
        vencimiento: e.vencimiento || null,
        sede: e.sede || null,
      };
    });
  }

  var equipMarcado = datos.equipamiento || {};
  var equipTags = datos.equipamiento_tags || {};

  function toggle(id, checked) { set('equipamiento.' + id, !!checked); }
  function setTag(id, val) { set('equipamiento_tags.' + id, val); }

  function estadoVenc(fechaISO) {
    if (!fechaISO) return null;
    var hoy = new Date();
    var v = new Date(fechaISO + 'T00:00:00');
    var dias = Math.round((v - hoy) / 86400000);
    if (dias < 0) return { txt: 'VENCIDO', color: '#b02a2a' };
    if (dias <= 30) return { txt: 'vence en ' + dias + ' d', color: '#7a5a1a' };
    return null;
  }

  var S = {
    row:   { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11, borderBottom: '1px dashed #eee' },
    label: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 },
    input: { border: '1px solid #bbb', background: 'transparent', fontSize: 11, padding: '2px 5px', outline: 'none', width: 110 },
    chip:  { fontSize: 10, padding: '1px 5px', borderRadius: 3, fontWeight: 700 },
  };

  return _r('div', {
    style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }
  },
    err ? _r('div', { style: { color: '#c04', fontSize: 11, marginBottom: 4 } },
      '⚠ ' + err + ' — usando catálogo local.') : null,
    equipos.length === 0 ? _r('div', { style: { color: '#999', fontStyle: 'italic', padding: 8 } },
      'No hay equipos configurados para "' + tipo + '". Agregalos desde ',
      _r('a', { href: '#/equipos', style: { color: 'var(--accent)' } }, 'Equipos'), '.')
    : equipos.map(function (e) {
        var venc = estadoVenc(e.vencimiento);
        var tagVal = equipTags[e.id] != null ? equipTags[e.id] : e.tagDefault;
        return _r('div', { key: e.id, style: S.row },
          _r('label', { style: S.label },
            _r('input', { type: 'checkbox', checked: !!equipMarcado[e.id],
              onChange: function (ev) { toggle(e.id, ev.target.checked); } }),
            _r('span', { style: { fontWeight: 600 } }, e.nombre)),
          venc ? _r('span', {
            style: Object.assign({}, S.chip, { background: venc.color + '22', color: venc.color }),
            title: 'Calibración: ' + e.vencimiento
          }, venc.txt) : null,
          _r('span', { style: { color: '#555' } }, 'TAG N°:'),
          _r('input', {
            style: S.input,
            placeholder: e.tagDefault || '',
            value: tagVal || '',
            onChange: function (ev) { setTag(e.id, ev.target.value); }
          })
        );
      })
  );
}

window.EquipoSelector = EquipoSelector;
