/**
 * A-80, Frente C — Regresión del FLUJO COMPLETO de una cotización real, de punta a punta y sin red:
 * vehículo («Mis vehículos») → recorrido manual (con base y regreso) → carga → costos → precio →
 * cotización guardada → documento (PDF) → WhatsApp → enlace de Google Maps.
 *
 * No cambia funciones ni reglas: comprueba que el camino completo sigue emitiendo y que los tres
 * formatos que recibe el cliente (documento/PDF, WhatsApp y lista blanca) muestran el MISMO precio y
 * ningún dato interno. Google Routes queda desconectado: el cliente de rutas falla si se lo llama.
 * Datos ficticios.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { formatClp } from '../src/engine/rounding';
import { CLIENT_QUOTE_KEYS, isSnapshotV2, toClientQuote, whatsappText, whatsappUrl, type JobRecord } from '../src/shared/clientQuote';
import { googleMapsDirectionsUrl } from '../src/shared/mapsUrl';
import { MAX_CLP } from '../src/shared/resources';
import { QuoteDocument, QuoteView, quoteDocumentTitle } from '../src/web/components/QuoteView';
import { buildJobRecord, type QuoteFormData } from '../src/web/jobs';
import { addItem, newDraftItem, updateItem } from '../src/web/modules/inventoryDraft';
import { addHelper, updateHelper, updateStop } from '../src/web/modules/resourcesDraft';
import { saveQuote } from '../src/web/saveQuote';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository } from '../src/web/storage';
import { LocalVehicleRepository, MemoryKeyValueStore } from '../src/web/vehicleRepository';

/** Google Routes DESCONECTADO: cualquier llamada es un error de la prueba. */
const sinGoogle = (): RouteClient & { requestRoute: ReturnType<typeof vi.fn> } => ({
  requestRoute: vi.fn(async () => {
    throw new Error('Google Routes no debe consultarse en el flujo manual');
  }),
});

// Valores internos DISTINTIVOS, para detectar si alguno aparece en lo que recibe el cliente.
const INTERNOS = {
  vehiculo: 'Furgón Interno Z9',
  combustible: 1_237, // $/L
  rendimiento: 8.7, // km/L
  desgaste: 43, // $/km
  fijo: 1_913, // $/h
  dueño: 6_271, // $/h
  ayudanteTarifa: 17_350,
  peajes: 3_310,
  otros: 2_090,
  carga: 47, // minutos
};

const form: QuoteFormData = {
  clientName: 'Cliente Ficticio Ñandú',
  serviceDescription: 'Traslado de un refrigerador y cajas',
  includes: 'Carga y descarga, 1 ayudante(s)',
  conditions: 'Pago contra entrega',
  serviceDate: '2026-12-05',
  validUntil: '2026-12-01',
  originLabel: 'Ñuñoa',
  destinationLabel: 'Maipú',
};
const emisor = { name: 'Fletes Ficticios del Sur', phone: '+56 9 0000 0000', email: 'contacto@ficticio.invalid' };

async function vehiculoGuardado(kmPerL: number | null = INTERNOS.rendimiento, wearPerKm: number | null = INTERNOS.desgaste) {
  let n = 0;
  const repo = new LocalVehicleRepository(new MemoryKeyValueStore(), { newId: () => `veh-${++n}`, now: () => new Date('2026-11-24T12:00:00Z') });
  const v = await repo.create({ name: INTERNOS.vehiculo, type: 'furgon', fuel: 'diesel', kmPerL, wearPerKm });
  await repo.setDefault(v.id);
  return { repo, v };
}

/** Recorrido manual de 3 tramos: Base → A → B → Base. */
function recorridoManual(s: QuoteSession) {
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú', base: 'Base Ficticia 3, La Florida', startAtBase: true, returnToBase: true });
  s.useManual('habitual');
  const tramos: Array<[number, number]> = [
    [8.5, 15],
    [25, 40],
    [31, 47],
  ];
  tramos.forEach(([km, minutes], i) => s.setLegOverride('habitual', i, { km, minutes }));
  return tramos;
}

function costos(s: QuoteSession) {
  s.setParams({
    fuelPricePerL: INTERNOS.combustible,
    fixedPerHour: INTERNOS.fijo,
    ownerPerHour: INTERNOS.dueño,
    helpers: 1,
    helperFee: INTERNOS.ayudanteTarifa,
    loadMinutes: INTERNOS.carga,
    tolls: INTERNOS.peajes,
    otherCosts: INTERNOS.otros,
  });
}

