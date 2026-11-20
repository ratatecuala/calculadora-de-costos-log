/**
 * Fase 1 (A-66) · Filas plegables: estado de cada dato (obligatorio, opcional que falta o
 * completo), resúmenes de filas cerradas, apertura al agregar, y separación entre los datos de
 * la carga (que podría informar el cliente) y los recursos internos del transportista.
 */
import { describe, expect, it } from 'vitest';
import { CARGO_ITEM_AUDIENCE, RESOURCE_BLOCK_AUDIENCE, STOP_AUDIENCE } from '../src/shared/audiencia';
import { cargoItemSchema, suggestServiceText } from '../src/shared/cargo';
import { resourcesSchema, stopSchema } from '../src/shared/resources';
import {
  abrirAlAgregar,
  alternar,
  estadoObjeto,
  resumenAcceso,
  resumenAyudante,
  resumenEquipo,
  resumenObjeto,
  resumenTiempos,
  totalInformativo,
} from '../src/web/modules/estado';
import { addItem, emptyInventoryDraft, newDraftItem, updateItem, validateInventory } from '../src/web/modules/inventoryDraft';
import { emptyResourcesDraft, updateStop, validateResources } from '../src/web/modules/resourcesDraft';

const conItem = (patch = {}) => updateItem(addItem(emptyInventoryDraft(), newDraftItem('a', { kind: 'cajas', label: 'Caja con loza' })), 'a', patch);

describe('Estado de un objeto', () => {
  it('nuevo desde plantilla: faltan datos OPCIONALES (no es un error)', () => {
    const d = conItem();
    const e = estadoObjeto(d.items[0]!, validateInventory(d).errors);
    expect(e).toMatchObject({ nivel: 'faltan', etiqueta: 'Faltan datos opcionales' });
    expect(e.detalle).toBe('Falta peso y medidas o volumen (opcional; mejora la estimación de viajes)');
  });

  it('con peso y medidas: completo', () => {
    const d = conItem({ qty: 12, unitWeightKg: 12, l: 50, w: 40, h: 40 });
    expect(estadoObjeto(d.items[0]!, validateInventory(d).errors)).toMatchObject({ nivel: 'completo', etiqueta: 'Completo' });
  });

  it('obligatorios faltantes o inválidos: «Revisar» con el motivo', () => {
    const d = conItem({ qty: null, description: '' });
    const e = estadoObjeto(d.items[0]!, validateInventory(d).errors);
    expect(e).toMatchObject({ nivel: 'error', etiqueta: 'Revisar', detalle: '2 campos por corregir' });
    const d2 = conItem({ l: 50.5, w: 40, h: 40 });
    expect(estadoObjeto(d2.items[0]!, validateInventory(d2).errors)).toMatchObject({ nivel: 'error', detalle: 'Usa centímetros enteros' });
  });

  it('resumen de la fila cerrada (bajo el título «cantidad × nombre»): peso y volumen por unidad', () => {
    const d = conItem({ qty: 12, unitWeightKg: 12, l: 50, w: 40, h: 40, fragile: true });
    expect(resumenObjeto(d.items[0]!)).toBe('12 kg c/u · 0,08 m³ c/u · frágil (marcado)');
    expect(resumenObjeto(conItem().items[0]!)).toBe('Sin peso ni medidas');
    expect(resumenObjeto(conItem({ handling: 'requiere2' }).items[0]!)).toBe('manejo especial');
  });

  it('cerrar y volver a abrir no pierde datos: el borrador no depende de la fila abierta', () => {
    const d = conItem({ qty: 3, unitWeightKg: 20 });
    let abiertas = alternar(new Set(), 'a');
    abiertas = alternar(abiertas, 'a');
    expect(abiertas.has('a')).toBe(false);
    expect(validateInventory(d).inventory?.items[0]).toMatchObject({ qty: 3, unitWeightKg: 20 });
  });
});

describe('Apertura al agregar', () => {
  it('abre la nueva y cierra las demás sin errores; las que tienen errores siguen abiertas', () => {
    const next = abrirAlAgregar(new Set(['ok', 'mal']), 'nueva', (k) => k === 'mal');
    expect([...next].sort()).toEqual(['mal', 'nueva']);
  });
});

