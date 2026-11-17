import type { CostItem } from './types';

/** Resumen de una ruta para compararla (docs/03 §3E). */
export interface RouteCostSummary {
  items: CostItem[];
  km: number;
  hours: number;
}

export type Comparison =
  | { kind: 'concluyente'; cheaper: 'x' | 'y' | 'empate'; difference: number }
  /** Faltan los peajes de una sola ruta: conviene `route` si sus peajes suman menos que `threshold`. */
  | { kind: 'umbralPeajes'; route: 'x' | 'y'; threshold: number }
  /** Falta una tarifa común (por km o por hora): conviene `cheaperIfAbove` si la tarifa supera `threshold`. */
  | { kind: 'umbralTarifa'; item: string; per: 'km' | 'hora'; threshold: number; cheaperIfAbove: 'x' | 'y' }
  | { kind: 'noConcluyente'; missing: string[] };

const PER_KM = new Set(['combustible', 'desgaste']);
const PER_HOUR = new Set(['gastosFijos', 'remuneracion']);
/** Iguales en ambas rutas: si faltan en las dos, se cancelan. */
const SAME_BOTH = new Set(['ayudantes', 'otros']);

function known(items: CostItem[]): number {
  return items.reduce((s, i) => s + (i.amount ?? 0), 0);
}
function missingIds(items: CostItem[]): string[] {
  return items.filter((i) => i.amount === null).map((i) => i.id);
}

/**
 * Una ruta es «más barata con seguridad» solo si lo es para TODO valor ≥ 0 de los
 * faltantes. Si no, se muestra un umbral o se declara no concluyente.
 */
export function compareRoutes(x: RouteCostSummary, y: RouteCostSummary): Comparison {
  const mx = missingIds(x.items).filter((id) => !(SAME_BOTH.has(id) && missingIds(y.items).includes(id)));
  const my = missingIds(y.items).filter((id) => !(SAME_BOTH.has(id) && missingIds(x.items).includes(id)));
  const kx = known(x.items);
  const ky = known(y.items);
  const delta = kx - ky;

  if (mx.length === 0 && my.length === 0) {
    return { kind: 'concluyente', cheaper: delta < 0 ? 'x' : delta > 0 ? 'y' : 'empate', difference: Math.abs(delta) };
  }

  // Faltantes propios de una sola ruta (p. ej., peajes de la autopista).
  if (my.length === 0 && mx.length > 0) return oneSided('x', mx, delta);
  if (mx.length === 0 && my.length > 0) return oneSided('y', my, -delta);

  // Una única tarifa común faltante en ambas rutas.
  if (mx.length === 1 && my.length === 1 && mx[0] === my[0] && (PER_KM.has(mx[0]!) || PER_HOUR.has(mx[0]!))) {
    const item = mx[0]!;
    const per = PER_KM.has(item) ? 'km' : 'hora';
    const q = per === 'km' ? x.km - y.km : x.hours - y.hours;
    // C_x − C_y = delta + r·q, con r ≥ 0 desconocida.
    if (delta < 0 && q <= 0) return { kind: 'concluyente', cheaper: 'x', difference: Math.abs(delta) };
    if (delta > 0 && q >= 0) return { kind: 'concluyente', cheaper: 'y', difference: Math.abs(delta) };
    if (delta === 0 && q === 0) return { kind: 'concluyente', cheaper: 'empate', difference: 0 };
    const threshold = -delta / q;
    if (threshold < 0) return { kind: 'noConcluyente', missing: [item] };
    return { kind: 'umbralTarifa', item, per, threshold, cheaperIfAbove: q < 0 ? 'x' : 'y' };
  }

  return { kind: 'noConcluyente', missing: [...new Set([...mx, ...my])] };
}

/** `a` tiene faltantes propios y `b` no. delta = K_a − K_b. */
function oneSided(a: 'x' | 'y', missing: string[], delta: number): Comparison {
  const b = a === 'x' ? 'y' : 'x';
  // Los faltantes solo pueden subir el costo de `a`: si su parte conocida ya es igual o mayor,
  // `b` no es más cara con ningún valor de los faltantes.
  if (delta >= 0) return { kind: 'concluyente', cheaper: b, difference: delta };
  if (missing.length === 1 && missing[0] === 'peajes') return { kind: 'umbralPeajes', route: a, threshold: -delta };
  return { kind: 'noConcluyente', missing };
}
