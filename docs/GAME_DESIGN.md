# Matcha Café Empire – Game Design Document

> Spieldesign und Formeln. Alle Zahlen sind Startwerte für `src/data` und werden per Simulation feinjustiert (S9, Phase 2: S12).
> Phase 2 (2026-10-15, bedientes Café): § 4, § 6, § 7.2, § 7.3 und § 14 sind neu; PLAN.md „Phase 2“ erklärt den Wechsel.
> Code-Bezeichner sind englisch, Spieltexte kommen aus `de.json`/`en.json`.

---

## 1. Fantasy und Ton

Du eröffnest ein kleines Matcha-Café in Berlin und baust daraus ein weltweites Café-Imperium. Ton: warm, ruhig, leicht humorvoll („Lo-fi Café“-Stimmung). Keine Hektik-Timer, keine Strafmechaniken außer sinkender Zufriedenheit. Idle-Prinzip: Es geht immer weiter, auch wenn du nicht da bist.

Kern-Loop (eine Sitzung von 2–10 Minuten):
1. Offline-Einnahmen abholen
2. Stationen upgraden / neue Station kaufen
3. Personal einstellen (Verkäufer, Baristas, Bedienungen, Putzkräfte) – den Engpass der Pipeline beheben, Zufriedenheit prüfen
4. Quest/Achievement abholen, evtl. Boost zünden
5. Weggehen, Café verdient weiter

Meta-Loop (Tage/Wochen): Café-Level steigern → Qualitätsstufen → neuen Standort freischalten → Franchise-Reset für Zen → Meta-Upgrades → schneller durch den nächsten Standort.

---

## 2. Währungen

| Währung | Code | Symbol | Scope | Quelle | Verwendung |
|---|---|---|---|---|---|
| Geld | `coins` | 💵 (grüner Geldschein) | pro Standort | Bezahlte Gäste (inkl. Trinkgeld), Offline | Stationen, Ambiente, Personal, Qualität, Marketing |
| Goldene Blätter | `goldenLeaves` | 🍃 | global | Achievements, Daily Quests, Events, seltene Kunden-Drops, (später: Monetarisierung) | Zeitsprünge, Boosts, Sofort-Fertigstellung, Skins |
| Zen | `zen` | ☯ | global | Franchise-Reset eines Standorts | Meta-Upgrades, Freischaltung von Standorten |

Geld wird als `Decimal` (break_infinity) geführt; der Code-Name bleibt `coins` (Phase 1: „Münzen“, seit 2026-10-15 Geldscheine). Goldene Blätter und Zen bleiben praktisch im `number`-Bereich, werden aber ebenfalls als `Decimal` gespeichert, damit das Save-Schema einheitlich ist.

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
- Berlin: „Kasse“, „Matcha-Station“, „Siebträger“ (Kaffeemaschine), „Eisfach“, „Steinofen“
- Kyoto: „Holzkasse“, „Usucha-Station“, „Kyoto-Röster“, „Kakigori-Fach“, „Wagashi-Ofen“
- Tokio: „Self-Checkout“, „Matcha-Automat“, „Espresso-Roboter“, „Softeis-Fach“, „Mochi-Ofen“
- usw. – Opus darf hier kreativ sein, Mechanik bleibt identisch (Phase 2: Ausstattung statt Stationen).

---

## 4. Theken und Ausstattung (Phase 2: bedientes Café)

> Phase 2 (Vorgabe Vincent, 2026-10-15) ersetzt die acht Verkaufsstationen mit Selbstbedienung durch ein
> **bedientes Café**. Die Kunden-Figuren bleiben kosmetisch; gerechnet wird weiter als Rate (§ 7, § 14).

Drei Theken bilden die **Service-Pipeline**; jede hat Personal (§ 6) und Ausstattung mit Leveln:

| Bereich | Code | Wer arbeitet dort | Ausstattung |
|---|---|---|---|
| Bestelltheke | `order` | Verkäufer nehmen Bestellungen entgegen | Kasse |
| Barista-Theke | `bar` | Baristas bereiten alles zu (Matcha, Kaffee, Kuchen, Kekse …) | eine Ausstattung je Produktlinie |
| Ausgabe | `service` | Bedienungen übergeben an der Theke oder bringen an den Tisch | Ausgabe-Station |

