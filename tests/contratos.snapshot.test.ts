/**
 * Fase 0 (A-63) · Contrato del snapshot versionado (docs/21 §6).
 * C2: `readSnapshot` lee las cotizaciones actuales (v1) y no modifica nada.
 * H4: una cotización v1 con carga y descarga 0 se muestra igual que antes (no se reinterpreta).
 * L1 (parte pura): `toCloudPayload` deja el `internal` v1 idéntico al flujo actual.
 * Además: el registro que produce HOY `buildJobRecord` sigue siendo un v1 legible.
 */
import { describe, expect, it, vi } from 'vitest';
import { readSnapshot, snapshotV2Schema, toCloudPayload } from '../src/shared/snapshot';
import { MAX_CARGO_ITEMS } from '../src/shared/cargo';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { buildJobRecord } from '../src/web/jobs';
import type { RouteApiResponse, RouteRequestInput, RouteResult } from '../src/shared/route';
import fixturesV1 from './fixtures/snapshots-v1.json';

type CasoV1 = { nombre: string; internal: Record<string, unknown> };
const casosV1 = fixturesV1.casos as CasoV1[];

function congelar<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v as object).forEach(congelar);
    Object.freeze(v);
  }
  return v;
}

const item = (i: number) => ({
  kind: 'cajas',
  description: `Caja ficticia ${i}`,
  qty: 1,
  unitWeightKg: 10,
  dimsCm: { l: 50, w: 40, h: 40 },
  volumeM3: 0.08,
  volumeSource: 'calculado',
  fragile: false,
  handling: 'normal',
});

function snapshotV2(n: number) {
  return {
    schemaVersion: 2,
    formulaVersion: 'motor-1.0.1',
    routeSource: 'simulado',
    km: null,
    minutes: null,
    costEstimate: 41234.5,
    costType: 'cotaInferior',
    suggestedPrice: 51543,
    margin: 0.2,
    missing: ['tiempoCargaPendiente'],
    engineVersion: 'motor-1.0.1',
    vehicle: {
      id: 'veh-ficticio-1',
      name: 'Camioneta ficticia',
      type: 'camioneta',
      fuel: 'diesel',
      kmPerL: 11.5,
      wearPerKm: null,
      adjusted: [],
      catalogId: null,
      catalogDataVersion: null,
      make: null,
      model: null,
      modelYear: null,
      version: null,
      payloadKg: 1000,
      cargoVolumeM3: null,
    },
    cargo: {
      mode: 'detallado',
      summary: 'Mudanza ficticia',
      totals: { weightKg: 10 * n, volumeM3: 0.08 * n, lines: n, linesWithWeight: n, linesWithVolume: n },
      capacity: { minTrips: 1, basis: 'peso', incomplete: false },
      handling: { minutes: 30, complete: false, missingStops: ['B'] },
      items: Array.from({ length: n }, (_, i) => item(i + 1)),
    },
    resources: {
      stops: [
        { role: 'A', floor: 4, elevator: 'no', stairs: true, carryMeters: 20, access: '', loadMinutes: 30 },
        { role: 'B', floor: null, elevator: null, stairs: null, carryMeters: null, access: '', loadMinutes: null },
      ],
      helpers: [{ id: '11111111-1111-4111-8111-111111111111', mode: 'servicio', feeService: 25000 }],
      equipment: [],
    },
  };
}

