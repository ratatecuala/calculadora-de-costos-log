/**
 * A-80, Frente C — prueba de NAVEGADOR del flujo completo de una cotización real contra un servidor
 * LOCAL de Vite (sin staging, Supabase ni Google; las flags quedan como estén en el servidor, por
 * defecto apagadas):
 *   Mi vehículo (crear) → Usar en una cotización → direcciones con base y regreso → recorrido MANUAL de
 *   3 tramos → costos → precio → Crear cotización → Guardar → documento → PDF (impresión) → WhatsApp →
 *   Mis trabajos.
 *
 *   npx vite --port 5191 --strictPort                       (otra terminal)
 *   node scripts/e2e-flujo-completo.mjs http://localhost:5191 [carpeta-capturas]
 *
 * Tamaños: Pixel 7 (emulado en Chromium) y PC 1366×768. Datos ficticios.
 * Comprueba además que NO se consulta ninguna ruta (/api/route) ni ningún servidor externo, que la
 * versión impresa (PDF) no incluye la barra de acciones ni datos internos, y que el precio del
 * documento, del PDF y de WhatsApp es el mismo.
 */
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const [base, capturas] = process.argv.slice(2);
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  console.error('Uso: node scripts/e2e-flujo-completo.mjs http://localhost:PUERTO [carpeta-capturas]');
  process.exit(2);
}

const tamaños = [
  ['Pixel 7', { ...devices['Pixel 7'] }],
  ['PC 1366×768', { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }],
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
  if (capturas) await page.screenshot({ path: `${capturas}/flujo-${etapa}-${nombre.replace(/\W+/g, '-')}.png`, fullPage: true });
};

const VEHICULO = 'Furgón Interno Z9';
const PRECIO = '87000';
const PRECIO_CLP = '$87.000';
// Datos internos que NUNCA deben aparecer en el documento, el PDF ni WhatsApp.
const INTERNOS = [VEHICULO, '8,7', '1.050', 'Base Ficticia', 'Lo que quieres ganar', 'Margen', 'km/L', 'Desgaste'];

