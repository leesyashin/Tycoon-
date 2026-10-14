# Matcha Café Empire

Idle-/Tycoon-Browserspiel (Matcha-Cafés statt Hotels). Vite + TypeScript + Phaser 3, DOM-Overlay für die UI, i18n DE/EN, lokale Saves.

## Start

```
pnpm install
pnpm dev          # http://localhost:5173/Tycoon-/  (?lang=de|en zum Umschalten)
pnpm check        # lint + typecheck + test
pnpm e2e          # Playwright (einmalig: pnpm exec playwright install chromium)
pnpm build        # Produktions-Build nach dist/
pnpm sim --hours 2
```

Deploy: GitHub Pages unter https://leesyashin.github.io/Tycoon-/ (Workflow `pages.yml`, bei Push auf `main`).

## Doku

- `CLAUDE.md` – Projektregeln
- `docs/PLAN.md` – Architektur und Session-Plan (S0–S9)
- `docs/GAME_DESIGN.md` – Spieldesign und Formeln
- `docs/STATUS.md` – Übergabe zwischen Sessions
- `docs/ROUTINE.md` – autonomer Session-Loop
- `docs/ASSETS.md` – Herkunft/Lizenz aller Assets
