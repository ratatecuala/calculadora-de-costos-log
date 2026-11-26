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
 * confirmación propia. Exige 0 errores de consola, 0 diálogos nativos, 0 peticiones fuera del origen y
 * sin desplazamiento horizontal. También: uso personal sin datos contables, simplificada↔detallada sin
 * perder datos, «no aplica», objetivos exploratorios de #12 y litros asignados como ESTIMADO.
 *
 * Despliegue privado con contraseña: con MEDICION_AUTH="usuario:contraseña" todos los contextos usan
 * httpCredentials y se admite el origen de las URL dadas (no solo localhost). El valor nunca se imprime.
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
// MEDICION_AUTH="usuario:contraseña" (opcional): contextos con httpCredentials para un despliegue privado
// protegido con contraseña. El valor NUNCA se imprime. Sin ella, solo se admiten servidores locales.
const auth = (() => {
  const v = process.env.MEDICION_AUTH;
  if (!v) return null;
  const i = v.indexOf(':');
  if (i < 1) {
    console.error('MEDICION_AUTH debe tener la forma usuario:contraseña (no se muestra el valor).');
    process.exit(2);
  }
  return { username: v.slice(0, i), password: v.slice(i + 1) };
})();
const valida = (u) => {
  try {
    return auth ? ['http:', 'https:'].includes(new URL(u).protocol) : local(u);
  } catch {
    return false;
  }
};
if (!base || !valida(base) || (sinFlag && sinFlag !== '-' && !valida(sinFlag))) {
  console.error('Uso: node scripts/e2e-medicion.mjs http://localhost:PUERTO [http://localhost:PUERTO-sin-flag | -] [carpeta-capturas]');
  process.exit(2);
}

// Orígenes permitidos: los servidores locales y, con MEDICION_AUTH, el origen de las URL dadas.
const origenes = new Set([base, sinFlag].filter((u) => u && u !== '-').map((u) => new URL(u).origin));
const permitida = (u) => ['blob:', 'data:'].includes(u.protocol) || ['localhost', '127.0.0.1'].includes(u.hostname) || origenes.has(u.origin);
const contextoBase = auth ? { httpCredentials: auth } : {};

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
  if (capturas) await page.evaluate(() => window.scrollTo(0, 0));
  if (capturas) await page.screenshot({ path: `${capturas}/medicion-${etapa}-${nombre.replace(/\W+/g, '-')}.png`, fullPage: true });
};
const sinScrollHorizontal = async (page, donde) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(`sin desplazamiento horizontal (${donde})`, sw <= iw, `${sw} > ${iw}`);
};
const tab = (page, nombre) => page.locator('.m-nav').getByRole('button', { name: nombre, exact: true }).click();
/** Abre un bloque plegado («Opciones avanzadas», «Más opciones») si está cerrado. */
const abrir = async (page, selector) => {
  const d = page.locator(selector).first();
  if ((await d.getAttribute('open')) === null) await d.locator('> summary').click();
};
const barraOculta = async (page) => (await page.locator('.m-nav').count()) === 0;
const pulsado = async (loc) => (await loc.getAttribute('aria-pressed')) === 'true';

/** Registros de una colección de IndexedDB (lectura directa, sin la interfaz). */
async function registros(page, coleccion) {
  return page.evaluate(
    (nombre) =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open('medicion.v1');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const g = r.result.transaction(nombre).objectStore(nombre).getAll();
          g.onsuccess = () => {
            r.result.close();
            resolve(g.result);
          };
          g.onerror = () => reject(g.error);
        };
      }),
    coleccion,
  );
}

/**
 * Alta guiada en 4 pasos (A-92). Pixel 7: «No lo sé» en todo y retroceso sin perder datos. PC: tablero
 * conocido y rendimiento declarado (valor ficticio). En ambos, la barra inferior no existe durante el alta.
 */
