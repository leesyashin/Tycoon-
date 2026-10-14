import { MONETIZATION_ENABLED } from '@data/monetization';

/** Wo eine Belohnung ausgelöst wird; ein echter Provider bildet das auf seine Ad-Unit ab. */
export type RewardPlacement = 'freeBoost';

export interface RewardResult {
  rewarded: boolean;
}

export interface PurchaseResult {
  ok: boolean;
  reason?: 'unavailable' | 'cancelled' | 'failed';
}

/**
 * Einziger Einstiegspunkt für Werbung und Käufe (PLAN § 2.3). Das Spiel kennt nur dieses Interface;
 * die Belohnung selbst (z. B. `claimFreeBoost`) bucht immer `core`, nie der Provider.
 */
export interface MonetizationProvider {
  isAvailable(): boolean;
  showRewarded(placement: RewardPlacement): Promise<RewardResult>;
  purchase(sku: string): Promise<PurchaseResult>;
}

/** Ohne SDK und Netzwerk: „Werbung ansehen“ gelingt sofort, Käufe gibt es nicht. */
export class NoopProvider implements MonetizationProvider {
  isAvailable(): boolean {
    return true;
  }

  showRewarded(): Promise<RewardResult> {
    return Promise.resolve({ rewarded: true });
  }

  purchase(): Promise<PurchaseResult> {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }
}

/**
 * Wählt den Provider. Es gibt noch keinen echten: Auch mit `MONETIZATION_ENABLED` liefert das den
 * `NoopProvider`. Ein echter würde hier per dynamischem `import()` nachgeladen, damit sein SDK bei
 * ausgeschaltetem Flag nicht im Bundle landet (siehe STATUS.md „Monetarisierung“).
 */
export function createMonetizationProvider(): MonetizationProvider {
  return new NoopProvider();
}

export const isMonetizationEnabled = (): boolean => MONETIZATION_ENABLED;
