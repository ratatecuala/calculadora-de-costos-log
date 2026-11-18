/**
 * Regresiones de la SEXTA auditoría de ChatGPT (PR #34, commit 974deb3).
 * P1: el guardado normal de una cotización queda fijado a la sesión que lo inició.
 * P2: nada de otra identidad se muestra en el render, aunque el efecto aún no haya corrido.
 * Sin red: clientes de Supabase falsos que registran qué token usa cada solicitud.
 */
import { describe, expect, it } from 'vitest';
import type { JobRecord } from '../src/shared/clientQuote';
import { CloudQuoteRepository } from '../src/web/cloud/quotes';
import { saveQuote } from '../src/web/saveQuote';
import { createQuoteRepository } from '../src/web/storage';
import { draftVisibleTo, visibleVehicleState, type VehicleListState } from '../src/web/vehicleList';
import { MemoryKeyValueStore } from '../src/web/vehicleRepository';

interface Call {
  token: string;
  op: string;
}

/**
 * Cliente falso. `token` identifica la sesión con la que viaja cada solicitud.
 * `gate` permite demorar la respuesta de upsert en `profiles` (datos comerciales).
 */
function fakeClient(token: string, calls: Call[], opts: { sessionUser?: () => string; gate?: Promise<void> } = {}) {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const done = (op: string, data: unknown) => {
      calls.push({ token, op: `${table}.${op}` });
      return { data, error: null };
    };
    b.select = () => b;
    b.order = () => b;
    b.eq = () => b;
    b.limit = async () => done('select', [{ number: 4 }]);
    b.maybeSingle = async () => done('select', null);
    b.upsert = async () => {
      if (opts.gate) await opts.gate;
      return done('upsert', null);
    };
    return b;
  };
  return {
    from: (table: string) => builder(table),
    rpc: async (fn: string) => {
      calls.push({ token, op: `rpc.${fn}` });
      return { data: 'id-nube', error: null };
    },
    auth: {
      getSession: async () => ({ data: { session: { access_token: token, user: { id: opts.sessionUser?.() ?? 'A' } } } }),
    },
  } as never;
}

const job = (number: number): JobRecord =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    number,
    createdAt: '2026-11-18',
    clientName: 'Cliente de A',
    serviceDescription: '',
    includes: '',
    conditions: '',
    validUntil: '',
    serviceDate: '',
    originLabel: '',
    destinationLabel: '',
    netPrice: 60000,
    tax: null,
    status: 'borrador',
    payment: 'pendiente',
    waypoints: [],
    internal: {} as JobRecord['internal'],
  }) as JobRecord;

const business = { name: 'Negocio de A', phone: '', email: '' };

