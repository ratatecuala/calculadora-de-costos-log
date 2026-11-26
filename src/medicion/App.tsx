/**
 * Herramienta privada de medición: barra inferior Viaje · Combustible · Historial · Vehículo.
 * Teléfono primero e igual de completa en el computador (A-49). Datos solo en este dispositivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlmacenIndexedDB, pedirPersistencia, type Almacen } from './almacen';
import { cargarTodo, type DatosLocales } from './repositorio';
import { isoLocal } from './tiempo';
import { Ctx, type Contexto, type Tab } from './ui';
import { PantallaViaje } from './pantallas/Viaje';
import { PantallaCombustible } from './pantallas/Combustible';
import { PantallaHistorial } from './pantallas/Historial';
import { PantallaVehiculo } from './pantallas/Vehiculo';

const TABS: [Tab, string][] = [
  ['viaje', 'Viaje'],
  ['combustible', 'Combustible'],
  ['historial', 'Historial'],
  ['vehiculo', 'Vehículo'],
];

const CLAVE_VEHICULO = 'medicion.vehiculoElegido';

export function App() {
  const [a, setA] = useState<Almacen | null>(null);
  const [d, setD] = useState<DatosLocales | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('viaje');
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

  const ctx: Contexto = { a, d, veh, recargar, elegirVehiculo, irA: setTab, avisar };
  return (
    <Ctx.Provider value={ctx}>
      <div className="m-app">
        <header className="m-top">
          <span className="m-marca">
            <span className="m-logo" aria-hidden="true" />
            Medición privada
          </span>
          {d.vehiculos.length > 1 ? (
            <select aria-label="Vehículo" value={veh?.id ?? ''} onChange={(e) => elegirVehiculo(e.target.value)} className="m-select-veh">
              <option value="" disabled>
                Elige vehículo
              </option>
              {d.vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.alias}
                </option>
              ))}
            </select>
          ) : veh ? (
            <span className="m-chip" data-vehiculo={veh.alias}>
              {veh.alias}
            </span>
          ) : null}
        </header>
        <main className="m-contenido">
          {tab === 'viaje' ? <PantallaViaje /> : null}
          {tab === 'combustible' ? <PantallaCombustible /> : null}
          {tab === 'historial' ? <PantallaHistorial persistente={persistente} /> : null}
          {tab === 'vehiculo' ? <PantallaVehiculo /> : null}
        </main>
        {mensaje ? (
          <div className="m-toast" role="status">
            {mensaje}
          </div>
        ) : null}
        <nav className="m-nav" aria-label="Secciones">
          {TABS.map(([t, etiqueta]) => (
            <button key={t} type="button" className={tab === t ? 'm-nav-btn m-activo' : 'm-nav-btn'} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
              {etiqueta}
            </button>
          ))}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
