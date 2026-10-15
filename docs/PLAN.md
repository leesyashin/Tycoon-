# Matcha Café Empire – Umsetzungsplan für Claude Opus 5.5

> Idle-/Tycoon-Browserspiel nach dem Vorbild von **Idle Hotel Empire Tycoon**, nur mit **Matcha-Cafés** statt Hotels.
> Dieser Plan ist die Arbeitsgrundlage für mehrere aufeinanderfolgende Opus-Sessions. Jede Session liest zuerst
> `CLAUDE.md`, dann `docs/STATUS.md`, dann den eigenen Abschnitt in diesem Plan.

Stand: 2026-10-15 (Phase 2 ergänzt) · Auftraggeber: Vincent · Repo: `leesyashin/tycoon-`

---

## 0. Kurzfassung

| Thema | Entscheidung |
|---|---|
| Plattform | Web-App (Browser + PWA fürs Handy) |
| Stack | Vite + TypeScript + **Phaser 3** für die Iso-Szene, HTML/CSS-Overlay für Menüs |
| Grafik | Isometrisches **Flat-Shaded-Low-Poly** (2:1-Diamant-Tiles, flache Lokalfarben, keine Texturen/Outlines) nach dem Vorbild; UI-Stil 1:1 nach `docs/UI_STYLE.md`. Platzhalter zuerst, echte Sprites in Session 8 |
| Umfang | Vollständiges Spiel: Stationen, Personal, Kunden-Sim, Zufriedenheit, Marketing, Qualitätsstufen, Achievements, Quests, mehrere Standorte, Prestige, Events, Sound |
| Sprache | i18n von Anfang an: Deutsch + Englisch, umschaltbar |
| Speichern | Nur lokal (localStorage, versioniertes Schema, Export/Import als Datei). Kein Backend |
| Monetarisierung | **Vorbereitet, nicht aktiv**: Premium-Währung + `MonetizationProvider`-Interface mit No-op-Implementierung |
| Vorgehen | 10 Sessions (S0–S9), jede Session = ein Branch + ein PR + aktualisiertes `docs/STATUS.md` |

Das Spieldesign (Stationen, Formeln, Währungen, Standorte) steht in **`docs/GAME_DESIGN.md`**. Dieser Plan beschreibt *wie* und *in welcher Reihenfolge* gebaut wird.

---

## 1. Vision und Mapping zum Vorbild

Idle Hotel Empire Tycoon: Man leitet ein Hotel, baut Zimmer und Einrichtungen, stellt Personal ein, Gäste kommen automatisch, Einnahmen laufen auch offline, mit genug Fortschritt schaltet man neue Hotels in neuen Städten frei. Premium-Währung für Boosts und Zeitsprünge.

| Hotel-Original | Matcha Café Empire |
|---|---|
| Hotel | Matcha-Café (Standort) |
| Städte / neue Hotels | Standorte: Berlin → Kyoto → Tokio → Seoul → New York → Bali |
| Zimmer-Typen / Möbel mit Level | Phase 1: Verkaufsstationen. Phase 2: **Ausstattung** der Theken – Kasse, Matcha-Station, Kaffeemaschine, Kühl-/Eisfach, Ofen, Kuchenvitrine, Steinmühle, Zeremonie-Set, Ausgabe-Station (GAME_DESIGN § 4) |
| Einrichtungen (Pool, Spa …) | Ambiente: Sitzbereich, Terrasse, Deko, Musik, WLAN |
| Personal (Rezeption, Reinigung, Koch) | Phase 2: Verkäufer (Bestelltheke), Baristas (Barista-Theke), Bedienungen (Ausgabe/Tischservice), Putzkräfte – als Anzahl; dazu Social-Media-Manager, Filialleiter |
| Rezeption → Zimmer → Housekeeping (Service-Kette) | Phase 2: Bestelltheke → Barista-Theke → Ausgabe/Tisch → Putzen (Service-Pipeline, GAME_DESIGN § 7.2) |
| Gäste + Zufriedenheit | Kunden-Typen (Student, Tourist, Influencer, Stammgast) + Zufriedenheit 0–100 |
| Marketing | Social-Media-Kampagnen |
| Sterne-Rating des Hotels | Matcha-Qualitätsgrad (Culinary → Premium → Ceremonial → Meister) |
| Prestige | „Franchise-Vertrag“: Standort zurücksetzen gegen **Zen** (permanente Boni) |
| Gems | **Goldene Blätter** (Premium-Währung, nur spielintern verdienbar) |
| Werbe-Boosts | Boost-Buttons gehen über das `MonetizationProvider`-Interface; No-op-Provider gibt Boosts über Timer frei |

---

## 2. Architektur

### 2.1 Grundprinzip: Simulation und Darstellung sind getrennt

- **`src/core`** ist reines TypeScript ohne Phaser, ohne DOM. Hier leben Ökonomie, Tick-Loop, Speichern, Prestige, Events. Vollständig mit Vitest testbar. Läuft auch headless für Balancing-Skripte.
- **`src/scenes`** (Phaser) zeichnet den Zustand aus `core`. Kunden-Figuren, Laufwege und Animationen sind **kosmetisch**: Sie beeinflussen die Einnahmen nicht. Die Einnahmen werden in `core` als Rate berechnet (siehe GAME_DESIGN § 14). Das macht Offline-Berechnung, Determinismus und Tests trivial.
- **`src/ui`** ist ein HTML/CSS-Overlay über dem Canvas (Shop, Panels, Settings). Kein Phaser-UI. Grund: Text-Rendering, Scrollen, i18n und Accessibility sind im DOM deutlich einfacher.
- **`src/data`** enthält alle Balancing-Werte als JSON/TS-Konstanten. Kein Zahlenwert hart im Code.

### 2.2 Ordnerstruktur (Ziel)

