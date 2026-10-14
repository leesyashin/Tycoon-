import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(r('./package.json'), 'utf8')) as { version: string };

export default defineConfig({
  base: '/Tycoon-/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@ui': r('./src/ui'),
      '@scenes': r('./src/scenes'),
      '@data': r('./src/data'),
      '@i18n': r('./src/i18n'),
    },
  },
  build: { chunkSizeWarningLimit: 1500 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.webmanifest wird direkt verlinkt
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,json,woff2,webmanifest}'] },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/index.ts'],
      thresholds: { lines: 90, statements: 90, functions: 90 },
    },
  },
});
