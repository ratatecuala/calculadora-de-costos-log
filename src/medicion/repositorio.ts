/**
 * Operaciones de la herramienta sobre el almacenamiento, con sus reglas:
 * - un presupuesto sellado no se edita ni se vuelve a sellar (corregir = sellar otro y anular el anterior);
 * - la foto NO se conserva por defecto (D-3); si se conserva, se re-codifica sin EXIF y queda solo aquí;
 * - respaldo exportable e importable TODO O NADA (D-2; revisión de GPT sobre el PR #57): validación
 *   profunda, sellos verificados con el contrato de #55, integridad referencial y conflictos informados
 *   ANTES de escribir; luego una sola transacción.
 */
import { z } from 'zod';
import { procedenciaSchema } from '../shared/procedencia';
import type { Almacen, Coleccion, Escritura } from './almacen';
import { verificarSelloLocal } from './campo';
import type { Ajustes, CargaCombustible, FotoLectura, Instrumento, Lectura, PresupuestoLocal, VehiculoMedicion, Viaje } from './modelo';
import { AJUSTES_INICIALES, esAnterior, nuevoId } from './modelo';

export class SelloInmutableError extends Error {}

export interface DatosLocales {
  vehiculos: VehiculoMedicion[];
  /** Formato actual (contrato de #55) y formato anterior, cada uno tal como se selló. */
  presupuestos: PresupuestoLocal[];
  viajes: Viaje[];
  cargas: CargaCombustible[];
  ajustes: Ajustes;
}

export async function cargarTodo(a: Almacen, ahora: string): Promise<DatosLocales> {
  const [vehiculos, presupuestos, viajes, cargas, aj] = await Promise.all([
    a.listar<VehiculoMedicion>('vehiculos'),
    a.listar<PresupuestoLocal>('presupuestos'),
    a.listar<Viaje>('viajes'),
    a.listar<CargaCombustible>('cargas'),
    a.obtener<Ajustes>('ajustes', 'ajustes'),
  ]);
  return { vehiculos, presupuestos, viajes, cargas, ajustes: aj ?? { ...structuredClone(AJUSTES_INICIALES), editadoEl: ahora } };
}

/** Lo que nunca cambia después de sellar (incluida la metadata propia del formato actual). */
const inmutable = (p: PresupuestoLocal) =>
  JSON.stringify([p.formato, p.datos, p.sha256, p.vehiculoId, p.creadoEl, p.reemplazaA, esAnterior(p) ? null : p.meta]);

/**
 * Guarda un presupuesto. Si ya existe con ese `id`, solo acepta el paso sellado → anulado con los mismos
 * datos y huella. Un sello que no verifica con el contrato (o, si es del formato anterior, con su huella
 * original) se rechaza.
 */
export async function guardarPresupuesto(a: Almacen, p: PresupuestoLocal): Promise<void> {
  const v = await verificarSelloLocal(p);
  if (!v.ok) throw new SelloInmutableError(`El sello no verifica: ${v.motivo}`);
  const previo = await a.obtener<PresupuestoLocal>('presupuestos', p.id);
  if (previo) {
    if (inmutable(previo) !== inmutable(p)) throw new SelloInmutableError('Un presupuesto sellado no se edita: sella uno nuevo y anula este.');
    if (previo.estado === 'anulado' && p.estado !== 'anulado') throw new SelloInmutableError('Un presupuesto anulado no se reactiva.');
  }
  await a.guardar('presupuestos', p);
}

