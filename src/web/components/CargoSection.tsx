import { useRef, useState, useSyncExternalStore } from 'react';
import { formatClp } from '../../engine/rounding';
import { cargoSummary } from '../../shared/cargo';
import { resourcesSummary } from '../../shared/resources';
import { formatMinutes } from '../format';
import { totalInformativo, type Estado } from '../modules/estado';
import { avisosDuplicado, bloqueoEmision } from '../modules/integracion';
import { validateInventory } from '../modules/inventoryDraft';
import { asResourcesLike } from '../modules/resourcesDraft';
import type { QuoteSession } from '../session';
import { Disclosure } from './Disclosure';
import { InventoryEditor } from './InventoryEditor';
import { AccessEditor, InternalResourcesEditor } from './ResourcesEditor';

const nf = (v: number, d = 1) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: d }).format(v);

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Detalle de la carga y recursos dentro de «Cotizar» (I-1, A-68). Solo sin cuenta y con la flag.
 * Plegado por defecto. NO cambia el costo (D-I1): los campos actuales del cotizador siguen
 * siendo la única fuente; aquí solo se describe la carga y se avisan diferencias.
 */
export function CargoSection({ session }: { session: QuoteSession }) {
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [open, setOpen] = useState(false);
  const counter = useRef(0);
  const newKey = () => `c${++counter.current}`;

  const inv = validateInventory(s.cargo);
  const items = inv.inventory?.items ?? null;
  const totals = items ? cargoSummary({ items }) : null;
  const rs = resourcesSummary(asResourcesLike(s.resources));
  const avisos = avisosDuplicado(s.params, s.resources);
  const bloqueo = bloqueoEmision(s.cargo, s.resources);

  const lineas = s.cargo.items.length;
  const resumen =
    lineas === 0 && s.cargo.summary.trim() === ''
      ? 'Opcional: objetos, accesos, ayudantes y equipamiento'
      : [
          s.cargo.mode === 'rapido' ? 'Modo rápido' : `${lineas} ${lineas === 1 ? 'objeto' : 'objetos'}`,
          totals?.weightKg != null ? `${totals.linesWithWeight < totals.lines ? '≥ ' : ''}${nf(totals.weightKg)} kg` : null,
          totals?.volumeM3 != null ? `${totals.linesWithVolume < totals.lines ? '≥ ' : ''}${nf(totals.volumeM3, 3)} m³` : null,
        ]
          .filter(Boolean)
          .join(' · ');
  const estado: Estado = bloqueo
    ? { nivel: 'error', etiqueta: 'Revisar', detalle: bloqueo }
    : avisos.length
      ? { nivel: 'faltan', etiqueta: 'Revisa los avisos', detalle: 'El detalle no coincide con los campos del costo' }
      : { nivel: 'completo', etiqueta: lineas || s.resources.helpers.length ? 'Listo' : 'Opcional', detalle: '' };

  return (
    <section className="cargo-integrada" aria-label="Detalle de la carga y recursos">
      <Disclosure className="disclosure card-like" title="Detalle de la carga y recursos" summary={resumen} estado={estado} open={open} onToggle={() => setOpen(!open)}>
        <p className="notice">
          Este detalle <strong>no cambia el costo</strong>: el costo sigue usando los campos de «Costos del viaje». Queda guardado con la cotización en
          este navegador. El cliente solo verá el texto que elijas en «Servicio» e «Incluye».
        </p>
        {avisos.length ? (
          <ul className="warn avisos" data-testid="avisos-duplicado">
            {avisos.map((a) => (
              <li key={a.id}>{a.texto}</li>
            ))}
          </ul>
        ) : null}
        <div className="preview-grid">
          <div className="preview-main">
            <InventoryEditor draft={s.cargo} onChange={(d) => session.setCargo(d)} newKey={newKey} />
            <AccessEditor draft={s.resources} onChange={(d) => session.setResources(d)} />
            <InternalResourcesEditor draft={s.resources} onChange={(d) => session.setResources(d)} newId={uuid} />
          </div>
          <aside className="preview-aside" aria-label="Resumen del detalle">
            <section className="card" aria-label="Resumen de la carga">
              <h2 className="sec">Resumen de la carga</h2>
              {totals === null ? (
                <p className="warn">Corrige los campos marcados para ver el resumen.</p>
              ) : (
                <div className="kpis">
                  <div className="kpi">
                    <span className="kpi-label">Peso</span>
                    <span className="kpi-value num">{totals.weightKg === null ? '—' : `${totals.linesWithWeight < totals.lines ? '≥ ' : ''}${nf(totals.weightKg)} kg`}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">Volumen</span>
                    <span className="kpi-value num">{totals.volumeM3 === null ? '—' : `${totals.linesWithVolume < totals.lines ? '≥ ' : ''}${nf(totals.volumeM3, 3)} m³`}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">Objetos</span>
                    <span className="kpi-value num">{totals.lines}</span>
                  </div>
                </div>
              )}
              <p className="sub">La estimación de viajes llegará cuando el vehículo tenga carga útil y volumen registrados.</p>
            </section>
            <section className="card internal" aria-label="Resumen de recursos">
              <div className="row-between">
                <h2 className="sec">Recursos (informativo)</h2>
                <span className="tag tag-internal">Solo para ti</span>
              </div>
              <p data-testid="integ-tiempo">
                Carga y descarga:{' '}
                {rs.handling.minutes === null ? 'sin dato' : `${rs.handling.complete ? '' : 'al menos '}${formatMinutes(rs.handling.minutes)}`}
              </p>
              <p data-testid="integ-ayudantes">
                Ayudantes ({rs.helperCount}): {totalInformativo(rs.helperCount, rs.helpersKnownTotal, rs.helpersMissing, rs.helpersInvalid)}
              </p>
              <p>
                Equipamiento ({s.resources.equipment.length}):{' '}
                {totalInformativo(s.resources.equipment.length, rs.equipmentKnownTotal, rs.equipmentMissing, rs.equipmentInvalid)}
              </p>
              {s.resources.equipment.length ? <p className="sub">Si ya lo incluiste en «Otros gastos», no lo repitas.</p> : null}
              <p className="sub">
                El costo usa: {s.params.helpers} × {s.params.helperFee === null ? 'pago sin dato' : formatClp(s.params.helperFee)} en ayudantes y{' '}
                {s.params.loadMinutes} min de carga y descarga.
              </p>
            </section>
          </aside>
        </div>
      </Disclosure>
    </section>
  );
}
