import { describe, expect, it } from 'vitest';
import { makeEntry, type Entry, type Pot, type PotBudget } from '../src/core/model';
import {
  activePots, addPot, cleanPotName, nextColor, potBudgetFor, potBudgetTotal, potSummaries, removePot, updatePot, validatePot,
} from '../src/core/pots';

const now = new Date('2026-11-26T10:00:00.000Z');
let n = 0;
const id = () => `pot-${String(++n).padStart(8, '0')}`;
const spend = (date: string, value: number, category: string | null): Entry =>
  makeEntry({ date, value, kind: 'expense', note: '', category }, id(), now);

function setup() {
  let pots: Pot[] = [];
  let pb: PotBudget[] = [];
  const a = addPot(pots, pb, { name: 'Essen', amount: 40000 }, id(), '2026-11', now);
  pots = a.pots; pb = a.potBudgets;
  const b = addPot(pots, pb, { name: '  Freizeit  ', amount: 15000 }, id(), '2026-11', now);
  pots = b.pots; pb = b.potBudgets;
  return { pots, pb, essen: a.pot, freizeit: b.pot };
}

describe('Töpfe anlegen', () => {
  it('Name wird gesäubert, Farbe automatisch, Betrag ab diesem Monat', () => {
    const { pots, pb, essen, freizeit } = setup();
    expect(freizeit.name).toBe('Freizeit');
    expect(essen.color).not.toBe(freizeit.color);
    expect(potBudgetFor(pb, essen.id, '2026-11')).toBe(40000);
    expect(potBudgetFor(pb, essen.id, '2027-03')).toBe(40000);
    expect(activePots(pots)).toHaveLength(2);
  });

  it('prüft Name, Doppel und Anzahl', () => {
    const { pots } = setup();
    expect(validatePot(pots, { name: '   ', amount: 100 })).toMatch(/Namen/);
    expect(validatePot(pots, { name: 'essen', amount: 100 })).toMatch(/schon/);
    expect(validatePot(pots, { name: 'Essen', amount: 100 }, pots[0]!.id)).toBeNull(); // eigener Name ist ok
    expect(validatePot(pots, { name: 'Velo', amount: -1 })).toMatch(/Betrag/);
    expect(validatePot(pots, { name: 'Velo', amount: 10_000_000 })).toMatch(/hoch/);
    let many = pots, pb: PotBudget[] = [];
    for (let i = 0; i < 6; i++) ({ pots: many, potBudgets: pb } = addPot(many, pb, { name: `T${i}`, amount: 0 }, id(), '2026-11', now));
    expect(activePots(many)).toHaveLength(8);
    expect(validatePot(many, { name: 'Neunter', amount: 0 })).toMatch(/Höchstens 8/);
    expect(new Set(many.map((p) => p.color)).size).toBe(8);
  });

  it('Name höchstens 24 Zeichen', () => {
    expect(Array.from(cleanPotName('x'.repeat(40)))).toHaveLength(24);
  });
});

describe('Betrag ändern', () => {
  it('gilt ab diesem Monat, frühere behalten ihren', () => {
    const { pots, pb, essen } = setup();
    const r1 = updatePot(pots, pb, essen.id, { name: 'Essen', amount: 30000 }, '2027-01');
    expect(potBudgetFor(r1.potBudgets, essen.id, '2026-12')).toBe(40000);
    expect(potBudgetFor(r1.potBudgets, essen.id, '2027-01')).toBe(30000);
    // im Erstellmonat nochmals ändern: Vormonate (vor dem Topf) spielen keine Rolle, Monat selbst neu
    const r2 = updatePot(pots, pb, essen.id, { name: 'Lebensmittel', amount: 35000 }, '2026-11');
    expect(potBudgetFor(r2.potBudgets, essen.id, '2026-11')).toBe(35000);
    expect(r2.pots.find((p) => p.id === essen.id)!.name).toBe('Lebensmittel');
    // andere Töpfe bleiben unberührt
    expect(r2.potBudgets.filter((b) => b.potId !== essen.id)).toEqual(pb.filter((b) => b.potId !== essen.id));
  });
});

