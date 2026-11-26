/**
 * Ficha de un viaje: lecturas (inicial y final), km automáticos, tiempos derivados, detalles, comprobantes
 * y comparación disponible. Todo se puede registrar después del viaje (hora editable).
 */
import { useEffect, useMemo, useState } from 'react';
import { avisosLectura, avisosViaje, distanciaViaje, ultimoOdometro } from '../calculos';
import { aliasPresentacion, CRITERIOS_12, FORMATO_ANTERIOR, informeViaje, tiemposDesglosados, totalMinutos, type ResultadoInforme } from '../campo';
import { recodificarFoto } from '../foto';
import type { BaseClp, Comprobante, Directa, Instrumento, NivelCarga, Recorrido, Viaje } from '../modelo';
import { DIRECTAS, esAnterior } from '../modelo';
import { registrarLectura } from '../repositorio';
import { huellaCorta } from '../sello';
import { aInputLocal, desdeInputLocal, isoLocal, minutosPorTipo } from '../tiempo';
import { Avisos, CampoLectura, CampoNumero, Confirmar, fechaHoraLegible, fmt, fmtClp, parseNumero, useCtx } from '../ui';

const ETIQ_DIRECTA: Record<Directa, string> = { peajes: 'TAG y peajes', ayudantes: 'Ayudantes', otros: 'Otros' };
const ETIQ_PARTIDA: Record<string, string> = {
  combustible: 'Combustible', peajes: 'TAG y peajes', ayudantes: 'Ayudantes', otros: 'Otros costos', desgaste: 'Desgaste', gastosFijos: 'Gastos fijos',
};
const ETIQ_RECORRIDO: [string, string, string][] = [
  ['km', 'Distancia', ' km'], ['marchaMin', 'Marcha', ' min'], ['esperaMin', 'Espera', ' min'], ['cargaMin', 'Carga', ' min'], ['descargaMin', 'Descarga', ' min'], ['totalMin', 'Total con estados', ' min'],
];
const pct = (n: number | null) => (n === null ? '' : ` (${fmt(Math.round(n * 10) / 10)} %)`);

/**
 * Comparación con el INFORME del contrato de #55 (`compararFicha`): presupuesto sellado, recalculado con
 * lo observado (misma fórmula, otra entrada: no es validación) y referencia; la conciliación
 * independiente y su estado los decide el contrato. Nunca hay un «aprobado».
 */
