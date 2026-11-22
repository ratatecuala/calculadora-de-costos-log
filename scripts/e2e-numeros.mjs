/**
 * Prueba de navegador de A-71: números extremos en la calculadora, contra servidores LOCALES
 * (rutas simuladas; sin staging, Supabase ni Google), CON y SIN la flag de integración.
 *
 *   VITE_FF_INTEGRACION_CARGA=1 npx vite --port 5190 --strictPort      (con flag)
 *   npx vite --port 5191 --strictPort                                  (sin flag)
 *   node scripts/e2e-numeros.mjs http://localhost:5190 http://localhost:5191 [carpeta-capturas]
 *
 * También A-73: texto no numérico en cada campo, comparación opcional que no bloquea, borrador con texto
 * inválido (con la flag) y mínimo de rendimiento en «Mi vehículo».
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

      // ---------------- A-73 ----------------
      // 1. Texto no numérico en cada campo: marcado, conservado tal cual (ni vacío ni 0) y sin poder cotizar.
      for (const [etiqueta, re, valido] of CAMPOS) {
        const f = campo(re);
        await f.fill('abc');
        await f.press('Tab');
        check(
          `${modo} · A-73 ${etiqueta} = «abc»: marcado, conservado y cotización en pausa`,
          (await f.getAttribute('aria-invalid')) === 'true' && (await f.inputValue()) === 'abc' && (await aviso.isVisible()) && (await crear.isDisabled()),
          `valor=${await f.inputValue()}`,
        );
        await f.fill(valido);
        await f.press('Tab');
        const k = page.getByRole('button', { name: 'Mantener este precio' });
        if (await k.count()) await k.click();
        check(`${modo} · A-73 ${etiqueta}: al corregir, todo vuelve`, (await aviso.count()) === 0 && (await crear.isEnabled()));
      }
      // 1b. Texto inválido en el último momento, con todo listo para cotizar.
      check(`${modo} · A-73: listo para cotizar antes del cambio`, await crear.isEnabled());
      await campo(/^Peajes y TAG/).fill('4.200 pesos');
      check(`${modo} · A-73: un texto inválido de último momento bloquea la emisión`, await crear.isDisabled());
      await campo(/^Peajes y TAG/).fill('4.200');

      // 2. La comparación opcional con valores inválidos no bloquea la cotización principal.
      await page.getByRole('button', { name: /Calcular ruta/ }).click();
      await page.getByText('Datos simulados.').first().waitFor({ timeout: 15000 });
      const mantener = page.getByRole('button', { name: 'Mantener este precio' });
      if (await mantener.count()) await mantener.click();
      await page.getByText('Comparar con ruta sin peajes (opcional)').click();
      await page.getByRole('button', { name: 'Comparar sin peajes' }).click();
      const peajesComp = campo(/^Peajes de la ruta sin peajes/);
      const hayComparacion = await peajesComp.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
      check(`${modo} · A-73: la comparación sin peajes se calculó`, hayComparacion);
      if (hayComparacion) {
        for (const valor of ['1e308', 'abc']) {
          await peajesComp.fill(valor);
          await peajesComp.press('Tab');
          check(
            `${modo} · A-73: peajes de la comparación = «${valor}» → comparación en pausa, cotización principal disponible`,
            (await peajesComp.getAttribute('aria-invalid')) === 'true' && (await page.getByTestId('pausa-comparacion').isVisible()) && (await aviso.count()) === 0 && (await crear.isEnabled()),
          );
        }
        await peajesComp.fill('0');
        check(`${modo} · A-73: comparación corregida`, (await page.getByTestId('pausa-comparacion').count()) === 0);
      }

      // 3. Borrador: un texto inválido se recupera literalmente (solo con la flag, que habilita el borrador).
      if (modo === 'con flag') {
        await campo(/^Peajes y TAG/).fill('abc');
        await page.waitForTimeout(1500);
        await page.reload({ waitUntil: 'networkidle' });
        const oferta = page.getByTestId('oferta-borrador');
        await oferta.waitFor({ timeout: 5000 });
        await oferta.getByRole('button', { name: 'Recuperar' }).click();
        const peajes = campo(/^Peajes y TAG/);
        check(`${modo} · A-73: el texto inválido vuelve del borrador tal cual, marcado`, (await peajes.inputValue()) === 'abc' && (await peajes.getAttribute('aria-invalid')) === 'true');
        check(`${modo} · A-73: tras recuperarlo, la cotización sigue bloqueada`, await crear.isDisabled());
        await peajes.fill('4.200');
      }

      // 4. «Mi vehículo»: mínimo 0,1 km/L y texto inválido que bloquea el guardado.
      await page.getByRole('button', { name: 'Mi vehículo' }).click();
      const agregar = page.getByRole('button', { name: '+ Agregar vehículo' });
      if (await agregar.count()) await agregar.click();
      await page.getByPlaceholder('Ej.: Camioneta blanca').fill('Prueba A-73');
      const vRend = campo(/^Rendimiento/);
      const vDesg = campo(/^Desgaste estimado/);
      await vRend.fill('0,05');
      await page.getByRole('button', { name: 'Guardar vehículo' }).click();
      const errRend = await vRend.locator('xpath=ancestor::label[1]').locator('.field-error').innerText().catch(() => '');
      check(`${modo} · A-73: vehículo con 0,05 km/L → rechazado con el mensaje del mínimo`, (await vRend.getAttribute('aria-invalid')) === 'true' && /desde 0,1 km\/L/.test(errRend), errRend);
      await vRend.fill('9');
      await vDesg.fill('abc');
      await page.getByRole('button', { name: 'Guardar vehículo' }).click();
      check(`${modo} · A-73: desgaste «abc» → el vehículo no se guarda (ni como vacío)`, (await page.getByText('Nuevo vehículo').count()) === 1 && (await vDesg.getAttribute('aria-invalid')) === 'true');
      await vDesg.fill('31');
      await page.getByRole('button', { name: 'Guardar vehículo' }).click();
      check(`${modo} · A-73: con datos válidos el vehículo se guarda`, await page.getByText('Prueba A-73').first().isVisible());
      // Vehículo guardado antes de A-73 con 0,05 km/L: se conserva idéntico y se marca para revisión.
      await page.evaluate(() => {
        const antiguo = { id: 'v-antiguo', name: 'Antigua', type: 'camioneta', fuel: 'diesel', kmPerL: 0.05, wearPerKm: 31, createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T00:00:00Z' };
        localStorage.setItem('cotizador.vehiculos.v1', JSON.stringify({ version: 1, vehicles: [antiguo], defaultId: null }));
      });
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Mi vehículo' }).click();
      check(`${modo} · A-73: vehículo antiguo con 0,05 km/L listado y marcado para revisión`, (await page.getByTestId('vehiculo-revisar').isVisible()) && (await page.getByText('0,05 km/L').count()) === 1);
      check(`${modo} · A-73: el vehículo antiguo no se modificó en el almacenamiento`, await page.evaluate(() => JSON.parse(localStorage.getItem('cotizador.vehiculos.v1')).vehicles[0].kmPerL === 0.05));

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
