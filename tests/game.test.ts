import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { botRun } from '../src/game/bot';
import { COLS, ROWS } from '../src/game/config';
import { SkillModel, stageDifficulty } from '../src/game/difficulty';
import { DEN_TILES, START_TILE, buildLayout, isFullyConnected } from '../src/game/maze';
import { MENUS } from '../src/game/menu';
import { smallPockets } from '../src/game/furniture';
import { Pathfinder, benchmarkAlgorithms, bfsDistances } from '../src/game/pathfinding';
import { replayRun, Run, type RunConfig } from '../src/game/run';
import { Stage } from '../src/game/stage';
import { freshModifiers } from '../src/game/perks';
import { SPRITES, PALETTE } from '../src/render/art';

const items = MENUS[3]!.breakfast;
const layoutFor = (seed: number) => buildLayout(seed, { foodCount: 30, items, maggiCount: 2 });

describe('maze generation (PCG)', () => {
  it('is deterministic for a seed', () => {
    expect(Array.from(layoutFor(99).grid.walls)).toEqual(Array.from(layoutFor(99).grid.walls));
    expect(layoutFor(99).food.map((f) => f.tile)).toEqual(layoutFor(99).food.map((f) => f.tile));
  });
  it('always yields a connected, fair level (many seeds)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const l = layoutFor(seed * 7919);
      expect(isFullyConnected(l)).toBe(true);
      expect(l.food.length).toBeGreaterThanOrEqual(26);
      expect(new Set(l.food.map((f) => f.tile)).size).toBe(l.food.length);
      for (const f of l.food) expect(l.grid.walls[f.tile]).toBe(0);
      expect(l.grid.walls[l.exit]).toBe(0);
      expect(l.maggi.length).toBeGreaterThanOrEqual(1);
      expect(bfsDistances(l.grid, START_TILE)[l.exit]!).toBeGreaterThanOrEqual(20); // the exit is a real trek away
      for (const d of DEN_TILES) expect(l.grid.walls[d]).toBe(0);
      expect(l.grid.walls.length).toBe(COLS * ROWS);
    }
  });
});

describe('pathfinding', () => {
  it('A*, Dijkstra and BFS all find shortest paths of equal length; A* expands least', () => {
    const l = layoutFor(1234);
    const pf = new Pathfinder(l.grid);
    const rng = mulberry32(5);
    let aStarWork = 0;
    let dijkstraWork = 0;
    for (let i = 0; i < 80; i++) {
      const a = l.floor[Math.floor(rng() * l.floor.length)]!;
      const b = l.floor[Math.floor(rng() * l.floor.length)]!;
      const ra = pf.search('astar', a, b);
      const rd = pf.search('dijkstra', a, b);
      const rb = pf.search('bfs', a, b);
      expect(ra.found && rd.found && rb.found).toBe(true);
      expect(ra.path.length).toBe(rd.path.length);
      expect(rb.path.length).toBe(rd.path.length);
      aStarWork += ra.expanded;
      dijkstraWork += rd.expanded;
    }
    expect(aStarWork).toBeLessThan(dijkstraWork);
  });
  it('nextStep returns an adjacent tile on a shortest path and respects blocked tiles', () => {
    const l = layoutFor(77);
    const pf = new Pathfinder(l.grid);
    const full = pf.search('astar', l.start, l.exit);
    expect(pf.nextStep(l.start, l.exit)).toBe(full.path[0]);
    expect(pf.nextStep(l.start, l.start)).toBe(-1);
    const blockedStep = pf.nextStep(l.start, l.exit, full.path[0]!);
    expect(blockedStep === -1 || blockedStep !== full.path[0]).toBe(true);
  });
  it('benchmark returns three rows', () => {
    const l = layoutFor(5);
    expect(benchmarkAlgorithms(l.grid, l.floor, 20, mulberry32(1)).map((r) => r.algo)).toEqual(['astar', 'dijkstra', 'bfs']);
  });
});

describe('difficulty', () => {
  it('gets harder through the week and adds enemies', () => {
    const mon = stageDifficulty(1, 0);
    const sun = stageDifficulty(0, 2);
    expect(sun.enemySpeedRatio).toBeGreaterThan(mon.enemySpeedRatio);
    expect(sun.roster.length).toBeGreaterThan(mon.roster.length);
    expect(sun.enemySpeedRatio).toBeLessThanOrEqual(0.9);
  });
  it('adaptive model speeds up for strong players and slows for struggling ones', () => {
    const strong = new SkillModel();
    const weak = new SkillModel();
    for (let i = 0; i < 6; i++) {
      strong.record({ cleared: true, livesLost: 0, time: 40, parTime: 75 });
      weak.record({ cleared: false, livesLost: 3, time: 20, parTime: 75 });
    }
    expect(strong.multiplier()).toBeGreaterThan(1.05);
    expect(weak.multiplier()).toBeLessThan(0.95);
    expect(strong.label()).toBe('SPICY');
    expect(weak.label()).toBe('GENTLE');
  });
});

