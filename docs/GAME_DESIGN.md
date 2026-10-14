# Matcha Café Empire – Game Design Document

> Spieldesign und Formeln. Alle Zahlen sind Startwerte für `src/data` und werden in Session S9 per Simulation feinjustiert.
> Code-Bezeichner sind englisch, Spieltexte kommen aus `de.json`/`en.json`.

---

## 1. Fantasy und Ton

Du eröffnest ein kleines Matcha-Café in Berlin und baust daraus ein weltweites Café-Imperium. Ton: warm, ruhig, leicht humorvoll („Lo-fi Café“-Stimmung). Keine Hektik-Timer, keine Strafmechaniken außer sinkender Zufriedenheit. Idle-Prinzip: Es geht immer weiter, auch wenn du nicht da bist.

Kern-Loop (eine Sitzung von 2–10 Minuten):
1. Offline-Einnahmen abholen
2. Stationen upgraden / neue Station kaufen
3. Personal einstellen, Zufriedenheit prüfen
4. Quest/Achievement abholen, evtl. Boost zünden
5. Weggehen, Café verdient weiter

Meta-Loop (Tage/Wochen): Café-Level steigern → Qualitätsstufen → neuen Standort freischalten → Franchise-Reset für Zen → Meta-Upgrades → schneller durch den nächsten Standort.

---

## 2. Währungen

| Währung | Code | Symbol | Scope | Quelle | Verwendung |
|---|---|---|---|---|---|
| Münzen | `coins` | ¤ (Pixel-Münze) | pro Standort | Verkäufe, Trinkgeld, Offline | Stationen, Ambiente, Personal, Qualität, Marketing |
| Goldene Blätter | `goldenLeaves` | 🍃 | global | Achievements, Daily Quests, Events, seltene Kunden-Drops, (später: Monetarisierung) | Zeitsprünge, Boosts, Sofort-Fertigstellung, Skins |
| Zen | `zen` | ☯ | global | Franchise-Reset eines Standorts | Meta-Upgrades, Freischaltung von Standorten |

Münzen werden als `Decimal` (break_infinity) geführt. Goldene Blätter und Zen bleiben praktisch im `number`-Bereich, werden aber ebenfalls als `Decimal` gespeichert, damit das Save-Schema einheitlich ist.

---

## 3. Standorte

Jeder Standort hat eigene Münzen, eigene Stations-Varianten (gleiche Mechanik, andere Namen, Preise und Optik) und einen eigenen Grid-Layout. Alle freigeschalteten Standorte produzieren gleichzeitig.

| # | ID | Name | Thema / Optik | Freischaltung | Einkommens-Skalierung (Preis-Multiplikator aller Stationen) |
|---|---|---|---|---|---|
| 1 | `berlin` | Kiez-Café Berlin | Altbau, Backstein, Fahrräder vorm Fenster | Start | ×1 |
| 2 | `kyoto` | Teehaus Kyoto | Holz, Tatami, Garten, Kirschblüte | Berlin Café-Level 15 + 10 Zen | ×25 |
| 3 | `tokyo` | Flagship Shibuya | Neon, Glas, Automaten, Nacht | Kyoto Café-Level 15 + 50 Zen | ×600 |
| 4 | `seoul` | Rooftop Seoul | Dachterrasse, Skyline, Lichterketten | Tokio Café-Level 15 + 250 Zen | ×15 000 |
| 5 | `newyork` | Loft New York | Industrial, Hochregale, Taxis | Seoul Café-Level 15 + 1 200 Zen | ×400 000 |
| 6 | `bali` | Beach Club Bali | Bambus, Strand, Sonnenuntergang | New York Café-Level 15 + 6 000 Zen | ×1e7 |

Standort-spezifische Stations-Namen (Beispiele für die i18n-Keys `station.<loc>.<id>.name`):
- Berlin: „Matcha-Bar“, „Späti-Fenster“ (To-go), „Bäckerei“ (Matcha-Croissant)
- Kyoto: „Usucha-Tresen“, „Wagashi-Küche“, „Teezeremonie-Raum“
- Tokio: „Automaten-Wand“, „Matcha-Softeis“, „Merch-Kapsel“
- usw. – Opus darf hier kreativ sein, Mechanik bleibt identisch.

