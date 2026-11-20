/**
 * Contrato del inventario de carga (fase 0, A-63; docs/21 §3).
 *
 * Tipos, esquema Zod y funciones puras de resumen (fase 1, carril #47, A-66). NO cambia el motor
 * y NO afecta el precio: los resúmenes solo INFORMAN.
 *
 * - Una línea NO tiene `id`: su posición es el orden del arreglo (docs/21 §3.1).
 * - Tope de 200 líneas (T-1, A-62), exigido aquí, en el almacenamiento local y en el servidor.
 * - Medidas en centímetros ENTEROS. Un volumen «calculado» debe coincidir con las medidas según
 *   `volumeFromDims`, la misma regla que el CHECK del borrador M3 (P2-4 de la reauditoría).
 * - null ≠ 0 (A-18): un dato que no se conoce es `null`.
 */
import { z } from 'zod';

export const MAX_CARGO_ITEMS = 200;
export const MAX_DIM_CM = 2000;
export const MAX_UNIT_WEIGHT_KG = 5000;
export const MAX_VOLUME_M3 = 100;
export const MAX_QTY = 999;
export const MAX_SUMMARY_CHARS = 200;

export const CARGO_HANDLING = ['normal', 'pesado', 'voluminoso', 'requiere2'] as const;
export type CargoHandling = (typeof CARGO_HANDLING)[number];

/** Lista abierta sugerida para `kind` (no restringe: el usuario puede escribir otro tipo). */
export const SUGGESTED_CARGO_KINDS = ['refrigerador', 'lavadora', 'sofa', 'cama', 'cajas', 'otro'] as const;

export interface DimsCm {
  l: number;
  w: number;
  h: number;
}

/**
 * Volumen en m³ con 3 decimales a partir de medidas en cm enteros.
 * `l·w·h` es un entero de cm³; dividido por 1000 tiene a lo sumo 3 decimales y `Math.round`
 * redondea la mitad hacia arriba, igual que `round(l*w*h/1e6, 3)` de PostgreSQL para positivos.
 * Puede dar 0 para objetos muy pequeños: en ese caso el volumen no se puede marcar «calculado».
 */
export function volumeFromDims(d: DimsCm): number {
  return Math.round((d.l * d.w * d.h) / 1000) / 1000;
}

const dimCm = z
  .number({ invalid_type_error: 'La medida debe ser un número' })
  .int('Usa centímetros enteros')
  .min(1, 'La medida debe ser de al menos 1 cm')
  .max(MAX_DIM_CM, `Máximo ${MAX_DIM_CM} cm`);

