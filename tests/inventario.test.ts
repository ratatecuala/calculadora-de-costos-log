/**
 * Fase 1 · carril #47 (A-66): funciones puras del inventario y estado del editor.
 * Casos del issue: un refrigerador; mudanza de 15 objetos; carga que supera la capacidad;
 * vehículo sin carga útil. S1: el texto sugerido nunca trae kg, m³, $ ni minutos.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_CARGO_ITEMS,
  MAX_SERVICE_TEXT,
  capacityEstimate,
  cargoItemSchema,
  cargoSummary,
  cargoTotalsIssue,
  containsInternalData,
  floorLabel,
  suggestServiceText,
  type CargoItem,
} from '../src/shared/cargo';
import {
  addItem,
  discardItems,
  duplicateItem,
  MODE_CONFLICT_MESSAGE,
  setMode,
  emptyInventoryDraft,
  moveItem,
  newDraftItem,
  removeItem,
  resetToCalculatedVolume,
  setDeclaredVolume,
  updateItem,
  validateInventory,
  type InventoryDraft,
} from '../src/web/modules/inventoryDraft';

const item = (o: Partial<CargoItem> = {}): CargoItem =>
  cargoItemSchema.parse({ kind: 'otro', description: 'Objeto ficticio', ...o });

const refrigerador = item({ kind: 'refrigerador', description: 'Refrigerador', unitWeightKg: 75, dimsCm: { l: 70, w: 70, h: 180 }, volumeM3: 0.882, volumeSource: 'calculado' });

/** Mudanza ficticia de 15 líneas, con y sin datos. */
const mudanza: CargoItem[] = [
  refrigerador,
  item({ kind: 'lavadora', description: 'Lavadora', unitWeightKg: 65, dimsCm: { l: 60, w: 60, h: 85 }, volumeM3: 0.306, volumeSource: 'calculado' }),
  item({ kind: 'sofa', description: 'Sofá 3 cuerpos', unitWeightKg: 45, dimsCm: { l: 210, w: 90, h: 85 }, volumeM3: 1.607, volumeSource: 'calculado' }),
  item({ kind: 'cama', description: 'Cama 2 plazas', unitWeightKg: 40 }),
  item({ kind: 'cajas', description: 'Caja con loza', qty: 12, unitWeightKg: 12, dimsCm: { l: 50, w: 40, h: 40 }, volumeM3: 0.08, volumeSource: 'calculado' }),
  ...Array.from({ length: 10 }, (_, i) => item({ description: `Objeto ${i + 1}`, unitWeightKg: i % 2 ? 10 : null, volumeM3: i % 3 ? 0.2 : null, volumeSource: i % 3 ? 'declarado' : null })),
];

describe('cargoSummary', () => {
  it('un refrigerador', () => {
    expect(cargoSummary({ items: [refrigerador] })).toEqual({ weightKg: 75, volumeM3: 0.882, lines: 1, linesWithWeight: 1, linesWithVolume: 1 });
  });

  it('suma cantidad × valor por unidad, solo con las líneas que tienen dato', () => {
    const t = cargoSummary({ items: mudanza });
    expect(t.lines).toBe(15);
    expect(t.linesWithWeight).toBe(10);
    expect(t.linesWithVolume).toBe(10);
    // 75 + 65 + 45 + 40 + 12×12 + 5×10
    expect(t.weightKg).toBe(419);
    // 0,882 + 0,306 + 1,607 + 12×0,08 + 6×0,2 (sin restos de coma flotante)
    expect(t.volumeM3).toBe(4.955);
  });

  it('sin líneas con dato el total es null (desconocido), nunca 0', () => {
    expect(cargoSummary({ items: [item()] })).toMatchObject({ weightKg: null, volumeM3: null, lines: 1 });
    expect(cargoSummary({ items: [] })).toEqual({ weightKg: null, volumeM3: null, lines: 0, linesWithWeight: 0, linesWithVolume: 0 });
  });

  it('frágil y manejo especial NO cambian los totales (T-8)', () => {
    const marcado = { ...refrigerador, fragile: true, handling: 'requiere2' as const };
    expect(cargoSummary({ items: [marcado] })).toEqual(cargoSummary({ items: [refrigerador] }));
  });
});

