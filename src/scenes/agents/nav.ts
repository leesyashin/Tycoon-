import { CITY, propFootprint } from '@data/city';
import { CROWD, NAV, inRoom, type CafeLayout, type GridPos } from '@data/layouts';
import { PARKING_LOT } from '@data/parking';

/**
 * Wegsuche der kosmetischen Figuren: ein Raster über Raum, Terrasse und Gehweg (Zellen `NAV.cell`), A* darüber,
 * danach Abkürzen auf Sicht (gerade Linien statt Treppen) und gerundete Ecken. Jeder Weg beginnt dort, wo die Figur
 * gerade steht – ändert sich das Ziel unterwegs, geht sie direkt dorthin statt erst zurück zu einem festen Punkt.
 *
 * Harte Hindernisse (Wände außer der Tür, Theke, Geräte, Lager, Tische, Deko, Stadt-Objekte) werden nie
 * durchquert; weiche (Stühle, Hocker, Schlangenplätze, stehende Figuren) und der Wohlfühlabstand `NAV.clearance`
 * kosten Umweg und gelten nahe Start und Ziel nicht (aufstehen, hinsetzen, in die Schlange treten). Rollen haben
 * eigene Zonen: Gäste und Putzkräfte bleiben vor der Theke, Baristas dahinter, Bedienungen dürfen überall hin.
 * Kein Phaser-Import, damit testbar.
 */
export type NavRole = 'guest' | 'staff' | 'back';

/**
 * Rechteck [x0, x1] × [y0, y1], um `r` aufgeblasen: `r` = 0 ist ein Kasten, ein Punkt mit `r` > 0 ein Kreis.
 * `hard` = nie durchqueren (Figuren bleiben `body` davon weg), sonst nur Wohlfühlabstand.
 */
interface Shape {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  hard: boolean;
  body: number;
}

/** Abstand eines Punkts zum Rand einer Form (negativ innen). */
function dist(s: Shape, x: number, y: number): number {
  const dx = Math.max(s.x0 - x, 0, x - s.x1);
  const dy = Math.max(s.y0 - y, 0, y - s.y1);
  if (dx === 0 && dy === 0) return -Math.min(x - s.x0, s.x1 - x, y - s.y0, s.y1 - y) - s.r;
  return Math.hypot(dx, dy) - s.r;
}

const circle = (p: GridPos, r: number, hard: boolean): Shape => ({
  x0: p.x,
  y0: p.y,
  x1: p.x,
  y1: p.y,
  r,
  hard,
  body: NAV.body,
});

const box = (x0: number, y0: number, x1: number, y1: number, body: number = NAV.body): Shape => ({
  x0,
  y0,
  x1,
  y1,
  r: 0,
  hard: true,
  body,
});

/** Zustand eines Punkts: frei, im Wohlfühlabstand (weich) oder versperrt. */
const FREE = 0;
const SOFT = 1;
const BLOCKED = 2;
type PointState = typeof FREE | typeof SOFT | typeof BLOCKED;

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Raster einer Rolle: Zustand je Zellmitte und die Formen, die eine Zelle berühren können. */
interface Grid {
  role: NavRole;
  state: Uint8Array;
  near: number[][];
  /** Weit weg von allen Formen und vom Rand der Zone: jeder Punkt der Zelle ist frei (außer stehenden Figuren). */
  open: Uint8Array;
}

/** Anfrage-Kontext: Endpunkte (dort gilt nur der Körper) und stehende Figuren. */
interface Query {
  from: GridPos;
  to: GridPos;
  others: readonly GridPos[];
}

const EMPTY: number[] = [];
/** Anfrage ohne Endpunkte (Prüfungen, Aufbau). */
const NO_ENDS: Query = { from: { x: NaN, y: NaN }, to: { x: NaN, y: NaN }, others: [] };

