import { describe, expect, it, vi } from 'vitest';
import { GoogleRoutesProvider } from '../src/server/google/provider';
import {
  ESSENTIALS_FIELD_MASK,
  SkuNotAllowedError,
  assertEssentialsOnly,
  buildComputeRoutesBody,
  classifySku,
} from '../src/server/google/template';
import type { RouteRequestInput } from '../src/shared/route';

const input: RouteRequestInput = {
  origin: 'Calle Uno 123, Ñuñoa',
  destination: 'Avenida Dos 456, Las Condes',
  base: 'Base 1, Maipú',
  startAtBase: true,
  returnToBase: true,
  kind: 'habitual',
};

const okResponse = () =>
  new Response(
    JSON.stringify({
      routes: [{ legs: [{ distanceMeters: 18200, duration: '1440s' }, { distanceMeters: 13200, duration: '1200s' }, { distanceMeters: 26000, duration: '1800s' }] }],
      geocodingResults: { origin: {}, destination: {}, intermediates: [{ partialMatch: true }, {}] },
    }),
    { status: 200 },
  );

describe('Prueba 5 — Pro y Enterprise están bloqueados', () => {
  it('la plantilla genera solo Essentials: TRAFFIC_UNAWARE, sin peajes, field mask fija', () => {
    const body = buildComputeRoutesBody(input);
    expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
    expect(body.intermediates).toHaveLength(2);
    expect(classifySku(body as unknown as Record<string, unknown>, ESSENTIALS_FIELD_MASK)).toBe('essentials');
    expect(() => assertEssentialsOnly(body as unknown as Record<string, unknown>, ESSENTIALS_FIELD_MASK)).not.toThrow();
    const avoid = buildComputeRoutesBody({ ...input, kind: 'evitarPeajes' });
    expect(avoid.routeModifiers).toEqual({ avoidTolls: true });
    expect(() => assertEssentialsOnly(avoid as unknown as Record<string, unknown>, ESSENTIALS_FIELD_MASK)).not.toThrow();
  });

  const base = () => ({ ...buildComputeRoutesBody(input) }) as unknown as Record<string, unknown>;
  const cases: Array<[string, Record<string, unknown>, string, 'pro' | 'enterprise' | 'essentials']> = [
    ['tráfico TRAFFIC_AWARE (Pro)', { ...base(), routingPreference: 'TRAFFIC_AWARE' }, ESSENTIALS_FIELD_MASK, 'pro'],
    ['tráfico TRAFFIC_AWARE_OPTIMAL (Pro)', { ...base(), routingPreference: 'TRAFFIC_AWARE_OPTIMAL' }, ESSENTIALS_FIELD_MASK, 'pro'],
    ['optimizar paradas (Pro)', { ...base(), optimizeWaypointOrder: true }, ESSENTIALS_FIELD_MASK, 'pro'],
    ['peajes extraComputations TOLLS (Enterprise)', { ...base(), extraComputations: ['TOLLS'] }, ESSENTIALS_FIELD_MASK, 'enterprise'],
    ['field mask con tollInfo (Enterprise)', base(), `${ESSENTIALS_FIELD_MASK},routes.travelAdvisory.tollInfo`, 'enterprise'],
    ['field mask con travelAdvisory (Pro)', base(), `${ESSENTIALS_FIELD_MASK},routes.travelAdvisory`, 'pro'],
    ['hora de salida (campo no permitido)', { ...base(), departureTime: '2026-11-18T12:00:00Z' }, ESSENTIALS_FIELD_MASK, 'essentials'],
    ['rutas alternativas (campo no permitido)', { ...base(), computeAlternativeRoutes: true }, ESSENTIALS_FIELD_MASK, 'essentials'],
    ['modificador no permitido', { ...base(), routeModifiers: { avoidTolls: true, avoidHighways: true } }, ESSENTIALS_FIELD_MASK, 'essentials'],
    ['más de 2 intermedios', { ...base(), intermediates: [{ address: 'a' }, { address: 'b' }, { address: 'c' }] }, ESSENTIALS_FIELD_MASK, 'essentials'],
  ];
  for (const [name, body, mask, expectedSku] of cases) {
    it(`rechaza: ${name}`, () => {
      expect(classifySku(body, mask)).toBe(expectedSku);
      expect(() => assertEssentialsOnly(body, mask)).toThrow(SkuNotAllowedError);
    });
  }

  it('el adaptador Google solo envía la plantilla Essentials (fetch simulado, sin red)', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => okResponse());
    const provider = new GoogleRoutesProvider({ apiKey: 'clave-de-prueba', fetchImpl: fetchImpl as unknown as typeof fetch });
    const outcome = await provider.computeRoute(input);
    expect(outcome.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe(ESSENTIALS_FIELD_MASK);
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(classifySku(sent, headers['X-Goog-FieldMask']!)).toBe('essentials');
    expect(sent).not.toHaveProperty('extraComputations');
    if (outcome.ok) {
      expect(outcome.route.source).toBe('google');
      expect(outcome.route.legs.map((l) => l.distanceM)).toEqual([18200, 13200, 26000]);
      expect(outcome.route.warnings).toContainEqual({ code: 'coincidencia_parcial', point: 'A' });
      expect(outcome.route.retention).toEqual({ distance: 'sesion', duration: 'sesion' });
    }
  });

  it('errores 5xx y fallas de red son reintentables; 4xx no', async () => {
    const make = (impl: () => Promise<Response>) =>
      new GoogleRoutesProvider({ apiKey: 'k', fetchImpl: impl as unknown as typeof fetch }).computeRoute(input);
    expect(await make(async () => new Response('', { status: 503 }))).toMatchObject({ ok: false, retryable: true });
    expect(await make(async () => new Response('', { status: 429 }))).toMatchObject({ ok: false, retryable: false });
    expect(
      await make(async () => {
        throw new Error('red');
      }),
    ).toMatchObject({ ok: false, retryable: true });
  });
});
