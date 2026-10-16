import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createSocial,
  getLocation,
  withLocation,
  type GameState,
  type LocationState,
  type SocialPost,
  type SocialState,
} from '@core/GameState';
import { D } from '@core/math';
import { advanceRealSeconds } from '@core/economy';
import { computeLocationRates, followerDemandMult } from '@core/customers';
import {
  decayBuzz,
  getVideoCost,
  isFormatUnlocked,
  managerPostStep,
  postBlock,
  postBonusVideo,
  postVideo,
  postsLeftToday,
  previewVideo,
  rolloverSocial,
  videoReachMult,
} from '@core/social';
import { clockSpeed, hourOf, minutesToNextHour } from '@core/time';
import { BALANCE } from '@data/balance';
import { LOCATIONS } from '@data/locations';
import { MATCHA_GRADES, MAX_GRADE } from '@data/matcha';
import { SOCIAL, VIDEO_FORMATS, getVideoFormat, type VideoFormatDef } from '@data/social';
import { getStaffDef } from '@data/staff';
import { OPENING_HOURS, TIME } from '@data/time';

const LOC = 'berlin';
const HOUR = 60;
/** Spieluhr-Minute `hour:00` am Spieltag `day`. */
const at = (day: number, hour: number): number => day * TIME.minutesPerDay + hour * HOUR;
/** Eine Stunde nach der Standard-Öffnung: das Café hat geöffnet. */
const MORNING = OPENING_HOURS.default.open + 1;
const TOP_LEVEL = Math.max(...VIDEO_FORMATS.map((f) => f.unlockCafeLevel));

const pick = (what: string, pred: (f: VideoFormatDef) => boolean): VideoFormatDef => {
  const def = VIDEO_FORMATS.find(pred);
  if (!def) throw new Error(`data/social hat kein Format: ${what}`);
  return def;
};
/** Gratis-Video, das jedes neue Café posten kann. */
const FREE = pick('gratis ab Level 1', (f) => f.cost === 0 && f.unlockCafeLevel <= 1 && !f.needs);
const PAID = pick('kostenpflichtig', (f) => f.cost > 0);
const LATER = pick('erst ab höherem Café-Level', (f) => f.unlockCafeLevel > 1);
const BARISTA = pick('braucht einen Barista', (f) => f.needs === 'barista');
const VIRAL = VIDEO_FORMATS.reduce((a, f) => (f.viralChance > a.viralChance ? f : a));
const SOCIAL_ROLE = getStaffDef('socialMedia');

/** Café am Vormittag von Tag 0 mit genug Geld und Level für alle Formate (Gründungsteam inkl. Barista). */
const make = (patch: Partial<LocationState> = {}, leaves = 0): GameState => {
  const s0 = createInitialState(0);
  const s: GameState = {
    ...s0,
    clock: at(0, MORNING),
    hourMark: MORNING,
    meta: { ...s0.meta, goldenLeaves: D(leaves) },
  };
  return withLocation(s, LOC, {
    ...getLocation(s, LOC),
    coins: D(1e6),
    level: TOP_LEVEL,
    ...patch,
  });
};
const loc = (s: GameState): LocationState => getLocation(s, LOC);
const social = (s: GameState): SocialState => loc(s).social;
const withSocial = (s: GameState, patch: Partial<SocialState>): GameState =>
  withLocation(s, LOC, { ...loc(s), social: { ...social(s), ...patch } });
const withStaff = (s: GameState, staff: Record<string, number>): GameState =>
  withLocation(s, LOC, { ...loc(s), staff: { ...loc(s).staff, ...staff } });
/** Neuestes Video des Accounts (wirft, wenn keins gepostet wurde). */
const lastPost = (s: GameState): SocialPost => {
  const p = social(s).recent[0];
  if (!p) throw new Error('kein Video gepostet');
  return p;
};

/** Café-Betrieb bis zur Spieluhr-Zeit `clock` (stundenweise, damit das Tempo je Abschnitt fest ist). */
const runUntil = (state: GameState, clock: number): GameState => {
  let s = state;
  for (let i = 0; s.clock < clock - 1e-9; i++) {
    if (i > 10_000) throw new Error('Spieluhr kommt nicht voran');
    const minutes = Math.min(minutesToNextHour(s.clock), clock - s.clock);
    s = advanceRealSeconds(s, minutes / clockSpeed(s));
  }
  return s;
};

