/**
 * D-I8 parcial (A-69, docs/22 §12 punto 1): el borrador recupera SOLO el recorrido manual.
 * - km y minutos escritos a mano, ligados a las direcciones y tramos con que se escribieron;
 * - aviso «Recorrido recuperado: revisa los kilómetros y minutos»;
 * - cambiar las direcciones invalida el recorrido recuperado (no vuelve solo);
 * - nunca se recupera el precio ni su confirmación;
 * - nunca se guardan datos del proveedor ni correcciones sobre rutas automáticas (punto 2, sin autorizar);
 * - el motor económico y las cotizaciones históricas no cambian.
 * Sin red: clientes de ruta falsos.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RouteApiResponse, RouteRequestInput } from '../src/shared/route';
import { DRAFT_KEY, DraftStore } from '../src/web/draftStore';
import { buildJobRecord } from '../src/web/jobs';
import { QuoteSession, RECOVERED_ROUTE_MESSAGE, type AddressInputs, type DraftData, type RouteClient } from '../src/web/session';
import { createQuoteRepository } from '../src/web/storage';
import { MemoryKeyValueStore } from '../src/web/vehicleRepository';

const noRoutes: RouteClient = {
  requestRoute: vi.fn(async () => {
    throw new Error('sin red en las pruebas');
  }),
};

/** Cliente que responde una ruta «del proveedor» con datos reconocibles (para buscarlos en el borrador). */
function providerClient(): RouteClient {
  return {
    requestRoute: vi.fn(async (input: RouteRequestInput): Promise<RouteApiResponse> => {
      const roles = (['base', 'A', 'B', 'base'] as const).filter((_, i) => (i === 0 ? input.startAtBase : i === 3 ? input.returnToBase : true));
      const legs = roles.slice(0, -1).map((from, i) => ({ from, to: roles[i + 1]!, distanceM: 98765 + i, durationS: 4321 + i }));
      return {
        status: 'ok',
        quota: { comparisonsLeftToday: 2, comparisonsLeftMonth: 9 },
        route: {
          kind: input.kind,
          source: 'simulado',
          legs,
          totalDistanceM: legs.reduce((s, l) => s + l.distanceM, 0),
          totalDurationS: legs.reduce((s, l) => s + l.durationS, 0),
          warnings: [{ code: 'tramo_atipico', leg: 0 }],
          computedAt: '2026-11-21T00:00:00Z',
          retention: { distance: 'sesion', duration: 'sesion' },
        },
      };
    }),
  };
}

const PARAMS = { fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 2, helperFee: 15000, loadMinutes: 60, tolls: 0 };
const A_B: Partial<AddressInputs> = { origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' };
const BASE_A_B: Partial<AddressInputs> = { ...A_B, base: 'Base Ficticia 3, La Florida', startAtBase: true };
const BASE_A_B_BASE: Partial<AddressInputs> = { ...BASE_A_B, returnToBase: true };

/** Sesión con recorrido manual de N tramos, costos y precio confirmado. */
function manual(inputs: Partial<AddressInputs>, legs: Array<[number | null, number | null]>): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs(inputs);
  s.useManual('habitual');
  legs.forEach(([km, minutes], i) => s.setLegOverride('habitual', i, { km, minutes }));
  s.setParams(PARAMS);
  s.setChosenPrice(80000);
  return s;
}

/** Guarda el borrador como el autoguardado y lo recupera en una sesión nueva («recarga»). */
function recargar(s: QuoteSession, store = new MemoryKeyValueStore()): QuoteSession {
  const ds = new DraftStore(store);
  expect(ds.write('local', s.draftData()).ok).toBe(true);
  const r = ds.read('local');
  expect(r.status).toBe('ok');
  const nueva = new QuoteSession(noRoutes);
  if (r.status === 'ok') nueva.restoreDraft(r.draft.data);
  return nueva;
}

