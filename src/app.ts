import { addMonths, dateInMonth, monthLabel, monthName, monthOf, shortDate, today, type Month } from './core/dates';
import { budgetFor, compare, entriesOf, hasEntriesIn, setBudget, summarize } from './core/finance';
import { changeEntry, makeEntry, type Budget, type Data, type Entry, type Pot, type PotBudget } from './core/model';
import { activePots, addPot, potBudgetFor, potBudgetTotal, potById, potSummaries, removePot, updatePot, validatePot, POT_MAX } from './core/pots';
import { openPotSheet } from './ui/potSheet';
import { formatChf } from './core/money';
import * as db from './storage/db';
import { openBudgetSheet } from './ui/budgetSheet';
import { append, clear, h, icon, ICONS } from './ui/dom';
import { openEntrySheet } from './ui/entrySheet';
import { toast } from './ui/sheet';
import { makeBackup, openSettings } from './ui/settings';
import { backupDue } from './core/backup';

interface State {
  entries: Entry[];
  budgets: Budget[];
  pots: Pot[];
  potBudgets: PotBudget[];
  lastBackupAt: string | null;
  month: Month;
  today: string;
  /** Nur Buchungen dieses Topfs zeigen */
  filterPot: string | null;
}

export async function startApp(root: HTMLElement): Promise<void> {
  const loaded = await db.loadAll();
  const t = today();
  const state: State = { ...loaded, today: t, month: monthOf(t), filterPot: null };
  const data = (): Data => ({ entries: state.entries, budgets: state.budgets, pots: state.pots, potBudgets: state.potBudgets });

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
      pots: activePots(state.pots),
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
      pots: state.pots.filter((p) => !p.archived || p.id === entry.category),
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

  function showSettings(): void {
    openSettings({
      data,
      budget: budgetFor(state.budgets, currentMonth()),
      lastBackupAt: state.lastBackupAt,
      editBudget: () => editBudget(),
      onBackupDone: async (iso) => {
        await db.setLastBackup(iso);
        state.lastBackupAt = iso;
        render();
      },
      onReplace: async (data) => {
        await db.replaceAll(data);
        state.entries = data.entries;
        state.budgets = data.budgets;
        state.pots = data.pots;
        state.potBudgets = data.potBudgets;
        state.filterPot = null;
        state.month = currentMonth();
        render();
      },
      onClear: async () => {
        await db.clearAll();
        state.entries = [];
        state.budgets = [];
        state.pots = [];
        state.potBudgets = [];
        state.filterPot = null;
        state.lastBackupAt = null;
        state.month = currentMonth();
        render();
        editBudget(true);
      },
    });
  }

  function newPot(): void {
    const month = currentMonth();
    openPotSheet({
      amount: null,
      monthLabel: monthLabel(month),
      otherPotsTotal: potBudgetTotal(state.pots, state.potBudgets, month),
      totalBudget: budgetFor(state.budgets, month),
      validate: (name, amount) => validatePot(state.pots, { name, amount }),
      onSave: async (name, amount) => {
        const r = addPot(state.pots, state.potBudgets, { name, amount }, crypto.randomUUID(), month, new Date());
        await db.savePots(r.pots, r.potBudgets);
        state.pots = r.pots;
        state.potBudgets = r.potBudgets;
        render();
      },
    });
  }

  function editPot(pot: Pot): void {
    const month = currentMonth();
    const own = potBudgetFor(state.potBudgets, pot.id, month);
    const showEntries = () => {
      state.filterPot = pot.id;
      render();
      view.querySelector('.section-title')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    if (pot.archived) {
      showEntries();
      return;
    }
    openPotSheet({
      pot,
      amount: own,
      monthLabel: monthLabel(month),
      otherPotsTotal: potBudgetTotal(state.pots, state.potBudgets, month) - own,
      totalBudget: budgetFor(state.budgets, month),
      validate: (name, amount) => validatePot(state.pots, { name, amount }, pot.id),
      onSave: async (name, amount) => {
        const r = updatePot(state.pots, state.potBudgets, pot.id, { name, amount }, month);
        await db.savePots(r.pots, r.potBudgets);
        state.pots = r.pots;
        state.potBudgets = r.potBudgets;
        render();
      },
      onShowEntries: showEntries,
      onDelete: async () => {
        const r = removePot(state.pots, state.potBudgets, state.entries, pot.id);
        await db.savePots(r.pots, r.potBudgets);
        state.pots = r.pots;
        state.potBudgets = r.potBudgets;
        if (state.filterPot === pot.id) state.filterPot = null;
        render();
        toast(`Topf «${pot.name}» gelöscht`);
      },
    });
  }

  function potSection(isCurrent: boolean): HTMLElement | null {
    const list = potSummaries(state.entries, state.pots, state.potBudgets, state.month);
    const canAdd = isCurrent && activePots(state.pots).length < POT_MAX;
    if (list.length === 0) {
      return canAdd
        ? h('button', { class: 'pot-add pot-add-solo', type: 'button', onclick: newPot }, icon(ICONS.plus), 'Topf hinzufügen, z. B. «Essen»')
        : null;
    }
    const items = list.map((p) => {
      const pct = p.budget > 0 ? Math.min(100, (p.spent / p.budget) * 100) : p.spent > 0 ? 100 : 0;
      return h('li', null,
        h('button', {
          class: `pot-btn ${p.level}`, type: 'button', 'data-pot': p.pot.id,
          'aria-label': `${p.pot.name}: noch ${formatChf(p.available)} von ${formatChf(p.budget)} Franken`,
          onclick: () => editPot(p.pot),
        },
          h('span', { class: `dot c${p.pot.color}`, 'aria-hidden': 'true' }),
          h('span', { class: 'pot-name' }, p.pot.archived ? `${p.pot.name} (gelöscht)` : p.pot.name),
          h('span', { class: 'pot-left' }, formatChf(p.available), h('small', null, p.pot.archived ? '' : ` / ${formatChf(p.budget)}`)),
          h('span', { class: 'mini', 'aria-hidden': 'true' }, barFill(pct)),
        ));
    });
    if (canAdd) items.push(h('li', null, h('button', { class: 'pot-add', type: 'button', onclick: newPot }, icon(ICONS.plus), 'Topf')));
    return h('div', null, h('h2', { class: 'section-title pots-title' }, 'Töpfe · übrig'), h('ul', { class: 'pots' }, ...items));
  }

  function row(entry: Entry): HTMLElement {
    const isExpense = entry.amount < 0;
    const pot = potById(state.pots, entry.category);
    const title = entry.note || (isExpense ? 'Ausgabe' : 'Einnahme');
    const inner = h(
      'button',
      { class: 'row-inner', type: 'button', 'aria-label': `${title}, ${shortDate(entry.date)}, ${formatChf(entry.amount, { sign: true })} Franken. Antippen zum Ändern.` },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, title),
        h('span', { class: 'row-sub' },
          pot ? h('span', { class: `dot c${pot.color}`, 'aria-hidden': 'true' }) : null,
          [shortDate(entry.date), pot ? pot.name : entry.note ? (isExpense ? 'Ausgabe' : 'Einnahme') : null].filter(Boolean).join(' · ')),
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
    const filter = potById(state.pots, state.filterPot);
    const list = entriesOf(state.entries, state.month).filter((e) => !filter || e.category === filter.id);
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
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Einstellungen', onclick: showSettings }, icon(ICONS.gear)),
      ),
      backupDue(state.lastBackupAt, state.entries, new Date()) && h('div', { class: 'banner', role: 'note' },
        h('span', null, h('strong', null, 'Backup fällig'), h('br'), state.lastBackupAt ? 'Das letzte ist über 30 Tage alt.' : 'Sichere deine Buchungen in «Dateien».'),
        h('button', { class: 'btn small', type: 'button', onclick: () => void makeBackup({
          data,
          onBackupDone: async (iso) => { await db.setLastBackup(iso); state.lastBackupAt = iso; render(); },
        }) }, 'Jetzt sichern')),
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
      potSection(isCurrent),
      h('h2', { class: 'section-title' }, 'Buchungen'),
      filter && h('p', { class: 'filter' },
        h('span', null, 'Nur ', h('strong', null, filter.name)),
        h('button', { type: 'button', onclick: () => ((state.filterPot = null), render()) }, 'Alle zeigen')),
      list.length
        ? h('ul', { class: 'rows' }, ...list.map(row))
        : h('p', { class: 'empty' }, filter ? `Keine Buchungen in «${filter.name}» in diesem Monat.` : isCurrent ? 'Noch keine Buchungen in diesem Monat. Tippe auf «Erfassen».' : 'Keine Buchungen in diesem Monat.'),

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
