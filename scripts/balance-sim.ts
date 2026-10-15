// Headless-Balancing-Simulation: Greedy-Spieler, aktive Zeit (GAME_DESIGN § 15).
import { STATIONS } from '@data/stations';
import { STAFF_ROLES } from '@data/staff';
import { AMBIENCE } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { getEventResolveCost, resolveEvent } from '@core/events';
import { buyStation, getBulkCost, isStationUnlocked, needsTerrace } from '@core/economy/actions';
import { cafeLevelProgress } from '@core/economy/cafeLevel';
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
import { applyOffline } from '@core/economy/offline';
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
 * Experimente ohne Dateiänderung: `--set spawn.base=0.17 --set service.dineInShare=0.5` überschreibt Werte in
 * `BALANCE`, `--staffGrowth 1.6` das Kosten-Wachstum der Köpfe-Rollen, `--attachScale 0.8` die Anteile aller
 * Produktlinien außer der Matcha-Station. Nur für den Balancing-Pass (PLAN S12); die Daten bleiben die Wahrheit.
 */
function applyOverrides(): void {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--set') continue;
    const [path, raw] = (argv[i + 1] ?? '').split('=');
    const value = Number(raw);
    if (!path || !Number.isFinite(value)) continue;
    const keys = path.split('.');
    let obj: Record<string, unknown> = BALANCE as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
    obj[keys[keys.length - 1] ?? ''] = value;
    console.log(`override BALANCE.${path} = ${String(value)}`);
  }
  const growth = arg('staffGrowth', 0);
  if (growth > 0) {
    for (const r of STAFF_ROLES) if (r.headcount) (r as { growth: number }).growth = growth;
    console.log(`override staff growth (headcount) = ${String(growth)}`);
  }
  const attach = arg('attachScale', 0);
  if (attach > 0) {
    for (const d of STATIONS) {
      if (d.area === 'bar' && d.attachRate < 1) (d as { attachRate: number }).attachRate *= attach;
    }
    console.log(`override attachScale = ${String(attach)}`);
  }
}
applyOverrides();

/**
 * Einkommen, nachdem sich Sauberkeit und Zufriedenheit eingependelt haben. Sonst sähe der Greedy-
 * Spieler den Wert der Reinigungskraft nie, weil sie das Einkommen erst über Minuten verändert.
 */
