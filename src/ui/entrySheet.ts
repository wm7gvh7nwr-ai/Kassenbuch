import { keypadDisplay, pressKey, type Key } from '../core/keypad';
import { cleanNote, NOTE_MAX, validateInput, type Entry, type EntryInput } from '../core/model';
import { parseAmount, toInputString } from '../core/money';
import { h, icon, ICONS } from './dom';
import { openSheet } from './sheet';

export interface EntrySheetOptions {
  title: string;
  /** Bestehende Buchung (Ändern) oder Vorgaben (Neu) */
  entry?: Entry;
  defaultDate: string;
  submitLabel: string;
  onSubmit: (input: EntryInput) => Promise<void>;
  onDelete?: () => void;
}

/** Erfassen und Ändern in einem Blatt: Art, Betrag, Notiz, Datum */
export function openEntrySheet(o: EntrySheetOptions): void {
  let kind: EntryInput['kind'] = o.entry ? (o.entry.amount < 0 ? 'expense' : 'income') : 'expense';
  let value = o.entry ? toInputString(o.entry.amount) : '';

  openSheet(o.title, (body, close) => {
    const segExpense = h('button', { type: 'button', role: 'tab' }, 'Ausgabe');
    const segIncome = h('button', { type: 'button', role: 'tab' }, 'Einnahme');
    const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Art' }, segExpense, segIncome);
    const amount = h('output', { class: 'entry-amount', 'aria-live': 'polite' });
    const note = h('input', {
      class: 'input',
      type: 'text',
      maxlength: NOTE_MAX,
      placeholder: 'Wofür? (freiwillig)',
      autocomplete: 'off',
      enterkeyhint: 'done',
      'aria-label': 'Notiz',
    });
    note.value = o.entry?.note ?? '';
    const date = h('input', { class: 'input date', type: 'date', required: true, 'aria-label': 'Datum' });
    date.value = o.entry?.date ?? o.defaultDate;
    const error = h('p', { class: 'form-error', role: 'alert' });
    const submit = h('button', { class: 'btn primary block', type: 'button' }, o.submitLabel);

    const render = () => {
      segExpense.setAttribute('aria-selected', String(kind === 'expense'));
      segIncome.setAttribute('aria-selected', String(kind === 'income'));
      amount.textContent = `CHF ${keypadDisplay(value)}`;
      amount.classList.toggle('income', kind === 'income');
      submit.toggleAttribute('disabled', !parseAmount(value));
    };
    segExpense.addEventListener('click', () => ((kind = 'expense'), render()));
    segIncome.addEventListener('click', () => ((kind = 'income'), render()));

    const keys: Array<[Key, string | SVGSVGElement]> = [
      ['1', '1'], ['2', '2'], ['3', '3'],
      ['4', '4'], ['5', '5'], ['6', '6'],
      ['7', '7'], ['8', '8'], ['9', '9'],
      ['.', '.'], ['0', '0'], ['back', icon(ICONS.del, 'Löschen')],
    ];
    const pad = h('div', { class: 'keypad' });
    for (const [k, label] of keys) {
      pad.append(
        h('button', {
          type: 'button',
          class: 'key',
          'data-key': k,
          'aria-label': k === 'back' ? 'Letzte Ziffer löschen' : k === '.' ? 'Punkt' : k,
          onclick: () => {
            value = pressKey(value, k);
            error.textContent = '';
            render();
          },
        }, label),
      );
    }

    submit.addEventListener('click', async () => {
      const input: EntryInput = { kind, value: parseAmount(value) ?? 0, note: cleanNote(note.value), date: date.value };
      const problem = validateInput(input);
      if (problem) {
        error.textContent = problem;
        return;
      }
      submit.setAttribute('disabled', '');
      try {
        await o.onSubmit(input);
        close();
      } catch (e) {
        error.textContent = 'Speichern hat nicht geklappt. Bitte nochmals versuchen.';
        submit.removeAttribute('disabled');
        console.error(e);
      }
    });
    note.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') note.blur();
    });

    body.append(
      seg,
      amount,
      h('div', { class: 'entry-fields' }, note, date),
      pad,
      error,
      submit,
    );
    if (o.onDelete) {
      const del = o.onDelete;
      body.append(h('button', { class: 'btn danger-text block', type: 'button', onclick: () => (close(), del()) }, 'Buchung löschen'));
    }
    render();
  });
}
