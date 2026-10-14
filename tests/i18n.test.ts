import { describe, expect, it } from 'vitest';
import de from '../src/i18n/de.json';
import en from '../src/i18n/en.json';
import { detectLang, setLang, t } from '../src/i18n/index';

describe('i18n', () => {
  it('de.json und en.json haben identische Keys', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('erkennt Sprache aus Query vor Browser-Sprache, Fallback en', () => {
    expect(detectLang('?lang=de', 'en-US')).toBe('de');
    expect(detectLang('', 'de-AT')).toBe('de');
    expect(detectLang('', 'fr-FR')).toBe('en');
    expect(detectLang('?lang=xx', undefined)).toBe('en');
  });

  it('ersetzt Platzhalter', () => {
    setLang('de');
    expect(t('scene.grid', { size: 12 })).toBe('Café-Raster 12×12');
    setLang('en');
    expect(t('hud.coins')).toBe('Coins');
  });
});
