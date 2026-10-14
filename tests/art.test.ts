import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stationLookTier } from '@data/art';
import { STATIONS } from '@data/stations';
import { AMBIENCE } from '@data/ambience';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { STAFF_ROLES } from '@data/staff';

const common = JSON.parse(readFileSync('public/assets/sprites/common.json', 'utf8')) as {
  frames: Record<string, unknown>;
};

describe('Stations-Optik', () => {
  it('Stufen wechseln bei Level 25 und 100', () => {
    expect(stationLookTier(0)).toBe(1);
    expect(stationLookTier(24)).toBe(1);
    expect(stationLookTier(25)).toBe(2);
    expect(stationLookTier(99)).toBe(2);
    expect(stationLookTier(100)).toBe(3);
  });
});

describe('Atlas (pnpm art)', () => {
  it('enthält jede Station in 3 Stufen und 2 Blickrichtungen', () => {
    for (const s of STATIONS)
      for (const tier of [1, 2, 3])
        for (const f of ['a', 'b'])
          expect(common.frames[`station-${s.id}-${String(tier)}-${f}`]).toBeDefined();
  });
  it('enthält Ambiente, Kunden-Typen und Personal mit 2 Richtungen × 2 Frames', () => {
    for (const a of AMBIENCE) expect(common.frames[`ambience-${a.id}`]).toBeDefined();
    const walk = ['front-0', 'front-1', 'back-0', 'back-1'];
    for (const c of CUSTOMER_TYPES)
      for (const w of walk) expect(common.frames[`customer-${c.id}-${w}`]).toBeDefined();
    for (const r of STAFF_ROLES)
      for (const w of walk) expect(common.frames[`staff-${r.id}-${w}`]).toBeDefined();
  });
});
