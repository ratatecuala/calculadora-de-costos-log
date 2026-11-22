/**
 * Límites TÉCNICOS de las entradas numéricas de la calculadora (A-71).
 *
 * Objetivo: que ningún valor escrito o recuperado (aunque sea finito, como 1e308) haga fallar el
 * cálculo. No son límites comerciales ni cambian las fórmulas del motor: un valor fuera de rango NO se
 * corrige ni se reemplaza; se marca como inválido junto a su campo y el cálculo queda en pausa hasta
 * que el usuario lo revise.
 *
 * Tres estados distintos para cada campo (A-50 y A-71):
 *  - FALTANTE: vacío (`null`) en los campos que lo admiten → «No lo sé»; el costo queda como cota.
 *  - CERO: un dato real (p. ej., 0 = «no hay peajes»).
 *  - INVÁLIDO: fuera de rango, no finito o con decimales donde no corresponde → error en el campo.
 *
 * Fundamento de los topes (peor caso con TODOS los campos en su máximo y 3 tramos):
 *  km = 3 × 100.000; combustible = 300.000 / 0,1 × 100.000 = 3·10^11; desgaste = 3·10^9;
 *  horas = (300.000 + 100.000) / 60 ≈ 6.667 → gastos fijos y remuneración ≈ 6,7·10^10 cada uno;
 *  ayudantes = 100 × 9.999.999.999 ≈ 10^12; peajes y otros ≈ 10^10 cada uno.
 *  Costo ≈ 1,5·10^12 y precio sugerido con 80 % de margen ≈ 7,6·10^12: finito y muy lejos de
 *  Number.MAX_SAFE_INTEGER (≈ 9·10^15). Ninguna operación intermedia puede dar infinito.
 */
import { MAX_CLP } from '../shared/resources';
import type { TripParams } from '../engine/inputs';
import type { SessionState } from './session';

/** Topes por tramo, compartidos con la recuperación del recorrido manual (A-70). */
export const MAX_LEG_KM = 100_000;
export const MAX_LEG_MINUTES = 100_000;

export interface FieldLimit {
  min: number;
  max: number;
  /** Solo enteros (p. ej., cantidad de ayudantes). */
  integer?: boolean;
  /** Mínimo para valores POSITIVOS cuando 0 tiene otro significado (rendimiento: 0 = sin dato). */
  minPositive?: number;
  unit: string;
}

/**
 * Límite de cada parámetro del costo. El rendimiento y el desgaste usan los mismos máximos que el
 * formulario de «Mi vehículo» (shared/vehicle.ts: 100 km/L y $10.000/km).
 */
export const PARAM_LIMITS: Record<keyof TripParams, FieldLimit> = {
  fuelPricePerL: { min: 0, max: 100_000, unit: '$/L' },
  kmPerL: { min: 0, minPositive: 0.1, max: 100, unit: 'km/L' },
  wearPerKm: { min: 0, max: 10_000, unit: '$/km' },
  fixedPerHour: { min: 0, max: 10_000_000, unit: '$/h' },
  ownerPerHour: { min: 0, max: 10_000_000, unit: '$/h' },
  helpers: { min: 0, max: 100, integer: true, unit: '' },
  helperFee: { min: 0, max: MAX_CLP, unit: '$' },
  loadMinutes: { min: 0, max: MAX_LEG_MINUTES, unit: 'min' },
  tolls: { min: 0, max: MAX_CLP, unit: '$' },
  otherCosts: { min: 0, max: MAX_CLP, unit: '$' },
};

export const LEG_LIMITS = {
  km: { min: 0, max: MAX_LEG_KM, unit: 'km' },
  minutes: { min: 0, max: MAX_LEG_MINUTES, unit: 'min' },
} satisfies Record<'km' | 'minutes', FieldLimit>;

export const MONEY_LIMIT: FieldLimit = { min: 0, max: MAX_CLP, unit: '$' };
/** Margen como fracción: la regla del motor (0 % a 80 %). */
export const MARGIN_LIMIT: FieldLimit = { min: 0, max: 0.8, unit: '%' };

const fmt = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n);
const withUnit = (n: number, unit: string) => (unit === '$' ? `$${fmt(n)}` : unit === '%' ? `${fmt(n * 100)} %` : unit ? `${fmt(n)} ${unit}` : fmt(n));

/** Mensaje de error del valor, o `null` si es válido. `null` (faltante) siempre es válido aquí. */
export function limitIssue(value: number | null, limit: FieldLimit): string | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'No es un número válido';
  if (value < limit.min) return `No puede ser menor que ${withUnit(limit.min, limit.unit)}`;
  if (value > limit.max) return `Revisa el valor: máximo ${withUnit(limit.max, limit.unit)}`;
  if (limit.integer && !Number.isInteger(value)) return 'Debe ser un número entero';
  if (limit.minPositive !== undefined && value > 0 && value < limit.minPositive)
    return `Usa 0 si no lo sabes, o un valor desde ${withUnit(limit.minPositive, limit.unit)}`;
  return null;
}

/** Claves de los errores: `params.<campo>`, `<ruta>.leg.<i>.km|minutes`, `margin`, `surcharges`, `chosenPrice`, `tollsComparison`. */
export type NumericIssues = Record<string, string>;

type Legs = Array<{ km: number | null; minutes: number | null }>;

function legValues(rs: SessionState['habitual']): Legs {
  if (rs.status === 'manual') return rs.manualLegs;
  if (rs.status === 'listo' && rs.route)
    return rs.route.legs.map((_, i) => ({ km: rs.overrides[i]?.km ?? null, minutes: rs.overrides[i]?.minutes ?? null }));
  return [];
}

/**
 * Todos los valores numéricos fuera de rango del estado. Los km y minutos de una ruta del proveedor
 * no se validan aquí (los entrega el servidor ya validados); sí las correcciones del usuario.
 */
export function numericIssues(s: SessionState): NumericIssues {
  const out: NumericIssues = {};
  const add = (key: string, v: number | null, limit: FieldLimit) => {
    const issue = limitIssue(v, limit);
    if (issue) out[key] = issue;
  };
  for (const k of Object.keys(PARAM_LIMITS) as Array<keyof TripParams>) add(`params.${k}`, s.params[k], PARAM_LIMITS[k]);
  for (const [kind, rs] of [['habitual', s.habitual], ['evitarPeajes', s.comparison]] as const) {
    legValues(rs).forEach((l, i) => {
      add(`${kind}.leg.${i}.km`, l.km, LEG_LIMITS.km);
      add(`${kind}.leg.${i}.minutes`, l.minutes, LEG_LIMITS.minutes);
    });
  }
  add('margin', s.margin, MARGIN_LIMIT);
  add('surcharges', s.surcharges, MONEY_LIMIT);
  add('chosenPrice', s.chosenPrice, MONEY_LIMIT);
  add('tollsComparison', s.tollsComparison, MONEY_LIMIT);
  return out;
}

/** ¿Este error impide calcular la ruta `kind`? El precio elegido no impide calcular el costo. */
export function blocksComputation(key: string, kind: 'habitual' | 'evitarPeajes'): boolean {
  if (key === 'chosenPrice') return false;
  if (key === 'tollsComparison') return kind === 'evitarPeajes';
  if (key.startsWith('habitual.')) return kind === 'habitual';
  if (key.startsWith('evitarPeajes.')) return kind === 'evitarPeajes';
  return true; // parámetros del costo, margen y recargos
}
