import { backupFileName, createBackup, MAX_BACKUP_BYTES, parseBackup, serializeBackup } from '../core/backup';
import { toCsv } from '../core/csv';
import { shortDate, today } from '../core/dates';
import type { Data } from '../core/model';
import { formatChf } from '../core/money';
import { h } from './dom';
import { pickTextFile, shareFile } from './files';
import { openSheet, toast } from './sheet';

export interface SettingsContext {
  data: () => Data;
  budget: number | null;
  lastBackupAt: string | null;
  editBudget: () => void;
  onBackupDone: (iso: string) => Promise<void>;
  onReplace: (data: Data) => Promise<void>;
  onClear: () => Promise<void>;
}

const VERSION = '1.1';

function yearDate(d: string): string {
  return `${shortDate(d)} ${d.slice(0, 4)}`;
}

/** Backup erstellen und weitergeben; merkt sich das Datum nur bei Erfolg */
export async function makeBackup(ctx: Pick<SettingsContext, 'data' | 'onBackupDone'>): Promise<void> {
  const now = new Date();
  const text = serializeBackup(createBackup(ctx.data(), now));
  const result = await shareFile(text, backupFileName(today(now)), 'application/json');
  if (result === 'cancelled') return;
  await ctx.onBackupDone(now.toISOString());
  toast(result === 'shared' ? 'Backup gesichert' : 'Backup heruntergeladen');
}

export function openSettings(ctx: SettingsContext): void {
  openSheet('Einstellungen', (body, close) => {
    const entries = ctx.data().entries.length;
    const last = ctx.lastBackupAt ? `Letztes: ${yearDate(today(new Date(ctx.lastBackupAt)))}` : 'Noch nie';

    const item = (label: string, detail: string | null, onclick: () => void, cls = '') =>
      h('button', { class: `list-btn ${cls}`, type: 'button', onclick },
        h('span', null, label),
        detail ? h('span', { class: 'muted' }, detail) : null);

    body.append(
      h('div', { class: 'list-group' },
        item('Monatsbudget', ctx.budget === null ? 'nicht gesetzt' : `CHF ${formatChf(ctx.budget)}`, () => (close(), ctx.editBudget())),
      ),
      h('div', { class: 'list-group' },
        item('Backup erstellen', last, () => void makeBackup(ctx).then(close)),
        item('Backup einlesen', null, () => void importBackup(ctx)),
        item('Als CSV exportieren', entries ? `${entries} Buchungen` : null, () => void exportCsv(ctx)),
      ),
      h('div', { class: 'list-group' },
        item('Alle Daten löschen', null, () => confirmClear(ctx), 'danger'),
      ),
      h('p', { class: 'hint center' },
        `Kassenbuch ${VERSION} · Deine Daten liegen nur auf diesem Gerät. `,
        'Sichere sie mit einem Backup in «Dateien» oder iCloud Drive.'),
    );
  });
}

async function exportCsv(ctx: SettingsContext): Promise<void> {
  const data = ctx.data();
  if (data.entries.length === 0) return toast('Noch keine Buchungen');
  const r = await shareFile(toCsv(data.entries, data.pots), `kassenbuch-${today()}.csv`, 'text/csv');
  if (r !== 'cancelled') toast('CSV exportiert');
}

async function importBackup(ctx: SettingsContext): Promise<void> {
  const picked = await pickTextFile('.json,application/json', MAX_BACKUP_BYTES);
  if (!picked) return;
  if ('error' in picked) return toast(picked.error, undefined, 4000);
  const parsed = parseBackup(picked.text);
  if (!parsed.ok) return toast(parsed.error, undefined, 5000);
  const { info, data } = parsed;
  const current = ctx.data().entries.length;

  openSheet('Backup einlesen', (body, close) => {
    const range = info.firstDate && info.lastDate
      ? `vom ${yearDate(info.firstDate)} bis ${yearDate(info.lastDate)}`
      : '';
    body.append(
      h('div', { class: 'card' },
        h('p', { class: 'big-line' }, `${info.entries} Buchungen`),
        range && h('p', { class: 'muted' }, range),
        h('p', { class: 'muted' }, `Backup erstellt am ${yearDate(today(new Date(info.exportedAt)))}`),
      ),
      h('p', { class: 'lead' },
        current
          ? `Die ${current} Buchungen auf diesem Gerät, das Budget und die Töpfe werden durch das Backup ersetzt.`
          : 'Die Daten aus dem Backup werden übernommen.'),
      h('button', {
        class: 'btn primary block', type: 'button',
        onclick: async (e: Event) => {
          (e.currentTarget as HTMLButtonElement).disabled = true;
          await ctx.onReplace(data);
          close();
          toast(`${info.entries} Buchungen eingelesen`);
        },
      }, current ? 'Daten ersetzen' : 'Übernehmen'),
      h('button', { class: 'btn plain block', type: 'button', onclick: close }, 'Abbrechen'),
    );
  });
}

function confirmClear(ctx: SettingsContext): void {
  const n = ctx.data().entries.length;
  openSheet('Alle Daten löschen', (body, close) => {
    const del = h('button', { class: 'btn danger block', type: 'button', disabled: true }, 'Endgültig löschen');
    const check = h('input', { type: 'checkbox', id: 'clear-ok' });
    check.addEventListener('change', () => (del.disabled = !check.checked));
    del.addEventListener('click', async () => {
      del.disabled = true;
      await ctx.onClear();
      close();
      toast('Alle Daten gelöscht');
    });
    body.append(
      h('p', { class: 'lead' },
        `${n} Buchungen, das Monatsbudget und die Töpfe werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.`),
      h('button', { class: 'btn plain block', type: 'button', onclick: () => void makeBackup(ctx) }, 'Vorher Backup erstellen'),
      h('div', { class: 'check' }, check, h('label', { for: 'clear-ok' }, 'Ich habe ein Backup oder brauche die Daten nicht mehr.')),
      del,
    );
  });
}
