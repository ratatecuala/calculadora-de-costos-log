/**
 * Objetivos EXPLORATORIOS de #12 (A-91, orientativos, no bloquean): MAPE ≤ 5 %, ≥ 90 % de los viajes dentro
 * de ±10 %, cero subestimaciones mayores al 10 %, partidas aplicables respaldadas y cero datos inventados.
 *
 * Solo se resume lo que ya entregó el contrato de #55 por viaje (`conciliacionIndependiente.totalComparable`,
 * diferencia = previsto − referencia, porcentaje sobre la referencia). No hay fórmulas de costo aquí y el
 * resultado NUNCA es una aprobación ni una certificación: los criterios estadísticos siguen por aprobar.
 */
import type { Informe } from './campo';

export const OBJETIVOS_12 = {
  mapeMaximoPct: 5,
  dentroDeDiezMinimoPct: 90,
  subestimacionesMayoresADiez: 0,
} as const;

export const LEYENDA_OBJETIVOS = 'Objetivos exploratorios de #12: orientativos, no son una aprobación ni una certificación.' as const;

export interface ResumenObjetivos {
  /** Viajes cerrados revisados. */
  revisados: number;
  /** Denominador: viajes con total comparable (todas las partidas aplicables respaldadas, base y cronología verificables). */
  denominador: number;
  /** Viajes sin total comparable, con su motivo. */
  incompletos: { codigo: string; motivo: string }[];
  /** Media de |error %|. `null` sin denominador. */
  mapePct: number | null;
  /** % de viajes con |error| ≤ 10 %. */
  dentroDeDiezPct: number | null;
  /** Viajes con error < −10 % (subestimación mayor al 10 %). */
  subestimacionesMayoresADiez: number;
  /** Sesgo: media del error % con signo (negativo = subestima). */
  sesgoPct: number | null;
  /** Viajes con referencia 0: no tienen porcentaje; se informa el error en CLP. */
  errorClpReferenciaCero: { codigo: string; diferenciaClp: number }[];
}

export function resumenObjetivos(casos: { codigo: string; informe: Informe | null; error?: string | null }[]): ResumenObjetivos {
  const pcts: number[] = [];
  const incompletos: ResumenObjetivos['incompletos'] = [];
  const cero: ResumenObjetivos['errorClpReferenciaCero'] = [];
  for (const c of casos) {
    const ci = c.informe?.conciliacionIndependiente;
    const t = ci?.totalComparable ?? null;
    if (!ci || !t || t.diferencia === null) {
      incompletos.push({ codigo: c.codigo, motivo: c.error ?? (ci ? [...ci.motivos, ...ci.faltan.map((k) => `falta ${k}`)].join('; ') || 'sin total comparable' : 'sin informe') });
      continue;
    }
    if (t.referencia === 0) {
      cero.push({ codigo: c.codigo, diferenciaClp: t.diferencia });
      continue;
    }
    if (t.porcentaje === null) {
      incompletos.push({ codigo: c.codigo, motivo: 'sin porcentaje' });
      continue;
    }
    pcts.push(t.porcentaje);
  }
  const n = pcts.length;
  const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    revisados: casos.length,
    denominador: n,
    incompletos,
    mapePct: media(pcts.map(Math.abs)),
    dentroDeDiezPct: n ? (pcts.filter((p) => Math.abs(p) <= 10).length / n) * 100 : null,
    subestimacionesMayoresADiez: pcts.filter((p) => p < -10).length,
    sesgoPct: media(pcts),
    errorClpReferenciaCero: cero,
  };
}
