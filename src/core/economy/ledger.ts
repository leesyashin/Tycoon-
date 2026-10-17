import type { Decimal } from '../math/bignum';
import {
  createDayLedger,
  type DayLedger,
  type LedgerState,
  type LocationState,
} from '../GameState';

export type LedgerKey = Exclude<keyof DayLedger, 'guests'>;

/** Bucht Beträge in die Tagesbilanz von heute (Kosten als positive Beträge). */
export function addToLedger(
  ledger: LedgerState,
  patch: Partial<Record<LedgerKey, Decimal>> & { guests?: number },
): LedgerState {
  const today: DayLedger = { ...ledger.today };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'guests') today.guests += v as number;
    else today[k as LedgerKey] = today[k as LedgerKey].add(v as Decimal);
  }
  return { ...ledger, today };
}

/** Neuer Spieltag: heute wird gestern, heute beginnt leer. */
export function rolloverLedger(ledger: LedgerState, day: number): LedgerState {
  if (day <= ledger.day) return ledger;
  return { day, today: createDayLedger(), yesterday: ledger.today };
}

/** Einnahmen eines Tages (Umsatz + Trinkgeld + Boni). */
export function ledgerIncome(d: DayLedger): Decimal {
  return d.revenue.add(d.tips).add(d.bonus);
}

/** Kosten eines Tages (Löhne, Wareneinsatz, Matcha, Miete, Social Media, Einstellungen). */
export function ledgerCosts(d: DayLedger): Decimal {
  return d.wages.add(d.goods).add(d.matcha).add(d.rent).add(d.marketing).add(d.hiring);
}

/** Tagesbilanz: Einnahmen − Kosten (kann negativ sein). */
export function ledgerProfit(d: DayLedger): Decimal {
  return ledgerIncome(d).sub(ledgerCosts(d));
}

/** Kosten direkt vom Konto buchen (Einkauf, Einstellung, Video) und in der Tagesbilanz vermerken. */
export function payCost(loc: LocationState, key: LedgerKey, amount: Decimal): LocationState {
  if (!amount.gt(0)) return loc;
  return {
    ...loc,
    coins: loc.coins.sub(amount),
    ledger: addToLedger(loc.ledger, { [key]: amount }),
  };
}

/** Summe zweier Tagesbilanzen (Offline-Zusammenfassung über mehrere Tage). */
export function sumLedgers(a: DayLedger, b: DayLedger): DayLedger {
  return {
    guests: a.guests + b.guests,
    revenue: a.revenue.add(b.revenue),
    tips: a.tips.add(b.tips),
    wages: a.wages.add(b.wages),
    goods: a.goods.add(b.goods),
    matcha: a.matcha.add(b.matcha),
    rent: a.rent.add(b.rent),
    marketing: a.marketing.add(b.marketing),
    hiring: a.hiring.add(b.hiring),
    bonus: a.bonus.add(b.bonus),
  };
}
