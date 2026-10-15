## Loop
state: blocked
current: -
branch: session/s10-service
started: -
next: S12
## Letzte Session: S10/S11 – Phase 2 „bedientes Café“ (2026-10-15, PR #PRNUM, Basis `session/s9-release`)
Vorgabe Vincent (2026-10-15): Das Café-Prinzip war falsch (Selbstbedienung an acht Verkaufsstationen). Jetzt
bestellen die Gäste an einer Bestelltheke, Baristas bereiten an der Barista-Theke zu, Bedienungen geben aus
oder servieren am Tisch, Putzkräfte halten alles sauber; die Gegenstände und Figuren sollten besser aussehen,
das HUD bleibt. Plan dazu: PLAN.md „Phase 2 – Service-Café (S10–S12)“; S10 und S11 sind in dieser Session
gebaut, S12 (Balancing-Pass, Tutorial-Feinschliff, Screenshots, Gerätetest) ist offen.

## Fertig
### S10 – Service-Pipeline (Kern, Daten, UI)
- Rate-Modell mit vier Stufen (`core/customers/rates.ts`): Nachfrage (wie bisher: Café-Level, Tische = `seats`, WLAN, Marketing, Zufriedenheit, Events), Bestellung (`Verkäufer × Kassen-Tempo / 2 s`), Zubereitung (`Baristas / Barista-Sekunden je Gast`), Ausgabe (`Bedienungen × Tempo der Ausgabe-Station / Ø Servicezeit 4,8 s`). Bedient = Minimum, `bottleneck` benennt die Stufe, `stages` liefert die Kapazitäten (GAME_DESIGN § 7.2, § 14).
- Ausstattung statt Stationen (`data/stations.ts`, technisch weiter `StationDef`/`loc.stations`): Kasse (`register`, Level 0 = Handkasse Tempo 0,6), Matcha-Station, Kaffeemaschine, Kühl-/Eisfach, Ofen, Kuchenvitrine, Steinmühle, Zeremonie-Set (Produktlinien mit `attachRate`, `workTime`, `basePrice`), Ausgabe-Station (`servingStation`, Café-Level 4). Warenkorb-Modell: jeder Gast bestellt Matcha plus jede weitere Linie mit ihrem Anteil; ein neues Gerät senkt das Einkommen nie (Test). Tempo je Level +2 % und Meilensteine ×2 (`getStationSpeed`), Preis wie bisher × Level.
- Personal als Köpfe (`data/staff.ts`): Verkäufer, Barista, Bedienung, Putzkraft (Wachstum 1,7, max 20) plus Filialleiter und Social-Media-Manager als Stufen. Gründungsteam je 1 Verkäufer/Barista/Bedienung gratis (Start und nach jedem Reset); weniger als das Gründungsteam lädt kein Save (Härtung in `reviveStaff`). Bäcker und Tee-Meister entfernt.
- Putz-Modell (`core/staff/effects.ts`): Schmutz/min = 2 + bediente Gäste/s × 60 × 0,03; Putzleistung = Putzkräfte × 5 × 2 × (1 − Sauberkeit/100); exakte Lösung der Differenzialgleichung je Tick, Gleichgewicht `100 × (1 − Schmutz/Putzleistung)`. „Blitzblank“ braucht jetzt 95 (100 ist nicht mehr erreichbar).
- Save-Schema v9 (`mce.save.v9`) + Migration v8→v9: Stations-IDs umbenannt (matchaBar→matchaStation, checkout→register, togoWindow→coffeeMachine, icedBar→iceBox, bakery→oven, merchShelf→displayCase, ceremonyCorner→grinder, workshopRoom→ceremonySet), Ausgabe-Station ergänzt, Personal-Stufen → Köpfe (Bäcker/Tee-Meister → Baristas, Bedienungen = alte Kassierer-Stufe, mindestens Gründungsteam), angefangenes Tutorial beginnt neu. Tests in `tests/core/save.test.ts`.
- UI: Pipeline-Karte (`ui/pipeline.ts`) mit vier Balken, Engpass-Chip und Hinweis im Personal-Panel und in der Statistik; Personal-Zeilen mit „3/20 eingestellt“, „Jetzt: …/s“ und ehrlicher „Nächste Kraft“-Zeile (kein Mehreinkommen, wenn der Engpass woanders liegt); Stations-Panel mit Bereich, Produkt, Anteil der Gäste, Preis, Zubereitungs-/Bestellzeit, Kapazität und Auslastung der Stufe; Shop nach Bereichen gruppiert; HUD-Chip „Engpass: …“, sobald Gäste warten; Zufriedenheits-Hinweis nennt den Engpass; Tutorial-Texte (Kasse, Team, Pipeline).
- i18n: 9 Ausstattungen × 6 Standorte mit eigenen Namen, Produkte, Rollen, Stufen, Pipeline-Hinweise; alte Keys entfernt, `de.json`/`en.json` identisch (Test).
- Balance-Sim: Köpfe, Sauberkeit mit Verkehr, Zeilen „Kasse gekauft“, „Kühl-/Eisfach“, „Ofen“; Overrides `--set pfad=wert`, `--staffGrowth`, `--attachScale` für Experimente ohne Dateiänderung. Balancing-Pass 1 (Tabelle unten).
- Tests: 289 Unit grün (`pnpm check`), darunter neue für Pipeline, Putz-Modell, Migration v9, Warenkorb.

