import { getLang } from '@i18n/index';
import type { GameState } from '@core/GameState';
import { formatDuration, formatNumber } from '@core/math/format';
import type { DecimalSource } from '@core/math/bignum';

/** Zahl im Format der aktuellen Sprache und der Spieler-Einstellung. */
export function fmt(state: GameState, value: DecimalSource): string {
  return formatNumber(value, getLang(), state.settings.numberFormat);
}

export function fmtTime(sec: number): string {
  return formatDuration(sec, getLang());
}

/** Kleine Zahl mit Vorzeichen (z. B. „+4,5“ / „−2“) für Zufriedenheits- und Sauberkeits-Beiträge. */
export function fmtSigned(value: number, digits = 1): string {
  return new Intl.NumberFormat(getLang(), {
    maximumFractionDigits: digits,
    signDisplay: 'exceptZero',
  }).format(Math.abs(value) < 10 ** -digits / 2 ? 0 : value);
}

/** Kleine Zahl ohne Vorzeichen, z. B. Multiplikatoren „1,23“. */
export function fmtSmall(value: number, digits = 2): string {
  return new Intl.NumberFormat(getLang(), { maximumFractionDigits: digits }).format(value);
}

/** Bonus-Prozent aus einem Multiplikator: 1.3 → „30“. */
export function fmtBonusPct(mult: number): string {
  return fmtSmall((mult - 1) * 100, 0);
}
