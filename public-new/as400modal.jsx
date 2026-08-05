/* LABTESA — Modal generador AS400 (Cintolo).
 * Dos flujos:
 *   1) Ingresar N° de solicitud → botón "Buscar archivos" → lista de .xlsm con
 *      checkboxes → seleccionar cuáles usar → "Generar AS400".
 *   2) Subir manualmente hasta 10 .xlsm y generar directamente.
 * Si el destino existe, ofrece sobreescribir / renombrar / cancelar.
 */
'use strict';

var _rA = React.createElement;

function AS400Modal(props) {
  var nroSolPre = props.nroSolicitud || '';
  var _files = React.useState([]); var files = _files[0], setFiles = _files[1];
  var _sol   = React.useState(nroSolPre); var sol = _sol[0], setSol = _sol[1];
  var _busy  = React.useState(false); var busy = _busy[0], setBusy = _busy[1];
  var _err   = React.useState('');    var err = _err[0], setErr = _err[1];
  var _resu  = React.useState(null);  var resu = _resu[0], setResu = _resu[1];
  var _confl = React.useState(null);  var confl = _confl[0], setConfl = _confl[1]; // { destino, filename }
  // Lista de archivos encontrados en la carpeta de la solicitud + set de paths
  // seleccionados. Al buscar se marcan TODOS por default.
  var _listado = React.useState(null); var listado = _listado[0], setListado = _listado[1]; // { carpeta, informes: [{name,path,size,mtime}] }
  var _sel     = React.useState({});   var sel = _sel[0], setSel = _sel[1];
  var _buscando = React.useState(false); var buscando = _buscando[0], setBuscando = _buscando[1];
  var fileRef = React.useRef(null);

  function agregarArchivos(fileList) {
    var list = Array.from(fileList || []);
    var xlsm = list.filter(function (f) { return /\.xlsm$/i.test(f.name); });
    if (xlsm.length !== list.length) setErr('Solo se aceptan archivos .xlsm');
    var combinados = files.concat(xlsm).slice(0, 10);
    setFiles(combinados);
    setListado(null); // si hay uploads manuales, ignoramos el listado por solicitud
  }
  function quitarArchivo(i) {
    setFiles(files.filter(function (_, idx) { return idx !== i; }));
  }

  function buscarPorSolicitud() {
    var nro = String(sol || '').trim();
    if (!nro) { setErr('Ingresá el N° de solicitud primero.'); return; }
    setBuscando(true); setErr(''); setListado(null); setSel({});
    fetch('/api/as400/listar?nro_solicitud=' + encodeURIComponent(nro))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { setErr(r.d.error || 'Error buscando archivos'); return; }
        // Todos seleccionados por default.
        var m = {};
        (r.d.informes || []).forEach(function (i) { m[i.path] = true; });
        setListado(r.d);
        setSel(m);
      })
      .catch(function (e) { setErr(e.message); })
      .finally(function () { setBuscando(false); });
  }

  function toggleSel(path) {
    var next = Object.assign({}, sel);
    if (next[path]) delete next[path];
    else next[path] = true;
    setSel(next);
  }
  function selTodos() {
    var m = {};
    (listado && listado.informes || []).forEach(function (i) { m[i.path] = true; });
    setSel(m);
  }
  function selNinguno() { setSel({}); }

  function ejecutar(overwrite) {
    setBusy(true); setErr(''); setResu(null); setConfl(null);
    // Precedencia:
    //   1. Uploads manuales.
    //   2. Paths seleccionados del listado.
    //   3. nro_solicitud plain (usa TODOS los .xlsm de la carpeta — fallback).
    var pathsSel = Object.keys(sel);
    if (files.length > 0) {
      var fd = new FormData();
      files.forEach(function (f) { fd.append('informes', f); });
      if (overwrite) fd.append('overwrite', overwrite);
      _post(fd, false);
    } else if (listado && pathsSel.length > 0) {
      var body = { informes: pathsSel };
      if (overwrite) body.overwrite = overwrite;
      _post(body, true);
    } else if (sol) {
      var body2 = { nro_solicitud: sol };
      if (overwrite) body2.overwrite = overwrite;
      _post(body2, true);
    } else {
      setErr('Subí al menos un .xlsm o ingresá el N° de solicitud.');
      setBusy(false);
      return;
    }
  }
  function _post(payload, isJson) {
    var opts = isJson
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      : { method: 'POST', body: payload };
    fetch('/api/as400/generar', opts)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (r) {
        if (r.status === 409 && r.d && r.d.code === 'DESTINO_EXISTE') {
          setConfl({ destino: r.d.destino, filename: r.d.filename });
          return;
        }
        if (!r.ok) { setErr(r.d.error || 'Error'); return; }
        setResu(r.d);
      })
      .catch(function (e) { setErr(e.message); })
      .finally(function () { setBusy(false); });
  }

  function fmtBytes(n) {
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }
  function fmtFecha(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var pad = function (x) { return String(x).padStart(2, '0'); };
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }

  var seleccionadosCount = Object.keys(sel).length;
  var totalCount = listado ? (listado.informes || []).length : 0;

  var S = {
    backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box:      { background: 'var(--surface, #fff)', borderRadius: 8, width: 'min(90vw, 680px)',
                maxHeight: '92vh', overflowY: 'auto', padding: 20 },
    dropzone: { border: '2px dashed var(--border-strong, #b7b7bd)', borderRadius: 6, padding: 20, textAlign: 'center',
                cursor: 'pointer', background: 'var(--surface-2, #fafafa)', transition: 'border .1s, background .1s' },
    fileRow:  { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                border: '1px solid var(--border, #eee)', borderRadius: 4, background: 'var(--surface, #fff)',
                marginBottom: 4, fontSize: 12 },
    btnDel:   { border: 'none', background: 'transparent', cursor: 'pointer', color: '#b02a2a', fontSize: 14 },
    subhead:  { fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.4px',
                textTransform: 'uppercase', marginBottom: 6 },
    listRow:  { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px',
                borderBottom: '1px solid var(--border, #eee)', fontSize: 11.5, cursor: 'pointer',
                transition: 'background .1s' },
  };

  return _rA('div', { style: S.backdrop, onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
    _rA('div', { style: S.box },
      _rA('h3', { style: { margin: 0, marginBottom: 6 } }, '📊 Generar Excel AS400 — Cintolo'),
      _rA('p', { style: { fontSize: 12, color: 'var(--text-3)', margin: '0 0 14px 0' } },
        'Buscá los .xlsm de una solicitud y elegí cuáles usar, o subilos manualmente.'),

      // ── Zona 1: N° solicitud + botón Buscar ───────────────────────────
      _rA('div', { style: { marginBottom: 14 } },
        _rA('div', { style: S.subhead }, 'Buscar por N° de solicitud'),
        _rA('div', { style: { display: 'flex', gap: 8, alignItems: 'stretch' } },
          _rA('input', { type: 'text', className: 'input', value: sol,
            style: { flex: 1 },
            placeholder: 'Ej: 38346',
            onChange: function (e) { setSol(e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') { e.preventDefault(); buscarPorSolicitud(); } },
          }),
          _rA('button', { className: 'btn btn-primary btn-sm',
            style: { whiteSpace: 'nowrap' },
            onClick: buscarPorSolicitud, disabled: buscando || !sol },
            buscando ? 'Buscando…' : '🔍 Buscar archivos')),
        _rA('div', { style: { fontSize: 10, color: 'var(--text-3)', marginTop: 4 } },
          'Se busca en G:\\...\\CINTOLO\\SOL <N>\\')),

      // ── Zona 1b: Listado con checkboxes (aparece tras "Buscar") ────────
      listado ? _rA('div', {
        style: { marginBottom: 14, border: '1px solid var(--border-strong, #d0d7de)',
          borderRadius: 6, overflow: 'hidden', background: 'var(--surface, #fff)' }
      },
        _rA('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          background: 'var(--surface-2, #f5f7fa)', borderBottom: '1px solid var(--border, #e3e5ea)',
          fontSize: 11 } },
          _rA('span', { style: { fontWeight: 700 } },
            totalCount + ' archivo' + (totalCount === 1 ? '' : 's') + ' encontrado' + (totalCount === 1 ? '' : 's')),
          _rA('span', { style: { color: 'var(--text-3)' } },
            '· ' + seleccionadosCount + ' seleccionado' + (seleccionadosCount === 1 ? '' : 's')),
          _rA('span', { style: { flex: 1 } }),
          _rA('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 10 },
            onClick: selTodos, disabled: seleccionadosCount === totalCount },
            'Todos'),
          _rA('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 10 },
            onClick: selNinguno, disabled: seleccionadosCount === 0 },
            'Ninguno'),
          _rA('button', { className: 'btn btn-ghost btn-sm', style: { fontSize: 10, color: '#b02a2a' },
            onClick: function () { setListado(null); setSel({}); } },
            '✕ Limpiar')),
        _rA('div', { style: { padding: 4, background: 'var(--surface, #fff)' } },
          _rA('div', { style: { fontSize: 9.5, color: 'var(--text-3)', padding: '4px 10px 0',
            fontFamily: 'ui-monospace, Consolas, monospace', wordBreak: 'break-all' } },
            listado.carpeta),
          (listado.informes || []).map(function (i, idx) {
            var checked = !!sel[i.path];
            return _rA('label', { key: i.path,
              style: Object.assign({}, S.listRow, {
                background: checked ? 'var(--accent-soft, #e7f0ff)' : 'transparent',
              }),
              onMouseEnter: function (e) { if (!checked) e.currentTarget.style.background = 'var(--surface-2, #f5f7fa)'; },
              onMouseLeave: function (e) { if (!checked) e.currentTarget.style.background = 'transparent'; },
            },
              _rA('input', { type: 'checkbox', checked: checked,
                onChange: function () { toggleSel(i.path); } }),
              _rA('span', { style: {
                fontWeight: 600, color: checked ? 'var(--accent, #0550ae)' : 'var(--text)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              } }, i.name),
              _rA('span', { style: { color: 'var(--text-3)', fontSize: 10, whiteSpace: 'nowrap' } },
                fmtBytes(i.size)),
              _rA('span', { style: { color: 'var(--text-3)', fontSize: 10, whiteSpace: 'nowrap' } },
                fmtFecha(i.mtime))
            );
          })
        )
      ) : null,

      // ── Zona 2: subir archivos manualmente ────────────────────────────
      _rA('div', { style: { marginBottom: 12 } },
        _rA('div', { style: S.subhead }, 'O subí los .xlsm manualmente (máx. 10)'),
        _rA('div', {
          style: S.dropzone,
          onClick: function () { if (fileRef.current) fileRef.current.click(); },
          onDragOver: function (e) { e.preventDefault(); e.currentTarget.style.background = 'var(--surface-3, #eef1f4)'; },
          onDragLeave: function (e) { e.preventDefault(); e.currentTarget.style.background = 'var(--surface-2, #fafafa)'; },
          onDrop: function (e) {
            e.preventDefault();
            e.currentTarget.style.background = 'var(--surface-2, #fafafa)';
            agregarArchivos(e.dataTransfer.files);
          }
        },
          _rA('div', { style: { fontSize: 12, fontWeight: 600 } },
            files.length === 0 ? 'Arrastrá acá los .xlsm o hacé clic para seleccionar' : files.length + ' archivo(s) cargados'),
          _rA('div', { style: { fontSize: 10, color: 'var(--text-3)', marginTop: 4 } }, 'Se aceptan hasta 10 archivos .xlsm')),
        _rA('input', {
          ref: fileRef, type: 'file', accept: '.xlsm', multiple: true, hidden: true,
          onChange: function (e) { agregarArchivos(e.target.files); e.target.value = ''; }
        })
      ),

      // ── Lista de archivos cargados manualmente ────────────────────────
      files.length > 0 ? _rA('div', { style: { marginBottom: 12 } },
        files.map(function (f, i) {
          return _rA('div', { key: i, style: S.fileRow },
            _rA('span', { style: { fontWeight: 600 } }, (i + 1) + '.'),
            _rA('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name),
            _rA('span', { style: { color: 'var(--text-3)', fontSize: 10 } }, fmtBytes(f.size)),
            _rA('button', { style: S.btnDel, onClick: function () { quitarArchivo(i); } }, '🗑')
          );
        })
      ) : null,

      err ? _rA('div', { style: { color: '#b02a2a', fontSize: 12, marginBottom: 10, padding: 8,
        background: '#ffebe9', border: '1px solid #ff8182', borderRadius: 4 } }, '⚠ ' + err) : null,

      // ── Conflicto: destino existe → preguntar qué hacer ──────────────
      confl ? _rA('div', {
        style: { background: '#fff8dc', border: '1px solid #e0c168', borderRadius: 4, padding: 12, marginBottom: 12, fontSize: 12 }
      },
        _rA('div', { style: { fontWeight: 700, color: '#7a5a1a', marginBottom: 6 } },
          '⚠ El archivo destino ya existe:'),
        _rA('div', { style: { fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 8 } }, confl.destino),
        _rA('div', { style: { fontSize: 11, marginBottom: 8 } }, '¿Qué querés hacer?'),
        _rA('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
          _rA('button', { className: 'btn btn-soft btn-sm',
            onClick: function () { ejecutar('renombrar'); }, disabled: busy },
            '📝 Guardar con otro nombre (2)'),
          _rA('button', { className: 'btn btn-default btn-sm',
            style: { background: '#b02a2a', color: '#fff', border: '1px solid #b02a2a' },
            onClick: function () { ejecutar('sobreescribir'); }, disabled: busy },
            '⚠ Sobreescribir'),
          _rA('button', { className: 'btn btn-ghost btn-sm',
            onClick: function () { setConfl(null); }, disabled: busy },
            'Cancelar'))
      ) : null,

      // ── Resultado ────────────────────────────────────────────────────
      resu ? _rA('div', {
        style: { background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 4, padding: 12, marginBottom: 12, fontSize: 12 }
      },
        _rA('div', { style: { fontWeight: 700, color: '#0f7d3a', marginBottom: 6 } },
          '✓ AS400 generado correctamente'),
        _rA('div', { style: { fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 8 } }, resu.ruta),
        resu.informes && resu.informes.length ? _rA('div', { style: { fontSize: 11, color: 'var(--text-3)' } },
          resu.informes.length + ' informe(s) procesado(s): ' +
          resu.informes.map(function (i) { return 'OC ' + (i.oc || '?'); }).join(', ')
        ) : null
      ) : null,

      // ── Advertencias de alargamiento (2+ decimales) ──────────────────
      resu && Array.isArray(resu.advertencias_alargamiento) && resu.advertencias_alargamiento.length > 0
        ? _rA('div', {
            style: { background: '#fffbe6', border: '1px solid #f0c000', borderRadius: 4, padding: 12, marginBottom: 12, fontSize: 12 }
          },
            _rA('div', { style: { fontWeight: 700, color: '#8a6100', marginBottom: 6 } },
              '⚠ Revisar Alargamiento — valores con 2+ decimales'),
            _rA('div', { style: { fontSize: 11, color: '#7a5a1a', marginBottom: 8 } },
              'Un alargamiento con 2 o más decimales suele indicar un dato mal cargado en el fuente. Ya lo redondeamos a 1 decimal en el .xlsx, pero conviene revisar manualmente el fuente:'),
            _rA('ul', { style: { margin: 0, paddingLeft: 18, fontSize: 11, color: '#5a4008' } },
              resu.advertencias_alargamiento.map(function (a, i) {
                var origen = a.valor + ' %';
                var final = a.redondeado ? (' → ' + a.redondeado + ' %') : '';
                return _rA('li', { key: i },
                  'Bloque ' + a.bloque + (a.oc ? ' (OC ' + a.oc + ')' : '') + ' — ' + a.campo + ': ' + origen + final);
              })
            )
          )
        : null,

      // ── Footer ───────────────────────────────────────────────────────
      _rA('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 } },
        _rA('button', { className: 'btn btn-ghost btn-sm', onClick: props.onClose, disabled: busy },
          resu ? 'Cerrar' : 'Cancelar'),
        !resu && !confl ? _rA('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { ejecutar(null); },
          disabled: busy || (files.length === 0 && !sol && seleccionadosCount === 0),
        }, busy
          ? 'Generando…'
          : (listado
              ? ('📊 Generar AS400 con ' + seleccionadosCount + ' archivo' + (seleccionadosCount === 1 ? '' : 's'))
              : '📊 Generar AS400')) : null
      )
    )
  );
}

window.AS400Modal = AS400Modal;
