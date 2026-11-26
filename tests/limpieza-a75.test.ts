/**
 * A-75 (P1 de la auditoría de A-73): cuando una acción REEMPLAZA el valor de un campo por otro (cargar
 * el ejemplo ficticio, elegir o restaurar un vehículo, elegir un margen predefinido), se quita el
 * error de texto de ESE campo. Los demás campos conservan su error y ningún valor cambia en silencio.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { VehicleProfile } from '../src/shared/vehicle';
import { Calculator } from '../src/web/components/Calculator';
import { DRAFT_KEY, DraftStore } from '../src/web/draftStore';
import { buildJobRecord } from '../src/web/jobs';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { MemoryKeyValueStore } from '../src/web/vehicleRepository';

const noRoutes: RouteClient = { requestRoute: vi.fn(async () => { throw new Error('sin red'); }) };
/** Mismos valores que el botón «Cargar ejemplo ficticio» de Calculator.tsx. */
const EJEMPLO = { fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 1, helperFee: 15000, loadMinutes: 60, tolls: 4200, otherCosts: 0 };
const form = { clientName: 'Cliente ficticio', serviceDescription: 'Flete', includes: 'Carga y descarga', conditions: '', serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Maipú' };
const issuer = { name: 'Fletes Prueba', phone: '', email: '' };
const meta = { id: '00000000-0000-4000-8000-000000000001', number: 1, createdAt: '2026-11-22' };
const vehiculo: VehicleProfile = { id: 'v1', name: 'Furgón', type: 'furgon', fuel: 'diesel', kmPerL: 9, wearPerKm: 40, createdAt: '2026-11-22T00:00:00Z', updatedAt: '2026-11-22T00:00:00Z' };

function lista(): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.useManual('habitual');
  s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  s.setParams(EJEMPLO);
  s.setChosenPrice(80000);
  return s;
}
const render = (s: QuoteSession) =>
  renderToStaticMarkup(createElement(Calculator, { session: s, vehicles: [vehiculo], onManageVehicles: () => undefined, onCreateQuote: () => undefined }));
const confirmar = (s: QuoteSession) => {
  if (s.priceNeedsConfirmation()) s.confirmPrice();
};

describe('A-75 · «Cargar ejemplo ficticio» quita los errores de texto de los campos que reemplaza', () => {
  it('combustible «abc» → cargar el ejemplo: el campo queda con 1.050, sin error, y se puede cotizar', () => {
    const s = lista();
    s.setTextIssue('params.fuelPricePerL', 'abc');
    expect(s.canQuote()).toBe(false);
    s.setParams(EJEMPLO); // lo que hace el botón
    confirmar(s);
    expect(s.getSnapshot().textIssues).toEqual({});
    expect(s.getSnapshot().params.fuelPricePerL).toBe(1050);
    expect(s.quoteBlockers()).toEqual([]);
    expect(s.canQuote()).toBe(true);
    expect(buildJobRecord(s, form, issuer, meta)).not.toBeNull();
    expect(render(s)).not.toContain('value="abc"');
  });

  it('no toca los errores de campos que el ejemplo no reemplaza (margen, recargos, tramos, precio)', () => {
    const s = lista();
    s.setTextIssue('params.tolls', 'x');
    s.setTextIssue('margin', 'quince');
    s.setTextIssue('surcharges', '?');
    s.setTextIssue('habitual.leg.0.km', 'veinte');
    s.setTextIssue('chosenPrice', 'caro');
    s.setParams(EJEMPLO);
    expect(Object.keys(s.getSnapshot().textIssues).sort()).toEqual(['chosenPrice', 'habitual.leg.0.km', 'margin', 'surcharges']);
    expect(s.canQuote()).toBe(false);
  });

  it('el valor reemplazado no cambia ningún otro valor', () => {
    const s = lista();
    s.setMargin(0.2);
    s.setSurcharges(3000);
    const antes = structuredClone(s.getSnapshot());
    s.setTextIssue('params.wearPerKm', 'x');
    s.setParams(EJEMPLO);
    const despues = s.getSnapshot();
    expect(despues.margin).toBe(antes.margin);
    expect(despues.surcharges).toBe(antes.surcharges);
    expect(despues.habitual.manualLegs).toEqual(antes.habitual.manualLegs);
    expect(despues.chosenPrice).toBe(antes.chosenPrice);
  });
});

