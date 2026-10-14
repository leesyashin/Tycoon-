/** Zentrale Balancing-Konstanten (GAME_DESIGN §§ 4, 7, 14). Nichts davon darf im Code stehen. */
export const BALANCE = {
  tickMs: 100,
  /** Obergrenze an Ticks pro Frame; der Rest wird als Offline-Lump gutgeschrieben. */
  maxTicksPerFrame: 1000,
  startCoins: 5,
  startSatisfaction: 50,

  cafeLevel: { stationLevelsPerCafeLevel: 25, max: 50 },

  /** Level-Meilensteine; danach alle `stepAfter` Level. */
  milestones: {
    levels: [10, 25, 50, 100, 200, 300, 400, 500],
    stepAfter: 100,
    firstAlternatingIndex: 4,
  },

  spawn: {
    base: 0.25,
    cafeLevelExponent: 0.9,
    capacityBase: 2,
    perSeat: 2,
    perTerraceLevel: 5,
    capacityFactor: 0.1,
    perWifi: 0.03,
    perMarketing: 0.05,
    perSocialMedia: 0.05,
  },

  checkout: {
    base: 0.5,
    levelExponent: 0.8,
    perCashier: 0.2,
    /** Durchsatz ohne gekaufte Kasse (Handkasse), damit der Start nicht bei 0 hängt. */
    baselineThroughput: 0.3,
  },

  tips: { satisfactionFactor: 0.15, perMusicLevel: 0.005 },

  satisfaction: {
    base: 50,
    perDecor: 1,
    perQuality: 4,
    perTeaMaster: 2,
    waitPressureWeight: 20,
    waitPressureMax: 2,
    cleanlinessNeutral: 70,
    cleanlinessWeight: 0.3,
    /** Bis das Reinigungs-System (S4) existiert, gilt dieser feste Wert. */
    cleanlinessDefault: 70,
    /** Anteil der Differenz zum Ziel, der pro Sekunde abgebaut wird. */
    approachPerSec: 0.02,
    factorBase: 0.5,
  },

  /** Tap-Bonus „Barista anfeuern“ (GAME_DESIGN § 7.4). */
  tap: {
    /** Sekunden Einkommen pro Tap. */
    incomeSeconds: 0.5,
    perTapPowerLevel: 0.5,
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
    perEfficiencyLevel: 0.05,
    maxEfficiency: 1,
  },
} as const;
