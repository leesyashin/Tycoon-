# Matcha Café Empire – Game Design Document

> Spieldesign und Formeln. Alle Zahlen sind Startwerte für `src/data` und werden per Simulation feinjustiert (S9, Phase 2: S12, Phase 3: `pnpm sim` über die Spieluhr).
> Phase 2 (2026-10-15, bedientes Café): § 4, § 6, § 7.2, § 7.3 und § 14 sind neu; PLAN.md „Phase 2“ erklärt den Wechsel.
> Phase 3 (2026-10-16, realistisches Café): Spieluhr mit Tag, Nacht und Öffnungszeiten (1 Spielstunde = 1 Minute), Euro-Preise
> (ein Gast gibt 5–50 € aus, Trinkgeld obendrauf), Stundenlöhne, Wareneinsatz, Miete und Tagesbilanz, Matcha-Einkauf mit Lieferung,
> Social Media statt Kampagnen, Parkplatz. § 1–§ 18 beschreiben jetzt dieses Spiel; neu sind § 7.6 (Spieluhr und Öffnungszeiten)
> und § 7.7 (laufende Kosten und Tagesbilanz), § 8 (Matcha-Einkauf) und § 9 (Social Media) ersetzen Qualitätsstufen und Marketing.
> Was ersetzt wurde, steht je Abschnitt in einer Zeile „Bis Phase 2“. PLAN.md „Phase 3“ erklärt den Wechsel.
> Phase 3b (2026-10-18, Leben in der Szene): Abwesenheit 2 Spieltage, mit Filialleiter bis 6 (§ 6, § 14); neu § 7.8 (Gespräche,
> Stammgäste, Lieferant) und § 12.4 (Wetter) – alles kosmetisch, keine Rate ändert sich.
> Phase 3c (2026-10-19, Vincents Antworten nach PR #26): Wetter bleibt reine Optik, das Tempo „passt so“; der Lieferant bringt
> die Kartons bis ins Lager, die Matcha-Dosen im Regal zeigen den Vorrat, die Kamera fährt zum Objekt eines offenen Panels,
> Geräusche (§ 7.8). Weiterhin keine Rate geändert.
> Code-Bezeichner sind englisch, Spieltexte kommen aus `de.json`/`en.json`.

---

## 1. Fantasy und Ton

Du eröffnest ein kleines Matcha-Café in Berlin – du selbst an der Kasse, ein Barista an der Theke, ein Tisch – und baust daraus ein weltweites Café-Imperium. Ton: warm, ruhig, leicht humorvoll („Lo-fi Café“-Stimmung). Keine Hektik-Timer; Strafen sind sinkende Zufriedenheit und rote Zahlen in der Tagesbilanz (Löhne, Ware und Miete laufen, das Konto kann ins Minus gehen). Idle-Prinzip: Es geht weiter, auch wenn du nicht da bist.

Kern-Loop (eine Sitzung von 2–10 Minuten, also zwei bis zehn Spielstunden):
1. Abwesenheit ansehen (Gäste, Umsatz, Gewinn oder Verlust)
2. Matcha-Vorrat prüfen, nachbestellen oder die automatische Nachbestellung laufen lassen, bessere Sorte wählen
3. Geräte verbessern / neues Gerät kaufen – ab Level 5, 10, 15 und 20 kommt ein neues Produkt auf die Karte
4. Personal einstellen oder entlassen (Engpass der Pipeline gegen Lohn abwägen), Zufriedenheit prüfen
5. Bis zu drei Videos am Tag posten
6. Öffnungszeiten und Tagesbilanz prüfen, Quest/Achievement abholen, evtl. Boost zünden
7. Weggehen, das Café läuft weiter

Meta-Loop (Tage/Wochen): Café-Level steigern → bessere Matcha-Sorten und volle Karte → Filiale eröffnen (Kyoto aus der Kasse von Berlin) → Franchise-Reset für Zen → Meta-Upgrades und weitere Filialen → schneller durch den nächsten Lauf.

---

## 2. Währungen

| Währung | Code | Symbol | Scope | Quelle | Verwendung |
|---|---|---|---|---|---|
| Geld (Euro) | `coins` | € (im HUD grüner Geldschein) | pro Standort | Bezahlte Gäste (Umsatz + Trinkgeld), Anfeuern, Café-Level-Bonus, Abwesenheit, Zeitsprung | Geräte, Ambiente, Einstellungsgebühren, Löhne, Wareneinsatz, Matcha-Einkauf, Miete & Strom, Videos, Eröffnung der nächsten Filiale |
| Goldene Blätter | `goldenLeaves` | 🍃 | global | Achievements, Daily Quests, Events, Café-Level ab 3, seltene Kunden-Drops, (später: Monetarisierung) | Zeitsprünge, Boosts, Sofort-Fertigstellung, Skins, Bonus-Videos |
| Zen | `zen` | ☯ | global | Franchise-Reset eines Standorts | Meta-Upgrades, Freischaltung von Standorten ab Tokio |

Geld wird als `Decimal` (break_infinity) geführt; der Code-Name bleibt `coins` (Phase 1 „Münzen“, ab 2026-10-15 Geldscheine, seit Phase 3 Euro). Alle Beträge in diesem Dokument sind Euro für Berlin; die anderen Standorte rechnen mit ihrem Preisniveau `scale` (§ 3) – Verkaufspreise, Wareneinsatz, Matcha-Einkauf, Löhne, Einstellungsgebühren, Miete, Ausbau, Videos und Startkapital. Anzeige über `formatMoney`: unter 10 000 € mit Cent („5,20 €“ / „€5.20“), bis 1 Mio. € ganze Euro, darüber kompakt („1,23 Mio. €“).

Das Konto darf ins Minus gehen: Laufende Kosten werden immer abgebucht (§ 7.7), Käufe gehen erst wieder, wenn genug Geld da ist (HUD-Chip „Konto im Minus“). Gratis-Videos gehen auch im Minus, damit ein kriselndes Café nicht noch seine Follower verliert.

Goldene Blätter und Zen bleiben praktisch im `number`-Bereich, werden aber ebenfalls als `Decimal` gespeichert, damit das Save-Schema einheitlich ist.

> Bis Phase 2: währungsloses „Geld“/„Cash“ ohne €-Zeichen, Tycoon-Beträge bis weit über 1e15.

---

## 3. Standorte

Jeder Standort ist ein eigenes Café mit eigenem Geld, eigenen Öffnungszeiten, eigenem Matcha-Lager und Social-Media-Account, eigenen Geräte-Namen (gleiche Mechanik) und eigener Optik. Alle freigeschalteten Cafés arbeiten gleichzeitig; sie teilen die Spieluhr (§ 7.6).

Jede Stadt hat ein realistisches **Preisniveau** `scale` (Preise und Kosten, Berlin = 1) und ein **Gäste-Potenzial** `demand` (Faktor auf die Nachfrage, § 7.1). Eine Filiale wird eröffnet mit dem Café-Level des Vorgängers (Bestwert, überlebt den Reset), Zen und einer Investition, die aus der Kasse des Vorgängers bezahlt wird (`data/locations.ts`, nicht skaliert). Startkapital jedes Cafés = 600 € × Preisniveau.

| # | ID | Name | Thema / Optik | Preisniveau | Gäste | Eröffnung | Startkapital |
|---|---|---|---|---|---|---|---|
| 1 | `berlin` | Kiez-Café Berlin | Altbau, Kobaltblau, Fahrräder vorm Fenster | 1 | 1 | Start | 600 € |
| 2 | `kyoto` | Teehaus Kyoto | Holz, Tatami, Garten, Kirschblüte | 1,1 | 1,25 | Berlin Café-Level 12 + 30 000 € aus Berlins Kasse (kein Zen) | 660 € |
| 3 | `tokyo` | Flagship Shibuya | Neon, Glas, Automaten, Nacht | 1,3 | 1,6 | Kyoto Café-Level 12 + 40 Zen + 90 000 € | 780 € |
| 4 | `seoul` | Rooftop Seoul | Dachterrasse, Skyline, Lichterketten | 1,15 | 1,45 | Tokio Café-Level 12 + 120 Zen + 180 000 € | 690 € |
| 5 | `newyork` | Loft New York | Industrial, Hochregale, Taxis | 1,6 | 1,9 | Seoul Café-Level 12 + 300 Zen + 350 000 € | 960 € |
| 6 | `bali` | Beach Club Bali | Bambus, Strand, Sonnenuntergang | 0,85 | 1,4 | New York Café-Level 12 + 700 Zen + 600 000 € | 510 € |

Kyoto kostet kein Zen: Zen gibt es nur für einen Franchise-Reset, und der leert die Kasse, aus der Kyoto bezahlt wird. Ab Tokio kommt das Zen aus dem Reset der anderen Cafés, während das Vorgänger-Café auf die Eröffnung spart.

Standort-spezifische Geräte-Namen (Beispiele für die i18n-Keys `station.<loc>.<id>.name`):
- Berlin: „Kasse“, „Matcha-Station“, „Siebträger“ (Kaffeemaschine), „Eisfach“, „Steinofen“
- Kyoto: „Holzkasse“, „Usucha-Station“, „Kyoto-Röster“, „Kakigori-Fach“, „Wagashi-Ofen“
- Tokio: „Self-Checkout“, „Matcha-Automat“, „Espresso-Roboter“, „Softeis-Fach“, „Mochi-Ofen“
- usw. – Mechanik bleibt identisch.

> Bis Phase 2: Einkommens-Skalierung ×1 / ×25 / ×600 / ×15 000 / ×400 000 / ×1e7, Freischaltung über Café-Level 15 + 10 / 50 / 250 / 1 200 / 6 000 Zen.

---

## 4. Theken und Ausstattung

> Phase 2 (Vorgabe Vincent, 2026-10-15) ersetzt die acht Verkaufsstationen mit Selbstbedienung durch ein
> **bedientes Café**. Die Kunden-Figuren bleiben kosmetisch; gerechnet wird weiter als Rate (§ 7, § 14).
> Phase 3: Euro-Preise, eine Speisekarte in fünf Stufen je Gerät, Höchstlevel 20, Arbeitszeiten in Spielminuten,
> Wareneinsatz und Matcha je Stück.

Drei Theken bilden die **Service-Pipeline**; jede hat Personal (§ 6) und Ausstattung mit Leveln:

| Bereich | Code | Wer arbeitet dort | Ausstattung |
|---|---|---|---|
| Bestelltheke | `order` | Verkäufer nehmen Bestellungen entgegen (am Start du selbst) | Kasse |
| Barista-Theke | `bar` | Baristas bereiten alles zu (Matcha, Kaffee, Kuchen …); ohne Bedienung rufen sie auch auf und reichen über die Theke | eine Ausstattung je Produktlinie |
| Ausgabe | `service` | Bedienungen übergeben an der Theke oder bringen an den Tisch | Ausgabe-Station |

Die Ausstattung ersetzt technisch die Stationen (`StationDef`, `LocationState.stations`, Käufe ×1/×5/Max, Café-Level aus der Summe der Level). Werte für Berlin; andere Standorte × Preisniveau (§ 3).

| ID | Name (DE) | Bereich | Freischaltung | Grundpreis (Level 0→1) | Wachstum `g` | Level 19→20 | Arbeitszeit (Spielmin je Stück) | Wareneinsatz je Stück | Matcha je Stück |
|---|---|---|---|---|---|---|---|---|---|
| `register` | Kasse | order | Café-Level 1 (Level 0 = Handkasse, Tempo 0,6) | 90 € | 1,19 | 2 452,65 € | Bestellzeit 1 | – | – |
| `matchaStation` | Matcha-Station (Schale, Chasen, Kessel) | bar | Start, Level 1 steht schon | 35 € | 1,19 | 953,81 € | 2 | 0,55 € | 3 g |
| `coffeeMachine` | Kaffeemaschine | bar | Café-Level 2 | 420 € | 1,155 | 6 490,93 € | 1,5 | 0,70 € | – |
| `iceBox` | Kühl- & Eisfach | bar | Café-Level 3 | 900 € | 1,15 | 12 808,59 € | 1,6 | 0,70 € | 3 g |
| `servingStation` | Ausgabe-Station (Tabletts, Warmhalter) | service | Café-Level 4 | 650 € | 1,15 | 9 250,65 € | – | – | – |
| `oven` | Ofen | bar | Café-Level 5 | 1 600 € | 1,14 | 19 289,11 € | 1 | 1,00 € | – |
| `displayCase` | Kuchenvitrine | bar | Café-Level 7 | 3 200 € | 1,135 | 35 487,17 € | 0,6 | 1,40 € | – |
| `grinder` | Steinmühle | bar | Café-Level 9 (Terrasse ≥ 1) | 7 500 € | 1,125 | 70 300,63 € | 3 | 0,20 € | 2 g |
| `ceremonySet` | Zeremonie-Set | bar | Café-Level 12 (Terrasse ≥ 1) | 6 500 € | 1,12 | 55 982,95 € | 10 | 3,00 € | 8 g |

Kosten je Level: `base × g^level × (g^n − 1)/(g − 1) × scale × (1 − discount)` (§ 14). Die Matcha-Station steht beim Start schon auf
Level 1, ihr erstes Upgrade kostet 41,65 €; die Kasse ganz auszubauen (0 → 20) kostet 14 887,62 €.

**Level-Effekt:** Jedes Level über 1 macht ein Gerät schneller, `speed(level) = 1 + (level − 1) × 0.06` (Level 20 = ×2,14),
Höchstlevel 20. Ab Level **1, 5, 10, 15 und 20** (`MENU_LEVELS`) gilt die nächste Stufe der Speisekarte: ein neues Produkt mit
etwas höherem Preis, mehr Bestellungen je Gast und mehr Nachfrage – zugleich bekommt das Gerät sein nächstes, edleres Aussehen
(`STATION_LOOK_LEVELS = MENU_LEVELS`, fünf Optik-Stufen, UI_STYLE § 4). Die Gästetheke wird mit dem Café-Level edler, die Tische
mit ihrer Anzahl (Optik-Stufen 1/4/7/10). Kasse Level 0 = Handkasse mit Tempo 0,6; Ausgabe-Station Level 0 = Tempo 1
(Bedienungen arbeiten auch ohne Station, nur langsamer als mit).

**Speisekarte** (`StationDef.menu`; je Zelle: Produkt, Preis je Stück in Berlin – Matcha-Produkte in Kochqualität –, Stück je
Gast `attach` und zusätzliche Nachfrage `demand` als Anteil der Grundnachfrage):

| Linie | Stufe 1 (Lv 1) | Stufe 2 (Lv 5) | Stufe 3 (Lv 10) | Stufe 4 (Lv 15) | Stufe 5 (Lv 20) |
|---|---|---|---|---|---|
| Matcha-Station | Matcha-Latte · 5,20 € · 1,00 · +0 % | mit Hafer- oder Kokosmilch · 5,50 € · 1,05 · +4 % | Erdbeer- und Vanille-Matcha · 5,90 € · 1,10 · +8 % | Matcha-Tonic · 6,40 € · 1,15 · +12 % | Signature-Matcha · 6,90 € · 1,20 · +16 % |
| Kaffeemaschine | Espresso · 3,40 € · 0,20 · +20 % | Cappuccino · 3,70 € · 0,24 · +24 % | Flat White · 4,00 € · 0,28 · +28 % | Pour-over · 4,40 € · 0,31 · +31 % | Espresso-Tonic · 4,90 € · 0,34 · +34 % |
| Kühl- & Eisfach | Iced Matcha Latte · 5,60 € · 0,22 · +10 % | Matcha-Frappé · 5,90 € · 0,26 · +12 % | Matcha-Limonade · 6,20 € · 0,30 · +14 % | Matcha-Softeis · 6,60 € · 0,33 · +16 % | Matcha-Affogato · 7,00 € · 0,36 · +18 % |
| Ofen | Croissant · 3,20 € · 0,25 · +10 % | Matcha-Croissant · 3,60 € · 0,30 · +12 % | Bananenbrot · 4,00 € · 0,34 · +14 % | Zimtschnecke · 4,50 € · 0,38 · +16 % | Matcha-Laugencroissant · 5,20 € · 0,42 · +18 % |
| Kuchenvitrine | Käsekuchen · 4,50 € · 0,20 · +8 % | Matcha-Cheesecake · 4,90 € · 0,24 · +10 % | Mochi · 5,40 € · 0,28 · +12 % | Matcha-Tiramisu · 5,90 € · 0,31 · +14 % | Torte des Tages · 6,50 € · 0,34 · +16 % |
| Steinmühle | Usucha aus der Steinmühle · 7,50 € · 0,08 · +6 % | Usucha mit Wagashi · 8,00 € · 0,10 · +7 % | Usucha-Flight · 8,60 € · 0,12 · +8 % | Koicha · 9,20 € · 0,13 · +9 % | Koicha-Verkostung · 9,90 € · 0,14 · +10 % |
| Zeremonie-Set | Teezeremonie für zwei · 24 € · 0,03 · +5 % | mit Wagashi · 26 € · 0,035 · +6 % | mit Saisongebäck · 28 € · 0,04 · +7 % | Private Zeremonie · 31 € · 0,045 · +8 % | Meister-Zeremonie · 34 € · 0,05 · +9 % |

**Warenkorb-Modell:** Jeder Gast bestellt jedes Produkt der Karte mit seinem `attach` (über 1 = manche nehmen zwei). Ein neues
Gerät bringt ein neues Produkt und mehr Gäste, statt anderen Linien Kunden wegzunehmen:
```
price_i          = menuTier_i.price × scale × (Matcha-Produkt ? grade.priceMult : 1)       (Stufe nach Level, § 8)
attach_i         = menuTier_i.attach × Touristen-Bonus (nur Kuchenvitrine, § 7.5) × Event-Faktor (§ 12)
avgTicket        = Σ_i attach_i × price_i                     (Linien mit Level ≥ 1; Matcha-Produkte nur mit Vorrat)
loadPerCustomer  = Σ_i attach_i × workMin_i / speed_i(level_i)                  Barista-Minuten je Gast
goodsPerGuest    = Σ_i attach_i × goodsCost_i × scale;   gramsPerGuest = Σ_i attach_i × matchaGrams_i
```
**Bon je Gast** (Vorgabe Vincent: „jeder Kunde gibt im Café zwischen 5 und 50 € aus, Trinkgeld on top, mehr Geräte, mehr Angebot,
höhere Beträge, aber nicht wie im Tycoon“): am Start 5,20 € (ein Matcha-Latte in Kochqualität), volle Karte (alle Linien auf
Stufe 5) in Kochqualität 20,22 €, mit Uji First Flush 29,94 € (Berlin); in New York (×1,6) bis rund 48 €. Dazu Trinkgeld: am
Start 5,6 %, voll ausgebaut mit Bedienung und Musik rund 20 % (§ 7.2). Ohne Matcha im Lager fallen Matcha-Station, Kühl-/Eisfach,
Steinmühle und Zeremonie-Set von der Karte (§ 8).

> Bis Phase 2: Kosten- und Preis-Leiter von Phase 1 (Basis-Preis × Level, Meilensteine 10/25/50/100 … ×2 Tempo bzw. Preis,
> Tempo +2 % je Level, Optik-Stufen 1/10/25/50/100), Arbeitszeiten in Sekunden, keine Warenkosten.

---

## 5. Ambiente, Erweiterung, Café-Level

### 5.1 Ambiente-Elemente (pro Standort)

| ID | Name | Effekt | Erste Stufe (Berlin) | Wachstum | Max | Ab Café-Level | Start |
|---|---|---|---|---|---|---|---|
| `seats` | Tische (je Stufe ein Tisch mit zwei Plätzen) | +5 Gäste/h Platz (§ 7.1) | 60 € (zweiter Tisch) | 1,32 | 10 | 1 | 1 |
| `decor` | Deko (Pflanzen, Lampen, Kunst) | +1 Zufriedenheit, +1,2 % Nachfrage, +1 % Video-Reichweite je Level | 30 € | 1,22 | 30 | 1 | 0 |
| `music` | Musik/Soundsystem | +0,6 % Trinkgeld je Level | 120 € | 1,35 | 10 | 2 | 0 |
| `parking` | Parkplatz (Rad → Roller → Auto) | +5 % Nachfrage je Stufe; Miete +6 €/Tag je Stufe | 220 € | 2,25 | 5 | 2 | 0 |
| `wifi` | WLAN & Steckdosen | +2,5 % Nachfrage je Level | 90 € | 1,4 | 8 | 3 | 0 |
| `terrace` | Terrasse | Tische draußen (Stufe 1/2/3: +2/+3/+1), Platz für Geräte ab Café-Level 9; Miete +12 €/Tag je Stufe | 1 800 € | 2,4 | 3 | 6 | 0 |

Kosten: `cost(level→level+1) = base × g^(level − Startstufe) × scale × (1 − discount)` – was das Café schon beim Start hat (der
erste Tisch), kostet nichts, der nächste den Grundpreis. Parkplatz-Stufen 220 / 495 / 1 113,75 / 2 505,94 / 5 638,36 €,
Terrasse 1 800 / 4 320 / 10 368 €.

**Parkplatz** (Vorgabe Vincent 2026-10-16: „neben dem Laden einen Parkplatz, bei dem es Plätze gibt, plus Roller-/Fahrradständer“;
entschieden: ausbaubar mit Wirkung, `data/parking.ts`): links neben dem Café-Block, wo bis Phase 2 ein Altbau stand, mit Einfahrt
über einen abgesenkten Bordstein.

| Stufe | Ausbau | Plätze | Gäste mit Fahrzeug (Szene) |
|---|---|---|---|
| 0 | eingezäunte Schotterfläche (Bauzaun) | – | 0 % |
| 1 | Asphalt mit Markierung, Schild „P“, zwei Fahrradbügel | 2 Räder | 14 % |
| 2 | zwei weitere Fahrradbügel | 4 Räder | 22 % |
| 3 | drei Roller-Plätze | + 3 Roller | 30 % |
| 4 | zwei Auto-Stellplätze an der Rückwand | + 2 Autos | 36 % |
| 5 | zwei weitere Stellplätze mit Ladesäule | 4 Autos (11 Plätze) | 42 % |

Im Rate-Modell zählt nur `parking`: Nachfrage × (1 + 0,05 × Stufe) und die Platzmiete (§ 7.7). Die Gäste mit Fahrzeug sind Optik:
Sie kommen, wenn ein Platz frei ist (bei freiem Auto-Platz zu 40 % mit dem Auto), parken ein, gehen zu Fuß zur Tür und stellen
sich erst dort an (UI_STYLE § 4).

### 5.2 Grid-Erweiterung
Raum 11×10 mit verglastem Wintergarten (UI_STYLE § 4 „Café-Grundriss“), drinnen bis zu 10 Tische (8 im Gastraum, 2 im
Wintergarten). Die Terrasse bringt Tische draußen – Stufe 1 zwei vorn, Stufe 2 drei rechts am Gehweg, Stufe 3 einen an der Ecke,
zusammen bis 16 Tische – und Platz: Geräte ab Café-Level 9 (Steinmühle, Zeremonie-Set) brauchen Terrasse ≥ 1 (`TERRACE_REQUIREMENT`).

### 5.3 Café-Level
Das Café-Level folgt aus der Summe aller Geräte-Level über die Stufen-Tabelle `BALANCE.cafeLevel.steps`
(4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 13), höchstens Café-Level 20:

| Café-Level | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Σ Geräte-Level | 4 | 9 | 15 | 21 | 28 | 35 | 43 | 51 | 60 | 69 | 79 | 89 | 100 | 111 | 123 | 135 | 148 | 161 | 174 |

Neun Geräte × Level 20 = 180; Café-Level 20 braucht also fast alles. Jedes neue Café-Level gibt einmalig **1 Spielstunde Umsatz zur
Hauptzeit** (`CAFE_LEVEL_REWARD.incomeHours`, in der Tagesbilanz unter „Boni“), ab Café-Level 3 zusätzlich Goldene Blätter
(1 bis Level 6, 2 bis Level 10, danach 3; nur über dem bisherigen Bestwert, damit ein Reset sie nicht noch einmal ausschüttet).
Die Freischaltungen stehen an den Definitionen selbst; `data/unlocks.ts` sammelt sie je Café-Level:

| Café-Level | Neu |
|---|---|
| 1 | Kasse, Matcha-Station; Tische, Deko; Verkäufer, Barista, Bedienung; Videos „Latte-Art-Clip“ und „Barista-Tutorial“ |
| 2 | Kaffeemaschine; Musik, Parkplatz; Putzkraft; Matcha-Sorte Café Grade; Video „Trend-Sound“ |
| 3 | Kühl- & Eisfach; WLAN; Social-Media-Manager; Video „Gesponserter Beitrag“ |
| 4 | Ausgabe-Station; Premium Grade |
| 5 | Ofen; Filialleiter |
| 6 | Terrasse; Ceremonial Grade; Video „Influencer-Kooperation“ |
| 7 | Kuchenvitrine |
| 8 | Ceremonial Reserve |
| 9 | Steinmühle (Terrasse ≥ 1) |
| 10 | Meister-Auslese; Franchise-Reset möglich (§ 11) |
| 12 | Zeremonie-Set (Terrasse ≥ 1); Uji First Flush; Bedingung für die nächste Filiale (§ 3) |

> Bis Phase 2: Schritte von 22–35 Geräte-Leveln je Café-Level, Höchststufe 50, Belohnung 30 s Einkommen, Blätter ab Level 5.

---

## 6. Personal und Manager (Phase 3: Löhne, Einstellen und Entlassen)

Personal wird pro Standort eingestellt. Die vier Service-Rollen zählen als **Anzahl** (Köpfe, jede Kraft arbeitet parallel,
`loc.staff[id]`); Filialleiter und Social-Media-Manager sind **Stufen** (jede Stufe eine erfahrenere Kraft mit mehr Lohn).
Vorgabe Vincent (2026-10-16): „Personal wieder feuern können und sehen, wie viel sie kosten“. Jede Kraft kostet einen
**Stundenlohn**, bezahlt nur, solange das Café geöffnet ist; Einstellen kostet einmalig eine kleine Gebühr (Anzeige,
Einarbeitung; Tagesbilanz „Einstellungen“); **Entlassen** geht jederzeit und kostet nichts (Stufen-Rollen: eine Stufe zurück).

| ID | Name | Art | Ab Café-Level | Max | Stundenlohn (Berlin) | Einstellung | Start | Mindestens | Effekt je Kopf/Stufe |
|---|---|---|---|---|---|---|---|---|---|
| `cashier` | Verkäufer | Anzahl | 1 | 4 | 13,90 € (du: 0 €) | 40 € | 1 (du) | 1 (du) | ein Bestellplatz: `orderCap += speed(Kasse) × 60 / 1 min` je Stunde |
| `barista` | Barista | Anzahl | 1 | 7 | 14,80 € | 60 € | 1 | 1 | 60 Barista-Minuten je Stunde (§ 7.2); ohne Bedienung ruft er auch auf und reicht über die Theke |
| `waiter` | Bedienung | Anzahl | 1 | 4 | 13,90 € | 40 € | 0 | 0 | Übergabe und Tischservice: bis zu +6 Zufriedenheit und +3 % Trinkgeld, entlastet die Baristas (§ 7.2) |
| `cleaner` | Putzkraft | Anzahl | 2 | 3 | 14,20 € | 40 € | 0 | 0 | putzt 5 Punkte/h × 2 × (1 − Sauberkeit/100) (§ 7.3) |
| `socialMedia` | Social-Media-Manager | Stufe | 3 | 3 | 17 € + 4 € je weitere Stufe | 120 € je Stufe | 0 | 0 | postet täglich ein Video je Stufe (10, 14, 18 Uhr), +15 % Video-Reichweite je Stufe (§ 9) |
| `manager` | Filialleiter | Stufe | 5 | 3 | 24 € + 5 € je weitere Stufe | 250 € je Stufe | 0 | 0 | Abwesenheit 4/5/6 statt 2 Spieltage (§ 14), ab Stufe 1 Auto-Kauf |

**Gründungsteam** (Start, jede neue Filiale, jeder Franchise-Reset): **du selbst an der Kasse** (`owner: 1`, ohne Lohn, nicht
kündbar) und **ein Barista**. Eine Bedienung gehört nicht mehr dazu: Ohne Bedienung holen die Gäste an der Theke selbst ab (§ 7.2).
Mindestbesetzung (`minimum`): 1 an der Kasse (du) und 1 Barista – ohne Barista bereitet niemand zu; darunter ist der
Entlassen-Knopf gesperrt und sagt im Tooltip, warum.

Lohnsumme je geöffneter Stunde (`wagesPerOpenHour`, × Preisniveau) = bezahlte Köpfe × Lohn + Lohn der Stufen-Rollen; am Start
14,80 €/h (nur der Barista), bei 8–18 Uhr 148 € am Tag. Das Personal-Panel zeigt Lohn je Stunde und Tag je Rolle und fürs ganze Team.

**Auto-Kauf** des Filialleiters (höchstens ein Level je Tick, günstigstes Gerät) lässt die laufenden Kosten eines Tages auf dem
Konto: Löhne der Öffnungszeit, Tagesmiete und den Matcha-Einkauf eines Öffnungstags (`autoBuyReserve`), damit um Mitternacht
die Nachbestellung bezahlt werden kann. Wird der Filialleiter entlassen, schaltet sich der Auto-Kauf ab.

Personal ist im Café sichtbar (kosmetisch): Verkäufer hinter der Kasse, Baristas arbeiten Schritt für Schritt am Gerät,
Bedienungen mit Tablett zwischen Ausgabe und Tischen, Putzkräfte wischen; nach Ladenschluss geht das Team nach hinten hinaus und
kommt morgens wieder (UI_STYLE § 4). Bäcker und Tee-Meister aus Phase 1 entfallen seit Phase 2 (Baristas bereiten alles zu).

> Bis Phase 2: keine Löhne, kein Entlassen; Einstellung mit Wachstum 1,7 je Kopf (Basis 100/100/150/3 500), bis 20 Köpfe,
> Gründungsteam je 1 Verkäufer, Barista und Bedienung gratis; Filialleiter +2 h Offline-Deckel je Stufe, Social Media +5 % Spawn
> und kürzere Kampagnen-Abklingzeit.

---

## 7. Kunden-Simulation (Rate-Modell)

Die Ökonomie rechnet in Raten **pro Spielstunde** über die Spieluhr (§ 7.6; bis Phase 2 pro echter Sekunde):
`computeLocationRates(state, locationId, { hour })` in `core/customers/rates.ts`. `core/economy/simulate.ts` lässt die Cafés in
Abschnitten mit festen Raten laufen – bis zur nächsten vollen Stunde, zur nächsten Lieferung oder bis der Matcha ausgeht – und
nutzt dafür Tick, Abwesenheit und Zeitsprung gleich (rein und deterministisch). Die Phaser-Szene zeigt dazu passende Figuren,
hat aber keinen Einfluss auf das Ergebnis.

### 7.1 Nachfrage
```
curve(h)        = DEMAND_CURVE[h]                                   Tageskurve, 1 = Hauptzeit
attraction      = (1 + Σ menuTier.demand der Linien auf der Karte)   breitere Karte (§ 4)
                × grade.demandMult  (ohne Matcha 0.4)                Sorte im Ausschank (§ 8)
                × (1 + decor × 0.012) × (1 + wifi × 0.025) × (1 + parking × 0.05)
                × (1 + 1.4 × F / (F + 12 000))                       Follower F (§ 9)
                × (1 + min(0.6, buzz))                               frische Videos (§ 9)
                × satisfactionFactor                                 § 7.3
demand/h        = geöffnet ? 11 × location.demand × curve(h) × attraction × spawnMult × influencerHype : 0
capacity/h      = (8 + Tische × 5) × spawnMult                      Mitnahme an der Theke + je Tisch zwei Plätze
Tische          = seats + terraceTables[terrace]                     terraceTables = 0 / 2 / 5 / 6
spawnRate       = min(demand, capacity)
```
`spawnMult` sammelt Events und Boosts (Hype ×2, Influencer-Besuch …), je Typ gedeckelt bei ×12 (§ 12.3). Der Influencer-Hype
(§ 7.5) zählt als Erwartungswert nur in aktiver Spielzeit, nicht in der Abwesenheit oder im Zeitsprung.

Tageskurve (Stunde: Faktor): 0–4 Uhr 0,01–0,02 · 5: 0,12 · 6: 0,38 · 7: 0,75 · 8: 0,95 · 9: 1 · 10: 0,8 · 11: 0,85 ·
**12: 1,1** · 13: 1,05 · 14: 0,9 · 15: 1 · 16: 0,95 · 17: 0,8 · 18: 0,6 · 19: 0,45 · 20: 0,32 · 21: 0,2 · 22: 0,1 ·
23: 0,05 – Frühstück, Mittag, Kuchen am Nachmittag, abends ruhiger.

Am Start (Berlin, 12 Uhr): 11 × 1,1 × 1,05 (Zufriedenheit 55) ≈ 12,8 Gäste/h bei 13 Plätzen/h (Mitnahme 8 + ein Tisch); am
ersten Tag kommen gut 120 Gäste (Sim). Vorgabe „am Anfang weniger Durchlauf“.

### 7.2 Durchsatz und Einkommen (Service-Pipeline)
```
speed(level)      = 1 + (level − 1) × 0.06  (level ≥ 1);  Kasse Level 0 = 0.6 (Handkasse), Ausgabe-Station Level 0 = 1
orderCap/h        = Verkäufer × speed(Kasse) × speedBoost × 60 / 1 min
baristaMin/h      = Baristas × speedBoost × 60
avgServeTime      = 0.4 × 0.5 min (Übergabe) + 0.6 × 1.5 min (Tischservice) = 1.1 min
waiterCap/h       = Bedienungen × speed(Ausgabe-Station) × speedBoost × 60 / avgServeTime
prodCap/h         = baristaMin / load                                  wenn ≤ waiterCap (Bedienungen übernehmen die Ausgabe)
                  = (baristaMin + waiterCap × 0.3) / (load + 0.3)      sonst: für den Rest rufen Baristas selbst auf (0.3 min je Gast)
totalThroughput   = min(orderCap, prodCap)
served            = min(spawnRate, totalThroughput)
tableServiceShare = min(1, waiterCap / served)                         Anteil mit Bedienung; der Rest holt an der Theke ab
bottleneck        = served < spawnRate ? (prodCap < orderCap ? „Zubereitung“ : „Bestellung“) : „Nachfrage“
tipRate           = (satTerm × 0.1 + music × 0.006) × (1 + 0.1 × Stammgast-Anteil) × eventTipMult + tableServiceShare × 0.03
sales/h           = served × avgTicket × incomeMult × prestigeMult       (Boosts/Events × Zen, § 11.3)
income/h          = sales/h × (1 + tipRate)                             landet über die offenen Bons der Kasse im Geld (s. u.)
goods/h           = served × goodsPerGuest;   matchaGrams/h = served × gramsPerGuest      (§ 4, § 7.7, § 8)
perStation_i      = served × attach_i                                   Stück/h je Produktlinie (Szene, Statistik)
```
`satTerm` = (1 − Kritiker-Anteil) × sat/100 + Kritiker-Anteil × max(0, 0,5 + (sat/100 − 0,5) × 2) (§ 7.5).

Tischservice ist seit Phase 3 keine Engpass-Stufe mehr: Ohne (genug) Bedienungen holen die Gäste selbst an der Theke ab; das
kostet die Baristas 0,3 min je Gast, und es gibt weniger Zufriedenheit und Trinkgeld (§ 7.3). Die Pipeline-Karte zeigt vier
Balken (Nachfrage, Bestellung, Zubereitung, Tischservice) in Gästen pro Stunde; als Engpass markiert werden Bestellung oder
Zubereitung. Am Start (Berlin, Mittag): Bestellung 36/h (du an der Handkasse), Zubereitung ≈ 26/h (ein Barista, 2 min je
Matcha-Latte plus Aufrufen), Nachfrage ≈ 12,8/h → Engpass Nachfrage; Bon 5,20 € + 5,6 % Trinkgeld → ≈ 70 € Umsatz je Stunde.

**Kasse – Geld kommt erst beim Bezahlen** (Vorgabe Vincent, 2026-10-15; `core/economy/till.ts`, seit Save v10):
```
till.open     += income/h × dt_h        // Umsatz der Gäste, die gerade bestellen und bezahlen
till.progress += served × dt_h          // wie weit der nächste Gast mit dem Bezahlen ist
n = floor(till.progress)                // so viele Gäste haben in diesem Schritt fertig bezahlt
coins         += till.open × n / till.progress ;  till.open −= dieser Betrag ;  till.progress −= n ;  till.paid += n
```
Bei gleichbleibenden Raten zahlt jeder Gast genau den Durchschnittsbon (`income/served`); über die Zeit ist die Summe dieselbe
wie bei laufender Gutschrift, nur um höchstens einen Gast verzögert. Abwesenheit und Zeitsprung buchen direkt aufs Konto,
Anfeuern und Belohnungen ebenso. Die Szene zeigt jede gebuchte Zahlung an der Kasse (der Gast dort bezahlt genau in diesem
Moment, neue Gäste kommen rechtzeitig vom Gehweg oder vom Parkplatz); bleibt kosmetisch.

### 7.3 Zufriedenheit (0–100)
```
waitPressure  = clamp(spawnRate / totalThroughput − 1, 0, 2)            nur geöffnet und mit Karte
dirt/h        = 2 + served/h × 0.03                                      Schmutz wächst mit den Gästen
clean/h       = Putzkräfte × 5 × 2 × (1 − cleanliness/100)               effektiver bei Dreck
cleanliness   = 0..100, ändert sich um (clean/h − dirt/h) je Spielstunde, nur geöffnet (exakt gelöst)
              → Gleichgewicht c* = 100 × max(0, 1 − dirt/h / (10 × Putzkräfte)); ohne Putzkraft sinkt sie um dirt/h
targetSat     = 50 + decor × 1 + Sorte (+0/2/5/8/11/14/18, § 8) + tableServiceShare × 6 − waitPressure × 20
              + (cleanliness − 70) × 0.3 − 12 (Matcha ausverkauft) (+ Zen, + Events), begrenzt auf 0..100
satisfaction  → nähert sich je geöffneter Spielminute um 2 % der Differenz zu targetSat (nachts bleibt sie stehen)
satisfactionFactor = 0.5 + satisfaction / 100                            0.5 … 1.5, wirkt auf die Nachfrage
```
Startwert 55. Die UI zeigt die Einzelbeiträge (Deko +12, Matcha-Sorte +8, Bedienung am Tisch +6, Wartezeit −18 …), damit jede
Entscheidung erklärbar ist; „Bedienung am Tisch“ und „Matcha ausverkauft“ erscheinen nur, wenn sie etwas ausmachen.

> Bis Phase 2: Schmutz und Putzen je Minute Spielzeit, Annäherung 2 % je Sekunde, Qualität +4 je Stufe, Startwert 50.

### 7.4 Tap-Bonus („Barista anfeuern“)
Jeder Tap auf das Café gibt sofort `Umsatz/h × 0,5 Spielminuten / 60 × (1 + tapPower × 0,5)` (Tagesbilanz „Boni“); nachts
(geschlossen) bringt Anfeuern nichts. Gedeckelt auf 10 Taps/s; jeder Tap füllt den „Hype“-Balken: voll (30 Taps) → 10 s lang ×2
Nachfrage, der Balken verfällt mit 0,5 je Sekunde. Meta-Upgrade erhöht den Tap-Wert. Zweck: aktives Spielen belohnen, ohne es zu
erzwingen.

### 7.5 Kundentypen (kosmetisch + kleine Effekte)

| Typ | Anteil | Sichtbares | Effekt |
|---|---|---|---|
| Student | 40 % | Rucksack, Laptop | neutral |
| Tourist | 25 % | Kamera, Hut | Kuchenvitrine: `attach × (1 + 0,5 × Touristen-Anteil)` |
| Stammgast | 20 % | wiederkehrendes Sprite; dazu vier feste Stammgäste mit Namen je Stadt (§ 7.8) | +10 % Trinkgeld |
| Influencer | 10 % | Handy, Ringlicht | löst 5 s „Hype“ aus (×1,5 Nachfrage, echte Sekunden), 1 % Chance auf 1 Goldenes Blatt |
| Kritiker | 5 % | Notizbuch | Zufriedenheit zählt doppelt beim Trinkgeld (positiv wie negativ) |

Anteile verschieben sich pro Standort (Kyoto: mehr Touristen, Tokio: mehr Influencer, Seoul: Influencer und Studierende,
New York: Kritiker und Touristen, Bali: Touristen).

### 7.6 Spieluhr und Öffnungszeiten (Phase 3)
Vorgabe Vincent (2026-10-16): „Es muss Tag und Nacht geben und Öffnungszeiten.“ Entschieden: **1 Spielstunde = 1 Minute, die
Nacht spult vor** (`data/time.ts`, `core/time/clock.ts`).

- `GameState.clock` zählt Spielminuten seit Spielbeginn (Tag 0, 00:00). Ein neues Spiel beginnt um 7:40 Uhr, kurz vor der ersten
  Öffnung. Die Uhr ist für alle Cafés dieselbe.
- **Tempo:** Solange das aktive Café geöffnet hat, vergeht eine Spielminute je echter Sekunde; geschlossen sechs (Zeitraffer). Es
  zählt das aktive Café, weil der Spieler dessen Tag sieht; alle Cafés rechnen in Spielzeit, ihr Ergebnis hängt nicht vom Tempo ab.
- **Öffnungszeiten** je Café in vollen Stunden (`LocationState.hours`): Standard 8–18 Uhr, öffnen zwischen 5 und 12 Uhr, schließen
  zwischen 13 und 24 Uhr, mindestens 6 Stunden (`OPENING_HOURS`, `clampHours`). Sie gelten sofort und überleben den
  Franchise-Reset (eine Vorliebe, kein Ausbau).
- Ein Spieltag dauert `realSecondsPerDay` = geöffnete Minuten / 1 + geschlossene Minuten / 6 echte Sekunden – mit 8–18 Uhr
  600 + 140 = 740 s, also gut 12 Minuten.
- **Geschlossen:** keine Gäste, keine Löhne, kein Strom; die Miete läuft weiter; Zufriedenheit und Sauberkeit bleiben stehen;
  Lieferungen kommen an. Um Mitternacht beginnt ein neuer Tag: Tagesbilanz (§ 7.7), Social-Media-Zähler (§ 9), automatische
  Nachbestellung (§ 8). In der Szene gehen Wartende ohne Bestellung beim Ladenschluss wieder.
- **Länger offen** bringt die Gäste dieser Stunden (Tageskurve, § 7.1) – und kostet deren Löhne und Strom. Das Betrieb-Panel zeigt
  die erwarteten Gäste je Stunde und was die nächste bzw. die letzte Stunde nach Löhnen und Wareneinsatz bringt.
- Events, Boosts, Hype und Gratis-Boost laufen weiter in aktiver Spielzeit (`playtimeSec`, echte Sekunden), nicht in Spielzeit.
- Szene: Licht nach Uhrzeit, Schild „Geöffnet/Geschlossen“ an der Tür, das Team geht nach Ladenschluss (UI_STYLE § 4).

### 7.7 Laufende Kosten und Tagesbilanz (Phase 3)
Vorgabe Vincent (Antwort auf die Rückfrage zu den Kosten): „Stundenlöhne, Wareneinsatz, Miete & Nebenkosten“. Berlin, ×
Preisniveau:
```
wages/h   = geöffnet ? Σ Löhne (§ 6) : 0
goods/h   = served × Σ_i attach_i × goodsCost_i                      Milch, Becher, Teig, Kuchen … (Matcha kommt aus dem Lager)
rent/h    = (45 + 12 × terrace + 6 × parking) / 24                    Miete rund um die Uhr
          + (geöffnet ? 1.5 + 0.25 × gekaufte Geräte : 0)             Strom und Nebenkosten
```
Löhne, Wareneinsatz und Miete sammeln sich in `bills.pending` und werden **zu jeder vollen Spielstunde** vom Konto abgebucht
(`bills.last` zeigt die Szene als „−Betrag“ über der Kasse). Direkt bezahlt werden Matcha-Einkauf (§ 8), Einstellungsgebühren
(§ 6), bezahlte Videos (§ 9) und das Beheben eines Lieferengpasses (§ 12, `payCost`). Investitionen – Geräte, Ambiente,
Eröffnung einer Filiale – zählen nicht zur Tagesbilanz.

**Tagesbilanz** (`LocationState.ledger`: heute und gestern; um Mitternacht wird heute zu gestern):

| Einnahmen | Kosten |
|---|---|
| Umsatz (ohne Trinkgeld), Trinkgeld, Boni (Anfeuern, Café-Level-Belohnung) | Löhne, Wareneinsatz, Matcha-Einkauf, Miete & Strom, Social Media (Videos), Einstellungen |

Gewinn = Einnahmen − Kosten, kann negativ sein. Balance-Sim (Berlin, Greedy): Tag 1 mit 123 Gästen, 750,97 € Umsatz inkl.
Trinkgeld, 269,62 € Kosten, 481,35 € Gewinn (dazu 149,62 € Boni); Tag 29 (Café-Level 15) mit 1 483 Gästen, 42 131 € Umsatz,
10 835 € Kosten, 31 295 € Gewinn.

---

### 7.8 Leben in der Szene (Phase 3b, kosmetisch)

Die Figuren bleiben Optik; gerechnet wird nur im Rate-Modell (§ 7.2). Was die Szene lebendiger macht:

- **Gespräche** (`scenes/agents/chatter.ts`, `CHATTER` in `data/art.ts`): Zwei Gäste am selben Tisch oder auf benachbarten
  Barhockern reden abwechselnd in Sprechblasen (Pünktchen, Lachen, Matcha, Handy, Note, Herz; alle 1,2–2,6 s ein Beitrag, ab
  und zu eine längere Pause). Wer allein sitzt, schaut alle 12–24 s aufs Handy oder freut sich über den Matcha; in der Schlange
  plaudern alle 6–13 s zwei Nachbarn kurz. Das Wetter ist Thema (Sonne bzw. Regen, § 12.4), Herzen gibt es umso öfter, je
  zufriedener die Gäste sind (unter 20 % keine). Höchstens 6 Blasen gleichzeitig.
- **Stammgäste** (`data/regulars.ts`): je Stadt vier feste Figuren mit Namen, Aussehen und Uhrzeit (Berlin: Lena 8 Uhr, Jonas
  11 Uhr, Ali 13 Uhr, Mila 16 Uhr; Kyoto, Tokio, Seoul, New York und Bali eigene). Kommt in den ersten 50 Spielminuten ihrer
  Stunde ein neuer Gast, ist es der Stammgast – höchstens einmal am Spieltag und nur, wenn das Café dann geöffnet hat. An der
  Tür winkt er, „Stammgast Lena“ steht 3 s über ihm, die Kasse grüßt mit einem Herz zurück. Wer beim Szenenstart schon ansteht,
  ist kein Stammgast (er soll sichtbar hereinkommen).
- **Lieferant mit Sackkarre** (`COURIER`): Bei jeder Matcha-Lieferung steigt der Fahrer aus dem Lieferwagen und schiebt die
  Kartons (bis 500 g einer, bis 2 kg zwei, darüber drei) auf der Sackkarre durch die Tür, vor der Theke entlang und durch den
  Personal-Durchgang bis ans Lager-Regal (Phase 3c; vorher nur bis zur Tür), lädt dort ab („Matcha geliefert!“) und schiebt die
  leere Karre zurück; dann fährt der Wagen weiter. Sein Weg nutzt die Wegsuche der Figuren wie eine Bedienung.
- **Matcha-Vorrat im Lager** (Phase 3c, `STORAGE_TINS`): Die Matcha-Dosen in Eck- und Seitenregal zeigen den Vorrat, gemessen
  wie der Matcha-Hinweis im HUD in Öffnungstagen: ab 1 Tag voll, ab 0,5 halb, darunter wenig (mindestens eine Dose), ohne
  Matcha leer. Eine neue Lieferung zeigt das Regal erst, wenn der Lieferant sie abgeladen hat; dann ploppen die Regale. Die
  übrige Ware (Milch, Bohnen, Becher …) folgt weiter der Zahl der Geräte.
- **Geräusche** (Phase 3c, `data/audio.ts`, alles zur Laufzeit erzeugt): ein Glöckchen, wenn ein Gast durch die Tür kommt
  (höchstens alle 3,5 s), das Zischen des Milchschäumers, wenn ein Barista an Matcha-Station oder Kaffeemaschine die Milch
  eingießt (höchstens alle 4 s), Regenrauschen so laut wie der Regen und leises Stimmengemurmel, das mit den Gästen im Raum
  wächst (voll ab 16). Alles hängt am Effekte-Regler der Einstellungen.

## 8. Matcha-Einkauf und Sorten (Phase 3)

Vorgabe Vincent (2026-10-16): „Es soll Matcha bestellt und geliefert werden müssen. Besserer Matcha = höherer Preis, mehr
Nachfrage.“ Matcha liegt als Vorrat in Gramm je Sorte im Lager des Cafés (`LocationState.supply`); jedes Matcha-Produkt
verbraucht ein paar Gramm (§ 4: Matcha-Latte und Iced Matcha 3 g, Usucha 2 g, Zeremonie 8 g). Die Bar schenkt die gewählte Sorte
aus, solange sie vorrätig ist, sonst die beste vorrätige (`gradeInUse`). **Ohne Matcha** fallen die Matcha-Produkte von der Karte,
die Nachfrage sinkt auf 40 %, die Zufriedenheit um 12 (HUD-Chip, Toast, „Matcha leer!“ in der Szene).

| Sorte | Name | Ab Café-Level | Einkauf je kg (Berlin) | Preis der Matcha-Produkte | Nachfrage | Zufriedenheit |
|---|---|---|---|---|---|---|
| 0 | Culinary Grade (Kochqualität) | Start | 40 € | ×1,00 | ×1,00 | +0 |
| 1 | Café Grade | 2 | 80 € | ×1,08 | ×1,06 | +2 |
| 2 | Premium Grade | 4 | 150 € | ×1,18 | ×1,13 | +5 |
| 3 | Ceremonial Grade | 6 | 260 € | ×1,30 | ×1,22 | +8 |
| 4 | Ceremonial Reserve | 8 | 420 € | ×1,43 | ×1,31 | +11 |
| 5 | Meister-Auslese | 10 | 600 € | ×1,56 | ×1,40 | +14 |
| 6 | Uji First Flush | 12 | 850 € | ×1,70 | ×1,50 | +18 |

- **Bestellen** (`orderMatcha`): Packungen 250 g, 1 kg (−5 %) und 5 kg (−12 %); Preis = €/kg × Menge × (1 − Mengenrabatt) ×
  Preisniveau × (1 − Zen-Rabatt), sofort bezahlt (Tagesbilanz „Matcha-Einkauf“). Beispiel Berlin: 1 kg Culinary Grade 38 €,
  1 kg Uji First Flush 807,50 €.
- **Lieferung:** normal am nächsten Morgen um 7 Uhr (frühestens 6 Spielstunden nach der Bestellung, sonst einen Morgen später);
  **Express** nach 2 Spielstunden gegen 12 € + 15 % des Warenwerts (× Preisniveau). Höchstens 4 Bestellungen gleichzeitig unterwegs.
  Ein neues Café startet mit 400 g Kochqualität (reicht etwa einen Tag).
- **Automatische Nachbestellung** (Standard an, Packung wählbar, Standard 1 kg): um Mitternacht, wenn Vorrat und Lieferungen der
  gewählten Sorte für weniger als 1,2 Öffnungstage reichen (Tagesbedarf über die geöffneten Stunden), so viele Packungen, wie
  fehlen, als normale Lieferung. Reicht das Geld nicht, bestellt sie, was das Konto hergibt – weniger oder kleinere Packungen,
  notfalls eine günstigere Sorte – und zeigt einen Hinweis (`reorderFailed`), damit die Bar nicht ganz leer läuft.
- Lieferengpass-Event (§ 12): Die Sorte wirkt eine Stufe schlechter.
- Szene: Bei jeder Lieferung hält ein Lieferwagen vor der Tür, der Lieferant schiebt die Kartons bis ins Lager, und die
  Matcha-Dosen im Regal zeigen, wie lange der Vorrat reicht (§ 7.8, UI_STYLE § 4).

> Bis Phase 2: Qualitätsstufen 1–6 einmal mit Münzen kaufen (5 000 … 5e12), je Stufe Preis ×1,5 und +4 Zufriedenheit, kein Vorrat.

---

## 9. Social Media (Phase 3, ersetzt Marketing)

Vorgabe Vincent (2026-10-16): „keine Kampagnen, sondern einen Social-Media-Account, der wächst, weil man jeden Tag z. B. bis zu
3 Videos posten kann“. Jedes Café hat einen eigenen Account (`LocationState.social`, Start 40 Follower). Ein Video erreicht Views,
ein Teil der Zuschauer folgt; Follower bringen dauerhaft Gäste, frische Videos kurz einen Schub (Buzz), manchmal geht eins viral.

| Format | Ab Café-Level | Kosten (Berlin) | Reichweite | Folgen | Viral |
|---|---|---|---|---|---|
| Latte-Art-Clip | 1 | gratis | 220 Views | 3,5 % | 3 % |
| Barista-Tutorial | 1 (braucht einen Barista) | 8 € | 420 Views | 3 % | 5 % |
| Trend-Sound | 2 | gratis | 320 Views | 2,5 % | 10 % |
| Gesponserter Beitrag | 3 | 60 € | 2 400 Views | 1,2 % | 0 % |
| Influencer-Kooperation | 6 | 400 € | 9 000 Views | 2 % | 12 % |

```
reachMult   = (1 + F / 2 000)^0.5 × (1 + decor × 0.01) × (1 + Sorte × 0.05) × (1 + Manager-Stufe × 0.15) × (0.6 + Zufriedenheit / 125)
views       = reach × reachMult × (1 ± 0.3) × (viral ? 4 … 12 : 1)         Zufall je Video aus Spielstart, Standort und Nummer
followers  += views × conversion
buzz       += views / 40 000;  halbiert sich alle 4 Spielstunden           Nachfrage × (1 + min(0.6, buzz)), § 7.1
Follower-Nachfrage = 1 + 1.4 × F / (F + 12 000)                            sättigt bei ×2,4
```
- Bis zu **3 Videos je Spieltag** (die Posts des Social-Media-Managers zählen mit); darüber bis zu 2 **Bonus-Videos** je Tag für
  je 3 🍃 (das Video selbst kostet dann zusätzlich, was sein Format kostet).
- Wer an einem Tag nichts postet, verliert um Mitternacht 1,5 % seiner Follower.
- Der **Social-Media-Manager** (§ 6) postet um 10, 14 und 18 Uhr (Stufe n: die ersten n Termine) das erlaubte Format mit den meisten
  neuen Followern je Euro.
- Bezahlte Videos buchen unter „Social Media“ in der Tagesbilanz; Gratis-Videos gehen auch mit Konto im Minus.
- Events „Influencer-Besuch“ (+400) und „Food-Blogger“ (+200) bringen beim Start Follower (§ 12). Achievements für Videos und
  Follower, Tagesaufgabe „Poste 2 Videos“ (§ 13).

> Bis Phase 2: Kampagnen-Level (+5 % Spawn je Level, max 30) und aktive Kampagne (×2 Spawn für 10 min, 30 min Abklingzeit,
> mit 3 🍃 sofort beendbar).

---

## 10. Goldene Blätter (Premium, nur spielintern)

**Quellen (Richtwert ~15–25 🍃 pro aktiver Spielstunde in der Frühphase, später weniger pro Stunde, mehr pro Ereignis):**
- Achievements: 2–25 🍃 je nach Stufe
- Daily Quests: 3 × 3 🍃, Bonus 5 🍃 für alle drei
- Café-Level-Up ab Level 3: 1–3 🍃 (§ 5.3)
- Influencer-Drop: 1 % pro Influencer-Kunde (gedeckelt 10/Tag)
- Events: 3–8 🍃 bei Abschluss
- No-op-Monetarisierung: alle 20 Minuten aktiver Spielzeit ein „Gratis-Boost“-Button (ersetzt Rewarded Ad)

**Ausgaben:**

| Angebot | Kosten | Effekt |
|---|---|---|
| Zeitsprung 1 h / 4 h / 8 h | 5 / 15 / 25 🍃 | Gewinn aller Cafés nach allen Kosten für so viele echte Stunden Betrieb, sofort und zu 100 % (gemessen an einem Spieltag ab jetzt, nie negativ). Uhr, Lager, Event- und Boost-Timer laufen nicht mit – es ist Geld, keine Zeitreise |
| Boost ×2 Einkommen 30 min | 8 🍃 | stapelt nicht mit sich selbst, verlängert |
| Bonus-Video über das Tageslimit | 3 🍃 | höchstens 2 am Tag (§ 9) |
| Sofort-Fertigstellung Quest | 4 🍃 | Quest als erledigt |
| Skins (v1: 2 Beispiele, „Sakura-Bar“, „Neon-Kasse“) | 30 🍃 | kosmetisch |

Abstürze, Erstattungen und Käufe mit echtem Geld sind nicht Teil von v1; das Interface `MonetizationProvider` ist der einzige Einstiegspunkt dafür.

> Bis Phase 2: Zeitsprung = Einkommen der Zeit ohne Kosten; „Kampagnen-Abklingzeit beenden“ für 3 🍃; Café-Level-Blätter ab Level 5.

---

## 11. Prestige: Franchise-Reset und Zen

### 11.1 Reset
Pro Standort ab Café-Level 10 verfügbar. Setzt das Café auf den Start zurück: Startkapital (600 € × Preisniveau, plus Meta-Upgrade
„Startkapital“), ein Tisch, du an der Kasse und ein Barista, Matcha-Station Level 1, alle anderen Geräte und Ambiente auf 0,
400 g Kochqualität, ein frischer Social-Media-Account (40 Follower), leere Tagesbilanz und Kasse. Bleibt erhalten: `meta` (Zen,
Goldene Blätter, Achievements, Meta-Upgrades, freigeschaltete Standorte, Skins), die Statistik, `prestigeCount` (+1), der
Bestwert des Café-Levels (Filial-Bedingung, Blätter) und die Öffnungszeiten. Der Reset leert die Kasse – eine Filiale, die aus
dieser Kasse bezahlt werden soll (§ 3), vorher eröffnen.

### 11.2 Zen-Formel
```
zenGain = floor( 1.8 × sqrt( earnedThisRun / (6 000 × scale) ) × (1 + prestigeCount × 0.1) )
```
`earnedThisRun` = alles, was im Lauf hereinkam (bezahlte Bons inkl. Trinkgeld, Abwesenheit, Zeitsprung, Anfeuern,
Café-Level-Belohnung); Kosten ziehen nichts ab. `scale` = Preisniveau aus § 3, damit jeder Standort ähnliche Zen-Mengen liefert.
Dialog zeigt Vorschau. Richtwert: Ein erster Lauf mit rund 1 Mio. € Umsatz bringt 23 Zen (√(1 000 000 / 6 000) × 1,8).

### 11.3 Meta-Upgrades (Zen)

| ID | Effekt pro Stufe | Kosten Stufe 1 | Wachstum | Max |
|---|---|---|---|---|
| `globalIncome` | +10 % Umsatz alle Standorte | 5 | 1.5 | 50 |
| `startCapital` | Startkapital nach Reset + 8 Spielstunden Umsatz des Vor-Runs zur Hauptzeit × Stufe | 10 | 2.0 | 5 |
| `offlineEfficiency` | +5 % Offline-Effizienz (Basis 50 %, max 100 %) | 8 | 1.4 | 10 |
| `discount` | −2 % auf Geräte, Ambiente, Einstellungsgebühren und Matcha-Einkauf (nicht Löhne, Miete, Videos) | 12 | 1.6 | 15 |
| `tapPower` | Tap-Wert +50 % | 6 | 1.5 | 10 |
| `fastStart` | Erste N Geräte nach Reset sofort Level 5 | 25 | 2.5 | 4 |
| `satisfactionBase` | +2 Basis-Zufriedenheit | 10 | 1.5 | 10 |

`prestigeMult` in § 7.2 = `1 + globalIncome.level × 0.1`.

> Bis Phase 2: Zen-Divisor 1e6 (Tycoon-Münzen), Startkapital 10 min Einkommen je Stufe, Schnellstart Level 10.

---

## 12. Events und Boosts

### 12.1 Zufalls-Events (Seed-basiert, alle 20–45 min aktive Spielzeit eins, Dauer 3–10 min)

Phase 3: Events ändern, **was bestellt wird** (`stationAttachMult`), nicht die Preise – die Karte bleibt realistisch. Dauer und
Abstand laufen weiter in aktiver Spielzeit (echte Minuten), nicht in Spielzeit.

| ID | Name | Effekt | Abschluss-Belohnung |
|---|---|---|---|
| `heatwave` | Hitzewelle | Kühl-/Eisfach-Produkte ×2,2 bestellt, Nachfrage ×1,15 | 5 🍃 |
| `influencerVisit` | Influencer-Besuch | Nachfrage ×2,5 für 2 min, danach Zufriedenheit −10 (Ansturm); beim Start +400 Follower | 8 🍃 |
| `supplyShortage` | Lieferengpass | Matcha-Sorte wirkt eine Stufe schlechter; sofort beheben (Ersatzlieferant) für 3 Spielstunden Umsatz zur Hauptzeit, mindestens 20 % des Startkapitals (Tagesbilanz „Matcha-Einkauf“) | 5 🍃 wenn behoben |
| `foodBlogger` | Food-Blogger | Ofen ×2 und Kuchenvitrine ×1,5 bestellt, Nachfrage ×1,1; beim Start +200 Follower | 5 🍃 |
| `rainyDay` | Regentag | Nachfrage ×0,7, Trinkgeld ×2 (Gemütlichkeit) | 3 🍃 |

### 12.2 Kalender-Events (lokale Systemzeit, kein Server)
- `hanami` (20.3.–10.4.): Kirschblüten-Deko, Zufriedenheit +10, Zeremonie-Set ×2 bestellt
- `summerIced` (Juli–August): Kühl-/Eisfach ×1,5 bestellt
- `newYear` (31.12.–2.1.): Nachfrage ×1,4, Trinkgeld ×1,5
Kalender-Events sind rein lokal und bewusst ohne Serverzeit; Manipulation durch Uhr-Umstellen wird akzeptiert.

> Bis Phase 2: Hitzewelle Preis ×3 und Spawn ×1,3, Food-Blogger Ofen-Preis ×3, Neujahr alle Preise ×2, Hanami Zeremonie-Preis ×2,
> Sommer Eis-Preis ×1,5; Lieferengpass beheben für 5 min Einkommen.

### 12.3 Boost-Stacking
Boost-Typen: `income`, `spawn`, `speed`. Gleicher Typ aus gleicher Quelle verlängert statt zu stapeln. Verschiedene Quellen (Event, Blätter-Boost, Hype) multiplizieren sich. Maximaler Gesamt-Multiplikator pro Typ: ×12 (Schutz vor Exploits).

### 12.4 Wetter (Phase 3b, kosmetisch)
`core/weather.ts` (rein, ohne Zustand, nichts im Spielstand) bestimmt aus Standort und Spieltag das Wetter: Sonne, Wolken oder
Regen nach dem Klima der Stadt (`CLIMATE` in `data/weather.ts`, Berlin 40/35/25 %, Bali 50/15/35 %; derselbe Tag hat immer
dasselbe Wetter). Regentage haben einen Schauer, der zwischen 7 und 16 Uhr beginnt, 2–6 Spielstunden dauert und über 25
Spielminuten sanft einsetzt und aufhört; davor und danach ist es bewölkt. Der erste Spieltag ist immer sonnig. Events legen das
Wetter fest: Beim Regentag regnet es durchgehend, bei der Hitzewelle scheint die Sonne. Das Wetter ändert **keine Rate** – die
Wirkung des Regentags bleibt beim Event (§ 12.1). Die Szene zeigt Regentropfen, grauen Himmel, Wolkenschatten, Schirme für Gäste
draußen und lässt bei Regen niemanden neu auf die Terrasse; das HUD zeigt Sonne, Mond, Wolke oder Regen (UI_STYLE § 4).
Vincent (2026-10-19, nach PR #26): Das Wetter bleibt **reine Optik** („Nur Optik“ statt leichter oder deutlicher Wirkung auf
Gäste und Bestellungen). Dazu Regenrauschen (§ 7.8).

---

## 13. Achievements und Quests

### 13.1 Achievements (46)
Kategorien mit einer bis fünf Stufen: Lebenszeit-Umsatz (1 000 € / 25 000 € / 250 000 € / 2,5 Mio. € / 25 Mio. €), Gäste bedient, ein
Gerät auf Level 5/10/15/20, alle Geräte gekauft, Matcha-Sorte bestellt (Café Grade, Ceremonial Grade, Uji First Flush),
Café-Level 3/5/10/15/20, Zufriedenheit 90+ für 10 min, Personal voll, erster Reset und 5 Resets, Standorte, Taps/Hype, Events,
Spielzeit (1 h, 10 h, 100 h), Videos (1/25/200), Follower (10 000/100 000), Tagesaufgaben. Belohnung 2–25 🍃. Geheime (2): z. B.
„Nachtschicht“ (zwischen 2 und 4 Uhr spielen), „Blitzblank“.

### 13.2 Daily Quests
3 pro Tag, Reset lokale Mitternacht, aus Pool gezogen (Seed = Datum): „Bediene 500 Gäste“, „Kaufe 20 Ausstattungs-Level“,
„Erreiche 80 % Zufriedenheit“, „Poste 2 Videos“, „Bestelle Matcha beim Lieferanten“, „Beende ein Event“, „Tippe 100×“.
Je 3 🍃, alle drei +5 🍃. Nicht nachholbar.

> Bis Phase 2: Lebenszeit-Münzen 1 K … 1e15, Stations-Level 25/50/100/200, Kampagnen-Erfolge und -Quest, geheimes „Marketing max“.

---

## 14. Formel-Sammlung (Referenz für `core`, Phase 3)

```
Raten pro Spielstunde; geöffnet vergeht 1 Spielminute je echter Sekunde, geschlossen 6 (§ 7.6)
cost(level→level+n)   = base × g^level × (g^n − 1) / (g − 1) × (1 − discount) × scale                (Geräte, Höchstlevel 20)
ambienceCost(level)   = base × g^(level − startLevel) × scale × (1 − discount)
speed(s, level)       = 1 + (level − 1) × equipment.speedPerLevel (0.06)   (level ≥ 1)
speed(register, 0)    = order.handRegisterSpeed (0.6);  speed(servingStation, 0) = 1
menuTier(level)       = Stufe 1..5 ab Level MENU_LEVELS = 1 / 5 / 10 / 15 / 20
price_i               = menuTier_i.price × scale × (Matcha-Produkt ? grade.priceMult : 1)
avgTicket             = Σ_i attach_i × price_i
loadPerCustomer       = Σ_i attach_i × workMin_i / speed_i                                           Barista-Minuten je Gast
demand/h              = geöffnet ? 11 × location.demand × DEMAND_CURVE[h] × attraction × spawnMult : 0   (§ 7.1)
capacity/h            = (8 + Tische × 5) × spawnMult
spawnRate             = min(demand, capacity)
orderCap/h            = cashiers × speed(register) × speedBoost × 60 / order.orderMin (1)
prodCap/h             = baristaMin / load  bzw.  (baristaMin + waiterCap × 0.3) / (load + 0.3)      (§ 7.2)
waiterCap/h           = waiters × speed(servingStation) × speedBoost × 60 / 1.1
served                = min(spawnRate, orderCap, prodCap)
income/h              = served × avgTicket × incomeMult × prestigeMult × (1 + tipRate)
costs/h               = wages (geöffnet) + served × goodsPerGuest + rent/24 + (geöffnet ? utilities : 0)   (§ 7.7)
matchaGrams/h         = served × Σ_i attach_i × matchaGrams_i
dirt/h                = cleanliness.decayPerHour (2) + served × dirtPerCustomer (0.03)
clean/h               = cleaners × cleanPerCleanerPerHour (5) × dirtFactor (2) × (1 − cleanliness/100)
offlineCapDays        = [2, 4, 5, 6][manager.level]            (bester Filialleiter aller Standorte; ohne 2, mit bis 6)
offlineCap            = offlineCapDays × realSecondsPerDay(Öffnungszeiten des aktiven Cafés)    echte Zeit
offlineRun            = min(elapsed, offlineCap) × offlineEfficiency    so viel echte Zeit läuft das Café (direkt gebucht)
offlineEfficiency     = 0.5 + offlineEfficiency.level × 0.05          (max 1.0)
realSecondsPerDay     = offeneMinuten / 1 + geschlosseneMinuten / 6    (8–18 Uhr: 740 s)
cafeLevel             = Stufen-Tabelle BALANCE.cafeLevel.steps über Σ stationLevels (max 20)
zenGain               = floor(1.8 × sqrt(earnedThisRun / (6 000 × scale)) × (1 + prestigeCount × 0.1))
tapIncome             = income/h × 0.5 / 60 × (1 + tapPower.level × 0.5)        (geschlossen 0)
cafeLevelReward       = peakIncome/h × 1 je neuem Café-Level
timeSkip(h)           = Gewinn je echter Sekunde (ein Spieltag ab jetzt, ≥ 0) × h × 3 600
```
Abwesenheit (`core/economy/offline.ts`): Das Café läuft in der angerechneten Zeit wirklich – Gäste, Löhne, Miete, Matcha-Verbrauch,
Lieferungen, Nachbestellung –, nur ohne Boosts, Events und Influencer-Hype (deren Timer stehen still); das Ergebnis kann ein Verlust
sein. In Spieltagen statt Stunden, weil eine Spielstunde nur eine Minute dauert: Acht Stunden Schlaf wären sonst Wochen ohne Chef.

Alle zeitlich begrenzten Multiplikatoren werden in `core/economy/modifiers.ts` zentral gesammelt (`collectModifiers(state) → Modifiers`), damit Events, Boosts, Meta und Personal nicht verstreut multipliziert werden.

---

## 15. Balancing-Richtwerte (für `scripts/balance-sim.ts`, Greedy-Spieler, aktive Zeit, Berlin erster Lauf)

Phase 3: Die Sim spielt über die Spieluhr (eine echte Sekunde je Schritt) und kauft, was den Tagesgewinn am schnellsten
zurückzahlt: Geräte, Personal einstellen und entlassen, Ambiente, Matcha-Sorte, Öffnungszeiten, bis zu drei Videos am Tag,
Reset und Zen. Ein Tag laufende Kosten bleibt immer auf dem Konto. Ergebnis und Tagesbilanz je Spieltag: STATUS.md
„Balancing-Snapshot“ (`pnpm sim --hours 10`).

| Meilenstein | Zielzeit |
|---|---|
| Erster Kauf | < 30 s |
| Erster Tag mit Gewinn | 1. Tag |
| Café-Level 3 | < 10 min |
| Café-Level 5 | ~1 h |
| Café-Level 8 | ~3 h |
| Café-Level 10 (Reset möglich) | ~4 h |
| Café-Level 12 (Kyoto-Bedingung) | 5–6 h |
| Café-Level 15 | ~9 h |
| Matcha Sorte 1 | < 5 min |
| Matcha Sorte 3 | ~2 h |
| Matcha Sorte 5 | ~4 h |
| 1 000 Follower | ~3 h |
| Parkplatz Stufe 1 | ~2 h |
| Parkplatz Stufe 5 | ~7 h |
| Terrasse | ~3,5 h |
| Kyoto eröffnet | 6–7 h |
| Erster Franchise-Reset | ~10 h |
| Erstes Zufalls-Event | 20–45 min |

Weitere Ziele: Bon je Gast 5–50 € plus Trinkgeld (§ 4); ein Café, das nicht übertrieben einstellt, macht jeden Tag Gewinn (im
Sim ab Tag 1 durchgehend). Noch ohne Richtwert und im Sim nicht geprüft: die Abwesenheit (STATUS „Offen“) und die späten Standorte
(Tokio bis Bali; bis Phase 2 „alle 6 Standorte in 40–60 h, gestreckt über ~2–3 Wochen Idle“).

> Bis Phase 2: erstes Upgrade < 10 s, Kasse 1–2 min, Kühl-/Eisfach 10–15 min, erster Personal-Kauf ~5 min, Ofen ~30 min,
> Café-Level 10 ~90 min, Reset ~3 h, Kyoto 3–4 h, Offline-Rückkehr nach 8 h ≈ 1–2 große Käufe, Idle-Anteil 20–30 %.

---

## 16. UI-Screens

1. **Café-Ansicht** (Phaser) + **HUD** (DOM): Geld in €, 🍃, Spieltag und Uhr mit Wetter-Symbol (Sonne, Mond, Wolke, Regen) und „Geöffnet/Geschlossen“ (antippen → Betrieb), Umsatz pro Stunde bzw. Gewinn heute, Zufriedenheit, Standort, Matcha-Sorte, Hinweise (Engpass, Matcha knapp/aus, Konto im Minus), Boost-Timer, Event-Banner
2. **Stations-Panel** (Bottom-Sheet): Ausstattung mit Bereich, Produkt auf der Karte und nächstes Produkt, Preis je Stück, Bestellungen je 100 Gäste, Zubereitungszeit, Umsatz/h, Kapazität und Auslastung der Stufe, Kosten, ×1/×5/Max, Optik-Vorschau, Personal-Hinweis
3. **Shop-Übersicht**: Tabs Stationen / Ambiente (die Matcha-Sorten stehen im Einkauf)
4. **Personal**: Teamkosten, Pipeline-Karte zur Hauptzeit (vier Stufen, Engpass), Liste mit Köpfen/Stufen, Lohn je Stunde und Tag, Effekt in Zahlen, Einstellen und Entlassen, Auto-Kauf
5. **Social Media** (bis Phase 2: Marketing): Follower, Wirkung auf die Gäste, Videos heute, Formate mit erwarteten Views und Followern, Bonus-Video, letzte Videos
6. **Standorte**: Karte/Liste, Fortschritt, Freischalt-Bedingungen (Café-Level, Zen, Investition), Wechseln, Reset-Button je Standort
7. **Zen-Shop** (Meta-Upgrades)
8. **Blätter-Shop** (Zeitsprung, Boosts, Quests, Skins)
9. **Achievements / Quests / Statistik** (ein Screen, drei Tabs)
10. **Settings**: Sprache, Audio, Zahlenformat, Export/Import, Löschen, Lizenzen, Version
11. **Dialoge**: Abwesenheit (Spieltage, Gäste, Umsatz, Gewinn oder Verlust, Hinweis bei leerem Matcha-Lager), Reset-Bestätigung, Event-Start/-Ende, Tutorial-Schritte (10), Fehler/Backup
12. **Einkauf** (Phase 3): Lager mit Reichweite, Sorten (ausschenken, zum Bestellen wählen), Bestellung (Packung, Express), Lieferungen unterwegs, automatische Nachbestellung
13. **Betrieb & Bilanz** (Phase 3): Öffnungszeiten mit Tageskurve, Tagesbilanz heute und gestern, Service-Pipeline der aktuellen Stunde

Shop, Einkauf, Personal, Social Media und Betrieb sind die fünf Reiter des Verwaltungs-Screens (UI_STYLE § 3.9).

---

## 17. i18n-Konventionen

- Keys: `hud.coins`, `station.berlin.matchaStation.name`, `menu.matchaStation.1`, `staff.barista.name`, `staff.barista.effect`, `supply.order`, `social.format.latteArt.name`, `ui.buy.x5`, `dialog.offline.title`, `event.heatwave.name` …
- Platzhalter `{amount}`, `{time}`, `{count}`; Plural via `Intl.PluralRules` mit Suffix-Keys `.one`/`.other`.
- Zahlen: `formatNumber()` nutzt in beiden Sprachen dieselben Kurz-Suffixe `K/M/B/T/aa…`, nur der Dezimaltrenner ist lokal (DE `1,23 M`, EN `1.23 M`). So bleiben Zahlen zwischen Sprachen vergleichbar.
- Geld (Phase 3): `formatMoney()` als Euro-Betrag nach Sprache (DE „5,20 €“, EN „€5.20“; ab 10 000 € ohne Cent, ab 1 Mio. € kompakt).
- Zeitangaben: `3 h 12 min` / `3h 12m` je Sprache; Uhrzeiten der Spieluhr je Sprache („18:00“ / „6:00 PM“).
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

**Aktuell v11 (Phase 3, `mce.save.v11`):** global zusätzlich `clock` (Spielminuten) und `hourMark` (zuletzt abgerechnete volle
Stunde); je Standort zusätzlich `till` (offene Bons, v10), `hours`, `supply` (Vorrat je Sorte, Sorte im Ausschank, Bestellungen,
Nachbestellung), `social` (Follower, Buzz, Tageszähler, letzte Videos), `ledger` (heute, gestern), `bills` (offene Kosten, letzte
Abbuchung); `quality` und `marketing` entfallen; Statistik zählt `videos` und `matchaOrders` statt `campaigns`. Migration v10 → v11:
Jedes freigeschaltete Café beginnt in Euro neu (Startkapital × Preisniveau, ein Tisch, du an der Kasse und ein Barista, 400 g
Matcha); Franchise-Resets (`prestigeCount`), Zen, Goldene Blätter, Achievements, Meta-Upgrades, Standorte, Skins, Statistik und
Einstellungen bleiben; Lebenszeit-Einnahmen zählen in Euro neu ab 0; laufende Events und Boosts verfallen, die Tagesaufgaben werden
neu gezogen (Kampagnen-Quests ließen sich nicht mehr erfüllen), das Tutorial beginnt neu; die Uhr startet um 7:40 Uhr an Tag 1.
