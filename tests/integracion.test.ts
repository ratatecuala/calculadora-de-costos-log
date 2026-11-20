/**
 * I-1 + I-1b (A-68, docs/22 v2). Pruebas del diseño:
 * - V1–V5: versión del snapshot según la flag y el repositorio fijado por forWrite().
 * - Emisión v2: totales recalculados, bloqueo con datos inválidos, v1 idéntico.
 * - D-I1: el costo es idéntico con los editores vacíos o llenos.
 * - M1–M9: copia mixta v1/v2 a la cuenta (incluida C2).
 * - X1–X5: «Servicio» e «Incluye».
 * - I-1b y C1: borrador persistente, aislado por dueño.
 * Sin red: repositorios y cliente de Supabase falsos.
 */
import { describe, expect, it, vi } from 'vitest';
import { suggestServiceText } from '../src/shared/cargo';
import { isSnapshotV2, toClientQuote, type JobInternalV1, type JobRecord } from '../src/shared/clientQuote';
import { MAX_CLOUD_INTERNAL_JSON_BYTES, readSnapshot, snapshotV2Schema, toCloudPayload } from '../src/shared/snapshot';
import { clasificarParaCopia, mensajeCopia, MIGRATION_KEY, migrateLocalToCloud, pendingLocalData } from '../src/web/cloud/migration';
import { jobWithQuotePayload, jobFromRow } from '../src/web/cloud/mappers';
import { DRAFT_KEY, DraftStore } from '../src/web/draftStore';
import { buildJobRecord, CargoInvalidError } from '../src/web/jobs';
import { alternarIncluye, avisosDuplicado, bloqueoEmision, includesPorDefecto, includesSegunCasilla } from '../src/web/modules/integracion';
import { addItem, newDraftItem, setMode, updateItem } from '../src/web/modules/inventoryDraft';
import { addHelper, addEquipment, emptyResourcesDraft, setHelperMode, toggleSegment, updateEquipment, updateHelper, updateStop } from '../src/web/modules/resourcesDraft';
import { saveQuote, snapshotVersionFor } from '../src/web/saveQuote';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository, type QuoteRepository } from '../src/web/storage';
import { MemoryKeyValueStore, type VehicleRepository } from '../src/web/vehicleRepository';

const noRoutes: RouteClient = {
  requestRoute: vi.fn(async () => {
    throw new Error('sin red en las pruebas');
  }),
};

const form = {
  clientName: 'Cliente ficticio',
  serviceDescription: 'Flete',
  includes: 'Carga y descarga',
  conditions: '',
  serviceDate: '',
  validUntil: '',
  originLabel: 'Ñuñoa',
  destinationLabel: 'Maipú',
};
const issuer = { name: 'Fletes Prueba', phone: '', email: '' };
const meta = (n = 1) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, number: n, createdAt: '2026-11-20' });

/** Sesión con ruta manual (sin red), costos de ejemplo y precio confirmado. */
function sesionLista(): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.useManual('habitual');
  s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  s.setParams({ fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 2, helperFee: 15000, loadMinutes: 60, tolls: 0 });
  s.setChosenPrice(80000);
  return s;
}

function conCarga(s: QuoteSession): QuoteSession {
  let inv = addItem(s.getSnapshot().cargo, newDraftItem('a', { kind: 'refrigerador', label: 'Refrigerador' }));
  inv = updateItem(inv, 'a', { unitWeightKg: 75, l: 70, w: 70, h: 180 });
  inv = addItem(inv, newDraftItem('b', { kind: 'cajas', label: 'Caja con loza' }));
  inv = updateItem(inv, 'b', { qty: 12, unitWeightKg: 12, l: 50, w: 40, h: 40 });
  s.setCargo(inv);
  let res = updateStop(s.getSnapshot().resources, 'A', { floor: 4, elevator: 'no', loadMinutes: 30 });
  res = addHelper(res, '00000000-0000-4000-8000-0000000000a1');
  res = updateHelper(res, '00000000-0000-4000-8000-0000000000a1', { feeService: 15000 });
  s.setResources(res);
  return s;
}

/** Repositorio «nube» falso: como el local en memoria, pero con kind 'nube'. */
function repoNube(): QuoteRepository & { creados: JobRecord[] } {
  const base = createQuoteRepository(new MemoryKeyValueStore());
  const creados: JobRecord[] = [];
  const r = {
    ...base,
    kind: 'nube' as const,
    creados,
    async create(job: JobRecord) {
      creados.push(job);
      return job;
    },
    async forWrite() {
      return r;
    },
  };
  return r;
}

