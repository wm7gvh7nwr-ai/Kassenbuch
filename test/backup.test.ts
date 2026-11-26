import { describe, expect, it } from 'vitest';
import { backupFileName, createBackup, parseBackup, serializeBackup } from '../src/core/backup';
import { toCsv } from '../src/core/csv';
import type { Data, Entry } from '../src/core/model';

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90',
  date: '2026-11-24',
  amount: -1250,
  note: 'Kaffee',
  category: null,
  createdAt: '2026-11-24T08:15:00.000Z',
  updatedAt: '2026-11-24T08:15:00.000Z',
  ...over,
});

const data: Data = {
  entries: [
    entry(),
    entry({ id: 'a1b2c3d4-0000-4000-8000-000000000002', date: '2026-01-03', amount: 235000, note: 'Lohn «November» ✓' }),
    entry({ id: 'a1b2c3d4-0000-4000-8000-000000000003', date: '2026-06-15', amount: -9999999, note: '' }),
  ],
  budgets: [
    { from: '2026-01', amount: 150000 },
    { from: '2026-11', amount: 180000 },
  ],
};

const now = new Date('2026-11-26T20:00:00.000Z');

function backupWith(mutate: (o: any) => void): string {
  const o = JSON.parse(serializeBackup(createBackup(data, now)));
  mutate(o);
  return JSON.stringify(o);
}

describe('Backup', () => {
  it('Erstellen und Einlesen ergibt genau dieselben Daten', () => {
    const r = parseBackup(serializeBackup(createBackup(data, now)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.entries).toEqual(data.entries);
    expect(r.data.budgets).toEqual(data.budgets);
    expect(r.info).toEqual({ entries: 3, firstDate: '2026-01-03', lastDate: '2026-11-24', exportedAt: now.toISOString() });
  });

  it('nimmt keine fremden Felder mit', () => {
    const withExtra = { ...data, entries: [{ ...entry(), secret: 'x' } as Entry] };
    expect(serializeBackup(createBackup(withExtra, now))).not.toContain('secret');
    const r = parseBackup(backupWith((o) => (o.entries[0].evil = '<script>')));
    expect(r.ok && JSON.stringify(r.data)).not.toContain('evil');
  });

  it('leeres Kassenbuch', () => {
    const r = parseBackup(serializeBackup(createBackup({ entries: [], budgets: [] }, now)));
    expect(r).toMatchObject({ ok: true, info: { entries: 0, firstDate: null, lastDate: null } });
  });

  it('Dateiname', () => {
    expect(backupFileName('2026-11-26')).toBe('kassenbuch-2026-11-26.json');
  });

  const bad: Array<[string, string | ((o: any) => void)]> = [
    ['kein JSON', '{ kaputt'],
    ['leer', ''],
    ['Array statt Objekt', '[]'],
    ['falsche App', (o) => (o.app = 'budgetplaner')],
    ['neuere Version', (o) => (o.version = 2)],
    ['Version 0', (o) => (o.version = 0)],
    ['Version als Text', (o) => (o.version = '1')],
    ['ohne Buchungen', (o) => delete o.entries],
    ['Betrag als Kommazahl', (o) => (o.entries[0].amount = -12.5)],
    ['Betrag als Text', (o) => (o.entries[0].amount = '-1250')],
    ['Betrag 0', (o) => (o.entries[0].amount = 0)],
    ['Betrag zu gross', (o) => (o.entries[0].amount = -10_000_000)],
    ['unmögliches Datum', (o) => (o.entries[0].date = '2026-02-30')],
    ['Datum mit Zeit', (o) => (o.entries[0].date = '2026-11-24T10:00')],
    ['doppelte Kennung', (o) => (o.entries[1].id = o.entries[0].id)],
    ['Kennung mit Sonderzeichen', (o) => (o.entries[0].id = '<img src=x>')],
    ['Notiz zu lang', (o) => (o.entries[0].note = 'x'.repeat(61))],
    ['Notiz mit Steuerzeichen', (o) => (o.entries[0].note = 'a\u0000b')],
    ['Notiz als Zahl', (o) => (o.entries[0].note = 5)],
    ['Kategorie als Objekt', (o) => (o.entries[0].category = {})],
    ['Zeitstempel falsch', (o) => (o.entries[0].createdAt = 'gestern')],
    ['Budget negativ', (o) => (o.budgets[0].amount = -1)],
    ['Budget-Monat ungültig', (o) => (o.budgets[0].from = '2026-13')],
    ['Budget-Monat doppelt', (o) => (o.budgets[1].from = o.budgets[0].from)],
    ['Buchung null', (o) => (o.entries[0] = null)],
  ];

  it.each(bad)('lehnt ab: %s', (_name, input) => {
    const text = typeof input === 'string' ? input : backupWith(input);
    const r = parseBackup(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
  });

  it('lehnt zu grosse Dateien ab, ohne sie zu lesen', () => {
    expect(parseBackup(' '.repeat(10 * 1024 * 1024 + 1)).ok).toBe(false);
  });
});

describe('CSV-Export', () => {
  it('Kopfzeile, Reihenfolge, Format', () => {
    const csv = toCsv(data.entries);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toEqual([
      'Datum;Betrag CHF;Art;Notiz',
      '03.01.2026;2350.00;Einnahme;Lohn «November» ✓',
      '15.06.2026;-99999.99;Ausgabe;',
      '24.11.2026;-12.50;Ausgabe;Kaffee',
    ]);
  });

  it('entschärft Formeln und setzt Anführungszeichen', () => {
    const csv = toCsv([
      entry({ note: '=HYPERLINK("http://x")' }),
      entry({ id: 'b0000000-0000-4000-8000-000000000001', note: '+41 79 123', date: '2026-11-25' }),
      entry({ id: 'b0000000-0000-4000-8000-000000000002', note: 'a;b', date: '2026-11-26' }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(";'+41 79 123");
    expect(csv).toContain(';"a;b"');
    expect(csv).toContain(';-12.50;'); // Zahlen bleiben Zahlen
  });
});
