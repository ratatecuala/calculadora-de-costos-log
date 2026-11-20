import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { JobRecord } from '../shared/clientQuote';
import type { VehicleProfile } from '../shared/vehicle';
import { httpRouteClient } from './api';
import { AuthStore } from './cloud/auth';
import { cloudConfig, createBoundClient, getSupabase } from './cloud/client';
import { migrateLocalToCloud, pendingLocalData, type PendingLocalData } from './cloud/migration';
import { CloudQuoteRepository } from './cloud/quotes';
import { CloudVehicleRepository } from './cloud/vehicles';
import { AccountView } from './components/AccountView';
import { Calculator } from './components/Calculator';
import { History } from './components/History';
import { ModulesPreview } from './components/ModulesPreview';
import { PublicQuote } from './components/PublicQuote';
import { QuoteForm } from './components/QuoteForm';
import { QuoteView } from './components/QuoteView';
import { VehiclesView } from './components/VehiclesView';
import { FEATURE_FLAGS } from './featureFlags';
import { QuoteSession } from './session';
import { browserQuoteRepository, type QuoteRepository } from './storage';
import { draftVisibleTo, ownerOf, shouldResetDraft, VehicleListLoader, visibleVehicleState } from './vehicleList';
import { browserVehicleRepository, MemoryKeyValueStore, type KeyValueStore, type VehicleRepository } from './vehicleRepository';

type View =
  | { name: 'cotizar' }
  | { name: 'nueva'; owner: string }
  | { name: 'trabajos' }
  | { name: 'ver'; job: JobRecord; owner: string }
  | { name: 'vehiculos' }
  | { name: 'cuenta' }
  /** Vista previa de inventario y recursos: solo con la feature flag activada (A-66). */
  | { name: 'modulos' };

const PUBLIC_PATH = /^\/c\/([A-Za-z0-9_-]{43})\/?$/;

export function App() {
  const publicToken = typeof window !== 'undefined' ? PUBLIC_PATH.exec(window.location.pathname)?.[1] : undefined;
  if (publicToken) {
    return (
      <div className="app">
        <header className="top no-print">
          <span className="brand">
            <span className="logo" aria-hidden="true" />
            [Marca]
          </span>
        </header>
        <main>
          <PublicQuote token={publicToken} />
        </main>
      </div>
    );
  }
  return <MainApp />;
}

function browserStore(): KeyValueStore {
  try {
    localStorage.getItem('__prueba__');
    return localStorage;
  } catch {
    return new MemoryKeyValueStore();
  }
}

