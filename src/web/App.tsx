import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { JobRecord } from '../shared/clientQuote';
import type { VehicleProfile } from '../shared/vehicle';
import { httpRouteClient } from './api';
import { AuthStore } from './cloud/auth';
import { cloudConfig, createBoundClient, getSupabase } from './cloud/client';
import { mensajeCopia, migrateLocalToCloud, pendingLocalData, type PendingLocalData } from './cloud/migration';
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
import { DraftBanner } from './components/DraftBanner';
import { DraftStore, type StoredDraft } from './draftStore';
import { FEATURE_FLAGS } from './featureFlags';
import { emptyInventoryDraft } from './modules/inventoryDraft';
import { emptyResourcesDraft } from './modules/resourcesDraft';
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
  // I-1b (A-68): borrador persistente del modo sin cuenta, separado del historial emitido.
  const cargoOn = FEATURE_FLAGS.integracionCarga;
  const draftStore = useMemo(() => new DraftStore(store), [store]);
  const [draftOffer, setDraftOffer] = useState<StoredDraft | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  /** Mientras se ofrece recuperar, el autoguardado NO pisa el borrador guardado. */
  const offerPending = useRef(false);
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
    // C1 (auditoría de docs/22 v2): al pasar de «sin cuenta» a una cuenta, el borrador local se
    // GUARDA aislado (nunca se borra) y el inventario y los recursos salen de la sesión de la cuenta:
    // con cuenta no se muestran ni se guardan hasta I-2. Al volver sin cuenta se ofrece recuperarlo.
    if (cargoOn && previousUser.current === null && userId !== null) {
      const current = sessionRef.current;
      if (current.hasDraftContent() && !offerPending.current) {
        const w = draftStore.write('local', current.draftData());
        if (!w.ok) setDraftNotice(w.reason);
      }
      current.setCargo(emptyInventoryDraft());
      current.setResources(emptyResourcesDraft());
    }
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

  // I-1b: al estar SIN cuenta (al abrir o al cerrar sesión), ofrecer el borrador local guardado.
  // Nunca se ofrece a una cuenta (C1): solo se lee el dueño «local».
  useEffect(() => {
    if (!cargoOn || userId !== null) {
      setDraftOffer(null);
      offerPending.current = false;
      return;
    }
    const r = draftStore.read('local');
    if (r.status === 'ilegible') {
      draftStore.clear('local');
      setDraftNotice('No se pudo recuperar el borrador guardado: estaba dañado y se descartó.');
    } else if (r.status === 'ok' && !draft.session.hasDraftContent()) {
      offerPending.current = true;
      setDraftOffer(r.draft);
    }
  }, [cargoOn, userId, draftStore, draft.session]);

  // I-1b: autoguardado 1 s después del último cambio, solo sin cuenta y sin una oferta pendiente.
  const currentOwnerRef = useRef(currentOwner);
  currentOwnerRef.current = currentOwner;
  useEffect(() => {
    if (!cargoOn) return;
    const target = draft.session;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = target.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (currentOwnerRef.current !== 'local' || offerPending.current) return;
        if (!target.hasDraftContent()) return;
        const w = draftStore.write('local', target.draftData());
        setDraftNotice(w.ok ? null : w.reason);
      }, 1000);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [cargoOn, draft.session, draftStore]);

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
      // Nunca un éxito global si quedan cotizaciones en el navegador (docs/22 §2.5).
      setMigration({ busy: false, message: mensajeCopia(r) });
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
      {userId && pending && pending.deferred.length > 0 && !migration.message ? (
        // Las diferidas se informan, pero NO son pendientes de copia: no hay botón ni se repite como tarea.
        <p className="sub migration no-print" data-testid="copia-diferidas">
          {pending.deferred.length} {pending.deferred.length === 1 ? 'cotización con detalle de carga queda' : 'cotizaciones con detalle de carga quedan'} en
          este navegador; se podrán copiar a tu cuenta cuando la cuenta lo permita.
        </p>
      ) : null}
      {migration.message ? <p className="notice migration no-print">{migration.message}</p> : null}
      {loadFailure ? <p className="warn migration no-print">{loadFailure}</p> : null}
      {draftOffer && currentOwner === 'local' ? (
        <DraftBanner
          draft={draftOffer}
          reemplaza={session.hasDraftContent()}
          onRecover={() => {
            session.restoreDraft(draftOffer.data);
            offerPending.current = false;
            setDraftOffer(null);
          }}
          onDiscard={() => {
            draftStore.clear('local');
            offerPending.current = false;
            setDraftOffer(null);
          }}
        />
      ) : null}
      {draftNotice ? (
        <p className="warn migration no-print" role="alert">
          {draftNotice}
        </p>
      ) : null}
      <main>
        {(view.name === 'cotizar' || view.name === 'nueva') && !showDraft ? <p className="sub layout">Cargando…</p> : null}
        {view.name === 'cotizar' && showDraft ? (
          <Calculator
            session={session}
            vehicles={vehicles}
            onManageVehicles={() => setView({ name: 'vehiculos' })}
            onCreateQuote={() => setView({ name: 'nueva', owner: currentOwner })}
            cargoEnabled={cargoOn && currentOwner === 'local'}
          />
        ) : null}
        {view.name === 'nueva' && showDraft && view.owner === currentOwner ? (
          <QuoteForm
            session={session}
            repository={quoteRepository}
            cargoEnabled={cargoOn && currentOwner === 'local'}
            onSaved={(job, savedWith) => {
              // I-1b: emitir en el navegador borra el borrador sin emitir.
              if (cargoOn && savedWith.kind === 'local') draftStore.clear('local');
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
