/**
 * Secuencia de guardado de una cotización (sexta auditoría, P1), separada del formulario para
 * poder probarla: TODOS los pasos (número, datos comerciales, cotización) usan el repositorio
 * fijado a la sesión vigente al empezar (`forWrite`). Si la identidad cambia a mitad de camino,
 * el repositorio en la nube se niega a escribir y nada queda en la otra cuenta.
 *
 * Versión del snapshot (I-1, docs/22 §2.1, P1-1): se decide con ESE MISMO repositorio fijado.
 * v2 solo con la flag de integración encendida Y el repositorio del navegador; en la cuenta, v1
 * idéntico a hoy, salvo que también esté encendida `cargaNube` (I-2, A-81).
 */
import type { BusinessProfile, JobRecord } from '../shared/clientQuote';
import type { QuoteRepository } from './storage';

export type SnapshotVersion = 1 | 2;

export type SaveQuoteResult = { status: 'guardada'; job: JobRecord; version: SnapshotVersion; kind: QuoteRepository['kind'] } | { status: 'no_vigente' };

/**
 * Tabla de decisión (V5; I-2, A-81): v2 con la flag de integración y el repositorio local; con cuenta,
 * v2 solo si además está encendida `cargaNube` (la cuenta ya puede guardar las líneas).
 */
export function snapshotVersionFor(cargoFlag: boolean, kind: QuoteRepository['kind'], cargaNube = false): SnapshotVersion {
  if (!cargoFlag) return 1;
  return kind === 'local' || cargaNube ? 2 : 1;
}

/**
 * Versión del snapshot que se EMITE (A-88). `snapshotVersionFor` decide si va el detalle de carga:
 * con detalle, v2 sin cambios (I-1/I-2); sin detalle, v3, que agrega parámetros y procedencia.
 * La v1 ya no se emite, pero se sigue leyendo tal cual.
 */
export function snapshotParaEmitir(version: SnapshotVersion): 2 | 3 {
  return version === 2 ? 2 : 3;
}

export async function saveQuote(
  repository: QuoteRepository,
  build: (number: number, version: SnapshotVersion) => JobRecord | null,
  business: BusinessProfile,
  opts: { cargoFlag?: boolean; cargaNube?: boolean } = {},
): Promise<SaveQuoteResult> {
  const repo = await repository.forWrite();
  const version = snapshotVersionFor(opts.cargoFlag ?? false, repo.kind, opts.cargaNube ?? false);
  const job = build(await repo.nextNumber(), version);
  if (!job) return { status: 'no_vigente' };
  await repo.saveBusiness(business);
  return { status: 'guardada', job: await repo.create(job), version, kind: repo.kind };
}
