import { sfx } from '../../audio/sfx';
import { ENEMY_INFO } from '../../game/content';
import type { EnemyKind } from '../../game/enemies';
import { ENEMY_SPRITE, sprite } from '../../render/art';
import type { App, Screen } from '../app';
import { button, h, spriteImg } from '../dom';
import { paneSet } from '../widgets';

export function howToScreen(app: App): Screen {
  const enemy = (k: EnemyKind) =>
    h('div', { class: 'legend' }, spriteImg(sprite(ENEMY_SPRITE[k]), 3), h('div', {}, h('b', {}, ENEMY_INFO[k].name), h('div', { class: 'dim' }, ENEMY_INFO[k].blurb)));

  const card = (title: string, ...kids: Array<Node | null>) => h('div', { class: 'card' }, h('div', { class: 'card-title' }, title), ...kids);

  const el = h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', { class: 'page-title' }, 'HOW TO PLAY'), button('BACK', () => { sfx.click(); app.goTitle(); }, 'ghost small')),
    paneSet([
      {
        label: 'BASICS',
        nodes: [
          card('GOAL', h('p', {}, 'Eat every dish on the level to open the EXIT, then run for the door. Clear Breakfast, Lunch and Dinner to survive the day.')),
          card('CONTROLS', h('p', {}, 'Arrows / WASD, swipe, or the on-screen pad. P or Esc pauses. You keep moving in your chosen direction.')),
          card('WINNING AND LOSING', h('p', {}, 'You start with 3 stomachs. Touching a dish costs one. The hunger bar drains and refills when you eat; at zero you lose a stomach. Idle too long and the Warden comes for you.')),
        ],
      },
      {
        label: 'SCORING',
        nodes: [
          card('POINTS', h('p', {}, 'Dish +10. Eat fast to build a combo (up to x5). Outside Maggi scares every enemy: eat them for 200, 400, 800... Bonus snack +100. Clearing a level gives time and stomach bonuses.')),
          card('DAILY RUN AND STREAKS', h('p', {}, 'One ranked Daily Run per day (resets at midnight IST). Everyone gets the same mazes. Play every day to build a streak; every 7 days earns a Streak Freeze that forgives one missed day.')),
        ],
      },
      {
        label: 'ENEMIES',
        nodes: [card('THE ENEMIES', enemy('blob'), enemy('curry'), enemy('chapati'), enemy('special'), enemy('warden'))],
      },
    ]),
  );
  return { el, fit: true };
}
