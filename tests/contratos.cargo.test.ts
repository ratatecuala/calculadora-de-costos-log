/**
 * Fase 0 (A-63) · Contrato del inventario (docs/21 §3.1).
 * C1: límites del esquema, medidas enteras, volumen calculado coherente y tope de 200 líneas (T-1).
 * C3: las mismas fixtures que usa scripts/diseno/pruebas-c3.sql contra el CHECK de M3.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_CARGO_ITEMS,
  cargoInventorySchema,
  cargoItemSchema,
  cargoItemsSchema,
  volumeFromDims,
} from '../src/shared/cargo';
import fixtures from './fixtures/cargo-items.json';

type Caso = { nombre: string; item: unknown; zod: 'acepta' | 'rechaza'; servidor: 'acepta' | 'rechaza' };
const casos = fixtures.casos as Caso[];

const valido = {
  kind: 'cajas',
  description: 'Caja ficticia',
  qty: 1,
  unitWeightKg: 10,
  dimsCm: { l: 50, w: 40, h: 40 },
  volumeM3: 0.08,
  volumeSource: 'calculado',
  fragile: false,
  handling: 'normal',
};

describe('C3 · fixtures compartidas con el servidor', () => {
  it.each(casos.map((c) => [c.nombre, c] as const))('%s', (_n, c) => {
    const r = cargoItemSchema.safeParse(c.item);
    expect(r.success ? 'acepta' : 'rechaza').toBe(c.zod);
    // Lo aceptado por Zod se envía tal cual: el resultado no altera el contenido de la fixture.
    if (r.success) expect(r.data).toEqual(c.item);
  });

  it('regla C3: nada que Zod acepte lo rechaza el servidor, y viceversa', () => {
    expect(casos.filter((c) => c.zod === 'acepta' && c.servidor === 'rechaza')).toEqual([]);
    expect(casos.filter((c) => c.servidor === 'rechaza' && c.zod === 'acepta')).toEqual([]);
    // Las diferencias permitidas (Zod más estricto) están declaradas en el nombre del caso.
    for (const c of casos.filter((x) => x.zod !== x.servidor)) expect(c.nombre).toMatch(/Zod más estricto/);
  });
});

describe('C1 · volumen calculado (P2-4)', () => {
  it.each([
    [{ l: 50, w: 40, h: 40 }, 0.08],
    [{ l: 33, w: 33, h: 33 }, 0.036],
    [{ l: 5, w: 5, h: 20 }, 0.001],
    [{ l: 1, w: 1, h: 1 }, 0],
    [{ l: 2000, w: 2000, h: 25 }, 100],
    [{ l: 199, w: 77, h: 13 }, 0.199],
  ])('volumeFromDims(%o) = %d', (dims, esperado) => {
    expect(volumeFromDims(dims)).toBe(esperado);
  });

  it('coincide con round(l*w*h/1e6, 3) de PostgreSQL (mitad hacia arriba) en una muestra amplia', () => {
    // Referencia en aritmética entera: cm³ → milésimas de m³ con redondeo mitad hacia arriba.
    for (let l = 1; l <= 2000; l += 37) {
      for (let w = 1; w <= 300; w += 23) {
        for (const h of [1, 7, 13, 20, 99, 150]) {
          const cm3 = l * w * h;
          const milesimas = Math.floor(cm3 / 1000) + (cm3 % 1000 >= 500 ? 1 : 0);
          expect(volumeFromDims({ l, w, h })).toBe(milesimas / 1000);
        }
      }
    }
  });

  it('un volumen calculado se marca como declarado si el usuario quiere otro valor', () => {
    expect(cargoItemSchema.safeParse({ ...valido, volumeM3: 0.5 }).success).toBe(false);
    expect(cargoItemSchema.safeParse({ ...valido, volumeM3: 0.5, volumeSource: 'declarado' }).success).toBe(true);
  });
});

describe('C1 · límites y valores por defecto', () => {
  it('aplica los valores por defecto sin inventar datos (null ≠ 0)', () => {
    const r = cargoItemSchema.parse({ kind: 'otro', description: 'Silla' });
    expect(r).toEqual({
      kind: 'otro',
      description: 'Silla',
      qty: 1,
      unitWeightKg: null,
      dimsCm: null,
      volumeM3: null,
      volumeSource: null,
      fragile: false,
      handling: 'normal',
    });
  });

  it('recorta espacios del tipo y la descripción', () => {
    const r = cargoItemSchema.parse({ ...valido, kind: '  cajas ', description: '  Caja  ' });
    expect(r.kind).toBe('cajas');
    expect(r.description).toBe('Caja');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('rechaza un peso no válido: %d', (v) => {
    expect(cargoItemSchema.safeParse({ ...valido, unitWeightKg: v }).success).toBe(false);
  });

  it(`acepta ${MAX_CARGO_ITEMS} líneas y rechaza ${MAX_CARGO_ITEMS + 1} (T-1)`, () => {
    const lista = (n: number) => Array.from({ length: n }, () => ({ ...valido }));
    expect(cargoItemsSchema.safeParse(lista(MAX_CARGO_ITEMS)).success).toBe(true);
    expect(cargoItemsSchema.safeParse(lista(MAX_CARGO_ITEMS + 1)).success).toBe(false);
    expect(cargoInventorySchema.safeParse({ mode: 'detallado', items: lista(MAX_CARGO_ITEMS + 1) }).success).toBe(false);
  });

  it('inventario rápido: resumen ≤ 200 y sin líneas por defecto', () => {
    expect(cargoInventorySchema.parse({ mode: 'rapido', summary: 'Mudanza pequeña' })).toEqual({
      mode: 'rapido',
      summary: 'Mudanza pequeña',
      items: [],
    });
    expect(cargoInventorySchema.safeParse({ mode: 'rapido', summary: 'x'.repeat(201) }).success).toBe(false);
    expect(cargoInventorySchema.safeParse({ mode: 'otro' }).success).toBe(false);
  });

  it('los mensajes de error están en español y nombran el campo', () => {
    const r = cargoItemSchema.safeParse({ ...valido, dimsCm: { l: 50.5, w: 40, h: 40 } });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Usa centímetros enteros');
  });
});