describe('Video-Formate (Social Media statt Kampagnen)', () => {
  it('Kosten je Video × Preisniveau des Standorts', () => {
    for (const def of VIDEO_FORMATS) {
      for (const place of LOCATIONS) {
        expect(getVideoCost(def, place.id).toNumber()).toBeCloseTo(def.cost * place.scale, 9);
      }
    }
  });

  it('Freischaltung über das Café-Level; das Barista-Tutorial braucht einen Barista', () => {
    const base = loc(make());
    for (const def of VIDEO_FORMATS) {
      expect(isFormatUnlocked({ ...base, level: def.unlockCafeLevel - 1 }, def)).toBe(false);
      expect(isFormatUnlocked({ ...base, level: def.unlockCafeLevel }, def)).toBe(true);
    }
    const noBarista = { ...base, staff: { ...base.staff, barista: 0 } };
    expect(isFormatUnlocked(noBarista, BARISTA)).toBe(false);
    expect(isFormatUnlocked(noBarista, FREE)).toBe(true);
    expect(postBlock(withStaff(make(), { barista: 0 }), LOC, BARISTA.id)).toBe('locked');
  });

  it('Reichweite: mehr Follower, Deko, bessere Sorte, Manager und Zufriedenheit → mehr Views', () => {
    const base = loc(make());
    const r0 = videoReachMult(base);
    const best = MATCHA_GRADES.map((g) => (g.grade === MAX_GRADE ? 500 : 0));
    const better: LocationState[] = [
      { ...base, social: { ...base.social, followers: base.social.followers + 50_000 } },
      { ...base, ambience: { ...base.ambience, decor: (base.ambience['decor'] ?? 0) + 10 } },
      { ...base, supply: { ...base.supply, stock: best, grade: MAX_GRADE } },
      { ...base, staff: { ...base.staff, socialMedia: 1 } },
      { ...base, satisfaction: base.satisfaction + 20 },
    ];
    for (const l of better) expect(videoReachMult(l)).toBeGreaterThan(r0);
    for (const def of VIDEO_FORMATS) {
      const p = previewVideo(base, def);
      expect(p.views).toBeCloseTo(def.reach * r0, 9);
      expect(p.followers).toBeCloseTo(p.views * def.conversion, 9);
    }
  });
});

describe('Tageslimit und Sperrgründe', () => {
  it(`höchstens ${String(SOCIAL.postsPerDay)} Videos am Tag`, () => {
    let s = make();
    for (let i = 0; i < SOCIAL.postsPerDay; i++) {
      expect(postsLeftToday(loc(s))).toBe(SOCIAL.postsPerDay - i);
      expect(postBlock(s, LOC, FREE.id)).toBeNull();
      s = postVideo(s, LOC, FREE.id);
    }
    expect(social(s).postsToday).toBe(SOCIAL.postsPerDay);
    expect(postsLeftToday(loc(s))).toBe(0);
    expect(postBlock(s, LOC, FREE.id)).toBe('limit');
    expect(postVideo(s, LOC, FREE.id)).toBe(s);
    const over = withSocial(s, { postsToday: SOCIAL.postsPerDay + 2 });
    expect(postsLeftToday(loc(over))).toBe(0);
  });

  it('Gründe in dieser Reihenfolge: gesperrt, Limit, Geld; null = es geht', () => {
    const full = { postsToday: SOCIAL.postsPerDay };
    const broke = { coins: D(0) };
    const cases: [GameState, string, string | null][] = [
      [make(), 'nope', 'locked'],
      [withSocial(make({ ...broke, level: LATER.unlockCafeLevel - 1 }), full), LATER.id, 'locked'],
      [withSocial(make(broke), full), PAID.id, 'limit'],
      [make(broke), PAID.id, 'money'],
      [make({ coins: getVideoCost(PAID, LOC).sub(0.01) }), PAID.id, 'money'],
      [make({ coins: getVideoCost(PAID, LOC) }), PAID.id, null],
      [make(broke), FREE.id, null],
      [make(), PAID.id, null],
    ];
    for (const [s, id, reason] of cases) {
      expect(postBlock(s, LOC, id)).toBe(reason);
      if (reason !== null) expect(postVideo(s, LOC, id)).toBe(s);
    }
  });
});

