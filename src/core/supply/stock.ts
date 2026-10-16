import { DELIVERY, MATCHA_GRADES, MATCHA_PACKAGES, getGradeDef } from '@data/matcha';
import { getLocationDef } from '@data/locations';
import { TIME } from '@data/time';
import { Decimal, D } from '../math/bignum';
import type { LocationState, SupplyOrder, SupplyState } from '../GameState';
import { dayOf } from '../time/clock';

/**
 * Sorte, die die Bar gerade ausschenkt: die gewählte, solange sie vorrätig ist, sonst die beste vorrätige;
 * −1, wenn kein Matcha mehr da ist (dann gibt es keine Matcha-Produkte, GAME_DESIGN § 8).
 */
export function gradeInUse(supply: SupplyState): number {
  if ((supply.stock[supply.grade] ?? 0) > 0) return supply.grade;
  for (let g = supply.stock.length - 1; g >= 0; g--) if ((supply.stock[g] ?? 0) > 0) return g;
  return -1;
}

/** Gramm Matcha im Lager (alle Sorten). */
export function totalStock(supply: SupplyState): number {
  return supply.stock.reduce((a, b) => a + Math.max(0, b), 0);
}

/** Gramm der Sorte, die gerade unterwegs sind. */
export function gramsInTransit(supply: SupplyState, grade?: number): number {
  return supply.orders
    .filter((o) => grade === undefined || o.grade === grade)
    .reduce((a, o) => a + o.grams, 0);
}

/** Kann der Lieferant die Sorte bei diesem Café-Level liefern? */
export function isGradeUnlocked(loc: LocationState, grade: number): boolean {
  const def = MATCHA_GRADES[grade];
  return !!def && loc.level >= def.unlockCafeLevel;
}

/** Warenwert einer Packung (Preisniveau des Standorts, Mengenrabatt, Zen-Rabatt). */
export function getPackageCost(
  grade: number,
  pkg: number,
  locationId: string,
  discount = 0,
): Decimal {
  const p = MATCHA_PACKAGES[pkg];
  if (!p) return D(0);
  const perKg = getGradeDef(grade).pricePerKg * getLocationDef(locationId).scale;
  return D((perKg * p.grams) / 1000).mul((1 - p.discount) * (1 - discount));
}

/** Aufpreis für Express-Lieferung auf eine Packung. */
export function getExpressFee(goods: Decimal, locationId: string): Decimal {
  return goods
    .mul(DELIVERY.expressFeeShare)
    .add(DELIVERY.expressFee * getLocationDef(locationId).scale);
}

/**
 * Ankunft (Spielminute) einer Bestellung, die zur Spieluhr-Zeit `clock` aufgegeben wird: Express nach ein paar
 * Stunden, sonst am nächsten Morgen zur Lieferstunde (mit Mindest-Vorlauf, sonst einen Morgen später).
 */
export function deliveryArrival(clock: number, express: boolean): number {
  if (express) return clock + DELIVERY.expressHours * 60;
  const day = dayOf(clock);
  let at = day * TIME.minutesPerDay + DELIVERY.standardHour * 60;
  while (at - clock < DELIVERY.minLeadHours * 60) at += TIME.minutesPerDay;
  return at;
}

/** Unter so wenig Gramm gilt eine Sorte als leer (Rundung beim Verbrauch über viele Abschnitte). */
const EMPTY_GRAMS = 1e-6;

/** Zieht `grams` von der Sorte im Ausschank ab (nie unter 0). */
export function consumeMatcha(supply: SupplyState, grams: number): SupplyState {
  if (!(grams > 0)) return supply;
  const g = gradeInUse(supply);
  if (g < 0) return supply;
  const stock = [...supply.stock];
  const left = (stock[g] ?? 0) - grams;
  stock[g] = left < EMPTY_GRAMS ? 0 : left;
  return { ...supply, stock };
}

/** Bestellungen, die bis `clock` angekommen sind, ins Lager; gibt dasselbe Objekt zurück, wenn keine kam. */
export function receiveDeliveries(supply: SupplyState, clock: number): SupplyState {
  if (!supply.orders.some((o) => o.arriveAt <= clock + 1e-9)) return supply;
  const stock = [...supply.stock];
  const orders: SupplyOrder[] = [];
  let delivered = supply.delivered;
  for (const o of supply.orders) {
    if (o.arriveAt <= clock + 1e-9) {
      stock[o.grade] = (stock[o.grade] ?? 0) + o.grams;
      delivered++;
    } else orders.push(o);
  }
  return { ...supply, stock, orders, delivered };
}

/** Früheste Ankunft einer offenen Bestellung (Spielminute) oder `Infinity`. */
export function nextArrival(supply: SupplyState): number {
  return supply.orders.reduce((m, o) => Math.min(m, o.arriveAt), Infinity);
}
