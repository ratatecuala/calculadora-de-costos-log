/**
 * Presupuesto previo de la herramienta de medición: arma el `plan` del contrato de #55 desde el formulario
 * o desde una cotización, con la procedencia de cada parámetro (que va FUERA de lo sellado, en `meta`).
 * El resultado lo calcula el contrato (`crearPresupuesto`, ver `campo.ts`): aquí no hay motor ni fórmulas.
 *
 * Modalidad (A-89): la simplificada es la predeterminada y no suma gastos fijos (lo decide el contrato,
 * `alcancePartida`); la detallada los incluye. El viaje simplificado no exige SOAP, permisos, seguros,
 * mantenciones ni gastos anuales. Todo parámetro es opcional; lo que falta queda DATO FALTANTE (no 0).
 */
import { procedencia, type ClaseDato, type Procedencia, type TipoFuente } from '../shared/procedencia';
import { aClase, planVacio } from './campo';
import type { BaseClp, Corte, DatoMedicion, FuentePrecio, Modalidad, Muestra, PlanCampo, Uso, VehiculoMedicion } from './modelo';

/**
 * Clase que corresponde a cada fuente del precio (regla de #55: la clase del precio sigue a su fuente). El
 * contrato no exporta su tabla y la VALIDA al sellar: si esta copia divergiera, `crearPresupuesto` rechaza.
 */
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

/** Opciones del plan que pide el contrato (A-89 y precisión), todas declaradas por el usuario. */
export interface OpcionesPlan {
  modalidad: Modalidad;
  /** Base de los importes: neto o con IVA. `null` = no la sé (sin comparación en CLP). */
  baseClp: BaseClp;
  /**
   * Cómo obtuviste el rendimiento: `'sin_ajuste'` si no usaste una muestra para ajustarlo; un corte
   * `{fecha, odometro}` si la usaste; `null` = no lo sé (la independencia queda pendiente).
   */
  ajusteHasta: Corte | 'sin_ajuste' | null;
  /** Reserva previa del intervalo de combustible: calibración o validación (opcional). */
  muestraPrevista: Muestra | null;
  /** Incertidumbre absoluta de los km previstos, si la conoces. */
  incertidumbreKm: number | null;
}

export const opcionesIniciales = (modalidad: Modalidad = 'simplificada'): OpcionesPlan => ({ modalidad, baseClp: null, ajusteHasta: null, muestraPrevista: null, incertidumbreKm: null });

export type EntradaPlan = Record<CampoPlan, DatoMedicion> & { fuentePrecio: FuentePrecio | null; opciones: OpcionesPlan };

export const faltante = (): DatoMedicion => ({ valor: null, procedencia: procedencia('faltante', 'usuario') });
export const declarado = (valor: number | null, tipo: TipoFuente = 'usuario', detalle: string | null = null): DatoMedicion =>
  valor === null ? faltante() : { valor, procedencia: procedencia('declarado', tipo, detalle) };

/** Formulario vacío: todo DATO FALTANTE, sin valores inventados. */
export function entradaVacia(): EntradaPlan {
  const e = Object.fromEntries(CAMPOS_PLAN.map((k) => [k, faltante()])) as Record<CampoPlan, DatoMedicion>;
  return { ...e, fuentePrecio: null, opciones: opcionesIniciales() };
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
  const sim = uso === 'simulacion';
  const o = e.opciones;
  const plan: PlanCampo = { ...planVacio(o.modalidad), baseClp: o.baseClp, ajusteHasta: o.ajusteHasta, muestraPrevista: o.muestraPrevista };
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
    const c = aClase(clase);
    if (c) plan[k] = [valor, c];
    proc[k] = { ...d.procedencia, clase };
  }
  if (plan.precioLitro) plan.fuentePrecio = e.fuentePrecio;
  if (resolucionKm !== null && resolucionKm > 0) {
    plan.resolucionKm = [resolucionKm, sim ? 'SIMULADO' : 'DECLARADO'];
    proc.resolucionKm = procedencia(sim ? 'simulado' : 'declarado', 'vehiculo');
  }
  if (o.incertidumbreKm !== null && Number.isFinite(o.incertidumbreKm) && o.incertidumbreKm >= 0) {
    plan.incertidumbreKm = [o.incertidumbreKm, sim ? 'SIMULADO' : 'DECLARADO'];
    proc.incertidumbreKm = procedencia(sim ? 'simulado' : 'declarado', 'usuario');
  }
  if (o.modalidad === 'simplificada' && plan.fijoHora) avisos.push('Modalidad simplificada: los gastos fijos se conservan en el plan pero no se suman (cámbiala a detallada para incluirlos).');
  if (o.baseClp === null) avisos.push('Sin base tributaria (neto o con IVA) no habrá comparación en pesos.');
  if (o.ajusteHasta === null) avisos.push('Sin indicar cómo obtuviste el rendimiento, la independencia del combustible queda pendiente.');
  return { plan, procedencia: proc, avisos };
}

/** Plan sellado → formulario (para «corregir»: sellar uno nuevo con los mismos valores como punto de partida). */
export function entradaDesdePlan(plan: PlanCampo, proc: Record<string, Procedencia>): EntradaPlan {
  const e = entradaVacia();
  for (const k of CAMPOS_PLAN) {
    const d = plan[k];
    if (d !== null) e[k] = { valor: d[0], procedencia: proc[k] ?? procedencia('declarado', 'usuario') };
  }
  e.fuentePrecio = plan.fuentePrecio;
  // Un plan histórico sin modalidad conserva su alcance detallado (guía de #55).
  e.opciones = {
    modalidad: plan.modalidad ?? 'detallada',
    baseClp: plan.baseClp ?? null,
    ajusteHasta: plan.ajusteHasta ?? null,
    muestraPrevista: plan.muestraPrevista ?? null,
    incertidumbreKm: plan.incertidumbreKm ? plan.incertidumbreKm[0] : null,
  };
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
    // El cotizador comercial suma los gastos fijos: el plan conserva ese alcance (modalidad detallada).
    entrada.opciones = opcionesIniciales('detallada');
    avisos.push('Cotización: modalidad detallada (incluye gastos fijos, como el cotizador). Puedes cambiarla a simplificada.');
  } else {
    entrada.km = ruta(s.km, null);
    entrada.marchaMin = ruta(s.minutes, null);
    avisos.push(`Cotización v${sv}: no guarda parámetros ni procedencia. Esos campos quedan faltantes; complétalos tú.`);
  }
  return { schemaVersion: sv, folio, ficticia, entrada, avisos };
}
