/* LABTESA — barra de plantillas de ensayo (presets).
 * Se inserta en EnsayoForm para permitir guardar/aplicar presets por tipo.
 */

function PlantillasBar(props) {
  var tipo = props.tipo;
  var toast = useToast();
  var _list = React.useState([]); var list = _list[0], setList = _list[1];
  var _sel  = React.useState('');  var sel  = _sel[0], setSel = _sel[1];
  var _save = React.useState(false); var saveOpen = _save[0], setSaveOpen = _save[1];

  function cargar() {
    fetch('/api/plantillas?tipo=' + encodeURIComponent(tipo))
      .then(function (r) { return r.json(); })
      .then(function (d) { setList(Array.isArray(d) ? d : []); })
      .catch(function () { setList([]); });
  }
  React.useEffect(cargar, [tipo]);

  function aplicar() {
    if (!sel) return;
    fetch('/api/plantillas/' + sel)
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        props.onApply(r.d.datos);
        toast('Plantilla "' + r.d.nombre + '" aplicada. Revisá los campos antes de guardar.', 'success');
      })
      .catch(function (e) { toast('Error al aplicar: ' + e.message, 'danger'); });
  }

  function borrar() {
    if (!sel) return;
    if (!confirm('¿Eliminar la plantilla seleccionada?')) return;
    fetch('/api/plantillas/' + sel, { method: 'DELETE' })
      .then(function () { setSel(''); cargar(); toast('Plantilla eliminada', 'success'); });
  }

  function onGuardarPlantilla(nombre, descripcion) {
    return fetch('/api/plantillas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: tipo, nombre: nombre, descripcion: descripcion, datos_json: props.datos }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.d.error || 'Error');
        toast('Plantilla "' + nombre + '" guardada', 'success');
        cargar();
        setSaveOpen(false);
      });
  }

  return React.createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '8px 12px', background: '#f6f8fa',
      border: '1px solid var(--border)', borderRadius: 6, marginBottom: 12,
      fontSize: 13,
    }
  },
    React.createElement('span', { style: { fontWeight: 600, color: 'var(--text-3)' } },
      'Plantilla:'),
    list.length === 0
      ? React.createElement('span', { style: { color: 'var(--text-3)', fontStyle: 'italic', fontSize: 12 } },
          'sin plantillas guardadas para ' + tipo)
      : React.createElement('select', {
          className: 'input', value: sel,
          onChange: function (e) { setSel(e.target.value); },
          style: { minWidth: 220, padding: '4px 8px', fontSize: 12 }
        },
          React.createElement('option', { value: '' }, '— elegir —'),
          list.map(function (p) {
            return React.createElement('option', { key: p.id, value: p.id },
              p.nombre + (p.descripcion ? ' (' + p.descripcion + ')' : ''));
          })
        ),
    list.length > 0 ? React.createElement('button', {
      className: 'btn btn-soft btn-sm', disabled: !sel, onClick: aplicar
    }, 'Aplicar') : null,
    list.length > 0 ? React.createElement('button', {
      className: 'btn btn-ghost btn-sm', disabled: !sel, onClick: borrar,
      title: 'Eliminar plantilla'
    }, 'Borrar') : null,
    React.createElement('div', { style: { flex: 1 } }),
    React.createElement('button', {
      className: 'btn btn-default btn-sm',
      onClick: function () { setSaveOpen(true); }
    }, '💾 Guardar como plantilla'),

    saveOpen ? React.createElement(SaveTemplateModal, {
      onSubmit: onGuardarPlantilla,
      onCancel: function () { setSaveOpen(false); }
    }) : null
  );
}

function SaveTemplateModal(props) {
  var _n = React.useState('');  var nombre = _n[0], setNombre = _n[1];
  var _d = React.useState('');  var descr = _d[0], setDescr = _d[1];
  var _b = React.useState(false); var busy = _b[0], setBusy = _b[1];
  var _e = React.useState('');  var err = _e[0], setErr = _e[1];

  function submit() {
    if (!nombre) { setErr('Ingresá un nombre.'); return; }
    setBusy(true); setErr('');
    props.onSubmit(nombre, descr)
      .catch(function (e) { setErr(e.message || 'Error'); })
      .finally(function () { setBusy(false); });
  }

  return React.createElement('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
             display: 'flex', alignItems: 'center', justifyContent: 'center' }
  },
    React.createElement('div', {
      style: { background: '#fff', borderRadius: 8, width: 440, padding: 20 }
    },
      React.createElement('h3', { style: { margin: 0, marginBottom: 6 } }, 'Guardar plantilla'),
      React.createElement('p', { style: { fontSize: 12, color: 'var(--text-3)', margin: '0 0 14px 0' } },
        'Se guarda el estado actual del formulario. Luego podés reusarlo en otro ensayo del mismo tipo.'),
      React.createElement('div', { style: { marginBottom: 10 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Nombre'),
        React.createElement('input', {
          className: 'input', autoFocus: true, value: nombre,
          onChange: function (e) { setNombre(e.target.value); },
          placeholder: 'Ej: Tracción ASTM A320 típico'
        })
      ),
      React.createElement('div', { style: { marginBottom: 12 } },
        React.createElement('label', { style: { display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-3)' } }, 'Descripción (opcional)'),
        React.createElement('input', {
          className: 'input', value: descr,
          onChange: function (e) { setDescr(e.target.value); },
          placeholder: 'Ej: para varillas roscadas grado B7'
        })
      ),
      err ? React.createElement('div', { style: { color: '#b02a2a', fontSize: 12, marginBottom: 10 } }, err) : null,
      React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
        React.createElement(Button, { variant: 'ghost', size: 'sm', onClick: props.onCancel, disabled: busy }, 'Cancelar'),
        React.createElement(Button, { variant: 'primary', size: 'sm', onClick: submit, loading: busy }, 'Guardar')
      )
    )
  );
}

window.PlantillasBar = PlantillasBar;
