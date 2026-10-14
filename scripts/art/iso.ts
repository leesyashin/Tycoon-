/**
 * Mini-Bibliothek für Flat-Shaded-Iso-Sprites als SVG (UI_STYLE § 4): jede Fläche eine Lokalfarbe,
 * drei Helligkeitsstufen (oben 100 %, links 85 %, rechts 70 %), keine Texturen, keine Outlines.
 * Koordinaten: u = Grid-x, v = Grid-y (1 = eine Kachel), z = Höhe in Pixeln.
 */
export type Vec3 = readonly [number, number, number];

export const SHADE = { top: 1, left: 0.85, right: 0.7 } as const;

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) =>
    Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

/** Mischt eine Farbe mit Weiß (f = 0 … 1) – für Highlights ohne neue Lokalfarbe. */
export function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => {
    const v = (n >> s) & 255;
    return Math.round(v + (255 - v) * f)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${c(16)}${c(8)}${c(0)}`;
}

export class IsoCanvas {
  readonly parts: string[] = [];
  /**
   * @param w,h  Größe in logischen Pixeln (exportiert wird 2×)
   * @param ox,oy  Bildschirmposition von u = v = z = 0
   * @param k  halbe Kachelbreite in Pixeln (32 = Kachel 64×32)
   */
  constructor(
    readonly w: number,
    readonly h: number,
    readonly ox: number,
    readonly oy: number,
    readonly k = 32,
  ) {}

  p([u, v, z]: Vec3): [number, number] {
    return [this.ox + (u - v) * this.k, this.oy + ((u + v) * this.k) / 2 - z];
  }

  poly(pts: readonly Vec3[], fill: string, opacity = 1): this {
    const d = pts
      .map((q) =>
        this.p(q)
          .map((n) => n.toFixed(2))
          .join(','),
      )
      .join(' ');
    this.parts.push(
      `<polygon points="${d}" fill="${fill}"${opacity < 1 ? ` fill-opacity="${String(opacity)}"` : ''}/>`,
    );
    return this;
  }

  /** Flache 2D-Form in Bildschirmkoordinaten (für Glyphen, Icons, Partikel). */
  raw(svg: string): this {
    this.parts.push(svg);
    return this;
  }

  /** Quader; `faces` wählt, welche Seiten gezeichnet werden (verdeckte spart man sich). */
  box(
    u: number,
    v: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: string,
    o: { top?: string; left?: string; right?: string } = {},
  ): this {
    const left = o.left ?? shade(color, SHADE.left);
    const right = o.right ?? shade(color, SHADE.right);
    const top = o.top ?? color;
    // Linke sichtbare Seite: Ebene v + d (zeigt nach links unten).
    this.poly(
      [
        [u, v + d, z],
        [u + w, v + d, z],
        [u + w, v + d, z + h],
        [u, v + d, z + h],
      ],
      left,
    );
    // Rechte sichtbare Seite: Ebene u + w (zeigt nach rechts unten).
    this.poly(
      [
        [u + w, v, z],
        [u + w, v + d, z],
        [u + w, v + d, z + h],
        [u + w, v, z + h],
      ],
      right,
    );
    this.poly(
      [
        [u, v, z + h],
        [u + w, v, z + h],
        [u + w, v + d, z + h],
        [u, v + d, z + h],
      ],
      top,
    );
    return this;
  }

  /** Fläche auf Höhe z (Teppich, Tischplatte ohne Kante, Fliese). */
  flat(u: number, v: number, z: number, w: number, d: number, color: string, opacity = 1): this {
    return this.poly(
      [
        [u, v, z],
        [u + w, v, z],
        [u + w, v + d, z],
        [u, v + d, z],
      ],
      color,
      opacity,
    );
  }

  /** Senkrechte Fläche in der Ebene v = const (linke Seite), z. B. Schild, Fenster, Tafel. */
  wallV(u: number, v: number, z: number, w: number, h: number, color: string): this {
    return this.poly(
      [
        [u, v, z],
        [u + w, v, z],
        [u + w, v, z + h],
        [u, v, z + h],
      ],
      color,
    );
  }

  /** Senkrechte Fläche in der Ebene u = const (rechte Seite). */
  wallU(u: number, v: number, z: number, d: number, h: number, color: string): this {
    return this.poly(
      [
        [u, v, z],
        [u, v + d, z],
        [u, v + d, z + h],
        [u, v, z + h],
      ],
      color,
    );
  }

  /** Zylinder (Becher, Schale, Topf) um (uc, vc); Mantel 85 %, rechte Hälfte 70 %, Deckel 100 %. */
  cylinder(
    uc: number,
    vc: number,
    z: number,
    r: number,
    h: number,
    color: string,
    top?: string,
  ): this {
    const [cx, cy] = this.p([uc, vc, z]);
    const rx = r * this.k * Math.SQRT2;
    const ry = rx / 2;
    const f = (n: number) => n.toFixed(2);
    const body = shade(color, SHADE.left);
    const side = shade(color, SHADE.right);
    this.parts.push(
      `<path d="M${f(cx - rx)},${f(cy - h)} L${f(cx - rx)},${f(cy)} A${f(rx)},${f(ry)} 0 0 0 ${f(cx + rx)},${f(cy)} L${f(cx + rx)},${f(cy - h)} Z" fill="${body}"/>`,
      `<path d="M${f(cx + rx * 0.35)},${f(cy - h + ry * 0.94)} L${f(cx + rx * 0.35)},${f(cy + ry * 0.94)} A${f(rx)},${f(ry)} 0 0 0 ${f(cx + rx)},${f(cy)} L${f(cx + rx)},${f(cy - h)} Z" fill="${side}"/>`,
      `<ellipse cx="${f(cx)}" cy="${f(cy - h)}" rx="${f(rx)}" ry="${f(ry)}" fill="${top ?? color}"/>`,
    );
    return this;
  }

  /** Ellipse auf Höhe z (Inhalt einer Schale, Teller). */
  disc(uc: number, vc: number, z: number, r: number, color: string): this {
    const [cx, cy] = this.p([uc, vc, z]);
    const rx = r * this.k * Math.SQRT2;
    this.parts.push(
      `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${(rx / 2).toFixed(2)}" fill="${color}"/>`,
    );
    return this;
  }

  svg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(this.w * 2)}" height="${String(this.h * 2)}" viewBox="0 0 ${String(this.w)} ${String(this.h)}" shape-rendering="geometricPrecision">${this.parts.join('')}</svg>`;
  }
}
