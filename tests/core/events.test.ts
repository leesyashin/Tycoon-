import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createLocationState,
  createSupply,
  getLocation,
  withLocation,
  type ActiveEvent,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { tick } from '@core/GameLoop';
import { D } from '@core/math';
import { computeLocationRates, peakIncomePerHour, type LocationRates } from '@core/customers';
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
import { BALANCE } from '@data/balance';
import {
  CALENDAR_EVENTS,
  EVENT_CONFIG,
  RANDOM_EVENTS,
  getCalendarEventDef,
  getRandomEventDef,
  type CalendarEventDef,
  type RandomEventDef,
} from '@data/events';
import { BOOSTS, BOOST_RULES } from '@data/leaves';
import { MATCHA_GRADES, MAX_GRADE, getGradeDef } from '@data/matcha';
import { FREE_BOOST } from '@data/monetization';
import { OPENING_HOURS } from '@data/time';

const LOC = 'berlin';
/** Eine Stunde nach der Standard-Öffnung: das Café hat geöffnet, Gäste kommen. */
const MORNING = OPENING_HOURS.default.open + 1;
/** Event-Wirkungen am Rate-Modell ohne den nichtlinearen Influencer-Hype messen. */
const NO_HYPE = { influencerHype: false } as const;

const randomDef = (id: string): RandomEventDef => {
  const def = getRandomEventDef(id);
  if (!def) throw new Error(`Unbekanntes Event: ${id}`);
  return def;
};
const calendarDef = (id: string): CalendarEventDef => {
  const def = getCalendarEventDef(id);
  if (!def) throw new Error(`Unbekanntes Kalender-Event: ${id}`);
  return def;
};

/**
 * Geöffnetes Café am Vormittag mit laufender Ausstattung (inkl. Eisfach, Ofen, Vitrine) und Personal, damit
 * Event-Wirkungen messbar sind.
 */
