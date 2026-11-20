import { useId, useState } from 'react';
import { floorLabel } from '../../shared/cargo';
import { HELPER_SEGMENTS, MAX_EQUIPMENT, MAX_HELPERS, type Helper, type HelperSegment } from '../../shared/resources';
import { abrirAlAgregar, alternar, erroresDe, resumenAcceso, resumenAyudante, resumenEquipo, resumenTiempos, type Estado } from '../modules/estado';
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
import { Disclosure } from './Disclosure';
import { NumberField } from './NumberField';

const SEGMENT_LABEL: Record<HelperSegment, string> = {
  manipulacion: 'Carga y descarga',
  traslado: 'Traslado (viaja en el vehículo)',
};

/** Pisos posibles (T-3): subterráneos −5…−1 y pisos 1…60. En Chile, el piso 1 es el de la calle. */
const FLOORS = [...Array.from({ length: 5 }, (_, i) => -5 + i), ...Array.from({ length: 60 }, (_, i) => i + 1)];
const STOP_NAME: Record<DraftStop['role'], string> = { A: 'Origen (A)', B: 'Destino (B)' };

interface Props {
  draft: ResourcesDraft;
  onChange: (draft: ResourcesDraft) => void;
}

/**
 * Accesos de origen y destino (#51): piso, ascensor, escaleras, acarreo y nota de acceso. Son datos
 * que puede informar el CLIENTE (docs/21 §18). Todos opcionales.
 */
