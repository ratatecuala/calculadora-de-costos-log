/**
 * I-2 en el cliente (A-81, paso 1 de docs/22 §17.5), sin red: clientes de Supabase falsos.
 * - Versión del snapshot según las flags (`integracionCarga`, `cargaNube`) y el repositorio.
 * - Guardado en la cuenta: v1 por `create_job_with_quote`, v2 por `create_job_with_quote_v2` con el
 *   `internal` sin líneas y las líneas aparte; nada se envía si el resumen no es válido.
 * - Lectura: el detalle de una v2 reconstruye la lista desde `job_cargo_items` y rechaza líneas que no
 *   cuadran; `cargoItemFromRow` convierte `numeric` en número y valida.
 * - Copia desde el navegador: con `cargaNube`, las v2 con líneas se copian con la v2 (sin duplicar).
 * - Borrador por dueño: la cuenta solo con `cuentas`; aislado por dueño; se borra el del que emitió.
 * El servidor (privilegios, RLS, aislamiento entre cuentas, atomicidad) se prueba con las migraciones
 * reales en scripts/diseno/i2/ensayar-i2.sh y probar-i2.sh.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CargoItem } from '../src/shared/cargo';
import type { JobRecord } from '../src/shared/clientQuote';
import { readSnapshot, toCloudPayload, type SnapshotV2 } from '../src/shared/snapshot';
import { cargoItemFromRow, type CargoItemRow } from '../src/web/cloud/mappers';
import { clasificarParaCopia, mensajeCopia, migrateLocalToCloud, pendingLocalData } from '../src/web/cloud/migration';
import { CloudQuoteRepository } from '../src/web/cloud/quotes';
import { decidirAutoguardado, DraftStore, duenoConBorrador } from '../src/web/draftStore';
import { buildJobRecord } from '../src/web/jobs';
import { addItem, newDraftItem, setDeclaredVolume, updateItem } from '../src/web/modules/inventoryDraft';
import { addHelper, updateHelper, updateStop } from '../src/web/modules/resourcesDraft';
import { saveQuote, snapshotVersionFor } from '../src/web/saveQuote';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository } from '../src/web/storage';
import { MemoryKeyValueStore, type VehicleRepository } from '../src/web/vehicleRepository';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const noRoutes: RouteClient = { requestRoute: vi.fn(async () => { throw new Error('sin red'); }) };
const form = { clientName: 'Cliente ficticio', serviceDescription: 'Flete', includes: 'Carga y descarga', conditions: '', serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Maipú' };
const issuer = { name: 'Fletes Prueba', phone: '', email: '' };
const meta = (n: number) => ({ id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, number: n, createdAt: '2026-11-25' });

function sesion(conCarga: boolean): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.useManual('habitual');
  s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  s.setParams({ fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 1, helperFee: 15000, loadMinutes: 60, tolls: 0 });
  s.setChosenPrice(80000);
  if (conCarga) {
    let inv = addItem(s.getSnapshot().cargo, newDraftItem('a', { kind: 'refrigerador', label: 'Refrigerador' }));
    inv = updateItem(inv, 'a', { unitWeightKg: 75.5, l: 70, w: 70, h: 180, fragile: true, handling: 'pesado' });
    inv = addItem(inv, newDraftItem('b', { kind: 'cajas', label: 'Caja con loza ñ' }));
    inv = updateItem(inv, 'b', { qty: 12 });
    inv = setDeclaredVolume(inv, 'b', 0.25);
    s.setCargo(inv);
    let r = updateStop(s.getSnapshot().resources, 'A', { floor: 4, elevator: 'no', loadMinutes: 30 });
    r = addHelper(r, '00000000-0000-4000-8000-0000000000a1');
    r = updateHelper(r, '00000000-0000-4000-8000-0000000000a1', { feeService: 15000 });
    s.setResources(r);
  }
  return s;
}
const jobV1 = (n: number) => buildJobRecord(sesion(false), form, issuer, meta(n))!;
const jobV2 = (n: number, conCarga = true) => buildJobRecord(sesion(conCarga), form, issuer, meta(n), { version: 2 })!;
const v2 = (j: JobRecord) => j.internal as SnapshotV2;

/** Filas de job_cargo_items como las devuelve PostgREST (`numeric` como texto). */
const filas = (job: JobRecord): CargoItemRow[] => aFilas(v2(job).cargo?.items ?? []);
function aFilas(items: CargoItem[]): CargoItemRow[] {
  return items.map((it, i) => ({
    position: i, kind: it.kind, description: it.description, qty: it.qty,
    unit_weight_kg: it.unitWeightKg === null ? null : String(it.unitWeightKg),
    dim_l_cm: it.dimsCm?.l ?? null, dim_w_cm: it.dimsCm?.w ?? null, dim_h_cm: it.dimsCm?.h ?? null,
    volume_m3: it.volumeM3 === null ? null : String(it.volumeM3), volume_source: it.volumeSource, fragile: it.fragile, handling: it.handling,
  }));
}

