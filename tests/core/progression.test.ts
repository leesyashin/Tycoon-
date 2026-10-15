import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { D } from '@core/math';
import { tick } from '@core/GameLoop';
import { applyOffline, buyStation, isStationUnlocked, needsTerrace } from '@core/economy';
import { computeLocationRates, tapCafe } from '@core/customers';
import { startCampaign } from '@core/marketing';
import {
  achievementProgress,
  achievementValue,
  buyQuality,
  checkAchievements,
  claimQuest,
  countUnlockedAchievements,
  getCafeLevelReward,
  getNextQualityCost,
  isNextQualityUnlocked,
  isQualityMaxed,
  isQuestComplete,
  localDateKey,
  localHour,
  pickDailyQuests,
  progressionStep,
  qualityPriceMult,
  questStat,
  refreshQuests,
  updateQuestProgress,
} from '@core/progression';
import { deserialize, migrate, serialize } from '@core/save';
import { ACHIEVEMENTS, getAchievementDef } from '@data/achievements';
import { QUALITY_TIERS } from '@data/quality';
import { QUESTS, QUEST_CONFIG, getQuestDef } from '@data/quests';
import {
  CAFE_LEVEL_REWARD,
  cafeLevelLeaves,
  getNextUnlockLevel,
  getUnlocksAt,
} from '@data/unlocks';
import { STATIONS } from '@data/stations';

const L = 'berlin';
const fresh = (): GameState => createInitialState(0);
const patch = (s: GameState, p: Partial<LocationState>): GameState =>
  withLocation(s, L, { ...getLocation(s, L), ...p });
const loc = (s: GameState): LocationState => getLocation(s, L);
const ctx = (now = 0, localHourValue = 12) => ({ now, localHour: localHourValue });

describe('Matcha-Qualität (GAME_DESIGN § 8)', () => {
  it('Preis-Multiplikator 1.5^Stufe wirkt aufs Einkommen', () => {
    const s = patch(fresh(), { satisfaction: 50 });
    const base = computeLocationRates(s, L).incomePerSec.toNumber();
    const q2 = patch(s, { quality: 2 });
    expect(qualityPriceMult(loc(q2))).toBeCloseTo(2.25);
    // Ziel-Zufriedenheit steigt auch, aber das Einkommen nutzt die aktuelle Zufriedenheit.
    expect(computeLocationRates(q2, L).incomePerSec.toNumber()).toBeCloseTo(base * 2.25);
  });
  it('Stufe ist erst ab ihrem Café-Level kaufbar und kostet Münzen × Standort', () => {
    let s = patch(fresh(), { coins: D(1e6) });
    expect(isNextQualityUnlocked(s, L)).toBe(false);
    expect(buyQuality(s, L)).toBe(s);
    s = patch(s, { level: 3 });
    expect(getNextQualityCost(s, L)?.toNumber()).toBe(5_000);
    s = buyQuality(s, L);
    expect(loc(s).quality).toBe(1);
    expect(loc(s).coins.toNumber()).toBeCloseTo(1e6 - 5_000);
    // Stufe 2 braucht Café-Level 6.
    expect(buyQuality(s, L)).toBe(s);
  });
  it('zu teuer → nichts; ausgebaut → nichts', () => {
    const poor = patch(fresh(), { level: 3, coins: D(10) });
    expect(buyQuality(poor, L)).toBe(poor);
    const max = patch(fresh(), { level: 50, coins: D(1e20), quality: QUALITY_TIERS.length });
    expect(isQualityMaxed(max, L)).toBe(true);
    expect(getNextQualityCost(max, L)).toBeNull();
    expect(buyQuality(max, L)).toBe(max);
  });
  it('Standort-Skalierung auf die Kosten', () => {
    let s = createInitialState(0);
    s = { ...s, locations: { ...s.locations, kyoto: { ...loc(s), level: 3 } } };
    expect(getNextQualityCost(s, 'kyoto')?.toNumber()).toBe(5_000 * 25);
  });
});

