/**
 * Integración con el contrato PUBLICADO Y AUDITADO de Codex (#55, `src/shared/campo/`, 89c9139).
 *
 * Este archivo NO calcula costos ni comparaciones: solo traduce los registros locales (viaje, vehículo,
 * cargas, presupuesto) a la `Ficha` del contrato y llama a sus funciones:
 * - `crearPresupuesto` + `envolverOriginal` para sellar (con `VERSION_MOTOR`);
 * - `crearPaquete` / `verificarPaquete` para exportar y para verificar sellos;
 * - `revisarReferencias` + `compararFicha` para la comparación;
 * - `medirIntervalo` para el km/L de un intervalo lleno a lleno.
 *
 * Reglas de honestidad (revisión de GPT sobre el PR #57):
 * - medido ≠ declarado: cada lectura conserva su clase; horas escritas después y km de un TRIP reiniciado
 *   quedan DECLARADO;
 * - si el usuario no desglosó los tiempos con los botones de estado, marcha/espera/carga/descarga quedan
 *   DATO FALTANTE: el total del viaje NO se convierte en «marcha medida»;
 * - los litros de una carga solo entran a un intervalo con boleta (COMPROBADO) o lectura del surtidor
 *   (MEDIDO); si el precio es «lo recuerdo», los litros quedan faltantes en el intervalo;
 * - la independencia de una referencia la decide el contrato (`conciliacionIndependiente`), nunca el
 *   hecho de que un valor no sea nulo;
 * - la base tributaria (`baseClp`) se pide al usuario; sin ella no hay comparación en CLP.
 */
import {
  compararFicha,
  crearPaquete,
  crearPresupuesto,
  envolverOriginal,
  medirIntervalo,
  revisarReferencias,
  validarFicha,
  VERSION_MOTOR,
  type Clase,
  type Dato,
  type Ficha,
  type Informe,
  type Intervalo,
  type Observacion,
  type Original,
  type Paquete,
  type Plan,
  type Presupuesto,
  type ViajeExportado,
} from '../shared/campo/index.js';
import type { ClaseDato } from '../shared/procedencia';
import { distanciaViaje, intervaloDelViaje, intervalosLleno, ordenarCargas, type IntervaloLleno } from './calculos';
import type { CargaCombustible, Lectura, PresupuestoLocal, PresupuestoSellado, TipoVehiculo, Uso, VehiculoMedicion, Viaje } from './modelo';
import { esAnterior } from './modelo';
import { fechaDe, minutosPorTipo } from './tiempo';

export { VERSION_MOTOR, medirIntervalo };
export type { Informe, Paquete, Plan, Presupuesto };

export const CRITERIOS_12 = 'Criterios estadísticos (KPI, tamaño de muestra, exclusiones): por aprobar en #12.' as const;
export const FORMATO_ANTERIOR = 'formato anterior, no comparable' as const;

/** Clase de `procedencia.ts` (minúsculas) → clase del contrato (mayúsculas). `faltante` → sin dato. */
export const aClase = (c: ClaseDato): Clase | null => (c === 'faltante' ? null : (c.toUpperCase() as Clase));

/** Plan vacío con todas las claves que valida el contrato. La modalidad nueva es la simplificada (A-89). */
export function planVacio(modalidad: Plan['modalidad'] = 'simplificada'): Plan {
  return {
    modalidad, baseClp: null, ajusteHasta: null, muestraPrevista: null, resolucionKm: null, incertidumbreKm: null,
    km: null, marchaMin: null, esperaMin: null, cargaMin: null, descargaMin: null, kmL: null, precioLitro: null, fuentePrecio: null,
    desgasteKm: null, fijoHora: null, trabajoHora: null, ayudantes: null, pagoAyudante: null, tag: null, otros: null,
    margenPct: null, recargos: null, cotizado: null,
  };
}

export function observacionVacia(): Observacion {
  return {
    baseClp: null, fin: null, odometroInicial: null, odometroFinal: null, incertidumbreKm: null, inicio: null,
    km: null, marchaMin: null, esperaMin: null, cargaMin: null, descargaMin: null, resolucionKm: null,
    tipoCarga: null, recorrido: null, nivelCarga: null, aire: null, pesoKg: null, ayudantes: null, minutosAyudantes: null,
    equipo: null, precioLitro: null, fuentePrecio: null, cobrado: null, comprobantes: [],
    cobertura: { peajes: null, ayudantes: null, otros: null }, intervalo: null, mantencion: null, fijos: null,
  };
}

