/**
 * Plantilla FIJA de Google Routes `computeRoutes`, solo SKU Essentials (A-41).
 *
 * Toda solicitud se construye aquí y pasa por `assertEssentialsOnly` ANTES de salir.
 * Cualquier campo fuera de la lista blanca, opción de tráfico (Pro) o de peajes
 * (Enterprise) se rechaza sin llamar a Google.
 */
import type { RouteRequestInput } from '../../shared/route';
import { buildWaypoints } from '../../shared/waypoints';

export const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/** Field mask fija: solo distancia, duración y resultado de geocodificación. */
export const ESSENTIALS_FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.legs.distanceMeters',
  'routes.legs.duration',
  'geocodingResults',
].join(',');

export interface ComputeRoutesBody {
  origin: { address: string };
  destination: { address: string };
  intermediates?: Array<{ address: string }>;
  travelMode: 'DRIVE';
  routingPreference: 'TRAFFIC_UNAWARE';
  routeModifiers?: { avoidTolls: boolean };
  languageCode: 'es-419';
  regionCode: 'CL';
  units: 'METRIC';
}

const ALLOWED_TOP_LEVEL = new Set([
  'origin',
  'destination',
  'intermediates',
  'travelMode',
  'routingPreference',
  'routeModifiers',
  'languageCode',
  'regionCode',
  'units',
]);
const ALLOWED_MODIFIERS = new Set(['avoidTolls']);
const MAX_INTERMEDIATES = 2;

export type Sku = 'essentials' | 'pro' | 'enterprise';

export class SkuNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkuNotAllowedError';
  }
}

export function buildComputeRoutesBody(input: RouteRequestInput): ComputeRoutesBody {
  const points = buildWaypoints(input);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const middle = points.slice(1, -1);
  const body: ComputeRoutesBody = {
    origin: { address: first.address },
    destination: { address: last.address },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    languageCode: 'es-419',
    regionCode: 'CL',
    units: 'METRIC',
  };
  if (middle.length > 0) body.intermediates = middle.map((p) => ({ address: p.address }));
  if (input.kind === 'evitarPeajes') body.routeModifiers = { avoidTolls: true };
  return body;
}

/**
 * Clasifica el SKU que facturaría Google según las funciones pedidas
 * (docs/02 §8.2 R7). Conservador: ante la duda, el SKU más caro.
 */
export function classifySku(body: Record<string, unknown>, fieldMask: string): Sku {
  const mask = fieldMask.toLowerCase();
  const extra = body['extraComputations'];
  if (
    (Array.isArray(extra) && extra.length > 0) ||
    mask.includes('tollinfo') ||
    mask.includes('extracomputations')
  ) {
    return 'enterprise';
  }
  const pref = body['routingPreference'];
  const intermediates = body['intermediates'];
  if (
    (pref !== undefined && pref !== 'TRAFFIC_UNAWARE' && pref !== 'ROUTING_PREFERENCE_UNSPECIFIED') ||
    body['optimizeWaypointOrder'] === true ||
    (Array.isArray(intermediates) && intermediates.length > 10) ||
    mask.includes('travelAdvisory'.toLowerCase()) ||
    mask.includes('speedreadingintervals')
  ) {
    return 'pro';
  }
  return 'essentials';
}

/** Lanza SkuNotAllowedError si la solicitud no es exactamente la plantilla Essentials. */
export function assertEssentialsOnly(body: Record<string, unknown>, fieldMask: string): void {
  const sku = classifySku(body, fieldMask);
  if (sku !== 'essentials') throw new SkuNotAllowedError(`SKU ${sku} bloqueado`);
  if (fieldMask !== ESSENTIALS_FIELD_MASK) throw new SkuNotAllowedError('Field mask distinta de la plantilla');
  for (const key of Object.keys(body)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) throw new SkuNotAllowedError(`Campo no permitido: ${key}`);
  }
  if (body['travelMode'] !== 'DRIVE') throw new SkuNotAllowedError('travelMode no permitido');
  if (body['routingPreference'] !== 'TRAFFIC_UNAWARE') throw new SkuNotAllowedError('routingPreference no permitido');
  const intermediates = body['intermediates'];
  if (intermediates !== undefined && (!Array.isArray(intermediates) || intermediates.length > MAX_INTERMEDIATES)) {
    throw new SkuNotAllowedError('Demasiados puntos intermedios');
  }
  const modifiers = body['routeModifiers'];
  if (modifiers !== undefined) {
    if (typeof modifiers !== 'object' || modifiers === null) throw new SkuNotAllowedError('routeModifiers inválido');
    for (const key of Object.keys(modifiers)) {
      if (!ALLOWED_MODIFIERS.has(key)) throw new SkuNotAllowedError(`Modificador no permitido: ${key}`);
    }
  }
}
