/* ============================================================================
 * otros-equipos-block.jsx — Bloque reutilizable "OTROS EQUIPOS (opcional)"
 * para todos los forms de ensayo. Permite agregar N equipos del catálogo del
 * lab (o texto libre), con búsqueda por nombre O por TAG (autocompleta el otro
 * campo cuando se elige uno del catálogo).
 *
 * Uso en un form:
 *   _r(window.OtrosEquiposBlock, {
 *     value: datos.otros_equipos || [],
 *     onChange: function (arr) { set('otros_equipos', arr); },
 *   })
 *
 * Estado guardado en datos.otros_equipos = [{ nombre, tag }, ...].
 * Los generators del Word leen ese array y lo agregan al bloque
 * "EQUIPAMIENTO UTILIZADO" (formato "nombre TAG N°xxx" o solo "nombre" si no
 * hay tag).
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var _dlSeq = 0;
function _nextId(prefix) { _dlSeq++; return prefix + '-' + _dlSeq; }

function OtrosEquiposBlock(props) {
  var S = window.FORM_STYLES || {};
  // Modo 'embed' (default false): sin título ni marco. Se usa cuando el bloque
  // va DENTRO de la sección EQUIPAMIENTO de un form (para no duplicar heads).
  var embed = props.embed === true;
  var titulo = props.titulo || 'OTROS EQUIPOS (opcional)';
  var items = Array.isArray(props.value) ? props.value.slice() : [];
  if (items.length === 0) items.push({ nombre: '', tag: '' });

  var dlNombresId = React.useRef(null);
  var dlTagsId = React.useRef(null);
  if (!dlNombresId.current) dlNombresId.current = _nextId('dl-nombres');
  if (!dlTagsId.current)    dlTagsId.current    = _nextId('dl-tags');

  var todos = (window.LabStore && typeof window.LabStore.todosLosEquipos === 'function')
    ? window.LabStore.todosLosEquipos() : [];

  // Opciones para el datalist de NOMBRES. Formato: "<nombre>  ·  <TAG> [sede]"
  // El datalist HTML filtra por prefijo del value, entonces el value tiene
  // que empezar por el nombre para que se pueda buscar al tipear el nombre.
  var opsNombres = todos.map(function (e) {
    var extras = [];
    if (e.id)   extras.push(e.id);
    if (e.sede) extras.push(e.sede);
    return e.nombre + (extras.length ? '  ·  ' + extras.join(' — ') : '');
  });
  // Dedupear + ordenar
  var vistoN = {}; var uniqueN = [];
  opsNombres.forEach(function (o) { if (!vistoN[o]) { vistoN[o] = 1; uniqueN.push(o); } });
  uniqueN.sort(function (a, b) { return a.localeCompare(b); });

  // Opciones para el datalist de TAGS. Formato: "<TAG>  ·  <nombre> [sede]"
  var opsTags = todos.filter(function (e) { return e.id; }).map(function (e) {
    var extras = [];
    if (e.nombre) extras.push(e.nombre);
    if (e.sede)   extras.push(e.sede);
    return e.id + (extras.length ? '  ·  ' + extras.join(' — ') : '');
  });
  var vistoT = {}; var uniqueT = [];
  opsTags.forEach(function (o) { if (!vistoT[o]) { vistoT[o] = 1; uniqueT.push(o); } });
  uniqueT.sort(function (a, b) { return a.localeCompare(b); });

  // Parsea el valor tipeado/elegido de un datalist con formato "X · Y [sede]"
  // y devuelve solo la parte X (que es el valor real, sin metadata).
  // NOTA: cuando el usuario escribe texto libre (sin " · "), NO se hace trim
  // para permitir tipear espacios intermedios / nombres compuestos sin que se
  // borren los espacios mientras se escribe.
  function parseValor(v) {
    if (!v) return '';
    var idx = String(v).indexOf(' · ');
    return idx >= 0 ? String(v).slice(0, idx).trim() : String(v);
  }

  function setItems(next) {
    // Nunca dejar el array vacío en memoria — pero permitir 1 fila vacía.
    if (next.length === 0) next = [{ nombre: '', tag: '' }];
    props.onChange && props.onChange(next);
  }

  function setNombre(i, valBruto) {
    var val = parseValor(valBruto);
    var next = items.map(function (it, idx) { return idx === i ? Object.assign({}, it) : it; });
    next[i].nombre = val;
    // Si el nombre coincide EXACTO con un equipo del catálogo, actualizar el TAG
    // (siempre — pisa el tag anterior aunque hubiera algo). Se compara con
    // .trim() por si el value tiene espacios trailing mientras se tipea.
    var valNorm = val.trim().toLowerCase();
    var match = valNorm && todos.find(function (e) { return String(e.nombre || '').trim().toLowerCase() === valNorm; });
    if (match) next[i].tag = match.id;
    setItems(next);
  }

  function setTag(i, valBruto) {
    var val = parseValor(valBruto).toUpperCase();
    var next = items.map(function (it, idx) { return idx === i ? Object.assign({}, it) : it; });
    next[i].tag = val;
    // Si el TAG coincide EXACTO con uno del catálogo, actualizar el nombre
    // (siempre — pisa el nombre anterior).
    var match = todos.find(function (e) { return String(e.id || '').trim().toUpperCase() === val; });
    if (match) next[i].nombre = match.nombre;
    setItems(next);
  }

  function delFila(i) {
    setItems(items.filter(function (_, idx) { return idx !== i; }));
  }
  function addFila() {
    setItems(items.concat([{ nombre: '', tag: '' }]));
  }

  var headStyle = S.head || { fontWeight: 700, background: '#f0f0f0', padding: 6, fontSize: 11 };
  var boxStyle  = S.box  || { padding: 8 };

  var tabla = _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 10 } },
    _r('thead', null,
      _r('tr', { style: { background: '#e6e6e6' } },
        _r('th', { style: { border: '1px solid #333', padding: 4, textAlign: 'left' } }, 'EQUIPO / INSTRUMENTO'),
        _r('th', { style: { border: '1px solid #333', padding: 4, width: 160 } }, 'TAG N° (opcional)'),
        _r('th', { style: { border: '1px solid #333', padding: 4, width: 32 } }, '')
      )
    ),
    _r('tbody', null,
      items.map(function (it, i) {
        return _r('tr', { key: i },
          _r('td', { style: { border: '1px solid #333', padding: 0 } },
            _r('input', {
              type: 'text', list: dlNombresId.current, autoComplete: 'off',
              style: { border: 'none', width: '100%', fontSize: 11, padding: '4px 6px', outline: 'none', background: 'transparent' },
              value: it.nombre || '',
              placeholder: 'Empezá a escribir el nombre del equipo…',
              onChange: function (e) { setNombre(i, e.target.value); },
            })
          ),
          _r('td', { style: { border: '1px solid #333', padding: 0 } },
            _r('input', {
              type: 'text', list: dlTagsId.current, autoComplete: 'off',
              style: { border: 'none', width: '100%', fontSize: 11, padding: '4px 6px', outline: 'none', background: 'transparent', textTransform: 'uppercase' },
              value: it.tag || '',
              placeholder: 's/TAG',
              onChange: function (e) { setTag(i, e.target.value); },
            })
          ),
          _r('td', { style: { border: '1px solid #333', textAlign: 'center' } },
            _r('button', {
              type: 'button', onClick: function () { delFila(i); },
              title: 'Eliminar equipo',
              style: { border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 14 }
            }, '🗑')
          )
        );
      })
    )
  );

  var contenido = _r(React.Fragment, null,
    _r('div', { style: { fontSize: 10, color: '#666', marginBottom: 6 } },
      'Buscá por nombre o por TAG (' + todos.length + ' equipos disponibles). Al elegir uno del catálogo, se autocompleta el otro campo.'
    ),
    tabla,
    _r('div', { style: { marginTop: 6 } },
      _r('button', {
        type: 'button', onClick: addFila,
        style: { fontFamily: 'inherit', fontSize: 11, padding: '5px 12px', border: '1px solid #999', background: '#f4f4f4', color: '#333', borderRadius: 4, cursor: 'pointer' }
      }, '+ Agregar equipo')
    ),
    // Datalists compartidos por todas las filas del bloque.
    _r('datalist', { id: dlNombresId.current },
      uniqueN.map(function (o, i) { return _r('option', { key: i, value: o }); })
    ),
    _r('datalist', { id: dlTagsId.current },
      uniqueT.map(function (o, i) { return _r('option', { key: i, value: o }); })
    )
  );

  // Modo embed: sin título ni marco (para meter dentro de la sección
  // EQUIPAMIENTO de otros forms). Modo standalone: con head + box.
  if (embed) return _r('div', { style: { marginTop: 8 } }, contenido);

  return _r('div', null,
    _r('div', { style: headStyle }, titulo),
    _r('div', { style: boxStyle }, contenido)
  );
}

Object.assign(window, { OtrosEquiposBlock: OtrosEquiposBlock });
