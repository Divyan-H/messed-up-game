/**
 * All pixel art lives here as text, so the whole game ships with zero image files.
 * Each character maps to a colour in PALETTE; '.' is transparent. An ink outline is added automatically.
 */
import { createSurface, ctx2d, type Surface } from './canvas';
import { DECOR_SPRITES } from './decorArt';
import { FOOD_SPRITES } from './foodArt';

export const INK = '#1a1c2c';

export const PALETTE: Record<string, string> = {
  w: '#f4f4f0', // white
  r: '#e63946', // red
  o: '#f4a261', // orange
  y: '#ffd23f', // yellow
  b: '#3a86ff', // blue
  c: '#4cc9f0', // cyan
  n: '#8d5524', // brown
  t: '#d9a066', // tan
  p: '#ff7eb6', // pink
  l: '#70e000', // lime
  d: '#7b4fc9', // purple
  s: '#9aa0a6', // silver
  e: '#2a9d8f', // teal
  m: '#5c3d2e', // dark brown
  g: '#52b788', // green
  v: '#2d6a4f', // dark green
  h: '#fff1a8', // pale yellow (highlight)
  a: '#e09f3e', // amber
  u: '#9e2a2b', // dark red
  q: '#f1e3c0', // cream
  i: '#ffc8dd', // light pink
  z: '#6b6f7a', // dark grey
  x: '#b7e4c7', // pale green
  j: '#f9c74f', // gold
  k: INK,
};

export interface SpriteDef {
  rows: string[];
  swap?: Record<string, string>;
}

export const SPRITE_SIZE = 14; // 12px art + 1px outline each side

const PLAYER_A = [
  '....kkkk....',
  '...kkkkkk...',
  '..kkwwwwkk..',
  '..kwkwwkwk..',
  '..kwwwwwwk..',
  '..kwwrrwwk..',
  '...kwwwwk...',
  '..bbbbbbbb..',
  '.bbbbbbbbbb.',
  '.wbbbbbbbbw.',
  '..bb....bb..',
  '..kk....kk..',
];
const PLAYER_B = [...PLAYER_A.slice(0, 5), '..kwwkkwwk..', ...PLAYER_A.slice(6, 10), '...bb..bb...', '...kk..kk...'];

