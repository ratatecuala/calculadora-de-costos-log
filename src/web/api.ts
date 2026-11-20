/**
 * Cliente del navegador hacia /api/route. El navegador NUNCA tiene claves de Google:
 * solo habla con nuestro servidor, que decide si consulta y con qué proveedor.
 */
import type { RouteApiResponse, RouteRequestInput } from '../shared/route';
import type { RouteClient } from './session';

const CLIENT_ID_KEY = 'cotizador.clientId';

/** Identificador anónimo del navegador (para límites por usuario). No es un dato personal. */
export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export const httpRouteClient: RouteClient = {
  async requestRoute(input: RouteRequestInput): Promise<RouteApiResponse> {
    const res = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() },
      body: JSON.stringify(input),
    });
    return (await res.json()) as RouteApiResponse;
  },
};