Die Ausstattung ersetzt technisch die Stationen (`StationDef`, `LocationState.stations`, Käufe ×1/×10/×100/Max,
Café-Level = Summe der Level). Werte für Berlin (×1); andere Standorte skalieren Kosten und Preise mit § 3.

| ID | Name (DE) | Bereich | Freischaltung | Basis-Kosten | Wachstum `g` | Basis-Preis/Stück | Arbeitszeit (s) | Anteil der Gäste |
|---|---|---|---|---|---|---|---|---|
| `register` | Kasse | order | Café-Level 1 (Level 0 = Handkasse) | 60 | 1.15 | – | Bestellzeit 2 | – |
| `matchaStation` | Matcha-Station (Schale, Chasen, Kessel) | bar | Start, Level 1 gratis | 10 | 1.14 | 3 | 4 | 100 % |
| `coffeeMachine` | Kaffeemaschine | bar | Café-Level 2 | 400 | 1.16 | 4 | 3 | 45 % |
| `iceBox` | Kühl- & Eisfach | bar | Café-Level 3 | 2 500 | 1.17 | 9 | 5 | 40 % |
| `servingStation` | Ausgabe-Station (Tabletts, Warmhalter) | service | Café-Level 4 | 3 000 | 1.17 | – | – | – |
| `oven` | Ofen | bar | Café-Level 5 | 15 000 | 1.18 | 22 | 6 | 50 % |
| `displayCase` | Kuchenvitrine | bar | Café-Level 7 | 120 000 | 1.19 | 80 | 4 | 35 % |
| `grinder` | Steinmühle | bar | Café-Level 9 (Terrasse ≥ 1) | 1 000 000 | 1.20 | 400 | 20 | 25 % |
| `ceremonySet` | Zeremonie-Set | bar | Café-Level 12 (Terrasse ≥ 1) | 12 000 000 | 1.21 | 3 000 | 60 | 12 % |

**Level-Effekt:** `price(level) = basePrice × level × milestonePriceMult` (wie Phase 1) und
`speed(level) = (1 + (level − 1) × 0.02) × milestoneSpeedMult` ab Level 1 – bessere Geräte arbeiten schneller.
Meilensteine (Level 10, 25, 50, 100, 200, 300, 400, 500, danach alle 100) verdoppeln das Tempo; ab Meilenstein 4
alternierend ×2 Preis. An den ersten vier Meilensteinen (10, 25, 50, 100) bekommt jedes Gerät außerdem ein
edleres Aussehen (fünf Optik-Stufen, rein kosmetisch, UI_STYLE § 4); die Gästetheke wird mit dem Café-Level edler,
die Tische mit ihrer Anzahl. Kasse Level 0 = Handkasse mit Tempo 0.6; Ausgabe-Station Level 0 = Tempo 1 (Bedienungen
arbeiten auch ohne Station, nur langsamer als mit).

**Warenkorb-Modell:** Jeder Gast bestellt das Matcha-Produkt und jede weitere freigeschaltete Linie mit ihrem
„Anteil der Gäste“ (`attachRate`). Dadurch bringt jedes neue Gerät ein neues Produkt auf die Karte und
**erhöht** den durchschnittlichen Bon, statt anderen Linien Kunden wegzunehmen:
```
avgTicket        = Σ_i attach_i × price_i(level_i) × stationPriceMult_i      (nur Linien mit level ≥ 1)
loadPerCustomer  = Σ_i attach_i × workTime_i / speed_i(level_i)               Barista-Sekunden je Gast
```

---

## 5. Ambiente, Erweiterung, Café-Level

### 5.1 Ambiente-Elemente (pro Standort)

| ID | Name | Effekt | Kosten (Berlin, Level 1) | Wachstum | Max-Level |
|---|---|---|---|---|---|
| `seats` | Tische (je Stufe ein Tisch mit zwei Plätzen; sichtbar bis 12 Tische) | +2 Kunden-Kapazität/Level (Spawnrate-Deckel, § 7.1) | 50 | 1.15 | 50 |
| `decor` | Deko (Pflanzen, Lampen, Kunst) | +1 Zufriedenheit/Level (Basis) | 200 | 1.20 | 30 |
| `music` | Musik/Soundsystem | +0.5 % Trinkgeld/Level | 800 | 1.25 | 20 |
| `wifi` | WLAN & Steckdosen | +3 % Spawnrate/Level | 1 500 | 1.25 | 20 |
| `terrace` | Terrasse | Erweitert Grid um 4 Tiles/Level, +5 Kapazität | 25 000 | 2.0 | 3 |