describe('Video posten', () => {
  it('bezahlt das Video (Tagesbilanz „marketing“), bringt Follower, Buzz und einen Eintrag im Account', () => {
    const s = make();
    const before = loc(s);
    const n = postVideo(s, LOC, PAID.id);
    const after = loc(n);
    const cost = getVideoCost(PAID, LOC);
    expect(after.coins.eq(before.coins.sub(cost))).toBe(true);
    expect(after.ledger.today.marketing.toNumber()).toBeCloseTo(cost.toNumber(), 9);
    const post = lastPost(n);
    expect(post).toMatchObject({ format: PAID.id, minute: s.clock });
    expect(post.views).toBeGreaterThan(0);
    expect(post.followers).toBe(Math.round(post.views * PAID.conversion));
    expect(after.social.followers).toBe(before.social.followers + post.followers);
    expect(after.social.buzz).toBeCloseTo(before.social.buzz + post.views * SOCIAL.buzzPerView, 12);
    expect(after.social).toMatchObject({ postsToday: 1, bonusToday: 0, count: 1 });
    expect(n.stats.videos).toBe(s.stats.videos + 1);
  });

  it('Gratis-Video kostet nichts und taucht nicht in der Tagesbilanz auf', () => {
    const s = make();
    const n = postVideo(s, LOC, FREE.id);
    expect(loc(n).coins.eq(loc(s).coins)).toBe(true);
    expect(loc(n).ledger.today.marketing.toNumber()).toBe(0);
    expect(social(n).postsToday).toBe(1);
  });

  it(`Account zeigt die neuesten ${String(SOCIAL.recentMax)} Videos, neueste zuerst`, () => {
    let s = make();
    const total = SOCIAL.recentMax + 3;
    for (let i = 0; i < total; i++) {
      s = postVideo(withSocial({ ...s, clock: s.clock + 1 }, { postsToday: 0 }), LOC, FREE.id);
    }
    const recent = social(s).recent;
    expect(recent).toHaveLength(SOCIAL.recentMax);
    expect(recent.map((p) => p.minute)).toEqual(
      Array.from({ length: SOCIAL.recentMax }, (_, i) => s.clock - i),
    );
    expect(social(s).count).toBe(total);
    expect(s.stats.videos).toBe(total);
  });

  it('deterministisch: gleicher Stand → gleiches Video; später posten würfelt nicht neu', () => {
    const s = make();
    expect(postVideo(s, LOC, VIRAL.id)).toEqual(postVideo(s, LOC, VIRAL.id));
    const later = postVideo({ ...s, clock: s.clock + 3 * HOUR }, LOC, VIRAL.id);
    expect(lastPost(later).views).toBe(lastPost(postVideo(s, LOC, VIRAL.id)).views);
    // Das n-te Video und ein anderer Spielstart würfeln neu.
    const byCount = new Set<number>();
    const byStart = new Set<number>();
    for (let i = 0; i < 20; i++) {
      byCount.add(lastPost(postVideo(withSocial(s, { count: i }), LOC, VIRAL.id)).views);
      byStart.add(lastPost(postVideo({ ...s, createdAt: i + 1 }, LOC, VIRAL.id)).views);
    }
    expect(byCount.size).toBeGreaterThan(1);
    expect(byStart.size).toBeGreaterThan(1);
  });

  it('Views streuen um die Vorschau (± spread), virale Videos × viral.min..max', () => {
    const s = make();
    const preview = previewVideo(loc(s), VIRAL).views;
    let viral = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const post = lastPost(postVideo(withSocial(s, { count: i }), LOC, VIRAL.id));
      const boost = post.viral ? SOCIAL.viral : { min: 1, max: 1 };
      expect(post.views).toBeGreaterThanOrEqual(
        Math.floor(preview * (1 - SOCIAL.spread) * boost.min),
      );
      expect(post.views).toBeLessThanOrEqual(Math.ceil(preview * (1 + SOCIAL.spread) * boost.max));
      expect(post.followers).toBe(Math.round(post.views * VIRAL.conversion));
      if (post.viral) viral++;
    }
    expect(viral).toBeGreaterThan(0);
    expect(viral).toBeLessThan(N);
  });

  it('viral geht ein Video etwa mit der Chance seines Formats', () => {
    const s = make();
    const N = 4000;
    const viralShare = (def: VideoFormatDef): number => {
      let viral = 0;
      for (let i = 0; i < N; i++) {
        if (lastPost(postVideo(withSocial(s, { count: i }), LOC, def.id)).viral) viral++;
      }
      return viral / N;
    };
    const p = VIRAL.viralChance;
    expect(p).toBeGreaterThan(0);
    expect(Math.abs(viralShare(VIRAL) - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / N));
    for (const def of VIDEO_FORMATS.filter((f) => f.viralChance === 0)) {
      expect(viralShare(def)).toBe(0);
    }
  });
});

