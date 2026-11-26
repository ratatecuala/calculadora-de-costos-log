/**
 * Ficha de un viaje: lecturas (inicial y final), km automáticos, tiempos derivados, detalles, comprobantes
 * y comparación disponible. Todo se puede registrar después del viaje (hora editable).
 */
import { useEffect, useMemo, useState } from 'react';
import { avisosLectura, avisosViaje, distanciaViaje, intervaloDelViaje, intervalosLleno, ultimoOdometro } from '../calculos';
import { compararViaje, type Comparacion } from '../contrato-provisional';
import { recodificarFoto } from '../foto';
import type { Comprobante, Directa, Instrumento, NivelCarga, Recorrido, Viaje } from '../modelo';
import { DIRECTAS } from '../modelo';
import { registrarLectura } from '../repositorio';
import { huellaCorta, verificarSello } from '../sello';
import { aInputLocal, desdeInputLocal, isoLocal, minutosPorTipo } from '../tiempo';
import { Avisos, CampoLectura, CampoNumero, Confirmar, fechaHoraLegible, fmt, fmtClp, parseNumero, useCtx } from '../ui';

const ETIQ_DIRECTA: Record<Directa, string> = { peajes: 'TAG y peajes', ayudantes: 'Ayudantes', otros: 'Otros' };

export function VistaComparacion({ c }: { c: Comparacion }) {
  const unidad = (u: string, n: number | null) => (u === 'CLP' ? fmtClp(n) : fmt(n, u === 'km' ? ' km' : ' min'));
  return (
    <section className="m-tarjeta" aria-label="Comparación" data-comparacion>
      <h2>Comparación disponible</h2>
      <p>
        Presupuesto: <strong data-estado-presupuesto>{c.estadoPresupuesto}</strong>. Partidas con referencia independiente:{' '}
        <strong>
          {c.cobertura.presentes} de {c.cobertura.total}
        </strong>{' '}
        — comparación parcial (no hay un «aprobado» del total).
      </p>
      <p className="m-nota">
        Tres columnas distintas: <strong>sellado</strong> (antes del viaje), <strong>recalculado</strong> con lo observado (misma fórmula, otra entrada: no es validación) y{' '}
        <strong>referencia independiente</strong>. Error firmado = (previsto − referencia) / referencia × 100; negativo = subestimación (convención propuesta, docs/27 §1).
      </p>
      <div className="m-tarjetas">
        {c.tarjetas.map((t) => (
          <article key={t.partida} className="m-cmp" data-partida={t.partida}>
            <h3>{t.etiqueta}</h3>
            <dl>
              <div>
                <dt>Sellado</dt>
                <dd className="num">{unidad(t.unidad, t.sellado)}</dd>
              </div>
              {t.unidad === 'CLP' ? (
                <div>
                  <dt>Recalculado</dt>
                  <dd className="num">{unidad(t.unidad, t.recalculado)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Referencia</dt>
                <dd className="num">
                  {unidad(t.unidad, t.referencia)} <small>{t.claseReferencia}</small>
                </dd>
              </div>
              {t.diferencia && t.diferencia.diferencia !== null ? (
                <div>
                  <dt>Diferencia</dt>
                  <dd className="num" data-diferencia>
                    {unidad(t.unidad, t.diferencia.diferencia)}
                    {t.diferencia.porcentaje !== null ? ` (${fmt(Math.round(t.diferencia.porcentaje * 10) / 10)} %)` : ''} · {t.diferencia.sentido}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="m-nota">{t.estado}</p>
            {t.notas.map((n) => (
              <p key={n} className="m-nota">
                {n}
              </p>
            ))}
          </article>
        ))}
      </div>
      <p className="m-nota" data-criterios>
        {c.criterios}
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
  const [selloOk, setSelloOk] = useState<boolean | null>(null);
  const [reinicio, setReinicio] = useState(v?.tripReiniciadoKm != null);
  const [anulando, setAnulando] = useState(false);
  const [partida, setPartida] = useState<Directa>('peajes');
  const [monto, setMonto] = useState('');
  const [kmReinicio, setKmReinicio] = useState(v?.tripReiniciadoKm !== null && v?.tripReiniciadoKm !== undefined ? String(v.tripReiniciadoKm).replace('.', ',') : '');
  useEffect(() => {
    if (pres) verificarSello(pres).then(setSelloOk);
  }, [pres]);
  const intervalo = useMemo(() => (v ? intervaloDelViaje(v, intervalosLleno(d.cargas, v.vehiculoId)) : null), [v, d.cargas]);
  if (!v) return <p>Viaje no encontrado.</p>;

  const guardar = async (cambio: (x: Viaje) => Viaje) => {
    await a.guardar('viajes', { ...cambio(v), editadoEl: isoLocal() });
    await recargar();
  };
  const dist = distanciaViaje(v, veh);
  const min = minutosPorTipo(v.tramos, v.fin);
  const ultimo = ultimoOdometro(v.vehiculoId, d.viajes, d.cargas, v.id);
  const comparacion = compararViaje({
    viaje: v,
    vehiculo: veh,
    sello: pres ? { plan: pres.datos.plan, resultado: pres.datos.resultado, fecha: pres.datos.fecha } : null,
    anulado: pres?.estado === 'anulado',
    intervalo,
    uso: v.uso,
  });
  const avisos = avisosViaje(v, veh, pres?.datos.plan.km?.[0] ?? null, d.ajustes.umbrales);

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
            {v.codigo} · {v.estado}
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
              {selloOk === false ? ' · ¡la huella no coincide!' : selloOk ? ' · huella verificada' : ''}
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
        <p className="m-nota" data-tiempos>
          Tiempos (de los botones de estado): marcha {min.marcha} min · espera {min.espera} min · carga {min.carga} min · descarga {min.descarga} min · pausa {min.pausa} min
        </p>
        <Avisos avisos={avisos} />
      </section>

      <section className="m-tarjeta" aria-label="Detalles">
        <h2>Detalles (un toque cada uno, opcionales)</h2>
        <Opciones<Recorrido> id="recorrido" etiqueta="Recorrido" valor={v.recorrido} opciones={[['urbano', 'Urbano'], ['autopista', 'Autopista'], ['mixto', 'Mixto']]} onCambio={(x) => void guardar((y) => ({ ...y, recorrido: x }))} />
        <Opciones<NivelCarga> id="carga" etiqueta="Nivel de carga" valor={v.nivelCarga} opciones={[['sin', 'Sin carga'], ['parcial', 'Parcial'], ['completa', 'Completa']]} onCambio={(x) => void guardar((y) => ({ ...y, nivelCarga: x }))} />
        <Opciones<boolean> id="aire" etiqueta="Aire acondicionado" valor={v.aire} opciones={[[true, 'Sí'], [false, 'No']]} onCambio={(x) => void guardar((y) => ({ ...y, aire: x }))} />
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

      {v.estado !== 'en curso' ? <VistaComparacion c={comparacion} /> : null}

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
