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
export class InvalidTripInputError extends Error {}

/** Un dato opcional declarado es válido si es finito y ≥ 0 (o si falta). */
function isValidDeclared(v: number | null): boolean {
  return v === null || (Number.isFinite(v) && v >= 0);
}

/** Un dato opcional inválido no es un dato: se trata como faltante (null), nunca como 0 (C-1, A-50). */
function declared(v: number | null): number | null {
  return isValidDeclared(v) ? v : null;
}

export function buildCostItems(km: number, driveMinutes: number, p: TripParams): CostItem[] {
  // Datos requeridos: si son inválidos se rechazan (C-1, A-50). La interfaz ya los valida.
  const required: [string, number][] = [
    ['km', km],
    ['minutos', driveMinutes],
    ['ayudantes', p.helpers],
    ['carga y descarga', p.loadMinutes],
  ];
  for (const [name, v] of required) {
    if (!Number.isFinite(v) || v < 0) throw new InvalidTripInputError(`${name} debe ser un número mayor o igual a 0`);
  }
  const hours = (driveMinutes + p.loadMinutes) / 60;
  const kmPerL = declared(p.kmPerL);
  const fuelPrice = declared(p.fuelPricePerL);
  const fuel = kmPerL !== null && kmPerL > 0 && fuelPrice !== null ? (km / kmPerL) * fuelPrice : null;
  const helperFee = declared(p.helperFee);
  const helpers = p.helpers === 0 ? 0 : helperFee === null ? null : p.helpers * helperFee;
  const wearPerKm = declared(p.wearPerKm);
  const fixedPerHour = declared(p.fixedPerHour);
  const ownerPerHour = declared(p.ownerPerHour);
  /** Marca la partida si alguno de sus datos declarados era inválido. */
  const flag = (...values: (number | null)[]) => (values.every(isValidDeclared) ? {} : { invalid: true });
  return [
    { id: 'combustible', label: 'Combustible', category: 'desembolso', amount: fuel, ...flag(p.kmPerL, p.fuelPricePerL) },
    { id: 'peajes', label: 'Peajes y TAG', category: 'desembolso', amount: declared(p.tolls), ...flag(p.tolls) },
    { id: 'ayudantes', label: 'Ayudantes', category: 'desembolso', amount: helpers, ...(p.helpers > 0 ? flag(p.helperFee) : {}) },
    { id: 'otros', label: 'Otros gastos', category: 'desembolso', amount: declared(p.otherCosts), ...flag(p.otherCosts) },
    { id: 'desgaste', label: 'Desgaste del vehículo', category: 'desgaste', amount: wearPerKm === null ? null : km * wearPerKm, ...flag(p.wearPerKm) },
    { id: 'gastosFijos', label: 'Parte de tus gastos fijos', category: 'fijo', amount: fixedPerHour === null ? null : fixedPerHour * hours, ...flag(p.fixedPerHour) },
    {
      id: 'remuneracion',
      label: 'Lo que quieres ganar por tu trabajo',
      category: 'remuneracion',
      amount: ownerPerHour === null ? null : ownerPerHour * hours,
      ...flag(p.ownerPerHour),
    },
  ];
}
