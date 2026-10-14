## Loop
state: running
current: S7
branch: session/s7-events
started: 2026-10-14T21:36:24Z
next: S7
## Letzte Session: S6 – Standorte und Prestige (2026-10-14, PR #9)
## Fertig
- `data/prestige.ts`: Zen-Formel-Konstanten, Reset ab Café-Level 10, alle 7 Meta-Upgrades aus GAME_DESIGN § 11.3 (Kosten, Wachstum, Max, Effekt je Stufe)
- `core/prestige/`: `computeZenGain` (§ 11.2), `franchiseReset` (setzt nur den `LocationState` zurück; `meta`, `prestigeCount` und neuer `bestLevel` bleiben; Start-Kapital, Schnellstart, `stats.resets`), Meta-Upgrades kaufen, `getMetaEffects`, `affordableMetaLevels` (Reset-Vorschau)
- Meta-Effekte zentral: `collectModifiers` hat jetzt `prestigeMult` (globales Einkommen), `discount` (wirkt auf Stationen, Ambiente, Personal, Marketing, Qualität) und `satisfactionBonus` (eigener Posten „Stammkundschaft (Zen)“ im Zufriedenheits-Detail); Offline-Effizienz und Tap-Stärke lesen ihren Wert aus `data/prestige.ts`
- `core/progression/locations.ts`: Freischalt-Kette über Café-Level-Bestwert des Vorgängers + Zen (Zen wird verbraucht), `unlockLocation`, `switchLocation`; neue Standorte starten mit `startCoins × Skalierung`; alle freigeschalteten Standorte produzieren parallel (Tick und Offline, war schon so – jetzt getestet)
- Café-Level-Belohnung nach Reset: Münzen ja, Goldene Blätter nur für Level über dem Bestwert (Offen-Punkt aus S5 entschieden)
- Standorte-Panel (Nav „Standorte“) mit Tabs „Standorte“ (Café-Level, Einkommen, Münzen, Resets, Bedingung mit bisherigem Bestwert, Eröffnen / Hierher wechseln / Franchise-Reset) und „Zen-Shop“ (Stufe, Effekt in Zahlen, Kosten); Zen-Stand oben im Panel
- Reset-Dialog mit Vorschau: was zurückgesetzt wird, „Du bekommst X Zen (danach insgesamt Y)“, „+Z % Einkommen an allen Standorten“ (so viele Stufen Globales Einkommen, wie das Zen kauft), was erhalten bleibt
- Stations-Namen und -Beschreibungen für alle 6 Standorte (DE/EN, z. B. Kyoto „Usucha-Tresen“, „Wagashi-Küche“, „Teezeremonie-Raum“), Thema je Standort als Text; Platzhalter-Skin je Standort (`data/themes.ts`: Boden-Tönung, Wandfarben)
- Szene baut sich bei Standortwechsel und Reset neu auf (`scene.restart()`, `init()` setzt den Instanz-Zustand zurück, Resize-Listener wird beim Shutdown entfernt); andere offene Panels schließen beim Wechsel; Toasts für Eröffnen, Wechseln, Reset
- Save-Schema v5 (`bestLevel` je Standort) + Migration v4→v5 + Härtung (`unlockedLocations` nur mit Standort-Zustand, kaputte Meta-Upgrade-Stufen, `prestigeCount`); `mce.save.v4` in `LEGACY_KEYS`. Die Mehr-Standort-Migration aus PLAN („v1 → v2“) existiert seit S1 als v0→v1
- Tests: 204 Unit-Tests (neu `tests/core/prestige.test.ts`, 31 Tests: Zen-Formel inkl. Skalierung und Richtwert, Reset erhält `meta` vollständig und lässt andere Standorte unberührt, Start-Kapital, Schnellstart, Blätter nach Reset, alle Meta-Effekte, Rabatt-Deckel, Freischalt-Kette inkl. Bestwert nach Reset, paralleles Einkommen online/offline, Save v5), i18n-Test verlangt Stations-Texte für alle Standorte und Meta-Upgrade-Texte; Coverage core 99.8 % Zeilen (prestige 100 %); e2e 16 grün (neu: Standort eröffnen/wechseln/Neuladen, Reset mit Vorschau/Abbrechen/Bestätigen + Zen-Shop-Kauf; axe prüft Zen-Shop und Reset-Dialog)
- `pnpm sim`: Greedy spielt alle freigeschalteten Standorte, setzt zurück (wenn das den nächsten Standort freischaltet, sonst erst nach 60 min ohne Café-Level-Aufstieg und ≥ 20 Zen), eröffnet Standorte und kauft Meta-Upgrades; neue Meilensteine „Erster Franchise-Reset“, „Kyoto/Tokio freigeschaltet“
## Offen / bekannte Bugs
- Balancing Prestige: Erster Reset bringt im Sim 40 Zen (Richtwert 20–30), weil er erst bei 3 h 22 min kommt (Café-Level 14). Berlin stockt ab ~3 h 30 bei Café-Level 14 (Stationskosten mit Wachstum 1.14–1.21 explodieren, Qualität 4 kostet 500 M); Café-Level 15 wird ohne Reset nie erreicht → S9 (Kurve späte Café-Level, ggf. Kyoto zurück auf 15).
- Freischalt-Café-Level der Standorte ab Tokio stehen weiter auf 15 (Design); ob das mit der neuen Kurve passt, ist ungeprüft – Sim spielt bisher nur bis Kyoto sinnvoll → S9.
- Alle Standorte nutzen weiter `DEFAULT_LAYOUT` (gleicher Grundriss); eigene Grundrisse je Standort und echte Skins → S8.
- HUD zeigt Zen nicht (nur im Standorte-Panel); Blätter-Shop/Boost-Leiste in S7 könnten ihn mit aufnehmen.
- Kein „Café-Level-Fortschritt anderer Standorte“-Hinweis im HUD (z. B. Badge, wenn ein anderer Standort etwas Kaufbares hat) – Idee für S9.
- Achievement-Fortschritt „Café-Level“/„Stations-Level“ nimmt das aktuelle Level aller Standorte; nach einem Reset fällt der Balken noch nicht erreichter Stufen zurück (Erreichtes bleibt). Für Café-Level könnte S9 `bestLevel` nehmen.
- Kundentypen sind nur kosmetisch; ihre Effekte (Merch-Chance, Trinkgeld, Influencer-Hype + 1 % 🍃-Drop, Kritiker) gehören als Erwartungswert ins Rate-Modell – auch in S5 nicht gemacht (nicht im Auftrag). Vorschlag: S7 (zusammen mit Events/Blätter-Quellen) oder S9.
- Quest „Beende ein Event“ und die Event-Achievements sind angelegt, aber deaktiviert bzw. unerreichbar, bis S7 Events baut (`QUESTS[…].enabled`, `stats.events` hochzählen). (`stats.resets` zählt seit S6.)
- „Sofort-Fertigstellung Quest (4 🍃)“ fehlt – gehört zum Blätter-Shop (S7).
- Balancing: Mit Café-Level-Jagd laufen frühe Meilensteine noch zu schnell (Iced-Bar 5,4 min statt 10–15, Bäckerei 22 min statt ~30); Café-Level 10 passt. Greedy startet nie eine Kampagne, Reinigungskraft bleibt auf Stufe 1, Café-Level 15 wird in 2 h nicht erreicht → S9.
- Ohne Café-Level-Jagd pumpt der Greedy eine Station (neue Stationen bekommen auf Level 1 kaum Kunden-Anteil) – Hinweis für S9, ob neue Stationen attraktiver werden sollen.
- Achievement-Prüfung und Quest-Tageswechsel laufen 1×/s per `setInterval` in `main.ts` (Wanduhr); im Hintergrund-Tab drosselt der Browser das, nachgeholt wird beim nächsten Aufruf.
- Kein Plural-System für Toast-/Quest-Texte nötig gewesen; „Starte eine Kampagne“ ist fest Singular (Ziel 1).
- 60 fps nur bedingt geprüft: Headless-Chromium ohne GPU (SwiftShader) schafft 60 fps bei 400×800 mit 40 Agenten, bei 1280×720 ~33 fps – Füllrate des Software-Renderers. Auf echtem Desktop-Chrome mit GPU bitte einmal gegenprüfen (`?debugSpawn=100`).
- Kunden gehen nicht über die Kasse; die Kasse hat keine sichtbare Schlange (sie ist im Modell ein Engpass, keine Verkaufsstation).
- Pinch-Zoom ist nur logisch umgesetzt, nicht auf echtem Touch-Gerät getestet.
- `pages.yml` läuft weiter bei jedem Push auf main und schlägt fehl, solange Pages nicht aktiviert ist – erwartet, ignorieren (siehe Entscheidungen).
- PWA-Icon ist nur ein SVG-Platzhalter (PNG 192/512 in S8/S9).
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
## Nächste Session: S7
Startpunkt: PLAN.md § 3, Abschnitt S7 (Events, Boosts, Premium-Währung, MonetizationProvider No-op, Zeitsprung-Shop) und GAME_DESIGN §§ 10, 12.
- Boosts/Events laufen schon über `ActiveBoost`/`ActiveEvent` (Zeiten in `playtimeSec`) und `collectModifiers`; Offline rechnet ohne sie (`withoutTemporaryBoosts`).
- Events: `stats.events` hochzählen und `QUESTS[…].enabled` für „Beende ein Event“ aktivieren; Event-Achievements sind angelegt.
- Zeitsprung muss alle Standorte parallel vorspulen (wie `applyOffline`, aber ohne Offline-Effizienz?) – Entscheidung dokumentieren.
- Blätter-Shop: „Sofort-Fertigstellung Quest (4 🍃)“ aus S5-Offen; Kundentypen-Effekte (Influencer-🍃-Drop) als Erwartungswert sind Kandidat.
- HUD: Boost-Timer und Event-Banner (GAME_DESIGN § 16.1) fehlen noch; Zen könnte dort mit angezeigt werden.
- Fallen: Neue UI-Texte in beide JSONs. Save-Schema-Änderung → `SCHEMA_VERSION` 6 + Migration + Test + `mce.save.v5` in `LEGACY_KEYS`. Panels halten ihren Standort beim Öffnen fest und werden bei Standortwechsel geschlossen (`notifyLocations` in `ui/app.ts`). Die Szene startet bei Wechsel/Reset neu – neue Instanz-Felder in `CafeScene.init()` zurücksetzen. e2e lokal mit `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e`; `reloadWithSave` kann jetzt auch `bestLevel`, `earnedThisRun`, `zen` setzen. Die Balance-Sim ist empfindlich: nach Änderungen `pnpm sim --hours 4` laufen lassen.
## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 4`)
Balance-Sim: 4 h, Greedy-Spieler (Stationen, Personal, Ambiente, Qualität, Marketing, Reset, Zen), Meilensteine Berlin erster Run
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
| Erster Franchise-Reset | ~3 h (20–30 Zen) | 3h 22m (40 Zen) |
| Kyoto freigeschaltet | 3–4 h | 3h 22m |
| Tokio freigeschaltet | – | — |
Prestige: 1 Resets, Zen verdient 40, übrig 8; Meta: globalIncome 2, startCapital 1
Standort berlin: Café-Level 6 (Bestwert 14, Resets 1), Einkommen/s 2.70 K
Standort kyoto: Café-Level 6 (Bestwert 6, Resets 0), Einkommen/s 67.40 K
Ende: Café-Level 6, Münzen 14.49 K, Einkommen/s 2.70 K
Qualität 2, Goldene Blätter (Café-Level) 17, Zufriedenheit 84.7, Sauberkeit 60.0, Kampagnen 0, Marketing-Level 12
Personal: cleaner 1, barista 6, socialMedia 6; Ambiente: seats 6, decor 30, wifi 18, music 15
