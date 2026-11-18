/**
 * Regresiones de la SEGUNDA auditoría de ChatGPT (PR #34).
 * P1-1: reintento explícito tras un fallo transitorio.
 * P1-2: el interruptor global se aplica en caliente (sin reiniciar el isolate).
 * Más: confirmación de precio, errores de guardado visibles.
 * Nada de esto llama a servicios externos: proveedor simulado y contador en memoria.
 */
import { describe, expect, it, vi } from 'vitest';
import { BudgetLedger, MemoryCounterStorage, SWITCH_KEY } from '../src/server/budget/ledger';
import { RouteBudgetDurableObject } from '../src/server/budget/durableObject';
import { handleRouteRequest, type RouteHandlerDeps } from '../src/server/routeHandler';
import worker, { type WorkerEnv } from '../src/server/worker';
import type { BusinessProfile, JobRecord } from '../src/shared/clientQuote';
import { MANUAL_MESSAGES, type RouteApiResponse, type RouteRequestInput } from '../src/shared/route';
import { MemoryKeyValueStore } from '../src/web/vehicleRepository';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository, JOBS_KEY, QuoteStorageError } from '../src/web/storage';
import { clientId, deps, END_OF_MONTH, globalUsed, ledger, policy, ROUTE } from './helpers';

/** Libro en memoria con acceso tipado a los contadores. */
function memLedger() {
  const storage = new MemoryCounterStorage();
  return { ledger: new BudgetLedger(storage, { policy: policy() }), storage };
}

function handlerClient(d: RouteHandlerDeps) {
  const id = clientId();
  const client: RouteClient = {
    requestRoute: vi.fn(async (input: RouteRequestInput): Promise<RouteApiResponse> => (await handleRouteRequest(input, { clientId: id, ip: '7.7.7.7' }, d)).json),
  };
  return client;
}

function manualResponse(reason: keyof typeof MANUAL_MESSAGES): RouteApiResponse {
  return { status: 'manual', reason, message: MANUAL_MESSAGES[reason], quota: null };
}

function fill(s: QuoteSession) {
  s.setInputs({ origin: ROUTE.origin, destination: ROUTE.destination });
}

describe('P1-1 — reintento explícito tras un fallo transitorio', () => {
  it('error del servicio → presionar «Calcular ruta» otra vez consulta y consume una reserva nueva', async () => {
    const { ledger: l, storage } = memLedger();
    // Falla 2 veces: la consulta inicial y su reintento interno del servidor.
    const { deps: d, provider } = deps(l, { failFirst: 2 });
    const client = handlerClient(d);
    const s = new QuoteSession(client);
    fill(s);

    await s.calculateRoute();
    expect(s.getSnapshot().habitual).toMatchObject({ status: 'manual', manualReason: 'error_proveedor' });
    expect(globalUsed(storage)).toBe(2);

    await s.calculateRoute(); // reintento explícito del usuario
    expect(client.requestRoute).toHaveBeenCalledTimes(2);
    expect(provider.calls).toBe(3);
    expect(globalUsed(storage)).toBe(3); // la nueva consulta reservó cupo
    expect(s.getSnapshot().habitual.status).toBe('listo');
    expect(s.computation('habitual')).not.toBeNull();
  });

  it('contador no disponible → el reintento explícito vuelve a consultar', async () => {
    const { ledger: l } = ledger();
    const { deps: d } = deps(l);
    const real = handlerClient(d);
    const client: RouteClient = {
      requestRoute: vi.fn().mockResolvedValueOnce(manualResponse('contador_no_disponible')).mockImplementation(real.requestRoute),
    };
    const s = new QuoteSession(client);
    fill(s);
    await s.calculateRoute();
    expect(s.getSnapshot().habitual.manualReason).toBe('contador_no_disponible');
    await s.calculateRoute();
    expect(client.requestRoute).toHaveBeenCalledTimes(2);
    expect(s.getSnapshot().habitual.status).toBe('listo');
  });

  it('los km y minutos escritos en modo manual se conservan si el reintento tiene éxito', async () => {
    const { ledger: l } = ledger();
    const { deps: d } = deps(l, { failFirst: 2 });
    const s = new QuoteSession(handlerClient(d));
    fill(s);
    await s.calculateRoute();
    s.setLegOverride('habitual', 0, { km: 31.5 });
    await s.calculateRoute();
    const c = s.computation('habitual')!;
    expect(s.getSnapshot().habitual.status).toBe('listo');
    expect(c.legs[0]).toMatchObject({ km: 31.5, kmSource: 'declarado' });
    expect(c.legs[0]!.minutesSource).not.toBe('declarado'); // los minutos sí vienen del servicio
  });

  it('cupo agotado o límite del usuario: presionar otra vez NO consulta', async () => {
    for (const reason of ['cupo_agotado', 'limite_usuario'] as const) {
      const client: RouteClient = { requestRoute: vi.fn().mockResolvedValue(manualResponse(reason)) };
      const s = new QuoteSession(client);
      fill(s);
      await s.calculateRoute();
      await s.calculateRoute();
      expect(client.requestRoute).toHaveBeenCalledTimes(1);
    }
  });

  it('límite de comparaciones: volver a comparar el mismo recorrido NO consulta', async () => {
    const { ledger: l } = ledger({ comparisonsPerUserDaily: 0 });
    const { deps: d } = deps(l);
    const client = handlerClient(d);
    const s = new QuoteSession(client);
    fill(s);
    await s.calculateRoute();
    await s.compareWithoutTolls();
    expect(s.getSnapshot().comparison.manualReason).toBe('limite_comparaciones');
    await s.compareWithoutTolls();
    expect(client.requestRoute).toHaveBeenCalledTimes(2); // ruta + 1 comparación denegada
  });

  it('una ruta ya calculada sigue sin repetirse (sin cambios de recorrido)', async () => {
    const { ledger: l } = ledger();
    const { deps: d, provider } = deps(l);
    const s = new QuoteSession(handlerClient(d));
    fill(s);
    await s.calculateRoute();
    await s.calculateRoute();
    expect(provider.calls).toBe(1);
  });
});

