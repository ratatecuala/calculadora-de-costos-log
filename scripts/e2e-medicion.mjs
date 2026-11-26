/**
 * A-90, Frente A — prueba de NAVEGADOR de la herramienta privada de medición, SOLO en local (sin
 * despliegue, sin Supabase, sin APIs externas). Datos ficticios.
 *
 * Recomendado (build real, con service worker para probar el modo sin conexión):
 *   VITE_FF_MEDICION=1 npm run build:medicion
 *   npx vite preview --config vite.medicion.config.ts --port 5195 --strictPort      (otra terminal)
 *   node scripts/e2e-medicion.mjs http://localhost:5195 [http://localhost:5196-sin-flag] [carpeta-capturas]
 *
 * También sirve contra el servidor de desarrollo (`VITE_FF_MEDICION=1 npx vite --config
 * vite.medicion.config.ts --port 5195 --strictPort`), pero ahí no hay service worker y se omite la parte
 * sin conexión (se informa).
 *
 * Tamaños: Pixel 7 (emulado) y PC 1366×768. Recorre el flujo 1–9: vehículo (elegido solo), presupuesto
 * (cotización ficticia o nuevo) sellado, iniciar, lectura inicial (con foto NO conservada), botones de
 * estado, finalizar, lectura final (foto conservada: se comprueba que se guarda SIN EXIF), km automáticos,
 * comparación, recargas parcial y llena, historial con filtros, exportaciones (descargas), respaldo e
 * importación sin duplicados, persistencia tras recargar, modo sin conexión, «borrar todo» con
 * confirmación propia. Exige 0 errores de consola, 0 diálogos nativos, 0 peticiones fuera de localhost y
 * sin desplazamiento horizontal.
 *
 * Contrato de #55: el presupuesto se sella con `crearPresupuesto`/`envolverOriginal`, la comparación es el
 * informe de `compararFicha` y el paquete descargado se IMPORTA con la CLI de Codex (`npm run campo --
 * fase0 importar`) en una carpeta temporal fuera del repositorio: el original llega idéntico, los motores
 * coinciden y la reimportación es idempotente. También se prueba que un respaldo con un sello alterado no
 * escribe nada.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = fileURLToPath(new URL('../', import.meta.url));

/** Importa el paquete con la CLI de #55 en una copia temporal mínima (sin tocar `calibracion/` del repo). */
function importarConCli(paquete) {
  const tmp = mkdtempSync(join(tmpdir(), 'medicion-cli-'));
  try {
    for (const p of ['src/shared/campo', 'src/engine', 'src/web/jobs.ts', 'scripts/campo', 'datos/pruebas-campo', 'package.json']) {
      mkdirSync(dirname(join(tmp, p)), { recursive: true });
      cpSync(join(raiz, p), join(tmp, p), { recursive: true });
    }
    symlinkSync(join(raiz, 'node_modules'), join(tmp, 'node_modules'), 'junction');
    const runner = join(dirname(require.resolve(join(raiz, 'node_modules/vite-node/package.json'))), 'vite-node.mjs');
    const cli = (...args) => execFileSync(process.execPath, [runner, 'scripts/campo/registro.ts', 'fase0', ...args], { cwd: tmp, encoding: 'utf8' }).trim();
    writeFileSync(join(tmp, 'paquete.json'), JSON.stringify(paquete), 'utf8');
    const primera = cli('importar', 'paquete.json');
    const informe = JSON.parse(readFileSync(join(tmp, cli('comparar', paquete.viajes[0].id).split(/\r?\n/).at(-1)), 'utf8'));
    const original = JSON.parse(readFileSync(join(tmp, 'calibracion', paquete.viajes[0].id, 'presupuesto-original.json'), 'utf8'));
    const segunda = cli('importar', 'paquete.json');
    return { primera, segunda, informe, original };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
const { chromium, devices } = require('playwright');
const { expect } = require('playwright/test');

const [base, sinFlag, capturas] = process.argv.slice(2);
const local = (u) => ['localhost', '127.0.0.1'].includes(new URL(u).hostname);
if (!base || !local(base) || (sinFlag && sinFlag !== '-' && !local(sinFlag))) {
  console.error('Uso: node scripts/e2e-medicion.mjs http://localhost:PUERTO [http://localhost:PUERTO-sin-flag | -] [carpeta-capturas]');
  process.exit(2);
}

const tamaños = [
  ['Pixel 7', { ...devices['Pixel 7'], timezoneId: 'America/Santiago', locale: 'es-CL' }, 'cotizacion'],
  ['PC 1366×768', { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, timezoneId: 'America/Santiago', locale: 'es-CL' }, 'nuevo'],
];

let ok = 0;
let fallas = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) ok++;
  else {
    fallas++;
    console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
};
const shot = async (page, nombre, etapa) => {
  if (capturas) await page.screenshot({ path: `${capturas}/medicion-${etapa}-${nombre.replace(/\W+/g, '-')}.png`, fullPage: true });
};
const sinScrollHorizontal = async (page, donde) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(`sin desplazamiento horizontal (${donde})`, sw <= iw, `${sw} > ${iw}`);
};
const tab = (page, nombre) => page.locator('.m-nav').getByRole('button', { name: nombre, exact: true }).click();