export const dimsCmSchema = z.object({ l: dimCm, w: dimCm, h: dimCm }).strict();

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label}: escribe al menos ${min} carácter`)
    .max(max, `${label}: máximo ${max} caracteres`);

export const cargoItemSchema = z
  .object({
    kind: text(1, 30, 'Tipo'),
    description: text(1, 80, 'Descripción'),
    qty: z.number({ invalid_type_error: 'Indica la cantidad' }).int('La cantidad debe ser un entero').min(1, 'Cantidad mínima 1').max(MAX_QTY, `Cantidad máxima ${MAX_QTY}`).default(1),
    unitWeightKg: z
      .number()
      .gt(0, 'El peso debe ser mayor que 0')
      .max(MAX_UNIT_WEIGHT_KG, `Máximo ${MAX_UNIT_WEIGHT_KG} kg por unidad`)
      .nullable()
      .default(null),
    dimsCm: dimsCmSchema.nullable().default(null),
    volumeM3: z
      .number()
      .gt(0, 'El volumen debe ser mayor que 0')
      .max(MAX_VOLUME_M3, `Máximo ${MAX_VOLUME_M3} m³ por unidad`)
      .nullable()
      .default(null),
    volumeSource: z.enum(['calculado', 'declarado']).nullable().default(null),
    /**
     * `false` significa «no marcado como frágil», NO «se sabe que no es frágil» (P2 de la
     * auditoría de la fase 0). No se usa para seguridad ni para costos.
     */
    fragile: z.boolean().default(false),
    /**
     * `normal` significa «sin manejo especial declarado», NO «se verificó que es normal».
     * No se usa para seguridad ni para costos. Ver docs/21 §3.1 (T-8, pendiente).
     */
    handling: z.enum(CARGO_HANDLING).default('normal'),
  })
  .strict()
  .superRefine((item, ctx) => {
    if ((item.volumeM3 === null) !== (item.volumeSource === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['volumeSource'],
        message: 'El volumen y su origen van juntos: los dos o ninguno',
      });
    }
    if (item.volumeSource === 'calculado') {
      if (item.dimsCm === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dimsCm'], message: 'Un volumen calculado necesita las tres medidas' });
      } else if (item.volumeM3 !== volumeFromDims(item.dimsCm)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['volumeM3'],
          message: 'El volumen calculado no coincide con las medidas; recalcúlalo o márcalo como declarado',
        });
      }
    }
  });

export type CargoItem = z.output<typeof cargoItemSchema>;
export type CargoItemInput = z.input<typeof cargoItemSchema>;

export const cargoItemsSchema = z
  .array(cargoItemSchema)
  .max(MAX_CARGO_ITEMS, `Máximo ${MAX_CARGO_ITEMS} líneas por cotización`);

export const cargoInventorySchema = z
  .object({
    mode: z.enum(['rapido', 'detallado']),
    summary: z.string().trim().max(MAX_SUMMARY_CHARS, `Resumen: máximo ${MAX_SUMMARY_CHARS} caracteres`).default(''),
    items: cargoItemsSchema.default([]),
  })
  .strict();

export type CargoInventory = z.output<typeof cargoInventorySchema>;

// ---------------------------------------------------------------------------
// Resultados de las funciones de resumen (forman parte del snapshot v2, docs/21 §6.1).

/** Totales: se suman solo las líneas con dato; la completitud se informa aparte (docs/21 §3.2). */
export interface CargoTotals {
  /** Suma de peso de las líneas con dato, kg. `null` si ninguna línea tiene peso. */
  weightKg: number | null;
  /** Suma de volumen de las líneas con dato, m³. `null` si ninguna línea tiene volumen. */
  volumeM3: number | null;
  lines: number;
  linesWithWeight: number;
  linesWithVolume: number;
}

/** Cota inferior de viajes: solo aviso, nunca tarifa ni garantía de que la carga quepa. */
export type CapacityEstimate =
  | { minTrips: number; basis: 'peso' | 'volumen'; incomplete: boolean }
  | { minTrips: null; reason: string };

export const cargoTotalsSchema = z
  .object({
    weightKg: z.number().min(0).nullable(),
    volumeM3: z.number().min(0).nullable(),
    lines: z.number().int().min(0).max(MAX_CARGO_ITEMS),
    linesWithWeight: z.number().int().min(0).max(MAX_CARGO_ITEMS),
    linesWithVolume: z.number().int().min(0).max(MAX_CARGO_ITEMS),
  })
  .strict();

export const capacityEstimateSchema = z.union([
  z.object({ minTrips: z.number().int().min(1), basis: z.enum(['peso', 'volumen']), incomplete: z.boolean() }).strict(),
  z.object({ minTrips: z.null(), reason: z.string().min(1).max(200) }).strict(),
]);

/** Datos del vehículo que necesita `capacityEstimate` (todos opcionales: null = no se sabe). */
export interface CapacityVehicle {
  payloadKg: number | null;
  cargoVolumeM3: number | null;
}

// ---------------------------------------------------------------------------
// Funciones puras del carril 1 (#47).

/** Redondeo a 3 decimales para que la suma de decimales no deje restos de coma flotante. */
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Totales del inventario (docs/21 §3.2). Peso = Σ cantidad × peso por unidad; volumen =
 * Σ cantidad × volumen por unidad. Solo se suman las líneas con dato; si ninguna tiene el dato, el
 * total es `null` (desconocido), nunca 0. La completitud va en `linesWithWeight` y `linesWithVolume`.
 */
export function cargoSummary(inventory: Pick<CargoInventory, 'items'>): CargoTotals {
  const items = inventory.items;
  let weight = 0;
  let volume = 0;
  let linesWithWeight = 0;
  let linesWithVolume = 0;
  for (const item of items) {
    if (item.unitWeightKg !== null) {
      weight += item.qty * item.unitWeightKg;
      linesWithWeight += 1;
    }
    if (item.volumeM3 !== null) {
      volume += item.qty * item.volumeM3;
      linesWithVolume += 1;
    }
  }
  return {
    weightKg: linesWithWeight > 0 ? r3(weight) : null,
    volumeM3: linesWithVolume > 0 ? r3(volume) : null,
    lines: items.length,
    linesWithWeight,
    linesWithVolume,
  };
}

/**
 * Comprobación de peso y volumen para la futura integración (seguimiento P2 de la auditoría final
 * de la fase 0): compara un resumen guardado con el que se deriva de sus líneas. Devuelve el motivo
 * de la diferencia o `null`. Tolerancia de 0,001 (los totales se redondean a 3 decimales).
 */
export function cargoTotalsIssue(items: readonly CargoItem[], totals: CargoTotals): string | null {
  const real = cargoSummary({ items: [...items] });
  if (real.lines !== totals.lines) return `El resumen indica ${totals.lines} líneas, pero la lista tiene ${real.lines}`;
  if (real.linesWithWeight !== totals.linesWithWeight) {
    return `El resumen indica ${totals.linesWithWeight} líneas con peso, pero la lista tiene ${real.linesWithWeight}`;
  }
  if (real.linesWithVolume !== totals.linesWithVolume) {
    return `El resumen indica ${totals.linesWithVolume} líneas con volumen, pero la lista tiene ${real.linesWithVolume}`;
  }
  const distinto = (a: number | null, b: number | null) => (a === null) !== (b === null) || (a !== null && b !== null && Math.abs(a - b) > 0.001);
  if (distinto(real.weightKg, totals.weightKg)) {
    return `El peso del resumen (${totals.weightKg ?? 'sin dato'} kg) no coincide con la suma de las líneas (${real.weightKg ?? 'sin dato'} kg)`;
  }
  if (distinto(real.volumeM3, totals.volumeM3)) {
    return `El volumen del resumen (${totals.volumeM3 ?? 'sin dato'} m³) no coincide con la suma de las líneas (${real.volumeM3 ?? 'sin dato'} m³)`;
  }
  return null;
}

/** Margen para que un total exacto (p. ej. 1.000 kg con carga útil de 1.000 kg) no cuente un viaje de más. */
const EPS = 1e-9;

/**
 * Cota INFERIOR de viajes según carga útil y volumen del vehículo (docs/21 §3.2). Solo aviso: no
 * garantiza que la carga quepa (forma, acomodo, puertas), no genera tarifa y nunca sugiere
 * sobrecargar. `incomplete` = faltan datos de alguna línea o del vehículo.
 */
export function capacityEstimate(totals: CargoTotals, vehicle: CapacityVehicle | null): CapacityEstimate {
  if (totals.lines === 0) return { minTrips: null, reason: 'No hay objetos en el inventario.' };
  const payload = vehicle?.payloadKg ?? null;
  const capacity = vehicle?.cargoVolumeM3 ?? null;
  const usablePayload = payload !== null && payload > 0 ? payload : null;
  const usableVolume = capacity !== null && capacity > 0 ? capacity : null;
  if (usablePayload === null && usableVolume === null) {
    return { minTrips: null, reason: 'El vehículo no tiene registrada su carga útil ni su volumen de carga.' };
  }
  const byWeight = usablePayload !== null && totals.weightKg !== null ? Math.max(1, Math.ceil(totals.weightKg / usablePayload - EPS)) : null;
  const byVolume = usableVolume !== null && totals.volumeM3 !== null ? Math.max(1, Math.ceil(totals.volumeM3 / usableVolume - EPS)) : null;
  if (byWeight === null && byVolume === null) {
    return { minTrips: null, reason: 'Faltan pesos o volúmenes de los objetos para comparar con el vehículo.' };
  }
  const basis: 'peso' | 'volumen' = byVolume !== null && (byWeight === null || byVolume > byWeight) ? 'volumen' : 'peso';
  const minTrips = Math.max(byWeight ?? 0, byVolume ?? 0);
  const incomplete =
    byWeight === null ||
    byVolume === null ||
    totals.linesWithWeight < totals.lines ||
    totals.linesWithVolume < totals.lines;
  return { minTrips, basis, incomplete };
}

/** Paradas que usa el texto sugerido (subconjunto de `Stop`, para no depender de resources.ts). */
export interface ServiceTextStop {
  role: 'A' | 'B';
  floor: number | null;
  elevator: 'si' | 'no' | 'noCabe' | null;
}

export const MAX_SERVICE_TEXT = 300;

/**
 * Datos internos que el texto para el cliente nunca debe contener (T-2, S1): pesos, volúmenes,
 * montos ni tiempos. Se aplica también a lo que escribió el usuario, por si anotó «80 kg».
 */
const DATO_INTERNO = /\$|\d\s*(kg|kilo|ton|t\b|m3|m³|mt3|cc|lt|l\b|min|hr|h\b|hora|clp|lucas)|\b(kg|kilos?|m3|m³|minutos?|horas?|pesos?|clp)\b/i;

export function containsInternalData(text: string): boolean {
  return DATO_INTERNO.test(text);
}

/** «1.er piso», «2.º piso», «3.er piso», «subterráneo 2». En Chile el piso 1 es el de la calle. */
export function floorLabel(floor: number): string {
  if (floor < 0) return `subterráneo ${-floor}`;
  if (floor === 0) return 'nivel de calle';
  const er = (floor % 10 === 1 && floor % 100 !== 11) || floor % 10 === 3;
  return `${floor}.${er ? 'er' : 'º'} piso`;
}

function stopText(stop: ServiceTextStop): string | null {
  const parts: string[] = [];
  if (stop.floor !== null) parts.push(floorLabel(stop.floor));
  if (stop.elevator === 'si') parts.push('con ascensor');
  if (stop.elevator === 'no') parts.push('sin ascensor');
  if (stop.elevator === 'noCabe') parts.push('ascensor no apto para la carga');
  if (parts.length === 0) return null;
  return `${stop.role === 'A' ? 'origen' : 'destino'} ${parts.join(' ')}`;
}

/**
 * Sugerencia EDITABLE para `service_description` (T-2, docs/21 §6.4), ≤ 300 caracteres.
 * Usa tipos y cantidades del inventario, pisos y ascensor, y la cantidad de ayudantes. Nunca incluye
 * pesos, volúmenes, montos, tiempos ni costos; una descripción escrita con esos datos se reemplaza
 * por el tipo del objeto. No marca «frágil» ni «manejo especial» (T-8: no son datos verificados).
 */
export function suggestServiceText(
  inventory: Pick<CargoInventory, 'mode' | 'summary' | 'items'>,
  stops: readonly ServiceTextStop[] = [],
  helperCount = 0,
): string {
  const seguro = (t: string) => t.trim() !== '' && !containsInternalData(t);
  const nombre = (item: CargoItem) => (seguro(item.description) ? item.description : seguro(item.kind) ? item.kind : 'objeto');
  const tail: string[] = [];
  for (const role of ['A', 'B'] as const) {
    const stop = stops.find((s) => s.role === role);
    const t = stop ? stopText(stop) : null;
    if (t) tail.push(t);
  }
  if (helperCount > 0) tail.push(`${helperCount} ${helperCount === 1 ? 'ayudante' : 'ayudantes'}`);
  const suffix = tail.length ? `; ${tail.join('; ')}` : '';

  let head: string;
  if (inventory.items.length === 0) {
    head = seguro(inventory.summary) ? `Traslado: ${inventory.summary.trim()}` : 'Traslado de carga';
  } else {
    const piezas = inventory.items.map((item) => `${item.qty} × ${nombre(item)}`);
    head = 'Traslado de ';
    let usadas = 0;
    for (const pieza of piezas) {
      const resto = piezas.length - usadas - 1;
      const cola = resto > 0 ? ` y ${resto} ${resto === 1 ? 'objeto' : 'objetos'} más` : '';
      const candidato = `${head}${usadas ? ', ' : ''}${pieza}`;
      if ((candidato + cola + suffix).length > MAX_SERVICE_TEXT && usadas > 0) break;
      head = candidato;
      usadas += 1;
    }
    const faltan = piezas.length - usadas;
    if (faltan > 0) head += ` y ${faltan} ${faltan === 1 ? 'objeto' : 'objetos'} más`;
  }
  const texto = `${head}${suffix}`;
  return texto.length > MAX_SERVICE_TEXT ? `${texto.slice(0, MAX_SERVICE_TEXT - 1)}…` : texto;
}

/** Plantillas con nombre y SIN valores precargados (#47): las referencias solo llegan con fuente (C-2). */
export const CARGO_TEMPLATES: ReadonlyArray<{ kind: string; label: string }> = [
  { kind: 'refrigerador', label: 'Refrigerador' },
  { kind: 'lavadora', label: 'Lavadora' },
  { kind: 'sofa', label: 'Sofá' },
  { kind: 'cama', label: 'Cama' },
  { kind: 'cajas', label: 'Cajas' },
  { kind: 'otro', label: 'Otro objeto' },
];
