/**
 * Estado del editor de inventario (#47, A-66): funciones puras, sin React, para probarlas sin
 * navegador. El borrador admite datos incompletos mientras se escribe; `validateInventory` lo
 * convierte en un `CargoInventory` válido o devuelve los errores por línea y campo.
 */
import {
  MAX_CARGO_ITEMS,
  MAX_DIM_CM,
  cargoInventorySchema,
  volumeFromDims,
  type CargoHandling,
  type CargoInventory,
} from '../../shared/cargo';

export interface DraftItem {
  /** Clave local para la interfaz (no se guarda: la posición es el orden de la lista). */
  key: string;
  kind: string;
  description: string;
  qty: number | null;
  unitWeightKg: number | null;
  l: number | null;
  w: number | null;
  h: number | null;
  volumeM3: number | null;
  volumeSource: 'calculado' | 'declarado' | null;
  /** T-8 (A-65): false = «no marcado como frágil». */
  fragile: boolean;
  /** T-8 (A-65): 'normal' = «sin manejo especial declarado». */
  handling: CargoHandling;
}

export interface InventoryDraft {
  mode: 'rapido' | 'detallado';
  summary: string;
  items: DraftItem[];
}

export const emptyInventoryDraft = (): InventoryDraft => ({ mode: 'detallado', summary: '', items: [] });

export function newDraftItem(key: string, template?: { kind: string; label: string }): DraftItem {
  return {
    key,
    kind: template?.kind ?? 'otro',
    description: template?.label ?? '',
    qty: 1,
    unitWeightKg: null,
    l: null,
    w: null,
    h: null,
    volumeM3: null,
    volumeSource: null,
    fragile: false,
    handling: 'normal',
  };
}

const medidaValida = (v: number | null): v is number => v !== null && Number.isInteger(v) && v >= 1 && v <= MAX_DIM_CM;

/**
 * Recalcula el volumen cuando NO fue declarado a mano: con las tres medidas válidas se calcula con
 * la misma regla que el servidor (`volumeFromDims`); si falta alguna, queda sin volumen.
 */
export function withRecalculatedVolume(item: DraftItem): DraftItem {
  if (item.volumeSource === 'declarado') return item;
  if (medidaValida(item.l) && medidaValida(item.w) && medidaValida(item.h)) {
    const v = volumeFromDims({ l: item.l, w: item.w, h: item.h });
    return v > 0 ? { ...item, volumeM3: v, volumeSource: 'calculado' } : { ...item, volumeM3: null, volumeSource: null };
  }
  return { ...item, volumeM3: null, volumeSource: null };
}

type ItemPatch = Partial<Omit<DraftItem, 'key' | 'volumeM3' | 'volumeSource'>>;

/** Cambia campos de una línea. Si cambia una medida, el volumen calculado se actualiza solo. */
export function updateItem(draft: InventoryDraft, key: string, patch: ItemPatch): InventoryDraft {
  return {
    ...draft,
    items: draft.items.map((it) => (it.key === key ? withRecalculatedVolume({ ...it, ...patch }) : it)),
  };
}

/** Volumen escrito a mano: queda como «declarado». Vacío vuelve al cálculo por medidas. */
export function setDeclaredVolume(draft: InventoryDraft, key: string, volume: number | null): InventoryDraft {
  return {
    ...draft,
    items: draft.items.map((it) => {
      if (it.key !== key) return it;
      if (volume === null) return withRecalculatedVolume({ ...it, volumeSource: null, volumeM3: null });
      return { ...it, volumeM3: volume, volumeSource: 'declarado' };
    }),
  };
}

/** Descarta el volumen declarado y vuelve a calcularlo con las medidas. */
export function resetToCalculatedVolume(draft: InventoryDraft, key: string): InventoryDraft {
  return setDeclaredVolume(draft, key, null);
}

export const canAddItem = (draft: InventoryDraft) => draft.items.length < MAX_CARGO_ITEMS;

export function addItem(draft: InventoryDraft, item: DraftItem): InventoryDraft {
  if (!canAddItem(draft)) return draft;
  return { ...draft, items: [...draft.items, item] };
}

export function duplicateItem(draft: InventoryDraft, key: string, newKey: string): InventoryDraft {
  const i = draft.items.findIndex((it) => it.key === key);
  if (i < 0 || !canAddItem(draft)) return draft;
  const items = [...draft.items];
  items.splice(i + 1, 0, { ...draft.items[i]!, key: newKey });
  return { ...draft, items };
}

export function removeItem(draft: InventoryDraft, key: string): InventoryDraft {
  return { ...draft, items: draft.items.filter((it) => it.key !== key) };
}

export function moveItem(draft: InventoryDraft, key: string, delta: -1 | 1): InventoryDraft {
  const i = draft.items.findIndex((it) => it.key === key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= draft.items.length) return draft;
  const items = [...draft.items];
  [items[i], items[j]] = [items[j]!, items[i]!];
  return { ...draft, items };
}

/** Línea del borrador en la forma del contrato (`CargoItem`), sin la clave local. */
export function toItemInput(item: DraftItem): Record<string, unknown> {
  const sinMedidas = item.l === null && item.w === null && item.h === null;
  return {
    kind: item.kind,
    description: item.description,
    qty: item.qty,
    unitWeightKg: item.unitWeightKg,
    dimsCm: sinMedidas ? null : { l: item.l, w: item.w, h: item.h },
    volumeM3: item.volumeM3,
    volumeSource: item.volumeSource,
    fragile: item.fragile,
    handling: item.handling,
  };
}

export interface InventoryValidation {
  /** Inventario válido, o `null` si hay errores. En modo rápido las líneas no se incluyen. */
  inventory: CargoInventory | null;
  /** Errores por `clave.campo` (p. ej. `k3.l`, `k3.volumeM3`) o `summary` / `items`. */
  errors: Record<string, string>;
}

const FIELD_OF: Record<string, string> = { dimsCm: 'l' };

/** Valida el borrador con el esquema del contrato y ubica cada error en su línea y campo. */
export function validateInventory(draft: InventoryDraft): InventoryValidation {
  const items = draft.mode === 'detallado' ? draft.items : [];
  const parsed = cargoInventorySchema.safeParse({ mode: draft.mode, summary: draft.summary, items: items.map(toItemInput) });
  if (parsed.success) return { inventory: parsed.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const [first, index, field, sub] = issue.path;
    let key: string;
    if (first === 'items' && typeof index === 'number') {
      const itemKey = items[index]?.key ?? String(index);
      const campo = field === 'dimsCm' && typeof sub === 'string' ? sub : FIELD_OF[String(field)] ?? String(field ?? 'item');
      key = `${itemKey}.${campo}`;
    } else {
      key = String(first ?? 'items');
    }
    errors[key] ??= issue.message;
  }
  return { inventory: null, errors };
}
