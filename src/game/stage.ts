/**
 * One maze level. Pure simulation: no DOM, no Math.random, no wall-clock time.
 * Given the same seeds and the same inputs on the same ticks it always plays out identically,
 * which is what makes replay verification and headless bot playtesting possible.
 */
import { mulberry32, type Rng } from '../core/rng';
import { NO_DIR, type Dir } from '../core/types';
import {
  COLS, HUNGER_REFILL, INVULN_SECONDS, COMBO_WINDOW, PLAYER_SPEED, POINTS, SNACK_LIFETIME, WARDEN_SPAWN_AT, WARDEN_WARN_AT,
} from './config';
import type { StageDifficulty } from './difficulty';
import { frighten, makeEnemy, resetEnemy, updateEnemy, type AiContext, type Enemy } from './enemies';
import { DEN_TILES, START_TILE, buildLayout, idx, xOf, yOf, type FoodSpawn, type StageLayout } from './maze';
import { MENUS, mealItems, type MenuItem } from './menu';
import { advanceMover, makeMover, moverX, moverY, reverseMover, type Mover } from './mover';
import { Pathfinder, bfsDistances } from './pathfinding';
import type { RunModifiers } from './perks';

export type GameEvent =
  | { t: 'eat'; x: number; y: number; pts: number; combo: number; mult: number; item: MenuItem }
  | { t: 'snack'; x: number; y: number; pts: number; item: MenuItem }
  | { t: 'snackIn' }
  | { t: 'maggi' }
  | { t: 'scaredEnd' }
  | { t: 'eatEnemy'; x: number; y: number; pts: number; chain: number }
  | { t: 'hit'; cause: 'enemy' | 'starve' | 'warden' }
  | { t: 'exitOpen' }
  | { t: 'clear'; bonus: number }
  | { t: 'lost' }
  | { t: 'wardenWarn' }
  | { t: 'wardenIn' }
  | { t: 'wardenOut' }
  | { t: 'release'; kind: Enemy['kind'] };

export interface StageParams {
  layoutSeed: number;
  simSeed: number;
  weekday: number;
  course: number;
  difficulty: StageDifficulty;
  mods: RunModifiers;
  stomachs: number;
}

export interface StageStats {
  time: number;
  foodEaten: number;
  enemiesEaten: number;
  livesLost: number;
  maxCombo: number;
}

export class Stage {
  readonly layout: StageLayout;
  readonly pf: Pathfinder;
  readonly rng: Rng;
  readonly player: Mover;
  readonly enemies: Enemy[] = [];
  readonly foodAt = new Map<number, FoodSpawn>();
  readonly maggiAlive = new Set<number>();
  readonly events: GameEvent[] = [];
  readonly stats: StageStats = { time: 0, foodEaten: 0, enemiesEaten: 0, livesLost: 0, maxCombo: 0 };
  readonly foodTotal: number;
  readonly snackItem: MenuItem;

  state: 'playing' | 'cleared' | 'lost' = 'playing';
  time = 0;
  score = 0;
  stomachs: number;
  hunger = 1;
  combo = 0;
  comboMult = 1;
  lastEat = -99;
  foodLeft: number;
  exitOpen = false;
  maggiUntil = 0;
  chain = 0;
  invulnUntil = 0;
  sinceFood = 0;
  snackActive = false;
  snackUntil = 0;
  private snackSpawned = false;
  warden: Enemy | null = null;
  private wardenLeaveAt = -1;
  private wardenWarned = false;
  queued: Dir = NO_DIR;

  constructor(readonly params: StageParams) {
    const { difficulty: diff, weekday, course, mods } = params;
    const menu = MENUS[weekday]!;
    this.snackItem = menu.snack;
    this.layout = buildLayout(params.layoutSeed, { foodCount: diff.foodCount, items: mealItems(menu, course), maggiCount: 2 });
    this.pf = new Pathfinder(this.layout.grid);
    this.rng = mulberry32(params.simSeed);
    this.stomachs = params.stomachs;
    for (const f of this.layout.food) this.foodAt.set(f.tile, f);
    for (const m of this.layout.maggi) this.maggiAlive.add(m);
    this.foodTotal = this.foodLeft = this.layout.food.length;

    this.player = makeMover(xOf(START_TILE), yOf(START_TILE), PLAYER_SPEED * mods.speedMul);
    const enemySpeed = PLAYER_SPEED * diff.enemySpeedRatio;
    diff.roster.forEach((kind, i) => {
      this.enemies.push(makeEnemy(i, kind, DEN_TILES[i]!, enemySpeed, 1.2 + i * diff.releaseInterval));
    });
  }

