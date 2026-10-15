import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createLocationState,
  getLocation,
  grantLeaves,
  spendLeaves,
  withLocation,
  SCHEMA_VERSION,
  type GameState,
} from '@core/GameState';
import { tick } from '@core/GameLoop';
import { D } from '@core/math';
import { creditIncome } from '@core/economy';
import {
  buyLeafBoost,
  buySkin,
  buyTimeSkip,
  canCompleteQuestWithLeaves,
  completeQuestWithLeaves,
  equippedSkinTints,
  previewTimeSkip,
  toggleSkin,
} from '@core/leaves';
import { getBoostRemaining } from '@core/events';
import { accrueLeafDrops, expectedLeafDrops, refreshLeafDropDay } from '@core/customers';
import { claimQuest, isQuestComplete, updateQuestProgress } from '@core/progression';
import { NoopProvider, createMonetizationProvider } from '@core/monetization';
import { deserialize, migrate, serialize } from '@core/save';
import { skipCampaignCooldown, startCampaign } from '@core/marketing';
import { BALANCE } from '@data/balance';
import { BOOSTS, LEAF_DROPS, LEAF_PRICES, SKINS, TIME_SKIPS } from '@data/leaves';
import { MONETIZATION_ENABLED } from '@data/monetization';
import { getQuestDef } from '@data/quests';

const LOC = 'berlin';

const make = (leaves = 0): GameState => {
  const s = createInitialState(0);
  const base = getLocation(s, LOC);
  const stations = { ...base.stations };
  for (const id of ['matchaStation', 'register', 'coffeeMachine'])
    stations[id] = { level: 10, unlocked: true };
  const n = withLocation(s, LOC, { ...base, level: 5, stations, satisfaction: 70 });
  return { ...n, meta: { ...n.meta, goldenLeaves: D(leaves) } };
};
const leaves = (s: GameState): number => s.meta.goldenLeaves.toNumber();

describe('Blätter-Buchhaltung', () => {
  it('ausgeben nur bei genug Blättern, nie negativ', () => {
    const s = make(5);
    expect(spendLeaves(s, 6)).toBeNull();
    expect(spendLeaves(s, -1)).toBeNull();
    expect(spendLeaves(s, Number.NaN)).toBeNull();
    expect(leaves(spendLeaves(s, 5) ?? s)).toBe(0);
  });

  it('beliebige Kauf-Folgen lassen den Stand nie unter 0 fallen', () => {
    let s = make(40);
    s = {
      ...s,
      quests: {
        date: 'x',
        bonusClaimed: false,
        items: [
          { id: 'serve500', base: 0, progress: 0, claimed: false },
          { id: 'tap100', base: 0, progress: 0, claimed: false },
          { id: 'buy20', base: 0, progress: 0, claimed: false },
        ],
      },
    };
    const actions = [
      (x: GameState) => buyTimeSkip(x, 'skip1h'),
      (x: GameState) => buyTimeSkip(x, 'skip8h'),
      (x: GameState) => buyLeafBoost(x),
      (x: GameState) => completeQuestWithLeaves(x, 0),
      (x: GameState) => completeQuestWithLeaves(x, 1),
      (x: GameState) => buySkin(x, 'sakuraBar'),
      (x: GameState) => buySkin(x, 'neonCheckout'),
    ];
    let seed = 1;
    for (let i = 0; i < 200; i++) {
      seed = (seed * 16807) % 2147483647;
      const act = actions[seed % actions.length];
      if (act) s = act(s);
      expect(leaves(s)).toBeGreaterThanOrEqual(0);
    }
    expect(leaves(s)).toBeLessThan(5);
  });

  it('gutschreiben zählt in der Statistik mit, 0 oder negativ ändert nichts', () => {
    const s = make();
    expect(grantLeaves(s, 0)).toBe(s);
    expect(grantLeaves(s, -3)).toBe(s);
    const n = grantLeaves(s, 4);
    expect(leaves(n)).toBe(4);
    expect(n.stats.leavesEarned).toBe(4);
  });
});

