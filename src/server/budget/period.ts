/**
 * Período de conteo. Se usa la zona America/Los_Angeles para alinearse con el mes
 * de facturación de Google Cloud [por verificar en la consola]. Si el corte real
 * difiere unas horas, el ritmo diario acotado limita el desfase.
 */
export const BILLING_TIME_ZONE = 'America/Los_Angeles';

export interface PeriodKeys {
  month: string; // AAAA-MM
  day: string; // AAAA-MM-DD
  dayOfMonth: number;
  daysInMonth: number;
}

export function periodKeys(now: Date, timeZone: string = BILLING_TIME_ZONE): PeriodKeys {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return { month: `${year}-${mm}`, day: `${year}-${mm}-${dd}`, dayOfMonth: day, daysInMonth };
}
