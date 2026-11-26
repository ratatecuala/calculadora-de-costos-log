/**
 * Cálculos repetitivos de la herramienta (diferencias de km, orden de cargas, intervalos) y avisos de
 * coherencia física (D-6). Ninguno es una fórmula económica ni reemplaza al motor o al instrumento de
 * Codex: el rendimiento (km/L) y la comparación económica quedan para el contrato de #55.
 *
 * TRIP y odómetro NO son intercambiables:
 * - la distancia sale del TRIP; si no hay TRIP, de la diferencia de odómetro;
 * - la ubicación del viaje dentro de un intervalo de cargas sale SOLO del odómetro.
 *
 * Los avisos nunca bloquean: el usuario decide. Los umbrales configurables están vacíos por defecto y,
 * mientras estén vacíos, el aviso correspondiente no existe.
 */
import type { CargaCombustible, Umbrales, VehiculoMedicion, Viaje } from './modelo';
import { minutosPorTipo } from './tiempo';

/** Decimales que corresponden a una resolución (0,1 → 1; 1 → 0; 0,01 → 2). */
export function decimales(resolucion: number | null): number {
  if (resolucion === null || !(resolucion > 0)) return 1;
  const s = String(resolucion);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Redondea a la resolución del instrumento (evita 12,299999 al restar lecturas con decimales). */
export function aResolucion(valor: number, resolucion: number | null): number {
  const d = decimales(resolucion);
  return Number(valor.toFixed(d));
}

export interface Distancia {
  km: number | null;
  fuente: 'trip' | 'trip-reiniciado' | 'odometro' | null;
  resolucion: number | null;
  /** Por qué no hay distancia (o por qué se usó el odómetro). */
  motivo: string | null;
}

export function distanciaViaje(v: Viaje, veh: VehiculoMedicion | null): Distancia {
  const ti = v.lecturas.inicial.trip;
  const tf = v.lecturas.final.trip;
  const oi = v.lecturas.inicial.odometro;
  const of = v.lecturas.final.odometro;
  const resTrip = veh?.resolucionTripKm ?? null;
  const resOdo = veh?.resolucionOdometroKm ?? null;
  if (v.tripReiniciadoKm !== null) {
    return { km: aResolucion(v.tripReiniciadoKm, resTrip), fuente: 'trip-reiniciado', resolucion: resTrip, motivo: 'El TRIP se reinició: km declarados por el usuario' };
  }
  if (ti && tf) {
    const d = aResolucion(tf.valor - ti.valor, resTrip);
    if (d >= 0) return { km: d, fuente: 'trip', resolucion: resTrip, motivo: null };
    if (!(oi && of)) return { km: null, fuente: null, resolucion: resTrip, motivo: 'La lectura final del TRIP es menor que la inicial' };
  }
  if (oi && of) {
    const d = aResolucion(of.valor - oi.valor, resOdo);
    if (d >= 0) return { km: d, fuente: 'odometro', resolucion: resOdo, motivo: ti && tf ? 'TRIP incoherente: se usó el odómetro' : 'Sin TRIP: diferencia de odómetro' };
    return { km: null, fuente: null, resolucion: resOdo, motivo: 'El odómetro final es menor que el inicial' };
  }
  return { km: null, fuente: null, resolucion: null, motivo: 'Faltan la lectura inicial o la final' };
}

/** Último odómetro conocido del vehículo (cargas y viajes), o `null`. */
export function ultimoOdometro(vehiculoId: string, viajes: Viaje[], cargas: CargaCombustible[], excluirViajeId?: string): number | null {
  let max: number | null = null;
  const ver = (n: number | null | undefined) => {
    if (typeof n === 'number' && Number.isFinite(n)) max = max === null ? n : Math.max(max, n);
  };
  for (const c of cargas) if (c.vehiculoId === vehiculoId) ver(c.odometro);
  for (const v of viajes) {
    if (v.vehiculoId !== vehiculoId || v.id === excluirViajeId || v.estado === 'anulado') continue;
    ver(v.lecturas.inicial.odometro?.valor);
    ver(v.lecturas.final.odometro?.valor);
  }
  return max;
}

export type NivelAviso = 'aviso' | 'info';
export interface Aviso {
  codigo: string;
  nivel: NivelAviso;
  texto: string;
}

/** Avisos al escribir una lectura (no bloquean). */
export function avisosLectura(
  instrumento: 'trip' | 'odometro',
  momento: 'inicial' | 'final',
  valor: number,
  v: Viaje,
  ultimoOdo: number | null,
): Aviso[] {
  const avisos: Aviso[] = [];
  if (!Number.isFinite(valor) || valor < 0) avisos.push({ codigo: 'lectura-negativa', nivel: 'aviso', texto: 'La lectura debe ser un número mayor o igual a 0.' });
  if (instrumento === 'odometro' && ultimoOdo !== null && valor < ultimoOdo) {
    avisos.push({ codigo: 'odometro-retrocede', nivel: 'aviso', texto: `El odómetro retrocede: el último conocido es ${ultimoOdo}. Revisa el número.` });
  }
  if (momento === 'final') {
    const ini = v.lecturas.inicial[instrumento];
    if (ini && valor < ini.valor) {
      avisos.push(
        instrumento === 'trip'
          ? { codigo: 'trip-menor', nivel: 'aviso', texto: 'La lectura final es menor que la inicial. ¿Se reinició el TRIP? Puedes marcarlo y escribir los km.' }
          : { codigo: 'odometro-menor', nivel: 'aviso', texto: 'El odómetro final es menor que el inicial. Revisa el número.' },
      );
    }
  }
  if (instrumento === 'trip' && momento === 'inicial' && valor !== 0) {
    avisos.push({ codigo: 'trip-no-cero', nivel: 'info', texto: 'Sugerencia: pon el TRIP en cero al salir y registra 0.' });
  }
  return avisos;
}

/**
 * Avisos del viaje con los umbrales del propietario. Un umbral vacío (`null`) desactiva su aviso:
 * no hay valores por defecto porque no existe fuente para ellos (D-6).
 */
export function avisosViaje(v: Viaje, veh: VehiculoMedicion | null, kmPrevisto: number | null, u: Umbrales, ahora: Date = new Date()): Aviso[] {
  const avisos: Aviso[] = [];
  const dist = distanciaViaje(v, veh);
  if (v.lecturas.final.trip && v.lecturas.inicial.trip && v.lecturas.final.trip.valor < v.lecturas.inicial.trip.valor && v.tripReiniciadoKm === null) {
    avisos.push({ codigo: 'trip-menor', nivel: 'aviso', texto: 'TRIP final menor que el inicial: marca «el TRIP se reinició» o corrige la lectura.' });
  }
  if (v.lecturas.final.odometro && v.lecturas.inicial.odometro && v.lecturas.final.odometro.valor < v.lecturas.inicial.odometro.valor) {
    avisos.push({ codigo: 'odometro-menor', nivel: 'aviso', texto: 'El odómetro final es menor que el inicial.' });
  }
  if (u.velocidadMediaKmH !== null && dist.km !== null) {
    const marcha = minutosPorTipo(v.tramos, v.fin, ahora).marcha;
    if (marcha > 0 && dist.km / (marcha / 60) > u.velocidadMediaKmH) {
      avisos.push({ codigo: 'velocidad', nivel: 'aviso', texto: `Los km y los minutos de marcha implican más de ${u.velocidadMediaKmH} km/h de media (tu umbral). Revisa las lecturas o los tramos.` });
    }
  }
  if (u.desvioKmPct !== null && dist.km !== null && kmPrevisto !== null && kmPrevisto > 0) {
    if ((Math.abs(dist.km - kmPrevisto) / kmPrevisto) * 100 > u.desvioKmPct) {
      avisos.push({ codigo: 'desvio-km', nivel: 'aviso', texto: `Los km observados difieren del previsto en más de ${u.desvioKmPct} % (tu umbral).` });
    }
  }
  if (u.viajeAbiertoHoras !== null && v.estado === 'en curso') {
    const horas = (ahora.getTime() - Date.parse(v.inicio)) / 3_600_000;
    if (horas > u.viajeAbiertoHoras) avisos.push({ codigo: 'viaje-abierto', nivel: 'aviso', texto: `El viaje lleva abierto más de ${u.viajeAbiertoHoras} h (tu umbral). ¿Olvidaste finalizarlo?` });
  }
  return avisos;
}

// ---------------------------------------------------------------- Cargas de combustible

/** Total de la boleta: litros × $/L, al peso. `null` si falta el precio. */
export function totalCarga(litros: number, precioLitro: number | null): number | null {
  if (precioLitro === null || !Number.isFinite(litros) || !Number.isFinite(precioLitro)) return null;
  return Math.round(litros * precioLitro);
}

/** Cargas de un vehículo en orden cronológico (y por creación si empatan). */
export function ordenarCargas(cargas: CargaCombustible[]): CargaCombustible[] {
  return [...cargas].sort((a, b) => Date.parse(a.fechaHora) - Date.parse(b.fechaHora) || a.creadoEl.localeCompare(b.creadoEl));
}

/** Avisos al registrar una carga (no bloquean). `existentes`: las otras cargas del mismo vehículo. */
export function avisosCarga(c: CargaCombustible, existentes: CargaCombustible[], veh: VehiculoMedicion | null): Aviso[] {
  const avisos: Aviso[] = [];
  if (!(c.litros > 0)) avisos.push({ codigo: 'litros', nivel: 'aviso', texto: 'Los litros deben ser mayores que 0. Esta carga no entra en intervalos ni en el paquete hasta corregirla.' });
  if (veh?.capacidadEstanqueL != null && c.litros > veh.capacidadEstanqueL) {
    avisos.push({ codigo: 'capacidad', nivel: 'aviso', texto: `Los litros superan la capacidad declarada del estanque (${veh.capacidadEstanqueL} L).` });
  }
  const otras = ordenarCargas(existentes.filter((x) => x.id !== c.id && x.vehiculoId === c.vehiculoId));
  const ultima = otras.at(-1);
  if (ultima && Date.parse(c.fechaHora) < Date.parse(ultima.fechaHora)) {
    avisos.push({ codigo: 'reordenada', nivel: 'info', texto: 'La fecha es anterior a la última carga: se ordenó en su lugar. Revisa si algún intervalo cambió.' });
  }
  if (c.odometro !== null) {
    const antes = otras.filter((x) => Date.parse(x.fechaHora) <= Date.parse(c.fechaHora) && x.odometro !== null).at(-1);
    const despues = otras.find((x) => Date.parse(x.fechaHora) > Date.parse(c.fechaHora) && x.odometro !== null);
    if ((antes && c.odometro < (antes.odometro as number)) || (despues && c.odometro > (despues.odometro as number))) {
      avisos.push({ codigo: 'odometro-orden', nivel: 'aviso', texto: 'El odómetro no calza con el orden de las fechas (retrocede). Revisa el número o la fecha.' });
    }
  }
  return avisos;
}

/** Km desde la carga anterior con odómetro (por id). `null` si falta alguno de los dos odómetros. */
export function kmDesdeAnterior(ordenadas: CargaCombustible[]): Map<string, number | null> {
  const r = new Map<string, number | null>();
  let previo: number | null = null;
  for (const c of ordenadas) {
    r.set(c.id, c.odometro !== null && previo !== null && c.odometro >= previo ? c.odometro - previo : null);
    if (c.odometro !== null) previo = c.odometro;
  }
  return r;
}

export interface IntervaloLleno {
  /** I-01, I-02… en orden cronológico. */
  codigo: string;
  vehiculoId: string;
  desde: CargaCombustible;
  hasta: CargaCombustible;
  /** Parciales entre los dos llenados. */
  parciales: CargaCombustible[];
  /** Km por odómetro entre los dos llenados (`null` si falta un odómetro). */
  km: number | null;
}

/**
 * Intervalos lleno a lleno (opcionales, para calibración controlada): entre dos cargas llenas
 * consecutivas del mismo vehículo, con las parciales intermedias. Las cargas con litros ≤ 0 no cuentan.
 * No calcula km/L: eso es `rendimiento()` del contrato de Codex.
 */
export function intervalosLleno(cargas: CargaCombustible[], vehiculoId: string): IntervaloLleno[] {
  const lista = ordenarCargas(cargas.filter((c) => c.vehiculoId === vehiculoId && c.litros > 0));
  const out: IntervaloLleno[] = [];
  let desde: CargaCombustible | null = null;
  let parciales: CargaCombustible[] = [];
  for (const c of lista) {
    if (!c.lleno) {
      if (desde) parciales.push(c);
      continue;
    }
    if (desde) {
      const km = desde.odometro !== null && c.odometro !== null && c.odometro >= desde.odometro ? c.odometro - desde.odometro : null;
      out.push({ codigo: `I-${String(out.length + 1).padStart(2, '0')}`, vehiculoId, desde, hasta: c, parciales, km });
    }
    desde = c;
    parciales = [];
  }
  return out;
}

/** Intervalo que contiene el viaje, solo por odómetro (inicial y final dentro del intervalo). */
export function intervaloDelViaje(v: Viaje, intervalos: IntervaloLleno[]): IntervaloLleno | null {
  const oi = v.lecturas.inicial.odometro?.valor;
  const of = v.lecturas.final.odometro?.valor;
  if (oi === undefined || of === undefined) return null;
  return (
    intervalos.find((i) => i.desde.odometro !== null && i.hasta.odometro !== null && oi >= i.desde.odometro && of <= i.hasta.odometro) ?? null
  );
}