/** Supabase falso: rpc v1/v2 con idempotencia por local_id; `jobs` y `job_cargo_items` en memoria. */
function nubeFalsa() {
  const jobs = new Map<string, { row: Record<string, unknown>; items: CargoItemRow[] }>();
  const porLocal = new Set<string>();
  const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let n = 0;
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    llamadas.push({ fn, args });
    if (fn !== 'create_job_with_quote' && fn !== 'create_job_with_quote_v2') return { data: null, error: null };
    const p = args.p_job as Record<string, unknown>;
    const local = p.local_id as string | null;
    if (local && porLocal.has(local)) return { data: null, error: null };
    if (local) porLocal.add(local);
    n += 1;
    const id = `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`;
    const row = { ...p, id, number: n, issued_number: p.issued_number ?? n, created_at: '2026-11-25T00:00:00Z' };
    jobs.set(id, { row, items: aFilas((args.p_cargo_items ?? []) as CargoItem[]) });
    return { data: { id, number: n, issued_number: row.issued_number }, error: null };
  });
  const from = (tabla: string) => {
    const filtro: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'limit', 'not', 'upsert']) chain[m] = () => chain;
    chain.eq = (col: string, val: unknown) => { filtro[col] = val; return chain; };
    chain.maybeSingle = async () => ({ data: tabla === 'jobs' ? (jobs.get(filtro.id as string)?.row ?? null) : null, error: null });
    chain.then = (resolve: (v: unknown) => void) => {
      if (tabla === 'job_cargo_items') return resolve({ data: jobs.get(filtro.job_id as string)?.items ?? [], error: null });
      if (tabla === 'jobs') return resolve({ data: [...jobs.values()].map((j) => ({ local_id: j.row.local_id })).filter((r) => r.local_id), error: null });
      return resolve({ data: [], error: null });
    };
    return chain;
  };
  return { client: { rpc, from } as never, rpc, llamadas, jobs };
}

describe('I-2 · versión del snapshot (flags y repositorio)', () => {
  it('tabla de decisión: con cuenta, v2 solo con las dos flags', () => {
    expect(snapshotVersionFor(false, 'nube', true)).toBe(1);
    expect(snapshotVersionFor(true, 'nube', false)).toBe(1);
    expect(snapshotVersionFor(true, 'nube', true)).toBe(2);
    expect(snapshotVersionFor(true, 'local', false)).toBe(2);
    expect(snapshotVersionFor(false, 'local', true)).toBe(1);
  });

  it('saveQuote con la cuenta y las dos flags guarda v2 por la v2; con cargaNube apagada, v1 como hoy', async () => {
    for (const [cargaNube, fn, version] of [[true, 'create_job_with_quote_v2', 2], [false, 'create_job_with_quote', 1]] as const) {
      const nube = nubeFalsa();
      const repo = new CloudQuoteRepository(nube.client, A, { bound: true });
      repo.saveBusiness = async () => undefined;
      repo.nextNumber = async () => 1;
      const r = await saveQuote(repo, (num, v) => buildJobRecord(sesion(true), form, issuer, meta(num), { version: v }), issuer, { cargoFlag: true, cargaNube });
      expect(r.status === 'guardada' && r.version).toBe(version);
      expect(nube.llamadas.map((l) => l.fn)).toEqual([fn]);
    }
  });
});

