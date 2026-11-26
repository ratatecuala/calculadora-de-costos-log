/**
 * Exportación (D-5): CSV compatible con Excel (UTF-8 con BOM, separador `;`, coma decimal, sin separador
 * de miles). El paquete para la CLI lo arma el contrato de #55 (`paqueteMedicion` en `campo.ts`).
 * Las fotos NUNCA se exportan aquí (D-3).
 */
import { distanciaViaje, intervaloDelViaje, intervalosLleno, ordenarCargas } from './calculos';
import { aliasPresentacion, fichaDeViaje, FORMATO_ANTERIOR, informeViaje, tiemposDesglosados, totalMinutos, type DatosCampo } from './campo';
import type { CargaCombustible, Lectura, Viaje } from './modelo';
import { esAnterior } from './modelo';
import { huellaCorta } from './sello';
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

export type Datos = DatosCampo;

const lect = (l: Lectura | null) => [l?.valor ?? null, l ? l.clase.toUpperCase() : ''];

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
  'km', 'km_clase', 'km_fuente', 'km_incertidumbre', 'tiempos_desglosados', 'solo_marcha_declarada', 'total_min', 'marcha_min', 'espera_min', 'carga_min', 'descarga_min', 'pausa_min', 'tiempos_clase',
  'recorrido', 'nivel_carga', 'aire', 'base_clp', 'no_aplica', 'tag_clp', 'tag_cobertura', 'ayudantes_clp', 'ayudantes_cobertura', 'otros_clp', 'otros_cobertura',
  'presupuesto_id', 'presupuesto_estado', 'presupuesto_formato', 'modalidad', 'sello_sha256_12', 'intervalo_id', 'intervalo_uso', 'costo_previsto_clp', 'costo_previsto_tipo',
];

