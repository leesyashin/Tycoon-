import Decimal from 'break_infinity.js';

export { Decimal };

export type DecimalSource = Decimal | number | string;

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

export function D(v: DecimalSource): Decimal {
  return v instanceof Decimal ? v : new Decimal(v);
}

export function isDecimalNaN(d: Decimal): boolean {
  return Number.isNaN(d.mantissa) || Number.isNaN(d.exponent);
}
