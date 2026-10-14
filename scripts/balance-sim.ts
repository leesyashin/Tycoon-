// Headless-Balancing-Simulation: Greedy-Spieler, aktive Zeit (GAME_DESIGN § 15).
import { STATIONS } from '@data/stations';
import { STAFF_ROLES } from '@data/staff';
import { AMBIENCE } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { buyStation, getBulkCost, isStationUnlocked } from '@core/economy/actions';
import {
  buyAmbience,
  getNextAmbienceCost,
  isAmbienceMaxed,
  isAmbienceUnlocked,
} from '@core/economy/ambience';
import { computeLocationRates, getIncomePerSec } from '@core/customers/rates';
import {
  cleanlinessEquilibrium,
  getNextStaffCost,
  hireStaff,
  isStaffMaxed,
  isStaffUnlocked,
} from '@core/staff';
import {
  buyMarketingLevel,
  campaignStatus,
  getCampaignCost,
  getMarketingLevelCost,
  isMarketingMaxed,
  isMarketingUnlocked,
  startCampaign,
} from '@core/marketing';
import { formatDuration, formatNumber } from '@core/math/format';
import type { Decimal } from '@core/math/bignum';

const LOC = 'berlin';
const STEP_MS = 1000;
const MAX_BUYS_PER_STEP = 200;
/** Iterationen, bis Zufriedenheit ↔ Wartezeit ↔ Spawnrate eingeschwungen sind. */
const SETTLE_ITERATIONS = 6;

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Einkommen, nachdem sich Sauberkeit und Zufriedenheit eingependelt haben. Sonst sähe der Greedy-
 * Spieler den Wert der Reinigungskraft nie, weil sie das Einkommen erst über Minuten verändert.
 */
function settledIncome(state: GameState): number {
  let s = state;
  const l0 = getLocation(s, LOC);
  s = withLocation(s, LOC, { ...l0, cleanliness: cleanlinessEquilibrium(l0) });
  for (let i = 0; i < SETTLE_ITERATIONS; i++) {
    const target = computeLocationRates(s, LOC).satisfaction.target;
    s = withLocation(s, LOC, { ...getLocation(s, LOC), satisfaction: target });
  }
  return getIncomePerSec(s, LOC).toNumber();
}

interface Candidate {
  kind: 'station' | 'staff' | 'ambience' | 'marketing';
  id: string;
  cost: Decimal;
  apply(s: GameState): GameState;
}

function candidates(state: GameState): Candidate[] {
  const out: Candidate[] = [];
  for (const def of STATIONS) {
    if (!isStationUnlocked(state, LOC, def.id)) continue;
    out.push({
      kind: 'station',
      id: def.id,
      cost: getBulkCost(state, LOC, def.id, 1),
      apply: (s) => buyStation(s, LOC, def.id, 1),
    });
  }
  for (const r of STAFF_ROLES) {
    if (!isStaffUnlocked(state, LOC, r.id) || isStaffMaxed(state, LOC, r.id)) continue;
    out.push({
      kind: 'staff',
      id: r.id,
      cost: getNextStaffCost(state, LOC, r.id),
      apply: (s) => hireStaff(s, LOC, r.id),
    });
  }
  for (const a of AMBIENCE) {
    if (!isAmbienceUnlocked(state, LOC, a.id) || isAmbienceMaxed(state, LOC, a.id)) continue;
    out.push({
      kind: 'ambience',
      id: a.id,
      cost: getNextAmbienceCost(state, LOC, a.id),
      apply: (s) => buyAmbience(s, LOC, a.id),
    });
  }
  if (isMarketingUnlocked(state, LOC) && !isMarketingMaxed(state, LOC)) {
    out.push({
      kind: 'marketing',
      id: 'level',
      cost: getMarketingLevelCost(state, LOC),
      apply: (s) => buyMarketingLevel(s, LOC),
    });
  }
  return out;
}

