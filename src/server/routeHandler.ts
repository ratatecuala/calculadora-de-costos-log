/**
 * POST /api/route — única puerta hacia el proveedor de rutas.
 *
 * Orden de controles (todos ANTES de llamar al proveedor):
 *   1. Validación de la entrada.
 *   2. Interruptor global (ROUTES_ENABLED).
 *   3. Identidad anónima del cliente (obligatoria) y origen de red seudonimizado.
 *   4. Reserva atómica en el contador (global, ritmo diario, usuario, origen, comparaciones).
 *      Si el contador falla o tarda: CIERRE (no se consulta) y modo manual.
 *   5. Llamada al proveedor. Un solo reintento, solo si el error es reintentable,
 *      y solo con una nueva reserva (los reintentos consumen presupuesto).
 * La respuesta se arma con una lista blanca: nunca incluye configuración ni claves.
 */
import { MANUAL_MESSAGES, routeRequestSchema, type ManualReason, type QuotaInfo, type RouteApiResponse, type RouteResult } from '../shared/route';
import { routeKey } from '../shared/waypoints';
import type { ServerConfig } from './config';
import type { BudgetGate, ReservationKind } from './budget/ledger';
import type { RouteProvider } from './providers/types';
import { checkLegs, mergeWarnings } from './validateRoute';

export interface RouteHandlerDeps {
  config: Pick<ServerConfig, 'routesEnabled' | 'originSalt'>;
  budget: BudgetGate;
  provider: RouteProvider;
  clock?: () => Date;
}

export interface RequestContext {
  clientId: string | null;
  ip: string | null;
}

export interface HandlerResult {
  httpStatus: number;
  json: RouteApiResponse;
}

const CLIENT_ID = /^[a-zA-Z0-9-]{16,64}$/;
const inflight = new WeakMap<RouteHandlerDeps, Map<string, Promise<HandlerResult>>>();

export function handleRouteRequest(body: unknown, ctx: RequestContext, deps: RouteHandlerDeps): Promise<HandlerResult> {
  const parsed = routeRequestSchema.safeParse(body);
  if (!parsed.success) return Promise.resolve(manual(400, 'solicitud_invalida', null));
  if (!deps.config.routesEnabled) return Promise.resolve(manual(503, 'servicio_apagado', null));
  if (!ctx.clientId || !CLIENT_ID.test(ctx.clientId)) return Promise.resolve(manual(400, 'solicitud_invalida', null));

  const input = parsed.data;
  const userKey = `c:${ctx.clientId}`;
  // Doble clic o recarga: la misma solicitud en curso del mismo usuario se comparte (una sola reserva).
  const dedupeKey = `${userKey}|${routeKey(input)}`;
  let map = inflight.get(deps);
  if (!map) {
    map = new Map();
    inflight.set(deps, map);
  }
  const existing = map.get(dedupeKey);
  if (existing) return existing;
  const promise = processRequest(input, userKey, ctx, deps).finally(() => map!.delete(dedupeKey));
  map.set(dedupeKey, promise);
  return promise;
}

async function processRequest(
  input: ReturnType<typeof routeRequestSchema.parse>,
  userKey: string,
  ctx: RequestContext,
  deps: RouteHandlerDeps,
): Promise<HandlerResult> {
  const now = deps.clock?.() ?? new Date();
  const originKey = `o:${await pseudonymize(ctx.ip ?? 'desconocido', deps.config.originSalt)}`;
  const kind: ReservationKind = input.kind === 'evitarPeajes' ? 'comparacion' : 'ruta';

  const first = await tryReserve(deps.budget, kind, userKey, originKey, now);
  if (first !== 'ok') return manual(first === 'contador_no_disponible' ? 503 : 429, first, await safeQuota(deps, userKey, now));

  let outcome = await deps.provider.computeRoute(input);
  if (!outcome.ok && outcome.retryable) {
    const retry = await tryReserve(deps.budget, 'reintento', userKey, originKey, now);
    if (retry === 'ok') outcome = await deps.provider.computeRoute(input);
    else return manual(retry === 'contador_no_disponible' ? 503 : 429, retry, await safeQuota(deps, userKey, now));
  }
  if (!outcome.ok) return manual(502, 'error_proveedor', await safeQuota(deps, userKey, now));

  // Segunda barrera, para cualquier proveedor: tramos inválidos no llegan al cálculo (sin reintento).
  const check = checkLegs(outcome.route.legs);
  if (!check.valid) return manual(502, 'error_proveedor', await safeQuota(deps, userKey, now));
  const route = { ...outcome.route, warnings: mergeWarnings(outcome.route.warnings, check.warnings) };

  return { httpStatus: 200, json: { status: 'ok', route: sanitize(route), quota: await safeQuota(deps, userKey, now) } };
}

async function tryReserve(
  budget: BudgetGate,
  kind: ReservationKind,
  userKey: string,
  originKey: string,
  now: Date,
): Promise<'ok' | ManualReason> {
  try {
    const result = await budget.reserve({ kind, userKey, originKey, now });
    return result.ok ? 'ok' : result.reason;
  } catch {
    // Cierre ante falla: cualquier error del contador (CounterUnavailableError u otro) bloquea la consulta.
    return 'contador_no_disponible';
  }
}

async function safeQuota(deps: RouteHandlerDeps, userKey: string, now: Date): Promise<QuotaInfo | null> {
  try {
    return await deps.budget.quota(userKey, now);
  } catch {
    return null;
  }
}

function manual(httpStatus: number, reason: ManualReason, quota: QuotaInfo | null): HandlerResult {
  return { httpStatus, json: { status: 'manual', reason, message: MANUAL_MESSAGES[reason], quota } };
}

/** Lista blanca de campos: nada adicional del proveedor llega al navegador. */
function sanitize(route: RouteResult): RouteResult {
  return {
    kind: route.kind,
    source: route.source,
    legs: route.legs.map((l) => ({ from: l.from, to: l.to, distanceM: l.distanceM, durationS: l.durationS })),
    // Totales recalculados desde los tramos: siempre consistentes.
    totalDistanceM: route.legs.reduce((s, l) => s + l.distanceM, 0),
    totalDurationS: route.legs.reduce((s, l) => s + l.durationS, 0),
    warnings: route.warnings.map((w) => ({ ...w })),
    computedAt: route.computedAt,
    retention: { distance: route.retention.distance, duration: route.retention.duration },
  };
}

/** Seudónimo del origen de red: no se guarda la IP. */
async function pseudonymize(value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}
