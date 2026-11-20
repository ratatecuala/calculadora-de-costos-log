import { useRef, useState } from 'react';
import { formatClp } from '../../engine/rounding';
import { capacityEstimate, cargoSummary, suggestServiceText, type CapacityVehicle } from '../../shared/cargo';
import { resourcesSummary } from '../../shared/resources';
import { formatMinutes } from '../format';
import { emptyInventoryDraft, validateInventory, type InventoryDraft } from '../modules/inventoryDraft';
import { asResourcesLike, emptyResourcesDraft, type ResourcesDraft } from '../modules/resourcesDraft';
import { InventoryEditor } from './InventoryEditor';
import { NumberField } from './NumberField';
import { ResourcesEditor } from './ResourcesEditor';

const nf = (v: number, d = 1) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: d }).format(v);

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Respaldo para navegadores sin randomUUID (contexto no seguro): formato UUID v4.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Vista previa de los módulos de inventario (#47) y recursos (#51), solo con la feature flag
 * activada (A-66). Estado SOLO en memoria: no se guarda, no se conecta al cotizador y no cambia el
 * resultado económico. Los datos del vehículo son de prueba, para ver la estimación de capacidad.
 */
export function ModulesPreview() {
  const [inventory, setInventory] = useState<InventoryDraft>(emptyInventoryDraft);
  const [resources, setResources] = useState<ResourcesDraft>(emptyResourcesDraft);
  const [vehicle, setVehicle] = useState<CapacityVehicle>({ payloadKg: null, cargoVolumeM3: null });
  const counter = useRef(0);
  const newKey = () => `k${++counter.current}`;

  const validated = validateInventory(inventory);
  const items = inventory.mode === 'detallado' ? validated.inventory?.items ?? null : [];
  const totals = items ? cargoSummary({ items }) : null;
  const capacity = totals ? capacityEstimate(totals, vehicle) : null;
  const res = resourcesSummary(asResourcesLike(resources));
  const suggestion = validated.inventory ? suggestServiceText(validated.inventory, resources.stops, resources.helpers.length) : null;

  return (
    <div className="layout single modules-preview">
      <p className="notice" role="note">
        <strong>Vista previa interna.</strong> Estos módulos aún no están conectados al cotizador: lo que escribas aquí no se guarda y no cambia ningún
        costo ni precio.
      </p>
      <InventoryEditor draft={inventory} onChange={setInventory} newKey={newKey} />

      <section className="card" aria-label="Resumen del inventario">
        <h2 className="sec">Resumen del inventario</h2>
        {totals === null ? (
          <p className="warn">Corrige los campos marcados para ver el resumen.</p>
        ) : totals.lines === 0 ? (
          <p className="sub">Sin objetos en la lista.</p>
        ) : (
          <dl className="totals">
            <dt>Peso</dt>
            <dd className="num">
              {totals.weightKg === null ? 'Sin datos de peso' : `${totals.linesWithWeight < totals.lines ? 'al menos ' : ''}${nf(totals.weightKg)} kg`}
              <span className="sub"> ({totals.linesWithWeight} de {totals.lines} líneas con peso)</span>
            </dd>
            <dt>Volumen</dt>
            <dd className="num">
              {totals.volumeM3 === null ? 'Sin datos de volumen' : `${totals.linesWithVolume < totals.lines ? 'al menos ' : ''}${nf(totals.volumeM3, 3)} m³`}
              <span className="sub"> ({totals.linesWithVolume} de {totals.lines} líneas con volumen)</span>
            </dd>
          </dl>
        )}
        <fieldset className="item-card">
          <legend className="field-label">Vehículo de prueba (solo para esta vista previa)</legend>
          <div className="grid2">
            <NumberField label="Carga útil" suffix="kg" decimals={0} value={vehicle.payloadKg} onChange={(v) => setVehicle({ ...vehicle, payloadKg: v })} />
            <NumberField label="Volumen de carga" suffix="m³" decimals={2} value={vehicle.cargoVolumeM3} onChange={(v) => setVehicle({ ...vehicle, cargoVolumeM3: v })} />
          </div>
        </fieldset>
        {capacity ? (
          capacity.minTrips === null ? (
            <p className="sub" data-testid="capacidad">
              No se estima la cantidad de viajes: {capacity.reason}
            </p>
          ) : (
            <p className="notice" data-testid="capacidad">
              Podrían requerirse <strong>al menos {capacity.minTrips}</strong> {capacity.minTrips === 1 ? 'viaje' : 'viajes'} (según{' '}
              {capacity.basis}
              {capacity.incomplete ? '; faltan datos, podrían ser más' : ''}). Es una cota inferior: no garantiza que la carga quepa (forma, acomodo,
              puertas), no fija una tarifa y nunca se debe superar la carga útil del vehículo.
            </p>
          )
        ) : null}
      </section>

      <ResourcesEditor draft={resources} onChange={setResources} newId={uuid} />

      <section className="card" aria-label="Resumen de recursos">
        <h2 className="sec">Resumen de recursos (informativo)</h2>
        <p className="sub">Aún no se incluye en el costo: el cálculo actual no cambia.</p>
        <p data-testid="tiempo-carga">
          Carga y descarga:{' '}
          {res.handling.minutes === null ? 'sin dato' : `${res.handling.complete ? '' : 'al menos '}${formatMinutes(res.handling.minutes)}`}
          {res.handling.complete ? '' : ` (falta ${res.handling.missingStops.map((s) => (s === 'A' ? 'el origen' : 'el destino')).join(' y ')})`}
        </p>
        <p data-testid="ayudantes">
          Ayudantes ({res.helperCount}):{' '}
          {res.helperCount === 0
            ? 'ninguno'
            : `${res.helpersMissing > 0 ? 'al menos ' : ''}${formatClp(res.helpersKnownTotal)}${res.helpersMissing > 0 ? ` (falta el monto de ${res.helpersMissing})` : ''}`}
        </p>
        <p>
          Equipamiento:{' '}
          {resources.equipment.length === 0
            ? 'ninguno'
            : `${res.equipmentMissing > 0 ? 'al menos ' : ''}${formatClp(res.equipmentKnownTotal)}${res.equipmentMissing > 0 ? ` (falta el monto de ${res.equipmentMissing})` : ''}`}
        </p>
      </section>

      <section className="card" aria-label="Texto sugerido para el cliente">
        <h2 className="sec">Texto sugerido para el cliente</h2>
        <p data-testid="texto-sugerido">{suggestion ?? 'Corrige los campos marcados para ver la sugerencia.'}</p>
        <p className="sub">Sin pesos, volúmenes, montos ni tiempos. Cuando se integre, podrás editarlo antes de enviarlo.</p>
      </section>
    </div>
  );
}
