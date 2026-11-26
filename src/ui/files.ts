/**
 * Datei weitergeben: auf dem iPhone über das Teilen-Menü («In Dateien sichern»,
 * iCloud Drive, AirDrop), sonst als normaler Download.
 */
export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareFile(content: string, name: string, type: string): Promise<ShareResult> {
  const file = new File([content], name, { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Teilen nicht möglich (z. B. ohne Nutzergeste): auf Download ausweichen
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Datei auswählen lassen und als Text lesen. null = abgebrochen. */
export function pickTextFile(accept: string, maxBytes: number): Promise<{ text: string } | { error: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.className = 'hidden-file';
    let settled = false;
    const finish = (v: { text: string } | { error: string } | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return finish(null);
      if (f.size > maxBytes) return finish({ error: 'Die Datei ist zu gross.' });
      try {
        finish({ text: await f.text() });
      } catch {
        finish({ error: 'Die Datei konnte nicht gelesen werden.' });
      }
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}
