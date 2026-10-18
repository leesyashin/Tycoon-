/**
 * Figuren im Hotel-Empire-Look (UI_STYLE § 4): Blockfiguren mit großem Würfelkopf, kurzem Körper, Flat-Shading
 * (oben 100 %, links 85 %, rechts 70 %), keine Outlines und keine Gesichter außer Haaren – Sonnenbrille, Brille,
 * Schnurrbart und Bart zählen als Accessoire. Kunden tragen Gen-Z-Matcha-Klischees, je Typ mehrere Varianten
 * (`CUSTOMER_LOOKS`) und eine Sitzpose für den Tisch; Personal trägt Schürze (`STAFF_LOOKS`: Verkäufer, Barista,
 * Bedienung mit Tablett, Putzkraft mit Mopp, Filialleiterin, Social Media). Selbst gezeichnet, CC0 (docs/ASSETS.md).
 *
 * Koordinaten einer Figur: x quer (+x = Flanke, die in beiden Ansichten zur Kamera zeigt), y Blickrichtung,
 * z Höhe in Pixeln; Ursprung = Mitte zwischen den Füßen. Die Rückansicht spiegelt nur y, deshalb hält die
 * Figur Becher, Taschen und Handys immer auf der sichtbaren Seite.
 */
import {
  CHAR_FRAMES,
  CHAR_SPRITE,
  COURIER,
  CUSTOMER_FRAMES,
  CUSTOMER_LOOKS,
  HOLD_POINTS,
  STAFF_FRAMES,
  STAFF_LOOKS,
} from '@data/art';
import type { StaffRoleId } from '@data/staff';
import { IsoCanvas, SHADE, shade, tint } from './iso';
import { C } from './palette';
import type { SpriteDef } from './sprites';

/** Füße in der Mitte, 5 px über der Unterkante (Schatten); oben Platz für Hüte, Rucksack und Ringlicht. */
const CHAR_CANVAS = {
  w: CHAR_SPRITE.w,
  h: CHAR_SPRITE.h,
  ox: CHAR_SPRITE.w / 2,
  oy: CHAR_SPRITE.footY,
} as const;

/** Lieferant: breiter und tiefer, weil die Sackkarre vor ihm steht. */
const COURIER_CANVAS = {
  w: COURIER.sprite.w,
  h: COURIER.sprite.h,
  ox: COURIER.sprite.w / 2,
  oy: COURIER.sprite.footY,
} as const;

