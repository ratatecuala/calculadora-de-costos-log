import { useEffect, useState } from 'react';
import { formatClp } from '../../engine/rounding';
import type { BusinessProfile, JobRecord } from '../../shared/clientQuote';
import { VEHICLE_TYPE_LABEL } from '../../shared/vehicle';
import { suggestServiceText } from '../../shared/cargo';
import { FEATURE_FLAGS } from '../featureFlags';
import { buildJobRecord } from '../jobs';
import { alternarIncluye, includesPorDefecto } from '../modules/integracion';
import { validateInventory } from '../modules/inventoryDraft';
import { Fold } from './Fold';
import { saveQuote } from '../saveQuote';
import type { QuoteSession } from '../session';
import type { QuoteRepository } from '../storage';

interface Props {
  session: QuoteSession;
  repository: QuoteRepository;
  /** `repository` permite a la app ignorar el resultado si la cuenta cambió mientras se guardaba. */
  onSaved: (job: JobRecord, repository: QuoteRepository) => void;
  onCancel: () => void;
  /**
   * I-1 (A-68, D-I5): con la flag y SIN cuenta, «Servicio» ofrece el texto sugerido (botón
   * voluntario) e «Incluye» tiene una casilla explícita para indicar la cantidad de ayudantes.
   * Apagado, el formulario es idéntico al de hoy.
   */
  cargoEnabled?: boolean;
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
export function QuoteForm({ session, repository, onSaved, onCancel, cargoEnabled = false }: Props) {
  const s = session.getSnapshot();
  const computation = session.computation('habitual');
  const [business, setBusiness] = useState<BusinessProfile>({ name: '', phone: '', email: '' });
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // «Tus datos» parte abierto si no hay datos guardados; escribir en él ya no lo cierra (QA UX, H-02).
  const [businessLoaded, setBusinessLoaded] = useState<{ hadName: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    repository
      .getBusiness()
      .then((b) => {
        if (!alive) return;
        setBusiness(b);
        setBusinessLoaded({ hadName: b.name.trim() !== '' });
      })
      .catch(() => {
        if (alive) setBusinessLoaded({ hadName: false });
      });
    return () => {
      alive = false;
    };
  }, [repository]);
  const [form, setForm] = useState({
    clientName: '',
    serviceDescription: s.vehicle ? `Flete en ${VEHICLE_TYPE_LABEL[s.vehicle.type].toLowerCase()}` : 'Flete',
    includes: includesPorDefecto(s.params.helpers),
    conditions: '',
    serviceDate: '',
    validUntil: plusDays(7),
    originLabel: comuna(s.inputs.origin),
    destinationLabel: comuna(s.inputs.destination),
  });
  // X2/X3: la casilla parte con el valor de hoy y el número sale del campo de costo «Ayudantes».
  const [indicarAyudantes, setIndicarAyudantes] = useState(s.params.helpers > 0);
  const [includesManual, setIncludesManual] = useState(false);
  // Sugerencia para «Servicio»: solo con un inventario válido y con contenido; se aplica con un botón.
  const inventario = cargoEnabled ? validateInventory(s.cargo).inventory : null;
  const sugerencia =
    inventario && (inventario.items.length > 0 || inventario.summary !== '') ? suggestServiceText(inventario, s.resources.stops) : null;
  if (!computation || s.chosenPrice === null) return null;
  const price = s.chosenPrice;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (saving) return; // doble clic: una sola cotización
    setFailure(null);
    setSaving(true);
    try {
      const result = await saveQuote(
        repository,
        (number, version) =>
          buildJobRecord(session, form, business, { id: crypto.randomUUID(), number, createdAt: new Date().toISOString().slice(0, 10) }, { version }),
        business,
        // La versión del snapshot la decide saveQuote con el repositorio fijado (docs/22 §2.1).
        { cargoFlag: FEATURE_FLAGS.integracionCarga, cargaNube: FEATURE_FLAGS.cargaNube },
      );
      if (result.status === 'no_vigente') {
        // La ruta dejó de estar vigente o el costo cambió y el precio no se confirmó.
        setFailure('El costo cambió o la ruta ya no está vigente. Vuelve a «Cotizar», revisa y confirma tu precio.');
        return;
      }
      onSaved(result.job, repository);
    } catch (e) {
      // No se navega: la cotización no quedó guardada y el usuario debe saberlo (auditoría 2).
      setFailure(e instanceof Error ? e.message : 'No se pudo guardar la cotización.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="layout single">
      <div className="card">
        <h2 className="sec">Nueva cotización</h2>
        <p className="sub">
          Precio total para tu cliente: <strong>{formatClp(price)}</strong>. Tu cliente no verá tus costos internos.
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
        {cargoEnabled && sugerencia && sugerencia !== form.serviceDescription ? (
          <div className="sugerencia-servicio" data-testid="sugerencia-servicio">
            <p className="sub">Sugerencia según la carga (sin pesos, montos ni tiempos): «{sugerencia}»</p>
            <button type="button" className="btn2 small" onClick={() => setForm({ ...form, serviceDescription: sugerencia })}>
              Usar texto sugerido
            </button>
          </div>
        ) : null}
        <Text
          label="Incluye"
          value={form.includes}
          onChange={(e) => {
            setIncludesManual(false);
            setForm({ ...form, includes: e.target.value });
          }}
        />
        {cargoEnabled ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={indicarAyudantes}
                disabled={s.params.helpers === 0}
                onChange={(e) => {
                  const r = alternarIncluye(form.includes, s.params.helpers, e.target.checked);
                  setIndicarAyudantes(e.target.checked);
                  setIncludesManual(r.editadoAMano);
                  setForm({ ...form, includes: r.texto });
                }}
              />
              Indicar al cliente la cantidad de ayudantes{s.params.helpers > 0 ? ` (${s.params.helpers}, según «Ayudantes» del costo)` : ' (no hay ayudantes en el costo)'}
            </label>
            {includesManual ? <p className="sub">Editaste «Incluye» a mano: ajusta la mención de ayudantes directamente en el texto.</p> : null}
          </>
        ) : null}
        <Text label="Condiciones" value={form.conditions} onChange={set('conditions')} placeholder="Carga máxima, esperas, pisos…" />
        <Fold key={businessLoaded ? 'cargado' : 'cargando'} summary="Tus datos (aparecen en la cotización)" defaultOpen={!businessLoaded?.hadName}>
          <div className="grid2">
            <Text label="Nombre comercial" value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
            <Text label="Teléfono" value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
            <Text label="Correo" value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })} />
          </div>
        </Fold>
        {!repository.persistent ? <p className="warn">Este navegador no permite guardar: la cotización se perderá al cerrar la pestaña.</p> : null}
        {failure ? (
          <p className="warn" role="alert">
            {failure}
          </p>
        ) : null}
        <div className="row-gap">
          <button type="button" className="btn2" onClick={onCancel}>
            Volver
          </button>
          <button type="button" className="btn" disabled={saving} onClick={() => void save()}>
            {saving ? 'Guardando…' : repository.kind === 'nube' ? 'Guardar en mi cuenta' : 'Guardar cotización'}
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
