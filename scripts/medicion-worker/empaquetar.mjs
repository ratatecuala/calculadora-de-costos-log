/**
 * Empaqueta el Worker privado `medicion-privada` (A-91 Frente B): incrusta los archivos de `dist-medicion/`
 * en `build-medicion/worker-entry.mjs`. Ejecutar después de `npm run build:medicion` (con VITE_FF_MEDICION=1
 * SOLO en ese build). No despliega nada. `build-medicion/` es un artefacto (en .gitignore).
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..', '..');
const dist = join(raiz, 'dist-medicion');
const salida = join(raiz, 'build-medicion');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function recorrer(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? recorrer(p) : [p];
  });
}

const archivos = {};
for (const f of recorrer(dist)) {
  const tipo = TIPOS[extname(f)];
  if (!tipo) throw new Error(`Tipo de archivo no previsto para incrustar: ${f}`);
  archivos[`/${relative(dist, f).split('\\').join('/')}`] = { body: readFileSync(f, 'utf8'), contentType: tipo };
}
for (const req of ['/index.html', '/sw.js']) if (!archivos[req]) throw new Error(`Falta ${req}: ejecuta el build de medición con VITE_FF_MEDICION=1`);
const todo = Object.values(archivos).map((a) => a.body).join('\n');
// Defensa: el paquete privado no debe llevar nada de la app comercial ni de Supabase.
for (const prohibido of ['supabase.co', 'VITE_SUPABASE', 'STAGING_BASIC_AUTH', 'ADMIN_TOKEN']) {
  if (todo.includes(prohibido)) throw new Error(`El paquete de medición contiene «${prohibido}»`);
}

mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, 'archivos.mjs'), `export const archivos = ${JSON.stringify(archivos)};\n`);
writeFileSync(
  join(salida, 'worker-entry.mjs'),
  `// Generado por scripts/medicion-worker/empaquetar.mjs — no editar.
import { crearWorkerMedicion } from '../src/medicion-worker/worker.ts';
import { archivos } from './archivos.mjs';
export default crearWorkerMedicion(archivos);
`,
);
console.log(`Incrustados ${Object.keys(archivos).length} archivos de dist-medicion/ en build-medicion/worker-entry.mjs`);