interface FigCanvas {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

type Dir = 'front' | 'back';

/** Haut, Haare, Stoffe. Lokalfarben ohne reine Grautöne (UI_STYLE § 4). */
const K = {
  skin1: '#f7d7bd',
  skin2: '#efc29d',
  skin3: '#d39a6a',
  skin4: '#a8704a',
  skin5: '#74472e',
  sunburn: '#f3a184',
  brown: '#5b3a24',
  dark: '#33241c',
  black: C.hairBlack,
  bleach: '#f3e3a6',
  grey: '#cdc6bb',
  ginger: '#c8643a',
  pinkHair: '#f4b3cb',
  greenHair: '#8fdc8a',
  afro: '#2b1d17',
  denim: '#5f86c4',
  denimLight: '#9dbde3',
  denimDark: '#34497a',
  khaki: '#b4a67a',
  olive: '#7c8456',
  coal: '#2e2b36',
  white: '#f8f5ef',
  offwhite: '#ece6da',
  canvas: '#eadbb8',
  sage: '#a6c596',
  lilac: '#bba6e8',
  pink: '#f39cc1',
  babyBlue: '#a8cbef',
  shirtBlue: '#c4d8f3',
  mustard: '#e9b23a',
  navy: '#2f3d6b',
  beige: '#d7c09a',
  camel: '#c49a63',
  leather: '#7a4a2a',
  silver: '#d6dbe4',
  tortoise: '#b06a2c',
  strawberry: '#f08aa6',
  milk: '#f4efe4',
  matchaDrink: '#8cc66b',
  orange: '#f28a3a',
  teal: '#3fb5a8',
  red: '#e2574c',
  varsity: '#3d7a52',
  indigo: '#3b4a7a',
  forest: '#3f5b45',
  straw: '#ead196',
  tattoo: '#45507a',
  plush: '#c99a6b',
} as const;

// ---------------------------------------------------------------------------------------------
// Leinwand in Figur-Koordinaten
// ---------------------------------------------------------------------------------------------
class Fig extends IsoCanvas {
  /** Hebt bzw. senkt alles, was danach gezeichnet wird (Kopfnicken bei der Arbeit). */
  lift = 0;
  constructor(
    readonly dir: Dir,
    canvas: FigCanvas = CHAR_CANVAS,
  ) {
    super(canvas.w, canvas.h, canvas.ox, canvas.oy);
  }
  override p([u, v, z]: readonly [number, number, number]): [number, number] {
    return super.p([u, v, z + this.lift]);
  }
  get facingCamera(): boolean {
    return this.dir === 'front';
  }
  /** y-Intervall → v-Intervall (Rückansicht spiegelt die Blickachse). */
  private span(y0: number, y1: number): [number, number] {
    return this.dir === 'front' ? [y0, y1] : [-y1, -y0];
  }
  cube(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    color: string,
  ): this {
    const [v0, v1] = this.span(y0, y1);
    return this.box(x0, v0, z0, x1 - x0, v1 - v0, z1 - z0, color);
  }
  /** Aufgesetzte Fläche auf der Vorderseite (Ebene y = +d); nur sichtbar, wenn die Figur zur Kamera blickt. */
  onFront(x0: number, x1: number, d: number, z0: number, z1: number, color: string): this {
    if (this.facingCamera)
      this.wallV(x0, d + 0.002, z0, x1 - x0, z1 - z0, shade(color, SHADE.left));
    return this;
  }
  /** Aufgesetzte Fläche auf dem Rücken (Ebene y = −d); nur in der Rückansicht sichtbar. */
  onBack(x0: number, x1: number, d: number, z0: number, z1: number, color: string): this {
    if (!this.facingCamera)
      this.wallV(x0, d + 0.002, z0, x1 - x0, z1 - z0, shade(color, SHADE.left));
    return this;
  }
  /** Aufgesetzte Fläche auf der sichtbaren Flanke (Ebene x = d). */
  onSide(d: number, y0: number, y1: number, z0: number, z1: number, color: string): this {
    const [v0, v1] = this.span(y0, y1);
    this.wallU(d + 0.002, v0, z0, v1 - v0, z1 - z0, shade(color, SHADE.right));
    return this;
  }
  tube(x: number, y: number, z: number, r: number, h: number, color: string, top?: string): this {
    return this.cylinder(x, this.facingCamera ? y : -y, z, r, h, color, top);
  }
  /** Bildschirmpunkt eines Figur-Punkts. */
  at(x: number, y: number, z: number): [number, number] {
    return this.p([x, this.facingCamera ? y : -y, z]);
  }
}

// ---------------------------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------------------------
type HairStyle =
  | 'short'
  | 'sidePart'
  | 'curtains'
  | 'mullet'
  | 'clawBun'
  | 'highBun'
  | 'long'
  | 'bob'
  | 'buzz'
  | 'afro'
  | 'curly'
  | 'spaceBuns'
  | 'topknot';
type HatStyle = 'bucket' | 'beanie' | 'capBack' | 'beret' | 'sunhat' | 'toque' | 'bow';
type TopStyle =
  | 'tee'
  | 'tank'
  | 'longsleeve'
  | 'hoodie'
  | 'shell'
  | 'vest'
  | 'fleeceVest'
  | 'blazerHoodie'
  | 'crop'
  | 'hawaii'
  | 'varsity'
  | 'trench'
  | 'samue'
  | 'dress';
type BottomStyle = 'jeans' | 'baggy' | 'cargo' | 'shorts' | 'leggings' | 'skirt';
type ShoeStyle = 'sneaker' | 'chunky' | 'platform' | 'boots' | 'loafer' | 'clogs' | 'sandals';
type FaceItem = 'sunglasses' | 'glasses' | 'mustache' | 'beard';
type PropKind =
  | 'icedMatcha'
  | 'strawberryMatcha'
  | 'tumbler'
  | 'tote'
  | 'backpack'
  | 'bigBackpack'
  | 'laptop'
  | 'tablet'
  | 'yogaMat'
  | 'digicam'
  | 'neckCamera'
  | 'crossbody'
  | 'phone'
  | 'ringLight'
  | 'selfieStick'
  | 'mic'
  | 'notebook'
  | 'chawan'
  | 'chasen'
  | 'mop'
  | 'tray'
  | 'pretzel'
  | 'earbuds'
  | 'wiredEarphones'
  | 'headphones'
  | 'hoops'
  | 'chain'
  | 'tattoos'
  | 'handTruck';

interface Prop {
  kind: PropKind;
  color?: string;
  accent?: string;
  /** Linke Hand (nur Becher): liegt hinter dem Körper, guckt links heraus. */
  left?: boolean;
  /** Sackkarre: so viele Kartons stehen darauf. */
  count?: number;
}

export interface Look {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  /** Spange, Haarband. */
  hairAccent?: string;
  top: string;
  topStyle: TopStyle;
  /** Druck, Blumen, Ärmel der College-Jacke, Hoodie unter dem Blazer. */
  topAccent?: string;
  sleeves?: 'none' | 'short' | 'long';
  /** Hemd unter Weste/Pullunder. */
  sleeveColor?: string;
  bottom: string;
  bottomStyle: BottomStyle;
  shoes: string;
  shoeStyle: ShoeStyle;
  socks?: string;
  hat?: string;
  hatStyle?: HatStyle;
  hatAccent?: string;
  face?: readonly FaceItem[];
  props?: readonly Prop[];
  /** Personal: Schürze in `--c-success`. */
  apron?: string;
}

const p = (kind: PropKind, color?: string, accent?: string, left?: boolean): Prop => ({
  kind,
  color,
  accent,
  left,
});

/**
 * Kunden-Varianten (GAME_DESIGN § 7.5: Student = Rucksack/Laptop, Tourist = Kamera/Hut, Stammgast =
 * wiederkehrende Figur, Influencer = Handy/Ringlicht, Kritiker = Notizbuch) – jeweils als Gen-Z-Matcha-Klischee.
 */
const CUSTOMER_LOOK_DEFS: Record<string, Look> = {
  // „Performative Male“: Jutebeutel mit Plüschanhänger, Kabel-Kopfhörer, Pullunder, Schnurrbart, Iced Matcha.
  softboy: {
    skin: K.skin2,
    hair: K.brown,
    hairStyle: 'curtains',
    top: K.olive,
    topStyle: 'vest',
    sleeveColor: K.offwhite,
    bottom: K.denimLight,
    bottomStyle: 'baggy',
    shoes: K.white,
    shoeStyle: 'sneaker',
    face: ['mustache'],
    props: [p('tote', K.canvas, C.matcha), p('wiredEarphones'), p('icedMatcha')],
  },
  // Hausarbeit im Café: Claw-Clip-Dutt, Oversize-Hoodie, eckiger Rucksack, Laptop, AirPods.
  clawclip: {
    skin: K.skin3,
    hair: K.dark,
    hairStyle: 'clawBun',
    hairAccent: K.pink,
    top: K.lilac,
    topStyle: 'hoodie',
    bottom: K.denim,
    bottomStyle: 'baggy',
    shoes: K.white,
    shoeStyle: 'chunky',
    props: [p('backpack', K.mustard), p('laptop', K.silver, K.pink), p('earbuds')],
  },
  // Blondierter Mullet, Kopfhörer für eine Monatsmiete, Cargo, schwarzes Shirt mit Matcha-Print.
  mullet: {
    skin: K.skin1,
    hair: K.bleach,
    hairStyle: 'mullet',
    top: K.coal,
    topStyle: 'tee',
    topAccent: K.matchaDrink,
    bottom: K.khaki,
    bottomStyle: 'cargo',
    shoes: K.white,
    shoeStyle: 'chunky',
    props: [p('headphones', K.silver), p('backpack', K.coal, K.matchaDrink), p('chain')],
  },
  // Gorpcore: Funktionsjacke, Fischermütze, Trailschuhe, Sling-Bag quer über der Brust.
  gorpcore: {
    skin: K.skin5,
    hair: K.black,
    hairStyle: 'short',
    hat: K.orange,
    hatStyle: 'beanie',
    top: K.teal,
    topStyle: 'shell',
    bottom: K.olive,
    bottomStyle: 'cargo',
    shoes: '#9aa3b5',
    shoeStyle: 'chunky',
    props: [p('crossbody', K.coal), p('backpack', K.coal, K.orange)],
  },
  // Socken in Sandalen, Hawaiihemd, Bucket Hat, Kamera um den Hals, Sonnenbrand.
  sandals: {
    skin: K.sunburn,
    hair: K.brown,
    hairStyle: 'short',
    hat: K.beige,
    hatStyle: 'bucket',
    top: K.orange,
    topStyle: 'hawaii',
    topAccent: C.gold,
    bottom: K.khaki,
    bottomStyle: 'shorts',
    shoes: K.leather,
    shoeStyle: 'sandals',
    socks: K.white,
    props: [p('neckCamera')],
  },
  // Interrail: Rucksack größer als der Kopf, Cap rückwärts, Digicam.
  backpacker: {
    skin: K.skin4,
    hair: K.black,
    hairStyle: 'long',
    hat: K.navy,
    hatStyle: 'capBack',
    top: K.offwhite,
    topStyle: 'tee',
    bottom: K.olive,
    bottomStyle: 'shorts',
    shoes: K.leather,
    shoeStyle: 'boots',
    socks: K.offwhite,
    props: [p('bigBackpack', K.red, K.teal), p('digicam')],
  },
  // Riesiger Sonnenhut, Sommerkleid, Sonnenbrille, Analogkamera, Erdbeer-Matcha.
  sunhat: {
    skin: K.skin2,
    hair: K.ginger,
    hairStyle: 'long',
    hat: K.straw,
    hatStyle: 'sunhat',
    hatAccent: K.coal,
    top: K.babyBlue,
    topStyle: 'dress',
    bottom: K.babyBlue,
    bottomStyle: 'skirt',
    shoes: K.white,
    shoeStyle: 'sneaker',
    face: ['sunglasses'],
    props: [p('neckCamera'), p('strawberryMatcha')],
  },
  // „Matcha-Girl“: Slick Bun, Pilates-Set in Salbei, Yogamatte, Riesenbecher, Goldcreolen.
  pilates: {
    skin: K.skin3,
    hair: K.brown,
    hairStyle: 'highBun',
    top: K.sage,
    topStyle: 'crop',
    bottom: K.sage,
    bottomStyle: 'leggings',
    shoes: K.white,
    shoeStyle: 'sneaker',
    socks: K.white,
    props: [p('yogaMat', K.lilac), p('tumbler', K.pink), p('hoops')],
  },
  // Startup-Bro: Fleeceweste über Hemd, Chinos, Laptop, AirPods, Hafer-Matcha in der linken Hand.
  startup: {
    skin: K.skin1,
    hair: K.brown,
    hairStyle: 'sidePart',
    top: K.navy,
    topStyle: 'fleeceVest',
    sleeveColor: K.shirtBlue,
    bottom: K.beige,
    bottomStyle: 'jeans',
    shoes: K.white,
    shoeStyle: 'sneaker',
    props: [
      p('laptop', K.silver, K.matchaDrink),
      p('earbuds'),
      p('icedMatcha', undefined, undefined, true),
    ],
  },
  // Sonntags-Raver direkt aus dem Club: alles schwarz, Sonnenbrille drinnen, Buzzcut, Kette, Tattoos.
  raver: {
    skin: K.skin2,
    hair: K.bleach,
    hairStyle: 'buzz',
    top: K.coal,
    topStyle: 'tank',
    bottom: K.coal,
    bottomStyle: 'baggy',
    shoes: K.coal,
    shoeStyle: 'boots',
    face: ['sunglasses'],
    props: [p('chain'), p('tattoos'), p('icedMatcha')],
  },
  // Matcha-Influencerin: Schleife im Haar, Crop-Cardigan, Ringlicht, Erdbeer-Matcha fürs Foto.
  ringlight: {
    skin: K.skin2,
    hair: K.bleach,
    hairStyle: 'long',
    hat: K.pink,
    hatStyle: 'bow',
    top: K.pink,
    topStyle: 'crop',
    sleeves: 'long',
    bottom: K.white,
    bottomStyle: 'skirt',
    shoes: K.white,
    shoeStyle: 'platform',
    props: [p('ringLight'), p('strawberryMatcha', undefined, undefined, true)],
  },
  // Selfie-Stick, grün gefärbte Curtains, College-Jacke, Sonnenbrille.
  selfie: {
    skin: K.skin4,
    hair: K.greenHair,
    hairStyle: 'curtains',
    top: K.varsity,
    topStyle: 'varsity',
    topAccent: K.offwhite,
    bottom: K.denimDark,
    bottomStyle: 'baggy',
    shoes: K.white,
    shoeStyle: 'chunky',
    face: ['sunglasses'],
    props: [p('selfieStick'), p('chain')],
  },
  // Straßenumfrage „Was ist deine Matcha-Order?“: Mikro mit Fell-Windschutz, Afro, Hoodie.
  interview: {
    skin: K.skin5,
    hair: K.afro,
    hairStyle: 'afro',
    top: K.mustard,
    topStyle: 'hoodie',
    bottom: K.coal,
    bottomStyle: 'baggy',
    shoes: K.white,
    shoeStyle: 'chunky',
    props: [p('mic'), p('hoops')],
  },
  // Der eine Boomer: Baskenmütze, Trenchcoat, Rollkragen, Brille, Bart, Notizbuch.
  beret: {
    skin: K.skin1,
    hair: K.grey,
    hairStyle: 'short',
    hat: K.red,
    hatStyle: 'beret',
    top: K.camel,
    topStyle: 'trench',
    topAccent: K.coal,
    bottom: K.leather,
    bottomStyle: 'jeans',
    shoes: K.leather,
    shoeStyle: 'loafer',
    face: ['glasses', 'beard'],
    props: [p('notebook', K.red)],
  },
  // Matcha-Sommelière: trinkt nur Ceremonial Grade aus der Schale, Rollkragen, Bob, Notizbuch.
  sommelier: {
    skin: K.skin4,
    hair: K.black,
    hairStyle: 'bob',
    top: K.coal,
    topStyle: 'longsleeve',
    bottom: '#55525f',
    bottomStyle: 'baggy',
    shoes: K.coal,
    shoeStyle: 'loafer',
    face: ['glasses'],
    props: [p('chawan'), p('notebook', K.forest)],
  },
};

/** Personal in Schürze (UI_STYLE § 4), Gen-Z-Barista-Team plus ein ernster Tee-Meister als Kontrast. */
const STAFF_LOOK_DEFS: Record<string, Look> = {
  'barista-capBack': {
    skin: K.skin2,
    hair: K.brown,
    hairStyle: 'curtains',
    hat: C.matchaDeep,
    hatStyle: 'capBack',
    top: K.white,
    topStyle: 'tee',
    bottom: K.coal,
    bottomStyle: 'jeans',
    shoes: K.white,
    shoeStyle: 'sneaker',
    apron: C.apron,
    props: [p('tattoos'), p('earbuds')],
  },
  'barista-spaceBuns': {
    skin: K.skin3,
    hair: K.pinkHair,
    hairStyle: 'spaceBuns',
    top: K.coal,
    topStyle: 'tee',
    bottom: K.denimLight,
    bottomStyle: 'baggy',
    shoes: K.white,
    shoeStyle: 'platform',
    apron: C.apron,
    props: [p('hoops')],
  },
  'barista-curly': {
    skin: K.skin5,
    hair: K.black,
    hairStyle: 'curly',
    top: K.white,
    topStyle: 'tee',
    bottom: K.khaki,
    bottomStyle: 'cargo',
    shoes: K.white,
    shoeStyle: 'chunky',
    apron: C.apron,
    props: [p('chain'), p('earbuds')],
  },
  'cashier-clawclip': {
    skin: K.skin2,
    hair: K.brown,
    hairStyle: 'clawBun',
    hairAccent: K.tortoise,
    top: K.offwhite,
    topStyle: 'longsleeve',
    bottom: K.coal,
    bottomStyle: 'jeans',
    shoes: K.white,
    shoeStyle: 'sneaker',
    apron: C.apron,
    props: [p('hoops'), p('tablet')],
  },
  'cashier-buzz': {
    skin: K.skin4,
    hair: K.bleach,
    hairStyle: 'buzz',
    top: K.lilac,
    topStyle: 'tee',
    bottom: K.coal,
    bottomStyle: 'baggy',
    shoes: K.coal,
    shoeStyle: 'boots',
    apron: C.apron,
    props: [p('tattoos'), p('earbuds')],
  },
  // Dritte Kasse: Locken, Kreolen, Tablet – der Gründungs-Verkäufer.
  'cashier-curls': {
    skin: K.skin5,
    hair: K.black,
    hairStyle: 'curly',
    top: K.offwhite,
    topStyle: 'tee',
    bottom: K.denimDark,
    bottomStyle: 'jeans',
    shoes: K.white,
    shoeStyle: 'sneaker',
    apron: C.apron,
    props: [p('hoops'), p('tablet')],
  },
  // Bedienungen tragen das Tablett mit Becher und Kuchen auf der flachen Hand (Phase 2, UI_STYLE § 4).
  'waiter-bow': {
    skin: K.skin1,
    hair: K.bleach,
    hairStyle: 'long',
    hat: K.red,
    hatStyle: 'bow',
    top: K.white,
    topStyle: 'longsleeve',
    bottom: K.coal,
    bottomStyle: 'jeans',
    shoes: K.coal,
    shoeStyle: 'loafer',
    apron: C.apron,
    props: [p('tray'), p('hoops')],
  },
  'waiter-sidePart': {
    skin: K.skin3,
    hair: K.dark,
    hairStyle: 'sidePart',
    top: K.offwhite,
    topStyle: 'tee',
    bottom: K.coal,
    bottomStyle: 'baggy',
    shoes: K.white,
    shoeStyle: 'sneaker',
    apron: C.apron,
    props: [p('tray'), p('earbuds')],
  },
  'waiter-topknot': {
    skin: K.skin5,
    hair: K.black,
    hairStyle: 'topknot',
    top: K.sage,
    topStyle: 'longsleeve',
    bottom: K.coal,
    bottomStyle: 'jeans',
    shoes: K.white,
    shoeStyle: 'chunky',
    apron: C.apron,
    props: [p('tray'), p('chain')],
  },
  'cleaner-bucket': {
    skin: K.skin5,
    hair: K.black,
    hairStyle: 'short',
    hat: K.babyBlue,
    hatStyle: 'bucket',
    top: '#9cc3e6',
    topStyle: 'tee',
    bottom: K.denimDark,
    bottomStyle: 'jeans',
    shoes: K.white,
    shoeStyle: 'chunky',
    apron: C.apron,
    props: [p('headphones', K.white), p('mop')],
  },
  // Zweite Putzkraft: Dutt, In-Ears, Mopp.
  'cleaner-bun': {
    skin: K.skin2,
    hair: K.ginger,
    hairStyle: 'highBun',
    top: K.babyBlue,
    topStyle: 'tee',
    bottom: K.coal,
    bottomStyle: 'cargo',
    shoes: K.white,
    shoeStyle: 'chunky',
    apron: C.apron,
    props: [p('earbuds'), p('mop')],
  },
  // Filialleiterin: Blazer über Hoodie, Slick Bun, Tablet. Auch Portrait im HUD.
  'manager-blazer': {
    skin: K.skin4,
    hair: K.black,
    hairStyle: 'highBun',
    top: K.navy,
    topStyle: 'blazerHoodie',
    topAccent: '#c8ccd8',
    bottom: K.navy,
    bottomStyle: 'jeans',
    shoes: K.white,
    shoeStyle: 'chunky',
    props: [p('hoops'), p('tablet')],
  },
  'socialMedia-ringlight': {
    skin: K.skin3,
    hair: K.black,
    hairStyle: 'long',
    hat: K.pink,
    hatStyle: 'bow',
    top: C.sakura,
    topStyle: 'tee',
    bottom: K.denimLight,
    bottomStyle: 'baggy',
    shoes: K.white,
    shoeStyle: 'platform',
    apron: C.apron,
    props: [p('ringLight')],
  },
};

// ---------------------------------------------------------------------------------------------
// Körpermaße
// ---------------------------------------------------------------------------------------------
const HEAD = { r: 0.12, z0: 20, z1: 34 };
const TORSO = { x: 0.125, y: 0.075, z0: 8, z1: 20.5 };
const ARM = { x0: 0.125, x1: 0.18, y: 0.042, z1: 20.2 };
const HAND = { z0: 8.2, z1: 10.6 };
const LEG = { x0: 0.014, x1: 0.105, y: 0.055, z1: 8 };

interface Pose {
  legL: number;
  legR: number;
  liftL: number;
  liftR: number;
  armL: number;
  armR: number;
}

/** Frame 0 steht, 1/2 sind die beiden Lauf-Phasen (Bein vor, Gegen-Arm vor). */
const POSES: readonly Pose[] = [
  { legL: 0, legR: 0, liftL: 0, liftR: 0, armL: 0, armR: 0 },
  { legL: 0.045, legR: -0.045, liftL: 0, liftR: 1.4, armL: -0.035, armR: 0.035 },
  { legL: -0.045, legR: 0.045, liftL: 1.4, liftR: 0, armL: 0.035, armR: -0.035 },
];

const has = (look: Look, kind: PropKind): Prop | undefined =>
  look.props?.find((q) => q.kind === kind);

function torsoBox(look: Look): { x: number; y: number; z0: number } {
  switch (look.topStyle) {
    case 'hoodie':
      return { x: 0.137, y: 0.085, z0: 6.6 };
    case 'shell':
      return { x: 0.132, y: 0.08, z0: 7.4 };
    case 'trench':
      return { x: 0.135, y: 0.085, z0: 3.6 };
    case 'samue':
      return { x: 0.13, y: 0.08, z0: 6.2 };
    default:
      return { x: TORSO.x, y: TORSO.y, z0: TORSO.z0 };
  }
}

function sleeveKind(look: Look): 'none' | 'short' | 'long' {
  if (look.sleeves) return look.sleeves;
  switch (look.topStyle) {
    case 'tee':
    case 'hawaii':
      return 'short';
    case 'tank':
    case 'crop':
    case 'dress':
      return 'none';
    default:
      return 'long';
  }
}

// ---------------------------------------------------------------------------------------------
// Beine und Schuhe
// ---------------------------------------------------------------------------------------------
function shoe(f: Fig, look: Look, x0: number, x1: number, dy: number, lift: number): number {
  const c = look.shoes;
  const y0 = -0.065 + dy;
  const y1 = 0.09 + dy;
  switch (look.shoeStyle) {
    case 'sneaker':
      f.cube(x0 - 0.004, x1 + 0.004, y0, y1, lift, lift + 0.8, '#e2ddd4');
      f.cube(x0 - 0.004, x1 + 0.004, y0, y1 - 0.01, lift + 0.8, lift + 2.4, c);
      return lift + 2.4;
    case 'chunky':
      f.cube(x0 - 0.008, x1 + 0.008, y0 - 0.005, y1 + 0.01, lift, lift + 1.3, '#e6e1d7');
      f.cube(x0 - 0.006, x1 + 0.006, y0, y1, lift + 1.3, lift + 3, c);
      return lift + 3;
    case 'platform':
      f.cube(x0 - 0.006, x1 + 0.006, y0, y1, lift, lift + 2, tint(c, 0.4));
      f.cube(x0 - 0.004, x1 + 0.004, y0, y1 - 0.01, lift + 2, lift + 3.4, c);
      return lift + 3.4;
    case 'boots':
      f.cube(x0 - 0.006, x1 + 0.006, y0, y1, lift, lift + 0.9, shade(c, 0.7));
      f.cube(x0 - 0.004, x1 + 0.004, y0, y1 - 0.01, lift + 0.9, lift + 4.2, c);
      return lift + 4.2;
    case 'loafer':
      f.cube(x0 - 0.003, x1 + 0.003, y0, y1, lift, lift + 1.8, c);
      return lift + 1.8;
    case 'clogs':
      f.cube(x0 - 0.007, x1 + 0.007, y0, y1 + 0.006, lift, lift + 2.6, c);
      return lift + 2.6;
    case 'sandals': {
      f.cube(x0 - 0.004, x1 + 0.004, y0, y1, lift, lift + 0.7, c);
      const sock = look.socks ?? look.skin;
      f.cube(x0, x1, y0 + 0.01, y1 - 0.015, lift + 0.7, lift + 2.2, sock);
      f.cube(x0 - 0.002, x1 + 0.002, 0.005 + dy, 0.03 + dy, lift + 0.7, lift + 2.35, c);
      f.cube(x0 - 0.002, x1 + 0.002, 0.045 + dy, 0.065 + dy, lift + 0.7, lift + 2.3, c);
      return lift + 2.2;
    }
  }
}

function leg(f: Fig, look: Look, side: -1 | 1, dy: number, lift: number) {
  const x0 = side < 0 ? -LEG.x1 : LEG.x0;
  const x1 = side < 0 ? -LEG.x0 : LEG.x1;
  const shoeTop = shoe(f, look, x0, x1, dy, lift);
  const b = look.bottom;
  const slim = (n: number) => (side < 0 ? [x0 + n, x1] : [x0, x1 - n]) as [number, number];
  // Unterschenkel bei Shorts/Rock/Kleid: Haut oder Socken
  const bare = look.bottomStyle === 'shorts' || look.bottomStyle === 'skirt';
  if (bare) {
    const [a, c] = slim(0.012);
    const sockTop = look.socks ? lift + 4.6 : shoeTop;
    if (look.socks && sockTop > shoeTop)
      f.cube(a, c, -0.045 + dy, 0.045 + dy, shoeTop, sockTop, look.socks);
    f.cube(a, c, -0.045 + dy, 0.045 + dy, Math.max(shoeTop, sockTop), LEG.z1, look.skin);
  }
  switch (look.bottomStyle) {
    case 'jeans':
      f.cube(x0, x1, -LEG.y + dy, LEG.y + dy, shoeTop - 0.2, LEG.z1, b);
      break;
    case 'baggy':
    case 'cargo': {
      const w = 0.012;
      f.cube(x0 - w, x1 + w, -0.068 + dy, 0.068 + dy, lift + 1.1, LEG.z1, b);
      if (look.bottomStyle === 'cargo' && side > 0)
        f.onSide(x1 + w, -0.035 + dy, 0.035 + dy, lift + 3.4, lift + 6, shade(b, 0.82));
      break;
    }
    case 'leggings': {
      const [a, c] = slim(0.006);
      // leicht ausgestellt („Flared Leggings“)
      f.cube(a - 0.006, c + 0.006, -0.058 + dy, 0.058 + dy, shoeTop - 0.3, lift + 4, b);
      f.cube(a, c, -0.048 + dy, 0.048 + dy, lift + 4, LEG.z1, b);
      break;
    }
    case 'shorts':
      f.cube(x0 - 0.008, x1 + 0.008, -0.062 + dy, 0.062 + dy, 5.6, LEG.z1, b);
      break;
    case 'skirt':
      break;
  }
}

/**
 * Sitzend (Gäste am Tisch): Oberschenkel waagerecht nach vorn (+y), Unterschenkel senkrecht davor, Füße am
 * Boden. Die Sitzhöhe entspricht dem Hüftansatz der stehenden Figur, der Rumpf bleibt unverändert.
 */
function seatedLeg(f: Fig, look: Look, side: -1 | 1) {
  const x0 = side < 0 ? -LEG.x1 : LEG.x0;
  const x1 = side < 0 ? -LEG.x0 : LEG.x1;
  const bare =
    look.bottomStyle === 'shorts' || look.bottomStyle === 'skirt' || look.topStyle === 'dress';
  const shin = bare ? (look.socks ?? look.skin) : look.bottom;
  const wide = look.bottomStyle === 'baggy' || look.bottomStyle === 'cargo' ? 0.012 : 0;
  f.cube(x0 - 0.004, x1 + 0.004, 0.11, 0.23, 0, 2.2, look.shoes);
  f.cube(x0 + 0.008, x1 - 0.008, 0.13, 0.19, 0.8, 4.6, shin);
  f.cube(x0 - wide, x1 + wide, -0.02, 0.16, 4.6, LEG.z1, look.bottom);
}

// ---------------------------------------------------------------------------------------------
// Rumpf, Arme, Kleidungsdetails
// ---------------------------------------------------------------------------------------------
function torso(f: Fig, look: Look) {
  const t = torsoBox(look);
  const top = look.top;
  switch (look.topStyle) {
    case 'crop':
      f.cube(-t.x, t.x, -t.y, t.y, TORSO.z0, 11.6, look.bottom);
      f.cube(-t.x + 0.008, t.x - 0.008, -t.y + 0.006, t.y - 0.006, 11.6, 13.4, look.skin);
      f.cube(-t.x, t.x, -t.y, t.y, 13.4, TORSO.z1, top);
      return;
    case 'dress':
      f.cube(-0.14, 0.14, -0.092, 0.092, 4.4, 11.4, top);
      f.cube(-0.118, 0.118, -0.07, 0.07, 11.4, TORSO.z1, top);
      return;
    default:
      f.cube(-t.x, t.x, -t.y, t.y, t.z0, TORSO.z1, top);
  }
}

/** Rock wird vor dem Rumpf gezeichnet (er sitzt unter der Taille). */
function skirt(f: Fig, look: Look) {
  if (look.bottomStyle === 'skirt' && look.topStyle !== 'dress')
    f.cube(-0.14, 0.14, -0.092, 0.092, 5.2, 9.6, look.bottom);
}

function torsoDetails(f: Fig, look: Look) {
  const t = torsoBox(look);
  const d = t.y;
  const top = look.top;
  const acc = look.topAccent ?? C.white;
  switch (look.topStyle) {
    case 'tee':
      if (look.topAccent) {
        f.onFront(-0.05, 0.05, d, 13.4, 17.6, acc);
        f.onFront(-0.03, 0.03, d + 0.001, 14.4, 16.6, tint(acc, 0.45));
      }
      break;
    case 'hoodie':
      f.onFront(-0.085, 0.085, d, 8.8, 12.6, shade(top, 0.9));
      f.onFront(-0.04, -0.028, d, 15.2, 19, K.white);
      f.onFront(0.028, 0.04, d, 15.2, 19, K.white);
      break;
    case 'shell':
      f.onFront(-0.006, 0.006, d, TORSO.z0, TORSO.z1, shade(top, 0.75));
      f.onFront(0.03, 0.09, d, 16.4, 17.2, shade(top, 0.75));
      f.onSide(t.x, -0.08, 0.08, 15.5, 16.6, tint(top, 0.35));
      break;
    case 'vest':
      f.onFront(-0.045, 0.045, d, 17.2, TORSO.z1, look.sleeveColor ?? K.offwhite);
      f.onFront(-t.x, t.x, d, TORSO.z0, 9.4, shade(top, 0.85));
      f.onSide(t.x, -t.y, t.y, TORSO.z0, 9.4, shade(top, 0.85));
      break;
    case 'fleeceVest':
      f.onFront(-0.05, 0.05, d, 18.8, TORSO.z1, look.sleeveColor ?? K.shirtBlue);
      f.onFront(-0.006, 0.006, d, TORSO.z0, 18.8, tint(top, 0.35));
      f.onFront(0.045, 0.1, d, 13, 13.8, tint(top, 0.2));
      break;
    case 'blazerHoodie':
      f.onFront(-0.05, 0.05, d, TORSO.z0, TORSO.z1, acc);
      f.onFront(-0.03, -0.018, d + 0.001, 15.2, 18.6, K.white);
      f.onFront(0.018, 0.03, d + 0.001, 15.2, 18.6, K.white);
      f.onFront(0.07, 0.11, d, 15.6, 16.6, tint(top, 0.25));
      break;
    case 'hawaii':
      f.onFront(-0.1, -0.06, d, 15.6, 17.8, acc);
      f.onFront(0.02, 0.06, d, 11, 13.2, K.white);
      f.onFront(0.075, 0.11, d, 17.4, 19.4, acc);
      f.onFront(-0.06, -0.025, d, 9.4, 11.4, K.white);
      f.onBack(-0.08, -0.04, d, 12, 14.2, acc);
      f.onBack(0.03, 0.07, d, 16.2, 18.4, K.white);
      f.onSide(t.x, -0.05, -0.015, 12, 14.2, acc);
      f.onSide(t.x, 0.02, 0.055, 16.4, 18.6, K.white);
      break;
    case 'varsity':
      f.onFront(-t.x, t.x, d, TORSO.z0, 9.4, acc);
      f.onSide(t.x, -t.y, t.y, TORSO.z0, 9.4, acc);
      f.onBack(-t.x, t.x, d, TORSO.z0, 9.4, acc);
      f.onFront(-0.006, 0.006, d, 9.4, TORSO.z1, acc);
      f.onFront(0.035, 0.1, d, 15.2, 18.6, acc);
      f.onBack(-0.07, 0.07, d, 13, 18, acc);
      break;
    case 'trench':
      f.onFront(-0.035, 0.035, d, 15.4, TORSO.z1, acc);
      f.onFront(-0.07, -0.035, d, 13.4, TORSO.z1, tint(top, 0.25));
      f.onFront(0.035, 0.07, d, 13.4, TORSO.z1, tint(top, 0.25));
      f.onFront(-t.x, t.x, d, 10.6, 11.9, shade(top, 0.78));
      f.onSide(t.x, -t.y, t.y, 10.6, 11.9, shade(top, 0.78));
      f.onBack(-t.x, t.x, d, 10.6, 11.9, shade(top, 0.78));
      break;
    case 'samue': {
      // Gekreuzter Kragen als Fläche auf der Vorderseite, darunter der Gürtel.
      if (f.facingCamera) {
        const pts: [number, number][] = [
          [-0.07, TORSO.z1],
          [-0.035, TORSO.z1],
          [0.06, 12.4],
          [0.025, 12.4],
        ];
        f.poly(
          pts.map(([x, z]) => [x, d + 0.002, z] as const),
          shade(acc, SHADE.left),
        );
      }
      f.onFront(-t.x, t.x, d, 11, 12.6, shade(top, 0.7));
      f.onSide(t.x, -t.y, t.y, 11, 12.6, shade(top, 0.7));
      f.onBack(-t.x, t.x, d, 11, 12.6, shade(top, 0.7));
      break;
    }
    case 'crop':
      if (look.sleeves === 'long') {
        f.onFront(-0.006, 0.006, d, 13.4, TORSO.z1, tint(top, 0.4));
        f.onFront(0.02, 0.034, d + 0.001, 15, 16.2, K.white);
        f.onFront(0.02, 0.034, d + 0.001, 17.6, 18.8, K.white);
      }
      break;
    case 'dress':
      f.onFront(-0.118, 0.118, 0.07, 11.4, 12.4, tint(top, 0.35));
      break;
    default:
      break;
  }
  if (look.apron) apron(f, look, t);
}

function apron(f: Fig, look: Look, t: { x: number; y: number }) {
  const a = look.apron ?? C.apron;
  f.onFront(-0.1, 0.1, t.y + 0.004, 5.6, 17.8, a);
  f.onFront(-0.09, -0.07, t.y + 0.004, 17.8, TORSO.z1, a);
  f.onFront(0.07, 0.09, t.y + 0.004, 17.8, TORSO.z1, a);
  f.onFront(-0.055, 0.055, t.y + 0.005, 10.4, 13.2, shade(a, 0.86));
  f.onSide(t.x, t.y - 0.03, t.y + 0.004, 5.6, 17.8, a);
  f.onSide(t.x, -t.y, t.y, 12.2, 13.2, a);
  f.onBack(-t.x, t.x, t.y, 12.2, 13.2, a);
  f.onBack(-0.035, 0.035, t.y + 0.001, 10.6, 14.4, shade(a, 0.85));
}

function arm(f: Fig, look: Look, side: -1 | 1, dy: number) {
  const out = look.topStyle === 'hoodie' || look.topStyle === 'trench' ? 0.012 : 0;
  const x0 = side < 0 ? -ARM.x1 - out : ARM.x0;
  const x1 = side < 0 ? -ARM.x0 : ARM.x1 + out;
  const kind = sleeveKind(look);
  let sleeve = look.sleeveColor ?? look.top;
  if (look.topStyle === 'varsity') sleeve = look.topAccent ?? sleeve;
  const y0 = -ARM.y + dy;
  const y1 = ARM.y + dy;
  const inset = 0.004;
  f.cube(x0 + inset, x1 - inset, y0 + 0.006, y1 - 0.006, HAND.z0, HAND.z1, look.skin);
  if (kind === 'long') {
    const wide = look.topStyle === 'samue' ? 0.014 : 0;
    f.cube(
      x0 - (side < 0 ? wide : 0),
      x1 + (side > 0 ? wide : 0),
      y0 - wide,
      y1 + wide,
      HAND.z1,
      ARM.z1,
      sleeve,
    );
    return;
  }
  const skinTop = kind === 'short' ? 15.8 : ARM.z1;
  f.cube(x0 + inset, x1 - inset, y0 + 0.004, y1 - 0.004, HAND.z1, skinTop, look.skin);
  if (kind === 'short') f.cube(x0, x1, y0, y1, skinTop, ARM.z1, sleeve);
  if (has(look, 'tattoos')) {
    const ink = K.tattoo;
    if (side > 0) {
      f.onSide(x1 - inset, -0.02 + dy, 0.02 + dy, 11.6, 13.6, ink);
      f.onSide(
        x1 - inset,
        -0.03 + dy,
        0.0 + dy,
        kind === 'none' ? 16 : 14.4,
        kind === 'none' ? 18.4 : 15.6,
        ink,
      );
    }
    f.onFront(x0 + inset + 0.01, x1 - inset - 0.012, y1 - 0.004, 12.2, 14.6, ink);
  }
}

/**
 * Arbeits-Pose (Frames 3/4): Oberarm hängt bis zum Ellbogen, der Unterarm zeigt nach vorn auf Arbeitshöhe, die
 * Hände wechseln die Höhe (tippen an der Kasse, rühren und hantieren am Gerät).
 */
const WORK = {
  elbowZ: 15.2,
  reach: 0.165,
  hand: 0.042,
  poses: [
    { l: 16.6, r: 18.8, nod: 0 },
    { l: 18.8, r: 16.4, nod: -0.7 },
  ],
} as const;

function armX(look: Look, side: -1 | 1): [number, number] {
  const out = look.topStyle === 'hoodie' || look.topStyle === 'trench' ? 0.012 : 0;
  return side < 0 ? [-ARM.x1 - out, -ARM.x0] : [ARM.x0, ARM.x1 + out];
}

function sleeveOf(look: Look): string {
  const sleeve = look.sleeveColor ?? look.top;
  return look.topStyle === 'varsity' ? (look.topAccent ?? sleeve) : sleeve;
}

/** Oberarm bis zum Ellbogen (Arbeits-Pose). */
function upperArm(f: Fig, look: Look, side: -1 | 1) {
  const [x0, x1] = armX(look, side);
  const kind = sleeveKind(look);
  const inset = 0.004;
  if (kind === 'long') {
    f.cube(x0, x1, -ARM.y, ARM.y, WORK.elbowZ, ARM.z1, sleeveOf(look));
    return;
  }
  const skinTop = kind === 'short' ? 15.8 : ARM.z1;
  f.cube(x0 + inset, x1 - inset, -ARM.y + 0.004, ARM.y - 0.004, WORK.elbowZ, skinTop, look.skin);
  if (kind === 'short') f.cube(x0, x1, -ARM.y, ARM.y, skinTop, ARM.z1, sleeveOf(look));
}

/**
 * Unterarm nach vorn mit Hand auf Höhe `handZ`. `from` = Beginn entlang y (in der Vorderansicht ab der Brust, damit
 * der linke Unterarm nicht über den Rumpf gemalt wird); `dx` verschiebt die Hand seitlich (Bambusbesen).
 */
function forearm(f: Fig, look: Look, side: -1 | 1, handZ: number, from: number, dx = 0) {
  const [ax0, ax1] = armX(look, side);
  const x0 = ax0 + dx;
  const x1 = ax1 + dx;
  const inset = 0.006;
  const color = sleeveKind(look) === 'long' ? sleeveOf(look) : look.skin;
  const tip = WORK.reach - WORK.hand;
  // Ellbogen-Stück: verbindet Oberarm und Unterarm (nach oben zum Gerät oder nach unten in Ofen und Kühlfach).
  if (from <= 0) {
    const za = Math.min(WORK.elbowZ - 0.6, handZ - 0.6);
    const zb = Math.max(WORK.elbowZ + 0.6, handZ + 1.2);
    f.cube(x0 + inset, x1 - inset, -0.03, 0.03, za, zb, color);
  }
  f.cube(x0 + inset, x1 - inset, Math.max(from, -0.01), tip, handZ - 0.6, handZ + 1.6, color);
  f.cube(x0 + inset, x1 - inset, tip, WORK.reach, handZ - 1, handZ + 1.8, look.skin);
}

/** Unterarm einer Hand in einer Pose: Höhe der Hand und seitlicher Versatz. */
interface HandPose {
  z: number;
  dx?: number;
}

/**
 * Arm-Haltung eines Frames (`CHAR_FRAMES`): welche Hand nach vorn greift (sonst hängt bzw. schwingt der Arm), wie
 * weit der Kopf nickt und wie tief der Oberkörper geht (tief greifen). Die Hände der Baristas liegen hoch (die
 * Arbeitsplatte der Geräte ist höher als die Schultern), damit man auch von hinten sieht, was sie tun.
 */
interface ArmPose {
  l?: HandPose;
  r?: HandPose;
  nod: number;
  /** Oberkörper senken (Pixel, negativ = tiefer). */
  crouch: number;
  /** Requisit in der rechten Hand. */
  tool?: 'chasen' | 'pitcher';
  /** Beine laufen trotzdem (Sackkarre schieben); sonst stehen sie bei Arm-Posen. */
  walk?: boolean;
}

/** Hand, die einen Becher, Teller oder Geschirr trägt (oben auf der Hand steht das Ding, `HOLD_POINTS.carry`). */
const CARRY_HAND_Z = HOLD_POINTS.carry.z - 1.8;

/** Hände am Griff der Sackkarre (`handTruck`). */
const TRUCK_HAND_Z = 14.2;

function armPose(look: Look, frame: number): ArmPose | null {
  if (has(look, 'handTruck'))
    return { l: { z: TRUCK_HAND_Z }, r: { z: TRUCK_HAND_Z }, nod: 0, crouch: 0, walk: true };
  const mops = !!has(look, 'mop');
  const work = (CHAR_FRAMES.work as readonly number[]).indexOf(frame);
  if (work >= 0 && !mops) {
    const w = WORK.poses[work];
    if (!w) return null;
    return { l: { z: w.l }, r: { z: w.r }, nod: w.nod, crouch: 0 };
  }
  if ((CHAR_FRAMES.carry as readonly number[]).includes(frame))
    return { r: { z: CARRY_HAND_Z }, nod: 0, crouch: 0 };
  if (frame === CHAR_FRAMES.place) {
    // Bedienung: Tablett nach vorn zum Tisch; sonst beide Hände vorn an der Arbeitsplatte.
    if (has(look, 'tray')) return { r: { z: HOLD_POINTS.trayServe.z - 1.6 }, nod: -0.5, crouch: 0 };
    return { l: { z: 24.2 }, r: { z: 25 }, nod: -0.4, crouch: 0 };
  }
  const whisk = (CHAR_FRAMES.whisk as readonly number[]).indexOf(frame);
  if (whisk >= 0)
    return {
      l: { z: 23.6 },
      r: { z: 25.4, dx: whisk === 0 ? -0.035 : 0.03 },
      nod: whisk === 0 ? -0.6 : -0.3,
      crouch: 0,
      tool: 'chasen',
    };
  const low = (CHAR_FRAMES.low as readonly number[]).indexOf(frame);
  if (low >= 0)
    return {
      l: { z: low === 0 ? 10.4 : 11.6 },
      r: { z: low === 0 ? 11.4 : 10.2 },
      nod: -1.4,
      crouch: low === 0 ? -2.2 : -1.6,
    };
  if (frame === CHAR_FRAMES.pour)
    return { l: { z: 23.8 }, r: { z: 28.2 }, nod: -0.5, crouch: 0, tool: 'pitcher' };
  return null;
}

/** Werkzeug in der rechten Hand (Pose): Bambusbesen nach unten, Milchkännchen gekippt. */
function handTool(f: Fig, look: Look, pose: ArmPose) {
  const r = pose.r;
  if (!r || !pose.tool) return;
  const [x0, x1] = armX(look, 1);
  const x = (x0 + x1) / 2 + (r.dx ?? 0);
  const y = WORK.reach - WORK.hand / 2;
  if (pose.tool === 'chasen') {
    f.tube(x, y, r.z - 4.6, 0.022, 3.6, '#e2c27e', tint('#e2c27e', 0.3));
    f.tube(x, y, r.z - 1, 0.012, 1.6, C.woodDark);
    return;
  }
  f.tube(x, y + 0.02, r.z + 1.4, 0.032, 4.2, K.silver, tint(K.silver, 0.4));
  f.cube(x - 0.008, x + 0.008, y + 0.05, y + 0.075, r.z + 4.2, r.z + 5.2, K.silver);
}

// ---------------------------------------------------------------------------------------------
// Kopf: Gesicht (Accessoires), Haare, Hüte
// ---------------------------------------------------------------------------------------------
function head(f: Fig, look: Look) {
  f.cube(-HEAD.r, HEAD.r, -HEAD.r, HEAD.r, HEAD.z0, HEAD.z1, look.skin);
}

function faceItems(f: Fig, look: Look) {
  const d = HEAD.r;
  for (const item of look.face ?? []) {
    switch (item) {
      case 'sunglasses':
        f.onFront(-0.108, 0.108, d, 26.6, 29.6, '#1f1c26');
        f.onFront(-0.09, -0.03, d + 0.001, 28.4, 29.2, '#4b4660');
        f.onSide(d, 0.0, d, 28.2, 29.2, '#1f1c26');
        break;
      case 'glasses':
        f.onFront(-0.098, -0.018, d, 26.4, 29.6, C.ink);
        f.onFront(0.018, 0.098, d, 26.4, 29.6, C.ink);
        f.onFront(-0.086, -0.03, d + 0.001, 27.2, 28.8, '#dcecf3');
        f.onFront(0.03, 0.086, d + 0.001, 27.2, 28.8, '#dcecf3');
        f.onFront(-0.018, 0.018, d, 28.2, 28.9, C.ink);
        f.onSide(d, 0.0, d, 28.2, 28.9, C.ink);
        break;
      case 'mustache':
        f.onFront(-0.068, 0.068, d, 23.4, 25, look.hair);
        f.onFront(-0.078, -0.05, d, 22.6, 23.6, look.hair);
        f.onFront(0.05, 0.078, d, 22.6, 23.6, look.hair);
        break;
      case 'beard':
        f.onFront(-0.112, 0.112, d, 20.2, 24, look.hair);
        f.onFront(-0.07, 0.07, d + 0.001, 24, 25.2, look.hair);
        f.onSide(d, 0.0, d, 20.2, 25.6, look.hair);
        break;
    }
  }
}

/** Haarteile: `behind` liegt hinter dem Kopf (Vorderansicht: vor dem Kopf zeichnen), sonst danach. */
interface HairParts {
  behind: (f: Fig) => void;
  over: (f: Fig) => void;
}

function hairParts(look: Look): HairParts {
  const h = look.hair;
  const r = HEAD.r;
  const cap =
    (z0: number, z1: number, grow = 0.012, front = 0.006) =>
    (f: Fig) =>
      f.cube(-r - grow, r + grow, -r - grow, r + front, z0, z1, h);
  const back =
    (z0: number, z1: number, grow = 0.012, yFront = -0.015) =>
    (f: Fig) =>
      f.cube(-r - grow, r + grow, -r - grow, yFront, z0, z1, h);
  const sideFront = (f: Fig, z0: number, z1: number) => f.onSide(r + 0.012, 0.0, r, z0, z1, h);
  switch (look.hairStyle) {
    case 'short':
      return { behind: back(25, 31.5), over: cap(31, 35.6) };
    case 'sidePart':
      return {
        behind: back(25, 31.5),
        over: (f) => {
          cap(31, 35.8)(f);
          f.cube(-r - 0.012, 0.05, -0.06, r + 0.01, 35.8, 37.2, h);
          f.onFront(-r, -0.02, r + 0.006, 29.8, 31, h);
        },
      };
    case 'curtains':
      return {
        behind: back(23.5, 31.5, 0.016),
        over: (f) => {
          cap(31, 35.8, 0.016, 0.01)(f);
          f.onFront(-r - 0.01, -0.016, r + 0.01, 29.4, 31, h);
          f.onFront(0.016, r + 0.01, r + 0.01, 29.4, 31, h);
          f.onFront(-r - 0.01, -0.088, r + 0.01, 25.6, 29.4, h);
          f.onFront(0.088, r + 0.01, r + 0.01, 25.6, 29.4, h);
          sideFront(f, 25.6, 31);
        },
      };
    case 'mullet':
      return {
        behind: back(16.5, 31.5, 0.016),
        over: (f) => {
          cap(31, 35.6, 0.014)(f);
          f.cube(-0.08, -0.01, -0.06, 0.06, 35.6, 37, h);
          f.cube(0.02, 0.09, -0.08, 0.03, 35.6, 36.8, h);
          f.onFront(-r, r, r + 0.006, 30, 31, h);
        },
      };
    case 'clawBun':
      return {
        behind: (f) => {
          back(26.5, 32.5)(f);
          f.tube(0, -0.165, 28.6, 0.07, 6.6, h, tint(h, 0.08));
          f.cube(-0.088, 0.088, -0.222, -0.19, 30, 36.8, look.hairAccent ?? K.tortoise);
        },
        over: cap(32, 35.2),
      };
    case 'highBun':
      return {
        behind: back(26.5, 32.5),
        over: (f) => {
          cap(32, 35.2)(f);
          f.tube(0, -0.045, 35, 0.062, 3.8, h, tint(h, 0.08));
        },
      };
    case 'long':
      // Hinter die Ohren gestrichen: Rücken und hintere Flanke, vorn nur schmale Strähnen.
      return {
        behind: back(12.6, 31.5, 0.016, -0.01),
        over: (f) => {
          cap(30.4, 35.8, 0.016, 0.01)(f);
          f.onFront(-r - 0.014, -0.088, r + 0.01, 18.6, 30.4, h);
          f.onFront(0.098, r + 0.014, r + 0.01, 21, 30.4, h);
          f.onSide(r + 0.016, 0.064, r + 0.01, 18.6, 30.4, h);
        },
      };
    case 'bob':
      return {
        behind: back(21.6, 31.5, 0.016, -0.01),
        over: (f) => {
          cap(30.2, 35.8, 0.016, 0.01)(f);
          f.onFront(-r - 0.014, -0.085, r + 0.01, 21.6, 30.2, h);
          f.onFront(0.095, r + 0.014, r + 0.01, 21.6, 30.2, h);
          f.onFront(-r, r, r + 0.01, 29.2, 30.2, h);
          f.onSide(r + 0.016, 0.07, r + 0.01, 21.6, 30.2, h);
        },
      };
    case 'buzz':
      return { behind: back(27.4, 33, 0.006), over: cap(32.6, 34.9, 0.006, 0.004) };
    case 'afro':
      return {
        behind: back(23.5, 30.6, 0.036),
        over: (f) => {
          f.cube(-0.158, 0.158, -0.158, 0.132, 30.2, 39, h);
          bumps(f, h, 39, 0.11, 2.2);
        },
      };
    case 'curly':
      return {
        behind: back(24.5, 31, 0.02),
        over: (f) => {
          f.cube(-0.136, 0.136, -0.136, 0.13, 30.8, 36.2, h);
          bumps(f, h, 36.2, 0.085, 1.8);
        },
      };
    case 'spaceBuns':
      return {
        behind: back(25, 31.5),
        over: (f) => {
          cap(31, 35.6)(f);
          f.tube(-0.075, -0.02, 34.8, 0.055, 4.4, h, tint(h, 0.1));
          f.tube(0.075, -0.02, 34.8, 0.055, 4.4, h, tint(h, 0.1));
        },
      };
    case 'topknot':
      return {
        behind: back(25, 31.5),
        over: (f) => {
          cap(31.4, 35.2, 0.01)(f);
          f.tube(0, -0.015, 35, 0.045, 3.6, h, tint(h, 0.12));
        },
      };
  }
}

/** Locken als drei versetzte Buckel auf dem Haarblock (Silhouette statt glatter Kiste). */
function bumps(f: Fig, h: string, z: number, s: number, dz: number) {
  f.cube(-s - 0.02, -0.01, -s, 0.0, z, z + dz, h);
  f.cube(0.0, s + 0.02, -s - 0.02, -0.02, z, z + dz * 1.2, h);
  f.cube(-s * 0.5, s * 0.6, 0.0, s, z, z + dz * 0.8, h);
}

/** Band um eine Hut-Krone (nur sichtbare Seiten, damit der Deckel nicht übermalt wird). */
function band(f: Fig, r: number, z0: number, z1: number, color: string) {
  f.onFront(-r, r, r, z0, z1, color);
  f.onBack(-r, r, r, z0, z1, color);
  f.onSide(r, -r, r, z0, z1, color);
}

/** Hüte: `behind` (Schirm einer Rückwärts-Cap, Schleife) wie Haare hinter dem Kopf. */
function hatParts(look: Look): HairParts | undefined {
  const c = look.hat;
  if (!c || !look.hatStyle) return undefined;
  const none = () => undefined;
  switch (look.hatStyle) {
    case 'bucket':
      return {
        behind: none,
        over: (f) => {
          f.cube(-0.185, 0.185, -0.185, 0.185, 32.4, 33.6, shade(c, 0.95));
          f.cube(-0.135, 0.135, -0.135, 0.135, 33.6, 38.4, c);
        },
      };
    case 'beanie':
      return {
        behind: none,
        over: (f) => {
          f.cube(-0.13, 0.13, -0.13, 0.13, 32.4, 36.6, c);
          band(f, 0.13, 32.4, 34.4, shade(c, 0.88));
        },
      };
    case 'capBack':
      return {
        behind: (f) => f.cube(-0.085, 0.085, -0.255, -0.13, 32.2, 33.4, shade(c, 0.9)),
        over: (f) => {
          f.cube(-0.133, 0.133, -0.133, 0.13, 32.2, 36.8, c);
          f.onFront(-0.03, 0.03, 0.13, 32.6, 34.4, tint(c, 0.6));
        },
      };
    case 'beret':
      return {
        behind: none,
        over: (f) => {
          f.cube(-0.15, 0.13, -0.15, 0.12, 34, 36.6, c);
          f.cube(-0.015, 0.015, -0.015, 0.015, 36.6, 37.8, shade(c, 0.85));
        },
      };
    case 'sunhat':
      return {
        behind: none,
        over: (f) => {
          f.cube(-0.215, 0.215, -0.215, 0.215, 33.8, 34.8, c);
          f.cube(-0.126, 0.126, -0.126, 0.126, 34.8, 38.8, c);
          band(f, 0.126, 34.8, 36.2, look.hatAccent ?? K.coal);
        },
      };
    case 'toque':
      return {
        behind: none,
        over: (f) => {
          f.cube(-0.132, 0.132, -0.132, 0.132, 31.6, 34.6, c);
          f.cube(-0.15, 0.15, -0.15, 0.15, 34.6, 42.6, c);
          band(f, 0.15, 34.6, 35.4, shade(c, 0.94));
        },
      };
    case 'bow':
      return {
        behind: (f) => {
          f.cube(-0.11, -0.012, -0.17, -0.13, 32.6, 37.4, c);
          f.cube(0.012, 0.11, -0.17, -0.13, 32.6, 37.4, c);
          f.cube(-0.022, 0.022, -0.178, -0.13, 34, 35.8, shade(c, 0.85));
        },
        over: none,
      };
  }
}

/** Höhe über dem Scheitel (für Kopfhörerbügel). */
function crownZ(look: Look): number {
  if (look.hatStyle === 'bucket') return 38.4;
  if (look.hatStyle === 'beanie') return 36.6;
  if (look.hatStyle === 'capBack') return 36.8;
  if (look.hairStyle === 'curtains') return 35.8;
  return 35.6;
}

function headAccessories(f: Fig, look: Look) {
  const d = HEAD.r + 0.016;
  if (has(look, 'hoops')) f.onSide(d, 0.0, 0.026, 21.2, 24, C.gold);
  if (has(look, 'earbuds')) f.onSide(d, -0.004, 0.026, 25, 27.6, K.white);
  if (has(look, 'wiredEarphones')) {
    f.onSide(d, 0.0, 0.022, 25, 27.6, K.white);
    f.onSide(d, 0.006, 0.016, 19.6, 25, K.white);
  }
  const hp = has(look, 'headphones');
  if (hp) {
    const c = hp.color ?? K.silver;
    const z = crownZ(look);
    f.cube(-0.13, 0.13, -0.022, 0.022, z, z + 1.4, c);
    f.cube(0.12, 0.137, -0.022, 0.022, 30.5, z, c);
    f.cube(0.125, 0.172, -0.058, 0.058, 23.6, 31, c);
    f.onSide(0.172, -0.04, 0.04, 25, 29.6, shade(c, 0.85));
  }
}

// ---------------------------------------------------------------------------------------------
// Requisiten
// ---------------------------------------------------------------------------------------------
function cup(f: Fig, x: number, y: number, layers: readonly string[]) {
  const r = 0.044;
  let z = 6.4;
  const step = 7.2 / layers.length;
  for (const col of layers) {
    f.tube(x, y, z, r, step, col);
    z += step;
  }
  f.tube(x, y, z, r * 1.04, 1, tint(C.glass, 0.5), K.white);
  const sx = x + 0.008;
  f.cube(sx - 0.007, sx + 0.007, y - 0.007, y + 0.007, z + 1, z + 5.2, C.matchaDeep);
}

const ICED = [K.milk, K.matchaDrink, tint(K.matchaDrink, 0.25)];
const STRAWBERRY = [K.strawberry, K.milk, K.matchaDrink];

/** Requisiten in der linken Hand: vor dem linken Arm zeichnen (liegen dahinter). */
function leftHandProps(f: Fig, look: Look, dy: number) {
  for (const q of look.props ?? []) {
    if (!q.left) continue;
    if (q.kind === 'icedMatcha') cup(f, -0.205, dy, ICED);
    if (q.kind === 'strawberryMatcha') cup(f, -0.205, dy, STRAWBERRY);
  }
}

/** Requisiten auf dem Rücken (Rucksäcke, Kapuze): Vorderansicht zuerst, Rückansicht zuletzt. */
function backItems(f: Fig, look: Look) {
  const t = torsoBox(look);
  if (look.topStyle === 'hoodie' || look.topStyle === 'shell' || look.topStyle === 'blazerHoodie') {
    const hood = look.topStyle === 'blazerHoodie' ? (look.topAccent ?? K.offwhite) : look.top;
    f.cube(-0.095, 0.095, -t.y - 0.055, -t.y + 0.02, 18.6, 22.6, hood);
  }
  const bp = has(look, 'backpack');
  if (bp) {
    const c = bp.color ?? K.mustard;
    f.cube(-0.105, 0.105, -t.y - 0.06, -t.y, 9.4, 19.6, c);
    f.cube(-0.068, 0.068, -t.y - 0.08, -t.y - 0.06, 10.2, 14.4, shade(c, 0.9));
    f.onBack(-0.03, 0.03, t.y + 0.08, 15.6, 18, bp.accent ?? tint(c, 0.5));
  }
  const big = has(look, 'bigBackpack');
  if (big) {
    const c = big.color ?? K.red;
    f.cube(-0.118, 0.118, -t.y - 0.115, -t.y, 8.6, 36.4, c);
    f.cube(-0.122, 0.122, -t.y - 0.12, -t.y + 0.004, 36.4, 39, shade(c, 0.85));
    f.onBack(-0.075, 0.075, t.y + 0.115, 11, 18, shade(c, 0.88));
    f.onSide(0.118, -t.y - 0.1, -t.y - 0.02, 12, 19, shade(c, 0.88));
    f.cube(-0.155, 0.155, -t.y - 0.1, -t.y - 0.02, 39, 42.6, big.accent ?? K.teal);
  }
}

/** Gurte und Dinge vor der Brust: nur in der Vorderansicht sichtbar. */
function frontBodyProps(f: Fig, look: Look) {
  const t = torsoBox(look);
  const d = t.y + 0.003;
  if (has(look, 'backpack') || has(look, 'bigBackpack')) {
    f.onFront(-0.09, -0.068, d, 11, TORSO.z1, K.coal);
    f.onFront(0.068, 0.09, d, 11, TORSO.z1, K.coal);
  }
  if (has(look, 'chain')) {
    f.onFront(-0.05, 0.05, d, 17.8, 18.5, K.silver);
    f.onFront(-0.012, 0.012, d + 0.001, 16.6, 17.8, K.silver);
  }
  if (has(look, 'wiredEarphones')) f.onFront(0.064, 0.076, d, 12, TORSO.z1, K.white);
  const cb = has(look, 'crossbody');
  if (cb) {
    const c = cb.color ?? K.coal;
    if (f.facingCamera) {
      // Gurt diagonal von der rechten Schulter zur linken Hüfte
      f.poly(
        [
          [0.11, d + 0.003, TORSO.z1],
          [0.08, d + 0.003, TORSO.z1],
          [-0.11, d + 0.003, 11.4],
          [-0.11, d + 0.003, 13.2],
        ],
        shade(c, SHADE.left),
      );
      f.cube(-0.13, -0.025, d, d + 0.04, 9.6, 13.6, c);
      f.onFront(-0.115, -0.04, d + 0.04, 11.8, 12.4, tint(c, 0.3));
    } else {
      f.poly(
        [
          [-0.11, t.y + 0.006, TORSO.z1],
          [-0.08, t.y + 0.006, TORSO.z1],
          [0.11, t.y + 0.006, 11.4],
          [0.11, t.y + 0.006, 13.2],
        ],
        shade(c, SHADE.left),
      );
    }
  }
  if (has(look, 'neckCamera') && f.facingCamera) {
    f.onFront(-0.072, -0.058, d, 14.8, TORSO.z1, K.coal);
    f.onFront(0.058, 0.072, d, 14.8, TORSO.z1, K.coal);
    f.cube(-0.062, 0.062, d, d + 0.04, 11.6, 15.6, C.ink);
    f.cube(-0.06, 0.03, d, d + 0.041, 15.6, 16.4, K.silver);
    f.cube(-0.026, 0.026, d + 0.04, d + 0.07, 12.4, 15, '#4a5070');
  }
  if (has(look, 'chawan') && f.facingCamera) {
    f.tube(0.02, d + 0.06, 12.6, 0.06, 3.6, K.offwhite);
    f.disc(0.02, d + 0.06, 16.2, 0.046, K.matchaDrink);
  }
}

/** Requisiten an der sichtbaren Flanke (rechte Hand, Schulter, unter dem Arm). */
function sideProps(f: Fig, look: Look, dy: number, trayForward = false) {
  for (const q of look.props ?? []) {
    if (q.left) continue;
    switch (q.kind) {
      case 'icedMatcha':
        cup(f, 0.205, dy, ICED);
        break;
      case 'strawberryMatcha':
        cup(f, 0.205, dy, STRAWBERRY);
        break;
      case 'tumbler': {
        const c = q.color ?? K.pink;
        f.cube(0.255, 0.285, -0.018, 0.018, 9.4, 15.6, shade(c, 0.9));
        f.tube(0.215, dy, 4.8, 0.054, 12.6, c, tint(c, 0.2));
        f.tube(0.215, dy, 17.4, 0.057, 1.6, shade(c, 0.85), tint(c, 0.35));
        f.cube(0.222, 0.236, dy - 0.007, dy + 0.007, 19, 23.4, tint(c, 0.55));
        break;
      }
      case 'tote': {
        const c = q.color ?? K.canvas;
        f.cube(0.168, 0.182, -0.016, 0.016, 13.2, ARM.z1 + 0.6, c);
        f.cube(0.18, 0.226, -0.105, 0.105, 3.4, 13.6, c);
        f.onSide(0.226, -0.045, 0.045, 6.4, 10.8, q.accent ?? C.matcha);
        f.onSide(0.226, -0.02, 0.02, 7.6, 9.6, tint(q.accent ?? C.matcha, 0.5));
        // Plüschmonster als Anhänger
        f.cube(0.198, 0.232, 0.105, 0.135, 2.6, 6, K.plush);
        f.cube(0.2, 0.21, 0.11, 0.122, 6, 7.4, K.plush);
        f.cube(0.22, 0.23, 0.11, 0.122, 6, 7.4, K.plush);
        break;
      }
      case 'laptop':
        f.cube(0.182, 0.2, -0.115, 0.115, 9.2, 17.6, q.color ?? K.silver);
        f.onSide(0.2, 0.02, 0.07, 12, 14.6, q.accent ?? K.pink);
        f.onSide(0.2, -0.07, -0.035, 14.2, 15.8, C.gold);
        break;
      case 'tablet':
        f.cube(0.182, 0.196, -0.07 + dy, 0.07 + dy, 8.8, 17, C.ink);
        f.onSide(0.196, -0.055 + dy, 0.055 + dy, 9.8, 16, '#5a7fd0');
        break;
      case 'yogaMat': {
        const c = q.color ?? K.lilac;
        f.cube(0.172, 0.222, -0.2, 0.2, 13.4, 17.4, c);
        f.onSide(0.222, -0.2, 0.2, 14.8, 15.6, tint(c, 0.35));
        break;
      }
      case 'digicam':
        f.cube(0.178, 0.236, -0.035 + dy, 0.035 + dy, 8.6, 12.4, K.silver);
        f.onSide(0.236, -0.018 + dy, 0.018 + dy, 9.4, 11.6, '#3a3f58');
        break;
      case 'notebook': {
        const c = q.color ?? K.red;
        f.cube(0.18, 0.204, -0.06 + dy, 0.06 + dy, 8.6, 16, c);
        f.onSide(0.204, -0.06 + dy, -0.045 + dy, 8.6, 16, K.white);
        f.cube(0.204, 0.212, 0.03 + dy, 0.042 + dy, 12, 18.6, C.gold);
        break;
      }
      case 'mop': {
        // Wischen (Arbeits-Frames): Moppkopf vor und zurück, der Stiel kippt mit.
        const my = dy * 2.2;
        f.cube(0.15, 0.29, -0.075 + my, 0.075 + my, 0, 2.6, '#c9d6e6');
        if (Math.abs(my) < 1e-6) {
          f.cube(0.214, 0.23, -0.009, 0.009, 2.6, 31, C.woodDark);
          break;
        }
        const [bx, by] = f.at(0.222, my, 2.6);
        const [tx, ty] = f.at(0.222, -0.01, 31);
        const n = (v: number) => v.toFixed(2);
        f.raw(
          `<polygon points="${n(bx - 0.6)},${n(by)} ${n(bx + 0.6)},${n(by)} ${n(tx + 0.6)},${n(ty)} ${n(tx - 0.6)},${n(ty)}" fill="${shade(C.woodDark, SHADE.left)}"/>`,
        );
        break;
      }
      case 'tray': {
        // Leeres Tablett auf der flachen Hand; was darauf steht, legt die Szene als eigene Sprites hinein
        // (`HOLD_POINTS.tray`). Beim Abstellen (`trayForward`) geht es nach vorn zum Tisch.
        const c = q.color ?? K.silver;
        const at = trayForward ? HOLD_POINTS.trayServe : HOLD_POINTS.tray;
        const y = at.y + (trayForward ? 0 : dy);
        f.cube(at.x - 0.075, at.x + 0.075, y - 0.1, y + 0.1, at.z - 1.4, at.z - 0.6, shade(c, 0.9));
        f.cube(at.x - 0.065, at.x + 0.065, y - 0.09, y + 0.09, at.z - 0.6, at.z, tint(c, 0.4));
        break;
      }
      case 'chasen':
        f.tube(0.205, dy, 5.2, 0.034, 4.4, '#e2c27e', tint('#e2c27e', 0.3));
        f.tube(0.205, dy, 9.6, 0.017, 3.4, C.woodDark);
        break;
      case 'pretzel': {
        const [cx, cy] = f.at(0.21, dy, 10);
        const x = (n: number) => (cx + n).toFixed(2);
        const y = (n: number) => (cy + n).toFixed(2);
        f.raw(
          `<path fill-rule="evenodd" fill="#b8722e" d="M${x(-4.6)},${y(1.6)} C${x(-6.4)},${y(-4.2)} ${x(-1.2)},${y(-5)} ${x(0)},${y(-1.6)} C${x(1.2)},${y(-5)} ${x(6.4)},${y(-4.2)} ${x(4.6)},${y(1.6)} C${x(3)},${y(4.4)} ${x(-3)},${y(4.4)} ${x(-4.6)},${y(1.6)} Z M${x(-2.6)},${y(-0.4)} a1.2,1.2 0 1,0 0.01,0 Z M${x(2.6)},${y(-0.4)} a1.2,1.2 0 1,0 0.01,0 Z"/>`,
        );
        f.raw(
          `<circle cx="${x(-3.4)}" cy="${y(1.8)}" r="0.45" fill="${K.white}"/><circle cx="${x(1.8)}" cy="${y(2.4)}" r="0.45" fill="${K.white}"/><circle cx="${x(3.6)}" cy="${y(-1.8)}" r="0.45" fill="${K.white}"/>`,
        );
        break;
      }
      default:
        break;
    }
  }
}

/** Dinge über Kopfhöhe neben der Figur: Ringlicht, Selfie-Stick, Mikro. */
function overheadProps(f: Fig, look: Look) {
  if (has(look, 'ringLight')) {
    f.cube(0.206, 0.218, -0.006, 0.006, 9, 33, '#3a3f58');
    const [cx, cy] = f.at(0.212, 0, 38.6);
    const c = (n: number) => n.toFixed(2);
    f.raw(
      `<path fill-rule="evenodd" fill="${K.white}" d="M${c(cx - 6)},${c(cy)} a6,6 0 1,0 12,0 a6,6 0 1,0 -12,0 Z M${c(cx - 3.9)},${c(cy)} a3.9,3.9 0 1,0 7.8,0 a3.9,3.9 0 1,0 -7.8,0 Z"/>` +
        `<rect x="${c(cx - 1.3)}" y="${c(cy - 2.2)}" width="2.6" height="4.4" rx="0.6" fill="${C.ink}"/>`,
    );
  }
  if (has(look, 'selfieStick')) {
    const [hx, hy] = f.at(0.205, 0, 10);
    const [tx, ty] = f.at(0.33, -0.06, 41);
    const c = (n: number) => n.toFixed(2);
    f.raw(
      `<polygon points="${c(hx - 0.5)},${c(hy)} ${c(hx + 0.5)},${c(hy)} ${c(tx + 0.5)},${c(ty)} ${c(tx - 0.5)},${c(ty)}" fill="#3a3f58"/>` +
        `<rect x="${c(tx - 2.2)}" y="${c(ty - 3.6)}" width="4.4" height="6" rx="0.8" fill="${K.pink}"/>` +
        `<rect x="${c(tx - 1.2)}" y="${c(ty - 2.8)}" width="1.3" height="1.3" rx="0.4" fill="${C.ink}"/>`,
    );
  }
  if (has(look, 'mic')) {
    f.cube(0.198, 0.212, 0.022, 0.036, 9.6, 21, '#3a3f58');
    const [cx, cy] = f.at(0.205, 0.03, 24.4);
    fluffy(f, cx, cy, 4.6, 4, '#b9afa2');
  }
}

/** Zottelige Form (Fell-Windschutz): Stern mit vielen kurzen Zacken, oben hell, unten dunkler. */
function fluffy(f: Fig, cx: number, cy: number, rx: number, ry: number, color: string) {
  const n = 22;
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const k = i % 2 ? 0.8 : 1;
    pts.push(`${(cx + Math.cos(a) * rx * k).toFixed(2)},${(cy + Math.sin(a) * ry * k).toFixed(2)}`);
  }
  f.raw(`<polygon points="${pts.join(' ')}" fill="${shade(color, SHADE.left)}"/>`);
  f.raw(
    `<ellipse cx="${(cx - 0.6).toFixed(2)}" cy="${(cy - 0.9).toFixed(2)}" rx="${(rx * 0.62).toFixed(2)}" ry="${(ry * 0.55).toFixed(2)}" fill="${tint(color, 0.18)}"/>`,
  );
}

