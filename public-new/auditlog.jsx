/* LABTESA — vista de auditoría (audit trail) */

function fmtFecha(s) {
  if (!s) return '';
  // El backend devuelve UTC ('YYYY-MM-DD HH:MM:SS'); reinterpretamos como hora local.
  var d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(s);
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear()
       + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function iconoDeAudit(item) {
  if (item.tipo === 'firma')     return item.accion === 'firmar' ? 'lock' : 'unlock';
  if (item.tipo === 'informe')   return 'file';
  if (item.tipo === 'historial') return 'edit';
  if (item.tipo === 'error')     return 'alertTri';
  return item.icon || 'inbox';
}

function colorDeAudit(item) {
  if (item.tipo === 'firma')     return item.accion === 'firmar' ? '#0f7d3a' : '#c04a00';
  if (item.tipo === 'informe')   return '#3b52c4';
  if (item.tipo === 'historial') return item.accion === 'delete' ? '#b02a2a' : '#7a5a1a';
  if (item.tipo === 'error')     return '#b02a2a';
  return '#4a5568';
}

function chipTipo(tipo) {
  var map = { evento: 'Evento', historial: 'Historial', firma: 'Firma', informe: 'Informe', error: 'Error' };
  return map[tipo] || tipo;
}

// Normaliza rutas UNC a letra local. El servidor mapea
//   \\192.168.1.200\Labtesa1\...    →    G:\...
// Además puede haber variaciones (barras normales o dobles). La regex
// captura el prefijo UNC (con \\ o //) y lo reemplaza por G:\.
function normalizarRutaLocal(ruta) {
  if (!ruta) return ruta;
  return String(ruta)
    .replace(/^[\\\/]{2}192\.168\.1\.200[\\\/]+Labtesa1[\\\/]+/i, 'G:\\')
    .replace(/\//g, '\\');
}

// Abre la carpeta usando el protocol handler custom `labopen://` (requiere
// instalar el .reg una vez por PC — ver /api/labopen-handler.reg).
// Si el handler no está instalado el browser muestra un prompt "elegir app".
// Además copiamos la ruta al portapapeles como respaldo automático.
function abrirCarpetaInforme(item) {
  if (!item || !item.ruta) return;
  var rutaLocal = normalizarRutaLocal(item.ruta);
  var idxLastSep = Math.max(rutaLocal.lastIndexOf('\\'), rutaLocal.lastIndexOf('/'));
  var carpeta = idxLastSep >= 0 ? rutaLocal.slice(0, idxLastSep) : rutaLocal;
  abrirConHandler(carpeta);
}

// Renderiza el botón "Abrir carpeta" como <a href="labopen://..."> real.
// El handler labopen:// está instalado en cada PC cliente y ejecuta un
// PowerShell externo (%LOCALAPPDATA%\LabInformes\labopen-handler.ps1) que
// abre Explorer directo en la carpeta correcta.
function renderBotonAbrirCarpeta(item) {
  var rutaLocal = normalizarRutaLocal(item.ruta);
  var idx = Math.max(rutaLocal.lastIndexOf('\\'), rutaLocal.lastIndexOf('/'));
  var carpeta = idx >= 0 ? rutaLocal.slice(0, idx) : rutaLocal;
  // Encodear `:` como %3A para que Chrome no lo remueva del path del URI
  // (Chrome lo interpretaba como parte del scheme y se comía la letra).
  var handlerUrl = 'labopen://' + carpeta.replace(/\\/g, '/').replace(/:/g, '%3A');
  return React.createElement('a', {
    className: 'btn btn-default btn-xs',
    href: handlerUrl,
    style: { textDecoration: 'none' },
    title: 'Abrir la carpeta en Explorer (' + carpeta + ')',
  }, 'Abrir carpeta');
}

// LEGACY (aún referenciada desde otros lugares).
function abrirConHandler(ruta) {
  var handlerOk = false;
  try { handlerOk = localStorage.getItem('labopenInstalled') === '1'; } catch (_) {}
  // Siempre disparar labopen:// (silencioso si el handler no está registrado).
  var url = 'labopen://' + ruta.replace(/\\/g, '/');
  var iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  setTimeout(function () { try { document.body.removeChild(iframe); } catch (_) {} }, 500);
  if (handlerOk) {
    // No descargar .url ni tocar clipboard — el handler ya abre Explorer.
    return;
  }
  // Fallback: descarga .url + clipboard.
  descargarUrlShortcut(ruta);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ruta).catch(function () {});
  }
}

