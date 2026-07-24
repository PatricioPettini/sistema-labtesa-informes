// ─── Lógica común a todos los formularios ─────────────────────────────────────

// Toast
function toast(msg, tipo = 'ok', ms = 3500) {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const kind = tipo === 'ok' ? 'success' : tipo === 'error' ? 'error' : 'info';
  const iconName = kind === 'success' ? 'check-circle' : kind === 'error' ? 'x-circle' : 'info';
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', 'status');
  el.innerHTML = (typeof getIcon === 'function' ? getIcon(iconName) : '') +
    `<div class="toast-body"><div class="toast-title">${msg}</div></div>`;
  stack.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Formatear fecha Date → dd/mm/yyyy
function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [yyyy, mm, dd] = fechaISO.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

// Hoy en formato yyyy-mm-dd (para inputs type=date)
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Validar campos requeridos (marca en rojo los vacíos, devuelve true si todo OK)
function validarRequeridos(form) {
  let ok = true;
  form.querySelectorAll('[data-required]').forEach(el => {
    el.classList.remove('error');
    if (!el.value?.trim()) {
      el.classList.add('error');
      ok = false;
    }
  });
  if (!ok) toast('Completá los campos obligatorios marcados en rojo', 'error');
  return ok;
}

// Auto-guardar borrador en localStorage cada vez que cambia un campo
function activarAutoguardado(form, nro_ot, tipo, recolector) {
  if (!nro_ot || !tipo) return;
  const collect = recolector || (() => recolectarDatosForm(form));
  form.addEventListener('input', () => Storage.guardarBorrador(nro_ot, tipo, collect()));
  form.addEventListener('change', () => Storage.guardarBorrador(nro_ot, tipo, collect()));
}

// Leer todos los campos del form en un objeto plano
function recolectarDatosForm(form) {
  const datos = {};
  const seen = new Set();

  form.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.name) return;
    if (el.type === 'file') return;

    if (el.type === 'checkbox') {
      if (!seen.has(el.name)) {
        // Grupo de checkboxes con mismo name → array
        const grupo = form.querySelectorAll(`input[name="${el.name}"]`);
        if (grupo.length > 1) {
          datos[el.name] = [...grupo].filter(c => c.checked).map(c => c.value);
        } else {
          datos[el.name] = el.checked;
        }
        seen.add(el.name);
      }
    } else if (el.type === 'radio') {
      if (el.checked) datos[el.name] = el.value;
    } else {
      datos[el.name] = el.value;
    }
  });

  return datos;
}

// Rellenar formulario desde un objeto
function rellenarForm(form, datos) {
  if (!datos) return;
  Object.entries(datos).forEach(([name, valor]) => {
    const els = form.querySelectorAll(`[name="${name}"]`);
    if (!els.length) return;

    if (els[0].type === 'checkbox' && els.length > 1) {
      // Grupo checkbox → array de valores
      const vals = Array.isArray(valor) ? valor : [valor];
      els.forEach(el => { el.checked = vals.includes(el.value); });
    } else if (els[0].type === 'checkbox') {
      els[0].checked = !!valor;
    } else if (els[0].type === 'radio') {
      els.forEach(el => { el.checked = el.value === valor; });
    } else {
      els[0].value = valor ?? '';
    }
  });
}

// Guardar ensayo en el servidor
async function guardarEnsayoServidor(nro_ot, tipo, datosJson) {
  const resp = await fetch('/api/ensayo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nro_ot, tipo, datos_json: datosJson }),
  });
  if (!resp.ok) {
    let msg = 'Error al guardar';
    try { msg = (await resp.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return resp.json();
}

// Generar y descargar Word
// fotosEditadas: array de { original: File|Blob, edited: Blob|null, name: string }
async function generarWord(nro_ot, fotosInput, fotosEditadas) {
  const formData = new FormData();
  if (fotosEditadas && fotosEditadas.length > 0) {
    fotosEditadas.forEach((f, i) => {
      const blob = f.edited || f.original;
      formData.append('fotos', blob, f.name || `foto_${i + 1}.jpg`);
    });
  } else if (fotosInput && fotosInput.files) {
    [...fotosInput.files].forEach(f => formData.append('fotos', f));
  }

  const resp = await fetch(`/api/generate/${nro_ot}`, { method: 'POST', body: formData });
  if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || 'Error al generar Word');

  const blob = await resp.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  // Usar el nombre que devuelve el servidor desde Content-Disposition
  const cd      = resp.headers.get('Content-Disposition') || '';
  const fnMatch = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
  a.download    = fnMatch ? decodeURIComponent(fnMatch[1]) : `OT_${nro_ot}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
