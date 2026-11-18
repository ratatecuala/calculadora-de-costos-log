import type { ServerConfig } from './config';
import { BudgetLedger, MemoryCounterStorage, type BudgetGate } from './budget/ledger';
import { GoogleRoutesProvider } from './google/provider';
import { MockRouteProvider } from './providers/mock';
import type { RouteProvider } from './providers/types';
import type { RouteHandlerDeps } from './routeHandler';

/**
 * Arma las dependencias del handler. Con proveedor Google exige configuración
 * completa (config.ts); en este PR no hay clave ni autorización, así que el servicio
 * Google queda apagado.
 */
export function createRouteService(config: ServerConfig, budget?: BudgetGate): RouteHandlerDeps {
  let provider: RouteProvider;
  if (config.provider === 'google' && config.routesEnabled && config.googleApiKey) {
    provider = new GoogleRoutesProvider({ apiKey: config.googleApiKey, fetchImpl: fetch });
  } else {
    provider = new MockRouteProvider({ testMarkers: config.testMarkers });
  }
  return {
    config: { routesEnabled: config.routesEnabled, originSalt: config.originSalt },
    budget: budget ?? new BudgetLedger(new MemoryCounterStorage()),
    provider,
  };
}
