import { describe, expect, it } from 'vitest';
import { LEVELS, LEVEL_IDS, stageDifficulty } from '../src/game/difficulty';
import { QUIPS_BY_FOOD } from '../src/game/content';
import { FOOD_KINDS, MENUS, mealItems, uniqueItems } from '../src/game/menu';
import { replayRun, Run } from '../src/game/run';
import { ENEMY_SPRITE, PALETTE, SPRITES, SPRITE_SIZE } from '../src/render/art';
import { FOOD_SPRITES } from '../src/render/foodArt';
import { FOOD_VIEW } from '../src/render/foodSprites';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/services/profile';
import { computeLayout, fitScale } from '../src/ui/layout';

describe('food art', () => {
  it('every dish on every menu has a sprite, a crumb colour and jokes', () => {
    for (const menu of MENUS) {
      for (const item of [...menu.breakfast, ...menu.lunch, ...menu.dinner, menu.snack]) {
        expect(FOOD_VIEW[item.kind], item.name).toBeDefined();
        expect(SPRITES[FOOD_VIEW[item.kind].sprite], item.name).toBeDefined();
        expect(QUIPS_BY_FOOD[item.kind].length, item.name).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(FOOD_VIEW).sort()).toEqual([...FOOD_KINDS].sort());
  });

  it('sprites fit in 12x12 and only use palette colours', () => {
    const maxArt = SPRITE_SIZE - 2;
    for (const [name, def] of Object.entries(FOOD_SPRITES)) {
      expect(def.rows.length, name).toBeLessThanOrEqual(maxArt);
      for (const row of def.rows) {
        expect(row.length, `${name} row width`).toBeLessThanOrEqual(maxArt);
        for (const ch of row) {
          if (ch === '.') continue;
          const key = def.swap?.[ch] ?? ch;
          expect(PALETTE[key], `${name}: '${ch}' -> '${key}'`).toBeDefined();
        }
      }
    }
  });

  it('food sprites never overwrite the enemy, player or UI sprites', () => {
    const reserved = [...Object.values(ENEMY_SPRITE), 'player0', 'player1', 'scared', 'scaredFlash', 'eyes', 'doorClosed', 'doorOpen', 'heart', 'flame'];
    for (const name of reserved) expect(Object.keys(FOOD_SPRITES), name).not.toContain(name);
  });

  it('a course never lists the same dish twice in the preview', () => {
    for (const menu of MENUS) for (let c = 0; c < 3; c++) {
      const items = mealItems(menu, c);
      expect(uniqueItems(items).length).toBe(new Set(items.map((i) => i.name)).size);
    }
  });
});

describe('difficulty levels', () => {
  it('enemies get faster and releases quicker from easy to hard', () => {
    for (const wd of [1, 3, 0]) for (const c of [0, 2]) {
      const [e, n, h] = LEVEL_IDS.map((l) => stageDifficulty(wd, c, 1, l));
      expect(e!.enemySpeedRatio).toBeLessThan(n!.enemySpeedRatio);
      expect(n!.enemySpeedRatio).toBeLessThan(h!.enemySpeedRatio);
      expect(e!.releaseInterval).toBeGreaterThan(n!.releaseInterval);
      expect(n!.releaseInterval).toBeGreaterThan(h!.releaseInterval);
      expect(e!.hungerSeconds).toBeGreaterThan(h!.hungerSeconds);
      expect(h!.enemySpeedRatio).toBeLessThanOrEqual(LEVELS.hard.cap);
    }
  });

  it('normal is exactly the old default (daily ranks keep their meaning)', () => {
    expect(stageDifficulty(2, 1)).toEqual(stageDifficulty(2, 1, 1, 'normal'));
  });

  it('hard never has a smaller roster than normal, easy never a bigger one', () => {
    for (let wd = 0; wd < 7; wd++) for (let c = 0; c < 3; c++) {
      expect(stageDifficulty(wd, c, 1, 'hard').roster.length).toBeGreaterThanOrEqual(stageDifficulty(wd, c, 1, 'normal').roster.length);
      expect(stageDifficulty(wd, c, 1, 'easy').roster.length).toBeLessThanOrEqual(stageDifficulty(wd, c, 1, 'normal').roster.length);
    }
  });

  it('level sets starting stomachs and keeps runs replayable', () => {
    expect(new Run({ mode: 'daily', seed: 5, weekday: 2, dateKey: 'x', adaptive: 1, level: 'easy' }).stomachs).toBe(4);
    expect(new Run({ mode: 'daily', seed: 5, weekday: 2, dateKey: 'x', adaptive: 1 }).stomachs).toBe(3);
    const cfg = { mode: 'daily' as const, seed: 77, weekday: 4, dateKey: 'x', adaptive: 1, level: 'hard' as const };
    const a = new Run(cfg);
    for (let i = 0; i < 600; i++) a.tick(i % 90 < 45 ? 4 : 2);
    const b = replayRun(cfg, a.log, 600);
    expect(b.tickCount).toBe(a.tickCount);
    expect(b.totalScore).toBe(a.totalScore);
  });
});

describe('settings', () => {
  it('garbage becomes defaults', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ difficulty: 'nightmare', volume: 'loud', crt: 'yes', font: 9 })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values, clamps volume, and fills in settings saved by older versions', () => {
    const s = sanitizeSettings({ difficulty: 'hard', volume: 7, textSize: 'large', particles: 'low', crt: false, sound: false });
    expect(s).toMatchObject({ difficulty: 'hard', volume: 1, textSize: 'large', particles: 'low', crt: false, sound: false, font: 'pixel', menuPreview: true });
    expect(sanitizeSettings({ volume: -3 }).volume).toBe(0);
  });
});

