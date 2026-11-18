/**
 * Conversión app ↔ Supabase (sin red). Lo crítico: la fila de `client_quotes` contiene SOLO
 * los campos de la lista blanca, y un trabajo vuelve igual desde la base.
 */
import { describe, expect, it } from 'vitest';
import { CLIENT_QUOTE_KEYS, type JobRecord } from '../src/shared/clientQuote';
import { clientQuoteFromRow, clientQuoteToRow, jobFromRow, jobToRow, jobWithQuotePayload, vehicleFromRow, type JobRow } from '../src/web/cloud/mappers';

const job: JobRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 7,
  createdAt: '2026-11-18',
  clientName: 'Cliente',
  serviceDescription: 'Flete',
  includes: 'Carga y descarga',
  conditions: '',
  validUntil: '2026-11-25',
  serviceDate: '',
  originLabel: 'Ñuñoa',
  destinationLabel: 'Las Condes',
  netPrice: 60000,
  tax: null,
  status: 'borrador',
  payment: 'pendiente',
  issuer: { name: 'Fletes Pérez', phone: '+56 9 1111 1111', email: 'contacto@ejemplo.cl' },
  waypoints: [
    { role: 'A', address: 'Calle Uno 123, Ñuñoa' },
    { role: 'B', address: 'Avenida Dos 456, Las Condes' },
  ],
  internal: {
    routeSource: 'simulado',
    km: null,
    minutes: null,
    costEstimate: 41234.5,
    costType: 'estimado',
    suggestedPrice: 48000,
    margin: 0.15,
    missing: [],
    engineVersion: 'motor-1.0.1',
    vehicle: { id: 'v', name: 'Camioneta', type: 'camioneta', fuel: 'gasolina', kmPerL: 11, wearPerKm: 40, adjusted: [] },
  },
};

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe('client_quotes: solo la lista blanca', () => {
  it('la fila tiene exactamente los campos de CLIENT_QUOTE_KEYS (en snake_case)', () => {
    const { p_quote } = jobWithQuotePayload(job, null);
    expect(Object.keys(p_quote).sort()).toEqual(CLIENT_QUOTE_KEYS.map(snake).sort());
  });

  it('no viaja ningún costo interno, margen, rendimiento ni desgaste en la fila del cliente', () => {
    const { p_quote } = jobWithQuotePayload(job, null);
    const text = JSON.stringify(p_quote);
    for (const forbidden of ['41234', 'margin', 'cost', 'kmPerL', 'km_per_l', 'wear', 'engineVersion', 'suggested', '0.15']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('ida y vuelta de la cotización al cliente', () => {
    const { p_quote } = jobWithQuotePayload(job, null);
    const back = clientQuoteFromRow(p_quote);
    expect(clientQuoteToRow(back)).toEqual(p_quote);
    expect(back.total).toBe(60000);
  });
});

describe('jobs', () => {
  it('un trabajo guardado vuelve igual (numeric llega como texto o número)', () => {
    const row = { ...jobToRow(job, null), id: job.id, net_price: '60000' } as unknown as JobRow;
    expect(jobFromRow(row)).toEqual(job);
  });

  it('migración: viaja el id local en local_id y el id de la nube lo genera la base', () => {
    const row = jobToRow(job, job.id);
    expect(row.local_id).toBe(job.id);
    expect(row.id).toBeNull();
  });
});

describe('vehicles', () => {
  it('valores faltantes siguen siendo null (no cero)', () => {
    const v = vehicleFromRow({
      id: 'x',
      owner_id: 'o',
      local_id: null,
      name: 'Furgón',
      type: 'furgon',
      fuel: 'diesel',
      km_per_l: null,
      wear_per_km: '45',
      is_default: false,
      created_at: 'c',
      updated_at: 'u',
    });
    expect(v.kmPerL).toBeNull();
    expect(v.wearPerKm).toBe(45);
  });
});
