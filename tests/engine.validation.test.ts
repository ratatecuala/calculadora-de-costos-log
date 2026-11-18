/**
 * Validación independiente del motor económico (#24). Ver docs/15-validacion-motor.md.
 *
 * - Los valores esperados NO salen del motor: se recalcularon a mano y con
 *   `scripts/verificar-casos-dorados.mjs` (aritmética racional exacta, sin importar src/).
 * - `it(...)`: comportamiento correcto confirmado.
 * - Hallazgos C-1 a C-4: se documentaron con `it.fails(...)` y se corrigieron el 18-11 con
 *   aprobación del propietario (A-50); desde entonces son `it(...)` y protegen la corrección.
 * - «No especificado»: documenta el comportamiento ACTUAL sin aprobarlo; requiere decisión.
 *
 * Todos los montos son ficticios.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compareRoutes } from '../src/engine/compare';
import { buildCostItems, EMPTY_PARAMS, type TripParams } from '../src/engine/inputs';
import { computeMeasures } from '../src/engine/measures';
import { ceilTo, displayAmount, displayThreshold, formatClp } from '../src/engine/rounding';
import { applyTax, selectableRules, type TaxRule } from '../src/engine/tax';
import type { Bounded, CostItem, ItemCategory } from '../src/engine/types';
import { toClientQuote, whatsappText, type JobRecord } from '../src/shared/clientQuote';
import type { RouteApiResponse, RouteRequestInput, RouteResult } from '../src/shared/route';
import { boundedText } from '../src/web/format';
import { QuoteSession, type RouteClient } from '../src/web/session';
import taxData from '../data/tax-rules.json';

// ---------- Utilidades de la prueba (no reutilizan lógica del motor) ----------
const item = (id: string, category: ItemCategory, amount: number | null): CostItem => ({ id, label: id, category, amount });

/** Partidas del ejemplo v4 (docs/03 §3C y §3F). `null` = faltante. */
function v4(o: Partial<Record<'combustible' | 'peajes' | 'ayudantes' | 'desgaste' | 'gastosFijos' | 'remuneracion', number | null>> = {}) {
  const v = { combustible: 5023, peajes: 4200, ayudantes: 15000, desgaste: 1779, gastosFijos: 3350, remuneracion: 13400, ...o };
  return [
    item('combustible', 'desembolso', v.combustible),
    item('peajes', 'desembolso', v.peajes),
    item('ayudantes', 'desembolso', v.ayudantes),
    item('desgaste', 'desgaste', v.desgaste),
    item('gastosFijos', 'fijo', v.gastosFijos),
    item('remuneracion', 'remuneracion', v.remuneracion),
  ];
}
const amountOf = (items: CostItem[], id: string) => items.find((i) => i.id === id)!.amount;
const FULL: TripParams = {
  fuelPricePerL: 1000,
  kmPerL: 10,
  wearPerKm: 30,
  fixedPerHour: 1500,
  ownerPerHour: 6000,
  helpers: 1,
  helperFee: 15000,
  loadMinutes: 60,
  tolls: 3000,
  otherCosts: 2000,
};

/** Cliente de rutas falso y determinista: tramos fijos por tipo de ruta (simulan km/minutos). */
const LEGS = {
  habitual: [
    { from: 'base', to: 'A', distanceM: 18000, durationS: 1440 },
    { from: 'A', to: 'B', distanceM: 13200, durationS: 1200 },
    { from: 'B', to: 'base', distanceM: 20000, durationS: 1800 },
  ],
  evitarPeajes: [
    { from: 'base', to: 'A', distanceM: 19500, durationS: 1800 },
    { from: 'A', to: 'B', distanceM: 14600, durationS: 1560 },
    { from: 'B', to: 'base', distanceM: 21000, durationS: 2100 },
  ],
} as const;
function fakeClient(): RouteClient & { calls: number } {
  const c = {
    calls: 0,
    async requestRoute(input: RouteRequestInput): Promise<RouteApiResponse> {
      c.calls += 1;
      const legs = LEGS[input.kind].map((l) => ({ ...l }));
      const route: RouteResult = {
        kind: input.kind,
        source: 'simulado',
        legs,
        totalDistanceM: legs.reduce((s, l) => s + l.distanceM, 0),
        totalDurationS: legs.reduce((s, l) => s + l.durationS, 0),
        warnings: [],
        computedAt: '2026-11-18T00:00:00Z',
        retention: { distance: 'sesion', duration: 'sesion' },
      };
      return { status: 'ok', route, quota: null };
    },
  };
  return c;
}
const ROUND_TRIP = {
  origin: 'Calle Uno 123, Ñuñoa',
  destination: 'Avenida Dos 456, Las Condes',
  base: 'Base 1, Maipú',
  startAtBase: true,
  returnToBase: true,
};

