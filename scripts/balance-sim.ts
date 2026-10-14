// Headless-Balancing-Simulation: Greedy-Spieler, aktive Zeit (GAME_DESIGN § 15).
import { STATIONS } from '@data/stations';
import { STAFF_ROLES } from '@data/staff';
import { AMBIENCE } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { buyStation, getBulkCost, isStationUnlocked, needsTerrace } from '@core/economy/actions';
import { buyQuality, getNextQualityCost, isNextQualityUnlocked } from '@core/progression';
import {
  buyAmbience,
  getNextAmbienceCost,
  isAmbienceMaxed,
  isAmbienceUnlocked,
} from '@core/economy/ambience';
import { computeLocationRates, getIncomePerSec } from '@core/customers/rates';
import {
  buyMetaUpgrade,
  canReset,
  computeZenGain,
  franchiseReset,
  getNextMetaCost,
} from '@core/prestige';
import {
  canUnlockLocation,
  getLocationRequirement,
  getNextLockedLocation,
  unlockLocation,
} from '@core/progression/locations';
import { LOCATIONS } from '@data/locations';
import type { MetaUpgradeId } from '@data/prestige';
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
import { D, type Decimal } from '@core/math/bignum';

/** Start-Standort; die Meilensteine der Tabelle beziehen sich auf ihn (erster Run). */
const LOC = 'berlin';
const STEP_MS = 1000;
/** Reset ohne neuen Standort erst, wenn er mindestens so viel Zen bringt … */
const RESET_MIN_ZEN = 20;
/** … und der Run stockt: so lange kein Café-Level-Aufstieg mehr. */
const RESET_STALL_SEC = 3600;
const MAX_BUYS_PER_STEP = 200;
/** Iterationen, bis Zufriedenheit ↔ Wartezeit ↔ Spawnrate eingeschwungen sind. */
const SETTLE_ITERATIONS = 6;
/** Café-Level-Jagd: so viele Sekunden Einkommen ist dem Greedy-Spieler das nächste Café-Level wert. */
const LEVEL_CHASE_SEC = 60;

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Einkommen, nachdem sich Sauberkeit und Zufriedenheit eingependelt haben. Sonst sähe der Greedy-
 * Spieler den Wert der Reinigungskraft nie, weil sie das Einkommen erst über Minuten verändert.
 */
function settledIncome(state: GameState, id: string): number {
  let s = state;
  const l0 = getLocation(s, id);
  s = withLocation(s, id, { ...l0, cleanliness: cleanlinessEquilibrium(l0) });
  for (let i = 0; i < SETTLE_ITERATIONS; i++) {
    const target = computeLocationRates(s, id).satisfaction.target;
    s = withLocation(s, id, { ...getLocation(s, id), satisfaction: target });
  }
  return getIncomePerSec(s, id).toNumber();
}

interface Candidate {
  kind: 'station' | 'staff' | 'ambience' | 'marketing' | 'quality';
  id: string;
  cost: Decimal;
  apply(s: GameState): GameState;
}

function candidates(state: GameState, id: string): Candidate[] {
  const out: Candidate[] = [];
  for (const def of STATIONS) {
    if (!isStationUnlocked(state, id, def.id)) continue;
    out.push({
      kind: 'station',
      id: def.id,
      cost: getBulkCost(state, id, def.id, 1),
      apply: (s) => buyStation(s, id, def.id, 1),
    });
  }
  for (const r of STAFF_ROLES) {
    if (!isStaffUnlocked(state, id, r.id) || isStaffMaxed(state, id, r.id)) continue;
    out.push({
      kind: 'staff',
      id: r.id,
      cost: getNextStaffCost(state, id, r.id),
      apply: (s) => hireStaff(s, id, r.id),
    });
  }
  for (const a of AMBIENCE) {
    if (!isAmbienceUnlocked(state, id, a.id) || isAmbienceMaxed(state, id, a.id)) continue;
    out.push({
      kind: 'ambience',
      id: a.id,
      cost: getNextAmbienceCost(state, id, a.id),
      apply: (s) => buyAmbience(s, id, a.id),
    });
  }
  const qualityCost = getNextQualityCost(state, id);
  if (qualityCost && isNextQualityUnlocked(state, id)) {
    out.push({
      kind: 'quality',
      id: String(getLocation(state, id).quality + 1),
      cost: qualityCost,
      apply: (s) => buyQuality(s, id),
    });
  }
  if (isMarketingUnlocked(state, id) && !isMarketingMaxed(state, id)) {
    out.push({
      kind: 'marketing',
      id: 'level',
      cost: getMarketingLevelCost(state, id),
      apply: (s) => buyMarketingLevel(s, id),
    });
  }
  return out;
}

