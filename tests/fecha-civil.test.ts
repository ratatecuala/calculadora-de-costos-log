/**
 * A-91 Frente C · fecha comercial en la fecha civil de America/Santiago, no en UTC.
 * Independiente de la zona del dispositivo; cubre cambio de día y los dos cambios de horario de 2026.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fechaCivilChile, fechaLocal, sumarDiasCivil } from '../src/shared/procedencia';
import { formatDate } from '../src/web/format';
import { QuoteForm } from '../src/web/components/QuoteForm';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository } from '../src/web/storage';
import { MemoryKeyValueStore } from '../src/web/vehicleRepository';

const TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = TZ;
  vi.useRealTimers();
});

// [instante UTC, fecha civil esperada en Chile]
const CASOS: Array<[string, string, string]> = [
  ['2026-11-27T02:30:00Z', '2026-11-26', 'verano: 23:30 del 26 (UTC ya es 27)'],
  ['2026-11-27T00:05:00Z', '2026-11-26', 'verano: 21:05 del 26'],
  ['2026-11-27T03:00:00Z', '2026-11-27', 'verano: medianoche exacta'],
  ['2026-07-16T01:30:00Z', '2026-07-15', 'invierno: 21:30 del 15'],
  ['2026-07-16T03:59:00Z', '2026-07-15', 'invierno: 23:59 del 15 (UTC−4)'],
  ['2026-07-16T04:00:00Z', '2026-07-16', 'invierno: medianoche exacta'],
  ['2026-09-06T03:59:00Z', '2026-09-05', 'inicio del horario de verano: último minuto del 5'],
  ['2026-09-06T04:00:00Z', '2026-09-06', 'inicio del horario de verano: 00:00 salta a 01:00'],
  ['2026-04-05T02:59:00Z', '2026-04-04', 'fin del horario de verano: 23:59 del 4 (UTC−3)'],
  ['2026-04-05T03:30:00Z', '2026-04-04', 'fin del horario de verano: 23:30 repetida del 4 (UTC−4)'],
  ['2026-04-05T04:00:00Z', '2026-04-05', 'fin del horario de verano: medianoche del 5'],
  ['2027-01-01T02:59:00Z', '2026-12-31', 'año nuevo: aún 31 de diciembre'],
];

describe('fechaCivilChile (A-91)', () => {
  for (const zona of ['UTC', 'America/Santiago', 'Asia/Tokyo', 'America/Los_Angeles']) {
    it(`no depende de la zona del dispositivo (${zona})`, () => {
      process.env.TZ = zona;
      for (const [instante, esperada, caso] of CASOS) {
        expect(fechaCivilChile(new Date(instante)), caso).toBe(esperada);
        expect(fechaLocal(new Date(instante)), caso).toBe(esperada);
      }
    });
  }

  it('fecha inválida → null', () => {
    expect(fechaCivilChile(new Date('no es fecha'))).toBeNull();
  });

  it('sumarDiasCivil no se desplaza por cambios de horario ni fin de mes', () => {
    expect(sumarDiasCivil('2026-09-05', 1)).toBe('2026-09-06');
    expect(sumarDiasCivil('2026-04-04', 7)).toBe('2026-04-11');
    expect(sumarDiasCivil('2026-12-31', 7)).toBe('2027-01-07');
    expect(sumarDiasCivil('2028-02-28', 1)).toBe('2028-02-29');
    expect(() => sumarDiasCivil('26-11-2026', 1)).toThrow();
  });
});

describe('formatDate: históricos intactos, marcas técnicas en fecha civil', () => {
  beforeEach(() => {
    process.env.TZ = 'UTC';
  });
  it('una fecha sola (cotización guardada, incluidas las históricas) se muestra tal cual', () => {
    expect(formatDate('2026-11-27')).toBe('27-11-2026');
  });
  it('una marca de tiempo técnica se muestra con su fecha civil de Chile, sin modificarla', () => {
    expect(formatDate('2026-11-27T02:30:00Z')).toBe('26-11-2026');
    expect(formatDate('2026-11-27T02:30:00.123+00:00')).toBe('26-11-2026');
    expect(formatDate('2026-11-27 02:30:00+00')).toBe('26-11-2026');
  });
  it('texto no reconocido se devuelve igual', () => {
    expect(formatDate('sin fecha')).toBe('sin fecha');
  });
});

describe('QuoteForm usa la fecha civil de Chile', () => {
  const noRoutes: RouteClient = { requestRoute: async () => { throw new Error('sin red'); } };
  it('a las 23:30 de Chile, «Válida hasta» parte del mismo día (no del siguiente en UTC)', () => {
    process.env.TZ = 'UTC';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T02:30:00Z'));
    const s = new QuoteSession(noRoutes);
    s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
    s.useManual('habitual');
    s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
    s.setParams({ fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 0, helperFee: 0, loadMinutes: 0, tolls: 0 });
    s.setChosenPrice(80000);
    const html = renderToStaticMarkup(createElement(QuoteForm, { session: s, repository: createQuoteRepository(new MemoryKeyValueStore()), onSaved: () => undefined, onCancel: () => undefined }));
    expect(html).toContain('value="2026-12-03"');
    expect(html).not.toContain('value="2026-12-04"');
  });
});
