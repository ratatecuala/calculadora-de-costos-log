/**
 * Alta guiada del vehículo (A-92): borrador de 4 pasos → `VehiculoMedicion`, y vehículo guardado → borrador.
 *
 * Reglas:
 * - Lo que el usuario no sabe queda `null` (DATO FALTANTE): nunca un valor por defecto ni de catálogo.
 * - La resolución del TRIP y del odómetro se DEDUCE de lo que muestra el tablero: con decimal → 0,1 km;
 *   solo enteros → 1 km; «no lo sé» o «no tiene» → desconocida (`null`).
 * - El consumo es DECLARADO por el usuario (de memoria o leído en el tablero), solo con la unidad elegida por
 *   él. L/100 km se convierte a km/L (100 / valor) de forma explícita; el valor y la unidad originales quedan
 *   en el perfil. El consumo INSTANTÁNEO del tablero nunca se usa como rendimiento (solo el promedio).
 * - «No lo sé» es distinto de «no tiene ese instrumento» (sin TRIP, sin indicador de consumo): ambos dejan el
 *   valor desconocido, pero se guarda cuál fue la respuesta.
 * - Marca, modelo, año y motor son metadatos locales: no entran a ningún presupuesto sellado ni al paquete.
 * - Un vehículo del formato anterior (sin perfil) se abre con un borrador deducido en memoria: lo que no
 *   se puede deducir queda sin responder.
 */
import { procedencia } from '../shared/procedencia';
import type { Combustible, DatoMedicion, FormaConsumo, LecturaConsumo, LecturaTablero, PerfilVehiculo, TipoVehiculo, UnidadConsumo, VehiculoMedicion } from './modelo';
import { FORMATO_REGISTRO, nuevoId } from './modelo';
import { siguienteAlias } from './repositorio';

export interface BorradorAlta {
  tipo: TipoVehiculo | null;
  marca: string;
  modelo: string;
  anio: string;
  motor: string;
  /** `null` = no respondió; 'no_se' = respondió «No lo sé». */
  combustible: Combustible | 'no_se' | null;
  trip: LecturaTablero | null;
  odometro: LecturaTablero | null;
  consumo: FormaConsumo | null;
  consumoValor: string;
  /** Sin unidad elegida no hay rendimiento (nunca se supone km/L). */
  consumoUnidad: UnidadConsumo | null;
  /** Solo para el tablero: promedio o instantáneo. */
  consumoLectura: LecturaConsumo | null;
}

export const borradorVacio = (): BorradorAlta => ({
  tipo: null,
  marca: '',
  modelo: '',
  anio: '',
  motor: '',
  combustible: null,
  trip: null,
  odometro: null,
  consumo: null,
  consumoValor: '',
  consumoUnidad: null,
  consumoLectura: null,
});

export const PASOS_ALTA = ['¿Qué vehículo conduces?', 'Identifica tu vehículo', 'Conozcamos tu tablero', '¿Cuánto combustible consume tu vehículo?'] as const;

/** Resolución deducida de lo que muestra el contador. Desconocida = `null`, nunca inventada. */
export function resolucionDe(l: LecturaTablero | null): number | null {
  return l === 'decimal' ? 0.1 : l === 'entero' ? 1 : null;
}

/** Inverso, para abrir un vehículo anterior: solo 0,1 y 1 km se reconocen; otra resolución queda sin responder. */
function lecturaDe(res: number | null): LecturaTablero | null {
  return res === 0.1 ? 'decimal' : res === 1 ? 'entero' : null;
}

