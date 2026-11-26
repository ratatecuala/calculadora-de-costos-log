/**
 * Sesión de cálculo (sin React, probable con Vitest).
 *
 * Reglas de consumo (A-42):
 * - Solo `calculateRoute()` y `compareWithoutTolls()` llaman al servidor, y solo si el
 *   recorrido cambió. Escribir direcciones NO consulta: marca el resultado como desactualizado.
 * - Cambiar combustible, ayudantes, margen, precio u otros parámetros recalcula en el
 *   navegador con el motor económico, sin nuevas solicitudes de ruta.
 * - Si el servidor responde «manual» (cupo agotado, contador caído, servicio apagado…),
 *   se activa el modo manual: km y minutos por tramo, declarados por el usuario.
 *
 * Coherencia (auditoría ChatGPT, PR #34):
 * - Solo se calcula y cotiza con una ruta cuya clave coincide con las direcciones ACTUALES.
 * - Cada consulta lleva un número de generación; una respuesta tardía de un recorrido
 *   anterior se descarta y nunca reemplaza al vigente.
 * - La procedencia y la retención se llevan POR CAMPO (km y minutos por separado).
 */
import { compareRoutes, type Comparison } from '../engine/compare';
import { buildCostItems, EMPTY_PARAMS, type TripParams } from '../engine/inputs';
import { computeMeasures } from '../engine/measures';
import type { CostItem, Measures } from '../engine/types';
import {
  MANUAL_MESSAGES,
  type ManualReason,
  type PointRole,
  type QuotaInfo,
  type RouteApiResponse,
  type RouteKind,
  type RouteRequestInput,
  type RouteResult,
  type RouteSource,
} from '../shared/route';
import type { AppliedVehicle, VehicleProfile } from '../shared/vehicle';
import { fechaLocal, fechaLocalDeIso } from '../shared/procedencia';
import { emptyInventoryDraft, type InventoryDraft } from './modules/inventoryDraft';
import { emptyResourcesDraft, type ResourcesDraft } from './modules/resourcesDraft';
import { buildWaypoints, routeKey } from '../shared/waypoints';
import { invalidAmountText } from './format';
import { blocksComputation, blocksQuote, MAX_LEG_KM, MAX_LEG_MINUTES, numericIssues, TEXT_ISSUE_KEY, type NumericIssues } from './numericLimits';

export interface RouteClient {
  requestRoute(input: RouteRequestInput): Promise<RouteApiResponse>;
}

export interface AddressInputs {
  origin: string;
  destination: string;
  base: string;
  startAtBase: boolean;
  returnToBase: boolean;
}

export interface LegValue {
  from: PointRole;
  to: PointRole;
  km: number | null;
  minutes: number | null;
}

export type RouteStatus = 'vacio' | 'cargando' | 'listo' | 'manual' | 'desactualizado';

export interface RouteState {
  status: RouteStatus;
  key: string | null;
  route: RouteResult | null;
  manualReason: ManualReason | null;
  message: string | null;
  /** Correcciones del usuario por tramo (procedencia «declarado»). */
  overrides: Array<Partial<Pick<LegValue, 'km' | 'minutes'>>>;
  /** Tramos ingresados a mano en modo manual. */
  manualLegs: LegValue[];
  /**
   * D-I8 (A-69): los tramos manuales vienen de un borrador recuperado. Si las direcciones cambian,
   * se descartan (no vuelven aunque se regrese a las mismas direcciones): hay que revisarlos de nuevo.
   */
  recovered?: true;
}

/**
 * Topes TÉCNICOS por tramo para un recorrido manual RECUPERADO (P2 de la auditoría de D-I8, A-70):
 * evitan que un borrador dañado o manipulado reconstruya valores que desborden el cálculo. Son
 * holgados (más que cualquier viaje real) y no son un límite comercial ni cambian el motor.
 */
export const MAX_MANUAL_LEG_KM = MAX_LEG_KM;
export const MAX_MANUAL_LEG_MINUTES = MAX_LEG_MINUTES;

/** Un km o minuto recuperado es válido si falta (null) o es finito, ≥ 0 y no supera el tope. */
export function manualLegValueValid(v: number | null, max: number): boolean {
  return v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max);
}

/** Aviso al recuperar un recorrido manual (D-I8, A-69). */
export const RECOVERED_ROUTE_MESSAGE = 'Recorrido recuperado: revisa los kilómetros y minutos';

/**
 * Recorrido manual del borrador (D-I8, A-69): SOLO los km y minutos que escribió el usuario en modo
 * manual, con la clave de las direcciones y los tramos con que se escribieron. Nunca datos del
 * proveedor (ruta, retención, cuota, correcciones sobre una ruta automática) ni el precio.
 */
export interface ManualRouteDraft {
  key: string;
  legs: LegValue[];
}

// Estos dos costos parten en cero. El ejemplo solo debe proteger ese cero si alguien lo declaró.
export const ZERO_DEFAULT_COSTS = ['helpers', 'loadMinutes'] as const;
type ZeroDefaultCost = (typeof ZERO_DEFAULT_COSTS)[number];
type CostEdits = Omit<Partial<TripParams>, ZeroDefaultCost> & Partial<Record<ZeroDefaultCost, number | null>>;

