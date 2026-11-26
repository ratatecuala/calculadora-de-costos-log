/**
 * C-1 (A-80, Frente B): reglas sobre el catálogo de CANDIDATOS `datos/catalogo-c1/candidatos.json`.
 * No es el catálogo de la app: nada en `src/` lo importa y no se carga en ninguna base (D-8).
 * Las pruebas hacen cumplir las reglas de #46 y docs/21 §5.1 antes de cualquier revisión humana:
 * ningún valor sin fuente (K1), `null` en vez de estimaciones, solo gasolina o diésel en el piloto,
 * segmentos permitidos, hasta 15 versiones y ningún dato «VERIFICADO» sin haber abierto la página.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = join(__dirname, '..');
const cat = JSON.parse(readFileSync(join(raiz, 'datos/catalogo-c1/candidatos.json'), 'utf8')) as {
  dataVersion: string;
  status: string;
  versions: Array<Record<string, unknown> & { id: string; verificacion?: string; sources: Record<string, { url: string; retrievedAt: string; confidence: string; note?: string; evidencia?: string; sha256?: string; cita?: string }> }>;
  excluded: Array<{ make: string; model: string; reason: string }>;
};

const IDENTIDAD = ['make', 'model', 'version', 'engine', 'fuel', 'year_from', 'year_to'] as const;
const NUMERICOS = {
  km_per_l_ref: [1, 40], curb_weight_kg: [500, 10000], gvw_kg: [800, 15000], payload_kg: [100, 10000],
  cargo_volume_m3: [0.1, 60], cargo_length_mm: [500, 10000], cargo_width_mm: [500, 3000], cargo_height_mm: [100, 3000],
  door_width_mm: [300, 3000], door_height_mm: [300, 3000],
} as const;
const CAMPOS_CON_FUENTE = [...IDENTIDAD, 'km_per_l_cycle', ...Object.keys(NUMERICOS)];

describe('C-1 · catálogo de candidatos (revisión, no producción)', () => {
  it('está marcado como candidatos, sin cargarse en la app', () => {
    expect(cat.status).toMatch(/CANDIDATOS PARA REVISIÓN/);
    const usos = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? usos(join(dir, e.name)) : readFileSync(join(dir, e.name), 'utf8').includes('catalogo-c1') ? [join(dir, e.name)] : [],
      );
    expect(usos(join(raiz, 'src'))).toEqual([]);
    expect(usos(join(raiz, 'supabase'))).toEqual([]);
  });

  it('hasta 15 versiones, ids únicos, segmentos y combustibles del piloto', () => {
    expect(cat.versions.length).toBeGreaterThan(0);
    expect(cat.versions.length).toBeLessThanOrEqual(15);
    expect(new Set(cat.versions.map((v) => v.id)).size).toBe(cat.versions.length);
    for (const v of cat.versions) {
      expect(['camioneta', 'furgon', 'camionLiviano'], v.id).toContain(v.segment);
      expect(['gasolina', 'diesel'], v.id).toContain(v.fuel);
    }
  });

  it('K1: todo valor no nulo tiene fuente con URL y fecha; nada es «VERIFICADO» si la página no se abrió', () => {
    for (const v of cat.versions) {
      for (const campo of CAMPOS_CON_FUENTE) {
        if (v[campo] === null || v[campo] === undefined) continue;
        const f = v.sources[campo];
        expect(f, `${v.id}.${campo} sin fuente`).toBeDefined();
        expect(f!.url, `${v.id}.${campo}`).toMatch(/^https:\/\//);
        expect(f!.retrievedAt, `${v.id}.${campo}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['VERIFICADO', 'SECUNDARIO', 'SUPUESTO'], `${v.id}.${campo}`).toContain(f!.confidence);
        if (f!.confidence === 'VERIFICADO') {
          // A-83: un VERIFICADO exige evidencia descargada (archivo + sha256) y una cita que contiene el valor.
          expect(f!.note ?? '', `${v.id}.${campo}`).not.toMatch(/no pudo abrirse|SOLO como fragmento/);
          expect(f!.evidencia, `${v.id}.${campo} sin evidencia`).toMatch(/\S/);
          expect(f!.sha256, `${v.id}.${campo} sin sha256`).toMatch(/^[0-9a-f]{64}$/);
          const valor = v[campo];
          const variantes = typeof valor === 'number'
            ? [String(valor), String(valor).replace('.', ','), Number.isInteger(valor) ? valor.toLocaleString('de-DE') : String(valor)]
            : [String(valor)];
          // Las cifras deben aparecer literalmente en la cita; los rótulos de identidad (marca, versión) son nuestros.
          const cita = (f!.cita ?? '').toLocaleLowerCase('es');
          if (typeof valor === 'number') expect(variantes.some((x) => cita.includes(x)), `${v.id}.${campo}: la cita no contiene ${String(valor)}`).toBe(true);
          else expect(cita.length, `${v.id}.${campo}: cita vacía`).toBeGreaterThan(0);
        }
      }
      // Una fuente sobre un campo nulo solo puede registrar que el dato falta.
      for (const [campo, f] of Object.entries(v.sources)) {
        if (v[campo] === null) expect(f.confidence, `${v.id}: fuente de un campo nulo (${campo})`).toBe('DATO_FALTANTE');
      }
    }
  });

  it('cifras: números (no textos), en rangos físicamente posibles, y la carga útil nunca supera el peso bruto', () => {
    for (const v of cat.versions) {
      for (const [campo, [min, max]] of Object.entries(NUMERICOS)) {
        const x = v[campo];
        if (x === null) continue;
        expect(typeof x, `${v.id}.${campo}`).toBe('number');
        expect(x as number, `${v.id}.${campo}`).toBeGreaterThanOrEqual(min);
        expect(x as number, `${v.id}.${campo}`).toBeLessThanOrEqual(max);
      }
      if (typeof v.gvw_kg === 'number' && typeof v.payload_kg === 'number') expect(v.payload_kg, v.id).toBeLessThan(v.gvw_kg);
    }
  });

  it('nivel de verificación coherente con notas.md: «completa» exige los 7 campos mínimos VERIFICADOS', () => {
    const MINIMOS = ['make', 'model', 'version', 'fuel', 'km_per_l_ref', 'gvw_kg', 'payload_kg'];
    for (const v of cat.versions) {
      expect(['completa', 'parcial', 'sin_verificar'], v.id).toContain(v.verificacion);
      const verificado = (c: string) => v[c] !== null && v.sources[c]?.confidence === 'VERIFICADO';
      const alguno = Object.keys(v.sources).some((c) => v.sources[c]?.confidence === 'VERIFICADO');
      const esperado = MINIMOS.every(verificado) ? 'completa' : alguno ? 'parcial' : 'sin_verificar';
      expect(v.verificacion, v.id).toBe(esperado);
    }
  });

  it('las exclusiones tienen motivo (eléctricos, medianos o sin datos)', () => {
    for (const e of cat.excluded) expect(e.reason.length, `${e.make} ${e.model}`).toBeGreaterThan(10);
  });
});
