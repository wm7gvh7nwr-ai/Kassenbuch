import { toast } from './ui/sheet';

/** Service Worker anmelden und bei einer neuen Version einen Hinweis zeigen */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  let reloading = false;
  // Beim allerersten Besuch übernimmt der Service Worker die Seite ohne Neuladen.
  // Neu geladen wird nur, wenn eine neue Version eine alte ablöst.
  let hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  void navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    const offer = (worker: ServiceWorker) =>
      toast('Neue Version bereit', { label: 'Laden', run: () => worker.postMessage('skipWaiting') }, 60_000);
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // Beim Zurückkehren in die App nach Updates schauen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
  }).catch((e: unknown) => console.warn('Service Worker nicht verfügbar', e));
}

/** iOS bitten, die Daten dauerhaft aufzubewahren */
export async function askPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* nicht unterstützt: kein Problem */
  }
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export function isAppleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
