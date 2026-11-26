import { describe, expect, it } from 'vitest';
import { formatChf, MAX_AMOUNT, parseAmount, toInputString } from '../src/core/money';

describe('parseAmount', () => {
  it.each([
    ['12.50', 1250],
    ['12,5', 1250],
    ['12,50', 1250],
    ['0.05', 5],
    ['0,05', 5],
    ['12', 1200],
    ['12.', 1200],
    ['12.–', 1200],
    ['12.-', 1200],
    ["1'240.50", 124050],
    ['1’240.50', 124050],
    [' 7.80 ', 780],
    ['0.10', 10],
    ['0.1', 10],
    ['99999.99', MAX_AMOUNT],
    ['0', 0],
  ])('«%s» → %i Rappen', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', ' ', 'abc', '-12', '+12', '12.345', '1.2.3', '12,50,1', '100000', '1e3', '0x10', '12 CHF', 'NaN', '.50'])(
    'lehnt «%s» ab',
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );

  it('rechnet ohne Kommazahl-Fehler (0.1 + 0.2)', () => {
    expect(parseAmount('0.10')! + parseAmount('0.20')!).toBe(30);
    // 1.15 * 100 wäre in Gleitkomma 114.99999999999999
    expect(parseAmount('1.15')).toBe(115);
    expect(parseAmount('4.35')).toBe(435);
  });
});

describe('formatChf', () => {
  it.each([
    [124050, '1’240.50'],
    [5, '0.05'],
    [0, '0.00'],
    [100, '1.00'],
    [99999999, '999’999.99'],
    [123456789, '1’234’567.89'],
    [-3460, '−34.60'],
    [-124050, '−1’240.50'],
  ])('%i → %s', (r, s) => expect(formatChf(r)).toBe(s));

  it('zeigt das Vorzeichen auf Wunsch', () => {
    expect(formatChf(235000, { sign: true })).toBe('+2’350.00');
    expect(formatChf(-1250, { sign: true })).toBe('−12.50');
    expect(formatChf(0, { sign: true })).toBe('0.00');
  });

  it('verwendet echtes Minus und typografischen Apostroph', () => {
    expect(formatChf(-100000).startsWith('−')).toBe(true);
    expect(formatChf(100000)).toContain('’');
  });

  it('verweigert Bruchteile von Rappen', () => {
    expect(() => formatChf(12.5)).toThrow();
  });

  it('Eingabe → Anzeige → Eingabe bleibt gleich', () => {
    for (const r of [5, 10, 99, 100, 1250, 124050, MAX_AMOUNT]) {
      expect(parseAmount(toInputString(r))).toBe(r);
      expect(parseAmount(formatChf(r))).toBe(r);
    }
  });
});
