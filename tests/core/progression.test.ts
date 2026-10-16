import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createLocationState,
  createStats,
  getLocation,
  withLocation,
  SCHEMA_VERSION,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { D } from '@core/math';
import { tick } from '@core/GameLoop';
import {
  applyOffline,
  buyStation,
  cafeLevelFromSum,
  cafeLevelThreshold,
  computeCafeLevel,
  getBulkCost,
  getItemPrice,
  isStationUnlocked,
  needsTerrace,
} from '@core/economy';
import { computeLocationRates, peakIncomePerHour, tapCafe } from '@core/customers';
import { postVideo } from '@core/social';
import { orderMatcha } from '@core/supply';
import { dayOf } from '@core/time';
import { franchiseReset } from '@core/prestige';
import {
  achievementProgress,
  achievementValue,
  canUnlockLocation,
  checkAchievements,
  claimQuest,
  countUnlockedAchievements,
  getCafeLevelReward,
  getLocationRequirement,
  getNextLockedLocation,
  isLocationUnlocked,
  isQuestComplete,
  localDateKey,
  localHour,
  pickDailyQuests,
  progressionStep,
  questStat,
  refreshQuests,
  switchLocation,
  unlockLocation,
  updateQuestProgress,
} from '@core/progression';
import { deserialize, migrate, migrations, serialize } from '@core/save';
import {
  ACHIEVEMENTS,
  HIGH_SATISFACTION,
  getAchievementDef,
  type AchievementKind,
} from '@data/achievements';
import { AMBIENCE, getAmbienceDef } from '@data/ambience';
import { BALANCE } from '@data/balance';
import { LOCATIONS, getLocationDef } from '@data/locations';
import { MATCHA_GRADES, MAX_GRADE } from '@data/matcha';
import { PRESTIGE, getMetaUpgradeDef } from '@data/prestige';
import { QUESTS, QUEST_CONFIG, getQuestDef } from '@data/quests';
import { VIDEO_FORMATS } from '@data/social';
import { STAFF_ROLES, foundingStaff, getStaffDef } from '@data/staff';
import { STATIONS, getStationDef } from '@data/stations';
import { TIME } from '@data/time';
import {
  CAFE_LEVEL_REWARD,
  TERRACE_REQUIREMENT,
  cafeLevelLeaves,
  getNextUnlockLevel,
  getUnlocksAt,
} from '@data/unlocks';

const L = 'berlin';
const fresh = (): GameState => createInitialState(0);
const patch = (s: GameState, p: Partial<LocationState>, id = L): GameState =>
  withLocation(s, id, { ...getLocation(s, id), ...p });
const loc = (s: GameState, id = L): LocationState => getLocation(s, id);
const ctx = (now = 0, localHourValue = 12) => ({ now, localHour: localHourValue });
/** Geräte-Level setzen; das Café-Level folgt wie beim Kauf aus der Summe. */
const withStations = (s: GameState, levels: Record<string, number>, id = L): GameState => {
  const stations = { ...loc(s, id).stations };
  for (const [sid, level] of Object.entries(levels)) stations[sid] = { level, unlocked: true };
  const next = { ...loc(s, id), stations };
  return withLocation(s, id, { ...next, level: computeCafeLevel(next) });
};
/** Spieluhr auf eine volle Stunde des aktuellen Spieltags stellen (Stunden schon abgerechnet). */
const atHour = (s: GameState, hour: number): GameState => {
  const day = dayOf(s.clock);
  return { ...s, clock: day * TIME.minutesPerDay + hour * 60, hourMark: day * 24 + hour };
};
const withZen = (s: GameState, zen: number): GameState => ({
  ...s,
  meta: { ...s.meta, zen: D(zen) },
});
const kyoto = () => {
  const u = getLocationDef('kyoto').unlock;
  if (!u) throw new Error('Kyoto ohne Freischaltung');
  return u;
};
/** Berlin mit allem, was Kyoto braucht: Bestwert, Zen und Geld für die Eröffnung. */
const readyForKyoto = (): GameState => {
  const u = kyoto();
  return withZen(patch(fresh(), { bestLevel: u.cafeLevel, coins: D(u.cost * 2) }), u.zen);
};

