/**
 * Sello del presupuesto previo: `{datos, sha256}` con la huella de #55 (`sha256(JSON.stringify(datos))`,
 * en hexadecimal), calculada con `crypto.subtle` (navegador y Node ≥ 20). El sello prueba integridad,
 * no la hora: el reloj es del teléfono (docs/29 §5).
 *
 * PROVISIONAL: cuando Codex publique `huellaCanonica` en `src/shared/campo/`, esta función se reemplaza
 * por la suya para que la CLI y el teléfono verifiquen igual (docs/29 §2.1).
 */
import type { DatosPresupuesto, PresupuestoSellado } from './modelo';
import { FORMATO_REGISTRO, nuevoId } from './modelo';

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function huella(datos: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(datos));
}

function congelar<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x as Record<string, unknown>)) congelar(v);
  }
  return x;
}

export async function sellar(datos: DatosPresupuesto, vehiculoId: string, ahora: string, reemplazaA: string | null = null): Promise<PresupuestoSellado> {
  const copia = congelar(structuredClone(datos));
  return {
    id: nuevoId(),
    formato: FORMATO_REGISTRO,
    vehiculoId,
    datos: copia,
    sha256: await huella(copia),
    estado: 'sellado',
    anuladoEl: null,
    motivoAnulacion: null,
    reemplazaA,
    creadoEl: ahora,
    editadoEl: ahora,
  };
}

export async function verificarSello(p: Pick<PresupuestoSellado, 'datos' | 'sha256'>): Promise<boolean> {
  return (await huella(p.datos)) === p.sha256;
}

/** Anular no toca `datos` ni `sha256`: solo marca el estado. Es irreversible. */
export function anular(p: PresupuestoSellado, motivo: string, ahora: string): PresupuestoSellado {
  if (p.estado === 'anulado') return p;
  return { ...p, estado: 'anulado', anuladoEl: ahora, motivoAnulacion: motivo.trim() || 'sin motivo', editadoEl: ahora };
}

/** Primeros 12 caracteres de la huella (para mostrar y para el CSV). */
export const huellaCorta = (sha: string) => sha.slice(0, 12);
