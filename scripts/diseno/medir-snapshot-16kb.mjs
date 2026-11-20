/**
 * HERRAMIENTA DE DISEÑO (#45), no es una función de la aplicación. Versión 2 (corrige el P1-4 de
 * la auditoría de cba6ffb).
 *
 * Genera SQL que reproduce la restricción REAL de `jobs.internal` y prueba cada caso con un
 * INSERT independiente:
 *  - la restricción se COPIA LITERALMENTE de supabase/migrations/*_esquema_inicial.sql (si cambia,
 *    la medición cambia con ella);
 *  - cada caso es un bloque DO propio (transacción independiente en modo autocommit) que captura
 *    éxito o error y su SQLSTATE;
 *  - se mide el tamaño ANTES de almacenar: pg_column_size(literal::jsonb), que es lo que evalúa
 *    el CHECK. Lo almacenado puede quedar comprimido por TOAST y medir menos.
 *
 * Datos FICTICIOS con la forma del contrato de docs/21 §3–§6 (CargoItem sin id; capacity con
 * minTrips). No son valores de referencia del producto.
 *
 *   node scripts/diseno/medir-snapshot-16kb.mjs | psql -X -q -d <base local desechable>
 *   scripts/diseno/medir-16kb.sh   # crea la base, ejecuta y la elimina
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migDir = join(repo, 'supabase', 'migrations');
const inicial = readdirSync(migDir).find((f) => f.endsWith('_esquema_inicial.sql'));
const linea = readFileSync(join(migDir, inicial), 'utf8')
  .split('\n')
  .find((l) => /^\s*internal jsonb not null check/.test(l));
if (!linea) throw new Error('No se encontró la restricción de jobs.internal en la migración inicial');
const columnaInternal = linea.trim().replace(/,$/, '');

const objetos = [
  ['refrigerador', 'Refrigerador no frost dos puertas', 85, [70, 75, 185], 'pesado'],
  ['lavadora', 'Lavadora carga frontal', 70, [60, 60, 85], 'pesado'],
  ['otro', 'Cocina 4 platos con horno', 45, [55, 60, 90], 'normal'],
  ['sofa', 'Sofá de tres cuerpos', 60, [210, 90, 85], 'voluminoso'],
  ['cama', 'Base de cama 2 plazas', 40, [200, 150, 30], 'voluminoso'],
  ['otro', 'Colchón 2 plazas', 35, [200, 150, 25], 'voluminoso'],
  ['otro', 'Mesa de comedor de madera', 40, [160, 90, 76], 'voluminoso'],
  ['otro', 'Silla de comedor', 5, [45, 50, 90], 'normal'],
  ['cajas', 'Caja de cartón mediana con loza', 12, [50, 40, 40], 'normal'],
  ['cajas', 'Caja de cartón grande con ropa', 10, [60, 40, 50], 'normal'],
  ['otro', 'Ropero de dos puertas desarmable', 70, [120, 55, 200], 'requiere2'],
  ['otro', 'Televisor 55 pulgadas en su caja', 18, [135, 15, 85], 'normal'],
  ['otro', 'Escritorio con cajonera', 35, [120, 60, 75], 'normal'],
  ['otro', 'Bicicleta adulto', 14, [175, 60, 100], 'normal'],
  ['otro', 'Plantas en macetero', 8, [40, 40, 60], 'normal'],
];

/** CargoItem del contrato (docs/21 §3.1): sin id; la posición es el orden del arreglo. */
function items(n, { largo = false } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const [kind, desc, kg, [l, w, h], handling] = objetos[i % objetos.length];
    const description = largo ? `${desc} — detalle adicional`.padEnd(80, '.').slice(0, 80) : desc;
    return {
      kind,
      description,
      qty: kind === 'cajas' ? 6 : 1,
      unitWeightKg: kg,
      dimsCm: { l, w, h },
      // Misma regla que el CHECK de M3 (cm enteros → m³ con 3 decimales): l*w*h/1000 es entero.
      volumeM3: Math.round((l * w * h) / 1000) / 1000,
      volumeSource: 'calculado',
      fragile: desc.includes('loza') || desc.includes('Televisor'),
      handling,
    };
  });
}

function recursos({ largo = false } = {}) {
  const access = largo ? 'x'.repeat(120) : 'Estacionamiento a 30 m; avisar en conserjería';
  return {
    stops: [
      { role: 'A', floor: 4, elevator: 'noCabe', stairs: true, carryMeters: 30, access, loadMinutes: 90 },
      { role: 'B', floor: 2, elevator: 'si', stairs: false, carryMeters: 10, access, loadMinutes: 60 },
    ],
    helpers: [
      { id: randomUUID(), mode: 'servicio', feeService: 25000, ratePerHour: null, paidSegments: [], hours: null },
      { id: randomUUID(), mode: 'hora', feeService: null, ratePerHour: 6000, paidSegments: ['manipulacion', 'traslado'], hours: 4.5 },
      { id: randomUUID(), mode: 'hora', feeService: null, ratePerHour: 6000, paidSegments: ['manipulacion'], hours: 2.5 },
    ],
    equipment: [
      { label: 'Cajas de cartón (20 unidades)', amount: 24000 },
      { label: 'Film y cinta de embalaje', amount: 8000 },
      { label: 'Arriendo de carro de carga', amount: 10000 },
      { label: 'Mantas de protección', amount: null },
    ],
  };
}