describe('cargoTotalsIssue · comprobación de peso y volumen para la integración', () => {
  const totals = cargoSummary({ items: mudanza });

  it('un resumen derivado de las líneas no tiene diferencias', () => {
    expect(cargoTotalsIssue(mudanza, totals)).toBeNull();
  });

  it.each([
    ['peso distinto con los mismos conteos', { ...totals, weightKg: 420 }, 'peso'],
    ['volumen distinto con los mismos conteos', { ...totals, volumeM3: 5 }, 'volumen'],
    ['peso null cuando hay líneas con peso', { ...totals, weightKg: null }, 'peso'],
    ['líneas distintas', { ...totals, lines: 14 }, 'líneas'],
    ['líneas con peso distintas', { ...totals, linesWithWeight: 9 }, 'con peso'],
  ])('%s → se detecta', (_n, malo, palabra) => {
    expect(cargoTotalsIssue(mudanza, malo)).toContain(palabra);
  });

  it('tolera solo el redondeo a 3 decimales', () => {
    expect(cargoTotalsIssue(mudanza, { ...totals, volumeM3: totals.volumeM3! + 0.0004 })).toBeNull();
    expect(cargoTotalsIssue(mudanza, { ...totals, volumeM3: totals.volumeM3! + 0.002 })).not.toBeNull();
  });
});

describe('capacityEstimate (cota inferior, solo aviso)', () => {
  it('vehículo sin carga útil ni volumen: no se estima y se explica', () => {
    const r = capacityEstimate(cargoSummary({ items: [refrigerador] }), { payloadKg: null, cargoVolumeM3: null });
    expect(r).toEqual({ minTrips: null, reason: expect.stringContaining('carga útil') });
    expect(capacityEstimate(cargoSummary({ items: [refrigerador] }), null).minTrips).toBeNull();
  });

  it('sin objetos: no se estima', () => {
    expect(capacityEstimate(cargoSummary({ items: [] }), { payloadKg: 1000, cargoVolumeM3: 8 }).minTrips).toBeNull();
  });

  it('un refrigerador en una camioneta: 1 viaje, completo', () => {
    expect(capacityEstimate(cargoSummary({ items: [refrigerador] }), { payloadKg: 1000, cargoVolumeM3: 3 })).toEqual({ minTrips: 1, basis: 'peso', incomplete: false });
  });

  it('carga que supera la capacidad: aviso de varios viajes según el límite más exigente', () => {
    const pesada = [item({ description: 'Bloques', qty: 30, unitWeightKg: 100, volumeM3: 0.05, volumeSource: 'declarado' })];
    // 3.000 kg / 1.000 kg = 3 viajes por peso; 1,5 m³ / 3 m³ = 1 por volumen
    expect(capacityEstimate(cargoSummary({ items: pesada }), { payloadKg: 1000, cargoVolumeM3: 3 })).toEqual({ minTrips: 3, basis: 'peso', incomplete: false });
    const voluminosa = [item({ description: 'Cajas vacías', qty: 100, unitWeightKg: 1, volumeM3: 0.1, volumeSource: 'declarado' })];
    expect(capacityEstimate(cargoSummary({ items: voluminosa }), { payloadKg: 1000, cargoVolumeM3: 3 })).toEqual({ minTrips: 4, basis: 'volumen', incomplete: false });
  });

  it('un total exactamente igual a la capacidad es 1 viaje, no 2', () => {
    const justa = [item({ qty: 10, unitWeightKg: 100 })];
    expect(capacityEstimate(cargoSummary({ items: justa }), { payloadKg: 1000, cargoVolumeM3: null })).toMatchObject({ minTrips: 1 });
  });

  it('con datos faltantes la estimación se marca incompleta (podrían ser más viajes)', () => {
    const r = capacityEstimate(cargoSummary({ items: mudanza }), { payloadKg: 1000, cargoVolumeM3: 3 });
    expect(r).toMatchObject({ minTrips: 2, basis: 'volumen', incomplete: true });
    expect(capacityEstimate(cargoSummary({ items: [refrigerador] }), { payloadKg: 1000, cargoVolumeM3: null })).toMatchObject({ incomplete: true });
  });

  it('objetos sin peso ni volumen: no se estima', () => {
    expect(capacityEstimate(cargoSummary({ items: [item()] }), { payloadKg: 1000, cargoVolumeM3: 3 })).toMatchObject({ minTrips: null });
  });
});

