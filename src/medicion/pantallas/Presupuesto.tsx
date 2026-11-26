/**
 * Estimación previa (presupuesto): lo básico a la vista y, plegado en «Opciones avanzadas» (A-92), la
 * modalidad, desgaste, remuneración, gastos fijos, base tributaria, precisión y la procedencia de cada dato.
 * Formulario prellenado (vehículo, cotización o corrección), vista previa con el
 * contrato de #55 (`crearPresupuesto`, mismo motor) y botón «Sellar». Un presupuesto sellado no se edita:
 * corregir = sellar uno nuevo y anular el anterior.
 */
import { useMemo, useState } from 'react';
import { procedencia, type Procedencia } from '../../shared/procedencia';
import { fichaPrevia, previsualizar } from '../campo';
import type { BaseClp, Directa, FuentePrecio, Modalidad, Muestra, OrigenPresupuesto, PresupuestoSellado, Uso } from '../modelo';
import { CAMPOS_PLAN, construirPlan, ETIQUETAS_PLAN, type CampoPlan, type EntradaPlan, type OpcionesPlan } from '../presupuesto';
import { guardarPresupuesto, siguienteCodigo } from '../repositorio';
import { anular, huellaCorta, sellar } from '../sello';
import { isoLocal } from '../tiempo';
import { aTexto, fmtClp, parseNumero, useCtx } from '../ui';

/** [título, campos, partida directa que puede marcarse «no aplica», solo fuera del uso personal, avanzado]. */
const GRUPOS: [string, CampoPlan[], Directa | null, boolean, boolean][] = [
  ['Distancia y tiempo', ['km', 'marchaMin', 'esperaMin', 'cargaMin', 'descargaMin'], null, false, false],
  ['Combustible', ['precioLitro', 'kmL'], null, false, false],
  ['TAG y peajes', ['tag'], 'peajes', false, false],
  ['Ayudantes (si corresponde)', ['ayudantes', 'pagoAyudante'], 'ayudantes', false, false],
  ['Otros gastos del viaje', ['otros'], 'otros', false, false],
  ['Desgaste por kilómetro (cuando exista evidencia)', ['desgasteKm'], null, false, true],
  ['Remuneración y margen deseados', ['trabajoHora', 'margenPct', 'recargos'], null, true, true],
];

/** Etiquetas en palabras simples para el formulario (las técnicas siguen en `ETIQUETAS_PLAN`). */
const ETIQ_SIMPLE: Partial<Record<CampoPlan, string>> = {
  km: 'Kilómetros que vas a recorrer',
  marchaMin: 'Minutos manejando',
  esperaMin: 'Minutos esperando',
  cargaMin: 'Minutos cargando',
  descargaMin: 'Minutos descargando',
  precioLitro: 'Precio del litro ($)',
  kmL: 'Rendimiento (km por litro)',
  tag: 'TAG y peajes ($)',
  otros: 'Otros gastos ($)',
};

const ETIQ_CLASE: Record<string, string> = {
  medido: 'medido',
  comprobado: 'comprobado',
  declarado: 'declarado',
  estimado: 'estimado',
  simulado: 'simulado',
  faltante: 'dato faltante',
};
const ETIQ_FUENTE: Record<string, string> = {
  usuario: 'tú',
  valorInicial: 'valor inicial',
  vehiculo: 'vehículo',
  ejemplo: 'ejemplo',
  ruta: 'recorrido',
  referencia: 'cotización',
  medicion: 'medición',
  comprobante: 'comprobante',
};

export function Procedencia({ p }: { p: Procedencia }) {
  return (
    <small className={`m-proc m-proc-${p.clase}`}>
      {ETIQ_CLASE[p.clase]}
      {p.clase !== 'faltante' ? ` · ${ETIQ_FUENTE[p.fuente.tipo] ?? p.fuente.tipo}${p.fuente.detalle ? ` (${p.fuente.detalle})` : ''}${p.fecha ? ` · ${p.fecha}` : ''}` : ''}
    </small>
  );
}

