import {seguro,sumar,producto,dividir} from './numeros.js';
export {seguro,sumar,dividir} from './numeros.js';
export {medirIntervalo,vincularIntervalo} from './intervalos.js';
import { clase, partidasDirectas, valor } from './evidencia.js';
import { alcancePartida } from './alcance.js';

const observado = d => ['MEDIDO','COMPROBADO'].includes(clase(d));

export function espera(ruta,plan) {
  const minutos = valor(ruta.esperaMin);
  const horas = dividir(minutos,60);
  const porHora = d => horas === 0 ? 0 : producto(horas,valor(d));
  const incluyeFijos=alcancePartida(plan,'gastosFijos')==='incluida';
  const fijosClp = incluyeFijos ? porHora(plan?.fijoHora) : null, metaTrabajoClp = porHora(plan?.trabajoHora);
  return {minutos,fijosClp,metaTrabajoClp,potencialClp:incluyeFijos ? sumar([fijosClp,metaTrabajoClp]) : metaTrabajoClp,
    evidencia:minutos === null ? 'DATO FALTANTE' : clase(ruta.esperaMin) === 'SIMULADO' ? 'SIMULADO':'ESTIMADO'};
}

export function derivarReferencia(o,vinculo) {
  const km=valor(o.km), litros=dividir(km,vinculo.utilizable ? vinculo.medicion.kmL : null);
  const tasa=(h,k)=>dividir(valor(h?.gastoClp),valor(h?.[k]));
  const desgasteKm=tasa(o.mantencion,'kmPeriodo'), fijoHora=tasa(o.fijos,'horasProductivas');
  const tiempo=['marchaMin','cargaMin','descargaMin','esperaMin'];
  const horas=dividir(sumar(tiempo.map(k=>valor(o[k]))),60);
  const asignaciones={combustible:producto(litros,valor(o.precioLitro)),desgaste:producto(km,desgasteKm),gastosFijos:producto(horas,fijoHora)};
  const periodoVerificado=(h,k)=>clase(h?.gastoClp)==='COMPROBADO' && observado(h?.[k]);
  const incertidumbre=efectoIncertidumbre(o,vinculo);
  const calidad={
    combustible:vinculo.utilizable && observado(o.km) && observado(o.odometroInicial) && observado(o.odometroFinal)
      && observado(o.precioLitro) && o.incertidumbreKm!=null && vinculo.medicion.incertidumbreLitros!==null
      && vinculo.medicion.resolucionLitros!==null && vinculo.medicion.resolucionKm!==null && incertidumbre.litros?.superior!=null,
    desgaste:observado(o.km) && periodoVerificado(o.mantencion,'kmPeriodo'),
    gastosFijos:tiempo.every(k=>observado(o[k])) && periodoVerificado(o.fijos,'horasProductivas')
  };
  return {litros,desgasteKm,fijoHora,asignaciones,calidad,incertidumbre};
}

// Extremos deterministas de kmViaje × litrosIntervalo / kmIntervalo, sin
// hipótesis de distribución. La resolución por sí sola no fija un error.
function efectoIncertidumbre(o,v) {
  const m=v.medicion, km=valor(o.km), u=valor(o.incertidumbreKm), precio=valor(o.precioLitro);
  const entradas={kmViaje:u,litrosIntervalo:m?.incertidumbreLitros??null,kmIntervalo:m?.incertidumbreKm??null};
  const faltan=Object.keys(entradas).filter(k=>entradas[k]===null);
  if (!v.utilizable || !m || km===null || faltan.length) return {entradas,faltan,litros:null,combustibleClp:null};
  const inferior=dividir(Math.max(0,km-u)*Math.max(0,m.litros-m.incertidumbreLitros),m.km+m.incertidumbreKm);
  const superior=dividir((km+u)*(m.litros+m.incertidumbreLitros),m.km-m.incertidumbreKm);
  return {entradas,faltan,litros:{inferior,superior},combustibleClp:precio===null ? null :
    {inferior:producto(inferior,precio),superior:producto(superior,precio)}};
}

export function conciliar(f,sello,cronologia,gastos,ref,calcularDiferencia) {
  const lineas={};
  for (const k of [...partidasDirectas,...Object.keys(ref.asignaciones)]) {
    const alcance=alcancePartida(sello?.plan ?? f.plan,k), observadoNA=f.observacion.noAplica?.includes(k)===true;
    const equivalente=alcance==='excluida' || (alcance==='no aplicable')===observadoNA;
    const directo=gastos.porPartida[k];
    const anterior=sello?.resultado?.partidas[k] ?? null;
    const independiente=directo ? (directo.cobertura==='completa' ? directo.clp : null) : ref.asignaciones[k];
    const requerida=alcance==='incluida' || !equivalente;
    const comparable=requerida && equivalente && anterior!==null && independiente!==null && (directo!==undefined || ref.calidad[k]);
    const estado=!equivalente?'alcance diferente':alcance!=='incluida'?alcance:independiente===null?'desconocida':
      directo && independiente===0?(f.uso==='simulacion'?'cero simulado':'cero comprobado'):'registrada';
    lineas[k]={presupuestoClp:anterior,referenciaClp:alcance==='excluida'?null:independiente,comparable,requerida,estado,
      evidencia:!requerida?null:independiente===null?'DATO FALTANTE':f.uso==='simulacion'?'SIMULADO':directo?'COMPROBADO':'ESTIMADO'};
  }
  const faltan=Object.keys(lineas).filter(k=>lineas[k].requerida && !lineas[k].comparable);
  const motivos=[];
  if (!cronologia || !sello?.versionMotor) motivos.push('presupuesto sin cronología o versión verificable');
  if (!sello?.plan.baseClp || sello.plan.baseClp!==f.observacion.baseClp) motivos.push('base tributaria desconocida o distinta');
  if (f.uso==='simulacion') motivos.push('simulación');
  const comparables=Object.values(lineas).filter(l=>l.comparable);
  const previsto=comparables.length ? sumar(comparables.map(l=>l.presupuestoClp)) : null;
  const independiente=comparables.length ? sumar(comparables.map(l=>l.referenciaClp)) : null;
  const total=faltan.length || motivos.length ? null : calcularDiferencia(previsto,independiente);
  return {modalidad:sello?.plan.modalidad ?? (sello?'detallada':f.plan.modalidad ?? 'simplificada'),
    alcance:'costo operativo sin meta de remuneración propia',objetivoMaximoPct:10,
    estado:total?'comparación descriptiva':'parcial',aprobacion:'pendiente de protocolo y muestra',
    partidas:lineas,faltan,motivos,subtotalPrevistoClp:previsto,subtotalReferenciaClp:independiente,
    totalComparable:total,errorAbsolutoPct:total?.porcentaje==null?null:Math.abs(total.porcentaje)};
}
