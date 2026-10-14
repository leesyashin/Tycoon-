import { CUSTOMER_SHARE_SHIFT, CUSTOMER_TYPES, type CustomerTypeId } from '@data/customerTypes';

/** Normierte Anteile der Kundentypen für einen Standort (GAME_DESIGN § 7.5). */
export function customerTypeShares(locationId: string): Record<CustomerTypeId, number> {
  const shift = CUSTOMER_SHARE_SHIFT[locationId] ?? {};
  const raw = CUSTOMER_TYPES.map((t) => [t.id, t.share * (shift[t.id] ?? 1)] as const);
  const sum = raw.reduce((a, [, v]) => a + v, 0);
  return Object.fromEntries(raw.map(([id, v]) => [id, v / sum])) as Record<CustomerTypeId, number>;
}

/** Zieht einen Typ mit `roll` ∈ [0, 1). */
export function pickCustomerType(
  shares: Record<CustomerTypeId, number>,
  roll: number,
): CustomerTypeId {
  let acc = 0;
  let last: CustomerTypeId = 'student';
  for (const t of CUSTOMER_TYPES) {
    acc += shares[t.id];
    last = t.id;
    if (roll < acc) return t.id;
  }
  return last;
}
