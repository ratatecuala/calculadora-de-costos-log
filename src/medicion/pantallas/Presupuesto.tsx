/**
 * Presupuesto previo: formulario prellenado (vehículo, cotización o corrección), vista previa con el
 * contrato de #55 (`crearPresupuesto`, mismo motor) y botón «Sellar». Un presupuesto sellado no se edita:
 * corregir = sellar uno nuevo y anular el anterior.
 */
import { useMemo, useState } from 'react';
import { procedencia, type Procedencia } from '../../shared/procedencia';
import { fichaPrevia, previsualizar } from '../campo';
import type { BaseClp, FuentePrecio, Modalidad, Muestra, OrigenPresupuesto, PresupuestoSellado, Uso } from '../modelo';
import { CAMPOS_PLAN, construirPlan, ETIQUETAS_PLAN, type CampoPlan, type EntradaPlan, type OpcionesPlan } from '../presupuesto';
import { guardarPresupuesto, siguienteCodigo } from '../repositorio';
import { anular, huellaCorta, sellar } from '../sello';
import { isoLocal } from '../tiempo';
import { aTexto, fmtClp, parseNumero, useCtx } from '../ui';

const GRUPOS: [string, CampoPlan[], boolean][] = [
  ['Distancia y tiempo', ['km', 'marchaMin', 'esperaMin', 'cargaMin', 'descargaMin'], true],
  ['Combustible', ['precioLitro', 'kmL'], true],
  ['TAG, peajes y otros costos del servicio', ['tag', 'otros'], true],
  ['Ayudantes (si corresponde)', ['ayudantes', 'pagoAyudante'], true],
  ['Desgaste (cuando exista evidencia)', ['desgasteKm'], true],
  ['Remuneración y margen deseados', ['trabajoHora', 'margenPct', 'recargos'], true],
];

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
      avisar(`Presupuesto ${codigo} sellado`);
      props.onSellado(p);
    } catch (err) {
      avisar(err instanceof Error ? err.message : 'No se pudo sellar.');
    } finally {
      setSellando(false);
    }
  };

  return (
    <section className="m-tarjeta" aria-label="Presupuesto previo">
      <h2>{props.reemplaza ? `Corregir presupuesto ${props.reemplaza.datos.id}` : 'Presupuesto previo'}</h2>
      <p className="m-nota">
        Todo es opcional salvo km y minutos de marcha (el motor los necesita). Lo vacío queda como <strong>dato faltante</strong>, nunca como cero. Un cero escrito es un cero.
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
            ? 'Simplificada (recomendada): combustible, TAG, distancia y tiempo, desgaste, ayudantes y otros costos del servicio. No suma gastos fijos ni pide contabilidad anual.'
            : 'Detallada: además suma los gastos fijos por hora productiva.'}
        </p>
      </fieldset>
      {GRUPOS.map(([titulo, campos, abierto]) => {
        const cuerpo = (
          <div className="m-grilla">
            {campos.map((k) => (
              <label key={k} className="m-campo" htmlFor={`pres-${k}`}>
                <span>{ETIQUETAS_PLAN[k]}</span>
                <input id={`pres-${k}`} inputMode="decimal" autoComplete="off" value={textos[k]} onChange={(ev) => cambiar(k, ev.target.value)} />
                <Procedencia p={construido.procedencia[k] ?? e[k].procedencia} />
              </label>
            ))}
            {campos.includes('precioLitro') ? (
              <label className="m-campo">
                <span>Origen del precio</span>
                <select id="pres-fuente" value={e.fuentePrecio ?? ''} onChange={(ev) => setE((s) => ({ ...s, fuentePrecio: (ev.target.value || null) as FuentePrecio | null }))}>
                  <option value="">— sin indicar —</option>
                  <option value="boleta">Boleta (comprobado)</option>
                  <option value="surtidor">Surtidor (medido)</option>
                  <option value="declaracion">Lo sé yo (declarado)</option>
                  <option value="referencia_publicada">Referencia publicada (estimado)</option>
                  <option value="supuesto">Supuesto (estimado)</option>
                </select>
              </label>
            ) : null}
          </div>
        );
        return abierto ? (
          <fieldset key={titulo} className="m-grupo">
            <legend>{titulo}</legend>
            {cuerpo}
          </fieldset>
        ) : (
          <details key={titulo} className="m-grupo">
            <summary>{titulo}</summary>
            <p className="m-nota">Gastos fijos, seguros, permisos y mantenciones se detallan en la modalidad detallada. No son necesarios para registrar un viaje.</p>
            {cuerpo}
          </details>
        );
      })}
      {op.modalidad === 'detallada' ? (
        <fieldset className="m-grupo">
          <legend>Gastos fijos (modalidad detallada)</legend>
          <div className="m-grilla">
            <label className="m-campo" htmlFor="pres-fijoHora">
              <span>{ETIQUETAS_PLAN.fijoHora}</span>
              <input id="pres-fijoHora" inputMode="decimal" autoComplete="off" value={textos.fijoHora} onChange={(ev) => cambiar('fijoHora', ev.target.value)} />
              <Procedencia p={construido.procedencia.fijoHora ?? e.fijoHora.procedencia} />
            </label>
          </div>
        </fieldset>
      ) : null}
      <details className="m-grupo" data-precision>
        <summary>Base de los montos y precisión (para poder comparar después)</summary>
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
      </details>
      <div className="m-resumen" data-resumen-presupuesto>
        {resultado ? (
          <>
            <p>
              Costo estimado por el motor vigente: <strong className="num">{fmtClp(resultado.costoClp)}</strong>
              {resultado.tipo === 'cotaInferior' ? ' (cota inferior: hay partidas faltantes)' : ''}
            </p>
            <p className="m-nota">
              Partidas faltantes: {resultado.faltan.length ? resultado.faltan.join(', ') : 'ninguna'}.
              {op.modalidad === 'simplificada' ? ' Gastos fijos: excluidos (modalidad simplificada).' : ''}
            </p>
          </>
        ) : (
          <p className="m-nota">{vista.error ?? 'Escribe km y minutos de marcha previstos para ver el costo y sellar.'}</p>
        )}
        {resultado && (construido.plan.km === null || construido.plan.marchaMin === null) ? <p className="m-nota">Para sellar faltan km y minutos de marcha previstos.</p> : null}
      </div>
      <div className="m-fila">
        <button type="button" className="m-btn m-btn-primario m-grande" disabled={!puedeSellar || sellando} onClick={sellarAhora}>
          Sellar presupuesto
        </button>
        <button type="button" className="m-btn" onClick={props.onCancelar}>
          Cancelar
        </button>
      </div>
      <p className="m-nota">Al sellar se guarda la hora del teléfono y la huella del contrato de #55: después no se edita.</p>
    </section>
  );
}
