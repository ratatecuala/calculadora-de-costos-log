/**
 * H-02 / H-04 (QA UX): las secciones plegables no dependen de lo que se escribe en el formulario
 * y su contenido va en un contenedor con flex/gap.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Fold } from '../src/web/components/Fold';

describe('Fold', () => {
  it('respeta el estado inicial y envuelve el contenido en .fold-body', () => {
    const open = renderToStaticMarkup(createElement(Fold, { summary: 'Tus datos', defaultOpen: true, children: 'contenido' }));
    expect(open).toBe('<details class="fold" open=""><summary>Tus datos</summary><div class="fold-body">contenido</div></details>');
    const closed = renderToStaticMarkup(createElement(Fold, { summary: 'Opciones', className: 'card fold-card', summaryClassName: 'sec', children: 'x' }));
    expect(closed).toBe('<details class="card fold-card"><summary class="sec">Opciones</summary><div class="fold-body">x</div></details>');
  });

  it('ningún componente controla <details open> con datos del formulario', () => {
    const dir = new URL('../src/web/components/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx') && f !== 'Fold.tsx')) {
      const src = readFileSync(new URL(file, dir), 'utf8');
      expect(src, file).not.toMatch(/<details/);
    }
  });
});
