/**
 * Zentrale Balancing-Konstanten (GAME_DESIGN § 4, § 7, § 14; Phase 3 „realistisches Café“). Geld in Euro (Berlin,
 * andere Standorte mit ihrem Preisniveau), Raten pro Spielstunde, Zeiten in Spielminuten. Nichts davon im Code.
 */
export const BALANCE = {
  tickMs: 100,
  /** Obergrenze an Ticks pro Frame; der Rest wird als Offline-Lump gerechnet. */
  maxTicksPerFrame: 1000,
  /** Startkapital eines neuen Cafés (× Preisniveau des Standorts). */
  startCoins: 600,
  startSatisfaction: 55,
  /** Obergrenze für Kostenrabatte (Meta-Upgrade `discount`), damit nichts gratis wird. */
  maxDiscount: 0.9,

  /**
   * Café-Level aus der Summe der Geräte-Level: `steps[i]` Level braucht der Schritt von Café-Level i+1 auf i+2,
   * danach je `stepAfter`.
   */
  cafeLevel: {
    steps: [4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 13] as readonly number[],
    stepAfter: 14,
    max: 20,
  },

  /** Geräte (GAME_DESIGN § 4): jedes Level über 1 macht das Gerät um diesen Anteil schneller. */
  equipment: { speedPerLevel: 0.06 },

  /** Nachfrage (GAME_DESIGN § 7.1): Gäste je Spielstunde zur Hauptzeit, bevor Karte, Matcha, Deko … wirken. */
  demand: {
    basePerHour: 11,
    perDecor: 0.012,
    perWifi: 0.025,
    perParking: 0.05,
    /** Ein Matcha-Café ohne Matcha: so viel der Nachfrage bleibt. */
    noMatchaMult: 0.4,
    /** Follower ziehen Gäste an: × (1 + max × F / (F + half)). */
    followers: { max: 1.4, half: 12_000 },
    /** Frische Videos (Buzz) heben die Nachfrage höchstens um diesen Anteil. */
    buzzMax: 0.6,
  },

  /** Wie viele Gäste je Spielstunde das Café fasst: Mitnahme an der Theke plus Tische (je Tisch zwei Plätze). */
  capacity: {
    takeawayPerHour: 8,
    perTablePerHour: 5,
    /** Tische draußen je Terrassen-Stufe 0..3 (wie die sichtbaren Terrassen-Tische). */
    terraceTables: [0, 2, 5, 6] as readonly number[],
  },

  /** Bestelltheke (§ 7.2): Spielminuten je Bestellung bei Tempo 1; ohne gekaufte Kasse zählt die Handkasse. */
  order: { orderMin: 1, handRegisterSpeed: 0.6 },

  /**
   * Ausgabe (§ 7.2): Ohne Bedienung holen die Gäste an der Theke ab, der Barista ruft auf und reicht über die Theke
   * (`pickupMin` Barista-Zeit je Gast). Bedienungen übernehmen die Übergabe und bringen Sitzgästen an den Tisch.
   */
  service: {
    handoverMin: 0.5,
    tableServiceMin: 1.5,
    dineInShare: 0.6,
    pickupMin: 0.3,
    /** Zufriedenheit und Trinkgeld, wenn alle Gäste bedient werden (anteilig). */
    tableServiceSatisfaction: 6,
    tableServiceTips: 0.03,
  },

  tips: { satisfactionFactor: 0.1, perMusicLevel: 0.006 },

  satisfaction: {
    base: 50,
    perDecor: 1,
    waitPressureWeight: 20,
    waitPressureMax: 2,
    cleanlinessNeutral: 70,
    cleanlinessWeight: 0.3,
    /** Matcha ausverkauft. */
    noMatcha: -12,
    /** Anteil der Differenz zum Ziel, der je Spielminute (geöffnet) abgebaut wird. */
    approachPerMin: 0.02,
    factorBase: 0.5,
  },

  /** Sauberkeit 0..100 (GAME_DESIGN § 7.3), Raten pro Spielstunde, nur während der Öffnungszeit. */
  cleanliness: {
    start: 100,
    max: 100,
    decayPerHour: 2,
    /** … plus so viele Punkte je bedientem Gast. */
    dirtPerCustomer: 0.03,
    /** Jede Putzkraft schafft so viele Punkte/h bei leerem Café … */
    cleanPerCleanerPerHour: 5,
    /** … und bis zu diesem Faktor mehr, je dreckiger es ist (× (1 − Sauberkeit/100)). */
    dirtFactor: 2,
  },

  /** Miete & Nebenkosten (Berlin, × Preisniveau): Miete je Tag rund um die Uhr, Strom je geöffneter Stunde. */
  rent: {
    basePerDay: 45,
    perTerracePerDay: 12,
    perParkingPerDay: 6,
    utilitiesPerOpenHour: 1.5,
    perDevicePerOpenHour: 0.25,
  },

  /** Filialleiter: Auto-Kauf ab Stufe 1, lässt aber so viele Tage laufender Kosten auf dem Konto. */
  manager: { autoBuyFromLevel: 1, autoBuyReserveDays: 1 },

  /** Tap-Bonus „Barista anfeuern“ (GAME_DESIGN § 7.4). */
  tap: {
    /** Spielminuten Einnahmen pro Tap. */
    incomeMinutes: 0.5,
    maxPerSec: 10,
    hypeMax: 30,
    hypeDurationSec: 10,
    hypeSpawnMult: 2,
    /** Hype verfällt langsam, damit der Balken aktives Spielen belohnt und nicht über Stunden gesammelt wird. */
    hypeDecayPerSec: 0.5,
    boostId: 'hype',
  },

  /**
   * Abwesenheit: Das Café läuft weiter, höchstens so viele Spieltage und zu diesem Anteil der Zeit (Zen). In
   * Spieltagen statt Stunden, weil eine Spielstunde nur eine Minute dauert: Acht Stunden Schlaf wären sonst Wochen
   * ohne Chef, mit leerem Lager und Löhnen. Vorgabe Vincent: ohne Filialleiter 2 Spieltage – nach einer Nacht weg
   * bringt das bei 50 % etwa einen Tagesgewinn –, mit Filialleiter bis 6.
   */
  offline: {
    /** Deckel in Spieltagen je Stufe des besten Filialleiters (Index = Stufe 0 … 3); die erste Stufe zählt doppelt. */
    capDaysByManagerLevel: [2, 4, 5, 6],
    baseEfficiency: 0.5,
    maxEfficiency: 1,
  },
} as const;