### 5.2 Grid-Erweiterung
Berlin startet mit 10×10 begehbaren Tiles. Terrasse Level 1–3 erweitert auf 12×12, 14×12, 14×14. Neue Stationen ab Café-Level 9 brauchen Terrasse Level 1 (Platz).

### 5.3 Café-Level
`cafeLevel = floor( (Σ aller Stations-Level) / 25 ) + 1`, gedeckelt bei 50. Jedes Café-Level schaltet etwas frei (Station, Ambiente-Element, Personal-Slot, Qualitätsstufe) und gibt eine Einmal-Belohnung (Münzen = 30 s aktuelles Einkommen, ab Level 5 zusätzlich 1–3 Goldene Blätter). Die Freischalt-Tabelle liegt in `data/unlocks.ts`.

---

## 6. Personal und Manager (Phase 2: Köpfe statt Stufen)

Personal wird pro Standort eingestellt. Die vier Service-Rollen zählen als **Anzahl** (jede Kraft arbeitet parallel,
`loc.staff[id]` = Köpfe); Filialleiter und Social-Media-Manager bleiben Stufen-Rollen. Jede Einstellung kostet mehr
(Wachstum 1.5) und ist ab einem Café-Level verfügbar.

| ID | Name | Art | Ab Café-Level | Basis-Kosten | Effekt je Kopf/Stufe | Max | Start |
|---|---|---|---|---|---|---|---|
| `cashier` | Verkäufer | Anzahl | 1 | 100 | ein Bestellplatz: `orderCap = Verkäufer × speed(Kasse) / 2 s` | 20 | 1 |
| `barista` | Barista | Anzahl | 1 | 100 | ein Zubereitungsplatz: `prodCap = Baristas / loadPerCustomer` | 20 | 1 |
| `waiter` | Bedienung | Anzahl | 1 | 150 | eine Bedienung: `serviceCap = Bedienungen × speed(Ausgabe-Station) / Ø Servicezeit` | 20 | 1 |
| `cleaner` | Putzkraft | Anzahl | 2 | 3 500 | putzt 5 Punkte/min × 2 × (1 − Sauberkeit/100) (§ 7.3) | 20 | 0 |
| `manager` | Filialleiter | Stufe | 4 | 10 000 | Offline-Cap +2 h/Stufe (Basis 4 h), Stufe 1 schaltet Auto-Kauf frei | 5 | 0 |
| `socialMedia` | Social-Media-Manager | Stufe | 6 | 20 000 | +5 % Spawnrate, Kampagnen-Abklingzeit −10 % | 15 | 0 |

**Gründungsteam:** Neue Standorte (und jeder Franchise-Reset) starten mit je 1 Verkäufer, Barista und Bedienung
gratis – so läuft die Pipeline vom ersten Tick an, und jede weitere Kraft muss eingestellt werden. Bäcker und
Tee-Meister aus Phase 1 entfallen (Baristas bereiten alles zu); die Migration rechnet ihre Stufen in Baristas um.

Personal ist im Café sichtbar (kosmetisch): Verkäufer hinter der Kasse, Baristas an den Geräten, Bedienungen mit
Tablett zwischen Ausgabe und Tischen, Putzkräfte wischen dreckige Tische.

---

## 7. Kunden-Simulation (Rate-Modell)

Die Ökonomie rechnet in Raten pro Sekunde. Die Phaser-Szene zeigt dazu passende Figuren, hat aber keinen Einfluss auf das Ergebnis.

### 7.1 Spawnrate (Nachfrage)
```
baseSpawn        = 0.25 Kunden/s (Berlin)
capacityCap      = 0.1 × (2 + seats.level × 2 + terrace.level × 5)   // Kunden/s, die das Café „fasst“ (seats = Tische)
spawnMultiplier  = (1 + wifi.level × 0.03)
                 × (1 + marketing.level × 0.05) × campaignBoost
                 × (1 + socialMedia.level × 0.05)
                 × satisfactionFactor                                   // § 7.3
                 × eventSpawnMult × boostSpawnMult × metaSpawnMult
spawnRate        = min(baseSpawn × cafeLevel^0.9 × spawnMultiplier, capacityCap × spawnMultiplier)
```

