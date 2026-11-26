/**
 * Migración OPCIONAL del historial del navegador a la cuenta, cuando el usuario lo pide.
 * - Sin duplicados: cada registro viaja con su id local (`local_id`), único por dueño.
 *   Repetir la migración (otra pestaña, un corte de red) no crea copias.
 * - Verificación: después de copiar se consulta la nube; solo si TODO está, se marca como
 *   migrado para ese usuario.
 * - La copia local NUNCA se borra aquí: el modo sin cuenta sigue teniendo su historial.
 * - Identidad estable (quinta auditoría, P1): `supabase` debe ser un cliente FIJADO a la sesión
 *   de `userId` (createBoundClient), así nada puede grabarse a nombre de otra cuenta. Además,
 *   si la sesión de la app cambia a mitad de camino (`isCurrentUser()` = false), la copia se
 *   detiene y no se marca como completa.
 * - Copia MIXTA v1/v2 (I-1, docs/22 §2.5, P1-2 y C2): ANTES de llamar a la base se clasifica cada
 *   cotización. Solo las elegibles (v1 y v2 sin líneas) se copian; las v2 con detalle de carga y
 *   las ilegibles quedan DIFERIDAS en el navegador, con su motivo, y nunca se marcan como copiadas.
 *   I-2 (A-81): con `cargaNube`, las v2 con detalle de carga también son elegibles y se copian con
 *   `create_job_with_quote_v2` (resumen sin líneas + líneas aparte, en una transacción).
 *   Para una v2 se envía únicamente el `internal` preparado y validado por `toCloudPayload` (sin
 *   `cargo.items`, medido en bytes), nunca el registro original.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobRecord } from '../../shared/clientQuote';
import { toCloudPayload } from '../../shared/snapshot';
import type { QuoteRepository } from '../storage';
import type { KeyValueStore, VehicleRepository } from '../vehicleRepository';
import { jobWithQuotePayload, vehicleToRow } from './mappers';
import { CloudError } from './vehicles';

export const MIGRATION_KEY = 'cotizador.migracion.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeferredJob {
  id: string;
  number: number;
  clase: 'v2-con-lineas' | 'ilegible' | 'precio-fraccionario';
  motivo: string;
}

interface MigrationLog {
  /** `jobs` y `vehicles`: verificados en la nube (acumulativo). `deferred`: no copiadas, con motivo. */
  [userId: string]: { at: string; jobs: string[]; vehicles: string[]; deferred?: DeferredJob[] };
}

export type ClaseCopia = 'v1' | 'v2-resumen' | 'v3' | DeferredJob['clase'];

export interface Clasificada {
  job: JobRecord;
  clase: ClaseCopia;
  /** Registro que se envía a la base (solo elegibles). Para v2, con el `internal` preparado. */
  envio?: JobRecord;
  motivo?: string;
}

export const MOTIVO_DETALLE_CARGA = 'Tiene detalle de carga: la cuenta aún no puede guardarlo (llegará con I-2)';

/** Opciones de la copia. `cargaNube` (I-2, A-81): la cuenta ya guarda las líneas con la v2. */
export interface OpcionesCopia {
  cargaNube?: boolean;
}

/**
 * Clasificación previa de una cotización local (docs/22 §2.5). No modifica el registro.
 * - TODAS se validan con `toCloudPayload` (auditoría I-1, P1-2), también las v1: una ilegible
 *   (null, truncada, con tipos inesperados) queda DIFERIDA y nunca llega a la base, sin
 *   interrumpir la copia de las válidas.
 * - v1 legible: elegible, y se envía el registro ORIGINAL tal cual, igual que hasta hoy.
 * - v2 sin líneas: elegible con el `internal` validado y medido en bytes (C2).
 * - v2 con líneas: diferida hasta I-2.
 * - v3 (A-88): elegible con el `internal` validado y medido en bytes; nunca tiene líneas.
 */