// ---------------------------------------------------------------------------------------------
// Zusammensetzen
// ---------------------------------------------------------------------------------------------
/** In der Hand gehalten (rechte Hand): Der Arm schwingt beim Laufen nicht, die Arbeits-Pose legt es weg. */
const HELD: readonly PropKind[] = [
  'icedMatcha',
  'strawberryMatcha',
  'tumbler',
  'tablet',
  'digicam',
  'notebook',
  'mop',
  'tray',
  'chasen',
  'pretzel',
  'ringLight',
  'selfieStick',
  'mic',
  'laptop',
  'yogaMat',
];

function figure(
  look: Look,
  dir: Dir,
  frame: number,
  shadow = true,
  seated = false,
  canvas: FigCanvas = CHAR_CANVAS,
): string {
  const f = new Fig(dir, canvas);
  const work = (CHAR_FRAMES.work as readonly number[]).indexOf(frame);
  const carry = (CHAR_FRAMES.carry as readonly number[]).indexOf(frame);
  const mops = !!has(look, 'mop');
  const trays = !!has(look, 'tray');
  const arms = seated ? null : armPose(look, frame);
  // Tragen: die rechte Hand ist vorn (die Szene legt Becher, Teller oder Geschirr hinein), Gehaltenes liegt weg.
  if (carry >= 0)
    look = {
      ...look,
      props: (look.props ?? []).filter((q) => q.left || !HELD.includes(q.kind)),
    };
  // Arbeiten mit beiden Händen: gehaltene Dinge (Tablet) liegen solange weg; das Tablett der Bedienung bleibt.
  else if (arms && !(trays && frame === CHAR_FRAMES.place))
    look = { ...look, props: (look.props ?? []).filter((q) => !HELD.includes(q.kind)) };
  const walkPose = carry >= 0 ? carry : arms && !arms.walk ? 0 : frame;
  const pose = POSES[walkPose] ?? POSES[0];
  if (!pose) throw new Error('no pose');
  const holds = (look.props ?? []).some((q) => !q.left && HELD.includes(q.kind));
  // Wischen: Arm und Mopp gehen gemeinsam vor und zurück.
  const mopSwing = work >= 0 && mops ? (work === 0 ? 0.035 : -0.035) : 0;
  const armR = mopSwing || (holds ? 0 : pose.armR);
  const holdsLeft = (look.props ?? []).some((q) => q.left);
  const armL = mopSwing ? -mopSwing : holdsLeft || has(look, 'chawan') ? 0 : pose.armL;
  const L = arms?.l;
  const R = arms?.r;
  const crouch = arms?.crouch ?? 0;
  const hair = hairParts(look);
  const hat = hatParts(look);

  if (shadow) {
    const [sx, sy] = f.at(0, 0, 0);
    f.raw(
      `<ellipse cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" rx="9.2" ry="4.2" fill="${C.ink}" fill-opacity="0.18"/>`,
    );
  }
  // Sackkarre von hinten gesehen: liegt hinter der Figur.
  if (!f.facingCamera) handTruck(f, look);
  // Tief greifen: alles über den Beinen sitzt etwas tiefer (in die Knie gehen).
  f.lift = crouch;
  if (f.facingCamera) {
    backItems(f, look);
    hair.behind(f);
    hat?.behind(f);
  }
  leftHandProps(f, look, armL);
  const t = torsoBox(look);
  if (L) {
    // Rückansicht: der linke Unterarm liegt hinter dem Rumpf; Vorderansicht: vor der Brust (nach dem Rumpf).
    if (!f.facingCamera) forearm(f, look, -1, L.z, 0, L.dx);
    upperArm(f, look, -1);
  } else arm(f, look, -1, armL);
  f.lift = 0;
  if (seated) {
    seatedLeg(f, look, -1);
    seatedLeg(f, look, 1);
  } else {
    leg(f, look, -1, pose.legL, pose.liftL);
    leg(f, look, 1, pose.legR, pose.liftR);
  }
  f.lift = crouch;
  skirt(f, look);
  torso(f, look);
  torsoDetails(f, look);
  frontBodyProps(f, look);
  if (L && f.facingCamera) forearm(f, look, -1, L.z, t.y + 0.004, L.dx);
  if (R) {
    if (f.facingCamera) {
      upperArm(f, look, 1);
      forearm(f, look, 1, R.z, 0, R.dx);
    } else {
      forearm(f, look, 1, R.z, 0, R.dx);
      upperArm(f, look, 1);
    }
    if (arms) handTool(f, look, arms);
  } else arm(f, look, 1, armR);
  // Bei der Arbeit nickt der Kopf im Takt der Hände (blickt auf Kasse bzw. Gerät).
  f.lift = crouch + (arms?.nod ?? 0);
  head(f, look);
  faceItems(f, look);
  if (!f.facingCamera) {
    hair.behind(f);
    hat?.behind(f);
  }
  hair.over(f);
  hat?.over(f);
  headAccessories(f, look);
  f.lift = crouch;
  sideProps(f, look, mopSwing ? mopSwing : armR, trays && frame === CHAR_FRAMES.place);
  if (!f.facingCamera) backItems(f, look);
  overheadProps(f, look);
  f.lift = 0;
  if (f.facingCamera) handTruck(f, look);
  return f.svg();
}

