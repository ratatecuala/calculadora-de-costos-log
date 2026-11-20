/**
 * Secuencia de guardado de una cotización (sexta auditoría, P1), separada del formulario para
 * poder probarla: TODOS los pasos (número, datos comerciales, cotización) usan el repositorio
 * fijado a la sesión vigente al empezar (`forWrite`). Si la identidad cambia a mitad de camino,
 * el repositorio en la nube se niega a escribir y nada queda en la otra cuenta.
 *
 * Versión del snapshot (I-1, docs/22 §2.1, P1-1): se decide con ESE MISMO repositorio fijado.
 * v2 solo con la flag de integración encendida Y el repositorio del navegador; en la cuenta, v1
 * idéntico a hoy, aunque la flag esté encendida (hasta I-2).
 */
import type { BusinessProfile, JobRecord } from '../shared/clientQuote';
import type { QuoteRepository } from './storage';

export type SnapshotVersion = 1 | 2;

export type SaveQuoteResult = { status: 'guardada'; job: JobRecord; version: SnapshotVersion; kind: QuoteRepository['kind'] } | { status: 'no_vigente' };

/** Tabla de decisión (V5): v2 solo con flag y repositorio local. */
export function snapshotVersionFor(cargoFlag: boolean, kind: QuoteRepository['kind']): SnapshotVersion {
  return cargoFlag && kind === 'local' ? 2 : 1;
}

export async function saveQuote(
  repository: QuoteRepository,
  build: (number: number, version: SnapshotVersion) => JobRecord | null,
  business: BusinessProfile,
  opts: { cargoFlag?: boolean } = {},
): Promise<SaveQuoteResult> {
  const repo = await repository.forWrite();
  const version = snapshotVersionFor(opts.cargoFlag ?? false, repo.kind);
  const job = build(await repo.nextNumber(), version);
  if (!job) return { status: 'no_vigente' };
  await repo.saveBusiness(business);
  return { status: 'guardada', job: await repo.create(job), version, kind: repo.kind };
}