describe('Freischalt-Tabelle und Café-Level (GAME_DESIGN § 5.3)', () => {
  it('sammelt Geräte, Ambiente, Personal, Matcha-Sorten und Video-Formate je Level', () => {
    const has = (level: number, key: string): boolean =>
      getUnlocksAt(level).some((u) => `${u.kind}:${u.id}` === key);
    for (const d of STATIONS) expect(has(d.unlockCafeLevel, `station:${d.id}`), d.id).toBe(true);
    for (const a of AMBIENCE) expect(has(a.unlockCafeLevel, `ambience:${a.id}`), a.id).toBe(true);
    for (const r of STAFF_ROLES) expect(has(r.unlockCafeLevel, `staff:${r.id}`), r.id).toBe(true);
    // Die Kochqualität (Sorte 0) gibt es von Anfang an, sie wird nicht „freigeschaltet“.
    for (const g of MATCHA_GRADES.slice(1))
      expect(has(g.unlockCafeLevel, `grade:${String(g.grade)}`)).toBe(true);
    expect(getUnlocksAt(MATCHA_GRADES[0]?.unlockCafeLevel ?? 1).map((u) => u.kind)).not.toContain(
      'grade',
    );
    for (const f of VIDEO_FORMATS) expect(has(f.unlockCafeLevel, `video:${f.id}`), f.id).toBe(true);
    expect(getUnlocksAt(999)).toEqual([]);
  });
  it('jedes Café-Level 2–12 schaltet etwas frei; nichts liegt über der Höchststufe', () => {
    for (let l = 2; l <= 12; l++) {
      if (l === 11) continue; // Lücke im Design (§ 4/§ 6): nichts für Level 11 vorgesehen.
      expect(getUnlocksAt(l).length, `Level ${String(l)}`).toBeGreaterThan(0);
    }
    expect(getNextUnlockLevel(1)).toBe(2);
    expect(getNextUnlockLevel(BALANCE.cafeLevel.max)).toBeNull();
    for (let l = BALANCE.cafeLevel.max + 1; l <= BALANCE.cafeLevel.max + 10; l++)
      expect(getUnlocksAt(l)).toEqual([]);
  });
  it('Café-Level folgt der Summe der Geräte-Level und endet bei der Höchststufe', () => {
    const max = BALANCE.cafeLevel.max;
    expect(cafeLevelFromSum(0)).toBe(1);
    for (let l = 2; l <= max; l++) {
      expect(cafeLevelFromSum(cafeLevelThreshold(l) - 1)).toBe(l - 1);
      expect(cafeLevelFromSum(cafeLevelThreshold(l))).toBe(l);
    }
    expect(cafeLevelFromSum(1e9)).toBe(max);
    expect(computeCafeLevel(loc(fresh()))).toBe(1);
  });
  it('die Höchststufe ist mit allen Geräten auf ihrem Höchstlevel erreichbar', () => {
    // Sonst bleiben Café-Level-Erfolge und Freischaltungen ganz oben für immer zu.
    const allMaxed = STATIONS.reduce((a, d) => a + d.maxLevel, 0);
    expect(cafeLevelFromSum(allMaxed)).toBe(BALANCE.cafeLevel.max);
  });
  it('Blätter-Belohnung erst ab Level 3, dann 1–3', () => {
    const r = CAFE_LEVEL_REWARD;
    expect(cafeLevelLeaves(r.leavesFromLevel - 1)).toBe(0);
    expect(cafeLevelLeaves(r.leavesFromLevel)).toBe(1);
    expect(cafeLevelLeaves(r.leavesFromLevel + r.leavesStep - 1)).toBe(1);
    expect(cafeLevelLeaves(r.leavesFromLevel + r.leavesStep)).toBe(2);
    expect(cafeLevelLeaves(BALANCE.cafeLevel.max)).toBe(r.leavesMax);
    expect(cafeLevelLeaves(999)).toBe(r.leavesMax);
  });
  it('Level-Aufstieg gibt Spielstunden-Umsatz zur Hauptzeit und Blätter, genau einmal', () => {
    const up = CAFE_LEVEL_REWARD.leavesFromLevel;
    const before = withStations(patch(fresh(), { coins: D(10_000) }), {
      matchaStation: cafeLevelThreshold(up) - 1,
    });
    expect(loc(before).level).toBe(up - 1);
    const cost = getBulkCost(before, L, 'matchaStation', 1).toNumber();
    const after = buyStation(before, L, 'matchaStation', 1);
    expect(loc(after).level).toBe(up);
    expect(loc(after).bestLevel).toBe(up);
    // Belohnung aus dem Umsatz des Cafés mit dem neuen Gerät zur Hauptzeit – auch vor der ersten Öffnung.
    const bought = withStations(before, { matchaStation: cafeLevelThreshold(up) });
    const reward = peakIncomePerHour(bought, L).mul(CAFE_LEVEL_REWARD.incomeHours).toNumber();
    expect(reward).toBeGreaterThan(0);
    expect(loc(after).coins.toNumber()).toBeCloseTo(10_000 - cost + reward, 6);
    expect(loc(after).earnedThisRun.toNumber()).toBeCloseTo(reward, 6);
    expect(after.meta.lifetimeEarned.toNumber()).toBeCloseTo(reward, 6);
    expect(after.meta.goldenLeaves.toNumber()).toBe(cafeLevelLeaves(up));
    expect(after.stats.levelsBought).toBe(1);
    // Ein weiterer Kauf ohne Level-Aufstieg gibt nichts extra.
    const again = buyStation(after, L, 'matchaStation', 1);
    expect(loc(again).level).toBe(up);
    expect(again.meta.lifetimeEarned.eq(after.meta.lifetimeEarned)).toBe(true);
    expect(again.meta.goldenLeaves.eq(after.meta.goldenLeaves)).toBe(true);
  });
  it('mehrere Level auf einmal: Blätter für jedes Level ab 3, aber nur über dem Bestwert', () => {
    const s = fresh();
    const r = CAFE_LEVEL_REWARD;
    const from = r.leavesFromLevel - 1;
    const to = r.leavesFromLevel + r.leavesStep;
    // leavesStep Level mit je einem Blatt, dann das erste mit zweien
    expect(getCafeLevelReward(s, L, from, to).leaves).toBe(r.leavesStep + 2);
    expect(getCafeLevelReward(s, L, from, to, to - 1).leaves).toBe(2);
    expect(getCafeLevelReward(s, L, from, to, to).leaves).toBe(0);
    const peak = peakIncomePerHour(s, L).toNumber();
    expect(getCafeLevelReward(s, L, from, to, to).coins.toNumber()).toBeCloseTo(
      peak * r.incomeHours * (to - from),
      6,
    );
    expect(getCafeLevelReward(s, L, 5, 5).coins.toNumber()).toBe(0);
    expect(getCafeLevelReward(s, L, 5, 5).leaves).toBe(0);
  });
  it('Geräte ab Café-Level 9 brauchen Terrasse Stufe 1', () => {
    const t = TERRACE_REQUIREMENT;
    const outside = STATIONS.find((d) => d.unlockCafeLevel >= t.fromCafeLevel);
    const inside = STATIONS.find(
      (d) => d.unlockCafeLevel > 1 && d.unlockCafeLevel < t.fromCafeLevel,
    );
    if (!outside || !inside) throw new Error('Geräte fehlen');
    let s = patch(fresh(), { level: outside.unlockCafeLevel });
    expect(needsTerrace(s, L, outside.id)).toBe(true);
    expect(needsTerrace(s, L, inside.id)).toBe(false);
    expect(isStationUnlocked(s, L, outside.id)).toBe(false);
    expect(isStationUnlocked(s, L, inside.id)).toBe(true);
    s = patch(s, { ambience: { ...loc(s).ambience, [t.ambienceId]: t.minLevel } });
    expect(isStationUnlocked(s, L, outside.id)).toBe(true);
  });
});