function settledIncome(state: GameState, id: string): number {
  let s = state;
  for (let i = 0; i < SETTLE_ITERATIONS; i++) {
    const l = getLocation(s, id);
    const r = computeLocationRates(s, id);
    s = withLocation(s, id, {
      ...l,
      cleanliness: cleanlinessEquilibrium(l, r.served),
      satisfaction: r.satisfaction.target,
    });
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
  const { done, need } = cafeLevelProgress(loc);
  const missing = need - done;
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

/** Lieferengpass beheben, wenn sich die Münzen das leisten können (Greedy nimmt die 5 🍃 mit). */
function maybeResolveEvents(state: GameState): GameState {
  let cur = state;
  for (let i = cur.activeEvents.length - 1; i >= 0; i--) {
    const cost = getEventResolveCost(cur, i);
    const ev = cur.activeEvents[i];
    if (!cost || !ev || getLocation(cur, ev.locationId).coins.lt(cost)) continue;
    cur = resolveEvent(cur, i);
  }
  return cur;
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

/** Offline-Rückkehr (GAME_DESIGN § 15): Stand nach so viel aktiver Zeit, dann 8 h weg. */
const OFFLINE_PROBE_SEC = 3600;
const OFFLINE_AWAY_MS = 8 * 3_600_000;
/** „Tagesfortschritt“ eines aktiven Spielers = was er in so vielen Sekunden aktiver Zeit verdient. */
const ACTIVE_DAY_SEC = 5400;
let offlineProbe: { earned: number; bigBuy: number; nextBuys: number; lifetimeAt: number } | null =
  null;
let activeDayEarned: number | null = null;

/** Wie viele der nächsten Greedy-Käufe die Offline-Einnahmen bezahlen (ohne Einkommen dazwischen). */
function buysCovered(s: GameState, id: string, budget: number): number {
  let cur = withLocation(s, id, { ...getLocation(s, id), coins: D(budget) });
  let n = 0;
  for (; n < 1000; n++) {
    const pick = pickPurchase(cur, id);
    if (!pick || getLocation(cur, id).coins.lt(pick.cost)) break;
    cur = pick.apply(cur);
  }
  return n;
}

/**
 * „Großer Kauf“ = die nächste Matcha-Qualitätsstufe (größter Einzelkauf im Spiel, GAME_DESIGN § 8),
 * auch wenn sie noch gesperrt ist; ohne weitere Stufe der teuerste sichtbare Kauf.
 */
function biggestBuy(s: GameState, id: string): number {
  const q = getNextQualityCost(s, id);
  if (q) return q.toNumber();
  return Math.max(0, ...candidates(s, id).map((c) => c.cost.toNumber()));
}

const eventsSeen = new Map<string, number>();
const leavesAt = new Map<number, number>();
for (let t = 0; t < hours * 3600; t += STEP_MS / 1000) {
  if (t === OFFLINE_PROBE_SEC) {
    const earned = applyOffline(state, OFFLINE_AWAY_MS).earned.toNumber();
    offlineProbe = {
      earned,
      bigBuy: biggestBuy(state, LOC),
      nextBuys: buysCovered(state, LOC, earned),
      lifetimeAt: state.meta.lifetimeEarned.toNumber(),
    };
  }
  if (offlineProbe && t === OFFLINE_PROBE_SEC + ACTIVE_DAY_SEC) {
    activeDayEarned = state.meta.lifetimeEarned.toNumber() - offlineProbe.lifetimeAt;
  }
  const count = state.eventSchedule.count;
  state = tick(state, STEP_MS);
  if (state.eventSchedule.count > count) {
    const id = state.activeEvents[state.activeEvents.length - 1]?.id ?? '?';
    eventsSeen.set(id, (eventsSeen.get(id) ?? 0) + 1);
    mark('firstEvent', t);
  }
  state = maybeResolveEvents(state);
  const hour = Math.floor(t / 3600);
  if (!leavesAt.has(hour)) leavesAt.set(hour, state.stats.leavesEarned);
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
      if ((loc.stations['register']?.level ?? 0) > 0) mark('checkout', t);
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
  ['Kasse gekauft', '1–2 min', fmt('checkout')],
  ['Erster Personal-Kauf', '~5 min', fmt('firstStaff')],
  ['Erste Putzkraft', '–', fmt('cleaner')],
  ['Erste Kampagne', '–', fmt('campaign')],
  ['Kühl-/Eisfach (Café-Level 3)', '10–15 min', fmt('cafe3')],
  ['Ofen (Café-Level 5)', '~30 min', fmt('cafe5')],
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
  ['Erstes Zufalls-Event', '20–45 min', fmt('firstEvent')],
  ['Tokio freigeschaltet', '–', fmt('unlock:tokyo')],
];
console.log(
  `Balance-Sim: ${String(hours)} h, Greedy-Spieler (Stationen, Personal, Ambiente, Qualität, Marketing, Reset, Zen), Meilensteine Berlin erster Run`,
);
console.log('| Meilenstein | Zielzeit | Ist |');
console.log('|---|---|---|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
if (offlineProbe) {
  const p = offlineProbe;
  console.log(
    `Offline nach 1 h, 8 h weg: +${formatNumber(D(p.earned))} = ${(p.earned / p.bigBuy).toFixed(2)}× nächste Qualitätsstufe (${formatNumber(D(p.bigBuy))}), deckt die nächsten ${String(p.nextBuys)} Greedy-Käufe (Ziel: 1–2 große Käufe)`,
  );
  if (activeDayEarned !== null) {
    console.log(
      `Idle-Anteil: Offline-Nacht ${formatNumber(D(p.earned))} / aktiver Tag (${String(ACTIVE_DAY_SEC / 3600)} h ab 1 h) ${formatNumber(D(activeDayEarned))} = ${((100 * p.earned) / activeDayEarned).toFixed(0)} % (Ziel 20–30 %)`,
    );
  }
}
console.log(
  `Prestige: ${String(resets)} Resets, Zen verdient ${String(zenEarned)}, übrig ${state.meta.zen.toString()}; Meta: ${
    Object.entries(state.meta.metaUpgrades)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ') || '—'
  }`,
);
leavesAt.set(Math.ceil(hours), state.stats.leavesEarned);
const perHour = [...leavesAt.entries()]
  .sort(([a], [b]) => a - b)
  .slice(1)
  .map(([h, v]) => `h${String(h)} ${String(v - (leavesAt.get(h - 1) ?? 0))}`);
console.log(
  `Events: ${String(state.stats.events)} abgeschlossen (${
    [...eventsSeen.entries()].map(([k, v]) => `${k} ${String(v)}`).join(', ') || '—'
  }); Influencer-Blätter heute ${String(state.leafDrops.count)}`,
);
console.log(
  `Goldene Blätter verdient ${String(state.stats.leavesEarned)} (je Stunde: ${perHour.join(', ')}; ohne Erfolge/Quests, die laufen nur in der App)`,
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
  `Qualität ${String(loc.quality)}, Goldene Blätter ${state.meta.goldenLeaves.toString()}, Zufriedenheit ${loc.satisfaction.toFixed(1)}, Sauberkeit ${loc.cleanliness.toFixed(1)}, Kampagnen ${String(campaigns)}, Marketing-Level ${String(loc.marketing.level)}`,
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
