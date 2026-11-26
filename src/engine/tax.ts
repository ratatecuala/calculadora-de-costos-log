/**
 * IVA configurable (A-28, docs/03 §3D). La tasa no está en el código: viene de reglas
 * versionadas. Solo se aplican reglas verificadas; sin perfil, la cotización va en neto.
 */
export interface TaxRule {
  id: string;
  label: string;
  rate: number;
  verified: boolean;
  source: string;
  verifiedAt: string | null;
}

export interface TaxResult {
  net: number;
  tax: number | null;
  total: number;
  ruleId: string | null;
  /** Aviso para el transportista (nunca para el cliente). */
  notice: string | null;
}

export function selectableRules(rules: TaxRule[]): TaxRule[] {
  return rules.filter((r) => r.verified);
}

/** El precio elegido es siempre NETO. Redondeo del IVA al peso: provisional hasta #16. */
export function applyTax(net: number, ruleId: string | null, rules: TaxRule[]): TaxResult {
  if (ruleId === null) {
    return { net, tax: null, total: net, ruleId: null, notice: 'Configura cómo emites tus documentos para mostrar el IVA.' };
  }
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule || !rule.verified) {
    return {
      net,
      tax: null,
      total: net,
      ruleId: null,
      notice: 'La regla de IVA elegida aún no está verificada; la cotización se muestra en neto.',
    };
  }
  const tax = Math.round(net * rule.rate);
  return { net, tax, total: net + tax, ruleId: rule.id, notice: null };
}
