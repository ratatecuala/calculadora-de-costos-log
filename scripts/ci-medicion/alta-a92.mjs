/**
 * A-92. Aceptación independiente en Chromium móvil, contra el build servido por loopback.
 * Solo datos ficticios. El respaldo fijo reproduce el formato anterior al asistente (962f065).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const { expect } = require('playwright/test');
const origen = process.env.A92_ORIGEN;
assert.match(origen ?? '', /^http:\/\/127\.0\.0\.1:\d+$/, 'Se requiere un build local');
const anterior = JSON.parse(readFileSync(new URL('./fixtures/antes-de-a92.json', import.meta.url), 'utf8'));
const sha256 = datos => createHash('sha256').update(JSON.stringify(datos)).digest('hex');
assert.equal(sha256(anterior.presupuestos[0].datos), anterior.presupuestos[0].sha256);

let navegador;
before(async () => { navegador = await chromium.launch(); });
after(async () => { await navegador?.close(); });

async function enTelefono(t, ensayo) {
  const ctx = await navegador.newContext({ ...devices['Pixel 7'], locale: 'es-CL', timezoneId: 'America/Santiago' });
  const externas = [];
  const errores = [];
  ctx.on('request', req => {
    const url = new URL(req.url());
    if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && url.origin !== origen) externas.push(url.origin);
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errores.push(e.message));
  p.setDefaultTimeout(5000);
  t.after(async () => {
    try {
      assert.deepEqual(errores, [], 'Errores de la aplicación');
      assert.deepEqual(externas, [], 'Peticiones fuera del origen local');
    } finally { await ctx.close(); }
  });
  return ensayo(p, ctx);
}

const boton = (p, nombre) => p.getByRole('button', { name: nombre });
const siguiente = p => boton(p, /^(siguiente|continuar|avanzar)/i).click();
const volver = p => boton(p, /^(atrás|volver|anterior|retroceder)/i).click();
const nav = p => p.getByRole('navigation').filter({ has: boton(p, /^historial$/i) });
const desconocido = p => boton(p, /no (?:lo )?s[eé]|no estoy segur/i);

async function sinPatente(p) {
  await expect(p.getByLabel(/patente|matrícula|turbo/i)).toHaveCount(0);
  await expect(p.getByText(/\b(patente|turbo)\b/i)).not.toBeVisible();
}
async function paso(p, numero) {
  await expect(p.getByText(new RegExp('(?:paso\\s*)?' + numero + '\\s*(?:de|/)\\s*4', 'i')).first()).toBeVisible();
  await expect(nav(p)).not.toBeVisible();
  await sinPatente(p);
}

async function comenzar(p) {
  await p.goto(origen);
  await paso(p, 1);
  for (const nombre of [/auto\s*\/?\s*suv/i, /camioneta/i, /furgón/i, /camión liviano/i]) {
    await expect(boton(p, nombre)).toBeVisible();
  }
  await boton(p, /furgón/i).click();
  await siguiente(p);
  await paso(p, 2);
}

const campo = (p, texto) => p.getByLabel(texto);
async function tablero(p) {
  await siguiente(p);
  await paso(p, 3);
  await expect(p.getByText(/\btrip\b/i).first()).toBeVisible();
  await expect(p.getByText(/kilometraje total|kilómetros totales|odómetro|cuentakilómetros/i).first()).toBeVisible();
}

async function desconozcoTablero(p) {
  const opciones = desconocido(p);
  assert.ok(await opciones.count() > 0, 'El tablero debe admitir información desconocida');
  for (const b of await opciones.all()) await b.click();
}

async function consumo(p) {
  await siguiente(p);
  await paso(p, 4);
  await expect(boton(p, /conozco mi rendimiento|sé (?:mi|cuántos)/i)).toBeVisible();
  await expect(boton(p, /tablero.*(?:consumo|muestra)/i)).toBeVisible();
  await desconocido(p).click();
}
async function terminar(p) {
  await boton(p, /^(guardar|terminar|finalizar|listo|comenzar|ir a inicio)/i).click();
  await expect(nav(p)).toBeVisible();
  for (const nombre of ['Inicio', 'Combustible', 'Historial', 'Vehículo']) {
    await expect(boton(nav(p), new RegExp('^' + nombre + '$', 'i'))).toBeVisible();
  }
}
async function altaSinDatos(p) {
  await comenzar(p);
  await tablero(p);
  await desconozcoTablero(p);
  await consumo(p);
  await terminar(p);
}

async function registros(p, coleccion) {
  return p.evaluate(async nombre => {
    const solicitar = r => new Promise((ok, error) => {
      r.onsuccess = () => ok(r.result);
      r.onerror = () => error(r.error);
    });
    const bd = await solicitar(indexedDB.open('medicion.v1'));
    try { return await solicitar(bd.transaction(nombre).objectStore(nombre).getAll()); }
    finally { bd.close(); }
  }, coleccion);
}

function verificarDesconocido(v) {
  assert.equal(v.tipoVehiculo, 'furgon');
  assert.match(v.alias, /^veh-\d+$/);
  assert.equal(v.porDefecto.kmL.valor, null, 'El rendimiento desconocido debe seguir faltante, incluso frente a cero');
  assert.equal(v.porDefecto.kmL.procedencia.clase, 'faltante');
  assert.equal(v.resolucionOdometroKm, null);
  assert.equal(v.resolucionTripKm, null);
}

test('cuatro pasos, barra oculta, campos opcionales y rendimiento faltante en IndexedDB', t =>
  enTelefono(t, async p => {
    await altaSinDatos(p);
    const vehiculos = await registros(p, 'vehiculos');
    assert.equal(vehiculos.length, 1);
    verificarDesconocido(vehiculos[0]);
    await expect(p.getByText(/mi vehículo/i).first()).toBeVisible();
    for (const nombre of [/iniciar (?:un )?viaje/i, /registrar (?:una )?recarga/i, /mis viajes/i]) {
      await expect(boton(p, nombre)).toBeVisible();
    }
    await p.reload();
    await expect(nav(p)).toBeVisible();
    assert.deepEqual(await registros(p, 'vehiculos'), vehiculos);
  }));

test('retroceder conserva las respuestas escritas y permite dejar la cilindrada vacía', t =>
  enTelefono(t, async p => {
    await comenzar(p);
    await campo(p, /marca/i).fill('Marca de prueba');
    await campo(p, /modelo/i).fill('Modelo de prueba');
    await campo(p, /año/i).fill('2019');
    const motor = campo(p, /motor|cilindrada/i);
    await expect(motor).toHaveValue('');
    await volver(p);
    await paso(p, 1);
    await siguiente(p); // Debe recordar el furgón sin volver a seleccionarlo.
    await paso(p, 2);
    await expect(campo(p, /marca/i)).toHaveValue('Marca de prueba');
    await expect(campo(p, /modelo/i)).toHaveValue('Modelo de prueba');
    await expect(campo(p, /año/i)).toHaveValue('2019');
    await tablero(p);
    await desconozcoTablero(p);
    await consumo(p);
    await volver(p);
    await paso(p, 3);
    await siguiente(p); // Debe conservar las respuestas del tablero.
    await paso(p, 4);
    await terminar(p);
    const [v] = await registros(p, 'vehiculos');
    verificarDesconocido(v);
    assert.ok(JSON.stringify(v).includes('Marca de prueba') && JSON.stringify(v).includes('Modelo de prueba'));
  }));

async function descargarRespaldo(p) {
  const [d] = await Promise.all([p.waitForEvent('download'), p.locator('[data-respaldo-exportar]').click()]);
  return JSON.parse(readFileSync(await d.path(), 'utf8'));
}

async function abrirHistorial(p) {
  await boton(nav(p), /^historial$/i).click();
}
async function restaurarDesdeAlta(p, copia) {
  await p.goto(origen);
  await paso(p, 1);
  await boton(p, /restaurar una copia de seguridad/i).click();
  await p.locator('[data-respaldo-importar]').setInputFiles({
    name: 'respaldo-ficticio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copia)),
  });
  await expect.poll(async () => (await registros(p, 'viajes')).length).toBe(copia.viajes.length);
  await p.reload();
  await expect(nav(p)).toBeVisible();
}

test('alta y primer viaje sin conexión, persistencia y respaldo restaurado en un dispositivo vacío', t =>
  enTelefono(t, async (p, ctx) => {
    await p.goto(origen);
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.reload();
    await p.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await ctx.setOffline(true);
    await p.reload();
    await altaSinDatos(p);
    await boton(p, /iniciar (?:un )?viaje/i).click();
    // La ficha se abre desde Inicio. Si el diseño solicita confirmación, se usa su control público.
    const confirmar = p.locator('[data-iniciar]');
    if (await confirmar.isVisible()) await confirmar.click();
    await expect.poll(async () => (await registros(p, 'viajes')).length).toBe(1);
    const viajes = await registros(p, 'viajes');
    const vehiculos = await registros(p, 'vehiculos');
    assert.equal(viajes[0].estado, 'en curso');
    assert.equal(viajes[0].vehiculoId, vehiculos[0].id);
    verificarDesconocido(vehiculos[0]);
    await p.reload();
    assert.deepEqual(await registros(p, 'viajes'), viajes);
    await abrirHistorial(p);
    const copia = await descargarRespaldo(p);
    assert.deepEqual(copia.viajes, viajes);
    assert.deepEqual(copia.vehiculos, vehiculos);
    await enTelefono(t, async limpio => {
      await restaurarDesdeAlta(limpio, copia);
      assert.deepEqual(await registros(limpio, 'vehiculos'), vehiculos);
      assert.deepEqual(await registros(limpio, 'viajes'), viajes);
    });
  }));

test('importa respaldo anterior y conserva su sello histórico sin recalcularlo', t =>
  enTelefono(t, async p => {
    await restaurarDesdeAlta(p, anterior);
    await comprobarAnterior(p);
  }));

async function comprobarAnterior(p) {
  await abrirHistorial(p);
  await expect(p.locator('[data-viaje="viaje-001"]')).toBeVisible();
  const exportado = await descargarRespaldo(p);
  assert.deepEqual(exportado.viajes, anterior.viajes);
  assert.equal(exportado.vehiculos[0].porDefecto.kmL.valor, 12.4);
  assert.deepEqual(exportado.presupuestos, anterior.presupuestos);
  assert.equal(sha256(exportado.presupuestos[0].datos), anterior.presupuestos[0].sha256);
}
test('un dispositivo con IndexedDB anterior abre Inicio sin repetir el alta y puede exportar sus originales', t =>
  enTelefono(t, async p => {
    // Abrir solo un documento del mismo origen, antes de que la aplicación pueda inicializarse.
    await p.route(origen + '/preparar', r => r.fulfill({ contentType: 'text/html', body: '<title>Dispositivo de prueba</title>' }));
    await p.goto(origen + '/preparar');
    await p.evaluate(async copia => {
      const apertura = indexedDB.open('medicion.v1', 1);
      apertura.onupgradeneeded = () => {
        for (const nombre of ['vehiculos', 'presupuestos', 'viajes', 'cargas', 'fotos', 'ajustes']) {
          apertura.result.createObjectStore(nombre, { keyPath: 'id' });
        }
      };
      const bd = await new Promise((ok, error) => {
        apertura.onsuccess = () => ok(apertura.result);
        apertura.onerror = () => error(apertura.error);
      });
      try {
        const tx = bd.transaction(['vehiculos', 'presupuestos', 'viajes'], 'readwrite');
        for (const nombre of ['vehiculos', 'presupuestos', 'viajes']) {
          for (const registro of copia[nombre]) tx.objectStore(nombre).add(registro);
        }
        await new Promise((ok, error) => {
          tx.oncomplete = ok; tx.onabort = () => error(tx.error);
        });
      } finally { bd.close(); }
    }, anterior);
    await p.goto(origen);
    await expect(nav(p)).toBeVisible();
    await comprobarAnterior(p);
  }));
