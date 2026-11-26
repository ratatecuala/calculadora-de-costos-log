/**
 * Motor económico puro (docs/03-motor-de-costos.md). Sin red, DOM ni base de datos.
 * Montos en CLP con precisión completa: el redondeo se hace solo al mostrar (§3C).
 */

/** D = desembolso; W = desgaste; CF = gastos fijos asignados; R = remuneración objetivo (meta). */
export type ItemCategory = 'desembolso' | 'desgaste' | 'fijo' | 'remuneracion';

/** Identificadores estables de las partidas que arma `buildCostItems`. */
export type ItemId = 'combustible' | 'peajes' | 'ayudantes' | 'otros' | 'desgaste' | 'gastosFijos' | 'remuneracion';

export interface CostItem {
  id: ItemId | string;
  label: string;
  category: ItemCategory;
  /** `null` = dato faltante (nunca se reemplaza por 0). 0 solo si el usuario lo declaró. */
  amount: number | null;
  /**
   * `true` si el dato declarado era inválido (negativo o no numérico) y por eso se trata
   * como faltante (C-1, A-50). La interfaz lo avisa: no se oculta en silencio.
   */
  invalid?: boolean;
}

/** §3C: un valor con faltantes es una cota, no una estimación. */
export type BoundType = 'estimado' | 'cotaInferior' | 'cotaSuperior';

export interface Bounded {
  /** Valor interno sin redondear. */
  value: number;
  type: BoundType;
  missing: string[];
}

export interface Measures {
  D: Bounded;
  W: Bounded;
  CF: Bounded;
  R: Bounded;
  /** Costo del viaje C = D + W + CF + R. */
  cost: Bounded;
  /** Precio sugerido ⌈C/(1−m) + recargos⌉₁₀₀₀ (ya redondeado por política). */
  suggested: Bounded;
  /** Resultados sobre el precio elegido P (si hay P). */
  afterTrip: Bounded | null; // P − D
  afterAllCosts: Bounded | null; // P − D − W − CF
  overGoal: Bounded | null; // P − C
  complete: boolean;
  missing: string[];
}
