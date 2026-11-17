/**
 * Regresiones de la TERCERA revisión de ChatGPT (PR #34, commit 47229cc).
 * Sin red: proveedor simulado, contador en memoria y `fetch` falso para Google.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteBudgetDurableObject } from '../src/server/budget/durableObject';
import { handleRouteRequest } from '../src/server/routeHandler';
import worker, { type WorkerEnv } from '../src/server/worker';
import { MANUAL_MESSAGES, type RouteApiResponse, type RouteRequestInput } from '../src/shared/route';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { clientId, deps, ledger, ROUTE } from './helpers';

function fill(s: QuoteSession) {
  s.setInputs({ origin: ROUTE.origin, destination: ROUTE.destination });
}

/** Cliente cuya respuesta se entrega cuando la prueba decide (promesa diferida). */
function deferredClient() {
  const { ledger: l } = ledger();
  const { deps: d } = deps(l);
  const id = clientId();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const client: RouteClient = {
    requestRoute: vi.fn(async (input: RouteRequestInput): Promise<RouteApiResponse> => {
      const res = await handleRouteRequest(input, { clientId: id, ip: '8.8.8.1' }, d);
      await gate;
      return res.json;
    }),
  };
  return { client, release };
}

describe('P1 — elegir modo manual mientras la consulta está pendiente', () => {
  it('la respuesta tardía no reemplaza los km y minutos escritos a mano', async () => {
    const { client, release } = deferredClient();
    const s = new QuoteSession(client);
    fill(s);
    const pending = s.calculateRoute();
    expect(s.getSnapshot().habitual.status).toBe('cargando');

    s.useManual('habitual');
    s.setLegOverride('habitual', 0, { km: 28, minutes: 45 });
    release();
    await pending;

    const h = s.getSnapshot().habitual;
    expect(h.status).toBe('manual');
    expect(h.manualLegs[0]).toMatchObject({ km: 28, minutes: 45 });
    const c = s.computation('habitual')!;
    expect(c.km).toBe(28);
    expect(c.kmSource).toBe('declarado');
  });
});

describe('Reintento fallido: lo escrito a mano se conserva', () => {
  it('error → escribe 31,5 km → reintenta y vuelve a fallar → los 31,5 km siguen ahí', async () => {
    const fail: RouteApiResponse = { status: 'manual', reason: 'error_proveedor', message: MANUAL_MESSAGES.error_proveedor, quota: null };
    const client: RouteClient = { requestRoute: vi.fn().mockResolvedValue(fail) };
    const s = new QuoteSession(client);
    fill(s);
    await s.calculateRoute();
    s.setLegOverride('habitual', 0, { km: 31.5, minutes: 50 });
    await s.calculateRoute();
    expect(client.requestRoute).toHaveBeenCalledTimes(2);
    const h = s.getSnapshot().habitual;
    expect(h).toMatchObject({ status: 'manual', manualReason: 'error_proveedor' });
    expect(h.manualLegs[0]).toMatchObject({ km: 31.5, minutes: 50 });
  });
});

describe('P1 — rotación de la clave de Google en el mismo isolate', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('una clave nueva del mismo largo se usa en la siguiente solicitud', async () => {
    const usedKeys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        usedKeys.push((init.headers as Record<string, string>)['X-Goog-Api-Key']!);
        return new Response(JSON.stringify({ routes: [{ legs: [{ distanceMeters: 12000, duration: '1200s' }] }] }), { status: 200 });
      }),
    );
    const storage = new Map<string, unknown>();
    const durable = new RouteBudgetDurableObject({
      storage: {
        async get<T>(keys: string[]) {
          const out = new Map<string, T>();
          for (const k of keys) if (storage.has(k)) out.set(k, storage.get(k) as T);
          return out;
        },
        async put<T>(entries: Record<string, T>) {
          for (const [k, v] of Object.entries(entries)) storage.set(k, v);
        },
      },
    });
    const stub = { fetch: (input: string, init?: RequestInit) => durable.fetch(new Request(input, init)) };
    const base: WorkerEnv = {
      ASSETS: { fetch: async () => new Response('app') },
      ROUTE_BUDGET: { idFromName: () => 'global', get: () => stub },
      ROUTES_PROVIDER: 'google',
      ROUTES_ENABLED: 'true',
      GOOGLE_ROUTES_ENABLED: 'true',
    };
    const KEY_A = 'clave-falsa-AAAAAAAAAAAAAAAAAAAA';
    const KEY_B = 'clave-falsa-BBBBBBBBBBBBBBBBBBBB'; // mismo largo
    const call = (key: string) =>
      worker.fetch(
        new Request('https://app.test/api/route', {
          method: 'POST',
          headers: { 'X-Client-Id': clientId(), 'CF-Connecting-IP': '6.6.6.6' },
          body: JSON.stringify(ROUTE),
        }),
        { ...base, GOOGLE_ROUTES_API_KEY: key },
      );

    expect((await call(KEY_A)).status).toBe(200);
    expect((await call(KEY_B)).status).toBe(200);
    expect(usedKeys).toEqual([KEY_A, KEY_B]);
  });
});

describe('P2 — reconfirmar el precio ante cualquier cambio de costo', () => {
  async function priced() {
    const { ledger: l } = ledger();
    const { deps: d, provider } = deps(l);
    const id = clientId();
    const s = new QuoteSession({
      requestRoute: async (input) => (await handleRouteRequest(input, { clientId: id, ip: '8.8.8.2' }, d)).json,
    });
    fill(s);
    s.setParams({ fuelPricePerL: 1200, kmPerL: 10 });
    await s.calculateRoute();
    s.setChosenPrice(60000);
    return { s, provider };
  }

  it('cambiar un parámetro aunque el costo redondeado quede igual exige confirmar', async () => {
    const { s } = await priced();
    const before = Math.round(s.computation('habitual')!.measures.cost.value);
    s.setParams({ kmPerL: 10.0000001 });
    expect(Math.round(s.computation('habitual')!.measures.cost.value)).toBe(before);
    expect(s.priceNeedsConfirmation()).toBe(true);
  });

  it('cambiar de vehículo con los mismos valores exige confirmar', async () => {
    const { s } = await priced();
    const profile = { id: 'v1', name: 'Uno', type: 'camioneta' as const, fuel: 'gasolina' as const, kmPerL: 10, wearPerKm: null, createdAt: '', updatedAt: '' };
    s.selectVehicle(profile);
    expect(s.priceNeedsConfirmation()).toBe(true);
  });

  it('margen y recargos no exigen confirmar, y nada de esto consulta otra ruta', async () => {
    const { s, provider } = await priced();
    s.setMargin(0.25);
    s.setSurcharges(5000);
    expect(s.priceNeedsConfirmation()).toBe(false);
    expect(provider.calls).toBe(1);
  });
});
