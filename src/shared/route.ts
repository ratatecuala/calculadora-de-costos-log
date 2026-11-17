/**
 * Contrato compartido entre el navegador y el servidor para obtener una ruta.
 * El motor económico NO depende de este archivo: recibe solo km y minutos.
 */
import { z } from 'zod';

/** Procedencia de un dato de ruta. `simulado` nunca debe presentarse como real. */
export type RouteSource = 'simulado' | 'google' | 'declarado';

/** `habitual`: ruta normal. `evitarPeajes`: comparación opcional (1 llamada extra). */
export type RouteKind = 'habitual' | 'evitarPeajes';

export type PointRole = 'base' | 'A' | 'B';

/**
 * Retención por campo (A-38): `sesion` = solo mientras dura el cálculo en pantalla;
 * `permanente` = se puede guardar en el historial.
 */
export type Retention = 'sesion' | 'permanente';

export interface Leg {
  from: PointRole;
  to: PointRole;
  distanceM: number;
  durationS: number;
}

export type RouteWarning =
  | { code: 'coincidencia_parcial'; point: PointRole }
  | { code: 'peajes_no_garantizados' };

export interface RouteResult {
  kind: RouteKind;
  source: RouteSource;
  legs: Leg[];
  totalDistanceM: number;
  totalDurationS: number;
  warnings: RouteWarning[];
  computedAt: string;
  retention: { distance: Retention; duration: Retention };
}

export type ManualReason =
  | 'servicio_apagado'
  | 'cupo_agotado'
  | 'contador_no_disponible'
  | 'limite_usuario'
  | 'limite_comparaciones'
  | 'error_proveedor'
  | 'solicitud_invalida';

export interface QuotaInfo {
  comparisonsLeftToday: number;
  comparisonsLeftMonth: number;
}

export type RouteApiResponse =
  | { status: 'ok'; route: RouteResult; quota: QuotaInfo | null }
  | { status: 'manual'; reason: ManualReason; message: string; quota: QuotaInfo | null };

const address = z.string().trim().min(3).max(200);

export const routeRequestSchema = z
  .object({
    origin: address,
    destination: address,
    base: address.nullable().optional(),
    startAtBase: z.boolean().default(false),
    returnToBase: z.boolean().default(false),
    kind: z.enum(['habitual', 'evitarPeajes']).default('habitual'),
  })
  .strict()
  .refine((v) => !(v.startAtBase || v.returnToBase) || (v.base != null && v.base.length >= 3), {
    message: 'Falta la dirección de la base',
    path: ['base'],
  });

export type RouteRequestInput = z.infer<typeof routeRequestSchema>;

export const MANUAL_MESSAGES: Record<ManualReason, string> = {
  servicio_apagado: 'El cálculo automático de rutas está desactivado. Puedes ingresar los kilómetros y minutos de cada tramo.',
  cupo_agotado: 'El cálculo automático de rutas no está disponible por ahora. Puedes seguir ingresando los kilómetros de cada tramo.',
  contador_no_disponible: 'No pudimos verificar el cupo de consultas, así que no se consultó la ruta. Puedes ingresar los kilómetros de cada tramo.',
  limite_usuario: 'Alcanzaste el máximo de rutas automáticas por hoy. Puedes ingresar los kilómetros de cada tramo.',
  limite_comparaciones: 'Alcanzaste el máximo de comparaciones gratuitas (3 al día y 10 al mes).',
  error_proveedor: 'El servicio de rutas no respondió. Puedes ingresar los kilómetros y minutos de cada tramo.',
  solicitud_invalida: 'Revisa las direcciones: falta un dato o es demasiado corto.',
};