export function VistaComparacion({ r, totalNoDesglosado }: { r: ResultadoInforme; totalNoDesglosado: number | null }) {
  const inf = r.informe;
  return (
    <section className="m-tarjeta" aria-label="Comparación" data-comparacion>
      <h2>Comparación disponible</h2>
      {r.notas.map((n) => (
        <p key={n} className="m-aviso" data-nota-comparacion>
          {n}
        </p>
      ))}
      {!inf ? (
        <p className="m-aviso" data-error-comparacion>
          Sin comparación: {r.error}
        </p>
      ) : (
        <>
          <p>
            Presupuesto: <strong data-estado-presupuesto>{inf.estadoPresupuesto}</strong> · modalidad {inf.conciliacionIndependiente.modalidad} · conciliación{' '}
            <strong data-conciliacion>{inf.conciliacionIndependiente.estado}</strong> ({inf.conciliacionIndependiente.aprobacion}).
          </p>
          <p className="m-nota">
            Diferencia = previsto − referencia; negativa = subestimación. Datos observados: {inf.completitud.observacion.presentes} de {inf.completitud.observacion.total}.
            {inf.conciliacionIndependiente.motivos.length ? ` Motivos de comparación parcial: ${inf.conciliacionIndependiente.motivos.join('; ')}.` : ''}
          </p>
          {totalNoDesglosado !== null ? (
            <p className="m-aviso" data-total-no-desglosado>
              Tiempo total del viaje: {fmt(totalNoDesglosado, ' min')}, sin desglosar. Marcha, espera, carga y descarga: dato faltante (no se usaron los botones de estado).
            </p>
          ) : null}
          <div className="m-tarjetas">
            {ETIQ_RECORRIDO.map(([k, etiqueta, u]) => {
              const x = inf.recorrido[k];
              if (!x) return null;
              return (
                <article key={k} className="m-cmp" data-partida={k}>
                  <h3>{etiqueta}</h3>
                  <dl>
                    <div>
                      <dt>Previsto</dt>
                      <dd className="num">{fmt(x.previsto, u)}</dd>
                    </div>
                    <div>
                      <dt>Observado</dt>
                      <dd className="num">
                        {fmt(x.referencia, u)} <small>{x.evidencia ?? ''}</small>
                      </dd>
                    </div>
                    {x.diferencia !== null ? (
                      <div>
                        <dt>Diferencia</dt>
                        <dd className="num" data-diferencia>
                          {fmt(Math.round(x.diferencia * 1e6) / 1e6, u)}
                          {pct(x.porcentaje)} · {x.sentido}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              );
            })}
            {Object.entries(inf.comparacionClp).map(([k, c]) => {
              const l = inf.conciliacionIndependiente.partidas[k as keyof typeof inf.conciliacionIndependiente.partidas];
              return (
                <article key={k} className="m-cmp" data-partida={k}>
                  <h3>{ETIQ_PARTIDA[k] ?? k}</h3>
                  <dl>
                    <div>
                      <dt>Sellado</dt>
                      <dd className="num">{fmtClp(c.original.previsto)}</dd>
                    </div>
                    <div>
                      <dt>Recalculado</dt>
                      <dd className="num">{fmtClp(c.recalculado.previsto)}</dd>
                    </div>
                    <div>
                      <dt>Referencia</dt>
                      <dd className="num">
                        {fmtClp(c.original.referencia)} <small>{l?.evidencia ?? c.evidencia ?? 'DATO FALTANTE'}</small>
                      </dd>
                    </div>
                    {c.original.diferencia !== null ? (
                      <div>
                        <dt>Diferencia</dt>
                        <dd className="num" data-diferencia>
                          {fmtClp(c.original.diferencia)}
                          {pct(c.original.porcentaje)} · {c.original.sentido}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="m-nota" data-estado-partida>
                    {l ? `${l.estado}${l.requerida ? (l.comparable ? ' · comparable con evidencia independiente' : ' · sin comparación independiente') : ''}` : ''}
                  </p>
                </article>
              );
            })}
          </div>
          <p className="m-nota" data-combustible>
            Combustible: {inf.referencias.intervalo.utilizable ? `intervalo utilizable (${fmt(inf.referencias.rendimientoMedidoIntervaloKmL, ' km/L')})` : `sin asignación al viaje — ${inf.referencias.intervalo.motivos.join('; ')}`}. Las
            recargas parciales quedan como gasto registrado: sin saldo inicial y final no se infieren los litros del viaje.
          </p>
          <p className="m-nota">
            Remuneración y margen: es una meta, no un pago; la conciliación compara el costo operativo ({inf.conciliacionIndependiente.alcance}).
          </p>
        </>
      )}
      <p className="m-nota" data-criterios>
        {CRITERIOS_12}
      </p>
    </section>
  );
}

function Opciones<T extends string | boolean>(props: { etiqueta: string; valor: T | null; opciones: [T, string][]; onCambio: (v: T | null) => void; id: string }) {
  return (
    <div className="m-opciones" role="group" aria-label={props.etiqueta} data-opciones={props.id}>
      <span>{props.etiqueta}</span>
      <div className="m-fila">
        {props.opciones.map(([v, t]) => (
          <button key={String(v)} type="button" className={props.valor === v ? 'm-btn m-btn-on' : 'm-btn'} aria-pressed={props.valor === v} onClick={() => props.onCambio(props.valor === v ? null : v)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FichaViaje({ viajeId, onVolver }: { viajeId: string; onVolver: () => void }) {
  const { a, d, recargar, avisar } = useCtx();
  const v = d.viajes.find((x) => x.id === viajeId);
  const veh = v ? (d.vehiculos.find((x) => x.id === v.vehiculoId) ?? null) : null;
  const pres = v?.presupuestoId ? (d.presupuestos.find((p) => p.id === v.presupuestoId) ?? null) : null;
  const [informe, setInforme] = useState<ResultadoInforme | null>(null);
  const [textoIncert, setTextoIncert] = useState(v?.incertidumbreKm != null ? String(v.incertidumbreKm).replace('.', ',') : '');
  const [reinicio, setReinicio] = useState(v?.tripReiniciadoKm != null);
  const [anulando, setAnulando] = useState(false);
  const [partida, setPartida] = useState<Directa>('peajes');
  const [monto, setMonto] = useState('');
  const [kmReinicio, setKmReinicio] = useState(v?.tripReiniciadoKm !== null && v?.tripReiniciadoKm !== undefined ? String(v.tripReiniciadoKm).replace('.', ',') : '');
  useEffect(() => {
    let vivo = true;
    if (v && v.estado !== 'en curso') void informeViaje(d, v).then((r) => vivo && setInforme(r));
    return () => {
      vivo = false;
    };
  }, [d, v]);
  const alias = useMemo(() => aliasPresentacion(d.viajes.map((x) => ({ id: x.id, alias: x.codigo }))), [d.viajes]);
  if (!v) return <p>Viaje no encontrado.</p>;
  const selloOk = informe?.sello?.ok ?? null;

  const guardar = async (cambio: (x: Viaje) => Viaje) => {
    await a.guardar('viajes', { ...cambio(v), editadoEl: isoLocal() });
    await recargar();
  };
  const dist = distanciaViaje(v, veh);
  const min = minutosPorTipo(v.tramos, v.fin);
  const ultimo = ultimoOdometro(v.vehiculoId, d.viajes, d.cargas, v.id);
  const desglose = tiemposDesglosados(v);
  const avisos = avisosViaje(v, veh, pres && !esAnterior(pres) ? (pres.datos.plan.km?.[0] ?? null) : null, d.ajustes.umbrales);

  const lectura = (momento: 'inicial' | 'final', inst: Instrumento, etiqueta: string) => (
    <CampoLectura
      id={`${momento}-${inst}`}
      etiqueta={etiqueta}
      actual={v.lecturas[momento][inst]?.valor ?? null}
      avisosDe={(valor) => avisosLectura(inst, momento, valor, v, inst === 'odometro' && momento === 'inicial' ? ultimo : null)}
      onGuardar={async ({ valor, foto, conservar }) => {
        await registrarLectura(a, v, momento, inst, valor, { ahora: isoLocal(), foto, conservar, recodificar: recodificarFoto });
        await recargar();
        avisar('Lectura guardada');
      }}
    />
  );

  const siguienteRef = () => {
    const n = /^viaje-(\d+)$/.exec(v.codigo)?.[1] ?? '000';
    let i = v.comprobantes.length + 1;
    let ref = `doc-${n}-${String(i).padStart(2, '0')}`;
    while (v.comprobantes.some((c) => c.ref === ref)) ref = `doc-${n}-${String(++i).padStart(2, '0')}`;
    return ref;
  };

  return (
    <div className="m-ficha" data-ficha={v.codigo}>
      <section className="m-tarjeta">
        <div className="m-fila m-entre">
          <h2>
            {alias.get(v.id) ?? v.codigo} · {v.estado}
          </h2>
          <button type="button" className="m-btn" onClick={onVolver}>
            Volver
          </button>
        </div>
        <p>
          {veh?.alias} · {v.uso === 'simulacion' ? 'simulación (ficticia)' : 'uso personal'} · inicio {fechaHoraLegible(v.inicio)} · fin {fechaHoraLegible(v.fin)}
          {v.horaEditada ? ' · horas escritas después' : ''}
        </p>
        <p>
          Presupuesto:{' '}
          {pres ? (
            <>
              {pres.datos.id} · sello <code>{huellaCorta(pres.sha256)}</code> · {pres.estado}
              {esAnterior(pres) ? ` · ${FORMATO_ANTERIOR}` : ` · modalidad ${pres.datos.plan.modalidad ?? 'detallada'}`}
              {selloOk === false ? ' · ¡el sello no verifica!' : selloOk ? ' · sello verificado' : ''}
            </>
          ) : (
            'sin presupuesto previo'
          )}
        </p>
        <details>
          <summary>Corregir horas (si registras después)</summary>
          <div className="m-grilla">
            <label className="m-campo">
              <span>Inicio</span>
              <input
                type="datetime-local"
                defaultValue={aInputLocal(v.inicio)}
                onBlur={(e) => {
                  const iso = desdeInputLocal(e.target.value);
                  if (iso && iso !== v.inicio) void guardar((x) => ({ ...x, inicio: iso, horaEditada: true, tramos: x.tramos.map((t, i) => (i === 0 ? { ...t, inicio: iso } : t)) }));
                }}
              />
            </label>
            {v.fin ? (
              <label className="m-campo">
                <span>Fin</span>
                <input
                  type="datetime-local"
                  defaultValue={aInputLocal(v.fin)}
                  onBlur={(e) => {
                    const iso = desdeInputLocal(e.target.value);
                    if (iso && iso !== v.fin) void guardar((x) => ({ ...x, fin: iso, horaEditada: true, tramos: x.tramos.map((t, i, arr) => (i === arr.length - 1 ? { ...t, fin: iso } : t)) }));
                  }}
                />
              </label>
            ) : null}
          </div>
        </details>
      </section>

      <section className="m-tarjeta" aria-label="Lecturas">
        <h2>Lecturas</h2>
        <p className="m-nota">Basta el TRIP o el odómetro. El TRIP da la distancia; el odómetro ubica el viaje entre tus cargas de combustible.</p>
        <div className="m-grilla">
          {lectura('inicial', 'trip', 'TRIP inicial')}
          {lectura('inicial', 'odometro', 'Odómetro inicial')}
          {lectura('final', 'trip', 'TRIP final')}
          {lectura('final', 'odometro', 'Odómetro final')}
        </div>
        <label className="m-check">
          <input
            type="checkbox"
            checked={reinicio}
            onChange={(e) => {
              setReinicio(e.target.checked);
              if (!e.target.checked && v.tripReiniciadoKm !== null) void guardar((x) => ({ ...x, tripReiniciadoKm: null }));
            }}
            data-reinicio
          />
          El TRIP se reinició durante el viaje
        </label>
        {reinicio ? (
          <div className="m-fila">
            <CampoNumero id="km-reinicio" etiqueta="Km recorridos (escríbelos)" valor={kmReinicio} onCambio={setKmReinicio} sufijo="km" />
            <button
              type="button"
              className="m-btn m-btn-sec"
              onClick={() => {
                const n = parseNumero(kmReinicio);
                if (n !== null && n >= 0) void guardar((x) => ({ ...x, tripReiniciadoKm: n }));
              }}
            >
              Guardar km
            </button>
          </div>
        ) : null}
        <p className="m-resultado" data-km>
          Distancia: <strong className="num">{fmt(dist.km, ' km')}</strong>
          {dist.fuente ? ` (${dist.fuente === 'odometro' ? 'odómetro' : dist.fuente === 'trip' ? 'TRIP' : 'TRIP reiniciado, declarado'})` : ''}
          {dist.motivo ? <small> · {dist.motivo}</small> : null}
        </p>
        {desglose ? (
          <p className="m-nota" data-tiempos>
            Tiempos (de los botones de estado): marcha {min.marcha} min · espera {min.espera} min · carga {min.carga} min · descarga {min.descarga} min · pausa {min.pausa} min
          </p>
        ) : (
          <p className="m-nota" data-tiempos>
            Tiempo total: {fmt(v.fin ? totalMinutos(v) : min.marcha, ' min')}, sin desglosar (no se usaron los botones de estado). Marcha, espera, carga y descarga quedan como dato faltante.
          </p>
        )}
        <div className="m-fila">
          <CampoNumero id="km-incert" etiqueta="Incertidumbre de los km (± km, opcional)" valor={textoIncert} onCambio={setTextoIncert} sufijo="km" />
          <button
            type="button"
            className="m-btn m-btn-sec"
            onClick={() => {
              const n = parseNumero(textoIncert);
              void guardar((x) => ({ ...x, incertidumbreKm: n !== null && n >= 0 ? n : null }));
            }}
          >
            Guardar
          </button>
        </div>
        <Avisos avisos={avisos} />
      </section>

      <section className="m-tarjeta" aria-label="Detalles">
        <h2>Detalles (un toque cada uno, opcionales)</h2>
        <Opciones<Recorrido> id="recorrido" etiqueta="Recorrido" valor={v.recorrido} opciones={[['urbano', 'Urbano'], ['autopista', 'Autopista'], ['mixto', 'Mixto']]} onCambio={(x) => void guardar((y) => ({ ...y, recorrido: x }))} />
        <Opciones<NivelCarga> id="carga" etiqueta="Nivel de carga" valor={v.nivelCarga} opciones={[['sin', 'Sin carga'], ['parcial', 'Parcial'], ['completa', 'Completa']]} onCambio={(x) => void guardar((y) => ({ ...y, nivelCarga: x }))} />
        <Opciones<boolean> id="aire" etiqueta="Aire acondicionado" valor={v.aire} opciones={[[true, 'Sí'], [false, 'No']]} onCambio={(x) => void guardar((y) => ({ ...y, aire: x }))} />
        <Opciones<NonNullable<BaseClp>>
          id="base"
          etiqueta="Los montos de comprobantes son"
          valor={v.baseClp ?? null}
          opciones={[['neto', 'Netos'], ['con_iva', 'Con IVA']]}
          onCambio={(x) => void guardar((y) => ({ ...y, baseClp: x }))}
        />
      </section>

      <section className="m-tarjeta" aria-label="Comprobantes">
        <h2>Comprobantes (TAG, ayudantes, otros)</h2>
        <p className="m-nota">«Completa» exige al menos una línea, aunque sea $0. Sin comprobante completo no hay comparación de esa partida. No escribas números de boleta: se usa una referencia doc-NNN-NN.</p>
        <ul className="m-lista">
          {v.comprobantes.map((c) => (
            <li key={c.ref} className="m-item">
              <span>
                {c.ref} · {ETIQ_DIRECTA[c.partida]} · {fmtClp(c.clp)}
              </span>
              <button type="button" className="m-btn" onClick={() => void guardar((x) => ({ ...x, comprobantes: x.comprobantes.filter((y) => y.ref !== c.ref) }))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <div className="m-fila">
          <select aria-label="Partida" value={partida} onChange={(e) => setPartida(e.target.value as Directa)}>
            {DIRECTAS.map((k) => (
              <option key={k} value={k}>
                {ETIQ_DIRECTA[k]}
              </option>
            ))}
          </select>
          <CampoNumero id="comp-monto" etiqueta="Monto" valor={monto} onCambio={setMonto} sufijo="$" />
          <button
            type="button"
            className="m-btn m-btn-sec"
            onClick={() => {
              const n = parseNumero(monto);
              if (n === null || n < 0) return;
              const c: Comprobante = { ref: siguienteRef(), partida, clp: Math.round(n) };
              setMonto('');
              void guardar((x) => ({ ...x, comprobantes: [...x.comprobantes, c] }));
            }}
          >
            Agregar línea
          </button>
        </div>
        {DIRECTAS.map((k) => (
          <Opciones<'parcial' | 'completa'>
            key={k}
            id={`cobertura-${k}`}
            etiqueta={`Cobertura de ${ETIQ_DIRECTA[k]}`}
            valor={v.cobertura[k]}
            opciones={[['parcial', 'Parcial'], ['completa', 'Completa']]}
            onCambio={(x) => void guardar((y) => ({ ...y, cobertura: { ...y.cobertura, [k]: x } }))}
          />
        ))}
        {DIRECTAS.filter((k) => v.cobertura[k] === 'completa' && !v.comprobantes.some((c) => c.partida === k)).map((k) => (
          <p key={k} className="m-aviso">
            {ETIQ_DIRECTA[k]}: «completa» sin ninguna línea. Agrega al menos una (aunque sea $0).
          </p>
        ))}
      </section>

      {v.estado !== 'en curso' ? informe ? <VistaComparacion r={informe} totalNoDesglosado={v.fin && !desglose ? totalMinutos(v) : null} /> : <p className="m-nota">Calculando la comparación…</p> : null}

      {v.estado !== 'anulado' ? (
        <section className="m-tarjeta">
          {anulando ? (
            <Confirmar
              texto="¿Anular este viaje? No se borra: queda en el historial como anulado y fuera de las comparaciones."
              si="Sí, anular"
              peligro
              onSi={() => {
                setAnulando(false);
                void guardar((x) => ({ ...x, estado: 'anulado' })).then(() => avisar('Viaje anulado'));
              }}
              onNo={() => setAnulando(false)}
            />
          ) : (
            <button type="button" className="m-btn" onClick={() => setAnulando(true)}>
              Anular viaje
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}
