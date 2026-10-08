import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Files from public/ the offline cache should hold besides the built bundle. */
const PUBLIC_PRECACHE = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-72.png', '/privacy.html'];

/**
 * Writes dist/sw.js from pwa/sw.template.js with the exact list of built files to cache, and a version
 * that changes whenever any of them (or the worker itself) changes, so old caches are cleaned up.
 */
function serviceWorker(): Plugin {
  return {
    name: 'messed-up-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const template = readFileSync('pwa/sw.template.js', 'utf8');
      const built = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map')).sort();
      const precache = ['/', ...built.map((f) => `/${f}`), ...PUBLIC_PRECACHE];
      const version = createHash('sha256').update(template).update(built.join('|')).digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
  build: { target: 'es2022', sourcemap: false },
  // `npm run dev:api` serves the API locally (with an in-memory Redis unless Upstash env vars are set)
  server: { proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false, xfwd: true } } },
  test: { include: ['tests/**/*.test.ts'] },
});
