import { BALANCE } from '@data/balance';
import { getLocation, type GameState, type LocationState } from '../GameState';
import { computeLocationRates, type LocationRates } from '../customers/rates';
import { accrueLeafDrops, expectedLeafDrops } from '../customers/drops';
import { advanceCleanliness } from '../staff/effects';
import { consumeMatcha, gradeInUse, nextArrival, receiveDeliveries } from '../supply/stock';
import { autoReorderStep } from '../supply/actions';
import { decayBuzz, managerPostStep, rolloverSocial } from '../social';
import { clockSpeed, minutesToNextHour } from '../time/clock';
import { addToLedger, rolloverLedger } from './ledger';
import { settleTill } from './till';

/**
 * Der Café-Betrieb über die Spieluhr (Phase 3): Gäste kommen nach der Tageskurve, bezahlen an der Kasse,
 * verbrauchen Matcha; Löhne, Wareneinsatz und Miete sammeln sich und werden zu jeder vollen Stunde abgebucht;
 * Lieferungen kommen an; um Mitternacht beginnt ein neuer Tag. Gerechnet wird in Abschnitten, in denen sich die
 * Raten nicht ändern (bis zur nächsten vollen Stunde, Lieferung oder bis der Matcha ausgeht). Rein und
 * deterministisch, damit Tick, Offline und Zeitsprung dasselbe Ergebnis liefern.
 */
export interface AdvanceOptions {
  /**
   * Umsatz direkt aufs Konto statt über die offenen Bons der Kasse (Offline, Zeitsprung): Die Szene zeigt dann
   * keine einzelnen Zahlungen. Influencer-Hype zählt dort nicht (er ist ein Boost aktiver Spielzeit).
   */
  direct?: boolean;
}

function ratesFor(state: GameState, opts: AdvanceOptions): Map<string, LocationRates> {
  const out = new Map<string, LocationRates>();
  for (const id of Object.keys(state.locations)) {
    out.set(id, computeLocationRates(state, id, { influencerHype: !opts.direct }));
  }
  return out;
}

/** Spielminuten, bis sich etwas ändert: volle Stunde, Lieferung, Matcha geht aus (höchstens `max`). */
function segmentMinutes(
  state: GameState,
  rates: Map<string, LocationRates>,
  max: number,
): { minutes: number; toHour: boolean } {
  const toNextHour = minutesToNextHour(state.clock);
  let minutes = Math.min(max, toNextHour);
  for (const [id, loc] of Object.entries(state.locations)) {
    const arrive = nextArrival(loc.supply);
    if (arrive - state.clock > 1e-9) minutes = Math.min(minutes, arrive - state.clock);
    const grams = rates.get(id)?.matchaGramsPerHour ?? 0;
    const g = gradeInUse(loc.supply);
    if (grams > 0 && g >= 0) {
      const left = ((loc.supply.stock[g] ?? 0) / grams) * 60;
      minutes = Math.min(minutes, Math.max(left, 1e-6));
    }
  }
  return { minutes, toHour: minutes >= toNextHour - 1e-9 };
}

/** Betrieb eines Cafés über `minutes` Spielminuten mit festen Raten. */
function runLocation(
  loc: LocationState,
  r: LocationRates,
  minutes: number,
  opts: AdvanceOptions,
): { loc: LocationState; guests: number; credited: LocationState['coins'] } {
  const dtH = minutes / 60;
  const income = r.incomePerHour.mul(dtH);
  const tips = r.tipsPerHour.mul(dtH);
  const guests = r.served * dtH;
  let coins = loc.coins;
  let till = loc.till;
  let credited = income;
  if (opts.direct) coins = coins.add(income);
  else {
    const paid = settleTill(loc.till, income, guests);
    till = paid.till;
    credited = paid.paidAmount;
    coins = coins.add(credited);
  }
  const goods = r.goodsPerHour.mul(dtH);
  const wages = r.wagesPerHour.mul(dtH);
  const rent = r.rentPerHour.mul(dtH);
  const keep = (1 - BALANCE.satisfaction.approachPerMin) ** minutes;
  const target = r.satisfaction.target;
  const supply = consumeMatcha(loc.supply, r.matchaGramsPerHour * dtH);
  return {
    loc: {
      ...loc,
      coins,
      earnedThisRun: loc.earnedThisRun.add(credited),
      till,
      // Zufriedenheit und Sauberkeit ändern sich nur, solange Gäste da sind.
      satisfaction: r.open ? target + (loc.satisfaction - target) * keep : loc.satisfaction,
      cleanliness: r.open ? advanceCleanliness(loc, dtH, r.served) : loc.cleanliness,
      supply,
      social: decayBuzz(loc.social, dtH),
      bills: { ...loc.bills, pending: loc.bills.pending.add(goods).add(wages).add(rent) },
      ledger: addToLedger(loc.ledger, {
        guests,
        revenue: income.sub(tips),
        tips,
        goods,
        wages,
        rent,
      }),
    },
    credited,
    guests,
  };
}

