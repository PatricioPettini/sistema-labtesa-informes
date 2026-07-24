// ─── Storage: borradores en localStorage ──────────────────────────────────────
// Clave: "borrador_{nro_ot}_{tipo_ensayo}"

const Storage = {
  guardarBorrador(nro_ot, tipo, datos) {
    if (!nro_ot || !tipo) return;
    localStorage.setItem(`borrador_${nro_ot}_${tipo}`, JSON.stringify(datos));
  },

  cargarBorrador(nro_ot, tipo) {
    const raw = localStorage.getItem(`borrador_${nro_ot}_${tipo}`);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },

  borrarBorrador(nro_ot, tipo) {
    localStorage.removeItem(`borrador_${nro_ot}_${tipo}`);
  },

  listarOTs() {
    const ots = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('borrador_')) {
        const partes = k.split('_');
        if (partes[1]) ots.add(partes[1]);
      }
    }
    return [...ots];
  },
};
