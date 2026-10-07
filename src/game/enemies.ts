/**
 * Enemy AI.
 *
 * Every enemy is a small finite state machine over its *mode*:
 *     den -> active <-> scared -> eaten -> den
 * What differs is the `active` behaviour (Strategy pattern): each kind picks a target tile,
 * and A* turns that target into the next step. Decisions only happen when an enemy reaches
 * a tile centre and has a real choice, which keeps the AI cheap enough for phones.
 */
import { COLS } from './config';
import { PATROL_TILES, idx, manhattan, xOf, yOf } from './maze';
import { advanceMover, makeMover, reverseMover, type Mover } from './mover';
import type { Grid, Pathfinder } from './pathfinding';
import { DX, DY } from '../core/types';
import type { Rng } from '../core/rng';

export type EnemyKind = 'blob' | 'curry' | 'chapati' | 'special' | 'warden';
export type EnemyMode = 'den' | 'active' | 'scared' | 'eaten';
export type SpecialState = 'patrol' | 'chase';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  m: Mover;
  mode: EnemyMode;
  spawn: number;
  releaseAt: number;
  scaredUntil: number;
  baseSpeed: number;
  special: SpecialState;
  patrolIdx: number;
  chaseLostAt: number;
  /** Last target chosen by the AI (shown by the debug overlay). */
  target: number;
}

export interface AiContext {
  grid: Grid;
  pf: Pathfinder;
  rng: Rng;
  now: number;
  pTile: number;
  pdx: number;
  pdy: number;
}

export function makeEnemy(id: number, kind: EnemyKind, spawn: number, baseSpeed: number, releaseAt: number): Enemy {
  return {
    id,
    kind,
    m: makeMover(xOf(spawn), yOf(spawn), baseSpeed),
    mode: 'den',
    spawn,
    releaseAt,
    scaredUntil: 0,
    baseSpeed,
    special: 'patrol',
    patrolIdx: id % PATROL_TILES.length,
    chaseLostAt: -1,
    target: -1,
  };
}

/** Back to the kitchen (used after the player loses a stomach). */
export function resetEnemy(e: Enemy, releaseAt: number): void {
  e.m.col = xOf(e.spawn);
  e.m.row = yOf(e.spawn);
  e.m.dx = 0;
  e.m.dy = 0;
  e.m.t = 0;
  e.mode = 'den';
  e.releaseAt = releaseAt;
  e.special = 'patrol';
  e.chaseLostAt = -1;
}

export function frighten(e: Enemy, until: number): boolean {
  if (e.kind === 'warden' || (e.mode !== 'active' && e.mode !== 'scared')) return false;
  if (e.mode === 'active') reverseMover(e.m);
  e.mode = 'scared';
  e.scaredUntil = until;
  return true;
}

// --- active-mode behaviours: each returns a target tile, or -1 for "wander randomly" ---------

type Behaviour = (e: Enemy, c: AiContext) => number;

const chase: Behaviour = (_e, c) => c.pTile;

/** Aims a few tiles ahead of the player's heading; closes in directly when near. */
const ambush: Behaviour = (e, c) => {
  const here = e.m.row * COLS + e.m.col;
  if (manhattan(here, c.pTile) <= 3 || (c.pdx === 0 && c.pdy === 0)) return c.pTile;
  const px = xOf(c.pTile);
  const py = yOf(c.pTile);
  for (let k = 4; k >= 1; k--) {
    const x = px + c.pdx * k;
    const y = py + c.pdy * k;
    if (x > 0 && y > 0 && x < c.grid.cols - 1 && y < c.grid.rows - 1 && !c.grid.walls[idx(x, y)]) return idx(x, y);
  }
  return c.pTile;
};

const wander: Behaviour = () => -1;

/** Wednesday Special: PATROL corners until the player gets close, then CHASE; gives up after losing sight. */
const moody: Behaviour = (e, c) => {
  const here = e.m.row * COLS + e.m.col;
  const d = manhattan(here, c.pTile);
  if (e.special === 'patrol') {
    if (d <= 7) {
      e.special = 'chase';
      e.chaseLostAt = -1;
    }
  } else if (d > 10) {
    if (e.chaseLostAt < 0) e.chaseLostAt = c.now;
    else if (c.now - e.chaseLostAt > 2.5) e.special = 'patrol';
  } else {
    e.chaseLostAt = -1;
  }
  if (e.special === 'chase') return c.pTile;
  if (manhattan(here, PATROL_TILES[e.patrolIdx]!) <= 1) e.patrolIdx = (e.patrolIdx + 1) % PATROL_TILES.length;
  return PATROL_TILES[e.patrolIdx]!;
};

const BEHAVIOURS: Record<EnemyKind, Behaviour> = { blob: chase, curry: ambush, chapati: wander, special: moody, warden: chase };

const opts = new Int8Array(4);

export function chooseDirection(e: Enemy, c: AiContext): void {
  const m = e.m;
  const here = m.row * COLS + m.col;
  if (e.mode === 'eaten' && here === e.spawn) {
    e.mode = 'den';
    e.releaseAt = c.now + 2.5;
    m.dx = 0;
    m.dy = 0;
    return;
  }
  const rev = m.dx !== 0 || m.dy !== 0 ? here - (m.dy * COLS + m.dx) : -1;
  let n = 0;
  for (let d = 0; d < 4; d++) {
    const nx = m.col + DX[d]!;
    const ny = m.row + DY[d]!;
    if (nx < 0 || ny < 0 || nx >= c.grid.cols || ny >= c.grid.rows) continue;
    const ni = ny * COLS + nx;
    if (c.grid.walls[ni] || ni === rev) continue;
    opts[n++] = d;
  }
  if (n === 0) {
    for (let d = 0; d < 4; d++) {
      const ni = (m.row + DY[d]!) * COLS + (m.col + DX[d]!);
      if (ni === rev) opts[n++] = d;
    }
  }
  if (n === 0) {
    m.dx = 0;
    m.dy = 0;
    return;
  }
  let chosen = opts[0]!;
  if (n > 1) {
    const target = e.mode === 'eaten' ? e.spawn : e.mode === 'active' ? BEHAVIOURS[e.kind](e, c) : -1;
    e.target = target;
    let found = -1;
    if (target >= 0 && target !== here) {
      const next = c.pf.nextStep(here, target, e.mode === 'eaten' ? -1 : rev);
      if (next >= 0) {
        for (let i = 0; i < n; i++) {
          const d = opts[i]!;
          if ((m.row + DY[d]!) * COLS + (m.col + DX[d]!) === next) found = d;
        }
      }
    }
    chosen = found >= 0 ? found : opts[Math.floor(c.rng() * n)]!;
  } else {
    e.target = -1;
  }
  m.dx = DX[chosen]!;
  m.dy = DY[chosen]!;
}

export function updateEnemy(e: Enemy, dt: number, c: AiContext): void {
  if (e.mode === 'den') {
    if (c.now < e.releaseAt) return;
    e.mode = 'active';
  }
  if (e.mode === 'scared' && c.now >= e.scaredUntil) e.mode = 'active';
  e.m.speed = e.baseSpeed * (e.mode === 'scared' ? 0.55 : e.mode === 'eaten' ? 2 : 1);
  advanceMover(e.m, dt, () => chooseDirection(e, c));
}
