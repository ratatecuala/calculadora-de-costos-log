/**
 * Herramienta privada de medición (A-90, Frente A; diseño en docs/29, implementación en docs/31).
 *
 * Modelo de datos del módulo. Es PROPIO del módulo: no reutiliza `VehicleProfile` ni nada de la app
 * comercial (D-4). Todos los datos viven solo en el dispositivo (IndexedDB, D-2) y no llegan a la
 * cotización, el PDF, WhatsApp, el enlace público ni Supabase.
 *
 * Reglas:
 * - `null` = DATO FALTANTE; nunca se reemplaza por 0. Un 0 es un valor declarado.
 * - Los registros se agregan o se anulan; un presupuesto sellado nunca se edita.
 * - Solo alias (`veh-001`, `viaje-001`, `doc-001-01`): sin patentes, nombres ni domicilios.
 */
import type { ClaseDato, Procedencia } from '../shared/procedencia';

export const FORMATO_REGISTRO = 1 as const;

export type TipoVehiculo = 'auto' | 'camioneta' | 'furgon' | 'camion_liviano' | 'otro';
export type Combustible = 'gasolina' | 'diesel' | 'otro';
export type FuentePrecio = 'boleta' | 'surtidor' | 'declaracion' | 'referencia_publicada' | 'supuesto';
export type Uso = 'personal' | 'simulacion';
export type Instrumento = 'trip' | 'odometro';
export type TipoEvento = 'marcha' | 'espera' | 'carga' | 'descarga' | 'pausa';
export type Recorrido = 'urbano' | 'autopista' | 'mixto';
export type NivelCarga = 'sin' | 'parcial' | 'completa';
export type Directa = 'peajes' | 'ayudantes' | 'otros';
export type Muestra = 'calibracion' | 'validacion';

/** Un valor con su procedencia (contrato único de `src/shared/procedencia.ts`). */
export interface DatoMedicion {
  valor: number | null;
  procedencia: Procedencia;
}

/** Valores por defecto del plan que el vehículo aporta al presupuesto nuevo, cada uno con su procedencia. */
export interface PorDefectoVehiculo {
  precioLitro: DatoMedicion & { fuentePrecio: FuentePrecio | null };
  kmL: DatoMedicion;
  desgasteKm: DatoMedicion;
  fijoHora: DatoMedicion;
  trabajoHora: DatoMedicion;
}

export interface VehiculoMedicion {
  id: string;
  formato: typeof FORMATO_REGISTRO;
  /** Alias `veh-NNN`. Sin patente ni datos personales. */
  alias: string;
  tipoVehiculo: TipoVehiculo;
  combustible: Combustible;
  /** Resolución del TRIP (p. ej., 0,1 km). `null` = no tiene TRIP o no se sabe. */
  resolucionTripKm: number | null;
  /** Resolución del odómetro (p. ej., 1 km). */
  resolucionOdometroKm: number | null;
  /** Resolución de la lectura de litros del surtidor (p. ej., 0,01 L). Ausente o `null` = no se sabe. */
  resolucionLitros?: number | null;
  /** Capacidad del estanque en litros (opcional; solo para avisar). */
  capacidadEstanqueL: number | null;
  porDefecto: PorDefectoVehiculo;
  creadoEl: string;
  editadoEl: string;
}

/**
 * Contrato publicado y auditado de Codex (#55, `src/shared/campo/`, 89c9139): el plan, el presupuesto
 * sellado (`Presupuesto`), su sobre (`Original`) y las tuplas `[valor, CLASE]` son SUS tipos; la
 * herramienta no define otros.
 */
export type { Clase as ClaseCampo, Dato as DatoCampo, Plan as PlanCampo, Presupuesto as DatosPresupuesto, VersionMotor, Modalidad, Base, Corte } from '../shared/campo/index.js';
import type { Presupuesto, Base } from '../shared/campo/index.js';

/** Metadata PROPIA de la herramienta: va FUERA del original sellado (el validador de #55 es estricto). */
export interface MetaPresupuesto {
  /** Procedencia por parámetro del plan (A-88). */
  procedencia: Record<string, Procedencia>;
  origen: OrigenPresupuesto;
}

export type OrigenPresupuesto =
  | { tipo: 'nuevo' }
  | { tipo: 'cotizacion'; schemaVersion: 1 | 2 | 3; folio: string | null; ficticia: boolean };

/** Formato del registro de presupuesto: 2 = original del contrato de #55 + metadata aparte. */
export const FORMATO_PRESUPUESTO = 2 as const;

interface EstadoSello {
  estado: 'sellado' | 'anulado';
  anuladoEl: string | null;
  motivoAnulacion: string | null;
  /** Id del presupuesto que este reemplaza, si corrige uno anterior. */
  reemplazaA: string | null;
  creadoEl: string;
  editadoEl: string;
}

/**
 * Presupuesto sellado con el contrato de #55. `datos` y `sha256` son EXACTAMENTE el `Original` que
 * entregó `envolverOriginal(crearPresupuesto(...))`: nunca se editan ni se vuelven a sellar.
 */
export interface PresupuestoSellado extends EstadoSello {
  id: string;
  formato: typeof FORMATO_PRESUPUESTO;
  vehiculoId: string;
  datos: Presupuesto;
  sha256: string;
  meta: MetaPresupuesto;
}

/**
 * Presupuesto del FORMATO ANTERIOR (registro `formato: 1`, `datos.version: 2` con `procedencia` y `origen`
 * dentro de lo sellado). Se conserva tal cual, con su huella original: no se migra ni se vuelve a sellar,
 * y queda «formato anterior, no comparable» (el validador estricto de #55 no lo admite).
 */
