/**
 * HERRAMIENTA DE DISEÑO (preparación de I-2, A-80). NO es una función de la aplicación.
 *
 * Arma cotizaciones con el CÓDIGO REAL del cliente (QuoteSession → buildJobRecord v1/v2 →
 * toCloudPayload → jobWithQuotePayload) y escribe:
 *   - casos.json: lo que el cliente mandaría a `create_job_with_quote_v2` en I-2, con lo esperado;
 *   - casos.sql: las llamadas, cada una en su transacción, como `authenticated` con la identidad
 *     del dueño (como la Data API), y el registro de resultados en `prueba_i2.resultados`.
 * Solo datos FICTICIOS. Se ejecuta desde probar-i2.sh contra un PostgreSQL LOCAL desechable.
 *
 *   npx vite-node scripts/diseno/i2/generar-casos.ts <carpeta-de-salida>
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobRecord } from '../../../src/shared/clientQuote';
import { MAX_CLOUD_INTERNAL_JSON_BYTES, toCloudPayload } from '../../../src/shared/snapshot';
import type { VehicleProfile } from '../../../src/shared/vehicle';
import { jobWithQuotePayload } from '../../../src/web/cloud/mappers';
import { buildJobRecord } from '../../../src/web/jobs';
import { addItem, newDraftItem, setDeclaredVolume, setMode, updateItem, type InventoryDraft } from '../../../src/web/modules/inventoryDraft';
import { addEquipment, addHelper, emptyResourcesDraft, setHelperMode, toggleSegment, updateEquipment, updateHelper, updateStop } from '../../../src/web/modules/resourcesDraft';
import { QuoteSession, type RouteClient } from '../../../src/web/session';

const salida = process.argv[2];
if (!salida) throw new Error('Uso: generar-casos.ts <carpeta-de-salida>');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const noRoutes: RouteClient = { requestRoute: async () => { throw new Error('sin red'); } };
const form = {
  clientName: 'Cliente ficticio', serviceDescription: 'Flete de prueba', includes: 'Carga y descarga', conditions: '',
  serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Maipú',
};
const issuer = { name: 'Fletes Ficticios', phone: '', email: '' };
const vehiculo: VehicleProfile = {
  id: 'f0000000-0000-4000-8000-000000000001', name: 'Furgón ficticio', type: 'furgon', fuel: 'diesel',
  kmPerL: 9.5, wearPerKm: 42, createdAt: '2026-11-24T00:00:00Z', updatedAt: '2026-11-24T00:00:00Z',
};

function sesion(): QuoteSession {
  const s = new QuoteSession(noRoutes);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.useManual('habitual');
  s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  s.selectVehicle(vehiculo);
  s.setParams({ fuelPricePerL: 1050, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 2, helperFee: 15000, loadMinutes: 60, tolls: 0 });
  s.setChosenPrice(95000);
  if (s.priceNeedsConfirmation()) s.confirmPrice();
  return s;
}

const HANDLING = ['normal', 'pesado', 'voluminoso', 'requiere2'] as const;
/** Inventario variado: medidas (volumen calculado), volumen declarado, solo peso, frágil, manejo. */
function inventario(n: number, largo = false): InventoryDraft {
  let inv = sesion().getSnapshot().cargo;
  for (let i = 0; i < n; i++) {
    const k = `k${i}`;
    const desc = largo ? `Línea ${i} ñandú «caja» con acentos áéíóú y texto largo para llegar al tope de 80`.slice(0, 80) : `Objeto ${i} ñ`;
    inv = addItem(inv, newDraftItem(k, { kind: i % 3 === 0 ? 'cajas' : 'mueble', label: desc }));
    const tipo = i % 4;
    if (tipo === 0) inv = updateItem(inv, k, { qty: (i % 7) + 1, unitWeightKg: 12.5, l: 50, w: 40, h: 40 });
    if (tipo === 1) inv = updateItem(inv, k, { unitWeightKg: 0.3 + i / 1000 });
    if (tipo === 2) { inv = updateItem(inv, k, { qty: 2 }); inv = setDeclaredVolume(inv, k, 1.25); }
    if (tipo === 3) inv = updateItem(inv, k, { unitWeightKg: 75, l: 70, w: 70, h: 180, fragile: true, handling: HANDLING[i % 4] });
  }
  return inv;
}

function recursosCompletos() {
  let r = updateStop(emptyResourcesDraft(), 'A', { floor: 4, elevator: 'no', stairs: true, carryMeters: 30, access: 'Portón con código', loadMinutes: 30 });
  r = updateStop(r, 'B', { floor: -1, elevator: 'si', loadMinutes: 20 });
  r = addHelper(r, '00000000-0000-4000-8000-0000000000a1');
  r = updateHelper(r, '00000000-0000-4000-8000-0000000000a1', { feeService: 15000 });
  r = addHelper(r, '00000000-0000-4000-8000-0000000000a2');
  r = setHelperMode(r, '00000000-0000-4000-8000-0000000000a2', 'hora');
  r = updateHelper(r, '00000000-0000-4000-8000-0000000000a2', { ratePerHour: 5000, hours: 2.5 });
  r = toggleSegment(r, '00000000-0000-4000-8000-0000000000a2', 'traslado');
  r = addEquipment(r, 'e1');
  r = updateEquipment(r, 'e1', { label: 'Carro de arrastre', amount: 3000 });
  return r;
}

