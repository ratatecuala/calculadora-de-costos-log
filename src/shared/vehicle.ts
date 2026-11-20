/**
 * Perfil de vehículo del transportista («Mi vehículo»).
 * Sin valores predeterminados: si el usuario no conoce el rendimiento o el desgaste,
 * quedan en `null` y el cálculo los trata como faltantes (costo parcial).
 * El motor económico no cambia: el perfil solo llena `kmPerL` y `wearPerKm`.
 */
import { z } from 'zod';

export type VehicleType = 'camioneta' | 'furgon' | 'camionLiviano';
export type FuelType = 'gasolina' | 'diesel' | 'otro';

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  camioneta: 'Camioneta',
  furgon: 'Furgón',
  camionLiviano: 'Camión liviano',
};

export const FUEL_LABEL: Record<FuelType, string> = {
  gasolina: 'Gasolina',
  diesel: 'Diésel',
  otro: 'Otro',
};

export interface VehicleProfile {
  id: string;
  name: string;
  type: VehicleType;
  fuel: FuelType;
  /** Rendimiento en km por litro. `null` = no lo sabe. */
  kmPerL: number | null;
  /** Desgaste estimado (neumáticos, aceite, mantención), CLP por km. `null` = no lo sabe. */
  wearPerKm: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Datos que el usuario ingresa (sin id ni fechas). */
export const vehicleInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Escribe un nombre para identificar el vehículo').max(40, 'Máximo 40 caracteres'),
    type: z.enum(['camioneta', 'furgon', 'camionLiviano']),
    fuel: z.enum(['gasolina', 'diesel', 'otro']),
    kmPerL: z.number().gt(0, 'El rendimiento debe ser mayor que 0').max(100, 'Revisa el rendimiento (máximo 100 km/L)').nullable(),
    wearPerKm: z.number().min(0, 'El desgaste no puede ser negativo').max(10000, 'Revisa el desgaste (máximo $10.000 por km)').nullable(),
  })
  .strict();

export type VehicleInput = z.infer<typeof vehicleInputSchema>;

/** Copia del vehículo aplicada a una cotización (no es una referencia al perfil guardado). */
export interface AppliedVehicle {
  id: string;
  name: string;
  type: VehicleType;
  fuel: FuelType;
  kmPerL: number | null;
  wearPerKm: number | null;
}
