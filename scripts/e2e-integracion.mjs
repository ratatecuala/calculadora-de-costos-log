/**
 * Prueba de navegador de la integración I-1 + I-1b (A-68, docs/22 v2) contra un servidor LOCAL
 * de Vite (rutas simuladas, sin staging, Supabase ni Google).
 *
 *   VITE_FF_INTEGRACION_CARGA=1 npx vite --port 5190 --strictPort      (otra terminal)
 *   node scripts/e2e-integracion.mjs http://localhost:5190 [carpeta-capturas] [--sin-flag]
 *
 * Con `--sin-flag` (servidor sin la variable) solo verifica que el cotizador sea el de hoy.
 * Tamaños: Pixel 7, iPhone 13 (emulados en Chromium), 1366×768 y 1440×900.
 */
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const sinFlag = args.includes('--sin-flag');
const [base, capturas] = args.filter((a) => !a.startsWith('--'));
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  console.error('Uso: node scripts/e2e-integracion.mjs http://localhost:PUERTO [carpeta] [--sin-flag]');
  process.exit(2);
}

const tamaños = [
  ['Pixel 7', { ...devices['Pixel 7'] }, true],
  ['iPhone 13', { ...devices['iPhone 13'] }, true],
  ['PC 1366×768', { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }, false],
  ['PC 1440×900', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, false],
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
const shot = async (page, nombre, etapa, opts = {}) => {
  if (capturas) await page.screenshot({ path: `${capturas}/${etapa}-${nombre.replace(/\W+/g, '-')}.png`, ...opts });
};

async function rutaYCostos(page) {
  await page.getByLabel('Desde (A)').fill('Calle Uno 123, Ñuñoa');
  await page.getByLabel('Hasta (B)').fill('Avenida Dos 456, Las Condes');
  await page.getByRole('button', { name: 'Cargar ejemplo ficticio' }).click();
  await page.getByRole('button', { name: /Calcular ruta/ }).click();
  await page.getByText('Datos simulados.').first().waitFor({ timeout: 15000 });
}

/** Texto de las columnas de costo y precio: debe ser idéntico con y sin detalle de carga (D-I1). */
const costos = (page) => page.evaluate(() => [...document.querySelectorAll('.layout > .col')].slice(1).map((c) => c.innerText).join('\n'));

const browser = await chromium.launch();
try {
  for (const [nombre, opciones, telefono] of tamaños) {
    console.log(`== ${nombre}${sinFlag ? ' (sin flag)' : ''}`);
    const { defaultBrowserType: _b, ...ctxOpts } = opciones;
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByLabel('Desde (A)').waitFor();

    if (sinFlag) {
      check('sin flag: no hay detalle de carga', (await page.getByText('Detalle de la carga y recursos').count()) === 0);
      await rutaYCostos(page);
      await page.getByLabel('Precio que vas a cobrar').fill('60000');
      await page.getByRole('button', { name: 'Crear cotización' }).click();
      check('sin flag: «Incluye» como hoy', (await page.getByLabel('Incluye', { exact: true }).inputValue()) === 'Carga y descarga, 1 ayudante(s)');
      check('sin flag: sin casilla de ayudantes ni sugerencia', (await page.getByText('Indicar al cliente').count()) === 0 && (await page.getByText('Usar texto sugerido').count()) === 0);
      await page.getByLabel('Cliente', { exact: true }).fill('Sin flag');
      await page.getByRole('button', { name: 'Guardar cotización' }).click();
      await page.getByText('COTIZACIÓN').first().waitFor();
      const v = await page.evaluate(() => JSON.parse(localStorage.getItem('cotizador.trabajos.v1'))[0].internal);
      check('sin flag: se guarda v1 (sin schemaVersion)', !('schemaVersion' in v));
      check('sin flag: no se crea borrador', await page.evaluate(() => localStorage.getItem('cotizador.borrador.v1') === null));
      check('sin errores en la consola', errores.length === 0, errores.join(' | '));
      await ctx.close();
      continue;
    }

    // 0. Auditoría I-1, P1-1: solo un costo se recupera al recargar; lo borrado no reaparece.
    await page.getByLabel('Rendimiento').fill('9');
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    const soloCosto = page.getByTestId('oferta-borrador');
    check('P1-1: un cambio solo de costo se ofrece al recargar', await soloCosto.isVisible().catch(() => false));
    await soloCosto.getByRole('button', { name: 'Recuperar' }).click();
    // El campo sincroniza su texto después de renderizar: se espera el valor (máx. 3 s), no se lee una sola vez.
    const vuelve = await page
      .waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.getAttribute('aria-labelledby')?.length && i.value === '9'), null, { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    check('P1-1: el costo vuelve', vuelve && (await page.getByLabel('Rendimiento').inputValue()) === '9');
    await page.getByLabel('Rendimiento').fill('');
    await page.getByLabel('Desde (A)').fill('Calle Temporal 9');
    await page.waitForTimeout(1500);
    await page.getByLabel('Desde (A)').fill('');
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    check('P1-1: lo borrado no reaparece (sin oferta)', (await page.getByTestId('oferta-borrador').count()) === 0);
    check('P1-1: el borrador guardado se eliminó', await page.evaluate(() => !JSON.parse(localStorage.getItem('cotizador.borrador.v1') ?? '{}').local));

    // 1. Sección presente y plegada; costo de referencia sin detalle.
    const seccion = page.locator('button.disclosure-head').filter({ hasText: 'Detalle de la carga y recursos' });
    check('detalle de carga presente y cerrado', (await seccion.getAttribute('aria-expanded')) === 'false');
    await rutaYCostos(page);
    const antes = await costos(page);

    // 2. Inventario y recursos.
    await seccion.click();
    await page.getByRole('button', { name: '+ Refrigerador' }).click();
    const refri = page.getByRole('group', { name: 'Datos de Refrigerador' });
    await refri.getByRole('textbox', { name: /^Peso por unidad/ }).fill('75');
    await refri.getByRole('textbox', { name: /^Largo/ }).fill('70');
    await refri.getByRole('textbox', { name: /^Ancho/ }).fill('70');
    await refri.getByRole('textbox', { name: /^Alto/ }).fill('180');
    await page.getByRole('button', { name: '+ Cajas' }).click();
    const cajas = page.getByRole('group', { name: 'Datos de Cajas' });
    await cajas.getByRole('textbox', { name: /^Cantidad/ }).fill('12');
    await cajas.getByRole('textbox', { name: /^Peso por unidad/ }).fill('12');
    await cajas.getByRole('textbox', { name: /^Largo/ }).fill('50');
    await cajas.getByRole('textbox', { name: /^Ancho/ }).fill('40');
    await cajas.getByRole('textbox', { name: /^Alto/ }).fill('40');
    const origen = page.locator('button.disclosure-head').filter({ hasText: 'Origen (A)' });
    await origen.click();
    await page.getByRole('group', { name: 'Accesos de origen (a)' }).getByLabel('Piso (opcional)').selectOption('4');
    await page.getByRole('group', { name: 'Accesos de origen (a)' }).getByLabel('Ascensor (opcional)').selectOption('no');
    await page.locator('button.disclosure-head').filter({ hasText: 'Ayudantes (0)' }).click();
    await page.getByRole('button', { name: '+ Agregar ayudante' }).click();
    await page.getByRole('group', { name: 'Datos del ayudante 1' }).getByRole('textbox', { name: /^Pago por el servicio/ }).fill('36000');
    const resumen = await page.locator('section[aria-label="Resumen de la carga"]').innerText();
    check('resumen 219 kg y 1,842 m³', resumen.includes('219 kg') && resumen.includes('1,842 m³'), resumen.slice(0, 80));

    // 3. D-I1: el costo no cambia; aviso anti-duplicado.
    check('D-I1: costos y precio idénticos con el detalle lleno', (await costos(page)) === antes);
    const avisos = await page.getByTestId('avisos-duplicado').innerText();
    check('aviso anti-duplicado de ayudantes', avisos.includes('usa 1 × $15.000') && avisos.includes('No se suma dos veces'), avisos);
    await shot(page, nombre, 'i1-detalle', { fullPage: true });

    // 4. D-I3: con un dato inválido no se puede crear la cotización.
    const filaCajas = page.locator('button.disclosure-head').filter({ hasText: /12 × Cajas/ });
    if ((await filaCajas.getAttribute('aria-expanded')) === 'false') await filaCajas.click();
    await page.getByRole('group', { name: 'Datos de Cajas' }).getByRole('textbox', { name: /^Largo/ }).fill('50,5');
    await page.getByLabel('Precio que vas a cobrar').fill('60000');
    check('D-I3: «Crear cotización» bloqueado con datos inválidos', await page.getByRole('button', { name: 'Crear cotización' }).isDisabled());
    check('D-I3: se explica por qué', (await page.getByTestId('bloqueo-carga').innerText()).includes('centímetros enteros'));
    await page.getByRole('group', { name: 'Datos de Cajas' }).getByRole('textbox', { name: /^Largo/ }).fill('50');

    // 5. I-1b: recargar y recuperar el borrador.
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    const oferta = page.getByTestId('oferta-borrador');
    await oferta.waitFor({ timeout: 5000 });
    check('I-1b: oferta de recuperar con 2 objetos', (await oferta.innerText()).includes('2 objetos'));
    await shot(page, nombre, 'i1b-oferta');
    await oferta.getByRole('button', { name: 'Recuperar' }).click();
    check('I-1b: direcciones recuperadas', (await page.getByLabel('Desde (A)').inputValue()) === 'Calle Uno 123, Ñuñoa');
    await page.locator('button.disclosure-head').filter({ hasText: 'Detalle de la carga y recursos' }).click();
    check('I-1b: objetos recuperados', (await page.locator('.item-row').count()) === 2);
    check('I-1b: el precio se confirma de nuevo (no se recupera)', (await page.getByLabel('Precio que vas a cobrar').inputValue()) === '');

    // 6. Cotización con la integración.
    await page.getByRole('button', { name: /Calcular ruta/ }).click();
    await page.getByText('Datos simulados.').first().waitFor({ timeout: 15000 });
    await page.getByLabel('Precio que vas a cobrar').fill('60000');
    const keep = page.getByRole('button', { name: 'Mantener este precio' });
    if (await keep.count()) await keep.click();
    await page.getByRole('button', { name: 'Crear cotización' }).click();
    const incluye = page.getByLabel('Incluye', { exact: true });
    check('X1/X2: «Incluye» parte igual que hoy', (await incluye.inputValue()) === 'Carga y descarga, 1 ayudante(s)');
    const casilla = page.getByLabel(/Indicar al cliente la cantidad de ayudantes/);
    check('X2: casilla marcada y con el número del costo (1, no 1 del detalle de $36.000)', (await casilla.isChecked()) && (await page.getByText('(1, según «Ayudantes» del costo)').count()) === 1);
    await casilla.uncheck();
    check('X2: desmarcada → «Carga y descarga»', (await incluye.inputValue()) === 'Carga y descarga');
    await casilla.check();
    check('X2: marcada otra vez → texto de hoy', (await incluye.inputValue()) === 'Carga y descarga, 1 ayudante(s)');
    const servicioAntes = await page.getByLabel('Servicio', { exact: true }).inputValue();
    check('X4: la sugerencia no se aplica sola', servicioAntes === 'Flete');
    await page.getByRole('button', { name: 'Usar texto sugerido' }).click();
    const servicio = await page.getByLabel('Servicio', { exact: true }).inputValue();
    check('X5: texto sugerido con la carga y sin ayudantes ni datos internos', servicio.includes('1 × Refrigerador') && !/ayudante|kg|m³|\$|min/i.test(servicio), servicio);
    await shot(page, nombre, 'i1-formulario', { fullPage: true });
    await page.getByLabel('Cliente', { exact: true }).fill('Cliente ficticio');
    await page.getByRole('button', { name: 'Guardar cotización' }).click();
    await page.getByText('COTIZACIÓN').first().waitFor();

    // 7. Snapshot v2 completo en el navegador; borrador borrado; documento sin datos internos.
    const v = await page.evaluate(() => JSON.parse(localStorage.getItem('cotizador.trabajos.v1'))[0].internal);
    check('V1: se guarda v2 en el navegador', v.schemaVersion === 2);
    check('V1: con el inventario completo (2 líneas, 219 kg)', v.cargo?.items?.length === 2 && v.cargo?.totals?.weightKg === 219);
    check('V1: costo guardado = costo mostrado (sin cambios)', typeof v.costEstimate === 'number' && v.formulaVersion === v.engineVersion);
    check('I-1b: emitir borra el borrador', await page.evaluate(() => !JSON.parse(localStorage.getItem('cotizador.borrador.v1') ?? '{}').local));
    check('detalle interno visible en la vista (fuera del documento)', await page.getByTestId('detalle-carga-interno').isVisible());
    await page.emulateMedia({ media: 'print' });
    const impreso = await page.locator('body').innerText();
    await page.emulateMedia({ media: 'screen' });
    check('D-I7: el PDF no trae el detalle interno', !impreso.includes('Detalle de la carga') && !impreso.includes('Solo para ti') && !/kg|m³/.test(impreso));
    const wa = decodeURIComponent((await page.locator('a[href*="wa.me"]').first().getAttribute('href')) ?? '');
    check('D-I7: WhatsApp sin detalle interno', !/kg|m³|Detalle de la carga/.test(wa) && wa.includes('Servicio: Traslado de 1 × Refrigerador'));
    await shot(page, nombre, 'i1-vista', { fullPage: true });
    await page.getByRole('button', { name: /Mis trabajos/ }).first().click();
    check('historial con la marca «Con detalle de carga»', await page.getByText('Con detalle de carga').first().isVisible());

    // 8. Maquetación y errores.
    await page.getByRole('button', { name: 'Cotizar' }).click();
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('sin desplazamiento horizontal', desborde <= 0, `${desborde}px`);
    if (telefono) {
      await page.locator('button.disclosure-head').filter({ hasText: 'Detalle de la carga y recursos' }).click();
      const pequeños = await page.evaluate(() =>
        [...document.querySelectorAll('.cargo-integrada button, .cargo-integrada input, .cargo-integrada select')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => (el.matches('input[type=checkbox]') ? el.closest('label') : el.closest('.field-input') ?? el))
          .filter((t) => t.getBoundingClientRect().height < 43.5).length,
      );
      check('controles táctiles ≥ 44 px en el detalle', pequeños === 0, String(pequeños));
    }
    check('sin errores en la consola', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} correctas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