/** Escribe en el almacenamiento un borrador arbitrario (simula uno manipulado o de otra versión). */
function guardarCrudo(store: MemoryKeyValueStore, data: unknown): void {
  store.setItem(DRAFT_KEY, JSON.stringify({ local: { format: 1, savedAt: '2026-11-21T00:00:00Z', data } }));
}

const PROVIDER_MARKERS = ['distanceM', 'durationS', 'retention', 'computedAt', 'simulado', 'warnings', 'quota', '98765', '4321', 'chosenPrice', 'priceBasis', '80000'];

// ---------------------------------------------------------------------------
describe('D-I8 · recuperar el recorrido manual con distintos números de tramos', () => {
  const casos: Array<{ nombre: string; inputs: Partial<AddressInputs>; legs: Array<[number, number]>; roles: string[] }> = [
    { nombre: '1 tramo (A → B)', inputs: A_B, legs: [[25, 40]], roles: ['A>B'] },
    { nombre: '2 tramos (base → A → B)', inputs: BASE_A_B, legs: [[8.5, 15], [25, 40]], roles: ['base>A', 'A>B'] },
    { nombre: '3 tramos (base → A → B → base)', inputs: BASE_A_B_BASE, legs: [[8.5, 15], [25, 40], [31.2, 47]], roles: ['base>A', 'A>B', 'B>base'] },
  ];

  for (const c of casos) {
    it(`${c.nombre}: vuelven los km y minutos, con el aviso, sin precio`, () => {
      const original = manual(c.inputs, c.legs);
      const nueva = recargar(original);
      const h = nueva.getSnapshot().habitual;
      expect(h.status).toBe('manual');
      expect(h.recovered).toBe(true);
      expect(h.message).toBe(RECOVERED_ROUTE_MESSAGE);
      expect(h.message).toBe('Recorrido recuperado: revisa los kilómetros y minutos');
      expect(h.manualLegs.map((l) => `${l.from}>${l.to}`)).toEqual(c.roles);
      expect(h.manualLegs.map((l) => [l.km, l.minutes])).toEqual(c.legs);
      // El costo se calcula con esos km y minutos, igual que antes de recargar.
      const antes = original.computation('habitual')!;
      const despues = nueva.computation('habitual')!;
      expect(despues.km).toBe(antes.km);
      expect(despues.minutes).toBe(antes.minutes);
      expect(despues.items).toEqual(antes.items);
      expect(despues.source).toBe('declarado');
      // El precio y su confirmación NO vuelven: hay que escribirlo y confirmarlo de nuevo.
      expect(nueva.getSnapshot().chosenPrice).toBeNull();
      expect(nueva.getSnapshot().priceBasis).toBeNull();
      expect(nueva.canQuote()).toBe(false);
      nueva.setChosenPrice(80000);
      expect(nueva.canQuote()).toBe(true);
    });
  }

  it('tramos a medio escribir: vuelven tal cual (null sigue siendo null, nunca 0) y el costo queda pendiente', () => {
    const nueva = recargar(manual(BASE_A_B, [[8.5, null], [null, 40]]));
    const h = nueva.getSnapshot().habitual;
    expect(h.status).toBe('manual');
    expect(h.manualLegs.map((l) => [l.km, l.minutes])).toEqual([[8.5, null], [null, 40]]);
    expect(nueva.computation('habitual')).toBeNull();
  });

  it('el modo manual sin ningún valor escrito no se guarda como recorrido', () => {
    const s = new QuoteSession(noRoutes);
    s.setInputs(A_B);
    s.useManual('habitual');
    expect(s.draftData().manualRoute).toBeNull();
    expect(recargar(s).getSnapshot().habitual.status).toBe('vacio');
  });

  it('después de recuperar se puede corregir un tramo, y el autoguardado guarda la corrección', () => {
    const nueva = recargar(manual(A_B, [[25, 40]]));
    nueva.setLegOverride('habitual', 0, { km: 27 });
    expect(nueva.draftData().manualRoute?.legs).toEqual([{ from: 'A', to: 'B', km: 27, minutes: 40 }]);
    expect(recargar(nueva).getSnapshot().habitual.manualLegs[0]).toMatchObject({ km: 27, minutes: 40 });
  });

  it('recuperar cuenta como trabajo del usuario: hay contenido de borrador', () => {
    const nueva = recargar(manual(A_B, [[25, 40]]));
    expect(nueva.hasDraftContent()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('D-I8 · cambiar las direcciones invalida el recorrido recuperado', () => {
  it('cambiar el destino: desactualizado, sin costo ni cotización, y fuera del borrador', () => {
    const nueva = recargar(manual(A_B, [[25, 40]]));
    nueva.setChosenPrice(80000);
    nueva.setInputs({ destination: 'Otra Calle 9, Puente Alto' });
    const h = nueva.getSnapshot().habitual;
    expect(h.status).toBe('desactualizado');
    expect(h.manualLegs).toEqual([]);
    expect(h.recovered).toBeUndefined();
    expect(nueva.computation('habitual')).toBeNull();
    expect(nueva.canQuote()).toBe(false);
    expect(nueva.draftData().manualRoute).toBeNull();
  });

  it('volver a las direcciones originales NO trae de vuelta los tramos: hay que revisarlos de nuevo', () => {
    const nueva = recargar(manual(A_B, [[25, 40]]));
    nueva.setInputs({ destination: 'Pasaje Ficticio 2, Maipúx' });
    nueva.setInputs({ destination: 'Pasaje Ficticio 2, Maipú' });
    expect(nueva.getSnapshot().habitual.status).toBe('desactualizado');
    expect(nueva.computation('habitual')).toBeNull();
    // Escribirlos a mano empieza en blanco.
    nueva.useManual('habitual');
    expect(nueva.getSnapshot().habitual.manualLegs.map((l) => [l.km, l.minutes])).toEqual([[null, null]]);
    expect(nueva.getSnapshot().habitual.recovered).toBeUndefined();
  });

  it('activar «Vuelvo a la base» (otros tramos) también invalida', () => {
    const nueva = recargar(manual(BASE_A_B, [[8.5, 15], [25, 40]]));
    nueva.setInputs({ returnToBase: true });
    expect(nueva.getSnapshot().habitual.status).toBe('desactualizado');
    expect(nueva.computation('habitual')).toBeNull();
  });

  it('cambiar la base invalida un recorrido que la usa', () => {
    const nueva = recargar(manual(BASE_A_B_BASE, [[8.5, 15], [25, 40], [31.2, 47]]));
    nueva.setInputs({ base: 'Otra Base 4, San Bernardo' });
    expect(nueva.getSnapshot().habitual.status).toBe('desactualizado');
  });

  it('un recorrido manual desactualizado (sin recuperar) tampoco se guarda en el borrador', () => {
    const s = manual(A_B, [[25, 40]]);
    s.setInputs({ destination: 'Otra Calle 9, Puente Alto' });
    expect(s.getSnapshot().habitual.status).toBe('desactualizado');
    expect(s.draftData().manualRoute).toBeNull();
  });

  it('defensa: un recorrido manual cuya clave no es la de las direcciones actuales no se guarda', () => {
    const s = new QuoteSession(noRoutes, {
      inputs: { origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú', base: '', startAtBase: false, returnToBase: false },
      habitual: { status: 'manual', key: 'clave-de-otras-direcciones', route: null, manualReason: null, message: null, overrides: [], manualLegs: [{ from: 'A', to: 'B', km: 25, minutes: 40 }] },
    });
    expect(s.draftData().manualRoute).toBeNull();
  });

  it('un recorrido manual NO recuperado mantiene la regla actual: volver a las mismas direcciones lo recupera', () => {
    const s = manual(A_B, [[25, 40]]);
    s.setInputs({ destination: 'Otra Calle 9, Puente Alto' });
    s.setInputs({ destination: 'Pasaje Ficticio 2, Maipú' });
    expect(s.getSnapshot().habitual.status).toBe('manual');
    expect(s.computation('habitual')?.km).toBe(25);
  });
});

// ---------------------------------------------------------------------------
describe('D-I8 · nunca se recuperan precios ni datos del proveedor', () => {
  it('ruta del proveedor (con o sin correcciones): no se guarda ningún dato de ella', async () => {
    const s = new QuoteSession(providerClient());
    s.setInputs(BASE_A_B_BASE);
    await s.calculateRoute();
    expect(s.getSnapshot().habitual.status).toBe('listo');
    expect(s.draftData().manualRoute).toBeNull();
    // Corrección sobre la ruta automática (§12, punto 2): tampoco se guarda.
    s.setLegOverride('habitual', 1, { km: 23 });
    s.setChosenPrice(80000);
    expect(s.draftData().manualRoute).toBeNull();
    const serial = JSON.stringify(s.draftData());
    for (const marca of PROVIDER_MARKERS) expect(serial).not.toContain(marca);
    expect(serial).not.toContain('"overrides"');
    const nueva = recargar(s);
    expect(nueva.getSnapshot().habitual.status).toBe('vacio');
    expect(nueva.getSnapshot().habitual.overrides).toEqual([]);
  });

  it('lo que va al almacenamiento con un recorrido manual no contiene precio ni datos del proveedor', async () => {
    // El usuario pasó por una ruta del proveedor y luego eligió escribir los km a mano.
    const s = new QuoteSession(providerClient());
    s.setInputs(A_B);
    await s.calculateRoute();
    s.useManual('habitual');
    s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
    s.setParams(PARAMS);
    s.setChosenPrice(80000);
    const store = new MemoryKeyValueStore();
    new DraftStore(store).write('local', s.draftData());
    const raw = store.getItem(DRAFT_KEY)!;
    for (const marca of PROVIDER_MARKERS) expect(raw).not.toContain(marca);
    expect(JSON.parse(raw).local.data.manualRoute).toEqual({ key: expect.any(String), legs: [{ from: 'A', to: 'B', km: 25, minutes: 40 }] });
  });

  it('un borrador manipulado con precio, confirmación o ruta no los recupera', () => {
    const store = new MemoryKeyValueStore();
    const data = { ...manual(A_B, [[25, 40]]).draftData(), chosenPrice: 99999, priceBasis: 'x', habitual: { status: 'listo' }, route: { legs: [] } };
    guardarCrudo(store, data);
    const r = new DraftStore(store).read('local');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(Object.keys(r.draft.data)).not.toContain('chosenPrice');
    expect(Object.keys(r.draft.data)).not.toContain('priceBasis');
    const nueva = new QuoteSession(noRoutes);
    nueva.restoreDraft(r.draft.data);
    expect(nueva.getSnapshot().chosenPrice).toBeNull();
    expect(nueva.getSnapshot().priceBasis).toBeNull();
    expect(nueva.getSnapshot().habitual.route).toBeNull();
    expect(nueva.getSnapshot().habitual.status).toBe('manual'); // el recorrido manual válido sí vuelve
  });

  it('un recorrido con campos del proveedor se ignora (solo el recorrido), y el resto del borrador vuelve', () => {
    const store = new MemoryKeyValueStore();
    const d = manual(A_B, [[25, 40]]).draftData();
    const conProveedor = { ...d, manualRoute: { ...d.manualRoute!, legs: [{ ...d.manualRoute!.legs[0]!, distanceM: 25000, durationS: 2400 }] } };
    guardarCrudo(store, conProveedor);
    const r = new DraftStore(store).read('local');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.draft.data.manualRoute).toBeNull();
    const nueva = new QuoteSession(noRoutes);
    nueva.restoreDraft(r.draft.data);
    expect(nueva.getSnapshot().habitual.status).toBe('vacio');
    expect(nueva.getSnapshot().params).toEqual(d.params);
    expect(nueva.getSnapshot().inputs).toEqual(d.inputs);
  });

  it('un recorrido con una fuente o retención del proveedor a nivel del recorrido también se ignora', () => {
    const store = new MemoryKeyValueStore();
    const d = manual(A_B, [[25, 40]]).draftData();
    guardarCrudo(store, { ...d, manualRoute: { ...d.manualRoute!, source: 'google', retention: { distance: 'permanente' } } });
    const r = new DraftStore(store).read('local');
    expect(r.status === 'ok' && r.draft.data.manualRoute).toBeNull();
  });

  it('clave de otras direcciones: el recorrido no se aplica', () => {
    const store = new MemoryKeyValueStore();
    const d = manual(A_B, [[25, 40]]).draftData();
    const otra = manual({ origin: 'Otra Calle 1, Recoleta', destination: 'Otra Calle 2, Quilicura' }, [[5, 10]]).draftData();
    guardarCrudo(store, { ...d, manualRoute: otra.manualRoute });
    const r = new DraftStore(store).read('local');
    const nueva = new QuoteSession(noRoutes);
    if (r.status === 'ok') nueva.restoreDraft(r.draft.data);
    expect(nueva.getSnapshot().habitual.status).toBe('vacio');
    expect(nueva.computation('habitual')).toBeNull();
  });

  it('tramos que no corresponden a las direcciones (cantidad o puntos): el recorrido no se aplica', () => {
    const d = manual(BASE_A_B, [[8.5, 15], [25, 40]]).draftData();
    const variantes: DraftData[] = [
      { ...d, manualRoute: { key: d.manualRoute!.key, legs: d.manualRoute!.legs.slice(0, 1) } },
      { ...d, manualRoute: { key: d.manualRoute!.key, legs: [{ from: 'A', to: 'B', km: 1, minutes: 1 }, { from: 'B', to: 'base', km: 1, minutes: 1 }] } },
    ];
    for (const v of variantes) {
      const nueva = new QuoteSession(noRoutes);
      nueva.restoreDraft(v);
      expect(nueva.getSnapshot().habitual.status).toBe('vacio');
    }
  });

  it('un borrador anterior a D-I8 (sin recorrido) se sigue leyendo igual', () => {
    const store = new MemoryKeyValueStore();
    const { manualRoute: _omitido, ...anterior } = manual(A_B, [[25, 40]]).draftData();
    guardarCrudo(store, anterior);
    const r = new DraftStore(store).read('local');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.draft.data.manualRoute).toBeNull();
    const nueva = new QuoteSession(noRoutes);
    nueva.restoreDraft(r.draft.data);
    expect(nueva.getSnapshot().habitual.status).toBe('vacio');
    expect(nueva.getSnapshot().params).toEqual(anterior.params);
  });

  it('calcular la ruta después de recuperar: los km escritos se mantienen como correcciones, pero NO se guardan (punto 2)', async () => {
    const store = new MemoryKeyValueStore();
    const ds = new DraftStore(store);
    ds.write('local', manual(A_B, [[25, 40]]).draftData());
    const r = ds.read('local');
    const s = new QuoteSession(providerClient());
    if (r.status === 'ok') s.restoreDraft(r.draft.data);
    await s.calculateRoute();
    const h = s.getSnapshot().habitual;
    expect(h.status).toBe('listo');
    expect(h.recovered).toBeUndefined();
    expect(s.computation('habitual')?.km).toBe(25); // regla existente: lo declarado prevalece
    expect(s.draftData().manualRoute).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('D-I8 · el motor y las cotizaciones históricas no cambian', () => {
  const form = {
    clientName: 'Cliente ficticio',
    serviceDescription: 'Flete',
    includes: 'Carga y descarga',
    conditions: '',
    serviceDate: '',
    validUntil: '',
    originLabel: 'Ñuñoa',
    destinationLabel: 'Maipú',
  };
  const issuer = { name: 'Fletes Prueba', phone: '', email: '' };
  const meta = { id: '00000000-0000-4000-8000-000000000001', number: 1, createdAt: '2026-11-21' };

  it('la cotización emitida tras recuperar (y confirmar el precio) es idéntica a la del recorrido escrito a mano', () => {
    for (const [inputs, legs] of [
      [A_B, [[25, 40]]],
      [BASE_A_B_BASE, [[8.5, 15], [25, 40], [31.2, 47]]],
    ] as const) {
      const original = manual(inputs, legs.map((l) => [...l] as [number, number]));
      const nueva = recargar(original);
      expect(buildJobRecord(nueva, form, issuer, meta)).toBeNull(); // sin precio no se emite
      nueva.setChosenPrice(80000);
      expect(buildJobRecord(nueva, form, issuer, meta)).toEqual(buildJobRecord(original, form, issuer, meta));
      expect(nueva.retainable('habitual')).toEqual({ km: true, minutes: true });
    }
  });

  it('guardar, recuperar, invalidar y borrar el borrador no toca el historial emitido (byte a byte)', async () => {
    const store = new MemoryKeyValueStore();
    const repo = createQuoteRepository(store);
    const emitida = buildJobRecord(manual(A_B, [[25, 40]]), form, issuer, meta)!;
    await repo.create(emitida);
    const historial = store.getItem('cotizador.trabajos.v1');
    expect(historial).not.toBeNull();
    const nueva = recargar(manual(BASE_A_B, [[8.5, 15], [25, 40]]), store);
    nueva.setInputs({ destination: 'Otra Calle 9, Puente Alto' });
    new DraftStore(store).write('local', nueva.draftData());
    new DraftStore(store).clear('local');
    expect(store.getItem('cotizador.trabajos.v1')).toBe(historial);
    expect(await repo.list()).toEqual([emitida]);
  });
});

// ---------------------------------------------------------------------------
describe('A-70 · P2 de la auditoría: un recorrido recuperado dañado nunca hace fallar la calculadora', () => {
  /** Borrador válido de 3 tramos con carga, para comprobar que el resto se conserva. */
  function base3(): DraftData {
    const s = manual(BASE_A_B_BASE, [[8.5, 15], [25, 40], [31.2, 47]]);
    s.setMargin(0.2);
    s.setSurcharges(3000);
    return s.draftData();
  }
  function conTramo(d: DraftData, i: number, cambio: Record<string, unknown>): unknown {
    return { ...d, manualRoute: { ...d.manualRoute!, legs: d.manualRoute!.legs.map((l, j) => (j === i ? { ...l, ...cambio } : l)) } };
  }
  /** Lee del almacenamiento como la app, restaura y renderiza la calculadora: no debe lanzar. */
  async function recuperarYRenderizar(crudo: unknown): Promise<QuoteSession> {
    const store = new MemoryKeyValueStore();
    guardarCrudo(store, crudo);
    const r = new DraftStore(store).read('local');
    expect(r.status).toBe('ok');
    const s = new QuoteSession(noRoutes);
    if (r.status === 'ok') expect(() => s.restoreDraft(r.draft.data)).not.toThrow();
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { Calculator } = await import('../src/web/components/Calculator');
    expect(() => renderToStaticMarkup(createElement(Calculator, { session: s, vehicles: [], onManageVehicles: () => undefined, onCreateQuote: () => undefined, cargoEnabled: true }))).not.toThrow();
    return s;
  }
  /** El recorrido se descartó entero y el resto del borrador sigue igual, sin precio. */
  function soloSeDescartoElRecorrido(s: QuoteSession, d: DraftData): void {
    const snap = s.getSnapshot();
    expect(snap.habitual.status).toBe('vacio');
    expect(snap.habitual.manualLegs).toEqual([]);
    expect(s.computation('habitual')).toBeNull();
    expect(snap.inputs).toEqual(d.inputs);
    expect(snap.params).toEqual(d.params);
    expect(snap.margin).toBe(d.margin);
    expect(snap.surcharges).toBe(d.surcharges);
    expect(snap.vehicle).toEqual(d.vehicle);
    expect(snap.cargo).toEqual(d.cargo);
    expect(snap.resources).toEqual(d.resources);
    expect(snap.chosenPrice).toBeNull();
    expect(s.canQuote()).toBe(false);
  }

  const invalidos: Array<[string, Record<string, unknown>]> = [
    ['km = -1', { km: -1 }],
    ['minutos = -0,5', { minutes: -0.5 }],
    ['km negativo diminuto (-1e-9)', { km: -1e-9 }],
    ['km extremo finito (1e308)', { km: 1e308 }],
    ['minutos extremos finitos (1e308)', { minutes: 1e308 }],
    ['km justo sobre el tope (100.000,01)', { km: 100_000.01 }],
    ['minutos justo sobre el tope (100.001)', { minutes: 100_001 }],
    ['km como texto («25»)', { km: '25' }],
    ['minutos booleanos', { minutes: true }],
    ['km como objeto', { km: { valor: 25 } }],
  ];
  for (const [nombre, cambio] of invalidos) {
    it(`${nombre} en un tramo: se descarta todo el recorrido (no solo el tramo), sin error y con el resto intacto`, async () => {
      const d = base3();
      const crudo = conTramo(d, 1, cambio);
      const store = new MemoryKeyValueStore();
      guardarCrudo(store, crudo);
      const r = new DraftStore(store).read('local');
      expect(r.status === 'ok' && r.draft.data.manualRoute).toBeNull();
      soloSeDescartoElRecorrido(await recuperarYRenderizar(crudo), d);
    });
  }

  it('en el tope exacto (100.000 km y 100.000 min por tramo, 3 tramos) se recupera y el cálculo funciona', async () => {
    const d = base3();
    const tope = { ...d, manualRoute: { ...d.manualRoute!, legs: d.manualRoute!.legs.map((l) => ({ ...l, km: 100_000, minutes: 100_000 })) } };
    const s = await recuperarYRenderizar(tope);
    expect(s.getSnapshot().habitual).toMatchObject({ status: 'manual', recovered: true });
    expect(s.computation('habitual')?.km).toBe(300_000);
  });

  it('0 km y 0 minutos son datos válidos (no faltantes) y se recuperan', async () => {
    const d = manual(A_B, [[0, 0]]).draftData();
    const s = await recuperarYRenderizar(d);
    expect(s.getSnapshot().habitual.manualLegs).toEqual([{ from: 'A', to: 'B', km: 0, minutes: 0 }]);
    expect(s.computation('habitual')).not.toBeNull();
  });

  it('defensa de la sesión: restoreDraft con valores inválidos que no pasaron por el esquema no aplica el recorrido ni lanza', () => {
    for (const cambio of [{ km: -5 }, { minutes: Number.POSITIVE_INFINITY }, { km: Number.NaN }, { km: 1e308 }, { minutes: 100_001 }]) {
      const d = base3();
      const s = new QuoteSession(noRoutes);
      expect(() => s.restoreDraft(conTramo(d, 0, cambio) as DraftData)).not.toThrow();
      soloSeDescartoElRecorrido(s, d);
    }
  });

  it('otros datos del borrador dañados (ayudantes −1, carga y descarga 1e308, combustible 1e308): se descarta solo el recorrido, sin inventar valores', async () => {
    for (const params of [{ helpers: -1 }, { loadMinutes: 1e308 }, { fuelPricePerL: 1e308 }]) {
      const d = base3();
      const crudo = { ...d, params: { ...d.params, ...params } };
      const s = await recuperarYRenderizar(crudo);
      soloSeDescartoElRecorrido(s, crudo as DraftData);
    }
  });

  it('regresión: un borrador válido se sigue recuperando igual (3 tramos, aviso y costo)', async () => {
    const d = base3();
    const s = await recuperarYRenderizar(d);
    expect(s.getSnapshot().habitual).toMatchObject({ status: 'manual', recovered: true, message: RECOVERED_ROUTE_MESSAGE });
    expect(s.computation('habitual')?.km).toBeCloseTo(64.7, 6);
    expect(s.getSnapshot().chosenPrice).toBeNull();
  });
});