```
/
├─ CLAUDE.md                 Regeln für Opus
├─ docs/
│  ├─ PLAN.md                dieser Plan
│  ├─ GAME_DESIGN.md         Spieldesign + Formeln
│  ├─ STATUS.md              Übergabe-Datei, am Ende jeder Session aktualisiert
│  └─ ASSETS.md              Herkunft/Lizenz aller Grafiken und Sounds
├─ public/
│  ├─ assets/{sprites,tiles,ui,audio}/
│  └─ manifest.webmanifest
├─ src/
│  ├─ main.ts                Bootstrap: Phaser.Game + UI mounten
│  ├─ core/
│  │  ├─ economy/            Stationen, Upgrades, Kosten, Einkommen
│  │  ├─ customers/          Spawnrate, Zufriedenheit, Kundentypen (Rate-Modell)
│  │  ├─ staff/              Personal, Manager
│  │  ├─ progression/        Qualitätsstufen, Achievements, Quests, Standorte
│  │  ├─ prestige/           Zen, Franchise-Reset, Meta-Upgrades
│  │  ├─ events/             Zeit-Events, Boosts
│  │  ├─ monetization/       MonetizationProvider + NoopProvider
│  │  ├─ save/               Schema, Migrationen, Export/Import, Offline-Catch-up
│  │  ├─ math/               BigNum (break_infinity.js), Formatierung
│  │  ├─ GameState.ts        zentraler, serialisierbarer Zustand
│  │  └─ GameLoop.ts         fixer Tick (10 Hz), Catch-up
│  ├─ scenes/
│  │  ├─ BootScene.ts
│  │  ├─ CafeScene.ts        Iso-Raum, Stationen, Kunden-Agenten (kosmetisch)
│  │  └─ iso/                Iso-Mathe, Depth-Sort, Tile-Grid
│  ├─ ui/                    DOM-Komponenten (vanilla TS, kein Framework)
│  ├─ i18n/
│  │  ├─ de.json
│  │  ├─ en.json
│  │  └─ index.ts            t(key, params), Sprachwahl, Zahlen-/Währungsformat
│  └─ data/                  stations.ts, staff.ts, locations.ts, events.ts, achievements.ts …
├─ tests/                    Vitest (core) + Playwright-Smoke
├─ scripts/
│  └─ balance-sim.ts         headless Simulation für Balancing
└─ .github/workflows/        ci.yml (lint, test, build) + pages.yml (Deploy)
```

### 2.3 Technische Festlegungen

| Thema | Festlegung |
|---|---|
| Node / Paketmanager | Node 22 LTS, `pnpm` |
| Build | Vite 6, `base: '/Tycoon-/'` (Repo-Name hat Bindestrich am Ende, GitHub Pages braucht exakt diesen Pfad) |
| Phaser | Phaser 3.8x, WebGL mit Canvas-Fallback, `pixelArt: false`, `antialias: true` (Flat-Shaded-Vektor-Sprites, siehe UI_STYLE § 4) |
| Große Zahlen | `break_infinity.js` (Decimal). Anzeige: `1.23 K / M / B / T / aa / ab …`, Format pro Sprache |
| Tick | Fester Tick 100 ms in `core`. Render-Loop via Phaser `update()`. Bei Tab-Wechsel: Catch-up über `visibilitychange` |
| Offline | Beim Laden: `elapsed = min(now - lastSave, offlineCap)`, Einnahmen = Rate × elapsed × Offline-Effizienz (Start 50 %, upgradebar) |
| Save | localStorage Key `mce.save.v{N}`, Autosave alle 10 s + bei `visibilitychange`/`pagehide`. JSON mit `schemaVersion`, Migrationen in `save/migrations.ts`. Export/Import als `.json`-Datei. Zusätzlich IndexedDB-Backup der letzten 3 Saves |
| Zeit-Manipulation | Monotone Zeit via `performance.now()` für Ticks, `Date.now()` nur für Offline. Negative Deltas (Uhr zurückgestellt) werden auf 0 geclampt |
| i18n | Flache Key-Struktur `screen.element.text`, Platzhalter `{count}`, Plural über `Intl.PluralRules`. Jeder sichtbare String kommt aus `t()`. Lint-Regel/Test: `de.json` und `en.json` haben identische Keys |
| Iso | 2:1-Tiles, Basis 64×32 px, Grid 12×12 pro Café (erweiterbar), Depth = `y + x`-Sortierung. Eigener Helper, kein Plugin |
| Assets Phase 1 | Programmatisch erzeugte Platzhalter (Phaser `Graphics` → `generateTexture`). Session 8 ersetzt sie |
| Assets final | Flat-Shaded-Iso-Sprites (SVG → PNG 2×), CC0/kompatible Lizenzen (z. B. Kenney-Iso-Packs, Lizenz jeweils in `docs/ASSETS.md` eintragen) oder selbst gezeichnete/generierte Sprites. Stilregeln in `docs/UI_STYLE.md` § 4. **Keine** Assets aus dem Original-Spiel |
| Monetarisierung | `interface MonetizationProvider { isAvailable(); showRewarded(placement): Promise<RewardResult>; purchase(sku): Promise<PurchaseResult> }`. Im Build nur `NoopProvider`. Feature-Flag `MONETIZATION_ENABLED=false` |
| Tests | Vitest für `core` (Ziel: Formeln, Save-Migration, Offline, Prestige 100 % abgedeckt). Playwright: App lädt, Start-Café sichtbar, ein Kauf funktioniert, Reload behält Stand |
| Lint/Format | ESLint (typescript-eslint, strict) + Prettier. `pnpm check` = lint + typecheck + test |
| CI | GitHub Actions: `check` auf jedem PR, Deploy auf GitHub Pages bei Merge in `main` |
| Performance-Ziel | 60 fps auf Mittelklasse-Handy bei 40 sichtbaren Kunden; Bundle < 2 MB gzip ohne Audio |

### 2.4 Zustandsmodell (Kern)

```ts
interface GameState {
  schemaVersion: number;
  createdAt: number; lastSavedAt: number; playtimeSec: number;
  settings: { lang: 'de'|'en'; sfx: boolean; music: boolean; numberFormat: 'short'|'scientific' };
  meta: {                       // standortübergreifend, überlebt Prestige
    goldenLeaves: Decimal;      // Premium-Währung
    zen: Decimal;               // Prestige-Währung
    metaUpgrades: Record<string, number>;
    achievements: Record<string, { unlockedAt: number }>;
    lifetimeEarned: Decimal;
    unlockedLocations: string[];
  };
  activeLocationId: string;
  locations: Record<string, LocationState>;
  activeEvents: ActiveEvent[];
  boosts: ActiveBoost[];
  quests: QuestState;
}

interface LocationState {
  coins: Decimal; earnedThisRun: Decimal; level: number;
  stations: Record<string, { level: number; unlocked: boolean }>;
  ambience: Record<string, number>;     // Sitzplätze, Deko, Terrasse …
  staff: Record<string, number>;        // Anzahl / Stufe
  quality: number;                       // Matcha-Qualitätsstufe 0..n
  satisfaction: number;                  // 0..100
  marketing: { level: number; campaignUntil?: number };
  prestigeCount: number;
}
```

---

## 3. Session-Plan

### Übersicht

