import { describe, expect, it } from 'vitest';
import { BALANCE } from '@data/balance';
import {
  createInitialState,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
} from '@core/GameState';
import { tick } from '@core/GameLoop';
import { D } from '@core/math';
import { computeLocationRates, computeSpawnRate } from '@core/customers';
import { applyOffline, collectModifiers, withoutTemporaryBoosts } from '@core/economy';
import {
  buyMarketingLevel,
  campaignCooldownSec,
  campaignSpawnMult,
  campaignStatus,
  getCampaignCost,
  getMarketingLevelCost,
  isMarketingMaxed,
  skipCampaignCooldown,
  startCampaign,
} from '@core/marketing';
import { deserialize, serialize } from '@core/save';

const LOC = 'berlin';
const M = BALANCE.marketing;

const make = (patch: Partial<LocationState> = {}, leaves = 0): GameState => {
  const s = createInitialState(0);
  const n = withLocation(s, LOC, { ...getLocation(s, LOC), coins: D(1e9), level: 5, ...patch });
  return { ...n, meta: { ...n.meta, goldenLeaves: D(leaves) } };
};
const loc = (s: GameState): LocationState => getLocation(s, LOC);

describe('Kampagnen-Level (permanent)', () => {
  it('Kosten wachsen mit 1.6 je Level', () => {
    const s = make();
    expect(getMarketingLevelCost(s, LOC).toNumber()).toBeCloseTo(M.baseCost);
    const n = buyMarketingLevel(s, LOC);
    expect(loc(n).marketing.level).toBe(1);
    expect(getMarketingLevelCost(n, LOC).toNumber()).toBeCloseTo(M.baseCost * 1.6);
  });

  it('+5 % Spawnrate je Level', () => {
    const a = computeSpawnRate(loc(make()));
    const b = computeSpawnRate(loc(make({ marketing: { level: 4 } })));
    expect(b).toBeCloseTo(a * 1.2);
  });

  it('gesperrt, zu teuer oder maximal → kein Kauf', () => {
    const locked = make({ level: 1 });
    expect(buyMarketingLevel(locked, LOC)).toBe(locked);
    const poor = make({ coins: D(1) });
    expect(buyMarketingLevel(poor, LOC)).toBe(poor);
    const maxed = make({ marketing: { level: M.maxLevel } });
    expect(isMarketingMaxed(maxed, LOC)).toBe(true);
    expect(buyMarketingLevel(maxed, LOC)).toBe(maxed);
  });
});

describe('Aktive Kampagne', () => {
  it('kostet 2 min Einkommen, mindestens den Mindestpreis', () => {
    const s = make();
    const income = computeLocationRates(s, LOC).incomePerSec;
    const expected = Math.max(income.toNumber() * M.campaignIncomeSec, M.campaignMinCost);
    expect(getCampaignCost(s, LOC).toNumber()).toBeCloseTo(expected);
    const big = make({
      stations: { ...loc(s).stations, matchaBar: { level: 400, unlocked: true } },
    });
    const bigIncome = computeLocationRates(big, LOC).incomePerSec.toNumber();
    expect(getCampaignCost(big, LOC).toNumber()).toBeCloseTo(bigIncome * M.campaignIncomeSec);
  });

  it('läuft 10 min mit ×2 Spawn, danach 30 min Abklingzeit, dann wieder bereit', () => {
    const s = make();
    let n = startCampaign(s, LOC);
    expect(loc(n).coins.lt(loc(s).coins)).toBe(true);
    expect(campaignStatus(loc(n), n.playtimeSec)).toEqual({
      phase: 'active',
      remainingSec: M.campaignDurationSec,
    });
    expect(collectModifiers(n, LOC).spawnMult).toBe(M.campaignSpawnMult);
    // ×2 auf den Spawn (ohne Influencer-Hype gerechnet, der nur die Nachfrage hebt).
    const off = { influencerHype: false };
    expect(computeLocationRates(n, LOC, off).spawnRate).toBeCloseTo(
      computeLocationRates(s, LOC, off).spawnRate * 2,
    );
    // Während der Kampagne kein zweiter Start.
    expect(startCampaign(n, LOC)).toBe(n);

    n = { ...n, playtimeSec: M.campaignDurationSec + 1 };
    expect(campaignStatus(loc(n), n.playtimeSec).phase).toBe('cooldown');
    expect(campaignSpawnMult(loc(n), n.playtimeSec)).toBe(1);
    expect(startCampaign(n, LOC)).toBe(n);

    n = { ...n, playtimeSec: M.campaignDurationSec + M.cooldownSec };
    expect(campaignStatus(loc(n), n.playtimeSec)).toEqual({ phase: 'ready', remainingSec: 0 });
  });

  it('ohne Geld oder vor der Freischaltung kein Start', () => {
    const poor = make({ coins: D(0) });
    expect(startCampaign(poor, LOC)).toBe(poor);
    const locked = make({ level: 1 });
    expect(startCampaign(locked, LOC)).toBe(locked);
  });

  it('Social-Media-Manager kürzt die Abklingzeit um 10 % je Stufe (multiplikativ)', () => {
    expect(campaignCooldownSec(loc(make()))).toBe(M.cooldownSec);
    expect(campaignCooldownSec(loc(make({ staff: { socialMedia: 1 } })))).toBeCloseTo(1620);
    const max = campaignCooldownSec(loc(make({ staff: { socialMedia: 15 } })));
    expect(max).toBeGreaterThan(0);
    expect(max).toBeCloseTo(M.cooldownSec * 0.9 ** 15);
    const n = startCampaign(make({ staff: { socialMedia: 2 } }), LOC);
    expect(loc(n).marketing.cooldownUntil).toBeCloseTo(M.campaignDurationSec + 1800 * 0.81);
  });

  it('Goldene Blätter beenden die Abklingzeit (3 🍃)', () => {
    const s = startCampaign(make({}, 5), LOC);
    expect(skipCampaignCooldown(s, LOC)).toBe(s); // läuft noch, keine Abklingzeit
    const cooling = { ...s, playtimeSec: M.campaignDurationSec + 5 };
    const n = skipCampaignCooldown(cooling, LOC);
    expect(n.meta.goldenLeaves.toNumber()).toBe(2);
    expect(campaignStatus(loc(n), n.playtimeSec).phase).toBe('ready');
    expect(loc(n).marketing.level).toBe(0);
    const broke = { ...cooling, meta: { ...cooling.meta, goldenLeaves: D(2) } };
    expect(skipCampaignCooldown(broke, LOC)).toBe(broke);
  });

  it('tick lässt die Kampagne über die Spielzeit auslaufen', () => {
    let s = startCampaign(make(), LOC);
    s = tick(s, (M.campaignDurationSec + 1) * 1000);
    expect(campaignStatus(loc(s), s.playtimeSec).phase).toBe('cooldown');
  });
});

