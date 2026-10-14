// Headless-Balancing-Simulation: Greedy-Spieler, aktive Zeit (GAME_DESIGN § 15).
import { STATIONS } from '@data/stations';
import { createInitialState, getLocation, type GameState } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { buyStation, isStationUnlocked } from '@core/economy/actions';
import { getStationCost } from '@core/economy/stations';
import { getIncomePerSec } from '@core/customers/rates';
import { formatDuration, formatNumber } from '@core/math/format';

const LOC = 'berlin';
const STEP_MS = 1000;
const MAX_BUYS_PER_STEP = 200;

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Wählt den Kauf mit der kürzesten Amortisation (Kosten / Einkommenszuwachs). */
function pickPurchase(
  state: GameState,
): { id: string; cost: ReturnType<typeof getStationCost> } | null {
  const loc = getLocation(state, LOC);
  const base = getIncomePerSec(state, LOC);
  let best: { id: string; cost: ReturnType<typeof getStationCost>; payback: number } | null = null;
  for (const def of STATIONS) {
    if (!isStationUnlocked(state, LOC, def.id)) continue;
    const level = loc.stations[def.id]?.level ?? 0;
    const cost = getStationCost(def, level, 1, LOC);
    const rich = { ...state, locations: { ...state.locations, [LOC]: { ...loc, coins: cost } } };
    const after = getIncomePerSec(buyStation(rich, LOC, def.id, 1), LOC);
    const gain = after.sub(base).toNumber();
    // Ohne Zuwachs (z. B. Nachfrage-limitiert) bleibt nur der Preis als Tiebreaker.
    const payback = gain > 0 ? cost.div(gain).toNumber() : Number.MAX_VALUE;
    if (!best || payback < best.payback || (payback === best.payback && cost.lt(best.cost))) {
      best = { id: def.id, cost, payback };
    }
  }
  return best;
}

const hours = arg('hours', 2);
let state = createInitialState(0, 'en');
const reached = new Map<string, number>();
const mark = (key: string, t: number): void => {
  if (!reached.has(key)) reached.set(key, t);
};

for (let t = 0; t < hours * 3600; t += STEP_MS / 1000) {
  state = tick(state, STEP_MS);
  for (let i = 0; i < MAX_BUYS_PER_STEP; i++) {
    const pick = pickPurchase(state);
    if (!pick || getLocation(state, LOC).coins.lt(pick.cost)) break;
    state = buyStation(state, LOC, pick.id, 1);
    const loc = getLocation(state, LOC);
    mark('firstUpgrade', t);
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
  ['Iced-Bar (Café-Level 3)', '10–15 min', fmt('cafe3')],
  ['Bäckerei (Café-Level 5)', '~30 min', fmt('cafe5')],
  ['Café-Level 10', '~90 min', fmt('cafe10')],
  ['Café-Level 15', '–', fmt('cafe15')],
];
console.log(`Balance-Sim: ${String(hours)} h, Greedy-Spieler, Berlin`);
console.log('| Meilenstein | Zielzeit | Ist |');
console.log('|---|---|---|');
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
const loc = getLocation(state, LOC);
console.log(
  `Ende: Café-Level ${String(loc.level)}, Münzen ${formatNumber(loc.coins)}, Einkommen/s ${formatNumber(getIncomePerSec(state, LOC))}`,
);
