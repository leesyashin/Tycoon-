# ASSETS

Alle Grafiken, Schriften und Sounds mit Herkunft und Lizenz. Nichts aus kommerziellen Spielen.

## Schriften (`public/assets/fonts/`)

| Datei | Herkunft | Lizenz |
|---|---|---|
| `poppins-latin-400-normal.woff2`, `poppins-latin-500-normal.woff2`, `poppins-latin-700-normal.woff2` | Poppins, Indian Type Foundry (github.com/itfoundry/Poppins), WOFF2-Subset „latin“ aus dem npm-Paket `@fontsource/poppins` 5.3.0 (nur kopiert, keine Abhängigkeit) | SIL Open Font License 1.1, Text in `public/assets/fonts/OFL-Poppins.txt` |
| `didact-gothic-latin-400-normal.woff2` | Didact Gothic, Daniel Johnson / Cyreal, Subset „latin“ aus `@fontsource/didact-gothic` 5.3.0 | SIL Open Font License 1.1, Text in `public/assets/fonts/OFL-DidactGothic.txt` |

Lokal eingebunden (`src/ui/style.css`, `font-display: swap`), kein Request an Google Fonts.

## UI-Icons (`public/assets/ui/`)

| Datei | Herkunft | Lizenz |
|---|---|---|
| `icons.svg` (Symbole `i-coffee` … `i-chef-hat`) | Phosphor Icons, Gewicht „fill“, aus dem npm-Paket `@phosphor-icons/core` 2.1.1 als `<symbol>` zusammengefasst | MIT, Copyright (c) 2023 Phosphor Icons, Text in `public/assets/ui/LICENSE-phosphor.txt` |
| `icons.svg` (Symbole `i-close`, `i-tick`) | selbst gezeichnet | CC0 |
| `icon.svg`, `icon-192.png`, `icon-512.png` (App-/PWA-Icon) | selbst gezeichnet, erzeugt von `pnpm art` (`appIcon()` in `scripts/art/sprites.ts`) | CC0 |

## Szene-Sprites (`public/assets/sprites/`)

| Datei | Herkunft | Lizenz |
|---|---|---|
| `common.png` / `common.json` (Stationen in 3 Ausbaustufen × 2 Blickrichtungen, Bauplatz, Ambiente, Kunden-Typen und Personal mit 2 Richtungen × 2 Lauf-Frames, Smileys, Münze, Blatt, Partikel, Emotes, Licht) | selbst gezeichnet als Code (`scripts/art/iso.ts`, `scripts/art/sprites.ts`), mit `pnpm art` per Chromium als PNG 2× gerendert und gepackt | CC0 |
| `theme-<standort>.png` / `.json` (Boden, Wände mit Fenster, niedrige Vorderwände, Eingang, Terrasse je Standort) | wie oben (`themeSprites()`) | CC0 |
| `icons/*.png` (Kacheln/Detailkarte im Stations-Panel, Filialleiter-Portrait) | Ausschnitte derselben Sprites (`pnpm art`) | CC0 |

Geprüft, nicht verwendet: Kenney-Isometric-Packs (CC0) – kein passendes Matcha-/Café-Inventar, Stil (Outlines,
Texturen) widerspricht UI_STYLE § 4. Daher alles selbst gezeichnet.

## Audio

| Klang | Herkunft | Lizenz |
|---|---|---|
| Effekte (Kauf, Münze, Tap, Freischaltung, Fehler, Event-Start/-Ende, Blatt, Boost) | zur Laufzeit per Web Audio synthetisiert (`src/audio/audio.ts`, Töne in `src/data/audio.ts`), keine Dateien | CC0 |
| Lo-fi-Musik-Loop (4 Akkorde, Pad, Bass, Arpeggio) | ebenso zur Laufzeit synthetisiert | CC0 |
