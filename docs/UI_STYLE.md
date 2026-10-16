# Matcha Café Empire – UI-Styleguide („Hotel-Empire-Look“)

> Zweck: Der sichtbare Stil von **Idle Hotel Empire Tycoon** (Codigames, 2019) wird 1:1 als Design-System für
> Matcha Café Empire übernommen – Layout, Farben, Formen, Typografie, Bewegung. Nur der *Inhalt* wechselt:
> Hotel → Matcha-Café, Zimmer → Verkaufsstationen, Gäste → Kunden, Gems → Goldene Blätter.
> **Keine Assets aus dem Original** (CLAUDE.md, `docs/ASSETS.md`). Übernommen werden Regeln, nicht Dateien.
>
> Quelle: 5 Screenshots (Lobby, Restaurant, Zimmer-Panel, Verwaltung/Statistik, Pool bei Nacht) + Web-Recherche
> (App-Store-Beschreibung, Codigames-Helpshift, Pocket Gamer, AppGamer, MrGuider). Farbwerte sind aus den
> Screenshots gesampelt und auf glatte Token-Werte gerundet.
>
> Zielgruppe: S8 („Grafik und Audio“, UI-Skin) und jede Session, die neue Panels baut (CLAUDE.md, Pflichtlektüre 4).
> Ersetzt die bisherigen Dunkelgrün-Tokens in `src/ui/style.css`. Bis S8 die Tokens tauscht, bauen S5–S7 neue Screens
> schon in der Komponentenstruktur aus § 3 (Pillen, Kreise, Karten, Chips) mit den bestehenden CSS-Variablen.

---

## 1. Stil-Analyse des Vorbilds

### 1.1 Gesamteindruck

| Merkmal | Beobachtung im Vorbild |
|---|---|
| Szene | Isometrische Low-Poly-3D-Welt, flat shading, keine Texturen, keine Outlines. Ein Gebäude pro Screen, Dach aufgeschnitten („Dollhouse“-Blick), Kamera fest ~30° von oben. |
| Figuren | Blockige Figuren (Kopf = Würfel, Körper = Quader), 4–6 Grundfarben, keine Gesichter außer Haaren. Über beschäftigten Figuren hängt ein grüner **Fortschrittsring**. |
| Licht | Tag/Nacht-Zyklus: nachts kippt die ganze Szene nach Indigo/Violett (`#3a3f8f`‑Tönung), Lampen und Fenster bleiben warm-gelb. Innenräume behalten ihre Lokalfarbe. |
| UI-Schicht | Flache 2D-UI **über** der Szene, keine Perspektive. Alles ist eine **Pille, ein Kreis oder eine weiße Karte**. Vollständig gerundet (Radius ≥ 50 % der Höhe bei Pillen). |
| Farbdramaturgie | Welt = bunt/pastellig, UI = eine Primärfarbe (Kobaltblau `#4e64fb`) + Weiß + drei Signalfarben (Grün „kann ich kaufen / Gewinn“, Orange „Energie / Kosten“, Rot „Achtung“) + Gold für Sterne/Fortschritt. |
| Typografie | Geometrische Grotesk, rund, einstöckiges „a“ (Century-Gothic-Charakter). Zahlen **fett**, Labels regular. Alles Weiß auf Dunkel oder Dunkelblau auf Weiß. Großbuchstaben nur auf Buttons (VERBESSERN, LOS, UNBEGRENZT). |
| Ikonografie | Weiße, gefüllte Glyphen (keine Outline-Icons) in runden Buttons; Währungen als kleine farbige Piktogramme (grüner Geldschein, oranger Blitz, gelber Diamant) direkt vor der Zahl. |
| Hierarchie | 3 Tiefen: (1) dunkle halbtransparente Pillen am Rand (HUD), (2) weiße Karten im Panel, (3) blaue Vollflächen-Buttons als einziger CTA pro Karte. |
| Dichte | Sehr luftig. Max. 1 Primär-CTA pro Karte. Lange Listen als Karten mit gestrichelten Trennlinien. |
| Feedback | Rotes „!“‑Badge an Buttons mit Handlungsbedarf, Zahl in Ecke von Kacheln (Level), orangener „+“‑Kreis als Shop-Shortcut an der Währung. |

### 1.2 Screen-Anatomie (Hochformat, 9:16)

```
┌───────────────────────────────────────────┐
│ [💵 164,21M ⚡8 💎192 ⊕]        [★★★★★] │  ← HUD-Pille links, Sterne-Pille rechts (dunkel, transluzent)
│ [🕒 10:56 PM 🍹 🍴 ⬇]                     │  ← Status-Pille: Uhr + Service-Symbole (Zeilenumbruch, nicht Kürzung)
│ [📱 Aktiv]                     (👤)       │  ← Zustands-Pille            Rechte Spalte: runde weiße Buttons
│                                (📊)       │     (Personal, Statistik, Alarm)
│                                (❗)       │
│              ISO-SZENE                    │
│                            [Manager-Karte]│  ← weiße Karte mit Portrait, nur wenn aktiv
│                                           │
│  (Avatar)                      (⚙)        │  ← Charakter links unten mit Timer-Badge; Zahnrad rechts
│  [1d 2h]                                  │
│ (🛒!)         [💵 x2 UNBEGRENZT](💵)(🗺)(🔨)│  ← Bottom-Bar: Shop links, Boost-Pille + 3 Aktions-Kreise rechts
└───────────────────────────────────────────┘
```

Regeln daraus:
- **Ecken gehören der UI, die Mitte der Szene.** Kein Element überlappt das Zentrum, außer Panels (Bottom-Sheet) und Vollbild-Screens.
- Alle Bedienelemente sind **Kreise (56–72 px) oder Pillen (Höhe 40–48 px)**. Rechteckig sind nur Karten und Kacheln.
- Die **rechte Spalte** ist der Ort für „Manager-/Info“-Buttons, die **untere Leiste** für „Handeln“ (Shop, Boost, Geld, Karte, Bauen).
- Zahlen im HUD sind **kompakt** (`164,21M`), Währungs-Icon davor, kein Label-Text.

### 1.3 Panel-Typen im Vorbild