export function viajesCsv(d: Datos): string {
  const alias = aliasPresentacion(d.viajes.map((v) => ({ id: v.id, alias: v.codigo })));
  const aliasVeh = aliasPresentacion(d.vehiculos.map((v) => ({ id: v.id, alias: v.alias })));
  const filas = [...d.viajes]
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((v) => {
      const { veh, pres, intervalo } = contexto(d, v);
      const dist = distanciaViaje(v, veh);
      const cerrado = v.fin !== null;
      const min = minutosPorTipo(v.tramos, v.fin);
      const conEstados = tiemposDesglosados(v);
      const anterior = pres ? esAnterior(pres) : false;
      const suma = (k: 'peajes' | 'ayudantes' | 'otros') => {
        const l = v.comprobantes.filter((r) => r.partida === k);
        return l.length ? l.reduce((s, r) => s + r.clp, 0) : null;
      };
      // Clases y minutos: los mismos de la ficha del contrato (medido ≠ declarado; sin estados, faltante).
      let obs: ReturnType<typeof fichaDeViaje>['ficha']['observacion'] | null = null;
      try {
        obs = veh ? fichaDeViaje(d, v).ficha.observacion : null;
      } catch {
        obs = null;
      }
      const claseKm = obs?.km?.[1] ?? '';
      const val = (x: [number, string] | null | undefined) => (x ? x[0] : null);
      return [
        alias.get(v.id) ?? v.codigo, veh ? (aliasVeh.get(veh.id) ?? veh.alias) : null, v.uso, v.estado, fechaDe(v.inicio), horaDe(v.inicio), fechaDe(v.fin), horaDe(v.fin), v.zona, v.horaEditada,
        ...lect(v.lecturas.inicial.trip), ...lect(v.lecturas.final.trip), ...lect(v.lecturas.inicial.odometro), ...lect(v.lecturas.final.odometro),
        dist.km, claseKm, dist.fuente, dist.km !== null ? (v.incertidumbreKm ?? null) : null,
        cerrado ? conEstados : null,
        cerrado && !conEstados ? v.soloMarchaDeclarada === true : null,
        totalMinutos(v),
        // Sin botones de estado (ni «todo fue marcha» declarado) el total NO es marcha: queda vacío.
        val(obs?.marchaMin),
        val(obs?.esperaMin),
        val(obs?.cargaMin),
        val(obs?.descargaMin),
        cerrado && conEstados ? min.pausa : null,
        obs?.marchaMin?.[1] ?? '',
        v.recorrido, v.nivelCarga, v.aire, v.baseClp ?? null, v.noAplica?.length ? v.noAplica.join(' ') : null,
        suma('peajes'), v.cobertura.peajes, suma('ayudantes'), v.cobertura.ayudantes, suma('otros'), v.cobertura.otros,
        pres?.datos.id ?? null, pres?.estado ?? null, pres ? (anterior ? FORMATO_ANTERIOR : 'contrato #55') : null,
        pres && !esAnterior(pres) ? (pres.datos.plan.modalidad ?? 'detallada') : null, pres ? huellaCorta(pres.sha256) : null,
        intervalo?.codigo ?? null, intervalo?.hasta.cierreIntervalo?.muestra ?? null,
        pres && !anterior ? (pres.datos.resultado?.costoClp ?? null) : null, pres && !anterior ? (pres.datos.resultado?.tipo ?? null) : null,
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

export const COLUMNAS_COMPARACION = [
  'id_viaje', 'partida', 'unidad', 'estado_presupuesto', 'previsto', 'recalculado', 'referencia', 'evidencia_referencia',
  'diferencia', 'error_pct', 'sentido', 'alcance_estado', 'comparable_independiente', 'estado',
];

const ETAPA_RECORRIDO: [string, string][] = [
  ['km', 'km'], ['marchaMin', 'min'], ['esperaMin', 'min'], ['cargaMin', 'min'], ['descargaMin', 'min'], ['totalMin', 'min'],
];
const pct = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

/**
 * `comparacion.csv` con el INFORME del contrato de #55 (`compararFicha`). La columna
 * «comparable_independiente» es la de `conciliacionIndependiente` del contrato: no se marca por el solo
 * hecho de tener una referencia.
 */
export async function comparacionCsv(d: Datos): Promise<string> {
  const filas: (string | number | boolean | null)[][] = [];
  const alias = aliasPresentacion(d.viajes.map((v) => ({ id: v.id, alias: v.codigo })));
  for (const v of [...d.viajes].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    if (v.estado !== 'cerrado') continue;
    const cod = alias.get(v.id) ?? v.codigo;
    const r = await informeViaje(d, v);
    const notas = r.notas.join(' ');
    if (!r.informe) {
      filas.push([cod, null, null, null, null, null, null, null, null, null, 'sin comparación', null, null, [r.error, notas].filter(Boolean).join(' ')]);
      continue;
    }
    const inf = r.informe;
    for (const [k, unidad] of ETAPA_RECORRIDO) {
      const x = inf.recorrido[k];
      if (!x) continue;
      // Presentación: se quitan restos de coma flotante (18 − 20,3 = −2,3000000000000007); el paquete conserva el valor.
      const dif = x.diferencia === null ? null : Math.round(x.diferencia * 1e6) / 1e6;
      filas.push([cod, k, unidad, inf.estadoPresupuesto, x.previsto, null, x.referencia, x.evidencia ?? null, dif, pct(x.porcentaje), x.sentido, null, null, k === 'km' ? notas : null]);
    }
    // Combustible: el km/L es del INTERVALO (medido sobre el intervalo); los litros del viaje son una
    // ASIGNACIÓN estimada, nunca consumo medido del viaje.
    const ref = inf.referencias;
    const inc = ref.incertidumbreCombustible;
    filas.push([cod, 'rendimientoIntervalo', 'km/L', inf.estadoPresupuesto, null, null, ref.rendimientoMedidoIntervaloKmL, ref.rendimientoMedidoIntervaloKmL === null ? 'DATO FALTANTE' : 'medido sobre el intervalo', null, null, null, null, ref.claseComparable, ref.intervalo.motivos.join('; ') || 'intervalo utilizable']);
    filas.push([cod, 'litrosAsignados', 'L', inf.estadoPresupuesto, null, null, ref.litrosAsignadosEstimados, ref.litrosAsignadosEstimados === null ? 'DATO FALTANTE' : 'ESTIMADO (asignado, no medido)', null, null, null, null, null, inc.litros ? `rango ${inc.litros.inferior ?? '?'}–${inc.litros.superior ?? 'abierto'} L` : `incertidumbres faltantes: ${inc.faltan.join(', ') || '—'}`]);
    if (inc.combustibleClp) filas.push([cod, 'combustibleRango', 'CLP', inf.estadoPresupuesto, null, null, null, 'ESTIMADO (sensibilidad)', null, null, null, null, null, `rango ${inc.combustibleClp.inferior ?? '?'}–${inc.combustibleClp.superior ?? 'abierto'}`]);
    for (const [k, c] of Object.entries(inf.comparacionClp)) {
      const l = inf.conciliacionIndependiente.partidas[k as keyof typeof inf.conciliacionIndependiente.partidas];
      filas.push([
        cod, k, 'CLP', inf.estadoPresupuesto, c.original.previsto, c.recalculado.previsto, c.original.referencia,
        l?.evidencia ?? c.evidencia ?? null, c.original.diferencia, pct(c.original.porcentaje), c.original.sentido,
        l?.estado ?? null, l ? l.comparable : null, inf.conciliacionIndependiente.estado,
      ]);
    }
  }
  return csv(COLUMNAS_COMPARACION, filas);
}