async function altaGuiada(page, nombre, camino) {
  const paso = async (n, titulo) => {
    await expect(page.getByText(`Paso ${n} de 4`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    check(`alta paso ${n}: barra inferior oculta`, await barraOculta(page));
    check(`alta paso ${n}: sin patente ni turbo`, (await page.getByText(/patente|turbo/i).count()) === 0);
    await sinScrollHorizontal(page, `alta paso ${n}`);
  };
  const siguiente = () => page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  const atras = () => page.getByRole('button', { name: 'Atrás', exact: true }).click();
  await paso(1, '¿Qué vehículo conduces?');
  for (const t of ['Auto / SUV', 'Camioneta', 'Furgón', 'Camión liviano']) await expect(page.getByRole('button', { name: t, exact: true })).toBeVisible();
  check('paso 1: «Siguiente» exige el tipo', await page.getByRole('button', { name: 'Siguiente', exact: true }).isDisabled());
  check('paso 1: restaurar copia disponible antes del alta', (await page.getByRole('button', { name: 'Restaurar una copia de seguridad' }).count()) === 1);
  await shot(page, nombre, 'alta-1');
  if (camino === 'cotizacion') {
    await page.getByRole('button', { name: 'Auto / SUV', exact: true }).click();
    await siguiente();
    await paso(2, 'Identifica tu vehículo');
    await page.getByLabel('Marca').fill('Marca ficticia');
    await page.getByLabel('Modelo').fill('Modelo de prueba');
    await page.getByLabel('Año').fill('2019');
    await page.getByRole('group', { name: 'Combustible' }).getByRole('button', { name: 'No lo sé' }).click();
    await shot(page, nombre, 'alta-2');
    await atras();
    await paso(1, '¿Qué vehículo conduces?');
    check('retroceder conserva el tipo', await pulsado(page.getByRole('button', { name: 'Auto / SUV', exact: true })));
    await siguiente();
    check(
      'retroceder conserva lo escrito en el paso 2',
      (await page.getByLabel('Marca').inputValue()) === 'Marca ficticia' &&
        (await page.getByLabel('Año').inputValue()) === '2019' &&
        (await page.getByLabel('Motor (cilindrada)').inputValue()) === '' &&
        (await pulsado(page.getByRole('group', { name: 'Combustible' }).getByRole('button', { name: 'No lo sé' }))),
    );
    await siguiente();
    await paso(3, 'Conozcamos tu tablero');
    await expect(page.locator('[data-ilustracion="tablero"]')).toBeVisible();
    await page.getByRole('group', { name: '¿Tu TRIP muestra decimales?' }).getByRole('button', { name: 'No lo sé' }).click();
    await page.getByRole('group', { name: '¿Y el kilometraje total?' }).getByRole('button', { name: 'No lo sé' }).click();
    await page.locator('[data-ayuda-tablero] summary').click();
    await shot(page, nombre, 'alta-3');
    await siguiente();
    await paso(4, '¿Cuánto combustible consume tu vehículo?');
    await page.getByRole('button', { name: /No lo sé todavía/ }).click();
    await shot(page, nombre, 'alta-4');
    await atras();
    await paso(3, 'Conozcamos tu tablero');
    check('retroceder conserva las respuestas del tablero', await pulsado(page.getByRole('group', { name: '¿Tu TRIP muestra decimales?' }).getByRole('button', { name: 'No lo sé' })));
    await siguiente();
    check('el paso 4 conserva «No lo sé todavía»', await pulsado(page.getByRole('button', { name: /No lo sé todavía/ })));
  } else {
    await page.getByRole('button', { name: 'Camioneta', exact: true }).click();
    await siguiente();
    await paso(2, 'Identifica tu vehículo');
    await page.getByRole('group', { name: 'Combustible' }).getByRole('button', { name: 'Bencina' }).click();
    await siguiente();
    await paso(3, 'Conozcamos tu tablero');
    await page.getByRole('group', { name: '¿Tu TRIP muestra decimales?' }).getByRole('button', { name: /Sí, con decimal/ }).click();
    await page.getByRole('group', { name: '¿Y el kilometraje total?' }).getByRole('button', { name: /Solo enteros/ }).click();
    await siguiente();
    await paso(4, '¿Cuánto combustible consume tu vehículo?');
    await page.getByRole('button', { name: /Mi tablero muestra el consumo/ }).click();
    await page.getByRole('button', { name: /El instantáneo/ }).click();
    await page.getByLabel('El número que muestra').fill('8');
    await page.getByRole('button', { name: /Litros cada 100 km/ }).click();
    await expect(page.locator('[data-consumo-instantaneo]')).toBeVisible();
    ok++; // El consumo instantáneo no se ofrece como rendimiento.
    await page.getByRole('button', { name: /Conozco mi rendimiento/ }).click();
    await page.getByLabel('Tu rendimiento').fill('12,4');
    await page.getByRole('button', { name: /Kilómetros por litro/ }).click();
    await expect(page.locator('[data-rendimiento-resultado]')).toContainText('12,4 km/L');
    ok++;
  }
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();
  await expect(page.locator('.m-nav')).toBeVisible();
  for (const t of ['Inicio', 'Combustible', 'Historial', 'Vehículo']) await expect(page.locator('.m-nav').getByRole('button', { name: t, exact: true })).toBeVisible();
  const [v] = await registros(page, 'vehiculos');
  if (camino === 'cotizacion') {
    check(
      '«No lo sé» en todo: desconocido en IndexedDB (nunca 0 ni inventado)',
      v.porDefecto.kmL.valor === null && v.porDefecto.kmL.procedencia.clase === 'faltante' && v.resolucionTripKm === null && v.resolucionOdometroKm === null && v.combustible === null && v.perfil.marca === 'Marca ficticia',
      JSON.stringify(v),
    );
  } else {
    check(
      'tablero y rendimiento declarados: 0,1 km, 1 km y 12,4 km/L declarado',
      v.resolucionTripKm === 0.1 && v.resolucionOdometroKm === 1 && v.porDefecto.kmL.valor === 12.4 && v.porDefecto.kmL.procedencia.clase === 'declarado' && v.combustible === 'gasolina',
      JSON.stringify(v),
    );
  }
  check('alias interno automático', v.alias === 'veh-001');
  // Pantalla principal.
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  for (const t of [/Mi vehículo/, /Iniciar viaje/, /Registrar recarga/, /Mis viajes/]) await expect(page.getByRole('button', { name: t })).toBeVisible();
  await sinScrollHorizontal(page, 'inicio');
  await shot(page, nombre, 'inicio');
  // Ayuda accesible después del alta.
  await page.getByRole('button', { name: 'Ayuda', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '¿Cómo funciona?' })).toBeVisible();
  await expect(page.locator('[data-ilustracion="boleta"]')).toContainText('20,000 L × $1.000 = $20.000');
  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  ok += 2;
}

/** Un vehículo del FORMATO ANTERIOR (sin perfil) abre Inicio sin repetir el alta; editarlo no reinterpreta nada. */
async function formatoAnterior(browser) {
  console.log('\nVehículo del formato anterior');
  const context = await browser.newContext({ ...devices['Pixel 7'], ...contextoBase, timezoneId: 'America/Santiago', locale: 'es-CL' });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  const viejo = {
    id: 'v-anterior',
    formato: 1,
    alias: 'veh-001',
    tipoVehiculo: 'camioneta',
    combustible: 'diesel',
    resolucionTripKm: 0.1,
    resolucionOdometroKm: 1,
    capacidadEstanqueL: null,
    porDefecto: {
      precioLitro: { valor: null, procedencia: { clase: 'faltante', fuente: { tipo: 'vehiculo', detalle: null }, fecha: null, vigenteDesde: null, vigenteHasta: null, version: null }, fuentePrecio: null },
      kmL: { valor: 9.5, procedencia: { clase: 'medido', fuente: { tipo: 'vehiculo', detalle: null }, fecha: '2026-11-01', vigenteDesde: null, vigenteHasta: null, version: null } },
      desgasteKm: { valor: null, procedencia: { clase: 'faltante', fuente: { tipo: 'vehiculo', detalle: null }, fecha: null, vigenteDesde: null, vigenteHasta: null, version: null } },
      fijoHora: { valor: null, procedencia: { clase: 'faltante', fuente: { tipo: 'vehiculo', detalle: null }, fecha: null, vigenteDesde: null, vigenteHasta: null, version: null } },
      trabajoHora: { valor: null, procedencia: { clase: 'faltante', fuente: { tipo: 'vehiculo', detalle: null }, fecha: null, vigenteDesde: null, vigenteHasta: null, version: null } },
    },
    creadoEl: '2026-11-01T08:00:00.000-03:00',
    editadoEl: '2026-11-01T08:00:00.000-03:00',
  };
  await page.goto(base);
  await expect(page.getByText('Paso 1 de 4')).toBeVisible();
  // Se siembra la base como la dejó una versión anterior y se recarga.
  await page.evaluate(async (v) => {
    const bd = await new Promise((ok, mal) => {
      const r = indexedDB.open('medicion.v1');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
    await new Promise((ok, mal) => {
      const tx = bd.transaction('vehiculos', 'readwrite');
      tx.objectStore('vehiculos').put(v);
      tx.oncomplete = ok;
      tx.onerror = () => mal(tx.error);
    });
    bd.close();
  }, viejo);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
  check('formato anterior: abre Inicio sin repetir el alta', !(await barraOculta(page)));
  await tab(page, 'Vehículo');
  const resumen = page.locator('[data-resumen-vehiculo]');
  await expect(resumen).toContainText('Camioneta');
  await expect(resumen).toContainText('9,5 km/L (medido con tus recargas)');
  await expect(resumen).toContainText('avanza de a 0,1 km');
  ok += 2;
  await page.getByRole('button', { name: 'Cambiar datos' }).click();
  check('editar: el alta reconoce el tipo anterior', await pulsado(page.getByRole('button', { name: 'Camioneta', exact: true })));
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  check('editar: combustible anterior', await pulsado(page.getByRole('group', { name: 'Combustible' }).getByRole('button', { name: 'Diésel' })));
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  check('editar: TRIP con decimal deducido de 0,1 km', await pulsado(page.getByRole('group', { name: '¿Tu TRIP muestra decimales?' }).getByRole('button', { name: /Sí, con decimal/ })));
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();
  await expect(page.locator('[data-resumen-vehiculo]')).toBeVisible();
  const [v] = await registros(page, 'vehiculos');
  check('editar sin responder el paso 4 conserva el rendimiento MEDIDO tal cual', JSON.stringify(v.porDefecto) === JSON.stringify(viejo.porDefecto) && v.id === viejo.id && v.alias === 'veh-001', JSON.stringify(v.porDefecto.kmL));
  check('formato anterior: 0 errores', errores.length === 0, errores.join(' | '));
  await context.close();
}

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
  const context = await browser.newContext({ ...opciones, ...contextoBase, acceptDownloads: true });
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
    if (!permitida(u)) externas.push(r.url());
  });
  await page.clock.install({ time: new Date('2026-11-26T09:00:00-03:00') });

  // 1 · Alta guiada en 4 pasos (A-92), sin barra inferior; después, Inicio.
  await page.goto(base);
  await altaGuiada(page, nombre, camino);
  await expect(page.locator('[data-vehiculo="veh-001"]')).toBeVisible();
  ok++; // Vehículo único elegido automáticamente.

  // 2 · Presupuesto previo, sellado.
  await page.getByRole('button', { name: /Iniciar viaje/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nuevo viaje' })).toBeVisible();
  if (camino === 'cotizacion') {
    await abrir(page, '[data-mas-opciones]');
    await page.locator('[data-cotizacion-ficticia]').click();
    await expect(page.getByText('Origen: cotización v3 FICT-0001 (ficticia)')).toBeVisible();
    check('procedencia técnica plegada por defecto', (await page.getByText('declarado · recorrido').count()) === 0);
    await abrir(page, '[data-avanzado="presupuesto"]');
    await page.locator('[data-ver-origen]').check();
    check('la cotización v3 trae km y procedencia', (await page.locator('#pres-km').inputValue()) === '18' && (await page.getByText('declarado · recorrido').count()) > 0);
    // Uso personal (A-91): solo gastos pagados; sin modalidad, remuneración, margen ni gastos fijos.
    check(
      'uso personal: sin modalidad, remuneración, margen ni gastos fijos',
      (await page.locator('[data-modalidad-personal]').count()) === 1 &&
        (await page.locator('[data-modalidad]').count()) === 0 &&
        (await page.locator('#pres-trabajoHora').count()) === 0 &&
        (await page.locator('#pres-margenPct').count()) === 0 &&
        (await page.locator('#pres-fijoHora').count()) === 0,
    );
  } else {
    // Simulación: simplificada por defecto; cambiar a detallada y volver no pierde lo escrito.
    await abrir(page, '[data-mas-opciones]');
    await page.getByRole('button', { name: 'Simulación (ficticia)' }).click();
    await page.locator('[data-nuevo-presupuesto]').click();
    check('opciones avanzadas plegadas: sin modalidad ni desgaste a la vista', !(await page.locator('[data-modalidad-opcion="simplificada"]').isVisible()) && !(await page.locator('#pres-desgasteKm').isVisible()));
    await abrir(page, '[data-avanzado="presupuesto"]');
    check('simulación: modalidad simplificada por defecto y sin gastos fijos', (await page.locator('[data-modalidad-opcion="simplificada"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('#pres-fijoHora').count()) === 0);
    await page.locator('[data-modalidad-opcion="detallada"]').click();
    await page.locator('#pres-fijoHora').fill('3000');
    await page.locator('[data-modalidad-opcion="simplificada"]').click();
    check('simplificada oculta los gastos fijos', (await page.locator('#pres-fijoHora').count()) === 0);
    await page.locator('[data-modalidad-opcion="detallada"]').click();
    check('volver a detallada conserva lo escrito', (await page.locator('#pres-fijoHora').inputValue()) === '3000');
    // «No aplica» oculta los campos de la partida y los conserva al desmarcar.
    await page.locator('#pres-tag').fill('700');
    await page.locator('[data-no-aplica="peajes"]').check();
    check('«no aplica» oculta el TAG', (await page.locator('#pres-tag').count()) === 0);
    await page.locator('[data-no-aplica="peajes"]').uncheck();
    check('desmarcar «no aplica» conserva el TAG', (await page.locator('#pres-tag').inputValue()) === '700');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await abrir(page, '[data-mas-opciones]');
    await page.getByRole('button', { name: 'Uso personal' }).click();
    await page.locator('[data-nuevo-presupuesto]').click();
    check('prellenado con el rendimiento del alta; el precio no se inventa', (await page.locator('#pres-precioLitro').inputValue()) === '' && (await page.locator('#pres-kmL').inputValue()) === '12,4');
    check('sin km no se puede guardar', await page.getByRole('button', { name: 'Guardar estimación' }).isDisabled());
    await page.locator('#pres-precioLitro').fill('1290');
    await page.locator('#pres-fuente').selectOption('boleta');
    await page.locator('#pres-km').fill('18');
    await page.locator('#pres-marchaMin').fill('35');
    await page.locator('#pres-tag').fill('1800');
    check('uso personal: modalidad simplificada fija y sin gastos fijos', (await page.locator('[data-modalidad-personal]').count()) === 1 && (await page.locator('#pres-fijoHora').count()) === 0);
    await abrir(page, '[data-avanzado="presupuesto"]');
    await page.locator('#pres-base').selectOption('neto');
    await page.locator('#pres-ajuste').selectOption('sin');
  }
  await expect(page.locator('[data-resumen-presupuesto]')).toContainText('Costo estimado');
  await sinScrollHorizontal(page, 'presupuesto');
  await shot(page, nombre, '2-presupuesto');
  await page.getByRole('button', { name: 'Guardar estimación' }).click();
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
  await page.getByRole('button', { name: 'Agregar monto' }).click();
  await page.locator('[data-opciones="cobertura-peajes"]').getByRole('button', { name: 'Está todo' }).click();
  await expect(page.getByText('doc-001-01')).toBeVisible();
  if (camino === 'nuevo') {
    await abrir(page, '[data-avanzado="ficha"]');
    await page.locator('[data-opciones="base"]').getByRole('button', { name: 'Netos' }).click();
  }

  // 7 · Comparación disponible, por partida, sin «aprobado».
  const cmp = page.locator('[data-comparacion]');
  await expect(cmp.locator('[data-estado-presupuesto]')).toHaveText('previo al viaje o simulación');
  await expect(cmp.locator('[data-partida="km"] [data-diferencia]')).toContainText('subestimación');
  await expect(cmp.locator('[data-partida="marchaMin"]')).toContainText('35 min');
  await expect(cmp.locator('[data-resumen-simple]')).toContainText('20,3 km');
  check('detalle técnico de la comparación plegado por defecto', !(await cmp.locator('[data-estado-presupuesto]').isVisible()));
  await expect(cmp.locator('[data-combustible]')).toContainText('Sin asignación al viaje');
  await expect(cmp.locator('[data-litros-asignados]')).toContainText('DATO FALTANTE');
  await expect(cmp.locator('[data-cobertura-partida="peajes"]')).toContainText('cobertura completa');
  await expect(cmp.locator('[data-objetivo-viaje]')).toContainText('objetivo exploratorio');
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
  await shot(page, nombre, 'ficha');

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
  check('Historial: estadísticas internas plegadas', !(await page.locator('[data-objetivos-calcular]').isVisible()));
  await abrir(page, '[data-avanzado="historial"]');
  await page.locator('[data-objetivos-calcular]').click();
  await expect(page.locator('[data-objetivos-resumen]')).toBeVisible();
  check('objetivos exploratorios (#12): denominador y leyenda, nunca «aprobado»', /exploratorios/.test(await page.locator('[data-objetivos]').innerText()) && !/aprobad[oa]/i.test(await page.locator('[data-objetivos]').innerText()));
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

  // Persistencia tras recargar: abre Inicio, sin repetir el alta.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
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
    await abrir(page, '[data-avanzado="historial"]');
    await page.locator('[data-borrar-todo]').click();
    await expect(page.getByRole('alertdialog')).toContainText('No se puede deshacer');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('[data-viaje]')).toHaveCount(1);
    await page.locator('[data-borrar-todo]').click();
    await page.getByRole('button', { name: 'Sí, borrar todo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '¿Qué vehículo conduces?' })).toBeVisible();
    check('tras borrar todo vuelve el alta, sin barra inferior', await barraOculta(page));
    ok++;
  }

  check('0 errores de consola', errores.length === 0, errores.join(' | '));
  check('0 diálogos nativos (alert/confirm)', dialogos.length === 0, dialogos.join(' | '));
  check('0 peticiones fuera del origen', externas.length === 0, externas.join(' | '));
  await context.close();
}

// Un destino remoto (Worker privado) se alcanza por el proxy del entorno, si existe; localhost nunca.
const proxyRemoto = process.env.HTTPS_PROXY && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
  ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
  : undefined;
const browser = await chromium.launch(proxyRemoto ? { proxy: proxyRemoto } : {});
try {
  for (const [nombre, opciones, camino] of tamaños) {
    try {
      await recorrido(browser, nombre, opciones, camino);
    } catch (e) {
      fallas++;
      console.log(`  FALLA (excepción) ${nombre}: ${e.message.split('\n').slice(0, 6).join(' ')}`);
    }
  }
  try {
    await formatoAnterior(browser);
  } catch (e) {
    fallas++;
    console.log(`  FALLA (excepción) formato anterior: ${e.message.split('\n').slice(0, 6).join(' ')}`);
  }
  if (sinFlag && sinFlag !== '-') {
    const ctxSin = await browser.newContext(contextoBase);
    const page = await ctxSin.newPage();
    await page.goto(sinFlag);
    await expect(page.getByRole('heading', { name: 'Herramienta de medición desactivada' })).toBeVisible();
    const db = await page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
    check('sin la flag: «desactivada» y sin crear la base local', !db.includes('medicion.v1'), JSON.stringify(db));
    ok++;
    await ctxSin.close();
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} comprobaciones OK, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
