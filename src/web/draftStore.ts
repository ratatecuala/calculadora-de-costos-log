/**
 * Borrador sin emitir (I-1b, A-68; docs/22 §2.2 y condición C1).
 *
 * - Clave propia `cotizador.borrador.v1`, SEPARADA del historial de cotizaciones emitidas
 *   (`cotizador.trabajos.v1`): un fallo aquí nunca toca lo emitido.
 * - Una entrada por dueño. En I-1 solo existe la del modo sin cuenta (`local`): con cuenta no se
 *   guarda nada (llegará con I-2). Leer pide SIEMPRE un dueño, así que un borrador nunca se
 *   ofrece a otra identidad (C1).
 * - Se guarda solo lo que escribió el usuario (`DraftData`); nunca datos del proveedor de rutas.
 * - Lectura tolerante pero validada: un borrador ilegible se descarta con aviso, nunca se carga.
 */
import { z } from 'zod';
import { CARGO_HANDLING, MAX_CARGO_ITEMS } from '../shared/cargo';
import { HELPER_SEGMENTS, MAX_EQUIPMENT, MAX_HELPERS } from '../shared/resources';
import type { DraftData } from './session';
import type { KeyValueStore } from './vehicleRepository';

export const DRAFT_KEY = 'cotizador.borrador.v1';
export const DRAFT_FORMAT = 1;
/** En I-1 solo el modo sin cuenta tiene borrador persistente. */
export const DRAFT_OWNERS = ['local'] as const;

export interface StoredDraft {
  format: typeof DRAFT_FORMAT;
  savedAt: string;
  data: DraftData;
}

export type DraftRead = { status: 'none' } | { status: 'ok'; draft: StoredDraft } | { status: 'ilegible' };
export type DraftWrite = { ok: true } | { ok: false; reason: string };

const num = z.number().finite();
/** Parada del borrador: los valores pueden estar fuera de rango (se validan al emitir), no el tipo. */
const stopSchema = (role: 'A' | 'B') =>
  z.object({
    role: z.literal(role),
    floor: z.number().finite().nullable(),
    elevator: z.enum(['si', 'no', 'noCabe']).nullable(),
    stairs: z.boolean().nullable(),
    carryMeters: z.number().finite().nullable(),
    access: z.string(),
    loadMinutes: z.number().finite().nullable(),
  });
const numOrNull = num.nullable();

/** Forma mínima de un borrador (puede estar incompleto: los editores validan al emitir). */
const draftDataSchema = z.object({
  inputs: z.object({
    origin: z.string(),
    destination: z.string(),
    base: z.string(),
    startAtBase: z.boolean(),
    returnToBase: z.boolean(),
  }),
  params: z.object({
    fuelPricePerL: numOrNull,
    kmPerL: numOrNull,
    wearPerKm: numOrNull,
    fixedPerHour: numOrNull,
    ownerPerHour: numOrNull,
    helpers: num,
    helperFee: numOrNull,
    loadMinutes: num,
    tolls: numOrNull,
    otherCosts: num,
  }),
  margin: num,
  surcharges: num,
  vehicle: z
    .object({ id: z.string(), name: z.string(), type: z.enum(['camioneta', 'furgon', 'camionLiviano']), fuel: z.enum(['gasolina', 'diesel', 'otro']), kmPerL: numOrNull, wearPerKm: numOrNull })
    .nullable(),
  cargo: z.object({
    mode: z.enum(['rapido', 'detallado']),
    summary: z.string(),
    items: z
      .array(
        z.object({
          key: z.string(),
          kind: z.string(),
          description: z.string(),
          qty: numOrNull,
          unitWeightKg: numOrNull,
          l: numOrNull,
          w: numOrNull,
          h: numOrNull,
          volumeM3: numOrNull,
          volumeSource: z.enum(['calculado', 'declarado']).nullable(),
          fragile: z.boolean(),
          handling: z.enum(CARGO_HANDLING),
        }),
      )
      .max(MAX_CARGO_ITEMS),
  }),
  resources: z.object({
    stops: z.tuple([stopSchema('A'), stopSchema('B')]),
    helpers: z
      .array(
        z.discriminatedUnion('mode', [
          z.object({ id: z.string(), mode: z.literal('servicio'), feeService: numOrNull }),
          z.object({ id: z.string(), mode: z.literal('hora'), ratePerHour: numOrNull, paidSegments: z.array(z.enum(HELPER_SEGMENTS)), hours: numOrNull }),
        ]),
      )
      .max(MAX_HELPERS),
    equipment: z.array(z.object({ key: z.string(), label: z.string(), amount: numOrNull })).max(MAX_EQUIPMENT),
  }),
});

const storedSchema = z.object({ format: z.literal(DRAFT_FORMAT), savedAt: z.string(), data: draftDataSchema });

type DraftMap = Record<string, unknown>;

export class DraftStore {
  constructor(private readonly store: KeyValueStore) {}

  private readMap(): DraftMap | null {
    try {
      const raw = this.store.getItem(DRAFT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as DraftMap) : null;
    } catch {
      return null;
    }
  }

  private writeMap(map: DraftMap): DraftWrite {
    try {
      this.store.setItem(DRAFT_KEY, JSON.stringify(map));
      return { ok: true };
    } catch {
      return { ok: false, reason: 'No se pudo guardar el borrador en este navegador (puede estar lleno). Tus cotizaciones emitidas no se ven afectadas.' };
    }
  }

  /** Borrador de ESTE dueño. Nunca devuelve el de otra identidad. */
  read(owner: string): DraftRead {
    const map = this.readMap();
    if (map === null) return { status: 'ilegible' };
    if (!(owner in map)) return { status: 'none' };
    const parsed = storedSchema.safeParse(map[owner]);
    return parsed.success ? { status: 'ok', draft: parsed.data } : { status: 'ilegible' };
  }

  write(owner: string, data: DraftData, now: Date = new Date()): DraftWrite {
    if (!(DRAFT_OWNERS as readonly string[]).includes(owner)) return { ok: false, reason: 'Con cuenta, el borrador aún no se guarda (llegará con I-2).' };
    const map = this.readMap() ?? {};
    map[owner] = { format: DRAFT_FORMAT, savedAt: now.toISOString(), data } satisfies StoredDraft;
    return this.writeMap(map);
  }

  /** Borra SOLO el borrador de este dueño (al emitir, al descartar o si es ilegible). */
  clear(owner: string): void {
    const map = this.readMap();
    if (map === null) {
      this.writeMap({});
      return;
    }
    if (!(owner in map)) return;
    delete map[owner];
    this.writeMap(map);
  }
}

export type AccionBorrador = 'escribir' | 'borrar' | 'nada';

/**
 * Qué hace el autoguardado tras un cambio (auditoría I-1, P1-1):
 * - con cuenta o con una oferta de recuperación pendiente: nada (no se pisa lo guardado);
 * - con contenido del usuario (cualquier diferencia con la línea base): se escribe;
 * - si el usuario dejó todo como al inicio (borró lo que había escrito): se BORRA el borrador
 *   guardado, para que lo eliminado no reaparezca al recargar.
 */
export function decidirAutoguardado(owner: string, ofertaPendiente: boolean, hayContenido: boolean): AccionBorrador {
  if (owner !== 'local' || ofertaPendiente) return 'nada';
  return hayContenido ? 'escribir' : 'borrar';
}

/** «hace 5 min», «hace 2 h», «hace 3 días». */
export function haceCuanto(savedAt: string, now: Date = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(savedAt).getTime()) / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