const browser = await chromium.launch();
try {
  for (const [nombre, ctxOpts] of tamaños) {
    console.log(`== ${nombre}`);
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errores = [];
    const externas = [];
    let rutas = 0;
    page.on('pageerror', (e) => errores.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(u.hostname)) externas.push(u.hostname);
      if (u.pathname.startsWith('/api/route')) rutas++;
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });

    // 1. Mi vehículo: crear un furgón diésel con rendimiento y desgaste.
    await page.getByRole('button', { name: 'Mi vehículo', exact: true }).click();
    const agregar = page.getByRole('button', { name: '+ Agregar vehículo' });
    if (await agregar.count()) await agregar.click();
    await page.getByPlaceholder('Ej.: Camioneta blanca').fill(VEHICULO);
    await page.getByRole('group', { name: 'Tipo de vehículo' }).getByRole('button', { name: 'Furgón' }).click();
    await page.getByRole('group', { name: 'Combustible' }).getByRole('button', { name: 'Diésel' }).click();
    await page.getByLabel('Rendimiento').fill('8,7');
    await page.getByLabel('Desgaste estimado').fill('43');
    await page.getByRole('button', { name: 'Guardar vehículo' }).click();
    await page.getByRole('button', { name: 'Usar en una cotización' }).click();
    await page.getByLabel('Desde (A)').waitFor();
    check('1 vehículo aplicado a la cotización', (await page.getByRole('combobox', { name: 'Vehículo' }).inputValue()) !== '' && (await page.getByLabel('Rendimiento').inputValue()) === '8,7');

    // 2. Direcciones con base y regreso, y recorrido manual de 3 tramos.
    await page.getByLabel('Desde (A)').fill('Calle Ficticia 1, Ñuñoa');
    await page.getByLabel('Hasta (B)').fill('Pasaje Ficticio 2, Maipú');
    await page.getByText('Base y regreso (opcional)').click();
    await page.getByLabel('Salgo desde mi base').check();
    await page.getByLabel('Vuelvo a la base').check();
    await page.getByLabel('Dirección de tu base').fill('Base Ficticia 3, La Florida');
    await page.getByRole('button', { name: 'Prefiero ingresar los km a mano' }).click();
    for (const [i, [km, min]] of [['8,5', '15'], ['25', '40'], ['31', '47']].entries()) {
      await page.getByLabel(`Km tramo ${i + 1}`, { exact: true }).fill(km);
      await page.getByLabel(`Minutos tramo ${i + 1}`, { exact: true }).fill(min);
    }

    // 3. Costos (sin el ejemplo, para no reemplazar los valores del vehículo).
    await page.getByLabel('Precio del diésel').fill('1050');
    await page.getByLabel('Ayudantes').fill('1');
    await page.getByLabel('Pago por ayudante').fill('15000');
    await page.getByLabel('Carga y descarga').fill('45');
    await page.getByLabel('Peajes y TAG').fill('3310');
    check('3 el vehículo sigue sin ajustes (los costos no tocan su rendimiento)', (await page.getByRole('button', { name: 'Restaurar valores del vehículo' }).count()) === 0);

    // 4. Precio y emisión.
    await page.getByLabel('Precio que vas a cobrar').fill(PRECIO);
    await shot(page, nombre, '1-calculadora');
    const crear = page.getByRole('button', { name: 'Crear cotización' });
    check('4 «Crear cotización» habilitado con el flujo completo', await crear.isEnabled());
    await crear.click();
    await page.getByLabel('Cliente', { exact: true }).fill('Cliente Ficticio Ñandú');
    await page.getByLabel('Servicio', { exact: true }).fill('Traslado de un refrigerador');
    const nombreComercial = page.getByLabel('Nombre comercial');
    if (await nombreComercial.count()) await nombreComercial.fill('Fletes Ficticios del Sur');
    await page.getByRole('button', { name: 'Guardar cotización' }).click();
    await page.getByText('COTIZACIÓN').first().waitFor({ timeout: 10000 });
    await shot(page, nombre, '2-cotizacion');

    // 5. Documento: precio, cliente, leyenda; sin datos internos.
    const doc = await page.locator('article.doc').innerText();
    check('5 el documento muestra el precio elegido', doc.includes(PRECIO_CLP), doc);
    check('5 el documento muestra el cliente y la leyenda', doc.includes('Cliente Ficticio Ñandú') && doc.includes('Esta cotización no es factura ni boleta.'));
    for (const p of INTERNOS) check(`5 el documento no muestra «${p}»`, !doc.includes(p));
    check('5 título del PDF con número y cliente', (await page.title()) === 'Cotización N° 0001 · Cliente Ficticio Ñandú', await page.title());

    // 6. PDF: «Descargar PDF» abre la impresión; la versión impresa no incluye la barra ni lo interno.
    await page.evaluate(() => {
      window.__impresiones = 0;
      window.print = () => {
        window.__impresiones++;
      };
    });
    await page.getByRole('button', { name: 'Descargar PDF' }).click();
    check('6 «Descargar PDF» abre la impresión del navegador', (await page.evaluate(() => window.__impresiones)) === 1);
    await page.emulateMedia({ media: 'print' });
    const impreso = await page.evaluate(() => document.body.innerText);
    check('6 el PDF trae el precio y el documento', impreso.includes(PRECIO_CLP) && impreso.includes('COTIZACIÓN'));
    check('6 el PDF no trae la barra de acciones ni el menú', !impreso.includes('Enviar por WhatsApp') && !impreso.includes('Descargar PDF') && !impreso.includes('Mis trabajos'));
    for (const p of INTERNOS) check(`6 el PDF no muestra «${p}»`, !impreso.includes(p));
    if (capturas) await page.pdf({ path: `${capturas}/flujo-3-${nombre.replace(/\W+/g, '-')}.pdf` }).catch(() => undefined);
    await page.emulateMedia({ media: 'screen' });

    // 7. WhatsApp: mismo precio que el documento; sin datos internos.
    const href = await page.getByRole('link', { name: 'Enviar por WhatsApp' }).getAttribute('href');
    const wa = decodeURIComponent((href ?? '').replace('https://wa.me/?text=', ''));
    check('7 enlace de WhatsApp (wa.me, sin número fijado)', (href ?? '').startsWith('https://wa.me/?text='));
    check('7 WhatsApp con el mismo precio que el documento', wa.includes(`Precio total: ${PRECIO_CLP}`), wa);
    check('7 WhatsApp con número, cliente y leyenda', wa.includes('Cotización N° 0001') && wa.includes('Cliente: Cliente Ficticio Ñandú') && wa.endsWith('Esta cotización no es factura ni boleta.'));
    for (const p of INTERNOS) check(`7 WhatsApp no muestra «${p}»`, !wa.includes(p));
    const maps = await page.getByRole('link', { name: 'Ver ruta en Google Maps' }).getAttribute('href');
    check('7 enlace de Google Maps con base → A → B → base, sin clave', !!maps && new URL(maps).searchParams.get('origin') === 'Base Ficticia 3, La Florida' && !new URL(maps).searchParams.has('key'));

    // 8. Mis trabajos: la cotización quedó guardada con su precio.
    await page.getByRole('button', { name: 'Mis trabajos' }).click();
    const lista = await page.locator('.layout').first().innerText();
    check('8 la cotización aparece en «Mis trabajos» con su precio', lista.includes('0001') && lista.includes(PRECIO_CLP), lista.slice(0, 300));
    const guardada = await page.evaluate(() => JSON.parse(localStorage.getItem('cotizador.trabajos.v1') ?? '[]'));
    check('8 se guardó v1 con el vehículo y los tramos declarados', guardada.length === 1 && !('schemaVersion' in guardada[0].internal) && guardada[0].internal.vehicle?.kmPerL === 8.7 && guardada[0].internal.km === 64.5 && guardada[0].netPrice === 87000, JSON.stringify(guardada[0]?.internal));

    // 9. Sin red externa ni consultas de ruta en todo el flujo manual.
    check('9 ninguna consulta de ruta (/api/route)', rutas === 0, String(rutas));
    check('9 ningún servidor externo', externas.length === 0, externas.join(', '));
    check('9 sin errores en la consola', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} correctas, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
