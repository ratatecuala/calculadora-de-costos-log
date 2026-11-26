import type {Ficha, Presupuesto, VersionMotor, Original, Corte, Paquete, ViajeExportado, Intervalo, Plan, Observacion, Partida} from './tipos';
export type * from './tipos';
export const VERSION_MOTOR: Readonly<VersionMotor>;
export function validarFicha(ficha: Ficha): void;
export function crearPresupuesto(ficha:Ficha,id:string,fechaUtc:string,version:VersionMotor):Presupuesto;
export type Ajuste = Corte | {indeterminado:true} | null;
export interface Diferencia { previsto:number|null; referencia:number|null; diferencia:number|null; absoluta:number|null; porcentaje:number|null; sentido:string }
export interface Linea {estado:string; requerida:boolean; comparable:boolean; evidencia:string|null; presupuestoClp:number|null; referenciaClp:number|null}
export interface Medicion {km:number;litros:number;kmL:number;desde:string;hasta:string;odometroInicial:number;odometroFinal:number;incertidumbreLitros:number|null;incertidumbreKm:number|null;resolucionLitros:number|null;resolucionKm:number|null}
export interface Vinculo {medicion:Medicion|null;motivos:string[];utilizable:boolean}
export interface Informe {
  uso:Ficha['uso'];estadoPresupuesto:string;presupuestoOriginal:Presupuesto['resultado']|null;recalculado:Presupuesto['resultado']|null;
  variacionCostoModelado:Diferencia & {motores:string;uso:string};
  conciliacionIndependiente:{modalidad:string;estado:string;partidas:Record<Partida,Linea>;faltan:string[];motivos:string[];totalComparable:Diferencia|null;objetivoMaximoPct:number;errorAbsolutoPct:number|null};
  referencias:{intervalo:Vinculo;litrosAsignadosEstimados:number|null;incertidumbreCombustible:{faltan:string[];litros:Rango|null;combustibleClp:Rango|null}};
  gastosDelViaje:{subtotalClp:number|null;evidencia:string};recorrido:Record<string,Diferencia>;
}
export interface Rango {inferior:number|null;superior:number|null}
export function compararFicha(ficha:Ficha,sello:Presupuesto|null,ultimoAjuste?:Ajuste,versionMotorActual?:VersionMotor|null):Informe;
export function medirIntervalo(i:Intervalo|null):Medicion|null;
export function vincularIntervalo(o:Observacion,p:Plan|undefined,vehiculo:string,ajuste?:Ajuste):Vinculo;
export function resumenClases(fichas:Ficha[]):{incompletos:number;repetidos:number;grupos:{uso:string;vehiculo:string;tipoVehiculo:string;muestra:string;n:number;mediaKmL:number;estado:string}[]};
export function revisarReferencias(ficha:Ficha,otrasFichas:Ficha[]):Ajuste;
export function serializarCanonico(datos:unknown):string;
export function huellaCanonica(datos:unknown):Promise<string>;
export function envolverOriginal(datos:Presupuesto):Promise<Original>;
export function crearPaquete(viajes:ViajeExportado[]):Promise<Paquete>;
export function verificarPaquete(paquete:unknown):Promise<void>;
