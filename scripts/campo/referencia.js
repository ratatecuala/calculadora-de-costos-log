import { clase, partidasDirectas, valor } from './evidencia.js';

export function seguro(n) {
  if (n !== null && (!Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER))
    throw new Error('Resultado fuera de rango; revisa las unidades y denominadores.');
  return n;
}
export function sumar(xs) {
  return xs.includes(null) ? null : seguro(xs.reduce((a,b)=>a+b,0));
}
const producto = (a,b) => a === null || b === null ? null : seguro(a*b);
export const dividir = (n,d) => n === null || !(d > 0) ? null : seguro(n/d);
const observado = d => ['MEDIDO','COMPROBADO'].includes(clase(d));

export function espera(ruta,plan) {
  const minutos = valor(ruta.esperaMin);
  const horas = dividir(minutos,60);
  const porHora = d => horas === 0 ? 0 : producto(horas,valor(d));
  const fijosClp = porHora(plan?.fijoHora), metaTrabajoClp = porHora(plan?.trabajoHora);
  return {minutos,fijosClp,metaTrabajoClp,potencialClp:sumar([fijosClp,metaTrabajoClp]),
    evidencia:minutos === null ? 'DATO FALTANTE' : clase(ruta.esperaMin) === 'SIMULADO' ? 'SIMULADO':'ESTIMADO'};
}

export function medirIntervalo(i) {
  if (!i || !i.registroCompleto || i.recargas.length < 2) return null;
  const a = i.recargas[0], b = i.recargas.at(-1);
  if (!a.lleno || !b.lleno || !a.odometro || !b.odometro || i.recargas.some(r=>!r.fecha)) return null;
  const km = valor(b.odometro)-valor(a.odometro);
  const litros = sumar(i.recargas.slice(1).map(r=>valor(r.litros)));
  if (!(km>0 && litros>0)) return null;
  return {km,litros,kmL:dividir(km,litros),desde:a.fecha,hasta:b.fecha,
    odometroInicial:valor(a.odometro),odometroFinal:valor(b.odometro),
    resolucionKm:valor(i.resolucionKm),resolucionLitros:valor(i.resolucionLitros),incertidumbreLitros:valor(i.incertidumbreLitros)};
}

// La calibración previa queda declarada en el sello. La muestra posterior nunca
// reutiliza sus días ni su recorrido. Las fechas de carga son días locales.
export function vincularIntervalo(o,plan,vehiculo,ultimoAjuste=null) {
  const i=o.intervalo, medicion=medirIntervalo(i), motivos=[];
  if (!medicion) return {medicion,motivos:['intervalo incompleto'],utilizable:false};
  const a=valor(o.odometroInicial), b=valor(o.odometroFinal), km=valor(o.km);
  if (i.vehiculo !== vehiculo || !o.recorrido || !o.nivelCarga || o.aire === null ||
      i.recorrido !== o.recorrido || i.carga !== o.nivelCarga || i.aire !== o.aire) motivos.push('vehículo o clase incompatible');
  const dia=i.zona ? new Intl.DateTimeFormat('en-CA',{timeZone:i.zona,year:'numeric',month:'2-digit',day:'2-digit'}) : null;
  if (!dia || !o.inicio || !o.fin || dia.format(new Date(o.inicio))<medicion.desde || dia.format(new Date(o.fin))>medicion.hasta ||
      Date.parse(o.fin)<Date.parse(o.inicio)) motivos.push('viaje fuera de las fechas del intervalo o sin fechas');
  if (a===null || b===null || km===null || !o.resolucionKm || a<medicion.odometroInicial || b>medicion.odometroFinal ||
      b<a || Math.abs((b-a)-km)>valor(o.resolucionKm)+(valor(o.incertidumbreKm)??0)) motivos.push('distancia sin correspondencia con odómetros');
  if (i.muestra !== 'validacion' || plan?.muestraPrevista!=='validacion') motivos.push('intervalo sin reserva previa para validación posterior');
  const corte=plan?.ajusteHasta;
  if (ultimoAjuste?.indeterminado) motivos.push('corte del archivo de calibración incompleto');
  if (!corte) motivos.push('origen del ajuste no registrado antes del viaje');
  for (const ajuste of [corte,ultimoAjuste]) {
    if (ajuste && ajuste !== 'sin_ajuste' && (ajuste.fecha>=medicion.desde || ajuste.odometro>medicion.odometroInicial)) {
      motivos.push('intervalo no posterior al ajuste'); break;
    }
  }
  return {medicion,motivos,utilizable:motivos.length===0};
}

