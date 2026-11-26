import './styles.css';
import { startApp } from './app';

const root = document.getElementById('app')!;

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