/** Siguiente código `viaje-NNN` del dispositivo (máximo entre viajes y presupuestos + 1). */
export function siguienteCodigo(d: Pick<DatosLocales, 'viajes' | 'presupuestos'>): string {
  let max = 0;
  for (const c of [...d.viajes.map((v) => v.codigo), ...d.presupuestos.map((p) => p.datos.id)]) {
    const m = /^viaje-(\d{3,8})$/.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `viaje-${String(max + 1).padStart(3, '0')}`;
}

/** Siguiente alias `veh-NNN`. */
export function siguienteAlias(vehiculos: VehiculoMedicion[]): string {
  let max = 0;
  for (const v of vehiculos) {
    const m = /^veh-(\d{3,8})$/.exec(v.alias);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `veh-${String(max + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------- Fotos (D-3)

/** Por defecto la foto solo sirve para leer el número y NO se guarda. */
export const CONSERVAR_FOTO_POR_DEFECTO = false;

export type Recodificador = (foto: Blob) => Promise<Blob>;

/**
 * Registra una lectura. La foto (si la hay) se usa solo para leer el número: se guarda únicamente si el
 * usuario lo pidió (`conservar === true`), y entonces pasa por `recodificar` (canvas, sin EXIF).
 */
export async function registrarLectura(
  a: Almacen,
  viaje: Viaje,
  momento: 'inicial' | 'final',
  instrumento: Instrumento,
  valor: number,
  opciones: { ahora: string; clase?: Lectura['clase']; foto?: Blob | null; conservar?: boolean; recodificar?: Recodificador },
): Promise<Viaje> {
  let fotoId: string | null = null;
  const conservar = opciones.conservar ?? CONSERVAR_FOTO_POR_DEFECTO;
  if (opciones.foto && conservar) {
    if (!opciones.recodificar) throw new Error('Para conservar la foto hay que re-codificarla (sin EXIF).');
    const blob = await opciones.recodificar(opciones.foto);
    const foto: FotoLectura = { id: nuevoId(), viajeId: viaje.id, blob, creadoEl: opciones.ahora };
    await a.guardar('fotos', foto);
    fotoId = foto.id;
  }
  const lectura: Lectura = { valor, clase: opciones.clase ?? 'medido', fotoId, confirmadaEl: opciones.ahora };
  const actualizado: Viaje = {
    ...viaje,
    lecturas: { ...viaje.lecturas, [momento]: { ...viaje.lecturas[momento], [instrumento]: lectura } },
    editadoEl: opciones.ahora,
  };
  await a.guardar('viajes', actualizado);
  return actualizado;
}

// ---------------------------------------------------------------- Respaldo y fusión (D-2)

export const FORMATO_RESPALDO = 'medicion-respaldo' as const;
/** Versión 2: presupuestos con el original del contrato de #55 y la metadata aparte. La 1 se sigue leyendo. */
export const VERSION_RESPALDO = 2 as const;
/** Tope del archivo de respaldo que se acepta importar (protege la pestaña de un archivo equivocado). */
export const MAX_RESPALDO_BYTES = 50 * 1024 * 1024;

export interface FotoRespaldo {
  id: string;
  viajeId: string;
  dataUrl: string;
  creadoEl: string;
}

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  version: 1 | 2;
  exportadoEl: string;
  vehiculos: VehiculoMedicion[];
  presupuestos: PresupuestoLocal[];
  viajes: Viaje[];
  cargas: CargaCombustible[];
  ajustes: Ajustes | null;
  /** Solo si el usuario eligió incluirlas (por defecto no). */
  fotos: FotoRespaldo[];
}

async function blobADataUrl(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/jpeg'};base64,${btoa(bin)}`;
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

function dataUrlABlob(u: string): Blob {
  const m = DATA_URL.exec(u);
  if (!m) throw new Error('Foto inválida.');
  const bin = atob(m[2] as string);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export async function exportarRespaldo(a: Almacen, ahora: string, incluirFotos = false): Promise<Respaldo> {
  const d = await cargarTodo(a, ahora);
  const fotos = incluirFotos
    ? await Promise.all((await a.listar<FotoLectura>('fotos')).map(async (f) => ({ id: f.id, viajeId: f.viajeId, creadoEl: f.creadoEl, dataUrl: await blobADataUrl(f.blob) })))
    : [];
  return { formato: FORMATO_RESPALDO, version: VERSION_RESPALDO, exportadoEl: ahora, vehiculos: d.vehiculos, presupuestos: d.presupuestos, viajes: d.viajes, cargas: d.cargas, ajustes: d.ajustes, fotos };
}

// ---- Esquema estricto de cada registro (sin claves desconocidas, con tipos y rangos)

const id = z.string().min(1).max(64);
const instante = z
  .string()
  .max(40)
  .refine((x) => Number.isFinite(Date.parse(x)), 'fecha inválida');
const noNeg = z.number().finite().nonnegative();
const positivoONulo = z.number().finite().positive().nullable();
const fuentePrecio = z.enum(['boleta', 'surtidor', 'declaracion', 'referencia_publicada', 'supuesto']);
const datoMedicion = z.object({ valor: noNeg.nullable(), procedencia: procedenciaSchema }).strict();
const recorrido = z.enum(['urbano', 'autopista', 'mixto']).nullable();
const nivelCarga = z.enum(['sin', 'parcial', 'completa']).nullable();
const base = z.enum(['neto', 'con_iva']).nullable();
const uso = z.enum(['personal', 'simulacion']);
const tipoVehiculo = z.enum(['auto', 'camioneta', 'furgon', 'camion_liviano', 'otro']);

const vehiculoSchema = z
  .object({
    id,
    formato: z.literal(1),
    alias: z.string().regex(/^veh-\d{3,8}$/),
    tipoVehiculo,
    combustible: z.enum(['gasolina', 'diesel', 'otro']),
    resolucionTripKm: positivoONulo,
    resolucionOdometroKm: positivoONulo,
    resolucionLitros: positivoONulo.optional(),
    capacidadEstanqueL: positivoONulo,
    porDefecto: z
      .object({
        precioLitro: datoMedicion.extend({ fuentePrecio: fuentePrecio.nullable() }).strict(),
        kmL: datoMedicion,
        desgasteKm: datoMedicion,
        fijoHora: datoMedicion,
        trabajoHora: datoMedicion,
      })
      .strict(),
    creadoEl: instante,
    editadoEl: instante,
  })
  .strict();

const lectura = z.object({ valor: noNeg, clase: z.enum(['medido', 'declarado']), fotoId: id.nullable(), confirmadaEl: instante }).strict().nullable();
const momento = z.object({ trip: lectura, odometro: lectura }).strict();
const cobertura = z.enum(['parcial', 'completa']).nullable();

const viajeSchema = z
  .object({
    id,
    formato: z.literal(1),
    codigo: z.string().regex(/^viaje-\d{3,8}$/),
    vehiculoId: id,
    presupuestoId: id.nullable(),
    uso,
    estado: z.enum(['en curso', 'cerrado', 'anulado']),
    inicio: instante,
    fin: instante.nullable(),
    zona: z.string().max(64).nullable(),
    horaEditada: z.boolean(),
    lecturas: z.object({ inicial: momento, final: momento }).strict(),
    tripReiniciadoKm: noNeg.nullable(),
    tramos: z.array(z.object({ tipo: z.enum(['marcha', 'espera', 'carga', 'descarga', 'pausa']), inicio: instante, fin: instante.nullable() }).strict()).max(10000),
    recorrido,
    nivelCarga,
    aire: z.boolean().nullable(),
    comprobantes: z
      .array(z.object({ ref: z.string().regex(/^doc-\d{3,8}-\d{2,4}$/), partida: z.enum(['peajes', 'ayudantes', 'otros']), clp: z.number().int().nonnegative().max(9_999_999_999) }).strict())
      .max(1000),
    cobertura: z.object({ peajes: cobertura, ayudantes: cobertura, otros: cobertura }).strict(),
    baseClp: base.optional(),
    incertidumbreKm: noNeg.nullable().optional(),
    noAplica: z.array(z.enum(['peajes', 'ayudantes', 'otros'])).max(3).optional(),
    soloMarchaDeclarada: z.boolean().optional(),
    creadoEl: instante,
    editadoEl: instante,
  })
  .strict();

const cargaSchema = z
  .object({
    id,
    formato: z.literal(1),
    vehiculoId: id,
    fechaHora: instante,
    litros: z.number().finite(),
    precioLitro: noNeg.nullable(),
    totalClp: noNeg.nullable(),
    totalEditado: z.boolean(),
    fuentePrecio: z.enum(['boleta', 'surtidor', 'declaracion']).nullable(),
    odometro: noNeg.nullable(),
    lleno: z.boolean(),
    referencia: z.string().max(40).nullable(),
    cierreIntervalo: z
      .object({
        muestra: z.enum(['calibracion', 'validacion']).nullable(),
        recorrido,
        carga: nivelCarga,
        aire: z.boolean().nullable(),
        registroCompleto: z.boolean().nullable(),
        incertidumbreLitros: noNeg.nullable().optional(),
        incertidumbreKm: noNeg.nullable().optional(),
      })
      .strict()
      .nullable(),
    creadoEl: instante,
    editadoEl: instante,
  })
  .strict();

const estadoSello = {
  id,
  vehiculoId: id,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  estado: z.enum(['sellado', 'anulado']),
  anuladoEl: instante.nullable(),
  motivoAnulacion: z.string().max(200).nullable(),
  reemplazaA: id.nullable(),
  creadoEl: instante,
  editadoEl: instante,
};
/** `datos` lo valida el contrato de #55 (`verificarOriginal`) en la segunda etapa. */
const presupuestoSchema = z
  .object({
    ...estadoSello,
    formato: z.literal(2),
    datos: z.record(z.unknown()),
    meta: z
      .object({
        procedencia: z.record(procedenciaSchema),
        origen: z.union([
          z.object({ tipo: z.literal('nuevo') }).strict(),
          z
            .object({ tipo: z.literal('cotizacion'), schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]), folio: z.string().max(20).nullable(), ficticia: z.boolean() })
            .strict(),
        ]),
      })
      .strict(),
  })
  .strict();
/** Formato anterior: se conserva tal cual; se exige su identidad y, después, su huella original. */
const anteriorSchema = z
  .object({
    ...estadoSello,
    formato: z.literal(1),
    datos: z.object({ version: z.literal(2), id: z.string().regex(/^viaje-\d{3,8}$/), uso, vehiculo: z.string(), tipoVehiculo, fecha: instante }).passthrough(),
  })
  .strict();

const ajustesSchema = z
  .object({
    id: z.literal('ajustes'),
    formato: z.literal(1),
    umbrales: z.object({ velocidadMediaKmH: positivoONulo, desvioKmPct: positivoONulo, viajeAbiertoHoras: positivoONulo }).strict(),
    recordatorioCopiaDias: positivoONulo,
    ultimaCopia: instante.nullable(),
    editadoEl: instante,
  })
  .strict();

const fotoSchema = z.object({ id, viajeId: id, dataUrl: z.string().regex(DATA_URL), creadoEl: instante }).strict();

const respaldoSchema = z
  .object({
    formato: z.literal(FORMATO_RESPALDO),
    version: z.union([z.literal(1), z.literal(2)]),
    exportadoEl: instante,
    vehiculos: z.array(vehiculoSchema),
    presupuestos: z.array(z.union([presupuestoSchema, anteriorSchema])),
    viajes: z.array(viajeSchema),
    cargas: z.array(cargaSchema),
    ajustes: ajustesSchema.nullable(),
    fotos: z.array(fotoSchema).optional(),
  })
  .strict();

/** Respaldo inválido: lista de errores legibles. Nunca se escribió nada. */
export class RespaldoInvalidoError extends Error {
  constructor(readonly errores: string[]) {
    super(`Respaldo inválido, no se importó nada: ${errores.slice(0, 8).join(' · ')}${errores.length > 8 ? ` · y ${errores.length - 8} más` : ''}`);
  }
}

function validarEsquema(x: unknown): Respaldo {
  if (!x || typeof x !== 'object' || (x as { formato?: unknown }).formato !== FORMATO_RESPALDO) {
    throw new RespaldoInvalidoError(['el archivo no es un respaldo de la herramienta de medición']);
  }
  const r = respaldoSchema.safeParse(x);
  if (!r.success) throw new RespaldoInvalidoError(r.error.issues.map((i) => `${i.path.join('.') || 'respaldo'}: ${i.message}`));
  // Se devuelve el objeto ORIGINAL (zod solo valida): la salida de zod reordena claves, y la huella de un
  // sello del formato anterior depende del orden de su JSON. Los esquemas son estrictos y sin transformaciones.
  const original = x as Respaldo;
  return { ...original, fotos: original.fotos ?? [] };
}

/** Lee y valida (esquema estricto de cada registro) un respaldo en texto JSON. No escribe nada. */
export function leerRespaldo(texto: string): Respaldo {
  if (new TextEncoder().encode(texto).length > MAX_RESPALDO_BYTES) throw new RespaldoInvalidoError(['el archivo es demasiado grande para ser un respaldo de la herramienta']);
  let x: unknown;
  try {
    x = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    throw new RespaldoInvalidoError(['el archivo no es JSON válido']);
  }
  return validarEsquema(x);
}

export interface ResultadoFusion {
  /** `false` si hubo conflictos sin resolver: entonces no se escribió NADA. */
  escrito: boolean;
  agregados: number;
  actualizados: number;
  iguales: number;
  /** Mismo `id` con distinto contenido. Sin `reemplazarMasRecientes`, bloquean la importación completa. */
  conflictos: string[];
}

export interface OpcionesFusion {
  /**
   * Decisión EXPLÍCITA del usuario tras ver los conflictos: reemplazar cada registro en conflicto por la
   * versión con `editadoEl` más reciente. Nunca aplica a datos sellados.
   */
  reemplazarMasRecientes?: boolean;
}

type ConId = { id: string; editadoEl: string };
const igual = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/**
 * Fusiona un respaldo con lo local, TODO O NADA:
 * 1. esquema estricto de cada registro e ids únicos;
 * 2. cada sello verificado con el contrato de #55 (formato anterior: su huella original), sin resellar;
 * 3. integridad referencial con el estado resultante: viaje → vehículo, viaje → presupuesto (mismo
 *    vehículo, código y uso), presupuesto → vehículo (mismo alias sellado), carga → vehículo, cierre de
 *    intervalo solo en una carga llena, foto → viaje;
 * 4. conflictos: un sello distinto con el mismo `id` es un ERROR; otro registro distinto con el mismo `id`
 *    es un CONFLICTO que se informa y bloquea la importación salvo decisión explícita;
 * 5. una sola transacción (`guardarLote`).
 * Ante cualquier error lanza `RespaldoInvalidoError` y no escribe nada.
 */
export async function fusionarRespaldo(a: Almacen, entrada: Respaldo, opciones: OpcionesFusion = {}): Promise<ResultadoFusion> {
  const r = validarEsquema(entrada);
  const errores: string[] = [];
  const res: ResultadoFusion = { escrito: false, agregados: 0, actualizados: 0, iguales: 0, conflictos: [] };
  const escrituras: Escritura[] = [];

  const listas: [string, { id: string }[]][] = [
    ['vehiculos', r.vehiculos],
    ['presupuestos', r.presupuestos],
    ['viajes', r.viajes],
    ['cargas', r.cargas],
    ['fotos', r.fotos],
  ];
  for (const [k, lista] of listas) {
    const vistos = new Set<string>();
    for (const x of lista) {
      if (vistos.has(x.id)) errores.push(`${k}: id repetido ${x.id}`);
      vistos.add(x.id);
    }
  }
  for (const p of r.presupuestos) {
    const v = await verificarSelloLocal(p);
    if (!v.ok) errores.push(`presupuesto ${p.datos.id}: el sello no verifica (${v.motivo})`);
  }

  const local = await cargarTodo(a, r.exportadoEl);
  const mapa = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const loc = { vehiculos: mapa(local.vehiculos), presupuestos: mapa(local.presupuestos), viajes: mapa(local.viajes), cargas: mapa(local.cargas) };
  const final = { vehiculos: new Map(loc.vehiculos), presupuestos: new Map(loc.presupuestos), viajes: new Map(loc.viajes), cargas: new Map(loc.cargas) };

  const decidir = <T extends ConId>(col: Coleccion, l: T | undefined, ext: T, etiqueta: string, destino: Map<string, T>) => {
    if (!l) {
      escrituras.push({ coleccion: col, registro: ext });
      destino.set(ext.id, ext);
      res.agregados++;
    } else if (igual(l, ext)) res.iguales++;
    else if (opciones.reemplazarMasRecientes) {
      if (Date.parse(ext.editadoEl) > Date.parse(l.editadoEl)) {
        escrituras.push({ coleccion: col, registro: ext });
        destino.set(ext.id, ext);
        res.actualizados++;
      } else res.iguales++;
    } else res.conflictos.push(`${etiqueta}: el respaldo y este dispositivo tienen versiones distintas (local ${l.editadoEl}, respaldo ${ext.editadoEl}).`);
  };
  for (const ext of r.vehiculos) decidir('vehiculos', loc.vehiculos.get(ext.id), ext, `Vehículo ${ext.alias}`, final.vehiculos);
  for (const ext of r.viajes) decidir('viajes', loc.viajes.get(ext.id), ext, `Viaje ${ext.codigo}`, final.viajes);
  for (const ext of r.cargas) decidir('cargas', loc.cargas.get(ext.id), ext, `Carga del ${ext.fechaHora.slice(0, 10)}`, final.cargas);
  for (const ext of r.presupuestos) {
    const l = loc.presupuestos.get(ext.id);
    if (!l) {
      escrituras.push({ coleccion: 'presupuestos', registro: ext });
      final.presupuestos.set(ext.id, ext);
      res.agregados++;
    } else if (inmutable(l) !== inmutable(ext)) errores.push(`presupuesto ${l.datos.id}: los datos sellados difieren con el mismo id (un sello nunca se sobrescribe)`);
    else if (l.estado === 'sellado' && ext.estado === 'anulado') {
      // Único cambio admitido en un sello: anularlo (irreversible). Datos y huella idénticos.
      escrituras.push({ coleccion: 'presupuestos', registro: ext });
      final.presupuestos.set(ext.id, ext);
      res.actualizados++;
    } else res.iguales++;
  }

  // Integridad referencial sobre el estado que quedaría.
  for (const p of final.presupuestos.values()) {
    const veh = final.vehiculos.get(p.vehiculoId);
    if (!veh) errores.push(`presupuesto ${p.datos.id}: su vehículo no existe`);
    else if (p.datos.vehiculo !== veh.alias) errores.push(`presupuesto ${p.datos.id}: sellado para ${p.datos.vehiculo}, pero su vehículo es ${veh.alias}`);
  }
  for (const v of final.viajes.values()) {
    if (!final.vehiculos.has(v.vehiculoId)) errores.push(`viaje ${v.codigo}: su vehículo no existe`);
    if (v.presupuestoId) {
      const p = final.presupuestos.get(v.presupuestoId);
      if (!p) errores.push(`viaje ${v.codigo}: su presupuesto no existe`);
      else if (p.vehiculoId !== v.vehiculoId || p.datos.id !== v.codigo || p.datos.uso !== v.uso) errores.push(`viaje ${v.codigo}: no corresponde a su presupuesto ${p.datos.id}`);
    }
  }
  for (const c of final.cargas.values()) {
    if (!final.vehiculos.has(c.vehiculoId)) errores.push(`carga del ${c.fechaHora.slice(0, 10)}: su vehículo no existe`);
    if (c.cierreIntervalo && !c.lleno) errores.push(`carga del ${c.fechaHora.slice(0, 10)}: cierra un intervalo sin ser «lleno»`);
  }
  for (const f of r.fotos) {
    if (!final.viajes.has(f.viajeId)) errores.push(`foto ${f.id}: su viaje no existe`);
    else if (!(await a.obtener('fotos', f.id))) {
      try {
        const foto: FotoLectura = { id: f.id, viajeId: f.viajeId, blob: dataUrlABlob(f.dataUrl), creadoEl: f.creadoEl };
        escrituras.push({ coleccion: 'fotos', registro: foto });
      } catch {
        errores.push(`foto ${f.id}: contenido inválido`);
      }
    }
  }
  // Ajustes: preferencias de cada dispositivo; solo se toman si este no tiene.
  if (r.ajustes && !(await a.obtener('ajustes', 'ajustes'))) escrituras.push({ coleccion: 'ajustes', registro: r.ajustes });

  if (errores.length) throw new RespaldoInvalidoError(errores);
  if (res.conflictos.length) return { ...res, agregados: 0, actualizados: 0, iguales: 0 };
  await a.guardarLote(escrituras);
  return { ...res, escrito: true };
}
