import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Strikte Content Security Policy, nur im fertigen Build
 * (der Entwicklungsserver braucht eingebettete Styles).
 * connect-src 'self': die App darf nur ihre eigene Adresse ansprechen, für Updates.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "font-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'kassenbuch-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

/**
 * Erzeugt sw.js mit der Liste aller gebauten Dateien und einer Version,
 * die sich nur ändert, wenn sich der Inhalt ändert.
 */
function serviceWorker(): Plugin {
  return {
    name: 'kassenbuch-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const publicFiles = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
      const hash = createHash('sha256');
      for (const f of files.sort()) {
        const item = bundle[f]!;
        hash.update(f);
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      for (const f of publicFiles) hash.update(readFileSync(`public/${f}`));
      const version = hash.digest('hex').slice(0, 12);
      const assets = ['./', ...files.map((f) => `./${f}`), ...publicFiles.map((f) => `./${f}`)];
      const code = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__ASSETS__', JSON.stringify(assets, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [csp(), serviceWorker()],
  build: { target: 'safari16', assetsInlineLimit: 0, sourcemap: false },
  test: { include: ['test/**/*.test.ts'] },
});