export function clasificarParaCopia(job: JobRecord, opciones: OpcionesCopia = {}): Clasificada {
  if ([job.netPrice, job.tax?.amount ?? 0].some(monto => Number.isFinite(monto) && !Number.isInteger(monto))) {
    return { job, clase: 'precio-fraccionario', motivo: 'El precio tiene decimales. La cotización se conserva íntegra en este navegador y queda pendiente de importación.' };
  }
  const internal = job.internal as unknown;
  const p = toCloudPayload(internal);
  if (!p.ok) return { job, clase: 'ilegible', motivo: p.reason };
  if (typeof internal !== 'object' || internal === null || !('schemaVersion' in internal)) {
    return { job, clase: 'v1', envio: job };
  }
  if ((internal as { schemaVersion?: unknown }).schemaVersion === 3) {
    // A-88: v3 sin líneas de carga, validada y medida por `toCloudPayload`; va por `create_job_with_quote`.
    return { job, clase: 'v3', envio: { ...job, internal: p.internal as JobRecord['internal'] } };
  }
  if (p.cargoItems.length > 0) {
    // I-2: con `cargaNube` se copia con la v2, con TODAS sus líneas (el registro local completo).
    if (opciones.cargaNube) return { job, clase: 'v2-con-lineas', envio: job };
    return { job, clase: 'v2-con-lineas', motivo: MOTIVO_DETALLE_CARGA };
  }
  return { job, clase: 'v2-resumen', envio: { ...job, internal: p.internal as JobRecord['internal'] } };
}

/** Elegible = tiene `envio` (v1, v2 sin líneas y, con `cargaNube`, v2 con líneas). */
const esElegible = (c: Clasificada) => c.envio !== undefined;
const union = (a: readonly string[], b: readonly string[]) => [...new Set([...a, ...b])];

function readLog(store: KeyValueStore): MigrationLog {
  try {
    return JSON.parse(store.getItem(MIGRATION_KEY) ?? '{}') as MigrationLog;
  } catch {
    return {};
  }
}

export interface PendingLocalData {
  /** Cotizaciones ELEGIBLES aún no copiadas (las que el botón puede copiar). */
  jobs: number;
  vehicles: number;
  /** Cotizaciones que quedan en el navegador (detalle de carga o ilegibles): no son pendientes de copia. */
  deferred: DeferredJob[];
}

/** Cuánto del historial local todavía no se copió a la cuenta de este usuario. */
export async function pendingLocalData(
  localQuotes: QuoteRepository,
  localVehicles: VehicleRepository,
  store: KeyValueStore,
  userId: string,
  opciones: OpcionesCopia = {},
): Promise<PendingLocalData> {
  const done = readLog(store)[userId];
  const clasif = (await localQuotes.list()).filter((j) => UUID.test(j.id) && !done?.jobs.includes(j.id)).map((j) => clasificarParaCopia(j, opciones));
  const vehicles = (await localVehicles.list()).filter((v) => UUID.test(v.id) && !done?.vehicles.includes(v.id));
  return { jobs: clasif.filter(esElegible).length, vehicles: vehicles.length, deferred: clasif.filter((c) => !esElegible(c)).map(diferida) };
}

function diferida(c: Clasificada): DeferredJob {
  return { id: c.job.id, number: c.job.issuedNumber ?? c.job.number, clase: c.clase as DeferredJob['clase'], motivo: c.motivo ?? '' };
}

export interface MigrationResult {
  jobsCopied: number;
  jobsAlreadyThere: number;
  vehiclesCopied: number;
  /** Todas las ELEGIBLES y los vehículos están verificados en la nube. */
  verified: boolean;
  /** Quedan en el navegador: nunca se marcan como copiadas. */
  deferred: DeferredJob[];
}

const numero = (n: number) => `N° ${String(n).padStart(4, '0')}`;

