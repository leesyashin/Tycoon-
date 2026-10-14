# STATUS
## Loop
state: running
current: S4
branch: session/s4-staff
started: 2026-10-14T20:26:47Z
next: S4
## Letzte Session: S3 – UI/HUD und Shop (2026-10-14)
## Fertig
- UI-Mini-Framework `ui/dom.ts`: `h()`, `mount(root, view, store)` mit `store.subscribe` und Render-Drossel (200 ms), Komponenten als `View { el, update }`; Theme über CSS-Variablen in `ui/style.css`
- HUD (`ui/hud.ts`): Standort + Café-Level, Münzen, Einkommen/s, Goldene Blätter, Zufriedenheit, Hype-Balken (`role=progressbar`)
- Navigation unten (`ui/nav.ts`): Shop, Personal, Standorte, Erfolge, Einstellungen
- Panel-Host (`ui/panel.ts`): ein Panel zur Zeit, Bottom-Sheet im Hochformat, Seitenpanel ab 768 px, Esc/✕ schließt, Fokus kehrt zurück
- Stations-Panel: Beschreibung, Level, Preis/Kunde, Einkommen/s, Kunden/s (Kasse: Durchsatz), nächster Meilenstein mit Effekt, zuständiges Personal, Kauf ×1/×10/×100/Max mit Kosten; öffnet per Klick in der Szene oder aus dem Shop
- Shop: Tabs Stationen/Ambiente/Qualität (Pfeiltasten), „leistbar“-Markierung, Ambiente direkt kaufbar
- `core`: `buyAmbience`/`getNextAmbienceCost` (+ `data/ambience.ts`), `updateSettings`, `clearSave`, `perStationIncome` im Rate-Modell
- Settings: Sprache DE/EN ohne Reload (auch Szene-Texte), Zahlenformat kurz/wissenschaftlich, SFX/Musik-Schalter, Export (.json-Download), Import (Datei, Fehler-Toast bei kaputter Datei), Löschen mit doppelter Bestätigung, Lizenzen-Link, Version
- Laden beim Start + Autosave alle 10 s, bei `visibilitychange`/`pagehide`; IndexedDB-Backup der letzten 3 Stände; Offline-Dialog („Du warst 2 h weg …“, Hinweis bei Cap)
- Toasts (`aria-live`) für Café-Level-Aufstieg, Freischaltungen, Import/Export/Löschen, Fehler
- Szene: Ambiente wird bei Änderung neu gezeichnet, Texte bei Sprachwechsel neu gesetzt
- Tests: 103 Unit-Tests (Coverage core 99.6 % Zeilen), e2e 8 Tests grün (Spielschleife kaufen→Reload, Ambiente-Kauf, Sprachwechsel inkl. Zahlenformat, Offline-Dialog, Export/Import/Löschen, axe WCAG 2 A/AA); e2e läuft jetzt als eigener CI-Job
## Offen / bekannte Bugs
- 60 fps nur bedingt geprüft: Headless-Chromium ohne GPU (SwiftShader) schafft 60 fps bei 400×800 mit 40 Agenten, bei 1280×720 ~33 fps – mit und ohne Agenten gleich (Füllrate des Software-Renderers, nicht die Agenten). Auf echtem Desktop-Chrome mit GPU bitte einmal gegenprüfen (`?debugSpawn=100`).
- Kundentypen sind nur kosmetisch; ihre Effekte (Merch-Chance, Trinkgeld, Influencer-Hype, Kritiker) gehören als Erwartungswert ins Rate-Modell (S4/S5).
- Kunden gehen nicht über die Kasse; die Kasse hat keine sichtbare Schlange (sie ist im Modell ein Engpass, keine Verkaufsstation).
- Pinch-Zoom ist nur logisch umgesetzt, nicht auf echtem Touch-Gerät getestet.
- Balancing (siehe Snapshot) weiter nicht abgestimmt → S9. Kasse wird vom Greedy-Spieler nie gekauft.
- Gebäudereinigung/Sauberkeit, Personal-Tempo, Meta-Multiplikatoren außer `tapPower` fehlen noch (S4/S6).
- `pages.yml` läuft weiter bei jedem Push auf main und schlägt fehl, solange Pages nicht aktiviert ist – erwartet, ignorieren (siehe Entscheidungen).
- PWA-Icon ist nur ein SVG-Platzhalter (PNG 192/512 in S8/S9).
- Personal-, Standorte- und Erfolge-Panel sind Vorschauen (Liste + „Kommt in einem späteren Update“); Einstellen/Wechseln/Achievements bauen S4/S6/S5. Shop-Tab „Qualität“ ebenso (S5).
- HUD hat noch keinen Boost-Timer/Event-Banner (GAME_DESIGN § 16.1) – kommt mit Events in S7.
- Ambiente: Terrasse erweitert das Grid noch nicht sichtbar (§ 5.2); alle Ambiente-Elemente sind ab Café-Level 1 kaufbar, bis `data/unlocks.ts` (S5) existiert.
- Ein nicht lesbarer Spielstand wird unter `mce.save.v2.corrupt` beiseitegelegt; die IndexedDB-Backups (`mce-backups`) haben noch keine Wiederherstellen-UI.
- SFX/Musik-Schalter speichern nur die Einstellung; Audio selbst kommt in S8.
- Lighthouse (mobil, `?lang=de`, Produktions-Build): Accessibility 100, Best Practices 100. Gemessen nur im Startzustand; Panels/Dialoge prüft der axe-e2e-Test.
- Bundle 364 KB gzip JS (Phaser ist der Großteil), Ziel < 2 MB eingehalten.
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
- Neue Dev-Abhängigkeit `@axe-core/playwright` – automatisierte WCAG-2-A/AA-Prüfung von HUD, allen Panels und Stations-Panel in e2e (Lighthouse-a11y basiert ebenfalls auf axe; Lighthouse selbst läuft nur einmalig per `pnpm dlx`, nicht als Abhängigkeit).
- Ambiente-Kauf (`core/economy/ambience.ts`, `data/ambience.ts`) schon in S3 statt S5, weil der Shop laut PLAN S3 Ambiente kaufbar listet; Effekte steckten bereits im Rate-Modell.
- Zahlenformat nutzt jetzt `Intl.NumberFormat` (ohne Tausendertrennung, Suffixe bleiben K/M/B/T/aa…); Ausgabe identisch zu vorher.
- Sprache: `?lang=` schlägt den gespeicherten Wert, der schlägt die Browser-Sprache. Wechsel in den Settings ändert `settings.lang`, `app.ts` baut das Overlay neu und schickt `ui:langChanged` an die Szene.
- Offline-Dialog erst ab 60 s Abwesenheit (`UI_CONFIG.offlineDialogMinSec`); UI-Zeitkonstanten liegen in `data/ui.ts`.
- Debug-Taste `B` nur noch im Dev-Server (`import.meta.env.DEV`); das Produktions-Build ist ohne Debug-Tasten spielbar.
- IndexedDB-Backup bei jedem Autosave (alle 10 s), nur die letzten 3 bleiben.
- `pages.yml` unverändert gelassen (Vorgabe Vincent: Sessions deployen nicht).
## Nächste Session: S4
Startpunkt: PLAN.md § 3, Abschnitt S4 (Personal, Zufriedenheit, Marketing). `data/staff.ts` hat bisher nur IDs + Freischalt-Level; Kosten/Effekte ergänzen und `collectModifiers().staffSpeedMult` pro Station befüllen.
- Personal-Panel: `ui/infoPanels.ts` → `createStaffPanel` ist eine Vorschau-Liste; durch echtes Kaufen ersetzen (Muster: `ambienceRow` in `ui/shopPanel.ts`).
- Marketing-Screen (§ 16.5) als neues Panel; Nav-Button ergänzen oder in den Shop legen.
- Fallen: Jede neue UI-Zeichenkette in beide JSONs (Test prüft gleiche Keys + Daten-Abdeckung). Overlay hat `pointer-events: none`; alles Klickbare braucht die Klasse `ui-interactive` (auch Dialoge). e2e lokal mit `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e`. Save-Schema-Änderung → `SCHEMA_VERSION` 3 + Migration + Test.
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
