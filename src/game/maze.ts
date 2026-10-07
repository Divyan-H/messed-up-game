/**
 * Procedural content generation: the dining hall is furnished with tables, chairs and booths
 * (see furniture.ts), then populated with an exit, power-ups and food.
 * Everything derives from one seed, so a given date gives every player the same hall.
 */
import { COLS, ROWS } from './config';
import { type MenuItem } from './menu';
import { mulberry32, randInt, shuffle, type Rng } from '../core/rng';
import { bfsDistances, type Grid } from './pathfinding';
import { furnishHall, type Piece } from './furniture';

export const idx = (x: number, y: number): number => y * COLS + x;
export const xOf = (i: number): number => i % COLS;
export const yOf = (i: number): number => (i / COLS) | 0;
export const manhattan = (a: number, b: number): number => Math.abs(xOf(a) - xOf(b)) + Math.abs(yOf(a) - yOf(b));

export const START_TILE = idx(9, 19);
export const DEN_TILES = [idx(9, 9), idx(7, 9), idx(11, 9), idx(9, 7)] as const;
export const PATROL_TILES = [idx(1, 1), idx(17, 1), idx(17, 19), idx(1, 19)] as const;

export interface FoodSpawn {
  tile: number;
  item: MenuItem;
}

export interface StageLayout {
  grid: Grid;
  furniture: Piece[];
  floor: number[];
  start: number;
  exit: number;
  maggi: number[];
  snack: number;
  food: FoodSpawn[];
}

const MIN_EXIT_DISTANCE = 22;

/**
 * Step 2: place gameplay objects. Deterministic for a given seed + parameters.
 * If a generated maze happens to put the exit too close to the start, it is re-rolled
 * from a derived seed (still deterministic), so every level is a real trek.
 */
export function buildLayout(seed: number, opts: { foodCount: number; items: MenuItem[]; maggiCount: number }): StageLayout {
  let best: StageLayout | null = null;
  let bestDist = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    const layout = populate(mulberry32((seed + Math.imul(attempt, 0x9e3779b1)) >>> 0), opts);
    const d = bfsDistances(layout.grid, layout.start)[layout.exit]!;
    if (d > bestDist) {
      best = layout;
      bestDist = d;
    }
    if (d >= MIN_EXIT_DISTANCE) break;
  }
  return best!;
}

function populate(rng: Rng, opts: { foodCount: number; items: MenuItem[]; maggiCount: number }): StageLayout {
  const hall = furnishHall(rng);
  const grid: Grid = { cols: COLS, rows: ROWS, walls: hall.walls };
  const floor: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) if (!grid.walls[i]) floor.push(i);

  const distStart = bfsDistances(grid, START_TILE);
  const distDen = bfsDistances(grid, DEN_TILES[0]);
  const taken = new Set<number>([START_TILE, ...DEN_TILES]);

  // Exit: one of the tiles far from the player's start (forces a trip across the hall). Picked at random from
  // the farthest ~12% so the door is not always in the same corner.
  const byFar = (list: number[]) => [...list].sort((a, b) => distStart[b]! - distStart[a]!);
  const ranked = byFar(floor.filter((t) => !taken.has(t)));
  const far = ranked.filter((t) => distStart[t]! >= distStart[ranked[0]!]! * 0.88);
  const exit = far[randInt(rng, far.length)]!;
  taken.add(exit);

  // Maggi power-ups: far from the start and exit, spaced apart.
  const maggi: number[] = [];
  for (const t of shuffle([...floor], rng)) {
    if (maggi.length >= opts.maggiCount) break;
    if (taken.has(t) || distStart[t]! < 9 || manhattan(t, exit) < 7) continue;
    if (maggi.some((m) => manhattan(m, t) < 9)) continue;
    maggi.push(t);
    taken.add(t);
  }

  // Bonus snack: close to the enemy den (risk vs reward).
  const nearDen = floor.filter((t) => !taken.has(t) && distDen[t]! >= 3 && distDen[t]! <= 6);
  const snack = nearDen.length ? nearDen[randInt(rng, nearDen.length)]! : floor.find((t) => !taken.has(t))!;
  taken.add(snack);

  // Food: spaced out so a run across the maze keeps eating.
  const food: FoodSpawn[] = [];
  const candidates = shuffle(floor.filter((t) => !taken.has(t) && manhattan(t, START_TILE) > 2), rng);
  for (let gap = 3; gap >= 1 && food.length < opts.foodCount; gap--) {
    for (const t of candidates) {
      if (food.length >= opts.foodCount) break;
      if (food.some((f) => f.tile === t) || food.some((f) => manhattan(f.tile, t) < gap)) continue;
      food.push({ tile: t, item: opts.items[randInt(rng, opts.items.length)]! });
    }
  }
  return { grid, furniture: hall.pieces, floor, start: START_TILE, exit, maggi, snack, food };
}

/** Sanity check used by tests: every floor tile is reachable from the start. */
export function isFullyConnected(layout: StageLayout): boolean {
  const dist = bfsDistances(layout.grid, layout.start);
  return layout.floor.every((t) => dist[t]! >= 0);
}
