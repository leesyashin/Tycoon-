/**
 * Darstellungs-Konstanten der Szene (S8, UI_STYLE § 4). Rein kosmetisch, keine Spielbalance.
 */
import type { CustomerTypeId } from './customerTypes';
import type { StaffRoleId } from './staff';
import { MENU_LEVELS } from './stations';

/**
 * Ab diesen Leveln bekommt eine Ausstattung ein edleres Aussehen (UI_STYLE § 4): fünf Stufen bis zum Höchstlevel
 * 20 – dieselben Schwellen wie die Speisekarte (`MENU_LEVELS`), mit jeder Stufe kommt ein neues Produkt dazu.
 */
export const STATION_LOOK_LEVELS = MENU_LEVELS;

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
 * Deko auf den Thekenmodulen entlang der Theke (Reihenfolge wie `layout.counter`: langer Schenkel von links, Ecke,
 * kurzer Schenkel nach hinten; 0 = leer, 1 = Becher/Glasglocke, 2 = Karte/Spender, 3 = Pflanze): Pflanzen an
 * den Enden, Menükarte zur Schlange; unter Kasse und Ausgabe liegt immer ein leeres Modul.
 */
export const COUNTER_PROPS = [3, 0, 1, 0, 2, 0, 1, 2, 3] as const;

export function counterPropsAt(i: number): number {
  return COUNTER_PROPS[Math.abs(Math.trunc(i)) % COUNTER_PROPS.length] ?? 0;
}

/**
 * Das Lager füllt sich mit der Zahl gekaufter Geräte (mehr Produkte, mehr Vorräte): Stufe 1 Eckregal mit dem
 * Nötigsten, 2 volle Regale und ein zweites an der Seitenwand, 3 dazu Säcke und Kisten auf der Palette. Schwellen =
 * gekaufte Geräte der Barista-Theke. Rein kosmetisch, kein Vorrats-System.
 */
export const STORAGE_LOOK_DEVICES = [0, 3, 5] as const;

export type StorageTier = 1 | 2 | 3;

export function storageLookTier(devices: number): StorageTier {
  return tierFor(devices, STORAGE_LOOK_DEVICES) as StorageTier;
}

/** Leinwand der getragenen Ware in logischen Pixeln; Bodenpunkt (u = v = z = 0) bei (ox, oy). */
export const SUPPLY_CANVAS = { w: 24, h: 26, ox: 12, oy: 20 } as const;

/** Was ein Barista aus dem Lager an sein Gerät trägt (Frame `supply-<id>` im Möbel-Atlas). */
export const SUPPLY_ITEMS: Readonly<Record<string, string>> = {
  matchaStation: 'tin',
  coffeeMachine: 'beans',
  iceBox: 'milk',
  oven: 'flour',
  displayCase: 'crate',
  grinder: 'tin',
  ceremonySet: 'tin',
};

/**
 * Der Raum wird mit dem Deko-Level edler (Endausbau): Boden (Terrazzo → Terrazzo mit Einschlüssen und
 * Messing-Fugen → Marmor-Schachbrett mit Messing), Wände (Fliesen → Riffelpaneele mit Messingleiste und Gesims),
 * Fassade (niedrige Vorderwand → mit Blumenkästen). Schwellen = Deko-Level, ab dem die Stufe gilt.
 */
export const ROOM_LOOK_DECOR_LEVELS = {
  floor: [0, 12, 24],
  wall: [0, 20],
  front: [0, 16],
} as const;

export interface RoomLook {
  floor: 1 | 2 | 3;
  wall: 1 | 2;
  front: 1 | 2;
}

export function roomLook(decorLevel: number): RoomLook {
  return {
    floor: tierFor(decorLevel, ROOM_LOOK_DECOR_LEVELS.floor) as RoomLook['floor'],
    wall: tierFor(decorLevel, ROOM_LOOK_DECOR_LEVELS.wall) as RoomLook['wall'],
    front: tierFor(decorLevel, ROOM_LOOK_DECOR_LEVELS.front) as RoomLook['front'],
  };
}

/** Blumenkästen auf der Vorderwand ragen so viele Pixel über die Wand (Leinwand der Vorderwände ist so viel höher). */
export const FRONT_PLANTER_H = 14;