describe('Freischalt-Tabelle und Café-Level (GAME_DESIGN § 5.3)', () => {
  it('sammelt Stationen, Ambiente, Personal, Qualität und Marketing je Level', () => {
    const at3 = getUnlocksAt(3).map((u) => `${u.kind}:${u.id}`);
    expect(at3).toEqual(expect.arrayContaining(['station:iceBox', 'quality:1']));
    const at2 = getUnlocksAt(2).map((u) => `${u.kind}:${u.id}`);
    expect(at2).toEqual(expect.arrayContaining(['marketing:campaign', 'staff:cleaner']));
    expect(getUnlocksAt(8).map((u) => u.id)).toContain('terrace');
    expect(getUnlocksAt(999)).toEqual([]);
    expect(getNextUnlockLevel(1)).toBe(2);
    expect(getNextUnlockLevel(24)).toBeNull();
  });
  it('jedes Café-Level 2–12 schaltet etwas frei', () => {
    for (let l = 2; l <= 12; l++) {
      if (l === 11) continue; // Lücke im Design (§ 4/§ 6): nichts für Level 11 vorgesehen.
      expect(getUnlocksAt(l).length, `Level ${String(l)}`).toBeGreaterThan(0);
    }
  });
  it('Blätter-Belohnung erst ab Level 5, dann 1–3', () => {
    expect(cafeLevelLeaves(4)).toBe(0);
    expect(cafeLevelLeaves(5)).toBe(1);
    expect(cafeLevelLeaves(10)).toBe(2);
    expect(cafeLevelLeaves(15)).toBe(3);
    expect(cafeLevelLeaves(50)).toBe(3);
  });
  it('Level-Aufstieg gibt 30 s Einkommen und ab Level 5 Blätter, genau einmal', () => {
    // 24 Stations-Level = Café-Level 1; der nächste Kauf hebt auf Level 2.
    let s = patch(fresh(), { coins: D(1e9), satisfaction: 50 });
    s = patch(s, { stations: { ...loc(s).stations, matchaStation: { level: 24, unlocked: true } } });
    const before = buyStation(s, L, 'register', 0 as never);
    expect(before).toBe(s);
    const income = computeLocationRates(
      patch(s, {
        level: 2,
        stations: { ...loc(s).stations, register: { level: 1, unlocked: true } },
      }),
      L,
    ).incomePerSec;
    const cost = 60;
    const after = buyStation(s, L, 'register', 1);
    expect(loc(after).level).toBe(2);
    const reward = income.mul(CAFE_LEVEL_REWARD.incomeSeconds).toNumber();
    expect(loc(after).coins.toNumber()).toBeCloseTo(1e9 - cost + reward, 3);
    expect(after.meta.goldenLeaves.toNumber()).toBe(0);
    expect(after.stats.levelsBought).toBe(1);
    // Ein weiterer Kauf ohne Level-Aufstieg gibt nichts extra.
    const again = buyStation(after, L, 'register', 1);
    expect(loc(again).level).toBe(2);
    expect(again.meta.lifetimeEarned.eq(after.meta.lifetimeEarned)).toBe(true);
  });
  it('mehrere Level auf einmal: Blätter für jedes Level ab 5', () => {
    const s = patch(fresh(), { level: 4 });
    expect(getCafeLevelReward(s, L, 4, 10).leaves).toBe(1 + 1 + 1 + 1 + 1 + 2);
    expect(getCafeLevelReward(s, L, 5, 5).coins.toNumber()).toBe(0);
  });
  it('Stationen ab Café-Level 9 brauchen Terrasse Stufe 1', () => {
    let s = patch(fresh(), { level: 9 });
    expect(needsTerrace(s, L, 'grinder')).toBe(true);
    expect(needsTerrace(s, L, 'displayCase')).toBe(false);
    expect(isStationUnlocked(s, L, 'grinder')).toBe(false);
    s = patch(s, { ambience: { terrace: 1 } });
    expect(isStationUnlocked(s, L, 'grinder')).toBe(true);
  });
});

