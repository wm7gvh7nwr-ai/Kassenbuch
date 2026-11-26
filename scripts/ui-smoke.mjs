// Browser-Durchlauf in iPhone-Grösse gegen den fertigen Build (vite preview).
// Aufruf: npm run build && node scripts/ui-smoke.mjs
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4179;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
server.stderr.on('data', (d) => process.stderr.write(d));
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('Local') && r()));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' ' + detail}`);
  if (!ok) failed++;
};
try {
  const page = await browser.newPage();
  await page.emulateTimezone('Europe/Zurich');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const shots = process.env.SHOTS;
  const shot = async (n) => shots && page.screenshot({ path: `${shots}/${n}.png` });
  const text = (sel) => page.$eval(sel, (e) => e.textContent.trim());
  const tapKeys = async (s) => {
    for (const k of s) await page.click(`.sheet .key[data-key="${k === '<' ? 'back' : k}"]`);
  };
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.sheet-root.open');
  await sleep(350);
  await shot('01-willkommen');
  check('Erster Start fragt nach Budget', (await text('.sheet h2')) === 'Willkommen');
  await tapKeys('1800');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Verfügbar = Budget', (await text('.available')) === 'CHF 1’800.00', await text('.available'));
  await shot('02-leer');

  // Ausgabe erfassen
  await page.click('.fab');
  await sleep(350);
  await tapKeys('12.5');
  await page.type('.sheet input[type=text]', 'Kaffee');
  await shot('03-erfassen');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Ausgabe abgezogen', (await text('.available')) === 'CHF 1’787.50', await text('.available'));
  check('Liste zeigt Buchung', (await text('.row-title')) === 'Kaffee');

  // Einnahme erfassen
  await page.click('.fab');
  await sleep(350);
  await page.click('.sheet .seg button:nth-child(2)');
  await tapKeys('2350');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Einnahme erhöht Verfügbar nicht', (await text('.available')) === 'CHF 1’787.50');
  check('Einnahmen-Kachel', (await text('.tile:nth-child(2) strong')) === '2’350.00');

  // Grosse Ausgabe → orange
  await page.click('.fab');
  await sleep(350);
  await tapKeys('1450');
  await page.type('.sheet input[type=text]', 'Miete');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Ampel orange ab 80 %', await page.$eval('.hero', (e) => e.classList.contains('warn')));
  await shot('04-orange');

  // Ändern
  const rows = await page.$$('.row-inner');
  await page.evaluate(() => [...document.querySelectorAll('.row-title')].find((e) => e.textContent === 'Miete').closest('button').click());
  await sleep(350);
  check('Ändern-Blatt zeigt Betrag', (await text('.sheet .entry-amount')) === 'CHF 1450');
  await tapKeys('<<<<1300');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Änderung gespeichert', (await text('.available')) === 'CHF 487.50', await text('.available'));

  // Löschen mit Widerrufen
  await page.evaluate(() => [...document.querySelectorAll('.row-title')].find((e) => e.textContent === 'Kaffee').closest('button').click());
  await sleep(350);
  await page.click('.sheet .btn.danger-text');
  await sleep(450);
  check('Gelöscht', (await text('.available')) === 'CHF 500.00');
  await shot('05-geloescht');
  await page.click('.toast button');
  await sleep(300);
  check('Widerrufen stellt wieder her', (await text('.available')) === 'CHF 487.50');

  // Wischen zum Löschen
  const box = await (await page.$('.row-inner')).boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width - 20 - i * 18, box.y + box.height / 2);
  await page.mouse.up();
  await sleep(500);
  check('Wischen löscht', (await page.$$('.row')).length === 2, String((await page.$$('.row')).length));
  await page.click('.toast button');
  await sleep(300);

  // Bleibt nach Neuladen erhalten
  await page.reload();
  await page.waitForSelector('.available');
  check('Daten bleiben nach Neuladen', (await text('.available')) === 'CHF 487.50' && (await page.$$('.row')).length === 3);
  check('Kein Willkommen beim zweiten Start', !(await page.$('.sheet-root')));

  // Monat blättern
  await page.click('.topbar .icon-btn[aria-label="Vorheriger Monat"]');
  check('Vormonat leer', (await page.$$('.row')).length === 0 && (await text('.available')) === 'CHF 1’800.00');
  await page.click('.fab');
  await sleep(350);
  const dateVal = await page.$eval('.sheet input[type=date]', (e) => e.value);
  check('Datum im Vormonat = letzter Tag', /-(28|29|30|31)$/.test(dateVal), dateVal);
  await tapKeys('900');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  await page.click('.topbar .month');
  check('Vergleichszeile erscheint', (await page.$('.compare')) !== null);
  await shot('06-vergleich');

  // Budget ändern
  await page.click('.topbar .icon-btn[aria-label="Einstellungen"]');
  await sleep(350);
  await page.click('.sheet .list-btn');
  await sleep(450);
  await tapKeys('<<<<<<<2000');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Neues Budget', (await text('.available')) === 'CHF 687.50', await text('.available'));
  await page.click('.topbar .icon-btn[aria-label="Vorheriger Monat"]');
  check('Vormonat behält altes Budget', (await text('.of')).includes('1’800.00'), await text('.of'));
  await page.click('.topbar .month');

  // Bösartige Notiz bleibt Text
  await page.click('.fab');
  await sleep(350);
  await tapKeys('1');
  await page.type('.sheet input[type=text]', '<img src=x onerror=alert(1)>');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Notiz wird als Text angezeigt', (await page.$$('.row-title img')).length === 0 && (await text('.row-title')).startsWith('<img'));
  await shot('07-liste');

  // ---- Etappe 3: Backup, CSV, Löschen, Einlesen ----
  const dl = mkdtempSync(join(tmpdir(), 'kb-dl-'));
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  const openSettings = async () => {
    await page.click('.topbar .icon-btn[aria-label="Einstellungen"]');
    await sleep(400);
  };
  const clickItem = async (label) => {
    await page.evaluate((l) => [...document.querySelectorAll('.sheet .list-btn')].find((b) => b.textContent.startsWith(l)).click(), label);
    await sleep(500);
  };
  const waitFile = async (ext) => {
    for (let i = 0; i < 40; i++) {
      const f = readdirSync(dl).find((n) => n.endsWith(ext));
      if (f) return join(dl, f);
      await sleep(100);
    }
    return null;
  };
  await openSettings();
  check('Noch nie gesichert', (await page.$eval('.sheet .list-btn:nth-child(1)', () => document.querySelectorAll('.sheet .list-group')[1].textContent)).includes('Noch nie'));
  await shot('08-einstellungen');
  await clickItem('Backup erstellen');
  const backupPath = await waitFile('.json');
  const backup = backupPath && JSON.parse(readFileSync(backupPath, 'utf8'));
  check('Backup-Datei erstellt', backup?.app === 'kassenbuch' && backup.entries.length === 5, backupPath ?? 'keine Datei');
  await openSettings();
  await clickItem('Als CSV exportieren');
  const csvPath = await waitFile('.csv');
  const csv = csvPath && readFileSync(csvPath, 'utf8');
  check('CSV exportiert', !!csv && csv.includes('Datum;Betrag CHF;Art;Topf;Notiz') && csv.includes("'<img") === false && csv.includes('-1300.00'), csvPath ?? '');
  page.keyboard.press('Escape');
  await sleep(400);

  // Alles löschen
  await openSettings();
  await clickItem('Alle Daten löschen');
  check('Löschen gesperrt bis bestätigt', await page.$eval('.sheet .btn.danger', (b) => b.disabled));
  await page.click('.sheet .check label');
  check('Häkchen gibt Löschen frei', !(await page.$eval('.sheet .btn.danger', (b) => b.disabled)));
  await page.click('.sheet .btn.danger');
  await sleep(700);
  check('Nach Löschen: Willkommen', (await text('.sheet h2')) === 'Willkommen');
  await page.keyboard.press('Escape');
  await sleep(400);
  check('Liste leer', (await page.$$('.row')).length === 0);

  // Kaputte Datei wird abgelehnt
  const badPath = join(dl, 'kaputt.json');
  writeFileSync(badPath, JSON.stringify({ ...backup, entries: [{ ...backup.entries[0], amount: 12.5 }] }));
  await openSettings();
  let [chooser] = await Promise.all([page.waitForFileChooser(), clickItem('Backup einlesen')]);
  await chooser.accept([badPath]);
  await sleep(500);
  check('Kaputte Datei abgelehnt', (await text('.toast')).includes('Betrag') && (await page.$$('.row')).length === 0, await text('.toast'));

  // Altes Backup einlesen → Erinnerung erscheint
  const oldPath = join(dl, 'alt.json');
  writeFileSync(oldPath, JSON.stringify({ ...backup, entries: backup.entries.map((e) => ({ ...e, createdAt: '2026-01-05T10:00:00.000Z' })) }));
  await page.keyboard.press('Escape');
  await sleep(400);
  await openSettings();
  [chooser] = await Promise.all([page.waitForFileChooser(), clickItem('Backup einlesen')]);
  await chooser.accept([oldPath]);
  await sleep(600);
  check('Vorschau zeigt Anzahl', (await text('.sheet .big-line')) === '5 Buchungen');
  await shot('09-einlesen');
  await page.click('.sheet .btn.primary');
  await sleep(600);
  check('Eingelesen', (await text('.available')) === 'CHF 686.50' && (await page.$$('.row')).length === 4, await text('.available'));
  check('Backup-Erinnerung erscheint', !!(await page.$('.banner')));
  await shot('10-erinnerung');
  await page.click('.banner .btn');
  await sleep(600);
  check('Erinnerung weg nach Backup', !(await page.$('.banner')));
  await page.reload();
  await page.waitForSelector('.available');
  check('Backup-Datum bleibt gespeichert', !(await page.$('.banner')));

  // ---- Etappe 4: Offline und Hinweis ----
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.available');
  check('Service Worker steuert die Seite', await page.evaluate(() => !!navigator.serviceWorker.controller));
  await page.setOfflineMode(true);
  await page.reload();
  await page.waitForSelector('.available', { timeout: 5000 }).catch(() => null);
  check('Startet offline mit allen Daten', (await page.$('.available')) !== null && (await text('.available')) === 'CHF 686.50');
  await page.click('.fab');
  await sleep(350);
  await tapKeys('5');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Erfassen offline', (await text('.available')) === 'CHF 681.50');
  await page.setOfflineMode(false);

  // ---- Töpfe ----
  const potRow = (name) => page.evaluate((n) => {
    const b = [...document.querySelectorAll('.pot-btn')].find((x) => x.querySelector('.pot-name').textContent.startsWith(n));
    return b ? b.querySelector('.pot-left').textContent : null;
  }, name);
  check('Ohne Töpfe: Knopf «Topf hinzufügen»', !!(await page.$('.pot-add-solo')));
  await page.click('.pot-add-solo');
  await sleep(400);
  await page.type('.sheet input[type=text]', 'Essen');
  await tapKeys('400');
  await shot('12-topf-neu');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Topf angelegt', (await potRow('Essen')) === '400.00 / 400.00', String(await potRow('Essen')));
  await page.click('.pot-add:not(.pot-add-solo)');
  await sleep(400);
  await page.type('.sheet input[type=text]', 'essen');
  await tapKeys('10');
  await page.click('.sheet .btn.primary');
  await sleep(300);
  check('Doppelter Name abgelehnt', (await text('.sheet .form-error')).includes('schon'));
  await page.$eval('.sheet input[type=text]', (e) => (e.value = ''));
  await page.type('.sheet input[type=text]', 'Freizeit');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Zweiter Topf', (await potRow('Freizeit')) === '10.00 / 10.00', String(await potRow('Freizeit')));

  const before = await text('.available');
  await page.click('.fab');
  await sleep(350);
  check('Erfassen zeigt Töpfe, «Ohne» vorgewählt', (await page.$$eval('.sheet .chip', (c) => c.map((x) => x.textContent + ':' + x.getAttribute('aria-checked')))).join(',') === 'Ohne:true,Essen:false,Freizeit:false');
  await page.evaluate(() => [...document.querySelectorAll('.sheet .chip')].find((c) => c.textContent === 'Essen').click());
  await tapKeys('34.6');
  await page.type('.sheet input[type=text]', 'Migros');
  await shot('13-erfassen-topf');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Topf-Rest sinkt', (await potRow('Essen')) === '365.40 / 400.00', String(await potRow('Essen')));
  const parse = (t) => Number(t.replace(/[^0-9.−-]/g, '').replace('−', '-'));
  check('Gesamtbudget sinkt ebenfalls', Math.abs(parse(before) - parse(await text('.available')) - 34.6) < 0.001, `${before} → ${await text('.available')}`);
  check('Buchung zeigt Topf', (await page.$$eval('.row-sub', (r) => r.map((x) => x.textContent))).some((t) => t.includes('Essen')));
  await page.click('.fab');
  await sleep(350);
  await page.click('.sheet .seg button:nth-child(2)');
  check('Einnahme: keine Töpfe', await page.$eval('.sheet .chips', (c) => c.hidden));
  await page.keyboard.press('Escape');
  await sleep(400);
  await shot('14-toepfe');

  // Filter
  await page.evaluate(() => [...document.querySelectorAll('.pot-btn')].find((x) => x.textContent.includes('Essen')).click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('.sheet .btn.plain')].find((b) => b.textContent.startsWith('Nur')).click());
  await sleep(500);
  check('Filter zeigt nur Essen', (await page.$$('.row')).length === 1 && (await text('.filter')).includes('Essen'));
  await page.click('.filter button');
  check('Filter aufheben', (await page.$$('.row')).length > 1);

  // Betrag ändern
  await page.evaluate(() => [...document.querySelectorAll('.pot-btn')].find((x) => x.textContent.includes('Essen')).click());
  await sleep(400);
  await tapKeys('<<<<<500');
  await page.click('.sheet .btn.primary');
  await sleep(450);
  check('Topf-Betrag geändert', (await potRow('Essen')) === '465.40 / 500.00', String(await potRow('Essen')));

  // Löschen: mit Buchung → bleibt diesen Monat als «gelöscht»
  await page.evaluate(() => [...document.querySelectorAll('.pot-btn')].find((x) => x.textContent.includes('Essen')).click());
  await sleep(400);
  await page.click('.sheet .btn.danger-text');
  await sleep(500);
  check('Gelöschter Topf mit Buchungen bleibt sichtbar', (await page.$$eval('.pot-name', (n) => n.map((x) => x.textContent))).includes('Essen (gelöscht)'));
  await page.click('.fab');
  await sleep(350);
  check('… aber nicht mehr beim Erfassen', !(await page.$$eval('.sheet .chip', (c) => c.map((x) => x.textContent))).includes('Essen'));
  await page.keyboard.press('Escape');
  await sleep(400);
  await page.reload();
  await page.waitForSelector('.available');
  check('Töpfe bleiben nach Neuladen', (await potRow('Freizeit')) === '10.00 / 10.00');

  const ios = await browser.newPage();
  await ios.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1');
  await ios.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  ios.on('pageerror', (e) => errors.push(e.message));
  await ios.goto(`http://localhost:${PORT}/`);
  await ios.waitForSelector('.install');
  if (shots) await ios.screenshot({ path: `${shots}/11-hinweis.png` });
  check('iPhone in Safari: Hinweis zum Home-Bildschirm', (await ios.$eval('.install h1', (e) => e.textContent)) === 'Kassenbuch');
  await ios.click('.install .btn');
  await ios.waitForSelector('.available');
  check('«Trotzdem in Safari» öffnet die App', true);
  await ios.close();

  check('Keine Fehler im Browser', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
