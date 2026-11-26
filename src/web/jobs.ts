/**
 * Construcción del registro de una cotización (función pura, probable).
 * - Datos del emisor: se guarda una COPIA al emitir (auditoría ChatGPT, P2), para que un
 *   PDF antiguo no cambie si después se editan los datos comerciales.
 * - Retención por campo (A-38): km y minutos se guardan solo si `retainable` lo permite.
 */
import { EMPTY_PARAMS } from '../engine/inputs';
import { capacityEstimate, cargoSummary, cargoTotalsIssue } from '../shared/cargo';
import type { BusinessProfile, JobInternalV1, JobRecord } from '../shared/clientQuote';
import { procedencia, type Procedencia } from '../shared/procedencia';
import { handlingTime } from '../shared/resources';
import type { RouteSource } from '../shared/route';
import {
  PARAMETROS_ECONOMICOS,
  snapshotV2Schema,
  snapshotV3Schema,
  UNIDADES_PARAMETRO,
  type Economia,
  type ParametroEconomico,
  type SnapshotV2,
  type SnapshotV3,
} from '../shared/snapshot';
import { buildWaypoints } from '../shared/waypoints';
import { validateInventory, type InventoryDraft } from './modules/inventoryDraft';
import { validateResources, type ResourcesDraft } from './modules/resourcesDraft';
import { initialState, type QuoteSession, type RouteComputation, type SessionState } from './session';

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

/** El snapshot v3 no se pudo preparar: no se emite (nunca se guarda una cotización sin su procedencia). */
export class SnapshotV3Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotV3Error';
  }
}

/**
 * Procedencia de un parámetro económico tal como quedó al emitir (A-88). No inventa datos:
 * - vacío → `faltante`;
 * - viene de «Cargar ejemplo ficticio» y no se editó → `simulado`;
 * - rendimiento o desgaste iguales a los del vehículo aplicado → `declarado` en «Mi vehículo»;
 * - igual al valor con que parte el formulario y nunca declarado → `declarado`, valor inicial aceptado;
 * - lo demás → `declarado` por el usuario, con la fecha de emisión.
 * Nada de la app produce hoy `medido`, `comprobado` ni `estimado` para estos campos: quedan para las
 * referencias y el instrumento 0B, cuando se autoricen.
 */
export function procedenciaParametro(k: ParametroEconomico, s: SessionState, fecha: string): Procedencia {
  const v = s.params[k];
  if (v === null) return procedencia('faltante', 'usuario', 'no ingresado');
  if (s.exampleParams.includes(k)) return procedencia('simulado', 'ejemplo', 'ejemplo ficticio de la app');
  if ((k === 'kmPerL' || k === 'wearPerKm') && s.vehicle !== null && s.vehicle[k] === v) {
    return procedencia('declarado', 'vehiculo', 'perfil «Mi vehículo»');
  }
  const declaradoCero = (s.declaredZeros as string[]).includes(k);
  if (v === EMPTY_PARAMS[k] && !declaradoCero) return procedencia('declarado', 'valorInicial', 'valor inicial del formulario', fecha);
  return procedencia('declarado', 'usuario', null, fecha);
}

/** Procedencia de los km o los minutos según la fuente de cada tramo. Un tramo simulado basta para `simulado`. */
export function procedenciaRecorrido(fuentes: RouteSource[], fecha: string): Procedencia {
  if (fuentes.length > 0 && fuentes.every((f) => f === 'declarado')) return procedencia('declarado', 'ruta', 'recorrido ingresado a mano', fecha);
  if (fuentes.includes('simulado')) return procedencia('simulado', 'ruta', 'ruta simulada', fecha);
  return procedencia('estimado', 'ruta', 'proveedor de rutas', fecha);
}

/**
 * Bloque `economia` del snapshot v3: los parámetros EFECTIVAMENTE usados en el cálculo emitido, su
 * procedencia, las partidas y las versiones (A-88). Lee la sesión; no recalcula ni cambia fórmulas.
 */