describe('Offline zählt keine zeitlich begrenzten Boosts', () => {
  it('Kampagne, Boosts und Events werden für die Offline-Rate abgezogen', () => {
    const s = startCampaign(make({ ambience: { seats: 50 } }), LOC);
    const boosted = {
      ...s,
      boosts: [{ id: 'hype', until: 100, spawnMult: 2, incomeMult: 2, speedMult: 1 }],
      activeEvents: [{ id: 'heatwave', locationId: LOC, startedAt: 0, until: 100 }],
    };
    const plain = withoutTemporaryBoosts(boosted);
    expect(plain.boosts).toEqual([]);
    expect(plain.activeEvents).toEqual([]);
    expect(loc(plain).marketing.campaignUntil).toBeUndefined();
    expect(loc(plain).marketing.cooldownUntil).toBe(loc(s).marketing.cooldownUntil);
    const a = applyOffline(boosted, 3_600_000).earned.toNumber();
    const b = applyOffline(plain, 3_600_000).earned.toNumber();
    expect(a).toBeCloseTo(b);
  });
});

describe('Save v3', () => {
  it('Marketing-Zustand, Sauberkeit und Auto-Kauf überleben Speichern/Laden', () => {
    const s = startCampaign(make({ cleanliness: 42, autoBuy: true, staff: { manager: 1 } }), LOC);
    const r = loc(deserialize(serialize(s)));
    expect(r.cleanliness).toBe(42);
    expect(r.autoBuy).toBe(true);
    expect(r.staff).toEqual({ manager: 1 });
    expect(r.marketing).toEqual(loc(s).marketing);
  });

  it('v2 → v3 ergänzt Sauberkeit und Auto-Kauf', () => {
    const v2 = JSON.parse(serialize(createInitialState(0))) as {
      schemaVersion: number;
      locations: Record<string, Record<string, unknown>>;
    };
    v2.schemaVersion = 2;
    delete v2.locations['berlin']?.['cleanliness'];
    delete v2.locations['berlin']?.['autoBuy'];
    const s = deserialize(JSON.stringify(v2));
    expect(loc(s).cleanliness).toBe(BALANCE.cleanliness.start);
    expect(loc(s).autoBuy).toBe(false);
  });

  it('kaputte Werte werden auf gültige gesetzt', () => {
    const raw = JSON.parse(serialize(createInitialState(0))) as {
      locations: Record<string, Record<string, unknown>>;
    };
    const b = raw.locations['berlin'] ?? {};
    b['cleanliness'] = 500;
    b['autoBuy'] = 'yes';
    b['staff'] = null;
    const r = loc(deserialize(JSON.stringify(raw)));
    expect(r.cleanliness).toBe(100);
    expect(r.autoBuy).toBe(false);
    expect(r.staff).toEqual({});
  });
});
