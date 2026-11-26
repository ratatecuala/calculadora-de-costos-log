/**
 * Sello del presupuesto previo con el contrato de #55: `envolverOriginal(crearPresupuesto(...))`. La huella
 * la calcula el contrato (canónica para `version: 3`); la herramienta no tiene una propia. El sello prueba
 * integridad, no la hora: el reloj es del teléfono (docs/29 §5).
 *
 * La metadata propia (procedencia por parámetro y origen) va en `meta`, FUERA del original sellado.
 * Los sellos existentes nunca se vuelven a sellar: anular solo cambia el estado.
 */
import type { Ficha } from '../shared/campo/index.js';
import { sellarOriginal } from './campo';
import type { MetaPresupuesto, PresupuestoLocal, PresupuestoSellado } from './modelo';
import { FORMATO_PRESUPUESTO, nuevoId } from './modelo';

function congelar<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) congelar(v);
  }
  return x;
}

export async function sellar(entrada: {
  ficha: Ficha;
  codigo: string;
  /** ISO UTC con milisegundos (`new Date().toISOString()`), como exige el contrato. */
  fecha: string;
  vehiculoId: string;
  meta: MetaPresupuesto;
  ahora: string;
  reemplazaA?: string | null;
}): Promise<PresupuestoSellado> {
  const original = await sellarOriginal(entrada.ficha, entrada.codigo, entrada.fecha);
  return {
    id: nuevoId(),
    formato: FORMATO_PRESUPUESTO,
    vehiculoId: entrada.vehiculoId,
    datos: congelar(original.datos),
    sha256: original.sha256,
    meta: structuredClone(entrada.meta),
    estado: 'sellado',
    anuladoEl: null,
    motivoAnulacion: null,
    reemplazaA: entrada.reemplazaA ?? null,
    creadoEl: entrada.ahora,
    editadoEl: entrada.ahora,
  };
}

/** Anular no toca `datos` ni `sha256`: solo marca el estado. Es irreversible. */
export function anular<T extends PresupuestoLocal>(p: T, motivo: string, ahora: string): T {
  if (p.estado === 'anulado') return p;
  return { ...p, estado: 'anulado', anuladoEl: ahora, motivoAnulacion: motivo.trim() || 'sin motivo', editadoEl: ahora };
}

/** Primeros 12 caracteres de la huella (para mostrar y para el CSV). */
export const huellaCorta = (sha: string) => sha.slice(0, 12);
