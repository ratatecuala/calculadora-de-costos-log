/**
 * Prueba de navegador de A-71: números extremos en la calculadora, contra servidores LOCALES
 * (rutas simuladas; sin staging, Supabase ni Google), CON y SIN la flag de integración.
 *
 *   VITE_FF_INTEGRACION_CARGA=1 npx vite --port 5190 --strictPort      (con flag)
 *   npx vite --port 5191 --strictPort                                  (sin flag)
 *   node scripts/e2e-numeros.mjs http://localhost:5190 http://localhost:5191 [carpeta-capturas]
 *
 * En Pixel 7, iPhone 13 (emulados en Chromium), 1366×768 y 1440×900 comprueba, campo por campo, que
 * 1e308, negativos, decimales donde no corresponden y valores justo sobre el tope:
 *  - marcan el campo (aria-invalid) con su mensaje y el aviso general, sin errores de página;
 *  - pausan «Crear cotización» y no reemplazan lo escrito;
 *  - al volver al valor original, todo vuelve a estar disponible.
 */
import { createRequire } from 'node:module';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

const [conFlag, sinFlag, capturas] = process.argv.slice(2);
if (!conFlag || !sinFlag || ![conFlag, sinFlag].every((u) => ['localhost', '127.0.0.1'].includes(new URL(u).hostname))) {
  console.error('Uso: node scripts/e2e-numeros.mjs <url-con-flag> <url-sin-flag> [carpeta-capturas]  (solo servidores locales)');
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

/** Campos del costo: nombre accesible (inicio) y valor válido de referencia. */
const CAMPOS = [
  ['Rendimiento', /^Rendimiento/, '12'],
  ['Desgaste', /^Desgaste del vehículo/, '31'],
  ['Combustible', /^Precio del combustible/, '1.050'],
  ['Ayudantes', /^Ayudantes$/, '1'],
  ['Pago por ayudante', /^Pago por ayudante/, '15.000'],
  ['Peajes', /^Peajes y TAG/, '4.200'],
  ['Carga y descarga', /^Carga y descarga/, '60'],
  ['Gastos fijos', /^Parte de tus gastos fijos/, '1.500'],
  ['Remuneración', /^Lo que quieres ganar/, '6.000'],
  ['Otros gastos', /^Otros gastos/, '0'],
  ['Recargos', /^Recargos al precio/, '0'],
  ['Km tramo 1', /^Km tramo 1$/, '25'],
  ['Minutos tramo 1', /^Minutos tramo 1$/, '40'],
];

const browser = await chromium.launch();
try {
  for (const [modo, base] of [['con flag', conFlag], ['sin flag', sinFlag]]) {
    for (const [nombre, opciones, telefono] of tamaños) {
      console.log(`== ${nombre} (${modo})`);
      const { defaultBrowserType: _b, ...ctxOpts } = opciones;
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      const errores = [];
      page.on('pageerror', (e) => errores.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
      await page.goto(base, { waitUntil: 'networkidle' });
      const campo = (re) => page.getByRole('textbox', { name: re });
      const crear = page.getByRole('button', { name: 'Crear cotización' });
      const aviso = page.getByTestId('bloqueo-numeros');

      // Preparación: recorrido manual, costos de ejemplo, opciones avanzadas abiertas y precio.
      await page.getByLabel('Desde (A)').fill('Calle Uno 123, Ñuñoa');
      await page.getByLabel('Hasta (B)').fill('Avenida Dos 456, Las Condes');
      await page.getByRole('button', { name: 'Cargar ejemplo ficticio' }).click();
      await page.getByRole('button', { name: 'Prefiero ingresar los km a mano' }).click();
      await campo(/^Km tramo 1$/).fill('25');
      await campo(/^Minutos tramo 1$/).fill('40');
      await page.getByText('Opciones avanzadas').click();
      await campo(/^Precio que vas a cobrar/).fill('60.000');
      check(`${modo}: detalle de carga ${modo === 'con flag' ? 'presente' : 'ausente'}`, (await page.getByText('Detalle de la carga y recursos').count()) === (modo === 'con flag' ? 1 : 0));
      check(`${modo}: punto de partida válido (sin aviso y con «Crear cotización»)`, (await aviso.count()) === 0 && (await crear.isEnabled()));

      for (const [etiqueta, re, valido] of CAMPOS) {
        const f = campo(re);
        await f.fill('1e308');
        await f.press('Tab');
        const invalido = (await f.getAttribute('aria-invalid')) === 'true';
        const mensaje = await f.locator('xpath=ancestor::label[1]').locator('.field-error').innerText().catch(() => '');
        check(`${modo} · ${etiqueta} = 1e308: campo marcado con su mensaje`, invalido && /máximo|entero|Usa 0/.test(mensaje), mensaje);
        check(`${modo} · ${etiqueta} = 1e308: aviso general y cotización en pausa`, (await aviso.isVisible()) && (await crear.isDisabled()));
        check(`${modo} · ${etiqueta} = 1e308: lo escrito se conserva (en notación corta)`, (await f.inputValue()) === '1e308');
        await f.fill(valido);
        await f.press('Tab');
        const keep = page.getByRole('button', { name: 'Mantener este precio' });
        if (await keep.count()) await keep.click();
        check(`${modo} · ${etiqueta}: al volver a ${valido}, todo vuelve`, (await f.getAttribute('aria-invalid')) !== 'true' && (await aviso.count()) === 0 && (await crear.isEnabled()));
      }

      // Casos particulares.
      const km = campo(/^Km tramo 1$/);
      await km.fill('100.000');
      check(`${modo}: km en el tope exacto (100.000) es válido`, (await km.getAttribute('aria-invalid')) !== 'true' && (await aviso.count()) === 0);
      await km.fill('100000,1');
      check(`${modo}: km justo sobre el tope (100.000,1) es inválido`, (await km.getAttribute('aria-invalid')) === 'true' && (await aviso.isVisible()));
      await km.fill('-5');
      check(`${modo}: km negativo: aviso de texto inválido, sin caída`, (await km.getAttribute('aria-invalid')) === 'true' && (await crear.isDisabled()));
      await km.fill('25');

      const ayud = campo(/^Ayudantes$/);
      await ayud.fill('2,5');
      check(`${modo}: ayudantes 2,5 → «Debe ser un número entero», sin redondear`, (await ayud.getAttribute('aria-invalid')) === 'true' && (await ayud.inputValue()) === '2,5' && (await aviso.isVisible()));
      await ayud.fill('1');

      const rend = campo(/^Rendimiento/);
      await rend.fill('0,05');
      check(`${modo}: rendimiento 0,05 → «Usa 0 si no lo sabes…»`, (await rend.getAttribute('aria-invalid')) === 'true');
      await rend.fill('0');
      check(`${modo}: rendimiento 0 sigue siendo válido (sin dato de combustible)`, (await rend.getAttribute('aria-invalid')) !== 'true');
      await rend.fill('12');

      await page.getByRole('button', { name: 'Otro', exact: true }).click();
      const margen = campo(/^Margen objetivo/);
      await margen.fill('90');
      check(`${modo}: margen 90 % → marcado, sin recortar a 80`, (await margen.getAttribute('aria-invalid')) === 'true' && (await margen.inputValue()) === '90' && (await aviso.isVisible()));
      await margen.fill('80');
      check(`${modo}: margen 80 % es válido`, (await margen.getAttribute('aria-invalid')) !== 'true' && (await aviso.count()) === 0);
      await page.getByRole('button', { name: '15 %' }).click();

      const precio = campo(/^Precio que vas a cobrar/);
      await precio.fill('10.000.000.000');
      check(`${modo}: precio sobre el tope → marcado, sin poder cotizar`, (await precio.getAttribute('aria-invalid')) === 'true' && (await crear.isDisabled()));
      check(`${modo}: con el precio inválido el costo se sigue mostrando`, await page.getByText('Costo del viaje').first().isVisible());
      await precio.fill('60.000');
      const keep = page.getByRole('button', { name: 'Mantener este precio' });
      if (await keep.count()) await keep.click();
      check(`${modo}: tras corregir el precio se puede cotizar`, await crear.isEnabled());

      // Combinación que desbordaría el motor sin los límites: rendimiento diminuto y combustible enorme.
      await rend.fill('0,0000001');
      await campo(/^Precio del combustible/).fill('1e300');
      check(`${modo}: combinación que desbordaría: ambos campos marcados, sin caída`, (await rend.getAttribute('aria-invalid')) === 'true' && (await campo(/^Precio del combustible/).getAttribute('aria-invalid')) === 'true');
      if (capturas) await page.screenshot({ path: `${capturas}/a71-${modo.replace(' ', '-')}-${nombre.replace(/\W+/g, '-')}.png`, fullPage: true });
      await rend.fill('12');
      await campo(/^Precio del combustible/).fill('1.050');

      if (telefono) {
        const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`${modo}: sin desplazamiento horizontal en el teléfono`, desborde <= 0, `${desborde}px`);
      }
      check(`${modo}: sin errores de página ni de consola`, errores.length === 0, errores.join(' | '));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} correctas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
