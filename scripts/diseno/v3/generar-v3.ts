/**
 * HERRAMIENTA DE ENSAYO (A-88, Frente A). NO es una función de la aplicación.
 *
 * Arma cotizaciones v3 con el CÓDIGO REAL del cliente (QuoteSession → buildJobRecord v3 →
 * toCloudPayload → jobWithQuotePayload) y escribe `casos.sql`: cada guardado con
 * `create_job_with_quote` (el RPC que ya existe en staging), en su transacción, como `authenticated`,
 * y lo esperado en `prueba_v3.esperado` para compararlo dentro de la base. Solo datos FICTICIOS.
 *
 *   npx vite-node scripts/diseno/v3/generar-v3.ts <carpeta-de-salida>
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobRecord } from '../../../src/shared/clientQuote';
import { MAX_MISSING_CHARS, MAX_MISSING_ITEMS, PARAMETROS_ECONOMICOS, toCloudPayload, UNIDADES_PARAMETRO, type SnapshotV3 } from '../../../src/shared/snapshot';
import type { VehicleProfile } from '../../../src/shared/vehicle';
import { jobWithQuotePayload } from '../../../src/web/cloud/mappers';
import { buildJobRecord } from '../../../src/web/jobs';
import { QuoteSession, type RouteClient } from '../../../src/web/session';

const salida = process.argv[2];
if (!salida) throw new Error('Uso: generar-v3.ts <carpeta-de-salida>');

const DUENO = '00000000-0000-0000-0000-00000000000a';
const form = { clientName: 'Cliente ficticio', serviceDescription: 'Flete de prueba', includes: 'Carga', conditions: '', serviceDate: '', validUntil: '', originLabel: 'Ñuñoa', destinationLabel: 'Maipú' };
const issuer = { name: 'Fletes Ficticios', phone: '', email: '' };
const vehiculo: VehicleProfile = { id: 'f0000000-0000-4000-8000-000000000001', name: 'Furgón ficticio', type: 'furgon', fuel: 'diesel', kmPerL: 9.5, wearPerKm: 42, createdAt: '2026-11-24T00:00:00Z', updatedAt: '2026-11-24T00:00:00Z' };
const sinRed: RouteClient = { requestRoute: async () => { throw new Error('sin red'); } };
const simulada: RouteClient = {
  requestRoute: async (input) => ({
    status: 'ok', quota: null,
    route: { kind: input.kind, source: 'simulado', legs: [{ from: 'A', to: 'B', distanceM: 25_000, durationS: 2_400 }], totalDistanceM: 25_000, totalDurationS: 2_400, warnings: [], computedAt: '2026-11-26T00:00:00Z', retention: { distance: 'sesion', duration: 'sesion' } },
  }),
};

let n = 0;
function emitir(s: QuoteSession): JobRecord {
  n += 1;
  if (s.priceNeedsConfirmation()) s.confirmPrice();
  const job = buildJobRecord(s, form, issuer, { id: `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`, number: n, createdAt: '2026-11-26' }, { version: 3 });
  if (!job) throw new Error('no se pudo emitir');
  return job;
}
function manual(): QuoteSession {
  const s = new QuoteSession(sinRed);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  s.useManual('habitual');
  s.setLegOverride('habitual', 0, { km: 25, minutes: 40 });
  return s;
}

const casos: Array<{ caso: string; job: JobRecord }> = [];
{
  const s = manual();
  s.selectVehicle(vehiculo);
  s.setParams({ fuelPricePerL: 1290, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 1, helperFee: 15000, loadMinutes: 60, tolls: 2500 });
  s.setChosenPrice(95000);
  casos.push({ caso: 'v3-manual-vehiculo', job: emitir(s) });
}
{
  const s = manual();
  s.setParams({ fuelPricePerL: 1050, kmPerL: 12, wearPerKm: 31, fixedPerHour: 1500, ownerPerHour: 6000, helpers: 1, helperFee: 15000, loadMinutes: 60, tolls: 4200, otherCosts: 0 }, 'ejemplo');
  s.setChosenPrice(80000);
  casos.push({ caso: 'v3-ejemplo-simulado', job: emitir(s) });
}
{
  const s = manual();
  s.setParams({ fuelPricePerL: 1290 });
  s.setChosenPrice(40000);
  casos.push({ caso: 'v3-con-faltantes', job: emitir(s) });
}
{
  const s = new QuoteSession(simulada);
  s.setInputs({ origin: 'Calle Ficticia 1, Ñuñoa', destination: 'Pasaje Ficticio 2, Maipú' });
  await s.calculateRoute();
  s.setParams({ fuelPricePerL: 1290, kmPerL: 11, wearPerKm: 35 });
  s.setChosenPrice(60000);
  casos.push({ caso: 'v3-ruta-simulada', job: emitir(s) });
}
{
  // La v3 más grande que acepta el esquema (todos los textos al tope, con caracteres de 2 bytes).
  const base = casos[0]!.job;
  const b = base.internal as SnapshotV3;
  const largo = (k: number) => 'ñ'.repeat(k);
  const proc = { clase: 'comprobado' as const, fuente: { tipo: 'comprobante' as const, detalle: largo(60) }, fecha: '2026-11-26', vigenteDesde: '2026-11-01', vigenteHasta: '2026-11-30', version: largo(20) };
  const num = 123456789.123456789;
  const internal: SnapshotV3 = {
    ...b,
    engineVersion: largo(40),
    formulaVersion: largo(40),
    missing: Array.from({ length: MAX_MISSING_ITEMS }, () => largo(MAX_MISSING_CHARS)),
    vehicle: { id: largo(36), name: largo(40), type: 'camionLiviano', fuel: 'diesel', kmPerL: num, wearPerKm: num, adjusted: ['kmPerL', 'wearPerKm'], catalogId: largo(40), catalogDataVersion: largo(40), make: largo(60), model: largo(60), modelYear: 2026, version: largo(80), payloadKg: 49999.5, cargoVolumeM3: 199.5 },
    economia: {
      ...b.economia,
      parametros: Object.fromEntries(PARAMETROS_ECONOMICOS.map((k) => [k, { valor: num, unidad: UNIDADES_PARAMETRO[k], procedencia: proc }])) as SnapshotV3['economia']['parametros'],
      recorrido: { km: proc, minutos: proc },
      margen: { valor: b.margin, unidad: 'fraccion', procedencia: proc },
      recargos: { valor: num, unidad: 'CLP', procedencia: proc },
      partidas: Array.from({ length: 10 }, () => ({ id: largo(20), categoria: 'remuneracion' as const, monto: num })),
      versiones: { motor: largo(40), formulas: largo(40), datos: { combustible: largo(20), catalogo: largo(20), peajes: largo(20) } },
    },
  };
  casos.push({ caso: 'v3-maxima', job: { ...base, id: 'e0000000-0000-4000-8000-000000000099', number: 99, internal } });
}

const lit = (tag: string, v: unknown) => `$${tag}$${JSON.stringify(v)}$${tag}$::jsonb`;
const sql: string[] = [
  '-- Generado por generar-v3.ts (A-88). Cada guardado en su propia transacción, como authenticated.',
  'create schema if not exists prueba_v3;',
  'create table prueba_v3.esperado (caso text primary key, internal jsonb, bytes_cliente int);',
  'create table prueba_v3.resultados (caso text, resultado jsonb);',
  'grant usage on schema prueba_v3 to authenticated; grant insert on prueba_v3.resultados to authenticated;',
];
for (const c of casos) {
  const p = toCloudPayload(c.job.internal);
  if (!p.ok) throw new Error(`${c.caso}: el cliente no lo enviaría: ${p.reason}`);
  const payload = jobWithQuotePayload({ ...c.job, internal: p.internal as JobRecord['internal'] }, null);
  const bytes = new TextEncoder().encode(JSON.stringify(p.internal)).length;
  sql.push(`insert into prueba_v3.esperado values ('${c.caso}', ${lit('E', p.internal)}, ${bytes});`);
  sql.push(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${DUENO}', true);
insert into prueba_v3.resultados select '${c.caso}', public.create_job_with_quote(${lit('J', payload.p_job)}, ${lit('Q', payload.p_quote)});
commit;`);
  console.log(`  ${c.caso}: ${bytes} bytes de JSON en el cliente`);
}
writeFileSync(join(salida, 'casos.sql'), sql.join('\n') + '\n');
