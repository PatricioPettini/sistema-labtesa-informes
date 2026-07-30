// Genera PROCEDIMIENTO_INGRESOS.docx — guía para recepcionistas sobre carpetas
// y nomenclatura de fotos, alineado con las reglas del sistema (fotos-auto.js,
// api.js, agente-cliente-carpeta.js).
//
// Uso: node scripts/generar-procedimiento-ingresos.js
//
// Salida: PROCEDIMIENTO_INGRESOS.docx en la raíz del proyecto.

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
} = require('docx');

// ── Estilo helpers ───────────────────────────────────────────────────────────
const FUENTE = 'Calibri';
const COLOR_ACENTO = '1F4E79';   // Azul oscuro
const COLOR_HEADER = 'DEEAF6';   // Azul claro para encabezados de tabla
const COLOR_ADVERT = 'FFF2CC';   // Amarillo claro para "atención"
const COLOR_MONO   = 'F2F2F2';   // Gris claro para bloques de código

function T(texto, opts = {}) {
  return new TextRun({
    text: texto,
    font: FUENTE,
    size: opts.size || 22,          // 11pt
    bold: !!opts.bold,
    italics: !!opts.italic,
    color: opts.color || undefined,
  });
}

function P(runs, opts = {}) {
  return new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    alignment: opts.align || undefined,
    spacing: { line: 276, before: opts.before || 0, after: opts.after || 60 },
    heading: opts.heading || undefined,
    shading: opts.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    indent: opts.indent ? { left: opts.indent } : undefined,
    bullet: opts.bullet ? { level: 0 } : undefined,
  });
}

function H1(texto) {
  return new Paragraph({
    children: [T(texto, { bold: true, size: 32, color: COLOR_ACENTO })],
    heading: HeadingLevel.HEADING_1,
    spacing: { line: 276, before: 240, after: 120 },
  });
}

function H2(texto) {
  return new Paragraph({
    children: [T(texto, { bold: true, size: 26, color: COLOR_ACENTO })],
    heading: HeadingLevel.HEADING_2,
    spacing: { line: 276, before: 180, after: 100 },
  });
}

function bloqueCodigo(lineas) {
  return lineas.map((l) => new Paragraph({
    children: [new TextRun({ text: l, font: 'Consolas', size: 20 })],
    spacing: { line: 276, before: 0, after: 0 },
    shading: { type: ShadingType.CLEAR, fill: COLOR_MONO },
  }));
}

function celda(texto, opts = {}) {
  return new TableCell({
    children: [P(T(texto, { bold: opts.bold, size: opts.size || 20 }))],
    shading: opts.shade ? { fill: opts.shade } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
  });
}