describe('Statistik-Zähler', () => {
  it('Tick zählt bediente Gäste, solange geöffnet ist; nachts kommt niemand', () => {
    const s = atHour(fresh(), 10);
    const served = computeLocationRates(s, L).served;
    expect(served).toBeGreaterThan(0);
    // 10 echte Sekunden bei geöffnetem Café (1 Spielstunde = 1 Minute), noch in derselben Stunde
    const t = tick(s, 10_000);
    expect(t.stats.customersServed).toBeCloseTo((served * 10 * TIME.openMinutesPerSec) / 60, 6);
    expect(tick(atHour(fresh(), 2), 10_000).stats.customersServed).toBe(0);
  });
  it('Zufriedenheit 90+ am Stück zählt echte Sekunden, ein Einbruch setzt zurück', () => {
    const zen = getMetaUpgradeDef('satisfactionBase').maxLevel;
    let s = patch(atHour(fresh(), 10), {
      satisfaction: 95,
      cleanliness: BALANCE.cleanliness.max,
      ambience: { ...loc(fresh()).ambience, decor: getAmbienceDef('decor').maxLevel },
    });
    s = { ...s, meta: { ...s.meta, metaUpgrades: { satisfactionBase: zen } } };
    // Das Café hält die 90+ von selbst (Ziel-Zufriedenheit darüber).
    expect(computeLocationRates(s, L).satisfaction.target).toBeGreaterThanOrEqual(
      HIGH_SATISFACTION.threshold,
    );
    for (let i = 0; i < 10; i++) s = tick(s, 1000);
    expect(s.stats.highSatisfactionSec).toBeCloseTo(10);
    s = tick(patch(s, { satisfaction: 20 }), 1000);
    expect(s.stats.highSatisfactionSec).toBe(0);
    expect(s.stats.highSatisfactionBestSec).toBeCloseTo(10);
  });
  it('Taps, Hype-Füllungen, Videos, Matcha-Bestellungen und Offline-Gäste', () => {
    let s = fresh();
    for (let i = 0; i < BALANCE.tap.hypeMax; i++) {
      s = tapCafe({ ...s, playtimeSec: i }, L).state;
    }
    expect(s.stats.taps).toBe(BALANCE.tap.hypeMax);
    expect(s.stats.hypeFills).toBe(1);
    s = postVideo(s, L, 'latteArt');
    expect(s.stats.videos).toBe(1);
    s = orderMatcha(s, L, 0, 0);
    expect(s.stats.matchaOrders).toBe(1);
    const off = applyOffline(fresh(), 3_600_000).state;
    expect(off.stats.customersServed).toBeGreaterThan(0);
  });
});