describe('Statistik-Zähler', () => {
  it('Tick zählt bediente Kunden und Zufriedenheit 90+ am Stück', () => {
    let s = patch(fresh(), { satisfaction: 95, decor: undefined } as never);
    const served = computeLocationRates(s, L).served;
    s = tick(s, 10_000);
    expect(s.stats.customersServed).toBeCloseTo(served * 10);
    expect(s.stats.highSatisfactionSec).toBeCloseTo(10);
    s = patch(s, { satisfaction: 20 });
    s = tick(s, 1000);
    expect(s.stats.highSatisfactionSec).toBe(0);
    expect(s.stats.highSatisfactionBestSec).toBeCloseTo(10);
  });
  it('Taps, Hype-Füllungen, Kampagnen und Offline-Kunden', () => {
    let s = fresh();
    for (let i = 0; i < 30; i++) {
      s = tapCafe({ ...s, playtimeSec: i }, L).state;
    }
    expect(s.stats.taps).toBe(30);
    expect(s.stats.hypeFills).toBe(1);
    s = patch(s, { level: 2, coins: D(1e6) });
    s = startCampaign(s, L);
    expect(s.stats.campaigns).toBe(1);
    const off = applyOffline(fresh(), 3_600_000).state;
    expect(off.stats.customersServed).toBeGreaterThan(0);
  });
});

describe('Achievements (GAME_DESIGN § 13.1)', () => {
  it('rund 40 Stück, eindeutige IDs, Belohnung 2–25, drei geheime', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.reward).toBeGreaterThanOrEqual(2);
      expect(a.reward).toBeLessThanOrEqual(25);
    }
    expect(ACHIEVEMENTS.filter((a) => a.secret).length).toBe(3);
    expect(() => getAchievementDef('nope')).toThrow();
  });
  it('löst aus, schreibt Blätter gut – und nur einmal', () => {
    const s = { ...fresh(), stats: { ...fresh().stats, customersServed: 150 } };
    const r = checkAchievements(s, ctx(1234));
    expect(r.unlocked).toEqual(['served1']);
    expect(r.state.meta.achievements['served1']?.unlockedAt).toBe(1234);
    expect(r.state.meta.goldenLeaves.toNumber()).toBe(2);
    expect(r.state.stats.leavesEarned).toBe(2);
    const again = checkAchievements(r.state, ctx(5000));
    expect(again.unlocked).toEqual([]);
    expect(again.state).toBe(r.state);
    expect(countUnlockedAchievements(again.state)).toBe(1);
  });
  it('jede Art misst den richtigen Wert', () => {
    let s = fresh();
    s = patch(s, {
      level: 5,
      quality: 2,
      cleanliness: 100,
      marketing: { level: 30 },
      staff: { manager: 5 },
      stations: Object.fromEntries(STATIONS.map((d) => [d.id, { level: 30, unlocked: true }])),
    });
    s = {
      ...s,
      playtimeSec: 4000,
      meta: { ...s.meta, lifetimeEarned: D(2e6), unlockedLocations: ['berlin', 'kyoto'] },
      stats: {
        ...s.stats,
        taps: 120,
        hypeFills: 10,
        resets: 1,
        events: 1,
        campaigns: 1,
        questsCompleted: 10,
        highSatisfactionBestSec: 700,
      },
    };
    const v = (id: string, c = ctx()) => achievementValue(s, getAchievementDef(id), c);
    expect(v('earned1')).toBe(2e6);
    expect(v('stationLevel1')).toBe(30);
    expect(v('cafeLevel1')).toBe(5);
    expect(v('allStations')).toBe(1);
    expect(v('quality1')).toBe(2);
    expect(v('highSatisfaction')).toBe(700);
    expect(v('staffMaxed')).toBe(1);
    expect(v('resets1')).toBe(1);
    expect(v('locations1')).toBe(2);
    expect(v('taps1')).toBe(120);
    expect(v('hype1')).toBe(10);
    expect(v('events1')).toBe(1);
    expect(v('playtime1')).toBe(4000);
    expect(v('campaigns1')).toBe(1);
    expect(v('quests1')).toBe(10);
    expect(v('marketingMax')).toBe(30);
    expect(v('spotless')).toBe(1);
    expect(v('nightShift', ctx(0, 3))).toBe(1);
    expect(v('nightShift', ctx(0, 4))).toBe(0);
    expect(achievementValue(s, getAchievementDef('nightShift'))).toBe(0);
    expect(achievementProgress(s, getAchievementDef('served1'))).toBe(0);
    expect(achievementProgress(s, getAchievementDef('taps2'))).toBeCloseTo(0.12);
    const unlocked = checkAchievements(s, ctx(1, 3)).state;
    expect(achievementProgress(unlocked, getAchievementDef('nightShift'))).toBe(1);
  });
  it('„Alle Stationen“ fehlt, solange eine Station Level 0 hat', () => {
    const s = fresh();
    expect(achievementValue(s, getAchievementDef('allStations'))).toBe(0);
    expect(achievementValue(s, getAchievementDef('spotless'))).toBe(0);
  });
});

