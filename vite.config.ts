/// <reference types="vitest" />
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import { readServerConfig } from './src/server/config';
import { createRouteService } from './src/server/createRouteService';
import { handleRouteRequest } from './src/server/routeHandler';

/**
 * Servidor de desarrollo local: atiende POST /api/route con el MISMO handler del Worker,
 * contador en memoria y proveedor SIMULADO. No llama a ningún servicio externo.
 */
function localRouteApi(): Plugin {
  return {
    name: 'api-rutas-local',
    configureServer(server) {
      const deps = createRouteService(readServerConfig({ ...process.env, ROUTES_PROVIDER: 'simulado' }));
      server.middlewares.use('/api/route', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Método no permitido');
          return;
        }
        let body: unknown = null;
        try {
          body = JSON.parse(await readBody(req));
        } catch {
          body = null;
        }
        const header = req.headers['x-client-id'];
        const result = await handleRouteRequest(
          body,
          { clientId: typeof header === 'string' ? header : null, ip: req.socket.remoteAddress ?? null },
          deps,
        );
        res.statusCode = result.httpStatus;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(result.json));
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > 10_000) reject(new Error('Cuerpo demasiado grande'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default defineConfig({
  plugins: [react(), localRouteApi()],
  // Solo las variables con prefijo VITE_ llegan al navegador; las claves de servidor no lo tienen.
  envPrefix: 'VITE_',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
  },
});