describe('Achievements (GAME_DESIGN § 13.1)', () => {
  it('rund 45 Stück, eindeutige IDs, Belohnung 2–25, zwei geheime', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.reward).toBeGreaterThanOrEqual(2);
      expect(a.reward).toBeLessThanOrEqual(25);
    }
    expect(ACHIEVEMENTS.filter((a) => a.secret).map((a) => a.id)).toEqual([
      'nightShift',
      'spotless',
    ]);
    expect(() => getAchievementDef('nope')).toThrow();
  });
  it('Ziele liegen im Spiel: Café-Level, Geräte-Level, Matcha-Sorte, Standorte', () => {
    const limit: Partial<Record<AchievementKind, number>> = {
      cafeLevel: BALANCE.cafeLevel.max,
      stationLevel: Math.max(...STATIONS.map((d) => d.maxLevel)),
      quality: MAX_GRADE,
      locations: LOCATIONS.length,
    };
    for (const a of ACHIEVEMENTS) {
      const max = limit[a.kind];
      if (max !== undefined) expect(a.target, a.id).toBeLessThanOrEqual(max);
    }
  });
  it('löst aus, schreibt Blätter gut – und nur einmal', () => {
    const def = getAchievementDef('served1');
    const s = { ...fresh(), stats: { ...fresh().stats, customersServed: def.target + 50 } };
    const r = checkAchievements(s, ctx(1234));
    expect(r.unlocked).toEqual(['served1']);
    expect(r.state.meta.achievements['served1']?.unlockedAt).toBe(1234);
    expect(r.state.meta.goldenLeaves.toNumber()).toBe(def.reward);
    expect(r.state.stats.leavesEarned).toBe(def.reward);
    const again = checkAchievements(r.state, ctx(5000));
    expect(again.unlocked).toEqual([]);
    expect(again.state).toBe(r.state);
    expect(countUnlockedAchievements(again.state)).toBe(1);
  });
  it('jede Art misst den richtigen Wert', () => {
    let s = fresh();
    s = patch(s, {
      level: 5,
      cleanliness: 100,
      staff: { ...foundingStaff(), manager: getStaffDef('manager').maxLevel },
      stations: Object.fromEntries(
        STATIONS.map((d) => [d.id, { level: d.maxLevel, unlocked: true }]),
      ),
      supply: { ...loc(s).supply, bestGrade: 2 },
      social: { ...loc(s).social, followers: 12_000 },
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
        videos: 3,
        questsCompleted: 10,
        highSatisfactionBestSec: 700,
      },
    };
    const v = (id: string, c = ctx()) => achievementValue(s, getAchievementDef(id), c);
    expect(v('earned1')).toBe(2e6);
    expect(v('stationLevel1')).toBe(Math.max(...STATIONS.map((d) => d.maxLevel)));
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
    expect(v('videos1')).toBe(3);
    expect(v('quests1')).toBe(10);
    expect(v('followers1')).toBe(12_000);
    expect(v('spotless')).toBe(1);
    expect(v('nightShift', ctx(0, 3))).toBe(1);
    expect(v('nightShift', ctx(0, 4))).toBe(0);
    expect(achievementValue(s, getAchievementDef('nightShift'))).toBe(0);
    expect(achievementProgress(s, getAchievementDef('served1'))).toBe(0);
    expect(achievementProgress(s, getAchievementDef('taps2'))).toBeCloseTo(
      120 / getAchievementDef('taps2').target,
    );
    const unlocked = checkAchievements(s, ctx(1, 3)).state;
    expect(achievementProgress(unlocked, getAchievementDef('nightShift'))).toBe(1);
  });
  it('Matcha-Sorte zählt die beste je bestellte Sorte', () => {
    const grade = MATCHA_GRADES.find((g) => g.grade === 2);
    if (!grade) throw new Error('Sorte 2 fehlt');
    let s = patch(fresh(), { level: grade.unlockCafeLevel });
    s = orderMatcha(s, L, grade.grade, 0);
    expect(s.stats.matchaOrders).toBe(1);
    expect(achievementValue(s, getAchievementDef('quality1'))).toBe(grade.grade);
    // Eine schlechtere Sorte danach ändert den Bestwert nicht.
    s = orderMatcha(s, L, 0, 0);
    expect(achievementValue(s, getAchievementDef('quality1'))).toBe(grade.grade);
  });
  it('„Alle Stationen“ fehlt, solange eine Station Level 0 hat', () => {
    const s = fresh();
    expect(achievementValue(s, getAchievementDef('allStations'))).toBe(0);
    expect(achievementValue(s, getAchievementDef('spotless'))).toBe(0);
  });
  it('Erfolge aus Phase 2 (Kampagnen, Marketing) bleiben im Save, zählen aber nicht mehr', () => {
    const s: GameState = {
      ...fresh(),
      meta: {
        ...fresh().meta,
        achievements: { campaigns1: { unlockedAt: 1 }, marketingMax: { unlockedAt: 2 } },
      },
    };
    expect(countUnlockedAchievements(s)).toBe(0);
    expect(checkAchievements(s, ctx()).state).toBe(s);
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
    expect(new Set(a.map((q) => q.id)).size).toBe(QUEST_CONFIG.perDay);
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
    // Events (S7), Videos und Matcha-Einkauf (Phase 3) sind im Pool und werden an manchen Tagen gezogen.
    const drawn = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      for (const q of pickDailyQuests(`2026-04-${String(d)}`)) drawn.add(q.id);
    }
    expect([...drawn]).toEqual(expect.arrayContaining(['event1', 'video2', 'order1']));
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
    let s: GameState = { ...fresh(), stats: { ...fresh().stats, customersServed: 1000, taps: 50 } };
    s = patch(s, { satisfaction: 50 });
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
  it('Abholen: Blätter je Quest, bei der letzten der Bonus, nichts doppelt', () => {
    const { rewardEach, bonusAll } = QUEST_CONFIG;
    const buy = getQuestDef('buy20').target;
    let s: GameState = {
      ...fresh(),
      quests: {
        date: 'x',
        bonusClaimed: false,
        items: [
          { id: 'serve500', base: 0, progress: getQuestDef('serve500').target, claimed: false },
          { id: 'tap100', base: 0, progress: getQuestDef('tap100').target, claimed: false },
          { id: 'buy20', base: 0, progress: 3, claimed: false },
        ],
      },
    };
    expect(isQuestComplete({ id: 'buy20', base: 0, progress: 3, claimed: false })).toBe(false);
    expect(claimQuest(s, 2)).toBe(s);
    expect(claimQuest(s, 9)).toBe(s);
    s = claimQuest(s, 0);
    expect(s.meta.goldenLeaves.toNumber()).toBe(rewardEach);
    expect(claimQuest(s, 0)).toBe(s);
    s = claimQuest(s, 1);
    s = { ...s, stats: { ...s.stats, levelsBought: buy } };
    s = updateQuestProgress(s);
    s = claimQuest(s, 2);
    expect(s.meta.goldenLeaves.toNumber()).toBe(3 * rewardEach + bonusAll);
    expect(s.quests.bonusClaimed).toBe(true);
    expect(s.stats.questsCompleted).toBe(3);
  });
  it('unbekannte Quest-IDs (alter Save, z. B. Kampagne aus Phase 2) werden ignoriert', () => {
    const s: GameState = {
      ...fresh(),
      quests: {
        date: 'x',
        bonusClaimed: false,
        items: [{ id: 'campaign1', base: 0, progress: 0, claimed: false }],
      },
    };
    expect(updateQuestProgress(s)).toBe(s);
    expect(isQuestComplete({ id: 'campaign1', base: 0, progress: 99, claimed: false })).toBe(false);
    expect(claimQuest(s, 0)).toBe(s);
    expect(() => getQuestDef('campaign1')).toThrow();
  });
  it('questStat deckt alle Arten ab', () => {
    let s: GameState = {
      ...fresh(),
      stats: { ...fresh().stats, events: 2, videos: 3, matchaOrders: 5, levelsBought: 4 },
    };
    s = patch(s, { satisfaction: 66.6 });
    expect(questStat(s, 'events')).toBe(2);
    expect(questStat(s, 'videos')).toBe(3);
    expect(questStat(s, 'matchaOrders')).toBe(5);
    expect(questStat(s, 'levelsBought')).toBe(4);
    expect(questStat(s, 'satisfaction')).toBe(67);
    for (const q of QUESTS) expect(questStat(s, q.kind)).toBeGreaterThanOrEqual(0);
  });
});

