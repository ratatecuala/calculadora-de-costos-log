import { useEffect, useRef, useState } from 'react';
import { formatClp } from '../../engine/rounding';
import { FUEL_LABEL, VEHICLE_TYPE_LABEL, type FuelType, type VehicleInput, type VehicleProfile, type VehicleType } from '../../shared/vehicle';
import { VehicleValidationError, type VehicleRepository } from '../vehicleRepository';
import { NumberField } from './NumberField';

interface Props {
  repository: VehicleRepository;
  vehicles: VehicleProfile[];
  defaultId: string | null;
  onChanged: () => Promise<unknown>;
  onUse: (vehicle: VehicleProfile) => void;
  /** Dónde se guardan: en este navegador o en la cuenta. */
  where?: 'local' | 'nube';
}

const EMPTY: VehicleInput = { name: '', type: 'camioneta', fuel: 'gasolina', kmPerL: null, wearPerKm: null };

/** «Mi vehículo»: registrar, editar, eliminar y elegir el predeterminado. */
export function VehiclesView({ repository, vehicles, defaultId, onChanged, onUse, where = 'local' }: Props) {
  const [editing, setEditing] = useState<{ id: string | null; input: VehicleInput } | null>(vehicles.length === 0 ? { id: null, input: EMPTY } : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Tras un intento fallido, el foco va al primer campo con error (QA UX, H-07).
  const formRef = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const run = async (action: () => Promise<unknown>) => {
    setFailure(null);
    try {
      await action();
      await onChanged();
      return true;
    } catch (e) {
      if (e instanceof VehicleValidationError) setErrors(e.issues);
      else setFailure(e instanceof Error ? e.message : 'No se pudo guardar.');
      return false;
    }
  };

  const save = async () => {
    if (!editing) return;
    setErrors({});
    const ok = await run(() => (editing.id ? repository.update(editing.id, editing.input) : repository.create(editing.input)));
    if (ok) setEditing(null);
    else setAttempt((n) => n + 1);
  };

  if (editing) {
    const set = (patch: Partial<VehicleInput>) => setEditing({ ...editing, input: { ...editing.input, ...patch } });
    return (
      <div className="layout single">
        {/* Formulario real: Enter guarda, como en cualquier formulario (QA UX, H-07). */}
        <form
          ref={formRef}
          className="card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2 className="sec">{editing.id ? 'Editar vehículo' : 'Nuevo vehículo'}</h2>
          <label className="field">
            <span className="field-label">Nombre para identificarlo</span>
            <span className="field-input">
              <input
                value={editing.input.name}
                maxLength={40}
                placeholder="Ej.: Camioneta blanca"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'vehiculo-nombre-error' : undefined}
                onChange={(e) => set({ name: e.target.value })}
              />
            </span>
            {errors.name ? (
              <span id="vehiculo-nombre-error" className="field-error">
                {errors.name}
              </span>
            ) : null}
          </label>
          <span className="field-label">Tipo</span>
          <div className="segs" role="group" aria-label="Tipo de vehículo">
            {(Object.keys(VEHICLE_TYPE_LABEL) as VehicleType[]).map((t) => (
              <button type="button" key={t} aria-pressed={editing.input.type === t} className={editing.input.type === t ? 'seg seg-on' : 'seg'} onClick={() => set({ type: t })}>
                {VEHICLE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <span className="field-label">Combustible</span>
          <div className="segs" role="group" aria-label="Combustible">
            {(Object.keys(FUEL_LABEL) as FuelType[]).map((f) => (
              <button type="button" key={f} aria-pressed={editing.input.fuel === f} className={editing.input.fuel === f ? 'seg seg-on' : 'seg'} onClick={() => set({ fuel: f })}>
                {FUEL_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="grid2">
            <NumberField
              label="Rendimiento"
              suffix="km/L"
              value={editing.input.kmPerL}
              onChange={(v) => set({ kmPerL: v })}
              hint="Si no lo sabes, déjalo vacío"
              error={errors.kmPerL}
            />
            <NumberField
              label="Desgaste estimado"
              suffix="$/km"
              value={editing.input.wearPerKm}
              onChange={(v) => set({ wearPerKm: v })}
              hint="Neumáticos, aceite y mantención"
              error={errors.wearPerKm}
            />
          </div>
          <p className="sub">No usamos valores de referencia: si dejas un dato vacío, el costo del viaje se mostrará como parcial hasta que lo completes.</p>
          {failure ? (
            <p className="warn" role="alert">
              {failure}
            </p>
          ) : null}
          <div className="row-gap">
            {vehicles.length > 0 ? (
              <button type="button" className="btn2" onClick={() => setEditing(null)}>
                Cancelar
              </button>
            ) : null}
            <button type="submit" className="btn">
              Guardar vehículo
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="layout single">
      <div className="card">
        <div className="row-between">
          <h2 className="sec">Mi vehículo</h2>
          <button type="button" className="btn2 small" onClick={() => setEditing({ id: null, input: EMPTY })}>
            + Agregar vehículo
          </button>
        </div>
        <p className="sub">
          {where === 'nube' ? 'Guardados en tu cuenta.' : 'Guardados solo en este navegador.'} Al cotizar, sus datos se cargan solos y puedes ajustarlos sin cambiar lo
          guardado.
        </p>
        {failure ? <p className="warn">{failure}</p> : null}
        {vehicles.map((v) => (
          <div className="job" key={v.id}>
            <div className="row-between">
              <strong>{v.name}</strong>
              {v.id === defaultId ? <span className="tag tag-neutral">Predeterminado</span> : null}
            </div>
            <span className="sub">
              {VEHICLE_TYPE_LABEL[v.type]} · {FUEL_LABEL[v.fuel]}
            </span>
            <div className="ln">
              <span>Rendimiento</span>
              <span className="num">{v.kmPerL === null ? <span className="tag tag-missing">Falta</span> : `${String(v.kmPerL).replace('.', ',')} km/L`}</span>
            </div>
            <div className="ln">
              <span>Desgaste</span>
              <span className="num">{v.wearPerKm === null ? <span className="tag tag-missing">Falta</span> : `${formatClp(v.wearPerKm)} por km`}</span>
            </div>
            {confirmDelete === v.id ? (
              <div className="confirm">
                <span>¿Eliminar «{v.name}»? Esta acción no se puede deshacer.</span>
                <div className="row-gap">
                  <button type="button" className="btn2 small" onClick={() => setConfirmDelete(null)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn2 small danger"
                    onClick={() => void run(() => repository.remove(v.id)).then(() => setConfirmDelete(null))}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <div className="row-gap">
                <button type="button" className="btn2 small" onClick={() => onUse(v)}>
                  Usar en una cotización
                </button>
                <button
                  type="button"
                  className="btn2 small"
                  onClick={() => {
                    setErrors({});
                    setEditing({ id: v.id, input: { name: v.name, type: v.type, fuel: v.fuel, kmPerL: v.kmPerL, wearPerKm: v.wearPerKm } });
                  }}
                >
                  Editar
                </button>
                {v.id === defaultId ? (
                  <button type="button" className="link-btn" onClick={() => void run(() => repository.setDefault(null))}>
                    Quitar predeterminado
                  </button>
                ) : (
                  <button type="button" className="link-btn" onClick={() => void run(() => repository.setDefault(v.id))}>
                    Usar como predeterminado
                  </button>
                )}
                <button type="button" className="link-btn danger-text" onClick={() => setConfirmDelete(v.id)}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
