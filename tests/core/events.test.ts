import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  getLocation,
  withLocation,
  createLocationState,
  type ActiveEvent,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { tick } from '@core/GameLoop';
import { D } from '@core/math';
import { computeLocationRates } from '@core/customers';
import { applyOffline, collectModifiers } from '@core/economy';
import {
  addBoost,
  advanceEventsOffline,
  calendarEventsAt,
  claimFreeBoost,
  drawEvent,
  getBoostRemaining,
  getEventOverlay,
  getEventResolveCost,
  getFreeBoostWait,
  isFreeBoostReady,
  refreshCalendarEvents,
  resolveEvent,
  settleEvents,
  startNextEvent,
  stepEvents,
} from '@core/events';
import { progressionStep } from '@core/progression';
import { EVENT_CONFIG, RANDOM_EVENTS, getRandomEventDef } from '@data/events';
import { BOOSTS, BOOST_RULES } from '@data/leaves';
import { FREE_BOOST } from '@data/monetization';

const LOC = 'berlin';

/** Café mit laufender Ausstattung (inkl. Eisfach und Ofen) und Personal, damit Event-Wirkungen messbar sind. */
const make = (patch: Partial<LocationState> = {}): GameState => {
  const s = createInitialState(0);
  const base = getLocation(s, LOC);
  const stations = { ...base.stations };
  for (const id of ['matchaStation', 'register', 'coffeeMachine', 'iceBox', 'oven', 'ceremonySet']) {
    stations[id] = { level: 10, unlocked: true };
  }
  return withLocation(s, LOC, {
    ...base,
    coins: D(1e12),
    level: 10,
    stations,
    staff: { cashier: 6, barista: 12, waiter: 8 },
    ambience: { seats: 20 },
    satisfaction: 70,
    ...patch,
  });
};
const loc = (s: GameState, id = LOC): LocationState => getLocation(s, id);
const withEvent = (s: GameState, ev: Partial<ActiveEvent> & { id: string }): GameState => ({
  ...s,
  activeEvents: [
    ...s.activeEvents,
    { locationId: LOC, startedAt: s.playtimeSec, until: s.playtimeSec + 300, ...ev },
  ],
});

describe('Event-Scheduler (GAME_DESIGN § 12.1)', () => {
  it('gleicher Seed → gleiche Folge, anderer Seed → andere Folge', () => {
    const seq = (seed: number): string[] =>
      Array.from({ length: 20 }, (_, i) => {
        const d = drawEvent(seed, i);
        return `${d.def.id}:${d.durationSec.toFixed(3)}:${d.intervalSec.toFixed(3)}`;
      });
    expect(seq(42)).toEqual(seq(42));
    expect(seq(42)).not.toEqual(seq(43));
  });

  it('Dauer 3–10 min (Influencer fest 2 min), Abstand 20–45 min, alle Events kommen vor', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const d = drawEvent(7, i);
      seen.add(d.def.id);
      expect(d.intervalSec).toBeGreaterThanOrEqual(EVENT_CONFIG.intervalMinSec);
      expect(d.intervalSec).toBeLessThanOrEqual(EVENT_CONFIG.intervalMaxSec);
      if (d.def.id === 'influencerVisit') expect(d.durationSec).toBe(120);
      else {
        expect(d.durationSec).toBeGreaterThanOrEqual(EVENT_CONFIG.durationMinSec);
        expect(d.durationSec).toBeLessThanOrEqual(EVENT_CONFIG.durationMaxSec);
      }
    }
    expect([...seen].sort()).toEqual(RANDOM_EVENTS.map((e) => e.id).sort());
  });

  it('erster Termin liegt im Intervall; Tick startet das Event am aktiven Standort', () => {
    const s = make();
    expect(s.eventSchedule.nextAt).toBeGreaterThanOrEqual(EVENT_CONFIG.intervalMinSec);
    expect(s.eventSchedule.nextAt).toBeLessThanOrEqual(EVENT_CONFIG.intervalMaxSec);
    const before = tick({ ...s, playtimeSec: s.eventSchedule.nextAt - 1 }, 500);
    expect(before.activeEvents).toHaveLength(0);
    const after = tick(before, 1000);
    expect(after.activeEvents).toHaveLength(1);
    const ev = after.activeEvents[0];
    expect(ev?.locationId).toBe(LOC);
    expect(ev?.id).toBe(drawEvent(s.eventSchedule.seed, 0).def.id);
    expect(after.eventSchedule.count).toBe(1);
  });

  it('zwei Läufe mit gleichem Seed erleben dieselben Events (3 h Spielzeit)', () => {
    const run = (): string[] => {
      let s = make();
      const ids: string[] = [];
      for (let i = 0; i < 3 * 3600; i += 10) {
        const n = tick(s, 10_000);
        if (n.eventSchedule.count > s.eventSchedule.count) ids.push(n.activeEvents[0]?.id ?? '?');
        s = n;
      }
      return ids;
    };
    const a = run();
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(run()).toEqual(a);
  });

  it('nur ein Zufalls-Event zur Zeit', () => {
    const s = startNextEvent(make());
    const due = { ...s, eventSchedule: { ...s.eventSchedule, nextAt: s.playtimeSec } };
    expect(stepEvents(due).activeEvents).toHaveLength(1);
  });
});

