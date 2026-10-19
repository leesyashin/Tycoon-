import type { Store } from '@core/store';
import type { Settings } from '@core/GameState';
import {
  AMBIENT_SOUND,
  MUSIC,
  SFX,
  SFX_GAP_SEC,
  SFX_MIN_GAP_SEC,
  type AmbientLevels,
  type NoiseStep,
  type SfxId,
} from '@data/audio';

export interface Audio {
  play(id: SfxId): void;
  /** Laufende Geräusche der Szene (Regen, Gemurmel) 0..1; vor der ersten Berührung gemerkt, dann eingeblendet. */
  setAmbient(levels: AmbientLevels): void;
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
  /** Weißes Rauschen (einmal je AudioContext) für Zischen, Regen und Gemurmel. */
  let noise: AudioBuffer | null = null;
  let ambientBus: GainNode | null = null;
  let rainGain: GainNode | null = null;
  /** Stimm-Bänder des Gemurmels und wann ihre nächste Silbe beginnt (AudioContext-Zeit). */
  const voices: { gain: GainNode; next: number }[] = [];
  let ambient: AmbientLevels = { rain: 0, murmur: 0 };

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
    applyAmbient();
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

  const noiseBuffer = (): AudioBuffer | null => {
    if (!ctx) return null;
    if (noise) return noise;
    const len = Math.floor(ctx.sampleRate * AMBIENT_SOUND.noiseSec);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  };

  /** Rauschen in Schleife, ab einer Stelle im Puffer (sonst klängen gleichzeitige Rauschquellen gleich). */
  const noiseSource = (
    buf: AudioBuffer,
    at: number,
    offset: number,
  ): AudioBufferSourceNode | null => {
    if (!ctx) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(at, offset % buf.duration);
    return src;
  };

  /** Zischen: Rauschen durch einen gleitenden Bandpass, weich ein- und ausgeblendet. */
  const hiss = (bus: GainNode, s: NoiseStep, now: number): void => {
    const buf = noiseBuffer();
    if (!ctx || !buf) return;
    const at = now + s.at;
    const src = noiseSource(buf, at, Math.random() * buf.duration);
    if (!src) return;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = s.q;
    band.frequency.setValueAtTime(s.from, at);
    band.frequency.linearRampToValueAtTime(s.to, at + s.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(s.gain, at + s.attack);
    g.gain.setValueAtTime(s.gain, at + s.dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, at + s.dur);
    src.connect(band).connect(g).connect(bus);
    src.stop(at + s.dur + 0.05);
  };

  /**
   * Regen- und Gemurmel-Schleifen, beim ersten Bedarf gebaut (danach laufen sie leise weiter): Regen = Rauschen
   * zwischen Hoch- und Tiefpass, Gemurmel = drei Stimm-Bänder, deren Lautstärke `scheduleVoices` im Silbentakt setzt.
   */
  const buildAmbient = (): void => {
    const buf = noiseBuffer();
    if (!ctx || !sfxBus || !buf || ambientBus) return;
    const a = AMBIENT_SOUND;
    ambientBus = ctx.createGain();
    ambientBus.connect(sfxBus);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = a.rain.highpassHz;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = a.rain.lowpassHz;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    noiseSource(buf, 0, 0)?.connect(high).connect(low).connect(rainGain).connect(ambientBus);
    a.murmur.bands.forEach((b, i) => {
      if (!ctx || !ambientBus) return;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = b.hz;
      band.Q.value = b.q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      noiseSource(buf, 0, (i + 1) * 0.37)
        ?.connect(band)
        .connect(gain)
        .connect(ambientBus);
      voices.push({ gain, next: ctx.currentTime });
    });
    window.setInterval(scheduleVoices, 150);
  };

  /** Silben des Gemurmels eine halbe Sekunde voraus: jedes Band springt zufällig lauter und leiser. */
  const scheduleVoices = (): void => {
    if (!ctx) return;
    const m = AMBIENT_SOUND.murmur;
    const level = ambient.murmur * m.gain;
    for (const v of voices) {
      while (v.next < ctx.currentTime + 0.5) {
        const at = Math.max(v.next, ctx.currentTime);
        v.gain.gain.setTargetAtTime(level * (1 - m.depth + m.depth * Math.random()), at, 0.035);
        v.next = at + m.syllableSec.min + Math.random() * (m.syllableSec.max - m.syllableSec.min);
      }
    }
  };

  const applyAmbient = (): void => {
    if (!ctx || (!ambientBus && ambient.rain <= 0 && ambient.murmur <= 0)) return;
    buildAmbient();
    rainGain?.gain.setTargetAtTime(
      ambient.rain * AMBIENT_SOUND.rain.gain,
      ctx.currentTime,
      AMBIENT_SOUND.fadeSec,
    );
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
      const gap = SFX_GAP_SEC[id] ?? SFX_MIN_GAP_SEC;
      if (now - (lastPlayed.get(id) ?? -Infinity) < gap) return;
      lastPlayed.set(id, now);
      for (const s of SFX[id]) {
        if ('noise' in s) hiss(sfxBus, s, now);
        else note(sfxBus, s.f, now + s.at, s.dur, s.gain, s.wave);
      }
    },
    setAmbient(levels) {
      ambient = {
        rain: Math.min(1, Math.max(0, levels.rain)),
        murmur: Math.min(1, Math.max(0, levels.murmur)),
      };
      applyAmbient();
    },
  };
}
