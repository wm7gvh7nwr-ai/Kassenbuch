/**
 * Datumslogik ohne Zeitzonen-Fallen: Buchungen speichern ein reines
 * Kalenderdatum «JJJJ-MM-TT», Monate «JJJJ-MM». Nur «heute» hängt von der Uhr
 * ab und wird immer in Europe/Zurich bestimmt.
 */

export const TIMEZONE = 'Europe/Zurich';

export type IsoDate = string; // JJJJ-MM-TT
export type Month = string; // JJJJ-MM

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isValidDate(s: unknown): s is IsoDate {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(`${m[1]}-${m[2]}`);
}

export function isValidMonth(s: unknown): s is Month {
  if (typeof s !== 'string') return false;
  const m = MONTH_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]);
  return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12;
}

/** Heutiges Datum in Zürich, unabhängig von der Zeitzone des Geräts */
export function today(now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

export function dayOf(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

export function daysInMonth(month: Month): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: Month, n: number): Month {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Datum im Monat, Tag auf das Monatsende begrenzt (31. → 28./29./30.) */
export function dateInMonth(month: Month, day: number): IsoDate {
  const d = Math.min(Math.max(1, day), daysInMonth(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
const MONTH_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

/** «November 2026» */
export function monthLabel(month: Month): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** «Oktober» */
export function monthName(month: Month): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? '';
}

/** «24. Nov.» */
export function shortDate(date: IsoDate): string {
  return `${dayOf(date)}. ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]}`;
}
