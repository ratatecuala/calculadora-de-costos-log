/**
 * Contrato de recursos del servicio: paradas, ayudantes y equipamiento (fase 0, A-63; docs/21 §4).
 *
 * Solo tipos, esquema Zod y firmas. NO cambia el motor ni el costo: la modalidad por hora y el
 * tiempo de carga incompleto entran al costo solo con la aprobación de docs/21 §4.3–§4.4 (puerta P4).
 *
 * - Accesibilidad solo en las paradas A y B (T-3, A-62).
 * - Una modalidad por ayudante (A-58): el esquema rechaza campos de la otra modalidad.
 * - null ≠ 0 (A-18): monto, horas o minutos desconocidos son `null`, nunca 0.
 */
import { z } from 'zod';

/** Monto en pesos chilenos: entero, ≥ 0 y bajo el mismo tope que `jobs.net_price`. */
export const MAX_CLP = 9_999_999_999;
export const MAX_LOAD_MINUTES = 1440;
export const MAX_CARRY_METERS = 1000;
export const MAX_HELPER_HOURS = 24;
/**
 * SUPUESTOS TÉCNICOS de la fase 0, pendientes de revisión de producto (T-7, docs/21 §12) antes
 * de habilitar la interfaz: tope de horas por ayudante (`MAX_HELPER_HOURS`), de ayudantes, de
 * equipamiento y el tope monetario `MAX_CLP`. Un valor fuera de rango se RECHAZA con un mensaje;
 * nunca se recorta al tope ni se convierte en 0. Un dato desconocido es `null`.
 */
export const MAX_HELPERS = 20;
export const MAX_EQUIPMENT = 20;

const clp = z
  .number({ invalid_type_error: 'El monto debe ser un número' })
  .int('Usa pesos enteros')
  .min(0, 'El monto no puede ser negativo')
  .max(MAX_CLP, 'Revisa el monto');

export const STOP_ROLES = ['A', 'B'] as const;
export type StopRole = (typeof STOP_ROLES)[number];

export const stopSchema = z
  .object({
    role: z.enum(STOP_ROLES),
    floor: z.number().int('El piso debe ser un entero').min(-5, 'Piso mínimo −5').max(60, 'Piso máximo 60').nullable().default(null),
    elevator: z.enum(['si', 'no', 'noCabe']).nullable().default(null),
    stairs: z.boolean().nullable().default(null),
    carryMeters: z.number().min(0, 'No puede ser negativo').max(MAX_CARRY_METERS, `Máximo ${MAX_CARRY_METERS} m`).nullable().default(null),
    access: z.string().trim().max(120, 'Acceso: máximo 120 caracteres').default(''),
    loadMinutes: z
      .number()
      .int('Usa minutos enteros')
      .min(0, 'No puede ser negativo')
      .max(MAX_LOAD_MINUTES, `Máximo ${MAX_LOAD_MINUTES} minutos`)
      .nullable()
      .default(null),
  })
  .strict();

export type Stop = z.output<typeof stopSchema>;

export const HELPER_SEGMENTS = ['manipulacion', 'traslado'] as const;
export type HelperSegment = (typeof HELPER_SEGMENTS)[number];

const helperServicio = z
  .object({
    id: z.string().uuid(),
    mode: z.literal('servicio'),
    /** Pago por el servicio completo. `null` = no se sabe (costo faltante, nunca 0). */
    feeService: clp.nullable(),
  })
  .strict();

const helperHora = z
  .object({
    id: z.string().uuid(),
    mode: z.literal('hora'),
    /** Tarifa por hora. `null` = no se sabe. */
    ratePerHour: clp.nullable(),
    /** Tramos pagados, declarados explícitamente (A-58). */
    paidSegments: z
      .array(z.enum(HELPER_SEGMENTS))
      .min(1, 'Indica qué tramos se pagan')
      .max(HELPER_SEGMENTS.length)
      .refine((s) => new Set(s).size === s.length, 'Un tramo aparece dos veces'),
    /** Horas pagadas, declaradas por el transportista. `null` = no se sabe. No se suman a su tiempo. */
    hours: z.number().gt(0, 'Las horas deben ser mayores que 0').max(MAX_HELPER_HOURS, `Máximo ${MAX_HELPER_HOURS} horas`).nullable(),
  })
  .strict();

/** `.strict()` en cada modalidad: un ayudante «servicio» con `ratePerHour` se rechaza (A-58). */
export const helperSchema = z.discriminatedUnion('mode', [helperServicio, helperHora]);
export type Helper = z.output<typeof helperSchema>;

export const equipmentSchema = z
  .object({
    label: z.string().trim().min(1, 'Escribe qué equipamiento es').max(60, 'Máximo 60 caracteres'),
    amount: clp.nullable(),
  })
  .strict();
export type Equipment = z.output<typeof equipmentSchema>;

export const resourcesSchema = z
  .object({
    stops: z
      .array(stopSchema)
      .max(STOP_ROLES.length)
      .refine((s) => new Set(s.map((x) => x.role)).size === s.length, 'Cada parada (A o B) aparece una sola vez')
      .default([]),
    helpers: z
      .array(helperSchema)
      .max(MAX_HELPERS, `Máximo ${MAX_HELPERS} ayudantes`)
      .refine((h) => new Set(h.map((x) => x.id)).size === h.length, 'Ayudante repetido')
      .default([]),
    equipment: z.array(equipmentSchema).max(MAX_EQUIPMENT, `Máximo ${MAX_EQUIPMENT} elementos`).default([]),
  })
  .strict();

export type Resources = z.output<typeof resourcesSchema>;

// ---------------------------------------------------------------------------
// Resultados de las funciones (forman parte del snapshot v2, docs/21 §6.1).

/** Tiempo de carga y descarga: suma solo las paradas con dato e informa las que faltan (§4.4). */
export interface HandlingTime {
  minutes: number | null;
  complete: boolean;
  missingStops: StopRole[];
}

export const handlingTimeSchema = z
  .object({
    minutes: z.number().int().min(0).max(MAX_LOAD_MINUTES * STOP_ROLES.length).nullable(),
    complete: z.boolean(),
    missingStops: z.array(z.enum(STOP_ROLES)).max(STOP_ROLES.length),
  })
  .strict()
  .refine((h) => h.complete === (h.missingStops.length === 0), 'complete debe coincidir con missingStops');

/** Línea de costo de un ayudante. `amount: null` = faltante (A-18). */
export interface HelperCostLine {
  helperId: string;
  mode: Helper['mode'];
  amount: number | null;
}

// Firmas que implementa el carril 2 (#51). Se declaran aquí para fijar el contrato.
export type HandlingTimeFn = (resources: Resources) => HandlingTime;
export type HelperCostLinesFn = (resources: Resources) => HelperCostLine[];