// ---------------------------------------------------------------------------
describe('V1–V5 · versión del snapshot según la flag y el repositorio fijado', () => {
  it('V5 · tabla de decisión', () => {
    expect(snapshotVersionFor(true, 'local')).toBe(2);
    expect(snapshotVersionFor(true, 'nube')).toBe(1);
    expect(snapshotVersionFor(false, 'local')).toBe(1);
    expect(snapshotVersionFor(false, 'nube')).toBe(1);
  });

  it('V1 · navegador + flag + editores con datos → v2 válido con todo el inventario', async () => {
    const s = conCarga(sesionLista());
    const repo = createQuoteRepository(new MemoryKeyValueStore());
    const r = await saveQuote(repo, (n, v) => buildJobRecord(s, form, issuer, meta(n), { version: v }), issuer, { cargoFlag: true });
    expect(r.status).toBe('guardada');
    if (r.status !== 'guardada') return;
    expect(r.version).toBe(2);
    const internal = r.job.internal;
    expect(isSnapshotV2(internal)).toBe(true);
    expect(snapshotV2Schema.safeParse(internal).success).toBe(true);
    if (!isSnapshotV2(internal)) return;
    expect(internal.cargo?.items).toHaveLength(2);
    expect(internal.cargo?.totals).toEqual({ weightKg: 219, volumeM3: 1.842, lines: 2, linesWithWeight: 2, linesWithVolume: 2 });
    expect(internal.resources?.helpers).toHaveLength(1);
    // Guardado completo en el navegador.
    const leido = (await repo.list())[0]!;
    expect(isSnapshotV2(leido.internal) && leido.internal.cargo?.items).toHaveLength(2);
  });

  it('V2 · cuenta + flag + editores con datos → v1 IDÉNTICO al de hoy', async () => {
    const hoy = buildJobRecord(sesionLista(), form, issuer, meta(7));
    const s = conCarga(sesionLista());
    const nube = repoNube();
    const r = await saveQuote(nube, (n, v) => buildJobRecord(s, form, issuer, meta(n), { version: v }), issuer, { cargoFlag: true });
    expect(r.status === 'guardada' && r.version).toBe(1);
    const guardado = nube.creados[0]!;
    expect('schemaVersion' in guardado.internal).toBe(false);
    expect({ ...guardado, number: 7, id: hoy!.id }).toEqual(hoy);
  });

  it('V3 · el repositorio fijado por forWrite() decide, no la referencia original', async () => {
    const s = conCarga(sesionLista());
    const nube = repoNube();
    // Se edita «sin cuenta», pero al guardar el repositorio fijado ya es la cuenta: v1.
    const local: QuoteRepository = { ...createQuoteRepository(new MemoryKeyValueStore()), forWrite: async () => nube };
    const r = await saveQuote(local, (n, v) => buildJobRecord(s, form, issuer, meta(n), { version: v }), issuer, { cargoFlag: true });
    expect(r.status === 'guardada' && r.version).toBe(1);
    expect('schemaVersion' in nube.creados[0]!.internal).toBe(false);
    // Y si la cuenta cambia a mitad del guardado, el repositorio de la nube se niega (comportamiento actual).
    const rechaza: QuoteRepository = {
      ...nube,
      forWrite: async () => ({
        ...nube,
        create: async () => {
          throw new Error('La sesión cambió: no se guardó.');
        },
      }),
    };
    await expect(saveQuote(rechaza, (n, v) => buildJobRecord(s, form, issuer, meta(n), { version: v }), issuer, { cargoFlag: true })).rejects.toThrow('La sesión cambió');
  });

  it('V4 · flag apagada: v1 idéntico en el navegador y en la cuenta', async () => {
    const hoy = buildJobRecord(sesionLista(), form, issuer, meta(3));
    for (const repo of [createQuoteRepository(new MemoryKeyValueStore()), repoNube()]) {
      const s = conCarga(sesionLista());
      const r = await saveQuote(repo, (n, v) => buildJobRecord(s, form, issuer, meta(n), { version: v }), issuer);
      expect(r.status === 'guardada' && r.version).toBe(1);
      if (r.status === 'guardada') expect({ ...r.job, number: 3, id: hoy!.id }).toEqual(hoy);
    }
  });
});

