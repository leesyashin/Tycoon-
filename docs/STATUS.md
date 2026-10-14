## Loop
state: running
current: S8
branch: session/s8-art
started: 2026-10-14T22:12:48Z
next: S8
## Letzte Session: S7 – Events, Boosts, Premium-Währung, Monetarisierungs-Interface (2026-10-14, PR #10)
## Fertig
- `data/events.ts`: 5 Zufalls-Events (§ 12.1: Hitzewelle, Influencer-Besuch, Lieferengpass, Food-Blogger, Regentag) mit Wirkung, Belohnung, Szene-Overlay; 3 Kalender-Events (§ 12.2: Hanami, Sommer-Eis, Neujahr); Intervall/Dauer-Konstanten
- `core/events/`: deterministischer Scheduler (`drawEvent(seed, n)`, `stepEvents` im Tick, ein Event zur Zeit), Abschluss mit Blättern/Statistik/Nachwirkung (`settleEvents`), Lieferengpass beheben (`resolveEvent`, 5 min Einkommen), Offline-Fortschritt (`advanceEventsOffline` in `applyOffline`), Kalender aus lokalem Datum (`refreshCalendarEvents` in `progressionStep`), Effekte je Standort (`collectEventEffects`: Spawn, Preise je Station, Trinkgeld, Zufriedenheit, Qualitäts-Abzug), Szene-Overlay (`getEventOverlay`)
- Boost-System (§ 12.3): `addBoost` (gleiche Quelle verlängert, verschiedene multiplizieren), Deckel ×12 je Typ in `collectModifiers`; Gratis-Boost-Timer (`freeBoostAt`, `claimFreeBoost`)
- Goldene Blätter (§ 10): neue Quellen Events (3–8 🍃) und Influencer-Drops (Erwartungswert, 10/Tag); `spendLeaves` (nie negativ) für alle Ausgaben; `core/leaves/`: Zeitsprung 1/4/8 h (5/15/25 🍃, 100 %, alle Standorte, `creditIncome` aus Offline herausgelöst), Boost ×2 30 min (8 🍃), Quest sofort erledigen (4 🍃), Kampagnen-Abklingzeit (3 🍃, schon S4), 2 Skins (Sakura-Bar, Neon-Kasse, 30 🍃)
- `core/monetization/`: `MonetizationProvider` (isAvailable/showRewarded/purchase), `NoopProvider`, `createMonetizationProvider()`; `MONETIZATION_ENABLED = false` in `data/monetization.ts`. „Gratis-Boost“-Knopf ruft `provider.showRewarded('freeBoost')`, `core` bucht den Boost
- HUD: „+“-Kreis am Blätter-Stand öffnet den Blätter-Shop (UI_STYLE § 3.1), Boost-Pillen mit Restzeit (§ 3.2/3.5), Gratis-Boost-Knopf, Kalender-Event-Chip; Event-Karte rechts über der Szene (§ 3.7, wippt), öffnet das Event-Panel (Wirkung, Ort, Restzeit, Belohnung, „Beheben“)
- Blätter-Shop-Panel (§ 16.8): Zeitsprung mit Münz-Vorschau, Boosts, Abkürzungen (Abklingzeit, offene Quests), Skins (kaufen/an/ab); Premium-Zeilen mit Gold-Kante
- Toasts: Event-Start (Ankündigung mit Wirkung), Event-Ende (+🍃), Influencer-Blatt, Gratis-Boost
- Szene: Farbfilter je Event, Partikel (Regen, Kirschblüten, Funkeln; aus bei reduzierter Bewegung), Skin-Tönung der Stationen
- Quest „Beende ein Event“ aktiv; Event-Achievements erreichbar; Zufriedenheits-Detail hat den Posten „Events“
- Save-Schema v6 + Migration v5→v6 + Härtung
- Tests: 250 Unit-Tests (neu `tests/core/events.test.ts` 24 Tests: Scheduler deterministisch per Seed, gleiche Folge über 3 h, Intervalle/Dauern, jedes Event in Wirkung und Abschluss, Standort-Bindung, Offline-Abschluss, Kalender inkl. Jahreswechsel/Zeitzone, Boost-Stacking und ×12-Deckel, Gratis-Boost; `tests/core/leaves.test.ts` 21 Tests: Blätter-Buchhaltung inkl. 200 zufälliger Käufe ohne negativen Stand, Zeitsprung, Boost, Quest, Skins, Drops mit Tagesdeckel, No-op-Provider, Save v6 inkl. Härtung), i18n-Test für Events/Skins/Boosts; Coverage core 99,7 % Zeilen (events 100 %, leaves 98,6 %); e2e 21 grün (neu `tests/e2e/events.spec.ts`: Blätter-Shop, Skin, Event beheben, Offline-Abschluss, Gratis-Boost + kein Request an fremde Hosts; axe prüft Blätter-Shop, Event-Panel und HUD mit Boost-Pillen)
- `pnpm sim`: spielt Events mit (behebt Lieferengpässe), meldet „Erstes Zufalls-Event“, Event-Zählung je Art und Blätter je Stunde
- Abnahme: kein Netzwerk-Call und kein SDK im Bundle (e2e prüft Requests; Bundle enthält kein AdMob/Stripe), Flag `false`; Events laufen offline weiter bzw. werden beim Laden abgeschlossen (Unit + e2e)

