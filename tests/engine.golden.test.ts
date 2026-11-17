/**
 * Casos dorados de docs/03-motor-de-costos.md §3F y escenarios A/B de §4.
 * Los montos son ficticios. Una planilla independiente debe confirmar estos valores (#24).
 */
import { describe, expect, it } from 'vitest';
import { compareRoutes } from '../src/engine/compare';
import { buildCostItems, EMPTY_PARAMS } from '../src/engine/inputs';
import { computeMeasures } from '../src/engine/measures';
import { displayAmount, displayThreshold } from '../src/engine/rounding';
import { applyTax, selectableRules, type TaxRule } from '../src/engine/tax';
import type { CostItem } from '../src/engine/types';
import { CLIENT_QUOTE_KEYS, toClientQuote, whatsappText, type JobRecord } from '../src/shared/clientQuote';
import taxData from '../data/tax-rules.json';

/** Partidas del ejemplo v4 (ruta con autopista). `null` = faltante. */
function v4Items(o: Partial<Record<string, number | null>> = {}): CostItem[] {
  const v = { combustible: 5023, peajes: 4200, ayudantes: 15000, desgaste: 1779, gastosFijos: 3350, remuneracion: 13400, ...o };
  return [
    { id: 'combustible', label: 'Combustible', category: 'desembolso', amount: v.combustible },
    { id: 'peajes', label: 'Peajes', category: 'desembolso', amount: v.peajes },
    { id: 'ayudantes', label: 'Ayudantes', category: 'desembolso', amount: v.ayudantes },
    { id: 'desgaste', label: 'Desgaste', category: 'desgaste', amount: v.desgaste },
    { id: 'gastosFijos', label: 'Gastos fijos', category: 'fijo', amount: v.gastosFijos },
    { id: 'remuneracion', label: 'Remuneración', category: 'remuneracion', amount: v.remuneracion },
  ];
}
const show = displayAmount;

