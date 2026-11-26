import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { crearPresupuesto, compararFicha } from './contrato.js';
import { validarContexto, validarObservacion, valor } from './evidencia.js';
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

function versionMotor() {
  const fuente = p=>readFileSync(new URL('../../src/'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const etiqueta=fuente('web/jobs.ts').match(/^export const ENGINE_VERSION = '([^']+)';/m)?.[1];
  const archivos=['engine/inputs.ts','engine/measures.ts','engine/rounding.ts','engine/types.ts'];
  return {etiqueta,sha256:huella(archivos.map(p=>[p,fuente(p)]))};
}

function leerSello(path,id,f) {
  if (!existsSync(path)) return null;
  const {datos,sha256} = leer(path);
  if (!datos || sha256 !== huella(datos) || ![1,2].includes(datos.version) || datos.id !== id
      || ['uso','vehiculo','tipoVehiculo'].some(k => datos[k] !== f[k])) throw new Error('El presupuesto original o su identidad cambió.');
  return datos;
}

function revisarReferencias(base,id,f) {
  if (!f.observacion.intervalo && !f.observacion.comprobantes.length) return null;
  const refs = new Set(f.observacion.comprobantes.map(r => r.ref));
  let ultimoAjuste=null;
  let corteIncompleto=false;
  const conIntervalos=[f];
  for (const otro of readdirSync(base).filter(x => codigo.test(x) && x !== id)) {
    const dir = join(base,otro);
    directorio(dir,false);
    const path = join(dir,'ficha.json');
    if (!existsSync(path)) continue;
    const vecino = leer(path);
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
  return corteIncompleto ? {indeterminado:true} : ultimoAjuste;
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
    const datos = crearPresupuesto(f,id,new Date().toISOString(),versionMotor());
    guardar(dir,'presupuesto-original.json',{datos,sha256:huella(datos)});
    return 'calibracion/'+id+'/presupuesto-original.json';
  }
  const sello = leerSello(path,id,f);
  const ajuste=revisarReferencias(base,id,f);
  const nombre = 'informe-'+randomUUID()+'.json';
  guardar(dir,nombre,{id,fechaInforme:new Date().toISOString(),versionMotorRecalculo:versionMotor(),...compararFicha(f,sello,ajuste)});
  return 'calibracion/'+id+'/'+nombre;
}
