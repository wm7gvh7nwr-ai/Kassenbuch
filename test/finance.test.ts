import { describe, expect, it } from 'vitest';
import { budgetFor, compare, entriesOf, levelFor, setBudget, summarize } from '../src/core/finance';
import { changeEntry, cleanNote, makeEntry, validateInput, type Entry } from '../src/core/model';

let n = 0;
function e(date: string, amount: number, note = ''): Entry {
  n++;
  const ts = `2026-01-01T00:00:${String(n % 60).padStart(2, '0')}.${String(n).padStart(3, '0').slice(-3)}Z`;
  return { id: `id-${String(n).padStart(8, '0')}`, date, amount, note, category: null, createdAt: ts, updatedAt: ts };
}

describe('Budget pro Monat', () => {
  const budgets = [
    { from: '2026-09', amount: 150000 },
    { from: '2026-11', amount: 180000 },
  ];

  it('gilt ab dem gesetzten Monat', () => {
    expect(budgetFor(budgets, '2026-09')).toBe(150000);
    expect(budgetFor(budgets, '2026-10')).toBe(150000);
    expect(budgetFor(budgets, '2026-11')).toBe(180000);
    expect(budgetFor(budgets, '2027-05')).toBe(180000);
  });

  it('kein Monat ist ohne Budget: vor dem ersten gilt das erste', () => {
    expect(budgetFor(budgets, '2026-01')).toBe(150000);
  });

  it('ohne Budget: null', () => {
    expect(budgetFor([], '2026-11')).toBeNull();
  });

  it('unabhängig von der Reihenfolge', () => {
    expect(budgetFor([...budgets].reverse(), '2026-10')).toBe(150000);
  });

  it('eine Änderung im November lässt Oktober unverändert', () => {
    const next = setBudget(budgets, '2026-11', 200000);
    expect(budgetFor(next, '2026-10')).toBe(150000);
    expect(budgetFor(next, '2026-11')).toBe(200000);
    expect(next).toHaveLength(2);
  });

  it('erstes Budget im selben Monat ändern: frühere Monate behalten das alte', () => {
    const first = setBudget([], '2026-11', 180000);
    const next = setBudget(first, '2026-11', 200000);
    expect(budgetFor(next, '2026-10')).toBe(180000);
    expect(budgetFor(next, '2026-11')).toBe(200000);
    // nochmals ändern: Oktober bleibt bei 1800
    expect(budgetFor(setBudget(next, '2026-11', 150000), '2026-10')).toBe(180000);
    // gleicher Betrag: nichts ändert sich
    expect(setBudget(first, '2026-11', 180000)).toEqual(first);
  });

  it('erstes Budget', () => {
    expect(setBudget([], '2026-11', 180000)).toEqual([{ from: '2026-11', amount: 180000 }]);
  });

  it('gleicher Betrag erzeugt keinen überflüssigen Eintrag', () => {
    expect(setBudget(budgets, '2026-12', 180000)).toEqual(budgets);
  });

  it('Budget 0 ist erlaubt, negativ nicht', () => {
    expect(budgetFor(setBudget([], '2026-11', 0), '2026-11')).toBe(0);
    expect(() => setBudget([], '2026-11', -1)).toThrow();
    expect(() => setBudget([], '2026-11', 12.5)).toThrow();
  });
});

describe('Verfügbar und Summen', () => {
  const budgets = [{ from: '2026-11', amount: 180000 }];
  const entries = [
    e('2026-11-02', -3460, 'Migros'),
    e('2026-11-25', 235000, 'Lohn'),
    e('2026-11-24', -1900, 'Kino'),
    e('2026-10-31', -99900, 'Oktober zählt nicht'),
    e('2026-12-01', -50000, 'Dezember zählt nicht'),
  ];

  it('Budget minus Ausgaben, Einnahmen zählen nicht ins Budget', () => {
    const s = summarize(entries, budgets, '2026-11');
    expect(s.expenses).toBe(5360);
    expect(s.income).toBe(235000);
    expect(s.available).toBe(180000 - 5360);
    expect(s.level).toBe('ok');
  });

  it('erster und letzter Tag gehören zum Monat', () => {
    const s = summarize([e('2026-11-01', -100), e('2026-11-30', -200), e('2026-12-01', -400)], budgets, '2026-11');
    expect(s.expenses).toBe(300);
  });

  it('negativ, wenn das Budget überschritten ist', () => {
    const s = summarize([e('2026-11-05', -200000)], budgets, '2026-11');
    expect(s.available).toBe(-20000);
    expect(s.level).toBe('over');
  });

  it('leerer Monat', () => {
    const s = summarize([], budgets, '2026-11');
    expect(s).toMatchObject({ expenses: 0, income: 0, available: 180000, level: 'ok' });
  });

  it('ohne Budget: verfügbar = −Ausgaben', () => {
    const s = summarize([e('2026-11-05', -500)], [], '2026-11');
    expect(s.available).toBe(-500);
    expect(s.level).toBe('over');
  });

  it('viele kleine Beträge summieren sich exakt', () => {
    const many = Array.from({ length: 1000 }, () => e('2026-11-10', -10)); // 1000 × CHF 0.10
    expect(summarize(many, budgets, '2026-11').expenses).toBe(10000);
  });
});

