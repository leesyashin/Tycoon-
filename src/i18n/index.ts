import de from './de.json';
import en from './en.json';

export type Lang = 'de' | 'en';
export type Params = Record<string, string | number>;

const dictionaries: Record<Lang, Record<string, string>> = { de, en };

let current: Lang = 'en';

/** `?lang=` schlägt `navigator.language`; Fallback ist Englisch. */
export function detectLang(search: string, navLang: string | undefined): Lang {
  const q = new URLSearchParams(search).get('lang');
  if (q === 'de' || q === 'en') return q;
  return navLang?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

export function t(key: string, params: Params = {}): string {
  const raw = dictionaries[current][key] ?? dictionaries.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => String(params[name] ?? m));
}
