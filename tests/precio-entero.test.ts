/**
 * A-81 (H1): el precio final de una cotización NUEVA es en pesos chilenos enteros.
 * - Un precio con decimales se RECHAZA con un error claro y bloquea la emisión; nunca se redondea solo.
 * - Los costos internos y los cálculos siguen admitiendo decimales.
 * - El documento/PDF, el enlace público, WhatsApp y el historial muestran EL MISMO precio.
 * - Los registros históricos con decimales se conservan sin cambios y se muestran igual en todos los
 *   canales (caso legado explícito), con un aviso solo para el dueño.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  esPrecioLegado,
  formatPrecioCliente,
  PRECIO_LEGADO_AVISO,
  toClientQuote,
  whatsappText,
  whatsappUrl,
  type JobRecord,
} from '../src/shared/clientQuote';
import { Calculator } from '../src/web/components/Calculator';
import { History } from '../src/web/components/History';
import { QuoteDocument, QuoteView } from '../src/web/components/QuoteView';
import { DRAFT_KEY, DraftStore } from '../src/web/draftStore';
import { parseAmount } from '../src/web/format';
import { buildJobRecord } from '../src/web/jobs';
import { PRICE_INTEGER_MESSAGE, PRICE_LIMIT, limitIssue } from '../src/web/numericLimits';
import { QuoteSession, type RouteClient } from '../src/web/session';
import { createQuoteRepository } from '../src/web/storage';
import { MemoryKeyValueStore } from '../src/web/vehicleRepository';

const noRoutes: RouteClient = { requestRoute: vi.fn(async () => { throw new Error('sin red'); }) };
const form = {
  clientName: 'Cliente ficticio', serviceDescription: 'Flete', includes: 'Carga y descarga', conditions: '',
  serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Maipú',
};
const issuer = { name: 'Fletes Prueba', phone: '+56 9 0000 0000', email: '' };
const meta = { id: '00000000-0000-4000-8000-000000000081', number: 1, createdAt: '2026-11-24' };

function lista(precio: number): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.useManual('habitual');
  s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  s.setParams({ fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 1, helperFee: 15000, loadMinutes: 60, tolls: 0, otherCosts: 0 });
  s.setChosenPrice(precio);
  if (s.priceNeedsConfirmation()) s.confirmPrice();
  return s;
}
const renderCalc = (s: QuoteSession) =>
  renderToStaticMarkup(createElement(Calculator, { session: s, vehicles: [], onManageVehicles: () => undefined, onCreateQuote: () => undefined }));

/** Registro histórico guardado ANTES de la regla (precio con decimales): no se construye, se lee tal cual. */
function historico(netPrice: number): JobRecord {
  const r = buildJobRecord(lista(87000), form, issuer, meta)!;
  return { ...r, netPrice };
}

describe('A-81 · precio final nuevo en pesos enteros', () => {
  it('87.000,5 se rechaza con un mensaje claro, bloquea la emisión y NO se redondea', () => {
    expect(parseAmount('87000,5')).toBe(87000.5); // lo escrito llega tal cual: sin redondeo al leer
    const s = lista(87000.5);
    expect(s.getSnapshot().chosenPrice).toBe(87000.5);
    expect(s.numericIssues().chosenPrice).toBe(PRICE_INTEGER_MESSAGE);
    expect(s.quoteBlockers()).toEqual(['chosenPrice']);
    expect(s.canQuote()).toBe(false);
    expect(buildJobRecord(s, form, issuer, meta)).toBeNull();
    const html = renderCalc(s);
    expect(html).toContain(PRICE_INTEGER_MESSAGE);
    expect(html).toContain('value="87.000,5"'); // el campo conserva lo escrito
    expect(html).not.toContain('87.001');
  });

  it('el costo y el precio sugerido se siguen calculando con un precio inválido (solo se bloquea emitir)', () => {
    const s = lista(87000.5);
    expect(s.computation('habitual')).not.toBeNull();
  });

  it('corregir a 87.000 quita el error y la cotización se emite con 87.000 exactos', () => {
    const s = lista(87000.5);
    s.setChosenPrice(87000);
    if (s.priceNeedsConfirmation()) s.confirmPrice();
    expect(s.numericIssues().chosenPrice).toBeUndefined();
    expect(buildJobRecord(s, form, issuer, meta)!.netPrice).toBe(87000);
  });

  it('otros valores fraccionarios también se rechazan (0,01 · 1,5 · 9.999.999.998,9); 0 y el tope entero se aceptan', () => {
    for (const v of [0.01, 1.5, 9_999_999_998.9]) expect(limitIssue(v, PRICE_LIMIT), String(v)).toBe(PRICE_INTEGER_MESSAGE);
    for (const v of [0, 1, 87000, 9_999_999_999]) expect(limitIssue(v, PRICE_LIMIT), String(v)).toBeNull();
  });

  it('los costos internos admiten decimales: combustible, desgaste, ayudantes, peajes, recargos y margen', () => {
    const s = lista(87000);
    s.setParams({ fuelPricePerL: 1050.5, kmPerL: 11.7, wearPerKm: 31.25, fixedPerHour: 1500.75, helperFee: 15000.5, tolls: 4200.5, otherCosts: 0.5 });
    s.setSurcharges(1500.5);
    s.setMargin(0.125);
    if (s.priceNeedsConfirmation()) s.confirmPrice();
    expect(s.numericIssues()).toEqual({});
    expect(s.canQuote()).toBe(true);
    expect(buildJobRecord(s, form, issuer, meta)!.netPrice).toBe(87000);
  });

  it('defensa en profundidad: buildJobRecord no emite un precio con decimales aunque la validación del campo fallara', () => {
    const real = lista(87000);
    const engañada = Object.create(real) as QuoteSession;
    engañada.getSnapshot = () => ({ ...real.getSnapshot(), chosenPrice: 87000.5 });
    engañada.quoteBlockers = () => [];
    engañada.priceNeedsConfirmation = () => false;
    expect(buildJobRecord(engañada, form, issuer, meta)).toBeNull();
  });

  it('un borrador nunca devuelve el precio (D-I8): un 87.000,5 escrito no reaparece al recuperar', () => {
    const s = lista(87000.5);
    const store = new MemoryKeyValueStore();
    new DraftStore(store).write('local', s.draftData());
    expect(JSON.parse(store.getItem(DRAFT_KEY)!).local.data).not.toHaveProperty('chosenPrice');
    const r = new DraftStore(store).read('local');
    const nueva = new QuoteSession(noRoutes);
    if (r.status === 'ok') nueva.restoreDraft(r.draft.data);
    expect(nueva.getSnapshot().chosenPrice).toBeNull();
    expect(nueva.canQuote()).toBe(false);
  });
});

