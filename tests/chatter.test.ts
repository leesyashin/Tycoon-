import { describe, expect, it } from 'vitest';
import { CHATTER, COURIER, type EmoteId } from '@data/art';
import { Chatter, type ChatContext } from '@scenes/agents/chatter';
import type { Agent, CustomerPhase } from '@scenes/agents/crowd';
import { boxesFor } from '@scenes/cafeStreet';

function lcg(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Gast-Figur mit den Feldern, die die Gespräche lesen. */
function guest(id: number, patch: Partial<Agent> = {}): Agent {
  return {
    id,
    active: true,
    type: 'student',
    look: 'softboy',
    phase: 'consume' as CustomerPhase,
    x: 0,
    y: 0,
    path: [],
    timer: 0,
    serveTotal: 0,
    table: -1,
    seat: 0,
    stool: -1,
    spot: 0,
    pickup: false,
    waited: 0,
    jx: 0,
    jy: 0,
    goal: { x: 0, y: 0 },
    pace: 1,
    fade: 1,
    item: null,
    carry: null,
    vehicle: -1,
    regular: -1,
    greeted: false,
    ...patch,
  };
}

const sunny: ChatContext = { weather: 'sun', satisfaction: 70 };

/** Alle Blasen, die in `seconds` erscheinen (je Figur und Thema). */
function listen(
  chatter: Chatter,
  agents: Agent[],
  queue: Agent[],
  ctx: ChatContext,
  seconds: number,
  cap: number = CHATTER.maxBubbles,
): { agent: number; kind: EmoteId }[] {
  const said: { agent: number; kind: EmoteId }[] = [];
  const shown = new Set<object>();
  for (let t = 0; t < seconds * 30; t++) {
    chatter.update(1 / 30, agents, queue, ctx);
    expect(chatter.bubbles.length).toBeLessThanOrEqual(cap);
    for (const b of chatter.bubbles)
      if (b.age >= 0 && !shown.has(b)) {
        shown.add(b);
        said.push({ agent: b.agent, kind: b.kind });
      }
  }
  return said;
}

describe('Gespräche der Gäste (kosmetisch)', () => {
  it('zu zweit am Tisch reden beide abwechselnd', () => {
    const a = guest(1, { table: 2, seat: 0 });
    const b = guest(2, { table: 2, seat: 1 });
    const said = listen(new Chatter(lcg(3)), [a, b], [], sunny, 60);
    expect(said.length).toBeGreaterThan(8);
    expect(new Set(said.map((s) => s.agent))).toEqual(new Set([1, 2]));
    // Meist wechseln sich die beiden ab (nur Schweigen dazwischen, kein Monolog).
    let switches = 0;
    for (let i = 1; i < said.length; i++) if (said[i]?.agent !== said[i - 1]?.agent) switches++;
    expect(switches / (said.length - 1)).toBeGreaterThan(0.9);
    // Themen aus der Liste für Paare; bei Sonne ist auch die Sonne ein Thema, Regen nie.
    const allowed = new Set<EmoteId>(['chat', 'laugh', 'matcha', 'phone', 'note', 'sun', 'heart']);
    for (const s of said) expect(allowed.has(s.kind)).toBe(true);
  });

  it('nebeneinander auf den Barhockern ist ein Paar, mit Lücke dazwischen nicht', () => {
    const pair = [guest(1, { stool: 4 }), guest(2, { stool: 5 })];
    const apart = [guest(3, { stool: 0 }), guest(4, { stool: 2 })];
    const chatter = new Chatter(lcg(5));
    const said = listen(chatter, [...pair, ...apart], [], sunny, 90);
    const by = (id: number) => said.filter((s) => s.agent === id).length;
    // Das Paar redet deutlich öfter als die beiden, die allein sitzen.
    expect(by(1) + by(2)).toBeGreaterThan(1.5 * (by(3) + by(4)));
    expect(by(3)).toBeGreaterThan(0);
  });

  it('allein am Tisch: ab und zu Handy, Matcha oder Note, viel seltener als im Gespräch', () => {
    const solo = guest(7, { table: 0 });
    const said = listen(new Chatter(lcg(9)), [solo], [], sunny, 120);
    expect(said.length).toBeGreaterThan(3);
    expect(said.length).toBeLessThan(120 / CHATTER.soloGap.min + 2);
    const allowed = new Set<EmoteId>(['phone', 'matcha', 'note', 'star', 'heart']);
    for (const s of said) expect(allowed.has(s.kind)).toBe(true);
  });

  it('das Wetter redet mit: Regen bei Regen, bei Wolken weder Sonne noch Regen', () => {
    const table = (c: Chatter, ctx: ChatContext) =>
      listen(c, [guest(1, { table: 1 }), guest(2, { table: 1 })], [], ctx, 240).map((s) => s.kind);
    const rain = table(new Chatter(lcg(11)), { weather: 'rain', satisfaction: 70 });
    expect(rain).toContain('rain');
    expect(rain).not.toContain('sun');
    const clouds = table(new Chatter(lcg(11)), { weather: 'clouds', satisfaction: 70 });
    expect(clouds).not.toContain('rain');
    expect(clouds).not.toContain('sun');
  });

  it('je zufriedener, desto mehr Herzen; sehr unzufrieden keine', () => {
    const hearts = (satisfaction: number) =>
      listen(
        new Chatter(lcg(13)),
        [guest(1, { table: 1 }), guest(2, { table: 1 })],
        [],
        { weather: 'clouds', satisfaction },
        400,
      ).filter((s) => s.kind === 'heart').length;
    expect(hearts(15)).toBe(0);
    expect(hearts(95)).toBeGreaterThan(hearts(45));
  });

  it('in der Schlange plaudern Nachbarn: einer fängt an, der Nachbar antwortet etwas später', () => {
    const queue = [guest(1, { phase: 'queue' }), guest(2, { phase: 'queue' })];
    const chatter = new Chatter(lcg(17));
    let reply = false;
    for (let t = 0; t < 40 * 30; t++) {
      chatter.update(1 / 30, queue, queue, sunny);
      const [first, second] = chatter.bubbles;
      if (first && second && second.age < 0) {
        expect(first.agent).not.toBe(second.agent);
        reply = true;
      }
    }
    expect(reply).toBe(true);
  });

  it('nicht mehr als maxBubbles gleichzeitig, auch bei vollem Café; Grüße ersetzen die laufende Blase', () => {
    const agents: Agent[] = [];
    for (let t = 0; t < 12; t++) {
      agents.push(guest(t * 2, { table: t }), guest(t * 2 + 1, { table: t }));
    }
    const chatter = new Chatter(lcg(19));
    for (let i = 0; i < 60 * 30; i++) {
      chatter.update(1 / 30, agents, [], sunny);
      expect(chatter.bubbles.length).toBeLessThanOrEqual(CHATTER.maxBubbles);
    }
    // Grüße zählen nicht mit (die Szene hat dafür Platz), ersetzen aber die laufende Blase derselben Figur.
    chatter.say(-1, 'heart');
    chatter.say(-1, 'wave');
    expect(chatter.bubbles.filter((b) => b.agent === -1)).toHaveLength(1);
    expect(chatter.speaking(-1)).toBe(true);
    // Wer geht, beendet das Gespräch: dann gibt es für ihn keine neuen Blasen.
    const leaving = agents.map((a) => ({ ...a, active: false }));
    // Laufende Blasen dürfen noch auslaufen, danach kommen keine neuen.
    listen(chatter, leaving, [], sunny, CHATTER.bubbleSec + 0.5, CHATTER.maxBubbles + 1);
    const later = listen(chatter, leaving, [], sunny, 10);
    expect(later.filter((s) => s.agent >= 0)).toHaveLength(0);
  });
});

describe('Lieferant: Kartons je Lieferung', () => {
  it('bis 500 g einer, bis 2 kg zwei, darüber drei', () => {
    expect(boxesFor(250)).toBe(1);
    expect(boxesFor(500)).toBe(1);
    expect(boxesFor(1000)).toBe(2);
    expect(boxesFor(2000)).toBe(2);
    expect(boxesFor(5000)).toBe(3);
    expect(boxesFor(50_000)).toBe(COURIER.maxBoxes);
  });
});