function tabla(header, filas, anchos) {
  const bordes = {
    top:    { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    left:   { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    right:  { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
    insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC' },
  };
  const rows = [
    new TableRow({
      tableHeader: true,
      children: header.map((h, i) =>
        celda(h, { bold: true, shade: COLOR_HEADER, width: anchos ? anchos[i] : undefined })),
    }),
    ...filas.map((f) => new TableRow({
      children: f.map((c, i) => celda(c, { width: anchos ? anchos[i] : undefined })),
    })),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordes,
    rows,
  });
}

function advertencia(titulo, texto) {
  return new Paragraph({
    children: [T('⚠ ' + titulo + ': ', { bold: true }), T(texto)],
    shading: { type: ShadingType.CLEAR, fill: COLOR_ADVERT },
    spacing: { line: 276, before: 60, after: 60 },
    indent: { left: 100 },
  });
}

// ── Contenido del documento ─────────────────────────────────────────────────
const children = [];

// Portada
children.push(new Paragraph({
  children: [T('PROCEDIMIENTO DE INGRESOS', { bold: true, size: 44, color: COLOR_ACENTO })],
  alignment: AlignmentType.CENTER,
  spacing: { before: 800, after: 100 },
}));
children.push(new Paragraph({
  children: [T('Estándar para creación de carpetas y carga de fotos', { italic: true, size: 26 })],
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
}));
children.push(new Paragraph({
  children: [T('LABTESA · Sector Metalúrgico', { size: 22 })],
  alignment: AlignmentType.CENTER,
  spacing: { after: 500 },
}));
children.push(new Paragraph({
  children: [T('Vigente desde: ', { bold: true }), T('julio 2026')],
  alignment: AlignmentType.CENTER,
  spacing: { after: 40 },
}));
children.push(new Paragraph({
  children: [T('Aplica a: ', { bold: true }), T('Recepción, mecanizado y técnicos que suban fotos')],
  alignment: AlignmentType.CENTER,
  spacing: { after: 600 },
}));

// Objetivo
children.push(H1('1. Objetivo'));
children.push(P(T(
  'Unificar el criterio para nombrar carpetas y archivos de fotos en el drive, de manera que el sistema y el agente de asignación automática puedan encontrar y clasificar las imágenes sin intervención manual. Cumplir este procedimiento evita errores en la carátula, en la asignación a OTs hermanas y en la clasificación por sección (microestructura, espesor, grano, etc.).'
)));

// Estructura general
children.push(H1('2. Estructura de carpetas en el drive'));
children.push(P(T(
  'Todas las fotos se guardan bajo la raíz del año en curso. El sistema busca las fotos automáticamente siguiendo esta jerarquía.'
)));

children.push(H2('2.1 Ruta base'));
children.push(...bloqueCodigo([
  'G:\\METALMECANICA\\FOTOS\\CLIENTES 2026\\',
]));
children.push(P(T(
  'La carpeta cambia todos los años (CLIENTES 2027, 2028…). El nombre debe ser exacto: CLIENTES + espacio + año.',
  { italic: true }
)));

children.push(H2('2.2 Jerarquía completa'));
children.push(...bloqueCodigo([
  'CLIENTES 2026\\',
  '  └─ <NOMBRE DEL CLIENTE>\\              ← ej: TGFB BOMBAS S.R.L',
  '      └─ SOL <número>\\                  ← ej: SOL 38162',
  '          ├─ (fotos de recepción sueltas)  ← foto de la muestra al ingresar',
  '          ├─ OT <número>\\                ← ej: OT 41234  (opcional, si hay una carpeta por OT)',
  '          │   ├─ (fotos de recepción sueltas)',
  '          │   ├─ MICROESTRUCTURA\\',
  '          │   │   ├─ M1\\                ← subcarpeta por muestra',
  '          │   │   │   ├─ IMAGEN Nº1 - MICROESTRUCTURA EN SUPERFICIE 100x.jpg',
  '          │   │   │   └─ INFORMAR\\      ← solo las de acá se emiten',
  '          │   │   └─ M2\\',
  '          │   ├─ ESPESOR\\',
  '          │   ├─ GRAFITO\\',
  '          │   ├─ DECARBURACION\\',
  '          │   ├─ GRANO\\                 ← para anexo metalográfico',
  '          │   └─ INCLUSIONES\\           ← para anexo metalográfico',
  '          └─ OT <otra>\\                 ← si la solicitud tiene varias OTs',
]));

children.push(H2('2.3 Reglas por nivel'));
children.push(P(T('Carpeta del cliente', { bold: true })));
children.push(P([
  T('• '),
  T('Usar la razón social real. '),
  T('El sistema tiene una tabla de alias '),
  T('(cliente_alias)', { italic: true }),
  T(' para clientes con nombre corto (ej: '),
  T('TGN', { bold: true }),
  T(' → '),
  T('TRANSPORTADORA DE GAS DEL NORTE S.A', { bold: true }),
  T('). Si el cliente es nuevo, dejalo con la razón social completa.'),
]));
children.push(P([
  T('• '),
  T('Si no hay match exacto ni por alias, el sistema usa IA (agente Claude) para elegir la carpeta y aprende del resultado. Por eso: '),
  T('nombres claros y sin errores de tipeo evitan que la IA falle.', { bold: true }),
]));

children.push(P(T('Carpeta SOL', { bold: true }), { before: 120 }));
children.push(P([
  T('• Formato exacto: '), T('SOL ', { bold: true }), T('+ '), T('número de solicitud', { bold: true }),
  T('. Ejemplos válidos: '),
  T('SOL 38162', { italic: true }), T(', '),
  T('SOL 38162 - AGRIS', { italic: true }), T(', '),
  T('SOL_38162', { italic: true }), T('.'),
]));
children.push(P([
  T('• El sistema reconoce el número aunque haya guiones, espacios o texto después. Lo importante es que '),
  T('la palabra SOL vaya adelante y el número sea el de la solicitud del sistema.', { bold: true }),
]));

children.push(P(T('Carpeta OT (opcional)', { bold: true }), { before: 120 }));
children.push(P([
  T('• Solo se crea si '),
  T('la solicitud tiene varias OTs y querés separar las fotos por OT.', { bold: true }),
  T(' Formato: '),
  T('OT + número. ', { bold: true }),
  T('Ej: '),
  T('OT 41234', { italic: true }),
  T('.'),
]));
children.push(P([
  T('• Si toda la SOL es una sola OT, las fotos pueden ir sueltas en la carpeta SOL.'),
]));

children.push(P(T('Subcarpetas por muestra (M1, M2, …)', { bold: true }), { before: 120 }));
children.push(P([
  T('• Se usan cuando '),
  T('la misma OT tiene varias muestras.', { bold: true }),
  T(' Formato: '),
  T('M1, M2, M3', { bold: true }),
  T(' (también se acepta '),
  T('MUESTRA 1', { italic: true }),
  T(').'),
]));
children.push(P([
  T('• Las fotos dentro heredan la etiqueta de muestra: al emitir el informe, el caption sale como '),
  T('"M1 — Microestructura en superficie"', { italic: true }),
  T(' automáticamente.'),
]));

children.push(P(T('Subcarpeta INFORMAR', { bold: true }), { before: 120 }));
children.push(advertencia('Importante',
  'Si dentro de una carpeta de sección/muestra existe una subcarpeta llamada INFORMAR, ' +
  'el sistema IGNORA todas las fotos hermanas y solo emite las que están dentro de INFORMAR. ' +
  'Es la forma de dejar fotos de trabajo/descartes sin que aparezcan en el informe final.'
));

// Nomenclatura
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1('3. Nomenclatura de archivos'));
children.push(P(T(
  'El nombre del archivo genera automáticamente el pie de imagen (caption) del informe. Nombrar bien = no tener que editar el caption a mano.'
)));

children.push(H2('3.1 Formato recomendado'));
children.push(...bloqueCodigo([
  'IMAGEN Nº<n> - <descripcion> <magnificacion>x.jpg',
]));
children.push(P([
  T('El prefijo '), T('IMAGEN Nº<n>', { bold: true }),
  T(' es opcional (el sistema le pone su propio número correlativo). '),
  T('Lo que importa es la descripción y la magnificación.', { bold: true }),
]));

children.push(H2('3.2 Ejemplos'));
children.push(tabla(
  ['Nombre del archivo', 'Caption que emite el sistema'],
  [
    ['IMAGEN Nº1 - MICROESTRUCTURA EN SUPERFICIE 100x.jpg', 'Imagen N°1 – Microestructura en superficie (100X)'],
    ['IMG 3 - inclusiones 500x.png',                       'Imagen N°X – Inclusiones (500X)'],
    ['grano fino 200x.jpg (en carpeta M2)',                'Imagen N°X – M2 — Grano fino (200X)'],
    ['macrografia general.jpg',                            'Imagen N°X – Macrografia general'],
    ['foto.jpg (en carpeta M1)',                           'Imagen N°X – M1'],
  ],
  [55, 45],
));

children.push(H2('3.3 Reglas del nombre'));
const reglasNombre = [
  'Los guiones bajos ( _ ) se convierten en espacios. Podés escribir underscores o espacios, es indistinto.',
  'La magnificación se detecta en formato: 100x, 200x, 500x, 1000x. Se convierte a (100X), (200X)... automáticamente.',
  'El sistema aplica "sentence case" (primera letra mayúscula, resto minúscula) — no importa si escribís todo en mayúsculas.',
  'Extensiones aceptadas: .jpg, .jpeg, .jfif (WhatsApp), .png, .webp, .heic (iPhone), .bmp, .tiff.',
  'Se ignoran: thumbs.db, desktop.ini, .DS_Store, archivos .tmp, .xlsx, .pdf, .txt.',
];
reglasNombre.forEach((r) => children.push(P(T(r), { bullet: true, indent: 400 })));

children.push(advertencia('Evitar',
  'Nombres genéricos tipo "foto.jpg", "IMG_1234.jpg", "captura.png". El sistema no puede armar un caption útil ' +
  'y termina saliendo como "Foto" o "Img" en el informe. Renombrar antes de subir.'));

// Recepción vs ensayo
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1('4. Fotos de recepción vs fotos de ensayo'));
children.push(P(T(
  'El sistema distingue estas dos categorías por la posición del archivo dentro de la carpeta OT (o SOL).'
)));

