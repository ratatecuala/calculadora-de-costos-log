/**
 * Quién aporta cada dato del inventario y de los recursos (fase 1, A-66; propuesta de docs/21 §18).
 *
 * - `cliente`: datos de la CARGA y de los ACCESOS que puede informar quien solicita el flete.
 *   Una etapa posterior (NO implementada ni autorizada) podría pedírselos con un formulario.
 * - `transportista`: tiempos, ayudantes, equipamiento y montos. Son internos: **nunca** se piden
 *   ni se muestran al cliente.
 *
 * Hoy solo organiza la interfaz; no habilita formularios públicos ni recepción de datos.
 */
export type Audiencia = 'cliente' | 'transportista';

/** Campos de cada objeto del inventario (todos describen la carga). */
export const CARGO_ITEM_AUDIENCE = {
  kind: 'cliente',
  description: 'cliente',
  qty: 'cliente',
  unitWeightKg: 'cliente',
  dimsCm: 'cliente',
  volumeM3: 'cliente',
  volumeSource: 'cliente',
  fragile: 'cliente',
  handling: 'cliente',
} as const satisfies Record<string, Audiencia>;

/** Campos de cada parada: los accesos los conoce el cliente; los minutos los estima el transportista. */
export const STOP_AUDIENCE = {
  role: 'cliente',
  floor: 'cliente',
  elevator: 'cliente',
  stairs: 'cliente',
  carryMeters: 'cliente',
  access: 'cliente',
  loadMinutes: 'transportista',
} as const satisfies Record<string, Audiencia>;

/** Bloques completos de recursos: internos del transportista. */
export const RESOURCE_BLOCK_AUDIENCE = {
  helpers: 'transportista',
  equipment: 'transportista',
} as const satisfies Record<string, Audiencia>;
