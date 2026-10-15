/**
 * Zusatzformen für Stadt-Objekte und Café-Deko (UI_STYLE § 4, Flat-Shaded-Iso): facettierte Kugeln für Laub
 * und Glaskugeln, Kreise in senkrechten Ebenen (Räder, Uhren), dünne Streben. Ergänzt `iso.ts`, ohne es zu
 * ändern. Jede Facette ist eine Lokalfarbe; die Helligkeit folgt derselben Regel wie die Quader (oben 100 %,
 * links 85 %, rechts 70 %), damit Laub und Möbel im selben Licht stehen.
 */
import { IsoCanvas, Z_PER_TILE, shade, tint, type Vec3 } from './iso';

/** Blickrichtung zur Kamera in (u, v, z in Kacheln): 2:1-Iso, 32 px halbe Kachel, 39 px je Kachel Höhe. */
const VIEW: Vec3 = (() => {
  const z = 32 / Z_PER_TILE;
  const n = Math.hypot(1, 1, z);
  return [1 / n, 1 / n, z / n];
})();

/** Helligkeit einer Fläche mit Normale n (Einheitsvektor): oben 1, +v 0,85, +u 0,7 – wie `SHADE`. */
export function facetLight(n: Vec3): number {
  return Math.max(0.46, Math.min(1.14, 0.72 + 0.3 * n[2] + 0.15 * n[1] - 0.02 * n[0]));
}

/** Tönt eine Farbe auf Helligkeit f (> 1 hellt Richtung Weiß auf), in 4-%-Stufen gegen Farbrauschen im Atlas. */
export function lit(color: string, f: number): string {
  const q = Math.round(f * 25) / 25;
  return q > 1 ? tint(color, (q - 1) * 1.7) : shade(color, q);
}

/** Kleiner deterministischer Zufall (gleiche Zeichnung bei jedem `pnpm art`). */
export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export interface BallOpts {
  /** Längengrade (Standard 9). */
  seg?: number;
  /** Breitenbänder (Standard 5). */
  rings?: number;
  /** Höhe relativ zur Breite (1 = Kugel). */
  squash?: number;
  /** Unregelmäßigkeit der Oberfläche (0 = glatt), für Laubballen. */
  lumpy?: number;
  seed?: number;
  /** Farbe der hellsten Facetten (Sonnenseite), sonst aufgehellte Grundfarbe. */
  sun?: string;
  /** Feste Tonstufen von dunkel nach hell statt stufenloser Tönung (Laub: wenige, klare Grüns). */
  tones?: readonly string[];
  /** Verschiebt die Tonstufe (−1 = eine Stufe dunkler, z. B. verschattete untere Laubballen). */
  toneShift?: number;
  opacity?: number;
}

/**
 * Facettierte Kugel um (u, v) mit Mittelpunkt in Höhe z (Pixel), Radius r (Kacheln): nur die zur Kamera zeigenden
 * Facetten, jede in ihrer Helligkeit. Laubballen (`lumpy`) wirken so wie gerenderte Low-Poly-Bäume des Vorbilds.
 */
