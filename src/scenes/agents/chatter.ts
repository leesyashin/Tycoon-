import { CHATTER, type ChatTopics, type EmoteId } from '@data/art';
import type { WeatherKind } from '@data/weather';
import type { Agent } from './crowd';

/** Sprechblase über einer Figur. `agent` ≥ 0: Gast (Agent-ID); < 0: Verkäufer an der Kasse (−1 = erste Figur). */
export interface ChatBubble {
  readonly agent: number;
  readonly kind: EmoteId;
  /** Sekunden seit dem Erscheinen. */
  age: number;
  readonly life: number;
}

/** Was die Gespräche färbt: das Wetter und wie zufrieden die Gäste sind (0..100). */
export interface ChatContext {
  weather: WeatherKind;
  satisfaction: number;
}

interface Talk {
  readonly a: number;
  readonly b: number;
  /** Wer als Nächstes spricht: 0 = `a`, 1 = `b`. */
  turn: 0 | 1;
  /** Sekunden bis zum nächsten Beitrag. */
  wait: number;
  seen: boolean;
}

const between = (rng: () => number, r: { min: number; max: number }): number =>
  r.min + rng() * (r.max - r.min);

/**
 * Gespräche der Gäste (rein kosmetisch, UI_STYLE § 4 „Leben in der Szene“): Wer zu zweit an einem Tisch oder
 * nebeneinander auf den Barhockern sitzt, redet abwechselnd in Sprechblasen; wer allein sitzt, schaut ab und zu
 * aufs Handy oder freut sich über den Matcha; in der Schlange plaudern Nachbarn kurz. Themen nach Gewicht
 * (`CHATTER`), das Wetter redet mit, Herzen gibt es mehr, je zufriedener die Gäste sind. Höchstens
 * `CHATTER.maxBubbles` Blasen gleichzeitig. Kein Phaser-Import, damit testbar.
 */
export class Chatter {
  readonly bubbles: ChatBubble[] = [];
  private readonly talks = new Map<string, Talk>();
  private readonly solo = new Map<number, number>();
  private queueWait: number;

  constructor(private readonly rng: () => number = Math.random) {
    this.queueWait = between(rng, CHATTER.queueGap);
  }

  /** Spricht diese Figur gerade? */
  speaking(agent: number): boolean {
    return this.bubbles.some((b) => b.agent === agent);
  }

  /** Blase von außen (Stammgast winkt, die Kasse grüßt zurück); ersetzt eine laufende derselben Figur. */
  say(agent: number, kind: EmoteId, life: number = CHATTER.bubbleSec): void {
    const i = this.bubbles.findIndex((b) => b.agent === agent);
    if (i >= 0) this.bubbles.splice(i, 1);
    this.bubbles.push({ agent, kind, age: 0, life });
  }

  /**
   * Ein Schritt: Blasen altern, Gespräche gehen weiter. `agents`: alle Gast-Figuren; `queue`: die sichtbaren
   * Wartenden in Reihenfolge (vorn zuerst).
   */
  update(dt: number, agents: readonly Agent[], queue: readonly Agent[], ctx: ChatContext): void {
    for (const b of this.bubbles) b.age += dt;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      if (b && b.age >= b.life) this.bubbles.splice(i, 1);
    }
    const { pairs, alone } = this.seating(agents);
    for (const t of this.talks.values()) t.seen = false;
    for (const [a, b, where] of pairs) {
      const key = `${where}:${String(a)}:${String(b)}`;
      let talk = this.talks.get(key);
      if (!talk) {
        talk = {
          a,
          b,
          turn: this.rng() < 0.5 ? 0 : 1,
          wait: between(this.rng, CHATTER.firstWait),
          seen: true,
        };
        this.talks.set(key, talk);
      }
      talk.seen = true;
      talk.wait -= dt;
      if (talk.wait > 0) continue;
      const speaker = talk.turn === 0 ? talk.a : talk.b;
      if (!this.room()) {
        talk.wait = 0.4;
        continue;
      }
      const kind = this.pick(CHATTER.pairTopics, ctx);
      if (kind) this.say(speaker, kind);
      talk.turn = talk.turn === 0 ? 1 : 0;
      const p = CHATTER.longPause;
      talk.wait =
        CHATTER.bubbleSec * 0.6 +
        (this.rng() < p.chance ? between(this.rng, p) : between(this.rng, CHATTER.turnGap));
    }
    for (const [key, t] of this.talks) if (!t.seen) this.talks.delete(key);

