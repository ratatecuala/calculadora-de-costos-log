/**
 * Adaptador de Google Routes (Essentials). NO ESTÁ CONECTADO en este PR:
 * solo se crea si la configuración lo habilita explícitamente y existe una clave
 * de servidor (ver src/server/config.ts). Las pruebas usan un `fetch` falso.
 *
 * La clave viaja solo en la cabecera hacia Google y nunca se incluye en respuestas.
 */
import type { Leg, PointRole, RouteRequestInput, RouteResult, RouteWarning } from '../../shared/route';
import { buildWaypoints } from '../../shared/waypoints';
import type { ProviderOutcome, RouteProvider } from '../providers/types';
import { ESSENTIALS_FIELD_MASK, ROUTES_ENDPOINT, assertEssentialsOnly, buildComputeRoutesBody } from './template';

export interface GoogleProviderOptions {
  apiKey: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
  clock?: () => Date;
}

interface GoogleLeg {
  distanceMeters?: number;
  duration?: string;
}
interface GoogleResponse {
  routes?: Array<{ legs?: GoogleLeg[] }>;
  geocodingResults?: {
    origin?: { partialMatch?: boolean };
    destination?: { partialMatch?: boolean };
    intermediates?: Array<{ partialMatch?: boolean }>;
  };
}

export class GoogleRoutesProvider implements RouteProvider {
  readonly name = 'google' as const;

  constructor(private readonly options: GoogleProviderOptions) {
    if (!options.apiKey) throw new Error('Falta la clave de servidor de Google Routes');
  }

  async computeRoute(input: RouteRequestInput): Promise<ProviderOutcome> {
    const body = buildComputeRoutesBody(input);
    // Barrera final: nada que no sea Essentials sale del servidor.
    assertEssentialsOnly(body as unknown as Record<string, unknown>, ESSENTIALS_FIELD_MASK);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
    let response: Response;
    try {
      response = await this.options.fetchImpl(ROUTES_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.options.apiKey,
          'X-Goog-FieldMask': ESSENTIALS_FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, retryable: true, error: 'google: sin respuesta' };
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 500) return { ok: false, retryable: true, error: `google: ${response.status}` };
    if (!response.ok) return { ok: false, retryable: false, error: `google: ${response.status}` };

    const data = (await response.json()) as GoogleResponse;
    const points = buildWaypoints(input);
    const googleLegs = data.routes?.[0]?.legs ?? [];
    if (googleLegs.length !== points.length - 1) {
      return { ok: false, retryable: false, error: 'google: tramos inesperados' };
    }
    const legs: Leg[] = googleLegs.map((leg, i) => ({
      from: points[i]!.role,
      to: points[i + 1]!.role,
      distanceM: Math.max(0, Math.round(leg.distanceMeters ?? 0)),
      durationS: parseDuration(leg.duration),
    }));
    if (legs.some((l) => l.distanceM <= 0)) return { ok: false, retryable: false, error: 'google: tramo sin distancia' };

    const warnings: RouteWarning[] = [];
    const partial = (role: PointRole, flag?: boolean) => {
      if (flag) warnings.push({ code: 'coincidencia_parcial', point: role });
    };
    partial(points[0]!.role, data.geocodingResults?.origin?.partialMatch);
    partial(points[points.length - 1]!.role, data.geocodingResults?.destination?.partialMatch);
    data.geocodingResults?.intermediates?.forEach((g, i) => partial(points[i + 1]!.role, g.partialMatch));
    if (input.kind === 'evitarPeajes') warnings.push({ code: 'peajes_no_garantizados' });

    const route: RouteResult = {
      kind: input.kind,
      source: 'google',
      legs,
      totalDistanceM: legs.reduce((s, l) => s + l.distanceM, 0),
      totalDurationS: legs.reduce((s, l) => s + l.durationS, 0),
      warnings,
      computedAt: (this.options.clock?.() ?? new Date()).toISOString(),
      // Restricción conocida de Google (docs/11): km y minutos no se guardan de forma permanente.
      retention: { distance: 'sesion', duration: 'sesion' },
    };
    return { ok: true, route };
  }
}

function parseDuration(value: string | undefined): number {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value ?? '');
  return match ? Math.round(Number(match[1])) : 0;
}