/** Sackkarre (Lieferant): Maße in Figur-Koordinaten, die Griffe liegen an den Händen. */
const TRUCK = {
  /** Holme in Schulterbreite: genau unter den Händen (`armX`). */
  railX: 0.152,
  /** Rahmen: unten an der Schaufel, oben am Griff (y vor der Figur, z in Pixeln). */
  railBottom: { y: 0.235, z: 0.9 },
  railTop: { y: 0.185, z: 15 },
  plate: { x: 0.13, y0: 0.235, y1: 0.36, z: 0.9 },
  wheelX: 0.172,
  wheelY: 0.232,
  wheelR: 2.1,
  /** Kartons übereinander auf der Schaufel: halbe Breite, y-Bereich, Höhe. */
  boxes: [
    { x: 0.125, y0: 0.245, y1: 0.36, z0: 0.9, z1: 6.6 },
    { x: 0.115, y0: 0.25, y1: 0.355, z0: 6.6, z1: 11.6 },
    { x: 0.105, y0: 0.255, y1: 0.35, z0: 11.6, z1: 15.8 },
  ],
} as const;

/**
 * Sackkarre vor der Figur: Rahmen mit Griff an den Händen, Schaufel auf dem Boden, zwei Räder und 0–3 Kartons
 * mit Klebeband und grünem Etikett. Gezeichnet von hinten nach vorn: in der Vorderansicht Rahmen → Kartons, von
 * hinten Kartons → Rahmen (dann folgt die Figur).
 */
