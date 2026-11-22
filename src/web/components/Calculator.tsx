import { useState, useSyncExternalStore } from 'react';
import { displayAmount, displayThreshold, formatClp } from '../../engine/rounding';
import type { Comparison } from '../../engine/compare';
import { googleMapsDirectionsUrl } from '../../shared/mapsUrl';
import type { RouteKind } from '../../shared/route';
import { VEHICLE_TYPE_LABEL, type VehicleProfile } from '../../shared/vehicle';
import { buildWaypoints } from '../../shared/waypoints';
import { boundedText, formatInputNumber, formatKm, formatMinutes, missingText, ROLE_LABEL, signedBoundedText, SOURCE_LABEL } from '../format';
import type { QuoteSession, RouteComputation, RouteState } from '../session';
import { bloqueoEmision } from '../modules/integracion';
import { blocksComputation, blocksQuote } from '../numericLimits';
import { CargoSection } from './CargoSection';
import { Fold } from './Fold';
import { NumberField } from './NumberField';

interface Props {
  session: QuoteSession;
  onCreateQuote: () => void;
  vehicles: VehicleProfile[];
  onManageVehicles: () => void;
  /**
   * I-1 (A-68): muestra el detalle de la carga y recursos. Solo con la flag de integración y SIN
   * cuenta (D-I2). Apagado, el cotizador es idéntico al de hoy.
   */
  cargoEnabled?: boolean;
}

const EXAMPLE = {
  fuelPricePerL: 1050,
  kmPerL: 12,
  wearPerKm: 31,
  fixedPerHour: 1500,
  ownerPerHour: 6000,
  helpers: 1,
  helperFee: 15000,
  loadMinutes: 60,
  tolls: 4200,
  otherCosts: 0,
};

