/* LABTESA — Vista previa del informe (mock paginado del .docx antes de generar) */

function reportRowsKey(tipo, variante) {
  return (tipo === 'ferrita-delta' && variante === 'microscopio') ? 'probetas' : 'resultados';
}

/* parámetros con valor, a partir de las secciones del schema */
function ensayoParams(sch, datos) {
  var out = [];
  var seen = {};
  (sch.sections(datos.variante) || []).forEach(function (sec) {
    (sec.fields || []).forEach(function (fld) {
      if (fld.key === 'observaciones') return;
      var v = datos[fld.key];
      if (v != null && String(v).trim() !== '' && !seen[fld.key]) {
        seen[fld.key] = 1;
        out.push({ label: fld.label.replace(/\s*\(ITM\)/, ''), value: String(v) });
      }
    });
  });
  return out;
}

function ReportPreview(props) {
  var ot = props.ot, fotos = props.fotos || [];
  var pre = !!ot.es_preinforme;
  var hoy = fmtDate(new Date().toISOString().slice(0, 10));

  return React.createElement(Modal, { onClose: props.onClose, wide: true },
    React.createElement('div', { className: 'modal-head report-prev-head' },
      React.createElement('div', null,
        React.createElement('h3', null, 'Vista previa del informe'),
        React.createElement('span', { className: 'dim sm' }, 'OT ' + ot.nro_ot + ' · ' + (ot.ensayos.length + 1) + ' página(s)' + (pre ? ' · PRELIMINAR' : ''))
      ),
      React.createElement('button', { className: 'modal-x', onClick: props.onClose }, React.createElement(Icon, { name: 'x', size: 18 }))
    ),
    React.createElement('div', { className: 'report-prev-body' },
      // ---------- CARÁTULA ----------
      React.createElement('div', { className: 'rp-page' },
        pre ? React.createElement('div', { className: 'rp-watermark' }, 'PRELIMINAR') : null,
        React.createElement('div', { className: 'rp-header' },
          React.createElement('img', { src: 'assets/labtesa-logo.jpg', className: 'rp-logo', alt: 'LABTESA' }),
          React.createElement('div', { className: 'rp-header-meta' },
            React.createElement('span', null, 'Laboratorio Industrial'),
            React.createElement('span', null, 'Ensayos metalúrgicos')
          )
        ),
        React.createElement('div', { className: 'rp-titleblock' },
          React.createElement('h1', null, pre ? 'PREINFORME DE ENSAYO' : 'INFORME DE ENSAYO'),
          React.createElement('span', { className: 'rp-otnum mono' }, 'OT N° ' + ot.nro_ot)
        ),
        React.createElement('div', { className: 'rp-datagrid' },
          rpRow('Solicitud N°', ot.nro_solicitud),
          rpRow('Cliente', ot.razon_social),
          rpRow('N° de cliente', ot.nro_cliente),
          rpRow('Fecha de recepción', fmtDate(ot.fecha_recepcion)),
          rpRow('Fecha de aprobación', fmtDate(ot.fecha_aprobacion)),
          rpRow('Fecha de emisión', hoy)
        ),
        React.createElement('div', { className: 'rp-muestra' },
          React.createElement('span', { className: 'rp-label' }, 'Identificación de la muestra'),
          React.createElement('pre', null, ot.id_muestra || '—')
        ),
        React.createElement('div', { className: 'rp-photos' },
          React.createElement('span', { className: 'rp-label' }, 'Fotografías de recepción'),
          fotos.length
            ? React.createElement('div', { className: 'rp-photo-grid' },
                fotos.slice(0, 4).map(function (p, i) { return React.createElement('img', { key: i, src: p.dataUrl, alt: p.name }); }))
            : React.createElement('div', { className: 'rp-photo-empty' }, 'Sin fotografías cargadas')
        ),
        React.createElement('div', { className: 'rp-foot' },
          React.createElement('span', null, 'LABTESA — Laboratorio Industrial'),
          React.createElement('span', null, 'Página 1 de ' + (ot.ensayos.length + 1))
        )
      ),

      // ---------- PÁGINAS DE ENSAYOS ----------
      ot.ensayos.map(function (e, idx) {
        var d = {}; try { d = JSON.parse(e.datos_json); } catch (x) {}
        var sch = window.ENSAYO_SCHEMAS[e.tipo];
        var params = ensayoParams(sch, d);
        var tbl = sch.table(d.variante);
        var rows = d[reportRowsKey(e.tipo, d.variante)] || [];
        return React.createElement('div', { className: 'rp-page', key: e.id },
          pre ? React.createElement('div', { className: 'rp-watermark' }, 'PRELIMINAR') : null,
          React.createElement('div', { className: 'rp-header small' },
            React.createElement('img', { src: 'assets/labtesa-logo.jpg', className: 'rp-logo sm', alt: 'LABTESA' }),
            React.createElement('span', { className: 'mono dim sm' }, 'OT ' + ot.nro_ot)
          ),
          React.createElement('h2', { className: 'rp-ensayo-title' },
            React.createElement('span', { className: 'rp-ensayo-n' }, idx + 1),
            'Ensayo de ' + window.LabStore.labels[e.tipo]
          ),
          params.length ? React.createElement('div', { className: 'rp-params' },
            params.map(function (p, i) { return React.createElement('div', { key: i, className: 'rp-param' },
              React.createElement('span', { className: 'rp-param-k' }, p.label),
              React.createElement('span', { className: 'rp-param-v' }, p.value)); })
          ) : null,
          e.tipo === 'nick-break' ? React.createElement('div', { className: 'rp-result-line' },
            React.createElement('span', { className: 'rp-label' }, 'Resultado'),
            React.createElement('strong', null, d.variante_resultado || '—')) : null,
          tbl && rows.length ? React.createElement('table', { className: 'rp-table' },
            React.createElement('thead', null, React.createElement('tr', null,
              tbl.columns.map(function (c) { return React.createElement('th', { key: c.key }, c.label); }))),
            React.createElement('tbody', null,
              rows.map(function (r, ri) { return React.createElement('tr', { key: ri },
                tbl.columns.map(function (c) {
                  var val = r[c.key];
                  var cls = (c.key === 'resultado') ? (val === 'Aprobado' ? 'rp-ok' : val === 'No aprobado' ? 'rp-bad' : '') : '';
                  return React.createElement('td', { key: c.key, className: cls }, val == null || val === '' ? '—' : val);
                })); })
            )
          ) : null,
          d.observaciones ? React.createElement('div', { className: 'rp-obs' },
            React.createElement('span', { className: 'rp-label' }, 'Observaciones'),
            React.createElement('p', null, d.observaciones)) : null,
          React.createElement('div', { className: 'rp-foot' },
            React.createElement('span', null, 'LABTESA — Laboratorio Industrial'),
            React.createElement('span', null, 'Página ' + (idx + 2) + ' de ' + (ot.ensayos.length + 1)))
        );
      })
    ),
    React.createElement('div', { className: 'modal-actions report-prev-actions' },
      React.createElement(Button, { variant: 'ghost', onClick: props.onClose }, 'Cerrar'),
      React.createElement(Button, { variant: 'primary', icon: 'download', onClick: props.onGenerate }, 'Descargar .docx')
    )
  );
}

function rpRow(k, v) {
  return React.createElement('div', { className: 'rp-datarow', key: k },
    React.createElement('span', { className: 'rp-datak' }, k),
    React.createElement('span', { className: 'rp-datav' }, v || '—'));
}

Object.assign(window, { ReportPreview: ReportPreview });