// Genera un archivo .url en memoria y dispara la descarga. Windows lo
// reconoce como shortcut; al abrirlo, Explorer navega a la carpeta.
function descargarUrlShortcut(ruta) {
  var rutaFile = 'file:///' + ruta.replace(/\\/g, '/');
  var contenido = '[InternetShortcut]\r\nURL=' + rutaFile + '\r\n';
  // Nombre corto legible: última parte del path.
  var last = ruta.split(/[\\/]/).filter(Boolean).pop() || 'carpeta';
  var nombre = 'Abrir_' + last.replace(/[^A-Za-z0-9 _\-]/g, '_').slice(0, 40) + '.url';
  var blob = new Blob([contenido], { type: 'application/internet-shortcut' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (_) {}
  }, 500);
  if (window._labToastOk) {
    window._labToastOk('Descargado "' + nombre + '". Hacé doble click en el archivo para abrir la carpeta.');
  }
}

// Copia al clipboard con fallback (execCommand) para browsers que no soportan
// navigator.clipboard. Muestra toast o alert si falla.
function copiarRutaAlPortapapeles(texto) {
  function ok() {
    if (window._labToastOk) {
      window._labToastOk('Ruta copiada — pegala en el Explorador con Ctrl+L y Ctrl+V');
    } else {
      window.alert('Ruta copiada al portapapeles:\n\n' + texto + '\n\nAbrí el Explorador (Win+E), Ctrl+L y Ctrl+V.');
    }
  }
  function falloDefinitivo() {
    // Último recurso: prompt para que el user copie manual.
    window.prompt('Copiá la ruta con Ctrl+C:', texto);
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, function () {
        // Fallback execCommand
        if (!intentarExecCommand(texto)) falloDefinitivo();
        else ok();
      });
      return;
    }
  } catch (_) {}
  if (intentarExecCommand(texto)) ok();
  else falloDefinitivo();
}

function intentarExecCommand(texto) {
  try {
    var ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) { return false; }
}

