import { validarFicha } from './contrato.js';
import { validarPlan } from './evidencia.js';
import { huellaCanonica, sha256Texto, textoOriginal } from './huella.js';
import { revisarReferencias } from './duplicados.js';

function objeto(obj, requeridas, opcionales=[]) {
  if (!obj || Object.getPrototypeOf(obj)!==Object.prototype || requeridas.some(k=>!Object.hasOwn(obj,k)) ||
      Object.keys(obj).some(k=>!requeridas.includes(k) && !opcionales.includes(k))) throw new Error('Campos de paquete incompatibles.');
}
export function validarId(id) {
  if (typeof id!=='string' || !/^viaje-\d{3,8}$/.test(id)) throw new Error('Identificador de viaje inválido.');
}
function monto(x) {
  if (x!==null && !(typeof x==='number' && Number.isFinite(x) && x>=0 && x<=Number.MAX_SAFE_INTEGER)) throw new Error('Monto de sello inválido.');
}
export function validarOriginal(v) {
  const {original,ficha,id}=v;
  if (original===null) return;
  objeto(original,['datos','sha256']);
  const d=original.datos;
  objeto(d,['version','id','uso','vehiculo','tipoVehiculo','fecha','plan','resultado'],['versionMotor']);
  if (![1,2,3].includes(d.version) || d.id!==id || ['uso','vehiculo','tipoVehiculo'].some(k=>d[k]!==ficha[k]) ||
      typeof d.fecha!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(d.fecha) ||
      !Number.isFinite(Date.parse(d.fecha)) || new Date(d.fecha).toISOString()!==d.fecha) throw new Error('Identidad o fecha de original inválida.');
  if (d.version>=2 || d.versionMotor!==undefined) {
    objeto(d.versionMotor,['etiqueta','sha256']);
    if (!/^motor-[\d.]+$/.test(d.versionMotor.etiqueta) || !/^[a-f0-9]{64}$/.test(d.versionMotor.sha256)) throw new Error('Versión inválida.');
  }
  validarPlan(d.plan,ficha.uso==='simulacion');
  const r=d.resultado;
  objeto(r,['evidencia','partidas','litrosEstimados','costoClp','tipo','faltan','sugeridoClp'],['coberturaEconomica']);
  const ids=['combustible','peajes','ayudantes','otros','desgaste','gastosFijos','remuneracion'];
  objeto(r.partidas,ids);
  if (r.evidencia!==(ficha.uso==='simulacion'?'SIMULADO':'ESTIMADO') || !['estimado','cotaInferior'].includes(r.tipo)
      || !Array.isArray(r.faltan) || r.faltan.some(k=>!ids.includes(k))
      || ![undefined,'parcial','cubierto por el modelo'].includes(r.coberturaEconomica)) throw new Error('Resultado del sello inválido.');
  for (const n of [...Object.values(r.partidas),r.litrosEstimados,r.costoClp,r.sugeridoClp]) monto(n);
}
async function validarViajes(viajes) {
  if (!Array.isArray(viajes) || !viajes.length) throw new Error('Paquete sin viajes.');
  const ids=new Set();
  for (const v of viajes) {
    objeto(v,['id','ficha','original']); validarId(v.id);
    if (ids.has(v.id)) throw new Error('Viaje duplicado en el paquete.');
    ids.add(v.id); validarFicha(v.ficha); validarOriginal(v);
    if (v.original && await sha256Texto(textoOriginal(v.original.datos))!==v.original.sha256) throw new Error('Huella del original incorrecta.');
  }
  for (const v of viajes) revisarReferencias(v.ficha,viajes.filter(x=>x!==v).map(x=>x.ficha));
}
export async function crearPaquete(viajes) {
  const datos={formato:1,viajes:structuredClone(viajes)};
  await validarViajes(datos.viajes);
  return {...datos,sha256:await huellaCanonica(datos)};
}
export async function verificarPaquete(p) {
  objeto(p,['formato','viajes','sha256']);
  if (p.formato!==1 || await huellaCanonica({formato:1,viajes:p.viajes})!==p.sha256) throw new Error('Versión o huella del paquete incorrecta.');
  await validarViajes(p.viajes);
}