describe('progressionStep', () => {
  it('zieht Quests, zählt Fortschritt, schaltet Achievements frei', () => {
    let s = { ...fresh(), stats: { ...fresh().stats, customersServed: 120 } };
    s = progressionStep(s, Date.UTC(2026, 5, 1, 2, 30), 0);
    expect(s.quests.date).toBe('2026-06-01');
    expect(s.quests.items).toHaveLength(QUEST_CONFIG.perDay);
    expect(s.meta.achievements['served1']).toBeDefined();
    expect(s.meta.achievements['nightShift']).toBeDefined();
    expect(progressionStep(s, Date.UTC(2026, 5, 1, 2, 31), 0)).toBe(s);
  });
});

describe('Standorte: Freischalt-Kette und Eröffnung (GAME_DESIGN § 3)', () => {
  it('Kette Berlin → Kyoto → Tokio …; Zen und Eröffnungskosten steigen, Café-Level ist erreichbar', () => {
    const chain = LOCATIONS.map((l) => l.unlock?.prevLocationId ?? null);
    expect(chain).toEqual([null, 'berlin', 'kyoto', 'tokyo', 'seoul', 'newyork']);
    const unlocks = LOCATIONS.flatMap((l) => (l.unlock ? [l.unlock] : []));
    unlocks.forEach((u, i) => {
      expect(u.cafeLevel).toBeLessThanOrEqual(BALANCE.cafeLevel.max);
      const prev = unlocks[i - 1];
      if (!prev) return;
      expect(u.zen).toBeGreaterThan(prev.zen);
      expect(u.cost).toBeGreaterThan(prev.cost);
    });
    // Eine Filiale kostet mehr als das Startkapital eines Cafés: sie will erwirtschaftet werden.
    for (const l of LOCATIONS) {
      if (l.unlock) expect(l.unlock.cost).toBeGreaterThan(BALANCE.startCoins);
    }
  });
  it('Kyoto braucht Berlins Café-Level-Bestwert und das Geld für die Eröffnung, aber kein Zen', () => {
    const u = kyoto();
    // Zen gibt es nur für einen Reset, und der leerte Berlins Kasse, aus der Kyoto bezahlt wird.
    expect(u.zen).toBe(0);
    let s = patch(fresh(), { coins: D(u.cost) });
    expect(getLocationRequirement(s, L)).toBeNull();
    expect(canUnlockLocation(s, 'kyoto')).toBe(false);
    s = patch(s, { bestLevel: u.cafeLevel });
    expect(getLocationRequirement(s, 'kyoto')).toMatchObject({
      prevLocationId: L,
      cafeLevel: u.cafeLevel,
      prevBestLevel: u.cafeLevel,
      levelOk: true,
      zenOk: true,
      moneyOk: true,
    });
    expect(canUnlockLocation(s, 'kyoto')).toBe(true);
    // Die Investition kommt aus der Kasse des Vorgängers.
    const poor = patch(s, { coins: D(u.cost - 1) });
    expect(getLocationRequirement(poor, 'kyoto')).toMatchObject({ zenOk: true, moneyOk: false });
    expect(unlockLocation(poor, 'kyoto')).toBe(poor);
    // Tokio braucht Kyoto, nicht Berlin.
    expect(canUnlockLocation(withZen(patch(s, { coins: D(1e12) }), 1e6), 'tokyo')).toBe(false);
    const day3 = { ...s, clock: 3 * TIME.minutesPerDay + 10 * 60, hourMark: 3 * 24 + 10 };
    const r = unlockLocation(day3, 'kyoto');
    expect(r.meta.zen.eq(day3.meta.zen)).toBe(true);
    expect(loc(r).coins.toNumber()).toBe(0);
    expect(r.meta.unlockedLocations).toEqual(['berlin', 'kyoto']);
    expect(isLocationUnlocked(r, 'kyoto')).toBe(true);
    expect(canUnlockLocation(withZen(patch(r, { coins: D(1e9) }), 1e6), 'kyoto')).toBe(false);
    // Die neue Filiale startet frisch (Startkapital × Preisniveau, Tagesbilanz ab heute); aktiv bleibt Berlin.
    expect(loc(r, 'kyoto')).toEqual(createLocationState('kyoto', 3));
    expect(loc(r, 'kyoto').coins.toNumber()).toBeCloseTo(
      BALANCE.startCoins * getLocationDef('kyoto').scale,
      6,
    );
    expect(r.activeLocationId).toBe(L);
    expect(getNextLockedLocation(r)).toBe('tokyo');
    expect(achievementValue(r, getAchievementDef('locations1'))).toBe(2);
  });
  it('ab Tokio kostet eine Filiale Zen – aus dem Reset der anderen Cafés, während der Vorgänger spart', () => {
    const t = getLocationDef('tokyo').unlock;
    if (!t) throw new Error('Tokio ohne Freischaltung');
    expect(t.zen).toBeGreaterThan(0);
    let s = unlockLocation(readyForKyoto(), 'kyoto');
    s = patch(s, { bestLevel: t.cafeLevel, coins: D(t.cost) }, 'kyoto');
    s = withZen(s, t.zen - 1);
    expect(getLocationRequirement(s, 'tokyo')).toMatchObject({
      prevLocationId: 'kyoto',
      levelOk: true,
      zenOk: false,
      moneyOk: true,
    });
    expect(unlockLocation(s, 'tokyo')).toBe(s);
    // Berlin zurücksetzen bringt das Zen; Kyotos Kasse bleibt dabei unberührt.
    const earned = PRESTIGE.zen.divisor * ((t.zen + 1) / PRESTIGE.zen.factor) ** 2;
    const reset = franchiseReset(
      patch(s, { level: PRESTIGE.resetMinCafeLevel, earnedThisRun: D(earned) }),
      L,
    );
    expect(loc(reset, 'kyoto').coins.eq(loc(s, 'kyoto').coins)).toBe(true);
    expect(canUnlockLocation(reset, 'tokyo')).toBe(true);
    const r = unlockLocation(reset, 'tokyo');
    expect(r.meta.zen.toNumber()).toBeCloseTo(reset.meta.zen.toNumber() - t.zen, 9);
    expect(loc(r, 'kyoto').coins.toNumber()).toBe(0);
    expect(isLocationUnlocked(r, 'tokyo')).toBe(true);
  });
  it('Bestwert zählt auch nach einem Reset – das Geld muss der neue Lauf verdienen', () => {
    const u = kyoto();
    // so viel Umsatz, dass der Reset das Zen für Kyoto bringt
    const earned = PRESTIGE.zen.divisor * ((u.zen + 1) / PRESTIGE.zen.factor) ** 2;
    const level = Math.max(u.cafeLevel, PRESTIGE.resetMinCafeLevel);
    const s = franchiseReset(patch(fresh(), { level, earnedThisRun: D(earned) }), L);
    expect(loc(s).level).toBe(1);
    expect(s.meta.zen.toNumber()).toBeGreaterThanOrEqual(u.zen);
    expect(getLocationRequirement(s, 'kyoto')).toMatchObject({
      levelOk: true,
      zenOk: true,
      moneyOk: false,
    });
    expect(canUnlockLocation(s, 'kyoto')).toBe(false);
    expect(canUnlockLocation(patch(s, { coins: D(u.cost) }), 'kyoto')).toBe(true);
  });
  it('Wechseln nur zu freigeschalteten Standorten', () => {
    const s = readyForKyoto();
    expect(switchLocation(s, 'kyoto')).toBe(s);
    expect(switchLocation(s, L)).toBe(s);
    const u = unlockLocation(s, 'kyoto');
    expect(switchLocation(u, 'kyoto').activeLocationId).toBe('kyoto');
  });
  it('alle Standorte arbeiten parallel – online und offline', () => {
    const s = atHour(switchLocation(unlockLocation(readyForKyoto(), 'kyoto'), 'kyoto'), 10);
    expect(s.activeLocationId).toBe('kyoto');
    const t = tick(s, 30_000);
    for (const id of [L, 'kyoto']) {
      expect(loc(t, id).ledger.today.guests, id).toBeGreaterThan(0);
      expect(loc(t, id).earnedThisRun.gt(loc(s, id).earnedThisRun), id).toBe(true);
    }
    const o = applyOffline(s, 3_600_000);
    for (const id of [L, 'kyoto']) {
      expect(loc(o.state, id).earnedThisRun.gt(loc(s, id).earnedThisRun), id).toBe(true);
    }
    const sum = loc(o.state, L)
      .coins.sub(loc(s, L).coins)
      .add(loc(o.state, 'kyoto').coins.sub(loc(s, 'kyoto').coins));
    expect(sum.toNumber()).toBeCloseTo(o.earned.toNumber(), 6);
  });
  it('Geräte am neuen Standort kosten und verdienen mit dessen Preisniveau', () => {
    const s = unlockLocation(readyForKyoto(), 'kyoto');
    const scale = getLocationDef('kyoto').scale;
    expect(getBulkCost(s, 'kyoto', 'matchaStation', 1).toNumber()).toBeCloseTo(
      getBulkCost(s, L, 'matchaStation', 1).toNumber() * scale,
      6,
    );
    const bar = getStationDef('matchaStation');
    expect(getItemPrice(bar, 1, 'kyoto').toNumber()).toBeCloseTo(
      getItemPrice(bar, 1, L).toNumber() * scale,
      6,
    );
  });
});

