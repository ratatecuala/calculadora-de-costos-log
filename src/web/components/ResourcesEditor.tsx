import { useId } from 'react';
import { floorLabel } from '../../shared/cargo';
import { HELPER_SEGMENTS, MAX_EQUIPMENT, MAX_HELPERS, type Helper, type HelperSegment } from '../../shared/resources';
import {
  addEquipment,
  addHelper,
  canAddEquipment,
  canAddHelper,
  removeEquipment,
  removeHelper,
  setHelperMode,
  toggleSegment,
  updateEquipment,
  updateHelper,
  updateStop,
  validateResources,
  type DraftStop,
  type ResourcesDraft,
} from '../modules/resourcesDraft';
import { NumberField } from './NumberField';

const SEGMENT_LABEL: Record<HelperSegment, string> = {
  manipulacion: 'Carga y descarga',
  traslado: 'Traslado (viaja en el vehículo)',
};

/** Pisos posibles (T-3): subterráneos −5…−1 y pisos 1…60. En Chile, el piso 1 es el de la calle. */
const FLOORS = [...Array.from({ length: 5 }, (_, i) => -5 + i), ...Array.from({ length: 60 }, (_, i) => i + 1)];

interface Props {
  draft: ResourcesDraft;
  onChange: (draft: ResourcesDraft) => void;
  /** Genera un id (UUID) para un ayudante nuevo y claves para el equipamiento. */
  newId: () => string;
}

/**
 * Editor de recursos (#51, A-66): accesibilidad en origen y destino, ayudantes con una sola
 * modalidad cada uno y equipamiento declarado. No guarda, no se conecta al cotizador y NO cambia
 * el costo (docs/21 §4.3–§4.4 siguen sin aprobar).
 */
