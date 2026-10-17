import { BALANCE } from '@data/balance';
import { getMetaUpgradeDef } from '@data/prestige';
import { Decimal, D } from '../math/bignum';
import { getLocation, withLocation, type ActiveBoost, type GameState } from '../GameState';
import { computeLocationRates } from './rates';
import { addToLedger } from '../economy/ledger';

export interface TapResult {
  state: GameState;
  /** Gutgeschriebenes Geld (0, wenn der Tap über dem Deckel lag). */
  gained: Decimal;
  accepted: boolean;
  /** true, wenn dieser Tap den Hype-Balken gefüllt und den Boost gestartet hat. */
  hypeTriggered: boolean;
}

/**
 * Geld pro Tap (Trinkgeld der Anfeuerung): Umsatz/h × 0,5 Spielminuten / 60 × (1 + tapPower × 0,5)
 * (GAME_DESIGN § 14). Nachts (geschlossen) bringt Anfeuern nichts.
 */
export function getTapIncome(state: GameState, locationId: string): Decimal {
  const t = BALANCE.tap;
  const power = state.meta.metaUpgrades['tapPower'] ?? 0;
  return computeLocationRates(state, locationId)
    .incomePerHour.mul(t.incomeMinutes / 60)
    .mul(1 + power * getMetaUpgradeDef('tapPower').perLevel);
}

/** „Barista anfeuern“: sofortiges Einkommen, Deckel pro Spielsekunde, Hype-Balken → Spawn-Boost. */
export function tapCafe(state: GameState, locationId: string): TapResult {
  const t = BALANCE.tap;
  const second = Math.floor(state.playtimeSec);
  const sameWindow = state.tap.windowStart === second;
  const windowTaps = sameWindow ? state.tap.windowTaps : 0;
  if (windowTaps >= t.maxPerSec) {
    return { state, gained: D(0), accepted: false, hypeTriggered: false };
  }

  const gained = getTapIncome(state, locationId);
  const loc = getLocation(state, locationId);
  let next = withLocation(state, locationId, {
    ...loc,
    coins: loc.coins.add(gained),
    earnedThisRun: loc.earnedThisRun.add(gained),
    ledger: addToLedger(loc.ledger, { bonus: gained }),
  });

  let hype = state.tap.hype + 1;
  let boosts = state.boosts;
  const hypeTriggered = hype >= t.hypeMax;
  if (hypeTriggered) {
    hype = 0;
    const boost: ActiveBoost = {
      id: t.boostId,
      until: state.playtimeSec + t.hypeDurationSec,
      spawnMult: t.hypeSpawnMult,
      incomeMult: 1,
      speedMult: 1,
    };
    // Ein neuer Hype verlängert den alten statt sich zu stapeln.
    boosts = [...boosts.filter((b) => b.id !== t.boostId), boost];
  }

  next = {
    ...next,
    meta: { ...next.meta, lifetimeEarned: next.meta.lifetimeEarned.add(gained) },
    boosts,
    tap: { hype, windowStart: second, windowTaps: windowTaps + 1 },
    stats: {
      ...next.stats,
      taps: next.stats.taps + 1,
      hypeFills: next.stats.hypeFills + (hypeTriggered ? 1 : 0),
    },
  };
  return { state: next, gained, accepted: true, hypeTriggered };
}

/** Anteil 0..1 des Hype-Balkens, für die Anzeige. */
export function getHypeProgress(state: GameState): number {
  return Math.min(1, state.tap.hype / BALANCE.tap.hypeMax);
}

/** Restsekunden des aktiven Hype-Boosts, 0 wenn keiner läuft. */
export function getHypeRemaining(state: GameState): number {
  const b = state.boosts.find((x) => x.id === BALANCE.tap.boostId);
  return b ? Math.max(0, b.until - state.playtimeSec) : 0;
}