export function facetBall(
  c: IsoCanvas,
  u: number,
  v: number,
  z: number,
  r: number,
  color: string,
  o: BallOpts = {},
): void {
  const seg = o.seg ?? 9;
  const rings = o.rings ?? 5;
  const squash = o.squash ?? 1;
  const rand = rng(o.seed ?? Math.round((u * 97 + v * 53 + z) * 10));
  const jitter = o.lumpy ?? 0;
  // Gitter der Einheitskugel; jedes zweite Band um eine halbe Teilung versetzt (weniger „Globus“).
  const grid: Vec3[][] = [];
  for (let i = 0; i <= rings; i++) {
    const phi = -Math.PI / 2 + (i / rings) * Math.PI;
    const row: Vec3[] = [];
    for (let j = 0; j < seg; j++) {
      const th = ((j + (i % 2) * 0.5) / seg) * Math.PI * 2;
      const k = i === 0 || i === rings ? 1 : 1 + (rand() - 0.5) * 2 * jitter;
      row.push([
        Math.cos(phi) * Math.cos(th) * k,
        Math.cos(phi) * Math.sin(th) * k,
        Math.sin(phi) * k,
      ]);
    }
    grid.push(row);
  }
  const world = (q: Vec3): Vec3 => [u + q[0] * r, v + q[1] * r, z + q[2] * r * Z_PER_TILE * squash];
  const faces: { pts: Vec3[]; n: Vec3; d: number }[] = [];
  for (let i = 0; i < rings; i++) {
    const a = grid[i];
    const b = grid[i + 1];
    if (!a || !b) continue;
    for (let j = 0; j < seg; j++) {
      const p0 = a[j % seg];
      const p1 = a[(j + 1) % seg];
      const q0 = b[j % seg];
      const q1 = b[(j + 1) % seg];
      if (!p0 || !p1 || !q0 || !q1) continue;
      const pts = i === 0 ? [p0, q1, q0] : i === rings - 1 ? [p0, p1, q0] : [p0, p1, q1, q0];
      const m = pts.reduce<Vec3>((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
      const len = Math.hypot(m[0], m[1], m[2]) || 1;
      const n: Vec3 = [m[0] / len, m[1] / len, m[2] / len];
      const d = n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2];
      if (d <= -0.05) continue;
      faces.push({ pts, n, d });
    }
  }
  faces.sort((x, y) => x.d - y.d);
  for (const f of faces) {
    const l = facetLight(f.n);
    const t = o.tones;
    const col = t?.length
      ? (t[toneIndex(l, t.length, o.toneShift ?? 0)] ?? color)
      : o.sun && l > 1.04
        ? o.sun
        : lit(color, l);
    // Kontur in der Flächenfarbe schließt die hellen Antialiasing-Fugen zwischen Nachbarfacetten.
    const d = f.pts
      .map((q) =>
        c
          .p(world(q))
          .map((n) => n.toFixed(2))
          .join(','),
      )
      .join(' ');
    const op = o.opacity ?? 1;
    c.raw(
      `<polygon points="${d}" fill="${col}" stroke="${col}" stroke-width="0.45" stroke-linejoin="round"${op < 1 ? ` opacity="${String(op)}"` : ''}/>`,
    );
  }
}

/** Tonstufe zur Helligkeit: Schwellen gleichmäßig zwischen 0,62 (Unterseite) und 1,04 (Sonnenseite). */
function toneIndex(l: number, n: number, shift: number): number {
  let i = 0;
  for (let k = 0; k < n - 1; k++) if (l >= 0.62 + (k * 0.42) / Math.max(1, n - 2)) i = k + 1;
  return Math.min(n - 1, Math.max(0, i + shift));
}

/** Laubballen einer Krone; werden von hinten nach vorn gezeichnet. [u, v, z, r, Tonverschiebung] je Ballen. */
export function crown(
  c: IsoCanvas,
  balls: readonly (readonly [number, number, number, number, number?])[],
  color: string,
  o: BallOpts = {},
): void {
  const depth = (b: readonly [number, number, number, ...unknown[]]) =>
    b[0] * VIEW[0] + b[1] * VIEW[1] + (b[2] / Z_PER_TILE) * VIEW[2];
  [...balls]
    .sort((a, b) => depth(a) - depth(b))
    .forEach(([u, v, z, r, shift], i) =>
      facetBall(c, u, v, z, r, color, {
        lumpy: 0.12,
        ...o,
        toneShift: shift ?? o.toneShift,
        seed: (o.seed ?? 7) + i * 13,
      }),
    );
}

/** Punkte eines Kreises in der senkrechten Ebene v = const (`plane` 'v') bzw. u = const ('u'). */
export function ringPts(
  plane: 'u' | 'v',
  u: number,
  v: number,
  z: number,
  r: number,
  seg = 18,
): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const d = Math.cos(a) * r;
    const dz = Math.sin(a) * r * Z_PER_TILE;
    pts.push(plane === 'v' ? [u + d, v, z + dz] : [u, v + d, z + dz]);
  }
  return pts;
}

/** Dünne Strebe zwischen zwei Punkten (Rahmen, Speichen, Kabel), runde Enden. */
export function strut(c: IsoCanvas, a: Vec3, b: Vec3, color: string, width = 1, opacity = 1): void {
  const [x0, y0] = c.p(a);
  const [x1, y1] = c.p(b);
  const f = (n: number) => n.toFixed(2);
  c.raw(
    `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${color}" stroke-width="${String(width)}" stroke-linecap="round"${opacity < 1 ? ` stroke-opacity="${String(opacity)}"` : ''}/>`,
  );
}

/** Linienzug durch mehrere Punkte (Bügel, Lehne, Netz). */
export function polyline(
  c: IsoCanvas,
  pts: readonly Vec3[],
  color: string,
  width = 1,
  opacity = 1,
): void {
  const d = pts
    .map((q) =>
      c
        .p(q)
        .map((n) => n.toFixed(2))
        .join(','),
    )
    .join(' ');
  c.raw(
    `<polyline points="${d}" fill="none" stroke="${color}" stroke-width="${String(width)}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` stroke-opacity="${String(opacity)}"` : ''}/>`,
  );
}

