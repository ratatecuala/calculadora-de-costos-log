/**
 * Historial en Supabase: `jobs` (costos internos) + `client_quotes` (lo que ve el cliente),
 * guardados juntos con `create_job_with_quote` (una transacción). Enlaces públicos con
 * token aleatorio de 256 bits, revocables (`quote_shares`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBoundClient } from './client';
import type { BusinessProfile, ClientQuote, JobRecord } from '../../shared/clientQuote';
import type { JobPatch, QuoteRepository } from '../storage';
import { clientQuoteFromRow, jobFromRow, jobWithQuotePayload, type ClientQuoteRow, type JobRow } from './mappers';
import { CloudError } from './vehicles';

const SAVE_FAILED = 'No se pudo guardar en tu cuenta. Revisa tu conexión e inténtalo de nuevo; la cotización no quedó guardada.';
const LOAD_FAILED = 'No se pudo cargar tu historial. Revisa tu conexión.';
export const SESSION_CHANGED = 'La sesión cambió mientras se guardaba. No se guardó nada en la otra cuenta; vuelve a intentarlo.';

export interface CloudQuoteOptions {
  /** ¿La app sigue con la sesión de este usuario? Se consulta antes de cada escritura. */
  isCurrentUser?: () => boolean;
  /** Crea un cliente fijado a un token (inyectable en pruebas). */
  bindClient?: (accessToken: string) => SupabaseClient | null;
  /** Interno: este repositorio ya está fijado a una sesión. */
  bound?: boolean;
}

export interface QuoteShare {
  id: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export class CloudQuoteRepository implements QuoteRepository {
  readonly kind = 'nube' as const;
  readonly persistent = true;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
    private readonly options: CloudQuoteOptions = {},
  ) {}

  /** Antes de escribir: si la app ya está en otra identidad, no se escribe nada. */
  private ensureCurrent(): void {
    if (this.options.isCurrentUser && !this.options.isCurrentUser()) throw new CloudError(SESSION_CHANGED);
  }

  /**
   * Sexta auditoría (P1): repositorio FIJADO al token de la sesión vigente al empezar a guardar.
   * Todas sus solicitudes van con ese token aunque en el cliente compartido entre otra cuenta,
   * y cada escritura se detiene si la identidad de la app cambió.
   */
  async forWrite(): Promise<CloudQuoteRepository> {
    if (this.options.bound) return this;
    this.ensureCurrent();
    const { data } = await this.supabase.auth.getSession();
    const session = data.session;
    if (!session || session.user.id !== this.userId) throw new CloudError(SESSION_CHANGED);
    const bound = (this.options.bindClient ?? ((t: string) => createBoundClient(t)))(session.access_token);
    if (!bound) throw new CloudError(SAVE_FAILED);
    return new CloudQuoteRepository(bound, this.userId, { ...this.options, bound: true });
  }

  async list(): Promise<JobRecord[]> {
    const { data, error } = await this.supabase.from('jobs').select('*').order('number', { ascending: false }).order('created_at', { ascending: false });
    if (error) throw new CloudError(LOAD_FAILED, error);
    return ((data ?? []) as JobRow[]).map(jobFromRow);
  }

  async get(id: string): Promise<JobRecord | null> {
    const { data, error } = await this.supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw new CloudError(LOAD_FAILED, error);
    return data ? jobFromRow(data as JobRow) : null;
  }

  async create(job: JobRecord): Promise<JobRecord> {
    this.ensureCurrent();
    const { data, error } = await this.supabase.rpc('create_job_with_quote', jobWithQuotePayload(job, null));
    if (error || !data) throw new CloudError(SAVE_FAILED, error);
    // El número lo asigna la base, de forma atómica (A-47): se usa el que devuelve.
    const saved = data as { id: string; number: number; issued_number: number };
    return {
      ...job,
      id: saved.id,
      number: saved.number,
      ...(saved.issued_number !== saved.number ? { issuedNumber: saved.issued_number } : { issuedNumber: undefined }),
    };
  }

