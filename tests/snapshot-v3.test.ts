/**
 * A-88 · Frente A: contrato de procedencia y snapshot v3 (sin red; clientes de Supabase falsos).
 * - Parámetros económicos efectivamente usados, con su procedencia (faltante, simulado, vehículo,
 *   valor inicial y declarado) y la del recorrido (manual o simulado).
 * - v1 y v2 históricos: se leen tal cual, sin `economia` y sin recalcular.
 * - Caminos: navegador, borrador, copia navegador → cuenta, guardado y lectura en la cuenta.
 * - Nada de `economia` llega a la cotización del cliente (PDF, WhatsApp, enlace público).
 * - Tope de tamaño: una v3 máxima cabe en el tope de `jobs.internal` (16 KB).
 * El servidor (RPC real y `pg_column_size`) se prueba con PostgreSQL local en scripts/diseno/v3/.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { toClientQuote, whatsappText, type JobRecord } from '../src/shared/clientQuote';
import { CLASES_DATO, fechaLocal, procedencia, procedenciaSchema } from '../src/shared/procedencia';
import {
  MAX_CLOUD_INTERNAL_JSON_BYTES,
  MAX_MISSING_CHARS,
  MAX_MISSING_ITEMS,
  PARAMETROS_ECONOMICOS,
  readEconomia,
  readSnapshot,
  snapshotV3Schema,
  toCloudPayload,
  UNIDADES_PARAMETRO,
  type SnapshotV3,
} from '../src/shared/snapshot';
import { jobFromRow, jobToRow, jobWithQuotePayload, type JobRow } from '../src/web/cloud/mappers';
import { clasificarParaCopia, migrateLocalToCloud } from '../src/web/cloud/migration';
import { CloudQuoteRepository } from '../src/web/cloud/quotes';
import { DraftStore } from '../src/web/draftStore';
import { buildJobRecord, SnapshotV3Error, snapshotV3From } from '../src/web/jobs';
import { saveQuote, snapshotParaEmitir, snapshotVersionFor } from '../src/web/saveQuote';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository } from '../src/web/storage';
import { MemoryKeyValueStore, type VehicleRepository } from '../src/web/vehicleRepository';
import type { VehicleProfile } from '../src/shared/vehicle';

const A = '00000000-0000-4000-8000-00000000000a';
const form = { clientName: 'Cliente ficticio', serviceDescription: 'Flete', includes: 'Carga', conditions: '', serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Maipú' };
const issuer = { name: 'Fletes Prueba', phone: '', email: '' };
const meta = (n: number) => ({ id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, number: n, createdAt: '2026-11-26' });
const EJEMPLO = { fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 1, helperFee: 15000, loadMinutes: 60, tolls: 4200, otherCosts: 0 };
const VEHICULO: VehicleProfile = { id: 'v-1', name: 'Camioneta ficticia', type: 'camioneta', fuel: 'diesel', kmPerL: 10.5, wearPerKm: 40, createdAt: '2026-11-01', updatedAt: '2026-11-01' };

/** Recorrido manual (declarado) o simulado. */
function sesion(opts: { simulado?: boolean } = {}): QuoteSession {
  const client: RouteClient = opts.simulado
    ? {
        requestRoute: vi.fn(async (input) => ({
          status: 'ok' as const,
          quota: null,
          route: {
            kind: input.kind,
            source: 'simulado' as const,
            legs: [{ from: 'A' as const, to: 'B' as const, distanceM: 25_000, durationS: 2_400 }],
            totalDistanceM: 25_000,
            totalDurationS: 2_400,
            warnings: [],
            computedAt: '2026-11-26T00:00:00Z',
            retention: { distance: 'sesion' as const, duration: 'sesion' as const },
          },
        })),
      }
    : { requestRoute: vi.fn(async () => { throw new Error('sin red'); }) };
  const s = new QuoteSession(client);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  if (!opts.simulado) {
    s.useManual('habitual');
    s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  }
  return s;
}
const v3 = (j: JobRecord) => j.internal as SnapshotV3;
const emitir = (s: QuoteSession, n = 1) => buildJobRecord(s, form, issuer, meta(n), { version: 3 })!;

