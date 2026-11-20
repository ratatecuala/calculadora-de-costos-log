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
import { AccessEditor, InternalResourcesEditor } from '../src/web/components/ResourcesEditor';
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
  it('inventario: filas compactas cerradas, plantillas, contador y marca «Datos de la carga»', () => {
    let d = addItem(emptyInventoryDraft(), newDraftItem('a', { kind: 'cajas', label: 'Cajas' }));
    d = updateItem(d, 'a', { l: 50.5, qty: 12 });
    const html = renderToStaticMarkup(createElement(InventoryEditor, { draft: d, onChange: () => undefined, newKey: () => 'x' }));
    expect(html).toContain('+ Refrigerador');
    expect(html).toContain('1 de 200 líneas');
    expect(html).toContain('Datos de la carga');
    // Fila cerrada: nombre, cantidad y estado; sin campos visibles.
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).toContain('12 ×');
    expect(html).toContain('Revisar');
    expect(html).not.toContain('Marcar como frágil');
  });

  it('accesos: origen y destino plegables con resumen y estado opcional', () => {
    const html = renderToStaticMarkup(createElement(AccessEditor, { draft: emptyResourcesDraft(), onChange: () => undefined }));
    expect(html).toContain('Origen (A)');
    expect(html).toContain('Destino (B)');
    expect(html).toContain('Sin datos de acceso');
    expect(html).toContain('Sin datos (opcional)');
    expect(html).toContain('Datos de la carga');
  });

  it('recursos internos: marcados «Solo para ti» y plegables con resumen', () => {
    let d = addHelper(emptyResourcesDraft(), '00000000-0000-4000-8000-000000000001');
    d = setHelperMode(d, d.helpers[0]!.id, 'hora');
    const html = renderToStaticMarkup(createElement(InternalResourcesEditor, { draft: d, onChange: () => undefined, newId: () => 'x' }));
    expect(html).toContain('Solo para ti');
    expect(html).toContain('El cliente nunca ve esta sección');
    expect(html).toContain('Ayudantes (1)');
    expect(html).toContain('Por hora · ? h × $?');
    // Por hora sin tramos marcados: el contrato lo exige, así que la fila pide revisar (y el monto queda faltante).
    expect(html).toContain('Revisar');
    expect(html).toContain('Origen: sin dato · Destino: sin dato');
  });
});
