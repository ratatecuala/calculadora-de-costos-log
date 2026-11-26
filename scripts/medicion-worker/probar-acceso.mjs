/**
 * A-91 Frente B · Comprueba el control de acceso del Worker privado `medicion-privada` (local o desplegado).
 *
 *   MEDICION_URL=https://... MEDICION_AUTH='usuario:contraseña' node scripts/medicion-worker/probar-acceso.mjs
 *
 * Nunca imprime la URL ni la contraseña (el informe dice «URL base»). Comprueba:
 * 1. Sin credenciales: `/`, `/sw.js`, cada asset del index, una ruta inexistente y un POST → 401, sin contenido.
 * 2. Credenciales incorrectas → 401.
 * 3. Con credenciales, en Chromium (Pixel 7): la app carga, el service worker toma el control, un registro
 *    en IndexedDB sobrevive a la recarga, y con la red cortada la app vuelve a abrir desde la copia local.
 * 4. 0 peticiones a otros orígenes.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const base = (process.env.MEDICION_URL ?? '').replace(/\/$/, '');
const auth = process.env.MEDICION_AUTH ?? '';
if (!base || !auth.includes(':')) {
  console.error('Faltan MEDICION_URL o MEDICION_AUTH');
  process.exit(2);
}
const [username, ...resto] = auth.split(':');
const password = resto.join(':');
const fallos = [];
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos.push(msg); };
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// 1 y 2: sin navegador
const conCred = await fetch(base + '/', { headers: { Authorization: 'Basic ' + b64(auth) } });
const html = await conCred.text();
const assets = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => '/' + m[1]);
ok(conCred.status === 200 && assets.length > 0, `con credenciales, index 200 y ${assets.length} assets enlazados`);
for (const ruta of ['/', '/index.html', '/sw.js', ...assets, '/no-existe']) {
  const r = await fetch(base + ruta, { redirect: 'manual' });
  const cuerpo = await r.text();
  ok(r.status === 401 && !cuerpo.includes('<script') && !cuerpo.includes('addEventListener'), `sin credenciales ${ruta.replace(/-[\w]{6,}\./, '-*.')} → ${r.status}`);
}
ok((await fetch(base + '/', { method: 'POST' })).status === 401, 'POST sin credenciales → 401');
ok((await fetch(base + '/', { headers: { Authorization: 'Basic ' + b64(username + ':incorrecta') } })).status === 401, 'contraseña incorrecta → 401');
ok((await fetch(base + '/sw.js', { headers: { Authorization: 'Basic ' + b64(username + ':incorrecta') } })).status === 401, 'sw.js con contraseña incorrecta → 401');
if (base.startsWith('https://')) {
  try {
    const r = await fetch(base.replace('https://', 'http://') + '/', { redirect: 'manual' });
    ok(r.status === 308 || r.status === 301, `HTTP redirige a HTTPS (${r.status})`);
  } catch {
    console.log('· HTTP → HTTPS no verificable desde este entorno (sin salida HTTP); cubierto por la prueba unitaria');
  }
}

// 3: navegador
// Un destino remoto (Worker privado) se alcanza por el proxy del entorno, si existe; localhost nunca.
const proxyRemoto = process.env.HTTPS_PROXY && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
  ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
  : undefined;
const navegador = await chromium.launch(proxyRemoto ? { proxy: proxyRemoto } : {});
const ctx = await navegador.newContext({ ...devices['Pixel 7'], httpCredentials: { username, password } });
const origen = new URL(base).origin;
const externas = [];
ctx.on('request', (r) => { if (!r.url().startsWith(origen) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) externas.push(new URL(r.url()).host); });
const page = await ctx.newPage();
await page.goto(base + '/');
await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 15000 });
ok(true, 'la app carga con credenciales');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'el service worker controla la página');
await page.evaluate(() => new Promise((res, rej) => {
  const req = indexedDB.open('prueba-acceso-worker', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('s');
  req.onsuccess = () => { const tx = req.result.transaction('s', 'readwrite'); tx.objectStore('s').put('persistido', 'k'); tx.oncomplete = () => { req.result.close(); res(); }; tx.onerror = rej; };
  req.onerror = rej;
}));
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 15000 });
ok(true, 'sin conexión, la app vuelve a abrir desde la copia local');
const leido = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('prueba-acceso-worker', 1);
  req.onsuccess = () => { const g = req.result.transaction('s').objectStore('s').get('k'); g.onsuccess = () => { req.result.close(); res(g.result); }; };
  req.onerror = () => res(null);
}));
ok(leido === 'persistido', 'IndexedDB conserva el registro tras recargar sin conexión');
await page.evaluate(() => new Promise((res) => { const d = indexedDB.deleteDatabase('prueba-acceso-worker'); d.onsuccess = d.onerror = () => res(); }));
ok(externas.length === 0, `0 peticiones a otros orígenes${externas.length ? ': ' + [...new Set(externas)].join(', ') : ''}`);
await navegador.close();

console.log(fallos.length ? `\n${fallos.length} fallo(s)` : '\nTodo correcto');
process.exit(fallos.length ? 1 : 0);
