import Phaser from 'phaser';
import {
  CITY,
  CITY_GRID,
  CITY_SPRITE,
  CITY_STYLE,
  FLIP_ON_V,
  buildingHeight,
  getCityPalette,
  groundCellFor,
  hash01,
  isLitWindow,
  isStreetTile,
  propCanvas,
  propFrame,
  roadMarkTiles,
  roofHeight,
  sidewalkJointLines,
  upperCellFor,
  type BuildingDef,
  type CityPalette,
  type FacadeFace,
  type GridRect,
  type GroundKind,
  type PropDef,
} from '@data/city';
import { CHAR_FRAMES, CHAR_WALK, CUSTOMER_LOOKS } from '@data/art';
import { CUSTOMER_TYPES } from '@data/customerTypes';
import { ART_SCALE, ATLAS, CHAR_FOOT_ORIGIN_Y, FRAME } from '../art';
import { TILE_H, isoDepth, toScreen } from '../iso/iso';
import { StreetLife } from './streetLife';

/**
 * Tiefen der Stadt (alles hinter dem Café): unten der Boden, darüber die Dampfer, darüber noch einmal die
 * Brückendecks (die Dampfer fahren darunter durch statt darüber), darüber die Häuser-Ebene (`Layer`: ferne Häuser,
 * Fassaden-Module und Hofobjekte nach Position, zuletzt alle Dächer), die auch vor ihnen liegende Dampfer verdeckt.
 * Die Ebene wird nur beim Aufbau sortiert – die bewegten Figuren der Szene lösen kein Umsortieren der vielen
 * Stadt-Sprites aus.
 */
const LAYER = { lod: -1e7 + 1, roofs: 1e7 } as const;
const GROUND_DEPTH = -9000;
const BOAT_DEPTH = GROUND_DEPTH + 1;
const DECK_DEPTH = GROUND_DEPTH + 2;
const HOUSE_DEPTH = GROUND_DEPTH + 3;
/** Helligkeit der sichtbaren Seiten (UI_STYLE § 4): links (+y) 85 %, rechts (+x) 70 %; Dachflächen eigene Stufen. */
const SHADE_A = 0.85;
const SHADE_B = 0.7;
const ROOF_SHADE = { back: 1.06, end: 1.0, left: 0.9, right: 0.76 } as const;
/** Pixel Höhe je Kachel Abstand entlang des Blickstrahls (2:1-Iso): z = 32 · k. */
const RAY_PER_TILE = TILE_H;
/** Nur in diesem Grid-Fenster lohnen Fugen, Wellen und Markierungen (weiter weg liegt alles hinter Häusern). */
const DETAIL: GridRect = { x0: -70, y0: -70, x1: 70, y1: 70 };

