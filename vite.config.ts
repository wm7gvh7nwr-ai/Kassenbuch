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

export default defineConfig({
  base: './',
  plugins: [csp()],
  build: { target: 'safari16', assetsInlineLimit: 0, sourcemap: false },
  test: { include: ['test/**/*.test.ts'] },
});
