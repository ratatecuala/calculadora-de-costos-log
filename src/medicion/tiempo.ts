/**
 * Fechas, horas y minutos de la herramienta de medición. Todo se guarda como ISO con el desfase de la
 * zona del dispositivo, de modo que un cambio de día o de horario de verano no altera las diferencias.
 * Los minutos se DERIVAN de los tramos (botones de estado); nunca se tipean.
 */
import type { TipoEvento, Tramo } from './modelo';

const dos = (n: number) => String(n).padStart(2, '0');

/** ISO local con desfase: 2026-11-26T08:30:00.000-03:00. */
export function isoLocal(d: Date = new Date()): string {
  if (Number.isNaN(d.getTime())) throw new Error('Fecha inválida');
  const off = -d.getTimezoneOffset();
  const signo = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return (
    `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}.${ms}` +
    `${signo}${dos(Math.floor(abs / 60))}:${dos(abs % 60)}`
  );
}

/** Zona IANA del dispositivo, o `null` si el navegador no la informa. */
export function zonaDispositivo(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** Valor para `<input type="datetime-local">` (hora local, sin zona). */
export function aInputLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** Del `datetime-local` del usuario a ISO local con desfase. `null` si no es válido. */
export function desdeInputLocal(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : isoLocal(d);
}

/** Fecha local AAAA-MM-DD y hora HH:MM de un ISO (para CSV y pantalla). */
export function fechaDe(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}
export function horaDe(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export type MinutosPorTipo = Record<TipoEvento, number>;

/**
 * Minutos por tipo de tramo. Un tramo abierto se cierra en `fin` (fin del viaje) o, si el viaje sigue
 * abierto, en `ahora`. Un tramo con fin anterior al inicio no suma (se avisa aparte). Cada total se
 * redondea al minuto entero (lo que puede leer un cronómetro).
 */
export function minutosPorTipo(tramos: Tramo[], fin: string | null, ahora: Date = new Date()): MinutosPorTipo {
  const ms: MinutosPorTipo = { marcha: 0, espera: 0, carga: 0, descarga: 0, pausa: 0 };
  const cierre = fin ? Date.parse(fin) : ahora.getTime();
  for (const t of tramos) {
    const a = Date.parse(t.inicio);
    const b = t.fin ? Date.parse(t.fin) : cierre;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) continue;
    ms[t.tipo] += b - a;
  }
  return {
    marcha: Math.round(ms.marcha / 60000),
    espera: Math.round(ms.espera / 60000),
    carga: Math.round(ms.carga / 60000),
    descarga: Math.round(ms.descarga / 60000),
    pausa: Math.round(ms.pausa / 60000),
  };
}

/** Cierra el tramo abierto en `cuando` y abre uno nuevo del tipo pedido (botones de estado). */
export function cambiarTramo(tramos: Tramo[], tipo: TipoEvento, cuando: string): Tramo[] {
  const cerrados = tramos.map((t) => (t.fin === null ? { ...t, fin: cuando } : t));
  return [...cerrados, { tipo, inicio: cuando, fin: null }];
}

/** Cierra el tramo abierto (al finalizar el viaje). */
export function cerrarTramos(tramos: Tramo[], cuando: string): Tramo[] {
  return tramos.map((t) => (t.fin === null ? { ...t, fin: cuando } : t));
}

/** Días completos transcurridos entre un ISO y `ahora`. `null` si no hay fecha. */
export function diasDesde(iso: string | null, ahora: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((ahora.getTime() - t) / 86_400_000));
}
