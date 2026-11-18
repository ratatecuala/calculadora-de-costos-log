/**
 * Historial de cotizaciones detrás de la interfaz `QuoteRepository` (asíncrona):
 * - `createQuoteRepository`: navegador (localStorage), para el modo SIN cuenta.
 * - `src/web/cloud/quotes.ts`: Supabase, para usuarios con sesión (#35).
 * Solo se guardan datos propios: direcciones del usuario, cálculos comerciales y
 * cotizaciones. Km y minutos de un proveedor se guardan solo si su retención lo permite.
 *
 * Auditoría 2: un fallo al escribir (almacenamiento lleno, bloqueado o modo privado)
 * NO se ignora en silencio: se lanza `QuoteStorageError` y la pantalla lo muestra.
 */
import type { BusinessProfile, JobRecord } from '../shared/clientQuote';
import { MemoryKeyValueStore, type KeyValueStore } from './vehicleRepository';

export type JobPatch = Partial<Pick<JobRecord, 'status' | 'payment'>>;

export interface QuoteRepository {
  /** Dónde quedan los datos: en este navegador o en la cuenta (nube). */
  readonly kind: 'local' | 'nube';
  /** false si el navegador no permite guardar: los datos se pierden al cerrar la pestaña. */
  readonly persistent: boolean;
  list(): Promise<JobRecord[]>;
  get(id: string): Promise<JobRecord | null>;
  /** Guarda una cotización nueva. Lanza un error si no se pudo guardar. */
  create(job: JobRecord): Promise<JobRecord>;
  /** Cambia el estado del trabajo o del pago. Lanza un error si no se pudo guardar. */
  update(id: string, patch: JobPatch): Promise<JobRecord>;
  nextNumber(): Promise<number>;
  getBusiness(): Promise<BusinessProfile>;
  /** Lanza un error si no se pudo guardar. */
  saveBusiness(profile: BusinessProfile): Promise<void>;
}

export class QuoteStorageError extends Error {
  constructor(cause: unknown, message = 'No se pudo guardar en este navegador. Puede estar lleno o bloqueado; la cotización no quedó guardada.') {
    super(message);
    this.name = 'QuoteStorageError';
    this.cause = cause;
  }
}

export const JOBS_KEY = 'cotizador.trabajos.v1';
export const BUSINESS_KEY = 'cotizador.negocio.v1';
const EMPTY_BUSINESS: BusinessProfile = { name: '', phone: '', email: '' };

export function createQuoteRepository(store: KeyValueStore, persistent = true): QuoteRepository {
  const read = <T,>(key: string, fallback: T): T => {
    try {
      const raw = store.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, value: unknown): void => {
    try {
      store.setItem(key, JSON.stringify(value));
    } catch (error) {
      throw new QuoteStorageError(error);
    }
  };
  const jobs = () => read<JobRecord[]>(JOBS_KEY, []);
  return {
    kind: 'local',
    persistent,
    async list() {
      return jobs().sort((a, b) => b.number - a.number);
    },
    async get(id) {
      return jobs().find((j) => j.id === id) ?? null;
    },
    async create(job) {
      const all = jobs().filter((j) => j.id !== job.id);
      all.push(job);
      write(JOBS_KEY, all);
      return job;
    },
    async update(id, patch) {
      const all = jobs();
      const index = all.findIndex((j) => j.id === id);
      if (index < 0) throw new QuoteStorageError(null, 'La cotización ya no existe en este navegador.');
      const updated = { ...all[index]!, ...patch };
      all[index] = updated;
      write(JOBS_KEY, all);
      return updated;
    },
    async nextNumber() {
      return jobs().reduce((max, j) => Math.max(max, j.number), 0) + 1;
    },
    async getBusiness() {
      return read<BusinessProfile>(BUSINESS_KEY, EMPTY_BUSINESS);
    },
    async saveBusiness(profile) {
      write(BUSINESS_KEY, profile);
    },
  };
}

/** Repositorio del navegador. Sin localStorage disponible, usa memoria y lo declara (persistent=false). */
export function browserQuoteRepository(): QuoteRepository {
  try {
    const probe = '__prueba__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return createQuoteRepository(localStorage, true);
  } catch {
    return createQuoteRepository(new MemoryKeyValueStore(), false);
  }
}
