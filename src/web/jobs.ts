/**
 * Construcción del registro de una cotización (función pura, probable).
 * - Datos del emisor: se guarda una COPIA al emitir (auditoría ChatGPT, P2), para que un
 *   PDF antiguo no cambie si después se editan los datos comerciales.
 * - Retención por campo (A-38): km y minutos se guardan solo si `retainable` lo permite.
 */
import { capacityEstimate, cargoSummary, cargoTotalsIssue } from '../shared/cargo';
import type { BusinessProfile, JobInternalV1, JobRecord } from '../shared/clientQuote';
import { handlingTime } from '../shared/resources';
import { snapshotV2Schema, type SnapshotV2 } from '../shared/snapshot';
import { buildWaypoints } from '../shared/waypoints';
import { validateInventory, type InventoryDraft } from './modules/inventoryDraft';
import { validateResources, type ResourcesDraft } from './modules/resourcesDraft';
import type { QuoteSession } from './session';

/** El detalle de carga o de recursos tiene datos por corregir: no se emite (D-I3). */
export class CargoInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CargoInvalidError';
  }
}

/** ¿El borrador de recursos tiene algún dato? Sin datos, el snapshot guarda `resources: null`. */
function resourcesHaveData(r: ResourcesDraft): boolean {
  return (
    r.helpers.length > 0 ||
    r.equipment.length > 0 ||
    r.stops.some((x) => x.floor !== null || x.elevator !== null || x.stairs !== null || x.carryMeters !== null || x.access.trim() !== '' || x.loadMinutes !== null)
  );
}

/**
 * Snapshot v2 a partir del v1 actual (que NO cambia) + inventario y recursos (I-1, docs/22 §2.3).
 * - Totales RECALCULADOS desde las líneas en este instante y verificados con `cargoTotalsIssue`.
 * - Datos inválidos, o «Rápido» con una lista sin decidir: lanza `CargoInvalidError` (D-I3).
 * - Validado con `snapshotV2Schema`; sin conversiones de tipo forzadas.
 */
export function snapshotV2From(v1: JobInternalV1, cargoDraft: InventoryDraft, resourcesDraft: ResourcesDraft): SnapshotV2 {
  const inv = validateInventory(cargoDraft);
  if (!inv.inventory) {
    const primero = Object.values(inv.errors)[0] ?? 'hay datos por corregir';
    throw new CargoInvalidError(`Revisa el detalle de carga antes de guardar: ${primero}`);
  }
  const res = validateResources(resourcesDraft);
  if (!res.resources) {
    const primero = Object.values(res.errors)[0] ?? 'hay datos por corregir';
    throw new CargoInvalidError(`Revisa los accesos y recursos antes de guardar: ${primero}`);
  }
  const { items, mode, summary } = inv.inventory;
  const totals = cargoSummary({ items });
  const conCarga = items.length > 0 || summary !== '';
  const raw = {
    schemaVersion: 2,
    // Las fórmulas no cambian en I-1 (D-I1): la versión de fórmulas es la del motor.
    formulaVersion: v1.engineVersion,
    routeSource: v1.routeSource,
    km: v1.km,
    minutes: v1.minutes,
    costEstimate: v1.costEstimate,
    costType: v1.costType,
    suggestedPrice: v1.suggestedPrice,
    margin: v1.margin,
    missing: [...v1.missing],
    engineVersion: v1.engineVersion,
    vehicle: v1.vehicle ? { ...v1.vehicle, adjusted: [...v1.vehicle.adjusted] } : null,
    cargo: conCarga
      ? { mode, summary, totals, capacity: capacityEstimate(totals, null), handling: handlingTime(res.resources), items }
      : null,
    resources: resourcesHaveData(resourcesDraft) ? res.resources : null,
  };
  const parsed = snapshotV2Schema.safeParse(raw);
  if (!parsed.success) {
    throw new CargoInvalidError(`No se pudo preparar el detalle de carga: ${parsed.error.issues[0]?.message ?? 'formato inválido'}`);
  }
  if (parsed.data.cargo) {
    const problema = cargoTotalsIssue(parsed.data.cargo.items ?? [], parsed.data.cargo.totals);
    if (problema) throw new CargoInvalidError(`El resumen de la carga no coincide con la lista: ${problema}`);
  }
  return parsed.data;
}

export const ENGINE_VERSION = 'motor-1.0.1';

export interface QuoteFormData {
  clientName: string;
  serviceDescription: string;
  includes: string;
  conditions: string;
  serviceDate: string;
  validUntil: string;
  originLabel: string;
  destinationLabel: string;
}

/**
 * Registro de la cotización. Versión 1 (por defecto): el mismo objeto que hasta hoy, campo por
 * campo. Versión 2: solo la pide `saveQuote` con la flag encendida y el repositorio LOCAL
 * (docs/22 §2.1); lanza `CargoInvalidError` si el detalle tiene datos por corregir.
 */
export function buildJobRecord(
  session: QuoteSession,
  form: QuoteFormData,
  issuer: BusinessProfile,
  meta: { id: string; number: number; createdAt: string },
  opts: { version?: 1 | 2 } = {},
): JobRecord | null {
  const s = session.getSnapshot();
  const computation = session.computation('habitual');
  // Quinta auditoría (P2): la confirmación del precio también se exige en el último paso.
  if (!computation || s.chosenPrice === null || session.priceNeedsConfirmation()) return null;
  const keep = session.retainable('habitual');
  const m = computation.measures;
  const record: JobRecord & { internal: JobInternalV1 } = {
    id: meta.id,
    number: meta.number,
    createdAt: meta.createdAt,
    ...form,
    clientName: form.clientName.trim() || 'Cliente',
    netPrice: s.chosenPrice,
    tax: null, // IVA pendiente de reglas verificadas (#16)
    status: 'borrador',
    payment: 'pendiente',
    issuer: { ...issuer },
    waypoints: buildWaypoints(s.inputs).map((w) => ({ role: w.role, address: w.address })),
    internal: {
      routeSource: computation.source,
      km: keep.km ? computation.km : null,
      minutes: keep.minutes ? computation.minutes : null,
      costEstimate: m.cost.value,
      costType: m.cost.type,
      suggestedPrice: m.suggested.value,
      margin: s.margin,
      missing: m.missing,
      engineVersion: ENGINE_VERSION,
      vehicle: s.vehicle
        ? {
            id: s.vehicle.id,
            name: s.vehicle.name,
            type: s.vehicle.type,
            fuel: s.vehicle.fuel,
            // Valores efectivamente usados en esta cotización.
            kmPerL: s.params.kmPerL,
            wearPerKm: s.params.wearPerKm,
            adjusted: session.vehicleAdjustments(),
          }
        : null,
    },
  };
  if ((opts.version ?? 1) === 1) return record;
  return { ...record, internal: snapshotV2From(record.internal, s.cargo, s.resources) };
}