function AuditLogScreen(props) {
  var _rows = React.useState([]);       var rows       = _rows[0], setRows       = _rows[1];
  var _loading = React.useState(true);  var loading    = _loading[0], setLoading  = _loading[1];
  var _filtroNroOt = React.useState(''); var filtroNroOt = _filtroNroOt[0], setFiltroNroOt = _filtroNroOt[1];
  var _filtroTipo = React.useState('');  var filtroTipo = _filtroTipo[0], setFiltroTipo = _filtroTipo[1];
  // Filtro por mes YYYY-MM. Se inicializa desde ?mes= en el hash cuando el usuario
  // clickea una barra del gráfico "Informes emitidos por mes".
  var _filtroMes = React.useState(props && props.mesInicial ? props.mesInicial : '');
  var filtroMes = _filtroMes[0], setFiltroMes = _filtroMes[1];
  var _q = React.useState('');           var q = _q[0], setQ = _q[1];
  var _diff = React.useState(null);      var diffOpen = _diff[0], setDiffOpen = _diff[1];

  function cargar() {
    setLoading(true);
    var params = new URLSearchParams();
    if (filtroNroOt) params.set('nro_ot', filtroNroOt);
    if (filtroTipo)  params.set('tipo', filtroTipo);
    params.set('limit', '1000');
    fetch('/api/audit-log?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) { setRows(Array.isArray(data) ? data : []); })
      .catch(function () { setRows([]); })
      .finally(function () { setLoading(false); });
  }

  React.useEffect(cargar, [filtroNroOt, filtroTipo]);

  var filtradas = rows.filter(function (r) {
    if (filtroMes && String(r.fecha || '').slice(0, 7) !== filtroMes) return false;
    if (!q) return true;
    var s = q.toLowerCase();
    return (r.texto || '').toLowerCase().indexOf(s) >= 0
        || String(r.nro_ot || '').toLowerCase().indexOf(s) >= 0;
  });

  var _reset = React.useState(false); var resetOpen = _reset[0], setResetOpen = _reset[1];

  return React.createElement('div', { className: 'page-wide' },
    React.createElement('div', { className: 'page-head', style: { marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      React.createElement('div', null,
        React.createElement('h1', { className: 'page-title' }, 'Auditoría'),
        React.createElement('p', { className: 'page-sub' },
          'Historial completo del sistema: cambios en ensayos, firmas, informes emitidos y eventos.')
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8 } },
        React.createElement('a', {
          className: 'btn btn-ghost btn-sm',
          href: '/api/instalar-abrir-carpeta.ps1',
          download: 'instalar-abrir-carpeta.ps1',
          style: { textDecoration: 'none' },
          title: 'Descargar el instalador (una vez por PC cliente). Bajá el .ps1, click derecho → "Ejecutar con PowerShell", aceptá UAC. Después "Abrir carpeta" abre Explorer directo sin prompts.',
        }, '⬇ Instalar "Abrir carpeta"'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          style: { color: '#b02a2a', border: '1px solid #b02a2a44' },
          onClick: function () { setResetOpen(true); }
        }, '⚠ Reset datos de prueba')
      )
    ),

    resetOpen ? React.createElement(ResetDatosModal, {
      onClose: function () { setResetOpen(false); },
      onDone: function () { setResetOpen(false); cargar(); if (window.LabStore && window.LabStore.init) window.LabStore.init(); }
    }) : null,

    // Filtros
    React.createElement('div', {
      style: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }
    },
      React.createElement('input', {
        placeholder: 'Filtrar por N° OT…',
        value: filtroNroOt,
        onChange: function (e) { setFiltroNroOt(e.target.value); },
        className: 'input',
        style: { width: 160 }
      }),
      React.createElement('select', {
        value: filtroTipo,
        onChange: function (e) { setFiltroTipo(e.target.value); },
        className: 'input',
        style: { width: 180 }
      },
        React.createElement('option', { value: '' }, 'Todos los tipos'),
        React.createElement('option', { value: 'evento' }, 'Eventos'),
        React.createElement('option', { value: 'historial' }, 'Historial de ensayos'),
        React.createElement('option', { value: 'firma' }, 'Firmas'),
        React.createElement('option', { value: 'informe' }, 'Informes emitidos'),
        React.createElement('option', { value: 'error' }, 'Errores del sistema')
      ),
      React.createElement('input', {
        placeholder: 'Buscar texto…',
        value: q,
        onChange: function (e) { setQ(e.target.value); },
        className: 'input',
        style: { flex: 1, minWidth: 200 }
      }),
      React.createElement('button', {
        className: 'btn btn-default btn-sm',
        onClick: cargar
      }, 'Actualizar'),
      filtroMes ? React.createElement('span', {
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: '#eef2ff', color: '#4361ee', fontSize: 12, fontWeight: 600,
        },
      },
        'Mes: ' + filtroMes,
        React.createElement('button', {
          onClick: function () { setFiltroMes(''); location.hash = '#/auditoria'; },
          title: 'Quitar filtro por mes',
          style: {
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#4361ee', fontSize: 14, lineHeight: 1, padding: 0,
          },
        }, '×')
      ) : null,
      React.createElement('span', { style: { fontSize: 12, color: 'var(--text-3)' } },
        filtradas.length + ' de ' + rows.length + ' registros')
    ),

    // Lista
    loading
      ? React.createElement('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-3)' } }, 'Cargando…')
      : filtradas.length === 0
        ? React.createElement('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-3)' } }, 'Sin registros.')
        : React.createElement('div', { className: 'card', style: { padding: 0 } },
            React.createElement('table', { className: 'data-table', style: { width: '100%' } },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', { style: { width: 130 } }, 'Fecha'),
                  React.createElement('th', { style: { width: 110 } }, 'Tipo'),
                  React.createElement('th', { style: { width: 100 } }, 'N° OT'),
                  React.createElement('th', null, 'Descripción'),
                  React.createElement('th', { style: { width: 320 } }, 'Ruta'),
                  React.createElement('th', { style: { width: 130 } }, '')
                )
              ),
              React.createElement('tbody', null,
                filtradas.map(function (item, idx) {
                  var color = colorDeAudit(item);
                  return React.createElement('tr', { key: item.tipo + '-' + item.id + '-' + idx },
                    React.createElement('td', { style: { fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' } },
                      fmtFecha(item.fecha)),
                    React.createElement('td', null,
                      React.createElement('span', {
                        style: {
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '3px 8px', borderRadius: 999,
                          background: color + '18', color: color,
                          fontSize: 11, fontWeight: 600,
                        }
                      },
                        typeof Icon === 'function'
                          ? React.createElement(Icon, { name: iconoDeAudit(item), size: 12 })
                          : null,
                        chipTipo(item.tipo)
                      )
                    ),
                    React.createElement('td', null,
                      item.nro_ot
                        ? React.createElement('a', { href: '#/ot/' + item.nro_ot, style: { color: 'var(--accent)', fontWeight: 500 } }, item.nro_ot)
                        : '—'
                    ),
                    React.createElement('td', { style: { fontSize: 13 } },
                      item.texto,
                      item.motivo
                        ? React.createElement('div', { style: { fontSize: 11, color: 'var(--text-3)', marginTop: 2 } },
                            'Motivo: ' + item.motivo)
                        : null,
                      item.sha256
                        ? React.createElement('div', { style: {
                            fontSize: 10, color: 'var(--text-3)', marginTop: 2,
                            fontFamily: 'ui-monospace, monospace',
                          } }, 'SHA-256: ' + item.sha256)
                        : null,
                      item.stack
                        ? React.createElement('details', { style: { fontSize: 10, marginTop: 4 } },
                            React.createElement('summary', { style: { cursor: 'pointer', color: '#b02a2a' } }, 'Ver stack trace'),
                            React.createElement('pre', { style: {
                              background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 4,
                              padding: 8, fontSize: 10, overflow: 'auto', maxHeight: 200,
                              margin: '4px 0 0 0', whiteSpace: 'pre-wrap',
                            } }, item.stack)
                          )
                        : null
                    ),
                    // Columna Ruta (solo para informes emitidos, resto vacío)
                    React.createElement('td', {
                      style: {
                        fontSize: 11, fontFamily: 'ui-monospace, monospace',
                        color: 'var(--text-2)', wordBreak: 'break-all',
                        padding: '6px 8px',
                      },
                      title: item.ruta ? normalizarRutaLocal(item.ruta) : '',
                    }, item.ruta ? normalizarRutaLocal(item.ruta) : '—'),
                    React.createElement('td', null,
                      item.tipo === 'historial'
                        ? React.createElement('button', {
                            className: 'btn btn-default btn-xs',
                            onClick: function () { verDiffHistorial(item, setDiffOpen); }
                          }, 'Ver cambio')
                        : item.tipo === 'informe' && item.ruta
                          ? renderBotonAbrirCarpeta(item)
                          : null
                    )
                  );
                })
              )
            )
          ),

    diffOpen ? React.createElement(DiffModal, { data: diffOpen, onClose: function () { setDiffOpen(null); } }) : null
  );
}

