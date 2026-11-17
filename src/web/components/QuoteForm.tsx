import { useState } from 'react';
import { formatClp } from '../../engine/rounding';
import type { BusinessProfile, JobRecord } from '../../shared/clientQuote';
import { buildWaypoints } from '../../shared/waypoints';
import type { QuoteSession } from '../session';
import type { QuoteRepository } from '../storage';

export const ENGINE_VERSION = 'motor-1.0.0';

interface Props {
  session: QuoteSession;
  repository: QuoteRepository;
  onSaved: (job: JobRecord) => void;
  onCancel: () => void;
}

function comuna(address: string): string {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : address.trim();
}

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Crea la cotización. Solo copia al registro datos propios; km de proveedor solo si su retención lo permite. */
export function QuoteForm({ session, repository, onSaved, onCancel }: Props) {
  const s = session.getSnapshot();
  const computation = session.computation('habitual');
  const [business, setBusiness] = useState<BusinessProfile>(() => repository.getBusiness());
  const [form, setForm] = useState({
    clientName: '',
    serviceDescription: 'Flete',
    includes: s.params.helpers > 0 ? `Carga y descarga, ${s.params.helpers} ayudante(s)` : 'Carga y descarga',
    conditions: '',
    serviceDate: '',
    validUntil: plusDays(7),
    originLabel: comuna(s.inputs.origin),
    destinationLabel: comuna(s.inputs.destination),
  });
  if (!computation || s.chosenPrice === null) return null;
  const price = s.chosenPrice;
  const m = computation.measures;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const save = () => {
    repository.saveBusiness(business);
    const rs = s.habitual;
    const storable = computation.source === 'declarado' || (rs.route?.retention.distance === 'permanente' && computation.source !== 'mixto');
    const job: JobRecord = {
      id: crypto.randomUUID(),
      number: repository.nextNumber(),
      createdAt: new Date().toISOString().slice(0, 10),
      ...form,
      clientName: form.clientName.trim() || 'Cliente',
      netPrice: price,
      tax: null, // IVA pendiente de reglas verificadas (#16)
      status: 'borrador',
      payment: 'pendiente',
      waypoints: buildWaypoints({ ...s.inputs, base: s.inputs.base }).map((w) => ({ role: w.role, address: w.address })),
      internal: {
        routeSource: computation.source,
        // Retención por campo (A-38): km y minutos de Google o simulados no se guardan.
        km: storable ? computation.km : null,
        minutes: storable ? computation.minutes : null,
        costEstimate: m.cost.value,
        costType: m.cost.type,
        suggestedPrice: m.suggested.value,
        margin: s.margin,
        missing: m.missing,
        engineVersion: ENGINE_VERSION,
      },
    };
    repository.save(job);
    onSaved(job);
  };

  return (
    <div className="layout single">
      <div className="card">
        <h2 className="sec">Nueva cotización</h2>
        <p className="sub">
          Precio neto: <strong>{formatClp(price)}</strong>. Tu cliente no verá tus costos internos.
        </p>
        <label className="field">
          <span className="field-label">Cliente</span>
          <span className="field-input">
            <input value={form.clientName} onChange={set('clientName')} placeholder="Nombre del cliente" />
          </span>
        </label>
        <div className="grid2">
          <Text label="Origen (como lo verá el cliente)" value={form.originLabel} onChange={set('originLabel')} />
          <Text label="Destino (como lo verá el cliente)" value={form.destinationLabel} onChange={set('destinationLabel')} />
          <Text label="Fecha del servicio" type="date" value={form.serviceDate} onChange={set('serviceDate')} />
          <Text label="Válida hasta" type="date" value={form.validUntil} onChange={set('validUntil')} />
        </div>
        <Text label="Servicio" value={form.serviceDescription} onChange={set('serviceDescription')} />
        <Text label="Incluye" value={form.includes} onChange={set('includes')} />
        <Text label="Condiciones" value={form.conditions} onChange={set('conditions')} placeholder="Carga máxima, esperas, pisos…" />
        <details className="fold" open={!business.name}>
          <summary>Tus datos (aparecen en la cotización)</summary>
          <div className="grid2">
            <Text label="Nombre comercial" value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
            <Text label="Teléfono" value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
            <Text label="Correo" value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })} />
          </div>
        </details>
        <div className="row-gap">
          <button type="button" className="btn2" onClick={onCancel}>
            Volver
          </button>
          <button type="button" className="btn" onClick={save}>
            Guardar cotización
          </button>
        </div>
      </div>
    </div>
  );
}

function Text(props: { label: string; value: string; onChange: (e: { target: { value: string } }) => void; type?: string; placeholder?: string }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <span className="field-input">
        <input type={props.type ?? 'text'} value={props.value} onChange={props.onChange} placeholder={props.placeholder} />
      </span>
    </label>
  );
}