/** Wählt den Kauf mit der kürzesten Amortisation (Kosten / Zuwachs des eingeschwungenen Einkommens). */
function pickPurchase(state: GameState): Candidate | null {
  const loc = getLocation(state, LOC);
  const base = settledIncome(state);
  let best: { c: Candidate; payback: number } | null = null;
  for (const c of candidates(state)) {
    const rich = withLocation(state, LOC, { ...loc, coins: c.cost });
    const gain = settledIncome(c.apply(rich)) - base;
    // Ohne Zuwachs (z. B. Nachfrage-limitiert) bleibt nur der Preis als Tiebreaker.
    const payback = gain > 0 ? c.cost.toNumber() / gain : Number.MAX_VALUE;
    if (!best || payback < best.payback || (payback === best.payback && c.cost.lt(best.c.cost))) {
      best = { c, payback };
    }
  }
  return best?.c ?? null;
}

/** Kampagne nur, wenn sich die 10 Minuten ×2-Nachfrage rechnen. */
function maybeCampaign(state: GameState): GameState {
  const loc = getLocation(state, LOC);
  if (!isMarketingUnlocked(state, LOC)) return state;
  if (campaignStatus(loc, state.playtimeSec).phase !== 'ready') return state;
  const cost = getCampaignCost(state, LOC);
  if (loc.coins.lt(cost)) return state;
  const after = startCampaign(state, LOC);
  const gain =
    (getIncomePerSec(after, LOC).toNumber() - getIncomePerSec(state, LOC).toNumber()) *
    BALANCE.marketing.campaignDurationSec;
  return gain > cost.toNumber() ? after : state;
}

const hours = arg('hours', 2);
let state = createInitialState(0, 'en');
const reached = new Map<string, number>();
const mark = (key: string, t: number): void => {
  if (!reached.has(key)) reached.set(key, t);
};
let campaigns = 0;

for (let t = 0; t < hours * 3600; t += STEP_MS / 1000) {
  state = tick(state, STEP_MS);
  const before = state;
  state = maybeCampaign(state);
  if (state !== before) {
    campaigns++;
    mark('campaign', t);
  }
  for (let i = 0; i < MAX_BUYS_PER_STEP; i++) {
    const pick = pickPurchase(state);
    if (!pick || getLocation(state, LOC).coins.lt(pick.cost)) break;
    state = pick.apply(state);
    const loc = getLocation(state, LOC);
    mark('firstUpgrade', t);
    if (pick.kind === 'staff') mark('firstStaff', t);
    if (pick.kind === 'staff' && pick.id === 'cleaner') mark('cleaner', t);
    if ((loc.stations['checkout']?.level ?? 0) > 0) mark('checkout', t);
    for (const lv of [3, 5, 10, 15, 20]) if (loc.level >= lv) mark(`cafe${String(lv)}`, t);
  }
}

const fmt = (key: string): string => {
  const t = reached.get(key);
  return t === undefined ? '—' : formatDuration(t);
};
const rows: [string, string, string][] = [
  ['Erstes Upgrade', '< 10 s', fmt('firstUpgrade')],
  ['Zweite Station (Kasse)', '1–2 min', fmt('checkout')],
  ['Erster Personal-Kauf', '~5 min', fmt('firstStaff')],
  ['Erste Reinigungskraft', '–', fmt('cleaner')],
  ['Erste Kampagne', '–', fmt('campaign')],
  ['Iced-Bar (Café-Level 3)', '10–15 min', fmt('cafe3')],
  ['Bäckerei (Café-Level 5)', '~30 min', fmt('cafe5')],
  ['Café-Level 10', '~90 min', fmt('cafe10')],
  ['Café-Level 15', '–', fmt('cafe15')],
];
console.log(
  `Balance-Sim: ${String(hours)} h, Greedy-Spieler (Stationen, Personal, Ambiente, Marketing), Berlin`,
);
console.log('| Meilenstein | Zielzeit | Ist |');
console.log('|---|---|---|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
const loc = getLocation(state, LOC);
console.log(
  `Ende: Café-Level ${String(loc.level)}, Münzen ${formatNumber(loc.coins)}, Einkommen/s ${formatNumber(getIncomePerSec(state, LOC))}`,
);
console.log(
  `Zufriedenheit ${loc.satisfaction.toFixed(1)}, Sauberkeit ${loc.cleanliness.toFixed(1)}, Kampagnen ${String(campaigns)}, Marketing-Level ${String(loc.marketing.level)}`,
);
console.log(
  `Personal: ${
    Object.entries(loc.staff)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ') || '—'
  }; Ambiente: ${
    Object.entries(loc.ambience)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ') || '—'
  }`,
);