| Typ | Beispiel | Aufbau |
|---|---|---|
| **Bottom-Sheet (Objekt-Panel)** | „Zimmer 201“ | Szene bleibt oben sichtbar (~45 %), Panel darunter dunkelblau, Zurück-Pfeil in Lasche. Kopfzeile: Titel links, Chips rechts (100 % 🟡, 62,78/h ⚡31). Darunter **eine weiße Detailkarte** (Icon, Name, Beschreibung, Level-Badge, Preis + Energie, blauer CTA „VERBESSERN“). Darunter **Icon-Grid** (5 Spalten, Kacheln 1:1, Level-Zahl als Eck-Badge, ausgewählt = weiß mit blauem Icon, sonst dunkelblau-grau mit weißem Icon, gesperrt = schwarz mit Hai-Icon = Kredit/Premium). |
| **Vollbild-Screen** | „Verwaltung“ | Dunkle Weltkarte als Hintergrund, großer Titel links, rotes X rechts. **Tab-Leiste** (blaue Reiter, aktiver Reiter weiß und mit der Karte verschmolzen). Inhalt = weiße Karte mit **Statistik-Balken** (Einnahmen periwinkle, Kosten kräftig blau, Saldo grün/rot als große Pille mit Pfeil). Zweite Karte: Liste mit Tabs (Zimmer / Café), je Zeile Icon, Name, Untertitel, ⚡-Kosten, 💵-Ertrag, grüner „LOS“-Button, Auslastung als gelber Balken. |
| **Chips** | `100 % 🟡`, `62,78/h ⚡31` | Dunkle transluzente Pille, weißer fetter Text, Icon rechts oder links. |
| **Badges** | `7` auf Kachel, `!` auf Shop, `1d 2h` unter Avatar | Kreis oder Pille, 18–24 px, weiß auf Dunkelblau bzw. Weiß auf Rot. |
| **Ringe** | über Kunden am Tisch | 2‑Farb-Ring (grün auf dunkel), zeigt Restzeit der Handlung. |

### 1.4 Spielsysteme des Vorbilds, die der Stil transportiert (Recherche)

- Währungen: Cash, **Energie** (Generator/Batterien begrenzen Käufe), **Gems** (Quests, Premium-Möbel).
- Fortschritt: **1–5 Sterne** pro Hotel, Sterne schalten neue Hotels frei.
- Räume werden Stück für Stück ausgebaut (Bett, Nachttisch, TV, Bad …), jedes Teil hat Level, Profit/h und Energiekosten.
- Services (Restaurant, Pool, Spa, Bar), Personal mit Tageslohn, Werbung (Flyer → Radio/TV → Social Media).
- VIP/Manager („Investor“): Karte am rechten Rand, Boost ×2, Zeitlimit; Tagesbilanz muss grün sein.
- Offline-Einnahmen, Zeitsprünge, Tagesbonus, Multiplikator-Roulette.

Das Mapping auf unsere Systeme steht in § 5.

---

## 2. Design-Tokens

Alle Tokens sind CSS-Variablen in `src/ui/style.css` (`:root`). Phaser-seitige Farben (Szene-Overlays, Ringe,
Smileys) werden aus derselben Tabelle in `src/data/ui.ts` gespiegelt (`UI_THEME`), damit Szene und DOM
identisch aussehen. Kein Hex-Wert außerhalb dieser beiden Stellen.

### 2.1 Farben

| Token | Wert | Herkunft (Vorbild) | Verwendung |
|---|---|---|---|
| `--c-primary` | `#4e64fb` | Shop-Button, VERBESSERN, ausgewählte Kachel | **Einziger CTA-Blauton.** Primär-Buttons, aktive Kachel, aktive Icons, Links. |
| `--c-primary-deep` | `#1d457b` | Panel-Kopf „Zimmer 201“ | Panel-Hintergrund (Bottom-Sheet), Level-Badge. |
| `--c-primary-ink` | `#185bd8` | Timer-Badge „1d 2h“ | Kleine Badges, Timer, Zählerpillen. |
| `--c-navy` | `#011747` | Verwaltung-Hintergrund | Vollbild-Screens, Fallback hinter Weltkarte. |
| `--c-navy-900` | `#0e182b` | Chips im Panel-Kopf, gesperrte Kachel | Dunkle Chips, gesperrte Zustände. |
| `--c-periwinkle` | `#89a1d7` | Einnahmen-Balken | Statistik „Einnahmen“, inaktive Tab-Reiter (`#b0c4f2` als Hell-Variante `--c-periwinkle-200`). |
| `--c-blue-vivid` | `#1578f8` | Kosten-Balken | Statistik „Kosten“, Progress-Füllung sekundär. |
| `--c-tile` | `#5c6c9d` | Icon-Kachel inaktiv | Kacheln im Grid, Sekundär-Buttons auf Dunkel. |
| `--c-tile-light` | `#acbde2` | untere Kacheln (gedimmt) | Deaktivierte Kacheln, Trennlinien auf Dunkel. |
| `--c-success` | `#51c267` | „LOS“, Tagesbilanz, UNBEGRENZT, Fortschrittsring | Kaufbar, Gewinn, aktiver Boost, Ring-Füllung. |
| `--c-success-deep` | `#27d436` | Ring-Außenkante | Nur Ring/Glow. |
| `--c-gold` | `#ffb929` | Sterne, Auslastungsbalken | Sterne/Qualitätsgrad, Auslastung, Goldene Blätter-Rahmen. |
| `--c-energy` | `#f07a2a` | ⚡-Zahl | **Kapazität** (bei uns: Theken-Plätze/Durchsatz, § 5), Energiekosten-Zahl, „+“‑Shop-Kreis. |
| `--c-danger` | `#f33838` | Alarm-Icon, „!“-Badge | Handlungsbedarf, Verlust, Löschen. |
| `--c-danger-soft` | `#f76464` | Schließen-X | Schließen-Button Vollbild. |
| `--c-cash` | `#3fb950` | grüner Geldschein | Geldschein-Icon im HUD und fliegender Schein (§ 5). |
| `--c-gem` | `#ffd23f` | gelber Diamant | Icon „Goldenes Blatt“. |
| `--c-surface` | `#ffffff` | Karten | Karten, aktive Reiter, runde Buttons. |
| `--c-surface-2` | `#eef0f3` | gestrichelte Trenner | Trenner, Sekundärflächen auf Weiß. |
| `--c-ink` | `#1b2340` | Karten-Text | Text auf Weiß. |
| `--c-ink-muted` | `#6b7490` | Untertitel „Doppelzimmer“ | Sekundärtext auf Weiß. |
| `--c-text` | `#ffffff` | HUD-Text | Text auf Dunkel. |
| `--c-text-muted` | `#b4b4b9` | Uhr-Pille | Sekundärtext auf Dunkel. |
| `--c-glass` | `rgba(12, 16, 35, 0.72)` | HUD-/Status-Pillen | Transluzente Pillen über der Szene (Blur 6 px). |
| `--c-scrim` | `rgba(1, 23, 71, 0.6)` | hinter Dialogen | Dialog-Backdrop. |
| `--c-night` | `#3a3f8f` | Nacht-Tönung | Szene-Overlay nachts (Phaser, Multiply 35 %). |

