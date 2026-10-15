import { getLocation, withLocation, type GameState } from '../GameState';
import { Decimal } from '../math/bignum';
import { computeLocationRates } from '../customers/rates';
import { cleanlinessEquilibrium, getStaffLevel } from './effects';

export interface StaffHirePreview {
  /** Sofortiger Zuwachs an Einkommen/s durch eine weitere Kraft (0, wenn der Engpass woanders liegt). */
  incomeDelta: Decimal;
  /** Änderung des Zufriedenheits-Ziels, sobald sich die Sauberkeit eingependelt hat. */
  satisfactionDelta: number;
}

/** Was eine weitere Kraft bewirkt – damit das Personal-Panel jeden Kauf mit Zahlen erklärt. */
export function previewStaffHire(
  state: GameState,
  locationId: string,
  id: string,
): StaffHirePreview {
  const loc = getLocation(state, locationId);
  const hired = { ...loc, staff: { ...loc.staff, [id]: getStaffLevel(loc, id) + 1 } };
  const after = withLocation(state, locationId, hired);
  const incomeDelta = computeLocationRates(after, locationId).incomePerSec.sub(
    computeLocationRates(state, locationId).incomePerSec,
  );
  const settled = (s: GameState): number => {
    const l = getLocation(s, locationId);
    const served = computeLocationRates(s, locationId).served;
    const eq = withLocation(s, locationId, { ...l, cleanliness: cleanlinessEquilibrium(l, served) });
    return computeLocationRates(eq, locationId).satisfaction.target;
  };
  return {
    incomeDelta: Decimal.max(incomeDelta, 0),
    satisfactionDelta: settled(after) - settled(state),
  };
}