---

## 4. Verkaufsstationen

Stationen erzeugen Durchsatz (Kunden/s) und Preis pro Kunde. Pro Standort gibt es 8 Verkaufsstationen. Werte für Berlin (×1); andere Standorte skalieren Kosten und Preise mit dem Multiplikator aus § 3.

| ID | Name (DE) | Freischaltung | Basis-Kosten | Kosten-Wachstum `g` | Basis-Preis/Kunde | Service-Zeit (s) | Parallel-Plätze | Zuständiges Personal |
|---|---|---|---|---|---|---|---|---|
| `matchaBar` | Matcha-Bar (Latte) | Start, Level 1 gratis | 10 | 1.07 | 3 | 4 | 1 | Barista |
| `checkout` | Kasse | Café-Level 1 | 60 | 1.08 | – (erhöht Durchsatz aller) | 2 | 1 | Kassierer |
| `togoWindow` | To-go-Fenster | Café-Level 2 | 400 | 1.09 | 4 | 3 | 1 | Barista |
| `icedBar` | Iced-Matcha-Bar | Café-Level 3 | 2 500 | 1.10 | 9 | 5 | 1 | Barista |
| `bakery` | Bäckerei | Café-Level 5 | 15 000 | 1.11 | 22 | 6 | 1 | Bäcker |
| `merchShelf` | Merch-Regal | Café-Level 7 | 120 000 | 1.12 | 80 | 8 | 1 | Kassierer |
| `ceremonyCorner` | Zeremonie-Ecke | Café-Level 9 | 1 000 000 | 1.13 | 400 | 20 | 1 | Tee-Meister |
| `workshopRoom` | Workshop-Raum | Café-Level 12 | 12 000 000 | 1.14 | 3 000 | 60 | 1 | Tee-Meister |

**Level-Effekt:** Jedes Level erhöht den Preis/Kunde linear: `price(level) = basePrice × level`. Meilensteine (Level 10, 25, 50, 100, 200, 300, 400, 500, danach alle 100) verdoppeln die Service-Geschwindigkeit der Station. Ab Meilenstein 4 (Level 100) alternierend ×2 Preis statt ×2 Tempo, damit beides wächst.

**Kasse** ist ein Engpass-Multiplikator: Gesamt-Durchsatz des Cafés = `min(Σ Station-Durchsatz, checkoutThroughput)`. `checkoutThroughput = 0.5 × level^0.8 × checkoutMultipliers` Kunden/s. So bleibt die Kasse relevant, ohne dass sie das Spiel blockiert.

---

## 5. Ambiente, Erweiterung, Café-Level

### 5.1 Ambiente-Elemente (pro Standort)

| ID | Name | Effekt | Kosten (Berlin, Level 1) | Wachstum | Max-Level |
|---|---|---|---|---|---|
| `seats` | Sitzbereich | +2 Kunden-Kapazität/Level (Spawnrate-Deckel, § 7.1) | 50 | 1.15 | 50 |
| `decor` | Deko (Pflanzen, Lampen, Kunst) | +1 Zufriedenheit/Level (Basis) | 200 | 1.20 | 30 |
| `music` | Musik/Soundsystem | +0.5 % Trinkgeld/Level | 800 | 1.25 | 20 |
| `wifi` | WLAN & Steckdosen | +3 % Spawnrate/Level | 1 500 | 1.25 | 20 |
| `terrace` | Terrasse | Erweitert Grid um 4 Tiles/Level, +5 Kapazität | 25 000 | 2.0 | 3 |

### 5.2 Grid-Erweiterung
Berlin startet mit 10×10 begehbaren Tiles. Terrasse Level 1–3 erweitert auf 12×12, 14×12, 14×14. Neue Stationen ab Café-Level 9 brauchen Terrasse Level 1 (Platz).

