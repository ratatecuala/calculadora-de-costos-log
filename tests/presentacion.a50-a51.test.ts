/**
 * A-50 (C-3, C-4) y A-51 (IVA: leyenda y «Precio total»), aprobadas por el propietario el 18-11-2026.
 * Solo presentación: el motor y los casos dorados no cambian.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QUOTE_LEGAL_NOTICE, whatsappText, type ClientQuote } from '../src/shared/clientQuote';
import { QuoteDocument } from '../src/web/components/QuoteView';
import { NumberField } from '../src/web/components/NumberField';

const base: ClientQuote = {
  number: 7,
  issuedAt: '2026-11-18T12:00:00.000Z',
  businessName: 'Fletes Ficticios',
  businessPhone: '',
  businessEmail: '',
  clientName: 'Cliente de prueba',
  serviceDescription: 'Traslado de prueba',
  includes: '',
  conditions: '',
  validUntil: '',
  serviceDate: '',
  originLabel: 'A ficticio',
  destinationLabel: 'B ficticio',
  netPrice: 55000,
  taxAmount: null,
  total: 55000,
};

describe('A-51 — la cotización sin IVA verificado muestra «Precio total» y la leyenda', () => {
  it('documento (pantalla, PDF y enlace público usan el mismo componente)', () => {
    const html = renderToStaticMarkup(createElement(QuoteDocument, { q: base }));
    expect(html).toContain('Precio total');
    expect(html).not.toContain('Valor neto');
    expect(html).toContain(QUOTE_LEGAL_NOTICE);
  });

  it('con IVA verificado se mantiene el desglose Neto / IVA / Total, también con la leyenda', () => {
    const html = renderToStaticMarkup(createElement(QuoteDocument, { q: { ...base, taxAmount: 10450, total: 65450 } }));
    expect(html).toContain('Neto');
    expect(html).toContain('IVA');
    expect(html).toContain(QUOTE_LEGAL_NOTICE);
  });

  it('WhatsApp: «Precio total» y leyenda al final', () => {
    const text = whatsappText(base);
    expect(text).toContain('Precio total: $55.000');
    expect(text).not.toContain('Valor neto');
    expect(text.trim().endsWith(QUOTE_LEGAL_NOTICE)).toBe(true);
  });

  it('la leyenda es exactamente la aprobada', () => {
    expect(QUOTE_LEGAL_NOTICE).toBe('Esta cotización no es factura ni boleta.');
  });
});

describe('A-50 — margen: rótulo (C-3) y valor con decimales (C-4)', () => {
  const ui = readFileSync(new URL('../src/web/components/Calculator.tsx', import.meta.url), 'utf8');

  it('C-3: el rótulo dice que el margen es un % del precio de venta, no «sobre el costo»', () => {
    expect(ui).toContain('Margen objetivo (% del precio de venta)');
    expect(ui).not.toContain('Ganancia extra sobre el costo');
  });

  it('C-4: el campo muestra el margen que usa el cálculo (12,5 %), no un valor redondeado', () => {
    expect(ui).toContain('value={Math.round(s.margin * 10000) / 100}');
    const html = renderToStaticMarkup(createElement(NumberField, { label: 'Margen objetivo', suffix: '%', decimals: 2, value: 12.5, onChange: () => undefined }));
    expect(/value="([^"]*)"/.exec(/<input[^>]*>/.exec(html)![0])![1]).toBe('12,5');
  });
});
