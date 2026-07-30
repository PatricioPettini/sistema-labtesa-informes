---
name: feedback-imagen-carga
description: "La imagen de carátula tiene que poder RECORTAR bordes (handles), no solo arrastrarse dentro de un marco fijo"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c5c044d2-65b7-4651-b7d7-86330cf78d1e
---

El editor de foto de carátula (`public-new/photogrid.jsx` → `PhotoEditor`) debe permitir **recorte libre con handles** (4 esquinas + 4 lados) sobre la imagen completa.

**Why:** El sistema anterior (pan+zoom dentro de marco fijo) solo dejaba reposicionar la imagen, no permitía cortar bordes específicos. El usuario necesitaba recortar bordes laterales y eso era imposible.

**How to apply:** Si alguien quiere "mover", "arrastrar" o "zoom" la imagen de carátula, asegurarse de que el componente real ofrece recorte libre con handles arrastrables. La función `apply()` convierte coordenadas del visor a coordenadas naturales para generar el canvas recortado.

Mantener también: girar izq/der, espejar, "toda la imagen" (reset).
