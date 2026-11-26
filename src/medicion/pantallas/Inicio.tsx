/** Pantalla principal tras el alta (A-92): Mi vehículo, Iniciar viaje, Registrar recarga y Mis viajes. */
import { nombreVehiculo } from '../alta';
import { IconoAyuda, IconoIniciar, IconoLista, IconoSurtidor, IconoVehiculo } from '../ilustraciones';
import { fechaHoraLegible, useCtx } from '../ui';

export function PantallaInicio() {
  const { d, veh, irA, elegirVehiculo } = useCtx();

  if (!veh) {
    return (
      <section className="m-tarjeta" aria-label="Elige tu vehículo">
        <h1 className="m-titulo">¿Con qué vehículo sales hoy?</h1>
        <div className="m-tipos">
          {d.vehiculos.map((v) => (
            <button key={v.id} type="button" className="m-tipo" onClick={() => elegirVehiculo(v.id)}>
              <IconoVehiculo tipo={v.tipoVehiculo} />
              <span>{nombreVehiculo(v)}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const enCurso = d.viajes.find((v) => v.vehiculoId === veh.id && v.estado === 'en curso');
  const delVehiculo = d.viajes.filter((v) => v.vehiculoId === veh.id && v.estado !== 'anulado');
  const ultimo = [...delVehiculo].sort((x, y) => y.inicio.localeCompare(x.inicio))[0] ?? null;
  const cargas = d.cargas.filter((c) => c.vehiculoId === veh.id).length;

  return (
    <div className="m-inicio" data-inicio>
      <h1 className="m-titulo">Inicio</h1>
      <button type="button" className="m-tarjeta m-vehiculo-card" onClick={() => irA('vehiculo')} aria-label={`Mi vehículo: ${nombreVehiculo(veh)}`} data-mi-vehiculo>
        <IconoVehiculo tipo={veh.tipoVehiculo} />
        <span className="m-vehiculo-texto">
          <small>Mi vehículo</small>
          <strong>{nombreVehiculo(veh)}</strong>
        </span>
        <span className="m-chevron" aria-hidden="true">
          ›
        </span>
      </button>

      {enCurso ? (
        <button type="button" className="m-accion m-accion-principal" onClick={() => irA('viaje')} data-accion="continuar">
          <IconoIniciar />
          <span>
            <strong>Continuar viaje</strong>
            <small>En curso desde {fechaHoraLegible(enCurso.inicio)}</small>
          </span>
        </button>
      ) : (
        <button type="button" className="m-accion m-accion-principal" onClick={() => irA('viaje')} data-accion="iniciar">
          <IconoIniciar />
          <span>
            <strong>Iniciar viaje</strong>
            <small>Anota los kilómetros al salir y al llegar</small>
          </span>
        </button>
      )}
      <div className="m-acciones">
        <button type="button" className="m-accion" onClick={() => irA('combustible')} data-accion="recarga">
          <IconoSurtidor />
          <span>
            <strong>Registrar recarga</strong>
            <small>{cargas ? `${cargas} anotada${cargas === 1 ? '' : 's'}` : 'Cuando eches combustible'}</small>
          </span>
        </button>
        <button type="button" className="m-accion" onClick={() => irA('historial')} data-accion="viajes">
          <IconoLista />
          <span>
            <strong>Mis viajes</strong>
            <small>{ultimo ? `Último: ${fechaHoraLegible(ultimo.inicio)}` : 'Aún no hay viajes'}</small>
          </span>
        </button>
      </div>
      <button type="button" className="m-btn m-btn-texto m-ayuda-link" onClick={() => irA('ayuda')}>
        <IconoAyuda />
        ¿Cómo funciona?
      </button>
    </div>
  );
}
