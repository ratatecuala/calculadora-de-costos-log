/**
 * Prueba de navegador de los editores de inventario (#47) y recursos (#51), fase 1 (A-66).
 * Se ejecuta contra un servidor LOCAL de Vite; no usa staging, Supabase ni Google.
 *
 *   VITE_FF_CARGA_RECURSOS=1 npx vite --port 5181 --strictPort   (en otra terminal)
 *   npx vite --port 5182 --strictPort                            (sin la flag)
 *   node scripts/e2e-modulos.mjs http://localhost:5181 http://localhost:5182 [carpeta-capturas]
 *
 * Tamaños: Pixel 7, iPhone 13 (emulados en Chromium), 1366×768 y 1440×900.
 */
import { createRequire } from 'node:module';

// Playwright viene preinstalado de forma global en el entorno de pruebas (no es dependencia del proyecto).
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const [conFlag, sinFlag, capturas] = process.argv.slice(2);
if (!conFlag || !sinFlag) {
  console.error('Uso: node scripts/e2e-modulos.mjs <url-con-flag> <url-sin-flag> [carpeta-capturas]');
  process.exit(2);
}
for (const u of [conFlag, sinFlag]) {
  const host = new URL(u).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    console.error('Solo se prueba contra un servidor local');
    process.exit(2);
  }
}