export function ResourcesEditor({ draft, onChange, newId }: Props) {
  const { errors } = validateResources(draft);
  return (
    <section className="card" aria-label="Recursos del servicio">
      <h2 className="sec">Accesos, ayudantes y equipamiento</h2>
      <div className="grid2">
        {draft.stops.map((stop) => (
          <StopFields key={stop.role} stop={stop} errors={errors} onPatch={(p) => onChange(updateStop(draft, stop.role, p))} />
        ))}
      </div>

      <h3 className="sec">Ayudantes</h3>
      <p className="sub">Cada ayudante se paga de una sola forma: por el servicio completo o por hora. Sus horas no se suman a tu tiempo.</p>
      <ol className="item-list">
        {draft.helpers.map((h, i) => (
          <HelperCard
            key={h.id}
            helper={h}
            index={i}
            errors={errors}
            onMode={(m) => onChange(setHelperMode(draft, h.id, m))}
            onPatch={(p) => onChange(updateHelper(draft, h.id, p))}
            onToggle={(s) => onChange(toggleSegment(draft, h.id, s))}
            onRemove={() => onChange(removeHelper(draft, h.id))}
          />
        ))}
      </ol>
      <button type="button" className="btn2 small" disabled={!canAddHelper(draft)} onClick={() => onChange(addHelper(draft, newId()))}>
        + Agregar ayudante
      </button>
      {!canAddHelper(draft) ? <p className="warn">Máximo {MAX_HELPERS} ayudantes (límite provisional, T-7).</p> : null}

      <h3 className="sec">Embalaje y equipamiento</h3>
      <ol className="item-list">
        {draft.equipment.map((e, i) => (
          <li key={e.key} className="item-card" aria-label={`Equipamiento ${i + 1}`}>
            <div className="grid2">
              <TextField
                label="Qué es"
                value={e.label}
                max={60}
                placeholder="Ej.: mantas, carro, correas"
                error={errors[`${e.key}.label`]}
                onChange={(v) => onChange(updateEquipment(draft, e.key, { label: v }))}
              />
              <NumberField label="Monto" suffix="$" decimals={0} value={e.amount} error={errors[`${e.key}.amount`]} onChange={(v) => onChange(updateEquipment(draft, e.key, { amount: v }))} />
            </div>
            <div className="item-actions">
              <button type="button" className="btn2 small danger-text" onClick={() => onChange(removeEquipment(draft, e.key))} aria-label={`Eliminar equipamiento ${i + 1}`}>
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn2 small" disabled={!canAddEquipment(draft)} onClick={() => onChange(addEquipment(draft, newId()))}>
        + Agregar equipamiento
      </button>
      {!canAddEquipment(draft) ? <p className="warn">Máximo {MAX_EQUIPMENT} elementos (límite provisional, T-7).</p> : null}
    </section>
  );
}

function TextField({ label, value, max, placeholder, error, onChange }: { label: string; value: string; max: number; placeholder?: string; error?: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          id={id}
          value={value}
          maxLength={max + 10}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
      {error ? (
        <span id={`${id}-error`} className="field-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function StopFields({ stop, errors, onPatch }: { stop: DraftStop; errors: Record<string, string>; onPatch: (p: Partial<Omit<DraftStop, 'role'>>) => void }) {
  const err = (f: string) => errors[`${stop.role}.${f}`];
  const titulo = stop.role === 'A' ? 'Origen (A)' : 'Destino (B)';
  return (
    <fieldset className="item-card stop">
      <legend className="field-label">{titulo}</legend>
      <Select
        label="Piso"
        value={stop.floor === null ? '' : String(stop.floor)}
        options={[['', 'Sin dato'], ...FLOORS.map((f): [string, string] => [String(f), floorLabel(f)])]}
        onChange={(v) => onPatch({ floor: v === '' ? null : Number(v) })}
      />
      <Select
        label="Ascensor"
        value={stop.elevator ?? ''}
        options={[
          ['', 'Sin dato'],
          ['si', 'Sí, sirve para la carga'],
          ['noCabe', 'Hay, pero la carga no cabe'],
          ['no', 'No hay'],
        ]}
        onChange={(v) => onPatch({ elevator: v === '' ? null : (v as DraftStop['elevator']) })}
      />
      <Select
        label="Escaleras"
        value={stop.stairs === null ? '' : stop.stairs ? 'si' : 'no'}
        options={[
          ['', 'Sin dato'],
          ['si', 'Sí'],
          ['no', 'No'],
        ]}
        onChange={(v) => onPatch({ stairs: v === '' ? null : v === 'si' })}
      />
      <NumberField label="Distancia de acarreo" suffix="m" decimals={0} value={stop.carryMeters} error={err('carryMeters')} onChange={(v) => onPatch({ carryMeters: v })} />
      <TextField label="Acceso o estacionamiento" value={stop.access} max={120} placeholder="Ej.: calle angosta, sin estacionamiento" error={err('access')} onChange={(v) => onPatch({ access: v })} />
      <NumberField
        label="Minutos de carga o descarga"
        suffix="min"
        decimals={0}
        value={stop.loadMinutes}
        error={err('loadMinutes')}
        hint="Lo declaras tú: el piso y el ascensor son solo referencia."
        onChange={(v) => onPatch({ loadMinutes: v })}
      />
    </fieldset>
  );
}

interface HelperProps {
  helper: Helper;
  index: number;
  errors: Record<string, string>;
  onMode: (m: Helper['mode']) => void;
  onPatch: (p: { feeService?: number | null; ratePerHour?: number | null; hours?: number | null }) => void;
  onToggle: (s: HelperSegment) => void;
  onRemove: () => void;
}

function HelperCard({ helper, index, errors, onMode, onPatch, onToggle, onRemove }: HelperProps) {
  const err = (f: string) => errors[`${helper.id}.${f}`];
  const nombre = `Ayudante ${index + 1}`;
  return (
    <li className="item-card" aria-label={nombre}>
      <div className="row-between">
        <strong>{nombre}</strong>
      </div>
      <div className="segs" role="group" aria-label={`Forma de pago del ${nombre.toLowerCase()}`}>
        {(['servicio', 'hora'] as const).map((m) => (
          <button key={m} type="button" className={helper.mode === m ? 'seg seg-on' : 'seg'} aria-pressed={helper.mode === m} onClick={() => onMode(m)}>
            {m === 'servicio' ? 'Por servicio' : 'Por hora'}
          </button>
        ))}
      </div>
      {helper.mode === 'servicio' ? (
        <NumberField label="Pago por el servicio" suffix="$" decimals={0} value={helper.feeService} error={err('feeService')} onChange={(v) => onPatch({ feeService: v })} />
      ) : (
        <>
          <div className="grid2">
            <NumberField label="Tarifa por hora" suffix="$/h" decimals={0} value={helper.ratePerHour} error={err('ratePerHour')} onChange={(v) => onPatch({ ratePerHour: v })} />
            <NumberField
              label="Horas pagadas"
              suffix="h"
              decimals={2}
              value={helper.hours}
              error={err('hours')}
              hint="Máximo 24 h por ahora (T-7)."
              onChange={(v) => onPatch({ hours: v })}
            />
          </div>
          <fieldset className="segments">
            <legend className="field-label">Tramos que pagas</legend>
            {HELPER_SEGMENTS.map((s) => (
              <label key={s} className="check">
                <input type="checkbox" checked={helper.paidSegments.includes(s)} onChange={() => onToggle(s)} />
                {SEGMENT_LABEL[s]}
              </label>
            ))}
            {err('paidSegments') ? <span className="field-error">{err('paidSegments')}</span> : null}
          </fieldset>
        </>
      )}
      <div className="item-actions">
        <button type="button" className="btn2 small danger-text" onClick={onRemove} aria-label={`Eliminar ${nombre.toLowerCase()}`}>
          Eliminar
        </button>
      </div>
    </li>
  );
}
