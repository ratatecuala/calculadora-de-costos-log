/**
 * Historial local (navegador). Decisión pendiente #35: cuando se apruebe Supabase,
 * se reemplaza esta implementación sin tocar la interfaz `QuoteRepository`.
 * Solo se guardan datos propios: direcciones del usuario, cálculos comerciales y
 * cotizaciones. Km y minutos de un proveedor se guardan solo si su retención lo permite.
 *
 * Auditoría 2: un fallo al escribir (almacenamiento lleno, bloqueado o modo privado)
 * ya NO se ignora en silencio: se lanza `QuoteStorageError` y la pantalla lo muestra.
 */
import type { BusinessProfile, JobRecord } from '../shared/clientQuote';
import { MemoryKeyValueStore, type KeyValueStore } from './vehicleRepository';

export interface QuoteRepository {
  /** false si el navegador no permite guardar: los datos se pierden al cerrar la pestaña. */
  readonly persistent: boolean;
  list(): JobRecord[];
  get(id: string): JobRecord | null;
  /** Lanza QuoteStorageError si no se pudo guardar. */
  save(job: JobRecord): void;
  nextNumber(): number;
  getBusiness(): BusinessProfile;
  /** Lanza QuoteStorageError si no se pudo guardar. */
  saveBusiness(profile: BusinessProfile): void;
}

export class QuoteStorageError extends Error {
  constructor(cause: unknown) {
    super('No se pudo guardar en este navegador. Puede estar lleno o bloqueado; la cotización no quedó guardada.');
    this.name = 'QuoteStorageError';
    this.cause = cause;
  }
}

export const JOBS_KEY = 'cotizador.trabajos.v1';
export const BUSINESS_KEY = 'cotizador.negocio.v1';

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
  return {
    persistent,
    list() {
      return read<JobRecord[]>(JOBS_KEY, []).sort((a, b) => b.number - a.number);
    },
    get(id) {
      return read<JobRecord[]>(JOBS_KEY, []).find((j) => j.id === id) ?? null;
    },
    save(job) {
      const jobs = read<JobRecord[]>(JOBS_KEY, []).filter((j) => j.id !== job.id);
      jobs.push(job);
      write(JOBS_KEY, jobs);
    },
    nextNumber() {
      return read<JobRecord[]>(JOBS_KEY, []).reduce((max, j) => Math.max(max, j.number), 0) + 1;
    },
    getBusiness() {
      return read<BusinessProfile>(BUSINESS_KEY, { name: '', phone: '', email: '' });
    },
    saveBusiness(profile) {
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
