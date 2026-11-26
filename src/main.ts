import './styles.css';
import { startApp } from './app';
import { askPersistentStorage, isAppleMobile, isStandalone, registerServiceWorker } from './pwa';
import { showInstallHint } from './ui/installHint';

const root = document.getElementById('app')!;

function start(): void {
  root.textContent = '';
  void askPersistentStorage();
  startApp(root).catch((e: unknown) => {
    console.error(e);
    root.textContent = '';
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent =
      'Die App konnte ihre Daten nicht öffnen. Bitte schliesse sie ganz und öffne sie neu. ' +
      'Im privaten Safari-Modus funktioniert sie nicht.';
    root.append(p);
  });
}

registerServiceWorker();

let skipHint = false;
try {
  skipHint = sessionStorage.getItem('kb-browser-ok') === '1';
} catch {
  /* ohne sessionStorage: Hinweis zeigen */
}

if (isAppleMobile() && !isStandalone() && !skipHint) {
  showInstallHint(root, () => {
    try {
      sessionStorage.setItem('kb-browser-ok', '1');
    } catch {
      /* egal */
    }
    start();
  });
} else {
  start();
}
