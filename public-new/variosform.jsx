/* ============================================================================
 * VariosForm — layout espejo del preinforme físico FM-066 (Ensayos Varios),
 * simplificado según pedido: sin bloque ESQUEMA DE ENSAYO ni textarea de
 * descripción libre. El bloque "ENSAYO" queda como un único textarea con el
 * NOMBRE del ensayo (que después es el heading del informe).
 *
 * Estructura:
 *   ENSAYO                        → textarea nombre del ensayo
 *   CONDICIONES DE ENSAYO         → textarea libre (una línea por condición)
 *   MÉTODO DE ENSAYO              → textarea libre (norma/método aplicado)
 *   EQUIPOS UTILIZADOS            → tabla nombre + TAG (add/delete filas)
 *   RESULTADOS OBTENIDOS          → textarea libre
 *   EVALUACIÓN DE RESULTADOS      → textarea libre + radio SI/NO
 *   MEMORIA ANALÍTICA             → textarea libre (referencias/cálculos)
 *
 * Mapping a keys ya usados por template-varios.js (para no romper el generator):
 *   titulo_ensayo, condiciones_texto, resultado_texto, evaluacion_texto,
 *   tiene_evaluacion (deriv. de informar_eval === 'SI')
 * Nuevos keys (agregados al generator):
 *   metodo_texto, equipos_libres[{nombre, tag}], memoria_texto, informar_eval
 * ========================================================================== */
'use strict';

var _r = React.createElement;

