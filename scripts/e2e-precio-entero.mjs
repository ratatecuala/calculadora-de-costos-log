/**
 * A-81 (H1) — prueba de NAVEGADOR del precio final en pesos enteros contra un servidor LOCAL de Vite
 * (sin staging, Supabase ni Google; flags como estén en el servidor, por defecto apagadas):
 *   1. «87000,5» en «Precio que vas a cobrar» muestra el error, conserva lo escrito y NO deja crear;
 *   2. «87000» se acepta: documento, PDF (impresión), WhatsApp e historial con «$87.000»;
 *   3. un registro HISTÓRICO con 87000,5 (inyectado en el almacenamiento del navegador, como uno guardado
 *      antes de la regla) se conserva y se ve «$87.000,5» en el historial, el documento, el PDF y
 *      WhatsApp, con el aviso para el dueño solo en pantalla.
 *
 *   npx vite --port 5193 --strictPort                       (otra terminal)
 *   node scripts/e2e-precio-entero.mjs http://localhost:5193
 *
 * Tamaños: Pixel 7 (emulado en Chromium) y PC 1366×768. Datos ficticios.
 */
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const [base] = process.argv.slice(2);
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  console.error('Uso: node scripts/e2e-precio-entero.mjs http://localhost:PUERTO');
  process.exit(2);
}
const MENSAJE = 'El precio debe ser en pesos enteros, sin decimales';
const AVISO = 'Precio histórico con decimales';
const CLAVE = 'cotizador.trabajos.v1';

let ok = 0;
let fallas = 0;
const check = (nombre, cond, detalle = '') => {
  if (cond) ok++;
  else {
    fallas++;
    console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
};

/** Documento, PDF (modo impresión) y WhatsApp de la cotización abierta. */
async function canales(page) {
  const doc = await page.locator('article.doc').innerText();
  const href = (await page.getByRole('link', { name: 'Enviar por WhatsApp' }).getAttribute('href')) ?? '';
  const wa = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
  const pantalla = await page.evaluate(() => document.body.innerText);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.evaluate(() => document.body.innerText);
  await page.emulateMedia({ media: 'screen' });
  return { doc, wa, pdf, pantalla };
}

const browser = await chromium.launch();
try {
  for (const [nombre, ctxOpts] of [
    ['Pixel 7', { ...devices['Pixel 7'] }],
    ['PC 1366×768', { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }],
  ]) {
    console.log(`== ${nombre}`);
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    // Cotización lista con recorrido manual (sin red) y el ejemplo ficticio de costos.
    await page.getByLabel('Desde (A)').fill('Calle Ficticia 1, Ñuñoa');
    await page.getByLabel('Hasta (B)').fill('Pasaje Ficticio 2, Maipú');
    await page.getByRole('button', { name: 'Ingresar km y minutos a mano' }).click();
    await page.getByLabel('Km tramo 1', { exact: true }).fill('25');
    await page.getByLabel('Minutos tramo 1', { exact: true }).fill('40');
    await page.getByRole('button', { name: 'Cargar ejemplo ficticio' }).click();

    // 1. Precio con decimales: error claro, sin redondeo, sin poder crear.
    const precio = page.getByLabel('Precio que vas a cobrar');
    await precio.fill('87000,5');
    await precio.blur();
    const crear = page.getByRole('button', { name: 'Crear cotización' });
    check('1 87000,5 muestra el error del campo', (await page.getByText(MENSAJE).count()) > 0);
    check('1 el campo conserva lo escrito (no se redondea a 87.001)', ['87000,5', '87.000,5'].includes(await precio.inputValue()), await precio.inputValue());
    check('1 el campo queda marcado inválido (aria-invalid)', (await precio.getAttribute('aria-invalid')) === 'true');
    check('1 «Crear cotización» deshabilitado', !(await crear.isEnabled()));
    check('1 la calculadora sigue mostrando el precio sugerido', (await page.getByText('Precio sugerido').count()) > 0);

    // 2. Precio entero: se emite y todos los canales muestran $87.000.
    await precio.fill('87000');
    check('2 87000 quita el error', (await page.getByText(MENSAJE).count()) === 0);
    check('2 «Crear cotización» habilitado', await crear.isEnabled());
    await crear.click();
    await page.getByLabel('Cliente', { exact: true }).fill('Cliente Ficticio Entero');
    await page.getByRole('button', { name: 'Guardar cotización' }).click();
    await page.getByText('COTIZACIÓN').first().waitFor({ timeout: 10000 });
    let c = await canales(page);
    check('2 documento con $87.000', c.doc.includes('$87.000') && !c.doc.includes('87.000,'), c.doc);
    check('2 PDF con $87.000', c.pdf.includes('$87.000') && !c.pdf.includes('87.000,'));
    check('2 WhatsApp con el mismo precio', c.wa.includes('Precio total: $87.000') && !c.wa.includes('87.000,'), c.wa);
    check('2 sin aviso de precio histórico', !c.pantalla.includes(AVISO));
    const guardada = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '[]'), CLAVE);
    check('2 se guardó 87000 exactos', guardada.length === 1 && guardada[0].netPrice === 87000, JSON.stringify(guardada.map((j) => j.netPrice)));

    // 3. Registro HISTÓRICO con decimales (guardado antes de la regla): se conserva y se ve igual en todo.
    await page.evaluate((k) => {
      const [j] = JSON.parse(localStorage.getItem(k));
      const viejo = { ...j, id: '00000000-0000-4000-8000-0000000000aa', number: 2, clientName: 'Cliente Histórico', netPrice: 87000.5 };
      localStorage.setItem(k, JSON.stringify([viejo, j]));
    }, CLAVE);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Mis trabajos' }).click();
    const fila = page.locator('.job').filter({ hasText: 'Cliente Histórico' });
    await fila.waitFor();
    const textoFila = await fila.innerText();
    check('3 historial: la fila muestra $87.000,5', textoFila.includes('$87.000,5') && !textoFila.includes('87.001'), textoFila);
    check('3 historial: etiqueta de precio histórico para el dueño', textoFila.includes(AVISO));
    check('3 historial: la cotización entera no lleva la etiqueta', !(await page.locator('.job').filter({ hasText: 'Cliente Ficticio Entero' }).innerText()).includes(AVISO));
    await fila.getByRole('button', { name: 'Ver cotización' }).click();
    await page.getByText('COTIZACIÓN').first().waitFor({ timeout: 10000 });
    c = await canales(page);
    check('3 documento con $87.000,5', c.doc.includes('$87.000,5') && !c.doc.includes('87.001'), c.doc);
    check('3 PDF con $87.000,5', c.pdf.includes('$87.000,5') && !c.pdf.includes('87.001'));
    check('3 WhatsApp con el mismo $87.000,5', c.wa.includes('Precio total: $87.000,5') && !c.wa.includes('87.001'), c.wa);
    check('3 aviso histórico visible en pantalla para el dueño', c.pantalla.includes(AVISO));
    check('3 el aviso NO sale en el PDF ni en el documento del cliente', !c.pdf.includes(AVISO) && !c.doc.includes(AVISO) && !c.wa.includes(AVISO));
    const almacenado = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).find((j) => j.clientName === 'Cliente Histórico').netPrice, CLAVE);
    check('3 el registro histórico no se reescribió', almacenado === 87000.5, String(almacenado));

    check('4 sin errores en la consola', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} correctas, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