/** Recursos en sus topes (20 ayudantes, 20 equipos, textos largos) para medir el tamaño del resumen. */
function recursosMaximos() {
  let r = updateStop(emptyResourcesDraft(), 'A', { floor: 60, elevator: 'noCabe', stairs: true, carryMeters: 1000, access: 'Á'.repeat(120), loadMinutes: 1440 });
  r = updateStop(r, 'B', { floor: -5, elevator: 'no', stairs: true, carryMeters: 999, access: 'ñ'.repeat(120), loadMinutes: 1440 });
  for (let i = 0; i < 20; i++) {
    const id = `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`;
    r = addHelper(r, id);
    r = setHelperMode(r, id, 'hora');
    r = updateHelper(r, id, { ratePerHour: 9999, hours: 24 });
    for (const seg of ['manipulacion', 'traslado'] as const) r = toggleSegment(r, id, seg);
    r = addEquipment(r, `e${i}`);
    r = updateEquipment(r, `e${i}`, { label: `Equipo ${i} `.padEnd(60, 'é'), amount: 9_999_999 });
  }
  return r;
}

interface Caso {
  caso: string;
  descripcion: string;
  dueno: string;
  intentos: number;
  version: 1 | 2;
  local: JobRecord;
  cliente: { ok: true; bytes: number; lineas: number } | { ok: false; motivo: string };
  payload?: { p_job: unknown; p_quote: unknown; p_cargo_items: unknown };
}

let n = 0;
const meta = () => { n += 1; return { id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, number: n, createdAt: '2026-11-24' }; };

function caso(nombre: string, descripcion: string, s: QuoteSession, opts: { version: 1 | 2; dueno?: string; importar?: { issued: number }; intentos?: number }): Caso {
  const m = meta();
  const local = buildJobRecord(s, form, issuer, m, { version: opts.version });
  if (!local) throw new Error(`${nombre}: el cliente no emitió la cotización`);
  if (opts.importar) local.issuedNumber = opts.importar.issued;
  const c = toCloudPayload(local.internal);
  const base = { caso: nombre, descripcion, dueno: opts.dueno ?? A, intentos: opts.intentos ?? 1, version: opts.version, local };
  if (!c.ok) return { ...base, cliente: { ok: false, motivo: c.reason } };
  const job: JobRecord = { ...local, internal: c.internal };
  const { p_job, p_quote } = jobWithQuotePayload(job, opts.importar ? local.id : null);
  const bytes = new TextEncoder().encode(JSON.stringify(c.internal)).length;
  return { ...base, cliente: { ok: true, bytes, lineas: c.cargoItems.length }, payload: { p_job, p_quote, p_cargo_items: c.cargoItems } };
}

const conCarga = (inv: InventoryDraft, rec = recursosCompletos()) => { const s = sesion(); s.setCargo(inv); s.setResources(rec); return s; };
const soloRecursos = () => { const s = sesion(); s.setResources(recursosCompletos()); return s; };
const rapido = () => { const s = sesion(); let inv = setMode(s.getSnapshot().cargo, 'rapido'); inv = { ...inv, summary: 'Mudanza de 1 dormitorio, ~15 cajas' }; s.setCargo(inv); return s; };

const casos: Caso[] = [
  caso('I2-v2-carga', 'v2 con 6 líneas variadas y recursos completos', conCarga(inventario(6)), { version: 2 }),
  caso('I2-v2-sin-carga', 'v2 solo con recursos: cargo null, sin líneas', soloRecursos(), { version: 2 }),
  caso('I2-v2-rapido', 'v2 en modo «Rápido» (resumen sin líneas)', rapido(), { version: 2 }),
  caso('I2-v1', 'v1 (flag apagada o cuenta antigua) enviada por la v2 sin líneas', sesion(), { version: 1, dueno: B }),
  caso('I2-v2-200', 'v2 con 200 líneas de 80 caracteres (tope del cliente)', conCarga(inventario(200, true)), { version: 2 }),
  caso('I2-importar-v2', 'copia de una v2 LOCAL a la cuenta (local_id, N° emitido 900), dos veces', conCarga(inventario(3)), { version: 2, importar: { issued: 900 }, intentos: 2 }),
  caso('I2-v2-maximo', 'v2 con recursos en sus topes y 200 líneas largas: el cliente decide si cabe', conCarga(inventario(200, true), recursosMaximos()), { version: 2 }),
];

const lit = (tag: string, v: unknown) => `$${tag}$${JSON.stringify(v)}$${tag}$::jsonb`;
const sql: string[] = [
  '-- Generado por generar-casos.ts (A-80). Cada guardado en su propia transacción, como authenticated.',
  'create schema if not exists prueba_i2;',
  'create table prueba_i2.resultados (caso text, intento int, resultado jsonb, error text);',
  'grant usage on schema prueba_i2 to authenticated; grant insert on prueba_i2.resultados to authenticated;',
];
for (const c of casos) {
  if (!c.payload) continue;
  for (let i = 1; i <= c.intentos; i++) {
    sql.push(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${c.dueno}', true);
insert into prueba_i2.resultados (caso, intento, resultado)
  select '${c.caso}', ${i}, public.create_job_with_quote_v2(${lit('J', c.payload.p_job)}, ${lit('Q', c.payload.p_quote)}, ${lit('I', c.payload.p_cargo_items)});
commit;`);
  }
}
writeFileSync(join(salida, 'casos.json'), JSON.stringify({ maxClienteBytes: MAX_CLOUD_INTERNAL_JSON_BYTES, casos }, null, 1));
writeFileSync(join(salida, 'casos.sql'), sql.join('\n') + '\n');
for (const c of casos) {
  console.log(`  ${c.caso}: cliente ${c.cliente.ok ? `envía (${c.cliente.bytes} bytes de resumen, ${c.cliente.lineas} líneas)` : `NO envía: ${c.cliente.motivo}`}`);
}
