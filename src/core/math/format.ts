import { D, isDecimalNaN, type DecimalSource } from './bignum';

export type NumberFormatMode = 'short' | 'scientific';
export type FormatLang = 'de' | 'en';

const NAMED = ['', 'K', 'M', 'B', 'T'];
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Tier 1..4 = K M B T, danach aa, ab, … zz (Tier 5 = aa). */
export function suffixForTier(tier: number): string | undefined {
  if (tier < NAMED.length) return NAMED[tier];
  const i = tier - NAMED.length;
  if (i >= 26 * 26) return undefined;
  return LETTERS.charAt(Math.floor(i / 26)) + LETTERS.charAt(i % 26);
}

const LOCALES: Record<FormatLang, string> = { de: 'de-DE', en: 'en-US' };
const fixed2 = new Map<FormatLang, Intl.NumberFormat>();
const upTo2 = new Map<FormatLang, Intl.NumberFormat>();

function formatter(cache: Map<FormatLang, Intl.NumberFormat>, lang: FormatLang, min: number) {
  let f = cache.get(lang);
  if (!f) {
    // Ohne Tausendertrennung: Werte ≥ 1000 bekommen ohnehin ein Suffix.
    f = new Intl.NumberFormat(LOCALES[lang], {
      minimumFractionDigits: min,
      maximumFractionDigits: 2,
      useGrouping: false,
    });
    cache.set(lang, f);
  }
  return f;
}

/** Mantisse mit genau 2 Nachkommastellen, lokaler Dezimaltrenner. */
function localize(n: number, lang: FormatLang): string {
  // Erst wie die Grenzprüfungen runden, sonst könnte Intl anders runden als `toFixed`.
  return formatter(fixed2, lang, 2).format(Number(n.toFixed(2)));
}

/** Bis 2 Nachkommastellen, ohne überflüssige Nullen. */
function plain(n: number, lang: FormatLang): string {
  return formatter(upTo2, lang, 0).format(Number(n.toFixed(2)));
}

/** Kurzformat mit denselben Suffixen in beiden Sprachen; nur der Dezimaltrenner ist lokal. */
export function formatNumber(
  value: DecimalSource,
  lang: FormatLang = 'en',
  mode: NumberFormatMode = 'short',
): string {
  const d = D(value);
  if (isDecimalNaN(d)) return '0';
  if (d.lt(0)) return '-' + formatNumber(d.neg(), lang, mode);
  if (d.lt(1000)) {
    const n = d.toNumber();
    // 999.999 rundet auf 1000 → muss als „1.00 K“ erscheinen.
    if (Number(n.toFixed(2)) < 1000) return plain(n, lang);
    return localize(1, lang) + ' K';
  }
  let exp = d.e;
  let mant = d.mantissa;
  // Mantisse auf 2 Stellen runden; 9.999 → 10.00 verschiebt den Exponenten.
  if (Number(mant.toFixed(2)) >= 10) {
    mant = 1;
    exp += 1;
  }
  if (mode === 'scientific') {
    return localize(mant, lang) + 'e' + String(exp);
  }
  const tier = Math.floor(exp / 3);
  const suffix = suffixForTier(tier);
  if (suffix === undefined) return localize(mant, lang) + 'e' + String(exp);
  const shifted = mant * 10 ** (exp - tier * 3);
  // Rundung kann 999.995 → 1000.00 erzeugen; dann eine Stufe höher.
  if (Number(shifted.toFixed(2)) >= 1000) {
    const next = suffixForTier(tier + 1);
    if (next !== undefined) return localize(1, lang) + ' ' + next;
  }
  return localize(shifted, lang) + ' ' + suffix;
}

/** `3 h 12 min` (de) bzw. `3h 12m` (en). */
export function formatDuration(totalSec: number, lang: FormatLang = 'en'): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const [uh, um, us] = lang === 'de' ? [' h', ' min', ' s'] : ['h', 'm', 's'];
  const parts: string[] = [];
  if (h > 0) parts.push(`${String(h)}${uh}`);
  if (m > 0) parts.push(`${String(m)}${um}`);
  if (h === 0 && (sec > 0 || parts.length === 0)) parts.push(`${String(sec)}${us}`);
  return parts.join(' ');
}
