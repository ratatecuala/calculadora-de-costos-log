import { rendimiento } from './comparar.js';
import { valor } from './evidencia.js';

export function resumenClases(fichas) {
  const clases = new Map(), vehiculos = new Map();
  let incompletos = 0, repetidos = 0;
  for (const f of fichas) {
    const i = f.observacion.intervalo;
    if (!i) continue;
    const kmL = rendimiento(i);
    if (kmL === null || [i.recorrido,i.carga,i.aire].includes(null) || i.recargas.some(r => r.fecha === null)) {
      incompletos++;
      continue;
    }
    const desde = valor(i.recargas[0].odometro), hasta = valor(i.recargas.at(-1).odometro);
    const grupo = [f.uso,f.tipoVehiculo,f.vehiculo,i.recorrido,i.carga,i.aire];
    const clave = JSON.stringify(grupo);
    const identidad = [f.uso === 'simulacion' ? 'simulado' : 'real',f.vehiculo].join('/');
    const vistos = vehiculos.get(identidad) ?? [];
    const solape = vistos.find(r => desde < r.hasta && hasta > r.desde);
    const firma = JSON.stringify(i.recargas.map(r => [r.fecha,r.lleno,r.odometro,r.litros]));
    if (solape) {
      if (solape.clave !== clave || solape.firma !== firma) throw new Error('Intervalos solapados o con antecedentes contradictorios. Revisa las fichas.');
      repetidos++;
      continue;
    }
    vistos.push({desde,hasta,clave,firma});
    vehiculos.set(identidad,vistos);
    const valores = clases.get(clave) ?? [];
    valores.push(kmL);
    clases.set(clave,valores);
  }
  const grupos = Array.from(clases,([clave,valores])=>{
    const [uso,tipoVehiculo,vehiculo,recorrido,carga,aire] = JSON.parse(clave);
    const n = valores.length, media = valores.reduce((s,x)=>s+x,0)/n;
    const desviacion = n < 2 ? null : Math.sqrt(valores.reduce((s,x)=>s+(x-media)**2,0)/(n-1));
    const maxima = valores.reduce((m,x)=>Math.max(m,Math.abs(x-media)),0);
    return {uso,tipoVehiculo,vehiculo,recorrido,carga,aire,n,mediaKmL:media,desviacionMuestralKmL:desviacion,
      coeficienteVariacionPct:desviacion === null ? null : desviacion/media*100,
      desviacionMaximaKmL:maxima,desviacionMaximaPct:maxima/media*100,
      estado:n<3 ? 'insuficiente':'descriptivo',evidencia:uso === 'simulacion' ? 'SIMULADO':'MEDIDO'};
  });
  return {umbrales:'por aprobar en #12',incompletos,repetidos,grupos};
}