/** Ficha previa al viaje (observación vacía), la única que `crearPresupuesto` acepta. */
export function fichaPrevia(uso: Uso, vehiculo: string, tipoVehiculo: TipoVehiculo, plan: Plan): Ficha {
  return { uso, vehiculo, tipoVehiculo, plan, observacion: observacionVacia() };
}

/** Vista previa del sello: el resultado del motor tal como lo entregaría `crearPresupuesto`. */
export function previsualizar(ficha: Ficha, id: string, fecha: string): { datos: Presupuesto | null; error: string | null } {
  try {
    return { datos: crearPresupuesto(ficha, id, fecha, VERSION_MOTOR), error: null };
  } catch (e) {
    return { datos: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sella con el contrato: `envolverOriginal(crearPresupuesto(...))`. */
export async function sellarOriginal(ficha: Ficha, id: string, fecha: string): Promise<Original> {
  return envolverOriginal(crearPresupuesto(ficha, id, fecha, VERSION_MOTOR));
}

/**
 * Verificación PROFUNDA de un original del contrato: se arma un paquete de un viaje con una ficha vacía de
 * la misma identidad y se pasa por `crearPaquete`, que aplica el mismo `validarViajes` que
 * `verificarPaquete` (esquema estricto del original, identidad, versión del motor, resultado y huella).
 */
export async function verificarOriginal(o: Original): Promise<void> {
  const d = o?.datos as Presupuesto | undefined;
  if (!d || typeof d !== 'object') throw new Error('Original sin datos.');
  const ficha: Ficha = { uso: d.uso, vehiculo: d.vehiculo, tipoVehiculo: d.tipoVehiculo, plan: planVacio(), observacion: observacionVacia() };
  await crearPaquete([{ id: d.id, ficha, original: o }]);
}

/**
 * Sello local íntegro. Formato actual: verificación profunda del contrato. Formato anterior: solo la huella
 * con su algoritmo original (`envolverOriginal` usa `JSON.stringify` para `version` 1 y 2), sin validarlo
 * contra el esquema actual ni volver a sellarlo.
 */
export async function verificarSelloLocal(p: PresupuestoLocal): Promise<{ ok: boolean; motivo: string | null }> {
  try {
    if (esAnterior(p)) {
      const { sha256 } = await envolverOriginal(p.datos as unknown as Presupuesto);
      return sha256 === p.sha256 ? { ok: true, motivo: null } : { ok: false, motivo: 'la huella no coincide' };
    }
    await verificarOriginal({ datos: p.datos, sha256: p.sha256 });
    return { ok: true, motivo: null };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- Registros locales → Ficha

export interface DatosCampo {
  vehiculos: VehiculoMedicion[];
  presupuestos: PresupuestoLocal[];
  viajes: Viaje[];
  cargas: CargaCombustible[];
}

/** ¿El usuario desglosó los tiempos con los botones de estado? Un solo tramo = no desglosado. */
export const tiemposDesglosados = (v: Viaje): boolean => v.tramos.length > 1;

/** Minutos totales del viaje cerrado (fin − inicio). Se informan aparte, nunca como marcha. */
export function totalMinutos(v: Viaje): number | null {
  if (!v.fin) return null;
  const m = (Date.parse(v.fin) - Date.parse(v.inicio)) / 60000;
  return Number.isFinite(m) && m >= 0 ? Math.round(m) : null;
}

const LITROS_ADMITIDOS: Partial<Record<NonNullable<CargaCombustible['fuentePrecio']>, Clase>> = { boleta: 'COMPROBADO', surtidor: 'MEDIDO' };

function datoSim(n: number | null | undefined, c: Clase, sim: boolean): Dato {
  return n === null || n === undefined || !Number.isFinite(n) ? null : [n, sim ? 'SIMULADO' : c];
}

/** Intervalo lleno a lleno en la forma del contrato. */
export function intervaloFicha(i: IntervaloLleno, veh: VehiculoMedicion, sim: boolean, zona: string | null): Intervalo {
  const m = i.hasta.cierreIntervalo;
  const r = (c: CargaCombustible) => {
    const clase = c.fuentePrecio ? LITROS_ADMITIDOS[c.fuentePrecio] : undefined;
    return {
      fecha: fechaDe(c.fechaHora),
      lleno: c.lleno,
      odometro: datoSim(c.odometro, 'MEDIDO', sim),
      litros: clase ? datoSim(c.litros, clase, sim) : null,
    };
  };
  const res = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? datoSim(n, 'DECLARADO', sim) : null);
  return {
    vehiculo: veh.alias,
    registroCompleto: m?.registroCompleto ?? null,
    recorrido: m?.recorrido ?? null,
    carga: m?.carga ?? null,
    aire: m?.aire ?? null,
    muestra: m?.muestra ?? null,
    zona: zona && /^[A-Za-z_]+\/[A-Za-z_]+$/.test(zona) ? zona : null,
    resolucionKm: res(veh.resolucionOdometroKm),
    resolucionLitros: res(veh.resolucionLitros),
    incertidumbreLitros: datoSim(m?.incertidumbreLitros, 'DECLARADO', sim),
    incertidumbreKm: datoSim(m?.incertidumbreKm, 'DECLARADO', sim),
    recargas: [i.desde, ...i.parciales, i.hasta].map(r),
  };
}

export interface FichaLocal {
  ficha: Ficha;
  /** Original sellado tal cual (formato actual y no anulado); `null` en otro caso. */
  original: Original | null;
  presupuesto: PresupuestoLocal | null;
  notas: string[];
}

/** Viaje local → `Ficha` del contrato, sin inventar datos (DATO FALTANTE = `null`). */
export function fichaDeViaje(d: DatosCampo, v: Viaje): FichaLocal {
  const veh = d.vehiculos.find((x) => x.id === v.vehiculoId);
  if (!veh) throw new Error(`El viaje ${v.codigo} no tiene vehículo.`);
  const pres = v.presupuestoId ? (d.presupuestos.find((p) => p.id === v.presupuestoId) ?? null) : null;
  const notas: string[] = [];
  let original: Original | null = null;
  let plan = planVacio();
  if (pres && esAnterior(pres)) notas.push(`Presupuesto ${pres.datos.id}: ${FORMATO_ANTERIOR}.`);
  else if (pres && pres.estado === 'anulado') notas.push(`Presupuesto ${pres.datos.id}: anulado (no se compara).`);
  else if (pres) {
    original = { datos: pres.datos, sha256: pres.sha256 };
    plan = structuredClone(pres.datos.plan);
  }
  const sim = v.uso === 'simulacion';
  const dato = (n: number | null | undefined, c: Clase) => datoSim(n, c, sim);
  const dist = distanciaViaje(v, veh);
  const cerrado = v.fin !== null;
  const min = minutosPorTipo(v.tramos, v.fin);
  const desglose = cerrado && tiemposDesglosados(v);
  // «Todo fue marcha»: solo si el usuario lo DECLARA en un viaje cerrado sin estados. Nunca MEDIDO.
  const soloMarcha = cerrado && !desglose && v.soloMarchaDeclarada === true;
  const total = soloMarcha ? totalMinutos(v) : null;
  if (cerrado && !desglose && !soloMarcha) notas.push('Tiempos sin desglosar (no se usaron los botones de estado): marcha, espera, carga y descarga quedan como DATO FALTANTE.');
  if (soloMarcha) notas.push('Todo el viaje se declaró como marcha (sin espera, carga ni descarga): minutos DECLARADO, no medidos.');
  const claseT: Clase = v.horaEditada ? 'DECLARADO' : 'MEDIDO';
  const lec = (l: Lectura | null): Dato => (l ? dato(l.valor, l.clase === 'medido' ? 'MEDIDO' : 'DECLARADO') : null);
  const usadas = dist.fuente === 'odometro' ? [v.lecturas.inicial.odometro, v.lecturas.final.odometro] : [v.lecturas.inicial.trip, v.lecturas.final.trip];
  const claseKm: Clase = dist.fuente !== 'trip-reiniciado' && usadas.every((l) => l?.clase === 'medido') ? 'MEDIDO' : 'DECLARADO';
  // Precio observado: la última carga con precio y fuente antes del fin del viaje (o del inicio si sigue abierto).
  const limite = Date.parse(v.fin ?? v.inicio);
  const conPrecio = ordenarCargas(d.cargas.filter((c) => c.vehiculoId === v.vehiculoId && c.precioLitro !== null && c.fuentePrecio && Date.parse(c.fechaHora) <= limite)).at(-1);
  const clasePrecio: Record<NonNullable<CargaCombustible['fuentePrecio']>, Clase> = { boleta: 'COMPROBADO', surtidor: 'MEDIDO', declaracion: 'DECLARADO' };
  const precioLitro = conPrecio?.fuentePrecio ? dato(conPrecio.precioLitro, clasePrecio[conPrecio.fuentePrecio]) : null;
  const res = dist.fuente === 'odometro' ? veh.resolucionOdometroKm : veh.resolucionTripKm;
  const intervalo = intervaloDelViaje(v, intervalosLleno(d.cargas, v.vehiculoId));
  const observacion: Observacion = {
    ...observacionVacia(),
    baseClp: v.baseClp ?? null,
    inicio: v.inicio,
    fin: v.fin,
    odometroInicial: lec(v.lecturas.inicial.odometro),
    odometroFinal: lec(v.lecturas.final.odometro),
    km: dato(dist.km, claseKm),
    incertidumbreKm: dist.km !== null ? dato(v.incertidumbreKm, 'DECLARADO') : null,
    resolucionKm: res !== null && res > 0 && dist.km !== null ? dato(res, 'DECLARADO') : null,
    marchaMin: desglose ? dato(min.marcha, claseT) : soloMarcha ? dato(total, 'DECLARADO') : null,
    esperaMin: desglose ? dato(min.espera, claseT) : soloMarcha && total !== null ? dato(0, 'DECLARADO') : null,
    cargaMin: desglose ? dato(min.carga, claseT) : soloMarcha && total !== null ? dato(0, 'DECLARADO') : null,
    descargaMin: desglose ? dato(min.descarga, claseT) : soloMarcha && total !== null ? dato(0, 'DECLARADO') : null,
    recorrido: v.recorrido,
    nivelCarga: v.nivelCarga,
    aire: v.aire,
    precioLitro,
    fuentePrecio: precioLitro ? (conPrecio?.fuentePrecio ?? null) : null,
    ...(v.noAplica?.length ? { noAplica: [...v.noAplica] } : {}),
    comprobantes: v.comprobantes.map((c) => ({ ...c })),
    cobertura: { ...v.cobertura },
    intervalo: intervalo ? intervaloFicha(intervalo, veh, sim, v.zona) : null,
  };
  return { ficha: { uso: v.uso, vehiculo: veh.alias, tipoVehiculo: veh.tipoVehiculo, plan, observacion }, original, presupuesto: pres, notas };
}

// ---------------------------------------------------------------- Comparación (contrato de Codex)

export interface ResultadoInforme {
  informe: Informe | null;
  error: string | null;
  notas: string[];
  sello: { ok: boolean; motivo: string | null } | null;
}

function fichasVecinas(d: DatosCampo, v: Viaje): Ficha[] {
  const out: Ficha[] = [];
  for (const x of d.viajes) {
    if (x.id === v.id || x.estado === 'anulado' || !x.fin) continue;
    try {
      const f = fichaDeViaje(d, x).ficha;
      validarFicha(f);
      out.push(f);
    } catch {
      /* una ficha vecina inválida no participa del corte de ajuste */
    }
  }
  return out;
}

/**
 * Informe del contrato para un viaje: verifica el sello (sin volver a sellar), obtiene el corte de ajuste
 * con `revisarReferencias` y llama a `compararFicha(ficha, original, corte, VERSION_MOTOR)`.
 */
export async function informeViaje(d: DatosCampo, v: Viaje): Promise<ResultadoInforme> {
  let local: FichaLocal;
  try {
    local = fichaDeViaje(d, v);
  } catch (e) {
    return { informe: null, error: e instanceof Error ? e.message : String(e), notas: [], sello: null };
  }
  const notas = [...local.notas];
  let original = local.original;
  const sello = local.presupuesto ? await verificarSelloLocal(local.presupuesto) : null;
  if (original && sello && !sello.ok) {
    notas.push(`El sello no se verificó (${sello.motivo}); se compara sin presupuesto.`);
    original = null;
  }
  try {
    const corte = revisarReferencias(local.ficha, fichasVecinas(d, v));
    return { informe: compararFicha(local.ficha, original?.datos ?? null, corte, VERSION_MOTOR), error: null, notas, sello };
  } catch (e) {
    return { informe: null, error: e instanceof Error ? e.message : String(e), notas, sello };
  }
}

// ---------------------------------------------------------------- Alias de presentación (colisiones)

/**
 * Alias de PRESENTACIÓN local: si dos registros comparten `viaje-NNN` o `veh-NNN` (p. ej., creados en dos
 * dispositivos y fusionados), se muestran con un sufijo del id interno. Nada sellado cambia.
 */
export function aliasPresentacion(registros: { id: string; alias: string }[]): Map<string, string> {
  const cuenta = new Map<string, number>();
  for (const r of registros) cuenta.set(r.alias, (cuenta.get(r.alias) ?? 0) + 1);
  return new Map(registros.map((r) => [r.id, (cuenta.get(r.alias) ?? 0) > 1 ? `${r.alias} · ${r.id.slice(0, 6)}` : r.alias]));
}

/** Ids de registros cuyo alias se repite (se excluyen del paquete hasta resolverlo, sin tocar sellos). */
function repetidos(registros: { id: string; alias: string }[]): Set<string> {
  const por = new Map<string, string[]>();
  for (const r of registros) por.set(r.alias, [...(por.get(r.alias) ?? []), r.id]);
  return new Set([...por.values()].filter((ids) => ids.length > 1).flat());
}

// ---------------------------------------------------------------- Paquete para la CLI de #55

export interface Excluido {
  codigo: string;
  motivo: string;
}

/**
 * `paquete-medicion.json` con `crearPaquete` del contrato (huella del sobre completo). Solo viajes
 * cerrados. Se excluyen, informando el motivo: fichas que el contrato rechaza, sellos que no verifican y
 * alias repetidos entre dispositivos (la CLI los confundiría). El original viaja tal cual.
 */
export async function paqueteMedicion(d: DatosCampo): Promise<{ paquete: Paquete; excluidos: Excluido[] }> {
  const vivos = d.viajes.filter((v) => v.estado !== 'anulado');
  const codigosRepetidos = repetidos(vivos.map((v) => ({ id: v.id, alias: v.codigo })));
  const vehRepetidos = repetidos(d.vehiculos.map((v) => ({ id: v.id, alias: v.alias })));
  const excluidos: Excluido[] = [];
  const viajes: ViajeExportado[] = [];
  for (const v of [...d.viajes].filter((x) => x.estado === 'cerrado').sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    if (codigosRepetidos.has(v.id)) {
      excluidos.push({ codigo: v.codigo, motivo: 'código repetido en otro viaje de este dispositivo (fusión de dos equipos): expórtalo desde su equipo de origen' });
      continue;
    }
    if (vehRepetidos.has(v.vehiculoId)) {
      excluidos.push({ codigo: v.codigo, motivo: 'alias de vehículo repetido (fusión de dos equipos)' });
      continue;
    }
    try {
      const local = fichaDeViaje(d, v);
      validarFicha(local.ficha);
      if (local.presupuesto && !esAnterior(local.presupuesto) && local.original) {
        const s = await verificarSelloLocal(local.presupuesto);
        if (!s.ok) throw new Error(`sello no verificado (${s.motivo})`);
      }
      viajes.push({ id: v.codigo, ficha: local.ficha, original: local.original });
    } catch (e) {
      excluidos.push({ codigo: v.codigo, motivo: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!viajes.length) throw new Error(`No hay viajes cerrados exportables.${excluidos.length ? ' ' + excluidos.map((x) => `${x.codigo}: ${x.motivo}`).join(' · ') : ''}`);
  return { paquete: await crearPaquete(viajes), excluidos };
}

export type { PresupuestoSellado };
