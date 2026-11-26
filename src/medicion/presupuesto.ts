/**
 * Presupuesto previo de la herramienta de medición: arma el `plan` (forma de #55) desde el formulario o
 * desde una cotización, con la procedencia de cada parámetro, y obtiene el resultado con el motor
 * VIGENTE (`buildCostItems`, `computeMeasures`, `displayAmount` de `src/engine`) sin copiar fórmulas.
 *
 * Modalidad (A-89): el viaje simplificado no exige SOAP, permisos, seguros, mantenciones ni gastos
 * anuales. Todo parámetro es opcional; lo que falta queda DATO FALTANTE (no 0) y la partida que depende
 * de él se informa como faltante.
 */
import { buildCostItems, type TripParams } from '../engine/inputs';
import { computeMeasures } from '../engine/measures';
import { displayAmount } from '../engine/rounding';
import { procedencia, type ClaseDato, type Procedencia, type TipoFuente } from '../shared/procedencia';
import type { ClaseCampo, DatoCampo, DatoMedicion, FuentePrecio, PlanCampo, ResultadoMotorCampo, Uso, VehiculoMedicion, VersionMotor } from './modelo';

/**
 * Equivalencia de clases entre `procedencia.ts` (minúsculas) y el instrumento de #55 (mayúsculas).
 * PROVISIONAL: docs/29 §3 pide una sola tabla en `procedencia.ts`; hasta que exista allí (o en el contrato
 * publicado por Codex), esta es la única copia del módulo y se reemplaza por importación.
 */
export const CLASE_A_CAMPO: Record<ClaseDato, ClaseCampo | null> = {
  medido: 'MEDIDO',
  comprobado: 'COMPROBADO',
  declarado: 'DECLARADO',
  estimado: 'ESTIMADO',
  simulado: 'SIMULADO',
  faltante: null,
};

/** Clase que corresponde a cada fuente del precio (regla de #55: la clase del precio sigue a su fuente). */
export const CLASE_DE_FUENTE_PRECIO: Record<FuentePrecio, ClaseDato> = {
  boleta: 'comprobado',
  surtidor: 'medido',
  declaracion: 'declarado',
  referencia_publicada: 'estimado',
  supuesto: 'estimado',
};

export const CAMPOS_PLAN = [
  'km',
  'marchaMin',
  'esperaMin',
  'cargaMin',
  'descargaMin',
  'precioLitro',
  'kmL',
  'desgasteKm',
  'fijoHora',
  'trabajoHora',
  'ayudantes',
  'pagoAyudante',
  'tag',
  'otros',
  'margenPct',
  'recargos',
] as const;
export type CampoPlan = (typeof CAMPOS_PLAN)[number];

export const ETIQUETAS_PLAN: Record<CampoPlan, string> = {
  km: 'Km previstos',
  marchaMin: 'Minutos de marcha',
  esperaMin: 'Minutos de espera',
  cargaMin: 'Minutos de carga',
  descargaMin: 'Minutos de descarga',
  precioLitro: 'Precio del combustible ($/L)',
  kmL: 'Rendimiento (km/L)',
  desgasteKm: 'Desgaste ($/km)',
  fijoHora: 'Gastos fijos ($/h, opcional)',
  trabajoHora: 'Lo que quieres ganar ($/h)',
  ayudantes: 'Ayudantes (personas)',
  pagoAyudante: 'Pago por ayudante ($)',
  tag: 'TAG y peajes ($)',
  otros: 'Otros costos del servicio ($)',
  margenPct: 'Margen deseado (%)',
  recargos: 'Recargos ($)',
};

export type EntradaPlan = Record<CampoPlan, DatoMedicion> & { fuentePrecio: FuentePrecio | null };

export const faltante = (): DatoMedicion => ({ valor: null, procedencia: procedencia('faltante', 'usuario') });
export const declarado = (valor: number | null, tipo: TipoFuente = 'usuario', detalle: string | null = null): DatoMedicion =>
  valor === null ? faltante() : { valor, procedencia: procedencia('declarado', tipo, detalle) };

/** Formulario vacío: todo DATO FALTANTE, sin valores inventados. */
export function entradaVacia(): EntradaPlan {
  const e = Object.fromEntries(CAMPOS_PLAN.map((k) => [k, faltante()])) as Record<CampoPlan, DatoMedicion>;
  return { ...e, fuentePrecio: null };
}

