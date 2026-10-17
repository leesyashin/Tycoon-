/**
 * Matcha-Einkauf (Vorgabe Vincent, 2026-10-16: „Es soll Matcha bestellt und geliefert werden müssen. Besserer
 * Matcha = höherer Preis, mehr Nachfrage“). Matcha liegt als Vorrat in Gramm je Sorte im Lager; jedes
 * Matcha-Produkt verbraucht ein paar Gramm. Bestellt wird beim Lieferanten in Packungen, geliefert am nächsten
 * Morgen (oder als Express in zwei Stunden gegen Aufpreis). Ohne Vorrat gibt es keine Matcha-Produkte.
 * Euro-Werte für Berlin, andere Standorte × Preisniveau.
 */
export interface MatchaGradeDef {
  /** 0 = Kochqualität (Start) … 6 = Uji First Flush; Namen in i18n `quality.tier.<grade>.name`. */
  grade: number;
  /** Ab diesem Café-Level liefert der Lieferant die Sorte. */
  unlockCafeLevel: number;
  /** Einkaufspreis je Kilogramm. */
  pricePerKg: number;
  /** Preis-Faktor auf alle Matcha-Produkte. */
  priceMult: number;
  /** Nachfrage-Faktor: guter Matcha spricht sich herum. */
  demandMult: number;
  /** Zufriedenheits-Punkte. */
  satisfaction: number;
}

export const MATCHA_GRADES: readonly MatchaGradeDef[] = [
  {
    grade: 0,
    unlockCafeLevel: 1,
    pricePerKg: 40,
    priceMult: 1,
    demandMult: 1,
    satisfaction: 0,
  },
  {
    grade: 1,
    unlockCafeLevel: 2,
    pricePerKg: 80,
    priceMult: 1.08,
    demandMult: 1.06,
    satisfaction: 2,
  },
  {
    grade: 2,
    unlockCafeLevel: 4,
    pricePerKg: 150,
    priceMult: 1.18,
    demandMult: 1.13,
    satisfaction: 5,
  },
  {
    grade: 3,
    unlockCafeLevel: 6,
    pricePerKg: 260,
    priceMult: 1.3,
    demandMult: 1.22,
    satisfaction: 8,
  },
  {
    grade: 4,
    unlockCafeLevel: 8,
    pricePerKg: 420,
    priceMult: 1.43,
    demandMult: 1.31,
    satisfaction: 11,
  },
  {
    grade: 5,
    unlockCafeLevel: 10,
    pricePerKg: 600,
    priceMult: 1.56,
    demandMult: 1.4,
    satisfaction: 14,
  },
  {
    grade: 6,
    unlockCafeLevel: 12,
    pricePerKg: 850,
    priceMult: 1.7,
    demandMult: 1.5,
    satisfaction: 18,
  },
];

export const MAX_GRADE = MATCHA_GRADES.length - 1;

/** Packungen beim Lieferanten; größere sind je Kilo günstiger. */
export const MATCHA_PACKAGES: readonly { grams: number; discount: number }[] = [
  { grams: 250, discount: 0 },
  { grams: 1_000, discount: 0.05 },
  { grams: 5_000, discount: 0.12 },
];

export const DELIVERY = {
  /** Normale Lieferung kommt zu dieser Stunde am Morgen … */
  standardHour: 7,
  /** … frühestens so viele Spielstunden nach der Bestellung (sonst einen Morgen später). */
  minLeadHours: 6,
  /** Express: so viele Spielstunden, Aufpreis fest plus Anteil vom Warenwert. */
  expressHours: 2,
  expressFee: 12,
  expressFeeShare: 0.15,
  /** Automatische Nachbestellung, sobald Vorrat + Unterwegs für weniger als so viele Öffnungstage reicht. */
  reorderDays: 1.2,
  /** Höchstens so viele Bestellungen gleichzeitig unterwegs. */
  maxOrders: 4,
  /** Vorrat beim Start eines Cafés (Kochqualität), reicht etwa einen Tag. */
  startStockGrams: 400,
} as const;

export function getGradeDef(grade: number): MatchaGradeDef {
  const def = MATCHA_GRADES[grade];
  if (!def) throw new Error(`Unknown matcha grade: ${String(grade)}`);
  return def;
}
