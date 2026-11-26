import { informe, presupuesto } from './comparar.js';
import { validarContexto, validarObservacion, validarPlan } from './evidencia.js';

export function validarFicha(f) {
  validarContexto(f);
  validarObservacion(f.observacion,f.uso==='simulacion',f.vehiculo);
  validarPlan(f.plan,f.uso==='simulacion');
}

export function crearPresupuesto(f,id,fecha,versionMotor) {
  validarFicha(f);
  if (typeof id!=='string' || !/^viaje-\d{3,8}$/.test(id)) throw new Error('Código de viaje inválido.');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(fecha) || !Number.isFinite(Date.parse(fecha))
      || new Date(fecha).toISOString()!==fecha) throw new Error('Fecha de sellado inválida.');
  if (!versionMotor || !/^motor-[\d.]+$/.test(versionMotor.etiqueta) || !/^[a-f0-9]{64}$/.test(versionMotor.sha256))
    throw new Error('Versión del motor incompleta.');
  if (Object.entries(f.observacion).some(([k,v]) => k==='comprobantes' ? v.length : k==='cobertura' ? Object.values(v).some(x=>x!==null) : v!==null))
    throw new Error('La observación ya tiene datos. Conserva el viaje sin presupuesto retrospectivo.');
  if (!Object.entries(f.plan).some(([k,v])=> !['resolucionKm','incertidumbreKm'].includes(k) && Array.isArray(v))) throw new Error('Ingresa al menos un dato previsto.');
  if (f.plan.ajusteHasta?.fecha && f.plan.ajusteHasta.fecha>=fecha.slice(0,10))
    throw new Error('La calibración por día debe haber terminado antes del sello.');
  return structuredClone({version:2,id,uso:f.uso,vehiculo:f.vehiculo,tipoVehiculo:f.tipoVehiculo,fecha,versionMotor,
    plan:f.plan,resultado:presupuesto(f.plan,f.plan,f.uso)});
}

// El almacenamiento verifica huella e identidad del original antes de llamar.
export function compararFicha(f,sello,ultimoAjuste=null) {
  validarContexto(f);
  validarObservacion(f.observacion,f.uso==='simulacion',f.vehiculo);
  if (sello && ['uso','vehiculo','tipoVehiculo'].some(k=>f[k]!==sello[k])) throw new Error('Identidad de sello incompatible.');
  if (sello) {
    if (![1,2].includes(sello.version) || !sello.resultado?.partidas || !Array.isArray(sello.resultado.faltan))
      throw new Error('Contrato de presupuesto incompatible.');
    try { validarPlan(sello.plan,f.uso==='simulacion'); } catch (e) {
      if (sello.version!==1) throw e;
      const r=informe(f,null,ultimoAjuste);
      return {...r,estadoPresupuesto:'original histórico fuera del contrato actual',entradasOriginales:sello.plan,
        fechaPresupuesto:sello.fecha,presupuestoOriginal:sello.resultado};
    }
    if (sello.version===2 && (!/^motor-[\d.]+$/.test(sello.versionMotor?.etiqueta) || !/^[a-f0-9]{64}$/.test(sello.versionMotor?.sha256)))
      throw new Error('Versión del motor incompleta.');
  }
  return informe(f,sello,ultimoAjuste);
}
