/**
 * The mess hall: everything static you see behind the action is painted here, once per level, into one
 * offscreen layer (so the per-frame cost is a single drawImage).
 *
 *   header      back wall: patterned wallpaper, windows, a menu board, brass lamps, wainscot cabinets
 *   floor       vertical wooden boards in three tones, with seams, nails and grain
 *   rug         a red rug under the kitchen where the dishes spawn
 *   furniture   every maze wall is a dining table (cloth runner, plates, bottles) or a round table;
 *               the top wall is a serving counter; the outer walls are wooden wainscot with lamps
 *   light       warm pools of light under each lamp and a soft vignette
 *
 * The maze logic is unchanged: a "wall" is simply a piece of furniture you cannot walk through.
 */
import { COLS, ROWS, TILE, type DayTheme } from '../game/config';
import { sprite } from './art';
import { createSurface, ctx2d, type Surface } from './canvas';
import type { Piece } from '../game/furniture';

export const VIEW_W = COLS * TILE;
export const HEADER_H = 40;
export const VIEW_H = ROWS * TILE + HEADER_H;

const INK = '#241309';

/** Walkable floor is a carpet in a dark, cool colour so every brown piece of furniture pops against it. One per weekday (0 = Sunday). */
export const CARPETS = ['#1d6a60', '#1f6b63', '#2a6a45', '#25645e', '#2f6a58', '#23655f', '#37653f'] as const;

/** All furniture is brown (light enough to stand out from the carpet, dark enough to read as wood). */
export const FURN = {
  top: '#b57d46',
  front: '#6b4223',
  cloth: '#8a5a30',
  frame: '#5a3418',
  cushions: ['#8f5a2c', '#a36c37', '#7d4b25'],
} as const;

// ---------------------------------------------------------------- tiny helpers

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const css = (c: [number, number, number]): string => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/** Blend two #rrggbb colours. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return css([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** Lighten (amount > 0) or darken (amount < 0) a colour. */
export function shade(hex: string, amount: number): string {
  const c = hex.startsWith('#') ? hex : toHex(hex);
  return amount >= 0 ? mix(c, '#ffffff', amount) : mix(c, '#000000', -amount);
}

