import type { Waypoint } from './waypoints';

/**
 * Enlace «Ver ruta en Google Maps» (Maps URLs). No usa API ni clave y no consume cupo.
 * Se construye solo con las direcciones que escribió el usuario.
 * La ruta que muestre Google Maps puede diferir de la usada en el cálculo.
 */
export function googleMapsDirectionsUrl(points: Waypoint[]): string | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const middle = points.slice(1, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: first.address,
    destination: last.address,
    travelmode: 'driving',
  });
  if (middle.length > 0) params.set('waypoints', middle.map((p) => p.address).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
