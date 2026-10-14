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
    // Jeder Standort hat eigene Stations-Namen (GAME_DESIGN § 3).
    for (const l of LOCATIONS) {
      for (const s of STATIONS) {
        need(`station.${l.id}.${s.id}.name`);
        need(`station.${l.id}.${s.id}.desc`);
      }
    }
    for (const a of AMBIENCE) {
      need(`ambience.${a.id}.name`);
      need(`ambience.${a.id}.desc`);
    }
    for (const r of STAFF_ROLES) {
      need(`staff.${r.id}.name`);
      need(`staff.${r.id}.effect`);
    }
    for (const l of LOCATIONS) {
      need(`location.${l.id}.name`);
      need(`location.${l.id}.theme`);
    }
    expect(missing).toEqual([]);
  });
  it('jedes Meta-Upgrade hat Name und Beschreibung', async () => {
    const { META_UPGRADES } = await import('../src/data/prestige');
    const missing = META_UPGRADES.flatMap((m) => [`zen.${m.id}.name`, `zen.${m.id}.desc`]).filter(
      (k) => !keys.has(k),
    );
    expect(missing).toEqual([]);
  });

  it('Qualitätsstufen, Produkte, Erfolge und Tagesaufgaben haben Texte', async () => {
    const { MAX_QUALITY } = await import('../src/data/quality');
    const { STATIONS } = await import('../src/data/stations');
    const { ACHIEVEMENTS } = await import('../src/data/achievements');
    const { QUESTS } = await import('../src/data/quests');
    const missing: string[] = [];
    const need = (k: string): void => {
      if (!keys.has(k)) missing.push(k);
    };
    for (let q = 0; q <= MAX_QUALITY; q++) {
      need(`quality.tier.${String(q)}.name`);
      need(`quality.tier.${String(q)}.prefix`);
    }
    for (const s of STATIONS) if (s.basePrice > 0) need(`product.${s.id}`);
    for (const a of ACHIEVEMENTS) {
      need(`achievement.${a.kind}.name`);
      need(`achievement.${a.kind}.desc`);
    }
    for (const q of QUESTS) need(`quest.${q.kind}`);
    expect(missing).toEqual([]);
  });

  it('jedes Event, jeder Skin und jeder Boost hat Texte', async () => {
    const { RANDOM_EVENTS, CALENDAR_EVENTS } = await import('../src/data/events');
    const { SKINS, BOOSTS } = await import('../src/data/leaves');
    const missing: string[] = [];
    const need = (k: string): void => {
      if (!keys.has(k)) missing.push(k);
    };
    for (const e of [...RANDOM_EVENTS, ...CALENDAR_EVENTS]) {
      need(`event.${e.id}.name`);
      need(`event.${e.id}.desc`);
    }
    for (const sk of SKINS) {
      need(`skin.${sk.id}.name`);
      need(`skin.${sk.id}.desc`);
    }
    for (const b of Object.values(BOOSTS)) need(`hud.boost.${b.id}`);
    expect(missing).toEqual([]);
  });
});
