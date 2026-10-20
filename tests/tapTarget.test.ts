import { describe, expect, it } from 'vitest';
import { LAYOUTS } from '@data/layouts';
import { AMBIENCE } from '@data/ambience';
import { STATIONS } from '@data/stations';
import { ambienceTarget, panelTarget, pickTapTarget, tableTarget } from '@scenes/tapTarget';

describe('Antippen in der Szene', () => {
  it('nimmt das oberste Objekt, das unter dem Finger sichtbar ist', () => {
    // Leerer Rahmen eines Tischs vor der Theke: die Theke ist gemeint.
    expect(
      pickTapTarget([
        { target: 'ambience:seats', solid: false },
        { target: 'register', solid: true },
        { target: 'ambience:decor', solid: true },
      ]),
    ).toBe('register');
  });

  it('knapp daneben zählt das oberste getroffene Objekt, ins Leere nichts', () => {
    expect(
      pickTapTarget([
        { target: 'oven', solid: false },
        { target: 'register', solid: false },
      ]),
    ).toBe('oven');
    expect(pickTapTarget([])).toBeNull();
  });

  it('Tische öffnen „Tische“, Terrassen-Tische die Terrasse', () => {
    for (const layout of Object.values(LAYOUTS)) {
      for (const p of layout.tables) {
        expect(tableTarget(p)).toBe(ambienceTarget(p.outside ? 'terrace' : 'seats'));
      }
    }
  });

  it('jedes antippbare Objekt hat ein Upgrade-Panel', () => {
    const ambience = new Set(AMBIENCE.map((a) => a.id));
    const stations = new Set(STATIONS.map((s) => s.id));
    for (const layout of Object.values(LAYOUTS)) {
      const targets = [
        ...layout.stations.map((s) => s.stationId),
        ...layout.tables.map(tableTarget),
        ...layout.ambience.map((a) => ambienceTarget(a.id)),
        ambienceTarget('decor'),
      ];
      for (const target of targets) {
        if (target.startsWith('ambience:')) {
          expect(ambience.has(target.slice('ambience:'.length)), target).toBe(true);
        } else expect(stations.has(target), target).toBe(true);
      }
    }
  });
});

describe('Kamera folgt dem offenen Objekt-Panel', () => {
  it('ein Objekt-Panel nennt dasselbe Ziel wie das Antippen, andere Panels keins', () => {
    for (const d of STATIONS) expect(panelTarget(`station:${d.id}`)).toBe(d.id);
    for (const a of AMBIENCE)
      expect(panelTarget(`station:ambience-${a.id}`)).toBe(ambienceTarget(a.id));
    for (const key of [undefined, 'shop', 'shop:ambience', 'staff', 'supply', 'stats', 'settings'])
      expect(panelTarget(key)).toBeNull();
  });
});