describe('S1 · suggestServiceText', () => {
  const stops = [
    { role: 'A' as const, floor: 4, elevator: 'no' as const },
    { role: 'B' as const, floor: 3, elevator: 'si' as const },
  ];

  it('tipos, cantidades, pisos y ascensor (solo datos de la carga)', () => {
    const t = suggestServiceText({ mode: 'detallado', summary: '', items: [refrigerador, mudanza[4]!] }, stops);
    expect(t).toBe('Traslado de 1 × Refrigerador, 12 × Caja con loza; origen 4.º piso sin ascensor; destino 3.er piso con ascensor');
  });

  it('nunca incluye pesos, volúmenes, montos ni tiempos, aunque el usuario los escriba', () => {
    const sucios = [
      item({ kind: 'cajas', description: 'Cajas de 20 kg', qty: 3 }),
      item({ kind: 'otro', description: 'Mueble 2 m³' }),
      item({ kind: 'mesa', description: 'Mesa $50.000' }),
      item({ kind: 'otro', description: 'Armar en 30 minutos' }),
    ];
    const t = suggestServiceText({ mode: 'detallado', summary: '', items: sucios }, stops);
    expect(t).not.toMatch(/kg|m³|m3|\$|minuto|hora/i);
    expect(t).toContain('3 × cajas'); // se usa el tipo en vez de la descripción con datos
    expect(t).toContain('1 × mesa');
    expect(suggestServiceText({ mode: 'rapido', summary: 'Mudanza de 300 kg', items: [] })).toBe('Traslado de carga');
  });

  it('modo rápido con resumen limpio', () => {
    expect(suggestServiceText({ mode: 'rapido', summary: 'Mudanza de departamento', items: [] }, stops)).toBe(
      'Traslado: Mudanza de departamento; origen 4.º piso sin ascensor; destino 3.er piso con ascensor',
    );
  });

  it('no menciona «frágil» ni «manejo especial» (T-8)', () => {
    const t = suggestServiceText({ mode: 'detallado', summary: '', items: [{ ...refrigerador, fragile: true, handling: 'requiere2' }] });
    expect(t).not.toMatch(/fr[aá]gil|manejo|personas/i);
  });

  it(`con ${MAX_CARGO_ITEMS} líneas no supera ${MAX_SERVICE_TEXT} caracteres y resume el resto`, () => {
    const muchas = Array.from({ length: MAX_CARGO_ITEMS }, (_, i) => item({ description: `Objeto largo de prueba número ${i + 1} con texto extenso` }));
    const t = suggestServiceText({ mode: 'detallado', summary: '', items: muchas }, stops);
    expect(t.length).toBeLessThanOrEqual(MAX_SERVICE_TEXT);
    expect(t).toMatch(/y \d+ objetos más/);
    expect(t).not.toMatch(/ayudante/i);
  });

  it('containsInternalData reconoce las unidades típicas', () => {
    for (const s of ['20 kg', '20kg', '1,5 m3', '2 m³', '$5.000', '45 min', '3 horas', '10 kilos']) expect(containsInternalData(s)).toBe(true);
    for (const s of ['Refrigerador', 'Sofá 3 cuerpos', 'Cama 2 plazas', 'Caja con loza']) expect(containsInternalData(s)).toBe(false);
  });

  it('floorLabel usa la forma chilena', () => {
    expect([1, 2, 3, 4, 11, 13, 21, 0, -2].map(floorLabel)).toEqual([
      '1.er piso',
      '2.º piso',
      '3.er piso',
      '4.º piso',
      '11.º piso',
      '13.er piso',
      '21.er piso',
      'nivel de calle',
      'subterráneo 2',
    ]);
  });
});

