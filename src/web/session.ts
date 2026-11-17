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
import { buildWaypoints, routeKey } from '../shared/waypoints';

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
}

export interface SessionState {
  inputs: AddressInputs;
  habitual: RouteState;
  comparison: RouteState;
  params: TripParams;
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
    tollsComparison: null,
    margin: 0.15,
    surcharges: 0,
    chosenPrice: null,
    quota: null,
    routeRequests: 0,
    vehicle: null,
    priceBasis: null,
  };
}

export class QuoteSession {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();
  /** Generación por tipo de ruta: invalida respuestas tardías. */
  private readonly generation: Record<RouteKind, number> = { habitual: 0, evitarPeajes: 0 };

  constructor(
    private readonly client: RouteClient,
    initial: Partial<SessionState> = {},
  ) {
    this.state = { ...initialState(), ...initial };
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
    });
  }

  /** Se puede crear una cotización solo con un cálculo vigente y un precio elegido. */
  canQuote(): boolean {
    return this.computation('habitual') !== null && this.state.chosenPrice !== null && !this.priceNeedsConfirmation();
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
    this.set({ vehicle: applied, params: { ...this.state.params, kmPerL: applied.kmPerL, wearPerKm: applied.wearPerKm } });
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
    this.set({ params: { ...this.state.params, kmPerL: v.kmPerL, wearPerKm: v.wearPerKm } });
  }

  setParams(partial: Partial<TripParams>): void {
    this.set({ params: { ...this.state.params, ...partial } });
  }
  setTollsComparison(value: number | null): void {
    this.set({ tollsComparison: value });
  }
  setMargin(margin: number): void {
    this.set({ margin });
  }
  setSurcharges(value: number): void {
    this.set({ surcharges: Math.max(0, value) });
  }
  setChosenPrice(value: number | null): void {
    // La huella no depende del precio: se toma con el costo vigente al escribirlo.
    this.set({ chosenPrice: value, priceBasis: value === null ? null : this.costFingerprint() });
  }

  /** Corrección de km o minutos de un tramo (queda como «declarado por ti»). */
  setLegOverride(kind: RouteKind, index: number, value: Partial<Pick<LegValue, 'km' | 'minutes'>>): void {
    const rs = this.routeState(kind);
    if (rs.status === 'manual') {
      const manualLegs = rs.manualLegs.map((l, i) => (i === index ? { ...l, ...value } : l));
      this.setRouteState(kind, { ...rs, manualLegs });
      return;
    }
    const overrides = [...rs.overrides];
    overrides[index] = { ...overrides[index], ...value };
    this.setRouteState(kind, { ...rs, overrides });
  }

  /** El usuario prefiere ingresar km y minutos a mano (sin consultar). */
  useManual(kind: RouteKind = 'habitual'): void {
    // Tercera revisión (P1): una consulta pendiente queda invalidada; su respuesta tardía
    // no puede reemplazar los km y minutos que el usuario escriba a mano.
    this.generation[kind] += 1;
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
      price: this.state.chosenPrice,
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

  private legTemplate(): LegValue[] {
    const input = this.requestInput('habitual');
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
