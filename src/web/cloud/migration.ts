/**
 * Migración OPCIONAL del historial del navegador a la cuenta, cuando el usuario lo pide.
 * - Sin duplicados: cada registro viaja con su id local (`local_id`), único por dueño.
 *   Repetir la migración (otra pestaña, un corte de red) no crea copias.
 * - Verificación: después de copiar se consulta la nube; solo si TODO está, se marca como
 *   migrado para ese usuario.
 * - La copia local NUNCA se borra aquí: el modo sin cuenta sigue teniendo su historial.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuoteRepository } from '../storage';
import type { KeyValueStore, VehicleRepository } from '../vehicleRepository';
import { jobWithQuotePayload, vehicleToRow } from './mappers';
import { CloudError } from './vehicles';

export const MIGRATION_KEY = 'cotizador.migracion.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MigrationLog {
  [userId: string]: { at: string; jobs: string[]; vehicles: string[] };
}

function readLog(store: KeyValueStore): MigrationLog {
  try {
    return JSON.parse(store.getItem(MIGRATION_KEY) ?? '{}') as MigrationLog;
  } catch {
    return {};
  }
}

export interface PendingLocalData {
  jobs: number;
  vehicles: number;
}

/** Cuánto del historial local todavía no se copió a la cuenta de este usuario. */
export async function pendingLocalData(
  localQuotes: QuoteRepository,
  localVehicles: VehicleRepository,
  store: KeyValueStore,
  userId: string,
): Promise<PendingLocalData> {
  const done = readLog(store)[userId];
  const jobs = (await localQuotes.list()).filter((j) => UUID.test(j.id) && !done?.jobs.includes(j.id));
  const vehicles = (await localVehicles.list()).filter((v) => UUID.test(v.id) && !done?.vehicles.includes(v.id));
  return { jobs: jobs.length, vehicles: vehicles.length };
}

export interface MigrationResult {
  jobsCopied: number;
  jobsAlreadyThere: number;
  vehiclesCopied: number;
  verified: boolean;
}

export async function migrateLocalToCloud(args: {
  supabase: SupabaseClient;
  userId: string;
  localQuotes: QuoteRepository;
  localVehicles: VehicleRepository;
  store: KeyValueStore;
}): Promise<MigrationResult> {
  const { supabase, userId, localQuotes, localVehicles, store } = args;
  const jobs = (await localQuotes.list()).filter((j) => UUID.test(j.id));
  const vehicles = (await localVehicles.list()).filter((v) => UUID.test(v.id));
  const localDefault = await localVehicles.getDefaultId();

  // 1. Vehículos (sin duplicados por local_id).
  let vehiclesCopied = 0;
  if (vehicles.length) {
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
    const { data: current } = await supabase.from('vehicles').select('id').eq('is_default', true).maybeSingle();
    if (!current) {
      const { data: match } = await supabase.from('vehicles').select('id').eq('local_id', localDefault).maybeSingle();
      if (match) await supabase.rpc('set_default_vehicle', { p_vehicle_id: (match as { id: string }).id });
    }
  }

  // 3. Datos comerciales: solo si la cuenta no tiene.
  const localBusiness = await localQuotes.getBusiness();
  if (localBusiness.name || localBusiness.phone || localBusiness.email) {
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
  for (const job of jobs) {
    const { data, error } = await supabase.rpc('create_job_with_quote', jobWithQuotePayload(job, job.id));
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
  const verified = jobs.every((j) => jobIds.has(j.id)) && vehicles.every((v) => vehicleIds.has(v.id));

  if (verified) {
    const log = readLog(store);
    log[userId] = { at: new Date().toISOString(), jobs: jobs.map((j) => j.id), vehicles: vehicles.map((v) => v.id) };
    try {
      store.setItem(MIGRATION_KEY, JSON.stringify(log));
    } catch {
      // Sin almacenamiento: se volverá a ofrecer, pero no habrá duplicados (local_id).
    }
  }
  return { jobsCopied, jobsAlreadyThere, vehiclesCopied, verified };
}
