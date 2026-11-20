/**
 * Fase 1 · carril #51 (A-66): funciones puras de recursos y estado del editor.
 * El costo NO cambia: se compara la conversión de ayudantes v1 con la partida actual del motor.
 */
import { describe, expect, it } from 'vitest';
import { buildCostItems, EMPTY_PARAMS } from '../src/engine/inputs';
import {
  equipmentAmount,
  handlingTime,
  helperCostLines,
  helpersFromV1,
  resourcesSchema,
  resourcesSummary,
  switchHelperMode,
  type Helper,
} from '../src/shared/resources';
import {
  addEquipment,
  addHelper,
  asResourcesLike,
  emptyResourcesDraft,
  removeHelper,
  setHelperMode,
  toggleSegment,
  updateEquipment,
  updateHelper,
  updateStop,
  validateResources,
} from '../src/web/modules/resourcesDraft';

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

describe('handlingTime (§4.4)', () => {
  it('suma A y B cuando ambas tienen dato', () => {
    expect(handlingTime({ stops: [{ role: 'A', loadMinutes: 30 }, { role: 'B', loadMinutes: 45 }] })).toEqual({ minutes: 75, complete: true, missingStops: [] });
  });

  it('falta B: minutos conocidos (cota inferior) e incompleto', () => {
    expect(handlingTime({ stops: [{ role: 'A', loadMinutes: 30 }, { role: 'B', loadMinutes: null }] })).toEqual({ minutes: 30, complete: false, missingStops: ['B'] });
  });

  it('sin paradas o sin datos: null (desconocido), no 0', () => {
    expect(handlingTime({ stops: [] })).toEqual({ minutes: null, complete: false, missingStops: ['A', 'B'] });
    expect(handlingTime({ stops: [{ role: 'A', loadMinutes: null }] })).toMatchObject({ minutes: null });
  });

  it('0 minutos declarados es un dato (completo), distinto de no saberlo', () => {
    expect(handlingTime({ stops: [{ role: 'A', loadMinutes: 0 }, { role: 'B', loadMinutes: 0 }] })).toEqual({ minutes: 0, complete: true, missingStops: [] });
  });

  it('pisos y ascensor no agregan minutos (sin coeficientes automáticos)', () => {
    const r = resourcesSchema.parse({ stops: [{ role: 'A', floor: 10, elevator: 'no', loadMinutes: 20 }, { role: 'B', floor: 1, loadMinutes: 20 }] });
    expect(handlingTime(r).minutes).toBe(40);
  });
});

describe('helperCostLines y resourcesSummary (A-58)', () => {
  const servicio: Helper = { id: uuid(), mode: 'servicio', feeService: 25000 };
  const hora: Helper = { id: uuid(), mode: 'hora', ratePerHour: 6000, paidSegments: ['manipulacion'], hours: 2.5 };

  it('por servicio: el monto; por hora: tarifa × horas', () => {
    expect(helperCostLines({ helpers: [servicio, hora] }).map((l) => l.amount)).toEqual([25000, 15000]);
  });

  it('por hora sin tarifa, sin horas o sin tramos marcados: faltante (null), no 0', () => {
    const sinTramos = { ...hora, paidSegments: [] };
    const sinHoras = { ...hora, hours: null };
    const sinTarifa = { ...hora, ratePerHour: null };
    expect(helperCostLines({ helpers: [sinTramos, sinHoras, sinTarifa] }).map((l) => l.amount)).toEqual([null, null, null]);
  });

  it('el resumen informa el total conocido y cuántos faltan', () => {
    const s = resourcesSummary({
      stops: [],
      helpers: [servicio, { ...hora, hours: null }],
      equipment: [
        { label: 'Mantas', amount: 5000 },
        { label: 'Carro', amount: null },
      ],
    });
    expect(s).toMatchObject({ helperCount: 2, helpersKnownTotal: 25000, helpersMissing: 1, equipmentKnownTotal: 5000, equipmentMissing: 1 });
  });

  it('cambiar de modalidad no deja montos residuales', () => {
    const aHora = switchHelperMode(servicio, 'hora');
    expect(aHora).toEqual({ id: servicio.id, mode: 'hora', ratePerHour: null, paidSegments: [], hours: null });
    const deVuelta = switchHelperMode(aHora, 'servicio');
    expect(deVuelta).toEqual({ id: servicio.id, mode: 'servicio', feeService: null });
    expect(switchHelperMode(servicio, 'servicio')).toBe(servicio);
  });
});