export function AccessEditor({ draft, onChange }: Props) {
  const { errors } = validateResources(draft);
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  return (
    <section className="card" aria-label="Accesos de origen y destino">
      <div className="row-between">
        <h2 className="sec">Accesos en origen y destino</h2>
        <span className="tag tag-client">Datos de la carga</span>
      </div>
      <div className="stops-grid">
        {draft.stops.map((stop) => {
          const r = resumenAcceso(stop);
          // Los minutos de la parada son internos: sus errores se muestran en «Tus recursos».
          const conError = Object.entries(errors)
            .filter(([k]) => k.startsWith(`${stop.role}.`) && k !== `${stop.role}.loadMinutes`)
            .map(([, m]) => m);
          const estado: Estado = conError.length ? { nivel: 'error', etiqueta: 'Revisar', detalle: conError[0]! } : r.estado;
          return (
            <Disclosure
              key={stop.role}
              title={STOP_NAME[stop.role]}
              summary={r.texto}
              estado={estado}
              open={abiertas.has(stop.role)}
              onToggle={() => setAbiertas(alternar(abiertas, stop.role))}
            >
              <AccessFields stop={stop} errors={errors} onPatch={(p) => onChange(updateStop(draft, stop.role, p))} />
            </Disclosure>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Recursos INTERNOS del transportista (#51): tiempos de carga y descarga, ayudantes y equipamiento.
 * Nunca se piden ni se muestran al cliente. No cambian el costo (docs/21 §4.3–§4.4 sin aprobar).
 */
export function InternalResourcesEditor({ draft, onChange, newId }: Props & { newId: () => string }) {
  const { errors } = validateResources(draft);
  const [secciones, setSecciones] = useState<Set<string>>(() => new Set());
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const tieneErrores = (k: string) => erroresDe(errors, k).length > 0;
  const tiempos = resumenTiempos(draft.stops);
  const tiempoError = ['A', 'B'].flatMap((r) => (errors[`${r}.loadMinutes`] ? [errors[`${r}.loadMinutes`]!] : []));
  const ayudantesEstado: Estado =
    draft.helpers.length === 0
      ? { nivel: 'completo', etiqueta: 'Ninguno', detalle: '' }
      : draft.helpers.some((h) => resumenAyudante(h, errors).estado.nivel === 'error')
        ? { nivel: 'error', etiqueta: 'Revisar', detalle: 'Hay ayudantes con datos por corregir' }
        : draft.helpers.some((h) => resumenAyudante(h, errors).estado.nivel === 'faltan')
          ? { nivel: 'faltan', etiqueta: 'Falta monto', detalle: 'Algún ayudante no tiene monto calculable' }
          : { nivel: 'completo', etiqueta: 'Completo', detalle: '' };
  const equipoEstado: Estado =
    draft.equipment.length === 0
      ? { nivel: 'completo', etiqueta: 'Ninguno', detalle: '' }
      : draft.equipment.some((e) => resumenEquipo(e, errors).estado.nivel === 'error')
        ? { nivel: 'error', etiqueta: 'Revisar', detalle: 'Hay elementos por corregir' }
        : draft.equipment.some((e) => e.amount === null)
          ? { nivel: 'faltan', etiqueta: 'Falta monto', detalle: 'Algún elemento no tiene monto' }
          : { nivel: 'completo', etiqueta: 'Completo', detalle: '' };

  return (
    <section className="card internal" aria-label="Tus recursos y costos internos">
      <div className="row-between">
        <h2 className="sec">Tus recursos y costos internos</h2>
        <span className="tag tag-internal">Solo para ti</span>
      </div>
      <p className="sub">El cliente nunca ve esta sección. Por ahora es informativa: no cambia el costo actual.</p>

      <Disclosure
        title="Tiempo de carga y descarga"
        summary={tiempos.texto}
        estado={tiempoError.length ? { nivel: 'error', etiqueta: 'Revisar', detalle: tiempoError[0]! } : tiempos.estado}
        open={secciones.has('tiempos')}
        onToggle={() => setSecciones(alternar(secciones, 'tiempos'))}
      >
        <div className="grid2">
          {draft.stops.map((stop) => (
            <NumberField
              key={stop.role}
              label={`Minutos en ${stop.role === 'A' ? 'origen' : 'destino'}`}
              suffix="min"
              decimals={0}
              value={stop.loadMinutes}
              error={errors[`${stop.role}.loadMinutes`]}
              hint="Lo declaras tú: el piso y el ascensor son solo referencia."
              onChange={(v) => onChange(updateStop(draft, stop.role, { loadMinutes: v }))}
            />
          ))}
        </div>
      </Disclosure>

      <Disclosure
        title={`Ayudantes (${draft.helpers.length})`}
        summary={draft.helpers.length ? draft.helpers.map((h) => resumenAyudante(h, errors).texto).join(' · ') : 'Sin ayudantes (opcional)'}
        estado={ayudantesEstado}
        open={secciones.has('ayudantes')}
        onToggle={() => setSecciones(alternar(secciones, 'ayudantes'))}
      >
        <p className="sub">Cada ayudante se paga de una sola forma: por el servicio completo o por hora. Sus horas no se suman a tu tiempo.</p>
        <ol className="item-list">
          {draft.helpers.map((h, i) => {
            const r = resumenAyudante(h, errors);
            return (
              <li key={h.id}>
                <Disclosure
                  className="disclosure item-row"
                  title={`Ayudante ${i + 1}`}
                  summary={r.texto}
                  estado={r.estado}
                  open={abiertas.has(h.id)}
                  onToggle={() => setAbiertas(alternar(abiertas, h.id))}
                >
                  <HelperFields
                    helper={h}
                    index={i}
                    errors={errors}
                    onMode={(m) => onChange(setHelperMode(draft, h.id, m))}
                    onPatch={(p) => onChange(updateHelper(draft, h.id, p))}
                    onToggle={(s) => onChange(toggleSegment(draft, h.id, s))}
                    onRemove={() => onChange(removeHelper(draft, h.id))}
                    onClose={() => setAbiertas(alternar(abiertas, h.id))}
                  />
                </Disclosure>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="btn2 small"
          disabled={!canAddHelper(draft)}
          onClick={() => {
            const id = newId();
            onChange(addHelper(draft, id));
            setAbiertas(abrirAlAgregar(abiertas, id, tieneErrores));
          }}
        >
          + Agregar ayudante
        </button>
        {!canAddHelper(draft) ? <p className="warn">Máximo {MAX_HELPERS} ayudantes (límite provisional, T-7).</p> : null}
      </Disclosure>

      <Disclosure
        title={`Embalaje y equipamiento (${draft.equipment.length})`}
        summary={draft.equipment.length ? draft.equipment.map((e) => resumenEquipo(e, errors).texto).join(' · ') : 'Sin equipamiento (opcional)'}
        estado={equipoEstado}
        open={secciones.has('equipo')}
        onToggle={() => setSecciones(alternar(secciones, 'equipo'))}
      >
        <ol className="item-list">
          {draft.equipment.map((e, i) => {
            const r = resumenEquipo(e, errors);
            return (
              <li key={e.key}>
                <Disclosure
                  className="disclosure item-row"
                  title={`Elemento ${i + 1}`}
                  summary={r.texto}
                  estado={r.estado}
                  open={abiertas.has(e.key)}
                  onToggle={() => setAbiertas(alternar(abiertas, e.key))}
                >
                  <div className="fields-auto">
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
                    <button type="button" className="btn small" onClick={() => setAbiertas(alternar(abiertas, e.key))} aria-label={`Listo, cerrar elemento ${i + 1}`}>
                      Listo
                    </button>
                    <button type="button" className="btn2 small danger-text" onClick={() => onChange(removeEquipment(draft, e.key))} aria-label={`Eliminar equipamiento ${i + 1}`}>
                      Eliminar
                    </button>
                  </div>
                </Disclosure>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="btn2 small"
          disabled={!canAddEquipment(draft)}
          onClick={() => {
            const key = newId();
            onChange(addEquipment(draft, key));
            setAbiertas(abrirAlAgregar(abiertas, key, tieneErrores));
          }}
        >
          + Agregar equipamiento
        </button>
        {!canAddEquipment(draft) ? <p className="warn">Máximo {MAX_EQUIPMENT} elementos (límite provisional, T-7).</p> : null}
      </Disclosure>
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

function AccessFields({ stop, errors, onPatch }: { stop: DraftStop; errors: Record<string, string>; onPatch: (p: Partial<Omit<DraftStop, 'role'>>) => void }) {
  const err = (f: string) => errors[`${stop.role}.${f}`];
  return (
    <div className="fields-auto" role="group" aria-label={`Accesos de ${STOP_NAME[stop.role].toLowerCase()}`}>
      <Select
        label="Piso (opcional)"
        value={stop.floor === null ? '' : String(stop.floor)}
        options={[['', 'Sin dato'], ...FLOORS.map((f): [string, string] => [String(f), floorLabel(f)])]}
        onChange={(v) => onPatch({ floor: v === '' ? null : Number(v) })}
      />
      <Select
        label="Ascensor (opcional)"
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
        label="Escaleras (opcional)"
        value={stop.stairs === null ? '' : stop.stairs ? 'si' : 'no'}
        options={[
          ['', 'Sin dato'],
          ['si', 'Sí'],
          ['no', 'No'],
        ]}
        onChange={(v) => onPatch({ stairs: v === '' ? null : v === 'si' })}
      />
      <NumberField label="Distancia de acarreo (opcional)" suffix="m" decimals={0} value={stop.carryMeters} error={err('carryMeters')} onChange={(v) => onPatch({ carryMeters: v })} />
      <TextField label="Acceso o estacionamiento (opcional)" value={stop.access} max={120} placeholder="Ej.: calle angosta, sin estacionamiento" error={err('access')} onChange={(v) => onPatch({ access: v })} />
    </div>
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
  onClose: () => void;
}

function HelperFields({ helper, index, errors, onMode, onPatch, onToggle, onRemove, onClose }: HelperProps) {
  const err = (f: string) => errors[`${helper.id}.${f}`];
  const nombre = `Ayudante ${index + 1}`;
  return (
    <div className="item-fields" role="group" aria-label={`Datos del ${nombre.toLowerCase()}`}>
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
          <div className="fields-auto">
            <NumberField label="Tarifa por hora" suffix="$/h" decimals={0} value={helper.ratePerHour} error={err('ratePerHour')} onChange={(v) => onPatch({ ratePerHour: v })} />
            <NumberField label="Horas pagadas" suffix="h" decimals={2} value={helper.hours} error={err('hours')} hint="Máximo 24 h por ahora (T-7)." onChange={(v) => onPatch({ hours: v })} />
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
        <button type="button" className="btn small" onClick={onClose} aria-label={`Listo, cerrar ${nombre.toLowerCase()}`}>
          Listo
        </button>
        <button type="button" className="btn2 small danger-text" onClick={onRemove} aria-label={`Eliminar ${nombre.toLowerCase()}`}>
          Eliminar
        </button>
      </div>
    </div>
  );
}