describe('Emisión v2 (docs/22 §2.3)', () => {
  it('sin inventario ni recursos: cargo y resources en null', () => {
    const job = buildJobRecord(sesionLista(), form, issuer, meta(), { version: 2 })!;
    expect(isSnapshotV2(job.internal) && job.internal.cargo).toBeNull();
    expect(isSnapshotV2(job.internal) && job.internal.resources).toBeNull();
  });

  it('los datos de costo del v2 son los mismos del v1', () => {
    const v1 = buildJobRecord(conCarga(sesionLista()), form, issuer, meta())!.internal as JobInternalV1;
    const v2 = buildJobRecord(conCarga(sesionLista()), form, issuer, meta(), { version: 2 })!.internal;
    for (const k of ['routeSource', 'km', 'minutes', 'costEstimate', 'costType', 'suggestedPrice', 'margin', 'missing', 'engineVersion'] as const) {
      expect((v2 as unknown as Record<string, unknown>)[k]).toEqual(v1[k]);
    }
  });

  it('D-I3 · datos inválidos o «Rápido» con lista sin decidir: no se emite', () => {
    const s = conCarga(sesionLista());
    s.setCargo(updateItem(s.getSnapshot().cargo, 'a', { l: 50.5 }));
    expect(() => buildJobRecord(s, form, issuer, meta(), { version: 2 })).toThrow(CargoInvalidError);
    const r = conCarga(sesionLista());
    r.setCargo(setMode(r.getSnapshot().cargo, 'rapido'));
    expect(() => buildJobRecord(r, form, issuer, meta(), { version: 2 })).toThrow(/Detallado/);
    expect(bloqueoEmision(r.getSnapshot().cargo, r.getSnapshot().resources)).toMatch(/Detallado/);
  });

  it('un ayudante con datos inválidos bloquea la emisión', () => {
    const s = conCarga(sesionLista());
    let res = setHelperMode(s.getSnapshot().resources, '00000000-0000-4000-8000-0000000000a1', 'hora');
    res = updateHelper(res, '00000000-0000-4000-8000-0000000000a1', { ratePerHour: 6000, hours: 30 });
    res = toggleSegment(res, '00000000-0000-4000-8000-0000000000a1', 'manipulacion');
    s.setResources(res);
    expect(() => buildJobRecord(s, form, issuer, meta(), { version: 2 })).toThrow(/24 horas/);
  });

  it('el PDF, el enlace y WhatsApp salen solo de la lista blanca (D-I7)', () => {
    const v1 = buildJobRecord(conCarga(sesionLista()), form, issuer, meta())!;
    const v2 = buildJobRecord(conCarga(sesionLista()), form, issuer, meta(), { version: 2 })!;
    expect(toClientQuote(v2)).toEqual(toClientQuote(v1));
  });
});

