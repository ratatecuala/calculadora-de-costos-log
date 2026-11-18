import { useState, type ReactNode } from 'react';

interface Props {
  summary: ReactNode;
  /** Estado inicial. Después lo decide solo el usuario: escribir en el formulario no lo abre ni lo cierra. */
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}

/**
 * Sección plegable (QA UX, H-02 y H-04).
 * - No se controla con datos del formulario: antes «Tus datos» se cerraba al escribir la primera
 *   letra del nombre comercial y «Base y regreso» al desmarcar una casilla.
 * - El contenido va en `.fold-body`, porque Chromium no aplica flex/gap al contenido de <details>.
 */
export function Fold({ summary, defaultOpen = false, className = 'fold', summaryClassName, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={summaryClassName}>{summary}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