/** Aviso que se muestra tanto antes de copiar como en el resultado de la copia. */
export function avisoDiferidas(deferred: DeferredJob[]): string {
  if (!deferred.length) return '';
  if (deferred.some(d => d.clase === 'precio-fraccionario')) {
    return deferred.map(d => `${numero(d.number)}: ${d.motivo}`).join(' ');
  }
  const numeros = deferred.map(d => numero(d.number)).join(', ');
  const motivo = deferred.every(d => d.clase === 'v2-con-lineas')
    ? 'tienen detalle de carga que la cuenta aún no puede guardar'
    : 'no se pudieron preparar para la cuenta';
  return `${deferred.length} ${deferred.length === 1 ? 'cotización queda' : 'cotizaciones quedan'} en este navegador (${numeros}) porque ${motivo}.`;
}

/** Nunca se muestra un éxito global si quedan cotizaciones en el navegador. */
export function mensajeCopia(r: MigrationResult): string {
  const diferidas = r.deferred.length ? ` ${avisoDiferidas(r.deferred)}` : '';
  if (!r.verified) return `La copia quedó incompleta. Puedes reintentar: no se duplicará nada. Tus datos locales siguen intactos.${diferidas}`;
  const base = `se copiaron ${r.jobsCopied} cotizaciones y ${r.vehiclesCopied} vehículos a tu cuenta${r.jobsAlreadyThere ? ` (${r.jobsAlreadyThere} ya estaban)` : ''}.`;
  return r.deferred.length
    ? `Se ${base.slice(3)}${diferidas} La copia de este navegador se mantiene.`
    : `Listo: ${base} La copia de este navegador se mantiene.`;
}

