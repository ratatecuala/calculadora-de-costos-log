/**
 * Construcción del registro de una cotización (función pura, probable).
 * - Datos del emisor: se guarda una COPIA al emitir (auditoría ChatGPT, P2), para que un
 *   PDF antiguo no cambie si después se editan los datos comerciales.
 * - Retención por campo (A-38): km y minutos se guardan solo si `retainable` lo permite.
 */
import type { BusinessProfile, JobRecord } from '../shared/clientQuote';
import { buildWaypoints } from '../shared/waypoints';
import type { QuoteSession } from './session';

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

export function buildJobRecord(
  session: QuoteSession,
  form: QuoteFormData,
  issuer: BusinessProfile,
  meta: { id: string; number: number; createdAt: string },
): JobRecord | null {
  const s = session.getSnapshot();
  const computation = session.computation('habitual');
  // Quinta auditoría (P2): la confirmación del precio también se exige en el último paso.
  if (!computation || s.chosenPrice === null || session.priceNeedsConfirmation()) return null;
  const keep = session.retainable('habitual');
  const m = computation.measures;
  return {
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
}
