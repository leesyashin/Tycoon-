import { CROWD, type CafeLayout, type GridPos, type StationPlacement } from '@data/layouts';
import type { CustomerTypeId } from '@data/customerTypes';
import { customerTypeShares, pickCustomerType } from '@core/customers/types';

/**
 * Kosmetische Kunden. Liest nur Raten aus `core`, schreibt nie in den GameState:
 * Einnahmen entstehen ausschließlich im Rate-Modell. Kein Phaser-Import, damit testbar.
 */
export type AgentPhase = 'walkIn' | 'queue' | 'serve' | 'leave';

export interface Agent {
  readonly id: number;
  active: boolean;
  type: CustomerTypeId;
  stationId: string;
  phase: AgentPhase;
  x: number;
  y: number;
  /** Restliche Waypoints (walkIn/leave). */
  path: GridPos[];
  timer: number;
  /** Versatz im Gedränge hinter der sichtbaren Schlange. */
  jx: number;
  jy: number;
}

export interface CrowdUpdate {
  /** Agenten, die in diesem Schritt fertig bedient wurden (für Münz-Popups). */
  purchases: Agent[];
  spawned: number;
}

export class CustomerCrowd {
  readonly agents: Agent[] = [];
  private readonly queues = new Map<string, Agent[]>();
  private readonly placements = new Map<string, StationPlacement>();
  private readonly shares: Record<CustomerTypeId, number>;
  private spawnAcc = 0;
  private totalRate = 0;

  constructor(
    private readonly layout: CafeLayout,
    locationId: string,
    private readonly rng: () => number = Math.random,
  ) {
    for (const p of layout.stations) this.placements.set(p.stationId, p);
    this.shares = customerTypeShares(locationId);
    for (let i = 0; i < CROWD.maxAgents; i++) {
      this.agents.push({
        id: i,
        active: false,
        type: 'student',
        stationId: '',
        phase: 'walkIn',
        x: 0,
        y: 0,
        path: [],
        timer: 0,
        jx: 0,
        jy: 0,
      });
    }
  }

  get activeCount(): number {
    return this.agents.reduce((n, a) => n + (a.active ? 1 : 0), 0);
  }

  /** Geschätzte Kunden im Café, die nicht als Figur gezeigt werden („+N“); nur bei vollem Pool. */
  get hiddenCount(): number {
    const active = this.activeCount;
    if (active < CROWD.maxAgents) return 0;
    return Math.max(0, Math.round(this.totalRate * CROWD.avgVisitSec) - active);
  }

  queueLength(stationId: string): number {
    return this.queues.get(stationId)?.length ?? 0;
  }

