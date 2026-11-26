/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║  CONTRATO PROVISIONAL — se reemplaza por el contrato publicado y auditado de Codex (PR #55,      ║
 * ║  `src/shared/campo/`). NO es un segundo motor ni una segunda comparación.                         ║
 * ║                                                                                                  ║
 * ║  - `ContratoCampo` describe las firmas que la interfaz necesita de #55 (`diferencia`, `cobertura`, ║
 * ║    `rendimiento`, `informe`, `resumenClases`).                                                    ║
 * ║  - `presentacionProvisional` es una implementación mínima de PRESENTACIÓN: solo diferencias        ║
 * ║    previsto − observado de km y minutos (convención de error firmado de docs/27 §1, PROPUESTA) y  ║
 * ║    conteo de cobertura. `rendimiento`, `informe` y `resumenClases` devuelven «pendiente»: no se   ║
 * ║    reimplementan con otra lógica.                                                                 ║
 * ║  - Al integrar: `import { diferencia, cobertura, rendimiento, informe, resumenClases } from       ║
 * ║    '../shared/campo/…'` y borrar este archivo. Las pruebas `tests/medicion-*.test.ts` marcan qué  ║
 * ║    cambia.                                                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════════╝
 */
import type { DatoCampo, Directa, PlanCampo, ResultadoMotorCampo, Uso, VehiculoMedicion, Viaje } from './modelo';
import { DIRECTAS } from './modelo';
import { distanciaViaje, type IntervaloLleno } from './calculos';
import { minutosPorTipo } from './tiempo';
import { recalculado } from './presupuesto';

export const PENDIENTE_CODEX = 'comparación pendiente del contrato de Codex' as const;
export const CRITERIOS_12 = 'Criterios estadísticos (KPI, tamaño de muestra, exclusiones): por aprobar en #12.' as const;

export interface Diferencia {
  previsto: number | null;
  referencia: number | null;
  diferencia: number | null;
  /** Error firmado (previsto − referencia) / referencia × 100; `null` con referencia 0 o faltante. */
  porcentaje: number | null;
  sentido: 'sin comparación' | 'igual' | 'subestimación' | 'sobreestimación';
}

export interface Cobertura {
  presentes: number;
  total: number;
  faltan: string[];
}

export type Pendiente = { pendiente: typeof PENDIENTE_CODEX };

/** Firmas que la interfaz espera del contrato de #55. Tipos de entrada simplificados (PROVISIONAL). */
export interface ContratoCampo {
  diferencia(previsto: number | null, referencia: number | null): Diferencia;
  cobertura(campos: Record<string, unknown>): Cobertura;
  /** km/L de un intervalo lleno a lleno. */
  rendimiento(intervalo: unknown): number | null | Pendiente;
  /** Informe completo de la ficha frente al sello. */
  informe(ficha: unknown, sello: unknown): unknown | Pendiente;
  resumenClases(fichas: unknown[]): unknown | Pendiente;
}

const pendiente: Pendiente = { pendiente: PENDIENTE_CODEX };

/** Implementación de PRESENTACIÓN (no es la de Codex). Solo se usa para km y minutos. */
export const presentacionProvisional: ContratoCampo = {
  diferencia(previsto, referencia) {
    // Redondeo a 9 decimales: evita restos de coma flotante (18 − 20,3 = −2,3000000000000007).
    const d = previsto === null || referencia === null ? null : Math.round((previsto - referencia) * 1e9) / 1e9;
    return {
      previsto,
      referencia,
      diferencia: d,
      porcentaje: d === null || referencia === 0 || referencia === null ? null : (d / referencia) * 100,
      sentido: d === null ? 'sin comparación' : d === 0 ? 'igual' : d < 0 ? 'subestimación' : 'sobreestimación',
    };
  },
  cobertura(campos) {
    const faltan = Object.keys(campos).filter((k) => campos[k] === null || campos[k] === undefined);
    return { presentes: Object.keys(campos).length - faltan.length, total: Object.keys(campos).length, faltan };
  },
  rendimiento: () => pendiente,
  informe: () => pendiente,
  resumenClases: () => pendiente,
};

export function esPendiente(x: unknown): x is Pendiente {
  return typeof x === 'object' && x !== null && 'pendiente' in x;
}