export function Calculator({ session, onCreateQuote, vehicles, onManageVehicles, cargoEnabled = false }: Props) {
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const habitual = session.computation('habitual');
  const comparison = session.computation('evitarPeajes');
  const cmp = session.comparisonResult();
  const loading = s.habitual.status === 'cargando';
  const adjusted = session.vehicleAdjustments();
  // A-71: valores fuera de rango por campo; el cálculo queda en pausa y nada se corrige solo.
  const issues = session.numericIssues();
  // A-73: error, aviso de texto inválido y texto recuperado de cada campo, con la misma clave.
  const campo = (key: string) => ({ error: issues[key], onInvalidText: (t: string | null) => session.setTextIssue(key, t), invalidText: s.textIssues[key] });
  const p = (field: keyof typeof s.params) => campo(`params.${field}`);
  const numerosInvalidos = session.quoteBlockers().length > 0;
  const soloComparacion = Object.keys(issues).filter((k) => !blocksQuote(k)).length > 0;
  const fallaCalculo = session.computationError('habitual');
  // D-I3: con el detalle activo, no se emite si tiene datos por corregir.
  const bloqueoCarga = cargoEnabled ? bloqueoEmision(s.cargo, s.resources) : null;
  const mapsUrl = (() => {
    const { origin, destination, base, startAtBase, returnToBase } = s.inputs;
    if (origin.trim().length < 3 || destination.trim().length < 3) return null;
    return googleMapsDirectionsUrl(buildWaypoints({ origin, destination, base, startAtBase, returnToBase }));
  })();

  return (
    <>
    <div className="layout">
      {/* Columna 1: recorrido */}
      <section className="col">
        <div className="card">
          <h2 className="sec">Recorrido</h2>
          <TextField label="Desde (A)" value={s.inputs.origin} onChange={(v) => session.setInputs({ origin: v })} placeholder="Calle y número, comuna" />
          <TextField label="Hasta (B)" value={s.inputs.destination} onChange={(v) => session.setInputs({ destination: v })} placeholder="Calle y número, comuna" />
          <Fold summary="Base y regreso (opcional)" defaultOpen={s.inputs.startAtBase || s.inputs.returnToBase}>
            <label className="check">
              <input type="checkbox" checked={s.inputs.startAtBase} onChange={(e) => session.setInputs({ startAtBase: e.target.checked })} />
              Salgo desde mi base
            </label>
            <label className="check">
              <input type="checkbox" checked={s.inputs.returnToBase} onChange={(e) => session.setInputs({ returnToBase: e.target.checked })} />
              Vuelvo a la base
            </label>
            {s.inputs.startAtBase || s.inputs.returnToBase ? (
              <TextField label="Dirección de tu base" value={s.inputs.base} onChange={(v) => session.setInputs({ base: v })} placeholder="Calle y número, comuna" />
            ) : null}
          </Fold>
          <button type="button" className="btn" disabled={loading} onClick={() => void session.calculateRoute()}>
            {loading
              ? 'Calculando…'
              : s.habitual.status === 'manual' && (s.habitual.manualReason === 'error_proveedor' || s.habitual.manualReason === 'contador_no_disponible')
                ? 'Reintentar cálculo automático'
                : 'Calcular ruta'}
          </button>
          <button type="button" className="link-btn" onClick={() => session.useManual('habitual')}>
            Prefiero ingresar los km a mano
          </button>
          {s.habitual.message && s.habitual.status !== 'manual' ? (
            <p className="notice" role="status">
              {s.habitual.message}
            </p>
          ) : null}
        </div>

        <RouteCard title="Tu ruta" rs={s.habitual} computation={habitual} kind="habitual" session={session} mapsUrl={mapsUrl} />
      </section>

      {/* Columna 2: costos */}
      <section className="col">
        <div className="card">
          <div className="row-between">
            <h2 className="sec">Costos del viaje</h2>
            <button type="button" className="link-btn" onClick={() => session.setParams(EXAMPLE)}>
              Cargar ejemplo ficticio
            </button>
          </div>
          <VehiclePicker session={session} vehicles={vehicles} onManageVehicles={onManageVehicles} />
          <div className="grid2">
            <NumberField
              label="Rendimiento"
              suffix="km/L"
              value={s.params.kmPerL}
              onChange={(v) => session.setParams({ kmPerL: v })}
              tag={adjusted.includes('kmPerL') ? 'Solo esta cotización' : undefined}
              {...p('kmPerL')}
            />
            <NumberField
              label="Desgaste del vehículo"
              suffix="$/km"
              value={s.params.wearPerKm}
              onChange={(v) => session.setParams({ wearPerKm: v })}
              hint="Neumáticos, aceite y mantención"
              tag={adjusted.includes('wearPerKm') ? 'Solo esta cotización' : undefined}
              {...p('wearPerKm')}
            />
            <NumberField
              label={s.vehicle?.fuel === 'gasolina' ? 'Precio de la gasolina' : s.vehicle?.fuel === 'diesel' ? 'Precio del diésel' : 'Precio del combustible'}
              suffix="$/L"
              value={s.params.fuelPricePerL}
              onChange={(v) => session.setParams({ fuelPricePerL: v })}
              {...p('fuelPricePerL')}
            />
            {/* A-71: sin redondear en silencio; un número con decimales se marca como inválido. */}
            <NumberField label="Ayudantes" value={s.params.helpers} placeholder="0" onChange={(v) => session.setParams({ helpers: v ?? 0 })} {...p('helpers')} />
            <NumberField label="Pago por ayudante" suffix="$" value={s.params.helperFee} onChange={(v) => session.setParams({ helperFee: v })} {...p('helperFee')} />
            <NumberField
              label="Peajes y TAG"
              suffix="$"
              value={s.params.tolls}
              onChange={(v) => session.setParams({ tolls: v })}
              hint="Vacío = no lo sé · 0 = no hay peajes"
              {...p('tolls')}
            />
            <NumberField label="Carga y descarga" suffix="min" value={s.params.loadMinutes} placeholder="0" onChange={(v) => session.setParams({ loadMinutes: v ?? 0 })} {...p('loadMinutes')} />
          </div>
          <Fold summary="Opciones avanzadas">
            <div className="grid2">
              <NumberField label="Parte de tus gastos fijos" suffix="$/h" value={s.params.fixedPerHour} onChange={(v) => session.setParams({ fixedPerHour: v })} hint="Seguro, permiso, patente" {...p('fixedPerHour')} />
              <NumberField label="Lo que quieres ganar por tu trabajo" suffix="$/h" value={s.params.ownerPerHour} onChange={(v) => session.setParams({ ownerPerHour: v })} hint="Es tu meta, no un gasto" {...p('ownerPerHour')} />
              <NumberField label="Otros gastos" suffix="$" value={s.params.otherCosts} placeholder="0" onChange={(v) => session.setParams({ otherCosts: v ?? 0 })} hint="Estacionamiento, materiales" {...p('otherCosts')} />
              <NumberField label="Recargos al precio" suffix="$" value={s.surcharges} placeholder="0" onChange={(v) => session.setSurcharges(v ?? 0)} hint="Urgencia, pisos, etc." {...campo('surcharges')} />
            </div>
          </Fold>
        </div>
        <Breakdown computation={habitual} />
      </section>

      {/* Columna 3: precio, comparación y cotización */}
      <section className="col">
        <PriceCard session={session} computation={habitual} />
        <ComparisonCard session={session} habitualReady={s.habitual.status === 'listo'} comparison={comparison} cmp={cmp} />
        <button type="button" className="btn" disabled={!session.canQuote() || bloqueoCarga !== null} onClick={onCreateQuote}>
          Crear cotización
        </button>
        {numerosInvalidos ? (
          <p className="warn" role="alert" data-testid="bloqueo-numeros">
            Hay valores inválidos o fuera de rango (marcados en rojo). El cálculo queda en pausa y no se puede cotizar hasta que los revises; no se cambió ningún dato.
          </p>
        ) : null}
        {soloComparacion ? (
          <p className="sub" role="status" data-testid="pausa-comparacion">
            La comparación sin peajes queda en pausa por un valor inválido. No afecta a tu cotización principal.
          </p>
        ) : null}
        {fallaCalculo ? (
          <p className="warn" role="alert" data-testid="falla-calculo">
            {fallaCalculo}
          </p>
        ) : null}
        {bloqueoCarga ? (
          <p className="warn" data-testid="bloqueo-carga">
            Revisa el detalle de la carga antes de crear la cotización: {bloqueoCarga}
          </p>
        ) : null}
        {!habitual && !numerosInvalidos ? <p className="sub">Calcula la ruta (o ingresa los km) para cotizar.</p> : null}
        {habitual && s.chosenPrice === null ? <p className="sub">Escribe el precio que vas a cobrar para crear la cotización.</p> : null}
        {session.priceNeedsConfirmation() ? <p className="sub">Confirma tu precio (en «Tu precio») para crear la cotización.</p> : null}
      </section>
    </div>
    {cargoEnabled ? <CargoSection session={session} /> : null}
    </>
  );
}

