import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ejecutar } from './archivo.js';
import { resumenClases } from './clases.js';
import { diferencia, informe, presupuesto, rendimiento } from './comparar.js';
import { validarObservacion, validarPlan } from './evidencia.js';

const plantilla = new URL('../../datos/pruebas-campo/plantilla-economica.json',import.meta.url);
const est = x => [x,'ESTIMADO'], med = x => [x,'MEDIDO'], doc = x => [x,'COMPROBADO'];
function ficha() {
  const f = JSON.parse(readFileSync(plantilla,'utf8'));
  Object.assign(f,{uso:'flete_real',vehiculo:'veh-001',tipoVehiculo:'furgon'});
  Object.assign(f.plan,{km:est(10),marchaMin:est(30),esperaMin:est(5),cargaMin:est(10),descargaMin:est(5),
    kmL:est(10),precioLitro:est(1200),fuentePrecio:'supuesto',desgasteKm:est(20),fijoHora:est(600),
    trabajoHora:est(1200),ayudantes:est(1),pagoAyudante:est(4000),tag:est(500),otros:est(0),
    margenPct:est(20),recargos:est(0),cotizado:[10000,'DECLARADO']});
  return f;
}
function observar(f) {
  Object.assign(f.observacion,{inicio:'2026-11-25T12:00:00-03:00',km:med(12),marchaMin:med(40),esperaMin:med(8),
    cargaMin:med(10),descargaMin:med(10),resolucionKm:med(0.1),ayudantes:med(1),recorrido:'urbano',nivelCarga:'sin',aire:false,
    precioLitro:doc(1250),fuentePrecio:'boleta',cobrado:doc(9000),
    comprobantes:[{ref:'doc-001-01',partida:'peajes',clp:600}],cobertura:{peajes:'completa',ayudantes:null,otros:null}});
  return f;
}
function sello(f) {
  return {fecha:'2026-11-24T10:00:00Z',plan:structuredClone(f.plan),resultado:presupuesto(f.plan,f.plan,f.uso)};
}
function intervalo() {
  return {vehiculo:'veh-001',registroCompleto:true,recorrido:'urbano',carga:'sin',aire:false,
    recargas:[{fecha:'2026-10-01',lleno:true,odometro:med(100),litros:doc(40)},{fecha:'2026-10-02',lleno:false,odometro:med(200),litros:doc(10)},
      {fecha:'2026-10-03',lleno:true,odometro:med(400),litros:doc(20)}]};
}
function privado(fn) {
  const root=mkdtempSync(join(tmpdir(),'campo-'));
  try {
    const id='viaje-001';
    const cmd=(accion,codigo=id)=>ejecutar(accion,codigo,root);
    const path=join(root,cmd('iniciar'));
    const guardar=f=>writeFileSync(path,JSON.stringify(f));
    const leer=rel=>JSON.parse(readFileSync(join(root,rel),'utf8'));
    fn({root,cmd,path,guardar,leer});
  } finally { rmSync(root,{recursive:true,force:true}); }
}