## Monetarisierung: wie ein echter Provider eingehängt würde
- Einziger Einstiegspunkt ist `MonetizationProvider` (`src/core/monetization/provider.ts`). Spielcode ruft nur `isAvailable()`, `showRewarded(placement)` und `purchase(sku)`; Belohnungen bucht immer `core` (z. B. `claimFreeBoost`), nie der Provider.
- Neuer Provider (z. B. `AdMobProvider`, `WebAdsProvider`, `StripeProvider`) als eigene Datei außerhalb von `core` (er braucht DOM/SDK), implementiert das Interface. `createMonetizationProvider()` lädt ihn nur bei `MONETIZATION_ENABLED === true` per dynamischem `import()`, sonst bleibt es beim `NoopProvider` – so landet das SDK bei ausgeschaltetem Flag nicht im Bundle.
- Rewarded Ad: `showRewarded('freeBoost')` öffnet die Werbung und löst erst nach vollständigem Ansehen mit `{ rewarded: true }` auf; Abbruch → `{ rewarded: false }`. Der Spielzeit-Timer (`freeBoostAt`) bleibt die Obergrenze.
- Käufe: `purchase(sku)` → Zahlungsdialog des Anbieters; erst nach Server-Bestätigung (Webhook/Receipt-Prüfung, nicht im Client) `{ ok: true }`. Gutschrift über eine neue `core`-Action (z. B. `grantLeaves`) mit Idempotenz-Schlüssel im Save. Erstattungen/Abstürze sind laut GAME_DESIGN § 10 nicht Teil von v1.
- Vor dem Einschalten: Datenschutz/Consent (DSGVO), Lizenz des SDK in `docs/ASSETS.md`/STATUS „Entscheidungen“, e2e „keine fremden Requests“ anpassen.
## Offen / bekannte Bugs
- Kundentypen: nur der Influencer-Blätter-Drop ist im Rate-Modell (Erwartungswert, S7). Merch-Chance (Tourist), Trinkgeld (Stammgast), Influencer-Hype ×1.5 und Kritiker fehlen weiter → S9 (Balancing).
- HUD zeigt Zen weiter nicht (nur Standorte-Panel). Kandidat für den UI-Skin in S8 (HUD-Pille § 3.1 hat Platz für drei Währungen).
- Event-Karte zeigt nur ein Event (das am aktiven Standort, sonst irgendeins); das Event-Panel listet alle. Banner zum Event-Start ist ein Info-Toast – ein eigenes Banner-Element kommt mit dem UI-Skin (S8).
- Offline beendete Events werden still abgeschlossen (Blätter sind da, aber der Offline-Dialog nennt sie nicht). Idee: Zeile „Während du weg warst: Hitzewelle (+5 🍃)“ im Offline-Dialog.
- Skins sind nur eine Tönung des Platzhalter-Sprites; echte Skin-Sprites mit S8. Skins sind global (alle Standorte), nicht je Standort.
- Balance-Sim spielt Events mit (inkl. Beheben des Lieferengpasses), gibt aber keine Blätter aus (kein Zeitsprung/Boost) und kennt weder Erfolge noch Quests (laufen nur über `progressionStep` in der App). Blätter/h im Sim also nur Café-Level + Events + Influencer: 11–15/h; mit Erfolgen und Quests liegt die Frühphase im Richtwert 15–25/h (nicht gemessen) → S9.
- Kalender-Events wirken auch auf Offline-Einnahmen und den Zeitsprung (sie gelten tage-/wochenweise, keine Spielzeit-Timer); Neujahr verdoppelt also auch Offline. Bewusst so, siehe Entscheidungen.
- Kein Weg, ein laufendes Zufalls-Event vorzeitig zu beenden oder die Event-Häufigkeit einzustellen (Settings) – nicht im Design.
- Balancing Prestige: Erster Reset bringt im Sim 40 Zen (Richtwert 20–30), weil er erst bei 3 h 22 min kommt (Café-Level 14). Berlin stockt ab ~3 h 30 bei Café-Level 14 (Stationskosten mit Wachstum 1.14–1.21 explodieren, Qualität 4 kostet 500 M); Café-Level 15 wird ohne Reset nie erreicht → S9 (Kurve späte Café-Level, ggf. Kyoto zurück auf 15).
- Freischalt-Café-Level der Standorte ab Tokio stehen weiter auf 15 (Design); ob das mit der neuen Kurve passt, ist ungeprüft – Sim spielt bisher nur bis Kyoto sinnvoll → S9.
- Alle Standorte nutzen weiter `DEFAULT_LAYOUT` (gleicher Grundriss); eigene Grundrisse je Standort und echte Skins → S8.
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
- PWA-Icon ist nur ein SVG-Platzhalter (PNG 192/512 in S8/S9).
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
## Nächste Session: S8
Startpunkt: PLAN.md § 3, Abschnitt S8 (Grafik und Audio) und `docs/UI_STYLE.md` § 2–4 und § 7 (Umsetzungs-Checkliste).
- UI-Skin: S7 hat die S7-Bausteine schon mit den Ziel-Klassen angelegt (`.boost-pill`, `.event-card`, `.hud-plus`); beim Umbau auf `.hud-pill`/`.actionbar` die `data-testid`s behalten (`hud-leaf-shop`, `hud-free-boost`, `hud-boost-*`, `event-card`, `leaf-*`, `event-resolve-*`).
- Szene: Event-Overlay (`getEventOverlay`) liefert Farbe/Alpha/Partikel-Art; Partikel-Texturen `fx-rain`, `fx-petal`, `fx-sparkle` sind Platzhalter in `scenes/placeholders.ts`. Skins tönen heute nur (`equippedSkinTints`) – mit echten Sprites eigene Texturen je Skin.
- Audio: SFX für Kauf, Event-Start/-Ende, Blatt-Drop, Boost; Musik-Schalter existiert seit S3.
- Fallen: `[hidden]` ist global `display:none !important` – neue Komponenten mit eigenem `display` brauchen nichts extra. Neue Instanz-Felder in `CafeScene.init()` zurücksetzen (Szene startet bei Wechsel/Reset neu; `fx`, `overlayKey` gibt es schon). Neue UI-Texte in beide JSONs. e2e lokal: `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e`; animierte Elemente in e2e mit `page.emulateMedia({ reducedMotion: 'reduce' })` klicken. Bundle (393 KB gzip JS) im Blick behalten.
## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 4`)
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
