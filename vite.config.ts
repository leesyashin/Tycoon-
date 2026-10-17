import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
// Phaser-Quellen prüfen Build-Flags per `typeof FLAG` (im fertigen Paket ersetzt Webpack sie). Für den
// schlanken Build (src/phaserCustom.js) ersetzen wir sie selbst: ohne Sound, Camera3D, FB Instant.
const PHASER_FLAGS: Record<string, boolean> = {
  WEBGL_RENDERER: true,
  CANVAS_RENDERER: true,
  WEBGL_DEBUG: false,
  EXPERIMENTAL: false,
  PLUGIN_3D: false,
  PLUGIN_CAMERA3D: false,
  PLUGIN_FBINSTANT: false,
  FEATURE_SOUND: false,
};
const PHASER_SRC = /[\\/]phaser[\\/]src[\\/].*\.js$/;
const replacePhaserFlags = (code: string): string =>
  code.replace(
    /typeof (WEBGL_RENDERER|CANVAS_RENDERER|WEBGL_DEBUG|EXPERIMENTAL|PLUGIN_3D|PLUGIN_CAMERA3D|PLUGIN_FBINSTANT|FEATURE_SOUND)\b/g,
    (_m, f: string) => String(PHASER_FLAGS[f]),
  );
const phaserFlags: Plugin = {
  name: 'phaser-flags',
  enforce: 'pre',
  transform: (code, id) =>
    PHASER_SRC.test(id) ? { code: replacePhaserFlags(code), map: null } : null,
};

const pkg = JSON.parse(readFileSync(r('./package.json'), 'utf8')) as { version: string };

export default defineConfig({
  base: '/Tycoon-/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: [
      // Laufzeit: schlanker Phaser-Build; Typen weiter aus `phaser` (tsconfig).
      { find: /^phaser$/, replacement: r('./src/phaserCustom.js') },
      { find: '@core', replacement: r('./src/core') },
      { find: '@ui', replacement: r('./src/ui') },
      { find: '@scenes', replacement: r('./src/scenes') },
      { find: '@data', replacement: r('./src/data') },
      { find: '@i18n', replacement: r('./src/i18n') },
    ],
  },
  build: { chunkSizeWarningLimit: 1500 },
  optimizeDeps: {
    // Dev-Server: dieselbe Ersetzung im esbuild-Vorbündeln der Phaser-Quellen.
    esbuildOptions: {
      plugins: [
        {
          name: 'phaser-flags',
          setup(b) {
            b.onLoad({ filter: PHASER_SRC }, async (args) => ({
              contents: replacePhaserFlags(await readFile(args.path, 'utf8')),
              loader: 'js',
            }));
          },
        },
      ],
    },
  },
  plugins: [
    phaserFlags,
    VitePWA({
      // Update-Hinweis statt stillem Austausch (src/ui/pwa.ts); Registrierung macht der Code selbst.
      registerType: 'prompt',
      injectRegister: false,
      manifest: false, // public/manifest.webmanifest wird direkt verlinkt
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,json,woff2,webmanifest}'] },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Die Figuren-Simulationen (Wege, Parkplatz) brauchen allein 3–5 s; unter Last (CI, parallel) mehr als die
    // Vitest-Vorgabe von 5 s.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/index.ts'],
      thresholds: { lines: 90, statements: 90, functions: 90 },
    },
  },
});
