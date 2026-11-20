import { useId, type ReactNode } from 'react';
import type { Estado } from '../modules/estado';

const TAG_CLASS: Record<Estado['nivel'], string> = {
  error: 'tag tag-missing',
  faltan: 'tag tag-warn',
  completo: 'tag tag-ok',
};

interface Props {
  /** Nombre visible de la fila. */
  title: ReactNode;
  /** Resumen de una línea, visible también con la fila cerrada. */
  summary?: ReactNode;
  estado?: Estado;
  open: boolean;
  onToggle: () => void;
  /** Texto accesible del botón (por defecto, el título). */
  label?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Fila plegable CONTROLADA (fase 1, A-66): a diferencia de `Fold` (etiqueta details nativa), el editor decide cuándo
 * abrirla (p. ej. al agregar un objeto). Cerrar solo oculta: los datos siguen en el borrador.
 * El botón expone `aria-expanded` y `aria-controls`; el estado se lee también como texto.
 */
export function Disclosure({ title, summary, estado, open, onToggle, label, className = 'disclosure', children }: Props) {
  const id = useId();
  return (
    <div className={`${className}${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="disclosure-head"
        aria-expanded={open}
        aria-controls={open ? `${id}-cuerpo` : undefined}
        aria-label={label}
        onClick={onToggle}
      >
        <span className="disclosure-main">
          <span className="disclosure-title">{title}</span>
          {summary ? <span className="disclosure-summary">{summary}</span> : null}
        </span>
        <span className="disclosure-side">
          {estado ? (
            <span className={TAG_CLASS[estado.nivel]} title={estado.detalle || undefined}>
              {estado.etiqueta}
            </span>
          ) : null}
          <span className="disclosure-chevron" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </span>
      </button>
      {open ? (
        <div id={`${id}-cuerpo`} className="disclosure-body">
          {estado && estado.detalle && estado.nivel !== 'completo' ? <p className={estado.nivel === 'error' ? 'field-error' : 'sub'}>{estado.detalle}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
