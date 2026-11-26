import { describe, expect, it } from 'vitest';
import { keypadDisplay, pressKey, type Key } from '../src/core/keypad';
import { parseAmount } from '../src/core/money';

const type = (keys: string, start = ''): string =>
  [...keys].reduce((s, k) => pressKey(s, (k === '<' ? 'back' : k) as Key), start);

describe('Zifferntastatur', () => {
  it.each([
    ['1250', '1250'],
    ['12.5', '12.5'],
    ['12.50', '12.50'],
    ['12.505', '12.50'], // höchstens 2 Nachkommastellen
    ['12..5', '12.5'], // nur ein Punkt
    ['.5', '0.5'],
    ['007', '7'], // keine führenden Nullen
    ['0.05', '0.05'],
    ['123456', '12345'], // höchstens 5 Stellen
    ['99999.99', '99999.99'],
    ['12<', '1'],
    ['12.5<<', '12'],
    ['<', ''],
  ])('%s → %s', (keys, result) => {
    expect(type(keys)).toBe(result);
  });

  it('jede erreichbare Eingabe ist ein gültiger Betrag', () => {
    const keys: Key[] = ['0', '1', '5', '9', '.', 'back'];
    const seen = new Set<string>(['']);
    let frontier = [''];
    for (let depth = 0; depth < 8; depth++) {
      const next: string[] = [];
      for (const s of frontier)
        for (const k of keys) {
          const r = pressKey(s, k);
          if (!seen.has(r)) {
            seen.add(r);
            next.push(r);
          }
        }
      frontier = next;
    }
    for (const s of seen) if (s !== '') expect(parseAmount(s), s).not.toBeNull();
  });

  it('Anzeige', () => {
    expect(keypadDisplay('')).toBe('0');
    expect(keypadDisplay('12.')).toBe('12.');
  });
});
