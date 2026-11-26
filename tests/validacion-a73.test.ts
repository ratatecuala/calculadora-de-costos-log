/**
 * A-73 (Frente A, correcciones de validación):
 *  1. un texto que no es un número es INVÁLIDO: se marca, pausa el cálculo y bloquea la emisión, sin
 *     confundirse con vacío ni con cero; se recupera literalmente del borrador;
 *  2. los errores de la comparación opcional sin peajes no bloquean la cotización principal válida;
 *  3. «Mi vehículo» exige el mismo rendimiento mínimo que la calculadora (0,1 km/L) sin perder ni
 *     modificar en silencio los vehículos guardados.
 * Sin cambios de fórmulas (casos dorados aparte).
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RouteApiResponse, RouteRequestInput } from '../src/shared/route';
import { vehicleNeedsReview, type VehicleProfile } from '../src/shared/vehicle';
import { Calculator } from '../src/web/components/Calculator';
import { VehiclesView } from '../src/web/components/VehiclesView';
import { DRAFT_KEY, DraftStore } from '../src/web/draftStore';
import { INVALID_NUMBER_MESSAGE } from '../src/web/format';
import { buildJobRecord } from '../src/web/jobs';
import { QuoteSession, type DraftData, type RouteClient } from '../src/web/session';
import { LocalVehicleRepository, MemoryKeyValueStore, validateVehicleInput, VehicleValidationError, VEHICLES_KEY } from '../src/web/vehicleRepository';

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

function lista(): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.useManual('habitual');
  s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  s.setParams(PARAMS);
  s.setChosenPrice(80000);
  return s;
}
async function conComparacion(): Promise<QuoteSession> {
  const s = new QuoteSession(providerClient());
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.setParams(PARAMS);
  await s.calculateRoute();
  await s.compareWithoutTolls();
  s.setChosenPrice(80000);
  return s;
}
const render = (s: QuoteSession) =>
  renderToStaticMarkup(createElement(Calculator, { session: s, vehicles: [], onManageVehicles: () => undefined, onCreateQuote: () => undefined }));

// ---------------------------------------------------------------------------
describe('A-73 · 1. texto no numérico: inválido (no vacío ni cero), pausa y bloquea la emisión', () => {
  const claves: Array<[string, string]> = [
    ['params.tolls', 'abc'],
    ['params.helpers', 'dos'],
    ['params.loadMinutes', '-5'],
    ['params.kmPerL', '1e400'],
    ['habitual.leg.0.km', '25 km'],
    ['margin', '15%%'],
    ['surcharges', '$-'],
  ];
  for (const [clave, texto] of claves) {
    it(`${clave} = «${texto}»: error, cálculo en pausa, sin emitir y sin cambiar el valor`, () => {
      const s = lista();
      const antes = structuredClone(s.getSnapshot());
      expect(s.canQuote()).toBe(true);
      s.setTextIssue(clave, texto);
      expect(s.numericIssues()[clave]).toBe(INVALID_NUMBER_MESSAGE);
      expect(s.computation('habitual')).toBeNull();
      expect(s.canQuote()).toBe(false);
      expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
      // El valor anterior NO se reemplazó por vacío ni por cero.
      expect(s.getSnapshot().params).toEqual(antes.params);
      expect(s.getSnapshot().margin).toBe(antes.margin);
      expect(s.getSnapshot().habitual.manualLegs).toEqual(antes.habitual.manualLegs);
      const html = render(s);
      expect(html).toContain('data-testid="bloqueo-numeros"');
      expect(html).toContain(`value="${texto}"`); // el texto se muestra literalmente
      // A-50: el aviso de texto inválido se anuncia como alerta (lectores de pantalla).
      expect(html).toMatch(/class="field-error" role="alert">No es un número válido/);
      // Corregir (texto válido o vacío) quita el error y todo vuelve.
      s.setTextIssue(clave, null);
      expect(s.numericIssues()[clave]).toBeUndefined();
      expect(s.canQuote()).toBe(true);
    });
  }

  it('el precio escrito como texto inválido: el costo se sigue viendo, pero no se puede emitir', () => {
    const s = lista();
    s.setTextIssue('chosenPrice', 'ochenta mil');
    expect(s.computation('habitual')).not.toBeNull();
    expect(s.canQuote()).toBe(false);
    expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
  });

  it('introducir un texto inválido en el último momento bloquea la emisión ya habilitada', () => {
    const s = lista();
    expect(buildJobRecord(s, form, issuer, meta)).not.toBeNull();
    s.setTextIssue('params.wearPerKm', 'x');
    expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
  });

  it('un texto que en realidad es un número, o vacío, no se registra; una clave desconocida se ignora', () => {
    const s = lista();
    s.setTextIssue('params.tolls', '4.200');
    s.setTextIssue('params.tolls', '');
    s.setTextIssue('campo.inventado', 'abc');
    expect(s.getSnapshot().textIssues).toEqual({});
  });

  it('vacío sigue siendo faltante y cero sigue siendo un dato (A-50, sin cambios)', () => {
    const s = lista();
    s.setParams({ tolls: null });
    expect(s.computation('habitual')!.measures.cost.missing).toEqual(['peajes']);
    s.setParams({ tolls: 0 });
    expect(s.computation('habitual')!.measures.cost.type).toBe('estimado');
    expect(s.canQuote()).toBe(true);
  });

  it('al cambiar el recorrido se descartan los textos de los tramos (sus campos dejan de existir)', () => {
    const s = lista();
    s.setTextIssue('habitual.leg.0.km', 'abc');
    s.setTextIssue('params.tolls', 'x');
    s.setInputs({ destination: 'Otra Calle 9, Puente Alto' });
    expect(Object.keys(s.getSnapshot().textIssues)).toEqual(['params.tolls']);
    s.setTextIssue('habitual.leg.0.km', 'abc');
    s.useManual('habitual');
    expect(Object.keys(s.getSnapshot().textIssues)).toEqual(['params.tolls']);
  });
});

// ---------------------------------------------------------------------------
describe('A-73 · 1b. el texto inválido se recupera literalmente del borrador', () => {
  function recargar(d: unknown): QuoteSession {
    const store = new MemoryKeyValueStore();
    store.setItem(DRAFT_KEY, JSON.stringify({ local: { format: 1, savedAt: '2026-11-22T00:00:00Z', data: d } }));
    const r = new DraftStore(store).read('local');
    expect(r.status).toBe('ok');
    const s = new QuoteSession(noRoutes);
    if (r.status === 'ok') s.restoreDraft(r.draft.data);
    return s;
  }

  it('costo, margen, recargo y tramo con texto inválido vuelven tal cual; precio y comparación no', () => {
    const s = lista();
    s.setTextIssue('params.tolls', 'abc');
    s.setTextIssue('margin', 'quince');
    s.setTextIssue('surcharges', '-1');
    s.setTextIssue('habitual.leg.0.minutes', '40 min');
    s.setTextIssue('chosenPrice', 'caro');
    s.setTextIssue('tollsComparison', 'x');
    const nueva = recargar(s.draftData());
    expect(nueva.getSnapshot().textIssues).toEqual({ 'params.tolls': 'abc', margin: 'quince', surcharges: '-1', 'habitual.leg.0.minutes': '40 min' });
    // El recorrido recuperado se conserva: el texto inválido no lo descarta (solo los valores fuera de rango, A-70).
    expect(nueva.getSnapshot().habitual).toMatchObject({ status: 'manual', recovered: true });
    expect(nueva.canQuote()).toBe(false);
    expect(render(nueva)).toContain('value="abc"');
  });

  it('entradas manipuladas se filtran: clave desconocida, texto que sí es número y tramo inexistente', () => {
    const d = lista().draftData();
    const nueva = recargar({ ...d, invalidTexts: { 'params.tolls': 'abc', 'otra.cosa': 'x', 'params.helpers': '3', 'habitual.leg.2.km': 'x' } });
    expect(nueva.getSnapshot().textIssues).toEqual({ 'params.tolls': 'abc' });
  });

  it('un campo invalidTexts dañado se ignora sin perder el resto del borrador; los borradores anteriores se leen igual', () => {
    const d = lista().draftData();
    const dañado = recargar({ ...d, invalidTexts: 'basura' });
    expect(dañado.getSnapshot().textIssues).toEqual({});
    expect(dañado.getSnapshot().params).toEqual(d.params);
    const { invalidTexts: _x, ...anterior } = d as DraftData & { invalidTexts?: unknown };
    expect(recargar(anterior).getSnapshot().textIssues).toEqual({});
  });
});

// ---------------------------------------------------------------------------
describe('A-73 · 2. la comparación opcional no bloquea la cotización principal', () => {
  it('peajes de la comparación 1e308: la comparación queda en pausa y la principal se puede emitir', async () => {
    const s = await conComparacion();
    s.setTollsComparison(1e308);
    expect(s.computation('evitarPeajes')).toBeNull();
    expect(s.numericIssues().tollsComparison).toBeTruthy();
    expect(s.canQuote()).toBe(true);
    expect(buildJobRecord(s, form, issuer, meta)).not.toBeNull();
    const html = render(s);
    expect(html).toContain('data-testid="pausa-comparacion"');
    expect(html).not.toContain('data-testid="bloqueo-numeros"');
  });

  it('corrección inválida en un tramo de la ruta sin peajes, o texto inválido en sus peajes: igual', async () => {
    const s = await conComparacion();
    s.setLegOverride('evitarPeajes', 0, { km: 1e308 });
    s.setTextIssue('tollsComparison', 'abc');
    s.setTextIssue('evitarPeajes.leg.0.minutes', 'x');
    expect(s.computation('evitarPeajes')).toBeNull();
    expect(s.canQuote()).toBe(true);
    expect(buildJobRecord(s, form, issuer, meta)).not.toBeNull();
  });

  it('un error de la ruta principal sí bloquea, aunque la comparación esté bien', async () => {
    const s = await conComparacion();
    s.setLegOverride('habitual', 0, { km: 1e308 });
    expect(s.canQuote()).toBe(false);
    expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('A-73 · 3. «Mi vehículo»: rendimiento mínimo 0,1 km/L sin perder vehículos guardados', () => {
  const antiguo: VehicleProfile = { id: 'v-antiguo', name: 'Camioneta antigua', type: 'camioneta', fuel: 'diesel', kmPerL: 0.05, wearPerKm: 31, createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T00:00:00Z' };

  it('crear o editar exige ≥ 0,1 km/L (o vacío); 0,1 y 100 son válidos', () => {
    const base = { name: 'Furgón', type: 'furgon' as const, fuel: 'diesel' as const, wearPerKm: 31 };
    for (const kmPerL of [0.1, 12, 100, null]) expect(validateVehicleInput({ ...base, kmPerL }).kmPerL).toBe(kmPerL);
    for (const kmPerL of [0.05, 0.0999, 1e-300, 0]) {
      try {
        validateVehicleInput({ ...base, kmPerL });
        throw new Error('debió rechazarse');
      } catch (e) {
        expect(e).toBeInstanceOf(VehicleValidationError);
        expect((e as VehicleValidationError).issues.kmPerL).toMatch(/desde 0,1 km\/L/);
      }
    }
  });

  it('un vehículo guardado antes con 0,05 km/L se sigue listando IDÉNTICO, marcado para revisión', async () => {
    const store = new MemoryKeyValueStore();
    store.setItem(VEHICLES_KEY, JSON.stringify({ version: 1, vehicles: [antiguo], defaultId: antiguo.id }));
    const repo = new LocalVehicleRepository(store);
    const lista = await repo.list();
    expect(lista).toEqual([antiguo]);
    expect(vehicleNeedsReview(lista[0]!)).toBe(true);
    expect(store.getItem(VEHICLES_KEY)).toContain('"kmPerL":0.05');
    const html = renderToStaticMarkup(createElement(VehiclesView, { repository: repo, vehicles: lista, defaultId: antiguo.id, onChanged: async () => undefined, onUse: () => undefined }));
    expect(html).toContain('data-testid="vehiculo-revisar"');
  });

  it('editarlo sin corregir el rendimiento no lo cambia en silencio: se rechaza y queda igual', async () => {
    const store = new MemoryKeyValueStore();
    store.setItem(VEHICLES_KEY, JSON.stringify({ version: 1, vehicles: [antiguo], defaultId: null }));
    const repo = new LocalVehicleRepository(store);
    await expect(repo.update(antiguo.id, { name: antiguo.name, type: antiguo.type, fuel: antiguo.fuel, kmPerL: 0.05, wearPerKm: 31 })).rejects.toBeInstanceOf(VehicleValidationError);
    expect(await repo.list()).toEqual([antiguo]);
    const corregido = await repo.update(antiguo.id, { name: antiguo.name, type: antiguo.type, fuel: antiguo.fuel, kmPerL: 9, wearPerKm: 31 });
    expect(corregido.kmPerL).toBe(9);
  });

  it('aplicado en la calculadora, el rendimiento antiguo se marca y no se emite', () => {
    const s = lista();
    s.selectVehicle(antiguo);
    expect(s.numericIssues()['params.kmPerL']).toBeTruthy();
    expect(s.canQuote()).toBe(false);
  });
});
