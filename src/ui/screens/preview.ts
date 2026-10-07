/** "Menu card": shows the day's dishes (as pixel icons) before a run starts, plus what to avoid. */
import { sfx } from '../../audio/sfx';
import { WEEKDAY_NAMES, COURSES } from '../../game/config';
import { ENEMY_INFO, QUIPS_BY_FOOD } from '../../game/content';
import { stageDifficulty } from '../../game/difficulty';
import { MENUS, mealItems, uniqueItems, type MenuItem } from '../../game/menu';
import { ENEMY_SPRITE, sprite, type SpriteName } from '../../render/art';
import { FOOD_VIEW } from '../../render/foodSprites';
import type { App, Screen } from '../app';
import { button, h, spriteImg } from '../dom';
import { levelPicker } from '../widgets';

export interface PreviewOptions {
  weekday: number;
  mode: 'daily' | 'practice';
  onStart: () => void;
}

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;

export function previewScreen(app: App, o: PreviewOptions): Screen {
  const theme = app.theme(o.weekday);
  const menu = MENUS[o.weekday]!;
  document.documentElement.style.setProperty('--accent', theme.accent);

  const quip = h('p', { class: 'quip' }, 'Tap a dish to meet it.');
  let i = 0;
  const tile = (spriteName: SpriteName, name: string, sub: string | null, line: () => string) => {
    const b = h('button', {
      class: 'food-tile',
      type: 'button',
      onclick: () => {
        sfx.click();
        quip.textContent = line();
      },
    }, spriteImg(sprite(spriteName), 4), h('span', { class: 'fname' }, name), sub ? h('span', { class: 'fsub' }, sub) : null);
    b.style.setProperty('--d', `${(i++ % 6) * 0.13}s`);
    return b;
  };
  const dish = (it: MenuItem) => tile(FOOD_VIEW[it.kind].sprite, it.name, null, () => pick(QUIPS_BY_FOOD[it.kind]));

  const level = () => app.settings.difficulty;
  const courseCard = (c: number) =>
    h('div', { class: 'card course' },
      h('div', { class: 'card-title' }, COURSES[c]!.toUpperCase(), h('span', { class: 'dim' }, ` - ${stageDifficulty(o.weekday, c, 1, level()).foodCount} dishes`)),
      h('div', { class: 'foods' }, ...uniqueItems(mealItems(menu, c)).map(dish)),
    );

  const roster = h('div', { class: 'foods' });
  const paintRoster = () => {
    roster.replaceChildren(...stageDifficulty(o.weekday, 2, 1, level()).roster.map((k) =>
      h('div', { class: 'food-tile static' }, spriteImg(sprite(ENEMY_SPRITE[k]), 3), h('span', { class: 'fname' }, ENEMY_INFO[k].name))));
  };
  paintRoster();

  const start = () => {
    sfx.unlock();
    sfx.start();
    o.onStart();
  };
  const back = () => {
    sfx.click();
    if (o.mode === 'daily') app.goTitle();
    else app.goPractice();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      start();
    } else if (e.code === 'Escape') back();
  };
  window.addEventListener('keydown', onKey);

  const el = h('div', { class: 'page scroll preview' },
    h('div', { class: 'daybadge' }, `${WEEKDAY_NAMES[o.weekday]!.toUpperCase()} - ${theme.title.toUpperCase()}`),
    h('h2', { class: 'page-title' }, o.mode === 'daily' ? "TODAY'S MENU" : 'MENU CARD'),
    h('p', { class: 'hint' }, 'Eat every dish (+10 each, chain them for a combo). Dodge the rest.'),
    courseCard(0), courseCard(1), courseCard(2),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'EXTRAS'),
      h('div', { class: 'foods' },
        tile(FOOD_VIEW[menu.snack.kind].sprite, menu.snack.name, 'BONUS +100', () => 'Bonus snack: appears near the kitchen for a few seconds. Risky, tasty.'),
        tile('maggi', 'Outside Maggi', 'POWER-UP', () => 'Maggi scares every dish. Eat them for 200, 400, 800 and 1600.'),
      ),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'WATCH OUT'),
      roster,
    ),
    quip,
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, 'DIFFICULTY'),
      levelPicker(app, paintRoster),
    ),
    button(o.mode === 'daily' ? 'START DAILY RUN' : 'START PRACTICE', start, 'primary big'),
    o.mode === 'daily' ? h('p', { class: 'hint' }, 'Your one daily attempt begins when you press START.') : null,
    button('BACK', back, 'ghost'),
    button('START & SKIP THIS SCREEN NEXT TIME', () => {
      app.setSetting('menuPreview', false);
      sfx.click();
      start();
    }, 'small linkish'),
  );
  return { el, dispose: () => window.removeEventListener('keydown', onKey) };
}
