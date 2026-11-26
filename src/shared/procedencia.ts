/**
 * Contrato único de procedencia de un dato económico (A-88, Frente A; docs/26 §3).
 *
 * Lo reutilizan el snapshot v3 de las cotizaciones y, más adelante, las referencias de combustible,
 * peajes, catálogo y calibración. El motor NO lo lee: sigue recibiendo números (`TripParams`).
 *
 * Clases (AGENTS.md §4 y pedido del propietario en A-88):
 * - `medido`: observado con un instrumento (TRIP, odómetro, cronómetro, llenado lleno a lleno);
 * - `comprobado`: respaldado por un documento verificable (boleta, cartola TAG, ficha oficial);
 * - `declarado`: lo escribió o aceptó el usuario, sin respaldo adjunto;
 * - `estimado`: calculado o tomado de una referencia con método conocido (p. ej., ruta de un proveedor);
 * - `simulado`: valor ficticio o de un simulador (ejemplo de la app, ruta simulada);
 * - `faltante`: no se conoce. Nunca se reemplaza por 0 (A-18).
 *
 * Ninguna función de este archivo inventa datos: si no se sabe una fecha o una versión, queda `null`.
 */
import { z } from 'zod';

export const CLASES_DATO = ['medido', 'comprobado', 'declarado', 'estimado', 'simulado', 'faltante'] as const;
export type ClaseDato = (typeof CLASES_DATO)[number];

/**
 * De dónde salió el valor dentro de la app:
 * - `usuario`: lo escribió en el campo;
 * - `valorInicial`: el valor con que parte el formulario (p. ej., 0 ayudantes) y que el usuario aceptó sin cambiarlo;
 * - `vehiculo`: lo copió el perfil «Mi vehículo» que el usuario declaró;
 * - `ejemplo`: «Cargar ejemplo ficticio»;
 * - `ruta`: el recorrido (manual, simulado o de un proveedor), según `detalle`;
 * - `referencia`, `medicion`, `comprobante`: reservados para datos de referencia y del instrumento 0B.
 */
export const TIPOS_FUENTE = ['usuario', 'valorInicial', 'vehiculo', 'ejemplo', 'ruta', 'referencia', 'medicion', 'comprobante'] as const;
export type TipoFuente = (typeof TIPOS_FUENTE)[number];

const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

export const procedenciaSchema = z
  .object({
    clase: z.enum(CLASES_DATO),
    fuente: z
      .object({
        tipo: z.enum(TIPOS_FUENTE),
        /** Texto breve sin datos personales (p. ej., «ejemplo ficticio de la app»). */
        detalle: z.string().max(60).nullable(),
      })
      .strict(),
    /** Fecha del dato (observación, consulta o declaración). `null` si no se conoce. */
    fecha: fechaIso.nullable(),
    /** Vigencia del dato, si la fuente la declara. `null` = no declarada. */
    vigenteDesde: fechaIso.nullable(),
    vigenteHasta: fechaIso.nullable(),
    /** Versión del conjunto de datos de origen (`dataVersion`), si existe. */
    version: z.string().max(20).nullable(),
  })
  .strict()
  .refine((p) => p.vigenteDesde === null || p.vigenteHasta === null || p.vigenteDesde <= p.vigenteHasta, 'La vigencia termina antes de empezar');

export type Procedencia = z.output<typeof procedenciaSchema>;

/** Un valor económico con su unidad y procedencia. `faltante` ⇔ `valor === null`. */
export const datoEconomicoSchema = z
  .object({
    valor: z.number().finite().nullable(),
    unidad: z.string().min(1).max(12),
    procedencia: procedenciaSchema,
  })
  .strict()
  .refine((d) => (d.valor === null) === (d.procedencia.clase === 'faltante'), 'Un dato faltante no tiene valor, y uno con valor no es faltante');

export type DatoEconomico = z.output<typeof datoEconomicoSchema>;

/** Zona horaria civil del producto (A-91): las fechas comerciales siguen la hora de Chile continental. */
export const ZONA_CIVIL = 'America/Santiago';

const formatoCivil = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CIVIL, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Fecha civil AAAA-MM-DD en America/Santiago (A-91), con su horario de verano, sea cual sea la zona del
 * dispositivo. No usa UTC: en Chile, después de las 20:00 o 21:00 la fecha UTC ya es la del día siguiente.
 * `null` si la fecha no es válida.
 */
export function fechaCivilChile(d: Date = new Date()): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const partes = Object.fromEntries(formatoCivil.formatToParts(d).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/** Suma días a una fecha civil AAAA-MM-DD, sin pasar por la hora (los cambios de horario no la desplazan). */
export function sumarDiasCivil(fecha: string, dias: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) throw new Error('Fecha civil inválida');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dias));
  return d.toISOString().slice(0, 10);
}

/** Fecha de los eventos de procedencia: la misma fecha civil de Chile que la cotización (A-91). */
export function fechaLocal(d: Date = new Date()): string | null {
  return fechaCivilChile(d);
}

/** Fecha local de una marca de tiempo ISO; una fecha sola (AAAA-MM-DD) se conserva tal cual. */
export function fechaLocalDeIso(iso: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : fechaLocal(new Date(iso));
}

/** Procedencia mínima: sin fecha de dato, vigencia ni versión conocidas. */
export function procedencia(clase: ClaseDato, tipo: TipoFuente, detalle: string | null = null, fecha: string | null = null): Procedencia {
  return { clase, fuente: { tipo, detalle }, fecha, vigenteDesde: null, vigenteHasta: null, version: null };
}
