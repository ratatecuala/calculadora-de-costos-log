import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { JobRecord } from '../shared/clientQuote';
import { httpRouteClient } from './api';
import { Calculator } from './components/Calculator';
import { History } from './components/History';
import { QuoteForm } from './components/QuoteForm';
import { QuoteView } from './components/QuoteView';
import { QuoteSession } from './session';
import { localQuoteRepository } from './storage';

type View = { name: 'cotizar' } | { name: 'nueva' } | { name: 'trabajos' } | { name: 'ver'; job: JobRecord };

export function App() {
  const session = useMemo(() => new QuoteSession(httpRouteClient), []);
  const [view, setView] = useState<View>({ name: 'cotizar' });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  // La franja depende del proveedor que realmente respondió (auditoría): no se afirma «simulado» con datos reales.
  const simulated = [snapshot.habitual.route, snapshot.comparison.route].some((r) => r?.source === 'simulado');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.name]);

  return (
    <div className="app">
      <header className="top no-print">
        <span className="brand">
          <span className="logo" aria-hidden="true" />
          [Marca]
        </span>
        <nav>
          <button type="button" className={view.name === 'cotizar' || view.name === 'nueva' ? 'nav nav-on' : 'nav'} onClick={() => setView({ name: 'cotizar' })}>
            Cotizar
          </button>
          <button type="button" className={view.name === 'trabajos' || view.name === 'ver' ? 'nav nav-on' : 'nav'} onClick={() => setView({ name: 'trabajos' })}>
            Mis trabajos
          </button>
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
        {view.name === 'cotizar' ? <Calculator session={session} onCreateQuote={() => setView({ name: 'nueva' })} /> : null}
        {view.name === 'nueva' ? (
          <QuoteForm session={session} repository={localQuoteRepository} onSaved={(job) => setView({ name: 'ver', job })} onCancel={() => setView({ name: 'cotizar' })} />
        ) : null}
        {view.name === 'trabajos' ? <History repository={localQuoteRepository} onOpen={(job) => setView({ name: 'ver', job })} /> : null}
        {view.name === 'ver' ? <QuoteView job={view.job} repository={localQuoteRepository} onBack={() => setView({ name: 'trabajos' })} /> : null}
      </main>
    </div>
  );
}
