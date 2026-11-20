/**
 * Contrato de recursos del servicio: paradas, ayudantes y equipamiento (fase 0, A-63; docs/21 §4).
 *
 * Tipos, esquema Zod y funciones puras (fase 1, carril #51, A-66). NO cambia el motor ni el costo:
 * la modalidad por hora y el tiempo de carga incompleto entran al costo solo con la aprobación de
 * docs/21 §4.3–§4.4 (puerta P4). Hasta entonces, estas funciones solo INFORMAN.
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

export const clpSchema = z
  .number({ invalid_type_error: 'El monto debe ser un número' })
  .int('Usa pesos enteros')
  .min(0, 'El monto no puede ser negativo')
  .max(MAX_CLP, 'Revisa el monto');

/** Minutos de carga o descarga de una parada. */
export const loadMinutesSchema = z
  .number()
  .int('Usa minutos enteros')
  .min(0, 'No puede ser negativo')
  .max(MAX_LOAD_MINUTES, `Máximo ${MAX_LOAD_MINUTES} minutos`);

/** Horas pagadas a un ayudante por hora (tope provisional T-7). */
export const helperHoursSchema = z.number().gt(0, 'Las horas deben ser mayores que 0').max(MAX_HELPER_HOURS, `Máximo ${MAX_HELPER_HOURS} horas`);

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
    loadMinutes: loadMinutesSchema.nullable().default(null),
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
    feeService: clpSchema.nullable(),
  })
  .strict();

const helperHora = z
  .object({
    id: z.string().uuid(),
    mode: z.literal('hora'),
    /** Tarifa por hora. `null` = no se sabe. */
    ratePerHour: clpSchema.nullable(),
    /** Tramos pagados, declarados explícitamente (A-58). */
    paidSegments: z
      .array(z.enum(HELPER_SEGMENTS))
      .min(1, 'Indica qué tramos se pagan')
      .max(HELPER_SEGMENTS.length)
      .refine((s) => new Set(s).size === s.length, 'Un tramo aparece dos veces'),
    /** Horas pagadas, declaradas por el transportista. `null` = no se sabe. No se suman a su tiempo. */
    hours: helperHoursSchema.nullable(),
  })
  .strict();

/**
 * `.strict()` en cada modalidad: un ayudante «servicio» con `ratePerHour` se rechaza (A-58).
 * Además, tarifa × horas debe caber en el tope monetario aunque cada campo sea válido (auditoría
 * I-1, P1-3): así la validación que bloquea la emisión coincide con `helperCostLines`.
 */
export const helperSchema = z.discriminatedUnion('mode', [helperServicio, helperHora]).superRefine((h, ctx) => {
  if (h.mode === 'hora' && h.ratePerHour !== null && h.hours !== null && Math.round(h.ratePerHour * h.hours) > MAX_CLP) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hours'],
      message: 'Tarifa × horas supera el monto máximo permitido: revisa la tarifa o las horas',
    });
  }
});
export type Helper = z.output<typeof helperSchema>;