function handTruck(f: Fig, look: Look) {
  const q = has(look, 'handTruck');
  if (!q) return;
  const steel = q.color ?? K.coal;
  const kraft = q.accent ?? '#c99f63';
  const n = (v: number) => v.toFixed(2);
  const T = TRUCK;
  const [sx, sy] = f.at(0, (T.plate.y0 + T.plate.y1) / 2, 0);
  f.raw(
    `<ellipse cx="${n(sx)}" cy="${n(sy)}" rx="6" ry="2.8" fill="${C.ink}" fill-opacity="0.16"/>`,
  );
  const rod = (x: number, w: number, color: string) => {
    const [ax, ay] = f.at(x, T.railBottom.y, T.railBottom.z);
    const [bx, by] = f.at(x, T.railTop.y, T.railTop.z);
    f.raw(
      `<polygon points="${n(ax - w)},${n(ay)} ${n(ax + w)},${n(ay)} ${n(bx + w)},${n(by)} ${n(bx - w)},${n(by)}" fill="${color}"/>`,
    );
  };
  const frame = () => {
    rod(-T.railX, 0.55, shade(steel, SHADE.left));
    rod(T.railX, 0.55, steel);
    // Querstreben und Griff
    for (const t of [0.35, 0.7]) {
      const y = T.railBottom.y + (T.railTop.y - T.railBottom.y) * t;
      const z = T.railBottom.z + (T.railTop.z - T.railBottom.z) * t;
      f.cube(-T.railX, T.railX, y - 0.006, y + 0.006, z - 0.4, z + 0.4, steel);
    }
    f.cube(
      -T.railX - 0.012,
      T.railX + 0.012,
      T.railTop.y - 0.01,
      T.railTop.y + 0.01,
      T.railTop.z - 1,
      T.railTop.z + 0.2,
      K.coal,
    );
  };
  const plate = () =>
    f.cube(-T.plate.x, T.plate.x, T.plate.y0, T.plate.y1, 0, T.plate.z, shade(steel, 1.15));
  const wheel = (x: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const [px, py] = f.at(x, T.wheelY + Math.cos(a) * 0.066, T.wheelR + Math.sin(a) * T.wheelR);
      pts.push(`${n(px)},${n(py)}`);
    }
    f.raw(`<polygon points="${pts.join(' ')}" fill="${C.rubber}"/>`);
    const [hx, hy] = f.at(x, T.wheelY, T.wheelR);
    f.raw(`<circle cx="${n(hx)}" cy="${n(hy)}" r="0.75" fill="${C.galvanized}"/>`);
  };
  const boxes = () => {
    T.boxes.slice(0, Math.max(0, q.count ?? 0)).forEach((b, i) => {
      const c = i % 2 ? tint(kraft, 0.08) : kraft;
      f.cube(-b.x, b.x, b.y0, b.y1, b.z0, b.z1, c);
      const ym = (b.y0 + b.y1) / 2;
      f.cube(-b.x, b.x, ym - 0.012, ym + 0.012, b.z1, b.z1 + 0.15, tint(kraft, 0.5));
      f.onSide(b.x, b.y0 + 0.025, b.y0 + 0.06, b.z0 + 1.4, b.z0 + 3.6, C.matcha);
    });
  };
  if (f.facingCamera) {
    frame();
    plate();
    wheel(-T.wheelX);
    boxes();
    wheel(T.wheelX);
    return;
  }
  plate();
  wheel(-T.wheelX);
  boxes();
  frame();
  wheel(T.wheelX);
}