/** Almacenamiento de Durable Object en memoria (misma forma que la API de Cloudflare). */
class MemoryDurableStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(keys: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const k of keys) if (this.data.has(k)) out.set(k, this.data.get(k) as T);
    return out;
  }
  async put<T>(entries: Record<string, T>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) this.data.set(k, v);
  }
}

function fakeEnv(extra: Record<string, string> = {}) {
  const storage = new MemoryDurableStorage();
  const object = new RouteBudgetDurableObject({ storage });
  const stub = { fetch: (input: string, init?: RequestInit) => object.fetch(new Request(input, init)) };
  const namespace = { idFromName: () => 'global', get: () => stub };
  const assets = { fetch: async () => new Response('app') };
  const env: WorkerEnv = { ASSETS: assets, ROUTE_BUDGET: namespace, ...extra };
  return { env, storage };
}

function routeRequest(id = clientId()) {
  return new Request('https://app.test/api/route', {
    method: 'POST',
    headers: { 'X-Client-Id': id, 'CF-Connecting-IP': '5.5.5.5' },
    body: JSON.stringify(ROUTE),
  });
}

const ADMIN = 'token-de-prueba-solo-para-tests-0123456789';

describe('P1-2 — interruptor global en caliente', () => {
  it('el ledger deniega con «servicio_apagado» (también reintentos) sin consumir cupo', async () => {
    const { ledger: l, storage } = memLedger();
    await l.setServiceEnabled(false);
    for (const kind of ['ruta', 'comparacion', 'reintento'] as const) {
      expect(await l.reserve({ kind, userKey: 'u', originKey: 'o', now: END_OF_MONTH })).toEqual({ ok: false, reason: 'servicio_apagado' });
    }
    expect(globalUsed(storage)).toBe(0);
    await l.setServiceEnabled(true);
    expect(await l.reserve({ kind: 'ruta', userKey: 'u', originKey: 'o', now: END_OF_MONTH })).toMatchObject({ ok: true });
  });

  it('apagar a mitad de una consulta corta el reintento interno', async () => {
    const storage = new MemoryCounterStorage();
    const l = new BudgetLedger(storage);
    const { deps: d, provider } = deps(l, { failFirst: 1 });
    const original = provider.computeRoute.bind(provider);
    provider.computeRoute = async (input) => {
      const out = await original(input);
      await l.setServiceEnabled(false); // se apaga mientras el proveedor respondía
      return out;
    };
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '4.4.4.4' }, d);
    expect(res).toMatchObject({ httpStatus: 503, json: { status: 'manual', reason: 'servicio_apagado' } });
    expect(provider.calls).toBe(1);
  });

  it('Worker: cambiar ROUTES_ENABLED surte efecto en la siguiente solicitud del MISMO isolate', async () => {
    const { env } = fakeEnv({ ROUTES_ENABLED: 'true' });
    const on = await worker.fetch(routeRequest(), env);
    expect(((await on.json()) as RouteApiResponse).status).toBe('ok');

    const off = await worker.fetch(routeRequest(), { ...env, ROUTES_ENABLED: 'false' });
    expect(off.status).toBe(503);
    expect(await off.json()).toMatchObject({ status: 'manual', reason: 'servicio_apagado' });

    const back = await worker.fetch(routeRequest(), env);
    expect(((await back.json()) as RouteApiResponse).status).toBe('ok');
  });

  it('Worker: el interruptor del contador apaga y enciende sin redesplegar (con token de administración)', async () => {
    const { env, storage } = fakeEnv({ ADMIN_TOKEN: ADMIN });
    const admin = (enabled: boolean, token = ADMIN) =>
      worker.fetch(
        new Request('https://app.test/api/admin/routes', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ enabled }) }),
        env,
      );

    expect((await admin(false)).status).toBe(200);
    expect(storage.data.get(SWITCH_KEY)).toBe(1);
    const denied = await worker.fetch(routeRequest(), env);
    expect(denied.status).toBe(503);
    expect(await denied.json()).toMatchObject({ reason: 'servicio_apagado' });
    expect(storage.data.get('g:2026-11') ?? 0).toBe(0); // no se consumió cupo

    expect((await admin(true)).status).toBe(200);
    expect(((await (await worker.fetch(routeRequest(), env)).json()) as RouteApiResponse).status).toBe('ok');
  });

  it('Worker: la ruta de administración exige token y no existe sin ADMIN_TOKEN', async () => {
    const post = (env: WorkerEnv, auth?: string) =>
      worker.fetch(
        new Request('https://app.test/api/admin/routes', {
          method: 'POST',
          headers: auth ? { Authorization: auth } : {},
          body: JSON.stringify({ enabled: false }),
        }),
        env,
      );
    expect((await post(fakeEnv().env, `Bearer ${ADMIN}`)).status).toBe(404); // sin token configurado
    expect((await post(fakeEnv({ ADMIN_TOKEN: 'corto' }).env, 'Bearer corto')).status).toBe(404); // token débil = desactivado
    const { env, storage } = fakeEnv({ ADMIN_TOKEN: ADMIN });
    expect((await post(env)).status).toBe(401);
    expect((await post(env, 'Bearer otro-token-cualquiera-de-largo-similar-000')).status).toBe(401);
    expect(storage.data.has(SWITCH_KEY)).toBe(false);
  });

  it('la deduplicación sigue funcionando aunque las dependencias se armen en cada solicitud', async () => {
    const { ledger: l, storage } = memLedger();
    const { deps: base, provider } = deps(l);
    const id = clientId();
    const fresh = (): RouteHandlerDeps => ({ ...base, config: { ...base.config } });
    await Promise.all([1, 2, 3].map(() => handleRouteRequest(ROUTE, { clientId: id, ip: '3.3.3.3' }, fresh())));
    expect(provider.calls).toBe(1);
    expect(globalUsed(storage)).toBe(1);
  });
});