// =====================================================================================
describe('G1–G10 contra el recálculo independiente (docs/03 §3F)', () => {
  it('G1 — completo: C 42.752; sugerido 51.000; 30.777 / 25.648 / +12.248, todo «estimado»', () => {
    const m = computeMeasures({ items: v4(), margin: 0.15, price: 55000 });
    expect(displayAmount(m.D)).toBe(24223);
    expect(displayAmount(m.cost)).toBe(42752);
    expect(m.cost.value / 0.85).toBeCloseTo(50296.47, 2);
    expect(m.suggested).toEqual({ value: 51000, type: 'estimado', missing: [] });
    expect([m.afterTrip, m.afterAllCosts, m.overGoal].map((b) => [displayAmount(b!), b!.type])).toEqual([
      [30777, 'estimado'],
      [25648, 'estimado'],
      [12248, 'estimado'],
    ]);
    expect(m.complete).toBe(true);
  });

  it('G2 — C 44.199 con m = 15 %: 51.998,8 → 52.000', () => {
    const m = computeMeasures({ items: [item('total', 'desembolso', 44199)], margin: 0.15 });
    expect(m.suggested.value).toBe(52000);
  });

  it('G3 — faltan peajes y CF: «35.202 o más», «al menos 42.000», como máximo 34.977 / 33.198 / +19.798', () => {
    const m = computeMeasures({ items: v4({ peajes: null, gastosFijos: null }), margin: 0.15, price: 55000 });
    expect(boundedText(m.cost, 'costo')).toBe(`${formatClp(35202)} o más`);
    expect(boundedText(m.suggested, 'precio')).toBe(`al menos ${formatClp(42000)}`);
    expect(boundedText(m.afterTrip!, 'resultado')).toBe(`como máximo ${formatClp(34977)}`);
    expect(boundedText(m.afterAllCosts!, 'resultado')).toBe(`como máximo ${formatClp(33198)}`);
    expect(displayAmount(m.overGoal!)).toBe(19798);
    expect(m.overGoal!.type).toBe('cotaSuperior');
    // Los desglose por medida también son cotas cuando les falta algo.
    expect(m.D.type).toBe('cotaInferior');
    expect(m.CF).toEqual({ value: 0, type: 'cotaInferior', missing: ['gastosFijos'] });
    expect(m.W.type).toBe('estimado');
  });

  it('G4 — falta solo CF: P − D estimado 30.777; como máximo 28.998 y +15.598; «al menos 47.000»', () => {
    const m = computeMeasures({ items: v4({ gastosFijos: null }), margin: 0.15, price: 55000 });
    expect(boundedText(m.cost, 'costo')).toBe(`${formatClp(39402)} o más`);
    expect(m.suggested).toMatchObject({ value: 47000, type: 'cotaInferior' });
    expect(m.afterTrip).toEqual({ value: 30777, type: 'estimado', missing: [] });
    expect(m.afterAllCosts).toMatchObject({ value: 28998, type: 'cotaSuperior', missing: ['gastosFijos'] });
    expect(m.overGoal).toMatchObject({ value: 15598, type: 'cotaSuperior' });
  });

  it('G5 — umbral 5.647; 4.200 → autopista; 6.000 → sin peajes; 5.647 → empate', () => {
    const y = { items: [item('total', 'desembolso', 44199)], km: 62.3, hours: 2.67 };
    const c = compareRoutes({ items: v4({ peajes: null }), km: 57.4, hours: 2.23 }, y);
    expect(c).toEqual({ kind: 'umbralPeajes', route: 'x', threshold: 5647 });
    const v = (t: number) => compareRoutes({ items: v4({ peajes: t }), km: 57.4, hours: 2.23 }, y);
    expect(v(4200)).toEqual({ kind: 'concluyente', cheaper: 'x', difference: 1447 });
    expect(v(6000)).toEqual({ kind: 'concluyente', cheaper: 'y', difference: 353 });
    expect(v(5647)).toEqual({ kind: 'concluyente', cheaper: 'empate', difference: 0 });
  });

  it('G6 — combustible desconocido en ambas: umbral 798/4,9 = 1.140/7 ≈ 162,857 $/km a favor de la autopista', () => {
    const mk = (other: number) => [item('combustible', 'desembolso', null), item('resto', 'desembolso', other)];
    const c = compareRoutes({ items: mk(37729), km: 57.4, hours: 2 }, { items: mk(36931), km: 62.3, hours: 2 });
    expect(c).toMatchObject({ kind: 'umbralTarifa', item: 'combustible', per: 'km', cheaperIfAbove: 'x' });
    if (c.kind === 'umbralTarifa') expect(c.threshold).toBeCloseTo(1140 / 7, 9);
  });

  it('G7 — cotas: 35.201,6 → 35.201 (piso); 34.977,4 → 34.978 (techo); umbral 5.647,4 → 5.647', () => {
    expect(displayAmount({ value: 35201.6, type: 'cotaInferior', missing: ['x'] })).toBe(35201);
    expect(displayAmount({ value: 34977.4, type: 'cotaSuperior', missing: ['x'] })).toBe(34978);
    expect(displayThreshold(5647.4)).toBe(5647);
  });

  it('G8 — IVA: sin perfil neto 55.000 e IVA nulo; regla verificada 19 % → 10.450 y 65.450', () => {
    const rules = taxData.rules as TaxRule[];
    expect(applyTax(55000, null, rules)).toMatchObject({ net: 55000, tax: null, total: 55000, ruleId: null });
    const verified: TaxRule[] = [{ ...rules[0]!, verified: true, verifiedAt: '2026-11-18' }];
    expect(applyTax(55000, 'iva-afecto-19', verified)).toEqual({ net: 55000, tax: 10450, total: 65450, ruleId: 'iva-afecto-19', notice: null });
  });

  it('G9 — la cotización no contiene montos internos ni con ni sin separador de miles', () => {
    const m = computeMeasures({ items: v4(), margin: 0.15, price: 55000 });
    const job: JobRecord = {
      id: 'j1',
      number: 7,
      createdAt: '2026-11-18',
      clientName: 'Cliente de prueba',
      serviceDescription: 'Flete en camioneta',
      includes: 'Carga y descarga',
      conditions: '',
      validUntil: '2026-11-25',
      serviceDate: '2026-11-20',
      originLabel: 'Ñuñoa',
      destinationLabel: 'Las Condes',
      netPrice: 55000,
      tax: null,
      status: 'borrador',
      payment: 'pendiente',
      waypoints: [],
      internal: {
        routeSource: 'simulado',
        km: 57.4,
        minutes: 74,
        costEstimate: m.cost.value,
        costType: m.cost.type,
        suggestedPrice: m.suggested.value,
        margin: 0.15,
        missing: [],
        engineVersion: 'validacion',
      },
    };
    const q = toClientQuote(job, { name: 'Fletes de prueba', phone: '+56 9 0000 0000', email: 'prueba@example.com' });
    const text = (JSON.stringify(q) + '\n' + whatsappText(q)).toLowerCase();
    for (const n of [24223, 1779, 3350, 13400, 42752, 51000, 30777, 25648, 12248]) {
      expect(text).not.toContain(String(n));
      expect(text).not.toContain(formatClp(n).replace('$', '').toLowerCase());
    }
    for (const w of ['0.15', '15 %', 'margen', 'margin', 'internal', 'costestimate', 'suggested', 'remuneraci', 'gastos fijos']) expect(text).not.toContain(w);
  });

  it('G10 — solo A → B: un tramo; H = conducción + carga y descarga, una vez', () => {
    const s = new QuoteSession(fakeClient());
    s.setInputs({ origin: ROUND_TRIP.origin, destination: ROUND_TRIP.destination });
    s.useManual('habitual');
    expect(s.getSnapshot().habitual.manualLegs.map((l) => `${l.from}>${l.to}`)).toEqual(['A>B']);
    s.setParams({ ...EMPTY_PARAMS, ownerPerHour: 6000, fixedPerHour: 1500, loadMinutes: 60, tolls: 0 });
    s.setLegOverride('habitual', 0, { km: 13.2, minutes: 20 });
    const c = s.computation('habitual')!;
    expect(c.legs).toHaveLength(1);
    // H = (20 + 60)/60 = 4/3 h → R = 8.000, CF = 2.000.
    expect(amountOf(c.items, 'remuneracion')).toBeCloseTo(8000, 9);
    expect(amountOf(c.items, 'gastosFijos')).toBeCloseTo(2000, 9);
  });
});

