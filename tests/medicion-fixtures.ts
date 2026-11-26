/** Fixtures FICTICIOS de la herramienta de medición (sin patentes, nombres ni domicilios). */
import { procedencia } from '../src/shared/procedencia';
import type { CargaCombustible, Tramo, VehiculoMedicion, Viaje } from '../src/medicion/modelo';

export const T0 = '2026-11-20T08:00:00.000-03:00';

export function vehiculo(over: Partial<VehiculoMedicion> = {}): VehiculoMedicion {
  return {
    id: 'v-1',
    formato: 1,
    alias: 'veh-001',
    tipoVehiculo: 'auto',
    combustible: 'gasolina',
    resolucionTripKm: 0.1,
    resolucionOdometroKm: 1,
    capacidadEstanqueL: null,
    porDefecto: {
      precioLitro: { valor: 1290, procedencia: procedencia('comprobado', 'vehiculo', null, '2026-11-19'), fuentePrecio: 'boleta' },
      kmL: { valor: 12.4, procedencia: procedencia('declarado', 'vehiculo') },
      desgasteKm: { valor: null, procedencia: procedencia('faltante', 'vehiculo') },
      fijoHora: { valor: null, procedencia: procedencia('faltante', 'vehiculo') },
      trabajoHora: { valor: null, procedencia: procedencia('faltante', 'vehiculo') },
    },
    creadoEl: T0,
    editadoEl: T0,
    ...over,
  };
}

export function viaje(over: Partial<Viaje> = {}): Viaje {
  const tramos: Tramo[] = [{ tipo: 'marcha', inicio: T0, fin: '2026-11-20T08:40:00.000-03:00' }];
  return {
    id: 'via-1',
    formato: 1,
    codigo: 'viaje-001',
    vehiculoId: 'v-1',
    presupuestoId: null,
    uso: 'personal',
    estado: 'cerrado',
    inicio: T0,
    fin: '2026-11-20T08:40:00.000-03:00',
    zona: 'America/Santiago',
    horaEditada: false,
    lecturas: {
      inicial: { trip: { valor: 0, clase: 'medido', fotoId: null, confirmadaEl: T0 }, odometro: null },
      final: { trip: { valor: 20.3, clase: 'medido', fotoId: null, confirmadaEl: T0 }, odometro: null },
    },
    tripReiniciadoKm: null,
    tramos,
    recorrido: 'mixto',
    nivelCarga: 'sin',
    aire: false,
    comprobantes: [],
    cobertura: { peajes: null, ayudantes: null, otros: null },
    creadoEl: T0,
    editadoEl: T0,
    ...over,
  };
}

let n = 0;
export function carga(fechaHora: string, litros: number, odometro: number | null, lleno: boolean, over: Partial<CargaCombustible> = {}): CargaCombustible {
  n++;
  return {
    id: `c-${n}`,
    formato: 1,
    vehiculoId: 'v-1',
    fechaHora,
    litros,
    precioLitro: 1290,
    totalClp: Math.round(litros * 1290),
    totalEditado: false,
    fuentePrecio: 'boleta',
    odometro,
    lleno,
    referencia: null,
    cierreIntervalo: null,
    creadoEl: `2026-11-01T00:00:${String(n % 60).padStart(2, '0')}.000-03:00`,
    editadoEl: fechaHora,
    ...over,
  };
}