// ---------------------------------------------------------------- Tarjetas de la pantalla «Comparar»

export interface Tarjeta {
  partida: string;
  etiqueta: string;
  unidad: 'km' | 'min' | 'CLP';
  /** Presupuesto sellado (previo). */
  sellado: number | null;
  /** Misma fórmula con lo observado: NO es validación. Solo para partidas en CLP. */
  recalculado: number | null;
  /** Referencia independiente de la partida. */
  referencia: number | null;
  claseReferencia: string;
  diferencia: Diferencia | null;
  /** Texto de estado: «pendiente del contrato de Codex», «sin comprobante completo», etc. */
  estado: string;
  notas: string[];
}

export interface Comparacion {
  estadoPresupuesto: 'sin presupuesto previo' | 'previo al viaje' | 'cronología sin verificar' | 'presupuesto anulado';
  tarjetas: Tarjeta[];
  cobertura: Cobertura;
  combustible: 'parcial' | 'pendiente';
  motivosCombustible: string[];
  criterios: typeof CRITERIOS_12;
}

const val = (d: DatoCampo | undefined): number | null => (d ? d[0] : null);

const ETIQ: Record<string, string> = {
  combustible: 'Combustible',
  peajes: 'TAG y peajes',
  ayudantes: 'Ayudantes',
  otros: 'Otros costos',
  desgaste: 'Desgaste',
  gastosFijos: 'Gastos fijos',
  remuneracion: 'Lo que quieres ganar',
};

/**
 * Arma las tarjetas con lo que existe hoy. Separa presupuesto sellado, recalculado con lo observado y
 * referencia independiente (docs/29 §5). Nunca entrega un «aprobado» total.
 */