describe('Bonus-Videos gegen Goldene Blätter', () => {
  it('über das Tageslimit hinaus, kosten Blätter (und das Video), eigener Tagesdeckel', () => {
    const leaves = SOCIAL.bonusVideoLeaves * (SOCIAL.maxBonusPerDay + 1);
    let s = withSocial(make({}, leaves), { postsToday: SOCIAL.postsPerDay });
    expect(postBlock(s, LOC, PAID.id)).toBe('limit');
    for (let i = 0; i < SOCIAL.maxBonusPerDay; i++) {
      expect(postBlock(s, LOC, PAID.id, true)).toBeNull();
      const n = postBonusVideo(s, LOC, PAID.id);
      expect(n.meta.goldenLeaves.toNumber()).toBe(
        s.meta.goldenLeaves.toNumber() - SOCIAL.bonusVideoLeaves,
      );
      expect(loc(n).coins.eq(loc(s).coins.sub(getVideoCost(PAID, LOC)))).toBe(true);
      expect(social(n)).toMatchObject({ bonusToday: i + 1, postsToday: SOCIAL.postsPerDay });
      expect(social(n).count).toBe(social(s).count + 1);
      expect(n.stats.videos).toBe(s.stats.videos + 1);
      s = n;
    }
    expect(postBlock(s, LOC, PAID.id, true)).toBe('limit');
    expect(postBonusVideo(s, LOC, PAID.id)).toBe(s);
    expect(s.meta.goldenLeaves.toNumber()).toBe(SOCIAL.bonusVideoLeaves);
  });

  it('zählt nicht gegen das Tageslimit; ohne Blätter oder Geld geht nichts', () => {
    const rich = make({}, SOCIAL.bonusVideoLeaves);
    const n = postBonusVideo(rich, LOC, FREE.id);
    expect(postsLeftToday(loc(n))).toBe(SOCIAL.postsPerDay);
    expect(social(n).bonusToday).toBe(1);
    expect(n.meta.goldenLeaves.toNumber()).toBe(0);

    const cases: [GameState, string, string][] = [
      [make({}, SOCIAL.bonusVideoLeaves - 1), FREE.id, 'money'],
      [make({ coins: D(0) }, SOCIAL.bonusVideoLeaves), PAID.id, 'money'],
      [make({ level: LATER.unlockCafeLevel - 1 }, SOCIAL.bonusVideoLeaves), LATER.id, 'locked'],
      [make({}, SOCIAL.bonusVideoLeaves), 'nope', 'locked'],
    ];
    for (const [s, id, reason] of cases) {
      expect(postBlock(s, LOC, id, true)).toBe(reason);
      expect(postBonusVideo(s, LOC, id)).toBe(s);
    }
  });
});

