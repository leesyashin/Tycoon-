## Loop
state: running
current: S5
branch: session/s5-progression
started: 2026-10-14T20:46:39Z
next: S5
## Letzte Session: S5 – Progression (2026-10-14, PR #7)
## Fertig
- `data/quality.ts` + `core/progression/quality.ts`: 6 Qualitätsstufen nach GAME_DESIGN § 8 (Kosten × Standort-Skalierung, Café-Level-Sperre), `priceMult = 1.5^Stufe` zentral in `collectModifiers` → Rate-Modell; +4 Zufriedenheit/Stufe wirkte schon
- Shop-Tab „Qualität“: aktuelle Stufe, Effekt in Zahlen, Angebot mit Produktnamen je Station (nur Text, z. B. „Premium-Matcha-Latte“), nächste Stufe kaufen; Stations-Panel zeigt Produkt und Preis inkl. Qualität
- `data/unlocks.ts`: Freischalt-Tabelle je Café-Level (gesammelt aus Stationen, Ambiente, Personal, Qualität, Marketing), Café-Level-Belohnung (30 s Einkommen, ab Level 5 1–3 🍃), Terrassen-Pflicht für Stationen ab Café-Level 9 (§ 5.2)
- Ambiente-Freischaltung: Sitzplätze/Deko 1, Musik 2, WLAN 4, Terrasse 8
- Café-Level-Aufstieg schreibt die Belohnung in `buyStation` gut (auch beim Auto-Kauf); Toasts für Level, Bonus, jede Freischaltung, Qualität
- Grid-Erweiterung: Terrasse Stufe 1–3 legt Holzdeck-Kacheln vor den Raum (12×12 → 12×14 → 14×14) mit Außentischen, Kamera passt sich an; Stations-Label „Terrasse nötig“
- Achievements: 44 in `data/achievements.ts` (Münzen, Kunden, Stations-Level, Café-Level, alle Stationen, Qualität, Zufriedenheit 90+ 10 min, Personal max, Resets, Standorte, Taps, Hype, Events, Spielzeit, Kampagnen, Quests; geheim: Nachtschicht, Blitzblank, Stadtgespräch), Belohnung 2–25 🍃, einmalig
- Daily Quests: 3/Tag aus Pool, Seed = lokales Datum, Reset lokale Mitternacht, Fortschritt ab Ziehen (Basiswert), 3 🍃 je Quest + 5 🍃 Bonus beim dritten, unerledigte verfallen
- Statistik: neue `state.stats` (Kunden bedient inkl. offline, gekaufte Level, Taps, Hype-Füllungen, Kampagnen, Resets, Events, Quests, Zufriedenheits-Serie, verdiente Blätter)
- Panel „Fortschritt“ (Nav „Erfolge“): Tabs Erfolge (Fortschrittsbalken, geheime verdeckt) / Tagesaufgaben (Abholen, Bonus, Countdown bis Mitternacht) / Statistik (Café-Level-Fortschritt, nächste Freischaltungen, Lifetime-Werte); Nav-Abzeichen bei abholbaren Quests
- Goldene Blätter sind jetzt verdienbar (Achievements, Quests, Café-Level ≥ 5) → 🍃-Knopf im Marketing-Panel nutzbar
- Save-Schema v4 (`stats`, Quests mit `base`/`bonusClaimed`) + Migration v3→v4 + Härtung kaputter Werte; `mce.save.v3` in `LEGACY_KEYS`
- Tabs als wiederverwendbare Komponente `ui/tabs.ts` (Shop + Fortschritt)
- Tests: 171 Unit-Tests (neu `tests/core/progression.test.ts`: Qualität, Freischaltungen, Terrasse, Level-Belohnung, Achievements einmalig, Quest-Reset über Datumsgrenze und Zeitzonen inkl. +13:45, Save v4; Coverage core 99.8 % Zeilen, progression 100 %), e2e 14 grün (neu: Qualität kaufen, Erfolg einmalig auch nach Reload, Tagesaufgabe erledigen + abholen; axe prüft jetzt Fortschritt-Tabs und Qualitäts-Tab)
- `pnpm sim`: Greedy kauft Qualität und (wenn sie Stationen blockiert) Terrasse, jagt Café-Level (siehe Entscheidungen); neue Meilensteine Qualität 1–3
## Offen / bekannte Bugs
- Kundentypen sind nur kosmetisch; ihre Effekte (Merch-Chance, Trinkgeld, Influencer-Hype + 1 % 🍃-Drop, Kritiker) gehören als Erwartungswert ins Rate-Modell – auch in S5 nicht gemacht (nicht im Auftrag). Vorschlag: S7 (zusammen mit Events/Blätter-Quellen) oder S9.
- Quest „Beende ein Event“ und die Event-Achievements sind angelegt, aber deaktiviert bzw. unerreichbar, bis S7 Events baut (`QUESTS[…].enabled`, `stats.events` hochzählen). Ebenso `stats.resets` (S6) für die Reset-Achievements.
- Café-Level-Belohnung wird bei jedem Aufstieg gezahlt. Nach einem Franchise-Reset (S6) gäbe es sie erneut – S6 muss entscheiden, ob das gewollt ist (sonst „höchstes belohntes Level“ je Standort speichern).
- „Sofort-Fertigstellung Quest (4 🍃)“ fehlt – gehört zum Blätter-Shop (S7).
- Balancing: Mit Café-Level-Jagd laufen frühe Meilensteine noch zu schnell (Iced-Bar 5,4 min statt 10–15, Bäckerei 22 min statt ~30); Café-Level 10 passt. Greedy startet nie eine Kampagne, Reinigungskraft bleibt auf Stufe 1, Café-Level 15 wird in 2 h nicht erreicht → S9.
- Ohne Café-Level-Jagd pumpt der Greedy eine Station (neue Stationen bekommen auf Level 1 kaum Kunden-Anteil) – Hinweis für S9, ob neue Stationen attraktiver werden sollen.
- Achievement-Prüfung und Quest-Tageswechsel laufen 1×/s per `setInterval` in `main.ts` (Wanduhr); im Hintergrund-Tab drosselt der Browser das, nachgeholt wird beim nächsten Aufruf.
- Kein Plural-System für Toast-/Quest-Texte nötig gewesen; „Starte eine Kampagne“ ist fest Singular (Ziel 1).
- 60 fps nur bedingt geprüft: Headless-Chromium ohne GPU (SwiftShader) schafft 60 fps bei 400×800 mit 40 Agenten, bei 1280×720 ~33 fps – Füllrate des Software-Renderers. Auf echtem Desktop-Chrome mit GPU bitte einmal gegenprüfen (`?debugSpawn=100`).
- Kunden gehen nicht über die Kasse; die Kasse hat keine sichtbare Schlange (sie ist im Modell ein Engpass, keine Verkaufsstation).
- Pinch-Zoom ist nur logisch umgesetzt, nicht auf echtem Touch-Gerät getestet.
- Meta-Multiplikatoren außer `tapPower` fehlen noch (S6); `collectModifiers` hat dafür die zentrale Stelle.
- `pages.yml` läuft weiter bei jedem Push auf main und schlägt fehl, solange Pages nicht aktiviert ist – erwartet, ignorieren (siehe Entscheidungen).
- PWA-Icon ist nur ein SVG-Platzhalter (PNG 192/512 in S8/S9).
- Standorte-Panel ist eine Vorschau (Liste + Bedingungen); Wechseln/Reset baut S6.
- HUD hat noch keinen Boost-Timer/Event-Banner (GAME_DESIGN § 16.1) – kommt mit Events in S7.
- Ein nicht lesbarer Spielstand wird unter `mce.save.v4.corrupt` beiseitegelegt; die IndexedDB-Backups (`mce-backups`) haben noch keine Wiederherstellen-UI.
- SFX/Musik-Schalter speichern nur die Einstellung; Audio selbst kommt in S8.
- Bundle 381 KB gzip JS (Phaser ist der Großteil), Ziel < 2 MB eingehalten.
- Marketing-Plakat vorm Café (GAME_DESIGN § 9, „Visuell“) fehlt. Kandidat für S8.
- Auto-Kauf und Sauberkeit laufen offline nicht (siehe Entscheidungen).
- Personal-Figuren stehen neben der Station; mit echten Sprites in S8 ggf. hinter die Theke. Terrassen-Deck und Außentische sind Platzhalter (S8).
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
## Nächste Session: S6
Startpunkt: PLAN.md § 3, Abschnitt S6 (Standorte und Prestige: 6 Standorte, Freischaltung, Franchise-Reset, Zen, Meta-Upgrades) und GAME_DESIGN §§ 3, 11.
- `data/locations.ts` hat alle 6 Standorte mit Skalierung und Freischalt-Bedingung; Layouts nutzen alle `DEFAULT_LAYOUT` (`data/layouts.ts`), Stations-Texte gibt es nur für Berlin (`station.berlin.*`).
- Beim Franchise-Reset: `stats.resets` hochzählen (Achievements „Franchise-Gründer“), `meta.unlockedLocations` pflegen (Achievements „Weltenbummler“). Klären, ob Café-Level-Belohnungen nach dem Reset erneut gezahlt werden (siehe Offen).
- Meta-Multiplikatoren gehören in `collectModifiers` (`core/economy/modifiers.ts`); `priceMult` ist schon da (Qualität), `discount` wird überall durchgereicht.
- Standorte-Panel (`ui/infoPanels.ts`) ist nur eine Vorschau – Wechseln, Reset-Button, Bestätigungsdialog (`confirmTwice` in `ui/dialog.ts`).
- Fallen: Jede neue UI-Zeichenkette in beide JSONs (Test prüft Daten-Keys). Save-Schema-Änderung → `SCHEMA_VERSION` 5 + Migration + Test + `mce.save.v4` in `LEGACY_KEYS`. `collectModifiers(state, locationId)` ist standortbezogen. Tick-Äquivalenz-Test braucht einen eingeschwungenen Zustand. e2e lokal mit `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e`; `reloadWithSave` kann `coins`, `level`, `ageMs`, `stats`, `questsToday` setzen. Die Balance-Sim ist empfindlich: nach Änderungen an Kosten/Preisen `pnpm sim --hours 2` laufen lassen.
## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 2`)
Balance-Sim: 2 h, Greedy-Spieler (Stationen, Personal, Ambiente, Qualität, Marketing), Berlin
| Meilenstein | Zielzeit | Ist |
|---|---|---|
| Erstes Upgrade | < 10 s | 9s |
| Zweite Station (Kasse) | 1–2 min | 1m 41s |
| Erster Personal-Kauf | ~5 min | 5m 24s |
| Erste Reinigungskraft | – | 5m 24s |
| Erste Kampagne | – | — |
| Iced-Bar (Café-Level 3) | 10–15 min | 5m 24s |
| Bäckerei (Café-Level 5) | ~30 min | 21m 40s |
| Café-Level 10 | ~90 min | 1h 27m |
| Café-Level 15 | – | — |
| Qualität Stufe 1 (Café Grade) | – | 6m 21s |
| Qualität Stufe 2 (Premium Grade) | – | 32m 41s |
| Qualität Stufe 3 (Ceremonial Grade) | – | 1h 43m |
Ende: Café-Level 11, Münzen 225.93 K, Einkommen/s 17.14 K
Qualität 3, Goldene Blätter (Café-Level) 9, Zufriedenheit 99.0, Sauberkeit 60.0, Kampagnen 0, Marketing-Level 18
Personal: cleaner 1, barista 16, socialMedia 11, teaMaster 5, baker 11, cashier 14; Ambiente: seats 8, decor 30, wifi 20, music 20, terrace 1
