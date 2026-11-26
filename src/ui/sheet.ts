import { h, icon, ICONS } from './dom';

/**
 * Blatt, das von unten hochfährt. Nur eines ist gleichzeitig offen.
 * Schliessen: Hintergrund antippen, ✕, Escape oder nach unten wischen.
 */
export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
}

let current: Sheet | null = null;

export function openSheet(title: string, build: (body: HTMLElement, close: () => void) => void, onClose?: () => void): Sheet {
  current?.close();
  const backdrop = h('div', { class: 'backdrop' });
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schliessen' }, icon(ICONS.close));
  const grip = h('div', { class: 'grip', 'aria-hidden': 'true' });
  const panel = h(
    'section',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    grip,
    h('header', { class: 'sheet-head' }, h('h2', null, title), closeBtn),
    body,
  );
  const root = h('div', { class: 'sheet-root' }, backdrop, panel);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    root.classList.remove('open');
    const remove = () => root.remove();
    panel.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 400);
    if (current === sheet) current = null;
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  // Nach unten wischen am Griff oder Kopf schliesst das Blatt
  let startY: number | null = null;
  const head = panel.querySelector('.sheet-head') as HTMLElement;
  for (const zone of [grip, head]) {
    zone.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
    });
  }
  panel.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    const dy = Math.max(0, e.clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  });
  const end = (e: PointerEvent) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    panel.style.transform = '';
    if (dy > 90) close();
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);

  const sheet: Sheet = { el: root, body, close };
  build(body, close);
  document.body.append(root);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  current = sheet;
  return sheet;
}

/** Kurze Meldung unten, optional mit Aktion («Widerrufen») */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, action?: { label: string; run: () => void }, ms = 3000): void {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  // Ist ein Blatt offen, erscheint die Meldung oben, damit sie keine Knöpfe verdeckt
  const top = document.querySelector('.sheet-root.open') !== null;
  const el = h('div', { class: top ? 'toast top' : 'toast', role: 'status' }, h('span', null, message));
  if (action) {
    el.append(
      h('button', {
        type: 'button',
        onclick: () => {
          el.remove();
          action.run();
        },
      }, action.label),
    );
  }
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