describe('responsive layout', () => {
  it('stacks on phones in portrait and goes side by side on landscape screens', () => {
    expect(computeLayout(390, 844)).toEqual({ ui: 1, layout: 'tall' });
    expect(computeLayout(360, 640).layout).toBe('tall');
    expect(computeLayout(844, 390).layout).toBe('wide');
    expect(computeLayout(1366, 768).layout).toBe('wide');
    expect(computeLayout(820, 1180).layout).toBe('tall');
  });

  it('scales the UI up on big screens, never below 1 or above 1.7, and applies the text-size setting', () => {
    expect(computeLayout(320, 480).ui).toBe(1);
    expect(computeLayout(3840, 2160).ui).toBe(1.7);
    expect(computeLayout(1920, 1080).ui).toBeGreaterThan(computeLayout(1366, 768).ui);
    expect(computeLayout(390, 844, 'large').ui).toBe(1.2);
    expect(computeLayout(390, 844, 'small').ui).toBe(0.9);
  });

  it('maze scaling modes', () => {
    expect(fitScale(0.8, 'crisp')).toBe(0.8);
    expect(fitScale(2.7, 'crisp')).toBe(2);
    expect(fitScale(2.7, 'fill')).toBe(2.7);
    expect(fitScale(2.98, 'auto')).toBe(2.98);
    expect(fitScale(3.1, 'auto')).toBe(3);
  });
});

import { CARPETS, FURN, hash, mix, shade } from '../src/render/hall';

const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('dining hall look', () => {
  it('brown furniture is clearly lighter than the carpet on every day, so paths read at a glance', () => {
    for (const [i, c] of CARPETS.entries()) {
      expect(lum(FURN.top) - lum(c), `day ${i}`).toBeGreaterThan(0.15);
    }
  });

  it('the carpet is never blue (the student wears blue) or red (the enemies are red)', () => {
    for (const c of CARPETS) {
      const [r, g, b] = [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)) as [number, number, number];
      expect(g).toBeGreaterThanOrEqual(r);
      expect(g + 10).toBeGreaterThanOrEqual(b);
    }
  });

  it('hash is deterministic and in [0,1); colour helpers behave', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash(i, i * 7, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash(i, i * 7, 3)).toBe(v);
    }
    expect(mix('#000000', '#ffffff', 0)).toBe('rgb(0,0,0)');
    expect(mix('#000000', '#ffffff', 1)).toBe('rgb(255,255,255)');
    expect(shade('#808080', -1)).toBe('rgb(0,0,0)');
    expect(shade('#808080', 1)).toBe('rgb(255,255,255)');
  });
});
