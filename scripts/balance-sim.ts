// Headless-Balancing-Simulation (Phase 3): Greedy-Spieler über die Spieluhr, aktive Zeit (GAME_DESIGN § 15).
import { STATIONS } from '@data/stations';
import { STAFF_ROLES } from '@data/staff';
import { AMBIENCE } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { LOCATIONS } from '@data/locations';
import { MATCHA_GRADES, MATCHA_PACKAGES } from '@data/matcha';
import { OPENING_HOURS } from '@data/time';
import { SOCIAL, VIDEO_FORMATS } from '@data/social';
import type { MetaUpgradeId } from '@data/prestige';
import { createInitialState, getLocation, withLocation, type GameState } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { getEventResolveCost, resolveEvent } from '@core/events';
import {
  autoBuyReserve,
  buyStation,
  getBulkCost,
  isStationMaxed,
  isStationUnlocked,
  needsTerrace,
} from '@core/economy/actions';
import { cafeLevelProgress } from '@core/economy/cafeLevel';
import {
  buyAmbience,
  getNextAmbienceCost,
  isAmbienceMaxed,
  isAmbienceUnlocked,
} from '@core/economy/ambience';
import { ledgerCosts, ledgerIncome } from '@core/economy/ledger';
import { applyOffline } from '@core/economy/offline';
import { computeLocationRates } from '@core/customers/rates';
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
import {
  canFireStaff,
  cleanlinessEquilibrium,
  fireStaff,
  getNextStaffCost,
  hireStaff,
  isStaffMaxed,
  isStaffUnlocked,
} from '@core/staff';
import { getOrderCost, isGradeUnlocked, setServedGrade } from '@core/supply';
import { postBlock, postVideo, postsLeftToday, previewVideo, getVideoCost } from '@core/social';
import { setOpeningHours } from '@core/time/actions';
import { dayOf, hourOf, isOpenHour } from '@core/time/clock';
import { formatDuration } from '@core/math/format';
import { D, type Decimal } from '@core/math/bignum';

/** Start-Standort; die Meilensteine der Tabelle beziehen sich auf ihn (erster Run). */
const LOC = 'berlin';
/** Eine echte Sekunde je Schritt (geöffnet eine Spielminute, nachts mehr). */
const STEP_MS = 1000;
/** Reset ohne neuen Standort erst, wenn er mindestens so viel Zen bringt … */
const RESET_MIN_ZEN = 20;
/** … und der Run stockt: so lange (aktive Zeit) kein Café-Level-Aufstieg mehr. */
const RESET_STALL_SEC = 3600;
const MAX_BUYS_PER_STEP = 20;
/** Iterationen, bis Zufriedenheit ↔ Wartezeit ↔ Nachfrage eingeschwungen sind. */
const SETTLE_ITERATIONS = 5;
/** So oft (echte Sekunden) bewertet der Greedy-Spieler seine Käufe neu, auch ohne dass sich etwas geändert hat. */
const REPLAN_SEC = 30;
/** Café-Level-Jagd: so viele Spieltage Gewinn ist dem Greedy-Spieler das nächste Café-Level wert. */
const LEVEL_CHASE_DAYS = 1.5;
/** Spart der Spieler auf eine neue Filiale, kauft er nur, was sich in so vielen Spieltagen bezahlt macht … */
const SAVING_PAYBACK_DAYS = 1;
/** … und er spart erst, wenn die Investition höchstens so viele Tagesgewinne kostet. */
const BRANCH_SAVE_DAYS = 3;

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Experimente ohne Dateiänderung: `--set demand.basePerHour=12 --set rent.basePerDay=40` überschreibt Werte in
 * `BALANCE`. Nur für den Balancing-Pass; die Daten bleiben die Wahrheit.
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
  // `--stationGrowth 0.8`: Kosten-Wachstum je Level aller Geräte (growth − 1) × Faktor; `--stationCost 0.8`: Grundpreise.
  const growth = arg('stationGrowth', 0);
  const cost = arg('stationCost', 0);
  for (const d of STATIONS) {
    const def = d as { growth: number; baseCost: number };
    if (growth > 0) def.growth = 1 + (def.growth - 1) * growth;
    if (cost > 0) def.baseCost *= cost;
  }
  // `--branchCost 0.5`: Investition für neue Filialen × Faktor.
  const branch = arg('branchCost', 0);
  if (branch > 0) {
    for (const l of LOCATIONS) if (l.unlock) (l.unlock as { cost: number }).cost *= branch;
    console.log(`override branch cost × ${String(branch)}`);
  }
  if (growth > 0) console.log(`override station growth × ${String(growth)}`);
  if (cost > 0) console.log(`override station base cost × ${String(cost)}`);
}
applyOverrides();