export class CafeNav {
  private readonly cell = NAV.cell;
  private readonly x0 = NAV.bounds.x0;
  private readonly y0 = NAV.bounds.y0;
  readonly cols: number;
  readonly rows: number;
  private shapes: Shape[] = [];
  /** Wände als Linien (achsenparallel), für den exakten Schnitttest auf Sichtlinien. */
  private walls: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private readonly grids = new Map<NavRole, Grid>();
  private visibleKey = '';
  /** Puffer für A* (je Anfrage über `gen` zurückgesetzt). */
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly dyn: Uint32Array;
  /**
   * Zellen, in denen ein Punkt im Wohlfühlabstand einer stehenden Figur liegen kann (Radius plus halbe
   * Zelldiagonale): Vorfilter für `nearOther`, das sonst für jeden Prüfpunkt beim Abkürzen alle Figuren durchging.
   */
  private readonly dynReach: Uint32Array;
  /** Zellen nahe Start oder Ziel der laufenden Anfrage (`NAV.endRadius`): dort kostet jeder Schritt 1. */
  private readonly ends: Uint32Array;
  /** Anfrage, für die `dyn` und `dynReach` gerade markiert sind. */
  private marked: Query | null = null;
  private gen = 0;
  private readonly heap: number[] = [];
  private readonly heapF: number[] = [];

  constructor(private readonly layout: CafeLayout) {
    this.cols = Math.round((NAV.bounds.x1 - this.x0) / this.cell) + 1;
    this.rows = Math.round((NAV.bounds.y1 - this.y0) / this.cell) + 1;
    const n = this.cols * this.rows;
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.dyn = new Uint32Array(n);
    this.dynReach = new Uint32Array(n);
    this.ends = new Uint32Array(n);
    this.setVisible(layout.tables.map(() => true));
  }

  /**
   * Was gerade im Raum steht: sichtbare Tische (je Index in `layout.tables`) und Ambiente-Level (Deko, Musik, WLAN
   * …; ohne Angabe zählt jedes Deko-Stück). Baut die Raster neu, wenn sich etwas ändert.
   */
  setVisible(tables: readonly boolean[], ambience?: Readonly<Record<string, number>>): void {
    const level = (id: string) => (ambience ? (ambience[id] ?? 0) : Infinity);
    const decor = this.layout.decor.map((d) => level('decor') >= d.minLevel);
    const amb = this.layout.ambience.map((a) => level(a.id) >= a.minLevel);
    const bits = (list: readonly boolean[]) => list.map((v) => (v ? '1' : '0')).join('');
    const parking = ambience ? (ambience['parking'] ?? 0) : 0;
    const key = `${bits(tables)}|${bits(decor)}|${bits(amb)}|${String(parking)}`;
    if (key === this.visibleKey) return;
    this.visibleKey = key;
    this.shapes = this.buildShapes(tables, decor, amb, parking);
    this.grids.clear();
  }

