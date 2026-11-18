/**
 * Secuencia de guardado de una cotización (sexta auditoría, P1), separada del formulario para
 * poder probarla: TODOS los pasos (número, datos comerciales, cotización) usan el repositorio
 * fijado a la sesión vigente al empezar (`forWrite`). Si la identidad cambia a mitad de camino,
 * el repositorio en la nube se niega a escribir y nada queda en la otra cuenta.
 */
import type { BusinessProfile, JobRecord } from '../shared/clientQuote';
import type { QuoteRepository } from './storage';

export type SaveQuoteResult = { status: 'guardada'; job: JobRecord } | { status: 'no_vigente' };

export async function saveQuote(
  repository: QuoteRepository,
  build: (number: number) => JobRecord | null,
  business: BusinessProfile,
): Promise<SaveQuoteResult> {
  const repo = await repository.forWrite();
  const job = build(await repo.nextNumber());
  if (!job) return { status: 'no_vigente' };
  await repo.saveBusiness(business);
  return { status: 'guardada', job: await repo.create(job) };
}