Kontrast-Regel (unverändert aus S3): Text/Hintergrund ≥ 4.5:1. Gemessen:
`--c-primary` auf Weiß 4.6:1 (ok, weißer Text auf Blau ebenfalls 4.6:1). `--c-success` auf Weiß 2.3:1 und Weiß
auf Grün 2.3:1 → **grüne Buttons bekommen `--c-ink`-Text (6.8:1), nie Weiß**; grüner Text nur auf Dunkel.
`--c-energy` auf Weiß 2.8:1, `--c-gold` auf Weiß 1.7:1 → beide nur als Icon-/Balkenfarbe, Zahlen daneben in
`--c-ink`. `--c-ink-muted` auf Weiß 4.6:1 (ok). Abweichung vom Vorbild (dort weiße Schrift auf Grün) ist bewusst.

### 2.2 Typografie

| Token | Wert | Bemerkung |
|---|---|---|
| `--font-ui` | `'Poppins', system-ui, sans-serif` | Zahlen und Buttons. Poppins (OFL) kommt dem fetten runden HUD-Schriftbild am nächsten. |
| `--font-display` | `'Didact Gothic', 'Questrial', 'Poppins', sans-serif` | Titel („Verwaltung“, „Zimmer 201“): einstöckiges „a“, leicht, Century-Gothic-Charakter. Didact Gothic (OFL). |
| `--fs-hud` | 18 px / 700 | Währungen im HUD. |
| `--fs-title` | 28 px / 400 (Display) | Screen-Titel. |
| `--fs-h2` | 22 px / 400 (Display) | Panel-Titel, Karten-Name. |
| `--fs-body` | 14 px / 400 | Beschreibungen. |
| `--fs-label` | 12 px / 500 | Untertitel, Chips. |
| `--fs-button` | 14 px / 700, `letter-spacing: 0.04em`, `text-transform: uppercase` | Nur Primär-/Erfolgs-Buttons. |
| `--fs-badge` | 11 px / 700 | Eck-Badges. |

Schriften werden **lokal** eingebunden (`public/assets/fonts/`, WOFF2, Lizenz in `docs/ASSETS.md`), kein
Google-Fonts-Request zur Laufzeit (PWA offline, Datenschutz). `font-display: swap`. Pixel-Font aus PLAN S8
(„Press Start 2P“) entfällt – das Vorbild ist nicht Pixel-Art-typisiert (siehe § 6, Entscheidung).

### 2.3 Form, Abstand, Schatten

| Token | Wert |
|---|---|
| `--r-pill` | `999px` (HUD-Pillen, Chips, Primär-Buttons, Boost-Pille) |
| `--r-card` | `16px` (weiße Karten, Panel-Oberkante) |
| `--r-tile` | `12px` (Icon-Kacheln) |
| `--r-badge` | `999px` |
| `--size-btn-round` | `56px` (Mobile) / `64px` (≥ 768 px) – rechte Spalte, Bottom-Bar |
| `--size-btn-round-lg` | `72px` – Shop-Button links unten |
| `--size-tile` | `1fr` im 5‑Spalten-Grid, `aspect-ratio: 1` |
| `--gap` | `8px`; `--gap-lg` `16px`; Screen-Rand `16px`; Safe-Area via `env()` |
| `--shadow-card` | `0 4px 0 rgba(0,0,0,0.12)` – **harter Unterkanten-Schatten** (Vorbild: Karten wirken wie dicke Pappe) |
| `--shadow-btn` | `0 4px 0 color-mix(in srgb, currentColor 35%, black)` + `translateY(2px)` bei `:active` (Button „drückt sich“ 2 px nach unten) |
| `--shadow-float` | `0 8px 24px rgba(0,0,0,0.35)` – Manager-Karte, Dialoge |
| `--border-hud` | `1.5px solid rgba(255,255,255,0.18)` – feine helle Kante an transluzenten Pillen |

### 2.4 Z-Ebenen

| Ebene | z-index | Inhalt |
|---|---|---|
| Szene | 0 | Phaser-Canvas |
| Szene-Overlay | 1 | Fortschrittsringe, Smileys, Beträge und Geldscheine beim Bezahlen (Phaser) |
| HUD | 10 | Pillen, runde Buttons, Bottom-Bar, Avatar |
| Panel | 20 | Bottom-Sheet |
| Screen | 30 | Vollbild (Verwaltung, Standorte, Settings) |
| Dialog | 40 | `<dialog>` + Scrim |
| Toast | 50 | Toasts |

---

## 3. Komponenten-Katalog

Jede Komponente: Aussehen im Vorbild → unsere Fassung → CSS-Klasse (Ziel) → Zustände. Alle Texte über `t()`.

### 3.1 HUD-Pille (Währungen)

- Vorbild: dunkle Pille oben links, drei Währungen mit Icon, orangener „+“‑Kreis am Ende.
- Unsere Fassung: `💵 Geld` (Geldschein-Icon `banknote`) · `⚡ Kapazität` (frei/gesamt, § 5) · `🍃 Goldene Blätter` · `+` (öffnet Blätter-Shop, ab S7; vorher ausgeblendet). Bezahlt ein Gast an der Kasse, springt der Geld-Betrag kurz an (`.hud-cash-in`, höchstens einmal je Animation).
- Klasse `.hud-pill`; Kinder `.hud-currency` (Icon 20 px, Zahl 18 px/700, weiß). Einkommen/s wird **nicht** in die Pille gequetscht, sondern in die zweite Zeile (Status-Pille) – wie im Vorbild die Uhr.
- Ersetzt den heutigen 420-px-HUD-Block.

### 3.2 Status-Pille (Zeit + Zustand)

- Vorbild: `🕒 11:50 PM 🍹 ⬇` und darunter `📱 Aktiv`.
- Unsere Fassung: Zeile 1 `🕒 Tageszeit · +12,3 K/s`; Zeile 2 Zustandspille: `😊 Zufriedenheit 78` (antippbar → Detail) und bei Bedarf `🧹 62` (Sauberkeit, nur wenn < 70). Boost-Timer als weitere Pille (S7).
- Service-Symbole (🍹🍴) entsprechen bei uns **freigeschalteten Stationen** als kleine Glyphen in der Zeile.

### 3.3 Sterne-Pille → Qualitätsgrad

