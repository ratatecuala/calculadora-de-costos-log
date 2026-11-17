import { BudgetLedger, MemoryCounterStorage, type CounterStorage, type LedgerOptions } from '../src/server/budget/ledger';
import type { BudgetPolicy } from '../src/server/budget/policy';
import { MockRouteProvider, type MockProviderOptions } from '../src/server/providers/mock';
import type { RouteHandlerDeps } from '../src/server/routeHandler';

/** Último día de un mes de 30 días en America/Los_Angeles: el ritmo diario permite todo el objetivo. */
export const END_OF_MONTH = new Date('2026-11-30T20:00:00Z');
/** Primer día del mes. */
export const START_OF_MONTH = new Date('2026-11-01T20:00:00Z');

export function policy(overrides: Partial<BudgetPolicy> = {}): BudgetPolicy {
  return {
    operationalMonthly: 7000,
    emergencyMonthly: 8000,
    perUserDaily: 1000,
    perOriginDaily: 1000,
    comparisonsPerUserDaily: 3,
    comparisonsPerUserMonthly: 10,
    ...overrides,
  };
}

export function ledger(p: Partial<BudgetPolicy> = {}, storage: CounterStorage = new MemoryCounterStorage(), opts: LedgerOptions = {}) {
  return { ledger: new BudgetLedger(storage, { policy: policy(p), ...opts }), storage };
}

export function deps(
  budget: RouteHandlerDeps['budget'],
  providerOptions: MockProviderOptions = {},
  routesEnabled = true,
  clock: () => Date = () => END_OF_MONTH,
) {
  const provider = new MockRouteProvider(providerOptions);
  const d: RouteHandlerDeps = { config: { routesEnabled, originSalt: 'prueba' }, budget, provider, clock };
  return { deps: d, provider };
}

let counter = 0;
export function clientId(): string {
  counter += 1;
  return `cliente-prueba-${String(counter).padStart(8, '0')}`;
}

export const ROUTE = { origin: 'Calle Uno 123, Ñuñoa', destination: 'Avenida Dos 456, Las Condes' };

/** Almacenamiento que siempre falla. */
export class FailingStorage implements CounterStorage {
  async getMany(): Promise<Map<string, number>> {
    throw new Error('base de datos caída');
  }
  async putAll(): Promise<void> {
    throw new Error('base de datos caída');
  }
}

/** Almacenamiento que nunca responde. */
export class HangingStorage implements CounterStorage {
  getMany(): Promise<Map<string, number>> {
    return new Promise(() => undefined);
  }
  putAll(): Promise<void> {
    return new Promise(() => undefined);
  }
}

export function globalUsed(storage: MemoryCounterStorage, month = '2026-11'): number {
  return storage.data.get(`g:${month}`) ?? 0;
}