const hex = (h: string): number => parseInt(h.slice(1), 16);
function shadeNum(n: number, f: number): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
function mixNum(a: number, b: number, t: number): number {
  const c = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** Grid-Punkt (x, y) in Höhe z → Bildschirm. */
function P(x: number, y: number, z = 0): { x: number; y: number } {
  const s = toScreen(x, y);
  return { x: s.x, y: s.y - z };
}

type V3 = readonly [number, number, number];

/** Ursprung eines Sprites aus seiner Leinwand (Bodenpunkt). */
function originOf(s: { w: number; h: number; ox: number; oy: number }): [number, number] {
  return [s.ox / s.w, s.oy / s.h];
}

type Depthy = Phaser.GameObjects.GameObject & { setDepth: (d: number) => unknown };

/**
 * Stadtviertel um das Café (`data/city.ts`): Boden, Dächer und ferne Häuser als flache Flächen (Phaser Graphics,
 * einmal gezeichnet), nahe Altbauten aus Fassaden-Modulen des Themen-Atlas, Straßen-Objekte und bewegte
 * Autos/Passanten/Dampfer aus dem `city`-Atlas. Rein kosmetisch.
 */
export class CityView {
  private readonly palette: CityPalette;
  private readonly life: StreetLife;
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly carSprites: Phaser.GameObjects.Image[] = [];
  private readonly walkerSprites: Phaser.GameObjects.Image[] = [];
  private readonly boatSprites: Phaser.GameObjects.Image[] = [];
  private readonly lit: Phaser.GameObjects.Image[] = [];
  private readonly lampGlows: Phaser.GameObjects.Image[] = [];
  private readonly pedLights: { sprite: Phaser.GameObjects.Image; road: 'u' | 'v' }[] = [];
  private readonly trafficLights: { sprite: Phaser.GameObjects.Image; axis: 'u' | 'v' }[] = [];
  private readonly pigeonSprites: Phaser.GameObjects.Image[] = [];
  private readonly fountains: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private shownLit = false;
  private clock = 0;
  /** Höhe (px) belegter Kacheln: Häuser und die Café-Box; daraus der Verdeckungstest der Fassaden-Module. */
  private readonly occupied = new Map<string, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly locationId: string,
    /** Grundfläche des Cafés in Kacheln (verdeckt die Erdgeschosse dahinter). */
    cafe: GridRect,
    /** Tiefe der Lichter über dem Nachtfilter. */
    private readonly lightDepth: number,
  ) {
    this.palette = getCityPalette(locationId);
    scene.cameras.main.setBackgroundColor(this.palette.haze);
    this.layer = scene.add.layer().setDepth(HOUSE_DEPTH);
    for (let x = cafe.x0; x < cafe.x1; x++)
      for (let y = cafe.y0; y < cafe.y1; y++)
        this.occupied.set(`${String(x)},${String(y)}`, CITY_STYLE.cafeH);
    for (const b of CITY.buildings)
      for (let x = b.rect.x0; x < b.rect.x1; x++)
        for (let y = b.rect.y0; y < b.rect.y1; y++) {
          const k = `${String(x)},${String(y)}`;
          this.occupied.set(k, Math.max(this.occupied.get(k) ?? 0, buildingHeight(b)));
        }

    this.drawGround();
    this.drawDecks();
    const visible = CITY.buildings.filter((b) => this.inView(b));
    const lod = scene.add.graphics();
    this.addToLayer(lod, LAYER.lod);
    for (const b of visible) if (b.lod) this.drawLodFacade(lod, b);
    visible.forEach((b, i) => {
      if (!b.lod) this.drawCells(b, i);
    });
    const roofs = scene.add.graphics();
    this.addToLayer(roofs, LAYER.roofs);
    // Dächer von hinten nach vorn (nach Mittelpunkt), alle nach den Fassaden.
    const sum = (b: BuildingDef) => b.rect.x0 + b.rect.x1 + b.rect.y0 + b.rect.y1;
    for (const b of [...visible].sort((a, b) => sum(a) - sum(b))) this.drawRoof(roofs, b);
    for (const p of CITY.backProps) this.placeProp(p, true);
    for (const p of CITY.props) this.placeProp(p, false);
    this.life = new StreetLife(CITY);
    this.createMovers();
  }

  /** Welt-Rechteck, in dem die Kamera mit ihrem ganzen Ausschnitt bleibt (kein Rand sichtbar). */
  static viewLimits(): Phaser.Geom.Rectangle {
    const v = CITY.view;
    return new Phaser.Geom.Rectangle(v.left, v.top, v.right - v.left, v.bottom - v.top);
  }

  private addToLayer(obj: Depthy, depth: number): void {
    obj.setDepth(depth);
    this.layer.add(obj);
  }

  /** Liegt das Haus (mit Dach) irgendwo im erlaubten Kamera-Ausschnitt? */
  private inView(b: BuildingDef): boolean {
    const v = CITY.view;
    const r = b.rect;
    const left = toScreen(r.x0, r.y1).x;
    const right = toScreen(r.x1, r.y0).x;
    const bottom = toScreen(r.x1, r.y1).y;
    const top = toScreen(r.x0, r.y0).y - buildingHeight(b) - CITY_STYLE.roofMax;
    return right > v.left && left < v.right && bottom > v.top && top < v.bottom;
  }

  // ---------------------------------------------------------------------------------------------
  // Flächen
  // ---------------------------------------------------------------------------------------------
  /** Viereck als zwei Dreiecke (ohne Triangulierung je Frame). */
  private quad(g: Phaser.GameObjects.Graphics, pts: readonly V3[], color: number): void {
    const [a, b, c, d] = pts.map(([x, y, z]) => P(x, y, z));
    if (!a || !b || !c || !d) return;
    g.fillStyle(color, 1);
    g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    g.fillTriangle(a.x, a.y, c.x, c.y, d.x, d.y);
  }

  private tri(g: Phaser.GameObjects.Graphics, pts: readonly V3[], color: number): void {
    const [a, b, c] = pts.map(([x, y, z]) => P(x, y, z));
    if (!a || !b || !c) return;
    g.fillStyle(color, 1);
    g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
  }

  private fillRect(g: Phaser.GameObjects.Graphics, r: GridRect, color: number, z = 0): void {
    this.quad(
      g,
      [
        [r.x0, r.y0, z],
        [r.x1, r.y0, z],
        [r.x1, r.y1, z],
        [r.x0, r.y1, z],
      ],
      color,
    );
  }

  private groundColor(kind: GroundKind): number {
    const p = this.palette;
    const map: Record<GroundKind, string> = {
      courtyard: p.courtyard,
      yard: p.yard,
      sidewalk: p.sidewalk,
      road: p.road,
      grass: p.grass,
      path: p.path,
      plaza: p.plaza,
      pitch: p.pitch,
      sand: p.sand,
      quay: p.quay,
      water: p.water,
      bridge: p.road,
    };
    return hex(map[kind]);
  }

  private drawGround(): void {
    const g = this.scene.add.graphics().setDepth(GROUND_DEPTH);
    for (const a of CITY.ground) {
      this.fillRect(g, a.rect, this.groundColor(a.kind));
      const r = {
        x0: Math.max(a.rect.x0, DETAIL.x0),
        y0: Math.max(a.rect.y0, DETAIL.y0),
        x1: Math.min(a.rect.x1, DETAIL.x1),
        y1: Math.min(a.rect.y1, DETAIL.y1),
      };
      if (r.x1 <= r.x0 || r.y1 <= r.y0) continue;
      if (a.kind === 'grass' || a.kind === 'yard') this.grassTufts(g, r, a.kind);
      if (a.kind === 'water') this.waves(g, r);
      if (a.kind === 'pitch') this.pitchLines(g, a.rect);
      if (a.kind === 'plaza') this.plazaPattern(g, r);
    }
    this.sidewalkJoints(g);
    this.roadMarks(g);
  }

  /** Gehwegplatten an den Hauptstraßen: Fugen je Kachel (Granitplatten), nur auf dem Gehweg. */
  private sidewalkJoints(g: Phaser.GameObjects.Graphics): void {
    g.lineStyle(1, hex(this.palette.sidewalkJoint), 0.85);
    for (const [x0, y0, x1, y1] of sidewalkJointLines()) {
      const a = P(x0, y0);
      const b = P(x1, y1);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  /** Brückendecks noch einmal über den Dampfern (`DECK_DEPTH`): so fahren sie unter den Brücken durch. */
  private drawDecks(): void {
    const g = this.scene.add.graphics().setDepth(DECK_DEPTH);
    for (const b of CITY.bridges) {
      this.fillRect(g, b.rect, this.groundColor('bridge'));
      const [from, to] = b.axis === 'u' ? [b.rect.x0, b.rect.x1] : [b.rect.y0, b.rect.y1];
      this.drawRoadMarks(
        g,
        b,
        Math.max(Math.floor(from), DETAIL.x0),
        Math.min(Math.ceil(to), DETAIL.x1),
      );
    }
  }

  /** Bordsteine und Mittellinie einer Fahrbahn auf den Kacheln [from, to) (nur Fahrbahn/Brücke, keine Kreuzung). */
  private drawRoadMarks(
    g: Phaser.GameObjects.Graphics,
    r: { axis: 'u' | 'v'; at: number },
    from: number,
    to: number,
  ): void {
    const curb = hex(this.palette.curb);
    const curbDark = shadeNum(hex(this.palette.road), 0.8);
    const mark = hex(this.palette.roadMark);
    const R = CITY_GRID.road;
    for (const s of roadMarkTiles(r, from, to)) {
      const seg = (a0: number, a1: number, color: number) =>
        this.fillRect(
          g,
          r.axis === 'u'
            ? { x0: s, x1: s + 1, y0: a0, y1: a1 }
            : { x0: a0, x1: a1, y0: s, y1: s + 1 },
          color,
        );
      seg(r.at - 0.12, r.at + 0.02, curb);
      seg(r.at + 0.02, r.at + 0.1, curbDark);
      seg(r.at + R - 0.1, r.at + R + 0.12, curb);
      if (s % 2 === 0) seg(r.at + R / 2 - 0.05, r.at + R / 2 + 0.05, mark);
    }
  }

  /** Bordsteine, Mittellinien, Haltelinien, Zebrastreifen. */
  private roadMarks(g: Phaser.GameObjects.Graphics): void {
    const mark = hex(this.palette.roadMark);
    for (const r of CITY.roads) this.drawRoadMarks(g, r, DETAIL.x0, DETAIL.x1);
    for (const lane of CITY.lanes) {
      const a = lane.stopAt;
      const h0 = lane.at - 0.5;
      const h1 = lane.at + 0.5;
      if (lane.axis === 'u') this.fillRect(g, { x0: a - 0.06, x1: a + 0.06, y0: h0, y1: h1 }, mark);
      else this.fillRect(g, { x0: h0, x1: h1, y0: a - 0.06, y1: a + 0.06 }, mark);
    }
    for (const c of CITY.crossings) {
      const r = c.rect;
      if (c.axis === 'u')
        for (let y = r.y0 + 0.2; y < r.y1 - 0.1; y += 0.5)
          this.fillRect(g, { x0: r.x0, x1: r.x1, y0: y, y1: y + 0.26 }, mark);
      else
        for (let x = r.x0 + 0.2; x < r.x1 - 0.1; x += 0.5)
          this.fillRect(g, { x0: x, x1: x + 0.26, y0: r.y0, y1: r.y1 }, mark);
    }
  }

  private grassTufts(g: Phaser.GameObjects.Graphics, r: GridRect, kind: GroundKind): void {
    const dark =
      kind === 'yard' ? shadeNum(hex(this.palette.yard), 0.9) : hex(this.palette.grassDark);
    for (let x = Math.ceil(r.x0); x < r.x1; x += 2)
      for (let y = Math.ceil(r.y0); y < r.y1; y += 2) {
        const h = hash01(x, y, 5);
        if (h > 0.45) continue;
        const cx = x + h * 1.6;
        const cy = y + hash01(y, x, 9) * 1.6;
        this.fillRect(g, { x0: cx, y0: cy, x1: cx + 0.35, y1: cy + 0.25 }, dark);
      }
  }

  private waves(g: Phaser.GameObjects.Graphics, r: GridRect): void {
    const light = hex(this.palette.waterLight);
    const long = r.x1 - r.x0 > r.y1 - r.y0;
    for (let a = Math.ceil(long ? r.y0 : r.x0); a < (long ? r.y1 : r.x1); a += 1.5)
      for (let b = Math.ceil(long ? r.x0 : r.y0); b < (long ? r.x1 : r.y1); b += 3) {
        if (hash01(a, b, 2) < 0.55) continue;
        const o = hash01(b, a) * 2;
        if (long) this.fillRect(g, { x0: b + o, x1: b + o + 0.7, y0: a, y1: a + 0.08 }, light);
        else this.fillRect(g, { x0: a, x1: a + 0.08, y0: b + o, y1: b + o + 0.7 }, light);
      }
  }

  private pitchLines(g: Phaser.GameObjects.Graphics, r: GridRect): void {
    const line = hex(this.palette.roadMark);
    const w = 0.08;
    const midY = (r.y0 + r.y1) / 2;
    const cx = (r.x0 + r.x1) / 2;
    for (const y of [r.y0 + 0.3, r.y1 - 0.3 - w])
      this.fillRect(g, { x0: r.x0 + 0.3, x1: r.x1 - 0.3, y0: y, y1: y + w }, line);
    for (const x of [r.x0 + 0.3, r.x1 - 0.3 - w])
      this.fillRect(g, { x0: x, x1: x + w, y0: r.y0 + 0.3, y1: r.y1 - 0.3 }, line);
    this.fillRect(g, { x0: cx - 1.2, x1: cx + 1.2, y0: midY - 1.2, y1: midY + 1.2 }, line);
    this.fillRect(
      g,
      { x0: cx - 1.1, x1: cx + 1.1, y0: midY - 1.1, y1: midY + 1.1 },
      hex(this.palette.pitch),
    );
    this.fillRect(g, { x0: r.x0 + 0.3, x1: r.x1 - 0.3, y0: midY - w / 2, y1: midY + w / 2 }, line);
  }

  private plazaPattern(g: Phaser.GameObjects.Graphics, r: GridRect): void {
    const dark = shadeNum(hex(this.palette.plaza), 0.93);
    for (let x = Math.ceil(r.x0); x < r.x1; x++)
      for (let y = Math.ceil(r.y0); y < r.y1; y++)
        if ((x + y) % 2 === 0) this.fillRect(g, { x0: x, y0: y, x1: x + 1, y1: y + 1 }, dark);
  }

  // ---------------------------------------------------------------------------------------------
  // Häuser
  // ---------------------------------------------------------------------------------------------
  /** Liegt vor dieser Fassadenachse ein Gehweg (dann Läden statt Hochparterre)? Wie `doorFronts` in den Daten. */
  private isStreet(x: number, y: number): boolean {
    return isStreetTile(x, y) && !this.occupied.has(`${String(x)},${String(y)}`);
  }

  /**
   * Verdeckt? Vom Punkt (x, y, z) zur Kamera steigt der Blickstrahl je Kachel diagonal (+1/+1) um 32 px; ist dort
   * eine Kachel höher, sieht man den Punkt nicht.
   */
  private hidden(x: number, y: number, z: number): boolean {
    for (let k = 0.25; k <= 9; k += 0.25) {
      const h = this.occupied.get(`${String(Math.floor(x + k))},${String(Math.floor(y + k))}`) ?? 0;
      if (h > z + RAY_PER_TILE * k) return true;
    }
    return false;
  }

  private facadeColor(b: BuildingDef): number {
    return hex(this.palette.facades[b.facade] ?? this.palette.facades[0] ?? '#e8c993');
  }

  /** Ferne Häuser: Wandflächen, Fensterbänder, Erdgeschoss und Gesims, in den Dunst gemischt. */
  private drawLodFacade(g: Phaser.GameObjects.Graphics, b: BuildingDef): void {
    const haze = hex(this.palette.haze);
    const m = CITY_STYLE.hazeMix;
    const H = buildingHeight(b);
    const f = this.facadeColor(b);
    const { x0, y0, x1, y1 } = b.rect;
    const gh = CITY_STYLE.groundFloorH;
    const fh = CITY_STYLE.floorH;
    const faces: {
      face: FacadeFace;
      n: number;
      at: (s: number, z: number) => V3;
      front: [number, number];
    }[] = [
      { face: 'a', n: x1 - x0, at: (s, z) => [x0 + s, y1, z], front: [(x0 + x1) / 2, y1 + 0.5] },
      { face: 'b', n: y1 - y0, at: (s, z) => [x1, y0 + s, z], front: [x1 + 0.5, (y0 + y1) / 2] },
    ];
    for (const fc of faces) {
      // Seite liegt an einem gleich hohen Nachbarn an: unsichtbar
      const [fx, fy] = fc.front;
      const nb = this.occupied.get(`${String(Math.floor(fx))},${String(Math.floor(fy))}`) ?? 0;
      if (nb >= H) continue;
      const sh = fc.face === 'a' ? SHADE_A : SHADE_B;
      const col = (c: number) => mixNum(shadeNum(c, sh), haze, m);
      const band = (s0: number, s1: number, z0: number, z1: number, c: number) =>
        this.quad(g, [fc.at(s0, z0), fc.at(s1, z0), fc.at(s1, z1), fc.at(s0, z1)], c);
      band(0, fc.n, 0, H, col(f));
      band(0, fc.n, 0, gh, col(hex(this.palette.plinth)));
      band(0.1, fc.n - 0.1, gh * 0.15, gh * 0.72, col(0x4d5770));
      for (let k = 1; k < b.floors; k++) {
        const z = gh + (k - 1) * fh;
        for (let s = 0; s < fc.n; s++) band(s + 0.3, s + 0.7, z + 9, z + 28, col(0x6f87a8));
      }
      band(0, fc.n, H - CITY_STYLE.corniceH * 0.6, H, col(hex(this.palette.stucco)));
    }
  }

  /** Fassaden-Module der beiden sichtbaren Seiten (nur, was der Blickstrahl erreicht). */
  private drawCells(b: BuildingDef, index: number): void {
    const { x0, y0, x1, y1 } = b.rect;
    for (let i = 0; i < x1 - x0; i++) this.facadeColumn(b, 'a', i, x0 + i, y1, index);
    for (let i = 0; i < y1 - y0; i++) this.facadeColumn(b, 'b', i, x1, y0 + i, index);
  }

  /** Eine Fassadenachse von unten nach oben; (ax, ay) = Anfang der Achse auf der Hauskante = Kachel davor. */
  private facadeColumn(
    b: BuildingDef,
    face: FacadeFace,
    i: number,
    ax: number,
    ay: number,
    index: number,
  ): void {
    const theme = ATLAS.theme(this.locationId);
    // Zwei Prüfpunkte je Achse: verdeckt nur, wenn beide verdeckt sind
    const samples: [number, number][] =
      face === 'a'
        ? [
            [ax + 0.15, ay + 0.02],
            [ax + 0.85, ay + 0.02],
          ]
        : [
            [ax + 0.02, ay + 0.15],
            [ax + 0.02, ay + 0.85],
          ];
    const seen = (z: number) => samples.some(([sx, sy]) => !this.hidden(sx, sy, z));
    const base = (ax + ay) * 10 + index * 0.0001;
    let row = 0;
    const place = (frame: string, hc: number, z: number): Phaser.GameObjects.Image => {
      const s = P(ax, ay, z);
      const [ox, oy] = originOf(CITY_SPRITE.cell(hc));
      const img = this.scene.add
        .image(s.x, s.y, theme, frame)
        .setScale(ART_SCALE)
        .setOrigin(ox, oy);
      this.addToLayer(img, base + row++ * 0.01);
      return img;
    };
    const gh = CITY_STYLE.groundFloorH;
    if (seen(gh - 4))
      place(FRAME.facadeGround(groundCellFor(b, i, this.isStreet(ax, ay)), face), gh, 0);
    for (let f = 1; f < b.floors; f++) {
      const z = gh + (f - 1) * CITY_STYLE.floorH;
      if (!seen(z + CITY_STYLE.floorH - 4)) {
        row++;
        continue;
      }
      const cell = upperCellFor(b, i, f);
      place(FRAME.facadeUpper(cell, b.facade, face), CITY_STYLE.floorH, z);
      if (isLitWindow(b, face, i, f))
        this.lit.push(place(FRAME.facadeLit(cell, face), CITY_STYLE.floorH, z).setVisible(false));
    }
    const top = buildingHeight(b) - CITY_STYLE.corniceH;
    if (seen(top + CITY_STYLE.corniceH))
      place(FRAME.cornice(b.facade, face), CITY_STYLE.corniceH, top);
  }

  /**
   * Dach: Satteldach (First entlang der Straße), über Eck Walmdach; Gauben auf der Straßenseite, Schornsteine auf
   * dem First, Giebel an den offenen Enden. Ferne Häuser im Dunst.
   */
  private drawRoof(g: Phaser.GameObjects.Graphics, b: BuildingDef): void {
    const { x0, y0, x1, y1 } = b.rect;
    const H = buildingHeight(b);
    const hr = roofHeight(b);
    const haze = hex(this.palette.haze);
    const m = b.lod ? CITY_STYLE.hazeMix : 0;
    const roof = hex(this.palette.roofs[b.roof] ?? this.palette.roofs[0] ?? '#77798c');
    const wall = this.facadeColor(b);
    const c = (col: number, f: number) => mixNum(shadeNum(col, f), haze, m);
    const xm = (x0 + x1) / 2;
    const ym = (y0 + y1) / 2;
    const T = H + hr;
    if (b.roofKind === 'gable-u') {
      const back: V3[] = [
        [x0, y0, H],
        [x1, y0, H],
        [x1, ym, T],
        [x0, ym, T],
      ];
      const front: V3[] = [
        [x0, ym, T],
        [x1, ym, T],
        [x1, y1, H],
        [x0, y1, H],
      ];
      this.quad(g, back, c(roof, ROOF_SHADE.back));
      this.tri(
        g,
        [
          [x1, y0, H],
          [x1, y1, H],
          [x1, ym, T],
        ],
        c(wall, SHADE_B),
      );
      this.quad(g, front, c(roof, ROOF_SHADE.left));
      if (!b.lod) this.dormers(g, b, 'u', roof, wall, H, hr);
    } else if (b.roofKind === 'gable-v') {
      const back: V3[] = [
        [x0, y0, H],
        [x0, y1, H],
        [xm, y1, T],
        [xm, y0, T],
      ];
      const front: V3[] = [
        [xm, y0, T],
        [xm, y1, T],
        [x1, y1, H],
        [x1, y0, H],
      ];
      this.quad(g, back, c(roof, ROOF_SHADE.back));
      this.tri(
        g,
        [
          [x0, y1, H],
          [x1, y1, H],
          [xm, y1, T],
        ],
        c(wall, SHADE_A),
      );
      this.quad(g, front, c(roof, ROOF_SHADE.right));
      if (!b.lod) this.dormers(g, b, 'v', roof, wall, H, hr);
    } else if (x1 - x0 >= y1 - y0) {
      // Walmdach, First entlang x um die halbe Tiefe eingerückt
      const inset = (y1 - y0) / 2;
      const r0: V3 = [x0 + inset, ym, T];
      const r1: V3 = [x1 - inset, ym, T];
      this.quad(g, [[x0, y0, H], [x1, y0, H], r1, r0], c(roof, ROOF_SHADE.back));
      this.tri(g, [[x0, y0, H], r0, [x0, y1, H]], c(roof, ROOF_SHADE.end));
      this.tri(g, [[x1, y0, H], [x1, y1, H], r1], c(roof, ROOF_SHADE.right));
      this.quad(g, [r0, r1, [x1, y1, H], [x0, y1, H]], c(roof, ROOF_SHADE.left));
    } else {
      const inset = (x1 - x0) / 2;
      const r0: V3 = [xm, y0 + inset, T];
      const r1: V3 = [xm, y1 - inset, T];
      this.quad(g, [[x0, y0, H], r0, r1, [x0, y1, H]], c(roof, ROOF_SHADE.back));
      this.tri(g, [[x0, y0, H], [x1, y0, H], r0], c(roof, ROOF_SHADE.end));
      this.quad(g, [r0, [x1, y0, H], [x1, y1, H], r1], c(roof, ROOF_SHADE.right));
      this.tri(g, [[x0, y1, H], r1, [x1, y1, H]], c(roof, ROOF_SHADE.left));
    }
    // Schornsteine (Klinker) mit Abdeckung auf dem First
    const n = b.lod ? 1 : Math.min(4, 1 + Math.floor(Math.max(x1 - x0, y1 - y0) / 3));
    const ridgeV = b.roofKind === 'gable-v' || (b.roofKind === 'hip' && x1 - x0 < y1 - y0);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const cx = ridgeV ? xm - 0.15 : x0 + (x1 - x0) * (0.2 + t * 0.6) - 0.15;
      const cy = ridgeV ? y0 + (y1 - y0) * (0.2 + t * 0.6) - 0.15 : ym - 0.15;
      this.box(g, cx, cy, T - 8, 0.3, 0.3, 16, c(0xb5654a, 1));
      this.box(g, cx - 0.04, cy - 0.04, T + 8, 0.38, 0.38, 2, c(0x8f8a86, 1));
    }
  }

  /** Gauben auf der Straßenseite eines Satteldachs: kleine Giebelhäuschen mit Fenster. */
  private dormers(
    g: Phaser.GameObjects.Graphics,
    b: BuildingDef,
    axis: 'u' | 'v',
    roof: number,
    wall: number,
    H: number,
    hr: number,
  ): void {
    const { x0, y0, x1, y1 } = b.rect;
    const len = axis === 'u' ? x1 - x0 : y1 - y0;
    const half = (axis === 'u' ? y1 - y0 : x1 - x0) / 2;
    // Gaube steht auf 35 % der Dachhöhe; dort ist die Dachfläche so weit von der Traufe entfernt
    const zFace = H + hr * 0.35;
    const out = half * 0.35;
    const f = axis === 'u' ? SHADE_A : SHADE_B;
    for (let s = 0; s < len; s++) {
      if (hash01(b.seed, s, 21) < 0.4) continue;
      const a = (axis === 'u' ? x0 : y0) + s + 0.15;
      const w = 0.7;
      const pos = (along: number, across: number, z: number): V3 =>
        axis === 'u' ? [along, y1 - across, z] : [x1 - across, along, z];
      const hz = 13;
      this.quad(
        g,
        [
          pos(a, out, zFace),
          pos(a + w, out, zFace),
          pos(a + w, out, zFace + hz),
          pos(a, out, zFace + hz),
        ],
        shadeNum(wall, f),
      );
      this.quad(
        g,
        [
          pos(a + 0.16, out, zFace + 2),
          pos(a + w - 0.16, out, zFace + 2),
          pos(a + w - 0.16, out, zFace + 10),
          pos(a + 0.16, out, zFace + 10),
        ],
        0x5f7aa0,
      );
      this.tri(
        g,
        [
          pos(a - 0.05, out, zFace + hz),
          pos(a + w + 0.05, out, zFace + hz),
          pos(a + w / 2, out, zFace + hz + 7),
        ],
        shadeNum(roof, 0.95),
      );
    }
  }

  /** Quader mit Deckel und den beiden sichtbaren Seiten (Schornstein). */
  private box(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: number,
  ): void {
    this.quad(
      g,
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      shadeNum(color, SHADE_A),
    );
    this.quad(
      g,
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h],
      ],
      shadeNum(color, SHADE_B),
    );
    this.quad(
      g,
      [
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ],
      color,
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Objekte, Fahrzeuge, Passanten
  // ---------------------------------------------------------------------------------------------
  /** `back` = zwischen den Häusern (in der Stadt-Ebene sortiert), sonst vorn mit den Figuren der Szene. */
  private placeProp(p: PropDef, back: boolean): void {
    const s = P(p.x, p.y);
    const [ox, oy] = originOf(propCanvas(p.kind));
    const img = this.scene.add
      .image(s.x, s.y, ATLAS.city, propFrame(p))
      .setScale(ART_SCALE)
      .setOrigin(ox, oy);
    const depth = isoDepth(p.x - 0.5, p.y - 0.5, 5);
    if (back) this.addToLayer(img, depth);
    else img.setDepth(depth);
    // Quer gestellt: entlang v ist gespiegelt entlang u (Fahrzeuge, Fahrräder, Tore …)
    if (p.axis === 'v' && FLIP_ON_V.includes(p.kind)) img.setFlipX(true);
    if (p.kind === 'pedLight') this.pedLights.push({ sprite: img, road: p.axis ?? 'u' });
    if (p.kind === 'trafficLight') this.trafficLights.push({ sprite: img, axis: p.axis ?? 'u' });
    if (p.kind === 'fountain')
      this.fountains.push(
        this.scene.add
          .particles(s.x, s.y - 34, ATLAS.common, {
            frame: FRAME.drop,
            speedY: { min: -46, max: -30 },
            speedX: { min: -16, max: 16 },
            gravityY: 120,
            lifespan: 820,
            frequency: 45,
            scale: { start: ART_SCALE, end: ART_SCALE * 0.6 },
            alpha: { start: 0.9, end: 0.2 },
          })
          .setDepth(depth + 1),
      );
    if (p.kind === 'lamp')
      this.lampGlows.push(
        this.scene.add
          .image(s.x, s.y - 66, ATLAS.common, FRAME.glow)
          .setScale(ART_SCALE * 1.4)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(this.lightDepth)
          .setAlpha(0),
      );
  }

  private createMovers(): void {
    const [cox, coy] = originOf(CITY_SPRITE.car);
    for (let i = 0; i < this.life.cars.length; i++)
      this.carSprites.push(
        this.scene.add
          .image(0, 0, ATLAS.city, FRAME.car(0, true))
          .setScale(ART_SCALE)
          .setOrigin(cox, coy)
          .setVisible(false),
      );
    const look = CUSTOMER_LOOKS.student[0] ?? '';
    for (let i = 0; i < this.life.walkers.length; i++)
      this.walkerSprites.push(
        this.scene.add
          .image(0, 0, ATLAS.common, FRAME.customer('student', look, 'front', 0))
          .setScale(ART_SCALE)
          .setOrigin(0.5, CHAR_FOOT_ORIGIN_Y)
          .setVisible(false),
      );
    for (let i = 0; i < this.life.pigeons.length; i++)
      this.pigeonSprites.push(
        this.scene.add
          .image(0, 0, ATLAS.city, FRAME.pigeon('stand'))
          .setScale(ART_SCALE)
          .setOrigin(0.5, 13 / 18),
      );
    const [box, boy] = originOf(CITY_SPRITE.boat);
    for (let i = 0; i < this.life.boats.length; i++)
      this.boatSprites.push(
        this.scene.add
          .image(0, 0, ATLAS.city, FRAME.boat(true))
          .setScale(ART_SCALE)
          .setOrigin(box, boy),
      );
    this.sync();
  }

  /** Kundentyp und Look eines Passanten aus seiner Würfelzahl. */
  private walkerLook(seed: number): { type: string; look: string } {
    const types = CUSTOMER_TYPES.map((t) => t.id);
    const type = types[seed % types.length] ?? 'student';
    const looks = CUSTOMER_LOOKS[type];
    return { type, look: looks[Math.floor(seed / 7) % looks.length] ?? looks[0] ?? '' };
  }

  update(dt: number, still: boolean): void {
    if (!still) {
      this.clock += dt;
      this.life.update(dt);
    }
    for (const f of this.fountains) {
      if (still && f.emitting) f.stop();
      else if (!still && !f.emitting) f.start();
    }
    this.sync();
  }

  private sync(): void {
    const life = this.life;
    life.cars.forEach((c, i) => {
      const s = this.carSprites[i];
      if (!s) return;
      s.setVisible(c.active);
      if (!c.active) return;
      const lane = life.lane(c);
      const pos = life.carPosition(c);
      const p = P(pos.x, pos.y);
      // Entlang v = entlang u gespiegelt; „vorn“ zeigt die Front (+u bzw. +v).
      const frame = FRAME.car(c.type, (lane?.dir ?? 1) > 0);
      if (s.frame.name !== frame) s.setFrame(frame);
      s.setFlipX(lane?.axis === 'v');
      s.setPosition(p.x, p.y).setDepth(isoDepth(pos.x - 0.5, pos.y - 0.5, 5));
    });
    life.walkers.forEach((w, i) => {
      const s = this.walkerSprites[i];
      if (!s) return;
      s.setVisible(w.active);
      if (!w.active) return;
      const { type, look } = this.walkerLook(w.seed);
      const across = Math.abs(w.dx) > Math.abs(w.dy);
      const dir = (across ? w.dx : w.dy) >= 0 ? 'front' : 'back';
      const cycle = CHAR_WALK.cycle;
      const step = w.moving
        ? (cycle[Math.floor((this.clock + i * 0.37) / CHAR_WALK.stepSec) % cycle.length] ??
          CHAR_FRAMES.stand)
        : CHAR_FRAMES.stand;
      const frame = FRAME.customer(type, look, dir, step);
      if (s.frame.name !== frame) s.setFrame(frame);
      s.setFlipX(across);
      const p = P(w.x, w.y);
      s.setPosition(p.x, p.y).setDepth(isoDepth(w.x - 0.5, w.y - 0.5, 6));
    });
    life.boats.forEach((b, i) => {
      const s = this.boatSprites[i];
      const route = CITY.boats[b.route];
      if (!s || !route) return;
      const pos = life.boatPosition(b);
      const p = P(pos.x, pos.y);
      const f = FRAME.boat(b.dir > 0);
      if (s.frame.name !== f) s.setFrame(f);
      // Entlang v (Kanal): Sprite entlang u gespiegelt. Tiefe in der Wasser-Ebene (unter Brücken und Häusern).
      s.setFlipX(route.axis === 'v')
        .setPosition(p.x, p.y)
        .setDepth(BOAT_DEPTH + isoDepth(pos.x - 0.5, pos.y - 0.5) * 1e-5);
    });
    life.pigeons.forEach((pg, i) => {
      const s = this.pigeonSprites[i];
      if (!s) return;
      const show = pg.alpha > 0;
      s.setVisible(show);
      if (!show) return;
      s.setAlpha(pg.alpha);
      const flying = pg.state === 'fly' || pg.state === 'land';
      const pose = flying
        ? Math.floor(this.clock * 9 + i) % 2
          ? 'fly0'
          : 'fly1'
        : pg.pecking
          ? 'peck'
          : 'stand';
      const f = FRAME.pigeon(pose);
      if (s.frame.name !== f) s.setFrame(f);
      const p = P(pg.x, pg.y);
      // Blickrichtung: nach Flugrichtung bzw. abwechselnd je Taube
      s.setFlipX(flying ? pg.dx - pg.dy < 0 : i % 2 === 1)
        .setPosition(p.x, p.y - pg.z)
        .setDepth(isoDepth(pg.x - 0.5, pg.y - 0.5, 5.5) + pg.z);
    });
    const signal = life.signal();
    for (const l of this.pedLights) {
      const go = signal === (l.road === 'u' ? 'v' : 'u');
      const f = FRAME.pedLight(go);
      if (l.sprite.frame.name !== f) l.sprite.setFrame(f);
    }
    for (const l of this.trafficLights) {
      const f = FRAME.trafficLight(l.axis, life.lightState(l.axis));
      if (l.sprite.frame.name !== f) l.sprite.setFrame(f);
    }
  }

  /** Nacht (0..1): Laternen leuchten, ein Teil der Fenster geht an. */
  setNight(night: number): void {
    for (const g of this.lampGlows) g.setAlpha(night * 0.9);
    const on = night >= CITY_STYLE.litFrom;
    if (on === this.shownLit) return;
    this.shownLit = on;
    for (const w of this.lit) w.setVisible(on);
  }
}