export function registrar(it) {
  it('cuenta intervalos �nicos, separa clases y calcula dispersi�n muestral',()=>{
    const fichas=[0,1,2,3].map((n)=>{
      const f=ficha(), i=intervalo();
      for (const r of i.recargas) r.odometro[0]+=300*n;
      i.recargas[2].litros=doc([20,15,10,20][n]);
      if (n===3) i.aire=true;
      f.observacion.intervalo=i; return f;
    });
    const r=resumenClases([...fichas,fichas[0]]);
    assert.equal(r.repetidos,1); assert.equal(r.grupos.length,2);
    const [a,b]=r.grupos; assert.equal(a.n,3);
    assert.equal(a.mediaKmL,37/3); assert(Math.abs(a.desviacionMuestralKmL-Math.sqrt(19/3))<1e-10);
    assert.equal(b.estado,'insuficiente'); assert.equal(b.coeficienteVariacionPct,null);
    const conflicto=structuredClone(fichas[0]); conflicto.observacion.intervalo.carga='completa';
    assert.throws(()=>resumenClases([fichas[0],conflicto]),/solapados/);
  });
  it('separa presupuesto, rec�lculo, comprobantes y precio cobrado',()=>{
    const f=observar(ficha()), r=informe(f,sello(f));
    assert.equal(r.presupuestoOriginal.costoClp,7250);
    assert.equal(r.recalculado.costoClp,7980);
    assert.equal(r.presupuestoOriginal.sugeridoClp,10000);
    assert.equal(r.gastosDelViaje.subtotalClp,600);
    assert.deepEqual(r.comparacionClp.peajes.original,diferencia(500,600));
    assert.equal(r.comparacionClp.peajes.original.absoluta,100);
    assert.equal(r.comparacionClp.peajes.original.sentido,'subestimaci�n');
    assert.equal(r.precios.cotizadoVsCobrado.sentido,'sobreestimaci�n');
    assert.equal(r.recorrido.totalMin.referencia,68);
    assert.equal(r.recorrido.totalMin.previsto,50);
  });
  it('conserva ceros expl�citos, cotas y denominador cero',()=>{
    const f=observar(ficha()); f.observacion.comprobantes[0].clp=0; f.plan.otros=null;
    const r=informe(f,sello(f));
    assert.deepEqual(r.comparacionClp.peajes.original,diferencia(500,0));
    assert.equal(r.comparacionClp.peajes.original.porcentaje,null);
    assert.equal(r.gastosDelViaje.porPartida.otros.clp,null);
    assert.equal(r.presupuestoOriginal.tipo,'cotaInferior');
    assert.equal(r.variacionCostoModelado.diferencia,null);
    assert.equal(r.presupuestoOriginal.sugeridoClp,null);
    assert(r.completitud.observacion.faltan.includes('otros'));
    assert(!r.completitud.observacion.faltan.includes('peajes'));
  });
  it('los comprobantes parciales solo suman al subtotal respaldado',()=>{
    const f=observar(ficha()); f.observacion.cobertura.peajes='parcial';
    const r=informe(f,sello(f));
    assert.equal(r.gastosDelViaje.subtotalClp,600);
    assert.equal(r.comparacionClp.peajes.original.referencia,null);
    f.observacion.comprobantes=[]; f.observacion.cobertura.peajes='completa';
    assert.throws(()=>validarObservacion(f.observacion,false,f.vehiculo),/respaldo/);
  });
  it('lleno a lleno excluye la primera carga e incluye todas las parciales y el cierre',()=>{
    const f=observar(ficha()); f.observacion.intervalo=intervalo();
    validarObservacion(f.observacion,false,f.vehiculo);
    const r=informe(f,sello(f));
    assert.equal(r.referencias.rendimientoKmL.referencia,10);
    assert.equal(r.referencias.litrosAsignadosEstimados,1.2);
    assert.equal(r.comparacionClp.combustible.original.referencia,1500);
    assert.equal(r.comparacionClp.combustible.evidencia,'ESTIMADO');
    assert.equal(r.gastosDelViaje.subtotalClp,600);
  });
  it('mantiene el intervalo medido sin extrapolar entre clases de carga o recorrido',()=>{
    const f=observar(ficha()); f.observacion.intervalo=intervalo(); f.observacion.nivelCarga='completa';
    const r=informe(f,sello(f));
    assert.equal(r.referencias.rendimientoMedidoIntervaloKmL,10);
    assert.equal(r.referencias.litrosAsignadosEstimados,null);
    assert.equal(r.comparacionClp.combustible.original.referencia,null);
  });
  it('intervalo abierto, parcial omitida, litros desconocidos o veh�culo distinto',()=>{
    const i=intervalo(); i.registroCompleto=false; assert.equal(rendimiento(i),null);
    i.registroCompleto=true; i.recargas[2].lleno=false; assert.equal(rendimiento(i),null);
    i.recargas[2].lleno=true; i.recargas[1].litros=null; assert.equal(rendimiento(i),null);
    const f=ficha(); f.observacion.intervalo=i;
    assert.throws(()=>validarObservacion(f.observacion,false,'veh-002'),/otro veh�culo/);
  });
  it('asigna mantenci�n por km y fijos por hora productiva sin sumar facturas de periodo al viaje',()=>{
    const f=observar(ficha()), periodo='2026-10-01/2026-10-31';
    f.observacion.mantencion={periodo,gastoClp:doc(10000),kmPeriodo:med(400)};
    f.observacion.fijos={periodo,gastoClp:doc(25000),horasProductivas:med(50)};
    validarObservacion(f.observacion,false,f.vehiculo);
    const r=informe(f,sello(f));
    assert.equal(r.comparacionClp.desgaste.original.referencia,300);
    assert.equal(r.comparacionClp.gastosFijos.original.referencia,500);
    assert.equal(r.gastosDelViaje.subtotalClp,600);
  });
  it('conserva el original al editar la ficha y al reintentar el sellado',()=>privado(({cmd,guardar,leer})=>{
    const f=ficha(); guardar(f); const path=cmd('sellar'); const original=leer(path);
    assert.throws(()=>cmd('sellar'),/existe/);
    f.plan.tag=est(999); observar(f); f.observacion.inicio=original.datos.fecha; guardar(f);
    const r=leer(cmd('comparar'));
    assert.equal(r.comparacionClp.peajes.original.previsto,500);
    assert.deepEqual(leer(path),original);
    assert.equal(leer(cmd('comparar')).presupuestoOriginal.costoClp,7250);
  }));
  it('permite un viaje hist�rico sin inventar presupuesto y bloquea comparaciones retrospectivas',()=>privado(({cmd,guardar,leer})=>{
    const f=observar(ficha()); guardar(f);
    assert.throws(()=>cmd('sellar'),/retrospectivo/);
    assert.equal(leer(cmd('comparar')).presupuestoOriginal,null);
    const s=sello(f); s.fecha='2026-11-26T10:00:00Z';
    assert.equal(informe(f,s).comparacionClp.peajes.original.previsto,null);
  }));
  it('detecta un sello editado',()=>privado(({root,cmd,guardar,leer})=>{
    guardar(ficha()); const ruta=cmd('sellar'), s=leer(ruta);
    s.datos.resultado.costoClp=1; writeFileSync(join(root,ruta),JSON.stringify(s));
    assert.throws(()=>cmd('comparar'),/original/);
  }));
  it('separa simulaci�n, circulaci�n personal y flete real',()=>{
    const f=observar(ficha()); f.observacion.km=[12,'SIMULADO'];
    assert.throws(()=>validarObservacion(f.observacion,false,f.vehiculo));
    assert.throws(()=>validarPlan(f.plan,true));
    f.uso='personal'; assert.equal(informe(f,sello(f)).precios,null);
    f.uso='simulacion'; assert.equal(informe(f,sello(f)).gastosDelViaje.evidencia,'SIMULADO');
  });
  it('impide repetir la l�nea en otra partida u otro viaje real',()=>privado(({root,cmd,guardar})=>{
    const f=observar(ficha()); guardar(f);
    writeFileSync(join(root,cmd('iniciar','viaje-002')),JSON.stringify(f));
    assert.throws(()=>cmd('comparar'),/otro viaje/);
    f.observacion.comprobantes.push({...f.observacion.comprobantes[0],partida:'otros'});
    assert.throws(()=>validarObservacion(f.observacion,false,f.vehiculo),/repetida/);
  }));
  it('restringe rutas, campos y enlaces privados',()=>privado(({root,path,cmd,guardar})=>{
    assert.throws(()=>cmd('iniciar','../publico'));
    const f=ficha(); f.observacion.domicilio='dato ficticio'; guardar(f);
    assert.throws(()=>cmd('comparar'),/Campos incorrectos/);
    delete f.observacion.domicilio; guardar(f);
    linkSync(path,join(root,'enlace.json'));
    assert.throws(()=>cmd('comparar'),/sin enlaces/);
    const ignore=readFileSync(new URL('../../.gitignore',import.meta.url),'utf8');
    assert(ignore.split(/\r?\n/).includes('calibracion/'));
  }));
}
