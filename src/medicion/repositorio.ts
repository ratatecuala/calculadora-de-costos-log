/**
 * Operaciones de la herramienta sobre el almacenamiento, con sus reglas:
 * - un presupuesto sellado no se edita (corregir = sellar otro y anular el anterior);
 * - la foto NO se conserva por defecto (D-3); si se conserva, se re-codifica sin EXIF y queda solo aquí;
 * - respaldo exportable e importable con fusión por `id`, sin duplicados (D-2).
 */
import type { Almacen } from './almacen';
import type {
  Ajustes,
  CargaCombustible,
  FotoLectura,
  Instrumento,
  Lectura,
  PresupuestoSellado,
  VehiculoMedicion,
  Viaje,
} from './modelo';
import { AJUSTES_INICIALES, FORMATO_REGISTRO, nuevoId } from './modelo';
import { verificarSello } from './sello';

export class SelloInmutableError extends Error {}

export interface DatosLocales {
  vehiculos: VehiculoMedicion[];
  presupuestos: PresupuestoSellado[];
  viajes: Viaje[];
  cargas: CargaCombustible[];
  ajustes: Ajustes;
}

export async function cargarTodo(a: Almacen, ahora: string): Promise<DatosLocales> {
  const [vehiculos, presupuestos, viajes, cargas, aj] = await Promise.all([
    a.listar<VehiculoMedicion>('vehiculos'),
    a.listar<PresupuestoSellado>('presupuestos'),
    a.listar<Viaje>('viajes'),
    a.listar<CargaCombustible>('cargas'),
    a.obtener<Ajustes>('ajustes', 'ajustes'),
  ]);
  return { vehiculos, presupuestos, viajes, cargas, ajustes: aj ?? { ...structuredClone(AJUSTES_INICIALES), editadoEl: ahora } };
}

/** Datos del presupuesto que nunca cambian después de sellar. */
const inmutable = (p: PresupuestoSellado) => JSON.stringify([p.datos, p.sha256, p.vehiculoId, p.creadoEl, p.reemplazaA]);

/**
 * Guarda un presupuesto. Si ya existe con ese `id`, solo acepta el paso sellado → anulado con los mismos
 * datos y huella. Un sello cuya huella no coincide con sus datos se rechaza.
 */
export async function guardarPresupuesto(a: Almacen, p: PresupuestoSellado): Promise<void> {
  if (!(await verificarSello(p))) throw new SelloInmutableError('La huella no coincide con los datos del presupuesto.');
  const previo = await a.obtener<PresupuestoSellado>('presupuestos', p.id);
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
/** Tope del archivo de respaldo que se acepta importar (protege la pestaña de un archivo equivocado). */
export const MAX_RESPALDO_BYTES = 50 * 1024 * 1024;

export interface Respaldo {
  formato: typeof FORMATO_RESPALDO;
  version: 1;
  exportadoEl: string;
  vehiculos: VehiculoMedicion[];
  presupuestos: PresupuestoSellado[];
  viajes: Viaje[];
  cargas: CargaCombustible[];
  ajustes: Ajustes | null;
  /** Solo si el usuario eligió incluirlas (por defecto no). */
  fotos: { id: string; viajeId: string; dataUrl: string; creadoEl: string }[];
}

async function blobADataUrl(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/jpeg'};base64,${btoa(bin)}`;
}

function dataUrlABlob(u: string): Blob | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(u);
  if (!m) return null;
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
  return { formato: FORMATO_RESPALDO, version: 1, exportadoEl: ahora, vehiculos: d.vehiculos, presupuestos: d.presupuestos, viajes: d.viajes, cargas: d.cargas, ajustes: d.ajustes, fotos };
}

export interface ResultadoFusion {
  agregados: number;
  actualizados: number;
  iguales: number;
  conflictos: string[];
}

const esObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const conId = (x: unknown): x is { id: string; editadoEl?: string } => esObj(x) && typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 64;