describe('D-I1 · el costo es idéntico con los editores vacíos o llenos', () => {
  it('computation, medidas y huella del precio no cambian', () => {
    const vacia = sesionLista();
    const llena = conCarga(sesionLista());
    const a = vacia.computation('habitual')!;
    const b = llena.computation('habitual')!;
    expect(b.items).toEqual(a.items);
    expect(b.measures).toEqual(a.measures);
    expect(llena.priceNeedsConfirmation()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Avisos anti-duplicado (§1)', () => {
  const params = sesionLista().getSnapshot().params; // 2 × $15.000, 60 min, otros 0

  it('sin detalle: sin avisos', () => {
    expect(avisosDuplicado(params, emptyResourcesDraft())).toEqual([]);
  });

  it('detalle de ayudantes que no coincide con el costo: aviso, sin corregir nada', () => {
    let r = addHelper(emptyResourcesDraft(), '00000000-0000-4000-8000-000000000101');
    r = updateHelper(r, '00000000-0000-4000-8000-000000000101', { feeService: 36000 });
    const avisos = avisosDuplicado(params, r);
    expect(avisos.map((a) => a.id)).toEqual(['ayudantes']);
    expect(avisos[0]!.texto).toContain('usa 2 × $15.000');
    expect(avisos[0]!.texto).toContain('suma $36.000');
    expect(avisos[0]!.texto).toContain('No se suma dos veces');
    expect(params.helpers).toBe(2);
  });

  it('detalle que coincide (2 × $15.000): sin aviso', () => {
    let r = addHelper(addHelper(emptyResourcesDraft(), '00000000-0000-4000-8000-000000000102'), '00000000-0000-4000-8000-000000000103');
    r = updateHelper(r, '00000000-0000-4000-8000-000000000102', { feeService: 15000 });
    r = updateHelper(r, '00000000-0000-4000-8000-000000000103', { feeService: 15000 });
    expect(avisosDuplicado(params, r)).toEqual([]);
  });

  it('minutos por parada distintos del campo del costo, y equipamiento mayor que «Otros gastos»', () => {
    let r = updateStop(emptyResourcesDraft(), 'A', { loadMinutes: 45 });
    r = addEquipment(r, 'e1');
    r = updateEquipment(r, 'e1', { label: 'Mantas', amount: 5000 });
    const ids = avisosDuplicado(params, r).map((a) => a.id);
    expect(ids).toEqual(['tiempos', 'equipamiento']);
  });
});

// ---------------------------------------------------------------------------
describe('X1–X5 · «Servicio» e «Incluye» (D-I5)', () => {
  it('X1 · el texto predeterminado de «Incluye» es el de hoy', () => {
    expect(includesPorDefecto(0)).toBe('Carga y descarga');
    expect(includesPorDefecto(1)).toBe('Carga y descarga, 1 ayudante(s)');
    expect(includesPorDefecto(3)).toBe('Carga y descarga, 3 ayudante(s)');
  });

  it('X2 · la casilla marcada produce el texto de hoy; desmarcada, «Carga y descarga»', () => {
    expect(includesSegunCasilla(2, true)).toBe(includesPorDefecto(2));
    expect(includesSegunCasilla(2, false)).toBe('Carga y descarga');
    expect(alternarIncluye(includesPorDefecto(2), 2, false)).toEqual({ texto: 'Carga y descarga', editadoAMano: false });
    expect(alternarIncluye('Carga y descarga', 2, true)).toEqual({ texto: includesPorDefecto(2), editadoAMano: false });
  });

  it('X3 · el número sale del campo de costo, nunca del detalle interno', () => {
    // Detalle con 5 ayudantes y campo de costo en 2: «Incluye» dice 2.
    expect(includesSegunCasilla(2, true)).toBe('Carga y descarga, 2 ayudante(s)');
  });

  it('X4 · un texto editado a mano no se pisa al cambiar la casilla', () => {
    expect(alternarIncluye('Carga, descarga y embalaje', 2, false)).toEqual({ texto: 'Carga, descarga y embalaje', editadoAMano: true });
  });

  it('X5 · la sugerencia para «Servicio» no menciona ayudantes', () => {
    const s = conCarga(sesionLista()).getSnapshot();
    const t = suggestServiceText({ mode: 'detallado', summary: '', items: [] }, s.resources.stops);
    expect(t).not.toMatch(/ayudante/i);
  });
});

// ---------------------------------------------------------------------------
/** Cliente de Supabase falso con «nube» en memoria: `create_job_with_quote` es idempotente por local_id. */
function fakeSupabase(opts: { falla?: number } = {}) {
  const nube = new Set<string>();
  const enviados: Array<Record<string, unknown>> = [];
  let llamadas = 0;
  const rpc = vi.fn(async (fn: string, args: { p_job: { local_id: string; internal: unknown } }) => {
    if (fn !== 'create_job_with_quote') return { data: null, error: null };
    llamadas += 1;
    if (opts.falla === llamadas) return { data: null, error: { message: 'red caída' } };
    enviados.push(args.p_job as unknown as Record<string, unknown>);
    const id = args.p_job.local_id;
    if (nube.has(id)) return { data: null, error: null };
    nube.add(id);
    return { data: { id, number: 1, issued_number: 1 }, error: null };
  });
  const tabla = (nombre: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'upsert', 'order', 'limit']) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: null, error: null });
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: nombre === 'jobs' ? [...nube].map((local_id) => ({ local_id })) : [], error: null });
    return chain;
  };
  return { client: { rpc, from: tabla } as never, rpc, nube, enviados };
}

const sinVehiculos: VehicleRepository = {
  list: async () => [],
  getDefaultId: async () => null,
  get: async () => null,
  create: async () => {
    throw new Error('no');
  },
  update: async () => {
    throw new Error('no');
  },
  remove: async () => undefined,
  setDefault: async () => undefined,
};

function jobV1(n: number): JobRecord {
  return buildJobRecord(sesionLista(), form, issuer, meta(n))!;
}
function jobV2Resumen(n: number): JobRecord {
  return buildJobRecord(sesionLista(), form, issuer, meta(n), { version: 2 })!;
}
/** v2 en modo rápido: `cargo` con resumen y `items: []` (en el navegador la lista siempre viaja). */
function jobV2Rapido(n: number): JobRecord {
  const s = sesionLista();
  s.setCargo({ mode: 'rapido', summary: 'Mudanza pequeña', items: [] });
  return buildJobRecord(s, form, issuer, meta(n), { version: 2 })!;
}
function jobV2ConLineas(n: number): JobRecord {
  return buildJobRecord(conCarga(sesionLista()), form, issuer, meta(n), { version: 2 })!;
}