describe('A-81 · mismo precio en PDF, enlace público, WhatsApp e historial', () => {
  const canales = (job: JobRecord) => {
    const q = toClientQuote(job);
    const doc = renderToStaticMarkup(createElement(QuoteDocument, { q })); // PDF y enlace público (PublicQuote usa QuoteDocument)
    const texto = whatsappText(q);
    const enlace = decodeURIComponent(whatsappUrl(q).split('text=')[1] ?? '');
    return { q, doc, texto, enlace };
  };

  for (const [nombre, precio, esperado] of [
    ['entero', 87000, '$87.000'],
    ['cero', 0, '$0'],
    ['tope', 9_999_999_999, '$9.999.999.999'],
  ] as const) {
    it(`precio ${nombre}: «${esperado}» idéntico en documento, WhatsApp y enlace wa.me`, () => {
      const job = historico(precio);
      const { doc, texto, enlace } = canales(job);
      expect(formatPrecioCliente(precio)).toBe(esperado);
      expect(doc).toContain(`<span class="num">${esperado}</span>`);
      expect(texto).toContain(`Precio total: ${esperado}`);
      expect(enlace).toBe(texto);
    });
  }

  it('registro HISTÓRICO con 87.000,5: se conserva y se muestra «$87.000,5» en todos los canales (nunca $87.001)', () => {
    const job = historico(87000.5);
    const { q, doc, texto, enlace } = canales(job);
    expect(q.netPrice).toBe(87000.5); // no se reescribe
    expect(esPrecioLegado(job.netPrice)).toBe(true);
    expect(doc).toContain('<span class="num">$87.000,5</span>');
    expect(texto).toContain('Precio total: $87.000,5');
    expect(enlace).toBe(texto);
    for (const t of [doc, texto]) expect(t).not.toContain('87.001');
    expect(doc).not.toContain(PRECIO_LEGADO_AVISO); // el documento del cliente no lleva el aviso interno
  });

  it('el dueño ve el aviso de precio histórico (fuera de la impresión); una cotización entera no lo muestra', async () => {
    const repo = createQuoteRepository(new MemoryKeyValueStore());
    const vista = (job: JobRecord) => renderToStaticMarkup(createElement(QuoteView, { job, repository: repo, onBack: () => undefined }));
    const legado = vista(historico(87000.5));
    expect(legado).toContain('data-testid="precio-legado"');
    expect(legado).toMatch(/class="notice no-print" data-testid="precio-legado"/);
    expect(legado).toContain('$87.000,5');
    expect(vista(historico(87000))).not.toContain('precio-legado');
  });

  it('historial: el registro con decimales se guarda y se lee sin cambios, y la fila muestra el mismo texto que el documento', async () => {
    const repo = createQuoteRepository(new MemoryKeyValueStore());
    await repo.create(historico(87000.5));
    const [leido] = await repo.list();
    expect(leido!.netPrice).toBe(87000.5);
    // La fila del historial usa el MISMO formateador que el documento y WhatsApp.
    const fuente = (await import('node:fs')).readFileSync(new URL('../src/web/components/History.tsx', import.meta.url), 'utf8');
    expect(fuente).toContain('formatPrecioCliente(job.netPrice)');
    expect(fuente).not.toMatch(/formatClp\(job\.netPrice\)/);
    void History;
  });
});
