import { describe, expect, it, vi } from 'vitest';
import { toClientQuote } from '../src/shared/clientQuote';
import type { RouteApiResponse, RouteRequestInput } from '../src/shared/route';
import type { VehicleInput } from '../src/shared/vehicle';
import { buildJobRecord } from '../src/web/jobs';
import { QuoteSession, type RouteClient } from '../src/web/session';
import {
  LocalVehicleRepository,
  MemoryKeyValueStore,
  VEHICLES_KEY,
  VehicleNotFoundError,
  VehicleValidationError,
} from '../src/web/vehicleRepository';

let n = 0;
function repo(store = new MemoryKeyValueStore()) {
  return {
    store,
    repo: new LocalVehicleRepository(store, { newId: () => `v${++n}`, now: () => new Date('2026-11-17T12:00:00Z') }),
  };
}

const camioneta: VehicleInput = { name: 'Camioneta blanca', type: 'camioneta', fuel: 'gasolina', kmPerL: 12, wearPerKm: 31 };
const furgon: VehicleInput = { name: 'Furgón', type: 'furgon', fuel: 'diesel', kmPerL: 9, wearPerKm: 45 };
const sinDatos: VehicleInput = { name: 'Camión nuevo', type: 'camionLiviano', fuel: 'diesel', kmPerL: null, wearPerKm: null };

describe('Crear, editar y eliminar vehículos', () => {
  it('crea, edita y elimina', async () => {
    const { repo: r } = repo();
    const v = await r.create(camioneta);
    expect(v).toMatchObject({ ...camioneta });
    expect(await r.list()).toHaveLength(1);

    const edited = await r.update(v.id, { ...camioneta, name: 'Camioneta roja', kmPerL: 11.5 });
    expect(edited).toMatchObject({ id: v.id, name: 'Camioneta roja', kmPerL: 11.5 });
    expect((await r.get(v.id))!.name).toBe('Camioneta roja');

    await r.remove(v.id);
    expect(await r.list()).toHaveLength(0);
    await expect(r.remove(v.id)).rejects.toBeInstanceOf(VehicleNotFoundError);
    await expect(r.update(v.id, camioneta)).rejects.toBeInstanceOf(VehicleNotFoundError);
  });

  it('rechaza datos inválidos con mensajes por campo', async () => {
    const { repo: r } = repo();
    await expect(r.create({ ...camioneta, name: '   ' })).rejects.toBeInstanceOf(VehicleValidationError);
    try {
      await r.create({ ...camioneta, kmPerL: 0, wearPerKm: -5 });
    } catch (e) {
      expect((e as VehicleValidationError).issues).toMatchObject({ kmPerL: expect.any(String), wearPerKm: expect.any(String) });
    }
    await expect(r.create({ ...camioneta, type: 'avion' } as unknown as VehicleInput)).rejects.toBeInstanceOf(VehicleValidationError);
    expect(await r.list()).toHaveLength(0);
  });

  it('acepta rendimiento y desgaste faltantes (null), sin inventar valores', async () => {
    const { repo: r } = repo();
    const v = await r.create(sinDatos);
    expect(v.kmPerL).toBeNull();
    expect(v.wearPerKm).toBeNull();
  });

  it('lo que devuelve el repositorio es una copia: modificarla no altera lo guardado', async () => {
    const { repo: r } = repo();
    const v = await r.create(camioneta);
    v.kmPerL = 99;
    expect((await r.get(v.id))!.kmPerL).toBe(12);
  });
});

describe('Vehículo predeterminado', () => {
  it('el primero queda como predeterminado; se puede cambiar y quitar', async () => {
    const { repo: r } = repo();
    const a = await r.create(camioneta);
    const b = await r.create(furgon);
    expect(await r.getDefaultId()).toBe(a.id);
    await r.setDefault(b.id);
    expect(await r.getDefaultId()).toBe(b.id);
    await r.setDefault(null);
    expect(await r.getDefaultId()).toBeNull();
    await expect(r.setDefault('no-existe')).rejects.toBeInstanceOf(VehicleNotFoundError);
  });

  it('eliminar el predeterminado deja sin predeterminado (no elige otro a escondidas)', async () => {
    const { repo: r } = repo();
    const a = await r.create(camioneta);
    await r.create(furgon);
    await r.remove(a.id);
    expect(await r.getDefaultId()).toBeNull();
  });
});

describe('Recuperar perfiles guardados', () => {
  it('otra instancia sobre el mismo almacenamiento (recarga de página) recupera vehículos y predeterminado', async () => {
    const { repo: r, store } = repo();
    await r.create(camioneta);
    const b = await r.create(furgon);
    await r.setDefault(b.id);
    const { repo: r2 } = repo(store);
    expect((await r2.list()).map((v) => v.name)).toEqual(['Camioneta blanca', 'Furgón']);
    expect(await r2.getDefaultId()).toBe(b.id);
  });

  it('datos dañados no rompen la app: lista vacía', async () => {
    const store = new MemoryKeyValueStore();
    store.setItem(VEHICLES_KEY, '{esto no es json');
    const { repo: r } = repo(store);
    expect(await r.list()).toEqual([]);
    expect(await r.getDefaultId()).toBeNull();
  });
});

function client(): RouteClient {
  return {
    requestRoute: vi.fn(async (input: RouteRequestInput): Promise<RouteApiResponse> => ({
      status: 'ok',
      quota: null,
      route: {
        kind: input.kind,
        source: 'simulado',
        legs: [{ from: 'A', to: 'B', distanceM: 57400, durationS: 74 * 60 }],
        totalDistanceM: 57400,
        totalDurationS: 74 * 60,
        warnings: [],
        computedAt: '2026-11-17T00:00:00Z',
        retention: { distance: 'sesion', duration: 'sesion' },
      },
    })),
  };
}

