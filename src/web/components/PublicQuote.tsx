import { useEffect, useState } from 'react';
import type { ClientQuote } from '../../shared/clientQuote';
import { getSupabase } from '../cloud/client';
import { fetchPublicQuote } from '../cloud/quotes';
import { QuoteDocument } from './QuoteView';

/**
 * Página pública /c/<token>: lo que ve el cliente del transportista. Sin sesión.
 * Solo usa `get_public_quote(token)`, que devuelve exclusivamente campos de la cotización.
 */
export function PublicQuote({ token }: { token: string }) {
  const [state, setState] = useState<{ status: 'cargando' } | { status: 'ok'; q: ClientQuote } | { status: 'no' } | { status: 'error'; message: string }>({
    status: 'cargando',
  });
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setState({ status: 'no' });
      return;
    }
    fetchPublicQuote(supabase, token).then(
      (q) => setState(q ? { status: 'ok', q } : { status: 'no' }),
      (e: unknown) => setState({ status: 'error', message: e instanceof Error ? e.message : 'Error' }),
    );
  }, [token]);

  return (
    <div className="layout single">
      {state.status === 'cargando' ? <p className="sub">Cargando cotización…</p> : null}
      {state.status === 'no' ? (
        <div className="card">
          <h2 className="sec">Enlace no disponible</h2>
          <p className="sub">Este enlace no existe, venció o fue desactivado. Pide a quien te lo envió uno nuevo.</p>
        </div>
      ) : null}
      {state.status === 'error' ? <p className="warn">{state.message}</p> : null}
      {state.status === 'ok' ? (
        <>
          <div className="toolbar no-print">
            <button type="button" className="btn2" onClick={() => window.print()}>
              Descargar PDF
            </button>
          </div>
          <QuoteDocument q={state.q} />
        </>
      ) : null}
    </div>
  );
}