  private open(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < COLS && y < this.layout.grid.rows && !this.layout.grid.walls[idx(x, y)];
  }

  private readonly decidePlayer = (m: Mover): void => {
    const q = this.queued;
    if ((q.dx !== 0 || q.dy !== 0) && this.open(m.col + q.dx, m.row + q.dy)) {
      m.dx = q.dx;
      m.dy = q.dy;
      return;
    }
    if ((m.dx !== 0 || m.dy !== 0) && this.open(m.col + m.dx, m.row + m.dy)) return;
    m.dx = 0;
    m.dy = 0;
  };

  /** Tile the player is (mostly) standing on. */
  get playerTile(): number {
    const p = this.player;
    return p.t < 0.5 ? p.row * COLS + p.col : (p.row + p.dy) * COLS + (p.col + p.dx);
  }

  tick(dt: number, dir: Dir): void {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.stats.time = this.time;
    this.queued = dir;
    const p = this.player;
    if ((p.dx !== 0 || p.dy !== 0) && dir.dx === -p.dx && dir.dy === -p.dy) reverseMover(p);
    advanceMover(p, dt, this.decidePlayer);
    this.checkPickups();
    if (this.state !== 'playing') return;

    const ctx = this.aiContext();
    for (const e of this.enemies) {
      const before = e.mode;
      updateEnemy(e, dt, ctx);
      if (before === 'den' && e.mode !== 'den') this.events.push({ t: 'release', kind: e.kind });
    }
    if (this.warden) updateEnemy(this.warden, dt, ctx);
    this.checkCollisions();
    if (this.state === 'playing') this.updateTimers(dt);
  }

  private aiContext(): AiContext {
    return {
      grid: this.layout.grid,
      pf: this.pf,
      rng: this.rng,
      now: this.time,
      pTile: this.playerTile,
      pdx: this.player.dx,
      pdy: this.player.dy,
    };
  }

  private checkPickups(): void {
    const px = moverX(this.player);
    const py = moverY(this.player);
    const tx = Math.round(px);
    const ty = Math.round(py);
    if (Math.abs(px - tx) + Math.abs(py - ty) > 0.4) return;
    const tile = idx(tx, ty);

    const food = this.foodAt.get(tile);
    if (food) {
      this.foodAt.delete(tile);
      this.eatFood(food, tx, ty);
    }
    if (this.maggiAlive.delete(tile)) this.eatMaggi();
    if (this.snackActive && tile === this.layout.snack) {
      this.snackActive = false;
      this.score += POINTS.snack;
      this.events.push({ t: 'snack', x: tx, y: ty, pts: POINTS.snack, item: this.snackItem });
    }
    if (this.exitOpen && tile === this.layout.exit) {
      const underPar = Math.max(0, Math.floor(this.params.difficulty.parTime - this.time));
      const bonus = POINTS.stageClear + underPar * POINTS.perSecondUnderPar + this.stomachs * POINTS.perStomach;
      this.score += bonus;
      this.state = 'cleared';
      this.events.push({ t: 'clear', bonus });
    }
  }

  private eatFood(food: FoodSpawn, x: number, y: number): void {
    this.foodLeft--;
    this.stats.foodEaten++;
    const window = COMBO_WINDOW + this.params.mods.comboBonus;
    this.combo = this.time - this.lastEat <= window ? this.combo + 1 : 1;
    this.lastEat = this.time;
    this.comboMult = 1 + Math.min(4, Math.floor(this.combo / 5));
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    const pts = POINTS.food * this.comboMult;
    this.score += pts;
    this.hunger = Math.min(1, this.hunger + HUNGER_REFILL);
    this.sinceFood = 0;
    this.wardenWarned = false;
    if (this.warden && this.wardenLeaveAt < 0) this.wardenLeaveAt = this.time + 3;
    this.events.push({ t: 'eat', x, y, pts, combo: this.combo, mult: this.comboMult, item: food.item });

    if (this.foodLeft === 0) {
      this.exitOpen = true;
      this.events.push({ t: 'exitOpen' });
    }
    if (!this.snackSpawned && this.foodLeft <= Math.floor(this.foodTotal / 2)) {
      this.snackSpawned = this.snackActive = true;
      this.snackUntil = this.time + SNACK_LIFETIME;
      this.events.push({ t: 'snackIn' });
    }
  }

