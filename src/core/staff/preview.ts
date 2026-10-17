import { getLocation, withLocation, type GameState } from '../GameState';
import { Decimal } from '../math/bignum';
import { computeLocationRates, roleWagePerHour, type LocationRates } from '../customers/rates';
import { cleanlinessEquilibrium, getStaffLevel } from './effects';

export interface StaffHirePreview {
  /** Mehr Umsatz/h zur Hauptzeit durch eine weitere Kraft (0, wenn der Engpass woanders liegt). */
  incomeDelta: Decimal;
  /** Zusätzlicher Stundenlohn. */
  wageDelta: number;
  /** Änderung des Zufriedenheits-Ziels, sobald sich die Sauberkeit eingependelt hat. */
  satisfactionDelta: number;
}

/** Stunde mit der höchsten Nachfrage in der Öffnungszeit – dort zeigt sich, was eine Kraft bringt. */
export function peakHour(state: GameState, locationId: string): number {
  const loc = getLocation(state, locationId);
  let best = loc.hours.open;
  let demand = -1;
  for (let h = loc.hours.open; h < loc.hours.close; h++) {
    const d = computeLocationRates(state, locationId, { hour: h, influencerHype: false }).spawnRate;
    if (d > demand) {
      demand = d;
      best = h;
    }
  }
  return best;
}

/** Raten zur Hauptzeit (für Vorschauen, die nachts nicht 0 zeigen sollen). */
export function peakRates(state: GameState, locationId: string): LocationRates {
  return computeLocationRates(state, locationId, {
    hour: peakHour(state, locationId),
    influencerHype: false,
  });
}

/** Was eine weitere Kraft bewirkt – damit das Personal-Panel jede Einstellung mit Zahlen erklärt. */
export function previewStaffHire(
  state: GameState,
  locationId: string,
  id: string,
): StaffHirePreview {
  const loc = getLocation(state, locationId);
  const hired = { ...loc, staff: { ...loc.staff, [id]: getStaffLevel(loc, id) + 1 } };
  const after = withLocation(state, locationId, hired);
  const hour = peakHour(state, locationId);
  const rates = (s: GameState): LocationRates =>
    computeLocationRates(s, locationId, { hour, influencerHype: false });
  const incomeDelta = rates(after).incomePerHour.sub(rates(state).incomePerHour);
  const settled = (s: GameState): number => {
    const l = getLocation(s, locationId);
    const eq = withLocation(s, locationId, {
      ...l,
      cleanliness: cleanlinessEquilibrium(l, rates(s).served),
    });
    return rates(eq).satisfaction.target;
  };
  return {
    incomeDelta: Decimal.max(incomeDelta, 0),
    wageDelta: roleWagePerHour(hired, id, locationId) - roleWagePerHour(loc, id, locationId),
    satisfactionDelta: settled(after) - settled(state),
  };
}
