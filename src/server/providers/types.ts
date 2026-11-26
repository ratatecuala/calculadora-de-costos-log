import type { RouteRequestInput, RouteResult } from '../../shared/route';

export type ProviderOutcome =
  | { ok: true; route: RouteResult }
  | { ok: false; retryable: boolean; error: string };

/** Contrato intercambiable: el motor económico no conoce al proveedor. */
export interface RouteProvider {
  readonly name: 'simulado' | 'google';
  computeRoute(input: RouteRequestInput): Promise<ProviderOutcome>;
}