| # | Session | Ergebnis am Ende | Geschätzter Aufwand |
|---|---|---|---|
| S0 | Projekt-Setup | Leere App läuft, CI grün, Pages-Deploy, i18n-Skelett, Iso-Grid sichtbar | 1 Session |
| S1 | Core-Ökonomie | Stationen, Upgrades, Kosten, Einnahmen, BigNum, Tick, Save/Load, Offline – alles getestet, noch ohne Grafik | 1 Session |
| S2 | Iso-Szene + Kunden | Café-Raum, Stationen auf dem Grid, Kunden laufen/warten/kaufen (kosmetisch), Tap-Bonus | 1–2 Sessions |
| S3 | UI/HUD + Shop | Komplette DOM-UI: HUD, Stations-Panel, Shop, Personal, Settings, Sprachwechsel, Export/Import | 1 Session |
| S4 | Personal, Zufriedenheit, Marketing | Staff-Effekte, Zufriedenheits-Modell, Kampagnen, Filialleiter | 1 Session |
| S5 | Progression | Qualitätsstufen, Café-Level, Meilensteine, Achievements, Daily Quests, Café-Erweiterung | 1 Session |
| S6 | Standorte + Prestige | 6 Standorte, Freischaltung, Franchise-Reset, Zen, Meta-Upgrades | 1 Session |
| S7 | Events, Boosts, Premium | Zeit-Events, Boost-System, Goldene Blätter, MonetizationProvider (No-op), Zeitsprung-Shop | 1 Session |
| S8 | Grafik + Audio | UI-Skin nach `docs/UI_STYLE.md`, Flat-Shaded-Iso-Assets, Animationen, Partikel, SFX/Musik, Juice | 1–2 Sessions |
| S9 | Balancing, Tutorial, Release | Balance-Sim, Onboarding, PWA, Performance, Bugfixing, v1.0 | 1–2 Sessions |
| S10 | Service-Pipeline (Phase 2) | Bedientes Café: Bestellung → Zubereitung → Ausgabe, Ausstattung statt Stationen, Personal als Anzahl, Save v9 | 1 Session |
| S11 | Szene und Figuren (Phase 2) | Neuer Grundriss, Theken-/Ausstattungs-/Tisch-Sprites, bessere Figuren, Bedienungen und Putzkräfte | 1–2 Sessions |
| S12 | Balancing und Feinschliff (Phase 2) | Richtwerte, Tutorial zur Pipeline, Screenshots | 1 Session |

Gesamt: ca. 11–14 Sessions für Phase 1, dazu 3–4 für Phase 2 (siehe unten). Reihenfolge ist verbindlich, S2 und S3 können bei Bedarf parallel in zwei Branches laufen (Schnittstelle: `GameState` aus S1).

### Regeln für jede Session

1. Zuerst lesen: `CLAUDE.md` → `docs/STATUS.md` → eigener Abschnitt hier → relevante Teile von `docs/GAME_DESIGN.md`. Sobald die Session UI baut oder ändert: `docs/UI_STYLE.md` (§ 2 Tokens, § 3 Komponenten).
2. Branch `session/sN-kurzname` von `main`. Am Ende Draft-PR mit Checkliste der Abnahmekriterien.
3. `pnpm check` muss grün sein, bevor gepusht wird.
4. `docs/STATUS.md` am Ende aktualisieren: Was ist fertig, was ist offen, bekannte Bugs, Entscheidungen, nächste Schritte. Das ist die einzige Übergabe zur nächsten Session.
5. Keine Scope-Erweiterung ohne Eintrag unter „Offene Punkte“ in STATUS.md. Lieber kleiner und fertig als groß und halb.
6. Nach der Session dem Auftraggeber eine kurze Zusammenfassung mit Pages-Link liefern.

---

### S0 – Projekt-Setup

**Ziel:** Lauffähiges Grundgerüst, auf dem alle weiteren Sessions aufsetzen.

**Aufgaben**
- `pnpm create vite` (vanilla-ts), Phaser 3, break_infinity.js, Vitest, Playwright, ESLint, Prettier installieren.
- Ordnerstruktur aus § 2.2 anlegen (leere Index-Dateien mit Kommentar reichen).
- `vite.config.ts` mit `base: '/Tycoon-/'`, Pfad-Alias `@core`, `@ui`, `@scenes`, `@data`, `@i18n`.
- `src/main.ts`: Phaser-Game mit `BootScene` + `CafeScene`, `Scale.FIT`, 960×540 Logical, `pixelArt: true`.
- `CafeScene` zeichnet ein 12×12 Iso-Grid mit Platzhalter-Tiles (Graphics → Texture). Iso-Helper `toScreen(x,y)`, `toGrid(sx,sy)`, Depth-Sort.
- `src/i18n`: `t()`, Sprachdetektion (`navigator.language`, Fallback `en`), `de.json`/`en.json` mit 5 Beispiel-Keys, Test „Keys identisch“.
- HTML-Overlay-Container `#ui` über dem Canvas, ein Platzhalter-HUD mit `t('hud.coins')`.
- `.github/workflows/ci.yml` (install, lint, typecheck, test, build) und `pages.yml` (Deploy `dist/` nach GitHub Pages bei Push auf `main`).
- PWA-Grundlage: `manifest.webmanifest`, Icons-Platzhalter, `vite-plugin-pwa` mit Offline-Cache der Assets.
- `docs/STATUS.md` und `docs/ASSETS.md` anlegen.

**Abnahmekriterien**
- `pnpm dev` zeigt Iso-Grid + HUD-Text in beiden Sprachen (Umschalten über `?lang=de|en`).
- `pnpm check` grün, CI grün, Pages-URL erreichbar.
- README mit Start-Anleitung.

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/PLAN.md (Abschnitt S0) und docs/GAME_DESIGN.md (Überblick).
Setze Session S0 „Projekt-Setup“ komplett um. Branch: session/s0-setup.
Halte dich an die Festlegungen in PLAN.md § 2.3. Erstelle am Ende docs/STATUS.md,
führe pnpm check aus, pushe und eröffne einen Draft-PR mit der Abnahme-Checkliste.
```

---

### S1 – Core-Ökonomie (ohne Grafik)

**Ziel:** Das komplette wirtschaftliche Herz des Spiels als reine, getestete TypeScript-Bibliothek.

**Aufgaben**
- `GameState` + `createInitialState()` nach § 2.4.
- `data/stations.ts` und `data/locations.ts` für Standort 1 (Berlin) nach GAME_DESIGN § 4 und § 3.
- `economy/`: `getStationCost(def, level, amount)` (geometrische Reihe, Bulk x1/x10/x100/max), `getStationThroughput`, `getStationRevenuePerSec`, Meilenstein-Multiplikatoren (Level 10/25/50/100/200/…).
- `customers/`: Rate-Modell nach GAME_DESIGN § 7 und § 14: `spawnRate`, `effectiveCustomersPerSec = min(spawn, throughput)`, Einkommen/s.
- `GameLoop.ts`: fester Tick 100 ms, `tick(state, dtMs)` pure Funktion, Catch-up mit Obergrenze pro Frame (max. 1000 Ticks, Rest als Offline-Lump).
- `save/`: `serialize`, `deserialize`, `schemaVersion`, `migrations[]`, localStorage-Adapter, Export/Import-Funktion (ohne UI), Offline-Catch-up nach § 2.3.
- `math/`: Decimal-Wrapper, `formatNumber(d, lang, mode)` mit Suffix-Tabelle, Tests für Grenzen (999 → 1.00 K, 1e15, 1e33 …).
- Headless-Skript `scripts/balance-sim.ts`: spielt mit einfacher Greedy-Strategie N Stunden und gibt Zeit-bis-Meilenstein aus.
- Tests: Kostenformel, Bulk-Kauf, Einkommen, Meilensteine, Save-Roundtrip, Migration v0→v1, Offline-Cap, negative Zeitdelta.

**Abnahmekriterien**
- `core` hat keine Importe aus `phaser` oder DOM.
- Vitest ≥ 40 Tests grün, Coverage `core` ≥ 90 %.
- `pnpm sim --hours 2` druckt eine Progressionstabelle.

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S1) und docs/GAME_DESIGN.md (§ 3, 4, 7, 14, 18).
Setze S1 „Core-Ökonomie“ um: reine TS-Bibliothek in src/core ohne Phaser/DOM, vollständig getestet.
Alle Balancing-Zahlen kommen aus src/data. Branch: session/s1-core. Am Ende STATUS.md, pnpm check, Draft-PR.
```

