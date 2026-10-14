import { BOOSTS, LEAF_PRICES, SKINS, TIME_SKIPS, getSkinDef, type TimeSkipId } from '@data/leaves';
import { QUESTS } from '@data/quests';
import { spendLeaves, type GameState } from '../GameState';
import type { Decimal } from '../math/bignum';
import { creditIncome } from '../economy/offline';
import { addBoost } from '../events/boosts';
import { isQuestComplete, questStat } from '../progression/quests';

function timeSkipDef(id: TimeSkipId): (typeof TIME_SKIPS)[number] {
  const def = TIME_SKIPS.find((x) => x.id === id);
  if (!def) throw new Error(`Unknown time skip: ${id}`);
  return def;
}

/** Was ein Zeitsprung jetzt bringen würde (alle Standorte, 100 %, ohne zeitlich begrenzte Boosts). */
export function previewTimeSkip(state: GameState, id: TimeSkipId): Decimal {
  return creditIncome(state, timeSkipDef(id).hours * 3600).earned;
}

/**
 * Zeitsprung (GAME_DESIGN § 10): Einkommen der Zeit sofort zu 100 %, nicht zur Offline-Effizienz.
 * Spielzeit, Event- und Boost-Timer laufen nicht mit – es ist Geld, keine Zeitreise.
 */
export function buyTimeSkip(state: GameState, id: TimeSkipId): GameState {
  const def = timeSkipDef(id);
  const paid = spendLeaves(state, def.cost);
  if (!paid) return state;
  return creditIncome(paid, def.hours * 3600).state;
}

/** Boost ×2 Einkommen 30 min; erneuter Kauf verlängert. */
export function buyLeafBoost(state: GameState): GameState {
  const paid = spendLeaves(state, LEAF_PRICES.boost);
  return paid ? addBoost(paid, BOOSTS.leaf) : state;
}

/** Offene Quest sofort erledigen; abholen muss man sie weiter selbst. */
export function canCompleteQuestWithLeaves(state: GameState, index: number): boolean {
  const item = state.quests.items[index];
  return !!item && !item.claimed && !isQuestComplete(item);
}

export function completeQuestWithLeaves(state: GameState, index: number): GameState {
  if (!canCompleteQuestWithLeaves(state, index)) return state;
  const item = state.quests.items[index];
  const def = item && QUESTS.find((q) => q.id === item.id);
  if (!item || !def) return state;
  const paid = spendLeaves(state, LEAF_PRICES.questComplete);
  if (!paid) return state;
  // Zähler-Quests: Basiswert so setzen, dass der Fortschritt beim Nachziehen am Ziel bleibt.
  const base = def.kind === 'satisfaction' ? item.base : questStat(state, def.kind) - def.target;
  const items = state.quests.items.map((it, i) =>
    i === index ? { ...it, base, progress: def.target } : it,
  );
  return { ...paid, quests: { ...paid.quests, items } };
}

export function isSkinOwned(state: GameState, id: string): boolean {
  return state.meta.skins.owned.includes(id);
}

export function isSkinEquipped(state: GameState, id: string): boolean {
  return state.meta.skins.equipped.includes(id);
}

/** Skin kaufen und gleich anlegen. */
export function buySkin(state: GameState, id: string): GameState {
  const def = getSkinDef(id);
  if (!def || isSkinOwned(state, id)) return state;
  const paid = spendLeaves(state, def.cost);
  if (!paid) return state;
  const skins = paid.meta.skins;
  return {
    ...paid,
    meta: {
      ...paid.meta,
      skins: { owned: [...skins.owned, id], equipped: [...skins.equipped, id] },
    },
  };
}

export function toggleSkin(state: GameState, id: string): GameState {
  if (!isSkinOwned(state, id)) return state;
  const skins = state.meta.skins;
  const equipped = skins.equipped.includes(id)
    ? skins.equipped.filter((x) => x !== id)
    : [...skins.equipped, id];
  return { ...state, meta: { ...state.meta, skins: { ...skins, equipped } } };
}

/** Tönung je Station aus angelegten Skins (für die Szene). */
export function equippedSkinTints(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of SKINS) if (isSkinEquipped(state, s.id)) out[s.stationId] = s.tint;
  return out;
}