const numero = (t: string): number | null => {
  const s = t.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const texto = (t: string): string | null => {
  const s = t.trim().slice(0, 40);
  return s ? s : null;
};

/** Año: entero razonable o `null`. */
export function anioValido(t: string): number | null {
  const s = t.trim();
  if (!/^\d{4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1950 && n <= 2100 ? n : null;
}

/** km/L declarados a partir de la respuesta del paso 4 (o `null` si no lo sabe o el número no sirve). */
export function kmLDeclarado(b: BorradorAlta): number | null {
  if (b.consumo !== 'rendimiento' && b.consumo !== 'tablero') return null;
  if (b.consumo === 'tablero' && b.consumoLectura !== 'promedio') return null;
  const v = numero(b.consumoValor);
  if (v === null || b.consumoUnidad === null) return null;
  return b.consumoUnidad === 'km/L' ? v : 100 / v;
}

/** Errores que impiden guardar (solo el tipo es obligatorio). Lo demás se puede dejar sin responder. */
export function faltaParaGuardar(b: BorradorAlta): string | null {
  return b.tipo ? null : 'Elige el tipo de vehículo (paso 1).';
}

/**
 * Vehículo listo para guardar. Si `previo` existe, conserva su id, alias, fechas y TODO lo que el alta no
 * pregunta (precio por defecto, desgaste, gastos fijos, capacidad, litros del surtidor).
 */
export function vehiculoDesdeAlta(b: BorradorAlta, previo: VehiculoMedicion | null, vehiculos: VehiculoMedicion[], ahora: string): VehiculoMedicion {
  if (!b.tipo) throw new Error('Falta el tipo de vehículo.');
  const hoy = ahora.slice(0, 10);
  const km = kmLDeclarado(b);
  const unidad = b.consumoUnidad === 'L/100km' ? 'L/100 km convertido a km/L' : 'km/L';
  const detalle = b.consumo === 'tablero' ? `promedio del tablero (${unidad})` : `lo sabe el usuario (${unidad})`;
  const kmL: DatoMedicion = km === null ? { valor: null, procedencia: procedencia('faltante', 'vehiculo') } : { valor: km, procedencia: procedencia('declarado', 'vehiculo', detalle, hoy) };
  const perfil: PerfilVehiculo = {
    marca: texto(b.marca),
    modelo: texto(b.modelo),
    anio: anioValido(b.anio),
    motor: texto(b.motor),
    trip: b.trip,
    odometro: b.odometro,
    consumo:
      b.consumo === null
        ? null
        : b.consumo === 'no_se' || b.consumo === 'sin_indicador'
          ? { forma: b.consumo, valor: null, unidad: null, lectura: null }
          : { forma: b.consumo, valor: numero(b.consumoValor), unidad: b.consumoUnidad, lectura: b.consumo === 'tablero' ? b.consumoLectura : null },
  };
  const vacio = (): DatoMedicion => ({ valor: null, procedencia: procedencia('faltante', 'vehiculo') });
  return {
    id: previo?.id ?? nuevoId(),
    formato: FORMATO_REGISTRO,
    alias: previo?.alias ?? siguienteAlias(vehiculos),
    tipoVehiculo: b.tipo,
    combustible: b.combustible === 'no_se' || b.combustible === null ? null : b.combustible,
    // Solo se cambia la resolución si el usuario respondió; si no respondió, se conserva la anterior.
    resolucionTripKm: b.trip === null ? (previo?.resolucionTripKm ?? null) : resolucionDe(b.trip),
    resolucionOdometroKm: b.odometro === null ? (previo?.resolucionOdometroKm ?? null) : resolucionDe(b.odometro),
    ...(previo && previo.resolucionLitros !== undefined ? { resolucionLitros: previo.resolucionLitros } : {}),
    capacidadEstanqueL: previo?.capacidadEstanqueL ?? null,
    porDefecto: {
      precioLitro: previo?.porDefecto.precioLitro ?? { ...vacio(), fuentePrecio: null },
      // Sin respuesta en el paso 4 se conserva lo anterior; «No lo sé» lo deja desconocido.
      kmL: b.consumo === null && previo ? previo.porDefecto.kmL : kmL,
      desgasteKm: previo?.porDefecto.desgasteKm ?? vacio(),
      fijoHora: previo?.porDefecto.fijoHora ?? vacio(),
      trabajoHora: previo?.porDefecto.trabajoHora ?? vacio(),
    },
    perfil,
    creadoEl: previo?.creadoEl ?? ahora,
    editadoEl: ahora,
  };
}

/** Borrador para editar un vehículo guardado. Formato anterior (sin perfil): se deduce en memoria. */
export function borradorDesdeVehiculo(v: VehiculoMedicion): BorradorAlta {
  const p = v.perfil;
  // Sin perfil no se reinterpreta el rendimiento guardado (podría ser MEDIDO): queda sin responder y se conserva.
  const consumo = p?.consumo ?? null;
  return {
    tipo: v.tipoVehiculo,
    marca: p?.marca ?? '',
    modelo: p?.modelo ?? '',
    anio: p?.anio != null ? String(p.anio) : '',
    motor: p?.motor ?? '',
    combustible: v.combustible ?? (p ? 'no_se' : null),
    trip: p ? p.trip : lecturaDe(v.resolucionTripKm),
    odometro: p ? p.odometro : lecturaDe(v.resolucionOdometroKm),
    consumo: consumo?.forma ?? null,
    consumoValor: consumo?.valor != null ? String(consumo.valor).replace('.', ',') : '',
    consumoUnidad: consumo?.unidad ?? null,
    consumoLectura: consumo?.lectura ?? null,
  };
}

/** Nombre para mostrar: «Toyota Yaris 2015» o, si no hay datos, el tipo. El alias interno sigue aparte. */
export function nombreVehiculo(v: VehiculoMedicion): string {
  const p = v.perfil;
  const partes = [p?.marca, p?.modelo, p?.anio != null ? String(p.anio) : null].filter(Boolean);
  return partes.length ? partes.join(' ') : (ETIQUETA_TIPO[v.tipoVehiculo] ?? 'Vehículo');
}

export const ETIQUETA_TIPO: Record<TipoVehiculo, string> = {
  auto: 'Auto / SUV',
  camioneta: 'Camioneta',
  furgon: 'Furgón',
  camion_liviano: 'Camión liviano',
  otro: 'Otro',
};
export const ETIQUETA_COMBUSTIBLE: Record<Combustible, string> = { gasolina: 'Bencina', diesel: 'Diésel', otro: 'Otro' };