/** Wählt den Kauf mit der kürzesten Amortisation (Kosten / Zuwachs des eingeschwungenen Einkommens). */
function pickPurchase(state: GameState, id: string): Candidate | null {
  const loc = getLocation(state, id);
  const base = settledIncome(state, id);
  let best: { c: Candidate; payback: number } | null = null;
  // Terrasse schaltet Stationen frei (Platz); das sieht die Einkommens-Bewertung nicht, also Vorrang.
  const blocked = STATIONS.some(
    (d) => loc.level >= d.unlockCafeLevel && needsTerrace(state, id, d.id),
  );
  for (const c of candidates(state, id)) {
    if (blocked && c.kind === 'ambience' && c.id === 'terrace') return c;
    const rich = withLocation(state, id, { ...loc, coins: c.cost });
    const gain = settledIncome(c.apply(rich), id) - base;
    // Ohne Zuwachs (z. B. Nachfrage-limitiert) bleibt nur der Preis als Tiebreaker.
    const payback = gain > 0 ? c.cost.toNumber() / gain : Number.MAX_VALUE;
    if (!best || payback < best.payback || (payback === best.payback && c.cost.lt(best.c.cost))) {
      best = { c, payback };
    }
  }
  return best?.c ?? null;
}

/**
 * Café-Level-Jagd: Spieler kaufen günstige Level breit, um das nächste Café-Level (Freischaltungen,
 * Belohnung) zu erreichen. Die reine Amortisation sieht das nicht, weil neue Stationen auf Level 1
 * kaum Kunden abbekommen. Lohnt sich, wenn der restliche Weg höchstens `LEVEL_CHASE_SEC` Einkommen kostet.
 */
function levelChase(state: GameState, id: string): Candidate | null {
  const loc = getLocation(state, id);
  const total = Object.values(loc.stations).reduce((a, x) => a + x.level, 0);
  const missing =
    BALANCE.cafeLevel.stationLevelsPerCafeLevel -
    (total % BALANCE.cafeLevel.stationLevelsPerCafeLevel);
  let s = withLocation(state, id, { ...loc, coins: D(1e300) });
  let pathCost = 0;
  let first: Candidate | null = null;
  for (let i = 0; i < missing; i++) {
    let cheapest: { id: string; cost: Decimal } | null = null;
    for (const def of STATIONS) {
      if (!isStationUnlocked(s, id, def.id)) continue;
      const cost = getBulkCost(s, id, def.id, 1);
      if (!cheapest || cost.lt(cheapest.cost)) cheapest = { id: def.id, cost };
    }
    if (!cheapest) return null;
    const sid = cheapest.id;
    first ??= {
      kind: 'station',
      id: sid,
      cost: cheapest.cost,
      apply: (x) => buyStation(x, id, sid, 1),
    };
    pathCost += cheapest.cost.toNumber();
    s = buyStation(s, id, sid, 1);
  }
  const budget = getIncomePerSec(state, id).toNumber() * LEVEL_CHASE_SEC;
  return pathCost <= budget ? first : null;
}