describe('Save v4', () => {
  const v3 = (): Record<string, unknown> => {
    const raw = JSON.parse(serialize(fresh())) as Record<string, unknown>;
    raw['schemaVersion'] = 3;
    delete raw['stats'];
    raw['quests'] = { date: '', items: [] };
    return raw;
  };
  it('Migration v3 → v4 ergänzt Statistik und Quests', () => {
    const step = migrations[3];
    if (!step) throw new Error('Migration v3 → v4 fehlt');
    const m = step(v3());
    expect(m['schemaVersion']).toBe(4);
    expect(m['stats']).toEqual(createStats());
    expect(m['quests']).toEqual({ date: '', items: [], bonusClaimed: false });
    // … und bis zur aktuellen Version durchgereicht
    expect(migrate(v3())['schemaVersion']).toBe(SCHEMA_VERSION);
    const back = deserialize(JSON.stringify(v3()));
    expect(back.stats).toEqual(createStats());
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
  it('erweitert die Fläche 12×14 (Wintergarten) → 14×14', async () => {
    const { getLayout, layoutExtent } = await import('@data/layouts');
    const l = getLayout('berlin');
    // Der Wintergarten vorn links gehört immer zum Raum (L-Grundriss), die Terrasse kommt dazu.
    expect(layoutExtent(l, 0)).toEqual({ w: 12, h: 14 });
    expect(layoutExtent(l, 1)).toEqual({ w: 12, h: 14 });
    expect(layoutExtent(l, 2)).toEqual({ w: 14, h: 14 });
    expect(layoutExtent(l, 3)).toEqual({ w: 14, h: 14 });
  });
});
