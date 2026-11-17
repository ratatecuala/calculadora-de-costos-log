import { useEffect, useId, useState } from 'react';
import { parseAmount } from '../format';

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
}

function toText(value: number | null, decimals: number): string {
  if (value === null) return '';
  const f = 10 ** decimals;
  return String(Math.round(value * f) / f).replace('.', ',');
}

/** Campo numérico que acepta «1.050», «12,5» o vacío (= no lo sé). */
export function NumberField({ label, value, onChange, suffix, hint, placeholder, tag, compact, decimals = 2 }: Props) {
  const id = useId();
  const [text, setText] = useState(toText(value, decimals));
  useEffect(() => {
    const parsed = parseAmount(text);
    if (parsed !== value) setText(toText(value, decimals));
    // Solo se sincroniza cuando el valor cambia desde fuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className={compact ? 'field field-compact' : 'field'} htmlFor={id}>
      <span className={compact ? 'visually-hidden' : 'field-label'}>
        {label}
        {tag ? <span className="tag tag-neutral">{tag}</span> : null}
      </span>
      <span className="field-input">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder={placeholder ?? 'No lo sé'}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseAmount(e.target.value));
          }}
        />
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
