/** A-91 Frente B · Worker privado: contraseña en TODO, falla cerrado, HTTPS, sin respaldo público. */
import { describe, expect, it } from 'vitest';
import { crearWorkerMedicion, mismoSecreto } from '../src/medicion-worker/worker';

const archivos = {
  '/index.html': { body: '<!doctype html><title>Medición</title>', contentType: 'text/html; charset=utf-8' },
  '/sw.js': { body: 'self.addEventListener("fetch",()=>{})', contentType: 'text/javascript; charset=utf-8' },
  '/assets/index-abc.js': { body: 'console.log(1)', contentType: 'text/javascript; charset=utf-8' },
};
const worker = crearWorkerMedicion(archivos);
const SECRETO = 'tomas:clave-ficticia-de-prueba';
const env = { MEDICION_BASIC_AUTH: SECRETO };
const basic = (s: string) => 'Basic ' + btoa(s);
const pedir = (ruta: string, init: RequestInit = {}, base = 'https://medicion.example.workers.dev') => worker.fetch(new Request(base + ruta, init), env);
const RUTAS = ['/', '/index.html', '/sw.js', '/assets/index-abc.js', '/no-existe', '/assets/../sw.js', '/.env'];

describe('Worker medicion-privada', () => {
  it('sin credenciales: 401 en todas las rutas, recursos, sw.js e inexistentes, sin contenido de la app', async () => {
    for (const r of RUTAS) {
      const res = await pedir(r);
      expect(res.status, r).toBe(401);
      expect(res.headers.get('WWW-Authenticate'), r).toContain('Basic realm="medicion-privada"');
      const cuerpo = await res.text();
      expect(cuerpo).not.toContain('Medición');
      expect(cuerpo).not.toContain('addEventListener');
    }
    expect((await pedir('/', { method: 'POST' })).status).toBe(401);
  });

  it('credenciales incorrectas, vacías, mal formadas o de otro entorno: 401', async () => {
    for (const h of [basic('tomas:otra'), basic('tomas:'), basic(':'), basic(SECRETO + 'x'), 'Basic %%%', 'Bearer ' + SECRETO, basic(SECRETO).toLowerCase()]) {
      expect((await pedir('/', { headers: { Authorization: h } })).status, h).toBe(401);
    }
  });

  it('falla cerrado sin secreto o con secreto inválido: 503 y nunca contenido', async () => {
    for (const e of [{}, { MEDICION_BASIC_AUTH: '' }, { MEDICION_BASIC_AUTH: 'sin-dos-puntos' }, { MEDICION_BASIC_AUTH: 42 }]) {
      const res = await worker.fetch(new Request('https://x.workers.dev/', { headers: { Authorization: basic(':') } }), e);
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain('Medición');
    }
  });

  it('con credenciales: sirve index, assets y sw.js con su tipo; 404 autenticado para lo demás', async () => {
    const h = { Authorization: basic(SECRETO) };
    const raiz = await pedir('/', { headers: h });
    expect(raiz.status).toBe(200);
    expect(raiz.headers.get('Content-Type')).toContain('text/html');
    expect(await raiz.text()).toContain('Medición');
    const sw = await pedir('/sw.js', { headers: h });
    expect(sw.status).toBe(200);
    expect(sw.headers.get('Content-Type')).toContain('javascript');
    expect((await pedir('/assets/index-abc.js', { headers: h })).status).toBe(200);
    expect((await pedir('/no-existe', { headers: h })).status).toBe(404);
    expect((await pedir('/', { headers: h, method: 'POST' })).status).toBe(405);
    const head = await pedir('/', { headers: h, method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('cabeceras de seguridad y sin caché en todas las respuestas (también 401)', async () => {
    for (const res of [await pedir('/'), await pedir('/', { headers: { Authorization: basic(SECRETO) } })]) {
      expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('Cache-Control')).toBe('private, no-store');
      expect(res.headers.get('Strict-Transport-Security')).toContain('max-age=');
    }
  });

  it('HTTP fuera de localhost redirige a HTTPS antes de pedir credenciales; localhost se permite para pruebas', async () => {
    const res = await pedir('/sw.js', {}, 'http://medicion.example.workers.dev');
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://medicion.example.workers.dev/sw.js');
    expect((await pedir('/', {}, 'http://localhost:8787')).status).toBe(401);
  });

  it('mismoSecreto compara contenido y largo', () => {
    expect(mismoSecreto('a:b', 'a:b')).toBe(true);
    expect(mismoSecreto('a:b', 'a:c')).toBe(false);
    expect(mismoSecreto('a:b', 'a:bc')).toBe(false);
  });
});