async function readySession() {
  const c = client();
  const s = new QuoteSession(c);
  s.setInputs({ origin: 'Calle Uno 123, Ñuñoa', destination: 'Avenida Dos 456, Las Condes' });
  await s.calculateRoute();
  s.setParams({ fuelPricePerL: 1050, ownerPerHour: 6000, tolls: 4200, otherCosts: 2000, helpers: 1, helperFee: 15000 });
  return { s, c };
}

describe('Integración con el cotizador', () => {
  it('elegir un vehículo carga rendimiento y desgaste; no toca combustible, remuneración, peajes ni otros gastos; no consulta rutas', async () => {
    const { repo: r } = repo();
    const v = await r.create(camioneta);
    const { s, c } = await readySession();
    s.selectVehicle(v);
    expect(s.getSnapshot().params).toMatchObject({
      kmPerL: 12,
      wearPerKm: 31,
      fuelPricePerL: 1050,
      ownerPerHour: 6000,
      tolls: 4200,
      otherCosts: 2000,
      helpers: 1,
      helperFee: 15000,
    });
    const fuel = s.computation('habitual')!.items.find((i) => i.id === 'combustible')!.amount!;
    expect(fuel).toBeCloseTo((57.4 / 12) * 1050);
    expect(c.requestRoute).toHaveBeenCalledTimes(1);
  });

  it('al cambiar de vehículo se usan los datos del nuevo (aunque se hubiera ajustado el anterior)', async () => {
    const { repo: r } = repo();
    const a = await r.create(camioneta);
    const b = await r.create(furgon);
    const { s } = await readySession();
    s.selectVehicle(a);
    s.setParams({ kmPerL: 10 }); // ajuste puntual
    s.selectVehicle(b);
    expect(s.getSnapshot().params.kmPerL).toBe(9);
    expect(s.getSnapshot().params.wearPerKm).toBe(45);
    expect(s.getSnapshot().vehicle!.name).toBe('Furgón');
    expect(s.computation('habitual')!.items.find((i) => i.id === 'desgaste')!.amount).toBeCloseTo(57.4 * 45);
  });

  it('modificar la cotización no altera el vehículo guardado y se puede restaurar', async () => {
    const { repo: r } = repo();
    const v = await r.create(camioneta);
    const { s } = await readySession();
    s.selectVehicle(v);
    s.setParams({ kmPerL: 10, wearPerKm: 40 });
    expect(s.vehicleAdjustments()).toEqual(['kmPerL', 'wearPerKm']);
    expect(await r.get(v.id)).toMatchObject({ kmPerL: 12, wearPerKm: 31 });
    expect(s.getSnapshot().vehicle).toMatchObject({ kmPerL: 12, wearPerKm: 31 });
    s.restoreVehicleValues();
    expect(s.vehicleAdjustments()).toEqual([]);
    expect(s.getSnapshot().params).toMatchObject({ kmPerL: 12, wearPerKm: 31 });
  });

  it('editar el vehículo guardado después no cambia una cotización en curso', async () => {
    const { repo: r } = repo();
    const v = await r.create(camioneta);
    const { s } = await readySession();
    s.selectVehicle(v);
    await r.update(v.id, { ...camioneta, kmPerL: 8 });
    expect(s.getSnapshot().params.kmPerL).toBe(12);
  });

  it('valores faltantes del vehículo quedan faltantes: costo parcial, nunca 0', async () => {
    const { repo: r } = repo();
    const v = await r.create(sinDatos);
    const { s } = await readySession();
    s.setParams({ kmPerL: 12, wearPerKm: 31 }); // valores previos
    s.selectVehicle(v);
    expect(s.getSnapshot().params.kmPerL).toBeNull();
    expect(s.getSnapshot().params.wearPerKm).toBeNull();
    const m = s.computation('habitual')!.measures;
    expect(m.complete).toBe(false);
    expect(m.missing).toEqual(expect.arrayContaining(['combustible', 'desgaste']));
    expect(m.cost.type).toBe('cotaInferior');
  });

  it('dejar de usar el vehículo conserva los valores actuales de la cotización', async () => {
    const { repo: r } = repo();
    const v = await r.create(camioneta);
    const { s } = await readySession();
    s.selectVehicle(v);
    s.selectVehicle(null);
    expect(s.getSnapshot().vehicle).toBeNull();
    expect(s.getSnapshot().params.kmPerL).toBe(12);
  });

  it('la cotización registra el vehículo internamente, pero el cliente no lo ve', async () => {
    const { repo: r } = repo();
    const v = await r.create(camioneta);
    const { s } = await readySession();
    s.selectVehicle(v);
    s.setParams({ kmPerL: 10 });
    s.setChosenPrice(55000);
    const job = buildJobRecord(
      s,
      { clientName: 'C', serviceDescription: 'Flete', includes: '', conditions: '', serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Las Condes' },
      { name: 'Fletes', phone: '', email: '' },
      { id: 'j', number: 1, createdAt: '2026-11-17' },
    )!;
    expect(job.internal.vehicle).toMatchObject({ name: 'Camioneta blanca', kmPerL: 10, wearPerKm: 31, adjusted: ['kmPerL'] });
    const text = JSON.stringify(toClientQuote(job));
    expect(text).not.toContain('Camioneta blanca');
    expect(text).not.toContain('kmPerL');
  });
});
