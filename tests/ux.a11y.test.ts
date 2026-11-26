/**
 * H-07 (QA UX): nombres accesibles, errores asociados y Enter en el formulario de vehículo.
 * Se renderiza en el servidor (sin navegador); la interacción se verificó con Playwright.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NumberField } from '../src/web/components/NumberField';
import { VehiclesView } from '../src/web/components/VehiclesView';
import type { VehicleRepository } from '../src/web/vehicleRepository';

const attr = (html: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];
const textOf = (html: string, id: string) => new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('NumberField', () => {
  it('el nombre es «etiqueta + unidad» y la ayuda va como descripción', () => {
    const html = renderToStaticMarkup(
      createElement(NumberField, { label: 'Peajes y TAG', suffix: '$', hint: 'Vacío = no lo sé · 0 = no hay peajes', value: 4200, onChange: () => undefined }),
    );
    const input = /<input[^>]*>/.exec(html)![0];
    const labelledBy = attr(input, 'aria-labelledby')!.split(' ');
    expect(labelledBy.map((id) => textOf(html, id))).toEqual(['Peajes y TAG', '$']);
    expect(textOf(html, attr(input, 'aria-describedby')!)).toBe('Vacío = no lo sé · 0 = no hay peajes');
    expect(input).not.toContain('aria-invalid');
    expect(attr(input, 'value')).toBe('4.200');
  });

  it('un error se asocia al campo y lo marca como inválido', () => {
    const html = renderToStaticMarkup(createElement(NumberField, { label: 'Rendimiento', value: null, onChange: () => undefined, error: 'Debe ser mayor que 0' }));
    const input = /<input[^>]*>/.exec(html)![0];
    expect(attr(input, 'aria-invalid')).toBe('true');
    expect(textOf(html, attr(input, 'aria-describedby')!)).toBe('Debe ser mayor que 0');
  });
});

describe('VehiclesView', () => {
  it('el alta de vehículo es un <form> con botón de envío (Enter guarda)', () => {
    const repository = {} as VehicleRepository;
    const html = renderToStaticMarkup(
      createElement(VehiclesView, { repository, vehicles: [], defaultId: null, onChanged: async () => undefined, onUse: () => undefined }),
    );
    expect(html).toMatch(/^<div class="layout single"><form class="card"/);
    expect(html).toContain('<button type="submit" class="btn">Guardar vehículo</button>');
  });
});
