import type { PointRole, RouteRequestInput } from './route';

export interface Waypoint {
  role: PointRole;
  address: string;
}

/** Recorrido ordenado: [Base] → A → B → [Base]. Base y regreso son opcionales. */
export function buildWaypoints(input: Pick<RouteRequestInput, 'origin' | 'destination' | 'base' | 'startAtBase' | 'returnToBase'>): Waypoint[] {
  const points: Waypoint[] = [];
  const base = input.base?.trim() ?? '';
  if (input.startAtBase && base) points.push({ role: 'base', address: base });
  points.push({ role: 'A', address: input.origin.trim() });
  points.push({ role: 'B', address: input.destination.trim() });
  if (input.returnToBase && base) points.push({ role: 'base', address: base });
  return points;
}

/** Normaliza para comparar recorridos (sesión e idempotencia); no se usa para cachear entre usuarios. */
export function routeKey(input: RouteRequestInput): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    input.kind,
    buildWaypoints(input)
      .map((w) => `${w.role}:${norm(w.address)}`)
      .join('|'),
  ].join('#');
}
