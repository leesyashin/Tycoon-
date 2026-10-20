import type { WorkPose } from './art';

/**
 * Klang-Konstanten (S8). Alle Töne werden zur Laufzeit per Web Audio synthetisiert (keine Audiodateien,
 * siehe docs/ASSETS.md). Frequenzen in Hz, Zeiten in Sekunden, Lautstärken 0..1.
 */
export const AUDIO_DEFAULTS = { sfxVolume: 0.7, musicVolume: 0.4 } as const;

export type SfxId =
  | 'buy'
  | 'coin'
  | 'tap'
  | 'unlock'
  | 'error'
  | 'eventStart'
  | 'eventEnd'
  | 'leaf'
  | 'boost'
  | 'doorBell'
  | 'steam';

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

/** Rauschen durch einen Bandpass (Zischen), die Mittenfrequenz gleitet von `from` nach `to` Hz. */
export interface NoiseStep {
  noise: true;
  from: number;
  to: number;
  /** Güte des Bandpasses (größer = schmaler). */
  q: number;
  at: number;
  dur: number;
  gain: number;
  /** Einblenden in Sekunden (ein Zischen setzt weich ein). */
  attack: number;
}

export type SoundStep = ToneStep | NoiseStep;

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

const hiss = (from: number, to: number, q: number, dur: number, gain: number): NoiseStep => ({
  noise: true,
  from,
  to,
  q,
  at: 0,
  dur,
  gain,
  attack: 0.12,
});

export const SFX: Readonly<Record<SfxId, readonly SoundStep[]>> = {
  buy: [tone(660, 0, 0.08), tone(990, 0.06, 0.12)],
  coin: [tone(1320, 0, 0.05, 0.25, 'sine'), tone(1760, 0.04, 0.08, 0.2, 'sine')],
  tap: [tone(520, 0, 0.05, 0.3, 'sine')],
  unlock: [tone(523, 0, 0.12), tone(659, 0.1, 0.12), tone(784, 0.2, 0.12), tone(1047, 0.3, 0.25)],
  error: [tone(220, 0, 0.12, 0.5, 'square'), tone(175, 0.1, 0.18, 0.5, 'square')],
  eventStart: [tone(784, 0, 0.1), tone(1047, 0.1, 0.2)],
  eventEnd: [tone(1047, 0, 0.1), tone(784, 0.1, 0.1), tone(1319, 0.2, 0.25)],
  leaf: [tone(1568, 0, 0.06, 0.3, 'sine'), tone(2093, 0.05, 0.12, 0.25, 'sine')],
  boost: [tone(392, 0, 0.1), tone(587, 0.08, 0.1), tone(784, 0.16, 0.2)],
  // Glöckchen an der Tür: zwei Anschläge mit lang ausklingendem Grundton und einem unharmonischen Teilton (×2,76).
  doorBell: [
    tone(1760, 0, 0.9, 0.09, 'sine'),
    tone(4858, 0, 0.22, 0.015, 'sine'),
    tone(2093, 0.09, 0.8, 0.06, 'sine'),
    tone(5777, 0.09, 0.18, 0.01, 'sine'),
  ],
  // Milchschäumer: Zischen, das beim Erhitzen der Milch etwas höher wird, darunter leises Blubbern.
  steam: [hiss(3000, 5200, 0.9, 1.4, 0.07), hiss(520, 700, 2.2, 1.2, 0.025)],
};

/** Mindestabstand gleicher Klänge (z. B. Münzen bei vielen Kunden). */
export const SFX_MIN_GAP_SEC = 0.12;

/** Eigener Mindestabstand für Klänge, die sonst bei vielen Gästen bzw. Baristas ständig liefen (Sekunden). */
export const SFX_GAP_SEC: Readonly<Partial<Record<SfxId, number>>> = { doorBell: 3.5, steam: 4 };

/**
 * Geräusche der Szene, die laufen statt anzuschlagen (Vorgabe Vincent „Geräusche: Regen, Milchschäumer,
 * Stimmengemurmel und Türglocke, selbst erzeugt“): Regen als Rauschen zwischen Hoch- und Tiefpass, so laut wie der
 * Regen stark ist; Gemurmel der Gäste als Rauschen in drei Stimm-Bändern, dessen Lautstärke im Silbentakt springt,
 * voll ab `fullAt` Gästen im Raum. Beides hängt am Effekte-Regler. `fadeSec`: Zeitkonstante beim Ein- und Ausblenden.
 */
export const AMBIENT_SOUND = {
  rain: { highpassHz: 900, lowpassHz: 7000, gain: 0.16 },
  murmur: {
    bands: [
      { hz: 380, q: 1.2 },
      { hz: 720, q: 1.6 },
      { hz: 1150, q: 2 },
    ],
    gain: 0.1,
    syllableSec: { min: 0.11, max: 0.3 },
    /** Wie tief die Lautstärke zwischen den Silben fällt (0 = gleichmäßig, 1 = bis zur Stille). */
    depth: 0.85,
    fullAt: 16,
  },
  fadeSec: 0.8,
  /** Rauschpuffer in Sekunden (läuft in Schleife). */
  noiseSec: 2,
  /** So oft meldet die Szene die Stärken (ms). */
  sceneUpdateMs: 250,
} as const;

/** Wie laut die Geräusche der Szene gerade sein sollen (0..1). */
export interface AmbientLevels {
  rain: number;
  murmur: number;
}

/** Gemurmel-Stärke für so viele Gäste im Raum (0..1). */
export function murmurLevel(guestsInside: number): number {
  return Math.min(1, Math.max(0, guestsInside / AMBIENT_SOUND.murmur.fullAt));
}

/** Bei diesen Arbeitsschritten zischt der Milchschäumer (Gerät → Pose aus `WORK_SCRIPTS`). */
export const STEAM_POSES: Readonly<Record<string, WorkPose>> = {
  matchaStation: 'pour',
  coffeeMachine: 'pour',
};

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