describe('Daily Quests (GAME_DESIGN § 13.2)', () => {
  // 2026-03-10 23:30 UTC
  const T = Date.UTC(2026, 2, 10, 23, 30);
  it('Datum und Stunde in lokaler Zeit (Offset wie getTimezoneOffset)', () => {
    expect(localDateKey(T, 0)).toBe('2026-03-10');
    // Berlin (UTC+1 → Offset −60): schon der 11.
    expect(localDateKey(T, -60)).toBe('2026-03-11');
    expect(localHour(T, -60)).toBe(0);
    // New York (UTC−5 → Offset 300): noch der 10., 18:30.
    expect(localDateKey(T, 300)).toBe('2026-03-10');
    expect(localHour(T, 300)).toBe(18);
    // Tokio (UTC+9) und Chatham (UTC+13:45)
    expect(localDateKey(T, -540)).toBe('2026-03-11');
    expect(localHour(Date.UTC(2026, 0, 1, 12, 0), -825)).toBe(1);
  });
  it('drei verschiedene, aktive Quests, deterministisch je Datum', () => {
    const a = pickDailyQuests('2026-03-10');
    expect(a).toHaveLength(QUEST_CONFIG.perDay);
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
    expect(a.every((q) => q.enabled)).toBe(true);
    expect(pickDailyQuests('2026-03-10')).toEqual(a);
    const days = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      days.add(
        pickDailyQuests(`2026-02-${String(d).padStart(2, '0')}`)
          .map((q) => q.id)
          .join(),
      );
    }
    expect(days.size).toBeGreaterThan(3);
    // Seit S7 gibt es Events: „Beende ein Event“ ist im Pool und wird an manchen Tagen gezogen.
    const drawn = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      for (const q of pickDailyQuests(`2026-04-${String(d)}`)) drawn.add(q.id);
    }
    expect(drawn).toContain('event1');
    expect(QUESTS.every((q) => q.enabled)).toBe(true);
  });
  it('Reset um lokale Mitternacht, nicht um UTC-Mitternacht', () => {
    const berlin = -60;
    let s = refreshQuests(fresh(), T - 3_600_000, berlin); // 22:30 UTC = 23:30 Berlin, 10.03.
    expect(s.quests.date).toBe('2026-03-10');
    const midnight = refreshQuests(s, T - 1_800_000, berlin); // 23:00 UTC = 00:00 Berlin
    expect(midnight.quests.date).toBe('2026-03-11');
    s = refreshQuests(s, T - 3_000_000, berlin); // 22:40 UTC = 23:40 Berlin, gleicher Tag
    expect(refreshQuests(s, T - 3_000_000, berlin)).toBe(s);
    // Uhr einen Tag zurück: keine neuen Aufgaben (S9).
    expect(refreshQuests(midnight, T - 3_600_000 - 86_400_000, berlin)).toBe(midnight);
    // Derselbe Zeitpunkt ist in New York noch der 10. → kein Reset.
    const ny = refreshQuests(fresh(), T - 3_600_000, 300);
    expect(refreshQuests(ny, T, 300)).toBe(ny);
  });
  it('Fortschritt zählt ab dem Ziehen; neuer Tag verwirft unerledigte', () => {
    let s = { ...fresh(), stats: { ...fresh().stats, customersServed: 1000, taps: 50 } };
    s = {
      ...s,
      quests: {
        date: '2026-03-10',
        bonusClaimed: false,
        items: [
          { id: 'serve500', base: 1000, progress: 0, claimed: false },
          { id: 'tap100', base: 50, progress: 0, claimed: false },
          { id: 'satisfaction80', base: 0, progress: 0, claimed: false },
        ],
      },
    };
    // Zähler-Quests starten bei 0; die Zufriedenheits-Quest übernimmt sofort den aktuellen Wert.
    const start = updateQuestProgress(s);
    expect(start.quests.items.map((i) => i.progress)).toEqual([0, 0, 50]);
    expect(updateQuestProgress(start)).toBe(start);
    s = { ...s, stats: { ...s.stats, customersServed: 1300.7, taps: 200 } };
    s = patch(s, { satisfaction: 85 });
    s = updateQuestProgress(s);
    expect(s.quests.items.map((i) => i.progress)).toEqual([300, 100, 80]);
    // Zufriedenheit fällt wieder: der Bestwert bleibt.
    s = updateQuestProgress(patch(s, { satisfaction: 40 }));
    expect(s.quests.items[2]?.progress).toBe(80);
    const next = refreshQuests(s, Date.UTC(2026, 2, 11, 12), 0);
    expect(next.quests.date).toBe('2026-03-11');
    expect(next.quests.items.every((i) => i.progress === 0 && !i.claimed)).toBe(true);
    const serve = next.quests.items.find((i) => i.id === 'serve500');
    if (serve) expect(serve.base).toBeCloseTo(1300.7);
  });
  it('Abholen: 3 🍃 je Quest, beim dritten +5 Bonus, nichts doppelt', () => {
    let s: GameState = {
      ...fresh(),
      quests: {
        date: 'x',
        bonusClaimed: false,
        items: [
          { id: 'serve500', base: 0, progress: 500, claimed: false },
          { id: 'tap100', base: 0, progress: 100, claimed: false },
          { id: 'buy20', base: 0, progress: 3, claimed: false },
        ],
      },
    };
    expect(isQuestComplete({ id: 'buy20', base: 0, progress: 3, claimed: false })).toBe(false);
    expect(claimQuest(s, 2)).toBe(s);
    expect(claimQuest(s, 9)).toBe(s);
    s = claimQuest(s, 0);
    expect(s.meta.goldenLeaves.toNumber()).toBe(3);
    expect(claimQuest(s, 0)).toBe(s);
    s = claimQuest(s, 1);
    s = { ...s, stats: { ...s.stats, levelsBought: 20 } };
    s = updateQuestProgress(s);
    s = claimQuest(s, 2);
    expect(s.meta.goldenLeaves.toNumber()).toBe(3 * 3 + 5);
    expect(s.quests.bonusClaimed).toBe(true);
    expect(s.stats.questsCompleted).toBe(3);
  });
  it('unbekannte Quest-IDs (alter Save) werden ignoriert', () => {
    const s: GameState = {
      ...fresh(),
      quests: {
        date: 'x',
        bonusClaimed: false,
        items: [{ id: 'gone', base: 0, progress: 0, claimed: false }],
      },
    };
    expect(updateQuestProgress(s)).toBe(s);
    expect(isQuestComplete({ id: 'gone', base: 0, progress: 99, claimed: false })).toBe(false);
    expect(() => getQuestDef('gone')).toThrow();
  });
  it('questStat deckt alle Arten ab', () => {
    const s = { ...fresh(), stats: { ...fresh().stats, events: 2, campaigns: 3, levelsBought: 4 } };
    expect(questStat(s, 'events')).toBe(2);
    expect(questStat(s, 'campaigns')).toBe(3);
    expect(questStat(s, 'levelsBought')).toBe(4);
    for (const q of QUESTS) expect(questStat(s, q.kind)).toBeGreaterThanOrEqual(0);
  });
});

