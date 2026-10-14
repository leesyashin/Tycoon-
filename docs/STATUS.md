# STATUS
## Loop
state: idle
current: -
branch: -
started: -
next: S3
## Letzte Session: S2 – Iso-Szene und Kunden (2026-10-14, PR #4)
## Fertig
- `data/layouts.ts`: Grundriss 12×12 (Eingang, 8 Stationen mit Kachel/Zugang/Schlangenrichtung/Laufweg, Ambiente-Plätze), `CROWD`- und `CAMERA`-Parameter; alle 6 Standorte nutzen vorerst denselben Grundriss
- `data/customerTypes.ts` + `core/customers/types.ts`: 5 Kundentypen (§ 7.5) mit Anteilen und Standort-Verschiebung (Kyoto Touristen, Tokio Influencer …), eigenes Platzhalter-Sprite je Typ
- `core/customers/tap.ts`: Tap-Bonus (§ 7.4): +0.5 s Einkommen × (1 + tapPower × 0.5), Deckel 10 Taps/Spielsekunde, Hype-Balken 30 Taps → 10 s ×2 Spawn als `ActiveBoost` `hype`, langsamer Hype-Verfall im `tick`
- `core/store.ts`: `createStore` (getState/dispatch/advance/subscribe), einziger State-Halter; `main.ts` treibt die Simulation per `requestAnimationFrame` unabhängig von Phaser
- Save-Schema v2 (`tap`-Zustand), Migration v1→v2 + Tests, Key `mce.save.v2`, liest `mce.save.v1`/`v0`
- `scenes/agents/crowd.ts` (Phaser-frei, getestet): Kunden-Pool max. 40, Spawn ∝ `perStation`, Waypoints, Schlange (3 Plätze + Grüppchen dahinter), Bedienzeit = 1/Stationsrate, Kauf → Münz-Popup, Abgang; „+N“-Zähler bei vollem Pool
- `scenes/placeholders.ts`: farbcodierte Iso-Blöcke je Station, Umriss für ungekaufte, Ambiente, Kunden, Münze, Blatt-Partikel
- `CafeScene`: Boden, Wände, Eingang, Stationen nach `GameState` (Umriss + „Kaufen“/„ab Café-Lv N“, gekauft = Block + „Lv N“-Badge), Kunden, Münz-Popups, Tap → `tapCafe` + Blatt-Partikel, Klick auf Station → `game.events` `ui:openStation` (Stub: `console.info`), Debug-Taste `B` kauft die günstigste bezahlbare Station
- Kamera: Drag, Pinch-Zoom (2 Finger), Mausrad, Zoom-Grenzen, Mittelpunkt im Raum geklemmt; Scale-Modus `RESIZE` (Hochformat füllt den Bildschirm)
- Minimal-HUD (Münzen, Einkommen/s, Hype-Balken; DEV-Hinweis auf Taste B)
- Tests: 93 Unit-Tests grün, u. a. „Szene deaktiviert → Zustand identisch“, 40-Agenten-Grenze bei 100/s; e2e `tests/e2e/scene.spec.ts` (`?debugSpawn=100`, Tap, B) grün
## Offen / bekannte Bugs
- 60 fps nur bedingt geprüft: Headless-Chromium ohne GPU (SwiftShader) schafft 60 fps bei 400×800 mit 40 Agenten, bei 1280×720 ~33 fps – mit und ohne Agenten gleich (Füllrate des Software-Renderers, nicht die Agenten). Auf echtem Desktop-Chrome mit GPU bitte einmal gegenprüfen (`?debugSpawn=100`).
- Kundentypen sind nur kosmetisch; ihre Effekte (Merch-Chance, Trinkgeld, Influencer-Hype, Kritiker) gehören als Erwartungswert ins Rate-Modell (S4/S5).
- Kunden gehen nicht über die Kasse; die Kasse hat keine sichtbare Schlange (sie ist im Modell ein Engpass, keine Verkaufsstation).
- Hype-Balken ist im Minimal-HUD; S3 baut das echte HUD.
- Ambiente-Platzhalter werden nur beim Szenenstart gezeichnet (Ambiente-Kauf kommt in S5, dann bei Änderung neu zeichnen).
- Pinch-Zoom ist nur logisch umgesetzt, nicht auf echtem Touch-Gerät getestet.
- Balancing (siehe Snapshot) weiter nicht abgestimmt → S9. Kasse wird vom Greedy-Spieler nie gekauft.
- Gebäudereinigung/Sauberkeit, Personal-Tempo, Meta-Multiplikatoren außer `tapPower` fehlen noch (S4/S6).
- IndexedDB-Backup und Autosave kommen mit dem UI (S3); aktuell startet jede Sitzung frisch.
- `pages.yml` läuft weiter bei jedem Push auf main und schlägt fehl, solange Pages nicht aktiviert ist – erwartet, ignorieren (siehe Entscheidungen).
- PWA-Icon ist nur ein SVG-Platzhalter (PNG 192/512 in S8/S9). e2e läuft noch nicht in CI (Pflicht ab S3).
## Entscheidungen, die vom Plan abweichen
- Vorgabe Vincent (2026-10-14): Kein Deploy durch die Sessions. Sessions bauen nur das Spiel (`pnpm build` muss grün sein); Vincent deployt selbst. Pages-Deploy, „Pages-URL erreichbar“ und der Pages-Link in der Abschlussnachricht entfallen als Abnahmekriterium. Ein roter `pages`-Workflow auf main blockiert nichts.
- Neue Dev-Abhängigkeit `@vitest/coverage-v8` – nötig, um das Abnahmekriterium „Coverage core ≥ 90 %“ zu messen.
- Kasse auf Level 0 liefert `checkout.baselineThroughput` (0.3/s) statt 0, sonst wäre der Start ohne Kauf blockiert (GAME_DESIGN lässt das offen).
- `ActiveEvent`/`ActiveBoost.until` sind in `playtimeSec` gemessen (monoton), nicht in Wanduhrzeit.
- `startCoins = 5`, damit das erste Upgrade (10.7 ¤) in unter 10 s möglich ist.
- Meilensteine ab Nr. 4: gerade Nummer = Preis ×2, ungerade = Tempo ×2 (Nr. 1–3 sind Tempo).
- `core` greift nie auf `localStorage` zu; der Adapter bekommt ein `StorageLike` übergeben.
- Zusätzlich zu den Berlin-Daten liegen alle 6 Standorte mit Skalierung in `data/locations.ts`; Stationsmechanik ist für alle gleich.
- v0-Save-Format ist ein erfundenes Ur-Format (flach, ein Café), nur um die Migrationskette zu testen.
- Hype verfällt mit 0.5/s (GAME_DESIGN sagt nichts dazu) – sonst ließe sich der Balken über Stunden ansammeln; aktives Tippen bleibt belohnt.
- Hype-Boost ist ein `ActiveBoost` mit id `hype`; erneutes Füllen verlängert auf 10 s, statt zu stapeln.
- Tap-Deckel „10 Taps/s“ zählt pro ganzer Spielsekunde (`playtimeSec`), nicht per Wanduhr.
- „+N“ = geschätzte Kunden im Café (Rate × 9 s Verweildauer) minus sichtbare, nur bei vollem 40er-Pool.
- Münz-Popup zeigt den Durchschnittsumsatz pro bedientem Kunden (Einkommen/s ÷ bediente/s); gutgeschrieben wird nur im Rate-Modell.
- Debug-Query `?debugSpawn=N` skaliert nur die sichtbaren Kunden (für Performance-Tests), nie die Einnahmen.
- Scale-Modus `FIT 960×540` → `RESIZE` (Mobile-first/Hochformat); Kamera zoomt den Raum passend.
## Nächste Session: S3
Startpunkt: PLAN.md § 3, Abschnitt S3 (UI/HUD und Shop). Der Store liegt in `main.ts` (`createStore`), die Szene bekommt ihn über die Phaser-Registry (`scenes/registry.ts`). `ui/hud.ts` ist ein Minimal-HUD und kann ersetzt werden.
- Stations-Panel an `game.events.on(UI_EVENTS.openStation)` in `main.ts` hängen (dort ist aktuell der `console.info`-Stub).
- Autosave/Laden: `saveGame`/`loadWithOffline` aus `core/save` mit `localStorage` als `StorageLike`; Offline-Dialog. Debug-Taste `B` kann bleiben oder hinter DEV.
- Fallen: Texte in der Szene skalieren mit `1/zoom` (`scaleLabels`); HUD hat `pointer-events: none`, damit Taps auf den Canvas gehen – Panels brauchen `auto`. Ab S3 muss `pnpm e2e` grün sein und sollte in CI laufen (Chromium-Pfad über `PW_CHROMIUM`).
## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 1`)
Balance-Sim: 1 h, Greedy-Spieler, Berlin
| Meilenstein | Zielzeit | Ist |
|---|---|---|
| Erstes Upgrade | < 10 s | 8s |
| Zweite Station (Kasse) | 1–2 min | — |
| Iced-Bar (Café-Level 3) | 10–15 min | 3m 49s |
| Bäckerei (Café-Level 5) | ~30 min | 40m 22s |
| Café-Level 10 | ~90 min | — |
| Café-Level 15 | – | — |
Ende: Café-Level 5, Münzen 6.37 K, Einkommen/s 144.48