function VehiclePicker({ session, vehicles, onManageVehicles }: { session: QuoteSession; vehicles: VehicleProfile[]; onManageVehicles: () => void }) {
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const applied = s.vehicle;
  const stored = applied ? vehicles.find((v) => v.id === applied.id) : undefined;
  const deleted = applied !== null && stored === undefined;
  const changed =
    stored !== undefined &&
    applied !== null &&
    (stored.kmPerL !== applied.kmPerL || stored.wearPerKm !== applied.wearPerKm || stored.name !== applied.name || stored.fuel !== applied.fuel);
  const adjusted = session.vehicleAdjustments();

  if (vehicles.length === 0 && !applied) {
    return (
      <p className="notice">
        ¿Usas siempre el mismo vehículo?{' '}
        <button type="button" className="link-btn inline" onClick={onManageVehicles}>
          Regístralo
        </button>{' '}
        y sus datos se cargarán solos.
      </p>
    );
  }
  return (
    <div className="vehicle-picker">
      <label className="field">
        <span className="field-label">Vehículo</span>
        <span className="field-input">
          <select
            value={applied?.id ?? ''}
            onChange={(e) => session.selectVehicle(vehicles.find((v) => v.id === e.target.value) ?? null)}
          >
            <option value="">Sin vehículo guardado</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {VEHICLE_TYPE_LABEL[v.type]}
              </option>
            ))}
            {deleted && applied ? <option value={applied.id}>{applied.name} (eliminado)</option> : null}
          </select>
        </span>
      </label>
      <div className="row-gap">
        {adjusted.length > 0 ? (
          <button type="button" className="link-btn" onClick={() => session.restoreVehicleValues()}>
            Restaurar valores del vehículo
          </button>
        ) : null}
        <button type="button" className="link-btn" onClick={onManageVehicles}>
          Administrar vehículos
        </button>
      </div>
      {changed && stored ? (
        <p className="notice">
          Editaste este vehículo después de elegirlo.{' '}
          <button type="button" className="link-btn inline" onClick={() => session.selectVehicle(stored)}>
            Cargar sus datos actualizados
          </button>
        </p>
      ) : null}
      {deleted ? <p className="sub">Este vehículo fue eliminado; sus valores se mantienen solo en esta cotización.</p> : null}
      {!applied && (s.params.kmPerL !== null || s.params.wearPerKm !== null) ? (
        <p className="sub">Sin vehículo guardado: se mantienen el rendimiento y el desgaste que ya estaban escritos. Revísalos abajo.</p>
      ) : null}
      {applied && (applied.kmPerL === null || applied.wearPerKm === null) ? (
        <p className="sub">A este vehículo le falta {applied.kmPerL === null ? 'el rendimiento' : ''}{applied.kmPerL === null && applied.wearPerKm === null ? ' y ' : ''}{applied.wearPerKm === null ? 'el desgaste' : ''}: el costo saldrá parcial hasta que lo completes.</p>
      ) : null}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      </span>
    </label>
  );
}

