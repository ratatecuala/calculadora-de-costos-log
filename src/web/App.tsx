import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { JobRecord } from '../shared/clientQuote';
import type { VehicleProfile } from '../shared/vehicle';
import { httpRouteClient } from './api';
import { Calculator } from './components/Calculator';
import { History } from './components/History';
import { QuoteForm } from './components/QuoteForm';
import { QuoteView } from './components/QuoteView';
import { VehiclesView } from './components/VehiclesView';
import { QuoteSession } from './session';
import { localQuoteRepository } from './storage';
import { browserVehicleRepository } from './vehicleRepository';

type View = { name: 'cotizar' } | { name: 'nueva' } | { name: 'trabajos' } | { name: 'ver'; job: JobRecord } | { name: 'vehiculos' };

export function App() {
  const session = useMemo(() => new QuoteSession(httpRouteClient), []);
  const vehicleRepository = useMemo(() => browserVehicleRepository(), []);
  const [view, setView] = useState<View>({ name: 'cotizar' });
  const [vehicles, setVehicles] = useState<VehicleProfile[]>([]);
  const [defaultVehicleId, setDefaultVehicleId] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  // La franja depende del proveedor que realmente respondió (auditoría): no se afirma «simulado» con datos reales.
  const simulated = [snapshot.habitual.route, snapshot.comparison.route].some((r) => r?.source === 'simulado');

  const refreshVehicles = useCallback(async () => {
    const [list, defaultId] = await Promise.all([vehicleRepository.list(), vehicleRepository.getDefaultId()]);
    setVehicles(list);
    setDefaultVehicleId(defaultId);
    return { list, defaultId };
  }, [vehicleRepository]);

  // Al abrir: carga los vehículos y aplica el predeterminado si la cotización aún no tiene uno.
  useEffect(() => {
    void refreshVehicles().then(({ list, defaultId }) => {
      const preferred = list.find((v) => v.id === defaultId);
      if (preferred && !session.getSnapshot().vehicle) session.selectVehicle(preferred);
    });
  }, [refreshVehicles, session]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.name]);

  const tab = (name: View['name'], label: string, active: boolean) => (
    <button type="button" className={active ? 'nav nav-on' : 'nav'} aria-current={active ? 'page' : undefined} onClick={() => setView({ name } as View)}>
      {label}
    </button>
  );

  return (
    <div className="app">
      <header className="top no-print">
        <span className="brand">
          <span className="logo" aria-hidden="true" />
          [Marca]
        </span>
        <nav>
          {tab('cotizar', 'Cotizar', view.name === 'cotizar' || view.name === 'nueva')}
          {tab('trabajos', 'Mis trabajos', view.name === 'trabajos' || view.name === 'ver')}
          {tab('vehiculos', 'Mi vehículo', view.name === 'vehiculos')}
        </nav>
      </header>
      <div className="banner no-print" role="status">
        {simulated ? (
          <>
            Versión de prueba: estas distancias y tiempos son <strong>simulados</strong>. No los uses para cobrar sin revisarlos.
          </>
        ) : (
          <>Versión de prueba, aún no publicada.</>
        )}
      </div>
      <main>
        {view.name === 'cotizar' ? (
          <Calculator
            session={session}
            vehicles={vehicles}
            onManageVehicles={() => setView({ name: 'vehiculos' })}
            onCreateQuote={() => setView({ name: 'nueva' })}
          />
        ) : null}
        {view.name === 'nueva' ? (
          <QuoteForm session={session} repository={localQuoteRepository} onSaved={(job) => setView({ name: 'ver', job })} onCancel={() => setView({ name: 'cotizar' })} />
        ) : null}
        {view.name === 'trabajos' ? <History repository={localQuoteRepository} onOpen={(job) => setView({ name: 'ver', job })} /> : null}
        {view.name === 'ver' ? <QuoteView job={view.job} repository={localQuoteRepository} onBack={() => setView({ name: 'trabajos' })} /> : null}
        {view.name === 'vehiculos' ? (
          <VehiclesView
            repository={vehicleRepository}
            vehicles={vehicles}
            defaultId={defaultVehicleId}
            onChanged={refreshVehicles}
            onUse={(v) => {
              session.selectVehicle(v);
              setView({ name: 'cotizar' });
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
