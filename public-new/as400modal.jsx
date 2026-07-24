/* LABTESA — Modal generador AS400 (Cintolo).
 * Permite al usuario subir manualmente los .xlsm fuente y generar el Excel
 * consolidado. Si el destino existe, ofrece sobreescribir / renombrar / cancelar.
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
  var fileRef = React.useRef(null);

  function agregarArchivos(fileList) {
    var list = Array.from(fileList || []);
    var xlsm = list.filter(function (f) { return /\.xlsm$/i.test(f.name); });
    if (xlsm.length !== list.length) setErr('Solo se aceptan archivos .xlsm');
    var combinados = files.concat(xlsm).slice(0, 10);
    setFiles(combinados);
  }

  function quitarArchivo(i) {
    setFiles(files.filter(function (_, idx) { return idx !== i; }));
  }

  function ejecutar(overwrite) {
    setBusy(true); setErr(''); setResu(null); setConfl(null);
    var fd = new FormData();
    if (files.length > 0) {
      files.forEach(function (f) { fd.append('informes', f); });
    } else if (sol) {
      fd.append('nro_solicitud', sol);
    } else {
      setErr('Subí al menos un .xlsm o ingresá el N° de solicitud.');
      setBusy(false);
      return;
    }
    if (overwrite) fd.append('overwrite', overwrite);
    fetch('/api/as400/generar', { method: 'POST', body: fd })
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

  var S = {
    backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box:      { background: '#fff', borderRadius: 8, width: 'min(90vw, 640px)', padding: 20 },
    dropzone: { border: '2px dashed #b7b7bd', borderRadius: 6, padding: 24, textAlign: 'center',
                cursor: 'pointer', background: '#fafafa', transition: 'border .1s, background .1s' },
    fileRow:  { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                border: '1px solid #eee', borderRadius: 4, background: '#fff', marginBottom: 4, fontSize: 12 },
    btnDel:   { border: 'none', background: 'transparent', cursor: 'pointer', color: '#b02a2a', fontSize: 14 },
  };

  return _rA('div', { style: S.backdrop, onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); } },
    _rA('div', { style: S.box },
      _rA('h3', { style: { margin: 0, marginBottom: 6 } }, '📊 Generar Excel AS400 — Cintolo'),
      _rA('p', { style: { fontSize: 12, color: 'var(--text-3)', margin: '0 0 14px 0' } },
        'Subí hasta 10 informes .xlsm o ingresá el N° de solicitud para buscar automáticamente en el drive.'),

      // ── Zona 1: N° solicitud (si viene del banner Cintolo, prellenado) ──
      _rA('div', { style: { marginBottom: 12 } },
        _rA('label', { style: { fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 } },
          'N° de solicitud (busca los .xlsm en G:\\...\\CINTOLO\\SOL <N>\\)'),
        _rA('input', { type: 'text', className: 'input', value: sol,
          placeholder: 'Ej: 0000212',
          onChange: function (e) { setSol(e.target.value); } })
      ),

      // ── Zona 2: subir archivos manualmente ──
      _rA('div', { style: { marginBottom: 12 } },
        _rA('label', { style: { fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 3 } },
          'O subí los .xlsm manualmente (máx. 10)'),
        _rA('div', {
          style: S.dropzone,
          onClick: function () { if (fileRef.current) fileRef.current.click(); },
          onDragOver: function (e) { e.preventDefault(); e.currentTarget.style.background = '#eef1f4'; },
          onDragLeave: function (e) { e.currentTarget.style.background = '#fafafa'; },
          onDrop: function (e) { e.preventDefault(); e.currentTarget.style.background = '#fafafa'; agregarArchivos(e.dataTransfer.files); }
        },
          _rA('div', { style: { fontSize: 13, fontWeight: 600, color: '#333' } },
            files.length === 0 ? 'Arrastrá acá los .xlsm o hacé clic para seleccionar' : files.length + ' archivo(s) cargados'),
          _rA('div', { style: { fontSize: 10, color: 'var(--text-3)', marginTop: 4 } }, 'Se aceptan hasta 10 archivos .xlsm')),
        _rA('input', {
          ref: fileRef, type: 'file', accept: '.xlsm', multiple: true, hidden: true,
          onChange: function (e) { agregarArchivos(e.target.files); e.target.value = ''; }
        })
      ),

      // ── Lista de archivos cargados ──
      files.length > 0 ? _rA('div', { style: { marginBottom: 12 } },
        files.map(function (f, i) {
          return _rA('div', { key: i, style: S.fileRow },
            _rA('span', { style: { fontWeight: 600 } }, (i + 1) + '.'),
            _rA('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name),
            _rA('span', { style: { color: 'var(--text-3)', fontSize: 10 } }, (f.size / 1024).toFixed(0) + ' KB'),
            _rA('button', { style: S.btnDel, onClick: function () { quitarArchivo(i); } }, '🗑')
          );
        })
      ) : null,

      err ? _rA('div', { style: { color: '#b02a2a', fontSize: 12, marginBottom: 10, padding: 8,
        background: '#ffebe9', border: '1px solid #ff8182', borderRadius: 4 } }, '⚠ ' + err) : null,

      // ── Conflicto: destino existe → preguntar qué hacer ──
      confl ? _rA('div', {
        style: { background: '#fff8dc', border: '1px solid #e0c168', borderRadius: 4, padding: 12, marginBottom: 12, fontSize: 12 }
      },
        _rA('div', { style: { fontWeight: 700, color: '#7a5a1a', marginBottom: 6 } },
          '⚠ El archivo destino ya existe:'),
        _rA('div', { style: { fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 8 } }, confl.destino),
        _rA('div', { style: { fontSize: 11, marginBottom: 8 } },
          '¿Qué querés hacer?'),
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
            'Cancelar')
        )
      ) : null,

      // ── Resultado ──
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

      // ── Advertencias de alargamiento (2+ decimales) — revisar manualmente ──
      resu && Array.isArray(resu.advertencias_alargamiento) && resu.advertencias_alargamiento.length > 0
        ? _rA('div', {
            style: { background: '#fffbe6', border: '1px solid #f0c000', borderRadius: 4, padding: 12, marginBottom: 12, fontSize: 12 }
          },
            _rA('div', { style: { fontWeight: 700, color: '#8a6100', marginBottom: 6 } },
              '⚠ Revisar Alargamiento — valores con 2+ decimales'),
            _rA('div', { style: { fontSize: 11, color: '#7a5a1a', marginBottom: 8 } },
              'Un alargamiento con 2 o más decimales suele indicar un dato mal cargado en el fuente. Revisá manualmente los siguientes bloques:'),
            _rA('ul', { style: { margin: 0, paddingLeft: 18, fontSize: 11, color: '#5a4008' } },
              resu.advertencias_alargamiento.map(function (a, i) {
                return _rA('li', { key: i },
                  'Bloque ' + a.bloque + (a.oc ? ' (OC ' + a.oc + ')' : '') + ' — ' + a.campo + ': ' + a.valor + ' %');
              })
            )
          )
        : null,

      // ── Footer ──
      _rA('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 } },
        _rA('button', { className: 'btn btn-ghost btn-sm', onClick: props.onClose, disabled: busy },
          resu ? 'Cerrar' : 'Cancelar'),
        !resu && !confl ? _rA('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { ejecutar(null); },
          disabled: busy || (files.length === 0 && !sol),
        }, busy ? 'Generando…' : '📊 Generar AS400') : null
      )
    )
  );
}

window.AS400Modal = AS400Modal;
