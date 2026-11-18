import { periodKeys } from './period';
import { DEFAULT_POLICY, operationalAllowance, type BudgetPolicy } from './policy';

/**
 * Almacenamiento persistente de contadores. La escritura `putAll` debe ser atómica
 * (en Durable Objects, `storage.put({...})` escribe todas las claves juntas).
 */
export interface CounterStorage {
  getMany(keys: string[]): Promise<Map<string, number>>;
  putAll(entries: Record<string, number>): Promise<void>;
}

export class CounterUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Contador de consumo no disponible');
    this.name = 'CounterUnavailableError';
    this.cause = cause;
  }
}

/** `ruta` y `comparacion` las inicia el usuario; `reintento` es interno del servidor. */
export type ReservationKind = 'ruta' | 'comparacion' | 'reintento';

export interface ReservationRequest {
  kind: ReservationKind;
  userKey: string;
  originKey: string;
  now: Date;
}

export type DenialReason = 'cupo_agotado' | 'limite_usuario' | 'limite_comparaciones' | 'servicio_apagado';

/**
 * Interruptor global en el MISMO almacenamiento que los contadores (auditoría 2, P1).
 * Se lee dentro de cada reserva, así que apagarlo detiene la siguiente consulta
 * (incluidos reintentos) sin reiniciar el Worker ni volver a desplegar.
 * Valor 1 = apagado. Ausente o 0 = encendido.
 */
export const SWITCH_KEY = 'switch:apagado';

export type ReservationResult = { ok: true; globalUsed: number } | { ok: false; reason: DenialReason };

/** Estado para administración: interruptor y consumo global del mes (sin datos de usuarios). */
export interface BudgetStatus {
  enabled: boolean;
  month: string;
  globalUsed: number;
  operationalAllowanceToday: number;
  operationalMonthly: number;
  emergencyMonthly: number;
}

export interface QuotaSnapshot {
  comparisonsLeftToday: number;
  comparisonsLeftMonth: number;
}

/** Puerta de presupuesto: la usa el handler, venga de memoria o de un Durable Object. */
export interface BudgetGate {
  reserve(request: ReservationRequest): Promise<ReservationResult>;
  quota(userKey: string, now: Date): Promise<QuotaSnapshot>;
}

/** Operación administrativa: encender o apagar el cálculo automático en caliente. */
export interface ServiceSwitch {
  setServiceEnabled(enabled: boolean): Promise<void>;
  isServiceEnabled(): Promise<boolean>;
}

export interface LedgerOptions {
  policy?: BudgetPolicy;
  /** Tiempo máximo de la sección crítica; si se supera, el contador se considera caído. */
  timeoutMs?: number;
  /**
   * SOLO PARA PRUEBAS: desactiva la serialización para demostrar que, sin ella,
   * las solicitudes simultáneas superarían el límite. Nunca usar en producción.
   */
  unsafeDisableSerialization?: boolean;
}

/**
 * Libro de consumo. Cada reserva lee los contadores, decide y escribe en una sola
 * sección crítica serializada: dos reservas nunca se intercalan. La reserva se hace
 * ANTES de llamar al proveedor y no se devuelve aunque la llamada falle.
 */