/** Formulario prellenado con los valores por defecto del vehículo, conservando su procedencia. */
export function entradaDesdeVehiculo(veh: VehiculoMedicion): EntradaPlan {
  const e = entradaVacia();
  const d = veh.porDefecto;
  return {
    ...e,
    precioLitro: { valor: d.precioLitro.valor, procedencia: d.precioLitro.procedencia },
    fuentePrecio: d.precioLitro.valor === null ? null : d.precioLitro.fuentePrecio,
    kmL: d.kmL,
    desgasteKm: d.desgasteKm,
    fijoHora: d.fijoHora,
    trabajoHora: d.trabajoHora,
  };
}

export interface PlanConstruido {
  plan: PlanCampo;
  procedencia: Record<string, Procedencia>;
  avisos: string[];
}

/**
 * Formulario → plan de #55. En uso personal un valor SIMULADO (p. ej., de un ejemplo ficticio) no se usa:
 * queda faltante y se avisa. En una simulación, todo valor queda SIMULADO (regla de #55).
 */
export function construirPlan(e: EntradaPlan, uso: Uso, resolucionKm: number | null): PlanConstruido {
  const avisos: string[] = [];
  const proc: Record<string, Procedencia> = {};
  const plan: PlanCampo = {
    baseClp: null,
    ajusteHasta: null,
    muestraPrevista: null,
    resolucionKm: null,
    incertidumbreKm: null,
    km: null,
    marchaMin: null,
    esperaMin: null,
    cargaMin: null,
    descargaMin: null,
    kmL: null,
    precioLitro: null,
    fuentePrecio: null,
    desgasteKm: null,
    fijoHora: null,
    trabajoHora: null,
    ayudantes: null,
    pagoAyudante: null,
    tag: null,
    otros: null,
    margenPct: null,
    recargos: null,
    cotizado: null,
  };
  for (const k of CAMPOS_PLAN) {
    const d = e[k];
    let clase: ClaseDato = d.valor === null ? 'faltante' : d.procedencia.clase;
    if (k === 'precioLitro' && d.valor !== null) {
      if (!e.fuentePrecio) {
        avisos.push('Indica de dónde sale el precio del combustible; mientras tanto queda faltante.');
        clase = 'faltante';
      } else clase = CLASE_DE_FUENTE_PRECIO[e.fuentePrecio];
    }
    if (uso === 'personal' && clase === 'simulado') {
      avisos.push(`${ETIQUETAS_PLAN[k]}: el valor de ejemplo no se usa en una medición personal (queda faltante).`);
      clase = 'faltante';
    }
    if (uso === 'simulacion' && clase !== 'faltante') clase = 'simulado';
    if (clase === 'faltante' || d.valor === null || !Number.isFinite(d.valor) || d.valor < 0) {
      if (d.valor !== null && (!Number.isFinite(d.valor) || d.valor < 0)) avisos.push(`${ETIQUETAS_PLAN[k]}: número inválido (queda faltante).`);
      proc[k] = procedencia('faltante', d.procedencia.fuente.tipo, d.procedencia.fuente.detalle);
      continue;
    }
    const valor = k === 'ayudantes' ? Math.round(d.valor) : d.valor;
    plan[k] = [valor, CLASE_A_CAMPO[clase] as ClaseCampo];
    proc[k] = { ...d.procedencia, clase };
  }
  if (plan.precioLitro) plan.fuentePrecio = e.fuentePrecio;
  if (resolucionKm !== null && resolucionKm > 0) {
    plan.resolucionKm = [resolucionKm, uso === 'simulacion' ? 'SIMULADO' : 'DECLARADO'];
    proc.resolucionKm = procedencia(uso === 'simulacion' ? 'simulado' : 'declarado', 'vehiculo');
  }
  return { plan, procedencia: proc, avisos };
}

const v = (d: DatoCampo): number | null => (d === null ? null : d[0]);

/**
 * Resultado del motor vigente para el plan. `null` si faltan km o minutos de marcha: el motor exige esos
 * números y aquí no se inventan. Cada partida que depende de un dato faltante se publica como faltante
 * (mismo criterio que el adaptador de #55); se reemplazará por `presupuesto()` de Codex cuando se publique.
 */
