/**
 * A-71 (Frente A): robustez ante números extremos en la calculadora.
 * - Límites técnicos por campo; inválido ≠ faltante ≠ cero.
 * - Un valor fuera de rango pausa el cálculo, se marca en su campo y NUNCA se reemplaza.
 * - Con todos los campos en su máximo, ninguna operación intermedia da infinito.
 * - Barrera: aunque el motor lanzara un error, la calculadora no se cae.
 * El motor y sus fórmulas no cambian (casos dorados aparte).
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildCostItems } from '../src/engine/inputs';
import { computeMeasures } from '../src/engine/measures';
import { MAX_CLP } from '../src/shared/resources';
import type { RouteApiResponse, RouteRequestInput } from '../src/shared/route';
import { Calculator } from '../src/web/components/Calculator';
import { DRAFT_KEY, DraftStore } from '../src/web/draftStore';
import { buildJobRecord } from '../src/web/jobs';
import { LEG_LIMITS, limitIssue, MARGIN_LIMIT, MONEY_LIMIT, numericIssues, PARAM_LIMITS } from '../src/web/numericLimits';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { MemoryKeyValueStore } from '../src/web/vehicleRepository';

const noRoutes: RouteClient = { requestRoute: vi.fn(async () => { throw new Error('sin red'); }) };
function providerClient(): RouteClient {
  return {
    requestRoute: vi.fn(async (input: RouteRequestInput): Promise<RouteApiResponse> => ({
      status: 'ok',
      quota: null,
      route: {
        kind: input.kind,
        source: 'simulado',
        legs: [{ from: 'A', to: 'B', distanceM: 25000, durationS: 2400 }],
        totalDistanceM: 25000,
        totalDurationS: 2400,
        warnings: [],
        computedAt: '2026-11-22T00:00:00Z',
        retention: { distance: 'sesion', duration: 'sesion' },
      },
    })),
  };
}

const PARAMS = { fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 2, helperFee: 15000, loadMinutes: 60, tolls: 0, otherCosts: 0 };
const form = { clientName: 'Cliente ficticio', serviceDescription: 'Flete', includes: 'Carga y descarga', conditions: '', serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Maipú' };
const issuer = { name: 'Fletes Prueba', phone: '', email: '' };
const meta = { id: '00000000-0000-4000-8000-000000000001', number: 1, createdAt: '2026-11-22' };

/** Sesión válida: recorrido manual de 3 tramos, costos completos y precio. */
function lista(legs: Array<[number, number]> = [[8, 15], [25, 40], [30, 45]]): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú', base: 'Base Ficticia 3, La Florida', startAtBase: true, returnToBase: true });
  s.useManual('habitual');
  legs.forEach(([km, minutes], i) => s.setLegOverride('habitual', i, { km, minutes }));
  s.setParams(PARAMS);
  s.setChosenPrice(150000);
  return s;
}
const render = (s: QuoteSession, cargoEnabled = false) =>
  renderToStaticMarkup(createElement(Calculator, { session: s, vehicles: [], onManageVehicles: () => undefined, onCreateQuote: () => undefined, cargoEnabled }));