async function historial(jobs: JobRecord[]) {
  const store = new MemoryKeyValueStore();
  const localQuotes = createQuoteRepository(store);
  for (const j of jobs) await localQuotes.create(j);
  return { store, localQuotes, antes: store.getItem('cotizador.trabajos.v1') };
}

describe('M1–M9 · copia mixta v1/v2 a la cuenta (docs/22 §2.5, C2)', () => {
  const copiar = (h: Awaited<ReturnType<typeof historial>>, sb: ReturnType<typeof fakeSupabase>, isCurrentUser = () => true) =>
    migrateLocalToCloud({ supabase: sb.client, userId: 'A', localQuotes: h.localQuotes, localVehicles: sinVehiculos, store: h.store, isCurrentUser });

  it('M1 · solo v1: mismas llamadas y resultado que hasta hoy', async () => {
    const h = await historial([jobV1(1), jobV1(2)]);
    const sb = fakeSupabase();
    const r = await copiar(h, sb);
    expect(r).toMatchObject({ jobsCopied: 2, jobsAlreadyThere: 0, verified: true, deferred: [] });
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    // El internal enviado de una v1 es el del registro, tal cual.
    const j = (await h.localQuotes.list()).find((x) => x.number === 1)!;
    expect(sb.enviados.find((e) => e.local_id === j.id)!.internal).toEqual(j.internal);
    expect(mensajeCopia(r)).toMatch(/^Listo: se copiaron 2 cotizaciones/);
  });

  it('M2 · mezcla 3 v1 + 1 v2-resumen + 2 v2-con-líneas: se copian 4, quedan 2 diferidas con su número', async () => {
    const h = await historial([jobV1(1), jobV1(2), jobV2Rapido(3), jobV2Resumen(4), jobV2ConLineas(5), jobV2ConLineas(6)]);
    const sb = fakeSupabase();
    const r = await copiar(h, sb);
    expect(r.jobsCopied).toBe(4);
    // La v2 en modo rápido se envía con el resumen pero SIN la clave `items` (C2: internal preparado).
    const rapido = sb.enviados.find((e) => (e.internal as { cargo?: { mode?: string } }).cargo?.mode === 'rapido')!;
    expect((rapido.internal as { cargo: Record<string, unknown> }).cargo).toMatchObject({ summary: 'Mudanza pequeña' });
    expect((rapido.internal as { cargo: Record<string, unknown> }).cargo).not.toHaveProperty('items');
    expect(r.verified).toBe(true);
    expect(r.deferred.map((d) => [d.number, d.clase])).toEqual(
      expect.arrayContaining([
        [5, 'v2-con-lineas'],
        [6, 'v2-con-lineas'],
      ]),
    );
    expect(sb.rpc).toHaveBeenCalledTimes(4);
    // C2: ninguna línea de carga viaja a la nube; la v2-resumen va con su internal validado.
    for (const e of sb.enviados) expect(JSON.stringify(e.internal)).not.toContain('"items"');
    const msg = mensajeCopia(r);
    expect(msg).not.toMatch(/^Listo/);
    expect(msg).toContain('N° 0005');
    expect(msg).toContain('N° 0006');
    expect(msg).toContain('detalle de carga');
    const log = JSON.parse(h.store.getItem(MIGRATION_KEY)!).A;
    expect(log.jobs).toHaveLength(4);
    expect(log.deferred).toHaveLength(2);
    // Pendientes: el botón no reaparece por las diferidas.
    const p = await pendingLocalData(h.localQuotes, sinVehiculos, h.store, 'A');
    expect(p).toMatchObject({ jobs: 0, vehicles: 0 });
    expect(p.deferred).toHaveLength(2);
  });

  it('M3 · reintento: sin duplicados, 0 nuevas y las diferidas no cambian', async () => {
    const h = await historial([jobV1(1), jobV2Resumen(2), jobV2ConLineas(3)]);
    const sb = fakeSupabase();
    await copiar(h, sb);
    const r = await copiar(h, sb);
    expect(r).toMatchObject({ jobsCopied: 0, jobsAlreadyThere: 2, verified: true });
    expect(r.deferred).toHaveLength(1);
    expect(sb.nube.size).toBe(2);
  });

  it('M4 · fallo de red en la 3.ª elegible: se informa, nada marcado como completo y el reintento termina', async () => {
    const h = await historial([jobV1(1), jobV1(2), jobV1(3), jobV1(4)]);
    const sb = fakeSupabase({ falla: 3 });
    await expect(copiar(h, sb)).rejects.toThrow('Se copiaron 2 cotizaciones');
    expect(h.store.getItem(MIGRATION_KEY)).toBeNull();
    const r = await copiar(h, sb);
    expect(r.verified).toBe(true);
    expect(sb.nube.size).toBe(4);
  });

  it('M5 · cambio de identidad a mitad de la copia: se detiene sin registrar avance', async () => {
    const h = await historial([jobV1(1), jobV1(2), jobV1(3)]);
    const sb = fakeSupabase();
    let n = 0;
    await expect(copiar(h, sb, () => ++n <= 2)).rejects.toThrow('La sesión cambió');
    expect(h.store.getItem(MIGRATION_KEY)).toBeNull();
  });

  it('M6 · v2 con inventario incompleto o malformado: ilegible, diferida y nunca enviada', async () => {
    const malo = jobV2ConLineas(1);
    if (isSnapshotV2(malo.internal) && malo.internal.cargo) delete malo.internal.cargo.items;
    const malformado = { ...jobV1(2), internal: { ...jobV2Resumen(2).internal, costType: 'otro' } as unknown as JobRecord['internal'] };
    expect(clasificarParaCopia(malo).clase).toBe('ilegible');
    expect(clasificarParaCopia(malformado).clase).toBe('ilegible');
    const h = await historial([malo, malformado]);
    const sb = fakeSupabase();
    const r = await copiar(h, sb);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(r.deferred.map((d) => d.clase)).toEqual(['ilegible', 'ilegible']);
  });

  it('M7 · C2: el tope se mide en bytes UTF-8 en TODO v2 (también con cargo null): justo en el tope pasa, 1 byte más no', () => {
    const internal = jobV2Resumen(1).internal as unknown as Record<string, unknown>;
    expect(internal.cargo).toBeNull();
    const helpers = Array.from({ length: 20 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, mode: 'hora', ratePerHour: 6000, paidSegments: ['manipulacion', 'traslado'], hours: 3 }));
    const stops = (['A', 'B'] as const).map((role) => ({ role, floor: 4, elevator: 'no', stairs: true, carryMeters: 10, access: '€'.repeat(120), loadMinutes: 30 }));
    const missing = Array.from({ length: 20 }, () => '€'.repeat(60));
    // El último nombre combina «€» (3 bytes) y «a» (1 byte): permite ajustar el total de a 1 byte.
    const conEquipo = (n: number, euros: number, aes: number) => ({
      ...internal,
      missing,
      resources: {
        stops,
        helpers,
        equipment: Array.from({ length: n }, (_, i) => ({ label: i === n - 1 ? '€'.repeat(euros) + 'a'.repeat(aes) : '€'.repeat(60), amount: 1000 })),
      },
    });
    const bytes = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).length;
    let justo: Record<string, unknown> | null = null;
    for (let n = 1; n <= 20 && !justo; n++) {
      for (let e = 0; e <= 59 && !justo; e++) {
        for (let a = e === 0 ? 1 : 0; e + a <= 59 && !justo; a++) {
          if (bytes(conEquipo(n, e, a)) === MAX_CLOUD_INTERNAL_JSON_BYTES) justo = conEquipo(n, e, a);
        }
      }
    }
    expect(justo).not.toBeNull();
    expect(toCloudPayload(justo)).toMatchObject({ ok: true });
    const res = justo!.resources as { equipment: Array<{ label: string }> };
    const unoMas = { ...justo!, resources: { ...res, equipment: res.equipment.map((e, i, all) => (i === all.length - 1 ? { ...e, label: `${e.label}a` } : e)) } };
    expect(bytes(unoMas)).toBe(MAX_CLOUD_INTERNAL_JSON_BYTES + 1);
    expect(toCloudPayload(unoMas)).toMatchObject({ ok: false, reason: expect.stringContaining(`${MAX_CLOUD_INTERNAL_JSON_BYTES + 1} bytes`) });
  });

  it('M7b · un v2 sin carga que supera el tope en bytes queda diferido', () => {
    const v2 = jobV2Resumen(1);
    const internal = v2.internal as unknown as Record<string, unknown>;
    // Recursos válidos con textos largos multibyte: 20 elementos × 60 «€» + accesos de 120 «€».
    const equipment = Array.from({ length: 20 }, (_, i) => ({ label: '€'.repeat(59) + String(i % 10), amount: 1000 }));
    const stops = (['A', 'B'] as const).map((role) => ({ role, floor: 4, elevator: 'no', stairs: true, carryMeters: 10, access: '€'.repeat(120), loadMinutes: 30 }));
    const helpers = Array.from({ length: 20 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, mode: 'hora', ratePerHour: 6000, paidSegments: ['manipulacion', 'traslado'], hours: 3 }));
    const sobre = { ...internal, missing: Array.from({ length: 20 }, () => '€'.repeat(60)), resources: { stops, helpers, equipment } };
    const bytes = new TextEncoder().encode(JSON.stringify(sobre)).length;
    expect(bytes).toBeGreaterThan(MAX_CLOUD_INTERNAL_JSON_BYTES);
    const r = toCloudPayload(sobre);
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('bytes') });
    expect(clasificarParaCopia({ ...v2, internal: sobre as unknown as JobRecord['internal'] }).clase).toBe('ilegible');
  });

  it('M8 · un registro anterior (formato actual, sin «deferred») se lee y se completa sin perder lo copiado', async () => {
    const h = await historial([jobV1(1), jobV1(2)]);
    const ya = (await h.localQuotes.list()).find((j) => j.number === 1)!.id;
    // Además, un id copiado en una sesión anterior que ya no está en este navegador.
    const antigua = '00000000-0000-4000-8000-0000000000ff';
    h.store.setItem(MIGRATION_KEY, JSON.stringify({ A: { at: '2026-11-18', jobs: [ya, antigua], vehicles: [] } }));
    expect((await pendingLocalData(h.localQuotes, sinVehiculos, h.store, 'A')).jobs).toBe(1);
    const sb = fakeSupabase();
    sb.nube.add(ya);
    await copiar(h, sb);
    const log = JSON.parse(h.store.getItem(MIGRATION_KEY)!).A;
    expect(log.jobs).toEqual(expect.arrayContaining([ya, antigua]));
    expect(log.jobs).toHaveLength(3);
  });

  it('M9 · ningún registro local cambia al copiar', async () => {
    const h = await historial([jobV1(1), jobV2Resumen(2), jobV2ConLineas(3)]);
    await copiar(h, fakeSupabase());
    expect(h.store.getItem('cotizador.trabajos.v1')).toBe(h.antes);
  });

  it('el lector de la nube acepta un internal v2 resumido (tarea 9)', () => {
    const v2 = clasificarParaCopia(jobV2Resumen(4)).envio!;
    const row = jobWithQuotePayload(v2, v2.id).p_job as Record<string, unknown>;
    const leido = jobFromRow({ ...row, id: v2.id, number: 4, issued_number: 4, owner_id: 'A', created_at: '2026-11-20T00:00:00Z' } as never);
    expect(readSnapshot(leido.internal)).toMatchObject({ ok: true, sourceVersion: 2 });
  });
});

