## Loop
state: running
current: S9
branch: session/s9-release
started: 2026-10-14T23:08:00Z
next: S9
## Letzte Session: S8 – Grafik und Audio (2026-10-14, PR #11)
## Fertig
- UI-Skin 1:1 nach UI_STYLE (Checkliste § 7 vollständig abgehakt): Tokens § 2 in `src/ui/style.css`, Spiegel `UI_THEME` in `src/data/ui.ts`; Schriften Poppins/Didact Gothic lokal (WOFF2, OFL); Icon-Sprite `public/assets/ui/icons.svg` (Phosphor Fill, MIT) mit Helper `src/ui/icons.ts`
- HUD (§ 3.1–3.3): Währungs-Pille mit orangem „+“, Status-Pille (Café-Uhr, Einkommen/s, Standort), Chips Zufriedenheit/Sauberkeit (< 70), Boost-Pillen, Qualitäts-Pille rechts (6 Blätter = 6 Stufen, öffnet Shop-Tab Qualität)
- Rechte Spalte (Personal, Statistik, Erfolge mit Badge), Bottom-Bar `.actionbar` (Shop-Kreis 72 px mit „!“-Badge, Hype-Pille, Marketing, Standorte, Bauen), Zahnrad, Filialleiter-Avatar mit Auto-Kauf-Pille. Labels nur als `aria-label`/`title`; `nav-*`-Testids stabil, neu `nav-stats`, `nav-build`
- Stations-Bottom-Sheet (§ 3.8): Kopf-Chip, weiße Detailkarte mit Sprite-Icon und LEVEL-Badge, Kauf-Pillen ×1/×10/×100/Max, Icon-Grid (8 Stationen + 5 Ambiente, Level-Badge, gesperrt, kaufbar-Punkt) mit ‹ › – Ambiente-Elemente haben eine eigene Detailkarte mit Kauf im selben Sheet
- Verwaltungs-Screen (§ 3.9): Vollbild mit Karten-Tabs Stationen/Marketing/Personal/Statistik (`manage-tab-*`); neue Statistik (`statsPanel.ts`): Einnahmen je Station und Trinkgeld pro Café-Tag als Balken, Auslastung, Tagesbilanz-Pille. Standorte, Fortschritt, Settings ebenfalls als Vollbild-Screen; Dialoge und Toasts weiß
- Szene: `pixelArt: false`, `antialias: true`; alle Platzhalter (`scenes/placeholders.ts`, `data/themes.ts`) entfernt. Sprite-Pipeline `pnpm art` (`scripts/art/*`, `scripts/build-art.ts`): Sprites als Code (SVG, Flat-Shaded, 3 Helligkeitsstufen) → PNG 2× → eigener Shelf-Packer → Phaser-JSON-Atlas `common` + `theme-<ort>` (Lazy-Loading in `CafeScene.preload`), DOM-Icons, PWA-Icons 192/512
- Sprites: 8 Stationen × 3 Ausbaustufen (Level 1/25/100) × 2 Blickrichtungen, 5 Ambiente, 5 Kundentypen und 7 Personal-Rollen (Schürze) mit 2 Richtungen × 2 Lauf-Frames (+ Spiegeln = 4 Richtungen), Boden/Wände mit Fenstern/niedrige Vorderwände (Dollhouse) je Standort-Thema
- Effekte: Tag/Nacht (24 min = 1 Tag, `core/time/dayCycle.ts`, Indigo-Multiply + warme Fenster), Fortschrittsringe über bedienten Kunden, Warteschlangen-Tafel (rote LED) über der Kasse, Kauf-Plopp, Shine bei neuer Ausbaustufe, Dampf über der Matcha-Bar, Münz-Flug Richtung HUD, Kunden-Emotes; bei `prefers-reduced-motion` aus
- Audio (`src/audio/audio.ts`): Web-Audio-Synthese (keine Dateien), SFX Kauf/Münze/Tap/Freischaltung/Fehler/Event-Start/-Ende/Blatt/Boost, Lo-fi-Loop; AudioContext erst nach erster Interaktion; Lautstärke-Regler in den Settings
- Save-Schema v7 (`settings.sfxVolume/musicVolume`) + Migration v6→v7 + Härtung der Settings
- Tests: 260 Unit (neu: dayCycle, Atlas-Vollständigkeit, Stations-Optik, Save v7); e2e 27 grün (neu `tests/e2e/art.spec.ts`: Assets lokal ohne 404/fehlende Frames, Lazy-Loading, Touch-Ziele ≥ 44 px, Icon-Grid/Pfeile/Ambiente-Kauf, Verwaltungs-Tabs, Lautstärke persistiert, reduced motion ohne Animationen; axe zusätzlich für Ambiente-Karte und Statistik)
- Screenshots DE/EN 390×844 und 1280×720 in `docs/screenshots/s8/`
- Bundle: JS 402 KB gzip, Sprites 356 KB, Schriften 41 KB – weit unter 2 MB