/** Kampagne nur, wenn sich die 10 Minuten ×2-Nachfrage rechnen. */
function maybeCampaign(state: GameState, id: string): GameState {
  const loc = getLocation(state, id);
  if (!isMarketingUnlocked(state, id)) return state;
  if (campaignStatus(loc, state.playtimeSec).phase !== 'ready') return state;
  const cost = getCampaignCost(state, id);
  if (loc.coins.lt(cost)) return state;
  const after = startCampaign(state, id);
  const gain =
    (getIncomePerSec(after, id).toNumber() - getIncomePerSec(state, id).toNumber()) *
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
let resets = 0;
let zenEarned = 0;
const firstResetZen: number[] = [];

/** Meta-Upgrades, die im Sim etwas bewirken (Offline und Tap spielt der Greedy nicht), in dieser Priorität. */
const META_PRIORITY: MetaUpgradeId[] = [
  'globalIncome',
  'fastStart',
  'startCapital',
  'discount',
  'satisfactionBase',
];

/** Zen ausgeben: zuerst Standorte freischalten, dann jeweils das günstigste sinnvolle Meta-Upgrade. */
function spendZen(s: GameState, t: number): GameState {
  let cur = s;
  for (const l of LOCATIONS) {
    if (canUnlockLocation(cur, l.id)) {
      cur = unlockLocation(cur, l.id);
      mark(`unlock:${l.id}`, t);
    }
  }
  // Zen für den nächsten Standort zurückhalten, sobald dessen Café-Level-Bedingung erfüllt ist.
  const next = getNextLockedLocation(cur);
  const req = next ? getLocationRequirement(cur, next) : null;
  const reserve = req?.levelOk ? req.zen : D(0);
  for (;;) {
    let best: { id: MetaUpgradeId; cost: Decimal } | null = null;
    for (const id of META_PRIORITY) {
      const cost = getNextMetaCost(cur, id);
      if (cost && (!best || cost.lt(best.cost))) best = { id, cost };
    }
    if (!best || cur.meta.zen.sub(best.cost).lt(reserve)) return cur;
    cur = buyMetaUpgrade(cur, best.id);
  }
}

/** Spielzeit des letzten Café-Level-Aufstiegs je Standort (für die Stocken-Regel). */
const lastLevelUp = new Map<string, { level: number; t: number }>();

/**
 * Reset-Regel des Greedy-Spielers: zurücksetzen, wenn das den nächsten Standort freischaltet, oder wenn
 * der Run stockt und mindestens so viel Zen bringt, wie bisher insgesamt verdient wurde (Verdopplung).
 */
function shouldReset(s: GameState, id: string, t: number): boolean {
  const level = getLocation(s, id).level;
  const last = lastLevelUp.get(id);
  if (!last || last.level !== level) lastLevelUp.set(id, { level, t });
  if (!canReset(s, id)) return false;
  const gain = computeZenGain(s, id).toNumber();
  const next = getNextLockedLocation(s);
  const req = next ? getLocationRequirement(s, next) : null;
  if (req && req.prevLocationId === id && getLocation(s, id).level >= req.cafeLevel) {
    return s.meta.zen.add(gain).gte(req.zen);
  }
  const stalled = t - (lastLevelUp.get(id)?.t ?? t) >= RESET_STALL_SEC;
  return stalled && gain >= Math.max(RESET_MIN_ZEN, zenEarned);
}

for (let t = 0; t < hours * 3600; t += STEP_MS / 1000) {
  state = tick(state, STEP_MS);
  for (const id of state.meta.unlockedLocations) {
    const before = state;
    state = maybeCampaign(state, id);
    if (state !== before) {
      campaigns++;
      mark('campaign', t);
    }
    if (shouldReset(state, id, t)) {
      const gain = computeZenGain(state, id).toNumber();
      if (resets === 0) firstResetZen.push(gain);
      zenEarned += gain;
      resets++;
      state = franchiseReset(state, id);
      mark('firstReset', t);
    }
    state = spendZen(state, t);
    for (let i = 0; i < MAX_BUYS_PER_STEP; i++) {
      const pick = levelChase(state, id) ?? pickPurchase(state, id);
      if (!pick || getLocation(state, id).coins.lt(pick.cost)) break;
      state = pick.apply(state);
      if (id !== LOC) continue;
      const loc = getLocation(state, id);
      mark('firstUpgrade', t);
      if (pick.kind === 'staff') mark('firstStaff', t);
      if (pick.kind === 'staff' && pick.id === 'cleaner') mark('cleaner', t);
      if (pick.kind === 'quality') mark(`quality${pick.id}`, t);
      if ((loc.stations['checkout']?.level ?? 0) > 0) mark('checkout', t);
      for (const lv of [3, 5, 10, 15, 20]) if (loc.level >= lv) mark(`cafe${String(lv)}`, t);
    }
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
  ['Qualität Stufe 1 (Café Grade)', '–', fmt('quality1')],
  ['Qualität Stufe 2 (Premium Grade)', '–', fmt('quality2')],
  ['Qualität Stufe 3 (Ceremonial Grade)', '–', fmt('quality3')],
  [
    'Erster Franchise-Reset',
    '~3 h (20–30 Zen)',
    `${fmt('firstReset')}${firstResetZen.length ? ` (${String(firstResetZen[0])} Zen)` : ''}`,
  ],
  ['Kyoto freigeschaltet', '3–4 h', fmt('unlock:kyoto')],
  ['Tokio freigeschaltet', '–', fmt('unlock:tokyo')],
];
console.log(
  `Balance-Sim: ${String(hours)} h, Greedy-Spieler (Stationen, Personal, Ambiente, Qualität, Marketing, Reset, Zen), Meilensteine Berlin erster Run`,
);
console.log('| Meilenstein | Zielzeit | Ist |');
console.log('|---|---|---|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
console.log(
  `Prestige: ${String(resets)} Resets, Zen verdient ${String(zenEarned)}, übrig ${state.meta.zen.toString()}; Meta: ${
    Object.entries(state.meta.metaUpgrades)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ') || '—'
  }`,
);
for (const id of state.meta.unlockedLocations) {
  const l = getLocation(state, id);
  console.log(
    `Standort ${id}: Café-Level ${String(l.level)} (Bestwert ${String(l.bestLevel)}, Resets ${String(l.prestigeCount)}), Einkommen/s ${formatNumber(getIncomePerSec(state, id))}`,
  );
}
const loc = getLocation(state, LOC);
console.log(
  `Ende: Café-Level ${String(loc.level)}, Münzen ${formatNumber(loc.coins)}, Einkommen/s ${formatNumber(getIncomePerSec(state, LOC))}`,
);
console.log(
  `Qualität ${String(loc.quality)}, Goldene Blätter (Café-Level) ${state.meta.goldenLeaves.toString()}, Zufriedenheit ${loc.satisfaction.toFixed(1)}, Sauberkeit ${loc.cleanliness.toFixed(1)}, Kampagnen ${String(campaigns)}, Marketing-Level ${String(loc.marketing.level)}`,
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
