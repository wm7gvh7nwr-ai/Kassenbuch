import { monthOf, type Month } from './dates';
import { budgetFor, levelFor, setBudget, type Level } from './finance';
import type { Entry, Pot, PotBudget } from './model';
import { MAX_AMOUNT } from './money';

export const POT_MAX = 8;
export const POT_NAME_MAX = 24;
export const POT_COLORS = 8;

export function cleanPotName(input: string): string {
  return Array.from(input.replace(/\s+/g, ' ').trim()).slice(0, POT_NAME_MAX).join('').trim();
}

export const activePots = (pots: readonly Pot[]): Pot[] => pots.filter((p) => !p.archived);

/** Prüft Name und Betrag eines neuen oder geänderten Topfs. null = alles gut. */
export function validatePot(
  pots: readonly Pot[],
  input: { name: string; amount: number },
  editingId: string | null = null,
): string | null {
  const name = cleanPotName(input.name);
  if (!name) return 'Bitte einen Namen eingeben.';
  const clash = activePots(pots).some((p) => p.id !== editingId && p.name.toLocaleLowerCase('de-CH') === name.toLocaleLowerCase('de-CH'));
  if (clash) return `Es gibt schon einen Topf «${name}».`;
  if (!editingId && activePots(pots).length >= POT_MAX) return `Höchstens ${POT_MAX} Töpfe.`;
  if (!Number.isInteger(input.amount) || input.amount < 0) return 'Bitte einen Betrag eingeben.';
  if (input.amount > MAX_AMOUNT) return 'Der Betrag ist zu hoch.';
  return null;
}

/** Nächste freie Farbe, damit Töpfe gut zu unterscheiden sind */
export function nextColor(pots: readonly Pot[]): number {
  const used = new Set(activePots(pots).map((p) => p.color));
  for (let c = 0; c < POT_COLORS; c++) if (!used.has(c)) return c;
  return pots.length % POT_COLORS;
}

export function addPot(
  pots: readonly Pot[],
  potBudgets: readonly PotBudget[],
  input: { name: string; amount: number },
  id: string,
  month: Month,
  now: Date,
): { pots: Pot[]; potBudgets: PotBudget[]; pot: Pot } {
  const problem = validatePot(pots, input);
  if (problem) throw new Error(problem);
  const pot: Pot = { id, name: cleanPotName(input.name), color: nextColor(pots), archived: false, createdAt: now.toISOString() };
  return { pots: [...pots, pot], potBudgets: [...potBudgets, { potId: id, from: month, amount: input.amount }], pot };
}

export function updatePot(
  pots: readonly Pot[],
  potBudgets: readonly PotBudget[],
  id: string,
  input: { name: string; amount: number },
  month: Month,
): { pots: Pot[]; potBudgets: PotBudget[] } {
  const problem = validatePot(pots, input, id);
  if (problem) throw new Error(problem);
  const own = potBudgets.filter((b) => b.potId === id);
  const others = potBudgets.filter((b) => b.potId !== id);
  const next = setBudget(own, month, input.amount, (b) => ({ ...b, potId: id }));
  return {
    pots: pots.map((p) => (p.id === id ? { ...p, name: cleanPotName(input.name) } : p)),
    potBudgets: [...others, ...next],
  };
}

/**
 * Topf löschen. Hat er Buchungen, wird er nur ausgeblendet (alte Buchungen
 * behalten Namen und Farbe). Ohne Buchungen verschwindet er ganz.
 */
export function removePot(
  pots: readonly Pot[],
  potBudgets: readonly PotBudget[],
  entries: readonly Entry[],
  id: string,
): { pots: Pot[]; potBudgets: PotBudget[] } {
  const used = entries.some((e) => e.category === id);
  if (used) return { pots: pots.map((p) => (p.id === id ? { ...p, archived: true } : p)), potBudgets: [...potBudgets] };
  return { pots: pots.filter((p) => p.id !== id), potBudgets: potBudgets.filter((b) => b.potId !== id) };
}

export function potBudgetFor(potBudgets: readonly PotBudget[], potId: string, month: Month): number {
  return budgetFor(potBudgets.filter((b) => b.potId === potId), month) ?? 0;
}

export interface PotSummary {
  pot: Pot;
  budget: number;
  spent: number;
  available: number;
  level: Level;
}

/**
 * Töpfe eines Monats. Gezeigt werden Töpfe, die es in diesem Monat schon gab
 * und die nicht gelöscht sind, sowie gelöschte mit Buchungen in diesem Monat.
 * Ein Restbetrag verfällt: jeder Monat startet mit dem vollen Betrag.
 */
export function potSummaries(
  entries: readonly Entry[],
  pots: readonly Pot[],
  potBudgets: readonly PotBudget[],
  month: Month,
): PotSummary[] {
  const spentBy = new Map<string, number>();
  for (const e of entries) {
    if (e.amount >= 0 || !e.category || monthOf(e.date) !== month) continue;
    spentBy.set(e.category, (spentBy.get(e.category) ?? 0) - e.amount);
  }
  const firstMonthOf = (p: Pot) => {
    const own = potBudgets.filter((b) => b.potId === p.id && b.from > '2000-01').map((b) => b.from).sort();
    return own[0] ?? monthOf(p.createdAt.slice(0, 10));
  };
  return pots
    .filter((p) => (p.archived ? spentBy.has(p.id) : firstMonthOf(p) <= month || spentBy.has(p.id)))
    .map((pot) => {
      const budget = pot.archived ? 0 : potBudgetFor(potBudgets, pot.id, month);
      const spent = spentBy.get(pot.id) ?? 0;
      return { pot, budget, spent, available: budget - spent, level: levelFor(spent, budget) };
    });
}

/** Summe der Topf-Beträge eines Monats (für den Hinweis «mehr als das Gesamtbudget») */
export function potBudgetTotal(pots: readonly Pot[], potBudgets: readonly PotBudget[], month: Month): number {
  return activePots(pots).reduce((s, p) => s + potBudgetFor(potBudgets, p.id, month), 0);
}

export function potById(pots: readonly Pot[], id: string | null): Pot | undefined {
  return id ? pots.find((p) => p.id === id) : undefined;
}