describe('Editor de inventario (estado puro)', () => {
  let n = 0;
  const key = () => `k${++n}`;
  const conUna = (): InventoryDraft => addItem(emptyInventoryDraft(), newDraftItem('a', { kind: 'cajas', label: 'Cajas' }));

  it('las plantillas solo ponen el nombre: sin pesos ni medidas', () => {
    const it0 = conUna().items[0]!;
    expect(it0).toMatchObject({ kind: 'cajas', description: 'Cajas', qty: 1, unitWeightKg: null, l: null, w: null, h: null, volumeM3: null, fragile: false, handling: 'normal' });
  });

  it('el volumen se calcula solo con las tres medidas y con la regla del servidor', () => {
    let d = conUna();
    d = updateItem(d, 'a', { l: 50, w: 40 });
    expect(d.items[0]).toMatchObject({ volumeM3: null, volumeSource: null });
    d = updateItem(d, 'a', { h: 40 });
    expect(d.items[0]).toMatchObject({ volumeM3: 0.08, volumeSource: 'calculado' });
    d = updateItem(d, 'a', { h: null });
    expect(d.items[0]).toMatchObject({ volumeM3: null, volumeSource: null });
  });

  it('un volumen escrito queda declarado y no se pisa al cambiar medidas; se puede volver al calculado', () => {
    let d = updateItem(conUna(), 'a', { l: 50, w: 40, h: 40 });
    d = setDeclaredVolume(d, 'a', 0.1);
    d = updateItem(d, 'a', { l: 60 });
    expect(d.items[0]).toMatchObject({ volumeM3: 0.1, volumeSource: 'declarado' });
    d = resetToCalculatedVolume(d, 'a');
    expect(d.items[0]).toMatchObject({ volumeM3: 0.096, volumeSource: 'calculado' });
  });

  it('agregar, duplicar, reordenar y eliminar', () => {
    let d = conUna();
    d = addItem(d, newDraftItem('b'));
    d = duplicateItem(d, 'a', 'c');
    expect(d.items.map((i) => i.key)).toEqual(['a', 'c', 'b']);
    d = moveItem(d, 'b', -1);
    expect(d.items.map((i) => i.key)).toEqual(['a', 'b', 'c']);
    expect(moveItem(d, 'a', -1)).toBe(d);
    d = removeItem(d, 'b');
    expect(d.items.map((i) => i.key)).toEqual(['a', 'c']);
  });

  it(`no permite más de ${MAX_CARGO_ITEMS} líneas (T-1)`, () => {
    let d = emptyInventoryDraft();
    for (let i = 0; i < MAX_CARGO_ITEMS + 5; i++) d = addItem(d, newDraftItem(key(), { kind: 'cajas', label: 'Caja' }));
    expect(d.items).toHaveLength(MAX_CARGO_ITEMS);
    expect(duplicateItem(d, d.items[0]!.key, 'x').items).toHaveLength(MAX_CARGO_ITEMS);
    expect(validateInventory(d).inventory?.items).toHaveLength(MAX_CARGO_ITEMS);
  });

  it('los errores se ubican en la línea y el campo', () => {
    let d = updateItem(conUna(), 'a', { qty: null, l: 50.5, w: 40, h: 40, description: '' });
    const v = validateInventory(d);
    expect(v.inventory).toBeNull();
    expect(v.errors['a.qty']).toBe('Indica la cantidad');
    expect(v.errors['a.l']).toBe('Usa centímetros enteros');
    expect(v.errors['a.description']).toMatch(/Descripción/);
    d = updateItem(d, 'a', { qty: 2, l: 50, description: 'Caja' });
    expect(validateInventory(d)).toMatchObject({ errors: {} });
  });

  it('un volumen calculado que no corresponde a las medidas no se puede producir desde el editor', () => {
    // Medidas diminutas: el cálculo da 0 m³, así que la línea queda sin volumen en vez de «calculado = 0».
    const d = updateItem(conUna(), 'a', { l: 1, w: 1, h: 1 });
    expect(d.items[0]).toMatchObject({ volumeM3: null, volumeSource: null });
    expect(validateInventory(d).inventory).not.toBeNull();
  });

  it('P2-2 · pasar a modo rápido con una lista NO la descarta en silencio: el inventario queda inválido hasta decidir', () => {
    const d = setMode({ ...updateItem(conUna(), 'a', { qty: 2 }), summary: 'Mudanza pequeña' }, 'rapido');
    const v = validateInventory(d);
    expect(v.inventory).toBeNull();
    expect(v.errors.mode).toBe(MODE_CONFLICT_MESSAGE(1));
    expect(d.items).toHaveLength(1);
  });

  it('P2-2 · ida y vuelta entre modos conserva todas las líneas y sus datos', () => {
    let d = updateItem(conUna(), 'a', { qty: 2, unitWeightKg: 30 });
    d = addItem(d, newDraftItem('b', { kind: 'cama', label: 'Cama' }));
    const antes = structuredClone(d.items);
    d = setMode(setMode(setMode(d, 'rapido'), 'detallado'), 'rapido');
    d = setMode(d, 'detallado');
    expect(d.items).toEqual(antes);
    expect(validateInventory(d).inventory?.items).toHaveLength(2);
  });

  it('P2-2 · solo el descarte explícito vacía la lista; entonces el modo rápido es válido', () => {
    const d = discardItems(setMode({ ...conUna(), summary: 'Mudanza pequeña' }, 'rapido'));
    expect(d.items).toEqual([]);
    expect(validateInventory(d).inventory).toEqual({ mode: 'rapido', summary: 'Mudanza pequeña', items: [] });
  });

  it('el inventario validado es el mismo que acepta el contrato y su resumen es coherente', () => {
    let d = conUna();
    d = updateItem(d, 'a', { qty: 3, unitWeightKg: 12, l: 50, w: 40, h: 40 });
    const v = validateInventory(d);
    const items = v.inventory!.items;
    expect(cargoTotalsIssue(items, cargoSummary({ items }))).toBeNull();
    expect(cargoSummary({ items })).toMatchObject({ weightKg: 36, volumeM3: 0.24 });
  });
});

