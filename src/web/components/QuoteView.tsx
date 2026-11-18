import { useEffect, useState } from 'react';
import { formatClp } from '../../engine/rounding';
import { toClientQuote, whatsappUrl, type BusinessProfile, type ClientQuote, type JobRecord } from '../../shared/clientQuote';
import { googleMapsDirectionsUrl } from '../../shared/mapsUrl';
import { CloudQuoteRepository, type QuoteShare } from '../cloud/quotes';
import { formatDate } from '../format';
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
  const [fallback, setFallback] = useState<BusinessProfile | undefined>(undefined);
  useEffect(() => {
    // Solo registros antiguos sin copia del emisor usan el perfil actual.
    if (job.issuer) return;
    void repository.getBusiness().then(setFallback, () => undefined);
  }, [job, repository]);
  const q = toClientQuote(job, fallback);
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
      {job.issuedNumber !== undefined && job.issuedNumber !== job.number ? (
        <p className="notice no-print">
          En tu historial es la N° {String(job.number).padStart(4, '0')}. El documento conserva el número con que se emitió al cliente: N°{' '}
          {String(job.issuedNumber).padStart(4, '0')}.
        </p>
      ) : null}
      {repository instanceof CloudQuoteRepository ? <SharePanel repository={repository} jobId={job.id} /> : null}
      <QuoteDocument q={q} />
    </div>
  );
}

/** Documento que ve el cliente (pantalla, PDF y enlace público). Solo recibe la ClientQuote. */
export function QuoteDocument({ q }: { q: ClientQuote }) {
  return (
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
        <Item label="Emitida" value={formatDate(q.issuedAt)} />
        <Item label="Origen → destino" value={`${q.originLabel} → ${q.destinationLabel}`} />
        <Item label="Fecha del servicio" value={q.serviceDate ? formatDate(q.serviceDate) : 'Por confirmar'} />
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
      {q.validUntil ? <p className="sub">Válida hasta {formatDate(q.validUntil)}.</p> : null}
    </article>
  );
}

/** Enlaces públicos: el token se muestra UNA vez (en la base solo queda su hash). */
function SharePanel({ repository, jobId }: { repository: CloudQuoteRepository; jobId: string }) {
  const [shares, setShares] = useState<QuoteShare[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = () => repository.listShares(jobId).then(setShares, (e: unknown) => setFailure(e instanceof Error ? e.message : 'Error'));
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const create = async () => {
    setBusy(true);
    setFailure(null);
    setCopied(false);
    try {
      const token = await repository.createShare(jobId, 30);
      setLink(`${window.location.origin}/c/${token}`);
      await reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'No se pudo crear el enlace.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setFailure(null);
    try {
      await repository.revokeShare(id);
      setLink(null);
      await reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'No se pudo desactivar el enlace.');
    }
  };

  const active = shares.filter((s) => !s.revokedAt && (!s.expiresAt || new Date(s.expiresAt) > new Date()));
  return (
    <div className="card no-print">
      <h2 className="sec">Enlace para tu cliente</h2>
      <p className="sub">Tu cliente verá solo esta cotización: sin tus costos, combustible ni margen. El enlace dura 30 días y puedes desactivarlo cuando quieras.</p>
      {link ? (
        <div className="notice">
          <p className="share-link">{link}</p>
          <button
            type="button"
            className="btn2 small"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false))}
          >
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          <p className="sub">Guárdalo ahora: por seguridad no lo volveremos a mostrar.</p>
        </div>
      ) : null}
      <div className="row-gap">
        <button type="button" className="btn2 small" disabled={busy} onClick={() => void create()}>
          {busy ? 'Creando…' : 'Crear enlace'}
        </button>
      </div>
      {active.length > 0 ? (
        <div className="results">
          {active.map((s) => (
            <div className="ln" key={s.id}>
              <span className="sub">
                Enlace activo desde {formatDate(s.createdAt)}
                {s.expiresAt ? ` · vence ${formatDate(s.expiresAt)}` : ''}
              </span>
              <button type="button" className="link-btn danger-text" onClick={() => void revoke(s.id)}>
                Desactivar
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {failure ? (
        <p className="warn" role="alert">
          {failure}
        </p>
      ) : null}
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
