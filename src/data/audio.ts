/**
 * Klang-Konstanten (S8). Alle Töne werden zur Laufzeit per Web Audio synthetisiert (keine Audiodateien,
 * siehe docs/ASSETS.md). Frequenzen in Hz, Zeiten in Sekunden, Lautstärken 0..1.
 */
export const AUDIO_DEFAULTS = { sfxVolume: 0.7, musicVolume: 0.4 } as const;

export type SfxId =
  'buy' | 'coin' | 'tap' | 'unlock' | 'error' | 'eventStart' | 'eventEnd' | 'leaf' | 'boost';

export interface ToneStep {
  /** Frequenz in Hz. */
  f: number;
  /** Start relativ zum Auslösen. */
  at: number;
  dur: number;
  /** Relative Lautstärke 0..1. */
  gain: number;
  wave: OscillatorType;
}

const tone = (
  f: number,
  at: number,
  dur: number,
  gain = 0.6,
  wave: OscillatorType = 'triangle',
) => ({
  f,
  at,
  dur,
  gain,
  wave,
});

export const SFX: Readonly<Record<SfxId, readonly ToneStep[]>> = {
  buy: [tone(660, 0, 0.08), tone(990, 0.06, 0.12)],
  coin: [tone(1320, 0, 0.05, 0.25, 'sine'), tone(1760, 0.04, 0.08, 0.2, 'sine')],
  tap: [tone(520, 0, 0.05, 0.3, 'sine')],
  unlock: [tone(523, 0, 0.12), tone(659, 0.1, 0.12), tone(784, 0.2, 0.12), tone(1047, 0.3, 0.25)],
  error: [tone(220, 0, 0.12, 0.5, 'square'), tone(175, 0.1, 0.18, 0.5, 'square')],
  eventStart: [tone(784, 0, 0.1), tone(1047, 0.1, 0.2)],
  eventEnd: [tone(1047, 0, 0.1), tone(784, 0.1, 0.1), tone(1319, 0.2, 0.25)],
  leaf: [tone(1568, 0, 0.06, 0.3, 'sine'), tone(2093, 0.05, 0.12, 0.25, 'sine')],
  boost: [tone(392, 0, 0.1), tone(587, 0.08, 0.1), tone(784, 0.16, 0.2)],
};

/** Mindestabstand gleicher Klänge (z. B. Münzen bei vielen Kunden). */
export const SFX_MIN_GAP_SEC = 0.12;

/**
 * Lo-fi-Loop: 4 Akkorde (Dur-7/Moll-7, ii–V–I–vi in F), weiche Sinus-Pads, gedämpftes Rhodes-Arpeggio.
 * Frequenzen der Akkordtöne (Hz), ein Takt je Akkord.
 */
export const MUSIC = {
  bpm: 72,
  beatsPerChord: 4,
  chords: [
    [196.0, 233.08, 293.66, 349.23], // Gm7
    [130.81, 196.0, 233.08, 329.63], // C9 (ohne Grundton oben)
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [146.83, 174.61, 220.0, 261.63], // Dm7
  ],
  padGain: 0.08,
  arpGain: 0.06,
  bassGain: 0.12,
  /** Tiefpass für den „gedämpften“ Klang. */
  lowpassHz: 1400,
} as const;