function carga(s: QuoteSession) {
  let inv = addItem(s.getSnapshot().cargo, newDraftItem('r', { kind: 'refrigerador', label: 'Refrigerador Interno' }));
  inv = updateItem(inv, 'r', { unitWeightKg: 75, l: 70, w: 70, h: 180 });
  inv = addItem(inv, newDraftItem('c', { kind: 'cajas', label: 'Cajas Internas' }));
  inv = updateItem(inv, 'c', { qty: 12, unitWeightKg: 12, l: 50, w: 40, h: 40 });
  s.setCargo(inv);
  let res = updateStop(s.getSnapshot().resources, 'A', { floor: 4, elevator: 'no', loadMinutes: 30 });
  res = addHelper(res, '00000000-0000-4000-8000-0000000000a1');
  res = updateHelper(res, '00000000-0000-4000-8000-0000000000a1', { feeService: INTERNOS.ayudanteTarifa });
  s.setResources(res);
}

/** El precio que elegiría el transportista: el sugerido que muestra la calculadora (múltiplo de 1.000). */
function precioSugerido(s: QuoteSession): number {
  const c = s.computation('habitual');
  if (!c) throw new Error('sin cálculo');
  return c.measures.suggested.value;
}

async function emitir(s: QuoteSession, opts: { cargoFlag?: boolean } = {}) {
  const quotes = createQuoteRepository(new MemoryKeyValueStore());
  let id = 0;
  const r = await saveQuote(
    quotes,
    (number, version) => buildJobRecord(s, form, emisor, { id: `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, number, createdAt: '2026-11-24' }, { version }),
    emisor,
    opts,
  );
  return { r, quotes };
}

/** Todo lo que el cliente recibe: lista blanca, documento/PDF y texto de WhatsApp. */
function loQueRecibeElCliente(job: JobRecord) {
  const q = toClientQuote(job);
  const doc = renderToStaticMarkup(createElement(QuoteDocument, { q }));
  const wa = whatsappText(q);
  return { q, doc, wa, url: whatsappUrl(q), todo: [JSON.stringify(q), doc, wa].join('\n') };
}

describe('Flujo completo sin flags (v1): vehículo → recorrido manual → costos → precio → cotización → PDF/WhatsApp', () => {
  it('emite la cotización con el vehículo y los tramos declarados, sin consultar Google Routes', async () => {
    const google = sinGoogle();
    const s = new QuoteSession(google);
    const { repo, v } = await vehiculoGuardado();
    s.selectDefaultVehicle((await repo.get((await repo.getDefaultId())!))!);
    const tramos = recorridoManual(s);
    costos(s);

    const c = s.computation('habitual');
    expect(c).not.toBeNull();
    expect(c!.km).toBeCloseTo(tramos.reduce((a, [km]) => a + km, 0), 10);
    expect(c!.minutes).toBe(tramos.reduce((a, [, m]) => a + m, 0));
    expect(c!.source).toBe('declarado');
    expect(c!.measures.cost.type).toBe('estimado');
    expect(c!.measures.missing).toEqual([]);

    const precio = precioSugerido(s);
    expect(Number.isInteger(precio) && precio % 1000 === 0).toBe(true);
    s.setChosenPrice(precio);
    expect(s.canQuote()).toBe(true);

    const { r, quotes } = await emitir(s);
    expect(r.status).toBe('guardada');
    if (r.status !== 'guardada') return;
    expect(r.version).toBe(1);
    expect(r.job.number).toBe(1);
    expect(r.job.netPrice).toBe(precio);
    expect(r.job.tax).toBeNull();
    expect(isSnapshotV2(r.job.internal)).toBe(false);
    expect(r.job.internal.vehicle).toMatchObject({ id: v.id, kmPerL: INTERNOS.rendimiento, wearPerKm: INTERNOS.desgaste, adjusted: [] });
    // Km y minutos DECLARADOS por el usuario: se pueden conservar (A-38).
    expect(r.job.internal.km).toBeCloseTo(64.5, 10);
    expect(r.job.internal.minutes).toBe(102);
    expect(r.job.internal.costType).toBe('estimado');
    expect(r.job.waypoints.map((w) => w.role)).toEqual(['base', 'A', 'B', 'base']);
    expect(await quotes.list()).toHaveLength(1);
    expect(await quotes.getBusiness()).toEqual(emisor);
    expect(google.requestRoute).not.toHaveBeenCalled();
    expect(s.getSnapshot().routeRequests).toBe(0);

    // Una segunda cotización recibe el número siguiente.
    s.markEmitted();
    const otra = await saveQuote(quotes, (number, version) => buildJobRecord(s, form, emisor, { id: '00000000-0000-4000-8000-0000000000ff', number, createdAt: '2026-11-24' }, { version }), emisor);
    expect(otra.status === 'guardada' && otra.job.number).toBe(2);
  });

  it('el documento (PDF), WhatsApp y la lista blanca muestran el MISMO precio y la leyenda', async () => {
    const s = new QuoteSession(sinGoogle());
    const { v } = await vehiculoGuardado();
    s.selectVehicle(v);
    recorridoManual(s);
    costos(s);
    const precio = precioSugerido(s);
    s.setChosenPrice(precio);
    const { r } = await emitir(s);
    if (r.status !== 'guardada') throw new Error('no se guardó');
    const { q, doc, wa, url } = loQueRecibeElCliente(r.job);

    expect(Object.keys(q).sort()).toEqual([...CLIENT_QUOTE_KEYS].sort());
    expect(q).toMatchObject({ number: 1, netPrice: precio, taxAmount: null, total: precio, clientName: form.clientName, businessName: emisor.name });
    const enPesos = formatClp(precio);
    expect(doc).toContain(enPesos);
    expect(wa).toContain(`Precio total: ${enPesos}`);
    expect(decodeURIComponent(url.replace('https://wa.me/?text=', ''))).toBe(wa);
    expect(wa).toContain('Cotización N° 0001 — Fletes Ficticios del Sur');
    expect(wa).toContain('Recorrido: Ñuñoa → Maipú');
    expect(doc).toContain('N° 0001');
    expect(doc).toContain('Esta cotización no es factura ni boleta.');
    expect(wa.split('\n').at(-1)).toBe('Esta cotización no es factura ni boleta.');
    expect(quoteDocumentTitle(q)).toBe('Cotización N° 0001 · Cliente Ficticio Ñandú');
    // Fechas en el documento con formato chileno.
    expect(doc).toContain('05-12-2026');
    expect(doc).toContain('24-11-2026');
  });

  it('nada interno llega al cliente: vehículo, combustible, rendimiento, desgaste, costo, sugerido, margen, km ni minutos', async () => {
    const s = new QuoteSession(sinGoogle());
    const { v } = await vehiculoGuardado();
    s.selectVehicle(v);
    recorridoManual(s);
    costos(s);
    s.setMargin(0.27);
    const c = s.computation('habitual')!;
    // Un precio distinto del sugerido, para que el sugerido sea detectable si se filtrara.
    const precio = c.measures.suggested.value + 7_000;
    s.setChosenPrice(precio);
    const { r } = await emitir(s);
    if (r.status !== 'guardada') throw new Error('no se guardó');
    const { todo } = loQueRecibeElCliente(r.job);
    const nf = (n: number, d = 2) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: d }).format(n);
    const prohibidos = [
      INTERNOS.vehiculo,
      'Furgón',
      'Diésel',
      nf(INTERNOS.combustible),
      nf(INTERNOS.rendimiento),
      nf(INTERNOS.fijo),
      nf(INTERNOS.dueño),
      nf(INTERNOS.peajes),
      nf(INTERNOS.otros),
      nf(INTERNOS.ayudanteTarifa),
      formatClp(Math.round(c.measures.cost.value)),
      formatClp(c.measures.suggested.value),
      '27 %',
      '64,5',
      ' km',
      'minutos',
      'margen',
      'Base Ficticia',
    ];
    for (const p of prohibidos) expect(todo, `«${p}» no debe llegar al cliente`).not.toContain(p);
    expect(todo).toContain(formatClp(precio));
  });
});

describe('Flujo completo con detalle de carga (v2 en el navegador, como con la flag encendida en local)', () => {
  it('carga y recursos quedan en el snapshot interno; el costo y lo que ve el cliente son idénticos a v1', async () => {
    const preparar = async () => {
      const s = new QuoteSession(sinGoogle());
      const { v } = await vehiculoGuardado();
      s.selectVehicle(v);
      recorridoManual(s);
      costos(s);
      return s;
    };
    const s1 = await preparar();
    const s2 = await preparar();
    carga(s2);
    // D-I1: el detalle no cambia el costo ni el precio sugerido.
    expect(s2.computation('habitual')!.measures).toEqual(s1.computation('habitual')!.measures);
    const precio = precioSugerido(s1);
    s1.setChosenPrice(precio);
    s2.setChosenPrice(precio);

    const a = await emitir(s1);
    const b = await emitir(s2, { cargoFlag: true });
    if (a.r.status !== 'guardada' || b.r.status !== 'guardada') throw new Error('no se guardó');
    expect(a.r.version).toBe(1);
    expect(b.r.version).toBe(2);
    expect(isSnapshotV2(b.r.job.internal)).toBe(true);
    if (!isSnapshotV2(b.r.job.internal)) return;
    expect(b.r.job.internal.cargo?.totals).toMatchObject({ lines: 2, weightKg: 75 + 12 * 12 });
    expect(b.r.job.internal.resources?.helpers).toHaveLength(1);
    expect(b.r.job.internal.costEstimate).toBe(a.r.job.internal.costEstimate);
    expect(b.r.job.internal.suggestedPrice).toBe(a.r.job.internal.suggestedPrice);

    const ca = loQueRecibeElCliente(a.r.job);
    const cb = loQueRecibeElCliente(b.r.job);
    expect(cb.q).toEqual(ca.q);
    expect(cb.wa).toBe(ca.wa);
    expect(cb.doc).toBe(ca.doc);
    for (const p of ['Refrigerador Interno', 'Cajas Internas', 'kg', 'm³']) expect(cb.todo).not.toContain(p);
  });

  it('en la vista de la cotización el detalle interno de la carga está FUERA de lo que se imprime (no-print)', async () => {
    const s = new QuoteSession(sinGoogle());
    recorridoManual(s);
    costos(s);
    s.setParams({ kmPerL: 10, wearPerKm: 40 });
    carga(s);
    s.setChosenPrice(precioSugerido(s));
    const { r, quotes } = await emitir(s, { cargoFlag: true });
    if (r.status !== 'guardada') throw new Error('no se guardó');
    const html = renderToStaticMarkup(createElement(QuoteView, { job: r.job, repository: quotes, onBack: () => undefined }));
    const i = html.indexOf('data-testid="detalle-carga-interno"');
    expect(i).toBeGreaterThan(-1);
    const abre = html.lastIndexOf('<div', i);
    expect(html.slice(abre, i)).toContain('no-print');
    // El documento que se imprime viene después y no repite el detalle.
    const docHtml = html.slice(html.indexOf('<article'));
    expect(docHtml).not.toContain('Refrigerador Interno');
    expect(docHtml).not.toContain('Solo para ti');
    // Los botones de PDF y WhatsApp están en la barra que no se imprime, y el enlace de WhatsApp es el del documento.
    expect(html).toContain('Descargar PDF');
    expect(html).toContain(whatsappUrl(toClientQuote(r.job)).replace(/&/g, '&amp;'));
  });
});

describe('Costo parcial: un vehículo sin rendimiento ni desgaste conocidos', () => {
  it('se cotiza igual, el costo queda como cota y nunca se reemplaza por cero; el cliente solo ve el precio', async () => {
    const s = new QuoteSession(sinGoogle());
    const { v } = await vehiculoGuardado(null, null);
    s.selectVehicle(v);
    recorridoManual(s);
    costos(s);
    expect(s.getSnapshot().params.kmPerL).toBeNull();
    expect(s.getSnapshot().params.wearPerKm).toBeNull();
    const c = s.computation('habitual')!;
    expect(c.measures.cost.type).toBe('cotaInferior');
    expect(c.measures.missing.length).toBeGreaterThan(0);
    s.setChosenPrice(90_000);
    expect(s.canQuote()).toBe(true);
    const { r } = await emitir(s);
    if (r.status !== 'guardada') throw new Error('no se guardó');
    expect(r.job.internal.costType).toBe('cotaInferior');
    expect(r.job.internal.missing).toEqual(c.measures.missing);
    expect(r.job.internal.vehicle).toMatchObject({ kmPerL: null, wearPerKm: null });
    const { wa, doc } = loQueRecibeElCliente(r.job);
    expect(wa).toContain('Precio total: $90.000');
    expect(doc).toContain('$90.000');
    expect(wa).not.toMatch(/parcial|cota|falta/i);
  });
});

describe('Puntos del flujo que deben BLOQUEAR la emisión (nunca una cotización incoherente)', () => {
  async function lista() {
    const s = new QuoteSession(sinGoogle());
    const { v } = await vehiculoGuardado();
    s.selectVehicle(v);
    recorridoManual(s);
    costos(s);
    s.setChosenPrice(precioSugerido(s));
    expect(s.canQuote()).toBe(true);
    return { s, v };
  }

  it('un tramo sin km: no hay cálculo ni cotización', async () => {
    const { s } = await lista();
    s.setLegOverride('habitual', 1, { km: null });
    expect(s.computation('habitual')).toBeNull();
    expect(s.canQuote()).toBe(false);
    expect(buildJobRecord(s, form, emisor, { id: 'x', number: 1, createdAt: '2026-11-24' })).toBeNull();
  });

  it('cambiar el vehículo después de fijar el precio exige confirmarlo antes de emitir', async () => {
    const { s, v } = await lista();
    s.selectVehicle({ ...v, id: 'otro', kmPerL: 6 });
    expect(s.priceNeedsConfirmation()).toBe(true);
    expect(buildJobRecord(s, form, emisor, { id: 'x', number: 1, createdAt: '2026-11-24' })).toBeNull();
    s.confirmPrice();
    expect(buildJobRecord(s, form, emisor, { id: 'x', number: 1, createdAt: '2026-11-24' })).not.toBeNull();
  });

  it('cambiar una dirección deja el recorrido desactualizado: no se cotiza con el anterior', async () => {
    const { s } = await lista();
    s.setInputs({ destination: 'Otra Calle Ficticia 9, Puente Alto' });
    expect(s.computation('habitual')).toBeNull();
    expect(s.canQuote()).toBe(false);
  });

  it('el margen y los recargos no cambian el costo: el precio ya fijado sigue válido', async () => {
    const { s } = await lista();
    s.setMargin(0.3);
    s.setSurcharges(5_000);
    expect(s.priceNeedsConfirmation()).toBe(false);
    expect(s.canQuote()).toBe(true);
  });
});

describe('Precios enteros: documento/PDF y WhatsApp coinciden exactamente', () => {
  it.each([0, 1, 999, 1_000, 60_000, 1_234_567, MAX_CLP])('precio %d', (precio) => {
    const job = {
      id: 'x',
      number: 7,
      createdAt: '2026-11-24',
      ...form,
      netPrice: precio,
      tax: null,
      status: 'borrador',
      payment: 'pendiente',
      issuer: emisor,
      waypoints: [],
      internal: { routeSource: 'declarado', km: 1, minutes: 1, costEstimate: 1, costType: 'estimado', suggestedPrice: 1, margin: 0.2, missing: [], engineVersion: 'x' },
    } satisfies JobRecord;
    const { doc, wa } = loQueRecibeElCliente(job);
    expect(doc).toContain(formatClp(precio));
    expect(wa).toContain(`Precio total: ${formatClp(precio)}`);
  });
});

describe('Enlace «Ver ruta en Google Maps» (sin API ni cupo)', () => {
  it('se arma solo con las direcciones escritas, en el orden Base → A → B → Base', async () => {
    const s = new QuoteSession(sinGoogle());
    recorridoManual(s);
    costos(s);
    s.setParams({ kmPerL: 10, wearPerKm: 40 });
    s.setChosenPrice(precioSugerido(s));
    const { r } = await emitir(s);
    if (r.status !== 'guardada') throw new Error('no se guardó');
    const url = new URL(googleMapsDirectionsUrl(r.job.waypoints)!);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('origin')).toBe('Base Ficticia 3, La Florida');
    expect(url.searchParams.get('waypoints')).toBe('Calle Ficticia 1, Ñuñoa|Pasaje Ficticio 2, Maipú');
    expect(url.searchParams.get('destination')).toBe('Base Ficticia 3, La Florida');
    expect(url.searchParams.has('key')).toBe(false);
  });
});
