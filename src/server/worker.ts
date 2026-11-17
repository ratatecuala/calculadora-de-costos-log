/**
 * Punto de entrada para Cloudflare Workers. ESCRITO, NO DESPLEGADO: no hay cuenta
 * autorizada (A-44). Sirve la app estática (binding ASSETS) y `/api/route`.
 * El contador vive en el Durable Object `ROUTE_BUDGET` (una sola instancia).
 */
import { DurableObjectBudgetGate, RouteBudgetDurableObject } from './budget/durableObject';
import { readServerConfig } from './config';
import { createRouteService } from './createRouteService';
import { handleRouteRequest } from './routeHandler';

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ROUTE_BUDGET: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> } };
  [key: string]: unknown;
}

export { RouteBudgetDurableObject };

// Una instancia de dependencias por isolate, para que la deduplicación de solicitudes en curso funcione.
let cachedDeps: ReturnType<typeof createRouteService> | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/route') {
      if (request.method !== 'POST') return new Response('Método no permitido', { status: 405 });
      const stringEnv = Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
      if (!cachedDeps) {
        const config = readServerConfig(stringEnv);
        const budget = new DurableObjectBudgetGate(env.ROUTE_BUDGET.get(env.ROUTE_BUDGET.idFromName('global')));
        cachedDeps = createRouteService(config, budget);
      }
      const deps = cachedDeps;
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
