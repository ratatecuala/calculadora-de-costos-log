/**
 * Prueba de punta a punta contra el STAGING REAL (Cloudflare + Supabase), en móvil y escritorio.
 * Sin secretos en el repositorio: credenciales desde archivos fuera de él.
 *
 *   STAGING_URL=https://<worker>.workers.dev \
 *   STAGING_SECRETS_FILE=/fuera/del/repo/cf_secrets.json   (usa STAGING_BASIC_AUTH) \
 *   TEST_USERS_FILE=/fuera/del/repo/test_users.json \
 *   OUT_DIR=/carpeta/para/capturas \
 *   node scripts/e2e-staging.mjs
 *
 * Flujos:
 *  1. Anónimo: ruta simulada → costos → precio → cotización → historial local → PDF.
 *  2. Con cuenta (A): copiar historial local → vehículo → cotizar → guardar → enlace →
 *     cerrar sesión → volver a entrar → recuperar vehículo y cotización → estado y pago.
 *  3. Otro dispositivo (contexto nuevo) con A: ve vehículo y cotización.
 *  4. Usuario B: no ve nada de A.
 *  5. Enlace público sin sesión: solo datos del cliente; revocado deja de funcionar.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright preinstalado de forma global (se resuelve con require, no con import).
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const URL_BASE = process.env.STAGING_URL;
const OUT = process.env.OUT_DIR ?? '.';
const [basicUser, ...rest] = JSON.parse(readFileSync(process.env.STAGING_SECRETS_FILE, 'utf8')).STAGING_BASIC_AUTH.split(':');
const httpCredentials = { username: basicUser, password: rest.join(':') };
const users = JSON.parse(readFileSync(process.env.TEST_USERS_FILE, 'utf8'));
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ proxy });
const external = new Set();
let routeCalls = 0;

async function newPage(device, name) {
  const ctx = await browser.newContext({ ...device, httpCredentials });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (r.url().includes('/api/route')) routeCalls += 1;
    if (!host.endsWith('workers.dev') && !host.endsWith('supabase.co')) external.add(host);
  });
  page.errors = errors;
  page.label = name;
  return { ctx, page };
}

async function calculate(page, { fuel = '1250', kmPerL = '10' } = {}) {
  await page.getByRole('button', { name: 'Cotizar', exact: true }).click();
  await page.getByLabel('Desde (A)').fill('Calle Uno 123, Ñuñoa');
  await page.getByLabel('Hasta (B)').fill('Avenida Dos 456, Las Condes');
  const fuelField = page.getByLabel(/^Precio (del combustible|de la gasolina|del diésel)/);
  await fuelField.fill(fuel);
  if (kmPerL) await page.getByLabel('Rendimiento').fill(kmPerL);
  await page.getByRole('button', { name: /Calcular ruta|Reintentar/ }).click();
  await page.getByText('Datos simulados.').first().waitFor({ timeout: 15000 });
  await page.getByLabel('Precio que vas a cobrar (neto)').fill('60000');
  // Si el costo cambió después de un precio anterior (p. ej., otro vehículo), la app pide confirmarlo.
  const keep = page.getByRole('button', { name: 'Mantener este precio' });
  if (await keep.count()) await keep.click();
}

async function createQuote(page, client, saveLabel) {
  await page.getByRole('button', { name: 'Crear cotización' }).click();
  await page.getByLabel('Cliente', { exact: true }).fill(client);
  await page.getByRole('button', { name: saveLabel }).click();
  await page.getByText('COTIZACIÓN').first().waitFor({ timeout: 15000 });
}

async function login(page, u) {
  await page.getByRole('button', { name: /^(Ingresar|Cuenta ✓)$/ }).click();
  await page.getByLabel('Correo').fill(u.email);
  await page.getByLabel('Contraseña').fill(u.password);
  await page.getByRole('button', { name: 'Entrar con usuario de prueba' }).click();
  await page.getByText('Sesión iniciada como').waitFor({ timeout: 15000 });
}

async function logout(page) {
  await page.getByRole('button', { name: 'Cuenta ✓' }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Ingresar' }).waitFor();
}

async function jobsText(page) {
  await page.getByRole('button', { name: 'Mis trabajos' }).click();
  await page.getByText(/Guardados (en tu cuenta|solo en este navegador)/).waitFor();
  // Esperar a que termine la carga (en móvil la lista llega después del encabezado).
  await page.getByText('Cargando…').waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  return page.locator('main').innerText();
}

const FORBIDDEN = /combustible|rendimiento|desgaste|margen|ganancia extra|costo del viaje|lo que pagas/i;

for (const [deviceName, device, user, tag] of [
  ['escritorio', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, users.a, 'E'],
  ['movil', devices['Pixel 7'], users.a, 'M'],
]) {
  const stamp = `${tag}${Date.now().toString().slice(-6)}`;
  const { ctx, page } = await newPage(device, deviceName);
  await page.goto(URL_BASE);

  // ---------- 1. Anónimo ----------
  check(`${deviceName}: aviso «sin respaldo» para anónimos`, (await page.getByText('sin respaldo en la nube').count()) > 0);
  await calculate(page);
  await createQuote(page, `Anónimo ${stamp}`, 'Guardar cotización');
  await page.emulateMedia({ media: 'print' });
  const printed = await page.locator('article.doc').innerText();
  check(`${deviceName}: PDF/impresión sin costos internos`, !FORBIDDEN.test(printed) && printed.includes(`Anónimo ${stamp}`));
  await page.pdf?.({ path: `${OUT}/${deviceName}-cotizacion.pdf` }).catch(() => undefined);
  await page.emulateMedia({ media: 'screen' });
  let txt = await jobsText(page);
  check(`${deviceName}: historial local muestra la cotización anónima`, txt.includes(`Anónimo ${stamp}`) && txt.includes('solo en este navegador'));

  // ---------- 2. Con cuenta ----------
  await login(page, user);
  const banner = page.getByRole('button', { name: 'Copiar a mi cuenta' });
  check(`${deviceName}: ofrece copiar el historial local`, (await banner.count()) > 0);
  if (await banner.count()) {
    await banner.click();
    await page.getByText(/^Listo: se copiaron/).waitFor({ timeout: 20000 });
  }
  txt = await jobsText(page);
  check(`${deviceName}: la cotización anónima quedó en la cuenta`, txt.includes(`Anónimo ${stamp}`) && txt.includes('Guardados en tu cuenta'));
  const copies = (txt.match(new RegExp(`Anónimo ${stamp}`, 'g')) ?? []).length;
  check(`${deviceName}: sin duplicados al copiar`, copies === 1, `${copies} copias`);
  // Numeración (A-47): el N° 1 local ya está ocupado en la cuenta → número interno nuevo y el
  // historial indica el número con que se emitió.
  const migratedRow = await page.locator('.job', { hasText: `Anónimo ${stamp}` }).innerText();
  check(`${deviceName}: la cotización copiada conserva su número emitido`, /emitida como N° 0001/.test(migratedRow), migratedRow.split('\n')[0]);

  await page.getByRole('button', { name: 'Mi vehículo' }).click();
  await page.getByRole('button', { name: '+ Agregar vehículo' }).click().catch(() => undefined);
  await page.getByLabel('Nombre para identificarlo').fill(`Camioneta ${stamp}`);
  await page.getByLabel('Rendimiento').fill('11');
  await page.getByLabel('Desgaste estimado').fill('40');
  await page.getByRole('button', { name: 'Guardar vehículo' }).click();
  await page.getByText(`Camioneta ${stamp}`).waitFor({ timeout: 15000 });
  await page.locator('.job', { hasText: `Camioneta ${stamp}` }).getByRole('button', { name: 'Usar en una cotización' }).click();
  await calculate(page, { kmPerL: null });
  await createQuote(page, `Cuenta ${stamp}`, 'Guardar en mi cuenta');
  await page.screenshot({ path: `${OUT}/${deviceName}-cotizacion-cuenta.png` });

  // Enlace público
  await page.getByRole('button', { name: 'Crear enlace' }).click();
  const link = (await page.locator('.share-link').innerText({ timeout: 15000 })).trim();
  check(`${deviceName}: enlace público con token largo`, /\/c\/[A-Za-z0-9_-]{43}$/.test(link));

  await logout(page);
  txt = await jobsText(page);
  check(`${deviceName}: al cerrar sesión no se ven datos de la cuenta`, !txt.includes(`Cuenta ${stamp}`) && txt.includes('solo en este navegador'));
  // Quinta auditoría (P1): ni vehículos ni borrador de la cuenta quedan a la vista.
  await page.getByRole('button', { name: 'Mi vehículo' }).click();
  await page.waitForTimeout(800);
  check(`${deviceName}: al cerrar sesión no se ve el vehículo de la cuenta`, (await page.getByText(`Camioneta ${stamp}`).count()) === 0);
  await page.getByRole('button', { name: 'Cotizar', exact: true }).click();
  check(`${deviceName}: al cerrar sesión el borrador de la cotización queda vacío`, (await page.getByLabel('Desde (A)').inputValue()) === '');
  // Otra cuenta en el MISMO navegador no ve nada de A.
  await login(page, users.b);
  txt = await jobsText(page);
  await page.getByRole('button', { name: 'Mi vehículo' }).click();
  await page.waitForTimeout(1500);
  check(
    `${deviceName}: B en el mismo navegador no ve vehículos ni cotizaciones de A`,
    (await page.getByText(`Camioneta ${stamp}`).count()) === 0 && !txt.includes(`Cuenta ${stamp}`),
  );
  await logout(page);

  await login(page, user);
  txt = await jobsText(page);
  check(`${deviceName}: al volver a entrar se recupera la cotización`, txt.includes(`Cuenta ${stamp}`));
  const row = page.locator('.job', { hasText: `Cuenta ${stamp}` });
  await row.getByLabel('Estado').selectOption('aceptada');
  await row.getByLabel('Pago').selectOption('recibido');
  await page.waitForTimeout(1500);
  await page.reload();
  txt = await jobsText(page);
  const row2 = page.locator('.job', { hasText: `Cuenta ${stamp}` });
  check(
    `${deviceName}: estado y pago persisten tras recargar`,
    (await row2.getByLabel('Estado').inputValue()) === 'aceptada' && (await row2.getByLabel('Pago').inputValue()) === 'recibido',
  );
  await page.getByRole('button', { name: 'Mi vehículo' }).click();
  check(`${deviceName}: el vehículo sigue en la cuenta`, (await page.getByText(`Camioneta ${stamp}`).count()) > 0);
  await page.screenshot({ path: `${OUT}/${deviceName}-vehiculos-cuenta.png`, fullPage: true });

  // ---------- 3. Otro dispositivo ----------
  const other = await newPage(device, `${deviceName}-otro`);
  await other.page.goto(URL_BASE);
  await login(other.page, user);
  txt = await jobsText(other.page);
  await other.page.getByRole('button', { name: 'Mi vehículo' }).click();
  const vehOther = await other.page.getByText(`Camioneta ${stamp}`).count();
  check(`${deviceName}: otro dispositivo recupera cotización y vehículo`, txt.includes(`Cuenta ${stamp}`) && vehOther > 0);
  await other.ctx.close();

  // ---------- 4. Usuario B ----------
  const b = await newPage(device, `${deviceName}-b`);
  await b.page.goto(URL_BASE);
  await login(b.page, users.b);
  txt = await jobsText(b.page);
  await b.page.getByRole('button', { name: 'Mi vehículo' }).click();
  const vehB = await b.page.getByText(`Camioneta ${stamp}`).count();
  check(`${deviceName}: el usuario B no ve nada de A`, !txt.includes(`Cuenta ${stamp}`) && !txt.includes(`Anónimo ${stamp}`) && vehB === 0);
  await b.ctx.close();

  // ---------- 5. Enlace público sin sesión ----------
  const pub = await newPage(device, `${deviceName}-publico`);
  await pub.page.goto(link);
  await pub.page.locator('article.doc').waitFor({ timeout: 15000 });
  const pubText = await pub.page.locator('main').innerText();
  check(`${deviceName}: enlace público muestra la cotización sin costos internos`, pubText.includes(`Cuenta ${stamp}`) && !FORBIDDEN.test(pubText));
  await pub.page.screenshot({ path: `${OUT}/${deviceName}-enlace-publico.png`, fullPage: true });

  // Revocar desde la cuenta y comprobar
  await page.getByRole('button', { name: 'Mis trabajos' }).click();
  await page.locator('.job', { hasText: `Cuenta ${stamp}` }).getByRole('button', { name: 'Ver cotización' }).click();
  await page.getByRole('button', { name: 'Desactivar' }).first().click();
  await page.waitForTimeout(1500);
  await pub.page.reload();
  await pub.page.getByText('Enlace no disponible').waitFor({ timeout: 15000 });
  check(`${deviceName}: el enlace revocado deja de funcionar`, true);
  await pub.ctx.close();

  check(`${deviceName}: sin errores de página`, page.errors.length === 0, page.errors.join(' | '));
  await logout(page);
  await ctx.close();
}

check('sin solicitudes a dominios externos', external.size === 0, [...external].join(','));
console.log(`Llamadas a /api/route: ${routeCalls}`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificaciones correctas`);
process.exit(failed.length ? 1 : 0);