// ---------------------------------------------------------------------------
describe('A-71 · límites por campo: inválido ≠ faltante ≠ cero', () => {
  it('cada parámetro: el tope exacto es válido; apenas más, 1e308, negativo, NaN e Infinity son inválidos; null (faltante) y 0 son válidos', () => {
    for (const [campo, l] of Object.entries(PARAM_LIMITS)) {
      expect(limitIssue(l.max, l), `${campo} en el tope`).toBeNull();
      expect(limitIssue(0, l), `${campo} = 0`).toBeNull();
      expect(limitIssue(null, l), `${campo} faltante`).toBeNull();
      for (const v of [l.max + (l.integer ? 1 : l.max * 1e-9 + 1e-6), 1e308, -1, -1e-9, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(limitIssue(v, l), `${campo} = ${v}`).not.toBeNull();
      }
    }
  });

  it('ayudantes: solo enteros (2,5 es inválido, no se redondea)', () => {
    expect(limitIssue(2.5, PARAM_LIMITS.helpers)).toBe('Debe ser un número entero');
    expect(limitIssue(100, PARAM_LIMITS.helpers)).toBeNull();
    expect(limitIssue(101, PARAM_LIMITS.helpers)).not.toBeNull();
  });

  it('rendimiento: 0 = sin dato (como hoy), 0,1–100 km/L válido, entre 0 y 0,1 inválido (evita dividir por casi cero)', () => {
    expect(limitIssue(0, PARAM_LIMITS.kmPerL)).toBeNull();
    expect(limitIssue(0.1, PARAM_LIMITS.kmPerL)).toBeNull();
    expect(limitIssue(0.05, PARAM_LIMITS.kmPerL)).toMatch(/Usa 0 si no lo sabes/);
    expect(limitIssue(1e-300, PARAM_LIMITS.kmPerL)).not.toBeNull();
    expect(limitIssue(100.01, PARAM_LIMITS.kmPerL)).not.toBeNull();
  });

  it('tramos, margen y montos sueltos con sus topes', () => {
    expect(limitIssue(100_000, LEG_LIMITS.km)).toBeNull();
    expect(limitIssue(100_000.1, LEG_LIMITS.km)).not.toBeNull();
    expect(limitIssue(100_000, LEG_LIMITS.minutes)).toBeNull();
    expect(limitIssue(0.8, MARGIN_LIMIT)).toBeNull();
    expect(limitIssue(0.8001, MARGIN_LIMIT)).not.toBeNull();
    expect(limitIssue(MAX_CLP, MONEY_LIMIT)).toBeNull();
    expect(limitIssue(MAX_CLP + 1, MONEY_LIMIT)).not.toBeNull();
  });

  it('peajes: faltante → costo como cota inferior; 0 → estimado; 1e308 → cálculo en pausa con error', () => {
    const s = lista();
    s.setParams({ tolls: null });
    expect(s.computation('habitual')!.measures.cost).toMatchObject({ type: 'cotaInferior', missing: ['peajes'] });
    s.setParams({ tolls: 0 });
    expect(s.computation('habitual')!.measures.cost.type).toBe('estimado');
    s.setParams({ tolls: 1e308 });
    expect(s.computation('habitual')).toBeNull();
    expect(s.numericIssues()['params.tolls']).toMatch(/máximo/);
  });
});

// ---------------------------------------------------------------------------
describe('A-71 · 1e308 en cada campo: error en el campo, cálculo en pausa, sin caída y sin reemplazar el valor', () => {
  const campos: Array<[string, (s: QuoteSession) => void, string]> = [
    ...(Object.keys(PARAM_LIMITS) as Array<keyof typeof PARAM_LIMITS>).map((k) => [`params.${k}`, (s: QuoteSession) => s.setParams({ [k]: 1e308 }), `params.${k}`] as [string, (s: QuoteSession) => void, string]),
    ['km del tramo 2', (s) => s.setLegOverride('habitual', 1, { km: 1e308 }), 'habitual.leg.1.km'],
    ['minutos del tramo 3', (s) => s.setLegOverride('habitual', 2, { minutes: 1e308 }), 'habitual.leg.2.minutes'],
    ['margen', (s) => s.setMargin(1e308), 'margin'],
    ['recargos', (s) => s.setSurcharges(1e308), 'surcharges'],
  ];
  for (const [nombre, poner, clave] of campos) {
    it(nombre, () => {
      const s = lista();
      expect(s.computation('habitual')).not.toBeNull();
      poner(s);
      expect(() => s.computation('habitual')).not.toThrow();
      expect(s.computation('habitual')).toBeNull();
      expect(s.computationError('habitual')).toBeNull(); // en pausa por el límite, no por un error del motor
      expect(s.numericIssues()[clave]).toBeTruthy();
      expect(s.canQuote()).toBe(false);
      expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
      // El valor escrito se conserva tal cual (no se recorta ni se borra).
      expect(JSON.stringify(s.getSnapshot())).toContain('1e+308');
      // La calculadora se dibuja con el error en el campo y el aviso, con y sin el detalle de carga.
      for (const conCarga of [false, true]) {
        let html = '';
        expect(() => (html = render(s, conCarga))).not.toThrow();
        expect(html).toContain('data-testid="bloqueo-numeros"');
        expect(html).toContain('aria-invalid="true"');
      }
    });
  }

  it('al corregir el valor, el cálculo vuelve y es idéntico al de antes', () => {
    const s = lista();
    const antes = s.computation('habitual')!.measures;
    s.setParams({ wearPerKm: 1e308 });
    expect(s.computation('habitual')).toBeNull();
    s.setParams({ wearPerKm: PARAMS.wearPerKm });
    expect(s.computation('habitual')!.measures).toEqual(antes);
  });
});

// ---------------------------------------------------------------------------
describe('A-71 · sin infinitos en operaciones intermedias', () => {
  it('TODOS los campos en su tope, 3 tramos de 100.000 km y 100.000 min, margen 80 %: todo finito', () => {
    const s = lista([[100_000, 100_000], [100_000, 100_000], [100_000, 100_000]]);
    s.setParams({ fuelPricePerL: 100_000, kmPerL: 0.1, wearPerKm: 10_000, fixedPerHour: 10_000_000, ownerPerHour: 10_000_000, helpers: 100, helperFee: MAX_CLP, loadMinutes: 100_000, tolls: MAX_CLP, otherCosts: MAX_CLP });
    s.setMargin(0.8);
    s.setSurcharges(MAX_CLP);
    s.setChosenPrice(MAX_CLP);
    expect(s.numericIssues()).toEqual({});
    const c = s.computation('habitual')!;
    expect(c).not.toBeNull();
    for (const it of c.items) expect(Number.isFinite(it.amount!)).toBe(true);
    const m = c.measures;
    for (const v of [m.cost.value, m.suggested.value, m.afterTrip!.value, m.afterAllCosts!.value, m.overGoal!.value]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    }
  });

  it('sin los límites, combinaciones finitas desbordan dentro del motor (por eso se validan antes)', () => {
    expect(() => computeMeasures({ items: buildCostItems(1e200, 10, { ...PARAMS, wearPerKm: 1e200 }), margin: 0.15 })).toThrow();
    expect(() => computeMeasures({ items: buildCostItems(25, 40, { ...PARAMS, kmPerL: 1e-300, fuelPricePerL: 1e10 }), margin: 0.15 })).toThrow();
    // Las mismas combinaciones en la sesión: en pausa con error en el campo, sin lanzar.
    const s = lista();
    s.setParams({ kmPerL: 1e-300, fuelPricePerL: 1e10 });
    expect(() => s.computation('habitual')).not.toThrow();
    expect(Object.keys(s.numericIssues()).sort()).toEqual(['params.fuelPricePerL', 'params.kmPerL']);
  });
});

// ---------------------------------------------------------------------------
describe('A-71 · casos particulares', () => {
  it('ayudantes 2,5: se conserva 2,5 (no se redondea) y se marca', () => {
    const s = lista();
    s.setParams({ helpers: 2.5 });
    expect(s.getSnapshot().params.helpers).toBe(2.5);
    expect(s.numericIssues()['params.helpers']).toBe('Debe ser un número entero');
    expect(s.computation('habitual')).toBeNull();
  });

  it('margen 90 %: se conserva y se marca (el motor lo rechazaría); 80 % exacto es válido', () => {
    const s = lista();
    s.setMargin(0.9);
    expect(s.getSnapshot().margin).toBe(0.9);
    expect(() => s.computation('habitual')).not.toThrow();
    expect(s.numericIssues().margin).toMatch(/80 %/);
    expect(render(s)).toContain('Margen objetivo'); // el campo «Otro» se abre solo para mostrar el error
    s.setMargin(0.8);
    expect(s.computation('habitual')).not.toBeNull();
  });

  it('precio elegido sobre el tope: el costo se sigue mostrando, pero sin resultados con ese precio y sin poder cotizar', () => {
    const s = lista();
    s.setChosenPrice(MAX_CLP + 1);
    const c = s.computation('habitual')!;
    expect(c).not.toBeNull();
    expect(c.measures.afterTrip).toBeNull();
    expect(s.numericIssues().chosenPrice).toBeTruthy();
    expect(s.canQuote()).toBe(false);
    expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
    expect(s.getSnapshot().chosenPrice).toBe(MAX_CLP + 1);
  });

  it('corrección sobre una ruta del proveedor: 1e308 se marca en el tramo y pausa solo esa ruta', async () => {
    const s = new QuoteSession(providerClient());
    s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
    s.setParams(PARAMS);
    await s.calculateRoute();
    expect(s.computation('habitual')).not.toBeNull();
    s.setLegOverride('habitual', 0, { km: 1e308 });
    expect(s.numericIssues()['habitual.leg.0.km']).toBeTruthy();
    expect(s.computation('habitual')).toBeNull();
  });

  it('comparación sin peajes: un monto inválido en sus peajes pausa solo la comparación', async () => {
    const s = new QuoteSession(providerClient());
    s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
    s.setParams(PARAMS);
    await s.calculateRoute();
    await s.compareWithoutTolls();
    s.setTollsComparison(1e308);
    expect(s.computation('habitual')).not.toBeNull();
    expect(s.computation('evitarPeajes')).toBeNull();
    expect(s.numericIssues().tollsComparison).toBeTruthy();
  });

  it('vehículo guardado con un rendimiento diminuto (0,05 km/L, permitido por su formulario): se marca al aplicarlo, no se cae', () => {
    const s = lista();
    s.selectVehicle({ id: 'v1', name: 'Camioneta', type: 'camioneta', fuel: 'diesel', kmPerL: 0.05, wearPerKm: 31, isDefault: false } as never);
    expect(s.numericIssues()['params.kmPerL']).toMatch(/Usa 0 si no lo sabes/);
    expect(() => render(s)).not.toThrow();
  });

  it('barrera: si el motor lanzara un error pese a los límites, la calculadora no se cae y lo informa', () => {
    const s = lista();
    (s as unknown as { compute: () => never }).compute = () => {
      throw new Error('fallo simulado');
    };
    expect(() => s.computation('habitual')).not.toThrow();
    expect(s.computation('habitual')).toBeNull();
    expect(s.computationError('habitual')).toMatch(/No se pudo calcular/);
    expect(s.canQuote()).toBe(false);
    let html = '';
    expect(() => (html = render(s))).not.toThrow();
    expect(html).toContain('data-testid="falla-calculo"');
  });
});

// ---------------------------------------------------------------------------
describe('A-71 · compatibilidad con borradores y cotizaciones', () => {
  it('borrador con un costo 1e308: vuelve sin el recorrido (regla A-70), con el valor intacto y su error a la vista; no se cae', () => {
    const d = lista().draftData();
    const store = new MemoryKeyValueStore();
    store.setItem(DRAFT_KEY, JSON.stringify({ local: { format: 1, savedAt: '2026-11-22T00:00:00Z', data: { ...d, params: { ...d.params, wearPerKm: 1e308 } } } }));
    const r = new DraftStore(store).read('local');
    expect(r.status).toBe('ok');
    const s = new QuoteSession(noRoutes);
    if (r.status === 'ok') expect(() => s.restoreDraft(r.draft.data)).not.toThrow();
    expect(s.getSnapshot().params.wearPerKm).toBe(1e308);
    expect(s.getSnapshot().habitual.status).toBe('vacio');
    expect(s.numericIssues()['params.wearPerKm']).toBeTruthy();
    expect(() => render(s, true)).not.toThrow();
  });

  it('un borrador válido se recupera igual que antes (sin errores numéricos)', () => {
    const d = lista().draftData();
    const s = new QuoteSession(noRoutes);
    s.restoreDraft(d);
    expect(numericIssues(s.getSnapshot())).toEqual({});
    expect(s.getSnapshot().habitual).toMatchObject({ status: 'manual', recovered: true });
    expect(s.computation('habitual')).not.toBeNull();
  });

  it('con valores válidos, la cotización emitida es idéntica (los límites no cambian nada)', () => {
    const s = lista();
    const job = buildJobRecord(s, form, issuer, meta)!;
    expect(job).not.toBeNull();
    expect(job.netPrice).toBe(150000);
    expect(numericIssues(s.getSnapshot())).toEqual({});
  });
});
