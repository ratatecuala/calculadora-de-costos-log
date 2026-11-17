import { displayAmount, formatClp } from '../engine/rounding';
import type { Bounded } from '../engine/types';
import type { PointRole, RouteSource } from '../shared/route';

/** Monto con su tipo (§3C): «o más», «al menos», «como máximo». */
export function boundedText(b: Bounded, kind: 'costo' | 'precio' | 'resultado'): string {
  const amount = formatClp(displayAmount(b));
  if (b.type === 'estimado') return amount;
  if (b.type === 'cotaInferior') return kind === 'precio' ? `al menos ${amount}` : `${amount} o más`;
  return `como máximo ${amount}`;
}

export function signedBoundedText(b: Bounded): string {
  const v = displayAmount(b);
  const amount = `${v >= 0 ? '+' : '−'}${formatClp(Math.abs(v))}`;
  return b.type === 'cotaSuperior' ? `como máximo ${amount}` : amount;
}

export const MISSING_LABELS: Record<string, string> = {
  combustible: 'combustible (precio o rendimiento)',
  peajes: 'peajes y TAG',
  ayudantes: 'pago de ayudantes',
  desgaste: 'desgaste por km',
  gastosFijos: 'tus gastos fijos',
  remuneracion: 'lo que quieres ganar por hora',
};

export function missingText(ids: string[]): string {
  return ids.map((id) => MISSING_LABELS[id] ?? id).join(', ');
}

export const ROLE_LABEL: Record<PointRole, string> = { base: 'Base', A: 'A', B: 'B' };

export const SOURCE_LABEL: Record<RouteSource | 'mixto', string> = {
  simulado: 'Simulado (no es dato real)',
  google: 'Google Routes',
  declarado: 'Declarado por ti',
  mixto: 'Mixto: parte declarado por ti',
};

export function formatKm(km: number): string {
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(km)} km`;
}

export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Lee un número escrito por el usuario; vacío = no lo sabe (null). Acepta «1.050» o «12,5». */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\$/g, '').replace(/\s/g, '');
  if (t === '') return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
