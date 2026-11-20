/**
 * Fase 1 · carril #51 (A-66): funciones puras de recursos y estado del editor.
 * El costo NO cambia: se compara la conversión de ayudantes v1 con la partida actual del motor.
 */
import { describe, expect, it } from 'vitest';
import { buildCostItems, EMPTY_PARAMS } from '../src/engine/inputs';
import {
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
    const lines = helperCostLines({ helpers: helpersFromV1(count, fee, uuid) });
    const suma = lines.length === 0 ? 0 : lines.some((l) => l.amount === null) ? null : lines.reduce((a, l) => a + (l.amount ?? 0), 0);
    expect(suma).toBe(motor);
  });

  it('la conversión crea ayudantes válidos por servicio', () => {
    const hs = helpersFromV1(2, 15000, uuid);
    expect(resourcesSchema.safeParse({ helpers: hs }).success).toBe(true);
    expect(hs.every((h) => h.mode === 'servicio')).toBe(true);
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