/** Tische (Ambiente `seats`, höchstens 10): vier Optik-Stufen nach Anzahl gekaufter Tische. */
export const TABLE_LOOK_LEVELS = [1, 4, 7, 10] as const;

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
  /**
   * Gehende Figuren behalten ihre Ansicht, bis die andere Raster-Achse um diesen Faktor überwiegt (≈ 56° statt 45°),
   * damit sie auf schrägen Wegen nicht zwischen zwei Ansichten flackern.
   */
  facingKeep: 1.5,
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
  /** Geldschein fliegt beim Bezahlen von der Kasse ins HUD. */
  cashFlyMs: 650,
  /**
   * Breite des fliegenden Scheins auf dem Bildschirm (CSS-Pixel) am Start und beim Ankommen im HUD, unabhängig vom
   * Zoom: in Weltgröße war er am Handy (Startansicht ≈ 0,5) nur ein 10 px kleiner Fleck unter dem „+Betrag“.
   */
  cashBillPx: 34,
  cashBillEndPx: 40,
  /** Start links neben dem „+Betrag“ (Bildschirm-Pixel), damit der Schein den Text nicht verdeckt. */
  cashBillOffset: { x: -32, y: -6 },
  /** Höchstens so viele fliegende Scheine gleichzeitig; mehrere Zahlungen auf einmal fliegen versetzt. */
  cashFlyMax: 6,
  cashFlyStaggerMs: 90,
  /** Beträge über der Kasse höchstens so oft; dazwischen bezahlte Gäste stehen gesammelt im nächsten. */
  cashPopupMinMs: 400,
  /** Wahrscheinlichkeit eines Emotes (Herz/Note) nach dem Bedienen. */
  emoteChance: 0.25,
  emoteMs: 900,
  /**
   * Fortschrittsring (UI_STYLE § 3.10): vorgerenderte Frames `ring-0` … `ring-<ringSteps>` (weiße Scheibe, helle
   * Spur, grüner Bogen mit runden Enden) statt Phaser-Graphics, damit er in jedem Zoom sauber bleibt.
   */
  ringSteps: 24,
  /** Abstand Unterkante Ring → Kopf (logische Pixel). */
  ringLift: 1,
  /** Kassenlade bleibt nach dem Kassieren so lange offen. */
  drawerOpenMs: 650,
  /** Schild „Geöffnet/Geschlossen“: so hoch über dem Boden an der Tür (Pixel). */
  doorSignLift: 46,
  /** Nach Ladenschluss brennt drinnen nur noch so viel Licht (Anteil). */
  closedLight: 0.15,
  /**
   * Antippen: Ab diesem Alpha (0–255) zählt ein Pixel als Teil des Objekts. Darunter liegen Kontaktschatten
   * (~24 %) und Lichtscheine, die sonst Theke oder Tisch darunter verdecken würden.
   */
  tapAlpha: 96,
} as const;

/**
 * Effekt eines Geräts, solange ein Barista daran arbeitet (kosmetisch): Dampf (Kessel, Siebträger), Frost
 * (Kühlfach), Glut (Ofen), Pulver (Mühle), Funkeln. Anker in Kachel-Koordinaten des Geräts (u, v) und Höhe z in
 * Pixeln über dem Boden; `burst` = Stöße statt gleichmäßigem Strom (Dampflanze).
 */
export type StationFxKind = 'steam' | 'frost' | 'glow' | 'powder' | 'sparkle';
export interface StationFx {
  kind: StationFxKind;
  u: number;
  v: number;
  z: number;
  /** Partikel je Sekunde (bei `burst`: je Stoß). */
  rate: number;
  burst?: boolean;
}
export const STATION_FX: Readonly<Record<string, StationFx>> = {
  matchaStation: { kind: 'steam', u: 0.22, v: 0.3, z: 40, rate: 4 },
  coffeeMachine: { kind: 'steam', u: 0.5, v: 0.42, z: 44, rate: 7, burst: true },
  iceBox: { kind: 'frost', u: 0.5, v: 0.75, z: 30, rate: 5 },
  oven: { kind: 'glow', u: 0.5, v: 0.75, z: 22, rate: 3 },
  displayCase: { kind: 'sparkle', u: 0.5, v: 0.7, z: 34, rate: 1.5 },
  grinder: { kind: 'powder', u: 0.5, v: 0.5, z: 36, rate: 9 },
  ceremonySet: { kind: 'steam', u: 0.45, v: 0.55, z: 34, rate: 3 },
};

