/**
 * Canvas renderer. The maze is drawn once into an offscreen layer; each frame only blits that
 * layer and draws the moving things. Nothing here mutates game state.
 */
import { COLS, THEMES, TILE, type DayTheme } from '../game/config';
import { ENEMY_COLOR, ENEMY_SPRITE, SPRITE_SIZE, sprite, type SpriteName } from './art';
import type { Surface } from './canvas';
import type { Effects } from './effects';
import { xOf, yOf } from '../game/maze';
import { moverX, moverY } from '../game/mover';
import type { Stage } from '../game/stage';
import type { Enemy } from '../game/enemies';
import { FOOD_VIEW } from './foodSprites';
import { HEADER_H, VIEW_H, VIEW_W, buildHallLayer, hallStrip } from './hall';

export { HEADER_H, VIEW_H, VIEW_W } from './hall';

export interface FrameInfo {
  /** Real-time animation clock in seconds. */
  anim: number;
  showPaths: boolean;
}

export class Renderer {
  private layer: Surface | null = null;
  private layerKey = '';
  theme: DayTheme = THEMES[1]!;

  constructor(private readonly ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false;
  }

  prepare(stage: Stage, theme: DayTheme): void {
    this.theme = theme;
    const key = `${theme.weekday}|${stage.params.layoutSeed}`;
    if (key !== this.layerKey) {
      this.layer = buildHallLayer(stage.layout.grid.walls, theme, stage.params.layoutSeed, stage.layout.furniture);
      this.layerKey = key;
    }
  }

  private spr(name: SpriteName, tx: number, ty: number, yOff = 0, flip = false): void {
    const s = sprite(name);
    const x = Math.round(tx * TILE + TILE / 2 - SPRITE_SIZE / 2);
    const y = Math.round(ty * TILE + TILE / 2 - SPRITE_SIZE / 2 + yOff);
    const ctx = this.ctx;
    if (flip) {
      ctx.save();
      ctx.translate(x + SPRITE_SIZE, y);
      ctx.scale(-1, 1);
      ctx.drawImage(s, 0, 0);
      ctx.restore();
    } else ctx.drawImage(s, x, y);
  }