function MainApp() {
  // El borrador de la cotización se reinicia al cerrar sesión o cambiar de cuenta (quinta auditoría)
  // y lleva el dueño, para no mostrarlo a otra identidad ni por un cuadro (sexta auditoría).
  const [draft, setDraft] = useState(() => ({ owner: 'local', session: new QuoteSession(httpRouteClient) }));
  const session = draft.session;
  const localVehicles = useMemo(() => browserVehicleRepository(), []);
  const localQuotes = useMemo(() => browserQuoteRepository(), []);
  const store = useMemo(() => browserStore(), []);
  const auth = useMemo(
    () => new AuthStore(getSupabase(), cloudConfig ? `${cloudConfig.url}/auth/v1/settings` : null, cloudConfig?.publishableKey ?? null),
    [],
  );
  const authSnap = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  const userId = authSnap.status === 'conectado' ? (authSnap.user?.id ?? null) : null;
  const currentOwner = ownerOf(userId);

  // Datos anónimos (navegador) y de la cuenta (nube) separados: nunca se mezclan en pantalla.
  const { vehicleRepository, quoteRepository } = useMemo((): { vehicleRepository: VehicleRepository; quoteRepository: QuoteRepository } => {
    const supabase = getSupabase();
    if (userId && supabase) {
      // Cada escritura comprueba que la app siga con esta cuenta (sexta auditoría, P1).
      const isCurrentUser = () => {
        const snap = auth.getSnapshot();
        return snap.status === 'conectado' && snap.user?.id === userId;
      };
      return {
        vehicleRepository: new CloudVehicleRepository(supabase, userId),
        quoteRepository: new CloudQuoteRepository(supabase, userId, { isCurrentUser }),
      };
    }
    return { vehicleRepository: localVehicles, quoteRepository: localQuotes };
  }, [userId, localVehicles, localQuotes, auth]);
  const quoteRepoRef = useRef(quoteRepository);
  quoteRepoRef.current = quoteRepository;

  const [view, setView] = useState<View>({ name: 'cotizar' });
  // Lista de vehículos ligada a la identidad vigente: nunca muestra la de otra cuenta.
  const vehicleList = useMemo(() => new VehicleListLoader(), []);
  const vehicleState = useSyncExternalStore(vehicleList.subscribe, vehicleList.getSnapshot);
  // Filtro por dueño EN EL RENDER: nada de otra identidad, ni siquiera un cuadro (sexta auditoría, P2).
  const visibleVehicles = visibleVehicleState(vehicleState, currentOwner);
  const vehicles: VehicleProfile[] = visibleVehicles.vehicles;
  const defaultVehicleId = visibleVehicles.defaultId;
  const loadFailure = visibleVehicles.failure;
  const showDraft = draftVisibleTo(draft.owner, currentOwner);
  const [pending, setPending] = useState<PendingLocalData | null>(null);
  const [migration, setMigration] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  // La franja depende del proveedor que realmente respondió (auditoría): no se afirma «simulado» con datos reales.
  const simulated = [snapshot.habitual.route, snapshot.comparison.route].some((r) => r?.source === 'simulado');

  const refreshVehicles = useCallback(() => vehicleList.refresh(), [vehicleList]);

  // Cambio de identidad (entrar, salir o cambiar de cuenta): reiniciar el borrador cuando
  // corresponde y no mostrar una cotización de la otra fuente de datos.
  const previousUser = useRef<string | null | undefined>(undefined);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    const owner = ownerOf(userId);
    if (shouldResetDraft(previousUser.current, userId)) {
      const fresh = new QuoteSession(httpRouteClient);
      sessionRef.current = fresh;
      setDraft({ owner, session: fresh });
    } else {
      setDraft((d) => (d.owner === owner ? d : { ...d, owner }));
    }
    previousUser.current = userId;
    setView((v) => (v.name === 'ver' || v.name === 'nueva' ? { name: 'trabajos' } : v));
  }, [userId]);

  // Al abrir o al cambiar de identidad: lista vacía al instante, carga de la identidad nueva y,
  // si la cotización no tiene vehículo, aplicar el predeterminado (solo con datos vigentes).
  useEffect(() => {
    void vehicleList.switchTo(userId ?? 'local', vehicleRepository).then((result) => {
      if (!result) return;
      const preferred = result.vehicles.find((v) => v.id === result.defaultId);
      if (preferred && !sessionRef.current.getSnapshot().vehicle) sessionRef.current.selectVehicle(preferred);
    });
  }, [userId, vehicleRepository, vehicleList]);

  // ¿Queda historial del navegador sin copiar a esta cuenta?
  const refreshPending = useCallback(async () => {
    if (!userId) {
      setPending(null);
      return;
    }
    try {
      setPending(await pendingLocalData(localQuotes, localVehicles, store, userId));
    } catch {
      setPending(null);
    }
  }, [userId, localQuotes, localVehicles, store]);
  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  const migrate = async () => {
    const shared = getSupabase();
    if (!shared || !userId) return;
    setMigration({ busy: true, message: null });
    try {
      // Toda la copia queda fijada a la sesión de quien la inició (quinta auditoría, P1).
      const { data } = await shared.auth.getSession();
      const token = data.session?.user.id === userId ? data.session.access_token : null;
      const bound = token ? createBoundClient(token) : null;
      if (!bound) throw new Error('No se pudo confirmar tu sesión. Vuelve a ingresar e inténtalo de nuevo.');
      const r = await migrateLocalToCloud({
        supabase: bound,
        userId,
        localQuotes,
        localVehicles,
        store,
        isCurrentUser: () => auth.getSnapshot().user?.id === userId,
      });
      setMigration({
        busy: false,
        message: r.verified
          ? `Listo: se copiaron ${r.jobsCopied} cotizaciones y ${r.vehiclesCopied} vehículos a tu cuenta${r.jobsAlreadyThere ? ` (${r.jobsAlreadyThere} ya estaban)` : ''}. La copia de este navegador se mantiene.`
          : 'La copia quedó incompleta. Puedes reintentar: no se duplicará nada. Tus datos locales siguen intactos.',
      });
      await refreshVehicles();
      await refreshPending();
    } catch (e) {
      setMigration({ busy: false, message: e instanceof Error ? e.message : 'No se pudo copiar. No se borró nada.' });
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.name]);

  const tab = (name: View['name'], label: string, active: boolean) => (
    <button type="button" className={active ? 'nav nav-on' : 'nav'} aria-current={active ? 'page' : undefined} onClick={() => setView({ name } as View)}>
      {label}
    </button>
  );

  const cloudOn = authSnap.status !== 'desactivado';
  const showMigration = userId && pending && pending.jobs + pending.vehicles > 0;

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
          {cloudOn ? tab('cuenta', userId ? 'Cuenta ✓' : 'Ingresar', view.name === 'cuenta') : null}
          {FEATURE_FLAGS.modulosCargaRecursos ? tab('modulos', 'Carga (prueba)', view.name === 'modulos') : null}
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
        {cloudOn && !userId ? <> Sin cuenta: tus datos quedan solo en este navegador, sin respaldo en la nube.</> : null}
      </div>
      {showMigration ? (
        <div className="notice migration no-print" role="status">
          <span>
            Este navegador tiene {pending.jobs} cotizaciones y {pending.vehicles} vehículos que no están en tu cuenta.
          </span>
          <button type="button" className="btn2 small" disabled={migration.busy} onClick={() => void migrate()}>
            {migration.busy ? 'Copiando…' : 'Copiar a mi cuenta'}
          </button>
        </div>
      ) : null}
      {migration.message ? <p className="notice migration no-print">{migration.message}</p> : null}
      {loadFailure ? <p className="warn migration no-print">{loadFailure}</p> : null}
      <main>
        {(view.name === 'cotizar' || view.name === 'nueva') && !showDraft ? <p className="sub layout">Cargando…</p> : null}
        {view.name === 'cotizar' && showDraft ? (
          <Calculator
            session={session}
            vehicles={vehicles}
            onManageVehicles={() => setView({ name: 'vehiculos' })}
            onCreateQuote={() => setView({ name: 'nueva', owner: currentOwner })}
          />
        ) : null}
        {view.name === 'nueva' && showDraft && view.owner === currentOwner ? (
          <QuoteForm
            session={session}
            repository={quoteRepository}
            onSaved={(job, savedWith) => {
              // Un guardado iniciado con otra cuenta no abre su cotización en la cuenta actual.
              if (savedWith !== quoteRepoRef.current) return;
              setView({ name: 'ver', job, owner: ownerOf(userId) });
            }}
            onCancel={() => setView({ name: 'cotizar' })}
          />
        ) : null}
        {view.name === 'trabajos' ? (
          <History key={quoteRepository.kind + (userId ?? '')} repository={quoteRepository} onOpen={(job) => setView({ name: 'ver', job, owner: currentOwner })} />
        ) : null}
        {view.name === 'ver' && view.owner === currentOwner ? (
          <QuoteView job={view.job} repository={quoteRepository} onBack={() => setView({ name: 'trabajos' })} />
        ) : null}
        {view.name === 'vehiculos' ? (
          <VehiclesView
            key={userId ?? 'local'}
            repository={vehicleRepository}
            where={userId ? 'nube' : 'local'}
            vehicles={vehicles}
            defaultId={defaultVehicleId}
            onChanged={refreshVehicles}
            onUse={(v) => {
              session.selectVehicle(v);
              setView({ name: 'cotizar' });
            }}
          />
        ) : null}
        {/* Sin conexión con el cotizador ni con el guardado (A-66). */}
        {FEATURE_FLAGS.modulosCargaRecursos && view.name === 'modulos' ? <ModulesPreview /> : null}
        {view.name === 'cuenta' ? <AccountView auth={auth} testPasswordLogin={cloudConfig?.testPasswordLogin ?? false} /> : null}
      </main>
    </div>
  );
}
