/**
 * Punto de entrada para Cloudflare Workers. ESCRITO, NO DESPLEGADO: no hay cuenta
 * autorizada (A-44). Sirve la app estática (binding ASSETS) y `/api/route`.
 * El contador vive en el Durable Object `ROUTE_BUDGET` (una sola instancia).
 *
 * Interruptor (auditoría 2, P1): la configuración se lee en CADA solicitud, nunca se
 * guarda en el isolate. Además existe un interruptor en caliente dentro del contador,
 * que se acciona con `POST /api/admin/routes` y un token de administración
 * (ADMIN_TOKEN). Sin ADMIN_TOKEN configurado, esa ruta no existe (404).
 */
import { DurableObjectBudgetGate, RouteBudgetDurableObject } from './budget/durableObject';
import { readServerConfig, type ServerConfig } from './config';
import { createRouteService } from './createRouteService';
import type { RouteProvider } from './providers/types';
import { handleRouteRequest } from './routeHandler';

export interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ROUTE_BUDGET: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> } };
  [key: string]: unknown;
}

export { RouteBudgetDurableObject };

// Solo se reutilizan objetos sin configuración: el cliente del contador (también es la
// clave de deduplicación) y el proveedor ya armado para una misma configuración.
const gates = new WeakMap<object, DurableObjectBudgetGate>();
let providerCache: { fingerprint: string; provider: RouteProvider } | null = null;

function stringEnv(env: WorkerEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

function budgetGate(env: WorkerEnv): DurableObjectBudgetGate {
  let gate = gates.get(env.ROUTE_BUDGET);
  if (!gate) {
    gate = new DurableObjectBudgetGate(env.ROUTE_BUDGET.get(env.ROUTE_BUDGET.idFromName('global')));
    gates.set(env.ROUTE_BUDGET, gate);
  }
  return gate;
}

function providerFor(config: ServerConfig, gate: DurableObjectBudgetGate): RouteProvider {
  // La huella no contiene la clave: solo si existe y su largo, para detectar cambios.
  const fingerprint = `${config.provider}|${config.routesEnabled}|${config.googleApiKey?.length ?? 0}`;
  if (!providerCache || providerCache.fingerprint !== fingerprint) {
    providerCache = { fingerprint, provider: createRouteService(config, gate).provider };
  }
  return providerCache.provider;
}

/** Comparación en tiempo constante para el token de administración. */
function sameToken(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i += 1) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function handleAdmin(request: Request, env: WorkerEnv): Promise<Response> {
  const token = typeof env['ADMIN_TOKEN'] === 'string' ? env['ADMIN_TOKEN'] : '';
  if (token.length < 32) return new Response('No encontrado', { status: 404 });
  const auth = request.headers.get('Authorization') ?? '';
  if (!sameToken(auth, `Bearer ${token}`)) return new Response('No autorizado', { status: 401 });
  const gate = budgetGate(env);
  try {
    if (request.method === 'GET') return Response.json({ enabled: await gate.isServiceEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== 'boolean') return new Response('Solicitud inválida', { status: 400 });
    await gate.setServiceEnabled(body.enabled);
    return Response.json({ enabled: await gate.isServiceEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('Contador no disponible', { status: 503 });
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/routes') return handleAdmin(request, env);
    if (url.pathname === '/api/route') {
      if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });
      const config = readServerConfig(stringEnv(env)); // en cada solicitud
      const budget = budgetGate(env);
      const deps = {
        config: { routesEnabled: config.routesEnabled, originSalt: config.originSalt },
        budget,
        provider: providerFor(config, budget),
      };
      let body: unknown = null;
      try {
        body = await request.json();
      } catch {
        body = null;
      }
      const result = await handleRouteRequest(
        body,
        { clientId: request.headers.get('X-Client-Id'), ip: request.headers.get('CF-Connecting-IP') },
        deps,
      );
      return Response.json(result.json, { status: result.httpStatus, headers: { 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  },
};
