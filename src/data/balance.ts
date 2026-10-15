/** Zentrale Balancing-Konstanten (GAME_DESIGN §§ 4, 7, 14). Nichts davon darf im Code stehen. */
export const BALANCE = {
  tickMs: 100,
  /** Obergrenze an Ticks pro Frame; der Rest wird als Offline-Lump gutgeschrieben. */
  maxTicksPerFrame: 1000,
  startCoins: 5,
  startSatisfaction: 50,
  /** Obergrenze für Kostenrabatte (Meta-Upgrade `discount`), damit nichts gratis wird. */
  maxDiscount: 0.9,

  /**
   * Café-Level aus der Summe der Stations-Level: `steps[i]` Level braucht der Schritt von Café-Level i+1
   * auf i+2, danach je `stepAfter`. Frühe Schritte sind größer, damit Iced-Bar/Bäckerei nicht zu früh
   * kommen (GAME_DESIGN § 15).
   */
  cafeLevel: {
    steps: [25, 35, 30, 23, 25, 25, 25, 25, 25, 22, 22, 22, 22] as readonly number[],
    stepAfter: 25,
    max: 50,
  },

  /** Level-Meilensteine; danach alle `stepAfter` Level. */
  milestones: {
    levels: [10, 25, 50, 100, 200, 300, 400, 500],
    stepAfter: 100,
    firstAlternatingIndex: 4,
  },

  spawn: {
    base: 0.17,
    cafeLevelExponent: 0.9,
    capacityBase: 2,
    perSeat: 2,
    perTerraceLevel: 5,
    capacityFactor: 0.1,
    perWifi: 0.03,
    perMarketing: 0.05,
    perSocialMedia: 0.05,
  },

  /** Ausstattung (GAME_DESIGN § 4): jedes Level über 1 macht das Gerät um diesen Anteil schneller. */
  equipment: { speedPerLevel: 0.02 },

  /** Bestelltheke (§ 7.2): Sekunden je Bestellung bei Tempo 1; ohne gekaufte Kasse zählt die Handkasse. */
  order: { orderTime: 2, handRegisterSpeed: 0.6 },

  /** Ausgabe (§ 7.2): Übergabe an der Theke oder Tischservice; Anteil der Gäste, die sich setzen. */
  service: { handoverTime: 3, tableServiceTime: 6, dineInShare: 0.6 },

  tips: { satisfactionFactor: 0.15, perMusicLevel: 0.005 },

  satisfaction: {
    base: 50,
    perDecor: 1,
    perQuality: 4,
    waitPressureWeight: 20,
    waitPressureMax: 2,
    cleanlinessNeutral: 70,
    cleanlinessWeight: 0.3,
    /** Anteil der Differenz zum Ziel, der pro Sekunde abgebaut wird. */
    approachPerSec: 0.02,
    factorBase: 0.5,
  },

  /** Sauberkeit 0..100 (GAME_DESIGN § 7.3), Raten pro Minute Spielzeit. */
  cleanliness: {
    start: 100,
    max: 100,
    /** Grund-Verschmutzung auch ohne Gäste … */
    decayPerMin: 2,
    /** … plus so viele Punkte je bedientem Gast. */
    dirtPerCustomer: 0.03,
    /** Jede Putzkraft schafft so viele Punkte/min bei leerem Café … */
    cleanPerCleanerPerMin: 5,
    /** … und bis zu diesem Faktor mehr, je dreckiger es ist (× (1 − Sauberkeit/100)). */
    dirtFactor: 2,
  },

  /** Marketing (GAME_DESIGN § 9). Zeiten in Spielsekunden (`playtimeSec`). */
  marketing: {
    /** Kampagnen-Level: Kosten Berlin; Basis ist im Design offen, siehe STATUS „Entscheidungen“. */
    baseCost: 500,
    growth: 1.6,
    maxLevel: 30,
    unlockCafeLevel: 2,
    /** Aktive Kampagne kostet so viele Sekunden aktuelles Einkommen … */
    campaignIncomeSec: 120,
    /** … mindestens aber so viele Münzen (× Standort-Skalierung). */
    campaignMinCost: 50,
    campaignSpawnMult: 2,
    campaignDurationSec: 600,
    cooldownSec: 1800,
    /** Abklingzeit × (1 − x)^socialMedia.level – multiplikativ, damit sie bei Stufe 15 nicht negativ wird. */
    cooldownReductionPerSocialMedia: 0.1,
    skipCooldownLeaves: 3,
  },

  /** Ab dieser Filialleiter-Stufe gibt es den Auto-Kauf-Schalter (GAME_DESIGN § 6). */
  manager: { autoBuyFromLevel: 1 },

  /** Tap-Bonus „Barista anfeuern“ (GAME_DESIGN § 7.4). */
  tap: {
    /** Sekunden Einkommen pro Tap. */
    incomeSeconds: 0.5,
    maxPerSec: 10,
    hypeMax: 30,
    hypeDurationSec: 10,
    hypeSpawnMult: 2,
    /** Hype verfällt langsam, damit der Balken aktives Spielen belohnt und nicht über Stunden gesammelt wird. */
    hypeDecayPerSec: 0.5,
    boostId: 'hype',
  },

  offline: {
    baseCapHours: 4,
    perManagerHours: 2,
    maxCapHours: 14,
    baseEfficiency: 0.5,
    maxEfficiency: 1,
  },
} as const;
