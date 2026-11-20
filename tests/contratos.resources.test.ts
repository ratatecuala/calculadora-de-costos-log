/**
 * Fase 0 (A-63) · Contrato de recursos (docs/21 §4.1–§4.2).
 * C1: una modalidad por ayudante (A-58), paradas solo A y B (T-3), null ≠ 0 y límites.
 */
import { describe, expect, it } from 'vitest';
import { handlingTimeSchema, helperSchema, resourcesSchema, stopSchema } from '../src/shared/resources';

const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';

describe('C1 · ayudantes: una modalidad por ayudante (A-58)', () => {
  it('acepta un ayudante por servicio y uno por hora', () => {
    expect(helperSchema.safeParse({ id: id1, mode: 'servicio', feeService: 25000 }).success).toBe(true);
    expect(
      helperSchema.safeParse({ id: id2, mode: 'hora', ratePerHour: 6000, paidSegments: ['manipulacion'], hours: 3 }).success,
    ).toBe(true);
  });

  it('rechaza campos de la otra modalidad', () => {
    expect(helperSchema.safeParse({ id: id1, mode: 'servicio', feeService: 25000, ratePerHour: 6000 }).success).toBe(false);
    expect(
      helperSchema.safeParse({ id: id2, mode: 'hora', ratePerHour: 6000, paidSegments: ['traslado'], hours: 2, feeService: 1 }).success,
    ).toBe(false);
  });

  it('monto u horas desconocidos son null, no 0', () => {
    const s = helperSchema.parse({ id: id1, mode: 'servicio', feeService: null });
    expect(s).toEqual({ id: id1, mode: 'servicio', feeService: null });
    const h = helperSchema.parse({ id: id2, mode: 'hora', ratePerHour: 6000, paidSegments: ['manipulacion'], hours: null });
    expect(h.mode === 'hora' && h.hours).toBeNull();
    // Los campos son obligatorios: omitirlos no equivale a 0 ni a null.
    expect(helperSchema.safeParse({ id: id1, mode: 'servicio' }).success).toBe(false);
  });

  it('modalidad por hora: tramos explícitos, sin repetir, y horas > 0', () => {
    const base = { id: id2, mode: 'hora', ratePerHour: 6000, hours: 2 };
    expect(helperSchema.safeParse({ ...base, paidSegments: [] }).success).toBe(false);
    expect(helperSchema.safeParse({ ...base, paidSegments: ['traslado', 'traslado'] }).success).toBe(false);
    expect(helperSchema.safeParse({ ...base, paidSegments: ['manipulacion', 'traslado'], hours: 0 }).success).toBe(false);
    expect(helperSchema.safeParse({ ...base, paidSegments: ['manipulacion'], hours: 24.5 }).success).toBe(false);
  });

  it('montos en pesos enteros y no negativos', () => {
    expect(helperSchema.safeParse({ id: id1, mode: 'servicio', feeService: -1 }).success).toBe(false);
    expect(helperSchema.safeParse({ id: id1, mode: 'servicio', feeService: 100.5 }).success).toBe(false);
    expect(helperSchema.safeParse({ id: id1, mode: 'servicio', feeService: 0 }).success).toBe(true);
  });

  it('ayudante sin id válido o repetido', () => {
    expect(helperSchema.safeParse({ id: 'h1', mode: 'servicio', feeService: 1 }).success).toBe(false);
    const repetido = { id: id1, mode: 'servicio', feeService: 1 };
    expect(resourcesSchema.safeParse({ helpers: [repetido, repetido] }).success).toBe(false);
  });
});

describe('C1 · paradas solo A y B (T-3)', () => {
  it('valores por defecto: todo desconocido (null), nada en 0', () => {
    expect(stopSchema.parse({ role: 'A' })).toEqual({
      role: 'A',
      floor: null,
      elevator: null,
      stairs: null,
      carryMeters: null,
      access: '',
      loadMinutes: null,
    });
  });

  it('rechaza la base u otra parada, y paradas repetidas', () => {
    expect(stopSchema.safeParse({ role: 'base' }).success).toBe(false);
    expect(resourcesSchema.safeParse({ stops: [{ role: 'A' }, { role: 'A' }] }).success).toBe(false);
    expect(resourcesSchema.safeParse({ stops: [{ role: 'A' }, { role: 'B' }] }).success).toBe(true);
  });

  it.each([
    ['floor', -6],
    ['floor', 61],
    ['floor', 2.5],
    ['carryMeters', 1001],
    ['loadMinutes', 1441],
    ['loadMinutes', -1],
    ['access', 'x'.repeat(121)],
    ['elevator', 'quizas'],
  ])('rechaza %s = %s', (campo, valor) => {
    expect(stopSchema.safeParse({ role: 'B', [campo]: valor }).success).toBe(false);
  });
});

describe('C1 · equipamiento y recursos completos', () => {
  it('equipamiento declarado, con monto desconocido como null', () => {
    const r = resourcesSchema.parse({ equipment: [{ label: 'Carro de arrastre', amount: null }] });
    expect(r).toEqual({ stops: [], helpers: [], equipment: [{ label: 'Carro de arrastre', amount: null }] });
    expect(resourcesSchema.safeParse({ equipment: [{ label: '', amount: 1 }] }).success).toBe(false);
  });

  it('rechaza campos desconocidos (contrato estricto)', () => {
    expect(resourcesSchema.safeParse({ helpers: [], extra: 1 }).success).toBe(false);
  });
});

describe('Contrato de handlingTime (§4.4)', () => {
  it('complete coincide con las paradas faltantes', () => {
    expect(handlingTimeSchema.safeParse({ minutes: 30, complete: true, missingStops: [] }).success).toBe(true);
    expect(handlingTimeSchema.safeParse({ minutes: 30, complete: false, missingStops: ['B'] }).success).toBe(true);
    expect(handlingTimeSchema.safeParse({ minutes: null, complete: false, missingStops: ['A', 'B'] }).success).toBe(true);
    expect(handlingTimeSchema.safeParse({ minutes: 30, complete: true, missingStops: ['B'] }).success).toBe(false);
  });
});

describe('P2 auditoría fase 0 · supuestos técnicos de recursos (T-7, pendiente de producto)', () => {
  const base = { id: id2, mode: 'hora', ratePerHour: 6000, paidSegments: ['manipulacion'] };

  it('un trabajo de varias jornadas (30 h) se RECHAZA con mensaje: no se recorta a 24 ni se vuelve 0', () => {
    const r = helperSchema.safeParse({ ...base, hours: 30 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Máximo 24 horas');
  });

  it('horas desconocidas siguen siendo null (no 0) y 24 h exactas se aceptan', () => {
    expect(helperSchema.parse({ ...base, hours: null })).toMatchObject({ hours: null });
    expect(helperSchema.parse({ ...base, hours: 24 })).toMatchObject({ hours: 24 });
  });

  it('21 ayudantes o 21 elementos de equipamiento se rechazan con mensaje', () => {
    const ayudantes = Array.from({ length: 21 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      mode: 'servicio',
      feeService: null,
    }));
    expect(resourcesSchema.safeParse({ helpers: ayudantes }).success).toBe(false);
    expect(resourcesSchema.safeParse({ helpers: ayudantes.slice(0, 20) }).success).toBe(true);
    const equipo = Array.from({ length: 21 }, (_, i) => ({ label: `Equipo ${i}`, amount: null }));
    expect(resourcesSchema.safeParse({ equipment: equipo }).success).toBe(false);
  });
});