describe('Ampel', () => {
  it.each([
    [0, 100000, 'ok'],
    [79999, 100000, 'ok'],
    [80000, 100000, 'warn'],
    [99999, 100000, 'warn'],
    [100000, 100000, 'over'],
    [100001, 100000, 'over'],
    [0, 0, 'ok'],
    [1, 0, 'over'],
    [3, 4, 'ok'], // 75 %
    [4, 5, 'warn'], // genau 80 %
  ])('%i von %i → %s', (exp, budget, level) => {
    expect(levelFor(exp, budget)).toBe(level);
  });
});

describe('Monatsvergleich', () => {
  it('laufender Monat: Vormonat bis zum gleichen Tag', () => {
    const entries = [e('2026-10-03', -1000), e('2026-10-24', -2000), e('2026-10-25', -4000), e('2026-10-12', 50000)];
    expect(compare(entries, '2026-11', '2026-11-24')).toEqual({ month: '2026-10', uptoDay: 24, expenses: 3000 });
  });

  it('31. März wird mit dem 28. Februar verglichen', () => {
    const entries = [e('2026-02-28', -100), e('2026-02-01', -200)];
    expect(compare(entries, '2026-03', '2026-03-31')).toEqual({ month: '2026-02', uptoDay: 28, expenses: 300 });
  });

  it('… und im Schaltjahr mit dem 29. Februar', () => {
    const entries = [e('2028-02-29', -100)];
    expect(compare(entries, '2028-03', '2028-03-31')).toEqual({ month: '2028-02', uptoDay: 29, expenses: 100 });
  });

  it('Januar vergleicht mit Dezember des Vorjahres', () => {
    const entries = [e('2025-12-05', -700)];
    expect(compare(entries, '2026-01', '2026-01-10')).toEqual({ month: '2025-12', uptoDay: 10, expenses: 700 });
  });

  it('vergangener Monat: ganzer Vormonat', () => {
    const entries = [e('2026-09-30', -100), e('2026-09-01', -200)];
    expect(compare(entries, '2026-10', '2026-11-24')).toEqual({ month: '2026-09', uptoDay: null, expenses: 300 });
  });
});

describe('Buchungen', () => {
  const now = new Date('2026-11-24T10:00:00Z');

  it('Ausgabe wird negativ, Einnahme positiv gespeichert', () => {
    expect(makeEntry({ date: '2026-11-24', value: 1250, kind: 'expense', note: 'Kaffee' }, 'abcdefgh', now).amount).toBe(-1250);
    expect(makeEntry({ date: '2026-11-24', value: 1250, kind: 'income', note: '' }, 'abcdefgh', now).amount).toBe(1250);
  });

  it('Ändern behält Kennung und Erstellzeit', () => {
    const a = makeEntry({ date: '2026-11-24', value: 1250, kind: 'expense', note: 'x' }, 'abcdefgh', now);
    const b = changeEntry(a, { date: '2026-11-20', value: 900, kind: 'income', note: 'y' }, new Date('2026-11-25T10:00:00Z'));
    expect(b).toMatchObject({ id: 'abcdefgh', createdAt: a.createdAt, amount: 900, date: '2026-11-20', note: 'y' });
    expect(b.updatedAt).not.toBe(a.updatedAt);
  });

  it('prüft Eingaben', () => {
    expect(validateInput({ date: '2026-11-24', value: 0, kind: 'expense', note: '' })).toMatch(/Betrag/);
    expect(validateInput({ date: '2026-02-30', value: 100, kind: 'expense', note: '' })).toMatch(/Datum/);
    expect(validateInput({ date: '2026-11-24', value: 10_000_000, kind: 'expense', note: '' })).toMatch(/hoch/);
    expect(validateInput({ date: '2026-11-24', value: 100, kind: 'expense', note: '' })).toBeNull();
  });

  it('säubert Notizen', () => {
    expect(cleanNote('  Migros \n\t Oerlikon ')).toBe('Migros Oerlikon');
    expect(cleanNote('a‮b')).toBe('a b');
    expect(Array.from(cleanNote('😀'.repeat(80)))).toHaveLength(60);
  });

  it('Liste: neueste zuerst, nur der Monat', () => {
    const list = entriesOf([e('2026-11-02', -1), e('2026-11-20', -2), e('2026-10-30', -3), e('2026-11-20', -4)], '2026-11');
    expect(list.map((x) => x.amount)).toEqual([-4, -2, -1]);
  });
});
