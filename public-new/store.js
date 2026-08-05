/* LABTESA Lab-Informes — capa de datos simulada (mock + localStorage)
   Imita la API REST del backend. Datos persistidos en localStorage para el prototipo. */
(function () {
  'use strict';

  var LS_KEY = 'labtesa_proto_v2';

  // Estado de calibración según vencimiento (referencia: hoy)
  function calibStatus(venc) {
    if (!venc) return 'vigente';
    var hoy = new Date();
    var v = new Date(venc + 'T00:00:00');
    var dias = Math.round((v - hoy) / 86400000);
    if (dias < 0) return 'vencido';
    if (dias <= 45) return 'por-vencer';
    return 'vigente';
  }
  function diasParaVencer(venc) {
    if (!venc) return null;
    return Math.round((new Date(venc + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000);
  }

  // ---- Etiquetas de tipos de ensayo ----
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
    microestructura:          'Microestructura',
    'tamano-grano':           'Tamaño de grano',
    inclusiones:              'Inclusiones',
    'estructura-grafito':     'Estructura de grafito',
    'espesor-capa':           'Espesor de capa',
    decarburacion:            'Decarburación',
    'defectos-superficiales': 'Defectos superficiales',
    porosidad:                'Porosidad',
    macrografia:              'Macrografía',
    rugosidad:                'Rugosidad',
    varios:                   'Ensayos varios',
    'liquidos-penetrantes':   'Líquidos Penetrantes',
    'metalografia-general':   'Análisis Metalográfico General',
    'anexo-metalografico':    'Anexo Metalográfico',
    'tratamientos-termicos':  'Tratamientos Térmicos',
    'espesor-recubrimiento':  'Espesor de Recubrimiento Metalográfico',
  };

  var ENSAYO_ABBR = {
    traccion: 'TRACC',
    impacto: 'IMP',
    'dureza-brinell': 'HB',
    'dureza-rockwell': 'HR',
    'dureza-vickers': 'HV',
    plegado: 'PLG',
    quimicos: 'QUIM',
    'nick-break': 'NB',
    microestructura: 'MIC',
    'tamano-grano': 'TG',
    inclusiones: 'INC',
    'estructura-grafito': 'GRA',
    'espesor-capa': 'CAP',
    decarburacion: 'DEC',
    'defectos-superficiales': 'DEF',
    porosidad: 'POR',
    macrografia: 'MAC',
    rugosidad: 'RUG',
    'ferrita-delta': 'δFe',
    varios: 'VAR',
    'liquidos-penetrantes': 'LP',
    'metalografia-general': 'MET',
    'anexo-metalografico':  'AME',
    'tratamientos-termicos':'TT',
    'espesor-recubrimiento':'ESP',
  };

  // ---- Datos semilla ----
  function seed() {
    var clientes = [
      { nro_cliente: '1042', razon_social: 'Tenaris Siderca S.A.I.C.', fantasia: 'Tenaris', cuit: '30-50673003-8', contacto: 'Ing. M. Sosa', email: 'compras@tenaris.com', telefono: '+54 3489 43-3000', localidad: 'Campana, BA' },
      { nro_cliente: '1188', razon_social: 'Ternium Argentina S.A.', fantasia: 'Ternium', cuit: '33-50019642-9', contacto: 'Lic. R. Paz', email: 'calidad@ternium.com.ar', telefono: '+54 11 4018-2100', localidad: 'San Nicolás, BA' },
      { nro_cliente: '2031', razon_social: 'Aceros Bragado S.A.', fantasia: 'Aceros Bragado', cuit: '30-58621104-2', contacto: 'Sr. J. Vega', email: 'laboratorio@acerosbragado.com', telefono: '+54 2342 45-1200', localidad: 'Bragado, BA' },
      { nro_cliente: '2210', razon_social: 'Metalúrgica del Sur S.A.', fantasia: 'MetalSur', cuit: '30-71044582-6', contacto: 'Ing. C. Ferri', email: 'tecnica@metalsur.com.ar', telefono: '+54 291 488-5500', localidad: 'Bahía Blanca, BA' },
      { nro_cliente: '3055', razon_social: 'YPF S.A. — Refinería La Plata', fantasia: 'YPF', cuit: '30-54668997-9', contacto: 'Ing. P. Duarte', email: 'inspeccion@ypf.com', telefono: '+54 221 429-7000', localidad: 'La Plata, BA' },
      { nro_cliente: '3411', razon_social: 'Pampa Energía S.A.', fantasia: 'Pampa', cuit: '30-52655265-3', contacto: 'Lic. A. Molina', email: 'mantenimiento@pampa.com', telefono: '+54 11 4344-6000', localidad: 'CABA' },
      { nro_cliente: '4120', razon_social: 'Industrias Metalúrgicas Pescarmona', fantasia: 'IMPSA', cuit: '30-50223199-6', contacto: 'Ing. F. Reyes', email: 'qa@impsa.com', telefono: '+54 261 413-2000', localidad: 'Godoy Cruz, MZ' },
    ];

    var equipos = [
      { id: 'MM-200', nombre: 'Máquina universal EMIC DL-60000', tipo: 'traccion', sede: 'CABA', modelo: 'DL-60000', capacidad: '600 kN', certificado: 'CAL-553', fecha_calibracion: '2025-08-15', vencimiento: '2026-08-15', patron: '—' },
      { id: 'MM-201', nombre: 'Máquina universal Shimadzu AGS-X', tipo: 'traccion', sede: 'Neuquén', modelo: 'AGS-X 100 kN', capacidad: '100 kN', certificado: 'CAL-554', fecha_calibracion: '2025-07-02', vencimiento: '2026-07-02', patron: '—' },
      { id: 'MM-210', nombre: 'Péndulo Charpy Tinius Olsen', tipo: 'impacto', sede: 'CABA', modelo: 'IT542', capacidad: '406 J', certificado: 'CAL-561', fecha_calibracion: '2025-09-10', vencimiento: '2026-09-10', patron: 'Probeta patrón NIST' },
      { id: 'MM-220', nombre: 'Durómetro Buehler Wilson', tipo: 'dureza-brinell', sede: 'CABA', modelo: 'UH4750', capacidad: '3000 kgf', certificado: 'CAL-540', fecha_calibracion: '2025-05-20', vencimiento: '2026-05-20', patron: 'HB 200 — CAL-902' },
      { id: 'MM-221', nombre: 'Durómetro Shimadzu HMV', tipo: 'dureza-brinell', sede: 'Neuquén', modelo: 'HMV-G', capacidad: '—', certificado: 'CAL-571', fecha_calibracion: '2026-01-15', vencimiento: '2027-01-15', patron: 'HB 200 — CAL-903' },
      { id: 'MM-230', nombre: 'Microdurómetro Future-Tech', tipo: 'dureza-vickers', sede: 'CABA', modelo: 'FV-310', capacidad: '—', certificado: 'CAL-548', fecha_calibracion: '2025-11-30', vencimiento: '2026-11-30', patron: 'HV 400 — CAL-911' },
      { id: 'MM-240', nombre: 'Prensa de plegado Amsler', tipo: 'plegado', sede: 'CABA', modelo: 'Amsler 30 t', capacidad: '30 t', certificado: 'CAL-533', fecha_calibracion: '2025-06-28', vencimiento: '2026-06-28', patron: '—' },
      { id: 'MM-167', nombre: 'Ferítometro Fischer', tipo: 'ferrita-delta', sede: 'CABA', modelo: 'Feritscope MP30', capacidad: '—', certificado: 'CAL-570', fecha_calibracion: '2025-10-05', vencimiento: '2026-10-05', patron: 'Set patrones Fischer' },
      { id: 'MM-039', nombre: 'Microscopio metalográfico Leica', tipo: 'ferrita-delta', sede: 'CABA', modelo: 'DM2700 M', capacidad: '—', certificado: 'CAL-577', fecha_calibracion: '2025-12-12', vencimiento: '2026-12-12', patron: 'Retícula calibrada' },
      { id: 'MM-300', nombre: 'Espectrómetro de emisión óptica', tipo: 'quimicos', sede: 'CABA', modelo: 'Bruker Q4 TASMAN', capacidad: '—', certificado: 'CAL-590', fecha_calibracion: '2025-06-05', vencimiento: '2026-06-05', patron: 'Patrones certificados CRM' },
    ];

    var normas = [
      { codigo: 'ASTM E8/E8M', clase: 'norma', titulo: 'Métodos de ensayo de tracción de materiales metálicos', tipo: 'traccion', version: '2022', vigente: true },
      { codigo: 'ASTM E23', clase: 'norma', titulo: 'Métodos de ensayo de impacto con probeta entallada', tipo: 'impacto', version: '2023a', vigente: true },
      { codigo: 'ASTM E10', clase: 'norma', titulo: 'Método de ensayo de dureza Brinell', tipo: 'dureza-brinell', version: '2018', vigente: true },
      { codigo: 'ASTM E92', clase: 'norma', titulo: 'Dureza Vickers y Knoop de materiales metálicos', tipo: 'dureza-vickers', version: '2017', vigente: true },
      { codigo: 'ASTM E290', clase: 'norma', titulo: 'Ensayo de plegado guiado para ductilidad', tipo: 'plegado', version: '2022', vigente: true },
      { codigo: 'API 1104', clase: 'norma', titulo: 'Soldadura de cañerías e instalaciones relacionadas', tipo: 'nick-break', version: '21ª ed.', vigente: true },
      { codigo: 'ASTM E415', clase: 'norma', titulo: 'Análisis de acero al carbono por espectrometría OES', tipo: 'quimicos', version: '2021', vigente: true },
      { codigo: 'ASTM A370', clase: 'norma', titulo: 'Métodos y definiciones para ensayos mecánicos de productos de acero', tipo: 'general', version: '2024', vigente: true },
      { codigo: 'IRAM-IAS U500-102', clase: 'norma', titulo: 'Productos de acero — ensayos mecánicos', tipo: 'general', version: '2018', vigente: false },
      { codigo: 'ITM N°001', clase: 'itm', titulo: 'Ensayo de tracción estándar (máquina EMIC)', tipo: 'traccion', version: 'Rev. 4', vigente: true },
      { codigo: 'ITM N°008', clase: 'itm', titulo: 'Ensayo de impacto Charpy', tipo: 'impacto', version: 'Rev. 3', vigente: true },
      { codigo: 'ITM N°015', clase: 'itm', titulo: 'Determinación de dureza Brinell', tipo: 'dureza-brinell', version: 'Rev. 2', vigente: true },
      { codigo: 'ITM N°016', clase: 'itm', titulo: 'Determinación de dureza Vickers', tipo: 'dureza-vickers', version: 'Rev. 2', vigente: true },
      { codigo: 'ITM N°019', clase: 'itm', titulo: 'Ensayo de plegado guiado', tipo: 'plegado', version: 'Rev. 1', vigente: true },
      { codigo: 'ITM N°022', clase: 'itm', titulo: 'Ensayo Nick Break', tipo: 'nick-break', version: 'Rev. 1', vigente: true },
      { codigo: 'ITM N°032', clase: 'itm', titulo: 'Cuantificación de ferrita delta (microscopio + Fischer)', tipo: 'ferrita-delta', version: 'Rev. 3', vigente: true },
      { codigo: 'ITM N°040', clase: 'itm', titulo: 'Análisis químico por espectrometría OES', tipo: 'quimicos', version: 'Borrador', vigente: false },
    ];

    var ots = [
      {
        id: 1, nro_ot: '534432', nro_solicitud: 'SOL-2026-0481', nro_cliente: '1042',
        razon_social: 'Tenaris Siderca S.A.I.C.',
        id_muestra: 'Caño sin costura API 5L X65\nColada N° 8841-C\nMuestra long. 1.200 mm',
        fecha_recepcion: '2026-05-28', fecha_aprobacion: '2026-06-02', fecha_finalizacion: '',
        trello_url: 'https://trello.com/c/aB3kZ9pL', es_preinforme: 1,
        creado_en: '2026-05-28T09:14:00', fotos_json: '[]',
      },
      {
        id: 2, nro_ot: '534418', nro_solicitud: 'SOL-2026-0477', nro_cliente: '1188',
        razon_social: 'Ternium Argentina S.A.',
        id_muestra: 'Chapa laminada en caliente\nEspesor 12,7 mm — Colada 22193',
        fecha_recepcion: '2026-05-26', fecha_aprobacion: '2026-05-30', fecha_finalizacion: '2026-06-05',
        trello_url: '', es_preinforme: 0,
        creado_en: '2026-05-26T11:02:00', fotos_json: '[]',
      },
      {
        id: 3, nro_ot: '534401', nro_solicitud: 'SOL-2026-0470', nro_cliente: '3055',
        razon_social: 'YPF S.A. — Refinería La Plata',
        id_muestra: 'Soldadura a tope — junta circunferencial\nProcedimiento WPS-114',
        fecha_recepcion: '2026-05-22', fecha_aprobacion: '', fecha_finalizacion: '',
        trello_url: 'https://trello.com/c/Qx81mWdf', es_preinforme: 0,
        creado_en: '2026-05-22T15:40:00', fotos_json: '[]',
      },
      {
        id: 4, nro_ot: '534390', nro_solicitud: 'SOL-2026-0465', nro_cliente: '2031',
        razon_social: 'Aceros Bragado S.A.',
        id_muestra: 'Barra redonda SAE 1045\nØ 25,4 mm',
        fecha_recepcion: '2026-05-19', fecha_aprobacion: '2026-05-23', fecha_finalizacion: '2026-05-29',
        trello_url: '', es_preinforme: 0,
        creado_en: '2026-05-19T08:30:00', fotos_json: '[]',
      },
      {
        id: 5, nro_ot: '534377', nro_solicitud: 'SOL-2026-0459', nro_cliente: '4120',
        razon_social: 'Industrias Metalúrgicas Pescarmona',
        id_muestra: 'Pieza forjada — eje de turbina\nMaterial ASTM A668 Cl.D',
        fecha_recepcion: '2026-05-15', fecha_aprobacion: '2026-05-20', fecha_finalizacion: '',
        trello_url: '', es_preinforme: 1,
        creado_en: '2026-05-15T10:05:00', fotos_json: '[]',
      },
      {
        id: 6, nro_ot: '534362', nro_solicitud: 'SOL-2026-0451', nro_cliente: '2210',
        razon_social: 'Metalúrgica del Sur S.A.',
        id_muestra: 'Perfil estructural IPN 200\nAcero F-24',
        fecha_recepcion: '2026-05-12', fecha_aprobacion: '2026-05-16', fecha_finalizacion: '2026-05-22',
        trello_url: '', es_preinforme: 0,
        creado_en: '2026-05-12T13:20:00', fotos_json: '[]',
      },
      {
        id: 7, nro_ot: '534350', nro_solicitud: 'SOL-2026-0444', nro_cliente: '3411',
        razon_social: 'Pampa Energía S.A.',
        id_muestra: 'Cupón de soldadura — recipiente a presión',
        fecha_recepcion: '2026-05-08', fecha_aprobacion: '', fecha_finalizacion: '',
        trello_url: 'https://trello.com/c/Tn92LkpO', es_preinforme: 0,
        creado_en: '2026-05-08T16:48:00', fotos_json: '[]',
      },
    ];

    var ensayos = [
      {
        id: 101, nro_ot: '534432', tipo: 'traccion', orden: 1, creado_en: '2026-05-29T10:00:00',
        datos_json: JSON.stringify({
          variante: 'estandar', norma: 'ASTM E8/E8M', norma_metodo: 'Método B',
          metodologia: 'ITM N°001', velocidad_fluencia: '5', velocidad_traccion: '15',
          temperatura: '22', maquina: 'EMIC — DL-60000', modelo: 'DL-60000', capacidad: '600 kN',
          certificado_calibracion: 'CAL-553', observaciones: '',
          resultados: [
            { probeta: '1', diametro: '12.70', area: '126.7', fluencia: '325', traccion: '480', alargamiento: '28', estriccion: '65', rotura_zona: 'Centro', resultado: 'Aprobado' },
            { probeta: '2', diametro: '12.68', area: '126.3', fluencia: '331', traccion: '486', alargamiento: '27', estriccion: '64', rotura_zona: 'Centro', resultado: 'Aprobado' },
          ],
        }),
      },
      {
        id: 102, nro_ot: '534432', tipo: 'impacto', orden: 2, creado_en: '2026-05-29T10:20:00',
        datos_json: JSON.stringify({
          norma: 'ASTM E23', metodologia: 'ITM N°008', tipo_probeta: 'Charpy V', entalla: 'V — 2 mm',
          temperatura: '-20', maquina: 'Tinius Olsen IT542', capacidad: '406 J',
          certificado_calibracion: 'CAL-561', observaciones: '',
          resultados: [
            { probeta: '1', dimensiones: '10×10×55', area: '0.80', energia: '142', expansion_lateral: '1.85', aspecto_fractura: '95% dúctil', resultado: 'Aprobado' },
            { probeta: '2', dimensiones: '10×10×55', area: '0.80', energia: '138', expansion_lateral: '1.78', aspecto_fractura: '92% dúctil', resultado: 'Aprobado' },
            { probeta: '3', dimensiones: '10×10×55', area: '0.80', energia: '145', expansion_lateral: '1.90', aspecto_fractura: '96% dúctil', resultado: 'Aprobado' },
          ],
        }),
      },
      {
        id: 103, nro_ot: '534418', tipo: 'dureza-brinell', orden: 1, creado_en: '2026-05-27T09:10:00',
        datos_json: JSON.stringify({
          variante: 'estandar', norma: 'ASTM E10', metodologia: 'ITM N°015', carga: '3000',
          indentador: 'Esfera Ø 10 mm', tiempo_aplicacion: '15', maquina: 'Buehler Wilson UH4750',
          certificado_calibracion: 'CAL-540', patron: 'HB 200 — CAL-902', observaciones: '',
          resultados: [
            { probeta: '1', valor: '187', resultado: 'Aprobado' },
            { probeta: '2', valor: '191', resultado: 'Aprobado' },
            { probeta: '3', valor: '189', resultado: 'Aprobado' },
          ],
        }),
      },
      {
        id: 104, nro_ot: '534401', tipo: 'ferrita-delta', orden: 1, creado_en: '2026-05-23T14:00:00',
        datos_json: JSON.stringify({
          variante: 'microscopio', metodologia: 'ITM N°032', norma: '', temperatura: '22',
          equipo_microscopio: 'MM-039', equipo_fischer: 'MM-167', certificado_microscopio: 'CAL-577',
          certificado_fischer: 'CAL-570', observaciones: '',
          zonas: ['Metal Base', 'Z.A.C.', 'Soldadura'],
          probetas: [
            { nombre: '1', zona_mb: '2.1', zona_zac: '4.5', zona_sold: '6.8' },
            { nombre: '2', zona_mb: '2.3', zona_zac: '4.1', zona_sold: '7.2' },
          ],
        }),
      },
      {
        id: 105, nro_ot: '534401', tipo: 'nick-break', orden: 2, creado_en: '2026-05-23T14:30:00',
        datos_json: JSON.stringify({
          norma: 'API 1104', metodologia: 'ITM N°022', maquina: 'Prensa hidráulica 50 t',
          variante_resultado: 'No presenta indicaciones relevantes', observaciones: '',
        }),
      },
      {
        id: 106, nro_ot: '534390', tipo: 'dureza-vickers', orden: 1, creado_en: '2026-05-20T11:00:00',
        datos_json: JSON.stringify({
          norma: 'ASTM E92', norma_year_suffix: '-17', metodologia: 'ITM N°016', carga: '10',
          indentador: 'Diamante piramidal 136°', tiempo_aplicacion: '10', maquina: 'Future-Tech FV-310',
          certificado_calibracion: 'CAL-548', patron: 'HV 400 — CAL-911', observaciones: '',
          resultados: [
            { probeta: '1', valor: '212', resultado: 'Aprobado' },
            { probeta: '2', valor: '208', resultado: 'Aprobado' },
          ],
        }),
      },
      {
        id: 107, nro_ot: '534362', tipo: 'plegado', orden: 1, creado_en: '2026-05-16T10:00:00',
        datos_json: JSON.stringify({
          norma: 'ASTM E290', metodologia: 'ITM N°019', tipo_plegado: 'Cara', zona: 'Soldadura',
          angulo_doblado: '180', mandril: 'Ø 40 mm', equipo: 'eq2', maquina: 'Prensa Amsler 30 t',
          certificado_calibracion: 'CAL-533', observaciones: '',
          resultados: [
            { probeta: '1', tipo: 'Cara', resultado: 'Aprobado' },
            { probeta: '2', tipo: 'Raíz', resultado: 'Aprobado' },
          ],
        }),
      },
    ];

    return { clientes: clientes, ots: ots, ensayos: ensayos, equipos: equipos, normas: normas, eventos: {}, nextOtId: 8, nextEnsayoId: 108 };
  }

  // ---- Persistencia ----
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    var s = seed();
    save(s);
    return s;
  }
  function save(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  var db = load();
  if (!db.eventos) db.eventos = {};

  // ---- API simulada (síncrona para el prototipo) ----
  var Store = {
    labels: ENSAYO_LABELS,
    abbr: ENSAYO_ABBR,
    reset: function () { db = seed(); save(db); },

    listOts: function () {
      return db.ots.slice().sort(function (a, b) {
        return (b.creado_en || '').localeCompare(a.creado_en || '');
      }).map(function (ot) {
        var tipos = db.ensayos.filter(function (e) { return e.nro_ot === ot.nro_ot; })
          .sort(function (a, b) { return a.orden - b.orden; })
          .map(function (e) { return e.tipo; });
        return Object.assign({}, ot, { tipos_ensayo: tipos });
      });
    },

    getOt: function (nro_ot) {
      var ot = db.ots.find(function (o) { return o.nro_ot === nro_ot; });
      if (!ot) return null;
      var ensayos = db.ensayos.filter(function (e) { return e.nro_ot === nro_ot; })
        .sort(function (a, b) { return a.orden - b.orden; });
      return Object.assign({}, ot, { ensayos: ensayos });
    },

    getCliente: function (nro_cliente) {
      return db.clientes.find(function (c) { return c.nro_cliente === nro_cliente; }) || null;
    },

    listClientes: function () {
      return db.clientes.map(function (c) {
        var ots = db.ots.filter(function (o) { return o.nro_cliente === c.nro_cliente; });
        var last = ots.map(function (o) { return o.creado_en || ''; }).sort().pop() || '';
        return Object.assign({}, c, { ot_count: ots.length, last_activity: last ? last.slice(0, 10) : '' });
      }).sort(function (a, b) { return b.ot_count - a.ot_count; });
    },
    otsDeCliente: function (nro_cliente) {
      return this.listOts().filter(function (o) { return o.nro_cliente === nro_cliente; });
    },
    createCliente: function (data) {
      db.clientes.push(Object.assign({ ot_count: 0 }, data));
      save(db);
    },

    listEquipos: function () {
      return db.equipos.map(function (e) { return Object.assign({}, e, { estado: calibStatus(e.vencimiento), dias: diasParaVencer(e.vencimiento) }); });
    },
    createEquipo: function (data) { db.equipos.push(data); save(db); },
    deleteEquipo: function (id) { db.equipos = db.equipos.filter(function (e) { return e.id !== id; }); save(db); },

    listNormas: function () { return db.normas.slice(); },
    createNorma: function (data) { db.normas.push(data); save(db); },
    deleteNorma: function (codigo) { db.normas = db.normas.filter(function (n) { return n.codigo !== codigo; }); save(db); },

    // ---- catálogos filtrados por tipo de ensayo (para selectores) ----
    normasParaTipo: function (tipo) {
      return db.normas.filter(function (n) { return n.clase === 'norma' && n.vigente && (n.tipo === tipo || n.tipo === 'general'); })
        .map(function (n) { return n.codigo + (n.version ? ' (' + n.version + ')' : ''); });
    },
    itmsParaTipo: function (tipo) {
      return db.normas.filter(function (n) { return n.clase === 'itm' && (n.tipo === tipo); })
        .map(function (n) { return n.codigo; });
    },
    equiposParaTipo: function (tipo) {
      return db.equipos.filter(function (e) { return e.tipo === tipo; })
        .map(function (e) { return { nombre: e.nombre, certificado: e.certificado, id: e.id }; });
    },
    getEquipoPorNombre: function (nombre) {
      if (!nombre) return null;
      return db.equipos.find(function (e) { return nombre.indexOf(e.nombre) >= 0 || e.nombre.indexOf(nombre) >= 0; }) || null;
    },
    getEquipoPorCertificado: function (cert) {
      if (!cert) return null;
      var c = String(cert).trim();
      return db.equipos.find(function (e) { return e.certificado === c; }) || null;
    },
    calibStatusOf: function (cert, nombre) {
      var e = this.getEquipoPorCertificado(cert) || this.getEquipoPorNombre(nombre);
      if (!e) return null;
      return { equipo: e, estado: calibStatus(e.vencimiento), vencimiento: e.vencimiento };
    },

    createOt: function (data) {
      var ot = Object.assign({
        id: db.nextOtId++, es_preinforme: 0, fotos_json: '[]',
        creado_en: new Date().toISOString(),
      }, data);
      db.ots.push(ot);
      save(db);
      return ot;
    },

    updateOt: function (nro_ot, data) {
      var ot = db.ots.find(function (o) { return o.nro_ot === nro_ot; });
      if (ot) { Object.assign(ot, data); save(db); }
      return ot;
    },

    deleteOt: function (nro_ot) {
      db.ots = db.ots.filter(function (o) { return o.nro_ot !== nro_ot; });
      db.ensayos = db.ensayos.filter(function (e) { return e.nro_ot !== nro_ot; });
      if (db.eventos) delete db.eventos[nro_ot];
      save(db);
    },

    logEvento: function (nro_ot, texto, icon) {
      if (!db.eventos) db.eventos = {};
      if (!db.eventos[nro_ot]) db.eventos[nro_ot] = [];
      db.eventos[nro_ot].push({ texto: texto, icon: icon || 'check', fecha: new Date().toISOString() });
      save(db);
    },
    getEventos: function (nro_ot) {
      return (db.eventos && db.eventos[nro_ot]) ? db.eventos[nro_ot].slice() : [];
    },

    getFotos: function (nro_ot) {
      var ot = db.ots.find(function (o) { return o.nro_ot === nro_ot; });
      try { return JSON.parse(ot && ot.fotos_json || '[]'); } catch (e) { return []; }
    },
    setFotos: function (nro_ot, fotos) {
      var ot = db.ots.find(function (o) { return o.nro_ot === nro_ot; });
      if (ot) { ot.fotos_json = JSON.stringify(fotos); save(db); }
    },

    saveEnsayo: function (nro_ot, tipo, datos, existingId) {
      if (existingId) {
        var e = db.ensayos.find(function (x) { return x.id === existingId; });
        if (e) { e.datos_json = JSON.stringify(datos); save(db); return e; }
      }
      var orden = db.ensayos.filter(function (x) { return x.nro_ot === nro_ot; }).length + 1;
      var ne = {
        id: db.nextEnsayoId++, nro_ot: nro_ot, tipo: tipo, orden: orden,
        datos_json: JSON.stringify(datos), creado_en: new Date().toISOString(),
      };
      db.ensayos.push(ne);
      save(db);
      return ne;
    },

    getEnsayo: function (id) {
      var e = db.ensayos.find(function (x) { return x.id === id; });
      if (!e) return null;
      var copy = Object.assign({}, e);
      try { copy.datos = JSON.parse(e.datos_json); } catch (err) { copy.datos = {}; }
      return copy;
    },

    deleteEnsayo: function (id) {
      db.ensayos = db.ensayos.filter(function (e) { return e.id !== id; });
      save(db);
    },

    reorderEnsayos: function (nro_ot, orderedIds) {
      orderedIds.forEach(function (id, idx) {
        var e = db.ensayos.find(function (x) { return x.id === id; });
        if (e) e.orden = idx + 1;
      });
      save(db);
    },

    cloneEnsayos: function (fromOt, toOt) {
      var src = db.ensayos.filter(function (e) { return e.nro_ot === fromOt; }).sort(function (a, b) { return a.orden - b.orden; });
      src.forEach(function (e, i) {
        db.ensayos.push({
          id: db.nextEnsayoId++, nro_ot: toOt, tipo: e.tipo, orden: i + 1,
          datos_json: e.datos_json, creado_en: new Date().toISOString(),
        });
      });
      save(db);
    },

    duplicateOt: function (fromOt, data, opts) {
      var src = db.ots.find(function (o) { return o.nro_ot === fromOt; });
      if (!src) return null;
      var nueva = this.createOt(Object.assign({
        nro_cliente: src.nro_cliente, razon_social: src.razon_social, id_muestra: src.id_muestra,
        fecha_recepcion: new Date().toISOString().slice(0, 10), fecha_aprobacion: '', fecha_finalizacion: '',
        trello_url: '',
      }, data));
      if (opts && opts.ensayos) this.cloneEnsayos(fromOt, nueva.nro_ot);
      if (opts && opts.fotos) nueva.fotos_json = src.fotos_json;
      save(db);
      return nueva;
    },

    // Parser simulado de tarjeta Trello
    parseTrello: function (url) {
      return {
        nro_solicitud: 'SOL-2026-0492',
        nro_cliente: '1042',
        cliente_nombre: 'Tenaris Siderca S.A.I.C.',
        ots: [
          { muestra: 'Caño sin costura API 5L X65 — tramo A', nro_ot: '534445', id_muestra: 'Colada 8841-C / Pos. 1' },
          { muestra: 'Caño sin costura API 5L X65 — tramo B', nro_ot: '534446', id_muestra: 'Colada 8841-C / Pos. 2' },
        ],
      };
    },
  };

  window.LabStore = Store;
})();
