/**
 * Exportación (D-5): CSV compatible con Excel (UTF-8 con BOM, separador `;`, coma decimal, sin separador
 * de miles) y `paquete-medicion.json` con la forma de la ficha y del presupuesto original de #55.
 * Las fotos NUNCA se exportan aquí (D-3).
 */
import { distanciaViaje, intervaloDelViaje, intervalosLleno, ordenarCargas, type IntervaloLleno } from './calculos';
import { compararViaje } from './contrato-provisional';
import type {
  CargaCombustible,
  ClaseCampo,
  DatoCampo,
  Lectura,
  PlanCampo,
  PresupuestoSellado,
  VehiculoMedicion,
  Viaje,
} from './modelo';
import { CLASE_A_CAMPO, CLASE_DE_FUENTE_PRECIO } from './presupuesto';
import { huella, huellaCorta } from './sello';
import { fechaDe, horaDe, minutosPorTipo } from './tiempo';

export const BOM = '﻿';

/** Una celda: `null` → vacía; número con coma decimal; texto escapado y protegido contra fórmulas. */
export function celda(x: string | number | boolean | null | undefined): string {
  if (x === null || x === undefined) return '';
  if (typeof x === 'boolean') return x ? 'sí' : 'no';
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) return '';
    return String(x).replace('.', ',');
  }
  let s = x;
  // Excel interpreta = + - @ al inicio como fórmula: se antepone un apóstrofo.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(columnas: string[], filas: (string | number | boolean | null | undefined)[][]): string {
  return BOM + [columnas.map(celda).join(';'), ...filas.map((f) => f.map(celda).join(';'))].join('\r\n') + '\r\n';
}

export interface Datos {
  vehiculos: VehiculoMedicion[];
  presupuestos: PresupuestoSellado[];
  viajes: Viaje[];
  cargas: CargaCombustible[];
}

const lect = (l: Lectura | null) => [l?.valor ?? null, l ? (CLASE_A_CAMPO[l.clase] ?? '') : ''];

function contexto(d: Datos, v: Viaje) {
  const veh = d.vehiculos.find((x) => x.id === v.vehiculoId) ?? null;
  const pres = v.presupuestoId ? (d.presupuestos.find((p) => p.id === v.presupuestoId) ?? null) : null;
  const intervalos = intervalosLleno(d.cargas, v.vehiculoId);
  const intervalo = intervaloDelViaje(v, intervalos);
  return { veh, pres, intervalo };
}

export const COLUMNAS_VIAJES = [
  'id_viaje', 'vehiculo', 'uso', 'estado', 'fecha_inicio', 'hora_inicio', 'fecha_fin', 'hora_fin', 'zona', 'hora_editada',
  'trip_ini', 'trip_ini_clase', 'trip_fin', 'trip_fin_clase', 'odometro_ini', 'odometro_ini_clase', 'odometro_fin', 'odometro_fin_clase',
  'km', 'km_clase', 'km_fuente', 'marcha_min', 'espera_min', 'carga_min', 'descarga_min', 'pausa_min', 'tiempos_clase',
  'recorrido', 'nivel_carga', 'aire', 'tag_clp', 'tag_cobertura', 'ayudantes_clp', 'ayudantes_cobertura', 'otros_clp', 'otros_cobertura',
  'presupuesto_id', 'presupuesto_estado', 'sello_sha256_12', 'intervalo_id', 'intervalo_uso', 'costo_previsto_clp', 'costo_previsto_tipo',
];

export function viajesCsv(d: Datos): string {
  const filas = [...d.viajes]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((v) => {
      const { veh, pres, intervalo } = contexto(d, v);
      const dist = distanciaViaje(v, veh);
      const cerrado = v.fin !== null;
      const min = minutosPorTipo(v.tramos, v.fin);
      const conEstados = v.tramos.length > 1;
      const suma = (k: 'peajes' | 'ayudantes' | 'otros') => {
        const l = v.comprobantes.filter((r) => r.partida === k);
        return l.length ? l.reduce((s, r) => s + r.clp, 0) : null;
      };
      const claseKm = dist.km === null ? '' : v.uso === 'simulacion' ? 'SIMULADO' : dist.fuente === 'trip-reiniciado' ? 'DECLARADO' : 'MEDIDO';
      return [
        v.codigo, veh?.alias ?? null, v.uso, v.estado, fechaDe(v.inicio), horaDe(v.inicio), fechaDe(v.fin), horaDe(v.fin), v.zona, v.horaEditada,
        ...lect(v.lecturas.inicial.trip), ...lect(v.lecturas.final.trip), ...lect(v.lecturas.inicial.odometro), ...lect(v.lecturas.final.odometro),
        dist.km, claseKm, dist.fuente,
        cerrado ? min.marcha : null,
        cerrado && conEstados ? min.espera : null,
        cerrado && conEstados ? min.carga : null,
        cerrado && conEstados ? min.descarga : null,
        cerrado && conEstados ? min.pausa : null,
        cerrado ? (v.horaEditada ? 'DECLARADO' : 'MEDIDO') : '',
        v.recorrido, v.nivelCarga, v.aire,
        suma('peajes'), v.cobertura.peajes, suma('ayudantes'), v.cobertura.ayudantes, suma('otros'), v.cobertura.otros,
        pres?.datos.id ?? null, pres?.estado ?? null, pres ? huellaCorta(pres.sha256) : null,
        intervalo?.codigo ?? null, intervalo?.hasta.cierreIntervalo?.muestra ?? null,
        pres?.datos.resultado?.costoClp ?? null, pres?.datos.resultado?.tipo ?? null,
      ];
    });
  return csv(COLUMNAS_VIAJES, filas);
}

