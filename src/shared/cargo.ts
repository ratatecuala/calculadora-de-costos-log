/**
 * Contrato del inventario de carga (fase 0, A-63; docs/21 §3).
 *
 * Solo tipos, esquema Zod y reglas de validación. NO hay interfaz, NO cambia el motor y NO
 * afecta el precio. Las funciones de resumen (`cargoSummary`, `capacityEstimate`,
 * `suggestServiceText`) se declaran aquí como firmas y se implementan en el carril 1 (#47).
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
    qty: z.number().int('La cantidad debe ser un entero').min(1, 'Cantidad mínima 1').max(MAX_QTY, `Cantidad máxima ${MAX_QTY}`).default(1),
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

// Firmas que implementa el carril 1 (#47). Se declaran aquí para fijar el contrato.
export type CargoSummaryFn = (inventory: CargoInventory) => CargoTotals;
export type CapacityEstimateFn = (totals: CargoTotals, vehicle: CapacityVehicle | null) => CapacityEstimate;
/** Texto sugerido ≤ 300 caracteres para `service_description`: nunca kg, m³, $ ni minutos (T-2). */
export type SuggestServiceTextFn = (inventory: CargoInventory, stops: ReadonlyArray<{ role: 'A' | 'B'; floor: number | null; elevator: 'si' | 'no' | 'noCabe' | null }>) => string;
