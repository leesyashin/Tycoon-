/**
 * Mini-Bibliothek für Flat-Shaded-Iso-Sprites als SVG (UI_STYLE § 4): jede Fläche eine Lokalfarbe,
 * drei Helligkeitsstufen (oben 100 %, links 85 %, rechts 70 %), keine Texturen, keine Outlines.
 * Koordinaten: u = Grid-x, v = Grid-y (1 = eine Kachel), z = Höhe in Pixeln.
 */
export type Vec3 = readonly [number, number, number];

export const SHADE = { top: 1, left: 0.85, right: 0.7 } as const;

/**
 * Höhe eines Würfels mit einer Kachel Kantenlänge in z-Pixeln (2:1-Iso, Kamera ~30° von oben). Rechnet Fasen
 * und Kuppeln zwischen Grid-Einheiten und Pixel-Höhe um, damit 45°-Kanten auch wie 45° aussehen.
 */
export const Z_PER_TILE = 39;

/** Kontaktschatten (Bodenhaftung): dunkles Indigo statt Schwarz, weich gezeichnet. */
export const SHADOW = { color: '#1f2440', opacity: 0.24, blur: 1.3 } as const;

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
  /** `<defs>` (Weichzeichner, Clip-Pfade); IDs sind nur innerhalb eines SVG eindeutig – das reicht. */
  private readonly defs: string[] = [];
  private readonly blurs = new Map<number, string>();
  private nextId = 0;
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

  /** Zeichnet `draw` halbtransparent (Glas, Glasglocke) als eine Ebene. */
  group(opacity: number, draw: () => void): this {
    this.parts.push(`<g opacity="${String(opacity)}">`);
    draw();
    this.parts.push('</g>');
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

  /**
   * Quader mit gefasten Oberkanten: Die schmalen Schrägflächen (je eine Lokalfarbe) fangen Licht wie die
   * abgerundeten Kanten der gerenderten Low-Poly-Möbel im Vorbild. `b` = Fase in Pixeln Höhe.
   */
  bevel(
    u: number,
    v: number,
    z: number,
    w: number,
    d: number,
    h: number,
    color: string,
    o: {
      b?: number;
      top?: string;
      left?: string;
      right?: string;
      /** Aufhellung der Fasen (0 = wie die Deckfläche). */
      edge?: number;
      /** Fase an der linken (+v) bzw. rechten (+u) Kante; aus = nahtloser Anschluss an ein Nachbarmodul. */
      chamferLeft?: boolean;
      chamferRight?: boolean;
    } = {},
  ): this {
    const b = Math.min(o.b ?? 1.6, h * 0.5);
    const bu = Math.min(b / Z_PER_TILE, w * 0.45, d * 0.45);
    const cl = o.chamferLeft ?? true;
    const cr = o.chamferRight ?? true;
    const zb = z + h - b;
    const zt = z + h;
    const edge = o.edge ?? 0.22;
    const top = o.top ?? color;
    const left = o.left ?? shade(color, SHADE.left);
    const right = o.right ?? shade(color, SHADE.right);
    // Seitenflächen; ohne Fase reichen sie bis zur Oberkante (mit Gehrung zur Fase der Nachbarkante).
    this.poly(
      cl
        ? [
            [u, v + d, z],
            [u + w, v + d, z],
            [u + w, v + d, zb],
            [u, v + d, zb],
          ]
        : [
            [u, v + d, z],
            [u + w, v + d, z],
            [u + w, v + d, cr ? zb : zt],
            ...(cr ? ([[u + w - bu, v + d, zt]] as const) : []),
            [u, v + d, zt],
          ],
      left,
    );
    this.poly(
      cr
        ? [
            [u + w, v, z],
            [u + w, v + d, z],
            [u + w, v + d, zb],
            [u + w, v, zb],
          ]
        : [
            [u + w, v, z],
            [u + w, v + d, z],
            [u + w, v + d, cl ? zb : zt],
            ...(cl ? ([[u + w, v + d - bu, zt]] as const) : []),
            [u + w, v, zt],
          ],
      right,
    );
    // Kantenlicht: die Fase über der linken Seite ist heller als die Deckfläche, rechts liegt sie dazwischen.
    const iR = cr ? bu : 0;
    const iL = cl ? bu : 0;
    if (cl)
      this.poly(
        [
          [u, v + d, zb],
          [u + w, v + d, zb],
          [u + w - iR, v + d - bu, zt],
          [u, v + d - bu, zt],
        ],
        tint(top, edge),
      );
    if (cr)
      this.poly(
        [
          [u + w, v, zb],
          [u + w, v + d, zb],
          [u + w - bu, v + d - iL, zt],
          [u + w - bu, v, zt],
        ],
        shade(tint(top, edge * 0.4), 0.9),
      );
    return this.poly(
      [
        [u, v, zt],
        [u + w - iR, v, zt],
        [u + w - iR, v + d - iL, zt],
        [u, v + d - iL, zt],
      ],
      top,
    );
  }

  /**
   * Kegelstumpf (Schale, Becher, Lampenschirm, Blumentopf): Radius `r0` unten, `r1` oben. Mantel wie beim
   * Zylinder zweistufig, Deckel in `top` (bei Schalen der Rand, den Inhalt zeichnet man mit `disc` darauf).
   */
  frustum(
    uc: number,
    vc: number,
    z: number,
    r0: number,
    r1: number,
    h: number,
    color: string,
    top?: string,
  ): this {
    const [cx, cy] = this.p([uc, vc, z]);
    const rx0 = r0 * this.k * Math.SQRT2;
    const rx1 = r1 * this.k * Math.SQRT2;
    const f = (n: number) => n.toFixed(2);
    const yt = cy - h;
    this.parts.push(
      `<path d="M${f(cx - rx1)},${f(yt)} L${f(cx - rx0)},${f(cy)} A${f(rx0)},${f(rx0 / 2)} 0 0 0 ${f(cx + rx0)},${f(cy)} L${f(cx + rx1)},${f(yt)} Z" fill="${shade(color, SHADE.left)}"/>`,
      `<path d="M${f(cx + rx1 * 0.35)},${f(yt + rx1 * 0.47)} L${f(cx + rx0 * 0.35)},${f(cy + rx0 * 0.47)} A${f(rx0)},${f(rx0 / 2)} 0 0 0 ${f(cx + rx0)},${f(cy)} L${f(cx + rx1)},${f(yt)} Z" fill="${shade(color, SHADE.right)}"/>`,
      `<ellipse cx="${f(cx)}" cy="${f(yt)}" rx="${f(rx1)}" ry="${f(rx1 / 2)}" fill="${top ?? color}"/>`,
    );
    return this;
  }

  /**
   * Kuppel auf einer Ellipse (Glocke, Espresso-Kuppel, Cloche, Lampe): `hz` = Höhe in Pixeln. Dreistufig
   * schattiert: dunkle Grundform, versetzte helle Fläche, kleiner Glanzpunkt oben links.
   */
  dome(uc: number, vc: number, z: number, r: number, hz: number, color: string): this {
    const [cx, cy] = this.p([uc, vc, z]);
    const rx = r * this.k * Math.SQRT2;
    const ry = rx / 2;
    const f = (n: number) => n.toFixed(2);
    const d = `M${f(cx - rx)},${f(cy)} A${f(rx)},${f(ry)} 0 0 0 ${f(cx + rx)},${f(cy)} A${f(rx)},${f(hz)} 0 0 0 ${f(cx - rx)},${f(cy)} Z`;
    const id = this.clipId(d);
    this.parts.push(
      `<path d="${d}" fill="${shade(color, SHADE.right)}"/>`,
      `<g clip-path="url(#${id})"><ellipse cx="${f(cx - rx * 0.28)}" cy="${f(cy - hz * 0.3)}" rx="${f(rx * 0.95)}" ry="${f(hz * 1.05)}" fill="${shade(color, SHADE.left)}"/>`,
      `<ellipse cx="${f(cx - rx * 0.32)}" cy="${f(cy - hz * 0.62)}" rx="${f(rx * 0.42)}" ry="${f(hz * 0.3)}" fill="${color}"/>`,
      `<ellipse cx="${f(cx - rx * 0.4)}" cy="${f(cy - hz * 0.72)}" rx="${f(Math.max(0.6, rx * 0.14))}" ry="${f(Math.max(0.5, hz * 0.1))}" fill="${tint(color, 0.6)}"/></g>`,
    );
    return this;
  }

  /**
   * Glanzstreifen auf einem Zylinder (Chrom, Messing, Gold): schmale helle Fläche links der Mitte. Macht
   * Metall als Metall lesbar, ohne Verlauf oder Textur.
   */
  shine(uc: number, vc: number, z: number, r: number, h: number, color: string, f = 0.5): this {
    const [cx, cy] = this.p([uc, vc, z]);
    const rx = r * this.k * Math.SQRT2;
    const x0 = cx - rx * 0.62;
    const x1 = cx - rx * 0.36;
    const y0 = (x: number) => cy + (rx / 2) * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
    const n = (v: number) => v.toFixed(2);
    this.parts.push(
      `<polygon points="${n(x0)},${n(y0(x0) - h)} ${n(x1)},${n(y0(x1) - h)} ${n(x1)},${n(y0(x1))} ${n(x0)},${n(y0(x0))}" fill="${tint(color, f)}"/>`,
    );
    return this;
  }

  /**
   * Weicher Kontaktschatten unter einer Grundfläche (Bodenhaftung wie im Vorbild). Zuerst zeichnen; wird mit
   * dem Weichzeichner gerendert und ist die einzige weiche Kante im Sprite.
   */
  shadow(
    u: number,
    v: number,
    z: number,
    w: number,
    d: number,
    opacity: number = SHADOW.opacity,
    blur: number = SHADOW.blur,
  ): this {
    const pts = (
      [
        [u, v, z],
        [u + w, v, z],
        [u + w, v + d, z],
        [u, v + d, z],
      ] as const
    )
      .map((q) =>
        this.p(q)
          .map((n) => n.toFixed(2))
          .join(','),
      )
      .join(' ');
    this.parts.push(
      `<polygon points="${pts}" fill="${SHADOW.color}" fill-opacity="${String(opacity)}" filter="url(#${this.blurId(blur)})"/>`,
    );
    return this;
  }

  /** Runder Kontaktschatten (Säulenfuß, Topf, Hocker). */
  shadowDisc(
    uc: number,
    vc: number,
    z: number,
    r: number,
    opacity: number = SHADOW.opacity,
    blur: number = SHADOW.blur,
  ): this {
    const [cx, cy] = this.p([uc, vc, z]);
    const rx = r * this.k * Math.SQRT2;
    this.parts.push(
      `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${(rx / 2).toFixed(2)}" fill="${SHADOW.color}" fill-opacity="${String(opacity)}" filter="url(#${this.blurId(blur)})"/>`,
    );
    return this;
  }

  /** Warmer Lichtschein (Lampe, LED-Leiste, Ofenglut): weiche, halbtransparente Fläche. */
  glowFlat(
    u: number,
    v: number,
    z: number,
    w: number,
    d: number,
    color: string,
    opacity = 0.45,
    blur = 2,
  ): this {
    const pts = (
      [
        [u, v, z],
        [u + w, v, z],
        [u + w, v + d, z],
        [u, v + d, z],
      ] as const
    )
      .map((q) =>
        this.p(q)
          .map((n) => n.toFixed(2))
          .join(','),
      )
      .join(' ');
    this.parts.push(
      `<polygon points="${pts}" fill="${color}" fill-opacity="${String(opacity)}" filter="url(#${this.blurId(blur)})"/>`,
    );
    return this;
  }

  private blurId(std: number): string {
    const known = this.blurs.get(std);
    if (known) return known;
    const id = `blur${String(this.blurs.size)}`;
    this.blurs.set(std, id);
    this.defs.push(
      `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${String(std)}"/></filter>`,
    );
    return id;
  }

  private clipId(d: string): string {
    const id = `clip${String(this.nextId++)}`;
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return id;
  }

  svg(): string {
    const defs = this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(this.w * 2)}" height="${String(this.h * 2)}" viewBox="0 0 ${String(this.w)} ${String(this.h)}" shape-rendering="geometricPrecision">${defs}${this.parts.join('')}</svg>`;
  }
}
