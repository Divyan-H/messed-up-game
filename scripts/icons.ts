/**
 * Draws the app icons from the game's own pixel art into public/icons (`npm run icons`):
 * standard (192, 512), maskable (512, art inside the safe zone), Apple touch (180) and a monochrome
 * notification badge (72).
 */
import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sprite, SPRITE_SIZE, type SpriteName } from '../src/render/art';
import { setCanvasFactory } from '../src/render/canvas';

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);

const BG = '#150b06';
const WOOD_HI = '#d19a5a';
const WOOD = '#7a4a24';
const WOOD_LO = '#3b2212';
const CHALK = '#1f2e28';
const ACCENT = '#ffc857';

const art = (name: SpriteName) => sprite(name) as unknown as Image;

/**
 * `maskable` icons are cropped by the launcher (circle, squircle...), so they fill edge to edge with the
 * art kept inside the central safe zone instead of drawing a frame whose corners would be cut off.
 */
function drawIcon(size: number, maskable = false): Buffer {
  const c = createCanvas(size, size);
  const g = c.getContext('2d') as SKRSContext2D;
  g.imageSmoothingEnabled = false;
  g.fillStyle = BG;
  g.fillRect(0, 0, size, size);
  const px = Math.max(1, Math.floor(size / 40)); // one "pixel" of frame
  if (maskable) {
    g.fillStyle = CHALK;
    g.fillRect(0, 0, size, size);
  } else {
    // wooden frame with a chalkboard inside, like the game's cards
    g.fillStyle = WOOD_LO;
    g.fillRect(0, 0, size, size);
    g.fillStyle = WOOD;
    g.fillRect(px, px, size - 2 * px, size - 2 * px);
    g.fillStyle = WOOD_HI;
    g.fillRect(px, px, size - 2 * px, px);
    g.fillRect(px, px, px, size - 2 * px);
  }
  const board = maskable ? Math.round(size * 0.18) : 4 * px;
  const boardSize = size - 2 * board;
  if (!maskable) {
    g.fillStyle = CHALK;
    g.fillRect(board, board, boardSize, boardSize);
  }
  // the student, big, with a chasing dish behind
  const scale = Math.floor((boardSize * 0.62) / SPRITE_SIZE);
  const s = SPRITE_SIZE * scale;
  const x = board + Math.round((boardSize - s) / 2) + Math.round(s * 0.12);
  const y = board + Math.round((boardSize - s) / 2) + Math.round(s * 0.06);
  const small = Math.max(1, Math.floor(scale * 0.55));
  g.drawImage(art('blob'), board + Math.round(boardSize * 0.06), board + Math.round(boardSize * 0.58), SPRITE_SIZE * small, SPRITE_SIZE * small);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x + Math.round(s * 0.18), y + s - scale, Math.round(s * 0.64), scale * 2);
  g.drawImage(art('player0'), x, y, s, s);
  // accent bar at the top, like the title screen badge
  g.fillStyle = ACCENT;
  g.fillRect(board + Math.round(boardSize * 0.2), board + Math.round(boardSize * 0.08), Math.round(boardSize * 0.6), Math.max(2, px * 2));
  return c.toBuffer('image/png');
}

/** Android draws notification badges as a white silhouette, so this is alpha only. */
function drawBadge(size: number): Buffer {
  const c = createCanvas(size, size);
  const g = c.getContext('2d') as SKRSContext2D;
  g.imageSmoothingEnabled = false;
  const scale = Math.floor((size * 0.85) / SPRITE_SIZE);
  const s = SPRITE_SIZE * scale;
  g.drawImage(art('player0'), Math.round((size - s) / 2), Math.round((size - s) / 2), s, s);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  return c.toBuffer('image/png');
}

mkdirSync('public/icons', { recursive: true });
const out: Array<[string, Buffer]> = [
  ['icon-192.png', drawIcon(192)],
  ['icon-512.png', drawIcon(512)],
  ['maskable-512.png', drawIcon(512, true)],
  ['apple-touch-icon.png', drawIcon(180)],
  ['badge-72.png', drawBadge(72)],
];
for (const [name, buf] of out) writeFileSync(`public/icons/${name}`, buf);
console.log(`wrote ${out.map(([n]) => n).join(', ')} to public/icons`);
