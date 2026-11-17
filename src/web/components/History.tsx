import { useState } from 'react';
import { formatClp } from '../../engine/rounding';
import type { JobRecord, JobStatus } from '../../shared/clientQuote';
import type { QuoteRepository } from '../storage';

const STATUS_LABEL: Record<JobStatus, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada · por realizar',
  rechazada: 'Rechazada',
  realizada: 'Realizada',
};

export function History({ repository, onOpen }: { repository: QuoteRepository; onOpen: (job: JobRecord) => void }) {
  const [jobs, setJobs] = useState(() => repository.list());
  const [failure, setFailure] = useState<string | null>(null);
  const update = (job: JobRecord, patch: Partial<JobRecord>) => {
    setFailure(null);
    try {
      repository.save({ ...job, ...patch });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'No se pudo guardar el cambio.');
    }
    setJobs(repository.list()); // muestra lo que realmente quedó guardado
  };
  return (
    <div className="layout single">
      <div className="card">
        <h2 className="sec">Mis trabajos</h2>
        <p className="sub">Guardados en este navegador. Una cotización aceptada no es dinero recibido: el pago se registra aparte.</p>
        {!repository.persistent ? <p className="warn">Este navegador no permite guardar: tus trabajos se perderán al cerrar la pestaña.</p> : null}
        {failure ? (
          <p className="warn" role="alert">
            {failure}
          </p>
        ) : null}
        {jobs.length === 0 ? <p className="sub">Aún no tienes cotizaciones.</p> : null}
        {jobs.map((job) => (
          <div className="job" key={job.id}>
            <div className="ln">
              <span className="sub">
                N° {String(job.number).padStart(4, '0')} · {job.createdAt}
              </span>
              <strong className="num">{formatClp(job.netPrice)}</strong>
            </div>
            <div className="ln">
              <span>
                {job.clientName} · {job.originLabel} → {job.destinationLabel}
              </span>
            </div>
            {job.internal.costType !== 'estimado' ? <span className="tag tag-missing">Costo parcial</span> : null}
            {job.internal.routeSource === 'simulado' ? <span className="tag tag-warn">Calculada con datos simulados</span> : null}
            <div className="row-gap">
              <select aria-label="Estado" value={job.status} onChange={(e) => update(job, { status: e.target.value as JobStatus })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select aria-label="Pago" value={job.payment} onChange={(e) => update(job, { payment: e.target.value as JobRecord['payment'] })}>
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