---

### S2 – Iso-Szene und Kunden

**Ziel:** Das Café ist sichtbar und lebt. Spieler sieht Stationen und Kunden, kann tippen.

**Aufgaben**
- Café-Layout-Definition pro Standort (`data/layouts.ts`): Grid-Position, Footprint und Ausrichtung jeder Station und Ambiente-Elemente, Eingang, Laufpfade.
- `CafeScene`: rendert Boden/Wände, platziert Stationen nach `GameState` (gesperrt = Umriss/Schild „Kaufen“, gekauft = Sprite, Level als kleine Badge).
- Kunden-Agenten (kosmetisch): Spawn am Eingang proportional zur `effectiveCustomersPerSec`, einfache Wegfindung über vordefinierte Waypoints (kein A*), Warteschlange vor Station, Kauf-Animation, Münz-Popup, Abgang. Objekt-Pool, max. 40 gleichzeitig; über der Grenze nur Zähler „+N“.
- Kundentypen mit eigenem Platzhalter-Sprite (Farbe/Form) nach GAME_DESIGN § 7.
- Tap/Klick auf das Café: „Barista anfeuern“ → kurzzeitiger Rate-Bonus (GAME_DESIGN § 7.4), Partikel-Platzhalter.
- Klick auf Station öffnet Event `ui:openStation(stationId)` (UI kommt in S3, hier nur `console`/Stub).
- Kamera: Pinch-Zoom und Drag auf Mobile, Mausrad auf Desktop, Grenzen.
- Platzhalter-Sprite-Generator `scenes/placeholders.ts`, der für jede Station/Figur eine farbcodierte Iso-Form erzeugt.

**Abnahmekriterien**
- Bei 1 Kunde/s sind sichtbar Kunden unterwegs; bei 100/s bleibt es bei 40 Agenten + Zähler, 60 fps im Desktop-Chrome.
- Stationen erscheinen beim Kauf (Kauf vorerst via Debug-Taste `B`).
- Kein Einkommen hängt von der Szene ab (Test: Szene deaktiviert → Einnahmen identisch).

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S2) und GAME_DESIGN.md (§ 4, 7, 16).
Setze S2 „Iso-Szene + Kunden“ um. Kunden sind rein kosmetisch; die Rate kommt aus core.
Nutze programmatische Platzhalter-Sprites, keine externen Assets. Branch: session/s2-scene.
```

---

### S3 – UI/HUD und Shop

**Ziel:** Alles, was der Spieler anfassen kann, existiert als DOM-Overlay, zweisprachig.

**Aufgaben**
- UI-Mini-Framework in `src/ui/`: `mount(el, render)` + `store.subscribe` (kein React). Komponenten als Funktionen, CSS-Variablen für Theme.
- **HUD:** Münzen, Einkommen/s, Goldene Blätter, Zufriedenheit, Standort-Name, Buttons: Shop, Personal, Standorte, Achievements, Settings.
- **Stations-Panel** (Bottom-Sheet auf Mobile, Seitenpanel auf Desktop): Name, Beschreibung, Level, Einkommen, Kosten, Kauf-Buttons x1/x10/x100/Max, nächster Meilenstein.
- **Shop/Übersicht:** alle Stationen und Ambiente-Elemente als Liste mit Kaufbarkeit und „Kann ich mir leisten“-Markierung.
- **Settings:** Sprache DE/EN (sofort, ohne Reload), SFX/Musik (Platzhalter), Zahlenformat, Export/Import Save, „Spielstand löschen“ mit doppelter Bestätigung, Impressum/Lizenzen-Link.
- Offline-Einnahmen-Dialog beim Start („Du warst 3 h 12 min weg, verdient: …“).
- Toast-System für Freischaltungen/Fehler.
- Zahlen-/Währungsformat über `Intl.NumberFormat` je Sprache.
- Responsives Layout: Portrait-Handy zuerst, dann Desktop.
- Alle Strings in `de.json`/`en.json`.

**Abnahmekriterien**
- Komplette Spielschleife ohne Debug-Tasten spielbar: kaufen, upgraden, speichern, neu laden.
- Sprachwechsel ändert alle sichtbaren Texte inkl. Zahlenformat.
- Lighthouse Accessibility ≥ 90 (Kontrast, Fokus, aria-labels auf Icon-Buttons).

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S3) und GAME_DESIGN.md (§ 16, 17).
Setze S3 „UI/HUD + Shop“ als DOM-Overlay um, vanilla TS, zweisprachig, mobile-first.
Branch: session/s3-ui.
```

---

### S4 – Personal, Zufriedenheit, Marketing

**Ziel:** Die zweite Entscheidungsebene neben „Station upgraden“.

**Aufgaben**
- `data/staff.ts` nach GAME_DESIGN § 6: Barista, Kassierer, Bäcker, Tee-Meister, Reinigungskraft, Social-Media-Manager, Filialleiter.
- Effekte in `core`: Durchsatz-Multiplikatoren pro Stationsgruppe, Zufriedenheits-Verfall vs. Reinigung, Offline-Cap-Erhöhung durch Filialleiter.
- Zufriedenheits-Modell (§ 7.3): Wartezeit (Spawn vs. Durchsatz), Sauberkeit, Deko, Qualität → Zufriedenheit; Zufriedenheit → Spawn-Multiplikator und Trinkgeld.
- Marketing (§ 9): Kampagnen-Level (permanent) + zeitlich begrenzte Kampagne (Münzen) mit Abklingzeit.
- UI: Personal-Panel, Zufriedenheits-Detail (Tooltips, was drückt/hebt), Marketing-Panel.
- Szene: Personal-Figuren an ihren Stationen (kosmetisch), Zufriedenheits-Smileys über Kunden.
- Tests für alle Multiplikator-Pfade, Sim-Skript erweitern.

