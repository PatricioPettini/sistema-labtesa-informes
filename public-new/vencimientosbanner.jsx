/* LABTESA — Banner de vencimientos del día.
 * Consulta directamente el tablero de Trello (endpoint /api/trello/vencimientos)
 * y muestra las tarjetas abiertas con `due` clasificadas por urgencia.
 * NO requiere que la OT esté importada al sistema — se ven todas las del tablero.
 * Si la solicitud ya fue importada, click en la tarjeta va al detalle interno de
 * la primera OT hermana; si no, muestra un toast.
 */
'use strict';

var _rV = React.createElement;

// Etiquetas cortas + color por familia para chips de ensayos.
var ENSAYO_INFO_BANNER = {
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
function _chipEnsayoBanner(tipo) {
  var i = ENSAYO_INFO_BANNER[tipo] || { label: tipo, bg: '#eef1f4', color: '#3a3a3a' };
  return _rV('span', {
    key: tipo,
    style: {
      fontSize: 9, fontWeight: 700,
      color: i.color, background: i.bg,
      padding: '1px 5px', borderRadius: 3,
      whiteSpace: 'nowrap',
    },
  }, i.label);
}

function VencimientosBanner() {
  var _d = React.useState(null);   var data = _d[0], setData = _d[1];
  var _err = React.useState(null); var err = _err[0], setErr = _err[1];
  var _busy = React.useState(true); var busy = _busy[0], setBusy = _busy[1];
  var _modal = React.useState(null); var modalSol = _modal[0], setModalSol = _modal[1];
  var _toast = React.useState(null); var toast = _toast[0], setToast = _toast[1];

  function cargar(force) {
    setBusy(true); setErr(null);
    var mock = /(\?|&)mock=1(&|$)/.test(location.search) || /[?&]mock=1(&|$)/.test(location.hash);
    var url = '/api/trello/vencimientos' + (mock ? '?mock=1' : (force ? '?refresh=1' : ''));
    fetch(url)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) { setErr(r.d.error || 'Error'); setData(null); }
        else setData(r.d);
      })
      .catch(function (e) { setErr(e.message); setData(null); })
      .finally(function () { setBusy(false); });
  }

  React.useEffect(function () {
    cargar(false);
    var t = setInterval(function () { cargar(false); }, 10 * 60 * 1000);
    return function () { clearInterval(t); };
  }, []);

  if (busy && !data && !err) return null;
  if (err) {
    return _rV('div', {
      style: {
        background: 'var(--banner-bg)', border: '1px solid var(--banner-border)', borderRadius: 8,
        padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--banner-title)',
      }
    },
      '⏰ Vencimientos de Trello no disponibles: ', err,
      _rV('button', {
        onClick: function () { cargar(true); },
        style: { marginLeft: 10, fontSize: 11, padding: '3px 8px', border: '1px solid var(--banner-btn-border)',
                 background: 'var(--banner-btn-bg)', color: 'var(--text)', borderRadius: 3, cursor: 'pointer' }
      }, 'Reintentar')
    );
  }
  if (!data) return null;

  var hoyRaw    = Array.isArray(data.hoy) ? data.hoy : [];
  var mananaRaw = Array.isArray(data['mañana']) ? data['mañana'] : (Array.isArray(data.manana) ? data.manana : []);

  function categoriaPostEnsayo(lista) {
    var c = (lista || '').toString().toLowerCase();
    if (!c) return null;
    if (c.indexOf('revisi') >= 0) return 'revision';
    if (c.indexOf('preliminar') >= 0) return 'preliminar';
    if (c.indexOf('firma') >= 0) return 'firma';
    if (c.indexOf('enviad') >= 0 && c.indexOf('plazo') >= 0) return 'enviadas';
    return null;
  }
  var CATEGORIAS_POST = [
    { key: 'revision',   label: 'Revisión técnica' },
    { key: 'preliminar', label: 'Informe preliminar' },
    { key: 'firma',      label: 'Para firma electrónica' },
    { key: 'enviadas',   label: 'Enviadas en plazo' },
  ];

  var hoy    = hoyRaw.filter(function (o) { return !categoriaPostEnsayo(o.lista); });
  var manana = mananaRaw.filter(function (o) { return !categoriaPostEnsayo(o.lista); });
  var enSistemaFlat = hoyRaw.filter(function (o) { return categoriaPostEnsayo(o.lista); })
    .map(function (o) { return Object.assign({}, o, { _cat: categoriaPostEnsayo(o.lista), _tono: 'hoy' }); })
    .concat(mananaRaw.filter(function (o) { return categoriaPostEnsayo(o.lista); })
      .map(function (o) { return Object.assign({}, o, { _cat: categoriaPostEnsayo(o.lista), _tono: 'manana' }); }));
  var enSistemaByCat = {};
  enSistemaFlat.forEach(function (o) {
    if (!enSistemaByCat[o._cat]) enSistemaByCat[o._cat] = [];
    enSistemaByCat[o._cat].push(o);
  });
  var enSistema = enSistemaFlat;

  var as400Hoy = hoy.filter(function (o) { return o.es_cintolo; })
    .map(function (o) { return Object.assign({}, o, { _urgencia: 'hoy' }); })
    .concat(manana.filter(function (o) { return o.es_cintolo; })
      .map(function (o) { return Object.assign({}, o, { _urgencia: 'manana' }); }));

  if (hoy.length === 0 && manana.length === 0 && as400Hoy.length === 0 && enSistema.length === 0) {
    return (modalSol !== null && typeof window.AS400Modal === 'function')
      ? _rV(window.AS400Modal, { nroSolicitud: modalSol, onClose: function () { setModalSol(null); } })
      : null;
  }

  function abrirAs400(item) {
    setModalSol((item && item.nro_solicitud) || '');
  }

  // Siempre ir al detalle interno del sistema. Mismo comportamiento que la
  // vista dedicada de Vencimientos. Si el cache local no la tiene (por ej,
  // recién importada por el bot como placeholder PEND-...), refrescamos el
  // store desde la API y reintentamos. Si igual no aparece, toast.
  function _buscarHermanas(raw, norm) {
    var hermanas = window.LabStore.listOtsBySolicitud(raw);
    if (!hermanas || !hermanas.length) hermanas = window.LabStore.listOtsBySolicitud(norm);
    return (hermanas && hermanas.length) ? hermanas : null;
  }
  function irA(item) {
    if (!(window.LabStore && window.LabStore.listOtsBySolicitud)) {
      setToast('Cargando datos del sistema…');
      setTimeout(function () { setToast(null); }, 2500);
      return;
    }
    var raw = String(item.nro_solicitud || '').trim();
    var norm = String(parseInt(raw, 10) || raw);
    var hermanas = _buscarHermanas(raw, norm);
    if (hermanas) { location.hash = '#/ot/' + hermanas[0].nro_ot; return; }
    // Miss del cache → refrescar y reintentar. Cubre el caso "el bot acaba de
    // crear la OT (placeholder PEND o real) pero el LabStore local está viejo".
    if (item.en_sistema && typeof window.LabStore.init === 'function') {
      setToast('Actualizando datos del sistema…');
      window.LabStore.init().then(function () {
        setToast(null);
        var h2 = _buscarHermanas(raw, norm);
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

  // ── Paleta por tono/urgencia (mismo look que VencimientosScreen) ─────────
  function tonoInfo(tono) {
    if (tono === 'vencido')  return { color: '#b02a2a', bg: '#ffe4e4', border: '#e0a0a0', accent: '#dc2626' };
    if (tono === 'hoy')      return { color: '#8a5a00', bg: '#fff8dc', border: '#e0c060', accent: '#f0b429' };
    if (tono === 'manana')   return { color: '#3b52c4', bg: '#e6ecff', border: '#a8b8e0', accent: '#4d6bff' };
    /* sistema */             return { color: '#0a7a55', bg: '#e6f9ef', border: '#a8d9c1', accent: '#12b76a' };
  }

  function fmtFechaDue(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso + 'T12:00:00');
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    } catch (_) { return iso; }
  }

  function tarjeta(o, tono) {
    var col = tonoInfo(tono);
    var diasLabel = tono === 'vencido'
      ? ('vencida ' + Math.abs(o.dias) + 'd')
      : tono === 'hoy' ? 'HOY'
      : tono === 'manana' ? 'MAÑANA'
      : (o.dias === 0 ? 'HOY' : (o.dias === 1 ? 'MAÑANA' : ('en ' + o.dias + ' d')));
    var dueDate = fmtFechaDue(o.due);
    var ensayos = Array.isArray(o.ensayos_tipos) ? o.ensayos_tipos : [];
    return _rV('button', {
      key: o.id_trello,
      onClick: function () { irA(o); },
      className: 'venc-card',
      style: {
        position: 'relative',
        display: 'block', textAlign: 'left',
        padding: '10px 12px 10px 16px',
        borderRadius: 8,
        background: '#fff',
        border: '1px solid ' + col.border,
        borderLeft: '4px solid ' + col.accent,
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'transform .08s ease, box-shadow .12s ease',
        minWidth: 240, flex: '0 1 280px',
      },
      onMouseEnter: function (e) {
        e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      },
      onMouseLeave: function (e) {
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
        e.currentTarget.style.transform = 'translateY(0)';
      },
      title: o.titulo + ' — ' + (o.lista || ''),
    },
      _rV('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } },
        _rV('div', {
          style: {
            flex: 1, minWidth: 0,
            fontWeight: 700, fontSize: 13, color: '#1f2328',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          },
        }, o.titulo),
        o.es_oaa ? _rV('span', {
          title: 'Solicitud con al menos un ensayo acreditado (OAA) — va en la carpeta OAA',
          style: {
            flexShrink: 0,
            fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
            color: '#fff', background: '#7c3aed',
            padding: '3px 8px', borderRadius: 999,
          },
        }, 'OAA') : null,
        (o.trello_oaa_label && !o.es_oaa) ? _rV('span', {
          title: 'La tarjeta de Trello tiene etiqueta "PARAMETROS ACREDITADOS" — recordatorio; la acreditación real la valida agente-oaa',
          style: {
            flexShrink: 0,
            fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
            color: '#5b21b6', background: '#ede9fe', border: '1px solid #c4b5fd',
            padding: '2px 6px', borderRadius: 999,
          },
        }, 'OAA Trello') : null,
        o.es_preliminar ? _rV('span', {
          title: 'La tarjeta de Trello tiene etiqueta PRELIMINAR — el informe se emite como preinforme',
          style: {
            flexShrink: 0,
            fontSize: 9, fontWeight: 700, letterSpacing: '.3px',
            color: '#8a5a00', background: '#fff4e0', border: '1px solid #e0c060',
            padding: '2px 6px', borderRadius: 999,
          },
        }, 'PRELIMINAR') : null,
        _rV('span', {
          style: {
            flexShrink: 0,
            fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
            color: '#fff', background: col.accent,
            padding: '3px 8px', borderRadius: 999,
            textTransform: 'uppercase',
          },
        }, diasLabel)
      ),
      ((o.datos_faltantes && o.datos_faltantes.length > 0) || ensayos.length > 0)
        ? _rV('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 } },
            (o.datos_faltantes || []).map(function (f) {
              var lbl = f === 'nro_ot' ? 'FALTA OT' : f === 'id_muestra' ? 'FALTA ID' : ('FALTA ' + String(f).toUpperCase());
              return _rV('span', {
                key: 'df-' + f,
                style: {
                  fontSize: 9, fontWeight: 800, letterSpacing: '.3px',
                  color: '#fff', background: '#dc2626',
                  padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
                },
              }, lbl);
            }),
            ensayos.map(_chipEnsayoBanner))
        : null,
      _rV('div', {
        style: {
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 6, fontSize: 11, color: '#57606a',
        },
      },
        o.nro_solicitud ? _rV('span', {
          style: {
            fontWeight: 700, color: col.color,
            background: col.bg, padding: '1px 6px', borderRadius: 4,
          },
        }, '#' + o.nro_solicitud) : null,
        o.lista ? _rV('span', { style: { color: '#8a8a8a' } }, o.lista) : null,
        dueDate ? _rV('span', null, '· ' + dueDate) : null,
        // Chip "en sistema" removido — todas las tarjetas se importan siempre,
        // así que la marca era redundante. Sí mostramos "sin importar" para
        // los casos edge (falta solicitud, no se detectó, etc).
        !o.en_sistema
          ? _rV('span', {
              style: {
                marginLeft: 'auto', color: '#b76a00', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              },
            },
              _rV(Icon, { name: 'alertTri', size: 11 }), 'sin importar')
          : null
      )
    );
  }

  function seccion(titulo, arr, tono, color) {
    if (arr.length === 0) return null;
    return _rV('div', { style: { marginBottom: 12 } },
      _rV('div', {
        style: { fontSize: 11, fontWeight: 700, color: color, textTransform: 'uppercase',
                 letterSpacing: '.03em', marginBottom: 6 }
      }, titulo + ' (' + arr.length + ')'),
      _rV('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
        arr.slice(0, 14).map(function (o) { return tarjeta(o, tono); }),
        arr.length > 14 ? _rV('div', {
          style: { padding: 10, fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }
        }, '+' + (arr.length - 14) + ' más') : null
      )
    );
  }

  return _rV('div', {
    style: {
      background: 'var(--banner-bg)', border: '1px solid var(--banner-border)', borderRadius: 8,
      padding: 14, marginBottom: 16,
    }
  },
    _rV('div', {
      style: { fontSize: 13, fontWeight: 700, color: 'var(--banner-title)', marginBottom: 10,
               display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }
    },
      _rV('span', null, '⏰ Vencimientos de solicitudes en Trello'),
      _rV('button', {
        onClick: function () { cargar(true); },
        title: 'Actualizar desde Trello',
        style: { fontSize: 11, padding: '3px 10px', border: '1px solid var(--banner-btn-border)',
                 background: 'var(--banner-btn-bg)', borderRadius: 3, cursor: 'pointer',
                 color: 'var(--banner-title)', fontWeight: 500 }
      }, busy ? '⟳' : '↻ Actualizar')
    ),
    toast
      ? _rV('div', {
          style: {
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: '#1f2328', color: '#fff',
            padding: '10px 14px', borderRadius: 8,
            fontSize: 13, boxShadow: '0 8px 20px rgba(0,0,0,.25)',
            display: 'flex', alignItems: 'center', gap: 8,
          },
        },
          _rV(Icon, { name: 'alertTri', size: 14 }),
          toast)
      : null,
    // Sección AS400 (Cintolo).
    as400Hoy.length > 0 ? _rV('div', { style: { marginBottom: 12 } },
      _rV('div', {
        style: {
          fontSize: 11, fontWeight: 700, color: '#3b52c4', textTransform: 'uppercase',
          letterSpacing: '.03em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
          justifyContent: 'space-between',
        }
      },
        _rV('span', null, '📊 AS400 a preparar — Cintolo (' + as400Hoy.length + ')'),
        _rV('button', {
          onClick: function () { abrirAs400(as400Hoy[0]); },
          style: {
            fontSize: 11, padding: '4px 10px', border: '1px solid #3b52c4', background: '#3b52c4',
            color: '#fff', borderRadius: 3, cursor: 'pointer', fontWeight: 600,
          }
        }, '📊 Generar Excel AS400')
      ),
      _rV('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
        as400Hoy.slice(0, 14).map(function (o) {
          var esHoy = o._urgencia === 'hoy';
          var col = esHoy ? tonoInfo('hoy') : tonoInfo('manana');
          var chipLabel = esHoy ? 'AS400 URGENTE' : 'AS400 HOY';
          var footTxt = esHoy ? 'vence HOY — atrasado' : 'vence mañana';
          return _rV('div', {
            key: 'as-' + o.id_trello,
            style: {
              background: '#fff', border: '1px solid ' + col.border,
              borderLeft: '4px solid ' + col.accent,
              borderRadius: 8, padding: '10px 12px 10px 16px',
              minWidth: 240, flex: '0 1 280px',
              cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'transform .08s, box-shadow .12s',
            },
            title: esHoy
              ? 'Cintolo — vence HOY, hay que hacer el AS400 YA.'
              : 'Cintolo — el Excel AS400 se entrega HOY (vence mañana). Click para abrir.',
            onClick: function () { abrirAs400(o); },
            onMouseEnter: function (e) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)'; },
            onMouseLeave: function (e) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'; }
          },
            _rV('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
              _rV('div', { style: { flex: 1, fontWeight: 700, fontSize: 13, color: '#1f2328' } }, 'CINTOLO'),
              _rV('span', { style: {
                fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
                color: '#fff', background: col.accent,
                padding: '3px 8px', borderRadius: 999,
                textTransform: 'uppercase',
              } }, chipLabel)
            ),
            _rV('div', { style: { fontSize: 11, color: '#57606a' } },
              (o.nro_solicitud ? '#' + o.nro_solicitud + ' · ' : '') + footTxt)
          );
        })
      )
    ) : null,
    seccion('Vencen hoy', hoy, 'hoy', '#8a5a00'),
    seccion('Vencen mañana', manana, 'manana', '#3b52c4'),
    // Ya cargadas en el sistema — mismo estilo, tono verde.
    enSistema.length > 0 ? _rV('div', { style: { marginBottom: 6, marginTop: 4 } },
      _rV('div', {
        style: {
          fontSize: 11, fontWeight: 700, color: '#0a7a55', textTransform: 'uppercase',
          letterSpacing: '.03em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
        }
      },
        _rV('span', null, '✅ Ya cargadas en el sistema (' + enSistema.length + ')')
      ),
      CATEGORIAS_POST.map(function (cat) {
        var arr = enSistemaByCat[cat.key];
        if (!arr || arr.length === 0) return null;
        return _rV('div', { key: cat.key, style: { marginBottom: 10 } },
          _rV('div', {
            style: {
              fontSize: 10.5, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase',
              letterSpacing: '.04em', marginBottom: 5, marginLeft: 2,
            }
          }, cat.label + ' (' + arr.length + ')'),
          _rV('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
            arr.slice(0, 20).map(function (o) { return tarjeta(o, 'sistema'); }),
            arr.length > 20 ? _rV('div', {
              style: { padding: 10, fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }
            }, '+' + (arr.length - 20) + ' más') : null
          )
        );
      })
    ) : null,
    (modalSol !== null && typeof window.AS400Modal === 'function')
      ? _rV(window.AS400Modal, { nroSolicitud: modalSol, onClose: function () { setModalSol(null); } })
      : null
  );
}

window.VencimientosBanner = VencimientosBanner;