## Monetarisierung: wie ein echter Provider eingehängt würde
- Einziger Einstiegspunkt ist `MonetizationProvider` (`src/core/monetization/provider.ts`). Spielcode ruft nur `isAvailable()`, `showRewarded(placement)` und `purchase(sku)`; Belohnungen bucht immer `core` (z. B. `claimFreeBoost`), nie der Provider.
- Neuer Provider (z. B. `AdMobProvider`, `WebAdsProvider`, `StripeProvider`) als eigene Datei außerhalb von `core` (er braucht DOM/SDK), implementiert das Interface. `createMonetizationProvider()` lädt ihn nur bei `MONETIZATION_ENABLED === true` per dynamischem `import()`, sonst bleibt es beim `NoopProvider` – so landet das SDK bei ausgeschaltetem Flag nicht im Bundle.
- Rewarded Ad: `showRewarded('freeBoost')` öffnet die Werbung und löst erst nach vollständigem Ansehen mit `{ rewarded: true }` auf; Abbruch → `{ rewarded: false }`. Der Spielzeit-Timer (`freeBoostAt`) bleibt die Obergrenze.
- Käufe: `purchase(sku)` → Zahlungsdialog des Anbieters; erst nach Server-Bestätigung (Webhook/Receipt-Prüfung, nicht im Client) `{ ok: true }`. Gutschrift über eine neue `core`-Action (z. B. `grantLeaves`) mit Idempotenz-Schlüssel im Save. Erstattungen/Abstürze sind laut GAME_DESIGN § 10 nicht Teil von v1.
- Vor dem Einschalten: Datenschutz/Consent (DSGVO), Lizenz des SDK in `docs/ASSETS.md`/STATUS „Entscheidungen“, e2e „keine fremden Requests“ anpassen.
## Offen / bekannte Bugs
- HUD zeigt Zen weiter nicht (nur Standorte-Panel); UI_STYLE § 5 sieht im HUD nur Münzen/⚡/Blätter vor. ⚡ Kapazität bleibt ausgeblendet (§ 6.4, S9).
- Skins (Sakura-Bar, Neon-Kasse) sind weiter eine Tönung der neuen Stations-Sprites, keine eigenen Sprites; global statt je Standort.
- Alle Standorte nutzen weiter `DEFAULT_LAYOUT`; S8 gibt jedem Standort eigene Böden/Wände/Fenster (Themen-Atlas), aber keinen eigenen Grundriss.
- Emoji stecken noch in i18n-Texten (Toasts „+2 🍃“, Zen „☯“, Kalender-Pille, Event-Panel-Liste) und als Fallback-`icon` in `data/events.ts`. Alle Bedienelemente (HUD, Leiste, Panels-Kopf, Event-Karte) nutzen SVG-Glyphen. Texte umzubauen hätte e2e-Erwartungen geändert – Kandidat für S9.
- Statistik: Kosten-Balken (Gehalt, Werbung) aus UI_STYLE § 3.9 fehlen, weil das Spiel keine laufenden Kosten hat (Personal/Marketing sind Einmalkäufe). Tagesbilanz ist daher immer grün.
- Stations-Bottom-Sheet: Antippen einer Station zoomt die Kamera nicht auf 1.3 (UI_STYLE § 4 „Kamera“); das Panel deckt im Hochformat ~55 % ab, die Station kann darunter liegen.
- 60 fps auf Mittelklasse-Android nicht auf echtem Gerät gemessen (keine Hardware in der Session); Headless-Chromium (SwiftShader) wie bisher. Bitte mit `?debugSpawn=100` auf einem Handy prüfen. Die neuen Effekte sind gepoolt (Popups, Emotes, max. 6 Münz-Flüge) und die Ringe ein einziges `Graphics`.
- Musik ist ein synthetischer 4-Takt-Loop (16 s); auf Dauer eintönig. Echte CC0-Musikdatei wäre eine Option (Lizenz in ASSETS.md).
- Audio wird in e2e nur indirekt geprüft (Settings persistieren); ob Töne hörbar sind, lässt sich headless nicht testen.
- Screenshots in `docs/screenshots/s8/` zeigen den Dev-Server (Debug-Hinweis „B = …“ sichtbar).
- Kundentypen: nur der Influencer-Blätter-Drop ist im Rate-Modell (Erwartungswert, S7). Merch-Chance (Tourist), Trinkgeld (Stammgast), Influencer-Hype ×1.5 und Kritiker fehlen weiter → S9 (Balancing).
- Event-Karte zeigt nur ein Event (das am aktiven Standort, sonst irgendeins); das Event-Panel listet alle. Banner zum Event-Start ist weiter ein (weißer) Info-Toast; ein eigenes Banner-Element hat S8 nicht gebaut.
- Offline beendete Events werden still abgeschlossen (Blätter sind da, aber der Offline-Dialog nennt sie nicht). Idee: Zeile „Während du weg warst: Hitzewelle (+5 🍃)“ im Offline-Dialog.
- Balance-Sim spielt Events mit (inkl. Beheben des Lieferengpasses), gibt aber keine Blätter aus (kein Zeitsprung/Boost) und kennt weder Erfolge noch Quests (laufen nur über `progressionStep` in der App). Blätter/h im Sim also nur Café-Level + Events + Influencer: 11–15/h; mit Erfolgen und Quests liegt die Frühphase im Richtwert 15–25/h (nicht gemessen) → S9.
- Kalender-Events wirken auch auf Offline-Einnahmen und den Zeitsprung (sie gelten tage-/wochenweise, keine Spielzeit-Timer); Neujahr verdoppelt also auch Offline. Bewusst so, siehe Entscheidungen.
- Kein Weg, ein laufendes Zufalls-Event vorzeitig zu beenden oder die Event-Häufigkeit einzustellen (Settings) – nicht im Design.
- Balancing Prestige: Erster Reset bringt im Sim 40 Zen (Richtwert 20–30), weil er erst bei 3 h 22 min kommt (Café-Level 14). Berlin stockt ab ~3 h 30 bei Café-Level 14 (Stationskosten mit Wachstum 1.14–1.21 explodieren, Qualität 4 kostet 500 M); Café-Level 15 wird ohne Reset nie erreicht → S9 (Kurve späte Café-Level, ggf. Kyoto zurück auf 15).
- Freischalt-Café-Level der Standorte ab Tokio stehen weiter auf 15 (Design); ob das mit der neuen Kurve passt, ist ungeprüft – Sim spielt bisher nur bis Kyoto sinnvoll → S9.
- Kein „Café-Level-Fortschritt anderer Standorte“-Hinweis im HUD (z. B. Badge, wenn ein anderer Standort etwas Kaufbares hat) – Idee für S9.
- Achievement-Fortschritt „Café-Level“/„Stations-Level“ nimmt das aktuelle Level aller Standorte; nach einem Reset fällt der Balken noch nicht erreichter Stufen zurück (Erreichtes bleibt). Für Café-Level könnte S9 `bestLevel` nehmen.
- Balancing: Mit Café-Level-Jagd laufen frühe Meilensteine noch zu schnell (Iced-Bar 5,4 min statt 10–15, Bäckerei 22 min statt ~30); Café-Level 10 passt. Greedy startet nie eine Kampagne, Reinigungskraft bleibt auf Stufe 1, Café-Level 15 wird in 2 h nicht erreicht → S9.
- Ohne Café-Level-Jagd pumpt der Greedy eine Station (neue Stationen bekommen auf Level 1 kaum Kunden-Anteil) – Hinweis für S9, ob neue Stationen attraktiver werden sollen.
- Achievement-Prüfung und Quest-Tageswechsel laufen 1×/s per `setInterval` in `main.ts` (Wanduhr); im Hintergrund-Tab drosselt der Browser das, nachgeholt wird beim nächsten Aufruf.
- Kein Plural-System für Toast-/Quest-Texte nötig gewesen; „Starte eine Kampagne“ ist fest Singular (Ziel 1).
- 60 fps nur bedingt geprüft: Headless-Chromium ohne GPU (SwiftShader) schafft 60 fps bei 400×800 mit 40 Agenten, bei 1280×720 ~33 fps – Füllrate des Software-Renderers. Auf echtem Desktop-Chrome mit GPU bitte einmal gegenprüfen (`?debugSpawn=100`).
- Kunden gehen nicht über die Kasse; die Kasse hat keine sichtbare Schlange (sie ist im Modell ein Engpass, keine Verkaufsstation).
- Pinch-Zoom ist nur logisch umgesetzt, nicht auf echtem Touch-Gerät getestet.
- `pages.yml` läuft weiter bei jedem Push auf main und schlägt fehl, solange Pages nicht aktiviert ist – erwartet, ignorieren (siehe Entscheidungen).
- Ein nicht lesbarer Spielstand wird unter `mce.save.v4.corrupt` beiseitegelegt; die IndexedDB-Backups (`mce-backups`) haben noch keine Wiederherstellen-UI.
- Marketing-Plakat vorm Café (GAME_DESIGN § 9, „Visuell“) fehlt. Kandidat für S8.
- Auto-Kauf und Sauberkeit laufen offline nicht (siehe Entscheidungen).
- Terrasse Stufe 2 gibt eine L-förmige Fläche; die fehlende Ecke (Stufe 3) ist beim Antippen trotzdem „im Café“ (Tap-Bonus) – kosmetisch egal.
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
- Save-Schema v3 (`mce.save.v3`): je Standort `cleanliness` (Start 100) und `autoBuy`; `marketing.cooldownUntil` neu (optional). Migration v2→v3 + Tests; v2-Schlüssel wird weiter gelesen.
- Sauberkeit startet bei 100 (neues Café ist sauber) statt beim neutralen Wert 70 – so fällt sie ohne Reinigung sichtbar, statt sofort negativ zu sein.
- Reinigung Stufe 1 „stoppt den Verfall auf 60 %“: liegt die Sauberkeit schon darunter, sinkt sie nur nicht weiter (springt nicht hoch). Ab Stufe 4 ist der Verfall 0 (nicht negativ); Aufwischen +5/min ab Stufe 3.
- Personal-Tempo wirkt multiplikativ über Rollen je Station (`collectModifiers().staffSpeedMult` ist jetzt ein Record je Station). Die Kasse bekommt den Kassierer weiter über `getCheckoutThroughput`.
- Bugfix: Social-Media-Manager wurde im Rate-Modell aus `ambience` statt aus `staff` gelesen.
- Marketing: Kampagnen-Level Basis-Kosten 500 (Berlin), ab Café-Level 2 – beides im Design offen. Aktive Kampagne kostet max(2 min Einkommen, 50 × Standort-Skalierung), damit sie am Anfang nicht gratis ist.
- Social-Media-Abklingzeit −10 % je Stufe multiplikativ (0.9^Stufe), sonst wäre sie bei Stufe 15 negativ.
- Kampagne/Abklingzeit laufen in Spielzeit (`playtimeSec`) wie Boosts. Offline-Einnahmen (und der Tab-Wechsel-Lump) rechnen ohne zeitlich begrenzte Multiplikatoren (Boosts, Events, aktive Kampagne): sonst zählte ein 10-min-Boost bis zu 14 h. Gilt auch für den Hype-Boost aus S2.
- Offline bleiben Sauberkeit und Zufriedenheit eingefroren und der Auto-Kauf kauft nichts (Rate aus dem Speicherzeitpunkt, wie PLAN § 2.3) – Idle soll nicht bestrafen.
- Auto-Kauf: höchstens ein Level pro Tick (10 Hz) und Standort, immer die günstigste freigeschaltete Station; Schalter im Personal-Panel beim Filialleiter, ohne Filialleiter nicht aktivierbar.
- Marketing als eigener Nav-Punkt (📣, 6 Buttons in der Leiste) statt Shop-Tab, wie GAME_DESIGN § 16.5 als eigener Screen.
- Zufriedenheits-Detail öffnet über den (jetzt antippbaren) Zufriedenheits-Wert im HUD; HUD-Symbol und Kunden-Smileys wechseln 😊/😐/😟 bei 60/40 (`UI_CONFIG.mood`).
- Personal-Panel erklärt jede Stufe mit Zahlen: „Jetzt: …“ und „Nächste Stufe: +X/s Einkommen“ bzw. Zufriedenheit langfristig, Sauberkeit/min, Offline-Stunden oder Abklingzeit (`previewStaffHire` in core).
- `.panel-body` ist fokussierbar (`tabindex=0`), weil axe sonst bei Panels ohne aktive Buttons „scrollable-region-focusable“ meldet.
- Balance-Sim: Greedy kauft jetzt auch Personal, Ambiente und Marketing-Level und bewertet Käufe nach eingeschwungenem Einkommen (Sauberkeit im Gleichgewicht, Zufriedenheit am Ziel); Kampagne nur, wenn sie sich in 10 min rechnet.
- Kosten-Wachstum aller Stationen +0.07 gegenüber GAME_DESIGN § 4 (Matcha-Bar 1.14 … Workshop 1.21) – nötig für das S5-Abnahmekriterium „Café-Level 10 nach ~90 min“: mit Qualität (×1.5/Stufe), Level-Belohnungen und einem Greedy, der Café-Level jagt, kam der Spieler sonst nach 11 min auf Level 10. Gleichzeitig rücken Kasse, Iced-Bar und Bäckerei näher an ihre Zielzeiten. Feinjustierung in S9; GAME_DESIGN.md wurde nicht angepasst.
- Balance-Sim: Greedy kauft zusätzlich „Café-Level-Jagd“ (billigster Weg zum nächsten Café-Level, wenn er ≤ 60 s Einkommen kostet) und die Terrasse, sobald sie eine Station blockiert. Ohne das pumpte er eine einzige Station und das Ergebnis war chaotisch (Café-Level 10 nach 64 min oder nie).
- Ambiente-Freischaltung neu verteilt (Musik 2, WLAN 4, Terrasse 8), damit fast jedes Café-Level etwas freischaltet (§ 5.3). Café-Level 11 schaltet nichts frei (das Design sieht dort nichts vor).
- Terrassen-Pflicht nach § 5.2 umgesetzt: Stationen ab Café-Level 9 (Zeremonie-Ecke, Workshop) brauchen Terrasse ≥ 1; Shop, Stations-Panel und Szene nennen den Grund.
- Grid: Der Raum bleibt 12×12 (wie seit S2), die Terrasse legt 2 Reihen/Spalten davor (12×14, 14×14 bei Stufe 2/3) statt der Design-Werte 10×10 → 12×12 → 14×12 → 14×14 – der Startraum war schon 12×12.
- Café-Level-Blätter: 1 🍃 ab Level 5, +1 alle 5 Level, max 3 (Design: „1–3“).
- Achievements und Quests werden außerhalb des Ticks geprüft (`progressionStep(state, now, tzOffsetMin)`, 1×/s aus `main.ts`), weil sie die Wanduhr brauchen (lokale Mitternacht, Nachtschicht); `core` liest die Uhr nie selbst, Zeitzone kommt als Offset (`getTimezoneOffset`).
- Quest-Fortschritt = Statistik-Zähler − Basiswert beim Ziehen; „Zufriedenheit 80“ zählt den Tages-Bestwert des aktiven Standorts. Der 5-🍃-Bonus wird automatisch mit der dritten abgeholten Quest gutgeschrieben.
- Toasts für Erfolge/Level/Quests entstehen in der UI aus dem Zustandsvergleich (vorher/nachher) – kein Ereignis-Puffer im `GameState`. Einmaligkeit garantiert `meta.achievements`.
- Achievement-Namen pro Art mit römischer Stufe („Münzsammler III“), Beschreibung mit Zielwert – statt 44 einzelner Namen.
- Statistik-Zähler (`state.stats`) liegen global, nicht je Standort; Prestige (S6) soll sie nicht zurücksetzen.
- Nav-Punkt „Erfolge“ öffnet das Panel „Fortschritt“ (Erfolge / Tagesaufgaben / Statistik, GAME_DESIGN § 16.9).
- Kyoto braucht Berlin Café-Level 14 statt 15 (+10 Zen) – mit der aktuellen Kurve wird Café-Level 15 nie erreicht; mit 14 hält der Richtwert „Kyoto nach 3–4 h“ (Sim: 3 h 22 min). Übrige Standorte unverändert (15).
- Freischalt-Bedingung prüft den Café-Level-**Bestwert** des Vorgängers (`LocationState.bestLevel`, überlebt den Reset). Sonst müsste man vor dem Reset Zen haben, das es erst durch den Reset gibt.
- Zen für einen Standort wird verbraucht (GAME_DESIGN § 2: Zen „für Meta-Upgrades, Freischaltung von Standorten“), nicht nur als Schwelle geprüft.
- Café-Level-Belohnung nach Reset: Münzen (30 s Einkommen) gibt es erneut als Neustart-Hilfe, Goldene Blätter nur für Level über dem Bestwert – sonst wäre jeder Reset eine Blätter-Quelle.
- Start-Kapital = Basis-Startmünzen + Einkommen/s beim Reset × 600 s × Stufe (Einkommen zum Reset-Zeitpunkt, inkl. laufender Boosts).
- Schnellstart nimmt die ersten N Stationen in Freischalt-Reihenfolge (Matcha-Bar, Kasse, To-go, Iced-Bar) auf Level 10, ohne Café-Level-Belohnung für den dadurch erreichten Level.
- Neue Standorte starten mit `startCoins × Standort-Skalierung` (Kyoto 125), damit das erste Upgrade dort genauso schnell geht wie in Berlin.
- Rabatt (Meta-Upgrade) gedeckelt bei 90 % (`BALANCE.maxDiscount`); bei Max-Stufe 15 sind es ohnehin nur 30 %.
- Zen-Shop als zweiter Tab im Standorte-Panel statt eigenem Nav-Punkt (Nav hat schon 6 Buttons; Mobile zuerst).
- Reset-Vorschau „+Y %“ = so viele Stufen „Globales Einkommen“, wie das Zen nach dem Reset bezahlt, × 10 %.
- Reset-Bestätigung ist ein einzelner Dialog (mit Abbrechen), nicht doppelt wie beim Löschen – der Reset ist gewollter Spielfortschritt.
- Balance-Sim: Meta-Upgrade-Priorität globales Einkommen, Schnellstart, Start-Kapital, Rabatt, Basis-Zufriedenheit (immer das günstigste); Offline-Effizienz und Tap-Stärke kauft der Greedy nicht (spielt weder offline noch tippt er). Zen für den nächsten Standort wird zurückgehalten, sobald dessen Café-Level-Bedingung erfüllt ist.
- Zufalls-Events laufen **je Standort**: ein Event startet am gerade aktiven Standort und wirkt nur dort (`ActiveEvent.locationId`); Kalender-Events wirken überall. So hat „Lieferengpass beheben (5 min Einkommen)“ eine eindeutige Kasse und der Influencer-Ansturm (−10 Zufriedenheit) einen Ort.
- Event-Plan deterministisch: `eventSchedule { seed, count, nextAt }`, das n-te Event zieht `drawEvent(seed, n)` (mulberry32). Seed neuer Spiele = Hash von `createdAt`; Neuladen würfelt nichts neu. Abstand 20–45 min Start-zu-Start, immer nur ein Zufalls-Event gleichzeitig.
- Influencer-Besuch dauert fest 2 min (Design: „Spawn ×2.5 für 2 min, danach −10“); die Nachwirkung −10 Zufriedenheit wird beim Ende einmalig abgezogen. Alle anderen 3–10 min.
- Lieferengpass: Qualität −1 wirkt auf Preis **und** Zufriedenheits-Beitrag der Qualität. Beheben kostet 5 min aktuelles Einkommen des Standorts (mindestens `startCoins`) und beendet das Event sofort mit 5 🍃; ohne Beheben endet es ohne Blätter, zählt aber als abgeschlossenes Event (Quest/Erfolg).
- Abnahme „Events laufen offline weiter“: Offline (und beim Tab-Lump) steht die Spielzeit still, Event-Timer werden aber um die Abwesenheit verkürzt (`advanceEventsOffline`) und abgelaufene Events beim Laden abgeschlossen (Belohnung, Statistik). Der Event-Plan läuft nur in aktiver Spielzeit (Design: „alle 20–45 min aktive Spielzeit“). Offline-Einnahmen rechnen weiter ohne Event-/Boost-Multiplikatoren.
- Boosts bleiben offline eingefroren (wie seit S4 für Hype/Kampagne); nur Events laufen in Echtzeit. Grund: ein gekaufter 30-min-Boost soll nicht verfallen, weil man den Tab schließt.
- Boost-Deckel ×12 (GAME_DESIGN § 12.3) gilt je Typ über Events, Boosts und aktive Kampagne zusammen (`BOOST_RULES.maxMult`); dauerhafte Multiplikatoren (Qualität, Zen) zählen nicht dazu.
- Gleiche Boost-Quelle verlängert um die volle Dauer (`addBoost`), nicht auf die volle Dauer – ein zweiter 30-min-Kauf ergibt 60 min. Hype behält sein S2-Verhalten (zurück auf 10 s).
- Gratis-Boost (No-op-Monetarisierung): ×2 Einkommen für 10 min, alle 20 min aktive Spielzeit (`data/monetization.ts`, `data/leaves.ts`). Dauer stand nicht im Design. Erster nach 20 min Spielzeit. Knopf erscheint im HUD und im Blätter-Shop, sobald bereit.
- Zeitsprung = Einkommen aller Standorte zu 100 % mit der Rate ohne zeitlich begrenzte Boosts (wie Offline, aber ohne Cap und ohne Effizienz). Spielzeit, Event- und Boost-Timer laufen dabei nicht – es ist Geld, keine Zeitreise. Zählt zu `earnedThisRun` (also auch zum Zen).
- „Sofort-Fertigstellung einer Kampagne“ (PLAN) = „Kampagnen-Abklingzeit beenden“ (GAME_DESIGN § 10, 3 🍃) – gab es seit S4 im Marketing-Panel, jetzt auch im Blätter-Shop.
- Quest sofort erledigen (4 🍃) setzt die Quest auf erledigt; abholen (3 🍃 + ggf. Bonus) muss man selbst. Technisch: Basiswert der Zähler-Quest wird so verschoben, dass der Fortschritt am Ziel bleibt.
- Skins kosten 30 🍃, werden beim Kauf angelegt und lassen sich ab-/anlegen (`meta.skins.owned/equipped`). Wirkung nur Tönung der Station in der Szene.
- Influencer-Drops als Erwartungswert im Tick: bediente Kunden × Influencer-Anteil (standortabhängig) × 1 %, Bruchteile sammeln sich in `leafDrops.fraction`, Deckel 10 pro lokalem Tag (Tageswechsel in `progressionStep`). Die sichtbaren Influencer-Figuren lassen nichts fallen (Figuren bleiben kosmetisch).
- Event-Belohnungen und der Erfolg „erstes Event“ (5 🍃) kommen zusammen; Event-Quest „Beende ein Event“ ist aktiv (`QUESTS[…].enabled`).
- Save-Schema v6 (`mce.save.v6`): `ActiveEvent` neu `{ id, locationId, startedAt, until }` (alte Events verworfen – es gab keine), `calendarEvents`, `eventSchedule`, `freeBoostAt`, `leafDrops`, `meta.skins`. Migration v5→v6 + Härtung (unbekannte Events/Skins raus, Boost-Multiplikatoren auf 1..12 geklemmt, Drop-Zähler gedeckelt). `mce.save.v5` in `LEGACY_KEYS`.
- `[hidden] { display: none !important }` global in `style.css`: Klassen mit eigenem `display` (Flex-Zeilen, Pillen, Event-Karte) überstimmten sonst das `hidden`-Attribut.
- Event-Karte wippt (`@keyframes bob`), bei `prefers-reduced-motion` nicht; Event-Partikel (Regen, Blüten, Funkeln) laufen dann ebenfalls nicht, nur der Farbfilter. e2e emuliert `reducedMotion`, weil Playwright ein dauerhaft animiertes Element nie als „stabil“ klickt.
- PRNG/Hash (`mulberry32`, FNV-1a) aus `progression/quests.ts` nach `core/math/random.ts` gezogen, damit Events und Quests denselben nutzen.
- S8: Sprites selbst gezeichnet **als Code** (`scripts/art/sprites.ts`, SVG) statt Kenney-Packs – Kenney hat kein Matcha-/Café-Inventar und nutzt Outlines/Texturen (widerspricht UI_STYLE § 4). Ausgabe wird eingecheckt; `pnpm art` nur nach Änderungen (braucht Chromium, nicht Teil von CI).
- S8: Texture-Atlas mit eigenem Shelf-Packer in `scripts/build-art.ts` statt `free-tex-packer-core`/Vite-Plugin – keine neue Abhängigkeit. Rendern über das vorhandene `@playwright/test`.
- S8: Audio komplett per Web Audio synthetisiert (keine Howler-Abhängigkeit, keine Audiodateien, keine Lizenzfrage). Phaser-Audio wird nicht genutzt.
- S8: Save-Schema v7: `settings.sfxVolume`/`musicVolume` (Standard 0.7/0.4, `data/audio.ts`); Schalter `sfx`/`music` bleiben und stummen unabhängig. `mce.save.v6` in `LEGACY_KEYS`.
- S8: Neues Token `--c-danger-ink` (#c42727): Weiß auf `--c-danger` hat nur 3.9:1; Löschen-Buttons, Badges und das Screen-X nutzen die tiefere Stufe (5.7:1). `.stat dt` in `--c-ink` statt `--c-ink-muted` (4.06:1 auf `--c-surface-2`).
- S8: Qualitäts-Pille zeigt 6 Blätter (das Spiel hat 6 Qualitätsstufen, `data/quality.ts`), nicht 4 wie UI_STYLE § 3.3.
- S8: Verwaltungs-Screen: jeder Tab bleibt ein eigenes Panel (eigene `panel-*`-Testid), der Screen bündelt sie über `createManageTabs`. Shop-Varianten haben eigene Keys (`shop`, `shop:quality`, `shop:ambience`), damit HUD-Qualität/Bauen nicht das gerade offene Shop-Panel wegklappen.
- S8: Statistik zeigt Werte „pro Café-Tag“ (24 min Spielzeit = 1 Tag, wie die Uhr).
- S8: Stationen haben je zwei Blickrichtungen (Theke nach +y oder ±x); Figuren zwei Richtungen × 2 Frames, die anderen zwei per `flipX`.
- S8: Tag/Nacht hängt an `playtimeSec` (Start 9:00), nicht an der Wanduhr – rein kosmetisch, keine Einnahmen-Wirkung. Helper in `core/time/dayCycle.ts` (pur, getestet), Konstanten `DAY_CYCLE` in `data/ui.ts`.
- S8: Warteschlangen-Tafel zählt alle wartenden Kunden im Café (Kunden laufen im Modell nicht über die Kasse).
- S8: Kauf-Plopp bei jedem Level-Kauf einer Station und jedem Ambiente-Kauf; Shine nur beim ersten Kauf und bei neuer Ausbaustufe (25/100), damit es besonders bleibt.
- S8: Bottom-Sheet deckt Zahnrad/Leiste ab (z-index Panel > HUD, wie Vorbild); e2e schließt Panels vor Klicks auf die Leiste bzw. aufs Café (Tagesaufgaben-Test angepasst, Sprachwechsel-Test prüft `aria-label` statt sichtbarem Nav-Text).
- S8: PWA: `theme_color` #1d457b, PNG-Icons 192/512, Precache auch für `json` (Atlanten) und `woff2`.
## Nächste Session: S9
Startpunkt: PLAN.md § 3, Abschnitt S9 (Balancing, Tutorial, Release) und die S9-Punkte unter „Offen“ (Kundentypen-Effekte, späte Café-Level-Kurve, Prestige-Zen, Blätter/h).
- Tutorial/Onboarding: UI_STYLE § 3.5 sieht einen einmaligen Tooltip vor, der die unbeschrifteten Leisten-Buttons erklärt. Alle Buttons haben stabile `data-testid`s (`nav-*`, `hud-*`, `manage-tab-*`, `tile-*`).
- Fallen: Neue UI nur mit Tokens aus `style.css` (Hex nur dort und in `UI_THEME`). Neue Sprites in `scripts/art/sprites.ts` zeichnen und `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm art` laufen lassen (Atlas + Icons werden neu geschrieben, `tests/art.test.ts` prüft Frames). Neue Instanz-Felder in `CafeScene.init()` zurücksetzen. Panels decken im Hochformat die Leiste ab – e2e vorher `panel-close`. Animierte Elemente in e2e mit `reducedMotion: 'reduce'` klicken. Save-Schema steht auf v7.
- e2e lokal: `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e` (27 Tests, ~2 min).

## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 4`)
S8 hat keine Balancing-Werte geändert; `pnpm sim --hours 1` läuft fehlerfrei mit identischem Ergebnis (Café-Level 8, 4.27 K/s nach 1 h). Snapshot aus S7 gilt weiter:
Balance-Sim: 4 h, Greedy-Spieler (Stationen, Personal, Ambiente, Qualität, Marketing, Reset, Zen), Meilensteine Berlin erster Run
| Meilenstein | Zielzeit | Ist |
|---|---|---|
| Erstes Upgrade | < 10 s | 9s |
| Zweite Station (Kasse) | 1–2 min | 1m 41s |
| Erster Personal-Kauf | ~5 min | 5m 24s |
| Erste Reinigungskraft | – | 5m 24s |
| Erste Kampagne | – | 1h 24m |
| Iced-Bar (Café-Level 3) | 10–15 min | 5m 24s |
| Bäckerei (Café-Level 5) | ~30 min | 21m 40s |
| Café-Level 10 | ~90 min | 1h 22m |
| Café-Level 15 | – | — |
| Qualität Stufe 1 (Café Grade) | – | 6m 21s |
| Qualität Stufe 2 (Premium Grade) | – | 32m 54s |
| Qualität Stufe 3 (Ceremonial Grade) | – | 1h 36m |
| Erster Franchise-Reset | ~3 h (20–30 Zen) | 3h 14m (41 Zen) |
| Kyoto freigeschaltet | 3–4 h | 3h 14m |
| Erstes Zufalls-Event | 20–45 min | 32m 17s |
| Tokio freigeschaltet | – | — |
Prestige: 1 Resets, Zen verdient 41, übrig 9; Meta: globalIncome 2, startCapital 1
Events: 6 abgeschlossen (supplyShortage 1, heatwave 2, foodBlogger 2, rainyDay 1); Influencer-Blätter heute 10
Goldene Blätter verdient 52 (je Stunde: h1 14, h2 15, h3 12, h4 11; ohne Erfolge/Quests, die laufen nur in der App)
Standort berlin: Café-Level 8 (Bestwert 14, Resets 1), Einkommen/s 4.76 K
Standort kyoto: Café-Level 8 (Bestwert 8, Resets 0), Einkommen/s 119.02 K
Ende: Café-Level 8, Münzen 338.74 K, Einkommen/s 4.76 K
Qualität 2, Goldene Blätter 52, Zufriedenheit 85.0, Sauberkeit 60.0, Kampagnen 2, Marketing-Level 14
Personal: cleaner 1, barista 11, socialMedia 7; Ambiente: seats 8, decor 30, wifi 20, music 18
