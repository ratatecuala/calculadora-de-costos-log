/**
 * Genera build/worker-entry.mjs: el Worker de src/server/worker.ts con los archivos de
 * dist/ incrustados (ver src/server/embeddedAssets.ts). Ejecutar después de `vite build`.
 * build/ está en .gitignore: es un artefacto, no código fuente.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const out = join(root, 'build');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = {};
for (const file of walk(dist)) {
  const type = TYPES[extname(file)];
  if (!type) throw new Error(`Tipo de archivo no previsto para incrustar: ${file}`);
  files[`/${relative(dist, file).split('\\').join('/')}`] = { body: readFileSync(file, 'utf8'), contentType: type };
}
if (!files['/index.html']) throw new Error('Falta dist/index.html: ejecuta vite build primero');

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'embedded-assets.mjs'), `export const files = ${JSON.stringify(files)};\n`);
writeFileSync(
  join(out, 'worker-entry.mjs'),
  `// Generado por scripts/embed-assets.mjs — no editar.
import worker, { RouteBudgetDurableObject } from '../src/server/worker.ts';
import { embeddedAssetsBinding } from '../src/server/embeddedAssets.ts';
import { files } from './embedded-assets.mjs';

const ASSETS = embeddedAssetsBinding(files);
export { RouteBudgetDurableObject };
export default {
  fetch(request, env) {
    return worker.fetch(request, { ...env, ASSETS: env.ASSETS ?? ASSETS });
  },
};
`,
);
console.log(`Incrustados ${Object.keys(files).length} archivos de dist/ en build/worker-entry.mjs`);