function sesionCompleta(): QuoteSession {
  const s = sesion();
  s.setParams({ fuelPricePerL: 1290, kmPerL: 11, wearPerKm: 35, fixedPerHour: 1800, ownerPerHour: 7000, tolls: 2500, otherCosts: 1000 });
  s.setChosenPrice(80000);
  return s;
}

// Reloj fijo: 26-11-2026 a las 15:00 en Chile. Las fechas de los eventos son locales.
const TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Santiago';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-26T18:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = TZ;
});

describe('A-88 · contrato de procedencia', () => {
  it('admite las seis clases pedidas y rechaza otra, una vigencia invertida o un campo de más', () => {
    expect([...CLASES_DATO]).toEqual(['medido', 'comprobado', 'declarado', 'estimado', 'simulado', 'faltante']);
    for (const c of CLASES_DATO) expect(procedenciaSchema.safeParse(procedencia(c, 'usuario')).success).toBe(true);
    expect(procedenciaSchema.safeParse({ ...procedencia('declarado', 'usuario'), clase: 'adivinado' }).success).toBe(false);
    expect(procedenciaSchema.safeParse({ ...procedencia('comprobado', 'comprobante'), vigenteDesde: '2026-12-01', vigenteHasta: '2026-11-01' }).success).toBe(false);
    expect(procedenciaSchema.safeParse({ ...procedencia('declarado', 'usuario'), url: 'https://x' }).success).toBe(false);
  });

  it('la fecha es la del dispositivo, no la UTC: a las 22:30 en Chile sigue siendo el mismo día', () => {
    expect(fechaLocal(new Date('2026-11-27T01:30:00Z'))).toBe('2026-11-26');
    expect(new Date('2026-11-27T01:30:00Z').toISOString().slice(0, 10)).toBe('2026-11-27');
    expect(fechaLocal(new Date('no es fecha'))).toBeNull();
  });
});