describe('A-75 · margen predefinido', () => {
  it('«Otro» = «abc» → elegir 15 %: el margen deja de bloquear y la cotización se puede emitir', () => {
    const s = lista();
    s.setTextIssue('margin', 'abc');
    expect(s.quoteBlockers()).toEqual(['margin']);
    expect(s.canQuote()).toBe(false);
    s.setMargin(0.15); // botón «15 %»
    expect(s.getSnapshot().textIssues).toEqual({});
    expect(s.getSnapshot().margin).toBe(0.15);
    expect(s.canQuote()).toBe(true);
    expect(buildJobRecord(s, form, issuer, meta)).not.toBeNull();
    // Ya sin error, el campo «Otro» deja de forzarse abierto y no queda ningún aviso.
    const html = render(s);
    expect(html).not.toContain('data-testid="bloqueo-numeros"');
    expect(html).not.toContain('value="abc"');
  });

  it('elegir un margen no quita el error de otro campo', () => {
    const s = lista();
    s.setTextIssue('margin', 'abc');
    s.setTextIssue('params.tolls', 'x');
    s.setMargin(0.1);
    expect(Object.keys(s.getSnapshot().textIssues)).toEqual(['params.tolls']);
    expect(s.canQuote()).toBe(false);
  });
});

describe('A-75 · elegir o restaurar un vehículo', () => {
  it('rendimiento y desgaste ilegibles → elegir un vehículo válido: se quitan sus dos errores y nada más', () => {
    const s = lista();
    s.setTextIssue('params.kmPerL', 'abc');
    s.setTextIssue('params.wearPerKm', 'x');
    s.setTextIssue('params.fuelPricePerL', 'y');
    s.selectVehicle(vehiculo);
    expect(Object.keys(s.getSnapshot().textIssues)).toEqual(['params.fuelPricePerL']);
    expect(s.getSnapshot().params).toMatchObject({ kmPerL: 9, wearPerKm: 40, fuelPricePerL: 1050 });
  });

  it('«Restaurar valores del vehículo» también quita esos dos errores', () => {
    const s = lista();
    s.selectVehicle(vehiculo);
    s.setParams({ kmPerL: 10 }); // ajuste solo para esta cotización
    s.setTextIssue('params.kmPerL', 'abc');
    s.setTextIssue('params.tolls', 'x');
    s.restoreVehicleValues();
    expect(Object.keys(s.getSnapshot().textIssues)).toEqual(['params.tolls']);
    expect(s.getSnapshot().params.kmPerL).toBe(9);
  });

  it('dejar de usar el vehículo («Sin vehículo») no cambia valores ni quita errores', () => {
    const s = lista();
    s.setTextIssue('params.kmPerL', 'abc');
    s.selectVehicle(null);
    expect(s.getSnapshot().textIssues).toEqual({ 'params.kmPerL': 'abc' });
  });

  it('un vehículo con un rendimiento fuera de rango reemplaza el texto, pero sigue marcado (nada en silencio)', () => {
    const s = lista();
    s.setTextIssue('params.kmPerL', 'abc');
    s.selectVehicle({ ...vehiculo, kmPerL: 0.05 });
    expect(s.getSnapshot().textIssues).toEqual({});
    expect(s.numericIssues()['params.kmPerL']).toMatch(/Usa 0 si no lo sabes/);
    expect(s.canQuote()).toBe(false);
  });
});

describe('A-75 · los campos y el borrador', () => {
  it('fijar un tramo, los recargos, el precio o los peajes de la comparación quita solo su propio error', () => {
    const s = lista();
    for (const k of ['habitual.leg.0.km', 'habitual.leg.0.minutes', 'surcharges', 'chosenPrice', 'tollsComparison']) s.setTextIssue(k, 'abc');
    s.setLegOverride('habitual', 0, { km: 30 });
    expect(s.getSnapshot().textIssues['habitual.leg.0.km']).toBeUndefined();
    expect(s.getSnapshot().textIssues['habitual.leg.0.minutes']).toBe('abc');
    s.setSurcharges(0);
    s.setChosenPrice(90000);
    s.setTollsComparison(0);
    expect(Object.keys(s.getSnapshot().textIssues)).toEqual(['habitual.leg.0.minutes']);
  });

  it('tras reemplazar el valor, el borrador ya no guarda el texto antiguo y al recargar no reaparece', () => {
    const s = lista();
    s.setTextIssue('params.fuelPricePerL', 'abc');
    s.setTextIssue('margin', 'quince');
    s.setParams(EJEMPLO);
    s.setMargin(0.15);
    const store = new MemoryKeyValueStore();
    new DraftStore(store).write('local', s.draftData());
    expect(JSON.parse(store.getItem(DRAFT_KEY)!).local.data.invalidTexts).toEqual({});
    const r = new DraftStore(store).read('local');
    const nueva = new QuoteSession(noRoutes);
    if (r.status === 'ok') nueva.restoreDraft(r.draft.data);
    expect(nueva.getSnapshot().textIssues).toEqual({});
  });
});
