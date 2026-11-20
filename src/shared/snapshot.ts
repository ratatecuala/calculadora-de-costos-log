/**
 * Contrato del snapshot interno versionado de una cotización (fase 0, A-63; docs/21 §6).
 *
 * - **Versión 1** (actual, sin `schemaVersion`): `JobRecord['internal']`. Se LEE tal como está:
 *   nunca se recalcula, nunca se reescribe y no se reinterpreta (docs/21 §6.2 y §4.4 punto 6).
 * - **Versión 2** (`schemaVersion: 2`): agrega vehículo ampliado, inventario y recursos.
 *   En el navegador lleva la lista completa (`cargo.items`); en la nube, con D-4 = (b) (A-61),
 *   solo el resumen, y las líneas viajan aparte en `p_cargo_items` (`toCloudPayload`).
 *
 * Ninguna función de este archivo modifica su entrada: devuelven copias.
 * Este archivo NO se usa todavía en la aplicación (la integración es la puerta P2).
 */
import { z } from 'zod';
import {
  MAX_SUMMARY_CHARS,
  capacityEstimateSchema,
  cargoItemsSchema,
  cargoTotalsSchema,
  type CargoItem,
} from './cargo';
import { handlingTimeSchema, resourcesSchema } from './resources';

const finite = z.number().finite();

const routeSource = z.enum(['simulado', 'google', 'declarado', 'mixto']);
const costType = z.enum(['estimado', 'cotaInferior', 'cotaSuperior']);
const vehicleType = z.enum(['camioneta', 'furgon', 'camionLiviano']);
const fuelType = z.enum(['gasolina', 'diesel', 'otro']);

/** Vehículo aplicado, tal como lo guarda la versión 1 (`src/shared/clientQuote.ts`). */
const vehicleV1Shape = {
  id: z.string(),
  name: z.string(),
  type: vehicleType,
  fuel: fuelType,
  kmPerL: finite.nullable(),
  wearPerKm: finite.nullable(),
  adjusted: z.array(z.string()),
};

/** Campos comunes a las versiones 1 y 2 (los de `JobRecord['internal']`). */
const commonShape = {
  routeSource,
  km: finite.nullable(),
  minutes: finite.nullable(),
  costEstimate: finite,
  costType,
  suggestedPrice: finite,
  margin: finite,
  missing: z.array(z.string()),
  engineVersion: z.string().min(1),
};

/**
 * Versión 1, para LEER registros existentes. `passthrough`: un campo extra no impide leer ni se
 * pierde. `vehicle` es opcional porque los registros anteriores al módulo «Mi vehículo» no lo tienen.
 */
export const snapshotV1Schema = z
  .object({
    ...commonShape,
    vehicle: z.object(vehicleV1Shape).passthrough().nullable().optional(),
  })
  .passthrough()
  .refine((s) => !('schemaVersion' in s), 'Un snapshot v1 no tiene schemaVersion');

export type SnapshotV1 = z.output<typeof snapshotV1Schema>;

/** Vehículo de la versión 2: el de la v1 más los datos del catálogo (todos opcionales, null = no se sabe). */
export const vehicleV2Schema = z
  .object({
    ...vehicleV1Shape,
    catalogId: z.string().nullable().default(null),
    catalogDataVersion: z.string().nullable().default(null),
    make: z.string().max(60).nullable().default(null),
    model: z.string().max(60).nullable().default(null),
    modelYear: z.number().int().min(1950).max(2100).nullable().default(null),
    version: z.string().max(80).nullable().default(null),
    payloadKg: z.number().gt(0).max(50000).nullable().default(null),
    cargoVolumeM3: z.number().gt(0).max(200).nullable().default(null),
  })
  .strict();

export const cargoSnapshotSchema = z
  .object({
    mode: z.enum(['rapido', 'detallado']),
    summary: z.string().max(MAX_SUMMARY_CHARS),
    totals: cargoTotalsSchema,
    capacity: capacityEstimateSchema,
    handling: handlingTimeSchema,
    /** Solo en el navegador. En la nube (A-61) las líneas están en `job_cargo_items`. */
    items: cargoItemsSchema.optional(),
  })
  .strict();

export const snapshotV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    /** Fórmulas de costo aplicadas (docs/03). Mientras no se aprueben fórmulas nuevas, igual al motor. */
    formulaVersion: z.string().min(1),
    ...commonShape,
    vehicle: vehicleV2Schema.nullable(),
    /** `null` si la cotización no tiene inventario. */
    cargo: cargoSnapshotSchema.nullable(),
    /** `null` si la cotización no declaró recursos. */
    resources: resourcesSchema.nullable(),
  })
  .strict();

export type SnapshotV2 = z.output<typeof snapshotV2Schema>;
export type CargoSnapshot = z.output<typeof cargoSnapshotSchema>;

/**
 * Vista normalizada para MOSTRAR una cotización de cualquier versión. Una v1 aparece sin
 * inventario ni recursos (`null`), con su vehículo tal cual y sin `formulaVersion` conocido.
 */
export type SnapshotView = Omit<SnapshotV2, 'schemaVersion' | 'formulaVersion'> & {
  formulaVersion: string | null;
};

export type ReadSnapshotResult =
  | { ok: true; sourceVersion: 1 | 2; view: SnapshotView }
  | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function issues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; ');
}