describe('Precio: confirmar cuando cambia el costo', () => {
  it('cambiar un parámetro de costo después de elegir el precio exige confirmarlo', async () => {
    const { ledger: l } = ledger();
    const { deps: d } = deps(l);
    const s = new QuoteSession(handlerClient(d));
    fill(s);
    s.setParams({ fuelPricePerL: 1200, kmPerL: 10 });
    await s.calculateRoute();
    s.setChosenPrice(60000);
    expect(s.canQuote()).toBe(true);

    s.setParams({ kmPerL: 6 }); // otro vehículo o rendimiento: cambia el costo
    expect(s.priceNeedsConfirmation()).toBe(true);
    expect(s.canQuote()).toBe(false);

    s.confirmPrice();
    expect(s.canQuote()).toBe(true);
  });

  it('cambiar solo el margen sugerido no exige confirmar (el costo no cambia)', async () => {
    const { ledger: l } = ledger();
    const { deps: d } = deps(l);
    const s = new QuoteSession(handlerClient(d));
    fill(s);
    s.setParams({ fuelPricePerL: 1200, kmPerL: 10 });
    await s.calculateRoute();
    s.setChosenPrice(60000);
    s.setMargin(0.2);
    expect(s.priceNeedsConfirmation()).toBe(false);
    expect(s.canQuote()).toBe(true);
  });
});

describe('Guardado local: los fallos ya no se ocultan', () => {
  const failing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  const business: BusinessProfile = { name: 'Mi negocio', phone: '', email: '' };

  it('si el navegador no puede escribir, create y saveBusiness fallan con QuoteStorageError', async () => {
    const repo = createQuoteRepository(failing);
    await expect(repo.create({ id: 'x', number: 1 } as JobRecord)).rejects.toThrow(QuoteStorageError);
    await expect(repo.saveBusiness(business)).rejects.toThrow(QuoteStorageError);
  });

  it('con almacenamiento sano guarda, recupera y cambia estado y pago', async () => {
    const store = new MemoryKeyValueStore();
    const repo = createQuoteRepository(store);
    await repo.create({ id: 'a', number: 1, status: 'borrador', payment: 'pendiente' } as JobRecord);
    expect(await repo.get('a')).toMatchObject({ number: 1 });
    expect(store.getItem(JOBS_KEY)).toContain('"a"');
    expect(repo.persistent).toBe(true);
    expect(repo.kind).toBe('local');
    await repo.update('a', { status: 'aceptada', payment: 'recibido' });
    expect(await repo.get('a')).toMatchObject({ status: 'aceptada', payment: 'recibido' });
    expect(await repo.nextNumber()).toBe(2);
  });
});
