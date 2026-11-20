import { describe, expect, it, vi } from 'vitest';
import { handleRouteRequest } from '../src/server/routeHandler';
import type { RouteApiResponse, RouteRequestInput } from '../src/shared/route';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { clientId, deps, ledger } from './helpers';

/** Cliente que pasa por el handler real (contador + proveedor simulado), sin red. */
function handlerClient(policyOverrides = {}) {
  const { ledger: l } = ledger(policyOverrides);
  const { deps: d, provider } = deps(l);
  const id = clientId();
  const client: RouteClient = {
    requestRoute: vi.fn(async (input: RouteRequestInput): Promise<RouteApiResponse> => (await handleRouteRequest(input, { clientId: id, ip: '9.9.9.9' }, d)).json),
  };
  return { client, provider };
}

function fill(session: QuoteSession) {
  session.setInputs({ origin: 'Calle Uno 123, Ñuñoa', destination: 'Avenida Dos 456, Las Condes' });
}

describe('Prueba 6 — editar precio o parámetros no genera otra solicitud de ruta', () => {
  it('escribir direcciones no consulta; solo «Calcular ruta» lo hace', async () => {
    const { client } = handlerClient();
    const s = new QuoteSession(client);
    for (const ch of 'Calle Uno 123, Ñuñoa') s.setInputs({ origin: (s.getSnapshot().inputs.origin + ch).trimStart() });
    s.setInputs({ destination: 'Avenida Dos 456, Las Condes' });
    expect(client.requestRoute).toHaveBeenCalledTimes(0);
    await s.calculateRoute();
    expect(client.requestRoute).toHaveBeenCalledTimes(1);
  });

  it('cambiar combustible, ayudantes, margen, peajes o precio recalcula sin consultar', async () => {
    const { client, provider } = handlerClient();
    const s = new QuoteSession(client);
    fill(s);
    await s.calculateRoute();
    const before = s.computation('habitual')!;
    s.setParams({ fuelPricePerL: 1050, kmPerL: 12 });
    s.setParams({ helpers: 1, helperFee: 15000 });
    s.setMargin(0.2);
    s.setParams({ tolls: 4200 });
    s.setChosenPrice(55000);
    s.setSurcharges(2000);
    const after = s.computation('habitual')!;
    expect(after.measures.cost.value).not.toBe(before.measures.cost.value);
    await s.calculateRoute(); // mismo recorrido: no repite
    expect(client.requestRoute).toHaveBeenCalledTimes(1);
    expect(provider.calls).toBe(1);
    expect(s.getSnapshot().routeRequests).toBe(1);
  });

  it('cambiar una dirección marca el resultado como desactualizado y solo consulta al pedirlo', async () => {
    const { client } = handlerClient();
    const s = new QuoteSession(client);
    fill(s);
    await s.calculateRoute();
    s.setInputs({ destination: 'Pasaje Tres 789, Maipú' });
    expect(s.getSnapshot().habitual.status).toBe('desactualizado');
    expect(client.requestRoute).toHaveBeenCalledTimes(1);
    await s.calculateRoute();
    expect(client.requestRoute).toHaveBeenCalledTimes(2);
  });

  it('la comparación sin peajes es 1 llamada adicional y solo con la ruta habitual vigente', async () => {
    const { client } = handlerClient();
    const s = new QuoteSession(client);
    fill(s);
    await s.compareWithoutTolls(); // sin ruta habitual: no consulta
    expect(client.requestRoute).toHaveBeenCalledTimes(0);
    await s.calculateRoute();
    await s.compareWithoutTolls();
    await s.compareWithoutTolls(); // repetida: no consulta
    expect(client.requestRoute).toHaveBeenCalledTimes(2);
    expect(s.getSnapshot().comparison.route?.kind).toBe('evitarPeajes');
    expect(s.getSnapshot().quota).toEqual({ comparisonsLeftToday: 2, comparisonsLeftMonth: 9 });
  });

  it('corregir km de un tramo cambia la procedencia a «declarado» sin consultar', async () => {
    const { client } = handlerClient();
    const s = new QuoteSession(client);
    fill(s);
    await s.calculateRoute();
    expect(s.computation('habitual')!.source).toBe('simulado');
    s.setLegOverride('habitual', 0, { km: 20 });
    const c = s.computation('habitual')!;
    expect(c.legs[0]!.kmSource).toBe('declarado');
    expect(c.legs[0]!.minutesSource).toBe('simulado');
    expect(c.km).toBe(20);
    expect(client.requestRoute).toHaveBeenCalledTimes(1);
  });
});

describe('Prueba 7 (navegador) — al agotarse el cupo se activa el modo manual', () => {
  it('respuesta de cupo agotado → modo manual con tramos a completar; el cálculo usa datos declarados', async () => {
    const { client } = handlerClient({ operationalMonthly: 0, emergencyMonthly: 0 });
    const s = new QuoteSession(client);
    s.setInputs({ origin: 'Calle Uno 123, Ñuñoa', destination: 'Avenida Dos 456, Las Condes', base: 'Base 1, Maipú', startAtBase: true });
    await s.calculateRoute();
    const h = s.getSnapshot().habitual;
    expect(h.status).toBe('manual');
    expect(h.manualReason).toBe('cupo_agotado');
    expect(h.manualLegs.map((l) => `${l.from}>${l.to}`)).toEqual(['base>A', 'A>B']);
    expect(s.computation('habitual')).toBeNull(); // faltan km y minutos
    s.setLegOverride('habitual', 0, { km: 18.2, minutes: 24 });
    s.setLegOverride('habitual', 1, { km: 13.2, minutes: 20 });
    const c = s.computation('habitual')!;
    expect(c.source).toBe('declarado');
    expect(c.km).toBeCloseTo(31.4);
    await s.calculateRoute(); // mismo recorrido en modo manual: no reintenta solo
    expect(client.requestRoute).toHaveBeenCalledTimes(1);
  });

  it('error de red del navegador → modo manual', async () => {
    const client: RouteClient = { requestRoute: vi.fn(async () => Promise.reject(new Error('sin conexión'))) };
    const s = new QuoteSession(client);
    fill(s);
    await s.calculateRoute();
    expect(s.getSnapshot().habitual).toMatchObject({ status: 'manual', manualReason: 'error_proveedor' });
  });
});
