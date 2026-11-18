/**
 * Genera la versión de PORTADA del README (para `main`), según la regla A-48 (AGENTS.md §10).
 * Mientras el código y los documentos vivan solo en la rama de desarrollo, los enlaces
 * relativos del README se convierten en enlaces absolutos a esa rama.
 *
 *   node scripts/readme-portada.mjs [rama] > /ruta/README.md
 *
 * Solo transforma enlaces Markdown relativos `](ruta)`; no toca URLs absolutas ni anclas.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'https://github.com/ratatecuala/calculadora-de-costos-log';
const branch = process.argv[2] ?? 'claude/determined-volta-q9xvli';
const source = readFileSync(resolve(import.meta.dirname, '..', 'README.md'), 'utf8');

const converted = source.replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_m, path) => {
  const clean = path.replace(/^\.\//, '');
  const kind = clean.endsWith('/') ? 'tree' : 'blob';
  return `](${REPO}/${kind}/${branch}/${clean})`;
});

const banner = `> **Versión de portada.** El desarrollo vive en la rama \`${branch}\` ([PR #34](${REPO}/pull/34)); los enlaces apuntan a esa rama hasta que el propietario autorice integrarla a \`main\`.\n\n`;
const firstBreak = converted.indexOf('\n\n');
process.stdout.write(converted.slice(0, firstBreak + 2) + banner + converted.slice(firstBreak + 2));