export const equipmentSchema = z
  .object({
    label: z.string().trim().min(1, 'Escribe qué equipamiento es').max(60, 'Máximo 60 caracteres'),
    amount: clpSchema.nullable(),
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
  /** Monto calculable, o `null` si falta un dato o hay un dato inválido. Nunca 0 por defecto. */
  amount: number | null;
  /** `ok`: monto calculado; `faltante`: falta un dato; `invalido`: hay un dato fuera de rango (no suma). */
  status: 'ok' | 'faltante' | 'invalido';
}

// ---------------------------------------------------------------------------
// Funciones puras del carril 2 (#51). Reciben también borradores del editor (`ResourcesLike`), que
// pueden estar incompletos: un dato que falta da `null`, nunca 0.

/** Forma mínima que leen las funciones: la de `Resources`, sin exigir que ya sea válida. */
export interface ResourcesLike {
  stops: ReadonlyArray<Pick<Stop, 'role' | 'loadMinutes'>>;
  helpers: ReadonlyArray<Helper>;
  equipment: ReadonlyArray<Equipment>;
}

/**
 * Minutos de carga y descarga declarados en A y B (docs/21 §4.4). Suma solo las paradas con dato y
 * lista las que faltan. Una parada no registrada cuenta como faltante. Sin coeficientes automáticos:
 * el piso y el ascensor son referencia para el transportista, no generan minutos.
 */
export function handlingTime(resources: Pick<ResourcesLike, 'stops'>): HandlingTime {
  let minutes = 0;
  let known = 0;
  const missingStops: StopRole[] = [];
  for (const role of STOP_ROLES) {
    const raw = resources.stops.find((s) => s.role === role)?.loadMinutes ?? null;
    // Un valor inválido (negativo, decimal, > 1.440) NO suma: cuenta como faltante (auditoría fase 1, P1-2).
    const v = raw !== null && loadMinutesSchema.safeParse(raw).success ? raw : null;
    if (v === null) missingStops.push(role);
    else {
      minutes += v;
      known += 1;
    }
  }
  return { minutes: known > 0 ? minutes : null, complete: missingStops.length === 0, missingStops };
}

/**
 * Una línea por ayudante (A-58). Por servicio: el monto declarado. Por hora: tarifa × horas,
 * redondeado al peso; `null` si falta la tarifa, las horas o los tramos pagados. Nunca 0 por defecto.
 */
export function helperCostLines(resources: Pick<ResourcesLike, 'helpers'>): HelperCostLine[] {
  return resources.helpers.map((h): HelperCostLine => {
    const base = { helperId: h.id, mode: h.mode };
    // Reauditoría fase 1, P2-A: cada línea se valida con el ESQUEMA COMPLETO (id, modalidad,
    // tramos permitidos y sin repetir, campos extra), no solo tarifa y horas. Lo único que se
    // tolera como «faltante» (y no como inválido) es un dato aún vacío: monto, tarifa, horas o tramos.
    const sinTramos = h.mode === 'hora' && Array.isArray(h.paidSegments) && h.paidSegments.length === 0;
    const candidato = sinTramos ? { ...h, paidSegments: ['manipulacion'] } : h;
    if (!helperSchema.safeParse(candidato).success) return { ...base, amount: null, status: 'invalido' };
    if (h.mode === 'servicio') {
      return h.feeService === null ? { ...base, amount: null, status: 'faltante' } : { ...base, amount: h.feeService, status: 'ok' };
    }
    if (h.ratePerHour === null || h.hours === null || sinTramos) return { ...base, amount: null, status: 'faltante' };
    const amount = Math.round(h.ratePerHour * h.hours);
    // El producto también debe caber en el tope monetario, aunque tarifa y horas sean válidas por separado.
    return clpSchema.safeParse(amount).success ? { ...base, amount, status: 'ok' } : { ...base, amount: null, status: 'invalido' };
  });
}

/** Monto de un elemento de equipamiento que puede sumarse, o `null` (faltante o inválido). */
export function equipmentAmount(e: Equipment): { amount: number | null; status: HelperCostLine['status'] } {
  // Reauditoría fase 1, P2-B: se valida el elemento COMPLETO antes de mirar el monto. Un nombre
  // vacío (u otro error) es «inválido» aunque el monto falte; «faltante» es solo el monto vacío.
  if (!equipmentSchema.safeParse(e).success) return { amount: null, status: 'invalido' };
  return e.amount === null ? { amount: null, status: 'faltante' } : { amount: e.amount, status: 'ok' };
}

export interface ResourcesSummary {
  helperCount: number;
  /** Suma de los montos VÁLIDOS de ayudantes. */
  helpersKnownTotal: number;
  /** Ayudantes sin monto porque falta un dato. Si > 0, el total es una cota inferior. */
  helpersMissing: number;
  /** Ayudantes con datos inválidos: no suman y deben revisarse. */
  helpersInvalid: number;
  equipmentKnownTotal: number;
  equipmentMissing: number;
  equipmentInvalid: number;
  handling: HandlingTime;
}

/** Resumen interno para mostrar. INFORMATIVO: no entra al costo sin la aprobación de §4.3–§4.4. */
export function resourcesSummary(resources: ResourcesLike): ResourcesSummary {
  const lines = helperCostLines(resources);
  const equipo = resources.equipment.map(equipmentAmount);
  const known = (xs: Array<number | null>) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
  return {
    helperCount: lines.length,
    helpersKnownTotal: known(lines.map((l) => l.amount)),
    helpersMissing: lines.filter((l) => l.status === 'faltante').length,
    helpersInvalid: lines.filter((l) => l.status === 'invalido').length,
    equipmentKnownTotal: known(equipo.map((e) => e.amount)),
    equipmentMissing: equipo.filter((e) => e.status === 'faltante').length,
    equipmentInvalid: equipo.filter((e) => e.status === 'invalido').length,
    handling: handlingTime(resources),
  };
}

export type HelpersFromV1Result = { ok: true; helpers: Helper[] } | { ok: false; reason: string };

/**
 * Conversión de los ayudantes de la v1 («cantidad × monto por ayudante») a N ayudantes «servicio»
 * con el mismo monto (docs/21 §4.3): la suma es idéntica a la partida actual del motor.
 * **Nunca recorta** (auditoría fase 1, P1-1): si la cantidad supera el límite provisional de
 * ayudantes (T-7) o el monto no cabe en el contrato nuevo, la conversión se RECHAZA con el motivo y
 * el dato v1 debe conservarse tal cual. `newId` se inyecta para que la función sea pura y probable.
 */
export function helpersFromV1(count: number, feePerHelper: number | null, newId: () => string): HelpersFromV1Result {
  if (!Number.isInteger(count) || count < 0) {
    return { ok: false, reason: `Cantidad de ayudantes no válida (${String(count)}): se conserva el dato original sin convertir` };
  }
  if (count > MAX_HELPERS) {
    return {
      ok: false,
      reason: `${count} ayudantes superan el límite provisional de ${MAX_HELPERS} (T-7): no se convierten, para no reducir la cantidad ni el costo`,
    };
  }
  if (count > 0 && feePerHelper !== null && !clpSchema.safeParse(feePerHelper).success) {
    return { ok: false, reason: `El monto por ayudante (${String(feePerHelper)}) no es un monto en pesos enteros válido: se conserva el dato original` };
  }
  return { ok: true, helpers: Array.from({ length: count }, () => ({ id: newId(), mode: 'servicio' as const, feeService: feePerHelper })) };
}

/**
 * Cambiar la modalidad de un ayudante crea un ayudante NUEVO con el mismo id y los montos vacíos:
 * no quedan montos residuales de la otra modalidad (#51, A-58).
 */
export function switchHelperMode(helper: Helper, mode: Helper['mode']): Helper {
  if (helper.mode === mode) return helper;
  return mode === 'servicio'
    ? { id: helper.id, mode: 'servicio', feeService: null }
    : { id: helper.id, mode: 'hora', ratePerHour: null, paidSegments: [], hours: null };
}