function toHex(c: string): string {
  const m = /(\d+),(\d+),(\d+)/.exec(c)!;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

/** Deterministic hash to [0,1). */
export function hash(a: number, b: number, c = 0): number {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35) ^ Math.imul(c + 1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

type Ctx = CanvasRenderingContext2D;
const rect = (g: Ctx, x: number, y: number, w: number, h: number, color: string): void => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

// ---------------------------------------------------------------- floor

/** Vertical floorboards, each 8px wide; boards are 3 tiles long and staggered per column. */
export function drawFloor(g: Ctx, theme: DayTheme, x0: number, y0: number, w: number, h: number): void {
  const mid = mix(theme.floorA, theme.floorB, 0.5);
  const tones = [theme.floorA, theme.floorB, mid];
  const cols = Math.ceil(w / 8);
  const rows = Math.ceil(h / TILE);
  for (let c = 0; c < cols; c++) {
    const off = Math.floor(hash(c, 0, 1) * 3);
    for (let r = 0; r < rows; r++) {
      const board = Math.floor((r + off) / 3);
      const tone = tones[Math.floor(hash(c, board, 2) * 3)]!;
      const x = x0 + c * 8;
      const y = y0 + r * TILE;
      rect(g, x, y, 8, TILE, tone);
      rect(g, x, y, 1, TILE, shade(tone, -0.28)); // gap between boards
      if ((r + off) % 3 === 0) {
        rect(g, x, y, 8, 1, shade(tone, -0.3)); // end seam
        rect(g, x + 3, y + 2, 1, 1, shade(tone, -0.4)); // nail
      }
      if (hash(c, r, 3) < 0.4) rect(g, x + 2 + Math.floor(hash(c, r, 4) * 4), y + 3 + Math.floor(hash(c, r, 5) * 9), 1, 2, shade(tone, 0.14)); // grain
      if (hash(c, r, 6) < 0.18) rect(g, x + 4, y + 8 + Math.floor(hash(c, r, 7) * 5), 2, 1, shade(tone, -0.16));
    }
  }
}

/** Wall-to-wall carpet over the whole walkable room: a plain pile with a faint woven grid, so food and characters stay readable. */
function drawCarpet(g: Ctx, base: string): void {
  const x0 = TILE;
  const y0 = TILE;
  const w = (COLS - 2) * TILE;
  const h = (ROWS - 2) * TILE;
  const dark = shade(base, -0.16);
  const light = shade(base, 0.1);
  rect(g, x0, y0, w, h, base);
  for (let ty = 1; ty < ROWS - 1; ty++) {
    for (let tx = 1; tx < COLS - 1; tx++) {
      const px = tx * TILE;
      const py = ty * TILE;
      rect(g, px, py + TILE - 1, TILE, 1, dark);
      rect(g, px + TILE - 1, py, 1, TILE, dark);
      rect(g, px + 7, py + 6, 2, 4, light); // little diamond in the middle of each tile
      rect(g, px + 6, py + 7, 4, 2, light);
      if (hash(tx, ty, 77) < 0.3) rect(g, px + 2 + Math.floor(hash(tx, ty, 78) * 10), py + 2 + Math.floor(hash(tx, ty, 79) * 10), 1, 1, light);
    }
  }
  rect(g, x0, y0, w, 2, shade(base, -0.4)); // shadow under the counter
  rect(g, x0, y0 + h - 2, w, 2, shade(base, -0.3));
  rect(g, x0, y0, 2, h, shade(base, -0.3));
  rect(g, x0 + w - 2, y0, 2, h, shade(base, -0.3));
}

/** A red rug with a gold border and a diamond pattern. Tile units. */
function drawRug(g: Ctx, tx: number, ty: number, tw: number, th: number): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const w = tw * TILE;
  const h = th * TILE;
  rect(g, x, y, w, h, '#4a1418');
  rect(g, x + 1, y + 1, w - 2, h - 2, '#d9a441');
  rect(g, x + 3, y + 3, w - 6, h - 6, '#7e2a2f');
  rect(g, x + 5, y + 5, w - 10, h - 10, '#8f3238');
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      const cx = x + i * TILE + 8;
      const cy = y + j * TILE + 8;
      for (let d = -3; d <= 3; d++) {
        const half = 3 - Math.abs(d);
        rect(g, cx - half, cy + d, half * 2 + 1, 1, (i + j) % 2 ? '#c9893a' : '#b04048');
      }
      rect(g, cx, cy, 1, 1, '#4a1418');
    }
  }
  for (let i = 0; i < th * 4; i++) { // fringe
    rect(g, x - 2, y + 2 + i * 4, 2, 1, '#e9c46a');
    rect(g, x + w, y + 2 + i * 4, 2, 1, '#e9c46a');
  }
}

// ---------------------------------------------------------------- back wall

export interface Light {
  x: number;
  y: number;
  r: number;
}