describe('progressionStep', () => {
  it('zieht Quests, zählt Fortschritt, schaltet Achievements frei', () => {
    let s = { ...fresh(), stats: { ...fresh().stats, customersServed: 120 } };
    s = progressionStep(s, Date.UTC(2026, 5, 1, 2, 30), 0);
    expect(s.quests.date).toBe('2026-06-01');
    expect(s.quests.items).toHaveLength(3);
    expect(s.meta.achievements['served1']).toBeDefined();
    expect(s.meta.achievements['nightShift']).toBeDefined();
    expect(progressionStep(s, Date.UTC(2026, 5, 1, 2, 31), 0)).toBe(s);
  });
});

describe('Save v4', () => {
  it('Migration v3 → v4 ergänzt Statistik und Quests', () => {
    const v3 = JSON.parse(serialize(fresh())) as Record<string, unknown>;
    v3['schemaVersion'] = 3;
    delete v3['stats'];
    v3['quests'] = { date: '', items: [] };
    const m = migrate(v3);
    expect(m['schemaVersion']).toBe(SCHEMA_VERSION);
    const back = deserialize(JSON.stringify(m));
    expect(back.stats.customersServed).toBe(0);
    expect(back.quests).toEqual({ date: '', items: [], bonusClaimed: false });
  });
  it('kaputte Zähler und Quests werden gehärtet', () => {
    const raw = JSON.parse(serialize(fresh())) as Record<string, unknown>;
    raw['stats'] = { taps: -5, customersServed: 'x', hypeFills: 3 };
    raw['quests'] = {
      date: 7,
      items: [{ id: 'tap100', base: 2, progress: -1, claimed: true }, 'nope', { id: 3 }],
    };
    const s = deserialize(JSON.stringify(raw));
    expect(s.stats.taps).toBe(0);
    expect(s.stats.customersServed).toBe(0);
    expect(s.stats.hypeFills).toBe(3);
    expect(s.quests).toEqual({
      date: '',
      items: [{ id: 'tap100', base: 2, progress: 0, claimed: true }],
      bonusClaimed: false,
    });
    raw['stats'] = 5;
    raw['quests'] = null;
    const t = deserialize(JSON.stringify(raw));
    expect(t.stats.taps).toBe(0);
    expect(t.quests.items).toEqual([]);
  });
});

describe('Terrasse im Layout (GAME_DESIGN § 5.2)', () => {
  it('erweitert die Fläche 12×12 → 12×14 → 14×14', async () => {
    const { getLayout, layoutExtent } = await import('@data/layouts');
    const l = getLayout('berlin');
    expect(layoutExtent(l, 0)).toEqual({ w: 12, h: 12 });
    expect(layoutExtent(l, 1)).toEqual({ w: 12, h: 14 });
    expect(layoutExtent(l, 2)).toEqual({ w: 14, h: 14 });
    expect(layoutExtent(l, 3)).toEqual({ w: 14, h: 14 });
  });
});
