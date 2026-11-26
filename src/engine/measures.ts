import { ceilTo } from './rounding';
import type { Bounded, CostItem, ItemCategory, Measures } from './types';

export interface MeasureInput {
  items: CostItem[];
  /** Margen adicional m como fracción: 0 ≤ m ≤ 0,8. */
  margin: number;
  /** Recargos sobre el precio definidos por el usuario (CLP, ≥ 0). */
  surcharges?: number;
  /** Precio elegido P (neto). `null` si aún no se elige. */
  price?: number | null;
}

export class InvalidMarginError extends Error {}
/** Monto inválido que llega al motor sin pasar por `buildCostItems` (C-1, A-50). */
export class InvalidAmountError extends Error {}

function sumCategory(items: CostItem[], categories: ItemCategory[], lowerIsSafe: boolean): Bounded {
  let value = 0;
  const missing: string[] = [];
  for (const item of items) {
    if (!categories.includes(item.category)) continue;
    if (item.amount === null) missing.push(item.id);
    else value += item.amount;
  }
  return { value, type: missing.length === 0 ? 'estimado' : lowerIsSafe ? 'cotaInferior' : 'cotaSuperior', missing };
}

/**
 * Las medidas de la v1 (docs/03 §2 y §3C). Con datos faltantes:
 * los costos son cotas INFERIORES y lo que queda es cota SUPERIOR.
 */
export function computeMeasures(input: MeasureInput): Measures {
  const m = input.margin;
  if (!(m >= 0 && m <= 0.8)) throw new InvalidMarginError('El margen debe estar entre 0 % y 80 %');
  const rawSurcharges = input.surcharges ?? 0;
  if (!Number.isFinite(rawSurcharges)) throw new InvalidAmountError('Los recargos deben ser un número');
  if (input.price != null && !Number.isFinite(input.price)) throw new InvalidAmountError('El precio debe ser un número');
  for (const it of input.items) {
    if (it.amount !== null && !(Number.isFinite(it.amount) && it.amount >= 0)) throw new InvalidAmountError(`Partida inválida: ${it.id}`);
  }
  // Recargos negativos: comportamiento no especificado (NE-1, docs/15); se mantienen en 0.
  const surcharges = Math.max(0, rawSurcharges);

  const D = sumCategory(input.items, ['desembolso'], true);
  const W = sumCategory(input.items, ['desgaste'], true);
  const CF = sumCategory(input.items, ['fijo'], true);
  const R = sumCategory(input.items, ['remuneracion'], true);
  const cost = sumCategory(input.items, ['desembolso', 'desgaste', 'fijo', 'remuneracion'], true);

  if (!Number.isFinite(cost.value / (1 - m) + surcharges)) throw new InvalidAmountError('Monto fuera de rango');
  // Válido como cota inferior del precio sugerido completo por monotonía del techo (§3C).
  const suggested: Bounded = {
    value: ceilTo(cost.value / (1 - m) + surcharges, 1000),
    type: cost.type,
    missing: cost.missing,
  };

  const P = input.price ?? null;
  const upper = (value: number, missing: string[]): Bounded => ({
    value,
    type: missing.length === 0 ? 'estimado' : 'cotaSuperior',
    missing,
  });
  const afterTrip = P === null ? null : upper(P - D.value, D.missing);
  const afterAllCosts = P === null ? null : upper(P - D.value - W.value - CF.value, [...D.missing, ...W.missing, ...CF.missing]);
  const overGoal = P === null ? null : upper(P - cost.value, cost.missing);

  return {
    D,
    W,
    CF,
    R,
    cost,
    suggested,
    afterTrip,
    afterAllCosts,
    overGoal,
    complete: cost.missing.length === 0,
    missing: cost.missing,
  };
}