const euro = (v: number | Decimal): string => {
  const n = typeof v === 'number' ? v : v.toNumber();
  return `${n.toLocaleString('de-DE', { maximumFractionDigits: n >= 1000 ? 0 : 2 })} €`;
};

/** Matcha-Einkauf je Gramm der Sorte (Packung der automatischen Nachbestellung). */
function matchaPerGram(state: GameState, id: string, grade: number): number {
  if (grade < 0) return 0;
  const pkg = getLocation(state, id).supply.autoPackage;
  const grams = MATCHA_PACKAGES[pkg]?.grams ?? 1;
  return getOrderCost(state, id, grade, pkg, false).toNumber() / grams;
}

/**
 * Bewertungs-Stand: als läge die gewählte Sorte im Lager (nicht an einer leeren Stunde hängen) und ohne Buzz der
 * letzten Videos (er klingt in Stunden ab; sonst stellte der Greedy morgens ein und entließe mittags wieder).
 */
function stocked(state: GameState, id: string): GameState {
  const loc = getLocation(state, id);
  const stock = [...loc.supply.stock];
  stock[loc.supply.grade] = Math.max(stock[loc.supply.grade] ?? 0, 1);
  return withLocation(state, id, {
    ...loc,
    supply: { ...loc.supply, stock },
    social: { ...loc.social, buzz: 0 },
  });
}

/**
 * Zufriedenheit und Sauberkeit eingeschwungen (Mittel über die Öffnungszeit). Sonst sähe der Greedy-Spieler den
 * Wert der Putzkraft oder der Deko nie, weil sie die Nachfrage erst über Stunden verändern.
 */
function settle(state: GameState, id: string): GameState {
  let s = stocked(state, id);
  for (let i = 0; i < SETTLE_ITERATIONS; i++) {
    const loc = getLocation(s, id);
    let target = 0;
    let served = 0;
    let n = 0;
    for (let h = loc.hours.open; h < loc.hours.close; h++) {
      const r = computeLocationRates(s, id, { hour: h, influencerHype: false });
      target += r.satisfaction.target;
      served += r.served;
      n++;
    }
    if (n === 0) return s;
    s = withLocation(s, id, {
      ...loc,
      satisfaction: target / n,
      cleanliness: cleanlinessEquilibrium(loc, served / n),
    });
  }
  return s;
}

interface DayPlan {
  guests: number;
  income: number;
  costs: number;
  profit: number;
}

/** Ein ganzer Spieltag (eingeschwungen, ohne Boosts): Gäste, Umsatz inkl. Trinkgeld, laufende Kosten, Gewinn. */
function settledDay(state: GameState, id: string): DayPlan {
  const s = settle(state, id);
  const loc = getLocation(s, id);
  const perGram = matchaPerGram(s, id, loc.supply.grade);
  let guests = 0;
  let income = 0;
  let costs = 0;
  for (let h = 0; h < 24; h++) {
    const r = computeLocationRates(s, id, { hour: h, influencerHype: false });
    guests += r.served;
    income += r.incomePerHour.toNumber();
    costs +=
      r.goodsPerHour.add(r.wagesPerHour).add(r.rentPerHour).toNumber() +
      r.matchaGramsPerHour * perGram;
  }
  return { guests, income, costs, profit: income - costs };
}

interface Candidate {
  kind: 'station' | 'hire' | 'fire' | 'ambience' | 'grade';
  id: string;
  cost: Decimal;
  apply(s: GameState): GameState;
}

