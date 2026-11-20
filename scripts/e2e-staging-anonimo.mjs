/**
 * Prueba de punta a punta contra el STAGING REAL, SIN cuentas (complementa e2e-staging.mjs).
 * Sirve cuando no se tienen a mano las contraseñas de los usuarios de prueba.
 * Sin secretos en el repositorio: el acceso privado se lee de un archivo fuera de él.
 *
 *   STAGING_URL=https://<worker>.workers.dev \
 *   STAGING_SECRETS_FILE=/fuera/del/repo/staging-secrets.json   (usa STAGING_BASIC_AUTH) \
 *   OUT_DIR=/carpeta/para/capturas \
 *   node scripts/e2e-staging-anonimo.mjs
 *
 * En PC (1440 y 1366) y teléfono (Pixel 7 e iPhone 13):
 *  - acceso privado; ruta simulada → costos → precio → cotización → historial local → PDF;
 *  - A-49/QA UX: pestañas visibles, sin desplazamiento horizontal, controles táctiles ≥ 44 px;
 *  - A-50: rótulo del margen, margen con decimales, aviso de texto inválido en un campo;
 *  - A-51: «Precio total» y leyenda en el documento, el PDF y WhatsApp;
 *  - 0 solicitudes a dominios externos y 0 errores de página.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const URL_BASE = process.env.STAGING_URL;
const OUT = process.env.OUT_DIR ?? '.';
const [basicUser, ...rest] = JSON.parse(readFileSync(process.env.STAGING_SECRETS_FILE, 'utf8')).STAGING_BASIC_AUTH.split(':');
const httpCredentials = { username: basicUser, password: rest.join(':') };
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;

const LEGEND = 'Esta cotización no es factura ni boleta.';
const FORBIDDEN = /Desglose|Lo que pagas en el viaje|Desgaste del vehículo|gastos fijos|Lo que quieres ganar/i;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ proxy });

// Sin credenciales: el sitio sigue privado.
{
  const ctx = await browser.newContext();
  const res = await (await ctx.newPage()).goto(URL_BASE);
  check('sin credenciales: el sitio responde 401', res.status() === 401, String(res.status()));
  await ctx.close();
}

const stamp = Date.now().toString(36);
for (const [name, device] of [
  ['PC 1440', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
  ['PC 1366', { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }],
  ['teléfono Pixel 7', devices['Pixel 7']],
  ['teléfono iPhone 13', devices['iPhone 13']],
]) {
  const ctx = await browser.newContext({ ...device, httpCredentials });
  const page = await ctx.newPage();
  const errors = [];
  const external = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!host.endsWith('workers.dev') && !host.endsWith('supabase.co')) external.add(host);
  });

  const res = await page.goto(URL_BASE);
  check(`${name}: acceso con las credenciales nuevas`, res.status() === 200, String(res.status()));
  await page.getByLabel('Desde (A)').waitFor({ timeout: 15000 });

  const layout = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('nav button, [role="tab"]')];
    const offscreen = tabs.filter((t) => {
      const r = t.getBoundingClientRect();
      return r.right > innerWidth + 1 || r.left < -1;
    }).length;
    return { hscroll: document.documentElement.scrollWidth > innerWidth, tabs: tabs.length, offscreen };
  });
  check(`${name}: sin desplazamiento horizontal`, !layout.hscroll);
  check(`${name}: todas las pestañas dentro de la pantalla`, layout.tabs > 0 && layout.offscreen === 0, `${layout.tabs} pestañas`);

  // Flujo anónimo.
  await page.getByLabel('Desde (A)').fill('Calle Uno 123, Ñuñoa');
  await page.getByLabel('Hasta (B)').fill('Avenida Dos 456, Las Condes');
  await page.getByLabel(/^Precio (del combustible|de la gasolina|del diésel)/).fill('1250');
  await page.getByLabel('Rendimiento').fill('10');
  await page.getByRole('button', { name: /Calcular ruta/ }).click();
  await page.getByText('Datos simulados.').first().waitFor({ timeout: 15000 });
  check(`${name}: ruta simulada calculada y rotulada`, true);

  // A-50: aviso de texto inválido (P2).
  const peajes = page.getByLabel(/^Peajes/).first();
  await peajes.fill('-5000');
  await peajes.blur();
  const invalidShown = (await peajes.getAttribute('aria-invalid')) === 'true' && (await page.getByRole('alert').filter({ hasText: 'No es un número válido' }).count()) > 0;
  await peajes.fill('');
  await peajes.blur();
  const emptyClean = (await peajes.getAttribute('aria-invalid')) === null;
  check(`${name}: «-5000» en peajes muestra el aviso; vacío no`, invalidShown && emptyClean);

  // A-50: rótulo y margen con decimales.
  const body = await page.locator('body').innerText();
  check(`${name}: rótulo «Margen objetivo (% del precio de venta)»`, body.includes('Margen objetivo (% del precio de venta)'));
  await page.getByRole('button', { name: 'Otro' }).click();
  const margin = page.getByLabel(/^Margen objetivo/).first();
  await margin.fill('12,5');
  await margin.blur();
  check(`${name}: margen 12,5 % se muestra «12,5»`, (await margin.inputValue()) === '12,5', await margin.inputValue());

  // Controles táctiles en teléfono.
  if (name.startsWith('teléfono')) {
    // Se mide el área que se toca: la caja del campo o la etiqueta que lo envuelve. Los enlaces
    // dentro de un párrafo («Regístralo») son una excepción permitida (WCAG 2.5.8, texto en línea).
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, input, select, summary, a.btn')]
        .filter((el) => el.offsetParent !== null)
        .filter((el) => !(el.closest('p') && getComputedStyle(el).display.startsWith('inline')))
        .map((el) => el.closest('.field-input') ?? el.closest('label') ?? el)
        .filter((target) => target.getBoundingClientRect().height < 43.5).length,
    );
    check(`${name}: controles táctiles de al menos 44 px`, small === 0, `${small} menores`);
  }

  await page.getByLabel('Precio que vas a cobrar').fill('60000');
  const keep = page.getByRole('button', { name: 'Mantener este precio' });
  if (await keep.count()) await keep.click();
  await page.getByRole('button', { name: 'Crear cotización' }).click();
  await page.getByLabel('Cliente', { exact: true }).fill(`Anónimo ${stamp}`);
  await page.getByRole('button', { name: 'Guardar cotización' }).click();
  await page.getByText('COTIZACIÓN').first().waitFor({ timeout: 15000 });

  const doc = await page.locator('body').innerText();
  check(`${name}: cotización con «Precio total» y sin «Valor neto»`, doc.includes('Precio total') && !doc.includes('Valor neto'));
  check(`${name}: leyenda «${LEGEND}»`, doc.includes(LEGEND));
  const wa = await page.locator('a[href*="wa.me"]').first().getAttribute('href');
  const waText = decodeURIComponent(wa ?? '');
  check(`${name}: WhatsApp con «Precio total» y leyenda`, waText.includes('Precio total: $60.000') && waText.includes(LEGEND));

  await page.emulateMedia({ media: 'print' });
  const printed = await page.locator('body').innerText();
  await page.pdf({ path: `${OUT}/staging-${name.replace(/\W+/g, '-')}.pdf` });
  await page.emulateMedia({ media: 'screen' });
  check(`${name}: PDF/impresión sin costos internos y con leyenda`, !FORBIDDEN.test(printed) && printed.includes(LEGEND));

  await page.getByRole('button', { name: /Mis trabajos/ }).first().click();
  const jobs = await page.locator('body').innerText();
  check(`${name}: historial local muestra la cotización`, jobs.includes(`Anónimo ${stamp}`));
  await page.screenshot({ path: `${OUT}/staging-${name.replace(/\W+/g, '-')}.png`, fullPage: true });

  check(`${name}: 0 errores de página`, errors.length === 0, errors.join(' | '));
  check(`${name}: 0 solicitudes a dominios externos`, external.size === 0, [...external].join(', '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificaciones correctas`);
process.exit(failed ? 1 : 0);
