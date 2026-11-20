/**
 * Vehículos en Supabase (tabla `vehicles`, RLS por dueño). Misma interfaz que el
 * repositorio local, así que «Mi vehículo» y la calculadora no cambian.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VehicleInput, VehicleProfile } from '../../shared/vehicle';
import { validateVehicleInput, VehicleNotFoundError, type VehicleRepository } from '../vehicleRepository';
import { vehicleFromRow, vehicleToRow, type VehicleRow } from './mappers';

export class CloudError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CloudError';
    this.cause = cause;
  }
}

const SAVE_FAILED = 'No se pudo guardar en tu cuenta. Revisa tu conexión e inténtalo de nuevo.';
const LOAD_FAILED = 'No se pudieron cargar los datos de tu cuenta. Revisa tu conexión.';

export class CloudVehicleRepository implements VehicleRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
  ) {}

  private async rows(): Promise<VehicleRow[]> {
    const { data, error } = await this.supabase.from('vehicles').select('*').order('created_at', { ascending: true });
    if (error) throw new CloudError(LOAD_FAILED, error);
    return (data ?? []) as VehicleRow[];
  }

  async list(): Promise<VehicleProfile[]> {
    return (await this.rows()).map(vehicleFromRow);
  }

  async get(id: string): Promise<VehicleProfile | null> {
    const { data, error } = await this.supabase.from('vehicles').select('*').eq('id', id).maybeSingle();
    if (error) throw new CloudError(LOAD_FAILED, error);
    return data ? vehicleFromRow(data as VehicleRow) : null;
  }

  async create(input: VehicleInput): Promise<VehicleProfile> {
    const valid = validateVehicleInput(input);
    const existing = await this.rows();
    const { data, error } = await this.supabase
      .from('vehicles')
      .insert({ ...vehicleToRow(valid), owner_id: this.userId })
      .select('*')
      .single();
    if (error) throw new CloudError(SAVE_FAILED, error);
    const row = data as VehicleRow;
    // Igual que en el navegador: el primer vehículo queda como predeterminado.
    if (existing.length === 0) await this.setDefault(row.id);
    return vehicleFromRow(row);
  }

  async update(id: string, input: VehicleInput): Promise<VehicleProfile> {
    const valid = validateVehicleInput(input);
    const { data, error } = await this.supabase.from('vehicles').update(vehicleToRow(valid)).eq('id', id).select('*');
    if (error) throw new CloudError(SAVE_FAILED, error);
    if (!data || data.length === 0) throw new VehicleNotFoundError(id);
    return vehicleFromRow(data[0] as VehicleRow);
  }

  async remove(id: string): Promise<void> {
    const { data, error } = await this.supabase.from('vehicles').delete().eq('id', id).select('id');
    if (error) throw new CloudError(SAVE_FAILED, error);
    if (!data || data.length === 0) throw new VehicleNotFoundError(id);
  }

  async getDefaultId(): Promise<string | null> {
    const { data, error } = await this.supabase.from('vehicles').select('id').eq('is_default', true).maybeSingle();
    if (error) throw new CloudError(LOAD_FAILED, error);
    return (data as { id: string } | null)?.id ?? null;
  }

  async setDefault(id: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('set_default_vehicle', { p_vehicle_id: id });
    if (error) {
      if (error.code === 'P0002' && id) throw new VehicleNotFoundError(id);
      throw new CloudError(SAVE_FAILED, error);
    }
  }
}
