/**
 * Herramienta privada de medición (A-92): sin vehículo, alta guiada en 4 pasos SIN barra inferior; después,
 * Inicio · Combustible · Historial · Vehículo. Teléfono primero e igual de completa en el computador (A-49).
 * Datos solo en este dispositivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nombreVehiculo } from './alta';
import { AlmacenIndexedDB, pedirPersistencia, type Almacen } from './almacen';
import { IconoAuto, IconoAyuda, IconoInicio, IconoLista, IconoSurtidor } from './ilustraciones';
import type { VehiculoMedicion } from './modelo';
import { cargarTodo, type DatosLocales } from './repositorio';
import { isoLocal } from './tiempo';
import { Ctx, type Contexto, type Tab } from './ui';
import { AltaVehiculo } from './pantallas/Alta';
import { PantallaAyuda } from './pantallas/Ayuda';
import { PantallaCombustible } from './pantallas/Combustible';
import { PantallaHistorial } from './pantallas/Historial';
import { PantallaInicio } from './pantallas/Inicio';
import { ImportarCopia } from './pantallas/Respaldo';
import { PantallaVehiculo } from './pantallas/Vehiculo';
import { PantallaViaje } from './pantallas/Viaje';

const TABS: [Tab, string, () => JSX.Element][] = [
  ['inicio', 'Inicio', IconoInicio],
  ['combustible', 'Combustible', IconoSurtidor],
  ['historial', 'Historial', IconoLista],
  ['vehiculo', 'Vehículo', IconoAuto],
];

const CLAVE_VEHICULO = 'medicion.vehiculoElegido';

export function App() {
  const [a, setA] = useState<Almacen | null>(null);
  const [d, setD] = useState<DatosLocales | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('inicio');
  const [alta, setAlta] = useState<{ previo: VehiculoMedicion | null } | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [elegido, setElegido] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CLAVE_VEHICULO);
    } catch {
      return null;
    }
  });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [persistente, setPersistente] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    AlmacenIndexedDB.abrir()
      .then(async (alm) => {
        const datos = await cargarTodo(alm, isoLocal());
        if (!vivo) return;
        setA(alm);
        setD(datos);
        setPersistente(await pedirPersistencia());
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo abrir el almacenamiento local.'));
    return () => {
      vivo = false;
    };
  }, []);

  const recargar = useCallback(async () => {
    if (a) setD(await cargarTodo(a, isoLocal()));
  }, [a]);

  const avisar = useCallback((t: string) => {
    setMensaje(t);
    setTimeout(() => setMensaje((m) => (m === t ? null : m)), 4000);
  }, []);

  const elegirVehiculo = useCallback((id: string) => {
    setElegido(id);
    try {
      localStorage.setItem(CLAVE_VEHICULO, id);
    } catch {
      /* preferencia opcional */
    }
  }, []);

  const irA = useCallback((t: Tab) => {
    setTab(t);
    window.scrollTo?.(0, 0);
  }, []);

  // Vehículo: el elegido, o automáticamente el único que hay.
  const veh = useMemo(() => {
    if (!d) return null;
    return d.vehiculos.find((v) => v.id === elegido) ?? (d.vehiculos.length === 1 ? (d.vehiculos[0] ?? null) : null);
  }, [d, elegido]);

  if (error) {
    return (
      <main className="m-app">
        <p className="m-error" role="alert">
          {error}
        </p>
      </main>
    );
  }
  if (!a || !d) return <main className="m-app m-cargando">Cargando…</main>;

  const ctx: Contexto = { a, d, veh, recargar, elegirVehiculo, irA, avisar, abrirAlta: (previo) => setAlta({ previo }) };
  const sinVehiculo = d.vehiculos.length === 0;
  // Configuración (alta o restaurar una copia): pantalla completa, sin barra inferior.
  const configurando = restaurando || alta !== null || sinVehiculo;

  let contenido;
  if (restaurando) {
    contenido = (
      <section className="m-tarjeta m-restaurar" aria-label="Restaurar una copia de seguridad">
        <h1 className="m-titulo">Restaurar una copia de seguridad</h1>
        <p>Elige el archivo «respaldo-medicion-….json» que guardaste antes. Si tiene algún problema, no se importa nada.</p>
        <ImportarCopia principal />
        <div className="m-fila m-envolver">
          {sinVehiculo ? (
            <button type="button" className="m-btn" onClick={() => setRestaurando(false)}>
              Volver
            </button>
          ) : (
            <button
              type="button"
              className="m-btn m-btn-primario m-grande"
              onClick={() => {
                setRestaurando(false);
                setAlta(null);
                irA('inicio');
              }}
            >
              Ir al inicio
            </button>
          )}
        </div>
      </section>
    );
  } else if (alta !== null || sinVehiculo) {
    const previo = alta?.previo ?? null;
    contenido = (
      <AltaVehiculo
        key={previo?.id ?? 'nuevo'}
        previo={previo}
        primeraVez={sinVehiculo}
        onCancelar={sinVehiculo ? null : () => setAlta(null)}
        onRestaurar={sinVehiculo ? () => setRestaurando(true) : null}
        onListo={(v) => {
          elegirVehiculo(v.id);
          setAlta(null);
          void recargar();
          irA(previo ? 'vehiculo' : 'inicio');
          avisar(previo ? 'Vehículo actualizado' : `¡Listo! ${nombreVehiculo(v)} quedó guardado`);
        }}
      />
    );
  } else {
    contenido = (
      <>
        {tab === 'inicio' ? <PantallaInicio /> : null}
        {tab === 'viaje' ? <PantallaViaje /> : null}
        {tab === 'combustible' ? <PantallaCombustible /> : null}
        {tab === 'historial' ? <PantallaHistorial persistente={persistente} /> : null}
        {tab === 'vehiculo' ? <PantallaVehiculo /> : null}
        {tab === 'ayuda' ? <PantallaAyuda /> : null}
      </>
    );
  }

  const activa: Tab = tab === 'viaje' || tab === 'ayuda' ? 'inicio' : tab;
  return (
    <Ctx.Provider value={ctx}>
      <div className={configurando ? 'm-app m-app-config' : 'm-app'}>
        <header className="m-top">
          <span className="m-marca">
            <span className="m-logo" aria-hidden="true" />
            Medición privada
          </span>
          {!configurando ? (
            <span className="m-top-der">
              {d.vehiculos.length > 1 ? (
                <select aria-label="Vehículo" value={veh?.id ?? ''} onChange={(e) => elegirVehiculo(e.target.value)} className="m-select-veh">
                  <option value="" disabled>
                    Elige vehículo
                  </option>
                  {d.vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {nombreVehiculo(v)}
                    </option>
                  ))}
                </select>
              ) : veh ? (
                <span className="m-chip" data-vehiculo={veh.alias}>
                  {nombreVehiculo(veh)}
                </span>
              ) : null}
              <button type="button" className="m-icono-btn" aria-label="Ayuda" onClick={() => irA('ayuda')}>
                <IconoAyuda />
              </button>
            </span>
          ) : null}
        </header>
        <main className="m-contenido">{contenido}</main>
        {mensaje ? (
          <div className="m-toast" role="status">
            {mensaje}
          </div>
        ) : null}
        {configurando ? null : (
          <nav className="m-nav" aria-label="Secciones">
            {TABS.map(([t, etiqueta, Icono]) => (
              <button key={t} type="button" className={activa === t ? 'm-nav-btn m-activo' : 'm-nav-btn'} aria-current={activa === t ? 'page' : undefined} onClick={() => irA(t)}>
                <Icono />
                <span>{etiqueta}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </Ctx.Provider>
  );
}
