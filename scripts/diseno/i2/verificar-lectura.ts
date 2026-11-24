/**
 * HERRAMIENTA DE DISEÑO (preparación de I-2, A-80). Lee lo que guardó create_job_with_quote_v2 en la
 * base LOCAL y lo compara, campo por campo, con lo que armó el cliente (casos.json), usando el código
 * REAL del cliente: jobFromRow, readSnapshot, clientQuoteFromRow, toClientQuote.
 *
 * `lineaDesdeFila` es la conversión fila → CargoItem que I-2 tendrá que agregar al cliente (hoy no
 * existe porque el cliente no lee `job_cargo_items`). Se prueba aquí para fijar el contrato.
 *
 *   npx vite-node scripts/diseno/i2/verificar-lectura.ts <casos.json> <filas.json>
 */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { cargoItemSchema, cargoTotalsIssue, type CargoItem } from '../../../src/shared/cargo';
import { toClientQuote, type JobRecord } from '../../../src/shared/clientQuote';
import { readSnapshot, snapshotV2Schema } from '../../../src/shared/snapshot';
import { clientQuoteFromRow, jobFromRow, type ClientQuoteRow, type JobRow } from '../../../src/web/cloud/mappers';

interface Caso {
  caso: string; descripcion: string; intentos: number; version: 1 | 2; local: JobRecord;
  cliente: { ok: boolean; bytes?: number; lineas?: number; motivo?: string };
  payload?: { p_job: { internal: unknown }; p_quote: unknown; p_cargo_items: CargoItem[] };
}
interface Fila {
  caso: string; intento: number; resultado: { id: string; number: number; issued_number: number } | null;
  job: JobRow | null; quote: ClientQuoteRow | null; internalBytes: number | null; items: Record<string, unknown>[]; lineasDelTrabajo: number;
}

const [casosPath, filasPath] = process.argv.slice(2);
const { maxClienteBytes, casos } = JSON.parse(readFileSync(casosPath!, 'utf8')) as { maxClienteBytes: number; casos: Caso[] };
const filas = JSON.parse(readFileSync(filasPath!, 'utf8')) as Fila[];

let ok = 0;
let fallas = 0;
function check(nombre: string, cond: boolean, detalle = '') {
  if (cond) { ok += 1; console.log(`OK ${nombre}`); } else { fallas += 1; console.log(`FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
}
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Fila de job_cargo_items → CargoItem (propuesta para I-2: `cargoItemFromRow` en cloud/mappers.ts). */
function lineaDesdeFila(r: Record<string, unknown>): CargoItem {
  const dims = r.dim_l_cm === null ? null : { l: num(r.dim_l_cm)!, w: num(r.dim_w_cm)!, h: num(r.dim_h_cm)! };
  return cargoItemSchema.parse({
    kind: r.kind, description: r.description, qty: num(r.qty), unitWeightKg: num(r.unit_weight_kg), dimsCm: dims,
    volumeM3: num(r.volume_m3), volumeSource: r.volume_source, fragile: r.fragile, handling: r.handling,
  });
}

for (const c of casos) {
  const mias = filas.filter((f) => f.caso === c.caso);
  if (!c.cliente.ok || !c.payload) {
    check(`${c.caso} el cliente no envía (${c.cliente.motivo}) y nada llega al servidor`, mias.length === 0);
    continue;
  }
  const primera = mias.find((f) => f.intento === 1);
  check(`${c.caso} guardado (${c.descripcion})`, !!primera?.resultado && !!primera.job, JSON.stringify(primera?.resultado));
  if (!primera?.job || !primera.quote) continue;

  // Resumen interno: idéntico a lo enviado (v1 idéntico al de hoy: L1).
  const enviado = c.payload.p_job.internal;
  check(`${c.caso} internal guardado idéntico al enviado`, isDeepStrictEqual(primera.job.internal, enviado));
  const leido = readSnapshot(jobFromRow(primera.job).internal);
  check(`${c.caso} readSnapshot lo lee como v${c.version}`, leido.ok && leido.sourceVersion === c.version, leido.ok ? '' : leido.reason);
  check(`${c.caso} tamaño: cliente ${c.cliente.bytes} B de JSON (tope ${maxClienteBytes}) → jsonb sin comprimir ${primera.internalBytes} B (tope del CHECK 16384)`,
    (c.cliente.bytes ?? 0) <= maxClienteBytes && (primera.internalBytes ?? Infinity) <= 16384);

  // Líneas: misma cantidad, mismo orden y mismo contenido que el cliente.
  const lineas = primera.items.map(lineaDesdeFila);
  check(`${c.caso} ${lineas.length} líneas leídas = ${c.payload.p_cargo_items.length} enviadas, en el mismo orden y con el mismo contenido`,
    isDeepStrictEqual(lineas, c.payload.p_cargo_items));

  // Reconstrucción del snapshot LOCAL completo (lo que I-2 mostrará y recuperará desde la cuenta).
  if (c.version === 2) {
    const nube = primera.job.internal as { cargo: Record<string, unknown> | null };
    const reconstruido = { ...nube, cargo: nube.cargo === null ? null : { ...nube.cargo, items: lineas } };
    const parsed = snapshotV2Schema.safeParse(reconstruido);
    check(`${c.caso} snapshot v2 reconstruido = el del navegador (schema y totales coherentes)`,
      parsed.success && isDeepStrictEqual(parsed.data, c.local.internal)
        && (parsed.data.cargo === null || cargoTotalsIssue(parsed.data.cargo.items ?? [], parsed.data.cargo.totals) === null));
  }

  // Documento del cliente: igual al de hoy, sin inventario ni costos internos (D-I7, lista blanca).
  const esperado = toClientQuote({ ...c.local, number: primera.resultado!.number, issuedNumber: c.local.issuedNumber });
  const doc = clientQuoteFromRow(primera.quote);
  check(`${c.caso} cotización del cliente = toClientQuote (sin inventario ni costos)`,
    isDeepStrictEqual({ ...doc, number: esperado.number }, esperado) && !JSON.stringify(primera.quote).includes('items'),
    JSON.stringify({ doc, esperado }));

  if (c.intentos > 1) {
    const segunda = mias.find((f) => f.intento === 2);
    check(`${c.caso} segunda copia: NULL, sin duplicar líneas (${primera.lineasDelTrabajo} en el trabajo) y N° emitido ${primera.resultado!.issued_number} conservado`,
      segunda !== undefined && segunda.resultado === null && primera.lineasDelTrabajo === c.payload.p_cargo_items.length
        && primera.resultado!.issued_number === c.local.issuedNumber);
  }
}

console.log(`\nResultado: ${ok} correctas, ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