children.push(H2('4.1 Fotos de RECEPCIÓN (carátula del informe)'));
children.push(P([
  T('• '), T('Van en la raíz', { bold: true }), T(' de la carpeta SOL o de la carpeta OT (sin subcarpeta).'),
]));
children.push(P([
  T('• Son las fotos que sacan al recibir la muestra: '),
  T('etiqueta, condición general, marcas, defectos macroscópicos visibles.', { italic: true }),
]));
children.push(P([
  T('• Aparecen en la '), T('primera página del informe', { bold: true }), T(' como carátula.'),
]));
children.push(P([
  T('• '),
  T('El técnico puede subir estas fotos manualmente desde la vista de OT ', { italic: true }),
  T('o cargarlas automáticamente si respetan la ubicación descrita.', { italic: true }),
]));

children.push(H2('4.2 Fotos de ENSAYO'));
children.push(P([
  T('• Van dentro de una subcarpeta con el nombre de la sección: '),
  T('MICROESTRUCTURA, ESPESOR, GRAFITO, DECARBURACION, GRANO, INCLUSIONES.', { bold: true }),
]));
children.push(P([
  T('• Se cargan automáticamente al abrir el formulario del ensayo correspondiente. El sistema categoriza según la subcarpeta y el nombre del archivo.'),
]));
children.push(P([
  T('• Si hay varias muestras, dentro de la carpeta de sección se hacen subcarpetas '),
  T('M1, M2, M3…', { bold: true }),
]));