### 5.3 Café-Level
`cafeLevel = floor( (Σ aller Stations-Level) / 25 ) + 1`, gedeckelt bei 50. Jedes Café-Level schaltet etwas frei (Station, Ambiente-Element, Personal-Slot, Qualitätsstufe) und gibt eine Einmal-Belohnung (Münzen = 30 s aktuelles Einkommen, ab Level 5 zusätzlich 1–3 Goldene Blätter). Die Freischalt-Tabelle liegt in `data/unlocks.ts`.

---

## 6. Personal und Manager

Personal wird pro Standort eingestellt, in Stufen (Level). Jede Stufe kostet mehr (Wachstum 1.5) und ist ab einem Café-Level verfügbar.

| ID | Name | Ab Café-Level | Basis-Kosten | Effekt pro Stufe | Max |
|---|---|---|---|---|---|
| `barista` | Barista | 1 | 100 | +15 % Service-Tempo an Bar-Stationen (`matchaBar`, `togoWindow`, `icedBar`) | 20 |
| `cashier` | Kassierer | 2 | 300 | +20 % Kassen-Durchsatz, +10 % Merch-Tempo | 20 |
| `cleaner` | Reinigungskraft | 3 | 500 | Sauberkeits-Verfall −25 %, Stufe 1 stoppt den Verfall auf 60 % Mindestwert | 10 |
| `baker` | Bäcker | 5 | 5 000 | +15 % Bäckerei-Tempo | 20 |
| `teaMaster` | Tee-Meister | 9 | 200 000 | +15 % Tempo Zeremonie/Workshop, +2 Zufriedenheit | 20 |
| `socialMedia` | Social-Media-Manager | 6 | 20 000 | +5 % Spawnrate, Kampagnen-Abklingzeit −10 % | 15 |
| `manager` | Filialleiter | 4 | 10 000 | Offline-Cap +2 h/Stufe (Basis 4 h), Stufe 1 schaltet Auto-Kauf-Toggle „günstigste Station upgraden“ frei (nur wenn Spieler es aktiviert) | 5 |

Personal ist im Café sichtbar (kosmetisch): Barista hinter der Bar, Reinigungskraft wischt zwischen Tischen, usw.

---

## 7. Kunden-Simulation (Rate-Modell)

Die Ökonomie rechnet in Raten pro Sekunde. Die Phaser-Szene zeigt dazu passende Figuren, hat aber keinen Einfluss auf das Ergebnis.

### 7.1 Spawnrate (Nachfrage)
```
baseSpawn        = 0.25 Kunden/s (Berlin)
capacityCap      = 0.1 × (2 + seats.level × 2 + terrace.level × 5)   // Kunden/s, die das Café „fasst“
spawnMultiplier  = (1 + wifi.level × 0.03)
                 × (1 + marketing.level × 0.05) × campaignBoost
                 × (1 + socialMedia.level × 0.05)
                 × satisfactionFactor                                   // § 7.3
                 × eventSpawnMult × boostSpawnMult × metaSpawnMult
spawnRate        = min(baseSpawn × cafeLevel^0.9 × spawnMultiplier, capacityCap × spawnMultiplier)
```

### 7.2 Durchsatz und Einkommen
```
stationThroughput(s) = s.parallel × s.milestoneSpeedMult × staffSpeedMult(s) / s.serviceTime   // Kunden/s
totalThroughput      = min( Σ stationThroughput, checkoutThroughput )
served               = min( spawnRate, totalThroughput )
```
Die bedienten Kunden werden anteilig auf die Stationen verteilt (gewichtet nach `stationThroughput`), damit teure Stationen mehr vom Kuchen bekommen, wenn sie schneller sind:
```
share(s)   = stationThroughput(s) / Σ stationThroughput
income/s   = Σ_s  served × share(s) × price(s) × priceMults
priceMults = qualityMult × (1 + tipRate) × eventMult × boostMult × metaIncomeMult × prestigeMult
tipRate    = satisfaction/100 × 0.15 + music.level × 0.005
```

