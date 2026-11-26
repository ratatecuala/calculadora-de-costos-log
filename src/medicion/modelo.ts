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
  /** Capacidad del estanque en litros (opcional; solo para avisar). */
  capacidadEstanqueL: number | null;
  porDefecto: PorDefectoVehiculo;
  creadoEl: string;
  editadoEl: string;
}

/** Dato con la tupla del instrumento de Codex (#55): `[valor, CLASE]` o `null`. */
export type ClaseCampo = 'MEDIDO' | 'COMPROBADO' | 'DECLARADO' | 'ESTIMADO' | 'SIMULADO';
export type DatoCampo = [number, ClaseCampo] | null;

/** Plan en la forma exacta de `plantilla-economica.json` de #55 (sin claves extra: Codex lo valida estricto). */
export interface PlanCampo {
  baseClp: 'neto' | 'con_iva' | null;
  ajusteHasta: null;
  muestraPrevista: Muestra | null;
  resolucionKm: DatoCampo;
  incertidumbreKm: DatoCampo;
  km: DatoCampo;
  marchaMin: DatoCampo;
  esperaMin: DatoCampo;
  cargaMin: DatoCampo;
  descargaMin: DatoCampo;
  kmL: DatoCampo;
  precioLitro: DatoCampo;
  fuentePrecio: FuentePrecio | null;
  desgasteKm: DatoCampo;
  fijoHora: DatoCampo;
  trabajoHora: DatoCampo;
  ayudantes: DatoCampo;
  pagoAyudante: DatoCampo;
  tag: DatoCampo;
  otros: DatoCampo;
  margenPct: DatoCampo;
  recargos: DatoCampo;
  cotizado: DatoCampo;
}

/** Resultado del motor guardado en el sello (forma de `ResultadoMotor` de #55). */
export interface ResultadoMotorCampo {
  partidas: Record<string, number | null>;
  costoClp: number | null;
  sugeridoClp: number | null;
  evidencia: 'SIMULADO' | 'ESTIMADO';
  faltan: string[];
  litrosEstimados: number | null;
  tipo: 'estimado' | 'cotaInferior';
}

export interface VersionMotor {
  etiqueta: string;
  sha256: string;
}

/** `datos` del presupuesto original de #55 (`presupuesto-original.json`) más procedencia y origen (docs/29 §3). */
export interface DatosPresupuesto {
  version: 2;
  id: string;
  uso: Uso;
  vehiculo: string;
  tipoVehiculo: TipoVehiculo;
  fecha: string;
  versionMotor: VersionMotor | null;
  plan: PlanCampo;
  /** `null` si faltan km o minutos para que el motor calcule (nunca se calcula con ceros inventados). */
  resultado: ResultadoMotorCampo | null;
  /** Procedencia por parámetro del plan (revisión GPT, P2). Fuera de `plan` porque #55 valida `plan` estricto. */
  procedencia: Record<string, Procedencia>;
  origen: OrigenPresupuesto;
}

export type OrigenPresupuesto =
  | { tipo: 'nuevo' }
  | { tipo: 'cotizacion'; schemaVersion: 1 | 2 | 3; folio: string | null; ficticia: boolean };

export interface PresupuestoSellado {
  id: string;
  formato: typeof FORMATO_REGISTRO;
  vehiculoId: string;
  /** Inmutables: corregir = sellar otro y anular este. */
  datos: DatosPresupuesto;
  sha256: string;
  estado: 'sellado' | 'anulado';
  anuladoEl: string | null;
  motivoAnulacion: string | null;
  /** Id del presupuesto que este reemplaza, si corrige uno anterior. */
  reemplazaA: string | null;
  creadoEl: string;
  editadoEl: string;
}

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
  creadoEl: string;
  editadoEl: string;
}

export interface CierreIntervalo {
  muestra: Muestra | null;
  recorrido: Recorrido | null;
  carga: NivelCarga | null;
  aire: boolean | null;
  registroCompleto: boolean | null;
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
