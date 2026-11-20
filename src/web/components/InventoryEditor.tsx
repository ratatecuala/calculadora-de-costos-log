import { useId } from 'react';
import { CARGO_HANDLING, CARGO_TEMPLATES, MAX_CARGO_ITEMS, MAX_SUMMARY_CHARS, type CargoHandling } from '../../shared/cargo';
import {
  addItem,
  canAddItem,
  duplicateItem,
  moveItem,
  newDraftItem,
  removeItem,
  resetToCalculatedVolume,
  setDeclaredVolume,
  updateItem,
  validateInventory,
  type DraftItem,
  type InventoryDraft,
} from '../modules/inventoryDraft';
import { NumberField } from './NumberField';

/** T-8 (A-65): los valores por defecto significan «no marcado» y «sin manejo especial declarado». */
export const HANDLING_LABEL: Record<CargoHandling, string> = {
  normal: 'Sin manejo especial declarado',
  pesado: 'Pesado',
  voluminoso: 'Voluminoso',
  requiere2: 'Requiere 2 o más personas',
};

interface Props {
  draft: InventoryDraft;
  onChange: (draft: InventoryDraft) => void;
  /** Genera claves locales para las líneas nuevas. */
  newKey: () => string;
}

/**
 * Editor del inventario de carga (#47, A-66). Solo edita el borrador: no guarda, no se conecta al
 * cotizador y no cambia el precio. Teléfono y PC tienen las mismas funciones (A-49).
 */