describe('I-2 · guardado en la cuenta', () => {
  it('v2: internal SIN líneas (validado por toCloudPayload) y las líneas completas en p_cargo_items', async () => {
    const nube = nubeFalsa();
    const job = jobV2(1);
    await new CloudQuoteRepository(nube.client, A, { bound: true }).create(job);
    const { fn, args } = nube.llamadas[0]!;
    expect(fn).toBe('create_job_with_quote_v2');
    const p = toCloudPayload(job.internal);
    if (!p.ok) throw new Error(p.reason);
    expect((args.p_job as { internal: unknown }).internal).toEqual(p.internal);
    expect(JSON.stringify((args.p_job as { internal: unknown }).internal)).not.toContain('"items"');
    expect(args.p_cargo_items).toEqual(v2(job).cargo!.items);
    // El documento del cliente es el mismo que con la v1 (D-I7): sin inventario.
    expect(JSON.stringify(args.p_quote)).not.toMatch(/Refrigerador|items/);
  });

  it('v1: igual que hoy, por create_job_with_quote y sin p_cargo_items', async () => {
    const nube = nubeFalsa();
    const job = jobV1(1);
    await new CloudQuoteRepository(nube.client, A, { bound: true }).create(job);
    expect(nube.llamadas[0]!.fn).toBe('create_job_with_quote');
    expect(nube.llamadas[0]!.args).not.toHaveProperty('p_cargo_items');
    expect((nube.llamadas[0]!.args.p_job as { internal: unknown }).internal).toEqual(job.internal);
  });

  it('un v2 inválido (resumen que no cuadra con las líneas) NO se envía', async () => {
    const nube = nubeFalsa();
    const job = jobV2(1);
    const malo = { ...job, internal: { ...v2(job), cargo: { ...v2(job).cargo!, totals: { ...v2(job).cargo!.totals, lines: 99 } } } };
    await expect(new CloudQuoteRepository(nube.client, A, { bound: true }).create(malo as JobRecord)).rejects.toThrow(/No se guardó en tu cuenta/);
    expect(nube.rpc).not.toHaveBeenCalled();
  });
});

describe('I-2 · lectura desde la cuenta', () => {
  it('get() de una v2 reconstruye el snapshot del navegador desde job_cargo_items', async () => {
    const nube = nubeFalsa();
    const repo = new CloudQuoteRepository(nube.client, A, { bound: true });
    const job = jobV2(1);
    const guardado = await repo.create(job);
    const leido = await repo.get(guardado.id);
    expect(leido!.internal).toEqual(job.internal);
    const r = readSnapshot(leido!.internal);
    expect(r.ok && r.sourceVersion).toBe(2);
  });

  it('get() de una v1 o de una v2 sin carga no consulta job_cargo_items', async () => {
    const nube = nubeFalsa();
    const repo = new CloudQuoteRepository(nube.client, A, { bound: true });
    for (const job of [jobV1(1), jobV2(2, false)]) {
      const g = await repo.create(job);
      const from = vi.spyOn(nube.client as unknown as { from: (t: string) => unknown }, 'from');
      const leido = await repo.get(g.id);
      expect(from.mock.calls.map((c) => c[0])).toEqual(['jobs']);
      expect(leido!.internal).toEqual(toCloudPayload(job.internal).ok ? (toCloudPayload(job.internal) as { internal: unknown }).internal : null);
      from.mockRestore();
    }
  });

  it('líneas que no cuadran con el resumen (una perdida) → error, nunca un inventario incompleto', async () => {
    const nube = nubeFalsa();
    const repo = new CloudQuoteRepository(nube.client, A, { bound: true });
    const g = await repo.create(jobV2(1));
    nube.jobs.get(g.id)!.items.pop();
    await expect(repo.get(g.id)).rejects.toThrow(/no coincide con su resumen/);
  });

  it('cargoItemFromRow: numeric como texto → número; una fila inválida → error', () => {
    const job = jobV2(1);
    expect(filas(job).map(cargoItemFromRow)).toEqual(v2(job).cargo!.items);
    expect(() => cargoItemFromRow({ ...filas(job)[0]!, qty: 0 })).toThrow();
    expect(() => cargoItemFromRow({ ...filas(job)[0]!, volume_m3: '9.9' })).toThrow(); // «calculado» incoherente
  });
});

const sinVehiculos: VehicleRepository = {
  list: async () => [], getDefaultId: async () => null, get: async () => null,
  create: async () => { throw new Error('no'); }, update: async () => { throw new Error('no'); },
  remove: async () => undefined, setDefault: async () => undefined,
};