/**
 * Barhocker (`deco-stool`, `scripts/art/decor.ts`): Sitzfläche liegt so viele Pixel über der eines Stuhls; die
 * Szene hebt sitzende Gäste um diesen Betrag an.
 */
export const STOOL_SEAT_LIFT = 10;

/** Oberkante der Gästetheke in Pixeln (Sprites `scripts/art/equipment.ts`, Szene stellt Teller darauf). */
export const COUNTER_TOP_PX = 23;

/** Plätze auf der Ausgabe (Kachel-Koordinaten u, v auf dem Thekenmodul) für abgestellte Teller und Becher. */
export const PASS_SLOTS: readonly { u: number; v: number }[] = [
  { u: 0.22, v: 0.8 },
  { u: 0.42, v: 0.84 },
  { u: 0.62, v: 0.86 },
  { u: 0.3, v: 0.62 },
];

/** Was ein Barista je Gerät auf die Ausgabe stellt (Frame im Figuren-Atlas, `item-<id>`). */
export const PASS_ITEMS: Readonly<Record<string, string>> = {
  matchaStation: 'matcha',
  coffeeMachine: 'coffee',
  iceBox: 'iced',
  oven: 'croissant',
  displayCase: 'cake',
  grinder: 'matcha',
  ceremonySet: 'bowl',
};

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

/**
 * Frames je Figur und Blickrichtung: 0 = Stehen, 1/2 = Laufen, 3/4 = Arbeiten (Hände auf Arbeitshöhe im Wechsel:
 * tippen, tampen, mahlen; Putzkräfte wischen mit dem Mopp), 5–7 = mit vorgestreckter Hand stehen/laufen (Becher,
 * Teller oder Geschirr legt die Szene als eigenes Sprite hinein, `HOLD_POINTS.carry`), 8 = vorgreifen und abstellen
 * (Bedienung: Tablett vor zum Tisch bzw. zur Ausgabe), 9/10 = Matcha mit dem Bambusbesen aufschlagen, 11/12 = tief
 * greifen (Ofen, Kühlfach, Vitrine), 13 = eingießen (Milchkännchen).
 */
export const CHAR_FRAMES = {
  stand: 0,
  walk: [1, 2],
  work: [3, 4],
  carry: [5, 6, 7],
  place: 8,
  whisk: [9, 10],
  low: [11, 12],
  pour: 13,
} as const;

/** Lauf-Zyklus aus diesen Frames (Schritt, Mitte, Schritt, Mitte) und Dauer eines Schritts. */
export const CHAR_WALK = { cycle: [1, 0, 2, 0], stepSec: 0.12 } as const;
/** Lauf-Zyklus mit vorgestreckter Hand (Becher, Teller, Geschirr). */
export const CHAR_CARRY = { cycle: [6, 5, 7, 5], stepSec: 0.12 } as const;
/** Arbeits-Takt: Hände wechseln so oft (Sekunden je Frame). */
export const CHAR_WORK = { cycle: [3, 4], stepSec: 0.2 } as const;
/** Bambusbesen: schnelles Hin und Her. */
export const CHAR_WHISK = { cycle: [9, 10], stepSec: 0.09 } as const;
/** Tief greifen: langsamer Wechsel (Blech schieben, Eis schöpfen, Kuchen heben). */
export const CHAR_LOW = { cycle: [11, 12], stepSec: 0.32 } as const;

/** Frames der Gäste: Stehen, Laufen, mit Becher/Teller/Geschirr in der Hand (Selbstbedienung); dazu die Sitzpose. */
export const CUSTOMER_FRAMES: readonly number[] = [0, 1, 2, 5, 6, 7];

/**
 * Gerenderte Frames je Rolle (Atlas-Fläche sparen): Verkäufer tippen an der Kasse und gehen morgens herein bzw.
 * abends hinaus, Baristas arbeiten am Gerät in allen Posen und tragen das Fertige zur Ausgabe, Bedienungen laufen
 * mit dem Tablett und stellen ab, Putzkräfte laufen und wischen. Filialleitung und Social Media stehen nur
 * (Portrait).
 */
