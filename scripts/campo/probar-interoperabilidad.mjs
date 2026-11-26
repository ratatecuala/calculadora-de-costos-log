import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const raiz=fileURLToPath(new URL('../../',import.meta.url));
const tmp=mkdtempSync(join(tmpdir(),'interop-campo-'));
const leer=p=>JSON.parse(readFileSync(join(tmp,p),'utf8'));
const escribir=(p,v)=>writeFileSync(join(tmp,p),JSON.stringify(v),'utf8');
const runner=join(dirname(require.resolve('vite-node/package.json')),'vite-node.mjs');
const cli=(...args)=>execFileSync(process.execPath,[runner,'scripts/campo/registro.ts','fase0',...args],{cwd:tmp,encoding:'utf8'}).trim();
let server,browser;
try {
  for(const p of ['src/shared/campo','src/engine','src/web/jobs.ts','scripts/campo','datos/pruebas-campo','package.json']) {
    mkdirSync(dirname(join(tmp,p)),{recursive:true});
    cpSync(join(raiz,p),join(tmp,p),{recursive:true});
  }
  symlinkSync(join(raiz,'node_modules'),join(tmp,'node_modules'),'junction');
  server=await createServer({root:raiz,configFile:false,server:{host:'127.0.0.1',port:0},appType:'custom',logLevel:'error'});
  await server.listen();
  const origen='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch();
  const page=await browser.newPage();
  await page.route(origen+'/prueba',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Ensayo local</title>'}));
  await page.goto(origen+'/prueba');
  const ficha=leer('datos/pruebas-campo/plantilla-economica.json');
  Object.assign(ficha,{uso:'personal',vehiculo:'veh-001',tipoVehiculo:'auto'});
  ficha.plan.km=[7,'ESTIMADO'];
  const paquete=await page.evaluate(async f=>{
    const api=await import('/src/shared/campo/index.js');
    const datos=api.crearPresupuesto(f,'viaje-001','2026-01-01T00:00:00.000Z',api.VERSION_MOTOR);
    const original=await api.envolverOriginal(datos);
    f.observacion.inicio='2026-01-02T12:00:00Z'; f.observacion.km=[8,'MEDIDO'];
    return api.crearPaquete([{id:datos.id,ficha:f,original}]);
  },ficha);
  escribir('paquete.json',paquete);
  cli('importar','paquete.json');
  const informe=leer(cli('comparar','viaje-001').split(/\r?\n/).at(-1));
  assert.equal(informe.variacionCostoModelado.motores,'idénticos');
  assert.equal(informe.recorrido.km.diferencia,-1);
  assert.deepEqual(leer('calibracion/viaje-001/presupuesto-original.json'),paquete.viajes[0].original);
  assert.match(cli('importar','paquete.json'),/identicos.*1/);
  console.log('Chromium → paquete → CLI: original idéntico y reimportación idempotente');
  cli('iniciar','viaje-002'); escribir('calibracion/viaje-002/ficha.json',ficha);
  cli('sellar','viaje-002'); const original=leer('calibracion/viaje-002/presupuesto-original.json');
  const sha=await page.evaluate(async o=>{
    const api=await import('/src/shared/campo/index.js');
    return (await api.envolverOriginal(Object.fromEntries(Object.entries(o.datos).reverse()))).sha256;
  },original);
  assert.equal(sha,original.sha256);
  assert.deepEqual(original.datos.versionMotor,paquete.viajes[0].original.datos.versionMotor);
  console.log('CLI → Chromium: huella canónica y versión real del motor idénticas');
} finally {
  try { await browser?.close(); } finally { try { await server?.close(); } finally { rmSync(tmp,{recursive:true,force:true}); } }
}