### 7.3 Zufriedenheit (0–100)
```
waitPressure  = clamp(spawnRate / max(totalThroughput, ε) − 1, 0, 2)   // >0 = Warteschlange
cleanliness   = 0..100, fällt pro Minute um 2 × (1 − cleaner.level × 0.25), min 60 % ab cleaner ≥ 1; steigt +5/min bei cleaner ≥ 3
targetSat     = 50 + decor.level × 1 + quality × 4 + teaMaster.level × 2 − waitPressure × 20 + (cleanliness − 70) × 0.3
satisfaction  → bewegt sich pro Sekunde um 2 % der Differenz zu targetSat (sanfte Angleichung)
satisfactionFactor = 0.5 + satisfaction / 100          // 0.5 … 1.5
```
UI zeigt die Einzelbeiträge (Deko +12, Wartezeit −18 …), damit die Entscheidung erklärbar ist.

### 7.4 Tap-Bonus („Barista anfeuern“)
Jeder Tap auf das Café gibt `+0.5 s` Einkommen sofort (gedeckelt auf 10 Taps/s) und füllt einen „Hype“-Balken; voll (30 Taps) → 10 s lang ×2 Spawnrate. Meta-Upgrade erhöht Tap-Wert. Zweck: aktives Spielen belohnen, ohne es zu erzwingen.

### 7.5 Kundentypen (kosmetisch + kleine Effekte)

| Typ | Anteil | Sichtbares | Effekt |
|---|---|---|---|
| Student | 40 % | Rucksack, Laptop | neutral |
| Tourist | 25 % | Kamera, Hut | +50 % Chance auf Merch-Kauf (Verteilung) |
| Stammgast | 20 % | wiederkehrendes Sprite | +10 % Trinkgeld |
| Influencer | 10 % | Handy, Ringlicht | löst 5 s „Hype“ aus (×1.5 Spawn), 1 % Chance auf 1 Goldenes Blatt |
| Kritiker | 5 % | Notizbuch | Zufriedenheit zählt doppelt beim Trinkgeld (positiv wie negativ) |

Anteile verschieben sich pro Standort (Kyoto: mehr Touristen, Tokio: mehr Influencer).

---

## 8. Matcha-Qualitätsstufen

Global pro Standort kaufbar, mit Münzen. Jede Stufe: `priceMult × 1.5`, `+4 Zufriedenheit` (Ziel), schaltet neue Produktnamen an Stationen frei (nur Text/Icon, z. B. „Matcha-Latte“ → „Ceremonial Latte“).

| Stufe | Name | Ab Café-Level | Kosten (Berlin) |
|---|---|---|---|
| 0 | Culinary Grade | Start | – |
| 1 | Café Grade | 3 | 5 000 |
| 2 | Premium Grade | 6 | 150 000 |
| 3 | Ceremonial Grade | 10 | 8 000 000 |
| 4 | Ceremonial Reserve | 14 | 500 000 000 |
| 5 | Meister-Auslese | 18 | 4e10 |
| 6 | Uji First Flush | 24 | 5e12 |

---

## 9. Marketing

- **Kampagnen-Level** (permanent, Münzen, Wachstum 1.6, max 30): +5 % Spawnrate/Level.
- **Aktive Kampagne** (Münzen = 2 Minuten aktuelles Einkommen): ×2 Spawnrate für 10 Minuten, danach 30 Minuten Abklingzeit (−10 % pro Social-Media-Stufe). Goldene Blätter können die Abklingzeit sofort beenden (3 🍃).
- Visuell: Plakat vorm Café, Kunden-Strom sichtbar dichter.

---

## 10. Goldene Blätter (Premium, nur spielintern)

**Quellen (Richtwert ~15–25 🍃 pro aktiver Spielstunde in der Frühphase, später weniger pro Stunde, mehr pro Ereignis):**
- Achievements: 2–25 🍃 je nach Stufe
- Daily Quests: 3 × 3 🍃, Bonus 5 🍃 für alle drei
- Café-Level-Up ab Level 5: 1–3 🍃
- Influencer-Drop: 1 % pro Influencer-Kunde (gedeckelt 10/Tag)
- Events: 5–20 🍃 bei Abschluss
- No-op-Monetarisierung: alle 20 Minuten aktiver Spielzeit ein „Gratis-Boost“-Button (ersetzt Rewarded Ad)