function verDiffHistorial(item, setDiffOpen) {
  fetch('/api/ensayo/' + item.ensayo_id + '/historial')
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var match = (Array.isArray(rows) ? rows : []).find(function (r) { return r.id === item.id; });
      setDiffOpen({ item: item, snap: match });
    })
    .catch(function () { setDiffOpen({ item: item, snap: null }); });
}

function DiffModal(props) {
  var snap = props.snap || {};
  var anterior = snap.datos_json_anterior;
  var nuevo    = snap.datos_json_nuevo;
  try { if (anterior) anterior = JSON.stringify(JSON.parse(anterior), null, 2); } catch {}
  try { if (nuevo)    nuevo    = JSON.stringify(JSON.parse(nuevo), null, 2); } catch {}
  return React.createElement('div', {
    className: 'modal-backdrop',
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    onClick: function (e) { if (e.target === e.currentTarget) props.onClose(); }
  },
    React.createElement('div', {
      style: { background: '#fff', borderRadius: 8, maxWidth: 1200, width: '100%', maxHeight: '90vh',
               display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    },
      React.createElement('div', { style: { padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('div', null,
          React.createElement('strong', null, props.data.item.texto),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--text-3)' } }, fmtFecha(props.data.item.fecha))
        ),
        React.createElement('button', { className: 'btn btn-default btn-sm', onClick: props.onClose }, 'Cerrar')
      ),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        padding: 12, flex: 1, overflow: 'hidden' } },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 6, color: '#b02a2a' } }, 'Anterior'),
          React.createElement('pre', { style: {
            flex: 1, overflow: 'auto', background: '#fff5f5', padding: 10,
            border: '1px solid #fed7d7', borderRadius: 4, fontSize: 11, margin: 0, whiteSpace: 'pre-wrap'
          } }, anterior || '(sin datos previos)')
        ),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
          React.createElement('div', { style: { fontWeight: 600, marginBottom: 6, color: '#0f7d3a' } }, 'Nuevo'),
          React.createElement('pre', { style: {
            flex: 1, overflow: 'auto', background: '#f0fff4', padding: 10,
            border: '1px solid #c6f6d5', borderRadius: 4, fontSize: 11, margin: 0, whiteSpace: 'pre-wrap'
          } }, nuevo || '(eliminado)')
        )
      )
    )
  );
}

