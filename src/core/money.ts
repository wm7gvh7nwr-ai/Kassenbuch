/**
 * Beträge werden überall als ganze Zahl in Rappen geführt.
 * Ausgaben sind negativ, Einnahmen positiv. Nie Kommazahlen rechnen.
 */

/** Grösster Betrag einer einzelnen Buchung bzw. eines Budgets: CHF 99'999.99 */
export const MAX_AMOUNT = 9_999_999;

const APOSTROPHE = '’'; // ’ wie in der Schweiz üblich
const MINUS = '−'; // echtes Minuszeichen

/**
 * Liest eine Eingabe wie «12.50», «12,5», «0.05», «1'240.50» oder «12.–».
 * Gibt Rappen (immer ≥ 0) zurück oder null, wenn die Eingabe ungültig ist.
 * Das Vorzeichen kommt nie aus dem Text, sondern aus «Ausgabe/Einnahme».
 */
export function parseAmount(input: string): number | null {
  const s = input
    .trim()
    .replace(/[\s'’]/g, '') // Tausender-Trenner und Leerzeichen
    .replace(/[.,][-–—]$/, ''); // «12.–»
  const m = /^(\d{1,7})(?:[.,](\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const francs = Number(m[1]);
  const cents = Number((m[2] ?? '').padEnd(2, '0'));
  const value = francs * 100 + cents;
  if (!Number.isSafeInteger(value) || value > MAX_AMOUNT) return null;
  return value;
}

/** 124050 → «1’240.50»; mit sign: «−1’240.50» bzw. «+1’240.50» */
export function formatChf(rappen: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isInteger(rappen)) throw new TypeError('Betrag muss in ganzen Rappen sein');
  const abs = Math.abs(rappen);
  const francs = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, APOSTROPHE);
  const cents = (abs % 100).toString().padStart(2, '0');
  const body = `${francs}.${cents}`;
  if (rappen < 0) return MINUS + body;
  if (opts.sign && rappen > 0) return '+' + body;
  return body;
}

/** Für das Eingabefeld beim Ändern einer Buchung: 1250 → «12.50», 1200 → «12» */
export function toInputString(rappen: number): string {
  const abs = Math.abs(rappen);
  const cents = abs % 100;
  return cents === 0 ? String(abs / 100) : `${Math.floor(abs / 100)}.${String(cents).padStart(2, '0')}`;
}