**Abnahmekriterien**
- Ohne Reinigungskraft sinkt Zufriedenheit sichtbar und Einnahmen fallen, mit ihr stabilisiert sie sich.
- Jede Personal-Entscheidung hat messbaren, im Panel erklärten Effekt.

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S4) und GAME_DESIGN.md (§ 6, 7, 9).
Setze S4 „Personal, Zufriedenheit, Marketing“ um. Branch: session/s4-staff.
```

---

### S5 – Progression

**Ziel:** Mittel- und langfristige Ziele, Freischalt-Rhythmus, Belohnungen.

**Aufgaben**
- Matcha-Qualitätsstufen (§ 8): kaufbar mit Münzen, globaler Preis-Multiplikator, schaltet neue Produkte an bestehenden Stationen frei (nur Text/Icon).
- Café-Level (§ 5.3): steigt mit Gesamt-Stationslevel, schaltet Stationen, Ambiente und Grid-Erweiterung frei (Terrasse = zusätzliche Tiles).
- Meilenstein-Boni je Station (Level 10/25/50/100/200/…): × Durchsatz oder × Preis, Anzeige im Panel.
- Achievements (§ 13): ~40 Stück, Belohnung Goldene Blätter, Panel mit Fortschritt.
- Daily Quests (§ 13): 3 pro Tag, Reset um lokale Mitternacht, Belohnung Goldene Blätter.
- Statistik-Screen: Lifetime-Einnahmen, Kunden bedient, Spielzeit.
- Tests: Freischalt-Bedingungen, Quest-Reset über Datumsgrenze, Zeitzonen.

**Abnahmekriterien**
- In der Sim erreicht ein Greedy-Spieler Café-Level 10 nach ca. 90 Minuten aktiver Spielzeit (Richtwert, in S9 feinjustiert).
- Achievements lösen korrekt aus, Toast + Belohnung einmalig.

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S5) und GAME_DESIGN.md (§ 5, 8, 13).
Setze S5 „Progression“ um. Branch: session/s5-progression.
```

---

### S6 – Standorte und Prestige

**Ziel:** Der große Loop: neues Café eröffnen, altes gegen permanente Boni zurücksetzen.

**Aufgaben**
- Alle 6 Standorte in `data/locations.ts` + Layouts (§ 3): eigene Münz-Balance, eigene Stations-Varianten (Namen/Preise/Skins), Freischaltung über Café-Level des Vorgängers + Zen.
- Standort-Übersicht (Weltkarte als stilisierte Liste/Karte), Wechsel zwischen Standorten, alle Standorte produzieren parallel (Offline inklusive). UI: Vollbild-Screen mit dunkler Weltkarte und weißen Karten nach UI_STYLE § 3.9, Nav-Kreis „Standorte“ nach § 3.5.
- Franchise-Reset (§ 11): Standort zurücksetzen → Zen nach Formel, Bestätigungsdialog (UI_STYLE § 3.12) mit Vorschau „Du bekommst X Zen, das sind +Y % …“.
- Meta-Upgrades mit Zen (§ 11.3): globaler Einkommens-Multiplikator, Start-Kapital, Offline-Effizienz, Kaufrabatt, Tap-Stärke.
- Migration Save v1 → v2 (mehrere Standorte).
- Tests: Zen-Formel, Reset erhält `meta`, Freischalt-Kette, Migration.

**Abnahmekriterien**
- Reset löscht nur `LocationState`, nie `meta`.
- Zweiter Standort ist nach GAME_DESIGN-Richtwert (~3–4 h Spielzeit) erreichbar (Sim).

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S6) und GAME_DESIGN.md (§ 3, 11).
Setze S6 „Standorte + Prestige“ um. Branch: session/s6-prestige.
```

---

### S7 – Events, Boosts, Premium-Währung, Monetarisierungs-Interface

**Ziel:** Abwechslung im Idle-Rhythmus und die vorbereitete, aber inaktive Monetarisierungs-Schicht.

**Aufgaben**
- Event-System (§ 12): zufällige und kalendarische Events mit Dauer, Modifikatoren (z. B. Hitzewelle: Iced-Bar ×3), Ankündigungs-Banner, Szene-Overlay (Farbfilter/Partikel).
- Boost-System: zeitlich begrenzte Multiplikatoren, stapelbar nach Regeln, sichtbar im HUD mit Restzeit (Boost-Pille in der Bottom-Bar, UI_STYLE § 3.5; Event-Karte am rechten Rand, § 3.7; Status-Pille, § 3.2).
- Goldene Blätter (§ 10): Quellen (Achievements, Quests, Events, seltene Kunden-Drops), Ausgaben: Zeitsprung 1 h/4 h/8 h, Boost ×2 für 30 min, Sofort-Fertigstellung einer Kampagne, kosmetische Skins (Vorbereitung, 2 Beispiele). Blätter-Shop öffnet über den „+“-Kreis der HUD-Pille (UI_STYLE § 3.1); Premium-Kacheln nach § 3.8.
- `monetization/`: Interface + `NoopProvider`. UI-Buttons „Boost ansehen“ rufen `provider.showRewarded()`; `NoopProvider` liefert den Boost nach einem Timer (z. B. alle 20 min ein Gratis-Boost). Feature-Flag `MONETIZATION_ENABLED`. Ein Doku-Abschnitt in STATUS.md, wie ein echter Provider (AdMob/Web-Ads, Stripe) später eingehängt würde.
- Tests: Event-Scheduler deterministisch via Seed, Boost-Stacking, Blätter-Buchhaltung ohne negative Beträge.

**Abnahmekriterien**
- Kein Netzwerk-Call, kein SDK im Bundle, Flag standardmäßig `false`.
- Events laufen auch offline weiter bzw. werden beim Laden korrekt abgeschlossen.

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S7) und GAME_DESIGN.md (§ 10, 12).
Setze S7 „Events, Boosts, Premium, MonetizationProvider (No-op)“ um. Branch: session/s7-events.
```

---

### S8 – Grafik und Audio

**Ziel:** Vom Platzhalter zum Flat-Shaded-Café im Look des Vorbilds, inklusive UI-Skin 1:1 nach `docs/UI_STYLE.md`.

**Pflichtlektüre zusätzlich:** `docs/UI_STYLE.md` vollständig (Tokens § 2, Komponenten § 3, Szene § 4, Checkliste § 7).