/** Wallpaper with a diamond pattern, plus a wainscot band of little glass cabinets at the bottom. */
export function drawWall(g: Ctx, theme: DayTheme, w: number, h: number, wainscot: number): void {
  const top = h - wainscot;
  rect(g, 0, 0, w, top, theme.paper);
  for (let cy = 0; cy < top; cy += 8) {
    for (let cx = 0; cx < w; cx += 8) {
      for (let d = -3; d <= 3; d++) {
        const half = 3 - Math.abs(d);
        if (cy + 4 + d >= top) continue;
        rect(g, cx + 4 - half, cy + 4 + d, 1, 1, theme.paper2);
        if (half > 0) rect(g, cx + 4 + half, cy + 4 + d, 1, 1, theme.paper2);
      }
      rect(g, cx + 4, cy + 4, 1, 1, shade(theme.paper2, 0.25));
    }
  }
  rect(g, 0, top - 2, w, 2, '#3b2212'); // picture rail
  rect(g, 0, top - 2, w, 1, '#6e4527');
  rect(g, 0, top, w, wainscot, '#5b341b');
  rect(g, 0, top, w, 1, '#8a5a2e');
  for (let x = 0; x + 16 <= w; x += 16) {
    rect(g, x + 1, top + 2, 14, wainscot - 5, INK);
    const warm = hash(x, 1, 9) < 0.5 ? '#e8a74a' : '#d98f3a';
    rect(g, x + 2, top + 3, 12, wainscot - 7, warm);
    rect(g, x + 2, top + 3, 12, 1, shade(warm, 0.35));
    rect(g, x + 8, top + 3, 1, wainscot - 7, INK); // mullion
    if (hash(x, 2, 9) < 0.45) rect(g, x + 4, top + 5, 2, 2, shade(warm, -0.3)); // something inside
  }
  rect(g, 0, h - 1, w, 1, INK);
}

function drawWindow(g: Ctx, x: number, y: number, w: number, h: number): void {
  rect(g, x, y, w, h, '#3b2212');
  rect(g, x + 2, y + 2, w - 4, h - 4, '#8fc3e6');
  rect(g, x + 2, y + 2, w - 4, 3, '#a9d6f2');
  rect(g, x + 5, y + 6, 8, 2, '#f4f8fb'); // cloud
  rect(g, x + 7, y + 5, 5, 1, '#f4f8fb');
  rect(g, x + Math.floor(w / 2) - 1, y + 2, 2, h - 4, '#3b2212');
  rect(g, x + 2, y + Math.floor(h / 2), w - 4, 1, '#3b2212');
  rect(g, x - 1, y + h, w + 2, 2, '#6e4527'); // sill
}

function drawMenuBoard(g: Ctx, x: number, y: number, w: number, h: number): void {
  rect(g, x, y, w, h, '#6b3f1f');
  rect(g, x, y, w, 1, '#a9703a');
  rect(g, x + 2, y + 2, w - 4, h - 4, '#1f3a2e');
  const chalk = '#e8e6d2';
  for (let i = 0; i < 3; i++) {
    const len = 10 + Math.floor(hash(i, w, 4) * (w - 22));
    rect(g, x + 5, y + 4 + i * 3, len, 1, i === 0 ? '#ffd23f' : chalk);
  }
}

function drawLamp(g: Ctx, cx: number, cy: number): void {
  g.drawImage(sprite('lamp'), Math.round(cx - 7), Math.round(cy - 7));
}

function drawHeader(g: Ctx, theme: DayTheme): Light[] {
  drawWall(g, theme, VIEW_W, HEADER_H, 12);
  drawWindow(g, 10, 5, 40, 19);
  drawWindow(g, VIEW_W - 50, 5, 40, 19);
  drawMenuBoard(g, VIEW_W / 2 - 28, 5, 56, 19);
  const lamps: Light[] = [];
  for (const cx of [84, VIEW_W - 84]) {
    drawLamp(g, cx, 14);
    lamps.push({ x: cx, y: 22, r: 66 });
  }
  return lamps;
}

// ---------------------------------------------------------------- furniture