  /**
   * @param perStation bediente Kunden/s je Station aus `computeLocationRates`
   */
  update(dtSec: number, perStation: Readonly<Record<string, number>>): CrowdUpdate {
    const dt = Number.isFinite(dtSec) ? Math.max(0, dtSec) : 0;
    const rates = Object.entries(perStation).filter(([id, r]) => r > 0 && this.placements.has(id));
    this.totalRate = rates.reduce((a, [, r]) => a + r, 0);

    let spawned = 0;
    this.spawnAcc += this.totalRate * dt;
    // Nach langen Pausen nicht hunderte Figuren auf einmal erzeugen.
    this.spawnAcc = Math.min(this.spawnAcc, CROWD.maxAgents);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.spawn(rates)) spawned++;
    }

    const purchases: Agent[] = [];
    const step = CROWD.walkTilesPerSec * dt;
    for (const a of this.agents) {
      if (!a.active) continue;
      if (this.advance(a, step, dt, perStation[a.stationId] ?? 0)) purchases.push(a);
    }
    return { purchases, spawned };
  }

  private spawn(rates: [string, number][]): boolean {
    const free = this.agents.find((a) => !a.active);
    if (!free || this.totalRate <= 0) return false;
    let roll = this.rng() * this.totalRate;
    let stationId = rates[rates.length - 1]?.[0] ?? '';
    for (const [id, r] of rates) {
      roll -= r;
      if (roll < 0) {
        stationId = id;
        break;
      }
    }
    const placement = this.placements.get(stationId);
    if (!placement) return false;
    const queue = this.queues.get(stationId) ?? [];
    queue.push(free);
    this.queues.set(stationId, queue);

    free.active = true;
    free.type = pickCustomerType(this.shares, this.rng());
    free.stationId = stationId;
    free.phase = 'walkIn';
    free.x = this.layout.entrance.x;
    free.y = this.layout.entrance.y;
    free.path = placement.path.map((p) => ({ ...p }));
    free.timer = 0;
    free.jx = (this.rng() - 0.5) * CROWD.crowdSpread;
    free.jy = (this.rng() - 0.5) * CROWD.crowdSpread;
    return true;
  }

  /** Plätze 0..maxQueue-1 bilden die Schlange, dahinter wartet ein lockeres Grüppchen. */
  private slotPos(a: Agent, p: StationPlacement, index: number): GridPos {
    if (index < CROWD.maxQueue) {
      return { x: p.access.x + p.queueDir.x * index, y: p.access.y + p.queueDir.y * index };
    }
    const end = CROWD.maxQueue;
    return {
      x: p.access.x + p.queueDir.x * end + a.jx,
      y: p.access.y + p.queueDir.y * end + a.jy,
    };
  }

  /** Bewegt einen Agenten; true, wenn er in diesem Schritt gekauft hat. */
  private advance(a: Agent, step: number, dt: number, stationRate: number): boolean {
    const p = this.placements.get(a.stationId);
    if (!p) {
      this.release(a);
      return false;
    }
    switch (a.phase) {
      case 'walkIn':
        if (this.follow(a, step)) a.phase = 'queue';
        return false;
      case 'queue': {
        const queue = this.queues.get(a.stationId) ?? [];
        const idx = queue.indexOf(a);
        const arrived = moveToward(a, this.slotPos(a, p, Math.max(0, idx)), step);
        if (arrived && idx === 0) {
          a.phase = 'serve';
          a.timer = serveDuration(stationRate);
        }
        return false;
      }
      case 'serve':
        a.timer -= dt;
        if (a.timer > 0) return false;
        this.dequeue(a);
        a.phase = 'leave';
        a.path = [...p.path.map((q) => ({ ...q })).reverse(), { ...this.layout.entrance }];
        return true;
      case 'leave':
        if (this.follow(a, step)) this.release(a);
        return false;
    }
  }

  private follow(a: Agent, step: number): boolean {
    let budget = step;
    while (a.path.length > 0 && budget > 0) {
      const target = a.path[0];
      if (!target) break;
      const d = Math.hypot(target.x - a.x, target.y - a.y);
      if (d <= budget) {
        a.x = target.x;
        a.y = target.y;
        a.path.shift();
        budget -= d;
      } else {
        moveToward(a, target, budget);
        budget = 0;
      }
    }
    return a.path.length === 0;
  }

  private dequeue(a: Agent): void {
    const queue = this.queues.get(a.stationId);
    if (!queue) return;
    const i = queue.indexOf(a);
    if (i >= 0) queue.splice(i, 1);
  }

  private release(a: Agent): void {
    this.dequeue(a);
    a.active = false;
    a.path = [];
  }
}

export function serveDuration(stationRate: number): number {
  const sec = stationRate > 0 ? 1 / stationRate : CROWD.maxServeSec;
  return Math.min(CROWD.maxServeSec, Math.max(CROWD.minServeSec, sec));
}

function moveToward(a: { x: number; y: number }, t: GridPos, step: number): boolean {
  const dx = t.x - a.x;
  const dy = t.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= step || d === 0) {
    a.x = t.x;
    a.y = t.y;
    return true;
  }
  a.x += (dx / d) * step;
  a.y += (dy / d) * step;
  return false;
}