export function economiaFrom(
  s: SessionState,
  computation: RouteComputation,
  keep: { km: boolean; minutes: boolean },
  fecha: string,
): Economia {
  const parametros = Object.fromEntries(
    PARAMETROS_ECONOMICOS.map((k) => [k, { valor: s.params[k], unidad: UNIDADES_PARAMETRO[k], procedencia: procedenciaParametro(k, s, fecha) }]),
  ) as Economia['parametros'];
  const inicial = initialState();
  const sencillo = (valor: number, esInicial: boolean, unidad: string) => ({
    valor,
    unidad,
    procedencia: esInicial ? procedencia('declarado', 'valorInicial', 'valor inicial del formulario', fecha) : procedencia('declarado', 'usuario', null, fecha),
  });
  return {
    registradoEl: fecha,
    parametros,
    recorrido: {
      km: procedenciaRecorrido(computation.legs.map((l) => l.kmSource), fecha),
      minutos: procedenciaRecorrido(computation.legs.map((l) => l.minutesSource), fecha),
    },
    margen: sencillo(s.margin, s.margin === inicial.margin, 'fraccion'),
    recargos: sencillo(s.surcharges, s.surcharges === inicial.surcharges, 'CLP'),
    // A-38: si los km o minutos no se retienen, tampoco las partidas que permitirían reconstruirlos.
    partidas: keep.km && keep.minutes ? computation.items.map((i) => ({ id: String(i.id), categoria: i.category, monto: i.amount })) : null,
    versiones: { motor: ENGINE_VERSION, formulas: ENGINE_VERSION, datos: { combustible: null, catalogo: null, peajes: null } },
  };
}

/** Snapshot v3 a partir del v1 (que no cambia) más `economia`. Validado; si no cumple, no se emite. */
export function snapshotV3From(v1: JobInternalV1, economia: Economia): SnapshotV3 {
  const raw = {
    schemaVersion: 3,
    // Las fórmulas no cambian en A-88: la versión de fórmulas es la del motor.
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
    economia,
  };
  const parsed = snapshotV3Schema.safeParse(raw);
  if (!parsed.success) {
    throw new SnapshotV3Error(`No se pudo preparar el registro interno de la cotización: ${parsed.error.issues[0]?.message ?? 'formato inválido'}`);
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
 * Registro de la cotización. Versión 1 (por defecto de la función): el mismo objeto de siempre, campo
 * por campo; la app ya no la emite (A-88), pero se conserva para leer y probar la compatibilidad.
 * Versión 3 (A-88): la que emite la app sin detalle de carga; agrega `economia`; lanza `SnapshotV3Error`
 * si no se puede validar. Versión 2: con el detalle de carga activo (docs/22 §2.1); lanza
 * `CargoInvalidError` si el detalle tiene datos por corregir.
 */
export function buildJobRecord(
  session: QuoteSession,
  form: QuoteFormData,
  issuer: BusinessProfile,
  meta: { id: string; number: number; createdAt: string },
  opts: { version?: 1 | 2 | 3 } = {},
): JobRecord | null {
  const s = session.getSnapshot();
  const computation = session.computation('habitual');
  // Quinta auditoría (P2): la confirmación del precio también se exige en el último paso.
  if (!computation || s.chosenPrice === null || session.priceNeedsConfirmation()) return null;
  // A-71: nunca se emite con un valor numérico fuera de rango (tampoco desde el último paso).
  // A-73: los errores de la comparación opcional sin peajes no bloquean la cotización principal.
  if (session.quoteBlockers().length > 0) return null;
  // A-81 (H1), defensa en profundidad en el borde del documento: una cotización NUEVA nunca lleva un
  // precio con decimales, aunque la validación del campo fallara. No se redondea: no se emite.
  if (!Number.isInteger(s.chosenPrice)) return null;
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
  const version = opts.version ?? 1;
  if (version === 1) return record;
  if (version === 3) return { ...record, internal: snapshotV3From(record.internal, economiaFrom(s, computation, keep, meta.createdAt.slice(0, 10))) };
  return { ...record, internal: snapshotV2From(record.internal, s.cargo, s.resources) };
}