describe('A-88 · snapshot v3 al emitir', () => {
  it('guarda cada parámetro usado con su unidad y valor exactos, y las versiones del motor', () => {
    const s = sesionCompleta();
    const job = emitir(s);
    const e = v3(job).economia;
    expect(v3(job).schemaVersion).toBe(3);
    for (const k of PARAMETROS_ECONOMICOS) {
      expect(e.parametros[k].valor).toBe(s.getSnapshot().params[k]);
      expect(e.parametros[k].unidad).toBe(UNIDADES_PARAMETRO[k]);
    }
    expect(e.margen.valor).toBe(0.15);
    expect(e.recargos.valor).toBe(0);
    expect(e.versiones).toEqual({ motor: v3(job).engineVersion, formulas: v3(job).formulaVersion, datos: { combustible: null, catalogo: null, peajes: null } });
    expect(e.registradoEl).toBe('2026-11-26');
    // Las partidas son exactamente las del cálculo emitido (no se recalculan después).
    const c = s.computation('habitual')!;
    expect(e.partidas).toEqual(c.items.map((i) => ({ id: i.id, categoria: i.category, monto: i.amount })));
    expect(v3(job).costEstimate).toBe(c.measures.cost.value);
  });

  it('clasifica la procedencia: declarado por el usuario, valor inicial y faltante', () => {
    const s = sesion();
    s.setParams({ fuelPricePerL: 1290, kmPerL: 11 });
    s.setChosenPrice(50000);
    const p = v3(emitir(s)).economia.parametros;
    expect(p.fuelPricePerL.procedencia).toMatchObject({ clase: 'declarado', fuente: { tipo: 'usuario' }, fecha: '2026-11-26' });
    expect(p.helpers.procedencia).toMatchObject({ clase: 'declarado', fuente: { tipo: 'valorInicial' } });
    expect(p.otherCosts.procedencia.fuente.tipo).toBe('valorInicial');
    for (const k of ['wearPerKm', 'fixedPerHour', 'ownerPerHour', 'helperFee', 'tolls'] as const) {
      expect(p[k]).toMatchObject({ valor: null, procedencia: { clase: 'faltante' } });
    }
    // Un cero declarado no es valor inicial.
    s.setParams({ helpers: 0 });
    expect(v3(emitir(s)).economia.parametros.helpers.procedencia.fuente.tipo).toBe('usuario');
  });

  it('el ejemplo ficticio queda como simulado; editar un campo le quita la marca solo a ese campo', () => {
    const s = sesion();
    s.setParams(EJEMPLO, 'ejemplo');
    s.setChosenPrice(80000);
    let p = v3(emitir(s)).economia.parametros;
    for (const k of PARAMETROS_ECONOMICOS) expect(p[k].procedencia).toMatchObject({ clase: 'simulado', fuente: { tipo: 'ejemplo' }, fecha: null });
    s.setParams({ fuelPricePerL: 1300 });
    s.setChosenPrice(80000);
    p = v3(emitir(s)).economia.parametros;
    expect(p.fuelPricePerL.procedencia.clase).toBe('declarado');
    expect(p.kmPerL.procedencia.clase).toBe('simulado');
  });

  it('el vehículo aplicado es declarado en «Mi vehículo»; un ajuste para esta cotización es del usuario', () => {
    const s = sesion();
    s.setParams(EJEMPLO, 'ejemplo');
    s.selectVehicle(VEHICULO);
    s.setChosenPrice(80000);
    let job = emitir(s);
    let p = v3(job).economia.parametros;
    expect(p.kmPerL).toMatchObject({ valor: 10.5, procedencia: { clase: 'declarado', fuente: { tipo: 'vehiculo' } } });
    expect(p.wearPerKm.procedencia.fuente.tipo).toBe('vehiculo');
    expect(p.fuelPricePerL.procedencia.clase).toBe('simulado');
    expect(v3(job).vehicle).toMatchObject({ id: 'v-1', kmPerL: 10.5, catalogId: null });
    s.setParams({ kmPerL: 9 });
    s.setChosenPrice(80000);
    job = emitir(s);
    p = v3(job).economia.parametros;
    expect(p.kmPerL.procedencia.fuente.tipo).toBe('usuario');
    expect(v3(job).vehicle?.adjusted).toEqual(['kmPerL']);
  });

  it('el origen se registra al ingresar el dato, no se deduce al emitir (revisión GPT de afbe740)', () => {
    const s = sesion();
    s.selectVehicle(VEHICULO);
    // El usuario escribe a mano el mismo valor que tiene el vehículo: es suyo, no del perfil.
    vi.setSystemTime(new Date('2026-11-26T01:30:00Z')); // 22:30 del 25 en Chile, ya 26 en UTC
    s.setParams({ kmPerL: 10.5, fuelPricePerL: 1290 });
    // Escribe 0 ayudantes (igual al valor inicial): es un dato declarado por él, con su fecha.
    s.setParams({ helpers: 0 });
    vi.setSystemTime(new Date('2026-11-27T01:30:00Z')); // 22:30 del 26 en Chile, ya 27 en UTC
    s.setMargin(0.2);
    s.setChosenPrice(80000);
    const e = v3(emitir(s)).economia;
    expect(e.parametros.kmPerL.procedencia).toMatchObject({ clase: 'declarado', fuente: { tipo: 'usuario' }, fecha: '2026-11-25' });
    expect(e.parametros.wearPerKm.procedencia).toMatchObject({ fuente: { tipo: 'vehiculo' }, fecha: '2026-11-01' });
    expect(e.parametros.helpers.procedencia).toMatchObject({ fuente: { tipo: 'usuario' }, fecha: '2026-11-25' });
    expect(e.parametros.loadMinutes.procedencia).toMatchObject({ fuente: { tipo: 'valorInicial' }, fecha: '2026-11-26' });
    expect(e.margen.procedencia).toMatchObject({ fuente: { tipo: 'usuario' }, fecha: '2026-11-26' });
    expect(e.recargos.procedencia.fuente.tipo).toBe('valorInicial');
    expect(e.registradoEl).toBe('2026-11-26');
    vi.setSystemTime(new Date('2026-11-26T18:00:00Z'));
  });

  it('un valor sin evento registrado no se atribuye a nadie: «origen no registrado», sin fecha', () => {
    const s = sesion();
    s.restoreDraft({ ...s.draftData(), params: { ...s.draftData().params, fuelPricePerL: 1290 } });
    s.useManual('habitual');
    s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
    s.setChosenPrice(50000);
    const p = v3(emitir(s)).economia.parametros.fuelPricePerL.procedencia;
    expect(p).toMatchObject({ clase: 'declarado', fuente: { tipo: 'usuario', detalle: 'origen no registrado' }, fecha: null });
  });

  it('recorrido: manual = declarado; simulado = simulado, sin km retenidos ni partidas (A-38)', async () => {
    const manual = v3(emitir(sesionCompleta())).economia;
    expect(manual.recorrido.km).toMatchObject({ clase: 'declarado', fuente: { tipo: 'ruta' } });
    const s = sesion({ simulado: true });
    await s.calculateRoute();
    s.setParams(EJEMPLO, 'ejemplo');
    s.setChosenPrice(80000);
    const job = emitir(s);
    expect(v3(job).routeSource).toBe('simulado');
    expect(v3(job).economia.recorrido.km.clase).toBe('simulado');
    expect(v3(job).economia.recorrido.minutos.clase).toBe('simulado');
    expect(v3(job).km).toBeNull();
    expect(v3(job).economia.partidas).toBeNull();
  });

  it('una cotización emitida no cambia al editar la sesión después (no se recalcula)', () => {
    const s = sesionCompleta();
    const job = emitir(s);
    const copia = structuredClone(job);
    s.setParams({ fuelPricePerL: 2000, kmPerL: 5 });
    expect(job).toEqual(copia);
  });

  it('si la v3 no valida, no se emite (nunca se guarda sin procedencia)', () => {
    const job = emitir(sesionCompleta());
    const { schemaVersion: _s, formulaVersion: _f, economia, ...comun } = v3(job);
    expect(() => snapshotV3From({ ...comun, vehicle: null } as never, { ...economia, margen: { ...economia.margen, valor: 0.5 } })).toThrow(SnapshotV3Error);
  });
});