/** Lieferant des Matcha-Großhandels: Kappe und Polo in Grün, Cargo-Shorts, schiebt die Sackkarre. */
function courierLook(boxes: number): Look {
  return {
    skin: K.skin3,
    hair: K.dark,
    hairStyle: 'short',
    hat: C.matchaDeep,
    hatStyle: 'capBack',
    top: C.matcha,
    topStyle: 'tee',
    bottom: K.khaki,
    bottomStyle: 'cargo',
    shoes: K.coal,
    shoeStyle: 'sneaker',
    socks: K.white,
    props: [{ kind: 'handTruck', color: K.coal, count: boxes }],
  };
}

function lookFrames(
  prefix: string,
  look: Look,
  frames: readonly number[],
  sits = false,
  canvas: FigCanvas = CHAR_CANVAS,
): SpriteDef[] {
  const out: SpriteDef[] = [];
  for (const dir of ['front', 'back'] as const) {
    for (const frame of frames)
      out.push({
        name: `${prefix}-${dir}-${String(frame)}`,
        svg: figure(look, dir, frame, true, false, canvas),
      });
    if (sits)
      out.push({
        name: `${prefix}-sit-${dir}`,
        svg: figure(look, dir, CHAR_FRAMES.stand, true, true),
      });
  }
  return out;
}