**Ausgaben:**

| Angebot | Kosten | Effekt |
|---|---|---|
| Zeitsprung 1 h / 4 h / 8 h | 5 / 15 / 25 🍃 | Einkommen der Zeit sofort (zu 100 %, nicht Offline-Effizienz) |
| Boost ×2 Einkommen 30 min | 8 🍃 | stapelt nicht mit sich selbst, verlängert |
| Kampagnen-Abklingzeit beenden | 3 🍃 | sofort |
| Sofort-Fertigstellung Quest | 4 🍃 | Quest als erledigt |
| Skins (v1: 2 Beispiele, z. B. „Sakura-Bar“, „Neon-Kasse“) | 30 🍃 | kosmetisch |

Abstürze, Erstattungen und Käufe mit echtem Geld sind nicht Teil von v1; das Interface `MonetizationProvider` ist der einzige Einstiegspunkt dafür.

---

## 11. Prestige: Franchise-Reset und Zen

### 11.1 Reset
Pro Standort ab Café-Level 10 verfügbar. Setzt `LocationState` auf Anfang (Stationen, Ambiente, Personal, Qualität, Marketing, Münzen). Bleibt erhalten: `meta` (Zen, Goldene Blätter, Achievements, Meta-Upgrades, freigeschaltete Standorte) und `prestigeCount` des Standorts.

### 11.2 Zen-Formel
```
zenGain = floor( 3 × sqrt( earnedThisRun / (1e6 × locationScale) ) × (1 + prestigeCount × 0.1) )
```
`locationScale` = Einkommens-Skalierung aus § 3, damit jeder Standort ähnliche Zen-Mengen liefert. Dialog zeigt Vorschau. Richtwert: erster Reset in Berlin nach ~3 h aktiver Zeit gibt ~20–30 Zen.

### 11.3 Meta-Upgrades (Zen)

| ID | Effekt pro Stufe | Kosten Stufe 1 | Wachstum | Max |
|---|---|---|---|---|
| `globalIncome` | +10 % Einkommen alle Standorte | 5 | 1.5 | 50 |
| `startCapital` | Start-Münzen nach Reset = 10 min Einkommen des Vor-Runs × Stufe | 10 | 2.0 | 5 |
| `offlineEfficiency` | +5 % Offline-Effizienz (Basis 50 %, max 100 %) | 8 | 1.4 | 10 |
| `discount` | −2 % alle Kosten | 12 | 1.6 | 15 |
| `tapPower` | Tap-Wert +50 % | 6 | 1.5 | 10 |
| `fastStart` | Erste N Stationen nach Reset sofort Level 10 | 25 | 2.5 | 4 |
| `satisfactionBase` | +2 Basis-Zufriedenheit | 10 | 1.5 | 10 |

`prestigeMult` in § 7.2 = `1 + globalIncome.level × 0.1`.

---

## 12. Events und Boosts

### 12.1 Zufalls-Events (Seed-basiert, alle 20–45 min aktive Spielzeit eins, Dauer 3–10 min)

| ID | Name | Effekt | Abschluss-Belohnung |
|---|---|---|---|
| `heatwave` | Hitzewelle | Iced-Bar ×3 Preis, Spawn ×1.3 | 5 🍃 |
| `influencerVisit` | Influencer-Besuch | Spawn ×2.5 für 2 min, danach Zufriedenheit −10 (Ansturm) | 8 🍃 |
| `supplyShortage` | Lieferengpass | Qualität −1 Stufe für Dauer, oder sofort beheben (Münzen = 5 min Einkommen) | 5 🍃 wenn behoben |
| `foodBlogger` | Food-Blogger | Bäckerei ×3 | 5 🍃 |
| `rainyDay` | Regentag | Spawn ×0.7, Trinkgeld ×2 (Gemütlichkeit) | 3 🍃 |

