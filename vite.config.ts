import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: '/Tycoon-/',
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
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
