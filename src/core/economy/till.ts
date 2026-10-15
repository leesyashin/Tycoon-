import { D, Decimal } from '../math/bignum';
import type { TillState } from '../GameState';

export function createTill(): TillState {
  return { open: D(0), progress: 0, paid: 0 };
}

export interface TillResult {
  till: TillState;
  /** Gutschrift dieses Schritts (Summe der Gäste, die fertig bezahlt haben). */
  paidAmount: Decimal;
  /** Gäste, die in diesem Schritt bezahlt haben. */
  paidCount: number;
}

/**
 * Kasse (GAME_DESIGN § 7.2): Das Rate-Modell legt den Umsatz zuerst auf offene Bons; ins Geld kommt er erst, wenn
 * ein Gast fertig bezahlt hat, je ganzem Gast. Bei gleichbleibenden Raten zahlt jeder Gast genau den
 * Durchschnittsbon (`income / served`), über die Zeit ist die Summe dieselbe wie bei laufender Gutschrift.
 */
export function settleTill(till: TillState, income: Decimal, customers: number): TillResult {
  const add = Number.isFinite(customers) ? Math.max(0, customers) : 0;
  const open = till.open.add(income);
  const progress = till.progress + add;
  const paidCount = Math.floor(progress);
  if (paidCount < 1) return { till: { ...till, open, progress }, paidAmount: D(0), paidCount: 0 };
  // Anteil der fertigen Gäste am offenen Umsatz; der Rest gehört dem Gast, der gerade bezahlt.
  const paidAmount = open.mul(paidCount / progress);
  return {
    till: {
      open: open.sub(paidAmount),
      progress: progress - paidCount,
      paid: till.paid + paidCount,
    },
    paidAmount,
    paidCount,
  };
}