export function InventoryEditor({ draft, onChange, newKey }: Props) {
  const { errors } = validateInventory(draft);
  const lleno = !canAddItem(draft);
  const summaryId = useId();
  return (
    <section className="card" aria-labelledby={`${summaryId}-titulo`}>
      <h2 className="sec" id={`${summaryId}-titulo`}>
        Inventario de carga
      </h2>
      <div className="segs" role="group" aria-label="Nivel de detalle">
        {(['rapido', 'detallado'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={draft.mode === m ? 'seg seg-on' : 'seg'}
            aria-pressed={draft.mode === m}
            onClick={() => onChange({ ...draft, mode: m })}
          >
            {m === 'rapido' ? 'Rápido' : 'Detallado'}
          </button>
        ))}
      </div>

      <label className="field" htmlFor={summaryId}>
        <span className="field-label">{draft.mode === 'rapido' ? 'Qué se transporta' : 'Resumen (opcional)'}</span>
        <span className="field-input">
          <input
            id={summaryId}
            value={draft.summary}
            maxLength={MAX_SUMMARY_CHARS + 20}
            placeholder="Ej.: mudanza de departamento pequeño"
            aria-invalid={errors.summary ? true : undefined}
            aria-describedby={errors.summary ? `${summaryId}-error` : undefined}
            onChange={(e) => onChange({ ...draft, summary: e.target.value })}
          />
        </span>
        {errors.summary ? (
          <span id={`${summaryId}-error`} className="field-error">
            {errors.summary}
          </span>
        ) : null}
      </label>

      {draft.mode === 'rapido' ? (
        draft.items.length > 0 ? (
          <p className="sub">
            Tienes {draft.items.length} {draft.items.length === 1 ? 'objeto' : 'objetos'} en el modo detallado. En modo rápido no se usan; vuelve a
            «Detallado» para verlos.
          </p>
        ) : null
      ) : (
        <>
          <div className="row-between">
            <span className="sub" aria-live="polite">
              {draft.items.length} de {MAX_CARGO_ITEMS} líneas
            </span>
          </div>
          <div className="chips" role="group" aria-label="Agregar objeto">
            {CARGO_TEMPLATES.map((t) => (
              <button key={t.kind} type="button" className="btn2 small" disabled={lleno} onClick={() => onChange(addItem(draft, newDraftItem(newKey(), t)))}>
                + {t.label}
              </button>
            ))}
          </div>
          <p className="sub">Las plantillas solo ponen el nombre: no traen pesos ni medidas.</p>
          {lleno ? <p className="warn">Llegaste al máximo de {MAX_CARGO_ITEMS} líneas por cotización.</p> : null}
          <ol className="item-list">
            {draft.items.map((item, i) => (
              <ItemCard
                key={item.key}
                item={item}
                index={i}
                total={draft.items.length}
                errors={errors}
                canDuplicate={!lleno}
                onPatch={(patch) => onChange(updateItem(draft, item.key, patch))}
                onDeclaredVolume={(v) => onChange(setDeclaredVolume(draft, item.key, v))}
                onCalculatedVolume={() => onChange(resetToCalculatedVolume(draft, item.key))}
                onDuplicate={() => onChange(duplicateItem(draft, item.key, newKey()))}
                onRemove={() => onChange(removeItem(draft, item.key))}
                onMove={(d) => onChange(moveItem(draft, item.key, d))}
              />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

interface ItemProps {
  item: DraftItem;
  index: number;
  total: number;
  errors: Record<string, string>;
  canDuplicate: boolean;
  onPatch: (patch: Partial<Omit<DraftItem, 'key' | 'volumeM3' | 'volumeSource'>>) => void;
  onDeclaredVolume: (v: number | null) => void;
  onCalculatedVolume: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}

function ItemCard({ item, index, total, errors, canDuplicate, onPatch, onDeclaredVolume, onCalculatedVolume, onDuplicate, onRemove, onMove }: ItemProps) {
  const id = useId();
  const err = (field: string) => errors[`${item.key}.${field}`];
  const nombre = item.description.trim() || `Línea ${index + 1}`;
  const text = (field: 'kind' | 'description', label: string, max: number) => (
    <label className="field" htmlFor={`${id}-${field}`}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          id={`${id}-${field}`}
          value={item[field]}
          maxLength={max + 10}
          aria-invalid={err(field) ? true : undefined}
          aria-describedby={err(field) ? `${id}-${field}-error` : undefined}
          onChange={(e) => onPatch({ [field]: e.target.value })}
        />
      </span>
      {err(field) ? (
        <span id={`${id}-${field}-error`} className="field-error">
          {err(field)}
        </span>
      ) : null}
    </label>
  );
  return (
    <li className="item-card" aria-label={`Línea ${index + 1}: ${nombre}`}>
      <div className="grid2">
        {text('description', 'Descripción', 80)}
        {text('kind', 'Tipo', 30)}
      </div>
      <div className="grid2">
        <NumberField label="Cantidad" value={item.qty} decimals={0} placeholder="1" error={err('qty')} onChange={(v) => onPatch({ qty: v })} />
        <NumberField label="Peso por unidad" suffix="kg" value={item.unitWeightKg} decimals={1} error={err('unitWeightKg')} onChange={(v) => onPatch({ unitWeightKg: v })} />
      </div>
      <fieldset className="dims">
        <legend className="field-label">Medidas por unidad (cm enteros, opcional)</legend>
        <div className="grid3">
          <NumberField label="Largo" suffix="cm" decimals={0} value={item.l} error={err('l')} onChange={(v) => onPatch({ l: v })} />
          <NumberField label="Ancho" suffix="cm" decimals={0} value={item.w} error={err('w')} onChange={(v) => onPatch({ w: v })} />
          <NumberField label="Alto" suffix="cm" decimals={0} value={item.h} error={err('h')} onChange={(v) => onPatch({ h: v })} />
        </div>
      </fieldset>
      <NumberField
        label="Volumen por unidad"
        suffix="m³"
        decimals={3}
        value={item.volumeM3}
        tag={item.volumeSource === 'calculado' ? 'calculado con las medidas' : item.volumeSource === 'declarado' ? 'declarado por ti' : undefined}
        hint={item.volumeSource === 'declarado' ? undefined : 'Se calcula solo con las tres medidas. Si escribes otro valor, queda como declarado.'}
        error={err('volumeM3') ?? err('volumeSource')}
        onChange={onDeclaredVolume}
      />
      {item.volumeSource === 'declarado' ? (
        <button type="button" className="link-btn" onClick={onCalculatedVolume}>
          Usar el volumen calculado con las medidas
        </button>
      ) : null}
      <div className="grid2">
        <label className="check">
          <input type="checkbox" checked={item.fragile} onChange={(e) => onPatch({ fragile: e.target.checked })} />
          Marcar como frágil
        </label>
        <label className="field" htmlFor={`${id}-handling`}>
          <span className="field-label">Manejo especial</span>
          <span className="field-input">
            <select id={`${id}-handling`} value={item.handling} onChange={(e) => onPatch({ handling: e.target.value as CargoHandling })}>
              {CARGO_HANDLING.map((h) => (
                <option key={h} value={h}>
                  {HANDLING_LABEL[h]}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      <p className="sub">«Frágil» y «manejo especial» son notas para ti: no cambian el costo ni certifican la seguridad de la carga.</p>
      <div className="item-actions">
        <button type="button" className="btn2 small" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Subir ${nombre}`}>
          Subir
        </button>
        <button type="button" className="btn2 small" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Bajar ${nombre}`}>
          Bajar
        </button>
        <button type="button" className="btn2 small" disabled={!canDuplicate} onClick={onDuplicate} aria-label={`Duplicar ${nombre}`}>
          Duplicar
        </button>
        <button type="button" className="btn2 small danger-text" onClick={onRemove} aria-label={`Eliminar ${nombre}`}>
          Eliminar
        </button>
      </div>
    </li>
  );
}
