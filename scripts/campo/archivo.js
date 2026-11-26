import { createHash, randomUUID } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { presupuesto, informe } from './comparar.js';
import { validarContexto, validarPlan, validarObservacion } from './evidencia.js';
import { resumenClases } from './clases.js';

const plantilla = new URL('../../datos/pruebas-campo/plantilla-economica.json',import.meta.url);
const codigo = /^viaje-\d{3,8}$/;

function directorio(path, crear) {
  if (crear) {
    try { mkdirSync(path,{mode:0o700}); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('La carpeta privada debe ser un directorio local sin enlaces.');
}

function leer(path) {
  const s = lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1) throw new Error('Usa archivos privados regulares sin enlaces.');
  try { return JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,'')); }
  catch { throw new Error('Revisa la sintaxis JSON del archivo privado.'); }
}

// Publica el archivo completo una sola vez; dos procesos nunca pisan un presupuesto.
function guardar(dir,nombre,obj) {
  const tmp = join(dir,randomUUID()+'.tmp');
  writeFileSync(tmp,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});
  try { linkSync(tmp,join(dir,nombre)); }
  catch (e) { if (e.code === 'EEXIST') throw new Error('Ese archivo ya existe y se conserva.'); throw e; }
  finally { unlinkSync(tmp); }
}

const huella = datos => createHash('sha256').update(JSON.stringify(datos)).digest('hex');

function leerSello(path,id,f) {
  if (!existsSync(path)) return null;
  const {datos,sha256} = leer(path);
  if (!datos || sha256 !== huella(datos) || datos.version !== 1 || datos.id !== id
      || ['uso','vehiculo','tipoVehiculo'].some(k => datos[k] !== f[k])) throw new Error('El presupuesto original o su identidad cambi�.');
  return datos;
}

function revisarReferencias(base,id,f) {
  if (f.uso === 'simulacion' || !f.observacion.comprobantes.length) return;
  const refs = new Set(f.observacion.comprobantes.map(r => r.ref));
  for (const otro of readdirSync(base).filter(x => codigo.test(x) && x !== id)) {
    const dir = join(base,otro);
    directorio(dir,false);
    const path = join(dir,'ficha.json');
    if (!existsSync(path)) continue;
    const vecino = leer(path);
    if (vecino.uso !== 'simulacion' && vecino.observacion?.comprobantes?.some(r => refs.has(r.ref))) {
      throw new Error('Una l�nea de comprobante ya figura en otro viaje real.');
    }
  }
}

export function ejecutar(accion,id,raiz=process.cwd()) {
  if (accion === 'resumen' && id === undefined) {
    const base = resolve(raiz,'calibracion');
    directorio(base,false);
    const fichas = [];
    for (const nombre of readdirSync(base).filter(x => codigo.test(x))) {
      const dir = join(base,nombre);
      directorio(dir,false);
      const f = leer(join(dir,'ficha.json'));
      if (f.uso === null && f.observacion?.intervalo === null) continue;
      validarContexto(f);
      validarObservacion(f.observacion,f.uso === 'simulacion',f.vehiculo);
      fichas.push(f);
    }
    const nombre = 'consumo-'+randomUUID()+'.json';
    guardar(base,nombre,resumenClases(fichas));
    return 'calibracion/'+nombre;
  }
  if (typeof id !== 'string' || !codigo.test(id) || !['iniciar','sellar','comparar'].includes(accion)) {
    throw new Error('Uso: npm run campo -- fase0 iniciar|sellar|comparar viaje-001');
  }
  const base = resolve(raiz,'calibracion'), dir = join(base,id);
  directorio(base,accion === 'iniciar');
  directorio(dir,accion === 'iniciar');
  if (accion === 'iniciar') {
    guardar(dir,'ficha.json',JSON.parse(readFileSync(plantilla,'utf8')));
    return 'calibracion/'+id+'/ficha.json';
  }
  const f = leer(join(dir,'ficha.json'));
  validarContexto(f);
  const sim = f.uso === 'simulacion';
  validarObservacion(f.observacion,sim,f.vehiculo);
  const path = join(dir,'presupuesto-original.json');
  if (accion === 'sellar') {
    validarPlan(f.plan,sim);
    if (Object.entries(f.observacion).some(([k,v]) =>
        k === 'comprobantes' ? v.length > 0 : k === 'cobertura' ? Object.values(v).some(x => x !== null) : v !== null)) {
      throw new Error('La observaci�n ya tiene datos. Conserva el viaje sin presupuesto retrospectivo.');
    }
    if (Object.values(f.plan).every(x => x === null)) throw new Error('Ingresa al menos un dato previsto.');
    const datos = {version:1,id,uso:f.uso,vehiculo:f.vehiculo,tipoVehiculo:f.tipoVehiculo,fecha:new Date().toISOString(),
      plan:f.plan,resultado:presupuesto(f.plan,f.plan,f.uso)};
    guardar(dir,'presupuesto-original.json',{datos,sha256:huella(datos)});
    return 'calibracion/'+id+'/presupuesto-original.json';
  }
  const sello = leerSello(path,id,f);
  revisarReferencias(base,id,f);
  const nombre = 'informe-'+randomUUID()+'.json';
  guardar(dir,nombre,{id,fechaInforme:new Date().toISOString(),...informe(f,sello)});
  return 'calibracion/'+id+'/'+nombre;
}