- Vorbild: 5 goldene Sterne auf dunkler Pille mit goldener Unterkante.
- Unsere Fassung: 4 Stufen (Culinary → Premium → Ceremonial → Meister, GAME_DESIGN § 8) als **4 Blatt-Symbole** 🍃 in `--c-gold`, erreichte gefüllt, offene als Umriss 30 % Weiß. Antippen → Shop-Tab „Qualität“.

### 3.4 Runde Icon-Buttons (rechte Spalte)

- Vorbild: weiße Kreise 56 px, blaues gefülltes Icon, 12 px Abstand, rotes Alarm-Icon als drittes.
- Unsere Fassung: `👥 Personal` · `📊 Statistik` · `❗ Aufgaben` (Quests/Achievements, S5; Icon rot, sobald etwas abholbar ist) · `⚙️` unten rechts separat (wie Vorbild, dunkle Pille mit weißem Zahnrad).
- Klasse `.btn-round`; Modifier `.btn-round--white` (Standard), `.btn-round--primary` (blau mit weißem Icon), `.btn-round--glass`. Badge-Slot `.badge` oben links (rot, weiße Ziffer oder „!“).
- Mindestziel 44 px bleibt, visuell 56 px.

### 3.5 Bottom-Bar (Aktionen)

- Vorbild: links großer blauer Shop-Kreis (72 px) mit „!“, rechts Boost-Pille `💵 ×2 UNBEGRENZT` (grün, mit Ladering) + drei Kreise (Geld, Karte, Hammer).
- Unsere Fassung (ersetzt `.nav` mit 6 Text-Buttons):
  - links: `🛒 Shop` (72 px, `--c-primary`), Badge wenn etwas leistbar ist (ersetzt heutige `affordable`-Markierung).
  - rechts: Boost-Pille (S7; bis dahin Hype-Balken als grüne Pille mit Füllstand), dann `📣 Marketing`, `🗺️ Standorte`, `🔨 Bauen` (= Shop-Tab Ambiente/Erweiterung).
- Labels: **unsichtbar** (nur `aria-label` + Tooltip auf Desktop) – das Vorbild hat keine Beschriftung. Onboarding-Tooltip in S9 erklärt sie einmal.
- Klasse `.actionbar`, Kinder `.btn-round`, `.boost-pill`.

### 3.6 Avatar mit Timer

- Vorbild: Charakter-Portrait unten links, blaue Pille `1d 2h` darunter (aktiver Manager/Besuch).
- Unsere Fassung: **Filialleiter**-Portrait (sobald eingestellt), Pille zeigt Auto-Kauf an/aus bzw. Restzeit eines Events. Ohne Filialleiter ausgeblendet.

### 3.7 Manager-Karte (rechts, über Szene)

- Vorbild: weiße Karte mit Portrait des „Investors“, erscheint zeitweise, antippbar → Angebot.
- Unsere Fassung: **Influencer-Besuch / Event-Karte** (S7, GAME_DESIGN § 12). Weiße Karte 96×72 px, `--shadow-float`, leichtes Wippen (`@keyframes bob`, 1.6 s, ±3 px), Portrait als Platzhalter-Sprite.

### 3.8 Bottom-Sheet: Stations-Panel

- Vorbild: siehe § 1.3. Panel-Höhe ~55 % Viewport, Szene darüber bleibt interaktiv (Pfeile links/rechts wechseln das Objekt).
- Unsere Fassung (`stationPanel.ts`):
  - Lasche mit `←` (schließt), Titel `Matcha-Bar` (Display 22 px), Chips rechts: `Zufriedenheit 100 % 🟡`, `62,78/s ⚡31` (Einkommen/s + Kapazitätsbedarf).
  - Weiße Detailkarte: Icon (64 px, `--c-primary`), Name, Beschreibung (`station.*.desc`), Level-Badge („LEVEL 7“ in `--c-primary-deep`-Pille), Preis `🍵 120` (blau) + `⚡ 0` (orange), CTA `VERBESSERN ✓` (blaue Pille, bei Max „MAX“, bei zu teuer grau `--c-tile-light` mit `--c-ink-muted`).
  - **x1/x10/x100/Max** aus S3 bleibt, als 4 Pillen *in* der Karte direkt unter Name und Level-Badge, vor Beschreibung und Werten (Vorbild hat nur x1; Multi-Buy ist unser Plan-Feature). So landet das Antippen eines Objekts in der Szene direkt beim Verbessern, auch auf kleinen Handys ohne Scrollen (e2e bei 360×640). Ambiente-Elemente haben an derselben Stelle einen breiten Kauf-Button.
  - In der Detailkarte zeigt die Zeile „✦ Neues Design ab Lv 25“ die nächste Optik-Stufe mit kleinem Vorschaubild (36 px); auf der letzten Stufe Krone + „Edelste Ausführung erreicht“ (`.look-next`, Fläche `--c-surface-2`, Symbol `--c-gold`). Das Kachel-Icon im Grid zeigt immer die aktuelle Stufe (auch bei Tischen).
  - Icon-Grid 5 Spalten: **alle 8 Stationen des Standorts** (GAME_DESIGN § 4) plus die Ambiente-Elemente
    (§ 5.1), je Kachel das Icon und das Level als Eck-Badge. Antippen wechselt die Detailkarte oben, ohne das
    Panel zu schließen. Ausgewählt = weiß mit blauem Icon, kaufbar = `--c-tile` mit weißem Icon, gesperrt =
    `--c-navy-900` mit Schloss und Freischalt-Level, Premium (Blätter, S7) = schwarz mit 🍃-Gold-Icon statt Hai.
    Im Vorbild sind die Kacheln die Möbel *eines* Zimmers; bei uns ist das Café das Zimmer und die Stationen
    sind die Möbel (§ 5).
  - Pfeile `‹ ›` am Szenenrand wechseln zur nächsten Station (ersetzt Antippen im Raum nicht, ergänzt es).

### 3.9 Vollbild-Screen: Verwaltung

