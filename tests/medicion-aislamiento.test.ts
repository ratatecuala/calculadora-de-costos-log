/**
 * A-90, Frente A — aislamiento de la herramienta de medición respecto de la app comercial (análisis
 * estático de fuentes; el tamaño y contenido de los paquetes compilados se comprueba aparte, docs/31).
 *
 * - Ningún archivo de la app comercial (src/web, src/server, src/shared, src/engine) ni su entrada
 *   (index.html, vite.config.ts) importa o menciona la herramienta.
 * - La herramienta no importa la app comercial, la nube, Supabase, el snapshot ni scripts de Codex.
 * - Sin red: ni fetch, ni XMLHttpRequest, ni WebSocket, ni sendBeacon en la herramienta.
 * - Nunca alert()/confirm()/prompt(): las confirmaciones son de la página.
 * - La flag queda apagada por defecto.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = join(__dirname, '..');
function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(tsx?|jsx?|mjs|css|html|json)$/.test(n) ? [p] : [];
  });
}
const leer = (p: string) => readFileSync(p, 'utf8');
const medicion = archivos(join(raiz, 'src/medicion'));
const codigoMedicion = medicion.filter((p) => /\.tsx?$/.test(p));

describe('la app comercial no conoce la herramienta de medición', () => {
  const comercial = ['src/web', 'src/server', 'src/shared', 'src/engine'].flatMap((d) => archivos(join(raiz, d)));
  it.each(comercial.map((p) => [relative(raiz, p)]))('%s no importa src/medicion', (rel) => {
    const t = leer(join(raiz, rel));
    expect(t).not.toMatch(/from\s+['"][^'"]*medicion[^'"]*['"]/);
    expect(t).not.toMatch(/import\(\s*['"][^'"]*medicion/);
  });

  it('la entrada comercial (index.html, vite.config.ts) no incluye la herramienta', () => {
    expect(leer(join(raiz, 'index.html'))).not.toMatch(/medicion/i);
    expect(leer(join(raiz, 'vite.config.ts'))).not.toMatch(/medicion/i);
  });

  it('el control: el análisis sí detecta un import de medición (control negativo del patrón)', () => {
    expect("import { App } from '../medicion/App';").toMatch(/from\s+['"][^'"]*medicion[^'"]*['"]/);
  });
});

describe('la herramienta no importa la app comercial, la nube ni scripts de Codex; el contrato de #55 solo por su entrada pública', () => {
  const prohibidos = [/src\/web|\.\.\/web\//, /snapshot/, /clientQuote/, /saveQuote/, /cloud\//, /supabase/i, /scripts\/campo|scripts\/simulacro/, /shared\/campo\/(?!index\.js$)/];
  it.each(codigoMedicion.map((p) => [relative(raiz, p)]))('%s', (rel) => {
    const imports = [...leer(join(raiz, rel)).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const i of imports) for (const re of prohibidos) expect(i, `${rel} importa ${i}`).not.toMatch(re);
    for (const i of imports.filter((x) => x.startsWith('../shared/') || x.startsWith('../../shared/'))) expect(i).toMatch(/shared\/(?:procedencia|campo\/index\.js)$/);
  });

  it('sin red ni diálogos del navegador', () => {
    for (const p of codigoMedicion) {
      const t = leer(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(t, relative(raiz, p)).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
      expect(t, relative(raiz, p)).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
    }
  });

  it('sin adaptadores duplicados: no queda contrato provisional, huella propia ni motor propio', () => {
    expect(existsSync(join(raiz, 'src/medicion/contrato-provisional.ts'))).toBe(false);
    for (const p of codigoMedicion) {
      const t = leer(p);
      expect(t, relative(raiz, p)).not.toMatch(/crypto\.subtle|CLASE_A_CAMPO|engine\/(?:inputs|measures|rounding)/);
    }
  });
});

describe('flag VITE_FF_MEDICION apagada por defecto', () => {
  it('ningún .env de ejemplo la enciende; el build la exige; la app muestra «desactivada» sin ella', () => {
    for (const n of readdirSync(raiz).filter((x) => x.startsWith('.env') && x.includes('example'))) {
      expect(leer(join(raiz, n))).not.toMatch(/VITE_FF_MEDICION\s*=\s*1/);
    }
    const cfg = leer(join(raiz, 'vite.medicion.config.ts'));
    expect(cfg).toMatch(/command === 'build' && !activa/);
    expect(cfg).toMatch(/envPrefix: 'VITE_FF_MEDICION'/);
    const main = leer(join(raiz, 'src/medicion/main.tsx'));
    expect(main).toMatch(/import\.meta\.env\.VITE_FF_MEDICION === '1'/);
    expect(main).toMatch(/desactivada/);
  });

  it('el fixture de cotización es ficticio y no trae datos personales', () => {
    const f = leer(join(raiz, 'src/medicion/fixtures/cotizacion-v3-ficticia.json'));
    expect(f).toMatch(/"ficticia": true/);
    expect(f).not.toMatch(/@|patente|calle|avenida|\+56/i);
  });
});
