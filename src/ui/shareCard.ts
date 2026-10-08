/**
 * The shareable score card: a 1080x1080 PNG (square works for WhatsApp, Instagram and stories) drawn
 * with the game's own sprites and pixel font. Runs in the browser and, for README screenshots, in node.
 */
import { COURSES, THEMES, WEEKDAY_NAMES } from '../game/config';
import { MENUS, mealItems, uniqueItems } from '../game/menu';
import { sprite, SPRITE_SIZE, type SpriteName } from '../render/art';
import { createSurface, type Surface } from '../render/canvas';
import { FOOD_VIEW } from '../render/foodSprites';

export interface ShareInfo {
  mode: 'daily' | 'practice';
  weekday: number;
  /** e.g. "8 OCT" for a Daily Run. */
  dateLabel: string;
  score: number;
  /** Difficulty label when not Normal, e.g. "HARD x1.2". */
  levelLabel: string | null;
  /** Courses cleared, in order; a course not reached is false. */
  cleared: boolean[];
  dishes: number;
  streak: number;
  rank: number | null;
  site: string;
}

const W = 1080;
const FONT = '"Press Start 2P", monospace';
const BG = '#150b06';
const WOOD = '#7a4a24';
const WOOD_HI = '#d19a5a';
const WOOD_LO = '#3b2212';
const CHALK = '#1f2e28';
const TEXT = '#f3e8cf';
const DIM = '#bfae8c';
const RED = '#e4572e';
const GREEN = '#9ccc4a';

const fmt = (n: number) => n.toLocaleString('en-IN');

export function drawShareCard(info: ShareInfo): Surface {
  const theme = THEMES[info.weekday]!;
  const c = createSurface(W, W);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', shadow?: string) => {
    g.font = `${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    if (shadow) {
      g.fillStyle = shadow;
      g.fillText(s, x + size / 8, y + size / 8);
    }
    g.fillStyle = color;
    g.fillText(s, x, y);
  };
  const art = (name: SpriteName, x: number, y: number, scale: number) =>
    g.drawImage(sprite(name) as CanvasImageSource, x, y, SPRITE_SIZE * scale, SPRITE_SIZE * scale);

  // frame: page background, wooden border, chalkboard
  g.fillStyle = BG;
  g.fillRect(0, 0, W, W);
  g.fillStyle = WOOD_LO;
  g.fillRect(36, 36, W - 72, W - 72);
  g.fillStyle = WOOD;
  g.fillRect(44, 44, W - 88, W - 88);
  g.fillStyle = WOOD_HI;
  g.fillRect(44, 44, W - 88, 8);
  g.fillRect(44, 44, 8, W - 88);
  g.fillStyle = CHALK;
  g.fillRect(76, 76, W - 152, W - 152);

  // header
  const badge = info.mode === 'daily' ? `DAILY RUN - ${theme.name.toUpperCase()} ${info.dateLabel}` : `PRACTICE - ${WEEKDAY_NAMES[info.weekday]!.toUpperCase()}`;
  g.font = `22px ${FONT}`;
  const bw = g.measureText(badge).width + 40;
  g.fillStyle = theme.accent;
  g.fillRect((W - bw) / 2, 112, bw, 46);
  text(badge, W / 2, 146, 22, '#2b1810');
  text('MESSED UP', W / 2, 262, 84, theme.accent, 'center', RED);
  text(`"${theme.title}"`, W / 2, 316, 22, DIM);

  // score
  text(fmt(info.score), W / 2, 470, info.score >= 100_000 ? 96 : 120, TEXT, 'center', '#000000');
  text(info.levelLabel ? `POINTS (${info.levelLabel})` : 'POINTS', W / 2, 526, 24, DIM);

  // the three courses, each shown by its main dish, with a tick or a cross
  const menu = MENUS[info.weekday]!;
  const tileW = 248;
  const gap = 32;
  const left = (W - (tileW * 3 + gap * 2)) / 2;
  for (let i = 0; i < 3; i++) {
    const x = left + i * (tileW + gap);
    const y = 572;
    const ok = info.cleared[i] === true;
    g.fillStyle = ok ? 'rgba(156,204,74,0.16)' : 'rgba(0,0,0,0.28)';
    g.fillRect(x, y, tileW, 232);
    g.fillStyle = ok ? GREEN : WOOD_LO;
    g.fillRect(x, y, tileW, 6);
    const dish = uniqueItems(mealItems(menu, i))[0]!;
    g.globalAlpha = ok ? 1 : 0.35;
    art(FOOD_VIEW[dish.kind].sprite, x + (tileW - SPRITE_SIZE * 8) / 2, y + 28, 8);
    g.globalAlpha = 1;
    text(COURSES[i]!.toUpperCase(), x + tileW / 2, y + 180, 20, ok ? TEXT : DIM);
    text(ok ? 'CLEARED' : 'MISSED', x + tileW / 2, y + 214, 16, ok ? GREEN : RED);
  }

  // streak and rank
  const statsY = 896;
  if (info.mode === 'daily') {
    art('flame', 128, statsY - 70, 6);
    text(String(info.streak), 230, statsY - 18, 48, theme.accent, 'left');
    text('DAY STREAK', 230, statsY + 22, 18, DIM, 'left');
    text(info.rank ? `#${info.rank}` : '-', W - 128, statsY - 18, 48, theme.accent, 'right');
    text('RANK TODAY', W - 128, statsY + 22, 18, DIM, 'right');
  } else {
    text(`${info.dishes} DISHES EATEN`, W / 2, statsY, 26, DIM);
  }

  // footer: the student fleeing a parade of dishes, and where to play
  const parade: SpriteName[] = ['player0', 'blob', 'curry', 'chapati', 'special'];
  parade.forEach((n, i) => art(n, 128 + i * 64, 936, 3));
  text(info.site, W - 128, 980, 20, TEXT, 'right');
  return c;
}

/** "8 OCT" from a YYYY-MM-DD key. */
export function shortDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toUTCString().slice(5, 11).toUpperCase().replace(/^0/, '');
}
