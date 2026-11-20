/**
 * Prueba de navegador de los editores de inventario (#47) y recursos (#51), fase 1 (A-66),
 * con filas plegables. Se ejecuta contra servidores LOCALES; no usa staging, Supabase ni Google.
 *
 *   VITE_FF_CARGA_RECURSOS=1 npx vite build --outDir /tmp/on && npx vite preview --outDir /tmp/on --port 5181
 *   npx vite build --outDir /tmp/off && npx vite preview --outDir /tmp/off --port 5182
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
  if (!['localhost', '127.0.0.1'].includes(new URL(u).hostname)) {
    console.error('Solo se prueba contra un servidor local');
    process.exit(2);
  }
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
const shot = async (page, nombre, etapa, fullPage = false) => {
  if (capturas) await page.screenshot({ path: `${capturas}/${etapa}-${nombre.replace(/\W+/g, '-')}.png`, fullPage });
};

const browser = await chromium.launch();
try {
  for (const [nombre, opciones, telefono] of tamaños) {
    console.log(`== ${nombre}`);
    // WebKit no está instalado: el iPhone se emula en Chromium (mismo tamaño, táctil y agente).
    const { defaultBrowserType: _b, ...ctxOpts } = opciones;
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errores = [];
    page.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    page.on('pageerror', (e) => errores.push(String(e)));
    const fila = (texto) => page.locator('button.disclosure-head').filter({ hasText: texto });
    const grupo = (n) => page.getByRole('group', { name: n });

    // Sin la flag: la pestaña no existe.
    await page.goto(sinFlag, { waitUntil: 'networkidle' });
    check('sin flag no hay pestaña', (await page.getByRole('button', { name: 'Carga (prueba)' }).count()) === 0);

    await page.goto(conFlag, { waitUntil: 'networkidle' });
    const antes = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
    await page.getByRole('button', { name: 'Carga (prueba)' }).click();
    check('aviso de vista previa', await page.getByText('Vista previa interna.').isVisible());
    check('todo cerrado al inicio', (await page.locator('[aria-expanded="true"]').count()) === 0);
    check('grupo «Datos de la carga» y «Tus recursos y costos internos»', (await page.getByRole('heading', { name: 'Datos de la carga', exact: true }).isVisible()) && (await page.getByRole('heading', { name: 'Tus recursos y costos internos' }).isVisible()));
    check('marca «Solo para ti» en recursos internos', await page.locator('.card.internal .tag-internal').first().isVisible());

    // Refrigerador: se abre solo al agregarlo.
    await page.getByRole('button', { name: '+ Refrigerador' }).click();
    const refri = grupo('Datos de Refrigerador');
    check('objeto nuevo abierto', await refri.isVisible());
    await refri.getByRole('textbox', { name: /^Peso por unidad/ }).fill('75');
    await refri.getByRole('textbox', { name: /^Largo/ }).fill('70');
    await refri.getByRole('textbox', { name: /^Ancho/ }).fill('70');
    await refri.getByRole('textbox', { name: /^Alto/ }).fill('180');
    check('volumen calculado 0,882', (await refri.getByRole('textbox', { name: /^Volumen por unidad/ }).inputValue()) === '0,882');
    check('obligatorio y opcional rotulados', (await refri.getByText('(obligatorio)').count()) >= 2 && (await refri.getByText('(opcional)').count()) >= 4);

    // Cajas: al agregarla se abre y el refrigerador (completo) se cierra conservando sus datos.
    await page.getByRole('button', { name: '+ Cajas' }).click();
    check('refrigerador cerrado y «Completo»', (await fila('Refrigerador').getAttribute('aria-expanded')) === 'false' && (await fila('Refrigerador').textContent()).includes('Completo'));
    check('fila cerrada con resumen', (await fila('Refrigerador').textContent()).includes('75 kg c/u · 0,882 m³ c/u'));
    const cajas = grupo('Datos de Cajas');
    await cajas.getByRole('textbox', { name: /^Cantidad/ }).fill('12');
    await cajas.getByRole('textbox', { name: /^Peso por unidad/ }).fill('12');
    await cajas.getByRole('textbox', { name: /^Largo/ }).fill('50');
    await cajas.getByRole('textbox', { name: /^Ancho/ }).fill('40');
    await cajas.getByRole('textbox', { name: /^Alto/ }).fill('40');
    await shot(page, nombre, '1-objeto-abierto');
    await cajas.getByRole('button', { name: 'Listo, cerrar Cajas' }).click();
    check('«Listo» cierra la fila', (await fila('Cajas').getAttribute('aria-expanded')) === 'false');
    check('resumen de cajas', (await fila('Cajas').textContent()).includes('12 ×') && (await fila('Cajas').textContent()).includes('12 kg c/u · 0,08 m³ c/u'), await fila('Cajas').textContent());
    await fila('Cajas').click();
    check('al reabrir conserva los datos', (await grupo('Datos de Cajas').getByRole('textbox', { name: /^Cantidad/ }).inputValue()) === '12');

    // Error visible también con la fila cerrada.
    await grupo('Datos de Cajas').getByRole('textbox', { name: /^Largo/ }).fill('50,5');
    check('error medidas enteras', await grupo('Datos de Cajas').getByText('Usa centímetros enteros').first().isVisible());
    await fila('Cajas').click();
    check('fila cerrada marca «Revisar»', (await fila('Cajas').textContent()).includes('Revisar'));
    await fila('Cajas').click();
    await grupo('Datos de Cajas').getByRole('textbox', { name: /^Largo/ }).fill('50');

    // Duplicar (se abre la copia), eliminarla y reordenar.
    await page.getByRole('button', { name: 'Duplicar Cajas' }).click();
    check('duplicado → 3 líneas', await page.getByText('3 de 200 líneas').isVisible());
    check('solo la copia queda abierta', (await page.getByRole('group', { name: 'Datos de Cajas' }).count()) === 1);
    await page.getByRole('button', { name: 'Eliminar Cajas' }).click();
    check('eliminado → 2 líneas', await page.getByText('2 de 200 líneas').isVisible());
    await fila('Cajas').click();
    await page.getByRole('button', { name: 'Subir Cajas' }).click();
    check('subir cambia el orden', (await page.locator('.item-row .disclosure-title').first().textContent()).includes('Cajas'));
    await page.getByRole('button', { name: 'Listo, cerrar Cajas' }).click();
    check('P2-1 «Listo» devuelve el foco al encabezado', await page.evaluate(() => document.activeElement?.classList.contains('disclosure-head') && document.activeElement.textContent.includes('Cajas')));

    // P2-1: teclado. Enter abre, Escape cierra y devuelve el foco al encabezado.
    await fila('Refrigerador').focus();
    await page.keyboard.press('Enter');
    check('Enter abre la fila', (await fila('Refrigerador').getAttribute('aria-expanded')) === 'true');
    await grupo('Datos de Refrigerador').getByRole('textbox', { name: /^Descripción/ }).focus();
    await page.keyboard.press('Escape');
    check('Escape cierra la fila', (await fila('Refrigerador').getAttribute('aria-expanded')) === 'false');
    check('Escape devuelve el foco al encabezado', await page.evaluate(() => document.activeElement?.classList.contains('disclosure-head') && document.activeElement.textContent.includes('Refrigerador')));

    // P2-2: pasar a «Rápido» con una lista no la descarta en silencio.
    await page.getByRole('button', { name: 'Rápido', exact: true }).click();
    check('modo rápido con lista: aviso explícito', await page.getByTestId('conflicto-modo').isVisible());
    check('modo rápido con lista: el resumen no se calcula como vacío', (await page.locator('section[aria-label="Resumen del inventario"]').textContent()).includes('Corrige los campos marcados'));
    await page.getByRole('button', { name: 'Descartar la lista' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('button', { name: 'Volver a «Detallado»' }).click();
    check('de vuelta a detallado: las 2 líneas siguen', await page.getByText('2 de 200 líneas').isVisible());
    check('de vuelta a detallado: datos intactos', (await fila('Cajas').textContent()).includes('12 kg c/u · 0,08 m³ c/u'));

    // Resumen siempre a mano: barra al pie en teléfono, columna fija en PC.
    const resumen = page.locator('section[aria-label="Resumen del inventario"]');
    const textoResumen = await resumen.textContent();
    check('peso total 219 kg', textoResumen.includes('219 kg'), textoResumen.slice(0, 120));
    check('volumen total 1,842 m³', textoResumen.includes('1,842 m³'));
    await resumen.getByRole('textbox', { name: /^Carga útil/ }).fill('1000');
    await resumen.getByRole('textbox', { name: /^Volumen de carga/ }).fill('1,5');
    const cap = await page.getByTestId('capacidad').textContent();
    check('estimación: al menos 2 viajes por volumen', /al menos 2\s+viajes/.test(cap) && cap.includes('volumen'), cap);
    const barra = page.getByTestId('barra-resumen');
    if (telefono) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const t = await barra.textContent();
      check('barra de resumen visible en teléfono', (await barra.isVisible()) && t.includes('219 kg') && t.includes('≥ 2 viajes'), t);
      const caja = await barra.boundingBox();
      check('barra al pie de la pantalla', caja && Math.abs(caja.y + caja.height - opciones.viewport.height) <= 2, JSON.stringify(caja));
    } else {
      check('sin barra en PC', !(await barra.isVisible()));
      const main = await page.locator('.preview-main').boundingBox();
      const aside = await page.locator('.preview-aside').boundingBox();
      check('dos columnas en PC', main && aside && aside.x > main.x + main.width - 1, JSON.stringify({ main, aside }));
      await page.evaluate(() => window.scrollTo(0, 600));
      const top = (await page.locator('.preview-aside').boundingBox()).y;
      check('resumen fijo al desplazarse', top >= 0 && top <= 40, String(top));
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await shot(page, nombre, '2-objetos-cerrados');

    // Accesos (datos de la carga), plegables con resumen.
    await fila('Origen (A)').click();
    const origen = grupo('Accesos de origen (a)');
    await origen.getByLabel('Piso (opcional)').selectOption('4');
    await origen.getByLabel('Ascensor (opcional)').selectOption('no');
    await fila('Origen (A)').click();
    check('resumen de origen', (await fila('Origen (A)').textContent()).includes('4.º piso · sin ascensor'), await fila('Origen (A)').textContent());
    check('destino sin datos marcado como opcional', (await fila('Destino (B)').textContent()).includes('Sin datos (opcional)'));

    // Recursos internos: tiempos, ayudante por hora y equipamiento.
    await fila('Tiempo de carga y descarga').click();
    await page.getByRole('textbox', { name: /^Minutos en origen/ }).fill('30');
    const tiempo = await page.getByTestId('tiempo-carga').textContent();
    check('tiempo incompleto: al menos 30 min, falta el destino', tiempo.includes('al menos 30 min') && tiempo.includes('falta el destino'), tiempo);
    await fila('Tiempo de carga y descarga').click();
    check('tiempos: «Faltan minutos»', (await fila('Tiempo de carga y descarga').textContent()).includes('Faltan minutos'));

    await fila('Ayudantes (0)').click();
    await page.getByRole('button', { name: '+ Agregar ayudante' }).click();
    const ay = grupo('Datos del ayudante 1');
    check('ayudante nuevo abierto', await ay.isVisible());
    await ay.getByRole('button', { name: 'Por hora' }).click();
    await ay.getByRole('textbox', { name: /^Tarifa por hora/ }).fill('6000');
    await ay.getByRole('textbox', { name: /^Horas pagadas/ }).fill('3');
    check('sin tramos: monto faltante', (await page.getByTestId('ayudantes').textContent()).includes('falta el monto de 1'));
    await ay.getByLabel('Carga y descarga').check();
    check('con tramo: $18.000', (await page.getByTestId('ayudantes').textContent()).includes('$18.000'));
    await ay.getByRole('textbox', { name: /^Horas pagadas/ }).fill('30');
    check('30 h rechazadas con mensaje (T-7)', await ay.getByText('Máximo 24 horas').first().isVisible());
    const conTreinta = await page.getByTestId('ayudantes').textContent();
    check('P1-2 con 30 h no se suma $180.000', !conTreinta.includes('180.000') && conTreinta.includes('datos inválidos, no suma'), conTreinta);
    check('P1-2 la fila del ayudante dice «monto no calculable»', (await fila('Ayudante 1').textContent()).includes('monto no calculable'));
    await ay.getByRole('textbox', { name: /^Horas pagadas/ }).fill('3');
    await ay.getByRole('button', { name: 'Listo, cerrar ayudante 1' }).click();
    check('fila del ayudante con monto', (await fila('Ayudante 1').textContent()).includes('3 h × $6.000 = $18.000'));
    await fila('Ayudante 1').click();
    await grupo('Datos del ayudante 1').getByRole('button', { name: 'Por servicio' }).click();
    check('cambio de modalidad sin montos residuales', (await grupo('Datos del ayudante 1').getByRole('textbox', { name: /^Pago por el servicio/ }).inputValue()) === '');
    await grupo('Datos del ayudante 1').getByRole('button', { name: 'Por hora' }).click();
    await grupo('Datos del ayudante 1').getByRole('textbox', { name: /^Tarifa por hora/ }).fill('6000');
    await grupo('Datos del ayudante 1').getByRole('textbox', { name: /^Horas pagadas/ }).fill('3');
    await grupo('Datos del ayudante 1').getByLabel('Carga y descarga').check();
    await shot(page, nombre, '3-recursos');

    // Texto para el cliente: sin datos internos.
    const texto = await page.getByTestId('texto-sugerido').textContent();
    check('texto sugerido con objetos y pisos', texto.includes('12 × Cajas') && texto.includes('1 × Refrigerador') && texto.includes('4.º piso sin ascensor'), texto);
    check('texto sugerido sin kg, m³, $ ni minutos', !/kg|m³|m3|\$|min/i.test(texto), texto);
    check('P1-3 texto para el cliente sin ayudantes', !/ayudante/i.test(texto), texto);

    // Maquetación.
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

    const despues = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
    check('no escribe en el almacenamiento del navegador', antes === despues, `${antes} → ${despues}`);
    await shot(page, nombre, '4-completo', true);
    await page.getByRole('button', { name: 'Cotizar' }).click();
    check('el cotizador sigue disponible', (await page.locator('.layout').count()) > 0);
    check('sin errores en la consola', errores.length === 0, errores.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\nResultado: ${ok} correctas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