describe('Compatibilidad con el motor actual (§4.3): el costo no cambia', () => {
  it.each([
    [0, null],
    [1, 15000],
    [2, 15000],
    [3, 20000],
    [2, null],
  ])('%i ayudantes v1 de %s: la suma de las líneas convertidas es la partida actual del motor', (count, fee) => {
    const motor = buildCostItems(25, 40, { ...EMPTY_PARAMS, helpers: count, helperFee: fee }).find((i) => i.id === 'ayudantes')!.amount;
    const conv = helpersFromV1(count, fee, uuid);
    if (!conv.ok) throw new Error(conv.reason);
    const lines = helperCostLines({ helpers: conv.helpers });
    const suma = lines.length === 0 ? 0 : lines.some((l) => l.amount === null) ? null : lines.reduce((a, l) => a + (l.amount ?? 0), 0);
    expect(suma).toBe(motor);
  });

  it('la conversión crea ayudantes válidos por servicio', () => {
    const conv = helpersFromV1(2, 15000, uuid);
    expect(conv.ok).toBe(true);
    if (!conv.ok) return;
    expect(resourcesSchema.safeParse({ helpers: conv.helpers }).success).toBe(true);
    expect(conv.helpers.every((h) => h.mode === 'servicio')).toBe(true);
  });
});

describe('Editor de recursos (estado puro)', () => {
  it('paradas fijas A y B, todo sin dato al inicio', () => {
    const d = emptyResourcesDraft();
    expect(d.stops.map((s) => s.role)).toEqual(['A', 'B']);
    expect(validateResources(d).resources).toEqual({
      stops: [
        { role: 'A', floor: null, elevator: null, stairs: null, carryMeters: null, access: '', loadMinutes: null },
        { role: 'B', floor: null, elevator: null, stairs: null, carryMeters: null, access: '', loadMinutes: null },
      ],
      helpers: [],
      equipment: [],
    });
  });

  it('un ayudante nuevo no tiene monto (faltante) y cambiar su modalidad borra los montos', () => {
    let d = addHelper(emptyResourcesDraft(), uuid());
    const id = d.helpers[0]!.id;
    expect(helperCostLines(asResourcesLike(d))[0]!.amount).toBeNull();
    d = updateHelper(d, id, { feeService: 20000 });
    d = setHelperMode(d, id, 'hora');
    d = updateHelper(d, id, { feeService: 99999, ratePerHour: 6000, hours: 3 }); // feeService se ignora en «hora»
    expect(d.helpers[0]).toEqual({ id, mode: 'hora', ratePerHour: 6000, paidSegments: [], hours: 3 });
    expect(helperCostLines(asResourcesLike(d))[0]!.amount).toBeNull(); // sin tramos marcados
    d = toggleSegment(d, id, 'manipulacion');
    expect(helperCostLines(asResourcesLike(d))[0]!.amount).toBe(18000);
    d = setHelperMode(d, id, 'servicio');
    expect(d.helpers[0]).toEqual({ id, mode: 'servicio', feeService: null });
  });

  it('errores ubicados por parada, ayudante y equipamiento', () => {
    let d = updateStop(emptyResourcesDraft(), 'B', { loadMinutes: 1441, floor: 61 });
    d = addHelper(d, uuid());
    const id = d.helpers[0]!.id;
    d = setHelperMode(d, id, 'hora');
    d = updateHelper(d, id, { hours: 30, ratePerHour: 5000 });
    d = addEquipment(d, 'e1');
    d = updateEquipment(d, 'e1', { label: '' });
    const v = validateResources(d);
    expect(v.resources).toBeNull();
    expect(v.errors['B.loadMinutes']).toMatch(/1440/);
    expect(v.errors['B.floor']).toMatch(/60/);
    expect(v.errors[`${id}.hours`]).toBe('Máximo 24 horas');
    expect(v.errors[`${id}.paidSegments`]).toBe('Indica qué tramos se pagan');
    expect(v.errors['e1.label']).toMatch(/equipamiento/);
  });

  it('quitar un ayudante', () => {
    let d = addHelper(addHelper(emptyResourcesDraft(), uuid()), uuid());
    d = removeHelper(d, d.helpers[0]!.id);
    expect(d.helpers).toHaveLength(1);
  });
});

