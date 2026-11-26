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
export interface Completitud {presentes:number; total:number; faltan:string[]}
export interface ImpactoEspera {minutos:number|null; fijosClp:number|null; metaTrabajoClp:number|null; potencialClp:number|null; evidencia:string}
export interface ComparacionPartida {original:Diferencia; recalculado:Diferencia; evidencia?:string}
export interface GrupoConsumo {
  uso:Ficha['uso']; vehiculo:string; tipoVehiculo:Ficha['tipoVehiculo']; recorrido:Intervalo['recorrido']; carga:Intervalo['carga']; aire:boolean|null;
  muestra:string; n:number; mediaKmL:number; desviacionMuestralKmL:number|null; coeficienteVariacionPct:number|null;
  desviacionMaximaKmL:number; desviacionMaximaPct:number; estado:string; evidencia:string;
}
export interface Informe {
  vehiculo:string; tipoVehiculo:Ficha['tipoVehiculo']; contexto:string; fechaPresupuesto:string|null;
  entradasOriginales:Plan|null; versionMotorOriginal:VersionMotor|null; observacion:Observacion;
  esperaFueraDelMotor:{original:ImpactoEspera|null;observada:ImpactoEspera}; coberturaCostoEconomico:{original:string;recalculado:string};
  comparacionClp:Record<Partida,ComparacionPartida>; completitud:{plan:Completitud|null;observacion:Completitud};
  precios:{sugerido:number|null;cotizado:Plan['cotizado'];cobrado:Observacion['cobrado'];cotizadoVsCobrado:Diferencia}|null;
  uso:Ficha['uso'];estadoPresupuesto:string;presupuestoOriginal:Presupuesto['resultado']|null;recalculado:Presupuesto['resultado']|null;
  variacionCostoModelado:Diferencia & {motores:string;uso:string;versionActual:VersionMotor|null};
  conciliacionIndependiente:{alcance:string;aprobacion:string;subtotalPrevistoClp:number|null;subtotalReferenciaClp:number|null;modalidad:string;estado:string;partidas:Record<Partida,Linea>;faltan:string[];motivos:string[];totalComparable:Diferencia|null;objetivoMaximoPct:number;errorAbsolutoPct:number|null};
  referencias:{rendimientoMedidoIntervaloKmL:number|null;claseComparable:boolean;rendimientoKmL:Diferencia & {evidencia:string};desgasteClpKm:number|null;fijoClpHora:number|null;precioLitro:Observacion['precioLitro'];fuentePrecio:Observacion['fuentePrecio'];intervalo:Vinculo;litrosAsignadosEstimados:number|null;incertidumbreCombustible:{entradas:{kmViaje:number|null;litrosIntervalo:number|null;kmIntervalo:number|null};faltan:string[];litros:Rango|null;combustibleClp:Rango|null}};
  gastosDelViaje:{subtotalClp:number|null;evidencia:string;porPartida:Record<'peajes'|'ayudantes'|'otros',{clp:number|null;cobertura:'completa'|'parcial'|null}>};recorrido:Record<string,Diferencia & {evidencia?:string}>;
}
export interface Rango {inferior:number|null;superior:number|null}
export function compararFicha(ficha:Ficha,sello:Presupuesto|null,ultimoAjuste?:Ajuste,versionMotorActual?:VersionMotor|null):Informe;
export function medirIntervalo(i:Intervalo|null):Medicion|null;
export function vincularIntervalo(o:Observacion,p:Plan|undefined,vehiculo:string,ajuste?:Ajuste):Vinculo;
export function resumenClases(fichas:Ficha[]):{objetivoErrorEconomicoPct:number;umbrales:string;incompletos:number;repetidos:number;grupos:GrupoConsumo[]};
export function revisarReferencias(ficha:Ficha,otrasFichas:Ficha[]):Ajuste;
export function serializarCanonico(datos:unknown):string;
export function huellaCanonica(datos:unknown):Promise<string>;
export function envolverOriginal(datos:Presupuesto):Promise<Original>;
export function crearPaquete(viajes:ViajeExportado[]):Promise<Paquete>;
export function verificarPaquete(paquete:unknown):Promise<void>;