### 7.2 Durchsatz und Einkommen (Service-Pipeline)
```
orderCap        = cashiers × speed(register) / order.orderTime × speedBoosts               Gäste/s
prodCap         = baristas / loadPerCustomer × speedBoosts                                  Gäste/s (§ 4)
avgServeTime    = (1 − dineInShare) × handoverTime + dineInShare × tableServiceTime         3 s / 6 s, 60 % Sitzgäste
serviceCap      = waiters × speed(servingStation) / avgServeTime × speedBoosts              Gäste/s
totalThroughput = min(orderCap, prodCap, serviceCap)
served          = min(spawnRate, totalThroughput)
bottleneck      = argmin(spawnRate, orderCap, prodCap, serviceCap)   → „Nachfrage“ | „Bestellung“ | „Zubereitung“ | „Ausgabe“
income/s        = served × avgTicket × priceMults        (Umsatz; landet zuerst auf den offenen Bons, s. u.)
priceMults      = qualityMult × (1 + tipRate) × eventMult × boostMult × metaIncomeMult × prestigeMult
tipRate         = satisfaction/100 × 0.15 + music.level × 0.005   (Kundentypen § 7.5)
perStation_i    = served × attach_i          (Bestellungen/s je Produktlinie, für Szene und Statistik)
```
Die UI zeigt die vier Stufen als Balken (Kapazität je Stufe, bedient, Engpass markiert), damit jede
Personal- oder Ausstattungs-Entscheidung erklärbar ist.

**Kasse – Geld kommt erst beim Bezahlen** (Vorgabe Vincent, 2026-10-15; `core/economy/till.ts`, Save v10):
```
till.open     += income/s × dt          // Umsatz der Gäste, die gerade bestellen und bezahlen
till.progress += served × dt            // wie weit der nächste Gast mit dem Bezahlen ist
n = floor(till.progress)                // so viele Gäste haben in diesem Schritt fertig bezahlt
coins         += till.open × n / till.progress ;  till.open −= dieser Betrag ;  till.progress −= n ;  till.paid += n
```
Bei gleichbleibenden Raten zahlt jeder Gast genau den Durchschnittsbon (`income/served`); über die Zeit ist die
Summe dieselbe wie bei laufender Gutschrift, nur um höchstens einen Gast verzögert. Offline-Einnahmen, Zeitsprung,
Tap-Bonus und Belohnungen werden weiter direkt gutgeschrieben. Die Szene zeigt jede gebuchte Zahlung an der Kasse
(der Gast dort bezahlt genau in diesem Moment, neue Gäste kommen rechtzeitig vom Gehweg); bleibt kosmetisch.