describe('P1 — guardar una cotización queda ligado a la sesión que lo inició', () => {
  it('si la cuenta cambia a B mientras se guardan los datos comerciales, NO se crea la cotización (ni con B ni con A)', async () => {
    const calls: Call[] = [];
    let current = 'A';
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    // El cliente compartido sigue la sesión de la app: primero A, luego B.
    const shared = fakeClient('TOKEN-COMPARTIDO', calls, { sessionUser: () => current });
    const repo = new CloudQuoteRepository(shared, 'A', {
      isCurrentUser: () => current === 'A',
      bindClient: (token) => fakeClient(`FIJADO:${token}`, calls, { gate }),
    });

    const pending = saveQuote(repo, (n) => job(n), business);
    await new Promise((r) => setTimeout(r, 0)); // el guardado ya espera la respuesta de saveBusiness
    current = 'B'; // sale A y entra B en la misma pestaña
    release();

    await expect(pending).rejects.toThrow(/La sesión cambió mientras se guardaba/);
    expect(calls.some((c) => c.op === 'rpc.create_job_with_quote')).toBe(false);
    // Nada viajó por el cliente compartido (que ahora sería de B): todo fue con el token de A.
    expect(calls.filter((c) => c.token === 'TOKEN-COMPARTIDO')).toEqual([]);
  });

  it('secuencia del formulario anterior (número → datos comerciales → crear): con B ya activa, crear se niega y no llama a la RPC', async () => {
    const calls: Call[] = [];
    let current = 'A';
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const shared = fakeClient('TOKEN-COMPARTIDO', calls, { sessionUser: () => current, gate });
    const repo = new CloudQuoteRepository(shared, 'A', { isCurrentUser: () => current === 'A' });
    const n = await repo.nextNumber();
    const saving = repo.saveBusiness(business);
    current = 'B';
    release();
    await saving;
    await expect(repo.create(job(n))).rejects.toThrow(/La sesión cambió mientras se guardaba/);
    expect(calls.some((c) => c.op === 'rpc.create_job_with_quote')).toBe(false);
  });

  it('con la sesión estable, todos los pasos usan el token de quien empezó (nunca el cliente compartido)', async () => {
    const calls: Call[] = [];
    const shared = fakeClient('TOKEN-COMPARTIDO', calls);
    const repo = new CloudQuoteRepository(shared, 'A', {
      isCurrentUser: () => true,
      bindClient: (token) => fakeClient(`FIJADO:${token}`, calls),
    });
    const result = await saveQuote(repo, (n) => job(n), business);
    expect(result).toMatchObject({ status: 'guardada', job: { id: 'id-nube', number: 5 } });
    expect(calls.map((c) => c.op)).toEqual(['jobs.select', 'profiles.upsert', 'rpc.create_job_with_quote']);
    expect(new Set(calls.map((c) => c.token))).toEqual(new Set(['FIJADO:TOKEN-COMPARTIDO']));
  });

  it('si la sesión del cliente ya es de otra cuenta al empezar, no se escribe nada', async () => {
    const calls: Call[] = [];
    const shared = fakeClient('TOKEN-DE-B', calls, { sessionUser: () => 'B' });
    const repo = new CloudQuoteRepository(shared, 'A', { isCurrentUser: () => true, bindClient: (t) => fakeClient(t, calls) });
    await expect(saveQuote(repo, (n) => job(n), business)).rejects.toThrow(/La sesión cambió mientras se guardaba/);
    expect(calls).toEqual([]);
  });

  it('sin cuenta (navegador) el guardado sigue igual', async () => {
    const local = createQuoteRepository(new MemoryKeyValueStore());
    expect(await local.forWrite()).toBe(local);
    const result = await saveQuote(local, (n) => job(n), business);
    expect(result).toMatchObject({ status: 'guardada', job: { number: 1 } });
    expect((await local.list()).length).toBe(1);
  });
});

describe('P2 — nada de otra identidad se muestra en el render', () => {
  const stateOfA: VehicleListState = {
    owner: 'A',
    vehicles: [{ id: 'a1', name: 'Camioneta de A', type: 'camioneta', fuel: 'gasolina', kmPerL: 10, wearPerKm: 30, createdAt: '', updatedAt: '' }],
    defaultId: 'a1',
    failure: null,
    loading: false,
  };

  it('si el estado aún es de A pero la identidad ya es B (o anónima), se muestra vacío', () => {
    expect(visibleVehicleState(stateOfA, 'B')).toMatchObject({ owner: 'B', vehicles: [], defaultId: null });
    expect(visibleVehicleState(stateOfA, 'local')).toMatchObject({ vehicles: [], defaultId: null });
    expect(visibleVehicleState(stateOfA, 'A')).toBe(stateOfA);
  });

  it('el borrador de A no se muestra a B ni al cerrar sesión; sí al pasar de anónimo a una cuenta', () => {
    expect(draftVisibleTo('A', 'B')).toBe(false);
    expect(draftVisibleTo('A', 'local')).toBe(false);
    expect(draftVisibleTo('local', 'A')).toBe(true);
    expect(draftVisibleTo('A', 'A')).toBe(true);
  });
});
