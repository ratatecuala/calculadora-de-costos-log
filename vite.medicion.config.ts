/**
 * Entrada de Vite SEPARADA para la herramienta privada de medición (A-90, D-1; docs/31).
 *
 * - Raíz `medicion/`, salida `dist-medicion/`: el paquete de la app comercial (`npm run build`, raíz del
 *   repositorio) no incluye nada de la herramienta, y esta no incluye nada de la app comercial.
 * - Flag `VITE_FF_MEDICION`, APAGADA por defecto: sin `VITE_FF_MEDICION=1` el build se niega y el servidor
 *   de desarrollo muestra «desactivada». Una flag o una ruta oculta NO son control de acceso.
 * - Solo se expone al navegador `VITE_FF_MEDICION` (`envPrefix`): ninguna otra variable `VITE_*` del
 *   `.env` (p. ej., de staging) llega a este paquete.
 * - Sin red: CSP `connect-src 'self'` en el build y un service worker propio para funcionar sin conexión.
 * - No despliega nada: solo genera archivos locales.
 */
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const raiz = fileURLToPath(new URL('.', import.meta.url));

/** Service worker mínimo, sin dependencias: precarga los archivos del build y responde desde la caché. */
function serviceWorker(): Plugin {
  return {
    name: 'medicion-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opciones, bundle) {
      const archivos = ['./', ...Object.keys(bundle).map((f) => './' + f)];
      const version = 'medicion-' + createHash('sha256').update(archivos.join('|')).digest('hex').slice(0, 12);
      const codigo = `/* Service worker de la herramienta de medición (generado; sin dependencias). */
const VERSION = ${JSON.stringify(version)};
const ARCHIVOS = ${JSON.stringify(archivos)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('medicion-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then((c) =>
      c.match(r, { ignoreSearch: true }).then((hit) =>
        hit || fetch(r).catch(() => (r.mode === 'navigate' ? c.match('./') : Response.error())),
      ),
    ),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo });
    },
  };
}

/** CSP del build: nada fuera del propio origen (sin APIs externas, sin Supabase, sin analítica). */
function politicaSeguridad(): Plugin {
  return {
    name: 'medicion-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const csp = "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, raiz, 'VITE_FF_MEDICION');
  const activa = env.VITE_FF_MEDICION === '1';
  if (command === 'build' && !activa) {
    throw new Error(
      'Herramienta de medición DESACTIVADA: el build exige VITE_FF_MEDICION=1 (flag apagada por defecto, A-90 D-1). ' +
        'Úsala solo en local; publicarla requiere autorización y un control de acceso real (docs/31).',
    );
  }
  return {
    root: fileURLToPath(new URL('./medicion', import.meta.url)),
    envDir: raiz,
    envPrefix: 'VITE_FF_MEDICION',
    base: './',
    publicDir: false,
    plugins: [react(), serviceWorker(), politicaSeguridad()],
    server: { fs: { allow: [raiz] } },
    build: {
      outDir: fileURLToPath(new URL('./dist-medicion', import.meta.url)),
      emptyOutDir: true,
      sourcemap: false,
    },
  };
});