describe('Zeitsprung (GAME_DESIGN § 10)', () => {
  it('1 h / 4 h / 8 h kosten 5 / 15 / 25 🍃', () => {
    expect(TIME_SKIPS.map((x) => [x.hours, x.cost])).toEqual([
      [1, 5],
      [4, 15],
      [8, 25],
    ]);
  });

  it('bringt das Einkommen zu 100 % an allen Standorten, ohne Boosts', () => {
    let s = make(30);
    s = {
      ...s,
      meta: { ...s.meta, unlockedLocations: [LOC, 'kyoto'] },
      locations: { ...s.locations, kyoto: createLocationState('kyoto') },
    };
    const boosted = buyLeafBoost(s);
    const expected = creditIncome(s, 3600);
    const n = buyTimeSkip(boosted, 'skip1h');
    expect(leaves(n)).toBe(30 - LEAF_PRICES.boost - 5);
    expect(previewTimeSkip(boosted, 'skip1h').toNumber()).toBeCloseTo(expected.earned.toNumber());
    for (const id of [LOC, 'kyoto']) {
      const gain = getLocation(n, id).coins.sub(getLocation(boosted, id).coins).toNumber();
      expect(gain).toBeCloseTo(
        getLocation(expected.state, id).coins.sub(getLocation(s, id).coins).toNumber(),
      );
      expect(gain).toBeGreaterThan(0);
    }
    // 100 % statt Offline-Effizienz, kein Cap, keine Zeit: Spielzeit und Boost-Timer bleiben.
    expect(n.playtimeSec).toBe(boosted.playtimeSec);
    expect(getBoostRemaining(n, 'leaf')).toBe(getBoostRemaining(boosted, 'leaf'));
    expect(n.meta.lifetimeEarned.gt(boosted.meta.lifetimeEarned)).toBe(true);
    expect(getLocation(n, LOC).earnedThisRun.gt(getLocation(boosted, LOC).earnedThisRun)).toBe(
      true,
    );
  });

  it('zu wenig Blätter → nichts passiert', () => {
    const s = make(24);
    expect(buyTimeSkip(s, 'skip8h')).toBe(s);
  });
});

describe('Boost ×2 für Blätter', () => {
  it('kostet 8 🍃, verlängert bei erneutem Kauf', () => {
    const a = buyLeafBoost(make(16));
    expect(leaves(a)).toBe(8);
    expect(getBoostRemaining(a, 'leaf')).toBe(BOOSTS.leaf.durationSec);
    const b = buyLeafBoost(a);
    expect(leaves(b)).toBe(0);
    expect(getBoostRemaining(b, 'leaf')).toBe(2 * BOOSTS.leaf.durationSec);
    expect(buyLeafBoost(b)).toBe(b);
  });
});

describe('Sofort-Fertigstellung Quest (4 🍃)', () => {
  const withQuests = (s: GameState): GameState => ({
    ...s,
    quests: {
      date: '2026-10-14',
      bonusClaimed: false,
      items: [
        { id: 'serve500', base: 0, progress: 0, claimed: false },
        { id: 'satisfaction80', base: 0, progress: 0, claimed: false },
        { id: 'tap100', base: 0, progress: 100, claimed: false },
      ],
    },
  });

  it('Zähler-Quest bleibt nach dem Nachziehen erledigt und ist abholbar', () => {
    const s = withQuests(make(10));
    const n = completeQuestWithLeaves(s, 0);
    expect(leaves(n)).toBe(6);
    const upd = updateQuestProgress(n);
    expect(upd.quests.items[0]?.progress).toBe(getQuestDef('serve500').target);
    const first = upd.quests.items[0];
    expect(first && isQuestComplete(first)).toBe(true);
    const claimed = claimQuest(upd, 0);
    expect(leaves(claimed)).toBe(9);
  });

  it('Zustands-Quest (Zufriedenheit) bleibt ebenfalls erledigt', () => {
    const n = updateQuestProgress(completeQuestWithLeaves(withQuests(make(10)), 1));
    expect(n.quests.items[1]?.progress).toBe(80);
  });

  it('erledigte, abgeholte oder fehlende Quests und zu wenig Blätter → nichts', () => {
    const s = withQuests(make(10));
    expect(canCompleteQuestWithLeaves(s, 2)).toBe(false);
    expect(completeQuestWithLeaves(s, 2)).toBe(s);
    expect(completeQuestWithLeaves(s, 5)).toBe(s);
    const poor = withQuests(make(3));
    expect(completeQuestWithLeaves(poor, 0)).toBe(poor);
  });
});

