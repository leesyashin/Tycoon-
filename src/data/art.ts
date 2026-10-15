/**
 * Darstellungs-Konstanten der Szene (S8, UI_STYLE § 4). Rein kosmetisch, keine Spielbalance.
 */
import type { CustomerTypeId } from './customerTypes';
import type { StaffRoleId } from './staff';

/**
 * Ab diesen Leveln bekommt eine Ausstattung ein edleres Aussehen (UI_STYLE § 4): fünf Stufen, jeweils an
 * einem Meilenstein (GAME_DESIGN § 4), damit „schneller“ und „schöner“ zusammenfallen.
 */
export const STATION_LOOK_LEVELS = [1, 10, 25, 50, 100] as const;

export type LookTier = 1 | 2 | 3 | 4 | 5;

/** Stufe 1, 2, … zu einer aufsteigenden Schwellen-Liste; unter der ersten Schwelle Stufe 1. */
function tierFor(value: number, thresholds: readonly number[]): number {
  let tier = 1;
  thresholds.forEach((t, i) => {
    if (value >= t) tier = i + 1;
  });
  return tier;
}

/** Optik-Stufe 1..5 einer Ausstattung; Level 0 zeigt Stufe 1 (als Bauplatz bzw. leere Theke). */
export function stationLookTier(level: number): LookTier {
  return tierFor(level, STATION_LOOK_LEVELS) as LookTier;
}

/** Level, ab dem die nächste Optik kommt; `null`, wenn die edelste Stufe erreicht ist. */
export function nextStationLookLevel(level: number): number | null {
  return STATION_LOOK_LEVELS.find((l) => l > Math.max(level, 1)) ?? null;
}

/** Die Gästetheke wird mit dem Café-Level edler (Kobalt-Lack/Edelstahl → … → Nachtblau/Gold), rein kosmetisch. */
export const COUNTER_LOOK_CAFE_LEVELS = [1, 3, 6, 10, 15] as const;

export function counterLookTier(cafeLevel: number): LookTier {
  return tierFor(cafeLevel, COUNTER_LOOK_CAFE_LEVELS) as LookTier;
}

/**
 * Deko auf den Thekenmodulen je Spalte x (0 = leer, 1 = Becher/Glasglocke, 2 = Karte/Spender, 3 = Pflanze);
 * unter Kasse und Ausgabe liegt immer ein leeres Modul.
 */
export const COUNTER_PROPS = [3, 0, 1, 0, 2, 0, 1, 0, 3, 2] as const;

export function counterPropsAt(x: number): number {
  return COUNTER_PROPS[Math.abs(Math.trunc(x)) % COUNTER_PROPS.length] ?? 0;
}

/** Tische (Ambiente `seats`): vier Optik-Stufen nach Anzahl gekaufter Tische. */
export const TABLE_LOOK_LEVELS = [1, 13, 25, 40] as const;

export type TableTier = 1 | 2 | 3 | 4;

export function tableLookTier(seatsLevel: number): TableTier {
  return tierFor(seatsLevel, TABLE_LOOK_LEVELS) as TableTier;
}

/** Stufe der nächsten Tisch-Optik; `null` auf der letzten Stufe. */
export function nextTableLookLevel(seatsLevel: number): number | null {
  return TABLE_LOOK_LEVELS.find((l) => l > Math.max(seatsLevel, 1)) ?? null;
}

/** Szene-Effekte (Millisekunden, Pixel in Weltkoordinaten). */
export const SCENE_FX = {
  /** Kauf-Plopp: Scale 0 → 1.1 → 1 (§ 4 „Feedback“). */
  plopMs: 250,
  plopOvershoot: 1.1,
  /** Weißer Shine-Sweep beim Level-up. */
  shineMs: 450,
  /** Neue Optik-Stufe: Funken und „Neues Design!“ über dem Gerät. */
  newLookMs: 1400,
  newLookSparkles: 14,
  /** Die Theke wird edler: Module ploppen nacheinander von links nach rechts (Versatz je Modul). */
  counterWaveMs: 45,
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

/** Personal-Looks je Rolle (Phase 2); mehrere Figuren derselben Rolle zeigen sie der Reihe nach. */
export const STAFF_LOOKS: Readonly<Record<StaffRoleId, readonly string[]>> = {
  cashier: ['clawclip', 'buzz', 'curls'],
  barista: ['capBack', 'spaceBuns', 'curly'],
  waiter: ['bow', 'sidePart', 'topknot'],
  cleaner: ['bucket', 'bun'],
  manager: ['blazer'],
  socialMedia: ['ringlight'],
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

/**
 * Nur diese Rollen laufen durchs Café (Bedienungen zu den Tischen, Putzkräfte zu schmutzigen Tischen); alle
 * anderen stehen an ihrer Theke (Atlas nur mit Steh-Frames).
 */
export const STAFF_WALKERS: readonly StaffRoleId[] = ['waiter', 'cleaner'];

/** Look-Name für die n-te Figur einer Rolle (zyklisch). */
export function staffLookFor(role: StaffRoleId, index: number): string {
  const looks = STAFF_LOOKS[role];
  return looks[Math.abs(Math.trunc(index)) % looks.length] ?? looks[0] ?? role;
}

/**
 * Große Deko über mehrere Kacheln (Läufer, Barhocker): Leinwand in logischen Pixeln, Bodenpunkt der Kachel
 * (u = v = 0) bei (ox, oy); die Szene setzt den Ursprung auf die untere Kachelecke (oy + 32).
 */
export const DECOR_BIG = { w: 224, h: 208, ox: 112, oy: 88 } as const;
/** Deko-Frames, die die große Leinwand nutzen. */
export const DECOR_BIG_FRAMES: readonly string[] = ['deco-rug-blue', 'deco-stools'];