children.push(H2('4.3 Diagrama resumen'));
children.push(...bloqueCodigo([
  'OT 41234\\',
  '  ├─ recep_1.jpg              ← RECEPCIÓN  (va en la carátula)',
  '  ├─ recep_2.jpg              ← RECEPCIÓN',
  '  ├─ MICROESTRUCTURA\\         ← ENSAYO (metalografía general)',
  '  │   ├─ M1\\',
  '  │   │   └─ IMAGEN Nº1 - MICRO 100x.jpg',
  '  │   └─ M2\\',
  '  └─ INCLUSIONES\\             ← ENSAYO (anexo metalográfico)',
  '      └─ M1\\',
  '          └─ IMAGEN Nº1 - INCLUSIONES 500x.jpg',
]));

// Categorización por sección
children.push(H1('5. Cómo categoriza el sistema por sección'));
children.push(P(T(
  'El sistema decide en qué sección del informe va cada foto siguiendo esta prioridad: (1) el nombre de la subcarpeta donde está la foto, (2) palabras clave en el nombre del archivo.'
)));

children.push(H2('5.1 Metalografía general'));
children.push(tabla(
  ['Sección', 'Nombres de carpeta o keywords válidos'],
  [
    ['Microestructura',  'MICROESTRUCTURA, MICRO'],
    ['Espesor de capa',  'ESPESOR, RECUBRIMIENTO, CAPA'],
    ['Estructura de grafito', 'GRAFITO'],
    ['Decarburación',    'DECARBURACION, DECARBUR, DESCARBURACION'],
  ],
  [40, 60],
));