/** Parámetros económicos del viaje, en orden estable (para la procedencia del snapshot v3, A-88). */
export const PARAM_KEYS = Object.keys(EMPTY_PARAMS) as Array<keyof TripParams>;
/** Origen de un cambio de parámetros. `ejemplo` = «Cargar ejemplo ficticio» (dato simulado, A-88). */
export type ParamOrigin = 'usuario' | 'ejemplo';

/** Campos económicos cuyo origen se registra (A-88): los parámetros del motor, el margen y los recargos. */
export type CampoEconomico = keyof TripParams | 'margin' | 'surcharges';
export const CAMPOS_ECONOMICOS = [...PARAM_KEYS, 'margin', 'surcharges'] as CampoEconomico[];

/**
 * Evento que fijó el valor vigente de un campo (A-88, revisión GPT de afbe740): se registra en el momento
 * en que ocurre, no se deduce al emitir. `fecha` es la fecha local del evento (para `vehiculo`, la fecha
 * de la última edición del perfil; `null` si no se conoce). Sin registro = valor con que parte el formulario.
 */
export interface OrigenDato {
  tipo: 'usuario' | 'ejemplo' | 'vehiculo';
  fecha: string | null;
}
export type OrigenesDatos = Partial<Record<CampoEconomico, OrigenDato>>;

export interface SessionState {
  inputs: AddressInputs;
  habitual: RouteState;
  comparison: RouteState;
  params: TripParams;
  declaredZeros: ZeroDefaultCost[];
  /**
   * A-88: origen del valor vigente de cada campo económico (usuario, ejemplo ficticio o «Mi vehículo»),
   * con su fecha. Alimenta la procedencia del snapshot v3. No cambia ningún cálculo.
   */
  origins: OrigenesDatos;
  tollsComparison: number | null;
  /** Margen adicional como fracción (0,15 = 15 %). */
  margin: number;
  surcharges: number;
  chosenPrice: number | null;
  quota: QuotaInfo | null;
  /** Solicitudes de ruta enviadas en esta sesión (transparencia y pruebas). */
  routeRequests: number;
  /**
   * Vehículo aplicado a esta cotización: COPIA de sus valores al momento de elegirlo.
   * Editar `params` después no modifica el perfil guardado.
   */
  vehicle: AppliedVehicle | null;
  /**
   * Base sobre la que el usuario eligió su precio (recorrido + costo). Si el costo cambia
   * después (otra ruta, otro vehículo, otros parámetros), el precio debe reconfirmarse.
   */
  priceBasis: string | null;
  /**
   * Inventario y recursos del borrador (I-1, A-68). **No entran al costo**: `computation` no los
   * lee (D-I1). Solo se guardan en el snapshot v2 al emitir en el navegador.
   */
  cargo: InventoryDraft;
  resources: ResourcesDraft;
  /**
   * A-73: textos escritos que no son números, por campo (misma clave que `numericIssues`). No cambian
   * el valor del campo: lo dejan inválido, pausan el cálculo y bloquean la emisión hasta corregirlos.
   */
  textIssues: Record<string, string>;
}

/**
 * Datos del borrador que se pueden guardar y recuperar (I-1b): solo lo que escribió el usuario.
 * La ruta del proveedor NO se guarda (retención A-38): se vuelve a calcular. El precio tampoco:
 * se confirma de nuevo con el costo vigente.
 */
export interface DraftData {
  inputs: AddressInputs;
  params: TripParams;
  declaredZeros?: ZeroDefaultCost[];
  /** A-88: ver `SessionState.origins`. Un borrador anterior no lo trae: se recupera sin orígenes. */
  origins?: OrigenesDatos;
  margin: number;
  surcharges: number;
  vehicle: AppliedVehicle | null;
  cargo: InventoryDraft;
  resources: ResourcesDraft;
  /** D-I8 (A-69): recorrido manual vigente con al menos un valor escrito; si no, `null`. */
  manualRoute?: ManualRouteDraft | null;
  /** A-73: textos inválidos escritos (se recuperan literalmente, nunca como vacío o cero). */
  invalidTexts?: Record<string, string>;
}

/** Motivos de modo manual que NO se reintentan al volver a presionar «Calcular ruta». */
const NON_RETRYABLE_MANUAL: ReadonlySet<ManualReason> = new Set(['cupo_agotado', 'limite_usuario', 'limite_comparaciones']);

/** Campos que el vehículo carga en la cotización. Nada más se toca al elegirlo. */
export const VEHICLE_FIELDS = ['kmPerL', 'wearPerKm'] as const;
export type VehicleField = (typeof VEHICLE_FIELDS)[number];

export type MixedSource = RouteSource | 'mixto';

export interface ComputedLeg extends LegValue {
  kmSource: RouteSource;
  minutesSource: RouteSource;
}

export interface RouteComputation {
  kind: RouteKind;
  legs: ComputedLeg[];
  km: number;
  minutes: number;
  /** Procedencia de los km de todos los tramos (o «mixto»). */
  kmSource: MixedSource;
  /** Procedencia de los minutos de todos los tramos (o «mixto»). */
  minutesSource: MixedSource;
  /** Resumen para mostrar: una sola procedencia o «mixto». */
  source: MixedSource;
  items: CostItem[];
  measures: Measures;
}