export function derivarReferencia(o,vinculo) {
  const km=valor(o.km), litros=dividir(km,vinculo.utilizable ? vinculo.medicion.kmL : null);
  const tasa=(h,k)=>dividir(valor(h?.gastoClp),valor(h?.[k]));
  const desgasteKm=tasa(o.mantencion,'kmPeriodo'), fijoHora=tasa(o.fijos,'horasProductivas');
  const tiempo=['marchaMin','cargaMin','descargaMin','esperaMin'];
  const horas=dividir(sumar(tiempo.map(k=>valor(o[k]))),60);
  const asignaciones={combustible:producto(litros,valor(o.precioLitro)),desgaste:producto(km,desgasteKm),gastosFijos:producto(horas,fijoHora)};
  const periodoVerificado=(h,k)=>clase(h?.gastoClp)==='COMPROBADO' && observado(h?.[k]);
  const calidad={
    combustible:vinculo.utilizable && observado(o.km) && observado(o.odometroInicial) && observado(o.odometroFinal)
      && observado(o.precioLitro) && o.incertidumbreKm!=null && vinculo.medicion.incertidumbreLitros!==null
      && vinculo.medicion.resolucionLitros!==null && vinculo.medicion.resolucionKm!==null,
    desgaste:observado(o.km) && periodoVerificado(o.mantencion,'kmPeriodo'),
    gastosFijos:tiempo.every(k=>observado(o[k])) && periodoVerificado(o.fijos,'horasProductivas')
  };
  return {litros,desgasteKm,fijoHora,asignaciones,calidad};
}

export function conciliar(f,sello,cronologia,gastos,ref,calcularDiferencia) {
  const lineas={};
  for (const k of [...partidasDirectas,...Object.keys(ref.asignaciones)]) {
    const directo=gastos.porPartida[k];
    const anterior=sello?.resultado?.partidas[k] ?? null;
    const independiente=directo ? (directo.cobertura==='completa' ? directo.clp : null) : ref.asignaciones[k];
    const comparable=anterior!==null && independiente!==null && (directo!==undefined || ref.calidad[k]);
    lineas[k]={presupuestoClp:anterior,referenciaClp:independiente,comparable,
      evidencia:independiente===null?'DATO FALTANTE':f.uso==='simulacion'?'SIMULADO':directo?'COMPROBADO':'ESTIMADO'};
  }
  const faltan=Object.keys(lineas).filter(k=>!lineas[k].comparable);
  const motivos=[];
  if (!cronologia || !sello?.versionMotor) motivos.push('presupuesto sin cronología o versión verificable');
  if (!sello?.plan.baseClp || sello.plan.baseClp!==f.observacion.baseClp) motivos.push('base tributaria desconocida o distinta');
  if (f.uso==='simulacion') motivos.push('simulación');
  const comparables=Object.values(lineas).filter(l=>l.comparable);
  const previsto=comparables.length ? sumar(comparables.map(l=>l.presupuestoClp)) : null;
  const independiente=comparables.length ? sumar(comparables.map(l=>l.referenciaClp)) : null;
  const total=faltan.length || motivos.length ? null : calcularDiferencia(previsto,independiente);
  return {alcance:'costo operativo sin meta de remuneración propia',objetivoMaximoPct:10,
    estado:total?'comparación descriptiva':'parcial',aprobacion:'pendiente de protocolo y muestra',
    partidas:lineas,faltan,motivos,subtotalPrevistoClp:previsto,subtotalReferenciaClp:independiente,
    totalComparable:total,errorAbsolutoPct:total?.porcentaje==null?null:Math.abs(total.porcentaje)};
}
