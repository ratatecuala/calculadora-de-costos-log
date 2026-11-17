import { formatClp } from '../../engine/rounding';
import { toClientQuote, whatsappUrl, type JobRecord } from '../../shared/clientQuote';
import { googleMapsDirectionsUrl } from '../../shared/mapsUrl';
import type { QuoteRepository } from '../storage';

interface Props {
  job: JobRecord;
  repository: QuoteRepository;
  onBack: () => void;
}

/**
 * Vista de la cotización: solo muestra la `ClientQuote` (lista blanca).
 * Los datos del emisor salen de la copia guardada al emitir, no del perfil actual.
 * PDF: impresión del navegador («Guardar como PDF»), sin servicios externos.
 */
export function QuoteView({ job, repository, onBack }: Props) {
  const q = toClientQuote(job, repository.getBusiness());
  const maps = googleMapsDirectionsUrl(job.waypoints);
  return (
    <div className="layout single">
      <div className="toolbar no-print">
        <button type="button" className="btn2" onClick={onBack}>
          Volver
        </button>
        <button type="button" className="btn2" onClick={() => window.print()}>
          Descargar PDF
        </button>
        <a className="btn" href={whatsappUrl(q)} target="_blank" rel="noreferrer">
          Enviar por WhatsApp
        </a>
        {maps ? (
          <a className="btn2" href={maps} target="_blank" rel="noreferrer">
            Ver ruta en Google Maps
          </a>
        ) : null}
      </div>
      <p className="sub no-print">Para el PDF, elige «Guardar como PDF» en la ventana de impresión.</p>
      <article className="doc">
        <header className="doc-head">
          <div>
            <p className="doc-business">{q.businessName || '[Nombre comercial]'}</p>
            <p className="sub">{[q.businessPhone, q.businessEmail].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="doc-number">
            <p className="sub">COTIZACIÓN</p>
            <p className="num">N° {String(q.number).padStart(4, '0')}</p>
          </div>
        </header>
        <div className="grid2 doc-grid">
          <Item label="Cliente" value={q.clientName} />
          <Item label="Emitida" value={q.issuedAt} />
          <Item label="Origen → destino" value={`${q.originLabel} → ${q.destinationLabel}`} />
          <Item label="Fecha del servicio" value={q.serviceDate || 'Por confirmar'} />
        </div>
        <div className="doc-box">
          <p>
            <strong>Servicio:</strong> {q.serviceDescription}
          </p>
          {q.includes ? (
            <p>
              <strong>Incluye:</strong> {q.includes}
            </p>
          ) : null}
          {q.conditions ? (
            <p>
              <strong>Condiciones:</strong> {q.conditions}
            </p>
          ) : null}
        </div>
        <div className="doc-total">
          {q.taxAmount === null ? (
            <div className="ln strong">
              <span>Valor neto</span>
              <span className="num">{formatClp(q.netPrice)}</span>
            </div>
          ) : (
            <>
              <div className="ln">
                <span>Neto</span>
                <span className="num">{formatClp(q.netPrice)}</span>
              </div>
              <div className="ln">
                <span>IVA</span>
                <span className="num">{formatClp(q.taxAmount)}</span>
              </div>
              <div className="ln strong">
                <span>Total</span>
                <span className="num">{formatClp(q.total)}</span>
              </div>
            </>
          )}
        </div>
        {q.validUntil ? <p className="sub">Válida hasta {q.validUntil}.</p> : null}
      </article>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="sub">{label}</span>
      <p className="doc-value">{value}</p>
    </div>
  );
}