interface Sides {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

interface Wood {
  top: string;
  front: string;
  cloth: string;
}

const PROPS = ['tPlate', 'tCup', 'tBottleR', 'tBottleG', 'tNapkin', 'tBowl', 'tPlate', 'tCup'] as const;

/** One tile of a long dining table (or the serving counter). Neighbouring tiles join seamlessly. */
function drawTable(g: Ctx, px: number, py: number, f: Sides, wood: Wood, seed: number, tx: number, ty: number, propChance: number): void {
  const { top, front, cloth } = wood;
  // shadow cast to the right and below, onto the open floor
  if (!f.s) rect(g, px, py + TILE, TILE, 3, 'rgba(0,0,0,0.28)');
  if (!f.e) rect(g, px + TILE, py + 3, 2, TILE - 3, 'rgba(0,0,0,0.18)');

  rect(g, px, py, TILE, TILE, top);
  const grain = shade(top, -0.1);
  const horizontal = f.e || f.w;
  if (horizontal) {
    rect(g, px, py + 2, TILE, 1, grain);
    rect(g, px, py + 9, TILE, 1, grain);
  } else {
    rect(g, px + 3, py, 1, TILE, grain);
    rect(g, px + 12, py, 1, TILE, grain);
  }

  // tablecloth runner
  const light = shade(cloth, 0.25);
  const dark = shade(cloth, -0.3);
  const bandBottom = f.s ? TILE : 11;
  if (horizontal) {
    const x0 = f.w ? 0 : 2;
    const x1 = f.e ? TILE : TILE - 2;
    rect(g, px + x0, py + 3, x1 - x0, 6, cloth);
    rect(g, px + x0, py + 3, x1 - x0, 1, light);
    rect(g, px + x0, py + 8, x1 - x0, 1, dark);
    for (let i = (f.w ? 1 : 3); i < x1; i += 4) rect(g, px + i, py + 5, 1, 2, light); // stitching
  }
  if (f.n || f.s || !horizontal) {
    const y0 = f.n ? 0 : 1;
    rect(g, px + 5, py + y0, 6, bandBottom - y0, cloth);
    rect(g, px + 5, py + y0, 1, bandBottom - y0, light);
    rect(g, px + 10, py + y0, 1, bandBottom - y0, dark);
    for (let j = y0 + 1; j < bandBottom - 1; j += 4) rect(g, px + 7, py + j, 2, 1, light);
  }

  const lone = !f.n && !f.e && !f.s && !f.w;
  if (lone) { // a small square table: lace doily in the middle, always something on it
    rect(g, px + 3, py + 2, 10, 7, cloth);
    rect(g, px + 3, py + 2, 10, 1, light);
    rect(g, px + 3, py + 8, 10, 1, dark);
  }

  // clutter on top
  const roll = lone ? 0 : hash(tx, ty, seed);
  if (lone) {
    g.drawImage(sprite(hash(tx, ty, seed + 3) < 0.5 ? 'tPlant' : 'tPlate'), px, py - 2);
  } else if (roll < propChance) {
    const kind = PROPS[Math.floor(hash(tx, ty, seed + 1) * PROPS.length)]!;
    const dx = Math.floor(hash(tx, ty, seed + 2) * 3) - 1;
    g.drawImage(sprite(kind), px + dx, py + (f.s ? 1 : -2));
  } else if (roll > 0.985 && !f.s) {
    g.drawImage(sprite('tPlant'), px, py - 3);
  }

  // edges: dark outline where the table meets open floor, with a bright top rim and a front apron
  if (!f.n) {
    rect(g, px, py, TILE, 1, INK);
    rect(g, px, py + 1, TILE, 1, shade(top, 0.32));
  }
  if (!f.w) rect(g, px, py, 1, TILE, INK);
  if (!f.e) rect(g, px + TILE - 1, py, 1, TILE, INK);
  if (!f.s) {
    rect(g, px, py + 11, TILE, 5, front);
    rect(g, px, py + 11, TILE, 1, shade(front, 0.3));
    rect(g, px, py + 15, TILE, 1, INK);
    rect(g, px + 2, py + 13, 3, 1, shade(front, -0.2));
    rect(g, px + 11, py + 13, 3, 1, shade(front, -0.2));
    if (!f.w) rect(g, px, py + 11, 1, 5, INK);
    if (!f.e) rect(g, px + TILE - 1, py + 11, 1, 5, INK);
  }
}

/** Outer wall: dark wainscot panelling with a lit rail on the side facing the hall. */
function drawPanel(g: Ctx, px: number, py: number, facing: 'e' | 'w' | 's'): void {
  rect(g, px, py, TILE, TILE, '#4a2c18');
  const groove = '#37200f';
  if (facing === 's') {
    rect(g, px, py + 8, TILE, 1, groove);
    rect(g, px, py + 12, TILE, 1, groove);
    rect(g, px, py, TILE, 1, INK);
    rect(g, px, py + 1, TILE, 2, '#7a4d2c');
    return;
  }
  rect(g, px + 4, py, 1, TILE, groove);
  rect(g, px + 8, py, 1, TILE, groove);
  if (facing === 'e') {
    rect(g, px + TILE - 1, py, 1, TILE, INK);
    rect(g, px + TILE - 3, py, 2, TILE, '#7a4d2c');
  } else {
    rect(g, px, py, 1, TILE, INK);
    rect(g, px + 1, py, 2, TILE, '#7a4d2c');
  }
}

// ---------------------------------------------------------------- furniture pieces

/** Ink-outlined box with a bright top edge: the basic building block of chairs, crates and benches. */
function boxed(g: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  rect(g, x, y, w, h, INK);
  rect(g, x + 1, y + 1, w - 2, h - 2, fill);
  rect(g, x + 1, y + 1, w - 2, 1, shade(fill, 0.3));
  rect(g, x + 1, y + h - 2, w - 2, 1, shade(fill, -0.25));
}

/** A chair, stool-with-back or bench. `f` is the way the sitter faces (towards the table). */
function drawSeat(g: Ctx, p: Piece, seed: number): void {
  const px = p.x * TILE;
  const py = p.y * TILE;
  const W = p.w * TILE;
  const H = p.h * TILE;
  const frame = FURN.frame;
  const cushion = FURN.cushions[Math.floor(hash(p.x, p.y, seed + 11) * FURN.cushions.length)]!;
  const bench = p.kind === 'bench';
  const i = bench ? 1 : 2;
  const x = px + i;
  const y = py + i;
  const w = W - 2 * i;
  const h = H - 2 * i - 1;
  rect(g, px + 2, py + H - 2, W - 3, 3, 'rgba(0,0,0,0.26)');
  switch (p.facing ?? 's') {
    case 's': // table is south: we see the sitter's back rest on top
      boxed(g, x, y, w, 5, frame);
      boxed(g, x, y + 4, w, h - 4, cushion);
      break;
    case 'n': // table is north: backrest nearest the viewer
      boxed(g, x, y, w, h - 4, cushion);
      boxed(g, x, y + h - 5, w, 6, frame);
      break;
    case 'e':
      boxed(g, x, y, 5, h + 1, frame);
      boxed(g, x + 4, y + 1, w - 4, h - 1, cushion);
      break;
    case 'w':
      boxed(g, x + w - 5, y, 5, h + 1, frame);
      boxed(g, x, y + 1, w - 4, h - 1, cushion);
      break;
  }
}

function drawStool(g: Ctx, p: Piece, seed: number): void {
  const px = p.x * TILE;
  const py = p.y * TILE;
  const cushion = FURN.cushions[Math.floor(hash(p.x, p.y, seed + 12) * FURN.cushions.length)]!;
  rect(g, px + 3, py + 12, 11, 3, 'rgba(0,0,0,0.26)');
  rect(g, px + 5, py + 10, 2, 4, FURN.frame);
  rect(g, px + 10, py + 10, 2, 4, FURN.frame);
  rect(g, px + 3, py + 3, 10, 8, INK);
  rect(g, px + 2, py + 4, 12, 6, INK);
  rect(g, px + 4, py + 4, 8, 6, cushion);
  rect(g, px + 3, py + 5, 10, 4, cushion);
  rect(g, px + 5, py + 4, 5, 1, shade(cushion, 0.35));
  rect(g, px + 3, py + 9, 10, 1, shade(cushion, -0.3));
}

function drawPlanter(g: Ctx, p: Piece): void {
  const px = p.x * TILE;
  const py = p.y * TILE;
  rect(g, px + 2, py + 13, 13, 3, 'rgba(0,0,0,0.26)');
  g.drawImage(sprite('tPlant'), px + 1, py - 1);
  boxed(g, px + 3, py + 8, 10, 7, '#b0602f');
  rect(g, px + 3, py + 8, 10, 2, INK);
  rect(g, px + 4, py + 9, 8, 1, '#6e3a1a');
}

function drawCrate(g: Ctx, p: Piece, seed: number): void {
  const px = p.x * TILE;
  const py = p.y * TILE;
  rect(g, px + 2, py + 13, 13, 3, 'rgba(0,0,0,0.26)');
  if (hash(p.x, p.y, seed + 13) < 0.5) {
    boxed(g, px + 2, py + 3, 12, 11, '#b8884a'); // wooden crate
    rect(g, px + 3, py + 7, 10, 1, '#6e4527');
    rect(g, px + 3, py + 11, 10, 1, '#6e4527');
    rect(g, px + 5, py + 4, 1, 9, '#6e4527');
    rect(g, px + 10, py + 4, 1, 9, '#6e4527');
  } else {
    boxed(g, px + 3, py + 4, 10, 10, '#e2d3a6'); // sack of rice
    rect(g, px + 5, py + 2, 6, 3, INK);
    rect(g, px + 6, py + 3, 4, 2, '#cdbb8a');
    rect(g, px + 5, py + 8, 6, 3, '#b5453a');
    rect(g, px + 6, py + 9, 4, 1, '#f2e2c0');
  }
}

/** Dining table or buffet counter of any size; drawn as one piece so it reads as one object. */
function drawTablePiece(g: Ctx, p: Piece, seed: number): void {
  const counter = p.kind === 'counter';
  const px = p.x * TILE;
  const py = p.y * TILE;
  const W = p.w * TILE;
  const H = p.h * TILE;
  const topH = H - 5;
  const tone = (hash(p.set, 1, seed) - 0.5) * 0.1;
  const top = counter ? shade(FURN.top, -0.14) : shade(FURN.top, tone);
  const front = counter ? shade(FURN.front, -0.12) : shade(FURN.front, tone);
  const cloth = hash(p.set, 2, seed) < 0.7 && !counter;
  const clothCol = shade(FURN.cloth, (hash(p.set, 3, seed) - 0.5) * 0.14);

  rect(g, px + 1, py + H, W, 3, 'rgba(0,0,0,0.28)');
  rect(g, px + W, py + 3, 2, H - 3, 'rgba(0,0,0,0.18)');
  rect(g, px, py, W, H, INK);
  rect(g, px + 1, py + 1, W - 2, topH - 1, top);
  rect(g, px + 1, py + 1, W - 2, 1, shade(top, 0.32));
  for (let gy = py + 4; gy < py + topH - 1; gy += 5) rect(g, px + 2 + ((gy * 7) % 5), gy, Math.max(3, W - 8), 1, shade(top, -0.1)); // grain

  if (cloth) {
    const cx = px + 2;
    const cy = py + 2;
    const cw = W - 4;
    const ch = topH - 2;
    const light = shade(clothCol, 0.14);
    rect(g, cx, cy, cw, ch, clothCol);
    for (let j = 0; j < ch; j += 2) for (let i = 0; i < cw; i += 2) if (((i + j) >> 1) % 2 === 0) rect(g, cx + i, cy + j, Math.min(2, cw - i), Math.min(2, ch - j), light); // gingham
    rect(g, cx, cy + ch - 1, cw, 1, shade(clothCol, -0.3));
    // hanging drape with scalloped hem
    rect(g, cx, py + topH, cw, 5, shade(clothCol, -0.18));
    rect(g, cx, py + topH, cw, 1, shade(clothCol, -0.4));
    for (let i = 1; i < cw - 1; i += 4) rect(g, cx + i, py + topH + 4, 3, 1, shade(clothCol, -0.18));
    for (let i = 0; i < cw; i += 4) rect(g, cx + i, py + topH + 1, 1, 3, shade(clothCol, -0.34));
    rect(g, px + 1, py + topH, 1, 5, INK);
    rect(g, px + W - 2, py + topH, 1, 5, INK);
    rect(g, px + 2, py + H - 1, W - 4, 1, INK);
  } else {
    rect(g, px + 1, py + topH, W - 2, 4, front);
    rect(g, px + 1, py + topH, W - 2, 1, shade(front, 0.3));
    for (let i = 3; i < W - 4; i += 12) rect(g, px + i, py + topH + 2, 4, 1, shade(front, -0.2));
    if (counter) {
      rect(g, px + 2, py + 3, W - 4, 2, '#cfd8dc'); // steel rail
      rect(g, px + 2, py + 4, W - 4, 1, '#8a97a0');
    }
  }

  // things on the table: one item per tile, more on bare wood
  for (let ty = 0; ty < p.h; ty++) {
    for (let tx = 0; tx < p.w; tx++) {
      const gx = p.x + tx;
      const gy = p.y + ty;
      const roll = hash(gx, gy, seed + 5);
      if (roll > (counter ? 0.9 : 0.62)) continue;
      const kind = PROPS[Math.floor(hash(gx, gy, seed + 6) * PROPS.length)]!;
      const dy = ty === p.h - 1 ? 0 : 1;
      const dx = Math.floor(hash(gx, gy, seed + 7) * 3);
      g.drawImage(sprite(kind), px + tx * TILE + dx, py + ty * TILE + dy - 1 + (counter ? 1 : 0));
    }
  }
  if (p.w * p.h === 1) g.drawImage(sprite(hash(p.x, p.y, seed + 8) < 0.5 ? 'tPlant' : 'tPlate'), px + 1, py - 1);
  if (p.w * p.h >= 4 && !counter && hash(p.set, 9, seed) < 0.6) g.drawImage(sprite('tPlant'), px + Math.floor(W / 2) - 7, py + Math.floor(topH / 2) - 5);
}

/** A round table with a lace cloth. Always has chairs around it, so it never reads as a creature. */
function drawRoundTable(g: Ctx, p: Piece, seed: number): void {
  const px = p.x * TILE;
  const py = p.y * TILE;
  const W = p.w * TILE;
  const H = p.h * TILE;
  const topH = H - 5;
  const circ = [8, 5, 3, 2, 1, 1];
  const inset = (y: number, grow = 0) => (y < 6 ? circ[y]! : y >= topH - 6 ? circ[topH - 1 - y]! : 0) + grow;
  const top = shade(FURN.top, (hash(p.set, 1, seed) - 0.5) * 0.1);
  const clothCol = shade(FURN.cloth, (hash(p.set, 3, seed) - 0.5) * 0.14);
  rect(g, px + 6, py + H - 1, W - 12, 3, 'rgba(0,0,0,0.28)');
  for (let y = 0; y < topH; y++) rect(g, px + inset(y), py + y, W - 2 * inset(y), 1, INK);
  for (let y = 1; y < topH - 1; y++) rect(g, px + inset(y) + 1, py + y, W - 2 * inset(y) - 2, 1, top);
  rect(g, px + 8, py + 1, W - 16, 1, shade(top, 0.32));
  for (let y = 3; y < topH - 3; y++) {
    const m = inset(y) + 3;
    rect(g, px + m, py + y, W - 2 * m, 1, clothCol);
    if (y % 2 === 0) for (let x = m + (y % 4 === 0 ? 0 : 1); x < W - m; x += 2) rect(g, px + x, py + y, 1, 1, shade(clothCol, 0.14));
  }
  // base and apron
  rect(g, px + 9, py + topH - 1, W - 18, 5, INK);
  rect(g, px + 10, py + topH, W - 20, 3, FURN.front);
  g.drawImage(sprite(hash(p.set, 4, seed) < 0.5 ? 'tPlant' : 'tBowl'), px + Math.floor(W / 2) - 7, py + Math.floor(topH / 2) - 6);
  g.drawImage(sprite('tCup'), px + 5, py + 7);
  g.drawImage(sprite('tPlate'), px + W - 14, py + 9);
}

/** Static scenery for one level. `seed` varies the clutter, so every hall has its own place settings. */
export function buildHallLayer(walls: Uint8Array, theme: DayTheme, seed: number, pieces: readonly Piece[]): Surface {
  const layer = createSurface(VIEW_W, VIEW_H);
  const g = ctx2d(layer);
  const lights = drawHeader(g, theme);
  void walls;

  g.save();
  g.translate(0, HEADER_H);
  drawFloor(g, theme, 0, 0, VIEW_W, ROWS * TILE);
  drawCarpet(g, CARPETS[theme.weekday] ?? CARPETS[1]);
  drawRug(g, 6, 7, 7, 5);

  const counter: Wood = { top: shade(FURN.top, -0.14), front: shade(FURN.front, -0.1), cloth: shade(FURN.cloth, -0.1) };
  const s = (seed >>> 0) % 9973;

  // border: side and bottom panelling, serving counter along the top
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE;
      const py = y * TILE;
      if (x === 0 || x === COLS - 1) drawPanel(g, px, py, x === 0 ? 'e' : 'w');
      else if (y === ROWS - 1) drawPanel(g, px, py, 's');
      else if (y === 0) drawTable(g, px, py, { n: true, e: true, s: false, w: true }, counter, s, x, y, 0.7);
    }
  }

  // furniture, back to front so lower pieces overlap the ones behind them
  const ordered = [...pieces].sort((a, b) => a.y + a.h - (b.y + b.h) || a.x - b.x);
  for (const p of ordered) {
    switch (p.kind) {
      case 'table':
      case 'counter': drawTablePiece(g, p, s); break;
      case 'round': drawRoundTable(g, p, s); break;
      case 'chair':
      case 'bench': drawSeat(g, p, s); break;
      case 'stool': drawStool(g, p, s); break;
      case 'planter': drawPlanter(g, p); break;
      case 'crate': drawCrate(g, p, s); break;
    }
  }

  // wall sconces on the side walls
  for (const row of [4, 10, 16]) {
    for (const x of [0, COLS - 1]) {
      const cx = x * TILE + 8;
      const cy = row * TILE + 8;
      g.drawImage(sprite('lamp'), cx - 7, cy - 7);
      lights.push({ x: cx, y: cy + HEADER_H, r: 46 });
    }
  }
  g.restore();

  // lighting: warm pools under each lamp, then a vignette to push the eye to the middle
  for (const l of lights) {
    const grad = g.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r);
    grad.addColorStop(0, 'rgba(255,205,120,0.30)');
    grad.addColorStop(1, 'rgba(255,205,120,0)');
    g.fillStyle = grad;
    g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  const vg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2 + 8, 96, VIEW_W / 2, VIEW_H / 2 + 8, 250);
  vg.addColorStop(0, 'rgba(14,6,0,0)');
  vg.addColorStop(1, 'rgba(14,6,0,0.46)');
  g.fillStyle = vg;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  return layer;
}

// ---------------------------------------------------------------- title strip

const stripCache = new Map<string, Surface>();

/** A small slice of the hall (wallpaper, lamp, floorboards) used behind the title-screen parade. */
export function hallStrip(theme: DayTheme, w: number, h: number): Surface {
  const key = `${theme.weekday}|${w}x${h}`;
  let s = stripCache.get(key);
  if (s) return s;
  s = createSurface(w, h);
  const g = ctx2d(s);
  const wallH = 18;
  drawWall(g, theme, w, wallH, 8);
  drawFloor(g, theme, 0, wallH, w, h - wallH);
  rect(g, 0, wallH, w, 3, 'rgba(0,0,0,0.3)');
  for (const cx of [w * 0.25, w * 0.75]) {
    drawLamp(g, cx, 7);
    const grad = g.createRadialGradient(cx, 14, 1, cx, 14, 40);
    grad.addColorStop(0, 'rgba(255,205,120,0.32)');
    grad.addColorStop(1, 'rgba(255,205,120,0)');
    g.fillStyle = grad;
    g.fillRect(cx - 40, 0, 80, h);
  }
  stripCache.set(key, s);
  return s;
}