  /** Soft blob shadow so characters sit on the floorboards instead of floating. */
  private shadow(tx: number, ty: number): void {
    const x = Math.round(tx * TILE + 2);
    const y = Math.round(ty * TILE + 11);
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 3, y, 6, 1);
    ctx.fillRect(x + 1, y + 1, 10, 2);
    ctx.fillRect(x + 3, y + 3, 6, 1);
  }

  draw(stage: Stage, fx: Effects, info: FrameInfo): void {
    const ctx = this.ctx;
    const { anim } = info;
    ctx.save();
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (fx.shakeAmount > 0.2) ctx.translate(Math.round((Math.random() - 0.5) * fx.shakeAmount), Math.round((Math.random() - 0.5) * fx.shakeAmount));
    if (this.layer) ctx.drawImage(this.layer, 0, 0);
    ctx.translate(0, HEADER_H); // everything below is in maze (tile) coordinates, under the back wall

    // exit door
    const ex = xOf(stage.layout.exit);
    const ey = yOf(stage.layout.exit);
    const pulse = 0.5 + 0.5 * Math.sin(anim * (stage.exitOpen ? 6 : 2.5));
    const halo = ctx.createRadialGradient(ex * TILE + 8, ey * TILE + 8, 2, ex * TILE + 8, ey * TILE + 8, stage.exitOpen ? 20 : 15);
    halo.addColorStop(0, `rgba(255,214,90,${(stage.exitOpen ? 0.45 : 0.22) + pulse * 0.2})`);
    halo.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(ex * TILE - 16, ey * TILE - 16, TILE * 3, TILE * 3);
    this.spr(stage.exitOpen ? 'doorOpen' : 'doorClosed', ex, ey);
    if (stage.exitOpen && Math.floor(anim * 4) % 2 === 0) {
      ctx.fillStyle = '#70e000';
      ctx.fillRect(ex * TILE + 1, ey * TILE + 1, 2, 2);
      ctx.fillRect(ex * TILE + TILE - 3, ey * TILE + TILE - 3, 2, 2);
    }

    // food, power-ups, snack
    const bob = Math.sin(anim * 5) > 0 ? 0 : -1;
    for (const f of stage.foodAt.values()) {
      this.spr('plate', xOf(f.tile), yOf(f.tile), 3);
      this.spr(FOOD_VIEW[f.item.kind].sprite, xOf(f.tile), yOf(f.tile), bob);
    }
    for (const m of stage.maggiAlive) {
      this.spr('maggi', xOf(m), yOf(m), Math.sin(anim * 6) > 0 ? -1 : 1);
      if (Math.floor(anim * 6) % 2) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(xOf(m) * TILE + 1, yOf(m) * TILE + 2, 2, 2);
      }
    }
    if (stage.snackActive) {
      const left = stage.snackUntil - stage.time;
      if (left > 3 || Math.floor(anim * 8) % 2) {
        this.spr('plate', xOf(stage.layout.snack), yOf(stage.layout.snack), 3);
        this.spr(FOOD_VIEW[stage.snackItem.kind].sprite, xOf(stage.layout.snack), yOf(stage.layout.snack), bob * 2);
      }
    }

    if (info.showPaths) this.drawPaths(stage);

    // enemies
    const all = stage.warden ? [...stage.enemies, stage.warden] : stage.enemies;
    for (const e of all) this.drawEnemy(e, stage, anim);

    // player
    const p = stage.player;
    const invuln = stage.time < stage.invulnUntil;
    if (!invuln || Math.floor(anim * 14) % 2 === 0) {
      this.shadow(moverX(p), moverY(p));
      const moving = p.dx !== 0 || p.dy !== 0;
      const frame = moving ? Math.floor(anim * 10) % 2 : 0;
      this.spr(frame ? 'player1' : 'player0', moverX(p), moverY(p), moving && frame ? -1 : 0, p.dx < 0);
    }

    // markers float above everyone so you can always find yourself and the dishes hunting you
    const arrow = Math.floor(anim * 4) % 2 === 0 ? 0 : 1;
    if (!invuln || Math.floor(anim * 14) % 2 === 0) this.marker(moverX(p), moverY(p), '#ffffff', arrow);
    for (const e of all) {
      if (e.mode === 'den' || e.mode === 'eaten') continue;
      this.marker(moverX(e.m), moverY(e.m), e.mode === 'scared' ? '#4cc9f0' : '#ff2d2d', arrow);
    }

    fx.draw(ctx);
    ctx.restore();
  }

  /** Pixel triangle pointing down at a character's head (11 x 6, ink outline). */
  private marker(tx: number, ty: number, fill: string, bob: number): void {
    const ctx = this.ctx;
    const cx = Math.round(tx * TILE + TILE / 2);
    const top = Math.round(ty * TILE) - 6 + bob;
    ctx.fillStyle = '#241309';
    for (let r = 0; r < 6; r++) {
      const w = 11 - 2 * r;
      ctx.fillRect(cx - (w >> 1), top + r, w, 1);
    }
    ctx.fillStyle = fill;
    for (let r = 1; r < 5; r++) {
      const w = 9 - 2 * r;
      ctx.fillRect(cx - (w >> 1), top + r, w, 1);
    }
  }

  private drawEnemy(e: Enemy, stage: Stage, anim: number): void {
    const ctx = this.ctx;
    const x = moverX(e.m);
    const y = moverY(e.m);
    const wobble = Math.floor(anim * 6 + e.id) % 2 === 0;
    if (e.mode === 'eaten') {
      this.spr('eyes', x, y);
      return;
    }
    if (e.kind === 'warden') {
      ctx.fillStyle = 'rgba(255,230,120,0.14)';
      ctx.beginPath();
      ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    this.shadow(x, y);
    let name: SpriteName = ENEMY_SPRITE[e.kind];
    if (e.mode === 'scared') {
      const left = e.scaredUntil - stage.time;
      name = left < 2 && Math.floor(anim * 8) % 2 ? 'scaredFlash' : 'scared';
    }
    const bobY = e.mode === 'den' ? (wobble ? -1 : 0) : wobble ? 0 : 1;
    this.spr(name, x, y, bobY, wobble && e.mode !== 'den');
  }

  private drawPaths(stage: Stage): void {
    const ctx = this.ctx;
    for (const e of stage.enemies) {
      if (e.mode !== 'active' || e.target < 0) continue;
      const here = e.m.row * COLS + e.m.col;
      const r = stage.pf.search('astar', here, e.target);
      ctx.fillStyle = ENEMY_COLOR[e.kind];
      for (const t of r.path) ctx.fillRect(xOf(t) * TILE + 6, yOf(t) * TILE + 6, 4, 4);
      ctx.strokeStyle = ENEMY_COLOR[e.kind];
      ctx.strokeRect(xOf(e.target) * TILE + 2.5, yOf(e.target) * TILE + 2.5, TILE - 5, TILE - 5);
    }
  }
}

/** Title-screen strip: the student flees a parade of dishes across the hall floor. Pure decoration. */
export function drawMarquee(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, theme: DayTheme = THEMES[1]!): void {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(hallStrip(theme, w, h), 0, 0);
  const names: SpriteName[] = ['player0', 'blob', 'curry', 'chapati', 'special'];
  const gap = 22;
  const span = w + gap * names.length * 2;
  const base = ((t * 38) % span) - gap * names.length * 2;
  const y = Math.round(h - SPRITE_SIZE - 5);
  names.forEach((n, i) => {
    const frame: SpriteName = n === 'player0' ? (Math.floor(t * 8) % 2 ? 'player1' : 'player0') : n;
    const x = Math.round(base + (names.length - 1 - i) * gap);
    const bob = Math.floor(t * 6 + i) % 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 3, y + 12 + bob * 0, 8, 2);
    ctx.drawImage(sprite(frame), x, y + bob);
  });
}
