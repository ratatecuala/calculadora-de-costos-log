import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
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
 * Fila plegable CONTROLADA (fase 1, A-66): a diferencia de `Fold` (etiqueta details nativa), el
 * editor decide cuándo abrirla (p. ej. al agregar un objeto). Cerrar solo oculta: los datos siguen
 * en el borrador.
 *
 * Accesibilidad (auditoría fase 1, P2-1):
 * - el encabezado es un botón con `aria-expanded` y, abierto, `aria-controls` hacia el cuerpo;
 * - el estado se lee también como texto (no solo por color);
 * - si la fila se cierra mientras el foco estaba DENTRO (p. ej. con «Listo»), el foco vuelve al
 *   encabezado en vez de perderse en la página;
 * - Escape dentro del cuerpo cierra la fila y devuelve el foco al encabezado.
 */
export function Disclosure({ title, summary, estado, open, onToggle, label, className = 'disclosure', children }: Props) {
  const id = useId();
  const head = useRef<HTMLButtonElement>(null);
  const focoDentro = useRef(false);
  const estabaAbierta = useRef(open);
  useLayoutEffect(() => {
    if (estabaAbierta.current && !open && focoDentro.current) {
      const activo = document.activeElement;
      // Solo si el foco se perdió al desmontar el cuerpo (no se roba el foco de otro control).
      if (!activo || activo === document.body) head.current?.focus();
    }
    if (!open) focoDentro.current = false;
    estabaAbierta.current = open;
  }, [open]);
  return (
    <div className={`${className}${open ? ' is-open' : ''}`}>
      <button
        ref={head}
        type="button"
        id={`${id}-cabecera`}
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
        <div
          id={`${id}-cuerpo`}
          className="disclosure-body"
          onFocus={() => {
            focoDentro.current = true;
          }}
          onBlur={(e) => {
            // Al desmontarse el control enfocado, relatedTarget es null: se conserva la marca.
            if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) focoDentro.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              focoDentro.current = false;
              onToggle();
              head.current?.focus();
            }
          }}
        >
          {estado && estado.detalle && estado.nivel !== 'completo' ? <p className={estado.nivel === 'error' ? 'field-error' : 'sub'}>{estado.detalle}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
