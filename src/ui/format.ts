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
