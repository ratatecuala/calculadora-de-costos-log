import {valor} from './evidencia.js';
import {dividir,sumar} from './numeros.js';
export function medirIntervalo(i) {
  if (!i || !i.registroCompleto || i.recargas.length < 2) return null;
  const a = i.recargas[0], b = i.recargas.at(-1);
  if (!a.lleno || !b.lleno || !a.odometro || !b.odometro || i.recargas.some(r=>!r.fecha)) return null;
  const km = valor(b.odometro)-valor(a.odometro);
  const litros = sumar(i.recargas.slice(1).map(r=>valor(r.litros)));
  if (!(km>0 && litros>0)) return null;
  return {km,litros,kmL:dividir(km,litros),desde:a.fecha,hasta:b.fecha,
    odometroInicial:valor(a.odometro),odometroFinal:valor(b.odometro),
    resolucionKm:valor(i.resolucionKm),resolucionLitros:valor(i.resolucionLitros),incertidumbreLitros:valor(i.incertidumbreLitros),
    incertidumbreKm:valor(i.incertidumbreKm)};
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