describe('Tageswechsel', () => {
  const k = 1 - SOCIAL.decayPerDayWithoutPost;

  it('neuer Tag: Zähler auf null; ohne Video am Vortag gehen Follower verloren', () => {
    const idle: SocialState = { ...createSocial(0), followers: 10_000, buzz: 0.2, count: 7 };
    expect(rolloverSocial(idle, at(0, 23))).toBe(idle);
    const next = rolloverSocial(idle, at(1, 0));
    expect(next).toMatchObject({ day: 1, postsToday: 0, bonusToday: 0, buzz: 0.2, count: 7 });
    expect(next.followers).toBe(Math.round(10_000 * k));
    expect(next.followers).toBeLessThan(idle.followers);

    for (const posted of [
      { postsToday: 2, bonusToday: 1 },
      { postsToday: 0, bonusToday: 1 },
    ]) {
      const r = rolloverSocial({ ...idle, ...posted }, at(1, 0));
      expect(r).toMatchObject({ day: 1, postsToday: 0, bonusToday: 0, followers: 10_000 });
    }
    // Rückwärts oder derselbe Tag ändert nichts.
    expect(rolloverSocial(next, at(0, 12))).toBe(next);
  });

  it('im Café-Betrieb: um Mitternacht neuer Tag, Verlust nur nach Tagen ohne Video', () => {
    const s = withSocial(make(), { followers: 10_000 });
    const idle = runUntil(s, at(2, MORNING));
    expect(social(idle).day).toBe(2);
    expect(social(idle).followers).toBe(Math.round(Math.round(10_000 * k) * k));

    const posted = postVideo(s, LOC, FREE.id);
    const active = runUntil(posted, at(2, MORNING));
    expect(social(active)).toMatchObject({ day: 2, postsToday: 0 });
    expect(social(active).followers).toBe(Math.round(social(posted).followers * k));
  });
});

describe('Buzz (Nachfrage-Schub frischer Videos)', () => {
  it(`halbiert sich alle ${String(SOCIAL.buzzHalfLifeHours)} Spielstunden`, () => {
    const s: SocialState = { ...createSocial(), buzz: 0.4 };
    const h = SOCIAL.buzzHalfLifeHours;
    expect(decayBuzz(s, h).buzz).toBeCloseTo(0.2, 12);
    expect(decayBuzz(s, 2 * h).buzz).toBeCloseTo(0.1, 12);
    expect(decayBuzz(decayBuzz(s, h / 4), (3 * h) / 4).buzz).toBeCloseTo(0.2, 12);
    expect(decayBuzz(s, 0)).toBe(s);
    const none = createSocial();
    expect(decayBuzz(none, h)).toBe(none);
    expect(decayBuzz({ ...s, buzz: 1e-6 }, h).buzz).toBe(0);
  });

  it('klingt im Café-Betrieb ab, egal ob geöffnet oder nachts', () => {
    const h = SOCIAL.buzzHalfLifeHours;
    const s = withSocial(make(), { buzz: 0.4 });
    expect(social(runUntil(s, s.clock + h * HOUR)).buzz).toBeCloseTo(0.2, 9);
    const closed = at(0, OPENING_HOURS.default.close);
    const night = { ...s, clock: closed, hourMark: Math.floor(closed / HOUR) };
    expect(social(runUntil(night, closed + h * HOUR)).buzz).toBeCloseTo(0.2, 9);
  });

  it('hebt die Nachfrage, höchstens um buzzMax', () => {
    const demand = (buzz: number): number =>
      computeLocationRates(withSocial(make(), { buzz }), LOC, { influencerHype: false }).demand;
    const d0 = demand(0);
    expect(d0).toBeGreaterThan(0);
    const small = BALANCE.demand.buzzMax / 2;
    expect(demand(small) / d0).toBeCloseTo(1 + small, 9);
    expect(demand(BALANCE.demand.buzzMax * 10) / d0).toBeCloseTo(1 + BALANCE.demand.buzzMax, 9);
  });
});

