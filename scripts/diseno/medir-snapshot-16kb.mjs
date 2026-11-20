/**
 * HERRAMIENTA DE DISEÑO (#45), no es una función de la aplicación.
 *
 * Genera snapshots `jobs.internal` con la forma propuesta para la versión 2 (docs/21 §4) y casos
 * de mudanza realistas, para medir su tamaño frente a la restricción de staging
 * `pg_column_size(internal) <= 16384`.
 *
 * Todos los objetos, pesos y medidas son FICTICIOS: solo sirven para medir bytes. No son valores
 * de referencia del producto ni se cargan en ningún lugar.
 *
 *   node scripts/diseno/medir-snapshot-16kb.mjs > casos.sql   # SQL con un INSERT por caso
 *   psql ... -f casos.sql                                     # mide con pg_column_size(jsonb)
 *
 * Sin argumentos imprime SQL; con --json imprime el tamaño UTF-8 de cada caso en JSON.
 */
import { randomUUID } from 'node:crypto';

const objetos = [
  ['refrigerador', 'Refrigerador no frost dos puertas', 85, [70, 75, 185], 'pesado'],
  ['lavadora', 'Lavadora carga frontal', 70, [60, 60, 85], 'pesado'],
  ['cocina', 'Cocina 4 platos con horno', 45, [55, 60, 90], 'normal'],
  ['sofa', 'Sofá de tres cuerpos', 60, [210, 90, 85], 'voluminoso'],
  ['cama', 'Base de cama 2 plazas', 40, [200, 150, 30], 'voluminoso'],
  ['colchon', 'Colchón 2 plazas', 35, [200, 150, 25], 'voluminoso'],
  ['mesa', 'Mesa de comedor de madera', 40, [160, 90, 76], 'voluminoso'],
  ['silla', 'Silla de comedor', 5, [45, 50, 90], 'normal'],
  ['cajas', 'Caja de cartón mediana con loza', 12, [50, 40, 40], 'normal'],
  ['cajas', 'Caja de cartón grande con ropa', 10, [60, 40, 50], 'normal'],
  ['ropero', 'Ropero de dos puertas desarmable', 70, [120, 55, 200], 'requiere2'],
  ['televisor', 'Televisor 55 pulgadas en su caja', 18, [135, 15, 85], 'normal'],
  ['escritorio', 'Escritorio con cajonera', 35, [120, 60, 75], 'normal'],
  ['bicicleta', 'Bicicleta adulto', 14, [175, 60, 100], 'normal'],
  ['otro', 'Plantas en macetero', 8, [40, 40, 60], 'normal'],
];

/** Construye `n` líneas de inventario ficticias. `largo` fuerza descripciones de 80 caracteres. */
function items(n, { conId = true, largo = false } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const [kind, desc, kg, [l, w, h], handling] = objetos[i % objetos.length];
    const description = largo ? `${desc} — detalle adicional del cliente`.padEnd(80, '.').slice(0, 80) : desc;
    const item = {
      kind,
      description,
      qty: kind === 'cajas' ? 6 : kind === 'silla' ? 4 : 1,
      unitWeightKg: kg,
      dimsCm: { l, w, h },
      volumeM3: Math.round(((l * w * h) / 1e6) * 1000) / 1000,
      volumeSource: 'calculado',
      fragile: kind === 'televisor' || desc.includes('loza'),
      handling,
    };
    return conId ? { id: randomUUID(), ...item } : item;
  });
}

function recursos({ largo = false } = {}) {
  const acceso = largo ? 'x'.repeat(120) : 'Estacionamiento a 30 m, conserjería exige aviso';
  return {
    stops: [
      { role: 'A', floor: 4, elevator: 'noCabe', stairs: true, carryMeters: 30, access: acceso, loadMinutes: 90 },
      { role: 'B', floor: 2, elevator: 'si', stairs: false, carryMeters: 10, access: acceso, loadMinutes: 60 },
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

/** Snapshot v1 actual (src/web/jobs.ts), como base. */
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

/** Snapshot v2 propuesto (docs/21 §4). */
function snapshotV2(lineas, opts = {}) {
  const v1 = baseV1();
  const list = items(lineas, opts);
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
    cargo: {
      mode: lineas > 1 ? 'detallado' : 'rapido',
      summary: `Mudanza de ${lineas} objetos o grupos`,
      items: list,
      totals: { weightKg: 1234.5, volumeM3: 9.876, lines: list.length, linesWithWeight: list.length, linesWithVolume: list.length },
      capacity: { estimatedMinTrips: 3, basis: 'peso', note: 'estimacion' },
    },
    resources: recursos(opts),
  };
}

const casos = [
  ['v1 actual (sin inventario)', baseV1()],
  ['S1 un refrigerador', snapshotV2(1)],
  ['S2 depto 1 dormitorio (15 líneas)', snapshotV2(15)],
  ['S3 depto 3 dormitorios (40 líneas)', snapshotV2(40)],
  ['S4 casa grande (80 líneas)', snapshotV2(80)],
  ['S4b casa grande sin id por línea (80)', snapshotV2(80, { conId: false })],
  ['S5 extremo (150 líneas, textos al máximo)', snapshotV2(150, { largo: true })],
  ['S5b extremo sin id (150, textos al máximo)', snapshotV2(150, { largo: true, conId: false })],
  ['S6 sin agrupar (300 líneas)', snapshotV2(300)],
];

if (process.argv.includes('--json')) {
  for (const [nombre, obj] of casos) console.log(JSON.stringify({ nombre, bytesUtf8: Buffer.byteLength(JSON.stringify(obj)) }));
} else {
  console.log('create temporary table casos (nombre text, internal jsonb);');
  for (const [nombre, obj] of casos) {
    const lit = JSON.stringify(obj).replace(/'/g, "''");
    console.log(`insert into casos values ('${nombre.replace(/'/g, "''")}', '${lit}'::jsonb);`);
  }
  console.log(
    "select nombre, octet_length(internal::text) as bytes_texto, pg_column_size(internal) as bytes_jsonb, " +
      "case when pg_column_size(internal) <= 16384 then 'cabe' else 'EXCEDE' end as limite_16kb, " +
      "round(100.0 * pg_column_size(internal) / 16384, 1) as pct_del_limite from casos;",
  );
}