- Vorbild: Titel, X, Tab-Leiste, Statistik-Karte, Listen-Karte.
- Unsere Fassung: ein Screen `Verwaltung` mit Tabs `🔧 Stationen` · `📣 Marketing` · `👥 Personal` · `📊 Statistik` (bündelt `shopPanel`, `marketingPanel`, `staffPanel`, Statistik aus GAME_DESIGN § 16 Nr. 9). Die heutigen getrennten Panels werden Tabs dieses Screens; Deep-Links von HUD/Bottom-Bar öffnen den jeweiligen Tab.
- Statistik-Karte (`.stat-bars`): Balken `Stations-Einnahmen`, `Ambiente-Einnahmen`, `Trinkgeld` (periwinkle); `Auslastung 44/44` als Textzeile; `Gehaltskosten`, `Werbekosten` (vivid blue); **Tagesbilanz** als große grüne/rote Pille mit ▲/▼.
- Listen-Karte: Tabs `Stationen` · `☕ Ambiente`; je Zeile Icon (blau), Name + Typ-Untertitel, `⚡ 17` orange, `🍵 629` grün, Button `LOS` (grün = kaufbar, grau = nicht), Auslastung als goldener Balken mit Prozent. Gestrichelte Trenner `1px dashed --c-surface-2`.

### 3.10 Chips, Badges, Ringe

- `.chip` – dunkle transluzente Pille, 28 px hoch, Icon + fetter Text.
- `.badge` – 20 px Kreis, `--c-danger` (Hinweis) oder `--c-primary-deep` (Zahl), absolut oben links/rechts.
- Fortschrittsring (vorgerenderte Frames `ring-0` … `ring-24` im Figuren-Atlas, keine Phaser-`Graphics`, damit die Kanten in jedem Zoom glatt bleiben): weiße Scheibe mit leichtem Schlagschatten, helle Spur in aufgehelltem `--c-success`, Fortschritt als `--c-success`-Bogen mit runden Enden ab 12 Uhr im Uhrzeigersinn. Über dem Kunden, der gerade bestellt, über arbeitenden Baristas und über Putzkräften, die einen Tisch wischen (ersetzt S4-Smileys *nicht* – Smiley bleibt für Zufriedenheit, Ring für Wartezeit/Arbeit).
- Anzeigetafel in der Szene (Vorbild: rotes LED-Display „09:00 AM“ / „0“): bei uns **Warteschlangen-Zähler** über der Kasse als dunkle Tafel mit roter 7‑Segment-Zahl.

### 3.11 Tabs

- Vorbild: Reiter als abgerundete Rechtecke oben an der Karte; aktiver Reiter weiß und ohne Unterkante (verschmilzt mit Karte), inaktive `--c-periwinkle-200` mit weißem Icon.
- Klasse `.tabs--card`; ersetzt die Unterstrich-Tabs aus S3.

### 3.12 Dialoge, Toasts

- Dialog: weiße Karte, `--r-card`, Titel Display 22 px, Text `--c-ink`, Aktionen als Pillen (primär blau, sekundär `--c-tile-light`), X oben rechts in `--c-danger-soft`.
- Toast: weiße Pille mit Icon, Schatten `--shadow-float`, von unten einfliegend. Erfolg = grünes Icon, Fehler = rotes Icon, kein farbiger Rand mehr.

---

## 4. Szene (Phaser) – Stilregeln

