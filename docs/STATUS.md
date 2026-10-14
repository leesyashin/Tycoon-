# STATUS
## Loop
state: running
current: S0
branch: session/s0-setup
started: 2026-10-14T19:32:22Z
next: S0
## Letzte Session: S0 – Projekt-Setup (2026-10-14)
## Fertig
- Vite 6 + TypeScript strict + Phaser 3.90, break_infinity.js, Vitest, Playwright, ESLint (typescript-eslint strict) + Prettier
- Ordnerstruktur nach PLAN § 2.2, Pfad-Aliase `@core @ui @scenes @data @i18n`, `base: '/Tycoon-/'`
- BootScene + CafeScene: 12×12 Iso-Grid mit Platzhalter-Kacheln, Iso-Helper `toScreen/toGrid/depth` (getestet)
- i18n: `t()`, Erkennung (`?lang=`, `navigator.language`, Fallback en), Test „Keys identisch“; DOM-HUD in `#ui`
- ESLint-Regel: `src/core` darf nicht aus phaser/scenes/ui importieren
- CI (`ci.yml`: check + build) und Pages-Deploy (`pages.yml`); PWA via vite-plugin-pwa + `manifest.webmanifest`
- Skripte `check test e2e sim build`; `sim` ist vorerst ein Stub
## Offen / bekannte Bugs
- GitHub Pages muss einmalig im Repo aktiviert werden (Settings → Pages → Source: GitHub Actions), sonst schlägt `pages.yml` fehl. Das kann nur Vincent.
- PWA-Icon ist nur ein SVG-Platzhalter; für Installierbarkeit auf allen Geräten PNG-Icons (192/512) in S8/S9 ergänzen.
- e2e läuft nicht in CI (PLAN: Playwright-Smoke ab S3 Pflicht).
## Entscheidungen, die vom Plan abweichen
- TypeScript ~5.9 statt neuester Version – typescript-eslint unterstützt die 7.x noch nicht sicher.
- Phaser auf 3.x gepinnt (4.x existiert, PLAN sagt 3.8x/3.9x).
- Playwright nutzt `PW_CHROMIUM` (Pfad zu einem vorhandenen Chromium), falls gesetzt; sonst Standard-Download.
- PWA-Manifest als statische Datei in `public/` (vite-plugin-pwa mit `manifest: false`).
## Nächste Session: S1
Startpunkt: PLAN.md § 3, Abschnitt S1 (Core-Ökonomie), `src/core/GameState.ts` ist leer, `scripts/balance-sim.ts` ist Stub und muss `--hours` auswerten.
Fallen: Währungen immer `Decimal`; `pnpm sim --hours 1` ist ab S1 Pflicht; Save-Schema ab Beginn mit `schemaVersion`.
## Balancing-Snapshot
noch keiner
