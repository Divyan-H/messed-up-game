/** Renders reference PNGs with the real renderer under node (`npm run snapshot`). Output: ./snapshots */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Bot } from '../src/game/bot';
import { Run } from '../src/game/run';
import { THEMES } from '../src/game/config';
import { setCanvasFactory } from '../src/render/canvas';
import { SPRITES, sprite, type SpriteName } from '../src/render/art';
import { Effects } from '../src/render/effects';
import { Renderer, VIEW_H, VIEW_W } from '../src/render/renderer';

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
mkdirSync('snapshots', { recursive: true });

function frame(weekday: number, ticks: number, showPaths: boolean): Buffer {
  const run = new Run({ mode: 'practice', seed: 4242 + weekday, weekday, dateKey: 't', adaptive: 1 });
  const bot = new Bot();
  for (let i = 0; i < ticks; i++) run.tick(run.phase === 'playing' ? bot.decide(run.stage) : 0);
  const c = createCanvas(VIEW_W, VIEW_H);
  const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
  const r = new Renderer(ctx);
  r.prepare(run.stage, THEMES[weekday]!);
  r.draw(run.stage, new Effects(), { anim: ticks / 60, showPaths });
  const out = createCanvas(VIEW_W * 3, VIEW_H * 3);
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.drawImage(c, 0, 0, VIEW_W * 3, VIEW_H * 3);
  return out.toBuffer('image/png');
}

writeFileSync('snapshots/game-wed.png', frame(3, 900, true));
writeFileSync('snapshots/game-mon.png', frame(1, 500, false));
writeFileSync('snapshots/game-sun.png', frame(0, 700, false));

const names = Object.keys(SPRITES) as SpriteName[];
const cols = 8;
const sheet = createCanvas(cols * 14 * 6, Math.ceil(names.length / cols) * 14 * 6);
const sg = sheet.getContext('2d');
sg.fillStyle = '#2a2040';
sg.fillRect(0, 0, sheet.width, sheet.height);
sg.imageSmoothingEnabled = false;
names.forEach((n, i) => sg.drawImage(sprite(n) as never, (i % cols) * 84, Math.floor(i / cols) * 84, 84, 84));
writeFileSync('snapshots/sprites.png', sheet.toBuffer('image/png'));
console.log('wrote snapshots/*.png');
