import { BALANCE } from '@data/balance';
import { META_UPGRADES, getMetaUpgradeDef, type MetaUpgradeId } from '@data/prestige';
import { D, type Decimal } from '../math/bignum';
import type { GameState } from '../GameState';

export function getMetaLevel(state: GameState, id: MetaUpgradeId): number {
  return state.meta.metaUpgrades[id] ?? 0;
}

export function isMetaMaxed(state: GameState, id: MetaUpgradeId): boolean {
  return getMetaLevel(state, id) >= getMetaUpgradeDef(id).maxLevel;
}

/** Zen-Kosten der Stufe `level → level+1`: cost × growth^level (GAME_DESIGN § 11.3). */
export function getMetaUpgradeCost(id: MetaUpgradeId, level: number): Decimal {
  const def = getMetaUpgradeDef(id);
  return D(def.growth).pow(level).mul(def.cost).floor();
}

export function getNextMetaCost(state: GameState, id: MetaUpgradeId): Decimal | null {
  if (isMetaMaxed(state, id)) return null;
  return getMetaUpgradeCost(id, getMetaLevel(state, id));
}

export function buyMetaUpgrade(state: GameState, id: MetaUpgradeId): GameState {
  const cost = getNextMetaCost(state, id);
  if (!cost || state.meta.zen.lt(cost)) return state;
  return {
    ...state,
    meta: {
      ...state.meta,
      zen: state.meta.zen.sub(cost),
      metaUpgrades: { ...state.meta.metaUpgrades, [id]: getMetaLevel(state, id) + 1 },
    },
  };
}

/** Wie viele Stufen von `id` sich mit `zen` ab der aktuellen Stufe kaufen ließen (für die Reset-Vorschau). */
export function affordableMetaLevels(state: GameState, id: MetaUpgradeId, zen: Decimal): number {
  const def = getMetaUpgradeDef(id);
  let level = getMetaLevel(state, id);
  let left = zen;
  let n = 0;
  while (level < def.maxLevel) {
    const cost = getMetaUpgradeCost(id, level);
    if (left.lt(cost)) break;
    left = left.sub(cost);
    level++;
    n++;
  }
  return n;
}

/** Dauerhafte Effekte der Meta-Upgrades; `collectModifiers` und die Formeln lesen nur hier. */
export interface MetaEffects {
  /** `prestigeMult` aus GAME_DESIGN § 7.2. */
  incomeMult: number;
  discount: number;
  satisfactionBonus: number;
  /** Sekunden Vor-Run-Einkommen als Start-Münzen nach einem Reset. */
  startCapitalSec: number;
  /** Anzahl Stationen, die nach einem Reset auf `fastStartLevel` starten. */
  fastStartStations: number;
  fastStartLevel: number;
}

export function getMetaEffects(state: GameState): MetaEffects {
  const lvl = (id: MetaUpgradeId): number => getMetaLevel(state, id);
  const per = (id: MetaUpgradeId): number => getMetaUpgradeDef(id).perLevel;
  return {
    incomeMult: 1 + lvl('globalIncome') * per('globalIncome'),
    discount: Math.min(BALANCE.maxDiscount, lvl('discount') * per('discount')),
    satisfactionBonus: lvl('satisfactionBase') * per('satisfactionBase'),
    startCapitalSec: lvl('startCapital') * per('startCapital'),
    fastStartStations: lvl('fastStart'),
    fastStartLevel: per('fastStart'),
  };
}

export { META_UPGRADES };