  private eatMaggi(): void {
    this.maggiUntil = this.time + this.params.difficulty.maggiSeconds + this.params.mods.maggiBonus;
    this.chain = 0;
    for (const e of this.enemies) frighten(e, this.maggiUntil);
    this.events.push({ t: 'maggi' });
  }

  private checkCollisions(): void {
    const px = moverX(this.player);
    const py = moverY(this.player);
    const all = this.warden ? [...this.enemies, this.warden] : this.enemies;
    for (const e of all) {
      if (e.mode === 'den' || e.mode === 'eaten') continue;
      const dx = moverX(e.m) - px;
      const dy = moverY(e.m) - py;
      if (dx * dx + dy * dy > 0.32) continue;
      if (e.mode === 'scared') {
        const pts = POINTS.enemyBase * 2 ** this.chain;
        this.chain++;
        this.score += pts;
        this.stats.enemiesEaten++;
        e.mode = 'eaten';
        this.events.push({ t: 'eatEnemy', x: px + 0.5, y: py + 0.5, pts, chain: this.chain });
      } else if (this.time >= this.invulnUntil) {
        this.loseStomach(e.kind === 'warden' ? 'warden' : 'enemy');
        return;
      }
    }
  }

  private loseStomach(cause: 'enemy' | 'starve' | 'warden'): void {
    this.stomachs--;
    this.stats.livesLost++;
    this.combo = 0;
    this.comboMult = 1;
    this.events.push({ t: 'hit', cause });
    if (this.stomachs <= 0) {
      this.state = 'lost';
      this.events.push({ t: 'lost' });
      return;
    }
    this.respawn();
  }

  private respawn(): void {
    const p = this.player;
    p.col = xOf(START_TILE);
    p.row = yOf(START_TILE);
    p.dx = p.dy = 0;
    p.t = 0;
    this.enemies.forEach((e, i) => resetEnemy(e, this.time + 1.4 + i * this.params.difficulty.releaseInterval * 0.6));
    this.warden = null;
    this.wardenLeaveAt = -1;
    this.maggiUntil = 0;
    this.invulnUntil = this.time + INVULN_SECONDS;
    this.sinceFood = 0;
    this.wardenWarned = false;
  }

  private updateTimers(dt: number): void {
    this.hunger -= dt / this.params.difficulty.hungerSeconds;
    if (this.hunger <= 0) {
      this.hunger = 0.45;
      this.loseStomach('starve');
      return;
    }
    this.sinceFood += dt;
    if (!this.warden && !this.wardenWarned && this.sinceFood >= WARDEN_WARN_AT) {
      this.wardenWarned = true;
      this.events.push({ t: 'wardenWarn' });
    }
    if (!this.warden && this.sinceFood >= WARDEN_SPAWN_AT) this.spawnWarden();
    if (this.warden && this.wardenLeaveAt >= 0 && this.time >= this.wardenLeaveAt) {
      this.warden = null;
      this.wardenLeaveAt = -1;
      this.events.push({ t: 'wardenOut' });
    }
    if (this.maggiUntil > 0 && this.time >= this.maggiUntil) {
      this.maggiUntil = 0;
      this.events.push({ t: 'scaredEnd' });
    }
    if (this.snackActive && this.time >= this.snackUntil) this.snackActive = false;
    if (this.combo > 0 && this.time - this.lastEat > COMBO_WINDOW + this.params.mods.comboBonus) {
      this.combo = 0;
      this.comboMult = 1;
    }
  }

  private spawnWarden(): void {
    const dist = bfsDistances(this.layout.grid, this.playerTile);
    let best = this.layout.floor[0]!;
    for (const t of this.layout.floor) if (dist[t]! > dist[best]!) best = t;
    const w = makeEnemy(100, 'warden', best, PLAYER_SPEED * this.params.mods.speedMul * 0.78, 0);
    w.mode = 'active';
    this.warden = w;
    this.wardenLeaveAt = -1;
    this.events.push({ t: 'wardenIn' });
  }

  /** Hands queued events to the presentation layer. */
  drainEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }
}
