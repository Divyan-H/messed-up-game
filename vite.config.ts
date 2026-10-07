import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { target: 'es2022', sourcemap: false },
  // `npm run dev:api` serves the API locally (with an in-memory Redis unless Upstash env vars are set)
  server: { proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false, xfwd: true } } },
  test: { include: ['tests/**/*.test.ts'] },
});