export const COLUMNAS_CARGAS = ['id', 'vehiculo', 'fecha', 'hora', 'litros', 'precio_l', 'total_clp', 'total_editado', 'fuente_precio', 'odometro', 'lleno', 'intervalo_id'];

export function cargasCsv(d: Datos): string {
  const filas: (string | number | boolean | null)[][] = [];
  for (const veh of d.vehiculos) {
    const intervalos = intervalosLleno(d.cargas, veh.id);
    const deCarga = (c: CargaCombustible) => intervalos.find((i) => i.hasta.id === c.id || i.parciales.some((p) => p.id === c.id))?.codigo ?? null;
    for (const c of ordenarCargas(d.cargas.filter((x) => x.vehiculoId === veh.id))) {
      filas.push([c.id, veh.alias, fechaDe(c.fechaHora), horaDe(c.fechaHora), c.litros, c.precioLitro, c.totalClp, c.totalEditado, c.fuentePrecio, c.odometro, c.lleno, deCarga(c)]);
    }
  }
  return csv(COLUMNAS_CARGAS, filas);
}

export const COLUMNAS_COMPARACION = ['id_viaje', 'partida', 'unidad', 'estado_presupuesto', 'previsto', 'recalculado', 'referencia', 'clase_referencia', 'diferencia', 'error_pct', 'sentido', 'independiente', 'estado'];

export function comparacionCsv(d: Datos): string {
  const filas: (string | number | null)[][] = [];
  for (const v of [...d.viajes].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    if (v.estado === 'anulado') continue;
    const { veh, pres, intervalo } = contexto(d, v);
    const cmp = compararViaje({
      viaje: v,
      vehiculo: veh,
      sello: pres ? { plan: pres.datos.plan, resultado: pres.datos.resultado, fecha: pres.datos.fecha } : null,
      anulado: pres?.estado === 'anulado',
      intervalo,
      uso: v.uso,
    });
    for (const t of cmp.tarjetas) {
      // Km/minutos (instrumento) y comprobantes completos son referencias independientes del motor; el
      // recalculado nunca lo es. Combustible: lo decide el contrato de Codex (calibración/validación).
      const independiente = t.referencia === null ? null : 'sí';
      filas.push([
        v.codigo, t.partida, t.unidad, cmp.estadoPresupuesto, t.sellado, t.recalculado, t.referencia, t.claseReferencia,
        t.diferencia?.diferencia ?? null, t.diferencia?.porcentaje === null || t.diferencia?.porcentaje === undefined ? null : Math.round(t.diferencia.porcentaje * 10) / 10,
        t.diferencia?.sentido ?? 'sin comparación', independiente, t.estado,
      ]);
    }
  }
  return csv(COLUMNAS_COMPARACION, filas);
}

// ---------------------------------------------------------------- Paquete para la CLI de #55

const PLAN_VACIO: PlanCampo = {
  baseClp: null, ajusteHasta: null, muestraPrevista: null, resolucionKm: null, incertidumbreKm: null, km: null, marchaMin: null,
  esperaMin: null, cargaMin: null, descargaMin: null, kmL: null, precioLitro: null, fuentePrecio: null, desgasteKm: null, fijoHora: null,
  trabajoHora: null, ayudantes: null, pagoAyudante: null, tag: null, otros: null, margenPct: null, recargos: null, cotizado: null,
};

function intervaloFicha(i: IntervaloLleno, alias: string, sim: boolean) {
  const cl = (c: ClaseCampo): ClaseCampo => (sim ? 'SIMULADO' : c);
  const r = (c: CargaCombustible) => ({
    fecha: fechaDe(c.fechaHora),
    lleno: c.lleno,
    odometro: c.odometro === null ? null : ([c.odometro, cl('MEDIDO')] as DatoCampo),
    litros: [c.litros, cl(c.fuentePrecio === 'boleta' ? 'COMPROBADO' : 'MEDIDO')] as DatoCampo,
  });
  const m = i.hasta.cierreIntervalo;
  return {
    vehiculo: alias,
    registroCompleto: m?.registroCompleto ?? null,
    recorrido: m?.recorrido ?? null,
    carga: m?.carga ?? null,
    aire: m?.aire ?? null,
    muestra: m?.muestra ?? null,
    recargas: [i.desde, ...i.parciales, i.hasta].map(r),
  };
}

