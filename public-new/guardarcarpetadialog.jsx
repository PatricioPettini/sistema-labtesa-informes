/* ============================================================================
 * GuardarCarpetaDialog — diálogo tipo "Guardar como" de Windows Explorer.
 * Flujo:
 *   1. Al abrir invoca /api/generate/:nro_ot/detectar-carpeta con la propuesta
 *      basada en fuzzy match del cliente.
 *   2. Modo confirmar: muestra la propuesta y ofrece Confirmar / Elegir otra.
 *   3. Modo navegar: barra de dirección editable + breadcrumb clickeable +
 *      lista de subcarpetas + input filename + botón Guardar aquí.
 *
 * Props:
 *   nroOt        — string, para invocar el endpoint de detección
 *   onConfirm    — (carpetaDestino, filename) => void
 *   onCancel     — () => void
 * ========================================================================== */
'use strict';

var _r = React.createElement;

function GuardarCarpetaDialog(props) {
  var nroOt = props.nroOt;
  var onConfirm = props.onConfirm;
  var onCancel = props.onCancel;

  var _s = React.useState({
    loading: true,
    info: null,
    modo: 'confirmar',
    navPath: null,
    navPathInput: '',
    navItems: [],
    navParent: null,
    error: null,
    navError: null,
    filename: '',
    navFiltro: '',    // texto para filtrar la lista de subcarpetas
    precheck: null,   // { vencidos:[], por_vencer:[] }
    forzarVencidos: false, // checkbox del usuario para aceptar equipos vencidos
  });
  var st = _s[0], setSt = _s[1];

  function fetchPrecheck() {
    fetch('/api/generate/' + nroOt + '/precheck')
      .then(function (r) { return r.json(); })
      .then(function (d) { setSt(function (s) { return Object.assign({}, s, { precheck: d }); }); })
      .catch(function () {});
  }

  function fetchDetectar() {
    setSt(function (s) { return Object.assign({}, s, { loading: true, error: null }); });
    fetch('/api/generate/' + nroOt + '/detectar-carpeta')
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error al detectar carpeta');
        setSt(function (s) {
          return Object.assign({}, s, {
            loading: false,
            info: r.d,
            // Siempre arrancamos en modo confirmar: si el cliente no existe,
            // se muestra la propuesta con aviso de que se creará. El botón
            // "Elegir otra carpeta" está disponible por si el técnico quiere
            // navegar y elegir una distinta.
            modo: 'confirmar',
            navPath: r.d.root_drive,
            navPathInput: r.d.root_drive,
            filename: r.d.filename || '',
          });
        });
      })
      .catch(function (e) {
        setSt(function (s) { return Object.assign({}, s, { loading: false, error: e.message }); });
      });
  }

  function fetchSubcarpetas(p) {
    setSt(function (s) { return Object.assign({}, s, { navError: null }); });
    fetch('/api/drive/subcarpetas?path=' + encodeURIComponent(p))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Carpeta no encontrada');
        setSt(function (s) {
          return Object.assign({}, s, {
            navPath: r.d.path,
            navPathInput: r.d.path,
            navItems: r.d.items || [],
            navParent: r.d.parent,
            navError: null,
            navFiltro: '',    // resetear filtro al cambiar de carpeta
          });
        });
      })
      .catch(function (e) {
        setSt(function (s) { return Object.assign({}, s, { navError: e.message }); });
      });
  }

  React.useEffect(function () { fetchDetectar(); fetchPrecheck(); }, []);

  function irACarpeta(p) { fetchSubcarpetas(p); }
  function confirmarCarpetaActual() {
    if (!st.navPath) return;
    onConfirm(st.navPath, st.filename, { forzar: st.forzarVencidos });
  }
  function confirmarPropuesta() {
    if (!st.info) return;
    onConfirm(st.info.carpeta_sol, st.filename, { forzar: st.forzarVencidos });
  }
  var hayVencidos = !!(st.precheck && st.precheck.vencidos && st.precheck.vencidos.length);
  var puedeGenerar = !hayVencidos || st.forzarVencidos;

  // Descompone un path Windows en segmentos clickeables. Ej:
  //   G:\ADMINISTRACION\INFORMES APOLO\METALMECANICA
  //   → [{label: 'G:\\', path: 'G:\\'}, {label: 'ADMINISTRACION', path: 'G:\\ADMINISTRACION'}, ...]
  //
  // Para paths UNC (\\server\share\...) preserva los \\ iniciales y marca el
  // segmento del server como no navegable (fs.existsSync devuelve false para
  // solo \\server sin share).
  function breadcrumbs(fullPath) {
    if (!fullPath) return [];
    var isUNC = /^\\\\/.test(fullPath);
    var parts = fullPath.split(/[\\/]/).filter(Boolean);
    var acc = [];
    var current = '';
    parts.forEach(function (p, i) {
      if (i === 0) {
        if (isUNC) {
          current = '\\\\' + p;
          acc.push({ label: '\\\\' + p, path: current, disabled: true });
        } else {
          current = p + '\\';
          acc.push({ label: p + '\\', path: current });
        }
      } else {
        current = current + (current.endsWith('\\') ? '' : '\\') + p;
        acc.push({ label: p, path: current });
      }
    });
    return acc;
  }

  // ── Estilos ────────────────────────────────────────────────────────────
  // Colores basados en CSS vars (--surface, --text, ...) para que light/dark
  // funcionen sin duplicar estilos.
  var backdrop = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 9999,
  };
  var box = {
    background: 'var(--surface)', color: 'var(--text)',
    borderRadius: 8, padding: 0,
    width: 'min(90vw, 780px)', maxHeight: '85vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    border: '1px solid var(--border-strong)',
    boxShadow: 'var(--shadow-lg)',
    fontFamily: 'Segoe UI, Arial, Helvetica, sans-serif',
  };
  var header = {
    padding: '14px 20px', borderBottom: '1px solid var(--border-strong)',
    background: 'var(--surface-2)', fontSize: 15, fontWeight: 700, color: 'var(--text)',
    display: 'flex', alignItems: 'center', gap: 8,
  };
  var content = { padding: '16px 20px', overflow: 'auto', flex: 1, color: 'var(--text)' };
  var footer = {
    padding: '12px 20px', borderTop: '1px solid var(--border-strong)', background: 'var(--surface-2)',
    display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
  };
  var btnPrimary = {
    background: '#E8621A', color: '#fff', border: '1px solid #c94e12',
    padding: '8px 18px', borderRadius: 4, cursor: 'pointer', fontWeight: 700,
    fontSize: 13, minWidth: 90,
  };
  var btnSecondary = {
    background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)',
    padding: '8px 18px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
    minWidth: 90,
  };
  var pathBox = {
    background: 'var(--warning-soft)', border: '1px solid var(--warning)',
    color: 'var(--text)',
    padding: '10px 12px',
    borderRadius: 4, fontFamily: 'Consolas, monospace', fontSize: 12,
    wordBreak: 'break-all', marginTop: 6, marginBottom: 12,
  };
  var inputBase = {
    width: '100%', padding: '7px 10px',
    border: '1px solid var(--border-strong)',
    background: 'var(--surface)', color: 'var(--text)',
    borderRadius: 4, fontSize: 12, fontFamily: 'Consolas, monospace', outline: 'none',
  };
  var pathBarWrap = {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
    padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 4,
    background: 'var(--surface)', flexWrap: 'wrap',
  };
  var crumbBtn = {
    background: 'transparent', border: 'none', padding: '3px 6px',
    fontSize: 12, cursor: 'pointer', color: 'var(--accent)', borderRadius: 3,
  };
  var crumbSep = { color: 'var(--text-4)', fontSize: 12 };
  var itemRow = {
    padding: '7px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 10,
    transition: 'background .1s',
    color: 'var(--text)',
  };

  // ── Modo confirmar: propuesta ──────────────────────────────────────────
  var contenidoConfirmar = st.info ? _r('div', null,
    // Badge acreditado: informe con todos los ensayos bajo alcance OAA →
    // se guarda en subcarpeta "1. OAA" del drive.
    st.info.acreditado
      ? _r('div', { style: { padding: '8px 12px', background: 'var(--success-soft)', border: '1px solid var(--success)', borderRadius: 4, marginBottom: 10, fontSize: 12, color: 'var(--success)', fontWeight: 600 } },
          '🔒 Informe ACREDITADO — se guardará en carpeta ',
          _r('span', { style: { fontFamily: 'Consolas, monospace' } }, '1. OAA'))
      : _r('div', { style: { padding: '8px 12px', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 4, marginBottom: 10, fontSize: 12, color: 'var(--text-2)' } },
          'ℹ Informe con ensayos NO acreditados o mezclados — se guardará en la carpeta general.'),
    _r('div', { style: { marginBottom: 10, fontSize: 13 } },
      st.info.existe_cliente
        ? _r('span', { style: { color: 'var(--success)' } }, '✓ Cliente encontrado en el drive ',
            _r('span', { style: { color: 'var(--text-3)' } },
              '(' + Math.round((st.info.score || 0) * 100) + '% coincidencia)'))
        : _r('span', { style: { color: 'var(--warning)' } }, 'ⓘ Cliente no encontrado — se creará la carpeta automáticamente.')),
    _r('div', { style: { fontWeight: 700, fontSize: 12, color: 'var(--text)' } }, 'Carpeta destino:'),
    _r('div', { style: pathBox }, st.info.carpeta_sol),
    _r('div', { style: { fontSize: 11, color: 'var(--text-3)', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 2 } },
      !st.info.existe_cliente
        ? _r('span', { style: { color: 'var(--warning)' } }, '⓲ Se creará la carpeta del cliente + la carpeta SOL.')
        : st.info.existe_sol
          ? _r('span', { style: { color: 'var(--success)' } }, '✓ La carpeta SOL ya existe.')
          : _r('span', { style: { color: 'var(--warning)' } }, '⓲ La carpeta SOL se creará automáticamente.')),
    _r('div', { style: { fontWeight: 700, fontSize: 12, marginBottom: 4, color: 'var(--text)' } }, 'Nombre del archivo:'),
    _r('input', {
      style: Object.assign({}, inputBase, { marginBottom: 4 }),
      value: st.filename, onChange: function (e) { setSt(function (s) { return Object.assign({}, s, { filename: e.target.value }); }); },
    })
  ) : null;

  // ── Modo navegar: path bar + breadcrumb + lista ─────────────────────────
  var crumbs = breadcrumbs(st.navPath);
  var contenidoNavegar = _r('div', null,
    // Botones de navegación
    _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 } },
      _r('button', {
        style: Object.assign({}, btnSecondary, { padding: '5px 10px', fontSize: 12, minWidth: 0 }),
        disabled: !st.navParent,
        onClick: function () { if (st.navParent) irACarpeta(st.navParent); },
        title: 'Subir un nivel',
      }, '↑'),
      _r('button', {
        style: Object.assign({}, btnSecondary, { padding: '5px 10px', fontSize: 12, minWidth: 0 }),
        onClick: function () { if (st.info) irACarpeta(st.info.root_drive); },
        title: 'Ir a raíz del drive',
      }, '🏠'),
      _r('button', {
        style: Object.assign({}, btnSecondary, { padding: '5px 10px', fontSize: 12, minWidth: 0 }),
        onClick: function () { irACarpeta('G:\\'); },
        title: 'Unidad G:',
      }, 'G:\\'),
      _r('button', {
        style: Object.assign({}, btnSecondary, { padding: '5px 10px', fontSize: 12, minWidth: 0 }),
        onClick: function () { irACarpeta('C:\\'); },
        title: 'Unidad C:',
      }, 'C:\\')),

    // Path bar editable
    _r('div', { style: pathBarWrap },
      _r('span', { style: { color: 'var(--text-3)', fontSize: 13 } }, '📁'),
      _r('input', {
        style: Object.assign({}, inputBase, { border: 'none', padding: '3px 4px', flex: 1, minWidth: 200 }),
        value: st.navPathInput,
        placeholder: 'Escribí una ruta y presioná Enter…',
        onChange: function (e) { setSt(function (s) { return Object.assign({}, s, { navPathInput: e.target.value }); }); },
        onKeyDown: function (e) { if (e.key === 'Enter') irACarpeta(st.navPathInput); },
      }),
      _r('button', {
        style: Object.assign({}, btnSecondary, { padding: '3px 10px', fontSize: 11, minWidth: 0 }),
        onClick: function () { irACarpeta(st.navPathInput); },
      }, 'Ir')),

    // Breadcrumb
    crumbs.length > 0 ? _r('div', {
      style: { display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', marginBottom: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' },
    },
      crumbs.map(function (c, i) {
        return _r('span', { key: c.path, style: { display: 'inline-flex', alignItems: 'center' } },
          i > 0 ? _r('span', { style: crumbSep }, '›') : null,
          c.disabled
            ? _r('span', { style: Object.assign({}, crumbBtn, { color: 'var(--text-3)', cursor: 'default' }) }, c.label)
            : _r('button', {
                style: crumbBtn,
                onClick: function () { irACarpeta(c.path); },
              }, c.label));
      })
    ) : null,

    // Error de navegación (si el path no existe)
    st.navError
      ? _r('div', { style: { padding: 8, background: 'var(--danger-soft)', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 4, fontSize: 12, marginBottom: 8 } }, '⚠ ' + st.navError)
      : null,

    // Buscador para filtrar subcarpetas
    (function () {
      // Normalizar (sin acentos, minúsculas) para búsqueda insensible.
      function norm(s) {
        return String(s || '')
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .toLowerCase();
      }
      var q = norm(st.navFiltro);
      var items = st.navItems;
      var filtered = q
        ? items.filter(function (it) { return norm(it.nombre).indexOf(q) >= 0; })
        : items;
      return _r(React.Fragment, null,
        _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } },
          _r('span', { style: { fontSize: 12 } }, '🔍'),
          _r('input', {
            style: Object.assign({}, inputBase, { padding: '5px 8px', fontSize: 12 }),
            placeholder: 'Filtrar carpetas por nombre…',
            value: st.navFiltro,
            onChange: function (e) { setSt(function (s) { return Object.assign({}, s, { navFiltro: e.target.value }); }); },
          }),
          st.navFiltro
            ? _r('button', {
                style: Object.assign({}, btnSecondary, { padding: '4px 8px', fontSize: 11, minWidth: 0 }),
                onClick: function () { setSt(function (s) { return Object.assign({}, s, { navFiltro: '' }); }); },
                title: 'Limpiar filtro',
              }, '×')
            : null,
          _r('span', { style: { fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' } },
            filtered.length + ' de ' + items.length)),

        // Lista de subcarpetas (filtrada)
        _r('div', {
          style: { border: '1px solid var(--border-strong)', borderRadius: 4, maxHeight: 280, overflow: 'auto', marginBottom: 12, background: 'var(--surface)' },
        },
          items.length === 0
            ? _r('div', { style: { padding: 20, color: 'var(--text-4)', fontSize: 12, fontStyle: 'italic', textAlign: 'center' } },
                '(carpeta vacía)')
            : filtered.length === 0
            ? _r('div', { style: { padding: 20, color: 'var(--text-4)', fontSize: 12, fontStyle: 'italic', textAlign: 'center' } },
                'Sin coincidencias con "' + st.navFiltro + '"')
            : filtered.map(function (it) {
                return _r('div', {
                  key: it.path, style: itemRow,
                  onMouseEnter: function (e) { e.currentTarget.style.background = 'var(--surface-3)'; },
                  onMouseLeave: function (e) { e.currentTarget.style.background = 'transparent'; },
                  onDoubleClick: function () { irACarpeta(it.path); },
                  onClick: function () { irACarpeta(it.path); },
                },
                  _r('span', { style: { fontSize: 18, lineHeight: '1' } }, '📁'),
                  _r('span', { style: { flex: 1 } }, it.nombre));
              })));
    })(),

    _r('div', { style: { fontWeight: 700, fontSize: 12, marginBottom: 4, color: 'var(--text)' } }, 'Nombre del archivo:'),
    _r('input', {
      style: inputBase,
      value: st.filename, onChange: function (e) { setSt(function (s) { return Object.assign({}, s, { filename: e.target.value }); }); },
    })
  );

  // ── Footer ────────────────────────────────────────────────────────────
  var footerBtns = st.loading || st.error
    ? _r('button', { style: btnSecondary, onClick: onCancel }, 'Cerrar')
    : st.modo === 'confirmar'
      ? _r(React.Fragment, null,
          _r('button', { style: btnSecondary, onClick: onCancel }, 'Cancelar'),
          _r('button', {
            style: btnSecondary, onClick: function () {
              setSt(function (s) { return Object.assign({}, s, { modo: 'navegar' }); });
              fetchSubcarpetas(st.info.existe_cliente ? st.info.carpeta_cliente : st.info.root_drive);
            },
          }, 'Elegir otra carpeta'),
          _r('button', {
            style: btnPrimary, onClick: confirmarPropuesta,
            disabled: !st.info || !st.info.root_ok || !st.filename || !puedeGenerar,
          }, 'Guardar aquí'))
      : _r(React.Fragment, null,
          _r('button', { style: btnSecondary, onClick: onCancel }, 'Cancelar'),
          st.info && st.info.existe_cliente
            ? _r('button', {
                style: btnSecondary,
                onClick: function () { setSt(function (s) { return Object.assign({}, s, { modo: 'confirmar' }); }); },
              }, '← Volver')
            : null,
          _r('button', {
            style: btnPrimary, onClick: confirmarCarpetaActual, disabled: !st.filename || !puedeGenerar,
          }, 'Guardar aquí'));

  // Banner de equipos vencidos / por vencer. Se muestra siempre que hay hallazgos.
  var bannerEquipos = null;
  if (st.precheck) {
    var v = st.precheck.vencidos || [];
    var pv = st.precheck.por_vencer || [];
    if (v.length > 0 || pv.length > 0) {
      bannerEquipos = _r('div', {
        style: {
          padding: 10,
          background: v.length ? 'var(--danger-soft)' : 'var(--warning-soft)',
          border: '1px solid ' + (v.length ? 'var(--danger)' : 'var(--warning)'),
          borderRadius: 4, marginBottom: 12, fontSize: 12,
          color: v.length ? 'var(--danger)' : 'var(--warning)',
        }
      },
        _r('div', { style: { fontWeight: 700, marginBottom: 6 } },
          v.length
            ? '⛔ ' + v.length + ' equipo/patrón con calibración VENCIDA — no debería emitirse (requisito OAA).'
            : '⚠ ' + pv.length + ' equipo/patrón por vencer en <30 días.'),
        v.length ? _r('ul', { style: { margin: '4px 0 4px 18px', padding: 0 } },
          v.map(function (it) {
            return _r('li', { key: it.tag, style: { marginBottom: 2 } },
              _r('strong', null, it.tag),
              ' — ' + it.equipo + ' — venció ' + it.vencimiento + ' (' + Math.abs(it.dias) + ' días atrás)');
          })
        ) : null,
        pv.length ? _r('ul', { style: { margin: '4px 0 4px 18px', padding: 0, color: 'var(--warning)' } },
          pv.map(function (it) {
            return _r('li', { key: it.tag, style: { marginBottom: 2 } },
              _r('strong', null, it.tag),
              ' — ' + it.equipo + ' — vence ' + it.vencimiento + ' (en ' + it.dias + ' días)');
          })
        ) : null,
        v.length ? _r('label', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', color: 'var(--danger)', fontWeight: 600 } },
          _r('input', {
            type: 'checkbox',
            checked: st.forzarVencidos,
            onChange: function (e) { var ch = e.target.checked; setSt(function (s) { return Object.assign({}, s, { forzarVencidos: ch }); }); },
          }),
          'Emitir bajo mi responsabilidad (queda registrado en auditoría)'
        ) : null
      );
    }
  }

  return _r('div', {
    style: backdrop,
    onMouseDown: function (e) {
      if (e.target === e.currentTarget) { e.stopPropagation(); e.preventDefault(); onCancel(); }
    },
    onClick: function (e) { e.stopPropagation(); },
  },
    _r('div', { style: box, onMouseDown: function (e) { e.stopPropagation(); } },
      _r('div', { style: header }, '💾 Guardar informe — OT ', nroOt),
      _r('div', { style: content },
        bannerEquipos,
        st.loading
          ? _r('div', { style: { padding: '30px 0', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' } }, 'Detectando carpeta…')
          : st.error
          ? _r('div', { style: { padding: 12, background: 'var(--danger-soft)', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 4 } }, st.error)
          : st.modo === 'confirmar' ? contenidoConfirmar : contenidoNavegar
      ),
      _r('div', { style: footer }, footerBtns)
    )
  );
}

Object.assign(window, { GuardarCarpetaDialog: GuardarCarpetaDialog });