function ResetDatosModal(props) {
  var _c = React.useState(false); var cat = _c[0], setCat = _c[1];
  var _t = React.useState(''); var txt = _t[0], setTxt = _t[1];
  var _b = React.useState(false); var busy = _b[0], setBusy = _b[1];
  var _r = React.useState(null); var resu = _r[0], setResu = _r[1];
  var _e = React.useState(''); var err = _e[0], setErr = _e[1];

  function ejecutar() {
    if (txt !== 'BORRAR TODO') { setErr('Escribí exactamente "BORRAR TODO" para confirmar.'); return; }
    setBusy(true); setErr('');
    fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmar: 'SI_BORRAR_TODO', incluir_catalogos: cat }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        setResu(r.d.borrado || {});
      })
      .catch(function (e) { setErr(e.message); })
      .finally(function () { setBusy(false); });
  }

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
  },
    React.createElement('div', {
      style: { background: '#fff', borderRadius: 8, width: 'min(90vw, 520px)', padding: 20,
               borderTop: '4px solid #b02a2a' }
    },
      React.createElement('h3', { style: { margin: 0, color: '#b02a2a', marginBottom: 6 } },
        '⚠ Reset de datos de prueba'),
      React.createElement('p', { style: { fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px 0' } },
        'Se borrarán TODAS las solicitudes, OTs, ensayos, eventos, historial, informes emitidos, firmas y plantillas del sistema. Los tokens de firma se preservan. Esta acción NO se puede deshacer.'),
      resu
        ? React.createElement('div', {
            style: { background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 4,
                     padding: 12, fontSize: 12, marginBottom: 12 }
          },
            React.createElement('div', { style: { fontWeight: 700, color: '#0f7d3a', marginBottom: 6 } }, '✓ Datos borrados'),
            React.createElement('ul', { style: { margin: 0, paddingLeft: 20 } },
              Object.keys(resu).map(function (k) {
                return React.createElement('li', { key: k }, k + ': ' + resu[k] + ' registro(s)');
              })
            ),
            React.createElement('div', { style: { marginTop: 8, fontSize: 11, color: 'var(--text-3)' } },
              'Reiniciá el server para que se re-siembren los equipos por default.'),
            React.createElement('div', { style: { textAlign: 'right', marginTop: 10 } },
              React.createElement(Button, { variant: 'primary', size: 'sm', onClick: props.onDone }, 'Cerrar'))
          )
        : React.createElement(React.Fragment, null,
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 12, fontSize: 12 } },
              React.createElement('input', { type: 'checkbox', checked: cat,
                onChange: function (e) { setCat(e.target.checked); } }),
              React.createElement('span', null, 'También borrar Clientes, Equipos y Normas (los equipos se re-siembran al reiniciar el server)')
            ),
            React.createElement('div', { style: { fontSize: 12, marginBottom: 6, fontWeight: 600 } },
              'Para confirmar, escribí exactamente: ',
              React.createElement('code', { style: { background: '#f4f4f4', padding: '1px 5px', borderRadius: 3 } }, 'BORRAR TODO')),
            React.createElement('input', {
              className: 'input', autoFocus: true,
              placeholder: 'BORRAR TODO', value: txt,
              onChange: function (e) { setTxt(e.target.value); }
            }),
            err ? React.createElement('div', { style: { color: '#b02a2a', fontSize: 12, marginTop: 8 } }, err) : null,
            React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 } },
              React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: props.onClose, disabled: busy }, 'Cancelar'),
              React.createElement(Button, {
                variant: 'primary', size: 'sm', onClick: ejecutar, loading: busy,
                disabled: txt !== 'BORRAR TODO',
              }, 'Borrar datos')
            )
          )
    )
  );
}

window.AuditLogScreen = AuditLogScreen;
