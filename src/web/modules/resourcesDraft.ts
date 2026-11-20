/**
 * Estado del editor de recursos (#51, A-66): funciones puras, sin React.
 * Paradas fijas A (origen) y B (destino) (T-3). Cada ayudante tiene UNA modalidad (A-58);
 * cambiarla no deja montos residuales (`switchHelperMode`).
 */
import {
  MAX_EQUIPMENT,
  MAX_HELPERS,
  resourcesSchema,
  switchHelperMode,
  type Helper,
  type HelperSegment,
  type Resources,
  type ResourcesLike,
  type StopRole,
} from '../../shared/resources';

export interface DraftStop {
  role: StopRole;
  floor: number | null;
  elevator: 'si' | 'no' | 'noCabe' | null;
  stairs: boolean | null;
  carryMeters: number | null;
  access: string;
  loadMinutes: number | null;
}

export interface DraftEquipment {
  key: string;
  label: string;
  amount: number | null;
}

export interface ResourcesDraft {
  stops: [DraftStop, DraftStop];
  helpers: Helper[];
  equipment: DraftEquipment[];
}

const emptyStop = (role: StopRole): DraftStop => ({
  role,
  floor: null,
  elevator: null,
  stairs: null,
  carryMeters: null,
  access: '',
  loadMinutes: null,
});

export const emptyResourcesDraft = (): ResourcesDraft => ({ stops: [emptyStop('A'), emptyStop('B')], helpers: [], equipment: [] });

export function updateStop(draft: ResourcesDraft, role: StopRole, patch: Partial<Omit<DraftStop, 'role'>>): ResourcesDraft {
  const stops = draft.stops.map((s) => (s.role === role ? { ...s, ...patch } : s)) as [DraftStop, DraftStop];
  return { ...draft, stops };
}

export const canAddHelper = (d: ResourcesDraft) => d.helpers.length < MAX_HELPERS;
export const canAddEquipment = (d: ResourcesDraft) => d.equipment.length < MAX_EQUIPMENT;

/** Un ayudante nuevo empieza «por servicio» y SIN monto (faltante, no 0). */
export function addHelper(draft: ResourcesDraft, id: string): ResourcesDraft {
  if (!canAddHelper(draft)) return draft;
  return { ...draft, helpers: [...draft.helpers, { id, mode: 'servicio', feeService: null }] };
}

export function removeHelper(draft: ResourcesDraft, id: string): ResourcesDraft {
  return { ...draft, helpers: draft.helpers.filter((h) => h.id !== id) };
}

export function setHelperMode(draft: ResourcesDraft, id: string, mode: Helper['mode']): ResourcesDraft {
  return { ...draft, helpers: draft.helpers.map((h) => (h.id === id ? switchHelperMode(h, mode) : h)) };
}

type ServicioPatch = { feeService?: number | null };
type HoraPatch = { ratePerHour?: number | null; hours?: number | null };

/** Cambia solo campos de la modalidad vigente del ayudante; los de la otra se ignoran. */
export function updateHelper(draft: ResourcesDraft, id: string, patch: ServicioPatch & HoraPatch): ResourcesDraft {
  return {
    ...draft,
    helpers: draft.helpers.map((h) => {
      if (h.id !== id) return h;
      if (h.mode === 'servicio') return 'feeService' in patch ? { ...h, feeService: patch.feeService ?? null } : h;
      const next = { ...h };
      if ('ratePerHour' in patch) next.ratePerHour = patch.ratePerHour ?? null;
      if ('hours' in patch) next.hours = patch.hours ?? null;
      return next;
    }),
  };
}

export function toggleSegment(draft: ResourcesDraft, id: string, segment: HelperSegment): ResourcesDraft {
  return {
    ...draft,
    helpers: draft.helpers.map((h) => {
      if (h.id !== id || h.mode !== 'hora') return h;
      const has = h.paidSegments.includes(segment);
      return { ...h, paidSegments: has ? h.paidSegments.filter((s) => s !== segment) : [...h.paidSegments, segment] };
    }),
  };
}

export function addEquipment(draft: ResourcesDraft, key: string): ResourcesDraft {
  if (!canAddEquipment(draft)) return draft;
  return { ...draft, equipment: [...draft.equipment, { key, label: '', amount: null }] };
}

export function updateEquipment(draft: ResourcesDraft, key: string, patch: Partial<Omit<DraftEquipment, 'key'>>): ResourcesDraft {
  return { ...draft, equipment: draft.equipment.map((e) => (e.key === key ? { ...e, ...patch } : e)) };
}

export function removeEquipment(draft: ResourcesDraft, key: string): ResourcesDraft {
  return { ...draft, equipment: draft.equipment.filter((e) => e.key !== key) };
}

/** Vista del borrador que aceptan las funciones puras (`handlingTime`, `helperCostLines`, …). */
export function asResourcesLike(draft: ResourcesDraft): ResourcesLike {
  return { stops: draft.stops, helpers: draft.helpers, equipment: draft.equipment.map(({ label, amount }) => ({ label, amount })) };
}

export interface ResourcesValidation {
  resources: Resources | null;
  /** Errores por `A.floor`, `B.loadMinutes`, `<idAyudante>.hours`, `<claveEquipo>.label`, … */
  errors: Record<string, string>;
}

export function validateResources(draft: ResourcesDraft): ResourcesValidation {
  const input = {
    stops: draft.stops,
    helpers: draft.helpers,
    equipment: draft.equipment.map(({ label, amount }) => ({ label, amount })),
  };
  const parsed = resourcesSchema.safeParse(input);
  if (parsed.success) return { resources: parsed.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const [group, index, field] = issue.path;
    let key = String(group ?? 'recursos');
    if (typeof index === 'number') {
      if (group === 'stops') key = `${draft.stops[index]?.role ?? index}.${String(field ?? '')}`;
      if (group === 'helpers') key = `${draft.helpers[index]?.id ?? index}.${String(field ?? '')}`;
      if (group === 'equipment') key = `${draft.equipment[index]?.key ?? index}.${String(field ?? '')}`;
    }
    errors[key] ??= issue.message;
  }
  return { resources: null, errors };
}