export interface PresupuestoAnterior extends EstadoSello {
  id: string;
  formato: 1;
  vehiculoId: string;
  datos: {
    version: 2;
    id: string;
    uso: Uso;
    vehiculo: string;
    tipoVehiculo: TipoVehiculo;
    fecha: string;
    resultado: { costoClp: number | null; tipo: string } | null;
    [k: string]: unknown;
  };
  sha256: string;
}

export type PresupuestoLocal = PresupuestoSellado | PresupuestoAnterior;
export const esAnterior = (p: PresupuestoLocal): p is PresupuestoAnterior => p.formato === 1;

export type BaseClp = Base;

export interface Lectura {
  valor: number;
  clase: Extract<ClaseDato, 'medido' | 'declarado'>;
  fotoId: string | null;
  confirmadaEl: string;
}

export interface LecturasMomento {
  trip: Lectura | null;
  odometro: Lectura | null;
}

export interface Tramo {
  tipo: TipoEvento;
  inicio: string;
  fin: string | null;
}

export interface Comprobante {
  ref: string;
  partida: Directa;
  clp: number;
}

export interface Viaje {
  id: string;
  formato: typeof FORMATO_REGISTRO;
  /** Código `viaje-NNN`; si hay presupuesto, es el mismo del sello. */
  codigo: string;
  vehiculoId: string;
  presupuestoId: string | null;
  uso: Uso;
  estado: 'en curso' | 'cerrado' | 'anulado';
  /** ISO con desfase de la zona (p. ej., 2026-11-26T08:30:00.000-03:00). */
  inicio: string;
  fin: string | null;
  /** Zona IANA del dispositivo al iniciar (p. ej., America/Santiago). `null` si no se conoce. */
  zona: string | null;
  /** `true` si alguna hora se escribió después (no la tomó el reloj en el momento). */
  horaEditada: boolean;
  lecturas: { inicial: LecturasMomento; final: LecturasMomento };
  /** Si el TRIP se reinició durante el viaje: km que el usuario declara. */
  tripReiniciadoKm: number | null;
  tramos: Tramo[];
  recorrido: Recorrido | null;
  nivelCarga: NivelCarga | null;
  aire: boolean | null;
  comprobantes: Comprobante[];
  cobertura: Record<Directa, 'parcial' | 'completa' | null>;
  /** Base tributaria de los importes observados (neto o con IVA). Ausente o `null` = DATO FALTANTE. */
  baseClp?: BaseClp;
  /** Partidas directas que el usuario confirma que NO aplican a este viaje (≠ desconocidas, ≠ cero). */
  noAplica?: Directa[];
  /**
   * El usuario no usó los botones de estado y DECLARA que todo el viaje fue marcha (sin espera, carga ni
   * descarga). Los minutos quedan DECLARADO, nunca MEDIDO.
   */
  soloMarchaDeclarada?: boolean;
  /** Incertidumbre absoluta de los km del viaje que declara el usuario. Ausente o `null` = DATO FALTANTE. */
  incertidumbreKm?: number | null;
  creadoEl: string;
  editadoEl: string;
}

export interface CierreIntervalo {
  muestra: Muestra | null;
  recorrido: Recorrido | null;
  carga: NivelCarga | null;
  aire: boolean | null;
  registroCompleto: boolean | null;
  /** Incertidumbre del total de litros del intervalo (incluye la variación del llenado), declarada. */
  incertidumbreLitros?: number | null;
  /** Incertidumbre de los km del intervalo, declarada. */
  incertidumbreKm?: number | null;
}

export interface CargaCombustible {
  id: string;
  formato: typeof FORMATO_REGISTRO;
  vehiculoId: string;
  fechaHora: string;
  litros: number;
  precioLitro: number | null;
  /** Total pagado: automático (litros × $/L), editable si la boleta difiere. */
  totalClp: number | null;
  totalEditado: boolean;
  fuentePrecio: Extract<FuentePrecio, 'boleta' | 'surtidor' | 'declaracion'> | null;
  odometro: number | null;
  lleno: boolean;
  referencia: string | null;
  /** Solo en una carga llena que cierra un intervalo lleno a lleno (opcional, calibración controlada). */
  cierreIntervalo: CierreIntervalo | null;
  creadoEl: string;
  editadoEl: string;
}

export interface FotoLectura {
  id: string;
  viajeId: string;
  blob: Blob;
  creadoEl: string;
}

/** Umbrales de aviso (D-6): vacíos por defecto = desactivados. Ninguno tiene valor sin fuente. */
export interface Umbrales {
  velocidadMediaKmH: number | null;
  desvioKmPct: number | null;
  viajeAbiertoHoras: number | null;
}

export interface Ajustes {
  id: 'ajustes';
  formato: typeof FORMATO_REGISTRO;
  umbrales: Umbrales;
  /** Cada cuántos días recordar la copia. `null` = sin recordatorio (solo se muestra la antigüedad). */
  recordatorioCopiaDias: number | null;
  ultimaCopia: string | null;
  editadoEl: string;
}

export const AJUSTES_INICIALES: Omit<Ajustes, 'editadoEl'> = {
  id: 'ajustes',
  formato: FORMATO_REGISTRO,
  umbrales: { velocidadMediaKmH: null, desvioKmPct: null, viajeAbiertoHoras: null },
  recordatorioCopiaDias: null,
  ultimaCopia: null,
};

export const DIRECTAS: Directa[] = ['peajes', 'ayudantes', 'otros'];

export function nuevoId(): string {
  return crypto.randomUUID();
}
