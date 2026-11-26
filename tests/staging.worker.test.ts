/**
 * Piezas del Worker para staging (sin red): protección con usuario y contraseña, encabezados
 * de seguridad, estado administrativo, falla inyectada en el contador y marcas del simulador.
 * La validación en Cloudflare REAL está en scripts/verificar-cloudflare.mjs.
 */
import { describe, expect, it } from 'vitest';
import { RouteBudgetDurableObject } from '../src/server/budget/durableObject';
import worker, { type WorkerEnv } from '../src/server/worker';
import { clientId, ROUTE } from './helpers';

class MemoryDurableStorage {
  readonly data = new Map<string, unknown>();
  async get<T>(keys: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const k of keys) if (this.data.has(k)) out.set(k, this.data.get(k) as T);
    return out;
  }
  async put<T>(entries: Record<string, T>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) this.data.set(k, v);
  }
}

const BASIC = 'probador:clave-de-staging-para-pruebas';
const ADMIN = 'token-de-administracion-de-pruebas-0123456789';

function env(extra: Record<string, string> = {}, doEnv: Record<string, string> = {}) {
  const storage = new MemoryDurableStorage();
  const object = new RouteBudgetDurableObject({ storage }, doEnv);
  const stub = { fetch: (input: string, init?: RequestInit) => object.fetch(new Request(input, init)) };
  const e: WorkerEnv = {
    ASSETS: { fetch: async () => new Response('<html>app</html>') },
    ROUTE_BUDGET: { idFromName: () => 'global', get: () => stub },
    ...extra,
  };
  return { env: e, storage };
}

const basic = `Basic ${btoa(BASIC)}`;
const route = (headers: Record<string, string>, body: unknown = ROUTE) =>
  new Request('https://staging.test/api/route', {
    method: 'POST',
    headers: { 'X-Client-Id': clientId(), 'CF-Connecting-IP': '7.7.7.7', ...headers },
    body: JSON.stringify(body),
  });

describe('Staging protegido', () => {
  it('sin credenciales: 401 en la app, la API y los enlaces públicos', async () => {
    const { env: e } = env({ STAGING_BASIC_AUTH: BASIC });
    for (const path of ['/', '/c/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx']) {
      const res = await worker.fetch(new Request(`https://staging.test${path}`), e);
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toContain('Basic');
    }
    expect((await worker.fetch(route({}), e)).status).toBe(401);
    expect((await worker.fetch(route({ Authorization: `Basic ${btoa('probador:otra')}` }), e)).status).toBe(401);
  });

  it('con credenciales: responde y agrega encabezados de seguridad', async () => {
    const { env: e } = env({ STAGING_BASIC_AUTH: BASIC });
    const res = await worker.fetch(new Request('https://staging.test/', { headers: { Authorization: basic } }), e);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect((await worker.fetch(route({ Authorization: basic }), e)).status).toBe(200);
  });

  it('sin STAGING_BASIC_AUTH no se exige (desarrollo local)', async () => {
    const { env: e } = env();
    expect((await worker.fetch(new Request('https://x.test/'), e)).status).toBe(200);
  });
});