describe('Casos dorados G1–G10', () => {
  it('G1 — ruta con autopista completa', () => {
    const m = computeMeasures({ items: v4Items(), margin: 0.15, price: 55000 });
    expect(show(m.cost)).toBe(42752);
    expect(m.cost.type).toBe('estimado');
    expect(m.suggested.value).toBe(51000);
    expect(show(m.afterTrip!)).toBe(30777);
    expect(show(m.afterAllCosts!)).toBe(25648);
    expect(show(m.overGoal!)).toBe(12248);
  });

  it('G2 — ruta sin peajes completa: C = 44.199 → sugerido 52.000', () => {
    const items: CostItem[] = [{ id: 'total', label: 'Total', category: 'desembolso', amount: 44199 }];
    expect(computeMeasures({ items, margin: 0.15 }).suggested.value).toBe(52000);
  });

  it('G3 — faltan peajes y gastos fijos (estado v4)', () => {
    const m = computeMeasures({ items: v4Items({ peajes: null, gastosFijos: null }), margin: 0.15, price: 55000 });
    expect(m.cost).toMatchObject({ type: 'cotaInferior' });
    expect(show(m.cost)).toBe(35202);
    expect(m.suggested).toMatchObject({ value: 42000, type: 'cotaInferior' });
    expect(m.afterTrip).toMatchObject({ type: 'cotaSuperior' });
    expect(show(m.afterTrip!)).toBe(34977);
    expect(show(m.afterAllCosts!)).toBe(33198);
    expect(show(m.overGoal!)).toBe(19798);
    expect(m.missing.sort()).toEqual(['gastosFijos', 'peajes']);
  });

  it('G4 — falta solo CF: lo que queda tras pagar el viaje es estimado; el resto, cota superior', () => {
    const m = computeMeasures({ items: v4Items({ gastosFijos: null }), margin: 0.15, price: 55000 });
    expect(show(m.cost)).toBe(39402);
    expect(m.suggested.value).toBe(47000);
    expect(m.afterTrip).toMatchObject({ type: 'estimado' });
    expect(show(m.afterTrip!)).toBe(30777);
    expect(m.afterAllCosts!.type).toBe('cotaSuperior');
    expect(show(m.afterAllCosts!)).toBe(28998);
    expect(show(m.overGoal!)).toBe(15598);
  });

  it('G5 — comparación sin peajes de la autopista: umbral 5.647', () => {
    const x = { items: v4Items({ peajes: null }), km: 57.4, hours: 2.23 };
    const yItems: CostItem[] = [{ id: 'total', label: 'Total', category: 'desembolso', amount: 44199 }];
    const y = { items: yItems, km: 62.3, hours: 2.67 };
    const c = compareRoutes(x, y);
    expect(c).toMatchObject({ kind: 'umbralPeajes', route: 'x' });
    if (c.kind === 'umbralPeajes') expect(displayThreshold(c.threshold)).toBe(5647);
    const withTolls = (t: number) => compareRoutes({ ...x, items: v4Items({ peajes: t }) }, y);
    expect(withTolls(4200)).toMatchObject({ kind: 'concluyente', cheaper: 'x' });
    expect(withTolls(6000)).toMatchObject({ kind: 'concluyente', cheaper: 'y' });
    expect(withTolls(5647)).toMatchObject({ kind: 'concluyente', cheaper: 'empate' });
  });

  it('G6 — rendimiento desconocido en ambas rutas: no concluyente, umbral ≈ $162,9/km', () => {
    const mk = (other: number): CostItem[] => [
      { id: 'combustible', label: 'Combustible', category: 'desembolso', amount: null },
      { id: 'resto', label: 'Resto', category: 'desembolso', amount: other },
    ];
    const c = compareRoutes({ items: mk(37729), km: 57.4, hours: 2 }, { items: mk(36931), km: 62.3, hours: 2 });
    expect(c.kind).toBe('umbralTarifa');
    if (c.kind === 'umbralTarifa') {
      expect(c.per).toBe('km');
      expect(c.cheaperIfAbove).toBe('x');
      expect(c.threshold).toBeCloseTo(798 / 4.9, 6);
    }
  });

  it('G7 — redondeo de cotas: inferior hacia abajo, superior hacia arriba', () => {
    expect(displayAmount({ value: 35201.6, type: 'cotaInferior', missing: ['x'] })).toBe(35201);
    expect(displayAmount({ value: 34977.4, type: 'cotaSuperior', missing: ['x'] })).toBe(34978);
    expect(displayAmount({ value: 30777.5, type: 'estimado', missing: [] })).toBe(30778);
    expect(displayThreshold(5647.4)).toBe(5647);
  });

  it('G8 — IVA: sin perfil va en neto; con regla verificada 55.000 + 10.450 = 65.450', () => {
    const rules = taxData.rules as TaxRule[];
    expect(selectableRules(rules)).toHaveLength(0); // aún no hay reglas verificadas (#16)
    expect(applyTax(55000, null, rules)).toMatchObject({ tax: null, total: 55000 });
    expect(applyTax(55000, 'iva-afecto-19', rules)).toMatchObject({ tax: null, total: 55000 }); // no verificada: no se aplica
    const verified: TaxRule[] = [{ ...rules[0]!, verified: true, verifiedAt: '2026-11-17' }];
    expect(applyTax(55000, 'iva-afecto-19', verified)).toMatchObject({ tax: 10450, total: 65450 });
  });

  it('G9 — la cotización al cliente no contiene montos ni términos internos', () => {
    const m = computeMeasures({ items: v4Items(), margin: 0.15, price: 55000 });
    const job: JobRecord = {
      id: 'j1',
      number: 7,
      createdAt: '2026-11-17',
      clientName: 'Cliente de prueba',
      serviceDescription: 'Flete en camioneta, 1 ayudante',
      includes: 'Carga y descarga',
      conditions: 'Hasta 2 pisos',
      validUntil: '2026-11-24',
      serviceDate: '2026-11-20',
      originLabel: 'Ñuñoa',
      destinationLabel: 'Las Condes',
      netPrice: 55000,
      tax: null,
      status: 'borrador',
      payment: 'pendiente',
      waypoints: [
        { role: 'A', address: 'Calle Uno 123, Ñuñoa' },
        { role: 'B', address: 'Avenida Dos 456, Las Condes' },
      ],
      internal: {
        routeSource: 'simulado',
        km: 57.4,
        minutes: 74,
        costEstimate: m.cost.value,
        costType: m.cost.type,
        suggestedPrice: m.suggested.value,
        margin: 0.15,
        missing: [],
        engineVersion: 'test',
      },
    };
    const q = toClientQuote(job, { name: 'Fletes de prueba', phone: '+56 9 0000 0000', email: 'prueba@example.com' });
    expect(Object.keys(q).sort()).toEqual([...CLIENT_QUOTE_KEYS].sort());
    const text = JSON.stringify(q) + whatsappText(q);
    for (const forbidden of ['24223', '1779', '3350', '13400', '42752', '51000', '57.4', 'combustible', 'desgaste', 'margen', 'simulado', 'calle uno']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('G10 — solo A → B: carga y descarga se cuentan una vez', () => {
    const p = { ...EMPTY_PARAMS, ownerPerHour: 6000, fixedPerHour: 1500, loadMinutes: 60, tolls: 0 };
    const items = buildCostItems(13.2, 20, p);
    const hours = (20 + 60) / 60;
    expect(items.find((i) => i.id === 'remuneracion')!.amount).toBeCloseTo(6000 * hours);
    expect(items.find((i) => i.id === 'gastosFijos')!.amount).toBeCloseTo(1500 * hours);
  });
});

describe('Escenarios A y B de docs/03 §4 (desde datos brutos)', () => {
  it('Escenario A: fletero que maneja su camioneta', () => {
    const items = buildCostItems(80, 120, {
      ...EMPTY_PARAMS,
      fuelPricePerL: 1000,
      kmPerL: 10,
      tolls: 3000,
      helpers: 1,
      helperFee: 15000,
      otherCosts: 5000, // estacionamiento 2.000 + embalaje 3.000
      wearPerKm: 31,
      fixedPerHour: 1500,
      ownerPerHour: 6000,
      loadMinutes: 60,
    });
    const m = computeMeasures({ items, margin: 0.1, price: 60000 });
    expect(show(m.D)).toBe(31000);
    expect(show(m.cost)).toBe(55980);
    expect(m.suggested.value).toBe(63000);
    expect(show(m.afterTrip!)).toBe(29000);
    expect(show(m.afterAllCosts!)).toBe(22020);
    expect(show(m.overGoal!)).toBe(4020);
  });

  it('Escenario B: con conductor contratado por servicio (D = 56.000, C = 65.980, sugerido 74.000)', () => {
    const items: CostItem[] = [
      { id: 'd', label: 'D', category: 'desembolso', amount: 56000 },
      { id: 'w', label: 'W', category: 'desgaste', amount: 2480 },
      { id: 'cf', label: 'CF', category: 'fijo', amount: 4500 },
      { id: 'r', label: 'R', category: 'remuneracion', amount: 3000 },
    ];
    const m = computeMeasures({ items, margin: 0.1, price: 60000 });
    expect(show(m.cost)).toBe(65980);
    expect(m.suggested.value).toBe(74000);
    expect(show(m.afterTrip!)).toBe(4000);
  });
});

describe('Propiedades', () => {
  it('completar un dato faltante nunca baja el costo ni sube lo que queda', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let n = 0; n < 500; n++) {
      const full = v4Items({
        combustible: Math.round(rnd() * 20000),
        peajes: Math.round(rnd() * 8000),
        gastosFijos: Math.round(rnd() * 9000),
      });
      const partial = full.map((i) => (rnd() < 0.4 ? { ...i, amount: null } : i));
      const P = 20000 + Math.round(rnd() * 80000);
      const a = computeMeasures({ items: partial, margin: 0.15, price: P });
      const b = computeMeasures({ items: full, margin: 0.15, price: P });
      expect(b.cost.value).toBeGreaterThanOrEqual(a.cost.value);
      expect(b.suggested.value).toBeGreaterThanOrEqual(a.suggested.value);
      expect(b.afterAllCosts!.value).toBeLessThanOrEqual(a.afterAllCosts!.value);
      // El valor mostrado de una cota sigue siendo cota del valor real.
      if (a.cost.type === 'cotaInferior') expect(displayAmount(a.cost)).toBeLessThanOrEqual(b.cost.value);
      if (a.afterAllCosts!.type === 'cotaSuperior') expect(displayAmount(a.afterAllCosts!)).toBeGreaterThanOrEqual(b.afterAllCosts!.value);
    }
  });

  it('rechaza márgenes fuera de 0 %–80 %', () => {
    expect(() => computeMeasures({ items: v4Items(), margin: 0.9 })).toThrow();
    expect(() => computeMeasures({ items: v4Items(), margin: -0.1 })).toThrow();
  });
});