function baseV1() {
  return {
    routeSource: 'simulado',
    km: 18.4,
    minutes: 42,
    costEstimate: 61234.567,
    costType: 'cotaInferior',
    suggestedPrice: 73000,
    margin: 0.15,
    missing: ['peajes', 'gastosFijos'],
    engineVersion: 'motor-1.0.1',
    vehicle: { id: randomUUID(), name: 'Camioneta de trabajo', type: 'camioneta', fuel: 'diesel', kmPerL: 10.5, wearPerKm: 80, adjusted: ['kmPerL'] },
  };
}

/**
 * Snapshot v2 (docs/21 §6.1). Con conLineas=true las líneas van dentro de internal (D-4 opción a);
 * con false, solo el resumen (opción b: las líneas van en job_cargo_items).
 */
function snapshotV2(lineas, { conLineas = true, largo = false } = {}) {
  const v1 = baseV1();
  const list = items(lineas, { largo });
  const cargo = {
    mode: lineas > 1 ? 'detallado' : 'rapido',
    summary: `Mudanza de ${lineas} objetos o grupos`,
    totals: { weightKg: 1234.5, volumeM3: 9.876, lines: lineas, linesWithWeight: lineas, linesWithVolume: lineas },
    capacity: { minTrips: 3, basis: 'peso', incomplete: false },
    handling: { minutes: 150, complete: true, missingStops: [] },
  };
  if (conLineas) cargo.items = list;
  return {
    ...v1,
    schemaVersion: 2,
    formulaVersion: 'motor-1.0.1',
    vehicle: {
      ...v1.vehicle,
      catalogId: randomUUID(),
      catalogDataVersion: '2026-12-01',
      make: 'Marca',
      model: 'Modelo',
      modelYear: 2022,
      version: 'Versión de prueba',
      payloadKg: 1000,
      cargoVolumeM3: 3.2,
    },
    cargo,
    resources: recursos({ largo }),
  };
}

// Resultado ESPERADO de cada caso: 'ACEPTADO' o el SQLSTATE del rechazo (23514 = check_violation).
// La medición termina con error (código ≠ 0) si algún caso no coincide (P2-3 de la reauditoría).
const casos = [
  ['v1 actual (sin inventario)', baseV1(), 'ACEPTADO'],
  ['(a) S1 un refrigerador', snapshotV2(1), 'ACEPTADO'],
  ['(a) S2 depto 1 dormitorio, 15 líneas', snapshotV2(15), 'ACEPTADO'],
  ['(a) S3 depto 3 dormitorios, 40 líneas', snapshotV2(40), 'ACEPTADO'],
  ['(a) S3b 45 líneas', snapshotV2(45), 'ACEPTADO'],
  ['(a) S4 casa grande, 80 líneas', snapshotV2(80), '23514'],
  ['(a) S5 extremo, 150 líneas y textos al máximo', snapshotV2(150, { largo: true }), '23514'],
  ['(a) S6 200 líneas (tope T-1)', snapshotV2(200), '23514'],
  ['(b) resumen de 80 líneas', snapshotV2(80, { conLineas: false }), 'ACEPTADO'],
  ['(b) resumen de 200 líneas, textos al máximo', snapshotV2(200, { conLineas: false, largo: true }), 'ACEPTADO'],
];

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const out = [];
out.push('\\set ON_ERROR_STOP 1');
out.push("select 'PostgreSQL ' || current_setting('server_version') as version;");
out.push(`create table medicion_jobs (id bigserial primary key, ${columnaInternal});`);
out.push('create table resultados (orden int, caso text, bytes_json int, bytes_jsonb_antes int, resultado text, sqlstate text, esperado text);');
casos.forEach(([nombre, obj, esperado], i) => {
  const json = JSON.stringify(obj);
  out.push(`do $$
declare v_pre int := pg_column_size(${q(json)}::jsonb);
begin
  begin
    insert into medicion_jobs (internal) values (${q(json)}::jsonb);
    insert into resultados values (${i}, ${q(nombre)}, ${Buffer.byteLength(json)}, v_pre, 'ACEPTADO', null, ${q(esperado)});
  exception when others then
    insert into resultados values (${i}, ${q(nombre)}, ${Buffer.byteLength(json)}, v_pre, 'RECHAZADO', sqlstate, ${q(esperado)});
  end;
end $$;`);
});
// Carga útil de la nueva función de guardado (no tiene el límite de 16 KB, solo como referencia).
out.push(`select 'p_cargo_items de 200 líneas: ' || pg_column_size(${q(JSON.stringify(items(200, { largo: true })))}::jsonb) || ' bytes' as referencia;`);
out.push(
  "select caso, bytes_json, bytes_jsonb_antes, round(100.0 * bytes_jsonb_antes / 16384, 1) as pct_limite, resultado, " +
    "coalesce(sqlstate, '') as sqlstate, esperado, " +
    "case when coalesce(sqlstate, 'ACEPTADO') = esperado then 'OK' else 'FALLA' end as verificacion " +
    'from resultados order by orden;',
);
out.push("select 'Restricción usada: ' || pg_get_constraintdef(oid) as restriccion from pg_constraint where conrelid = 'medicion_jobs'::regclass and contype = 'c';");
// Aserción final: cualquier diferencia con lo esperado aborta psql (ON_ERROR_STOP) y el script falla.
out.push(`do $$
declare v_fallas text;
begin
  select string_agg(caso || ' (esperado ' || esperado || ', obtenido ' || coalesce(sqlstate, 'ACEPTADO') || ')', '; ')
    into v_fallas from resultados where coalesce(sqlstate, 'ACEPTADO') <> esperado;
  if v_fallas is not null then
    raise exception 'FALLA medición 16 KB: %', v_fallas;
  end if;
  raise notice 'OK medición 16 KB: % casos con el resultado esperado', (select count(*) from resultados);
end $$;`);
console.log(out.join('\n'));
