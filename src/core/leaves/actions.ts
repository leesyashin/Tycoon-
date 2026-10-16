import { BOOSTS, LEAF_PRICES, SKINS, TIME_SKIPS, getSkinDef, type TimeSkipId } from '@data/leaves';
import { QUESTS } from '@data/quests';
import { getLocation, spendLeaves, type GameState } from '../GameState';
import { D, Decimal } from '../math/bignum';
import { simulateAway } from '../economy/offline';
import { addBoost } from '../events/boosts';
import { isQuestComplete, questStat } from '../progression/quests';
import { realSecondsPerDay } from '../time/clock';

function timeSkipDef(id: TimeSkipId): (typeof TIME_SKIPS)[number] {
  const def = TIME_SKIPS.find((x) => x.id === id);
  if (!def) throw new Error(`Unknown time skip: ${id}`);
  return def;
}

const profitCache = new WeakMap<GameState, Record<string, Decimal>>();

/**
 * Gewinn je echter Sekunde Café-Betrieb je Standort, gemessen an einem ganzen Spieltag ab jetzt (alle Kosten,
 * Matcha-Verbrauch, ohne zeitlich begrenzte Boosts); nie negativ.
 */
export function profitPerRealSecond(state: GameState): Record<string, Decimal> {
  const cached = profitCache.get(state);
  if (cached) return cached;
  const daySec = realSecondsPerDay(getLocation(state, state.activeLocationId).hours);
  const after = simulateAway(state, daySec);
  const out: Record<string, Decimal> = {};
  for (const id of Object.keys(state.locations)) {
    const delta = getLocation(after, id).coins.sub(getLocation(state, id).coins);
    out[id] = Decimal.max(delta, 0).div(daySec);
  }
  profitCache.set(state, out);
  return out;
}

/** Was ein Zeitsprung jetzt bringen würde (Gewinn aller Cafés, 100 %, ohne zeitlich begrenzte Boosts). */
export function previewTimeSkip(state: GameState, id: TimeSkipId): Decimal {
  const sec = timeSkipDef(id).hours * 3600;
  return Object.values(profitPerRealSecond(state)).reduce((a, v) => a.add(v.mul(sec)), D(0));
}

/**
 * Zeitsprung (GAME_DESIGN § 10): der Gewinn der Zeit sofort zu 100 %, nicht zur Offline-Effizienz. Uhr, Lager,
 * Event- und Boost-Timer laufen nicht mit – es ist Geld, keine Zeitreise.
 */
export function buyTimeSkip(state: GameState, id: TimeSkipId): GameState {
  const def = timeSkipDef(id);
  const per = profitPerRealSecond(state);
  const paid = spendLeaves(state, def.cost);
  if (!paid) return state;
  const sec = def.hours * 3600;
  const locations = { ...paid.locations };
  let total = D(0);
  for (const [locId, rate] of Object.entries(per)) {
    const loc = getLocation(paid, locId);
    const gain = rate.mul(sec);
    total = total.add(gain);
    locations[locId] = {
      ...loc,
      coins: loc.coins.add(gain),
      earnedThisRun: loc.earnedThisRun.add(gain),
    };
  }
  return {
    ...paid,
    locations,
    meta: { ...paid.meta, lifetimeEarned: paid.meta.lifetimeEarned.add(total) },
  };
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