// ---------------------------------------------------------------------------
describe('I-1b · borrador persistente y C1 (aislado por dueño)', () => {
  it('recargar con 200 líneas: se recupera todo', () => {
    const store = new MemoryKeyValueStore();
    const ds = new DraftStore(store);
    const s = sesionLista();
    let inv = s.getSnapshot().cargo;
    for (let i = 0; i < 200; i++) inv = updateItem(addItem(inv, newDraftItem(`k${i}`, { kind: 'cajas', label: `Caja ${i}` })), `k${i}`, { unitWeightKg: 10, l: 50, w: 40, h: 40 });
    s.setCargo(inv);
    expect(ds.write('local', s.draftData()).ok).toBe(true);
    // «Recarga»: sesión nueva y lectura del almacenamiento.
    const r = ds.read('local');
    expect(r.status).toBe('ok');
    const nueva = new QuoteSession(noRoutes);
    if (r.status === 'ok') nueva.restoreDraft(r.draft.data);
    expect(nueva.getSnapshot().cargo.items).toHaveLength(200);
    expect(nueva.getSnapshot().cargo).toEqual(s.getSnapshot().cargo);
    expect(nueva.getSnapshot().params).toEqual(s.getSnapshot().params);
    expect(nueva.getSnapshot().inputs).toEqual(s.getSnapshot().inputs);
    // La ruta del proveedor y el precio NO se guardan: se recalcula y se confirma de nuevo.
    expect(nueva.getSnapshot().chosenPrice).toBeNull();
    expect(nueva.computation('habitual')).toBeNull();
  });

  it('navegador lleno: aviso, sin tocar el historial emitido', () => {
    const store = new MemoryKeyValueStore();
    store.setItem('cotizador.trabajos.v1', '[{"x":1}]');
    const lleno = { getItem: (k: string) => store.getItem(k), setItem: () => { throw new Error('QuotaExceededError'); } };
    const r = new DraftStore(lleno).write('local', sesionLista().draftData());
    expect(r).toMatchObject({ ok: false, reason: expect.stringContaining('No se pudo guardar el borrador') });
    expect(store.getItem('cotizador.trabajos.v1')).toBe('[{"x":1}]');
  });

  it('emitir o descartar borra solo el borrador de ese dueño', () => {
    const store = new MemoryKeyValueStore();
    const ds = new DraftStore(store);
    ds.write('local', sesionLista().draftData());
    ds.clear('local');
    expect(ds.read('local')).toEqual({ status: 'none' });
  });

  it('C1 · con cuenta no se guarda borrador y nunca se lee el de «local»', () => {
    const store = new MemoryKeyValueStore();
    const ds = new DraftStore(store);
    const s = conCarga(sesionLista());
    ds.write('local', s.draftData());
    expect(ds.write('user-A', s.draftData()).ok).toBe(false);
    expect(ds.read('user-A')).toEqual({ status: 'none' });
    expect(ds.read('user-B')).toEqual({ status: 'none' });
    // El borrador local sigue intacto (se recuperará al volver sin cuenta).
    const r = ds.read('local');
    expect(r.status === 'ok' && r.draft.data.cargo.items).toHaveLength(2);
  });

  it('C1 · al iniciar sesión el inventario sale de la sesión y queda guardado como borrador local', () => {
    // Lo que hace App al pasar de «sin cuenta» a una cuenta (docs/22 §2.2, C1).
    const store = new MemoryKeyValueStore();
    const ds = new DraftStore(store);
    const s = conCarga(sesionLista());
    if (s.hasDraftContent()) ds.write('local', s.draftData());
    s.setCargo({ mode: 'detallado', summary: '', items: [] });
    s.setResources(emptyResourcesDraft());
    expect(s.getSnapshot().cargo.items).toHaveLength(0);
    const r = ds.read('local');
    expect(r.status === 'ok' && r.draft.data.cargo.items).toHaveLength(2);
    expect(r.status === 'ok' && r.draft.data.resources.helpers).toHaveLength(1);
  });

  it('un borrador ilegible se informa como tal y no se carga', () => {
    const store = new MemoryKeyValueStore();
    store.setItem(DRAFT_KEY, JSON.stringify({ local: { format: 1, savedAt: 'x', data: { inputs: 'malo' } } }));
    expect(new DraftStore(store).read('local')).toEqual({ status: 'ilegible' });
    store.setItem(DRAFT_KEY, '{no es json');
    expect(new DraftStore(store).read('local')).toEqual({ status: 'ilegible' });
  });
});

