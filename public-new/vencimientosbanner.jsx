/* LABTESA — Banner de vencimientos del día.
 * Consulta directamente el tablero de Trello (endpoint /api/trello/vencimientos)
 * y muestra las tarjetas abiertas con `due` clasificadas por urgencia.
 * NO requiere que la OT esté importada al sistema — se ven todas las del tablero.
 * Si la solicitud ya fue importada, click en la tarjeta va al detalle interno;
 * si no, abre el link a Trello.
 */
'use strict';

var _rV = React.createElement;

function VencimientosBanner() {
  var _d = React.useState(null);   var data = _d[0], setData = _d[1];
  var _err = React.useState(null); var err = _err[0], setErr = _err[1];
  var _busy = React.useState(true); var busy = _busy[0], setBusy = _busy[1];
  var _modal = React.useState(null); var modalSol = _modal[0], setModalSol = _modal[1];

  function cargar(force) {
    setBusy(true); setErr(null);
    // Detectar modo mock via ?mock=1 en la URL del navegador (para preview).
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
    // Refresco automático cada 10 min.
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

  // Columnas Trello "post-ensayo": la solicitud ya fue procesada y está cargada
  // en el sistema (revisión / preliminar / firma / enviada). Estas cards no
  // requieren acción de ensayo, así que se separan visualmente.
  // categoriaPostEnsayo devuelve la subcategoría (para agrupar dentro de la
  // sección) o null si no aplica.
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
  // enSistema queda agrupado por categoría, preservando origen (hoy / manana)
  // para poder mostrar la fecha de vencimiento en cada card.
  var enSistemaFlat = hoyRaw.filter(function (o) { return categoriaPostEnsayo(o.lista); })
    .map(function (o) { return Object.assign({}, o, { _cat: categoriaPostEnsayo(o.lista), _tono: 'hoy' }); })
    .concat(mananaRaw.filter(function (o) { return categoriaPostEnsayo(o.lista); })
      .map(function (o) { return Object.assign({}, o, { _cat: categoriaPostEnsayo(o.lista), _tono: 'manana' }); }));
  var enSistemaByCat = {};
  enSistemaFlat.forEach(function (o) {
    if (!enSistemaByCat[o._cat]) enSistemaByCat[o._cat] = [];
    enSistemaByCat[o._cat].push(o);
  });
  var enSistema = enSistemaFlat; // usado sólo para el condicional de "hay algo".

  function fmtDia(iso, tono) {
    if (!iso) return '';
    var p = String(iso).split('-');
    var dia = p.length >= 3 ? (p[2] + '/' + p[1]) : iso;
    var etq = tono === 'hoy' ? ' · HOY' : (tono === 'manana' ? ' · mañana' : '');
    return 'Vence ' + dia + etq;
  }

  // AS400 a preparar HOY: solicitudes de Cintolo que vencen HOY o MAÑANA.
  // - Vencen mañana → hay que preparar el Excel hoy (entrega 1 día antes).
  // - Vencen hoy → ya se atrasó, hay que hacerlo YA.
  // Cada card lleva el flag `_urgencia` para pintarlas distinto.
  var as400Hoy = hoy.filter(function (o) { return o.es_cintolo; })
    .map(function (o) { return Object.assign({}, o, { _urgencia: 'hoy' }); })
    .concat(manana.filter(function (o) { return o.es_cintolo; })
      .map(function (o) { return Object.assign({}, o, { _urgencia: 'manana' }); }));

  // Si no hay nada que mostrar pero el modal está abierto, seguimos renderizando
  // el modal solo (para no montar/desmontar hooks entre renders).
  if (hoy.length === 0 && manana.length === 0 && as400Hoy.length === 0 && enSistema.length === 0) {
    return (modalSol !== null && typeof window.AS400Modal === 'function')
      ? _rV(window.AS400Modal, { nroSolicitud: modalSol, onClose: function () { setModalSol(null); } })
      : null;
  }

  function abrirAs400(item) {
    setModalSol((item && item.nro_solicitud) || '');
  }

  function irA(item) {
    // Si la solicitud está en el sistema (flag del backend O sección
    // "Ya cargadas en el sistema" del banner), intentar ABRIR LA CARPETA del
    // informe emitido en el explorador (labopen://). Fallback: navegar al
    // detalle interno /v2/#/solicitud/<nro>.
    var forzarSistema = !!item.en_sistema || !!item._cat;
    var nroSol = item.nro_solicitud;
    if (forzarSistema && nroSol) {
      var normSol = String(parseInt(nroSol, 10) || nroSol);
      fetch('/api/solicitud/' + encodeURIComponent(normSol) + '/carpeta')
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (r) {
          if (r.ok && r.d && r.d.carpeta) {
            // Normalizar path share → G: (igual que auditlog.jsx).
            var carpeta = String(r.d.carpeta)
              .replace(/^[\\\/]{2}192\.168\.1\.200[\\\/]+Labtesa1[\\\/]+/i, 'G:\\')
              .replace(/\//g, '\\');
            // labopen:// abre el explorador si el handler está instalado.
            var url = 'labopen://' + carpeta.replace(/\\/g, '/').replace(/:/g, '%3A');
            var iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = url;
            document.body.appendChild(iframe);
            setTimeout(function () { try { document.body.removeChild(iframe); } catch (_) {} }, 500);
            return;
          }
          // Fallback: sin carpeta (informe no emitido todavía) → detalle interno.
          location.hash = '#/solicitud/' + normSol;
        })
        .catch(function () { location.hash = '#/solicitud/' + normSol; });
      return;
    }
    if (item.url) window.open(item.url, '_blank');
  }

  function estiloTarjeta(color) {
    return {
      background: 'var(--surface)',
      border: '1px solid ' + color + '55',
      borderLeft: '4px solid ' + color,
      borderRadius: 6, padding: '10px 12px',
      cursor: 'pointer', transition: 'transform .1s, box-shadow .1s',
      minWidth: 220, flex: '0 1 260px',
      color: 'var(--text)',
    };
  }

  function tarjeta(o, tono) {
    var color = tono === 'vencido' ? '#b02a2a' : tono === 'hoy' ? '#c04a00' : '#7a5a1a';
    var labelDias = tono === 'vencido'
      ? 'Vencida hace ' + Math.abs(o.dias) + ' día' + (Math.abs(o.dias) === 1 ? '' : 's')
      : tono === 'hoy' ? 'Vence HOY'
      : 'Vence mañana';
    return _rV('div', {
      key: o.id_trello, style: estiloTarjeta(color),
      onClick: function () { irA(o); },
      onMouseEnter: function (e) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; },
      onMouseLeave: function (e) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; },
      title: (o.en_sistema ? 'Solicitud importada — abrir OT' : 'Abrir en Trello')
    },
      _rV('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between', marginBottom: 4 } },
        _rV('span', { style: { fontSize: 11, fontWeight: 700, color: color } }, labelDias),
        o.en_sistema
          ? _rV('span', { style: { fontSize: 9, padding: '1px 6px', background: '#0f7d3a22', color: '#0f7d3a', borderRadius: 3, fontWeight: 700 } }, 'EN SISTEMA')
          : _rV('span', { style: { fontSize: 9, padding: '1px 6px', background: 'var(--surface-3)', color: 'var(--text-3)', borderRadius: 3 } }, 'TRELLO')
      ),
      _rV('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: o.titulo },
        o.cliente || o.titulo),
      _rV('div', { style: { fontSize: 11, color: 'var(--text-3)' } },
        o.nro_solicitud ? ('Sol ' + o.nro_solicitud) : '',
        o.lista ? (o.nro_solicitud ? ' · ' : '') + o.lista : '')
    );
  }

  function seccion(titulo, arr, tono, color) {
    if (arr.length === 0) return null;
    return _rV('div', { style: { marginBottom: 10 } },
      _rV('div', {
        style: { fontSize: 11, fontWeight: 700, color: color, textTransform: 'uppercase',
                 letterSpacing: '.03em', marginBottom: 5 }
      }, titulo + ' (' + arr.length + ')'),
      _rV('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
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
      padding: 12, marginBottom: 16,
    }
  },
    _rV('div', {
      style: { fontSize: 13, fontWeight: 700, color: 'var(--banner-title)', marginBottom: 8,
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
    // Sección AS400 (Cintolo): tarjetas especiales con botón "Abrir AS400".
    // Diferencia visual entre "vence HOY" (urgente — ya se atrasó) y "vence
    // MAÑANA" (a preparar hoy, en plazo).
    as400Hoy.length > 0 ? _rV('div', { style: { marginBottom: 10 } },
      _rV('div', {
        style: {
          fontSize: 11, fontWeight: 700, color: '#3b52c4', textTransform: 'uppercase',
          letterSpacing: '.03em', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8,
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
      _rV('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        as400Hoy.slice(0, 14).map(function (o) {
          var esHoy = o._urgencia === 'hoy';
          var color = esHoy ? '#c04a00' : '#3b52c4';
          var chipLabel = esHoy ? 'AS400 URGENTE' : 'AS400 HOY';
          var footTxt = esHoy ? 'vence HOY — atrasado' : 'vence mañana';
          return _rV('div', {
            key: 'as-' + o.id_trello,
            style: {
              background: 'var(--surface)', border: '1px solid ' + color + '55',
              borderLeft: '4px solid ' + color,
              borderRadius: 6, padding: '10px 12px', minWidth: 220, flex: '0 1 260px',
              cursor: 'pointer', transition: 'transform .1s',
            },
            title: esHoy
              ? 'Cintolo — vence HOY, hay que hacer el AS400 YA.'
              : 'Cintolo — el Excel AS400 se entrega HOY (vence mañana). Click para abrir.',
            onClick: function () { abrirAs400(o); },
            onMouseEnter: function (e) { e.currentTarget.style.transform = 'translateY(-1px)'; },
            onMouseLeave: function (e) { e.currentTarget.style.transform = 'none'; }
          },
            _rV('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
              _rV('span', { style: { fontSize: 11, fontWeight: 700, color: color } }, chipLabel),
              _rV('span', { style: { fontSize: 9, padding: '1px 6px', background: color + '22', color: color, borderRadius: 3, fontWeight: 700, marginLeft: 'auto' } }, 'CINTOLO')
            ),
            _rV('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 } },
              'CINTOLO'),
            _rV('div', { style: { fontSize: 11, color: 'var(--text-3)' } },
              (o.nro_solicitud ? 'Sol ' + o.nro_solicitud : o.titulo) + ' · ' + footTxt)
          );
        })
      )
    ) : null,
    seccion('Vencen hoy', hoy, 'hoy', '#c04a00'),
    seccion('Vencen mañana', manana, 'manana', '#7a5a1a'),
    // Ya cargadas en el sistema: las solicitudes cuyo Trello está en
    // revisión / preliminar / firma / enviadas ya pasaron la etapa de ensayos.
    // Se muestran aparte, separadas por subcategoría, y con la fecha en la card.
    enSistema.length > 0 ? _rV('div', { style: { marginBottom: 6, marginTop: 4 } },
      _rV('div', {
        style: {
          fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase',
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
              letterSpacing: '.04em', marginBottom: 4, marginLeft: 2,
            }
          }, cat.label + ' (' + arr.length + ')'),
          _rV('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
            arr.slice(0, 20).map(function (o) {
              return _rV('div', {
                key: 'sys-' + o.id_trello,
                style: {
                  background: 'var(--surface)', border: '1px solid #16653433', borderLeft: '4px solid #22c55e',
                  borderRadius: 6, padding: '9px 12px', minWidth: 220, flex: '0 1 260px',
                  cursor: 'pointer', transition: 'transform .1s',
                  opacity: 0.92,
                },
                title: 'Abrir solicitud en el sistema — ' + (o.lista || 'Cargada'),
                onClick: function () { irA(o); },
                onMouseEnter: function (e) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.opacity = 1; },
                onMouseLeave: function (e) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.opacity = 0.92; }
              },
                _rV('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, justifyContent: 'space-between' } },
                  _rV('span', {
                    style: { fontSize: 10, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '.02em' }
                  }, fmtDia(o.due, o._tono)),
                  o.en_sistema
                    ? _rV('span', { style: { fontSize: 9, padding: '1px 6px', background: '#0f7d3a22', color: '#0f7d3a', borderRadius: 3, fontWeight: 700 } }, 'EN SISTEMA')
                    : null
                ),
                _rV('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: o.titulo },
                  o.cliente || o.titulo),
                _rV('div', { style: { fontSize: 11, color: 'var(--text-3)' } },
                  o.nro_solicitud ? ('Sol ' + o.nro_solicitud) : '')
              );
            }),
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
