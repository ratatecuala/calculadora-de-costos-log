/** Contrato de intercambio de campo. Los datos identificativos se quedan en el dispositivo. */
export type Clase = 'MEDIDO' | 'COMPROBADO' | 'DECLARADO' | 'ESTIMADO' | 'SIMULADO';
export type Dato = [number, Clase] | null;
export type Uso = 'personal' | 'flete_real' | 'simulacion';
export type Modalidad = 'simplificada' | 'detallada';
export type Directa = 'peajes' | 'ayudantes' | 'otros';
export type Partida = Directa | 'combustible' | 'desgaste' | 'gastosFijos';
export type Muestra = 'validacion' | 'calibracion';
export type Base = 'neto' | 'con_iva' | null;
export type FuentePrecio = 'boleta' | 'surtidor' | 'referencia_publicada' | 'declaracion' | 'supuesto' | null;
export type TipoVehiculo = 'auto' | 'camioneta' | 'furgon' | 'camion_liviano' | 'otro';
export interface VersionMotor { etiqueta: string; sha256: string }
export interface Corte { fecha: string; odometro: number }
export interface Tiempos { km: Dato; marchaMin: Dato; esperaMin: Dato; cargaMin: Dato; descargaMin: Dato }
export interface Plan extends Tiempos {
  modalidad?: Modalidad; noAplica?: Directa[]; baseClp?: Base; ajusteHasta?: Corte | 'sin_ajuste' | null;
  muestraPrevista?: Muestra | null; resolucionKm?: Dato; incertidumbreKm?: Dato;
  kmL: Dato; precioLitro: Dato; fuentePrecio: FuentePrecio; desgasteKm: Dato; fijoHora: Dato;
  trabajoHora: Dato; ayudantes: Dato; pagoAyudante: Dato; tag: Dato; otros: Dato; margenPct: Dato; recargos: Dato; cotizado: Dato;
}
export interface Recarga { fecha: string | null; lleno: boolean; odometro: Dato; litros: Dato }
export type Recorrido = 'urbano' | 'autopista' | 'mixto' | null;
export type Carga = 'sin' | 'parcial' | 'completa' | null;
export interface Intervalo {
  vehiculo: string; registroCompleto: boolean | null; recorrido: Recorrido; carga: Carga; aire: boolean | null;
  muestra?: Muestra | null; zona?: string | null; resolucionKm?: Dato; resolucionLitros?: Dato;
  incertidumbreLitros?: Dato; recargas: Recarga[];
}
export interface Observacion extends Tiempos {
  noAplica?: Directa[]; inicio: string | null; fin?: string | null; baseClp?: Base; resolucionKm: Dato;
  odometroInicial?: Dato; odometroFinal?: Dato; incertidumbreKm?: Dato;
  tipoCarga: 'sin'|'muebles'|'mudanza'|'paquetes'|'materiales'|'otra'|null;
  recorrido: Recorrido; nivelCarga: Carga; aire: boolean | null; pesoKg: Dato; ayudantes: Dato; minutosAyudantes: Dato;
  equipo:'ninguno'|'carro'|'rampa'|'elevador'|'varios'|'otro'|null;
  precioLitro: Dato; fuentePrecio: FuentePrecio; cobrado: Dato;
  comprobantes: {ref:string; partida:Directa; clp:number}[]; cobertura:Record<Directa,'parcial'|'completa'|null>;
  intervalo: Intervalo | null; mantencion:{periodo:string;gastoClp:Dato;kmPeriodo:Dato}|null;
  fijos:{periodo:string;gastoClp:Dato;horasProductivas:Dato}|null;
}
export interface Ficha { uso:Uso; vehiculo:string; tipoVehiculo:TipoVehiculo; plan:Plan; observacion:Observacion }
export interface ResultadoMotor {
  partidas:Record<Partida|'remuneracion',number|null>; costoClp:number|null; sugeridoClp:number|null;
  evidencia:'SIMULADO'|'ESTIMADO'; faltan:string[]; litrosEstimados:number|null; tipo:'estimado'|'cotaInferior'; coberturaEconomica?:string;
}
export interface Presupuesto {
  version:1|2|3; id:string; uso:Uso; vehiculo:string; tipoVehiculo:TipoVehiculo; fecha:string;
  versionMotor?:VersionMotor; plan:Plan; resultado:ResultadoMotor;
}
export interface Original {datos:Presupuesto; sha256:string}
export interface ViajeExportado { id:string; ficha:Ficha; original:Original|null }
export interface Paquete {formato:1; viajes:ViajeExportado[]; sha256:string}