| Regel | Umsetzung |
|---|---|
| **Flat-Shaded-Iso** statt Pixel-Art | Jede Fläche eine Lokalfarbe, drei Helligkeitsstufen je Objekt (Top 100 %, links 85 %, rechts 70 %), keine Texturen, keine Outlines, keine Dithering. Sprites als SVG/Vektor-gerenderte PNG in 2×, `pixelArt: false`, `antialias: true`. Siehe § 6. Wie bei den gerenderten Low-Poly-Möbeln des Vorbilds: gefaste Oberkanten (schmale, hellere Kantenflächen, `bevel`), weicher Kontaktschatten unter jedem Objekt (Indigo, ~24 %), Metall mit Glanzstreifen statt Verlauf, Glas halbtransparent mit zwei Reflexen, warmes Licht (LED, Lampe, Glut) als weichgezeichnete Fläche. Werkzeuge in `scripts/art/iso.ts`. |
| Dollhouse-Schnitt | Rückwände hoch, Vorderwände auf 25 % Höhe gekappt, damit der Blick ins Café frei ist (Vorbild: Lobby/Restaurant). |
| Palette Welt | Boden warm (`#e8c48a` Holz, `#c8d8e8` Fliese), Wände pastell (Matcha-Grün `#b8d9a8`, Creme `#f4ead8`), Akzente kräftig (Matcha `#6ea84f`, Sakura `#f5b8c8`, Terrakotta `#c86434`). Keine reinen Grautöne. |
| Figuren | Blockfiguren mit großem Würfelkopf und kurzem Körper (Sprite 32×56, `CHAR_SPRITE`), weicher Bodenschatten, Frames Stehen + 2 Schritte (Zyklus 1-0-2-0) und Sitzpose (Beine vorn, Blick zum Tisch) für Gäste am Tisch. Kundentyp über Accessoires und Silhouette, je Typ mehrere Gen-Z-Matcha-Varianten (`CUSTOMER_LOOKS`: z. B. Student = Jutebeutel/Claw-Clip/Mullet, Tourist = Bucket Hat/Riesenrucksack/Sonnenhut, Influencer = Ringlicht/Selfie-Stick/Fell-Mikro, Kritiker = Notizbuch). Keine Gesichter; Sonnenbrille, Brille, Schnurrbart und Bart gelten als Accessoire. Personal in Schürze `--c-success`, mehrere Looks je Rolle (`STAFF_LOOKS`, Phase 2): Verkäufer mit Tablet, Barista, Bedienung mit **Tablett** (Becher + Kuchen), Putzkraft mit Mopp, Filialleiterin im Blazer, Social Media mit Ringlicht. Smiley, Ring und Emote sitzen über dem Kopf. Katalog: `docs/screenshots/figuren/katalog.png`. |
| Theken und Ausstattung (Phase 2) | Theken als Module, 1 Kachel tief, Front zur Kundenseite, Nachbarmodule schließen nahtlos an. Die Gästetheke ist ein **L**: gerade Module (Front +y), quer gestellte (Front +x, Variante „b“) und ein Eckmodul, an dem Paneele, Fußstange und Platte um die Ecke laufen; Kasse (auch mit offener Lade) und Ausgabe gibt es in beiden Richtungen. Ausstattung steht an der Rückwand hinter dem Personal-Gang (Arbeitsplatte mit Unterschrank und Wandregal, Maschine, Ofen, Kühl-/Eisfach) oder **auf** der Theke (Kasse, Ausgabe-Station: eigenes Sprite über einem leeren Thekenmodul). **Fünf Ausbaustufen** an den Meilensteinen Level 1/10/25/50/100 (`STATION_LOOK_LEVELS`, gleichzeitig ×2 Tempo bzw. Preis): Jede Stufe ist sichtbar edler – mehr Teile, bessere Geräte und eine durchgehende **Material-Leiter**: (1) Kobalt-Lack mit Edelstahlplatte (Kiez-Café) · (2) gebürsteter Edelstahl, Terrazzo-Platte, blauer Sockel, Chrom · (3) blau glasierte Fliesen, weiße Quarzplatte, Chrom · (4) Nussbaum-Lamellen, Marmor mit Adern, Messing · (5) Nachtblau-Lack mit Gold-Intarsien, Marmor mit Goldkante, Gold, warmes LED-Licht, Plakette mit Blatt-Emblem. Grundfläche und Platz bleiben, die Form darf edler werden (z. B. Siebträger → Hebel-Espressomaschine mit Goldkuppel, Registrierkasse → nostalgische Goldkasse, Ofen → Kuppelofen → Herd mit Haube). Die Gästetheke folgt dem **Café-Level** (`COUNTER_LOOK_CAFE_LEVELS` 1/3/6/10/15) mit wechselnder Deko je Modul (`COUNTER_PROPS`). Katalog: `docs/screenshots/ausstattung/katalog.png`. |
| Tische (Phase 2) | Runder Tisch auf Säulenfuß mit zwei Stühlen (Sitzplätze links/rechts bleiben in jeder Stufe gleich). Vier Optik-Stufen nach Anzahl der Tische (`TABLE_LOOK_LEVELS` 1/13/25/40): Edelstahl-Bistrotisch mit Kobalt-Bistrostühlen → Tischdecke, gepolsterte Eichenstühle, Blume → Marmor auf Dreifuß, Bugholzstühle, Kerze → Marmor mit Messingkante, Samtsessel, Tischlampe. Dreckige Tische bekommen einen Schmutz-Marker (Krümel + Tasse), den die Putzkraft wegwischt. Sitzende Gäste nutzen die Sitzpose, Blick zur Tischmitte. |
| Kiez-Café (Berlin) | Farb- und Materialsprache der knallblauen Berliner Third-Wave-Cafés (Vorgabe Vincent: LAP Coffee als Vorbild): heller Terrazzo-Boden, weiße Wände mit kobaltblauem Fliesenspiegel (Fugen als helle Flächen) und Edelstahl-Sockel, Leuchtkasten-Menü und Becherregal statt Fenstern, Vorderwände als blaue Fassade mit Edelstahl-Abdeckung, Nasenschild mit Blatt, blaue Pflanzkübel, blaue To-go-Becher. Kein Logo, kein Name, keine Schrift im Bild. |
| Café-Grundriss | Kompakt und kein Viereck: Raum 11×10 (die Ecke an der Kreuzung bleibt, geschrumpft nach hinten/links; Altbauten füllen den Block) plus verglaster **Wintergarten** vorn links (Holzboden im Fischgrätmuster, Glaswände mit Sprossen in Fassadenfarbe). Tür in der rechten Fassade direkt am Kassen-Schenkel der L-Theke. **Lager** hinten links: Edelstahl-Regale mit kobaltblauen Stehern voller Vorräte (Matcha-Dosen, Bohnensäcke, Milch/Hafermilch, Sirup, Becher, Zucker, Mehl, Croissant-Kisten), füllt sich in drei Stufen mit der Zahl gekaufter Geräte (`STORAGE_LOOK_DEVICES`), zuletzt mit einer Palette. Wände überall dort, wo Raum an Nicht-Raum grenzt (Vorderwände 25 %, Glas höher, aber durchsichtig). **Terrassen-Tische** mit Sonnenschirm wachsen mit der Terrassen-Stufe (vorn, rechts am Gehweg, Ecke). |
| Café-Deko | Mit dem Deko-Level (0–30) füllt sich das Café: Barhocker, Pflanzen, Teppiche/Läufer unter Tischgruppen, Pendelleuchten, Bilder an der Wand (Rahmen mit Passepartout, Motive ohne Schrift), Neon, Regale, Wandleuchten, Uhr, Schallplatten, am Ende eine goldene Matcha-Skulptur. Wand-Deko liegt bündig auf der Rückwand. |
| Endausbau | Der Raum wird mit dem Deko-Level edler (`ROOM_LOOK_DECOR_LEVELS`): Boden Terrazzo → Terrazzo mit farbigen Einschlüssen und Messing-Fugen (12) → heller Marmor mit Adern, Messingfugen und kleinen dunklen Ecken-Einlegern (24, kein Schachbrett); Wände mit Riffelpaneelen, Messingleiste und Gesims (20); Vorderwände mit Blumenkästen (16); Pendelleuchten werden Opalglas-Kugeln in Messing (25), Olivenbäume in Messingkübeln (27), Kronleuchter über dem Mittelgang (29); warme Lichtkegel unter den Leuchten. Marmor- und Einschluss-Farben je Standort (`ThemeArt.lux`). |
| Stadtviertel | Wie im Vorbild steht das Café nicht im Leeren: **Straßenraster** mit Berliner Blöcken (`data/city.ts`). Jeder Block: Eckhäuser mit Walmdach, Häuserzeilen mit Satteldach, Gauben und Schornsteinen, Innenhof mit Bäumen. Häuser aus **Fassaden-Modulen** (eine Achse × ein Geschoss: zehn Ladentypen mit Markise und Auslage, Haustür, Fenster mit Stuck, Balkon, Gesims; Putz oder Klinker), Dächer als Flächen (Rückseite hell, +y 90 %, +x 76 %). Hohe Häuser nur hinter und neben dem Café; vorn Kiezpark, Sportplatz, Wochenmarkt am Kanal, Spree. Kein sichtbarer Rand: Die Stadt reicht über den Ausschnitt hinaus, ferne Blöcke vereinfacht im Dunst, die Kamera bleibt in `CITY.view`. Autos, Radfahrer, Passanten, Tauben (fliegen auf, wenn jemand kommt), Ampeln und Dampfer sind kosmetisch; an der Kreuzung am Café vier **Autoampeln** (schwarzes Gehäuse, weiß umrandete Kontrastblende, Lichter zur Kamera) in deutscher Folge Rot → Rot-Gelb → Grün → Gelb, dazu Fußgängerampeln mit Ampelmännchen; Brunnen im Park sprudelt; nachts Laternen-Glow und erleuchtete Fenster. |
| Tag/Nacht | Spielzeit → Tageszeit (24 min = 1 Tag). Nachts `--c-night` als Multiply-Overlay 35 %, Fensterlicht und Lampen als additive warme Kreise. Rein kosmetisch, keine Einnahmen-Wirkung (CLAUDE.md). |
| Kamera | Fester Winkel, Pinch-Zoom 0.8–1.6, Pan begrenzt auf Grid + Rand. Beim Antippen einer Station Zoom auf 1.3 und Panel öffnen (Vorbild: Zimmer-Panel; Zoom noch offen). Der Ausschnitt bleibt, wo der Spieler ihn hinschiebt – auch wenn sich die Spielfläche ändert (Adressleiste, Drehen); nur die unbewegte Startansicht passt sich neu ein. Wischen und Zoomen auf der Szene gehören dem Spiel (`touch-action: none`), die Seite federt nie. |
| Antippen (Vorgabe Vincent) | **Jedes Objekt öffnet direkt sein Upgrade-Panel** (`scenes/tapTarget.ts`): Geräte, Thekenmodule (gehören zur Kasse bzw. zum Gerät darauf), Warteschlangen-Tafel (Kasse), Tische (Tische), Terrassen-Tische (Terrasse), Deko-Stücke inkl. Barhocker und Wand-Deko (Deko), Musik-Anlage, WLAN. Deko, Musik und WLAN zählen nur dort, wo sie sichtbar sind (Pixel-Test ab Alpha `SCENE_FX.tapAlpha`, ohne weiche Schatten und Lichtscheine); von mehreren Objekten unter dem Finger gewinnt das oberste sichtbare, knapp daneben das oberste getroffene. Böden (Teppiche, Terrassen-Fliesen) und das Lager (keine eigene Stufe) füllen wie bisher den Hype. **Keine Level-Schilder über Objekten**: Das Level steht nur im Panel; über Bauplätzen stehen nur „Kaufen“ bzw. „Terrasse nötig“. |
| Feedback | Kauf: Objekt „ploppt“ (Scale 0 → 1.1 → 1, 250 ms). Level-up: weißer Shine-Sweep. Neue Optik-Stufe: zusätzlich Funken und „Neues Design!“ über dem Gerät; wird die Theke oder werden die Tische edler, ploppen alle Module bzw. Tische als Welle von links nach rechts. Bezahlen: Kassenlade fährt aus, „+Betrag“ über dem zahlenden Gast (bei vielen Zahlungen gesammelt, höchstens alle 400 ms), ein grüner Geldschein fliegt vom Zahlenden ins Geld-Feld des HUD – genau dann, wenn `core` die Zahlung bucht (GAME_DESIGN § 7.2). Der Schein hat in jedem Zoom dieselbe Bildschirmgröße (34 → 40 px breit, `SCENE_FX.cashBillPx`), startet links neben dem Betrag und folgt beim Flug der Kamera. Beim Servieren nur noch ein Emote. |
| Bewegung im Café (Phase 2) | Gäste: Tür → nach zwei, drei Kacheln Schlange entlang des Kassen-Schenkels (neben der Schlange heran, höchstens 6 Figuren, der Rest zählt auf der Tafel) → bestellen und **bezahlen** an der Ecke (Ring bis zur Zahlung) → um die Ecke zum Abholplatz an der Ausgabe oder zum Tisch → Abholer setzen sich mit ihrem Getränk oft auf einen freien **Barhocker** (Sitzpose höher, Blick zur Theke, Getränk auf der Thekenplatte) → hinter der Schlange vorbei hinaus. Bedienungen kommen durch einen Durchgang in der Theke in den Gastraum. **Personal arbeitet sichtbar** („kleine Arbeiter“): Verkäufer stehen hinter der Kasse, deren Bildschirm bzw. Tasten zu ihnen zeigen, und tippen, solange jemand bestellt; nach jeder Bestellung fährt die Kassenlade aus. Baristas bereiten mit dem Rücken zum Gastraum zu (Hände im Takt, Fortschrittsring, Geräte-Effekt: Dampf, Dampfstöße, Frost, Glut, Pulver, Funkeln), tragen den Becher den Personal-Gang entlang zur Ausgabe und stellen ihn ab, holen gelegentlich Nachschub aus dem Lager (greifen ins Regal, tragen Dose, Sack oder Karton ans Gerät); Bedienungen nehmen ihn mit und laufen mit Tablett zum Gast. Putzkräfte gehen von Tisch zu Tisch zu dreckigen Tischen und wischen sonst den Boden in der Nähe. Musiknoten über der Anlage, Dampf über den Tassen. **Wege wirken natürlich**: direkt und mit gerundeten Ecken (Wegsuche, kein Raster-Zickzack), jeder Weg beginnt dort, wo die Figur gerade steht, und führt um Tische, Stühle, Deko und Wartende herum; an den Platz tritt man von der freien Seite, Bedienungen treten neben den Gast. Gehende Figuren behalten auf schrägen Wegen ihre Ansicht (kein Flackern zwischen zwei Ansichten), jeder Gast hat sein eigenes Tempo, auf dem Gehweg blenden Gäste ein und aus. Alles kosmetisch – Spawn und Tempo kommen aus den Raten in `core`. |

