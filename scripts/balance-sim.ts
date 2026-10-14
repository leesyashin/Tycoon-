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

const LOC = 'berlin';
const STEP_MS = 1000;
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
  kind: 'station' | 'staff' | 'ambience' | 'marketing' | 'quality';
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
  const qualityCost = getNextQualityCost(state, LOC);
  if (qualityCost && isNextQualityUnlocked(state, LOC)) {
    out.push({
      kind: 'quality',
      id: String(getLocation(state, LOC).quality + 1),
      cost: qualityCost,
      apply: (s) => buyQuality(s, LOC),
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
  // Terrasse schaltet Stationen frei (Platz); das sieht die Einkommens-Bewertung nicht, also Vorrang.
  const blocked = STATIONS.some(
    (d) => loc.level >= d.unlockCafeLevel && needsTerrace(state, LOC, d.id),
  );
  for (const c of candidates(state)) {
    if (blocked && c.kind === 'ambience' && c.id === 'terrace') return c;
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

/**
 * Café-Level-Jagd: Spieler kaufen günstige Level breit, um das nächste Café-Level (Freischaltungen,
 * Belohnung) zu erreichen. Die reine Amortisation sieht das nicht, weil neue Stationen auf Level 1
 * kaum Kunden abbekommen. Lohnt sich, wenn der restliche Weg höchstens `LEVEL_CHASE_SEC` Einkommen kostet.
 */
function levelChase(state: GameState): Candidate | null {
  const loc = getLocation(state, LOC);
  const total = Object.values(loc.stations).reduce((a, x) => a + x.level, 0);
  const missing =
    BALANCE.cafeLevel.stationLevelsPerCafeLevel -
    (total % BALANCE.cafeLevel.stationLevelsPerCafeLevel);
  let s = withLocation(state, LOC, { ...loc, coins: D(1e300) });
  let pathCost = 0;
  let first: Candidate | null = null;
  for (let i = 0; i < missing; i++) {
    let cheapest: { id: string; cost: Decimal } | null = null;
    for (const def of STATIONS) {
      if (!isStationUnlocked(s, LOC, def.id)) continue;
      const cost = getBulkCost(s, LOC, def.id, 1);
      if (!cheapest || cost.lt(cheapest.cost)) cheapest = { id: def.id, cost };
    }
    if (!cheapest) return null;
    const id = cheapest.id;
    first ??= { kind: 'station', id, cost: cheapest.cost, apply: (x) => buyStation(x, LOC, id, 1) };
    pathCost += cheapest.cost.toNumber();
    s = buyStation(s, LOC, id, 1);
  }
  const budget = getIncomePerSec(state, LOC).toNumber() * LEVEL_CHASE_SEC;
  return pathCost <= budget ? first : null;
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
    const pick = levelChase(state) ?? pickPurchase(state);
    if (!pick || getLocation(state, LOC).coins.lt(pick.cost)) break;
    state = pick.apply(state);
    const loc = getLocation(state, LOC);
    mark('firstUpgrade', t);
    if (pick.kind === 'staff') mark('firstStaff', t);
    if (pick.kind === 'staff' && pick.id === 'cleaner') mark('cleaner', t);
    if (pick.kind === 'quality') mark(`quality${pick.id}`, t);
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
  ['Qualität Stufe 1 (Café Grade)', '–', fmt('quality1')],
  ['Qualität Stufe 2 (Premium Grade)', '–', fmt('quality2')],
  ['Qualität Stufe 3 (Ceremonial Grade)', '–', fmt('quality3')],
];
console.log(
  `Balance-Sim: ${String(hours)} h, Greedy-Spieler (Stationen, Personal, Ambiente, Qualität, Marketing), Berlin`,
);
console.log('| Meilenstein | Zielzeit | Ist |');
console.log('|---|---|---|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
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
