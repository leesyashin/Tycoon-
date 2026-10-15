# Matcha Café Empire

Idle-/Tycoon-Browserspiel: Baue ein kleines Matcha-Café in Berlin zur Kette bis nach Bali aus. Gäste bestellen an der Theke, Baristas bereiten zu, Bedienungen servieren, Putzkräfte halten alles sauber – du kaufst Ausstattung, stellst Personal ein, behebst den Engpass, pflegst die Zufriedenheit, eröffnest Standorte und sammelst per Franchise-Reset Zen. Läuft im Browser und als installierbare PWA, auf Deutsch und Englisch, ohne Werbung und ohne Käufe; der Spielstand bleibt lokal im Browser.

Version 1.0.0 – Änderungen in [CHANGELOG.md](CHANGELOG.md).

| Handy                                                         | Desktop                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| ![Café auf dem Handy (DE)](docs/screenshots/v1/mobile-de.png) | ![Café auf dem Desktop (EN)](docs/screenshots/v1/desktop-en.png) |

Weitere Screenshots: [`docs/screenshots/v1/`](docs/screenshots/v1/); Phase 2 (bedientes Café, Pipeline-Karte): [`docs/screenshots/s10/`](docs/screenshots/s10/).

## Technik

Vite + TypeScript + Phaser 3 (Szene), DOM-Overlay für die UI, i18n DE/EN, Spielstand in `localStorage` mit Sicherungen in IndexedDB. Die Spiellogik in `src/core` ist pur und ohne Phaser/DOM getestet; Einnahmen kommen nur aus dem Rate-Modell, die Figuren in der Szene sind Kosmetik.

## Start

```
pnpm install
pnpm dev          # http://localhost:5173/Tycoon-/  (?lang=de|en, ?tutorial=0 ohne Tutorial)
pnpm check        # lint + typecheck + test
pnpm e2e          # Playwright (einmalig: pnpm exec playwright install chromium)
pnpm build        # Produktions-Build nach dist/ (base: /Tycoon-/)
pnpm preview      # Build lokal ansehen
pnpm sim --hours 4  # Headless-Balancing-Simulation (--set spawn.base=0.17 --staffGrowth 1.7 für Experimente)
pnpm art            # Sprites neu rendern (braucht Chromium: PW_CHROMIUM=…)
```

Deploy: Der Build in `dist/` ist statisch und läuft unter jedem Pfad `/Tycoon-/`, z. B. GitHub Pages (Workflow `pages.yml`).

## Doku

- `CLAUDE.md` – Projektregeln
- `docs/PLAN.md` – Architektur und Session-Plan (S0–S9, Phase 2: S10–S12)
- `docs/GAME_DESIGN.md` – Spieldesign und Formeln
- `docs/UI_STYLE.md` – UI- und Grafikstil
- `docs/STATUS.md` – Stand, offene Punkte, Entscheidungen, Balancing-Snapshot
- `docs/ROUTINE.md` – autonomer Session-Loop
- `docs/ASSETS.md` – Herkunft/Lizenz aller Assets
