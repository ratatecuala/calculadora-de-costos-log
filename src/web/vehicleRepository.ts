/**
 * Almacenamiento de vehículos. La interfaz es ASÍNCRONA a propósito: hoy se guarda en el
 * navegador (localStorage) y, cuando se apruebe #35, se reemplaza por una implementación
 * con Supabase (tabla `vehicles`, docs/02 §8.4) sin cambiar a quienes la usan.
 * No se conecta Supabase ni se crean cuentas en esta fase.
 */
import { vehicleInputSchema, type VehicleInput, type VehicleProfile } from '../shared/vehicle';

export interface VehicleRepository {
  list(): Promise<VehicleProfile[]>;
  get(id: string): Promise<VehicleProfile | null>;
  create(input: VehicleInput): Promise<VehicleProfile>;
  update(id: string, input: VehicleInput): Promise<VehicleProfile>;
  remove(id: string): Promise<void>;
  getDefaultId(): Promise<string | null>;
  setDefault(id: string | null): Promise<void>;
}

export class VehicleValidationError extends Error {
  constructor(readonly issues: Record<string, string>) {
    super(Object.values(issues).join(' · '));
    this.name = 'VehicleValidationError';
  }
}

export class VehicleNotFoundError extends Error {
  constructor(id: string) {
    super(`Vehículo no encontrado: ${id}`);
    this.name = 'VehicleNotFoundError';
  }
}

/** Almacén clave-valor mínimo (localStorage en el navegador, memoria en pruebas). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class MemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

interface StoredData {
  version: 1;
  vehicles: VehicleProfile[];
  defaultId: string | null;
}

export const VEHICLES_KEY = 'cotizador.vehiculos.v1';

export function validateVehicleInput(input: unknown): VehicleInput {
  const parsed = vehicleInputSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issues: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? 'general');
    issues[field] ??= issue.message;
  }
  throw new VehicleValidationError(issues);
}

export class LocalVehicleRepository implements VehicleRepository {
  constructor(
    private readonly store: KeyValueStore,
    private readonly deps: { newId: () => string; now: () => Date } = {
      newId: () => crypto.randomUUID(),
      now: () => new Date(),
    },
  ) {}

  private read(): StoredData {
    try {
      const raw = this.store.getItem(VEHICLES_KEY);
      if (!raw) return { version: 1, vehicles: [], defaultId: null };
      const data = JSON.parse(raw) as Partial<StoredData>;
      const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
      const defaultId = vehicles.some((v) => v.id === data.defaultId) ? (data.defaultId ?? null) : null;
      return { version: 1, vehicles, defaultId };
    } catch {
      // Datos dañados: se empieza vacío en vez de romper la app.
      return { version: 1, vehicles: [], defaultId: null };
    }
  }

  private write(data: StoredData): void {
    try {
      this.store.setItem(VEHICLES_KEY, JSON.stringify(data));
    } catch {
      throw new Error('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado).');
    }
  }

  async list(): Promise<VehicleProfile[]> {
    return this.read().vehicles.map((v) => ({ ...v }));
  }

  async get(id: string): Promise<VehicleProfile | null> {
    const v = this.read().vehicles.find((x) => x.id === id);
    return v ? { ...v } : null;
  }

  async create(input: VehicleInput): Promise<VehicleProfile> {
    const valid = validateVehicleInput(input);
    const data = this.read();
    const now = this.deps.now().toISOString();
    const vehicle: VehicleProfile = { id: this.deps.newId(), ...valid, createdAt: now, updatedAt: now };
    data.vehicles.push(vehicle);
    // El primer vehículo queda como predeterminado para ahorrar un paso.
    if (data.vehicles.length === 1) data.defaultId = vehicle.id;
    this.write(data);
    return { ...vehicle };
  }

  async update(id: string, input: VehicleInput): Promise<VehicleProfile> {
    const valid = validateVehicleInput(input);
    const data = this.read();
    const index = data.vehicles.findIndex((v) => v.id === id);
    if (index < 0) throw new VehicleNotFoundError(id);
    const updated: VehicleProfile = { ...data.vehicles[index]!, ...valid, updatedAt: this.deps.now().toISOString() };
    data.vehicles[index] = updated;
    this.write(data);
    return { ...updated };
  }

  async remove(id: string): Promise<void> {
    const data = this.read();
    if (!data.vehicles.some((v) => v.id === id)) throw new VehicleNotFoundError(id);
    data.vehicles = data.vehicles.filter((v) => v.id !== id);
    if (data.defaultId === id) data.defaultId = null;
    this.write(data);
  }

  async getDefaultId(): Promise<string | null> {
    return this.read().defaultId;
  }

  async setDefault(id: string | null): Promise<void> {
    const data = this.read();
    if (id !== null && !data.vehicles.some((v) => v.id === id)) throw new VehicleNotFoundError(id);
    data.defaultId = id;
    this.write(data);
  }
}

/** Repositorio del navegador. Si localStorage no está disponible, usa memoria (sin persistencia). */
export function browserVehicleRepository(): VehicleRepository {
  let store: KeyValueStore;
  try {
    const probe = '__prueba__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    store = localStorage;
  } catch {
    store = new MemoryKeyValueStore();
  }
  return new LocalVehicleRepository(store);
}
