// ─── Integración Trello (vía proxy del servidor) ───────────────────────────────

const TrelloAPI = {
  async cargarTarjeta(url) {
    const resp = await fetch(`/api/trello/card?url=${encodeURIComponent(url)}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Error ${resp.status}`);
    }
    return resp.json();
  },
};
