import { DELIVERY, MATCHA_PACKAGES } from '@data/matcha';
import { getLocation, withLocation, type GameState, type LocationState } from '../GameState';
import { D, type Decimal } from '../math/bignum';
import { payCost } from '../economy/ledger';
import { getMetaEffects } from '../prestige/meta';
import { computeLocationRates } from '../customers/rates';
import {
  deliveryArrival,
  getExpressFee,
  getPackageCost,
  gramsInTransit,
  isGradeUnlocked,
  totalStock,
} from './stock';

/** Gesamtpreis einer Bestellung (`count` Packungen, Express mit Aufpreis), mit Zen-Rabatt. */
export function getOrderCost(
  state: GameState,
  locationId: string,
  grade: number,
  pkg: number,
  express: boolean,
  count = 1,
): Decimal {
  const goods = getPackageCost(grade, pkg, locationId, getMetaEffects(state).discount).mul(count);
  return express ? goods.add(getExpressFee(goods, locationId)) : goods;
}

export function canOrderMatcha(
  state: GameState,
  locationId: string,
  grade: number,
  pkg: number,
  express: boolean,
): boolean {
  const loc = getLocation(state, locationId);
  if (!MATCHA_PACKAGES[pkg] || !isGradeUnlocked(loc, grade)) return false;
  if (loc.supply.orders.length >= DELIVERY.maxOrders) return false;
  return loc.coins.gte(getOrderCost(state, locationId, grade, pkg, express));
}

function placeOrder(
  state: GameState,
  locationId: string,
  grade: number,
  grams: number,
  cost: Decimal,
  express: boolean,
): GameState {
  const loc = getLocation(state, locationId);
  const paid = payCost(loc, 'matcha', cost);
  const supply = {
    ...paid.supply,
    orders: [
      ...paid.supply.orders,
      { grade, grams, arriveAt: deliveryArrival(state.clock, express), express },
    ],
    bestGrade: Math.max(paid.supply.bestGrade, grade),
    reorderFailed: false,
  };
  const next = withLocation(state, locationId, { ...paid, supply });
  return { ...next, stats: { ...next.stats, matchaOrders: next.stats.matchaOrders + 1 } };
}

/**
 * Bestellt eine Packung Matcha beim Lieferanten (GAME_DESIGN § 8): bezahlt wird sofort, geliefert am nächsten
 * Morgen bzw. als Express nach `DELIVERY.expressHours`. Alter State, wenn gesperrt, zu viele unterwegs oder zu teuer.
 */
export function orderMatcha(
  state: GameState,
  locationId: string,
  grade: number,
  pkg: number,
  express = false,
): GameState {
  if (!canOrderMatcha(state, locationId, grade, pkg, express)) return state;
  const p = MATCHA_PACKAGES[pkg];
  if (!p) return state;
  const cost = getOrderCost(state, locationId, grade, pkg, express);
  return placeOrder(state, locationId, grade, p.grams, cost, express);
}

/** Sorte im Ausschank wählen (nur freigeschaltete); ist sie leer, schenkt die Bar die beste vorrätige aus. */
export function setServedGrade(state: GameState, locationId: string, grade: number): GameState {
  const loc = getLocation(state, locationId);
  if (!isGradeUnlocked(loc, grade) || loc.supply.grade === grade) return state;
  return withLocation(state, locationId, { ...loc, supply: { ...loc.supply, grade } });
}

/** Automatische Nachbestellung an/aus und Packungsgröße. */
export function setAutoReorder(
  state: GameState,
  locationId: string,
  on: boolean,
  pkg?: number,
): GameState {
  const loc = getLocation(state, locationId);
  const autoPackage = pkg !== undefined && MATCHA_PACKAGES[pkg] ? pkg : loc.supply.autoPackage;
  if (loc.supply.autoReorder === on && loc.supply.autoPackage === autoPackage) return state;
  return withLocation(state, locationId, {
    ...loc,
    supply: { ...loc.supply, autoReorder: on, autoPackage, reorderFailed: false },
  });
}

/**
 * Matcha-Verbrauch eines ganzen Öffnungstags in Gramm (Summe über die geöffneten Stunden), als hätte die Bar die
 * gewählte Sorte vorrätig – auch wenn das Lager gerade leer ist.
 */
