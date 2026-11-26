/**
 * Presupuesto previo: formulario prellenado (vehículo, cotización o corrección), vista del motor vigente y
 * botón «Sellar». Un presupuesto sellado no se edita: corregir = sellar uno nuevo y anular el anterior.
 */
import { useMemo, useState } from 'react';
import { procedencia, type Procedencia } from '../../shared/procedencia';
import type { DatosPresupuesto, FuentePrecio, OrigenPresupuesto, PresupuestoSellado, Uso } from '../modelo';
import { CAMPOS_PLAN, construirPlan, ETIQUETAS_PLAN, resultadoMotor, versionMotor, type CampoPlan, type EntradaPlan } from '../presupuesto';
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
  ['Modalidad detallada (opcional)', ['fijoHora'], false],
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
  const construido = useMemo(() => construirPlan(e, props.uso, veh?.resolucionTripKm ?? veh?.resolucionOdometroKm ?? null), [e, props.uso, veh]);
  const resultado = useMemo(() => {
    try {
      return resultadoMotor(construido.plan, props.uso);
    } catch {
      return null;
    }
  }, [construido, props.uso]);
  if (!veh) return null;

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
      const datos: DatosPresupuesto = {
        version: 2,
        id: props.reemplaza?.datos.id ?? siguienteCodigo(d),
        uso: props.uso,
        vehiculo: veh.alias,
        tipoVehiculo: veh.tipoVehiculo,
        // Formato de #55: ISO UTC con milisegundos.
        fecha: new Date().toISOString(),
        versionMotor: versionMotor(),
        plan: construido.plan,
        resultado,
        procedencia: construido.procedencia,
        origen: props.origen,
      };
      const p = await sellar(datos, veh.id, ahora, props.reemplaza?.id ?? null);
      await guardarPresupuesto(a, p);
      if (props.reemplaza) await guardarPresupuesto(a, anular(props.reemplaza, `corregido: reemplazado por el sello ${huellaCorta(p.sha256)}`, ahora));
      await recargar();
      avisar(`Presupuesto ${datos.id} sellado`);
      props.onSellado(p);
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
      <div className="m-resumen" data-resumen-presupuesto>
        {resultado ? (
          <>
            <p>
              Costo estimado por el motor vigente: <strong className="num">{fmtClp(resultado.costoClp)}</strong>
              {resultado.tipo === 'cotaInferior' ? ' (cota inferior: hay partidas faltantes)' : ''}
            </p>
            <p className="m-nota">Partidas faltantes: {resultado.faltan.length ? resultado.faltan.join(', ') : 'ninguna'}.</p>
          </>
        ) : (
          <p className="m-nota">Escribe km y minutos de marcha previstos para ver el costo y sellar.</p>
        )}
      </div>
      <div className="m-fila">
        <button type="button" className="m-btn m-btn-primario m-grande" disabled={!puedeSellar || sellando} onClick={sellarAhora}>
          Sellar presupuesto
        </button>
        <button type="button" className="m-btn" onClick={props.onCancelar}>
          Cancelar
        </button>
      </div>
      <p className="m-nota">Al sellar se guarda la hora del teléfono y una huella: después no se edita.</p>
    </section>
  );
}
