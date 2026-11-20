/**
 * Fase 1 (A-66): los editores están detrás de una feature flag DESACTIVADA y no se conectan al
 * cotizador. Se comprueba el valor por defecto, que ningún archivo del repositorio la active, que
 * el cotizador y el guardado no importan los módulos nuevos, y el marcado accesible de los editores.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from '../src/web/featureFlags';
import { InventoryEditor } from '../src/web/components/InventoryEditor';
import { ResourcesEditor } from '../src/web/components/ResourcesEditor';
import { addItem, emptyInventoryDraft, newDraftItem, updateItem } from '../src/web/modules/inventoryDraft';
import { addHelper, emptyResourcesDraft, setHelperMode } from '../src/web/modules/resourcesDraft';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');

describe('Feature flag de inventario y recursos', () => {
  it('está desactivada por defecto', () => {
    expect(FEATURE_FLAGS.modulosCargaRecursos).toBe(false);
  });

  it('ningún archivo .env del repositorio la activa', () => {
    const envs = readdirSync(root).filter((f) => f.startsWith('.env'));
    // Solo se informa el nombre del archivo, nunca su contenido (puede tener secretos locales).
    for (const f of envs) expect(/VITE_FF_CARGA_RECURSOS\s*=\s*1/.test(read(f)), f).toBe(false);
    expect(read('wrangler.jsonc')).not.toMatch(/VITE_FF_CARGA_RECURSOS/);
  });

  it('App solo muestra la vista previa con la flag activada', () => {
    const app = read('src/web/App.tsx');
    expect(app).toMatch(/FEATURE_FLAGS\.modulosCargaRecursos \? tab\('modulos'/);
    expect(app).toMatch(/FEATURE_FLAGS\.modulosCargaRecursos && view\.name === 'modulos' \? <ModulesPreview \/>/);
  });

  it('el cotizador, la sesión, el motor y el guardado NO importan los módulos nuevos', () => {
    const protegidos = ['src/web/session.ts', 'src/web/components/Calculator.tsx', 'src/web/jobs.ts', 'src/web/saveQuote.ts', 'src/web/storage.ts', 'src/web/cloud/quotes.ts', 'src/web/cloud/migration.ts'];
    for (const f of protegidos) {
      const src = read(f);
      expect(src, f).not.toMatch(/shared\/(cargo|resources|snapshot)|modules\/|InventoryEditor|ResourcesEditor|ModulesPreview/);
    }
    for (const f of readdirSync(new URL('src/engine/', root))) {
      expect(read(`src/engine/${f}`), f).not.toMatch(/shared\/(cargo|resources)|modules\//);
    }
  });
});

describe('Marcado de los editores (teléfono y PC comparten el mismo DOM)', () => {
  it('inventario: plantillas, contador, campos con etiqueta y textos de T-8', () => {
    let d = addItem(emptyInventoryDraft(), newDraftItem('a', { kind: 'cajas', label: 'Cajas' }));
    d = updateItem(d, 'a', { l: 50.5 });
    const html = renderToStaticMarkup(createElement(InventoryEditor, { draft: d, onChange: () => undefined, newKey: () => 'x' }));
    expect(html).toContain('+ Refrigerador');
    expect(html).toContain('1 de 200 líneas');
    expect(html).toContain('Marcar como frágil');
    expect(html).toContain('Sin manejo especial declarado');
    expect(html).toContain('no cambian el costo');
    expect(html).toContain('Usa centímetros enteros');
    expect(html).toMatch(/aria-invalid="true"/);
  });

  it('recursos: origen y destino, modalidad por ayudante y tramos', () => {
    let d = addHelper(emptyResourcesDraft(), '00000000-0000-4000-8000-000000000001');
    d = setHelperMode(d, d.helpers[0]!.id, 'hora');
    const html = renderToStaticMarkup(createElement(ResourcesEditor, { draft: d, onChange: () => undefined, newId: () => 'x' }));
    expect(html).toContain('Origen (A)');
    expect(html).toContain('Destino (B)');
    expect(html).toContain('3.er piso');
    expect(html).toContain('Tramos que pagas');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Por hora/);
    expect(html).toContain('Indica qué tramos se pagan');
  });
});
