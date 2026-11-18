/**
 * Regresiones de maquetación responsive (QA UX, docs/14-qa-ux.md).
 * Las pruebas leen la hoja de estilos: el entorno de pruebas no tiene navegador. La verificación
 * visual se hizo con Playwright (Chromium) en teléfono y escritorio.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/web/styles.css', import.meta.url), 'utf8');

/** Contenido de un bloque `@media <condición> { ... }` (llaves balanceadas). */
function mediaBlock(condition: string): string {
  const start = css.indexOf(`@media ${condition} {`);
  if (start < 0) throw new Error(`No existe @media ${condition}`);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error('Bloque sin cerrar');
}

/** Declaraciones de la primera regla cuyo selector es exactamente `selector` dentro de `scope`. */
function rule(scope: string, selector: string): string {
  const re = new RegExp(`(^|[\\n}])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = re.exec(scope);
  if (!m) throw new Error(`No existe la regla ${selector}`);
  return m[2]!;
}

describe('H-01 · navegación en teléfonos', () => {
  it('bajo 560 px las pestañas pasan a una fila propia a todo el ancho', () => {
    const block = mediaBlock('(max-width: 560px)');
    expect(rule(block, '.top')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(block, '.top')).toMatch(/height:\s*auto/);
    expect(rule(block, '.top nav')).toMatch(/flex:\s*1 0 100%/);
    expect(rule(block, '.nav')).toMatch(/flex:\s*1 1 auto/);
  });
});
