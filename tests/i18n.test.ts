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

describe('i18n-Abdeckung der Spieldaten', () => {
  const keys = new Set(Object.keys(de));
  it('jede Station, jedes Ambiente, jede Rolle und jeder Standort hat Texte', async () => {
    const { STATIONS } = await import('../src/data/stations');
    const { AMBIENCE } = await import('../src/data/ambience');
    const { STAFF_ROLES } = await import('../src/data/staff');
    const { LOCATIONS } = await import('../src/data/locations');
    const missing: string[] = [];
    const need = (k: string): void => {
      if (!keys.has(k)) missing.push(k);
    };
    for (const s of STATIONS) {
      need(`station.berlin.${s.id}.name`);
      need(`station.berlin.${s.id}.desc`);
    }
    for (const a of AMBIENCE) {
      need(`ambience.${a.id}.name`);
      need(`ambience.${a.id}.desc`);
    }
    for (const r of STAFF_ROLES) {
      need(`staff.${r.id}.name`);
      need(`staff.${r.id}.effect`);
    }
    for (const l of LOCATIONS) need(`location.${l.id}.name`);
    expect(missing).toEqual([]);
  });
});