### S11 – Szene und Figuren
- Neuer Grundriss (`data/layouts.ts`): Geräte an der Rückwand (y = 0), Personal-Gang (y = 1), durchgehende Theke (y = 2) mit Kasse bei x = 1 und Ausgabe bei x = 10, Bestellschlange vor der Kasse nach rechts, Abholplätze vor der Ausgabe, 12 Tische (x ∈ {1, 4, 7, 10}, y ∈ {5, 7, 9}) mit zwei Plätzen und Seitenkachel, Laufzeilen y = 4 und y = 10, Mittelgang x = 6, Eingang (6, 11), Putzkraft-Startplatz (0, 11). Wege als Helfer (`pathToTable`, `waiterPathToTable` …).
- Figuren-Simulation (`scenes/agents/crowd.ts`, kosmetisch): Gäste reinkommen → Schlange → Bestellen (Ring) → Tisch (60 %, wenn ein Platz frei ist) oder Abholung → warten → Bedienung übergibt an der Theke oder bringt an den Tisch → Sitzgäste konsumieren 7–12 s → gehen. Bedienungen (max 3 Figuren) und Putzkräfte (max 2) als eigene Agenten; dreckige Tische folgen der Sauberkeit und werden gewischt. Wartet ein Gast länger als 15 s auf eine Bedienung, bekommt er seine Bestellung „über die Theke“ (Sicherheitsventil, nur Optik). `tests/crowd.test.ts` prüft Grundriss, Wege, Bedienungen, Putzkräfte und dass die Szene den `GameState` nicht verändert.
- `CafeScene`: Theken-Module, Geräte mit Ausbaustufen (Kasse/Ausgabe stehen ohne Level als leeres Modul, Rückwand-Geräte als Bauplatz – nur das nächste bekommt ein Schild), Tische nach `seats`-Stufe (ab 13 mit Tischdecke) mit Schmutz-Marker, Verkäufer-Figuren (bis 3) hinter der Kasse, Baristas an den gekauften Geräten mit Fortschrittsring im Takt der Zubereitung, Bedienungen mit Tablett, Putzkräfte, Sitzpose der Gäste, Warteschlangen-Tafel über der Kasse, Antippen eines Tischs öffnet „Tische“. Labels der Rückwand-Geräte versetzt, damit sie sich nicht überdecken.
- Sprites (`scripts/art/sprites.ts`, `pnpm art`): Thekenmodul, 9 Ausstattungen × 3 Stufen × 2 Richtungen (Kasse mit Display/Kartenleser/Trinkgeldglas, Matcha-Station mit Kessel/Schale/Chasen/Regal, Siebträger mit Mühle, Kühlschrank mit Glastür und Eisfach, Ofen mit Fenster und Blech, Vitrine mit Torten, Steinmühle, Tatami-Nische, Ausgabe mit Tabletts/Glocke/Wärmelampe; Stufe 3 mit Gold-Akzent), runder Tisch mit zwei Stühlen (Variante mit Tischdecke), Schmutz-Marker, überarbeitete Blockfiguren (Schuhe, Hände, Haarkappe und Pony, Taille, Hut/Beanie/Schirmmütze, Rollen-Outfit: Verkäufer, Barista, Bedienung mit Tablett, Putzkraft mit Mopp und Handschuhen, Filialleiter, Social Media) und Sitzpose je Kundentyp. Kontaktbogen: `pnpm tsx scripts/art/contact-sheet.ts stations|figures out.png`.
- Screenshots DE 390×844 / EN 1280×720 (Café, Personal-Pipeline, Ausstattungs-Panel) in `docs/screenshots/s10/`, erzeugt mit `scripts/screenshots.ts` (pflanzt einen gewachsenen Spielstand ein).
- e2e: Specs auf neue IDs/Texte umgestellt (Icon-Grid-Reihenfolge, Köpfe statt Stufen, Produktnamen, Kyoto-Namen); 32 e2e grün (`PW_CHROMIUM=… pnpm e2e`, ~3 min), 289 Unit grün, `pnpm check` grün.

