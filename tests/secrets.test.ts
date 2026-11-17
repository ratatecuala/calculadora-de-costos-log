import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { BudgetLedger, MemoryCounterStorage } from '../src/server/budget/ledger';
import { readServerConfig } from '../src/server/config';
import { createRouteService } from '../src/server/createRouteService';
import { GoogleRoutesProvider } from '../src/server/google/provider';
import { handleRouteRequest } from '../src/server/routeHandler';
import { END_OF_MONTH, ROUTE, clientId, policy } from './helpers';

const SENTINEL = 'CLAVE-SECRETA-DE-PRUEBA-0000000000';
const root = resolve(__dirname, '..');
const outDir = mkdtempSync(join(tmpdir(), 'cotizador-build-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

describe('Prueba 8 — no se expone ninguna clave de API al navegador', () => {
  it('el paquete del navegador no contiene la clave aunque esté en el entorno', async () => {
    const previous = { key: process.env.GOOGLE_ROUTES_API_KEY, vite: process.env.VITE_GOOGLE_ROUTES_API_KEY };
    process.env.GOOGLE_ROUTES_API_KEY = SENTINEL;
    try {
      await build({ root, configFile: resolve(root, 'vite.config.ts'), logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    } finally {
      if (previous.key === undefined) delete process.env.GOOGLE_ROUTES_API_KEY;
      else process.env.GOOGLE_ROUTES_API_KEY = previous.key;
    }
    const files = filesUnder(outDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      expect(content).not.toContain(SENTINEL);
      expect(content).not.toContain('GOOGLE_ROUTES_API_KEY');
      expect(content).not.toContain('X-Goog-Api-Key');
      expect(content).not.toContain('routes.googleapis.com');
    }
  }, 60_000);

  it('el código del navegador no importa módulos del servidor ni lee variables de entorno', () => {
    const webFiles = [...filesUnder(join(root, 'src/web')), ...filesUnder(join(root, 'src/shared')), ...filesUnder(join(root, 'src/engine'))];
    for (const f of webFiles) {
      const content = readFileSync(f, 'utf8');
      expect(content, f).not.toMatch(/from ['"][./]*server\//);
      expect(content, f).not.toContain('import.meta.env');
      expect(content, f).not.toContain('process.env');
    }
  });

  it('las respuestas de /api/route no incluyen la clave (adaptador Google con fetch falso)', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ routes: [{ legs: [{ distanceMeters: 13200, duration: '1200s' }] }] }), { status: 200 })) as unknown as typeof fetch;
    const res = await handleRouteRequest(
      ROUTE,
      { clientId: clientId(), ip: '1.2.3.4' },
      {
        config: { routesEnabled: true, originSalt: 's' },
        budget: new BudgetLedger(new MemoryCounterStorage(), { policy: policy() }),
        provider: new GoogleRoutesProvider({ apiKey: SENTINEL, fetchImpl }),
        clock: () => END_OF_MONTH,
      },
    );
    expect(res.json.status).toBe('ok');
    expect(JSON.stringify(res.json)).not.toContain(SENTINEL);
  });

  it('sin habilitación explícita, Google queda apagado y nunca se usa la clave', () => {
    const half = readServerConfig({ ROUTES_PROVIDER: 'google', GOOGLE_ROUTES_API_KEY: SENTINEL });
    expect(half).toMatchObject({ provider: 'google', routesEnabled: false, googleApiKey: null });
    const deps = createRouteService(half);
    expect(deps.provider.name).toBe('simulado');
    expect(deps.config.routesEnabled).toBe(false);
    expect(JSON.stringify(deps.config)).not.toContain(SENTINEL);
    // Por defecto: simulado.
    expect(readServerConfig({})).toMatchObject({ provider: 'simulado', googleApiKey: null });
  });
});