### 12.2 Kalender-Events (lokale Systemzeit, kein Server)
- `hanami` (20.3.–10.4.): Kirschblüten-Deko, Zufriedenheit +10, Zeremonie ×2
- `summerIced` (Juli–August): Iced ×1.5
- `newYear` (31.12.–2.1.): alle Preise ×2
Kalender-Events sind rein lokal und bewusst ohne Serverzeit; Manipulation durch Uhr-Umstellen wird akzeptiert.

### 12.3 Boost-Stacking
Boost-Typen: `income`, `spawn`, `speed`. Gleicher Typ aus gleicher Quelle verlängert statt zu stapeln. Verschiedene Quellen (Event, Blätter-Boost, Hype) multiplizieren sich. Maximaler Gesamt-Multiplikator pro Typ: ×12 (Schutz vor Exploits).

---

## 13. Achievements und Quests

### 13.1 Achievements (~40, Beispiele)
Kategorien mit je 3–5 Stufen: Lifetime-Münzen (1 K … 1e15), Kunden bedient, Stations-Level (eine Station auf 25/50/100/200), alle Stationen gekauft, Zufriedenheit 90+ für 10 min, Personal max, erster Reset, 5 Resets, alle Standorte, 100 Taps/Hype 10×, Events abgeschlossen, Spielzeit (1 h, 10 h, 100 h). Belohnung 2–25 🍃. Geheime (3 Stück): z. B. „Nachtschicht“ (zwischen 2 und 4 Uhr spielen).

### 13.2 Daily Quests
3 pro Tag, Reset lokale Mitternacht, aus Pool gezogen (Seed = Datum): „Bediene 500 Kunden“, „Kaufe 20 Level“, „Erreiche 80 Zufriedenheit“, „Starte eine Kampagne“, „Beende ein Event“, „Tippe 100×“. Je 3 🍃, alle drei +5 🍃. Nicht nachholbar.

---

## 14. Formel-Sammlung (Referenz für `core`)

```
cost(level→level+n)   = base × g^level × (g^n − 1) / (g − 1) × (1 − discount)
price(s, level)       = s.basePrice × level × locationScale × milestonePriceMult(level)
milestoneSpeedMult    = 2^(Anzahl Tempo-Meilensteine ≤ level)
milestonePriceMult    = 2^(Anzahl Preis-Meilensteine ≤ level)
stationThroughput(s)  = s.parallel × milestoneSpeedMult × staffSpeedMult / s.serviceTime
checkoutThroughput    = 0.5 × checkout.level^0.8 × (1 + cashier.level × 0.2) × speedBoosts
totalThroughput       = min(Σ stationThroughput, checkoutThroughput)
spawnRate             = siehe § 7.1
served                = min(spawnRate, totalThroughput)
income/s              = Σ served × share(s) × price(s) × priceMults
offlineIncome         = income/s × min(elapsed, offlineCap) × offlineEfficiency
offlineCap            = 4 h + manager.level × 2 h                     (max 14 h)
offlineEfficiency     = 0.5 + offlineEfficiency.level × 0.05          (max 1.0)
cafeLevel             = min(50, floor(Σ stationLevels / 25) + 1)
zenGain               = floor(3 × sqrt(earnedThisRun / (1e6 × locationScale)) × (1 + prestigeCount × 0.1))
tapIncome             = income/s × 0.5 × (1 + tapPower.level × 0.5)
```
Alle Multiplikatoren werden in `core/economy/modifiers.ts` zentral gesammelt (`collectModifiers(state) → Modifiers`), damit Events, Boosts, Meta und Personal nicht verstreut multipliziert werden.

---

## 15. Balancing-Richtwerte (für `scripts/balance-sim.ts`, Greedy-Spieler, aktive Zeit)

| Meilenstein | Zielzeit |
|---|---|
| Erstes Upgrade | < 10 s |
| Zweite Station (Kasse) | 1–2 min |
| Iced-Bar freigeschaltet (Café-Level 3) | 10–15 min |
| Erster Personal-Kauf | ~5 min |
| Bäckerei (Café-Level 5) | ~30 min |
| Café-Level 10 | ~90 min |
| Erster Franchise-Reset sinnvoll | ~3 h |
| Kyoto freigeschaltet | 3–4 h |
| Alle 6 Standorte | 40–60 h gestreckt über ~2–3 Wochen Idle |
| Offline-Rückkehr nach 8 h | Einnahmen ≈ 1–2 große Käufe wert, kein „alles kaufen“ |

