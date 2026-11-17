import type { Bounded } from './types';

/** Techo al múltiplo de `step` (política del precio sugerido). */
export function ceilTo(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

/**
 * Monto a mostrar, al peso (§3C, corrección del 16-11-2026):
 * - estimado → al peso más cercano;
 * - cota inferior → hacia ABAJO (sigue siendo ≤ el valor real);
 * - cota superior → hacia ARRIBA (sigue siendo ≥ el valor real).
 * El precio sugerido ya viene redondeado a 1.000 por política y no se vuelve a redondear.
 */
export function displayAmount(b: Bounded): number {
  // Tolerancia mínima para errores de coma flotante (p. ej., 35201.999999).
  const eps = 1e-7;
  switch (b.type) {
    case 'cotaInferior':
      return Math.floor(b.value + eps);
    case 'cotaSuperior':
      return Math.ceil(b.value - eps);
    default:
      return Math.round(b.value);
  }
}

/** Umbral «menos de $X»: hacia abajo, para que la conclusión siga siendo válida. */
export function displayThreshold(value: number): number {
  return Math.floor(value + 1e-7);
}

const clp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function formatClp(value: number): string {
  return `$${clp.format(value)}`;
}