/**
 * Alle Figuren-Frames: `customer-<typ>-<look>-<dir>-<frame>` plus Sitzpose `customer-<typ>-<look>-sit-<dir>`
 * (Gäste am Tisch) und `staff-<rolle>-<look>-<dir>-<frame>`. Personal bekommt nur die Frames seiner Rolle
 * (`STAFF_FRAMES`: Arbeiten, Laufen, Tragen), das spart Atlas-Fläche.
 */
export function characterSprites(): SpriteDef[] {
  const out: SpriteDef[] = [];
  const customerFrames = CUSTOMER_FRAMES;
  for (const [type, looks] of Object.entries(CUSTOMER_LOOKS))
    for (const id of looks) {
      const look = CUSTOMER_LOOK_DEFS[id];
      if (!look) throw new Error(`No customer look: ${id}`);
      out.push(...lookFrames(`customer-${type}-${id}`, look, customerFrames, true));
    }
  for (const [role, looks] of Object.entries(STAFF_LOOKS))
    for (const id of looks) {
      const look = STAFF_LOOK_DEFS[`${role}-${id}`];
      if (!look) throw new Error(`No staff look: ${role}-${id}`);
      out.push(...lookFrames(`staff-${role}-${id}`, look, STAFF_FRAMES[role as StaffRoleId]));
    }
  // Lieferant mit 0 … maxBoxes Kartons: `courier-<n>-<dir>-<frame>`.
  for (let boxes = 0; boxes <= COURIER.maxBoxes; boxes++)
    out.push(
      ...lookFrames(
        `courier-${String(boxes)}`,
        courierLook(boxes),
        COURIER.frames,
        false,
        COURIER_CANVAS,
      ),
    );
  return out;
}

/** Portrait ohne Bodenschatten (HUD-Avatar des Filialleiters). */
export function staffPortrait(role: StaffRoleId): string {
  const id = STAFF_LOOKS[role][0];
  const look = id ? STAFF_LOOK_DEFS[`${role}-${id}`] : undefined;
  if (!look) throw new Error(`No staff look: ${role}`);
  return figure(look, 'front', CHAR_FRAMES.stand, false);
}
