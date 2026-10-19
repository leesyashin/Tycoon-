import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialState, type GameState } from '@core/GameState';
import { createStore } from '@core/store';
import { AMBIENT_SOUND, SFX, SFX_GAP_SEC, murmurLevel } from '@data/audio';
import { createAudio } from '../src/audio/audio';

/** Web Audio zum Nachzählen: Knoten merken sich Verbindungen, Parameter ihre geplanten Werte. */
class FakeParam {
  value = 0;
  readonly targets: { v: number; at: number }[] = [];
  readonly ramps: number[] = [];
  setValueAtTime(v: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number): this {
    this.ramps.push(v);
    return this;
  }
  exponentialRampToValueAtTime(v: number): this {
    this.ramps.push(v);
    return this;
  }
  setTargetAtTime(v: number, at: number): this {
    this.targets.push({ v, at });
    return this;
  }
}

class FakeNode {
  connect<T>(n: T): T {
    return n;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = '';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeOsc extends FakeNode {
  type = '';
  frequency = new FakeParam();
  start(): void {}
  stop(): void {}
}

class FakeBuffer {
  readonly duration: number;
  private readonly data: Float32Array;
  constructor(length: number, sampleRate: number) {
    this.duration = length / sampleRate;
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  start(): void {}
  stop(): void {}
}

class FakeCtx {
  static last: FakeCtx | null = null;
  currentTime = 0;
  sampleRate = 4000;
  state = 'running';
  destination = new FakeNode();
  readonly oscs: FakeOsc[] = [];
  readonly sources: FakeSource[] = [];
  readonly filters: FakeFilter[] = [];
  readonly gains: FakeGain[] = [];
  constructor() {
    FakeCtx.last = this;
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator(): FakeOsc {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBuffer(_channels: number, length: number, rate: number): FakeBuffer {
    return new FakeBuffer(length, rate);
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
}

/** Ohne Musik, damit nur die Geräusche zählen. */
function quietState(sfx = true): GameState {
  const s = createInitialState(0, 'de');
  return { ...s, settings: { ...s.settings, sfx, sfxVolume: 0.7, music: false } };
}

describe('Geräusche (Web Audio, selbst erzeugt)', () => {
  let ticks: (() => void)[] = [];
  beforeEach(() => {
    ticks = [];
    FakeCtx.last = null;
    vi.stubGlobal('window', {
      AudioContext: FakeCtx,
      setInterval: (fn: () => void) => {
        ticks.push(fn);
        return ticks.length;
      },
      clearInterval: () => undefined,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const unlocked = (sfx = true) => {
    const target = new EventTarget();
    const audio = createAudio(createStore(quietState(sfx)), target);
    target.dispatchEvent(new Event('pointerdown'));
    const ctx = FakeCtx.last;
    if (!ctx) throw new Error('kein AudioContext');
    return { audio, ctx };
  };

  it('Türglocke: zwei Anschläge mit Teiltönen, höchstens alle paar Sekunden', () => {
    const { audio, ctx } = unlocked();
    audio.play('doorBell');
    expect(ctx.oscs.map((o) => o.frequency.value)).toEqual(
      SFX.doorBell.map((s) => ('noise' in s ? NaN : s.f)),
    );
    // Viele Gäste nacheinander: die Glocke klingt nicht bei jedem.
    audio.play('doorBell');
    expect(ctx.oscs).toHaveLength(SFX.doorBell.length);
    ctx.currentTime = (SFX_GAP_SEC.doorBell ?? 0) + 0.01;
    audio.play('doorBell');
    expect(ctx.oscs).toHaveLength(SFX.doorBell.length * 2);
  });

  it('Milchschäumer: Rauschen durch einen Bandpass, der beim Aufschäumen höher wird', () => {
    const { audio, ctx } = unlocked();
    audio.play('steam');
    expect(ctx.oscs).toHaveLength(0);
    expect(ctx.sources.length).toBe(SFX.steam.length);
    const bands = ctx.filters.filter((f) => f.type === 'bandpass');
    expect(bands.length).toBe(SFX.steam.length);
    const first = SFX.steam[0];
    if (!first || !('noise' in first)) throw new Error('kein Zischen');
    expect(bands[0]?.frequency.value).toBe(first.from);
    expect(bands[0]?.frequency.ramps).toContain(first.to);
  });

  it('ohne Effekte (Einstellung) und vor der ersten Berührung bleibt es still', () => {
    const { audio, ctx } = unlocked(false);
    audio.play('doorBell');
    audio.play('steam');
    expect(ctx.oscs).toHaveLength(0);
    expect(ctx.sources).toHaveLength(0);
    const target = new EventTarget();
    FakeCtx.last = null;
    createAudio(createStore(quietState()), target).play('doorBell');
    expect(FakeCtx.last).toBeNull();
  });

  it('Regen und Gemurmel laufen leise mit: so laut wie der Regen bzw. wie viele Gäste drin sind', () => {
    const { audio, ctx } = unlocked();
    // Nichts zu hören: keine Schleifen.
    audio.setAmbient({ rain: 0, murmur: 0 });
    expect(ctx.sources).toHaveLength(0);
    audio.setAmbient({ rain: 1, murmur: 0 });
    // Regen + drei Stimm-Bänder, je eine Rausch-Schleife (zuletzt gebaut: Regen-Lautstärke, dann die Stimmen).
    const bands = AMBIENT_SOUND.murmur.bands.length;
    expect(ctx.sources).toHaveLength(1 + bands);
    expect(ctx.sources.every((s) => s.loop)).toBe(true);
    const voices = ctx.gains.slice(-bands);
    const rain = ctx.gains[ctx.gains.length - bands - 1];
    expect(rain?.gain.targets.at(-1)?.v).toBeCloseTo(AMBIENT_SOUND.rain.gain, 9);
    // Silben planen: ohne Gäste bleiben die Stimmen stumm …
    for (const tick of ticks) tick();
    const voiceTargets = () => voices.flatMap((g) => g.gain.targets.map((t) => t.v));
    expect(voiceTargets().length).toBeGreaterThan(0);
    expect(Math.max(...voiceTargets())).toBe(0);
    // … mit vollem Café murmeln sie zwischen leise und laut.
    audio.setAmbient({ rain: 0, murmur: 1 });
    ctx.currentTime = 2;
    for (const tick of ticks) tick();
    const m = AMBIENT_SOUND.murmur;
    const loud = voiceTargets().filter((v) => v > 0);
    expect(loud.length).toBeGreaterThan(3);
    for (const v of loud) {
      expect(v).toBeGreaterThanOrEqual(m.gain * (1 - m.depth) - 1e-9);
      expect(v).toBeLessThanOrEqual(m.gain + 1e-9);
    }
    expect(rain?.gain.targets.at(-1)?.v).toBe(0);
  });

  it('Gemurmel wächst mit den Gästen im Raum bis zum vollen Café', () => {
    expect(murmurLevel(0)).toBe(0);
    expect(murmurLevel(AMBIENT_SOUND.murmur.fullAt / 2)).toBeCloseTo(0.5, 9);
    expect(murmurLevel(AMBIENT_SOUND.murmur.fullAt * 3)).toBe(1);
  });
});