function candidates(state: GameState, id: string): Candidate[] {
  const out: Candidate[] = [];
  const loc = getLocation(state, id);
  for (const def of STATIONS) {
    if (!isStationUnlocked(state, id, def.id) || isStationMaxed(state, id, def.id)) continue;
    out.push({
      kind: 'station',
      id: def.id,
      cost: getBulkCost(state, id, def.id, 1),
      apply: (s) => buyStation(s, id, def.id, 1),
    });
  }
  for (const r of STAFF_ROLES) {
    if (isStaffUnlocked(state, id, r.id) && !isStaffMaxed(state, id, r.id)) {
      out.push({
        kind: 'hire',
        id: r.id,
        cost: getNextStaffCost(state, id, r.id),
        apply: (s) => hireStaff(s, id, r.id),
      });
    }
    if (canFireStaff(state, id, r.id)) {
      out.push({ kind: 'fire', id: r.id, cost: D(0), apply: (s) => fireStaff(s, id, r.id) });
    }
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
  // Bessere Sorte: kostet nur mehr im Einkauf (steckt im Tagesgewinn), die Nachbestellung holt sie morgens.
  for (const g of MATCHA_GRADES) {
    if (g.grade === loc.supply.grade || !isGradeUnlocked(loc, g.grade)) continue;
    out.push({
      kind: 'grade',
      id: String(g.grade),
      cost: D(0),
      apply: (s) => setServedGrade(s, id, g.grade),
    });
  }
  return out;
}

/**
 * Kauf mit der kürzesten Amortisation (Kosten / Zuwachs des Tagesgewinns, in Spieltagen). Entlassen und eine andere
 * Matcha-Sorte kosten nichts: Sie kommen dran, sobald sie den Tagesgewinn erhöhen.
 */
function pickPurchase(state: GameState, id: string): { c: Candidate; paybackDays: number } | null {
  const loc = getLocation(state, id);
  const base = settledDay(state, id).profit;
  let best: { c: Candidate; paybackDays: number } | null = null;
  // Die Terrasse schaltet Platz für Geräte frei; das sieht die Gewinn-Bewertung nicht, also Vorrang.
  const blocked = STATIONS.some(
    (d) => loc.level >= d.unlockCafeLevel && needsTerrace(state, id, d.id),
  );
  for (const c of candidates(state, id)) {
    if (blocked && c.kind === 'ambience' && c.id === 'terrace') return { c, paybackDays: 0 };
    const rich = withLocation(state, id, { ...loc, coins: c.cost.add(1e9) });
    const gain = settledDay(c.apply(rich), id).profit - base;
    // Entlassen nur, wenn es mehr bringt als eine spätere Wieder-Einstellung kostet (kein Hin und Her).
    const minGain = c.kind === 'fire' ? getNextStaffCost(state, id, c.id).toNumber() : 1e-6;
    if (gain <= minGain) continue;
    const paybackDays = c.cost.toNumber() / gain;
    if (!best || paybackDays < best.paybackDays) best = { c, paybackDays };
  }
  return best;
}

/**
 * Café-Level-Jagd: Spieler kaufen günstige Geräte-Level breit, um das nächste Café-Level (Freischaltungen,
 * Belohnung) zu erreichen. Die reine Amortisation sieht das nicht. Lohnt sich, wenn der restliche Weg höchstens
 * `LEVEL_CHASE_DAYS` Tagesgewinn kostet.
 */
function levelChase(state: GameState, id: string, dayProfit: number): Candidate | null {
  if (dayProfit <= 0) return null;
  const loc = getLocation(state, id);
  const { done, need } = cafeLevelProgress(loc);
  const missing = need - done;
  let s = withLocation(state, id, { ...loc, coins: D(1e15) });
  let pathCost = 0;
  let first: Candidate | null = null;
  for (let i = 0; i < missing; i++) {
    let cheapest: { id: string; cost: Decimal } | null = null;
    for (const def of STATIONS) {
      if (!isStationUnlocked(s, id, def.id) || isStationMaxed(s, id, def.id)) continue;
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
  return pathCost <= dayProfit * LEVEL_CHASE_DAYS ? first : null;
}

/** Öffnungszeiten mit dem besten Tagesgewinn (einmal am Tag geprüft; späte Stunden kosten Löhne). */
function bestHours(state: GameState, id: string): GameState {
  const o = OPENING_HOURS;
  let best: { s: GameState; profit: number } | null = null;
  for (let open = o.earliestOpen; open <= o.latestOpen; open++) {
    for (
      let close = Math.max(o.earliestClose, open + o.minHours);
      close <= o.latestClose;
      close++
    ) {
      const s = setOpeningHours(state, id, { open, close });
      const profit = settledDay(s, id).profit;
      if (!best || profit > best.profit + 1e-6) best = { s, profit };
    }
  }
  return best?.s ?? state;
}

/** Bis zu drei Videos am Tag, über die Öffnungszeit verteilt; das Format mit den meisten Followern je Euro. */
function maybePost(state: GameState, id: string): GameState {
  const loc = getLocation(state, id);
  const hour = hourOf(state.clock);
  if (!isOpenHour(loc.hours, hour) || postsLeftToday(loc) <= 0) return state;
  const span = (loc.hours.close - loc.hours.open) / SOCIAL.postsPerDay;
  const due = Math.floor((hour - loc.hours.open) / span) + 1;
  if (loc.social.postsToday >= due) return state;
  let pick: { id: string; value: number } | null = null;
  for (const def of VIDEO_FORMATS) {
    if (postBlock(state, id, def.id) !== null) continue;
    const value = previewVideo(loc, def).followers / (1 + getVideoCost(def, id).toNumber());
    if (!pick || value > pick.value) pick = { id: def.id, value };
  }
  return pick ? postVideo(state, id, pick.id) : state;
}

/** Lieferengpass beheben, wenn das Café sich das leisten kann (Greedy nimmt die Blätter mit). */
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
/** `--log`: jeden Kauf in Berlin mit Zeit, Preis und Amortisation ausgeben. */
const LOG = process.argv.includes('--log');
let state = createInitialState(0, 'de');
const reached = new Map<string, number>();
const mark = (key: string, t: number): void => {
  if (!reached.has(key)) reached.set(key, t);
};
let resets = 0;
let zenEarned = 0;
const firstResetZen: number[] = [];
let hires = 0;
let fires = 0;

/** Meta-Upgrades, die im Sim etwas bewirken (Offline und Tap spielt der Greedy nicht), in dieser Priorität. */
const META_PRIORITY: MetaUpgradeId[] = [
  'globalIncome',
  'fastStart',
  'startCapital',
  'discount',
  'satisfactionBase',
];

/** Zen ausgeben: zuerst Filialen eröffnen, dann jeweils das günstigste sinnvolle Meta-Upgrade. */
function spendZen(s: GameState, t: number): GameState {
  let cur = s;
  for (const l of LOCATIONS) {
    if (canUnlockLocation(cur, l.id)) {
      cur = unlockLocation(cur, l.id);
      mark(`unlock:${l.id}`, t);
    }
  }
  // Zen für die nächste Filiale zurückhalten, sobald deren Café-Level-Bedingung erfüllt ist.
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
 * Spart der Spieler an diesem Standort auf die nächste Filiale? Nur wenn Level und Zen schon reichen und die
 * Investition höchstens `BRANCH_SAVE_DAYS` Tagesgewinne kostet – sonst baut er das Café erst weiter aus.
 */
function savingForBranch(s: GameState, id: string, dayProfit: number): boolean {
  const next = getNextLockedLocation(s);
  const req = next ? getLocationRequirement(s, next) : null;
  if (!req || req.prevLocationId !== id || !req.levelOk || !req.zenOk || req.moneyOk) return false;
  return req.cost.toNumber() <= BRANCH_SAVE_DAYS * Math.max(0, dayProfit);
}

/**
 * Reset-Regel des Greedy-Spielers: Ein Café, aus dessen Kasse die nächste Filiale bezahlt wird, bleibt stehen (der
 * Reset leerte die Kasse). Ein anderes Café wird zurückgesetzt, wenn das Zen dann für die nächste Filiale reicht, oder
 * wenn sein Run stockt und mindestens so viel Zen bringt, wie bisher insgesamt verdient wurde (Verdopplung).
 */
function shouldReset(s: GameState, id: string, t: number): boolean {
  const level = getLocation(s, id).level;
  const last = lastLevelUp.get(id);
  if (!last || last.level !== level) lastLevelUp.set(id, { level, t });
  if (!canReset(s, id)) return false;
  const gain = computeZenGain(s, id).toNumber();
  const next = getNextLockedLocation(s);
  const req = next ? getLocationRequirement(s, next) : null;
  if (req && req.prevLocationId === id && req.levelOk) return false;
  if (req && req.levelOk && !req.zenOk && s.meta.zen.add(gain).gte(req.zen)) return true;
  const stalled = t - (lastLevelUp.get(id)?.t ?? t) >= RESET_STALL_SEC;
  return stalled && gain >= Math.max(RESET_MIN_ZEN, zenEarned);
}

/** Offline-Rückkehr: Stand nach so viel aktiver Zeit, dann 8 h weg. */
const OFFLINE_PROBE_SEC = 3600;
const OFFLINE_AWAY_MS = 8 * 3_600_000;
let offlineProbe: { earned: number; days: number; dayProfit: number } | null = null;

interface DayRow {
  day: number;
  guests: number;
  income: number;
  costs: number;
  bonus: number;
  level: number;
  followers: number;
  grade: number;
  hours: string;
  staff: string;
}
const dayRows: DayRow[] = [];
let lastDay = dayOf(state.clock);
const plans = new Map<
  string,
  { t: number; pick: { c: Candidate; paybackDays: number } | null; dayProfit: number }
>();

const eventsSeen = new Map<string, number>();
const steps = Math.round((hours * 3600 * 1000) / STEP_MS);
for (let k = 0; k < steps; k++) {
  const t = (k * STEP_MS) / 1000;
  if (t === OFFLINE_PROBE_SEC) {
    const off = applyOffline(state, OFFLINE_AWAY_MS);
    offlineProbe = {
      earned: off.earned.toNumber(),
      days: off.days,
      dayProfit: settledDay(state, LOC).profit,
    };
  }
  const count = state.eventSchedule.count;
  state = tick(state, STEP_MS);
  if (state.eventSchedule.count > count) {
    const id = state.activeEvents[state.activeEvents.length - 1]?.id ?? '?';
    eventsSeen.set(id, (eventsSeen.get(id) ?? 0) + 1);
    mark('firstEvent', t);
  }
  state = maybeResolveEvents(state);

  // Tageswechsel: Bilanz des Vortags (Berlin) und Öffnungszeiten für den neuen Tag.
  const day = dayOf(state.clock);
  if (day !== lastDay) {
    lastDay = day;
    const loc = getLocation(state, LOC);
    const y = loc.ledger.yesterday;
    if (y) {
      dayRows.push({
        day: day - 1,
        guests: y.guests,
        income: ledgerIncome(y).sub(y.bonus).toNumber(),
        costs: ledgerCosts(y).toNumber(),
        bonus: y.bonus.toNumber(),
        level: loc.level,
        followers: loc.social.followers,
        grade: loc.supply.grade,
        hours: `${String(loc.hours.open)}–${String(loc.hours.close)}`,
        staff: Object.entries(loc.staff)
          .filter(([, v]) => v > 0)
          .map(([r, v]) => `${r.slice(0, 4)} ${String(v)}`)
          .join(', '),
      });
      if (ledgerIncome(y).gt(ledgerCosts(y))) mark('profitDay', t);
    }
    for (const id of state.meta.unlockedLocations) {
      state = bestHours(state, id);
      plans.delete(id);
    }
  }

  for (const id of state.meta.unlockedLocations) {
    state = maybePost(state, id);
    if (shouldReset(state, id, t)) {
      const gain = computeZenGain(state, id).toNumber();
      if (resets === 0) firstResetZen.push(gain);
      zenEarned += gain;
      resets++;
      state = franchiseReset(state, id);
      plans.delete(id);
      mark('firstReset', t);
    }
    const before = state.meta.unlockedLocations.length;
    state = spendZen(state, t);
    if (state.meta.unlockedLocations.length !== before) plans.clear();

    for (let i = 0; i < MAX_BUYS_PER_STEP; i++) {
      let plan = plans.get(id);
      if (!plan || t - plan.t >= REPLAN_SEC) {
        plan = { t, pick: pickPurchase(state, id), dayProfit: settledDay(state, id).profit };
        plans.set(id, plan);
      }
      const chase = levelChase(state, id, plan.dayProfit);
      const pick = chase ? { c: chase, paybackDays: 0 } : plan.pick;
      if (!pick) break;
      if (savingForBranch(state, id, plan.dayProfit) && pick.paybackDays > SAVING_PAYBACK_DAYS)
        break;
      // Ein Tag laufende Kosten bleibt auf dem Konto (wie beim Auto-Kauf des Filialleiters); Entlassen und die
      // Sorte wechseln kosten nichts.
      const free = pick.c.kind === 'fire' || pick.c.kind === 'grade';
      const reserve = free ? D(0) : autoBuyReserve(state, id);
      if (!free && getLocation(state, id).coins.sub(pick.c.cost).lt(reserve)) break;
      const paid = getLocation(state, id).coins;
      state = pick.c.apply(state);
      plans.delete(id);
      if (id !== LOC) continue;
      const after = getLocation(state, id);
      if (LOG)
        console.log(
          `${formatDuration(t)} Tag ${String(dayOf(state.clock) + 1)} ${String(hourOf(state.clock))} Uhr: ${chase ? 'Level-Jagd ' : ''}${pick.c.kind} ${pick.c.id} für ${euro(paid.sub(after.coins))} (Amortisation ${pick.paybackDays.toFixed(2)} Tage, Café-Lv ${String(after.level)})`,
        );
      mark('firstUpgrade', t);
      if (pick.c.kind === 'hire') {
        hires++;
        mark('firstHire', t);
      }
      if (pick.c.kind === 'fire') {
        fires++;
        mark('firstFire', t);
      }
      for (const lv of [3, 5, 8, 10, 12, 15]) if (after.level >= lv) mark(`cafe${String(lv)}`, t);
      const parking = after.ambience['parking'] ?? 0;
      if (parking >= 1) mark('parking1', t);
      if (parking >= 5) mark('parking5', t);
      if ((after.ambience['terrace'] ?? 0) >= 1) mark('terrace', t);
    }
    if (id === LOC) {
      const loc = getLocation(state, id);
      for (const g of [1, 3, 5]) if (loc.supply.grade >= g) mark(`grade${String(g)}`, t);
      for (const f of [1_000, 10_000, 50_000])
        if (loc.social.followers >= f) mark(`followers${String(f)}`, t);
    }
  }
}

const fmt = (key: string): string => {
  const t = reached.get(key);
  return t === undefined ? '—' : formatDuration(t);
};
const rows: [string, string, string][] = [
  ['Erster Kauf', '< 30 s', fmt('firstUpgrade')],
  ['Erste Einstellung', '–', fmt('firstHire')],
  ['Erster Tag mit Gewinn', '1. Tag', fmt('profitDay')],
  ['Café-Level 3', '< 10 min', fmt('cafe3')],
  ['Café-Level 5', '~1 h', fmt('cafe5')],
  ['Café-Level 8', '~3 h', fmt('cafe8')],
  ['Café-Level 10 (Reset möglich)', '~4 h', fmt('cafe10')],
  ['Café-Level 12 (Kyoto-Bedingung)', '5–6 h', fmt('cafe12')],
  ['Café-Level 15', '~9 h', fmt('cafe15')],
  ['Matcha Sorte 1', '< 5 min', fmt('grade1')],
  ['Matcha Sorte 3', '~2 h', fmt('grade3')],
  ['Matcha Sorte 5', '~4 h', fmt('grade5')],
  ['1 000 Follower', '~3 h', fmt('followers1000')],
  ['10 000 Follower', '–', fmt('followers10000')],
  ['Parkplatz Stufe 1', '~2 h', fmt('parking1')],
  ['Parkplatz Stufe 5', '~7 h', fmt('parking5')],
  ['Terrasse', '~3,5 h', fmt('terrace')],
  ['Kyoto eröffnet', '6–7 h', fmt('unlock:kyoto')],
  [
    'Erster Franchise-Reset',
    '~10 h',
    `${fmt('firstReset')}${firstResetZen.length ? ` (${String(firstResetZen[0])} Zen)` : ''}`,
  ],
  ['Tokio eröffnet', '–', fmt('unlock:tokyo')],
  ['Erstes Zufalls-Event', '20–45 min', fmt('firstEvent')],
];
console.log(
  `Balance-Sim: ${String(hours)} h aktive Zeit, Greedy-Spieler (Geräte, Personal einstellen/entlassen, Ambiente, Matcha-Sorte, Öffnungszeiten, Videos, Reset, Zen), Berlin erster Run`,
);
console.log('| Meilenstein | Zielzeit | Ist |');
console.log('|---|---|---|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);

console.log('');
console.log(
  'Tagesbilanz Berlin (Umsatz inkl. Trinkgeld, ohne Boni; Kosten = Löhne, Waren, Matcha, Miete, Videos, Einstellungen)',
);
console.log(
  '| Tag | Gäste | Ø Bon | Umsatz | Kosten | Gewinn | Boni | Café-Lv | Follower | Sorte | Geöffnet | Team |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of dayRows) {
  const avg = r.guests > 0 ? r.income / r.guests : 0;
  console.log(
    `| ${String(r.day + 1)} | ${r.guests.toFixed(0)} | ${euro(avg)} | ${euro(r.income)} | ${euro(r.costs)} | ${euro(r.income - r.costs)} | ${euro(r.bonus)} | ${String(r.level)} | ${String(r.followers)} | ${String(r.grade)} | ${r.hours} | ${r.staff} |`,
  );
}
console.log('');
if (offlineProbe) {
  const p = offlineProbe;
  console.log(
    `Offline nach 1 h, 8 h weg: ${euro(p.earned)} netto in ${String(p.days)} Spieltag(en) = ${(p.earned / Math.max(1, p.dayProfit)).toFixed(2)}× eines eingeschwungenen Tagesgewinns (${euro(p.dayProfit)}; Deckel ${String(BALANCE.offline.capDaysByManagerLevel[0])} Spieltage ohne Filialleiter, ${String(BALANCE.offline.baseEfficiency * 100)} % Effizienz)`,
  );
}
console.log(
  `Personal: ${String(hires)} Einstellungen, ${String(fires)} Entlassungen (Greedy, Berlin)`,
);
console.log(
  `Prestige: ${String(resets)} Resets, Zen verdient ${String(zenEarned)}, übrig ${state.meta.zen.toString()}; Meta: ${
    Object.entries(state.meta.metaUpgrades)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ') || '—'
  }`,
);
console.log(
  `Events: ${String(state.stats.events)} abgeschlossen (${
    [...eventsSeen.entries()].map(([k, v]) => `${k} ${String(v)}`).join(', ') || '—'
  }); Goldene Blätter verdient ${String(state.stats.leavesEarned)} (ohne Erfolge/Quests, die laufen nur in der App)`,
);
for (const id of state.meta.unlockedLocations) {
  const l = getLocation(state, id);
  const plan = settledDay(state, id);
  console.log(
    `Standort ${id}: Café-Level ${String(l.level)} (Bestwert ${String(l.bestLevel)}, Resets ${String(l.prestigeCount)}), Geld ${euro(l.coins)}, Tag eingeschwungen: ${plan.guests.toFixed(0)} Gäste, Umsatz ${euro(plan.income)}, Kosten ${euro(plan.costs)}, Gewinn ${euro(plan.profit)}`,
  );
}
const loc = getLocation(state, LOC);
// Ohne laufende Events und Boosts (ein Regentag verdoppelt das Trinkgeld).
const rates = computeLocationRates({ ...stocked(state, LOC), activeEvents: [], boosts: [] }, LOC, {
  hour: 12,
  influencerHype: false,
});
console.log(
  `Ende Berlin: Ø Bon ${euro(rates.avgTicket)} + ${(rates.tipRate * 100).toFixed(1)} % Trinkgeld, Zufriedenheit ${loc.satisfaction.toFixed(1)}, Sauberkeit ${loc.cleanliness.toFixed(1)}, Matcha-Sorte ${String(loc.supply.grade)}, Follower ${String(loc.social.followers)}, Videos ${String(state.stats.videos)}, Matcha-Bestellungen ${String(state.stats.matchaOrders)}`,
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
  }; Geräte: ${Object.entries(loc.stations)
    .filter(([, s]) => s.level > 0)
    .map(([k, s]) => `${k} ${String(s.level)}`)
    .join(', ')}`,
);
