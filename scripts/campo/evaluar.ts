import { buildCostItems } from '../../src/engine/inputs';
import { computeMeasures } from '../../src/engine/measures';
import { displayAmount } from '../../src/engine/rounding';
import { LEG_LIMITS, PARAM_LIMITS, PRICE_LIMIT, limitIssue, type FieldLimit } from '../../src/web/numericLimits';
import { initialState } from '../../src/web/session';

const columnas = [
  'caso', 'recorrido', 'vehiculo', 'uso', 'origen_km_min', 'km', 'min_marcha', 'km_l_ref', 'fuente_km_l',
  'clp_l', 'fuente_clp_l', 'desgaste_clp_km', 'fijos_clp_h', 'trabajo_clp_h', 'min_carga', 'ayudantes',
  'pago_ayudante_clp', 'tag_clp', 'fuente_tag', 'otros_clp', 'fuente_otros',
] as const;
type Columna = (typeof columnas)[number];
type Fila = Record<Columna, string>;

const resultados = [
  'estado', 'combustible_estimado_clp', 'peajes_clp', 'ayudantes_clp', 'otros_incluidos_clp',
  'desgaste_estimado_clp', 'fijos_asignados_clp', 'trabajo_objetivo_clp', 'costo_motor_clp',
  'tipo_costo', 'faltan', 'margen_simulacion_pct', 'precio_sugerido_clp',
];

// Campos cerrados (alias, categorías y números), sin texto libre ni direcciones.
// Acepta comillas de Excel en esos campos, BOM, CRLF y coma decimal.
function celdas(linea: string): string[] {
  return linea.split(';').map((campo) => campo.trim().replace(/^"([^"]*)"$/, '$1'));
}

function opcion(fila: Fila, campo: Columna, valores: readonly string[]): void {
  if (!valores.includes(fila[campo])) throw new Error(campo + ': valor no admitido');
}

function numero(fila: Fila, campo: Columna, limite: FieldLimit): number | null {
  const texto = fila[campo];
  if (!texto) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(texto)) throw new Error(campo + ': ingresa un número sin separadores de miles');
  const valor = Number(texto.replace(',', '.'));
  const error = limitIssue(valor, limite);
  if (error) throw new Error(campo + ': ' + error);
  return valor;
}

function requerido(fila: Fila, campo: Columna, limite: FieldLimit): number {
  const valor = numero(fila, campo, limite);
  if (valor === null) throw new Error(campo + ': falta el dato; escribe 0 solo si corresponde');
  return valor;
}

function fuente(fila: Fila, dato: Columna, campo: Columna, opciones: string[]): void {
  opcion(fila, campo, fila[dato] === '' ? [''] : opciones);
}

function evaluar(f: Fila): (string | number | null)[] {
  for (const campo of ['caso', 'recorrido', 'vehiculo'] as const) {
    if (!/^[a-z\d][a-z\d_-]{0,59}$/i.test(f[campo])) throw new Error(campo + ': usa un alias sin espacios');
  }
  opcion(f, 'uso', ['circulacion', 'simulacion']);
  opcion(f, 'origen_km_min', f.uso === 'circulacion' ? ['medido'] : ['supuesto', 'medido']);
  fuente(f, 'km_l_ref', 'fuente_km_l', ['estimado', 'lleno_a_lleno', 'supuesto']);
  fuente(f, 'clp_l', 'fuente_clp_l', ['boleta', 'surtidor', 'estimado', 'supuesto']);
  fuente(f, 'tag_clp', 'fuente_tag', ['comprobante', 'declarado', 'estimado', 'supuesto']);
  fuente(f, 'otros_clp', 'fuente_otros', ['comprobante', 'declarado', 'estimado', 'supuesto']);

  const km = numero(f, 'km', LEG_LIMITS.km);
  const min = numero(f, 'min_marcha', LEG_LIMITS.minutes);
  const params = {
    kmPerL: numero(f, 'km_l_ref', PARAM_LIMITS.kmPerL),
    fuelPricePerL: numero(f, 'clp_l', PARAM_LIMITS.fuelPricePerL),
    wearPerKm: numero(f, 'desgaste_clp_km', PARAM_LIMITS.wearPerKm),
    fixedPerHour: numero(f, 'fijos_clp_h', PARAM_LIMITS.fixedPerHour),
    ownerPerHour: numero(f, 'trabajo_clp_h', PARAM_LIMITS.ownerPerHour),
    loadMinutes: requerido(f, 'min_carga', PARAM_LIMITS.loadMinutes),
    helpers: requerido(f, 'ayudantes', PARAM_LIMITS.helpers),
    helperFee: numero(f, 'pago_ayudante_clp', PARAM_LIMITS.helperFee),
    tolls: numero(f, 'tag_clp', PARAM_LIMITS.tolls),
    otherCosts: requerido(f, 'otros_clp', PARAM_LIMITS.otherCosts),
  };
  const comercial = f.uso === 'simulacion';
  if (!comercial && (params.ownerPerHour !== 0 || params.helpers !== 0 || params.loadMinutes !== 0 || (params.helperFee ?? 0) !== 0)) {
    throw new Error('circulacion: para agregar trabajo, ayudantes o carga usa una fila de simulacion');
  }
  if (km === null || min === null) return resultados.map((_, i) => i === 0 ? 'pendiente_recorrido' : null);

  const items = buildCostItems(km, min, params);
  const { margin, surcharges } = initialState();
  const m = computeMeasures({ items, margin, surcharges });
  const importes = new Map(items.map((item) => [item.id, item.amount]));
  const sugerido = displayAmount(m.suggested);
  const copiable = comercial && m.complete && limitIssue(sugerido, PRICE_LIMIT) === null;
  return [
    m.complete ? 'estimacion_completa' : 'estimacion_parcial',
    ...['combustible', 'peajes', 'ayudantes', 'otros', 'desgaste', 'gastosFijos', 'remuneracion'].map((id) => importes.get(id) ?? null),
    displayAmount(m.cost), m.cost.type, m.cost.missing.join('|'), comercial ? margin * 100 : null, copiable ? sugerido : null,
  ];
}

export function evaluarRegistro(csv: string): string {
  const [encabezado = '', ...lineas] = csv.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  if (celdas(encabezado).join(';') !== columnas.join(';')) throw new Error('Usa el encabezado de plantilla.csv');
  const salida = [[...columnas, ...resultados].join(';')];
  const ids = new Set<string>();
  for (const [i, linea] of lineas.entries()) {
    if (!linea.trim()) continue;
    try {
      const valores = celdas(linea);
      if (valores.length !== columnas.length) throw new Error('cantidad de columnas incorrecta');
      const fila = Object.fromEntries(columnas.map((c, j) => [c, valores[j]])) as Fila;
      if (ids.has(fila.caso)) throw new Error('identificador de caso repetido');
      ids.add(fila.caso);
      salida.push([...valores, ...evaluar(fila).map((v) => typeof v === 'number' ? String(v).replace('.', ',') : v)].join(';'));
    } catch (error) {
      throw new Error('Fila ' + (i + 2) + ': ' + (error instanceof Error ? error.message : 'dato inválido'));
    }
  }
  return salida.join('\n') + '\n';
}