describe('P1-3 · el texto para el cliente no divulga recursos internos', () => {
  it('no acepta ayudantes: la función solo recibe inventario y accesos', () => {
    const inv = { mode: 'detallado' as const, summary: '', items: [refrigerador] };
    // Si alguien vuelve a agregar un tercer parámetro, `npm run typecheck` falla aquí.
    // @ts-expect-error — suggestServiceText no recibe la cantidad de ayudantes (P1-3).
    const t = suggestServiceText(inv, [], 2);
    expect(t).not.toMatch(/ayudante/i);
  });

  it('la vista previa no pasa recursos internos al texto para el cliente', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/web/components/ModulesPreview.tsx', import.meta.url), 'utf8');
    const llamada = /suggestServiceText\(([^;]*)\)/.exec(src)?.[1] ?? '';
    expect(llamada).not.toMatch(/helpers|equipment|loadMinutes|resourcesSummary/);
  });

  it('aunque las paradas traigan datos internos (minutos), el texto solo usa piso y ascensor', () => {
    const inv = { mode: 'detallado' as const, summary: '', items: [refrigerador] };
    const limpias = [{ role: 'A' as const, floor: 4, elevator: 'no' as const }];
    const completas = [{ role: 'A' as const, floor: 4, elevator: 'no' as const, loadMinutes: 45, stairs: true, carryMeters: 30, access: 'Portón 2' }];
    expect(suggestServiceText(inv, completas)).toBe(suggestServiceText(inv, limpias));
    expect(suggestServiceText(inv, completas)).not.toMatch(/45|min|ayudante|portón/i);
  });
});

