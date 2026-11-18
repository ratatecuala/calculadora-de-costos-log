/**
 * Lista de vehículos visible, ligada a UNA identidad (navegador o una cuenta).
 * Quinta auditoría (P1): al cambiar de identidad, la lista anterior se borra al instante y
 * cualquier carga iniciada por la identidad anterior se descarta aunque llegue después.
 * Una carga fallida deja la lista VACÍA (nunca muestra datos de otra identidad).
 */
import type { VehicleProfile } from '../shared/vehicle';
import type { VehicleRepository } from './vehicleRepository';

export interface VehicleListState {
  owner: string;
  vehicles: VehicleProfile[];
  defaultId: string | null;
  failure: string | null;
  loading: boolean;
}

export interface VehicleListResult {
  owner: string;
  vehicles: VehicleProfile[];
  defaultId: string | null;
}

const empty = (owner: string): VehicleListState => ({ owner, vehicles: [], defaultId: null, failure: null, loading: false });

export class VehicleListLoader {
  private state: VehicleListState = empty('local');
  private repository: VehicleRepository | null = null;
  private generation = 0;
  private readonly listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): VehicleListState => this.state;

  private set(next: VehicleListState): void {
    this.state = next;
    for (const fn of this.listeners) fn();
  }

  /** Cambia de identidad: vacía la lista de inmediato, invalida cargas pendientes y carga la nueva. */
  switchTo(owner: string, repository: VehicleRepository): Promise<VehicleListResult | null> {
    this.repository = repository;
    if (owner !== this.state.owner) {
      this.generation += 1;
      this.set(empty(owner));
    }
    return this.refresh();
  }

  /** Recarga la identidad vigente. Devuelve null si la respuesta quedó obsoleta o falló. */
  async refresh(): Promise<VehicleListResult | null> {
    const repository = this.repository;
    if (!repository) return null;
    const generation = ++this.generation;
    const owner = this.state.owner;
    this.set({ ...this.state, loading: true });
    try {
      const [vehicles, defaultId] = await Promise.all([repository.list(), repository.getDefaultId()]);
      if (generation !== this.generation) return null; // otra identidad u otra carga más nueva
      this.set({ owner, vehicles, defaultId, failure: null, loading: false });
      return { owner, vehicles, defaultId };
    } catch (e) {
      if (generation !== this.generation) return null;
      this.set({ ...empty(owner), failure: e instanceof Error ? e.message : 'No se pudieron cargar tus vehículos.' });
      return null;
    }
  }
}

/**
 * ¿Hay que reiniciar el borrador de la cotización al cambiar de identidad?
 * Sí al cerrar sesión o al pasar de una cuenta a otra (otra persona podría estar usando el
 * equipo). No al pasar de anónimo a una cuenta: es quien estaba cotizando en este navegador.
 */
export function shouldResetDraft(previous: string | null | undefined, next: string | null): boolean {
  if (previous === undefined || previous === next) return false;
  return previous !== null;
}

/** Identidad como texto: «local» (sin cuenta) o el id del usuario. */
export function ownerOf(userId: string | null): string {
  return userId ?? 'local';
}

/**
 * Sexta auditoría (P2): lo que se puede mostrar EN ESTE RENDER. Si el estado aún pertenece a
 * otra identidad (el efecto que lo limpia corre después de pintar), se muestra vacío.
 */
export function visibleVehicleState(state: VehicleListState, currentOwner: string): VehicleListState {
  return state.owner === currentOwner ? state : empty(currentOwner);
}

/**
 * ¿Puede mostrarse el borrador a la identidad actual en este render? Sí si es suyo, o si se
 * pasa de anónimo a una cuenta (se conserva). No si viene de otra cuenta.
 */
export function draftVisibleTo(draftOwner: string, currentOwner: string): boolean {
  if (draftOwner === currentOwner) return true;
  const previous = draftOwner === 'local' ? null : draftOwner;
  const next = currentOwner === 'local' ? null : currentOwner;
  return !shouldResetDraft(previous, next);
}
