import { keypadDisplay, pressKey, type Key } from '../core/keypad';
import type { Pot } from '../core/model';
import { formatChf, parseAmount, toInputString } from '../core/money';
import { POT_NAME_MAX } from '../core/pots';
import { h, icon, ICONS } from './dom';
import { openSheet } from './sheet';

export interface PotSheetOptions {
  pot?: Pot;
  amount: number | null;
  monthLabel: string;
  /** Für den Hinweis, wenn alle Töpfe zusammen mehr als das Gesamtbudget sind */
  otherPotsTotal: number;
  totalBudget: number | null;
  validate: (name: string, amount: number) => string | null;
  onSave: (name: string, amount: number) => Promise<void>;
  onShowEntries?: () => void;
  onDelete?: () => Promise<void>;
}

/** Topf anlegen oder ändern: Name und Monatsbetrag */
export function openPotSheet(o: PotSheetOptions): void {
  let value = o.amount !== null ? toInputString(o.amount) : '';
  openSheet(o.pot ? o.pot.name : 'Neuer Topf', (body, close) => {
    const name = h('input', {
      class: 'input', type: 'text', maxlength: POT_NAME_MAX, placeholder: 'Name, z. B. Essen',
      autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'Name des Topfs',
    });
    name.value = o.pot?.name ?? '';
    const amount = h('output', { class: 'entry-amount' });
    const hint = h('p', { class: 'hint center' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { class: 'btn primary block', type: 'button' }, o.pot ? 'Speichern' : 'Topf anlegen');

    const render = () => {
      amount.textContent = `CHF ${keypadDisplay(value)}`;
      const r = parseAmount(value) ?? 0;
      const sum = o.otherPotsTotal + r;
      hint.textContent =
        o.totalBudget !== null && sum > o.totalBudget
          ? `Alle Töpfe zusammen: CHF ${formatChf(sum)} – mehr als dein Gesamtbudget von CHF ${formatChf(o.totalBudget)}.`
          : `Pro Monat, gilt ab ${o.monthLabel}. Was übrig bleibt, verfällt am Monatsende.`;
      save.toggleAttribute('disabled', value === '' || name.value.trim() === '');
    };
    name.addEventListener('input', () => ((error.textContent = ''), render()));
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());

    const pad = h('div', { class: 'keypad' });
    const keys: Array<[Key, string | SVGSVGElement]> = [
      ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'],
      ['7', '7'], ['8', '8'], ['9', '9'], ['.', '.'], ['0', '0'], ['back', icon(ICONS.del, 'Löschen')],
    ];
    for (const [k, label] of keys)
      pad.append(h('button', {
        type: 'button', class: 'key', 'data-key': k,
        'aria-label': k === 'back' ? 'Letzte Ziffer löschen' : k === '.' ? 'Punkt' : k,
        onclick: () => ((value = pressKey(value, k)), (error.textContent = ''), render()),
      }, label));

    save.addEventListener('click', async () => {
      const r = parseAmount(value);
      const problem = r === null ? 'Bitte einen Betrag eingeben.' : o.validate(name.value, r);
      if (problem || r === null) {
        error.textContent = problem ?? '';
        return;
      }
      save.setAttribute('disabled', '');
      try {
        await o.onSave(name.value, r);
        close();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : 'Speichern hat nicht geklappt.';
        save.removeAttribute('disabled');
      }
    });

    body.append(name, amount, hint, pad, error, save);
    if (o.onShowEntries) {
      const show = o.onShowEntries;
      body.append(h('button', { class: 'btn plain block', type: 'button', onclick: () => (close(), show()) }, 'Nur Buchungen dieses Topfs zeigen'));
    }
    if (o.onDelete) {
      const del = o.onDelete;
      body.append(h('button', {
        class: 'btn danger-text block', type: 'button',
        onclick: async () => {
          await del();
          close();
        },
      }, 'Topf löschen'));
    }
    render();
  });
}