describe('A-88 · esquema v3: rechazos', () => {
  const base = () => v3(emitir(sesionCompleta()));
  it('rechaza datos incoherentes o de más', () => {
    const ok = base();
    expect(snapshotV3Schema.safeParse(ok).success).toBe(true);
    const casos: Array<[string, unknown]> = [
      ['faltante con valor', { ...ok, economia: { ...ok.economia, parametros: { ...ok.economia.parametros, tolls: { ...ok.economia.parametros.tolls, procedencia: procedencia('faltante', 'usuario') } } } }],
      ['valor null sin faltante', { ...ok, economia: { ...ok.economia, parametros: { ...ok.economia.parametros, tolls: { ...ok.economia.parametros.tolls, valor: null } } } }],
      ['unidad equivocada', { ...ok, economia: { ...ok.economia, parametros: { ...ok.economia.parametros, kmPerL: { ...ok.economia.parametros.kmPerL, unidad: 'L/100km' } } } }],
      ['parámetro de más', { ...ok, economia: { ...ok.economia, parametros: { ...ok.economia.parametros, iva: ok.economia.parametros.tolls } } }],
      ['parámetro faltante', { ...ok, economia: { ...ok.economia, parametros: (({ tolls: _t, ...r }) => r)(ok.economia.parametros) } }],
      ['detalle de carga', { ...ok, cargo: null }],
      ['versión del motor distinta', { ...ok, engineVersion: 'motor-9' }],
      ['margen distinto', { ...ok, margin: 0.3 }],
      ['sin economía', (({ economia: _e, ...r }) => r)(ok)],
    ];
    for (const [nombre, raw] of casos) expect(snapshotV3Schema.safeParse(raw).success, nombre).toBe(false);
  });
});