### Bis S9
- S9 (Balancing, Tutorial, Release, PR #12, nicht gemergt) und S0–S8: siehe CHANGELOG.md und die Git-Historie; Monetarisierung weiter nur als No-op-Interface (Abschnitt unten).

## Monetarisierung: wie ein echter Provider eingehängt würde
- Einziger Einstiegspunkt ist `MonetizationProvider` (`src/core/monetization/provider.ts`). Spielcode ruft nur `isAvailable()`, `showRewarded(placement)` und `purchase(sku)`; Belohnungen bucht immer `core` (z. B. `claimFreeBoost`), nie der Provider.
- Neuer Provider (z. B. `AdMobProvider`, `WebAdsProvider`, `StripeProvider`) als eigene Datei außerhalb von `core` (er braucht DOM/SDK), implementiert das Interface. `createMonetizationProvider()` lädt ihn nur bei `MONETIZATION_ENABLED === true` per dynamischem `import()`, sonst bleibt es beim `NoopProvider` – so landet das SDK bei ausgeschaltetem Flag nicht im Bundle.
- Rewarded Ad: `showRewarded('freeBoost')` öffnet die Werbung und löst erst nach vollständigem Ansehen mit `{ rewarded: true }` auf; Abbruch → `{ rewarded: false }`. Der Spielzeit-Timer (`freeBoostAt`) bleibt die Obergrenze.
- Käufe: `purchase(sku)` → Zahlungsdialog des Anbieters; erst nach Server-Bestätigung (Webhook/Receipt-Prüfung, nicht im Client) `{ ok: true }`. Gutschrift über eine neue `core`-Action (z. B. `grantLeaves`) mit Idempotenz-Schlüssel im Save. Erstattungen/Abstürze sind laut GAME_DESIGN § 10 nicht Teil von v1.
- Vor dem Einschalten: Datenschutz/Consent (DSGVO), Lizenz des SDK in `docs/ASSETS.md`/STATUS „Entscheidungen“, e2e „keine fremden Requests“ anpassen.

## Offen / bekannte Bugs
- BLOCKIERT (Vincent): (1) PR #12 „S9“ wartet weiter auf Lighthouse ≥ 80 auf echter Hardware und den Tutorial-Testlauf (siehe S9-Hinweise unten). (2) Dieser PR (Phase 2) baut auf `session/s9-release` auf; Reihenfolge: zuerst #12 mergen, dann diesen PR auf `main` umstellen (bei Squash-Merge von #12: `git rebase --onto main b969096 session/s10-service`, sonst konfliktfrei). Ein Tutorial-Testlauf mit dem neuen Café-Prinzip steht ebenfalls aus.
- Balancing (S12): Sim-Tabelle unten liegt nah an den Richtwerten, aber nicht überall im ±20-%-Band: erstes Upgrade 11 s (< 10 s), erster Personal-Kauf 3 min (~5 min), Reset 2 h 3 min mit 19 Zen (~3 h), Kyoto 2 h 3 min (3–4 h), Offline-Rückkehr 3,3× nächste Qualitätsstufe (1–2×). Stellschrauben: `spawn.base` (jetzt 0,17), Köpfe-Kosten (Basis 100/100/150, Wachstum 1,7), `attachRate`/`basePrice` der Linien, `equipment.speedPerLevel`, Zen-Faktor. Nicht im Sim: Blätter aus Erfolgen/Quests (nur in der App).
- Szene: Bei sehr hoher Nachfrage (`?debugSpawn`) wächst die Schlange über die drei Plätze hinaus zu einem Grüppchen (gewollt), die Bedienungen schaffen die Tischwege nicht – dann greift das 15-s-Ventil und Gäste holen „über die Theke“. Sitzende Gäste am rechten Platz blicken nicht exakt zum Tisch (nur Frontansicht der Sitzpose). Putzkräfte wischen nur, wenn Marker da sind (Sauberkeit < 100 und ein Sitzgast ist gegangen). Verkäufer stehen starr; Baristas bewegen sich nicht zwischen Geräten. Kein Kamera-Zoom auf die angetippte Ausstattung (UI_STYLE § 4), wie bisher.
- Figuren sind blockig und ohne Gesicht (UI_STYLE § 4); Hut des Touristen verdeckt den Kopf. Feinschliff und Varianten (Haarfarben je Figur) für S12 denkbar.
- Auslastungs-Balken der Statistik („Theken ausgelastet“) zeigt weiter bedient ÷ Gesamtdurchsatz; die neue Pipeline-Karte daneben ist aussagekräftiger – einer von beiden könnte weg.
- Skins (Sakura-Bar → Matcha-Station, Neon-Kasse → Kasse) sind weiter nur Tönungen.
- Alle Standorte nutzen denselben Grundriss; Böden/Wände kommen aus dem Themen-Atlas.
- Übernommen aus S9: HUD zeigt Zen nicht; Emoji in i18n-Texten (Toasts, Zen, Kalender); Kosten-Balken in der Statistik fehlen (keine laufenden Kosten im Design); 60 fps auf Mittelklasse-Android nicht auf echtem Gerät gemessen (Headless-Chromium ohne GPU, Software-Renderer auf 30 fps gedeckelt); Musik ist ein synthetischer Loop; Backups ohne Wiederherstellen-UI für ältere Stände als die letzten 3; `pages.yml` schlägt auf main fehl, solange Pages nicht aktiviert ist (erwartet).
- Achievement „Volle Karte“ zählt jetzt 9 Ausstattungen (inkl. Ausgabe-Station); bestehende Spieler, die alle alten Stationen hatten, behalten es (`meta.achievements`).

## Entscheidungen, die vom Plan abweichen
- Phase 2 (Vorgabe Vincent, 2026-10-15): bedientes Café statt Selbstbedienung. PLAN.md „Phase 2“, GAME_DESIGN § 4, § 6, § 7.2, § 7.3, § 14 und UI_STYLE § 4 wurden entsprechend umgeschrieben; die acht Verkaufsstationen wurden zu neun Ausstattungen der drei Theken, Bäcker/Tee-Meister entfielen (ein Barista bereitet alles zu).
- Warenkorb-Modell statt Kunden-Verteilung nach Durchsatz: jeder Gast bestellt Matcha und jede weitere Linie mit `attachRate`. Grund: Eine neue, günstige Linie durfte den teuren Linien keine Kunden wegnehmen (das war in Phase 1 der Fall: „neue Stationen bekommen kaum Kunden-Anteil“). Preise der Linien ab Kaffeemaschine um ~30 % gesenkt (3/6/15/55/280/2100) und Anteile 25/20/25/18/12/6 %, damit der Bon nicht explodiert.
- Personal-Köpfe wachsen mit 1,7 statt 1,5 je Kopf, `spawn.base` 0,21 → 0,17: Köpfe sind ein neuer, billiger Hebel für Durchsatz; ohne Dämpfung erreichte der Greedy Café-Level 10 in 48 min (Ziel 90).
- Gründungsteam gratis (je 1 Verkäufer, Barista, Bedienung) statt „alles einstellen müssen“: Ein Idle-Spiel muss vom ersten Tick an Einkommen haben; jede weitere Kraft kostet. Nach einem Franchise-Reset gibt es das Team erneut.
- Kasse Level 0 bleibt als „Handkasse“ mit Tempo 0,6 (statt Durchsatz 0,3/s wie in Phase 1); die Ausgabe-Station ist optional (Level 0 = Tempo 1), Bedienungen arbeiten auch ohne sie.
- Putz-Modell neu statt „Verfall −25 % je Stufe, Untergrenze 60, Aufwischen ab Stufe 3“: Mit Köpfen und wachsendem Schmutz je Gast ist das Gleichgewicht `100 × (1 − Schmutz/Putzleistung)` anschaulicher und erklärt im Panel, warum ein großes Café mehr Putzkräfte braucht. Exakte Lösung der DGL im Tick, damit 10-s-Ticks wie 100 × 100 ms wirken (Test in `loop.test.ts`).
- `SPOTLESS.cleanliness` 100 → 95, weil 100 im neuen Modell nur mit unendlich vielen Putzkräften erreichbar wäre.
- Migration v8→v9 ist großzügig: Bedienungen bekommen die alte Kassierer-Stufe, Baristas die Summe aus Barista, Bäcker und Tee-Meister (gedeckelt 20), damit ein gewachsenes Café nicht an einer einzelnen Bedienung hängt.
- Tutorial-Schritt „Personal“ verlangt eine Kraft über das Gründungsteam hinaus (`staffTotal ≥ 4`) statt „irgendein Personal“.
- Touristen-Effekt (GAME_DESIGN § 7.5) wandert vom Merch-Regal auf die Kuchenvitrine (`attachRate × (1 + 0,5 × Touristen-Anteil)`).
- Zwei neue Dev-Skripte ohne neue Abhängigkeit: `scripts/art/contact-sheet.ts` (Sprites prüfen) und `scripts/screenshots.ts` (Doku-Screenshots); beide nutzen das vorhandene `@playwright/test`.
- Szene zeigt höchstens 3 Verkäufer, 7 Baristas (je gekauftem Gerät einer), 3 Bedienungen und 2 Putzkräfte, egal wie viele eingestellt sind – mehr Figuren hinter der Theke wären Gedränge ohne Mehrwert.
- Dieser PR hat `session/s9-release` als Basis (nicht `main`), weil S9 noch nicht gemergt ist und Phase 2 auf dem S9-Code (Save v8, Tutorial, Kundentypen-Effekte) aufsetzt.
- Frühere Entscheidungen (S1–S9) gelten unverändert und stehen in der Git-Historie dieser Datei (Stand `session/s9-release`).

## Nächste Session: S12 – Balancing, Tutorial, Feinschliff (Phase 2)
Startpunkt: PLAN.md „Phase 2“, Abschnitt S12, und die Punkte unter „Offen“. Branch `session/s12-polish` von `session/s10-service` (oder von `main`, sobald beides gemergt ist).
- Balancing: `pnpm sim --hours 4`, Experimente mit `--set`, `--staffGrowth`, `--attachScale`; Ziel ±20 % für alle Zeilen in GAME_DESIGN § 15. Werte danach in `src/data` übernehmen (die Overrides schreiben nichts).
- Tutorial: Schritte 4–6 könnten die Pipeline-Karte zeigen (Ziel `pipeline`-Testid); Texte stehen schon auf dem neuen Prinzip.
- Szene-Feinschliff: Baristas wandern zwischen Geräten, Verkäufer-Animation, Sitzpose nach rechts, Kamera-Zoom auf die angetippte Ausstattung, Figuren-Varianten.
- Fallen: Café-Level hängt an `BALANCE.cafeLevel.steps` – nie `% 25` rechnen. Save-Schema v9. e2e-Specs öffnen mit `&tutorial=0`, außer sie testen das Tutorial. Phaser startet verzögert (`whenIdle`) – e2e, die auf Szene/Atlas warten, mit `expect.poll`. Neue Sprites in `scripts/art/sprites.ts` zeichnen und `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm art` laufen lassen (`tests/art.test.ts` prüft Frames). Neue Instanz-Felder in `CafeScene.init()` zurücksetzen. Personal sind Köpfe (`getStaffLevel` liefert die Anzahl); Rollen mit `headcount: false` (Filialleiter, Social Media) bleiben Stufen. `computeLocationRates(...).stages`/`bottleneck` für alles, was die Pipeline zeigt.
- e2e lokal: `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e`.
- S9-Hinweise (gelten weiter): Lighthouse messen mit `pnpm build && pnpm preview --port 4173`, dann `CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm dlx lighthouse "http://localhost:4173/Tycoon-/?lang=de" --form-factor=mobile --only-categories=performance --chrome-flags="--headless=new --no-sandbox"` (5 Läufe, Median).

## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 4`, Phase 2 Pass 1)
Im Band ±20 %: Kasse, Kühl-/Eisfach (CL 3), Ofen (CL 5), Café-Level 10, Zen beim ersten Reset, Idle-Anteil. Außerhalb: erstes Upgrade (11 s), erster Personal-Kauf (zu früh), Reset/Kyoto (zu früh), Offline-Rückkehr (zu viel) → S12.

Balance-Sim: 4 h, Greedy-Spieler (Stationen, Personal, Ambiente, Qualität, Marketing, Reset, Zen), Meilensteine Berlin erster Run
| Meilenstein | Zielzeit | Ist |
|---|---|---|
| Erstes Upgrade | < 10 s | 11s |
| Kasse gekauft | 1–2 min | 2m 11s |
| Erster Personal-Kauf | ~5 min | 3m 2s |
| Erste Putzkraft | – | 5m 57s |
| Erste Kampagne | – | — |
| Kühl-/Eisfach (Café-Level 3) | 10–15 min | 12m 57s |
| Ofen (Café-Level 5) | ~30 min | 31m 23s |
| Café-Level 10 | ~90 min | 1h 13m |
| Café-Level 15 | – | — |
| Qualität Stufe 1 (Café Grade) | – | 13m 41s |
| Qualität Stufe 2 (Premium Grade) | – | 44m 16s |
| Qualität Stufe 3 (Ceremonial Grade) | – | 1h 23m |
| Erster Franchise-Reset | ~3 h (20–30 Zen) | 2h 3m (19 Zen) |
| Kyoto freigeschaltet | 3–4 h | 2h 3m |
| Erstes Zufalls-Event | 20–45 min | 32m 17s |
| Tokio freigeschaltet | – | — |
Offline nach 1 h, 8 h weg: +26.72 M = 3.34× nächste Qualitätsstufe (8.00 M), deckt die nächsten 93 Greedy-Käufe (Ziel: 1–2 große Käufe)
Idle-Anteil: Offline-Nacht 26.72 M / aktiver Tag (1.5 h ab 1 h) 121.96 M = 22 % (Ziel 20–30 %)
Prestige: 1 Resets, Zen verdient 19, übrig 4; Meta: globalIncome 1
Events: 6 abgeschlossen (supplyShortage 1, heatwave 2, foodBlogger 2, rainyDay 1); Influencer-Blätter heute 10
Goldene Blätter verdient 63 (je Stunde: h1 10, h2 23, h3 14, h4 16; ohne Erfolge/Quests, die laufen nur in der App)
Standort berlin: Café-Level 14 (Bestwert 14, Resets 1), Einkommen/s 77.48 K
Standort kyoto: Café-Level 14 (Bestwert 14, Resets 0), Einkommen/s 1.82 M
Ende: Café-Level 14, Münzen 1.64 M, Einkommen/s 77.48 K
Qualität 3, Goldene Blätter 63, Zufriedenheit 91.5, Sauberkeit 68.4, Kampagnen 0, Marketing-Level 20
Personal: cashier 3, barista 20, waiter 16, cleaner 13, socialMedia 15; Ambiente: seats 11, decor 30, music 20, wifi 20, terrace 1