**Aufgaben**
- UI-Skin (UI_STYLE § 7, Reihenfolge einhalten): `:root`-Tokens in `src/ui/style.css` durch § 2 ersetzen; `UI_THEME` in `src/data/ui.ts` spiegelt dieselben Werte für Phaser. HUD-Pille, Status-Pille, Qualitäts-Pille, runde Buttons rechts, Bottom-Bar (ersetzt `.nav`), Avatar, Stations-Bottom-Sheet mit Detailkarte und Icon-Grid, Verwaltungs-Screen mit Karten-Tabs und Statistik-Balken, weiße Dialoge und Toasts. `data-testid`s bleiben stabil, damit die e2e-Tests weiterlaufen.
- Schriften lokal (`public/assets/fonts/`, WOFF2, OFL): Poppins für Zahlen/Buttons, Didact Gothic für Titel. Keine Pixel-Font. Lizenz in `docs/ASSETS.md`.
- Icons als Inline-SVG-Sprite (`public/assets/ui/icons.svg`), gefüllte Glyphen, MIT/OFL-Quelle oder selbst gezeichnet, Eintrag in `docs/ASSETS.md`. Emoji nur noch als Fallback.
- Asset-Beschaffung Szene: CC0-/kompatibel lizenzierte Flat-Shaded-Iso-Packs prüfen (z. B. Kenney) und in `docs/ASSETS.md` eintragen. Fehlende Sprites (Matcha-Bar, Chasen, Kunden-Typen, Personal) selbst als SVG zeichnen und als PNG 2× exportieren. Stilregeln UI_STYLE § 4: eine Lokalfarbe je Fläche, drei Helligkeitsstufen, keine Texturen, keine Outlines, Dollhouse-Schnitt. Keine Assets aus kommerziellen Spielen.
- Phaser auf `pixelArt: false`, `antialias: true`; Texture-Atlas (TexturePacker-frei: `free-tex-packer-core` oder Vite-Plugin), Lazy-Loading pro Standort.
- Sprites: Boden/Wände pro Standort-Thema, alle Stationen in 3 Ausbaustufen (Level 1/25/100 ändern die Optik), Ambiente, Kunden-Typen mit 4-Richtungs-Walk (2 Frames, Blockfiguren), Personal in Schürze.
- Szene-Effekte (UI_STYLE § 4): Tag/Nacht-Overlay (kosmetisch), Fortschrittsringe über bedienten Kunden, Warteschlangen-Tafel an der Kasse, Kauf-Plopp, Level-up-Shine, Dampf über Matcha, Münz-Flug ins HUD, Kunden-Emotes.
- Audio: Howler oder Phaser-Audio; SFX (Kauf, Münze, Tap, Freischaltung, Fehler), Lo-fi-Hintergrundmusik-Loop (CC0), Lautstärke in Settings, Autoplay-Policy beachten (erst nach erster Interaktion).

