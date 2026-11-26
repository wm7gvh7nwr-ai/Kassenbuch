import { keypadDisplay, pressKey, type Key } from '../core/keypad';
import { parseAmount, toInputString } from '../core/money';
import { h, icon, ICONS } from './dom';
import { openSheet } from './sheet';

/** Monatsbudget festlegen, mit derselben Tastatur wie beim Erfassen */
export function openBudgetSheet(o: {
  current: number | null;
  first: boolean;
  monthLabel: string;
  onSave: (rappen: number) => Promise<void>;
}): void {
  let value = o.current ? toInputString(o.current) : '';
  openSheet(o.first ? 'Willkommen' : 'Monatsbudget', (body, close) => {
    const amount = h('output', { class: 'entry-amount' });
    const save = h('button', { class: 'btn primary block', type: 'button' }, o.first ? 'Los geht’s' : 'Speichern');
    const render = () => {
      amount.textContent = `CHF ${keypadDisplay(value)}`;
      save.toggleAttribute('disabled', parseAmount(value) === null || value === '');
    };
    const pad = h('div', { class: 'keypad' });
    const keys: Array<[Key, string | SVGSVGElement]> = [
      ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'],
      ['7', '7'], ['8', '8'], ['9', '9'], ['.', '.'], ['0', '0'], ['back', icon(ICONS.del, 'Löschen')],
    ];
    for (const [k, label] of keys)
      pad.append(h('button', {
        type: 'button', class: 'key', 'data-key': k,
        'aria-label': k === 'back' ? 'Letzte Ziffer löschen' : k === '.' ? 'Punkt' : k,
        onclick: () => ((value = pressKey(value, k)), render()),
      }, label));
    save.addEventListener('click', async () => {
      const r = parseAmount(value);
      if (r === null) return;
      save.setAttribute('disabled', '');
      await o.onSave(r);
      close();
    });
    body.append(
      h('p', { class: 'lead' }, o.first
        ? 'Wie viel willst du pro Monat ausgeben? Du kannst den Betrag jederzeit ändern.'
        : `Gilt ab ${o.monthLabel}. Frühere Monate behalten ihr Budget.`),
      amount,
      pad,
      save,
    );
    render();
  });
}