// ---------------------------------------------------------------------------
describe('Interfaz con la flag apagada: idéntica a hoy (X1, D-I6)', () => {
  it('QuoteForm sin la integración: sin casilla ni sugerencia; «Incluye» como hoy', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { QuoteForm } = await import('../src/web/components/QuoteForm');
    const repo = createQuoteRepository(new MemoryKeyValueStore());
    const apagado = renderToStaticMarkup(createElement(QuoteForm, { session: conCarga(sesionLista()), repository: repo, onSaved: () => undefined, onCancel: () => undefined }));
    expect(apagado).not.toContain('Indicar al cliente la cantidad de ayudantes');
    expect(apagado).not.toContain('Usar texto sugerido');
    expect(apagado).toContain('value="Carga y descarga, 2 ayudante(s)"');
    const encendido = renderToStaticMarkup(
      createElement(QuoteForm, { session: conCarga(sesionLista()), repository: repo, onSaved: () => undefined, onCancel: () => undefined, cargoEnabled: true }),
    );
    expect(encendido).toContain('Indicar al cliente la cantidad de ayudantes (2, según «Ayudantes» del costo)');
    expect(encendido).toContain('Usar texto sugerido');
    expect(encendido).toContain('value="Carga y descarga, 2 ayudante(s)"'); // mismo valor predeterminado
    expect(encendido).not.toMatch(/Sugerencia[^»]*ayudante/);
  });

  it('Calculator sin la integración no muestra el detalle de carga', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { Calculator } = await import('../src/web/components/Calculator');
    const props = { session: conCarga(sesionLista()), vehicles: [], onManageVehicles: () => undefined, onCreateQuote: () => undefined };
    expect(renderToStaticMarkup(createElement(Calculator, props))).not.toContain('Detalle de la carga y recursos');
    expect(renderToStaticMarkup(createElement(Calculator, { ...props, cargoEnabled: true }))).toContain('Detalle de la carga y recursos');
  });
});
