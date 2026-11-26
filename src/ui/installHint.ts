import { h } from './dom';

/**
 * Hinweis, wenn die App auf iPhone/iPad in Safari statt vom Home-Bildschirm
 * geöffnet wird. Safari und Home-Bildschirm haben getrennte Speicher.
 */
export function showInstallHint(root: HTMLElement, onContinue: () => void): void {
  const step = (n: number, text: string, strong: string) =>
    h('li', null, h('span', { class: 'step-n' }, String(n)), h('span', null, text, h('strong', null, strong)));
  root.append(
    h('main', { class: 'install' },
      h('img', { class: 'install-icon', src: './icons/icon-192.png', alt: '', width: 96, height: 96 }),
      h('h1', null, 'Kassenbuch'),
      h('p', { class: 'lead' }, 'Lege die App auf den Home-Bildschirm. Nur so bleiben deine Buchungen sicher gespeichert und die App läuft auch ohne Internet.'),
      h('ol', { class: 'steps' },
        step(1, 'In Safari unten auf ', '«•••» und dann «Teilen»'),
        step(2, 'Nach unten scrollen zu ', '«Zum Home-Bildschirm»'),
        step(3, 'Auf ', '«Hinzufügen»'),
        step(4, 'Kassenbuch vom ', 'Home-Bildschirm öffnen'),
      ),
      h('button', { class: 'btn plain block', type: 'button', onclick: onContinue }, 'Trotzdem in Safari ausprobieren'),
      h('p', { class: 'hint center' }, 'In Safari gespeicherte Buchungen sind getrennt von der App und können nach einigen Tagen ohne Nutzung gelöscht werden.'),
    ),
  );
}