describe('A-88 · históricos v1 y v2: intactos y sin economía', () => {
  it('v1 y v2 se leen igual que antes, no se modifican y no tienen economía', () => {
    const s = sesionCompleta();
    const j1 = buildJobRecord(s, form, issuer, meta(1))!;
    const j2 = buildJobRecord(s, form, issuer, meta(2), { version: 2 })!;
    const c1 = structuredClone(j1.internal);
    const c2 = structuredClone(j2.internal);
    expect(readSnapshot(j1.internal)).toMatchObject({ ok: true, sourceVersion: 1 });
    expect(readSnapshot(j2.internal)).toMatchObject({ ok: true, sourceVersion: 2 });
    expect(readEconomia(j1.internal)).toBeNull();
    expect(readEconomia(j2.internal)).toBeNull();
    expect(toCloudPayload(j1.internal)).toEqual({ ok: true, internal: c1, cargoItems: [] });
    expect(j1.internal).toEqual(c1);
    expect(j2.internal).toEqual(c2);
    expect('economia' in j1.internal).toBe(false);
  });

  it('una v3 se lee con su costo guardado aunque el motor diera otro (no se recalcula)', () => {
    const job = emitir(sesionCompleta());
    const alterada = { ...v3(job), costEstimate: 12345, suggestedPrice: 99000 };
    const r = readSnapshot(alterada);
    expect(r).toMatchObject({ ok: true, sourceVersion: 3, view: { costEstimate: 12345, suggestedPrice: 99000, cargo: null, resources: null } });
    expect(readEconomia(alterada)).toEqual(v3(job).economia);
  });
});

describe('A-88 · nada interno llega al cliente', () => {
  it('la cotización al cliente de una v3 es idéntica a la de una v1 con los mismos datos', () => {
    const s = sesionCompleta();
    const j1 = buildJobRecord(s, form, issuer, meta(1))!;
    const j3 = emitir(s, 1);
    expect(toClientQuote(j3)).toEqual(toClientQuote(j1));
    const textos = [JSON.stringify(toClientQuote(j3)), whatsappText(toClientQuote(j3)), JSON.stringify(jobWithQuotePayload(j3, null).p_quote)];
    for (const t of textos) for (const palabra of ['economia', 'procedencia', 'parametros', 'partidas', 'fuelPricePerL', 'simulado']) expect(t).not.toContain(palabra);
  });
});

describe('A-88 · tamaño', () => {
  it('la v3 más grande posible cabe en el tope de la nube (y por lo tanto en los 16 KB de jobs.internal)', () => {
    const job = emitir(sesionCompleta());
    const largo = (n: number) => 'ñ'.repeat(n); // 2 bytes en UTF-8
    const proc = { clase: 'comprobado' as const, fuente: { tipo: 'comprobante' as const, detalle: largo(60) }, fecha: '2026-11-26', vigenteDesde: '2026-11-01', vigenteHasta: '2026-11-30', version: largo(20) };
    const e = v3(job).economia;
    const max: SnapshotV3 = {
      ...v3(job),
      engineVersion: largo(40),
      formulaVersion: largo(40),
      missing: Array.from({ length: MAX_MISSING_ITEMS }, () => largo(MAX_MISSING_CHARS)),
      vehicle: { id: largo(36), name: largo(40), type: 'camionLiviano', fuel: 'diesel', kmPerL: 123456789.123456789, wearPerKm: 123456789.123456789, adjusted: ['kmPerL', 'wearPerKm'], catalogId: largo(40), catalogDataVersion: largo(40), make: largo(60), model: largo(60), modelYear: 2026, version: largo(80), payloadKg: 49999.123456789, cargoVolumeM3: 199.123456789 },
      economia: {
        ...e,
        parametros: Object.fromEntries(PARAMETROS_ECONOMICOS.map((k) => [k, { valor: 123456789.123456789, unidad: UNIDADES_PARAMETRO[k], procedencia: proc }])) as never,
        recorrido: { km: proc, minutos: proc },
        margen: { valor: 0.15, unidad: 'fraccion', procedencia: proc },
        recargos: { valor: 123456789.123456789, unidad: 'CLP', procedencia: proc },
        partidas: Array.from({ length: 10 }, () => ({ id: largo(20), categoria: 'remuneracion' as const, monto: 123456789.123456789 })),
        versiones: { motor: largo(40), formulas: largo(40), datos: { combustible: largo(40), catalogo: largo(40), peajes: largo(40) } },
      },
    };
    const v = snapshotV3Schema.safeParse(max);
    expect(v.success, v.success ? '' : JSON.stringify(v.error.issues)).toBe(true);
    const bytes = new TextEncoder().encode(JSON.stringify(max)).length;
    expect(bytes).toBeLessThan(MAX_CLOUD_INTERNAL_JSON_BYTES);
    expect(toCloudPayload(max).ok).toBe(true);

    // Con caracteres de 3 bytes los topes por carácter permitirían ~13,7 KB: el contrato lo rechaza
    // entero (nunca se guarda una v3 que no se pueda copiar a la cuenta, y nada se recorta).
    const tres = JSON.parse(JSON.stringify(max).replaceAll('ñ', '€')) as SnapshotV3;
    expect(new TextEncoder().encode(JSON.stringify(tres)).length).toBeGreaterThan(MAX_CLOUD_INTERNAL_JSON_BYTES);
    const r = snapshotV3Schema.safeParse(tres);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('supera 11000 bytes');
    expect(toCloudPayload(tres).ok).toBe(false);
    expect(readSnapshot(tres).ok).toBe(false);
  });

  it('textos que escribe el usuario con caracteres de 3 y 4 bytes se guardan y se leen sin pérdida', async () => {
    const s = sesionCompleta();
    const nombre = 'Furgón €漢字 😀🚚'.padEnd(36, '€'); // 3 y 4 bytes; 4 bytes = 2 unidades UTF-16
    s.selectVehicle({ ...VEHICULO, name: nombre, kmPerL: 11, wearPerKm: 35 });
    s.setChosenPrice(80000);
    const job = emitir(s);
    expect(v3(job).vehicle?.name).toBe(nombre);
    const p = toCloudPayload(job.internal);
    expect(p.ok).toBe(true);
    // Ida y vuelta por la fila de la nube: idéntica, carácter por carácter.
    const vuelta = jobFromRow(JSON.parse(JSON.stringify(jobToRow(job, A))) as JobRow);
    expect(vuelta.internal).toEqual(job.internal);
    expect((vuelta.internal as SnapshotV3).vehicle?.name).toBe(nombre);
  });
});