/** Lee y valida un respaldo (texto JSON). Lanza un error legible si no lo es. */
export function leerRespaldo(texto: string): Respaldo {
  if (new TextEncoder().encode(texto).length > MAX_RESPALDO_BYTES) throw new Error('El archivo es demasiado grande para ser un respaldo de la herramienta.');
  let x: unknown;
  try {
    x = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    throw new Error('El archivo no es JSON válido.');
  }
  if (!esObj(x) || x.formato !== FORMATO_RESPALDO || x.version !== 1) throw new Error('El archivo no es un respaldo de la herramienta de medición.');
  for (const k of ['vehiculos', 'presupuestos', 'viajes', 'cargas']) {
    const lista = x[k];
    if (!Array.isArray(lista) || !lista.every(conId)) throw new Error(`Respaldo dañado: lista «${k}» inválida.`);
    if (!lista.every((r) => (r as { formato?: unknown }).formato === FORMATO_REGISTRO)) throw new Error(`Respaldo de una versión desconocida en «${k}».`);
  }
  if (x.fotos !== undefined && !Array.isArray(x.fotos)) throw new Error('Respaldo dañado: fotos inválidas.');
  return { ...(x as unknown as Respaldo), fotos: (x.fotos as Respaldo['fotos']) ?? [] };
}

/**
 * Fusiona un respaldo con lo local, por `id`: agrega lo nuevo, conserva la versión con `editadoEl` más
 * reciente y nunca duplica. Presupuestos: los datos y la huella deben coincidir (si no, conflicto y se
 * conserva el local); «anulado» prevalece sobre «sellado». Un sello alterado no se importa.
 */
export async function fusionarRespaldo(a: Almacen, r: Respaldo): Promise<ResultadoFusion> {
  const res: ResultadoFusion = { agregados: 0, actualizados: 0, iguales: 0, conflictos: [] };
  const simples: ['vehiculos' | 'viajes' | 'cargas', { id: string; editadoEl: string }[]][] = [
    ['vehiculos', r.vehiculos],
    ['viajes', r.viajes],
    ['cargas', r.cargas],
  ];
  for (const [col, lista] of simples) {
    for (const ext of lista) {
      const loc = await a.obtener<{ id: string; editadoEl: string }>(col, ext.id);
      if (!loc) {
        await a.guardar(col, ext);
        res.agregados++;
      } else if (JSON.stringify(loc) === JSON.stringify(ext)) res.iguales++;
      else if (Date.parse(ext.editadoEl) > Date.parse(loc.editadoEl)) {
        await a.guardar(col, ext);
        res.actualizados++;
      } else res.iguales++;
    }
  }
  for (const ext of r.presupuestos) {
    if (!(await verificarSello(ext))) {
      res.conflictos.push(`Presupuesto ${ext.datos?.id ?? ext.id}: la huella no coincide; no se importó.`);
      continue;
    }
    const loc = await a.obtener<PresupuestoSellado>('presupuestos', ext.id);
    if (!loc) {
      await a.guardar('presupuestos', ext);
      res.agregados++;
    } else if (inmutable(loc) !== inmutable(ext)) {
      res.conflictos.push(`Presupuesto ${loc.datos.id}: los datos sellados difieren; se conserva el local.`);
    } else if (loc.estado === 'sellado' && ext.estado === 'anulado') {
      await a.guardar('presupuestos', ext);
      res.actualizados++;
    } else res.iguales++;
  }
  if (r.ajustes && esObj(r.ajustes)) {
    const loc = await a.obtener<Ajustes>('ajustes', 'ajustes');
    if (!loc || Date.parse(r.ajustes.editadoEl) > Date.parse(loc.editadoEl)) await a.guardar('ajustes', r.ajustes);
  }
  for (const f of r.fotos) {
    if (!conId(f) || (await a.obtener('fotos', f.id))) continue;
    const blob = dataUrlABlob(f.dataUrl);
    if (blob) await a.guardar<FotoLectura>('fotos', { id: f.id, viajeId: f.viajeId, blob, creadoEl: f.creadoEl });
  }
  return res;
}
