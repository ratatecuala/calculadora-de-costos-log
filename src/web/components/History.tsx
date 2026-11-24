import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { esPrecioLegado, formatPrecioCliente, isSnapshotV2, type JobRecord, type JobStatus } from '../../shared/clientQuote';
import { formatDate } from '../format';
import type { JobPatch, QuoteRepository } from '../storage';

const STATUS_LABEL: Record<JobStatus, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada · por realizar',
  rechazada: 'Rechazada',
  realizada: 'Realizada',
};

interface Props {
  repository: QuoteRepository;
  onOpen: (job: JobRecord) => void;
  /** Aviso opcional sobre el historial local (p. ej., copiarlo a la cuenta). */
  banner?: ReactNode;
}

export function History({ repository, onOpen, banner }: Props) {
  const [jobs, setJobs] = useState<JobRecord[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setJobs(await repository.list());
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'No se pudo cargar el historial.');
      setJobs((prev) => prev ?? []);
    }
  }, [repository]);
  useEffect(() => {
    setJobs(null);
    void reload();
  }, [reload]);
  const update = async (job: JobRecord, patch: JobPatch) => {
    setFailure(null);
    try {
      await repository.update(job.id, patch);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'No se pudo guardar el cambio.');
    }
    await reload(); // muestra lo que realmente quedó guardado
  };
  return (
    <div className="layout single">
      <div className="card">
        <h2 className="sec">Mis trabajos</h2>
        <p className="sub">
          {repository.kind === 'nube' ? 'Guardados en tu cuenta.' : 'Guardados solo en este navegador, sin respaldo en la nube.'} Una cotización aceptada no es
          dinero recibido: el pago se registra aparte.
        </p>
        {!repository.persistent ? <p className="warn">Este navegador no permite guardar: tus trabajos se perderán al cerrar la pestaña.</p> : null}
        {banner}
        {failure ? (
          <p className="warn" role="alert">
            {failure}
          </p>
        ) : null}
        {jobs === null ? <p className="sub">Cargando…</p> : null}
        {jobs !== null && jobs.length === 0 ? <p className="sub">Aún no tienes cotizaciones.</p> : null}
        {(jobs ?? []).map((job) => (
          <div className="job" key={job.id}>
            <div className="ln">
              <span className="sub">
                N° {String(job.number).padStart(4, '0')}
                {job.issuedNumber !== undefined && job.issuedNumber !== job.number ? ` (emitida como N° ${String(job.issuedNumber).padStart(4, '0')})` : ''} ·{' '}
                {formatDate(job.createdAt)}
              </span>
              <strong className="num">{formatPrecioCliente(job.netPrice)}</strong>
            </div>
            <div className="ln">
              <span>
                {job.clientName} · {job.originLabel} → {job.destinationLabel}
              </span>
            </div>
            {job.internal.costType !== 'estimado' ? <span className="tag tag-missing">Costo parcial</span> : null}
            {/* A-81: precio histórico con decimales, visible solo para el dueño; el valor no se modificó. */}
            {esPrecioLegado(job.netPrice) ? (
              <span className="tag tag-warn" data-testid="precio-legado" title="Guardado antes de la regla de pesos enteros; se muestra tal como se guardó.">
                Precio histórico con decimales
              </span>
            ) : null}
            {job.internal.routeSource === 'simulado' ? <span className="tag tag-warn">Calculada con datos simulados</span> : null}
            {/* Solo v2 (I-1): una cotización histórica v1 se ve exactamente igual que antes. */}
            {isSnapshotV2(job.internal) && job.internal.cargo ? <span className="tag tag-neutral">Con detalle de carga</span> : null}
            <div className="row-gap">
              <select aria-label={`Estado de la cotización N° ${String(job.number).padStart(4, '0')}`} value={job.status} onChange={(e) => void update(job, { status: e.target.value as JobStatus })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select aria-label={`Pago de la cotización N° ${String(job.number).padStart(4, '0')}`} value={job.payment} onChange={(e) => void update(job, { payment: e.target.value as JobRecord['payment'] })}>
                <option value="pendiente">Pago pendiente</option>
                <option value="recibido">Pago recibido</option>
              </select>
              <button type="button" className="btn2 small" onClick={() => onOpen(job)}>
                Ver cotización
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
