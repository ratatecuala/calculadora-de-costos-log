/**
 * Historial local (navegador). Decisión pendiente #35: cuando se apruebe Supabase,
 * se reemplaza esta implementación sin tocar la interfaz `QuoteRepository`.
 * Solo se guardan datos propios: direcciones del usuario, cálculos comerciales y
 * cotizaciones. Km y minutos de un proveedor se guardan solo si su retención lo permite.
 */
import type { BusinessProfile, JobRecord } from '../shared/clientQuote';

export interface QuoteRepository {
  list(): JobRecord[];
  get(id: string): JobRecord | null;
  save(job: JobRecord): void;
  nextNumber(): number;
  getBusiness(): BusinessProfile;
  saveBusiness(profile: BusinessProfile): void;
}

const JOBS_KEY = 'cotizador.trabajos.v1';
const BUSINESS_KEY = 'cotizador.negocio.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento (modo privado): la app sigue funcionando sin historial.
  }
}

export const localQuoteRepository: QuoteRepository = {
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
