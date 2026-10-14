# STATUS
## Loop
state: running
current: S1
branch: session/s1-core
started: 2026-10-14T19:36:14Z
next: S1
## Letzte Session: S1 – Core-Ökonomie (2026-10-14)
## Fertig
- `src/data`: `stations.ts` (8 Stationen), `locations.ts` (6 Standorte inkl. Skalierung), `balance.ts` (alle Konstanten)
- `core/GameState.ts`: Zustand nach PLAN § 2.4, `createInitialState`, `SCHEMA_VERSION = 1`
- `core/economy`: Kostenformel (geometrisch, Bulk x1/x10/x100/max), Meilensteine, Preis, Durchsatz, Kasse, Café-Level, `buyStation`, `collectModifiers`, Offline (`applyOffline`, Cap, Effizienz)
- `core/customers/rates.ts`: Spawnrate, Durchsatz, Einkommen/s, Zufriedenheit samt Einzelbeiträgen
- `core/GameLoop.ts`: `tick(state, dtMs)` (pur), `runFrame` mit festem 100-ms-Tick, max. 1000 Ticks/Frame, Rest als Offline-Lump
- `core/save`: serialize/deserialize (Decimal als String), Migrationen (v0→v1), Storage-Adapter über `StorageLike`, Export/Import, `loadWithOffline`
- `core/math`: Decimal-Wrapper, `formatNumber` (K M B T aa…, DE/EN, short/scientific), `formatDuration`
- `scripts/balance-sim.ts`: Greedy-Spieler (kürzeste Amortisation), `--hours N`
- 73 Tests grün, Coverage `core` ≈ 99 % Lines (`pnpm coverage`, Schwelle 90 %); i18n-Keys für Berliner Stationsnamen
## Offen / bekannte Bugs
- Balancing ist noch nicht auf die Zielzeiten abgestimmt (Tabelle unten); gehört zu S9. Auffällig: Café-Level 10 wird in 2 h nicht erreicht, die Kasse wird vom Greedy-Spieler nie gekauft (Handkasse-Baseline 0.3/s reicht lange).
- Gebäudereinigung/Sauberkeit gibt es noch nicht; Zufriedenheit nutzt fest `cleanlinessDefault` (S4).
- Personal-Tempo (`staffSpeedMult`) ist 1 bis S4; Kundentypen (§ 7.5), Tap-Bonus (§ 7.4) und Meta-Multiplikatoren fehlen noch.
- IndexedDB-Backup (PLAN § 2.3) und Autosave-Verdrahtung kommen mit dem UI (S3); `core` bietet `saveGame`/`loadWithOffline`.
- GitHub Pages muss einmalig aktiviert werden (Settings → Pages → Source: GitHub Actions), das kann nur Vincent.
- PWA-Icon ist nur ein SVG-Platzhalter (PNG 192/512 in S8/S9). e2e läuft noch nicht in CI (Pflicht ab S3).
## Entscheidungen, die vom Plan abweichen
- Neue Dev-Abhängigkeit `@vitest/coverage-v8` – nötig, um das Abnahmekriterium „Coverage core ≥ 90 %“ zu messen.
- Kasse auf Level 0 liefert `checkout.baselineThroughput` (0.3/s) statt 0, sonst wäre der Start ohne Kauf blockiert (GAME_DESIGN lässt das offen).
- `ActiveEvent`/`ActiveBoost.until` sind in `playtimeSec` gemessen (monoton), nicht in Wanduhrzeit.
- `startCoins = 5`, damit das erste Upgrade (10.7 ¤) in unter 10 s möglich ist.
- Meilensteine ab Nr. 4: gerade Nummer = Preis ×2, ungerade = Tempo ×2 (Nr. 1–3 sind Tempo).
- `core` greift nie auf `localStorage` zu; der Adapter bekommt ein `StorageLike` übergeben.
- Zusätzlich zu den Berlin-Daten liegen alle 6 Standorte mit Skalierung in `data/locations.ts`; Stationsmechanik ist für alle gleich.
- v0-Save-Format ist ein erfundenes Ur-Format (flach, ein Café), nur um die Migrationskette zu testen.
## Nächste Session: S2
Startpunkt: PLAN.md § 3, Abschnitt S2 (Iso-Szene und Kunden). Szene liest `GameState` (z. B. `computeLocationRates` für Kundenzahl/Spawn), schreibt nie direkt. `runFrame(state, acc, frameMs)` ist der Einstieg für den Game-Loop; es gibt noch keinen Store, der den State hält (in S2/S3 anlegen, keine Singletons in `core`).
Fallen: Kunden-Figuren rein kosmetisch (Anzahl aus `perStation`/`served`); Decimal nie in `number` umwandeln außer für Anzeige; Save-Schema-Änderung = `schemaVersion` hoch + Migration + Test.
## Balancing-Snapshot (Sim-Ausgabe, `pnpm sim --hours 2`)
> tsx scripts/balance-sim.ts --hours 2

Balance-Sim: 2 h, Greedy-Spieler, Berlin
| Meilenstein | Zielzeit | Ist |
|---|---|---|
| Erstes Upgrade | < 10 s | 8s |
| Zweite Station (Kasse) | 1–2 min | — |
