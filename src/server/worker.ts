/**
 * Punto de entrada para Cloudflare Workers. ESCRITO, NO DESPLEGADO: no hay cuenta
 * autorizada (A-44). Sirve la app estática (binding ASSETS) y `/api/route`.
 * El contador vive en el Durable Object `ROUTE_BUDGET` (una sola instancia).
 *
 * Interruptor (auditoría 2, P1): la configuración se lee en CADA solicitud, nunca se
 * guarda en el isolate. Además existe un interruptor en caliente dentro del contador,
 * que se acciona con `POST /api/admin/routes` y un token de administración
 * (ADMIN_TOKEN). Sin ADMIN_TOKEN configurado, esa ruta no existe (404).
 *
 * Staging: si existe el secreto STAGING_BASIC_AUTH («usuario:contraseña»), TODO el sitio
 * (app, API, enlaces públicos) exige esas credenciales, para que nadie externo lo use.
 */
import { DurableObjectBudgetGate, RouteBudgetDurableObject } from './budget/durableObject';
import { readServerConfig, type ServerConfig } from './config';
import { createRouteService } from './createRouteService';
import type { RouteProvider } from './providers/types';
import { handleRouteRequest } from './routeHandler';

export interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ROUTE_BUDGET: {
    idFromName(name: string): unknown;
    get(id: unknown): {
      fetch(input: string, init?: RequestInit): Promise<Response>;
    };
  };
  [key: string]: unknown;
}

export { RouteBudgetDurableObject };

// Nada se reutiliza entre solicitudes (staging real, 18-11): en Workers, un objeto de E/S
// como el stub de un Durable Object creado en una solicitud no puede usarse desde otra.
// Reutilizarlo hacía fallar el contador de forma intermitente (el sistema cerraba bien, en
// modo manual, pero sin servicio). El contador y el proveedor se arman en cada solicitud
// (sin llamadas de red); la deduplicación usa el binding, que sí es estable.

function stringEnv(env: WorkerEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

function budgetGate(env: WorkerEnv): DurableObjectBudgetGate {
  return new DurableObjectBudgetGate(env.ROUTE_BUDGET.get(env.ROUTE_BUDGET.idFromName('global')));
}

function providerFor(config: ServerConfig, gate: DurableObjectBudgetGate): RouteProvider {
  return createRouteService(config, gate).provider;
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
    if (request.method === 'GET')
      return Response.json(await gate.status(new Date()), {
        headers: { 'Cache-Control': 'no-store' },
      });
    if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });
    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown;
    } | null;
    if (!body || typeof body.enabled !== 'boolean') return new Response('Solicitud inválida', { status: 400 });
    await gate.setServiceEnabled(body.enabled);
    return Response.json({ enabled: await gate.isServiceEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return new Response('Contador no disponible', { status: 503 });
  }
}

/** Protección de staging con usuario y contraseña (Basic Auth). Sin el secreto, no aplica. */
function stagingAuthFailure(request: Request, env: WorkerEnv): Response | null {
  const expected = typeof env['STAGING_BASIC_AUTH'] === 'string' ? env['STAGING_BASIC_AUTH'] : '';
  if (!expected) return null;
  const header = request.headers.get('Authorization') ?? '';
  // La ruta de administración usa su propio token (Bearer); igual exige el acceso de staging aparte.
  const provided = header.startsWith('Basic ') ? safeAtob(header.slice(6)) : (request.headers.get('X-Staging-Auth') ?? '');
  if (sameToken(provided, expected)) return null;
  return new Response('Entorno de pruebas privado.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="staging", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

function safeAtob(value: string): string {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'X-Robots-Tag': 'noindex, nofollow',
};

function withSecurityHeaders(response: Response): Response {
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  return out;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return withSecurityHeaders(await route(request, env));
  },
};

async function route(request: Request, env: WorkerEnv): Promise<Response> {
  const denied = stagingAuthFailure(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  if (url.pathname === '/api/admin/routes') return handleAdmin(request, env);
  if (url.pathname === '/api/route') {
    if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });
    const config = readServerConfig(stringEnv(env)); // en cada solicitud
    const budget = budgetGate(env);
    const deps = {
      config: {
        routesEnabled: config.routesEnabled,
        originSalt: config.originSalt,
      },
      budget,
      provider: providerFor(config, budget),
      dedupeScope: env.ROUTE_BUDGET,
    };
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const result = await handleRouteRequest(
      body,
      {
        clientId: request.headers.get('X-Client-Id'),
        ip: request.headers.get('CF-Connecting-IP'),
      },
      deps,
    );
    return Response.json(result.json, {
      status: result.httpStatus,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return env.ASSETS.fetch(request);
}