### 7.3 Zufriedenheit (0–100)
```
waitPressure  = clamp(spawnRate / max(totalThroughput, ε) − 1, 0, 2)   // >0 = Warteschlange
dirtPerMin    = 2 + served × 60 × 0.03                                   // Schmutz wächst mit den Gästen
cleanPerMin   = cleaners × 5 × 2 × (1 − cleanliness/100)                 // Putzkräfte, effektiver bei Dreck
cleanliness   = 0..100, ändert sich um (cleanPerMin − dirtPerMin)/60 je Sekunde
              → Gleichgewicht c* = 100 × max(0, 1 − dirtPerMin / (10 × cleaners)); ohne Putzkraft → 0
targetSat     = 50 + decor.level × 1 + quality × 4 − waitPressure × 20 + (cleanliness − 70) × 0.3 (+ Zen, + Events)
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
| Tourist | 25 % | Kamera, Hut | +50 % Anteil an der Kuchenvitrine (Phase 2: `attachRate` der Vitrine × (1 + 0.5 × Touristen-Anteil)) |
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
| `heatwave` | Hitzewelle | Kühl-/Eisfach-Produkte ×3 Preis, Spawn ×1.3 | 5 🍃 |
| `influencerVisit` | Influencer-Besuch | Spawn ×2.5 für 2 min, danach Zufriedenheit −10 (Ansturm) | 8 🍃 |
| `supplyShortage` | Lieferengpass | Qualität −1 Stufe für Dauer, oder sofort beheben (Münzen = 5 min Einkommen) | 5 🍃 wenn behoben |
| `foodBlogger` | Food-Blogger | Ofen-Produkte ×3 | 5 🍃 |
| `rainyDay` | Regentag | Spawn ×0.7, Trinkgeld ×2 (Gemütlichkeit) | 3 🍃 |

### 12.2 Kalender-Events (lokale Systemzeit, kein Server)
- `hanami` (20.3.–10.4.): Kirschblüten-Deko, Zufriedenheit +10, Zeremonie-Set ×2
- `summerIced` (Juli–August): Kühl-/Eisfach ×1.5
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
speed(s, level)       = (1 + (level − 1) × equipment.speedPerLevel) × milestoneSpeedMult(level)   (level ≥ 1)
speed(register, 0)    = order.handRegisterSpeed (0.6);  speed(servingStation, 0) = 1
loadPerCustomer       = Σ_i attach_i × workTime_i / speed_i          (Linien mit level ≥ 1)
avgTicket             = Σ_i attach_i × price_i × stationPriceMult_i
orderCap              = cashiers × speed(register) / orderTime × speedBoosts
prodCap               = baristas / loadPerCustomer × speedBoosts
serviceCap            = waiters × speed(servingStation) / avgServeTime × speedBoosts
totalThroughput       = min(orderCap, prodCap, serviceCap)
spawnRate             = siehe § 7.1 (Kapazität aus Tischen = `seats`)
served                = min(spawnRate, totalThroughput)
income/s              = served × avgTicket × priceMults
dirtPerMin            = cleanliness.decayPerMin + served × 60 × dirtPerCustomer
cleanPerMin           = cleaners × cleanPerCleanerPerMin × dirtFactor × (1 − cleanliness/100)
offlineIncome         = income/s × min(elapsed, offlineCap) × offlineEfficiency
offlineCap            = 4 h + manager.level × 2 h                     (max 14 h)
offlineEfficiency     = 0.5 + offlineEfficiency.level × 0.05          (max 1.0)
cafeLevel             = Stufen-Tabelle BALANCE.cafeLevel.steps über Σ stationLevels (S9)
zenGain               = floor(1.8 × sqrt(earnedThisRun / (1e6 × locationScale)) × (1 + prestigeCount × 0.1))
tapIncome             = income/s × 0.5 × (1 + tapPower.level × 0.5)
```
Alle Multiplikatoren werden in `core/economy/modifiers.ts` zentral gesammelt (`collectModifiers(state) → Modifiers`), damit Events, Boosts, Meta und Personal nicht verstreut multipliziert werden.

---

## 15. Balancing-Richtwerte (für `scripts/balance-sim.ts`, Greedy-Spieler, aktive Zeit)

| Meilenstein | Zielzeit |
|---|---|
| Erstes Upgrade | < 10 s |
| Zweite Station (Kasse) | 1–2 min |
| Kühl-/Eisfach freigeschaltet (Café-Level 3) | 10–15 min |
| Erster Personal-Kauf | ~5 min |
| Ofen (Café-Level 5) | ~30 min |
| Café-Level 10 | ~90 min |
| Erster Franchise-Reset sinnvoll | ~3 h |
| Kyoto freigeschaltet | 3–4 h |
| Alle 6 Standorte | 40–60 h gestreckt über ~2–3 Wochen Idle |
| Offline-Rückkehr nach 8 h | Einnahmen ≈ 1–2 große Käufe wert, kein „alles kaufen“ |

Idle-Anteil: Nach 1 h Spielzeit soll Offline-Einkommen pro Nacht etwa 20–30 % des Tagesfortschritts eines aktiven Spielers ausmachen.

---

## 16. UI-Screens

1. **Café-Ansicht** (Phaser) + **HUD** (DOM): Münzen, Einkommen/s, 🍃, Zufriedenheit, Standort, Boost-Timer, Event-Banner
2. **Stations-Panel** (Bottom-Sheet): Ausstattung mit Bereich, Produkt, Preis, Arbeitszeit, Einkommen, Auslastung der Stufe, Kosten, x1/x10/x100/Max, Meilenstein-Vorschau, Personal-Hinweis
3. **Shop-Übersicht**: Tabs Stationen / Ambiente / Qualität
4. **Personal**: Pipeline-Karte (vier Stufen mit Kapazität, bedient, Engpass), Liste mit Köpfen/Stufen und Effekt-Erklärung, einstellen
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
