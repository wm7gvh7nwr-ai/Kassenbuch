import type { Entry } from './model';

/**
 * CSV für Numbers und Excel (Schweizer Einstellungen): Strichpunkt als
 * Trenner, Punkt als Dezimalzeichen, UTF-8 mit BOM, älteste Buchung zuerst.
 */
export function toCsv(entries: readonly Entry[]): string {
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((e) => [
      e.date.split('-').reverse().join('.'),
      amountCell(e.amount),
      e.amount < 0 ? 'Ausgabe' : 'Einnahme',
      e.note,
    ]);
  const lines = [['Datum', 'Betrag CHF', 'Art', 'Notiz'], ...rows].map((r) => r.map(cell).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function amountCell(rappen: number): string {
  const abs = Math.abs(rappen);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return rappen < 0 ? '-' + s : s;
}

/** Schützt vor Formel-Einschleusung und setzt Anführungszeichen wo nötig */
function cell(value: string): string {
  let v = value;
  // Nur Texte entschärfen; echte Zahlen («-12.50») bleiben Zahlen
  if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+\.\d{2}$/.test(v)) v = "'" + v;
  if (/[";\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}