describe('Kampagnen-Abklingzeit beenden (3 🍃)', () => {
  it('nur mit genug Blättern', () => {
    const base = withLocation(make(2), LOC, { ...getLocation(make(), LOC), coins: D(1e9) });
    let s = startCampaign({ ...base, meta: { ...base.meta, goldenLeaves: D(2) } }, LOC);
    s = { ...s, playtimeSec: BALANCE.marketing.campaignDurationSec + 1 };
    expect(skipCampaignCooldown(s, LOC)).toBe(s);
    const rich = { ...s, meta: { ...s.meta, goldenLeaves: D(3) } };
    expect(leaves(skipCampaignCooldown(rich, LOC))).toBe(0);
  });
});

describe('Skins (kosmetisch)', () => {
  it('kaufen legt an, zweimal kaufen geht nicht, an/aus', () => {
    const s = make(60);
    const a = buySkin(s, 'sakuraBar');
    expect(leaves(a)).toBe(30);
    expect(equippedSkinTints(a)).toEqual({ matchaStation: SKINS[0]?.tint });
    expect(buySkin(a, 'sakuraBar')).toBe(a);
    const off = toggleSkin(a, 'sakuraBar');
    expect(equippedSkinTints(off)).toEqual({});
    expect(toggleSkin(off, 'neonCheckout')).toBe(off);
    expect(buySkin(s, 'unknown')).toBe(s);
    expect(buySkin(make(29), 'neonCheckout').meta.skins.owned).toEqual([]);
  });
  it('ändert keine Einnahmen', () => {
    const s = make(60);
    const a = buySkin(s, 'sakuraBar');
    expect(tick(a, 1000).locations[LOC]?.coins.toNumber()).toBeCloseTo(
      tick({ ...a, meta: s.meta }, 1000).locations[LOC]?.coins.toNumber() ?? 0,
    );
  });
});

describe('Influencer-Drops (GAME_DESIGN § 7.5)', () => {
  it('Erwartungswert = bediente × Influencer-Anteil × 1 %', () => {
    expect(expectedLeafDrops(LOC, 1000)).toBeCloseTo(1000 * 0.1 * LEAF_DROPS.chance);
    // Tokio hat mehr Influencer.
    expect(expectedLeafDrops('tokyo', 1000)).toBeGreaterThan(expectedLeafDrops(LOC, 1000));
  });
  it('Bruchteile sammeln sich, volle Blätter werden gutgeschrieben', () => {
    let s = make();
    s = accrueLeafDrops(s, 0.6);
    expect(leaves(s)).toBe(0);
    s = accrueLeafDrops(s, 0.6);
    expect(leaves(s)).toBe(1);
    expect(s.leafDrops.fraction).toBeCloseTo(0.2);
    expect(accrueLeafDrops(s, 0)).toBe(s);
  });
  it('höchstens 10 am Tag, neuer Tag setzt den Zähler zurück', () => {
    let s = refreshLeafDropDay(make(), '2026-10-14');
    s = accrueLeafDrops(s, 25);
    expect(leaves(s)).toBe(LEAF_DROPS.maxPerDay);
    s = accrueLeafDrops(s, 5);
    expect(leaves(s)).toBe(LEAF_DROPS.maxPerDay);
    expect(refreshLeafDropDay(s, '2026-10-14')).toBe(s);
    // Uhr zurückgestellt: der Deckel bleibt (S9).
    expect(refreshLeafDropDay(s, '2026-10-13')).toBe(s);
    s = refreshLeafDropDay(s, '2026-10-15');
    s = accrueLeafDrops(s, 1);
    expect(leaves(s)).toBe(LEAF_DROPS.maxPerDay + 1);
  });
  it('der Tick sammelt Drops aus bedienten Kunden', () => {
    let s = make();
    for (let i = 0; i < 60; i++) s = tick(s, 60_000);
    const served = s.stats.customersServed;
    expect(served).toBeGreaterThan(0);
    const expected = expectedLeafDrops(LOC, served);
    // Blätter aus Events, die in der Stunde enden, zählen nicht mit: nur der Drop-Zähler.
    const got = s.leafDrops.count + s.leafDrops.fraction;
    expect(got).toBeCloseTo(Math.min(expected, LEAF_DROPS.maxPerDay), 5);
  });
});