/** Volle Stunde `hour` (Index seit Spielbeginn) beginnt: Kosten abbuchen, um Mitternacht neuer Tag. */
function onHour(state: GameState, hour: number): GameState {
  const hourOfDay = hour % 24;
  const minute = hour * 60;
  let s = state;
  for (const id of Object.keys(s.locations)) {
    let loc = getLocation(s, id);
    if (loc.bills.pending.gt(0)) {
      loc = {
        ...loc,
        coins: loc.coins.sub(loc.bills.pending),
        bills: {
          pending: loc.bills.pending.mul(0),
          last: loc.bills.pending,
          count: loc.bills.count + 1,
        },
      };
    }
    if (hourOfDay === 0) {
      loc = {
        ...loc,
        ledger: rolloverLedger(loc.ledger, hour / 24),
        social: rolloverSocial(loc.social, minute),
      };
    }
    s = { ...s, locations: { ...s.locations, [id]: loc } };
    // Nachbestellen einmal am Tag (die Lieferung kommt dann am Morgen), Videos des Managers zu seinen Stunden.
    if (hourOfDay === 0) s = autoReorderStep(s, id);
    s = managerPostStep(s, id, hourOfDay);
  }
  return s;
}

/** Ein Abschnitt: Raten einmal rechnen, bis zum nächsten Ereignis laufen, Ereignisse abarbeiten. */
function step(
  state: GameState,
  maxMinutes: number,
  opts: AdvanceOptions,
): { state: GameState; minutes: number } {
  const rates = ratesFor(state, opts);
  const { minutes, toHour } = segmentMinutes(state, rates, maxMinutes);
  const locations: Record<string, LocationState> = {};
  let lifetime = state.meta.lifetimeEarned;
  let served = 0;
  let drops = 0;
  for (const [id, loc] of Object.entries(state.locations)) {
    const r = rates.get(id);
    if (!r) {
      locations[id] = loc;
      continue;
    }
    const run = runLocation(loc, r, minutes, opts);
    locations[id] = run.loc;
    lifetime = lifetime.add(run.credited);
    served += run.guests;
    drops += expectedLeafDrops(id, run.guests);
  }
  // Auf die volle Stunde einrasten, damit sich keine Rundungsfehler über Tage sammeln.
  const clock = toHour ? (Math.floor(state.clock / 60 + 1e-9) + 1) * 60 : state.clock + minutes;
  let s: GameState = {
    ...state,
    clock,
    locations,
    meta: { ...state.meta, lifetimeEarned: lifetime },
    stats: { ...state.stats, customersServed: state.stats.customersServed + served },
  };
  s = accrueLeafDrops(s, drops);
  for (const id of Object.keys(s.locations)) {
    const loc = getLocation(s, id);
    const supply = receiveDeliveries(loc.supply, s.clock);
    if (supply !== loc.supply)
      s = { ...s, locations: { ...s.locations, [id]: { ...loc, supply } } };
  }
  const hourIdx = Math.floor(s.clock / 60 + 1e-9);
  while (s.hourMark < hourIdx) {
    const hour = s.hourMark + 1;
    s = onHour({ ...s, hourMark: hour }, hour);
  }
  return { state: s, minutes };
}

/**
 * Lässt `realSec` echte Sekunden Café-Betrieb vergehen: Die Spieluhr läuft geöffnet mit 1 Spielminute je Sekunde,
 * geschlossen schneller (`clockSpeed`). Tick, Offline und Zeitsprung nutzen dasselbe.
 */
export function advanceRealSeconds(
  state: GameState,
  realSec: number,
  opts: AdvanceOptions = {},
): GameState {
  let s = state;
  let rest = Number.isFinite(realSec) ? Math.max(0, realSec) : 0;
  // Schutz gegen Endlosschleifen bei kaputten Zuständen: höchstens so viele Abschnitte.
  for (let i = 0; i < 1_000_000 && rest > 1e-9; i++) {
    const speed = clockSpeed(s);
    const r = step(s, rest * speed, opts);
    s = r.state;
    rest -= r.minutes / speed;
  }
  return s;
}

/** Spielminuten in echte Sekunden (bei der Geschwindigkeit jetzt) – für Anzeigen wie „Lieferung in 2 min“. */
export function gameMinutesToRealSec(state: GameState, minutes: number): number {
  return minutes / clockSpeed(state);
}
