const {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  AlignmentType,
  WidthType,
  PageBreak,
} = require('docx');

const {
  parrafoNormal,
  tituloSeccion,
  subtitulo,
  captionTabla,
  BORDE_TABLA,
  celdaHeader,
  celdaDato,
} = require('./estilos');

// ─── Definición de filas según variante ───────────────────────────────────────

const FILAS_ESTANDAR = [
  { label: 'Diámetro promedio (mm)',           key: 'diametro_promedio' },
  { label: 'Sección inicial S0 (mm²)',         key: 'seccion_inicial' },
  { label: 'Carga máxima (DaN)',               key: 'carga_maxima' },
  { label: 'Resistencia a la tracción (MPa)',  key: 'resistencia_traccion' },
  { label: 'Carga de fluencia (DaN)',          key: 'carga_fluencia' },
  { label: 'Tensión de fluencia (MPa)',        key: 'tension_fluencia' },
  { label: 'Longitud inicial (mm)',            key: 'longitud_inicial' },
  { label: 'Longitud final (mm)',              key: 'longitud_final' },
  { label: 'Alargamiento (%)',                 key: 'alargamiento' },
];

const FILAS_NEUQUEN = [
  { label: 'Ancho promedio (mm)',                    key: 'ancho_promedio' },
  { label: 'Espesor promedio (mm)',                  key: 'espesor_promedio' },
  { label: 'Diámetro promedio (mm)',                 key: 'diametro_promedio' },
  { label: 'Sección inicial S0 (mm²)',               key: 'seccion_inicial' },
  { label: 'Carga máxima (DaN)',                     key: 'carga_maxima' },
  { label: 'Resistencia a la tracción (MPa/KSI)',    key: 'resistencia_traccion' },
  { label: 'Carga de fluencia (DaN)',                key: 'carga_fluencia' },
  { label: 'Tensión de fluencia (MPa/KSI)*',        key: 'tension_fluencia' },
  { label: 'Longitud inicial (mm)',                  key: 'longitud_inicial' },
  { label: 'Longitud final (mm)',                    key: 'longitud_final' },
  { label: 'Alargamiento (%)*',                      key: 'alargamiento' },
  { label: 'Diámetro final (mm)',                    key: 'diametro_final' },
  { label: 'Sección final (mm²)',                    key: 'seccion_final' },
  { label: 'Estricción (%)*',                        key: 'estriccion' },
  { label: 'Defectos',                               key: 'defectos' },
  { label: 'Zona de rotura*',                        key: 'zona_rotura' },
  { label: 'Tipo de rotura*',                        key: 'tipo_rotura' },
  { label: 'Lado de rotura*',                        key: 'lado_rotura' },
];

const EQUIPO_ESTANDAR = [
  { key: 'shimadzu',      label: 'Máquina de tracción Shimadzu TAG N˚MM-151' },
  { key: 'calibre_694',   label: 'Calibre digital TAG N˚MM-694' },
  { key: 'termohigro_794',label: 'Termohigrómetro TAG N°MM-794' },
];

const EQUIPO_NEUQUEN = [
  { key: 'emic',          label: 'Máquina de tracción Emic TAG N˚MM-203' },
  { key: 'calibre_571',   label: 'Calibre digital TAG N˚MM-571' },
  { key: 'nivel_781',     label: 'Nivel angular magnético TAG N˚MM-781' },
  { key: 'termohigro_545',label: 'Termohigrómetro TAG N˚PCAL-545' },
  { key: 'trazado_782',   label: 'Dispositivo de trazado TAG N˚MM-782' },
  { key: 'regla_441',     label: 'Regla metálica TAG N˚MM-441' },
  { key: 'regla_443',     label: 'Regla metálica TAG N˚MM-443' },
  { key: 'proyector_165', label: 'Proyector de perfiles TAG N˚MM-165' },
];

// ─── Función principal ─────────────────────────────────────────────────────────

