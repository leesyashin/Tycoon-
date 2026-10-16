import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import { createInitialState, getLocation, withLocation, SCHEMA_VERSION } from '@core/GameState';
import { tick } from '@core/GameLoop';
import { computeLocationRates } from '@core/customers';
import { createTill, settleTill } from '@core/economy';
import { franchiseReset } from '@core/prestige';
import { D } from '@core/math';
import { deserialize, serialize } from '@core/save';

const fresh = () => createInitialState(0);

describe('Kasse: Geld kommt erst, wenn ein Gast bezahlt hat', () => {
  it('unter einem ganzen Gast bleibt alles auf den offenen Bons', () => {
    const r = settleTill(createTill(), D(6), 0.6);
    expect(r.paidCount).toBe(0);
    expect(r.paidAmount.toNumber()).toBe(0);
    expect(r.till.open.toNumber()).toBe(6);
    expect(r.till.progress).toBeCloseTo(0.6, 12);
  });
  it('ein fertiger Gast zahlt seinen Anteil, der Rest bleibt für den nächsten', () => {
    // 1,25 Gäste haben zusammen 12,50 Umsatz: einer zahlt 10, 2,50 gehören dem nächsten.
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
    let s = fresh();
    const rates = computeLocationRates(s, 'berlin');
    const ticket = rates.incomePerSec.toNumber() / rates.served;
    let before = getLocation(s, 'berlin').coins.toNumber();
    let steps = 0;
    // 30 s in 100-ms-Ticks bei gleichbleibenden Raten (Zufriedenheit und Sauberkeit festgehalten).
    for (let i = 0; i < 300; i++) {
      const l = getLocation(s, 'berlin');
      s = withLocation(s, 'berlin', { ...l, satisfaction: 50, cleanliness: 70 });
      s = tick(s, BALANCE.tickMs);
      const now = getLocation(s, 'berlin').coins.toNumber();
      if (now !== before) {
        steps++;
        // Jeder Sprung ist genau ein Bon (bei 100 ms zahlt höchstens ein Gast je Tick).
        expect(now - before).toBeCloseTo(ticket, 3);
      }
      before = now;
    }
    const loc = getLocation(s, 'berlin');
    expect(steps).toBe(loc.till.paid);
    expect(steps).toBe(Math.floor(rates.served * 30 + 1e-9));
    // Nichts geht verloren: Geld + offene Bons = Einkommen × Zeit.
    const total = loc.coins.toNumber() - BALANCE.startCoins + loc.till.open.toNumber();
    expect(total).toBeCloseTo(rates.incomePerSec.toNumber() * 30, 3);
    expect(s.meta.lifetimeEarned.toNumber()).toBeCloseTo(
      loc.coins.toNumber() - BALANCE.startCoins,
      6,
    );
  });

  it('der Franchise-Reset leert die Kasse', () => {
    let s = fresh();
    const l = getLocation(s, 'berlin');
    s = withLocation(s, 'berlin', {
      ...l,
      level: 15,
      earnedThisRun: D(1e9),
      till: { open: D(5), progress: 0.4, paid: 99 },
    });
    const after = getLocation(franchiseReset(s, 'berlin'), 'berlin');
    expect(after.till).toEqual(createTill());
  });
});

describe('Save v10 (Kasse)', () => {
  it('migriert v9 mit leerer Kasse je Standort', () => {
    const raw = JSON.parse(serialize(createInitialState(0))) as Record<string, unknown>;
    raw['schemaVersion'] = 9;
    const berlin = (raw['locations'] as Record<string, Record<string, unknown>>)['berlin'] ?? {};
    delete berlin['till'];
    berlin['coins'] = '1234';
    const s = deserialize(JSON.stringify(raw));
    expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    const loc = getLocation(s, 'berlin');
    expect(loc.till).toEqual(createTill());
    expect(loc.coins.toNumber()).toBe(1234);
  });
  it('offene Bons überleben Speichern und Laden', () => {
    const s = tick(fresh(), 2000);
    const back = getLocation(deserialize(serialize(s)), 'berlin').till;
    const till = getLocation(s, 'berlin').till;
    expect(back.open.toNumber()).toBeCloseTo(till.open.toNumber(), 9);
    expect(back.progress).toBeCloseTo(till.progress, 12);
    expect(back.paid).toBe(till.paid);
  });
  it('eine kaputte Kasse startet leer statt Geld zu verschenken', () => {
    const raw = JSON.parse(serialize(fresh())) as Record<string, unknown>;
    const berlin = (raw['locations'] as Record<string, Record<string, unknown>>)['berlin'] ?? {};
    berlin['till'] = { open: '-50', progress: 7, paid: -2 };
    expect(getLocation(deserialize(JSON.stringify(raw)), 'berlin').till).toEqual({
      open: D(0),
      progress: 1,
      paid: 0,
    });
    berlin['till'] = 'kaputt';
    expect(getLocation(deserialize(JSON.stringify(raw)), 'berlin').till).toEqual(createTill());
  });
});