export const SPRITES: Record<string, SpriteDef> = {
  player0: { rows: PLAYER_A },
  player1: { rows: PLAYER_B },
  blob: {
    rows: [
      '....oooo....', '..oooooooo..', '.oooooooooo.', '.owwoooowwo.', '.owkoooowko.', '.oooooooooo.',
      '.oookkkkooo.', '.oooooooooo.', '.nooooooooon', '..oo.oo.oo..', '..o..oo..o..', '............',
    ],
  },
  curry: {
    rows: [
      '...s...s....', '....s..s....', '..kkkkkkkk..', '.krrrrrrrrk.', 'krrwwrrwwrrk', 'krrwkrrwkrrk',
      'krrrrrrrrrrk', 'krrrkkkkrrrk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...', '..kk....kk..',
    ],
  },
  chapati: {
    rows: [
      '...tttttt...', '.tttttttttt.', 'tttttttttttt', 'ttwwttttwwtt', 'ttwkttttwktt', 'tttttttttttt',
      'tyttttttttyt', 'tttttkkttttt', 'tttttttttttt', '.tttttttttt.', '..tttttttt..', '...tttttt...',
    ],
  },
  special: {
    rows: [
      'd..d.dd.d..d', 'dd.dddddd.dd', 'dkkddddddkkd', 'ddwwwddwwwdd', 'ddwkwddwkwdd', 'dddddddddddd',
      'ddddyyyydddd', 'dddykykykddd', '.dddddddddd.', '..dddddddd..', '..dd.dd.dd..', '..d..dd..d..',
    ],
  },
  warden: {
    rows: [
      '...eeeeee...', '..eeeeeeee..', 'eeeeeeeeeeee', '.tttttttttt.', '.ttkttttktt.', '.tttttttttt.',
      '.tkkkkkkkkt.', '.tttttttttt.', '..eeeeeeee..', 'eeeeyyyyeeee', 'eeeeeeeeeeee', '..ee....ee..',
    ],
  },
  scared: {
    rows: [
      '....bbbb....', '..bbbbbbbb..', '.bbbbbbbbbb.', '.bbwwbbwwbb.', '.bbwwbbwwbb.', '.bbbbbbbbbb.',
      '.bwbwbwbwbb.', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '..bb.bb.bb..', '..b..bb..b..', '............',
    ],
  },
  scaredFlash: {
    rows: [
      '....wwww....', '..wwwwwwww..', '.wwwwwwwwww.', '.wwrrwwrrww.', '.wwrrwwrrww.', '.wwwwwwwwww.',
      '.wrwrwrwrww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '..ww.ww.ww..', '..w..ww..w..', '............',
    ],
  },
  eyes: { rows: ['wk.wk', 'ww.ww'] },
  ...FOOD_SPRITES,
  ...DECOR_SPRITES,
  doorClosed: {
    rows: ['.aaaaaaaaaa.', 'ajjjjjjjjjja', 'ajhhjjjjhhja', 'ajhhjjjjhhja', 'ajjjjjjjjjja', 'ajjjjjjjwwja', 'ajhhjjjjwwja', 'ajhhjjjjhhja', 'ajhhjjjjhhja', 'aaaaaaaaaaaa'],
  },
  doorOpen: {
    rows: ['.aaaaaaaaaa.', 'ahhhhhhhhhha', 'ahhhhwwhhhha', 'ahhhwwwwhhha', 'ahhwwwwwwhha', 'ahhwwwwwwhha', 'ahhhwwwwhhha', 'ahhhhwwhhhha', 'ahhhhhhhhhha', 'aaaaaaaaaaaa'],
  },
  heart: { rows: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'] },
  flame: {
    rows: ['...r...', '..rro..', '..rroo.', '.rrooo.', '.rooyo.', 'rrooyyo', 'rooyyyo', '.ooyyo.'],
  },
};

/** Builds a canvas for a sprite: trims, centres in 14x14, adds an ink outline. */
export function buildSprite(def: SpriteDef): Surface {
  const rows = def.rows;
  const h = rows.length;
  const w = rows[0]!.length;
  const color = (ch: string): string | null => {
    if (ch === '.') return null;
    const key = def.swap?.[ch] ?? ch;
    return PALETTE[key] ?? null;
  };
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (color(rows[y]![x]!)) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const size = SPRITE_SIZE;
  const ox = Math.floor((size - bw) / 2) - minX;
  const oy = Math.floor((size - bh) / 2) - minY;

  const filled = new Uint8Array(size * size);
  const c = createSurface(size, size);
  const g = ctx2d(c);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = color(rows[y]![x]!);
      if (!col) continue;
      const px = x + ox;
      const py = y + oy;
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      filled[py * size + px] = 1;
    }
  }
  g.fillStyle = INK;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (filled[y * size + x]) continue;
      const near =
        (x > 0 && filled[y * size + x - 1]) || (x < size - 1 && filled[y * size + x + 1]) ||
        (y > 0 && filled[(y - 1) * size + x]) || (y < size - 1 && filled[(y + 1) * size + x]);
      if (near) g.fillRect(x, y, 1, 1);
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const col = color(rows[y]![x]!);
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x + ox, y + oy, 1, 1);
    }
  return c;
}

export type SpriteName = keyof typeof SPRITES;
const cache = new Map<string, Surface>();

export function sprite(name: SpriteName): Surface {
  let s = cache.get(name);
  if (!s) {
    s = buildSprite(SPRITES[name]!);
    cache.set(name, s);
  }
  return s;
}

/** Enemy sprite name by kind. */
export const ENEMY_SPRITE = { blob: 'blob', curry: 'curry', chapati: 'chapati', special: 'special', warden: 'warden' } as const;

/** Enemy tint used for debug paths and the roster legend. */
export const ENEMY_COLOR = { blob: '#f4a261', curry: '#e63946', chapati: '#d9a066', special: '#b48cff', warden: '#2a9d8f' } as const;