/** Kegel (Dach, Spitze): Grundkreis r auf Höhe z, Spitze h Pixel darüber; Mantel zweistufig. */
export function cone(
  c: IsoCanvas,
  u: number,
  v: number,
  z: number,
  r: number,
  h: number,
  color: string,
): void {
  const [cx, cy] = c.p([u, v, z]);
  const rx = r * c.k * Math.SQRT2;
  const f = (n: number) => n.toFixed(2);
  c.raw(
    `<path d="M${f(cx - rx)},${f(cy)} A${f(rx)},${f(rx / 2)} 0 0 0 ${f(cx + rx)},${f(cy)} L${f(cx)},${f(cy - h)} Z" fill="${shade(color, 0.85)}"/>` +
      `<path d="M${f(cx + rx * 0.3)},${f(cy + rx * 0.48)} A${f(rx)},${f(rx / 2)} 0 0 0 ${f(cx + rx)},${f(cy)} L${f(cx)},${f(cy - h)} Z" fill="${shade(color, 0.7)}"/>` +
      `<path d="M${f(cx - rx)},${f(cy)} L${f(cx)},${f(cy - h)} L${f(cx - rx * 0.45)},${f(cy + rx * 0.44)} Z" fill="${color}"/>`,
  );
}

/**
 * Senkrechtes Prisma über einem konvexen Grundriss (Punkte gegen den Uhrzeigersinn in u/v gesehen, d. h. Normale
 * (dv, −du) jeder Kante zeigt nach außen): nur die sichtbaren Seiten, links 85 %, rechts 70 %, Deckel 100 %.
 */
export function prism(
  c: IsoCanvas,
  pts: readonly (readonly [number, number])[],
  z0: number,
  z1: number,
  color: string,
  top: string = color,
): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    if (nx + ny <= 1e-9) continue;
    const len = Math.hypot(nx, ny) || 1;
    c.poly(
      [
        [a[0], a[1], z0],
        [b[0], b[1], z0],
        [b[0], b[1], z1],
        [a[0], a[1], z1],
      ],
      lit(color, facetLight([nx / len, ny / len, 0])),
    );
  }
  c.poly(
    pts.map(([u, v]) => [u, v, z1] as Vec3),
    top,
  );
}

/** Regelmäßiges n-Eck um (u, v) als Grundriss für `prism` (gegen den Uhrzeigersinn). */
export function ngon(u: number, v: number, r: number, n: number, rot = 0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([u + Math.cos(a) * r, v + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Seitenprofil (u, z) quer extrudiert von v0 bis v1 (Auto, Wagen): sichtbare Streifen je Profilkante nach ihrer
 * Normale schattiert, dazu die Seitenfläche bei v1. Profil gegen den Uhrzeigersinn (u nach rechts, z nach oben),
 * beginnend unten. `seg(i)` kann einzelne Streifen umfärben (Scheiben).
 */
export function extrudeU(
  c: IsoCanvas,
  profile: readonly (readonly [number, number])[],
  v0: number,
  v1: number,
  color: string,
  o: { seg?: (i: number) => string | undefined; side?: string } = {},
): void {
  const strips: { pts: Vec3[]; col: string; d: number }[] = [];
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % profile.length];
    if (!a || !b) continue;
    const du = b[0] - a[0];
    const dz = (b[1] - a[1]) / Z_PER_TILE;
    const len = Math.hypot(du, dz) || 1;
    const n: Vec3 = [dz / len, 0, -du / len];
    if (n[0] * VIEW[0] + n[2] * VIEW[2] <= 0.001) continue;
    strips.push({
      pts: [
        [a[0], v0, a[1]],
        [b[0], v0, b[1]],
        [b[0], v1, b[1]],
        [a[0], v1, a[1]],
      ],
      col: o.seg?.(i) ?? lit(color, facetLight(n)),
      // Weiter hinten liegende Streifen zuerst (Mitte gegen die Blickrichtung)
      d: ((a[0] + b[0]) / 2) * VIEW[0] + ((a[1] + b[1]) / 2 / Z_PER_TILE) * VIEW[2],
    });
  }
  strips.sort((x, y) => x.d - y.d);
  for (const st of strips) c.poly(st.pts, st.col);
  c.poly(
    profile.map(([u, z]) => [u, v1, z] as Vec3),
    o.side ?? lit(color, facetLight([0, 1, 0])),
  );
}