**Abnahmekriterien**
- Keine programmatischen Platzhalter mehr im Spiel sichtbar.
- Alle Punkte der Checkliste UI_STYLE § 7 abgehakt; Screenshots DE/EN (390×844 und 1280×720) im PR.
- axe-e2e grün (Kontrastregeln UI_STYLE § 2.1), Touch-Ziele ≥ 44 px, `prefers-reduced-motion` respektiert.
- Alle Assets und Fonts in `docs/ASSETS.md` mit Lizenz gelistet.
- Bundle-Budget eingehalten (§ 2.3), 60 fps auf Mittelklasse-Android.

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S8), docs/UI_STYLE.md und docs/ASSETS.md.
Setze S8 „Grafik + Audio“ um: UI-Skin 1:1 nach UI_STYLE.md, Flat-Shaded-Iso-Assets. Lizenz jeder Datei dokumentieren. Branch: session/s8-art.
```

---

### S9 – Balancing, Tutorial, Release

**Ziel:** Fertiges v1.0, das Fremde ohne Erklärung spielen können.

**Aufgaben**
- Balancing-Pass mit `scripts/balance-sim.ts` gegen die Richtwerte in GAME_DESIGN § 15; Zahlen in `src/data` anpassen, Ergebnis-Tabelle in STATUS.md.
- Tutorial/Onboarding: 6–8 Schritte mit Highlight-Overlay (erste Station kaufen, upgraden, Personal, Zufriedenheit, Offline erklärt, Standorte angeteasert). Überspringbar, Fortschritt gespeichert.
- PWA fertig: Icons, Splash, Install-Prompt, Offline-Start, Update-Hinweis bei neuer Version.
- Performance: Profiling auf Low-End, Objekt-Pools prüfen, Text-Caching, `requestIdleCallback` für Autosave.
- Robustheit: Save-Korruption abfangen (Backup aus IndexedDB anbieten), Uhr-Manipulation begrenzen, Fehler-Boundary mit „Spielstand exportieren“.
- Playwright-Suite ausbauen (Kauf, Reload, Sprachwechsel, Offline-Dialog, Prestige).
- Release: Version `1.0.0`, CHANGELOG, README mit Screenshots, Pages-Deploy, Git-Tag.

**Abnahmekriterien**
- Sim trifft alle Richtwerte aus § 15 ±20 %.
- Playwright grün, Lighthouse Performance ≥ 80 (Mobile), PWA installierbar.
- Neuer Spieler versteht ohne Hilfe, was zu tun ist (Tutorial-Testlauf durch Auftraggeber).

**Startprompt für Opus**
```
Lies CLAUDE.md, docs/STATUS.md, docs/PLAN.md (S9) und GAME_DESIGN.md (§ 15).
Setze S9 „Balancing, Tutorial, Release“ um und bereite v1.0.0 vor. Branch: session/s9-release.
```

---

## Phase 2 – Service-Café (S10–S12)

> Vorgabe Vincent (2026-10-15): Das Café-Prinzip war falsch. Kein Selbstbedienungs-Café mit acht
> Verkaufsstationen, sondern ein **bedientes Café** wie im Vorbild: Die Gäste bestellen an einer
> **Bestelltheke** (Personal nimmt Bestellungen entgegen), **Baristas** bereiten an der **Barista-Theke**
> Matcha in allen Varianten, Kaffee, Kuchen und Kekse zu, **Bedienungen** geben die Bestellung an der
> **Ausgabe** aus oder bringen sie an den Tisch, **Putzkräfte** machen alles wieder sauber. Gelevelt wird,
> indem man die Kasse verbessert oder mehr Verkäufer einstellt; schneller zubereitet wird, indem man die
> Bar-Utensilien (Kaffeemaschine, Ofen, Kühl-/Eisfach …) verbessert; mehr Tische lassen mehr Gäste kommen.
> Außerdem sollen alle Gegenstände im Café (Tische, Plätze, Theken, Kasse, Matcha-Geräte, Kaffeemaschine,
> Ofen, Kühlschrank, Eisfach …) und die Figuren deutlich besser aussehen – Hotel-Empire-Look.
> Das HUD bleibt, wie es ist.

### Was sich gegenüber Phase 1 ändert (Kurzfassung)

| Phase 1 (S1–S9) | Phase 2 (ab S10) |
|---|---|
| 8 Verkaufsstationen, jede mit eigenem Durchsatz; Kunden gehen zur Station und kaufen selbst | **Eine Service-Pipeline** mit vier Stufen: Nachfrage → Bestellung → Zubereitung → Ausgabe. Der kleinste Durchsatz ist der Engpass |
| Kasse = Engpass-Multiplikator | **Kasse** (`register`) = Ausstattung der Bestelltheke: schnellere Bestellannahme je Verkäufer |
| Personal = Stufen mit %-Boni | **Personal = Anzahl** (Köpfe): Verkäufer, Baristas, Bedienungen, Putzkräfte arbeiten parallel; Filialleiter und Social-Media-Manager bleiben Stufen-Rollen |
| Bäcker, Tee-Meister | entfallen; Baristas bereiten alles zu (Vorgabe: „ein Barista, der die Produkte zubereitet“) |
| Station = Produkt mit eigenen Kunden | **Ausstattung der Barista-Theke = Produktlinie**: jedes Gerät bringt ein Produkt auf die Karte, das ein Anteil der Gäste zusätzlich bestellt (Warenkorb-Modell, kein „Kunden-Klau“ zwischen Linien) |
| Sitzbereich = Kapazitäts-Deckel | **Tische** (bleiben technisch das Ambiente-Element `seats`): jede Stufe ein Tisch mit zwei Plätzen, sichtbar bis 12 Tische; Kapazitäts-Deckel wie bisher |
| Reinigungskraft dämpft den Verfall | **Putzkräfte** putzen gegen den Schmutz an, der mit der Gästezahl wächst; Gleichgewicht steigt mit jeder Putzkraft |
| Kunden laufen zu Stationen | Kunden stellen sich an der Bestelltheke an, setzen sich oder warten an der Ausgabe; Bedienungen laufen mit Tablett; Putzkräfte wischen dreckige Tische |

Die Formeln stehen in GAME_DESIGN § 4, § 6, § 7.2, § 7.3 und § 14 (dort in Phase 2 überarbeitet).
Alles andere (Café-Level, Qualität, Marketing, Zufriedenheit, Events, Blätter, Prestige, Standorte,
Save, PWA) bleibt, wie es ist. Save-Schema v9 migriert alte Spielstände (Stations-IDs, Personal → Anzahl).

### Übersicht Phase 2

| # | Session | Ergebnis am Ende | Aufwand |
|---|---|---|---|
| S10 | Service-Pipeline (Kern, Daten, UI) | Rate-Modell mit vier Stufen und Engpass, Ausstattung statt Stationen, Personal als Anzahl, Putz-Modell, Save v9, Panels zeigen Stufen und Engpass, Sim läuft | 1 Session |
| S11 | Szene und Figuren | Neuer Grundriss (Theken, Bestellschlange, Ausgabe, 12 Tische), neue Flat-Shaded-Sprites für Theken, Ausstattung, Tische, bessere Blockfiguren mit Rollen-Outfits, Bedienungen mit Tablett, Putzkräfte, dreckige Tische | 1–2 Sessions |
| S12 | Balancing, Tutorial, Feinschliff | Sim trifft die Richtwerte aus GAME_DESIGN § 15 wieder, Tutorial erklärt die Pipeline, Screenshots, Lighthouse/Gerätetest | 1 Session |

S10 und S11 wurden in der Session vom 2026-10-15 gemeinsam auf `session/s10-service` gebaut (siehe STATUS.md).

---

### S10 – Service-Pipeline (Kern, Daten, UI)

**Ziel:** Das Café rechnet als bedientes Café. Jede Stufe hat Personal und Ausstattung, der Engpass ist sichtbar.

**Aufgaben**
- `data/stations.ts`: neun **Ausstattungen** mit `area` (`order` | `bar` | `service`), zuständiger Rolle, `workTime`
  (Sekunden je Vorgang) und für Produktlinien `basePrice` + `attachRate` (Anteil der Gäste, die das Produkt bestellen):
  Kasse (`register`), Matcha-Station, Kaffeemaschine, Kühl-/Eisfach, Ofen, Kuchenvitrine, Steinmühle, Zeremonie-Set,
  Ausgabe-Station (`servingStation`). Kosten/Wachstum/Freischaltung bleiben auf der Leiter von Phase 1.
- `data/staff.ts`: Rollen Verkäufer (`cashier`), Barista, Bedienung (`waiter`), Putzkraft (`cleaner`) als **Anzahl**
  mit `founding` (Gründungsteam: je 1 Verkäufer, Barista, Bedienung), dazu Filialleiter und Social-Media-Manager wie bisher.
- `data/balance.ts`: `order` (Bestellzeit, Handkasse), `service` (Übergabe-/Tischservice-Zeit, Anteil Sitzgäste),
  `equipment.speedPerLevel`, Sauberkeit mit `dirtPerCustomer`, `cleanPerCleanerPerMin`.
- `core/customers/rates.ts`: `computeLocationRates` liefert `stages` (demand, order, production, service) mit
  Kapazität, `bottleneck`, `loadPerCustomer`, `avgTicket`; `perStation` = Bestellungen/s je Produktlinie.
- `core/economy/stations.ts`: `getStationSpeed(def, level)`, `getStationWorkSeconds`, Preise wie bisher (× Level × Meilenstein).
- `core/staff/effects.ts`: `cleanlinessRatePerMin(loc, servedPerSec)` mit Schmutz aus Verkehr und Putzkräften,
  `cleanlinessEquilibrium`, `advanceCleanliness`.
- Save-Schema v9 (`core/save/migrations.ts`): Stations-IDs umbenennen, Personal-Stufen in Köpfe übersetzen
  (Bäcker/Tee-Meister → Baristas), Gründungsteam sicherstellen, Tutorial-Schritt zurücksetzen.
- UI: Stations-Panel (Bereich, Produkt, Arbeitszeit, Auslastung der Stufe), Personal-Panel mit **Pipeline-Karte**
  (vier Balken, Engpass markiert) und Köpfen „3/20“, Statistik mit Stufen-Auslastung, Shop nach Bereichen,
  HUD-Chip „Engpass: …“ bei Wartedruck, Tutorial-Schritte (Kasse kaufen, zweite Kraft einstellen).
- i18n: Ausstattung × 6 Standorte, Produkte, Rollen, Stufen, Engpass-Hinweise.
- Sim: Personal als Köpfe, Sauberkeit mit Verkehr, Zeilen „Kasse“, „Eisfach (Café-Level 3)“, „Ofen (Café-Level 5)“.

**Abnahmekriterien**
- Ohne Bedienung bleibt die Ausgabe der Engpass, mit jeder weiteren steigt das Einkommen messbar; dasselbe für Verkäufer
  (Bestellung) und Baristas (Zubereitung). Jede Stufe ist im Personal-Panel als Balken mit Engpass-Markierung sichtbar.
- Ein neues Gerät senkt das Einkommen nie (Warenkorb-Modell); Tests belegen das.
- Alte Spielstände (v8) laden mit gleichem Café-Level, Personal als Köpfe, Gründungsteam; Test für die Migration.
- `pnpm check` grün, Coverage core ≥ 90 %, `pnpm sim --hours 2` läuft.

---

### S11 – Szene und Figuren

**Ziel:** Das Café sieht aus wie ein bedientes Café im Hotel-Empire-Look: Theken mit Geräten, Tische mit Stühlen,
Figuren mit Rollen-Outfits, Bedienungen mit Tablett, Putzkräfte zwischen den Tischen.

**Aufgaben**
- `data/layouts.ts`: neuer Grundriss 12×12 – Ausstattung an der Rückwand (y = 0), Personal-Gang (y = 1), Theke (y = 2),
  Bestellschlange vor der Kasse (y = 3, nach rechts), Abholung am Thekenende, 12 Tische im Gastraum (x ∈ {1, 4, 7, 10},
  y ∈ {5, 7, 9}), Mittelgang x = 6, Eingang (6, 11); Terrasse wie bisher.
- `scripts/art/sprites.ts`: Theken-Module (Korpus, Platte, Paneel), neun Ausstattungen × 3 Ausbaustufen (Level 1/25/100),
  Tische (2 Stühle, ab Stufe 2 Tischdecke/4 Stühle), Schmutz-Marker, Tablett, überarbeitete Blockfiguren (Schuhe, Hände,
  Haarvolumen, Rollen-Outfit: Verkäufer mit Schirmmütze, Barista mit Beanie und Schürze, Bedienung mit Schleife und Tablett,
  Putzkraft mit Handschuhen und Wischmopp), Sitzpose. `pnpm art` neu rendern, `tests/art.test.ts` prüft die Frames.
- `scenes/agents/crowd.ts`: Kunden-Phasen Reinkommen → Schlange → Bestellen → Tisch oder Abholung → Warten auf Bedienung →
  Konsum (Sitzgäste) → Gehen; Bedienungen als eigene Agenten (holen an der Ausgabe ab, bringen an den Tisch, zurück);
  Schmutz-Marker an Tischen aus der Sauberkeit; Putzkräfte wischen. Alles kosmetisch, nur Raten aus `core`.
- `CafeScene.ts`: Theken, Ausstattung mit Ausbaustufen, Tische nach `seats`-Stufe, Personal-Figuren nach Anzahl (Verkäufer
  hinter der Kasse, Baristas an den Geräten mit Fortschrittsring, Bedienungen, Putzkräfte), Warteschlangen-Tafel über der Kasse.

**Abnahmekriterien**
- Alle neun Ausstattungen, Tische und Figuren kommen aus dem Atlas; keine Platzhalter.
- Kunden gehen über die Bestelltheke, kein Kunde „bedient sich“ an einem Gerät.
- 60 fps bei 40 Figuren im Desktop-Chrome; `tests/crowd.test.ts` grün; e2e `art.spec` grün.

---

### S12 – Balancing, Tutorial, Feinschliff

**Ziel:** Phase 2 spielt sich so rund wie v1.0.

**Aufgaben**
- Balancing-Pass mit `pnpm sim --hours 4` gegen GAME_DESIGN § 15; Stellschrauben `order.orderTime`, `service.*`,
  `attachRate`, `workTime`, `equipment.speedPerLevel`, Personal-Kosten.
- Tutorial: Schritte erklären die Pipeline (Bestellen, Zubereiten, Ausgeben, Putzen) am Personal-Panel.
- Screenshots DE/EN, README/CHANGELOG, Lighthouse auf echtem Gerät (siehe STATUS S9).

**Abnahmekriterien**
- Sim trifft die Richtwerte ±20 %; Tutorial-Testlauf durch Vincent.


## 4. Übergabe-Protokoll zwischen Sessions

`docs/STATUS.md` hat immer diese Struktur:

```markdown
# STATUS
## Loop
state: idle | running | blocked | done
current: S<N> oder -
branch: session/s<N>-<kurzname> oder -
started: <ISO 8601 UTC> oder -
next: S<N>
## Letzte Session: S<N> – <Name> (<Datum>, PR #<n>)
## Fertig
- …
## Offen / bekannte Bugs
- …
## Entscheidungen, die vom Plan abweichen
- <was> – <warum>
## Nächste Session: S<N+1>
- Startpunkt, Hinweise, Fallen
## Balancing-Snapshot (Sim-Ausgabe)
| Meilenstein | Zielzeit | Ist |
```

Der Block `## Loop` wird vom autonomen Session-Loop benutzt (siehe `docs/ROUTINE.md`); von Hand gestartete Sessions lassen ihn unverändert.