describe('MonetizationProvider (No-op)', () => {
  it('Flag aus, Belohnung sofort, keine Käufe', async () => {
    expect(MONETIZATION_ENABLED).toBe(false);
    const p = createMonetizationProvider();
    expect(p).toBeInstanceOf(NoopProvider);
    expect(p.isAvailable()).toBe(true);
    await expect(p.showRewarded('freeBoost')).resolves.toEqual({ rewarded: true });
    await expect(p.purchase('leaves_100')).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('Save v6', () => {
  it('Events, Boosts, Skins, Drops und Gratis-Boost-Timer überleben Speichern/Laden', () => {
    let s = buySkin(make(100), 'sakuraBar');
    s = buyLeafBoost(s);
    s = {
      ...s,
      playtimeSec: 50,
      calendarEvents: ['hanami'],
      activeEvents: [{ id: 'heatwave', locationId: LOC, startedAt: 10, until: 200 }],
      leafDrops: { date: '2026-10-14', count: 3, fraction: 0.4 },
      freeBoostAt: 900,
    };
    const back = deserialize(serialize(s));
    expect(back.activeEvents).toEqual(s.activeEvents);
    expect(back.calendarEvents).toEqual(['hanami']);
    expect(back.boosts).toEqual(s.boosts);
    expect(back.meta.skins).toEqual(s.meta.skins);
    expect(back.leafDrops).toEqual(s.leafDrops);
    expect(back.freeBoostAt).toBe(900);
    expect(back.eventSchedule).toEqual(s.eventSchedule);
  });

  it('Migration v5 → v6: Plan ab jetziger Spielzeit, leere Skins, alte Events verworfen', () => {
    const s = { ...make(), playtimeSec: 5000 };
    const v5 = JSON.parse(serialize(s)) as Record<string, unknown>;
    v5['schemaVersion'] = 5;
    delete v5['calendarEvents'];
    delete v5['eventSchedule'];
    delete v5['freeBoostAt'];
    delete v5['leafDrops'];
    delete (v5['meta'] as Record<string, unknown>)['skins'];
    v5['activeEvents'] = [{ id: 'x', until: 9, spawnMult: 2, incomeMult: 2 }];
    const m = migrate(v5);
    expect(m['schemaVersion']).toBe(SCHEMA_VERSION);
    const back = deserialize(JSON.stringify(m));
    expect(back.activeEvents).toEqual([]);
    expect(back.calendarEvents).toEqual([]);
    expect(back.meta.skins).toEqual({ owned: [], equipped: [] });
    expect(back.eventSchedule.count).toBe(0);
    expect(back.eventSchedule.nextAt).toBeGreaterThanOrEqual(5000 + 20 * 60);
    expect(back.freeBoostAt).toBe(5000 + 20 * 60);
    expect(back.leafDrops).toEqual({ date: '', count: 0, fraction: 0 });
  });

  it('Härtung: unbekannte Events/Skins, kaputte Boosts und Drops', () => {
    const raw = JSON.parse(serialize(make())) as Record<string, unknown>;
    raw['activeEvents'] = [
      { id: 'heatwave', locationId: 'nowhere', startedAt: 0, until: 10 },
      { id: 'meteor', locationId: LOC, startedAt: 0, until: 10 },
      { id: 'heatwave', locationId: LOC, until: 'soon' },
      { id: 'rainyDay', locationId: LOC, until: 10 },
    ];
    raw['calendarEvents'] = ['hanami', 'christmas', 3];
    raw['boosts'] = [
      { id: 'leaf', until: 10, incomeMult: 1e9, spawnMult: -5 },
      { id: 'broken' },
      'x',
    ];
    raw['leafDrops'] = { date: 5, count: 99, fraction: 7 };
    raw['eventSchedule'] = { seed: 'a', count: -3 };
    (raw['meta'] as Record<string, unknown>)['skins'] = {
      owned: ['sakuraBar', 'goldBar', 'sakuraBar'],
      equipped: ['neonCheckout', 'sakuraBar'],
    };
    const s = deserialize(JSON.stringify(raw));
    expect(s.activeEvents).toEqual([{ id: 'rainyDay', locationId: LOC, startedAt: 10, until: 10 }]);
    expect(s.calendarEvents).toEqual(['hanami']);
    expect(s.boosts).toEqual([
      { id: 'leaf', until: 10, incomeMult: 12, spawnMult: 1, speedMult: 1 },
    ]);
    expect(s.leafDrops).toEqual({ date: '', count: LEAF_DROPS.maxPerDay, fraction: 1 });
    expect(s.eventSchedule.count).toBe(0);
    expect(Number.isFinite(s.eventSchedule.seed)).toBe(true);
    expect(s.meta.skins).toEqual({ owned: ['sakuraBar'], equipped: ['sakuraBar'] });
  });
});
