import { isValidDate, isValidMonth } from './dates';
import { CATEGORY_MAX, NOTE_MAX, SCHEMA_VERSION, type Budget, type Data, type Entry } from './model';
import { MAX_AMOUNT } from './money';

export const APP_ID = 'kassenbuch';
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_ENTRIES = 200_000;

export interface BackupFile {
  app: typeof APP_ID;
  version: number;
  exportedAt: string;
  entries: Entry[];
  budgets: Budget[];
}

export function createBackup(data: Data, now: Date = new Date()): BackupFile {
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    // Felder explizit kopieren: nichts Unerwartetes landet in der Datei
    entries: data.entries.map(pickEntry),
    budgets: data.budgets.map((b) => ({ from: b.from, amount: b.amount })),
  };
}

export function backupFileName(todayDate: string): string {
  return `kassenbuch-${todayDate}.json`;
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 1);
}

export interface BackupInfo {
  entries: number;
  firstDate: string | null;
  lastDate: string | null;
  exportedAt: string;
}

export type ParseResult =
  | { ok: true; data: Data; info: BackupInfo }
  | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function pickEntry(e: Entry): Entry {
  return {
    id: e.id,
    date: e.date,
    amount: e.amount,
    note: e.note,
    category: e.category,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Prüft eine Backup-Datei vollständig, bevor irgendetwas geändert wird.
 * Jeder Fehler führt zur Ablehnung der ganzen Datei.
 */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return fail('Die Datei ist zu gross.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Die Datei ist kein gültiges Kassenbuch-Backup.');
  }
  if (!isObj(raw) || raw.app !== APP_ID) return fail('Die Datei ist kein Kassenbuch-Backup.');
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1)
    return fail('Die Version der Datei ist ungültig.');
  if (raw.version > SCHEMA_VERSION)
    return fail('Die Datei stammt von einer neueren App-Version. Bitte zuerst die App aktualisieren.');
  if (typeof raw.exportedAt !== 'string' || !ISO_TS_RE.test(raw.exportedAt)) return fail('Das Backup-Datum fehlt.');
  if (!Array.isArray(raw.entries) || !Array.isArray(raw.budgets)) return fail('Der Datei fehlen Buchungen oder Budgets.');
  if (raw.entries.length > MAX_ENTRIES) return fail('Die Datei enthält zu viele Buchungen.');

  const entries: Entry[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < raw.entries.length; i++) {
    const e = raw.entries[i];
    const where = `Buchung ${i + 1}`;
    if (!isObj(e)) return fail(`${where} ist ungültig.`);
    if (typeof e.id !== 'string' || !ID_RE.test(e.id)) return fail(`${where}: ungültige Kennung.`);
    if (ids.has(e.id)) return fail(`${where}: doppelte Kennung.`);
    if (!isValidDate(e.date)) return fail(`${where}: ungültiges Datum.`);
    if (typeof e.amount !== 'number' || !Number.isInteger(e.amount) || e.amount === 0 || Math.abs(e.amount) > MAX_AMOUNT)
      return fail(`${where}: ungültiger Betrag.`);
    if (typeof e.note !== 'string' || Array.from(e.note).length > NOTE_MAX || /[\u0000-\u001f\u007f]/.test(e.note))
      return fail(`${where}: ungültige Notiz.`);
    if (!(e.category === null || (typeof e.category === 'string' && e.category.length <= CATEGORY_MAX)))
      return fail(`${where}: ungültige Kategorie.`);
    if (typeof e.createdAt !== 'string' || !ISO_TS_RE.test(e.createdAt)) return fail(`${where}: ungültige Zeitangabe.`);
    if (typeof e.updatedAt !== 'string' || !ISO_TS_RE.test(e.updatedAt)) return fail(`${where}: ungültige Zeitangabe.`);
    ids.add(e.id);
    entries.push(
      pickEntry({
        id: e.id,
        date: e.date,
        amount: e.amount,
        note: e.note,
        category: e.category,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }),
    );
  }

  const budgets: Budget[] = [];
  const months = new Set<string>();
  for (let i = 0; i < raw.budgets.length; i++) {
    const b = raw.budgets[i];
    const where = `Budget ${i + 1}`;
    if (!isObj(b) || !isValidMonth(b.from)) return fail(`${where}: ungültiger Monat.`);
    if (months.has(b.from)) return fail(`${where}: Monat doppelt.`);
    if (typeof b.amount !== 'number' || !Number.isInteger(b.amount) || b.amount < 0 || b.amount > MAX_AMOUNT)
      return fail(`${where}: ungültiger Betrag.`);
    months.add(b.from);
    budgets.push({ from: b.from, amount: b.amount });
  }
  budgets.sort((a, b) => a.from.localeCompare(b.from));

  const dates = entries.map((e) => e.date).sort();
  return {
    ok: true,
    data: { entries, budgets },
    info: {
      entries: entries.length,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
      exportedAt: raw.exportedAt,
    },
  };
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKUP_INTERVAL_DAYS = 30;

/**
 * Ist ein Backup fällig? Ja, wenn es Buchungen gibt und das letzte Backup
 * (oder, ohne Backup, die älteste Buchung) mehr als 30 Tage zurückliegt.
 */
export function backupDue(lastBackupAt: string | null, entries: readonly Entry[], now: Date): boolean {
  if (entries.length === 0) return false;
  let since: number;
  if (lastBackupAt) since = Date.parse(lastBackupAt);
  else since = Math.min(...entries.map((e) => Date.parse(e.createdAt)));
  if (!Number.isFinite(since)) return true;
  return now.getTime() - since > BACKUP_INTERVAL_DAYS * DAY_MS;
}
