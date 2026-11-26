# Kassenbuch

Ein einfaches Kassenbuch für das iPhone: verfügbares Monatsbudget, Ausgaben, Einnahmen, letzte Buchungen und ein Knopf zum Erfassen. Die App läuft offline als PWA. Die Daten bleiben im Gerät (IndexedDB), es gibt keinen Server.

Konzept: «Kassenbuch – Konzept» (Claude Docs).

## Entwicklung

```bash
npm install
npm test        # Rechenkern-Tests
npm run dev     # lokaler Server
npm run build   # statische Dateien in dist/
```

## Aufbau

- `src/core/` – Rechenkern ohne Bildschirm: Beträge in Rappen, Monate (Europe/Zurich), Budget, Vergleich, Backup, CSV
- `src/storage/` – IndexedDB im Gerät
- `src/ui/`, `src/app.ts` – Bildschirm ohne Framework, Texte nie als HTML
- `test/` – Tests gegen Rechenfehler
- `scripts/ui-smoke.mjs` – Browser-Durchlauf in iPhone-Grösse (`npm run build && npm run smoke`)

## Stand

- Etappe 1: Rechenkern und Tests ✓
- Etappe 2: Startbildschirm und Erfassen ✓
- Etappe 3: Einstellungen, Backup, CSV ✓
- Etappe 4: Offline und Veröffentlichen (GitHub Pages) ✓

## Veröffentlichen

Jeder Push auf `main` startet `.github/workflows/pages.yml`: Typen, Tests, Build und Browser-Durchlauf. Nur wenn alles grün ist, wird `dist/` auf GitHub Pages veröffentlicht. Einmalig nötig: unter Settings → Pages bei «Source» **GitHub Actions** wählen.

## Datenschutz

Die App speichert nur Datum, Betrag, kurze Notiz und Monatsbudget, und zwar ausschliesslich in IndexedDB auf dem Gerät. Sie sendet keine Daten, lädt keine fremden Skripte und hat eine strikte Content Security Policy. In diesem Repo liegen keine echten Daten.