---

## 5. Mapping Hotel → Matcha (sichtbarer Inhalt)

| Hotel-Element (UI) | Matcha Café Empire | Status im Repo |
|---|---|---|
| 💵 Cash | 💵 Geld (grüner Geldschein, vorher Matcha-Münze) | vorhanden |
| ⚡ Energie (Generator begrenzt Käufe) | ⚡ **Kapazität**: Theken-/Sitzplätze begrenzen, wie viele Stationen laufen; Ambiente „Sitzbereich“/„Terrasse“ = Generator-Äquivalent | **neu** – Vorschlag für S9/Offen; bis dahin Zahl ausblenden |
| 💎 Gems | 🍃 Goldene Blätter | vorhanden (verdienbar ab S5) |
| ★★★★★ Sterne | 🍃🍃🍃🍃 Qualitätsgrad (4 Stufen) | S5 |
| Zimmer 201 (ein Raum mit vielen Möbeln) | Das Café selbst; Stations-Panel zeigt alle Stationen als Kacheln | vorhanden (Panel-Umbau S8) |
| Doppelbett, Nachttisch, TV … (Möbel mit Level) | Stationen (Matcha-Bar, Kasse, To-go-Fenster …) und Ambiente | vorhanden |
| Restaurant, Pool, Spa | Ambiente: Sitzbereich, Terrasse, Deko, Musik, WLAN | vorhanden |
| Front Desk / Housekeeping / Kitchen | Barista, Kassierer, Bäcker, Tee-Meister, Reinigungskraft, Social-Media, Filialleiter | vorhanden |
| Verwaltung → Statistik, Tagesbilanz | Verwaltung → Statistik, Tagesbilanz | S5/S9 |
| Werbung (Flyer/Radio/TV/Social) | Marketing-Level + Kampagne | vorhanden |
| VIP / Investor-Karte | Influencer-Besuch, Event-Karte | S7 |
| Manager-Portrait + Timer | Filialleiter + Auto-Kauf/Event-Timer | S4 (Filialleiter), S7 |
| Belegung 44/44 | Auslastung Sitzplätze | S5 |
| Hai-Kachel (Kredit) | 🍃-Premium-Kachel (nur spielintern) | S7 |
| Weltkarte im Verwaltungs-Hintergrund | Weltkarte mit 6 Standorten (Berlin → Bali) | S6 |
| LED-Tafel „09:00 AM“ | Warteschlangen-Zähler an der Kasse | S8 |
| Uhr `10:56 PM` | Café-Tageszeit (kosmetisch) | S8 |