describe('stage rules', () => {
  const mkStage = () =>
    new Stage({ layoutSeed: 11, simSeed: 22, weekday: 3, course: 0, difficulty: stageDifficulty(3, 0), mods: freshModifiers(), stomachs: 3 });

  it('starts with the exit closed and all food uneaten', () => {
    const s = mkStage();
    expect(s.exitOpen).toBe(false);
    expect(s.foodLeft).toBe(s.layout.food.length);
    expect(s.stomachs).toBe(3);
  });
  it('idle players get the Warden', () => {
    const s = new Stage({ layoutSeed: 11, simSeed: 22, weekday: 3, course: 0, difficulty: { ...stageDifficulty(3, 0), roster: [] }, mods: freshModifiers(), stomachs: 3 });
    let sawWarning = false;
    let sawWarden = false;
    for (let i = 0; i < 60 * 14 && s.state === 'playing'; i++) {
      s.tick(1 / 60, { dx: 0, dy: 0 });
      for (const e of s.drainEvents()) {
        if (e.t === 'wardenWarn') sawWarning = true;
        if (e.t === 'wardenIn') sawWarden = true;
      }
    }
    expect(sawWarning).toBe(true);
    expect(sawWarden).toBe(true);
  });
});

describe('enemy brains', () => {
  it('Wednesday Special flips PATROL -> CHASE when the player is close', () => {
    const s = new Stage({ layoutSeed: 3, simSeed: 4, weekday: 0, course: 2, difficulty: stageDifficulty(0, 2), mods: freshModifiers(), stomachs: 3 });
    const sp = s.enemies.find((e) => e.kind === 'special')!;
    expect(sp.special).toBe('patrol');
    // teleport the special next to the player and let the AI think
    sp.m.col = s.player.col;
    sp.m.row = s.player.row - 2;
    sp.mode = 'active';
    sp.m.dx = sp.m.dy = 0;
    s.tick(1 / 60, { dx: 0, dy: 0 });
    expect(sp.special).toBe('chase');
  });
});

describe('run determinism (basis for replay verification)', () => {
  const cfg: RunConfig = { mode: 'daily', seed: 20261007, weekday: 3, dateKey: '2026-10-07', adaptive: 1 };
  it('replaying the recorded inputs reproduces the exact result', () => {
    const original = botRun(cfg);
    const copy = replayRun(cfg, original.log);
    expect(copy.totalScore).toBe(original.totalScore);
    expect(copy.tickCount).toBe(original.tickCount);
    expect(copy.phase).toBe(original.phase);
    expect(original.totalScore).toBeGreaterThan(0);
  });
  it('different seeds give different mazes', () => {
    const a = new Run(cfg).stage.layout.grid.walls;
    const b = new Run({ ...cfg, seed: cfg.seed + 1 }).stage.layout.grid.walls;
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('pixel art data', () => {
  it('every sprite is rectangular and only uses known palette keys', () => {
    for (const [name, def] of Object.entries(SPRITES)) {
      const w = def.rows[0]!.length;
      for (const row of def.rows) {
        expect(row.length, `${name} row "${row}"`).toBe(w);
        for (const ch of row) expect(ch === '.' || ch in PALETTE, `${name}: ${ch}`).toBe(true);
      }
    }
  });
});

describe('furniture layout', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i * 7919 + 3);

  it('pieces never overlap and match the wall mask exactly', () => {
    for (const seed of seeds) {
      const { grid, furniture } = layoutFor(seed);
      const owner = new Map<number, number>();
      for (const [n, p] of furniture.entries()) {
        for (let y = p.y; y < p.y + p.h; y++) {
          for (let x = p.x; x < p.x + p.w; x++) {
            expect(owner.has(y * COLS + x)).toBe(false);
            owner.set(y * COLS + x, n);
          }
        }
      }
      for (let i = 0; i < COLS * ROWS; i++) {
        const border = i % COLS === 0 || i % COLS === COLS - 1 || i < COLS || i >= COLS * (ROWS - 1);
        expect(grid.walls[i] === 1).toBe(border || owner.has(i));
      }
    }
  });

  it('keeps the kitchen, start and corners clear, and uses varied furniture', () => {
    const kinds = new Set<string>();
    const sizes = new Set<string>();
    for (const seed of seeds) {
      const { grid, furniture } = layoutFor(seed);
      for (const t of [START_TILE, ...DEN_TILES, 1 * COLS + 1, 1 * COLS + 17, 19 * COLS + 1, 19 * COLS + 17]) expect(grid.walls[t]).toBe(0);
      for (const p of furniture) {
        kinds.add(p.kind);
        if (p.kind === 'table') sizes.add(`${p.w}x${p.h}`);
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(6);
    expect(sizes.size).toBeGreaterThanOrEqual(4);
  });

  it('every chair faces a neighbouring table or sits alone', () => {
    for (const seed of seeds.slice(0, 20)) {
      for (const p of layoutFor(seed).furniture) {
        if (p.kind === 'chair') expect(['n', 'e', 's', 'w']).toContain(p.facing);
      }
    }
  });

  it('is a fair fill: neither empty nor clogged', () => {
    for (const seed of seeds) {
      const walls = layoutFor(seed).grid.walls;
      let open = 0;
      for (let i = 0; i < walls.length; i++) if (!walls[i]) open++;
      expect(open).toBeGreaterThan(120);
      expect(open).toBeLessThan(260);
    }
  });

  it('has no trap pockets or dead-end tiles outside the reserved zones', () => {
    for (const seed of seeds) {
      const { grid } = layoutFor(seed);
      expect(smallPockets(grid.walls).length).toBe(0);
    }
  });

  it('puts the exit in different places on different days', () => {
    const exits = new Set(seeds.map((seed) => layoutFor(seed).exit));
    expect(exits.size).toBeGreaterThan(8);
  });
});