const emptyRoute = (): RouteState => ({
  status: 'vacio',
  key: null,
  route: null,
  manualReason: null,
  message: null,
  overrides: [],
  manualLegs: [],
});

export function initialState(): SessionState {
  return {
    inputs: { origin: '', destination: '', base: '', startAtBase: false, returnToBase: false },
    habitual: emptyRoute(),
    comparison: emptyRoute(),
    params: { ...EMPTY_PARAMS },
    declaredZeros: [],
    origins: {},
    tollsComparison: null,
    margin: 0.15,
    surcharges: 0,
    chosenPrice: null,
    quota: null,
    routeRequests: 0,
    vehicle: null,
    priceBasis: null,
    cargo: emptyInventoryDraft(),
    resources: emptyResourcesDraft(),
    textIssues: {},
  };
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Orígenes de un borrador, sin campos desconocidos ni entradas mal formadas (A-88). */
export function origenesValidos(raw: unknown): OrigenesDatos {
  const out: OrigenesDatos = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const k of CAMPOS_ECONOMICOS) {
    const o = (raw as Record<string, unknown>)[k] as { tipo?: unknown; fecha?: unknown } | undefined;
    if (!o || typeof o !== 'object') continue;
    if (o.tipo !== 'usuario' && o.tipo !== 'ejemplo' && o.tipo !== 'vehiculo') continue;
    const fecha = typeof o.fecha === 'string' && FECHA_ISO.test(o.fecha) ? o.fecha : null;
    out[k] = { tipo: o.tipo, fecha };
  }
  return out;
}

export class QuoteSession {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();
  /** Fecha local de la última edición del perfil del vehículo elegido (A-88). No se guarda en el borrador. */
  private vehicleDate: string | null = null;
  /** Generación por tipo de ruta: invalida respuestas tardías. */
  private readonly generation: Record<RouteKind, number> = { habitual: 0, evitarPeajes: 0 };

  constructor(
    private readonly client: RouteClient,
    initial: Partial<SessionState> = {},
  ) {
    this.state = { ...initialState(), ...initial };
    this.baseline = JSON.stringify(this.draftData());
  }

  // ---- Suscripción (useSyncExternalStore) ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): SessionState => this.state;

  private set(next: Partial<SessionState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  // ---- Entradas (nunca consultan) ----
  setInputs(partial: Partial<AddressInputs>): void {
    const inputs = { ...this.state.inputs, ...partial };
    const key = this.requestKey(inputs, 'habitual');
    const h = this.state.habitual;
    const stale = h.key !== null && key !== h.key;
    if (stale) {
      // Cualquier consulta en curso queda obsoleta: su respuesta se descartará.
      this.generation.habitual += 1;
      this.generation.evitarPeajes += 1;
    }
    // Si el usuario vuelve exactamente al recorrido ya calculado, se recupera sin consultar.
    // D-I8 (A-69): un recorrido RECUPERADO de un borrador se invalida al cambiar las direcciones y
    // no vuelve solo: se descartan sus tramos y hay que calcular la ruta o escribirlos de nuevo.
    if (stale && h.recovered) {
      this.set({
        inputs,
        habitual: { ...emptyRoute(), status: 'desactualizado', key: h.key },
        comparison: emptyRoute(),
        textIssues: this.withoutLegTextIssues(['habitual', 'evitarPeajes']),
      });
      return;
    }
    const restored: RouteState | null =
      !stale && h.status === 'desactualizado' && key !== null && key === h.key
        ? h.route
          ? { ...h, status: 'listo' }
          : h.manualLegs.length > 0
            ? { ...h, status: 'manual' }
            : null
        : null;
    this.set({
      inputs,
      habitual: stale ? { ...h, status: 'desactualizado' } : (restored ?? h),
      comparison: stale ? emptyRoute() : this.state.comparison,
      ...(stale ? { textIssues: this.withoutLegTextIssues(['habitual', 'evitarPeajes']) } : {}),
    });
  }

  /**
   * A-73: registra (o borra, con `null`) el texto inválido escrito en un campo. Un texto que en realidad
   * es un número válido no se registra.
   */
  setTextIssue(key: string, text: string | null): void {
    if (!TEXT_ISSUE_KEY.test(key)) return;
    const current = this.state.textIssues;
    if (text === null || invalidAmountText(text) === null) {
      if (!(key in current)) return;
      const next = { ...current };
      delete next[key];
      this.set({ textIssues: next });
      return;
    }
    if (current[key] === text) return;
    this.set({ textIssues: { ...current, [key]: text } });
  }

  private withoutLegTextIssues(kinds: RouteKind[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.state.textIssues)) if (!kinds.some((kind) => k.startsWith(`${kind}.leg.`))) out[k] = v;
    return out;
  }

  /**
   * Se puede crear una cotización solo con un cálculo vigente, un precio elegido y ningún valor
   * numérico fuera de rango (A-71).
   */
  canQuote(): boolean {
    return (
      this.computation('habitual') !== null &&
      this.state.chosenPrice !== null &&
      !this.priceNeedsConfirmation() &&
      this.quoteBlockers().length === 0
    );
  }

  /**
   * Errores que impiden cotizar (A-73): todos los de la ruta principal, el costo y el precio, incluidos
   * los textos inválidos. Los de la comparación opcional sin peajes NO impiden cotizar.
   */
  quoteBlockers(): string[] {
    return Object.keys(this.numericIssues()).filter(blocksQuote);
  }