export function compararViaje(entrada: {
  viaje: Viaje;
  vehiculo: VehiculoMedicion | null;
  sello: { plan: PlanCampo; resultado: ResultadoMotorCampo | null; fecha: string } | null;
  anulado: boolean;
  intervalo: IntervaloLleno | null;
  uso: Uso;
  contrato?: ContratoCampo;
}): Comparacion {
  const c = entrada.contrato ?? presentacionProvisional;
  const { viaje, sello } = entrada;
  const verificable = sello !== null && !entrada.anulado && Date.parse(sello.fecha) <= Date.parse(viaje.inicio);
  const estadoPresupuesto: Comparacion['estadoPresupuesto'] = !sello
    ? 'sin presupuesto previo'
    : entrada.anulado
      ? 'presupuesto anulado'
      : verificable
        ? 'previo al viaje'
        : 'cronología sin verificar';
  const dist = distanciaViaje(viaje, entrada.vehiculo);
  const min = minutosPorTipo(viaje.tramos, viaje.fin);
  const conEstados = viaje.tramos.length > 1;
  const p = sello?.plan;
  const prev = (x: number | null) => (verificable ? x : null);
  const tarjetas: Tarjeta[] = [];

  tarjetas.push({
    partida: 'km',
    etiqueta: 'Distancia',
    unidad: 'km',
    sellado: val(p?.km),
    recalculado: null,
    referencia: dist.km,
    claseReferencia: dist.km === null ? 'DATO FALTANTE' : dist.fuente === 'trip-reiniciado' ? 'DECLARADO' : 'MEDIDO',
    diferencia: c.diferencia(prev(val(p?.km)), dist.km),
    estado: dist.km === null ? (dist.motivo ?? 'sin lectura') : `medido con ${dist.fuente === 'odometro' ? 'odómetro' : 'TRIP'}`,
    notas: dist.motivo && dist.km !== null ? [dist.motivo] : [],
  });
  const tiempos: [keyof typeof min & string, string, keyof PlanCampo][] = [
    ['marcha', 'Minutos de marcha', 'marchaMin'],
    ['espera', 'Minutos de espera', 'esperaMin'],
    ['carga', 'Minutos de carga', 'cargaMin'],
    ['descarga', 'Minutos de descarga', 'descargaMin'],
  ];
  for (const [k, etiqueta, campo] of tiempos) {
    const cerrado = viaje.fin !== null;
    const ref = !cerrado ? null : k === 'marcha' || conEstados ? min[k as 'marcha'] : null;
    const notas: string[] = [];
    if (k === 'espera') notas.push('Registrada; el motor vigente no la costea.');
    if (k === 'marcha' && !conEstados && cerrado) notas.push('Sin botones de estado: incluye esperas y maniobras no marcadas.');
    tarjetas.push({
      partida: campo,
      etiqueta,
      unidad: 'min',
      sellado: val(p?.[campo] as DatoCampo),
      recalculado: null,
      referencia: ref,
      claseReferencia: ref === null ? 'DATO FALTANTE' : viaje.horaEditada ? 'DECLARADO' : 'MEDIDO',
      diferencia: c.diferencia(prev(val(p?.[campo] as DatoCampo)), ref),
      estado: ref === null ? (cerrado ? 'sin desglose (no se marcaron estados)' : 'viaje abierto') : 'derivado de los tramos',
      notas,
    });
  }

  const reca = p ? recalculado(p, dist.km, viaje.fin ? min.marcha : null, entrada.uso) : null;
  const motivosCombustible: string[] = [];
  if (!viaje.lecturas.inicial.odometro || !viaje.lecturas.final.odometro) motivosCombustible.push('Sin odómetro inicial y final: el viaje no se puede ubicar en un intervalo de cargas.');
  else if (!entrada.intervalo) motivosCombustible.push('El viaje no cae dentro de un intervalo lleno a lleno (opcional, para calibración controlada).');
  motivosCombustible.push('Las recargas parciales quedan como gasto registrado: sin saldo inicial y final no se infieren los litros del viaje.');
  const rend = entrada.intervalo ? c.rendimiento(entrada.intervalo) : null;

  const refDirecta = (k: Directa): number | null => {
    if (viaje.cobertura[k] !== 'completa') return null;
    const lineas = viaje.comprobantes.filter((r) => r.partida === k);
    return lineas.length ? lineas.reduce((s, r) => s + r.clp, 0) : null;
  };
  for (const k of ['combustible', ...DIRECTAS, 'desgaste', 'gastosFijos', 'remuneracion']) {
    const sellado = sello?.resultado ? (sello.resultado.partidas[k] ?? null) : null;
    const t: Tarjeta = {
      partida: k,
      etiqueta: ETIQ[k] ?? k,
      unidad: 'CLP',
      sellado: verificable ? sellado : null,
      recalculado: reca ? (reca.partidas[k] ?? null) : null,
      referencia: null,
      claseReferencia: 'DATO FALTANTE',
      diferencia: null,
      estado: '',
      notas: [],
    };
    if (k === 'combustible') {
      t.claseReferencia = 'ESTIMADO (pendiente)';
      // Sin el contrato de Codex no hay referencia de combustible (el rendimiento no se reimplementa).
      t.estado = esPendiente(rend) || rend === null ? PENDIENTE_CODEX : `rendimiento del intervalo disponible; ${PENDIENTE_CODEX}`;
      t.notas = [...motivosCombustible];
    } else if ((DIRECTAS as string[]).includes(k)) {
      const ref = refDirecta(k as Directa);
      t.referencia = ref;
      t.claseReferencia = ref === null ? 'DATO FALTANTE' : entrada.uso === 'simulacion' ? 'SIMULADO' : 'COMPROBADO';
      t.estado = ref === null ? 'sin comprobante con cobertura completa: sin comparación' : `comprobantes: ${PENDIENTE_CODEX}`;
    } else if (k === 'remuneracion') {
      t.claseReferencia = 'no aplica';
      t.estado = 'Es una meta, no un pago: no se compara como desembolso.';
    } else {
      t.estado = 'Sin gastos de un periodo: DATO FALTANTE.';
    }
    if (!verificable && sello) t.notas.push(`Presupuesto: ${estadoPresupuesto}.`);
    tarjetas.push(t);
  }
  const comparables = tarjetas.filter((t) => t.unidad === 'CLP' && t.partida !== 'remuneracion');
  const cobertura = c.cobertura(Object.fromEntries(comparables.map((t) => [t.partida, t.referencia])));
  return { estadoPresupuesto, tarjetas, cobertura, combustible: motivosCombustible.length > 1 ? 'parcial' : 'pendiente', motivosCombustible, criterios: CRITERIOS_12 };
}
