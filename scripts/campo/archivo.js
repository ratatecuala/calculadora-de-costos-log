import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { crearPresupuesto, compararFicha } from './contrato.js';
import { validarContexto, validarObservacion } from './evidencia.js';
import { resumenClases } from './clases.js';
import { revisarReferencias, serializarCanonico, verificarPaquete } from '../../src/shared/campo/index.js';
import { textoOriginal } from '../../src/shared/campo/huella.js';

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
  const fd=openSync(path,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const actual=fstatSync(fd);
    if (actual.dev!==s.dev || actual.ino!==s.ino || actual.nlink!==1 || !actual.isFile()) throw new Error();
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(fd)));
  } catch { throw new Error('Revisa la integridad, el JSON y la codificación UTF-8 del archivo privado.'); }
  finally { closeSync(fd); }
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
const huellaOriginal=datos=>createHash('sha256').update(textoOriginal(datos)).digest('hex');

function versionMotor() {
  const fuente = p=>readFileSync(new URL('../../src/'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const etiqueta=fuente('web/jobs.ts').match(/^export const ENGINE_VERSION = '([^']+)';/m)?.[1];
  const archivos=['engine/inputs.ts','engine/measures.ts','engine/rounding.ts','engine/types.ts'];
  return {etiqueta,sha256:huella(archivos.map(p=>[p,fuente(p)]))};
}

function leerSello(path,id,f) {
  if (!existsSync(path)) return null;
  const {datos,sha256} = leer(path);
  if (!datos || sha256 !== huellaOriginal(datos) || ![1,2,3].includes(datos.version) || datos.id !== id
      || ['uso','vehiculo','tipoVehiculo'].some(k => datos[k] !== f[k])) throw new Error('El presupuesto original o su identidad cambió.');
  return datos;
}

function ejecutarInterno(accion,id,raiz) {
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
    const datos = crearPresupuesto(f,id,new Date().toISOString(),versionMotor());
    guardar(dir,'presupuesto-original.json',{datos,sha256:huellaOriginal(datos)});
    return 'calibracion/'+id+'/presupuesto-original.json';
  }
  const sello = leerSello(path,id,f);
  const ajuste=revisarReferencias(f,fichasLocales(base).filter(v=>v.id!==id).map(v=>v.ficha));
  const nombre = 'informe-'+randomUUID()+'.json';
  const actual=versionMotor();
  guardar(dir,nombre,{id,fechaInforme:new Date().toISOString(),versionMotorRecalculo:actual,...compararFicha(f,sello,ajuste,actual)});
  return 'calibracion/'+id+'/'+nombre;
}

function fichasLocales(base) {
  return readdirSync(base).filter(id=>codigo.test(id)).map(id=>{
    const dir=join(base,id);
    directorio(dir,false);
    return {id,ficha:leer(join(dir,'ficha.json'))};
  });
}
function conEscritura(base,crear,accion) {
  directorio(base,crear);
  const lock=join(base,'.campo-escritura');
  try { mkdirSync(lock,{mode:0o700}); } catch(e) {
    if(e.code==='EEXIST') throw new Error('Archivo privado ocupado. Reintenta cuando termine la operación.');
    throw e;
  }
  try { return accion(); } finally { rmdirSync(lock); }
}
export function ejecutar(accion,id,raiz=process.cwd()) {
  return conEscritura(resolve(raiz,'calibracion'),accion==='iniciar',()=>ejecutarInterno(accion,id,raiz));
}

function publicarViaje(base,v) {
  const tmp=mkdtempSync(join(base,'.campo-import-'));
  try {
    guardar(tmp,'ficha.json',v.ficha);
    if(v.original!==null) guardar(tmp,'presupuesto-original.json',v.original);
    renameSync(tmp,join(base,v.id));
  } finally {
    if(existsSync(tmp)) {
      for (const n of ['ficha.json','presupuesto-original.json']) if(existsSync(join(tmp,n))) unlinkSync(join(tmp,n));
      rmdirSync(tmp);
    }
  }
}

export async function importar(entrada,raiz=process.cwd()) {
  if (!entrada) throw new Error('Indica la ruta del paquete JSON privado.');
  const paquete=leer(resolve(raiz,entrada));
  await verificarPaquete(paquete);
  const base=resolve(raiz,'calibracion');
  return conEscritura(base,true,()=>{
    const locales=fichasLocales(base), porId=new Map(locales.map(v=>[v.id,v.ficha]));
    const nuevos=[];
    for (const v of paquete.viajes) {
      const anterior=porId.get(v.id);
      if (!anterior) { nuevos.push(v); continue; }
      const path=join(base,v.id,'presupuesto-original.json');
      if (serializarCanonico(anterior)!==serializarCanonico(v.ficha) ||
          serializarCanonico(existsSync(path)?leer(path):null)!==serializarCanonico(v.original))
        throw new Error('Conflicto con un viaje existente. Se conserva el original.');
    }
    for(const v of nuevos) revisarReferencias(v.ficha,locales.map(x=>x.ficha));
    for(const v of nuevos) publicarViaje(base,v);
    return {importados:nuevos.length,identicos:paquete.viajes.length-nuevos.length};
  });
}