// =====================================================================================
describe('Comportamiento correcto confirmado', () => {
  describe('margen', () => {
    it('acepta 0 % y 80 % exactos; rechaza > 80 %, ≥ 100 %, negativos, NaN e Infinity', () => {
      const items = [item('total', 'desembolso', 42752)];
      expect(computeMeasures({ items, margin: 0 }).suggested.value).toBe(43000); // ⌈42.752⌉₁₀₀₀
      expect(computeMeasures({ items, margin: 0.8 }).suggested.value).toBe(214000); // 42.752/0,2 = 213.760
      for (const m of [0.8000001, 0.9, 0.99, 1, 1.5, -0.01, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(() => computeMeasures({ items, margin: m }), `margen ${m}`).toThrow();
      }
    });

    it('el precio sugerido no baja al subir el costo ni al subir el margen (monotonía)', () => {
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
      for (let n = 0; n < 400; n++) {
        const c = Math.round(rnd() * 200000);
        const m = Math.round(rnd() * 80) / 100;
        const base = computeMeasures({ items: [item('t', 'desembolso', c)], margin: m }).suggested.value;
        const more = computeMeasures({ items: [item('t', 'desembolso', c + 1 + Math.round(rnd() * 5000))], margin: m }).suggested.value;
        const higherM = computeMeasures({ items: [item('t', 'desembolso', c)], margin: Math.min(0.8, m + 0.01) }).suggested.value;
        expect(more).toBeGreaterThanOrEqual(base);
        expect(higherM).toBeGreaterThanOrEqual(base);
        // Y nunca queda por debajo de C/(1 − m).
        expect(base).toBeGreaterThanOrEqual(c / (1 - m) - 1e-6);
      }
    });

    it('los recargos se suman DESPUÉS de dividir por (1 − m): ⌈42.752/0,85 + 2.000⌉ = 53.000', () => {
      expect(computeMeasures({ items: v4(), margin: 0.15, surcharges: 2000 }).suggested.value).toBe(53000);
    });
  });

  describe('techo a 1.000 y redondeo al mostrar', () => {
    it('múltiplos exactos no suben; un peso más sí; errores de coma flotante no inflan el precio', () => {
      expect(ceilTo(51000, 1000)).toBe(51000);
      expect(ceilTo(51001, 1000)).toBe(52000);
      expect(ceilTo(50999.01, 1000)).toBe(51000);
      expect(ceilTo(0.1 * 3 * 1000 * 170, 1000)).toBe(51000); // 51.000,000000000007 por coma flotante
    });

    it('una cota mostrada sigue siendo cota del valor interno (inferior → piso, superior → techo)', () => {
      let seed = 99;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
      for (let n = 0; n < 1000; n++) {
        const v = Math.round(rnd() * 1e9) / 1000 - 5e5;
        const lo: Bounded = { value: v, type: 'cotaInferior', missing: ['x'] };
        const hi: Bounded = { value: v, type: 'cotaSuperior', missing: ['x'] };
        expect(displayAmount(lo)).toBeLessThanOrEqual(v + 1e-6);
        expect(displayAmount(hi)).toBeGreaterThanOrEqual(v - 1e-6);
        expect(displayThreshold(Math.abs(v))).toBeLessThanOrEqual(Math.abs(v) + 1e-6);
      }
    });
  });

  describe('valores faltantes y declarados', () => {
    it('null ≠ 0: peajes desconocidos son faltante; 0 declarado es estimado', () => {
      expect(amountOf(buildCostItems(10, 10, { ...FULL, tolls: null }), 'peajes')).toBeNull();
      expect(amountOf(buildCostItems(10, 10, { ...FULL, tolls: 0 }), 'peajes')).toBe(0);
      expect(computeMeasures({ items: buildCostItems(10, 10, { ...FULL, tolls: null }), margin: 0.15 }).cost.type).toBe('cotaInferior');
      expect(computeMeasures({ items: buildCostItems(10, 10, { ...FULL, tolls: 0 }), margin: 0.15 }).cost.type).toBe('estimado');
    });

    it('rendimiento 0, negativo o NaN → combustible FALTANTE (nunca 0); precio 0 declarado → combustible 0', () => {
      for (const kmPerL of [0, -5, Number.NaN, null]) {
        expect(amountOf(buildCostItems(50, 60, { ...FULL, kmPerL }), 'combustible'), `rendimiento ${kmPerL}`).toBeNull();
      }
      expect(amountOf(buildCostItems(50, 60, { ...FULL, fuelPricePerL: null }), 'combustible')).toBeNull();
      expect(amountOf(buildCostItems(50, 60, { ...FULL, fuelPricePerL: 0 }), 'combustible')).toBe(0);
    });

    it('ayudantes > 0 sin pago conocido es faltante; sin ayudantes vale 0 aunque no haya pago', () => {
      expect(amountOf(buildCostItems(10, 10, { ...FULL, helpers: 2, helperFee: null }), 'ayudantes')).toBeNull();
      expect(amountOf(buildCostItems(10, 10, { ...FULL, helpers: 0, helperFee: null }), 'ayudantes')).toBe(0);
      expect(amountOf(buildCostItems(10, 10, { ...FULL, helpers: 2, helperFee: 15000 }), 'ayudantes')).toBe(30000);
    });

    it('cada faltante aparece una vez en `missing` y completar un dato nunca baja el costo', () => {
      const m = computeMeasures({ items: buildCostItems(10, 10, EMPTY_PARAMS), margin: 0.15, price: 50000 });
      expect(m.missing).toEqual(['combustible', 'peajes', 'desgaste', 'gastosFijos', 'remuneracion']);
      expect(m.afterTrip!.missing).toEqual(['combustible', 'peajes']);
      expect(m.afterAllCosts!.missing).toEqual(['combustible', 'peajes', 'desgaste', 'gastosFijos']);
      const done = computeMeasures({ items: buildCostItems(10, 10, FULL), margin: 0.15, price: 50000 });
      expect(done.cost.value).toBeGreaterThanOrEqual(m.cost.value);
      expect(done.afterAllCosts!.value).toBeLessThanOrEqual(m.afterAllCosts!.value);
    });
  });

  describe('kilómetros y minutos límite', () => {
    it('0 km y 0 min: combustible y desgaste 0; CF y R solo por carga y descarga', () => {
      const items = buildCostItems(0, 0, FULL);
      expect(amountOf(items, 'combustible')).toBe(0);
      expect(amountOf(items, 'desgaste')).toBe(0);
      expect(amountOf(items, 'gastosFijos')).toBe(1500); // 1 h de carga
      expect(amountOf(items, 'remuneracion')).toBe(6000);
    });

    it('km enormes (1.000.000) son proporcionales y finitos', () => {
      const items = buildCostItems(1_000_000, 600_000, FULL);
      expect(amountOf(items, 'combustible')).toBe(100_000_000); // 1e6/10 × 1.000
      expect(amountOf(items, 'desgaste')).toBe(30_000_000);
      const m = computeMeasures({ items, margin: 0.15 });
      expect(Number.isFinite(m.suggested.value)).toBe(true);
      expect(m.suggested.value % 1000).toBe(0);
    });
  });

  describe('tramos múltiples, ida y vuelta y km/minutos simulados', () => {
    it('base → A → B → base con km/minutos simulados: suma una vez y calcula cada ruta por separado', async () => {
      const client = fakeClient();
      const s = new QuoteSession(client);
      s.setInputs(ROUND_TRIP);
      s.setParams(FULL);
      s.setMargin(0.15);
      s.setChosenPrice(55000);
      await s.calculateRoute();
      const h = s.computation('habitual')!;
      // 18 + 13,2 + 20 = 51,2 km; 24 + 20 + 30 = 74 min.
      expect(h.legs).toHaveLength(3);
      expect(h.km).toBeCloseTo(51.2, 9);
      expect(h.minutes).toBeCloseTo(74, 9);
      expect(h.source).toBe('simulado');
      // H = (74 + 60)/60; D = 5.120 + 3.000 + 15.000 + 2.000 = 25.120; W = 1.536; CF = 3.350; R = 13.400.
      expect(displayAmount(h.measures.D)).toBe(25120);
      expect(displayAmount(h.measures.W)).toBe(1536);
      expect(displayAmount(h.measures.CF)).toBe(3350);
      expect(displayAmount(h.measures.R)).toBe(13400);
      expect(amountOf(h.items, 'ayudantes')).toBe(15000); // una vez por ruta, no por tramo
      expect(amountOf(h.items, 'otros')).toBe(2000);
      expect(displayAmount(h.measures.cost)).toBe(43406);
      expect(h.measures.suggested.value).toBe(52000); // 43.406/0,85 = 51.065,9
      expect(displayAmount(h.measures.afterTrip!)).toBe(29880);
      expect(displayAmount(h.measures.afterAllCosts!)).toBe(24994);
      expect(displayAmount(h.measures.overGoal!)).toBe(11594);

      await s.compareWithoutTolls();
      // Sin peajes con peajes desconocidos: 55,1 km, 91 min. K = 5.510 + 15.000 + 2.000 + 1.653 + 3.775 + 15.100 = 43.038.
      const y = s.computation('evitarPeajes')!;
      expect(y.km).toBeCloseTo(55.1, 9);
      expect(y.minutes).toBeCloseTo(91, 9);
      expect(y.measures.cost.type).toBe('cotaInferior');
      expect(displayAmount(y.measures.cost)).toBe(43038);
      // Habitual 43.406 vs sin peajes ≥ 43.038: conviene sin peajes si sus peajes suman menos de 368.
      const cmp = s.comparisonResult()!;
      expect(cmp).toMatchObject({ kind: 'umbralPeajes', route: 'y' });
      if (cmp.kind === 'umbralPeajes') expect(displayThreshold(cmp.threshold)).toBe(368);
      s.setTollsComparison(0);
      expect(s.comparisonResult()).toMatchObject({ kind: 'concluyente', cheaper: 'y' });
      const c2 = s.comparisonResult()!;
      if (c2.kind === 'concluyente') expect(c2.difference).toBeCloseTo(368, 6);
      expect(client.calls).toBe(2);
    });

    it('ida y vuelta manual: 3 tramos, carga/descarga y ayudantes una sola vez', () => {
      const s = new QuoteSession(fakeClient());
      s.setInputs(ROUND_TRIP);
      s.useManual('habitual');
      expect(s.getSnapshot().habitual.manualLegs.map((l) => `${l.from}>${l.to}`)).toEqual(['base>A', 'A>B', 'B>base']);
      s.setParams(FULL);
      s.setLegOverride('habitual', 0, { km: 10, minutes: 15 });
      s.setLegOverride('habitual', 1, { km: 40, minutes: 60 });
      s.setLegOverride('habitual', 2, { km: 30, minutes: 45 });
      const c = s.computation('habitual')!;
      expect(c.km).toBe(80);
      expect(c.minutes).toBe(120);
      // Igual al escenario A de docs/03 §4 salvo desgaste (30 $/km) y otros (2.000).
      expect(amountOf(c.items, 'gastosFijos')).toBe(4500); // 1.500 × 3 h
      expect(amountOf(c.items, 'remuneracion')).toBe(18000);
      expect(amountOf(c.items, 'ayudantes')).toBe(15000);
      expect(amountOf(c.items, 'combustible')).toBe(8000);
    });
  });

  describe('IVA (solo la implementación actual)', () => {
    it('ninguna regla seleccionable mientras no esté verificada (#16); regla inexistente → neto', () => {
      const rules = taxData.rules as TaxRule[];
      expect(selectableRules(rules)).toEqual([]);
      expect(applyTax(55000, 'iva-afecto-19', rules)).toMatchObject({ tax: null, total: 55000, ruleId: null });
      expect(applyTax(55000, 'no-existe', rules)).toMatchObject({ tax: null, total: 55000, ruleId: null });
    });

    it('Math.round(neto × 0,19) coincide con el redondeo exacto «mitad hacia arriba» para todo neto de 1 a 1.000.000', () => {
      const rule: TaxRule[] = [{ id: 'r', label: 'r', rate: 0.19, verified: true, source: 'prueba', verifiedAt: '2026-11-18' }];
      for (let n = 1; n <= 1_000_000; n++) {
        const exact = Math.floor((n * 19 + 50) / 100); // aritmética entera exacta
        if (applyTax(n, 'r', rule).tax !== exact) throw new Error(`neto ${n}: ${applyTax(n, 'r', rule).tax} ≠ ${exact}`);
      }
    });
  });

  it('reproducibilidad: mismas entradas → resultado idéntico (docs/03 §6)', () => {
    const a = computeMeasures({ items: buildCostItems(57.4, 74, FULL), margin: 0.15, surcharges: 1000, price: 55000 });
    const b = computeMeasures({ items: buildCostItems(57.4, 74, FULL), margin: 0.15, surcharges: 1000, price: 55000 });
    expect(a).toEqual(b);
  });

  it('invariantes: C = D + W + CF + R y (P − D) − W − CF − R = P − C', () => {
    const m = computeMeasures({ items: buildCostItems(57.4, 74, FULL), margin: 0.15, price: 55000 });
    expect(m.cost.value).toBeCloseTo(m.D.value + m.W.value + m.CF.value + m.R.value, 9);
    expect(m.afterTrip!.value - m.W.value - m.CF.value - m.R.value).toBeCloseTo(m.overGoal!.value, 9);
  });
});

// =====================================================================================
describe('Errores encontrados y corregidos el 18-11 con aprobación del propietario (A-50)', () => {
  /** El motor debe rechazar la entrada (lanzar) o, si la acepta, no devolver un monto inválido. */
  const rejectsOrSane = (fn: () => Bounded) => {
    let b: Bounded;
    try {
      b = fn();
    } catch {
      return true;
    }
    return Number.isFinite(b.value) && b.value >= 0;
  };
  /** Igual para una partida: se acepta lanzar, devolver faltante (null) o un monto finito ≥ 0. */
  const itemRejectsOrSane = (fn: () => number | null) => {
    let a: number | null;
    try {
      a = fn();
    } catch {
      return true;
    }
    return a === null || (Number.isFinite(a) && a >= 0);
  };

  // C-1 — El motor no valida entradas. docs/03 §3C se apoya en «toda partida de costo es ≥ 0»
  // y §3 en que null ≠ 0; con montos negativos o no finitos las cotas dejan de valer.
  // Hoy la interfaz filtra (parseAmount: finito y ≥ 0), pero el contrato del motor no.

  it('C-1a — peajes negativos: buildCostItems(…, tolls −5.000) da una partida de −5.000 (esperado: rechazo o faltante)', () => {
    // Actual: amount −5.000 → baja el costo. Nota: «otros» negativo sí se lleva a 0.
    expect(itemRejectsOrSane(() => amountOf(buildCostItems(10, 10, { ...FULL, tolls: -5000 }), 'peajes'))).toBe(true);
  });

  it('C-1b — precio de combustible negativo: −1.000 $/L da combustible −1.000 en 10 km a 10 km/L', () => {
    expect(itemRejectsOrSane(() => amountOf(buildCostItems(10, 10, { ...FULL, fuelPricePerL: -1000 }), 'combustible'))).toBe(true);
  });

  it('C-1c — partida NaN: el costo sale NaN rotulado «estimado» y se muestra «$NaN»', () => {
    expect(rejectsOrSane(() => computeMeasures({ items: [item('a', 'desembolso', Number.NaN)], margin: 0.15 }).cost)).toBe(true);
  });

  it('C-1d — recargos NaN: el precio sugerido sale NaN', () => {
    expect(rejectsOrSane(() => computeMeasures({ items: v4(), margin: 0.15, surcharges: Number.NaN }).suggested)).toBe(true);
  });

  it('C-1e — partida infinita: el precio sugerido sale Infinity («$∞») rotulado «estimado»', () => {
    expect(rejectsOrSane(() => computeMeasures({ items: [item('a', 'desembolso', Number.POSITIVE_INFINITY)], margin: 0.15 }).suggested)).toBe(true);
  });

  it('C-1f — minutos de conducción negativos: −120 min, sin carga, a 1.500 $/h dan gastos fijos de −3.000', () => {
    expect(itemRejectsOrSane(() => amountOf(buildCostItems(10, -120, { ...FULL, loadMinutes: 0 }), 'gastosFijos'))).toBe(true);
  });

  it('C-1g — precio elegido NaN: lo que queda sale NaN rotulado «estimado»', () => {
    expect(rejectsOrSane(() => computeMeasures({ items: v4(), margin: 0.15, price: Number.NaN }).afterTrip!)).toBe(true);
  });

  // C-2 — ceilTo(0) devuelve −0: con costo 0 completo la interfaz muestra «$-0» como precio sugerido.
  it('C-2 — costo 0 completo (0 km, todo declarado): el precio sugerido se muestra «$-0» (esperado «$0»)', () => {
    const zero: TripParams = { ...FULL, helpers: 0, otherCosts: 0, tolls: 0, fixedPerHour: 0, ownerPerHour: 0, loadMinutes: 0 };
    const m = computeMeasures({ items: buildCostItems(0, 0, zero), margin: 0.15 });
    expect(m.complete).toBe(true);
    expect(boundedText(m.suggested, 'precio')).toBe(formatClp(0));
  });

  // C-3 — docs/03 §2 (4): m es margen SOBRE EL PRECIO (P = C/(1 − m)). La interfaz lo rotula
  // «Ganancia extra sobre el costo», que se lee como recargo sobre el costo (P = C·(1 + m)).
  // G1: el usuario espera ⌈42.752 × 1,15⌉ = 50.000 y la app sugiere 51.000.
  it('C-3 — el rótulo del margen y la fórmula del motor describen el mismo cálculo', () => {
    const ui = readFileSync(new URL('../src/web/components/Calculator.tsx', import.meta.url), 'utf8');
    const saysOverCost = /sobre el costo/.test(ui) && !/% del precio de venta/.test(ui);
    const engineIsMarkup = computeMeasures({ items: v4(), margin: 0.15 }).suggested.value === ceilTo(42752 * 1.15, 1000);
    expect(saysOverCost).toBe(engineIsMarkup);
  });
});

// =====================================================================================
describe('No especificado (documenta el comportamiento ACTUAL; requiere decisión del propietario)', () => {
  it('NE-1 — recargos negativos se ignoran (se llevan a 0); no hay descuentos', () => {
    expect(computeMeasures({ items: v4(), margin: 0.15, surcharges: -5000 }).suggested.value).toBe(51000);
  });

  it('NE-2 — mismo costo conocido con peajes faltantes en X: «conviene Y» con diferencia 0 (podría ser empate si los peajes son 0)', () => {
    const c = compareRoutes({ items: [item('a', 'desembolso', 100), item('peajes', 'desembolso', null)], km: 1, hours: 1 }, { items: [item('a', 'desembolso', 100)], km: 1, hours: 1 });
    expect(c).toEqual({ kind: 'concluyente', cheaper: 'y', difference: 0 });
  });

  it('NE-3 — sin tolerancia de empate: costos iguales con error de coma flotante no son «empate»', () => {
    const c = compareRoutes({ items: [item('a', 'desembolso', 0.1), item('b', 'desembolso', 0.2)], km: 1, hours: 1 }, { items: [item('a', 'desembolso', 0.3)], km: 1, hours: 1 });
    expect(c.kind === 'concluyente' && c.cheaper).toBe('y');
  });

  it('NE-4 — dos tarifas comunes faltantes (combustible y desgaste) → no concluyente, aunque el signo pueda ser seguro', () => {
    const mk = (k: number) => [item('combustible', 'desembolso', null), item('desgaste', 'desgaste', null), item('r', 'desembolso', k)];
    expect(compareRoutes({ items: mk(100), km: 10, hours: 1 }, { items: mk(200), km: 20, hours: 1 })).toMatchObject({ kind: 'noConcluyente' });
  });

  it('NE-5 — estimado con mitad negativa: −1.234,5 se muestra −1.234 (Math.round va hacia +∞)', () => {
    expect(displayAmount({ value: -1234.5, type: 'estimado', missing: [] })).toBe(-1234);
  });

  it('NE-6 — ayudantes fraccionarios: el motor acepta 1,5 ayudantes (la interfaz redondea)', () => {
    expect(amountOf(buildCostItems(10, 10, { ...FULL, helpers: 1.5, helperFee: 1000 }), 'ayudantes')).toBe(1500);
  });

  it('NE-7 — R usa las horas del viaje: el escenario B (dueño 0,5 h de un viaje de 3 h) no se puede armar con buildCostItems', () => {
    const items = buildCostItems(80, 120, FULL);
    expect(amountOf(items, 'remuneracion')).toBe(18000); // 6.000 × 3 h, no 6.000 × 0,5 h
  });

  it('NE-8 (resuelto por A-50) — carga y descarga es un dato requerido: un valor negativo se rechaza, no se lleva a 0 en silencio', () => {
    expect(() => buildCostItems(10, 60, { ...FULL, loadMinutes: -60 })).toThrow();
  });

  it('NE-9 — sin tope de magnitud: montos sobre 2^53 se aceptan y pierden precisión al peso', () => {
    const m = computeMeasures({ items: [item('a', 'desembolso', 2 ** 53 + 1)], margin: 0 });
    expect(Number.isFinite(m.suggested.value)).toBe(true);
    expect(Number.isSafeInteger(m.suggested.value)).toBe(false);
  });

  it('NE-10 — precio elegido 0 o negativo se acepta: lo que queda sale negativo sin aviso del motor', () => {
    const m = computeMeasures({ items: v4(), margin: 0.15, price: -1 });
    expect(m.afterTrip!.value).toBe(-24224);
  });
});


// =====================================================================================
describe('A-50 — datos opcionales inválidos: faltante con aviso, nunca 0', () => {
  it('peaje negativo → partida faltante marcada como inválida', () => {
    const peajes = buildCostItems(10, 10, { ...FULL, tolls: -5000 }).find((i) => i.id === 'peajes')!;
    expect(peajes.amount).toBeNull();
    expect(peajes.invalid).toBe(true);
  });
  it('rendimiento NaN → combustible faltante marcado como inválido', () => {
    const c = buildCostItems(10, 10, { ...FULL, kmPerL: Number.NaN }).find((i) => i.id === 'combustible')!;
    expect(c.amount).toBeNull();
    expect(c.invalid).toBe(true);
  });
  it('dato simplemente faltante (null) → faltante SIN marca de inválido', () => {
    const peajes = buildCostItems(10, 10, { ...FULL, tolls: null }).find((i) => i.id === 'peajes')!;
    expect(peajes.amount).toBeNull();
    expect(peajes.invalid).toBeUndefined();
  });
  it('datos válidos → sin marca de inválido en ninguna partida', () => {
    expect(buildCostItems(10, 10, FULL).some((i) => i.invalid)).toBe(false);
  });
  it('km o minutos inválidos (requeridos) → rechazo', () => {
    expect(() => buildCostItems(Number.NaN, 10, FULL)).toThrow();
    expect(() => buildCostItems(10, -1, FULL)).toThrow();
  });
});