children.push(H2('5.2 Anexo metalográfico'));
children.push(tabla(
  ['Sección', 'Nombres de carpeta o keywords válidos'],
  [
    ['Tamaño de grano', 'GRANO, TAMAÑO DE GRANO, TAMANO DE GRANO'],
    ['Inclusiones no metálicas', 'INCLUSIONES, SULFURO, ALUMINATO, SILICATO, OXIDO'],
  ],
  [40, 60],
));

children.push(advertencia('Consejo',
  'Usar SIEMPRE los nombres de carpeta indicados (MICROESTRUCTURA, ESPESOR, GRANO, INCLUSIONES...). ' +
  'Si el nombre no coincide, el sistema mete las fotos en "sin clasificar" y el técnico tiene que asignarlas a mano.'
));

// Checklist final
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1('6. Checklist final antes de guardar las fotos'));
children.push(P(T(
  'Antes de cerrar la carpeta y avisar que la solicitud está lista, verificar:'
)));
const checklist = [
  '☐ La carpeta del cliente coincide con la razón social del sistema (o con un alias conocido).',
  '☐ La carpeta SOL usa el formato "SOL <número>" con el número real de la solicitud.',
  '☐ Si hay varias OTs, cada una tiene su carpeta "OT <número>".',
  '☐ Las fotos de recepción están en la raíz de la carpeta SOL/OT (no en una subcarpeta).',
  '☐ Las fotos de ensayo están en la subcarpeta de la sección correspondiente (MICROESTRUCTURA, ESPESOR, GRANO, INCLUSIONES, ...).',
  '☐ Si hay varias muestras, están separadas en subcarpetas M1, M2, M3…',
  '☐ Los nombres de archivo son descriptivos e incluyen la magnificación cuando corresponde (100x, 200x, …).',
  '☐ No hay archivos con nombre genérico (foto.jpg, IMG_1234.jpg) sin renombrar.',
  '☐ Si hay una carpeta INFORMAR, contiene SOLO las fotos que deben salir en el informe.',
];
checklist.forEach((c) => children.push(P(T(c), { indent: 200 })));

children.push(H1('7. Ante dudas'));
children.push(P([
  T('Si un caso no encaja en este procedimiento, dejar las fotos ordenadas lo mejor posible y avisar al responsable técnico '),
  T('antes', { italic: true }),
  T(' de emitir el informe. Es preferible corregir la carpeta que emitir un informe con fotos mal asignadas.'),
]));

// ── Construir y guardar ─────────────────────────────────────────────────────
const doc = new Document({
  creator: 'LABTESA',
  title: 'Procedimiento de Ingresos — Carpetas y Fotos',
  description: 'Estándar de carpetas y nomenclatura de fotos para recepcionistas',
  styles: {
    default: {
      document: { run: { font: FUENTE, size: 22 } },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
      },
    },
    children,
  }],
});

const outputPath = path.join(__dirname, '..', 'PROCEDIMIENTO_INGRESOS.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outputPath, buf);
  console.log('✓ Generado:', outputPath);
}).catch((e) => {
  console.error('✗ Error:', e);
  process.exit(1);
});
