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
| `icons.svg` (Symbole `i-coffee` … `i-chef-hat`; seit Phase 3 auch `i-video-camera`, seit Phase 3b `i-cloud` für das Wetter im HUD) | Phosphor Icons, Gewicht „fill“, aus dem npm-Paket `@phosphor-icons/core` 2.1.1 als `<symbol>` zusammengefasst (Pfade unverändert kopiert, keine Abhängigkeit) | MIT, Copyright (c) 2023 Phosphor Icons, Text in `public/assets/ui/LICENSE-phosphor.txt` |
| `icons.svg` (Symbole `i-close`, `i-tick`, `i-banknote`) | selbst gezeichnet | CC0 |
| `icon.svg`, `icon-192.png`, `icon-512.png` (App-/PWA-Icon) | selbst gezeichnet, erzeugt von `pnpm art` (`appIcon()` in `scripts/art/sprites.ts`) | CC0 |

## Szene-Sprites (`public/assets/sprites/`)

| Datei | Herkunft | Lizenz |
|---|---|---|
| `furniture.png` / `furniture.json` (Ausstattung: neun Geräte – Kasse, Matcha-Station, Kaffeemaschine, Kühl-/Eisfach, Ofen, Kuchenvitrine, Steinmühle, Zeremonie-Set, Ausgabe-Station – in 5 Optik-Stufen; Gästetheke in 5 Stufen × 4 Deko-Varianten; Tische in 4 Stufen (seit Phase 3 ohne aufgemalte Becher – Becher und Teller stellt die Szene je Gast dazu); Ambiente Deko/Musik/WLAN/Terrasse/Parkplatz (`ambience-parking`: Schild „P“, Fahrradbügel, Rollerheck); Terrassen-Tische mit Schirm in 4 Stufen; Café-Deko nach Level: Bilder, Neon, Regal, Leuchten (auch Opalglas-Kugeln), Kronleuchter, Uhr, Schallplatten, Pflanzen, Olivenbäume, Teppiche, Barhocker, Skulptur; Kasse zusätzlich mit offener Lade; Bauplatz; Schmutz-Marker; Lager-Regale in 3 Stufen, seit Phase 3c je mit vier Füllständen der Matcha-Dosen `storage-corner-<stufe>-<0..3>` und `storage-rack-<stufe>-b-<0..3>` aus `scripts/art/storage.ts`) | selbst gezeichnet als Code (`scripts/art/equipment.ts`, Deko und Terrassen-Tische in `scripts/art/decor.ts` (Katalog `docs/screenshots/deko/katalog-deko.png`, Tische und Ambiente `docs/screenshots/deko/katalog-tische.png`), Ambiente in `scripts/art/sprites.ts`, Grundformen `scripts/art/iso.ts` und `scripts/art/shapes.ts`, Farben `scripts/art/palette.ts`), mit `pnpm art` per Chromium in 2× gerendert, gepackt und als 8-Bit-Palette-PNG geschrieben (`scripts/art/png.ts`); Kontaktbogen: `scripts/art/contact-sheet.ts` mit `stations`, `counter` oder `furniture`, Katalog `docs/screenshots/ausstattung/katalog.png` | CC0 |
| `common.png` / `common.json` (Figuren: 15 Kunden-Varianten (Gen-Z-Matcha-Klischees) je 2 Richtungen × Stehen + 2 Lauf-Frames + Sitzpose, 13 Personal-Looks mit Schürze (3 Verkäufer, 3 Baristas, 3 Bedienungen mit Tablett, 2 Putzkräfte mit Mopp, Filialleiterin, Social Media), Frames je Rolle (`STAFF_FRAMES`: Arbeiten, Laufen, Tragen mit vorgestreckter Hand, Wischen; seit Phase 3 Arbeitsposen der Baristas – vorgreifen/abstellen, Bambusbesen, tief greifen, eingießen – mit Werkzeug (Chasen, Milchkännchen), Verkäufer laufen, Bedienungen mit leerem Tablett und Abstell-Pose; Gäste tragen ihre Bestellung bzw. ihr Geschirr, `CUSTOMER_FRAMES`); Smileys, Geldschein, Blatt, Partikel (Dampf, Frost, Matcha-Pulver, Noten, Tropfen), Emotes, Licht, Fortschrittsring in 25 Stufen, Teller/Becher für Ausgabe, Tablett und Tisch, benutztes Geschirr `item-<id>-empty` (Matcha, Kaffee, Iced Matcha, Croissant, Kuchen, Schale); seit Phase 3b Gesprächsblasen `emote-chat|laugh|matcha|phone|sun|rain|wave`, Regenschirme `umbrella-0..3` und der Lieferant mit Sackkarre `courier-<0..3 Kartons>-<front|back>-<0..2>` (eigene Leinwand 44×62); der Regen-Partikel `fx-rain` entfällt) | selbst gezeichnet als Code (Figuren `scripts/art/figures.ts`, Effekte `scripts/art/sprites.ts`), gerendert und gepackt wie oben; Kontaktbogen: `scripts/art/contact-sheet.ts figures` | CC0 |
| `theme-<standort>.png` / `.json` (Boden, Wände mit Fenster bzw. Leuchtkasten/Regal, niedrige Vorderwände, Eingang, Terrasse je Standort; Endausbau: Terrazzo mit Einschlüssen, Marmor mit Messing, Riffelpaneele, Vorderwände mit Blumenkästen; Fassaden-Module der Altbauten im Stadtviertel in der Standort-Palette) | wie oben (`themeSprites()`, Fassaden `facadeSprites()` in `scripts/art/city.ts`, Farben `src/data/city.ts`); Katalog `docs/screenshots/deko/katalog-fassaden.png` (Läden mit Markisen-Volant, Schaufenstern und Sachen vor der Tür) | CC0 |
| `city.png` / `city.json` (Stadtviertel für alle Standorte: Linden, Gaslaterne, Bänke, Fahrradbügel, Litfaßsäule, Mülleimer, Poller, Pflanzkübel, Nasenschild, Fußgängerampel, Autoampel in 4 Phasen × 2 Ausrichtungen, Brückengeländer, 4 Autos und 2 Radfahrer × 2 Richtungen, je Autotyp ein Zusatzlack für parkende Autos, Taube (stehen, picken, fliegen), Ausflugsdampfer, Kiosk, 4 Marktstände, 2 Imbisswagen, Spielplatz, Brunnen, Eiswagen, Fußballtor, Bushaltestelle, Briefkasten, E-Roller, 2 Imbiss-Tische; seit Phase 3 der Parkplatz neben dem Café: 4 geparkte Fahrräder `lot-bike-0..3`, Edelstahl-Anlehnbügel `lot-loop`, 3 Motorroller `lot-moped-0..2`, Schild „P“ `lot-sign`, Ladesäule `lot-charger`, Bauzaun `lot-fence`. Lieferwagen und Gäste-Autos auf dem Parkplatz nutzen die vorhandenen Auto-Frames `car-<typ>[-p1]-f|b`) | selbst gezeichnet als Code (`citySprites()` in `scripts/art/city.ts`, Zeichenhilfen `scripts/art/shapes.ts`), gerendert wie oben; Katalog `docs/screenshots/deko/katalog-stadt.png` (vorher: `katalog-stadt-vorher.png`). Stil angelehnt an Berliner Straßenmöbel und – für das Café – an die Farb- und Materialsprache der Kette LAP Coffee (Blau/Edelstahl); kein Logo, kein Name, keine Fotos oder Grafiken übernommen | CC0 |
| `icons/*.png` (Kacheln/Detailkarte im Stations-Panel je Optik-Stufe: `station-<id>-<1..5>`, Kasse/Ausgabe mit Thekenmodul; Tische `ambience-seats-<1..4>`; Ambiente inkl. `ambience-parking` (Phase 3); Filialleiter-Portrait ohne Bodenschatten) | Ausschnitte derselben Sprites (`pnpm art`) | CC0 |

