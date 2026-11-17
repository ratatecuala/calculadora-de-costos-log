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
}

export interface RouteComputation {
  kind: RouteKind;
  legs: Array<LegValue & { source: RouteSource }>;
  km: number;
  minutes: number;
  source: RouteSource | 'mixto';
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
  };
}

export class QuoteSession {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();

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
    this.set({
      inputs,
      habitual: stale ? { ...h, status: 'desactualizado' } : h,
      comparison: stale ? emptyRoute() : this.state.comparison,
    });
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
    this.set({ chosenPrice: value });
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
    if (this.state.habitual.status !== 'listo') return Promise.resolve();
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
    if (rs.key === key && (rs.status === 'listo' || rs.status === 'manual')) return; // nada cambió: no se consulta

    this.setRouteState(kind, { ...emptyRoute(), status: 'cargando', key });
    this.set({ routeRequests: this.state.routeRequests + 1 });
    let response: RouteApiResponse;
    try {
      response = await this.client.requestRoute(input);
    } catch {
      response = { status: 'manual', reason: 'error_proveedor', message: MANUAL_MESSAGES.error_proveedor, quota: null };
    }
    if (response.quota) this.set({ quota: response.quota });
    if (response.status === 'ok') {
      this.setRouteState(kind, { ...emptyRoute(), status: 'listo', key, route: response.route });
    } else {
      this.setRouteState(kind, {
        ...emptyRoute(),
        status: kind === 'evitarPeajes' && response.reason === 'limite_comparaciones' ? 'vacio' : 'manual',
        key,
        manualReason: response.reason,
        message: response.message,
        manualLegs: this.legTemplate(),
      });
    }
  }

  // ---- Resultados derivados (motor económico en el navegador) ----
  computation(kind: RouteKind): RouteComputation | null {
    const rs = this.routeState(kind);
    let legs: Array<LegValue & { source: RouteSource }>;
    if (rs.status === 'manual') {
      legs = rs.manualLegs.map((l) => ({ ...l, source: 'declarado' as const }));
    } else if ((rs.status === 'listo' || rs.status === 'desactualizado') && rs.route) {
      const route = rs.route;
      legs = route.legs.map((l, i) => {
        const o = rs.overrides[i] ?? {};
        const corrected = o.km !== undefined || o.minutes !== undefined;
        return {
          from: l.from,
          to: l.to,
          km: o.km !== undefined ? o.km : l.distanceM / 1000,
          minutes: o.minutes !== undefined ? o.minutes : l.durationS / 60,
          source: corrected ? ('declarado' as const) : route.source,
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
    const sources = new Set(legs.map((l) => l.source));
    return { kind, legs, km, minutes, source: sources.size === 1 ? [...sources][0]! : 'mixto', items, measures };
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
