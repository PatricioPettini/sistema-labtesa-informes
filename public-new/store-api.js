/* LABTESA Lab-Informes — capa de datos real (caché en memoria + API REST)
   Mantiene exactamente la misma interfaz pública que store.js (mock).
   Las lecturas son síncronas desde el caché.
   Las escrituras actualizan el caché optimísticamente y persisten a la API. */
(function () {
  'use strict';

  // ── Caché en memoria ────────────────────────────────────────────────────────
  var _db = { ots: [], ensayos: [], clientes: [], equipos: [], normas: [], eventos: {} };

  // ── Helpers de calibración ──────────────────────────────────────────────────
  function calibStatus(venc) {
    if (!venc) return 'vigente';
    var hoy  = new Date();
    var v    = new Date(venc + 'T00:00:00');
    var dias = Math.round((v - hoy) / 86400000);
    if (dias < 0) return 'vencido';
    if (dias <= 45) return 'por-vencer';
    return 'vigente';
  }
  function diasParaVencer(venc) {
    if (!venc) return null;
    return Math.round(
      (new Date(venc + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00'))
      / 86400000
    );
  }

  // ── Etiquetas estáticas ─────────────────────────────────────────────────────
  var ENSAYO_LABELS = {
    traccion: 'Tracción',
    impacto: 'Impacto Charpy',
    'dureza-brinell': 'Dureza Brinell',
    'dureza-rockwell': 'Dureza Rockwell',
    'dureza-vickers': 'Dureza Vickers',
    plegado: 'Plegado',
    quimicos: 'Análisis Químico',
    'nick-break': 'Nick Break',
    'ferrita-delta': 'Ferrita Delta',
    // Modelo F2 — 8 ensayos metalográficos
    microestructura:        'Microestructura',
    'tamano-grano':         'Tamaño de grano',
    inclusiones:            'Inclusiones',
    'estructura-grafito':   'Estructura de grafito',
    'espesor-capa':         'Espesor de capa',
    decarburacion:          'Decarburación',
    'defectos-superficiales': 'Defectos superficiales',
    porosidad:              'Porosidad',
    macrografia:            'Macrografía',
    rugosidad:              'Rugosidad',
    varios:                 'Ensayos varios',
    'liquidos-penetrantes': 'Líquidos Penetrantes',
    'metalografia-general': 'Análisis Metalográfico General',
    'anexo-metalografico':  'Anexo Metalográfico',
    'tratamientos-termicos':'Tratamientos Térmicos',
  };
  var ENSAYO_ABBR = {
    traccion: 'TRACC', impacto: 'IMP', 'dureza-brinell': 'HB',
    'dureza-rockwell': 'HR', 'dureza-vickers': 'HV', plegado: 'PLG',
    quimicos: 'QUIM', 'nick-break': 'NB', 'ferrita-delta': 'δFe',
    microestructura: 'MIC', 'tamano-grano': 'TG', inclusiones: 'INC',
    'estructura-grafito': 'GRA', 'espesor-capa': 'CAP', decarburacion: 'DEC',
    'defectos-superficiales': 'DEF', porosidad: 'POR',
    macrografia: 'MAC',
    rugosidad: 'RUG',
    varios: 'VAR',
    'liquidos-penetrantes': 'LP',
    'metalografia-general': 'MET',
    'anexo-metalografico':  'AME',
    'tratamientos-termicos':'TT',
  };

  // ── API fetch helper ────────────────────────────────────────────────────────
  function apiFetch(method, path, body) {
    var opts = { method: method };
    if (body !== undefined) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).catch(function (err) {
      // Falla de red antes de llegar al server (server caído, LAN cortada).
      var e = new Error('No se pudo conectar al servidor (' + (err && err.message || 'network') + ')');
      e.stage = 'browser-network';
      throw e;
    }).then(function (r) {
      if (r.status === 204) return {};
      if (!r.ok) {
        return r.json().then(function (e) {
          // Preserva hint/stage/code para toasts descriptivos.
          var err = new Error(e.error || r.statusText);
          if (e.hint)  err.hint  = e.hint;
          if (e.stage) err.stage = e.stage;
          if (e.code)  err.code  = e.code;
          err.status = r.status;
          err.data = e;   // Body completo — permite acceder a ensayo_id, estado_firma, etc.
          throw err;
        }, function () { throw new Error(r.statusText || ('HTTP ' + r.status)); });
      }
      return r.json();
    });
  }

  // ── Error toast (cuando la API falla en escrituras async) ───────────────────
  function apiErr(msg) {
    if (window._labToastErr) window._labToastErr(msg);
    else console.error('[store-api]', msg);
  }

  // ── Normalizar OT desde API (tipos_ensayo string → array si viene de /api/ots) ─
  function normalizeOt(ot) {
    if (typeof ot.tipos_ensayo === 'string') {
      ot.tipos_ensayo = ot.tipos_ensayo ? ot.tipos_ensayo.split(',') : [];
    }
    if (!ot.tipos_ensayo) ot.tipos_ensayo = [];
    return ot;
  }

  // ── init() — precarga todo desde la API ────────────────────────────────────
  function init() {
    return Promise.all([
      apiFetch('GET', '/api/ots-v2'),
      apiFetch('GET', '/api/ensayos'),
      apiFetch('GET', '/api/clientes'),
      apiFetch('GET', '/api/equipos'),
      apiFetch('GET', '/api/normas'),
    ]).then(function (results) {
      _db.ots      = results[0].map(normalizeOt);
      _db.ensayos  = results[1];
      _db.clientes = results[2];
      _db.equipos  = results[3];
      _db.normas   = results[4];
    });
  }

  // ── Implementación del Store ────────────────────────────────────────────────
  var Store = {
    labels: ENSAYO_LABELS,
    abbr:   ENSAYO_ABBR,
    init:   init,

    // ── OTs ──────────────────────────────────────────────────────────────────

    listOts: function () {
      return _db.ots.slice().sort(function (a, b) {
        return (b.creado_en || '').localeCompare(a.creado_en || '');
      }).map(function (ot) {
        // Comparación laxa (String(...)) porque nro_ot puede venir como
        // string desde el backend o número desde el cache legacy. Sin esto,
        // los ensayos hermanos creados vía saveEnsayoXxxMultiOt no aparecían
        // porque _db.ensayos guarda string y _db.ots guardaba number (o al revés).
        var otNro = String(ot.nro_ot);
        var tipos = _db.ensayos
          .filter(function (e) { return String(e.nro_ot) === otNro; })
          .sort(function (a, b) { return a.orden - b.orden; })
          .map(function (e) { return e.tipo; });
        return Object.assign({}, ot, { tipos_ensayo: tipos });
      });
    },

    getOt: function (nro_ot) {
      var target = String(nro_ot);
      var ot = _db.ots.find(function (o) { return String(o.nro_ot) === target; });
      if (!ot) return null;
      var ensayos = _db.ensayos
        .filter(function (e) { return String(e.nro_ot) === target; })
        .sort(function (a, b) { return a.orden - b.orden; });
      return Object.assign({}, ot, { ensayos: ensayos });
    },

    // Todas las OTs de la misma solicitud (para navegar entre OTs hermanas).
    listOtsBySolicitud: function (nro_solicitud) {
      var sol = String(nro_solicitud || '').trim();
      if (!sol) return [];
      return _db.ots
        .filter(function (o) { return String(o.nro_solicitud || '').trim() === sol; })
        .sort(function (a, b) { return String(a.nro_ot).localeCompare(String(b.nro_ot)); });
    },

    // Actualiza datos administrativos que aplican a TODAS las OTs de una
    // solicitud (fecha_aprobacion, razon_social, nro_cliente, trello_url).
    // Devuelve Promise con { actualizadas, errores }.
    updateSolicitud: function (nro_solicitud, patch) {
      var self = this;
      var hermanas = self.listOtsBySolicitud(nro_solicitud);
      var proms = hermanas.map(function (o) {
        // Mutación local (optimistic) + PATCH al backend.
        Object.assign(o, patch);
        return apiFetch('PATCH', '/api/ot/' + encodeURIComponent(o.nro_ot), patch)
          .then(function () { return { nro_ot: o.nro_ot, ok: true }; })
          .catch(function (e) { return { nro_ot: o.nro_ot, ok: false, error: e.message }; });
      });
      return Promise.all(proms).then(function (results) {
        var actualizadas = results.filter(function (r) { return r.ok; });
        var errores     = results.filter(function (r) { return !r.ok; });
        return { actualizadas: actualizadas, errores: errores };
      });
    },

    createOt: function (data) {
      var ot = Object.assign({ es_preinforme: 0, fotos_json: null,
        creado_en: new Date().toISOString() }, data);
      _db.ots.push(ot);
      apiFetch('POST', '/api/ot', data)
        .then(function (row) {
          var idx = _db.ots.findIndex(function (o) { return o.nro_ot === row.nro_ot; });
          if (idx >= 0) _db.ots[idx] = normalizeOt(row);
        })
        .catch(function (e) { apiErr('Error al crear OT: ' + e.message); });
      return ot;
    },

    updateOt: function (nro_ot, data) {
      var ot = _db.ots.find(function (o) { return o.nro_ot === nro_ot; });
      if (ot) Object.assign(ot, data);
      // Para updates parciales (es_preinforme, fechas, trello_url) usamos PATCH.
      // El POST /api/ot exige nro_solicitud + razon_social que no necesitan
      // recargarse en una actualización de un solo campo.
      var PATCH_FIELDS = ['es_preinforme', 'fecha_recepcion', 'fecha_aprobacion', 'fecha_finalizacion', 'trello_url', 'inspeccion_texto'];
      var soloParcial = Object.keys(data).every(function (k) { return PATCH_FIELDS.indexOf(k) >= 0; });
      if (soloParcial) {
        apiFetch('PATCH', '/api/ot/' + encodeURIComponent(nro_ot), data)
          .catch(function (e) { apiErr('Error al actualizar OT: ' + e.message); });
      } else {
        apiFetch('POST', '/api/ot', Object.assign({ nro_ot: nro_ot }, data))
          .catch(function (e) { apiErr('Error al actualizar OT: ' + e.message); });
      }
      // La fecha de aprobación es una decisión de GERENCIA sobre la solicitud
      // completa, no por OT individual. Si se está actualizando, propagar a
      // todas las OTs hermanas de la misma solicitud (mutación local + PATCH).
      if (Object.prototype.hasOwnProperty.call(data, 'fecha_aprobacion') && ot && ot.nro_solicitud) {
        var sol = String(ot.nro_solicitud).trim();
        if (sol) {
          _db.ots.forEach(function (h) {
            if (String(h.nro_solicitud || '').trim() !== sol) return;
            if (h.nro_ot === nro_ot) return; // ya se actualizó arriba
            h.fecha_aprobacion = data.fecha_aprobacion;
            apiFetch('PATCH', '/api/ot/' + encodeURIComponent(h.nro_ot), { fecha_aprobacion: data.fecha_aprobacion })
              .catch(function (e) { apiErr('Error al propagar fecha de aprobación a OT ' + h.nro_ot + ': ' + e.message); });
          });
        }
      }
      return ot;
    },

    deleteOt: function (nro_ot) {
      _db.ots     = _db.ots.filter(function (o) { return o.nro_ot !== nro_ot; });
      _db.ensayos = _db.ensayos.filter(function (e) { return e.nro_ot !== nro_ot; });
      delete _db.eventos[nro_ot];
      apiFetch('DELETE', '/api/ot/' + nro_ot)
        .catch(function (e) { apiErr('Error al eliminar OT: ' + e.message); });
    },

    duplicateOt: function (fromOt, data, opts) {
      var src = _db.ots.find(function (o) { return o.nro_ot === fromOt; });
      if (!src) return null;
      // Copia las 3 fechas del original (el backend hace lo mismo via UPSERT)
      var nueva = this.createOt(Object.assign({
        nro_cliente: src.nro_cliente, razon_social: src.razon_social,
        id_muestra: src.id_muestra,
        fecha_recepcion:    src.fecha_recepcion    || '',
        fecha_aprobacion:   src.fecha_aprobacion   || '',
        fecha_finalizacion: src.fecha_finalizacion || '',
        trello_url: '',
      }, data));

      if (opts && opts.ensayos) {
        var src_ensayos = _db.ensayos
          .filter(function (e) { return e.nro_ot === fromOt; })
          .sort(function (a, b) { return a.orden - b.orden; });
        src_ensayos.forEach(function (e, i) {
          var ne = { id: Date.now() + i, nro_ot: nueva.nro_ot, tipo: e.tipo,
                     orden: i + 1, datos_json: e.datos_json, creado_en: new Date().toISOString() };
          _db.ensayos.push(ne);
        });
      }
      if (opts && opts.fotos) nueva.fotos_json = src.fotos_json;

      apiFetch('POST', '/api/ot/' + fromOt + '/duplicate', {
        nro_ot: nueva.nro_ot,
        nro_solicitud: data.nro_solicitud || null,
        id_muestra: data.id_muestra || null,
        trello_url: data.trello_url || null,
        copiar_ensayos: !!(opts && opts.ensayos),
        copiar_fotos: !!(opts && opts.fotos),
      }).then(function (row) {
        var idx = _db.ots.findIndex(function (o) { return o.nro_ot === row.nro_ot; });
        if (idx >= 0) _db.ots[idx] = normalizeOt(row);
        // Re-sincronizar ensayos clonados si la API los creó
        if (opts && opts.ensayos) {
          return apiFetch('GET', '/api/ensayos').then(function (rows) {
            _db.ensayos = rows;
          });
        }
      }).catch(function (e) { apiErr('Error al duplicar OT: ' + e.message); });

      return nueva;
    },

    // ── Ensayos ───────────────────────────────────────────────────────────────

    saveEnsayo: function (nro_ot, tipo, datos, existingId, opts) {
      // opts.onError(err): callback opcional para manejar errores custom (ej.
      // interceptar 423 ENSAYO_FIRMADO y mostrar modal de desfirma en vez del
      // toast por default). Si onError devuelve true, no se muestra el toast.
      var onError = opts && typeof opts.onError === 'function' ? opts.onError : null;
      function handleErr(er) {
        if (onError && onError(er) === true) return;
        apiErr('Error al guardar ensayo: ' + er.message);
      }
      var jsonStr = JSON.stringify(datos);
      if (existingId) {
        var e = _db.ensayos.find(function (x) { return x.id === existingId; });
        if (e) { e.datos_json = jsonStr; }
        apiFetch('POST', '/api/ensayo', { id: existingId, nro_ot: nro_ot, tipo: tipo, datos_json: jsonStr })
          .catch(handleErr);
        return e || null;
      }
      var orden = _db.ensayos.filter(function (x) { return x.nro_ot === nro_ot; }).length + 1;
      var ne = { id: Date.now(), nro_ot: nro_ot, tipo: tipo, orden: orden,
                 datos_json: jsonStr, creado_en: new Date().toISOString() };
      _db.ensayos.push(ne);
      apiFetch('POST', '/api/ensayo', { nro_ot: nro_ot, tipo: tipo, datos_json: jsonStr, force_create: true })
        .then(function (row) {
          // Actualizar el id temporal con el real de la DB
          var idx = _db.ensayos.findIndex(function (x) { return x.id === ne.id; });
          if (idx >= 0) _db.ensayos[idx] = row;
          ne.id = row.id;
        })
        .catch(handleErr);
      return ne;
    },

    // Guarda el ensayo de tracción con split por OT: las muestras que tengan
    // nro_ot_override apuntando a otra OT se transfieren al ensayo de tracción
    // de esa OT hermana (creando el ensayo allí si no existe). En la OT actual
    // queda un ensayo con SOLO sus muestras propias. Es una operación asíncrona
    // (varios saves en paralelo). Devuelve Promise con resumen del split:
    //   { otActual, otsHermanas: [{ nro_ot, accion: 'creado' | 'actualizado', cantidad }] }
    saveEnsayoTraccionMultiOt: function (nro_ot_actual, datos, existingId) {
      var self = this;
      var muestras   = Array.isArray(datos.muestras) ? datos.muestras : [];
      var seccionCal = Array.isArray(datos.seccion_calc) ? datos.seccion_calc : [];
      var otActualStr = String(nro_ot_actual);
      // Agrupar índices por OT destino (override o actual). Preservar orden.
      var grupos = {}; // nro_ot → [idxOriginal, ...]
      muestras.forEach(function (m, i) {
        var over = String((m && m.nro_ot_override) || '').trim();
        var dest = over || otActualStr;
        (grupos[dest] = grupos[dest] || []).push(i);
      });
      // Helper: extrae subset de muestras + seccion_calc reindexado para un
      // grupo. Limpia _probeta_padre y nro_ot_override para que quede "propio"
      // de esa OT. Zonas cuyo padre no está en el grupo se degradan a probetas.
      function extraerGrupo(idxs) {
        var oldToNew = {};
        idxs.forEach(function (oldIdx, newIdx) { oldToNew[oldIdx] = newIdx; });
        var muestrasOut = idxs.map(function (oldIdx) {
          var m = Object.assign({}, muestras[oldIdx] || {});
          delete m.nro_ot_override; // ya está en su OT destino, no necesita override
          if (m._zona_extra && m._probeta_padre != null) {
            var nuevo = oldToNew[m._probeta_padre];
            if (nuevo != null) m._probeta_padre = nuevo;
            else { delete m._zona_extra; delete m._probeta_padre; }
          }
          return m;
        });
        var seccionOut = idxs.map(function (oldIdx) { return seccionCal[oldIdx] || {}; });
        return { muestras: muestrasOut, seccion_calc: seccionOut };
      }
      // Textos opcionales por OT (obs / eval / nota). Cada OT recibe SUS
      // propios textos aplanados a los campos raíz. El mapa `textos_por_ot`
      // NO se persiste en cada ensayo hijo (para no duplicar y para que al
      // reabrir cada uno vea solo sus propios textos como raíz).
      var mapaTextos = (datos && datos.textos_por_ot) || {};
      var TEXTO_KEYS = ['tiene_observacion', 'observacion_texto',
                        'tiene_evaluacion',  'evaluacion_texto',
                        'tiene_nota',        'nota_texto'];
      function aplanarTextosPara(nroOt) {
        var m = mapaTextos[nroOt] || {};
        var out = {};
        TEXTO_KEYS.forEach(function (k) {
          if (m[k] !== undefined) out[k] = m[k];
          else if (nroOt === otActualStr) {
            // Compat: para la OT del ensayo, si no hay entry en el mapa, usar
            // los raíz existentes (evita perder textos que estaban antes de
            // que existiera el mapa).
            if (datos[k] !== undefined) out[k] = datos[k];
          } else {
            // Para OTs hermanas sin entry: vacío/false.
            out[k] = (k.indexOf('tiene_') === 0) ? false : '';
          }
        });
        return out;
      }
      // Condiciones de la sección 1.2 (norma checkboxes, ITM, temperatura,
      // equipamiento, notas fijas). Se copian a hermanas via botón "Copiar
      // condiciones a otras OT" que escribe en condiciones_por_ot[<destino>].
      var mapaCond = (datos && datos.condiciones_por_ot) || {};
      function condsPara(nroOt) {
        var m = mapaCond[nroOt];
        return (m && Object.keys(m).length > 0) ? Object.assign({}, m) : null;
      }
      // 1) Datos para la OT actual: solo su grupo + sus textos aplanados.
      // También incluimos como destinos las OTs que aparezcan en
      // condiciones_por_ot (permite propagar la 1.2 aunque no haya split de
      // muestras hacia esa hermana).
      var otsDestSet = {};
      Object.keys(grupos).forEach(function (n) { otsDestSet[n] = true; });
      Object.keys(mapaCond).forEach(function (n) { if (n) otsDestSet[n] = true; });
      var otsDest = Object.keys(otsDestSet);
      var idxActual = grupos[otActualStr] || [];
      var datosActual = Object.assign({}, datos, aplanarTextosPara(otActualStr));
      delete datosActual.textos_por_ot;
      delete datosActual.condiciones_por_ot;
      var subActual = extraerGrupo(idxActual);
      datosActual.muestras = subActual.muestras;
      datosActual.seccion_calc = subActual.seccion_calc;
      // Persistir la OT actual (sync como saveEnsayo, pero via async para
      // esperar el guardado antes de propagar a hermanas).
      var promActual = self.saveEnsayoAsync(nro_ot_actual, 'traccion', datosActual, existingId || null);
      // 2) Cada OT destino distinta: buscar / crear ensayo tracción y agregar
      //    las muestras nuevas (concatenando a las que ya tenía).
      var hermanas = otsDest.filter(function (n) { return n !== otActualStr; });
      var promsHermanas = hermanas.map(function (nroY) {
        // Si esta OT solo está en el destino por condiciones_por_ot (no por
        // muestras override), grupos[nroY] no existe → sub es vacío.
        var sub = grupos[nroY] ? extraerGrupo(grupos[nroY]) : { muestras: [], seccion_calc: [] };
        // Buscar ensayo tracción existente en OT Y.
        var existente = _db.ensayos.find(function (e) {
          return String(e.nro_ot) === String(nroY) && e.tipo === 'traccion';
        });
        var overrideY = condsPara(nroY);
        var accion, datosY, existingIdY;
        if (existente) {
          accion = 'actualizado';
          existingIdY = existente.id;
          var datosPrev = {};
          try { datosPrev = JSON.parse(existente.datos_json || '{}'); } catch (e) {}
          var muestrasPrev = Array.isArray(datosPrev.muestras) ? datosPrev.muestras : [];
          var seccionPrev  = Array.isArray(datosPrev.seccion_calc) ? datosPrev.seccion_calc : [];
          // Descartar fila blank inicial del form: si la hermana tiene UNA sola
          // muestra y está totalmente vacía, no la mantenemos.
          if (muestrasPrev.length === 1) {
            var solaMu = muestrasPrev[0] || {};
            var muVacia = Object.keys(solaMu).every(function (k) {
              var v = solaMu[k];
              return v == null || v === '' || v === false;
            });
            if (muVacia) { muestrasPrev = []; seccionPrev = []; }
          }
          // Concatenar: las nuevas van al final. Reindexar _probeta_padre de las
          // muestras nuevas para que apunte a índices en el array combinado.
          var offset = muestrasPrev.length;
          var muestrasNuevasReindex = sub.muestras.map(function (m) {
            if (m._zona_extra && m._probeta_padre != null) {
              return Object.assign({}, m, { _probeta_padre: m._probeta_padre + offset });
            }
            return m;
          });
          // Aplanar los textos de esta OT (obs/eval/nota) y pisar los del
          // ensayo previo — el técnico está editando el registro y la OT
          // hermana debe reflejar su versión más reciente.
          var textosY = aplanarTextosPara(nroY);
          datosY = Object.assign({}, datosPrev, textosY, {
            muestras: muestrasPrev.concat(muestrasNuevasReindex),
            seccion_calc: seccionPrev.concat(sub.seccion_calc),
          });
          // Aplicar overrides de la sección 1.2 al final (pisan lo previo)
          // para que la copia explícita del botón "Copiar condiciones" gane.
          if (overrideY) Object.assign(datosY, overrideY);
          delete datosY.textos_por_ot;
          delete datosY.condiciones_por_ot;
        } else {
          accion = 'creado';
          // Copiar condiciones globales del ensayo actual (norma checkboxes,
          // equipamiento, ITM, temperatura, ecuación, notas fijas...) para que
          // el ensayo nuevo nazca con el mismo contexto que la OT actual.
          var CONDICIONES_GLOBALES = [
            'variante', 'metodologia', 'temperatura', 'ecuacion_seccion',
            'estado_superficial', 'verif_alineacion', 'prob_cliente', 'prob_soldada',
            'equipamiento', 'equipamiento_tags', 'otros_equipos',
            'norma_iso6892_1', 'norma_iso6892_1_year',
            'norma_astm_e8', 'norma_astm_e8_year',
            'norma_astm_a370', 'norma_astm_a370_year',
            'cod_asme', 'ed_asme', 'cod_api1104', 'cod_api5l', 'cod_aws_d11',
            'nota_evaluaciones', 'nota_no_conforme', 'nota_incertidumbre', 'nota_externo',
          ];
          datosY = Object.assign({}, aplanarTextosPara(nroY), {
            muestras: sub.muestras, seccion_calc: sub.seccion_calc,
          });
          CONDICIONES_GLOBALES.forEach(function (k) {
            if (datos[k] !== undefined) datosY[k] = datos[k];
          });
          if (overrideY) Object.assign(datosY, overrideY);
        }
        return self.saveEnsayoAsync(nroY, 'traccion', datosY, existingIdY).then(function (row) {
          return { nro_ot: nroY, accion: accion, cantidad: sub.muestras.length, id: row && row.id };
        });
      });
      return Promise.all([promActual].concat(promsHermanas)).then(function (results) {
        var actualRow = results[0];
        return {
          otActual: { nro_ot: otActualStr, id: actualRow && actualRow.id, cantidad: idxActual.length },
          otsHermanas: results.slice(1),
        };
      });
    },

    // Guarda un ensayo de plegado con split por OT — mismo patrón que
    // saveEnsayoTraccionMultiOt: las probetas con `nro_ot_override` apuntando a
    // otra OT se transfieren al ensayo de plegado de esa OT hermana (creando el
    // ensayo allí si no existe). En la OT actual queda un ensayo con SOLO sus
    // probetas propias. Devuelve Promise con resumen del split.
    saveEnsayoPlegadoMultiOt: function (nro_ot_actual, datos, existingId) {
      var self = this;
      var resultados = Array.isArray(datos.resultados) ? datos.resultados : [];
      var otActualStr = String(nro_ot_actual);
      // Agrupar índices por OT destino (override o actual).
      var grupos = {}; // nro_ot → [idxOriginal, ...]
      resultados.forEach(function (r, i) {
        var over = String((r && r.nro_ot_override) || '').trim();
        var dest = over || otActualStr;
        (grupos[dest] = grupos[dest] || []).push(i);
      });
      function extraerGrupo(idxs) {
        return idxs.map(function (oldIdx) {
          var r = Object.assign({}, resultados[oldIdx] || {});
          delete r.nro_ot_override; // ya está en su OT destino
          return r;
        });
      }
      // Textos opcionales por OT (obs / eval / nota).
      var mapaTextos = (datos && datos.textos_por_ot) || {};
      var TEXTO_KEYS = ['tiene_observacion', 'observacion_texto',
                        'tiene_evaluacion',  'evaluacion_texto',
                        'tiene_nota',        'nota_texto'];
      function aplanarTextosPara(nroOt) {
        var m = mapaTextos[nroOt] || {};
        var out = {};
        TEXTO_KEYS.forEach(function (k) {
          if (m[k] !== undefined) out[k] = m[k];
          else if (nroOt === otActualStr) {
            if (datos[k] !== undefined) out[k] = datos[k];
          } else {
            out[k] = (k.indexOf('tiene_') === 0) ? false : '';
          }
        });
        return out;
      }
      // condiciones_por_ot: mapa análogo a textos_por_ot pero con dos usos:
      //   1. Campos "por-OT" del generator (norma_ensayo_ot, codigo_referencia_ot,
      //      orientacion_ot, probeta_mec_ot) — se conservan en el mapa del hijo
      //      para que el generator los lea al emitir.
      //   2. Campos "raíz" (equipo, equipamiento, equipamiento_tags,
      //      otros_equipos) copiados con el botón "Copiar equipamiento a otras
      //      OT" — se APLANAN a la raíz del hijo (pisan lo que tenía).
      var mapaCond = (datos && datos.condiciones_por_ot) || {};
      // Campos que se copian a la RAÍZ del hijo (no al mapa por-OT). Incluye
      // los subsets de los botones "Copiar a otras OT" de las secciones 1.1
      // (metodología), 1.2 (condiciones) y 1.4 (equipamiento).
      var OVERRIDE_RAIZ_KEYS = [
        // 1.1 metodología
        'metodologia',
        // 1.2 condiciones
        'temperatura', 'estado_superficial', 'diametro_mandril',
        'espesor_probeta', 'ancho_probeta', 'distancia_apoyos', 'zona_plegado',
        // 1.4 equipamiento
        'equipo', 'equipamiento', 'equipamiento_tags', 'otros_equipos',
      ];
      function condsMapPara(nroOt) {
        var m = mapaCond[nroOt];
        if (!m) return {};
        // Copia SIN los campos raíz — solo los que le tocan al mapa por-OT.
        var soloMap = {};
        Object.keys(m).forEach(function (k) {
          if (OVERRIDE_RAIZ_KEYS.indexOf(k) < 0) soloMap[k] = m[k];
        });
        return Object.keys(soloMap).length > 0
          ? { condiciones_por_ot: { [nroOt]: soloMap } }
          : {};
      }
      function overridesRaizPara(nroOt) {
        var m = mapaCond[nroOt];
        if (!m) return {};
        var out = {};
        OVERRIDE_RAIZ_KEYS.forEach(function (k) {
          if (m[k] !== undefined) {
            out[k] = (typeof m[k] === 'object' && m[k] !== null && !Array.isArray(m[k]))
              ? Object.assign({}, m[k])
              : (Array.isArray(m[k]) ? m[k].slice() : m[k]);
          }
        });
        return out;
      }
      // OT actual: los destinos incluyen las OTs con probetas override y las
      // OTs mencionadas en condiciones_por_ot (aunque no tengan probetas
      // hermanas — permite propagar solo el equipamiento).
      var otsDestSet = {};
      Object.keys(grupos).forEach(function (n) { otsDestSet[n] = true; });
      Object.keys(mapaCond).forEach(function (n) { if (n) otsDestSet[n] = true; });
      var otsDest = Object.keys(otsDestSet);
      var idxActual = grupos[otActualStr] || [];
      var datosActual = Object.assign({}, datos, aplanarTextosPara(otActualStr), condsMapPara(otActualStr));
      delete datosActual.textos_por_ot;
      if (!datosActual.condiciones_por_ot) delete datosActual.condiciones_por_ot;
      datosActual.resultados = extraerGrupo(idxActual);
      var promActual = self.saveEnsayoAsync(nro_ot_actual, 'plegado', datosActual, existingId || null);
      // OTs hermanas: buscar / crear ensayo de plegado y agregar las probetas.
      var hermanas = otsDest.filter(function (n) { return n !== otActualStr; });
      var promsHermanas = hermanas.map(function (nroY) {
        var subResultados = grupos[nroY] ? extraerGrupo(grupos[nroY]) : [];
        var existente = _db.ensayos.find(function (e) {
          return String(e.nro_ot) === String(nroY) && e.tipo === 'plegado';
        });
        var overrideRaiz = overridesRaizPara(nroY);
        var accion, datosY, existingIdY;
        if (existente) {
          accion = 'actualizado';
          existingIdY = existente.id;
          var datosPrev = {};
          try { datosPrev = JSON.parse(existente.datos_json || '{}'); } catch (e) {}
          var resultadosPrev = Array.isArray(datosPrev.resultados) ? datosPrev.resultados : [];
          // Descartar la fila blank inicial que el form inserta al crear un
          // ensayo nuevo: si la hermana tiene UNA sola fila y está totalmente
          // vacía, no concatenar (sino queda [vacía, fila1, fila2]).
          if (resultadosPrev.length === 1) {
            var solaRow = resultadosPrev[0] || {};
            var vacia = Object.keys(solaRow).every(function (k) {
              var v = solaRow[k];
              return v == null || v === '' || v === false;
            });
            if (vacia) resultadosPrev = [];
          }
          var textosY = aplanarTextosPara(nroY);
          datosY = Object.assign({}, datosPrev, textosY, condsMapPara(nroY), {
            resultados: resultadosPrev.concat(subResultados),
          });
          // Aplicar overrides "raíz" del botón Copiar equipamiento (equipo,
          // equipamiento, equipamiento_tags, otros_equipos) al final para pisar.
          Object.assign(datosY, overrideRaiz);
          delete datosY.textos_por_ot;
          if (!datosY.condiciones_por_ot) delete datosY.condiciones_por_ot;
        } else {
          accion = 'creado';
          // Copiar condiciones globales del ensayo actual (norma, equipamiento,
          // ITM, temperatura, orientación, checkboxes de notas, etc.).
          var CONDICIONES_GLOBALES = [
            'equipo', 'variante_equipo', 'metodologia',
            'temperatura', 'estado_superficial', 'diametro_mandril',
            'espesor_probeta', 'ancho_probeta', 'orientacion',
            'probeta_mecanizada_segun', '_mecAuto',
            'distancia_apoyos', 'zona_plegado',
            'equipamiento', 'equipamiento_tags', 'otros_equipos',
            'norma_iso5173', 'norma_iso5173_year',
            'norma_astm_e190', 'norma_astm_e190_year',
            'cod_asme', 'ed_asme', 'cod_api1104', 'ed_api1104',
            'cod_aws_d11', 'ed_aws_d11', 'norma_referencia',
            'observaciones_extra', 'inspeccion_por',
            'nota_evaluaciones', 'nota_no_conforme', 'nota_mecanizada',
            'nota_incertidumbre', 'nota_externo',
          ];
          datosY = Object.assign({}, aplanarTextosPara(nroY), condsMapPara(nroY), {
            resultados: subResultados,
          });
          CONDICIONES_GLOBALES.forEach(function (k) {
            if (datos[k] !== undefined) datosY[k] = datos[k];
          });
          // Aplicar overrides "raíz" del botón (pisan lo global).
          Object.assign(datosY, overrideRaiz);
          if (!datosY.condiciones_por_ot) delete datosY.condiciones_por_ot;
        }
        return self.saveEnsayoAsync(nroY, 'plegado', datosY, existingIdY).then(function (row) {
          return { nro_ot: nroY, accion: accion, cantidad: subResultados.length, id: row && row.id };
        });
      });
      return Promise.all([promActual].concat(promsHermanas)).then(function (results) {
        var actualRow = results[0];
        return {
          otActual: { nro_ot: otActualStr, id: actualRow && actualRow.id, cantidad: idxActual.length },
          otsHermanas: results.slice(1),
        };
      });
    },

    // Propagación multi-OT para brinell: brinell NO divide `mediciones` por OT
    // (esas filas quedan enteras en la OT actual — la columna "OT" es texto
    // libre para el docx). Este saver solo replica normas / condiciones /
    // equipamiento a los ensayos brinell de las OTs hermanas listadas en
    // `datos.condiciones_por_ot`. Si la hermana no tiene un ensayo brinell,
    // se crea con esos overrides + condiciones globales. Si ya lo tiene, se
    // pisan los campos overrideados (no toca sus mediciones).
    saveEnsayoBrinellMultiOt: function (nro_ot_actual, datos, existingId) {
      var self = this;
      var otActualStr = String(nro_ot_actual);
      var mapaCond = (datos && datos.condiciones_por_ot) || {};
      // Todo lo que puede propagarse a la raíz del hijo (unión de los 3 subsets
      // del form: normas 1.1, condiciones 1.2, equipamiento 1.3).
      var OVERRIDE_RAIZ_KEYS = [
        'norma_itm059', 'norma_astm_e10', 'norma_astm_e10_year',
        'norma_iso6506', 'norma_iso6506_year', 'norma_otra_chk', 'norma_otra',
        'sup_muestra', 'sup_equipo', 'paralelismo', 'verif_patron',
        'temperatura', 'tiempo_aplicacion', 'bolilla_diametro', 'carga_aplicada',
        'espesor_probeta', 'diametro_impronta', 'dureza_hb', 'zona_ensayo',
        'equipamiento', 'equipamiento_tags', 'otros_equipos',
      ];
      function overridesRaizPara(nroOt) {
        var m = mapaCond[nroOt];
        if (!m) return {};
        var out = {};
        OVERRIDE_RAIZ_KEYS.forEach(function (k) {
          if (m[k] !== undefined) {
            out[k] = (typeof m[k] === 'object' && m[k] !== null && !Array.isArray(m[k]))
              ? Object.assign({}, m[k])
              : (Array.isArray(m[k]) ? m[k].slice() : m[k]);
          }
        });
        return out;
      }
      // OT actual: guardar tal cual (sin el mapa condiciones_por_ot).
      var datosActual = Object.assign({}, datos);
      delete datosActual.condiciones_por_ot;
      var promActual = self.saveEnsayoAsync(nro_ot_actual, 'dureza-brinell', datosActual, existingId || null);
      var hermanas = Object.keys(mapaCond).filter(function (n) { return n && n !== otActualStr; });
      var promsHermanas = hermanas.map(function (nroY) {
        var overrideRaiz = overridesRaizPara(nroY);
        var existente = _db.ensayos.find(function (e) {
          return String(e.nro_ot) === String(nroY) && e.tipo === 'dureza-brinell';
        });
        var accion, datosY, existingIdY;
        if (existente) {
          accion = 'actualizado';
          existingIdY = existente.id;
          var datosPrev = {};
          try { datosPrev = JSON.parse(existente.datos_json || '{}'); } catch (e) {}
          datosY = Object.assign({}, datosPrev, overrideRaiz);
          delete datosY.condiciones_por_ot;
        } else {
          accion = 'creado';
          // Condiciones globales (variante / laboratorio / patrón) del ensayo
          // fuente. Se copian intactas para que la hermana quede consistente.
          var CONDICIONES_GLOBALES = [
            'variante', 'laboratorio',
            'patron_tag', 'patron', 'patron_valor',
            'patron_diam_imp', 'patron_dureza_hb',
            'mapa_microdurezas', 'evaluacion_texto',
            'incluir_espesor', 'incluir_diametro_impronta',
          ];
          datosY = { mediciones: [] };
          CONDICIONES_GLOBALES.forEach(function (k) {
            if (datos[k] !== undefined) datosY[k] = datos[k];
          });
          Object.assign(datosY, overrideRaiz);
          delete datosY.condiciones_por_ot;
        }
        return self.saveEnsayoAsync(nroY, 'dureza-brinell', datosY, existingIdY).then(function (row) {
          return { nro_ot: nroY, accion: accion, id: row && row.id };
        });
      });
      return Promise.all([promActual].concat(promsHermanas)).then(function (results) {
        var actualRow = results[0];
        return {
          otActual: { nro_ot: otActualStr, id: actualRow && actualRow.id },
          otsHermanas: results.slice(1),
        };
      });
    },

    // Split multi-OT para nick-break: mismo patrón que plegado/impacto pero
    // dividiendo `probetas[]` (no `resultados[]`). Las probetas con
    // `nro_ot_override` apuntando a otra OT se transfieren al ensayo nick-break
    // de esa OT hermana. Aplana `condiciones_por_ot` por hijo (override raíz
    // desde el botón Copiar).
    saveEnsayoNickBreakMultiOt: function (nro_ot_actual, datos, existingId) {
      var self = this;
      var probetas = Array.isArray(datos.probetas) ? datos.probetas : [];
      var otActualStr = String(nro_ot_actual);
      var grupos = {};
      probetas.forEach(function (p, i) {
        var over = String((p && p.nro_ot_override) || '').trim();
        var dest = over || otActualStr;
        (grupos[dest] = grupos[dest] || []).push(i);
      });
      function extraerGrupo(idxs) {
        return idxs.map(function (oldIdx) {
          var p = Object.assign({}, probetas[oldIdx] || {});
          delete p.nro_ot_override;
          return p;
        });
      }
      var mapaCond = (datos && datos.condiciones_por_ot) || {};
      var OVERRIDE_RAIZ_KEYS = [
        'metodologia', 'metodo_ensayo', 'mecanizado_segun', 'temperatura', '_mecAuto',
        'cod_asme', 'ed_asme', 'cod_api1104', 'cod_aws_d11', 'cod_api5l',
        'cod_asme_pcc2', 'cod_api1104_fig', 'cod_aws_b40', 'cod_otro_chk', 'cod_otro',
        'variante', 'equipo', 'equipamiento', 'equipamiento_tags', 'otros_equipos',
      ];
      function overridesRaizPara(nroOt) {
        var m = mapaCond[nroOt];
        if (!m) return {};
        var out = {};
        OVERRIDE_RAIZ_KEYS.forEach(function (k) {
          if (m[k] !== undefined) {
            out[k] = (typeof m[k] === 'object' && m[k] !== null && !Array.isArray(m[k]))
              ? Object.assign({}, m[k])
              : (Array.isArray(m[k]) ? m[k].slice() : m[k]);
          }
        });
        return out;
      }
      // Destinos: los grupos de probetas + los definidos en condiciones_por_ot.
      var otsDestSet = {};
      Object.keys(grupos).forEach(function (n) { otsDestSet[n] = true; });
      Object.keys(mapaCond).forEach(function (n) { if (n) otsDestSet[n] = true; });
      var otsDest = Object.keys(otsDestSet);
      var idxActual = grupos[otActualStr] || [];
      var datosActual = Object.assign({}, datos);
      delete datosActual.condiciones_por_ot;
      datosActual.probetas = extraerGrupo(idxActual);
      var promActual = self.saveEnsayoAsync(nro_ot_actual, 'nick-break', datosActual, existingId || null);
      var hermanas = otsDest.filter(function (n) { return n !== otActualStr; });
      var promsHermanas = hermanas.map(function (nroY) {
        var subProbetas = grupos[nroY] ? extraerGrupo(grupos[nroY]) : [];
        var existente = _db.ensayos.find(function (e) {
          return String(e.nro_ot) === String(nroY) && e.tipo === 'nick-break';
        });
        var overrideRaiz = overridesRaizPara(nroY);
        var accion, datosY, existingIdY;
        if (existente) {
          accion = 'actualizado';
          existingIdY = existente.id;
          var datosPrev = {};
          try { datosPrev = JSON.parse(existente.datos_json || '{}'); } catch (e) {}
          var probetasPrev = Array.isArray(datosPrev.probetas) ? datosPrev.probetas : [];
          // Descartar filas iniciales en blanco que el form inserta al crear.
          probetasPrev = probetasPrev.filter(function (p) {
            var vals = Object.keys(p || {}).filter(function (k) { return k !== 'id'; });
            return vals.some(function (k) { var v = p[k]; return v != null && v !== '' && v !== false; });
          });
          datosY = Object.assign({}, datosPrev, { probetas: probetasPrev.concat(subProbetas) });
          Object.assign(datosY, overrideRaiz);
          delete datosY.condiciones_por_ot;
        } else {
          accion = 'creado';
          var CONDICIONES_GLOBALES = [
            'variante', 'equipo', 'metodologia', 'metodo_ensayo',
            'mecanizado_segun', '_mecAuto', 'temperatura',
            'cod_asme', 'ed_asme', 'cod_api1104', 'cod_aws_d11', 'cod_api5l',
            'cod_asme_pcc2', 'cod_api1104_fig', 'cod_aws_b40', 'cod_otro_chk', 'cod_otro',
            'equipamiento', 'equipamiento_tags', 'otros_equipos',
            'memoria_texto', 'observaciones_extra',
          ];
          datosY = { probetas: subProbetas };
          CONDICIONES_GLOBALES.forEach(function (k) {
            if (datos[k] !== undefined) datosY[k] = datos[k];
          });
          Object.assign(datosY, overrideRaiz);
          delete datosY.condiciones_por_ot;
        }
        return self.saveEnsayoAsync(nroY, 'nick-break', datosY, existingIdY).then(function (row) {
          return { nro_ot: nroY, accion: accion, cantidad: subProbetas.length, id: row && row.id };
        });
      });
      return Promise.all([promActual].concat(promsHermanas)).then(function (results) {
        var actualRow = results[0];
        return {
          otActual: { nro_ot: otActualStr, id: actualRow && actualRow.id, cantidad: idxActual.length },
          otsHermanas: results.slice(1),
        };
      });
    },

    // Split multi-OT para impacto: mismo patrón que tracción/plegado. Las filas
    // de `resultados[]` con `nro_ot_override` apuntando a otra OT se transfieren
    // al ensayo de impacto de esa OT hermana. Aplana `textos_por_ot` y
    // `condiciones_por_ot` por hijo.
    saveEnsayoImpactoMultiOt: function (nro_ot_actual, datos, existingId) {
      var self = this;
      var resultados = Array.isArray(datos.resultados) ? datos.resultados : [];
      var otActualStr = String(nro_ot_actual);
      var grupos = {};
      resultados.forEach(function (r, i) {
        var over = String((r && r.nro_ot_override) || '').trim();
        var dest = over || otActualStr;
        (grupos[dest] = grupos[dest] || []).push(i);
      });
      function extraerGrupo(idxs) {
        return idxs.map(function (oldIdx) {
          var r = Object.assign({}, resultados[oldIdx] || {});
          delete r.nro_ot_override;
          return r;
        });
      }
      // Textos opcionales por OT (evaluación libre para impacto).
      var mapaTextos = (datos && datos.textos_por_ot) || {};
      var TEXTO_KEYS = ['evaluacion_texto'];
      function aplanarTextosPara(nroOt) {
        var m = mapaTextos[nroOt] || {};
        var out = {};
        TEXTO_KEYS.forEach(function (k) {
          if (m[k] !== undefined) out[k] = m[k];
          else if (nroOt === otActualStr) {
            if (datos[k] !== undefined) out[k] = datos[k];
          } else {
            out[k] = '';
          }
        });
        return out;
      }
      var mapaCond = (datos && datos.condiciones_por_ot) || {};
      function condsPara(nroOt) {
        var m = mapaCond[nroOt];
        return m ? { condiciones_por_ot: { [nroOt]: Object.assign({}, m) } } : {};
      }
      var otsDest = Object.keys(grupos);
      var idxActual = grupos[otActualStr] || [];
      var datosActual = Object.assign({}, datos, aplanarTextosPara(otActualStr), condsPara(otActualStr));
      delete datosActual.textos_por_ot;
      if (!datosActual.condiciones_por_ot) delete datosActual.condiciones_por_ot;
      datosActual.resultados = extraerGrupo(idxActual);
      var promActual = self.saveEnsayoAsync(nro_ot_actual, 'impacto', datosActual, existingId || null);
      var hermanas = otsDest.filter(function (n) { return n !== otActualStr; });
      var promsHermanas = hermanas.map(function (nroY) {
        var subResultados = extraerGrupo(grupos[nroY]);
        var existente = _db.ensayos.find(function (e) {
          return String(e.nro_ot) === String(nroY) && e.tipo === 'impacto';
        });
        var accion, datosY, existingIdY;
        if (existente) {
          accion = 'actualizado';
          existingIdY = existente.id;
          var datosPrev = {};
          try { datosPrev = JSON.parse(existente.datos_json || '{}'); } catch (e) {}
          var resultadosPrev = Array.isArray(datosPrev.resultados) ? datosPrev.resultados : [];
          // Descartar fila blank inicial del form.
          if (resultadosPrev.length === 1) {
            var solaImp = resultadosPrev[0] || {};
            var impVacia = Object.keys(solaImp).every(function (k) {
              var v = solaImp[k];
              return v == null || v === '' || v === false;
            });
            if (impVacia) resultadosPrev = [];
          }
          datosY = Object.assign({}, datosPrev, aplanarTextosPara(nroY), condsPara(nroY), {
            resultados: resultadosPrev.concat(subResultados),
          });
          delete datosY.textos_por_ot;
          if (!datosY.condiciones_por_ot) delete datosY.condiciones_por_ot;
        } else {
          accion = 'creado';
          // Condiciones GLOBALES del ensayo actual: norma, equipamiento, ITM,
          // temperatura global, medida_probeta, entalla, etc. Se copian intactas.
          var CONDICIONES_GLOBALES = [
            'variante', 'maquina', 'metodologia',
            'norma_iso148_1', 'norma_iso148_1_year',
            'norma_astm_e23', 'norma_astm_e23_year',
            'norma_din_10045', 'norma_din_10045_year',
            'norma',
            'cod_asme', 'ed_asme', 'cod_api1104', 'cod_api5l',
            'cod_aws_d11', 'cod_extra',
            'temperatura', 'medida_probeta', 'entalla', 'tipo_probeta',
            'equipamiento', 'equipamiento_tags', 'otros_equipos',
            'nota1', 'nota_evaluaciones', 'nota_no_conforme',
            'nota_incertidumbre', 'nota_externo',
          ];
          datosY = Object.assign({}, aplanarTextosPara(nroY), condsPara(nroY), {
            resultados: subResultados,
          });
          CONDICIONES_GLOBALES.forEach(function (k) {
            if (datos[k] !== undefined) datosY[k] = datos[k];
          });
          if (!datosY.condiciones_por_ot) delete datosY.condiciones_por_ot;
        }
        return self.saveEnsayoAsync(nroY, 'impacto', datosY, existingIdY).then(function (row) {
          return { nro_ot: nroY, accion: accion, cantidad: subResultados.length, id: row && row.id };
        });
      });
      return Promise.all([promActual].concat(promsHermanas)).then(function (results) {
        var actualRow = results[0];
        return {
          otActual: { nro_ot: otActualStr, id: actualRow && actualRow.id, cantidad: idxActual.length },
          otsHermanas: results.slice(1),
        };
      });
    },

    // Split multi-OT para metalografía general y anexo metalográfico.
    // A diferencia de tracción/plegado/impacto (que dividen por FILAS), acá
    // se dividen las IMÁGENES: cada imagen tiene su propio `nro_ot_override`.
    // Los mapas `textos_por_ot` (para resultados_seccion) y `condiciones_por_ot`
    // (para analisis por sección) también se aplanan por OT hija.
    _saveEnsayoConImagenesMultiOt: function (tipo, IMAGE_KEYS, CONDICIONES_GLOBALES, nro_ot_actual, datos, existingId) {
      var self = this;
      return (function (nro_ot_actual, datos, existingId) {
        var otActualStr = String(nro_ot_actual);
        // Agrupar imágenes por OT destino, por cada campo de imagen.
        function extraerImgs(imgsSource, nroOt) {
          return (imgsSource || []).filter(function (p) {
            var over = String((p && p.nro_ot_override) || '').trim();
            var dest = over || otActualStr;
            return dest === String(nroOt);
          }).map(function (p) {
            var copia = Object.assign({}, p);
            delete copia.nro_ot_override;
            return copia;
          });
        }
        // Recolectar TODAS las OTs destino a partir de las imágenes.
        var otsDest = {};
        otsDest[otActualStr] = true;
        IMAGE_KEYS.forEach(function (k) {
          (datos[k] || []).forEach(function (p) {
            var over = String((p && p.nro_ot_override) || '').trim();
            var dest = over || otActualStr;
            otsDest[dest] = true;
          });
        });
        // También agregar como destinos las OTs mencionadas en textos_por_ot
        // y condiciones_por_ot — así al guardar sin imágenes con override pero
        // con textos/condiciones cargados para otras OTs, esas hermanas
        // reciben el ensayo con SUS datos igualmente.
        if (datos && datos.textos_por_ot) {
          Object.keys(datos.textos_por_ot).forEach(function (n) { if (n) otsDest[n] = true; });
        }
        if (datos && datos.condiciones_por_ot) {
          Object.keys(datos.condiciones_por_ot).forEach(function (n) { if (n) otsDest[n] = true; });
        }
        // Textos por OT. Aplanamos todos los campos del mapa (genéricos):
        // - metalografía general: `resultados_seccion` (objeto por sección).
        // - anexo metalográfico: `resultado_grano` y `resultado_inclusionario`
        //   (strings sueltos).
        var mapaTextos = (datos && datos.textos_por_ot) || {};
        var TEXTO_KEYS = ['resultados_seccion', 'resultado_grano', 'resultado_inclusionario'];
        function aplanarTextosPara(nroOt) {
          var m = mapaTextos[nroOt] || {};
          var out = {};
          TEXTO_KEYS.forEach(function (k) {
            if (m[k] !== undefined) out[k] = m[k];
            else if (nroOt === otActualStr && datos[k] !== undefined) out[k] = datos[k];
          });
          return out;
        }
        // Condiciones por OT. Contiene `analisis` (por sección) + condiciones
        // globales que el técnico haya copiado a otras OTs desde el botón
        // "Copiar condiciones": temperatura, zona_ensayo, muestra_ensayada,
        // reactivos, reactivo_otro, aumentos, equipamiento, equipamiento_tags,
        // grano, inclu, otros_equipos, etc. Al aplanar para la OT destino, se
        // aplican todos los campos del mapa (los que estén presentes).
        var mapaCond = (datos && datos.condiciones_por_ot) || {};
        function condsPara(nroOt) {
          var m = mapaCond[nroOt];
          if (m && Object.keys(m).length > 0) {
            // Devolver copia superficial de todo el mapa (incluyendo analisis).
            return Object.assign({}, m);
          }
          if (nroOt === otActualStr && datos.analisis) return { analisis: datos.analisis };
          return {};
        }
        // Función que arma el datos_json final para una OT destino.
        function armarDatosPara(nroOt, datosPrev) {
          var out = datosPrev ? Object.assign({}, datosPrev) : {};
          // Imágenes filtradas por esta OT.
          IMAGE_KEYS.forEach(function (k) {
            var filtradas = extraerImgs(datos[k], nroOt);
            if (nroOt === otActualStr) {
              // OT actual: reemplaza sus imágenes con las filtradas.
              out[k] = filtradas;
            } else {
              // OT hermana: fusionar sin duplicar por name.
              var prev = Array.isArray(out[k]) ? out[k] : [];
              var seen = new Set(prev.map(function (p) { return String((p && p.name) || '').toLowerCase(); }));
              var nuevas = filtradas.filter(function (p) { return !seen.has(String((p && p.name) || '').toLowerCase()); });
              out[k] = prev.concat(nuevas);
            }
          });
          // Aplanar textos y condiciones para esta OT.
          Object.assign(out, aplanarTextosPara(nroOt), condsPara(nroOt));
          delete out.textos_por_ot;
          if (!out.condiciones_por_ot) delete out.condiciones_por_ot;
          return out;
        }
        // OT actual: usa datos base + filtro imágenes propias.
        var datosActual = armarDatosPara(otActualStr, datos);
        var promActual = self.saveEnsayoAsync(nro_ot_actual, tipo, datosActual, existingId || null);
        // OTs hermanas.
        var hermanas = Object.keys(otsDest).filter(function (n) { return n !== otActualStr; });
        var promsHermanas = hermanas.map(function (nroY) {
          var existente = _db.ensayos.find(function (e) {
            return String(e.nro_ot) === String(nroY) && e.tipo === tipo;
          });
          var accion, datosY, existingIdY;
          if (existente) {
            accion = 'actualizado';
            existingIdY = existente.id;
            var datosPrev = {};
            try { datosPrev = JSON.parse(existente.datos_json || '{}'); } catch (e) {}
            datosY = armarDatosPara(nroY, datosPrev);
          } else {
            accion = 'creado';
            // Orden CORRECTO:
            //   1) Aplicar condiciones globales (temperatura, reactivos,
            //      equipamiento, etc.) como base.
            //   2) DESPUÉS, armarDatosPara (que aplica overrides de
            //      condiciones_por_ot y textos_por_ot) — esto GANA sobre lo
            //      global. Antes se hacía al revés: el forEach pisaba los
            //      overrides copiados con el botón "Copiar condiciones".
            datosY = {};
            (CONDICIONES_GLOBALES || []).forEach(function (k) {
              if (datos[k] !== undefined) datosY[k] = datos[k];
            });
            datosY = armarDatosPara(nroY, datosY);
          }
          // Contar cuántas imágenes reciben para el toast.
          var cantidad = 0;
          IMAGE_KEYS.forEach(function (k) {
            cantidad += extraerImgs(datos[k], nroY).length;
          });
          return self.saveEnsayoAsync(nroY, tipo, datosY, existingIdY).then(function (row) {
            return { nro_ot: nroY, accion: accion, cantidad: cantidad, id: row && row.id };
          });
        });
        return Promise.all([promActual].concat(promsHermanas)).then(function (results) {
          var actualRow = results[0];
          var cantActual = 0;
          IMAGE_KEYS.forEach(function (k) { cantActual += extraerImgs(datos[k], otActualStr).length; });
          return {
            otActual: { nro_ot: otActualStr, id: actualRow && actualRow.id, cantidad: cantActual },
            otsHermanas: results.slice(1),
          };
        });
      })(nro_ot_actual, datos, existingId);
    },

    // ── Metalografía general ─────────────────────────────────────────────
    // Delega en _saveEnsayoConImagenesMultiOt con los campos de imagen y las
    // condiciones globales que copia al ensayo hermano recién creado.
    saveEnsayoMetalografiaGeneralMultiOt: function (nro_ot_actual, datos, existingId) {
      return this._saveEnsayoConImagenesMultiOt(
        'metalografia-general',
        ['imagenes_micro', 'imagenes_espesor', 'imagenes_grafito', 'imagenes_decarb'],
        [
          'oaa', 'temperatura', 'zona_ensayo', 'muestra_ensayada',
          'reactivos', 'reactivo_otro', 'aumentos',
          'equipamiento', 'equipamiento_tags', 'otros_equipos',
          'observaciones_evaluacion', 'observaciones_extra',
          'nota_evaluaciones', 'nota_no_conforme', 'nota_mecanizada',
          'nota_incertidumbre', 'nota_externo',
          'estado_superficie', 'estado_equipo', 'estado_reactivo',
        ],
        nro_ot_actual, datos, existingId
      );
    },

    // ── Anexo metalográfico ──────────────────────────────────────────────
    saveEnsayoAnexoMetalograficoMultiOt: function (nro_ot_actual, datos, existingId) {
      return this._saveEnsayoConImagenesMultiOt(
        'anexo-metalografico',
        ['imagenes_grano', 'imagenes_inclusiones'],
        [
          'oaa', 'temperatura', 'zona_ensayo', 'muestra_ensayada',
          'reactivos', 'reactivo_otro', 'aumentos',
          'equipamiento', 'equipamiento_tags', 'otros_equipos',
          'grano', 'inclu',  // sub-objetos con datos de resultado
          'observaciones_evaluacion',
          'nota_evaluaciones', 'nota_no_conforme',
          'estado_superficie', 'estado_equipo', 'estado_reactivo',
        ],
        nro_ot_actual, datos, existingId
      );
    },

    // Comentario informativo de la lógica compartida arriba.
    // (Excluye `analisis` y `resultados_seccion` que se aplanan por OT, y
    // `imagenes_*` que se filtran por OT.)
    // Igual que saveEnsayo pero devuelve una Promise con la fila guardada (id
    // real de la DB). Lo usa el flujo de firma-obligatoria-al-guardar, que
    // necesita el id para firmar inmediatamente después de guardar.
    saveEnsayoAsync: function (nro_ot, tipo, datos, existingId) {
      var jsonStr = JSON.stringify(datos);
      var body = existingId
        ? { id: existingId, nro_ot: nro_ot, tipo: tipo, datos_json: jsonStr }
        : { nro_ot: nro_ot, tipo: tipo, datos_json: jsonStr, force_create: true };
      return apiFetch('POST', '/api/ensayo', body).then(function (row) {
        var idx = _db.ensayos.findIndex(function (x) {
          return x.id === row.id || (existingId && x.id === existingId);
        });
        if (idx >= 0) _db.ensayos[idx] = row; else _db.ensayos.push(row);
        return row;
      });
    },

    // Actualiza en la cache local los campos de firma de un ensayo, para que al
    // reabrirlo refleje el estado real (firmado/bloqueado) sin recargar toda la app.
    patchEnsayoFirma: function (id, patch) {
      var e = _db.ensayos.find(function (x) { return x.id === id; });
      if (e) Object.assign(e, patch || {});
      return e || null;
    },

    getEnsayo: function (id) {
      var e = _db.ensayos.find(function (x) { return x.id === id; });
      if (!e) return null;
      var copy = Object.assign({}, e);
      try { copy.datos = JSON.parse(e.datos_json); } catch (err) { copy.datos = {}; }
      return copy;
    },

    deleteEnsayo: function (id) {
      // NO optimistic: si el ensayo está firmado el backend bloquea con 423.
      // Solo sacamos del cache local si el backend confirmó el DELETE.
      return apiFetch('DELETE', '/api/ensayo/' + id)
        .then(function () {
          _db.ensayos = _db.ensayos.filter(function (e) { return e.id !== id; });
        })
        .catch(function (e) {
          apiErr(e.message || 'Error al eliminar ensayo');
          throw e;
        });
    },

    reorderEnsayos: function (nro_ot, orderedIds) {
      orderedIds.forEach(function (id, idx) {
        var e = _db.ensayos.find(function (x) { return x.id === id; });
        if (e) e.orden = idx + 1;
      });
      apiFetch('PATCH', '/api/ot/' + nro_ot + '/reorder-ensayos', { ordered_ids: orderedIds })
        .catch(function (e) { apiErr('Error al reordenar ensayos: ' + e.message); });
    },

    // ── Fotos ─────────────────────────────────────────────────────────────────

    getFotos: function (nro_ot) {
      var ot = _db.ots.find(function (o) { return o.nro_ot === nro_ot; });
      try { return JSON.parse((ot && ot.fotos_json) || '[]'); } catch (e) { return []; }
    },

    setFotos: function (nro_ot, fotos) {
      var ot = _db.ots.find(function (o) { return o.nro_ot === nro_ot; });
      if (ot) ot.fotos_json = JSON.stringify(fotos);
      apiFetch('PUT', '/api/ot/' + nro_ot + '/fotos', fotos)
        .catch(function (e) { apiErr('Error al guardar fotos: ' + e.message); });
    },

    // ── Eventos ───────────────────────────────────────────────────────────────

    logEvento: function (nro_ot, texto, icon) {
      if (!_db.eventos[nro_ot]) _db.eventos[nro_ot] = [];
      var ev = { texto: texto, icon: icon || 'check', fecha: new Date().toISOString() };
      _db.eventos[nro_ot].push(ev);
      apiFetch('POST', '/api/ot/' + nro_ot + '/eventos', { texto: texto, icon: icon || 'check' })
        .catch(function (e) { apiErr('Error al registrar evento: ' + e.message); });
    },

    getEventos: function (nro_ot) {
      return (_db.eventos[nro_ot] || []).slice();
    },

    // ── Clientes ──────────────────────────────────────────────────────────────

    listClientes: function () {
      return _db.clientes.map(function (c) {
        var ots = _db.ots.filter(function (o) { return o.nro_cliente === c.nro_cliente; });
        return Object.assign({}, c, {
          ot_count:      c.ot_count !== undefined ? c.ot_count : ots.length,
          last_activity: c.last_activity || (ots.length ? (ots[0].creado_en || '').slice(0, 10) : ''),
        });
      }).sort(function (a, b) { return b.ot_count - a.ot_count; });
    },

    getCliente: function (nro_cliente) {
      return _db.clientes.find(function (c) { return c.nro_cliente === nro_cliente; }) || null;
    },

    otsDeCliente: function (nro_cliente) {
      return this.listOts().filter(function (o) { return o.nro_cliente === nro_cliente; });
    },

    createCliente: function (data) {
      var existing = _db.clientes.findIndex(function (c) { return c.nro_cliente === data.nro_cliente; });
      if (existing >= 0) Object.assign(_db.clientes[existing], data);
      else _db.clientes.push(Object.assign({}, data));
      apiFetch('POST', '/api/cliente', data)
        .then(function (row) {
          var idx = _db.clientes.findIndex(function (c) { return c.nro_cliente === row.nro_cliente; });
          if (idx >= 0) _db.clientes[idx] = row;
        })
        .catch(function (e) { apiErr('Error al guardar cliente: ' + e.message); });
    },

    // ── Equipos ───────────────────────────────────────────────────────────────

    listEquipos: function () {
      return _db.equipos.map(function (e) {
        return Object.assign({}, e, { estado: calibStatus(e.vencimiento), dias: diasParaVencer(e.vencimiento) });
      });
    },

    createEquipo: function (data) {
      var existing = _db.equipos.findIndex(function (e) { return e.id === data.id; });
      if (existing >= 0) Object.assign(_db.equipos[existing], data);
      else _db.equipos.push(Object.assign({}, data));
      apiFetch('POST', '/api/equipos', data)
        .catch(function (e) { apiErr('Error al guardar equipo: ' + e.message); });
    },

    deleteEquipo: function (id) {
      _db.equipos = _db.equipos.filter(function (e) { return e.id !== id; });
      apiFetch('DELETE', '/api/equipos/' + id)
        .catch(function (e) { apiErr('Error al eliminar equipo: ' + e.message); });
    },

    getEquipoPorNombre: function (nombre) {
      if (!nombre) return null;
      return _db.equipos.find(function (e) {
        return nombre.indexOf(e.nombre) >= 0 || e.nombre.indexOf(nombre) >= 0;
      }) || null;
    },

    getEquipoPorCertificado: function (cert) {
      if (!cert) return null;
      var c = String(cert).trim();
      return _db.equipos.find(function (e) { return e.certificado === c; }) || null;
    },

    calibStatusOf: function (cert, nombre) {
      var e = this.getEquipoPorCertificado(cert) || this.getEquipoPorNombre(nombre);
      if (!e) return null;
      return { equipo: e, estado: calibStatus(e.vencimiento), vencimiento: e.vencimiento };
    },

    // ── Normas ────────────────────────────────────────────────────────────────

    listNormas: function () { return _db.normas.slice(); },

    createNorma: function (data) {
      var existing = _db.normas.findIndex(function (n) { return n.codigo === data.codigo; });
      if (existing >= 0) Object.assign(_db.normas[existing], data);
      else _db.normas.push(Object.assign({}, data));
      apiFetch('POST', '/api/normas', data)
        .catch(function (e) { apiErr('Error al guardar norma: ' + e.message); });
    },

    deleteNorma: function (codigo) {
      _db.normas = _db.normas.filter(function (n) { return n.codigo !== codigo; });
      apiFetch('DELETE', '/api/normas/' + encodeURIComponent(codigo))
        .catch(function (e) { apiErr('Error al eliminar norma: ' + e.message); });
    },

    normasParaTipo: function (tipo) {
      return _db.normas
        .filter(function (n) { return n.clase === 'norma' && n.vigente && (n.tipo === tipo || n.tipo === 'general'); })
        .map(function (n) { return n.codigo + (n.version ? ' (' + n.version + ')' : ''); });
    },

    itmsParaTipo: function (tipo) {
      return _db.normas
        .filter(function (n) { return n.clase === 'itm' && n.tipo === tipo; })
        .map(function (n) { return n.codigo; });
    },

    equiposParaTipo: function (tipo) {
      return _db.equipos
        .filter(function (e) { return e.tipo === tipo; })
        .map(function (e) { return { nombre: e.nombre, certificado: e.certificado, id: e.id }; });
    },

    // Todos los equipos del catálogo sin filtro por tipo. Para el desplegable
    // "OTROS EQUIPOS" que permite elegir cualquier instrumento del laboratorio.
    // Excluye los marcados activo=0 si está seteada la columna.
    todosLosEquipos: function () {
      return _db.equipos
        .filter(function (e) { return e.activo !== 0; })
        .map(function (e) { return { id: e.id, nombre: e.nombre, sede: e.sede || null }; });
    },

    // Devuelve el equipo por TAG (id), o null si no existe.
    equipoPorTag: function (tag) {
      if (!tag) return null;
      var t = String(tag).trim().toUpperCase();
      return _db.equipos.find(function (e) { return String(e.id || '').trim().toUpperCase() === t; }) || null;
    },

    // Zonas de evaluación cargadas dinámicamente (auto-guardadas al guardar
    // ensayos). Guardadas en la tabla normas con clase='zona'.
    zonasParaTipo: function (tipo) {
      return _db.normas
        .filter(function (n) { return n.clase === 'zona' && (n.tipo === tipo || n.tipo === 'general'); })
        .map(function (n) { return n.codigo; });
    },

    // Busca el TAG de un equipo por nombre (o retorna null). Usado por
    // EquipoInput para autofill al seleccionar del desplegable.
    tagPorNombreEquipo: function (nombre) {
      if (!nombre) return null;
      var n = String(nombre).trim().toLowerCase();
      var e = _db.equipos.find(function (x) { return String(x.nombre || '').trim().toLowerCase() === n; });
      return e ? e.id : null;
    },

    /**
     * Equipos disponibles para un tipo de ensayo + sede.
     * sede = 'CABA' | 'Neuquén' | null (devuelve todos).
     * Siempre incluye los marcados como 'Ambas'.
     */
    equiposParaTipoYSede: function (tipo, sede) {
      return _db.equipos
        .filter(function (e) {
          if (e.tipo !== tipo) return false;
          if (!sede) return true;
          return e.sede === sede || e.sede === 'Ambas';
        })
        .map(function (e) { return { id: e.id, nombre: e.nombre, certificado: e.certificado, sede: e.sede }; });
    },

    // ── Trello: devuelve Promise (otform.jsx ya tiene loading state) ──────────
    parseTrello: function (url) {
      return apiFetch('GET', '/api/trello/card?url=' + encodeURIComponent(url));
    },
  };

  window.LabStore = Store;
})();