async function descargar(page, boton) {
  const [d] = await Promise.all([page.waitForEvent('download'), boton.click()]);
  const dir = mkdtempSync(join(tmpdir(), 'medicion-'));
  const ruta = join(dir, d.suggestedFilename());
  await d.saveAs(ruta);
  return { nombre: d.suggestedFilename(), ruta, texto: readFileSync(ruta, 'utf8') };
}

/** JPEG con un segmento APP1 «Exif» falso (GPS ficticio), para comprobar que la foto conservada lo pierde. */
async function jpegConExif(page) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#123456';
    x.fillRect(0, 0, 64, 32);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of u) s += String.fromCharCode(b);
    return btoa(s);
  });
  const jpeg = Buffer.from(b64, 'base64');
  const carga = Buffer.from('Exif\0\0GPS-FICTICIO-33.0-70.0 MODELO-FICTICIO', 'latin1');
  const largo = carga.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, largo >> 8, largo & 0xff]), carga]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

async function fotosGuardadas(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('medicion.v1');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const g = r.result.transaction('fotos').objectStore('fotos').getAll();
          g.onsuccess = async () => {
            const out = [];
            for (const f of g.result) {
              const u = new Uint8Array(await f.blob.arrayBuffer());
              let s = '';
              for (const b of u) s += String.fromCharCode(b);
              out.push({ tipo: f.blob.type, bytes: u.length, exif: s.includes('Exif'), gps: s.includes('GPS-FICTICIO') });
            }
            r.result.close();
            resolve(out);
          };
        };
      }),
  );
}

async function guardarLectura(page, id, valor) {
  const caja = page.locator(`[data-lectura="${id}"]`);
  await caja.locator('input[inputmode="decimal"]').fill(valor);
  await caja.getByRole('button', { name: 'Guardar lectura' }).click();
  await expect(caja.locator('.m-guardado')).toBeVisible();
}

