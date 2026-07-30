/* LABTESA — Vista dedicada de Vencimientos.
 * Muestra las tarjetas con `due` de los boards de Trello configurados
 * (metalmecánica CABA + SEDE NQN por default) clasificadas por urgencia:
 *   HOY · MAÑANA · PRÓXIMAS (hasta 7 días)
 * Consume /api/trello/vencimientos (multi-board, con cache de 5 min).
 */
'use strict';

function VencimientosScreen() {
  var _r = React.createElement;
  var _d = React.useState(null);  var data = _d[0], setData = _d[1];
  var _err = React.useState(null); var err = _err[0], setErr = _err[1];
  var _busy = React.useState(true); var busy = _busy[0], setBusy = _busy[1];
  var _toast = React.useState(null); var toast = _toast[0], setToast = _toast[1];

  function cargar(force) {
    setBusy(true); setErr(null);
    fetch('/api/trello/vencimientos' + (force ? '?refresh=1' : ''))
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { setErr(r.d.error || 'Error'); setData(null); }
        else setData(r.d);
      })
      .catch(function (e) { setErr(e.message); setData(null); })
      .finally(function () { setBusy(false); });
  }

  React.useEffect(function () { cargar(false); }, []);

  var COLS = [
    { key: 'hoy',       label: 'Hoy',       color: '#8a5a00', bg: '#fff8dc', border: '#e0c060', accent: '#f0b429', icon: 'clock' },
    { key: 'mañana',    label: 'Mañana',    color: '#3b52c4', bg: '#e6ecff', border: '#a8b8e0', accent: '#4d6bff', icon: 'clock' },
    { key: 'proximas',  label: 'Próximas (≤ 7 días)', color: '#0a7a55', bg: '#e6f9ef', border: '#a8d9c1', accent: '#12b76a', icon: 'clock' },
  ];

  // Etiquetas cortas + color por familia para chips de ensayos.
  var ENSAYO_INFO = {
    'traccion':              { label: 'Tracción',    bg: '#fef3c7', color: '#92400e' },
    'dureza-brinell':        { label: 'Brinell',     bg: '#e0e7ff', color: '#3730a3' },
    'dureza-vickers':        { label: 'Vickers',     bg: '#e0e7ff', color: '#3730a3' },
    'dureza-rockwell':       { label: 'Rockwell',    bg: '#e0e7ff', color: '#3730a3' },
    'impacto':               { label: 'Impacto',     bg: '#fce7f3', color: '#9d174d' },
    'plegado':               { label: 'Plegado',     bg: '#fef3c7', color: '#92400e' },
    'nick-break':            { label: 'Nick Break',  bg: '#fef3c7', color: '#92400e' },
    'metalografia-general':  { label: 'Metalografía',bg: '#dcfce7', color: '#166534' },
    'anexo-metalografico':   { label: 'Anexo Met.',  bg: '#dcfce7', color: '#166534' },
    'macrografia':           { label: 'Macrografía', bg: '#dcfce7', color: '#166534' },
    'ferrita-delta':         { label: 'Ferrita δ',   bg: '#dcfce7', color: '#166534' },
    'rugosidad':             { label: 'Rugosidad',   bg: '#e0f2fe', color: '#075985' },
    'quimicos':              { label: 'Químicos',    bg: '#f3e8ff', color: '#6b21a8' },
    'liquidos-penetrantes':  { label: 'LP',          bg: '#fee2e2', color: '#991b1b' },
    'tratamientos-termicos': { label: 'TT',          bg: '#ffedd5', color: '#9a3412' },
  };
  function chipEnsayo(tipo) {
    var i = ENSAYO_INFO[tipo] || { label: tipo, bg: '#eef1f4', color: '#3a3a3a' };
    return _r('span', {
      key: tipo,
      style: {
        fontSize: 10, fontWeight: 700,
        color: i.color, background: i.bg,
        padding: '2px 6px', borderRadius: 4,
        whiteSpace: 'nowrap',
      },
    }, i.label);
  }

  // Ir al detalle interno del sistema. Si el cache local no tiene la sol
  // (por ejemplo, recién creada como placeholder PEND-), refrescamos desde
  // la API y reintentamos. Solo si el server confirma `en_sistema=false` se
  // muestra el toast "no fue importada".
  function _hermanasDe(raw, norm) {
    var h = window.LabStore.listOtsBySolicitud(raw);
    if (!h || !h.length) h = window.LabStore.listOtsBySolicitud(norm);
    return (h && h.length) ? h : null;
  }
  function abrirItem(item) {
    if (!(window.LabStore && window.LabStore.listOtsBySolicitud)) return;
    var raw = String(item.nro_solicitud || '').trim();
    var norm = String(parseInt(raw, 10) || raw);
    var hermanas = _hermanasDe(raw, norm);
    if (hermanas) { location.hash = '#/ot/' + hermanas[0].nro_ot; return; }
    // Cache miss: si el server dice que está en sistema, refrescar y reintentar.
    if (item.en_sistema && typeof window.LabStore.init === 'function') {
      setToast('Actualizando datos del sistema…');
      window.LabStore.init().then(function () {
        setToast(null);
        var h2 = _hermanasDe(raw, norm);
        if (h2) { location.hash = '#/ot/' + h2[0].nro_ot; return; }
        setToast('La solicitud ' + (item.nro_solicitud || item.titulo) + ' figura en el sistema pero no encontramos la OT — probá F5.');
        setTimeout(function () { setToast(null); }, 4500);
      }).catch(function () {
        setToast('No se pudo refrescar el cache. Probá F5.');
        setTimeout(function () { setToast(null); }, 3500);
      });
      return;
    }
    setToast('La solicitud ' + (item.nro_solicitud || item.titulo) + ' todavía no fue importada al sistema.');
    setTimeout(function () { setToast(null); }, 3500);
  }

  function renderItem(item, col) {
    var diasLabel = item.dias === 0 ? 'HOY' : (item.dias === 1 ? 'MAÑANA' : ('en ' + item.dias + ' d'));
    var dueDate = '';
    try {
      var d = new Date(item.due + 'T12:00:00');
      dueDate = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    } catch (_) {}
    return _r('button', {
      key: item.id_trello,
      onClick: function () { abrirItem(item); },
      className: 'venc-card',
      style: {
        position: 'relative',
        display: 'block', width: '100%',
        padding: '10px 12px 10px 16px', marginBottom: 8,
        borderRadius: 8,
        background: '#fff',
        border: '1px solid ' + col.border,
        borderLeft: '4px solid ' + col.accent,
        cursor: 'pointer', textAlign: 'left',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'transform .08s ease, box-shadow .12s ease, border-color .12s ease',
      },
      onMouseEnter: function (e) {
        e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      },
      onMouseLeave: function (e) {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
        e.currentTarget.style.transform = 'translateY(0)';
      },
      title: item.titulo + ' — ' + item.lista,
    },
      // Header: título + chip OAA + chip de días
      _r('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } },
        _r('div', {
          style: {
            flex: 1, minWidth: 0,
            fontWeight: 700, fontSize: 13, color: '#1f2328',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          },
        }, item.titulo),
        item.es_oaa ? _r('span', {
          title: 'Solicitud con al menos un ensayo acreditado (OAA) — va en la carpeta OAA',
          style: {
            flexShrink: 0,
            fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
            color: '#fff', background: '#7c3aed',
            padding: '3px 8px', borderRadius: 999,
          },
        }, 'OAA') : null,
        (item.trello_oaa_label && !item.es_oaa) ? _r('span', {
          title: 'La tarjeta de Trello tiene etiqueta "PARAMETROS ACREDITADOS" — recordatorio; la acreditación real la valida agente-oaa',
          style: {
            flexShrink: 0,
            fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
            color: '#5b21b6', background: '#ede9fe', border: '1px solid #c4b5fd',
            padding: '2px 6px', borderRadius: 999,
          },
        }, 'OAA Trello') : null,
        item.es_preliminar ? _r('span', {
          title: 'La tarjeta de Trello tiene etiqueta PRELIMINAR — el informe se emite como preinforme',
          style: {
            flexShrink: 0,
            fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
            color: '#8a5a00', background: '#fff4e0', border: '1px solid #e0c060',
            padding: '2px 6px', borderRadius: 999,
          },
        }, 'PRELIMINAR') : null,
        _r('span', {
          style: {
            flexShrink: 0,
            fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
            color: '#fff', background: col.accent,
            padding: '3px 8px', borderRadius: 999,
            textTransform: 'uppercase',
          },
        }, diasLabel)
      ),
      // Chips de "faltan datos" (rojo) + ensayos incluidos.
      ((item.datos_faltantes && item.datos_faltantes.length > 0) || (item.ensayos_tipos && item.ensayos_tipos.length > 0))
        ? _r('div', {
            style: {
              display: 'flex', flexWrap: 'wrap', gap: 4,
              marginBottom: 8,
            },
          },
            (item.datos_faltantes || []).map(function (f) {
              var lbl = f === 'nro_ot' ? 'FALTA OT' : f === 'id_muestra' ? 'FALTA ID' : ('FALTA ' + String(f).toUpperCase());
              return _r('span', {
                key: 'df-' + f,
                style: {
                  fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
                  color: '#fff', background: '#dc2626',
                  padding: '2px 6px', borderRadius: 4,
                  whiteSpace: 'nowrap',
                },
              }, lbl);
            }),
            (item.ensayos_tipos || []).map(chipEnsayo))
        : null,

      // Footer: solicitud · columna · fecha · en_sistema
      _r('div', {
        style: {
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 6, fontSize: 11, color: '#57606a',
        },
      },
        item.nro_solicitud ? _r('span', {
          style: {
            fontWeight: 700, color: col.color,
            background: col.bg, padding: '1px 6px', borderRadius: 4,
          },
        }, '#' + item.nro_solicitud) : null,
        _r('span', { style: { color: '#8a8a8a' } }, item.lista),
        dueDate ? _r('span', null, '· ' + dueDate) : null,
        // Chip "en sistema" removido — todas las tarjetas se importan siempre.
        // Se mantiene "sin importar" para los casos edge que no se importaron
        // (sin solicitud detectable, etc).
        !item.en_sistema
          ? _r('span', {
              style: {
                marginLeft: 'auto', color: '#b76a00', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              },
            },
              _r(Icon, { name: 'alertTri', size: 11 }), 'sin importar')
          : null
      )
    );
  }

  var total = data
    ? COLS.reduce(function (acc, c) { return acc + (data[c.key] || []).length; }, 0)
    : 0;

  return _r('div', { className: 'page' },
    _r('header', { className: 'page-head' },
      _r('div', null,
        _r('h1', { className: 'page-title' }, 'Vencimientos'),
        _r('p', { className: 'page-sub' },
          'Tarjetas de Trello con fecha de vencimiento próxima.',
          data ? _r('span', { style: { marginLeft: 6, fontWeight: 600 } }, '· ' + total + ' pendientes') : null)
      ),
      _r(Button, { variant: 'soft', size: 'sm', icon: 'refresh', onClick: function () { cargar(true); }, loading: busy }, 'Recargar'),
    ),

    toast
      ? _r('div', {
          style: {
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: '#1f2328', color: '#fff',
            padding: '10px 14px', borderRadius: 8,
            fontSize: 13, boxShadow: '0 8px 20px rgba(0,0,0,.25)',
            display: 'flex', alignItems: 'center', gap: 8,
          },
        },
          _r(Icon, { name: 'alertTri', size: 14 }),
          toast)
      : null,

    err
      ? _r('div', {
          style: {
            background: '#ffd7d7', border: '1px solid #e0a0a0', color: '#b02a2a',
            padding: 12, borderRadius: 6, fontSize: 12,
          },
        },
          'No se pudo consultar Trello: ', err,
          _r('div', { style: { fontSize: 11, marginTop: 6, color: '#8a5a00' } },
            'Verificá TRELLO_KEY / TRELLO_TOKEN / TRELLO_BOT_BOARD_IDS en el .env del servidor.'))
      : (busy && !data)
        ? _r('div', { style: { padding: 20, color: 'var(--text-3)' } }, 'Cargando…')
        : _r('div', {
            style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 },
          },
            COLS.map(function (col) {
              var items = (data && data[col.key]) || [];
              return _r('div', { key: col.key,
                style: {
                  background: col.bg, border: '1px solid ' + col.border,
                  borderRadius: 10, padding: 14,
                } },
                _r('div', { style: {
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 12, color: col.color, fontWeight: 800, fontSize: 14,
                } },
                  _r(Icon, { name: col.icon, size: 16 }),
                  col.label,
                  _r('span', { style: {
                    background: '#fff', color: col.color,
                    padding: '2px 10px', borderRadius: 999,
                    fontSize: 12, marginLeft: 'auto', border: '1px solid ' + col.border,
                    fontWeight: 700,
                  } }, items.length)
                ),
                items.length === 0
                  ? _r('div', { style: { fontSize: 12, color: '#8a8a8a', textAlign: 'center', padding: '24px 0' } }, '— sin tarjetas —')
                  : items.map(function (it) { return renderItem(it, col); })
              );
            }))
  );
}

window.VencimientosScreen = VencimientosScreen;
