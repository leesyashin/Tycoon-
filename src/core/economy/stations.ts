import { BALANCE } from '@data/balance';
import { getLocationDef } from '@data/locations';
import { getGradeDef } from '@data/matcha';
import {
  MENU_LEVELS,
  REGISTER_ID,
  menuTierIndex,
  type MenuTier,
  type StationDef,
} from '@data/stations';
import { Decimal, D } from '../math/bignum';

/** Wie viele Level ab `level` noch gekauft werden können (Höchstlevel). */
export function levelsLeft(def: StationDef, level: number): number {
  return Math.max(0, def.maxLevel - level);
}

/**
 * cost(level→level+n) = base × g^level × (g^n − 1) / (g − 1) × (1 − discount) × Preisniveau, n höchstens bis zum
 * Höchstlevel.
 */
export function getStationCost(
  def: StationDef,
  level: number,
  amount: number,
  locationId: string,
  discount = 0,
): Decimal {
  const n = Math.min(amount, levelsLeft(def, level));
  if (n <= 0) return D(0);
  const g = def.growth;
  const scale = getLocationDef(locationId).scale;
  return D(g)
    .pow(level)
    .mul(D(g).pow(n).sub(1))
    .div(g - 1)
    .mul(def.baseCost * scale * (1 - discount));
}

/** Größtes n (bis zum Höchstlevel) mit cost(level→level+n) ≤ coins. */
export function getMaxAffordable(
  def: StationDef,
  level: number,
  coins: Decimal,
  locationId: string,
  discount = 0,
): number {
  const left = levelsLeft(def, level);
  let n = 0;
  while (n < left && getStationCost(def, level, n + 1, locationId, discount).lte(coins)) n++;
  return n;
}

/**
 * Arbeitstempo der Ausstattung (GAME_DESIGN § 4): jedes Level über 1 macht sie schneller. Ohne Level: Kasse =
 * Handkasse, Ausgabe-Station = Tempo 1 (Bedienungen arbeiten auch so), Produktlinie = 0 (nicht auf der Karte).
 */
export function getStationSpeed(def: StationDef, level: number): number {
  if (level <= 0) {
    if (def.id === REGISTER_ID) return BALANCE.order.handRegisterSpeed;
    return def.area === 'service' ? 1 : 0;
  }
  return 1 + (level - 1) * BALANCE.equipment.speedPerLevel;
}

/** Spielminuten je Vorgang bei diesem Level (`Infinity`, wenn das Gerät nicht arbeitet). */
export function getStationWorkMinutes(def: StationDef, level: number): number {
  const speed = getStationSpeed(def, level);
  return speed > 0 ? def.workMin / speed : Infinity;
}

/** Stufe der Speisekarte bei diesem Level (`null` ohne Produkt). */
export function menuTier(def: StationDef, level: number): MenuTier | null {
  if (def.menu.length === 0) return null;
  return def.menu[Math.min(def.menu.length, menuTierIndex(level)) - 1] ?? null;
}

/** Level, ab dem die nächste Stufe der Karte gilt; `null` auf der letzten. */
export function nextMenuLevel(level: number): number | null {
  return MENU_LEVELS.find((l) => l > Math.max(level, 1)) ?? null;
}

/**
 * Preis je Stück beim aktuellen Level: Karte × Preisniveau, Matcha-Produkte × Faktor der Sorte im Ausschank
 * (`grade` < 0: Sorte egal bzw. nicht vorrätig). 0 ohne Level oder ohne Produkt.
 */
export function getItemPrice(
  def: StationDef,
  level: number,
  locationId: string,
  grade = 0,
): Decimal {
  const tier = level > 0 ? menuTier(def, level) : null;
  if (!tier) return D(0);
  const gradeMult = def.matchaGrams > 0 && grade >= 0 ? getGradeDef(grade).priceMult : 1;
  return D(tier.price * getLocationDef(locationId).scale * gradeMult);
}
