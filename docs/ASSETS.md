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
| `furniture.png` / `furniture.json` (Ausstattung: neun Geräte – Kasse, Matcha-Station, Kaffeemaschine, Kühl-/Eisfach, Ofen, Kuchenvitrine, Steinmühle, Zeremonie-Set, Ausgabe-Station – in 5 Optik-Stufen; Gästetheke in 5 Stufen × 4 Deko-Varianten; Tische in 4 Stufen; Ambiente Deko/Musik/WLAN/Terrasse; Terrassen-Tische mit Schirm in 4 Stufen; Café-Deko nach Level: Bilder, Neon, Regal, Leuchten, Uhr, Schallplatten, Pflanzen, Teppiche, Barhocker, Skulptur; Bauplatz; Schmutz-Marker) | selbst gezeichnet als Code (`scripts/art/equipment.ts`, Deko und Terrassen-Tische in `scripts/art/decor.ts` (Katalog `docs/screenshots/kiez/katalog-deko.png`), Ambiente in `scripts/art/sprites.ts`, Grundformen `scripts/art/iso.ts`, Farben `scripts/art/palette.ts`), mit `pnpm art` per Chromium in 2× gerendert, gepackt und als 8-Bit-Palette-PNG geschrieben (`scripts/art/png.ts`); Kontaktbogen: `scripts/art/contact-sheet.ts` mit `stations`, `counter` oder `furniture`, Katalog `docs/screenshots/ausstattung/katalog.png` | CC0 |
| `common.png` / `common.json` (Figuren: 15 Kunden-Varianten (Gen-Z-Matcha-Klischees) je 2 Richtungen × Stehen + 2 Lauf-Frames + Sitzpose, 13 Personal-Looks mit Schürze (3 Verkäufer, 3 Baristas, 3 Bedienungen mit Tablett, 2 Putzkräfte mit Mopp, Filialleiterin, Social Media), Bedienungen und Putzkräfte mit Lauf-Frames, stehendes Personal nur Stehen; Smileys, Münze, Blatt, Partikel, Emotes, Licht) | selbst gezeichnet als Code (Figuren `scripts/art/figures.ts`, Effekte `scripts/art/sprites.ts`), gerendert und gepackt wie oben; Kontaktbogen: `scripts/art/contact-sheet.ts figures` | CC0 |
| `theme-<standort>.png` / `.json` (Boden, Wände mit Fenster bzw. Leuchtkasten/Regal, niedrige Vorderwände, Eingang, Terrasse je Standort; Fassaden-Module der Altbauten im Stadtviertel in der Standort-Palette) | wie oben (`themeSprites()`, Fassaden `facadeSprites()` in `scripts/art/city.ts`, Farben `src/data/city.ts`); Katalog `docs/screenshots/kiez/katalog-fassaden.png` | CC0 |
| `city.png` / `city.json` (Stadtviertel für alle Standorte: Linden, Gaslaterne, Bänke, Fahrradbügel, Litfaßsäule, Mülleimer, Poller, Pflanzkübel, Nasenschild, Fußgängerampel, Brückengeländer, 4 Autos × 2 Richtungen, Ausflugsdampfer, Kiosk, 4 Marktstände, 2 Imbisswagen, Spielplatz, Brunnen, Eiswagen, Fußballtor, Bushaltestelle, Briefkasten, E-Roller, 2 Imbiss-Tische) | selbst gezeichnet als Code (`citySprites()` in `scripts/art/city.ts`), gerendert wie oben; Katalog `docs/screenshots/kiez/katalog-stadt.png`. Stil angelehnt an Berliner Straßenmöbel und – für das Café – an die Farb- und Materialsprache der Kette LAP Coffee (Blau/Edelstahl); kein Logo, kein Name, keine Fotos oder Grafiken übernommen | CC0 |
| `icons/*.png` (Kacheln/Detailkarte im Stations-Panel je Optik-Stufe: `station-<id>-<1..5>`, Kasse/Ausgabe mit Thekenmodul; Tische `ambience-seats-<1..4>`; Ambiente; Filialleiter-Portrait ohne Bodenschatten) | Ausschnitte derselben Sprites (`pnpm art`) | CC0 |

Geprüft, nicht verwendet: Kenney-Isometric-Packs (CC0) – kein passendes Matcha-/Café-Inventar, Stil (Outlines,
Texturen) widerspricht UI_STYLE § 4. Daher alles selbst gezeichnet.

## Audio

| Klang | Herkunft | Lizenz |
|---|---|---|
| Effekte (Kauf, Münze, Tap, Freischaltung, Fehler, Event-Start/-Ende, Blatt, Boost) | zur Laufzeit per Web Audio synthetisiert (`src/audio/audio.ts`, Töne in `src/data/audio.ts`), keine Dateien | CC0 |
| Lo-fi-Musik-Loop (4 Akkorde, Pad, Bass, Arpeggio) | ebenso zur Laufzeit synthetisiert | CC0 |
