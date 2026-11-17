/**
 * Contador persistente para Cloudflare (Durable Object).
 *
 * ESTADO: escrito y tipado, pero NO ejecutado en Cloudflare: no hay cuenta autorizada
 * (A-44). Todas las solicitudes de presupuesto van a una única instancia, que usa el
 * mismo BudgetLedger serializado que se prueba en `tests/budget.*.test.ts`.
 *
 * Se definen tipos mínimos para no depender de paquetes de Cloudflare en esta fase.
 */
import {
  BudgetLedger,
  type BudgetGate,
  type CounterStorage,
  type QuotaSnapshot,
  type ReservationRequest,
  type ReservationResult,
  type ServiceSwitch,
} from './ledger';

interface DurableStorageLike {
  get<T>(keys: string[]): Promise<Map<string, T>>;
  put<T>(entries: Record<string, T>): Promise<void>;
}
interface DurableStateLike {
  storage: DurableStorageLike;
}
interface DurableStubLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

class DurableCounterStorage implements CounterStorage {
  constructor(private readonly storage: DurableStorageLike) {}
  getMany(keys: string[]): Promise<Map<string, number>> {
    return this.storage.get<number>(keys);
  }
  putAll(entries: Record<string, number>): Promise<void> {
    // Una sola llamada `put` con varias claves es atómica en Durable Objects.
    return this.storage.put<number>(entries);
  }
}

export class RouteBudgetDurableObject {
  private readonly ledger: BudgetLedger;
  constructor(state: DurableStateLike) {
    this.ledger = new BudgetLedger(new DurableCounterStorage(state.storage));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/reserve') {
        const body = (await request.json()) as Omit<ReservationRequest, 'now'> & { now: string };
        const result = await this.ledger.reserve({ ...body, now: new Date(body.now) });
        return Response.json(result);
      }
      if (request.method === 'POST' && url.pathname === '/quota') {
        const body = (await request.json()) as { userKey: string; now: string };
        return Response.json(await this.ledger.quota(body.userKey, new Date(body.now)));
      }
      if (request.method === 'POST' && url.pathname === '/switch') {
        const body = (await request.json()) as { enabled?: unknown };
        if (typeof body.enabled !== 'boolean') return new Response('Solicitud inválida', { status: 400 });
        await this.ledger.setServiceEnabled(body.enabled);
        return Response.json({ enabled: await this.ledger.isServiceEnabled() });
      }
      if (request.method === 'GET' && url.pathname === '/switch') {
        return Response.json({ enabled: await this.ledger.isServiceEnabled() });
      }
      return new Response('No encontrado', { status: 404 });
    } catch {
      return new Response('Contador no disponible', { status: 503 });
    }
  }
}

/** Cliente del Worker hacia el Durable Object. Cualquier falla se propaga y el handler cierra. */
export class DurableObjectBudgetGate implements BudgetGate, ServiceSwitch {
  constructor(private readonly stub: DurableStubLike) {}

  async reserve(request: ReservationRequest): Promise<ReservationResult> {
    const res = await this.stub.fetch('https://budget/reserve', {
      method: 'POST',
      body: JSON.stringify({ ...request, now: request.now.toISOString() }),
    });
    if (!res.ok) throw new Error(`Contador respondió ${res.status}`);
    return (await res.json()) as ReservationResult;
  }

  async quota(userKey: string, now: Date): Promise<QuotaSnapshot> {
    const res = await this.stub.fetch('https://budget/quota', {
      method: 'POST',
      body: JSON.stringify({ userKey, now: now.toISOString() }),
    });
    if (!res.ok) throw new Error(`Contador respondió ${res.status}`);
    return (await res.json()) as QuotaSnapshot;
  }

  async setServiceEnabled(enabled: boolean): Promise<void> {
    const res = await this.stub.fetch('https://budget/switch', { method: 'POST', body: JSON.stringify({ enabled }) });
    if (!res.ok) throw new Error(`Contador respondió ${res.status}`);
  }

  async isServiceEnabled(): Promise<boolean> {
    const res = await this.stub.fetch('https://budget/switch', { method: 'GET' });
    if (!res.ok) throw new Error(`Contador respondió ${res.status}`);
    return ((await res.json()) as { enabled: boolean }).enabled;
  }
}
