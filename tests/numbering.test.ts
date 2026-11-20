/**
 * Numeración de cotizaciones (A-47, APROBADA). Sin red: conversión y uso del número emitido.
 * La atomicidad y la concurrencia reales se verifican contra Supabase en
 * scripts/verificar-numeracion.mjs.
 */
import { describe, expect, it } from 'vitest';
import { toClientQuote, type JobRecord } from '../src/shared/clientQuote';
import { jobFromRow, jobToRow, jobWithQuotePayload, type JobRow } from '../src/web/cloud/mappers';
import { CloudQuoteRepository } from '../src/web/cloud/quotes';

const job = (over: Partial<JobRecord> = {}): JobRecord =>
  ({
    id: '22222222-2222-4222-8222-222222222222',
    number: 3,
    createdAt: '2026-11-18',
    clientName: 'Cliente',
    serviceDescription: '',
    includes: '',
    conditions: '',
    validUntil: '',
    serviceDate: '',
    originLabel: '',
    destinationLabel: '',
    netPrice: 1000,
    tax: null,
    status: 'borrador',
    payment: 'pendiente',
    waypoints: [],
    internal: {} as JobRecord['internal'],
    ...over,
  }) as JobRecord;

describe('Documento: siempre el número emitido', () => {
  it('sin número emitido distinto, el documento usa el número de la cotización', () => {
    expect(toClientQuote(job()).number).toBe(3);
  });

  it('importada con número ocupado: el documento conserva el número emitido, no el interno', () => {
    expect(toClientQuote(job({ number: 21, issuedNumber: 1 })).number).toBe(1);
  });
});

describe('Conversión con la base', () => {
  it('fila con número interno distinto del emitido → issuedNumber', () => {
    const row = { ...jobToRow(job(), null), id: 'x', number: 21, issued_number: 1 } as unknown as JobRow;
    expect(jobFromRow(row)).toMatchObject({ number: 21, issuedNumber: 1 });
  });

  it('fila con ambos iguales → sin issuedNumber', () => {
    const row = { ...jobToRow(job(), null), id: 'x', number: 3, issued_number: 3 } as unknown as JobRow;
    expect(jobFromRow(row).issuedNumber).toBeUndefined();
  });

  it('al importar viaja el número emitido local y el id local (idempotencia)', () => {
    const { p_job } = jobWithQuotePayload(job({ number: 1 }), job().id);
    expect(p_job).toMatchObject({ local_id: job().id, issued_number: 1, id: null });
  });
});

describe('Guardar en la nube usa el número que asigna la base', () => {
  const repoReturning = (data: unknown) =>
    new CloudQuoteRepository({ rpc: async () => ({ data, error: null }) } as never, 'A', { bound: true });

  it('cotización nueva: el número del navegador (provisional) se reemplaza por el asignado', async () => {
    const saved = await repoReturning({ id: 'nube-1', number: 8, issued_number: 8 }).create(job({ number: 5 }));
    expect(saved).toMatchObject({ id: 'nube-1', number: 8 });
    expect(saved.issuedNumber).toBeUndefined();
    expect(toClientQuote(saved).number).toBe(8);
  });

  it('si la base no devuelve la cotización, es un error (no se inventa un número)', async () => {
    await expect(repoReturning(null).create(job())).rejects.toThrow();
  });
});
