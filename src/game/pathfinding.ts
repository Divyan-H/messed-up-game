/**
 * Grid search algorithms: A*, Dijkstra and BFS share one allocation-free Pathfinder.
 * Buffers are reused between searches via a generation "stamp", so enemy AI can
 * search every time it reaches a tile without creating garbage.
 */
import { MinHeap } from '../core/heap';
import { DX, DY } from '../core/types';

export interface Grid {
  readonly cols: number;
  readonly rows: number;
  /** 1 = wall, 0 = floor. Index = y * cols + x. */
  readonly walls: Uint8Array;
}

export type Algo = 'astar' | 'dijkstra' | 'bfs';

export interface SearchResult {
  found: boolean;
  /** Tile indices from the first step up to and including the goal (start excluded). */
  path: number[];
  /** Nodes popped from the open set - the usual "work done" metric. */
  expanded: number;
}

export class Pathfinder {
  private readonly n: number;
  private readonly g: Int32Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly queue: Int32Array;
  private readonly heap: MinHeap;
  private stamp = 0;
  /** Nodes expanded by the most recent search. */
  expanded = 0;

  constructor(private readonly grid: Grid) {
    this.n = grid.cols * grid.rows;
    this.g = new Int32Array(this.n);
    this.parent = new Int32Array(this.n);
    this.seen = new Uint32Array(this.n);
    this.closed = new Uint32Array(this.n);
    this.queue = new Int32Array(this.n);
    this.heap = new MinHeap(this.n * 4 + 16);
  }

  /** Runs a search; `blocked` is one extra tile treated as a wall (used to forbid reversing). */
  private run(algo: Algo, start: number, goal: number, blocked: number): boolean {
    const { cols, rows, walls } = this.grid;
    const stamp = ++this.stamp;
    this.expanded = 0;
    this.seen[start] = stamp;
    this.g[start] = 0;
    this.parent[start] = -1;

    if (algo === 'bfs') {
      let head = 0;
      let tail = 0;
      this.queue[tail++] = start;
      while (head < tail) {
        const cur = this.queue[head++]!;
        this.expanded++;
        if (cur === goal) return true;
        const cx = cur % cols;
        const cy = (cur / cols) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX[d]!;
          const ny = cy + DY[d]!;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (walls[ni] || ni === blocked || this.seen[ni] === stamp) continue;
          this.seen[ni] = stamp;
          this.parent[ni] = cur;
          this.queue[tail++] = ni;
        }
      }
      return false;
    }

    const useH = algo === 'astar';
    const gx = goal % cols;
    const gy = (goal / cols) | 0;
    const heap = this.heap;
    heap.clear();
    heap.push(0, start);
    while (!heap.isEmpty) {
      const cur = heap.pop();
      if (this.closed[cur] === stamp) continue;
      this.closed[cur] = stamp;
      this.expanded++;
      if (cur === goal) return true;
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      const ng = this.g[cur]! + 1;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX[d]!;
        const ny = cy + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (walls[ni] || ni === blocked || this.closed[ni] === stamp) continue;
        if (this.seen[ni] !== stamp || ng < this.g[ni]!) {
          this.seen[ni] = stamp;
          this.g[ni] = ng;
          this.parent[ni] = cur;
          heap.push(useH ? ng + Math.abs(nx - gx) + Math.abs(ny - gy) : ng, ni);
        }
      }
    }
    return false;
  }

  search(algo: Algo, start: number, goal: number, blocked = -1): SearchResult {
    const found = start === goal ? true : this.run(algo, start, goal, blocked);
    const path: number[] = [];
    if (found && start !== goal) {
      for (let c = goal; c !== start && c >= 0; c = this.parent[c]!) path.push(c);
      path.reverse();
    }
    return { found, path, expanded: this.expanded };
  }

  /** First tile on the A* path from `start` to `goal`, or -1. Allocation-free hot path for enemy AI. */
  nextStep(start: number, goal: number, blocked = -1): number {
    if (start === goal || !this.run('astar', start, goal, blocked)) return -1;
    let c = goal;
    while (this.parent[c] !== start) c = this.parent[c]!;
    return c;
  }
}

/** BFS distance from `start` to every reachable floor tile (-1 = unreachable/wall). */
export function bfsDistances(grid: Grid, start: number): Int32Array {
  const { cols, rows, walls } = grid;
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++]!;
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d]!;
      const ny = cy + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (walls[ni] || dist[ni] !== -1) continue;
      dist[ni] = dist[cur]! + 1;
      queue[tail++] = ni;
    }
  }
  return dist;
}

export interface BenchRow {
  algo: Algo;
  avgExpanded: number;
  avgMicros: number;
  avgPathLen: number;
}

/** Compares the three algorithms on random floor-tile pairs. Used by the in-game AI Lab. */
export function benchmarkAlgorithms(grid: Grid, floor: readonly number[], pairs: number, rng: () => number): BenchRow[] {
  const pf = new Pathfinder(grid);
  const picks: Array<[number, number]> = [];
  for (let i = 0; i < pairs; i++) {
    picks.push([floor[Math.floor(rng() * floor.length)]!, floor[Math.floor(rng() * floor.length)]!]);
  }
  const rows: BenchRow[] = [];
  for (const algo of ['astar', 'dijkstra', 'bfs'] as const) {
    let expanded = 0;
    let len = 0;
    const t0 = performance.now();
    for (const [a, b] of picks) {
      const r = pf.search(algo, a, b);
      expanded += r.expanded;
      len += r.path.length;
    }
    const ms = performance.now() - t0;
    rows.push({ algo, avgExpanded: expanded / pairs, avgMicros: (ms * 1000) / pairs, avgPathLen: len / pairs });
  }
  return rows;
}
