/**
 * Validación de los tramos devueltos por cualquier proveedor (auditoría ChatGPT, P1).
 * - Rechaza distancias o duraciones ausentes, no numéricas, negativas o cero:
 *   una duración 0 subestimaría el costo sin aviso.
 * - Acepta, pero marca con advertencia, los tramos con una velocidad promedio
 *   implícita poco plausible para un vehículo de carga liviano.
 */
import type { Leg, RouteWarning } from '../shared/route';

/** Velocidad promedio plausible (km/h). Fuera de este rango se advierte; no se corrige. */
export const PLAUSIBLE_SPEED_KMH = { min: 3, max: 130 } as const;

export type LegCheck = { valid: true; warnings: RouteWarning[] } | { valid: false; error: string };

export function checkLegs(legs: Leg[], expectedCount?: number): LegCheck {
  if (legs.length === 0) return { valid: false, error: 'sin tramos' };
  if (expectedCount !== undefined && legs.length !== expectedCount) return { valid: false, error: 'tramos inesperados' };
  const warnings: RouteWarning[] = [];
  for (let i = 0; i < legs.length; i++) {
    const { distanceM, durationS } = legs[i]!;
    if (typeof distanceM !== 'number' || !Number.isFinite(distanceM) || distanceM <= 0) {
      return { valid: false, error: `tramo ${i + 1}: distancia inválida` };
    }
    if (typeof durationS !== 'number' || !Number.isFinite(durationS) || durationS <= 0) {
      return { valid: false, error: `tramo ${i + 1}: duración inválida` };
    }
    const kmh = distanceM / 1000 / (durationS / 3600);
    if (kmh > PLAUSIBLE_SPEED_KMH.max || (kmh < PLAUSIBLE_SPEED_KMH.min && distanceM > 500)) {
      warnings.push({ code: 'tramo_atipico', leg: i });
    }
  }
  return { valid: true, warnings };
}

/** Une advertencias sin duplicados. */
export function mergeWarnings(a: RouteWarning[], b: RouteWarning[]): RouteWarning[] {
  const seen = new Set(a.map((w) => JSON.stringify(w)));
  return [...a, ...b.filter((w) => !seen.has(JSON.stringify(w)))];
}