    const lonely = new Set(alone);
    for (const id of [...this.solo.keys()]) if (!lonely.has(id)) this.solo.delete(id);
    for (const id of alone) {
      const wait = (this.solo.get(id) ?? between(this.rng, CHATTER.soloGap) * 0.5) - dt;
      if (wait > 0) {
        this.solo.set(id, wait);
        continue;
      }
      if (!this.room() || this.speaking(id)) {
        this.solo.set(id, 0.5);
        continue;
      }
      const kind = this.pick(CHATTER.soloTopics, ctx);
      if (kind) this.say(id, kind);
      this.solo.set(id, between(this.rng, CHATTER.soloGap));
    }

    this.queueWait -= dt;
    if (this.queueWait <= 0) {
      this.queueWait = between(this.rng, CHATTER.queueGap);
      this.queueChat(queue, ctx);
    }
  }

  /** Zwei Nachbarn in der Schlange: einer fängt an, der andere antwortet etwas später. */
  private queueChat(queue: readonly Agent[], ctx: ChatContext): void {
    if (queue.length < 2 || this.bubbles.length + 2 > CHATTER.maxBubbles) return;
    const i = Math.floor(this.rng() * (queue.length - 1));
    const first = queue[i];
    const second = queue[i + 1];
    if (!first || !second || this.speaking(first.id) || this.speaking(second.id)) return;
    const a = this.pick(CHATTER.queueTopics, ctx);
    const b = this.pick(CHATTER.queueTopics, ctx);
    if (a) this.say(first.id, a);
    // Die Antwort erscheint verzögert: negatives Alter heißt „noch nicht zu sehen“.
    if (b)
      this.bubbles.push({
        agent: second.id,
        kind: b,
        age: -CHATTER.queueReply,
        life: CHATTER.bubbleSec,
      });
  }

  /** Paare (Tisch, Barhocker nebeneinander) und wer allein sitzt. */
  private seating(agents: readonly Agent[]): {
    pairs: [number, number, string][];
    alone: number[];
  } {
    const byTable = new Map<number, Agent[]>();
    const stools: Agent[] = [];
    for (const a of agents) {
      if (!a.active || a.phase !== 'consume') continue;
      if (a.stool >= 0) stools.push(a);
      else if (a.table >= 0) {
        const at = byTable.get(a.table);
        if (at) at.push(a);
        else byTable.set(a.table, [a]);
      }
    }
    const pairs: [number, number, string][] = [];
    const alone: number[] = [];
    for (const [t, list] of byTable) {
      const [a, b] = list;
      if (a && b) pairs.push([a.id, b.id, `t${String(t)}`]);
      else if (a) alone.push(a.id);
    }
    stools.sort((x, y) => x.stool - y.stool);
    for (let i = 0; i < stools.length; i++) {
      const a = stools[i];
      const b = stools[i + 1];
      if (!a) continue;
      if (b && b.stool === a.stool + 1) {
        pairs.push([a.id, b.id, `s${String(a.stool)}`]);
        i++;
      } else alone.push(a.id);
    }
    return { pairs, alone };
  }

  private room(): boolean {
    return this.bubbles.length < CHATTER.maxBubbles;
  }

  /** Thema nach Gewicht; `weather` wird Sonne bzw. Regen, `happy` ein Herz (je zufriedener, desto öfter). */
  private pick(topics: ChatTopics, ctx: ChatContext): EmoteId | null {
    const options: [EmoteId, number][] = [];
    for (const [key, weight] of Object.entries(topics) as [string, number][]) {
      if (weight <= 0) continue;
      if (key === 'weather') {
        if (ctx.weather === 'sun') options.push(['sun', weight]);
        else if (ctx.weather === 'rain') options.push(['rain', weight]);
      } else if (key === 'happy') {
        const glad = Math.min(1.6, Math.max(0, (ctx.satisfaction / 100) * 2 - 0.4));
        if (glad > 0) options.push(['heart', weight * glad]);
      } else options.push([key as EmoteId, weight]);
    }
    const total = options.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return null;
    let r = this.rng() * total;
    for (const [kind, w] of options) {
      r -= w;
      if (r < 0) return kind;
    }
    return options[options.length - 1]?.[0] ?? null;
  }
}
