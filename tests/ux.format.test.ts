/**
 * H-06 (QA UX): números y fechas en formato chileno en campos, documento e historial.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClientQuote } from '../src/shared/clientQuote';
import { QuoteDocument } from '../src/web/components/QuoteView';
import { formatDate, formatInputNumber, parseAmount } from '../src/web/format';

describe('formatInputNumber', () => {
  it('usa punto de miles y coma decimal', () => {
    expect(formatInputNumber(1050)).toBe('1.050');
    expect(formatInputNumber(15000)).toBe('15.000');
    expect(formatInputNumber(1255000, 0)).toBe('1.255.000');
    expect(formatInputNumber(11.5)).toBe('11,5');
    expect(formatInputNumber(15.25, 1)).toBe('15,3');
    expect(formatInputNumber(null)).toBe('');
  });

  it('parseAmount relee exactamente lo que se muestra (ida y vuelta)', () => {
    for (const v of [0, 7, 31, 999, 1000, 1050, 4200, 15000, 123456, 1234567, 11.5, 0.25, 1234.56]) {
      expect(parseAmount(formatInputNumber(v))).toBe(v);
    }
  });
});

describe('formatDate', () => {
  it('muestra dd-mm-aaaa', () => {
    expect(formatDate('2026-11-18')).toBe('18-11-2026');
    expect(formatDate('2026-11-18T10:00:00.000Z')).toBe('18-11-2026');
    expect(formatDate('Por confirmar')).toBe('Por confirmar');
  });
});

describe('QuoteDocument', () => {
  const q: ClientQuote = {
    number: 7,
    businessName: 'Fletes Ejemplo',
    businessPhone: '+56 9 1234 5678',
    businessEmail: '',
    clientName: 'Cliente de prueba',
    issuedAt: '2026-11-18',
    originLabel: 'Providencia',
    destinationLabel: 'Las Condes',
    serviceDate: '2026-11-20',
    serviceDescription: 'Flete',
    includes: '',
    conditions: '',
    netPrice: 1255000,
    taxAmount: null,
    total: 1255000,
    validUntil: '2026-11-25',
  };

  it('las fechas del documento (pantalla, PDF y enlace público) van en formato chileno', () => {
    const html = renderToStaticMarkup(createElement(QuoteDocument, { q }));
    expect(html).toContain('18-11-2026');
    expect(html).toContain('20-11-2026');
    expect(html).toContain('Válida hasta 25-11-2026.');
    expect(html).toContain('$1.255.000');
    expect(html).not.toContain('2026-11-');
  });
});

describe('H-09 · nombre del PDF', () => {
  it('el título de la pestaña identifica la cotización y el cliente', async () => {
    const { quoteDocumentTitle } = await import('../src/web/components/QuoteView');
    expect(quoteDocumentTitle({ number: 7, clientName: '  María Pérez ' })).toBe('Cotización N° 0007 · María Pérez');
    expect(quoteDocumentTitle({ number: 7, clientName: '' })).toBe('Cotización N° 0007');
  });
});