const make = (patch: Partial<LocationState> = {}): GameState => {
  const s0 = createInitialState(0);
  const s: GameState = { ...s0, clock: MORNING * 60, hourMark: MORNING };
  const base = getLocation(s, LOC);
  const stations = { ...base.stations };
  for (const id of [
    'matchaStation',
    'register',
    'coffeeMachine',
    'iceBox',
    'oven',
    'displayCase',
    'ceremonySet',
  ]) {
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
const withKyoto = (s: GameState): GameState => ({
  ...s,
  meta: { ...s.meta, unlockedLocations: [LOC, 'kyoto'] },
  locations: { ...s.locations, kyoto: createLocationState('kyoto') },
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
      if (d.def.durationSec !== undefined) expect(d.durationSec).toBe(d.def.durationSec);
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

  it('Influencer und Food-Blogger erwähnen das Café: neue Follower beim Start', () => {
    expect(RANDOM_EVENTS.some((e) => (e.followers ?? 0) > 0)).toBe(true);
    const s = make();
    for (const def of RANDOM_EVENTS) {
      let count = 0;
      while (count < 1000 && drawEvent(s.eventSchedule.seed, count).def.id !== def.id) count++;
      expect(count).toBeLessThan(1000);
      const started = startNextEvent({ ...s, eventSchedule: { ...s.eventSchedule, count } });
      expect(started.activeEvents[0]?.id).toBe(def.id);
      expect(loc(started).social.followers).toBe(loc(s).social.followers + (def.followers ?? 0));
    }
  });
});

describe('Event-Abschluss und Belohnung', () => {
  it('abgelaufenes Event: Blätter, Statistik, Event-Quest-Zähler', () => {
    const reward = randomDef('heatwave').reward;
    const s = withEvent(make(), { id: 'heatwave', until: 1 });
    const n = tick(s, 2000);
    expect(n.activeEvents).toHaveLength(0);
    expect(n.meta.goldenLeaves.toNumber()).toBe(reward);
    expect(n.stats.events).toBe(1);
    expect(n.stats.leavesEarned).toBe(reward);
  });

  it('Influencer-Besuch: Ansturm nur in den ersten Sekunden, danach sinkt die Zufriedenheit', () => {
    const def = randomDef('influencerVisit');
    const rush = def.rushSec ?? 0;
    const s = withEvent(make(), { id: 'influencerVisit', until: rush });
    expect(collectModifiers(s).spawnMult).toBeCloseTo(def.effect.spawnMult ?? 1, 12);
    const settled = settleEvents({ ...s, playtimeSec: rush });
    expect(loc(settled).satisfaction).toBeCloseTo(
      loc(s).satisfaction + (def.endSatisfaction ?? 0),
      9,
    );
    expect(settled.meta.goldenLeaves.toNumber()).toBe(def.reward);
    // Ansturm-Fenster ist an den Start gebunden, nicht an das Ende.
    const long = withEvent(make(), { id: 'influencerVisit', startedAt: 0, until: 5 * rush });
    expect(collectModifiers({ ...long, playtimeSec: rush + 1 }).spawnMult).toBeCloseTo(1, 12);
  });

  it('Lieferengpass: die Sorte wirkt schlechter – niedrigerer Preis, weniger Nachfrage, weniger Zufriedenheit', () => {
    const penalty = randomDef('supplyShortage').effect.qualityPenalty ?? 0;
    expect(penalty).toBeGreaterThan(0);
    const stock = MATCHA_GRADES.map((g) => (g.grade === MAX_GRADE ? 1e6 : 0));
    const plain = make({ supply: { ...createSupply(), grade: MAX_GRADE, stock } });
    const s = withEvent(plain, { id: 'supplyShortage' });
    expect(collectModifiers(s).qualityPenalty).toBe(penalty);

    const r0 = computeLocationRates(plain, LOC, NO_HYPE);
    const r1 = computeLocationRates(s, LOC, NO_HYPE);
    const best = getGradeDef(MAX_GRADE);
    const worse = getGradeDef(MAX_GRADE - penalty);
    expect(r0.effectiveGrade).toBe(MAX_GRADE);
    expect(r1.grade).toBe(MAX_GRADE);
    expect(r1.effectiveGrade).toBe(MAX_GRADE - penalty);
    // Preis je Matcha Latte relativ zum Kaffee (Trinkgeld und Boosts kürzen sich heraus).
    const unit = (r: LocationRates, id: string): number =>
      (r.perStationIncome[id]?.toNumber() ?? 0) / (r.perStation[id] ?? 1);
    const rel = (r: LocationRates): number => unit(r, 'matchaStation') / unit(r, 'coffeeMachine');
    expect(rel(r1) / rel(r0)).toBeCloseTo(worse.priceMult / best.priceMult, 9);
    expect(r1.demand / r0.demand).toBeCloseTo(worse.demandMult / best.demandMult, 9);
    expect(r0.satisfaction.quality).toBe(best.satisfaction);
    expect(r1.satisfaction.quality).toBe(worse.satisfaction);
    // Schlechter als die einfachste Sorte geht es nicht.
    const cheap = withEvent(make(), { id: 'supplyShortage' });
    expect(computeLocationRates(cheap, LOC).grade).toBe(0);
    expect(computeLocationRates(cheap, LOC).effectiveGrade).toBe(0);
  });

  it('Lieferengpass beheben: kostet Stunden Umsatz zur Hauptzeit (Tagesbilanz „matcha“) und bringt Blätter', () => {
    const def = randomDef('supplyShortage');
    const hours = def.resolve?.incomeHours ?? 0;
    expect(hours).toBeGreaterThan(0);
    const s = withEvent(make(), { id: 'supplyShortage' });
    const cost = getEventResolveCost(s, 0);
    if (!cost) throw new Error('Lieferengpass muss behebbar sein');
    expect(cost.toNumber()).toBeCloseTo(peakIncomePerHour(s, LOC).toNumber() * hours, 6);
    // Unabhängig von der Uhrzeit: nachts kostet es dasselbe.
    const night = { ...s, clock: OPENING_HOURS.default.close * 60 + 120 };
    expect(getEventResolveCost(night, 0)?.toNumber()).toBeCloseTo(cost.toNumber(), 6);

    const fixed = resolveEvent(s, 0);
    expect(fixed.activeEvents).toHaveLength(0);
    expect(fixed.meta.goldenLeaves.toNumber()).toBe(def.reward);
    expect(fixed.stats.events).toBe(1);
    expect(loc(fixed).coins.eq(loc(s).coins.sub(cost))).toBe(true);
    expect(loc(fixed).ledger.today.matcha.toNumber()).toBeCloseTo(cost.toNumber(), 6);

    // Ohne Umsatz (nichts auf der Karte) gilt ein Sockelbetrag.
    const empty = withEvent(make({ stations: {} }), { id: 'supplyShortage' });
    expect(peakIncomePerHour(empty, LOC).toNumber()).toBe(0);
    expect(getEventResolveCost(empty, 0)?.toNumber()).toBe(BALANCE.startCoins / 5);
  });

  it('Lieferengpass ohne Beheben: endet ohne Blätter; zu wenig Geld → nicht behebbar', () => {
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
    const over = withEvent(make(), { id: 'supplyShortage', until: 0 });
    expect(resolveEvent(over, 0)).toBe(over);
  });

  it('Hitzewelle und Food-Blogger: mehr Gäste, die mehr Iced Matcha bzw. Gebäck und Kuchen bestellen', () => {
    const base = make();
    const r0 = computeLocationRates(base, LOC, NO_HYPE);
    /** Stück je Gast einer Produktlinie. */
    const perGuest = (r: LocationRates, id: string): number => (r.perStation[id] ?? 0) / r.served;
    for (const id of ['heatwave', 'foodBlogger']) {
      const def = randomDef(id);
      const attach = Object.entries(def.effect.stationAttachMult ?? {});
      expect(attach.length).toBeGreaterThan(0);
      const r1 = computeLocationRates(withEvent(base, { id }), LOC, NO_HYPE);
      expect(r1.demand / r0.demand).toBeCloseTo(def.effect.spawnMult ?? 1, 9);
      for (const [line, mult] of attach) {
        expect(r0.perStation[line]).toBeGreaterThan(0);
        expect(perGuest(r1, line) / perGuest(r0, line)).toBeCloseTo(mult, 9);
      }
      // Matcha Latte bestellen die Gäste wie immer; die Preise bleiben (Phase 3).
      expect(perGuest(r1, 'matchaStation')).toBeCloseTo(perGuest(r0, 'matchaStation'), 9);
      expect(r1.avgTicket.toNumber()).toBeGreaterThan(r0.avgTicket.toNumber());
      expect(collectModifiers(withEvent(base, { id })).incomeMult).toBe(def.effect.incomeMult ?? 1);
    }
  });

  it('Regentag: weniger Gäste, mehr Trinkgeld', () => {
    const def = randomDef('rainyDay');
    const base = make();
    const rain = withEvent(base, { id: 'rainyDay' });
    const r0 = computeLocationRates(base, LOC, NO_HYPE);
    const r1 = computeLocationRates(rain, LOC, NO_HYPE);
    expect(r1.spawnRate / r0.spawnRate).toBeCloseTo(def.effect.spawnMult ?? 1, 9);
    expect(collectModifiers(rain).tipMult).toBe(def.effect.tipMult ?? 1);
    // Die Trinkgeld-Quote aus Zufriedenheit und Musik zählt × tipMult, der Tischservice-Anteil bleibt.
    const service = (r: LocationRates): number =>
      r.tableServiceShare * BALANCE.service.tableServiceTips;
    expect(r1.tipRate - service(r1)).toBeCloseTo(
      (r0.tipRate - service(r0)) * (def.effect.tipMult ?? 1),
      9,
    );
    expect(r1.tipRate).toBeGreaterThan(r0.tipRate);
  });

  it('wirkt nur am eigenen Standort', () => {
    const s = withEvent(withKyoto(make()), { id: 'rainyDay', locationId: 'kyoto' });
    expect(collectModifiers(s, LOC).spawnMult).toBe(1);
    expect(collectModifiers(s, 'kyoto').spawnMult).toBeCloseTo(
      randomDef('rainyDay').effect.spawnMult ?? 1,
      12,
    );
    expect(getEventOverlay(s, LOC)).toBeNull();
    expect(getEventOverlay(s, 'kyoto')).toEqual(randomDef('rainyDay').overlay);
  });
});

describe('Events offline (Abnahme: laufen weiter bzw. werden beim Laden abgeschlossen)', () => {
  it('in der Abwesenheit beendetes Event wird abgeschlossen und belohnt', () => {
    const s = withEvent(make(), { id: 'heatwave', until: 300 });
    const r = applyOffline(s, 10 * 60_000);
    expect(r.state.activeEvents).toHaveLength(0);
    expect(r.state.meta.goldenLeaves.toNumber()).toBe(randomDef('heatwave').reward);
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
  it('wirken an allen Standorten, Bestell-Faktoren wie in den Daten', () => {
    const s = withKyoto(make());
    for (const def of CALENDAR_EVENTS) {
      const on = { ...s, calendarEvents: [def.id] };
      for (const id of [LOC, 'kyoto']) {
        const m = collectModifiers(on, id);
        expect(m.spawnMult).toBeCloseTo(def.effect.spawnMult ?? 1, 12);
        expect(m.tipMult).toBeCloseTo(def.effect.tipMult ?? 1, 12);
        expect(m.incomeMult).toBeCloseTo(def.effect.incomeMult ?? 1, 12);
        expect(m.eventSatisfaction).toBe(def.effect.satisfactionBonus ?? 0);
        expect(m.stationAttachMult).toEqual(def.effect.stationAttachMult ?? {});
      }
      expect(getEventOverlay(on, LOC)).toEqual(def.overlay);
    }
  });
  it('Neujahr: mehr Gäste und Trinkgeld; Hanami hebt die Zufriedenheit an allen Standorten', () => {
    const s = withKyoto(make());
    const ny = refreshCalendarEvents(s, Date.parse('2027-01-01T12:00:00Z'), 0);
    expect(ny.calendarEvents).toEqual(['newYear']);
    expect(refreshCalendarEvents(ny, Date.parse('2027-01-01T13:00:00Z'), 0)).toBe(ny);
    const nyDef = calendarDef('newYear');
    const r0 = computeLocationRates(s, LOC, NO_HYPE);
    const r1 = computeLocationRates(ny, LOC, NO_HYPE);
    expect(r1.demand / r0.demand).toBeCloseTo(nyDef.effect.spawnMult ?? 1, 9);
    expect(r1.tipRate).toBeGreaterThan(r0.tipRate);

    const hanami = progressionStep(s, Date.parse('2026-03-25T12:00:00Z'), 0);
    expect(hanami.calendarEvents).toEqual(['hanami']);
    const bonus = calendarDef('hanami').effect.satisfactionBonus ?? 0;
    expect(bonus).toBeGreaterThan(0);
    const target = (x: GameState, id: string): number =>
      computeLocationRates(x, id).satisfaction.target;
    for (const id of [LOC, 'kyoto']) {
      expect(target(hanami, id) - target(s, id)).toBeCloseTo(bonus, 9);
    }
    expect(getEventOverlay(hanami, LOC)?.particles).toBe('petals');
  });
});

describe('Boost-Stacking (GAME_DESIGN § 12.3)', () => {
  it('gleiche Quelle verlängert statt zu stapeln', () => {
    const a = addBoost(make(), BOOSTS.leaf);
    const b = addBoost(a, BOOSTS.leaf);
    expect(b.boosts).toHaveLength(1);
    expect(getBoostRemaining(b, 'leaf')).toBe(2 * BOOSTS.leaf.durationSec);
    expect(collectModifiers(b).incomeMult).toBe(BOOSTS.leaf.incomeMult);
  });
  it('abgelaufener Boost wird nicht verlängert, sondern neu gestartet', () => {
    const a = addBoost(make(), BOOSTS.leaf);
    const later = { ...a, playtimeSec: BOOSTS.leaf.durationSec + 100 };
    expect(getBoostRemaining(addBoost(later, BOOSTS.leaf), 'leaf')).toBe(BOOSTS.leaf.durationSec);
  });
  it('verschiedene Quellen multiplizieren sich', () => {
    const s = addBoost(addBoost(make(), BOOSTS.leaf), BOOSTS.free);
    expect(collectModifiers(s).incomeMult).toBe(BOOSTS.leaf.incomeMult * BOOSTS.free.incomeMult);
    const rain = randomDef('rainyDay').effect;
    const ny = calendarDef('newYear').effect;
    const both = withEvent({ ...s, calendarEvents: ['newYear'] }, { id: 'rainyDay' });
    const m = collectModifiers(both);
    expect(m.spawnMult).toBeCloseTo(
      (rain.spawnMult ?? 1) * (ny.spawnMult ?? 1) * BOOSTS.leaf.spawnMult * BOOSTS.free.spawnMult,
      12,
    );
    expect(m.tipMult).toBeCloseTo((rain.tipMult ?? 1) * (ny.tipMult ?? 1), 12);
    expect(m.incomeMult).toBe(BOOSTS.leaf.incomeMult * BOOSTS.free.incomeMult);
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
