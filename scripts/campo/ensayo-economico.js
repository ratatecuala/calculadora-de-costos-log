import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ejecutar, importar } from './archivo.js';
import { VERSION_MOTOR, crearPaquete, envolverOriginal, huellaCanonica, verificarPaquete } from '../../src/shared/campo/index.js';
import { resumenClases } from './clases.js';
import { diferencia, informe, presupuesto, rendimiento } from './comparar.js';
import { validarObservacion, validarPlan } from './evidencia.js';
import { crearPresupuesto, compararFicha } from './contrato.js';

const plantilla = new URL('../../datos/pruebas-campo/plantilla-economica.json',import.meta.url);
const est = x => [x,'ESTIMADO'], med = x => [x,'MEDIDO'], doc = x => [x,'COMPROBADO'];
function ficha() {
  const f = JSON.parse(readFileSync(plantilla,'utf8'));
  Object.assign(f,{uso:'flete_real',vehiculo:'veh-001',tipoVehiculo:'furgon'});
  // Los casos históricos comparan seis partidas, incluidos los gastos fijos.
  Object.assign(f.plan,{modalidad:'detallada',km:est(10),marchaMin:est(30),esperaMin:est(5),cargaMin:est(10),descargaMin:est(5),
    kmL:est(10),precioLitro:est(1200),fuentePrecio:'supuesto',desgasteKm:est(20),fijoHora:est(600),
    trabajoHora:est(1200),ayudantes:est(1),pagoAyudante:est(4000),tag:est(500),otros:est(0),
    margenPct:est(20),recargos:est(0),cotizado:[10000,'DECLARADO'],ajusteHasta:'sin_ajuste',muestraPrevista:'validacion',baseClp:'neto'});
  return f;
}
function observar(f) {
  Object.assign(f.observacion,{inicio:'2026-11-25T12:00:00-03:00',km:med(12),marchaMin:med(40),esperaMin:med(8),
    cargaMin:med(10),descargaMin:med(10),resolucionKm:med(0.1),incertidumbreKm:med(0.1),
    fin:'2026-11-25T13:08:00-03:00',odometroInicial:med(210),odometroFinal:med(222),baseClp:'neto',
    ayudantes:med(1),recorrido:'urbano',nivelCarga:'sin',aire:false,
    precioLitro:doc(1250),fuentePrecio:'boleta',cobrado:doc(9000),
    comprobantes:[{ref:'doc-001-01',partida:'peajes',clp:600}],cobertura:{peajes:'completa',ayudantes:null,otros:null}});
  return f;
}
function sello(f) {
  return {fecha:'2026-11-24T10:00:00Z',versionMotor:{etiqueta:'motor-test'},plan:structuredClone(f.plan),resultado:presupuesto(f.plan,f.plan,f.uso)};
}
function intervalo() {
  return {vehiculo:'veh-001',registroCompleto:true,recorrido:'urbano',carga:'sin',aire:false,muestra:'validacion',zona:'America/Santiago',
    resolucionKm:med(0.1),incertidumbreKm:med(0.1),resolucionLitros:med(0.01),incertidumbreLitros:med(0.1),
    recargas:[{fecha:'2026-11-24',lleno:true,odometro:med(100),litros:doc(40)},{fecha:'2026-11-25',lleno:false,odometro:med(200),litros:doc(10)},
      {fecha:'2026-11-26',lleno:true,odometro:med(400),litros:doc(20)}]};
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
  it('modalidad simplificada conserva los datos de fijos y compara exclusivamente su alcance',()=>{
    const f=observar(ficha()),o=f.observacion;
    f.plan.modalidad='simplificada'; o.intervalo=intervalo();
    o.mantencion={periodo:'2026-10-01/2026-10-31',gastoClp:doc(10000),kmPeriodo:med(400)};
    o.cobertura.ayudantes='completa'; o.comprobantes.push({ref:'doc-002-01',partida:'ayudantes',clp:4000});
    f.plan.noAplica=['otros']; o.noAplica=['otros'];
    const r=informe(f,sello(f)),c=r.conciliacionIndependiente;
    assert.equal(c.partidas.gastosFijos.estado,'excluida'); assert.equal(c.partidas.gastosFijos.referenciaClp,null);
    assert.equal(c.partidas.otros.estado,'no aplicable'); assert.equal(c.partidas.otros.referenciaClp,null);
    assert.equal(c.totalComparable.previsto,5900); assert.equal(c.totalComparable.referencia,6400);
    assert.equal(r.presupuestoOriginal.partidas.gastosFijos,null); assert(!r.completitud.observacion.faltan.includes('fijosPeriodo'));
    assert.equal(f.plan.fijoHora[0],600);
    f.plan.modalidad='detallada'; assert(informe(f,sello(f)).conciliacionIndependiente.faltan.includes('gastosFijos'));
    f.plan.modalidad='simplificada'; o.noAplica=[];
    assert.equal(informe(f,sello(f)).conciliacionIndependiente.partidas.otros.estado,'alcance diferente');
    assert.equal(informe(f,sello(f)).conciliacionIndependiente.totalComparable,null);
    f.plan.noAplica=[]; assert.equal(informe(f,sello(f)).conciliacionIndependiente.partidas.otros.estado,'desconocida');
    o.comprobantes.push({ref:'doc-003-01',partida:'otros',clp:0}); o.cobertura.otros='completa';
    assert.equal(informe(f,sello(f)).conciliacionIndependiente.partidas.otros.estado,'cero comprobado');
  });
  it('un cambio de etiqueta o huella impide atribuir la variación solamente al recorrido',()=>{
    const f=ficha(),s=crearPresupuesto(f,'viaje-001','2026-11-01T00:00:00.000Z',VERSION_MOTOR);
    observar(f);
    for(const v of [{...VERSION_MOTOR,etiqueta:'motor-2.0.0'},{...VERSION_MOTOR,sha256:'b'.repeat(64)},null]){
      const r=compararFicha(f,s,null,v); assert.equal(r.variacionCostoModelado.diferencia,null);
      assert.equal(r.variacionCostoModelado.motores,v?'distintos':'sin verificar');
      assert.equal(r.presupuestoOriginal.costoClp,7250);
    }
    assert.equal(compararFicha(f,s,null,VERSION_MOTOR).variacionCostoModelado.diferencia,-730);
  });
  it('propaga incertidumbres declaradas y mantiene abiertos los rangos sin máximo finito',()=>{
    const f=observar(ficha()); f.observacion.intervalo=intervalo();
    let u=informe(f,sello(f)).referencias.incertidumbreCombustible;
    assert(Math.abs(u.litros.inferior-(11.9*29.9/300.1))<1e-10);
    assert(Math.abs(u.combustibleClp.superior-12.1*30.1/299.9*1250)<1e-8);
    f.observacion.intervalo.incertidumbreKm=med(300);
    assert.equal(informe(f,sello(f)).referencias.incertidumbreCombustible.litros.superior,null);
    delete f.observacion.intervalo.incertidumbreKm;
    u=informe(f,sello(f)).referencias.incertidumbreCombustible;
    assert.equal(u.litros,null); assert(u.faltan.includes('kmIntervalo'));
  });
  it('huella canónica conserva orden de listas, Unicode e históricos con orden anterior',async()=>{
    assert.equal(await huellaCanonica({b:'Ñ🚚',a:[1,2]}),await huellaCanonica({a:[1,2],b:'Ñ🚚'}));
    assert.notEqual(await huellaCanonica([1,2]),await huellaCanonica([2,1]));
    const f=ficha(),s=crearPresupuesto(f,'viaje-001','2026-11-01T00:00:00.000Z',VERSION_MOTOR);
    const original=await envolverOriginal(s);
    assert.equal(original.sha256,(await envolverOriginal(Object.fromEntries(Object.entries(s).reverse()))).sha256);
    const antiguo={...s,version:2}; delete antiguo.plan.modalidad;
    const v2=await envolverOriginal(antiguo);
    const paquete=await crearPaquete([{id:s.id,ficha:f,original:v2}]); await verificarPaquete(paquete);
    assert.deepEqual(paquete.viajes[0].original,v2);
  });
  it('importa paquetes completos, verifica ambos niveles y conserva originales en conflictos y reintentos',async()=>{
    const root=mkdtempSync(join(tmpdir(),'campo-import-'));
    try {
      const f=ficha(),s=crearPresupuesto(f,'viaje-001','2026-11-01T00:00:00.000Z',VERSION_MOTOR);
      const original=await envolverOriginal(s); observar(f);
      const viaje={id:s.id,ficha:f,original}, p=await crearPaquete([viaje]);
      const ruta=join(root,'movil.json'), cargar=async x=>{writeFileSync(ruta,JSON.stringify(x));return importar(ruta,root);};
      assert.deepEqual(await cargar(p),{importados:1,identicos:0});
      const path=join(root,'calibracion',s.id,'presupuesto-original.json'), bytes=readFileSync(path);
      assert.deepEqual(await cargar(p),{importados:0,identicos:1});
      const alterado=structuredClone(p); alterado.viajes[0].original.datos.plan.km=est(100);
      await assert.rejects(cargar(alterado),/huella/i);
      alterado.sha256=await huellaCanonica({formato:1,viajes:alterado.viajes});
      await assert.rejects(cargar(alterado),/original/i);
      const copia=structuredClone(viaje); copia.ficha.observacion.km=med(15);
      const nuevo={id:'viaje-002',ficha:ficha(),original:null};
      await assert.rejects(cargar(await crearPaquete([nuevo,copia])),/Conflicto/);
      assert.throws(()=>readFileSync(join(root,'calibracion','viaje-002','ficha.json')),/ENOENT/);
      assert.deepEqual(bytes,readFileSync(path));
      await assert.rejects(crearPaquete([viaje,viaje]),/duplicado/);
      await assert.rejects(crearPaquete([{...viaje,id:'../publico'}]),/inválido/);
      copia.ficha.observacion.foto='privado'; await assert.rejects(crearPaquete([copia]),/Campos/);
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  it('una recarga parcial aislada es válida y varios viajes del mismo intervalo aportan una sola muestra',()=>{
    const f=observar(ficha()), i=intervalo(); f.observacion.intervalo={...i,recargas:[i.recargas[1]]};
    validarObservacion(f.observacion,false,f.vehiculo); assert.equal(rendimiento(f.observacion.intervalo),null);
    f.observacion.intervalo=i; const otro=structuredClone(f); otro.observacion.km=med(6);
    assert.equal(resumenClases([f,otro]).grupos[0].n,1);
  });
  it('cuantifica espera como sensibilidad separada y clasifica el costo como parcial',()=>{
    const f=observar(ficha()); const s=sello(f); const r=informe(f,s);
    assert.deepEqual(r.esperaFueraDelMotor.observada,{minutos:8,fijosClp:80,metaTrabajoClp:160,potencialClp:240,evidencia:'ESTIMADO'});
    assert.equal(r.coberturaCostoEconomico.recalculado,'parcial');
    assert.equal(r.recalculado.costoClp,7980);
    f.observacion.esperaMin=null;
    assert.equal(informe(f,s).esperaFueraDelMotor.observada.potencialClp,null);
    f.observacion.esperaMin=med(0);
    assert.equal(informe(f,s).coberturaCostoEconomico.recalculado,'cubierto por el modelo');
  });
  it('concilia seis partidas con evidencia independiente y excluye la meta propia',()=>{
    const f=observar(ficha()),o=f.observacion;
    o.intervalo=intervalo();
    o.mantencion={periodo:'2026-10-01/2026-10-31',gastoClp:doc(10000),kmPeriodo:med(400)};
    o.fijos={periodo:'2026-10-01/2026-10-31',gastoClp:doc(30000),horasProductivas:med(50)};
    for(const [k,id,clp] of [['ayudantes','doc-002-01',4000],['otros','doc-003-01',0]]) {
      o.comprobantes.push({partida:k,ref:id,clp}); o.cobertura[k]='completa';
    }
    const s=sello(f), r=informe(f,s), v=r.conciliacionIndependiente;
    assert.equal(v.totalComparable.previsto,6350);
    assert.equal(v.totalComparable.referencia,7080);
    assert.equal(v.totalComparable.diferencia,-730);
    assert.equal(v.objetivoMaximoPct,10);
    assert.equal(v.estado,'comparación descriptiva');
    assert.equal(r.gastosDelViaje.subtotalClp,4600);
    for(const editar of [x=>{x.intervalo.incertidumbreLitros=null;},x=>{x.baseClp='con_iva';},
      x=>{x.cobertura.otros='parcial';},x=>{x.fijos.gastoClp=[30000,'DECLARADO'];}]) {
      const copia=structuredClone(f); editar(copia.observacion);
      assert.equal(informe(copia,s).conciliacionIndependiente.totalComparable,null);
    }
  });
  it('separa el combustible del intervalo y exige fecha, distancia, clase y muestra posterior',()=>{
    const f=observar(ficha()); f.observacion.intervalo=intervalo(); const s=sello(f);
    assert.equal(informe(f,s).referencias.intervalo.medicion.litros,30);
    for(const editar of [o=>{o.inicio='2026-11-23T12:00:00Z';},o=>{o.fin=null;},o=>{o.odometroFinal=med(250);},
      o=>{o.odometroInicial=med(90);},o=>{o.intervalo.muestra='calibracion';},o=>{o.intervalo.recargas[1].fecha=null;},
      o=>{o.aire=true;}]) {
      const copia=structuredClone(f); editar(copia.observacion);
      assert.equal(informe(copia,s).referencias.litrosAsignadosEstimados,null);
    }
    for(const corte of [null,{fecha:'2026-11-25',odometro:10},{fecha:'2026-11-20',odometro:110}]) {
      s.plan.ajusteHasta=corte; assert.equal(informe(f,s).referencias.litrosAsignadosEstimados,null);
    }
    s.plan.ajusteHasta={fecha:'2026-11-20',odometro:100};
    assert.equal(informe(f,s).referencias.litrosAsignadosEstimados,1.2);
    s.plan.muestraPrevista='calibracion';
    assert.equal(informe(f,s).referencias.litrosAsignadosEstimados,null);
  });
  it('un intervalo reservado para calibración no se cuenta también como validación',()=>{
    const f=observar(ficha()); f.observacion.intervalo=intervalo();
    const copia=structuredClone(f); copia.observacion.intervalo.muestra='calibracion';
    assert.throws(()=>resumenClases([f,copia]),/solapados/);
    assert.equal(resumenClases([copia]).grupos[0].muestra,'calibracion');
  });
  it('respeta el día civil local al comparar un viaje registrado en UTC',()=>{
    const f=observar(ficha()); f.observacion.intervalo=intervalo(); const s=sello(f);
    f.observacion.inicio='2026-11-27T00:00:00Z'; f.observacion.fin='2026-11-27T01:08:00Z';
    assert.equal(informe(f,s).referencias.litrosAsignadosEstimados,1.2);
    f.observacion.intervalo.zona=null;
    assert.equal(informe(f,s).referencias.litrosAsignadosEstimados,null);
  });
  it('compara archivos privados y detecta reutilización del intervalo de entrenamiento',()=>privado(({root,cmd,guardar})=>{
    const f=observar(ficha()); f.observacion.intervalo=intervalo(); guardar(f);
    const entrenamiento=structuredClone(f); entrenamiento.observacion.comprobantes=[];
    entrenamiento.observacion.cobertura.peajes=null; entrenamiento.observacion.intervalo.muestra='calibracion';
    writeFileSync(join(root,cmd('iniciar','viaje-002')),JSON.stringify(entrenamiento));
    assert.throws(()=>cmd('comparar'),/solapados/);
  }));
  it('contrato reutilizable conserva versión, no muta parámetros, admite fichas históricas',()=>{
    const f=ficha(),version={etiqueta:'motor-1.0.1',sha256:'a'.repeat(64)};
    const s=crearPresupuesto(f,'viaje-101','2026-11-23T00:00:00.000Z',version);
    f.plan.tag=est(123); assert.equal(s.plan.tag[0],500); assert.deepEqual(s.versionMotor,version);
    observar(f); const r=compararFicha(f,s); assert.equal(r.versionMotorOriginal.etiqueta,version.etiqueta);
    f.vehiculo='veh-002'; assert.throws(()=>compararFicha(f,s),/Identidad/);
    const anterior={...s,version:1}; delete anterior.versionMotor; f.vehiculo=s.vehiculo;
    assert.equal(compararFicha(f,anterior).versionMotorOriginal,null);
    assert.equal(compararFicha(f,anterior).conciliacionIndependiente.totalComparable,null);
  });
  it('rechaza calendario inválido, importes fuera de rango y divisiones no representables',()=>{
    const f=observar(ficha()); f.observacion.inicio='2026-02-30T12:00:00Z';
    assert.throws(()=>validarObservacion(f.observacion,false,f.vehiculo),/Inicio/);
    f.plan.kmL=est(1e-300); assert.throws(()=>validarPlan(f.plan,false));
    f.plan.kmL=est(10); f.plan.ayudantes=est(101); assert.throws(()=>validarPlan(f.plan,false));
    assert.throws(()=>diferencia(1,Number.MIN_VALUE),/rango/);
  });
  it('rechaza UTF-8 inválido y conserva tildes en el sello y en el informe',()=>privado(({cmd,path,guardar,leer})=>{
    guardar(ficha()); const s=leer(cmd('sellar')); assert.equal(s.datos.versionMotor.etiqueta,'motor-1.0.1');
    assert.match(s.datos.versionMotor.sha256,/^[0-9a-f]{64}$/);
    assert(!JSON.stringify(leer(cmd('comparar'))).includes('\uFFFD'));
    writeFileSync(path,Buffer.from([0xff,0xfe,0x7b])); assert.throws(()=>cmd('comparar'),/UTF-8/);
  }));
  it('cuenta intervalos únicos, separa clases y calcula dispersión muestral',()=>{
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
  it('separa presupuesto, recálculo, comprobantes y precio cobrado',()=>{
    const f=observar(ficha()), r=informe(f,sello(f));
    assert.equal(r.presupuestoOriginal.costoClp,7250);
    assert.equal(r.recalculado.costoClp,7980);
    assert.equal(r.presupuestoOriginal.sugeridoClp,10000);
    assert.equal(r.gastosDelViaje.subtotalClp,600);
    assert.deepEqual(r.comparacionClp.peajes.original,diferencia(500,600));
    assert.equal(r.comparacionClp.peajes.original.absoluta,100);
    assert.equal(r.comparacionClp.peajes.original.sentido,'subestimación');
    assert.equal(r.precios.cotizadoVsCobrado.sentido,'sobreestimación');
    assert.equal(r.recorrido.totalMin.referencia,68);
    assert.equal(r.recorrido.totalMin.previsto,50);
  });
  it('conserva ceros explícitos, cotas y denominador cero',()=>{
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
  it('intervalo abierto, parcial omitida, litros desconocidos o vehículo distinto',()=>{
    const i=intervalo(); i.registroCompleto=false; assert.equal(rendimiento(i),null);
    i.registroCompleto=true; i.recargas[2].lleno=false; assert.equal(rendimiento(i),null);
    i.recargas[2].lleno=true; i.recargas[1].litros=null; assert.equal(rendimiento(i),null);
    const f=ficha(); f.observacion.intervalo=i;
    assert.throws(()=>validarObservacion(f.observacion,false,'veh-002'),/otro vehículo/);
  });
  it('asigna mantención por km y fijos por hora productiva sin sumar facturas de periodo al viaje',()=>{
    const f=observar(ficha()), periodo='2026-10-01/2026-10-31';
    f.observacion.mantencion={periodo,gastoClp:doc(10000),kmPeriodo:med(400)};
    f.observacion.fijos={periodo,gastoClp:doc(25000),horasProductivas:med(50)};
    validarObservacion(f.observacion,false,f.vehiculo);
    const r=informe(f,sello(f));
    assert.equal(r.comparacionClp.desgaste.original.referencia,300);
    assert.equal(r.comparacionClp.gastosFijos.original.referencia,68/60*500);
    assert.equal(r.gastosDelViaje.subtotalClp,600);
  });
  it('conserva el original al editar la ficha y al reintentar el sellado',()=>privado(({cmd,guardar,leer})=>{
    const f=ficha(); guardar(f); const path=cmd('sellar'); const original=leer(path);
    assert.throws(()=>cmd('sellar'),/existe/);
    f.plan.tag=est(999); observar(f); f.observacion.inicio=original.datos.fecha; f.observacion.fin=null; guardar(f);
    const r=leer(cmd('comparar'));
    assert.equal(r.comparacionClp.peajes.original.previsto,500);
    assert.deepEqual(leer(path),original);
    assert.equal(leer(cmd('comparar')).presupuestoOriginal.costoClp,7250);
  }));
  it('permite un viaje histórico sin inventar presupuesto y bloquea comparaciones retrospectivas',()=>privado(({cmd,guardar,leer})=>{
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
  it('separa simulación, circulación personal y flete real',()=>{
    const f=observar(ficha()); f.observacion.km=[12,'SIMULADO'];
    assert.throws(()=>validarObservacion(f.observacion,false,f.vehiculo));
    assert.throws(()=>validarPlan(f.plan,true));
    f.uso='personal'; assert.equal(informe(f,sello(f)).precios,null);
    f.uso='simulacion'; assert.equal(informe(f,sello(f)).gastosDelViaje.evidencia,'SIMULADO');
  });
  it('impide repetir la línea en otra partida u otro viaje real',()=>privado(({root,cmd,guardar})=>{
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