describe('Event-Abschluss und Belohnung', () => {
  it('abgelaufenes Event: Blätter, Statistik, Event-Quest-Zähler', () => {
    const s = withEvent(make(), { id: 'heatwave', until: 1 });
    const n = tick(s, 2000);
    expect(n.activeEvents).toHaveLength(0);
    expect(n.meta.goldenLeaves.toNumber()).toBe(5);
    expect(n.stats.events).toBe(1);
    expect(n.stats.leavesEarned).toBe(5);
  });

  it('Influencer-Besuch: Ansturm ×2.5 nur 2 min, danach Zufriedenheit −10', () => {
    const s = withEvent(make(), { id: 'influencerVisit', until: 120 });
    expect(collectModifiers(s).spawnMult).toBeCloseTo(2.5);
    const settled = settleEvents({ ...s, playtimeSec: 120 });
    expect(loc(settled).satisfaction).toBeCloseTo(60);
    expect(settled.meta.goldenLeaves.toNumber()).toBe(8);
    // Ansturm-Fenster ist an den Start gebunden, nicht an das Ende.
    const long = withEvent(make(), { id: 'influencerVisit', startedAt: 0, until: 600 });
    expect(collectModifiers({ ...long, playtimeSec: 200 }).spawnMult).toBeCloseTo(1);
  });

  it('Lieferengpass: Qualität −1, beheben kostet 5 min Einkommen und bringt 5 🍃', () => {
    const plain = make({ quality: 2 });
    const s = withEvent(plain, { id: 'supplyShortage' });
    expect(collectModifiers(s).priceMult).toBeCloseTo(1.5);
    expect(collectModifiers(plain).priceMult).toBeCloseTo(2.25);
    const target = (x: GameState): number => computeLocationRates(x, LOC).satisfaction.target;
    expect(target(plain) - target(s)).toBeCloseTo(4);

    const cost = getEventResolveCost(s, 0);
    expect(cost?.toNumber()).toBeCloseTo(
      computeLocationRates(s, LOC).incomePerSec.toNumber() * 300,
    );
    const fixed = resolveEvent(s, 0);
    expect(fixed.activeEvents).toHaveLength(0);
    expect(fixed.meta.goldenLeaves.toNumber()).toBe(5);
    expect(fixed.stats.events).toBe(1);
    expect(loc(fixed).coins.toNumber()).toBeCloseTo(
      loc(s)
        .coins.sub(cost ?? 0)
        .toNumber(),
    );
  });

  it('Lieferengpass ohne Beheben: endet ohne Blätter; zu wenig Münzen → nicht behebbar', () => {
    const s = withEvent(make(), { id: 'supplyShortage', until: 1 });
    const n = tick(s, 2000);
    expect(n.activeEvents).toHaveLength(0);
    expect(n.meta.goldenLeaves.toNumber()).toBe(0);
    expect(n.stats.events).toBe(1);
    const poor = withEvent(make({ coins: D(0) }), { id: 'supplyShortage' });
    expect(resolveEvent(poor, 0)).toBe(poor);
    const heat = withEvent(make(), { id: 'heatwave' });
    expect(getEventResolveCost(heat, 0)).toBeNull();
    expect(resolveEvent(heat, 0)).toBe(heat);
  });

  it('Hitzewelle verdreifacht das Eisfach, Food-Blogger den Ofen', () => {
    const base = make();
    const icedBefore = computeLocationRates(base, LOC).perStationIncome['iceBox'];
    const heat = withEvent(base, { id: 'heatwave' });
    const r = computeLocationRates(heat, LOC);
    // Spawn ×1.3 ändert auch die Kundenzahl; das Verhältnis Iced-Bar ÷ Matcha-Bar zeigt den Preis-Faktor.
    const ratio = (x: GameState): number => {
      const p = computeLocationRates(x, LOC).perStationIncome;
      return (p['iceBox']?.toNumber() ?? 0) / (p['matchaStation']?.toNumber() ?? 1);
    };
    expect(ratio(heat) / ratio(base)).toBeCloseTo(3);
    expect(r.perStationIncome['iceBox']?.gt(icedBefore ?? 0)).toBe(true);
    const blog = withEvent(base, { id: 'foodBlogger' });
    const bRatio = (x: GameState): number => {
      const p = computeLocationRates(x, LOC).perStationIncome;
      return (p['oven']?.toNumber() ?? 0) / (p['matchaStation']?.toNumber() ?? 1);
    };
    expect(bRatio(blog) / bRatio(base)).toBeCloseTo(3);
  });

  it('Regentag: weniger Kunden, doppeltes Trinkgeld', () => {
    const base = make({ ambience: { seats: 0 } });
    const rain = withEvent(base, { id: 'rainyDay' });
    expect(computeLocationRates(rain, LOC).spawnRate).toBeCloseTo(
      computeLocationRates(base, LOC).spawnRate * 0.7,
    );
    expect(computeLocationRates(rain, LOC).tipRate).toBeCloseTo(
      computeLocationRates(base, LOC).tipRate * 2,
    );
  });

  it('wirkt nur am eigenen Standort', () => {
    let s = make();
    s = {
      ...s,
      meta: { ...s.meta, unlockedLocations: [LOC, 'kyoto'] },
      locations: { ...s.locations, kyoto: createLocationState('kyoto') },
    };
    s = withEvent(s, { id: 'rainyDay', locationId: 'kyoto' });
    expect(collectModifiers(s, LOC).spawnMult).toBe(1);
    expect(collectModifiers(s, 'kyoto').spawnMult).toBeCloseTo(0.7);
    expect(getEventOverlay(s, LOC)).toBeNull();
    expect(getEventOverlay(s, 'kyoto')).toEqual(getRandomEventDef('rainyDay')?.overlay);
  });
});