export function resultadoMotor(plan: PlanCampo, uso: Uso): ResultadoMotorCampo | null {
  const km = v(plan.km);
  const marcha = v(plan.marchaMin);
  if (km === null || marcha === null) return null;
  const carga = v(plan.cargaMin);
  const descarga = v(plan.descargaMin);
  const maniobras = carga === null || descarga === null ? null : carga + descarga;
  const ayudantes = v(plan.ayudantes);
  const otros = v(plan.otros);
  const params: TripParams = {
    fuelPricePerL: v(plan.precioLitro),
    kmPerL: v(plan.kmL),
    wearPerKm: v(plan.desgasteKm),
    fixedPerHour: v(plan.fijoHora),
    ownerPerHour: v(plan.trabajoHora),
    helpers: ayudantes ?? 0,
    helperFee: v(plan.pagoAyudante),
    loadMinutes: maniobras ?? 0,
    tolls: v(plan.tag),
    otherCosts: otros ?? 0,
  };
  const desconocida: Record<string, boolean> = {
    gastosFijos: maniobras === null,
    remuneracion: maniobras === null,
    ayudantes: ayudantes === null,
    otros: otros === null,
  };
  const items = buildCostItems(km, marcha, params).map((it) => (desconocida[it.id] ? { ...it, amount: null } : it));
  const margen = v(plan.margenPct);
  const recargos = v(plan.recargos);
  const medidas = computeMeasures({ items, margin: (margen ?? 0) / 100, surcharges: recargos ?? 0 });
  const sugerible = uso !== 'personal' && medidas.complete && margen !== null && recargos !== null;
  return {
    partidas: Object.fromEntries(items.map((i) => [i.id, i.amount])),
    costoClp: items.every((i) => i.amount === null) ? null : displayAmount(medidas.cost),
    sugeridoClp: sugerible ? displayAmount(medidas.suggested) : null,
    evidencia: uso === 'simulacion' ? 'SIMULADO' : 'ESTIMADO',
    faltan: medidas.missing,
    // Lo entrega `presupuesto()` de Codex; aquí no se agrega una división propia.
    litrosEstimados: null,
    tipo: medidas.cost.type === 'estimado' ? 'estimado' : 'cotaInferior',
  };
}

/** Recalculado con lo observado: MISMA fórmula, otra entrada. No es una validación (docs/29 §5). */
export function recalculado(plan: PlanCampo, kmObservado: number | null, marchaObservada: number | null, uso: Uso): ResultadoMotorCampo | null {
  if (kmObservado === null || marchaObservada === null) return null;
  const clase: ClaseCampo = uso === 'simulacion' ? 'SIMULADO' : 'MEDIDO';
  return resultadoMotor({ ...plan, km: [kmObservado, clase], marchaMin: [marchaObservada, clase] }, uso);
}

declare const __VERSION_MOTOR_MEDICION__: VersionMotor | undefined;

/** Versión del motor inyectada al compilar (`vite.medicion.config.ts`), con la huella de #55. */
export function versionMotor(): VersionMotor | null {
  return typeof __VERSION_MOTOR_MEDICION__ === 'undefined' ? null : __VERSION_MOTOR_MEDICION__;
}

/** Plan sellado → formulario (para «corregir»: sellar uno nuevo con los mismos valores como punto de partida). */
export function entradaDesdePlan(plan: PlanCampo, proc: Record<string, Procedencia>): EntradaPlan {
  const e = entradaVacia();
  for (const k of CAMPOS_PLAN) {
    const d = plan[k];
    if (d !== null) e[k] = { valor: d[0], procedencia: proc[k] ?? procedencia('declarado', 'usuario') };
  }
  e.fuentePrecio = plan.fuentePrecio;
  return e;
}

// ---------------------------------------------------------------- Cotización guardada → presupuesto

export interface CotizacionLeida {
  schemaVersion: 1 | 2 | 3;
  folio: string | null;
  ficticia: boolean;
  entrada: EntradaPlan;
  avisos: string[];
}

const CLAVES_PARAM: [string, CampoPlan][] = [
  ['fuelPricePerL', 'precioLitro'],
  ['kmPerL', 'kmL'],
  ['wearPerKm', 'desgasteKm'],
  ['fixedPerHour', 'fijoHora'],
  ['ownerPerHour', 'trabajoHora'],
  ['helpers', 'ayudantes'],
  ['helperFee', 'pagoAyudante'],
  ['tolls', 'tag'],
  ['otherCosts', 'otros'],
];

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null);
const CLASES_VALIDAS: ClaseDato[] = ['medido', 'comprobado', 'declarado', 'estimado', 'simulado', 'faltante'];

function datoDe(x: unknown, detalle: string): DatoMedicion {
  if (!esObj(x) || !esObj(x.procedencia)) return faltante();
  const valor = num(x.valor);
  const p = x.procedencia as Record<string, unknown>;
  const clase = CLASES_VALIDAS.includes(p.clase as ClaseDato) ? (p.clase as ClaseDato) : 'faltante';
  const fuente = esObj(p.fuente) ? p.fuente : {};
  const fecha = typeof p.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : null;
  if (valor === null || clase === 'faltante') return faltante();
  const det = typeof fuente.detalle === 'string' ? fuente.detalle.slice(0, 60) : detalle;
  return { valor, procedencia: { ...procedencia(clase, 'referencia', det, fecha) } };
}