Idle-Anteil: Nach 1 h Spielzeit soll Offline-Einkommen pro Nacht etwa 20–30 % des Tagesfortschritts eines aktiven Spielers ausmachen.

---

## 16. UI-Screens

1. **Café-Ansicht** (Phaser) + **HUD** (DOM): Münzen, Einkommen/s, 🍃, Zufriedenheit, Standort, Boost-Timer, Event-Banner
2. **Stations-Panel** (Bottom-Sheet): Level, Preis, Einkommen, Kosten, x1/x10/x100/Max, Meilenstein-Vorschau, Personal-Hinweis
3. **Shop-Übersicht**: Tabs Stationen / Ambiente / Qualität
4. **Personal**: Liste mit Effekt-Erklärung, Stufe kaufen
5. **Marketing**: Kampagnen-Level, aktive Kampagne, Abklingzeit
6. **Standorte**: Karte/Liste, Fortschritt, Freischalt-Bedingungen, Wechseln, Reset-Button je Standort
7. **Zen-Shop** (Meta-Upgrades)
8. **Blätter-Shop** (Zeitsprung, Boosts, Skins)
9. **Achievements / Quests / Statistik** (ein Screen, drei Tabs)
10. **Settings**: Sprache, Audio, Zahlenformat, Export/Import, Löschen, Lizenzen, Version
11. **Dialoge**: Offline-Einnahmen, Reset-Bestätigung, Event-Start/-Ende, Tutorial-Schritte, Fehler/Backup

---

## 17. i18n-Konventionen

- Keys: `hud.coins`, `station.berlin.matchaBar.name`, `station.berlin.matchaBar.desc`, `staff.barista.name`, `staff.barista.effect`, `ui.buy.x10`, `dialog.offline.title`, `event.heatwave.name` …
- Platzhalter `{amount}`, `{time}`, `{count}`; Plural via `Intl.PluralRules` mit Suffix-Keys `.one`/`.other`.
- Zahlen: `formatNumber()` nutzt in beiden Sprachen dieselben Kurz-Suffixe `K/M/B/T/aa…`, nur der Dezimaltrenner ist lokal (DE `1,23 M`, EN `1.23 M`). So bleiben Zahlen zwischen Sprachen vergleichbar.
- Zeitangaben: `3 h 12 min` / `3h 12m` je Sprache.
- Test: `de.json` und `en.json` haben identische Key-Mengen; kein Key ungenutzt (Lint-Skript).

---

## 18. Save-Schema v1 (Beispiel, gekürzt)

```json
{
  "schemaVersion": 1,
  "createdAt": 1760400000000,
  "lastSavedAt": 1760403600000,
  "playtimeSec": 3600,
  "settings": { "lang": "de", "sfx": true, "music": true, "numberFormat": "short" },
  "meta": {
    "goldenLeaves": "12",
    "zen": "0",
    "metaUpgrades": {},
    "achievements": { "coins_1k": { "unlockedAt": 1760400100000 } },
    "lifetimeEarned": "1.2345e6",
    "unlockedLocations": ["berlin"]
  },
  "activeLocationId": "berlin",
  "locations": {
    "berlin": {
      "coins": "4521.3",
      "earnedThisRun": "1.2345e6",
      "level": 4,
      "stations": { "matchaBar": { "level": 37, "unlocked": true }, "checkout": { "level": 12, "unlocked": true } },
      "ambience": { "seats": 5, "decor": 2 },
      "staff": { "barista": 2, "cashier": 1 },
      "quality": 1,
      "satisfaction": 71.4,
      "marketing": { "level": 1 },
      "prestigeCount": 0
    }
  },
  "activeEvents": [],
  "boosts": [],
  "quests": { "date": "2026-10-14", "items": [] }
}
```
Decimal-Werte werden als String gespeichert. Jede Schema-Änderung = neue Version + Migration + Test.