describe('Events offline (Abnahme: laufen weiter bzw. werden beim Laden abgeschlossen)', () => {
  it('in der Abwesenheit beendetes Event wird abgeschlossen und belohnt', () => {
    const s = withEvent(make(), { id: 'heatwave', until: 300 });
    const r = applyOffline(s, 10 * 60_000);
    expect(r.state.activeEvents).toHaveLength(0);
    expect(r.state.meta.goldenLeaves.toNumber()).toBe(5);
    expect(r.state.stats.events).toBe(1);
  });

  it('noch laufendes Event verliert die Abwesenheit als Restzeit', () => {
    const s = withEvent(make(), { id: 'heatwave', until: 600 });
    const r = applyOffline(s, 120_000);
    expect(r.state.activeEvents[0]?.until).toBeCloseTo(480);
    expect(r.state.meta.goldenLeaves.toNumber()).toBe(0);
  });

  it('Offline-Einnahmen zählen ohne Event-Multiplikator, Spielzeit-Plan bleibt stehen', () => {
    const plain = make();
    const heat = withEvent(plain, { id: 'heatwave', until: 1e9 });
    expect(applyOffline(heat, 3_600_000).earned.toNumber()).toBeCloseTo(
      applyOffline(plain, 3_600_000).earned.toNumber(),
    );
    expect(applyOffline(heat, 3_600_000).state.eventSchedule).toEqual(heat.eventSchedule);
  });

  it('auch ein abgelaufener Lieferengpass wird abgeschlossen (ohne Blätter)', () => {
    const s = withEvent(make(), { id: 'supplyShortage', until: 60 });
    const n = advanceEventsOffline(s, 61);
    expect(n.activeEvents).toHaveLength(0);
    expect(n.meta.goldenLeaves.toNumber()).toBe(0);
    expect(advanceEventsOffline(make(), 100)).toEqual(make());
  });
});

