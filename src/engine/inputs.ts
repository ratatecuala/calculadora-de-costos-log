import type { CostItem } from './types';

/**
 * Parámetros económicos del viaje, todos editables por el transportista.
 * `null` = no lo sabe (faltante). Ningún valor por defecto sin fuente (docs/01 §7).
 */
export interface TripParams {
  /** Precio del combustible, CLP por litro (declarado por el usuario). */
  fuelPricePerL: number | null;
  /** Rendimiento del vehículo, km por litro. */
  kmPerL: number | null;
  /** Desgaste: neumáticos, aceite y mantención, CLP por km. */
  wearPerKm: number | null;
  /** Parte de los gastos fijos asignada por hora de trabajo, CLP/h. */
  fixedPerHour: number | null;
  /** Lo que quieres ganar por tu trabajo, CLP/h (meta, no pago). */
  ownerPerHour: number | null;
  /** Número de ayudantes. */
  helpers: number;
  /** Pago por ayudante por servicio, CLP. */
  helperFee: number | null;
  /** Minutos de carga y descarga (incluye pisos), contados una sola vez. */
  loadMinutes: number;
  /** Peajes y TAG de esta ruta. `null` = no lo sabe; 0 = declaró que no hay. */
  tolls: number | null;
  /** Otros desembolsos declarados (estacionamiento, materiales), CLP. */
  otherCosts: number;
}

export const EMPTY_PARAMS: TripParams = {
  fuelPricePerL: null,
  kmPerL: null,
  wearPerKm: null,
  fixedPerHour: null,
  ownerPerHour: null,
  helpers: 0,
  helperFee: null,
  loadMinutes: 0,
  tolls: null,
  otherCosts: 0,
};

/**
 * Arma las partidas de una ruta (docs/03 §1 y §3). Cada ruta se calcula por separado
 * con sus propios km y minutos (§3E); carga y descarga, ayudantes y otros gastos
 * se cuentan una vez por ruta, nunca por tramo.
 */
export function buildCostItems(km: number, driveMinutes: number, p: TripParams): CostItem[] {
  const hours = (driveMinutes + Math.max(0, p.loadMinutes)) / 60;
  const fuel = p.kmPerL !== null && p.kmPerL > 0 && p.fuelPricePerL !== null ? (km / p.kmPerL) * p.fuelPricePerL : null;
  const helpers = p.helpers <= 0 ? 0 : p.helperFee === null ? null : p.helpers * p.helperFee;
  return [
    { id: 'combustible', label: 'Combustible', category: 'desembolso', amount: fuel },
    { id: 'peajes', label: 'Peajes y TAG', category: 'desembolso', amount: p.tolls },
    { id: 'ayudantes', label: 'Ayudantes', category: 'desembolso', amount: helpers },
    { id: 'otros', label: 'Otros gastos', category: 'desembolso', amount: Math.max(0, p.otherCosts) },
    { id: 'desgaste', label: 'Desgaste del vehículo', category: 'desgaste', amount: p.wearPerKm === null ? null : km * p.wearPerKm },
    { id: 'gastosFijos', label: 'Parte de tus gastos fijos', category: 'fijo', amount: p.fixedPerHour === null ? null : p.fixedPerHour * hours },
    {
      id: 'remuneracion',
      label: 'Lo que quieres ganar por tu trabajo',
      category: 'remuneracion',
      amount: p.ownerPerHour === null ? null : p.ownerPerHour * hours,
    },
  ];
}