  /**
   * Weg von `from` nach `to` für eine Rolle: Wegpunkte ohne `from`, der letzte ist genau `to`. `others` = Plätze
   * stehender Figuren, um die der Weg herumführt, wenn es geht.
   */
  path(role: NavRole, from: GridPos, to: GridPos, others: readonly GridPos[] = []): GridPos[] {
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) return [{ ...to }];
    const grid = this.grid(role);
    const q: Query = { from, to, others };
    const cells = this.search(grid, q);
    if (!cells) return [{ ...to }];
    const pts: GridPos[] = [{ ...from }];
    // Start bzw. Ziel in einer engen Lücke (Stuhl an der Wand): über die freie Start- bzw. Zielzelle, statt quer
    // durch den Tisch daneben.
    const startCell = cells[0];
    const first = cells.length > 2 ? this.center(cells[1] ?? 0) : to;
    if (startCell !== undefined && this.probe(grid, q, from, first).blocked)
      pts.push(this.center(startCell));
    for (let i = 1; i < cells.length - 1; i++) pts.push(this.center(cells[i] ?? 0));
    const goal = cells[cells.length - 1];
    const before = pts[pts.length - 1] ?? from;
    if (cells.length > 1 && goal !== undefined && this.probe(grid, q, before, to).blocked)
      pts.push(this.center(goal));
    pts.push({ ...to });
    const pulled = this.pull(grid, q, pts);
    const smooth = this.round(grid, q, pulled);
    // Kurven, die sich eine Strecke teilen, stoßen in einem Punkt aneinander: doppelte Punkte weg.
    const out: GridPos[] = [];
    let prev = from;
    for (const p of smooth) {
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-4) continue;
      out.push(p);
      prev = p;
    }
    const last = out[out.length - 1];
    if (!last || last.x !== to.x || last.y !== to.y) out.push({ ...to });
    return out;
  }

  /**
   * Platz im Abstand `d` um `around` (acht Richtungen), am nächsten an `from`: hier steht eine Bedienung neben dem
   * Gast oder eine Putzkraft am Tisch. Lieber ein Platz mit Wohlfühlabstand (etwas weiter weg erlaubt), sonst einer,
   * an dem man wenigstens stehen kann; gibt es keinen, `fallback`.
   */
  standSpot(role: NavRole, around: GridPos, d: number, from: GridPos, fallback: GridPos): GridPos {
    const grid = this.grid(role);
    let best: GridPos | null = null;
    let bestScore = Infinity;
    for (const dd of [d, d * 1.25])
      for (const [dx, dy] of DIRS) {
        const k = dd / Math.hypot(dx, dy);
        const p = { x: around.x + dx * k, y: around.y + dy * k };
        const state = this.stateAt(grid, p.x, p.y, NO_ENDS, false);
        if (state === BLOCKED) continue;
        // Weich (an der Wand, zwischen Stühlen) nur, wenn es sonst nichts gibt; weiter weg nur ein wenig schlechter.
        const score =
          Math.hypot(p.x - from.x, p.y - from.y) + (state === SOFT ? 100 : 0) + (dd > d ? 0.5 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
    return best ?? { ...fallback };
  }

  /** Liegt ein Punkt frei, auch außerhalb des Wohlfühlabstands zu allen Hindernissen? */
  clear(role: NavRole, x: number, y: number): boolean {
    return this.stateAt(this.grid(role), x, y, NO_ENDS, false) === FREE;
  }

  /** Steht ein Punkt in einem harten Hindernis oder außerhalb der Zone der Rolle? (Tests, Prüfungen.) */
  blocked(role: NavRole, x: number, y: number): boolean {
    return this.stateAt(this.grid(role), x, y, NO_ENDS, false) === BLOCKED;
  }

  // ── Aufbau ────────────────────────────────────────────────────────────────────────────────────────────────

  private buildShapes(
    shown: readonly boolean[],
    decor: readonly boolean[],
    ambience: readonly boolean[],
    parking: number,
  ): Shape[] {
    const L = this.layout;
    const out: Shape[] = [];
    this.walls = [];
    // Wände: jede Kante zwischen Raum und Nicht-Raum, außer der Tür.
    const e = L.entrance;
    const door = L.entranceSide === 'v' ? { x: e.x + 1, y: e.y } : { x: e.x, y: e.y + 1 };
    const w = NAV.wallHalf;
    const b = NAV.bounds;
    for (let y = Math.floor(b.y0); y <= Math.ceil(b.y1); y++)
      for (let x = Math.floor(b.x0); x <= Math.ceil(b.x1); x++) {
        if (!inRoom(L, x, y)) continue;
        for (const [dx, dy] of DIRS.slice(0, 4)) {
          const nx = x + dx;
          const ny = y + dy;
          if (inRoom(L, nx, ny)) continue;
          if (x === e.x && y === e.y && nx === door.x && ny === door.y) continue;
          const mx = x + dx * 0.5;
          const my = y + dy * 0.5;
          this.walls.push(
            dx !== 0
              ? { x0: mx, y0: y - 0.5, x1: mx, y1: y + 0.5 }
              : { x0: x - 0.5, y0: my, x1: x + 0.5, y1: my },
          );
          // An Wänden darf man anstehen (Stühle an der Wand): kein Körperabstand, nur die Wandstärke. Die Stücke
          // überlappen an den Enden, damit die Naht zwischen zwei Kacheln nicht offen bleibt.
          out.push(
            dx !== 0
              ? box(mx - w, y - 0.5 - w, mx + w, y + 0.5 + w, 0)
              : box(x - 0.5 - w, my - w, x + 0.5 + w, my + w, 0),
          );
        }
      }
    const tile = (p: GridPos) => box(p.x - 0.5, p.y - 0.5, p.x + 0.5, p.y + 0.5);
    for (const c of L.counter) out.push(tile(c));
    for (const s of L.stations) out.push(tile(s.tile));
    for (const p of L.storage.pieces) out.push(tile(p.tile));
    L.tables.forEach((t, i) => {
      if (!shown[i]) return;
      out.push(circle(t.tile, NAV.tableR, true));
      for (const s of t.seats) out.push(circle(s, NAV.chairR, false));
    });
    L.decor.forEach((d, i) => {
      if (!decor[i] || d.wall || d.floor || HANGING.test(d.frame)) return;
      out.push(
        d.frame === 'deco-stool'
          ? circle(d.tile, NAV.chairR, false)
          : circle(d.tile, NAV.decorR, true),
      );
    });
    L.ambience.forEach((a, i) => {
      if (ambience[i]) out.push(circle(a.tile, NAV.decorR, true));
    });
    for (const q of L.order.queue) out.push(circle(q, NAV.queueR, false));
    out.push(circle(L.order.crowd, CROWD.crowdSpread / 2, false));
    // Parkplatz (Grid → Agenten: −0,5): Ständer, Roller- und Auto-Plätze, Schild, Ladesäule; unausgebaut ein Bauzaun.
    const lot = PARKING_LOT;
    for (const s of lot.slots) {
      if (parking < s.minLevel) continue;
      const [hx, hy] =
        s.kind === 'car' ? [0.36, 0.72] : s.kind === 'moped' ? [0.14, 0.36] : [0.12, 0.3];
      out.push(box(s.x - 0.5 - hx, s.y - 0.5 - hy, s.x - 0.5 + hx, s.y - 0.5 + hy));
    }
    if (parking > 0) out.push(circle({ x: lot.sign.x - 0.5, y: lot.sign.y - 0.5 }, 0.06, true));
    if (parking >= lot.charger.minLevel)
      out.push(circle({ x: lot.charger.x - 0.5, y: lot.charger.y - 0.5 }, 0.12, true));
    if (parking <= 0)
      out.push(box(lot.rect.x0 - 0.5, lot.fenceY - 0.55, lot.rect.x1 - 0.5, lot.fenceY - 0.45, 0));
    // Stadt-Objekte auf dem Gehweg (Grid-Koordinaten → Agenten: −0,5).
    for (const p of CITY.props) {
      const f = propFootprint(p);
      const s = box(f.x0 - 0.5, f.y0 - 0.5, f.x1 - 0.5, f.y1 - 0.5);
      if (s.x1 < b.x0 || s.x0 > b.x1 || s.y1 < b.y0 || s.y0 > b.y1) continue;
      out.push(s);
    }
    return out;
  }

  private grid(role: NavRole): Grid {
    const have = this.grids.get(role);
    if (have) return have;
    const n = this.cols * this.rows;
    const near: number[][] = Array.from({ length: n }, () => EMPTY);
    // Formen, die Punkte einer Zelle im Wohlfühlabstand erreichen können (halbe Diagonale Reserve).
    const reach = NAV.clearance + this.cell * Math.SQRT1_2 + 1e-6;
    this.shapes.forEach((s, idx) => {
      const c0 = Math.max(0, Math.floor((s.x0 - s.r - reach - this.x0) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.ceil((s.x1 + s.r + reach - this.x0) / this.cell));
      const r0 = Math.max(0, Math.floor((s.y0 - s.r - reach - this.y0) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.ceil((s.y1 + s.r + reach - this.y0) / this.cell));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const i = r * this.cols + c;
          const p = this.center(i);
          if (dist(s, p.x, p.y) >= reach) continue;
          const list = near[i] ?? EMPTY;
          near[i] = list === EMPTY ? [idx] : [...list, idx];
        }
    });
    const grid: Grid = { role, state: new Uint8Array(n), near, open: new Uint8Array(n) };
    const ring = NAV.clearance + this.cell * Math.SQRT1_2 + 0.02;
    for (let i = 0; i < n; i++) {
      const p = this.center(i);
      grid.state[i] = this.stateAt(grid, p.x, p.y, NO_ENDS, false);
      if (grid.state[i] !== FREE || (near[i] ?? EMPTY).length > 0) continue;
      let open = true;
      for (let k = 0; k < 16 && open; k++) {
        const a = (k / 16) * Math.PI * 2;
        if (!this.walkable(role, p.x + Math.cos(a) * ring, p.y + Math.sin(a) * ring)) open = false;
      }
      grid.open[i] = open ? 1 : 0;
    }
    this.grids.set(role, grid);
    return grid;
  }

  // ── Zustand eines Punkts ─────────────────────────────────────────────────────────────────────────────────

  /** Begehbar für die Rolle (Raum ohne bzw. nur Personal-Bereich, Gehweg)? */
  private walkable(role: NavRole, x: number, y: number): boolean {
    const b = NAV.bounds;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
    const L = this.layout;
    const tx = Math.round(x);
    const ty = Math.round(y);
    const { from, to, door } = L.staffArea;
    const behind = tx >= from.x && tx <= to.x && ty >= from.y && ty <= to.y;
    if (role === 'back') return behind;
    if (inRoom(L, tx, ty)) return role === 'staff' || !(behind || (tx === door.x && ty === door.y));
    return L.sidewalk.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
  }

  /**
   * Zustand eines Punkts. `exempt`: nahe Start oder Ziel der Anfrage zählt nur der Körper. Weich sind der
   * Wohlfühlabstand zu allen Formen und zum Rand der Zone, weiche Formen und stehende Figuren.
   */
  private stateAt(grid: Grid, x: number, y: number, q: Query, dynamic: boolean): PointState {
    const cell = this.cellAt(x, y);
    if (grid.open[cell]) return dynamic && this.nearOther(x, y, q) ? SOFT : FREE;
    if (!this.walkable(grid.role, x, y)) return BLOCKED;
    const near = grid.near[cell] ?? EMPTY;
    let soft = false;
    for (const idx of near) {
      const s = this.shapes[idx];
      if (!s) continue;
      const d = dist(s, x, y);
      if (s.hard && d < s.body) return BLOCKED;
      if (d < NAV.clearance) soft = true;
    }
    const exempt =
      Math.hypot(x - q.from.x, y - q.from.y) < NAV.endRadius ||
      Math.hypot(x - q.to.x, y - q.to.y) < NAV.endRadius;
    if (exempt) return FREE;
    if (soft) return SOFT;
    if (dynamic && this.nearOther(x, y, q)) return SOFT;
    const c = NAV.clearance;
    for (const [dx, dy] of DIRS) {
      const k = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
      if (!this.walkable(grid.role, x + dx * c * k, y + dy * c * k)) return SOFT;
    }
    return FREE;
  }

  /** Im Wohlfühlabstand einer stehenden Figur (nicht nahe Start oder Ziel)? */
  private nearOther(x: number, y: number, q: Query): boolean {
    if (q.others.length === 0) return false;
    if (q === this.marked && this.inGrid(x, y) && this.dynReach[this.cellAt(x, y)] !== this.gen)
      return false;
    if (
      Math.hypot(x - q.from.x, y - q.from.y) < NAV.endRadius ||
      Math.hypot(x - q.to.x, y - q.to.y) < NAV.endRadius
    )
      return false;
    for (const o of q.others)
      if (Math.hypot(x - o.x, y - o.y) < NAV.personR + NAV.clearance) return true;
    return false;
  }

  // ── A* ──────────────────────────────────────────────────────────────────────────────────────────────────

  private center(i: number): GridPos {
    return {
      x: this.x0 + (i % this.cols) * this.cell,
      y: this.y0 + Math.floor(i / this.cols) * this.cell,
    };
  }

  private inGrid(x: number, y: number): boolean {
    const b = NAV.bounds;
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }

  private cellAt(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.round((x - this.x0) / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.round((y - this.y0) / this.cell)));
    return r * this.cols + c;
  }

  /** Nächste nicht versperrte Zelle (falls ein Endpunkt in einem Hindernis liegt). */
  private nearestOpen(grid: Grid, i: number): number {
    if (grid.state[i] !== BLOCKED) return i;
    const c0 = i % this.cols;
    const r0 = Math.floor(i / this.cols);
    for (let ring = 1; ring < 12; ring++) {
      let best = -1;
      let bestD = Infinity;
      for (let r = r0 - ring; r <= r0 + ring; r++)
        for (let c = c0 - ring; c <= c0 + ring; c++) {
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
          if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring) continue;
          const j = r * this.cols + c;
          if (grid.state[j] === BLOCKED) continue;
          const d = Math.hypot(r - r0, c - c0);
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      if (best >= 0) return best;
    }
    return i;
  }

  /** A* über die Zellen (acht Nachbarn, keine Ecken schneiden); weiche Zellen kosten `NAV.softCost`. */
  private search(grid: Grid, q: Query): number[] | null {
    const gen = ++this.gen;
    this.marked = q;
    // Stehende Figuren als weiche Zellen dieser Anfrage.
    const rad = NAV.personR + NAV.clearance;
    const reach = rad + this.cell * Math.SQRT1_2 + 1e-9;
    for (const o of q.others) {
      const c0 = Math.max(0, Math.floor((o.x - reach - this.x0) / this.cell));
      const c1 = Math.min(this.cols - 1, Math.ceil((o.x + reach - this.x0) / this.cell));
      const r0 = Math.max(0, Math.floor((o.y - reach - this.y0) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.ceil((o.y + reach - this.y0) / this.cell));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const i = r * this.cols + c;
          const d = Math.hypot(this.x0 + c * this.cell - o.x, this.y0 + r * this.cell - o.y);
          if (d < rad) this.dyn[i] = gen;
          if (d < reach) this.dynReach[i] = gen;
        }
    }
    const start = this.nearestOpen(grid, this.cellAt(q.from.x, q.from.y));
    const goal = this.nearestOpen(grid, this.cellAt(q.to.x, q.to.y));
    const gp = this.center(goal);
    const cols = this.cols;
    // Zellmitten ohne Objekte (A* ruft beides je Nachbar auf; `center` legte jedes Mal ein Objekt an).
    const cx = (i: number): number => this.x0 + (i % cols) * this.cell;
    const cy = (i: number): number => this.y0 + Math.floor(i / cols) * this.cell;
    const h = (i: number): number => {
      const dx = Math.abs(cx(i) - gp.x);
      const dy = Math.abs(cy(i) - gp.y);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    // Zellen nahe Start und Ziel vorab markieren, statt je Nachbar zwei Abstände zu rechnen.
    for (const e of [q.from, q.to]) {
      const er = NAV.endRadius;
      const c0 = Math.max(0, Math.floor((e.x - er - this.x0) / this.cell));
      const c1 = Math.min(cols - 1, Math.ceil((e.x + er - this.x0) / this.cell));
      const r0 = Math.max(0, Math.floor((e.y - er - this.y0) / this.cell));
      const r1 = Math.min(this.rows - 1, Math.ceil((e.y + er - this.y0) / this.cell));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const i = r * cols + c;
          if (Math.hypot(cx(i) - e.x, cy(i) - e.y) < er) this.ends[i] = gen;
        }
    }
    const cost = (i: number): number => {
      if (this.ends[i] === gen) return 1;
      return grid.state[i] === SOFT || this.dyn[i] === gen ? NAV.softCost : 1;
    };
    const heap = this.heap;
    const hf = this.heapF;
    heap.length = 0;
    hf.length = 0;
    const push = (i: number, f: number): void => {
      heap.push(i);
      hf.push(f);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if ((hf[p] ?? 0) <= f) break;
        heap[k] = heap[p] ?? 0;
        hf[k] = hf[p] ?? 0;
        k = p;
      }
      heap[k] = i;
      hf[k] = f;
    };
    const pop = (): number => {
      const top = heap[0] ?? -1;
      const li = heap.pop() ?? 0;
      const lf = hf.pop() ?? 0;
      const n = heap.length;
      if (n > 0) {
        let k = 0;
        for (;;) {
          const a = 2 * k + 1;
          if (a >= n) break;
          const b = a + 1;
          const m = b < n && (hf[b] ?? 0) < (hf[a] ?? 0) ? b : a;
          if ((hf[m] ?? 0) >= lf) break;
          heap[k] = heap[m] ?? 0;
          hf[k] = hf[m] ?? 0;
          k = m;
        }
        heap[k] = li;
        hf[k] = lf;
      }
      return top;
    };
    this.g[start] = 0;
    this.seen[start] = gen;
    this.parent[start] = -1;
    push(start, h(start));
    while (heap.length > 0) {
      const cur = pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) break;
      const c = cur % cols;
      const r = Math.floor(cur / cols);
      const curCost = cost(cur);
      for (const [dx, dy] of DIRS) {
        const nc = c + dx;
        const nr = r + dy;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue;
        const ni = nr * cols + nc;
        if (grid.state[ni] === BLOCKED || this.closed[ni] === gen) continue;
        // Diagonal nur, wenn beide Nachbarn frei sind (nicht über Ecken).
        if (
          dx !== 0 &&
          dy !== 0 &&
          (grid.state[r * cols + nc] === BLOCKED || grid.state[nr * cols + c] === BLOCKED)
        )
          continue;
        const step = (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * this.cell;
        const ng = (this.g[cur] ?? 0) + step * (curCost + cost(ni)) * 0.5;
        if (this.seen[ni] === gen && ng >= (this.g[ni] ?? 0)) continue;
        this.seen[ni] = gen;
        this.g[ni] = ng;
        this.parent[ni] = cur;
        push(ni, ng + h(ni));
      }
    }
    if (this.closed[goal] !== gen) return null;
    const out: number[] = [];
    for (let i = goal; i >= 0; i = this.parent[i] ?? -1) {
      out.push(i);
      if (i === start) break;
    }
    out.reverse();
    // Endpunkte selbst nicht doppelt: Zellen der Endpunkte bleiben als Stütze, falls sie verschoben wurden.
    if (out.length === 1) out.push(goal);
    return out;
  }

  // ── Glätten ─────────────────────────────────────────────────────────────────────────────────────────────

  /** Schneidet die Strecke a → b eine Wand? (Exakt: Wände sind dünner als der Abstand der Prüfpunkte.) */
  private crossesWall(a: GridPos, b: GridPos): boolean {
    for (const w of this.walls) {
      if (w.x0 === w.x1) {
        if ((a.x - w.x0) * (b.x - w.x0) > 0 || a.x === b.x) continue;
        const y = a.y + ((b.y - a.y) * (w.x0 - a.x)) / (b.x - a.x);
        if (y >= w.y0 && y <= w.y1) return true;
      } else {
        if ((a.y - w.y0) * (b.y - w.y0) > 0 || a.y === b.y) continue;
        const x = a.x + ((b.x - a.x) * (w.y0 - a.y)) / (b.y - a.y);
        if (x >= w.x0 && x <= w.x1) return true;
      }
    }
    return false;
  }

  /**
   * Weiche Strecke (Kacheln) auf der Linie a → b und ob sie versperrt ist. Über `maxSoft` hinaus zählt sie nicht
   * weiter (der Aufrufer verwirft die Linie dann ohnehin).
   */
  private probe(
    grid: Grid,
    q: Query,
    a: GridPos,
    b: GridPos,
    maxSoft = Infinity,
  ): { blocked: boolean; soft: number } {
    if (this.crossesWall(a, b)) return { blocked: true, soft: 0 };
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / NAV.sampleStep));
    let soft = 0;
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const y = a.y + ((b.y - a.y) * k) / n;
      const s = this.stateAt(grid, x, y, q, true);
      if (s === BLOCKED) return { blocked: true, soft };
      if (s === SOFT) {
        soft += len / n;
        if (soft > maxSoft) return { blocked: false, soft };
      }
    }
    return { blocked: false, soft };
  }

  /**
   * Abkürzen auf Sicht: von jedem Punkt so weit wie möglich geradeaus, solange die Linie frei bleibt und nicht mehr
   * durch den Wohlfühlabstand führt als der Rasterweg selbst.
   */
  private pull(grid: Grid, q: Query, pts: GridPos[]): GridPos[] {
    // Weiche Strecke des Rasterwegs bis zu jedem Punkt.
    const acc: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      acc.push((acc[i - 1] ?? 0) + this.probe(grid, q, a, b).soft);
    }
    const out: GridPos[] = [];
    let i = 0;
    const first = pts[0];
    if (first) out.push(first);
    while (i < pts.length - 1) {
      let j = i + 1;
      const a = pts[i];
      if (!a) break;
      for (let k = i + 2; k < pts.length; k++) {
        const b = pts[k];
        if (!b) break;
        const maxSoft = (acc[k] ?? 0) - (acc[i] ?? 0) + 0.15;
        const pr = this.probe(grid, q, a, b, maxSoft);
        if (pr.blocked || pr.soft > maxSoft) break;
        j = k;
      }
      const p = pts[j];
      if (p) out.push(p);
      i = j;
    }
    return out;
  }

  /** Ecken als Kurven (quadratische Bézier); eine Kurve, die ein hartes Hindernis streift, wird enger. */
  private round(grid: Grid, q: Query, pts: GridPos[]): GridPos[] {
    if (pts.length < 3) return pts.map((p) => ({ ...p }));
    const out: GridPos[] = [{ ...(pts[0] ?? q.from) }];
    for (let k = 1; k < pts.length - 1; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const c = pts[k + 1];
      if (!a || !b || !c) continue;
      const la = Math.hypot(a.x - b.x, a.y - b.y);
      const lc = Math.hypot(c.x - b.x, c.y - b.y);
      const ua = { x: (a.x - b.x) / (la || 1), y: (a.y - b.y) / (la || 1) };
      const uc = { x: (c.x - b.x) / (lc || 1), y: (c.y - b.y) / (lc || 1) };
      const turn = Math.PI - Math.acos(Math.max(-1, Math.min(1, ua.x * uc.x + ua.y * uc.y)));
      // Strecken teilen sich die Kurven der beiden Enden; Start- und Zielstrecke gehören einer Ecke allein.
      const maxA = k === 1 ? la * 0.9 : la * 0.5;
      const maxC = k === pts.length - 2 ? lc * 0.9 : lc * 0.5;
      let d = Math.min(NAV.cornerRadius, maxA, maxC);
      let curve: GridPos[] | null = null;
      if (turn > 0.12 && d > 0.02) {
        const steps = Math.max(3, Math.ceil(turn / 0.2));
        for (let tries = 0; tries < 4 && !curve; tries++, d *= 0.5) {
          const p0 = { x: b.x + ua.x * d, y: b.y + ua.y * d };
          const p2 = { x: b.x + uc.x * d, y: b.y + uc.y * d };
          const pts2: GridPos[] = [];
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const m = 1 - t;
            pts2.push({
              x: m * m * p0.x + 2 * m * t * b.x + t * t * p2.x,
              y: m * m * p0.y + 2 * m * t * b.y + t * t * p2.y,
            });
          }
          let ok = true;
          for (let s = 1; s < pts2.length && ok; s++) {
            const u = pts2[s - 1];
            const v = pts2[s];
            if (u && v && this.probe(grid, q, u, v).blocked) ok = false;
          }
          if (ok) curve = pts2;
        }
      }
      if (curve) out.push(...curve);
      else out.push({ ...b });
    }
    out.push({ ...(pts[pts.length - 1] ?? q.to) });
    return out;
  }
}

/** Hängende Deko (Leuchten): kein Hindernis am Boden. */
const HANGING = /pendant|chandelier/;

/** Länge eines Wegs ab `from` (Kacheln). */
export function pathLength(from: GridPos, path: readonly GridPos[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}
