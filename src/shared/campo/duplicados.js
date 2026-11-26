import { validarObservacion, valor } from './evidencia.js';
import { resumenClases } from './clases.js';

export function revisarReferencias(f,otrasFichas) {
  const refs = new Set(f.observacion.comprobantes.map(r => r.ref));
  let ultimoAjuste=null;
  let corteIncompleto=false;
  const conIntervalos=[f];
  for (const vecino of otrasFichas) {
    if (f.uso !== 'simulacion' && vecino.uso !== 'simulacion' && vecino.observacion?.comprobantes?.some(r => refs.has(r.ref))) {
      throw new Error('Una línea de comprobante ya figura en otro viaje real.');
    }
    if (!f.observacion.intervalo || vecino.vehiculo!==f.vehiculo || (vecino.uso==='simulacion')!==(f.uso==='simulacion')) continue;
    const i=vecino.observacion?.intervalo;
    if (!i) continue;
    validarObservacion(vecino.observacion,vecino.uso==='simulacion',vecino.vehiculo);
    conIntervalos.push(vecino);
    const cierre=i.recargas.at(-1), inicio=i.recargas[0], limite=f.observacion.intervalo.recargas.at(-1);
    if (i.muestra==='calibracion' && (!inicio?.fecha || !cierre?.fecha || !cierre?.odometro)) corteIncompleto=true;
    if (i.muestra==='calibracion' && inicio?.fecha && limite?.fecha && inicio.fecha<=limite.fecha && cierre?.fecha && cierre.odometro) {
      ultimoAjuste={fecha:ultimoAjuste && ultimoAjuste.fecha>cierre.fecha ? ultimoAjuste.fecha : cierre.fecha,
        odometro:Math.max(ultimoAjuste?.odometro ?? 0,valor(cierre.odometro))};
    }
  }
  if (conIntervalos.length>1) resumenClases(conIntervalos);
  if (f.observacion.inicio && otrasFichas.some(v=>v.vehiculo===f.vehiculo &&
      (v.uso==='simulacion')===(f.uso==='simulacion') && v.observacion?.inicio &&
      Date.parse(v.observacion.inicio)===Date.parse(f.observacion.inicio))) {
    throw new Error('El mismo inicio y vehículo ya figuran en otro viaje.');
  }
  return corteIncompleto ? {indeterminado:true} : ultimoAjuste;
}