describe('Accesos y recursos', () => {
  it('accesos sin datos: opcional, nunca error', () => {
    const r = resumenAcceso(emptyResourcesDraft().stops[0]!);
    expect(r).toEqual({
      texto: 'Sin datos de acceso',
      estado: { nivel: 'faltan', etiqueta: 'Sin datos (opcional)', detalle: 'Falta piso, ascensor, escaleras y acarreo (opcional)' },
    });
  });

  it('accesos completos', () => {
    const d = updateStop(emptyResourcesDraft(), 'A', { floor: 4, elevator: 'no', stairs: true, carryMeters: 20, access: 'Calle angosta' });
    expect(resumenAcceso(d.stops[0]!)).toMatchObject({ texto: '4.º piso · sin ascensor · con escaleras · acarreo 20 m · con nota de acceso', estado: { nivel: 'completo' } });
  });

  it('tiempos: falta el destino', () => {
    const d = updateStop(emptyResourcesDraft(), 'A', { loadMinutes: 30 });
    expect(resumenTiempos(d.stops)).toMatchObject({ texto: 'Origen: 30 min · Destino: sin dato', estado: { nivel: 'faltan', etiqueta: 'Faltan minutos' } });
  });

  it('ayudantes y equipamiento: monto calculado, faltante o con error', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(resumenAyudante({ id, mode: 'hora', ratePerHour: 6000, hours: 3, paidSegments: ['manipulacion'] }, {})).toMatchObject({
      texto: 'Por hora · 3 h × $6.000 = $18.000',
      estado: { nivel: 'completo' },
    });
    expect(resumenAyudante({ id, mode: 'hora', ratePerHour: 6000, hours: 3, paidSegments: [] }, {}).estado).toMatchObject({ nivel: 'faltan', detalle: 'Falta tramos: el monto queda faltante' });
    expect(resumenAyudante({ id, mode: 'servicio', feeService: null }, {})).toMatchObject({ texto: 'Por servicio · monto sin dato', estado: { etiqueta: 'Falta monto' } });
    expect(resumenAyudante({ id, mode: 'hora', ratePerHour: 6000, hours: 30, paidSegments: ['traslado'] }, { [`${id}.hours`]: 'Máximo 24 horas' }).estado).toMatchObject({ nivel: 'error' });
    expect(resumenEquipo({ key: 'e', label: 'Mantas', amount: 5000 }, {})).toMatchObject({ texto: 'Mantas · $5.000', estado: { nivel: 'completo' } });
  });

  it('validateResources sigue aceptando el borrador vacío', () => {
    expect(validateResources(emptyResourcesDraft()).resources).not.toBeNull();
  });
});

describe('Datos de la carga (cliente) y recursos internos (transportista)', () => {
  it('la clasificación cubre exactamente los campos de los contratos', () => {
    expect(Object.keys(CARGO_ITEM_AUDIENCE).sort()).toEqual(Object.keys(cargoItemSchema.innerType().shape).sort());
    expect(Object.keys(STOP_AUDIENCE).sort()).toEqual(Object.keys(stopSchema.shape).sort());
    expect(Object.keys(RESOURCE_BLOCK_AUDIENCE).sort()).toEqual(Object.keys(resourcesSchema.shape).filter((k) => k !== 'stops').sort());
  });

  it('tiempos, ayudantes y equipamiento son internos; ningún monto es del cliente', () => {
    expect(STOP_AUDIENCE.loadMinutes).toBe('transportista');
    expect(RESOURCE_BLOCK_AUDIENCE).toEqual({ helpers: 'transportista', equipment: 'transportista' });
    expect(Object.values(CARGO_ITEM_AUDIENCE).every((a) => a === 'cliente')).toBe(true);
  });

  it('el texto para el cliente no incluye datos internos aunque existan', () => {
    const d = conItem({ qty: 2, unitWeightKg: 30, l: 50, w: 40, h: 40 });
    const inv = validateInventory(d).inventory!;
    const t = suggestServiceText(inv, [{ role: 'A', floor: 4, elevator: 'no' }]);
    expect(t).not.toMatch(/kg|m³|\$|min|hora|ayudante/i);
  });
});

describe('P1-2 · filas y totales con datos inválidos', () => {
  const id = '00000000-0000-4000-8000-000000000077';
  it('ayudante con 30 h: «monto no calculable» y «Revisar», nunca $180.000', () => {
    const r = resumenAyudante({ id, mode: 'hora', ratePerHour: 6000, hours: 30, paidSegments: ['manipulacion'] }, { [`${id}.hours`]: 'Máximo 24 horas' });
    expect(r.texto).toBe('Por hora · 30 h × $6.000 · monto no calculable');
    expect(r.texto).not.toContain('180.000');
    expect(r.estado).toMatchObject({ nivel: 'error', detalle: 'Máximo 24 horas' });
    // Aun sin el mapa de errores, el contrato lo detecta.
    expect(resumenAyudante({ id, mode: 'hora', ratePerHour: 6000, hours: 30, paidSegments: ['manipulacion'] }, {}).estado.nivel).toBe('error');
  });

  it('equipamiento con monto inválido: «no suma (revisar)»', () => {
    expect(resumenEquipo({ key: 'e', label: 'Carro', amount: 100.5 }, {})).toMatchObject({ texto: 'Carro · no suma (revisar)', estado: { nivel: 'error' } });
  });

  it('totalInformativo: solo válidos, con «al menos» y la cuenta de faltantes e inválidos', () => {
    expect(totalInformativo(0, 0, 0, 0)).toBe('ninguno');
    expect(totalInformativo(2, 25000, 0, 0)).toBe('$25.000');
    expect(totalInformativo(2, 25000, 1, 0)).toBe('al menos $25.000 (falta el monto de 1)');
    expect(totalInformativo(3, 25000, 1, 1)).toBe('al menos $25.000 (falta el monto de 1; 1 con datos inválidos, no suma)');
    expect(totalInformativo(1, 0, 0, 1)).toBe('sin monto calculable (1 con datos inválidos, no suma)');
    expect(totalInformativo(2, 0, 2, 0)).toBe('sin monto calculable (falta el monto de 2)');
  });
});