function generarTraccion(datos, numTablaInicio, esPrimerEnsayo) {
  const elementos = [];
  const esNeuquen = datos.variante === 'neuquen';

  // Salto de página (excepto si es el primer ensayo, que va después de la carátula)
  if (!esPrimerEnsayo) {
    elementos.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // Título
  elementos.push(tituloSeccion('ENSAYO DE TRACCION'));

  // ─── CONDICIONES DE ENSAYO ───────────────────────────────────────────────────
  elementos.push(subtitulo('CONDICIONES DE ENSAYO'));

  // Códigos de referencia opcionales
  if (datos.cod_asme)    elementos.push(parrafoNormal(`Código de referencia: ASME BPVC Sección IX Ed.${datos.ed_asme || '2025'}`));
  if (datos.cod_api1104) elementos.push(parrafoNormal('Código de referencia: API 1104 Ed.22-2021 (E1-2023)'));
  if (datos.cod_api5l)   elementos.push(parrafoNormal('Código de referencia: API 5L'));

  // Norma de referencia — año editable vía datos.norma_astm_a370_year.
  if (datos.norma_astm_a370) {
    var _y = String(datos.norma_astm_a370_year || '').trim();
    var _suf = _y ? ((_y[0] === '-' || _y[0] === ':') ? _y : '-' + _y) : '-24';
    elementos.push(parrafoNormal('Norma de referencia: ASTM A370' + _suf));
  }

  // Norma de ensayo
  if (datos.norma_ensayo) elementos.push(parrafoNormal(`Norma de ensayo: ${datos.norma_ensayo}`));

  // Metodología
  elementos.push(parrafoNormal(`Metodología de ensayo: ${datos.metodologia || 'ITM N˚075'}`));

  // Plano/figura de probeta
  if (datos.plano_asme)   elementos.push(parrafoNormal(`Plano de probeta según ASME BPVC Sección IX Ed.${datos.ed_asme || '2025'} ${datos.plano_asme}`));
  if (datos.figura_spec)  elementos.push(parrafoNormal(`Probeta mecanizada según ${datos.figura_spec}`));
  if (datos.prob_cliente) elementos.push(parrafoNormal('Probeta mecanizada por el cliente'));
  if (datos.prob_soldada) elementos.push(parrafoNormal('Probeta soldada'));

  // Orientación y temperatura
  if (datos.orientacion)  elementos.push(parrafoNormal(`Orientación de la probeta: ${datos.orientacion}`));
  if (datos.temperatura != null) elementos.push(parrafoNormal(`Temperatura de ensayo: ${datos.temperatura} °C`));

  // ─── EQUIPAMIENTO UTILIZADO ──────────────────────────────────────────────────
  elementos.push(subtitulo('EQUIPAMIENTO UTILIZADO'));

  const equiposDisponibles = esNeuquen ? EQUIPO_NEUQUEN : EQUIPO_ESTANDAR;
  const equipoSeleccionado = datos.equipamiento || {};

  equiposDisponibles.forEach(({ key, label }) => {
    if (equipoSeleccionado[key]) {
      elementos.push(parrafoNormal(label));
    }
  });

  // ─── RESULTADOS OBTENIDOS ────────────────────────────────────────────────────
  elementos.push(subtitulo('RESULTADOS OBTENIDOS'));

  const muestras = datos.muestras || [{}];
  const filas = esNeuquen ? FILAS_NEUQUEN : FILAS_ESTANDAR;

  // Ancho de columnas: primera columna más ancha
  const anchoParam = 3800;
  const anchoCols = Math.floor((9213 - anchoParam) / muestras.length);

  const filaHeader = new TableRow({
    children: [
      celdaHeader('Parámetros', anchoParam),
      ...muestras.map((m, i) => celdaHeader(
        m.columna_label || `M${i + 1}`, anchoCols
      )),
    ],
  });

  const filasData = filas.map(({ label, key }) => new TableRow({
    children: [
      celdaDato(label, AlignmentType.LEFT),
      ...muestras.map(m => celdaDato(m[key] ?? '')),
    ],
  }));

  const tabla = new Table({
    width: { size: 9213, type: WidthType.DXA },
    borders: BORDE_TABLA,
    rows: [filaHeader, ...filasData],
  });

  elementos.push(tabla);
  elementos.push(captionTabla(numTablaInicio, 'Resultados ensayo de tracción'));

  // ─── Secciones opcionales ────────────────────────────────────────────────────
  if (datos.nota_texto) {
    elementos.push(subtitulo('NOTA'));
    elementos.push(parrafoNormal(datos.nota_texto));
  }

  if (esNeuquen && datos.evaluacion_texto) {
    elementos.push(subtitulo('EVALUACION DE RESULTADOS'));
    elementos.push(parrafoNormal(
      '"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA"'
    ));
    elementos.push(parrafoNormal(datos.evaluacion_texto));
  }

  if (datos.oaa) {
    elementos.push(parrafoNormal('"Los parámetros marcados con (*) no están incluidos en el alcance de la acreditación del OAA"'));
  }

  return { elementos, tablasUsadas: 1 };
}

module.exports = { generarTraccion };