  /** Valores numéricos fuera de rango, por campo (A-71). Nunca se corrigen solos. */
  numericIssues(): NumericIssues {
    return numericIssues(this.state);
  }

  /**
   * Barrera de cálculo (A-71): si, pese a los límites, el motor lanzara un error con estos datos, se
   * informa aquí (y `computation` devuelve null) en lugar de romper la pantalla.
   */
  computationError(kind: RouteKind): string | null {
    return this.safeCompute(kind).error;
  }

  /** Huella del costo vigente: recorrido + tipo y valor del costo (al peso). */
  private costFingerprint(): string | null {
    const c = this.computation('habitual');
    if (!c) return null;
    // Tercera revisión (P2): cualquier cambio de recorrido, km/minutos usados, vehículo o
    // parámetros de costo exige reconfirmar, aunque el costo redondeado quede igual.
    // El margen y los recargos no cambian el costo: no exigen confirmar.
    return JSON.stringify({
      ruta: this.state.habitual.key,
      tramos: c.legs.map((l) => [l.km, l.minutes]),
      vehiculo: this.state.vehicle?.id ?? null,
      params: this.state.params,
      costo: [c.measures.cost.type, c.measures.cost.value],
    });
  }

  /** El precio elegido se decidió con otro costo (cambió la ruta, el vehículo o los parámetros). */
  priceNeedsConfirmation(): boolean {
    if (this.state.chosenPrice === null) return false;
    const current = this.costFingerprint();
    return current !== null && current !== this.state.priceBasis;
  }

  /** El usuario confirma que mantiene su precio con el costo actual. */
  confirmPrice(): void {
    this.set({ priceBasis: this.costFingerprint() });
  }

  /**
   * Retención por campo (A-38): los km (o minutos) se pueden guardar en el historial solo
   * si TODOS los tramos los declaró el usuario, o si el proveedor permite conservarlos.
   */
  retainable(kind: RouteKind): { km: boolean; minutes: boolean } {
    const c = this.computation(kind);
    if (!c) return { km: false, minutes: false };
    const retention = this.routeState(kind).route?.retention;
    const ok = (src: RouteSource, field: 'distance' | 'duration') =>
      src === 'declarado' || (src !== 'simulado' && retention?.[field] === 'permanente');
    return {
      km: c.legs.every((l) => ok(l.kmSource, 'distance')),
      minutes: c.legs.every((l) => ok(l.minutesSource, 'duration')),
    };
  }

  /**
   * Elige un vehículo para esta cotización: copia su rendimiento y desgaste a los
   * parámetros. Combustible, remuneración, peajes, ayudantes y otros gastos no cambian.
   * Un valor faltante en el perfil queda faltante (null), nunca 0. No consulta rutas.
   * Con `null` se deja de usar un vehículo y se conservan los valores actuales.
   */
  selectVehicle(profile: VehicleProfile | null): void {
    if (!profile) {
      this.set({ vehicle: null });
      return;
    }
    const applied: AppliedVehicle = {
      id: profile.id,
      name: profile.name,
      type: profile.type,
      fuel: profile.fuel,
      kmPerL: profile.kmPerL,
      wearPerKm: profile.wearPerKm,
    };
    this.set({
      vehicle: applied,
      params: { ...this.state.params, kmPerL: applied.kmPerL, wearPerKm: applied.wearPerKm },
      origins: this.originsWith(VEHICLE_FIELDS, { tipo: 'vehiculo', fecha: (this.vehicleDate = fechaLocalDeIso(profile.updatedAt)) }),
      textIssues: this.textIssuesWithout(['params.kmPerL', 'params.wearPerKm']),
    });
  }

  /** Campos del vehículo ajustados solo para esta cotización. */
  vehicleAdjustments(): VehicleField[] {
    const v = this.state.vehicle;
    if (!v) return [];
    return VEHICLE_FIELDS.filter((f) => this.state.params[f] !== v[f]);
  }

  /** Vuelve a los valores del vehículo elegido. */
  restoreVehicleValues(): void {
    const v = this.state.vehicle;
    if (!v) return;
    this.set({
      params: { ...this.state.params, kmPerL: v.kmPerL, wearPerKm: v.wearPerKm },
      origins: this.originsWith(VEHICLE_FIELDS, { tipo: 'vehiculo', fecha: this.vehicleDate }),
      textIssues: this.textIssuesWithout(['params.kmPerL', 'params.wearPerKm']),
    });
  }

  /** Orígenes con los campos indicados fijados por un mismo evento (A-88). */
  private originsWith(keys: readonly CampoEconomico[], origen: OrigenDato): OrigenesDatos {
    const next: OrigenesDatos = { ...this.state.origins };
    for (const k of keys) next[k] = { ...origen };
    return next;
  }

  /** Inventario del borrador. No cambia el costo ni la huella del precio (D-I1). */
  setCargo(cargo: InventoryDraft): void {
    this.set({ cargo });
  }
  /** Recursos del borrador. No cambian el costo ni la huella del precio (D-I1). */
  setResources(resources: ResourcesDraft): void {
    this.set({ resources });
  }

