/**
 * Reglas puras de la integración I-1 (A-68, docs/22 v2). Sin React, probables con Vitest.
 *
 * - Avisos anti-duplicado (§1, D-I1): los campos actuales del cotizador son la ÚNICA fuente del
 *   costo; el detalle de recursos solo informa. Si difieren, se avisa; nunca se corrige solo.
 * - Texto «Incluye» (§3, D-I5): mismo valor predeterminado de hoy; con la flag, una casilla
 *   explícita decide si se indica la cantidad de ayudantes. El número sale SIEMPRE del campo de
 *   costo «Ayudantes», nunca del detalle interno del editor de recursos.
 */
import { formatClp } from '../../engine/rounding';
import type { TripParams } from '../../engine/inputs';
import { handlingTime, helperCostLines, resourcesSummary } from '../../shared/resources';
import { validateInventory, type InventoryDraft } from './inventoryDraft';
import { asResourcesLike, validateResources, type ResourcesDraft } from './resourcesDraft';

/**
 * ¿El detalle impide emitir? (D-I3) Devuelve el primer motivo, o `null`. Incluye «Rápido» con una
 * lista sin decidir (la regla de `validateInventory`).
 */
export function bloqueoEmision(cargo: InventoryDraft, resources: ResourcesDraft): string | null {
  const inv = validateInventory(cargo);
  if (!inv.inventory) return Object.values(inv.errors)[0] ?? 'Hay datos por corregir en el detalle de carga.';
  const res = validateResources(resources);
  if (!res.resources) return Object.values(res.errors)[0] ?? 'Hay datos por corregir en los accesos o recursos.';
  return null;
}

export interface AvisoDuplicado {
  id: 'ayudantes' | 'tiempos' | 'equipamiento';
  texto: string;
}

const ayudantes = (n: number) => `${n} ${n === 1 ? 'ayudante' : 'ayudantes'}`;

export function avisosDuplicado(params: TripParams, resources: ResourcesDraft): AvisoDuplicado[] {
  const avisos: AvisoDuplicado[] = [];
  const r = asResourcesLike(resources);

  if (r.helpers.length > 0) {
    const lines = helperCostLines(r);
    const todosOk = lines.every((l) => l.status === 'ok');
    const suma = lines.reduce((a, l) => a + (l.amount ?? 0), 0);
    const costo = params.helpers === 0 ? 0 : params.helperFee === null ? null : params.helpers * params.helperFee;
    const distinto = lines.length !== params.helpers || (todosOk && costo !== null && suma !== costo);
    if (distinto) {
      const usa = params.helpers === 0 ? 'no incluye ayudantes' : `usa ${params.helpers} × ${params.helperFee === null ? 'pago sin dato' : formatClp(params.helperFee)}`;
      avisos.push({
        id: 'ayudantes',
        texto: `El costo ${usa}; tu detalle tiene ${ayudantes(lines.length)}${todosOk ? ` y suma ${formatClp(suma)}` : ''}. No se suma dos veces: si corresponde, ajusta «Ayudantes» y «Pago por ayudante».`,
      });
    }
  }

  const ht = handlingTime(r);
  if (ht.minutes !== null && ht.minutes !== params.loadMinutes) {
    avisos.push({
      id: 'tiempos',
      texto: `El costo usa ${params.loadMinutes} min de carga y descarga; tu detalle ${ht.complete ? 'suma' : 'suma al menos'} ${ht.minutes} min. No se suma dos veces: si corresponde, ajusta «Carga y descarga».`,
    });
  }

  if (r.equipment.length > 0) {
    const s = resourcesSummary(r);
    if (s.equipmentKnownTotal > params.otherCosts) {
      avisos.push({
        id: 'equipamiento',
        texto: `Tu equipamiento suma ${formatClp(s.equipmentKnownTotal)}, más que «Otros gastos» (${formatClp(params.otherCosts)}). El detalle no entra al costo: si debe cobrarse, inclúyelo en «Otros gastos».`,
      });
    }
  }
  return avisos;
}

/** Texto «Incluye» de hoy (flag apagada): el valor predeterminado no cambia. */
export function includesPorDefecto(helpers: number): string {
  return helpers > 0 ? `Carga y descarga, ${helpers} ayudante(s)` : 'Carga y descarga';
}

/** Con la flag: la casilla decide si se indica la cantidad (tomada del campo de costo). */
export function includesSegunCasilla(helpers: number, indicarAyudantes: boolean): string {
  return indicarAyudantes && helpers > 0 ? includesPorDefecto(helpers) : 'Carga y descarga';
}

/**
 * Cambiar la casilla reemplaza el texto SOLO si sigue siendo uno de los textos automáticos; si el
 * usuario lo editó a mano, se conserva (y se le avisa que ajuste la mención a mano).
 */
export function alternarIncluye(actual: string, helpers: number, indicarAyudantes: boolean): { texto: string; editadoAMano: boolean } {
  const automaticos = new Set([includesSegunCasilla(helpers, true), includesSegunCasilla(helpers, false)]);
  if (!automaticos.has(actual)) return { texto: actual, editadoAMano: true };
  return { texto: includesSegunCasilla(helpers, indicarAyudantes), editadoAMano: false };
}
