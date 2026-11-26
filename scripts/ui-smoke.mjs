// Browser-Durchlauf in iPhone-Grösse gegen den fertigen Build (vite preview).
// Aufruf: npm run build && node scripts/ui-smoke.mjs
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

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

  check('Keine Fehler im Browser', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
