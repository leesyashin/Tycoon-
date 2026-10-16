import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { PRESTIGE } from '@data/prestige';
import { OPENING_HOURS, TIME } from '@data/time';
import {
  createInitialState,
  getLocation,
  withLocation,
  SCHEMA_VERSION,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { tick } from '@core/GameLoop';
import { computeLocationRates, tapCafe } from '@core/customers';
import { applyOffline, createTill, settleTill } from '@core/economy';
import { franchiseReset } from '@core/prestige';
import { D } from '@core/math';
import { deserialize, migrations, serialize } from '@core/save';

const L = 'berlin';
/** Eine volle Stunde mitten in der Öffnungszeit (der Spielstart liegt kurz vor der ersten Öffnung). */
const OPEN_HOUR = OPENING_HOURS.default.open + 1;

const fresh = (): GameState => createInitialState(0);
const patch = (s: GameState, p: Partial<LocationState>): GameState =>
  withLocation(s, L, { ...getLocation(s, L), ...p });
/** Spieluhr auf eine volle Stunde stellen; die Stunden davor gelten als abgerechnet. */
const atHour = (s: GameState, hour: number): GameState => ({
  ...s,
  clock: hour * 60,
  hourMark: hour,
});
/** Café zur Öffnungszeit mit festgehaltener Zufriedenheit und Sauberkeit: gleichbleibende Raten. */
const steady = (s: GameState): GameState => patch(s, { satisfaction: 50, cleanliness: 70 });

describe('Kasse: Geld kommt erst, wenn ein Gast bezahlt hat', () => {
  it('unter einem ganzen Gast bleibt alles auf den offenen Bons', () => {
    const r = settleTill(createTill(), D(6), 0.6);
    expect(r.paidCount).toBe(0);
    expect(r.paidAmount.toNumber()).toBe(0);
    expect(r.till.open.toNumber()).toBe(6);
    expect(r.till.progress).toBeCloseTo(0.6, 12);
  });
  it('ein fertiger Gast zahlt seinen Anteil, der Rest bleibt für den nächsten', () => {
    // 1,25 Gäste haben zusammen 12,50 € Umsatz: einer zahlt 10 €, 2,50 € gehören dem nächsten.
    const r = settleTill(createTill(), D(12.5), 1.25);
    expect(r.paidCount).toBe(1);
    expect(r.paidAmount.toNumber()).toBeCloseTo(10, 9);
    expect(r.till.open.toNumber()).toBeCloseTo(2.5, 9);
    expect(r.till.progress).toBeCloseTo(0.25, 12);
    expect(r.till.paid).toBe(1);
  });
  it('mehrere Gäste in einem Schritt zahlen zusammen', () => {
    const r = settleTill({ open: D(1), progress: 0.5, paid: 7 }, D(29), 2.5);
    expect(r.paidCount).toBe(3);
    expect(r.paidAmount.toNumber()).toBeCloseTo(30, 9);
    expect(r.till.open.toNumber()).toBeCloseTo(0, 9);
    expect(r.till.paid).toBe(10);
  });
  it('ignoriert ungültige Gästezahlen', () => {
    const r = settleTill(createTill(), D(1), Number.NaN);
    expect(r.paidCount).toBe(0);
    expect(r.till.progress).toBe(0);
    expect(settleTill(createTill(), D(1), -3).till.progress).toBe(0);
  });

  it('im Tick steigt das Geld nur in Schritten je bezahlendem Gast, über die Zeit wie im Rate-Modell', () => {
    let s = steady(atHour(fresh(), OPEN_HOUR));
    const rates = computeLocationRates(s, L);
    expect(rates.open).toBe(true);
    const ticket = rates.incomePerHour.toNumber() / rates.served;
    const start = getLocation(s, L).coins.toNumber();
    let before = start;
    let steps = 0;
    // 30 echte Sekunden in 100-ms-Ticks bleiben in derselben Spielstunde: gleichbleibende Raten, und die
    // laufenden Kosten werden erst zur vollen Stunde abgebucht.
    const seconds = 30;
    const minutes = seconds * TIME.openMinutesPerSec;
    expect(minutes).toBeLessThan(60);
    for (let i = 0; i < (seconds * 1000) / BALANCE.tickMs; i++) {
      s = tick(steady(s), BALANCE.tickMs);
      const now = getLocation(s, L).coins.toNumber();
      if (now !== before) {
        steps++;
        // Jeder Sprung ist genau ein Bon (bei 100 ms zahlt höchstens ein Gast je Tick).
        expect(now - before).toBeCloseTo(ticket, 3);
      }
      before = now;
    }
    const loc = getLocation(s, L);
    expect(loc.bills.count).toBe(0);
    expect(steps).toBe(loc.till.paid);
    expect(steps).toBe(Math.floor((rates.served * minutes) / 60 + 1e-9));
    // Nichts geht verloren: Geld + offene Bons = Umsatz × Zeit.
    const total = loc.coins.toNumber() - start + loc.till.open.toNumber();
    expect(total).toBeCloseTo((rates.incomePerHour.toNumber() * minutes) / 60, 3);
    expect(s.meta.lifetimeEarned.toNumber()).toBeCloseTo(loc.coins.toNumber() - start, 6);
  });

  it('Offline-Einnahmen und Tap-Bonus gehen direkt aufs Konto, nicht über die Kasse', () => {
    const s = steady(atHour(fresh(), OPEN_HOUR));
    const till = getLocation(s, L).till;
    // Eine Minute weg = eine halbe Spielstunde Betrieb (Offline-Effizienz): die Kosten warten noch auf die
    // volle Stunde, der Umsatz ist schon ganz auf dem Konto.
    const away = applyOffline(s, 60_000);
    expect(away.revenue.gt(0)).toBe(true);
    expect(getLocation(away.state, L).till).toEqual(till);
    expect(getLocation(away.state, L).coins.sub(getLocation(s, L).coins).toNumber()).toBeCloseTo(
      away.revenue.toNumber(),
      9,
    );
    const tap = tapCafe(s, L);
    expect(tap.gained.gt(0)).toBe(true);
    expect(getLocation(tap.state, L).till).toEqual(till);
  });

  it('der Franchise-Reset leert die Kasse', () => {
    const s = patch(fresh(), {
      level: PRESTIGE.resetMinCafeLevel,
      earnedThisRun: D(1e6),
      till: { open: D(5), progress: 0.4, paid: 99 },
    });
    const after = franchiseReset(s, L);
    expect(after).not.toBe(s);
    expect(getLocation(after, L).till).toEqual(createTill());
  });
});

describe('Save v10 (Kasse)', () => {
  it('v9 → v10 legt je Standort eine leere Kasse an', () => {
    const raw = JSON.parse(serialize(fresh())) as Record<string, unknown>;
    raw['schemaVersion'] = 9;
    const berlin = (raw['locations'] as Record<string, Record<string, unknown>>)['berlin'] ?? {};
    delete berlin['till'];
    berlin['coins'] = '1234';
    const v10 = migrations[9]?.(raw) ?? {};
    expect(v10['schemaVersion']).toBe(10);
    const migrated = (v10['locations'] as Record<string, Record<string, unknown>>)['berlin'];
    expect(migrated?.['till']).toEqual({ open: '0', progress: 0, paid: 0 });
    expect(migrated?.['coins']).toBe('1234');
    // Ganz geladen ist die Kasse leer (v11 startet das Café ohnehin neu).
    const s = deserialize(JSON.stringify(raw));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    expect(getLocation(s, L).till).toEqual(createTill());
  });
  it('offene Bons überleben Speichern und Laden', () => {
    const s = tick(atHour(fresh(), OPEN_HOUR), 2000);
    const till = getLocation(s, L).till;
    expect(till.open.gt(0)).toBe(true);
    const back = getLocation(deserialize(serialize(s)), L).till;
    expect(back.open.toNumber()).toBeCloseTo(till.open.toNumber(), 9);
    expect(back.progress).toBeCloseTo(till.progress, 12);
    expect(back.paid).toBe(till.paid);
  });
  it('eine kaputte Kasse startet leer statt Geld zu verschenken', () => {
    const raw = JSON.parse(serialize(fresh())) as Record<string, unknown>;
    const berlin = (raw['locations'] as Record<string, Record<string, unknown>>)['berlin'] ?? {};
    berlin['till'] = { open: '-50', progress: 7, paid: -2 };
    expect(getLocation(deserialize(JSON.stringify(raw)), L).till).toEqual({
      open: D(0),
      progress: 1,
      paid: 0,
    });
    berlin['till'] = 'kaputt';
    expect(getLocation(deserialize(JSON.stringify(raw)), L).till).toEqual(createTill());
  });
});
