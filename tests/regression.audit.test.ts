/**
 * Regresiones de la auditoría de ChatGPT al commit 6f73aaa (PR #34, comentario 6938602457).
 * Cada bloque reproduce un hallazgo; deben fallar con la versión auditada y pasar con la corrección.
 */
import { describe, expect, it, vi } from 'vitest';
import { GoogleRoutesProvider } from '../src/server/google/provider';
import { handleRouteRequest } from '../src/server/routeHandler';
import type { RouteApiResponse, RouteRequestInput, RouteResult } from '../src/shared/route';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { END_OF_MONTH, ROUTE, clientId, ledger } from './helpers';

function okRoute(input: RouteRequestInput, km: number, minutes: number): RouteApiResponse {
  const route: RouteResult = {
    kind: input.kind,
    source: 'google',
    legs: [{ from: 'A', to: 'B', distanceM: km * 1000, durationS: minutes * 60 }],
    totalDistanceM: km * 1000,
    totalDurationS: minutes * 60,
    warnings: [],
    computedAt: '2026-11-17T00:00:00Z',
    retention: { distance: 'sesion', duration: 'sesion' },
  };
  return { status: 'ok', route, quota: null };
}

/** Cliente cuyas respuestas se liberan a mano (para simular respuestas tardías). */
function deferredClient() {
  const pending: Array<{ input: RouteRequestInput; resolve: (r: RouteApiResponse) => void }> = [];
  const client: RouteClient = {
    requestRoute: vi.fn(
      (input: RouteRequestInput) =>
        new Promise<RouteApiResponse>((resolve) => {
          pending.push({ input, resolve });
        }),
    ),
  };
  return { client, pending };
}

const AB = { origin: 'Calle Uno 123, Ñuñoa', destination: 'Avenida Dos 456, Las Condes' };

describe('P0 — no se calcula ni se cotiza con una ruta de direcciones anteriores', () => {
  it('al cambiar B después de calcular, no hay cálculo hasta volver a consultar', async () => {
    const client: RouteClient = { requestRoute: vi.fn(async (input: RouteRequestInput) => okRoute(input, 25, 40)) };
    const s = new QuoteSession(client);
    s.setInputs(AB);
    await s.calculateRoute();
    expect(s.computation('habitual')).not.toBeNull();
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' });
    expect(s.computation('habitual')).toBeNull();
    expect(s.canQuote()).toBe(false);
  });

  it('cambiar la base o el regreso también invalida la ruta y la comparación', async () => {
    const client: RouteClient = { requestRoute: vi.fn(async (input: RouteRequestInput) => okRoute(input, 25, 40)) };
    const s = new QuoteSession(client);
    s.setInputs({ ...AB, base: 'Base 1, Maipú' });
    await s.calculateRoute();
    await s.compareWithoutTolls();
    expect(s.computation('evitarPeajes')).not.toBeNull();
    s.setInputs({ returnToBase: true });
    expect(s.computation('habitual')).toBeNull();
    expect(s.computation('evitarPeajes')).toBeNull();
  });

  it('en modo manual, cambiar una dirección invalida los km declarados para el recorrido anterior', () => {
    const s = new QuoteSession({ requestRoute: vi.fn() });
    s.setInputs(AB);
    s.useManual('habitual');
    s.setLegOverride('habitual', 0, { km: 20, minutes: 30 });
    expect(s.computation('habitual')).not.toBeNull();
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' });
    expect(s.computation('habitual')).toBeNull();
  });
});