  /** Copia de lo que escribió el usuario, para el autoguardado del borrador (I-1b). */
  draftData(): DraftData {
    const s = this.state;
    return structuredClone({
      inputs: s.inputs,
      params: s.params,
      declaredZeros: s.declaredZeros,
      origins: s.origins,
      margin: s.margin,
      surcharges: s.surcharges,
      vehicle: s.vehicle,
      cargo: s.cargo,
      resources: s.resources,
      manualRoute: this.manualRouteDraft(),
      invalidTexts: s.textIssues,
    });
  }

  /**
   * D-I8 (A-69): recorrido manual que se puede guardar en el borrador. Solo si la ruta habitual está
   * en modo manual (todos sus tramos los escribió el usuario), corresponde a las direcciones ACTUALES
   * y tiene al menos un km o minuto escrito. Una ruta del proveedor, con o sin correcciones, no se
   * guarda (§12, punto 2, sin autorizar); tampoco un recorrido desactualizado.
   */
  private manualRouteDraft(): ManualRouteDraft | null {
    const h = this.state.habitual;
    if (h.status !== 'manual' || h.key === null || h.key !== this.requestKey(this.state.inputs, 'habitual')) return null;
    if (!h.manualLegs.some((l) => l.km !== null || l.minutes !== null)) return null;
    return { key: h.key, legs: h.manualLegs.map((l) => ({ from: l.from, to: l.to, km: l.km, minutes: l.minutes })) };
  }

  /**
   * Línea base del borrador (auditoría I-1, P1-1): el estado «sin trabajo del usuario». Se fija al
   * crear la sesión y, si corresponde, después de aplicar AUTOMÁTICAMENTE el vehículo predeterminado
   * (`selectDefaultVehicle`), que no es trabajo del usuario. Cualquier diferencia con la base
   * —direcciones, costos, margen, recargos, vehículo, inventario o recursos— es contenido.
   */
  private baseline: string;

  /** ¿Hay algo escrito o elegido por el usuario respecto de la línea base? */
  hasDraftContent(): boolean {
    return JSON.stringify(this.draftData()) !== this.baseline;
  }

  /**
   * La cotización se emitió con este estado: pasa a ser la línea base del borrador (reauditoría de
   * `230ad6e`, P1). Sin cambios posteriores no hay nada que autoguardar; un cambio nuevo sí cuenta.
   */
  markEmitted(): void {
    this.baseline = JSON.stringify(this.draftData());
  }

  /**
   * Aplica el vehículo predeterminado de forma AUTOMÁTICA. Si la sesión estaba en su línea base,
   * la base pasa a incluir ese vehículo: no se ofrece como «borrador» algo que el usuario no hizo.
   */
  selectDefaultVehicle(profile: VehicleProfile): void {
    const enBase = !this.hasDraftContent();
    this.selectVehicle(profile);
    if (enBase) this.baseline = JSON.stringify(this.draftData());
  }

  /**
   * Recupera un borrador guardado (I-1b), solo por decisión del usuario. El precio NUNCA se recupera:
   * se escribe y se confirma de nuevo. La ruta del proveedor tampoco: se vuelve a calcular.
   * D-I8 (A-69): un recorrido manual vuelve en modo manual, con el aviso de revisión, solo si su
   * clave y sus tramos coinciden con las direcciones recuperadas; si no, se descarta.
   */
  restoreDraft(d: DraftData): void {
    for (const k of Object.keys(this.generation) as RouteKind[]) this.generation[k] += 1;
    const inputs = { ...d.inputs };
    const next: SessionState = {
      ...initialState(),
      habitual: this.recoveredRoute(inputs, d.manualRoute ?? null),
      inputs,
      params: { ...d.params },
      // Los borradores antiguos no distinguían el cero declarado del inicial. Ante la duda, protegerlo.
      declaredZeros: ZERO_DEFAULT_COSTS.filter((key) => d.params[key] === 0 && (d.declaredZeros?.includes(key) ?? true)),
      origins: origenesValidos(d.origins),
      margin: d.margin,
      surcharges: d.surcharges,
      vehicle: d.vehicle ? { ...d.vehicle } : null,
      cargo: structuredClone(d.cargo),
      resources: structuredClone(d.resources),
      textIssues: {},
    };
    next.textIssues = this.recoveredTextIssues(d.invalidTexts, next.habitual);
    // P2 de la auditoría de D-I8 (A-70): si el cálculo con el recorrido recuperado fallaría (p. ej.,
    // otros datos dañados del borrador), se descarta SOLO el recorrido. El resto se conserva y la
    // pantalla nunca recibe un recorrido que haga fallar al motor.
    if (next.habitual.recovered && !this.computesSafely(next)) next.habitual = emptyRoute();
    // (A-71) «Fallaría» incluye ahora los valores fuera de rango que pausan el cálculo.
    this.set(next);
  }

