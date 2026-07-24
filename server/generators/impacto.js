const {
  Paragraph, TextRun, Table, TableRow, WidthType, PageBreak,
} = require('docx');
const {
  parrafoNormal, tituloSeccion, subtitulo, captionTabla,
  BORDE_TABLA, celdaHeader, celdaDato,
} = require('./estilos');

const EQUIPO = [
  { key: 'galdabini',   label: 'Máquina de impacto Galdabini TAG N°MM-409' },
  { key: 'freezer',     label: 'Ultra freezer TAG N°EE-761' },
  { key: 'controlador', label: 'Controlador de temperatura digital TAG N°MM-021' },
  { key: 'calibre_571', label: 'Calibre digital TAG N°MM-571' },
  { key: 'galgas',      label: 'Galgas patrón TAG N°MM-771(para 2,5) / MM-772 (para 5) / MM-773 (para 7,5) / 775 (para 10 x 10 ) / MM-776' },
  { key: 'proyector',   label: 'Proyector de perfiles TAG N°MM-165' },
];

const MEDIDAS = {
  '10x10': 'Medida de probeta: 10 x 10 x 55 mm',
  '7.5':   'Medida de probeta: 7,5 x 10 x 55 mm   7,5 (NO ACREDITADO)',
  '5':     'Medida de probeta: 5 x 10 x 55 mm   5 (NO ACREDITADO)',
  '2.5':   'Medida de probeta: 2,5 x 10 x 55 mm   2,5 (NO ACREDITADO)',
};

function generarImpacto(datos, numTablaInicio, esPrimerEnsayo) {
  const elementos = [];

  if (!esPrimerEnsayo) {
    elementos.push(new Paragraph({ children: [new PageBreak()] }));
  }

  elementos.push(tituloSeccion('ENSAYO DE IMPACTO'));
  elementos.push(subtitulo('CONDICIONES DE ENSAYO'));

  if (datos.cod_asme)    elementos.push(parrafoNormal(`Código de referencia: ASME BPVC Sección IX Ed.${datos.ed_asme || '2025'}`));
  if (datos.cod_api1104) elementos.push(parrafoNormal('Código de referencia: API 1104 Ed.22-2021 (E1-2023)'));
  if (datos.cod_api5l)   elementos.push(parrafoNormal('Código de referencia: API 5L'));
  if (datos.norma_astm_e23) elementos.push(parrafoNormal('Norma de ensayo: ASTM E23-25'));
  if (datos.norma_iso148)   elementos.push(parrafoNormal('Norma de ensayo: ISO 148-1:2016'));

  elementos.push(parrafoNormal('Metodología de ensayo: ITM N°078'));

  if (datos.prob_cliente)       elementos.push(parrafoNormal('Probetas mecanizadas por el cliente'));
  if (datos.medida_probeta)     elementos.push(parrafoNormal(MEDIDAS[datos.medida_probeta] || `Medida de probeta: ${datos.medida_probeta}`));
  if (datos.prob_cupon_soldado) elementos.push(parrafoNormal('Probeta extraída de cupón soldado'));
  if (datos.orientacion)        elementos.push(parrafoNormal(`Orientación de las probetas: ${datos.orientacion}`));

  if (datos.entalla) {
    const esU = datos.entalla === 'U';
    elementos.push(parrafoNormal(`Entalla: Charpy "${datos.entalla}"${esU ? '    (NO ACREDITADO)' : ''}`));
  }

  if (datos.energia_informada) {
    elementos.push(parrafoNormal(`Energía informada: ${datos.energia_informada}`));
  }

  if (datos.temperatura !== '' && datos.temperatura != null) {
    const t = Number(datos.temperatura);
    const enRango = t >= -80 && t <= 50;
    elementos.push(parrafoNormal(
      `Temperatura de ensayo: ${datos.temperatura} °C${enRango ? '   TEMP ACREDITADA: de -80°C a 50°C' : ''}`
    ));
  }

  // Equipamiento
  elementos.push(subtitulo('EQUIPAMIENTO UTILIZADO'));
  const eq = datos.equipamiento || {};
  EQUIPO.forEach(({ key, label }) => { if (eq[key]) elementos.push(parrafoNormal(label)); });

  // Resultados
  elementos.push(subtitulo('RESULTADOS OBTENIDOS'));
  const muestras = datos.muestras || [{}];
  const W_PROB = 1800;
  const W_COL  = Math.round((9213 - W_PROB) / muestras.length);
  const colLabel = (m, i) => muestras.length === 1
    ? 'Energía Abs. (Joule)'
    : (m.columna_label || `O.T. ${datos.nro_ot || ''}`);

  elementos.push(new Table({
    width: { size: 9213, type: WidthType.DXA },
    borders: BORDE_TABLA,
    rows: [
      new TableRow({
        children: [
          celdaHeader('Probeta', W_PROB),
          ...muestras.map((m, i) => celdaHeader(colLabel(m, i), W_COL)),
        ],
      }),
      ...[1, 2, 3].map(n => new TableRow({
        children: [
          celdaHeader(String(n), W_PROB),
          ...muestras.map(m => celdaDato(m[`p${n}`] ?? '')),
        ],
      })),
    ],
  }));

  elementos.push(captionTabla(numTablaInicio, 'Resultados ensayo de impacto'));

  // Notas
  const notas = [];
  if (datos.nota1)        notas.push('Nota1: Todas las probetas cumplen con las dimensiones y tolerancias correspondientes verificado mediante utilización de las galgas patrón y calibre digital.');
  if (datos.nota2)        notas.push('Nota2: Los valores mayores a 138 Joules se encuentran fuera de alcance de acreditación.');
  if (datos.nota3)        notas.push('Nota3: La temperatura se encuentra fuera del alcance de acreditación.');
  if (datos.nota_subsize) notas.push('Nota: Dimensiones de probeta: "Especimen fuera de alcance de acreditación"');
  if (datos.oaa)          notas.push('"Los ensayos marcados con (*) no están incluidos en el alcance de la acreditación del OAA."');

  if (notas.length) {
    elementos.push(subtitulo('NOTA'));
    notas.forEach(n => elementos.push(parrafoNormal(n)));
  }

  // Evaluación
  if (datos.tiene_evaluacion && datos.evaluacion_texto) {
    elementos.push(subtitulo('EVALUACION DE RESULTADOS'));
    elementos.push(parrafoNormal('"Las evaluaciones, opiniones, interpretaciones, etc, que se indican a continuación, están fuera del alcance de la acreditación del OAA"'));
    elementos.push(parrafoNormal(datos.evaluacion_texto));
  }

  return { elementos, tablasUsadas: 1 };
}

module.exports = { generarImpacto };
