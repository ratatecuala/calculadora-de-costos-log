/**
 * Proveedor SIMULADO (A-43). Devuelve distancias y tiempos deterministas a partir del
 * texto de las direcciones. NO son datos reales: cada respuesta lleva `source: "simulado"`
 * y la interfaz lo muestra en cada resultado.
 */
import type { Leg, RouteRequestInput, RouteResult, RouteWarning } from '../../shared/route';
import { buildWaypoints } from '../../shared/waypoints';
import type { ProviderOutcome, RouteProvider } from './types';

export interface MockProviderOptions {
  /** Falla las primeras N llamadas con un error reintentable (para pruebas). */
  failFirst?: number;
  /** Falla siempre con un error no reintentable (para pruebas). */
  failPermanently?: boolean;
  clock?: () => Date;
}

export class MockRouteProvider implements RouteProvider {
  readonly name = 'simulado' as const;
  calls = 0;
  private failuresLeft: number;

  constructor(private readonly options: MockProviderOptions = {}) {
    this.failuresLeft = options.failFirst ?? 0;
  }

  async computeRoute(input: RouteRequestInput): Promise<ProviderOutcome> {
    this.calls += 1;
    if (this.options.failPermanently) return { ok: false, retryable: false, error: 'simulado: 400' };
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return { ok: false, retryable: true, error: 'simulado: 503' };
    }

    const points = buildWaypoints(input);
    const avoid = input.kind === 'evitarPeajes';
    const legs: Leg[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]!;
      const to = points[i + 1]!;
      const seed = hash(`${normalize(from.address)}>${normalize(to.address)}`);
      let distanceM = 3000 + (seed % 32000); // 3 a 35 km
      let durationS = Math.round(distanceM / 8.3) + 240; // ~30 km/h más 4 min
      if (avoid) {
        distanceM = Math.round(distanceM * 1.08) + 600;
        durationS = Math.round(durationS * 1.3);
      }
      legs.push({ from: from.role, to: to.role, distanceM, durationS });
    }

    const warnings: RouteWarning[] = [];
    for (const p of points) {
      // Simula `partialMatch`: una dirección sin comuna (sin coma) es ambigua.
      if (!p.address.includes(',') && !warnings.some((w) => w.code === 'coincidencia_parcial' && w.point === p.role)) {
        warnings.push({ code: 'coincidencia_parcial', point: p.role });
      }
    }
    if (avoid) warnings.push({ code: 'peajes_no_garantizados' });

    const route: RouteResult = {
      kind: input.kind,
      source: 'simulado',
      legs,
      totalDistanceM: legs.reduce((s, l) => s + l.distanceM, 0),
      totalDurationS: legs.reduce((s, l) => s + l.durationS, 0),
      warnings,
      computedAt: (this.options.clock?.() ?? new Date()).toISOString(),
      retention: { distance: 'sesion', duration: 'sesion' },
    };
    return { ok: true, route };
  }
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
