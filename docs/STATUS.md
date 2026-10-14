# STATUS
## Loop
state: running
current: S4
branch: session/s4-staff
started: 2026-10-14T20:26:47Z
next: S4
## Letzte Session: S4 – Personal, Zufriedenheit, Marketing (2026-10-14)
## Fertig
- `data/staff.ts`: alle 7 Rollen nach GAME_DESIGN § 6 (Kosten, Wachstum 1.5, Max, Tempo-Effekte je Station)
- `core/staff`: Einstellen (`hireStaff`), Kosten, Freischaltung, Tempo-Multiplikatoren je Station, Sauberkeit (Verfall, Untergrenze 60, Aufwischen ab Stufe 3, Gleichgewicht), Auto-Kauf-Schalter (Filialleiter), `previewStaffHire` für die Panel-Erklärung
- `core/marketing`: Kampagnen-Level (+5 % Spawn, Wachstum 1.6, max 30), aktive Kampagne (×2 Spawn 10 min, 30 min Abklingzeit, Social-Media −10 %/Stufe), Abklingzeit gegen 3 🍃 beenden
- Rate-Modell: Sauberkeit geht ins Zufriedenheits-Ziel ein, Personal-Tempo je Station, Kampagne in `collectModifiers`; `tick` bewegt Sauberkeit und führt den Auto-Kauf aus; Offline ohne temporäre Boosts
- Save-Schema v3 + Migration v2→v3 + Härtung kaputter Werte
- UI: Personal-Panel (Stufe kaufen, „Jetzt“-Effekt, „Nächste Stufe“-Effekt in Zahlen, Sauberkeit/min, Auto-Kauf-Schalter), Zufriedenheits-Detail (Beiträge +/−, Wirkung auf Kundenstrom/Trinkgeld, Hinweis auf den größten Druck), Marketing-Panel (Level, Kampagne mit Restzeit, Abklingzeit, 🍃-Sprung), Nav-Punkt Marketing, HUD-Stimmungssymbol
- Szene: Personal-Figuren neben ihren Stationen (sichtbar, sobald Station und Rolle gekauft sind), Reinigungskraft wischt zwischen den Tischen, Stimmungs-Smileys über Kunden in Schlange/Bedienung
- Abnahme per Test: ohne Reinigungskraft fallen Zufriedenheit und Einkommen über 40 min sichtbar, mit Stufe 3 bleiben beide stabil (`tests/core/staff.test.ts`)
- Tests: 143 Unit-Tests (neu: staff, marketing, Stimmung; Coverage core 100 % Zeilen, Branches ≥ 89 %), e2e 11 Tests grün (neu: Personal einstellen + Auto-Kauf, Marketing-Kampagne, Zufriedenheits-Detail; axe prüft jetzt auch Marketing und Zufriedenheit)
- `pnpm sim` erweitert (Personal, Ambiente, Marketing, Kampagne; neue Meilensteine „Erster Personal-Kauf“, „Erste Reinigungskraft“, „Erste Kampagne“)
## Offen / bekannte Bugs
- 60 fps nur bedingt geprüft: Headless-Chromium ohne GPU (SwiftShader) schafft 60 fps bei 400×800 mit 40 Agenten, bei 1280×720 ~33 fps – mit und ohne Agenten gleich (Füllrate des Software-Renderers, nicht die Agenten). Auf echtem Desktop-Chrome mit GPU bitte einmal gegenprüfen (`?debugSpawn=100`).
- Kundentypen sind nur kosmetisch; ihre Effekte (Merch-Chance, Trinkgeld, Influencer-Hype, Kritiker) gehören als Erwartungswert ins Rate-Modell – in S4 bewusst nicht gemacht (nicht im S4-Auftrag), Vorschlag: S5.
- Kunden gehen nicht über die Kasse; die Kasse hat keine sichtbare Schlange (sie ist im Modell ein Engpass, keine Verkaufsstation).
- Pinch-Zoom ist nur logisch umgesetzt, nicht auf echtem Touch-Gerät getestet.
- Balancing (siehe Snapshot) weiter nicht abgestimmt → S9. Kasse wird vom Greedy-Spieler nie gekauft.
- Meta-Multiplikatoren außer `tapPower` fehlen noch (S6); `collectModifiers` hat dafür die zentrale Stelle.
- `pages.yml` läuft weiter bei jedem Push auf main und schlägt fehl, solange Pages nicht aktiviert ist – erwartet, ignorieren (siehe Entscheidungen).
- PWA-Icon ist nur ein SVG-Platzhalter (PNG 192/512 in S8/S9).
- Standorte- und Erfolge-Panel sind Vorschauen (Liste + „Kommt in einem späteren Update“); Wechseln/Achievements bauen S6/S5. Shop-Tab „Qualität“ ebenso (S5).
- HUD hat noch keinen Boost-Timer/Event-Banner (GAME_DESIGN § 16.1) – kommt mit Events in S7.
- Ambiente: Terrasse erweitert das Grid noch nicht sichtbar (§ 5.2); alle Ambiente-Elemente sind ab Café-Level 1 kaufbar, bis `data/unlocks.ts` (S5) existiert.
- Ein nicht lesbarer Spielstand wird unter `mce.save.v2.corrupt` beiseitegelegt; die IndexedDB-Backups (`mce-backups`) haben noch keine Wiederherstellen-UI.
- SFX/Musik-Schalter speichern nur die Einstellung; Audio selbst kommt in S8.
- Lighthouse (mobil, `?lang=de`, Produktions-Build): Accessibility 100, Best Practices 100. Gemessen nur im Startzustand; Panels/Dialoge prüft der axe-e2e-Test.
- Bundle 364 KB gzip JS (Phaser ist der Großteil), Ziel < 2 MB eingehalten.
- Goldene Blätter sind noch nicht verdienbar; „Abklingzeit beenden (3 🍃)“ ist eingebaut, aber erst ab S5/S7 benutzbar.
- Greedy-Sim startet nie eine Kampagne: das Café ist meist durchsatz-, nicht nachfragebegrenzt, ×2 Spawn bringt dann wenig. Für S9 prüfen (Kampagne ggf. auch Preis/Tempo, oder billiger).
- Sim: Greedy hört bei Reinigungskraft Stufe 1 auf (Untergrenze 60 % reicht ihm). Ob Stufe 3 (Aufwischen) attraktiver werden soll → S9.
- Balancing: Mit Personal + Ambiente im Greedy laufen frühe Meilensteine viel zu schnell (Iced-Bar 2,5 min statt 10–15, Bäckerei ~10 min statt ~30) → S9.
- Marketing-Plakat vorm Café (GAME_DESIGN § 9, „Visuell“) fehlt; der dichtere Kundenstrom ist sichtbar. Kandidat für S8.
- Auto-Kauf und Sauberkeit laufen offline nicht (siehe Entscheidungen).
- Personal-Figuren stehen neben der Station (Wandplätze haben kein „dahinter“); mit echten Sprites in S8 ggf. hinter die Theke.
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
## Nächste Session: S5
Startpunkt: PLAN.md § 3, Abschnitt S5 (Progression: Qualitätsstufen, Café-Level-Belohnungen, Meilensteine, Achievements, Daily Quests, Café-Erweiterung) und GAME_DESIGN §§ 5, 8, 13.
- Qualität: `loc.quality` existiert und wirkt schon auf das Zufriedenheits-Ziel (+4/Stufe); fehlt: `data/quality.ts`, Kauf-Action, `priceMult × 1.5` in `collectModifiers`/Rate-Modell und der Shop-Tab „Qualität“ (`ui/shopPanel.ts`, Platzhalter `quality`).
- `data/unlocks.ts` anlegen; Ambiente und Personal haben schon `unlockCafeLevel`, Marketing `BALANCE.marketing.unlockCafeLevel`.
- Goldene Blätter verdienbar machen (Café-Level ≥ 5) – dann wird der 🍃-Knopf im Marketing-Panel nutzbar.
- Kundentypen-Effekte als Erwartungswert (siehe Offen) passen gut zu S5.
- Fallen: Jede neue UI-Zeichenkette in beide JSONs. Overlay hat `pointer-events: none` – Klickbares braucht `ui-interactive` (Panels haben es schon). Save-Schema-Änderung → `SCHEMA_VERSION` 4 + Migration + Test + alten Schlüssel `mce.save.v3` in `LEGACY_KEYS`. `collectModifiers(state, locationId)` ist jetzt standortbezogen. Der Tick-Äquivalenz-Test braucht einen eingeschwungenen Zustand (Sauberkeit/Zufriedenheit konstant). e2e lokal mit `PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm e2e`; `reloadWithSave` in `tests/e2e/ui.spec.ts` kann jetzt auch `level` setzen.
## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 1`)
Balance-Sim: 1 h, Greedy-Spieler (Stationen, Personal, Ambiente, Marketing), Berlin
| Meilenstein | Zielzeit | Ist |
|---|---|---|
| Erstes Upgrade | < 10 s | 8s |
| Zweite Station (Kasse) | 1–2 min | 1m 30s |
| Erster Personal-Kauf | ~5 min | 2m 32s |
| Erste Reinigungskraft | – | 2m 32s |
| Erste Kampagne | – | — |
| Iced-Bar (Café-Level 3) | 10–15 min | 2m 27s |
| Bäckerei (Café-Level 5) | ~30 min | 9m 44s |
| Café-Level 10 | ~90 min | — |
| Café-Level 15 | – | — |
Ende: Café-Level 8, Münzen 467.90 K, Einkommen/s 10.03 K
Zufriedenheit 76.8, Sauberkeit 60.0, Kampagnen 0, Marketing-Level 15
Personal: cleaner 1, barista 20, socialMedia 8, cashier 1; Ambiente: seats 8, decor 30, wifi 20, music 20