  /**
   * A-73: textos inválidos del borrador que se recuperan literalmente. Se descartan los de la
   * comparación y sus peajes (no se recuperan), el del precio (nunca se recupera, D-I8) y los de tramos que no
   * existen en el recorrido recuperado. Solo se aceptan textos que de verdad no son números.
   */
  private recoveredTextIssues(texts: Record<string, string> | undefined, habitual: RouteState): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, text] of Object.entries(texts ?? {})) {
      if (!TEXT_ISSUE_KEY.test(key) || typeof text !== 'string' || invalidAmountText(text) === null) continue;
      if (key === 'chosenPrice' || key === 'tollsComparison' || key.startsWith('evitarPeajes.')) continue;
      const leg = /^habitual\.leg\.(\d)\./.exec(key);
      if (leg && !(habitual.recovered && Number(leg[1]) < habitual.manualLegs.length)) continue;
      out[key] = text;
    }
    return out;
  }

  /** ¿El cálculo con este estado termina sin error? Se prueba sin publicar el estado. */
  private computesSafely(candidate: SessionState): boolean {
    const previous = this.state;
    this.state = candidate;
    try {
      // Solo los valores fuera de rango descartan el recorrido (A-70); un texto inválido recuperado lo
      // conserva: el campo muestra el texto y su error hasta que el usuario lo corrija (A-73).
      return this.safeCompute('habitual').error === null && Object.keys(numericIssues(candidate, { includeText: false })).length === 0;
    } finally {
      this.state = previous;
    }
  }

  /** Recorrido manual recuperado, o una ruta vacía si no coincide con las direcciones (D-I8). */
  private recoveredRoute(inputs: AddressInputs, m: ManualRouteDraft | null): RouteState {
    if (!m) return emptyRoute();
    const key = this.requestKey(inputs, 'habitual');
    const template = this.legTemplate(inputs);
    const coincide =
      key !== null &&
      m.key === key &&
      m.legs.length === template.length &&
      m.legs.every((l, i) => l.from === template[i]!.from && l.to === template[i]!.to) &&
      // Defensa en profundidad (A-70): sin negativos, no finitos ni valores sobre el tope técnico.
      m.legs.every((l) => manualLegValueValid(l.km, MAX_MANUAL_LEG_KM) && manualLegValueValid(l.minutes, MAX_MANUAL_LEG_MINUTES)) &&
      m.legs.some((l) => l.km !== null || l.minutes !== null);
    if (!coincide) return emptyRoute();
    return {
      ...emptyRoute(),
      status: 'manual',
      key,
      message: RECOVERED_ROUTE_MESSAGE,
      manualLegs: m.legs.map((l) => ({ from: l.from, to: l.to, km: l.km, minutes: l.minutes })),
      recovered: true,
    };
  }

  /*
   * A-75 (P1 de la auditoría de A-73): fijar el valor de un campo —desde el propio campo o por una acción
   * que lo reemplaza, como «Cargar ejemplo ficticio», elegir o restaurar un vehículo o un margen
   * predefinido— quita el texto inválido de ESE campo, que ya no representa lo que se ve. Los demás
   * campos conservan su error. Un texto inválido nunca pasa por estos métodos (NumberField no llama a
   * onChange con él), así que no se pierde nada escrito.
   */
  setParams(partial: CostEdits, origin: ParamOrigin = 'usuario'): void {
    const { helpers = this.state.params.helpers, loadMinutes = this.state.params.loadMinutes } = partial;
    const declaredZeros = ZERO_DEFAULT_COSTS.filter((key) =>
      key in partial ? partial[key] === 0 : this.state.declaredZeros.includes(key),
    );
    // A-88: cada campo tocado registra quién lo fijó y cuándo (fecha local del evento).
    const touched = PARAM_KEYS.filter((k) => k in partial);
    this.set({
      params: { ...this.state.params, ...partial, helpers: helpers ?? 0, loadMinutes: loadMinutes ?? 0 },
      declaredZeros,
      origins: this.originsWith(touched, { tipo: origin, fecha: origin === 'ejemplo' ? null : fechaLocal() }),
      textIssues: this.textIssuesWithout(Object.keys(partial).map((k) => `params.${k}`)),
    });
  }
  /** Solo considera los campos que la acción sustituirá, incluido un texto que aún no se pudo interpretar. */
  wouldReplaceCosts(next: Partial<TripParams>): boolean {
    const { params, textIssues, declaredZeros } = this.state;
    return (Object.keys(next) as Array<keyof TripParams>).some((key) => {
      if (`params.${key}` in textIssues) return true;
      if (params[key] === next[key]) return false;
      return params[key] !== EMPTY_PARAMS[key] || declaredZeros.some((zeroKey) => zeroKey === key);
    });
  }

  setTollsComparison(value: number | null): void {
    this.set({ tollsComparison: value, textIssues: this.textIssuesWithout(['tollsComparison']) });
  }
  setMargin(margin: number): void {
    this.set({ margin, origins: this.originsWith(['margin'], { tipo: 'usuario', fecha: fechaLocal() }), textIssues: this.textIssuesWithout(['margin']) });
  }
  setSurcharges(value: number): void {
    this.set({ surcharges: Math.max(0, value), origins: this.originsWith(['surcharges'], { tipo: 'usuario', fecha: fechaLocal() }), textIssues: this.textIssuesWithout(['surcharges']) });
  }
  setChosenPrice(value: number | null): void {
    // La huella no depende del precio: se toma con el costo vigente al escribirlo.
    this.set({ chosenPrice: value, priceBasis: value === null ? null : this.costFingerprint(), textIssues: this.textIssuesWithout(['chosenPrice']) });
  }

  /** Copia de `textIssues` sin esas claves (la misma referencia si no había ninguna). */
  private textIssuesWithout(keys: string[]): Record<string, string> {
    const current = this.state.textIssues;
    if (!keys.some((k) => k in current)) return current;
    const next = { ...current };
    for (const k of keys) delete next[k];
    return next;
  }

  /** Corrección de km o minutos de un tramo (queda como «declarado por ti»). */
  setLegOverride(kind: RouteKind, index: number, value: Partial<Pick<LegValue, 'km' | 'minutes'>>): void {
    const rs = this.routeState(kind);
    // A-75: el tramo que se fija deja de tener texto inválido (solo los campos km/minutos tocados).
    const textIssues = this.textIssuesWithout(Object.keys(value).map((f) => `${kind}.leg.${index}.${f}`));
    if (rs.status === 'manual') {
      const manualLegs = rs.manualLegs.map((l, i) => (i === index ? { ...l, ...value } : l));
      this.set({ textIssues });
      this.setRouteState(kind, { ...rs, manualLegs });
      return;
    }
    const overrides = [...rs.overrides];
    overrides[index] = { ...overrides[index], ...value };
    this.set({ textIssues });
    this.setRouteState(kind, { ...rs, overrides });
  }

  /** El usuario prefiere ingresar km y minutos a mano (sin consultar). */
  useManual(kind: RouteKind = 'habitual'): void {
    // Tercera revisión (P1): una consulta pendiente queda invalidada; su respuesta tardía
    // no puede reemplazar los km y minutos que el usuario escriba a mano.
    this.generation[kind] += 1;
    this.set({ textIssues: this.withoutLegTextIssues([kind]) });
    this.setRouteState(kind, {
      ...emptyRoute(),
      status: 'manual',
      key: this.requestKey(this.state.inputs, kind),
      manualReason: null,
      message: 'Ingresa los kilómetros y minutos de cada tramo.',
      manualLegs: this.legTemplate(),
    });
  }

  // ---- Consultas (las únicas que llaman al servidor) ----
  calculateRoute(): Promise<void> {
    return this.fetchRoute('habitual');
  }

  /** Comparación opcional: 1 solicitud adicional, solo con la ruta habitual vigente. */
  compareWithoutTolls(): Promise<void> {
    const h = this.state.habitual;
    if (h.status !== 'listo' || h.key === null || h.key !== this.requestKey(this.state.inputs, 'habitual')) {
      return Promise.resolve();
    }
    return this.fetchRoute('evitarPeajes');
  }

  private async fetchRoute(kind: RouteKind): Promise<void> {
    const rs = this.routeState(kind);
    if (rs.status === 'cargando') return;
    const input = this.requestInput(kind);
    if (!input) {
      this.setRouteState(kind, { ...rs, status: rs.status, message: MANUAL_MESSAGES.solicitud_invalida });
      return;
    }
    const key = routeKey(input);
    // Nada cambió: no se consulta. Excepción (auditoría 2, P1): tras un fallo transitorio
    // (error del servicio o del contador) o un modo manual elegido por el usuario, presionar
    // de nuevo es un reintento explícito (consume una nueva reserva). Cupo o límites agotados no.
    if (rs.key === key && rs.status === 'listo') return;
    if (rs.key === key && (rs.status === 'manual' || rs.status === 'vacio') && rs.manualReason !== null && NON_RETRYABLE_MANUAL.has(rs.manualReason)) return;
    // Km y minutos que el usuario ya escribió en modo manual no se pierden si la consulta tiene éxito.
    const declared = rs.status === 'manual' && rs.key === key ? rs.manualLegs : [];

    const generation = ++this.generation[kind];
    this.set({ textIssues: this.withoutLegTextIssues([kind]) });
    this.setRouteState(kind, { ...emptyRoute(), status: 'cargando', key });
    this.set({ routeRequests: this.state.routeRequests + 1 });
    let response: RouteApiResponse;
    try {
      response = await this.client.requestRoute(input);
    } catch {
      response = { status: 'manual', reason: 'error_proveedor', message: MANUAL_MESSAGES.error_proveedor, quota: null };
    }
    if (response.quota) this.set({ quota: response.quota });
    // Respuesta tardía: el recorrido cambió (o hubo otra consulta) mientras se esperaba.
    if (generation !== this.generation[kind] || this.requestKey(this.state.inputs, kind) !== key) return;
    if (response.status === 'ok') {
      const keep = declared.length === response.route.legs.length && declared.some((l) => l.km !== null || l.minutes !== null);
      const overrides = keep
        ? declared.map((l) => ({ ...(l.km !== null ? { km: l.km } : {}), ...(l.minutes !== null ? { minutes: l.minutes } : {}) }))
        : [];
      this.setRouteState(kind, {
        ...emptyRoute(),
        status: 'listo',
        key,
        route: response.route,
        overrides,
        message: keep ? 'Mantuvimos los km y minutos que ingresaste; puedes cambiarlos en la tabla de tramos.' : null,
      });
    } else {
      this.setRouteState(kind, {
        ...emptyRoute(),
        status: kind === 'evitarPeajes' && response.reason === 'limite_comparaciones' ? 'vacio' : 'manual',
        key,
        manualReason: response.reason,
        message: response.message,
        // Tercera revisión: si el reintento también falla, lo que el usuario escribió se mantiene.
        manualLegs: declared.length > 0 ? declared : this.legTemplate(),
      });
    }
  }

  // ---- Resultados derivados (motor económico en el navegador) ----
  computation(kind: RouteKind): RouteComputation | null {
    return this.safeCompute(kind).result;
  }

  /**
   * A-71: con un valor fuera de rango que afecta a esta ruta, el cálculo queda en pausa (null) y el
   * campo muestra su error; nada se reemplaza. Un precio elegido fuera de rango no pausa el costo: se
   * calcula sin él y no se puede cotizar. Cualquier error del motor queda contenido aquí.
   */
  private safeCompute(kind: RouteKind): { result: RouteComputation | null; error: string | null } {
    const issues = numericIssues(this.state);
    if (Object.keys(issues).some((k) => blocksComputation(k, kind))) return { result: null, error: null };
    try {
      return { result: this.compute(kind, issues.chosenPrice ? null : this.state.chosenPrice), error: null };
    } catch {
      return { result: null, error: 'No se pudo calcular con estos valores. Revisa los datos del viaje.' };
    }
  }

  private compute(kind: RouteKind, price: number | null): RouteComputation | null {
    const rs = this.routeState(kind);
    // Solo con la ruta del recorrido ACTUAL (auditoría P0).
    if (rs.key === null || rs.key !== this.requestKey(this.state.inputs, kind)) return null;
    let legs: ComputedLeg[];
    if (rs.status === 'manual') {
      legs = rs.manualLegs.map((l) => ({ ...l, kmSource: 'declarado' as const, minutesSource: 'declarado' as const }));
    } else if (rs.status === 'listo' && rs.route) {
      const route = rs.route;
      legs = route.legs.map((l, i) => {
        const o = rs.overrides[i] ?? {};
        return {
          from: l.from,
          to: l.to,
          km: o.km !== undefined ? o.km : l.distanceM / 1000,
          minutes: o.minutes !== undefined ? o.minutes : l.durationS / 60,
          kmSource: o.km !== undefined ? ('declarado' as const) : route.source,
          minutesSource: o.minutes !== undefined ? ('declarado' as const) : route.source,
        };
      });
    } else {
      return null;
    }
    if (legs.length === 0 || legs.some((l) => l.km === null || l.minutes === null)) return null;
    const km = legs.reduce((s, l) => s + (l.km ?? 0), 0);
    const minutes = legs.reduce((s, l) => s + (l.minutes ?? 0), 0);
    const params = kind === 'evitarPeajes' ? { ...this.state.params, tolls: this.state.tollsComparison } : this.state.params;
    const items = buildCostItems(km, minutes, params);
    const measures = computeMeasures({
      items,
      margin: this.state.margin,
      surcharges: this.state.surcharges,
      price,
    });
    const single = (values: RouteSource[]): MixedSource => (new Set(values).size === 1 ? values[0]! : 'mixto');
    const kmSource = single(legs.map((l) => l.kmSource));
    const minutesSource = single(legs.map((l) => l.minutesSource));
    const source = single([...legs.map((l) => l.kmSource), ...legs.map((l) => l.minutesSource)]);
    return { kind, legs, km, minutes, kmSource, minutesSource, source, items, measures };
  }

  comparisonResult(): Comparison | null {
    const x = this.computation('habitual');
    const y = this.computation('evitarPeajes');
    if (!x || !y) return null;
    return compareRoutes(
      { items: x.items, km: x.km, hours: (x.minutes + this.state.params.loadMinutes) / 60 },
      { items: y.items, km: y.km, hours: (y.minutes + this.state.params.loadMinutes) / 60 },
    );
  }

  // ---- Auxiliares ----
  private routeState(kind: RouteKind): RouteState {
    return kind === 'habitual' ? this.state.habitual : this.state.comparison;
  }
  private setRouteState(kind: RouteKind, rs: RouteState): void {
    this.set(kind === 'habitual' ? { habitual: rs } : { comparison: rs });
  }

  private requestInput(kind: RouteKind, inputs: AddressInputs = this.state.inputs): RouteRequestInput | null {
    const origin = inputs.origin.trim();
    const destination = inputs.destination.trim();
    const base = inputs.base.trim();
    const needsBase = inputs.startAtBase || inputs.returnToBase;
    if (origin.length < 3 || destination.length < 3 || (needsBase && base.length < 3)) return null;
    return {
      origin,
      destination,
      base: needsBase ? base : null,
      startAtBase: inputs.startAtBase,
      returnToBase: inputs.returnToBase,
      kind,
    };
  }

  private requestKey(inputs: AddressInputs, kind: RouteKind): string | null {
    const input = this.requestInput(kind, inputs);
    return input ? routeKey(input) : null;
  }

  private legTemplate(inputs: AddressInputs = this.state.inputs): LegValue[] {
    const input = this.requestInput('habitual', inputs);
    const points = input
      ? buildWaypoints(input)
      : [
          { role: 'A' as const, address: '' },
          { role: 'B' as const, address: '' },
        ];
    const legs: LegValue[] = [];
    for (let i = 0; i < points.length - 1; i++) legs.push({ from: points[i]!.role, to: points[i + 1]!.role, km: null, minutes: null });
    return legs;
  }
}
