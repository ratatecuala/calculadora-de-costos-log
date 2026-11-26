import { useEffect, useId, useState } from 'react';
import { formatInputNumber, invalidAmountText, parseAmount } from '../format';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  hint?: string;
  placeholder?: string;
  /** Muestra «declarado por ti» cuando el valor difiere del original. */
  tag?: string;
  compact?: boolean;
  /** Decimales a MOSTRAR (el valor interno no se redondea). */
  decimals?: number;
  /** Mensaje de validación: se asocia al campo (aria-invalid y aria-describedby). */
  error?: string;
  /**
   * A-73: si se indica, un texto que NO es un número se informa aquí (y `null` cuando vuelve a ser
   * válido o vacío) y NO llama a `onChange`: el valor anterior no se reemplaza por vacío ni por 0.
   */
  onInvalidText?: (text: string | null) => void;
  /** A-73: texto inválido registrado fuera del campo (p. ej., recuperado de un borrador): se muestra tal cual. */
  invalidText?: string;
}

/** A-71: un valor enorme (p. ej., recuperado de un borrador) se muestra en notación corta, no con cientos de dígitos. */
const toText = (value: number | null, decimals: number) =>
  value !== null && Math.abs(value) >= Number.MAX_SAFE_INTEGER ? String(value) : formatInputNumber(value, decimals);

/** Campo numérico que acepta «1.050», «12,5» o vacío (= no lo sé). */
export function NumberField({ label, value, onChange, suffix, hint, placeholder, tag, compact, decimals = 2, error, onInvalidText, invalidText }: Props) {
  const id = useId();
  const [localText, setText] = useState(invalidText ?? toText(value, decimals));
  // A-73: un texto inválido registrado fuera (borrador recuperado) se muestra desde el PRIMER render, sin
  // parpadeo, mientras lo escrito en el campo no sea a su vez un texto inválido.
  const text = invalidText !== undefined && invalidAmountText(localText) === null ? invalidText : localText;
  // Un texto escrito que no es un número válido se avisa en el campo (A-50): no se confunde con «No lo sé».
  const shownError = error ?? invalidAmountText(text) ?? undefined;
  // Nombre accesible = etiqueta + unidad; la ayuda y el error van como descripción (QA UX, H-07).
  const labelledBy = [`${id}-etiqueta`, suffix ? `${id}-unidad` : null].filter(Boolean).join(' ');
  const describedBy = [shownError ? `${id}-error` : null, hint ? `${id}-ayuda` : null].filter(Boolean).join(' ') || undefined;
  useEffect(() => {
    if (invalidText !== undefined) return; // A-73: el texto inválido registrado manda
    const parsed = parseAmount(localText);
    if (parsed !== value) setText(toText(value, decimals));
    // Solo se sincroniza cuando el valor cambia desde fuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    // A-73: un texto inválido registrado desde fuera (borrador recuperado) se muestra literalmente; si se
    // borró desde fuera mientras el campo mostraba un texto inválido, vuelve el valor vigente.
    if (invalidText !== undefined) {
      if (invalidText !== localText) setText(invalidText);
    } else if (onInvalidText && invalidAmountText(localText) !== null) {
      setText(toText(value, decimals));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidText]);
  return (
    <label className={compact ? 'field field-compact' : 'field'} htmlFor={id}>
      <span id={`${id}-etiqueta`} className={compact ? 'visually-hidden' : 'field-label'}>
        {label}
        {tag ? <span className="tag tag-neutral">{tag}</span> : null}
      </span>
      <span className="field-input">
        <input
          id={id}
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          aria-invalid={shownError ? true : undefined}
          inputMode="decimal"
          value={text}
          placeholder={placeholder ?? 'No lo sé'}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            if (onInvalidText) {
              if (invalidAmountText(raw) !== null) {
                onInvalidText(raw);
                return;
              }
              onInvalidText(null);
            }
            onChange(parseAmount(raw));
          }}
          onBlur={() => {
            // Al salir del campo se muestra con separador de miles. Un texto ilegible no se borra y
            // tampoco se reformatea si mostrarlo redondeado ocultaría decimales escritos.
            // A-71: un valor enorme (p. ej., 1e308) se deja tal como se escribió, con su error a la vista.
            if (invalidAmountText(text) !== null) return; // A-73: el texto inválido se conserva
            const formatted = toText(value, decimals);
            if (value !== null && Math.abs(value) < Number.MAX_SAFE_INTEGER && parseAmount(formatted) === value) setText(formatted);
          }}
        />
        {suffix ? (
          <span id={`${id}-unidad`} className="field-suffix">
            {suffix}
          </span>
        ) : null}
      </span>
      {/* A-50/A-73: un texto inválido se anuncia siempre como alerta, venga el mensaje de donde venga. */}
      {shownError ? (
        <span id={`${id}-error`} className="field-error" role={error && invalidAmountText(text) === null ? undefined : 'alert'}>
          {shownError}
        </span>
      ) : null}
      {hint ? (
        <span id={`${id}-ayuda`} className="field-hint">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
