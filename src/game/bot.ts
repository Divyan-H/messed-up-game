/**
 * An automated player used for playtesting: Dijkstra over a danger-weighted cost map picks
 * the cheapest next target (food, power-up, snack or exit). Lets us measure difficulty
 * (clear rate per weekday) without human testers, and powers the in-game AI Lab.
 */
import { MinHeap } from '../core/heap';
import { DX, DY, type InputCode } from '../core/types';
import { COLS, ROWS } from './config';
import { manhattan, xOf, yOf } from './maze';
import { moverX, moverY } from './mover';
import type { Stage } from './stage';
import { Run, type RunConfig } from './run';

const N = COLS * ROWS;

export class Bot {
  private readonly cost = new Float64Array(N);
  private readonly dist = new Float64Array(N);
  private readonly parent = new Int32Array(N);
  private readonly heap = new MinHeap(N * 4 + 16);
  private code: InputCode = 0;
  private lastKey = -1;
  private target = -1;

  /**
   * Plans from the tile the player is *heading to* so the new direction is queued before
   * arrival. Re-plans only when that tile changes.
   */
  decide(stage: Stage): InputCode {
    const p = stage.player;
    const moving = p.dx !== 0 || p.dy !== 0;
    const base = moving ? (p.row + p.dy) * COLS + p.col + p.dx : p.row * COLS + p.col;
    const key = base * 10 + stage.stomachs;
    if (key === this.lastKey && this.code !== 0) return this.code;
    this.lastKey = key;
    this.code = this.plan(stage, base, moving ? p.row * COLS + p.col : -1);
    return this.code;
  }

  private plan(stage: Stage, start: number, prev: number): InputCode {
    const { walls } = stage.layout.grid;

    this.cost.fill(1);
    const threats: number[] = [];
    const all = stage.warden ? [...stage.enemies, stage.warden] : stage.enemies;
    for (const e of all) {
      if (e.mode === 'den' || e.mode === 'eaten') continue;
      if (e.mode === 'scared' && e.scaredUntil - stage.time > 3) continue;
      const et = Math.round(moverY(e.m)) * COLS + Math.round(moverX(e.m));
      threats.push(et);
      const ex = xOf(et);
      const ey = yOf(et);
      for (let y = Math.max(0, ey - 4); y <= Math.min(ROWS - 1, ey + 4); y++) {
        for (let x = Math.max(0, ex - 4); x <= Math.min(COLS - 1, ex + 4); x++) {
          const d = Math.abs(x - ex) + Math.abs(y - ey);
          if (d <= 4) this.cost[y * COLS + x]! += (5 - d) * (5 - d) * 3;
        }
      }
      this.cost[et]! += 300;
      // The tile an enemy is walking toward is just as dangerous.
      if (e.m.dx || e.m.dy) this.cost[(e.m.row + e.m.dy) * COLS + e.m.col + e.m.dx]! += 150;
    }

    // Momentum: discourage turning straight back, which makes the bot jitter in corridors.
    if (prev >= 0) this.cost[prev]! += 6;

    this.dist.fill(Infinity);
    this.dist[start] = 0;
    this.parent[start] = -1;
    this.heap.clear();
    this.heap.push(0, start);
    while (!this.heap.isEmpty) {
      const cur = this.heap.pop();
      const cd = this.dist[cur]!;
      const cx = cur % COLS;
      const cy = (cur / COLS) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d]!;
        const ny = cy + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const ni = ny * COLS + nx;
        if (walls[ni]) continue;
        const nd = cd + this.cost[ni]!;
        if (nd < this.dist[ni]!) {
          this.dist[ni] = nd;
          this.parent[ni] = cur;
          this.heap.push(nd, ni);
        }
      }
    }

    let best = -1;
    let bestCost = Infinity;
    const consider = (tile: number, bias = 0) => {
      const c = this.dist[tile]! + bias;
      if (c < bestCost) {
        bestCost = c;
        best = tile;
      }
    };
    const danger = threats.some((t) => manhattan(t, start) <= 7);
    if (stage.exitOpen) consider(stage.layout.exit);
    else for (const t of stage.foodAt.keys()) consider(t);
    if (danger) for (const t of stage.maggiAlive) if (this.dist[t]! < 30) consider(t, -25);
    if (stage.snackActive && this.dist[stage.layout.snack]! < 24) consider(stage.layout.snack, -4);

    // Hysteresis: stick with the previous target unless something is clearly better.
    const keep = this.target;
    const keepValid = keep >= 0 && (stage.foodAt.has(keep) || keep === stage.layout.exit || stage.maggiAlive.has(keep));
    if (keepValid && Number.isFinite(this.dist[keep]!) && this.dist[keep]! <= bestCost + 25) best = keep;
    this.target = best;
    if (best < 0 || !Number.isFinite(bestCost)) return 0;
    let c = best;
    while (this.parent[c] !== start && this.parent[c]! >= 0) c = this.parent[c]!;
    if (this.parent[c] !== start) return 0;
    for (let d = 0; d < 4; d++) if (start + DY[d]! * COLS + DX[d]! === c) return (d + 1) as InputCode;
    return 0;
  }
}

/** Plays a whole run with the bot (always taking the first offered perk). Used by tests, scripts and the AI Lab. */
export function botRun(cfg: RunConfig, maxTicks = 60 * 60 * 15): Run {
  const run = new Run(cfg);
  let bot = new Bot();
  let stage = run.stage;
  while (!run.finished && run.tickCount < maxTicks) {
    if (run.stage !== stage) {
      stage = run.stage;
      bot = new Bot();
    }
    if (run.phase === 'perk') run.choosePerk(run.perkOffer[0]!.id);
    run.tick(run.phase === 'playing' ? bot.decide(run.stage) : 0);
  }
  return run;
}