---

## 6. Entscheidungen und Abweichungen vom PLAN

1. **Grafikstil: Flat-Shaded-Iso statt Pixel-Art.** PLAN nannte ursprünglich „isometrisches Pixel-Art“ und eine Pixel-Font. Das Vorbild ist Low-Poly-Flat-Shading ohne Pixel-Ästhetik. **Entschieden (Vincent, 2026-10-14): Flat-Shaded.** PLAN § 0, § 2.3 und S8 sind entsprechend angepasst; `pixelArt: false`, Vektor-Iso-Sprites (SVG → PNG 2×).
2. **Navigation ohne Labels.** Die untere Leiste bekommt nur Icons (wie Vorbild). Barrierefreiheit über `aria-label`, Tooltip auf Desktop, Onboarding in S9. Der e2e-Test `nav-*` bleibt über `data-testid` stabil.
3. **Ein Verwaltungs-Screen mit Tabs** ersetzt vier Einzelpanels (Shop, Personal, Marketing, Statistik). Weniger Code, näher am Vorbild. Stations-Panel bleibt Bottom-Sheet.
4. **Kapazität (⚡) als neues sichtbares System** nur, wenn GAME_DESIGN es bekommt (S9-Balancing). Bis dahin kein ⚡ im HUD – kein Platzhalter-Wert anzeigen.
5. **Schriften lokal**, Lizenz in `docs/ASSETS.md`. Keine neuen npm-Abhängigkeiten nötig.
6. **Icons:** gefüllte Glyphen als Inline-SVG-Sprite (`public/assets/ui/icons.svg`), Quelle z. B. Lucide/Phosphor Fill (MIT/OFL) oder selbst gezeichnet – Eintrag in `ASSETS.md`. Emoji nur noch als Fallback, nicht im finalen Skin.
7. **Ausstattung wird mit dem Level edler (Vincent, 2026-10-15):** fünf Optik-Stufen an den Meilensteinen statt drei
   Stufen „nie andere Formen“ – wie im Vorbild, wo Möbel beim Ausbau sichtbar luxuriöser werden. Die Material-Leiter
   (§ 4) gilt für alle Geräte gleich, damit man die Stufe eines Geräts auf einen Blick erkennt. Möbel liegen in einem
   eigenen Atlas (`furniture.png`, eigene 256-Farben-Palette), Figuren und Effekte in `common.png`.
8. **Kiez-Café und Stadtviertel (Vincent, 2026-10-15):** Das Berliner Café übernimmt die Farb- und Materialsprache
   von LAP Coffee (Blau, Edelstahl, Weiß), die Stufen 1–3 der Material-Leiter folgen ihr. Um das Café liegt ein
   Stadtviertel wie die Umgebung der Hotels im Vorbild; Stadt-Objekte in einem eigenen Atlas `city.png`,
   Fassaden-Module im Themen-Atlas je Standort. Runde 2: Grundriss als L (Wintergarten), Terrassen-Tische nach
   Terrassen-Stufe, Deko nach Deko-Level, Straßenraster mit Blöcken und Dächern statt aneinandergereihter Häuser.
9. **Café mit Leben und Endausbau (Vincent, 2026-10-15):** Personal arbeitet sichtbar (Arbeits- und Trage-Frames,
   Baristas laufen zur Ausgabe), die Kasse zeigt mit der Bedienseite zum Verkäufer (DOM-Icon weiter mit Bedienseite
   zum Betrachter), Fortschrittsringe als Bild-Frames, Autoampeln an der Kreuzung, Endausbau des Raums nach
   Deko-Level (Boden, Wände, Fassade, Leuchten).
10. **Geldscheine statt Matcha-Münzen, Bezahlen an der Kasse, Barhocker (Vincent, 2026-10-15):** Die Währung heißt
    „Geld“/„Cash“ und zeigt einen grünen Geldschein (HUD-Icon selbst gezeichnet, Szene-Sprite `cash`), wie das
    💵 im Vorbild. Geld kommt erst herein, wenn ein Gast an der Kasse bezahlt hat (Lade, Betrag, Schein, HUD springt
    an). Barhocker sind einzelne Sprites, damit Sitzende davor sortiert werden; die Pendelleuchten der Bar hängen
    über der Theke (Schein auf der Thekenplatte), nicht über den Hockern.

---

## 7. Umsetzungs-Checkliste (für S8 „UI-Skin“)

- [x] `style.css`: `:root`-Tokens aus § 2 ersetzen die Dunkelgrün-Tokens; `--font-ui`/`--font-display` mit lokalen WOFF2.
- [x] `data/ui.ts`: `UI_THEME` mit denselben Hex-Werten für Phaser (Ring, Nacht-Overlay, Tafel).
- [x] HUD neu: `.hud-pill`, `.status-pill`, `.quality-pill`, rechte Spalte `.btn-round`, `.actionbar` (ersetzt `.nav`), Avatar, Zahnrad.
- [x] Stations-Panel: Kopf-Chips, weiße Detailkarte, Icon-Grid 5 Spalten, Pfeile.
- [x] Verwaltungs-Screen mit Karten-Tabs; Statistik-Balken; Listen-Zeilen mit „LOS“.
- [x] Dialog/Toast weiß.
- [x] Szene: Tag/Nacht-Overlay, Fortschrittsringe, Warteschlangen-Tafel, Kauf-Plopp.
- [x] axe-e2e grün (Kontrast § 2.1), Touch-Ziele ≥ 44 px, `prefers-reduced-motion` respektiert (kein Wippen, kein Shine).
- [x] `docs/ASSETS.md`: Fonts + Icon-Set mit Lizenz.
- [x] Screenshots DE/EN im PR, Hochformat 390×844 und Desktop 1280×720.