describe('Ausgaben pro Topf', () => {
  it('zählt nur Ausgaben des Monats im Topf, Rest verfällt', () => {
    const { pots, pb, essen, freizeit } = setup();
    const entries = [
      spend('2026-11-03', 3460, essen.id),
      spend('2026-11-20', 41000, essen.id), // überzogen
      spend('2026-11-21', 2000, freizeit.id),
      spend('2026-11-22', 9999, null), // ohne Topf
      spend('2026-12-01', 1000, essen.id),
      makeEntry({ date: '2026-11-25', value: 5000, kind: 'income', note: '', category: essen.id }, id(), now), // Einnahme: nie im Topf
    ];
    const nov = potSummaries(entries, pots, pb, '2026-11');
    const e = nov.find((s) => s.pot.id === essen.id)!;
    expect(e).toMatchObject({ budget: 40000, spent: 44460, available: -4460, level: 'over' });
    expect(nov.find((s) => s.pot.id === freizeit.id)).toMatchObject({ spent: 2000, available: 13000, level: 'ok' });
    // Dezember beginnt voll: Überzug aus November verfällt
    const dec = potSummaries(entries, pots, pb, '2026-12');
    expect(dec.find((s) => s.pot.id === essen.id)).toMatchObject({ budget: 40000, spent: 1000, available: 39000 });
  });

  it('Einnahmen bekommen nie einen Topf', () => {
    const { essen } = setup();
    expect(makeEntry({ date: '2026-11-25', value: 5000, kind: 'income', note: '', category: essen.id }, id(), now).category).toBeNull();
  });

  it('Topf erscheint erst ab dem Monat, in dem er angelegt wurde', () => {
    const { pots, pb } = setup();
    expect(potSummaries([], pots, pb, '2026-10')).toHaveLength(0);
    expect(potSummaries([], pots, pb, '2026-11')).toHaveLength(2);
  });

  it('Summe der Topf-Beträge', () => {
    const { pots, pb } = setup();
    expect(potBudgetTotal(pots, pb, '2026-11')).toBe(55000);
  });
});

describe('Topf löschen', () => {
  it('ohne Buchungen: verschwindet ganz', () => {
    const { pots, pb, freizeit } = setup();
    const r = removePot(pots, pb, [], freizeit.id);
    expect(r.pots.map((p) => p.name)).toEqual(['Essen']);
    expect(r.potBudgets.some((b) => b.potId === freizeit.id)).toBe(false);
  });

  it('mit Buchungen: ausgeblendet, alte Monate zeigen ihn noch', () => {
    const { pots, pb, essen } = setup();
    const entries = [spend('2026-11-03', 3460, essen.id)];
    const r = removePot(pots, pb, entries, essen.id);
    expect(activePots(r.pots).map((p) => p.name)).toEqual(['Freizeit']);
    expect(r.pots.find((p) => p.id === essen.id)!.archived).toBe(true);
    expect(potSummaries(entries, r.pots, r.potBudgets, '2026-11').map((s) => s.pot.name)).toContain('Essen');
    expect(potSummaries(entries, r.pots, r.potBudgets, '2026-12').map((s) => s.pot.name)).not.toContain('Essen');
    // Name wieder frei für einen neuen Topf
    expect(validatePot(r.pots, { name: 'Essen', amount: 100 })).toBeNull();
    expect(potBudgetTotal(r.pots, r.potBudgets, '2026-11')).toBe(15000);
  });

  it('Farbe eines gelöschten Topfs wird wieder frei', () => {
    const { pots, pb, essen } = setup();
    const r = removePot(pots, pb, [], essen.id);
    expect(nextColor(r.pots)).toBe(essen.color);
  });
});
