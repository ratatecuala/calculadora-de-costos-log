import { useState } from 'react';
import { haceCuanto, type StoredDraft } from '../draftStore';

interface Props {
  draft: StoredDraft;
  onRecover: () => void;
  onDiscard: () => void;
  /** Ya hay algo escrito en la cotización actual: recuperar lo reemplazaría. */
  reemplaza?: boolean;
}

/**
 * Oferta de recuperar el borrador sin emitir (I-1b). Nunca se carga solo: el usuario elige.
 * Descartar pide confirmación porque borra el trabajo guardado.
 */
export function DraftBanner({ draft, onRecover, onDiscard, reemplaza = false }: Props) {
  const [confirmar, setConfirmar] = useState(false);
  const objetos = draft.data.cargo.items.length;
  const destino = draft.data.inputs.destination.trim() || draft.data.inputs.origin.trim();
  return (
    <div className="notice migration no-print" role="status" data-testid="oferta-borrador">
      <span>
        Tienes un borrador sin emitir de {haceCuanto(draft.savedAt)}
        {destino ? ` (${destino})` : ''}
        {objetos ? `, con ${objetos} ${objetos === 1 ? 'objeto' : 'objetos'}` : ''}. ¿Quieres recuperarlo?
        {reemplaza ? ' Recuperarlo reemplaza lo que escribiste después.' : ''}
      </span>
      <span className="row-gap">
        {confirmar ? (
          <>
            <button type="button" className="btn2 small danger-text" onClick={onDiscard}>
              Sí, descartar el borrador
            </button>
            <button type="button" className="btn2 small" onClick={() => setConfirmar(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn small" onClick={onRecover}>
              Recuperar
            </button>
            <button type="button" className="btn2 small" onClick={() => setConfirmar(true)}>
              Descartar
            </button>
          </>
        )}
      </span>
    </div>
  );
}