describe('Estado administrativo', () => {
  it('muestra interruptor y consumo del mes, con token; sin token 401', async () => {
    const { env: e } = env({ ADMIN_TOKEN: ADMIN, STAGING_BASIC_AUTH: BASIC });
    await worker.fetch(route({ Authorization: basic }), e);
    const get = (auth: string) =>
      worker.fetch(new Request('https://staging.test/api/admin/routes', { headers: { Authorization: auth, 'X-Staging-Auth': BASIC } }), e);
    expect((await get('Bearer otro')).status).toBe(401);
    const res = await get(`Bearer ${ADMIN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enabled: true, globalUsed: 1, operationalMonthly: 7000, emergencyMonthly: 8000 });
  });
});

describe('Cierre ante falla del contador (falla inyectada en el Durable Object)', () => {
  it('el contador responde caído: modo manual y el proveedor NO se consulta', async () => {
    const { env: e, storage } = env({}, { STAGING_FAULT_COUNTER: 'true' });
    const res = await worker.fetch(route({}), e);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'manual', reason: 'contador_no_disponible' });
    expect(storage.data.size).toBe(0);
  });
});

describe('Marcas de prueba del simulador (solo con STAGING_TEST_MARKERS)', () => {
  const failing = { origin: 'Calle Uno 123, Ñuñoa [prueba:falla]', destination: 'Avenida Dos 456, Las Condes' };

  it('una falla reintentable consume la reserva inicial y la del reintento', async () => {
    const { env: e, storage } = env({ STAGING_TEST_MARKERS: 'true' });
    const res = await worker.fetch(route({}, failing), e);
    expect(await res.json()).toMatchObject({ status: 'manual', reason: 'error_proveedor' });
    const month = [...storage.data.keys()].find((k) => k.startsWith('g:'))!;
    expect(storage.data.get(month)).toBe(2);
  });

  it('sin la bandera, la marca es solo texto y la ruta se calcula', async () => {
    const { env: e } = env();
    expect(await (await worker.fetch(route({}, failing), e)).json()).toMatchObject({ status: 'ok' });
  });
});

describe('Archivos incrustados (staging)', () => {
  it('sirve archivos con su tipo, y rutas de la app (incluido /c/<token>) devuelven index.html', async () => {
    const { embeddedAssetsBinding } = await import('../src/server/embeddedAssets');
    const assets = embeddedAssetsBinding({
      '/index.html': { body: '<html>app</html>', contentType: 'text/html; charset=utf-8' },
      '/assets/app-123.js': { body: 'console.log(1)', contentType: 'text/javascript; charset=utf-8' },
    });
    const js = await assets.fetch(new Request('https://s.test/assets/app-123.js'));
    expect(js.headers.get('Content-Type')).toContain('javascript');
    expect(js.headers.get('Cache-Control')).toContain('immutable');
    const spa = await assets.fetch(new Request('https://s.test/c/abc'));
    expect(await spa.text()).toBe('<html>app</html>');
    expect(spa.headers.get('Cache-Control')).toBe('no-cache');
    expect((await assets.fetch(new Request('https://s.test/assets/no-existe.js'))).status).toBe(404);
    expect((await assets.fetch(new Request('https://s.test/', { method: 'POST' }))).status).toBe(405);
  });
});

describe('Hallazgo en Cloudflare real (18-11): el stub del Durable Object no se reutiliza entre solicitudes', () => {
  it('cada solicitud crea su propio stub; uno de una solicitud anterior ya no sirve', async () => {
    const storage = new MemoryDurableStorage();
    const object = new RouteBudgetDurableObject({ storage });
    const stubs: Array<{ dead: boolean }> = [];
    // Imita la regla de Workers: un objeto de E/S muere cuando termina su solicitud.
    const namespace = {
      idFromName: () => 'global',
      get: () => {
        const stub = {
          dead: false,
          fetch: (input: string, init?: RequestInit) => {
            if (stub.dead) return Promise.reject(new Error('Cannot perform I/O on behalf of a different request'));
            return object.fetch(new Request(input, init));
          },
        };
        stubs.push(stub);
        return stub;
      },
    };
    const e: WorkerEnv = { ASSETS: { fetch: async () => new Response('app') }, ROUTE_BUDGET: namespace };
    for (let i = 0; i < 3; i += 1) {
      const res = await worker.fetch(route({}, { ...ROUTE, destination: `Pasaje ${i} 100, Maipú` }), e);
      expect(await res.json()).toMatchObject({ status: 'ok' });
      for (const s of stubs) s.dead = true; // terminó la solicitud
    }
    expect(stubs.length).toBe(3);
  });
});
