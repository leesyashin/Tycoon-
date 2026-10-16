import type Phaser from 'phaser';

/** Achsenparalleles Rechteck in Weltpixeln. */
export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * So weit (Anteil der Ausschnittgröße je Seite) reicht der aufgenommene Bereich über den Kamera-Ausschnitt hinaus:
 * beim Schieben wird erst nach einer halben Bildschirmbreite neu aufgenommen.
 */
const DRAW_AHEAD = 0.5;

interface Prim {
  line: boolean;
  color: number;
  alpha: number;
  width: number;
  pts: readonly number[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Viele feste Flächen (Boden, Dächer) in einer Graphics, die nur aufnimmt, was um den Kamera-Ausschnitt liegt.
 * Phaser rechnet eine Graphics jedes Frame mit allen Befehlen neu durch, ohne Culling; die Stadt hat Tausende
 * Dreiecke und Fugen, von denen meist nur ein Bruchteil im Bild ist. Gezeichnet wird mit derselben Schnittstelle wie
 * bei Phaser (`fillStyle`, `fillTriangle`, `lineStyle`, `lineBetween`); die Reihenfolge bleibt erhalten.
 */
export class CulledGraphics {
  private readonly prims: Prim[] = [];
  private fill = { color: 0, alpha: 1 };
  private stroke = { width: 1, color: 0, alpha: 1 };
  private drawn: ViewRect | null = null;

  constructor(readonly g: Phaser.GameObjects.Graphics) {}

  /** Anzahl gesammelter Flächen und Linien (Tests, Messungen). */
  get size(): number {
    return this.prims.length;
  }

  fillStyle(color: number, alpha = 1): this {
    this.fill = { color, alpha };
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.stroke = { width, color, alpha };
    return this;
  }

  fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): this {
    this.prims.push({
      line: false,
      color: this.fill.color,
      alpha: this.fill.alpha,
      width: 0,
      pts: [ax, ay, bx, by, cx, cy],
      x0: Math.min(ax, bx, cx),
      y0: Math.min(ay, by, cy),
      x1: Math.max(ax, bx, cx),
      y1: Math.max(ay, by, cy),
    });
    return this;
  }

  lineBetween(ax: number, ay: number, bx: number, by: number): this {
    const w = this.stroke.width / 2;
    this.prims.push({
      line: true,
      color: this.stroke.color,
      alpha: this.stroke.alpha,
      width: this.stroke.width,
      pts: [ax, ay, bx, by],
      x0: Math.min(ax, bx) - w,
      y0: Math.min(ay, by) - w,
      x1: Math.max(ax, bx) + w,
      y1: Math.max(ay, by) + w,
    });
    return this;
  }

  /**
   * Sorgt dafür, dass alles im Ausschnitt `view` aufgenommen ist. Liegt er noch im zuletzt aufgenommenen Bereich,
   * bleibt alles, wie es ist; sonst wird für den Ausschnitt plus `DRAW_AHEAD` je Seite neu aufgenommen.
   */
  show(view: ViewRect): void {
    const d = this.drawn;
    if (d && view.x0 >= d.x0 && view.y0 >= d.y0 && view.x1 <= d.x1 && view.y1 <= d.y1) return;
    const mx = (view.x1 - view.x0) * DRAW_AHEAD;
    const my = (view.y1 - view.y0) * DRAW_AHEAD;
    const r = { x0: view.x0 - mx, y0: view.y0 - my, x1: view.x1 + mx, y1: view.y1 + my };
    this.drawn = r;
    const g = this.g.clear();
    // Stil nur setzen, wenn er sich ändert (nach `clear` ist keiner gesetzt).
    let fill: Prim | null = null;
    let stroke: Prim | null = null;
    for (const p of this.prims) {
      if (p.x1 < r.x0 || p.x0 > r.x1 || p.y1 < r.y0 || p.y0 > r.y1) continue;
      const [ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0] = p.pts;
      if (p.line) {
        if (stroke?.width !== p.width || stroke.color !== p.color || stroke.alpha !== p.alpha)
          g.lineStyle(p.width, p.color, p.alpha);
        stroke = p;
        g.lineBetween(ax, ay, bx, by);
      } else {
        if (fill?.color !== p.color || fill.alpha !== p.alpha) g.fillStyle(p.color, p.alpha);
        fill = p;
        g.fillTriangle(ax, ay, bx, by, cx, cy);
      }
    }
  }
}
