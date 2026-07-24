/* LABTESA — esquemas declarativos de los 8 tipos de ensayo.
   Cada esquema define variantes, secciones de campos y la tabla de resultados.
   El formulario dinámico se construye a partir de esto. */
(function () {
  'use strict';

  var APROB = ['Aprobado', 'No aprobado'];

  function f(key, label, opts) { return Object.assign({ key: key, label: label, type: 'text' }, opts || {}); }

  // ── Listas de equipamiento (keys y labels deben coincidir con template-*.js) ──

  var EQ_TRACCION_EST = [
    { key: 'emic',            label: 'Máquina de tracción Emic TAG N˚MM-203' },
    { key: 'calibre_571',     label: 'Calibre digital TAG N˚MM-571' },
    { key: 'calibre_cal570',  label: 'Calibre digital TAG N˚CAL-570' },
    { key: 'nivel_781',       label: 'Nivel angular magnético TAG N˚MM-781' },
    { key: 'termohigro_545',  label: 'Termohigrómetro TAG N˚PCAL-545' },
    { key: 'termohigro_702',  label: 'Termohigrómetro TAG N˚MM-702' },
    { key: 'trazado_782',     label: 'Dispositivo de trazado TAG N˚MM-782' },
    { key: 'regla_441',       label: 'Regla metálica TAG N˚MM-441' },
    { key: 'regla_443',       label: 'Regla metálica TAG N˚MM-443' },
    { key: 'proyector_165',   label: 'Proyector de perfiles TAG N˚MM-165' },
  ];
  var EQ_TRACCION_NQ = [
    { key: 'shimadzu',       label: 'Máquina de tracción Shimadzu TAG N˚MM-151' },
    { key: 'calibre_694',    label: 'Calibre digital TAG N˚MM-694' },
    { key: 'termohigro_794', label: 'Termohigrómetro TAG N°MM-794' },
  ];

  // Set de Galdabini — instalado en CABA (no en Neuquén)
  var EQ_IMPACTO_GALDABINI = [
    { key: 'galdabini',         label: 'Máquina de impacto Galdabini TAG N°MM-409' },
    { key: 'freezer_ee761',     label: 'Ultra freezer TAG N°EE-761' },
    { key: 'controlador_mm021', label: 'Controlador de temperatura digital TAG N°MM-021' },
    { key: 'calibre_mm571',     label: 'Calibre digital TAG N°MM-571' },
    { key: 'calibre_cal570',    label: 'Calibre digital TAG N°CAL-570' },
    { key: 'galgas_771',        label: 'Galgas patrón TAG N°MM-771' },
    { key: 'galgas_772',        label: 'Galgas patrón TAG N°MM-772' },
    { key: 'galgas_773',        label: 'Galgas patrón TAG N°MM-773' },
    { key: 'galgas_775',        label: 'Galgas patrón TAG N°MM-775' },
    { key: 'galgas_776',        label: 'Galgas patrón TAG N°MM-776' },
    { key: 'proyector_165',     label: 'Proyector de perfiles TAG N°MM-165' },
    { key: 'bano_termo_ee537',  label: 'Baño Termostático TAG N°EE-537' },
  ];
  // Set de Wolpert — instalado en Neuquén
  var EQ_IMPACTO_WOLPERT = [
    { key: 'wolpert',           label: 'Péndulo de impacto Wolpert 300J TAG N˚MM-010' },
    { key: 'freezer_pol479',    label: 'Ultra freezer TAG N°POL-479' },
    { key: 'controlador_mm315', label: 'Controlador de temperatura digital TAG N˚MM-315' },
    { key: 'calibre_mm694',     label: 'Calibre digital TAG N˚MM-694' },
  ];

  var EQ_PLEGADO_EMIC = [
    { key: 'maquina_emic',    label: 'Máquina de tracción Emic TAG N°MM-203' },
    { key: 'calibre_571',     label: 'Calibre digital TAG N°MM-571' },
    { key: 'calibre_570',     label: 'Calibre digital TAG N°MM-570' },
    { key: 'dispositivo_779', label: 'Dispositivo de plegado TAG N°MM-779' },
    { key: 'mandril',         label: 'Mandril TAG N°MM-… (especificar abajo)' },
    { key: 'termohigrometro', label: 'Termohigrómetro TAG N°PCAL-545' },
    { key: 'termo_702',       label: 'Termohigrómetro TAG N°MM-702' },
  ];
  // Equipos disponibles en Neuquén para plegado. Se usa la misma lista para
  // ambos variants (torne / shimadzu). El mandril se especifica en el campo
  // `mandril_tag` (text) de "Parámetros de plegado" porque el código varía.
  var EQ_PLEGADO_NEUQUEN_FULL = [
    { key: 'maquina_shimadzu', label: 'Máquina de tracción Shimadzu TAG N°MM-151' },
    { key: 'prensa_torne',     label: 'Prensa Plegadora TORNE Y MEC TAG N°MM-913' },
    { key: 'calibre_694',      label: 'Calibre digital TAG N°MM-694' },
    { key: 'mandril',          label: 'Mandril TAG N°MM-… (especificar código abajo)' },
    { key: 'termo_794',        label: 'Termohigrómetro TAG N°MM-794' },
  ];
  var EQ_PLEGADO_TORNE    = EQ_PLEGADO_NEUQUEN_FULL;
  var EQ_PLEGADO_SHIMADZU = EQ_PLEGADO_NEUQUEN_FULL;

  var EQ_NB_EMIC = [
    { key: 'maquina_emic',    label: 'Máquina de tracción Emic TAG N°MM-203' },
    { key: 'termohigrometro', label: 'Termohigrómetro TAG N°PCAL-545' },
  ];
  var EQ_NB_TORNE = [
    { key: 'prensa_torne_413', label: 'Prensa Plegadora TORNE Y MEC TAG N°MM-413' },
    { key: 'calibre_694',      label: 'Calibre digital TAG N°MM-694' },
    { key: 'termo_794',        label: 'Termohigrómetro TAG N°MM-794' },
  ];

  var EQ_QUIMICOS = [
    { key: 'spectrotest_361', label: 'Espectrómetro Spectrotest TAG N˚MM-361' },
    { key: 'aa_shimadzu_478', label: 'Absorción atómica Shimadzu TAG N˚MM-478' },
    { key: 'spectrotest_463', label: 'Espectrómetro Spectrotest TAG N˚MM-463' },
    { key: 'icp_oes_371',     label: 'Espectrómetro de emisión atómica ICP-OES TAG N˚QB-371' },
    { key: 'rayos_x_346',     label: 'Rayos X Oxford TAG N˚MM-346' },
    { key: 'spectromax_164',  label: 'Espectrómetro Spectromax TAG N˚MM-164' },
    { key: 'eltra_102',       label: 'Determinador de C y S Eltra TAG N˚MM-102' },
    { key: 'termohigro_701',  label: 'Termohigrómetro TAG N˚MM-701' },
  ];

  var EQ_BRINELL = [
    { key: 'petri_170',       label: 'Durómetro Petri TAG N˚MM-170' },
    { key: 'shimadzu_151',    label: 'Máquina de tracción Shimadzu TAG N˚MM-151' },
    { key: 'calibre_571',     label: 'Calibre digital TAG N˚MM-571' },
    { key: 'calibre_cal570',  label: 'Calibre digital TAG N˚CAL-570' },
    { key: 'calibre_694',     label: 'Calibre digital TAG N˚MM-694' },
    { key: 'registrador_545', label: 'Registrador de temperatura TAG N˚PCAL-545' },
    { key: 'registrador_702', label: 'Registrador de temperatura TAG N˚MM-702' },
    { key: 'termohigro_701',  label: 'Termohigrómetro TAG N˚MM-701' },
    { key: 'termohigro_794',  label: 'Termohigrómetro TAG N˚MM-794' },
    { key: 'proyector_165',   label: 'Proyector de perfiles TAG N˚MM-165' },
    { key: 'microscopio_173', label: 'Microscopio de medición TAG N˚MM-173' },
  ];

  // Rockwell: slot 1 = Durómetro Petri MM-012 (hardcodeado en template).
  // Slots 2-5 = termohigrómetros / calibres opcionales. Patrón se inyecta por PMM-***.
  var EQ_ROCKWELL = [
    { key: 'termohigro_545', label: 'Termohigrómetro TAG N˚PCAL-545' },
    { key: 'termohigro_702', label: 'Termohigrómetro TAG N˚MM-702' },
    { key: 'termohigro_701', label: 'Termohigrómetro TAG N˚MM-701' },
    { key: 'termohigro_794', label: 'Termohigrómetro TAG N˚MM-794' },
    { key: 'calibre_571',    label: 'Calibre digital TAG N˚MM-571' },
    { key: 'calibre_694',    label: 'Calibre digital TAG N˚MM-694' },
  ];

  var EQ_VICKERS = [
    { key: 'buehler_405',          label: 'Microdurómetro Buehler Wilson VH 1150 TAG N˚MM-405' },
    { key: 'calibre_mitutoyo_703', label: 'Calibre digital Mitutoyo TAG N˚MM-703' },
    { key: 'calibre_570',          label: 'Calibre digital Mitutoyo TAG N˚CAL-570' },
    { key: 'termohigro_700',       label: 'Termohigrómetro TAG N˚MM-700' },
    { key: 'patron_vickers',       label: 'Patrón Vickers (ver certificado)' },
    { key: 'registrador_794',      label: 'Registrador de temperatura TAG N°MM-794' },
    { key: 'zwick_013',            label: 'Microdurómetro Zwick TAG N˚MM-013' },
    { key: 'calibre_694',          label: 'Calibre digital TAG N˚MM-694' },
  ];

  var SCHEMAS = {
    /* ---------------- TRACCIÓN ---------------- */
    traccion: {
      icon: 'traccion',
      descr: 'Ensayo de resistencia a la tracción según probetas normalizadas.',
      variants: [
        { id: 'estandar', label: 'Estándar · CABA', sub: 'Máquina EMIC' },
        { id: 'neuquen', label: 'Neuquén', sub: 'Máquina Shimadzu' },
      ],
      defaults: function (v) {
        if (v === 'neuquen') return {
          equipamiento: { shimadzu: true, calibre_694: true, termohigro_794: true },
        };
        return {
          equipamiento: { emic: true, calibre_571: true, termohigro_545: true },
        };
      },
      sections: function (v) {
        return [
          // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
          { title: '1. Condiciones de ensayo — Norma y metodología', cols: 2, fields: [
            f('norma', 'Norma de ensayo', { placeholder: 'Ej: ASTM E8' }),
            f('metodologia', 'Metodología (ITM)', { placeholder: 'ITM N°075' }),
          ]},
          { title: '1.b Condiciones de ensayo', cols: 4, fields: [
            f('temperatura', 'Temperatura (°C)', { type: 'number' }),
            f('orientacion', 'Orientación', { type: 'select', options: ['Longitudinal', 'Transversal', 'Radial'] }),
            f('temperatura_probeta', 'Temperatura de probeta (°C)', { type: 'number', placeholder: 'Ej: 22' }),
            f('tiempo_a_temperatura', 'Tiempo a temperatura',         { placeholder: 'Ej: 30 min' }),
          ]},
          { title: '1.c Procedimientos y referencias', cols: 3, fields: [
            f('cod_asme',        'ASME BPVC Secc. IX',     { type: 'checkbox' }),
            f('ed_asme',         'Edición ASME',           { placeholder: '2025' }),
            f('cod_api1104',     'API 1104',               { type: 'checkbox' }),
            f('cod_api5l',       'API 5L',                 { type: 'checkbox' }),
            f('cod_aws_d11',     'AWS D1.1/D1.1M:2025-AMD1',    { type: 'checkbox' }),
            f('norma_astm_a370', 'ASTM A370',              { type: 'checkbox' }),
          ]},
          { title: '1.d Datos de probeta', cols: 2, fields: [
            f('prob_cliente',          'Mecanizada por cliente',           { type: 'checkbox' }),
            f('prob_soldada',          'Probeta soldada',                   { type: 'checkbox' }),
            f('tiene_probeta_segun',   'Probeta mecanizada según',          { type: 'checkbox' }),
            f('probeta_segun',         'Especificación / figura',           { placeholder: 'ISO 6892-1:2019 Fig. 13 Prob. 1' }),
            f('tiene_plano_probeta',   'Plano de probeta según',            { type: 'checkbox' }),
            f('plano_probeta',         'N° de plano / referencia',          { placeholder: 'PL-2023-001 Rev. A' }),
          ]},
          // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
          { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: v === 'neuquen' ? EQ_TRACCION_NQ : EQ_TRACCION_EST },
          // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
          // (La tabla vertical de resultados se renderea automáticamente
          //  debajo de estas secciones.)
          { title: '3. Resultados obtenidos — Agrupar por lados (opcional)', cols: 1, fields: [
            f('usar_lados', 'Agrupar muestras por lados (ej: Liso / Arandela)', { type: 'checkbox' }),
          ]},
          // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
          { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
            f('tiene_evaluacion',   'Incluir evaluación',      { type: 'checkbox' }),
            f('evaluacion_texto',   'Texto evaluación',        { type: 'textarea', placeholder: 'Los resultados obtenidos cumplen con…' }),
          ]},
          // ─── 5. NOTAS (opcional) ──────────────────────────────────────────
          { title: '5. Notas y observaciones (opcional)', cols: 1, fields: [
            f('tiene_nota',    'Incluir nota',   { type: 'checkbox' }),
            f('nota_texto',    'Texto de nota',  { placeholder: 'Nota aclaratoria…' }),
            f('observaciones', 'Observaciones',  { type: 'textarea' }),
          ]},
        ];
      },
      table: function (v) {
        var EST = [
          { key: 'ancho_promedio',       label: 'Ancho promedio (mm)',            type: 'number' },
          { key: 'espesor_promedio',      label: 'Espesor promedio (mm)',          type: 'number' },
          { key: 'diametro_promedio',     label: 'Diámetro promedio (mm)',         type: 'number' },
          { key: 'seccion_inicial',       label: 'Sección inicial A₀ (mm²)',      type: 'number' },
          { key: 'carga_maxima',          label: 'Carga máxima Fu (N)',            type: 'number' },
          { key: 'resistencia_traccion',  label: 'Resistencia tracción Rm (MPa)', type: 'number' },
          { key: 'carga_fluencia',        label: 'Carga de fluencia Fy (N)',       type: 'number' },
          { key: 'tension_fluencia',      label: 'Tensión de fluencia Re (MPa)',  type: 'number' },
          { key: 'longitud_inicial',      label: 'Longitud inicial L₀ (mm)',      type: 'number' },
          { key: 'longitud_final',        label: 'Longitud final Lf (mm)',        type: 'number' },
          { key: 'alargamiento',          label: 'Alargamiento A (%)',             type: 'number' },
          { key: 'diametro_final',        label: 'Diámetro final df (mm)',         type: 'number' },
          { key: 'seccion_final',         label: 'Sección final Af (mm²)',        type: 'number' },
          { key: 'estriccion',            label: 'Estricción Z (%)',               type: 'number' },
          { key: 'defectos',              label: 'Defectos observados',            type: 'text' },
          { key: 'zona_rotura',  label: 'Zona de rotura',  type: 'select', w: 150,
            options: ['M. base', 'Zona de calibre', 'Extremo de calibre', 'Fuera de calibre', 'Soldadura', 'HAZ', 'Zona reducida'] },
          { key: 'tipo_rotura',  label: 'Tipo de rotura',  type: 'select', w: 130,
            options: ['Dúctil', 'Frágil', 'Mixta'] },
          { key: 'lado_rotura',  label: 'Lado de rotura',  type: 'select', w: 120,
            options: ['Exterior', 'Interior', 'Lateral', 'N/A'] },
        ];
        return { type: 'vertical', rowsKey: 'muestras', required: true, filas: v === 'neuquen' ? EST.slice(0, 11) : EST };
      },
    },

    /* ---------------- IMPACTO CHARPY ---------------- */
    impacto: {
      icon: 'impacto',
      descr: 'Energía absorbida en impacto (péndulo Charpy).',
      variants: [
        { id: 'neuquen', label: 'Neuquén · Wolpert',   sub: 'Péndulo Wolpert 300 J' },
        { id: 'caba',    label: 'CABA · Galdabini',    sub: 'Péndulo Galdabini' },
      ],
      defaults: function (v) {
        if (v === 'caba') return {
          incluir_zona: true, incluir_temperatura_tabla: true,
          equipamiento: { galdabini: true, freezer_ee761: true, controlador_mm021: true, calibre_mm571: true, proyector_165: true },
        };
        return {
          incluir_zona: true, incluir_temperatura_tabla: true,
          equipamiento: { wolpert: true, freezer_pol479: true, controlador_mm315: true, calibre_mm694: true },
        };
      },
      sections: function (v) {
        return [
          // ─── 1.1 NORMAS / PROCEDIMIENTOS DE ENSAYO ────────────────────────
          { title: '1.1 · Normas / Procedimientos de ensayo', cols: 2, fields: [
            f('metodologia',     'Metodología (ITM)',           { placeholder: 'ITM N°078' }),
            f('norma_iso148_1',  'Según ISO 148-1',              { type: 'checkbox' }),
            f('norma_astm_e23',  'Según ASTM E23',               { type: 'checkbox' }),
            f('norma_din_10045', 'Según DIN EN 10045',           { type: 'checkbox' }),
            f('norma',           'Otra norma (texto libre)',     { placeholder: 'Ej.: ISO 148-1:2016' }),
          ]},
          // ─── 1.2 CÓDIGO DE REFERENCIA ─────────────────────────────────────
          { title: '1.2 · Código de referencia', cols: 3, fields: [
            f('cod_asme',    'ASME BPVC Secc. IX',           { type: 'checkbox' }),
            f('ed_asme',     'Edición ASME (si aplica)',      { placeholder: '2025' }),
            f('cod_api1104', 'API 1104',                      { type: 'checkbox' }),
            f('cod_api5l',   'API 5L',                        { type: 'checkbox' }),
            f('cod_aws_d11', 'AWS D1.1/D1.1M:2025-AMD1',           { type: 'checkbox' }),
            f('cod_extra',   'Otros códigos (uno por línea)',
              { type: 'textarea', placeholder: 'ISO 148-1:2016\nAWS B4.0:2016' }),
          ]},
          // ─── 1.3 VERIFICACIONES Y CONDICIONES DE ENSAYO ───────────────────
          //   Los siguientes campos existen en el preinforme físico pero NO se
          //   incluyen en el Word: paralelismo, verificación diaria, radio
          //   impactador. Se guardan en la base de datos como registro interno.
          { title: '1.3 · Verificaciones y condiciones de ensayo', cols: 3, fields: [
            f('temperatura',         'Temperatura de ensayo (°C)',  { placeholder: '-20 o "Ambiente"' }),
            f('medida_probeta',      'Medida de probeta',            { type: 'select', options: ['10x10x55', '10x7.5x55', '10x5x55', '10x2.5x55', '5x10x55', '7.5x10x55'] }),
            f('entalla',             'Entalla (Charpy)',             { type: 'select', options: ['V', 'U'] }),
            f('paralelismo',         'Paralelismo: OK (interno)',    { type: 'checkbox', hint: 'No se incluye en el Word' }),
            f('orientacion',         'Orientación de probeta',       { type: 'select', options: ['Longitudinal', 'Transversal', 'Radial'] }),
            f('temp_acreditada',     'Alcance acreditado (-80 a +50 °C)', { type: 'checkbox' }),
            f('prob_cliente',        'Probetas mecanizadas por el cliente', { type: 'checkbox' }),
            f('prob_cupon_soldado',  'Probetas extraídas de cupón soldado',  { type: 'checkbox' }),
            f('verificacion_diaria', 'Verificación diaria: OK (interno)', { type: 'checkbox', hint: 'No se incluye en el Word' }),
            f('radio_impactador',    'Radio impactador (interno)',   { placeholder: '8 mm', hint: 'No se incluye en el Word' }),
            f('energia_informada',   'Energía informada (J)',        { type: 'number', placeholder: '27' }),
          ]},
          // ─── 1.4 EQUIPAMIENTO UTILIZADO ───────────────────────────────────
          { title: '1.4 · Equipamiento utilizado', type: 'equipoBoxes', equipos: v === 'caba' ? EQ_IMPACTO_GALDABINI : EQ_IMPACTO_WOLPERT },
          // ─── 1.5 RESULTADOS OBTENIDOS ─────────────────────────────────────
          //   (La tabla vertical de resultados se renderea automáticamente.)
          { title: '1.5 · Resultados obtenidos — Opciones de tabla', cols: 2, fields: [
            f('incluir_zona',              'Incluir columna Zona',         { type: 'checkbox' }),
            f('incluir_temperatura_tabla', 'Incluir columna Temperatura',  { type: 'checkbox' }),
          ]},
          // ─── 1.6 OBSERVACIONES / EVALUACIÓN ───────────────────────────────
          { title: '1.6 · Observaciones / Evaluación', cols: 1, fields: [
            f('nota1',            'Nota 1 — Probetas cumplen dimensiones y tolerancias',      { type: 'checkbox' }),
            f('nota2',            'Nota 2 — Valores > 138 J fuera del alcance de acreditación', { type: 'checkbox' }),
            f('nota3',            'Nota 3 — Temperatura fuera del alcance de acreditación',   { type: 'checkbox' }),
            f('nota_subsize',     'Nota Subsize — Dimensiones fuera de alcance',              { type: 'checkbox' }),
            f('tiene_evaluacion', 'Incluir evaluación de resultados',                          { type: 'checkbox' }),
            f('evaluacion_texto', 'Texto de evaluación',                                       { type: 'textarea', placeholder: 'Los resultados obtenidos cumplen con…' }),
          ]},
        ];
      },
      table: function () {
        // Espejo del preinforme físico. Las columnas marcadas (interno)
        // se guardan en la DB pero NO se incluyen en el Word generado.
        return { required: true, columns: [
          { key: 'probeta',           label: 'Probeta',          type: 'text', w: 80  },
          { key: 'zona',              label: 'Zona / Ubicación', type: 'text', w: 160 },
          { key: 'verif_dimensional', label: 'Verif. dim. (interno)', type: 'select', w: 110, options: ['OK', 'NO OK'] },
          { key: 'energia',           label: 'Energía absorbida (J)', type: 'text', w: 110, hint: 'Acepta 87, >240, ≈150' },
          { key: 'resiliencia',       label: 'Resiliencia (J/cm²)',   type: 'text', w: 100 },
          { key: 'expansion_lateral', label: 'Expansión lateral (mm)', type: 'text', w: 100 },
          { key: 'fractura_ductil',   label: 'Fractura dúctil (%)',    type: 'text', w: 90 },
          { key: 'temperatura',       label: 'Temperatura (°C)', type: 'text', w: 120, hint: 'Acepta 20, -40, <-80, ≈20' },
          { key: 'fracturado',        label: 'Fracturado (interno)',  type: 'select', w: 90, options: ['SI', 'NO'] },
        ]};
      },
    },

    /* ---------------- PLEGADO ---------------- */
    plegado: {
      icon: 'plegado',
      descr: 'Ensayo de plegado guiado para evaluación de soldaduras.',
      defaults: function (v) {
        if (v === 'torne') return {
          equipo: 'torne',
          equipamiento: { prensa_torne: true, mandril_930: true, calibre_694: true, termo_794: true },
        };
        if (v === 'shimadzu') return {
          equipo: 'shimadzu',
          equipamiento: { maquina_shimadzu: true, calibre_694s: true },
        };
        return {
          equipo: 'emic',
          equipamiento: { maquina_emic: true, calibre_571: true, dispositivo_779: true },
        };
      },
      variants: null,
      equipos: [
        { id: 'emic',     label: 'EMIC' },
        { id: 'torne',    label: 'TORNE' },
        { id: 'shimadzu', label: 'Shimadzu' },
      ],
      sections: function (v, datos) {
        var eq = datos ? (datos.equipo || 'emic') : 'emic';
        var equipos = eq === 'torne' ? EQ_PLEGADO_TORNE
                    : eq === 'shimadzu' ? EQ_PLEGADO_SHIMADZU
                    : EQ_PLEGADO_EMIC;
        return [
          // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
          { title: '1. Condiciones de ensayo — Norma y metodología', cols: 2, fields: [
            f('norma', 'Norma de ensayo', { placeholder: 'ASTM E290' }),
            f('metodologia', 'Metodología (ITM)', { placeholder: 'ITM N°019' }),
          ]},
          { title: '1.b Código de referencia (opcional)', cols: 3, fields: [
            f('cod_asme',        'ASME BPVC Secc. IX',       { type: 'checkbox' }),
            f('cod_api1104',     'API 1104',                  { type: 'checkbox' }),
            f('cod_api5l',       'API 5L',                    { type: 'checkbox' }),
            f('cod_aws_d11',     'AWS D1.1',                  { type: 'checkbox' }),
            f('ed_asme',         'Edición ASME',              { placeholder: '2025' }),
            f('norma_referencia','Otra norma de referencia',  { placeholder: 'ASME B31.3' }),
            f('probeta_mecanizada_segun', 'Probeta mecanizada según', {
              type: 'select-editable',
              options: [
                'ASME BPVC Secc. IX Ed. 2025 QW-',
                'ASME BPVC Secc. IX QW-462.3(a)',
                'ASME BPVC Secc. IX QW-466.1',
                'API 1104 Ed. 22-2021',
                'AWS D1.1 Sec. 6',
              ],
              placeholder: 'ASME BPVC Secc. IX QW-462.3(a)',
            }),
          ]},
          { title: '1.c Parámetros de plegado', cols: 4, fields: [
            f('tipo_muestra',     'Tipo de muestra',      { type: 'select', options: [
              { value: 'soldadura',   label: 'Soldadura (única acreditada OAA)' },
              { value: 'metal_base',  label: 'Metal base' },
              { value: 'otro',        label: 'Otro' },
            ]}),
            f('diametro_mandril', 'Diámetro mandril',    { placeholder: '40 mm' }),
            f('mandril_tag',      'Mandril TAG N°MM-',   { placeholder: '779' }),
            f('espesor_probeta',  'Espesor probeta (mm)', { type: 'number' }),
            f('ancho_probeta',    'Ancho probeta (mm)',   { type: 'number' }),
            f('angulo_doblado',   'Ángulo (°)',           { type: 'number', placeholder: '180' }),
            f('orientacion', 'Orientación', { type: 'select', options: ['Longitudinal', 'Transversal'] }),
            f('temperatura',      'Temperatura (°C)',     { type: 'number' }),
            f('distancia_apoyos', 'Distancia entre apoyos (mm)', { type: 'number' }),
            f('zona_plegado',     'Zona de plegado',      { placeholder: 'Cara externa' }),
            f('metodologia_cliente',  'Metodología según indicaciones del cliente', { type: 'checkbox' }),
            f('muestra_fuera_alcance', 'Muestra fuera del alcance de acreditación', { type: 'checkbox' }),
          ]},
          // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
          { title: '2. Equipo', cols: 1, equipoToggle: true, fields: [] },
          { title: '2.b Equipamiento utilizado', type: 'equipoBoxes', equipos: equipos },
          // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
          { title: '3. Resultados obtenidos — Opciones de tabla', cols: 2, fields: [
            f('tipo_tabla', 'Tipo de tabla', { type: 'select', options: [
              { value: 'cara_raiz', label: 'Cara y Raíz (PC/PR)' },
              { value: 'lateral',   label: 'Lateral (PL)' },
              { value: 'combinado', label: 'Combinado (PC/PR + PL en una tabla)' },
              { value: 'custom',    label: 'Personalizada' },
            ]}),
            f('incluir_tipo_plegado', 'Incluir columna "Tipo de plegado"', { type: 'checkbox' }),
          ]},
          // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
          { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
            f('tiene_evaluacion',      'Incluir evaluación de resultados', { type: 'checkbox' }),
            f('evaluacion_texto',      'Texto de la evaluación', { type: 'textarea', placeholder: 'Las indicaciones observadas se encuentran dentro de los límites…' }),
          ]},
          // ─── 5. NOTAS / OBSERVACIONES (opcional) ──────────────────────────
          { title: '5. Notas y observaciones (opcional)', cols: 1, fields: [
            f('observaciones_extra', 'Observaciones', { type: 'textarea' }),
          ]},
        ];
      },
      table: function () {
        var conIndicaciones = function (row) { return row && row.resultado === 'Con indicaciones'; };
        return { optional: true, columns: [
          { key: 'probeta',   label: 'Probeta',   type: 'text',   w: 100 },
          { key: 'tipo',      label: 'Tipo',      type: 'select', options: ['Cara', 'Raíz', 'Lateral'], w: 140 },
          { key: 'resultado', label: 'Resultado', type: 'select', options: ['Sin indicaciones', 'Con indicaciones'], w: 160 },
          { key: 'cant_indicaciones', label: 'Cant. indic.', type: 'number', w: 110, enabledIf: conIndicaciones },
          { key: 'longitud_mm',       label: 'Longitudes (mm)', type: 'text', w: 200, enabledIf: conIndicaciones, placeholder: '0.6;0.2;0.3' },
        ]};
      },
    },

    /* ---------------- NICK BREAK ---------------- */
    'nick-break': {
      icon: 'nick-break',
      descr: 'Fractura inducida para inspección de discontinuidades internas.',
      defaults: function (v) {
        if (v === 'torne') return {
          equipamiento: { prensa_torne_413: true, calibre_694: true, termo_794: true },
        };
        return {
          equipamiento: { maquina_emic: true, termohigrometro: true },
        };
      },
      variants: [
        { id: 'emic',  label: 'EMIC',  sub: 'Máquina EMIC' },
        { id: 'torne', label: 'TORNE', sub: 'Prensa TORNE' },
      ],
      resultVariants: [
        'No presenta indicaciones relevantes',
        'Sin indicaciones',
        'Presenta poro',
        'Presenta escoria',
        'Presenta indicación',
      ],
      sections: function (v) {
        return [
          // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
          { title: '1. Condiciones de ensayo — Método y metodología', cols: 2, fields: [
            f('metodo_ensayo', 'Método de ensayo', { placeholder: 'API 1104' }),
            f('metodologia', 'Metodología (ITM)', { placeholder: 'ITM N°079' }),
            f('mecanizado_segun', 'Probeta mecanizada según', { placeholder: 'API 1104 Fig. 6' }),
            f('temperatura', 'Temperatura (°C)', { type: 'number' }),
          ]},
          { title: '1.b Códigos de referencia', cols: 3, fields: [
            f('cod_asme',    'ASME BPVC Secc. IX', { type: 'checkbox' }),
            f('ed_asme',     'Edición ASME',       { placeholder: '2025' }),
            f('cod_api1104', 'API 1104',           { type: 'checkbox' }),
            f('cod_api5l',   'API 5L',             { type: 'checkbox' }),
            f('cod_aws_d11', 'AWS D1.1',           { type: 'checkbox' }),
            f('muestra_fuera_alcance', 'Muestra fuera del alcance de acreditación', { type: 'checkbox' }),
          ]},
          // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
          { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: v === 'torne' ? EQ_NB_TORNE : EQ_NB_EMIC },
          // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
          //     (Tabla de probetas se renderea automáticamente.)
          // ─── 5. NOTAS / OBSERVACIONES (opcional) ──────────────────────────
          { title: '5. Notas y observaciones (opcional)', cols: 1, fields: [
            f('observaciones_extra', 'Observaciones', { type: 'textarea' }),
          ]},
        ];
      },
      table: function () {
        return { optional: true, rowsKey: 'probetas', columns: [
          { key: 'id',             label: 'Probeta',        type: 'text',   w: 100 },
          { key: 'tipo_resultado', label: 'Resultado',      type: 'select', w: 240, options: [
            'No presenta indicaciones relevantes',
            'Sin indicaciones',
            'Presenta poro',
            'Presenta escoria',
            'Presenta indicación',
            'otro',
          ]},
          { key: 'detalle',        label: 'Detalle',        type: 'text',   w: 240 },
        ]};
      },
    },

    /* ---------------- ANÁLISIS QUÍMICO ---------------- */
    quimicos: {
      icon: 'quimicos',
      descr: 'Composición química por espectrometría de emisión óptica.',
      defaults: function (v) {
        var base = {
          tiene_evaluacion: false,
        };
        base.equipamiento = (v === 'neuquen')
          ? { spectrotest_463: true, termohigro_794: true }
          : { spectrotest_361: true, termohigro_701: true };
        return base;
      },
      variants: [
        { id: 'estandar', label: 'Estándar · CABA', sub: 'Spectrotest MM-361' },
        { id: 'neuquen',  label: 'Neuquén',          sub: 'Spectrotest MM-463' },
      ],
      sections: function () {
        return [
          // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
          { title: '1. Condiciones de ensayo — Normas (año opcional)', cols: 2, fields: [
            f('norma_e415',       'ASTM E415 — Acero carbono/baja aleación',  { type: 'checkbox' }),
            f('norma_e415_year',  'Año/sufijo',                                { placeholder: '-21' }),
            f('norma_e1086',      'ASTM E1086 — Acero inoxidable austenítico', { type: 'checkbox' }),
            f('norma_e1086_year', 'Año/sufijo',                                { placeholder: '-22' }),
            f('norma_e1251',      'ASTM E1251 — Aluminio y aleaciones',         { type: 'checkbox' }),
            f('norma_e1251_year', 'Año/sufijo',                                { placeholder: '-25' }),
            f('norma_e1999',      'ASTM E1999',                                { type: 'checkbox' }),
            f('norma_e1999_year', 'Año/sufijo',                                { placeholder: '-23' }),
            f('norma_e3047',      'ASTM E3047',                                { type: 'checkbox' }),
            f('norma_e3047_year', 'Año/sufijo',                                { placeholder: '-22' }),
            f('norma_e1019',      'ASTM E1019 — C y S (combustión IR)',         { type: 'checkbox' }),
            f('norma_e1019_year', 'Año/sufijo',                                { placeholder: '-24' }),
            f('norma_a751',       'ASTM A751 — Productos de acero',             { type: 'checkbox' }),
            f('norma_a751_year',  'Año/sufijo',                                { placeholder: '-25' }),
            f('norma_otra_chk',   'Otra norma',                                { type: 'checkbox' }),
            f('norma_otra',       'Otra norma (código)',                        { placeholder: 'ISO 15350' }),
          ]},
          { title: '1.b Metodología e identificación', cols: 4, fields: [
            f('itm_numero',      'N° de ITM',          { placeholder: '040' }),
            f('zona_evaluacion', 'Zona de evaluación', { placeholder: 'Material base' }),
            f('patron',          'Patrón N°',          { placeholder: 'MP-001' }),
            f('temperatura',     'Temperatura (°C)',   { type: 'number' }),
          ]},
          // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
          { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: EQ_QUIMICOS },
          // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
          //     (La tabla de composición se renderea automáticamente aquí.)
          // ─── 4 / 5. EVALUACIÓN + NOTAS (opcionales) ───────────────────────
          { title: '4. Evaluación de resultados / Notas (opcional)', cols: 1, fields: [
            f('tiene_nota',       'Incluir nota',                     { type: 'checkbox' }),
            f('nota_texto',       'Texto de la nota',                 { type: 'textarea' }),
            f('tiene_evaluacion', 'Incluir evaluación',               { type: 'checkbox' }),
            f('evaluacion_texto', 'Texto de la evaluación',           { type: 'textarea', placeholder: 'La muestra analizada satisface los requerimientos de composición química de un material tipo:' }),
          ]},
        ];
      },
      table: function () {
        // Orden EXACTO del template-quimicos.js (ELEMENTOS array). Mantener
        // este orden facilita la carga: el técnico baja por la columna en el
        // mismo orden que se rendea en el Word.
        return { type: 'vertical', rowsKey: 'muestras', required: true, filas: [
          { key: 'carbono',   label: 'Carbono (C)',              type: 'text' },
          { key: 'manganeso', label: 'Manganeso (Mn)',            type: 'text' },
          { key: 'silicio',   label: 'Silicio (Si)',              type: 'text' },
          { key: 'fosforo',   label: 'Fósforo (P)',               type: 'text' },
          { key: 'azufre',    label: 'Azufre (S)',                type: 'text' },
          { key: 'cromo',     label: 'Cromo (Cr)',                type: 'text' },
          { key: 'niquel',    label: 'Níquel (Ni)',               type: 'text' },
          { key: 'molibdeno', label: 'Molibdeno (Mo)',            type: 'text' },
          { key: 'cobre',     label: 'Cobre (Cu)',                type: 'text' },
          { key: 'vanadio',   label: 'Vanadio (V)',               type: 'text' },
          { key: 'carb_eq',   label: 'Carb. Equivalente (Ceq)',   type: 'text' },
          { key: 'titanio',   label: 'Titanio (Ti)',              type: 'text' },
          { key: 'niobio',    label: 'Niobio (Nb)',               type: 'text' },
          { key: 'boro',      label: 'Boro (B)',                  type: 'text' },
          { key: 'aluminio',  label: 'Aluminio (Al)',             type: 'text' },
          { key: 'plomo',     label: 'Plomo (Pb)',                type: 'text' },
          { key: 'cobalto',   label: 'Cobalto (Co)',              type: 'text' },
          { key: 'tungsteno', label: 'Tungsteno (W)',             type: 'text' },
          { key: 'magnesio',  label: 'Magnesio (Mg)',             type: 'text' },
          { key: 'hierro',    label: 'Hierro (Fe)',               type: 'text' },
          { key: 'nitrogeno', label: 'Nitrógeno (N)',             type: 'text' },
          { key: 'estano',    label: 'Estaño (Sn)',               type: 'text' },
          { key: 'zinc',      label: 'Zinc (Zn)',                 type: 'text' },
          { key: 'antimonio', label: 'Antimonio (Sb)',            type: 'text' },
          { key: 'cadmio',    label: 'Cadmio (Cd)',               type: 'text' },
          { key: 'arsenico',  label: 'Arsénico (As)',             type: 'text' },
          { key: 'selenio',   label: 'Selenio (Se)',              type: 'text' },
          { key: 'bismuto',   label: 'Bismuto (Bi)',              type: 'text' },
          { key: 'plata',     label: 'Plata (Ag)',                type: 'text' },
        ]};
      },
    },

    /* ---------------- DUREZA BRINELL ---------------- */
    'dureza-brinell': {
      icon: 'dureza',
      descr: 'Dureza Brinell por penetración con esfera.',
      defaults: function (v) {
        var base = {};
        base.equipamiento = (v === 'neuquen')
          ? { shimadzu_151: true, calibre_694: true, termohigro_794: true }
          : { petri_170: true, calibre_cal570: true, registrador_702: true, proyector_165: true };
        return base;
      },
      variants: [
        { id: 'estandar', label: 'Estándar · CABA', sub: 'Durómetro Petri MM-170' },
        { id: 'neuquen',  label: 'Neuquén',          sub: 'Shimadzu MM-151' },
      ],
      sections: function (v) {
        return [
          // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
          { title: '1. Condiciones de ensayo — Normas', cols: 2, fields: [
            f('norma_astm_e10',  'ASTM E10-23',         { type: 'checkbox' }),
            f('norma_iso6506',   'ISO 6506-1:2014',     { type: 'checkbox' }),
            f('metodologia',     'Metodología (ITM)',    { placeholder: 'ITM N°059' }),
            f('patron',          'Patrón N° (PMM-)',     { placeholder: '716' }),
          ]},
          { title: '1.b Parámetros de ensayo', cols: 4, fields: [
            f('carga_aplicada',    'Carga (kgf)',          { type: 'number', placeholder: '750' }),
            f('bolilla_diametro',  'Bolilla Ø (mm)',       { type: 'number', placeholder: '5' }),
            f('diametro_impronta', 'Diámetro impronta (mm)', { type: 'number' }),
            f('tiempo_aplicacion', 'Tiempo (s)',           { type: 'number', placeholder: '15' }),
            f('temperatura',       'Temperatura (°C)',     { type: 'number' }),
            f('zona_ensayo',       'Zona de impronta',     { placeholder: 'Superficie' }),
            f('espesor_probeta',   'Espesor probeta (mm)', { type: 'number' }),
            f('muestra_ensayada',  'Muestra ensayada',     { placeholder: 'Plancha 1' }),
            f('indentador',        'Indentador',           { placeholder: 'Esfera Ø 5 mm' }),
          ]},
          // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
          { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: EQ_BRINELL },
          // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
          { title: '3. Resultados obtenidos — Columnas opcionales de tabla', cols: 3, fields: [
            f('incluir_zona',              'Incluir columna Zona',              { type: 'checkbox' }),
            f('incluir_espesor',           'Incluir columna Espesor (mm)',      { type: 'checkbox' }),
            f('incluir_diametro_impronta', 'Incluir columna Ø Impronta (mm)',   { type: 'checkbox' }),
          ]},
          // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
          { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
            f('tiene_evaluacion', 'Incluir evaluación de resultados',              { type: 'checkbox' }),
            f('evaluacion_texto', 'Texto de la evaluación',                        { type: 'textarea', placeholder: 'Las durezas obtenidas satisfacen los requerimientos de la norma…' }),
          ]},
          // ─── 5. NOTAS (opcional) ──────────────────────────────────────────
          { title: '5. Notas (opcional)', cols: 1, fields: [
            f('tiene_nota', 'Incluir nota',       { type: 'checkbox' }),
            f('nota_texto', 'Texto de la nota',   { type: 'textarea', placeholder: 'Texto de la nota a incluir bajo el título NOTA' }),
          ]},
        ];
      },
      table: function (v, datos) {
        var cols = [{ key: 'dureza', label: 'Dureza (HB)', type: 'number', w: 200 }];
        if (datos && datos.incluir_diametro_impronta) cols.unshift({ key: 'diametro_impronta', label: 'Ø Impronta (mm)', type: 'number', w: 140 });
        if (datos && datos.incluir_espesor) cols.unshift({ key: 'espesor', label: 'Espesor (mm)', type: 'number', w: 140 });
        if (datos && datos.incluir_zona)    cols.unshift({ key: 'zona',    label: 'Zona',          type: 'text',   w: 160 });
        return { rowsKey: 'mediciones', required: true, columns: cols };
      },
    },

    /* ---------------- DUREZA ROCKWELL ---------------- */
    'dureza-rockwell': {
      icon: 'dureza',
      descr: 'Dureza Rockwell por penetración con cono de diamante o bola.',
      defaults: function (v) {
        var base = {
          zonas_rockwell: [
            { muestra: '', zona: '', dureza: '' },
            { muestra: '', zona: '', dureza: '' },
            { muestra: '', zona: '', dureza: '' },
            { muestra: '', zona: '', dureza: '' },
            { muestra: '', zona: '', dureza: '' },
            { muestra: '', zona: '', dureza: '' },
          ],
        };
        base.equipamiento = (v === 'neuquen')
          ? { durometro_petri: true, termohigro_794: true, calibre_694: true }
          : { durometro_petri: true, termohigro_545: true };
        return base;
      },
      variants: [
        { id: 'estandar', label: 'Estándar · CABA', sub: 'Durómetro Petri MM-012' },
        { id: 'neuquen',  label: 'Neuquén',         sub: 'Durómetro Petri MM-012' },
      ],
      sections: function (v) {
        return [
          // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
          { title: '1. Condiciones de ensayo — Normas', cols: 2, fields: [
            f('norma_astm_e18', 'ASTM E18-25',      { type: 'checkbox' }),
            f('norma_iso6508',  'ISO 6508-1:2023',  { type: 'checkbox' }),
            f('metodologia',    'Metodología (ITM)', { placeholder: 'ITM N°060' }),
            f('patron',         'Patrón N° (PMM-)',  { placeholder: '172' }),
          ]},
          { title: '1.b Parámetros de ensayo', cols: 4, fields: [
            f('escala',          'Escala',              { type: 'select', options: ['HRA','HRB','HRC','HRD','HRE','HRF','HRG','HRH'] }),
            f('carga_aplicada',  'Carga (Kgf)',         { type: 'number', placeholder: '150' }),
            f('indentador',      'Indentador',          { placeholder: 'Cono de diamante 120°' }),
            f('temperatura',     'Temperatura (°C)',    { type: 'number' }),
            f('zona_ensayo',     'Zona ensayada',       { placeholder: 'Núcleo / Cabeza' }),
            f('espesor_probeta', 'Espesor probeta (mm)', { type: 'number' }),
          ]},
          // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
          { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: EQ_ROCKWELL },
          // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
          //     (Tabla de mediciones se renderea automáticamente.)
          // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
          { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
            f('tiene_evaluacion', 'Incluir evaluación de resultados',              { type: 'checkbox' }),
            f('evaluacion_texto', 'Texto de la evaluación',                        { type: 'textarea', placeholder: 'La muestra satisface los requerimientos de dureza de la norma…' }),
          ]},
          // ─── 5. NOTAS (opcional) ──────────────────────────────────────────
          { title: '5. Notas (opcional)', cols: 1, fields: [
            f('tiene_nota', 'Incluir nota',       { type: 'checkbox' }),
            f('nota_texto', 'Texto de la nota',   { type: 'textarea', placeholder: 'Texto de la nota a incluir bajo el título NOTA' }),
          ]},
        ];
      },
      table: function () {
        return {
          rowsKey: 'mediciones',
          required: true,
          columns: [
            { key: 'dureza', label: 'Dureza', type: 'number', w: 200 },
          ],
        };
      },
    },

    /* ---------------- DUREZA VICKERS ---------------- */
    'dureza-vickers': {
      icon: 'dureza',
      descr: 'Dureza Vickers por penetración con diamante piramidal.',
      defaults: function () {
        return {
          equipamiento: { buehler_405: true },
        };
      },
      variants: null,
      sections: function () {
        return [
          // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
          { title: '1. Condiciones de ensayo — Norma y metodología', cols: 3, fields: [
            f('norma', 'Norma de ensayo', { placeholder: 'ASTM E384-22' }),
            f('norma_year_suffix', 'Año/sufijo norma', { placeholder: '-22' }),
            f('metodologia', 'Metodología (ITM)', { placeholder: 'ITM N°076' }),
            f('patron', 'Patrón N° (PMM-)', { placeholder: '301' }),
            f('metodologia_cliente', 'Metodología según indicaciones del cliente', { type: 'checkbox' }),
          ]},
          { title: '1.b Normas adicionales', cols: 3, fields: [
            f('norma_astm_e384',     'ASTM E384',             { type: 'checkbox' }),
            f('norma_din_en_1043',   'DIN EN 1043',           { type: 'checkbox' }),
            f('norma_din_iso_15614', 'DIN ISO 15614',         { type: 'checkbox' }),
            f('norma_ypf_b0005',     'YPF ED-B-00.05-01',    { type: 'checkbox' }),
            f('norma_ypf_b0500',     'YPF ED-B-05.00-01',    { type: 'checkbox' }),
            f('norma_ypf_ep',        'YPF ED(EP)-B-02.00-00',{ type: 'checkbox' }),
          ]},
          { title: '1.c Códigos de referencia', cols: 3, fields: [
            f('cod_asme',    'ASME BPVC Secc. IX', { type: 'checkbox' }),
            f('ed_asme',     'Edición ASME',       { placeholder: '2025' }),
            f('cod_aws_d11', 'AWS D1.1',           { type: 'checkbox' }),
            f('cod_api1104', 'API 1104',           { type: 'checkbox' }),
          ]},
          { title: '1.d Parámetros de ensayo', cols: 3, fields: [
            f('carga_aplicada',      'Carga (kgf)',           { type: 'select', options: ['0,1','0,3','0,5','1','3','5','10','30','50','100'] }),
            f('indentador',          'Indentador',             { placeholder: 'Diamante piramidal 136°' }),
            f('tiempo_aplicacion',   'Tiempo (s)',             { type: 'number', placeholder: '10' }),
            f('espesor_probeta',     'Espesor probeta (mm)',   { type: 'number' }),
            f('temperatura',         'Temperatura (°C)',       { type: 'number' }),
          ]},
          // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
          { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: EQ_VICKERS },
          // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
          //     (Tabla de improntas se renderea automáticamente.)
          {
            title: '3.b Imágenes del ensayo (mapas de durezas, etc.)',
            type: 'photos',
            key: 'imagenes_resultado',
            hint: 'Cada imagen se inserta después de la tabla, con su caption (ej. "Imagen N°4 – Mapa de durezas metal base").',
          },
          // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
          { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
            f('tiene_evaluacion', 'Incluir evaluación',                 { type: 'checkbox' }),
            f('evaluacion_texto', 'Texto de la evaluación',             { type: 'textarea', placeholder: 'Las durezas obtenidas cumplen con los requerimientos…' }),
          ]},
          // ─── 5. NOTAS (opcional) ──────────────────────────────────────────
          { title: '5. Notas (opcional)', cols: 1, fields: [
            f('nota_conversion', 'Incluir nota de conversión HV→HB',  { type: 'checkbox' }),
            f('tiene_nota',      'Incluir nota',                       { type: 'checkbox' }),
            f('nota_texto',      'Texto de la nota',                   { type: 'textarea' }),
          ]},
        ];
      },
      table: function () {
        return { required: true, rowsKey: 'mediciones', columns: [
          { key: 'impronta',  label: 'N° impronta',       type: 'text',   w: 110 },
          { key: 'dureza',    label: 'Dureza (HV)',       type: 'number', w: 140 },
        ]};
      },
    },

    /* ---------------- FERRITA DELTA ---------------- */
    'ferrita-delta': {
      icon: 'ferrita',
      descr: 'Cuantificación de ferrita delta en aceros inoxidables.',
      defaults: function (v) {
        var base = {};
        if (v === 'microscopio') base.modo_resultado = 'narrativo';
        return base;
      },
      variants: [
        { id: 'fischer',     label: 'Fischer portátil',  sub: 'Resultado único' },
        { id: 'microscopio', label: 'Microscopio Leica', sub: 'Probetas o zonas libres' },
      ],
      sections: function (v, datos) {
        if (v !== 'microscopio') {
          // ── Variante Fischer ─────────────────────────────────────────────
          return [
            // ─── 1. CONDICIONES ─────────────────────────────────────────────
            { title: '1. Condiciones de ensayo — Normas y metodología', cols: 2, fields: [
              f('norma',       'Norma de ensayo (opcional)', { placeholder: 'ASTM A923-25' }),
              f('metodologia', 'Metodología',                 { placeholder: 'ITM N°032' }),
            ]},
            { title: '1.b Parámetros de ensayo', cols: 3, fields: [
              f('zona_examinada',      'Zona examinada',      { placeholder: 'Soldadura' }),
              f('sectores',            'Sectores analizados', { placeholder: 'Sector A, Sector B' }),
              f('cantidad_mediciones', 'Cant. mediciones',    { placeholder: '10 por sector' }),
              f('temperatura',         'Temperatura (°C)',    { placeholder: '22.5' }),
            ]},
            // ─── 3. RESULTADOS ──────────────────────────────────────────────
            { title: '3. Resultado', cols: 2, fields: [
              f('sin_deteccion', 'No se detecta ferrita delta (< 0.1 %)', { type: 'checkbox' }),
              f('resultado',     '% Ferrita delta',                       { type: 'number', placeholder: '6.5' }),
            ]},
            // ─── 5. NOTAS (opcional) ────────────────────────────────────────
            { title: '5. Notas (opcional)', cols: 1, fields: [
              f('tiene_nota',  'Incluir nota',                          { type: 'checkbox' }),
              f('nota_texto',  'Texto de la nota',                      { type: 'textarea' }),
            ]},
          ];
        }
        // ── Variante Microscopio ────────────────────────────────────────
        var modo = (datos && datos.modo_resultado) || 'narrativo';
        var secs = [
          // ─── 1. CONDICIONES ─────────────────────────────────────────────
          { title: '1. Condiciones de ensayo — Modo de resultado', cols: 1, fields: [
            f('modo_resultado', 'Cómo se reporta el resultado', { type: 'select', options: [
              { value: 'narrativo', label: 'Narrativo por zona (texto libre — sup. ext. / núcleo / sup. int.)' },
              { value: 'tabla',     label: 'Tabla por probeta (MB / Z.A.C. / Soldadura)' },
            ]}),
          ]},
          { title: '1.b Normas y metodología', cols: 2, fields: [
            f('norma',       'Norma de ensayo', { placeholder: 'ASTM E562-19e1' }),
            f('metodologia', 'Metodología',     { placeholder: 'Procedimiento interno' }),
          ]},
          { title: '1.c Parámetros de ensayo', cols: 3, fields: [
            f('reactivo',    'Reactivo utilizado', { placeholder: 'Nitro fluorglicerina' }),
            f('aumento',     'Aumento',            { placeholder: '1000 X' }),
            f('temperatura', 'Temperatura (°C)',   { placeholder: '21.6' }),
          ]},
        ];
        if (modo === 'tabla') {
          secs.push({ title: '3. Resultados obtenidos — Probetas y mediciones', cols: 2, fields: [
            f('cantidad_probetas',      'Cantidad de probetas', { type: 'number', placeholder: '2' }),
            f('cantidad_mediciones_v2', 'Mediciones por zona',  { type: 'number', placeholder: '5' }),
          ]});
        }
        // ─── 3.b IMÁGENES DEL RESULTADO ────────────────────────────────────
        secs.push({
          title: '3.b Imágenes de microscopía',
          type: 'photos',
          key: 'imagenes',
          hint: 'Cada imagen lleva un caption ("Imagen N°X - <descripción>"). Se numeran automáticamente continuando desde la carátula.',
        });
        // ─── 5. NOTAS (opcional) ────────────────────────────────────────────
        secs.push({ title: '5. Notas (opcional)', cols: 1, fields: [
          f('tiene_nota', 'Incluir nota',                          { type: 'checkbox' }),
          f('nota_texto', 'Texto de la nota',                      { type: 'textarea' }),
        ]});
        return secs;
      },
      table: function (v, datos) {
        if (v !== 'microscopio') return null;
        var modo = (datos && datos.modo_resultado) || 'narrativo';
        if (modo === 'narrativo') {
          return {
            rowsKey: 'zonas',
            required: true,
            columns: [
              { key: 'zona',  label: 'Zona examinada',  type: 'text',   w: 280 },
              { key: 'valor', label: '% Ferrita delta', type: 'number', w: 180 },
            ],
          };
        }
        return {
          rowsKey: 'probetas',
          required: true,
          columns: [
            { key: 'nombre',    label: 'Probeta',        type: 'text',   w: 110 },
            { key: 'zona_mb',   label: 'Metal Base (%)', type: 'number', w: 130 },
            { key: 'zona_zac',  label: 'Z.A.C. (%)',     type: 'number', w: 130 },
            { key: 'zona_sold', label: 'Soldadura (%)',  type: 'number', w: 130 },
          ],
        };
      },
    },
  };

  // ── Modelo F2 — 8 ensayos metalográficos ──────────────────────────────────
  // Comparten estructura común: CONDICIONES + EQUIPAMIENTO + RESULTADOS,
  // todos los campos opcionales con checkbox de "incluir" cuando aplica.
  // El generator (server/generators/template-metalografia.js) acepta cualquiera
  // de los 8 subtipos y configura título / normas defaults / tabla específica.

  function commonSections(opts) {
    var soportaAtaque  = opts && opts.soportaAtaque  !== false;
    var soportaZona    = opts && opts.soportaZona    !== false;
    var soportaMuestra = opts && opts.soportaMuestra !== false;
    // Si el subtipo define `normaOptions`, norma_1 se renderiza como combo
    // editable (opciones predefinidas + posibilidad de tipear manualmente).
    var normaField = (opts && opts.normaOptions)
      ? f('norma_1', 'Norma de ensayo', {
          type: 'combo', options: opts.normaOptions,
          placeholder: (opts && opts.normaPlaceholder) || '',
        })
      : f('norma_1', 'Norma de ensayo', { placeholder: (opts && opts.normaPlaceholder) || '' });
    var norma2Field = (opts && opts.norma2Options)
      ? f('norma_2', '2ª norma de ensayo', {
          type: 'combo', options: opts.norma2Options,
          placeholder: (opts && opts.norma2Placeholder) || '',
        })
      : f('norma_2', '2ª norma de ensayo', { placeholder: (opts && opts.norma2Placeholder) || '' });
    // Si el subtipo define `itmOptions`, metodologia es combo
    var metoField = (opts && opts.itmOptions)
      ? f('metodologia', 'Metodología (ITM)', {
          type: 'combo', options: opts.itmOptions,
          placeholder: (opts && opts.metoPlaceholder) || 'ITM N°…',
        })
      : f('metodologia', 'Metodología (ITM)', { placeholder: (opts && opts.metoPlaceholder) || 'ITM N°…' });
    var sectsCond = [
      { title: '1. Condiciones de ensayo', cols: 2, fields: [
        // Si se carga la norma se incluye automáticamente — sin checkbox extra.
        normaField,
        norma2Field,
        metoField,
        f('temperatura',  'Temperatura (°C)',        { type: 'number' }),
      ]},
    ];
    if (soportaAtaque) {
      sectsCond.push({ title: '1.b Ataque utilizado (hasta 3)', cols: 1, fields: [
        f('ataque_1', 'Ataque 1', { placeholder: 'Nital al 2%' }),
        f('ataque_2', 'Ataque 2', { placeholder: 'Nitro fluor glicerina' }),
        f('ataque_3', 'Ataque 3', { placeholder: 'Reactivo Vilella' }),
      ]});
    }
    var datosFields = [];
    if (soportaZona)    datosFields.push(f('zona_examinada', 'Zona examinada', { placeholder: 'Núcleo - Superficie (Corte longitudinal - Corte transversal)' }));
    if (soportaMuestra) datosFields.push(f('muestra_ensayada', 'Muestra ensayada', { placeholder: 'M1' }));
    datosFields.push(f('otros_param', 'Otros parámetros (texto libre)', { type: 'textarea', placeholder: 'Rango de medición, profundidad, etc.' }));
    sectsCond.push({ title: '1.c Zona y muestra', cols: 2, fields: datosFields });
    return sectsCond;
  }
  var EQ_METALOGRAFIA = [
    { key: 'microscopio_378', label: 'Microscopio Leica DM 750 TAG N˚MM-378' },
    { key: 'termohigro_700',  label: 'Termohigrómetro TAG N˚MM-700' },
    { key: 'estereoscopio',   label: 'Estereoscopio Leica EZ4 TAG N˚MM-379' },
  ];
  function commonEquipo() {
    // Equipamiento como checkboxes (igual que tracción/impacto). El aumento
    // utilizado va aparte porque siempre debe estar.
    return [
      { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: EQ_METALOGRAFIA },
      { title: '2.b Aumento', cols: 1, fields: [
        f('aumento', 'Aumento utilizado (X)', { placeholder: '100' }),
      ]},
    ];
  }
  function commonResult() {
    return { title: '3. Resultados obtenidos', cols: 1, fields: [
      f('resultado_texto',  'Texto del resultado', { type: 'textarea', placeholder: 'La muestra analizada posee una microestructura compuesta por…' }),
      f('caption_imagen',   'Caption de imagen',   { placeholder: 'Imagen N°X – Microestructura (100 X)' }),
    ]};
  }
  function commonNotaEval() {
    // Devuelve un array con dos secciones: 4 (evaluación) y 5 (notas).
    return [
      { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
        f('tiene_evaluacion', 'Incluir evaluación',  { type: 'checkbox' }),
        f('evaluacion_texto', 'Texto evaluación',    { type: 'textarea' }),
      ]},
      { title: '5. Notas (opcional)', cols: 1, fields: [
        f('tiene_nota', 'Incluir nota',        { type: 'checkbox' }),
        f('nota_texto', 'Texto de nota',       { type: 'textarea' }),
      ]},
    ];
  }

  function metaloSchema(opts) {
    return {
      icon: 'microscope',
      // Ensayos F2 consolidados en "Análisis Metalográfico General": se ocultan
      // del listado "Agregar ensayo" pero siguen visibles/editables en OTs
      // viejas que ya los tenían cargados.
      deprecated: true,
      descr: opts.descr,
      defaults: function () {
        return Object.assign({
          equipamiento: { microscopio_378: true, termohigro_700: true },
          imagenes_resultado: [],
        }, opts.defaults || {});
      },
      sections: function () {
        var s = commonSections(opts);
        commonEquipo().forEach(function (sec) { s.push(sec); });
        s.push(commonResult());
        if (opts.extraSections) opts.extraSections.forEach(function (x) { s.push(x); });
        if (opts.permiteImagen !== false) {
          s.push({
            title: '3.b Imagen del ensayo',
            type: 'photos',
            key: 'imagenes_resultado',
            hint: 'La primera imagen se inserta antes del caption en el Word.',
          });
        }
        // commonNotaEval devuelve [ Evaluación (4), Notas (5) ]
        commonNotaEval().forEach(function (sec) { s.push(sec); });
        return s;
      },
      // Sin tabla de resultados (los datos van en texto libre + tabla específica
      // para inclusiones que se inserta en el generator).
      table: function () { return null; },
    };
  }

  var NORMAS_MICRO = [
    'ASM Metal Handbook Vol.9:2004',
    'ASTM E3-11(2025)',
    'ASTM E407-23',
    'ASTM E883-11(2024)',
    'IRAM-IAS U 500-126',
  ];
  var ITMS_METALO = ['ITM N°062', 'ITM N°063', 'ITM N°064', 'ITM N°032'];
  SCHEMAS['microestructura'] = metaloSchema({
    descr: 'Análisis metalográfico de microestructura (modelo F2).',
    normaPlaceholder:  'ASM Metal Handbook Vol.9:2004',
    metoPlaceholder:   'ITM N°062',
    normaOptions:  NORMAS_MICRO,
    norma2Options: NORMAS_MICRO,
    itmOptions:    ITMS_METALO,
    soportaAtaque: true, soportaZona: true, soportaMuestra: true,
  });
  var NORMAS_TG = [
    'ASTM E112-25',
    'ASTM E1382-97(2023)',
    'IRAM-IAS U 500-122',
    'ISO 643:2024',
  ];
  SCHEMAS['tamano-grano'] = metaloSchema({
    descr: 'Determinación de tamaño de grano (modelo F2).',
    normaPlaceholder:  'ASTM E112-25',
    metoPlaceholder:   'ITM N°064',
    normaOptions:  NORMAS_TG,
    norma2Options: NORMAS_TG,
    itmOptions:    ITMS_METALO,
    soportaAtaque: true, soportaZona: true, soportaMuestra: true,
  });
  SCHEMAS['inclusiones'] = metaloSchema({
    descr: 'Determinación de inclusiones (modelo F2).',
    normaPlaceholder:  'ASTM E45-25',
    norma2Placeholder: 'ASTM E45 Método C',
    metoPlaceholder:   'ITM N°063',
    normaOptions: [
      'ASTM E45-25',
      'ASTM E45-25 Método A',
      'ASTM E45-25 Método B',
      'ASTM E45-25 Método C',
      'ASTM E45-25 Método D',
      'ISO 4967:2013',
      'DIN 50602',
    ],
    norma2Options: [
      'ASTM E45-25',
      'ASTM E45-25 Método A',
      'ASTM E45-25 Método B',
      'ASTM E45-25 Método C',
      'ASTM E45-25 Método D',
      'ISO 4967:2013',
      'DIN 50602',
    ],
    itmOptions:    ITMS_METALO,
    soportaAtaque: false, soportaZona: true, soportaMuestra: false,
    extraSections: [
      { title: 'Tabla de inclusiones (cuadrante A/B/C/D × Fino/Grueso)', cols: 4, fields: [
        f('inclusiones.fino_a',   'Fino · Sulfuros (A)'),
        f('inclusiones.fino_b',   'Fino · Aluminatos (B)'),
        f('inclusiones.fino_c',   'Fino · Silicatos (C)'),
        f('inclusiones.fino_d',   'Fino · Ox.Globulares (D)'),
        f('inclusiones.grueso_a', 'Grueso · Sulfuros (A)'),
        f('inclusiones.grueso_b', 'Grueso · Aluminatos (B)'),
        f('inclusiones.grueso_c', 'Grueso · Silicatos (C)'),
        f('inclusiones.grueso_d', 'Grueso · Ox.Globulares (D)'),
      ]},
    ],
  });
  SCHEMAS['estructura-grafito'] = metaloSchema({
    descr: 'Determinación de estructura de grafito (modelo F2).',
    normaPlaceholder:  'IRAM-IAS U 500-128',
    norma2Placeholder: 'ASTM A247-24',
    metoPlaceholder:   'ITM N°…',
    normaOptions:  ['IRAM-IAS U 500-128', 'ASTM A247-24', 'ISO 945-1:2017'],
    norma2Options: ['IRAM-IAS U 500-128', 'ASTM A247-24', 'ISO 945-1:2017'],
    itmOptions:    ITMS_METALO,
    soportaAtaque: true, soportaZona: true, soportaMuestra: true,
  });
  SCHEMAS['espesor-capa'] = metaloSchema({
    descr: 'Espesor de capa (modelo F2). Sin norma fija — procedimiento interno.',
    normaPlaceholder:  '',
    metoPlaceholder:   'Metodología según procedimiento interno',
    soportaAtaque: true, soportaZona: false, soportaMuestra: false,
  });
  SCHEMAS['decarburacion'] = metaloSchema({
    descr: 'Determinación de decarburación (modelo F2).',
    normaPlaceholder:  'SAE J419_201801',
    metoPlaceholder:   'ITM N°…',
    normaOptions:  ['SAE J419_201801', 'ASTM E1077-14(2021)', 'IRAM-IAS U 500-134'],
    itmOptions:    ITMS_METALO,
    soportaAtaque: true, soportaZona: false, soportaMuestra: false,
  });
  SCHEMAS['defectos-superficiales'] = metaloSchema({
    descr: 'Detección de defectos superficiales (modelo F2).',
    normaPlaceholder:  '',
    metoPlaceholder:   'Metodología según procedimiento interno',
    soportaAtaque: false, soportaZona: true, soportaMuestra: false,
  });
  SCHEMAS['porosidad'] = metaloSchema({
    descr: 'Determinación de porosidad (modelo F2).',
    normaPlaceholder:  'ASM Metal Handbook Vol.9:2004',
    metoPlaceholder:   'ITM N°…',
    normaOptions:  ['ASM Metal Handbook Vol.9:2004', 'ASTM E2109-01(2021)'],
    itmOptions:    ITMS_METALO,
    soportaAtaque: false, soportaZona: true, soportaMuestra: true,
  });

  // ── Rugosidad (modelo F2 241451) ──────────────────────────────────────────
  // El laboratorio NO está acreditado en rugosidad → OAA siempre se marca como
  // fuera del alcance automáticamente (asterisco + línea OAA). No se expone
  // checkbox de OAA al usuario.
  var EQ_RUGOSIDAD = [
    { key: 'rugosimetro_628',  label: 'Rugosímetro Mitutoyo SJ 410 TAG N°MM-628' },
    { key: 'patron_pmm630',    label: 'Patrón de referencia Mitutoyo TAG N°PMM-630' },
    { key: 'termohigro_700',   label: 'Termohigrómetro TAG N°MM-700' },
  ];
  SCHEMAS['rugosidad'] = {
    icon: 'ruler',
    descr: 'Rugosidad superficial (modelo F2 241451). Mediciones Ra/Rz/Rt/Rq.',
    defaults: function () {
      return {
        // tipo_r sin default → el select muestra "Seleccionar…"; el técnico elige.
        mediciones: [],
        equipamiento: { rugosimetro_628: true, patron_pmm630: true, termohigro_700: true },
      };
    },
    sections: function () {
      return [
        // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
        { title: '1. Condiciones de ensayo', cols: 2, fields: [
          f('norma_1', 'Norma de ensayo', {
            type: 'combo',
            options: ['ASME B46.1-2019', 'ISO 21920-2:2021', 'ISO 25178-2:2021', 'ASTM A480/A480M-25b', 'ISO 4287:1997 (retirada)'],
            placeholder: 'Ej: ASME B46.1-2019',
          }),
          f('itm_numero',          'ITM (solo número)',          { placeholder: '048' }),
          f('sentido_medicion', 'Sentido de medición', {
            type: 'combo',
            options: ['Transversal al pulido', 'Longitudinal al pulido', 'Transversal al maquinado', 'Longitudinal al maquinado'],
            placeholder: 'Ej: Transversal al pulido',
          }),
          f('valor_requerido',     'Valor requerido (µm máximo)', { placeholder: '3,2' }),
          f('cantidad_mediciones', 'Cantidad de mediciones',     { type: 'number', placeholder: '5' }),
          f('temperatura',         'Temperatura (°C)',           { type: 'number', placeholder: '22' }),
          f('tipo_r', 'Tipo de R', { type: 'select', options: ['a', 'z', 't', 'q', 'p', 'v', 'sm', 'sk', 'ku'] }),
        ]},
        // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
        { title: '2. Equipamiento utilizado', type: 'equipoBoxes', equipos: EQ_RUGOSIDAD },
        // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
        { title: '3. Resultados obtenidos', cols: 2, fields: [
          f('resultado_texto', 'Texto del resultado (deja vacío para usar el default)',
            { type: 'textarea',
              placeholder: 'Ej: "Los valores obtenidos fueron los siguientes:"' }),
          f('formato_tabla', 'Formato de tabla', {
            type: 'select', options: ['simple', 'expandida'],
          }),
          f('valor_rugosidad', 'Valor de rugosidad (µm) — solo si NO cargás texto libre',
            { placeholder: 'Ej: 2,8' }),
          f('valor_max_eval',  'Valor máximo evaluación (µm)', { placeholder: 'Ej: 3,2' }),
        ]},
        // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
        { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
          f('eval_texto', 'Texto de evaluación',
            { type: 'textarea', placeholder: 'Luego de realizadas las mediciones se observa…' }),
        ]},
        // ─── 5. NOTAS (opcional) ──────────────────────────────────────────
        { title: '5. Notas (opcional)', cols: 1, fields: [
          f('tiene_nota', 'Incluir nota',  { type: 'checkbox' }),
          f('nota_texto', 'Texto de nota', { type: 'textarea' }),
        ]},
      ];
    },
    table: function (v, datos) {
      // Columnas dinámicas según formato_tabla
      if (datos && datos.formato_tabla === 'expandida') {
        return {
          rowsKey: 'mediciones', required: false,
          columns: [
            { key: 'muestra', label: 'Muestra N°', type: 'text', w: 110 },
            { key: 'ra',      label: 'Ra (µm)',    type: 'text', w: 110 },
            { key: 'rz',      label: 'Rz (µm)',    type: 'text', w: 110 },
            { key: 'rt',      label: 'Rt (µm)',    type: 'text', w: 110 },
          ],
        };
      }
      return {
        rowsKey: 'mediciones', required: false,
        columns: [
          { key: 'muestra',   label: 'Muestra',         type: 'text',   w: 100 },
          { key: 'rugosidad', label: 'Rugosidad',       type: 'text',   w: 120 },
          { key: 'valor',     label: 'R (µm)',          type: 'text',   w: 100 },
        ],
      };
    },
  };

  // ── Macrografía general (modelo F2 244325) ───────────────────────────────
  SCHEMAS['macrografia'] = {
    icon: 'microscope',
    descr: 'Macrografía general (modelo F2 244325). Análisis de soldadura.',
    defaults: function () {
      return {
        ops: [1],
        equipamiento: { termohigro_700: true },
        oaa: true, // las macrografías siempre quedan fuera del alcance OAA
      };
    },
    sections: function () {
      return [
        // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
        { title: '1. Condiciones de ensayo — Normas y metodología', cols: 2, fields: [
          f('norma_ensayo', 'Norma de ensayo (opcional)',
            { placeholder: 'EN ISO 17639:2022' }),
          f('metodologia',  'Metodología de ensayo',
            { placeholder: 'ITM N°061' }),
        ]},
        { title: '1.b Condiciones de ensayo', cols: 2, fields: [
          f('ataque_1', 'Ataque utilizado',
            { type: 'select-editable', options: ['Nital al 2%', 'Ácido clorhídrico al 50 %', 'Reactivo Marble', 'Cloruro férrico'], placeholder: 'Nital al 2%' }),
          f('temperatura',      'Temperatura (°C)',         { type: 'number' }),
          f('zona_examinada',   'Zona de ensayo',           { placeholder: 'Soldadura' }),
          f('muestra_ensayada', 'Muestra ensayada',         { placeholder: 'Muestra 1 / Zona afectada' }),
        ]},
        // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
        { title: '2. Equipamiento utilizado', cols: 1, fields: [
          f('eq_termohigro_700',  'Termohigrómetro TAG N°MM-700', { type: 'checkbox' }),
          f('eq_microscopio_378', 'Microscopio Leica DM 750 TAG N°MM-378', { type: 'checkbox' }),
          f('eq_calibre_703',     'Calibre digital Mitutoyo TAG N°MM-703', { type: 'checkbox' }),
          f('eq_extra',           'Equipamiento extra (texto libre, una línea por equipo)', { type: 'textarea' }),
        ]},
        // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
        { title: '3. Resultados obtenidos — Elegí qué opciones incluir', cols: 1, fields: [
          f('op_1', 'OP 1 — Buena penetración y fusión, sin porosidades', { type: 'checkbox' }),
          f('op_2', 'OP 2 — No presenta buena penetración y fusión',     { type: 'checkbox' }),
          f('op_3', 'OP 3 — Presenta estructura de fundido',              { type: 'checkbox' }),
          f('op_4', 'OP 4 — Correcto flujo de líneas de forja',           { type: 'checkbox' }),
          f('resultado_texto', 'Texto libre del resultado (sobrescribe OP 1 si está cargada)',
            { type: 'textarea', placeholder: 'Luego del macroataque la probeta se clasifica como S1-R1-C1 según ASTM E381-22.' }),
        ]},
        {
          title: '3.b Imágenes del ensayo (macrografía/s)',
          type: 'photos',
          key: 'imagenes_resultado',
          hint: 'Cada foto se inserta al final del ensayo con su caption (ej. "Imagen N°2 – Macrografía").',
        },
        { title: '3.c Tabla de análisis dimensional (opcional)', cols: 1, fields: [
          f('incluir_tabla_catetos', 'Incluir tabla de catetos', { type: 'checkbox' }),
        ]},
        // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
        { title: '4. Evaluación de resultados (opcional)', cols: 1, fields: [
          f('evaluacion_texto', 'Texto evaluación',        { type: 'textarea' }),
        ]},
        // ─── 5. NOTAS (opcional) ──────────────────────────────────────────
        { title: '5. Notas (opcional)', cols: 1, fields: [
          f('nota_texto',       'Texto de nota',           { type: 'textarea' }),
        ]},
      ];
    },
    // Tabla de catetos por muestra (Mtra 1, 2, 3)
    table: function () {
      return {
        rowsKey: 'muestras', required: false,
        columns: [
          { key: 'nombre',        label: 'Muestra',           type: 'text',   w: 80  },
          { key: 'cateto_1a',     label: 'Cateto 1A (mm)',    type: 'number', w: 120 },
          { key: 'cateto_2a',     label: 'Cateto 2A (mm)',    type: 'number', w: 120 },
          { key: 'diferencia_a',  label: 'Diferencia A (mm)', type: 'number', w: 130 },
          { key: 'cateto_1b',     label: 'Cateto 1B (mm)',    type: 'number', w: 120 },
          { key: 'cateto_2b',     label: 'Cateto 2B (mm)',    type: 'number', w: 120 },
          { key: 'diferencia_b',  label: 'Diferencia B (mm)', type: 'number', w: 130 },
        ],
      };
    },
  };

  // ─── ENSAYOS VARIOS ──────────────────────────────────────────────────────
  // Modelo FM. 066: todo el cuerpo del ensayo es libre. El técnico define el
  // título, las condiciones (label+valor libres en una tabla), el equipamiento,
  // los resultados (texto libre + tabla opcional) y la evaluación.
  SCHEMAS['varios'] = {
    icon: 'microscope',
    descr: 'Ensayo varios (modelo FM. 066). Título, condiciones y resultados libres. Siempre fuera del alcance OAA.',
    defaults: function () {
      return {
        titulo_ensayo: 'ENSAYO',
        condiciones_texto: 'Metodología de ensayo: ITM N°',
        equipamiento: {},
        oaa: true,
        tabla_dinamica: { headers: ['Columna 1'], filas: [] },
      };
    },
    sections: function () {
      return [
        // ─── 0. TÍTULO DEL ENSAYO ─────────────────────────────────────────
        { title: '0. Título del ensayo', cols: 1, fields: [
          f('titulo_ensayo', 'Título del ensayo (aparece como heading)',
            { placeholder: 'Ej.: ENSAYO DE TRACCIÓN NO STANDARD' }),
        ]},
        // ─── 1. CONDICIONES DE ENSAYO ─────────────────────────────────────
        { title: '1. Condiciones de ensayo', cols: 1, fields: [
          f('condiciones_texto', 'Condiciones (una línea por condición, formato "Label: Valor")',
            { type: 'textarea', placeholder: 'Norma de ensayo: ASTM F606\nMetodología de ensayo: ITM N°061\nTemperatura de ensayo: 22 °C' }),
          f('descripcion_procedimiento', 'Descripción del procedimiento (opcional)',
            { type: 'textarea', placeholder: 'Se sujeta el conjunto en la máquina...' }),
        ]},
        // ─── 2. EQUIPAMIENTO UTILIZADO ────────────────────────────────────
        { title: '2. Equipamiento utilizado', cols: 2, fields: [
          f('eq_balanza_003',       'Balanza analítica Shimadzu TAG N°MM-003',          { type: 'checkbox' }),
          f('eq_calibre_571',       'Calibre digital TAG N°MM-571',                     { type: 'checkbox' }),
          f('eq_traccion_emic_203', 'Máquina de tracción-compresión Emic TAG N°MM-203', { type: 'checkbox' }),
          f('eq_rigidez_130',       'Equipo de rigidez dieléctrica TAG N°MM-130',       { type: 'checkbox' }),
          f('eq_mufla_020',         'Mufla eléctrica TAG N°MM-020',                     { type: 'checkbox' }),
          f('eq_lupa_514',          'Lupa estereoscópica Olympus TAG N°MM-514',         { type: 'checkbox' }),
          f('eq_microscopio_378',   'Microscopio Leica DM 750 TAG N°MM-378',            { type: 'checkbox' }),
          f('eq_termohigro_545',    'Termohigrómetro TAG N°PCAL-545',                   { type: 'checkbox' }),
          f('eq_termohigro_700',    'Termohigrómetro TAG N°MM-700',                     { type: 'checkbox' }),
          f('eq_termohigro_794',    'Termohigrómetro TAG N°MM-794',                     { type: 'checkbox' }),
          f('equipamiento_extra',   'Equipamiento extra (una línea por equipo)',        { type: 'textarea' }),
        ]},
        // ─── 3. RESULTADOS OBTENIDOS ──────────────────────────────────────
        { title: '3. Resultados obtenidos', cols: 1, fields: [
          f('resultado_texto', 'Texto libre del resultado',
            { type: 'textarea', placeholder: 'Texto del resultado...' }),
        ]},
        {
          title: '3.b Tabla de resultados (opcional — si cargás algo, se incluye)',
          type: 'dynamicTable',
          key: 'tabla_dinamica',
          rowLabel: 'Fila',
        },
        {
          title: '3.c Imágenes del ensayo (opcional)',
          type: 'photos',
          key: 'imagenes_resultado',
          hint: 'Se insertan al final del ensayo con su caption.',
        },
        // ─── 4. EVALUACIÓN DE RESULTADOS (opcional) ───────────────────────
        { title: '4. Evaluación de resultados (opcional — si escribís texto, se incluye)', cols: 1, fields: [
          f('evaluacion_texto', 'Texto evaluación',   { type: 'textarea' }),
        ]},
      ];
    },
    // No hay `table` principal — la tabla de resultados se edita inline en la
    // sección dynamicTable de arriba.
  };

  // ─── ANÁLISIS METALOGRÁFICO GENERAL (FM-055) ────────────────────────────
  // Agrupa varios análisis metalográficos en un único informe. Form custom
  // MetalografiaGeneralForm. Generator dedicado template-metalografia-general.js.
  SCHEMAS['metalografia-general'] = {
    icon: 'microscope',
    descr: 'Análisis metalográfico general (modelo FM-055). Agrupa microestructura, espesor de recubrimiento, estructura de grafito, decarburación y otros.',
    defaults: function () {
      return {
        oaa: true,
        analisis: {
          micro:   { on: false, ref: '' },
          espesor: { on: false, ref: '' },
          grafito: { on: false, ref: '' },
          decarb:  { on: false, ref: '' },
          otro:    { on: false, ref: '' },
        },
        equipamiento: { olympus_016: true, leica_378: true, termo_700: true },
        equipamiento_tags: { olympus_016: 'MM-016', leica_378: 'MM-378', termo_700: 'MM-700' },
      };
    },
    sections: function () { return []; },
  };

  // ─── ANEXO METALOGRÁFICO (FM-080) ────────────────────────────────────────
  // Versión reducida enfocada en TAMAÑO DE GRANO y TENOR INCLUSIONARIO.
  SCHEMAS['anexo-metalografico'] = {
    icon: 'microscope',
    descr: 'Anexo metalográfico (modelo FM-080). Tamaño de grano y tenor inclusionario.',
    defaults: function () {
      return {
        oaa: true,
        grano: { itm: false, astm: false, metodo_chk: false, metodo: '' },
        inclu: { itm: false, astm: false, metodo_chk: false, metodo: '' },
        equipamiento: { leica_378: true, termo_700: true },
        equipamiento_tags: { leica_378: 'MM-378', termo_700: 'MM-700' },
      };
    },
    sections: function () { return []; },
  };

  // ─── LÍQUIDOS PENETRANTES ────────────────────────────────────────────────
  // Modelo FM-043. Todo el form es custom (LiquidosPenetrantesForm). El
  // generator dedicado template-liquidos-penetrantes.js arma el bloque Word.
  // Siempre fuera del alcance OAA.
  SCHEMAS['liquidos-penetrantes'] = {
    icon: 'microscope',
    descr: 'Ensayo por líquidos penetrantes (modelo FM-043). Búsqueda de discontinuidades superficiales.',
    defaults: function () {
      return {
        oaa: true,
        norma_astm_e165: false,
        norma_asme_v: false,
        instrumentos: {},
        instrumentos_tags: {},
      };
    },
    sections: function () { return []; },
    // No table function — la UI custom la maneja.
  };

  // ── Tratamientos Térmicos (FM-110 Rev.00 v2) ────────────────────────────
  // Preinforme reformulado con tabla de ciclos (N columnas dinámicas × 7 filas
  // de parámetros: Temp inicial, Grad temp, Temp tratamiento, Tiempo, Grad
  // enfriamiento, Temp final, Cantidad ciclos).
  // Fuera del alcance OAA por default.
  SCHEMAS['tratamientos-termicos'] = {
    icon: 'gauge',
    descr: 'Ensayo de tratamiento térmico (modelo FM-110). Tabla de ciclos con horno + registrador.',
    defaults: function () {
      return {
        oaa: false,
        metodo_cliente: false,
        metodo_interno: false,
        ciclos: {
          nombres: ['1', '2', '3'],
          tempInicial:       ['', '', ''],
          gradTemp:          ['', '', ''],
          tempTratamiento:   ['', '', ''],
          tiempoTratamiento: ['', '', ''],
          gradEnfriamiento:  ['', '', ''],
          tempFinal:         ['', '', ''],
          cantCiclos:        ['', '', ''],
        },
        equipamiento: { horno: true, registrador: true },
        equipamiento_tags: {},
        res_tratada: false,
        adjunta_grafico: '',
        ruta_g: '',
        observaciones: '',
      };
    },
    sections: function () { return []; },
  };

  window.ENSAYO_SCHEMAS = SCHEMAS;
})();