describe('I-2 · copia del navegador a la cuenta', () => {
  it('sin cargaNube la v2 con líneas queda diferida; con cargaNube es elegible y se envía completa', () => {
    const j = jobV2(1);
    const sinFlag = clasificarParaCopia(j);
    expect(sinFlag.clase).toBe('v2-con-lineas');
    expect(sinFlag.envio).toBeUndefined();
    expect(clasificarParaCopia(j, { cargaNube: true })).toMatchObject({ clase: 'v2-con-lineas', envio: j });
  });

  it.each([false, true])('con cargaNube=%s conserva los históricos fraccionarios y solo copia los enteros', async (cargaNube) => {
    const store = new MemoryKeyValueStore();
    const local = createQuoteRepository(store);
    await local.create({ ...jobV1(1), netPrice: 1234.5 });
    await local.create({ ...jobV2(2), netPrice: 6789.25 });
    await local.create(jobV1(3));
    await local.create({ ...jobV1(4), tax: { ruleId: 'historica', amount: 25.5 } });
    const original = await local.list();
    const nube = nubeFalsa();
    const copiar = () => migrateLocalToCloud({ supabase: nube.client, userId: A, localQuotes: local, localVehicles: sinVehiculos, store, isCurrentUser: () => true, cargaNube });
    const pendientes = () => pendingLocalData(local, sinVehiculos, store, A, { cargaNube });
    expect((await pendientes()).jobs).toBe(1);
    for (let intento = 0; intento < 2; intento++) {
      const r = await copiar();
      expect(r.verified).toBe(true);
      expect(r.deferred.map(d => d.clase)).toEqual(['precio-fraccionario', 'precio-fraccionario', 'precio-fraccionario']);
      expect(mensajeCopia(r)).toMatch(/precio tiene decimales/);
      expect((await pendientes()).deferred).toEqual(r.deferred);
      expect((await pendientes()).jobs).toBe(0);
      expect(await local.list()).toEqual(original);
    }
    expect(nube.llamadas.map(l => (l.args.p_job as { local_id: string }).local_id)).toEqual([meta(3).id, meta(3).id]);
  });

  it('con cargaNube: v1 por la v1, v2 con líneas por la v2 con local_id; repetir no duplica', async () => {
    const store = new MemoryKeyValueStore();
    const local = createQuoteRepository(store);
    const conLineas = { ...jobV2(2), issuedNumber: 900 };
    await local.create(jobV1(1));
    await local.create(conLineas);
    const nube = nubeFalsa();
    const copiar = () => migrateLocalToCloud({ supabase: nube.client, userId: A, localQuotes: local, localVehicles: sinVehiculos, store, isCurrentUser: () => true, cargaNube: true });
    const r1 = await copiar();
    expect(r1).toMatchObject({ jobsCopied: 2, jobsAlreadyThere: 0, verified: true, deferred: [] });
    const v2call = nube.llamadas.find((l) => l.fn === 'create_job_with_quote_v2')!;
    expect((v2call.args.p_job as { local_id: string; issued_number: number }).local_id).toBe(conLineas.id);
    expect((v2call.args.p_job as { issued_number: number }).issued_number).toBe(900);
    expect(v2call.args.p_cargo_items).toEqual(v2(conLineas).cargo!.items);
    const r2 = await copiar();
    expect(r2).toMatchObject({ jobsCopied: 0, jobsAlreadyThere: 2, verified: true });
    expect(nube.jobs.size).toBe(2);
  });

  it('sin cargaNube (hoy): la v2 con líneas nunca llega a la base', async () => {
    const store = new MemoryKeyValueStore();
    const local = createQuoteRepository(store);
    await local.create(jobV2(1));
    const nube = nubeFalsa();
    const r = await migrateLocalToCloud({ supabase: nube.client, userId: A, localQuotes: local, localVehicles: sinVehiculos, store, isCurrentUser: () => true });
    expect(nube.rpc).not.toHaveBeenCalled();
    expect(r.deferred).toHaveLength(1);
  });
});

describe('I-2 · borrador por dueño', () => {
  const data = () => sesion(true).draftData();

  it('la cuenta solo tiene borrador con `cuentas`; un id que no es de cuenta, nunca', () => {
    expect(duenoConBorrador('local')).toBe(true);
    expect(duenoConBorrador(A)).toBe(false);
    expect(duenoConBorrador(A, true)).toBe(true);
    expect(duenoConBorrador('user-A', true)).toBe(false);
    expect(new DraftStore(new MemoryKeyValueStore()).write(A, data()).ok).toBe(false);
    expect(decidirAutoguardado(A, false, true)).toBe('nada');
    expect(decidirAutoguardado(A, false, true, true)).toBe('escribir');
    expect(decidirAutoguardado(A, true, true, true)).toBe('nada');
  });

  it('aislado por dueño: A no lee el de B ni el local; borrar uno no toca los otros', () => {
    const ds = new DraftStore(new MemoryKeyValueStore(), { cuentas: true });
    expect(ds.write('local', data()).ok).toBe(true);
    expect(ds.write(A, data()).ok).toBe(true);
    expect(ds.read(B)).toEqual({ status: 'none' });
    ds.clear(A);
    expect(ds.read(A)).toEqual({ status: 'none' });
    expect(ds.read('local').status).toBe('ok');
  });
});