const tamaños = [
  ['Pixel 7', { ...devices['Pixel 7'] }],
  ['iPhone 13', { ...devices['iPhone 13'] }],
  ['PC 1366×768', { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }],
  ['PC 1440×900', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
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

const browser = await chromium.launch();
try {
  for (const [nombre, opciones] of tamaños) {
    console.log(`== ${nombre}`);
    // WebKit no está instalado: el iPhone se emula en Chromium (mismo tamaño, táctil y agente).
    const { defaultBrowserType: _b, ...ctxOpts } = opciones;
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errores = [];
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    page.on('pageerror', (e) => errores.push(String(e)));

    // Sin la flag: la pestaña no existe.
    await page.goto(sinFlag, { waitUntil: 'networkidle' });
    check('sin flag no hay pestaña', (await page.getByRole('button', { name: 'Carga (prueba)' }).count()) === 0);

    await page.goto(conFlag, { waitUntil: 'networkidle' });
    const antes = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
    await page.getByRole('button', { name: 'Carga (prueba)' }).click();
    check('aviso de vista previa', await page.getByText('Vista previa interna.').isVisible());

    // Inventario: refrigerador con medidas → volumen calculado.
    await page.getByRole('button', { name: '+ Refrigerador' }).click();
    const l1 = page.locator('li[aria-label^="Línea 1"]');
    await l1.getByRole('textbox', { name: /^Peso por unidad/ }).fill('75');
    await l1.getByRole('textbox', { name: /^Largo/ }).fill('70');
    await l1.getByRole('textbox', { name: /^Ancho/ }).fill('70');
    await l1.getByRole('textbox', { name: /^Alto/ }).fill('180');
    check('volumen calculado 0,882', (await l1.getByRole('textbox', { name: /^Volumen por unidad/ }).inputValue()) === '0,882');
    check('rótulo «calculado»', await l1.getByText('calculado con las medidas').isVisible());

    // Cajas: 12 × 12 kg, 50×40×40.
    await page.getByRole('button', { name: '+ Cajas' }).click();
    const l2 = page.locator('li[aria-label^="Línea 2"]');
    await l2.getByRole('textbox', { name: /^Cantidad/ }).fill('12');
    await l2.getByRole('textbox', { name: /^Peso por unidad/ }).fill('12');
    await l2.getByRole('textbox', { name: /^Largo/ }).fill('50');
    await l2.getByRole('textbox', { name: /^Ancho/ }).fill('40');
    await l2.getByRole('textbox', { name: /^Alto/ }).fill('40');
    check('contador 2 de 200', await page.getByText('2 de 200 líneas').isVisible());
    const resumen = page.locator('section[aria-label="Resumen del inventario"]');
    check('peso total 219 kg', (await resumen.textContent()).includes('219 kg'), (await resumen.textContent()).slice(0, 160));
    check('volumen total 1,842 m³', (await resumen.textContent()).includes('1,842 m³'));

    // Vehículo de prueba → estimación (cota inferior).
    await resumen.getByRole('textbox', { name: /^Carga útil/ }).fill('1000');
    await resumen.getByRole('textbox', { name: /^Volumen de carga/ }).fill('1,5');
    const cap = await page.getByTestId('capacidad').textContent();
    check('estimación: al menos 2 viajes por volumen', /al menos 2\s+viajes/.test(cap) && cap.includes('volumen'), cap);
    check('estimación aclara que es cota inferior', cap.includes('cota inferior') && cap.includes('no garantiza'));

    // Medida con decimales → error en el campo.
    await l2.getByRole('textbox', { name: /^Largo/ }).fill('50,5');
    check('error medidas enteras', await l2.getByText('Usa centímetros enteros').isVisible());
    await l2.getByRole('textbox', { name: /^Largo/ }).fill('50');

    // Duplicar, reordenar, eliminar.
    await page.getByRole('button', { name: 'Duplicar Cajas' }).click();
    check('duplicado → 3 líneas', await page.getByText('3 de 200 líneas').isVisible());
    await page.locator('li[aria-label^="Línea 3"]').getByRole('button', { name: /^Eliminar/ }).click();
    check('eliminado → 2 líneas', await page.getByText('2 de 200 líneas').isVisible());
    await page.getByRole('button', { name: 'Subir Cajas' }).click();
    check('subir cambia el orden', (await page.locator('li[aria-label^="Línea 1"]').getAttribute('aria-label')).includes('Cajas'));

    // Recursos: origen 4.º piso sin ascensor, 30 min; destino sin minutos.
    const origen = page.locator('fieldset.stop').filter({ hasText: 'Origen (A)' });
    await origen.getByLabel('Piso').selectOption('4');
    await origen.getByLabel('Ascensor').selectOption('no');
    await origen.getByRole('textbox', { name: /^Minutos de carga/ }).fill('30');
    const tiempo = await page.getByTestId('tiempo-carga').textContent();
    check('tiempo incompleto: al menos 30 min, falta el destino', tiempo.includes('al menos 30 min') && tiempo.includes('falta el destino'), tiempo);

    // Ayudante por hora: sin tramos no hay monto; con tramo, tarifa × horas.
    await page.getByRole('button', { name: '+ Agregar ayudante' }).click();
    const ay = page.locator('li[aria-label="Ayudante 1"]');
    await ay.getByRole('button', { name: 'Por hora' }).click();
    await ay.getByRole('textbox', { name: /^Tarifa por hora/ }).fill('6000');
    await ay.getByRole('textbox', { name: /^Horas pagadas/ }).fill('3');
    check('sin tramos: monto faltante', (await page.getByTestId('ayudantes').textContent()).includes('falta el monto de 1'));
    await ay.getByLabel('Carga y descarga').check();
    check('con tramo: $18.000', (await page.getByTestId('ayudantes').textContent()).includes('$18.000'));
    await ay.getByRole('textbox', { name: /^Horas pagadas/ }).fill('30');
    check('30 h rechazadas con mensaje (T-7)', await ay.getByText('Máximo 24 horas').isVisible());
    await ay.getByRole('textbox', { name: /^Horas pagadas/ }).fill('3');
    await ay.getByRole('button', { name: 'Por servicio' }).click();
    check('cambio de modalidad sin montos residuales', (await ay.getByRole('textbox', { name: /^Pago por el servicio/ }).inputValue()) === '');

    // Texto sugerido sin datos internos.
    const texto = await page.getByTestId('texto-sugerido').textContent();
    check('texto sugerido con objetos y pisos', texto.includes('12 × Cajas') && texto.includes('1 × Refrigerador') && texto.includes('4.º piso sin ascensor'), texto);
    check('texto sugerido sin kg, m³, $ ni minutos', !/kg|m³|m3|\$|min/i.test(texto), texto);

    // Maquetación: sin desplazamiento horizontal y controles ≥ 44 px.
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('sin desplazamiento horizontal', desborde <= 0, `${desborde}px`);
    const pequeños = await page.evaluate(() =>
      [...document.querySelectorAll('.modules-preview button, .modules-preview input, .modules-preview select')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => {
          const target = el.matches('input[type=checkbox]') ? el.closest('label') : el.closest('.field-input') ?? el;
          return [el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName, Math.round(target.getBoundingClientRect().height)];
        })
        .filter(([, h]) => h < 44),
    );
    check('controles de al menos 44 px', pequeños.length === 0, JSON.stringify(pequeños.slice(0, 5)));

    // No se guarda nada y el cotizador sigue igual.
    const despues = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
    check('no escribe en el almacenamiento del navegador', antes === despues, `${antes} → ${despues}`);
    if (capturas) await page.screenshot({ path: `${capturas}/modulos-${nombre.replace(/\W+/g, '-')}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Cotizar' }).click();
    check('el cotizador sigue disponible', await page.getByRole('heading', { name: /Recorrido|Ruta/i }).first().isVisible().catch(() => false) || (await page.locator('.layout').count()) > 0);
    check('sin errores en la consola', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} correctas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
