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

describe('H-05 · calculadora en anchos intermedios', () => {
  it('entre 760 y 1099 px usa dos columnas: costos a la derecha, precio bajo el recorrido', () => {
    const block = mediaBlock('(min-width: 760px) and (max-width: 1099px)');
    expect(rule(block, '.layout:not(.single)')).toMatch(/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(rule(block, '.layout:not(.single) > .col:nth-child(2)')).toMatch(/grid-row:\s*1 \/ span 2/);
    expect(rule(block, '.layout:not(.single) > .col:nth-child(3)')).toMatch(/grid-column:\s*1;[\s\S]*grid-row:\s*2/);
  });
  it('desde 1100 px se mantienen las tres columnas del diseño v4', () => {
    expect(rule(mediaBlock('(min-width: 1100px)'), '.layout')).toMatch(/repeat\(3, minmax\(0, 1fr\)\)/);
  });
});

describe('H-03 · áreas táctiles de al menos 44 px', () => {
  const minHeight = (selector: string) => Number(/min-height:\s*(\d+)px/.exec(rule(css, selector))?.[1] ?? 0);
  it.each(['.link-btn', '.fold summary', '.fold-card summary', '.check', '.btn2.small', 'select', '.field-compact .field-input', '.seg', '.nav'])(
    '%s',
    (selector) => {
      expect(minHeight(selector)).toBeGreaterThanOrEqual(44);
    },
  );
  it('el enlace dentro de un texto queda en línea (excepción WCAG 2.5.8)', () => {
    expect(rule(css, '.link-btn.inline')).toMatch(/display:\s*inline;/);
  });
});

describe('H-08 · foco de teclado visible', () => {
  it('regla global :focus-visible con el azul de la paleta', () => {
    expect(rule(css, ':focus-visible')).toMatch(/outline:\s*2px solid var\(--blue\)/);
  });
});

describe('H-10 · etiquetas del historial', () => {
  it('no se estiran a todo el ancho de la tarjeta', () => {
    expect(rule(css, '.job > .tag')).toMatch(/align-self:\s*flex-start/);
  });
});
