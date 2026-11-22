/**
 * Borrador sin emitir (I-1b, A-68; docs/22 §2.2 y condición C1).
 *
 * - Clave propia `cotizador.borrador.v1`, SEPARADA del historial de cotizaciones emitidas
 *   (`cotizador.trabajos.v1`): un fallo aquí nunca toca lo emitido.
 * - Una entrada por dueño. En I-1 solo existe la del modo sin cuenta (`local`): con cuenta no se
 *   guarda nada (llegará con I-2). Leer pide SIEMPRE un dueño, así que un borrador nunca se
 *   ofrece a otra identidad (C1).
 * - Se guarda solo lo que escribió el usuario (`DraftData`); nunca datos del proveedor de rutas.
 *   D-I8 (A-69): incluye el recorrido MANUAL (km y minutos escritos a mano), nunca el precio.
 * - Lectura tolerante pero validada: un borrador ilegible se descarta con aviso, nunca se carga.
 */
import { z } from 'zod';
import { CARGO_HANDLING, MAX_CARGO_ITEMS } from '../shared/cargo';
import { HELPER_SEGMENTS, MAX_EQUIPMENT, MAX_HELPERS } from '../shared/resources';
import { MAX_MANUAL_LEG_KM, MAX_MANUAL_LEG_MINUTES, type DraftData } from './session';
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

/** Máximo de tramos de un recorrido: base → A → B → base. */
export const MAX_MANUAL_LEGS = 3;
const role = z.enum(['base', 'A', 'B']);
/**
 * D-I8 (A-69): recorrido manual del borrador. `strict`: un campo de más (p. ej. datos del proveedor
 * como distanceM, durationS, source o retention) lo vuelve inválido. Si es inválido se IGNORA solo
 * el recorrido (`catch`), sin perder el resto del borrador. Los borradores anteriores no lo tienen.
 */
const manualRouteSchema = z
  .object({
    key: z.string().min(1).max(2000),
    // A-70: km y minutos ≥ 0 y bajo el tope técnico; un valor fuera de rango invalida SOLO el recorrido.
    legs: z
      .array(
        z
          .object({ from: role, to: role, km: num.min(0).max(MAX_MANUAL_LEG_KM).nullable(), minutes: num.min(0).max(MAX_MANUAL_LEG_MINUTES).nullable() })
          .strict(),
      )
      .min(1)
      .max(MAX_MANUAL_LEGS),
  })
  .strict()
  .nullable()
  .optional()
  .catch(null)
  .transform((v) => v ?? null);

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
  manualRoute: manualRouteSchema,
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

/** Lo que el autoguardado necesita de la sesión (QuoteSession lo cumple). */
export interface AutosaveSession {
  subscribe(listener: () => void): () => void;
  hasDraftContent(): boolean;
  draftData(): DraftData;
  /** El estado actual ya se emitió: pasa a ser la línea base del borrador. */
  markEmitted(): void;
}

export interface AutosaveContext {
  owner(): string;
  ofertaPendiente(): boolean;
  /** Resultado de una escritura: `null` si fue bien, o el motivo del error. */
  onWrite(error: string | null): void;
}

/**
 * Autoguardado con espera (I-1b), sin React para poder probarlo con temporizadores controlados.
 *
 * Carrera corregida (reauditoría de `230ad6e`, P1): un temporizador pendiente podía volver a
 * escribir el borrador DESPUÉS de emitir. `emitted()` lo impide de dos formas:
 *   1. cancela el temporizador pendiente e invalida su generación (un callback ya en cola no escribe);
 *   2. marca el estado emitido como nueva línea base de la sesión: sin cambios posteriores, no hay
 *      «contenido» que guardar. Un cambio NUEVO después de emitir sí vuelve a guardarse.
 * Si la emisión FALLA, no se llama a `emitted()`: el borrador y lo pendiente se conservan.
 */
export class DraftAutosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  constructor(
    private readonly store: DraftStore,
    private readonly session: AutosaveSession,
    private readonly ctx: AutosaveContext,
    private readonly delayMs = 1000,
  ) {}

  /** Empieza a escuchar la sesión. Devuelve la función que detiene todo (cancela lo pendiente). */
  start(): () => void {
    const unsubscribe = this.session.subscribe(() => this.schedule());
    return () => {
      this.cancel();
      unsubscribe();
    };
  }

  private schedule(): void {
    this.cancel();
    const generation = this.generation;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (generation !== this.generation) return; // invalidado por una emisión
      this.run();
    }, this.delayMs);
  }

  private run(): void {
    const accion = decidirAutoguardado(this.ctx.owner(), this.ctx.ofertaPendiente(), this.session.hasDraftContent());
    if (accion === 'borrar') this.store.clear('local');
    if (accion !== 'escribir') return;
    const w = this.store.write('local', this.session.draftData());
    this.ctx.onWrite(w.ok ? null : w.reason);
  }

  /** ¿Hay una escritura programada? (para pruebas y diagnóstico) */
  pending(): boolean {
    return this.timer !== null;
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Emisión EXITOSA en el navegador: cancela e invalida lo pendiente, fija la nueva línea base y
   * borra el borrador guardado. Llamar SOLO tras un guardado exitoso.
   */
  emitted(): void {
    this.cancel();
    this.generation += 1;
    this.session.markEmitted();
    this.store.clear('local');
  }
}

