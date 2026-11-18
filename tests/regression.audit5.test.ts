/**
 * Regresiones de la QUINTA auditoría de ChatGPT (PR #34, commit 514ceda).
 * P1: aislamiento entre sesiones en el navegador (vehículos y migración).
 * P2: confirmación de precio exigida también al guardar.
 * Sin red: repositorios y cliente de Supabase falsos.
 */
import { describe, expect, it, vi } from 'vitest';
import type { JobRecord } from '../src/shared/clientQuote';
import type { VehicleProfile } from '../src/shared/vehicle';
import { createBoundClient } from '../src/web/cloud/client';
import { MIGRATION_KEY, migrateLocalToCloud } from '../src/web/cloud/migration';
import { buildJobRecord } from '../src/web/jobs';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository } from '../src/web/storage';
import { shouldResetDraft, VehicleListLoader } from '../src/web/vehicleList';
import { MemoryKeyValueStore, type VehicleRepository } from '../src/web/vehicleRepository';
import { handleRouteRequest } from '../src/server/routeHandler';
import { clientId, deps, ledger, ROUTE } from './helpers';

const vehicle = (id: string, name: string): VehicleProfile => ({
  id,
  name,
  type: 'camioneta',
  fuel: 'gasolina',
  kmPerL: 10,
  wearPerKm: 30,
  createdAt: '',
  updatedAt: '',
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function repo(list: () => Promise<VehicleProfile[]>, defaultId: string | null = null): VehicleRepository {
  return {
    list,
    getDefaultId: async () => defaultId,
    get: async () => null,
    create: async () => {
      throw new Error('no');
    },
    update: async () => {
      throw new Error('no');
    },
    remove: async () => undefined,
    setDefault: async () => undefined,
  };
}

describe('P1 — la lista de vehículos nunca muestra los de otra cuenta', () => {
  it('carga de A que llega DESPUÉS de cambiar a B se descarta', async () => {
    const loader = new VehicleListLoader();
    const slowA = deferred<VehicleProfile[]>();
    const pA = loader.switchTo('A', repo(() => slowA.promise, 'a1'));
    const pB = loader.switchTo('B', repo(async () => [vehicle('b1', 'Furgón de B')]));
    expect(loader.getSnapshot()).toMatchObject({ owner: 'B' });
    await pB;
    slowA.resolve([vehicle('a1', 'Camioneta de A')]);
    expect(await pA).toBeNull();
    const s = loader.getSnapshot();
    expect(s.owner).toBe('B');
    expect(s.vehicles.map((v) => v.name)).toEqual(['Furgón de B']);
    expect(s.defaultId).toBeNull();
  });

  it('al cambiar de identidad la lista anterior desaparece al instante (antes de cargar la nueva)', async () => {
    const loader = new VehicleListLoader();
    await loader.switchTo('A', repo(async () => [vehicle('a1', 'Camioneta de A')], 'a1'));
    const pending = deferred<VehicleProfile[]>();
    void loader.switchTo('B', repo(() => pending.promise));
    expect(loader.getSnapshot()).toMatchObject({ owner: 'B', vehicles: [], defaultId: null });
    pending.resolve([]);
  });

  it('si la carga de B falla, la lista queda vacía (no quedan los de A)', async () => {
    const loader = new VehicleListLoader();
    await loader.switchTo('A', repo(async () => [vehicle('a1', 'Camioneta de A')], 'a1'));
    await loader.switchTo('B', repo(async () => Promise.reject(new Error('sin conexión'))));
    expect(loader.getSnapshot()).toMatchObject({ owner: 'B', vehicles: [], defaultId: null, failure: 'sin conexión' });
  });

  it('el borrador se reinicia al cerrar sesión o cambiar de cuenta, no al entrar desde anónimo', () => {
    expect(shouldResetDraft(undefined, null)).toBe(false); // apertura
    expect(shouldResetDraft(null, 'A')).toBe(false); // anónimo → A (misma persona)
    expect(shouldResetDraft('A', null)).toBe(true); // cerrar sesión
    expect(shouldResetDraft('A', 'B')).toBe(true); // otra cuenta
    expect(shouldResetDraft('A', 'A')).toBe(false);
  });
});

/** Cliente de Supabase falso: registra las llamadas y responde vacío. */
function fakeSupabase() {
  const rpc = vi.fn(async () => ({ data: 'nuevo-id', error: null }));
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'upsert', 'order', 'limit']) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { client: { rpc, from: () => chain } as never, rpc };
}