export function FormPresupuesto(props: {
  inicial: EntradaPlan;
  origen: OrigenPresupuesto;
  uso: Uso;
  avisosIniciales: string[];
  reemplaza: PresupuestoSellado | null;
  onSellado: (p: PresupuestoSellado) => void;
  onCancelar: () => void;
}) {
  const { a, d, veh, recargar, avisar } = useCtx();
  const [e, setE] = useState<EntradaPlan>(props.inicial);
  const [textos, setTextos] = useState<Record<CampoPlan, string>>(() => Object.fromEntries(CAMPOS_PLAN.map((k) => [k, aTexto(props.inicial[k].valor)])) as Record<CampoPlan, string>);
  const [sellando, setSellando] = useState(false);
  const [verOrigen, setVerOrigen] = useState(false);
  const [textoIncert, setTextoIncert] = useState(aTexto(props.inicial.opciones.incertidumbreKm));
  const [textoCorte, setTextoCorte] = useState(() => {
    const a = props.inicial.opciones.ajusteHasta;
    return a && a !== 'sin_ajuste' ? { fecha: a.fecha, odometro: aTexto(a.odometro) } : { fecha: '', odometro: '' };
  });
  const [modoAjuste, setModoAjuste] = useState<'' | 'sin' | 'corte'>(() => {
    const a = props.inicial.opciones.ajusteHasta;
    return a === 'sin_ajuste' ? 'sin' : a ? 'corte' : '';
  });
  const codigo = props.reemplaza?.datos.id ?? siguienteCodigo(d);
  const construido = useMemo(() => construirPlan(e, props.uso, veh?.resolucionTripKm ?? veh?.resolucionOdometroKm ?? null), [e, props.uso, veh]);
  // Vista previa con el contrato (mismo motor que el sello); si lo rechaza, se muestra el motivo.
  const vista = useMemo(
    () => (veh ? previsualizar(fichaPrevia(props.uso, veh.alias, veh.tipoVehiculo, construido.plan), codigo, new Date().toISOString()) : { datos: null, error: 'Sin vehículo' }),
    [construido, props.uso, veh, codigo],
  );
  const resultado = vista.datos?.resultado ?? null;
  if (!veh) return null;
  const op = e.opciones;
  const personal = props.uso === 'personal';
  const opcion = (cambio: Partial<OpcionesPlan>) => setE((s) => ({ ...s, opciones: { ...s.opciones, ...cambio } }));
  const corte = (fecha: string, odometro: string) => {
    setTextoCorte({ fecha, odometro });
    const n = parseNumero(odometro);
    opcion({ ajusteHasta: /^\d{4}-\d{2}-\d{2}$/.test(fecha) && n !== null && n >= 0 ? { fecha, odometro: n } : null });
  };

  const cambiar = (k: CampoPlan, texto: string) => {
    setTextos((s) => ({ ...s, [k]: texto }));
    const v = parseNumero(texto);
    const hoy = isoLocal().slice(0, 10);
    setE((s) => ({ ...s, [k]: v === null ? { valor: null, procedencia: procedencia('faltante', 'usuario') } : { valor: v, procedencia: procedencia(props.uso === 'simulacion' ? 'simulado' : 'declarado', 'usuario', null, hoy) } }));
  };

  const puedeSellar = construido.plan.km !== null && construido.plan.marchaMin !== null && resultado !== null;

  const sellarAhora = async () => {
    if (!puedeSellar) return;
    setSellando(true);
    try {
      const ahora = isoLocal();
      const p = await sellar({
        ficha: fichaPrevia(props.uso, veh.alias, veh.tipoVehiculo, construido.plan),
        codigo,
        // Formato del contrato de #55: ISO UTC con milisegundos.
        fecha: new Date().toISOString(),
        vehiculoId: veh.id,
        meta: { procedencia: construido.procedencia, origen: props.origen },
        ahora,
        reemplazaA: props.reemplaza?.id ?? null,
      });
      await guardarPresupuesto(a, p);
      if (props.reemplaza) await guardarPresupuesto(a, anular(props.reemplaza, `corregido: reemplazado por el sello ${huellaCorta(p.sha256)}`, ahora));
      await recargar();
      avisar(`Estimación ${codigo} guardada`);
      props.onSellado(p);
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo sellar.');
    } finally {
      setSellando(false);
    }
  };

  const grupo = ([titulo, campos, directa]: (typeof GRUPOS)[number]) => {
    const noAplica = directa !== null && op.noAplica.includes(directa);
    return (
      <fieldset key={titulo} className="m-grupo">
        <legend>{titulo}</legend>
        {directa ? (
          <label className="m-check">
            <input
              type="checkbox"
              checked={noAplica}
              data-no-aplica={directa}
              onChange={(ev) => opcion({ noAplica: ev.target.checked ? [...op.noAplica, directa] : op.noAplica.filter((x) => x !== directa) })}
            />
            No aplica en este viaje
          </label>
        ) : null}
        {noAplica ? (
          <p className="m-nota">No aplica: queda fuera del costo (no es un dato que falte ni un cero). Lo que habías escrito se guarda por si cambias de idea.</p>
        ) : (
          <div className="m-grilla">
            {campos.map((k) => (
              <label key={k} className="m-campo" htmlFor={`pres-${k}`}>
                <span>{ETIQ_SIMPLE[k] ?? ETIQUETAS_PLAN[k]}</span>
                <input id={`pres-${k}`} inputMode="decimal" autoComplete="off" value={textos[k]} onChange={(ev) => cambiar(k, ev.target.value)} />
                {verOrigen ? <Procedencia p={construido.procedencia[k] ?? e[k].procedencia} /> : null}
              </label>
            ))}
            {campos.includes('precioLitro') ? (
              <label className="m-campo">
                <span>¿De dónde sacaste el precio?</span>
                <select id="pres-fuente" value={e.fuentePrecio ?? ''} onChange={(ev) => setE((s) => ({ ...s, fuentePrecio: (ev.target.value || null) as FuentePrecio | null }))}>
                  <option value="">— no lo indico —</option>
                  <option value="boleta">De la boleta</option>
                  <option value="surtidor">Lo vi en el surtidor</option>
                  <option value="declaracion">Lo sé yo</option>
                  <option value="referencia_publicada">De un precio publicado</option>
                  <option value="supuesto">Es un supuesto</option>
                </select>
              </label>
            ) : null}
          </div>
        )}
      </fieldset>
    );
  };

  return (
    <section className="m-tarjeta" aria-label="Presupuesto previo">
      <h1 className="m-titulo">{props.reemplaza ? `Corregir la estimación ${props.reemplaza.datos.id}` : '¿Cuánto crees que costará?'}</h1>
      <p className="m-nota">
        Solo necesitas los kilómetros y los minutos manejando. Lo que no sepas, déjalo en blanco: no lo reemplazamos por cero (un cero escrito sí es cero).
        {props.origen.tipo === 'cotizacion' ? ` Origen: cotización v${props.origen.schemaVersion}${props.origen.folio ? ' ' + props.origen.folio : ''}${props.origen.ficticia ? ' (ficticia)' : ''}.` : ''}
      </p>
      {[...props.avisosIniciales, ...construido.avisos].length ? (
        <ul className="m-avisos">
          {[...new Set([...props.avisosIniciales, ...construido.avisos])].map((t) => (
            <li key={t} className="m-aviso">
              {t}
            </li>
          ))}
        </ul>
      ) : null}
      {personal ? (
        <p className="m-nota" data-modalidad-personal>
          Uso personal: solo cuentan los gastos que pagas en el viaje (combustible, TAG, ayudantes y otros). No te pedimos sueldo, margen ni gastos fijos.
        </p>
      ) : null}
      {GRUPOS.filter(([, , , comercial, avanzado]) => !avanzado && !(comercial && personal)).map(grupo)}
      <details className="m-avanzado" data-avanzado="presupuesto">
        <summary>Opciones avanzadas</summary>
        <label className="m-check">
          <input type="checkbox" checked={verOrigen} onChange={(ev) => setVerOrigen(ev.target.checked)} data-ver-origen />
          Mostrar de dónde sale cada dato
        </label>
        {!personal ? (
          <fieldset className="m-grupo" data-modalidad>
            <legend>Modalidad</legend>
            <div className="m-fila" role="radiogroup" aria-label="Modalidad">
              {(
                [
                  ['simplificada', 'Simplificada'],
                  ['detallada', 'Detallada'],
                ] as [Modalidad, string][]
              ).map(([m, t]) => (
                <button key={m} type="button" className={op.modalidad === m ? 'm-btn m-btn-on' : 'm-btn'} aria-pressed={op.modalidad === m} onClick={() => opcion({ modalidad: m })} data-modalidad-opcion={m}>
                  {t}
                </button>
              ))}
            </div>
            <p className="m-nota">
              {op.modalidad === 'simplificada'
                ? 'Simplificada (recomendada): combustible, TAG, distancia y tiempo, desgaste, ayudantes y otros costos del servicio. No suma gastos fijos ni pide contabilidad anual. Lo que escribiste en la detallada se conserva.'
                : 'Detallada: además suma los gastos fijos por hora productiva.'}
            </p>
          </fieldset>
        ) : null}
        {GRUPOS.filter(([, , , comercial, avanzado]) => avanzado && !(comercial && personal)).map(grupo)}
        {!personal && op.modalidad === 'detallada' ? (
          <fieldset className="m-grupo">
            <legend>Gastos fijos (modalidad detallada)</legend>
            <div className="m-grilla">
              <label className="m-campo" htmlFor="pres-fijoHora">
                <span>{ETIQUETAS_PLAN.fijoHora}</span>
                <input id="pres-fijoHora" inputMode="decimal" autoComplete="off" value={textos.fijoHora} onChange={(ev) => cambiar('fijoHora', ev.target.value)} />
                {verOrigen ? <Procedencia p={construido.procedencia.fijoHora ?? e.fijoHora.procedencia} /> : null}
              </label>
            </div>
          </fieldset>
        ) : null}
        <fieldset className="m-grupo" data-precision>
          <legend>Base de los montos y precisión (para poder comparar después)</legend>
          <div className="m-grilla">
            <label className="m-campo">
              <span>Los montos son</span>
              <select id="pres-base" value={op.baseClp ?? ''} onChange={(ev) => opcion({ baseClp: (ev.target.value || null) as BaseClp })}>
                <option value="">— no lo sé (sin comparación en pesos) —</option>
                <option value="neto">Netos (sin IVA)</option>
                <option value="con_iva">Con IVA</option>
              </select>
            </label>
            <label className="m-campo">
              <span>¿Cómo obtuviste el rendimiento?</span>
              <select
                id="pres-ajuste"
                value={modoAjuste}
                onChange={(ev) => {
                  const m = ev.target.value as '' | 'sin' | 'corte';
                  setModoAjuste(m);
                  if (m === 'sin') opcion({ ajusteHasta: 'sin_ajuste' });
                  else if (m === 'corte') corte(textoCorte.fecha, textoCorte.odometro);
                  else opcion({ ajusteHasta: null });
                }}
              >
                <option value="">— no lo sé (independencia pendiente) —</option>
                <option value="sin">No lo ajusté con mis cargas</option>
                <option value="corte">Lo ajusté con cargas hasta una fecha</option>
              </select>
            </label>
            {modoAjuste === 'corte' ? (
              <>
                <label className="m-campo">
                  <span>Último día usado para ajustar</span>
                  <input type="date" value={textoCorte.fecha} onChange={(ev) => corte(ev.target.value, textoCorte.odometro)} />
                </label>
                <label className="m-campo">
                  <span>Mayor odómetro usado</span>
                  <input inputMode="decimal" value={textoCorte.odometro} onChange={(ev) => corte(textoCorte.fecha, ev.target.value)} />
                </label>
              </>
            ) : null}
            <label className="m-campo">
              <span>Reserva del intervalo de combustible (opcional)</span>
              <select value={op.muestraPrevista ?? ''} onChange={(ev) => opcion({ muestraPrevista: (ev.target.value || null) as Muestra | null })}>
                <option value="">— sin reserva —</option>
                <option value="calibracion">Calibración</option>
                <option value="validacion">Validación</option>
              </select>
            </label>
            <label className="m-campo">
              <span>Incertidumbre de los km previstos (± km, opcional)</span>
              <input
                inputMode="decimal"
                value={textoIncert}
                onChange={(ev) => {
                  setTextoIncert(ev.target.value);
                  opcion({ incertidumbreKm: parseNumero(ev.target.value) });
                }}
              />
            </label>
          </div>
          <p className="m-nota">Ningún valor se supone: lo que no sepas queda como dato faltante y la comparación lo dirá.</p>
        </fieldset>
      </details>
      <div className="m-resumen" data-resumen-presupuesto>
        {resultado ? (
          <>
            <p>
              Costo estimado: <strong className="num">{fmtClp(resultado.costoClp)}</strong>
              {resultado.tipo === 'cotaInferior' ? ' (como mínimo: faltan algunos datos)' : ''}
            </p>
            <p className="m-nota">
              Sin datos de: {resultado.faltan.length ? resultado.faltan.join(', ') : 'nada, está completo'}.
              {personal || op.modalidad === 'simplificada' ? ' No incluye gastos fijos.' : ''}
            </p>
          </>
        ) : (
          <p className="m-nota">{vista.error ?? 'Escribe los kilómetros y los minutos manejando para ver el costo.'}</p>
        )}
        {resultado && (construido.plan.km === null || construido.plan.marchaMin === null) ? <p className="m-nota">Para guardar faltan los kilómetros y los minutos manejando.</p> : null}
      </div>
      <div className="m-fila">
        <button type="button" className="m-btn m-btn-primario m-grande" disabled={!puedeSellar || sellando} onClick={sellarAhora}>
          Guardar estimación
        </button>
        <button type="button" className="m-btn" onClick={props.onCancelar}>
          Cancelar
        </button>
      </div>
      <p className="m-nota">Al guardarla queda sellada con la hora del teléfono: después no se puede editar (sí corregir con una nueva).</p>
    </section>
  );
}