describe('A-88 · retención A-38 también al leer y copiar', () => {
  it('una v3 con partidas pero sin km o minutos retenidos es ilegible y no se copia', async () => {
    const s = sesion({ simulado: true });
    await s.calculateRoute();
    s.setParams(EJEMPLO, 'ejemplo');
    s.setChosenPrice(80000);
    const job = emitir(s);
    const partidas = v3(emitir(sesionCompleta(), 2)).economia.partidas;
    expect(partidas?.length).toBeGreaterThan(0);
    const conPartidas = { ...v3(job), economia: { ...v3(job).economia, partidas } };
    // Control: la misma v3 sin partidas es válida (el rechazo se debe solo a A-38).
    expect(snapshotV3Schema.safeParse(v3(job)).success).toBe(true);
    expect(snapshotV3Schema.safeParse(conPartidas).success).toBe(false);
    expect(readSnapshot(conPartidas).ok).toBe(false);
    expect(toCloudPayload(conPartidas).ok).toBe(false);
    expect(clasificarParaCopia({ ...job, internal: conPartidas as never }).clase).toBe('ilegible');
  });
});

describe('A-88 · caminos de guardado y recuperación (flags de carga apagadas)', () => {
  it('saveQuote sin flags emite v3 en el navegador y en la cuenta; con detalle de carga sigue v2', () => {
    expect(snapshotParaEmitir(snapshotVersionFor(false, 'local'))).toBe(3);
    expect(snapshotParaEmitir(snapshotVersionFor(false, 'nube', true))).toBe(3);
    expect(snapshotParaEmitir(snapshotVersionFor(true, 'local'))).toBe(2);
    expect(snapshotParaEmitir(snapshotVersionFor(true, 'nube', false))).toBe(3);
  });

  it('navegador: se guarda y se vuelve a leer idéntica', async () => {
    const store = new MemoryKeyValueStore();
    const repo = createQuoteRepository(store);
    const s = sesionCompleta();
    const r = await saveQuote(repo, (n, v) => buildJobRecord(s, form, issuer, meta(n), { version: snapshotParaEmitir(v) }), issuer);
    expect(r.status).toBe('guardada');
    const [leida] = await createQuoteRepository(store).list();
    expect(v3(leida!).schemaVersion).toBe(3);
    expect(leida!.internal).toEqual(r.status === 'guardada' ? r.job.internal : null);
  });

  it('cuenta: se envía validada por create_job_with_quote (sin migración nueva) y se lee igual', async () => {
    const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      return { data: { id: '00000000-0000-4000-9000-000000000001', number: 1, issued_number: 1 }, error: null };
    });
    const repo = new CloudQuoteRepository({ rpc } as never, A, { bound: true });
    const job = emitir(sesionCompleta());
    await repo.create(job);
    expect(llamadas.map((l) => l.fn)).toEqual(['create_job_with_quote']);
    const enviado = (llamadas[0]!.args.p_job as { internal: unknown }).internal;
    expect(enviado).toEqual(job.internal);
    // Ida y vuelta por la fila, como la devuelve PostgREST.
    const fila = { ...jobToRow(job, null), id: job.id, created_at: '2026-11-26T00:00:00Z' } as unknown as JobRow;
    expect(jobFromRow(fila).internal).toEqual(job.internal);
  });

  it('cuenta: una v3 inválida no se envía', async () => {
    const rpc = vi.fn();
    const repo = new CloudQuoteRepository({ rpc } as never, A, { bound: true });
    const job = emitir(sesionCompleta());
    const mala = { ...job, internal: { ...v3(job), margin: 0.9 } } as JobRecord;
    await expect(repo.create(mala)).rejects.toThrow(/No se guardó en tu cuenta/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('copia navegador → cuenta: la v3 es elegible, va por create_job_with_quote y no se duplica', async () => {
    const job = emitir(sesionCompleta());
    expect(clasificarParaCopia(job)).toMatchObject({ clase: 'v3', envio: { internal: job.internal } });
    const mala = { ...job, internal: { ...v3(job), economia: { ...v3(job).economia, registradoEl: 'ayer' } } } as JobRecord;
    expect(clasificarParaCopia(mala).clase).toBe('ilegible');

    const store = new MemoryKeyValueStore();
    const local = createQuoteRepository(store);
    await local.create(job);
    const vehiculos: VehicleRepository = { list: async () => [], getDefaultId: async () => null } as never;
    const fns: string[] = [];
    const supabase = {
      rpc: vi.fn(async (fn: string) => { fns.push(fn); return { data: { id: 'x', number: 1, issued_number: 1 }, error: null }; }),
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'not', 'eq', 'upsert']) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.then = (resolve: (v: unknown) => void) => resolve({ data: [{ local_id: job.id }], error: null });
        return chain;
      },
    };
    const r = await migrateLocalToCloud({ supabase: supabase as never, userId: A, localQuotes: local, localVehicles: vehiculos, store, isCurrentUser: () => true });
    expect(fns).toEqual(['create_job_with_quote']);
    expect(r.jobsCopied).toBe(1);
  });

  it('borrador: los orígenes se guardan y se recuperan; uno anterior o dañado se recupera sin inventar', () => {
    const store = new MemoryKeyValueStore();
    const drafts = new DraftStore(store);
    const s = sesion();
    s.setParams(EJEMPLO, 'ejemplo');
    s.setParams({ tolls: 0 });
    expect(drafts.write('local', s.draftData()).ok).toBe(true);
    const leido = drafts.read('local');
    if (leido.status !== 'ok') throw new Error('borrador no legible');
    const recuperado = leido.draft.data;
    expect(recuperado.origins?.tolls).toEqual({ tipo: 'usuario', fecha: '2026-11-26' });
    expect(recuperado.origins?.kmPerL).toEqual({ tipo: 'ejemplo', fecha: null });
    const otra = sesion();
    otra.restoreDraft(recuperado);
    expect(otra.getSnapshot().origins).toEqual(recuperado.origins);
    const { origins: _x, ...antiguo } = recuperado;
    otra.restoreDraft(antiguo);
    expect(otra.getSnapshot().origins).toEqual({});
    otra.restoreDraft({ ...recuperado, origins: { noExiste: { tipo: 'usuario', fecha: null }, kmPerL: { tipo: 'inventado', fecha: null }, tolls: { tipo: 'usuario', fecha: 'ayer' } } as never });
    expect(otra.getSnapshot().origins).toEqual({ tolls: { tipo: 'usuario', fecha: null } });
  });
});