  async update(id: string, patch: JobPatch): Promise<JobRecord> {
    this.ensureCurrent();
    const { data, error } = await this.supabase.from('jobs').update(patch).eq('id', id).select('*');
    if (error) throw new CloudError(SAVE_FAILED, error);
    if (!data || data.length === 0) throw new CloudError('La cotización ya no existe en tu cuenta.');
    return jobFromRow(data[0] as JobRow);
  }

  /** Solo indicativo para armar el registro: el número definitivo lo asigna la base al guardar. */
  async nextNumber(): Promise<number> {
    const { data, error } = await this.supabase.from('jobs').select('number').order('number', { ascending: false }).limit(1);
    if (error) throw new CloudError(LOAD_FAILED, error);
    return ((data?.[0] as { number: number } | undefined)?.number ?? 0) + 1;
  }

  async getBusiness(): Promise<BusinessProfile> {
    const { data, error } = await this.supabase.from('profiles').select('business_name, business_phone, business_email').maybeSingle();
    if (error) throw new CloudError(LOAD_FAILED, error);
    const r = data as { business_name: string; business_phone: string; business_email: string } | null;
    return { name: r?.business_name ?? '', phone: r?.business_phone ?? '', email: r?.business_email ?? '' };
  }

  async saveBusiness(profile: BusinessProfile): Promise<void> {
    this.ensureCurrent();
    const { error } = await this.supabase
      .from('profiles')
      .upsert({ id: this.userId, business_name: profile.name, business_phone: profile.phone, business_email: profile.email });
    if (error) throw new CloudError(SAVE_FAILED, error);
  }

  // ---- Enlaces públicos ----

  /** Cotización al cliente guardada (la que verá quien abra el enlace). */
  async clientQuote(jobId: string): Promise<{ id: string; quote: ClientQuote } | null> {
    const { data, error } = await this.supabase.from('client_quotes').select('*').eq('job_id', jobId).maybeSingle();
    if (error) throw new CloudError(LOAD_FAILED, error);
    if (!data) return null;
    const row = data as ClientQuoteRow & { id: string };
    return { id: row.id, quote: clientQuoteFromRow(row) };
  }

  async listShares(jobId: string): Promise<QuoteShare[]> {
    const cq = await this.clientQuote(jobId);
    if (!cq) return [];
    const { data, error } = await this.supabase
      .from('quote_shares')
      .select('id, created_at, expires_at, revoked_at')
      .eq('quote_id', cq.id)
      .order('created_at', { ascending: false });
    if (error) throw new CloudError(LOAD_FAILED, error);
    return ((data ?? []) as Array<{ id: string; created_at: string; expires_at: string | null; revoked_at: string | null }>).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
    }));
  }

  /** Crea un enlace y devuelve el token UNA vez (en la base solo queda su hash). */
  async createShare(jobId: string, expiresInDays: number | null): Promise<string> {
    const cq = await this.clientQuote(jobId);
    if (!cq) throw new CloudError('Esta cotización no tiene versión para el cliente.');
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null;
    const { data, error } = await this.supabase.rpc('create_quote_share', { p_quote_id: cq.id, p_expires_at: expiresAt });
    if (error || typeof data !== 'string') throw new CloudError('No se pudo crear el enlace.', error);
    return data;
  }

  async revokeShare(shareId: string): Promise<void> {
    const { error } = await this.supabase.rpc('revoke_quote_share', { p_share_id: shareId });
    if (error) throw new CloudError('No se pudo desactivar el enlace.', error);
  }
}

/** Lectura pública por token (sin sesión). Devuelve null si el enlace no existe, venció o fue revocado. */
export async function fetchPublicQuote(supabase: SupabaseClient, token: string): Promise<ClientQuote | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await supabase.rpc('get_public_quote', { p_token: token });
  if (error) throw new CloudError('No se pudo abrir la cotización. Inténtalo de nuevo.', error);
  const row = (data as ClientQuoteRow[] | null)?.[0];
  return row ? clientQuoteFromRow(row) : null;
}