export async function migrateLocalToCloud(args: {
  supabase: SupabaseClient;
  userId: string;
  localQuotes: QuoteRepository;
  localVehicles: VehicleRepository;
  store: KeyValueStore;
  /** ¿La app sigue con la sesión de `userId`? Se consulta antes de cada paso. */
  isCurrentUser: () => boolean;
  /** I-2 (A-81): copiar también las v2 con detalle de carga, con `create_job_with_quote_v2`. */
  cargaNube?: boolean;
}): Promise<MigrationResult> {
  const { supabase, userId, localQuotes, localVehicles, store, isCurrentUser } = args;
  const opciones: OpcionesCopia = { cargaNube: args.cargaNube ?? false };
  const ensureSameUser = () => {
    if (!isCurrentUser()) {
      throw new CloudError('La sesión cambió durante la copia y se detuvo. Lo copiado quedó en la cuenta que la inició; no se borró nada.');
    }
  };
  ensureSameUser();
  // Clasificación ANTES de cualquier llamada a la base (docs/22 §2.5, paso 1).
  const clasif = (await localQuotes.list()).filter((j) => UUID.test(j.id)).map((j) => clasificarParaCopia(j, opciones));
  const elegibles = clasif.filter(esElegible);
  const copiadasAntes = new Set(readLog(store)[userId]?.jobs ?? []);
  const deferred = clasif.filter(c => !esElegible(c) && !copiadasAntes.has(c.job.id)).map(diferida);
  const vehicles = (await localVehicles.list()).filter((v) => UUID.test(v.id));
  const localDefault = await localVehicles.getDefaultId();

  // 1. Vehículos (sin duplicados por local_id).
  let vehiclesCopied = 0;
  if (vehicles.length) {
    ensureSameUser();
    const { data, error } = await supabase
      .from('vehicles')
      .upsert(
        vehicles.map((v) => ({ ...vehicleToRow(v), owner_id: userId, local_id: v.id })),
        { onConflict: 'owner_id,local_id', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw new CloudError('No se pudieron copiar tus vehículos. No se borró nada.', error);
    vehiclesCopied = data?.length ?? 0;
  }

  // 2. Predeterminado: solo si la cuenta todavía no tiene uno.
  if (localDefault) {
    ensureSameUser();
    const { data: current } = await supabase.from('vehicles').select('id').eq('is_default', true).maybeSingle();
    if (!current) {
      const { data: match } = await supabase.from('vehicles').select('id').eq('local_id', localDefault).maybeSingle();
      if (match) await supabase.rpc('set_default_vehicle', { p_vehicle_id: (match as { id: string }).id });
    }
  }

  // 3. Datos comerciales: solo si la cuenta no tiene.
  const localBusiness = await localQuotes.getBusiness();
  if (localBusiness.name || localBusiness.phone || localBusiness.email) {
    ensureSameUser();
    const { data: profile } = await supabase.from('profiles').select('business_name').maybeSingle();
    if (!profile || !(profile as { business_name: string }).business_name) {
      await supabase.from('profiles').upsert({
        id: userId,
        business_name: localBusiness.name,
        business_phone: localBusiness.phone,
        business_email: localBusiness.email,
      });
    }
  }

  // 4. Cotizaciones: trabajo + cotización al cliente, juntos (una transacción cada una).
  let jobsCopied = 0;
  let jobsAlreadyThere = 0;
  for (const c of elegibles) {
    ensureSameUser();
    // C2: para una v2 se envía el registro con el `internal` preparado, nunca el original.
    const envio = c.envio!;
    let data: unknown;
    let error: unknown;
    if (c.clase === 'v2-con-lineas') {
      // I-2: `internal` sin líneas + las líneas aparte, en una transacción. Ya validado al clasificar.
      const p = toCloudPayload(envio.internal);
      if (!p.ok) throw new CloudError(`No se pudo preparar la cotización N° ${envio.issuedNumber ?? envio.number}. No se borró nada.`);
      ({ data, error } = await supabase.rpc('create_job_with_quote_v2', {
        ...jobWithQuotePayload({ ...envio, internal: p.internal as JobRecord['internal'] }, envio.id),
        p_cargo_items: p.cargoItems,
      }));
    } else {
      ({ data, error } = await supabase.rpc('create_job_with_quote', jobWithQuotePayload(envio, envio.id)));
    }
    if (error) throw new CloudError(`Se copiaron ${jobsCopied} cotizaciones y luego falló la conexión. Puedes reintentar: no se duplicarán. No se borró nada.`, error);
    if (data) jobsCopied += 1;
    else jobsAlreadyThere += 1;
  }

  // 5. Verificación contra la nube antes de marcar como migrado.
  const { data: cloudJobs, error: e1 } = await supabase.from('jobs').select('local_id').not('local_id', 'is', null);
  const { data: cloudVehicles, error: e2 } = await supabase.from('vehicles').select('local_id').not('local_id', 'is', null);
  if (e1 || e2) throw new CloudError('No se pudo comprobar la copia. Tus datos locales siguen intactos.');
  const jobIds = new Set((cloudJobs as Array<{ local_id: string }>).map((r) => r.local_id));
  const vehicleIds = new Set((cloudVehicles as Array<{ local_id: string }>).map((r) => r.local_id));
  // Solo se verifican las elegibles; las diferidas nunca cuentan como copiadas.
  const jobsOk = elegibles.map((c) => c.job.id).filter((id) => jobIds.has(id));
  const vehiclesOk = vehicles.map((v) => v.id).filter((id) => vehicleIds.has(id));
  const verified = jobsOk.length === elegibles.length && vehiclesOk.length === vehicles.length;

  ensureSameUser(); // no registrar avance si la sesión ya es otra
  const log = readLog(store);
  const previo = log[userId];
  // Registro acumulativo por identificador (paso 5): lo verificado ahora se SUMA a lo anterior.
  log[userId] = {
    at: new Date().toISOString(),
    jobs: union(previo?.jobs ?? [], jobsOk),
    vehicles: union(previo?.vehicles ?? [], vehiclesOk),
    deferred,
  };
  try {
    store.setItem(MIGRATION_KEY, JSON.stringify(log));
  } catch {
    // Sin almacenamiento: se volverá a ofrecer, pero no habrá duplicados (local_id).
  }
  return { jobsCopied, jobsAlreadyThere, vehiclesCopied, verified, deferred };
}