function localJob(n: number): JobRecord {
  return {
    id: `0000000${n}-0000-4000-8000-000000000000`,
    number: n,
    createdAt: '2026-11-18',
    clientName: `Cliente ${n}`,
    serviceDescription: 'Flete',
    includes: '',
    conditions: '',
    validUntil: '',
    serviceDate: '',
    originLabel: 'A',
    destinationLabel: 'B',
    netPrice: 1000,
    tax: null,
    status: 'borrador',
    payment: 'pendiente',
    waypoints: [],
    internal: {} as JobRecord['internal'],
  };
}

describe('P1 — la migración queda ligada a la sesión que la inició', () => {
  it('si la sesión cambia a mitad de la copia, se detiene y NO se marca como completa', async () => {
    const store = new MemoryKeyValueStore();
    const localQuotes = createQuoteRepository(store);
    for (const n of [1, 2, 3]) await localQuotes.create(localJob(n));
    const localVehicles = repo(async () => []);
    const { client, rpc } = fakeSupabase();
    let checks = 0;
    // Verdadero en la comprobación inicial y antes de la 1.ª cotización; luego «entra otra cuenta».
    const isCurrentUser = () => ++checks <= 2;
    await expect(
      migrateLocalToCloud({ supabase: client, userId: 'A', localQuotes, localVehicles, store, isCurrentUser }),
    ).rejects.toThrow(/sesión cambió/);
    expect(rpc).toHaveBeenCalledTimes(1); // nada más se escribió después del cambio
    expect(store.getItem(MIGRATION_KEY)).toBeNull(); // no se registró como migrada
    expect((await localQuotes.list()).length).toBe(3); // lo local sigue intacto
  });

  it('el cliente fijado envía SIEMPRE el token de quien inició la copia', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const h = new Headers(init.headers);
      seen.push(h.get('Authorization') ?? '');
      return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    const bound = createBoundClient('TOKEN-DE-A', { url: 'https://ejemplo.supabase.co', publishableKey: 'sb_publishable_0123456789abcdef', testPasswordLogin: false }, fetchImpl)!;
    await bound.rpc('create_job_with_quote', { p_job: {}, p_quote: {} });
    await bound.from('jobs').select('local_id');
    expect(seen).toEqual(['Bearer TOKEN-DE-A', 'Bearer TOKEN-DE-A']);
  });
});

describe('P2 — el guardado final exige el precio confirmado', () => {
  it('con el costo cambiado y el precio sin confirmar, no se arma el registro', async () => {
    const { ledger: l } = ledger();
    const { deps: d } = deps(l);
    const id = clientId();
    const client: RouteClient = { requestRoute: async (input) => (await handleRouteRequest(input, { clientId: id, ip: '9.9.9.1' }, d)).json };
    const s = new QuoteSession(client);
    s.setInputs({ origin: ROUTE.origin, destination: ROUTE.destination });
    s.setParams({ fuelPricePerL: 1200, kmPerL: 10 });
    await s.calculateRoute();
    s.setChosenPrice(60000);
    const form = { clientName: 'C', serviceDescription: '', includes: '', conditions: '', serviceDate: '', validUntil: '', originLabel: '', destinationLabel: '' };
    const issuer = { name: '', phone: '', email: '' };
    const meta = { id: 'x', number: 1, createdAt: '2026-11-18' };
    expect(buildJobRecord(s, form, issuer, meta)).not.toBeNull();
    s.setParams({ kmPerL: 6 }); // el costo cambia después de elegir el precio
    expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
    s.confirmPrice();
    expect(buildJobRecord(s, form, issuer, meta)).not.toBeNull();
  });
});