function RouteCard(props: { title: string; rs: RouteState; computation: RouteComputation | null; kind: RouteKind; session: QuoteSession; mapsUrl: string | null }) {
  const { rs, computation, kind, session, mapsUrl } = props;
  const issues = session.numericIssues();
  const textIssues = session.getSnapshot().textIssues;
  if (rs.status === 'vacio' || rs.status === 'cargando') return null;
  if (rs.status === 'desactualizado') {
    // Ruta de direcciones anteriores: no se muestra ni se usa para calcular (auditoría P0).
    return (
      <div className="card">
        <h2 className="sec">{props.title}</h2>
        <p className="warn">Cambiaste el recorrido. Presiona «Calcular ruta» (o ingresa los km a mano) para actualizar costos y precio.</p>
      </div>
    );
  }
  const legs =
    rs.status === 'manual'
      ? rs.manualLegs
      : rs.route?.legs.map((l, i) => ({
          from: l.from,
          to: l.to,
          km: rs.overrides[i]?.km ?? l.distanceM / 1000,
          minutes: rs.overrides[i]?.minutes ?? l.durationS / 60,
        })) ?? [];
  const source = computation?.source ?? (rs.status === 'manual' ? 'declarado' : rs.route?.source ?? 'declarado');
  return (
    <div className="card">
      <div className="row-between">
        <h2 className="sec">{props.title}</h2>
        <span className={source === 'simulado' ? 'tag tag-warn' : 'tag tag-neutral'}>{SOURCE_LABEL[source]}</span>
      </div>
      {source === 'simulado' || rs.route?.source === 'simulado' ? (
        <p className="warn">
          <strong>Datos simulados.</strong> Estos kilómetros y minutos NO son reales: Google Routes aún no está conectado. Corrígelos con los de tu recorrido.
        </p>
      ) : null}
      {rs.status === 'manual' && rs.message ? (
        // D-I8 (A-69): un recorrido recuperado de un borrador se destaca para que se revise.
        <p className={rs.recovered ? 'warn' : 'notice'} role="status" data-testid={rs.recovered ? 'ruta-recuperada' : undefined}>
          {rs.message}
        </p>
      ) : null}
      {rs.route?.warnings
        .filter((w) => w.code === 'coincidencia_parcial')
        .map((w) => (
          <p className="warn" key={`${w.code}-${'point' in w ? w.point : ''}`}>
            No encontramos con exactitud el punto {'point' in w ? ROLE_LABEL[w.point] : ''}. Revisa que la dirección tenga comuna, o corrige los km.
          </p>
        ))}
      {rs.route?.warnings.map((w) =>
        w.code === 'tramo_atipico' ? (
          <p className="warn" key={`atipico-${w.leg}`}>
            El tramo {w.leg + 1} tiene una velocidad promedio poco habitual. Revisa sus km y minutos antes de cotizar.
          </p>
        ) : null,
      )}
      {rs.route?.warnings.some((w) => w.code === 'peajes_no_garantizados') ? (
        <p className="sub">Evitar peajes es una preferencia: la ruta puede tener algún peaje.</p>
      ) : null}
      <table className="legs">
        <thead>
          <tr>
            <th>Tramo</th>
            <th>Km</th>
            <th>Minutos</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, i) => (
            <tr key={`${leg.from}-${leg.to}-${i}`}>
              <td>
                {ROLE_LABEL[leg.from]} → {ROLE_LABEL[leg.to]}
              </td>
              <td>
                <NumberField compact decimals={1} label={`Km tramo ${i + 1}`} value={leg.km} onChange={(v) => session.setLegOverride(kind, i, { km: v })} placeholder="km" error={issues[`${kind}.leg.${i}.km`]} onInvalidText={(t) => session.setTextIssue(`${kind}.leg.${i}.km`, t)} invalidText={textIssues[`${kind}.leg.${i}.km`]} />
              </td>
              <td>
                <NumberField compact decimals={0} label={`Minutos tramo ${i + 1}`} value={leg.minutes} onChange={(v) => session.setLegOverride(kind, i, { minutes: v })} placeholder="min" error={issues[`${kind}.leg.${i}.minutes`]} onInvalidText={(t) => session.setTextIssue(`${kind}.leg.${i}.minutes`, t)} invalidText={textIssues[`${kind}.leg.${i}.minutes`]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {computation ? (
        <p className="total">
          Total: <strong>{formatKm(computation.km)}</strong> · <strong>{formatMinutes(computation.minutes)}</strong>
          <span className="sub"> · tiempo habitual, sin tráfico actual</span>
        </p>
      ) : (
        <p className="sub">Completa km y minutos de cada tramo.</p>
      )}
      {mapsUrl && kind === 'habitual' ? (
        <a className="btn2" href={mapsUrl} target="_blank" rel="noreferrer">
          Ver ruta en Google Maps
        </a>
      ) : null}
    </div>
  );
}

function Breakdown({ computation }: { computation: RouteComputation | null }) {
  if (!computation) return null;
  const m = computation.measures;
  const invalid = (computation?.items ?? []).filter((it) => it.invalid).map((it) => it.id);
  // Con costo parcial (cota inferior, que se muestra truncada) las partidas también se truncan,
  // para que su suma nunca supere el total mostrado (auditoría 2). Solo cambia la presentación.
  const shown = (v: number) => formatClp(m.cost.type === 'cotaInferior' ? Math.floor(v) : Math.round(v));
  const line = (label: string, b: typeof m.D, hint?: string) => (
    <div className="ln">
      <span>
        {label}
        {hint ? <span className="sub"> · {hint}</span> : null}
      </span>
      <span className="num">{b.missing.length ? <span className="tag tag-missing">{b.value === 0 ? 'Falta' : `${formatClp(Math.floor(b.value))} + ?`}</span> : shown(b.value)}</span>
    </div>
  );
  return (
    <div className="card">
      <h2 className="sec">Desglose</h2>
      {!m.complete ? (
        <p className="warn">
          <strong>Costo parcial.</strong> Falta: {missingText(m.missing)}. Puedes seguir cotizando, pero el costo real puede ser mayor.
          {invalid.length ? <> Revisa: {missingText(invalid)} (el dato ingresado no es válido y no se usó).</> : null}
        </p>
      ) : null}
      {line('Lo que pagas en el viaje', m.D, 'combustible, peajes, ayudantes')}
      {line('Desgaste del vehículo', m.W)}
      {line('Parte de tus gastos fijos', m.CF)}
      {line('Lo que quieres ganar por tu trabajo', m.R, 'tu meta')}
      <div className="ln strong">
        <span>Costo del viaje</span>
        <span className="num">{boundedText(m.cost, 'costo')}</span>
      </div>
    </div>
  );
}

function PriceCard({ session, computation }: { session: QuoteSession; computation: RouteComputation | null }) {
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [custom, setCustom] = useState(() => ![0.1, 0.15, 0.2].includes(s.margin));
  const m = computation?.measures ?? null;
  const pct = Math.round(s.margin * 100);
  const issues = session.numericIssues();
  // A-71: un margen fuera de rango (p. ej., de un borrador dañado) siempre queda a la vista.
  const showCustom = custom || issues.margin !== undefined;
  return (
    <div className="card highlight">
      <h2 className="sec">Tu precio</h2>
      <span className="field-label">Margen objetivo (% del precio de venta)</span>
      <p className="sub">Ejemplo: con 15 %, de cada $100 que cobras, $15 quedan como margen sobre tus costos.</p>
      <div className="segs">
        {[10, 15, 20].map((p) => (
          <button
            type="button"
            key={p}
            className={!showCustom && pct === p ? 'seg seg-on' : 'seg'}
            onClick={() => {
              setCustom(false);
              session.setMargin(p / 100);
            }}
          >
            {p} %
          </button>
        ))}
        <button type="button" className={showCustom ? 'seg seg-on' : 'seg'} onClick={() => setCustom(true)}>
          Otro
        </button>
      </div>
      {showCustom ? (
        // A-71: sin recortar en silencio a 0–80 %; un valor fuera de rango se marca en el campo.
        <NumberField
          label="Margen objetivo"
          suffix="%"
          decimals={2}
          value={Math.round(s.margin * 10000) / 100}
          onChange={(v) => session.setMargin((v ?? 0) / 100)}
          error={issues.margin}
          onInvalidText={(t) => session.setTextIssue('margin', t)}
          invalidText={s.textIssues.margin}
        />
      ) : null}
      {m ? (
        <div className="suggest">
          <span>Precio sugerido</span>
          <strong className="num">{boundedText(m.suggested, 'precio')}</strong>
        </div>
      ) : (
        <p className="sub">{Object.keys(issues).some((k) => blocksComputation(k, 'habitual')) ? 'Revisa los campos marcados para ver el precio sugerido.' : 'Calcula la ruta para ver el precio sugerido.'}</p>
      )}
      {m && !m.complete ? <p className="sub">Precio indicativo: faltan datos, puede quedar corto.</p> : null}
      <NumberField
        label="Precio que vas a cobrar"
        suffix="$"
        value={s.chosenPrice}
        onChange={(v) => session.setChosenPrice(v)}
        placeholder={m ? formatInputNumber(displayAmount(m.suggested), 0) : 'Escribe tu precio'}
        error={issues.chosenPrice}
        onInvalidText={(t) => session.setTextIssue('chosenPrice', t)}
        invalidText={s.textIssues.chosenPrice}
      />
      {session.priceNeedsConfirmation() ? (
        <div className="warn" role="alert">
          <p className="price-changed">El costo del viaje cambió después de que escribiste tu precio. Revisa si te sigue conviniendo.</p>
          <button type="button" className="btn2 small" onClick={() => session.confirmPrice()}>
            Mantener este precio
          </button>
        </div>
      ) : null}
      {m && m.afterTrip && m.afterAllCosts && m.overGoal ? (
        <div className="results">
          <div className="ln">
            <span>Te queda después de pagar el viaje</span>
            <span className="num">{boundedText(m.afterTrip, 'resultado')}</span>
          </div>
          <div className="ln">
            <span>Te queda después de todos los costos</span>
            <span className="num">{boundedText(m.afterAllCosts, 'resultado')}</span>
          </div>
          <div className="ln">
            <span>Sobre lo que querías ganar</span>
            <span className="num">{signedBoundedText(m.overGoal)}</span>
          </div>
          {!m.complete ? <p className="sub">Con datos faltantes estos montos son un máximo: no es una ganancia asegurada.</p> : null}
        </div>
      ) : null}
      <p className="sub">IVA: tu cliente verá este monto como «Precio total», sin desglose de IVA, hasta que se verifiquen las reglas tributarias (#16). Si tu servicio lleva IVA, considéralo en el precio.</p>
    </div>
  );
}

function ComparisonCard(props: { session: QuoteSession; habitualReady: boolean; comparison: RouteComputation | null; cmp: Comparison | null }) {
  const { session, habitualReady, comparison, cmp } = props;
  const s = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const loading = s.comparison.status === 'cargando';
  const left = s.quota ? `Te quedan ${s.quota.comparisonsLeftToday} hoy y ${s.quota.comparisonsLeftMonth} este mes.` : 'Hasta 3 al día y 10 al mes.';
  return (
    <Fold className="card fold-card" summaryClassName="sec" summary="Comparar con ruta sin peajes (opcional)">
      <p className="sub">Usa 1 consulta adicional. {left}</p>
      <button type="button" className="btn2" disabled={!habitualReady || loading} onClick={() => void session.compareWithoutTolls()}>
        {loading ? 'Comparando…' : 'Comparar sin peajes'}
      </button>
      {!habitualReady ? <p className="sub">Primero calcula la ruta habitual.</p> : null}
      {s.comparison.message && s.comparison.status !== 'listo' ? (
        <p className="notice" role="status">
          {s.comparison.message}
        </p>
      ) : null}
      {s.comparison.status === 'listo' || s.comparison.status === 'manual' ? (
        <>
          <RouteCard title="Ruta sin peajes" rs={s.comparison} computation={comparison} kind="evitarPeajes" session={session} mapsUrl={null} />
          <NumberField
            label="Peajes de la ruta sin peajes"
            suffix="$"
            value={s.tollsComparison}
            onChange={(v) => session.setTollsComparison(v)}
            error={session.numericIssues().tollsComparison}
            onInvalidText={(t) => session.setTextIssue('tollsComparison', t)}
            invalidText={s.textIssues.tollsComparison}
            hint="Vacío = no lo sé · 0 = no hay"
          />
          {comparison ? (
            <div className="ln strong">
              <span>Costo ruta sin peajes</span>
              <span className="num">{boundedText(comparison.measures.cost, 'costo')}</span>
            </div>
          ) : null}
          {cmp ? <p className="conclusion">{comparisonText(cmp)}</p> : null}
        </>
      ) : null}
    </Fold>
  );
}

function comparisonText(c: Comparison): string {
  const name = (r: 'x' | 'y') => (r === 'x' ? 'la ruta habitual' : 'la ruta sin peajes');
  switch (c.kind) {
    case 'concluyente':
      return c.cheaper === 'empate' ? 'Ambas rutas cuestan lo mismo.' : `Conviene ${name(c.cheaper)}: ahorras ${formatClp(Math.floor(c.difference))}.`;
    case 'umbralPeajes':
      return `Aún no sabemos cuál conviene. Si los peajes de ${name(c.route)} suman menos de ${formatClp(displayThreshold(c.threshold))}, conviene ${name(c.route)}.`;
    case 'umbralTarifa':
      return `No es concluyente: conviene ${name(c.cheaperIfAbove)} si el costo de ${missingText([c.item])} supera ${formatClp(Math.ceil(c.threshold))} por ${c.per}.`;
    default:
      return `No se puede comparar todavía: falta ${missingText(c.missing)}.`;
  }
}