Zusätzlich: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`), kleine Commits, PR-Beschreibung = Abnahme-Checkliste aus dem jeweiligen Session-Abschnitt.

---

## 5. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Phaser-Szene und DOM-UI laufen auseinander (Zustand doppelt) | Einzige Quelle der Wahrheit ist `GameState` in `core`; Szene und UI abonnieren Änderungen, schreiben nur über Actions |
| Zahlen überlaufen / `number`-Präzision | `break_infinity.js` ab S1 konsequent, nie `number` für Währungen |
| Balancing fühlt sich falsch an | Headless-Sim ab S1, Richtwerte in GAME_DESIGN § 15, Balancing-Pass in S9, alle Zahlen in `src/data` |
| Asset-Lizenzen unklar | `docs/ASSETS.md` ist Pflicht ab S0; CC0 bevorzugen; nichts aus dem Original |
| Save-Brüche zwischen Sessions | `schemaVersion` + Migration ab S1, Tests für jede Migration, IndexedDB-Backup |
| Mobile-Performance | Objekt-Pool, max. 40 Agenten, Atlas, Sprites in 2× ohne Laufzeit-Skalierung, Profiling in S9 |
| Session-Kontext geht verloren | STATUS.md-Protokoll, kleine PRs, keine ungeschriebenen Entscheidungen |
| Scope-Creep | Jede Session hat Abnahmekriterien; Neues wandert in STATUS.md „Offen“, nicht in den Branch |

---

## 6. Nicht im Scope von v1.0

- Backend, Login, Cloud-Sync, Leaderboards, Multiplayer
- Aktive Werbung oder Käufe (nur Interface + No-op)
- Native App-Store-Builds (PWA reicht; Capacitor-Wrapper wäre ein späterer Schritt)
- Mehr als 6 Standorte, saisonale Live-Events mit Serverzeit
- Weitere Sprachen außer DE/EN (Struktur ist aber vorbereitet)

---

## 7. Offene Punkte für den Auftraggeber (nicht blockierend)

- Finaler Spielname (Arbeitstitel: **Matcha Café Empire**).
- Eigene Assets geplant? Falls ja: Format 64×32-Iso-Tiles, PNG mit Transparenz, Sprite-Sheets 4 Richtungen.
- Soll das Spiel ein Impressum/Datenschutz-Seite bekommen (relevant, wenn öffentlich verlinkt)?
- Zielgerät für Performance-Messung (konkretes Android-Modell)?