export const STAFF_FRAMES: Readonly<Record<StaffRoleId, readonly number[]>> = {
  cashier: [0, 1, 2, 3, 4],
  barista: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  waiter: [0, 1, 2, 8],
  cleaner: [0, 1, 2, 3, 4],
  manager: [0],
  socialMedia: [0],
};

/** Punkt an einer Figur: x quer (+x = Flanke zur Kamera), y in Blickrichtung, z Höhe in Pixeln über den Füßen. */
export interface FigurePoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Wo eine Figur Dinge hält (`scripts/art/figures.ts` zeichnet Hände und Tablett genau dort): vorgestreckte rechte
 * Hand beim Tragen, Mitte des Tabletts beim Gehen und beim Abstellen.
 */
export const HOLD_POINTS = {
  carry: { x: 0.2, y: 0.17, z: 12.8 },
  /** Beide Hände vorn an der Arbeitsplatte (Abstellen auf der Ausgabe). */
  place: { x: 0.02, y: 0.17, z: 26.8 },
  tray: { x: 0.235, y: 0, z: 12.6 },
  trayServe: { x: 0.235, y: 0.17, z: 14.2 },
} as const satisfies Record<string, FigurePoint>;

/**
 * Bildschirm-Versatz (logische Pixel) eines Figur-Punkts vom Fußpunkt, ungespiegelt; `front` blickt zur Kamera.
 * Dieselbe Projektion wie die Figuren-Sprites (Kachel 64×32).
 */
export function figureOffset(p: FigurePoint, dir: 'front' | 'back'): { x: number; y: number } {
  const v = dir === 'front' ? p.y : -p.y;
  return { x: (p.x - v) * 32, y: ((p.x + v) * 32) / 2 - p.z };
}

/** Pose eines Arbeitsschritts am Gerät (Frames siehe `CHAR_FRAMES`). */
export type WorkPose = 'place' | 'whisk' | 'work' | 'low' | 'pour' | 'stand';

/**
 * Ein Arbeitsschritt: Pose, Anteil an der Zubereitungszeit, ob das Produkt schon auf dem Gerät steht (`item`) und
 * ob das Gerät dabei dampft, glüht, mahlt … (`fx`, `STATION_FX`).
 */
export interface WorkStep {
  pose: WorkPose;
  share: number;
  item?: boolean;
  fx?: boolean;
}

/**
 * Was ein Barista an seinem Gerät wirklich tut (Vorgabe Vincent 2026-10-16: „nicht nur vor dem Gerät stehen und
 * die Arme wackeln“): Schritt für Schritt mit eigener Pose; das Produkt erscheint auf dem Gerät, sobald es dort
 * steht, und geht danach in seine Hand. Anteile summieren sich je Gerät zu 1.
 */
export const WORK_SCRIPTS: Readonly<Record<string, readonly WorkStep[]>> = {
  // Schale hinstellen, Matcha aufschlagen, Milch eingießen, Becher nehmen
  matchaStation: [
    { pose: 'place', share: 0.12, item: true },
    { pose: 'whisk', share: 0.48, item: true, fx: true },
    { pose: 'pour', share: 0.24, item: true, fx: true },
    { pose: 'place', share: 0.16, item: true },
  ],
  // Siebträger füllen und tampen, Tasse unter den Auslauf, Bezug läuft, Milchschaum, Tasse nehmen
  coffeeMachine: [
    { pose: 'work', share: 0.24 },
    { pose: 'place', share: 0.12, item: true },
    { pose: 'stand', share: 0.3, item: true, fx: true },
    { pose: 'pour', share: 0.2, item: true, fx: true },
    { pose: 'place', share: 0.14, item: true },
  ],
  // Kühlfach auf und Eis schöpfen, Glas hinstellen, Matcha und Milch über das Eis, Glas nehmen
  iceBox: [
    { pose: 'low', share: 0.34, fx: true },
    { pose: 'place', share: 0.14, item: true },
    { pose: 'pour', share: 0.36, item: true },
    { pose: 'place', share: 0.16, item: true },
  ],
  // Blech in den Ofen, backen, Blech heraus, auf den Teller
  oven: [
    { pose: 'low', share: 0.28 },
    { pose: 'stand', share: 0.34, fx: true },
    { pose: 'low', share: 0.22, fx: true },
    { pose: 'place', share: 0.16, item: true },
  ],
  // Kuchenstück aus der Vitrine heben, anrichten
  displayCase: [
    { pose: 'low', share: 0.44, fx: true },
    { pose: 'place', share: 0.56, item: true },
  ],
  // Blätter einfüllen, mahlen, Becher aufgießen und nehmen
  grinder: [
    { pose: 'place', share: 0.18 },
    { pose: 'work', share: 0.5, fx: true },
    { pose: 'pour', share: 0.16, item: true },
    { pose: 'place', share: 0.16, item: true },
  ],
  // Chawan hinstellen, lange aufschlagen, reichen
  ceremonySet: [
    { pose: 'place', share: 0.14, item: true },
    { pose: 'whisk', share: 0.66, item: true, fx: true },
    { pose: 'place', share: 0.2, item: true },
  ],
};

