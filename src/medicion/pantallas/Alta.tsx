/**
 * Alta guiada del vehículo en 4 pasos (A-92). Sin barra inferior mientras dura. Se puede volver atrás sin
 * perder lo escrito y avanzar sin saber todo: lo que no se sabe queda desconocido, nunca inventado.
 */
import { useState } from 'react';
import { borradorDesdeVehiculo, borradorVacio, ETIQUETA_TIPO, faltaParaGuardar, kmLDeclarado, PASOS_ALTA, vehiculoDesdeAlta, type BorradorAlta } from '../alta';
import { Contadores, IconoAtras, IconoVehiculo, TableroEjemplo } from '../ilustraciones';
import type { Combustible, FormaConsumo, LecturaConsumo, LecturaTablero, TipoVehiculo, UnidadConsumo, VehiculoMedicion } from '../modelo';
import { isoLocal } from '../tiempo';
import { fmt, useCtx } from '../ui';

const TIPOS: TipoVehiculo[] = ['auto', 'camioneta', 'furgon', 'camion_liviano'];

/** Grupo de opciones grandes (una sola elección): botones con `aria-pressed` y nombre visible, para lectores y pruebas. */
function Elegir<T extends string>(props: { titulo: string; valor: T | null; opciones: [T, string, string?][]; onCambio: (v: T) => void; id: string }) {
  return (
    <fieldset className="m-elegir" data-elegir={props.id}>
      <legend>{props.titulo}</legend>
      <div className="m-elegir-opciones">
        {props.opciones.map(([v, t, ayuda]) => (
          <button key={v} type="button" aria-pressed={props.valor === v} className={props.valor === v ? 'm-opcion m-opcion-on' : 'm-opcion'} onClick={() => props.onCambio(v)}>
            <span>{t}</span>
            {ayuda ? <small>{ayuda}</small> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Texto(props: { id: string; etiqueta: string; valor: string; onCambio: (v: string) => void; ejemplo?: string; numerico?: boolean }) {
  return (
    <label className="m-campo" htmlFor={props.id}>
      <span>{props.etiqueta}</span>
      <input
        id={props.id}
        value={props.valor}
        maxLength={40}
        autoComplete="off"
        inputMode={props.numerico ? 'decimal' : undefined}
        placeholder={props.ejemplo}
        onChange={(e) => props.onCambio(e.target.value)}
      />
    </label>
  );
}

export function AltaVehiculo(props: { previo: VehiculoMedicion | null; primeraVez: boolean; onListo: (v: VehiculoMedicion) => void; onCancelar: (() => void) | null; onRestaurar: (() => void) | null }) {
  const { a, d } = useCtx();
  const [paso, setPaso] = useState(0);
  const [b, setB] = useState<BorradorAlta>(() => (props.previo ? borradorDesdeVehiculo(props.previo) : borradorVacio()));
  const [error, setError] = useState<string | null>(null);
  const cambiar = (x: Partial<BorradorAlta>) => setB((s) => ({ ...s, ...x }));
  const ultimo = paso === PASOS_ALTA.length - 1;

  const guardar = async () => {
    const falta = faltaParaGuardar(b);
    if (falta) {
      setError(falta);
      setPaso(0);
      return;
    }
    const v = vehiculoDesdeAlta(b, props.previo, d.vehiculos, isoLocal());
    await a.guardar('vehiculos', v);
    props.onListo(v);
  };

  return (
    <div className="m-alta" data-alta data-paso={paso + 1}>
      <div className="m-alta-cabeza">
        <p className="m-alta-paso" id="alta-progreso">
          Paso {paso + 1} de {PASOS_ALTA.length}
        </p>
        <div className="m-progreso" role="progressbar" aria-labelledby="alta-progreso" aria-valuemin={1} aria-valuemax={PASOS_ALTA.length} aria-valuenow={paso + 1}>
          {PASOS_ALTA.map((t, i) => (
            <span key={t} className={i <= paso ? 'm-progreso-on' : undefined} />
          ))}
        </div>
        <h1 className="m-alta-titulo">{PASOS_ALTA[paso]}</h1>
      </div>

      {paso === 0 ? (
        <section className="m-alta-cuerpo" aria-label={PASOS_ALTA[0]}>
          <p className="m-lead">{props.primeraVez ? 'Empecemos por tu vehículo. Son 4 pasos cortos y puedes saltarte lo que no sepas.' : 'Elige el tipo que más se parece.'}</p>
          <div className="m-tipos" role="group" aria-label="Tipo de vehículo">
            {(b.tipo === 'otro' ? [...TIPOS, 'otro' as const] : TIPOS).map((t) => (
              <button key={t} type="button" aria-pressed={b.tipo === t} className={b.tipo === t ? 'm-tipo m-tipo-on' : 'm-tipo'} onClick={() => {
                  cambiar({ tipo: t });
                  setError(null);
                }} data-tipo={t}>
                <IconoVehiculo tipo={t} />
                <span>{ETIQUETA_TIPO[t]}</span>
              </button>
            ))}
          </div>
          {error ? (
            <p className="m-aviso" role="alert">
              {error}
            </p>
          ) : null}
          {props.onRestaurar ? (
            <div className="m-restaurar-link">
              <p className="m-nota">¿Ya usaste esta herramienta en otro teléfono o navegador?</p>
              <button type="button" className="m-btn m-btn-texto" onClick={props.onRestaurar}>
                Restaurar una copia de seguridad
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {paso === 1 ? (
        <section className="m-alta-cuerpo" aria-label={PASOS_ALTA[1]}>
          <p className="m-lead">Todo es opcional: completa solo lo que sepas.</p>
          <div className="m-grilla">
            <Texto id="alta-marca" etiqueta="Marca" valor={b.marca} onCambio={(v) => cambiar({ marca: v })} />
            <Texto id="alta-modelo" etiqueta="Modelo" valor={b.modelo} onCambio={(v) => cambiar({ modelo: v })} />
            <Texto id="alta-anio" etiqueta="Año" valor={b.anio} onCambio={(v) => cambiar({ anio: v.replace(/\D/g, '').slice(0, 4) })} ejemplo="4 números" numerico />
            <Texto id="alta-motor" etiqueta="Motor (cilindrada)" valor={b.motor} onCambio={(v) => cambiar({ motor: v })} ejemplo="Ej.: 1.6" numerico />
          </div>
          <Elegir<Combustible | 'no_se'>
            id="combustible"
            titulo="Combustible"
            valor={b.combustible}
            opciones={[
              ['gasolina', 'Bencina'],
              ['diesel', 'Diésel'],
              ['otro', 'Otro'],
              ['no_se', 'No lo sé'],
            ]}
            onCambio={(v) => cambiar({ combustible: v })}
          />
        </section>
      ) : null}

      {paso === 2 ? (
        <section className="m-alta-cuerpo" aria-label={PASOS_ALTA[2]}>
          <p className="m-lead">Tu tablero tiene dos contadores de kilómetros. Mira este ejemplo:</p>
          <TableroEjemplo />
          <ul className="m-explica">
            <li>
              <strong>TRIP</strong> (parcial): cuenta un tramo y se puede poner en cero. No hace falta reiniciarlo: basta con anotar lo que marca al salir y al llegar.
            </li>
            <li>
              <strong>Kilometraje total</strong> (ODO u odómetro): todo lo que ha andado el vehículo desde nuevo. Nunca se reinicia.
            </li>
          </ul>
          <Contadores />
          <Elegir<LecturaTablero>
            id="trip"
            titulo="¿Tu TRIP muestra decimales?"
            valor={b.trip}
            opciones={[
              ['decimal', 'Sí, con decimal', 'Como 123,4'],
              ['entero', 'No, solo enteros', 'Como 123'],
              ['no_tiene', 'Mi vehículo no tiene TRIP'],
              ['no_se', 'No lo sé'],
            ]}
            onCambio={(v) => cambiar({ trip: v })}
          />
          <Elegir<LecturaTablero>
            id="odometro"
            titulo="¿Y el kilometraje total?"
            valor={b.odometro}
            opciones={[
              ['entero', 'Solo enteros', 'Como 45 210'],
              ['decimal', 'Con decimal', 'Como 45 210,3'],
              ['no_se', 'No lo sé'],
            ]}
            onCambio={(v) => cambiar({ odometro: v })}
          />
          <details className="m-ayuda" data-ayuda-tablero>
            <summary>¿Cómo lo encuentro?</summary>
            <ul>
              <li>Con el vehículo detenido, pon el contacto (no hace falta arrancar).</li>
              <li>Busca un botón que diga TRIP u ODO, cerca del tablero o en el volante. Cada toque cambia lo que se ve.</li>
              <li>Si aparece «TRIP A» o «TRIP B», es el contador que se reinicia.</li>
              <li>¿No lo encuentras? Elige «No lo sé». Puedes cambiarlo después en «Vehículo».</li>
            </ul>
          </details>
        </section>
      ) : null}

      {paso === 3 ? (
        <section className="m-alta-cuerpo" aria-label={PASOS_ALTA[3]}>
          <p className="m-lead">No te vamos a proponer un número: si no lo sabes, lo iremos midiendo con tus recargas.</p>
          <Elegir<FormaConsumo>
            id="consumo"
            titulo="Elige una opción"
            valor={b.consumo}
            opciones={[
              ['rendimiento', 'Conozco mi rendimiento', 'Lo sé de memoria'],
              ['tablero', 'Mi tablero muestra el consumo', 'Lo leo en la pantalla del vehículo'],
              ['sin_indicador', 'Mi vehículo no tiene indicador de consumo'],
              ['no_se', 'No lo sé todavía'],
            ]}
            onCambio={(v) => cambiar({ consumo: v })}
          />
          {b.consumo === 'rendimiento' || b.consumo === 'tablero' ? (
            <div className="m-consumo">
              {b.consumo === 'tablero' ? (
                <Elegir<LecturaConsumo>
                  id="lectura-consumo"
                  titulo="¿Qué número muestra?"
                  valor={b.consumoLectura}
                  opciones={[
                    ['promedio', 'El promedio', 'Del viaje o desde que lo reiniciaste'],
                    ['instantaneo', 'El instantáneo', 'Cambia a cada momento mientras manejas'],
                  ]}
                  onCambio={(v) => cambiar({ consumoLectura: v })}
                />
              ) : null}
              <Texto id="alta-consumo" etiqueta={b.consumo === 'tablero' ? 'El número que muestra' : 'Tu rendimiento'} valor={b.consumoValor} onCambio={(v) => cambiar({ consumoValor: v })} numerico />
              <Elegir<UnidadConsumo>
                id="unidad"
                titulo="¿En qué unidad?"
                valor={b.consumoUnidad}
                opciones={[
                  ['km/L', 'Kilómetros por litro (km/L)'],
                  ['L/100km', 'Litros cada 100 km (L/100 km)'],
                ]}
                onCambio={(v) => cambiar({ consumoUnidad: v })}
              />
              {b.consumo === 'tablero' && b.consumoLectura === 'instantaneo' ? (
                <p className="m-aviso" data-consumo-instantaneo>
                  El consumo instantáneo cambia a cada momento: lo guardamos como referencia, pero no lo usamos como tu rendimiento.
                </p>
              ) : kmLDeclarado(b) !== null ? (
                <p className="m-info" data-rendimiento-resultado>
                  {b.consumoUnidad === 'L/100km' ? `${b.consumoValor} L/100 km equivale a ${fmt(Math.round(kmLDeclarado(b)! * 100) / 100, ' km/L')} (100 ÷ ${b.consumoValor}). ` : `Rendimiento: ${fmt(kmLDeclarado(b), ' km/L')}. `}
                  Lo guardamos como «lo dices tú»; las recargas lo irán comprobando.
                </p>
              ) : (
                <p className="m-nota">Escribe el número y elige la unidad. Si no estás seguro, elige «No lo sé todavía».</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="m-alta-pie">
        {paso > 0 ? (
          <button type="button" className="m-btn m-btn-grande-sec" onClick={() => setPaso(paso - 1)}>
            <IconoAtras />
            Atrás
          </button>
        ) : props.onCancelar ? (
          <button type="button" className="m-btn m-btn-grande-sec" onClick={props.onCancelar}>
            Cancelar
          </button>
        ) : (
          <span />
        )}
        {ultimo ? (
          <button type="button" className="m-btn m-btn-primario m-grande" onClick={() => void guardar()} disabled={!b.tipo}>
            Guardar vehículo
          </button>
        ) : (
          <button type="button" className="m-btn m-btn-primario m-grande" onClick={() => setPaso(paso + 1)} disabled={paso === 0 && !b.tipo}>
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}
