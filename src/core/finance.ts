import { addMonths, dateInMonth, dayOf, monthOf, type IsoDate, type Month } from './dates';
import type { Budget, Entry } from './model';

/** Frühester Monat, den die App kennt */
export const EARLIEST: Month = '2000-01';

/**
 * Budget eines Monats: der letzte Eintrag mit from ≤ Monat.
 * Liegt der Monat vor dem ersten Budget, gilt das erste Budget
 * («ein Monat ist nie ohne Budget»). Ohne jedes Budget: null.
 */
export function budgetFor(budgets: readonly Pick<Budget, 'from' | 'amount'>[], month: Month): number | null {
  if (budgets.length === 0) return null;
  const sorted = [...budgets].sort((a, b) => a.from.localeCompare(b.from));
  let result = sorted[0]!.amount;
  for (const b of sorted) {
    if (b.from <= month) result = b.amount;
    else break;
  }
  return result;
}

/** Budget ab einem Monat setzen. Frühere Monate behalten ihr Budget. */
export function setBudget<T extends Budget>(budgets: readonly T[], from: Month, amount: number, make: (b: Budget) => T = (b) => b as T): T[] {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('Budget muss ≥ 0 Rappen sein');
  const rest = budgets.filter((b) => b.from < from);
  // Gab es vor diesem Monat noch keinen Eintrag, galt dort stillschweigend das erste
  // Budget. Damit frühere Monate es behalten, wird es ab Anfang festgehalten.
  const sorted = [...budgets].sort((a, b) => a.from.localeCompare(b.from));
  const first = sorted[0];
  if (rest.length === 0 && first && first.amount !== amount) rest.push(make({ from: EARLIEST, amount: first.amount }));
  const next = [...rest, make({ from, amount })].sort((a, b) => a.from.localeCompare(b.from));
  // Ein gleich hohes Budget direkt danach ist überflüssig
  return next.filter((b, i) => i === 0 || b.amount !== next[i - 1]!.amount);
}

export type Level = 'ok' | 'warn' | 'over';

export interface MonthSummary {
  month: Month;
  budget: number;
  expenses: number; // positiv, Summe der Ausgaben
  income: number;
  available: number; // budget − expenses, kann negativ sein
  /** Anteil des Budgets, der ausgegeben ist (0…∞) */
  used: number;
  level: Level;
}

export function levelFor(expenses: number, budget: number): Level {
  if (budget <= 0) return expenses > 0 ? 'over' : 'ok';
  // Ganzzahlig vergleichen statt mit Kommazahlen: ≥ 100 % bzw. ≥ 80 %
  if (expenses >= budget) return 'over';
  if (expenses * 5 >= budget * 4) return 'warn';
  return 'ok';
}

export function summarize(entries: readonly Entry[], budgets: readonly Budget[], month: Month): MonthSummary {
  let expenses = 0;
  let income = 0;
  for (const e of entries) {
    if (monthOf(e.date) !== month) continue;
    if (e.amount < 0) expenses -= e.amount;
    else income += e.amount;
  }
  const budget = budgetFor(budgets, month) ?? 0;
  return {
    month,
    budget,
    expenses,
    income,
    available: budget - expenses,
    used: budget > 0 ? expenses / budget : expenses > 0 ? Infinity : 0,
    level: levelFor(expenses, budget),
  };
}

export interface Comparison {
  month: Month; // Vormonat
  /** Bis zu diesem Tag des Vormonats gezählt; null = ganzer Vormonat */
  uptoDay: number | null;
  expenses: number;
}

/**
 * Vergleichszeile. Im laufenden Monat: Ausgaben im Vormonat vom 1. bis zum
 * gleichen Tag (auf das Monatsende begrenzt). In anderen Monaten: der ganze Vormonat.
 */
export function compare(entries: readonly Entry[], month: Month, todayDate: IsoDate): Comparison {
  const prev = addMonths(month, -1);
  const current = monthOf(todayDate) === month;
  const until = current ? dateInMonth(prev, dayOf(todayDate)) : null;
  let expenses = 0;
  for (const e of entries) {
    if (e.amount >= 0 || monthOf(e.date) !== prev) continue;
    if (until && e.date > until) continue;
    expenses -= e.amount;
  }
  return { month: prev, uptoDay: until ? dayOf(until) : null, expenses };
}

/** Buchungen eines Monats, neueste zuerst */
export function entriesOf(entries: readonly Entry[], month: Month): Entry[] {
  return entries
    .filter((e) => monthOf(e.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Gibt es im Vormonat überhaupt Buchungen? (sonst keine Vergleichszeile) */
export function hasEntriesIn(entries: readonly Entry[], month: Month): boolean {
  return entries.some((e) => monthOf(e.date) === month);
}
