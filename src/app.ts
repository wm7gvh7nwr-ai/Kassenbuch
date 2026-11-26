import { addMonths, dateInMonth, monthLabel, monthName, monthOf, shortDate, today, type Month } from './core/dates';
import { budgetFor, compare, entriesOf, hasEntriesIn, setBudget, summarize } from './core/finance';
import { changeEntry, makeEntry, type Budget, type Entry } from './core/model';
import { formatChf } from './core/money';
import * as db from './storage/db';
import { openBudgetSheet } from './ui/budgetSheet';
import { append, clear, h, icon, ICONS } from './ui/dom';
import { openEntrySheet } from './ui/entrySheet';
import { openSheet, toast } from './ui/sheet';

interface State {
  entries: Entry[];
  budgets: Budget[];
  lastBackupAt: string | null;
  month: Month;
  today: string;
}

export async function startApp(root: HTMLElement): Promise<void> {
  const loaded = await db.loadAll();
  const t = today();
  const state: State = { ...loaded, today: t, month: monthOf(t) };

  const view = h('main', { class: 'app' });
  const fab = h('button', { class: 'fab', type: 'button' }, icon(ICONS.plus), h('span', null, 'Erfassen'));
  clear(root);
  root.append(view, fab);

  const currentMonth = () => monthOf(state.today);

  /** Neue Buchung: heute, oder in einem vergangenen Monat dessen letzter Tag */
  const defaultDate = () => (state.month === currentMonth() ? state.today : dateInMonth(state.month, 31));

  async function addEntry(): Promise<void> {
    openEntrySheet({
      title: 'Erfassen',
      defaultDate: defaultDate(),
      submitLabel: 'Hinzufügen',
      onSubmit: async (input) => {
        const entry = makeEntry(input, crypto.randomUUID(), new Date());
        await db.putEntry(entry);
        state.entries.push(entry);
        if (monthOf(entry.date) !== state.month) {
          state.month = monthOf(entry.date);
        }
        render();
      },
    });
  }

  function editEntry(entry: Entry): void {
    openEntrySheet({
      title: 'Buchung ändern',
      entry,
      defaultDate: entry.date,
      submitLabel: 'Speichern',
      onSubmit: async (input) => {
        const next = changeEntry(entry, input, new Date());
        await db.putEntry(next);
        state.entries = state.entries.map((e) => (e.id === entry.id ? next : e));
        render();
      },
      onDelete: () => void removeEntry(entry),
    });
  }

  async function removeEntry(entry: Entry): Promise<void> {
    await db.deleteEntry(entry.id);
    state.entries = state.entries.filter((e) => e.id !== entry.id);
    render();
    toast('Buchung gelöscht', {
      label: 'Widerrufen',
      run: async () => {
        await db.putEntry(entry);
        state.entries.push(entry);
        render();
      },
    }, 5000);
  }

  function editBudget(first = false): void {
    openBudgetSheet({
      current: budgetFor(state.budgets, state.month),
      first,
      monthLabel: monthLabel(currentMonth()),
      onSave: async (rappen) => {
        // Ein Budget gilt immer ab dem laufenden Monat
        const next = setBudget(state.budgets, currentMonth(), rappen);
        await db.saveBudgets(next);
        state.budgets = next;
        render();
      },
    });
  }

  function openSettings(): void {
    openSheet('Einstellungen', (body, close) => {
      const budget = budgetFor(state.budgets, currentMonth());
      body.append(
        h('div', { class: 'list-group' },
          h('button', { class: 'list-btn', type: 'button', onclick: () => (close(), editBudget()) },
            h('span', null, 'Monatsbudget'),
            h('span', { class: 'muted' }, budget === null ? 'nicht gesetzt' : `CHF ${formatChf(budget)}`),
          ),
        ),
        h('p', { class: 'hint' }, 'Backup, Export und Löschen folgen in der nächsten Version.'),
      );
    });
  }

  function row(entry: Entry): HTMLElement {
    const isExpense = entry.amount < 0;
    const title = entry.note || (isExpense ? 'Ausgabe' : 'Einnahme');
    const inner = h(
      'button',
      { class: 'row-inner', type: 'button', 'aria-label': `${title}, ${shortDate(entry.date)}, ${formatChf(entry.amount, { sign: true })} Franken. Antippen zum Ändern.` },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, title),
        h('span', { class: 'row-sub' }, entry.note ? `${shortDate(entry.date)} · ${isExpense ? 'Ausgabe' : 'Einnahme'}` : shortDate(entry.date)),
      ),
      h('span', { class: `row-amount ${isExpense ? '' : 'pos'}` }, formatChf(entry.amount, { sign: true })),
    );
    const delZone = h('span', { class: 'row-del', 'aria-hidden': 'true' }, 'Löschen');
    const li = h('li', { class: 'row' }, delZone, inner);

    // Nach links wischen zum Löschen; antippen zum Ändern
    let startX = 0, startY = 0, dx = 0, swiping = false, moved = false;
    inner.addEventListener('pointerdown', (e) => {
      startX = e.clientX; startY = e.clientY; dx = 0; swiping = false; moved = false;
    });
    inner.addEventListener('pointermove', (e) => {
      if (!e.buttons && e.pointerType === 'mouse') return;
      const mx = e.clientX - startX, my = e.clientY - startY;
      if (!swiping && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) {
        swiping = true;
        inner.setPointerCapture(e.pointerId);
      }
      if (Math.abs(mx) > 6 || Math.abs(my) > 6) moved = true;
      if (swiping) {
        dx = Math.min(0, mx);
        inner.style.transform = `translateX(${dx}px)`;
        li.classList.toggle('armed', dx < -90);
      }
    });
    const finish = () => {
      if (!swiping) return;
      inner.style.transform = '';
      li.classList.remove('armed');
      if (dx < -90) {
        li.classList.add('gone');
        setTimeout(() => void removeEntry(entry), 180);
      }
      swiping = false;
    };
    inner.addEventListener('pointerup', finish);
    inner.addEventListener('pointercancel', finish);
    inner.addEventListener('click', (e) => {
      if (moved) { e.preventDefault(); moved = false; return; }
      editEntry(entry);
    });
    return li;
  }

  /** Breite über CSSOM setzen: erlaubt auch mit strikter Content Security Policy */
  function barFill(pct: number): HTMLElement {
    const i = h('i');
    i.style.width = `${pct}%`;
    return i;
  }

  function render(): void {
    const s = summarize(state.entries, state.budgets, state.month);
    const hasBudget = state.budgets.length > 0;
    const isCurrent = state.month === currentMonth();
    const list = entriesOf(state.entries, state.month);
    const cmp = compare(state.entries, state.month, state.today);
    const showCompare = hasEntriesIn(state.entries, cmp.month);
    const pct = s.budget > 0 ? Math.min(100, (s.expenses / s.budget) * 100) : s.expenses > 0 ? 100 : 0;

    clear(view);
    append(view, [
      h('header', { class: 'topbar' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Vorheriger Monat', onclick: () => ((state.month = addMonths(state.month, -1)), render()) }, icon(ICONS.back)),
        h('button', { class: 'month', type: 'button', 'aria-label': 'Zum aktuellen Monat', onclick: () => ((state.month = currentMonth()), render()) }, monthLabel(state.month)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nächster Monat', disabled: isCurrent, onclick: () => ((state.month = addMonths(state.month, 1)), render()) }, icon(ICONS.forward)),
        h('span', { class: 'grow' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Einstellungen', onclick: openSettings }, icon(ICONS.gear)),
      ),
      h('section', { class: `hero ${s.level}`, 'aria-label': 'Verfügbar' },
        h('p', { class: 'label' }, isCurrent ? 'Noch verfügbar' : `Übrig im ${monthName(state.month)}`),
        hasBudget
          ? h('p', { class: 'available' }, h('span', { class: 'cur' }, 'CHF '), formatChf(s.available))
          : h('button', { class: 'btn primary', type: 'button', onclick: () => editBudget(true) }, 'Monatsbudget festlegen'),
        hasBudget && h('div', { class: 'bar', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct), 'aria-label': 'Anteil des Budgets ausgegeben' },
          barFill(pct)),
        hasBudget && h('p', { class: 'of' }, `${Math.round(s.used === Infinity ? 100 : s.used * 100)} % von CHF ${formatChf(s.budget)}`),
      ),
      h('section', { class: 'tiles' },
        h('div', { class: 'tile' }, h('span', { class: 'label' }, 'Ausgaben'), h('strong', null, formatChf(s.expenses))),
        h('div', { class: 'tile' }, h('span', { class: 'label' }, 'Einnahmen'), h('strong', { class: 'pos' }, formatChf(s.income))),
      ),
      showCompare && h('p', { class: 'compare' },
        cmp.uptoDay ? `${monthName(cmp.month)} bis zum ${cmp.uptoDay}.: ` : `Im ${monthName(cmp.month)}: `,
        h('strong', null, `CHF ${formatChf(cmp.expenses)}`),
        ' ausgegeben'),
      h('h2', { class: 'section-title' }, 'Buchungen'),
      list.length
        ? h('ul', { class: 'rows' }, ...list.map(row))
        : h('p', { class: 'empty' }, isCurrent ? 'Noch keine Buchungen in diesem Monat. Tippe auf «Erfassen».' : 'Keine Buchungen in diesem Monat.'),

    ]);
  }

  fab.addEventListener('click', () => void addEntry());

  // Über Mitternacht offen gelassen: «heute» und Monat nachführen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t2 = today();
    if (t2 !== state.today) {
      const wasCurrent = state.month === currentMonth();
      state.today = t2;
      if (wasCurrent) state.month = monthOf(t2);
      render();
    }
  });

  render();
  if (state.budgets.length === 0) editBudget(true);
}