Zur Laufzeit erzeugt (keine Datei, `src/scenes/weatherView.ts`, Farben aus den Tokens `--c-surface`/`--c-rain`/`--c-ink`):
Regentropfen-Streifen `weather-drop` und weicher Wolkenschatten `weather-shadow` – Verläufe auf einer Canvas, CC0.

Geprüft, nicht verwendet: Kenney-Isometric-Packs (CC0) – kein passendes Matcha-/Café-Inventar, Stil (Outlines,
Texturen) widerspricht UI_STYLE § 4. Daher alles selbst gezeichnet.

## Audio

| Klang | Herkunft | Lizenz |
|---|---|---|
| Effekte (Kauf, Münze, Tap, Freischaltung, Fehler, Event-Start/-Ende, Blatt, Boost; seit Phase 3c Türglocke und Milchschäumer) | zur Laufzeit per Web Audio synthetisiert (`src/audio/audio.ts`, Töne und Rausch-Bänder in `src/data/audio.ts`), keine Dateien | CC0 |
| Geräusche der Szene (Phase 3c: Regenrauschen, Stimmengemurmel) | ebenso zur Laufzeit synthetisiert: weißes Rauschen aus `Math.random`, gefiltert (Hoch-/Tief-/Bandpass), keine Aufnahmen | CC0 |
| Lo-fi-Musik-Loop (4 Akkorde, Pad, Bass, Arpeggio) | ebenso zur Laufzeit synthetisiert | CC0 |