describe('Kalender-Events (GAME_DESIGN § 12.2)', () => {
  const at = (iso: string, tz = 0): string[] => calendarEventsAt(Date.parse(iso), tz);
  it('Zeiträume inkl. Jahreswechsel', () => {
    expect(at('2026-03-19T12:00:00Z')).toEqual([]);
    expect(at('2026-03-20T00:00:00Z')).toEqual(['hanami']);
    expect(at('2026-04-10T23:59:00Z')).toEqual(['hanami']);
    expect(at('2026-07-15T12:00:00Z')).toEqual(['summerIced']);
    expect(at('2026-08-31T12:00:00Z')).toEqual(['summerIced']);
    expect(at('2026-12-30T12:00:00Z')).toEqual([]);
    expect(at('2026-12-31T00:00:00Z')).toEqual(['newYear']);
    expect(at('2027-01-02T23:00:00Z')).toEqual(['newYear']);
    expect(at('2027-01-03T00:00:00Z')).toEqual([]);
  });
  it('lokale Zeit zählt: 30.12. 23:30 UTC ist in Berlin schon Silvester', () => {
    expect(at('2026-12-30T23:30:00Z', 0)).toEqual([]);
    expect(at('2026-12-30T23:30:00Z', -60)).toEqual(['newYear']);
  });
  it('Neujahr verdoppelt alle Preise, Hanami hebt die Zufriedenheit an allen Standorten', () => {
    const s = make();
    const ny = refreshCalendarEvents(s, Date.parse('2027-01-01T12:00:00Z'), 0);
    expect(ny.calendarEvents).toEqual(['newYear']);
    expect(collectModifiers(ny).incomeMult).toBe(2);
    expect(refreshCalendarEvents(ny, Date.parse('2027-01-01T13:00:00Z'), 0)).toBe(ny);
    const hanami = progressionStep(s, Date.parse('2026-03-25T12:00:00Z'), 0);
    expect(hanami.calendarEvents).toEqual(['hanami']);
    const target = (x: GameState): number => computeLocationRates(x, LOC).satisfaction.target;
    expect(target(hanami) - target(s)).toBeCloseTo(10);
    expect(collectModifiers(hanami).stationPriceMult['ceremonySet']).toBe(2);
    expect(getEventOverlay(hanami, LOC)?.particles).toBe('petals');
  });
});

describe('Boost-Stacking (GAME_DESIGN § 12.3)', () => {
  it('gleiche Quelle verlängert statt zu stapeln', () => {
    const a = addBoost(make(), BOOSTS.leaf);
    const b = addBoost(a, BOOSTS.leaf);
    expect(b.boosts).toHaveLength(1);
    expect(getBoostRemaining(b, 'leaf')).toBe(2 * BOOSTS.leaf.durationSec);
    expect(collectModifiers(b).incomeMult).toBe(2);
  });
  it('abgelaufener Boost wird nicht verlängert, sondern neu gestartet', () => {
    const a = addBoost(make(), BOOSTS.leaf);
    const later = { ...a, playtimeSec: BOOSTS.leaf.durationSec + 100 };
    expect(getBoostRemaining(addBoost(later, BOOSTS.leaf), 'leaf')).toBe(BOOSTS.leaf.durationSec);
  });
  it('verschiedene Quellen multiplizieren sich', () => {
    const s = addBoost(addBoost(make(), BOOSTS.leaf), BOOSTS.free);
    expect(collectModifiers(s).incomeMult).toBe(4);
    const ny = { ...s, calendarEvents: ['newYear'] };
    expect(collectModifiers(ny).incomeMult).toBe(8);
  });
  it(`Gesamt-Multiplikator je Typ höchstens ×${String(BOOST_RULES.maxMult)}`, () => {
    const s = {
      ...make(),
      calendarEvents: ['newYear'],
      boosts: [
        { id: 'a', until: 100, spawnMult: 5, incomeMult: 5, speedMult: 5 },
        { id: 'b', until: 100, spawnMult: 5, incomeMult: 5, speedMult: 5 },
      ],
    };
    const m = collectModifiers(s);
    expect(m.incomeMult).toBe(BOOST_RULES.maxMult);
    expect(m.spawnMult).toBe(BOOST_RULES.maxMult);
    expect(m.speedMult).toBe(BOOST_RULES.maxMult);
  });
});

describe('Gratis-Boost (No-op-Monetarisierung)', () => {
  it('alle 20 min aktive Spielzeit', () => {
    const s = make();
    expect(isFreeBoostReady(s)).toBe(false);
    expect(getFreeBoostWait(s)).toBe(FREE_BOOST.intervalSec);
    expect(claimFreeBoost(s)).toBe(s);
    const ready = { ...s, playtimeSec: FREE_BOOST.intervalSec };
    expect(isFreeBoostReady(ready)).toBe(true);
    const claimed = claimFreeBoost(ready);
    expect(getBoostRemaining(claimed, 'free')).toBe(BOOSTS.free.durationSec);
    expect(collectModifiers(claimed).incomeMult).toBe(BOOSTS.free.incomeMult);
    expect(getFreeBoostWait(claimed)).toBe(FREE_BOOST.intervalSec);
    expect(claimFreeBoost(claimed)).toBe(claimed);
  });
});
