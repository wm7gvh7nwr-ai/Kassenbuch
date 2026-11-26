import { describe, expect, it } from 'vitest';
import {
  addMonths, dateInMonth, daysInMonth, isValidDate, isValidMonth, monthLabel, shortDate, today,
} from '../src/core/dates';

describe('today (Europe/Zurich)', () => {
  it('Sommerzeit: 31. März 23:30 UTC ist in Zürich schon der 1. April', () => {
    // 2026: Sommerzeit seit 29. März, UTC+2
    expect(today(new Date('2026-03-31T22:30:00Z'))).toBe('2026-04-01');
    expect(today(new Date('2026-03-31T21:30:00Z'))).toBe('2026-03-31');
  });

  it('Winterzeit: 31. Oktober 23:30 in Zürich bleibt Oktober', () => {
    // 2026: Winterzeit seit 25. Oktober, UTC+1
    expect(today(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-31');
    expect(today(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
  });

  it('Tag der Umstellung im März und im Oktober', () => {
    expect(today(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29');
    expect(today(new Date('2026-10-25T22:59:00Z'))).toBe('2026-10-25');
    expect(today(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
  });

  it('Silvester → Neujahr', () => {
    expect(today(new Date('2026-12-31T22:59:59Z'))).toBe('2026-12-31');
    expect(today(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });
});

describe('Monate', () => {
  it('Tage pro Monat inkl. Schaltjahr', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2100-02')).toBe(28);
    expect(daysInMonth('2026-04')).toBe(30);
    expect(daysInMonth('2026-12')).toBe(31);
  });

  it('blättert über Jahresgrenzen', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-11', -23)).toBe('2024-12');
    expect(addMonths('2026-11', 0)).toBe('2026-11');
  });

  it('begrenzt den Tag auf das Monatsende', () => {
    expect(dateInMonth('2026-02', 31)).toBe('2026-02-28');
    expect(dateInMonth('2028-02', 31)).toBe('2028-02-29');
    expect(dateInMonth('2026-04', 31)).toBe('2026-04-30');
    expect(dateInMonth('2026-11', 24)).toBe('2026-11-24');
  });

  it('prüft Datum und Monat streng', () => {
    expect(isValidDate('2026-11-24')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-11-31')).toBe(false);
    expect(isValidDate('2026-1-01')).toBe(false);
    expect(isValidDate('1999-12-31')).toBe(false);
    expect(isValidDate(20261124)).toBe(false);
    expect(isValidMonth('2026-11')).toBe(true);
    expect(isValidMonth('2026-00')).toBe(false);
    expect(isValidMonth('2026-11-01')).toBe(false);
  });

  it('beschriftet auf Deutsch', () => {
    expect(monthLabel('2026-03')).toBe('März 2026');
    expect(shortDate('2026-11-04')).toBe('4. Nov.');
  });
});