const DEFAULT_WORK: readonly WorkStep[] = [{ pose: 'work', share: 1, fx: true }];

/** Schritt am Gerät bei Fortschritt 0..1 der Zubereitung. */
export function workStepAt(stationId: string, progress: number): WorkStep {
  const steps = WORK_SCRIPTS[stationId] ?? DEFAULT_WORK;
  const p = Math.min(1, Math.max(0, progress));
  let acc = 0;
  for (const s of steps) {
    acc += s.share;
    if (p < acc) return s;
  }
  return steps[steps.length - 1] ?? DEFAULT_WORK[0] ?? { pose: 'work', share: 1 };
}

/**
 * Wo das Produkt während der Zubereitung auf dem Gerät steht (Kachel-Koordinaten wie `STATION_FX`, Front nach +y;
 * Höhe in Pixeln, Arbeitsplatte der Rückwand-Geräte).
 */
export const DEVICE_ITEM_AT: Readonly<Record<string, { u: number; v: number; z: number }>> = {
  matchaStation: { u: 0.62, v: 0.74, z: 27 },
  coffeeMachine: { u: 0.5, v: 0.66, z: 27 },
  iceBox: { u: 0.5, v: 0.74, z: 27 },
  oven: { u: 0.3, v: 0.8, z: 27 },
  displayCase: { u: 0.74, v: 0.84, z: 27 },
  grinder: { u: 0.28, v: 0.78, z: 27 },
  ceremonySet: { u: 0.62, v: 0.72, z: 27 },
};

/** Tischplatte (alle Tisch-Stufen, drinnen und draußen) in Pixeln über dem Boden. */
export const TABLE_TOP_PX = 15.4;
/** Teller/Becher eines Gasts: so weit vom Tischmittelpunkt zu seinem Platz hin (Kacheln). */
export const TABLE_ITEM_OFFSET = 0.14;

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
export const DECOR_BIG_FRAMES: readonly string[] = ['deco-rug-blue', 'deco-chandelier'];

/**
 * Deko, die im Endausbau gegen eine edlere Fassung getauscht wird (ab diesem Deko-Level): blaue Pendelleuchten →
 * Opalglas-Kugeln in Messing.
 */
export const DECOR_UPGRADES: Readonly<Record<string, { level: number; frame: string }>> = {
  'deco-pendant': { level: 25, frame: 'deco-pendant-lux' },
  'deco-pendant-bar': { level: 25, frame: 'deco-pendant-bar-lux' },
};

/** Frame eines Deko-Stücks beim aktuellen Deko-Level (mit Endausbau-Tausch). */
export function decorFrame(frame: string, decorLevel: number): string {
  const up = DECOR_UPGRADES[frame];
  return up && decorLevel >= up.level ? up.frame : frame;
}

/**
 * Lieferwagen bei jeder Matcha-Lieferung (kosmetisch): fährt auf dem Parkstreifen der rechten Straße (vor dem Café
 * frei) vor, hält auf Höhe der Tür, ein Karton geht hinein, dann fährt er weiter. Grid-Koordinaten, Tempo in
 * Kacheln je Sekunde.
 */
export const DELIVERY_VAN = {
  /** Lieferwagen im Stadt-Atlas (`car-<typ>-f|b`). */
  carType: 2,
  laneX: 15.55,
  fromY: -1.5,
  stopY: 7.1,
  toY: 26,
  tilesPerSec: 3,
  fadeTiles: 2,
  waitMs: 2600,
  unloadMs: 900,
  /** Karton startet so weit neben dem Wagen (Richtung Gehweg). */
  boxOffset: 0.9,
} as const;
