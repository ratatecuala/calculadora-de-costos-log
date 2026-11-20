import { useId, useState } from 'react';
import { CARGO_HANDLING, CARGO_TEMPLATES, MAX_CARGO_ITEMS, MAX_SUMMARY_CHARS, type CargoHandling } from '../../shared/cargo';
import { abrirAlAgregar, alternar, erroresDe, estadoObjeto, resumenObjeto } from '../modules/estado';
import {
  addItem,
  canAddItem,
  discardItems,
  setMode,
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
import { Disclosure } from './Disclosure';
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
 * Editor del inventario de carga (#47, A-66). Cada objeto es una fila compacta (nombre, cantidad y
 * estado) que se despliega para editarla; al agregar uno, se abre solo. Cerrar una fila no borra
 * nada. Son datos de la CARGA, que en una etapa posterior podría informar el cliente (docs/21 §18).
 * Solo edita el borrador: no guarda, no se conecta al cotizador y no cambia el precio.
 */
export function InventoryEditor({ draft, onChange, newKey }: Props) {
  const { errors } = validateInventory(draft);
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set());
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const lleno = !canAddItem(draft);
  const summaryId = useId();
  const tieneErrores = (k: string) => erroresDe(errors, k).length > 0;

  const agregar = (template?: { kind: string; label: string }) => {
    const key = newKey();
    onChange(addItem(draft, newDraftItem(key, template)));
    setAbiertas(abrirAlAgregar(abiertas, key, tieneErrores));
  };
  const duplicar = (from: string) => {
    const key = newKey();
    onChange(duplicateItem(draft, from, key));
    setAbiertas(abrirAlAgregar(abiertas, key, tieneErrores));
  };
  const completos = draft.items.filter((i) => estadoObjeto(i, errors).nivel === 'completo').length;
  const conError = draft.items.filter((i) => tieneErrores(i.key)).length;

  return (
    <section className="card" aria-labelledby={`${summaryId}-titulo`}>
      <div className="row-between">
        <h2 className="sec" id={`${summaryId}-titulo`}>
          Inventario de carga
        </h2>
        <span className="tag tag-client">Datos de la carga</span>
      </div>
      <div className="segs" role="group" aria-label="Nivel de detalle">
        {(['rapido', 'detallado'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={draft.mode === m ? 'seg seg-on' : 'seg'}
            aria-pressed={draft.mode === m}
            onClick={() => {
              setConfirmarDescarte(false);
              onChange(setMode(draft, m));
            }}
          >
            {m === 'rapido' ? 'Rápido' : 'Detallado'}
          </button>
        ))}
      </div>

      <label className="field" htmlFor={summaryId}>
        <span className="field-label">
          {draft.mode === 'rapido' ? 'Qué se transporta' : 'Resumen'} <span className="opt">(opcional)</span>
        </span>
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
          <div className="warn" role="alert" data-testid="conflicto-modo">
            <p>{errors.mode}</p>
            <div className="item-actions">
              <button type="button" className="btn small" onClick={() => onChange(setMode(draft, 'detallado'))}>
                Volver a «Detallado»
              </button>
              {confirmarDescarte ? (
                <>
                  <button
                    type="button"
                    className="btn2 small danger-text"
                    onClick={() => {
                      setConfirmarDescarte(false);
                      onChange(discardItems(draft));
                    }}
                  >
                    Sí, descartar {draft.items.length} {draft.items.length === 1 ? 'objeto' : 'objetos'}
                  </button>
                  <button type="button" className="btn2 small" onClick={() => setConfirmarDescarte(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" className="btn2 small danger-text" onClick={() => setConfirmarDescarte(true)}>
                  Descartar la lista
                </button>
              )}
            </div>
          </div>
        ) : null
      ) : (
        <>
          <p className="sub" aria-live="polite">
            <span className="num">
              {draft.items.length} de {MAX_CARGO_ITEMS} líneas
            </span>
            {draft.items.length ? (
              <>
                {' '}
                · {completos} {completos === 1 ? 'completa' : 'completas'}
                {conError ? <span className="danger-text"> · {conError} por revisar</span> : null}
              </>
            ) : null}
          </p>
          <ol className="item-list">
            {draft.items.map((item, i) => (
              <li key={item.key}>
                <Disclosure
                  className="disclosure item-row"
                  title={
                    <>
                      <span className="item-qty num">{item.qty ?? '?'} ×</span> {item.description.trim() || `Objeto ${i + 1}`}
                    </>
                  }
                  summary={abiertas.has(item.key) ? undefined : resumenObjeto(item)}
                  estado={estadoObjeto(item, errors)}
                  open={abiertas.has(item.key)}
                  onToggle={() => setAbiertas(alternar(abiertas, item.key))}
                >
                  <ItemFields
                    item={item}
                    index={i}
                    total={draft.items.length}
                    errors={errors}
                    canDuplicate={!lleno}
                    onPatch={(patch) => onChange(updateItem(draft, item.key, patch))}
                    onDeclaredVolume={(v) => onChange(setDeclaredVolume(draft, item.key, v))}
                    onCalculatedVolume={() => onChange(resetToCalculatedVolume(draft, item.key))}
                    onDuplicate={() => duplicar(item.key)}
                    onRemove={() => onChange(removeItem(draft, item.key))}
                    onMove={(d) => onChange(moveItem(draft, item.key, d))}
                    onClose={() => setAbiertas(alternar(abiertas, item.key))}
                  />
                </Disclosure>
              </li>
            ))}
          </ol>
          <div className="chips" role="group" aria-label="Agregar objeto">
            {CARGO_TEMPLATES.map((t) => (
              <button key={t.kind} type="button" className="btn2 small" disabled={lleno} onClick={() => agregar(t)}>
                + {t.label}
              </button>
            ))}
          </div>
          <p className="sub">Las plantillas solo ponen el nombre: no traen pesos ni medidas.</p>
          {lleno ? <p className="warn">Llegaste al máximo de {MAX_CARGO_ITEMS} líneas por cotización.</p> : null}
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
  onClose: () => void;
}

function ItemFields({ item, index, total, errors, canDuplicate, onPatch, onDeclaredVolume, onCalculatedVolume, onDuplicate, onRemove, onMove, onClose }: ItemProps) {
  const id = useId();
  const err = (field: string) => errors[`${item.key}.${field}`];
  const nombre = item.description.trim() || `Objeto ${index + 1}`;
  const text = (field: 'kind' | 'description', label: string, max: number, opcional: boolean) => (
    <label className="field" htmlFor={`${id}-${field}`}>
      <span className="field-label">
        {label} {opcional ? <span className="opt">(opcional)</span> : <span className="req">(obligatorio)</span>}
      </span>
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
    <div className="item-fields" role="group" aria-label={`Datos de ${nombre}`}>
      <div className="fields-auto">
        {text('description', 'Descripción', 80, false)}
        <NumberField label="Cantidad (obligatorio)" value={item.qty} decimals={0} placeholder="1" error={err('qty')} onChange={(v) => onPatch({ qty: v })} />
        {text('kind', 'Tipo', 30, true)}
        <NumberField label="Peso por unidad (opcional)" suffix="kg" value={item.unitWeightKg} decimals={1} error={err('unitWeightKg')} onChange={(v) => onPatch({ unitWeightKg: v })} />
      </div>
      <fieldset className="dims">
        <legend className="field-label">
          Medidas por unidad, en cm enteros <span className="opt">(opcional)</span>
        </legend>
        <div className="grid3">
          <NumberField label="Largo" suffix="cm" decimals={0} value={item.l} error={err('l')} onChange={(v) => onPatch({ l: v })} />
          <NumberField label="Ancho" suffix="cm" decimals={0} value={item.w} error={err('w')} onChange={(v) => onPatch({ w: v })} />
          <NumberField label="Alto" suffix="cm" decimals={0} value={item.h} error={err('h')} onChange={(v) => onPatch({ h: v })} />
        </div>
      </fieldset>
      <div className="fields-auto">
        <div className="field-stack">
          <NumberField
            label="Volumen por unidad (opcional)"
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
        </div>
        <label className="field" htmlFor={`${id}-handling`}>
          <span className="field-label">
            Manejo especial <span className="opt">(opcional)</span>
          </span>
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
        <label className="check">
          <input type="checkbox" checked={item.fragile} onChange={(e) => onPatch({ fragile: e.target.checked })} />
          Marcar como frágil <span className="opt">(opcional)</span>
        </label>
      </div>
      <p className="sub">«Frágil» y «manejo especial» son notas para ti: no cambian el costo ni certifican la seguridad de la carga.</p>
      <div className="item-actions">
        <button type="button" className="btn small" onClick={onClose} aria-label={`Listo, cerrar ${nombre}`}>
          Listo
        </button>
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
    </div>
  );
}
