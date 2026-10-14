import { describe, expect, it } from 'vitest';
import { D, formatDuration, formatNumber, suffixForTier } from '@core/math';

describe('formatNumber', () => {
  it('zeigt kleine Zahlen ohne Suffix', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(12.5)).toBe('12.5');
    expect(formatNumber(0.456)).toBe('0.46');
  });
  it('rundet 999.999 auf 1.00 K', () => {
    expect(formatNumber(999.999)).toBe('1.00 K');
  });
  it('nutzt K M B T', () => {
    expect(formatNumber(1000)).toBe('1.00 K');
    expect(formatNumber(1234)).toBe('1.23 K');
    expect(formatNumber(2.5e6)).toBe('2.50 M');
    expect(formatNumber(7e9)).toBe('7.00 B');
    expect(formatNumber(1e12)).toBe('1.00 T');
  });
  it('geht ab 1e15 auf aa, ab, …', () => {
    expect(formatNumber(1e15)).toBe('1.00 aa');
    expect(formatNumber(1e18)).toBe('1.00 ab');
    expect(formatNumber(1e33)).toBe('1.00 ag');
  });
  it('rundet Mantisse über Stufen hinweg', () => {
    expect(formatNumber(999_999)).toBe('1.00 M');
    expect(formatNumber(D('9.9999e14'))).toBe('1.00 aa');
  });
  it('deutscher Dezimaltrenner', () => {
    expect(formatNumber(1_230_000, 'de')).toBe('1,23 M');
    expect(formatNumber(0.5, 'de')).toBe('0,5');
  });
  it('wissenschaftlich', () => {
    expect(formatNumber(1.5e15, 'en', 'scientific')).toBe('1.50e15');
    expect(formatNumber(D('9.999e7'), 'en', 'scientific')).toBe('1.00e8');
  });
  it('fällt bei riesigen Zahlen auf Exponent zurück', () => {
    expect(formatNumber(D('1e3000'))).toBe('1.00e3000');
  });
  it('behandelt negative Werte und NaN', () => {
    expect(formatNumber(-1500)).toBe('-1.50 K');
    expect(formatNumber(D(NaN))).toBe('0');
  });
  it('suffixForTier', () => {
    expect(suffixForTier(0)).toBe('');
    expect(suffixForTier(5)).toBe('aa');
    expect(suffixForTier(5 + 26)).toBe('ba');
    expect(suffixForTier(100000)).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('formatiert je Sprache', () => {
    expect(formatDuration(3 * 3600 + 12 * 60, 'de')).toBe('3 h 12 min');
    expect(formatDuration(3 * 3600 + 12 * 60, 'en')).toBe('3h 12m');
    expect(formatDuration(45, 'en')).toBe('45s');
    expect(formatDuration(0, 'en')).toBe('0s');
    expect(formatDuration(-5, 'en')).toBe('0s');
    expect(formatDuration(125, 'en')).toBe('2m 5s');
  });
});