describe('P0 — una respuesta tardía no sobrescribe un recorrido nuevo', () => {
  it('ruta habitual: se descarta la respuesta de A→B si mientras tanto B cambió', async () => {
    const { client, pending } = deferredClient();
    const s = new QuoteSession(client);
    s.setInputs(AB);
    const first = s.calculateRoute();
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' }); // edición durante la consulta
    pending[0]!.resolve(okRoute(pending[0]!.input, 25, 40));
    await first;
    expect(s.getSnapshot().habitual.route).toBeNull();
    expect(s.computation('habitual')).toBeNull();

    const second = s.calculateRoute(); // nuevo recorrido
    expect(pending).toHaveLength(2);
    expect(pending[1]!.input.destination).toBe('Pasaje Tres 789, Maipú');
    pending[1]!.resolve(okRoute(pending[1]!.input, 31, 50));
    await second;
    expect(s.computation('habitual')!.km).toBe(31);
  });

  it('respuesta vieja que llega DESPUÉS de la nueva no la reemplaza', async () => {
    const { client, pending } = deferredClient();
    const s = new QuoteSession(client);
    s.setInputs(AB);
    const first = s.calculateRoute();
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' });
    const second = s.calculateRoute();
    pending[1]!.resolve(okRoute(pending[1]!.input, 31, 50));
    await second;
    pending[0]!.resolve(okRoute(pending[0]!.input, 25, 40)); // llega tarde
    await first;
    expect(s.computation('habitual')!.km).toBe(31);
  });

  it('comparación: se descarta si el recorrido cambió durante la consulta', async () => {
    const { client, pending } = deferredClient();
    const s = new QuoteSession(client);
    s.setInputs(AB);
    const h = s.calculateRoute();
    pending[0]!.resolve(okRoute(pending[0]!.input, 25, 40));
    await h;
    const c = s.compareWithoutTolls();
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' });
    pending[1]!.resolve(okRoute(pending[1]!.input, 27, 45));
    await c;
    expect(s.getSnapshot().comparison.route).toBeNull();
    expect(s.computation('evitarPeajes')).toBeNull();
  });
});

describe('P1 — procedencia y retención por campo (km y minutos por separado)', () => {
  async function computed(mods: (s: QuoteSession) => void) {
    const client: RouteClient = {
      requestRoute: vi.fn(async (input: RouteRequestInput) => {
        const r = okRoute(input, 25, 40);
        if (r.status === 'ok') {
          r.route.legs = [
            { from: 'A', to: 'B', distanceM: 25000, durationS: 2400 },
            { from: 'B', to: 'base', distanceM: 10000, durationS: 900 },
          ];
        }
        return r;
      }),
    };
    const s = new QuoteSession(client);
    s.setInputs({ ...AB, base: 'Base 1, Maipú', returnToBase: true });
    await s.calculateRoute();
    mods(s);
    return s;
  }

  it('corregir solo km no vuelve «declarados» los minutos de Google', async () => {
    const s = await computed((x) => {
      x.setLegOverride('habitual', 0, { km: 26 });
      x.setLegOverride('habitual', 1, { km: 11 });
    });
    const c = s.computation('habitual')!;
    expect(c.legs[0]!.kmSource).toBe('declarado');
    expect(c.legs[0]!.minutesSource).toBe('google');
    expect(s.retainable('habitual')).toEqual({ km: true, minutes: false });
  });

  it('corregir solo minutos: los km siguen siendo de Google y no se guardan', async () => {
    const s = await computed((x) => {
      x.setLegOverride('habitual', 0, { minutes: 45 });
      x.setLegOverride('habitual', 1, { minutes: 20 });
    });
    expect(s.retainable('habitual')).toEqual({ km: false, minutes: true });
  });

  it('mezcla de tramos: si un solo tramo conserva km de Google, el total de km no se guarda', async () => {
    const s = await computed((x) => x.setLegOverride('habitual', 0, { km: 26, minutes: 45 }));
    expect(s.computation('habitual')!.source).toBe('mixto');
    expect(s.retainable('habitual')).toEqual({ km: false, minutes: false });
  });
});