describe('Social-Media-Manager', () => {
  it('postet zu festen Stunden: Stufe n → die ersten n Stunden aus managerPostHours', () => {
    for (let level = 0; level <= SOCIAL_ROLE.maxLevel; level++) {
      const s = withStaff(make(), { socialMedia: level });
      const hours = SOCIAL.managerPostHours.slice(0, level);
      for (let h = 0; h < 24; h++) {
        const n = managerPostStep(s, LOC, h);
        if (hours.includes(h)) {
          expect(social(n).postsToday).toBe(1);
          expect(n.stats.videos).toBe(s.stats.videos + 1);
        } else expect(n).toBe(s);
      }
    }
  });

  it('nimmt das erlaubte Format mit den meisten neuen Followern je Euro', () => {
    const h = SOCIAL.managerPostHours[0] ?? 0;
    for (const coins of [D(1e6), D(0)]) {
      const s = withStaff(make({ coins }), { socialMedia: 1 });
      const allowed = VIDEO_FORMATS.filter((f) => postBlock(s, LOC, f.id) === null);
      const value = (f: VideoFormatDef): number =>
        previewVideo(loc(s), f).followers / (1 + getVideoCost(f, LOC).toNumber());
      const best = allowed.reduce((a, f) => (value(f) > value(a) ? f : a));
      const post = lastPost(managerPostStep(s, LOC, h));
      expect(post.format).toBe(best.id);
      if (coins.eq(0)) expect(getVideoFormat(post.format)?.cost).toBe(0);
    }
  });

  it('hält sich an das Tageslimit', () => {
    const h = SOCIAL.managerPostHours[0] ?? 0;
    const s = withSocial(withStaff(make(), { socialMedia: SOCIAL_ROLE.maxLevel }), {
      postsToday: SOCIAL.postsPerDay,
    });
    expect(managerPostStep(s, LOC, h)).toBe(s);
  });

  it('im Café-Betrieb: Stufe n postet n Videos am Tag, der Account wächst ohne Verlust', () => {
    const level = Math.min(
      SOCIAL_ROLE.maxLevel,
      SOCIAL.managerPostHours.length,
      SOCIAL.postsPerDay,
    );
    const s = withStaff(make(), { socialMedia: level });
    const n = runUntil(s, at(1, MORNING));
    expect(n.stats.videos).toBe(level);
    const recent = social(n).recent;
    expect(recent).toHaveLength(Math.min(level, SOCIAL.recentMax));
    const hours = recent.map((p) => hourOf(p.minute));
    expect([...hours].sort((a, b) => a - b)).toEqual(
      [...SOCIAL.managerPostHours.slice(0, level)].sort((a, b) => a - b),
    );
    const gained = recent.reduce((a, p) => a + p.followers, 0);
    expect(social(n).followers).toBe(social(s).followers + gained);
  });
});

describe('Follower bringen Gäste', () => {
  const f = BALANCE.demand.followers;

  it('followerDemandMult: 1 ohne Follower, steigt mit abnehmendem Zuwachs, sättigt bei 1 + max', () => {
    expect(followerDemandMult(0)).toBe(1);
    expect(followerDemandMult(-50)).toBe(1);
    expect(followerDemandMult(f.half)).toBeCloseTo(1 + f.max / 2, 12);
    let prev = 1;
    for (const n of [10, 100, 1_000, 10_000, 100_000, 1e6, 1e9]) {
      const m = followerDemandMult(n);
      expect(m).toBeGreaterThan(prev);
      expect(m).toBeLessThan(1 + f.max);
      prev = m;
    }
    expect(followerDemandMult(1e15)).toBeCloseTo(1 + f.max, 6);
    const step = 10_000;
    expect(followerDemandMult(1e6 + step) - followerDemandMult(1e6)).toBeLessThan(
      followerDemandMult(step) - followerDemandMult(0),
    );
  });

  it('mehr Follower → mehr Nachfrage im Café, höchstens × (1 + max)', () => {
    const demand = (followers: number): number =>
      computeLocationRates(withSocial(make(), { followers }), LOC, { influencerHype: false })
        .demand;
    const d0 = demand(0);
    expect(d0).toBeGreaterThan(0);
    for (const n of [1_000, 50_000, 1e7]) {
      expect(demand(n) / d0).toBeCloseTo(followerDemandMult(n), 9);
    }
    expect(demand(1e7)).toBeGreaterThan(demand(50_000));
    expect(demand(1e15) / d0).toBeLessThanOrEqual(1 + f.max + 1e-9);
  });
});
