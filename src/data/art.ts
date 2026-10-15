/**
 * Darstellungs-Konstanten der Szene (S8, UI_STYLE § 4). Rein kosmetisch, keine Spielbalance.
 */
import type { CustomerTypeId } from './customerTypes';
import type { StaffRoleId } from './staff';

/** Ab diesen Stations-Leveln wechselt die Optik (PLAN S8: Level 1/25/100). */
export const STATION_LOOK_LEVELS = [1, 25, 100] as const;

/** Optik-Stufe 1..3 einer Station; Level 0 zeigt Stufe 1 (als Umriss/Ghost in der Szene). */
export function stationLookTier(level: number): 1 | 2 | 3 {
  if (level >= STATION_LOOK_LEVELS[2]) return 3;
  if (level >= STATION_LOOK_LEVELS[1]) return 2;
  return 1;
}

/** Szene-Effekte (Millisekunden, Pixel in Weltkoordinaten). */
export const SCENE_FX = {
  /** Kauf-Plopp: Scale 0 → 1.1 → 1 (§ 4 „Feedback“). */
  plopMs: 250,
  plopOvershoot: 1.1,
  /** Weißer Shine-Sweep beim Level-up. */
  shineMs: 450,
  /** Münz-Flug ins HUD. */
  coinFlyMs: 650,
  /** Höchstens so viele fliegende Münzen gleichzeitig. */
  coinFlyMax: 6,
  /** Dampf über der Matcha-Bar: Partikel je Sekunde. */
  steamPerSec: 3,
  /** Wahrscheinlichkeit eines Emotes (Herz/Note) nach dem Bedienen. */
  emoteChance: 0.25,
  emoteMs: 900,
  /** Fortschrittsring über bedienten Kunden. */
  ringRadius: 7,
  ringWidth: 3,
} as const;

/**
 * Figuren-Varianten je Kundentyp: Gen-Z-Matcha-Klischees, gezeichnet in `scripts/art/figures.ts`. Die Szene
 * würfelt beim Spawn eine davon aus – rein optisch, Effekte hängen nur am Typ (GAME_DESIGN § 7.5).
 */
export const CUSTOMER_LOOKS: Readonly<Record<CustomerTypeId, readonly string[]>> = {
  student: ['softboy', 'clawclip', 'mullet', 'gorpcore'],
  tourist: ['sandals', 'backpacker', 'sunhat'],
  regular: ['pilates', 'startup', 'raver'],
  influencer: ['ringlight', 'selfie', 'interview'],
  critic: ['beret', 'sommelier'],
};

/** Personal-Looks je Rolle; Stationen mit derselben Rolle zeigen sie der Reihe nach. */
export const STAFF_LOOKS: Readonly<Record<StaffRoleId, readonly string[]>> = {
  barista: ['capBack', 'spaceBuns', 'curly'],
  cashier: ['clawclip', 'buzz'],
  cleaner: ['bucket'],
  manager: ['blazer'],
  baker: ['toque'],
  socialMedia: ['ringlight'],
  teaMaster: ['sensei', 'apprentice'],
};

/**
 * Figuren-Sprite in logischen Pixeln (PNG 2×): Füße mittig `footY` px unter der Oberkante; Haare und Mützen
 * reichen bis etwa `headTop` px über die Füße. Smiley, Ring und Emote sitzen darüber.
 */
export const CHAR_SPRITE = { w: 32, h: 56, footY: 51, headTop: 37 } as const;

/** Frames je Figur und Blickrichtung: 0 = Stehen, 1 = linker Fuß vorn, 2 = rechter Fuß vorn. */
export const CHAR_FRAMES = { stand: 0, walk: [1, 2] } as const;

/** Lauf-Zyklus aus diesen Frames (Schritt, Mitte, Schritt, Mitte) und Dauer eines Schritts. */
export const CHAR_WALK = { cycle: [1, 0, 2, 0], stepSec: 0.12 } as const;

/** Nur diese Rollen laufen durchs Café; alle anderen stehen an ihrer Station (Atlas nur mit Steh-Frames). */
export const STAFF_WALKERS: readonly StaffRoleId[] = ['cleaner'];

/** Look-Name für die n-te Station einer Rolle (zyklisch). */
export function staffLookFor(role: StaffRoleId, index: number): string {
  const looks = STAFF_LOOKS[role];
  return looks[Math.abs(Math.trunc(index)) % looks.length] ?? looks[0] ?? role;
}