const CLASE_RUTA: Record<string, ClaseDato> = { simulado: 'simulado', declarado: 'declarado', google: 'estimado', mixto: 'estimado' };

/**
 * Lee una cotización exportada (snapshot v1, v2 o v3). Acepta el snapshot solo o `{folio, ficticia,
 * snapshot}`. La v3 trae parámetros y procedencia; la v1/v2 no los tienen y esos campos quedan
 * FALTANTES, nunca recalculados. No usa `src/shared/snapshot.ts` (la app comercial no se toca).
 */
export function leerCotizacion(json: unknown): CotizacionLeida {
  const envoltura = esObj(json) && esObj(json.snapshot) ? json : null;
  const s = envoltura ? (envoltura.snapshot as Record<string, unknown>) : json;
  if (!esObj(s)) throw new Error('El archivo no es una cotización.');
  const folio = envoltura && typeof envoltura.folio === 'string' ? envoltura.folio.slice(0, 20) : null;
  const ficticia = envoltura?.ficticia === true;
  const sv = 'schemaVersion' in s ? s.schemaVersion : 1;
  if (sv !== 1 && sv !== 2 && sv !== 3) throw new Error(`Versión de cotización desconocida: ${String(sv)}`);
  if (typeof s.engineVersion !== 'string') throw new Error('El archivo no es una cotización de la app.');
  const avisos: string[] = [];
  const entrada = entradaVacia();
  const claseRuta = CLASE_RUTA[String(s.routeSource)] ?? 'declarado';
  const detalle = `cotización${folio ? ' ' + folio : ''}`;
  const ruta = (x: unknown, p: unknown): DatoMedicion => {
    const valor = num(x);
    if (valor === null) return faltante();
    if (esObj(p) && CLASES_VALIDAS.includes(p.clase as ClaseDato) && p.clase !== 'faltante') {
      return { valor, procedencia: procedencia(p.clase as ClaseDato, 'ruta', detalle, typeof p.fecha === 'string' ? p.fecha : null) };
    }
    return { valor, procedencia: procedencia(claseRuta, 'ruta', detalle) };
  };
  if (sv === 3) {
    const eco = esObj(s.economia) ? s.economia : null;
    const params = eco && esObj(eco.parametros) ? eco.parametros : null;
    if (!params) throw new Error('La cotización v3 no trae sus parámetros.');
    const rec = esObj(eco?.recorrido) ? (eco?.recorrido as Record<string, unknown>) : {};
    entrada.km = ruta(s.km, rec.km);
    entrada.marchaMin = ruta(s.minutes, rec.minutos);
    for (const [a, b] of CLAVES_PARAM) entrada[b] = datoDe(params[a], detalle);
    // La cotización guarda carga y descarga juntas: van en «carga» y la descarga queda en 0 con la misma
    // procedencia, para no contarlas dos veces (no es un dato nuevo, es la misma cifra repartida).
    const lm = datoDe(params.loadMinutes, detalle);
    entrada.cargaMin = lm;
    entrada.descargaMin = lm.valor === null ? faltante() : { valor: 0, procedencia: { ...lm.procedencia, fuente: { tipo: 'referencia', detalle: 'incluida en carga' } } };
    const margen = datoDe(eco?.margen, detalle);
    entrada.margenPct = margen.valor === null ? faltante() : { ...margen, valor: Math.round(margen.valor * 10000) / 100 };
    entrada.recargos = datoDe(eco?.recargos, detalle);
    const precio = entrada.precioLitro;
    if (precio.valor !== null) {
      const c = precio.procedencia.clase;
      entrada.fuentePrecio = c === 'comprobado' ? 'boleta' : c === 'medido' ? 'surtidor' : c === 'estimado' ? 'referencia_publicada' : c === 'simulado' ? 'supuesto' : 'declaracion';
    }
    if (s.km === null || s.minutes === null) avisos.push('La cotización no retuvo los km o los minutos (A-38): escríbelos.');
  } else {
    entrada.km = ruta(s.km, null);
    entrada.marchaMin = ruta(s.minutes, null);
    avisos.push(`Cotización v${sv}: no guarda parámetros ni procedencia. Esos campos quedan faltantes; complétalos tú.`);
  }
  return { schemaVersion: sv, folio, ficticia, entrada, avisos };
}
