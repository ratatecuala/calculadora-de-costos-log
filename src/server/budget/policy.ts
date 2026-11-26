/**
 * Política inicial de consultas (decisiones A-39 a A-42, 17-11-2026).
 * Estas cifras son protecciones propias: NO garantizan gasto cero ni sustituyen
 * las cuotas o condiciones del proveedor.
 */
export interface BudgetPolicy {
  /** Objetivo operativo mensual de solicitudes Essentials iniciadas por usuarios. */
  operationalMonthly: number;
  /** Corte de emergencia mensual: ninguna solicitud (incluidos reintentos) lo supera. */
  emergencyMonthly: number;
  /** PROVISIONAL (decisión pendiente del propietario): rutas automáticas por usuario y día. */
  perUserDaily: number;
  /** PROVISIONAL (decisión pendiente del propietario): solicitudes por origen de red y día. */
  perOriginDaily: number;
  comparisonsPerUserDaily: number;
  comparisonsPerUserMonthly: number;
}

export const DEFAULT_POLICY: Readonly<BudgetPolicy> = Object.freeze({
  operationalMonthly: 7000,
  emergencyMonthly: 8000,
  perUserDaily: 20,
  perOriginDaily: 40,
  comparisonsPerUserDaily: 3,
  comparisonsPerUserMonthly: 10,
});

/**
 * Ritmo diario acumulativo: el día d de un mes de D días se pueden haber usado
 * como máximo ⌊objetivo × d / D⌋ solicitudes. Lo no usado pasa al día siguiente.
 */
export function operationalAllowance(policy: BudgetPolicy, dayOfMonth: number, daysInMonth: number): number {
  const allowance = Math.floor((policy.operationalMonthly * dayOfMonth) / daysInMonth);
  return Math.min(allowance, policy.operationalMonthly, policy.emergencyMonthly);
}