describe('C2 · cotizaciones v1 actuales', () => {
  it.each(casosV1.map((c) => [c.nombre, c] as const))('%s: se lee sin modificar nada', (_n, c) => {
    const original = structuredClone(c.internal);
    const raw = congelar(structuredClone(c.internal)); // cualquier escritura lanzaría un error
    const r = readSnapshot(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sourceVersion).toBe(1);
    expect(raw).toEqual(original);
    // Los datos de costo se muestran exactamente como se guardaron.
    for (const k of ['routeSource', 'km', 'minutes', 'costEstimate', 'costType', 'suggestedPrice', 'margin', 'missing', 'engineVersion']) {
      expect(r.view[k as keyof typeof r.view]).toEqual(original[k]);
    }
    expect(r.view.cargo).toBeNull();
    expect(r.view.resources).toBeNull();
    expect(r.view.formulaVersion).toBeNull();
    // La vista es una copia: modificarla no toca el registro.
    r.view.missing.push('x');
    expect(raw.missing).toEqual(original.missing);
  });

  it('H4 · carga y descarga 0 en v1: no se reinterpreta como tiempo incompleto ni se recalcula', () => {
    const c = casosV1.find((x) => x.nombre.includes('H4'))!;
    const r = readSnapshot(c.internal);
    expect(r.ok && r.view.costEstimate).toBe(c.internal.costEstimate);
    expect(r.ok && r.view.costType).toBe('estimado');
    expect(r.ok && r.view.cargo).toBeNull(); // sin `handling`: no hay «falta el tiempo de carga»
  });

  it('el vehículo v1 se muestra igual, con los datos del catálogo en null', () => {
    const c = casosV1.find((x) => x.nombre.startsWith('vehículo completo'))!;
    const r = readSnapshot(c.internal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.vehicle).toMatchObject(c.internal.vehicle as object);
    expect(r.view.vehicle?.payloadKg).toBeNull();
    expect(r.view.vehicle?.catalogId).toBeNull();
  });

  it('el registro que produce HOY la aplicación sigue siendo un v1 legible', async () => {
    const route: RouteResult = {
      kind: 'habitual',
      source: 'google',
      legs: [{ from: 'A', to: 'B', distanceM: 25000, durationS: 2400 }],
      totalDistanceM: 25000,
      totalDurationS: 2400,
      warnings: [],
      computedAt: '2026-11-20T00:00:00Z',
      retention: { distance: 'sesion', duration: 'sesion' },
    };
    const client: RouteClient = {
      requestRoute: vi.fn(async (input: RouteRequestInput): Promise<RouteApiResponse> => ({
        status: 'ok',
        route: { ...route, kind: input.kind },
        quota: null,
      })),
    };
    const s = new QuoteSession(client);
    s.setInputs({ origin: 'Calle Ficticia 123, Ñuñoa', destination: 'Pasaje Ficticio 456, Las Condes' });
    await s.calculateRoute();
    s.setChosenPrice(50000);
    const job = buildJobRecord(
      s,
      { clientName: 'C', serviceDescription: 'F', includes: '', conditions: '', serviceDate: '', validUntil: '', originLabel: 'O', destinationLabel: 'D' },
      { name: 'A', phone: '', email: '' },
      { id: 'x', number: 1, createdAt: '2026-11-20' },
    );
    expect(job).not.toBeNull();
    const r = readSnapshot(job!.internal);
    expect(r.ok).toBe(true);
    expect(r.ok && r.sourceVersion).toBe(1);
    expect('schemaVersion' in job!.internal).toBe(false); // la fase 0 NO cambia lo que se guarda
  });

  it('un snapshot ilegible o de versión desconocida no lanza: devuelve el motivo', () => {
    expect(readSnapshot(null)).toMatchObject({ ok: false });
    expect(readSnapshot([])).toMatchObject({ ok: false });
    expect(readSnapshot({ costEstimate: 'mucho' })).toMatchObject({ ok: false });
    expect(readSnapshot({ ...casosV1[0]!.internal, schemaVersion: 3 })).toMatchObject({ ok: false, reason: expect.stringContaining('3') });
  });
});

describe('Snapshot v2', () => {
  it('se valida y se lee como versión 2 sin modificar la entrada', () => {
    const raw = congelar(snapshotV2(3));
    const r = readSnapshot(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sourceVersion).toBe(2);
    expect(r.view.cargo?.items).toHaveLength(3);
    expect(r.view.formulaVersion).toBe('motor-1.0.1');
    expect(raw).toEqual(snapshotV2(3));
  });

  it('acepta 200 líneas y rechaza 201 (T-1)', () => {
    expect(snapshotV2Schema.safeParse(snapshotV2(MAX_CARGO_ITEMS)).success).toBe(true);
    expect(snapshotV2Schema.safeParse(snapshotV2(MAX_CARGO_ITEMS + 1)).success).toBe(false);
  });

  it('una cotización v2 sin inventario ni recursos es válida', () => {
    expect(snapshotV2Schema.safeParse({ ...snapshotV2(0), cargo: null, resources: null }).success).toBe(true);
  });

  it('rechaza una línea inválida dentro del snapshot', () => {
    const s = snapshotV2(2);
    s.cargo.items[1]!.volumeM3 = 1.0; // volumen «calculado» incoherente
    expect(readSnapshot(s).ok).toBe(false);
  });
});

describe('toCloudPayload · D-4 = (b) (A-61)', () => {
  it('L1 · v1: internal idéntico al flujo actual y sin líneas', () => {
    for (const c of casosV1) {
      const raw = congelar(structuredClone(c.internal));
      const p = toCloudPayload(raw);
      expect(p).toEqual({ ok: true, internal: c.internal, cargoItems: [] });
      if (p.ok) expect(p.internal).not.toBe(raw); // copia, no la misma referencia
    }
  });

  it('v2: las líneas viajan completas aparte y el internal conserva solo el resumen', () => {
    const raw = congelar(snapshotV2(120));
    const p = toCloudPayload(raw);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.cargoItems).toHaveLength(120);
    expect(p.cargoItems[0]).toEqual(item(1));
    const cargo = p.internal.cargo as Record<string, unknown>;
    expect(cargo).not.toHaveProperty('items');
    expect(cargo.totals).toEqual(raw.cargo.totals);
    expect(cargo.handling).toEqual(raw.cargo.handling);
    expect(raw.cargo.items).toHaveLength(120); // el registro local queda intacto
    // El resumen sin líneas es pequeño (docs/21 §7: ~2,5 KB con la opción b).
    expect(JSON.stringify(p.internal).length).toBeLessThan(4096);
  });

  it('un snapshot inválido no se copia', () => {
    const s = snapshotV2(1);
    s.cargo.items[0]!.qty = 0;
    expect(toCloudPayload(s)).toMatchObject({ ok: false });
  });
});