export class BudgetLedger implements BudgetGate, ServiceSwitch {
  private readonly policy: BudgetPolicy;
  private readonly timeoutMs: number;
  private readonly serialize: boolean;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: CounterStorage,
    options: LedgerOptions = {},
  ) {
    this.policy = options.policy ?? DEFAULT_POLICY;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.serialize = !options.unsafeDisableSerialization;
  }

  reserve(request: ReservationRequest): Promise<ReservationResult> {
    return this.exclusive(() => this.reserveUnsafe(request));
  }

  setServiceEnabled(enabled: boolean): Promise<void> {
    return this.exclusive(() => this.storage.putAll({ [SWITCH_KEY]: enabled ? 0 : 1 }));
  }

  status(now: Date): Promise<BudgetStatus> {
    return this.exclusive(async () => {
      const p = periodKeys(now);
      const values = await this.storage.getMany([SWITCH_KEY, `g:${p.month}`]);
      return {
        enabled: (values.get(SWITCH_KEY) ?? 0) !== 1,
        month: p.month,
        globalUsed: values.get(`g:${p.month}`) ?? 0,
        operationalAllowanceToday: operationalAllowance(this.policy, p.dayOfMonth, p.daysInMonth),
        operationalMonthly: this.policy.operationalMonthly,
        emergencyMonthly: this.policy.emergencyMonthly,
      };
    });
  }

  isServiceEnabled(): Promise<boolean> {
    return this.exclusive(async () => ((await this.storage.getMany([SWITCH_KEY])).get(SWITCH_KEY) ?? 0) !== 1);
  }

  quota(userKey: string, now: Date): Promise<QuotaSnapshot> {
    return this.exclusive(async () => {
      const p = periodKeys(now);
      const keys = [`cu:${p.day}:${userKey}`, `cm:${p.month}:${userKey}`];
      const values = await this.storage.getMany(keys);
      const usedDay = values.get(keys[0]!) ?? 0;
      const usedMonth = values.get(keys[1]!) ?? 0;
      const leftMonth = Math.max(0, this.policy.comparisonsPerUserMonthly - usedMonth);
      const leftToday = Math.min(leftMonth, Math.max(0, this.policy.comparisonsPerUserDaily - usedDay));
      return { comparisonsLeftToday: leftToday, comparisonsLeftMonth: leftMonth };
    });
  }

  private async reserveUnsafe(request: ReservationRequest): Promise<ReservationResult> {
    const p = periodKeys(request.now);
    const globalKey = `g:${p.month}`;
    const userDayKey = `u:${p.day}:${request.userKey}`;
    const originDayKey = `o:${p.day}:${request.originKey}`;
    const cmpDayKey = `cu:${p.day}:${request.userKey}`;
    const cmpMonthKey = `cm:${p.month}:${request.userKey}`;

    const values = await this.storage.getMany([SWITCH_KEY, globalKey, userDayKey, originDayKey, cmpDayKey, cmpMonthKey]);
    const v = (k: string) => values.get(k) ?? 0;
    const globalUsed = v(globalKey);

    // 0. Interruptor global en caliente: vale para todo, incluidos los reintentos. No consume.
    if (v(SWITCH_KEY) === 1) return { ok: false, reason: 'servicio_apagado' };

    // 1. Corte de emergencia: vale para todo, incluidos los reintentos.
    if (globalUsed >= this.policy.emergencyMonthly) return { ok: false, reason: 'cupo_agotado' };

    const updates: Record<string, number> = { [globalKey]: globalUsed + 1 };

    if (request.kind !== 'reintento') {
      // 2. Objetivo operativo con ritmo diario acumulativo, solo para solicitudes de usuarios.
      if (globalUsed >= operationalAllowance(this.policy, p.dayOfMonth, p.daysInMonth)) {
        return { ok: false, reason: 'cupo_agotado' };
      }
      // 3. Límite por origen de red (protección contra abuso).
      if (v(originDayKey) >= this.policy.perOriginDaily) return { ok: false, reason: 'limite_usuario' };
      updates[originDayKey] = v(originDayKey) + 1;

      if (request.kind === 'ruta') {
        if (v(userDayKey) >= this.policy.perUserDaily) return { ok: false, reason: 'limite_usuario' };
        updates[userDayKey] = v(userDayKey) + 1;
      } else {
        if (v(cmpDayKey) >= this.policy.comparisonsPerUserDaily || v(cmpMonthKey) >= this.policy.comparisonsPerUserMonthly) {
          return { ok: false, reason: 'limite_comparaciones' };
        }
        updates[cmpDayKey] = v(cmpDayKey) + 1;
        updates[cmpMonthKey] = v(cmpMonthKey) + 1;
      }
    }

    await this.storage.putAll(updates);
    return { ok: true, globalUsed: globalUsed + 1 };
  }

  /**
   * Ejecuta `fn` sin intercalarse con otras reservas.
   * - La siguiente reserva espera a que la anterior TERMINE de verdad (aunque su
   *   solicitante ya haya recibido un error por tiempo), para que una escritura
   *   tardía nunca pise contadores más nuevos.
   * - Quien pide la reserva tiene un plazo (cola + ejecución). Si vence antes de que
   *   su turno empiece, la reserva se cancela y no consume presupuesto.
   * - Cualquier error o vencimiento se entrega como CounterUnavailableError: cierre.
   */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.serialize) return withDeadline(Promise.resolve().then(fn), this.timeoutMs, () => undefined);
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    let cancelled = false;
    const run = previous.then(() => {
      if (cancelled) {
        release();
        throw new CounterUnavailableError('cancelada por tiempo en cola');
      }
      const op = Promise.resolve().then(fn);
      op.then(release, release);
      return op;
    });
    return withDeadline(run, this.timeoutMs, () => {
      cancelled = true;
    });
  }
}

async function withDeadline<T>(promise: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch((error: unknown) => {
        throw error instanceof CounterUnavailableError ? error : new CounterUnavailableError(error);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new CounterUnavailableError('tiempo agotado'));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Almacenamiento en memoria para desarrollo local y pruebas (no persiste entre reinicios). */
export class MemoryCounterStorage implements CounterStorage {
  readonly data = new Map<string, number>();
  constructor(private readonly delayMs = 0) {}

  async getMany(keys: string[]): Promise<Map<string, number>> {
    await sleep(this.delayMs);
    const out = new Map<string, number>();
    for (const k of keys) {
      const value = this.data.get(k);
      if (value !== undefined) out.set(k, value);
    }
    return out;
  }

  async putAll(entries: Record<string, number>): Promise<void> {
    await sleep(this.delayMs);
    for (const [k, value] of Object.entries(entries)) this.data.set(k, value);
  }
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}
