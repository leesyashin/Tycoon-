import type { Store } from '@core/store';
import type { Settings } from '@core/GameState';
import { MUSIC, SFX, SFX_MIN_GAP_SEC, type SfxId } from '@data/audio';

export interface Audio {
  play(id: SfxId): void;
}

/**
 * Klänge per Web Audio, zur Laufzeit synthetisiert (keine Audiodateien, CC0, siehe docs/ASSETS.md).
 * Autoplay-Policy: der AudioContext entsteht erst bei der ersten Interaktion (Tap/Taste).
 * Lautstärke und Schalter kommen aus `settings`; die UI ändert sie nur über `updateSettings`.
 */
export function createAudio(store: Store, target: EventTarget = window): Audio {
  let ctx: AudioContext | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let musicTimer: number | undefined;
  let nextBar = 0;
  let bar = 0;
  const lastPlayed = new Map<SfxId, number>();
  let settings: Settings = store.getState().settings;

  const apply = (): void => {
    if (!ctx || !sfxBus || !musicBus) return;
    const now = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(settings.sfx ? settings.sfxVolume : 0, now, 0.05);
    musicBus.gain.setTargetAtTime(settings.music ? settings.musicVolume : 0, now, 0.3);
    if (settings.music && settings.musicVolume > 0) startMusic();
    else stopMusic();
  };

  const unlock = (): void => {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return;
    }
    const Ctor = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctor) return;
    ctx = new Ctor();
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0;
    sfxBus.connect(ctx.destination);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = MUSIC.lowpassHz;
    lowpass.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(lowpass);
    apply();
  };
  target.addEventListener('pointerdown', unlock);
  target.addEventListener('keydown', unlock);

  store.subscribe((s) => {
    if (s.settings === settings) return;
    settings = s.settings;
    apply();
  });

  const note = (
    bus: GainNode,
    f: number,
    at: number,
    dur: number,
    gain: number,
    wave: OscillatorType,
  ): void => {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  };

  /** Plant einen Takt des Loops: Pad (Akkord), Bass, gedämpftes Arpeggio. */
  const scheduleBar = (at: number): void => {
    if (!musicBus) return;
    const beat = 60 / MUSIC.bpm;
    const len = beat * MUSIC.beatsPerChord;
    const chord = MUSIC.chords[bar % MUSIC.chords.length] ?? MUSIC.chords[0];
    bar++;
    for (const f of chord) note(musicBus, f, at, len * 0.98, MUSIC.padGain, 'sine');
    note(musicBus, chord[0] / 2, at, beat * 1.5, MUSIC.bassGain, 'triangle');
    note(musicBus, chord[0] / 2, at + beat * 2, beat * 1.5, MUSIC.bassGain, 'triangle');
    const arp = [chord[1], chord[2], chord[3], chord[2]];
    arp.forEach((f, i) =>
      note(
        musicBus as GainNode,
        f * 2,
        at + i * beat + beat * 0.5,
        beat * 0.6,
        MUSIC.arpGain,
        'triangle',
      ),
    );
  };

  function startMusic(): void {
    if (!ctx || musicTimer !== undefined) return;
    nextBar = ctx.currentTime + 0.1;
    const lookahead = (): void => {
      if (!ctx) return;
      const len = (60 / MUSIC.bpm) * MUSIC.beatsPerChord;
      while (nextBar < ctx.currentTime + len) {
        scheduleBar(nextBar);
        nextBar += len;
      }
    };
    lookahead();
    musicTimer = window.setInterval(lookahead, 500);
  }

  function stopMusic(): void {
    if (musicTimer === undefined) return;
    window.clearInterval(musicTimer);
    musicTimer = undefined;
  }

  return {
    play(id) {
      if (!ctx || !sfxBus || !settings.sfx || settings.sfxVolume <= 0) return;
      const now = ctx.currentTime;
      if (now - (lastPlayed.get(id) ?? -1) < SFX_MIN_GAP_SEC) return;
      lastPlayed.set(id, now);
      for (const s of SFX[id]) note(sfxBus, s.f, now + s.at, s.dur, s.gain, s.wave);
    },
  };
}