function VariosForm(props) {
  var datos = props.datos || {};
  var set = props.set;
  function upd(k, v) { set(k, v); }

  var S = window.FORM_STYLES;

  function seccion(titulo, contenido) {
    return _r('div', null,
      _r('div', { style: S.head }, titulo),
      _r('div', { style: S.box }, contenido));
  }

  function textarea(k, placeholder, minH) {
    return _r('textarea', {
      style: Object.assign({}, S.input, { minHeight: minH || 60 }),
      value: datos[k] || '', placeholder: placeholder,
      onChange: function (e) { upd(k, e.target.value); }
    });
  }

  // ── ENSAYO (nombre) ─────────────────────────────────────────────────────
  var bloqueEnsayo = seccion('ENSAYO',
    _r('textarea', {
      style: Object.assign({}, S.input, { minHeight: 44 }),
      value: datos.titulo_ensayo || '',
      placeholder: 'Nombre del ensayo (aparece como heading del informe)…',
      onChange: function (e) { upd('titulo_ensayo', e.target.value); }
    })
  );

  // ── CONDICIONES / MÉTODO ────────────────────────────────────────────────
  var bloqueCondiciones = seccion('CONDICIONES DE ENSAYO',
    textarea('condiciones_texto', 'Condiciones de ensayo (temperatura, ambiente, preparación, etc.)…', 60));

  var bloqueMetodo = seccion('MÉTODO DE ENSAYO',
    textarea('metodo_texto', 'Norma / método de ensayo aplicado…', 56));

  // ── EQUIPOS UTILIZADOS (catálogo completo del laboratorio) ─────────────
  var bloqueEquipos = _r('div', null,
    _r('div', { style: S.head }, 'EQUIPOS UTILIZADOS'),
    _r('div', { style: S.box },
      typeof window.OtrosEquiposBlock === 'function'
        ? _r(window.OtrosEquiposBlock, {
            embed: true,
            value: datos.equipos_libres || [],
            onChange: function (arr) { upd('equipos_libres', arr); },
          })
        : _r('div', { style: { fontSize: 11, color: '#c04' } }, 'Widget de equipos no disponible')
    )
  );

  // ── RESULTADOS ──────────────────────────────────────────────────────────
  var bloqueResultados = seccion('RESULTADOS OBTENIDOS',
    textarea('resultado_texto', 'Resultados obtenidos…', 110));

  // ── IMÁGENES DEL ENSAYO ────────────────────────────────────────────────
  // Orientación del bloque: 'vertical' = una debajo de otra (default),
  // 'horizontal' = lado a lado en tabla sin bordes (suma anchos ≤ 15 cm).
  var orient = datos.imagenes_orientacion === 'horizontal' ? 'horizontal' : 'vertical';
  var bloqueImagenes = _r('div', null,
    _r('div', { style: S.head }, 'IMÁGENES DEL ENSAYO (opcional)'),
    _r('div', { style: { padding: 8, display: 'flex', flexDirection: 'column', gap: 8 } },
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, flexWrap: 'wrap' } },
        _r('span', { style: { fontWeight: 600, color: '#333' } }, 'Disposición en el informe:'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'varios_img_orient', checked: orient === 'vertical',
            onChange: function () { upd('imagenes_orientacion', 'vertical'); } }),
          'Vertical (apiladas — máx 15,7 cm de alto total)'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'varios_img_orient', checked: orient === 'horizontal',
            onChange: function () { upd('imagenes_orientacion', 'horizontal'); } }),
          'Horizontal (lado a lado — máx 15 cm de ancho total)')
      ),
      typeof window.EnsayoPhotos === 'function'
        ? _r(window.EnsayoPhotos, {
            photos: datos.imagenes_resultado || [],
            hint: 'Arrastrá las imágenes del ensayo o hacé clic para seleccionar (opcional)',
            onChange: function (next) { upd('imagenes_resultado', next); },
          })
        : _r('div', { style: { fontSize: 11, color: '#999', border: '1px dashed #ccc', padding: 10, textAlign: 'center' } }, 'Widget de fotos no disponible')
    )
  );

  // ── TABLA DE RESULTADOS (opcional) ──────────────────────────────────────
  // Estado: datos.incluir_tabla (bool), datos.tabla_con_labels (bool, solo UI),
  // datos.tabla_dinamica = { headers: [str, ...], filas: [{label, valores}] }.
  var incluirTabla = datos.incluir_tabla === true;
  var conLabels    = datos.tabla_con_labels === true;
  var td = (datos.tabla_dinamica && typeof datos.tabla_dinamica === 'object' && !Array.isArray(datos.tabla_dinamica))
    ? datos.tabla_dinamica : { headers: [], filas: [] };
  var headersT = Array.isArray(td.headers) ? td.headers.slice() : [];
  var filasT   = Array.isArray(td.filas) ? td.filas.map(function (f) {
    return { label: (f && f.label) || '', valores: Array.isArray(f && f.valores) ? f.valores.slice() : [] };
  }) : [];

  // Todas las mutaciones a tabla_dinamica leen el estado ACTUAL (prev) para
  // evitar closures stale si los clicks se apilan antes del re-render.
  function updTabla(fn) {
    set(function (prev) {
      var prevT = (prev.tabla_dinamica && typeof prev.tabla_dinamica === 'object' && !Array.isArray(prev.tabla_dinamica))
        ? prev.tabla_dinamica : { headers: [], filas: [] };
      var hs = Array.isArray(prevT.headers) ? prevT.headers.slice() : [];
      var fs = Array.isArray(prevT.filas) ? prevT.filas.map(function (f) {
        return { label: (f && f.label) || '', valores: Array.isArray(f && f.valores) ? f.valores.slice() : [] };
      }) : [];
      var next = fn({ headers: hs, filas: fs });
      var n = Object.assign({}, prev);
      n.tabla_dinamica = { headers: next.headers, filas: next.filas };
      return n;
    });
  }
  function resizeCols(nCols) {
    nCols = Math.max(1, Math.min(10, nCols | 0));
    updTabla(function (cur) {
      var nextH = cur.headers.slice();
      while (nextH.length < nCols) nextH.push('');
      if (nextH.length > nCols) nextH.length = nCols;
      var nextF = cur.filas.map(function (f) {
        var v = (f.valores || []).slice();
        while (v.length < nCols) v.push('');
        if (v.length > nCols) v.length = nCols;
        return { label: f.label || '', valores: v };
      });
      return { headers: nextH, filas: nextF };
    });
  }
  function resizeRows(nRows) {
    nRows = Math.max(1, Math.min(50, nRows | 0));
    updTabla(function (cur) {
      var nCols = cur.headers.length || 1;
      var nextF = cur.filas.slice();
      while (nextF.length < nRows) nextF.push({ label: '', valores: Array(nCols).fill('') });
      if (nextF.length > nRows) nextF.length = nRows;
      return { headers: cur.headers.slice(), filas: nextF };
    });
  }
  function setHeader(i, val) {
    updTabla(function (cur) {
      var nextH = cur.headers.slice(); nextH[i] = val;
      return { headers: nextH, filas: cur.filas };
    });
  }
  function setCelda(r, c, val) {
    updTabla(function (cur) {
      var nextF = cur.filas.map(function (f) { return { label: f.label, valores: f.valores.slice() }; });
      while ((nextF[r].valores || []).length < cur.headers.length) nextF[r].valores.push('');
      nextF[r].valores[c] = val;
      return { headers: cur.headers.slice(), filas: nextF };
    });
  }
  function setLabelFila(r, val) {
    updTabla(function (cur) {
      var nextF = cur.filas.map(function (f) { return { label: f.label, valores: f.valores.slice() }; });
      nextF[r].label = val;
      return { headers: cur.headers.slice(), filas: nextF };
    });
  }
  function toggleIncluir() {
    var nextOn = !incluirTabla;
    if (nextOn && headersT.length === 0) {
      set({ incluir_tabla: true, tabla_dinamica: {
        headers: ['', '', ''],
        filas: [
          { label: '', valores: ['', '', ''] },
          { label: '', valores: ['', '', ''] },
          { label: '', valores: ['', '', ''] },
        ],
      } });
    } else {
      set('incluir_tabla', nextOn);
    }
  }
  function toggleLabels() {
    var next = !conLabels;
    if (!next) {
      var limpio = filasT.map(function (f) { return { label: '', valores: f.valores.slice() }; });
      set({ tabla_con_labels: false, tabla_dinamica: { headers: headersT.slice(), filas: limpio } });
    } else {
      set('tabla_con_labels', true);
    }
  }

  function numStepper(labelTxt, valor, onChange, min, max) {
    return _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
      _r('span', { style: S.label }, labelTxt + ':'),
      _r('button', { type: 'button', onClick: function () { onChange(valor - 1); },
        disabled: valor <= min,
        style: { width: 26, height: 26, border: '1px solid #999', background: '#f4f4f4', cursor: valor <= min ? 'not-allowed' : 'pointer', borderRadius: 4, fontSize: 14, fontWeight: 700 } }, '−'),
      _r('input', { type: 'number', min: min, max: max, value: valor,
        onChange: function (e) { var v = parseInt(e.target.value, 10); if (!isNaN(v)) onChange(v); },
        style: { width: 46, textAlign: 'center', border: '1px solid #999', fontSize: 11, padding: '4px', borderRadius: 4 } }),
      _r('button', { type: 'button', onClick: function () { onChange(valor + 1); },
        disabled: valor >= max,
        style: { width: 26, height: 26, border: '1px solid #999', background: '#f4f4f4', cursor: valor >= max ? 'not-allowed' : 'pointer', borderRadius: 4, fontSize: 14, fontWeight: 700 } }, '+')
    );
  }

  var bloqueTabla = _r('div', null,
    _r('div', { style: S.head }, 'TABLA DE RESULTADOS (OPCIONAL)'),
    _r('div', { style: S.box },
      _r('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 } },
        _r('input', { type: 'checkbox', checked: incluirTabla, onChange: toggleIncluir }),
        _r('span', { style: S.label }, 'Incluir tabla en el informe')
      ),
      incluirTabla ? _r('div', { style: { marginTop: 10 } },
        _r('div', { style: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 } },
          numStepper('Columnas', headersT.length, resizeCols, 1, 10),
          numStepper('Filas', filasT.length, resizeRows, 1, 50),
          _r('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 } },
            _r('input', { type: 'checkbox', checked: conLabels, onChange: toggleLabels }),
            _r('span', null, 'Incluir columna de etiquetas')
          )
        ),
        _r('div', { style: { overflowX: 'auto' } },
          _r('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: 11 } },
            _r('thead', null,
              _r('tr', { style: { background: '#e6e6e6' } },
                conLabels ? _r('th', { style: { border: '1px solid #333', padding: 4, minWidth: 120, background: '#dcdcdc' } }, '') : null,
                headersT.map(function (h, ci) {
                  return _r('th', { key: ci, style: { border: '1px solid #333', padding: 0, minWidth: 100 } },
                    _r('input', {
                      value: h || '',
                      placeholder: 'Título col ' + (ci + 1),
                      onChange: function (e) { setHeader(ci, e.target.value); },
                      style: { border: 'none', width: '100%', fontSize: 11, padding: '5px 6px', outline: 'none', background: 'transparent', fontWeight: 700, textAlign: 'center' }
                    })
                  );
                })
              )
            ),
            _r('tbody', null,
              filasT.map(function (f, ri) {
                return _r('tr', { key: ri },
                  conLabels ? _r('td', { style: { border: '1px solid #333', padding: 0, background: '#f7f7f7' } },
                    _r('input', {
                      value: f.label || '',
                      placeholder: 'Etiqueta fila ' + (ri + 1),
                      onChange: function (e) { setLabelFila(ri, e.target.value); },
                      style: { border: 'none', width: '100%', fontSize: 11, padding: '5px 6px', outline: 'none', background: 'transparent', fontWeight: 600 }
                    })
                  ) : null,
                  headersT.map(function (_, ci) {
                    return _r('td', { key: ci, style: { border: '1px solid #333', padding: 0 } },
                      _r('input', {
                        value: (f.valores && f.valores[ci]) || '',
                        onChange: function (e) { setCelda(ri, ci, e.target.value); },
                        style: { border: 'none', width: '100%', fontSize: 11, padding: '5px 6px', outline: 'none', background: 'transparent', textAlign: 'center' }
                      })
                    );
                  })
                );
              })
            )
          )
        )
      ) : null
    )
  );

  // ── EVALUACIÓN ──────────────────────────────────────────────────────────
  var bloqueEvaluacion = _r('div', null,
    _r('div', { style: S.head }, 'EVALUACIÓN DE RESULTADOS'),
    _r('div', { style: S.box },
      textarea('evaluacion_texto', 'Evaluación de resultados…', 72),
      _r('div', { style: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, fontSize: 11 } },
        _r('span', { style: S.label }, 'INFORMAR EVALUACIÓN:'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'varios_informar', checked: (datos.informar_eval || 'SI') === 'SI',
            onChange: function () { set({ informar_eval: 'SI', tiene_evaluacion: true }); } }), 'SI'),
        _r('label', { style: { display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' } },
          _r('input', { type: 'radio', name: 'varios_informar', checked: datos.informar_eval === 'NO',
            onChange: function () { set({ informar_eval: 'NO', tiene_evaluacion: false }); } }), 'NO'))
    )
  );

  // ── MEMORIA ANALÍTICA ───────────────────────────────────────────────────
  var bloqueMemoria = seccion('MEMORIA ANALÍTICA',
    textarea('memoria_texto', 'Memoria analítica: cálculos, referencias de archivo, fotos, etc.…', 72));

  return _r('div', { style: S.sheet },
    bloqueEnsayo, bloqueCondiciones, bloqueMetodo,
    bloqueEquipos, bloqueResultados, bloqueTabla, bloqueImagenes, bloqueEvaluacion, bloqueMemoria
  );
}

Object.assign(window, { VariosForm: VariosForm });