describe('P1-1 · la conversión de ayudantes históricos nunca reduce cantidad ni costo', () => {
  const motor = (count: number, fee: number | null) =>
    buildCostItems(25, 40, { ...EMPTY_PARAMS, helpers: count, helperFee: fee }).find((i) => i.id === 'ayudantes')!.amount;

  it('20 ayudantes (el límite): se convierten los 20 y la suma es la del motor', () => {
    const conv = helpersFromV1(20, 15000, uuid);
    expect(conv.ok && conv.helpers).toHaveLength(20);
    if (!conv.ok) return;
    const suma = helperCostLines({ helpers: conv.helpers }).reduce((a, l) => a + (l.amount ?? 0), 0);
    expect(suma).toBe(300000);
    expect(suma).toBe(motor(20, 15000));
  });

  it.each([21, 25, 50, 1000])('%i ayudantes: la conversión se RECHAZA con motivo (no se recorta a 20)', (n) => {
    const conv = helpersFromV1(n, 15000, uuid);
    expect(conv.ok).toBe(false);
    if (conv.ok) return;
    expect(conv.reason).toContain(String(n));
    expect(conv.reason).toContain('20');
    // El motor v1 sigue calculando el monto completo con el dato original (p. ej. 21 × 15.000 = 315.000).
    expect(motor(n, 15000)).toBe(n * 15000);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('cantidad no válida (%s): se rechaza, no se convierte en 0', (n) => {
    expect(helpersFromV1(n, 15000, uuid)).toMatchObject({ ok: false });
  });

  it.each([15000.5, -100, 1e11])('monto por ayudante que no cabe en el contrato nuevo (%s): se rechaza', (fee) => {
    expect(helpersFromV1(2, fee, uuid)).toMatchObject({ ok: false });
  });

  it('0 ayudantes: lista vacía, aunque el monto sea cualquier cosa', () => {
    expect(helpersFromV1(0, null, uuid)).toEqual({ ok: true, helpers: [] });
    expect(helpersFromV1(0, 15000.5, uuid)).toEqual({ ok: true, helpers: [] });
  });
});

describe('P1-2 · valores inválidos no suman en los totales informativos', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const valido: Helper = { id: id(901), mode: 'servicio', feeService: 25000 };

  it.each<[string, Helper]>([
    ['30 h', { id: id(902), mode: 'hora', ratePerHour: 6000, hours: 30, paidSegments: ['manipulacion'] }],
    ['tarifa negativa', { id: id(903), mode: 'hora', ratePerHour: -6000, hours: 3, paidSegments: ['manipulacion'] }],
    ['tarifa con decimales', { id: id(904), mode: 'hora', ratePerHour: 6000.5, hours: 3, paidSegments: ['manipulacion'] }],
    ['monto por servicio negativo', { id: id(905), mode: 'servicio', feeService: -1 }],
    ['monto por servicio con decimales', { id: id(906), mode: 'servicio', feeService: 100.5 }],
    ['horas 0', { id: id(907), mode: 'hora', ratePerHour: 6000, hours: 0, paidSegments: ['traslado'] }],
  ])('%s: la línea queda «inválida», sin monto, y no altera el total de las válidas', (_n, malo) => {
    const [linea] = helperCostLines({ helpers: [malo] });
    expect(linea).toMatchObject({ amount: null, status: 'invalido' });
    const s = resourcesSummary({ stops: [], helpers: [valido, malo], equipment: [] });
    expect(s).toMatchObject({ helperCount: 2, helpersKnownTotal: 25000, helpersMissing: 0, helpersInvalid: 1 });
  });

  it('30 h a $6.000 NO muestra $180.000 en ningún total', () => {
    const s = resourcesSummary({ stops: [], helpers: [{ id: id(908), mode: 'hora', ratePerHour: 6000, hours: 30, paidSegments: ['manipulacion'] }], equipment: [] });
    expect(s.helpersKnownTotal).toBe(0);
    expect(s.helpersInvalid).toBe(1);
  });

  it('equipamiento inválido (monto con decimales, fuera de rango o sin nombre) no suma; el válido sí', () => {
    const s = resourcesSummary({
      stops: [],
      helpers: [],
      equipment: [
        { label: 'Mantas', amount: 5000 },
        { label: 'Carro', amount: 100.5 },
        { label: 'Rampa', amount: 1e11 },
        { label: '', amount: 3000 },
        { label: 'Correas', amount: null },
      ],
    });
    expect(s).toMatchObject({ equipmentKnownTotal: 5000, equipmentMissing: 1, equipmentInvalid: 3 });
  });

  it('minutos de carga inválidos no suman: cuentan como faltantes', () => {
    expect(handlingTime({ stops: [{ role: 'A', loadMinutes: 1441 }, { role: 'B', loadMinutes: 30 }] })).toEqual({ minutes: 30, complete: false, missingStops: ['A'] });
    expect(handlingTime({ stops: [{ role: 'A', loadMinutes: -5 }, { role: 'B', loadMinutes: 2.5 }] })).toEqual({ minutes: null, complete: false, missingStops: ['A', 'B'] });
  });

  it('faltante y válido se distinguen de inválido', () => {
    const lines = helperCostLines({
      helpers: [valido, { id: id(909), mode: 'servicio', feeService: null }, { id: id(910), mode: 'hora', ratePerHour: 6000, hours: 3, paidSegments: [] }],
    });
    expect(lines.map((l) => l.status)).toEqual(['ok', 'faltante', 'faltante']);
  });
});


describe('Reauditoría fase 1 · P2-A: cada ayudante se valida con el esquema completo', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const ok: Helper = { id: id(950), mode: 'hora', ratePerHour: 6000, hours: 3, paidSegments: ['manipulacion'] };
  // Datos que la interfaz no produce, pero que podrían llegar en un snapshot malformado.
  const malformados: Array<[string, unknown]> = [
    ['tramo desconocido', { ...ok, paidSegments: ['otro'] }],
    ['tramo repetido', { ...ok, paidSegments: ['traslado', 'traslado'] }],
    ['más tramos que los posibles', { ...ok, paidSegments: ['manipulacion', 'traslado', 'manipulacion'] }],
    ['id no UUID', { ...ok, id: 'h1' }],
    ['campo extra de la otra modalidad', { ...ok, feeService: 1000 }],
    ['modalidad desconocida', { ...ok, mode: 'jornada' }],
    ['servicio con campo extra', { id: id(951), mode: 'servicio', feeService: 25000, ratePerHour: 6000 }],
    ['horas como texto', { ...ok, hours: '3' }],
  ];

  it.each(malformados)('%s: «invalido», sin monto', (_n, h) => {
    expect(helperCostLines({ helpers: [h as Helper] })[0]).toMatchObject({ amount: null, status: 'invalido' });
  });

  it('tarifa × horas que excede el tope monetario: «invalido», aunque cada campo sea válido', () => {
    const grande: Helper = { ...ok, id: id(952), ratePerHour: 9_000_000_000, hours: 24 };
    expect(helperCostLines({ helpers: [grande] })[0]).toMatchObject({ amount: null, status: 'invalido' });
  });

  it('sin tramos sigue siendo «faltante» (dato vacío), no inválido', () => {
    expect(helperCostLines({ helpers: [{ ...ok, paidSegments: [] }] })[0]).toMatchObject({ status: 'faltante' });
    expect(helperCostLines({ helpers: [ok] })[0]).toMatchObject({ amount: 18000, status: 'ok' });
  });

  it('un malformado no altera el total de los válidos', () => {
    const s = resourcesSummary({ stops: [], helpers: [ok, { ...ok, id: id(953), paidSegments: ['otro'] } as unknown as Helper], equipment: [] });
    expect(s).toMatchObject({ helpersKnownTotal: 18000, helpersInvalid: 1, helpersMissing: 0 });
  });
});

describe('Reauditoría fase 1 · P2-B: equipamiento inválido aunque falte el monto', () => {
  it('nombre vacío y monto vacío: «invalido», no «faltante»', () => {
    expect(equipmentAmount({ label: '', amount: null })).toEqual({ amount: null, status: 'invalido' });
    expect(equipmentAmount({ label: 'x'.repeat(61), amount: null })).toEqual({ amount: null, status: 'invalido' });
  });

  it('nombre válido y monto vacío: «faltante»', () => {
    expect(equipmentAmount({ label: 'Mantas', amount: null })).toEqual({ amount: null, status: 'faltante' });
  });

  it('campo extra: «invalido»', () => {
    expect(equipmentAmount({ label: 'Mantas', amount: 1000, extra: 1 } as unknown as { label: string; amount: number })).toMatchObject({ status: 'invalido' });
  });

  it('el resumen cuenta el nombre vacío como inválido, no como falta de monto', () => {
    const s = resourcesSummary({ stops: [], helpers: [], equipment: [{ label: '', amount: null }, { label: 'Mantas', amount: null }] });
    expect(s).toMatchObject({ equipmentInvalid: 1, equipmentMissing: 1, equipmentKnownTotal: 0 });
  });
});