async function recorrido(browser, nombre, opciones, camino) {
  console.log(`\n${nombre}`);
  const context = await browser.newContext({ ...opciones, acceptDownloads: true });
  const page = await context.newPage();
  const errores = [];
  const dialogos = [];
  const externas = [];
  page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('dialog', async (d) => {
    dialogos.push(d.message());
    await d.dismiss();
  });
  context.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['blob:', 'data:'].includes(u.protocol)) externas.push(r.url());
  });
  await page.clock.install({ time: new Date('2026-11-26T09:00:00-03:00') });

  // 1 · Vehículo: la primera vez, asistente; después se elige solo.
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Primero, tu vehículo' })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar vehículo' }).click();
  await page.getByLabel('Resolución del TRIP').fill('0,1');
  await page.getByLabel('Resolución del odómetro').fill('1');
  await page.getByLabel('Precio del combustible').fill('1290');
  await page.locator('#veh-kmL').fill('12,4');
  await sinScrollHorizontal(page, 'vehículo');
  await shot(page, nombre, '1-vehiculo');
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();
  await expect(page.locator('[data-vehiculo="veh-001"]')).toBeVisible();
  ok++; // Vehículo único elegido automáticamente.

  // 2 · Presupuesto previo, sellado.
  await tab(page, 'Viaje');
  if (camino === 'cotizacion') {
    await page.locator('[data-cotizacion-ficticia]').click();
    await expect(page.getByText('Origen: cotización v3 FICT-0001 (ficticia)')).toBeVisible();
    check('la cotización v3 trae km y procedencia', (await page.locator('#pres-km').inputValue()) === '18' && (await page.getByText('declarado · recorrido').count()) > 0);
    check('cotización: modalidad detallada (como el cotizador)', (await page.locator('[data-modalidad-opcion="detallada"]').getAttribute('aria-pressed')) === 'true');
  } else {
    await page.locator('[data-nuevo-presupuesto]').click();
    check('prellenado con los valores del vehículo', (await page.locator('#pres-precioLitro').inputValue()) === '1290' && (await page.locator('#pres-kmL').inputValue()) === '12,4');
    check('sin km no se puede sellar', await page.getByRole('button', { name: 'Sellar presupuesto' }).isDisabled());
    await page.locator('#pres-km').fill('18');
    await page.locator('#pres-marchaMin').fill('35');
    await page.locator('#pres-tag').fill('1800');
    check('modalidad simplificada por defecto y sin campo de gastos fijos', (await page.locator('[data-modalidad-opcion="simplificada"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('#pres-fijoHora').count()) === 0);
    await page.locator('[data-precision] summary').click();
    await page.locator('#pres-base').selectOption('neto');
    await page.locator('#pres-ajuste').selectOption('sin');
  }
  await expect(page.locator('[data-resumen-presupuesto]')).toContainText('Costo estimado por el motor vigente');
  await sinScrollHorizontal(page, 'presupuesto');
  await shot(page, nombre, '2-presupuesto');
  await page.getByRole('button', { name: 'Sellar presupuesto' }).click();
  await expect(page.locator('[data-presupuesto="viaje-001"]')).toBeVisible();
  ok++;

  // 3 · Iniciar (fecha, hora y zona automáticas).
  await page.locator('[data-iniciar]').click();
  await expect(page.locator('[data-aviso-conducir]')).toContainText('No manipules el teléfono mientras conduces');
  ok++;

  // 4 · Lectura inicial: foto para leer el número, SIN conservarla.
  const foto = await jpegConExif(page);
  await page.locator('[data-foto="inicial-trip"]').setInputFiles({ name: 'trip.jpg', mimeType: 'image/jpeg', buffer: foto });
  await expect(page.locator('[data-conservar="inicial-trip"]')).not.toBeChecked();
  await guardarLectura(page, 'inicial-trip', '0');
  await guardarLectura(page, 'inicial-odometro', '48201');
  check('foto no conservada por defecto', (await fotosGuardadas(page)).length === 0);

  // Botones de estado: sin escribir minutos.
  await page.clock.fastForward('20:00');
  await page.locator('.m-estados').getByRole('button', { name: 'Espera', exact: true }).click();
  await page.clock.fastForward('05:00');
  await page.locator('.m-estados').getByRole('button', { name: 'Carga', exact: true }).click();
  await page.clock.fastForward('10:00');
  await page.locator('.m-estados').getByRole('button', { name: 'En marcha', exact: true }).click();
  await page.clock.fastForward('15:00');
  await expect(page.locator('[data-estado-actual="marcha"]')).toBeVisible();
  await sinScrollHorizontal(page, 'viaje en curso');
  await shot(page, nombre, '3-en-curso');

  // 5 · Finalizar.
  await page.locator('[data-finalizar]').click();
  await expect(page.locator('[data-ficha="viaje-001"]')).toBeVisible();

  // 6 · Lectura final y km automáticos; foto conservada SIN EXIF.
  await guardarLectura(page, 'final-trip', '20,3');
  const cajaOdo = page.locator('[data-lectura="final-odometro"]');
  await cajaOdo.locator('[data-foto="final-odometro"]').setInputFiles({ name: 'odo.jpg', mimeType: 'image/jpeg', buffer: foto });
  await cajaOdo.locator('[data-conservar="final-odometro"]').check();
  await guardarLectura(page, 'final-odometro', '48222');
  const fotos = await fotosGuardadas(page);
  check('foto conservada re-codificada sin EXIF ni GPS', fotos.length === 1 && !fotos[0].exif && !fotos[0].gps && fotos[0].tipo === 'image/jpeg' && fotos[0].bytes > 0, JSON.stringify(fotos));
  check('la foto original sí tenía EXIF (control)', foto.includes(Buffer.from('Exif')));
  await expect(page.locator('[data-km]')).toContainText('20,3 km');
  await expect(page.locator('[data-tiempos]')).toContainText('marcha 35 min · espera 5 min · carga 10 min');
  ok += 2;
  await page.locator('[data-opciones="recorrido"]').getByRole('button', { name: 'Mixto' }).click();
  await page.locator('[data-opciones="carga"]').getByRole('button', { name: 'Sin carga' }).click();
  await page.locator('#comp-monto').fill('1800');
  await page.getByRole('button', { name: 'Agregar línea' }).click();
  await page.locator('[data-opciones="cobertura-peajes"]').getByRole('button', { name: 'Completa' }).click();
  await expect(page.getByText('doc-001-01')).toBeVisible();
  if (camino === 'nuevo') await page.locator('[data-opciones="base"]').getByRole('button', { name: 'Netos' }).click();

  // 7 · Comparación disponible, por partida, sin «aprobado».
  const cmp = page.locator('[data-comparacion]');
  await expect(cmp.locator('[data-estado-presupuesto]')).toHaveText('previo al viaje o simulación');
  await expect(cmp.locator('[data-partida="km"] [data-diferencia]')).toContainText('subestimación');
  await expect(cmp.locator('[data-partida="marchaMin"]')).toContainText('35 min');
  await expect(cmp.locator('[data-combustible]')).toContainText('sin asignación al viaje');
  await expect(cmp.locator('[data-partida="peajes"]')).toContainText('COMPROBADO');
  if (camino === 'nuevo') {
    // Misma base (neto) en el plan y en la observación: hay diferencia en pesos; los fijos quedan excluidos.
    await expect(cmp.locator('[data-partida="peajes"] [data-diferencia]')).toContainText('igual');
    await expect(cmp.locator('[data-partida="gastosFijos"] [data-estado-partida]')).toContainText('excluida');
  } else {
    // Sin base tributaria declarada: sin diferencia en pesos (no se inventa la base).
    check('sin base tributaria no hay diferencia en pesos', (await cmp.locator('[data-partida="peajes"] [data-diferencia]').count()) === 0);
  }
  await expect(cmp.locator('[data-criterios]')).toContainText('por aprobar en #12');
  const textoCmp = (await cmp.innerText()).replace(/por aprobar/g, '').replace(/«aprobado»/g, '');
  check('ningún «aprobado» del total', !/aprobad/i.test(textoCmp));
  await sinScrollHorizontal(page, 'comparación');
  await shot(page, nombre, '4-comparacion');

  // 8 · Recargas: parcial (lo normal) y llena; total automático.
  await tab(page, 'Combustible');
  await page.locator('#carga-litros').fill('31,82');
  await page.locator('#carga-precio').fill('1290');
  await expect(page.getByText('Automático: $41.048')).toBeVisible();
  await page.locator('#carga-odo').fill('48230');
  await page.locator('[data-guardar-carga]').click();
  await expect(page.locator('[data-cargas] li')).toHaveCount(1);
  await page.locator('#carga-litros').fill('20');
  await page.locator('#carga-precio').fill('1300');
  await page.getByRole('radiogroup', { name: 'Tipo de carga' }).getByRole('button', { name: 'Lleno' }).click();
  await page.locator('[data-guardar-carga]').click();
  await expect(page.locator('[data-cargas] li')).toHaveCount(2);
  ok++;
  await sinScrollHorizontal(page, 'combustible');
  await shot(page, nombre, '5-combustible');

  // 9 · Historial, filtros y exportación.
  await tab(page, 'Historial');
  await expect(page.locator('[data-viaje="viaje-001"]')).toBeVisible();
  await page.getByLabel('Filtrar por estado').selectOption('anulado');
  await expect(page.locator('[data-viaje]')).toHaveCount(0);
  await page.getByLabel('Filtrar por estado').selectOption('');
  await expect(page.locator('[data-viaje]')).toHaveCount(1);
  const viajes = await descargar(page, page.locator('[data-exportar="viajes"]'));
  check('viajes.csv con BOM, «;» y coma decimal', viajes.nombre === 'viajes.csv' && viajes.texto.startsWith('﻿id_viaje;') && viajes.texto.includes(';20,3;'));
  const cargas = await descargar(page, page.locator('[data-exportar="cargas"]'));
  check('cargas.csv', cargas.texto.includes(';31,82;1290;41048;'));
  const comp = await descargar(page, page.locator('[data-exportar="comparacion"]'));
  check('comparacion.csv (informe del contrato)', comp.texto.includes('viaje-001;km;km;previo al viaje o simulación;18;;20,3;MEDIDO;-2,3;'), comp.texto.split('\r\n').slice(0, 3).join(' | '));
  const paq = JSON.parse((await descargar(page, page.locator('[data-exportar="paquete"]'))).texto);
  check('paquete-medicion.json con ficha y original sellado v3', paq.formato === 1 && paq.viajes.length === 1 && paq.viajes[0].original?.datos?.version === 3 && paq.viajes[0].ficha.vehiculo === 'veh-001');
  try {
    const r = importarConCli(paq);
    check('CLI de #55: importa el paquete del teléfono', /importados: 1/.test(r.primera), r.primera);
    check('CLI de #55: original idéntico al exportado', JSON.stringify(r.original) === JSON.stringify(paq.viajes[0].original));
    check('CLI de #55: motores idénticos (VERSION_MOTOR)', r.informe.variacionCostoModelado.motores === 'idénticos', r.informe.variacionCostoModelado.motores);
    check('CLI de #55: reimportación idempotente', /identicos.*1/.test(r.segunda), r.segunda);
  } catch (e) {
    check('CLI de #55: importación del paquete', false, String(e.message).split('\n').slice(0, 4).join(' '));
  }
  const todo = viajes.texto + cargas.texto + comp.texto + JSON.stringify(paq);
  check('ninguna exportación lleva fotos', !/data:image|fotoId|Exif/.test(todo));
  const respaldo = await descargar(page, page.locator('[data-respaldo-exportar]'));
  await expect(page.locator('[data-ultima-copia]')).toContainText('Última copia hace 0 días');
  ok++;
  // Importar la misma copia: fusión por id, sin duplicados.
  await page.locator('[data-respaldo-importar]').setInputFiles(respaldo.ruta);
  await expect(page.locator('[data-resultado-importar]')).toContainText('Importado: 0 nuevos');
  await expect(page.locator('[data-viaje]')).toHaveCount(1);
  ok++;
  // Respaldo con un sello alterado: no se importa NADA (tampoco un viaje nuevo válido del mismo archivo).
  const malo = JSON.parse(respaldo.texto);
  malo.presupuestos[0].datos.plan.km = [99, 'DECLARADO'];
  malo.viajes.push({ ...malo.viajes[0], id: 'viaje-nuevo-falso', codigo: 'viaje-099', presupuestoId: null });
  const rutaMala = join(mkdtempSync(join(tmpdir(), 'medicion-')), 'respaldo-alterado.json');
  writeFileSync(rutaMala, JSON.stringify(malo), 'utf8');
  await page.locator('[data-respaldo-importar]').setInputFiles(rutaMala);
  await expect(page.locator('[data-resultado-importar]')).toContainText('no se importó nada');
  await expect(page.locator('[data-viaje]')).toHaveCount(1);
  ok++;
  await sinScrollHorizontal(page, 'historial');
  await shot(page, nombre, '6-historial');

  // Persistencia tras recargar.
  await page.reload();
  await tab(page, 'Historial');
  await expect(page.locator('[data-viaje="viaje-001"]')).toBeVisible();
  await expect(page.locator('[data-vehiculo="veh-001"]')).toBeVisible();
  ok++;

  // Sin conexión (solo con el build: service worker).
  const conSW = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const regs = await navigator.serviceWorker.getRegistrations();
    if (!regs.length) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
  if (!conSW) {
    console.log('  (sin service worker: servidor de desarrollo; la prueba sin conexión se omite)');
  } else {
    await page.reload(); // ahora la página queda controlada por el service worker
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await tab(page, 'Historial');
    await expect(page.locator('[data-viaje="viaje-001"]')).toBeVisible();
    // Sigue funcionando sin red: registrar una carga.
    await tab(page, 'Combustible');
    await page.locator('#carga-litros').fill('5');
    await page.locator('[data-guardar-carga]').click();
    await expect(page.locator('[data-cargas] li')).toHaveCount(3);
    await context.setOffline(false);
    ok += 2;
    console.log('  sin conexión: recarga y registro OK');
  }

  // Borrar todo con confirmación PROPIA (sin diálogos nativos).
  if (camino === 'nuevo') {
    await tab(page, 'Historial');
    await page.locator('[data-borrar-todo]').click();
    await expect(page.getByRole('alertdialog')).toContainText('No se puede deshacer');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('[data-viaje]')).toHaveCount(1);
    await page.locator('[data-borrar-todo]').click();
    await page.getByRole('button', { name: 'Sí, borrar todo' }).click();
    await tab(page, 'Viaje');
    await expect(page.getByRole('heading', { name: 'Primero, tu vehículo' })).toBeVisible();
    ok++;
  }

  check('0 errores de consola', errores.length === 0, errores.join(' | '));
  check('0 diálogos nativos (alert/confirm)', dialogos.length === 0, dialogos.join(' | '));
  check('0 peticiones fuera de localhost', externas.length === 0, externas.join(' | '));
  await context.close();
}

const browser = await chromium.launch();
try {
  for (const [nombre, opciones, camino] of tamaños) {
    try {
      await recorrido(browser, nombre, opciones, camino);
    } catch (e) {
      fallas++;
      console.log(`  FALLA (excepción) ${nombre}: ${e.message.split('\n').slice(0, 6).join(' ')}`);
    }
  }
  if (sinFlag && sinFlag !== '-') {
    const page = await browser.newPage();
    await page.goto(sinFlag);
    await expect(page.getByRole('heading', { name: 'Herramienta de medición desactivada' })).toBeVisible();
    const db = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
    check('sin la flag: «desactivada» y sin crear la base local', !db.includes('medicion.v1'), JSON.stringify(db));
    ok++;
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} comprobaciones OK, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