/** Ficha en la forma exacta de `plantilla-economica.json` de #55. */
export function fichaDeViaje(d: Datos, v: Viaje) {
  const { veh, pres, intervalo } = contexto(d, v);
  if (!veh) throw new Error(`El viaje ${v.codigo} no tiene vehículo.`);
  const sim = v.uso === 'simulacion';
  const cl = (c: ClaseCampo): ClaseCampo => (sim ? 'SIMULADO' : c);
  const dato = (n: number | null, c: ClaseCampo): DatoCampo => (n === null ? null : [n, cl(c)]);
  const dist = distanciaViaje(v, veh);
  const cerrado = v.fin !== null;
  const min = minutosPorTipo(v.tramos, v.fin);
  const conEstados = v.tramos.length > 1;
  const claseT: ClaseCampo = v.horaEditada ? 'DECLARADO' : 'MEDIDO';
  const lec = (l: Lectura | null): DatoCampo => (l ? dato(l.valor, l.clase === 'medido' ? 'MEDIDO' : 'DECLARADO') : null);
  const claseKm: ClaseCampo =
    dist.fuente === 'trip-reiniciado'
      ? 'DECLARADO'
      : [v.lecturas.inicial, v.lecturas.final].every((m) => (dist.fuente === 'odometro' ? m.odometro : m.trip)?.clase === 'medido')
        ? 'MEDIDO'
        : 'DECLARADO';
  // Precio pagado: la última carga con precio antes del fin del viaje (o del inicio si sigue abierto).
  const limite = Date.parse(v.fin ?? v.inicio);
  const conPrecio = ordenarCargas(d.cargas.filter((c) => c.vehiculoId === v.vehiculoId && c.precioLitro !== null && c.fuentePrecio && Date.parse(c.fechaHora) <= limite)).at(-1);
  const precioLitro = conPrecio && conPrecio.fuentePrecio ? dato(conPrecio.precioLitro, CLASE_A_CAMPO[CLASE_DE_FUENTE_PRECIO[conPrecio.fuentePrecio]] as ClaseCampo) : null;
  const res = dist.fuente === 'odometro' ? veh.resolucionOdometroKm : veh.resolucionTripKm;
  return {
    uso: v.uso,
    vehiculo: veh.alias,
    tipoVehiculo: veh.tipoVehiculo,
    plan: pres ? structuredClone(pres.datos.plan) : structuredClone(PLAN_VACIO),
    observacion: {
      baseClp: null,
      fin: v.fin,
      odometroInicial: lec(v.lecturas.inicial.odometro),
      odometroFinal: lec(v.lecturas.final.odometro),
      incertidumbreKm: null,
      inicio: v.inicio,
      km: dato(dist.km, claseKm),
      marchaMin: cerrado ? dato(min.marcha, claseT) : null,
      esperaMin: cerrado && conEstados ? dato(min.espera, claseT) : null,
      cargaMin: cerrado && conEstados ? dato(min.carga, claseT) : null,
      descargaMin: cerrado && conEstados ? dato(min.descarga, claseT) : null,
      resolucionKm: res !== null && res > 0 && dist.km !== null ? dato(res, 'DECLARADO') : null,
      tipoCarga: null,
      recorrido: v.recorrido,
      nivelCarga: v.nivelCarga,
      aire: v.aire,
      pesoKg: null,
      ayudantes: null,
      minutosAyudantes: null,
      equipo: null,
      precioLitro,
      fuentePrecio: precioLitro ? (conPrecio?.fuentePrecio ?? null) : null,
      cobrado: null,
      comprobantes: v.comprobantes.map((c) => ({ ...c })),
      cobertura: { ...v.cobertura },
      intervalo: intervalo ? intervaloFicha(intervalo, veh.alias, sim) : null,
      mantencion: null,
      fijos: null,
    },
  };
}

export const FORMATO_PAQUETE = 1 as const;

/**
 * `paquete-medicion.json`: por viaje cerrado, la ficha y el presupuesto original `{datos, sha256}`.
 * PROVISIONAL hasta que Codex publique la acción `importar` y el tipo `Paquete` definitivo.
 */
export async function paqueteMedicion(d: Datos) {
  const viajes = [...d.viajes]
    .filter((v) => v.estado === 'cerrado')
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((v) => {
      const pres = v.presupuestoId ? d.presupuestos.find((p) => p.id === v.presupuestoId) : undefined;
      return {
        id: v.codigo,
        ficha: fichaDeViaje(d, v),
        original: pres && pres.estado === 'sellado' ? { datos: structuredClone(pres.datos), sha256: pres.sha256 } : null,
      };
    });
  return { formato: FORMATO_PAQUETE, viajes, sha256: await huella(viajes) };
}
