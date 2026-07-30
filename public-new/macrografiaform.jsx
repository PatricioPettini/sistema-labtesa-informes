/* ============================================================================
 * MacrografiaForm — layout espejo del preinforme físico FM-071 (Macrografía
 * de soldadura).
 *
 * Estructura:
 *   1. Condiciones de ensayo         (métodos checkboxes + ataque + muestra)
 *   Esquema de pieza                  (referencia visual — no va al Word)
 *   Resultados obtenidos              (probeta N° / CON-SIN / N° frases +
 *                                     textarea descripción)
 *   Tabla de frases                   (10 filas: checkbox + N° + descripción
 *                                     precargada editable)
 *
 * Mapping a keys del schema legado:
 *   metodologia, ataque_1 (=ataque_utilizado), muestra_ensayada, temperatura,
 *   equipamiento (flags eq_termohigro_700, eq_microscopio_378, eq_calibre_703,
 *   eq_extra), imagenes_resultado[], op_1/op_2/op_3/op_4, resultado_texto,
 *   evaluacion_texto, nota_texto, muestras[] (catetos)
 * Nuevos keys:
 *   metodo_soldadura_chk, metodo_soldadura_text,
 *   metodo_macro_general_chk, metodo_lineas_forja_chk, metodo_soldadura_asme_chk,
 *   probeta_n, resultado_con_sin, resultado_frases,
 *   frases_disponibles[{on, desc}]
 * ========================================================================== */
'use strict';

var _r = React.createElement;

var FRASES_DEFAULT = [
  'PRESENTA BUENA PENETRACIÓN Y FUSIÓN DEL CORDÓN DE SOLDADURA',
  'NO PRESENTA BUENA PENETRACIÓN Y FUSIÓN DEL CORDÓN DE SOLDADURA',
  'PRESENTA UNA ESTRUCTURA DE FUNDIDO',
  'PRESENTA UN CORRECTO FLUJO DE LÍNEAS DE FORJA EN EL SENTIDO LONGITUDINAL AL EJE AXIAL DE LA PIEZA',
  'POROSIDADES',
  'GRIETAS',
  'FISURAS',
  '', '', '',
];

function MacrografiaForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }
  function updBool(k, checked) { set(k, !!checked); }
  // Auto-tilda un checkbox cuando el técnico escribe en su input asociado.
  // Patrón "[checkbox] Label [input]" — si hay texto, el checkbox se enciende.
  // Si el input queda vacío, NO se destilda (el técnico puede haberlo tildado
  // manualmente por otra razón).
  function updConAutoCheck(campoTexto, campoCheck, val) {
    var patch = {};
    patch[campoTexto] = val;
    if (val && String(val).trim() && !datos[campoCheck]) patch[campoCheck] = true;
    set(patch);
  }

  var frases = Array.isArray(datos.frases_disponibles) ? datos.frases_disponibles.slice() : [];
  // Inicializar con las 10 frases default si no hay data cargada.
  if (frases.length === 0) {
    frases = FRASES_DEFAULT.map(function (d) { return { on: false, desc: d }; });
  } else if (frases.length < 10) {
    while (frases.length < 10) frases.push({ on: false, desc: '' });
  }
  function setFrase(i, key, val) {
    var next = frases.slice();
    next[i] = Object.assign({}, next[i] || {}, {});
    next[i][key] = val;
    set('frases_disponibles', next);
  }

  var S = window.FORM_STYLES;

  // ── 1. CONDICIONES ─────────────────────────────────────────────────────
  var block1 = _r('div', null,
    _r('div', { style: S.head }, '1.  ENSAYO MACROGRÁFICO — CONDICIONES DE ENSAYO'),
    _r('div', { style: S.box },
      _r('div', { style: { fontWeight: 600 } }, 'MÉTODO DE ENSAYO:'),
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 6 } },
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_soldadura_chk,
            onChange: function (e) { updBool('metodo_soldadura_chk', e.target.checked); } }),
          'Soldadura:',
          _r('input', { style: S.inline, placeholder: '……………………', value: datos.metodo_soldadura_text || '',
            onChange: function (e) { updConAutoCheck('metodo_soldadura_text', 'metodo_soldadura_chk', e.target.value); } })),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_macro_general_chk,
            onChange: function (e) { updBool('metodo_macro_general_chk', e.target.checked); } }),
          'Macrografías general: Según ITM-061'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_lineas_forja_chk,
            onChange: function (e) { updBool('metodo_lineas_forja_chk', e.target.checked); } }),
          'Líneas de forja: Según ITM-061'),
        _r('label', { style: S.label },
          _r('input', { type: 'checkbox', checked: !!datos.metodo_soldadura_asme_chk,
            onChange: function (e) { updBool('metodo_soldadura_asme_chk', e.target.checked); } }),
          'Soldadura: Según ASME IX QW 183/184'),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', null, 'Otra norma:'),
          _r(window.NormaInput, { tipo: 'macrografia', categoria: 'ensayo',
            style: S.inline, placeholder: 'Empezá a escribir (ej: ASTM…)',
            value: datos.norma_otra || '',
            onChange: function (e) { upd('norma_otra', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', null, 'Código de referencia:'),
          _r(window.NormaInput, { tipo: 'macrografia', categoria: 'referencia',
            style: S.inline, placeholder: 'ej: ASME…, API…, AWS…',
            value: datos.cod_referencia || '',
            onChange: function (e) { upd('cod_referencia', e.target.value); } })),
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          _r('span', null, 'Metodología (ITM):'),
          _r(window.ItmInput, { tipo: 'macrografia',
            style: S.inline, placeholder: 'Ej: ITM N°061',
            value: datos.metodologia || '',
            onChange: function (e) { upd('metodologia', e.target.value); } }))
      ),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ATAQUE UTILIZADO:'),
        _r('input', { style: S.inline, placeholder: '……………………', value: datos.ataque_1 || '',
          onChange: function (e) { upd('ataque_1', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'ZONA DE EVALUACIÓN:'),
        _r(window.ZonaInput, { tipo: 'macrografia',
          style: S.inline, placeholder: 'Ej: Soldadura, Núcleo…',
          value: datos.zona_evaluacion || '',
          onChange: function (e) { upd('zona_evaluacion', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'MUESTRA ENSAYADA:'),
        _r('input', { style: S.inline, placeholder: 'Muestra 1 / Zona afectada', value: datos.muestra_ensayada || '',
          onChange: function (e) { upd('muestra_ensayada', e.target.value); } })),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', { style: { fontWeight: 600 } }, 'TEMPERATURA DE ENSAYO:'),
        _r('input', {
          style: Object.assign({}, S.input, { width: 80 }),
          placeholder: 'Ej: 23',
          value: datos.temperatura || '',
          onChange: function (e) { upd('temperatura', e.target.value); },
        }),
        _r('span', null, '°C')),
      // ── EQUIPAMIENTO FIJO ──────────────────────────────────────────────
      // El Termohigrómetro TAG N°MM-700 es el equipo standard para macrografía
      // y viene tildado por default. Si el técnico usa además Microscopio o
      // Calibre digital, los tilda acá. Antes no se veían en el frontend y
      // aparecían solos en el Word.
      _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 0', borderTop: '1px dashed #ccc', marginTop: 4 } },
        _r('div', { style: { fontWeight: 600, fontSize: 11 } }, 'EQUIPAMIENTO UTILIZADO:'),
        _r('label', { style: S.label },
          _r('input', {
            type: 'checkbox',
            checked: datos.eq_termohigro_700 !== false, // default true si undefined
            onChange: function (e) { updBool('eq_termohigro_700', e.target.checked); },
          }),
          'Termohigrómetro TAG N°MM-700'),
        _r('label', { style: S.label },
          _r('input', {
            type: 'checkbox',
            checked: !!datos.eq_microscopio_378,
            onChange: function (e) { updBool('eq_microscopio_378', e.target.checked); },
          }),
          'Microscopio Leica DM 750 TAG N°MM-378'),
        _r('label', { style: S.label },
          _r('input', {
            type: 'checkbox',
            checked: !!datos.eq_calibre_703,
            onChange: function (e) { updBool('eq_calibre_703', e.target.checked); },
          }),
          'Calibre digital Mitutoyo TAG N°MM-703')
      ),
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        _r('span', null, 'Otro equipo:'),
        _r(window.EquipoInput, { tipo: 'macrografia',
          style: Object.assign({}, S.inline),
          value: datos.equipo_otro || '', placeholder: 'Empezá a escribir el equipo…',
          onChange: function (e) { upd('equipo_otro', e.target.value); },
          onTagChange: function (tag) { if (!datos.equipo_otro_tag) upd('equipo_otro_tag', tag); } }),
        _r('span', { style: { color: '#555' } }, 'TAG N° (opcional):'),
        _r('input', { style: Object.assign({}, S.input, { width: 96 }),
          placeholder: 's/TAG',
          value: datos.equipo_otro_tag || '',
          onChange: function (e) { upd('equipo_otro_tag', e.target.value); } })),
      typeof window.OtrosEquiposBlock === 'function'
        ? _r(window.OtrosEquiposBlock, { embed: true,
            value: datos.otros_equipos || [],
            onChange: function (arr) { upd('otros_equipos', arr); } })
        : null
    )
  );

  // ── Auto-arma resultado_texto y resultado_frases desde los estados ─────
  // Regla de armado (según convención del laboratorio):
  //   - Cabecera fija: "Luego del macroataque la probeta".
  //   - Frases 1-4: descripciones principales (ya incluyen el verbo "presenta"
  //     / "no presenta"). Se insertan tal cual, en minúsculas.
  //   - Frases 5,6,7: defectos (POROSIDADES, GRIETAS, FISURAS). Solo se listan
  //     si el usuario las marca. El conector depende del radio CON/SIN:
  //       CON → "con X, Y y Z"
  //       SIN → "sin X, Y ni Z"
  //     Si CON/SIN no está elegido, se usa "con" por default.
  //   - Frases 8-10 (custom del usuario): se agregan al final tal cual.
  function joinNatural(arr, connector) {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    var last = arr[arr.length - 1];
    var head = arr.slice(0, -1).join(', ');
    return head + ' ' + (connector || 'y') + ' ' + last;
  }

  var IDX_DEF_MIN = 4, IDX_DEF_MAX = 6;   // POROSIDADES / GRIETAS / FISURAS

  function armar(conSin, frasesArr) {
    var head = 'Luego del macroataque la probeta';

    var marcadas = [];
    frasesArr.forEach(function (f, i) {
      if (f && f.on && String(f.desc || '').trim()) marcadas.push(i);
    });
    if (marcadas.length === 0) {
      return head + ' presenta el/los siguiente(s) resultado(s): ...';
    }
    var principales  = marcadas.filter(function (i) { return i < IDX_DEF_MIN; });
    var defectosMark = marcadas.filter(function (i) { return i >= IDX_DEF_MIN && i <= IDX_DEF_MAX; });
    var extras       = marcadas.filter(function (i) { return i > IDX_DEF_MAX; });

    var textoPrincipal = '';
    if (principales.length > 0) {
      textoPrincipal = ' ' + joinNatural(principales.map(function (i) {
        return frasesArr[i].desc.trim().toLowerCase();
      }));
    }

    var textoDefectos = '';
    if (defectosMark.length > 0) {
      var listaDef  = defectosMark.map(function (i) { return frasesArr[i].desc.trim().toLowerCase(); });
      var conector   = conSin === 'SIN' ? 'sin' : 'con';
      var conjuncion = conSin === 'SIN' ? 'ni'  : 'y';
      textoDefectos = ' ' + conector + ' ' + joinNatural(listaDef, conjuncion);
    }

    var textoExtras = '';
    if (extras.length > 0) {
      var listaEx = extras.map(function (i) { return frasesArr[i].desc.trim(); });
      textoExtras = '. Adicionalmente: ' + listaEx.join('; ');
    }

    return head + textoPrincipal + textoDefectos + textoExtras + '.';
  }

  // Aplica un cambio y recalcula texto + números de frases.
  function actualizarResultado(nextConSin, nextFrases) {
    var cs = nextConSin !== undefined ? nextConSin : datos.resultado_con_sin;
    var fr = nextFrases !== undefined ? nextFrases : frases;
    var numeros = [];
    fr.forEach(function (f, i) {
      if (f.on && (f.desc || '').trim()) numeros.push(String(i + 1));
    });
    var texto = armar(cs, fr);
    set({
      resultado_con_sin: cs,
      resultado_frases: numeros.join(', '),
      resultado_texto: texto,
      frases_disponibles: fr,
    });
  }

  function toggleFrase(i) {
    var next = frases.slice();
    next[i] = Object.assign({}, next[i], { on: !next[i].on });
    actualizarResultado(undefined, next);
  }

  // ── RESULTADOS ────────────────────────────────────────────────────────
  var blockResultados = _r('div', null,
    _r('div', { style: S.head }, 'RESULTADOS OBTENIDOS'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 } },
      // Paso 1 — CON / SIN indicaciones.
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' } },
        _r('span', { style: { fontWeight: 700, color: '#0969da' } }, '1.'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'macro_consin', checked: datos.resultado_con_sin === 'CON',
            onChange: function () { actualizarResultado('CON'); } }),
          _r('span', { style: { fontWeight: 600 } }, 'CON'), ' indicaciones'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'macro_consin', checked: datos.resultado_con_sin === 'SIN',
            onChange: function () { actualizarResultado('SIN'); } }),
          _r('span', { style: { fontWeight: 600 } }, 'SIN'), ' indicaciones')),

      // Paso 2 — frases numeradas. Las frases 8-10 son custom editables inline.
      _r('div', null,
        _r('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 } },
          _r('span', { style: { fontWeight: 700, color: '#0969da' } }, '2.'),
          _r('span', { style: { fontWeight: 600 } }, 'Elegí las frases que aplican:')),
        _r('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 18 } },
          frases.map(function (f, i) {
            var desc = (f.desc || '').trim();
            var num = i + 1;
            var esCustom = i >= 7;
            return _r('label', {
              key: i,
              style: {
                display: 'flex', alignItems: 'flex-start', gap: 8,
                cursor: (desc || esCustom) ? 'pointer' : 'default',
                padding: '3px 4px', borderRadius: 3,
                background: f.on ? '#eaf6ec' : 'transparent',
                opacity: (desc || esCustom) ? 1 : 0.5,
              },
            },
              _r('input', { type: 'checkbox', style: { marginTop: 2 },
                checked: !!f.on, disabled: !desc,
                onChange: function () { toggleFrase(i); } }),
              _r('span', { style: { fontWeight: 700, color: '#666', minWidth: 22 } }, num + '.'),
              esCustom
                ? _r('input', {
                    style: Object.assign({}, S.input, { flex: 1, fontSize: 10, fontStyle: 'italic' }),
                    placeholder: 'Agregá una frase custom…', value: f.desc || '',
                    onChange: function (e) { setFrase(i, 'desc', e.target.value); },
                  })
                : _r('span', { style: { flex: 1 } }, desc));
          }))),

      // Paso 3 — preview del texto autogenerado, editable si el usuario quiere ajustar.
      _r('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
        _r('span', { style: { fontWeight: 700, color: '#0969da' } }, '3.'),
        _r('span', { style: { fontWeight: 600 } }, 'Texto final (editable):')),
      _r('textarea', { style: { width: '100%', minHeight: 80, border: '1px solid #999', fontSize: 11, padding: 6, resize: 'vertical', background: '#fafafa' },
        value: datos.resultado_texto || '',
        placeholder: 'Se completa solo al marcar las opciones de arriba…',
        onChange: function (e) { upd('resultado_texto', e.target.value); } })
    )
  );

  // ── IMÁGENES ──────────────────────────────────────────────────────────
  var blockImagenes = _r('div', null,
    _r('div', { style: S.head }, 'IMÁGENES DE LA MACROGRAFÍA (opcional)'),
    _r('div', { style: { padding: 8 } },
      typeof window.AutoLoadPhotosBtn === 'function'
        ? _r(window.AutoLoadPhotosBtn, {
            ensayoId: props.ensayoId, nroOt: props.nroOt, tipo: props.tipo,
            datos: datos, set: set,
            campos: ['imagenes_resultado'],
            hint: '⚡ Busca fotos de macrografía en el drive y las carga acá.',
          })
        : null,
      typeof window.EnsayoPhotos === 'function'
        ? _r(window.EnsayoPhotos, {
            photos: datos.imagenes_resultado || [],
            hint: 'Arrastrá las imágenes de la macrografía o hacé clic para seleccionar (opcional)',
            onChange: function (next) { upd('imagenes_resultado', next); },
          })
        : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
    )
  );

  return _r('div', { style: S.sheet },
    block1, blockResultados, blockImagenes
  );
}

Object.assign(window, { MacrografiaForm: MacrografiaForm });
