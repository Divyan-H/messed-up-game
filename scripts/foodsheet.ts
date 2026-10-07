/** Draws every dish sprite, labelled, into docs/screens/food-sheet.png (`npm run foodsheet`). */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { FOOD_KINDS } from '../src/game/menu';
import { sprite } from '../src/render/art';
import { setCanvasFactory } from '../src/render/canvas';
import { FOOD_VIEW } from '../src/render/foodSprites';

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
const S = 6;
const cellW = 14 * S + 28;
const cellH = 14 * S + 30;
const cols = 8;
const rows = Math.ceil((FOOD_KINDS.length + 1) / cols);
const c = createCanvas(cols * cellW, rows * cellH);
const g = c.getContext('2d');
g.fillStyle = '#14121f';
g.fillRect(0, 0, c.width, c.height);
g.imageSmoothingEnabled = false;
g.font = '11px sans-serif';
g.textAlign = 'center';
const all = [...FOOD_KINDS.map((k) => ({ name: k as string, sprite: FOOD_VIEW[k].sprite })), { name: 'maggi', sprite: 'maggi' as const }];
all.forEach((it, i) => {
  const x = (i % cols) * cellW + 14;
  const y = Math.floor(i / cols) * cellH + 8;
  g.fillStyle = '#262338';
  g.fillRect(x - 6, y - 4, 14 * S + 12, 14 * S + 26);
  g.drawImage(sprite(it.sprite) as unknown as import('@napi-rs/canvas').Image, x, y, 14 * S, 14 * S);
  g.fillStyle = '#f4f4f0';
  g.fillText(it.name, x + 7 * S, y + 14 * S + 14);
});
mkdirSync('docs/screens', { recursive: true });
writeFileSync('docs/screens/food-sheet.png', c.toBuffer('image/png'));
console.log('wrote docs/screens/food-sheet.png');