describe('P1 — validación de la respuesta del proveedor', () => {
  const input: RouteRequestInput = { origin: ROUTE.origin, destination: ROUTE.destination, base: null, startAtBase: false, returnToBase: false, kind: 'habitual' };
  const provider = (legs: unknown) =>
    new GoogleRoutesProvider({
      apiKey: 'k',
      fetchImpl: (async () => new Response(JSON.stringify({ routes: [{ legs }] }), { status: 200 })) as unknown as typeof fetch,
    });

  it.each([
    ['sin duración', [{ distanceMeters: 13200 }]],
    ['duración mal formada', [{ distanceMeters: 13200, duration: 'veinte minutos' }]],
    ['duración cero con distancia positiva', [{ distanceMeters: 13200, duration: '0s' }]],
    ['distancia no numérica', [{ distanceMeters: 'mucho', duration: '600s' }]],
  ])('rechaza: %s', async (_name, legs) => {
    const out = await provider(legs).computeRoute(input);
    expect(out.ok).toBe(false);
  });

  it('el handler rechaza respuestas inválidas de cualquier proveedor sin reintentar', async () => {
    const { ledger: l, storage } = ledger();
    const bad = {
      name: 'simulado' as const,
      calls: 0,
      async computeRoute(i: RouteRequestInput) {
        this.calls += 1;
        const r = okRoute(i, 25, 40);
        if (r.status !== 'ok') throw new Error();
        r.route.legs = [{ from: 'A', to: 'B', distanceM: 25000, durationS: Number.NaN }];
        return { ok: true as const, route: r.route };
      },
    };
    const res = await handleRouteRequest(ROUTE, { clientId: clientId(), ip: '1.1.1.9' }, {
      config: { routesEnabled: true, originSalt: 's' },
      budget: l,
      provider: bad,
      clock: () => END_OF_MONTH,
    });
    expect(res.json).toMatchObject({ status: 'manual', reason: 'error_proveedor' });
    expect(bad.calls).toBe(1);
    expect((storage as unknown as { data: Map<string, number> }).data.get('g:2026-11')).toBe(1);
  });

  it('valores atípicos (velocidad implícita imposible) se aceptan solo con advertencia visible', async () => {
    const out = await provider([{ distanceMeters: 300000, duration: '600s' }]).computeRoute(input); // 1.800 km/h
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.route.warnings).toContainEqual({ code: 'tramo_atipico', leg: 0 });
  });
});

describe('P1/P2 — registro de la cotización', () => {
  const form = {
    clientName: 'Cliente',
    serviceDescription: 'Flete',
    includes: '',
    conditions: '',
    serviceDate: '',
    validUntil: '',
    originLabel: 'Ñuñoa',
    destinationLabel: 'Las Condes',
  };
  const meta = { id: 'x', number: 1, createdAt: '2026-11-17' };

  async function session(withOverride: Partial<{ km: number; minutes: number }>) {
    const client: RouteClient = { requestRoute: vi.fn(async (input: RouteRequestInput) => okRoute(input, 25, 40)) };
    const s = new QuoteSession(client);
    s.setInputs(AB);
    await s.calculateRoute();
    if (Object.keys(withOverride).length) s.setLegOverride('habitual', 0, withOverride);
    s.setChosenPrice(50000);
    return s;
  }

  it('solo km corregidos: se guardan los km, NO los minutos de Google', async () => {
    const { buildJobRecord } = await import('../src/web/jobs');
    const job = buildJobRecord(await session({ km: 26 }), form, { name: 'A', phone: '', email: '' }, meta)!;
    expect(job.internal.km).toBe(26);
    expect(job.internal.minutes).toBeNull();
  });

  it('sin correcciones: no se guardan km ni minutos del proveedor', async () => {
    const { buildJobRecord } = await import('../src/web/jobs');
    const job = buildJobRecord(await session({}), form, { name: 'A', phone: '', email: '' }, meta)!;
    expect(job.internal.km).toBeNull();
    expect(job.internal.minutes).toBeNull();
  });

  it('la cotización emitida conserva los datos del emisor aunque luego cambie el perfil', async () => {
    const { buildJobRecord } = await import('../src/web/jobs');
    const { toClientQuote } = await import('../src/shared/clientQuote');
    const job = buildJobRecord(await session({}), form, { name: 'Fletes Antiguo', phone: '111', email: 'a@x.cl' }, meta)!;
    const q = toClientQuote(job, { name: 'Fletes Nuevo', phone: '222', email: 'n@x.cl' });
    expect(q.businessName).toBe('Fletes Antiguo');
    expect(q.businessPhone).toBe('111');
  });

  it('con una ruta vieja no se puede construir el registro', async () => {
    const { buildJobRecord } = await import('../src/web/jobs');
    const s = await session({});
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' });
    expect(buildJobRecord(s, form, { name: 'A', phone: '', email: '' }, meta)).toBeNull();
  });
});

describe('Volver al recorrido ya calculado lo recupera sin consultar', () => {
  it('B → C → B: no hay nueva solicitud', async () => {
    const client: RouteClient = { requestRoute: vi.fn(async (input: RouteRequestInput) => okRoute(input, 25, 40)) };
    const s = new QuoteSession(client);
    s.setInputs(AB);
    await s.calculateRoute();
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' });
    s.setInputs({ destination: AB.destination });
    expect(s.computation('habitual')!.km).toBe(25);
    await s.calculateRoute();
    expect(client.requestRoute).toHaveBeenCalledTimes(1);
  });
});