/**
 * Lee un snapshot v1 o v2 y devuelve una vista normalizada. Nunca lanza y nunca modifica `raw`:
 * la vista es una copia. Un registro que no se puede leer devuelve `ok: false` con el motivo,
 * para que la interfaz lo muestre como hoy en vez de inventar datos.
 */
export function readSnapshot(raw: unknown): ReadSnapshotResult {
  if (!isObject(raw)) return { ok: false, reason: 'El snapshot no es un objeto' };
  if (!('schemaVersion' in raw)) {
    const parsed = snapshotV1Schema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: `Snapshot v1 ilegible: ${issues(parsed.error)}` };
    const v1 = structuredClone(parsed.data);
    const vehicle = v1.vehicle
      ? {
          id: v1.vehicle.id,
          name: v1.vehicle.name,
          type: v1.vehicle.type,
          fuel: v1.vehicle.fuel,
          kmPerL: v1.vehicle.kmPerL,
          wearPerKm: v1.vehicle.wearPerKm,
          adjusted: [...v1.vehicle.adjusted],
          catalogId: null,
          catalogDataVersion: null,
          make: null,
          model: null,
          modelYear: null,
          version: null,
          payloadKg: null,
          cargoVolumeM3: null,
        }
      : null;
    return {
      ok: true,
      sourceVersion: 1,
      view: {
        formulaVersion: null,
        routeSource: v1.routeSource,
        km: v1.km,
        minutes: v1.minutes,
        costEstimate: v1.costEstimate,
        costType: v1.costType,
        suggestedPrice: v1.suggestedPrice,
        margin: v1.margin,
        missing: [...v1.missing],
        engineVersion: v1.engineVersion,
        vehicle,
        // La v1 no tenía inventario ni recursos: no se reinterpreta su carga y descarga (§4.4).
        cargo: null,
        resources: null,
      },
    };
  }
  if (raw.schemaVersion === 2) {
    const parsed = snapshotV2Schema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: `Snapshot v2 inválido: ${issues(parsed.error)}` };
    const { schemaVersion: _v, ...rest } = structuredClone(parsed.data);
    return { ok: true, sourceVersion: 2, view: rest };
  }
  return { ok: false, reason: `Versión de snapshot desconocida: ${String(raw.schemaVersion)}` };
}

export type CloudPayloadResult =
  | { ok: true; internal: Record<string, unknown>; cargoItems: CargoItem[] }
  | { ok: false; reason: string };

/**
 * Integridad del inventario de un registro LOCAL v2 antes de copiarlo a la nube (P1 de la
 * auditoría de la fase 0). En el navegador la lista completa SIEMPRE acompaña al resumen
 * (docs/21 §6.3), así que:
 * - `items` ausente → la lista se perdió o el registro no es local: no se copia;
 * - los conteos del resumen deben coincidir con las líneas.
 * Devuelve el motivo del problema, o `null` si el inventario está íntegro.
 * Peso, volumen y completitud se validan o reconstruyen con `cargoSummary` en la fase 1.
 */
export function localCargoIntegrityIssue(cargo: CargoSnapshot): string | null {
  const items = cargo.items;
  if (items === undefined) {
    return `El registro local no trae la lista de objetos, pero su resumen indica ${cargo.totals.lines} líneas: no se copia para no perder el inventario`;
  }
  const t = cargo.totals;
  if (items.length !== t.lines) {
    return `El resumen indica ${t.lines} líneas, pero la lista tiene ${items.length}: no se copia`;
  }
  const conPeso = items.filter((i) => i.unitWeightKg !== null).length;
  if (conPeso !== t.linesWithWeight) {
    return `El resumen indica ${t.linesWithWeight} líneas con peso, pero la lista tiene ${conPeso}: no se copia`;
  }
  const conVolumen = items.filter((i) => i.volumeM3 !== null).length;
  if (conVolumen !== t.linesWithVolume) {
    return `El resumen indica ${t.linesWithVolume} líneas con volumen, pero la lista tiene ${conVolumen}: no se copia`;
  }
  return null;
}

/**
 * Prepara la copia de una cotización LOCAL a la cuenta con D-4 = (b) (A-61, docs/21 §6.3).
 * - v1: `internal` idéntico al de hoy y sin líneas (L1). No se recalcula ni se valida su carga.
 * - v2: `internal` con el resumen y SIN `cargo.items`; las líneas van completas en `cargoItems`
 *   (→ `p_cargo_items` de `create_job_with_quote_v2`). Si el inventario no está íntegro
 *   (`localCargoIntegrityIssue`), NO se copia: nunca se pierden objetos en silencio.
 * No modifica `raw`. Un snapshot inválido no se copia (`ok: false`), y lo local queda intacto.
 */
export function toCloudPayload(raw: unknown): CloudPayloadResult {
  if (!isObject(raw)) return { ok: false, reason: 'El snapshot no es un objeto' };
  if (!('schemaVersion' in raw)) {
    const parsed = snapshotV1Schema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: `Snapshot v1 ilegible: ${issues(parsed.error)}` };
    return { ok: true, internal: structuredClone(raw), cargoItems: [] };
  }
  const parsed = snapshotV2Schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `Snapshot inválido: ${issues(parsed.error)}` };
  const internal = structuredClone(parsed.data);
  if (internal.cargo === null) return { ok: true, internal, cargoItems: [] };
  const problema = localCargoIntegrityIssue(internal.cargo);
  if (problema !== null) return { ok: false, reason: problema };
  const cargoItems = internal.cargo.items ?? [];
  delete internal.cargo.items;
  return { ok: true, internal, cargoItems };
}