export function dailyMatchaNeed(state: GameState, locationId: string): number {
  const loc = getLocation(state, locationId);
  const stock = [...loc.supply.stock];
  stock[loc.supply.grade] = Math.max(stock[loc.supply.grade] ?? 0, 1);
  const stocked: LocationState = { ...loc, supply: { ...loc.supply, stock } };
  const s = withLocation(state, locationId, stocked);
  let grams = 0;
  for (let h = loc.hours.open; h < loc.hours.close; h++) {
    grams += computeLocationRates(s, locationId, {
      hour: h,
      influencerHype: false,
    }).matchaGramsPerHour;
  }
  return grams;
}

/**
 * Für wie viele Öffnungstage der Vorrat noch reicht (`Infinity` ohne Verbrauch). Alle Sorten zählen: ist die
 * gewählte leer, schenkt die Bar die nächstbeste aus.
 */
export function stockDays(state: GameState, locationId: string): number {
  const need = dailyMatchaNeed(state, locationId);
  if (need <= 0) return Infinity;
  return totalStock(getLocation(state, locationId).supply) / need;
}

/** Matcha-Einkauf eines ganzen Öffnungstags in Euro (gewählte Sorte, Packung der automatischen Nachbestellung). */
export function dailyMatchaCost(state: GameState, locationId: string): Decimal {
  const sup = getLocation(state, locationId).supply;
  const p = MATCHA_PACKAGES[sup.autoPackage] ?? MATCHA_PACKAGES[0];
  if (!p) return D(0);
  const perGram = getOrderCost(state, locationId, sup.grade, sup.autoPackage, false).div(p.grams);
  return perGram.mul(dailyMatchaNeed(state, locationId));
}

/**
 * Was die Nachbestellung bei knappem Geld noch bestellen kann (höchstens `missing` Gramm): von der gewählten Sorte
 * so viele Packungen wie möglich (erst die eingestellte Größe, dann kleinere), sonst von einer günstigeren Sorte.
 */
function affordableReorder(
  state: GameState,
  locationId: string,
  missing: number,
): { grade: number; grams: number; cost: Decimal } | null {
  const loc = getLocation(state, locationId);
  const sup = loc.supply;
  for (let g = sup.grade; g >= 0; g--) {
    if (!isGradeUnlocked(loc, g)) continue;
    for (let k = Math.min(sup.autoPackage, MATCHA_PACKAGES.length - 1); k >= 0; k--) {
      const p = MATCHA_PACKAGES[k];
      if (!p) continue;
      const unit = getOrderCost(state, locationId, g, k, false);
      const want = Math.max(1, Math.ceil(missing / p.grams));
      const n = Math.min(want, Math.floor(loc.coins.div(unit).toNumber()));
      if (n >= 1) return { grade: g, grams: n * p.grams, cost: unit.mul(n) };
    }
  }
  return null;
}

/**
 * Automatische Nachbestellung (um Mitternacht, die Lieferung kommt morgens): reicht Vorrat + Unterwegs der gewählten
 * Sorte für weniger als `DELIVERY.reorderDays` Öffnungstage, bestellt das Café so viele Packungen nach, wie fehlen
 * (normale Lieferung). Reicht das Geld dafür nicht, bestellt es, was das Konto hergibt – weniger oder kleinere
 * Packungen, notfalls eine günstigere Sorte –, damit die Bar nicht ganz leer läuft, und merkt sich den Engpass für
 * einen Hinweis.
 */
export function autoReorderStep(state: GameState, locationId: string): GameState {
  const loc = getLocation(state, locationId);
  const sup = loc.supply;
  if (!sup.autoReorder || !isGradeUnlocked(loc, sup.grade)) return state;
  if (sup.orders.length >= DELIVERY.maxOrders) return state;
  const need = dailyMatchaNeed(state, locationId) * DELIVERY.reorderDays;
  const have = (sup.stock[sup.grade] ?? 0) + gramsInTransit(sup, sup.grade);
  if (need <= 0 || have >= need) return state;
  const p = MATCHA_PACKAGES[sup.autoPackage] ?? MATCHA_PACKAGES[0];
  if (!p) return state;
  const count = Math.max(1, Math.ceil((need - have) / p.grams));
  const cost = getOrderCost(state, locationId, sup.grade, sup.autoPackage, false, count);
  if (loc.coins.gte(cost))
    return placeOrder(state, locationId, sup.grade, p.grams * count, cost, false);
  const part = affordableReorder(state, locationId, need - have);
  if (!part) {
    if (sup.reorderFailed) return state;
    return withLocation(state, locationId, { ...loc, supply: { ...sup, reorderFailed: true } });
  }
  const placed = placeOrder(state, locationId, part.grade, part.grams, part.cost, false);
  const after = getLocation(placed, locationId);
  return withLocation(placed, locationId, {
    ...after,
    supply: { ...after.supply, reorderFailed: true },
  });
}
