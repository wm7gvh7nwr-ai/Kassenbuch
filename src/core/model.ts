import { isValidDate, type IsoDate, type Month } from './dates';
import { MAX_AMOUNT } from './money';

export const SCHEMA_VERSION = 1;
export const NOTE_MAX = 60;
export const CATEGORY_MAX = 40;

export interface Entry {
  id: string;
  date: IsoDate;
  /** Rappen, negativ = Ausgabe, positiv = Einnahme, nie 0 */
  amount: number;
  note: string;
  /** In Version 1 immer null. Platz für spätere, selbst benannte Kategorien. */
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  /** Gilt ab diesem Monat, bis ein späterer Eintrag folgt */
  from: Month;
  /** Rappen, ≥ 0 */
  amount: number;
}

export interface Data {
  entries: Entry[];
  budgets: Budget[];
}

/** Steuerzeichen und unsichtbare Richtungszeichen (als Zahlen, damit der Quelltext lesbar bleibt) */
const STRIP_RANGES: Array<[number, number]> = [
  [0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff],
];
const STRIP_RE = new RegExp(
  '[' + STRIP_RANGES.map(([a, b]) => `\\u{${a.toString(16)}}-\\u{${b.toString(16)}}`).join('') + ']',
  'gu',
);

/** Notiz säubern: Steuerzeichen raus, Leerraum zusammenziehen, Länge begrenzen */
export function cleanNote(input: string): string {
  return Array.from(input.replace(STRIP_RE, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, NOTE_MAX)
    .join('')
    .trim();
}

export interface EntryInput {
  date: IsoDate;
  /** Rappen, immer > 0 */
  value: number;
  kind: 'expense' | 'income';
  note: string;
}

export function validateInput(input: EntryInput): string | null {
  if (!isValidDate(input.date)) return 'Bitte ein gültiges Datum wählen.';
  if (!Number.isInteger(input.value) || input.value <= 0) return 'Bitte einen Betrag eingeben.';
  if (input.value > MAX_AMOUNT) return 'Der Betrag ist zu hoch.';
  return null;
}

export function makeEntry(input: EntryInput, id: string, now: Date): Entry {
  const ts = now.toISOString();
  return {
    id,
    date: input.date,
    amount: input.kind === 'expense' ? -input.value : input.value,
    note: cleanNote(input.note),
    category: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function changeEntry(entry: Entry, input: EntryInput, now: Date): Entry {
  return {
    ...entry,
    date: input.date,
    amount: input.kind === 'expense' ? -input.value : input.value,
    note: cleanNote(input.note),
    updatedAt: now.toISOString(),
  };
}
